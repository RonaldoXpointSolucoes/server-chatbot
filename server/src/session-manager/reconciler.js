import { supabase } from '../supabase.js';

/**
 * Reconciliador em background para garantir integridade absoluta de mensagens.
 * Verifica mensagens em wa_outgoing_messages que foram enviadas com sucesso
 * mas por alguma eventualidade de rede/concorrência ainda não constam na tabela messages.
 */
let isReconciling = false;

export async function runOutgoingReconciliation() {
    if (isReconciling) return;
    isReconciling = true;

    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString();

        // Busca mensagens enviadas recentemente (janela entre 10s e 5m atrás)
        const { data: outMsgs, error: outErr } = await supabase
            .from('wa_outgoing_messages')
            .select('*')
            .eq('status', 'sent')
            .gte('sent_at', fiveMinutesAgo)
            .lte('sent_at', tenSecondsAgo)
            .order('sent_at', { ascending: true })
            .limit(20);

        if (outErr || !outMsgs || outMsgs.length === 0) {
            return;
        }

        for (const msg of outMsgs) {
            const rawBody = (msg.body || '').trim();
            if (!rawBody) continue;

            const cleanPhone = String(msg.chat_jid || '')
                .replace('@s.whatsapp.net', '')
                .replace('@lid', '')
                .replace('@g.us', '')
                .split(':')[0]
                .trim();
            if (!cleanPhone) continue;

            // Verifica se a mensagem já está salva na tabela clássica messages
            const { data: existing } = await supabase
                .from('messages')
                .select('id')
                .eq('tenant_id', msg.tenant_id)
                .eq('text_content', rawBody)
                .gte('timestamp', new Date(new Date(msg.sent_at || msg.created_at).getTime() - 15000).toISOString())
                .lte('timestamp', new Date(new Date(msg.sent_at || msg.created_at).getTime() + 15000).toISOString())
                .limit(1);

            if (existing && existing.length > 0) {
                continue;
            }

            // Localizar contato
            const { data: cData } = await supabase
                .from('contacts')
                .select('id, name')
                .eq('tenant_id', msg.tenant_id)
                .or(`phone.eq.${cleanPhone},whatsapp_jid.ilike.%${cleanPhone}%`)
                .limit(1);

            if (!cData || cData.length === 0) continue;
            const contact = cData[0];

            // Localizar conversa
            const { data: convData } = await supabase
                .from('conversations')
                .select('id, last_message_at')
                .eq('tenant_id', msg.tenant_id)
                .eq('contact_id', contact.id)
                .order('updated_at', { ascending: false })
                .limit(1);

            if (!convData || convData.length === 0) continue;
            const conv = convData[0];

            const options = typeof msg.options === 'object' ? msg.options : {};
            const waMsgId = options?.messageId || `OUT_${msg.id.substring(0, 18)}`;
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
