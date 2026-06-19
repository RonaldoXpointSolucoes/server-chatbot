import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Total contacts returned:', data.length);
  console.log('Matching Vanessa in returned data:', data.filter(c => (c.name || '').toLowerCase().includes('vanessa')).map(c => c.name));
}

run();
