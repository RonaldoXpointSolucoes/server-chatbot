import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const documentId = 'b8231bba-e848-49c5-9309-338bc54c40f4';
  
  try {
    const { data: chunks, error } = await supabase
      .from('knowledge_chunks')
      .select('id, chunk_index, content')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    console.log(`--- CHUNKS DO DOCUMENTO 'Cardapio Dixital Texto.txt' (${chunks.length} chunks) ---`);
    chunks.forEach(c => {
      console.log(`[Chunk ${c.chunk_index}] ${c.content.substring(0, 150)}...`);
    });

  } catch (err) {
    console.error(err);
  }
}

run();
