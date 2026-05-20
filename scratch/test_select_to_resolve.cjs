const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, anonKey);

async function run() {
  const tenantId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21'; // Do log anterior vemos esse tenant_id
  
  let query = supabase.from('conversations')
    .select('id, contact_id, status, assigned_to, instance_id')
    .eq('tenant_id', tenantId)
    .neq('status', 'resolved');

  const { data, error } = await query;
  
  if (error) {
    console.error('Erro na query:', error);
  } else {
    console.log(`Query retornou ${data.length} conversas para resolver.`);
    if (data.length > 0) {
      console.log('Exemplo das primeiras 5:');
      console.log(data.slice(0, 5));
    }
  }
}

run();
