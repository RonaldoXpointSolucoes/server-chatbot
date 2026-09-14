import { supabase } from '../src/supabase.js';

async function inspect() {
  console.log('=== 1. ÚLTIMAS MENSAGENS EM WA_OUTGOING_MESSAGES ===');
  const { data: outbox, error: outErr } = await supabase
    .from('wa_outgoing_messages')
    .select('id, instance_id, tenant_id, chat_jid, status, body, attempts, last_error, created_at, sent_at')
    .order('created_at', { ascending: false })
    .limit(10);
  if (outErr) console.error('Erro outbox:', outErr);
  else console.log(JSON.stringify(outbox, null, 2));

  console.log('\n=== 2. ÚLTIMAS MENSAGENS NA TABELA MESSAGES ===');
  const { data: msgs, error: msgErr } = await supabase
    .from('messages')
    .select('id, conversation_id, direction, sender_type, status, text_content, whatsapp_message_id, created_at, timestamp')
    .order('created_at', { ascending: false })
    .limit(10);
  if (msgErr) console.error('Erro messages:', msgErr);
  else console.log(JSON.stringify(msgs, null, 2));

  console.log('\n=== 3. ÚLTIMAS CONVERSAS EM CONVERSATIONS ===');
  const { data: convs, error: convErr } = await supabase
    .from('conversations')
    .select('id, contact_id, instance_id, status, unread_count, last_message_preview, last_message_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(10);
  if (convErr) console.error('Erro convs:', convErr);
  else console.log(JSON.stringify(convs, null, 2));

  console.log('\n=== 4. ÚLTIMOS LOGS EM SYSTEM_LOGS ===');
  const { data: logs, error: logErr } = await supabase
    .from('system_logs')
    .select('id, event_type, message, details, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  if (logErr) console.error('Erro system_logs:', logErr);
  else console.log(JSON.stringify(logs, null, 2));

  console.log('\n=== 5. ÚLTIMAS MENSAGENS EM WA_INCOMING_MESSAGES ===');
  const { data: incoming, error: incErr } = await supabase
    .from('wa_incoming_messages')
    .select('id, instance_id, chat_jid, message_id, from_me, push_name, body, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  if (incErr) console.error('Erro incoming:', incErr);
  else console.log(JSON.stringify(incoming, null, 2));

  process.exit(0);
}

inspect().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
