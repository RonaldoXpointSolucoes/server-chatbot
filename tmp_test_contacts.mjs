import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: tenant } = await sb.from('companies').select('id').limit(1).single();
  
  // Test 1: Insert with just company_id
  let res1 = await sb.from('contacts').insert({
    company_id: tenant.id,
    phone: '5511999999901',
    evolution_remote_jid: '5511999999901@s.whatsapp.net',
    name: 'TEST_C'
  }).select();
  console.log("Insert with company_id ONLY:", res1.error ? res1.error.message : 'SUCCESS');

  // Test 2: Insert with both company_id and tenant_id
  let res2 = await sb.from('contacts').insert({
    company_id: tenant.id,
    tenant_id: tenant.id,
    phone: '5511999999902',
    evolution_remote_jid: '5511999999902@s.whatsapp.net',
    name: 'TEST_CT'
  }).select();
  console.log("Insert with both ONLY:", res2.error ? res2.error.message : 'SUCCESS');
}
run();
