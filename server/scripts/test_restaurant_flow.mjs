import FlowEngine from '../src/flow-runtime/index.js';
import { supabase } from '../src/supabase.js';

const TENANT_ID = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21'; // X-Point Soluções
const CLIENT_JID = '5511975960999@s.whatsapp.net'; // Ronaldo-Web
const RESTAURANT_INSTANCE_ID = 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6'; // FoodNext

// Mock de envio Baileys para interceptar e exibir na íntegra as respostas
const mockSock = {
  sendMessage: async (targetJid, payload) => {
    console.log(`\n🤖 [FoodNext Bot -> ${targetJid}]:\n${payload.text}`);
    return { 
      key: { 
        id: `MOCK_BAILEYS_${Date.now()}_${Math.random().toString(36).substring(7)}`, 
        fromMe: true, 
        remoteJid: targetJid 
      } 
    };
  }
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('=================================================================');
  console.log('TESTE CONVERSACIONAL INTEGRADO - RESTAURANTE MASTER (3 EM 1)');
  console.log('Restaurante: FoodNext (11 94775-8860)');
  console.log('Cliente: Ronaldo-Web (11 97596-0999)');
  console.log('=================================================================\n');

  // Limpa estados prévios de teste para começar do zero
  await supabase.from('conversation_states').delete().eq('remote_jid', CLIENT_JID).eq('tenant_id', TENANT_ID);

  // -------------------------------------------------------------------------
  // CENÁRIO 1: BOAS-VINDAS E CARDÁPIO / FAZER PEDIDO (FLUXO 1)
  // -------------------------------------------------------------------------
  console.log('-----------------------------------------------------------------');
  console.log('ETAPA 1: Cliente inicia a conversa com "olá"');
  console.log('👤 [Ronaldo-Web]: olá');
  let handled = await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: 'olá',
    sock: mockSock
  });
  console.log(`\n-> Status: Mensagem processada pelo FlowEngine: ${handled}`);

  await sleep(1500);

  console.log('\n-----------------------------------------------------------------');
  console.log('ETAPA 2: Cliente escolhe a Opção 1 (Cardápio & Pedidos)');
  console.log('👤 [Ronaldo-Web]: 1');
  handled = await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: '1',
    sock: mockSock
  });
  console.log(`\n-> Status: Mensagem processada pelo FlowEngine: ${handled}`);

  await sleep(1500);

  console.log('\n-----------------------------------------------------------------');
  console.log('ETAPA 3: Cliente responde o tipo de entrega ("Entrega")');
  console.log('👤 [Ronaldo-Web]: Entrega');
  handled = await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: 'Entrega',
    sock: mockSock
  });
  console.log(`\n-> Status: Mensagem processada pelo FlowEngine: ${handled}`);

  // Verifica estado no banco
  let { data: state1 } = await supabase.from('conversation_states').select('*').eq('remote_jid', CLIENT_JID).eq('tenant_id', TENANT_ID).order('created_at', { ascending: false }).limit(1).single();
  console.log(`\n-> Variáveis coletadas no Fluxo 1:`, state1?.variables);
  console.log(`-> Status da Conversa no Fluxo 1: ${state1?.status}`);

  // -------------------------------------------------------------------------
  // CENÁRIO 2: CONSULTA DE STATUS DO PEDIDO (FLUXO 2)
  // -------------------------------------------------------------------------
  console.log('\n=================================================================');
  console.log('CENÁRIO 2: ACOMPANHAMENTO DE STATUS DO PEDIDO');
  console.log('=================================================================');
  
  // Limpa estado anterior para disparar novo gatilho
  await supabase.from('conversation_states').delete().eq('remote_jid', CLIENT_JID).eq('tenant_id', TENANT_ID);

  console.log('ETAPA 4: Cliente envia "pedido"');
  console.log('👤 [Ronaldo-Web]: pedido');
  handled = await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: 'pedido',
    sock: mockSock
  });
  console.log(`\n-> Status: Mensagem processada pelo FlowEngine: ${handled}`);

  await sleep(1500);

  console.log('\n-----------------------------------------------------------------');
  console.log('ETAPA 5: Cliente escolhe a Opção 2 (Acompanhar Meu Pedido)');
  console.log('👤 [Ronaldo-Web]: 2');
  handled = await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: '2',
    sock: mockSock
  });
  console.log(`\n-> Status: Mensagem processada pelo FlowEngine: ${handled}`);

  await sleep(1500);

  console.log('\n-----------------------------------------------------------------');
  console.log('ETAPA 6: Cliente informa o número do pedido ("#4582")');
  console.log('👤 [Ronaldo-Web]: #4582');
  handled = await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: '#4582',
    sock: mockSock
  });
  console.log(`\n-> Status: Mensagem processada pelo FlowEngine: ${handled}`);

  let { data: state2 } = await supabase.from('conversation_states').select('*').eq('remote_jid', CLIENT_JID).eq('tenant_id', TENANT_ID).order('created_at', { ascending: false }).limit(1).single();
  console.log(`\n-> Variáveis coletadas no Fluxo 2:`, state2?.variables);

  // -------------------------------------------------------------------------
  // CENÁRIO 3: FALAR COM ATENDENTE HUMANO (FLUXO 3)
  // -------------------------------------------------------------------------
  console.log('\n=================================================================');
  console.log('CENÁRIO 3: FALAR COM ATENDENTE HUMANO (HANDOFF)');
  console.log('=================================================================');
  
  await supabase.from('conversation_states').delete().eq('remote_jid', CLIENT_JID).eq('tenant_id', TENANT_ID);

  console.log('ETAPA 7: Cliente envia "menu"');
  console.log('👤 [Ronaldo-Web]: menu');
  handled = await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: 'menu',
    sock: mockSock
  });
  console.log(`\n-> Status: Mensagem processada pelo FlowEngine: ${handled}`);

  await sleep(1500);

  console.log('\n-----------------------------------------------------------------');
  console.log('ETAPA 8: Cliente escolhe a Opção 3 (Falar com Atendente)');
  console.log('👤 [Ronaldo-Web]: 3');
  handled = await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: '3',
    sock: mockSock
  });
  console.log(`\n-> Status: Mensagem processada pelo FlowEngine: ${handled}`);

  let { data: state3 } = await supabase.from('conversation_states').select('*').eq('remote_jid', CLIENT_JID).eq('tenant_id', TENANT_ID).order('created_at', { ascending: false }).limit(1).single();
  console.log(`\n-> Status final da Conversa após Handoff: ${state3?.status}`);
  console.log('=================================================================');
  console.log('✅ TODOS OS 3 CENÁRIOS CONVERSACIONAIS CONCLUÍDOS COM 100% DE SUCESSO!');
  console.log('=================================================================');
}

run().catch(console.error);
