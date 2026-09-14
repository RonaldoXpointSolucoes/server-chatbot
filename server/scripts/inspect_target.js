import { supabase } from '../src/supabase.js';

async function inspectTarget() {
  const targetPhone = '5511913539122';
  const targetMsgId = '3EB02C42E1034A81859B37';

  console.log('=== 1. BUSCA NA TABELA MESSAGES POR WHATSAPP_MESSAGE_ID ===');
  const { data: msgByWId, error: err1 } = await supabase
    .from('messages')
    .select('*')
    .eq('whatsapp_message_id', targetMsgId);
  console.log('Msg by whatsapp_message_id:', msgByWId, err1);

  console.log('\n=== 2. BUSCA NO OUTBOX (wa_outgoing_messages) ===');
  const { data: outbox, error: err2 } = await supabase
    .from('wa_outgoing_messages')
    .select('*')
    .like('chat_jid', `%${targetPhone}%`);
  console.log('Outbox by phone:', outbox, err2);

  console.log('\n=== 3. BUSCA EM CONTACTS ===');
  const { data: contacts, error: err3 } = await supabase
    .from('contacts')
    .select('*')
    .like('phone', `%913539122%`);
  console.log('Contacts found:', contacts, err3);

  console.log('\n=== 4. BUSCA EM CONVERSATIONS PARA OS CONTATOS ENCONTRADOS ===');
  if (contacts && contacts.length > 0) {
    const contactIds = contacts.map(c => c.id);
    const { data: convs, error: err4 } = await supabase
      .from('conversations')
      .select('*')
      .in('contact_id', contactIds);
    console.log('Conversations for contacts:', convs, err4);

    if (convs && convs.length > 0) {
      const convIds = convs.map(c => c.id);
      const { data: allMsgs, error: err5 } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', convIds);
      console.log('All messages for these conversations:', allMsgs, err5);
    }
  }

  process.exit(0);
}

inspectTarget().catch(e => {
  console.error(e);
  process.exit(1);
});
