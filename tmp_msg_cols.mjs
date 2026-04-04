import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMsg() {
  const { data: msgs, error } = await sb.from('messages').select('*').limit(1);
  console.log("Message keys:", Object.keys(msgs[0] || {}));
}

checkMsg();
