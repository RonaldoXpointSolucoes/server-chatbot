import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  console.log('--- BUSCANDO CONTATO ---');
  const { data: contacts, error: cErr } = await supabase.from('contacts').select('*').limit(1);
  if (cErr) {
    console.error(cErr);
  } else if (contacts && contacts.length > 0) {
    console.log('Contacts columns:', Object.keys(contacts[0]));
    console.log('Sample contact:', JSON.stringify(contacts[0], null, 2));
  } else {
    console.log('No contacts found.');
  }

  console.log('--- BUSCANDO CONVERSAS ---');
  const { data: convs, error: convErr } = await supabase.from('conversations').select('*').limit(1);
  if (convErr) {
    console.error(convErr);
  } else if (convs && convs.length > 0) {
    console.log('Conversations columns:', Object.keys(convs[0]));
    console.log('Sample conversation:', JSON.stringify(convs[0], null, 2));
  } else {
    console.log('No conversations found.');
  }
}

run();
