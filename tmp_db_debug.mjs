import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testInsert() {
  // Let's get the active tenant to test exactly on realistic data
  const { data: tenant } = await sb.from('companies').select('id').limit(1).single();
  if(!tenant) {
      console.error("No tenant found");
      return;
  }
  
  console.log("Tenant:", tenant.id);
  
  const { data, error } = await sb.from('contacts').insert({
    tenant_id: tenant.id,
    phone: '5511999999999',
    evolution_remote_jid: '5511999999999@s.whatsapp.net',
    name: 'TEST_NAME',
    push_name: 'TEST_NAME'
  }).select();
  
  console.log('Result:', data);
  console.log('Insert Error:', JSON.stringify(error, null, 2));

  // If succeeded, clean it up
  if (data) {
     await sb.from('contacts').delete().eq('id', data[0].id);
  }
}

testInsert();
