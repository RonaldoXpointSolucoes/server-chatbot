import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const convId = '8f34df06-dff0-40f7-bd5b-f2838bee0268';
  
  console.log("=== MESSAGES FOR CONVERSATION ===");
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('timestamp', { ascending: false })
    .limit(10);
  
  if (error) console.error(error);
  else console.log(JSON.stringify(messages, null, 2));
}

run();
