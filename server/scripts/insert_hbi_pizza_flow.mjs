import { supabase } from '../src/supabase.js';
import { v4 as uuidv4 } from 'uuid';

const TENANT_ID = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

async function run() {
  console.log('--- Publicando Modelo Oficial Hbi Pizza & Restaurante ---');

  const startGroupId = `group-start-${uuidv4().substring(0, 6)}`;
  const menuBlockId = `block-menu-${uuidv4().substring(0, 6)}`;

  const pedidoGroupId = `group-pedido-${uuidv4().substring(0, 6)}`;
  const cardapioGroupId = `group-cardapio-${uuidv4().substring(0, 6)}`;
  const enderecoGroupId = `group-endereco-${uuidv4().substring(0, 6)}`;
  const horarioGroupId = `group-horario-${uuidv4().substring(0, 6)}`;
  const atendenteGroupId = `group-atendente-${uuidv4().substring(0, 6)}`;

  const hbiNodes = [
    // 1. Grupo Início Normal
    {
      id: startGroupId,
      type: 'typebot_group',
      position: { x: 350, y: 50 },
      data: {
        id: startGroupId,
        label: 'Início Normal',
        blocks: [
          {
            id: `msg-welcome-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Mensagem Inicial',
            text: 'Olá, {{pushName}}! {{saudacao}}!\nSeja bem-vindo ao {{NomeEmpresa}}!\n\nAbaixo o cardápio:\n👉 {{cardapio}}'
          },
          {
            id: menuBlockId,
            flowType: 'buttons',
            label: 'Menu de Opções',
            text: 'INFORMAÇÕES:\nEscolha uma opção ⤵️\n\nDigite só o número:',
            options: [
              '1 - Fazer pedido 🛵',
              '2 - Ver cardápio - Fotos reais das nossas pizzas! 🍕',
              '3 - Localização 📍',
              '4 - Horário de Funcionamento ⏰',
              '5 - Falar com atendente 👤'
            ],
            var_name: 'NumeroMenu'
          }
        ]
      }
    },
    // 2. Grupo 1 - Fazer Pedido
    {
      id: pedidoGroupId,
      type: 'typebot_group',
      position: { x: 50, y: 400 },
      data: {
        id: pedidoGroupId,
        label: '1 - Fazer Pedido',
        blocks: [
          {
            id: `msg-ped-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Link e Instruções',
            text: '🛵 *Fazer Pedido - Delivery & Retirada*\nÓtimo, {{pushName}}! Você pode acessar nosso cardápio digital completo:\n👉 {{cardapio}}\n\nOu digitar os itens aqui mesmo pelo WhatsApp!'
          },
          {
            id: `ask-itens-${uuidv4().substring(0, 6)}`,
            flowType: 'ask',
            label: 'Itens do Pedido',
            text: 'Quais sabores de pizza, bebidas ou porções você gostaria de pedir?',
            var_name: 'itens_pedido'
          },
          {
            id: `ask-end-${uuidv4().substring(0, 6)}`,
            flowType: 'ask',
            label: 'Endereço',
            text: 'Excelente! Agora digite seu endereço completo para entrega (Rua, Número, Bairro):',
            var_name: 'endereco_entrega'
          },
          {
            id: `msg-ped-conf-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Confirmação',
            text: '✅ *Pedido Anotado com Sucesso, {{pushName}}!*\n\n📋 *Resumo:*\n- *Itens:* {{itens_pedido}}\n- *Entrega em:* {{endereco_entrega}}\n\nNossa cozinha já está preparando! Retornando ao menu principal...'
          },
          {
            id: `jump-ped-${uuidv4().substring(0, 6)}`,
            flowType: 'jump',
            label: 'Jump to Menu',
            target_group_id: startGroupId
          }
        ]
      }
    },
    // 3. Grupo 2 - Acesso ao Cardápio
    {
      id: cardapioGroupId,
      type: 'typebot_group',
      position: { x: 380, y: 400 },
      data: {
        id: cardapioGroupId,
        label: '2 - Acesso ao cardápio',
        blocks: [
          {
            id: `msg-card-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Cardápio com Fotos',
            text: '🍕 *Cardápio & Fotos Reais*\nClique abaixo e faça seu pedido:\n\nClique Aqui... 👇👇👇\n👉 {{cardapio}}\n\nTemos Burgers Artesanais, Pizzas Tradicionais e Especiais, Bebidas e Sobremesas!'
          },
          {
            id: `jump-card-${uuidv4().substring(0, 6)}`,
            flowType: 'jump',
            label: 'Jump to Menu',
            target_group_id: startGroupId
          }
        ]
      }
    },
    // 4. Grupo 3 - Localização
    {
      id: enderecoGroupId,
      type: 'typebot_group',
      position: { x: 720, y: 400 },
      data: {
        id: enderecoGroupId,
        label: '3 - Localização',
        blocks: [
          {
            id: `msg-end-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Endereço e Mapa',
            text: '📍 *Localização*\nNeste link você pode abrir no Google Maps:\n\nClique Aqui... 👇👇👇\n👉 {{GoogleMaps}}\n\nEndereço: {{EnderecoEmpresa}}'
          },
          {
            id: `msg-end-card-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Cardápio Link',
            text: 'Ou para ver nosso cardápio:\nClique Aqui... 👇👇👇\n👉 {{cardapio}}'
          },
          {
            id: `jump-end-${uuidv4().substring(0, 6)}`,
            flowType: 'jump',
            label: 'Jump to Menu',
            target_group_id: startGroupId
          }
        ]
      }
    },
    // 5. Grupo 4 - Horário de Atendimento
    {
      id: horarioGroupId,
      type: 'typebot_group',
      position: { x: 1060, y: 400 },
      data: {
        id: horarioGroupId,
        label: '4 - Horário de Atendimento',
        blocks: [
          {
            id: `msg-hor-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Horários',
            text: '⏰ *Horário de Atendimento:*\n{{DiaFuncionamento}} das {{HoraFuncionamento}}\n\nAdoramos ver nossos clientes e estamos sempre prontos para oferecer uma experiência gastronômica incrível! Esperamos vê-lo em breve!'
          },
          {
            id: `msg-hor-card-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Cardápio Link',
            text: 'Ou para ver nosso cardápio:\nClique Aqui... 👇👇👇\n👉 {{cardapio}}'
          },
          {
            id: `jump-hor-${uuidv4().substring(0, 6)}`,
            flowType: 'jump',
            label: 'Jump to Menu',
            target_group_id: startGroupId
          }
        ]
      }
    },
    // 6. Grupo 5 - Falar com Atendente
    {
      id: atendenteGroupId,
      type: 'typebot_group',
      position: { x: 1400, y: 400 },
      data: {
        id: atendenteGroupId,
        label: '5 - Falar com Atendente',
        blocks: [
          {
            id: `msg-atend-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Aviso de Transferência',
            text: '👤 *Atendimento Humano*\nUm momento, {{pushName}}! Já estamos transferindo seu atendimento para a nossa equipe no balcão.'
          },
          {
            id: `handoff-${uuidv4().substring(0, 6)}`,
            flowType: 'handoff',
            label: 'Transferência Humana'
          },
          {
            id: `msg-atend-wait-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Aguardar',
            text: 'Um de nossos atendentes entrará em contato aqui em instantes. Por favor, aguarde só um momento! ⏱️'
          }
        ]
      }
    }
  ];

  const hbiEdges = [
    {
      id: `edge-1-${uuidv4().substring(0, 6)}`,
      type: 'smoothstep',
      source: startGroupId,
      target: pedidoGroupId,
      sourceHandle: menuBlockId,
      label: '1 - Fazer pedido 🛵',
      animated: true,
      style: { stroke: '#10b981', strokeWidth: 3 }
    },
    {
      id: `edge-2-${uuidv4().substring(0, 6)}`,
      type: 'smoothstep',
      source: startGroupId,
      target: cardapioGroupId,
      sourceHandle: menuBlockId,
      label: '2 - Ver cardápio - Fotos reais das nossas pizzas! 🍕',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 3 }
    },
    {
      id: `edge-3-${uuidv4().substring(0, 6)}`,
      type: 'smoothstep',
      source: startGroupId,
      target: enderecoGroupId,
      sourceHandle: menuBlockId,
      label: '3 - Localização 📍',
      animated: true,
      style: { stroke: '#f59e0b', strokeWidth: 3 }
    },
    {
      id: `edge-4-${uuidv4().substring(0, 6)}`,
      type: 'smoothstep',
      source: startGroupId,
      target: horarioGroupId,
      sourceHandle: menuBlockId,
      label: '4 - Horário de Funcionamento ⏰',
      animated: true,
      style: { stroke: '#ec4899', strokeWidth: 3 }
    },
    {
      id: `edge-5-${uuidv4().substring(0, 6)}`,
      type: 'smoothstep',
      source: startGroupId,
      target: atendenteGroupId,
      sourceHandle: menuBlockId,
      label: '5 - Falar com atendente 👤',
      animated: true,
      style: { stroke: '#8b5cf6', strokeWidth: 3 }
    }
  ];

  // Inserir o Flow no Supabase
  const { data: newFlow, error: fErr } = await supabase
    .from('flows')
    .insert({
      tenant_id: TENANT_ID,
      name: 'Hbi Pizza & Restaurante (Modelo Oficial)',
      trigger_rules: [
        { type: 'EXACT', value: 'oi' },
        { type: 'EXACT', value: 'olá' },
        { type: 'EXACT', value: 'ola' },
        { type: 'EXACT', value: 'menu' },
        { type: 'EXACT', value: 'cardapio' },
        { type: 'EXACT', value: 'cardápio' },
        { type: 'EXACT', value: 'pedido' },
        { type: 'EXACT', value: 'pizza' },
        { type: 'EXACT', value: 'pizzaria' },
        { type: 'EXACT', value: 'boa tarde' },
        { type: 'EXACT', value: 'boa noite' },
        { type: 'EXACT', value: 'bom dia' }
      ]
    })
    .select()
    .single();

  if (fErr || !newFlow) {
    console.error('Erro ao criar flow:', fErr);
    return;
  }

  // Inserir a versão publicada
  const { data: version, error: vErr } = await supabase
    .from('flow_versions')
    .insert({
      flow_id: newFlow.id,
      status: 'PUBLISHED',
      nodes: hbiNodes,
      edges: hbiEdges
    })
    .select()
    .single();

  if (vErr || !version) {
    console.error('Erro ao criar version:', vErr);
    return;
  }

  // Ativa a versão
  await supabase
    .from('flows')
    .update({ active_version_id: version.id })
    .eq('id', newFlow.id);

  console.log(`✅ Fluxo Hbi Pizza & Restaurante Criado com Sucesso!`);
  console.log(`Flow ID: ${newFlow.id}`);
  console.log(`Version ID: ${version.id}`);
}

run();
