const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
  console.log('Missing env variables');
  process.exit(1);
}

const url = urlMatch[1].trim().replace(/^"(.*)"$/, '$1');
const key = keyMatch[1].trim().replace(/^"(.*)"$/, '$1');

async function run() {
  const supabase = createClient(url, key);
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  
  console.log("Fetching company settings...");
  const { data: company, error: errC } = await supabase.from('companies').select('*').eq('id', tenantId).single();
  console.log("Company settings:", company?.settings);
  if (errC) console.error("Err company:", errC);
  
  console.log("Fetching bot settings...");
  const { data: bots, error: errB } = await supabase.from('bots').select('*').eq('tenant_id', tenantId);
  console.log("Bots:", bots?.map(b => ({ id: b.id, name: b.name, cardapio_origem: b.cardapio_origem, cardapio_json_url: b.cardapio_json_url })));
  if (errB) console.error("Err bot:", errB);
}

run();
