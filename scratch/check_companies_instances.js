import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, name, evolution_api_instance');

  if (error) {
    console.error('Error fetching companies:', error);
  } else {
    console.log('Companies:');
    console.log(JSON.stringify(companies, null, 2));
  }
}

run();
