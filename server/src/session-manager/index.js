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
        
        // Pino stream configurado para enviar logs para nosso SSE e para o stdout
        const pinoStream = {
            write: (msg) => {
                try {
                    const parsed = JSON.parse(msg);
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

            const sock = createSocket({
                version,
                logger: this.logger,
                printQRInTerminal: false,
                auth: state,
                browser: Browsers.ubuntu('Chrome'),
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                markOnlineOnConnect: true,
                shouldSyncHistoryMessage: () => false, // Impede que o socket trave no buffer esperando evento de sync timeout (60s)
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 25000,
                defaultQueryTimeoutMs: 120000,
                retryRequestDelayMs: 5000,
                maxMsgRetryCount: 5
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                await eventProcessor.handleConnectionUpdate(tenantId, instanceId, update);

                const { connection, lastDisconnect } = update;
                if (connection === 'close') {
                    const status = lastDisconnect?.error?.output?.statusCode;
                    const loggedOut = status === DisconnectReason.loggedOut;

                    this.sessions.delete(instanceId);

                    if (loggedOut || status === 401 || status === 403 || status === 400) {
                        console.log(`[SessionManager] Instância ${instanceId} desconectada ou erro crítico (status: ${status}). Limpando credenciais.`);
                        await supabase.from('wa_auth_credentials').delete().eq('instance_id', instanceId);
                        await supabase.from('wa_auth_keys').delete().eq('instance_id', instanceId);
                        await supabase.from('whatsapp_instance_runtime').delete().eq('instance_id', instanceId);
                        
                        // Tentar reconectar limpo após 5s
                        setTimeout(() => this.createSession(tenantId, instanceId), 5000);
                    } else {
                        console.log(`[SessionManager] Instância ${instanceId} fechou. Motivo: ${status}. Tentando reconectar em 5s...`);
                        setTimeout(() => this.createSession(tenantId, instanceId), 5000);
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
        return this.sessions.get(instanceId)?.sock;
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
