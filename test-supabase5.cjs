const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
if (!urlMatch || !keyMatch) { process.exit(1); }
const { createClient } = require('@supabase/supabase-js');
async function run() {
  const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());
  const uuid1 = '550e8400-e29b-41d4-a716-446655440000';
  const uuid2 = '550e8400-e29b-41d4-a716-446655440001';
  const orString = `tags.cs.[ "${uuid1}" ],company_ids.ov."{${uuid2}}"`;
  const { data, error } = await supabase.from('contacts').select('id').or(orString);
  console.log('ERROR:', error);
  console.log('DATA:', data ? data.length : null);
}
run();
