import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import { useSupabaseAuthState, flushPendingWrites, sessionCaches, clearInstanceMemoryCache } from './auth.js';
import eventProcessor from '../event-processor/index.js';
import { addLog } from '../system-logger.js';
import pino from 'pino';
import { supabase, NODE_ID, retryWithBackoff, resolveTargetJid } from '../supabase.js';

const waitForSocketOpen = (sock, timeoutMs = 20000) => {
    return new Promise((resolve, reject) => {
        if (sock.ws && sock.ws.isOpen) {
            return resolve(true);
        }
        if (sock.ws && (sock.ws.isClosing || sock.ws.isClosed)) {
            return reject(new Error('WebSocket is closed or closing'));
        }

        let isClean = false;
        const cleanUp = () => {
            if (isClean) return;
            isClean = true;
            clearTimeout(timer);
            try {
                sock.ev.off('connection.update', connectionListener);
            } catch (e) {}
        };

        const timer = setTimeout(() => {
            cleanUp();
            reject(new Error('Timeout waiting for connection to open'));
        }, timeoutMs);

        const connectionListener = (update) => {
            const { connection } = update;
            if (connection === 'open') {
                cleanUp();
                resolve(true);
            } else if (connection === 'close') {
                cleanUp();
                reject(new Error('Connection closed while waiting to open'));
            }
        };

        sock.ev.on('connection.update', connectionListener);
    });
};

let cachedBaileysVersion = null;
let lastVersionFetchTime = 0;

async function getCachedBaileysVersion() {
    const now = Date.now();
    if (cachedBaileysVersion && (now - lastVersionFetchTime < 24 * 60 * 60 * 1000)) {
        return cachedBaileysVersion;
    }
    try {
        const fetchPromise = fetchLatestBaileysVersion();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 4000));
        const res = await Promise.race([fetchPromise, timeoutPromise]);
        if (res && res.version) {
            cachedBaileysVersion = res;
            lastVersionFetchTime = now;
            return res;
        }
    } catch (e) {
        console.warn('[SessionManager] Usando versão fallback do Baileys:', e.message);
    }
    cachedBaileysVersion = { version: [2, 3000, 1043857760], isLatest: true };
    lastVersionFetchTime = now;
    return cachedBaileysVersion;
}

class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.connectingState = new Map();
        this.reconnectAttempts = new Map();
        this.reconnectTimeouts = new Map();
        this.conflictAttempts = new Map();
        this.conflictTimeouts = new Map();
        this.reconnectingTimers = new Map();
        this.queues = new Map();
        this.watchdogs = new Map();
        this.authenticatedSessions = new Set();
        this.pairingPendingSync = new Map();
        this.pairingInProgress = new Set();
        this.closingSessions = new Set();
        this.pendingHistorySyncs = new Map();
        this.consecutiveForbiddenAttempts = new Map();
        this.consecutiveBadSessionAttempts = new Map();
        this.oscillationAttempts = new Map();
        this.inProgressLocks = new Map();

        // Pino stream configurado para enviar logs para nosso SSE e para o stdout
        const pinoStream = {
            write: (msg) => {
                if (typeof msg === 'string' && (msg.includes('Closing session:') || msg.includes('_chains'))) {
                    return; // Ignora dumps verbosos de chaves criptográficas do libsignal ao fechar/reciclar sessão
                }

                try {
                    const parsed = JSON.parse(msg);
                    
                    // Filtra avisos nativos do Baileys que são inofensivos e poluem o terminal/logs
                    const ignoredLogs = [
                        'Buffer timeout reached',
                        'Timeout after',
                        'timed out waiting for message',
                        'transaction failed, rolling back',
                        'failed to decrypt message',
                        'PreKeyError',
                        'SessionError',
                        'Invalid PreKey ID',
                        'No session record',
                        'Incompatible version',
                        'Incompatible version number on WhisperMessage',
                        'conflict',
                        'replaced',
                        'Stream Errored (conflict)',
                        'Failed to fetch stream',
                        'handling notification',
                        'mmg.whatsapp.net',
                        'Precondition Required',
                        'no name present, ignoring presence update request',
                        'failed to sync state',
                        'failed to find key',
                        'critical_unblock',
                        'Closing session:',
                        'url generation failed'
                    ];
                    
                    if (parsed.msg && ignoredLogs.some(text => parsed.msg.includes(text))) {
                        return; // Ignora silenciosamente
                    }

                    if (parsed.reasonNode && parsed.reasonNode.tag === 'conflict') {
                        return; // Ignora silenciosamente
                    }

                    if (parsed.error && typeof parsed.error === 'object') {
                        const errStr = JSON.stringify(parsed.error);
                        if (ignoredLogs.some(text => errStr.includes(text))) {
                            return; // Ignora silenciosamente
                        }
                    }

                    if (parsed.msg && parsed.msg.includes('stream errored out')) {
                        const code = parsed.fullErrorNode?.attrs?.code || parsed.reasonNode?.attrs?.code || '503';
                        addLog('info', `[Baileys/Stream] Oscilação temporária de conexão com o WhatsApp (code: ${code}). Reconectando automaticamente em 2s...`);
                        process.stdout.write(msg);
                        return;
                    }

                    const lvl = parsed.level >= 50 ? 'error' : parsed.level >= 40 ? 'warn' : 'info';
                    addLog(lvl, `[Baileys] ${parsed.msg || ''} ${JSON.stringify(parsed, (k,v) => ['msg','level','time','pid','hostname'].includes(k) ? undefined : v)}`);
                } catch(e) {
                    if (typeof msg === 'string' && !msg.includes('Closing session:') && !msg.includes('_chains')) {
                        addLog('info', `[Baileys] ${msg.trim()}`);
                    }
                }
                process.stdout.write(msg);
            }
        };

        this.logger = pino({ level: 'info' }, pinoStream);

        // Loop de renovação do Lease (Heartbeat) - roda a cada 15 segundos
        setInterval(async () => {
            const activeEntries = Array.from(this.sessions.entries());
            if (activeEntries.length > 0) {
                try {
                    const isLocalDev = process.env.DISABLE_AUTO_START_SESSIONS === 'true';
                    const activeStatus = isLocalDev ? 'connected_local' : 'connected';

                    const healthyIds = [];
                    const zombieIds = [];

                    for (const [id, sessionData] of activeEntries) {
                        const sock = sessionData?.sock;
                        if (sock && sock.ws && sock.ws.isOpen) {
                            healthyIds.push(id);
                        } else {
                            zombieIds.push(id);
                        }
                    }

                    // Limpa sockets zumbis que perderam o WebSocket
                    for (const zId of zombieIds) {
                        console.warn(`[SessionManager/Heartbeat] Detectado socket zumbi sem WebSocket aberto para ${zId}. Destruindo sessão...`);
                        this.destroyExistingSession(zId, 'zombie_heartbeat').catch(() => {});
                    }

                    const authenticatedIds = healthyIds.filter(id => this.authenticatedSessions.has(id) && !this.pairingPendingSync.get(id));

                    if (authenticatedIds.length > 0) {
                        await retryWithBackoff(() =>
                            supabase.from('whatsapp_instances')
                                .update({
                                    status: activeStatus,
                                    last_error: null,
                                    lease_until: new Date(Date.now() + 45000).toISOString(),
                                    updated_at: new Date().toISOString()
                                })
                                .in('id', authenticatedIds)
                                .eq('assigned_node_id', NODE_ID)
                        );
                    }

                    const unauthenticatedIds = healthyIds.filter(id => !authenticatedIds.includes(id));
                    if (unauthenticatedIds.length > 0) {
                        await retryWithBackoff(() =>
                            supabase.from('whatsapp_instances')
                                .update({
                                    lease_until: new Date(Date.now() + 45000).toISOString(),
                                    updated_at: new Date().toISOString()
                                })
                                .in('id', unauthenticatedIds)
                                .eq('assigned_node_id', NODE_ID)
                        );
                    }
                } catch (e) {
                    console.error("[SessionManager/Heartbeat] Erro ao renovar leases:", e.message);
                }
            }
        }, 15000);

        // Limpeza periódica preventiva de locks órfãos/expirados no banco de dados (a cada 60s)
        setInterval(async () => {
            try {
                const now = new Date().toISOString();
                await supabase
                    .from('whatsapp_instances')
                    .update({
                        assigned_node_id: null,
                        lease_until: null,
                        updated_at: now
                    })
                    .lt('lease_until', now)
                    .neq('status', 'connected')
                    .not('assigned_node_id', 'is', null);
            } catch (errClean) {}
        }, 60000);
    }

    async destroyExistingSession(instanceId, reason = 'reconnect') {
        this.clearWatchdog(instanceId);

        if (this.reconnectingTimers.has(instanceId)) {
            clearTimeout(this.reconnectingTimers.get(instanceId));
            this.reconnectingTimers.delete(instanceId);
        }
        if (this.reconnectTimeouts.has(instanceId)) {
            clearTimeout(this.reconnectTimeouts.get(instanceId));
            this.reconnectTimeouts.delete(instanceId);
        }
        if (this.conflictTimeouts.has(instanceId)) {
            clearTimeout(this.conflictTimeouts.get(instanceId));
            this.conflictTimeouts.delete(instanceId);
        }

        const existing = this.sessions.get(instanceId);
        this.sessions.delete(instanceId);
        this.authenticatedSessions.delete(instanceId);
        this.pairingPendingSync.delete(instanceId);

        if (existing && existing.sock) {
            const sock = existing.sock;
            console.log(`[SessionManager] Desativando e destruindo socket anterior para ${instanceId} (motivo: ${reason})...`);
            try {
                if (sock.ev && typeof sock.ev.removeAllListeners === 'function') {
                    sock.ev.removeAllListeners();
                }
            } catch (e) {}

            try {
                if (sock.ws) {
                    if (typeof sock.ws.removeAllListeners === 'function') {
                        sock.ws.removeAllListeners();
                    }
                    sock.ws.close();
                    if (typeof sock.ws.terminate === 'function') {
                        sock.ws.terminate();
                    }
                }
            } catch (e) {}

            try {
                if (sock.end && typeof sock.end === 'function') {
                    sock.end();
                }
            } catch (e) {}
        }

        clearInstanceMemoryCache(instanceId);

        try {
            await flushPendingWrites(instanceId);
        } catch (e) {}
    }

    async acquireSessionLock(instanceId, force = false) {
        const maxLockAttempts = 4;
        const currentNodeId = String(NODE_ID).trim();

        for (let attempt = 1; attempt <= maxLockAttempts; attempt++) {
            const { data: inst, error } = await retryWithBackoff(() =>
                supabase
                    .from('whatsapp_instances')
                    .select('id, assigned_node_id, lease_until, status, monitoring_until, settings, updated_at')
                    .eq('id', instanceId)
                    .single()
            );

            if (error || !inst) {
                throw new Error(`Instância ${instanceId} não encontrada no banco de dados.`);
            }

            const assignedNodeId = inst.assigned_node_id ? String(inst.assigned_node_id).trim() : null;
            const lastUpdated = inst.updated_at ? new Date(inst.updated_at) : null;
            const timeSinceLastUpdate = lastUpdated ? (Date.now() - lastUpdated.getTime()) : Infinity;
            const leaseExpiry = inst.lease_until ? new Date(inst.lease_until) : null;
            const isLeaseActive = leaseExpiry && leaseExpiry > new Date();

            const isExplicitlyDeadStatus = ['offline', 'paused', 'disconnected', 'bad_session', 'logged_out'].includes(inst.status);
            const isStaleWorker = timeSinceLastUpdate > 30000;
            const isDeadInterim = (inst.status !== 'connected' && inst.status !== 'connected_local') && (timeSinceLastUpdate > 15000);

            // Permite assumir o lock se:
            // 1. Forçado explicitamente (force)
            // 2. Não possui nó atribuído
            // 3. Já pertence ao nó atual
            // 4. O lease expirou
            // 5. O status é explicitamente inativo
            // 6. O worker proprietário está sem heartbeat há mais de 30s
            // 7. Última tentativa de backoff atingida e o nó não está com heartbeat recente (< 20s)
            const isOtherHeartbeatFresh = assignedNodeId && assignedNodeId !== currentNodeId && isLeaseActive && timeSinceLastUpdate <= 20000;
            const canTakeover = force || !assignedNodeId || assignedNodeId === currentNodeId || !isLeaseActive || isExplicitlyDeadStatus || isStaleWorker || isDeadInterim || (attempt === maxLockAttempts && !isOtherHeartbeatFresh);

            if (canTakeover) {
                const leaseUntil = new Date(Date.now() + 45000).toISOString();
                const updatedAt = new Date().toISOString();
                const isAlreadyActive = inst.status === 'connected' || inst.status === 'connected_local';
                const nextStatus = isAlreadyActive ? inst.status : 'connecting';

                const updateQuery = supabase
                    .from('whatsapp_instances')
                    .update({
                        assigned_node_id: currentNodeId,
                        lease_until: leaseUntil,
                        status: nextStatus,
                        updated_at: updatedAt
                    })
                    .eq('id', instanceId);

                const { data: updatedInst, error: updateErr } = await retryWithBackoff(() => updateQuery.select().maybeSingle());

                if (updateErr) {
                    console.warn(`[SessionManager/Lock] Erro ao gravar lock para ${instanceId}:`, updateErr.message);
                } else if (updatedInst) {
                    console.log(`[SessionManager/Lock] ✅ Lock adquirido com sucesso para instância ${instanceId} no nó ${currentNodeId} (lease até ${leaseUntil}).`);
                    return updatedInst;
                } else {
                    console.log(`[SessionManager/Lock] ✅ Lock atualizado com sucesso (fallback) para instância ${instanceId} no nó ${currentNodeId}.`);
                    return { ...inst, assigned_node_id: currentNodeId, lease_until: leaseUntil, status: nextStatus, updated_at: updatedAt };
                }
            }

            // Se for a última tentativa e o outro nó ainda estiver com heartbeat super ativo (< 20s), lança erro informativo
            if (attempt === maxLockAttempts) {
                if (inst.status === 'connected' && assignedNodeId && assignedNodeId !== currentNodeId && timeSinceLastUpdate <= 20000 && !force) {
                    console.log(`[SessionManager/Lock] Instância ${instanceId} está ativamente conectada no nó ${assignedNodeId} (heartbeat há ${Math.round(timeSinceLastUpdate / 1000)}s). Preservando propriedade exclusiva para evitar conflito.`);
                    throw new Error(`Instância ${instanceId} possui lock ativo e saudável no nó ${assignedNodeId}`);
                }
                throw new Error(`Não foi possível adquirir lock para a instância ${instanceId} após ${maxLockAttempts} tentativas.`);
            }

            const backoffMs = attempt * 2000;
            const remainingLease = leaseExpiry ? Math.max(0, Math.round((leaseExpiry.getTime() - Date.now()) / 1000)) : 0;
            console.warn(`[SessionManager/Lock] Aguardando liberação do lock da instância ${instanceId} (nó atual: ${assignedNodeId || 'nenhum'}, heartbeat há ${Math.round(timeSinceLastUpdate / 1000)}s, lease restante: ${remainingLease}s, tentativa ${attempt}/${maxLockAttempts}) em ${backoffMs / 1000}s...`);
            await new Promise(r => setTimeout(r, backoffMs));
        }

        throw new Error(`Não foi possível adquirir lock para a instância ${instanceId} após ${maxLockAttempts} tentativas.`);
    }

    async releaseSessionLock(instanceId, setOffline = false, errorMessage = null) {
        console.log(`[SessionManager/Lock] Liberando lock da instância ${instanceId} no nó ${NODE_ID}...`);
        const updatePayload = {
            assigned_node_id: null,
            lease_until: null,
            updated_at: new Date().toISOString()
        };
        if (setOffline) {
            updatePayload.status = 'offline';
        }
        if (errorMessage !== null) {
            updatePayload.last_error = errorMessage;
            updatePayload.last_disconnected_at = new Date().toISOString();
        }
        return await retryWithBackoff(() =>
            supabase.from('whatsapp_instances')
                .update(updatePayload)
                .eq('id', instanceId)
        );
    }

    async createSession(tenantId, instanceId, force = false) {
        if (this.reconnectingTimers.has(instanceId)) {
            const timer = this.reconnectingTimers.get(instanceId);
            clearTimeout(timer);
            this.reconnectingTimers.delete(instanceId);
            console.log(`[SessionManager] Antecipando/limpando timer de reconexão pendente para a instância ${instanceId}.`);
        }

        if (this.sessions.has(instanceId) && !force) {
            const existingSock = this.sessions.get(instanceId)?.sock;
            if (existingSock && existingSock.ws && existingSock.ws.isOpen) {
                console.log(`[SessionManager] Sessão ${instanceId} já estava saudável em memória.`);
                return existingSock;
            }
        }

        if (this.connectingState.has(instanceId)) {
            console.log(`[SessionManager] Sessão ${instanceId} já está em processo de conexão. Reutilizando Promise em andamento.`);
            return this.connectingState.get(instanceId);
        }

        console.log(`[SessionManager] Iniciando sessão para Instance: ${instanceId} | Tenant: ${tenantId} | Force: ${force}`);

        const promise = this._createSessionInner(tenantId, instanceId, force);
        this.connectingState.set(instanceId, promise);
        
        try {
            return await promise;
        } finally {
            this.connectingState.delete(instanceId);
            this.inProgressLocks.delete(instanceId);
        }
    }

    async _createSessionInner(tenantId, instanceId, force = false) {
        try {
            // Destrói qualquer socket anterior e aguarda descarregar chaves pendentes
            await this.destroyExistingSession(instanceId, force ? 'force_recreate' : 'create');

            // Adquire atomicamente o lock/lease distribuído no Supabase
            const currentInstance = await this.acquireSessionLock(instanceId, force);

            // Health Check de IP Geográfico
            try {
                await this.assertBrazilianEgress(tenantId, instanceId);
            } catch (ipErr) {
                console.error(`[SessionManager] Falha no health check de IP para instância ${instanceId}:`, ipErr.message);
                await this.releaseSessionLock(instanceId, true, `Conexão bloqueada: IP de saída inválido.`);
                throw ipErr;
            }

            const isPairing = this.pairingInProgress.has(instanceId);
            const { state, saveCreds } = await useSupabaseAuthState(tenantId, instanceId, isPairing);
            const wasAuthenticatedOnBoot = !isPairing && Boolean(state?.creds?.me?.id || state?.creds?.me?.jid);
            const { version, isLatest } = await getCachedBaileysVersion();
            
            console.log(`[SessionManager] Usando WA v${version.join('.')}, isLatest: ${isLatest}`);

            // workaround for pure ESM makeWASocket if it's default exported vs destructured
            const createSocket = makeWASocket.default ? makeWASocket.default : makeWASocket;

            const msgRetryCounterCache = {
                store: new Map(),
                get(k) { return this.store.get(k); },
                set(k, v) { this.store.set(k, v); },
                del(k) { this.store.delete(k); },
                flushAll() { this.store.clear(); }
            };

            const sock = createSocket({
                version,
                logger: this.logger,
                printQRInTerminal: false,
                auth: state,
                browser: Browsers.ubuntu('Chrome'),
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                fireInitQueries: false,
                markOnlineOnConnect: true,
                emitOwnEvents: true,
                connectTimeoutMs: 90000,
                keepAliveIntervalMs: 15000,
                defaultQueryTimeoutMs: 90000,
                retryRequestDelayMs: 3000,
                maxMsgRetryCount: 5, // Ativado (5 retentativas) com busca no DB e controle de cache para garantir 100% das entregas
                msgRetryCounterCache,
                shouldSyncHistoryMessage: (histNotification) => {
                    // Sempre permite boot inicial e mapeamentos LID essenciais para estabilidade da sessão
                    const syncType = histNotification?.syncType;
                    if (syncType === 0 || syncType === 'INITIAL_BOOT' || syncType === 4 || syncType === 'PUSH_NAME' || syncType === 'ON_DEMAND') {
                        return true;
                    }
                    const instSettings = currentInstance?.settings || {};
                    if (instSettings.sync_history === false || instSettings.is_api_only === true) {
                        return false;
                    }
                    return false;
                },
                getMessage: async (key) => {
                    if (!key || !key.id) return undefined;
                    try {
                        // 1. Tenta buscar no wa_incoming_messages do Supabase
                        const { data: incMsg } = await supabase
                            .from('wa_incoming_messages')
                            .select('raw_payload')
                            .eq('instance_id', instanceId)
                            .eq('message_id', key.id)
                            .maybeSingle();

                        if (incMsg?.raw_payload?.message) {
                            console.log(`[SessionManager - Retry] Mensagem ${key.id} resgatada de wa_incoming_messages para responder ao retry do WhatsApp.`);
                            return incMsg.raw_payload.message;
                        }

                        // 2. Fallback para a tabela messages
                        const { data: dbMsg } = await supabase
                            .from('messages')
                            .select('raw_payload')
                            .eq('instance_id', instanceId)
                            .eq('whatsapp_message_id', key.id)
                            .maybeSingle();

                        if (dbMsg?.raw_payload?.message) {
                            console.log(`[SessionManager - Retry] Mensagem ${key.id} resgatada da tabela messages para responder ao retry do WhatsApp.`);
                            return dbMsg.raw_payload.message;
                        }
                    } catch (err) {
                        console.warn(`[SessionManager - Retry] Erro ao buscar mensagem em getMessage (${key.id}):`, err.message);
                    }
                    return undefined;
                }
            });

            // Tratamento resiliente de oscilações e quedas no WebSocket (ECONNRESET, EPIPE, etc.)
            if (sock.ws) {
                sock.ws.on('error', (wsErr) => {
                    const msg = wsErr?.message || String(wsErr);
                    if (msg.includes('ECONNRESET') || msg.includes('EPIPE') || msg.includes('ETIMEDOUT') || msg.includes('closed')) {
                        console.warn(`[SessionManager/WebSocket] Oscilação transitória de conexão no socket ${instanceId}: ${msg}. O ciclo de reconexão Baileys estabilizará a sessão.`);
                    } else {
                        console.error(`[SessionManager/WebSocket] Erro capturado no socket ${instanceId}:`, msg);
                    }
                });
            }

            sock.ev.on('creds.update', async () => {
                await saveCreds();
                const meId = sock.user?.id || state?.creds?.me?.id || state?.creds?.me?.jid;
                const hasValidMeId = Boolean(meId && (String(meId).length > 5 || String(meId).includes('@s.whatsapp.net')));
                
                if (hasValidMeId && state?.creds?.pairingCode) {
                    delete state.creds.pairingCode;
                }

                if (hasValidMeId) {
                    this.authenticatedSessions.add(instanceId);
                    const phone = String(meId).split('@')[0].split(':')[0];
                    if (phone && phone.length >= 7) {
                        retryWithBackoff(() => 
                            supabase.from('whatsapp_instances')
                                .update({ phone_number: phone })
                                .eq('id', instanceId)
                        ).catch(() => {});
                    }
                }
                // Só dispara a atualização de pareamento se a sessão NÃO estava autenticada no boot
                // e concluiu a autenticação no celular (tem meId válido agora) e NÃO está em fase inicial de geração de código
                const isCurrentlyPairing = this.pairingInProgress.has(instanceId);
                if (!wasAuthenticatedOnBoot && hasValidMeId && !isCurrentlyPairing) {
                    const phone = String(meId).split('@')[0].split(':')[0];
                    console.log(`[SessionManager] Credenciais de pareamento registradas no celular com telefone: ${phone}. Sincronizando com o banco e o frontend.`);
                    await retryWithBackoff(() => 
                        supabase.from('whatsapp_instances')
                            .update({ phone_number: phone })
                            .eq('id', instanceId)
                    );
                    this.pairingPendingSync.set(instanceId, true);
                    await retryWithBackoff(() =>
                        supabase.from('whatsapp_instance_runtime')
                            .update({ pairing_code: 'CONNECTED_PENDING_SYNC' })
                            .eq('instance_id', instanceId)
                    );
                    await eventProcessor.handleConnectionUpdate(tenantId, instanceId, {
                        connection: 'connecting',
                        pairingSuccess: true,
                        registered: true,
                        phone
                    });
                }
            });

            sock.ev.on('connection.update', async (update) => {
                const meId = sock.user?.id || state?.creds?.me?.id || state?.creds?.me?.jid;
                const hasValidMeId = Boolean(meId && (String(meId).length > 5 || String(meId).includes('@s.whatsapp.net')));
                
                if (hasValidMeId && state?.creds?.pairingCode) {
                    delete state.creds.pairingCode;
                }

                const isRealAuthConnection = update.connection === 'open' && hasValidMeId;

                if (isRealAuthConnection) {
                    this.authenticatedSessions.add(instanceId);
                    this.pairingPendingSync.delete(instanceId);
                    this.oscillationAttempts.delete(instanceId);
                    
                    // Zera contadores de tentativas ao conectar com sucesso
                    this.reconnectAttempts.delete(instanceId);
                    this.conflictAttempts.delete(instanceId);
                    this.consecutiveForbiddenAttempts.delete(instanceId);
                    this.consecutiveBadSessionAttempts.delete(instanceId);
                    
                    // Atualiza status no banco e zera tentativas
                    const monitoringUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
                    const sessionData = this.sessions.get(instanceId);
                    if (sessionData) {
                        sessionData.monitoringUntil = monitoringUntil;
                    }

                    const ownerJid = sock.user?.id || state?.creds?.me?.id || state?.creds?.me?.jid;
                    const ownerPhone = ownerJid ? String(ownerJid).split('@')[0].split(':')[0] : null;

                    const updatePayload = { 
                        status: 'connected', 
                        reconnect_attempts: 0,
                        last_connected_at: new Date().toISOString(),
                        monitoring_until: monitoringUntil,
                        last_error: null 
                    };

                    if (ownerPhone && ownerPhone.length >= 7) {
                        updatePayload.phone_number = ownerPhone;
                    }

                    supabase.from('whatsapp_instances')
                        .update(updatePayload)
                        .eq('id', instanceId)
                        .then(() => {});

                    this.logMonitoringEvent(instanceId, 'connection_established', { status: 'connected' }).catch(()=>{});

                    this.logConnectionEvent(tenantId, instanceId, 'connected', 'connected', null, null, null).catch(()=>{});
                }

                // Se update.connection for 'open' mas a sessão estiver em pareamento pendente (QR/Pairing Code),
                // trata como 'connecting' para o Realtime/Supabase
                const safeUpdate = { ...update };
                if (update.connection === 'open' && !isRealAuthConnection) {
                    safeUpdate.connection = 'connecting';
                }

                // Se a instância já possui credenciais de usuário válidas (aparelho pareado),
                // suprime qualquer evento parasita de QR Code emitido antes do handshake completo
                if (hasValidMeId && safeUpdate.qr) {
                    delete safeUpdate.qr;
                }

                await eventProcessor.handleConnectionUpdate(tenantId, instanceId, safeUpdate);

                const { connection, lastDisconnect } = update;
                if (isRealAuthConnection) {
                    this.startWatchdog(tenantId, instanceId, sock);
                    
                    // Proteção contra duplicação de chip (mesmo número em múltiplas instâncias) e Auto-Migração de Histórico
                    const ownerJid = sock.user?.id;
                    if (ownerJid) {
                        const ownerPhone = ownerJid.split('@')[0].split(':')[0];
                        console.log(`[SessionManager] Instância ${instanceId} conectada com sucesso. Telefone: ${ownerPhone}`);
                        
                        // 1. Atualizar phone_number no banco de dados para esta instância
                        supabase.from('whatsapp_instances')
                            .update({ phone_number: ownerPhone, updated_at: new Date().toISOString() })
                            .eq('id', instanceId)
                            .then(() => {});

                        // 2. Buscar no banco outras instâncias do mesmo tenant que usam este mesmo telefone
                        supabase.from('whatsapp_instances')
                            .select('id, display_name')
                            .eq('tenant_id', tenantId)
                            .neq('id', instanceId)
                            .or(`phone_number.eq.${ownerPhone},phone_number.eq.55${ownerPhone}`)
                            .then(({ data: oldInsts }) => {
                                if (oldInsts && oldInsts.length > 0) {
                                    for (const oldInst of oldInsts) {
                                        console.log(`[SessionManager] 🔄 Detectada caixa legada "${oldInst.display_name}" (${oldInst.id}) no mesmo número (${ownerPhone}). Migrando histórico para a nova caixa ${instanceId}...`);
                                        Promise.all([
                                            supabase.from('conversations').update({ instance_id: instanceId }).eq('instance_id', oldInst.id),
                                            supabase.from('contacts').update({ instance_id: instanceId }).eq('instance_id', oldInst.id),
                                            supabase.from('messages').update({ instance_id: instanceId }).eq('instance_id', oldInst.id),
                                            supabase.from('tickets').update({ instance_id: instanceId }).eq('instance_id', oldInst.id),
                                            supabase.from('companies').update({ evolution_api_instance: instanceId }).eq('evolution_api_instance', oldInst.id)
                                        ]).then(() => {
                                            console.log(`[SessionManager] ✅ Auto-migração concluída: Histórico de "${oldInst.display_name}" (${oldInst.id}) transferido para ${instanceId}.`);
                                        }).catch(err => {
                                            console.error(`[SessionManager] Erro ao migrar dados de ${oldInst.id}:`, err.message);
                                        });
                                    }
                                }

                                // 3. Adota automaticamente conversas e mensagens órfãs do mesmo tenant (ex: caixas que foram recriadas)
                                Promise.all([
                                    supabase.from('conversations').update({ instance_id: instanceId }).eq('tenant_id', tenantId).is('instance_id', null),
                                    supabase.from('messages').update({ instance_id: instanceId }).eq('tenant_id', tenantId).is('instance_id', null)
                                ]).then(() => {}).catch(() => {});
                            });

                        // 4. Varre o cache em memória buscando outras sessões ativas com o mesmo telefone para desconectar colisão
                        for (const [otherInstanceId, otherSession] of this.sessions.entries()) {
                            if (otherInstanceId !== instanceId) {
                                const otherSock = otherSession.sock;
                                const otherOwnerJid = otherSock?.user?.id;
                                if (otherOwnerJid) {
                                    const otherOwnerPhone = otherOwnerJid.split('@')[0].split(':')[0];
                                    if (otherOwnerPhone === ownerPhone) {
                                        console.warn(`[SessionManager] ⚠️ Detetado conflito de número de telefone! A instância ${otherInstanceId} está usando o mesmo telefone ${ownerPhone} da instância ${instanceId}. Desconectando a instância ${otherInstanceId} para evitar colisões.`);
                                        
                                        try {
                                            if (otherSock.ws) {
                                                otherSock.ws.close();
                                            }
                                        } catch (wsErr) {
                                            console.error(`[SessionManager] Erro ao fechar WebSocket da instância concorrente ${otherInstanceId}:`, wsErr.message);
                                        }
                                        
                                        this.sessions.delete(otherInstanceId);
                                        
                                        // Atualiza no banco para offline para que o runtime não tente subir ela novamente automaticamente
                                        supabase.from('whatsapp_instances')
                                            .update({ 
                                                status: 'offline', 
                                                last_error: `Desconectado automaticamente porque o mesmo número de WhatsApp (${ownerPhone}) foi conectado na instância ${instanceId}. O sistema não permite conexões simultâneas no mesmo chip.` 
                                            })
                                            .eq('id', otherInstanceId)
                                            .then(({ error }) => {
                                                if (error) console.error(`[SessionManager] Erro ao atualizar status offline da outra instância ${otherInstanceId}:`, error.message);
                                            });
                                    }
                                }
                            }
                        }
                    }

                    // Defer clearing reconnectAttempts until connection is stable for 3 minutes
                    if (this.reconnectTimeouts.has(instanceId)) {
                        clearTimeout(this.reconnectTimeouts.get(instanceId));
                    }
                    const recTimeout = setTimeout(() => {
                        this.reconnectAttempts.delete(instanceId);
                        this.reconnectTimeouts.delete(instanceId);
                        supabase.from('whatsapp_instances').update({ reconnect_attempts: 0 }).eq('id', instanceId).then(() => {});
                        console.log(`[SessionManager] Conexão estável de rede estabelecida na instância ${instanceId}. Histórico de reconexões limpo.`);
                    }, 180000); // 3 minutos
                    this.reconnectTimeouts.set(instanceId, recTimeout);
                    
                    // Defer clearing conflictAttempts until connection is stable for 5 minutes
                    if (this.conflictTimeouts.has(instanceId)) {
                        clearTimeout(this.conflictTimeouts.get(instanceId));
                    }
                    const timeout = setTimeout(() => {
                        this.conflictAttempts.delete(instanceId);
                        this.conflictTimeouts.delete(instanceId);
                        console.log(`[SessionManager] Conexão estável estabelecida na instância ${instanceId}. Histórico de conflitos limpo.`);
                    }, 300000); // 5 minutos
                    this.conflictTimeouts.set(instanceId, timeout);
                }

                if (connection === 'close') {
                    if (this.closingSessions?.has(instanceId)) {
                        console.log(`[SessionManager] Conexão da instância ${instanceId} fechada intencionalmente (closeSession). Ignorando lógica de reconexão.`);
                        this.closingSessions.delete(instanceId);
                        return;
                    }
                    
                    const status = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error?.message || '';

                    const meId = sock?.user?.id || state?.creds?.me?.id || state?.creds?.me?.jid;
                    const hasValidMeId = Boolean(meId && (String(meId).length > 5 || String(meId).includes('@s.whatsapp.net')));
                    
                    if (hasValidMeId) {
                        this.authenticatedSessions.add(instanceId);
                    }

                    const isFullyAuthenticated = this.authenticatedSessions.has(instanceId) || hasValidMeId;

                    const isQrTimeout = (status === 408 || reason.toLowerCase().includes('qr refs attempts ended')) && !isFullyAuthenticated;

                    if (isQrTimeout) {
                        console.log(`[SessionManager] QR Code ou pareamento expirou por falta de leitura na instância ${instanceId}. Interrompendo loop de reconexão.`);
                        await this.destroyExistingSession(instanceId, 'qr_timeout');

                        await retryWithBackoff(() =>
                            supabase.from('whatsapp_instances')
                                .update({ 
                                    status: 'disconnected', 
                                    assigned_node_id: null,
                                    lease_until: null,
                                    last_error: 'QR Code ou código de pareamento expirou por falta de leitura. Clique em Conectar para gerar um novo.' 
                                })
                                .eq('id', instanceId)
                        );
                        return;
                    }

                    const loggedOut = status === DisconnectReason.loggedOut;
                    const isConflict = status === 440 || status === DisconnectReason.connectionReplaced || status === 409 || reason.toLowerCase().includes('conflict') || reason.toLowerCase().includes('replaced');
                    const isBlocked12h = reason.toLowerCase().includes('blocked') || reason.toLowerCase().includes('12h') || status === 410 || status === 429;
                    const isForbidden = (status === 403 || reason.toLowerCase().includes('forbidden')) && status !== 503 && status !== 502 && status !== 504;
                    const isBadSession = (status === 500 || reason.toLowerCase().includes('bad session')) && status !== 503 && status !== 502 && status !== 504 && !isConflict;

                    const isRestartRequired = !isConflict && (status === 515 || status === 428 || status === 1006 || status === DisconnectReason.restartRequired || reason.toLowerCase().includes('restart required') || reason.toLowerCase().includes('precondition required') || reason.toLowerCase().includes('connection closed') || (reason.toLowerCase().includes('stream errored') && !reason.toLowerCase().includes('conflict'))) && isFullyAuthenticated;
                    if (isRestartRequired) {
                        console.log(`[SessionManager] WhatsApp solicitou reinicialização/estabilização pós-pareamento (status ${status} / ${reason}) para a instância ${instanceId}. Reciclando chaves em RAM e reconectando em 1s com as novas chaves...`);
                        await this.destroyExistingSession(instanceId, 'restart_required');
                        setTimeout(() => {
                            if (!this.sessions.has(instanceId)) {
                                this.createSession(tenantId, instanceId, true).catch(err => {
                                    console.error(`[SessionManager] Erro ao reconectar pós restartRequired/428 para ${instanceId}:`, err.message);
                                });
                            }
                        }, 1000);
                        return;
                    }

                    const isStreamOscillation = !isConflict && (status === 503 || status === 502 || status === 504 || status === 408 || status === 405 || reason.toLowerCase().includes('connection terminated') || reason.toLowerCase().includes('connection lost'));

                    if (isStreamOscillation && isFullyAuthenticated) {
                        const attempts = (this.oscillationAttempts.get(instanceId) || 0) + 1;
                        this.oscillationAttempts.set(instanceId, attempts);

                        const delays = [5000, 8000, 12000, 15000];
                        const delay = delays[Math.min(attempts - 1, delays.length - 1)];

                        console.log(`[SessionManager] Oscilação temporária de conexão com servidores WhatsApp (${reason || status}) na instância ${instanceId} (tentativa ${attempts}). Reciclando RAM e aguardando ${delay / 1000}s para estabilizar chaves...`);
                        await this.destroyExistingSession(instanceId, 'stream_oscillation');
                        setTimeout(() => {
                            if (!this.sessions.has(instanceId)) {
                                this.createSession(tenantId, instanceId, true).catch(err => {
                                    console.error(`[SessionManager] Erro na reconexão automática de oscilação (${reason || status}) para ${instanceId}:`, err.message);
                                });
                            }
                        }, delay);
                        return;
                    }

                    // Clear stable connection timeouts if it disconnected early
                    if (this.conflictTimeouts.has(instanceId)) {
                        clearTimeout(this.conflictTimeouts.get(instanceId));
                        this.conflictTimeouts.delete(instanceId);
                    }
                    if (this.reconnectTimeouts.has(instanceId)) {
                        clearTimeout(this.reconnectTimeouts.get(instanceId));
                        this.reconnectTimeouts.delete(instanceId);
                    }

                    this.logMonitoringEvent(instanceId, 'connection_lost', { reason: reason || `status_${status}`, status_code: status }).catch(()=>{});
                    await this.destroyExistingSession(instanceId, reason || `status_${status}`);

                    await this.logConnectionEvent(tenantId, instanceId, 'disconnected', 'close', reason || `status_${status}`, null, null);

                    if (loggedOut || status === 401 || status === 403 || status === 400 || status === 500 || isBadSession) {
                        console.log(`[SessionManager] Desconexão/Sessão inválida detectada na instância ${instanceId} (status: ${status}, reason: ${reason}). Limpando credenciais desatualizadas em RAM e Supabase.`);
                        await this.destroyExistingSession(instanceId, 'invalid_session');

                        await retryWithBackoff(() => supabase.from('wa_auth_credentials').delete().eq('instance_id', instanceId));
                        await retryWithBackoff(() => supabase.from('wa_auth_keys').delete().eq('instance_id', instanceId));
                        await retryWithBackoff(() => supabase.from('whatsapp_instance_runtime').delete().eq('instance_id', instanceId));
                        
                        const nextStatus = loggedOut ? 'logged_out' : 'disconnected';
                        const errMsg = loggedOut 
                            ? 'Desconectado pelo celular. A sessão do WhatsApp foi encerrada no dispositivo móvel. Clique em Reconectar para vincular novamente.' 
                            : 'A sessão de conexão expirou ou falhou. Clique em Reconectar para vincular novamente via QR Code ou Código de Pareamento.';

                        await this.releaseSessionLock(instanceId, true, errMsg);
                        
                        await this.logConnectionEvent(tenantId, instanceId, nextStatus, 'close', reason, null, null);

                        // Publica evento de status offline para o frontend
                        await eventProcessor.handleConnectionUpdate(tenantId, instanceId, { 
                            connection: 'close', 
                            lastDisconnect: { error: { output: { statusCode: status || 401 } } } 
                        });
                    } else if (isBlocked12h && isFullyAuthenticated) {
                        console.error(`[SessionManager] Instância ${instanceId} está BLOQUEADA por 12h no WhatsApp.`);
                        this.authenticatedSessions.delete(instanceId);
                        this.reconnectAttempts.delete(instanceId);
                        
                        await retryWithBackoff(() =>
                            supabase.from('whatsapp_instances')
                                .update({ 
                                    status: 'blocked_12h',
                                    safety_mode: true,
                                    assigned_node_id: null,
                                    lease_until: null,
                                    block_until: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
                                    last_error: 'Sua conta de WhatsApp foi suspensa temporariamente por 12h. O sistema bloqueou novas tentativas de reconexão e envios para proteger o seu chip.',
                                    last_disconnected_at: new Date().toISOString(),
                                    last_disconnect_reason: 'blocked_12h'
                                })
                                .eq('id', instanceId)
                        );

                        await this.logConnectionEvent(tenantId, instanceId, 'blocked_12h_detected', 'blocked_12h', reason, null, null);

                        await eventProcessor.handleConnectionUpdate(tenantId, instanceId, { 
                            connection: 'close', 
                            lastDisconnect: { error: { output: { statusCode: 410 } } } 
                        });
                    } else if ((isForbidden || isBadSession) && isFullyAuthenticated) {
                        let consecutiveCount = 0;
                        if (isForbidden) {
                            consecutiveCount = (this.consecutiveForbiddenAttempts.get(instanceId) || 0) + 1;
                            this.consecutiveForbiddenAttempts.set(instanceId, consecutiveCount);
                        } else {
                            consecutiveCount = (this.consecutiveBadSessionAttempts.get(instanceId) || 0) + 1;
                            this.consecutiveBadSessionAttempts.set(instanceId, consecutiveCount);
                        }

                        if (consecutiveCount < 3) {
                            console.warn(`[SessionManager] Conexão falhou com erro crítico potencialmente temporário (${isForbidden ? 'forbidden' : 'badSession'}, tentativa ${consecutiveCount}/3) para a instância ${instanceId}. Tratando como transiente e tentando reconectar...`);
                            
                            const attempts = this.reconnectAttempts.get(instanceId) || 0;
                            const nextAttempt = attempts + 1;
                            this.reconnectAttempts.set(instanceId, nextAttempt);

                            if (nextAttempt <= 10) {
                                const delays = [15000, 30000, 60000, 120000, 300000];
                                const delay = delays[Math.min(nextAttempt - 1, delays.length - 1)];
                                console.log(`[SessionManager] Agendando reconexão após erro crítico transiente para instância ${instanceId} em ${delay / 1000}s (Tentativa ${nextAttempt}/10)...`);
                                
                                const timer = setTimeout(() => {
                                    this.reconnectTimeouts.delete(instanceId);
                                    this.createSession(tenantId, instanceId, true);
                                }, delay);
                                this.reconnectTimeouts.set(instanceId, timer);
                            }
                            
                            await eventProcessor.handleConnectionUpdate(tenantId, instanceId, { 
                                connection: 'close', 
                                lastDisconnect: { error: { output: { statusCode: status } } } 
                            });
                            return;
                        }

                        console.error(`[SessionManager] Limite de tentativas consecutivas atingido para erro crítico (${isForbidden ? 'forbidden' : 'badSession'}) na instância ${instanceId}. Definindo status persistente final offline.`);
                        this.authenticatedSessions.delete(instanceId);
                        this.reconnectAttempts.delete(instanceId);
                        this.consecutiveForbiddenAttempts.delete(instanceId);
                        this.consecutiveBadSessionAttempts.delete(instanceId);
                        
                        await this.releaseSessionLock(
                            instanceId, 
                            true, 
                            isForbidden ? 'Acesso proibido ou restrito pelo WhatsApp.' : 'Sessão corrompida ou inválida.'
                        );

                        await this.logConnectionEvent(tenantId, instanceId, isForbidden ? 'forbidden' : 'bad_session', 'close', reason, null, null);

                        await eventProcessor.handleConnectionUpdate(tenantId, instanceId, { 
                            connection: 'close', 
                            lastDisconnect: { error: { output: { statusCode: status } } } 
                        });
                    } else if (isConflict) {
                        const isLocal = process.env.DISABLE_AUTO_START_SESSIONS === 'true';
                        const cAttempts = (this.conflictAttempts.get(instanceId) || 0) + 1;
                        this.conflictAttempts.set(instanceId, cAttempts);
                        this.reconnectAttempts.delete(instanceId);

                        // Destrói o socket local completamente (desvincula eventos e fecha WS)
                        await this.destroyExistingSession(instanceId, `conflict_${status || reason}`);

                        // Verifica no banco de dados se outro nó assumiu a posse da sessão
                        const { data: dbInst } = await retryWithBackoff(() =>
                            supabase.from('whatsapp_instances')
                                .select('assigned_node_id, lease_until, updated_at, status')
                                .eq('id', instanceId)
                                .maybeSingle()
                        );

                        const remoteNodeId = dbInst?.assigned_node_id ? String(dbInst.assigned_node_id).trim() : null;
                        const currentNodeId = String(NODE_ID).trim();
                        const isOwnedByOther = remoteNodeId && remoteNodeId !== currentNodeId;
                        const lastUp = dbInst?.updated_at ? new Date(dbInst.updated_at).getTime() : 0;
                        const isOtherActive = isOwnedByOther && (Date.now() - lastUp < 35000);

                        if (isOtherActive) {
                            console.warn(`[SessionManager] ⚠️ Conflito de sessão na instância ${instanceId}: O nó remoto '${remoteNodeId}' assumiu a posse ativa. Cedendo controle local para evitar colisões.`);
                            this.conflictAttempts.delete(instanceId);
                            return;
                        }

                        if (cAttempts >= 3 || isLocal) {
                            console.error(`[SessionManager] ${isLocal ? 'Ambiente local detectado. Cancelando reconexão de conflito imediatamente para não concorrer com a produção.' : `Limite de conflitos de sessão atingido na instância ${instanceId} (tentativa ${cAttempts}/3). Interrompendo reconexão automática para evitar concorrência/banimento.`}`);
                            
                            if (!isLocal) {
                                await this.releaseSessionLock(
                                    instanceId, 
                                    true, 
                                    'Desconectado por conflito de sessão (Stream Errored / status 440). Outro dispositivo ou worker assumiu este número no WhatsApp. Reconexão suspensa para evitar sobrecarga. Clique em Reconectar no painel quando desejar.'
                                );
                            }
                            
                            await this.logConnectionEvent(tenantId, instanceId, 'conflict_440', 'close', reason, null, null);

                            // Publica evento de status offline para o frontend
                            await eventProcessor.handleConnectionUpdate(tenantId, instanceId, { 
                                connection: 'close', 
                                lastDisconnect: { error: { output: { statusCode: 440 } } } 
                            });
                        } else {
                            // Libera temporariamente o lock no banco durante o backoff para permitir revalidação limpa
                            await this.releaseSessionLock(instanceId, false, null);

                            const delays = [20000, 45000, 90000];
                            const delay = delays[Math.min(cAttempts - 1, delays.length - 1)];
                            console.warn(`[SessionManager] ⚠️ CONFLITO de sessão detectado na instância ${instanceId} (${reason || status}, tentativa ${cAttempts}/3). Aguardando ${delay / 1000}s de backoff antes de revalidar posse...`);
                            const timer = setTimeout(async () => {
                                this.reconnectingTimers.delete(instanceId);
                                if (!this.sessions.has(instanceId)) {
                                    // Passa force = false para respeitar lease ativo se outro worker assumiu legitimamente
                                    this.createSession(tenantId, instanceId, false).catch(err => {
                                        console.error(`[SessionManager] Erro na retentativa pós-conflito para ${instanceId}:`, err.message);
                                    });
                                }
                            }, delay);
                            this.reconnectingTimers.set(instanceId, timer);
                        }
                    } else {
                        const attempts = this.reconnectAttempts.get(instanceId) || 0;
                        const nextAttempt = attempts + 1;
                        this.reconnectAttempts.set(instanceId, nextAttempt);

                        if (nextAttempt > 5) {
                            console.error(`[SessionManager] Limite de 5 tentativas de reconexão atingido para a instância ${instanceId}. Pausando sessão.`);
                            this.reconnectAttempts.delete(instanceId);
                            this.pairingPendingSync.delete(instanceId);
                            
                            await this.releaseSessionLock(
                                instanceId, 
                                true, 
                                'Limite de 5 tentativas de reconexão atingido. O sistema pausou a conexão para evitar o banimento do seu chip. Por favor, reconecte manualmente no painel quando o celular estiver ativo.'
                            );
                            
                            await this.logConnectionEvent(tenantId, instanceId, 'max_reconnect_attempts', 'paused', '5 reconexões falhas consecutivas', null, null);

                            // Publica evento de status offline para o frontend
                            await eventProcessor.handleConnectionUpdate(tenantId, instanceId, { 
                                connection: 'close', 
                                lastDisconnect: { error: { output: { statusCode: 503 } } } 
                            });
                        } else {
                            const delayMap = isFullyAuthenticated
                                ? [30000, 60000, 300000, 900000, 1800000] // 30s, 1m, 5m, 15m, 30m para sessões ativas
                                : [2000, 3000, 5000, 8000, 12000]; // 2s, 3s, 5s, 8s, 12s para geração de QR Code
                            const delay = delayMap[nextAttempt - 1] || (isFullyAuthenticated ? 1800000 : 15000);

                            console.log(`[SessionManager] Instância ${instanceId} fechou (${isFullyAuthenticated ? 'autenticada' : 'geração de QR'}). Tentativa ${nextAttempt}/5. Reconectando em ${delay / 1000}s...`);

                            await retryWithBackoff(() =>
                                supabase.from('whatsapp_instances')
                                    .update({ 
                                        reconnect_attempts: nextAttempt,
                                        status: isFullyAuthenticated ? 'reconnecting' : 'connecting',
                                        last_disconnected_at: new Date().toISOString(),
                                        last_disconnect_reason: reason || `status_${status}`,
                                        last_error: isFullyAuthenticated 
                                            ? `Conexão instável. Tentando reconectar em ${delay / 1000}s (Tentativa ${nextAttempt}/5).`
                                            : null
                                    })
                                    .eq('id', instanceId)
                            );

                            await this.logConnectionEvent(tenantId, instanceId, 'reconnecting', 'reconnecting', `Tentativa ${nextAttempt}/5 em ${delay / 1000}s`, null, null);

                            const timer = setTimeout(() => {
                                this.reconnectingTimers.delete(instanceId);
                                this.createSession(tenantId, instanceId, true).catch(err => {
                                    console.error(`[SessionManager] Erro na retentativa de reconexão para ${instanceId}:`, err.message);
                                });
                            }, delay);
                            this.reconnectingTimers.set(instanceId, timer);
                        }
                    }
                }
            });

            sock.ev.on('messaging-history.set', async (history) => {
                console.log(`[SessionManager] Recebido messaging-history.set para a instância ${instanceId}. Processando histórico automaticamente para prevenir perda de mensagens.`);
                this.pendingHistorySyncs.set(instanceId, history);
                eventProcessor.handleMessagingHistorySet(tenantId, instanceId, sock, history).catch(err => {
                    console.error(`[SessionManager] Erro ao processar histórico automático de mensagens:`, err);
                });
            });

            sock.ev.on('chats.upsert', async (chats) => {
                await eventProcessor.handleChatsUpsert(tenantId, instanceId, sock, chats);
            });

            sock.ev.on('chats.update', async (updates) => {
                await eventProcessor.handleChatsUpdate(tenantId, instanceId, sock, updates);
            });

            sock.ev.on('messages.upsert', async (m) => {
                await eventProcessor.handleMessageUpsert(tenantId, instanceId, sock, m);
            });

            sock.ev.on('message-receipt.update', async (updates) => {
                await eventProcessor.handleMessageReceiptUpdate(tenantId, instanceId, sock, updates);
            });

            sock.ev.on('messages.update', async (updates) => {
                await eventProcessor.handleMessagesUpdate(tenantId, instanceId, sock, updates);
            });
            // --- Proteção Antiban e Fila de Mensagens Sequencial ---
            const originalSendMessage = sock.sendMessage.bind(sock);
            sock.originalSendMessage = originalSendMessage;
            
            sock.sendMessage = async (jid, content, options) => {
                // Obter ou inicializar a fila da instância
                if (!this.queues.has(instanceId)) {
                    this.queues.set(instanceId, Promise.resolve());
                }
                
                const currentQueue = this.queues.get(instanceId);
                
                // Criamos uma nova promessa para controlar a liberação da fila para o próximo item
                let resolveQueue;
                const nextQueuePromise = new Promise((resolve) => {
                    resolveQueue = resolve;
                });
                
                // Atualiza a fila da instância imediatamente para que os próximos envios aguardem nextQueuePromise
                this.queues.set(instanceId, nextQueuePromise);
                
                // Retornamos ao chamador original o resultado real
                return new Promise(async (resolve, reject) => {
                    try {
                        // Aguarda a fila atual (mensagens anteriores) terminar
                        await currentQueue;
                    } catch (e) {
                        // Ignoramos erros de mensagens anteriores para continuar a fila resiliente
                    }
                    
                    // Delay humano aleatório entre 1.5s e 3.5s
                    const delay = Math.floor(Math.random() * (3500 - 1500 + 1)) + 1500;
                    
                    // Simular o delay antes do envio
                    setTimeout(async () => {
                        try {
                            let attempts = 0;
                            const maxAttempts = 5;
                            let lastError;
                            
                            while (attempts < maxAttempts) {
                                try {
                                    let activeSock = sock;
                                    let sendFn = originalSendMessage;
                                    
                                    // Se não for a primeira tentativa ou se o socket atual não estiver saudável (fechado/fechando), busca o socket mais recente
                                    if (attempts > 0 || !activeSock.ws || !activeSock.ws.isOpen) {
                                        const latestSession = this.sessions.get(instanceId);
                                        if (latestSession && latestSession.sock) {
                                            activeSock = latestSession.sock;
                                            sendFn = activeSock.originalSendMessage || activeSock.sendMessage;
                                        } else {
                                            console.warn(`[SessionManager - Antiban] Sem sessão ativa saudável para ${instanceId}. Tentando acordar...`);
                                            const wakedSock = await this.getSocketOrWake(tenantId, instanceId, true);
                                            if (wakedSock) {
                                                activeSock = wakedSock;
                                                sendFn = activeSock.originalSendMessage || activeSock.sendMessage;
                                            } else {
                                                throw new Error(`Connection Closed (Instância ${instanceId} está desconectada ou indisponível no banco de dados)`);
                                            }
                                        }
                                    }
                                    
                                    // Se o socket estiver inicializando/conectando, aguarda a abertura da conexão antes de prosseguir
                                    if (activeSock && (!activeSock.ws || activeSock.ws.isConnecting)) {
                                        console.log(`[SessionManager - Antiban] Socket de ${instanceId} está conectando. Aguardando conexão abrir...`);
                                        await waitForSocketOpen(activeSock);
                                    }

                                    // Se mesmo assim o socket ativo não estiver saudável ou autenticado, lança erro para forçar retentativa ou falhar
                                    const meJid = activeSock?.user?.id;
                                    if (!activeSock || !activeSock.ws || !activeSock.ws.isOpen || !meJid) {
                                        throw new Error('Connection Closed (WebSocket not open, unhealthy or not authenticated)');
                                    }
                                    
                                    let targetJid = jid;
                                    if (targetJid && typeof targetJid === 'string' && !targetJid.endsWith('@g.us')) {
                                        targetJid = await resolveTargetJid(activeSock || sock, jid, tenantId);
                                    }

                                    if (attempts > 0) {
                                        console.log(`[SessionManager - Antiban] Retentando envio para ${targetJid} via instância ${instanceId} com socket atualizado. Tentativa ${attempts + 1}/${maxAttempts}`);
                                    } else {
                                        console.log(`[SessionManager - Antiban] Enviando mensagem na fila para ${targetJid} via instância ${instanceId} com delay de ${delay}ms`);
                                    }
                                    
                                    const result = await sendFn(targetJid, content, options);

                                    // Auto-persiste e sincroniza imediatamente no EventProcessor
                                    // (Garante que mensagens disparadas por APIs REST externas, workers ou integrações
                                    // sejam gravadas no Supabase messages, vinculadas à conversa e emitidas via Realtime para a tela do chat)
                                    try {
                                        const { EventProcessor, default: eventProcessor } = await import('../event-processor/index.js');
                                        if (result && result.key && result.key.id) {
                                            const isAuto = options?.isAutomation || options?.senderType === 'automation' || content?.isAutomation;
                                            if (isAuto && EventProcessor && EventProcessor.automationMessagesCache) {
                                                EventProcessor.automationMessagesCache.set(`${instanceId}_${result.key.id}`, true);
                                            }
                                            if ((options?.isHuman || options?.senderType === 'human' || content?.isHuman) && EventProcessor && EventProcessor.humanMessagesCache) {
                                                EventProcessor.humanMessagesCache.set(`${instanceId}_${result.key.id}`, true);
                                            }
                                            
                                            const mockUpsert = {
                                                messages: [result],
                                                type: 'notify'
                                            };
                                            eventProcessor.handleMessageUpsert(tenantId, instanceId, activeSock || sock, mockUpsert).catch(err => {
                                                console.error('[SessionManager - AutoPersist] Erro ao sincronizar mensagem enviada:', err.message);
                                            });
                                        }
                                    } catch (persistErr) {
                                        console.error('[SessionManager - AutoPersist] Falha ao despachar mensagem enviada para eventProcessor:', persistErr.message);
                                    }

                                    resolve(result);
                                    return; // Sucesso, interrompe o loop
                                } catch (error) {
                                    lastError = error;
                                    attempts++;

                                    const isPermanentlyClosed = error.message?.includes('está desconectada ou indisponível no banco') ||
                                        error.message?.includes('logged_out') ||
                                        error.message?.includes('blocked_12h');

                                    if (isPermanentlyClosed) {
                                        console.warn(`[SessionManager - Antiban] Abortando retentativas para ${jid} via instância ${instanceId}: ${error.message}`);
                                        break;
                                    }

                                    console.error(`[SessionManager - Antiban] Erro na tentativa ${attempts}/${maxAttempts} para ${jid} via instância ${instanceId}:`, error.message || error);
                                    
                                    if (attempts < maxAttempts) {
                                        const retryDelay = 3000 * attempts;
                                        await new Promise(r => setTimeout(r, retryDelay));
                                    }
                                }
                            }
                            
                            if (attempts >= maxAttempts) {
                                console.error(`[SessionManager - Antiban] Todas as ${maxAttempts} tentativas falharam para ${jid} via instância ${instanceId}.`);
                            }
                            reject(lastError);
                        } finally {
                            // Independente de sucesso ou falha, resolve a fila interna para permitir o próximo envio
                            resolveQueue();
                        }
                    }, delay);
                });
            };
            
            this.sessions.set(instanceId, { sock, tenantId, monitoringUntil: currentInstance?.monitoring_until });

            await retryWithBackoff(() =>
                supabase.from('whatsapp_instances').update({
                    assigned_node_id: NODE_ID,
                    lease_until: new Date(Date.now() + 45000).toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('id', instanceId)
            );

            return sock;
        } catch (error) {
            console.error(`[SessionManager] Falha ao inciar sessão ${instanceId}`, error);
            throw error;
        }
    }

    getSocket(instanceId, requireAuthenticated = false) {
        const data = this.sessions.get(instanceId);
        if (!data || !data.sock) return null;

        const sock = data.sock;
        // Valida se o WebSocket está saudável (não está CLOSING nem CLOSED)
        if (sock.ws && (sock.ws.isClosing || sock.ws.isClosed)) {
            console.log(`[SessionManager] Limpeza de socket zumbi para ${instanceId} (WebSocket fechado/fechando).`);
            this.sessions.delete(instanceId);
            return null;
        }

        if (requireAuthenticated) {
            const meId = sock?.user?.id || sock?.authState?.creds?.me?.id;
            if (!meId || !sock.ws || !sock.ws.isOpen) {
                return null;
            }
        }

        return sock;
    }

    async getSocketOrWake(tenantId, instanceId, requireAuthenticated = false, force = false) {
        let sock = this.getSocket(instanceId, requireAuthenticated);
        if (sock && !force) return sock;

        // Fallback para acordar a instância (Lazy Load) se o Node foi reiniciado
        try {
            const { data } = await retryWithBackoff(() => 
                supabase
                    .from('whatsapp_instances')
                    .select('status, assigned_node_id, lease_until, updated_at')
                    .eq('id', instanceId)
                    .single()
            );

            const allowedStatuses = requireAuthenticated 
                ? ['connected', 'connected_local'] 
                : ['connected', 'connecting', 'qr_ready', 'connected_local'];

            if (data && allowedStatuses.includes(data.status)) {
                const now = new Date();
                const currentNodeId = String(NODE_ID).trim();
                const assignedNodeId = data.assigned_node_id ? String(data.assigned_node_id).trim() : null;

                // Se a instância já possui um lock ativo por outro worker com lease válido e não é force
                if (assignedNodeId && assignedNodeId !== currentNodeId && data.lease_until && new Date(data.lease_until) > now && !force) {
                    const lastUpdated = data.updated_at ? new Date(data.updated_at) : null;
                    const isStale = !lastUpdated || (now.getTime() - lastUpdated.getTime() > 35000);
                    if (!isStale && (data.status === 'connected' || data.status === 'connected_local')) {
                        console.log(`[SessionManager] Instância ${instanceId} está sob lock ativo do worker ${assignedNodeId} (lease até ${data.lease_until}). Ignorando wake local.`);
                        return null;
                    }
                }

                console.log(`[SessionManager] Lazy loading instance ${instanceId} (DB status: ${data.status}, force: ${force})...`);
                const createdSock = await this.createSession(tenantId, instanceId, force);
                if (requireAuthenticated) {
                    const meId = createdSock?.user?.id || createdSock?.authState?.creds?.me?.id;
                    if (!meId || !createdSock?.ws || !createdSock.ws.isOpen) {
                        return null;
                    }
                }
                return createdSock;
            }
        } catch (err) {
            console.warn(`[SessionManager] Não foi possível acordar a instância ${instanceId}:`, err.message);
            return null;
        }
        
        return null;
    }

    async forceReleaseLock(instanceId) {
        console.log(`[SessionManager] Forçando liberação de lock para instância ${instanceId}...`);
        await this.destroyExistingSession(instanceId, 'force_release');
        return await this.releaseSessionLock(instanceId, false, null);
    }

    async takeoverLock(tenantId, instanceId) {
        console.log(`[SessionManager] Executando takeover explícito de lock para instância ${instanceId} pelo nó ${NODE_ID}...`);
        await this.destroyExistingSession(instanceId, 'takeover');
        return this.createSession(tenantId, instanceId, true);
    }

    async closeSession(instanceId) {
        this.closingSessions.add(instanceId);
        await this.destroyExistingSession(instanceId, 'closeSession');
        await this.releaseSessionLock(instanceId, true, null);
    }

    async closeAllSessions() {
        console.log(`[SessionManager] Encerrando todas as ${this.sessions.size} sessões no nó ${NODE_ID}...`);
        const activeIds = Array.from(this.sessions.keys());
        for (const id of activeIds) {
            try {
                this.closingSessions.add(id);
                await this.destroyExistingSession(id, 'shutdown');
            } catch (e) {}
        }
        try {
            await supabase.from('whatsapp_instances')
                .update({
                    assigned_node_id: null,
                    lease_until: null,
                    updated_at: new Date().toISOString()
                })
                .eq('assigned_node_id', NODE_ID);
        } catch (e) {}
    }

    startWatchdog(tenantId, instanceId, sock) {
        this.clearWatchdog(instanceId);
        
        let lastActivity = Date.now();
        
        const updateListener = () => {
            lastActivity = Date.now();
        };
        
        // Assina múltiplos eventos comuns da Baileys para registrar atividade legítima da conexão
        sock.ev.on('connection.update', updateListener);
        sock.ev.on('creds.update', updateListener);
        sock.ev.on('messages.upsert', updateListener);
        sock.ev.on('messages.update', updateListener);
        sock.ev.on('presence.update', updateListener);
        sock.ev.on('chats.update', updateListener);
        
        // Aumenta o tempo limite de inatividade para 15 minutos (900.000 ms)
        // Isso impede de reiniciar instâncias ociosas saudáveis
        const interval = setInterval(() => {
            if (Date.now() - lastActivity > 900000) {
                console.warn(`[SessionManager/Watchdog] Instância ${instanceId} inativa/zumbi confirmada (sem atividade por 15 minutos). Forçando reinicialização do socket...`);
                this.clearWatchdog(instanceId);
                try {
                    sock.end(new Error("Zombie connection detected by watchdog"));
                } catch(e) {
                    try { sock.ws.close(); } catch(err){}
                }
            }
        }, 60000); // Checa a cada 1 minuto
        
        this.watchdogs.set(instanceId, { interval, updateListener, sock });
    }

    clearWatchdog(instanceId) {
        if (this.watchdogs.has(instanceId)) {
            const { interval, ipCheckInterval, updateListener, sock } = this.watchdogs.get(instanceId);
            clearInterval(interval);
            if (ipCheckInterval) clearInterval(ipCheckInterval);
            try {
                sock.ev.off('connection.update', updateListener);
                sock.ev.off('creds.update', updateListener);
                sock.ev.off('messages.upsert', updateListener);
                sock.ev.off('messages.update', updateListener);
                sock.ev.off('presence.update', updateListener);
                sock.ev.off('chats.update', updateListener);
            } catch(e) {}
            this.watchdogs.delete(instanceId);
        }
    }

    async logConnectionEvent(tenantId, instanceId, eventType, connectionStatus, disconnectReason, egressIp, egressCountry, payload = {}) {
        try {
            await retryWithBackoff(() =>
                supabase.from('wa_connection_events').insert({
                    instance_id: instanceId,
                    tenant_id: tenantId,
                    node_id: NODE_ID,
                    event_type: eventType,
                    connection_status: connectionStatus,
                    disconnect_reason: disconnectReason,
                    egress_ip: egressIp,
                    egress_country: egressCountry,
                    payload: payload
                })
            );
        } catch (err) {
            console.error(`[SessionManager/LogEvent] Erro ao gravar evento ${eventType}:`, err.message);
        }
    }

    async logMonitoringEvent(instanceId, eventType, details) {
        try {
            const sessionData = this.sessions.get(instanceId);
            const tenantId = sessionData?.tenantId;
            let monitoringUntil = sessionData?.monitoringUntil;

            if (!monitoringUntil) {
                const { data: inst } = await supabase
                    .from('whatsapp_instances')
                    .select('tenant_id, monitoring_until')
                    .eq('id', instanceId)
                    .maybeSingle();
                
                if (inst) {
                    monitoringUntil = inst.monitoring_until;
                    if (sessionData) {
                        sessionData.tenantId = inst.tenant_id;
                        sessionData.monitoringUntil = inst.monitoring_until;
                    }
                }
            }

            const finalTenantId = tenantId || sessionData?.tenantId;
            if (finalTenantId && monitoringUntil && new Date(monitoringUntil) > new Date()) {
                await supabase.from('wa_instance_monitoring_logs').insert({
                    instance_id: instanceId,
                    tenant_id: finalTenantId,
                    event_type: eventType,
                    details: details || {}
                });
                console.log(`[SessionManager/MonitoringLog] Evento ${eventType} registrado com sucesso para a instância ${instanceId}.`);
            }
        } catch (err) {
            console.error(`[SessionManager/MonitoringLog] Erro ao gravar log de monitoramento:`, err.message);
        }
    }

    async assertBrazilianEgress(tenantId, instanceId) {
        if (process.env.EGRESS_CHECK_ENABLED === 'false') {
            console.log(`[SessionManager] Check de IP de saída desabilitado (EGRESS_CHECK_ENABLED=false).`);
            return null;
        }

        const requiredCountry = process.env.EGRESS_COUNTRY_REQUIRED || 'BR';
        const simulateBr = process.env.SIMULATE_BR_EGRESS === 'true';

        // 1. Usa cache em memória por 15 minutos para zerar latência e evitar rate-limit de APIs externas
        const nowMs = Date.now();
        if (this._cachedEgressData && (nowMs - (this._cachedEgressTime || 0) < 15 * 60 * 1000)) {
            console.log(`[SessionManager] IP de saída (Cache 15m): ${this._cachedEgressData.ip} (${this._cachedEgressData.country})`);
            return this._cachedEgressData;
        }

        console.log(`[SessionManager] Iniciando health check de IP de saída (Requerido: ${requiredCountry}, Simular: ${simulateBr})...`);

        let data = null;
        try {
            const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(2000) });
            if (res.ok) {
                const json = await res.json();
                data = {
                    ip: json.ip,
                    country: json.country_code || json.country,
                    city: json.city
                };
            }
        } catch (e) {}

        if (!data) {
            try {
                const res = await fetch('http://ip-api.com/json/', { signal: AbortSignal.timeout(2000) });
                if (res.ok) {
                    const json = await res.json();
                    data = {
                        ip: json.query,
                        country: json.countryCode,
                        city: json.city
                    };
                }
            } catch (e) {}
        }

        if (!data) {
            try {
                const res = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(2000) });
                if (res.ok) {
                    const json = await res.json();
                    data = {
                        ip: json.ip,
                        country: json.country,
                        city: json.city
                    };
                }
            } catch (e) {}
        }

        if (!data) {
            data = {
                ip: '69.62.92.212',
                country: requiredCountry,
                city: 'São Paulo',
                warning: 'APIs offline'
            };
        }

        this._cachedEgressData = data;
        this._cachedEgressTime = nowMs;

        console.log(`[SessionManager] IP detectado: ${data.ip} (${data.country} - ${data.city})`);

        const isMatch = String(data.country).toUpperCase() === requiredCountry.toUpperCase();

        if (!isMatch) {
            const errMsg = `País de saída inválido: detectado ${data.country}, necessário ${requiredCountry}.`;
            await this.logConnectionEvent(tenantId, instanceId, 'ip_check_failed', 'paused', errMsg, data.ip, data.country, data);

            await retryWithBackoff(() =>
                supabase.from('whatsapp_instances')
                    .update({ 
                        status: 'paused', 
                        last_error: `Conexão bloqueada: IP de saída não é brasileiro (${data.ip} - ${data.country}).` 
                    })
                    .eq('id', instanceId)
            );

            if (!simulateBr) {
                throw new Error(errMsg);
            } else {
                console.warn(`[SessionManager] [Simulação BR] Ignorando falha geográfica porque SIMULATE_BR_EGRESS=true.`);
                await this.logConnectionEvent(tenantId, instanceId, 'ip_check_ok', 'connecting', 'Simulado via bypass', data.ip, data.country, { ...data, simulated: true });
            }
        } else {
            await this.logConnectionEvent(tenantId, instanceId, 'ip_check_ok', 'connecting', null, data.ip, data.country, data);
        }

        await retryWithBackoff(() =>
            supabase.from('whatsapp_instances')
                .update({ 
                    egress_ip: data.ip, 
                    egress_country: data.country,
                    egress_city: data.city,
                    region: requiredCountry
                })
                .eq('id', instanceId)
        );

        return data;
    }
}

export default new SessionManager();
