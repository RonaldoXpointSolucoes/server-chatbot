import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const convId = 'b1fdbcfb-6665-476c-9bbe-2cc64399dd94';
  
  console.log("=== Detalhes da Conversa ===");
  const { data: conv, error: errConv } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', convId)
    .single();
    
  if (errConv) {
    console.error("Erro ao buscar conversa:", errConv);
  } else {
    console.log(JSON.stringify(conv, null, 2));
  }
  
  console.log("=== Mensagens da Conversa (Ordenadas por timestamp desc) ===");
  const { data: messages, error: errMsg } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('timestamp', { ascending: false })
    .limit(20);
    
  if (errMsg) {
    console.error("Erro ao buscar mensagens:", errMsg);
  } else {
    console.log(`Encontradas ${messages.length} mensagens`);
    messages.forEach(msg => {
      console.log(`[${msg.timestamp}] Sender: ${msg.sender_type} | Type: ${msg.message_type} | Content: "${msg.text_content}"`);
    });
  }
}

run();
