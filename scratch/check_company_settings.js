import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  try {
    const { data: company, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (error) {
      console.error("Erro ao buscar empresa:", error);
      return;
    }

    console.log("--- CONFIGURACOES DA EMPRESA (Burguer Plus) ---");
    console.log(JSON.stringify(company, null, 2));

  } catch (err) {
    console.error(err);
  }
}

run();
