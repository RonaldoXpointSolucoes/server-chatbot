import express from 'express';
import sessionManager from '../session-manager/index.js';
import { supabase } from '../supabase.js';
import realtime from '../realtime-publisher/index.js';

const router = express.Router();

const requireTenant = async (req, res, next) => {
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header missing' });
    req.tenantId = tenantId;
    next();
};

router.post('/messages/send', requireTenant, async (req, res) => {
    try {
        const { instanceId, text, contactPhone, conversationId } = req.body;
        const tenantId = req.tenantId;

        if (!instanceId || !text || !contactPhone || !conversationId) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const sock = sessionManager.getSocket(instanceId);
        if (!sock) {
             return res.status(400).json({ error: 'WhatsApp socket offline para esta instancia.' });
        }
        
        const remoteJid = contactPhone.includes('@') ? contactPhone : `${contactPhone}@s.whatsapp.net`;

        const msgResult = await sock.sendMessage(remoteJid, { text });

        const { data: savedMsg, error: dbError } = await supabase.from('messages').insert({
            tenant_id: tenantId,
            conversation_id: conversationId,
            direction: 'outbound',
            message_type: 'text',
            status: 'sent',
            text_content: text,
            whatsapp_message_id: msgResult?.key?.id,
            sender_type: 'human',
            raw_payload: msgResult
        }).select('*').single();

        if (dbError) throw dbError;

        await supabase.from('conversations').update({
            updated_at: new Date().toISOString(),
            unread_count: 0
        }).eq('id', conversationId);

        await realtime.publishInboxEvent(tenantId, 'message.new_outbound', {
            message: savedMsg,
            conversation_id: conversationId
        });

        res.json({ ok: true, messageId: savedMsg.id });
    } catch (e) {
        console.error("Erro disparando msg", e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/conversations/:conversationId/messages', requireTenant, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: true })
            .limit(100);
            
        if(error) throw error;
        res.json(data);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/conversations/:conversationId/sync-history', requireTenant, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const tenantId = req.tenantId;
        const { instanceId } = req.body;

        if (!instanceId) return res.status(400).json({ error: 'instanceId is required' });

        const sock = sessionManager.getSocket(instanceId);
        if (!sock) return res.status(400).json({ error: 'Socket offline para esta instancia' });

        // Identifica a conversa / JID no Supabase
        const { data: convData, error: convErr } = await supabase
            .from('conversations')
            .select('contact_id, contacts(phone)')
            .eq('id', conversationId)
            .eq('tenant_id', tenantId)
            .single();

        if (convErr || !convData) return res.status(404).json({ error: 'Conversation not found' });
        
        let jid = '';
        if (convData.contacts && convData.contacts.phone) {
            jid = `${convData.contacts.phone}@s.whatsapp.net`;
        } else {
            return res.status(400).json({ error: 'Contact phone not found' });
        }

        // Busca do histórico via sock.store provido pela makeInMemoryStore
        let imported = 0;
        
        try {
            if (sock.store) {
                console.log(`[Sync-History] InMemoryStore detectado. Buscando msgs para JID: ${jid}`);
                // loadMessages retorna a promise de array no Baileys
                const msgs = await sock.store.loadMessages(jid, 50);
                if (msgs && msgs.length > 0) {
                    console.log(`[Sync-History] Encontradas ${msgs.length} mensagens no cache da Baileys para ${jid}. Injetando no eventProcessor...`);
                    const eventProcessor = (await import('../event-processor/index.js')).default;
                    
                    // Ordenamos cronológicamente do mais antigo para o mais novo
                    const orderedMsgs = msgs.sort((a,b) => {
                       const t1 = typeof a.messageTimestamp === 'number' ? a.messageTimestamp : (a.messageTimestamp?.low || 0);
                       const t2 = typeof b.messageTimestamp === 'number' ? b.messageTimestamp : (b.messageTimestamp?.low || 0);
                       return t1 - t2;
                    });

                    // Como o event processor lida iterativamente, mandamos um batch fingindo ser um history append
                    await eventProcessor.handleMessageUpsert(tenantId, instanceId, sock, { messages: orderedMsgs, type: 'append' });
                    imported = orderedMsgs.length;
                    
                    if (orderedMsgs.length > 0) {
                        const lastMsg = orderedMsgs[orderedMsgs.length - 1];
                        const text = eventProcessor.extractTextFromMessage(lastMsg);
                        let tsDate = new Date();
                        const ts = lastMsg.messageTimestamp;
                        if (typeof ts === 'number') tsDate = new Date(ts * 1000);
                        else if (ts?.low) tsDate = new Date(ts.low * 1000);

                        await supabase.from('conversations').update({
                            last_message_at: tsDate.toISOString(),
                            last_message_preview: text.substring(0, 50)
                        }).eq('id', conversationId);
                    }

                } else {
                    console.warn(`[Sync-History] O InMemoryStore retornou 0 mensagens para ${jid}. O contato não interagiu depois do scan, ou histórico remoto ainda não foi baixado na inicialização.`);
                }
            } else {
                console.warn("[Sync-History] sock.store não está configurado! Certifique-se de que o makeInMemoryStore foi associado no session-manager.");
            }
        } catch(e) {
            console.error("Falha ao puxar history nativamente do whatsapp:", e);
        }

        // De qualquer forma, garante finalização do processo p/ o frontend parar o loading
        res.json({
            ok: true,
            conversationId,
            synced: true,
            importedMessages: imported
        });
    } catch(e) {
        console.error("Erro no sync-history", e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
