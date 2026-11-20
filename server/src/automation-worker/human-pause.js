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
                reason
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
    let targetConvId = conversationId || null;

    try {
        if (!targetConvId && tenantId && (contactId || cleanPhone || jid)) {
            let contactIds = contactId ? [contactId] : [];
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
            }

            if (contactIds.length > 0) {
                let convQuery = supabase
                    .from('conversations')
                    .select('id')
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
                }
            }
        }

        if (targetConvId) {
            if (AutomationWorker && targetConvId !== conversationId) {
                AutomationWorker.markHumanPause?.({ conversationId: targetConvId, contactId, jid, phone: cleanPhone, reason });
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
