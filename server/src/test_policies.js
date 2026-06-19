import { supabase } from './supabase.js';

async function run() {
  try {
    console.log("=== LISTANDO POLÍTICAS DE RLS DA TABELA CONVERSATIONS ===");
    
    // Consulta direta ao catálogo do postgres para ler as políticas da tabela conversations
    const { data, error } = await supabase
      .rpc('execute_sql_temp', { 
        sql_query: "SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = 'conversations';" 
      });

    // Se o RPC execute_sql_temp não existir, fazemos via query simples se possível ou logamos
    if (error) {
      console.log("RPC execute_sql_temp não disponível (comum). Vamos tentar ler de outra forma.");
      
      // Vamos tentar fazer uma query na tabela pg_policies usando sql se a chave admin puder rodar sql
      // Normalmente o supabase-js não deixa rodar SQL arbitrário a não ser que tenha RPC.
      // Vamos tentar executar um SELECT simples para ver se as políticas bloqueiam.
      console.log("Erro no RPC:", error.message);
      return;
    }

    console.log("Políticas encontradas:", data);
  } catch (e) {
    console.error(e);
  }
}

run();
