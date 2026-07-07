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
  
  console.log("Grouping cardapio_produtos by tenant_id...");
  const { data: prods, error: errP } = await supabase.from('cardapio_produtos').select('tenant_id, name');
  if (errP) console.error("Error products:", errP);
  
  const groups = {};
  prods.forEach(p => {
    groups[p.tenant_id] = (groups[p.tenant_id] || 0) + 1;
  });
  console.log("Products count by tenant_id:", groups);

  console.log("Grouping cardapio_passos by tenant_id...");
  const { data: passos, error: errPassos } = await supabase.from('cardapio_passos').select('tenant_id');
  if (errPassos) console.error("Error passos:", errPassos);
  
  const passGroups = {};
  passos.forEach(p => {
    passGroups[p.tenant_id] = (passGroups[p.tenant_id] || 0) + 1;
  });
  console.log("Passos count by tenant_id:", passGroups);
}

run();
