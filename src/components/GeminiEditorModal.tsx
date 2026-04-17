import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Send, RefreshCcw, CheckCircle2, MessageSquare, Wand2 } from 'lucide-react';
import { cn } from '../pages/ChatDashboard'; // Utilizando className helper do ChatDashboard

interface GeminiEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalText: string;
  suggestedText: string;
  intent: 'grammar' | 'sales' | 'enchant' | 'support' | null;
  onSend: (finalText: string) => void;
}

export function GeminiEditorModal({ isOpen, onClose, originalText, suggestedText, intent, onSend }: GeminiEditorModalProps) {
  const [editedText, setEditedText] = useState(suggestedText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditedText(suggestedText);
  }, [suggestedText]);

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
      default: return "Magia da IA";
    }
  };

  const gradientByIntent = () => {
    switch(intent) {
      case 'grammar': return "from-blue-500 to-indigo-500";
      case 'sales': return "from-emerald-500 to-teal-500";
      case 'enchant': return "from-pink-500 to-rose-500";
      case 'support': return "from-orange-500 to-amber-500";
      default: return "from-[#00a884] to-teal-500";
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#111b21] rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-300 border border-black/5 dark:border-white/5">
        
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

        <div className="pt-10 sm:pt-12 px-6 sm:px-8 pb-6 sm:pb-8 flex flex-col gap-6">
          
          <div className="flex flex-col">
            <h2 className="text-xl sm:text-2xl font-bold text-[#111b21] dark:text-[#e9edef] flex items-center gap-2">
              Sugestão de Resposta
            </h2>
            <p className="text-sm text-[#54656f] dark:text-[#aebac1]">
              A IA analisou sua intenção de <strong>{getIntentTitle()}</strong> considerando o histórico da conversa.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mensagem Original */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[#54656f] dark:text-[#aebac1] uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare size={14} /> Sua Mensagem
              </label>
              <div className="bg-[#f0f2f5]/50 dark:bg-[#202c33]/50 p-4 rounded-2xl text-sm text-[#54656f] dark:text-[#8696a0] w-full min-h-[120px] max-h-[300px] overflow-y-auto custom-scrollbar border border-black/5 dark:border-white/5 whitespace-pre-wrap opacity-80 cursor-not-allowed">
                {originalText}
              </div>
            </div>

            {/* Texto Sugerido / Editável */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-[#00a884] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} /> Mensagem Otimizada
              </label>
              <div className="relative group border-2 border-transparent focus-within:border-[#00a884]/30 rounded-2xl bg-white dark:bg-[#202c33] shadow-inner transition-colors">
                <textarea
                  ref={textareaRef}
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="w-full bg-transparent p-4 min-h-[120px] max-h-[300px] text-sm text-[#111b21] dark:text-[#e9edef] resize-none outline-none custom-scrollbar rounded-2xl font-medium"
                  placeholder="A IA não conseguiu gerar uma sugestão..."
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 mt-4 pt-4 border-t border-black/5 dark:border-white/5">
            <button 
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-medium text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={() => {
                onSend(originalText);
                onClose();
              }}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-medium text-[#111b21] dark:text-white bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
            >
              Enviar Original
            </button>
            <button 
              onClick={() => {
                onSend(editedText);
                onClose();
              }}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-[#00a884] to-teal-500 hover:from-teal-500 hover:to-emerald-500 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95"
            >
               <Send size={18} className="translate-x-0.5" /> Enviar Otimizada
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
