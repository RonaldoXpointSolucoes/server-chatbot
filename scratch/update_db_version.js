import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/['"]/g, '');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/['"]/g, '');

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  console.log('Inserindo versão 2.8.4 na tabela app_version...');
  const { data, error } = await supabase.from('app_version').insert({
    version: '2.8.4',
    deploy_date: new Date().toISOString()
  });
  if (error) {
    console.error('Erro ao atualizar banco:', error);
  } else {
    console.log('Versão 2.8.4 registrada com sucesso no Supabase!');
  }
}
run();
