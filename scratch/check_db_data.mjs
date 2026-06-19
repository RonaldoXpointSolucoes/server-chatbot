import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  console.log("=== VERIFICANDO DADOS NO SUPABASE ===");
  
  // 1. Contagem total
  const { count: countG } = await supabase.from('cardapio_grupos').select('*', { count: 'exact', head: true });
  const { count: countP } = await supabase.from('cardapio_produtos').select('*', { count: 'exact', head: true });
  const { count: countPa } = await supabase.from('cardapio_passos').select('*', { count: 'exact', head: true });
  const { count: countOp } = await supabase.from('cardapio_opcoes').select('*', { count: 'exact', head: true });
  
  console.log(`cardapio_grupos: ${countG} registros`);
  console.log(`cardapio_produtos: ${countP} registros`);
  console.log(`cardapio_passos: ${countPa} registros`);
  console.log(`cardapio_opcoes: ${countOp} registros`);

  // 2. Buscar passos e opções de um produto que tenha adicionais
  // Vamos buscar um passo qualquer
  const { data: passos, error: errPa } = await supabase
    .from('cardapio_passos')
    .select('*')
    .limit(5);

  if (errPa) {
    console.error("Erro ao buscar passos:", errPa.message);
  } else {
    console.log("\nExemplo de passos cadastrados:", passos);
    if (passos.length > 0) {
      const passoId = passos[0].id;
      const { data: opcoes, error: errOp } = await supabase
        .from('cardapio_opcoes')
        .select('*')
        .eq('passo_id', passoId);
      
      if (errOp) {
        console.error("Erro ao buscar opcoes do passo:", errOp.message);
      } else {
        console.log(`Opções para o passo "${passos[0].pergunta}" (ID: ${passoId}):`, opcoes);
      }
    }
  }
}
run();
