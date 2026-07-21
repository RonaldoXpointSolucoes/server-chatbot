import { supabase } from './supabase.js';
import sessionManager from './session-manager/index.js';

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
        const rows = Array.isArray(historyData) ? historyData : (historyData.rows || []);
        const callRecord = rows.find(c => c.callId === callId);
        
        if (!callRecord) {
            console.warn(`[WaCalls Listener] Registro da chamada ${callId} não encontrado no histórico do WaCalls.`);
            return;
        }

        const { peer, direction, startedAt } = callRecord;
        let cleanPeer = peer.split('@')[0]; // ex: 5511999999999 ou 215938708324551
        
        const isLid = peer.includes('@lid') || (cleanPeer.length >= 14 && !cleanPeer.startsWith('55')) || cleanPeer.length >= 15;

        // Se for um LID, tentamos resolver para o número de telefone real (PN)
        if (isLid) {
            let resolved = false;
            const lidJid = cleanPeer.endsWith('@lid') ? cleanPeer : `${cleanPeer}@lid`;

            // 1. Resolver via socket signalRepository (RAM)
            const sock = sessionManager.getSocket(sessionId);
            if (sock?.signalRepository?.lidMapping) {
                try {
                    const resolvedPn = await sock.signalRepository.lidMapping.getPNForLID(lidJid);
                    if (resolvedPn) {
                        cleanPeer = resolvedPn.split('@')[0].split(':')[0];
                        console.log(`[WaCalls Listener] LID resolvido via Socket para o telefone: ${cleanPeer}`);
                        resolved = true;
                    }
                } catch (err) {
                    // Silencioso
                }
            }

            // 2. Resolver via sessionCaches em memória
            if (!resolved) {
                try {
                    const { sessionCaches } = await import('./session-manager/auth.js');
                    const memCache = sessionCaches.get(sessionId);
                    if (memCache) {
                        const mappedPhone = memCache.get(`lid-mapping-${cleanPeer}_reverse`);
                        if (mappedPhone) {
                            cleanPeer = typeof mappedPhone === 'string' ? mappedPhone : String(mappedPhone);
                            console.log(`[WaCalls Listener] LID resolvido via Memory Cache para o telefone: ${cleanPeer}`);
                            resolved = true;
                        }
                    }
                } catch (memErr) {}
            }

            // 3. Resolver via DB wa_auth_keys
            if (!resolved) {
                try {
                    const { data: dbKey } = await supabase
                        .from('wa_auth_keys')
                        .select('key_data')
                        .eq('instance_id', sessionId)
                        .eq('key_name', `lid-mapping-${cleanPeer}_reverse`)
                        .maybeSingle();
                    if (dbKey && dbKey.key_data) {
                        cleanPeer = typeof dbKey.key_data === 'string' ? dbKey.key_data : String(dbKey.key_data);
                        console.log(`[WaCalls Listener] LID resolvido via DB para o telefone: ${cleanPeer}`);
                        resolved = true;
                    }
                } catch (dbErr) {
                    console.warn(`[WaCalls Listener] Erro ao buscar reverse LID mapping no DB:`, dbErr.message);
                }
            }
        }

        // 2. Buscar o contato no Supabase (suportando variações do 9º dígito brasileiro e buscas por JID)
        const getBrazilianPhoneVariations = (phone) => {
            const clean = phone.replace(/\D/g, '');
            if (!clean.startsWith('55')) return [clean];
            if (clean.length === 13) {
                const ddd = clean.substring(2, 4);
                const local = clean.substring(4);
                if (local.startsWith('9')) {
                    const phone8 = '55' + ddd + local.substring(1);
                    return [clean, phone8];
                }
            } else if (clean.length === 12) {
                const ddd = clean.substring(2, 4);
                const local = clean.substring(4);
                const phone9 = '55' + ddd + '9' + local;
                return [clean, phone9];
            }
            return [clean];
        };

        const phoneVariations = getBrazilianPhoneVariations(cleanPeer);

        // Obter tenant_id da instância
        const { data: instData } = await supabase
            .from('whatsapp_instances')
            .select('tenant_id')
            .eq('id', sessionId)
            .maybeSingle();
            
        const tenantId = instData?.tenant_id;

        let contact = null;
        let { data: foundContacts, error: contactErr } = await supabase
            .from('contacts')
            .select('id, tenant_id')
            .eq('instance_id', sessionId)
            .in('phone', phoneVariations);

        if (foundContacts && foundContacts.length > 0) {
            contact = foundContacts[0];
        }

        // Fallback: busca por tenant_id se não encontrou por instance_id
        if (!contact && tenantId) {
            const { data: tContacts } = await supabase
                .from('contacts')
                .select('id, tenant_id')
                .eq('tenant_id', tenantId)
                .in('phone', phoneVariations);

            if (tContacts && tContacts.length > 0) {
                contact = tContacts[0];
            }
        }

        // Fallback: busca por whatsapp_jid contendo cleanPeer
        if (!contact) {
            let jidQuery = supabase
                .from('contacts')
                .select('id, tenant_id')
                .ilike('whatsapp_jid', `%${cleanPeer}%`);
            if (tenantId) jidQuery = jidQuery.eq('tenant_id', tenantId);
            const { data: jidContacts } = await jidQuery;
            if (jidContacts && jidContacts.length > 0) {
                contact = jidContacts[0];
            }
        }

        // Se ainda não encontrou e temos tenantId, cria o contato automaticamente para registrar a chamada
        if (!contact && tenantId) {
            console.log(`[WaCalls Listener] Contato não encontrado. Criando registro automático para ${cleanPeer}...`);
            const { data: newContact, error: newContactErr } = await supabase
                .from('contacts')
                .insert({
                    tenant_id: tenantId,
                    instance_id: sessionId,
                    phone: cleanPeer,
                    whatsapp_jid: cleanPeer.includes('@') ? cleanPeer : `${cleanPeer}@s.whatsapp.net`,
                    name: `Contato (${cleanPeer})`,
                    created_at: new Date().toISOString()
                })
                .select('id, tenant_id')
                .single();

            if (!newContactErr && newContact) {
                contact = newContact;
            } else {
                console.error(`[WaCalls Listener] Falha ao criar contato automático para chamada:`, newContactErr?.message);
            }
        }

        if (!contact) {
            console.warn(`[WaCalls Listener] Não foi possível localizar ou criar contato para ${cleanPeer} na instância ${sessionId}`);
            return;
        }

        // 3. Buscar ou criar a conversa ativa desse contato (buscando sem restrição de status para evitar violação de UNIQUE)
        let { data: conversations, error: convErr } = await supabase
            .from('conversations')
            .select('id, status, instance_id')
            .eq('tenant_id', contact.tenant_id)
            .eq('contact_id', contact.id);

        if (convErr) {
            console.error(`[WaCalls Listener] Erro ao buscar conversa:`, convErr);
            return;
        }

        let conversation = null;
        if (conversations && conversations.length > 0) {
            conversation = conversations.find(c => c.instance_id === sessionId) ||
                           conversations.find(c => !c.instance_id) ||
                           conversations[0];
        }

        if (conversation) {
            if (conversation.status !== 'open') {
                const { error: updateErr } = await supabase
                    .from('conversations')
                    .update({ status: 'open' })
                    .eq('id', conversation.id);
                if (updateErr) {
                    console.error(`[WaCalls Listener] Falha ao reabrir conversa existente:`, updateErr);
                }
            }
        } else {
            const { data: newConv, error: createConvErr } = await supabase
                .from('conversations')
                .insert({
                    tenant_id: contact.tenant_id,
                    contact_id: contact.id,
                    instance_id: sessionId,
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
