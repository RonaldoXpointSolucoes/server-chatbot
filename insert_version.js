import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('app_version').insert({
    version: '2.5.1',
    deploy_date: new Date().toISOString()
  });
  console.log('Error:', error);
  console.log('Success:', data);
}
run();
