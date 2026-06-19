import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const target = '89985491-d785-4cc5-b859-bf2468ef3e2e';
  
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, name, phone, instance_id')
    .eq('instance_id', target)
    .limit(5);
    
  console.log('Contacts:', contacts, 'Error:', error);
}

run();
