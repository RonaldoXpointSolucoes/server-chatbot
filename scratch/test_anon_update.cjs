const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, anonKey);

async function run() {
  // Pegar uma conversa de teste
  const { data: convs, error: fetchErr } = await supabase
    .from('conversations')
    .select('id, status')
    .limit(1);
    
  if (fetchErr) {
    console.error('Erro ao buscar conversa:', fetchErr);
    return;
  }
  
  if (convs.length === 0) {
    console.log('Nenhuma conversa encontrada.');
    return;
  }
  
  const testConv = convs[0];
  const originalStatus = testConv.status;
  console.log(`Conversa teste id: ${testConv.id}, status original: ${originalStatus}`);
  
  // Tentar atualizar usando a anon key (como o frontend faz!)
  const { data: updateData, error: updateErr } = await supabase
    .from('conversations')
    .update({ status: 'resolved' })
    .eq('id', testConv.id)
    .select();
    
  if (updateErr) {
    console.error('Erro na atualização anon:', updateErr);
  } else {
    console.log('Sucesso no update anon:', updateData);
    
    // Restaurar status original
    await supabase
      .from('conversations')
      .update({ status: originalStatus })
      .eq('id', testConv.id);
  }
}

run();
