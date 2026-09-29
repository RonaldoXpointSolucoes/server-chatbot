import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Sparkles, 
  X, 
  Check, 
  Save, 
  RotateCcw, 
  FileText, 
  Layers, 
  CheckCircle2, 
  Cpu, 
  HelpCircle,
  Code2,
  ListPlus,
  ShieldCheck,
  Zap,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { geminiService } from '../services/geminiService';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface CrmProjectKnowledgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: {
    id: string;
    name: string;
    config: any;
  };
  onBoardUpdated: (updatedBoard: any) => void;
}

export default function CrmProjectKnowledgeModal({
  isOpen,
  onClose,
  board,
  onBoardUpdated
}: CrmProjectKnowledgeModalProps) {
  const [knowledgeText, setKnowledgeText] = useState<string>('');
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');

  useEffect(() => {
    if (board && board.config) {
      setKnowledgeText(board.config.project_knowledge || '');
    }
  }, [board, isOpen]);

  if (!isOpen || !board) return null;

  // Contadores
  const charCount = knowledgeText.length;
  const wordCount = knowledgeText.trim() ? knowledgeText.trim().split(/\s+/).length : 0;

  // Inserção de templates rápidos
  const insertTemplate = (templateType: 'stack' | 'purpose' | 'rules' | 'conventions') => {
    let snippet = '';
    switch (templateType) {
      case 'stack':
        snippet = `\n### 💻 Stack Tecnológica & Arquitetura
- **Frontend**: React + Vite + TailwindCSS + Zustand + Lucide Icons
- **Backend / APIs**: Node.js Express + Supabase PostgREST
- **Banco de Dados**: PostgreSQL Supabase (RLS, Multi-tenant)
- **Infraestrutura / Deploy**: Vercel (Front) + Coolify (Back)\n`;
        break;
      case 'purpose':
        snippet = `\n### 🎯 Visão Geral & Propósito do Projeto
- **Nome do Projeto**: ${board.name}
- **Objetivo Principal**: Descreva em 2 a 3 linhas o problema principal que este projeto resolve para o usuário final.
- **Público-Alvo**: Quem são os operadores, desenvolvedores ou clientes finais.\n`;
        break;
      case 'rules':
        snippet = `\n### ⚙️ Regras de Negócio Inegociáveis
1. **Multi-Tenant**: Todos os registros devem respeitar estritamente o isolamento por \`tenant_id\`.
2. **Tempo Real**: Atualizações de status e mensagens devem disparar eventos no Supabase Realtime.
3. **Permissões**: Apenas administradores e agentes atribuídos podem alterar etapas de cards críticos.\n`;
        break;
      case 'conventions':
        snippet = `\n### 🛠️ Padrões de Código & Critérios de Aceite
- **Mobile-First Obrigatório**: Touch targets mínimos de 48px, zero overflow horizontal em telas pequenas.
- **Clean Code & TypeScript**: Tipagem estrita, nomes declarativos, funções puras e tratamento preventivo de erros.
- **UI/UX Premium**: Glassmorphism, feedback visual tátil nos botões (2s) e estados de carregamento claros.\n`;
        break;
    }

    setKnowledgeText(prev => {
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}\n${snippet}` : snippet.trim();
    });
  };

  // Melhorar e estruturar com IA
  const handleEnhanceWithAi = async () => {
    if (!knowledgeText.trim()) {
      alert('Por favor, digite algumas anotações ou informações sobre o projeto antes de estruturar com a IA.');
      return;
    }

    try {
      setIsEnhancing(true);
      const enhanced = await geminiService.enhanceProjectKnowledge({
        draft: knowledgeText,
        boardName: board.name
      });
      setKnowledgeText(enhanced);
    } catch (err: any) {
      console.error('Erro ao estruturar documentação com IA:', err);
      alert('Falha ao estruturar com IA: ' + (err?.message || 'Tente novamente com mais detalhes.'));
    } finally {
      setIsEnhancing(false);
    }
  };

  // Salvar no Supabase
  const handleSave = async () => {
    try {
      setIsSaving(true);
      const updatedConfig = {
        ...(board.config || {}),
        project_knowledge: knowledgeText.trim()
      };

      const { data, error } = await supabase
        .from('crm_boards')
        .update({ config: updatedConfig })
        .eq('id', board.id)
        .select()
        .single();

      if (error) throw error;

      onBoardUpdated(data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erro ao salvar Base de Conhecimento:', err);
      alert('Erro ao salvar Base de Conhecimento: ' + (err?.message || 'Falha de comunicação com o banco.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 dark:bg-black/85 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#111b21] w-full max-w-3xl rounded-t-[32px] sm:rounded-[28px] border border-slate-200/80 dark:border-white/[0.08] overflow-hidden shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 flex flex-col max-h-[92vh] sm:max-h-[88vh]">
        
        {/* Header Glassmorphism */}
        <div className="px-6 py-5 border-b border-slate-200/80 dark:border-white/[0.08] bg-gradient-to-r from-violet-600/15 via-indigo-600/15 to-cyan-500/15 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-4 ring-indigo-500/15 shrink-0">
              <BookOpen size={22} className="text-amber-300" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-sans tracking-tight">
                  Base de Conhecimento & Contexto do Projeto
                </h3>
                <span className={cn(
                  "text-[10px] px-2.5 py-0.5 rounded-full font-black tracking-wider uppercase border flex items-center gap-1.5 shadow-2xs transition-colors",
                  wordCount > 0
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                )}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", wordCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-amber-400")} />
                  {wordCount > 0 ? `Contexto Ativo (${wordCount} palavras)` : 'Sem Contexto Cadastrado'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 truncate">
                Quadro atual: <span className="font-bold text-slate-800 dark:text-slate-200">{board.name}</span>
              </p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-2xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>

        {/* Banner Informativo de Alto Impacto */}
        <div className="px-6 py-3 bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-indigo-50/70 dark:from-[#182229] dark:via-indigo-950/20 dark:to-[#182229] border-b border-slate-200/60 dark:border-white/5 flex items-start gap-3 shrink-0">
          <Sparkles size={17} className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <strong>Como a IA utiliza este contexto:</strong> Sempre que você clicar em <strong>"Criar com Áudio & IA"</strong>, todo o conteúdo abaixo é ensinado à IA como as regras oficiais e a arquitetura deste projeto. Isso elimina alucinações e garante cartões criados com precisão cirúrgica.
          </p>
        </div>

        {/* Toolbar de Templates e Modos */}
        <div className="px-6 py-2.5 bg-slate-50/80 dark:bg-[#152026]/80 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-black uppercase text-slate-400 mr-1 hidden sm:inline">
              Inserir Seções:
            </span>
            {[
              { id: 'stack', label: '💻 Stack & Arquitetura', type: 'stack' as const },
              { id: 'purpose', label: '🎯 Propósito', type: 'purpose' as const },
              { id: 'rules', label: '⚙️ Regras de Negócio', type: 'rules' as const },
              { id: 'conventions', label: '🛠️ Padrões de Código', type: 'conventions' as const }
            ].map(btn => (
              <button
                key={btn.id}
                type="button"
                onClick={() => insertTemplate(btn.type)}
                className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-white dark:bg-[#1f2c34] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-white/10 shadow-2xs transition-all cursor-pointer active:scale-95"
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Botão de Melhorar com IA */}
            <button
              type="button"
              disabled={isEnhancing || !knowledgeText.trim()}
              onClick={handleEnhanceWithAi}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10.5px] font-black transition-all cursor-pointer shadow-xs active:scale-95",
                isEnhancing
                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                  : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-500/20 disabled:opacity-50"
              )}
              title="A IA lê o rascunho e organiza em tópicos técnicos profissionais"
            >
              {isEnhancing ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  <span>Estruturando...</span>
                </>
              ) : (
                <>
                  <Sparkles size={12} className="text-amber-300" />
                  <span>Estruturar com IA</span>
                </>
              )}
            </button>

            {/* Alternador de Visualização */}
            <div className="flex items-center bg-white dark:bg-[#111b21] p-0.5 rounded-lg border border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[10px] font-black transition-all cursor-pointer",
                  viewMode === 'edit'
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                Editor
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[10px] font-black transition-all cursor-pointer",
                  viewMode === 'preview'
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                Prévia
              </button>
            </div>
          </div>
        </div>

        {/* Área Central de Edição / Visualização */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 text-xs text-left">
          {viewMode === 'edit' ? (
            <div className="space-y-2 h-full flex flex-col">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-semibold">Documentação do Projeto em Markdown</span>
                <span className="font-mono">
                  {charCount} caracteres &bull; {wordCount} palavras
                </span>
              </div>
              
              <textarea
                value={knowledgeText}
                onChange={e => setKnowledgeText(e.target.value)}
                placeholder="Exemplo de Documentação / Contexto do Projeto:

### 🎯 Visão Geral do App Acesso Remoto
Sistema para suporte e controle remoto de desktops e servidores corporativos com alta performance e baixa latência.

### 💻 Stack Tecnológica
- Frontend: React + Vite + TailwindCSS + WebRTC
- Backend: Go (Engine Whatsmeow / Gateway) + Node.js
- Banco de Dados: Supabase PostgreSQL com Realtime

### ⚙️ Regras de Negócio Críticas
- Todas as conexões de desktop devem autenticar via token único temporário.
- A tela de login nunca deve exibir senhas ou IDs em logs abertos.
- Se o usuário solicitar alteração visual, manter conformidade com WCAG e Mobile-First.

### 🛠️ Padrões de Código
- Código limpo (Clean Code), sem duplicações, TypeScript com tipagem estrita."
                rows={16}
                className="w-full flex-1 min-h-[280px] sm:min-h-[340px] p-4 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/[0.08] rounded-2xl font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 custom-scrollbar resize-none shadow-inner"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-100 dark:border-white/5 pb-2">
                <span className="font-semibold">Pré-visualização do Contexto que a IA receberá</span>
                <span className="font-mono">{wordCount} palavras</span>
              </div>
              {knowledgeText.trim() ? (
                <div className="p-4 bg-slate-50 dark:bg-[#182229] rounded-2xl border border-slate-200/80 dark:border-white/[0.08] font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed max-h-[380px] overflow-y-auto custom-scrollbar select-all">
                  {knowledgeText}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 bg-slate-50 dark:bg-[#182229] rounded-2xl border border-dashed border-slate-300 dark:border-white/10">
                  <BookOpen size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="font-bold">Nenhum contexto ou documentação inserida ainda.</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Use os botões de atalho no topo ou digite no Editor para ensinar à IA sobre este projeto.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer com Salvar e Cancelar */}
        <div className="px-6 py-4.5 border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/90 dark:bg-[#111b21] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                <CheckCircle2 size={16} /> Base de Conhecimento salva com sucesso!
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-5 py-2.5 bg-slate-200/80 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-all duration-200 text-xs active:scale-95 cursor-pointer min-h-[44px] flex items-center justify-center"
            >
              Cancelar
            </button>
            
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-extrabold rounded-xl shadow-lg shadow-indigo-500/25 transition-all duration-200 text-xs active:scale-95 cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              {isSaving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save size={15} />
                  <span>Salvar Base de Conhecimento</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
