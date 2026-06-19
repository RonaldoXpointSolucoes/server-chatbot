import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  try {
    console.log("--- EMPRESAS ---");
    const { data: companies, error: errComp } = await supabase.from('companies').select('*');
    if (errComp) console.error("Erro ao buscar empresas:", errComp);
    else console.log(companies.map(c => ({ id: c.id, name: c.name, slug: c.slug })));

    console.log("\n--- BOTS ---");
    const { data: bots, error: errBots } = await supabase.from('bots').select('*');
    if (errBots) console.error("Erro ao buscar bots:", errBots);
    else console.log(bots.map(b => ({ id: b.id, name: b.name, tenant_id: b.tenant_id, active: b.active })));

    console.log("\n--- CONFIGURACOES GERAIS DOS BOTS ---");
    if (bots) {
      for (const b of bots) {
        console.log(`Bot: ${b.name} (${b.id}) - Tenant: ${b.tenant_id}`);
        console.log(`Prompt:`, b.systemPrompt || b.system_prompt);
      }
    }

    console.log("\n--- KNOWLEDGE CHUNKS ---");
    const { data: chunks, error: errChunks } = await supabase.from('knowledge_chunks').select('*').limit(20);
    if (errChunks) {
      console.log("knowledge_chunks table select error, trying knowledge table...");
      const { data: kTable, error: errK } = await supabase.from('knowledge').select('*').limit(20);
      if (errK) console.error("Erro ao buscar base de conhecimento:", errK);
      else console.log(kTable);
    } else {
      console.log(chunks.map(c => ({ id: c.id, tenant_id: c.tenant_id, content: c.content ? c.content.substring(0, 100) + '...' : null })));
    }

    console.log("\n--- PRODUTOS NO CARDAPIO (cardapio_produtos) ---");
    const { data: menuProds, error: errMenuProds } = await supabase.from('cardapio_produtos').select('*');
    if (errMenuProds) {
      console.log("cardapio_produtos table select error, trying products table...");
      const { data: prods, error: errProds } = await supabase.from('products').select('*');
      if (errProds) console.error("Erro ao buscar produtos:", errProds);
      else console.log(prods);
    } else {
      console.log(menuProds.map(p => ({ id: p.id, name: p.name, price: p.price, tenant_id: p.tenant_id })));
    }
  } catch (err) {
    console.error("Erro geral no script:", err);
  }
}

run();
