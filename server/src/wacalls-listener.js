import { supabase } from './supabase.js';

const getWaCallsUrl = () => {
    const envUrl = process.env.WACALLS_URL?.trim();
    if (envUrl && !envUrl.includes('172.17.0.1')) return envUrl;
    
    // Como rodamos localmente no mesmo container, usamos localhost:8080 por padrão
    return 'http://127.0.0.1:8080';
};
const WACALLS_URL = getWaCallsUrl();

async function hasActiveInstances() {
    try {
        const { count, error } = await supabase
            .from('whatsapp_instances')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'connected');
        
        if (error) return false;
        return (count || 0) > 0;
    } catch (err) {
        return false;
    }
}

export function startWaCallsListener() {
    let active = true;

    async function listen() {
        while (active) {
            try {
                // Só ativa a escuta se houver de fato instâncias ativas em uso
                const hasActive = await hasActiveInstances();
                if (!hasActive) {
                    // Sem instâncias conectadas. Aguarda 1 minuto e verifica novamente.
                    await new Promise(resolve => setTimeout(resolve, 60000));
                    continue;
                }

                console.log(`[WaCalls Background Listener] Conectando ao SSE em: ${WACALLS_URL}/api/events`);
                const response = await fetch(`${WACALLS_URL}/api/events`);
                if (!response.ok) {
                    throw new Error(`fetch failed: HTTP status ${response.status}`);
                }
                if (!response.body) {
                    throw new Error('fetch failed: Nenhum corpo de resposta retornado pelo servidor WaCalls');
                }

                let buffer = '';
                const reader = response.body.getReader();

                while (active) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const text = new TextDecoder().decode(value);
                    buffer += text;

                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // mantém a linha incompleta no buffer

                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            const dataStr = line.replace('data:', '').trim();
                            if (!dataStr) continue;
                            try {
                                const ev = JSON.parse(dataStr);
                                await handleWaCallsEvent(ev);
                            } catch (parseErr) {
                                // ignore
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn('[WaCalls Background Listener] Conexão pendente com WaCalls (reconectando...):', err.message);
            }
            
            // Aguarda 30 segundos antes de tentar reconectar se o WaCalls estiver offline
            if (active) {
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
    }

    listen();

    return {
        stop: () => {
            active = false;
        }
    };
}

async function handleWaCallsEvent(ev) {
    if (ev.type !== 'call-ended') return;

    const { sessionId, id: callId, reason, endedAt } = ev;
    
    console.log(`[WaCalls Listener] Chamada finalizada recebida. Session: ${sessionId}, Call: ${callId}, Reason: ${reason}`);

    try {
        // Aguarda 2 segundos para dar tempo do servidor Go salvar o histórico de chamadas no SQLite dele
        await new Promise(r => setTimeout(r, 2000));

        // 1. Obter os dados da chamada do histórico do WaCalls
        const historyRes = await fetch(`${WACALLS_URL}/api/sessions/${sessionId}/history`);
        if (!historyRes.ok) {
            console.error(`[WaCalls Listener] Falha ao obter histórico para a sessão ${sessionId}`);
            return;
        }
        
        const historyData = await historyRes.json();
        const callRecord = historyData.find(c => c.callId === callId);
        
        if (!callRecord) {
            console.warn(`[WaCalls Listener] Registro da chamada ${callId} não encontrado no histórico do WaCalls.`);
            return;
        }

        const { peer, direction, startedAt } = callRecord;
        const cleanPeer = peer.split('@')[0]; // ex: 5511999999999
        
        // 2. Buscar o contato no Supabase
        const { data: contact, error: contactErr } = await supabase
            .from('contacts')
            .select('id, tenant_id')
            .eq('instance_id', sessionId)
            .eq('phone', cleanPeer)
            .maybeSingle();

        if (contactErr || !contact) {
            console.warn(`[WaCalls Listener] Contato não encontrado no Supabase para o telefone ${cleanPeer} na instância ${sessionId}`);
            return;
        }

        // 3. Buscar ou criar a conversa ativa desse contato
        let { data: conversation, error: convErr } = await supabase
            .from('conversations')
            .select('id')
            .eq('tenant_id', contact.tenant_id)
            .eq('contact_id', contact.id)
            .eq('status', 'open')
            .maybeSingle();

        if (convErr || !conversation) {
            const { data: newConv, error: createConvErr } = await supabase
                .from('conversations')
                .insert({
                    tenant_id: contact.tenant_id,
                    contact_id: contact.id,
                    status: 'open'
                })
                .select('id')
                .single();

            if (createConvErr || !newConv) {
                console.error(`[WaCalls Listener] Falha ao criar conversa para registrar chamada:`, createConvErr);
                return;
            }
            conversation = newConv;
        }

        // 4. Formatar a mensagem do sistema
        const durationSec = startedAt ? Math.round((endedAt - startedAt) / 1000) : 0;
        
        let textContent = '';
        if (reason === 'timeout' || reason === 'rejected' || durationSec === 0) {
            textContent = direction === 'outbound' 
                ? `📞 Ligação de voz efetuada para o cliente, mas não foi atendida.` 
                : `📞 Chamada de voz recebida perdida (não atendida).`;
        } else {
            const minStr = Math.floor(durationSec / 60);
            const secStr = durationSec % 60;
            const durFormatted = durationSec >= 60 ? `${minStr} min e ${secStr} s` : `${secStr} segundos`;
            
            textContent = direction === 'outbound'
                ? `📞 Ligação de voz efetuada para o cliente. Duração: ${durFormatted}.`
                : `📞 Chamada de voz recebida do cliente atendida. Duração: ${durFormatted}.`;
        }

        // 5. Inserir a mensagem no banco de dados Supabase
        const { error: insertErr } = await supabase
            .from('messages')
            .insert({
                tenant_id: contact.tenant_id,
                conversation_id: conversation.id,
                direction: direction === 'outbound' ? 'outbound' : 'inbound',
                message_type: 'text',
                status: 'read',
                text_content: textContent,
                sender_type: 'system',
                timestamp: new Date(endedAt).toISOString()
            });

        if (insertErr) {
            console.error(`[WaCalls Listener] Erro ao inserir mensagem de chamada no Supabase:`, insertErr.message);
        } else {
            console.log(`[WaCalls Listener] Registro de chamada salvo no histórico com sucesso para a conversa ${conversation.id}`);
        }
    } catch (e) {
        console.error(`[WaCalls Listener Error] Falha ao registrar chamada terminada:`, e.message);
    }
}
