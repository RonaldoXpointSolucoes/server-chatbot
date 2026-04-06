import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("Faltou SUPABASE_URL");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setup() {
  console.log("Adicionando media_metadata...");
  // Vamos usar supabase.rpc para rodar SQL, 
  // caso nao tenha rpc genérico vamos forçar erro limpo se ja existir
  
  // No caso onde o usuário não autoriza DDLs via Rest por falta de rpc custom, 
  // usarei query raw, que nao é possivel pelo Supabase.js comum.
  // Vou criar o Bucket de imediato e pedir ao user para confirmar o column schema
  
  console.log("Verificando / Criando Bucket 'chat_media'...");
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  if (bErr) { console.error("Error ao listar buckets", bErr); }
  
  let chatMediaExists = false;
  if(buckets) {
      chatMediaExists = buckets.find(b => b.name === 'chat_media') !== undefined;
  }

  if (!chatMediaExists) {
      console.log("Bucket chat_media nao existe. Tentando criar...");
      const { data: newB, error: newBErr } = await supabase.storage.createBucket('chat_media', {
          public: true,
          allowedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/*'],
          fileSizeLimit: 52428800 // 50MB
      });
      if (newBErr) { 
          console.error("Falha ao criar bucket. Execute via UI ou verifique Role.", newBErr.message);
      } else {
          console.log("Bucket criado com sucesso.");
      }
  } else {
      console.log("Bucket chat_media já existe. Garantindo que seja publico...");
      await supabase.storage.updateBucket('chat_media', { public: true });
  }

  console.log("\n==== INSTRUÇÕES ====\n");
  console.log("Por favor, garanta que a tabela messages possua a coluna 'media_metadata' (tipo JSONB)");
}

setup();
