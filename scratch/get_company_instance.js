import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, evolution_api_instance')
    .eq('id', '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21')
    .single();

  console.log('Company:', data, 'Error:', error);
}

run();
