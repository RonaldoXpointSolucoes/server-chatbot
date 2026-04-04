import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function check() {
  const { data: msgs } = await supabase.from('messages').select('*').order('timestamp', { ascending: false }).limit(3);
  console.log("Recent msg contact IDs:", msgs.map(m => m.contact_id));
  
  for (let m of msgs) {
    const { data: contactRow } = await supabase.from('contacts').select('evolution_remote_jid').eq('id', m.contact_id).single();
    console.log(`Msg ${m.id} -> contactRow:`, contactRow);
  }
}
check();
