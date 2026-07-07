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
  
  // 1. Get products
  const { data: produtos, error: errP } = await supabase
      .from('cardapio_produtos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('ativo', true);
      
  if (errP) {
      console.error("Error products:", errP);
      return;
  }

  // 2. Get existing steps
  let existingPassos = [];
  try {
      const { data: fetchPassos, error: errPassos } = await supabase
          .from('cardapio_passos')
          .select('produto_id, created_at')
          .eq('tenant_id', tenantId);
      if (!errPassos && fetchPassos) {
          existingPassos = fetchPassos;
      }
  } catch (dbErr) {
      console.error('Error loading existing steps:', dbErr.message);
  }

  const productPassosMap = new Map();
  existingPassos.forEach(p => {
      const t = p.created_at ? new Date(p.created_at).getTime() : 0;
      if (!productPassosMap.has(p.produto_id) || t > productPassosMap.get(p.produto_id)) {
          productPassosMap.set(p.produto_id, t);
      }
  });

  console.log(`Total active products in Supabase: ${produtos.length}`);
  console.log(`Total steps in cardapio_passos: ${existingPassos.length}`);
  
  const unsynced = [];
  for (const product of produtos) {
      if (!productPassosMap.has(product.id)) {
          unsynced.push(product);
      }
  }
  
  console.log(`Unsynced products count: ${unsynced.length}`);
  if (unsynced.length > 0) {
      console.log("Unsynced product IDs:", unsynced.map(u => u.id));
  }
}

run();
