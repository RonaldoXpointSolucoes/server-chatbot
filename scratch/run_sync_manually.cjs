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
  
  console.log("Checking total rows in cardapio_produtos...");
  const { count, error: errC } = await supabase.from('cardapio_produtos').select('*', { count: 'exact', head: true });
  console.log("Total rows in cardapio_produtos:", count, "Error:", errC);

  console.log("Checking total rows in cardapio_produtos for tenant 9057ca36-0b29-4fe5-89fb-be5e13387030...");
  const { count: countTenant, error: errCT } = await supabase.from('cardapio_produtos').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  console.log("Total rows for tenant in cardapio_produtos:", countTenant, "Error:", errCT);

  console.log("Fetching first 10 products for tenant...");
  const { data: prods, error: errP } = await supabase.from('cardapio_produtos').select('id, name, active, ativo, tenant_id').eq('tenant_id', tenantId).limit(10);
  console.log("Products:", prods, "Error:", errP);
}

run();
