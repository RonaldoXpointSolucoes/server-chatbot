const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteIsrael() {
  const userId = '42408ea2-28be-4965-932d-62a558d7a977';
  
  // 1. Limpar permissões
  await supabase.from('user_unit_permissions').delete().eq('user_id', userId);
  await supabase.from('user_sector_permissions').delete().eq('user_id', userId);

  // 2. Limpar tenant_users
  await supabase.from('tenant_users').delete().eq('user_id', userId);
  await supabase.from('tenant_users').delete().eq('email', 'Israel@burguerplus.com.br');

  // 3. Atualizar users_profiles com Soft-Delete definitivo (is_active: false, pin: null, cargo_id: null)
  const { data: softData, error: softErr } = await supabase.from('users_profiles').update({
    is_active: false,
    pin: null,
    cargo_id: null
  }).eq('id', userId);

  console.log('Soft delete result:', softData, softErr);

  // 4. Tentar delete físico
  const { data: delData, error: delErr } = await supabase.from('users_profiles').delete().eq('id', userId);
  console.log('Physical delete result:', delData, delErr);
}

deleteIsrael();
