import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load env
const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  
  try {
    console.log("=== SEARCHING FOR SALADA IN CARDAPIO_PRODUTOS ===");
    const { data: products, error } = await supabase
      .from('cardapio_produtos')
      .select('*')
      .eq('tenant_id', tenantId)
      .ilike('name', '%salada%');

    if (error) throw error;
    console.log("Found products with 'salada':", products.map(p => ({ id: p.id, name: p.name, price: p.price })));

    console.log("\n=== SEARCHING FOR CAESAR IN CARDAPIO_PRODUTOS ===");
    const { data: caesarProducts, error: errorCaesar } = await supabase
      .from('cardapio_produtos')
      .select('*')
      .eq('tenant_id', tenantId)
      .ilike('name', '%caesar%');

    if (errorCaesar) throw errorCaesar;
    console.log("Found products with 'caesar':", caesarProducts.map(p => ({ id: p.id, name: p.name, price: p.price })));

    console.log("\n=== SEARCHING FOR CAESER IN CARDAPIO_PRODUTOS ===");
    const { data: caeserProducts, error: errorCaeser } = await supabase
      .from('cardapio_produtos')
      .select('*')
      .eq('tenant_id', tenantId)
      .ilike('name', '%caeser%');

    if (errorCaeser) throw errorCaeser;
    console.log("Found products with 'caeser':", caeserProducts.map(p => ({ id: p.id, name: p.name, price: p.price })));

    console.log("\n=== SEARCHING KNOWLEDGE DOCUMENTS FOR SALADA ===");
    const { data: docs, error: errDocs } = await supabase
      .from('knowledge_documents')
      .select('id, title, content')
      .eq('tenant_id', tenantId);

    if (errDocs) throw errDocs;
    console.log(`Found ${docs.length} knowledge documents.`);
    const matchingDocs = docs.filter(d => d.content.toLowerCase().includes('salada') || d.title.toLowerCase().includes('salada'));
    console.log("Matching documents in RAG:", matchingDocs.map(d => ({ id: d.id, title: d.title, contentSnippet: d.content.substring(0, 200) })));

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
