const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStages() {
  const { data: board } = await supabase.from('crm_boards').select('*').eq('id', '95be1dee-9d28-47d9-8ccf-d51a337f1572').single();
  console.log('Stages do ChatBot CRM:', JSON.stringify(board.config.stages, null, 2));

  // Checar onde foram criados os cards com tags DEVLOGGER recentemente
  const { data: devCards } = await supabase.from('crm_leads').select('id, title, board_id, tenant_id, status, created_at').order('created_at', { ascending: false }).limit(10);
  console.log('Últimos cards criados no CRM:', devCards);
}

checkStages();
