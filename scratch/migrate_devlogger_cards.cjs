const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateDevLoggerCards() {
  const xpointTenantId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
  const chatbotCrmBoardId = '95be1dee-9d28-47d9-8ccf-d51a337f1572';

  console.log('--- Migrando cards gerados pelo DevLogger para o ChatBot CRM da X-Point Soluções ---');
  
  // Buscar todos os cards com tags DEVLOGGER ou IA-PLANO ou com títulos de [Sistema / Correção...] que não estejam no ChatBot CRM
  const { data: leads, error } = await supabase
    .from('crm_leads')
    .select('id, title, board_id, tenant_id, status, tags')
    .neq('board_id', chatbotCrmBoardId);

  console.log('Cards fora do ChatBot CRM encontrados:', leads?.length);

  for (const lead of (leads || [])) {
    const isDevCard = 
      lead.tags?.includes('DEVLOGGER') || 
      lead.tags?.includes('IA-PLANO') ||
      lead.title?.startsWith('[Backend') ||
      lead.title?.startsWith('[Sistema') ||
      lead.title?.startsWith('[Correção');

    if (isDevCard) {
      console.log(`Migrando card: "${lead.title}" (ID: ${lead.id}) para X-Point Soluções / ChatBot CRM / Em Análise`);
      const { error: updErr } = await supabase
        .from('crm_leads')
        .update({
          tenant_id: xpointTenantId,
          board_id: chatbotCrmBoardId,
          status: 'analysis'
        })
        .eq('id', lead.id);

      if (updErr) {
        console.error('Erro ao migrar card:', updErr);
      } else {
        console.log('Card migrado com sucesso!');
      }
    }
  }

  console.log('--- Migração concluída com sucesso! ---');
}

migrateDevLoggerCards();
