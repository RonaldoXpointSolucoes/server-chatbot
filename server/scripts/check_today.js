import { supabase } from '../src/supabase.js';

async function checkTodayEvents() {
  console.log('=== CONVERSAS ATUALIZADAS HOJE (2026-09-14) ===');
  const { data: todayConvs } = await supabase
    .from('conversations')
    .select('id, tenant_id, contact_id, instance_id, status, unread_count, last_message_preview, last_message_at, updated_at')
    .gte('updated_at', '2026-09-14T00:00:00Z')
    .order('updated_at', { ascending: false });
  console.log(`Encontradas ${todayConvs?.length} conversas atualizadas hoje:`);
  console.log(todayConvs?.slice(0, 15));

  console.log('\n=== MENSAGENS ENVIADAS HOJE (2026-09-14) COM FROM_ME OU OUTBOUND ===');
  const { data: todayMsgs } = await supabase
    .from('messages')
    .select('id, tenant_id, conversation_id, direction, sender_type, status, text_content, whatsapp_message_id, instance_id, timestamp')
    .gte('timestamp', '2026-09-14T00:00:00Z')
    .eq('direction', 'outbound')
    .order('timestamp', { ascending: false })
    .limit(10);
  console.log(`Últimas mensagens outbound de hoje:`);
  console.log(todayMsgs);

  process.exit(0);
}

checkTodayEvents();
