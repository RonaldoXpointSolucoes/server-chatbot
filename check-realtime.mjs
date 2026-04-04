import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMjA3MDMsImV4cCI6MjA5MDc5NjcwM30.NmeEhsEqvg9Wp5fchUd5JyFt3K3e9Y-MHZ69wnNseec';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('🔄 Conectando ao canal realtime_chat usando a KEY PÚBLICA (simulando front-end)...');

const channel = supabase.channel('realtime_chat');

channel
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
    console.log('🔔 MENSAGEM RECEBIDA VIA REALTIME:', payload);
  })
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('✅ INSCRITO COM SUCESSO. Aguardando mensagens...');
      // Agora vamos inserir algo com admin key para ver se chega aqui
      testInsert();
    } else {
      console.error('❌ ERRO NA INSCRIÇÃO:', status, err);
    }
  });

async function testInsert() {
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';
  const adminSupabase = createClient(SUPABASE_URL, adminKey);
  
  console.log('✉️ Inserindo mensagem como backend...');
  
  // pega 1 id aleatório
  const { data: contacts } = await adminSupabase.from('contacts').select('id').limit(1);
  if(!contacts || contacts.length === 0) {
      console.log('Sem contatos no db');
      process.exit();
  }
  
  await adminSupabase.from('messages').insert({
      contact_id: contacts[0].id,
      whatsapp_id: `realtime-test-${Date.now()}`,
      text_content: 'Ping realtime...',
      sender_type: 'bot'
  });
  
  console.log('✉️ Inserção finalizada. Aguardemos 3s para ver se o evento de recebimento é impresso acima.');
  
  setTimeout(() => {
     console.log('Fim do teste. Se não apareceu "MENSAGEM RECEBIDA VIA REALTIME" acima, o Supabase não está mandando.');
     process.exit(0);
  }, 4000);
}
