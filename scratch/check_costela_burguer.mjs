import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  console.log("=== COSTELA BURGUER INSPECIONAR ===");
  const { data: produtos } = await supabase
    .from('cardapio_produtos')
    .select('*')
    .ilike('name', '%costela%');
  
  console.log("Produtos encontrados:", produtos);
  
  if (produtos && produtos.length > 0) {
    const costela = produtos[0];
    const { data: passos } = await supabase
      .from('cardapio_passos')
      .select('*')
      .eq('produto_id', costela.id);
    
    console.log("Passos da Costela:", passos);
    
    if (passos && passos.length > 0) {
      for (const p of passos) {
        const { data: opcoes } = await supabase
          .from('cardapio_opcoes')
          .select('*')
          .eq('passo_id', p.id);
        
        console.log(`Opções para o passo "${p.pergunta || p.sub_titulo}" (ID: ${p.id}):`, opcoes);
      }
    }
  }
}
run();
