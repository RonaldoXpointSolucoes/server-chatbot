import express from 'express';
import sessionManager from '../session-manager/index.js';
import { supabase, resolveTargetJid } from '../supabase.js';
import realtime from '../realtime-publisher/index.js';
import AutomationWorker from '../automation-worker/agent.js';

const router = express.Router();

const requireTenant = async (req, res, next) => {
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header missing' });
    req.tenantId = tenantId;
    next();
};

router.post(['/', '/send', '/messages/send', '/sendText', '/send-text'], requireTenant, async (req, res) => {
    const { instanceId, text, contactPhone, conversationId, senderType, is_automation, sender_type } = req.body;
    const tenantId = req.tenantId;
    const isAuto = senderType === 'automation' || is_automation === true || sender_type === 'automation';

    if (isAuto) {
        console.log(`[API Gateway] [messages/send] 📨 Disparo de Automação Recebido | Instância: ${instanceId} | Destino: ${contactPhone} | Conversa: ${conversationId}`);
    }

    try {
        if (!instanceId || !text || !contactPhone || !conversationId) {
            if (isAuto) console.warn(`[API Gateway] [messages/send] ❌ Falha 400: Parâmetros obrigatórios ausentes | Instância: ${instanceId}`);
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        let sock = sessionManager.getSocket(instanceId, true);
        
        // Anti-Bug: Se o socket estiver no meio do boot (deploy/restart), aguarda
        if (!sock && sessionManager.connectingState.has(instanceId)) {
            console.log(`[API Gateway] [messages/send] Segurando req de envio. Aguardando socket conectar: ${instanceId}`);
            try {
                sock = await sessionManager.connectingState.get(instanceId);
            } catch (e) {}
        }
        
        // Se o socket não existe na memória, tenta acordar com até 3 tentativas
        if (!sock) {
            const delays = [0, 1000, 2000];
            for (let attempt = 0; attempt < 3; attempt++) {
                if (delays[attempt] > 0) {
                    await new Promise(r => setTimeout(r, delays[attempt]));
                }
                sock = await sessionManager.getSocketOrWake(tenantId, instanceId, true);
                if (sock) break;
            }

            if (!sock) {
                if (isAuto) console.error(`[API Gateway] [messages/send] ❌ Falha 400: Socket Offline na RAM | Instância: ${instanceId} | Destino: ${contactPhone}`);
                return res.status(400).json({ error: 'WhatsApp socket offline ou não autenticado para esta instância.' });
            }
        }
        
        const remoteJid = await resolveTargetJid(sock, contactPhone, tenantId);

        let msgResult;
        try {
            msgResult = await sock.sendMessage(remoteJid, { text });
        } catch (sendErr) {
            console.warn(`[API Gateway] [messages/send] Falha na 1ª tentativa (${sendErr.message}). Tentando obter socket renovado...`);
            const retrySock = await sessionManager.getSocketOrWake(tenantId, instanceId, true);
            if (retrySock) {
                msgResult = await retrySock.sendMessage(remoteJid, { text });
            } else {
                throw sendErr;
            }
        }

        if (isAuto) {
            console.log(`[API Gateway] [messages/send] ✅ Sucesso no Envio de Automação | Instância: ${instanceId} | Destino: ${remoteJid} | MsgID: ${msgResult?.key?.id}`);
        }

        const dbSenderType = isAuto ? 'automation' : 'human';

        try {
            const { EventProcessor } = await import('../event-processor/index.js');
            if (EventProcessor && msgResult?.key?.id) {
                if (isAuto) {
                    if (!EventProcessor.automationMessagesCache) EventProcessor.automationMessagesCache = new Map();
                    EventProcessor.automationMessagesCache.set(`${instanceId}_${msgResult.key.id}`, true);
                    setTimeout(() => EventProcessor.automationMessagesCache.delete(`${instanceId}_${msgResult.key.id}`), 60000);
                } else {
                    if (!EventProcessor.humanMessagesCache) EventProcessor.humanMessagesCache = new Map();
                    EventProcessor.humanMessagesCache.set(`${instanceId}_${msgResult.key.id}`, true);
                    setTimeout(() => EventProcessor.humanMessagesCache.delete(`${instanceId}_${msgResult.key.id}`), 60000);
                }
            }
        } catch(e) {}

        const { data: savedMsg, error: dbError } = await supabase.from('messages').insert({
            tenant_id: tenantId,
            instance_id: instanceId,
            conversation_id: conversationId,
            direction: 'outbound',
            message_type: 'text',
            status: 'sent',
            text_content: text,
            whatsapp_message_id: msgResult?.key?.id,
            sender_type: dbSenderType,
            raw_payload: msgResult
        }).select('*').single();

        if (dbError) throw dbError;

        // Buscar status atual da conversa para garantir que ticket ativo é aberto se estivesse resolvido/fechado
        const { data: convData } = await supabase
            .from('conversations')
            .select('status, ai_paused')
            .eq('id', conversationId)
            .single();

        let nextStatus = convData?.status || 'open';
        if (!isAuto && (convData?.status === 'resolved' || convData?.status === 'closed' || convData?.status === 'snoozed')) {
            nextStatus = convData?.ai_paused ? 'open' : 'bot';
        }

        if (!isAuto) {
            try {
                AutomationWorker.cancelPendingMessage(conversationId, 'envio_humano_api');
                AutomationWorker.cancelPendingMessage(remoteJid, 'envio_humano_api');
            } catch (cancelErr) {
                console.error('[Messages API] Erro ao cancelar mensagem pendente:', cancelErr);
            }

            await supabase.from('conversations').update({
                updated_at: new Date().toISOString(),
                unread_count: 0,
                status: 'open',
                ai_paused: true
            }).eq('id', conversationId);
        } else {
            // Automação: apenas atualiza timestamp sem alterar o status da conversa (NÃO reabre ticket)
            await supabase.from('conversations').update({
                updated_at: new Date().toISOString()
            }).eq('id', conversationId);
        }

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
            .order('timestamp', { ascending: false })
            .limit(100);
            
        if(error) throw error;
        res.json(data.reverse());
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// --- SISTEMA DE RATE-LIMITING E CONTROLE DE FLOOD PARA HISTÓRICO META ---
const historyRequestCooldowns = new Map(); // Map<string, number>
const HISTORY_COOLDOWN_MS = 20 * 1000; // 20 segundos por conversa para proteger conta de banimento

router.post('/conversations/:conversationId/sync-history', requireTenant, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const tenantId = req.tenantId;
        const { instanceId } = req.body;

        if (!instanceId) return res.status(400).json({ error: 'instanceId is required' });

        let sock = sessionManager.getSocket(instanceId);
        
        // Anti-Bug: Se o socket estiver no meio do boot (deploy/restart), aguarda
        if (!sock && sessionManager.connectingState.has(instanceId)) {
            console.log(`[Sync-History API] Segurando req. Aguardando socket conectar: ${instanceId}`);
            sock = await sessionManager.connectingState.get(instanceId);
        }
        
        // Se o socket não existe na memória, tenta obter de forma resiliente
        if (!sock) {
             console.log(`[Sync-History API] Obtendo socket para sync: ${instanceId}`);
             try {
                 sock = await sessionManager.getSocketOrWake(tenantId, instanceId, true);
             } catch (e) {
                 return res.status(400).json({ error: 'WhatsApp socket offline para esta instancia.' });
             }
        }
        
        if (!sock) return res.status(400).json({ error: 'Socket offline ou não autenticado para esta instancia' });

        // Identifica a conversa / contato / JID no Supabase
        let convData = null;
        let contactUuid = null;
        let contactPhone = null;
        let contactJid = null;

        if (conversationId && conversationId !== 'undefined' && conversationId !== 'null') {
            const { data: conv } = await supabase
                .from('conversations')
                .select('id, contact_id, contacts(id, phone, whatsapp_jid)')
                .eq('id', conversationId)
                .eq('tenant_id', tenantId)
                .maybeSingle();

            if (conv) {
                convData = conv;
                contactUuid = conv.contact_id || conv.contacts?.id;
                contactPhone = conv.contacts?.phone;
                contactJid = conv.contacts?.whatsapp_jid;
            } else {
                // Fallback: conversationId pode ser contact_id UUID ou telefone
                const cleanInput = String(conversationId).replace(/\D/g, '');
                const { data: contact } = await supabase
                    .from('contacts')
                    .select('id, phone, whatsapp_jid')
                    .eq('tenant_id', tenantId)
                    .or(`id.eq.${conversationId},phone.eq.${cleanInput}`)
                    .limit(1)
                    .maybeSingle();

                if (contact) {
                    contactUuid = contact.id;
                    contactPhone = contact.phone;
                    contactJid = contact.whatsapp_jid;
                }
            }
        }

        let rawJid = contactJid || (contactPhone ? `${contactPhone.replace(/\D/g, '')}@s.whatsapp.net` : null);
        if (!rawJid) {
            return res.status(400).json({ error: 'Telefone ou JID do contato não encontrado para sincronização.' });
        }

        const jid = await resolveTargetJid(sock, rawJid, tenantId);

        // --- SISTEMA ANTI-LOOP E RATE-LIMITING SUAVE (PROTEÇÃO META/WHATSAPP) ---
        const cooldownKey = `${tenantId}_${jid}`;
        const now = Date.now();
        const lastRequestedAt = historyRequestCooldowns.get(cooldownKey) || 0;
        const timeSinceLast = now - lastRequestedAt;

        if (timeSinceLast < HISTORY_COOLDOWN_MS) {
            console.log(`[Sync-History] Rate-limit suave ativo para ${jid} (${Math.round(timeSinceLast / 1000)}s atrás). Retornando 200 para proteger a conta.`);
            return res.json({
                ok: true,
                conversationId,
                synced: true,
                cached: true,
                message: "Uma busca de histórico já foi despachada para o WhatsApp recentemente. As mensagens chegarão em instantes."
            });
        }

        // Registrar timestamp do cooldown
        historyRequestCooldowns.set(cooldownKey, now);

        // Limpeza de cache de cooldowns antigo
        if (historyRequestCooldowns.size > 1000) {
            const expireThreshold = now - (60 * 1000);
            for (const [k, t] of historyRequestCooldowns.entries()) {
                if (t < expireThreshold) historyRequestCooldowns.delete(k);
            }
        }

        // Identifica todos os IDs de conversa do contato para buscar mensagens âncora
        let allConvIds = conversationId ? [conversationId] : [];
        if (contactUuid) {
            const { data: convList } = await supabase
                .from('conversations')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('contact_id', contactUuid);
            if (convList && convList.length > 0) {
                allConvIds = Array.from(new Set([...allConvIds, ...convList.map(c => c.id)]));
            }
        }

        // Busca mensagens existentes para encontrar o ponto de ancoragem ideal
        let oldestKey = null;
        let timestampSeconds = Math.floor(Date.now() / 1000);

        if (allConvIds.length > 0) {
            const { data: msgsList } = await supabase
                .from('messages')
                .select('id, whatsapp_message_id, raw_payload, timestamp, sender_type')
                .eq('tenant_id', tenantId)
                .in('conversation_id', allConvIds)
                .order('timestamp', { ascending: true })
                .limit(50);

            if (msgsList && msgsList.length > 0) {
                // Prioridade 1: Mensagem com raw_payload.key completo
                const msgWithKey = msgsList.find(m => m.raw_payload?.key?.id);
                if (msgWithKey) {
                    oldestKey = msgWithKey.raw_payload.key;
                    timestampSeconds = msgWithKey.raw_payload.messageTimestamp 
                        ? msgWithKey.raw_payload.messageTimestamp 
                        : Math.floor(new Date(msgWithKey.timestamp).getTime() / 1000);
                } else {
                    // Prioridade 2: Mensagem com whatsapp_message_id
                    const msgWithWaId = msgsList.find(m => m.whatsapp_message_id);
                    if (msgWithWaId) {
                        oldestKey = {
                            remoteJid: jid,
                            id: msgWithWaId.whatsapp_message_id,
                            fromMe: msgWithWaId.sender_type === 'human' || msgWithWaId.sender_type === 'agent'
                        };
                        timestampSeconds = Math.floor(new Date(msgWithWaId.timestamp).getTime() / 1000);
                    } else {
                        // Prioridade 3: Primeira mensagem encontrada
                        const firstMsg = msgsList[0];
                        oldestKey = {
                            remoteJid: jid,
                            id: firstMsg.whatsapp_message_id || firstMsg.id,
                            fromMe: firstMsg.sender_type === 'human' || firstMsg.sender_type === 'agent'
                        };
                        timestampSeconds = Math.floor(new Date(firstMsg.timestamp).getTime() / 1000);
                    }
                }
            }
        }

        // Fallback Seguro (0 mensagens locais): Ancora na data atual sem ID prévio
        if (!oldestKey) {
            oldestKey = {
                remoteJid: jid,
                fromMe: false,
                id: undefined
            };
            timestampSeconds = Math.floor(Date.now() / 1000);
        }

        try {
            console.log(`[Sync-History] [Tenant: ${tenantId}] [Instance: ${instanceId}] Solicitando histórico (50 msgs) para JID: ${jid} (Anchor: ${oldestKey?.id || 'RECENT_HEAD'}).`);
            
            if (typeof sock.fetchMessageHistory === 'function') {
                await sock.fetchMessageHistory(50, oldestKey, timestampSeconds);
            } else {
                console.warn(`[Sync-History] fetchMessageHistory não disponível no socket.`);
            }
            
            console.log(`[Sync-History] Pedido despachado suavemente para o WhatsApp. JID: ${jid}.`);
            
            return res.json({
                ok: true,
                conversationId,
                synced: true,
                message: "Busca de histórico despachada com sucesso. As mensagens anteriores aparecerão no chat conforme chegarem do WhatsApp."
            });
        } catch (fetchErr) {
             console.warn(`[Sync-History] Aviso no protocolo Baileys ao solicitar histórico para JID ${jid}:`, fetchErr?.message);
             return res.json({
                 ok: true,
                 conversationId,
                 synced: false,
                 message: "A solicitação foi enviada ao WhatsApp. Se houver histórico anterior no aparelho, ele será sincronizado em instantes."
             });
        }

    } catch(e) {
        console.error("Erro no sync-history", e);
        res.status(500).json({ error: e.message });
    }
});

router.post(['/cancel-ai', '/messages/cancel-ai'], requireTenant, async (req, res) => {
    try {
        const { conversationId, remoteJid, contactId, reason } = req.body;
        
        if (conversationId) AutomationWorker.cancelPendingMessage(conversationId, reason || 'pausa_manual');
        if (remoteJid) AutomationWorker.cancelPendingMessage(remoteJid, reason || 'pausa_manual');
        if (contactId) AutomationWorker.cancelPendingMessage(contactId, reason || 'pausa_manual');
        
        res.json({ ok: true, message: 'IA abortada com sucesso' });
    } catch (e) {
        console.error('[Messages API] Erro ao cancelar IA:', e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
