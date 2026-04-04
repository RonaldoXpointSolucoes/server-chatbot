import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const fakeEvolutionPayload = {
  instance: "ChatBoot_Test", // Tem que existir esse tenant
  data: {
    key: {
      fromMe: false,
      remoteJid: "5511999999999@s.whatsapp.net",
      id: "FAKE_MSG_ID_" + Date.now()
    },
    pushName: "Test User",
    message: {
      conversation: "Mensagem de teste injetada!"
    }
  }
};

async function testEdgeFunctionLogic(payload) {
  try {
    const instance = payload.instance;
    const isFromMe = payload.data?.key?.fromMe || false;
    const remoteJid = payload.data?.key?.remoteJid || '';
    let phone = remoteJid.includes('@') ? remoteJid.split('@')[0] : remoteJid;
    if (remoteJid.includes('@lid') && payload.data?.key?.remoteJidAlt) {
      phone = payload.data?.key?.remoteJidAlt.split('@')[0];
    }
    const msgText = payload.data?.message?.conversation || payload.data?.message?.extendedTextMessage?.text || '';
    const senderName = payload.data?.pushName || 'Client';
    const senderType = isFromMe ? 'human' : 'client';
    const whatsappId = payload.data?.key?.id;

    if (!msgText || !instance) {
      console.log("Ignored: No text or instance");
      return;
    }

    // 1. Get Tenant uuid
    // Vou usar wildcard para testes, vamos ver se temos Tenant.
    let { data: tenantData } = await supabaseClient
      .from('tenants')
      .select('id, evolution_instance_name')
      .limit(1)
      .single();

    if (!tenantData) {
      console.error(`Nenhum Tenant no banco para testar!`);
      return;
    }

    console.log(`Usando tenant_id: ${tenantData.id} (${tenantData.evolution_instance_name})`);

    // 2. Upsert Contact
    const { data: contactData, error: contactError } = await supabaseClient
      .from('contacts')
      .upsert({
        tenant_id: tenantData.id,
        phone: '5511999999999', // telefone fake
        evolution_remote_jid: '5511999999999@s.whatsapp.net',
        name: 'Usuário Validação'
      }, { onConflict: 'tenant_id,phone' })
      .select('id')
      .single()

    if (contactError || !contactData) {
      console.error(`Erro ao criar/atualizar contato:`, contactError);
      return;
    }

    console.log(`Contato upsertado com id: ${contactData.id}`);

    // 3. Insert message
    const { error: msgError } = await supabaseClient
      .from('messages')
      .insert({
        contact_id: contactData.id,
        text_content: msgText,
        sender_type: senderType,
        whatsapp_id: whatsappId
      });

    if (msgError) {
      if (msgError.code !== '23505') {
        console.error(`Erro ao inserir mensagem:`, msgError);
        return;
      }
    }

    console.log("Mensagem inserida com SUCESSO. Cheque o Frontend!");

  } catch (err) {
    console.error("Crashou:", err);
  }
}

testEdgeFunctionLogic(fakeEvolutionPayload);
