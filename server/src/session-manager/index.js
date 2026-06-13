import { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import { useSupabaseAuthState } from './auth.js';
import eventProcessor from '../event-processor/index.js';
import { addLog } from '../system-logger.js';
import pino from 'pino';
import { supabase } from '../supabase.js';

class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.connectingState = new Map();
        this.reconnectAttempts = new Map();
        this.conflictAttempts = new Map();
        this.conflictTimeouts = new Map();
        this.queues = new Map();
        
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
    }

    async createSession(tenantId, instanceId) {
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
                browser: Browsers.ubuntu('Chrome'),
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                markOnlineOnConnect: true,
                emitOwnEvents: true,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 25000,
                defaultQueryTimeoutMs: 120000,
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
                    this.reconnectAttempts.delete(instanceId);
                    
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
                    // Clear stable connection timeout if it disconnected early
                    if (this.conflictTimeouts.has(instanceId)) {
                        clearTimeout(this.conflictTimeouts.get(instanceId));
                        this.conflictTimeouts.delete(instanceId);
                    }

                    const status = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error?.message || '';
                    const loggedOut = status === DisconnectReason.loggedOut;
                    const isConflict = status === 440 || reason.includes('conflict') || reason.includes('replaced');

                    this.sessions.delete(instanceId);

                    if (loggedOut || status === 401 || status === 403 || status === 400) {
                        console.log(`[SessionManager] Instância ${instanceId} desconectada ou erro crítico (status: ${status}). Limpando credenciais.`);
                        await supabase.from('wa_auth_credentials').delete().eq('instance_id', instanceId);
                        await supabase.from('wa_auth_keys').delete().eq('instance_id', instanceId);
                        await supabase.from('whatsapp_instance_runtime').delete().eq('instance_id', instanceId);
                        
                        this.reconnectAttempts.delete(instanceId);
                        // Tentar reconectar limpo após 5s
                        setTimeout(() => this.createSession(tenantId, instanceId), 5000);
                    } else if (isConflict) {
                        const cAttempts = (this.conflictAttempts.get(instanceId) || 0) + 1;
                        this.conflictAttempts.set(instanceId, cAttempts);
                        this.reconnectAttempts.delete(instanceId);

                        if (cAttempts >= 3) {
                            console.error(`[SessionManager] Limite de conflitos atingido na instância ${instanceId}. Interrompendo reconexão automática para evitar banimento.`);
                            await supabase.from('whatsapp_instances')
                                .update({ 
                                    status: 'offline', 
                                    last_error: 'Desconectado por conflito. Outro dispositivo se conectou a esta conta de WhatsApp. O sistema interrompeu as reconexões automáticas para evitar banimento. Reconecte manualmente no painel.' 
                                })
                                .eq('id', instanceId);
                            
                            // Publica evento de status offline para o frontend
                            await eventProcessor.handleConnectionUpdate(tenantId, instanceId, { 
                                connection: 'close', 
                                lastDisconnect: { error: { output: { statusCode: 409 } } } 
                            });
                        } else {
                            console.warn(`[SessionManager] CONFLITO detectado na instância ${instanceId} (Tentativa ${cAttempts}/3). Outro dispositivo conectou? Aguardando 30s antes de tentar novamente...`);
                            setTimeout(() => this.createSession(tenantId, instanceId), 30000);
                        }
                    } else {
                        const attempts = this.reconnectAttempts.get(instanceId) || 0;
                        const nextAttempt = attempts + 1;
                        this.reconnectAttempts.set(instanceId, nextAttempt);

                        // Rastrear se é erro 503 da Meta (temporariamente indisponível ou rate limit)
                        const is503 = status === 503 || reason.includes('503') || JSON.stringify(lastDisconnect?.error).includes('503');

                        const baseDelay = is503 ? 15000 : 5000;
                        const maxDelay = is503 ? 120000 : 60000;
                        const delay = Math.min(baseDelay * Math.pow(2, attempts), maxDelay);

                        console.log(`[SessionManager] Instância ${instanceId} fechou. Motivo: ${status} (Erro 503: ${is503}). Tentativa ${nextAttempt}. Reconectando em ${delay / 1000}s...`);

                        if (is503) {
                            await supabase.from('whatsapp_instances')
                                .update({ 
                                    last_error: `WhatsApp temporariamente indisponível (Erro 503). Próxima tentativa de reconexão em ${delay / 1000}s (Tentativa ${nextAttempt}).`
                                })
                                .eq('id', instanceId);
                        }

                        setTimeout(() => this.createSession(tenantId, instanceId), delay);
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
                            console.log(`[SessionManager - Antiban] Enviando mensagem na fila para ${jid} via instância ${instanceId} com delay de ${delay}ms`);
                            const result = await originalSendMessage(jid, content, options);
                            resolve(result);
                        } catch (error) {
                            console.error(`[SessionManager - Antiban] Erro ao enviar mensagem na fila para ${jid} via instância ${instanceId}:`, error);
                            reject(error);
                        } finally {
                            // Independente de sucesso ou falha, resolve a fila interna para permitir o próximo envio
                            resolveQueue();
                        }
                    }, delay);
                });
            };
            
            this.sessions.set(instanceId, { sock, tenantId });

            await supabase.from('whatsapp_instances').update({
                assigned_node_id: 'worker-1',
                lease_until: new Date(Date.now() + 60000).toISOString()
            }).eq('id', instanceId);

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
        if (sock.ws && (sock.ws.readyState === 2 || sock.ws.readyState === 3)) {
            console.warn(`[SessionManager] Detectado socket zumbi para ${instanceId} com WebSocket fechado/fechando (readyState: ${sock.ws.readyState}). Descartando.`);
            this.sessions.delete(instanceId);
            return null;
        }

        return sock;
    }

    async getSocketOrWake(tenantId, instanceId) {
        let sock = this.getSocket(instanceId);
        if (sock) return sock;

        // Se estiver configurado para desativar auto-start (ambiente local de desenvolvimento),
        // não acorda a instância automaticamente para evitar conflito com o servidor de produção.
        if (process.env.DISABLE_AUTO_START_SESSIONS === 'true') {
            console.log(`[SessionManager] getSocketOrWake ignorado para evitar conflito com a produção (DISABLE_AUTO_START_SESSIONS=true): ${instanceId}`);
            return null;
        }

        // Fallback para acordar a instância (Lazy Load) se o Node foi reiniciado
        const { data } = await supabase.from('whatsapp_instances').select('status').eq('id', instanceId).single();
        if (data && ['connected', 'connecting', 'qr_ready'].includes(data.status)) {
            console.log(`[SessionManager] Lazy loading instance ${instanceId} (DB status: ${data.status})...`);
            return await this.createSession(tenantId, instanceId);
        }
        
        return null;
    }

    async closeSession(instanceId) {
        const data = this.sessions.get(instanceId);
        if (data && data.sock) {
            try { data.sock.ws.close(); } catch(e){}
            this.sessions.delete(instanceId);
            
            await supabase.from('whatsapp_instances').update({
                status: 'offline',
                assigned_node_id: null
            }).eq('id', instanceId);
        }
    }
}

export default new SessionManager();
