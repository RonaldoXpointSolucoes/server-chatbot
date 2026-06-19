const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../.env' }); // Caminho correto para o .env na raiz do projeto

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERRO: VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const instanceId = '5c78d358-d449-41c4-b396-a04ab20a39e4';
  console.log(`Atualizando status da instância ${instanceId} para 'connected' no Supabase...`);
  
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .update({ 
      status: 'connected', 
      last_error: null 
    })
    .eq('id', instanceId)
    .select();

  if (error) {
    console.error("Erro ao atualizar:", error);
  } else {
    console.log("Sucesso! Registro atualizado:", data);
  }
}

run();
