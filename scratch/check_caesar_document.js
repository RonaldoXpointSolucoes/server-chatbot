import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  
  try {
    const { data: chunks, error } = await supabase
      .from('knowledge_chunks')
      .select('id, document_id, content')
      .eq('tenant_id', tenantId)
      .like('content', '%Caesar%');

    if (error) {
      console.error(error);
      return;
    }

    console.log(`Encontrados ${chunks.length} chunks com Caesar.`);
    for (const c of chunks) {
      console.log(`Chunk ID: ${c.id} | Document ID: ${c.document_id}`);
      
      // Busca o nome do documento correspondente
      if (c.document_id) {
        const { data: doc } = await supabase
          .from('knowledge_documents')
          .select('name')
          .eq('id', c.document_id)
          .single();
        console.log(`Documento: ${doc ? doc.name : 'Não encontrado'}`);
      }
      console.log(`Conteúdo: ${c.content.substring(0, 200)}...\n`);
    }

  } catch (err) {
    console.error(err);
  }
}

run();
