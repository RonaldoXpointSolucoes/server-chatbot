import express from 'express';
import sessionManager, { isInstanceAllowedForNode } from '../session-manager/index.js';
import { supabase, resolveTargetJid } from '../supabase.js';
import realtime from '../realtime-publisher/index.js';
import AutomationWorker from '../automation-worker/agent.js';
import { pauseAiImmediatelyForHumanOperator } from '../automation-worker/human-pause.js';
import { forwardInternalInstanceRequest } from './external-message-routing.js';

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

        // Encaminha ao worker detentor caso a instância pertença a outro nó (alpha-worker vs production-worker)
        if (await forwardInternalInstanceRequest(req, res, instanceId)) {
            return;
        }

        const isAllowedOnThisNode = isInstanceAllowedForNode(instanceId, tenantId);
        let sock = isAllowedOnThisNode ? sessionManager.getSocket(instanceId, true) : null;
        
        // Anti-Bug: Se o socket estiver no meio do boot (deploy/restart), aguarda
        if (isAllowedOnThisNode && !sock && sessionManager.connectingState.has(instanceId)) {
            console.log(`[API Gateway] [messages/send] Segurando req de envio. Aguardando socket conectar: ${instanceId}`);
            try {
                sock = await sessionManager.connectingState.get(instanceId);
            } catch (e) {}
        }
        
        // 1. Verificação prévia de fast-fail no banco de dados para instâncias desconectadas/offline
        const { data: instCheck } = await supabase
            .from('whatsapp_instances')
            .select('status, last_error, display_name')
            .eq('id', instanceId)
            .maybeSingle();

        const isDisconnected = instCheck && 
            ['offline', 'logged_out', 'blocked_12h', 'disconnected', 'paused', 'close', 'closed'].includes(instCheck.status);

        if (isDisconnected) {
            console.log(`[API Gateway] [messages/send] Fast-Fail 400 (instância inativa/desconectada): Instância ${instanceId} ("${instCheck?.display_name || instanceId}") está desconectada no banco (status: ${instCheck?.status || 'desconhecido'}).`);
            return res.status(400).json({
                ok: false,
                error: `Instância WhatsApp "${instCheck?.display_name || instanceId}" está desconectada (${instCheck?.last_error || 'requer nova conexão/pareamento'}). Por favor, reconecte-a para enviar mensagens.`,
                code: 'INSTANCE_DISCONNECTED',
                instance_id: instanceId,
                status: instCheck?.status || 'disconnected',
                last_error: instCheck?.last_error || null
            });
        }

        // Se o socket não existe na memória e pertence a este nó, tenta acordar rapidamente
        if (!sock && isAllowedOnThisNode) {
            const delays = [0, 800];
            for (let attempt = 0; attempt < delays.length; attempt++) {
                if (delays[attempt] > 0) {
                    await new Promise(r => setTimeout(r, delays[attempt]));
                }
                sock = await sessionManager.getSocketOrWake(tenantId, instanceId, true);
                if (sock) break;
            }
        }

        if (!sock) {
            // Enfileira no outbox resiliente (wa_outgoing_messages) para envio assíncrono pelo nó responsável
            const cleanPhone = String(contactPhone).replace(/\D/g, '');
            const targetJid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;
            const queued = await sessionManager.enqueueMessage(instanceId, {
                targetJid,
                type: 'text',
                content: { text },
                options: { isAutomation: isAuto }
            });

            return res.json({
                ok: true,
                data: {
                    key: { remoteJid: targetJid, fromMe: true, id: `EDGE_${queued?.id?.replace(/-/g, '') || Date.now()}` },
                    messageTimestamp: Math.floor(Date.now() / 1000)
                },
                status: 'PENDING'
            });
        }
        
        const remoteJid = await resolveTargetJid(sock, contactPhone, tenantId);
        const dbSenderType = isAuto ? 'automation' : 'human';

        let msgResult = null;
        let queuedFallbackId = null;
        try {
            msgResult = await sock.sendMessage(remoteJid, { text });
        } catch (sendErr) {
            console.warn(`[API Gateway] [messages/send] Aviso na 1ª tentativa (${sendErr.message}). Delegando ao Outbox Resiliente...`);
            const queued = await sessionManager.enqueueMessage(instanceId, {
                targetJid: remoteJid,
                type: 'text',
                content: { text },
                options: { isAutomation: isAuto, forceQueue: true, isFallback: true }
            });
            queuedFallbackId = `EDGE_${queued?.id?.replace(/-/g, '') || Date.now()}`;
        }

        if (isAuto && msgResult?.key?.id) {
            console.log(`[API Gateway] [messages/send] ✅ Sucesso no Envio de Automação | Instância: ${instanceId} | Destino: ${remoteJid} | MsgID: ${msgResult?.key?.id}`);
        }

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
            status: msgResult?.key?.id ? 'sent' : 'pending',
            text_content: text,
            whatsapp_message_id: msgResult?.key?.id || queuedFallbackId,
            sender_type: dbSenderType,
            raw_payload: msgResult || { fallback_outbox: true, enqueued_at: new Date().toISOString() }
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
            await pauseAiImmediatelyForHumanOperator({
                supabase,
                AutomationWorker,
                tenantId,
                instanceId,
                conversationId,
                jid: remoteJid,
                reason: 'envio_humano_api'
            });

            await supabase.from('conversations').update({
                updated_at: new Date().toISOString(),
                unread_count: 0,
                status: 'open',
                ai_paused: true,
                ai_paused_manually: true
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
        const errMessage = e?.message || (typeof e === 'string' ? e : (e ? JSON.stringify(e) : 'Erro interno desconhecido ao processar envio'));
        console.error("[API Gateway] [messages/send] Erro disparando msg:", errMessage);
        res.status(500).json({ error: errMessage });
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
        let { instanceId } = req.body;
        const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

        if (instanceId && !isUuid(instanceId)) {
            const { data: instByName } = await supabase
                .from('whatsapp_instances')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('display_name', instanceId)
                .maybeSingle();
            if (instByName?.id) {
                instanceId = instByName.id;
                req.body.instanceId = instanceId;
            }
        }

        if (!instanceId && conversationId && isUuid(conversationId)) {
            const { data: convInst } = await supabase
                .from('conversations')
                .select('instance_id')
                .eq('id', conversationId)
                .maybeSingle();
            if (convInst?.instance_id) {
                instanceId = convInst.instance_id;
                req.body.instanceId = instanceId;
            }
        }

        if (!instanceId) return res.status(400).json({ error: 'instanceId is required' });

        // Encaminha ao worker detentor caso a instância pertença a outro nó (alpha-worker vs production-worker)
        if (await forwardInternalInstanceRequest(req, res, instanceId, { forwardAllStatuses: true, timeoutMs: 25000 })) {
            return;
        }

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

        await pauseAiImmediatelyForHumanOperator({
            supabase,
            AutomationWorker,
            tenantId: req.tenantId,
            conversationId,
            contactId,
            jid: remoteJid,
            reason: reason || 'pausa_manual'
        });
        
        res.json({ ok: true, message: 'IA abortada e pausada com sucesso' });
    } catch (e) {
        console.error('[Messages API] Erro ao cancelar IA:', e);
        res.status(500).json({ error: e.message });
    }
});

router.post(['/resume-ai', '/messages/resume-ai'], requireTenant, async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { conversationId, clearOnly } = req.body;
        if (!conversationId) {
            return res.status(400).json({ ok: false, error: 'conversationId é obrigatório.' });
        }

        const { data: conv } = await supabase
            .from('conversations')
            .select('id, instance_id, contact_id, ai_paused, contacts(id, phone, whatsapp_jid)')
            .eq('id', conversationId)
            .eq('tenant_id', tenantId)
            .maybeSingle();

        if (!conv || !conv.instance_id) {
            return res.json({ ok: true, triggered: false, reason: 'conversation_or_instance_not_found' });
        }

        if (await forwardInternalInstanceRequest(req, res, conv.instance_id)) {
            return;
        }

        const rawTarget = conv.contacts?.whatsapp_jid || conv.contacts?.phone;
        // Sempre limpa o lock de pausa humana em memória RAM imediatamente ao retomar,
        // mesmo que a empresa opere exclusivamente com Fluxos Typebot (0 robôs de IA).
        AutomationWorker.clearHumanPauseOverride?.(conversationId, rawTarget || null, conv.contact_id);

        if (clearOnly) {
            return res.json({ ok: true, cleared: true, triggered: false });
        }

        const [{ data: companyData }, { data: botsData }, { data: instData }, { data: recentMsgs }] = await Promise.all([
            supabase.from('companies').select('global_ai_enabled').eq('id', tenantId).maybeSingle(),
            supabase.from('bots').select('*').eq('tenant_id', tenantId),
            supabase.from('whatsapp_instances').select('settings').eq('id', conv.instance_id).maybeSingle(),
            supabase.from('messages')
                .select('id, text_content, sender_type, direction, timestamp')
                .eq('tenant_id', tenantId)
                .eq('conversation_id', conversationId)
                .neq('sender_type', 'system')
                .order('timestamp', { ascending: false })
                .limit(3)
        ]);

        const lastMsg = recentMsgs && recentMsgs.length > 0 ? recentMsgs[0] : null;
        if (!lastMsg || (lastMsg.direction !== 'inbound' && lastMsg.sender_type !== 'client') || !String(lastMsg.text_content || '').trim()) {
            return res.json({ ok: true, cleared: true, triggered: false, reason: 'no_pending_inbound_message' });
        }

        const msgAgeMs = Date.now() - new Date(lastMsg.timestamp).getTime();
        if (Number.isNaN(msgAgeMs) || msgAgeMs > 30 * 60 * 1000) {
            return res.json({ ok: true, cleared: true, triggered: false, reason: 'inbound_message_too_old' });
        }

        const sock = await sessionManager.getSocketOrWake(tenantId, conv.instance_id, false).catch(() => null);
        if (!rawTarget) {
            return res.json({ ok: true, cleared: true, triggered: false, reason: 'missing_contact_jid' });
        }
        const jid = sock ? await resolveTargetJid(sock, rawTarget, tenantId) : (String(rawTarget).includes('@') ? rawTarget : `${String(rawTarget).replace(/\D/g, '')}@s.whatsapp.net`);
        AutomationWorker.clearHumanPauseOverride?.(conversationId, jid, conv.contact_id);

        // 1. Prioridade para o FlowEngine (Fluxos Typebot ativos na empresa)
        try {
            const { default: FlowEngine } = await import('../flow-runtime/index.js');
            const handledByFlow = await FlowEngine.processIncomingMessage({
                tenantId,
                instanceId: conv.instance_id,
                conversationId,
                jid,
                textMessage: lastMsg.text_content,
                messageType: 'text',
                sock
            });
            if (handledByFlow) {
                return res.json({ ok: true, cleared: true, triggered: true, handledByFlow: true, botName: 'FlowEngine (Typebot)' });
            }
        } catch (flowErr) {
            console.warn('[Messages API] Aviso ao acionar FlowEngine no resume-ai:', flowErr?.message || flowErr);
        }

        if (companyData && companyData.global_ai_enabled === false) {
            return res.json({ ok: true, cleared: true, triggered: false, reason: 'global_ai_disabled' });
        }

        const isOrchestratorBot = (bot) => {
            if (!bot) return false;
            const name = String(bot.name || '').toLowerCase();
            const role = String(bot.role || '').toLowerCase();
            const cat = String(bot.category || '').toLowerCase();
            return name.includes('(orquestrador)') || name.includes('orquestrador') || role === 'orquestrador' || cat === 'orquestrador';
        };

        const allBots = botsData || [];
        const orchestratorBot = allBots.find(b => isOrchestratorBot(b) && b.status === 'active');
        const eligibleSpecialists = allBots.filter(b =>
            !isOrchestratorBot(b) &&
            b.status === 'active' &&
            b.autoReply !== false &&
            Array.isArray(b.channels) &&
            b.channels.includes(conv.instance_id)
        );

        let selectedBot = null;
        if (eligibleSpecialists.length > 1) {
            selectedBot = await AutomationWorker.routeMessageToBot(
                eligibleSpecialists,
                lastMsg.text_content,
                tenantId,
                conversationId,
                orchestratorBot?.systemPrompt
            );
        } else if (eligibleSpecialists.length === 1) {
            selectedBot = eligibleSpecialists[0];
        } else if (orchestratorBot && Array.isArray(orchestratorBot.channels) && orchestratorBot.channels.includes(conv.instance_id)) {
            selectedBot = orchestratorBot;
        }

        if (!selectedBot) {
            return res.json({ ok: true, cleared: true, triggered: false, reason: 'no_active_bot_for_instance' });
        }

        await AutomationWorker.processMessage({
            tenantId,
            instanceId: conv.instance_id,
            conversationId,
            contactId: conv.contact_id,
            jid,
            phone: conv.contacts?.phone || String(jid).split('@')[0],
            textMessage: lastMsg.text_content,
            botId: selectedBot.id,
            botSettings: selectedBot,
            sock,
            botDelay: instData?.settings?.bot_delay ?? 5,
            botInstructions: instData?.settings?.bot_instructions || ''
        });

        return res.json({ ok: true, triggered: true, botName: selectedBot.name });
    } catch (e) {
        console.error('[Messages API] Erro ao retomar IA ativamente:', e);
        return res.status(500).json({ error: e.message });
    }
});

export default router;
