const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAllReferences() {
  const userId = '42408ea2-28be-4965-932d-62a558d7a977';
  
  // Testar desvincular checklist_executions
  console.log('1. Desvinculando checklist_executions...');
  const { error: updErr } = await supabase.from('checklist_executions').update({ user_id: null }).eq('user_id', userId);
  console.log('Update checklist_executions result:', updErr);

  // Testar deletar users_profiles
  console.log('2. Tentando DELETE de users_profiles...');
  const { data: del, error: delErr } = await supabase.from('users_profiles').delete().eq('id', userId);
  console.log('Delete result:', del);
  console.log('Delete error:', delErr);
}

checkAllReferences();
