const { makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { useSupabaseAuthState } = require('./supaAuthState');
const { supabase } = require('./supabase');
const QRCodeLib = require('qrcode');

class InstanceManager {
    constructor() {
        // Guarda na RAM as instâncias online por Tenant ID
        this.sessions = new Map();
        // Guarda buffers de QR Codes para a interface React consultar
        this.qrs = new Map();
    }

    /**
     * Inicializa ou restaura a sessão de um Tenant
     */
    async createSession(tenantId) {
        
        if (this.sessions.has(tenantId)) {
            return { status: 'already_connected', tenantId };
        }

        const { state, saveCreds } = await useSupabaseAuthState(supabase, tenantId);

        // Instanciamento Oficial do Motor Whatsapp
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true, // Pra vermos no console Windows/Nuvem
            browser: ['Antigravity SaaS', 'Chrome', '10.0'],
        });

        this.sessions.set(tenantId, sock);

        // EVENTOS DE CONEXÃO
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                try {
                    // Transmuta String Pura do Baileys para Imagem de Base64 consumível pelo Web-React
                    const base64Image = await QRCodeLib.toDataURL(qr, { errorCorrectionLevel: 'H' });
                    this.qrs.set(tenantId, base64Image); 
                    console.log(`[${tenantId}] QR Code Limpo Gerado para API Local/Nuvem!`);
                } catch(err) {
                    console.error('Falha de transcrição QR', err);
                }
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log(`[${tenantId}] Conexão fechada. Reconectar?`, shouldReconnect);
                
                this.sessions.delete(tenantId);
                
                if (shouldReconnect) {
                    this.createSession(tenantId);
                } else {
                    console.log(`[${tenantId}] LOGGED OUT. Excluindo base.`);
                }
            } else if (connection === 'open') {
                console.log(`[${tenantId}] CONEXÃO ABERTA E 100% OPERACIONAL!`);
                this.qrs.delete(tenantId); // Limpa QR
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // EVENTOS DE MENSAGENS (A PONTE COM O SEU SISTEMA SEM Evolution Nem N8N)
        sock.ev.on('messages.upsert', async (m) => {
            if (m.type === 'notify') {
                for (const msg of m.messages) {
                    if (msg.key.fromMe) continue; // Ignora se foi disparo nosso
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
        
        await sock.sendMessage(remoteJid, { text });
        return { success: true };
    }

    /**
     * Motor nativo enviando dados para o BD Supabase (A grande mágica)
     */
    async handleIncomingMessage(tenantId, msgData) {
        const { remoteJid, id } = msgData.key;
        const pushName = msgData.pushName || 'Desconhecido';
        const whatsappIdId = remoteJid.replace('@s.whatsapp.net', '');
        
        let text = msgData.message?.conversation || msgData.message?.extendedTextMessage?.text || 'Mídia Recebida (ver log)';
        let companyId = tenantId;

        console.log(`[${tenantId} Mensagem NATIVA] -> ${pushName}: ${text}`);

        // Mesma lógica de Webhook só que sem o middleware da web, usando função real direto em DB
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
                 .insert([{ whatsapp_id: whatsappIdId, name: pushName, company_id: companyId, tenant_id: tenantId }])
                 .select().single();
               contactIdToUse = newContact.id;
            }
        
            // Upsert Mensagem
            await supabase.from('messages').insert([{
               contact_id: contactIdToUse,
               message_id: id,
               content: text,
               sender_type: 'contact',
               status: 'RECEIVED',
               company_id: companyId,
               tenant_id: tenantId
            }]);
            
            // Grava Log de saúde no sistema react ler se quiser!
            await supabase.from('system_logs').insert([{
                type: 'MSG_NATIVE_UPSERT', message: 'Engine puro capturou a mensagem!', tenant_id: tenantId, level: 'info'
            }]);

        } catch(e) {
            console.error('Core Engine Falha ao popular Msg', e);
        }
    }
}

module.exports = new InstanceManager();
