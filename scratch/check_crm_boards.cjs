const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBoardsAndTenants() {
  console.log('--- 1. Todos os Tenants ---');
  const { data: tenants } = await supabase.from('tenants').select('id, name, slug');
  console.log(tenants);

  console.log('--- 2. Todos os Quadros do CRM ---');
  const { data: boards } = await supabase.from('crm_boards').select('id, name, tenant_id, config');
  console.log(boards);

  console.log('--- 3. Quadro 95be1dee-9d28-47d9-8ccf-d51a337f1572 ---');
  const { data: bDefault } = await supabase.from('crm_boards').select('*').eq('id', '95be1dee-9d28-47d9-8ccf-d51a337f1572').maybeSingle();
  console.log('bDefault:', bDefault);
}

checkBoardsAndTenants();
