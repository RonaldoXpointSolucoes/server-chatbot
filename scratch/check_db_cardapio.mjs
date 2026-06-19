import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  const produtoId = 'BD37751F-AE4E-4D7A-B764-DCDD98B941DF'; // Costela Burguer
  
  console.log(`=== Buscando passos do produto ${produtoId} no banco ===`);
  const { data: passos, error: errPassos } = await supabase
    .from('cardapio_passos')
    .select('*')
    .eq('produto_id', produtoId);
    
  if (errPassos) {
    console.error("Erro passos:", errPassos);
    return;
  }
  
  console.log(`Passos encontrados: ${passos.length}`);
  console.log(JSON.stringify(passos, null, 2));
  
  if (passos.length > 0) {
    const passoIds = passos.map(p => p.id);
    console.log(`=== Buscando opções para os passos ${passoIds.join(', ')} ===`);
    const { data: opcoes, error: errOpcoes } = await supabase
      .from('cardapio_opcoes')
      .select('*')
      .in('passo_id', passoIds);
      
    if (errOpcoes) {
      console.error("Erro opcoes:", errOpcoes);
      return;
    }
    
    console.log(`Opções encontradas: ${opcoes.length}`);
    console.log(JSON.stringify(opcoes, null, 2));
  }
}

check();
