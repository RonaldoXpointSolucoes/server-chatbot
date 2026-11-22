import { supabase as defaultSupabase } from '../supabase.js';
import { getBrPhoneVariations } from '../event-processor/helpers.js';

function normalizeJidList(jid, phone) {
    const candidates = new Set();
    const rawDigits = String(phone || jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    if (jid && typeof jid === 'string' && !jid.includes('@lid')) {
        candidates.add(jid.trim());
    }
    if (rawDigits) {
        for (const v of getBrPhoneVariations(rawDigits)) {
            candidates.add(`${v}@s.whatsapp.net`);
        }
    }
    return {
        digits: rawDigits,
        jids: Array.from(candidates)
    };
}

export const DEFAULT_HUMAN_CONVERSATION_WINDOW_MS = 30 * 60 * 1000;

/**
 * Avalia no histórico recente da conversa se o atendimento está sob tutela humana:
 * bloqueia respostas automáticas caso um atendente humano tenha enviado mensagem
 * dentro da janela ativa (padrão 30 min) e não tenha havido retomada explícita da IA depois.
 */
export function evaluateRecentHumanConversationGuard(
    messages = [],
    { nowMs = Date.now(), windowMs = DEFAULT_HUMAN_CONVERSATION_WINDOW_MS } = {}
) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return { blocked: false, reason: 'no_messages' };
    }

    const sorted = [...messages].sort((a, b) => {
        const ta = new Date(a?.timestamp || a?.created_at || 0).getTime();
        const tb = new Date(b?.timestamp || b?.created_at || 0).getTime();
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });

    for (const msg of sorted) {
        if (!msg) continue;
        const tsMs = new Date(msg.timestamp || msg.created_at || 0).getTime();
        if (!Number.isFinite(tsMs) || tsMs <= 0) continue;

        const sender = String(msg.sender_type || '').toLowerCase();
        const text = String(msg.text_content || '');

        if (
            (sender === 'system' && text.includes('IA Luna Retomada')) ||
            msg.raw_payload?.ai_resumed === true
        ) {
            return { blocked: false, reason: 'explicit_ai_resume' };
        }

        if (sender === 'human' || sender === 'agent') {
            const ageMs = nowMs - tsMs;
            if (ageMs >= -60000 && ageMs <= windowMs) {
                return {
                    blocked: true,
                    reason: 'recent_human_operator_message',
                    lastHumanAt: new Date(tsMs).toISOString(),
                    ageMs: Math.max(0, ageMs)
                };
            }
            return { blocked: false, reason: 'outside_human_window' };
        }
    }

    return { blocked: false, reason: 'no_recent_human_message' };
}

export async function fetchRecentHumanConversationGuard({
    supabase = defaultSupabase,
    conversationId,
    nowMs = Date.now(),
    windowMs = DEFAULT_HUMAN_CONVERSATION_WINDOW_MS
} = {}) {
    if (!supabase || !conversationId) {
        return { blocked: false, reason: 'missing_params' };
    }
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('sender_type, direction, text_content, timestamp, raw_payload')
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: false })
            .limit(20);

        if (error) {
            console.warn('[HumanPause] Aviso ao checar histórico humano recente:', error.message);
            return { blocked: false, reason: 'query_error' };
        }
        return evaluateRecentHumanConversationGuard(data || [], { nowMs, windowMs });
    } catch (err) {
        console.warn('[HumanPause] Exceção ao checar histórico humano recente:', err?.message || err);
        return { blocked: false, reason: 'exception' };
    }
}

/**
 * Cancels pending/in-flight AI replies in RAM immediately and persists pause state
 * (`ai_paused: true`, `ai_paused_manually: true`, `status: 'open'`) across conversations and FlowEngine.
 */
export async function pauseAiImmediatelyForHumanOperator({
    supabase = defaultSupabase,
    AutomationWorker = null,
    tenantId = null,
    instanceId = null,
    conversationId = null,
    contactId = null,
    jid = null,
    phone = null,
    reason = 'envio_operador_humano'
} = {}) {
    const cleanPhone = String(phone || jid || '').split('@')[0].split(':')[0].replace(/\D/g, '') || null;
    const cancelTargets = [conversationId, contactId, jid, cleanPhone].filter(Boolean);

    if (AutomationWorker) {
        if (typeof AutomationWorker.markHumanPause === 'function') {
            AutomationWorker.markHumanPause({
                conversationId,
                contactId,
                jid,
                phone: cleanPhone,
                reason,
                ttlMs: DEFAULT_HUMAN_CONVERSATION_WINDOW_MS
            });
        }
        if (typeof AutomationWorker.cancelPendingMessage === 'function') {
            for (const target of cancelTargets) {
                AutomationWorker.cancelPendingMessage(target, reason);
            }
        }
    }

    if (!supabase) return { ok: false, reason: 'missing_supabase' };

    const nowIso = new Date().toISOString();
    const pauseUntilIso = new Date(Date.now() + DEFAULT_HUMAN_CONVERSATION_WINDOW_MS).toISOString();
    let targetConvId = conversationId || null;
    let resolvedContactId = contactId || null;

    try {
        if (!targetConvId && tenantId && (resolvedContactId || cleanPhone || jid)) {
            let contactIds = resolvedContactId ? [resolvedContactId] : [];
            if (contactIds.length === 0 && (cleanPhone || jid)) {
                const vars = cleanPhone ? getBrPhoneVariations(cleanPhone) : [];
                let contactsQuery = supabase
                    .from('contacts')
                    .select('id')
                    .eq('tenant_id', tenantId);
                if (vars.length > 0) {
                    contactsQuery = contactsQuery.in('phone', vars);
                } else if (jid) {
                    contactsQuery = contactsQuery.eq('whatsapp_jid', jid);
                }
                const { data: matchedContacts } = await contactsQuery.limit(5);
                contactIds = (matchedContacts || []).map((c) => c.id).filter(Boolean);
                if (!resolvedContactId && contactIds[0]) {
                    resolvedContactId = contactIds[0];
                }
            }

            if (contactIds.length > 0) {
                let convQuery = supabase
                    .from('conversations')
                    .select('id, contact_id')
                    .eq('tenant_id', tenantId)
                    .in('contact_id', contactIds)
                    .order('last_message_at', { ascending: false })
                    .limit(1);

                if (instanceId) {
                    convQuery = convQuery.eq('instance_id', instanceId);
                }

                const { data: latestConv } = await convQuery.maybeSingle();
                if (latestConv?.id) {
                    targetConvId = latestConv.id;
                    if (!resolvedContactId && latestConv.contact_id) {
                        resolvedContactId = latestConv.contact_id;
                    }
                }
            }
        }

        if (targetConvId) {
            if (AutomationWorker && targetConvId !== conversationId) {
                AutomationWorker.markHumanPause?.({
                    conversationId: targetConvId,
                    contactId: resolvedContactId,
                    jid,
                    phone: cleanPhone,
                    reason,
                    ttlMs: DEFAULT_HUMAN_CONVERSATION_WINDOW_MS
                });
                AutomationWorker.cancelPendingMessage?.(targetConvId, reason);
            }

            const { error: updErr } = await supabase
                .from('conversations')
                .update({
                    status: 'open',
                    ai_paused: true,
                    ai_paused_manually: true,
                    updated_at: nowIso
                })
                .eq('id', targetConvId);

            if (updErr) {
                console.warn('[HumanPause] Aviso ao pausar conversa no banco:', updErr.message);
            }
        }

        if (resolvedContactId) {
            await supabase
                .from('contacts')
                .update({ bot_paused_until: pauseUntilIso })
                .eq('id', resolvedContactId);
        }

        // Garante que fluxos visuais (Typebot / FlowEngine) também entreguem controle ao operador humano
        if (tenantId) {
            const { jids } = normalizeJidList(jid, cleanPhone);
            if (jids.length > 0) {
                await supabase
                    .from('conversation_states')
                    .update({ status: 'HANDOFF_HUMAN', updated_at: nowIso })
                    .eq('tenant_id', tenantId)
                    .eq('status', 'BOT_ACTIVE')
                    .in('remote_jid', jids);
            }
        }

        return { ok: true, conversationId: targetConvId };
    } catch (err) {
        console.warn('[HumanPause] Erro não bloqueante ao pausar IA após envio humano:', err?.message || err);
        return { ok: false, error: err?.message || String(err) };
    }
}
