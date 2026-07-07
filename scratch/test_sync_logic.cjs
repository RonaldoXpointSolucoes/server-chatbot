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
  const tenantId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21'; // X-Point
  
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

  const nowTime = Date.now();
  const refreshThreshold = 24 * 60 * 60 * 1000; // 24 hours

  const productsToSync = [];
  const productsToRefresh = [];

  for (const product of produtos) {
      if (!productPassosMap.has(product.id)) {
          productsToSync.push(product);
      } else {
          const lastSync = productPassosMap.get(product.id);
          if (nowTime - lastSync > refreshThreshold) {
              productsToRefresh.push({ product, lastSync });
          }
      }
  }

  console.log(`Products: ${produtos.length}`);
  console.log(`Unsynced (to sync): ${productsToSync.length}`);
  console.log(`Synced but older than 24h (to refresh): ${productsToRefresh.length}`);
}

run();
