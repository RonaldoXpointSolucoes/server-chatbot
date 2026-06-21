import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', tenantId)
    .single();
  if (error) console.error(error);
  else console.log(JSON.stringify(company, null, 2));
}
run();
