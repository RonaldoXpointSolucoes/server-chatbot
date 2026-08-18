import React, { useState, useRef, useEffect } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Code,
  Link as LinkIcon,
  Minus,
  Sparkles,
  Wand2,
  CheckCheck,
  RotateCcw,
  Eye,
  Edit3,
  Columns,
  Loader2,
  Check,
  Copy,
  Tag,
  AlertCircle
} from 'lucide-react';
import { geminiService } from '../services/geminiService';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  cardTitle?: string;
  minHeight?: string;
  maxHeight?: string;
  onSuggestTagsAndPriority?: (data: { tags: string[]; priority: number }) => void;
  className?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Descreva os detalhes, objetivos ou requisitos da tarefa...',
  cardTitle = '',
  minHeight = '180px',
  maxHeight = '420px',
  onSuggestTagsAndPriority,
  className
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiActionMessage, setAiActionMessage] = useState<string | null>(null);
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const aiMenuRef = useRef<HTMLDivElement>(null);

  // Fechar menu de IA ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(event.target as Node)) {
        setIsAiMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Salvar estado anterior para Undo da IA
  const pushToHistory = (previousText: string) => {
    setHistoryStack(prev => [...prev.slice(-10), previousText]);
  };

  const handleUndo = () => {
    if (historyStack.length === 0) return;
    const previous = historyStack[historyStack.length - 1];
    setHistoryStack(prev => prev.slice(0, -1));
    onChange(previous);
  };

  // Utilitário para inserir marcação na seleção ou cursor do textarea
  const insertFormatting = (prefix: string, suffix: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end) || defaultText;

    const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
    onChange(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selectedText.length
      );
    }, 10);
  };

  // Inserir prefixo de linha (Ex: - , 1. , - [ ] , > , # )
  const insertLinePrefix = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    // Encontrar o início da linha atual
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = text.indexOf('\n', end);
    const actualLineEnd = lineEnd === -1 ? text.length : lineEnd;

    const selectedLines = text.substring(lineStart, actualLineEnd);
    const lines = selectedLines.split('\n');

    const formattedLines = lines.map(line => {
      // Se já começar com o prefixo, remove (toggle)
      if (line.startsWith(prefix)) {
        return line.substring(prefix.length);
      }
      return `${prefix}${line}`;
    });

    const replacement = formattedLines.join('\n');
    const newText = text.substring(0, lineStart) + replacement + text.substring(actualLineEnd);

    onChange(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart, lineStart + replacement.length);
    }, 10);
  };

  // Tratamento de atalhos de teclado (Ctrl+B, Ctrl+I, Ctrl+K, Tab)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      insertFormatting('**', '**', 'texto em negrito');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      insertFormatting('*', '*', 'texto em itálico');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      insertFormatting('[', '](https://)', 'link');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;

      if (e.shiftKey) {
        // Desindentar
        if (text.substring(start - 2, start) === '  ') {
          const newText = text.substring(0, start - 2) + text.substring(start);
          onChange(newText);
          setTimeout(() => {
            textarea.setSelectionRange(start - 2, start - 2);
          }, 10);
        }
      } else {
        // Indentar 2 espaços
        const newText = text.substring(0, start) + '  ' + text.substring(end);
        onChange(newText);
        setTimeout(() => {
          textarea.setSelectionRange(start + 2, start + 2);
        }, 10);
      }
    }
  };

  // Ações de Inteligência Artificial com Gemini
  const handleAiAction = async (action: 'improve' | 'structure' | 'checklist' | 'suggest_tags' | 'fix_grammar') => {
    setIsAiMenuOpen(false);
    setIsAiLoading(true);
    pushToHistory(value);

    try {
      if (action === 'structure') setAiActionMessage('Estruturando plano técnico...');
      else if (action === 'improve') setAiActionMessage('Aprimorando clareza e redação...');
      else if (action === 'checklist') setAiActionMessage('Convertendo em tarefas...');
      else if (action === 'fix_grammar') setAiActionMessage('Revisando gramática...');
      else if (action === 'suggest_tags') setAiActionMessage('Analisando tags e prioridade...');

      const response = await geminiService.enhanceCardText({
        content: value,
        action,
        cardTitle
      });

      if (action === 'suggest_tags') {
        if (response.suggestedTags && response.suggestedTags.length > 0 && onSuggestTagsAndPriority) {
          onSuggestTagsAndPriority({
            tags: response.suggestedTags,
            priority: response.suggestedPriority || 2
          });
        }
      } else if (response.result) {
        onChange(response.result);
      }
    } catch (err: any) {
      console.error('Erro na assistência IA do editor:', err);
      alert(err.message || 'Erro ao comunicar com a I.A.');
    } finally {
      setIsAiLoading(false);
      setAiActionMessage(null);
    }
  };

  // Alternar checkbox na pré-visualização interativa
  const handleTogglePreviewCheckbox = (index: number) => {
    let currentChecklistIndex = 0;
    const lines = value.split('\n');
    const newLines = lines.map(line => {
      const isUnchecked = line.match(/^(\s*[-*]\s*\[\s*\]\s*)(.*)$/);
      const isChecked = line.match(/^(\s*[-*]\s*\[[xX]\]\s*)(.*)$/);

      if (isUnchecked || isChecked) {
        if (currentChecklistIndex === index) {
          currentChecklistIndex++;
          if (isUnchecked) {
            return line.replace(/^(\s*[-*]\s*\[\s*\]\s*)/, '$1[x] ').replace('[] [x]', '[x]');
          } else {
            return line.replace(/^(\s*[-*]\s*\[[xX]\]\s*)/, '$1[ ] ').replace('[x] [ ]', '[ ]');
          }
        }
        currentChecklistIndex++;
      }
      return line;
    });

    onChange(newLines.join('\n'));
  };

  // Renderizador simplificado e ultra-rápido de Markdown para Preview
  const renderMarkdownPreview = () => {
    if (!value || !value.trim()) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500 text-xs italic">
          <Edit3 size={24} className="mb-2 opacity-40" />
          <span>Nenhum conteúdo para visualizar no momento. Digite na aba "Escrever".</span>
        </div>
      );
    }

    const lines = value.split('\n');
    let checklistIndex = 0;

    return (
      <div className="prose prose-sm dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 text-xs space-y-2 leading-relaxed">
        {lines.map((line, lineIdx) => {
          // Checkbox Não Marcado
          const uncheckedMatch = line.match(/^(\s*)[-*]\s*\[\s*\]\s*(.*)$/);
          if (uncheckedMatch) {
            const thisIndex = checklistIndex++;
            return (
              <div key={lineIdx} className="flex items-start gap-2 group py-0.5">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => handleTogglePreviewCheckbox(thisIndex)}
                  className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-slate-700 dark:text-slate-300 select-text flex-1">
                  {uncheckedMatch[2]}
                </span>
              </div>
            );
          }

          // Checkbox Marcado
          const checkedMatch = line.match(/^(\s*)[-*]\s*\[[xX]\]\s*(.*)$/);
          if (checkedMatch) {
            const thisIndex = checklistIndex++;
            return (
              <div key={lineIdx} className="flex items-start gap-2 group py-0.5 opacity-70">
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => handleTogglePreviewCheckbox(thisIndex)}
                  className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="line-through text-slate-500 dark:text-slate-400 select-text flex-1">
                  {checkedMatch[2]}
                </span>
              </div>
            );
          }

          // Títulos
          if (line.startsWith('### ')) {
            return <h3 key={lineIdx} className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mt-3 mb-1">{line.replace('### ', '')}</h3>;
          }
          if (line.startsWith('## ')) {
            return <h2 key={lineIdx} className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mt-4 mb-1.5 border-b border-slate-200/50 dark:border-white/10 pb-1">{line.replace('## ', '')}</h2>;
          }
          if (line.startsWith('# ')) {
            return <h1 key={lineIdx} className="text-base font-black text-slate-900 dark:text-white mt-4 mb-2">{line.replace('# ', '')}</h1>;
          }

          // Divisor
          if (line.trim() === '---' || line.trim() === '***') {
            return <hr key={lineIdx} className="border-slate-200/70 dark:border-white/10 my-3" />;
          }

          // Citação
          if (line.startsWith('> ')) {
            return (
              <blockquote key={lineIdx} className="border-l-2 border-indigo-500 pl-3 py-1 bg-indigo-50/50 dark:bg-indigo-950/20 text-slate-600 dark:text-slate-400 rounded-r-lg my-1 italic">
                {line.replace('> ', '')}
              </blockquote>
            );
          }

          // Bloco de Código
          if (line.startsWith('```')) {
            return (
              <div key={lineIdx} className="bg-slate-900 text-cyan-300 p-2.5 rounded-lg font-mono text-[11px] my-1 border border-slate-800 shadow-inner overflow-x-auto">
                {line}
              </div>
            );
          }

          // Lista com Marcadores
          if (line.match(/^\s*[-*]\s+(.*)$/)) {
            return (
              <div key={lineIdx} className="flex items-start gap-2 pl-2 py-0.5">
                <span className="text-indigo-500 font-bold">•</span>
                <span className="text-slate-700 dark:text-slate-300">{line.replace(/^\s*[-*]\s+/, '')}</span>
              </div>
            );
          }

          // Lista Numerada
          const numMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
          if (numMatch) {
            return (
              <div key={lineIdx} className="flex items-start gap-2 pl-2 py-0.5">
                <span className="text-indigo-600 dark:text-indigo-400 font-bold text-[11px] min-w-[16px]">{numMatch[1]}.</span>
                <span className="text-slate-700 dark:text-slate-300">{numMatch[2]}</span>
              </div>
            );
          }

          // Linha em branco
          if (!line.trim()) {
            return <div key={lineIdx} className="h-2" />;
          }

          // Linha de Parágrafo padrão
          return (
            <p key={lineIdx} className="text-slate-700 dark:text-slate-300 m-0">
              {line}
            </p>
          );
        })}
      </div>
    );
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      "flex flex-col border border-slate-200/80 dark:border-white/10 rounded-2xl bg-white dark:bg-[#141e24] shadow-sm overflow-hidden transition-all duration-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20",
      className
    )}>
      {/* Barra de Ferramentas Superior (Toolbar) */}
      <div className="px-2.5 py-1.5 bg-slate-50/90 dark:bg-[#182229]/90 border-b border-slate-200/60 dark:border-white/5 flex items-center justify-between gap-1 flex-wrap shrink-0">
        
        {/* Grupo 1: Formatação de Texto */}
        <div className="flex items-center gap-0.5 flex-wrap">
          <button
            type="button"
            onClick={() => insertFormatting('**', '**', 'negrito')}
            title="Negrito (Ctrl+B)"
            className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('*', '*', 'itálico')}
            title="Itálico (Ctrl+I)"
            className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('~~', '~~', 'tachado')}
            title="Tachado"
            className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
          >
            <Strikethrough size={14} />
          </button>

          <div className="w-[1px] h-4 bg-slate-300 dark:bg-white/10 mx-1" />

          {/* Cabeçalhos */}
          <button
            type="button"
            onClick={() => insertLinePrefix('### ')}
            title="Subtítulo H3"
            className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center text-[11px] font-bold"
          >
            H3
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix('## ')}
            title="Título H2"
            className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center text-[11px] font-black"
          >
            H2
          </button>

          <div className="w-[1px] h-4 bg-slate-300 dark:bg-white/10 mx-1" />

          {/* Listas e Checklist */}
          <button
            type="button"
            onClick={() => insertLinePrefix('- ')}
            title="Lista com Marcadores"
            className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
          >
            <List size={14} />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix('1. ')}
            title="Lista Numerada"
            className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
          >
            <ListOrdered size={14} />
          </button>
          <button
            type="button"
            onClick={() => insertLinePrefix('- [ ] ')}
            title="Checklist / Tarefa Interativa"
            className="p-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-lg transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center font-bold"
          >
            <ListTodo size={14} />
          </button>

          <div className="w-[1px] h-4 bg-slate-300 dark:bg-white/10 mx-1" />

          {/* Citação e Código */}
          <button
            type="button"
            onClick={() => insertLinePrefix('> ')}
            title="Citação / Bloco de Destaque"
            className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
          >
            <Quote size={13} />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('`', '`', 'código')}
            title="Código Inline"
            className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
          >
            <Code size={14} />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('[', '](https://)', 'Link')}
            title="Link (Ctrl+K)"
            className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
          >
            <LinkIcon size={13} />
          </button>
        </div>

        {/* Grupo 2: Ações de I.A & Modo de Visualização */}
        <div className="flex items-center gap-1.5">
          
          {/* Botão de Desfazer (Undo I.A) */}
          {historyStack.length > 0 && (
            <button
              type="button"
              onClick={handleUndo}
              title="Desfazer alteração de IA"
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 hover:text-slate-800 dark:text-slate-400 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold"
            >
              <RotateCcw size={12} />
              <span className="hidden sm:inline">Desfazer IA</span>
            </button>
          )}

          {/* Dropdown de Ações Inteligentes com IA Gemini */}
          <div className="relative" ref={aiMenuRef}>
            <button
              type="button"
              onClick={() => setIsAiMenuOpen(prev => !prev)}
              disabled={isAiLoading}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-black transition-all duration-200 cursor-pointer shadow-sm active:scale-95",
                isAiLoading 
                  ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 animate-pulse" 
                  : "bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-white hover:from-violet-500 hover:to-cyan-400 shadow-indigo-500/20"
              )}
            >
              {isAiLoading ? (
                <>
                  <Loader2 size={12} className="animate-spin text-cyan-300" />
                  <span>{aiActionMessage || 'Processando...'}</span>
                </>
              ) : (
                <>
                  <Sparkles size={12} className="text-amber-300 animate-pulse" />
                  <span>Assistente IA</span>
                  <Wand2 size={11} className="text-cyan-200 ml-0.5" />
                </>
              )}
            </button>

            {/* Menu Popover de Ações com IA */}
            {isAiMenuOpen && !isAiLoading && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-white dark:bg-[#1f2c34] border border-slate-200/80 dark:border-white/10 rounded-2xl shadow-xl z-50 p-1.5 text-xs animate-in zoom-in-95 duration-150 space-y-1">
                <div className="px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                  <span>Ferramentas Inteligentes</span>
                  <Sparkles size={10} className="text-indigo-500" />
                </div>

                <button
                  type="button"
                  onClick={() => handleAiAction('structure')}
                  className="w-full text-left px-2.5 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 rounded-xl transition-colors flex items-center gap-2 font-semibold cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                    🎯
                  </div>
                  <div>
                    <div className="text-[11px] font-bold group-hover:text-indigo-600 dark:group-hover:text-indigo-400">Estruturar Plano Completo</div>
                    <div className="text-[9px] text-slate-400">Gera seções (Objetivo, Requisitos, etc.)</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAiAction('improve')}
                  className="w-full text-left px-2.5 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 rounded-xl transition-colors flex items-center gap-2 font-semibold cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                    ✨
                  </div>
                  <div>
                    <div className="text-[11px] font-bold group-hover:text-violet-600 dark:group-hover:text-violet-400">Melhorar Redação & Clareza</div>
                    <div className="text-[9px] text-slate-400">Torna o texto mais técnico e conciso</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAiAction('checklist')}
                  className="w-full text-left px-2.5 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 rounded-xl transition-colors flex items-center gap-2 font-semibold cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    📋
                  </div>
                  <div>
                    <div className="text-[11px] font-bold group-hover:text-emerald-600 dark:group-hover:text-emerald-400">Converter em Checklist</div>
                    <div className="text-[9px] text-slate-400">Cria tarefas interativas com caixas</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAiAction('fix_grammar')}
                  className="w-full text-left px-2.5 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 rounded-xl transition-colors flex items-center gap-2 font-semibold cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    🔍
                  </div>
                  <div>
                    <div className="text-[11px] font-bold group-hover:text-amber-600 dark:group-hover:text-amber-400">Revisar Gramática</div>
                    <div className="text-[9px] text-slate-400">Corrige ortografia e pontuação</div>
                  </div>
                </button>

                {onSuggestTagsAndPriority && (
                  <button
                    type="button"
                    onClick={() => handleAiAction('suggest_tags')}
                    className="w-full text-left px-2.5 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 rounded-xl transition-colors flex items-center gap-2 font-semibold cursor-pointer group border-t border-slate-100 dark:border-white/5 pt-2"
                  >
                    <div className="w-6 h-6 rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                      💡
                    </div>
                    <div>
                      <div className="text-[11px] font-bold group-hover:text-cyan-600 dark:group-hover:text-cyan-400">Sugerir Tags & Prioridade</div>
                      <div className="text-[9px] text-slate-400">Preenche tags e prioridade automaticamente</div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-slate-300 dark:bg-white/10 mx-0.5" />

          {/* Seletor de Modo: Escrever / Visualizar / Dividido */}
          <div className="flex items-center bg-slate-200/70 dark:bg-black/30 rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('edit')}
              title="Modo Edição"
              className={cn(
                "p-1.5 rounded-lg transition-all text-xs flex items-center gap-1 cursor-pointer",
                viewMode === 'edit'
                  ? "bg-white dark:bg-[#202c33] text-indigo-600 dark:text-indigo-400 shadow-sm font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              )}
            >
              <Edit3 size={13} />
              <span className="hidden sm:inline text-[10px]">Escrever</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              title="Modo Visualização"
              className={cn(
                "p-1.5 rounded-lg transition-all text-xs flex items-center gap-1 cursor-pointer",
                viewMode === 'preview'
                  ? "bg-white dark:bg-[#202c33] text-indigo-600 dark:text-indigo-400 shadow-sm font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              )}
            >
              <Eye size={13} />
              <span className="hidden sm:inline text-[10px]">Preview</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              title="Visualização Lado a Lado"
              className={cn(
                "p-1.5 rounded-lg transition-all text-xs hidden md:flex items-center gap-1 cursor-pointer",
                viewMode === 'split'
                  ? "bg-white dark:bg-[#202c33] text-indigo-600 dark:text-indigo-400 shadow-sm font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              )}
            >
              <Columns size={13} />
              <span className="text-[10px]">Dividido</span>
            </button>
          </div>
        </div>
      </div>

      {/* Área Central: Editor e/ou Preview */}
      <div 
        className="relative flex-1 flex flex-col md:flex-row overflow-hidden"
        style={{ minHeight, maxHeight }}
      >
        {/* Painel do Textarea de Edição */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className={cn(
            "flex-1 flex flex-col h-full overflow-hidden",
            viewMode === 'split' ? "border-r border-slate-200/80 dark:border-white/10" : ""
          )}>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full h-full p-4 bg-transparent resize-none focus:outline-none text-xs text-slate-800 dark:text-slate-200 font-mono leading-relaxed custom-scrollbar selection:bg-indigo-500/20"
            />
          </div>
        )}

        {/* Painel de Visualização Renderizada (Preview) */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className="flex-1 p-4 bg-slate-50/40 dark:bg-black/15 overflow-y-auto custom-scrollbar select-text">
            {renderMarkdownPreview()}
          </div>
        )}
      </div>

      {/* Rodapé do Editor (Estatísticas e Ajuda) */}
      <div className="px-3 py-1.5 bg-slate-50/70 dark:bg-[#182229]/50 border-t border-slate-200/40 dark:border-white/5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
        <div className="flex items-center gap-3">
          <span>{value.length} caracteres</span>
          <span>{value.split('\n').length} linhas</span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-600">|</span>
          <span className="hidden sm:inline">Markdown & Checklists suportados</span>
        </div>

        <div className="flex items-center gap-2">
          {value && (
            <button
              type="button"
              onClick={handleCopyContent}
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1 cursor-pointer font-semibold"
            >
              {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
              <span>{copied ? 'Copiado!' : 'Copiar'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
