const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
  console.log('Missing env variables');
  process.exit(1);
}

const url = urlMatch[1].trim();
const key = keyMatch[1].trim();

const { createClient } = require('@supabase/supabase-js');

async function run() {
  const supabase = createClient(url, key);
  
  // Fetch all contacts with document_number
  const { data, error } = await supabase.from('contacts').select('id, document_number').not('document_number', 'is', null);
  
  if (error) {
    console.error('Error fetching contacts:', error);
    return;
  }
  
  console.log(`Found ${data.length} contacts with document_number.`);
  
  let updated = 0;
  for (const contact of data) {
    const cleanDoc = contact.document_number.replace(/\D/g, '');
    if (cleanDoc !== contact.document_number) {
      console.log(`Updating contact ${contact.id} from ${contact.document_number} to ${cleanDoc}`);
      const { error: updateError } = await supabase.from('contacts').update({ document_number: cleanDoc }).eq('id', contact.id);
      if (updateError) {
        console.error(`Failed to update ${contact.id}:`, updateError);
      } else {
        updated++;
      }
    }
  }
  
  console.log(`Migration complete. Updated ${updated} contacts.`);
}

run();
