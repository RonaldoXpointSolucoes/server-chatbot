const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyBoards() {
  const { data: leadsBurguer } = await supabase.from('crm_leads').select('id, title, status').eq('board_id', '642996d5-2a82-469b-bea7-19b32a70b5dc');
  console.log('Cards restantes no Funil da Burguer Plus:', leadsBurguer);

  const { data: leadsChatbot } = await supabase.from('crm_leads').select('id, title, status').eq('board_id', '95be1dee-9d28-47d9-8ccf-d51a337f1572').eq('status', 'analysis');
  console.log('Cards na coluna "Em Análise" do ChatBot CRM (X-Point Soluções):', leadsChatbot?.length);
}

verifyBoards();
