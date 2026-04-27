require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('operation_logs').select('*').order('created_at', { ascending: false }).limit(5);
  console.log("Logs:", data);
}
run();
