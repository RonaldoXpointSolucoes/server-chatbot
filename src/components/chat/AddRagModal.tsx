import React, { useState, useEffect } from 'react';
import { 
  X, 
  BrainCircuit, 
  Sparkles, 
  Check, 
  Loader2, 
  FileText, 
  HelpCircle, 
  Tag, 
  ShieldCheck, 
  Zap, 
  AlertTriangle 
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { geminiService } from '../../services/geminiService';
import { cn } from '../../pages/ChatDashboard';

export interface AddRagModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuestion?: string;
  initialAnswer?: string | null;
  initialType?: 'qa' | 'knowledge';
  sourceMessageIds?: string[];
  onSaved?: () => void;
}

export const AddRagModal: React.FC<AddRagModalProps> = ({
  isOpen,
  onClose,
  initialQuestion = '',
  initialAnswer = '',
  initialType = 'qa',
  sourceMessageIds = [],
  onSaved
}) => {
  const [entryType, setEntryType] = useState<'qa' | 'knowledge'>(initialType);
  const [question, setQuestion] = useState(initialQuestion);
  const [answer, setAnswer] = useState(initialAnswer || '');
  const [knowledgeText, setKnowledgeText] = useState(initialQuestion || '');
  const [category, setCategory] = useState('Atendimento Geral');
  const [isEnhancingWithAi, setIsEnhancingWithAi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEntryType(initialType);
      setQuestion(initialQuestion);
      setAnswer(initialAnswer || '');
      setKnowledgeText(initialQuestion || '');
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, initialQuestion, initialAnswer, initialType]);

  if (!isOpen) return null;

  const categories = [
    'Atendimento Geral',
    'Cardápio & Preços',
    'Formas de Pagamento',
    'Horários & Localização',
    'Políticas & Entregas',
    'Suporte Técnico & Dúvidas',
    'Instruções Internas'
  ];

  // Melhorar resposta ou conhecimento com Inteligência Artificial
  const handleEnhanceWithAi = async () => {
    const textToEnhance = entryType === 'qa' ? answer : knowledgeText;
    if (!textToEnhance.trim()) {
      setErrorMessage('Digite ou selecione um texto para a IA aprimorar.');
      return;
    }

    try {
      setIsEnhancingWithAi(true);
      setErrorMessage(null);
      const enhanced = await geminiService.enhanceMessage(
        textToEnhance,
        'support',
        entryType === 'qa' && question ? [{ role: 'Cliente', text: question }] : []
      );

      if (enhanced) {
        if (entryType === 'qa') {
          setAnswer(enhanced);
        } else {
          setKnowledgeText(enhanced);
        }
      }
    } catch (err: any) {
      console.error('Erro ao aprimorar texto com IA:', err);
      setErrorMessage('Não foi possível conectar com a IA no momento. ' + (err?.message || ''));
    } finally {
      setIsEnhancingWithAi(false);
    }
  };

  // Salvar no RAG do Servidor / Supabase
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (entryType === 'qa') {
      if (!question.trim()) {
        setErrorMessage('Por favor, preencha a Pergunta do cliente.');
        return;
      }
      if (!answer.trim()) {
        setErrorMessage('Por favor, preencha a Resposta recomendada do Robô/Atendente.');
        return;
      }
    } else {
      if (!knowledgeText.trim()) {
        setErrorMessage('Por favor, preencha o conteúdo do Conhecimento / Regra.');
        return;
      }
    }

    try {
      setIsSaving(true);

      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || localStorage.getItem('tenantId') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
      const currentUserEmail = sessionStorage.getItem('current_user_email') || localStorage.getItem('current_user_email') || 'atendente';
      const currentUserName = sessionStorage.getItem('current_user_name') || localStorage.getItem('current_user_name') || currentUserEmail;
      const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

      const timestamp = new Date().toISOString();
      const cleanCategory = category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "_");
      const fileName = `rag_${entryType}_${cleanCategory}_${Date.now()}.txt`;

      let formattedContent = '';
      if (entryType === 'qa') {
        formattedContent = `=====================================================
BASE DE CONHECIMENTO RAG - PERGUNTA & RESPOSTA (Q&A)
Categoria: ${category}
Data de Criação: ${new Date().toLocaleString('pt-BR')}
Criado Por: ${currentUserName} (${currentUserEmail})
Mensagens de Origem: ${sourceMessageIds.join(', ') || 'Chat'}
=====================================================

[PERGUNTA DO CLIENTE]:
${question.trim()}

[RESPOSTA OFICIAL / RECOMENDADA]:
${answer.trim()}
`;
      } else {
        formattedContent = `=====================================================
BASE DE CONHECIMENTO RAG - REGRA / CONHECIMENTO AVULSO
Categoria: ${category}
Data de Criação: ${new Date().toLocaleString('pt-BR')}
Criado Por: ${currentUserName} (${currentUserEmail})
Mensagens de Origem: ${sourceMessageIds.join(', ') || 'Chat'}
=====================================================

[CONTEÚDO / REGRA DE NEGÓCIO]:
${knowledgeText.trim()}
`;
      }

      // 1. Enviar para o Motor de Vetorização do Backend RAG
      const virtualFile = new File([formattedContent], fileName, { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', virtualFile);

      let uploadSuccess = false;
      try {
        const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/upload`, {
          method: 'POST',
          headers: {
            'x-tenant-id': tenantId
          },
          body: formData
        });

        if (response.ok) {
          uploadSuccess = true;
        }
      } catch (engineErr) {
        console.warn('[AddRagModal] Falha ao enviar para o endpoint do motor RAG, salvando registro no Supabase:', engineErr);
      }

      // 2. Registro no Log de Auditoria do Sistema
      await supabase.from('system_logs').insert([{
        type: 'RAG Knowledge Added',
        message: `Novo item de RAG (${entryType === 'qa' ? 'Q&A' : 'Conhecimento'}) adicionado por ${currentUserName}: "${entryType === 'qa' ? question.slice(0, 60) : knowledgeText.slice(0, 60)}..."`,
        level: 'info',
        payload: {
          action: 'rag_entry_added',
          type: entryType,
          category,
          question: entryType === 'qa' ? question : null,
          answer: entryType === 'qa' ? answer : null,
          knowledge: entryType === 'knowledge' ? knowledgeText : null,
          source_message_ids: sourceMessageIds,
          user_email: currentUserEmail,
          user_name: currentUserName,
          engine_upload_status: uploadSuccess ? 'success' : 'fallback'
        },
        company_id: tenantId,
        created_at: timestamp
      }]).catch(() => {});

      setSuccessMessage('Conhecimento adicionado e vetorizado com sucesso na Base de Conhecimento RAG!');
      onSaved?.();

      setTimeout(() => {
        onClose();
      }, 1200);

    } catch (err: any) {
      console.error('Erro ao salvar no RAG:', err);
      setErrorMessage('Falha ao salvar no RAG: ' + (err?.message || 'Erro de rede ou banco de dados.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[99999] flex items-end sm:items-center justify-center p-0 sm:p-4 select-none animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#111b21] w-full max-w-xl rounded-t-[32px] sm:rounded-[28px] border-t sm:border border-slate-200/50 dark:border-white/10 overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] flex flex-col max-h-[94vh] transition-all animate-in zoom-in-95 duration-200">
        
        {/* Handle do Mobile */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-2.5 sm:hidden shrink-0" />

        {/* Header do Modal */}
        <div className="px-6 py-4 sm:py-5 border-b border-slate-200/50 dark:border-white/5 bg-gradient-to-r from-purple-500/10 via-indigo-500/5 to-transparent flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shadow-inner ring-4 ring-purple-500/10">
              <BrainCircuit size={22} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white font-sans uppercase tracking-wider flex items-center gap-2">
                Adicionar ao RAG / I.A
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Treine o robô com perguntas, respostas e regras do chat
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={isSaving}
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Seletor de Abas / Tipo */}
        <div className="px-6 pt-4 pb-2 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-[#182229]/50 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setEntryType('qa');
              setErrorMessage(null);
            }}
            className={cn(
              "flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[44px]",
              entryType === 'qa'
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                : "bg-white dark:bg-[#202c33] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200/50 dark:border-white/5"
            )}
          >
            <HelpCircle size={14} />
            Pergunta & Resposta (Q&A)
          </button>
          <button
            type="button"
            onClick={() => {
              setEntryType('knowledge');
              setErrorMessage(null);
            }}
            className={cn(
              "flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[44px]",
              entryType === 'knowledge'
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                : "bg-white dark:bg-[#202c33] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200/50 dark:border-white/5"
            )}
          >
            <FileText size={14} />
            Conhecimento Avulso / Regra
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs text-left">
            
            {/* Categoria */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Tag size={12} className="text-purple-500" />
                Categoria / Tópico
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#202c33]/60 border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 cursor-pointer"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Conteúdo Q&A */}
            {entryType === 'qa' ? (
              <>
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px] flex items-center justify-between">
                    <span>Pergunta do Cliente *</span>
                    <span className="text-[10px] text-slate-400 lowercase font-normal">como o cliente costuma perguntar</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    placeholder="Ex: Vocês entregam no bairro Floresta e qual a taxa?"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#202c33]/60 border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px]">
                      Resposta Ideal do Robô / Atendente *
                    </label>
                    <button
                      type="button"
                      disabled={isEnhancingWithAi || !answer.trim()}
                      onClick={handleEnhanceWithAi}
                      className={cn(
                        "text-[10px] font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer",
                        answer.trim() && !isEnhancingWithAi
                          ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 border border-purple-500/20"
                          : "bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed opacity-50"
                      )}
                    >
                      {isEnhancingWithAi ? (
                        <>
                          <Loader2 size={11} className="animate-spin" />
                          Aprimorando...
                        </>
                      ) : (
                        <>
                          <Sparkles size={11} className="text-purple-500" />
                          Melhorar com I.A
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    required
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    placeholder="Ex: Sim! Entregamos no Floresta com taxa de R$ 6,00. O prazo médio de entrega é de 40 a 50 minutos."
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#202c33]/60 border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all resize-none"
                  />
                </div>
              </>
            ) : (
              /* Conteúdo Conhecimento Avulso */
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px]">
                    Conteúdo do Conhecimento / Regra de Negócio *
                  </label>
                  <button
                    type="button"
                    disabled={isEnhancingWithAi || !knowledgeText.trim()}
                    onClick={handleEnhanceWithAi}
                    className={cn(
                      "text-[10px] font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer",
                      knowledgeText.trim() && !isEnhancingWithAi
                        ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 border border-purple-500/20"
                        : "bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed opacity-50"
                    )}
                  >
                    {isEnhancingWithAi ? (
                      <>
                        <Loader2 size={11} className="animate-spin" />
                        Aprimorando...
                      </>
                    ) : (
                      <>
                        <Sparkles size={11} className="text-purple-500" />
                        Melhorar com I.A
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  rows={6}
                  required
                  value={knowledgeText}
                  onChange={e => setKnowledgeText(e.target.value)}
                  placeholder="Ex: Aceitamos pagamentos via PIX, Cartão de Crédito/Débito e dinheiro na entrega. Para pagamentos em dinheiro com troco acima de R$ 50, avisar previamente."
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#202c33]/60 border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all resize-none"
                />
              </div>
            )}

            {/* Mensagem de Erro */}
            {errorMessage && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2 animate-in fade-in">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Mensagem de Sucesso */}
            {successMessage && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2 animate-in fade-in">
                <Check size={14} className="shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <div className="pt-2 text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 border-t border-slate-100 dark:border-white/5">
              <ShieldCheck size={13} className="text-purple-500" />
              <span>O conteúdo será indexado e estará disponível imediatamente para todos os robôs de I.A.</span>
            </div>
          </div>

          {/* Footer fixado */}
          <div className="px-6 py-4 border-t border-slate-200/30 dark:border-white/5 bg-slate-50/50 dark:bg-black/10 shrink-0 flex gap-3 justify-end items-center">
            <button 
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 font-bold rounded-xl transition-all duration-200 text-xs active:scale-95 cursor-pointer min-h-[44px]"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isSaving}
              className={cn(
                "px-6 py-2.5 font-black uppercase rounded-xl transition-all duration-200 text-xs flex items-center justify-center gap-2 min-h-[44px]",
                !isSaving
                  ? "bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/30 active:scale-95 cursor-pointer hover:scale-[1.02]"
                  : "bg-slate-200 dark:bg-white/5 text-slate-400 cursor-not-allowed opacity-50"
              )}
            >
              {isSaving ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Salvando no RAG...
                </>
              ) : (
                <>
                  <Zap size={15} />
                  Salvar na Base de Conhecimento
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
