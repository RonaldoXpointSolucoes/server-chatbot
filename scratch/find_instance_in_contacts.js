import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const target = 'ae5bd365-b881-4662-bbb2-6a1e5e6e5eea';
  
  // Search in contacts table by target as ID
  const { data: contactsById, error: err1 } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', target);
  console.log('Contacts by ID:', contactsById);

  // Search in contacts table by target in any string column
  const { data: contactsByName, error: err2 } = await supabase
    .from('contacts')
    .select('*')
    .or(`name.eq.${target},phone.eq.${target},whatsapp_jid.eq.${target}`);
  console.log('Contacts by other fields:', contactsByName);
  
  // Search in conversations table by target as ID
  const { data: convsById, error: err3 } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', target);
  console.log('Conversations by ID:', convsById);
}

run();
