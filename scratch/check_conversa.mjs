import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
    try {
        console.log('=== BUSCANDO CONTATO ===');
        const { data: contacts, error: contactErr } = await supabase
            .from('contacts')
            .select('*')
            .or('phone.eq.5511975960999,phone.eq.11975960999');
            
        if (contactErr) {
            console.error('Erro ao buscar contato:', contactErr);
            return;
        }
        
        console.log('Contatos encontrados:', JSON.stringify(contacts, null, 2));
        
        if (contacts && contacts.length > 0) {
            for (const contact of contacts) {
                console.log(`\n=== CONVERSA PARA O CONTATO ${contact.name} (${contact.id}) ===`);
                const { data: convs, error: convErr } = await supabase
                    .from('conversations')
                    .select('*')
                    .eq('contact_id', contact.id);
                    
                if (convErr) console.error('Erro ao buscar conversas:', convErr);
                else console.log(JSON.stringify(convs, null, 2));
                
                if (convs && convs.length > 0) {
                    for (const conv of convs) {
                        console.log(`\n=== ULTIMAS 10 MENSAGENS DA CONVERSA ${conv.id} ===`);
                        const { data: messages, error: msgErr } = await supabase
                            .from('messages')
                            .select('*')
                            .eq('conversation_id', conv.id)
                            .order('timestamp', { ascending: false })
                            .limit(10);
                            
                        if (msgErr) console.error('Erro ao buscar mensagens:', msgErr);
                        else {
                            messages.reverse().forEach(m => {
                                console.log(`[${m.timestamp}] ${m.direction.toUpperCase()} (${m.sender_type}) [Status: ${m.status}]: ${m.text_content} | ID: ${m.whatsapp_message_id}`);
                            });
                        }
                    }
                }
            }
        }
        
    } catch (e) {
        console.error(e);
    }
})();
