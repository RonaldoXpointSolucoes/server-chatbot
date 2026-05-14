const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
if (!urlMatch || !keyMatch) { process.exit(1); }
const { createClient } = require('@supabase/supabase-js');
async function run() {
  const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());
  const { data, error } = await supabase.from('contacts').select('*').or('tags.cs.[{"123"}],company_ids.cs.{"456"}');
  console.log('ERROR:', error);
  console.log('DATA:', data ? data.length : null);
}
run();
