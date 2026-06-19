import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  const { data, error } = await supabase.from('knowledge_documents').select('*').eq('tenant_id', tenantId);
  if (error) {
    console.error(error);
  } else {
    console.log('Documents for tenant:', tenantId);
    console.log(JSON.stringify(data.map(d => ({ id: d.id, name: d.name, type: d.type, status: d.status, metadata: d.metadata })), null, 2));
  }
}

run();
