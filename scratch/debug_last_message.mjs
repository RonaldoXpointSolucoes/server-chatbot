import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Buscando a última mensagem de documento...');
  const { data, error } = await supabase
    .from('messages')
    .select('id, text_content, message_type, media_url, raw_payload, timestamp')
    .eq('message_type', 'document')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('Erro ao buscar mensagem:', error);
    return;
  }

  console.log('\n=== MENSAGEM ENCONTRADA ===');
  console.log('ID:', data.id);
  console.log('Timestamp:', data.timestamp);
  console.log('Tipo:', data.message_type);
  console.log('URL da mídia:', data.media_url);
  console.log('Text Content (Legenda):', JSON.stringify(data.text_content));
  console.log('\n=== RAW PAYLOAD ===');
  console.log(JSON.stringify(data.raw_payload, null, 2));
}

run();
