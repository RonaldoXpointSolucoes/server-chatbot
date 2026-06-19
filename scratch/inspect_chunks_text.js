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
    console.log("=== INSPECTING KNOWLEDGE CHUNKS CONTAINING CAESAR ===");
    const { data: chunks, error } = await supabase
      .from('knowledge_chunks')
      .select('id, document_id, content')
      .eq('tenant_id', tenantId)
      .ilike('content', '%caesar%');

    if (error) throw error;
    console.log(`Found ${chunks.length} chunks.`);
    for (const c of chunks) {
      console.log(`- ID: ${c.id} | Doc: ${c.document_id} | Content:\n"${c.content}"\n`);
    }

  } catch (err) {
    console.error("Error:", err);
  }
}

run();
