import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  Send, 
  RotateCcw, 
  X, 
  CheckSquare, 
  Play, 
  Clock, 
  User, 
  Globe, 
  MessageSquare, 
  Sparkles,
  Smartphone,
  ChevronDown,
  ExternalLink,
  Variable
} from 'lucide-react';
import { Node, Edge } from '@xyflow/react';
import { parseTextToSegments } from '../../utils/urlHelper';
import { useChatStore } from '../../store/chatStore';

interface TestSimulatorProps {
  nodes: Node[];
  edges: Edge[];
  onClose: () => void;
  startNodeId?: string;
}

interface Message {
  id: string;
  sender: 'bot' | 'user' | 'system';
  text: string;
}

const getInitialSimulatorVars = (): Record<string, string> => {
  const tenantInfo = useChatStore.getState().tenantInfo;
  const settings = (tenantInfo as any)?.settings || {};
  const companyName = settings.nome_ia || tenantInfo?.name || 'Nossa Empresa';
  return {
    pushName: 'Cliente Teste',
    saudacao: 'Boa tarde',
    NomeEmpresa: companyName,
    NOME_DA_EMPRESA: companyName,
    cardapio: settings.link_cardapio || '',
    LINK_CARDAPIO: settings.link_cardapio || '',
    GoogleMaps: settings.google_maps || '',
    LINK_GOOGLE_MAPS: settings.google_maps || '',
    EnderecoEmpresa: settings.endereco || '',
    ENDERECO_DA_EMPRESA: settings.endereco || '',
    DiaFuncionamento: 'Segunda a Sábado',
    HoraFuncionamento: settings.horario_funcionamento || '',
    HORARIO_FUNCIONAMENTO: settings.horario_funcionamento || '',
    LINK_INSTAGRAM: settings.instagram || '',
    LINK_YOUTUBE: settings.youtube || '',
    LINK_TIKTOK: settings.tiktok || '',
    NumeroTelefoneEmpresa: settings.phone || '',
    AbertoFechado: 'true',
    NumeroMenu: '1',
    message: 'Olá, gostaria de atendimento'
  };
};

export default function TestSimulator({ nodes, edges, onClose, startNodeId }: TestSimulatorProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentBlock, setCurrentBlock] = useState<any>(null);
  const [variables, setVariables] = useState<Record<string, string>>(() => getInitialSimulatorVars());
  const [lastUserInput, setLastUserInput] = useState<string>('');
  const [isAwaitingInput, setIsAwaitingInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isRestarting, setIsRestarting] = useState(false);
  const [activeButtonOptions, setActiveButtonOptions] = useState<string[]>([]);
  const [simulatorTheme, setSimulatorTheme] = useState<'whatsapp' | 'typebot_web'>('whatsapp');
  const [showVarsDrawer, setShowVarsDrawer] = useState(false);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const autoStepsRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rola para a mensagem mais recente
  useEffect(() => {
    if (endOfMessagesRef.current) {
      endOfMessagesRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAwaitingInput, activeButtonOptions]);

  const findStartBlock = (): any | null => {
    // 0. Se foi especificado um nó inicial para teste focado (via botão Play do menu flutuante)
    if (startNodeId) {
      const targetNode = nodes.find(n => n.id === startNodeId);
      if (targetNode) {
        if (targetNode.data?.blocks && (targetNode.data.blocks as any[]).length > 0) {
          return targetNode.data.blocks[0];
        }
        return {
          id: targetNode.id,
          flowType: targetNode.data?.type || 'send_message',
          label: targetNode.data?.label || 'Início Focado',
          text: targetNode.data?.message || targetNode.data?.label || ''
        };
      }
    }

    // 1. Procura grupo com bloco de Início
    let startGroup = nodes.find(n => (n.type === 'typebot_group' || n.type === 'group') && (
      n.data?.label?.toLowerCase().includes('início') ||
      n.data?.label?.toLowerCase().includes('inicio') ||
      n.data?.title?.toLowerCase().includes('início') ||
      n.data?.title?.toLowerCase().includes('inicio') ||
      n.data?.title?.toLowerCase().includes('boas-vindas') ||
      n.data?.label?.toLowerCase().includes('start') ||
      n.data?.label?.toLowerCase().includes('entrada') ||
      n.data?.blocks?.some((b: any) => 
        b.label?.toLowerCase().includes('início') || 
        b.label?.toLowerCase().includes('inicio') || 
        b.flowType === 'start' || 
        b.id?.includes('start')
      )
    ));
    
    // 2. Se não achou por nome, pega o nó do topo ou sem arestas de entrada
    if (!startGroup) {
      const targetGroupsIds = edges.map(e => e.target);
      const startCandidates = nodes.filter(n => !targetGroupsIds.includes(n.id) && (n.type === 'typebot_group' || n.type === 'group' || n.type === 'custom'));
      if (startCandidates.length > 0) {
        startCandidates.sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
        startGroup = startCandidates[0];
      }
    }

    if (!startGroup) startGroup = nodes[0];
    if (startGroup) {
      if (startGroup.data?.blocks?.length > 0) return startGroup.data.blocks[0];
      return {
        id: startGroup.id,
        flowType: startGroup.data?.type || 'send_message',
        label: startGroup.data?.label || startGroup.data?.title || 'Início',
        text: startGroup.data?.message || startGroup.data?.label || startGroup.data?.title || ''
      };
    }
    return null;
  };

  const pushMessage = (sender: 'bot' | 'user' | 'system', text: string) => {
    setMessages(prev => [...prev, { id: Math.random().toString(36).substring(7), sender, text }]);
  };

  const parseText = (text: string, vars: Record<string, string>) => {
    if (!text) return '';
    return text
      .replace(/\{\{?([^}]+)\}?\}/g, (_, param) => {
        const key = param.trim();
        return vars[key] !== undefined ? vars[key] : `{{${key}}}`;
      })
      .replace(/\[([A-Z0-9_]+)\]/g, (full, param) => {
        const key = param.trim();
        return vars[key] !== undefined && vars[key] !== '' ? vars[key] : full;
      });
  };

  // Encontra o próximo bloco seguindo o encadeamento interno ou arestas
  const getNextBlock = (
    currBlockId: string,
    userInputOption?: string,
    overrideHandleIds?: string[],
    varsOverride?: Record<string, string>
  ) => {
    const activeVars = varsOverride || variables;
    const parentGroup = nodes.find(n => n.data?.blocks?.some((b: any) => b.id === currBlockId) || n.id === currBlockId);
    const currBlockObj = parentGroup?.data?.blocks?.find((b: any) => b.id === currBlockId) || currentBlock;

    const toTargetFirstBlock = (edge: Edge | undefined) => {
      if (!edge) return null;
      const targetNode = nodes.find(n => n.id === edge.target);
      if (targetNode && targetNode.data?.blocks?.length > 0) return targetNode.data.blocks[0];
      return null;
    };

    if (overrideHandleIds && overrideHandleIds.length > 0) {
      const matched = edges.find(e => e.source === parentGroup?.id && overrideHandleIds.includes(e.sourceHandle || ''));
      const targetBlk = toTargetFirstBlock(matched);
      if (targetBlk) return targetBlk;
    }

    // Se o bloco atual for um Jump
    if (currBlockObj?.flowType === 'jump') {
      const targetId = currBlockObj.target_group_id;
      const targetName = currBlockObj.target_group_name;

      if (targetId && targetId !== parentGroup?.id) {
        const targetNode = nodes.find(n => n.id === targetId);
        if (targetNode && targetNode.data?.blocks?.length > 0) return targetNode.data.blocks[0];
      }
      if (targetName) {
        const targetNode = nodes.find(n => (n.data?.label || n.data?.title || '')?.toLowerCase().includes(targetName.toLowerCase()));
        if (targetNode && targetNode.data?.blocks?.length > 0 && targetNode.id !== parentGroup?.id) return targetNode.data.blocks[0];
      }

      const jumpEdge = edges.find(e => e.sourceHandle === currBlockId || (parentGroup && e.source === parentGroup.id));
      const jumpTarget = toTargetFirstBlock(jumpEdge);
      if (jumpTarget) return jumpTarget;

      const start = findStartBlock();
      if (start && start.id !== currBlockId) return start;
    }

    const evalComparison = (varValRaw: string, op: string, targetValRaw: string) => {
      const varVal = String(varValRaw ?? '').trim().toLowerCase();
      const targetVal = String(targetValRaw ?? '').trim().toLowerCase();
      const normOp = String(op || '=').trim().toLowerCase();
      if (['=', 'equal to', 'equals', 'equal', '==', 'is'].includes(normOp)) return varVal === targetVal;
      if (['≠', '!=', 'not equal', 'not_equals', 'not_equal', 'is_not'].includes(normOp)) return varVal !== targetVal;
      if (['contains', 'contém', 'contem'].includes(normOp)) return targetVal.length > 0 && varVal.includes(targetVal);
      if (['not_contains', 'nao_contem'].includes(normOp)) return !targetVal.length || !varVal.includes(targetVal);
      if (['starts_with', 'starts with'].includes(normOp)) return varVal.startsWith(targetVal);
      if (['ends_with', 'ends with'].includes(normOp)) return varVal.endsWith(targetVal);
      if (['>', 'greater than', 'greater'].includes(normOp)) return varVal !== '' && targetVal !== '' && Number(varVal) > Number(targetVal);
      if (['<', 'less than', 'less'].includes(normOp)) return varVal !== '' && targetVal !== '' && Number(varVal) < Number(targetVal);
      if (['exists', 'is set', 'is_set', 'not_empty'].includes(normOp)) return varVal.length > 0;
      if (['is_empty', 'empty', 'not_exists'].includes(normOp)) return varVal.length === 0;
      return varVal === targetVal;
    };

    // Se o bloco atual for uma Condição com Itens (Typebot Pattern)
    if (currBlockObj?.flowType === 'condition') {
      if (currBlockObj.items && Array.isArray(currBlockObj.items) && currBlockObj.items.length > 0) {
        for (let i = 0; i < currBlockObj.items.length; i++) {
          const item = currBlockObj.items[i];
          const itemVarKey = item.varName || item.variable || currBlockObj.var_name || currBlockObj.variable;
          const candidateVal = itemVarKey && activeVars[itemVarKey] !== undefined
            ? activeVars[itemVarKey]
            : (userInputOption || lastUserInput || activeVars['NumeroMenu'] || '');

          if (evalComparison(candidateVal, item.operator || '=', parseText(String(item.value ?? ''), activeVars))) {
            const matchedEdge = edges.find(
              e => e.source === parentGroup?.id && (e.sourceHandle === item.id || e.sourceHandle === `${currBlockId}-cond-${i}`)
            );
            const targetBlk = toTargetFirstBlock(matchedEdge);
            if (targetBlk) return targetBlk;
          }
        }
      } else if (currBlockObj.variable || currBlockObj.var_name || currBlockObj.value) {
        const varKey = currBlockObj.variable || currBlockObj.var_name;
        const candidateVal = varKey && activeVars[varKey] !== undefined
          ? activeVars[varKey]
          : (userInputOption || lastUserInput || '');
        if (evalComparison(candidateVal, currBlockObj.operator || '=', parseText(String(currBlockObj.value || ''), activeVars))) {
          const trueEdge = edges.find(e => e.sourceHandle === currBlockId || e.sourceHandle === `${currBlockId}-true` || e.label?.toLowerCase().includes('verdadeiro'));
          const targetBlk = toTargetFirstBlock(trueEdge);
          if (targetBlk) return targetBlk;
        }
      }

      // Senão / Fallback (-else)
      const elseEdge = edges.find(
        e => e.source === parentGroup?.id && (
          e.sourceHandle === `${currBlockId}-else` ||
          e.sourceHandle === 'false' ||
          (e.sourceHandle === currBlockId && !(currBlockObj.items || []).some((i: any) => i.id === e.sourceHandle))
        )
      );
      const elseBlk = toTargetFirstBlock(elseEdge);
      if (elseBlk) return elseBlk;
    }

    // Se estiver em um menu / buttons / enquete / seleção e o usuário escolheu algo
    if (userInputOption && ['buttons', 'cards', 'pic_choice', 'poll'].includes(currBlockObj?.flowType)) {
      const cleanInput = userInputOption.trim().toLowerCase();
      const numMatch = cleanInput.match(/^(\d+)(?:[\s.)-]|$)/);
      const options = Array.isArray(currBlockObj?.options) ? currBlockObj.options : [];
      let optionIndex = numMatch ? parseInt(numMatch[1], 10) - 1 : -1;
      if (optionIndex < 0 || optionIndex >= options.length) {
        optionIndex = options.findIndex((o: any) => {
          const lbl = String(typeof o === 'string' ? o : (o?.label || o?.title || '')).trim().toLowerCase();
          return lbl === cleanInput || lbl.startsWith(cleanInput) || lbl.includes(cleanInput);
        });
      }
      const optNum = optionIndex >= 0 ? String(optionIndex + 1) : cleanInput;

      if (optionIndex >= 0) {
        let matchingEdge = edges.find(e =>
          (e.source === parentGroup?.id || e.sourceHandle === currBlockId || e.sourceHandle?.startsWith(currBlockId)) &&
          (e.sourceHandle === `${currBlockId}-opt-${optionIndex}` || e.sourceHandle === `${currBlockId}-cond-${optionIndex}`)
        );

        if (!matchingEdge) {
          matchingEdge = edges.find(e => {
            if (!e.label) return false;
            if (parentGroup && e.source !== parentGroup.id) return false;
            const l = e.label.toLowerCase();
            return l.includes(`numeromenu - ${optNum}`) ||
                   l.startsWith(`${optNum} -`) ||
                   l.startsWith(`${optNum}.`) ||
                   l.startsWith(`${optNum} `) ||
                   l === cleanInput;
          });
        }

        if (!matchingEdge) {
          const genericEdges = edges.filter(e => parentGroup && e.source === parentGroup.id && (!e.sourceHandle || !String(e.sourceHandle).includes('-opt-')));
          if (genericEdges.length === 1) matchingEdge = genericEdges[0];
        }

        const targetBlk = toTargetFirstBlock(matchingEdge);
        if (targetBlk) return targetBlk;
      }
    }

    // Navegação sequencial dentro do mesmo grupo
    if (parentGroup && parentGroup.data?.blocks) {
      const blocks = parentGroup.data.blocks;
      const idx = blocks.findIndex((b: any) => b.id === currBlockId);
      if (idx !== -1 && idx < blocks.length - 1) {
        return blocks[idx + 1];
      }
    }

    // Aresta saindo do bloco atual ou do grupo pai (sem pegar handle de outra opção/condição)
    let outgoingEdge = edges.find(e => e.sourceHandle === currBlockId);
    if (!outgoingEdge && parentGroup) {
      outgoingEdge = edges.find(e =>
        e.source === parentGroup.id &&
        (!e.sourceHandle || (!String(e.sourceHandle).includes('-opt-') && !String(e.sourceHandle).includes('-cond-') && !String(e.sourceHandle).endsWith('-else')))
      );
    }

    return toTargetFirstBlock(outgoingEdge);
  };

  const autoAdvance = (
    currBlockId: string,
    delay = 600,
    userInputOption?: string,
    overrideHandleIds?: string[],
    varsOverride?: Record<string, string>
  ) => {
    autoStepsRef.current += 1;
    if (autoStepsRef.current > 25) {
      pushMessage('system', '🛡️ Anti-Loop do Simulador: mais de 25 blocos executados em sequência sem pausa de Input/Espera. Simulação interrompida para sua segurança.');
      setCurrentBlock(null);
      setIsAwaitingInput(false);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const next = getNextBlock(currBlockId, userInputOption, overrideHandleIds, varsOverride);
      if (next) {
        setCurrentBlock(next);
      } else {
        pushMessage('system', 'Fim do Fluxo. Clique em Reiniciar para testar novamente.');
        setCurrentBlock(null);
      }
    }, delay);
  };

  useEffect(() => {
    if (!currentBlock || isRestarting) return;

    const flowType = currentBlock.flowType;
    const blockMsg = currentBlock.text || currentBlock.content || '';

    // 1. Mensagens de Texto & Mídias (inclui "text"!)
    if (['send_message', 'message', 'text', 'image', 'video', 'audio', 'embed'].includes(flowType)) {
      const baseText = blockMsg
        ? blockMsg
        : currentBlock.url
          ? `[Mídia ${flowType.toUpperCase()}: ${currentBlock.url}]${currentBlock.caption ? `\n${currentBlock.caption}` : ''}`
          : `[Mídia: ${flowType}]`;
      const text = parseText(baseText, variables);
      pushMessage('bot', text);
      autoAdvance(currentBlock.id, 650);
    }
    // 2. Reply (Citação simulada)
    else if (flowType === 'reply') {
      const quotedPreview = lastUserInput ? `↩ Respondendo a "${lastUserInput}":\n` : '↩ [Resposta Citada]\n';
      pushMessage('bot', `${quotedPreview}${parseText(blockMsg || 'Recebido!', variables)}`);
      autoAdvance(currentBlock.id, 600);
    }
    // 3. Cobrança Pix formatada
    else if (flowType === 'payment') {
      const valor = parseText(currentBlock.amount || currentBlock.valor || '0,00', variables);
      const pixKey = parseText(currentBlock.pix_key || currentBlock.chave_pix || '', variables);
      const pixCode = parseText(currentBlock.pix_copia_e_cola || currentBlock.pix_code || '', variables);
      const payLink = parseText(currentBlock.payment_link || currentBlock.url || '', variables);
      const formatted = blockMsg
        ? parseText(blockMsg, variables)
        : `💳 PAGAMENTO VIA PIX\n💰 Valor: R$ ${valor}${pixKey ? `\n🔑 Chave: ${pixKey}` : ''}${pixCode ? `\n📋 Código: ${pixCode}` : ''}${payLink ? `\n🔗 Link: ${payLink}` : ''}`;
      pushMessage('bot', formatted);
      autoAdvance(currentBlock.id, 600);
    }
    // 4. Inputs de Texto, Arquivos e Avaliação (inclui "text_input"!)
    else if (['ask', 'input', 'text_input', 'number_input', 'email_input', 'website_input', 'phone_input', 'date_input', 'time_input', 'rating', 'file_input'].includes(flowType)) {
      const baseText = blockMsg || `Digite seu ${currentBlock.label || flowType}:`;
      const text = parseText(baseText, variables);
      pushMessage('bot', text);

      if (flowType === 'rating') {
        setActiveButtonOptions(['1 - 😡 Péssimo', '2 - 🙁 Ruim', '3 - 😐 Regular', '4 - 😊 Bom', '5 - 🤩 Excelente']);
      } else if (flowType === 'file_input') {
        setActiveButtonOptions(['📎 Enviar Arquivo Simulado (comprovante.pdf)']);
      } else {
        const parentGroup = nodes.find(n => n.data?.blocks?.some((b: any) => b.id === currentBlock.id));
        if (parentGroup) {
          const blocks = parentGroup.data.blocks;
          const idx = blocks.findIndex((b: any) => b.id === currentBlock.id);
          const nextInGroup = blocks[idx + 1];
          if (nextInGroup && nextInGroup.flowType === 'condition' && nextInGroup.items) {
            const suggestedOpts = nextInGroup.items.map((it: any) => `${it.value} - Opção ${it.value}`);
            setActiveButtonOptions(suggestedOpts);
          } else {
            setActiveButtonOptions([]);
          }
        } else {
          setActiveButtonOptions([]);
        }
      }

      setIsAwaitingInput(true);
    }
    // 5. Botões, Menus de Opções, Seleção de Imagens e Enquete Nativa
    else if (['buttons', 'pic_choice', 'cards', 'poll'].includes(flowType)) {
      const prefix = flowType === 'poll' ? '📊 Enquete: ' : '';
      const prompt = parseText(blockMsg || currentBlock.label || 'Escolha uma opção:', variables);
      pushMessage('bot', `${prefix}${prompt}`);
      const rawOpts = Array.isArray(currentBlock.options) && currentBlock.options.length > 0
        ? currentBlock.options
        : ['Opção 1', 'Opção 2'];
      const formattedOpts = rawOpts.map((opt: any, idx: number) => {
        const lbl = typeof opt === 'string' ? opt : (opt?.label || opt?.title || `Opção ${idx + 1}`);
        return `${idx + 1} - ${parseText(lbl, variables)}`;
      });
      setActiveButtonOptions(formattedOpts);
      setIsAwaitingInput(true);
    }
    // 6. Set Variable
    else if (flowType === 'set_variable') {
      const varKey = currentBlock.var_name || currentBlock.variable;
      const valExpr = currentBlock.text || currentBlock.value || currentBlock.expression || '';
      if (varKey) {
        const resolved = parseText(valExpr, variables);
        const nextVars = { ...variables, [varKey as string]: resolved };
        setVariables(nextVars);
        autoAdvance(currentBlock.id, 100, undefined, undefined, nextVars);
        return;
      }
      autoAdvance(currentBlock.id, 100);
    }
    // 7. Script JS Sandbox
    else if (flowType === 'script') {
      const rawCode = currentBlock.code || currentBlock.text || '';
      let nextVars = { ...variables };
      try {
        const runner = new Function(
          'variables',
          'setVar',
          'getVar',
          `${rawCode}\nreturn variables;`
        );
        const updated = runner(
          nextVars,
          (k: string, v: any) => { if (k) nextVars[String(k)] = String(v ?? ''); },
          (k: string) => nextVars[String(k)]
        );
        if (updated && typeof updated === 'object') {
          Object.keys(updated).forEach((k) => { nextVars[k] = String(updated[k] ?? ''); });
        }
        setVariables(nextVars);
        pushMessage('system', '📜 Script executado em sandbox com sucesso.');
      } catch (err: any) {
        pushMessage('system', `⚠️ Erro no Script: ${err?.message || 'Sintaxe inválida'}`);
      }
      autoAdvance(currentBlock.id, 200, undefined, undefined, nextVars);
    }
    // 8. Teste A/B
    else if (flowType === 'ab_test') {
      const pctA = Math.max(0, Math.min(100, Number(currentBlock.splitA ?? currentBlock.percentageA ?? 50)));
      const variant = Math.random() * 100 < pctA ? 'a' : 'b';
      const handleIds = variant === 'a'
        ? [`${currentBlock.id}-a`, 'a', `${currentBlock.id}-opt-0`]
        : [`${currentBlock.id}-b`, 'b', `${currentBlock.id}-opt-1`];
      const nextVars = { ...variables, __ab_variant: variant.toUpperCase() };
      setVariables(nextVars);
      pushMessage('system', `🔀 Teste A/B sorteou: Ramo ${variant.toUpperCase()} (${pctA}% A / ${100 - pctA}% B)`);
      autoAdvance(currentBlock.id, 300, undefined, handleIds, nextVars);
    }
    // 9. Jump (Retorno ao Menu ou Outro Grupo)
    else if (flowType === 'jump') {
      pushMessage('system', `↪️ Saltando para ${currentBlock.target_group_name || currentBlock.target_group_id || 'próximo grupo'}...`);
      autoAdvance(currentBlock.id, 400);
    }
    // 10. Condicionais
    else if (flowType === 'condition') {
      autoAdvance(currentBlock.id, 200, lastUserInput || variables['NumeroMenu']);
    }
    // 11. Espera / Delay
    else if (flowType === 'wait' || flowType === 'delay') {
      const waitTime = currentBlock.wait_time || currentBlock.delay ? Number(currentBlock.wait_time || currentBlock.delay) : 2;
      pushMessage('system', `⏳ Aguardando ${waitTime}s (no WhatsApp exibe "digitando...")...`);
      autoAdvance(currentBlock.id, Math.min(waitTime * 1000, 2500));
    }
    // 12. Webhook (tenta chamada GET/POST real com fallback amigável se CORS bloquear)
    else if (flowType === 'webhook') {
      const respVar = currentBlock.response_var_name || 'AbertoFechado';
      const rawUrl = parseText(currentBlock.url || currentBlock.webhookUrl || '', variables).trim();
      const method = String(currentBlock.method || 'GET').toUpperCase();

      if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
        const nextVars = { ...variables, [respVar]: 'mock_ok' };
        setVariables(nextVars);
        pushMessage('system', `⚡ Webhook simulado (${method}) -> ${respVar} = mock_ok`);
        autoAdvance(currentBlock.id, 300, undefined, undefined, nextVars);
        return;
      }

      pushMessage('system', `⚡ Chamando Webhook ${method}: ${rawUrl}...`);
      (async () => {
        let finalVal = 'true';
        try {
          const opts: RequestInit = { method };
          if (method !== 'GET' && method !== 'HEAD') {
            opts.headers = { 'Content-Type': 'application/json' };
            opts.body = parseText(currentBlock.body || JSON.stringify({ variables }), variables);
          }
          const res = await fetch(rawUrl, opts);
          const txt = await res.text();
          let data: any = txt;
          try { data = JSON.parse(txt); } catch {}
          const rPath = currentBlock.response_path?.trim();
          if (rPath && data && typeof data === 'object') {
            let cur = data;
            for (const p of rPath.split('.')) { cur = cur?.[p]; }
            finalVal = cur !== undefined && cur !== null ? String(typeof cur === 'object' ? JSON.stringify(cur) : cur) : '';
          } else {
            finalVal = typeof data === 'object' ? JSON.stringify(data) : String(data);
          }
          pushMessage('system', `✅ Webhook HTTP ${res.status} -> ${respVar} = ${finalVal.slice(0, 80)}`);
        } catch {
          finalVal = 'simulated_cors_ok';
          pushMessage('system', `ℹ️ CORS/Rede no navegador; simulando retorno -> ${respVar} = ${finalVal}`);
        }
        const nextVars = { ...variables, [respVar]: finalVal };
        setVariables(nextVars);
        autoAdvance(currentBlock.id, 300, undefined, undefined, nextVars);
      })();
    }
    // 13. Redirect / Subfluxo Typebot Link
    else if (flowType === 'redirect' || flowType === 'typebot_link') {
      if (flowType === 'redirect' && currentBlock.url) {
        const link = parseText(currentBlock.url, variables);
        pushMessage('bot', `${parseText(blockMsg || '🔗 Acesse o link abaixo:', variables)}\n${link}`);
      } else {
        pushMessage('system', `🔗 Subfluxo referenciado: ${currentBlock.target_flow_id || 'Configurar ID do fluxo destino'}`);
      }
      autoAdvance(currentBlock.id, 400);
    }
    // 14. Comando CRM
    else if (flowType === 'command') {
      const action = currentBlock.command_action || 'add_tag';
      const val = parseText(currentBlock.command_value || blockMsg || '', variables);
      pushMessage('system', `⌘ Comando CRM simulado: ${action}${val ? ` (${val})` : ''}`);
      autoAdvance(currentBlock.id, 300);
    }
    // 15. Start Block
    else if (flowType === 'start') {
      autoAdvance(currentBlock.id, 150);
    }
    // 16. Handoff
    else if (flowType === 'handoff') {
      if (blockMsg) {
        pushMessage('bot', parseText(blockMsg, variables));
      }
      pushMessage('system', '👤 Atendimento transferido para humano e I.A. pausada.');
      setCurrentBlock(null);
    }
    // Padrão Fallback
    else {
      autoAdvance(currentBlock.id, 200);
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBlock]);

  const handleRestart = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    autoStepsRef.current = 0;
    setIsRestarting(true);
    setMessages([]);
    setVariables(getInitialSimulatorVars());
    setLastUserInput('');
    setIsAwaitingInput(false);
    setInputValue('');
    setActiveButtonOptions([]);
    setCurrentBlock(null);

    setTimeout(() => {
      setIsRestarting(false);
      const start = findStartBlock();
      if (start) {
        pushMessage('system', 'Simulação Iniciada.');
        setCurrentBlock(start);
      } else {
        pushMessage('system', 'Nenhum nó de entrada encontrado no fluxo.');
      }
    }, 300);
  };

  useEffect(() => {
    handleRestart();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectOption = (optionText: string) => {
    if (!currentBlock) return;
    autoStepsRef.current = 0;

    let selectedValue = optionText;
    if (currentBlock.flowType === 'file_input') {
      selectedValue = 'https://exemplo.com/comprovante-teste.pdf';
    } else {
      const match = optionText.match(/^(\d+)\s*-\s*(.+)$/);
      if (match && ['buttons', 'cards', 'pic_choice', 'poll', 'rating'].includes(currentBlock.flowType)) {
        selectedValue = match[1];
      } else {
        const prefixNum = optionText.match(/^(\d+)/);
        selectedValue = prefixNum ? prefixNum[1] : optionText;
      }
    }

    pushMessage('user', optionText);
    setActiveButtonOptions([]);
    setIsAwaitingInput(false);
    setLastUserInput(selectedValue);

    const varName = currentBlock.var_name || currentBlock.variable || 'NumeroMenu';
    const nextVars = { ...variables, [varName]: selectedValue, NumeroMenu: selectedValue };
    setVariables(nextVars);

    autoAdvance(currentBlock.id, 300, selectedValue, undefined, nextVars);
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || !isAwaitingInput || !currentBlock) return;
    autoStepsRef.current = 0;

    let text = inputValue.trim();
    const flowType = currentBlock.flowType;
    const shouldValidate = currentBlock.validate !== false;

    // Validação fiel ao servidor antes de avançar
    if (shouldValidate && flowType === 'number_input') {
      const num = Number(text.replace(',', '.'));
      if (Number.isNaN(num)) {
        pushMessage('user', text);
        setInputValue('');
        pushMessage('bot', '⚠️ Por favor, digite apenas um número válido (ex: 10 ou 25.50).');
        return;
      }
      text = String(num);
    } else if (shouldValidate && flowType === 'email_input' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) {
      pushMessage('user', text);
      setInputValue('');
      pushMessage('bot', '⚠️ Por favor, digite um e-mail válido (ex: nome@empresa.com).');
      return;
    } else if (shouldValidate && flowType === 'date_input' && !/^(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2})$/.test(text)) {
      pushMessage('user', text);
      setInputValue('');
      pushMessage('bot', '⚠️ Por favor, informe uma data válida no formato DD/MM/AAAA.');
      return;
    }

    pushMessage('user', text);
    setInputValue('');
    setActiveButtonOptions([]);
    setIsAwaitingInput(false);
    setLastUserInput(text);

    const varName = currentBlock.var_name || currentBlock.variable || 'NumeroMenu';
    const nextVars = { ...variables, [varName]: text, NumeroMenu: text };
    setVariables(nextVars);

    autoAdvance(currentBlock.id, 300, text, undefined, nextVars);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      
      {/* Container Principal Preview */}
      <div className={`rounded-3xl shadow-2xl overflow-hidden w-full max-w-[420px] h-[780px] max-h-[92vh] flex flex-col transition-all duration-300 border ${
        simulatorTheme === 'whatsapp' 
          ? 'bg-[#18181b] border-zinc-700/80' 
          : 'bg-white border-zinc-300 text-zinc-900 shadow-2xl'
      }`}>
          
          {/* Header */}
          <div className={`px-4 py-3 flex items-center justify-between z-10 shrink-0 border-b ${
            simulatorTheme === 'whatsapp' 
              ? 'bg-[#202024] border-zinc-800' 
              : 'bg-zinc-100 border-zinc-200'
          }`}>
             <div className="flex items-center gap-3">
                 <div className={`w-9 h-9 rounded-full flex items-center justify-center shadow-inner ${
                   simulatorTheme === 'whatsapp' 
                     ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                     : 'bg-blue-600 text-white'
                 }`}>
                     <Bot className="w-5 h-5" />
                 </div>
                 <div>
                     <h3 className={`font-bold text-sm flex items-center gap-1.5 ${
                       simulatorTheme === 'whatsapp' ? 'text-zinc-100' : 'text-zinc-900'
                     }`}>
                       <span>Visualizar</span>
                       <span className="text-[10px] bg-emerald-500/20 text-emerald-500 font-semibold px-1.5 py-0.2 rounded border border-emerald-500/30">
                         {simulatorTheme === 'whatsapp' ? 'WhatsApp' : 'Web'}
                       </span>
                     </h3>
                     <p className="text-xs text-emerald-500 flex items-center gap-1">
                         <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Online em tempo real
                     </p>
                 </div>
             </div>

             <div className="flex items-center gap-1">
                 <button
                    onClick={() => setShowVarsDrawer(v => !v)}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all border ${
                      showVarsDrawer
                        ? 'bg-purple-600/30 text-purple-200 border-purple-500/40'
                        : 'bg-zinc-800 text-zinc-300 hover:text-white border-zinc-700'
                    }`}
                    title="Inspecionar Variáveis Atuais em Tempo Real"
                 >
                    <Variable className="w-3.5 h-3.5" />
                    <span>Vars</span>
                 </button>

                 {/* Alternador de Tema: WhatsApp x Typebot Web (Imagem 4) */}
                 <button
                    onClick={() => setSimulatorTheme(t => t === 'whatsapp' ? 'typebot_web' : 'whatsapp')}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                      simulatorTheme === 'whatsapp' 
                        ? 'bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700' 
                        : 'bg-zinc-200 text-zinc-700 hover:text-zinc-900 border border-zinc-300'
                    }`}
                    title="Alternar entre modo WhatsApp e Web Typebot"
                 >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{simulatorTheme === 'whatsapp' ? 'Web' : 'Zap'}</span>
                 </button>

                 <button 
                    onClick={handleRestart}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    title="Reiniciar Simulação"
                 >
                    <RotateCcw className="w-4 h-4" />
                 </button>
                 <button 
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="Fechar Preview"
                 >
                    <X className="w-4 h-4" />
                 </button>
             </div>
          </div>

          {showVarsDrawer && (
            <div className="bg-[#121216] border-b border-zinc-800 px-3 py-2.5 max-h-40 overflow-y-auto text-[11px] space-y-1 shrink-0 custom-scrollbar">
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-1">
                Variáveis em Memória ({Object.keys(variables).length})
              </div>
              <div className="grid grid-cols-1 gap-1">
                {Object.entries(variables)
                  .filter(([, val]) => val !== '')
                  .map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between gap-2 bg-zinc-900/90 px-2 py-1 rounded border border-zinc-800">
                      <span className="font-mono text-purple-300 truncate">{key}</span>
                      <span className="font-mono text-zinc-300 truncate max-w-[180px]">{String(val)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Área do Chat */}
          <div className={`flex-1 overflow-y-auto p-4 space-y-3 relative ${
            simulatorTheme === 'whatsapp' 
              ? 'bg-[#0b0e14]' 
              : 'bg-[#fafafa]'
          }`}>
              {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : m.sender === 'system' ? 'justify-center' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-200`}>
                      {m.sender === 'system' ? (
                          <div className={`text-[11px] font-medium px-3 py-1 rounded-full border shadow-sm backdrop-blur-sm text-center max-w-[90%] ${
                            simulatorTheme === 'whatsapp' 
                              ? 'bg-zinc-800/80 text-zinc-400 border-zinc-700/60' 
                              : 'bg-zinc-200 text-zinc-600 border-zinc-300'
                          }`}>
                              {m.text}
                          </div>
                      ) : m.sender === 'user' ? (
                          <div className={`px-3.5 py-2 rounded-2xl rounded-tr-xs max-w-[85%] text-xs shadow-md leading-relaxed whitespace-pre-wrap ${
                            simulatorTheme === 'whatsapp' 
                              ? 'bg-[#005c4b] text-white' 
                              : 'bg-blue-600 text-white'
                          }`}>
                              {parseTextToSegments(m.text).map((seg, i) => {
                                if (seg.type === 'url') {
                                  return (
                                    <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer" className="underline font-semibold text-emerald-200 hover:text-white inline-flex items-center gap-0.5">
                                      <span className="truncate max-w-[200px]">{seg.content}</span>
                                      <ExternalLink className="w-2.5 h-2.5 inline" />
                                    </a>
                                  );
                                }
                                return <span key={i}>{seg.content}</span>;
                              })}
                          </div>
                      ) : (
                          <div className="flex gap-2 max-w-[88%]">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-inner border ${
                                simulatorTheme === 'whatsapp' 
                                  ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' 
                                  : 'bg-blue-100 text-blue-600 border-blue-200'
                              }`}>
                                 <Bot className="w-3.5 h-3.5" />
                              </div>
                              <div className={`px-3.5 py-2.5 rounded-2xl rounded-tl-xs text-xs shadow-md leading-relaxed whitespace-pre-wrap border ${
                                simulatorTheme === 'whatsapp' 
                                  ? 'bg-[#202c33] border-zinc-800 text-zinc-100' 
                                  : 'bg-white border-zinc-200 text-zinc-800'
                              }`}>
                                  {parseTextToSegments(m.text).map((seg, i) => {
                                    if (seg.type === 'url') {
                                      return (
                                        <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer" className="underline font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-0.5">
                                          <span className="truncate max-w-[200px]">{seg.content}</span>
                                          <ExternalLink className="w-2.5 h-2.5 inline" />
                                        </a>
                                      );
                                    }
                                    return <span key={i}>{seg.content}</span>;
                                  })}
                              </div>
                          </div>
                      )}
                  </div>
              ))}
              
              <div ref={endOfMessagesRef} className="h-2" />
          </div>

          {/* Botões de Opções Clicáveis */}
          {activeButtonOptions.length > 0 && (
             <div className={`p-3 border-t flex flex-col gap-1.5 shrink-0 max-h-[190px] overflow-y-auto ${
               simulatorTheme === 'whatsapp' 
                 ? 'bg-[#18181b] border-zinc-800' 
                 : 'bg-zinc-50 border-zinc-200'
             }`}>
                 <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mb-0.5">Selecione uma opção:</p>
                 {activeButtonOptions.map((opt, i) => (
                     <button
                        key={i}
                        onClick={() => handleSelectOption(opt)}
                        className={`w-full text-left text-xs px-3 py-2 rounded-xl border transition-all font-medium flex items-center gap-2 group active:scale-[0.98] ${
                          simulatorTheme === 'whatsapp' 
                            ? 'bg-[#202025] hover:bg-indigo-600 hover:text-white text-zinc-200 border-zinc-700/60' 
                            : 'bg-white hover:bg-blue-600 hover:text-white text-zinc-800 border-zinc-300'
                        }`}
                     >
                         <CheckSquare className="w-3.5 h-3.5 text-indigo-400 group-hover:text-white shrink-0" />
                         <span className="truncate">{opt}</span>
                     </button>
                 ))}
             </div>
          )}

          {/* Input Footer */}
          <div className={`border-t p-3 shrink-0 ${
            simulatorTheme === 'whatsapp' 
              ? 'bg-[#202024] border-zinc-800' 
              : 'bg-zinc-100 border-zinc-200'
          }`}>
              <form onSubmit={handleSend} className="flex gap-2">
                  <input
                     type="text"
                     value={inputValue}
                     onChange={(e) => setInputValue(e.target.value)}
                     disabled={!isAwaitingInput}
                     placeholder={isAwaitingInput ? "Digite sua resposta ou número..." : "Aguardando fluxo..."}
                     className={`flex-1 rounded-full px-4 py-2.5 text-xs outline-none transition-all shadow-inner border ${
                       simulatorTheme === 'whatsapp' 
                         ? 'bg-[#121215] border-zinc-700 text-zinc-200 placeholder:text-zinc-500 focus:ring-2 focus:ring-indigo-500' 
                         : 'bg-white border-zinc-300 text-zinc-800 placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-500'
                     } disabled:opacity-50`}
                  />
                  <button
                     type="submit"
                     disabled={!isAwaitingInput || !inputValue.trim()}
                     className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 shrink-0 text-white ${
                       simulatorTheme === 'whatsapp' 
                         ? 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700' 
                         : 'bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-300'
                     } disabled:opacity-40`}
                     title="Enviar Mensagem"
                  >
                      <Send className="w-4 h-4 ml-0.5" />
                  </button>
              </form>

              {/* Marca D'água do Typebot como na Imagem 4 */}
              {simulatorTheme === 'typebot_web' && (
                <div className="flex justify-center mt-2">
                  <div className="text-[10px] text-zinc-500 bg-white border border-zinc-300 rounded px-2 py-0.5 font-medium shadow-2xl flex items-center gap-1">
                    <span>⚡ Made with Typebot Engine</span>
                  </div>
                </div>
              )}
          </div>
      </div>
    </div>
  );
}
