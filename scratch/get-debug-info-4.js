import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function debug() {
  console.log("=== DEBUG BOTS CADASTRADOS ===");
  
  const tenantId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
  
  // Buscar bots
  const { data: bots, error } = await supabase.from('bots')
    .select('*')
    .eq('tenant_id', tenantId);
    
  if (error) {
    console.error("Erro ao buscar bots:", error);
    return;
  }
  
  console.log("Bots encontrados para o tenant:", JSON.stringify(bots, null, 2));
}

debug().catch(console.error);
