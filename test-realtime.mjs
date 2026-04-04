import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testRealtime() {
  console.log('🔄 Iniciando teste de inserção para validação do Realtime...');

  try {
    // 1. Procurar um contato ou criar um mock
    console.log('📍 Buscando um contato existente...');
    let { data: contacts, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .limit(1);

    if (contactError) throw contactError;

    let contactId;

    if (!contacts || contacts.length === 0) {
      console.log('⚠️ Nenhum contato encontrado. Criando um contato temporário...');
      
      const { data: tenantData } = await supabase.from('tenants').select('id').limit(1).single();
      const tenantId = tenantData ? tenantData.id : null;
      
      // Criar de forma genérica
      const newContact = {
        tenant_id: tenantId,
        name: 'Contato Teste (Bot)',
        phone: '5511999999999',
        evolution_remote_jid: '5511999999999@s.whatsapp.net',
        bot_status: 'active'
      };
      
      const { data: insertedContact, error: insertError } = await supabase
        .from('contacts')
        .insert([newContact])
        .select()
        .single();
        
      if (insertError) {
         // Ocasionalmente pode dar exceção unique e ignoramos
         console.log('Erro ao criar: ', insertError.message);
      } else {
         contactId = insertedContact.id;
         console.log('✅ Contato fictício criado: ', contactId);
      }
    } else {
      contactId = contacts[0].id;
      console.log('✅ Contato encontrado:', contacts[0].name, '- ID:', contactId);
    }
    
    if(!contactId) {
        throw new Error('Não possível garantir o id do contato. Abortando.')
    }

    // 2. Inserir uma Mensagem e Ver a magica
    const fakeMessageId = `dev-test-${Date.now()}`;
    const fakeMessage = {
      contact_id: contactId,
      whatsapp_id: fakeMessageId,
      text_content: '🟢 Opa! Essa é uma mensagem gerada do servidor para testar o **Realtime** no front-end! Se estive piscando a bolinha, tudo certo!',
      sender_type: 'bot',
    };

    console.log('✉️ Inserindo mensagem na tabela...', fakeMessage);
    const { data: insertedMessage, error: msgError } = await supabase
      .from('messages')
      .insert([fakeMessage])
      .select();

    if (msgError) throw msgError;

    console.log('🚀 SUCESSO! A mensagem foi inserida no banco.');
    console.log('Olhe o front-end e o Realtime Inspector, e veja se apareceu:');
    console.log(insertedMessage[0]);

  } catch (err) {
    console.error('❌ FATAL: Erro ao testar BD:', err);
  }
}

testRealtime();
