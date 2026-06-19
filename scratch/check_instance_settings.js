import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const instanceId = '70be6e2e-a87a-4545-8d7d-46907c1cf327';
  
  console.log("=== Detalhes da Instância ===");
  const { data: instance, error: errInst } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instanceId)
    .single();
    
  if (errInst) {
    console.error("Erro ao buscar instância:", errInst);
  } else {
    console.log(JSON.stringify(instance, null, 2));
  }
}

run();
