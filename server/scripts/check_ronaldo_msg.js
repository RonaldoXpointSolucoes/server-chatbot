import { supabase } from '../src/supabase.js';

async function check() {
  const targetMsgId = '3EB02C42E1034A81859B37';
  const { data: msg } = await supabase.from('messages').select('*').eq('whatsapp_message_id', targetMsgId);
  console.log('1. Mensagem 3EB02C42E1034A81859B37 em messages:', msg);

  // Busca contatos com phone 5511913539122
  const { data: contacts } = await supabase.from('contacts').select('*').like('phone', '%913539122%');
  console.log('2. Contatos:', contacts);

  // Busca conversas do contato
  if (contacts && contacts.length > 0) {
    const cIds = contacts.map(c => c.id);
    const { data: convs } = await supabase.from('conversations').select('*').in('contact_id', cIds);
    console.log('3. Conversas:', convs);
  }

  // Verifica a instância 5c78d358-d449-41c4-b396-a04ab20a39e4
  const { data: inst } = await supabase.from('whatsapp_instances').select('id, name, display_name, phone_number, tenant_id').eq('id', '5c78d358-d449-41c4-b396-a04ab20a39e4');
  console.log('4. Instância remetente:', inst);

  process.exit(0);
}

check();
