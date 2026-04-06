import express from 'express';
import sessionManager from '../session-manager/index.js';
import { supabase } from '../supabase.js';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB
const router = express.Router();

const requireTenant = async (req, res, next) => {
    const tenantId = req.headers['x-tenant-id'];
    const apiKey = req.headers['apikey'];

    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header missing' });
    req.tenantId = tenantId;

    const instanceId = req.params.instanceId;
    if (instanceId) {
        if (!apiKey) return res.status(401).json({ error: 'apikey header missing. Access denied.' });
        
        const { data, error } = await supabase
            .from('whatsapp_instances')
            .select('api_key')
            .eq('id', instanceId)
            .eq('tenant_id', tenantId)
            .single();
            
        if (error || !data) return res.status(404).json({ error: 'Instance not found or unauthorized' });
        
        // Se a instância tiver uma API key registrada, verifica.
        // Considerando a restrição estrita proativa solicitada na regra:
        if (data.api_key && data.api_key !== apiKey) {
            return res.status(401).json({ error: 'Invalid API Key provided for this instance' });
        }
    }

    next();
};

router.post('/instances/:instanceId/connect', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const tenantId = req.tenantId;

        await supabase.from('whatsapp_instances')
            .update({ status: 'connecting', last_error: null })
            .eq('id', instanceId)
            .eq('tenant_id', tenantId);

        sessionManager.createSession(tenantId, instanceId).catch(console.error);

        res.json({ ok: true, status: 'connecting', instanceId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/instances/:instanceId/disconnect', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        
        if (sock) {
            try { await sock.logout(); } catch(e) {}
        } else {
            await supabase.from('wa_auth_credentials').delete().eq('instance_id', instanceId);
            await supabase.from('wa_auth_keys').delete().eq('instance_id', instanceId);
            await supabase.from('whatsapp_instances').update({ status: 'offline' }).eq('id', instanceId);
        }

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/instances/:instanceId/invoke', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { method, args } = req.body;
        
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        // Intercept custom macros that don't exist directly on sock
        if (method === 'syncContacts') {
            return res.json({ ok: true, message: 'Os contatos são sincronizados assincronamente pelo Baileys em background após a conexão.' });
        }
        
        if (method === 'clearStore') {
            return res.json({ ok: true, message: 'A arquitetura atual não utiliza in-memory store global, RAM está otimizada automaticamente.' });
        }

        if(typeof sock[method] !== 'function') return res.status(400).json({ error: `Method ${method} not found on Baileys socket` });

        const result = await sock[method](...(args || []));
        res.json({ ok: true, result });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ENVIAR MEDIA
router.post('/instances/:instanceId/send-media', requireTenant, upload.single('media'), async (req, res) => {
    try {
        const { instanceId } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        if (!sock) return res.status(400).json({ error: 'Socket offline' });

        const tenantId = req.tenantId;
        const file = req.file;
        const { jid, caption, messageType } = req.body; // image, video, audio, document

        if (!file || !jid || !messageType) {
            return res.status(400).json({ error: 'Missing file, jid or messageType' });
        }

        // Upload to Supabase Storage First
        const timestamp = Date.now();
        const ext = file.originalname.split('.').pop() || 'tmp';
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_');
        const storagePath = `tenant_${tenantId}/instance_${instanceId}/${jid}/${timestamp}_${safeName}`;

        const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('chat_media')
            .upload(storagePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        let mediaUrl = '';
        if (uploadErr) {
            console.error('Supabase media upload error:', uploadErr);
             mediaUrl = 'upload_failed';
        } else {
            const { data: publicUrlData } = supabase.storage.from('chat_media').getPublicUrl(storagePath);
            mediaUrl = publicUrlData.publicUrl;
        }

        // Prepare message payload for Baileys
        const sendPayload = {};
        if (messageType === 'image') {
            sendPayload.image = file.buffer;
            if (caption) sendPayload.caption = caption;
        } else if (messageType === 'video') {
            sendPayload.video = file.buffer;
            if (caption) sendPayload.caption = caption;
        } else if (messageType === 'audio') {
            sendPayload.audio = file.buffer;
            sendPayload.mimetype = file.mimetype;
            // if voice note: sendPayload.ptt = true
            if (req.body.ptt === 'true') sendPayload.ptt = true;
        } else if (messageType === 'document') {
            sendPayload.document = file.buffer;
            sendPayload.mimetype = file.mimetype;
            sendPayload.fileName = file.originalname;
            if (caption) sendPayload.caption = caption;
        } else {
            return res.status(400).json({ error: 'Unsupported messageType' });
        }

        const result = await sock.sendMessage(jid, sendPayload);

        // Armazena no cache pra qdo o events.upsert disparar ele saiba a URL real no Supabase
        if (result?.key?.id && mediaUrl && mediaUrl !== 'upload_failed') {
            try {
                const { EventProcessor } = await import('../event-processor/index.js');
                if (EventProcessor && EventProcessor.pendingMediaCache) {
                    EventProcessor.pendingMediaCache.set(result.key.id, mediaUrl);
                    setTimeout(() => EventProcessor.pendingMediaCache.delete(result.key.id), 60000);
                }
            } catch (err) {
                console.error("Erro importando EventProcessor:", err);
            }
        }

        // Note: The message saving in DB is mostly handled by messages.upsert event in event-processor
        // but we can pass realtime events or rely entirely on event-processor.

        res.json({ ok: true, result, media_url: mediaUrl });
    } catch (e) {
        console.error('Send media error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/instances/:instanceId/:action', requireTenant, async (req, res) => {
    try {
        const { instanceId, action } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        
        if (action === 'reconnect') {
            await sessionManager.closeSession(instanceId);
            sessionManager.createSession(req.tenantId, instanceId).catch(console.error);
            return res.json({ ok: true, message: 'Reconectando...' });
        }
        
        // generic actions for UI mock support
        res.json({ ok: true, message: `Mock Action ${action} triggered` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/instances/:instanceId', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        
        if (sock) {
            try { await sock.logout(); } catch(e) {}
        }
        
        await sessionManager.closeSession(instanceId);

        await supabase.from('whatsapp_instances').delete().eq('id', instanceId);

        res.json({ ok: true, message: 'Deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/instances/:instanceId/status', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { data, error } = await supabase
            .from('whatsapp_instances')
            .select('status, phone_number, display_name, whatsapp_instance_runtime(qr_code, pairing_code)')
            .eq('id', instanceId)
            .single();

        if (error) throw error;
        res.json({ data });
    } catch(e)  {
        res.status(500).json({ error: e.message });
    }
});

export default router;
