const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const masterSupabase = createClient(supabaseUrl, supabaseKey);

async function testCreateRenan() {
  const targetUserId = 'd2ea7b38-b6b0-4830-ac35-646f3b71a939';
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';

  console.log('1. Cadastrando Renan Jose em users_profiles...');
  const { data: uData, error: uErr } = await masterSupabase.from('users_profiles').upsert({
    id: targetUserId,
    tenant_id: tenantId,
    name: 'Renan Jose',
    email: 'renan@burguerplus.com.br',
    phone: '',
    pin: '72825',
    role: 'operator',
    is_active: true,
    cargo_id: null
  }, { onConflict: 'id' });
  console.log('users_profiles:', uData, uErr);

  console.log('2. Cadastrando em tenant_users...');
  const { data: tuData, error: tuErr } = await masterSupabase.from('tenant_users').upsert({
    tenant_id: tenantId,
    user_id: targetUserId,
    email: 'renan@burguerplus.com.br',
    full_name: 'Renan Jose',
    role: 'operator'
  }, { onConflict: 'tenant_id,user_id' });
  console.log('tenant_users:', tuData, tuErr);

  console.log('3. Cadastrando em user_unit_permissions...');
  const { data: upData, error: upErr } = await masterSupabase.from('user_unit_permissions').upsert([
    { user_id: targetUserId, unit_id: 'e6812fe6-a5a2-4b90-9199-da48ac5533a2' }
  ], { onConflict: 'user_id,unit_id' });
  console.log('user_unit_permissions:', upData, upErr);

  console.log('4. Cadastrando em user_sector_permissions...');
  const { data: spData, error: spErr } = await masterSupabase.from('user_sector_permissions').upsert([
    { user_id: targetUserId, sector_id: '3a2a24be-71f9-4f88-9db7-68b0b0dcc0ad' }
  ], { onConflict: 'user_id,sector_id' });
  console.log('user_sector_permissions:', spData, spErr);

  console.log('--- TESTE CONCLUÍDO COM SUCESSO! ---');
}

testCreateRenan();
