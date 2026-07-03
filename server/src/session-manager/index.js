import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import { useSupabaseAuthState, flushPendingWrites } from './auth.js';
import eventProcessor from '../event-processor/index.js';
import { addLog } from '../system-logger.js';
import pino from 'pino';
import { supabase, NODE_ID, retryWithBackoff } from '../supabase.js';

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
        
        // Pino stream configurado para enviar logs para nosso SSE e para o stdout
        const pinoStream = {
            write: (msg) => {
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
                        'Stream Errored (conflict)'
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

                    const lvl = parsed.level >= 50 ? 'error' : parsed.level >= 40 ? 'warn' : 'info';
                    addLog(lvl, `[Baileys] ${parsed.msg || ''} ${JSON.stringify(parsed, (k,v) => ['msg','level','time','pid','hostname'].includes(k) ? undefined : v)}`);
                } catch(e) {
                    addLog('info', `[Baileys] ${msg.trim()}`);
                }
                process.stdout.write(msg);
            }
        };

        this.logger = pino({ level: 'info' }, pinoStream);

        // Loop de renovação do Lease (Heartbeat) - roda a cada 30 segundos
        setInterval(async () => {
            const activeIds = Array.from(this.sessions.keys());
            if (activeIds.length > 0) {
                try {
                    await retryWithBackoff(() =>
                        supabase.from('whatsapp_instances')
                            .update({
                                lease_until: new Date(Date.now() + 60000).toISOString()
                            })
                            .in('id', activeIds)
                            .eq('assigned_node_id', NODE_ID)
                    );
                } catch (e) {
                    console.error("[SessionManager/Heartbeat] Erro ao renovar leases:", e.message);
                }
            }
        }, 30000);
    }

    async createSession(tenantId, instanceId) {
        if (this.reconnectingTimers.has(instanceId)) {
            const timer = this.reconnectingTimers.get(instanceId);
            clearTimeout(timer);
            this.reconnectingTimers.delete(instanceId);
            console.log(`[SessionManager] Antecipando/limpando timer de reconexão pendente para a instância ${instanceId}.`);
        }

        if (this.sessions.has(instanceId)) {
            console.log(`[SessionManager] Sessão ${instanceId} já estava em memória.`);
            return this.sessions.get(instanceId).sock;
        }

        if (this.connectingState.has(instanceId)) {
            return this.connectingState.get(instanceId);
        }

        console.log(`[SessionManager] Iniciando sessão para Instance: ${instanceId} | Tenant: ${tenantId}`);

        const promise = this._createSessionInner(tenantId, instanceId);
        this.connectingState.set(instanceId, promise);
        
        try {
            return await promise;
        } finally {
            this.connectingState.delete(instanceId);
        }
    }

    async _createSessionInner(tenantId, instanceId) {
        try {
            // Verifica se a instância ainda existe no banco de dados para evitar violação de chave estrangeira
            const { data: instance, error: findError } = await retryWithBackoff(() =>
                supabase
                    .from('whatsapp_instances')
                    .select('id')
                    .eq('id', instanceId)
                    .single()
            );

            if (findError || !instance) {
                const errorMsg = `Instância ${instanceId} não encontrada no banco de dados (provavelmente deletada).`;
                console.warn(`[SessionManager] Abortando criação de sessão: ${errorMsg}`);
                throw new Error(errorMsg);
            }

            // Assume o lease e trava a posse do worker antes de iniciar
            await retryWithBackoff(() =>
                supabase.from('whatsapp_instances').update({
                    assigned_node_id: NODE_ID,
                    lease_until: new Date(Date.now() + 60000).toISOString()
                }).eq('id', instanceId)
            );

            const { state, saveCreds } = await useSupabaseAuthState(tenantId, instanceId);
            const { version, isLatest } = await fetchLatestBaileysVersion();
            
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
                browser: ['Mac OS', 'Chrome', '131.0.0.0'],
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                markOnlineOnConnect: true,
                emitOwnEvents: true,
                connectTimeoutMs: 90000,
                keepAliveIntervalMs: 15000,
                defaultQueryTimeoutMs: 90000,
                retryRequestDelayMs: 10000,
                maxMsgRetryCount: 0, // Desativado para evitar loops de retry em grupos que causam BAN
                msgRetryCounterCache,
                getMessage: async (key) => {
                    return { conversation: 'MENSAGEM_RECUPEERADA_COM_FALHA' };
                }
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                await eventProcessor.handleConnectionUpdate(tenantId, instanceId, update);

                const { connection, lastDisconnect } = update;
                if (connection === 'open') {
                    this.startWatchdog(tenantId, instanceId, sock);
                    
                    // Proteção contra duplicação de chip (mesmo número em múltiplas instâncias)
                    const ownerJid = sock.user?.id;
                    if (ownerJid) {
                        const ownerPhone = ownerJid.split('@')[0].split(':')[0];
                        console.log(`[SessionManager] Instância ${instanceId} conectada com sucesso. Telefone: ${ownerPhone}`);
                        
                        // Varre o cache em memória buscando outras sessões com o mesmo telefone
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
                    this.clearWatchdog(instanceId);
                    
                    // Clear stable connection timeouts if it disconnected early
                    if (this.conflictTimeouts.has(instanceId)) {
                        clearTimeout(this.conflictTimeouts.get(instanceId));
                        this.conflictTimeouts.delete(instanceId);
                    }
                    if (this.reconnectTimeouts.has(instanceId)) {
                        clearTimeout(this.reconnectTimeouts.get(instanceId));
                        this.reconnectTimeouts.delete(instanceId);
                    }

                    const status = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error?.message || '';
                    const loggedOut = status === DisconnectReason.loggedOut;
                    const isConflict = status === 440 || reason.includes('conflict') || reason.includes('replaced');

                    this.sessions.delete(instanceId);

                    const hasOwner = !!(sock?.user?.id || state?.creds?.me?.id);
                    if ((loggedOut || status === 401 || status === 403 || status === 400) && hasOwner) {
                        console.log(`[SessionManager] Instância ${instanceId} desconectada ou erro crítico (status: ${status}) com dono ativo. Limpando credenciais.`);
                        await retryWithBackoff(() => supabase.from('wa_auth_credentials').delete().eq('instance_id', instanceId));
                        await retryWithBackoff(() => supabase.from('wa_auth_keys').delete().eq('instance_id', instanceId));
                        await retryWithBackoff(() => supabase.from('whatsapp_instance_runtime').delete().eq('instance_id', instanceId));
                        
                        this.reconnectAttempts.delete(instanceId);
                        // Tentar reconectar limpo após 5s
                        const timer = setTimeout(() => {
                            this.reconnectingTimers.delete(instanceId);
                            this.createSession(tenantId, instanceId);
                        }, 5000);
                        this.reconnectingTimers.set(instanceId, timer);
                    } else if (loggedOut || status === 401 || status === 403 || status === 400) {
                        console.log(`[SessionManager] Instância ${instanceId} desconectada (status: ${status}) sem dono configurado (provável pareamento em andamento). Mantendo credenciais.`);
                        this.reconnectAttempts.delete(instanceId);
                        // Tentar reconectar usando as credenciais que estão sendo pareadas/preparadas
                        const timer = setTimeout(() => {
                            this.reconnectingTimers.delete(instanceId);
                            this.createSession(tenantId, instanceId);
                        }, 5000);
                        this.reconnectingTimers.set(instanceId, timer);
                    } else if (isConflict) {
                        const isLocal = process.env.DISABLE_AUTO_START_SESSIONS === 'true';
                        const cAttempts = (this.conflictAttempts.get(instanceId) || 0) + 1;
                        this.conflictAttempts.set(instanceId, cAttempts);
                        this.reconnectAttempts.delete(instanceId);

                        if (cAttempts >= 3 || isLocal) {
                            console.error(`[SessionManager] ${isLocal ? 'Ambiente local detectado. Cancelando reconexão de conflito imediatamente para não derrubar a produção.' : `Limite de conflitos atingido na instância ${instanceId}. Interrompendo reconexão automática para evitar banimento.`}`);
                            
                            if (!isLocal) {
                                await retryWithBackoff(() =>
                                    supabase.from('whatsapp_instances')
                                        .update({ 
                                            status: 'offline', 
                                            last_error: 'Desconectado por conflito. Outro dispositivo se conectou a esta conta de WhatsApp. O sistema interrompeu as reconexões automáticas para evitar banimento. Reconecte manualmente no painel.' 
                                        })
                                        .eq('id', instanceId)
                                        .eq('assigned_node_id', NODE_ID)
                                );
                            }
                            
                            // Publica evento de status offline para o frontend
                            await eventProcessor.handleConnectionUpdate(tenantId, instanceId, { 
                                connection: 'close', 
                                lastDisconnect: { error: { output: { statusCode: 409 } } } 
                            });
                        } else {
                            console.warn(`[SessionManager] CONFLITO detectado na instância ${instanceId} (Tentativa ${cAttempts}/3). Outro dispositivo conectou? Aguardando 30s antes de tentar novamente...`);
                            const timer = setTimeout(() => {
                                this.reconnectingTimers.delete(instanceId);
                                this.createSession(tenantId, instanceId);
                            }, 30000);
                            this.reconnectingTimers.set(instanceId, timer);
                        }
                    } else {
                        const attempts = this.reconnectAttempts.get(instanceId) || 0;
                        const nextAttempt = attempts + 1;
                        this.reconnectAttempts.set(instanceId, nextAttempt);

                        if (nextAttempt >= 10) {
                            console.error(`[SessionManager] Limite de 10 tentativas de reconexão consecutivas atingido para a instância ${instanceId}. Interrompendo reconexões para evitar banimento.`);
                            this.reconnectAttempts.delete(instanceId);
                            
                            await retryWithBackoff(() =>
                                supabase.from('whatsapp_instances')
                                    .update({ 
                                        status: 'offline', 
                                        last_error: 'Falha persistente de conexão (10 tentativas consecutivas falhas). O sistema interrompeu as reconexões automáticas para evitar o banimento do seu chip. Por favor, verifique se o celular está conectado à internet ou reconecte manualmente no painel.' 
                                    })
                                    .eq('id', instanceId)
                            );
                            
                            // Publica evento de status offline para o frontend
                            await eventProcessor.handleConnectionUpdate(tenantId, instanceId, { 
                                connection: 'close', 
                                lastDisconnect: { error: { output: { statusCode: 503 } } } 
                            });
                        } else {
                            // Rastrear se é erro 503 da Meta (temporariamente indisponível ou rate limit)
                            const is503 = status === 503 || reason.includes('503') || JSON.stringify(lastDisconnect?.error).includes('503');

                            const baseDelay = is503 ? 15000 : 5000;
                            const maxDelay = is503 ? 120000 : 60000;
                            const delay = Math.min(baseDelay * Math.pow(2, attempts), maxDelay);

                            console.log(`[SessionManager] Instância ${instanceId} fechou. Motivo: ${status} (Erro 503: ${is503}). Tentativa ${nextAttempt}/10. Reconectando em ${delay / 1000}s...`);

                            await retryWithBackoff(() =>
                                supabase.from('whatsapp_instances')
                                    .update({ 
                                        last_error: `Conexão instável (Erro ${status || 'N/A'}). Tentando reconectar em ${delay / 1000}s (Tentativa ${nextAttempt}/10).`
                                    })
                                    .eq('id', instanceId)
                            );

                            const timer = setTimeout(() => {
                                this.reconnectingTimers.delete(instanceId);
                                this.createSession(tenantId, instanceId);
                            }, delay);
                            this.reconnectingTimers.set(instanceId, timer);
                        }
                    }
                }
            });

            sock.ev.on('messaging-history.set', async (history) => {
                await eventProcessor.handleMessagingHistorySet(tenantId, instanceId, sock, history);
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
                                            const wakedSock = await this.getSocketOrWake(tenantId, instanceId);
                                            if (wakedSock) {
                                                activeSock = wakedSock;
                                                sendFn = activeSock.originalSendMessage || activeSock.sendMessage;
                                            }
                                        }
                                    }
                                    
                                    // Se o socket estiver inicializando/conectando, aguarda a abertura da conexão antes de prosseguir
                                    if (activeSock && (!activeSock.ws || activeSock.ws.isConnecting)) {
                                        console.log(`[SessionManager - Antiban] Socket de ${instanceId} está conectando. Aguardando conexão abrir...`);
                                        await waitForSocketOpen(activeSock);
                                    }

                                    // Se mesmo assim o socket ativo não estiver saudável, lança erro para forçar retentativa ou falhar
                                    if (!activeSock || !activeSock.ws || !activeSock.ws.isOpen) {
                                        throw new Error('Connection Closed (WebSocket not open or unhealthy)');
                                    }
                                    
                                    if (attempts > 0) {
                                        console.log(`[SessionManager - Antiban] Retentando envio para ${jid} via instância ${instanceId} com socket atualizado. Tentativa ${attempts + 1}/${maxAttempts}`);
                                    } else {
                                        console.log(`[SessionManager - Antiban] Enviando mensagem na fila para ${jid} via instância ${instanceId} com delay de ${delay}ms`);
                                    }
                                    
                                    const result = await sendFn(jid, content, options);
                                    resolve(result);
                                    return; // Sucesso, interrompe o loop
                                } catch (error) {
                                    lastError = error;
                                    attempts++;
                                    console.error(`[SessionManager - Antiban] Erro na tentativa ${attempts}/${maxAttempts} para ${jid} via instância ${instanceId}:`, error.message || error);
                                    
                                    if (attempts < maxAttempts) {
                                        const retryDelay = 3000 * attempts;
                                        await new Promise(r => setTimeout(r, retryDelay));
                                    }
                                }
                            }
                            
                            console.error(`[SessionManager - Antiban] Todas as ${maxAttempts} tentativas falharam para ${jid} via instância ${instanceId}.`);
                            reject(lastError);
                        } finally {
                            // Independente de sucesso ou falha, resolve a fila interna para permitir o próximo envio
                            resolveQueue();
                        }
                    }, delay);
                });
            };
            
            this.sessions.set(instanceId, { sock, tenantId });

            await retryWithBackoff(() =>
                supabase.from('whatsapp_instances').update({
                    assigned_node_id: NODE_ID,
                    lease_until: new Date(Date.now() + 60000).toISOString()
                }).eq('id', instanceId)
            );

            return sock;
        } catch (error) {
            console.error(`[SessionManager] Falha ao inciar sessão ${instanceId}`, error);
            throw error;
        }
    }

    getSocket(instanceId) {
        const data = this.sessions.get(instanceId);
        if (!data || !data.sock) return null;

        const sock = data.sock;
        // Valida se o WebSocket está saudável (não está CLOSING nem CLOSED)
        if (sock.ws && (sock.ws.isClosing || sock.ws.isClosed)) {
            console.warn(`[SessionManager] Detectado socket zumbi para ${instanceId} com WebSocket fechado/fechando. Descartando.`);
            this.sessions.delete(instanceId);
            return null;
        }

        return sock;
    }

    async getSocketOrWake(tenantId, instanceId) {
        let sock = this.getSocket(instanceId);
        if (sock) return sock;

        // Se estiver configurado para desativar auto-start (ambiente local de desenvolvimento),
        // permitimos o lazy loading sob demanda quando o desenvolvedor interage ativamente,
        // mas o auto-start em lote na inicialização do servidor continuará desativado.

        // Fallback para acordar a instância (Lazy Load) se o Node foi reiniciado
        const { data } = await retryWithBackoff(() => supabase.from('whatsapp_instances').select('status').eq('id', instanceId).single());
        if (data && ['connected', 'connecting', 'qr_ready', 'connected_local'].includes(data.status)) {
            console.log(`[SessionManager] Lazy loading instance ${instanceId} (DB status: ${data.status})...`);
            return await this.createSession(tenantId, instanceId);
        }
        
        return null;
    }

    async closeSession(instanceId) {
        this.clearWatchdog(instanceId);
        
        // Cancela qualquer timer de reconexão pendente
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
        this.reconnectAttempts.delete(instanceId);
        this.conflictAttempts.delete(instanceId);
        
        // Sincroniza qualquer chave pendente na fila de batch antes de fechar a sessão
        try {
            await flushPendingWrites(instanceId);
        } catch (syncErr) {
            console.error(`[SessionManager] Erro ao sincronizar chaves antes de fechar sessão ${instanceId}:`, syncErr.message);
        }

        const data = this.sessions.get(instanceId);
        if (data && data.sock) {
            try { data.sock.ws.close(); } catch(e){}
            this.sessions.delete(instanceId);
            
            await retryWithBackoff(() =>
                supabase.from('whatsapp_instances').update({
                    status: 'offline',
                    assigned_node_id: null
                }).eq('id', instanceId)
                .eq('assigned_node_id', NODE_ID)
            );
        }
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
            const { interval, updateListener, sock } = this.watchdogs.get(instanceId);
            clearInterval(interval);
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
}

export default new SessionManager();
