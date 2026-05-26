import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Ler o .env para pegar as credenciais
const envContent = fs.readFileSync('.env', 'utf8');
const lines = envContent.split('\n');
let supabaseUrl = '';
let supabaseServiceKey = '';

for (const line of lines) {
  if (line.startsWith('VITE_SUPABASE_URL=')) {
    supabaseUrl = line.split('=')[1].trim();
  }
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    supabaseServiceKey = line.split('=')[1].trim();
  }
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Erro: Credenciais de administrador do Supabase não encontradas no .env!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log('Inserindo nova versão com privilégios de Admin...');
  const { data, error } = await supabase.from('app_version').insert({
    version: '2.7.2',
    deploy_date: new Date().toISOString()
  }).select();

  if (error) {
    console.error('Erro ao inserir versão:', error);
    process.exit(1);
  } else {
    console.log('Versão inserida com sucesso:', data);
    process.exit(0);
  }
}

run();
