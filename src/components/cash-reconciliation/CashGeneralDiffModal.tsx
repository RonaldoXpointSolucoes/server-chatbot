import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Table2,
  X,
  XCircle
} from 'lucide-react';
import {
  CashPendingAgendaItem,
  CashReconciliationItem,
  CashReconciliationResult,
  CashResolutionAction,
  CashSuggestion,
  formatCents
} from '../../types/cashReconciliation';
import {
  RECONCILIATION_GLOSSARY,
  buildGeneralDiffSummary,
  buildLinkableSystemPool,
  buildPairedItemsByIdMap,
  formatDateBr
} from '../../utils/cashReconciliationServiceHelper.mjs';
import { CashManualReconciliationTable } from './CashManualReconciliationTable';
import { CashOperationDetailModal, CashSystemCategoryTarget } from './CashOperationDetailModal';
import { CashSuggestionCard } from './CashSuggestionCard';

export type GeneralDiffTabKey = 'tabela' | 'sugestoes' | 'canais' | 'conciliados';

interface CashGeneralDiffModalProps {
  result: CashReconciliationResult;
  manualResolutions?: CashResolutionAction[];
  agendaItems?: CashPendingAgendaItem[];
  initialTab?: GeneralDiffTabKey;
  onConfirmSuggestion: (suggestionId: string) => void;
  onRejectSuggestion: (suggestionId: string) => void;
  onManualLink: (systemIds: string[], realIds: string[], note?: string) => void;
  onIgnoreItem: (side: 'system' | 'real', id: string) => void;
  onReclassifySystemItem?: (systemId: string, targetCategory: CashSystemCategoryTarget | null) => void;
  onReclassifySystemItems?: (systemIds: string[], targetCategory: CashSystemCategoryTarget) => void;
  onScheduleAgendaFromItem?: (item: CashReconciliationItem) => void;
  onSettleCrossDayAgendaMatch?: (agendaItem: CashPendingAgendaItem, bankItem: CashReconciliationItem) => void;
  onUndoLastResolution?: () => void;
  onOpenMirrorCategory?: (mirrorKey: string) => void;
  onClose: () => void;
}

function formatSignedCents(cents: number): string {
  if (cents > 0) return `+${formatCents(cents)}`;
  if (cents < 0) return `-${formatCents(Math.abs(cents))}`;
  return formatCents(0);
}

export function CashGeneralDiffModal({
  result,
  manualResolutions = [],
  agendaItems = [],
  initialTab,
  onConfirmSuggestion,
  onRejectSuggestion,
  onManualLink,
  onIgnoreItem,
  onReclassifySystemItem,
  onReclassifySystemItems,
  onScheduleAgendaFromItem,
  onSettleCrossDayAgendaMatch,
  onUndoLastResolution,
  onOpenMirrorCategory,
  onClose
}: CashGeneralDiffModalProps) {
  const summary = useMemo(() => buildGeneralDiffSummary(result), [result]) as ReturnType<typeof buildGeneralDiffSummary> & {
    tableNetDigitalCents: number;
    cashDrawerDiffCents: number;
    cashDrawerHasRealInput: boolean;
    otherNonDigitalRows: NonNullable<CashReconciliationResult['mirrorRows']>;
    otherChannelsDiffCents: number;
    matchedPairsWithDiff: Array<{
      id: string;
      reasonType: string;
      reasonText: string;
      sysSumCents: number;
      realSumCents: number;
      diffCents: number;
    }>;
    matchedPairsDiffCents: number;
    digitalResidualDiffCents: number;
    nonTableDiffCents: number;
  };
  const systemPoolItems = useMemo(
    () => buildLinkableSystemPool(result, manualResolutions) as CashReconciliationItem[],
    [result, manualResolutions]
  );

  const resolveDefaultTab = (): GeneralDiffTabKey => {
    if (initialTab) return initialTab;
    if (summary.missingItems.length > 0 || summary.extraItems.length > 0) return 'tabela';
    if (summary.suggestions.length > 0) return 'sugestoes';
    if (summary.divergentMirrorRows.length > 0) return 'canais';
    return 'conciliados';
  };

  const [activeTab, setActiveTab] = useState<GeneralDiffTabKey>(resolveDefaultTab);
  const [inspectedOp, setInspectedOp] = useState<{
    item: CashReconciliationItem;
    paired: CashReconciliationItem[];
  } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !inspectedOp) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, inspectedOp]);

  const matchedPairs = result.matchedPairs || [];
  const pairedByItemId = useMemo(
    () => buildPairedItemsByIdMap(matchedPairs) as Map<string, CashReconciliationItem[]>,
    [matchedPairs]
  );

  const diffCents = Number(result.diffTotalCents || 0);
  const matchedTotalCents = matchedPairs.reduce((acc, p) => acc + Number(p.amountCents || 0), 0);

  const tabs: Array<{ key: GeneralDiffTabKey; label: string; count: number; badgeClass: string }> = [
    {
      key: 'tabela',
      label: 'Tabela Conciliação Manual',
      count: summary.missingItems.length + summary.extraItems.length,
      badgeClass: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
    },
    {
      key: 'sugestoes',
      label: 'Dicas de Vínculo',
      count: summary.suggestions.length,
      badgeClass: 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
    },
    {
      key: 'canais',
      label: 'Resumo por Canal',
      count: summary.divergentMirrorRows.length,
      badgeClass: 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
    },
    {
      key: 'conciliados',
      label: 'Conciliados',
      count: matchedPairs.length,
      badgeClass: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
    }
  ];

  const modalContent = (
    <div
      className="fixed inset-0 z-[9998] bg-slate-950/80 backdrop-blur-sm sm:p-3 lg:p-4 flex items-end sm:items-stretch justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Diferença Geral — Todos os Valores Não Conciliados"
    >
      <div
        className="w-full h-[94vh] sm:h-full rounded-t-[28px] sm:rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#0b141a] shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Sticky */}
        <div className="shrink-0 border-b border-slate-200 dark:border-[#2a3942] bg-slate-50/95 dark:bg-[#202c33] px-4 sm:px-6 pt-4 pb-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#00a884]/15 border border-[#00a884]/30 text-[#00a884] flex items-center justify-center shrink-0">
                <Table2 size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    Diferença Geral — Pendências do Caixa
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-black tabular-nums ${
                      Math.abs(diffCents) <= 100
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        : diffCents < 0
                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                          : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'
                    }`}
                  >
                    {diffCents > 0 ? '+' : ''}
                    {formatCents(diffCents)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                  Ref: {formatDateBr(result.referenceDate)} • Todos os itens ainda sem vínculo no PDV e no Banco/Maquininha (atualiza em tempo real ao conciliar).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {manualResolutions.length > 0 && onUndoLastResolution && (
                <button
                  type="button"
                  onClick={onUndoLastResolution}
                  className="px-3 py-2 min-h-[38px] rounded-xl border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                  title="Desfazer a última conciliação ou justificativa feita nesta sessão"
                >
                  <RotateCcw size={13} /> Desfazer Último ({manualResolutions.length})
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 min-h-[38px] rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-700 dark:text-[#e9edef] hover:border-[#00a884] active:scale-95 transition-all flex items-center gap-1.5"
              >
                <X size={15} /> Fechar (Esc)
              </button>
            </div>
          </div>

          {/* Composição Global da Diferença Geral por Canal */}
          {summary.divergentMirrorRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/80 dark:border-[#2a3942] bg-white/80 dark:bg-[#111b21]/80 px-3 py-2 text-[11px]">
              <span className="font-black uppercase tracking-wider text-slate-500 dark:text-[#8696a0] mr-1">
                Canais na diferença:
              </span>
              {summary.divergentMirrorRows.map((mr) => {
                const d = Number(mr.diffCents || 0);
                return (
                  <button
                    key={mr.key}
                    type="button"
                    onClick={() => {
                      if (onOpenMirrorCategory) {
                        onClose();
                        onOpenMirrorCategory(mr.key);
                      }
                    }}
                    className={`px-2 py-0.5 rounded-lg font-bold inline-flex items-center gap-1 tabular-nums transition-colors ${
                      d < 0
                        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20'
                        : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20'
                    }`}
                    title={`Clique para abrir conciliação detalhada de ${mr.label}`}
                  >
                    <span>{mr.label}:</span>
                    <span>{d > 0 ? '+' : ''}{formatCents(d)}</span>
                    {mr.hasRealInput === false && (
                      <span className="text-[9.5px] uppercase px-1 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                        não informado
                      </span>
                    )}
                  </button>
                );
              })}
              <span className="ml-auto font-black text-slate-800 dark:text-white tabular-nums">
                Total: {diffCents > 0 ? '+' : ''}{formatCents(diffCents)}
              </span>
            </div>
          )}

          {/* Abas */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2 min-h-[38px] rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 border active:scale-95 transition-all ${
                    isActive
                      ? 'border-[#00a884] bg-[#00a884]/15 text-[#008f6f] dark:text-[#00a884]'
                      : 'border-slate-200 dark:border-[#2a3942] bg-white/80 dark:bg-[#111b21] text-slate-600 dark:text-[#aebac1] hover:border-[#00a884]/50'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black tabular-nums ${tab.badgeClass}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-4">
            {summary.uninformedMirrorRows.length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <span>
                  Atenção: <strong>{summary.uninformedMirrorRows.map((r) => r.label).join(' e ')}</strong> ainda está sem valor real informado ({formatCents(summary.uninformedDiffCents)} no cálculo da Diferença Geral). Preencha o valor contado na aba <strong>Espelho RelConferencia</strong> para zerar essa diferença contábil.
                </span>
              </div>
            )}

            {/* ABA 1: TABELA DE CONCILIAÇÃO MANUAL */}
            {activeTab === 'tabela' && (
              <div className="space-y-4">
                {(summary.nonTableDiffCents !== 0 || summary.cashDrawerDiffCents !== 0 || summary.matchedPairsDiffCents !== 0) && (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/90 dark:bg-[#111b21]/85 p-3.5 sm:p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-[#e9edef]">
                        Composição da Diferença Geral ({formatSignedCents(diffCents)})
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-[#8696a0] tabular-nums">
                        Tabela abaixo ({formatSignedCents(summary.tableNetDigitalCents)}) + Outras origens ({formatSignedCents(summary.nonTableDiffCents)}) ={' '}
                        <strong className="text-slate-900 dark:text-white">{formatSignedCents(diffCents)}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 text-xs">
                      <div className="rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] px-3 py-2.5 space-y-1">
                        <span className="text-[10px] font-black uppercase text-slate-500 dark:text-[#8696a0] block">
                          Pendências Digitais na Tabela
                        </span>
                        <strong
                          className={`text-sm font-black tabular-nums block ${
                            summary.tableNetDigitalCents < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : summary.tableNetDigitalCents > 0
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {formatSignedCents(summary.tableNetDigitalCents)}
                        </strong>
                        <span className="text-[10.5px] text-slate-500 dark:text-[#8696a0] block">
                          Faltas -{formatCents(summary.missingCents)} • Sobras +{formatCents(summary.extraCents)}
                        </span>
                      </div>

                      {(summary.cashDrawerDiffCents !== 0 || !summary.cashDrawerHasRealInput) && (
                        <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 px-3 py-2.5 space-y-1 flex flex-col justify-between">
                          <div>
                            <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-300 block">
                              Gaveta de Dinheiro (Saldo)
                            </span>
                            <strong
                              className={`text-sm font-black tabular-nums block ${
                                summary.cashDrawerDiffCents < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400'
                              }`}
                            >
                              {formatSignedCents(summary.cashDrawerDiffCents)}
                            </strong>
                            <span className="text-[10.5px] text-slate-600 dark:text-[#aebac1] block">
                              {!summary.cashDrawerHasRealInput
                                ? 'Contagem da gaveta ainda não informada'
                                : 'Falta/sobra física na gaveta ou saída não lançada no PDV'}
                            </span>
                          </div>
                          {onOpenMirrorCategory && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenMirrorCategory('saldo_dinheiro');
                              }}
                              className="mt-1 text-left text-[11px] font-bold text-[#00a884] hover:underline inline-flex items-center gap-1"
                            >
                              Justificar / Ajustar Gaveta <ChevronRight size={12} />
                            </button>
                          )}
                        </div>
                      )}

                      {summary.matchedPairsDiffCents !== 0 && (
                        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-3 py-2.5 space-y-1 flex flex-col justify-between">
                          <div>
                            <span className="text-[10px] font-black uppercase text-cyan-700 dark:text-cyan-300 block">
                              Diferenças em Vínculos ({summary.matchedPairsWithDiff.length})
                            </span>
                            <strong
                              className={`text-sm font-black tabular-nums block ${
                                summary.matchedPairsDiffCents < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400'
                              }`}
                            >
                              {formatSignedCents(summary.matchedPairsDiffCents)}
                            </strong>
                            <span className="text-[10.5px] text-slate-600 dark:text-[#aebac1] block truncate" title={summary.matchedPairsWithDiff.map((p) => `${p.reasonText || 'Vínculo'}: ${formatSignedCents(p.diffCents)}`).join(' | ')}>
                              {summary.matchedPairsWithDiff[0]?.reasonText || 'Pequena diferença mantida ao vincular PDV × Banco'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab('conciliados')}
                            className="mt-1 text-left text-[11px] font-bold text-[#00a884] hover:underline inline-flex items-center gap-1"
                          >
                            Ver em Conciliados <ChevronRight size={12} />
                          </button>
                        </div>
                      )}

                      {(summary.otherChannelsDiffCents !== 0 || summary.digitalResidualDiffCents !== 0) && (
                        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-3 py-2.5 space-y-1 flex flex-col justify-between">
                          <div>
                            <span className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-300 block">
                              Outros Canais / Ajustes Digitais
                            </span>
                            <strong
                              className={`text-sm font-black tabular-nums block ${
                                summary.otherChannelsDiffCents + summary.digitalResidualDiffCents < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-indigo-600 dark:text-indigo-400'
                              }`}
                            >
                              {formatSignedCents(summary.otherChannelsDiffCents + summary.digitalResidualDiffCents)}
                            </strong>
                            <span className="text-[10.5px] text-slate-600 dark:text-[#aebac1] block">
                              {summary.otherNonDigitalRows.length > 0
                                ? summary.otherNonDigitalRows.map((r) => `${r.label}: ${formatSignedCents(Number(r.diffCents || 0))}`).join(' • ')
                                : 'Trocas Dinheiro → Digital ou ajustes/regras'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab('canais')}
                            className="mt-1 text-left text-[11px] font-bold text-[#00a884] hover:underline inline-flex items-center gap-1"
                          >
                            Ver Resumo por Canal <ChevronRight size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <CashManualReconciliationTable
                  missingItems={summary.missingItems}
                  extraItems={summary.extraItems}
                  extraSystemPoolItems={systemPoolItems}
                  agendaItems={agendaItems}
                  currentReferenceDate={result.referenceDate}
                  onManualLink={onManualLink}
                  onIgnoreItem={onIgnoreItem}
                  onScheduleAgendaFromItem={onScheduleAgendaFromItem}
                  onSettleCrossDayAgendaMatch={onSettleCrossDayAgendaMatch}
                  onInspectOperation={(it) => setInspectedOp({ item: it, paired: pairedByItemId.get(it.id) || [] })}
                />
              </div>
            )}

            {/* ABA 2: DICAS DE VÍNCULO (SUGESTÕES) */}
            {activeTab === 'sugestoes' && (
              <div className="space-y-3">
                {summary.suggestions.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/50 py-10 text-center space-y-2">
                    <CheckCircle2 size={30} className="mx-auto text-emerald-500" />
                    <p className="text-xs font-bold text-slate-700 dark:text-[#e9edef]">
                      Todas as dicas automáticas de vínculo já foram analisadas!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {summary.suggestions.map((sug: CashSuggestion) => (
                      <CashSuggestionCard
                        key={sug.id}
                        suggestion={sug}
                        onConfirmSuggestion={onConfirmSuggestion}
                        onRejectSuggestion={onRejectSuggestion}
                        onReclassifySystemItems={(ids, cat) => {
                          if (onReclassifySystemItems) {
                            onReclassifySystemItems(ids, cat);
                          } else if (onReclassifySystemItem) {
                            ids.forEach((id) => onReclassifySystemItem(id, cat));
                          }
                        }}
                        onInspectOperation={(item) =>
                          setInspectedOp({ item, paired: pairedByItemId.get(item.id) || [] })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ABA 3: RESUMO POR CANAL */}
            {activeTab === 'canais' && (
              <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/80 overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 dark:bg-[#111b21] border-b border-slate-200 dark:border-[#2a3942] text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-[#8696a0]">
                    <tr>
                      <th className="py-3 px-4">Canal / Forma</th>
                      <th className="py-3 px-4 text-right">Sistema (PDV)</th>
                      <th className="py-3 px-4 text-right">Real Apurado</th>
                      <th className="py-3 px-4 text-right">Diferença</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                    {summary.divergentMirrorRows.map((mr) => {
                      const d = Number(mr.diffCents || 0);
                      return (
                        <tr key={mr.key} className="hover:bg-slate-50/70 dark:hover:bg-[#111b21]/50">
                          <td className="py-3 px-4">
                            <p className="font-bold text-slate-800 dark:text-white">{mr.label}</p>
                            {mr.sourceNote && (
                              <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">{mr.sourceNote}</p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold tabular-nums">{formatCents(mr.systemCents)}</td>
                          <td className="py-3 px-4 text-right font-semibold tabular-nums">
                            {mr.hasRealInput === false ? (
                              <span className="text-amber-600 dark:text-amber-400">Não informado</span>
                            ) : (
                              formatCents(mr.realCents)
                            )}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-black tabular-nums ${
                              d < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400'
                            }`}
                          >
                            {d > 0 ? '+' : ''}
                            {formatCents(d)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {onOpenMirrorCategory && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onOpenMirrorCategory(mr.key);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-[#00a884]/15 text-[#00a884] text-[11px] font-bold inline-flex items-center gap-1 hover:bg-[#00a884]/25"
                              >
                                Detalhar <ChevronRight size={12} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ABA 4: CONCILIADOS */}
            {activeTab === 'conciliados' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-xs">
                  <span className="font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Transações Já Conciliadas ({matchedPairs.length})
                  </span>
                  <strong className="text-sm font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {formatCents(matchedTotalCents)}
                  </strong>
                </div>

                {matchedPairs.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">Nenhum par conciliado ainda.</p>
                ) : (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/80 divide-y divide-slate-100 dark:divide-[#2a3942] text-xs">
                    {matchedPairs.map((pair) => {
                      const primaryOp = (pair.systemItems || [])[0] || (pair.realItems || [])[0];
                      const pairedList = [...(pair.systemItems || []), ...(pair.realItems || [])];
                      return (
                        <div key={pair.id} className="px-4 py-2.5 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                          <div className="md:col-span-2">
                            <span className="font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                              {formatCents(pair.amountCents)}
                            </span>
                            <span className="block text-[10px] uppercase font-bold text-slate-400">
                              {pair.matchType === 'matched_manual' ? 'Manual' : 'Automático'}
                            </span>
                          </div>
                          <div className="md:col-span-4 truncate">
                            {(pair.systemItems || []).map((s) => `${s.timeStr} • ${s.description}`).join(' + ')}
                          </div>
                          <div className="md:col-span-4 truncate text-slate-600 dark:text-[#aebac1]">
                            {(pair.realItems || []).map((r) => `[${r.source?.toUpperCase()}] ${r.timeStr} • ${r.description}`).join(' + ')}
                          </div>
                          <div className="md:col-span-2 flex md:justify-end items-center gap-1.5">
                            {primaryOp && (
                              <button
                                type="button"
                                onClick={() => setInspectedOp({ item: primaryOp, paired: pairedList })}
                                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#111b21] text-[10.5px] font-bold inline-flex items-center gap-1 hover:text-[#00a884]"
                              >
                                <ShoppingBag size={10} /> Itens
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <CashOperationDetailModal
        operationItem={inspectedOp?.item || null}
        pairedItems={inspectedOp?.paired || []}
        result={result}
        onReclassifySystemItem={onReclassifySystemItem}
        onScheduleAgendaFromItem={onScheduleAgendaFromItem}
        onClose={() => setInspectedOp(null)}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
