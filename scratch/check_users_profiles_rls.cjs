const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPolicies() {
  console.log('--- Inspecionando tabela users_profiles e tenant_users ---');
  
  // Testar inserção via anon/autenticado vs service_role
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjA3MDMsImV4cCI6MjA5MDc5NjcwM30.NmeEhsEqvg9Wp5fchUd5JyFt3K3e9Y-MHZ69wnNseec';
  const anonClient = createClient(supabaseUrl, anonKey);

  const testId = 'd2ea7b38-b6b0-4830-ac35-646f3b71a939';
  const payload = {
    id: testId,
    tenant_id: '9057ca36-0b29-4fe5-89fb-be5e13387030',
    name: 'Renan Jose',
    email: 'renan@burguerplus.com.br',
    phone: '',
    pin: '72825',
    role: 'operator',
    is_active: true,
    cargo_id: null
  };

  console.log('Tentando insert com anonClient (como o frontend)...');
  const { data: aData, error: aErr } = await anonClient.from('users_profiles').upsert(payload, { onConflict: 'id' });
  console.log('Anon insert result:', aData, aErr);

  console.log('Tentando insert com service_role...');
  const { data: sData, error: sErr } = await supabase.from('users_profiles').upsert(payload, { onConflict: 'id' });
  console.log('Service role insert result:', sData, sErr);
}

checkPolicies();
