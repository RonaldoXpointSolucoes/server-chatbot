import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  
  console.log("=== WHATSAPP INSTANCES DADOS ===");
  const { data: instances } = await supabase.from('whatsapp_instances').select('*').eq('tenant_id', tenantId);
  instances?.forEach(inst => {
    console.log(JSON.stringify({
      id: inst.id,
      name: inst.name,
      display_name: inst.display_name,
      phone: inst.phone,
      whatsapp_phone: inst.whatsapp_phone,
      settings: inst.settings
    }, null, 2));
  });

  console.log("=== CONTACT DADOS FOR ffa989a7-9840-44d8-8699-ede8c64ac9ca ===");
  const { data: contact } = await supabase.from('contacts').select('*').eq('id', 'ffa989a7-9840-44d8-8699-ede8c64ac9ca').single();
  console.log(JSON.stringify(contact, null, 2));
}

run().catch(console.error);
