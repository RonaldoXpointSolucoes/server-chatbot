const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Conectando ao Supabase em:", supabaseUrl);
  const { data, error } = await supabase
    .from('face_auth')
    .select('id, email, created_at, face_photo_base64');
    
  if (error) {
    console.error("Erro ao buscar biometrias:", error);
    return;
  }
  
  console.log(`Encontradas ${data.length} biometrias cadastradas:`);
  data.forEach(d => {
    console.log(`- ID: ${d.id} | Email: ${d.email} | Foto Size: ${d.face_photo_base64?.length || 0} bytes | Criado em: ${d.created_at}`);
  });
}

run();
