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
  const tenantId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
  
  console.log("Fetching company settings...");
  const { data: company, error: errC } = await supabase.from('companies').select('*').eq('id', tenantId).single();
  console.log("Company Name:", company?.name, "Settings:", company?.settings);
  if (errC) console.error("Err company:", errC);
}

run();
