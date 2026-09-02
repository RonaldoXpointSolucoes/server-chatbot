const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectUser() {
  const userId = '42408ea2-28be-4965-932d-62a558d7a977';
  console.log('--- Buscando usuário ---');
  const { data: user, error: uErr } = await supabase.from('users_profiles').select('*').eq('id', userId);
  console.log('User:', user);

  console.log('--- Tentando DELETE para capturar erro detalhado ---');
  const { data: delData, error: delErr } = await supabase.from('users_profiles').delete().eq('id', userId);
  console.log('Delete result:', delData);
  console.log('Delete error full:', delErr);

  // Checar onde ele está referenciado
  const tables = [
    'checklist_records',
    'checklist_executions',
    'checklist_responses',
    'tickets',
    'messages',
    'crm_activities',
    'crm_deals',
    'crm_card_tasks',
    'crm_tasks',
    'system_logs',
    'tenant_users',
    'user_unit_permissions',
    'user_sector_permissions',
    'voucher_validations',
    'shift_collaborators'
  ];

  for (const table of tables) {
    for (const col of ['user_id', 'collaborator_id', 'operator_id', 'created_by', 'profile_id']) {
      try {
        const { data } = await supabase.from(table).select('id').eq(col, userId).limit(5);
        if (data && data.length > 0) {
          console.log(`[REFERÊNCIA ENCONTRADA] Tabela "${table}", Coluna "${col}": ${data.length} registros`);
        }
      } catch (e) {}
    }
  }
}

inspectUser();
