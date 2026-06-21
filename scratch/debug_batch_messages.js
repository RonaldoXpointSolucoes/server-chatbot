import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const { data: messages, error } = await supabase.from('messages')
    .select('*')
    .gte('timestamp', '2026-06-21T14:05:50Z')
    .lte('timestamp', '2026-06-21T14:06:20Z');

  if (error) {
    console.error(error);
    return;
  }

  console.log(`=== MESSAGES FOUND: ${messages.length} ===`);
  messages.forEach(m => {
    console.log(JSON.stringify({
      id: m.id,
      instance_id: m.instance_id,
      whatsapp_message_id: m.whatsapp_message_id,
      conversation_id: m.conversation_id,
      direction: m.direction,
      sender_type: m.sender_type,
      text_content: m.text_content,
      timestamp: m.timestamp
    }, null, 2));
  });
}

run().catch(console.error);
