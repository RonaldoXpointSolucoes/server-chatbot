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
    console.log("=== CHECKING KNOWLEDGE_DOCUMENTS SCHEMA ===");
    // Fetch a single row to see columns
    const { data: oneRow, error: errRow } = await supabase
      .from('knowledge_documents')
      .select('*')
      .limit(1);

    if (errRow) throw errRow;
    console.log("Columns in knowledge_documents:", Object.keys(oneRow[0] || {}));

    console.log("\n=== LISTING ALL KNOWLEDGE DOCUMENTS ===");
    const { data: docs, error: errDocs } = await supabase
      .from('knowledge_documents')
      .select('id, name, content')
      .eq('tenant_id', tenantId);

    if (errDocs) throw errDocs;
    console.log(`Found ${docs.length} documents.`);
    for (const d of docs) {
      console.log(`- ID: ${d.id} | Name: ${d.name} | Content length: ${d.content?.length || 0}`);
    }

    console.log("\n=== SEARCHING KNOWLEDGE DOCUMENTS CONTENT FOR CAESAR ===");
    const matchingDocs = docs.filter(d => d.content?.toLowerCase().includes('caesar') || d.name?.toLowerCase().includes('caesar'));
    console.log("Matching documents:", matchingDocs.map(d => ({ id: d.id, name: d.name, snippet: d.content?.substring(0, 300) })));

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
