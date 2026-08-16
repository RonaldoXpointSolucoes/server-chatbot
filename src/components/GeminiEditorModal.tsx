import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Send, RefreshCcw, CheckCircle2, MessageSquare, Wand2, History, ShieldAlert, ClipboardList } from 'lucide-react';
import { cn } from '../pages/ChatDashboard'; // Utilizando className helper do ChatDashboard

interface GeminiEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalText: string;
  suggestedText: string;
  intent: 'grammar' | 'sales' | 'enchant' | 'support' | 'analyze' | null;
  isInternalNote?: boolean;
  onApply?: (finalText: string) => void;
  onSend: (finalText: string) => void;
}

export function GeminiEditorModal({ 
  isOpen, 
  onClose, 
  originalText, 
  suggestedText, 
  intent, 
  isInternalNote = false,
  onApply,
  onSend 
}: GeminiEditorModalProps) {
  const [editedText, setEditedText] = useState(suggestedText);
  const [activeTab, setActiveTab] = useState<'summary' | 'feedback'>('summary');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditedText(suggestedText);
    if (intent === 'analyze') {
      setActiveTab('summary');
    }
  }, [suggestedText, intent]);

  // Adjust height automatically
  useEffect(() => {
    if (textareaRef.current && isOpen) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [editedText, isOpen]);

  if (!isOpen) return null;

  const getIntentTitle = () => {
    switch(intent) {
      case 'grammar': return "Correção Gramatical";
      case 'sales': return "Foco em Vendas";
      case 'enchant': return "Encantar o Cliente";
      case 'support': return "Melhoria de Suporte";
      case 'analyze': return "Análise da Conversa e Feedback";
      default: return "Magia da IA";
    }
  };

  const gradientByIntent = () => {
    if (isInternalNote && intent !== 'analyze') {
      return "from-amber-500 via-amber-600 to-amber-700";
    }
    switch(intent) {
      case 'grammar': return "from-blue-500 to-indigo-500";
      case 'sales': return "from-emerald-500 to-teal-500";
      case 'enchant': return "from-pink-500 to-rose-500";
      case 'support': return "from-orange-500 to-amber-500";
      case 'analyze': return "from-purple-500 to-fuchsia-500";
      default: return "from-[#00a884] to-teal-500";
    }
  };

  const renderMarkdown = (text: string) => {
    if (!text) return null;
    return text.split('\n').map((line, idx) => {
      // Bold text formatting **bold**
      const boldParts = line.split(/(\*\*[^*]+\*\*)/g);
      const content = boldParts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={pIdx} className="font-extrabold text-[#111b21] dark:text-white">{part.slice(2, -2)}</strong>;
        }
        return part;
      });

      // List item formatting
      if (line.trim().startsWith('- ')) {
        return (
          <li key={idx} className="ml-4 list-disc pl-1 text-sm text-slate-700 dark:text-slate-200 leading-relaxed my-1">
            {content}
          </li>
        );
      }
      if (line.trim().startsWith('* ')) {
        return (
          <li key={idx} className="ml-4 list-disc pl-1 text-sm text-slate-700 dark:text-slate-200 leading-relaxed my-1">
            {content}
          </li>
        );
      }

      return (
        <p key={idx} className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed my-1.5 min-h-[1em]">
          {content}
        </p>
      );
    });
  };

  let summaryText = "";
  let feedbackText = "";
  if (intent === 'analyze') {
    const formatValue = (val: any): string => {
      if (val === null || val === undefined) return '';
      if (Array.isArray(val)) {
        return val.map(item => `- ${formatValue(item)}`).join('\n');
      }
      if (typeof val === 'object') {
        return Object.entries(val)
          .map(([key, value]) => `**${key}**: ${formatValue(value)}`)
          .join('\n');
      }
      return String(val);
    };

    try {
      const parsed = JSON.parse(suggestedText);
      summaryText = parsed.summary ? formatValue(parsed.summary) : "";
      feedbackText = parsed.feedback ? formatValue(parsed.feedback) : "";
    } catch (e) {
      summaryText = suggestedText;
      feedbackText = "Não foi possível extrair a análise de feedback estruturada. Consulte o resumo da conversa.";
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-[#111b21] rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300 border border-black/5 dark:border-white/5">
        
        {/* Banner Superior com Gradiente Dinâmico */}
        <div className={cn("h-24 sm:h-32 w-full bg-gradient-to-r relative", gradientByIntent())}>
           <div className="absolute inset-0 bg-black/10 dark:bg-black/20" />
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 dark:opacity-10 mix-blend-overlay" />
           
           <button 
             onClick={onClose}
             className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-colors"
           >
             <X size={18} />
           </button>

           <div className="absolute -bottom-6 left-6 sm:left-8">
             <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white dark:bg-[#202c33] rounded-2xl shadow-xl flex items-center justify-center p-1 border-4 border-white dark:border-[#111b21]">
                <div className={cn("w-full h-full rounded-xl flex items-center justify-center bg-gradient-to-tr text-white", gradientByIntent())}>
                  <Wand2 size={28} className="drop-shadow-md" />
                </div>
             </div>
           </div>
        </div>

        <div className="pt-10 sm:pt-12 px-6 sm:px-8 pb-3 flex-1 flex flex-col gap-6 min-h-0 overflow-y-auto custom-scrollbar">
          
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl sm:text-2xl font-bold text-[#111b21] dark:text-[#e9edef] flex items-center gap-2">
                {intent === 'analyze' 
                  ? "Análise e Feedback de IA" 
                  : isInternalNote 
                    ? "Anotação CRM Otimizada (Privada)" 
                    : "Sugestão de Resposta WhatsApp"}
              </h2>
            </div>

            {isInternalNote && intent !== 'analyze' && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase tracking-wider w-max mb-1.5 shadow-sm">
                <span>🔒</span> Privado CRM — Nunca será disparado no WhatsApp do cliente
              </div>
            )}

            <p className="text-sm text-[#54656f] dark:text-[#aebac1]">
              {intent === 'analyze' 
                ? "A IA realizou uma auditoria no histórico da conversa correspondente ao período selecionado."
                : isInternalNote
                  ? `A IA aprimorou o conteúdo da anotação interna (${getIntentTitle()}) para o CRM.`
                  : `A IA analisou sua intenção de ${getIntentTitle()} considerando o histórico da conversa.`}
            </p>
          </div>

          {intent === 'analyze' ? (
            <div className="flex flex-col gap-4">
              {/* Abas Premium */}
              <div className="flex items-center gap-2 p-1 bg-[#f0f2f5] dark:bg-[#202c33]/70 rounded-2xl border border-black/5 dark:border-white/5 select-none w-max">
                <button
                  type="button"
                  onClick={() => setActiveTab('summary')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95",
                    activeTab === 'summary'
                      ? "bg-white dark:bg-[#111b21] text-[#00a884] shadow-md shadow-black/5"
                      : "text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5"
                  )}
                >
                  <ClipboardList size={14} /> Histórico Resumido
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('feedback')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95",
                    activeTab === 'feedback'
                      ? "bg-white dark:bg-[#111b21] text-purple-600 dark:text-purple-400 shadow-md shadow-black/5"
                      : "text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5"
                  )}
                >
                  <ShieldAlert size={14} /> Diagnóstico & Falhas
                </button>
              </div>

              {/* Conteúdo da Aba Ativa */}
              <div className="bg-[#f0f2f5]/40 dark:bg-[#202c33]/40 p-5 rounded-3xl border border-black/5 dark:border-white/5 w-full min-h-[220px] max-h-[350px] overflow-y-auto custom-scrollbar select-text">
                {activeTab === 'summary' ? (
                  <div className="animate-in fade-in duration-300">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#00a884] mb-3 flex items-center gap-1.5">
                      <History size={14} /> Resumo Cronológico
                    </h3>
                    <div className="pl-1">
                      {renderMarkdown(summaryText)}
                    </div>
                  </div>
                ) : (
                  <div className="animate-in fade-in duration-300">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-3 flex items-center gap-1.5">
                      <ShieldAlert size={14} /> Auditoria e Falhas da Empresa
                    </h3>
                    <div className="pl-1">
                      {renderMarkdown(feedbackText)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Mensagem Original */}
              <div className="flex flex-col gap-2">
                <label className={cn(
                  "text-xs font-bold uppercase tracking-wider flex items-center gap-1.5",
                  isInternalNote ? "text-amber-700 dark:text-amber-400" : "text-[#54656f] dark:text-[#aebac1]"
                )}>
                  <MessageSquare size={14} /> {isInternalNote ? "Anotação Original" : "Sua Mensagem"}
                </label>
                <div className="bg-[#f0f2f5]/50 dark:bg-[#202c33]/50 p-4 rounded-2xl text-sm text-[#54656f] dark:text-[#8696a0] w-full min-h-[120px] max-h-[300px] overflow-y-auto custom-scrollbar border border-black/5 dark:border-white/5 whitespace-pre-wrap opacity-80 cursor-not-allowed font-medium">
                  {originalText}
                </div>
              </div>

              {/* Texto Sugerido / Editável */}
              <div className="flex flex-col gap-2">
                <label className={cn(
                  "text-xs font-bold uppercase tracking-wider flex items-center gap-1.5",
                  isInternalNote ? "text-amber-600 dark:text-amber-300" : "text-[#00a884]"
                )}>
                  <Sparkles size={14} /> {isInternalNote ? "Anotação Otimizada" : "Mensagem Otimizada"}
                </label>
                <div className={cn(
                  "relative group border-2 rounded-2xl bg-white dark:bg-[#202c33] shadow-inner transition-colors",
                  isInternalNote 
                    ? "border-amber-500/20 focus-within:border-amber-500/50" 
                    : "border-transparent focus-within:border-[#00a884]/30"
                )}>
                  <textarea
                    ref={textareaRef}
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="w-full bg-transparent p-4 min-h-[120px] max-h-[300px] text-sm text-[#111b21] dark:text-[#e9edef] resize-none outline-none custom-scrollbar rounded-2xl font-medium leading-relaxed"
                    placeholder="A IA não conseguiu gerar uma sugestão..."
                  />
                </div>
              </div>
            </div>
          )}

        </div>

        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 px-6 sm:px-8 pb-6 sm:pb-8 pt-4 border-t border-black/5 dark:border-white/5 shrink-0 bg-white dark:bg-[#111b21] w-full flex-wrap">
          <button 
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-medium text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer text-sm"
          >
            {intent === 'analyze' ? 'Fechar Relatório' : 'Cancelar'}
          </button>

          {/* Botão de Aplicar no Editor (sem salvar imediatamente) */}
          {intent !== 'analyze' && onApply && (
            <button 
              onClick={() => {
                onApply(editedText);
                onClose();
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm active:scale-95"
              title="Colocar o texto otimizado no editor para continuar editando"
            >
              <span>📥</span> Inserir no Editor
            </button>
          )}

          {intent !== 'analyze' && !onApply && (
            <button 
              onClick={() => {
                onSend(originalText);
                onClose();
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-medium text-[#111b21] dark:text-white bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex items-center justify-center gap-2 cursor-pointer text-sm"
            >
              {isInternalNote ? "Salvar Original" : "Enviar Original"}
            </button>
          )}

          <button 
            onClick={() => {
              if (intent !== 'analyze') {
                onSend(editedText);
              }
              onClose();
            }}
            className={cn(
              "w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-white shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer text-sm",
              isInternalNote && intent !== 'analyze'
                ? "bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-800 shadow-amber-500/20"
                : "bg-gradient-to-r from-[#00a884] to-teal-500 hover:from-teal-500 hover:to-emerald-500"
            )}
          >
             {intent === 'analyze' 
               ? <><CheckCircle2 size={18} /> Entendido</> 
               : isInternalNote 
                 ? <><Send size={16} className="translate-x-0.5" /> Salvar Anotação CRM</>
                 : <><Send size={18} className="translate-x-0.5" /> Enviar Otimizada</>}
          </button>
        </div>
      </div>
    </div>
  );
}

