import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select('id, display_name, tenant_id');
    
  if (error) {
    console.error('Erro ao buscar whatsapp_instances:', error);
  } else {
    console.log('Whatsapp Instances:');
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
