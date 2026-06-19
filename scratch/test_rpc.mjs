import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const rpcs = ['exec_sql', 'run_sql', 'execute_sql', 'sql'];
  for (const rpc of rpcs) {
    try {
      console.log(`Testando RPC: ${rpc}...`);
      const { data, error } = await supabase.rpc(rpc, { sql: 'SELECT 1' });
      if (error) {
        console.log(`  RPC ${rpc} retornou erro: ${error.message} (${error.code})`);
      } else {
        console.log(`  🎉 RPC ${rpc} FUNCIONA! Retorno:`, data);
      }
    } catch (e) {
      console.log(`  RPC ${rpc} falhou com exceção: ${e.message}`);
    }
  }
}
run();
