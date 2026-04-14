import React, { useState, useEffect, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';
import { Play, X, Send, Bot, RefreshCcw, User } from 'lucide-react';

interface TestSimulatorProps {
  nodes: Node[];
  edges: Edge[];
  onClose: () => void;
}

type Message = {
  id: string;
  sender: 'bot' | 'user' | 'system';
  text: string;
};

export default function TestSimulator({ nodes, edges, onClose }: TestSimulatorProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentBlock, setCurrentBlock] = useState<any>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [isAwaitingInput, setIsAwaitingInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isRestarting, setIsRestarting] = useState(false);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Scrolla para o fim sempre que surgir mensagem nova
  useEffect(() => {
    if (endOfMessagesRef.current) {
        endOfMessagesRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAwaitingInput]);

  const findStartBlock = (): any | null => {
      let startGroup = nodes.find(n => n.type === 'typebot_group' && n.data?.blocks?.some((b:any) => b.label === 'Início' || b.flowType === 'start' || b.id?.includes('start')));
      
      if (!startGroup) {
          const targetGroupsIds = edges.map(e => e.target);
          const startCandidates = nodes.filter(n => !targetGroupsIds.includes(n.id) && n.type === 'typebot_group');
          if (startCandidates.length > 0) {
              startCandidates.sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
              startGroup = startCandidates[0];
          }
      }

      if (!startGroup) startGroup = nodes[0];
      if (startGroup && startGroup.data?.blocks?.length > 0) return startGroup.data.blocks[0];
      return null;
  };

  const pushMessage = (sender: 'bot' | 'user' | 'system', text: string) => {
      setMessages(prev => [...prev, { id: Math.random().toString(36).substring(7), sender, text }]);
  };

  const parseText = (text: string, vars: Record<string, string>) => {
      return text.replace(/\\{\\{([^}]+)\\}\\}/g, (_, param) => vars[param.trim()] || '');
  };

  const getNextBlock = (currBlockId: string) => {
      const parentGroup = nodes.find(n => n.data?.blocks?.some((b: any) => b.id === currBlockId));
      if (parentGroup) {
          const blocks = parentGroup.data.blocks;
          const idx = blocks.findIndex((b: any) => b.id === currBlockId);
          if (idx !== -1 && idx < blocks.length - 1) {
              return blocks[idx + 1];
          }
      }

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

  const autoAdvance = (currBlockId: string, delay = 800) => {
      setTimeout(() => {
          const next = getNextBlock(currBlockId);
          if (next) {
              setCurrentBlock(next);
          } else {
              pushMessage('system', 'Fim do Fluxo');
              setCurrentBlock(null);
          }
      }, delay);
  };

  useEffect(() => {
     if (!currentBlock || isRestarting) return;

     const flowType = currentBlock.flowType;

     // 1. Outputs & Mídias
     if (['send_message', 'image', 'video', 'audio', 'embed'].includes(flowType)) {
         const baseText = currentBlock.text 
            ? currentBlock.text 
            : currentBlock.url 
               ? `[Mídia ${flowType.toUpperCase()}: ${currentBlock.url}]`
               : `[Mídia Vazia: ${flowType}]`;
         const text = parseText(baseText, variables);
         pushMessage('bot', text);
         autoAdvance(currentBlock.id);
     } 
     // 2. Text Inputs em Geral
     else if (['ask', 'number_input', 'email_input', 'website_input', 'phone_input', 'date_input', 'time_input', 'payment', 'rating', 'file_input'].includes(flowType)) {
         let baseText = currentBlock.text || `[Solicitando: ${flowType}]`;
         if (flowType === 'ask') {
             const extras = [];
             if (currentBlock.long_text) extras.push('Texto Longo');
             if (currentBlock.input_mode && currentBlock.input_mode !== 'text') extras.push(`Modo: ${currentBlock.input_mode}`);
             if (currentBlock.allow_attachments) extras.push('Anexos Habilitados');
             if (currentBlock.allow_audio_clips) extras.push('Áudio Habilitado');
             if (extras.length > 0) {
                 baseText += `\n[${extras.join(' | ')}]`;
             }
         }
         const text = parseText(baseText, variables);
         pushMessage('bot', text);
         setIsAwaitingInput(true);
     }
     // 3. Choice Inputs (Botões / Cards)
     else if (['buttons', 'pic_choice', 'cards'].includes(flowType)) {
         const label = currentBlock.label || `[Selecionar: ${flowType}]`;
         const optsStr = (currentBlock.options || ['Opção 1', 'Opção 2'])
             .map((o: string) => `[👉 ${o}]`).join('  ');
         const text = `${label}\n\n${optsStr}`;
         pushMessage('bot', text);
         setIsAwaitingInput(true);
     }
     // 4. Lógicas Síncronas (Set Variable)
     else if (flowType === 'set_variable') {
         const { var_name, text } = currentBlock;
         if (var_name && text) {
             setVariables(prev => ({ ...prev, [var_name as string]: text }));
         }
         autoAdvance(currentBlock.id, 100);
     }
     // 5. Conditionals and Routing
     else if (flowType === 'condition') {
          pushMessage('system', `Verificando condição: ${currentBlock.condition_expr || '(Vazio)'}`);
          autoAdvance(currentBlock.id, 400); // Simulando passagem direta por enquanto
     }
     // 6. Timers
     else if (flowType === 'wait') {
          const waitTime = currentBlock.wait_time ? Number(currentBlock.wait_time) : 2;
          pushMessage('system', `⏳ Aguardando ${waitTime}s...`);
          autoAdvance(currentBlock.id, waitTime * 1000);
     }
     // 7. Integrações Síncronas Transpassadas Localmente
     else if (['webhook', 'script', 'typebot_link', 'redirect', 'ab_test', 'jump', 'return'].includes(flowType)) {
          pushMessage('system', `⚡ Executando lógico simulado: ${flowType.toUpperCase()}`);
          autoAdvance(currentBlock.id, 500);
     }
     // 8. Handoff
     else if (flowType === 'handoff') {
         pushMessage('system', 'Transbordo de atendimento (Humano Acionado).');
         setCurrentBlock(null);
     }
     // Padrão Fallback
     else {
         autoAdvance(currentBlock.id, 100);
     }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBlock]);

  const handleRestart = () => {
      setIsRestarting(true);
      setMessages([]);
      setVariables({});
      setIsAwaitingInput(false);
      setInputValue('');
      setCurrentNodeId(null);

      setTimeout(() => {
        setIsRestarting(false);
        const start = findStartBlock();
        if (start) {
            pushMessage('system', 'Simulação Iniciada. Interagindo com nó inicial.');
            setCurrentBlock(start);
        } else {
            pushMessage('system', 'Nenhum nó de entrada encontrado no fluxo.');
        }
      }, 500);
  }

  // Auto-init on Mount
  useEffect(() => {
      handleRestart();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!inputValue.trim() || !isAwaitingInput || !currentBlock) return;

      const text = inputValue.trim();
      pushMessage('user', text);
      setInputValue('');
      setIsAwaitingInput(false);

      if (currentBlock.var_name) {
          setVariables(prev => ({ ...prev, [currentBlock.var_name as string]: text }));
      }

      autoAdvance(currentBlock.id, 400);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      {/* Container Principal Mobile Scale */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden w-full max-w-[380px] h-[750px] max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="bg-slate-800/80 backdrop-blur-xl border-b border-slate-700/50 p-4 flex items-center justify-between z-10 shrink-0">
             <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center shadow-inner">
                     <Bot className="w-5 h-5" />
                 </div>
                 <div>
                     <h3 className="font-bold text-slate-200 text-sm">Preview do Fluxo</h3>
                     <p className="text-xs text-emerald-400 flex items-center gap-1">
                         <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online
                     </p>
                 </div>
             </div>
             <div className="flex items-center gap-1">
                 <button 
                    onClick={handleRestart}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
                 >
                     <RefreshCcw className="w-4 h-4" />
                 </button>
                 <button 
                    onClick={onClose}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                 >
                     <X className="w-5 h-5" />
                 </button>
             </div>
          </div>

          {/* Area do Chat (Fundo WhatsAppish Premium) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0B141A] relative" style={{ backgroundImage: "radial-gradient(ellipse at center, rgba(30,41,59,0.3) 0%, rgba(15,23,42,0) 80%)" }}>
              {messages.map((m, i) => (
                  <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : m.sender === 'system' ? 'justify-center' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                      {m.sender === 'system' ? (
                          <div className="bg-slate-800/60 text-slate-400 text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-full border border-slate-700/50 shadow-sm backdrop-blur-sm">
                              {m.text}
                          </div>
                      ) : m.sender === 'user' ? (
                          <div className="bg-emerald-600 text-emerald-50 px-4 py-2.5 rounded-2xl rounded-br-sm max-w-[85%] text-sm shadow-md">
                              {m.text}
                          </div>
                      ) : (
                          <div className="flex gap-2 max-w-[85%]">
                              <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 mt-1 shadow-inner border border-indigo-500/30">
                                 <Bot className="w-3.5 h-3.5" />
                              </div>
                              <div className="bg-slate-800 border border-slate-700/50 text-slate-200 px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm shadow-md whitespace-pre-wrap">
                                  {m.text}
                              </div>
                          </div>
                      )}
                  </div>
              ))}
              
              {/* Typing Indicator if node is waiting implicitly (optional) */}
              
              <div ref={endOfMessagesRef} className="h-2" />
          </div>

          {/* Input Footer */}
          <div className="bg-slate-800 border-t border-slate-700/50 p-4 shrink-0 transition-all duration-300">
              <form onSubmit={handleSend} className="flex gap-2">
                  <input
                     type="text"
                     value={inputValue}
                     onChange={(e) => setInputValue(e.target.value)}
                     disabled={!isAwaitingInput}
                     placeholder={isAwaitingInput ? "Digite sua resposta..." : "Aguardando fluxo..."}
                     className="flex-1 bg-slate-900 border border-slate-700/50 rounded-full px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 transition-all shadow-inner"
                  />
                  <button
                     type="submit"
                     disabled={!isAwaitingInput || !inputValue.trim()}
                     className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all shadow-lg active:scale-95 shrink-0"
                  >
                      <Send className="w-5 h-5 ml-1" />
                  </button>
              </form>
          </div>
      </div>
    </div>
  );
}
