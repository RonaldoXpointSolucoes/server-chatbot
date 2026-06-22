import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const instanceId = '027692b1-fc8a-450b-a9fb-2aeaeadb93e5';
  
  console.log('Querying instance from whatsapp_instances...');
  const { data: instance, error: instanceErr } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instanceId);
  
  console.log('Instance result:', instance, 'Error:', instanceErr);
  
  if (instance && instance.length > 0) {
    const tenantId = instance[0].tenant_id;
    console.log('Querying tenant from tenants...');
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId);
    console.log('Tenant result:', tenant, 'Error:', tenantErr);
  }
}

run().catch(console.error);
