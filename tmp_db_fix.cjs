import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://yzbxsxabzncdzuxvlppt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k'
);

async function run() {
  console.log("Iniciando...");

  // 1. Atualizar NULL access_tokens
  const { data: instances } = await supabase.from('whatsapp_instances').select('id, access_token');
  if (instances) {
    for (let inst of instances) {
       if (!inst.access_token || inst.access_token.trim() === '') {
          const defaultKey = "OLD-" + Math.random().toString(36).substring(2, 15);
          await supabase.from('whatsapp_instances').update({ access_token: defaultKey }).eq('id', inst.id);
          console.log(`Updated legacy instance ${inst.id} to token ${defaultKey}`);
       }
    }
  }

  console.log("Update executado. OBS: Realtime e Alter Null precisa ser via query SQL (edge fx ou painel). Vou usar a rpc query se possivel.");
  
}

run();
