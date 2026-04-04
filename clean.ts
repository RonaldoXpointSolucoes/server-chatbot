import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function clean() {
  const r1 = await supabase.from('messages').delete().neq('id', '0');
  const r2 = await supabase.from('contacts').delete().neq('id', '0');
  console.log('Database cleaned', r1.error || r1.status, r2.error || r2.status);
}
clean();
