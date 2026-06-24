import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const { data, error } = await supabase.from('companies').select('settings');
  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data[0]?.settings, null, 2));
  }
}
run();
