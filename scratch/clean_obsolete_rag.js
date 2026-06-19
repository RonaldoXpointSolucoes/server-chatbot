import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  const documentId = '3de34ae2-5707-42a2-a801-1c5dd8eb0c9b'; // ID do Auto-Aprendizado Dinâmico
  
  try {
    console.log("=== INICIANDO LIMPEZA DO RAG DA BURGUER PLUS ===");
    
    // 1. Deleta chunks do auto-aprendizado dinâmico
    console.log(`Deletando chunks do documento virtual de auto-aprendizado (${documentId})...`);
    const { data: delChunks, error: errDelChunks } = await supabase
      .from('knowledge_chunks')
      .delete()
      .eq('document_id', documentId)
      .eq('tenant_id', tenantId)
      .select('id');
      
    if (errDelChunks) {
      console.error("Erro ao deletar chunks do auto-aprendizado:", errDelChunks);
    } else {
      console.log(`Deletados com sucesso ${delChunks?.length || 0} chunks.`);
    }

    // 2. Deleta o documento virtual de auto-aprendizado em si
    console.log(`Deletando o documento virtual 'Auto-Aprendizado Dinâmico (Conversas)'...`);
    const { data: delDoc, error: errDelDoc } = await supabase
      .from('knowledge_documents')
      .delete()
      .eq('id', documentId)
      .eq('tenant_id', tenantId)
      .select('id');

    if (errDelDoc) {
      console.error("Erro ao deletar documento do auto-aprendizado:", errDelDoc);
    } else {
      console.log(`Documento deletado com sucesso.`);
    }

    // 3. Busca e deleta quaisquer outros chunks avulsos que possam conter Caesar no RAG deste tenant
    console.log(`Buscando chunks adicionais com 'Caesar' para o tenant...`);
    const { data: caesarChunks, error: errFindCaesar } = await supabase
      .from('knowledge_chunks')
      .select('id, content')
      .eq('tenant_id', tenantId)
      .like('content', '%Caesar%');

    if (errFindCaesar) {
      console.error("Erro ao buscar chunks Caesar extras:", errFindCaesar);
    } else if (caesarChunks && caesarChunks.length > 0) {
      console.log(`Encontrados ${caesarChunks.length} chunks extras com Caesar. Deletando...`);
      const ids = caesarChunks.map(c => c.id);
      const { error: errDelExtra } = await supabase
        .from('knowledge_chunks')
        .delete()
        .in('id', ids);

      if (errDelExtra) {
        console.error("Erro ao deletar chunks extras:", errDelExtra);
      } else {
        console.log("Chunks extras deletados com sucesso.");
      }
    } else {
      console.log("Nenhum chunk Caesar extra encontrado.");
    }

    console.log("=== LIMPEZA DE BANCO DE DADOS CONCLUÍDA ===");
  } catch (err) {
    console.error("Erro crítico no script de limpeza:", err);
  }
}

run();
