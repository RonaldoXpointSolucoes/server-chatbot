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
  ChevronDown
} from 'lucide-react';
import { Node, Edge } from '@xyflow/react';

interface TestSimulatorProps {
  nodes: Node[];
  edges: Edge[];
  onClose: () => void;
}

interface Message {
  id: string;
  sender: 'bot' | 'user' | 'system';
  text: string;
}

const DEFAULT_SIMULATOR_VARS: Record<string, string> = {
  pushName: 'Ronaldo Clemente',
  saudacao: 'Boa tarde',
  NomeEmpresa: 'Burguer Plus',
  cardapio: 'https://burguerplus.com.br',
  GoogleMaps: 'https://maps.app.goo.gl/6souriEL2Fnmk9bh8',
  EnderecoEmpresa: 'Praça Miguel Ortega, 380 - Parque Assuncao, Taboão da Serra - SP, 06754-160',
  DiaFuncionamento: 'Segunda a Sábado',
  HoraFuncionamento: '11:00h às 22:45h',
  NumeroTelefoneEmpresa: '(11) 94321-6659',
  AbertoFechado: 'true',
  NumeroMenu: '1',
  message: 'Olá, gostaria de fazer um pedido'
};

export default function TestSimulator({ nodes, edges, onClose }: TestSimulatorProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentBlock, setCurrentBlock] = useState<any>(null);
  const [variables, setVariables] = useState<Record<string, string>>(DEFAULT_SIMULATOR_VARS);
  const [isAwaitingInput, setIsAwaitingInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isRestarting, setIsRestarting] = useState(false);
  const [activeButtonOptions, setActiveButtonOptions] = useState<string[]>([]);
  const [simulatorTheme, setSimulatorTheme] = useState<'whatsapp' | 'typebot_web'>('whatsapp');

  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Rola para a mensagem mais recente
  useEffect(() => {
    if (endOfMessagesRef.current) {
      endOfMessagesRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAwaitingInput, activeButtonOptions]);

  const findStartBlock = (): any | null => {
    // 1. Procura grupo com bloco de Início
    let startGroup = nodes.find(n => n.type === 'typebot_group' && (
      n.data?.label?.toLowerCase().includes('início') ||
      n.data?.label?.toLowerCase().includes('inicio') ||
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
      const startCandidates = nodes.filter(n => !targetGroupsIds.includes(n.id) && (n.type === 'typebot_group' || n.type === 'custom'));
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
        label: startGroup.data?.label || 'Início',
        text: startGroup.data?.message || startGroup.data?.label || ''
      };
    }
    return null;
  };

  const pushMessage = (sender: 'bot' | 'user' | 'system', text: string) => {
    setMessages(prev => [...prev, { id: Math.random().toString(36).substring(7), sender, text }]);
  };

  const parseText = (text: string, vars: Record<string, string>) => {
    if (!text) return '';
    return text.replace(/\{\{?([^}]+)\}?\}/g, (_, param) => {
      const key = param.trim();
      return vars[key] !== undefined ? vars[key] : `{{${key}}}`;
    });
  };

  // Encontra o próximo bloco seguindo o encadeamento interno ou arestas
  const getNextBlock = (currBlockId: string, userInputOption?: string) => {
    const parentGroup = nodes.find(n => n.data?.blocks?.some((b: any) => b.id === currBlockId) || n.id === currBlockId);
    
    // Se o bloco atual for um Jump
    if (currentBlock?.flowType === 'jump') {
      const targetId = currentBlock.target_group_id;
      const targetName = currentBlock.target_group_name;

      if (targetId) {
        const targetNode = nodes.find(n => n.id === targetId);
        if (targetNode && targetNode.data?.blocks?.length > 0) return targetNode.data.blocks[0];
      }
      if (targetName) {
        const targetNode = nodes.find(n => n.data?.label?.toLowerCase().includes(targetName.toLowerCase()));
        if (targetNode && targetNode.data?.blocks?.length > 0) return targetNode.data.blocks[0];
      }

      const jumpEdge = edges.find(e => e.sourceHandle === currBlockId || (parentGroup && e.source === parentGroup.id));
      if (jumpEdge) {
        const targetNode = nodes.find(n => n.id === jumpEdge.target);
        if (targetNode && targetNode.data?.blocks?.length > 0) return targetNode.data.blocks[0];
      }

      const start = findStartBlock();
      if (start) return start;
    }

    // Se o bloco atual for uma Condição com Itens (Typebot Pattern)
    if (currentBlock?.flowType === 'condition' && currentBlock.items && Array.isArray(currentBlock.items)) {
      for (const item of currentBlock.items) {
        const varVal = String(variables[item.varName] ?? '').trim().toLowerCase();
        const targetVal = String(item.value ?? '').trim().toLowerCase();
        
        let matches = false;
        if (item.operator === '=' || item.operator === 'Equal to') {
          matches = varVal === targetVal;
        } else if (item.operator === '≠' || item.operator === 'Not equal') {
          matches = varVal !== targetVal;
        } else {
          matches = varVal === targetVal;
        }

        if (matches) {
          const matchedEdge = edges.find(e => e.sourceHandle === item.id);
          if (matchedEdge) {
            const targetNode = nodes.find(n => n.id === matchedEdge.target);
            if (targetNode && targetNode.data?.blocks?.length > 0) return targetNode.data.blocks[0];
          }
        }
      }

      // Senão / Fallback
      const elseEdge = edges.find(e => e.sourceHandle === `${currBlockId}-else` || (e.sourceHandle === currBlockId && !currentBlock.items.some((i: any) => i.id === e.sourceHandle)));
      if (elseEdge) {
        const targetNode = nodes.find(n => n.id === elseEdge.target);
        if (targetNode && targetNode.data?.blocks?.length > 0) return targetNode.data.blocks[0];
      }
    }

    // Se estiver em um menu / buttons / opções e o usuário escolheu algo
    if (userInputOption) {
      const cleanInput = userInputOption.trim().toLowerCase();
      const numMatch = cleanInput.match(/^(\d+)/);
      const optNum = numMatch ? numMatch[1] : cleanInput;
      const optionIndex = parseInt(optNum, 10) - 1;

      // 1. Tenta achar aresta com handle de opção específico
      let matchingEdge = edges.find(e => 
        (e.source === parentGroup?.id || e.sourceHandle === currBlockId) &&
        (e.sourceHandle === `${currBlockId}-opt-${optionIndex}` || e.sourceHandle === `${currBlockId}-cond-${optionIndex}`)
      );
      
      // 2. Tenta achar por label da aresta
      if (!matchingEdge) {
        matchingEdge = edges.find(e => {
          if (!e.label) return false;
          const l = e.label.toLowerCase();
          return l.includes(`numeromenu - ${optNum}`) || 
                 l.startsWith(`${optNum} -`) || 
                 l.startsWith(`${optNum}.`) || 
                 l.startsWith(`${optNum} `) ||
                 l.includes(cleanInput);
        });
      }

      // 3. Fallback: pega a N-ésima aresta saindo do bloco/grupo correspondente ao índice da opção
      if (!matchingEdge && !isNaN(optionIndex) && optionIndex >= 0) {
        const outgoingEdges = edges.filter(e => e.sourceHandle === currBlockId || (parentGroup && e.source === parentGroup.id));
        if (outgoingEdges[optionIndex]) {
          matchingEdge = outgoingEdges[optionIndex];
        }
      }

      if (matchingEdge) {
        const targetNode = nodes.find(n => n.id === matchingEdge.target);
        if (targetNode && targetNode.data?.blocks?.length > 0) {
          return targetNode.data.blocks[0];
        }
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

    // Aresta saindo do bloco atual ou do grupo pai
    let outgoingEdge = edges.find(e => e.sourceHandle === currBlockId);
    if (!outgoingEdge && parentGroup) {
      outgoingEdge = edges.find(e => e.source === parentGroup.id);
    }

    if (outgoingEdge) {
      const targetGroupId = outgoingEdge.target;
      const targetGroup = nodes.find(n => n.id === targetGroupId);
      if (targetGroup && targetGroup.data?.blocks?.length > 0) {
        return targetGroup.data.blocks[0];
      }
    }

    return null;
  };

  const autoAdvance = (currBlockId: string, delay = 600, userInputOption?: string) => {
    setTimeout(() => {
      const next = getNextBlock(currBlockId, userInputOption);
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

    // 1. Mensagens de Texto & Mídias
    if (['send_message', 'image', 'video', 'audio', 'embed'].includes(flowType)) {
      const baseText = currentBlock.text 
        ? currentBlock.text 
        : currentBlock.url 
          ? `[Mídia ${flowType.toUpperCase()}: ${currentBlock.url}]`
          : `[Mídia: ${flowType}]`;
      const text = parseText(baseText, variables);
      pushMessage('bot', text);
      autoAdvance(currentBlock.id, 700);
    } 
    // 2. Inputs de Texto e Formulários
    else if (['ask', 'number_input', 'email_input', 'website_input', 'phone_input', 'date_input', 'time_input', 'payment', 'rating', 'file_input'].includes(flowType)) {
      const baseText = currentBlock.text || `Digite seu ${currentBlock.label || flowType}:`;
      const text = parseText(baseText, variables);
      pushMessage('bot', text);

      // Verifica se o próximo bloco é uma Condition com items para sugerir botões interativos
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

      setIsAwaitingInput(true);
    }
    // 3. Botões e Menus de Opções
    else if (['buttons', 'pic_choice', 'cards'].includes(flowType)) {
      if (currentBlock.text) {
        pushMessage('bot', parseText(currentBlock.text, variables));
      }
      const opts = currentBlock.options || ['1 - Opção 1', '2 - Opção 2'];
      setActiveButtonOptions(opts);
      setIsAwaitingInput(true);
    }
    // 4. Set Variable
    else if (flowType === 'set_variable') {
      const { var_name, text } = currentBlock;
      if (var_name && text) {
        setVariables(prev => ({ ...prev, [var_name as string]: parseText(text, prev) }));
      }
      autoAdvance(currentBlock.id, 80);
    }
    // 5. Jump (Retorno ao Menu ou Outro Grupo)
    else if (flowType === 'jump') {
      pushMessage('system', `↪️ Retornando para ${currentBlock.target_group_name || 'Menu'}...`);
      autoAdvance(currentBlock.id, 500);
    }
    // 6. Condicionais
    else if (flowType === 'condition') {
      autoAdvance(currentBlock.id, 200, variables['NumeroMenu']);
    }
    // 7. Espera / Delay
    else if (flowType === 'wait') {
      const waitTime = currentBlock.wait_time ? Number(currentBlock.wait_time) : 2;
      pushMessage('system', `⏳ Aguardando ${waitTime}s...`);
      autoAdvance(currentBlock.id, Math.min(waitTime * 1000, 3000)); // Cap de 3s no simulador para agilidade
    }
    // 8. Webhook / GET
    else if (flowType === 'webhook') {
      const respVar = currentBlock.response_var_name || 'AbertoFechado';
      setVariables(prev => ({ ...prev, [respVar]: 'true' }));
      pushMessage('system', `⚡ Webhook GET: ${currentBlock.url || 'API'} (200 OK) -> ${respVar} = true`);
      autoAdvance(currentBlock.id, 400);
    }
    // 9. Start Block
    else if (flowType === 'start') {
      autoAdvance(currentBlock.id, 200);
    }
    // 10. Handoff
    else if (flowType === 'handoff') {
      pushMessage('system', '👤 Atendimento transferido para atendente humano.');
      setCurrentBlock(null);
    }
    // Padrão Fallback
    else {
      autoAdvance(currentBlock.id, 200);
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBlock]);

  const handleRestart = () => {
    setIsRestarting(true);
    setMessages([]);
    setVariables(DEFAULT_SIMULATOR_VARS);
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
    }, 400);
  };

  useEffect(() => {
    handleRestart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectOption = (optionText: string) => {
    if (!currentBlock) return;
    
    const match = optionText.match(/^(\d+)/);
    const selectedValue = match ? match[1] : optionText;

    pushMessage('user', optionText);
    setActiveButtonOptions([]);
    setIsAwaitingInput(false);

    const varName = currentBlock.var_name || 'NumeroMenu';
    setVariables(prev => ({ ...prev, [varName]: selectedValue }));

    autoAdvance(currentBlock.id, 400, selectedValue);
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || !isAwaitingInput || !currentBlock) return;

    const text = inputValue.trim();
    pushMessage('user', text);
    setInputValue('');
    setActiveButtonOptions([]);
    setIsAwaitingInput(false);

    const varName = currentBlock.var_name || 'NumeroMenu';
    setVariables(prev => ({ ...prev, [varName]: text }));

    autoAdvance(currentBlock.id, 400, text);
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
                              {m.text}
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
                                  {m.text}
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
