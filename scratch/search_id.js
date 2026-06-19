import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const target = '89985491-d785-4cc5-b859-bf2468ef3e2e';
  
  // Search in contacts
  const { data: contacts, error: err1 } = await supabase
    .from('contacts')
    .select('id, name, phone, instance_id')
    .or(`id.eq.${target},instance_id.eq.${target}`);
  console.log('Contacts found:', contacts);

  // Search in conversations
  const { data: convs, error: err2 } = await supabase
    .from('conversations')
    .select('id, contact_id, instance_id')
    .or(`id.eq.${target},contact_id.eq.${target},instance_id.eq.${target}`);
  console.log('Conversations found:', convs);
  
  // Search in whatsapp_instances
  const { data: insts, error: err3 } = await supabase
    .from('whatsapp_instances')
    .select('id, display_name')
    .eq('id', target);
  console.log('Instances found:', insts);
}

run();
