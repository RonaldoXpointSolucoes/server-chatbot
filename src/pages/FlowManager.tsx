import { useChatStore } from '../store/chatStore';
import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { 
  Plus, 
  ArrowLeft, 
  Bot, 
  Trash2, 
  Edit, 
  FolderPlus, 
  MoreHorizontal, 
  MessageSquare, 
  GripVertical, 
  Settings, 
  Copy, 
  UtensilsCrossed, 
  Check, 
  Sparkles,
  ExternalLink,
  Play,
  Pause
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

export default function FlowManager() {
  const navigate = useNavigate();
  const tenant_id = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (tenant_id) fetchFlows();
  }, [tenant_id]);

  // Fecha dropdown de ações ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const fetchFlows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('flows')
      .select('*, flow_versions!fk_active_version(id, status)')
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false });

    if (!error && data) setFlows(data);
    setLoading(false);
  };

  const handleCreateFlow = async () => {
    if (!tenant_id) return;
    setIsCreating(true);

    try {
      const { data: newFlow, error } = await supabase
        .from('flows')
        .insert({
          tenant_id: tenant_id,
          name: 'Novo Fluxo Bot',
          trigger_rules: [{ type: 'EXACT', value: 'oi' }]
        })
        .select()
        .single();

      if (newFlow) {
        await useChatStore.getState().logOperation('INSERT', 'flows', newFlow.id, null, newFlow);
        const { data: version } = await supabase
          .from('flow_versions')
          .insert({
            flow_id: newFlow.id,
            status: 'DRAFT',
            nodes: [{
              id: 'start-1',
              type: 'typebot_group',
              position: { x: 250, y: 50 },
              data: { 
                id: 'start-1',
                label: 'Início do Atendimento',
                blocks: [{
                  id: 'block-welcome',
                  flowType: 'send_message',
                  label: 'Mensagem Inicial',
                  text: 'Olá! Seja bem-vindo(a) ao nosso autoatendimento.'
                }]
              }
            }],
            edges: []
          })
          .select()
          .single();
        
        if (version) {
          await useChatStore.getState().logOperation('INSERT', 'flow_versions', version.id, null, version);
          navigate(`/flows/${newFlow.id}/edit`);
        }
      }
    } catch (err) {
      console.error('Erro ao criar fluxo:', err);
    } finally {
      setIsCreating(false);
    }
  };

  // Clonar / Duplicar Fluxo Completo com Nós e Arestas
  const handleCloneFlow = async (flowId: string) => {
    if (!tenant_id) return;
    setIsCreating(true);

    try {
      const targetFlow = flows.find(f => f.id === flowId);
      if (!targetFlow) return;

      // Busca a versão ativa mais recente
      let versionData = null;
      if (targetFlow.active_version_id) {
        const { data: v } = await supabase
          .from('flow_versions')
          .select('*')
          .eq('id', targetFlow.active_version_id)
          .single();
        versionData = v;
      } else {
        const { data: vList } = await supabase
          .from('flow_versions')
          .select('*')
          .eq('flow_id', flowId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (vList && vList.length > 0) versionData = vList[0];
      }

      // Cria a cópia do Flow
      const { data: clonedFlow, error: flowErr } = await supabase
        .from('flows')
        .insert({
          tenant_id: tenant_id,
          name: `${targetFlow.name} (Clone)`,
          trigger_rules: targetFlow.trigger_rules || [{ type: 'EXACT', value: 'menu' }]
        })
        .select()
        .single();

      if (flowErr || !clonedFlow) throw flowErr;

      // Cria a versão clonada
      const { data: clonedVersion, error: verErr } = await supabase
        .from('flow_versions')
        .insert({
          flow_id: clonedFlow.id,
          status: 'PUBLISHED',
          nodes: versionData?.nodes || [],
          edges: versionData?.edges || []
        })
        .select()
        .single();

      if (clonedVersion) {
        await supabase
          .from('flows')
          .update({ active_version_id: clonedVersion.id })
          .eq('id', clonedFlow.id);
      }

      await fetchFlows();
      alert(`Fluxo "${targetFlow.name}" clonado com sucesso!`);
    } catch (err) {
      console.error('Erro ao clonar fluxo:', err);
      alert('Falha ao clonar o fluxo.');
    } finally {
      setIsCreating(false);
    }
  };

  // Alternar Status Ativo / Pausado
  const handleToggleFlowActive = async (flow: any) => {
    try {
      const isCurrentlyActive = Boolean(flow.active_version_id);
      let newActiveVersionId: string | null = null;

      if (!isCurrentlyActive) {
        // Validação de Governança: Se houver robôs de IA ativos e o fluxo tiver gatilho amplo
        try {
          const { data: activeBots } = await supabase
            .from('bots')
            .select('id, name')
            .eq('tenant_id', tenant_id)
            .eq('status', 'active');

          if (activeBots && activeBots.length > 0) {
            const hasAllTrigger = Array.isArray(flow.trigger_rules) && flow.trigger_rules.some((r: any) => r.type === 'ALL');
            const alertMsg = hasAllTrigger
              ? `Atenção: A empresa possui ${activeBots.length} Robô(s) com I.A. ativo(s).\n\nComo este fluxo possui gatilho "Qualquer Mensagem", ele responderá no WhatsApp no lugar da I.A.\n\nDeseja realmente ativar este fluxo em produção?`
              : `Atenção: A empresa possui ${activeBots.length} Robô(s) com I.A. ativo(s).\n\nDeseja ativar este fluxo para responder aos gatilhos configurados?`;

            if (!window.confirm(alertMsg)) {
              return;
            }
          }
        } catch (botErr) {
          console.warn('[FlowManager] Falha ao verificar bots:', botErr);
        }

        // Ativar: busca a versão mais recente
        const { data: versions } = await supabase
          .from('flow_versions')
          .select('id')
          .eq('flow_id', flow.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (versions && versions.length > 0) {
          newActiveVersionId = versions[0].id;
        } else {
          // Cria versão inicial se não houver
          const { data: newVer } = await supabase
            .from('flow_versions')
            .insert({
              flow_id: flow.id,
              status: 'PUBLISHED',
              nodes: [],
              edges: []
            })
            .select('id')
            .single();
          if (newVer) newActiveVersionId = newVer.id;
        }
      }

      const { error: updErr } = await supabase
        .from('flows')
        .update({ 
          active_version_id: newActiveVersionId,
          updated_at: new Date().toISOString()
        })
        .eq('id', flow.id);

      if (updErr) throw updErr;

      setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, active_version_id: newActiveVersionId } : f));
      
      window.dispatchEvent(new CustomEvent('toast', { 
        detail: { 
          message: newActiveVersionId ? 'Fluxo ativado em produção!' : 'Fluxo pausado com sucesso!', 
          type: 'success' 
        } 
      }));
    } catch (err: any) {
      console.error('[FlowManager] Erro ao alternar status do fluxo:', err);
      alert('Erro ao alterar status do fluxo: ' + (err.message || String(err)));
    }
  };

  // Criação do Modelo Completo de Restaurante com os 6+ Fluxos Integrados
  const handleCreateRestaurantTemplate = async () => {
    if (!tenant_id) return;
    if (!window.confirm("Deseja criar o modelo 'Restaurante FoodNext - Autoatendimento Completo (6 em 1)'?")) return;

    setIsCreating(true);
    try {
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
                text: '🍕 *Cardápio Completo & Fotos dos Pratos*\n\nAcesse nosso cardápio online com fotos em alta resolução, descrições e preços atualizados:\n👉 https://foodnext.com.br/cardapio\n\n🍔 *Destaques de Hoje:*\n- *Monster Burger Artesanal* (2 blend 160g, cheddar duplo, bacon crocante);\n- *Pizza Especial 4 Queijos Trufada*;\n- *Porção de Batata Rústica com Costela Desfiada*;\n- *Bebidas Geladas e Sobremesas*!'
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
                text: '🤝 *Atendimento Humano*\nEntendido, {{pushName}}! Já estamos notificando nossa equipe no balcão para falar diretamente com você.'
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
                text: 'Um de nossos atendentes responderá nesta conversa em instantes. Por favor, aguarde só um momento! ⏱️'
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

      // Inserir o Flow de Restaurante Completo no Supabase
      const { data: newFlow, error: fErr } = await supabase
        .from('flows')
        .insert({
          tenant_id: tenant_id,
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

      if (fErr || !newFlow) throw fErr;

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

      if (vErr || !version) throw vErr;

      await supabase
        .from('flows')
        .update({ active_version_id: version.id })
        .eq('id', newFlow.id);

      await fetchFlows();
      alert("Modelo 'Restaurante FoodNext - Autoatendimento Completo (6 em 1)' criado com sucesso e publicado!");
    } catch (err) {
      console.error('Erro ao criar modelo de restaurante:', err);
      alert('Falha ao criar o modelo de restaurante.');
    } finally {
      setIsCreating(false);
    }
  };

  // Criação ou abertura do Modelo Hbi Pizza Oficial (idêntico à screenshot)
  const handleCreateHbiPizzaTemplate = async () => {
    if (!tenant_id) return;

    // Se já existir, oferece abrir ou duplicar
    const existing = flows.find(f => f.name?.toLowerCase().includes('hbi pizza'));
    if (existing) {
      const resp = window.confirm(`O fluxo "${existing.name}" já está pronto no sistema!\n\nClique em OK para ABRIR e EDITAR no FlowBuilder, ou CANCELAR para criar uma nova cópia.`);
      if (resp) {
        navigate(`/flows/${existing.id}/edit`);
        return;
      }
    }

    setIsCreating(true);
    try {
      const sessionGroupId = `group-session-${uuidv4().substring(0, 6)}`;
      const inicioGroupId = `group-inicio-${uuidv4().substring(0, 6)}`;
      const escolhaGroupId = `group-escolha-${uuidv4().substring(0, 6)}`;
      const fechadoGroupId = `group-fechado-${uuidv4().substring(0, 6)}`;
      const atendenteGroupId = `group-atendente-${uuidv4().substring(0, 6)}`;
      const horarioGroupId = `group-horario-${uuidv4().substring(0, 6)}`;
      const enderecoGroupId = `group-endereco-${uuidv4().substring(0, 6)}`;
      const cardapio1GroupId = `group-cardapio1-${uuidv4().substring(0, 6)}`;
      const cardapio2GroupId = `group-cardapio2-${uuidv4().substring(0, 6)}`;

      const menuBlockId = `block-menu-${uuidv4().substring(0, 6)}`;
      const sessionBlockId = `block-session-${uuidv4().substring(0, 6)}`;

      const nodes = [
        // 1. Grupo Sessão (Condicionais no topo)
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
                id: `msg-inicio-${uuidv4().substring(0, 6)}`,
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
                id: `jump-inicio-${uuidv4().substring(0, 6)}`,
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
                id: `msg-escolha-${uuidv4().substring(0, 6)}`,
                flowType: 'send_message',
                label: 'Mensagem de Ajuda',
                text: 'Desculpe, não consegui entender!\nDigite uma opção (somente o número):'
              },
              {
                id: `btn-escolha-${uuidv4().substring(0, 6)}`,
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
                id: `jump-escolha-${uuidv4().substring(0, 6)}`,
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
                id: `msg-fechado-${uuidv4().substring(0, 6)}`,
                flowType: 'send_message',
                label: 'Fora do Expediente',
                text: 'Olá, {{pushName}}! {{saudacao}}!\nSeja bem vindo ao {{NomeEmpresa}}\n\nDesculpe, mas neste momento estamos fechados!\n\n⏰ Horário de Atendimento:\n{{DiaFuncionamento}} {{HoraFuncionamento}}\n\nAdoramos ver nossos clientes e estamos sempre prontos para oferecer uma experiência gastronômica incrível!\nEsperamos vê-lo em breve!'
              },
              {
                id: `jump-fechado-${uuidv4().substring(0, 6)}`,
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
                id: `webhook-atend-${uuidv4().substring(0, 6)}`,
                flowType: 'webhook',
                label: 'Notificar Balcão',
                url: 'https://api.patoxp.com.br/message'
              },
              {
                id: `msg-atend-${uuidv4().substring(0, 6)}`,
                flowType: 'send_message',
                label: 'Cardápio Alternativo',
                text: '👤 Um de nossos atendentes humanos entrará em contato aqui em instantes!\n\nOu para ver nosso cardápio:\nClique Aqui... 👇👇👇\n👉 {{cardapio}}'
              },
              {
                id: `jump-atend-${uuidv4().substring(0, 6)}`,
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
            label: '5 - Horário de Atendimento',
            blocks: [
              {
                id: `msg-hor-${uuidv4().substring(0, 6)}`,
                flowType: 'send_message',
                label: 'Horário de Funcionamento',
                text: '⏰ Horário de Atendimento:\n{{DiaFuncionamento}}\n{{HoraFuncionamento}}\n\nAdoramos ver nossos clientes e estamos sempre prontos para oferecer uma experiência gastronômica incrível!\nEsperamos vê-lo em breve!\n\nOu para ver nosso cardápio:\nClique Aqui... 👇👇👇\n👉 {{cardapio}}'
              },
              {
                id: `jump-hor-${uuidv4().substring(0, 6)}`,
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
                id: `msg-end-${uuidv4().substring(0, 6)}`,
                flowType: 'send_message',
                label: 'Localização e Mapa',
                text: '📍 Neste link você pode abrir no GoogleMaps:\nClique Aqui... 👇👇👇\n👉 {{GoogleMaps}}\n\nEndereço:\n{{EnderecoEmpresa}}\n\nOu para ver nosso cardápio:\nClique Aqui... 👇👇👇\n👉 {{cardapio}}'
              },
              {
                id: `jump-end-${uuidv4().substring(0, 6)}`,
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
                id: `msg-card1-${uuidv4().substring(0, 6)}`,
                flowType: 'send_message',
                label: 'Cardápio & Fotos Reais',
                text: '🍕 Clique abaixo e faça seu pedido:\n\nClique Aqui... 👇👇👇\n👉 {{cardapio}}\n\nTemos fotos reais de todas as nossas pizzas e combos!'
              },
              {
                id: `jump-card1-${uuidv4().substring(0, 6)}`,
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
                id: `msg-card2-${uuidv4().substring(0, 6)}`,
                flowType: 'send_message',
                label: 'Fazer Pedido',
                text: '🛵 Clique abaixo e faça seu pedido:\n\nClique Aqui... 👇👇👇\n👉 {{cardapio}}'
              },
              {
                id: `jump-card2-${uuidv4().substring(0, 6)}`,
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
        {
          id: `edge-cond-1-${uuidv4().substring(0, 6)}`,
          source: sessionGroupId,
          target: cardapio2GroupId,
          sourceHandle: `${sessionBlockId}-cond-0`,
          targetHandle: `${cardapio2GroupId}-in`,
          label: 'st NumeroMenu - 1 (Fazer Pedido)',
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 2 }
        },
        {
          id: `edge-cond-2-${uuidv4().substring(0, 6)}`,
          source: sessionGroupId,
          target: cardapio1GroupId,
          sourceHandle: `${sessionBlockId}-cond-1`,
          targetHandle: `${cardapio1GroupId}-in`,
          label: 'st NumeroMenu - 2 (Ver Cardápio)',
          animated: true,
          style: { stroke: '#10b981', strokeWidth: 2 }
        },
        {
          id: `edge-cond-3-${uuidv4().substring(0, 6)}`,
          source: sessionGroupId,
          target: enderecoGroupId,
          sourceHandle: `${sessionBlockId}-cond-2`,
          targetHandle: `${enderecoGroupId}-in`,
          label: 'st NumeroMenu - 3 (Localização)',
          animated: true,
          style: { stroke: '#f59e0b', strokeWidth: 2 }
        },
        {
          id: `edge-cond-4-${uuidv4().substring(0, 6)}`,
          source: sessionGroupId,
          target: horarioGroupId,
          sourceHandle: `${sessionBlockId}-cond-3`,
          targetHandle: `${horarioGroupId}-in`,
          label: 'st NumeroMenu - 4 (Horário)',
          animated: true,
          style: { stroke: '#ec4899', strokeWidth: 2 }
        },
        {
          id: `edge-cond-5-${uuidv4().substring(0, 6)}`,
          source: sessionGroupId,
          target: atendenteGroupId,
          sourceHandle: `${sessionBlockId}-cond-4`,
          targetHandle: `${atendenteGroupId}-in`,
          label: 'st NumeroMenu - 5 (Atendente)',
          animated: true,
          style: { stroke: '#8b5cf6', strokeWidth: 2 }
        },
        {
          id: `edge-inicio-sessao-${uuidv4().substring(0, 6)}`,
          source: inicioGroupId,
          target: sessionGroupId,
          sourceHandle: menuBlockId,
          targetHandle: `${sessionGroupId}-in`,
          label: 'Avaliar Opção',
          animated: true,
          style: { stroke: '#6366f1', strokeWidth: 2.5 }
        }
      ];

      const { data: newFlow, error: fErr } = await supabase
        .from('flows')
        .insert({
          tenant_id: tenant_id,
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

      if (fErr || !newFlow) throw fErr;

      const { data: version, error: vErr } = await supabase
        .from('flow_versions')
        .insert({
          flow_id: newFlow.id,
          status: 'PUBLISHED',
          nodes,
          edges
        })
        .select()
        .single();

      if (vErr || !version) throw vErr;

      await supabase
        .from('flows')
        .update({ active_version_id: version.id })
        .eq('id', newFlow.id);

      await fetchFlows();
      navigate(`/flows/${newFlow.id}/edit`);
    } catch (err) {
      console.error('Erro ao instanciar modelo Hbi Pizza:', err);
      alert('Falha ao criar modelo Hbi Pizza.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Certeza que deseja deletar este fluxo?")) return;
    const flowBefore = flows.find(f => f.id === id);

    try {
      // 1. Desvincular active_version_id
      await supabase.from('flows').update({ active_version_id: null }).eq('id', id);

      // 2. Buscar versões do fluxo
      const { data: versions } = await supabase.from('flow_versions').select('id').eq('flow_id', id);
      const versionIds = (versions || []).map(v => v.id);

      // 3. Limpar conversation_states e flow_versions
      if (versionIds.length > 0) {
        await supabase.from('conversation_states').delete().in('flow_version_id', versionIds);
        await supabase.from('flow_versions').delete().eq('flow_id', id);
      }

      // 4. Deletar registro do fluxo
      const { error: delErr } = await supabase.from('flows').delete().eq('id', id);
      if (delErr) throw delErr;

      await useChatStore.getState().logOperation('DELETE', 'flows', id, flowBefore || null, null);
      setFlows(flows.filter(f => f.id !== id));
      window.dispatchEvent(new CustomEvent('toast', { 
        detail: { message: 'Fluxo excluído com sucesso!', type: 'success' } 
      }));
    } catch (err: any) {
      console.error('Erro ao excluir fluxo:', err);
      alert('Erro ao excluir fluxo: ' + (err.message || String(err)));
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 text-slate-200">
      <header className="p-6 bg-slate-900/50 border-b border-slate-700/50 backdrop-blur-md flex flex-wrap justify-between items-center z-10 gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/chat')}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
            title="Voltar ao Chat"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-3 bg-indigo-500/10 rounded-xl relative isolate overflow-hidden group">
            <div className="absolute inset-0 bg-indigo-500/20 blur-xl group-hover:bg-indigo-500/30 transition-all duration-500" />
            <Bot className="w-6 h-6 text-indigo-400 relative z-10" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 tracking-tight flex items-center gap-2">
              Flow Builder <span className="text-xs bg-indigo-500/20 text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-500/30">Typebot Engine</span>
            </h1>
            <p className="text-sm text-slate-400">Automatize o atendimento com fluxos conversacionais inteligentes e interativos</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Botão de Criação de Modelo Oficial Hbi Pizza (Foto do Usuário) */}
          <button
            onClick={handleCreateHbiPizzaTemplate}
            disabled={isCreating}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white px-4 py-2.5 rounded-xl shadow-lg shadow-orange-900/20 transition-all font-medium text-sm disabled:opacity-50 active:scale-95"
            title="Abrir ou Clonar o Modelo Oficial Hbi Pizza Idêntico à Screenshot"
          >
            <Sparkles className="w-4 h-4" />
            <span>Modelo Hbi Pizza Oficial</span>
          </button>

          {/* Botão de Criação de Modelo de Restaurante com 1 clique */}
          <button
            onClick={handleCreateRestaurantTemplate}
            disabled={isCreating}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 px-4 py-2.5 rounded-xl shadow transition-all font-medium text-sm disabled:opacity-50 active:scale-95"
            title="Criar Modelo FoodNext Restaurante Completo"
          >
            <UtensilsCrossed className="w-4 h-4 text-emerald-400" />
            <span>Modelo Restaurante (3 em 1)</span>
          </button>

          <button 
            onClick={() => navigate('/flows/settings/preferences')}
            className="p-2.5 hover:bg-slate-800 border border-slate-700/50 rounded-xl transition-all text-slate-400 hover:text-emerald-500 group"
            title="Configurações do Typebot"
          >
            <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
          </button>
          
          <button 
            onClick={handleCreateFlow}
            disabled={isCreating}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-900/20 transition-all font-medium text-sm disabled:opacity-50 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            {isCreating ? 'Processando...' : 'Criar Novo Fluxo'}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 bg-[#18181b] relative isolate animate-in fade-in zoom-in-95 duration-500">
        
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Fluxos Cadastrados ({flows.length})
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          
          {/* Card Criar Novo Fluxo */}
          <button 
            onClick={handleCreateFlow}
            disabled={isCreating}
            className="group flex flex-col h-[220px] bg-gradient-to-br from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-3xl p-6 transition-all duration-300 shadow-xl shadow-indigo-900/20 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center relative overflow-hidden border border-indigo-400/20"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Plus size={44} className="font-light mb-3 group-hover:scale-110 transition-transform duration-300" strokeWidth={1.5} />
            <span className="font-semibold tracking-tight text-base">Criar um typebot</span>
            <span className="text-xs text-indigo-200 mt-1 opacity-80">Do zero no canvas</span>
          </button>

          {loading ? (
            <div className="col-span-full py-16 text-center text-slate-500 animate-pulse text-sm">
              Carregando fluxos cadastrados...
            </div>
          ) : flows.map(flow => {
            const isLive = Boolean(flow.active_version_id);
            const isMenuOpen = activeMenuId === flow.id;

            return (
              <div 
                key={flow.id} 
                className="bg-[#1e1e24] hover:bg-[#232328] rounded-3xl border border-[#2a2a2f] p-5 flex flex-col h-[220px] transition-all hover:border-slate-600/50 hover:shadow-2xl hover:shadow-black/40 group relative cursor-pointer" 
                onClick={() => navigate(`/flows/${flow.id}/edit`)}
              >
                {/* Top Row - Dots & Badge */}
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleToggleFlowActive(flow)}
                      title={isLive ? "Clique para pausar este fluxo" : "Clique para ativar este fluxo em produção"}
                      className="group/badge transition-transform active:scale-95"
                    >
                      {isLive ? (
                        <span className="inline-flex items-center gap-1.5 bg-emerald-500/15 hover:bg-amber-500/20 text-emerald-400 hover:text-amber-300 text-[10px] uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30 hover:border-amber-500/40 transition-colors">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse group-hover/badge:bg-amber-400" />
                          <span className="group-hover/badge:hidden">Live</span>
                          <span className="hidden group-hover/badge:inline">Pausar</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 bg-slate-800/80 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300 text-[10px] uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-full border border-slate-700/60 hover:border-emerald-500/40 transition-colors">
                          <Pause size={10} className="text-slate-500 group-hover/badge:hidden" />
                          <Play size={10} className="hidden group-hover/badge:inline text-emerald-400 fill-current" />
                          <span className="group-hover/badge:hidden">Pausado</span>
                          <span className="hidden group-hover/badge:inline">Ativar</span>
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Menu de Ações (Pausar/Ativar, Editar, Clonar, Excluir) */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => setActiveMenuId(isMenuOpen ? null : flow.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#2a2a2f] rounded-lg transition-colors opacity-80 group-hover:opacity-100"
                      title="Opções do Fluxo"
                    >
                      <MoreHorizontal size={18} />
                    </button>

                    {/* Popover Dropdown de Opções */}
                    {isMenuOpen && (
                      <div className="absolute right-0 top-8 z-50 w-48 bg-[#18181b] border border-slate-700/70 rounded-2xl shadow-2xl p-1.5 flex flex-col gap-1 text-xs animate-in fade-in zoom-in-95">
                        {/* Opção de Pausar / Ativar Fluxo */}
                        {isLive ? (
                          <button
                            onClick={() => { setActiveMenuId(null); handleToggleFlowActive(flow); }}
                            className="flex items-center gap-2 px-3 py-2 text-amber-300 hover:text-amber-200 hover:bg-amber-500/15 rounded-xl transition-colors text-left font-medium"
                          >
                            <Pause size={14} className="text-amber-400" />
                            <span>Pausar Fluxo</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => { setActiveMenuId(null); handleToggleFlowActive(flow); }}
                            className="flex items-center gap-2 px-3 py-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15 rounded-xl transition-colors text-left font-medium"
                          >
                            <Play size={14} className="text-emerald-400 fill-current" />
                            <span>Ativar Fluxo (No Ar)</span>
                          </button>
                        )}

                        <div className="border-t border-slate-700/50 my-0.5" />

                        <button
                          onClick={() => { setActiveMenuId(null); navigate(`/flows/${flow.id}/edit`); }}
                          className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors text-left"
                        >
                          <Edit size={14} className="text-indigo-400" />
                          <span>Editar Fluxo</span>
                        </button>
                        
                        <button
                          onClick={() => { setActiveMenuId(null); handleCloneFlow(flow.id); }}
                          className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors text-left"
                        >
                          <Copy size={14} className="text-emerald-400" />
                          <span>Clonar / Duplicar</span>
                        </button>

                        <div className="border-t border-slate-700/50 my-0.5" />

                        <button
                          onClick={() => { setActiveMenuId(null); handleDelete(flow.id); }}
                          className="flex items-center gap-2 px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors text-left"
                        >
                          <Trash2 size={14} />
                          <span>Excluir Fluxo</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Center Icon */}
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#2a2a2f] flex items-center justify-center mb-3 text-slate-300 group-hover:scale-110 transition-transform duration-300 shadow-inner border border-slate-700/50">
                    {flow.name?.toLowerCase().includes('restaurante') || flow.name?.toLowerCase().includes('cardápio') ? (
                      <UtensilsCrossed size={22} className="text-emerald-400" />
                    ) : (
                      <MessageSquare size={22} className="text-indigo-400" />
                    )}
                  </div>
                  <h3 className="font-bold text-slate-200 text-center tracking-tight truncate w-full px-2 text-sm">
                    {flow.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 truncate max-w-full px-2">
                    {flow.trigger_rules && flow.trigger_rules.length > 0 
                      ? `Gatilho: ${flow.trigger_rules.map((r: any) => `"${r.value}"`).join(', ')}`
                      : 'Sem gatilho definido'}
                  </p>
                </div>

                {/* Bottom Row - Data */}
                <div className="mt-auto pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Atualizado</span>
                  <span>{new Date(flow.created_at).toLocaleDateString('pt-BR')}</span>
                </div>

              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
