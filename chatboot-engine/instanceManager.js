const { makeWASocket, DisconnectReason, makeInMemoryStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { useSupabaseAuthState } = require('./supaAuthState');
const { supabase } = require('./supabase');
const QRCodeLib = require('qrcode');

class InstanceManager {
    constructor() {
        // Guarda na RAM as instâncias online por Tenant ID
        this.sessions = new Map();
        // Guarda buffers de QR Codes
        this.qrs = new Map();
        // Guarda o histórico sincronizado para simular a Evolution API
        this.stores = new Map();
    }

    /**
     * Inicializa ou restaura a sessão de um Tenant
     */
    async createSession(tenantId, forceReset = false) {
        
        // Proteção contra sessão ZUMBI presa na RAM:
        // Se a Engine já existia mas deram trigger na UI pra 'Acionar', destrói a antiga pra obrigar o Baileys a disparar evento de QR zero-bala.
        if (this.sessions.has(tenantId)) {
            console.log(`[${tenantId}] Derrubando Instância Zumbi para recriar Motor novo!`);
            const oldSock = this.sessions.get(tenantId);
            try {
                oldSock?.ws?.close(); // Corta o socket físico
            } catch(e) {}
            this.sessions.delete(tenantId);
            this.qrs.delete(tenantId);
        }

        if (forceReset) {
            console.log(`[${tenantId}] FORCE RESET START! Apagando db para o QR Code nascer...`);
            const { error: delErr } = await supabase.from('wa_auth_states').delete().eq('tenant_id', tenantId);
            if(delErr) console.error(`[${tenantId}] Erro ao deletar no Supabase:`, delErr);
            else console.log(`[${tenantId}] DELETE SUCCESSFUL! DB ESTÁ LIMPO!`);
        }

        const storePath = `./store-${tenantId}.json`;
        let store = this.stores.get(tenantId);
        if(!store) {
            store = makeInMemoryStore({});
            try { store.readFromFile(storePath); } catch(e) {}
            
            setInterval(() => {
                try { store.writeToFile(storePath); } catch(e) {}
            }, 10000);

            this.stores.set(tenantId, store);
        }

        const { state, saveCreds, clearState } = await useSupabaseAuthState(supabase, tenantId);
        const { fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`[${tenantId}] WhatsApp Web Core Engine Version: ${version.join('.')} (Latest: ${isLatest})`);

        const NodeCache = require('node-cache');
        const msgRetryCounterCache = new NodeCache();

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true, // Pra vermos no console Windows/Nuvem
            version: version, // Resolve o 405 Method Not Allowed forçando última versão WA Web
            browser: Browsers.macOS('Desktop'), // Camufla a assinatura na RAM
            syncFullHistory: false, // Desativado para evitar sobrecarga (TimeOut 500) e erro na Stream (xml-not-well-formed)
            generateHighQualityLinkPreview: false, // Desativa para salvar RAM
            markOnlineOnConnect: true, // Marca como online assim que conecta
            msgRetryCounterCache,
            getMessage: async (key) => {
                if (store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || undefined;
                }
                return { conversation: 'hello' };
            }
        });

        store.bind(sock.ev);
        sock.isConnectionFullyOpen = false; // Propriedade Customizada Anti-Timeout
        this.sessions.set(tenantId, sock);

        // EVENTOS DE CONEXÃO
        sock.ev.on('connection.update', async (update) => {
            console.log(`[${tenantId}] CONNECTION UPDATE EVENT FIRED >>`, JSON.stringify(update));
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                try {
                    // Transmuta String Pura do Baileys para Imagem de Base64 consumível pelo Web-React
                    const base64Image = await QRCodeLib.toDataURL(qr, { errorCorrectionLevel: 'H' });
                    this.qrs.set(tenantId, base64Image); 
                    console.log(`[${tenantId}] QR Code Limpo Gerado para API Local/Nuvem!`);
                    
                    // Atualiza o banco de dados marcando que estamos conectando/aguardando QR
                    await supabase.from('whatsapp_instances').update({
                        status: 'connecting',
                        updated_at: new Date()
                    }).eq('id', tenantId);

                } catch(err) {
                    console.error('Falha de transcrição QR', err);
                }
            }

            if (connection === 'close') {
                const errStatus = lastDisconnect?.error?.output?.statusCode;
                const isLoggedOut = errStatus === DisconnectReason.loggedOut;
                
                // Tratar sessão corrompida (Bad Decrypt / XML Stream Error)
                const errMsg = lastDisconnect?.error?.message || '';
                const isCorrupt = errMsg.includes('xml-not-well-formed') || errStatus === 500 || errStatus === 515;
                
                const shouldReconnect = !isLoggedOut && !isCorrupt;
                
                console.log(`[${tenantId}] Conexão fechada. Reconectar?`, shouldReconnect, isCorrupt ? '(Foi barrado por corrupção de sessão/criptografia)' : '');
                
                this.sessions.delete(tenantId);
                
                if (shouldReconnect) {
                    this.createSession(tenantId);
                } else {
                    console.log(`[${tenantId}] LOGGED OUT OU SESSÃO CORROMPIDA. Excluindo base e liberando state sujo...`);
                    // Limpar a sujeira e reiniciar no modo RAW para emergir o QRCODE Base64 na mesma hora!!
                    
                    await supabase.from('whatsapp_instances').update({
                        status: 'offline',
                        updated_at: new Date()
                    }).eq('id', tenantId);

                    clearState().then(() => {
                        console.log(`[${tenantId}] Base limpa. Engatando Motor novamente no Zero Grau...`);
                        this.createSession(tenantId);
                    }).catch(err => {
                        console.error('Falha ao limpar banco de dados:', err);
                        this.createSession(tenantId); // tenta igual
                    });
                }
            } else if (connection === 'open') {
                console.log(`[${tenantId}] CONEXÃO ABERTA E 100% OPERACIONAL!`);
                sock.isConnectionFullyOpen = true; // Libera disparo
                this.qrs.delete(tenantId); // Limpa QR
                
                try {
                    const jid = sock.user.id;
                    const number = jid.split(':')[0].split('@')[0];
                    const whatsappName = sock.user.name || 'Desconhecido';
                    let ppUrl = null;
                    try { ppUrl = await sock.profilePictureUrl(jid, 'image'); } catch(err) {}
                    
                    await supabase.from('whatsapp_instances').update({
                        status: 'connected',
                        phone_number: number,
                        whatsapp_name: whatsappName,
                        profile_picture_url: ppUrl,
                        updated_at: new Date()
                    }).eq('id', tenantId);
                } catch (dbErr) {
                    console.error('Falha ao atualizar Instance aberta no Supabase:', dbErr);
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // EVENTOS DE MENSAGENS (A PONTE COM O SEU SISTEMA SEM Evolution Nem N8N)
        sock.ev.on('messages.upsert', async (m) => {
            if (m.type === 'notify' || m.type === 'append') {
                for (const msg of m.messages) {
                    // Capturamos as do próprio usuário (fromMe) e de clientes
                    await this.handleIncomingMessage(tenantId, msg);
                }
            }
        });

        return { status: 'loading', tenantId };
    }

    /**
     * Dispara MSG direto do Socket
     */
    async sendMessage(tenantId, remoteJid, text) {
        const sock = this.sessions.get(tenantId);
        if(!sock) throw new Error('WhatsApp Instância NÂO está online para este Tenant.');
        if(!sock.isConnectionFullyOpen) throw new Error('Connection Timeout: O Celular do WhatsApp demorou muito para responder o disparo. A tela está apagada ou ele se desconectou.');

        const { generateMessageID } = require('@whiskeysockets/baileys');
        const msgId = generateMessageID();

        // 1. Salvar Imediatamente no Supabase para o Front-end Atualizar via Realtime
        const whatsappIdId = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');
        
        try {
            const { data: contactData } = await supabase
              .from('contacts')
              .select('id')
              .eq('whatsapp_id', whatsappIdId)
              .eq('tenant_id', tenantId)
              .single();

            if (contactData) {
                await supabase.from('messages').upsert([{
                   contact_id: contactData.id,
                   whatsapp_id: msgId,
                   text_content: text,
                   sender_type: 'human',
                   status: 'SENT',
                   company_id: tenantId,
                   tenant_id: tenantId
                }], { onConflict: 'whatsapp_id', ignoreDuplicates: true });
            }
        } catch (e) {
            console.error('Core Engine Falha ao pré-persistir sendMessage no Supabase:', e);
        }

        // 2. Disparar Motor Baileys no Background (Fire and Forget)
        // Isso impede a UI de congelar por 60s em caso de handshake/sincronização pendente.
        sock.sendMessage(remoteJid, { text }, { messageId: msgId })
            .catch(e => {
                console.error('Falha assíncrona no motor ao enviar mensagem no background:', e);
                // Opcional: Se falhar criticamente, marcar como erro no banco no futuro
            });

        return { success: true, messageId: msgId };
    }


    /**
     * Motor nativo enviando dados para o BD Supabase (A grande mágica)
     */
    async handleIncomingMessage(tenantId, msgData) {
        const { remoteJid, id, fromMe } = msgData.key;
        if (!remoteJid || remoteJid === 'status@broadcast') return;

        const pushName = msgData.pushName || 'Desconhecido';
        const whatsappIdId = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');
        
        let text = msgData.message?.conversation || msgData.message?.extendedTextMessage?.text || msgData.message?.imageMessage?.caption || msgData.message?.videoMessage?.caption || 'Mídia / Outros';
        let companyId = tenantId;

        // Se a mensagem original for vazia ou sistema, ignoramos pra n poluir
        if (!msgData.message) return;

        console.log(`[${tenantId} Mensagem NATIVA] -> ${pushName} (Me? ${!!fromMe}): ${text}`);

        try {
            // Upsert do Contato
            const { data: contactData, error: contactError } = await supabase
              .from('contacts')
              .select('id')
              .eq('whatsapp_id', whatsappIdId)
              .eq('tenant_id', tenantId)
              .single();
        
            let contactIdToUse = contactData?.id;
            
            if (contactError && contactError.code === 'PGRST116') {
               const { data: newContact } = await supabase
                 .from('contacts')
                 .insert([{ whatsapp_id: whatsappIdId, name: pushName, company_id: companyId, tenant_id: tenantId, bot_status: 'active' }])
                 .select().single();
               contactIdToUse = newContact.id;
            }
        
            // Upsert Mensagem (Usando as colunas certas do schema)
            await supabase.from('messages').upsert([{
               contact_id: contactIdToUse,
               whatsapp_id: id,
               text_content: text,
               sender_type: fromMe ? 'human' : 'client',
               status: fromMe ? 'SENT' : 'RECEIVED',
               company_id: companyId,
               tenant_id: tenantId
            }], { onConflict: 'whatsapp_id', ignoreDuplicates: true });
            
            // Grava Log de saúde no sistema
            if (!fromMe) {
                await supabase.from('system_logs').insert([{
                    type: 'MSG_NATIVE_UPSERT', message: `Msg recebida e salva com ID: ${id}`, tenant_id: tenantId, level: 'info'
                }]);
            }

        } catch(e) {
            console.error('Core Engine Falha ao popular Msg', e);
        }
    }

    /**
     * Teste Global de Recurso: Invoca um método nativo no socket do Baileys dinamicamente
     */
    async invokeMethod(tenantId, method, args) {
        const sock = this.sessions.get(tenantId);
        if (!sock) throw new Error('WhatsApp Instância NÃO está online para este Tenant.');
        
        if (typeof sock[method] !== 'function') {
            throw new Error(`Método '${method}' não encontrado no objeto socket do Baileys.`);
        }

        try {
            console.log(`[${tenantId} INVOKE] Iniciando -> ${method} com args:`, JSON.stringify(args));
            
            // Usando apply ou spread para invocar os parâmetros desestruturados a partir do JSON Array
            const result = await sock[method](...(Array.isArray(args) ? args : []));
            
            return { success: true, method, result };
        } catch (e) {
            console.error(`Falha interna no invokeMethod [${method}]:`, e);
            throw new Error(`Erro ao executar ${method}: ` + (e.message || e.toString()));
        }
    }
}

module.exports = new InstanceManager();
