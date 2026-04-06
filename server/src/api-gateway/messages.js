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

export default router;
