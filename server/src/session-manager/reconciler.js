import { supabase } from '../supabase.js';
import { isInstanceAllowedForNode } from './index.js';

/**
 * Reconciliador em background para garantir integridade absoluta de mensagens.
 * Verifica mensagens em wa_outgoing_messages que foram enviadas com sucesso
 * mas por alguma eventualidade de rede/concorrência ainda não constam na tabela messages.
 */
let isReconciling = false;
let reconcilingStartedAt = 0;
let isFirstBootReconcile = true;
const reconciledOutboxIds = new Set();

function getReconcilePhoneVariations(phoneStr) {
    if (!phoneStr) return [];
    const clean = String(phoneStr).replace(/\D/g, '');
    if (!clean) return [];
    const res = [clean];
    if (clean.startsWith('55') && clean.length === 13 && clean.charAt(4) === '9') {
        res.push(clean.substring(0, 4) + clean.substring(5));
    } else if (clean.startsWith('55') && clean.length === 12) {
        res.push(clean.substring(0, 4) + '9' + clean.substring(4));
    }
    return Array.from(new Set(res));
}

export async function runOutgoingReconciliation() {
    if (isReconciling && reconcilingStartedAt && (Date.now() - reconcilingStartedAt > 45000)) {
        isReconciling = false;
    }
    if (isReconciling) return;
    isReconciling = true;
    reconcilingStartedAt = Date.now();

    try {
        const lookbackMs = isFirstBootReconcile ? (4 * 60 * 60 * 1000) : (10 * 60 * 1000);
        const batchLimit = isFirstBootReconcile ? 60 : 25;
        isFirstBootReconcile = false;

        const lookbackIso = new Date(Date.now() - lookbackMs).toISOString();
        const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();

        // Busca mensagens enviadas com mais de 60 segundos de janela (evita colidir com upserts ao vivo do Baileys)
        const { data: outMsgs, error: outErr } = await supabase
            .from('wa_outgoing_messages')
            .select('*')
            .eq('status', 'sent')
            .gte('sent_at', lookbackIso)
            .lte('sent_at', sixtySecondsAgo)
            .order('sent_at', { ascending: true })
            .limit(batchLimit);

        if (outErr || !outMsgs || outMsgs.length === 0) {
            return;
        }

        for (const msg of outMsgs) {
            if (!msg.id || reconciledOutboxIds.has(msg.id)) continue;
            if (!isInstanceAllowedForNode(msg.instance_id, msg.tenant_id)) continue;

            const markReconciled = () => {
                reconciledOutboxIds.add(msg.id);
                if (reconciledOutboxIds.size > 2000) {
                    const first = reconciledOutboxIds.values().next().value;
                    if (first !== undefined) reconciledOutboxIds.delete(first);
                }
            };

            const rawBody = (msg.body || '').trim();
            if (!rawBody) {
                markReconciled();
                continue;
            }

            const options = typeof msg.options === 'object' && msg.options !== null ? msg.options : {};
            const realWaMsgId = options?.messageId;

            // 1. Checagem direta por whatsapp_message_id oficial na mesma instância (outbound)
            if (realWaMsgId) {
                const { data: existingById } = await supabase
                    .from('messages')
                    .select('id')
                    .eq('tenant_id', msg.tenant_id)
                    .eq('instance_id', msg.instance_id)
                    .eq('direction', 'outbound')
                    .eq('whatsapp_message_id', realWaMsgId)
                    .limit(1);

                if (existingById && existingById.length > 0) {
                    markReconciled();
                    continue;
                }
            }

            const cleanPhone = String(msg.chat_jid || '')
                .replace('@s.whatsapp.net', '')
                .replace('@lid', '')
                .replace('@g.us', '')
                .split(':')[0]
                .trim();
            if (!cleanPhone) {
                markReconciled();
                continue;
            }

            // 2. Verifica se a mensagem já está salva na tabela clássica messages nesta instância (janela robusta de +-120s)
            const msgTime = new Date(msg.sent_at || msg.created_at).getTime();
            const { data: existing } = await supabase
                .from('messages')
                .select('id')
                .eq('tenant_id', msg.tenant_id)
                .eq('instance_id', msg.instance_id)
                .eq('direction', 'outbound')
                .eq('text_content', rawBody)
                .gte('timestamp', new Date(msgTime - 120000).toISOString())
                .lte('timestamp', new Date(msgTime + 120000).toISOString())
                .limit(1);

            if (existing && existing.length > 0) {
                markReconciled();
                continue;
            }

            // Localizar contato (suportando variações de 8 e 9 dígitos em DDDs brasileiros)
            const phoneVars = getReconcilePhoneVariations(cleanPhone);
            const orFilter = phoneVars.map(p => `phone.eq.${p},whatsapp_jid.ilike.%${p}%`).join(',');
            const { data: cData } = await supabase
                .from('contacts')
                .select('id, name')
                .eq('tenant_id', msg.tenant_id)
                .or(orFilter)
                .limit(1);

            if (!cData || cData.length === 0) {
                markReconciled();
                continue;
            }
            const contact = cData[0];

            // Localizar conversa
            const { data: convData } = await supabase
                .from('conversations')
                .select('id, last_message_at')
                .eq('tenant_id', msg.tenant_id)
                .eq('contact_id', contact.id)
                .order('updated_at', { ascending: false })
                .limit(1);

            if (!convData || convData.length === 0) {
                markReconciled();
                continue;
            }
            const conv = convData[0];

            // 3. Verificação final no escopo da conversa para evitar duplicata de outbound
            const { data: convExisting } = await supabase
                .from('messages')
                .select('id')
                .eq('conversation_id', conv.id)
                .eq('direction', 'outbound')
                .eq('text_content', rawBody)
                .gte('timestamp', new Date(msgTime - 180000).toISOString())
                .lte('timestamp', new Date(msgTime + 180000).toISOString())
                .limit(1);

            if (convExisting && convExisting.length > 0) {
                markReconciled();
                continue;
            }

            const waMsgId = realWaMsgId || `OUT_${msg.id.substring(0, 18)}`;
            const isHuman = rawBody.startsWith('*') && rawBody.includes(':*');
            const senderType = isHuman ? 'human' : 'bot';
            const msgTimestamp = msg.sent_at || msg.created_at;

            const payloadToInsert = {
                tenant_id: msg.tenant_id,
                instance_id: msg.instance_id,
                conversation_id: conv.id,
                direction: 'outbound',
                message_type: msg.message_type || 'text',
                status: 'SERVER_ACK',
                text_content: rawBody,
                whatsapp_message_id: waMsgId,
                sender_type: senderType,
                timestamp: msgTimestamp,
                raw_payload: {
                    key: {
                        id: waMsgId,
                        remoteJid: msg.chat_jid,
                        fromMe: true
                    },
                    message: {
                        conversation: rawBody
                    }
                }
            };

            const { error: insErr } = await supabase
                .from('messages')
                .insert([payloadToInsert]);

            if (!insErr) {
                markReconciled();
                console.log(`[AutoReconciler] 🛡️ Mensagem recuperada e salva com sucesso para ${contact.name} (${cleanPhone}): ${rawBody.substring(0, 40)}...`);
                if (!conv.last_message_at || new Date(msgTimestamp) >= new Date(conv.last_message_at)) {
                    await supabase
                        .from('conversations')
                        .update({
                            last_message_preview: rawBody.slice(0, 150),
                            last_message_at: msgTimestamp,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', conv.id);
                }
            }
        }
    } catch (e) {
        // Falhas no reconciliador em background não afetam o fluxo principal
    } finally {
        isReconciling = false;
    }
}
