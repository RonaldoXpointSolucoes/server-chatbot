const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.rpc('execute_sql', { query: "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'apply_message_automations';" });
  console.log(data || error);
}
run();
