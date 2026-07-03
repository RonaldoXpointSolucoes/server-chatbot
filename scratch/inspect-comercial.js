import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const instanceId = 'f695a096-cb11-48aa-b603-27f0d41ae97d';
  
  console.log('Querying instance details...');
  const { data: instance, error } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instanceId)
    .single();
    
  if (error) {
    console.error('Error fetching instance:', error);
  } else {
    console.log('====================================');
    console.log('Instance details found:');
    console.log('ID:', instance.id);
    console.log('Display Name:', instance.display_name);
    console.log('Tenant ID:', instance.tenant_id);
    console.log('Status:', instance.status);
    console.log('Phone Number:', instance.phone_number);
    console.log('====================================');
  }
}

run().catch(console.error);
