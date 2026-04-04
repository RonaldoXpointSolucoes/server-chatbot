import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function dumpMsg() {
  const { data: msgs, error } = await sb.from('messages').select('*').limit(3);
  console.log(JSON.stringify(msgs, null, 2));
}

dumpMsg();
