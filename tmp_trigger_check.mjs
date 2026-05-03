import dotenv from 'dotenv';
dotenv.config({path: './.env'});
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.rpc('run_sql', { sql: "SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE event_object_table = 'conversations';" });
  console.log(data, error);
}

check();
