const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, status, last_message_preview')
    .limit(10);
    
  if (error) {
    console.error('Erro:', error);
  } else {
    console.log('Exemplos de conversas no banco:');
    console.log(data);
    
    // Contar status
    const { data: countData, error: countError } = await supabase
      .from('conversations')
      .select('status');
      
    if (countError) {
      console.error('Erro na contagem:', countError);
    } else {
      const counts = {};
      countData.forEach(c => {
        counts[c.status] = (counts[c.status] || 0) + 1;
      });
      console.log('\nResumo de status no banco:', counts);
    }
  }
}

run();
