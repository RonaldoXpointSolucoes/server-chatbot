import { createClient } from '@supabase/supabase-js';
import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';

// Load env from parent directory
const envPath = path.resolve('../.env');
const env = fs.readFileSync(envPath, 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

const supabase = createClient(supabaseUrl, serviceKey);

// Configs
const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
const docName = 'cardapio_burguer_plus.txt';

class EmbeddingsPipeline {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance = null;

  static async getInstance() {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, this.model, { quantized: true });
    }
    return this.instance;
  }
}

function splitTextIntoChunks(text, chunkSize = 150, overlap = 20) {
  const words = text.split(/\s+/);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    chunks.push(chunk);
    i += (chunkSize - overlap);
  }
  return chunks;
}

const ZERO_VALUE_EXCEPTIONS = [
  'catchup', 'ketchup', 'guardanapo', 'molho', 'maionese', 
  'mostarda', 'barbecue', 'brinde', 'cortesia', 'adicional', 
  'sachê', 'sache', 'canudo', 'talher', 'limão', 'limao', 'gelo', 'copo'
];

function isLegitimateZeroValueItem(name, description) {
  const text = `${name || ''} ${description || ''}`.toLowerCase();
  return ZERO_VALUE_EXCEPTIONS.some(term => text.includes(term));
}

async function run() {
  try {
    console.log("1. Fetching groups/categories, products, and steps from database...");
    
    // Fetch all active categories
    const { data: categories, error: errCats } = await supabase
      .from('cardapio_grupos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .order('ordem', { ascending: true });

    if (errCats) throw errCats;

    // Fetch all active products
    const { data: products, error: errProds } = await supabase
      .from('cardapio_produtos')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('ativo', true);

    if (errProds) throw errProds;

    // Fetch passos and opcoes
    const { data: dbPassos } = await supabase
      .from('cardapio_passos')
      .select('id, produto_id, pergunta, sub_titulo')
      .eq('tenant_id', tenantId)
      .eq('ativo', true);

    const { data: dbOpcoes } = await supabase
      .from('cardapio_opcoes')
      .select('id, passo_id, descricao, preco')
      .eq('tenant_id', tenantId)
      .eq('ativo', true);

    const opcoesByPasso = new Map();
    if (dbOpcoes) {
      dbOpcoes.forEach(opt => {
        if (!opcoesByPasso.has(opt.passo_id)) opcoesByPasso.set(opt.passo_id, []);
        opcoesByPasso.get(opt.passo_id).push(opt);
      });
    }

    const passosByProduto = new Map();
    if (dbPassos) {
      dbPassos.forEach(pas => {
        if (!passosByProduto.has(pas.produto_id)) passosByProduto.set(pas.produto_id, []);
        passosByProduto.get(pas.produto_id).push({
          ...pas,
          opcoes: opcoesByPasso.get(pas.id) || []
        });
      });
    }

    // Filter zero price items
    const validProducts = (products || []).filter(p => {
      const price = Number(p.price || 0);
      if (price > 0) return true;
      return isLegitimateZeroValueItem(p.name, p.description);
    });

    console.log(`Fetched ${categories.length} categories and ${validProducts.length} valid products.`);

    // 2. Format cardapio text
    let cardapioText = `LINK DO CARDÁPIO DIGITAL: https://www.burguerplus.com.br\n\n=== MENU DE PRODUTOS COMPLETO BURGUER PLUS ===\n\n`;

    const formatProductRAG = (p) => {
      let itemStr = `${p.name.toUpperCase()}\n`;
      if (p.description) {
        itemStr += `Descrição: ${p.description}\n`;
      }
      itemStr += `Preço: R$ ${parseFloat(p.price || 0).toFixed(2).replace('.', ',')}\n`;
      
      const productSteps = passosByProduto.get(p.id) || [];
      if (productSteps.length > 0) {
        itemStr += `Opções, Sabores e Adicionais:\n`;
        for (const st of productSteps) {
          if (st.opcoes && st.opcoes.length > 0) {
            for (const op of st.opcoes) {
              const addPrice = Number(op.preco || 0);
              const priceTag = addPrice > 0 ? ` (+R$ ${addPrice.toFixed(2).replace('.', ',')})` : '';
              itemStr += `  - [${st.pergunta}] ${op.descricao}${priceTag}\n`;
            }
          }
        }
      }
      itemStr += `\n`;
      return itemStr;
    };

    for (const cat of categories) {
      const catProducts = validProducts.filter(p => p.grupo_id === cat.id);
      if (catProducts.length === 0) continue;

      cardapioText += `CATEGORIA: ${cat.descricao.toUpperCase()}\n`;
      cardapioText += `------------------------------------------------\n`;

      for (const p of catProducts) {
        cardapioText += formatProductRAG(p);
      }
      cardapioText += `\n`;
    }

    console.log("Formatted cardapio text size:", cardapioText.length, "characters.");
    console.log("Preview:\n", cardapioText.substring(0, 500));

    // 3. Clean up existing document of cardapio
    console.log("3. Checking for existing cardapio documents in RAG...");
    const { data: oldDocs, error: errFindDoc } = await supabase
      .from('knowledge_documents')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', docName);

    if (errFindDoc) throw errFindDoc;

    if (oldDocs && oldDocs.length > 0) {
      const docIds = oldDocs.map(d => d.id);
      console.log(`Deleting existing cardapio chunks for document IDs: ${docIds.join(', ')}`);
      await supabase.from('knowledge_chunks').delete().in('document_id', docIds);
      await supabase.from('knowledge_documents').delete().in('id', docIds);
      console.log("Deleted old documents and chunks.");
    }

    // 4. Insert new document
    console.log("4. Registering new document in RAG...");
    const { data: docData, error: docError } = await supabase
      .from('knowledge_documents')
      .insert([{
        tenant_id: tenantId,
        name: docName,
        type: 'text/plain',
        status: 'processing',
        metadata: { size: cardapioText.length }
      }])
      .select('*')
      .single();

    if (docError) throw docError;
    const documentId = docData.id;
    console.log(`New document registered with ID: ${documentId}`);

    // 5. Split and embedding chunks
    const chunks = splitTextIntoChunks(cardapioText, 150, 20);
    console.log(`Split text into ${chunks.length} chunks.`);

    const transformer = await EmbeddingsPipeline.getInstance();
    const dbChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      if (chunkText.trim().length < 5) continue;

      const output = await transformer(chunkText, { pooling: 'mean', normalize: true });
      const embeddingVector = Array.from(output.data);

      dbChunks.push({
        document_id: documentId,
        tenant_id: tenantId,
        content: chunkText,
        embedding: embeddingVector,
        chunk_index: i
      });
      
      console.log(`Chunk ${i+1}/${chunks.length} vectorized.`);
    }

    // 6. Save new chunks
    console.log("6. Saving chunks into database...");
    if (dbChunks.length > 0) {
      const { error: chunkError } = await supabase
        .from('knowledge_chunks')
        .insert(dbChunks);
        
      if (chunkError) throw chunkError;
    }

    // 7. Update document status to ready
    const { error: finalError } = await supabase
      .from('knowledge_documents')
      .update({ status: 'ready' })
      .eq('id', documentId);

    if (finalError) throw finalError;

    console.log("Cardapio RAG synchronization finished with SUCCESS!");

  } catch (err) {
    console.error("Error in RAG synchronization:", err);
  }
}

run();
