require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function clean() {
  await supabase.from('messages').delete().neq('id', '0');
  await supabase.from('contacts').delete().neq('id', '0');
  console.log('Database cleaned');
}
clean();
