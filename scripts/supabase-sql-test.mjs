import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: companies, error: fetchErr } = await supabase.from('companies').select('*');
  if (fetchErr) {
    console.error('Error fetching companies:', fetchErr);
    return;
  }
  console.log(`Found ${companies.length} companies. Mirroring to tenants...`);

  for (const company of companies) {
    const { error: insertErr } = await supabase.from('tenants').upsert({
      id: company.id,
      name: company.name,
      slug: company.email.split('@')[0] + '-' + Date.now(), // just a slug
      status: company.status || 'active'
    });
    if (insertErr) {
      console.error('Error inserting tenant:', company.name, insertErr);
    } else {
      console.log('Successfully inserted tenant:', company.name);
    }
  }
  process.exit(0);
}
run();
