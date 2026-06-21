import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  
  console.log("=== BOTS ===");
  const { data: bots, error: errBots } = await supabase
    .from('bots')
    .select('*')
    .eq('tenant_id', tenantId);
  
  if (errBots) console.error("Error bots:", errBots);
  else console.log(JSON.stringify(bots, null, 2));
}

run();
