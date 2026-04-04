import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await sb.from('contacts').select('*').limit(1);
  console.log(JSON.stringify(data?.[0] || data, null, 2));
  console.log("Error:", error);
}

run();
