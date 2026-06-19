import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('*')
    .ilike('name', '%Vanessa%');
    
  if (error) {
    console.error('Error fetching contacts:', error);
    return;
  }
  
  console.log('Matches:', contacts.map(c => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    whatsapp_jid: c.whatsapp_jid,
    tenant_id: c.tenant_id,
    bot_status: c.bot_status
  })));
}

run();
