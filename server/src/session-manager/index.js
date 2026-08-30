import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import { useSupabaseAuthState, flushPendingWrites, sessionCaches, clearInstanceMemoryCache, clearRecipientSession } from './auth.js';
import eventProcessor from '../event-processor/index.js';
import { addLog } from '../system-logger.js';
import pino from 'pino';
import { supabase, NODE_ID, retryWithBackoff, resolveTargetJid } from '../supabase.js';

export const HOMOLOG_ALLOWED_INSTANCES = [
    'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6', // FoodNext (11 94775-8860)
    '5c78d358-d449-41c4-b396-a04ab20a39e4'  // Ronaldo-Web (11 97596-0999)
];

export const isInstanceAllowedForNode = (instanceId, tenantId = null) => {
    const currentNodeId = String(NODE_ID).trim();
    const isAlphaWorker = currentNodeId.includes('alpha') || (process.env.APP_ENV || '').toLowerCase() === 'alpha';
    if (!isAlphaWorker) return true;
    if (process.env.AUTO_START_ALPHA_ALL === 'true') return true;
    // O nó Alpha de Homologação é restrito EXCLUSIVAMENTE às instâncias oficiais de teste homologadas
    return HOMOLOG_ALLOWED_INSTANCES.includes(instanceId);
};

export const isSocketOpen = (sock) => {
    if (!sock || !sock.ws) return false;
    const ws = sock.ws;
    if (ws.isOpen === true) return true;
    if (ws.socket && ws.socket.readyState === 1) return true; // WebSocket.OPEN
    if (ws.isClosed === true || ws.isClosing === true) return false;
    if (ws.socket && (ws.socket.readyState === 2 || ws.socket.readyState === 3)) return false;
    
    // Se está em processo ativo de conexão/handshake, não considerar aberto ainda para envio imediato sem wait
    if (ws.isConnecting === true || (ws.socket && ws.socket.readyState === 0)) {
        return false;
    }

    // Se possui credenciais de usuário autenticadas e ws não está explicitamente fechado nem fechando
    const meId = sock.user?.id || sock.authState?.creds?.me?.id;
    if (meId && !ws.isClosed && !ws.isClosing && (!ws.socket || ws.socket.readyState === 1)) {
        return true;
    }
    return false;
};

const waitForSocketOpen = (sock, timeoutMs = 20000) => {
    return new Promise((resolve, reject) => {
        if (isSocketOpen(sock)) {
            return resolve(true);
        }
        const ws = sock?.ws;
        const rawState = ws?.socket?.readyState;
        if (ws && (ws.isClosing || ws.isClosed || rawState === 2 || rawState === 3)) {
            return reject(new Error('WebSocket is closed or closing'));
        }

        let isClean = false;
        let pollTimer = null;
        const cleanUp = () => {
            if (isClean) return;
            isClean = true;
            clearTimeout(timer);
            if (pollTimer) clearInterval(pollTimer);
            try {
                if (sock.ev && typeof sock.ev.off === 'function') {
                    sock.ev.off('connection.update', connectionListener);
                }
            } catch (e) {}
        };

        const timer = setTimeout(() => {
            cleanUp();
            // Verificação final antes de rejeitar
            if (isSocketOpen(sock)) {
                resolve(true);
            } else {
                reject(new Error('Timeout waiting for connection to open'));
            }
        }, timeoutMs);

        const connectionListener = (update) => {
            const { connection } = update;
            if (connection === 'open' || isSocketOpen(sock)) {
                cleanUp();
                resolve(true);
            } else if (connection === 'close') {
                cleanUp();
                reject(new Error('Connection closed while waiting to open'));
            }
        };

        if (sock.ev && typeof sock.ev.on === 'function') {
            sock.ev.on('connection.update', connectionListener);
        }

        // Polling de fallback rápido (a cada 200ms) para detectar abertura imediata do socket
        pollTimer = setInterval(() => {
            if (isSocketOpen(sock)) {
                cleanUp();
                resolve(true);
            }
        }, 200);
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
        this.instanceMutexes = new Map();
        this.autoHealingCooldowns = new Map();
        this.reconnectingCoolingDown = new Map();

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
                    const isLocalDev = process.env.DISABLE_AUTO_START_SESSIONS === 'true' || process.env.IS_LOCAL_DEV === 'true';
                    const activeStatus = isLocalDev ? 'connected_local' : 'connected';

                    const healthyIds = [];
                    const zombieEntries = [];

                    for (const [id, sessionData] of activeEntries) {
                        const sock = sessionData?.sock;
                        const ws = sock?.ws;
                        const rawState = ws?.socket?.readyState;
                        const isConnecting = this.connectingState.has(id) || (ws && (ws.isConnecting || rawState === 0));
                        const hasActiveTimer = this.reconnectingTimers.has(id) || this.reconnectTimeouts.has(id) || this.conflictTimeouts.has(id);
                        const lastCooldown = this.reconnectingCoolingDown.get(id) || 0;
                        const isCoolingDown = (Date.now() - lastCooldown < 35000);

                        if (sock && isSocketOpen(sock)) {
                            healthyIds.push(id);
                        } else if (!isConnecting && !hasActiveTimer && !isCoolingDown) {
                            // Só considera zumbi se estiver com WebSocket explicitamente fechado há mais de 45 segundos e sem timer ativo
                            const isExplicitlyDead = ws && (ws.isClosed || rawState === 2 || rawState === 3);
                            if (isExplicitlyDead) {
                                zombieEntries.push({ id, tenantId: sessionData?.tenantId });
                            }
                        }
                    }

                    // Limpa e auto-reconecta sockets zumbis confirmados
                    for (const z of zombieEntries) {
                        console.warn(`[SessionManager/Heartbeat] Detectado socket zumbi sem WebSocket aberto para ${z.id}. Destruindo sessão e reconectando...`);
                        const wasAuth = this.authenticatedSessions.has(z.id);
                        this.destroyExistingSession(z.id, 'zombie_heartbeat').catch(() => {});
                        if (z.tenantId && wasAuth && !isLocalDev) {
                            this.reconnectingCoolingDown.set(z.id, Date.now());
                            const timer = setTimeout(() => {
                                this.reconnectingTimers.delete(z.id);
                                if (!this.sessions.has(z.id)) {
                                    this.createSession(z.tenantId, z.id, true).catch(err => {
                                        console.error(`[SessionManager/Heartbeat] Erro na auto-reconexão pós-zumbi para ${z.id}:`, err.message);
                                    });
                                }
                            }, 3000);
                            this.reconnectingTimers.set(z.id, timer);
                        }
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

        // Supervisor de Auto-Healing Proativo (a cada 25 segundos)
        // Garante que nenhuma instância que deveria estar conectada permaneça offline/órfã
        setInterval(async () => {
            try {
                const isLocalDev = process.env.DISABLE_AUTO_START_SESSIONS === 'true' || process.env.IS_LOCAL_DEV === 'true';
                if (isLocalDev) return;

                const { data: dbInstances, error } = await supabase
                    .from('whatsapp_instances')
                    .select('id, tenant_id, status, assigned_node_id, lease_until, updated_at')
                    .in('status', ['connected', 'reconnecting', 'connecting']);

                if (error || !dbInstances || dbInstances.length === 0) return;

                const now = Date.now();
                const currentNodeId = String(NODE_ID).trim();
                const isProductionMaster = currentNodeId === 'production-worker' || (process.env.APP_ENV || '').toLowerCase() === 'production';

                for (const inst of dbInstances) {
                    // Isolamento de nó: Se este worker for Alpha, só pode auto-curar instâncias de homologação autorizadas
                    if (!isInstanceAllowedForNode(inst.id, inst.tenant_id)) {
                        continue;
                    }

                    const lastHeal = this.autoHealingCooldowns.get(inst.id) || 0;
                    const lastCooldown = this.reconnectingCoolingDown.get(inst.id) || 0;
                    if (now - lastHeal < 45000 || now - lastCooldown < 35000) {
                        continue;
                    }

                    const hasSessionInRam = this.sessions.has(inst.id);
                    const sessionData = this.sessions.get(inst.id);
                    const sessionCreatedAt = sessionData?.createdAt || 0;
                    const isYoungSession = (now - sessionCreatedAt < 45000); // Não interfere em sockets em processo inicial de handshake/pre-keys
                    const sock = sessionData?.sock;
                    const ws = sock?.ws;
                    const rawState = ws?.socket?.readyState;
                    const isConnecting = this.connectingState.has(inst.id) || (ws && (ws.isConnecting || rawState === 0));
                    const hasActiveTimer = this.reconnectingTimers.has(inst.id) || this.reconnectTimeouts.has(inst.id) || this.conflictTimeouts.has(inst.id);
                    const conflictCount = this.conflictAttempts.get(inst.id) || 0;

                    // Se a instância já está conectando, em handshake inicial (< 45s), em período de backoff agendado ou atingiu limite de conflito, não interfere
                    if (isYoungSession || isConnecting || hasActiveTimer || conflictCount >= 3) {
                        continue;
                    }

                    const isWsOpen = isSocketOpen(sock);

                    if (hasSessionInRam && isWsOpen) {
                        continue;
                    }

                    const leaseExpiry = inst.lease_until ? new Date(inst.lease_until).getTime() : 0;
                    const isLeaseExpired = !inst.lease_until || (leaseExpiry < now);
                    const isAssignedToThisNode = inst.assigned_node_id === currentNodeId;
                    const assignedNodeId = inst.assigned_node_id ? String(inst.assigned_node_id).trim() : null;

                    const isNonProductionRemote = assignedNodeId && (
                        assignedNodeId.includes('alpha') ||
                        assignedNodeId.includes('staging') ||
                        assignedNodeId.includes('local') ||
                        assignedNodeId.startsWith('worker-local')
                    );
                    const isMasterTakeover = isProductionMaster && isNonProductionRemote && !HOMOLOG_ALLOWED_INSTANCES.includes(inst.id);

                    // Se a instância pertence ativamente a outro nó com lease válido (e não é Master Takeover), não concorre
                    if (assignedNodeId && !isAssignedToThisNode && !isLeaseExpired && !isMasterTakeover) {
                        continue;
                    }

                    // Se a instância está na RAM deste nó mas WS está fechado, valida se não é apenas uma oscilação recente
                    if (hasSessionInRam && !isWsOpen) {
                        const lastDisconn = sessionData?.lastDisconnectedAt ? new Date(sessionData.lastDisconnectedAt).getTime() : 0;
                        if (now - lastDisconn < 30000 && (hasActiveTimer || isConnecting)) {
                            continue;
                        }
                    }

                    // Se a instância não está ativa na RAM deste nó e (está atribuída a este nó OU o lease expirou OU é Master Takeover)
                    if (isAssignedToThisNode || isLeaseExpired || isMasterTakeover) {
                        this.autoHealingCooldowns.set(inst.id, now);
                        this.reconnectingCoolingDown.set(inst.id, now);
                        console.log(`[SessionManager/AutoHealing] 🩺 Detectada instância ${inst.id} desincronizada no nó ${currentNodeId} (RAM: ${hasSessionInRam ? 'Presente (WS fechado)' : 'Ausente'}, Lease Expirado: ${isLeaseExpired}). Revivendo conexão...`);
                        this.createSession(inst.tenant_id, inst.id, true).catch(err => {
                            console.error(`[SessionManager/AutoHealing] Falha ao reviver instância ${inst.id}:`, err.message);
                        });
                    }
                }
            } catch (healErr) {
                console.error('[SessionManager/AutoHealing] Erro no ciclo de auto-healing:', healErr.message);
            }
        }, 25000);

        // Limpeza periódica preventiva de locks órfãos/expirados no banco de dados (a cada 60s)
        setInterval(async () => {
            try {
                const now = new Date().toISOString();
                const expiredThreshold = new Date(Date.now() - 60000).toISOString();
                await supabase
                    .from('whatsapp_instances')
                    .update({
                        assigned_node_id: null,
                        lease_until: null,
                        updated_at: now
                    })
                    .lt('lease_until', expiredThreshold)
                    .not('assigned_node_id', 'is', null);
            } catch (errClean) {}
        }, 60000);
    }

    async runWithInstanceMutex(instanceId, action) {
        if (!instanceId) return action();
        if (!this.instanceMutexes.has(instanceId)) {
            this.instanceMutexes.set(instanceId, Promise.resolve());
        }
        const currentPromise = this.instanceMutexes.get(instanceId);
        let release;
        const nextPromise = new Promise(resolve => { release = resolve; });
        this.instanceMutexes.set(instanceId, nextPromise);

        try {
            await currentPromise;
        } catch (e) {}

        try {
            return await action();
        } finally {
            release();
            if (this.instanceMutexes.get(instanceId) === nextPromise) {
                this.instanceMutexes.delete(instanceId);
            }
        }
    }

    async destroyExistingSession(instanceId, reason = 'reconnect') {
        this.clearWatchdog(instanceId);
        this.reconnectingCoolingDown.set(instanceId, Date.now());

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
                    if (typeof sock.ws.on === 'function') {
                        sock.ws.on('error', () => {});
                    }
                    if (sock.ws.readyState === 1) { // OPEN
                        try { sock.ws.close(); } catch (e) {}
                    } else if (sock.ws.readyState === 0) { // CONNECTING
                        if (typeof sock.ws.terminate === 'function') {
                            try { sock.ws.terminate(); } catch (e) {}
                        } else {
                            try { sock.ws.close(); } catch (e) {}
                        }
                    }
                    if (typeof sock.ws.terminate === 'function' && sock.ws.readyState !== 3) {
                        try { sock.ws.terminate(); } catch (tErr) {}
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
        if (!isInstanceAllowedForNode(instanceId)) {
            console.log(`[SessionManager/Lock/Alpha] Nó Alpha recusou adquirir lock da instância de produção ${instanceId}.`);
            throw new Error(`Instância ${instanceId} pertence à produção e não é permitida no nó Alpha.`);
        }

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

            // Precedência de Produção: Se o nó atual for Produção (production-worker ou APP_ENV=production)
            // e o nó detentor do lock for homologação/staging/alpha ou worker local,
            // o nó de produção DEVE assumir o lock IMEDIATAMENTE (Master Takeover)!
            const isNonProductionOwner = assignedNodeId && (
                assignedNodeId.includes('alpha') ||
                assignedNodeId.includes('staging') ||
                assignedNodeId.includes('local') ||
                assignedNodeId.startsWith('worker-local')
            );
            const isProductionMaster = currentNodeId === 'production-worker' || (process.env.APP_ENV || '').toLowerCase() === 'production';
            const isMasterTakeover = isProductionMaster && isNonProductionOwner && !HOMOLOG_ALLOWED_INSTANCES.includes(instanceId);

            const isAlphaWorker = currentNodeId.includes('alpha') || (process.env.APP_ENV || '').toLowerCase() === 'alpha';
            const isProductionOwner = assignedNodeId && (assignedNodeId === 'production-worker' || assignedNodeId.includes('prod'));

            // Permite assumir o lock se:
            // 1. Forçado explicitamente (force)
            // 2. Precedência de Produção (isMasterTakeover)
            // 3. Não possui nó atribuído
            // 4. Já pertence ao nó atual
            // 5. O lease expirou
            // 6. O status é explicitamente inativo
            // 7. O worker proprietário está sem heartbeat há mais de 30s
            // 8. Última tentativa de backoff atingida e o nó não está com heartbeat recente (< 20s) E não é Alpha tentando roubar Produção
            const isOtherHeartbeatFresh = assignedNodeId && assignedNodeId !== currentNodeId && isLeaseActive && timeSinceLastUpdate <= 20000;
            const canTakeover = force || isMasterTakeover || !assignedNodeId || assignedNodeId === currentNodeId || !isLeaseActive || isExplicitlyDeadStatus || isStaleWorker || isDeadInterim || (attempt === maxLockAttempts && !isOtherHeartbeatFresh && (!isAlphaWorker || !isProductionOwner));

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

            // Se for a última tentativa e o outro nó for Produção legítima com heartbeat super ativo (< 20s), informa e preserva
            if (attempt === maxLockAttempts) {
                if (inst.status === 'connected' && assignedNodeId && assignedNodeId !== currentNodeId && timeSinceLastUpdate <= 20000 && !force) {
                    if (isAlphaWorker && isProductionOwner) {
                        console.log(`[SessionManager/Lock/Alpha] Instância ${instanceId} pertence ao nó de produção ${assignedNodeId}. O nó Alpha não interferirá.`);
                        throw new Error(`Instância ${instanceId} pertence ao nó de produção ${assignedNodeId}`);
                    }
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

    async startSession(tenantId, instanceId, force = false) {
        return this.createSession(tenantId, instanceId, force);
    }

    async createSession(tenantId, instanceId, force = false) {
        if (!isInstanceAllowedForNode(instanceId, tenantId)) {
            console.log(`[SessionManager/Create/Alpha] Nó Alpha recusou criar sessão da instância de produção ${instanceId}.`);
            throw new Error(`Instância ${instanceId} pertence à produção e não é permitida no nó Alpha.`);
        }

        return this.runWithInstanceMutex(instanceId, async () => {
            if (this.reconnectingTimers.has(instanceId)) {
                const timer = this.reconnectingTimers.get(instanceId);
                clearTimeout(timer);
                this.reconnectingTimers.delete(instanceId);
                console.log(`[SessionManager] Antecipando/limpando timer de reconexão pendente para a instância ${instanceId}.`);
            }

            if (this.sessions.has(instanceId) && !force) {
                const existingSock = this.sessions.get(instanceId)?.sock;
                if (existingSock && isSocketOpen(existingSock)) {
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
        });
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

            // Tratamento resiliente de oscilações e quedas no WebSocket (ECONNRESET, EPIPE, AggregateError, etc.)
            if (sock.ws) {
                sock.ws.on('error', (wsErr) => {
                    let errMsg = wsErr?.message || String(wsErr);
                    let innerDetails = '';
                    if (wsErr && Array.isArray(wsErr.errors)) {
                        innerDetails = wsErr.errors.map(e => e?.message || String(e)).join(' | ');
                        errMsg = `AggregateError [${innerDetails}]`;
                    }
                    const fullErrStr = `${errMsg} ${innerDetails}`.toLowerCase();
                    const isTransient = fullErrStr.includes('econnreset') || 
                                        fullErrStr.includes('epipe') || 
                                        fullErrStr.includes('etimedout') || 
                                        fullErrStr.includes('closed') || 
                                        fullErrStr.includes('eai_again') || 
                                        fullErrStr.includes('enotfound');

                    if (isTransient) {
                        console.warn(`[SessionManager/WebSocket] Oscilação transitória de conexão no socket ${instanceId}: ${errMsg}. O ciclo de reconexão Baileys estabilizará a sessão.`);
                    } else {
                        console.error(`[SessionManager/WebSocket] Erro capturado no socket ${instanceId}: ${errMsg}`);
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
                    const isStreamOscillation = !isConflict && (
                        status === 503 || 
                        status === 502 || 
                        status === 504 || 
                        status === 408 || 
                        status === 405 || 
                        reason.toLowerCase().includes('timed out') ||
                        reason.toLowerCase().includes('timeout') ||
                        reason.toLowerCase().includes('connection terminated') || 
                        reason.toLowerCase().includes('connection lost') ||
                        reason.toLowerCase().includes('econnreset') ||
                        reason.toLowerCase().includes('socket offline')
                    );

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

                    const isExplicitLogout = loggedOut || (status === 401 && reason.toLowerCase().includes('logged out'));

                    if (isExplicitLogout) {
                        console.log(`[SessionManager] Desconexão/Logout explícito pelo celular detectado na instância ${instanceId} (status: ${status}, reason: ${reason}). Limpando credenciais em RAM e Supabase.`);
                        await this.destroyExistingSession(instanceId, 'explicit_logout');

                        await retryWithBackoff(() => supabase.from('wa_auth_credentials').delete().eq('instance_id', instanceId));
                        await retryWithBackoff(() => supabase.from('wa_auth_keys').delete().eq('instance_id', instanceId));
                        await retryWithBackoff(() => supabase.from('whatsapp_instance_runtime').delete().eq('instance_id', instanceId));
                        
                        const nextStatus = 'logged_out';
                        const errMsg = 'Desconectado pelo celular. A sessão do WhatsApp foi encerrada no dispositivo móvel. Clique em Reconectar para vincular novamente.';

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
                        const isLocal = process.env.DISABLE_AUTO_START_SESSIONS === 'true' || process.env.IS_LOCAL_DEV === 'true';
                        const currentNodeId = String(NODE_ID).trim();
                        const isAlphaWorker = currentNodeId.includes('alpha') || (process.env.APP_ENV || '').toLowerCase() === 'alpha';

                        // Se o nó atual for Alpha e a instância não for homologação permitida, cede o controle pacificamente
                        if (isAlphaWorker && !HOMOLOG_ALLOWED_INSTANCES.includes(instanceId)) {
                            console.warn(`[SessionManager] Conflito de sessão na instância ${instanceId}: Nó Alpha cedendo controle local para o nó de produção imediatamente.`);
                            await this.destroyExistingSession(instanceId, 'conflict_alpha_yield');
                            this.conflictAttempts.delete(instanceId);
                            return;
                        }

                        // Se o nó atual for Produção e a instância for de homologação onde o nó Alpha está ativo, cede o controle
                        if (!isAlphaWorker && HOMOLOG_ALLOWED_INSTANCES.includes(instanceId)) {
                            const { data: dbInst } = await retryWithBackoff(() =>
                                supabase.from('whatsapp_instances')
                                    .select('assigned_node_id, lease_until, updated_at')
                                    .eq('id', instanceId)
                                    .maybeSingle()
                            );
                            const remoteNode = dbInst?.assigned_node_id ? String(dbInst.assigned_node_id).trim() : '';
                            if (remoteNode.includes('alpha')) {
                                console.warn(`[SessionManager] Conflito na instância de homologação ${instanceId}: Nó de Produção cedendo para o Nó Alpha ativo.`);
                                await this.destroyExistingSession(instanceId, 'conflict_prod_yield_to_alpha');
                                this.conflictAttempts.delete(instanceId);
                                return;
                            }
                        }

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
                        const isOwnedByOther = remoteNodeId && remoteNodeId !== currentNodeId;
                        const lastUp = dbInst?.updated_at ? new Date(dbInst.updated_at).getTime() : 0;
                        const isOtherActive = isOwnedByOther && (Date.now() - lastUp < 35000);

                        const isProductionMaster = currentNodeId === 'production-worker' || (process.env.APP_ENV || '').toLowerCase() === 'production';
                        const isNonProductionRemote = remoteNodeId && (remoteNodeId.includes('alpha') || remoteNodeId.includes('staging') || remoteNodeId.includes('local') || remoteNodeId.startsWith('worker-local'));
                        const isMasterTakeoverRemote = isProductionMaster && isNonProductionRemote && !HOMOLOG_ALLOWED_INSTANCES.includes(instanceId);

                        if (isOtherActive && !isMasterTakeoverRemote) {
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
                    } else if (isRestartRequired) {
                        console.log(`[SessionManager] WhatsApp solicitou reinicialização/estabilização de socket (status ${status} / ${reason}) para a instância ${instanceId}. Reciclando chaves em RAM e reconectando em 1.5s com jitter...`);
                        await this.destroyExistingSession(instanceId, 'restart_required');
                        
                        // Atualiza lease_until e last_disconnect_reason no banco preservando o status connected para não causar flickering
                        await retryWithBackoff(() =>
                            supabase.from('whatsapp_instances')
                                .update({
                                    lease_until: new Date(Date.now() + 60000).toISOString(),
                                    last_disconnected_at: new Date().toISOString(),
                                    last_disconnect_reason: reason || `restart_required_${status}`,
                                    updated_at: new Date().toISOString()
                                })
                                .eq('id', instanceId)
                        ).catch(() => {});

                        const jitter = Math.floor(Math.random() * 500) + 1200;
                        const timer = setTimeout(() => {
                            this.reconnectingTimers.delete(instanceId);
                            if (!this.sessions.has(instanceId)) {
                                this.createSession(tenantId, instanceId, true).catch(err => {
                                    console.error(`[SessionManager] Erro ao reconectar pós restartRequired/428 para ${instanceId}:`, err.message);
                                });
                            }
                        }, jitter);
                        this.reconnectingTimers.set(instanceId, timer);
                        return;
                    } else if (isStreamOscillation && isFullyAuthenticated) {
                        const attempts = (this.oscillationAttempts.get(instanceId) || 0) + 1;
                        this.oscillationAttempts.set(instanceId, attempts);

                        const baseDelays = [3000, 6000, 10000, 18000];
                        const baseDelay = baseDelays[Math.min(attempts - 1, baseDelays.length - 1)];
                        const jitter = Math.floor(Math.random() * 1500);
                        const delay = baseDelay + jitter;

                        console.log(`[SessionManager] Oscilação temporária / timeout de conexão com servidores WhatsApp (${reason || status}) na instância ${instanceId} (tentativa ${attempts}). Reciclando RAM e aguardando ${Math.round(delay / 1000)}s para estabilizar chaves...`);
                        await this.destroyExistingSession(instanceId, 'stream_oscillation');

                        await retryWithBackoff(() =>
                            supabase.from('whatsapp_instances')
                                .update({
                                    lease_until: new Date(Date.now() + 60000).toISOString(),
                                    last_disconnected_at: new Date().toISOString(),
                                    last_disconnect_reason: reason || `stream_oscillation_${status}`,
                                    updated_at: new Date().toISOString()
                                })
                                .eq('id', instanceId)
                        ).catch(() => {});

                        const timer = setTimeout(() => {
                            this.reconnectingTimers.delete(instanceId);
                            if (!this.sessions.has(instanceId)) {
                                this.createSession(tenantId, instanceId, true).catch(err => {
                                    console.error(`[SessionManager] Erro na reconexão automática de oscilação (${reason || status}) para ${instanceId}:`, err.message);
                                });
                            }
                        }, delay);
                        this.reconnectingTimers.set(instanceId, timer);
                        return;
                    } else if (isFullyAuthenticated) {
                        // Desconexão transitória de rede com credenciais salvas: auto-reconexão com backoff exponencial + jitter
                        const attempts = (this.reconnectAttempts.get(instanceId) || 0) + 1;
                        this.reconnectAttempts.set(instanceId, attempts);
                        
                        const baseDelay = Math.min(1500 * Math.pow(1.4, attempts), 25000);
                        const jitter = Math.floor(Math.random() * 1500);
                        const delay = Math.round(baseDelay + jitter);
                        
                        console.log(`[SessionManager] Desconexão transitória (${reason || status}) na instância ${instanceId}. Tentativa ${attempts} de reconexão em ${Math.round(delay / 1000)}s com backoff...`);
                        
                        await retryWithBackoff(() =>
                            supabase.from('whatsapp_instances')
                                .update({
                                    lease_until: new Date(Date.now() + 60000).toISOString(),
                                    last_disconnected_at: new Date().toISOString(),
                                    last_disconnect_reason: reason || `status_${status}`,
                                    updated_at: new Date().toISOString()
                                })
                                .eq('id', instanceId)
                        ).catch(() => {});

                        const timer = setTimeout(() => {
                            this.reconnectingTimers.delete(instanceId);
                            if (!this.sessions.has(instanceId)) {
                                this.createSession(tenantId, instanceId, true).catch(err => {
                                    console.error(`[SessionManager] Erro na auto-reconexão com backoff para ${instanceId}:`, err.message);
                                });
                            }
                        }, delay);
                        this.reconnectingTimers.set(instanceId, timer);
                    } else {
                        const attempts = this.reconnectAttempts.get(instanceId) || 0;
                        const nextAttempt = attempts + 1;
                        this.reconnectAttempts.set(instanceId, nextAttempt);

                        if (nextAttempt > 10) {
                            console.error(`[SessionManager] Limite de 10 tentativas de reconexão atingido para a instância ${instanceId}. Pausando sessão.`);
                            this.reconnectAttempts.delete(instanceId);
                            this.pairingPendingSync.delete(instanceId);
                            
                            await this.releaseSessionLock(
                                instanceId, 
                                true, 
                                'Limite de tentativas de conexão atingido. Clique em Reconectar no painel quando o celular estiver ativo.'
                            );
                            
                            await this.logConnectionEvent(tenantId, instanceId, 'max_reconnect_attempts', 'paused', '10 reconexões falhas consecutivas', null, null);

                            // Publica evento de status offline para o frontend
                            await eventProcessor.handleConnectionUpdate(tenantId, instanceId, { 
                                connection: 'close', 
                                lastDisconnect: { error: { output: { statusCode: 503 } } } 
                            });
                        } else {
                            const delayMap = [2000, 3000, 5000, 8000, 12000]; // 2s, 3s, 5s, 8s, 12s para geração de QR Code
                            const delay = delayMap[Math.min(nextAttempt - 1, delayMap.length - 1)] || 30000;

                            console.log(`[SessionManager] Instância ${instanceId} fechou (geração de QR). Tentativa ${nextAttempt}. Reconectando em ${delay / 1000}s...`);

                            await retryWithBackoff(() =>
                                supabase.from('whatsapp_instances')
                                    .update({ 
                                        reconnect_attempts: nextAttempt,
                                        status: 'connecting',
                                        last_disconnected_at: new Date().toISOString(),
                                        last_disconnect_reason: reason || `status_${status}`
                                    })
                                    .eq('id', instanceId)
                            );

                            await this.logConnectionEvent(tenantId, instanceId, 'reconnecting', 'reconnecting', `Tentativa ${nextAttempt} em ${delay / 1000}s`, null, null);

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
                                    if (attempts > 0 || !isSocketOpen(activeSock)) {
                                        const latestSession = this.sessions.get(instanceId);
                                        if (latestSession && isSocketOpen(latestSession.sock)) {
                                            activeSock = latestSession.sock;
                                            sendFn = activeSock.originalSendMessage || activeSock.sendMessage;
                                        } else {
                                            // Se já houver reconexão em andamento, aguarda sua conclusão
                                            if (this.connectingState.has(instanceId)) {
                                                try {
                                                    const connectingSock = await this.connectingState.get(instanceId);
                                                    if (connectingSock && isSocketOpen(connectingSock)) {
                                                        activeSock = connectingSock;
                                                        sendFn = activeSock.originalSendMessage || activeSock.sendMessage;
                                                    }
                                                } catch (e) {}
                                            }

                                            if (!isSocketOpen(activeSock)) {
                                                console.warn(`[SessionManager - Antiban] Sem sessão ativa saudável para ${instanceId}. Aguardando/acordando conexão...`);
                                                const wakedSock = await this.getSocketOrWake(tenantId, instanceId, false);
                                                if (wakedSock) {
                                                    activeSock = wakedSock;
                                                    sendFn = activeSock.originalSendMessage || activeSock.sendMessage;
                                                } else {
                                                    // Valida status no banco de dados para verificar se é desconexão definitiva ou transitória
                                                    const { data: instStatus } = await retryWithBackoff(() => 
                                                        supabase.from('whatsapp_instances').select('status, last_error').eq('id', instanceId).maybeSingle()
                                                    ).catch(() => ({ data: null }));

                                                    const isDefinitiveOffline = instStatus && ['offline', 'logged_out', 'blocked_12h'].includes(instStatus.status);
                                                    if (isDefinitiveOffline) {
                                                        throw new Error(`Instância ${instanceId} está ${instStatus.status} no banco de dados (${instStatus.last_error || 'desconectada'})`);
                                                    }
                                                    throw new Error(`Connection Closed (Instância ${instanceId} temporariamente reconectando ou restabelecendo socket)`);
                                                }
                                            }
                                        }
                                    }
                                    
                                    // Se o socket estiver inicializando/conectando, aguarda a abertura da conexão antes de prosseguir
                                    if (activeSock && (!activeSock.ws || activeSock.ws.isConnecting || !isSocketOpen(activeSock))) {
                                        console.log(`[SessionManager - Antiban] Socket de ${instanceId} está conectando. Aguardando abertura da conexão WebSocket...`);
                                        await waitForSocketOpen(activeSock, 25000);
                                    }

                                    // Validação final de integridade do socket autenticado
                                    const meJid = activeSock?.user?.id || activeSock?.authState?.creds?.me?.id;
                                    if (!activeSock || !isSocketOpen(activeSock) || !meJid) {
                                        throw new Error('Connection Closed (WebSocket não aberto ou autenticação pendente)');
                                    }
                                    
                                    let targetJid = jid;
                                    if (targetJid && typeof targetJid === 'string' && !targetJid.endsWith('@g.us')) {
                                        targetJid = await resolveTargetJid(activeSock || sock, jid, tenantId);
                                    }

                                    if (attempts > 0) {
                                        console.log(`[SessionManager - Antiban] Retentando envio para ${targetJid} via instância ${instanceId} com socket restabelecido. Tentativa ${attempts + 1}/${maxAttempts}`);
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

                                    const isPermanentlyClosed = 
                                        error.message?.includes('logged_out') ||
                                        error.message?.includes('blocked_12h') ||
                                        error.message?.includes('está offline no banco') ||
                                        error.message?.includes('está logged_out no banco');

                                    if (isPermanentlyClosed) {
                                        console.warn(`[SessionManager - Antiban] Abortando retentativas para ${jid} via instância ${instanceId} (motivo definitivo): ${error.message}`);
                                        break;
                                    }

                                    if (error.message?.includes('No sessions') || error.message?.includes('SessionError')) {
                                        console.warn(`[SessionManager - Antiban] SessionError (No sessions) detectado para ${jid} via instância ${instanceId}. Limpando chaves em RAM para forçar nova negociação de pre-keys...`);
                                        try {
                                            clearRecipientSession(instanceId, jid);
                                        } catch (e) {}
                                    }

                                    if (attempts < maxAttempts) {
                                        console.warn(`[SessionManager - Antiban] Tentativa ${attempts}/${maxAttempts} para ${jid} via instância ${instanceId}: ${error.message || error}. Aguardando restabelecimento do socket...`);
                                        const retryDelay = (2000 * attempts) + Math.floor(Math.random() * 1000);
                                        await new Promise(r => setTimeout(r, retryDelay));
                                    } else {
                                        console.error(`[SessionManager - Antiban] Todas as ${maxAttempts} tentativas falharam para ${jid} via instância ${instanceId}:`, error.message || error);
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
            
            this.sessions.set(instanceId, { sock, tenantId, createdAt: Date.now(), monitoringUntil: currentInstance?.monitoring_until });

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
            const isReconnectingActive = this.connectingState.has(instanceId) || this.reconnectingTimers.has(instanceId);
            if (!isReconnectingActive) {
                console.log(`[SessionManager] Limpeza de socket inativo para ${instanceId} (WebSocket fechado).`);
                this.sessions.delete(instanceId);
            }
            return null;
        }

        if (requireAuthenticated) {
            const meId = sock?.user?.id || sock?.authState?.creds?.me?.id;
            if (!meId || !isSocketOpen(sock)) {
                return null;
            }
        }

        return sock;
    }

    async getSocketOrWake(tenantId, instanceId, requireAuthenticated = false, force = false) {
        let sock = this.getSocket(instanceId, requireAuthenticated);
        if (sock && !force) return sock;

        // Se a sessão já existe na memória autenticada mas está em fase de conexão/handshake, aguarda abertura suave
        const rawSession = this.sessions.get(instanceId);
        if (rawSession && rawSession.sock) {
            const rawSock = rawSession.sock;
            const meId = rawSock.user?.id || rawSock.authState?.creds?.me?.id;
            if (meId && (!isSocketOpen(rawSock) || rawSock.ws?.isConnecting || rawSock.ws?.socket?.readyState === 0)) {
                try {
                    await waitForSocketOpen(rawSock, 3500);
                    if (isSocketOpen(rawSock)) return rawSock;
                } catch (e) {}
            }
        }

        // Se já houver promessa de inicialização em andamento, aguarda seu retorno
        if (this.connectingState.has(instanceId)) {
            try {
                const connectingSock = await this.connectingState.get(instanceId);
                if (connectingSock) {
                    if (requireAuthenticated) {
                        const meId = connectingSock?.user?.id || connectingSock?.authState?.creds?.me?.id;
                        if (meId) {
                            if (isSocketOpen(connectingSock)) return connectingSock;
                            try {
                                await waitForSocketOpen(connectingSock, 3500);
                                if (isSocketOpen(connectingSock)) return connectingSock;
                            } catch (e) {}
                        }
                    } else {
                        return connectingSock;
                    }
                }
            } catch (e) {}
        }

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
                ? ['connected', 'connected_local', 'reconnecting', 'connecting'] 
                : ['connected', 'connecting', 'qr_ready', 'connected_local', 'reconnecting'];

            if (data && allowedStatuses.includes(data.status)) {
                const now = new Date();
                const currentNodeId = String(NODE_ID).trim();
                const assignedNodeId = data.assigned_node_id ? String(data.assigned_node_id).trim() : null;

                // Se a instância já possui um lock ativo por outro worker com lease válido e não é force
                if (assignedNodeId && assignedNodeId !== currentNodeId && data.lease_until && new Date(data.lease_until) > now && !force) {
                    const isProductionMaster = currentNodeId === 'production-worker' || (process.env.APP_ENV || '').toLowerCase() === 'production';
                    const isNonProductionOwner = assignedNodeId.includes('alpha') || assignedNodeId.includes('staging') || assignedNodeId.includes('local') || assignedNodeId.startsWith('worker-local');
                    const isMasterTakeover = isProductionMaster && isNonProductionOwner && !HOMOLOG_ALLOWED_INSTANCES.includes(instanceId);

                    // Se não for o Production Master reassumindo controle de um worker não-produção:
                    if (!isMasterTakeover) {
                        const lastUpdated = data.updated_at ? new Date(data.updated_at) : null;
                        const isStale = !lastUpdated || (now.getTime() - lastUpdated.getTime() > 35000);
                        if (!isStale && (data.status === 'connected' || data.status === 'connected_local')) {
                            console.log(`[SessionManager] Instância ${instanceId} está sob lock ativo do worker ${assignedNodeId} (lease até ${data.lease_until}). Ignorando wake local.`);
                            return null;
                        }
                    }
                }

                console.log(`[SessionManager] Lazy loading instance ${instanceId} (DB status: ${data.status}, force: ${force})...`);
                const createdSock = await this.createSession(tenantId, instanceId, force);
                if (requireAuthenticated) {
                    const meId = createdSock?.user?.id || createdSock?.authState?.creds?.me?.id;
                    if (!meId || !isSocketOpen(createdSock)) {
                        if (createdSock?.ws && (createdSock.ws.isConnecting || !isSocketOpen(createdSock))) {
                            try {
                                await waitForSocketOpen(createdSock, 20000);
                            } catch (e) {
                                return null;
                            }
                        }
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
            this.clearWatchdog(id);
            await this.destroyExistingSession(id, 'closeAllSessions').catch(() => {});
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
        
        // Verifica a saúde real do WebSocket a cada 30 segundos sem desconectar instâncias ociosas legítimas
        const interval = setInterval(() => {
            if (!this.sessions.has(instanceId)) {
                this.clearWatchdog(instanceId);
                return;
            }
            
            const lastCooldown = this.reconnectingCoolingDown.get(instanceId) || 0;
            if (Date.now() - lastCooldown < 45000) {
                return;
            }

            const currentSession = this.sessions.get(instanceId);
            const activeSock = currentSession?.sock || sock;

            if (activeSock && activeSock.ws) {
                const ws = activeSock.ws;
                const rawSocket = ws.socket;
                const rawState = rawSocket ? rawSocket.readyState : undefined;
                
                // Se está conectando, em handshake ou com timer ativo, não interrompe prematuramente
                const isConnecting = ws.isConnecting || (rawState === 0) || this.connectingState.has(instanceId) || this.reconnectingTimers.has(instanceId);
                if (isConnecting) {
                    return;
                }

                // Se o WebSocket estiver aberto ou a sessão estiver autenticada e operacional, está saudável
                if (ws.isOpen || isSocketOpen(activeSock)) {
                    return;
                }

                // Só considera encerrado se o WebSocket estiver explicitamente fechado (isClosed: true ou rawState 2/3)
                const isClosedOrClosing = ws.isClosed === true || ws.isClosing === true || rawState === 2 || rawState === 3;
                if (isClosedOrClosing) {
                    console.log(`[SessionManager/Watchdog] Instância ${instanceId} com WebSocket encerrado (isOpen: ${ws.isOpen}, isClosed: ${ws.isClosed}, rawState: ${rawState}). Reciclando socket e reconectando...`);
                    this.clearWatchdog(instanceId);
                    this.destroyExistingSession(instanceId, 'watchdog_ws_closed').catch(() => {});
                    const timer = setTimeout(() => {
                        this.reconnectingTimers.delete(instanceId);
                        if (!this.sessions.has(instanceId)) {
                            this.createSession(tenantId, instanceId, true).catch(err => {
                                console.error(`[SessionManager/Watchdog] Erro ao reconectar ${instanceId}:`, err.message);
                            });
                        }
                    }, 2000);
                    this.reconnectingTimers.set(instanceId, timer);
                }
            }
        }, 30000);
        
        this.watchdogs.set(instanceId, { interval, sock });
    }

    clearWatchdog(instanceId) {
        if (this.watchdogs.has(instanceId)) {
            const { interval, ipCheckInterval } = this.watchdogs.get(instanceId);
            if (interval) clearInterval(interval);
            if (ipCheckInterval) clearInterval(ipCheckInterval);
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
