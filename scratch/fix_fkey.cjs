const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runFix() {
  const sql = `
    ALTER TABLE IF EXISTS checklist_executions ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE IF EXISTS checklist_executions DROP CONSTRAINT IF EXISTS checklist_executions_user_id_fkey;
    ALTER TABLE IF EXISTS checklist_executions ADD CONSTRAINT checklist_executions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users_profiles(id) ON DELETE SET NULL;
  `;

  console.log('Tentando executar SQL via RPC...');
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  console.log('Result exec_sql:', data, error);

  if (error) {
    const { data: d2, error: e2 } = await supabase.rpc('execute_sql', { sql });
    console.log('Result execute_sql:', d2, e2);
  }
}

runFix();
