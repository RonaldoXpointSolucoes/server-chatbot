import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const phone = '5511975960999';
  console.log('--- BUSCANDO CONTATO ---');
  const { data: contacts, error: cErr } = await supabase.from('contacts').select('*').ilike('phone', `%${phone.substring(4)}%`);
  if (cErr) console.error(cErr);
  else console.log(JSON.stringify(contacts, null, 2));

  if (contacts && contacts.length > 0) {
    const contactIds = contacts.map(c => c.id);
    console.log('\n--- BUSCANDO CONVERSAS ---');
    const { data: convs, error: convErr } = await supabase.from('conversations').select('*').in('contact_id', contactIds);
    if (convErr) console.error(convErr);
    else console.log(JSON.stringify(convs, null, 2));
  }

  console.log('\n--- BUSCANDO INSTÂNCIA COMERCIAL ---');
  const { data: instances, error: instErr } = await supabase.from('whatsapp_instances').select('*');
  if (instErr) console.error(instErr);
  else console.log(JSON.stringify(instances.map(i => ({ id: i.id, display_name: i.display_name, status: i.status, settings: i.settings })), null, 2));
}

run();
