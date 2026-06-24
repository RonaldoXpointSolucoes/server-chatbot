import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

// Initialize with anon key, just like the frontend!
const supabaseAnon = createClient(supabaseUrl, anonKey);

async function run() {
  // First, get the company ID
  const { data: companies, error: fetchErr } = await supabaseAnon.from('companies').select('id, settings');
  if (fetchErr) {
    console.error("Fetch error:", fetchErr);
    return;
  }
  
  if (!companies || companies.length === 0) {
    console.log("No companies found with anon key.");
    return;
  }
  
  const company = companies[0];
  console.log("Found company:", company.id);
  
  // Try to update settings using the anon key
  const updatedSettings = {
    ...company.settings,
    test_update_field: "test_value_" + Date.now()
  };
  
  console.log("Attempting to update settings using anon key...");
  const { data: updateData, error: updateErr } = await supabaseAnon
    .from('companies')
    .update({ settings: updatedSettings })
    .eq('id', company.id)
    .select();
    
  if (updateErr) {
    console.error("Update error (anon key):", updateErr);
  } else {
    console.log("Update success (anon key):", updateData);
  }
}

run();
