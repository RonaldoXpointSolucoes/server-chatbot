import { supabase } from '../src/supabase.js';

async function checkOutbox() {
  const { data: outbox } = await supabase
    .from('wa_outgoing_messages')
    .select('*')
    .like('chat_jid', '%913539122%');
  console.log('Outbox para 913539122:', outbox);

  const { data: recentOutbox } = await supabase
    .from('wa_outgoing_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Últimas 5 outbox gerais:', recentOutbox);

  process.exit(0);
}

checkOutbox();
