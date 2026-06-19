import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  try {
    const output = {};

    // 1. Chunks de RAG
    const { data: chunks } = await supabase
      .from('knowledge_chunks')
      .select('*')
      .eq('tenant_id', tenantId);
    output.knowledge_chunks = chunks || [];

    // 2. Produtos do cardapio
    const { data: products } = await supabase
      .from('cardapio_produtos')
      .select('*')
      .eq('tenant_id', tenantId);
    output.cardapio_produtos = products || [];

    // 3. Documentos do knowledge base
    const { data: files } = await supabase
      .from('knowledge_files')
      .select('*')
      .eq('tenant_id', tenantId);
    output.knowledge_files = files || [];

    fs.writeFileSync('scratch/check_burguer_plus_output.json', JSON.stringify(output, null, 2));
    console.log(`Encontrados ${output.knowledge_chunks.length} chunks de conhecimento, ${output.cardapio_produtos.length} produtos de cardápio e ${output.knowledge_files.length} arquivos.`);
  } catch (err) {
    console.error(err);
  }
}

run();
