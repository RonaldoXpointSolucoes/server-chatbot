import { supabase } from './supabase.js';

async function run() {
  try {
    const { data, error } = await supabase.from('bots').select('*').limit(1);
    if (error) {
      console.error('Erro ao buscar bots:', error);
    } else {
      console.log('Registro do bot:', data[0] || 'Nenhum bot cadastrado');
      if (data[0]) {
        console.log('Colunas:', Object.keys(data[0]));
      }
    }
  } catch (err) {
    console.error('Erro:', err);
  }
  process.exit(0);
}

run();
