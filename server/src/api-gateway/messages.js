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

        // Busca de histórico On-Demand via API do WhatsApp Multi-Device (>= v7.0)
        // Isso requer uma mensagem "âncora" já salva para o WhatsApp saber a partir de onde paginar as mais antigas.
        const { data: oldestMsgs, error: oldestErr } = await supabase
            .from('messages')
            .select('raw_payload, timestamp')
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: true }) // Pegamos a _mais antiga_ (1)
            .limit(1);

        if (oldestErr) {
             console.error("[Sync-History] Erro buscando âncora", oldestErr);
             return res.status(500).json({ error: 'Erro de banco de dados ao buscar mensagem âncora.' });
        }

        if (!oldestMsgs || oldestMsgs.length === 0 || !oldestMsgs[0].raw_payload || !oldestMsgs[0].raw_payload.key) {
            // Se a conversa for literalmente vazia e nenhuma Msg foi sincronizada no load inicial, o fetchMessageHistory falha no server deles.
            console.warn(`[Sync-History] Tentativa frustrada para JID: ${jid}. O chat está totalmente vazio no banco, impossível utilizar History Sync On Demand sem mensagem âncora.`);
            return res.status(400).json({ 
                 error: 'Nenhuma mensagem inicial encontrada localmente. É necessário no mínimo uma mensagem no sistema como âncora (anchor point) para solicitar o histórico para a Meta.' 
            });
        }

        const anchorPayload = oldestMsgs[0].raw_payload;
        const oldestKey = anchorPayload.key;
        
        // Pega timestamp do payload WA original ou faz fallback do BD
        const timestampSeconds = anchorPayload.messageTimestamp 
            ? anchorPayload.messageTimestamp 
            : Math.floor(new Date(oldestMsgs[0].timestamp).getTime() / 1000);

        try {
            console.log(`[Sync-History] Solicitando últimas 50 mensagems (on-demand) para ${jid} a partir do ID ${oldestKey.id}`);
            
            // Chama a API NATIVA DO BAILEYS para o MD:
            await sock.fetchMessageHistory(50, oldestKey, timestampSeconds);
            
            // Retorna ao front que o processo foi despachado para a Meta/WhatsApp, e logo mais cairão eventos upsert assíncronos.
            res.json({
                ok: true,
                conversationId,
                synced: true,
                message: "Busca despachada com sucesso. As mensagens aparecerão em tempo real conforme forem chegando do WhatsApp."
            });
        } catch (fetchErr) {
             console.error("[Sync-History] Erro na engine Baileys ao solicitar histórico:", fetchErr);
             res.status(500).json({ error: 'Falha do protocolo ao solicitar histórico à API do WhatsApp', detalhes: fetchErr.message });
        }

    } catch(e) {
        console.error("Erro no sync-history", e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
