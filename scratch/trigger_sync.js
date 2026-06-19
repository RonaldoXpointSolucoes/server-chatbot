import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  const docName = "Manual de Raciocínio e Ajustes da I.A";
  
  console.log('--- FETCHING ADJUSTMENTS ---');
  const { data: corrections, error: fetchErr } = await supabase
      .from('ai_reasoning_adjustments')
      .select('user_query, original_response, corrected_response, context_summary, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

  if (fetchErr) {
    console.error(fetchErr);
    return;
  }

  console.log('Corrections count:', corrections.length);
  if (corrections.length === 0) {
    console.log('No corrections to sync.');
    return;
  }

  // 3. Monta o markdown unificado do documento
  let content = `# Manual de Raciocínio, Tom de Voz e Instruções Corrigidas da I.A.\n\n`;
  content += `Este documento contém correções reais feitas por atendentes humanos para guiar as respostas da I.A. Siga de forma estrita as diretrizes de tom, empatia, escuta ativa e as respostas corretas abaixo para obter uma conversa de altíssimo nível humano e natural.\n\n---\n\n`;
  
  corrections.forEach((c, idx) => {
      content += `## Correção ${idx + 1}:\n`;
      if (c.context_summary) {
          content += `### Memória da Conversa (Contexto):\n"${c.context_summary}"\n\n`;
      }
      content += `### Pergunta Similar do Cliente:\n"${c.user_query}"\n\n`;
      if (c.original_response) {
          content += `### Resposta Incorreta Original (Não repetir):\n"${c.original_response}"\n\n`;
      }
      content += `### Comportamento e Resposta Esperada Corrigida (Seguir esta linha):\n"${c.corrected_response}"\n\n`;
      content += `---\n\n`;
  });

  // 4. Busca ou cria o documento correspondente em knowledge_documents
  let { data: doc, error: docErr } = await supabase
      .from('knowledge_documents')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', docName)
      .maybeSingle();

  if (docErr) {
    console.error(docErr);
    return;
  }

  let finalDocId;
  const metadata = { size: content.length, source: 'corrections_system', last_update: new Date().toISOString() };

  if (!doc) {
      console.log('Inserting new knowledge document...');
      const { data: newDoc, error: createErr } = await supabase
          .from('knowledge_documents')
          .insert([{
              tenant_id: tenantId,
              name: docName,
              type: 'text/markdown',
              status: 'ready',
              metadata: metadata
          }])
          .select('*')
          .single();

      if (createErr) {
        console.error(createErr);
        return;
      }
      finalDocId = newDoc.id;
  } else {
      console.log('Updating existing knowledge document:', doc.id);
      const { error: updateErr } = await supabase
          .from('knowledge_documents')
          .update({ 
              status: 'ready',
              metadata: metadata
          })
          .eq('id', doc.id);

      if (updateErr) {
        console.error(updateErr);
        return;
      }
      finalDocId = doc.id;
  }

  console.log('Synchronization completed successfully! Document ID:', finalDocId);
}

run();
