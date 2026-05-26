import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Carregar variáveis de ambiente
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Erro: VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontradas no arquivo .env!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Inserindo nova versão no banco Supabase...');
  
  const { data, error } = await supabase.from('app_version').insert({
    version: '2.6.4',
    deploy_date: new Date().toISOString()
  });

  if (error) {
    console.error('Erro ao inserir versão:', error);
  } else {
    console.log('Versão 2.6.4 inserida com absoluto sucesso no Supabase!', data);
  }
}

run();
