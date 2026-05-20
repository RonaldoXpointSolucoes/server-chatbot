const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, anonKey);

async function run() {
  const tenantId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
  
  // 1) Buscar conversas
  const { data: convs, error } = await supabase.from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .neq('status', 'resolved');
    
  if (error) {
    console.error('Erro na busca:', error);
    return;
  }
  
  console.log(`Encontradas ${convs.length} conversas para atualizar.`);
  const ids = convs.map(c => c.id);
  
  // 2) Tentar atualizar tudo de uma vez para ver se gera erro!
  console.log('Tentando atualizar todos de uma vez (tamanho da query URL gigante)...');
  const { error: errAll } = await supabase.from('conversations')
    .update({ status: 'resolved' })
    .in('id', ids);
    
  if (errAll) {
    console.error('Falhou ao atualizar todos de uma vez. Erro:', errAll.message || errAll);
  } else {
    console.log('Inacreditável! Atualizou todos de uma vez sem dar erro.');
  }
}

run();
