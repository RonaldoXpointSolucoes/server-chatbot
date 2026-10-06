import { supabase } from '../src/supabase.js';
import { v4 as uuidv4 } from 'uuid';

const TENANT_ID = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21'; // X-Point Soluções

export async function createOrUpdateHbiFlow() {
  console.log('--- Sincronizando Fluxo Oficial Hbi Pizza Idêntico à Screenshot ---');

  const sessionGroupId = 'group-session';
  const inicioGroupId = 'group-inicio-normal';
  const escolhaGroupId = 'group-escolha-opcao';
  const fechadoGroupId = 'group-fechado';
  const atendenteGroupId = 'group-1-atendente';
  const horarioGroupId = 'group-5-horario';
  const enderecoGroupId = 'group-4-endereco';
  const cardapio1GroupId = 'group-cardapio-1';
  const cardapio2GroupId = 'group-cardapio-2';

  const menuBlockId = 'block-menu-options';
  const sessionBlockId = 'block-session-conditions';

  const nodes = [
    // 1. Grupo Sessão (Condicionais de Menu no Topo)
    {
      id: sessionGroupId,
      type: 'typebot_group',
      position: { x: 80, y: 50 },
      data: {
        id: sessionGroupId,
        label: 'Sessão',
        blocks: [
          {
            id: sessionBlockId,
            flowType: 'condition',
            label: 'Roteamento Menu',
            conditions: [
              { label: 'st NumeroMenu - 1', value: '1' },
              { label: 'st NumeroMenu - 2', value: '2' },
              { label: 'st NumeroMenu - 3', value: '3' },
              { label: 'st NumeroMenu - 4', value: '4' },
              { label: 'st NumeroMenu - 5', value: '5' }
            ]
          }
        ]
      }
    },

    // 2. Grupo Início Normal
    {
      id: inicioGroupId,
      type: 'typebot_group',
      position: { x: 80, y: 350 },
      data: {
        id: inicioGroupId,
        label: 'Início Normal',
        blocks: [
          {
            id: 'msg-inicio',
            flowType: 'send_message',
            label: 'Boas-Vindas',
            text: 'Olá, {{pushName}}! {{saudacao}}!\nSeja bem vindo ao {{NomeEmpresa}}\n\nAbaixo o cardápio:\n👉 {{cardapio}}'
          },
          {
            id: menuBlockId,
            flowType: 'buttons',
            label: 'Menu de Opções',
            text: 'INFORMAÇÕES:\nEscolha uma opção ⬇️\n\nDigite só o número:',
            options: [
              '1 - Fazer pedido 🛵',
              '2 - Ver cardápio - Fotos reais das nossas pizzas! 🍕',
              '3 - Localização 📍',
              '4 - Horário de Funcionamento ⏰',
              '5 - Falar com atendente 👤'
            ],
            var_name: 'NumeroMenu'
          },
          {
            id: 'jump-inicio',
            flowType: 'jump',
            label: 'Retorno Menu',
            target_group_name: 'Menu',
            target_group_id: inicioGroupId
          }
        ]
      }
    },

    // 3. Grupo Escolha uma opção (Fallback / Erro)
    {
      id: escolhaGroupId,
      type: 'typebot_group',
      position: { x: 480, y: 260 },
      data: {
        id: escolhaGroupId,
        label: 'Escolha uma opção',
        blocks: [
          {
            id: 'msg-escolha-err',
            flowType: 'send_message',
            label: 'Mensagem de Ajuda',
            text: 'Desculpe, não consegui entender!\nDigite uma opção (somente o número):'
          },
          {
            id: 'btn-escolha-fallback',
            flowType: 'buttons',
            label: 'Reexibir Menu',
            text: 'Escolha uma das opções abaixo:',
            options: [
              '1 - Fazer pedido 🛵',
              '2 - Ver cardápio - Fotos reais das nossas pizzas! 🍕',
              '3 - Localização 📍',
              '4 - Horário de Funcionamento ⏰',
              '5 - Falar com atendente 👤'
            ],
            var_name: 'NumeroMenu'
          },
          {
            id: 'jump-escolha',
            flowType: 'jump',
            label: 'Retorno Menu',
            target_group_name: 'Menu',
            target_group_id: inicioGroupId
          }
        ]
      }
    },

    // 4. Grupo Fechado
    {
      id: fechadoGroupId,
      type: 'typebot_group',
      position: { x: 480, y: 720 },
      data: {
        id: fechadoGroupId,
        label: 'Fechado',
        blocks: [
          {
            id: 'msg-fechado',
            flowType: 'send_message',
            label: 'Aviso de Fora do Expediente',
            text: 'Olá, {{pushName}}! {{saudacao}}!\nSeja bem vindo ao {{NomeEmpresa}}\n\nDesculpe, mas neste momento estamos fechados!\n\n⏰ Horário de Atendimento:\n{{DiaFuncionamento}} {{HoraFuncionamento}}\n\nAdoramos ver nossos clientes e estamos sempre prontos para oferecer uma experiência gastronômica incrível!\nEsperamos vê-lo em breve!'
          },
          {
            id: 'jump-fechado',
            flowType: 'jump',
            label: 'Retorno Menu',
            target_group_name: 'Menu',
            target_group_id: inicioGroupId
          }
        ]
      }
    },

    // 5. Grupo 1 - Falar com Atendente
    {
      id: atendenteGroupId,
      type: 'typebot_group',
      position: { x: 880, y: 220 },
      data: {
        id: atendenteGroupId,
        label: '1 - Falar com Atendente',
        blocks: [
          {
            id: 'webhook-atendente',
            flowType: 'webhook',
            label: 'Notificar Balcão',
            url: 'https://api.patoxp.com.br/message'
          },
          {
            id: 'msg-atendente',
            flowType: 'send_message',
            label: 'Cardápio Alternativo',
            text: '👤 Um de nossos atendentes humanos entrará em contato aqui em instantes!\n\nOu para ver nosso cardápio:\nClique Aqui... 👇👇👇\n👉 {{cardapio}}'
          },
          {
            id: 'jump-atendente',
            flowType: 'jump',
            label: 'Retorno Menu',
            target_group_name: 'Menu',
            target_group_id: inicioGroupId
          }
        ]
      }
    },

    // 6. Grupo 5 - Horário de Atendimento
    {
      id: horarioGroupId,
      type: 'typebot_group',
      position: { x: 1280, y: 190 },
      data: {
        id: horarioGroupId,
        label: '5 - Horario de Atendimento',
        blocks: [
          {
            id: 'msg-horario-info',
            flowType: 'send_message',
            label: 'Horário de Funcionamento',
            text: '⏰ Horário de Atendimento:\n{{DiaFuncionamento}}\n{{HoraFuncionamento}}\n\nAdoramos ver nossos clientes e estamos sempre prontos para oferecer uma experiência gastronômica incrível!\nEsperamos vê-lo em breve!\n\nOu para ver nosso cardápio:\nClique Aqui... 👇👇👇\n👉 {{cardapio}}'
          },
          {
            id: 'jump-horario',
            flowType: 'jump',
            label: 'Retorno Menu',
            target_group_name: 'Menu',
            target_group_id: inicioGroupId
          }
        ]
      }
    },

    // 7. Grupo 4 - Endereço
    {
      id: enderecoGroupId,
      type: 'typebot_group',
      position: { x: 1680, y: 150 },
      data: {
        id: enderecoGroupId,
        label: '4 - Endereço',
        blocks: [
          {
            id: 'msg-endereco-info',
            flowType: 'send_message',
            label: 'Localização e Mapa',
            text: '📍 Neste link você pode abrir no GoogleMaps:\nClique Aqui... 👇👇👇\n👉 {{GoogleMaps}}\n\nEndereço:\n{{EnderecoEmpresa}}\n\nOu para ver nosso cardápio:\nClique Aqui... 👇👇👇\n👉 {{cardapio}}'
          },
          {
            id: 'jump-endereco',
            flowType: 'jump',
            label: 'Retorno Menu',
            target_group_name: 'Menu',
            target_group_id: inicioGroupId
          }
        ]
      }
    },

    // 8. Grupo 1-2 - Acesso ao cardápio (1)
    {
      id: cardapio1GroupId,
      type: 'typebot_group',
      position: { x: 2080, y: 110 },
      data: {
        id: cardapio1GroupId,
        label: '1-2 - Acesso ao cardápio (1)',
        blocks: [
          {
            id: 'msg-cardapio-1',
            flowType: 'send_message',
            label: 'Link Cardápio & Fotos',
            text: '🍕 Clique abaixo e faça seu pedido:\n\nClique Aqui... 👇👇👇\n👉 {{cardapio}}\n\nTemos fotos reais de todas as nossas pizzas e combos!'
          },
          {
            id: 'jump-cardapio-1',
            flowType: 'jump',
            label: 'Retorno Menu',
            target_group_name: 'Menu',
            target_group_id: inicioGroupId
          }
        ]
      }
    },

    // 9. Grupo 1-2 - Acesso ao cardápio
    {
      id: cardapio2GroupId,
      type: 'typebot_group',
      position: { x: 2480, y: 80 },
      data: {
        id: cardapio2GroupId,
        label: '1-2 - Acesso ao cardápio',
        blocks: [
          {
            id: 'msg-cardapio-2',
            flowType: 'send_message',
            label: 'Fazer Pedido Online',
            text: '🛵 Clique abaixo e faça seu pedido:\n\nClique Aqui... 👇👇👇\n👉 {{cardapio}}'
          },
          {
            id: 'jump-cardapio-2',
            flowType: 'jump',
            label: 'Retorno Menu',
            target_group_name: 'Menu',
            target_group_id: inicioGroupId
          }
        ]
      }
    }
  ];

  const edges = [
    // Conexões da Sessão (Condicionais st NumeroMenu 1 a 5)
    {
      id: 'edge-cond-1',
      source: sessionGroupId,
      target: cardapio2GroupId,
      sourceHandle: `${sessionBlockId}-cond-0`,
      targetHandle: `${cardapio2GroupId}-in`,
      label: 'st NumeroMenu - 1 (Fazer Pedido)',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2 }
    },
    {
      id: 'edge-cond-2',
      source: sessionGroupId,
      target: cardapio1GroupId,
      sourceHandle: `${sessionBlockId}-cond-1`,
      targetHandle: `${cardapio1GroupId}-in`,
      label: 'st NumeroMenu - 2 (Ver Cardápio)',
      animated: true,
      style: { stroke: '#10b981', strokeWidth: 2 }
    },
    {
      id: 'edge-cond-3',
      source: sessionGroupId,
      target: enderecoGroupId,
      sourceHandle: `${sessionBlockId}-cond-2`,
      targetHandle: `${enderecoGroupId}-in`,
      label: 'st NumeroMenu - 3 (Localização)',
      animated: true,
      style: { stroke: '#f59e0b', strokeWidth: 2 }
    },
    {
      id: 'edge-cond-4',
      source: sessionGroupId,
      target: horarioGroupId,
      sourceHandle: `${sessionBlockId}-cond-3`,
      targetHandle: `${horarioGroupId}-in`,
      label: 'st NumeroMenu - 4 (Horário)',
      animated: true,
      style: { stroke: '#ec4899', strokeWidth: 2 }
    },
    {
      id: 'edge-cond-5',
      source: sessionGroupId,
      target: atendenteGroupId,
      sourceHandle: `${sessionBlockId}-cond-4`,
      targetHandle: `${atendenteGroupId}-in`,
      label: 'st NumeroMenu - 5 (Atendente)',
      animated: true,
      style: { stroke: '#8b5cf6', strokeWidth: 2 }
    },

    // Conexão do Início Normal para a Sessão
    {
      id: 'edge-inicio-sessao',
      source: inicioGroupId,
      target: sessionGroupId,
      sourceHandle: menuBlockId,
      targetHandle: `${sessionGroupId}-in`,
      label: 'Avaliar Opção',
      animated: true,
      style: { stroke: '#6366f1', strokeWidth: 2.5 }
    }
  ];

  // 1. Verifica se já existe o fluxo oficial
  const { data: existingFlows } = await supabase
    .from('flows')
    .select('id, name, active_version_id')
    .eq('tenant_id', TENANT_ID)
    .ilike('name', '%Hbi Pizza%');

  let flowId = existingFlows && existingFlows.length > 0 ? existingFlows[0].id : null;

  if (!flowId) {
    const { data: newFlow, error: fErr } = await supabase
      .from('flows')
      .insert({
        tenant_id: TENANT_ID,
        name: 'Hbi Pizza (Modelo Oficial)',
        trigger_rules: [
          { type: 'EXACT', value: 'cardapio' },
          { type: 'EXACT', value: 'menu' },
          { type: 'EXACT', value: 'oi' },
          { type: 'EXACT', value: 'ola' },
          { type: 'ALL', value: '*' }
        ]
      })
      .select()
      .single();

    if (fErr || !newFlow) {
      console.error('Erro ao criar flow:', fErr);
      return;
    }
    flowId = newFlow.id;
  }

  // 2. Insere a versão atualizada
  const { data: newVersion, error: vErr } = await supabase
    .from('flow_versions')
    .insert({
      flow_id: flowId,
      status: 'PUBLISHED',
      nodes,
      edges
    })
    .select()
    .single();

  if (vErr || !newVersion) {
    console.error('Erro ao inserir flow_version:', vErr);
    return;
  }

  // 3. Atualiza o active_version_id no flow
  await supabase
    .from('flows')
    .update({ 
      name: 'Hbi Pizza (Modelo Oficial)',
      active_version_id: newVersion.id 
    })
    .eq('id', flowId);

  console.log(`✅ Fluxo Hbi Pizza Sincronizado com Sucesso! Flow ID: ${flowId}, Version ID: ${newVersion.id}`);
  return { flowId, versionId: newVersion.id };
}

if (process.argv[1]?.endsWith('sync_hbi_photo_flow.mjs')) {
  createOrUpdateHbiFlow().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
