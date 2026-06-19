import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    });

    if (error) {
      console.log("Erro usando RPC execute_sql, tentando buscar via query crua...");
      console.error(error);
    } else {
      console.log("Tabelas encontradas:", data.map(t => t.table_name));
    }
  } catch (err) {
    console.error(err);
  }
}

run();
