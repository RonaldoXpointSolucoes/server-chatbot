import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  
  console.log("=== Buscando knowledge_chunks do Tenant ===");
  const { data: kb, error } = await supabase
    .from('knowledge_chunks')
    .select('id, content, metadata')
    .eq('tenant_id', tenantId);
    
  if (error) {
    console.error("Erro ao buscar chunks:", error);
    return;
  }
  
  console.log("Total de registros:", kb.length);
  kb.forEach((item, index) => {
    console.log(`[${index + 1}] ID: ${item.id} | Metadata: ${JSON.stringify(item.metadata)}`);
    console.log(`Conteúdo:\n"${item.content}"`);
    console.log("---------------------------------------");
  });
}

run();
