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

        // Instanciamento Oficial do Motor Whatsapp
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true, // Pra vermos no console Windows/Nuvem
            version: version, // Resolve o 405 Method Not Allowed forçando última versão WA Web
            browser: Browsers.macOS('Desktop'), // Camufla a assinatura na RAM
            syncFullHistory: true, // Força a sincronização do histórico no momento da primeira conexão QR
            generateHighQualityLinkPreview: false // Desativa para salvar RAM
        });

        store.bind(sock.ev);
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
                const isLoggedOut = (lastDisconnect.error instanceof Boom)?.output?.statusCode === DisconnectReason.loggedOut;
                const shouldReconnect = !isLoggedOut;
                
                console.log(`[${tenantId}] Conexão fechada. Reconectar?`, shouldReconnect);
                
                this.sessions.delete(tenantId);
                
                if (shouldReconnect) {
                    this.createSession(tenantId);
                } else {
                    console.log(`[${tenantId}] LOGGED OUT CATASTRÓFICO. Excluindo base e liberando state sujo...`);
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
        
        const res = await sock.sendMessage(remoteJid, { text });
        
        try {
            const whatsappIdId = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');
            const msgId = res?.key?.id;

            if (msgId) {
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
            }
        } catch (e) {
            console.error('Core Engine Falha ao persistir sendMessage no Supabase:', e);
        }

        return { success: true, messageId: res?.key?.id };
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
}

module.exports = new InstanceManager();
