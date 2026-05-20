import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos no .env!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  try {
    // Tenta usar a RPC run_sql para listar as políticas RLS de conversations
    const sql = `
      SELECT polname, polcmd, polroles, polqual::text, polwithcheck::text 
      FROM pg_policy 
      WHERE polrelid = 'public.conversations'::regclass;
    `;
    const { data, error } = await supabase.rpc('run_sql', { sql });
    if (error) {
      console.error("Erro na RPC run_sql:", error);
      
      // Fallback: tentar consultar diretamente a tabela se a RPC não existir
      console.log("Tentando consultar metadados básicos...");
    } else {
      console.log("=== POLÍTICAS RLS DE CONVERSATIONS ===");
      console.log(data);
    }
  } catch (e) {
    console.error("Erro executando script:", e);
  }
}

run();
