import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

const supabase = createClient(supabaseUrl, anonKey);

async function testUpdateForCompany(companyId, label) {
  console.log(`\n--- Testing update for ${label} (${companyId}) ---`);
  
  // Fetch current settings first
  const { data: company, error: fetchErr } = await supabase
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .maybeSingle();
    
  if (fetchErr) {
    console.error("Fetch error:", fetchErr);
    return;
  }
  
  if (!company) {
    console.log("Company not found (or access denied).");
    return;
  }
  
  console.log("Current settings keys:", Object.keys(company.settings || {}));
  
  const updatedSettings = {
    ...(company.settings || {}),
    test_auth_update: "value_" + Date.now()
  };
  
  const { data: updateData, error: updateErr } = await supabase
    .from('companies')
    .update({ settings: updatedSettings })
    .eq('id', companyId)
    .select();
    
  if (updateErr) {
    console.error("Update failed:", updateErr);
  } else {
    console.log("Update succeeded! Returned rows:", updateData?.length);
  }
}

async function run() {
  console.log("Signing in as ronaldo.xpointsolucoes@gmail.com...");
  const { data: sessionData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'ronaldo.xpointsolucoes@gmail.com',
    password: 'Cc@xroxmaxi7'
  });
  
  if (authErr) {
    console.error("Auth error:", authErr);
    return;
  }
  
  console.log("Auth success. User ID:", sessionData.user?.id);
  
  // Test update for X-Point Soluções
  await testUpdateForCompany('8b1e427b-2321-4ea7-9d7e-90f7d5cbad21', 'X-Point Soluções');
  
  // Test update for Burguer Plus
  await testUpdateForCompany('9057ca36-0b29-4fe5-89fb-be5e13387030', 'Burguer Plus');
}

run();
