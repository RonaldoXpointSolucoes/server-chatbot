import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  const terms = ['Salada', 'Wrap', 'Peito de Peru', 'Caesar', 'Grelhado'];
  
  try {
    for (const term of terms) {
      console.log(`\n--- Buscando por "${term}" nos chunks do RAG da Burguer Plus ---`);
      const { data: chunks, error } = await supabase
        .from('knowledge_chunks')
        .select('id, content')
        .eq('tenant_id', tenantId)
        .like('content', `%${term}%`);

      if (error) {
        console.error("Erro:", error);
      } else {
        console.log(`Encontrados ${chunks.length} chunks.`);
        chunks.slice(0, 3).forEach(c => {
          console.log(`ID: ${c.id}`);
          console.log(`Conteúdo: ${c.content.substring(0, 300)}...\n`);
        });
      }
    }
  } catch (err) {
    console.error(err);
  }
}

run();
