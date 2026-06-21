import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  const instanceId = 'bbf0e8d4-d9e5-4eb9-934a-dd76f09e29aa';
  const convId = '8f34df06-dff0-40f7-bd5b-f2838bee0268';
  
  console.log("=== COMPANY DADOS ===");
  const { data: company } = await supabase.from('companies').select('*').eq('id', tenantId).single();
  console.log(JSON.stringify({ id: company?.id, name: company?.name, global_ai_enabled: company?.global_ai_enabled, settings: company?.settings }, null, 2));

  console.log("=== INSTANCE DADOS ===");
  const { data: instance } = await supabase.from('whatsapp_instances').select('*').eq('id', instanceId).single();
  console.log(JSON.stringify({ id: instance?.id, display_name: instance?.display_name, status: instance?.status, settings: instance?.settings }, null, 2));

  console.log("=== BOTS DADOS ===");
  const { data: bots } = await supabase.from('bots').select('*').eq('tenant_id', tenantId);
  console.log(JSON.stringify(bots?.map(b => ({ id: b.id, name: b.name, status: b.status, autoReply: b.autoReply, channels: b.channels, test_mode: b.test_mode, test_phone: b.test_phone })), null, 2));

  console.log("=== CONVERSATION DADOS ===");
  const { data: conv } = await supabase.from('conversations').select('*').eq('id', convId).single();
  console.log(JSON.stringify({ id: conv?.id, status: conv?.status, ai_paused: conv?.ai_paused, last_message_preview: conv?.last_message_preview, contact_id: conv?.contact_id }, null, 2));

  console.log("=== RECENT MESSAGES ===");
  const { data: messages } = await supabase.from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('timestamp', { ascending: false })
    .limit(5);
  console.log(JSON.stringify(messages?.map(m => ({ id: m.id, direction: m.direction, sender_type: m.sender_type, text_content: m.text_content, timestamp: m.timestamp })), null, 2));
}

run().catch(console.error);
