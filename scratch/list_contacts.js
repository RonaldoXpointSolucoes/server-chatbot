import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const tenantId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
  
  // Fetch contacts in tenant that might be strange (e.g. name or phone has uuid format or empty/null)
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, name, phone, whatsapp_jid, instance_id, created_at')
    .eq('tenant_id', tenantId);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Total contacts in tenant: ${contacts.length}`);
  
  const weirdContacts = contacts.filter(c => {
    // Check if ID or name is UUID-like or has something weird
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(c.name) || uuidRegex.test(c.phone) || !c.phone || c.name === 'undefined' || c.id === '89985491-d785-4cc5-b859-bf2468ef3e2e' || c.instance_id === '89985491-d785-4cc5-b859-bf2468ef3e2e';
  });
  
  console.log('Weird contacts count:', weirdContacts.length);
  console.log('Weird contacts (first 10):');
  console.log(JSON.stringify(weirdContacts.slice(0, 10), null, 2));
}

run();
