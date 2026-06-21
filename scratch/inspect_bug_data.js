import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  
  console.log("=== WHATSAPP INSTANCES ===");
  const { data: instances, error: errInst } = await supabase
    .from('whatsapp_instances')
    .select('id, display_name, status, settings')
    .eq('tenant_id', tenantId);
  
  if (errInst) console.error("Error instances:", errInst);
  else console.log(JSON.stringify(instances, null, 2));

  console.log("=== CONTACTS FOR RONALDO ===");
  const { data: contacts, error: errContacts } = await supabase
    .from('contacts')
    .select('*')
    .eq('tenant_id', tenantId)
    .ilike('name', '%Ronaldo%');

  if (errContacts) console.error("Error contacts:", errContacts);
  else console.log(JSON.stringify(contacts, null, 2));

  if (contacts && contacts.length > 0) {
    for (const contact of contacts) {
      const contactId = contact.id;
      console.log(`=== CONVERSATIONS FOR CONTACT ${contact.name} (${contactId}) ===`);
      const { data: convs, error: errConvs } = await supabase
        .from('conversations')
        .select('*')
        .eq('contact_id', contactId);
      if (errConvs) console.error("Error convs:", errConvs);
      else console.log(JSON.stringify(convs, null, 2));
    }
  }
}

run();
