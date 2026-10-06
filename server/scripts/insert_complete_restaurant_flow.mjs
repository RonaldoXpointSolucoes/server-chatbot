import { supabase } from '../src/supabase.js';
import { v4 as uuidv4 } from 'uuid';

const TENANT_ID = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

async function run() {
  console.log('--- Publicando Modelo Completo Restaurante FoodNext (6 em 1) ---');

  const startGroupId = `group-start-${uuidv4().substring(0, 6)}`;
  const menuBlockId = `block-menu-${uuidv4().substring(0, 6)}`;

  const cardapioGroupId = `group-cardapio-${uuidv4().substring(0, 6)}`;
  const deliveryGroupId = `group-delivery-${uuidv4().substring(0, 6)}`;
  const retiradaGroupId = `group-retirada-${uuidv4().substring(0, 6)}`;
  const enderecoGroupId = `group-endereco-${uuidv4().substring(0, 6)}`;
  const statusGroupId = `group-status-${uuidv4().substring(0, 6)}`;
  const promoGroupId = `group-promo-${uuidv4().substring(0, 6)}`;
  const atendenteGroupId = `group-atendente-${uuidv4().substring(0, 6)}`;

  const restaurantNodes = [
    // 1. Grupo Inicial (Boas-Vindas chamando por nome & Menu de 7 opções)
    {
      id: startGroupId,
      type: 'typebot_group',
      position: { x: 450, y: 50 },
      data: {
        id: startGroupId,
        label: 'Início - Boas-Vindas & Menu Principal',
        blocks: [
          {
            id: `msg-welcome-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Boas-Vindas',
            text: 'Olá, {{pushName}}! Seja muito bem-vindo(a) ao FoodNext Restaurante & Burgueria! 🍔🍕🥤\nÉ um prazer imenso ter você por aqui.'
          },
          {
            id: menuBlockId,
            flowType: 'buttons',
            label: 'Menu Principal',
            text: 'Como podemos te ajudar hoje? Digite o número da opção desejada:',
            options: [
              '1 - 🍕 Cardápio Digital & Fotos',
              '2 - 🛵 Fazer Pedido para Entrega (Delivery)',
              '3 - 🛍️ Retirada no Balcão (Takeaway)',
              '4 - 📍 Endereço & Horário de Funcionamento',
              '5 - 🔎 Acompanhar Meu Pedido',
              '6 - 🎁 Promoção & Cupom do Dia',
              '7 - 🤝 Falar com Atendente Humano'
            ],
            var_name: 'opcao_menu'
          }
        ]
      }
    },
    // 2. Opção 1: Cardápio Digital
    {
      id: cardapioGroupId,
      type: 'typebot_group',
      position: { x: 50, y: 380 },
      data: {
        id: cardapioGroupId,
        label: '1 - Cardápio Digital',
        blocks: [
          {
            id: `msg-cardapio-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Apresentação do Cardápio',
            text: '🍕 *Cardápio Completo & Fotos dos Pratos*\n\nAcesse nosso cardápio online com fotos em alta resolução, descrições e preços atualizados:\n👉 https://foodnext.com.br/cardapio\n\n🍔 *Destaques de Hoje:*\n- *Monster Burger Artesanal* (2 blend 160g, cheddar duplo, bacon crocante no pão brioche);\n- *Pizza Especial 4 Queijos Trufada*;\n- *Porção de Batata Rústica com Costela Desfiada*;\n- *Bebidas Geladas e Sobremesas Artesanais*!'
          },
          {
            id: `msg-cardapio-dica-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Dica de Pedido',
            text: 'Quando escolher seus pratos, basta digitar *2* para pedir entrega ou *3* para retirar no balcão! 🛵'
          }
        ]
      }
    },
    // 3. Opção 2: Fazer Pedido para Entrega (Delivery)
    {
      id: deliveryGroupId,
      type: 'typebot_group',
      position: { x: 380, y: 380 },
      data: {
        id: deliveryGroupId,
        label: '2 - Pedido Delivery',
        blocks: [
          {
            id: `msg-deliv-init-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Início Delivery',
            text: '🛵 *Pedido para Entrega (Delivery)*\nÓtimo, {{pushName}}! Vamos registrar seu pedido agora mesmo.'
          },
          {
            id: `ask-itens-${uuidv4().substring(0, 6)}`,
            flowType: 'ask',
            label: 'Itens do Pedido',
            text: 'Quais itens e bebidas você gostaria de pedir? (Pode digitar a quantidade e os nomes dos pratos):',
            var_name: 'itens_pedido'
          },
          {
            id: `ask-end-${uuidv4().substring(0, 6)}`,
            flowType: 'ask',
            label: 'Endereço de Entrega',
            text: 'Excelente escolha, {{pushName}}! Agora, por favor, digite o seu endereço completo com Rua, Número, Bairro e Ponto de Referência:',
            var_name: 'endereco_entrega'
          },
          {
            id: `ask-pagto-${uuidv4().substring(0, 6)}`,
            flowType: 'ask',
            label: 'Forma de Pagamento',
            text: 'Qual será a forma de pagamento na entrega? (Pix, Cartão de Crédito/Débito ou Dinheiro com Troco):',
            var_name: 'forma_pagamento'
          },
          {
            id: `msg-confirm-deliv-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Resumo e Confirmação',
            text: '✅ *Pedido Confirmado com Sucesso, {{pushName}}!*\n\n📋 *Resumo do Pedido:*\n- *Cliente:* {{pushName}}\n- *Itens:* {{itens_pedido}}\n- *Endereço de Entrega:* {{endereco_entrega}}\n- *Pagamento:* {{forma_pagamento}}\n\n👨‍🍳 Nossa cozinha já iniciou o preparo com muito carinho! Previsão: *35 a 45 minutos*. Te avisaremos assim que o motoboy sair!'
          }
        ]
      }
    },
    // 4. Opção 3: Retirada no Balcão
    {
      id: retiradaGroupId,
      type: 'typebot_group',
      position: { x: 720, y: 380 },
      data: {
        id: retiradaGroupId,
        label: '3 - Retirada no Balcão',
        blocks: [
          {
            id: `msg-ret-init-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Início Retirada',
            text: '🛍️ *Retirada no Balcão (Takeaway)*\nPerfeito, {{pushName}}! Os pedidos para retirada ficam prontos em cerca de 20 minutos e você ganha 10% de desconto!'
          },
          {
            id: `ask-itens-ret-${uuidv4().substring(0, 6)}`,
            flowType: 'ask',
            label: 'Itens Retirada',
            text: 'Quais itens você deseja pedir para retirar?',
            var_name: 'itens_retirada'
          },
          {
            id: `ask-nome-ret-${uuidv4().substring(0, 6)}`,
            flowType: 'ask',
            label: 'Nome para Retirada',
            text: 'Qual o nome de quem irá retirar no balcão?',
            var_name: 'nome_retirada'
          },
          {
            id: `msg-confirm-ret-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Confirmação Retirada',
            text: '✅ *Pedido para Retirada Confirmado!*\n\n- *Responsável:* {{nome_retirada}}\n- *Itens:* {{itens_retirada}}\n- *Previsão de prontidão:* 20 a 25 minutos.\n\n📍 *Local de Retirada:* FoodNext Balcão - Av. Paulista, 1500 - Bela Vista, São Paulo - SP.'
          }
        ]
      }
    },
    // 5. Opção 4: Endereço & Horários
    {
      id: enderecoGroupId,
      type: 'typebot_group',
      position: { x: 1060, y: 380 },
      data: {
        id: enderecoGroupId,
        label: '4 - Endereço & Horários',
        blocks: [
          {
            id: `msg-end-info-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Informações de Localização',
            text: '📍 *Endereço & Horário de Funcionamento*\n\n🏢 *FoodNext Restaurante & Burgueria*\n- *Endereço:* Av. Paulista, 1500 - Bela Vista, São Paulo - SP\n- *Ponto de Referência:* Em frente ao Shopping Cidade São Paulo, a 100m da Estação Trianon-Masp.\n\n🕒 *Horários de Atendimento:*\n- *Terça a Sexta:* 11h30 às 15h00 (Almoço) | 18h30 às 23h30 (Jantar & Delivery)\n- *Sábados e Domingos:* 12h00 às 23h45 (Direto sem intervalo)\n- *Segunda-feira:* Fechado para manutenção interna.\n\n🚗 Estacionamento gratuito conveniado com manobrista no local!'
          }
        ]
      }
    },
    // 6. Opção 5: Acompanhar Pedido
    {
      id: statusGroupId,
      type: 'typebot_group',
      position: { x: 50, y: 780 },
      data: {
        id: statusGroupId,
        label: '5 - Status do Pedido',
        blocks: [
          {
            id: `ask-num-${uuidv4().substring(0, 6)}`,
            flowType: 'ask',
            label: 'Identificação do Pedido',
            text: '🔎 *Acompanhamento de Status do Pedido*\nPor favor, digite o número do seu pedido (ex: #4582) ou os 4 últimos dígitos do seu telefone:',
            var_name: 'numero_pedido'
          },
          {
            id: `msg-status-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Status Atual',
            text: '🔎 *Pedido {{numero_pedido}} de {{pushName}} localizado!*\n\n🔥 *Status Atual:* No forno / Em finalização na cozinha e sendo embalado termicamente.\n🛵 *Entregador:* Motoboy já convocado e aguardando a saída.\n⏱️ *Tempo estimado:* 15 a 25 minutos para entrega no seu endereço!'
          }
        ]
      }
    },
    // 7. Opção 6: Promoção & Cupom
    {
      id: promoGroupId,
      type: 'typebot_group',
      position: { x: 420, y: 780 },
      data: {
        id: promoGroupId,
        label: '6 - Promoções & Cupons',
        blocks: [
          {
            id: `msg-promo-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Cupons do Dia',
            text: '🎁 *Promoções & Cupons do Dia para você, {{pushName}}!*\n\n🎉 Aproveite nossos cupons e ofertas ativas hoje:\n\n1️⃣ Cupom *FOODNEXT15* — 15% OFF em pedidos de delivery acima de R$ 60,00!\n2️⃣ Na compra de qualquer Pizza Grande, o refrigerante 2L sai de GRAÇA!\n3️⃣ Burgers em dobro toda terça e quarta-feira!\n\nPara aproveitar agora, basta digitar *2* e fazer seu pedido de entrega!'
          }
        ]
      }
    },
    // 8. Opção 7: Atendente Humano
    {
      id: atendenteGroupId,
      type: 'typebot_group',
      position: { x: 800, y: 780 },
      data: {
        id: atendenteGroupId,
        label: '7 - Falar com Atendente',
        blocks: [
          {
            id: `msg-transfer-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Aviso de Transferência',
            text: '🤝 *Atendimento Humano*\nEntendido, {{pushName}}! Já estamos transferindo seu atendimento para a nossa equipe no balcão.'
          },
          {
            id: `handoff-node-${uuidv4().substring(0, 6)}`,
            flowType: 'handoff',
            label: 'Transferência Humana'
          },
          {
            id: `msg-wait-${uuidv4().substring(0, 6)}`,
            flowType: 'send_message',
            label: 'Aguardar Operador',
            text: 'Um de nossos atendentes entrará em contato aqui nesta conversa em instantes. Por favor, aguarde só um momento! ⏱️'
          }
        ]
      }
    }
  ];

  const restaurantEdges = [
    {
      id: `edge-1-${uuidv4().substring(0, 6)}`,
      type: 'smoothstep',
      source: startGroupId,
      target: cardapioGroupId,
      sourceHandle: menuBlockId,
      label: '1 - Cardápio Digital',
      animated: true,
      style: { stroke: '#10b981', strokeWidth: 3 }
    },
    {
      id: `edge-2-${uuidv4().substring(0, 6)}`,
      type: 'smoothstep',
      source: startGroupId,
      target: deliveryGroupId,
      sourceHandle: menuBlockId,
      label: '2 - Pedido Delivery',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 3 }
    },
    {
      id: `edge-3-${uuidv4().substring(0, 6)}`,
      type: 'smoothstep',
      source: startGroupId,
      target: retiradaGroupId,
      sourceHandle: menuBlockId,
      label: '3 - Retirada Balcão',
      animated: true,
      style: { stroke: '#8b5cf6', strokeWidth: 3 }
    },
    {
      id: `edge-4-${uuidv4().substring(0, 6)}`,
      type: 'smoothstep',
      source: startGroupId,
      target: enderecoGroupId,
      sourceHandle: menuBlockId,
      label: '4 - Endereço & Horários',
      animated: true,
      style: { stroke: '#06b6d4', strokeWidth: 3 }
    },
    {
      id: `edge-5-${uuidv4().substring(0, 6)}`,
      type: 'smoothstep',
      source: startGroupId,
      target: statusGroupId,
      sourceHandle: menuBlockId,
      label: '5 - Status do Pedido',
      animated: true,
      style: { stroke: '#eab308', strokeWidth: 3 }
    },
    {
      id: `edge-6-${uuidv4().substring(0, 6)}`,
      type: 'smoothstep',
      source: startGroupId,
      target: promoGroupId,
      sourceHandle: menuBlockId,
      label: '6 - Promoções & Cupons',
      animated: true,
      style: { stroke: '#ec4899', strokeWidth: 3 }
    },
    {
      id: `edge-7-${uuidv4().substring(0, 6)}`,
      type: 'smoothstep',
      source: startGroupId,
      target: atendenteGroupId,
      sourceHandle: menuBlockId,
      label: '7 - Falar com Atendente',
      animated: true,
      style: { stroke: '#f97316', strokeWidth: 3 }
    }
  ];

  // Inserir o Flow no Supabase
  const { data: newFlow, error: fErr } = await supabase
    .from('flows')
    .insert({
      tenant_id: TENANT_ID,
      name: 'Restaurante FoodNext - Autoatendimento Completo (6 em 1)',
      trigger_rules: [
        { type: 'EXACT', value: 'oi' },
        { type: 'EXACT', value: 'olá' },
        { type: 'EXACT', value: 'ola' },
        { type: 'EXACT', value: 'menu' },
        { type: 'EXACT', value: 'cardapio' },
        { type: 'EXACT', value: 'cardápio' },
        { type: 'EXACT', value: 'pedido' },
        { type: 'EXACT', value: 'restaurante' },
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
      nodes: restaurantNodes,
      edges: restaurantEdges
    })
    .select()
    .single();

  if (vErr || !version) {
    console.error('Erro ao criar version:', vErr);
    return;
  }

  await supabase
    .from('flows')
    .update({ active_version_id: version.id })
    .eq('id', newFlow.id);

  console.log(`✅ Fluxo Completo Criado com Sucesso!`);
  console.log(`Flow ID: ${newFlow.id}`);
  console.log(`Version ID: ${version.id}`);
}

run();
