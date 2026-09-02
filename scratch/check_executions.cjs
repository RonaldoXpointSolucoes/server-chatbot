const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCols() {
  const { data: sample, error } = await supabase.from('checklist_executions').select('*').limit(3);
  console.log('Sample checklist_executions:', sample, error);

  const { data: userExecs } = await supabase.from('checklist_executions').select('*').eq('user_id', '42408ea2-28be-4965-932d-62a558d7a977');
  console.log('userExecs do Israel:', userExecs);
}

checkCols();
