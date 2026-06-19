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
      .select('*')
      .eq('tenant_id', tenantId)
      .limit(10);

    if (error) {
      console.error(error);
      return;
    }

    console.log(`--- CHUNKS DE CONHECIMENTO ---`);
    console.log(chunks);

    // Também vamos ver o que tem na tabela knowledge_files para este tenant
    const { data: files } = await supabase
      .from('knowledge_files')
      .select('*')
      .eq('tenant_id', tenantId);

    console.log(`--- ARQUIVOS DE CONHECIMENTO ---`);
    console.log(files);

  } catch (err) {
    console.error(err);
  }
}

run();
