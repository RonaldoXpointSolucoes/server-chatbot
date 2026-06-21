import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  
  console.log("=== MESSAGES TODAY ===");
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('timestamp', '2026-06-21T00:00:00Z');
  
  if (error) console.error(error);
  else console.log(JSON.stringify(messages, null, 2));
}

run();
