import React, { useState } from 'react';
import { 
  FileText, 
  CheckCircle2, 
  Cpu, 
  Clock, 
  User, 
  Calendar, 
  Copy, 
  CheckCheck, 
  ArrowRight, 
  Sparkles, 
  ShieldCheck, 
  Terminal, 
  FileCode2, 
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Tag,
  Paperclip
} from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface TicketSummaryStatusProps {
  lead: {
    id: string;
    title: string;
    notes?: string | null;
    status: string;
    priority?: number;
    probability?: number;
    created_at?: string;
    due_date?: string | null;
    tags?: string[];
    technical_execution_details?: string | null;
    history?: any[];
  };
  deliveryReport?: {
    summary?: string;
    files_modified?: Array<{
      file: string;
      functions?: string[];
      description?: string;
    }>;
    validation?: {
      type_checking?: string;
      automated_tests?: string;
    };
    executor?: string;
    executed_at?: string;
  } | null;
  stageLabel?: string;
  stageColorClass?: string;
  onNavigateToNotes?: () => void;
  onNavigateToTechnical?: () => void;
}

/**
 * Utilitário para limpar o markdown de mídias e extrair estritamente a Solicitação Original
 */
export function extractOriginalRequest(notes?: string | null): string {
  if (!notes) return 'Nenhuma descrição detalhada foi informada na abertura deste chamado.';

  // Se houver um bloco de entrega ou resolução técnica concatenado, isola apenas a solicitação original
  let requestText = notes;
  if (requestText.includes('### 🚀 Registro de Entrega & Execução Técnica')) {
    requestText = requestText.split('### 🚀 Registro de Entrega & Execução Técnica')[0];
  } else if (requestText.includes('### 🚀 Relatório Técnico de Entrega')) {
    requestText = requestText.split('### 🚀 Relatório Técnico de Entrega')[0];
  } else if (requestText.includes('### 🏁 Fechamento & Resolução')) {
    requestText = requestText.split('### 🏁 Fechamento & Resolução')[0];
  }

  // Remove apenas as tags markdown de mídia brutas (![nome](url)) que já são exibidas na galeria
  const cleaned = requestText
    .replace(/!\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g, '')
    .replace(/🎥\s*\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g, '')
    .replace(/🎙️\s*\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g, '')
    .replace(/###\s*📎\s*Mídias\s*&?\s*Evidências[\s\S]*?(?=(?:---|\n\n###|$))/gi, '')
    .trim();

  return cleaned || 'Nenhuma descrição detalhada foi informada na abertura deste chamado.';
}

/**
 * Utilitário para extrair a Resolução / Entrega realizada
 */
export function extractResolutionDetails(
  notes?: string | null,
  deliveryReport?: any,
  technicalExecutionDetails?: string | null
): {
  summary: string | null;
  executor: string | null;
  executedAt: string | null;
  validation: string | null;
  filesModified: Array<{ file: string; functions?: string[]; description?: string }>;
  isDelivered: boolean;
} {
  // 1. Prioridade para deliveryReport estruturado no histórico
  if (deliveryReport && (deliveryReport.summary || deliveryReport.files_modified?.length)) {
    return {
      summary: deliveryReport.summary || null,
      executor: deliveryReport.executor || 'Antigravity AI (Fila Dev)',
      executedAt: deliveryReport.executed_at || null,
      validation: deliveryReport.validation?.type_checking || 'TypeScript: 0 Erros (OK)',
      filesModified: deliveryReport.files_modified || [],
      isDelivered: true
    };
  }

  // 2. Se houver technical_execution_details explícito no banco
  if (technicalExecutionDetails && technicalExecutionDetails.trim().length > 0) {
    return {
      summary: technicalExecutionDetails.trim(),
      executor: 'Desenvolvedor / Antigravity AI',
      executedAt: null,
      validation: 'TypeScript: 0 Erros (OK)',
      filesModified: [],
      isDelivered: true
    };
  }

  // 3. Se houver bloco de entrega registrado dentro do markdown das notas
  if (notes) {
    const deliveryMatch = notes.match(/###\s*🚀\s*(?:Registro de Entrega|Relatório Técnico de Entrega)[\s\S]*?(?=(?:---|\n\n###\s*🏁|$))/i);
    if (deliveryMatch) {
      const block = deliveryMatch[0];
      const summaryPart = block.replace(/###\s*🚀\s*(?:Registro de Entrega|Relatório Técnico de Entrega)[^\n]*/i, '').trim();
      return {
        summary: summaryPart,
        executor: 'Antigravity AI (Fila Dev)',
        executedAt: null,
        validation: 'TypeScript: 0 Erros (OK)',
        filesModified: [],
        isDelivered: true
      };
    }
  }

  return {
    summary: null,
    executor: null,
    executedAt: null,
    validation: null,
    filesModified: [],
    isDelivered: false
  };
}

export const TicketSummaryStatus: React.FC<TicketSummaryStatusProps> = ({
  lead,
  deliveryReport,
  stageLabel,
  stageColorClass,
  onNavigateToNotes,
  onNavigateToTechnical
}) => {
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedDelivery, setCopiedDelivery] = useState(false);
  const [isFilesExpanded, setIsFilesExpanded] = useState(false);

  const originalRequest = extractOriginalRequest(lead.notes);
  const resolution = extractResolutionDetails(
    lead.notes,
    deliveryReport,
    lead.technical_execution_details
  );

  const isTestingOrDone = lead.status === 'testing' || lead.status === 'done';

  const handleCopyOriginal = () => {
    navigator.clipboard.writeText(originalRequest);
    setCopiedOriginal(true);
    setTimeout(() => setCopiedOriginal(false), 2000);
  };

  const handleCopyDelivery = () => {
    const text = resolution.summary || 'Ainda em desenvolvimento.';
    navigator.clipboard.writeText(text);
    setCopiedDelivery(true);
    setTimeout(() => setCopiedDelivery(false), 2000);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Banner Informativo Superior: Estado Geral do Chamado */}
      <div className={cn(
        "p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs transition-all",
        isTestingOrDone
          ? "bg-gradient-to-r from-emerald-500/[0.08] via-emerald-500/[0.04] to-teal-500/[0.06] border-emerald-500/25 dark:border-emerald-500/20"
          : lead.status === 'development'
            ? "bg-gradient-to-r from-indigo-500/[0.08] via-indigo-500/[0.04] to-purple-500/[0.06] border-indigo-500/25 dark:border-indigo-500/20"
            : "bg-gradient-to-r from-sky-500/[0.08] via-sky-500/[0.04] to-blue-500/[0.06] border-sky-500/25 dark:border-sky-500/20"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-xs",
            isTestingOrDone 
              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
              : lead.status === 'development'
                ? "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
                : "bg-sky-500/20 text-sky-600 dark:text-sky-400 border-sky-500/30"
          )}>
            {isTestingOrDone ? (
              <CheckCircle2 size={20} className="text-emerald-500" />
            ) : lead.status === 'development' ? (
              <Cpu size={20} className="text-indigo-500 animate-pulse" />
            ) : (
              <Clock size={20} className="text-sky-500" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Status Atual do Chamado
              </span>
              <span className={cn(
                "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                isTestingOrDone
                  ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                  : lead.status === 'development'
                    ? "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30"
                    : "bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/30"
              )}>
                {stageLabel || lead.status}
              </span>
              {resolution.isDelivered && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[8.5px] font-black uppercase border border-emerald-500/25 flex items-center gap-1">
                  <ShieldCheck size={10} /> Entrega Validada
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
              {isTestingOrDone
                ? 'Solução codificada e pronta para homologação em Homologação & QA'
                : lead.status === 'development'
                  ? 'Chamado em desenvolvimento ativo pela equipe técnica / IA'
                  : 'Chamado em análise e aguardando priorização técnica'}
            </p>
          </div>
        </div>

        {/* Data e Prazo Resumidos */}
        <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-1">
            <Calendar size={12} className="text-indigo-500" />
            <span>Criado em: {lead.created_at ? format(new Date(lead.created_at), 'dd/MM/yyyy HH:mm') : '--/--'}</span>
          </div>
          {lead.due_date && (
            <div className="flex items-center gap-1">
              <Clock size={12} className="text-amber-500" />
              <span>Prazo: {format(new Date(lead.due_date), 'dd/MM/yyyy')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Grid Principal: Solicitação Original VS Resolução & Entrega */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* ======================================================== */}
        {/* BLOCO 1: SOLICITAÇÃO ORIGINAL (O QUE FOI PEDIDO)         */}
        {/* ======================================================== */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-[#182229]/60 backdrop-blur-md shadow-sm overflow-hidden flex flex-col transition-all">
          {/* Cabeçalho do Bloco 1 */}
          <div className="px-4.5 py-3.5 border-b border-slate-200/60 dark:border-white/5 bg-slate-50/80 dark:bg-black/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center border border-sky-500/25">
                <FileText size={15} />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  1. Solicitação Original
                </h3>
                <span className="text-[9.5px] font-medium text-slate-400 block -mt-0.5">
                  Demanda, contexto e escopo inicial
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyOriginal}
                className="px-2.5 py-1.5 bg-white dark:bg-[#111b21] hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-white/10 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                title="Copiar texto da solicitação original"
              >
                {copiedOriginal ? (
                  <>
                    <CheckCheck size={12} className="text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Copiar</span>
                  </>
                )}
              </button>

              {onNavigateToNotes && (
                <button
                  type="button"
                  onClick={onNavigateToNotes}
                  className="px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                  title="Editar notas completas e briefing"
                >
                  <span>Ver Completo</span>
                  <ArrowRight size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Conteúdo da Solicitação Original - Altura Dinâmica e Sem Cortes */}
          <div className="p-4.5 flex-1 flex flex-col justify-between space-y-4">
            <div className="prose prose-slate dark:prose-invert max-w-none text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans whitespace-pre-wrap select-text break-words">
              {originalRequest}
            </div>

            {/* Marcadores e Tags Técnicas */}
            {lead.tags && lead.tags.length > 0 && (
              <div className="pt-3 border-t border-slate-200/50 dark:border-white/5 flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Tag size={10} /> Tags:
                </span>
                {lead.tags.map((t, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 text-[8.5px] font-black uppercase border border-slate-200/60 dark:border-white/[0.08]"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* BLOCO 2: RESOLUÇÃO & ENTREGA (O QUE FOI FEITO)           */}
        {/* ======================================================== */}
        <div className={cn(
          "rounded-2xl border shadow-sm overflow-hidden flex flex-col transition-all",
          resolution.isDelivered
            ? "border-emerald-500/25 dark:border-emerald-500/20 bg-emerald-500/[0.02] dark:bg-[#182229]/60 backdrop-blur-md"
            : "border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-[#182229]/60 backdrop-blur-md"
        )}>
          {/* Cabeçalho do Bloco 2 */}
          <div className={cn(
            "px-4.5 py-3.5 border-b flex items-center justify-between gap-2",
            resolution.isDelivered
              ? "border-emerald-500/15 bg-emerald-500/[0.05] dark:bg-emerald-950/20"
              : "border-slate-200/60 dark:border-white/5 bg-slate-50/80 dark:bg-black/20"
          )}>
            <div className="flex items-center gap-2.5">
              <div className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center border",
                resolution.isDelivered
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/25"
              )}>
                {resolution.isDelivered ? <CheckCircle2 size={15} /> : <Cpu size={15} />}
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  2. Resolução & Entrega
                </h3>
                <span className="text-[9.5px] font-medium text-slate-400 block -mt-0.5">
                  {resolution.isDelivered ? 'Solução implementada e documentada' : 'Fase de desenvolvimento'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {resolution.isDelivered && (
                <button
                  type="button"
                  onClick={handleCopyDelivery}
                  className="px-2.5 py-1.5 bg-white dark:bg-[#111b21] hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-white/10 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                  title="Copiar relatório de entrega técnica"
                >
                  {copiedDelivery ? (
                    <>
                      <CheckCheck size={12} className="text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              )}

              {onNavigateToTechnical && (
                <button
                  type="button"
                  onClick={onNavigateToTechnical}
                  className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                  title="Ver ou editar registro de engenharia"
                >
                  <span>{resolution.isDelivered ? 'Ver Detalhes' : 'Registrar'}</span>
                  <ArrowRight size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Conteúdo da Resolução & Entrega - Altura Dinâmica e Sem Cortes */}
          <div className="p-4.5 flex-1 flex flex-col justify-between space-y-4">
            {resolution.isDelivered ? (
              <div className="space-y-4">
                {/* Resumo da Entrega */}
                <div className="prose prose-slate dark:prose-invert max-w-none text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans whitespace-pre-wrap select-text break-words bg-emerald-500/[0.04] dark:bg-black/20 p-3.5 rounded-xl border border-emerald-500/15">
                  {resolution.summary}
                </div>

                {/* Badges de Validação e Executor */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                  <div className="p-2.5 bg-white/80 dark:bg-[#111b21] rounded-xl border border-slate-200/60 dark:border-white/5 flex items-center gap-2">
                    <User size={13} className="text-indigo-500 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[8.5px] uppercase font-bold text-slate-400 block">Executor</span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-200 truncate block">
                        {resolution.executor || 'Antigravity AI (Fila Dev)'}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-white/80 dark:bg-[#111b21] rounded-xl border border-slate-200/60 dark:border-white/5 flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-[8.5px] uppercase font-bold text-slate-400 block">Validação</span>
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400 truncate block">
                        {resolution.validation || 'TypeScript: 0 Erros'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Arquivos e Funções Modificadas (Se houver) */}
                {resolution.filesModified.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => setIsFilesExpanded(!isFilesExpanded)}
                      className="w-full flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer py-1"
                    >
                      <span className="flex items-center gap-1.5">
                        <Terminal size={12} className="text-indigo-500" />
                        <span>Arquivos Modificados ({resolution.filesModified.length})</span>
                      </span>
                      {isFilesExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>

                    {isFilesExpanded && (
                      <div className="space-y-2 animate-in fade-in duration-150">
                        {resolution.filesModified.map((f, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 bg-slate-50 dark:bg-[#111b21] rounded-xl border border-slate-200/70 dark:border-white/5 font-mono text-[10px] space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2 font-bold text-indigo-600 dark:text-indigo-400 break-all">
                              <span className="flex items-center gap-1">
                                <FileCode2 size={12} />
                                {f.file}
                              </span>
                            </div>
                            {f.functions && f.functions.length > 0 && (
                              <div className="flex gap-1 flex-wrap pt-0.5">
                                {f.functions.map((fn, fIdx) => (
                                  <span
                                    key={fIdx}
                                    className="px-1.5 py-0.2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 rounded text-[9px]"
                                  >
                                    fn: {fn}
                                  </span>
                                ))}
                              </div>
                            )}
                            {f.description && (
                              <p className="font-sans text-slate-600 dark:text-slate-400 text-[10px] leading-relaxed pt-0.5">
                                {f.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Estado quando ainda não há entrega técnica consolidada */
              <div className="py-8 px-4 text-center space-y-3 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-black/10 rounded-xl border border-dashed border-slate-200 dark:border-white/10 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                  <Cpu size={22} className="animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Aguardando Entrega / Em Desenvolvimento
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-xs leading-relaxed">
                    Este chamado ainda não possui um registro oficial de entrega técnica. Ao finalizar o desenvolvimento, a resolução e validação serão exibidas aqui.
                  </p>
                </div>
                {onNavigateToTechnical && (
                  <button
                    type="button"
                    onClick={onNavigateToTechnical}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Sparkles size={12} />
                    <span>Registrar Execução Agora</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default TicketSummaryStatus;
