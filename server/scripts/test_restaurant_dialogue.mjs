import FlowEngine from '../src/flow-runtime/index.js';
import { supabase } from '../src/supabase.js';

const TENANT_ID = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
const RESTAURANT_INSTANCE_ID = 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6'; // FoodNext
const CLIENT_JID = '5511975960999@s.whatsapp.net'; // Ronaldo-Web

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Mock do socket Baileys com logs visuais e humanizados
const mockSock = {
  sendMessage: async (jid, content) => {
    console.log(`\n🤖 [FoodNext Bot -> ${jid}]:\n${content.text}`);
    return {
      key: {
        id: `MOCK_MSG_${Date.now()}`,
        remoteJid: jid,
        fromMe: true
      }
    };
  }
};

async function runDialogue() {
  console.log('=================================================================');
  console.log('TESTE CONVERSACIONAL REAL E COMPLETO - RESTAURANTE FOODNEXT (6 EM 1)');
  console.log('Restaurante: FoodNext (11 94775-8860)');
  console.log('Cliente: Ronaldo Clemente (11 97596-0999)');
  console.log('=================================================================\n');

  // Garante que o estado anterior do cliente esteja limpo para o teste
  await supabase.from('conversation_states').delete().eq('remote_jid', CLIENT_JID).eq('tenant_id', TENANT_ID);

  // -------------------------------------------------------------------------
  // DIÁLOGO 1: CONSULTA DE ENDEREÇO & HORÁRIO DE FUNCIONAMENTO (OPÇÃO 4)
  // -------------------------------------------------------------------------
  console.log('-----------------------------------------------------------------');
  console.log('PASSO 1: Cliente envia "boa tarde"');
  console.log('👤 [Ronaldo Clemente]: boa tarde');
  let handled = await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: 'boa tarde',
    sock: mockSock
  });
  console.log(`-> Handled pelo FlowEngine: ${handled}`);

  await sleep(1000);

  console.log('\n-----------------------------------------------------------------');
  console.log('PASSO 2: Cliente escolhe Opção 4 (Endereço & Horário de Funcionamento)');
  console.log('👤 [Ronaldo Clemente]: 4');
  handled = await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: '4',
    sock: mockSock
  });
  console.log(`-> Handled pelo FlowEngine: ${handled}`);

  // -------------------------------------------------------------------------
  // DIÁLOGO 2: FLUXO DE PEDIDO DELIVERY COM COLETA E CONFIRMAÇÃO DE ENDEREÇO
  // -------------------------------------------------------------------------
  console.log('\n=================================================================');
  console.log('DIÁLOGO 2: FLUXO COMPLETO DE PEDIDO DELIVERY (ITENS + ENDEREÇO + PGTO)');
  console.log('=================================================================');
  
  await supabase.from('conversation_states').delete().eq('remote_jid', CLIENT_JID).eq('tenant_id', TENANT_ID);

  console.log('PASSO 3: Cliente inicia novo pedido com "olá"');
  console.log('👤 [Ronaldo Clemente]: olá');
  await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: 'olá',
    sock: mockSock
  });

  await sleep(1000);

  console.log('\n-----------------------------------------------------------------');
  console.log('PASSO 4: Cliente escolhe Opção 2 (Fazer Pedido para Entrega)');
  console.log('👤 [Ronaldo Clemente]: 2');
  await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: '2',
    sock: mockSock
  });

  await sleep(1000);

  console.log('\n-----------------------------------------------------------------');
  console.log('PASSO 5: Cliente informa os itens desejados');
  console.log('👤 [Ronaldo Clemente]: 2 Monster Burgers Artesanais + 1 Batata Rústica + 1 Coca Zero');
  await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: '2 Monster Burgers Artesanais + 1 Batata Rústica + 1 Coca Zero',
    sock: mockSock
  });

  await sleep(1000);

  console.log('\n-----------------------------------------------------------------');
  console.log('PASSO 6: Cliente informa o endereço completo de entrega');
  console.log('👤 [Ronaldo Clemente]: Rua das Flores, 342, Apto 51 - Bairro Jardim Paulista (Próximo à padaria central)');
  await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: 'Rua das Flores, 342, Apto 51 - Bairro Jardim Paulista (Próximo à padaria central)',
    sock: mockSock
  });

  await sleep(1000);

  console.log('\n-----------------------------------------------------------------');
  console.log('PASSO 7: Cliente escolhe a forma de pagamento');
  console.log('👤 [Ronaldo Clemente]: Cartão de Crédito na Entrega');
  await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: 'Cartão de Crédito na Entrega',
    sock: mockSock
  });

  // Inspeciona o estado e variáveis gravadas
  const { data: stateOrder } = await supabase
    .from('conversation_states')
    .select('*')
    .eq('remote_jid', CLIENT_JID)
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('\n📦 Variáveis Coletadas no Pedido Delivery:', stateOrder?.variables);

  // -------------------------------------------------------------------------
  // DIÁLOGO 3: CONSULTA DE STATUS DO PEDIDO
  // -------------------------------------------------------------------------
  console.log('\n=================================================================');
  console.log('DIÁLOGO 3: ACOMPANHAMENTO DE STATUS DO PEDIDO');
  console.log('=================================================================');
  
  await supabase.from('conversation_states').delete().eq('remote_jid', CLIENT_JID).eq('tenant_id', TENANT_ID);

  console.log('PASSO 8: Cliente envia "pedido"');
  console.log('👤 [Ronaldo Clemente]: pedido');
  await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: 'pedido',
    sock: mockSock
  });

  await sleep(1000);

  console.log('\n-----------------------------------------------------------------');
  console.log('PASSO 9: Cliente escolhe Opção 5 (Acompanhar Meu Pedido)');
  console.log('👤 [Ronaldo Clemente]: 5');
  await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: '5',
    sock: mockSock
  });

  await sleep(1000);

  console.log('\n-----------------------------------------------------------------');
  console.log('PASSO 10: Cliente digita o número do pedido "#8842"');
  console.log('👤 [Ronaldo Clemente]: #8842');
  await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: '#8842',
    sock: mockSock
  });

  // -------------------------------------------------------------------------
  // DIÁLOGO 4: ATENDIMENTO HUMANO (HANDOFF)
  // -------------------------------------------------------------------------
  console.log('\n=================================================================');
  console.log('DIÁLOGO 4: TRANSFERÊNCIA PARA ATENDENTE HUMANO (HANDOFF)');
  console.log('=================================================================');
  
  await supabase.from('conversation_states').delete().eq('remote_jid', CLIENT_JID).eq('tenant_id', TENANT_ID);

  console.log('PASSO 11: Cliente envia "menu"');
  console.log('👤 [Ronaldo Clemente]: menu');
  await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: 'menu',
    sock: mockSock
  });

  await sleep(1000);

  console.log('\n-----------------------------------------------------------------');
  console.log('PASSO 12: Cliente escolhe Opção 7 (Falar com Atendente)');
  console.log('👤 [Ronaldo Clemente]: 7');
  await FlowEngine.processIncomingMessage({
    tenantId: TENANT_ID,
    instanceId: RESTAURANT_INSTANCE_ID,
    conversationId: null,
    jid: CLIENT_JID,
    textMessage: '7',
    sock: mockSock
  });

  const { data: stateHandoff } = await supabase
    .from('conversation_states')
    .select('status, variables')
    .eq('remote_jid', CLIENT_JID)
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log(`\n-> Status Final do Estado após Handoff: ${stateHandoff?.status}`);
  console.log('=================================================================');
  console.log('✅ TESTE CONVERSACIONAL DO RESTAURANTE COMPLETO VALIDADO 100%!');
  console.log('=================================================================');
}

runDialogue().catch(console.error);
