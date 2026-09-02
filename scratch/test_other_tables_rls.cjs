const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjA3MDMsImV4cCI6MjA5MDc5NjcwM30.NmeEhsEqvg9Wp5fchUd5JyFt3K3e9Y-MHZ69wnNseec';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const anonClient = createClient(supabaseUrl, anonKey);
const serviceClient = createClient(supabaseUrl, supabaseKey);

async function testOtherTables() {
  const testId = 'd2ea7b38-b6b0-4830-ac35-646f3b71a939';
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';

  console.log('Testando tenant_users com anonClient...');
  const { data: tuData, error: tuErr } = await anonClient.from('tenant_users').upsert({
    tenant_id: tenantId,
    user_id: testId,
    email: 'renan@burguerplus.com.br',
    full_name: 'Renan Jose',
    role: 'operator'
  }, { onConflict: 'tenant_id,user_id' });
  console.log('tenant_users anon:', tuData, tuErr);

  console.log('Testando user_unit_permissions com anonClient...');
  const { data: uupData, error: uupErr } = await anonClient.from('user_unit_permissions').upsert({
    user_id: testId,
    unit_id: 'e6812fe6-a5a2-4b90-9199-da48ac5533a2'
  }, { onConflict: 'user_id,unit_id' });
  console.log('user_unit_permissions anon:', uupData, uupErr);

  console.log('Testando user_sector_permissions com anonClient...');
  const { data: uspData, error: uspErr } = await anonClient.from('user_sector_permissions').upsert({
    user_id: testId,
    sector_id: '3a2a24be-71f9-4f88-9db7-68b0b0dcc0ad'
  }, { onConflict: 'user_id,sector_id' });
  console.log('user_sector_permissions anon:', uspData, uspErr);
}

testOtherTables();
