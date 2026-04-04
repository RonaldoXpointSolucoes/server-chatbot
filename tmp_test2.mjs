import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function run() {
  const { data: tenant } = await sb.from('companies').select('id').limit(1).single();
  
  console.log("Found tenant:", tenant.id);
  
  // Test 1: Insert with BOTH
  let res2 = await sb.from('contacts').insert({
    company_id: tenant.id,
    tenant_id: tenant.id,
    phone: '5511999999903',
    evolution_remote_jid: '5511999999903@s.whatsapp.net',
    name: 'TEST_BOTH'
  }).select();
  console.log("Insert with BOTH:", res2.error ? res2.error.message : 'SUCCESS');

  // Test 2: Message Insert
  let res3 = await sb.from('messages').insert({
    tenant_id: tenant.id,
    contact_id: res2.data ? res2.data[0].id : null,
    whatsapp_id: 'TEST_MSG_123',
    text_content: 'HELLO',
    sender_type: 'contact',
    status: 'RECEIVED'
  });
  console.log("Insert Msg:", res3.error ? res3.error.message : 'SUCCESS');
}
run();
