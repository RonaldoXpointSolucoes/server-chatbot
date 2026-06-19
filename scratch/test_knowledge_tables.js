import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  const tables = ['knowledge_documents', 'documents', 'knowledge_files', 'knowledge', 'files'];
  
  for (const t of tables) {
    try {
      const { data, error } = await supabase.from(t).select('*').eq('tenant_id', tenantId).limit(10);
      if (error) {
        console.log(`Table ${t}: Error (${error.message})`);
      } else {
        console.log(`Table ${t}: EXISTS! Found ${data.length} records.`);
        if (data.length > 0) {
          console.log(data.map(d => ({ id: d.id, name: d.name || d.title || d.filename || d.label })));
        }
      }
    } catch (e) {
      console.log(`Table ${t}: Exception (${e.message})`);
    }
  }
}

run();
