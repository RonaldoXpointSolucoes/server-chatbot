import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const target = 'ae5bd365-b881-4662-bbb2-6a1e5e6e5eea';
  
  // Check if contact with ID exists
  const { data: contactById, error: err1 } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', target)
    .maybeSingle();

  console.log('Contact by ID:', contactById, 'Error:', err1);

  // Check if conversations with contact_id exists
  const { data: convByContact, error: err2 } = await supabase
    .from('conversations')
    .select('*')
    .eq('contact_id', target)
    .limit(5);

  console.log('Conversations by contact_id:', convByContact, 'Error:', err2);
}

run();
