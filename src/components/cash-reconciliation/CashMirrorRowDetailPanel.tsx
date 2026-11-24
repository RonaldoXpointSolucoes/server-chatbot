import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  XCircle,
  Link2,
  ArrowRightLeft,
  RotateCcw,
  EyeOff,
  Search,
  ShoppingBag,
  X,
  Filter,
  Sparkles,
  ArrowUpDown,
  Clock,
  Table2
} from 'lucide-react';
import {
  CashMirrorRow,
  CashReconciliationItem,
  CashReconciliationResult,
  CashSuggestion,
  formatCents
} from '../../types/cashReconciliation';
import {
  RECONCILIATION_GLOSSARY,
  buildLinkableSystemPool,
  buildMirrorRowDetails,
  filterAndSortDetailItems,
  filterMatchedPairsForDetail,
  findBestCandidateForSobra,
  formatDateBr,
  resolveDetailPanelDefaultTab
} from '../../utils/cashReconciliationServiceHelper.mjs';
import { CashManualReconciliationTable } from './CashManualReconciliationTable';
import { CashOperationDetailModal } from './CashOperationDetailModal';

export type CashSystemCategoryTarget = 'dinheiro' | 'cartao' | 'pix' | 'pendente';
type DetailTabKey = 'sobras' | 'faltas' | 'tabela' | 'sugestoes' | 'conciliados' | 'todos';
type DetailSortKey = 'amount_desc' | 'time_asc' | 'amount_asc' | 'time_desc';

const CATEGORY_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  pix: 'Pix',
  pendente: 'Pendente'
};

const SOURCE_LABELS: Record<string, string> = {
  ofx: 'OFX Banco',
  rede: 'Rede',
  c6pay: 'C6 Pay',
  pdv: 'PDV'
};

function itemMatchesQuery(it: CashReconciliationItem, qLower: string): boolean {
  if (!qLower) return true;
  const brVal = (Number(it.amountCents || 0) / 100).toFixed(2).replace('.', ',');
  return `${it.description} ${it.referenceCode} ${it.operatorName} ${it.terminalName} ${it.source} ${it.timeStr} ${(it.amountCents / 100).toFixed(2)} ${brVal}`
    .toLowerCase()
    .includes(qLower);
}

interface ReconciliationBridgeData {
  extraCents: number;
  missingCents: number;
  netPendingCents: number;
  crossCategoryRealInCents: number;
  crossCategorySysOutCents: number;
  crossCategoryNetCents: number;
  sameCategoryDeltaCents: number;
  otherDeltaCents: number;
  mirrorDiffCents: number;
  crossCategoryPairs: NonNullable<CashReconciliationResult['matchedPairs']>;
}

interface CashMirrorRowDetailPanelProps {
  row: CashMirrorRow;
  switchableRows?: CashMirrorRow[];
  result: CashReconciliationResult;
  onSelectMirrorKey?: (key: string) => void;
  onConfirmSuggestion: (suggestionId: string) => void;
  onRejectSuggestion: (suggestionId: string) => void;
  onManualLink: (systemIds: string[], realIds: string[], note?: string) => void;
  onIgnoreItem: (side: 'system' | 'real', id: string) => void;
  onReclassifySystemItem: (systemId: string, targetCategory: CashSystemCategoryTarget | null) => void;
  onClose: () => void;
}

export function CashMirrorRowDetailPanel({
  row,
  switchableRows = [],
  result,
  onSelectMirrorKey,
  onConfirmSuggestion,
  onRejectSuggestion,
  onManualLink,
  onIgnoreItem,
  onReclassifySystemItem,
  onClose
}: CashMirrorRowDetailPanelProps) {
  const details = useMemo(() => buildMirrorRowDetails(result, row.key), [result, row.key]);

  const {
    categories,
    matchedPairs,
    suggestions,
    missingItems,
    extraItems,
    systemCategoryItems,
    reclassifiedOutItems,
    pendingDebtors,
    saidasDetalhadas,
    reconciliationBridge
  } = details as {
    categories: string[];
    matchedPairs: NonNullable<CashReconciliationResult['matchedPairs']>;
    suggestions: CashSuggestion[];
    missingItems: CashReconciliationItem[];
    extraItems: CashReconciliationItem[];
    systemCategoryItems: CashReconciliationItem[];
    reclassifiedOutItems: CashReconciliationItem[];
    pendingDebtors: Array<{ debtor: string; amountCents: number }>;
    saidasDetalhadas: Array<{ label: string; amountCents: number; isSangria: boolean; isManualAdjustment?: boolean; direction?: 'outflow' | 'inflow'; operator?: string }>;
    reconciliationBridge: ReconciliationBridgeData;
  };

  const diff = Number(row.diffCents || 0);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<DetailTabKey>(() =>
    resolveDetailPanelDefaultTab({
      diffCents: diff,
      extraCount: extraItems.length,
      missingCount: missingItems.length,
      suggestionsCount: suggestions.length,
      matchedCount: matchedPairs.length
    }) as DetailTabKey
  );
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<DetailSortKey>('amount_desc');
  const [onlyMadrugada, setOnlyMadrugada] = useState(false);
  const [onlyWithCandidate, setOnlyWithCandidate] = useState(false);
  const [linkingSystemId, setLinkingSystemId] = useState<string | null>(null);
  const [linkingRealId, setLinkingRealId] = useState<string>('');
  const [linkingExtraId, setLinkingExtraId] = useState<string | null>(null);
  const [linkingExtraSysId, setLinkingExtraSysId] = useState<string>('');
  const [inspectedOp, setInspectedOp] = useState<{
    item: CashReconciliationItem;
    paired: CashReconciliationItem[];
  } | null>(null);

  useEffect(() => {
    setSourceFilter('all');
    setOnlyMadrugada(false);
    setOnlyWithCandidate(false);
    setSortBy('amount_desc');
    setActiveTab(
      resolveDetailPanelDefaultTab({
        diffCents: Number(row.diffCents || 0),
        extraCount: extraItems.length,
        missingCount: missingItems.length,
        suggestionsCount: suggestions.length,
        matchedCount: matchedPairs.length
      }) as DetailTabKey
    );
  }, [row.key]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !inspectedOp) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, inspectedOp]);

  const pairedByItemId = useMemo(() => {
    const map = new Map<string, CashReconciliationItem[]>();
    for (const pair of matchedPairs) {
      const combined = [...(pair.systemItems || []), ...(pair.realItems || [])];
      for (const item of combined) {
        map.set(item.id, combined);
      }
    }
    return map;
  }, [matchedPairs]);

  const matchedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of matchedPairs) {
      for (const s of m.systemItems || []) ids.add(s.id);
    }
    return ids;
  }, [matchedPairs]);

  const allExtras = result.extraInBank || [];

  const linkableSystemPool = useMemo(
    () => buildLinkableSystemPool(result) as CashReconciliationItem[],
    [result]
  );

  const candidateByExtraId = useMemo(() => {
    const map = new Map<
      string,
      { item: CashReconciliationItem; amountDiffCents: number; isExactAmount: boolean; timeDiffSec: number }
    >();
    for (const ex of extraItems) {
      const cand = findBestCandidateForSobra(ex, linkableSystemPool, 200);
      if (cand) map.set(ex.id, cand);
    }
    return map;
  }, [extraItems, linkableSystemPool]);

  const extraSourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ex of extraItems) {
      const src = String(ex.source || 'outro').toLowerCase();
      counts.set(src, (counts.get(src) || 0) + 1);
    }
    return Array.from(counts.entries());
  }, [extraItems]);

  const madrugadaExtrasCount = useMemo(
    () => extraItems.filter((ex) => Number(ex.secondsOfDay || 0) < 6 * 3600).length,
    [extraItems]
  );

  const qLower = searchTerm.trim().toLowerCase();
  const filteredMissing = useMemo(
    () =>
      filterAndSortDetailItems(missingItems, {
        query: searchTerm,
        sourceFilter: 'all',
        sortBy
      }) as CashReconciliationItem[],
    [missingItems, searchTerm, sortBy]
  );

  const filteredExtra = useMemo(
    () =>
      filterAndSortDetailItems(extraItems, {
        query: searchTerm,
        sourceFilter,
        sortBy,
        onlyMadrugada,
        onlyWithCandidate,
        candidateMap: candidateByExtraId
      }) as CashReconciliationItem[],
    [extraItems, searchTerm, sourceFilter, sortBy, onlyMadrugada, onlyWithCandidate, candidateByExtraId]
  );

  const filteredMatchedPairs = useMemo(
    () =>
      filterMatchedPairsForDetail(matchedPairs, {
        query: searchTerm,
        sourceFilter
      }) as NonNullable<CashReconciliationResult['matchedPairs']>,
    [matchedPairs, searchTerm, sourceFilter]
  );

  const sortedSystemItems = useMemo(() => {
    const filtered = systemCategoryItems.filter((it) => itemMatchesQuery(it, qLower));
    filtered.sort((a, b) => {
      const aMatched = matchedIds.has(a.id) ? 1 : 0;
      const bMatched = matchedIds.has(b.id) ? 1 : 0;
      if (aMatched !== bMatched) return aMatched - bMatched;
      if (sortBy === 'amount_desc') return Number(b.amountCents || 0) - Number(a.amountCents || 0);
      if (sortBy === 'amount_asc') return Number(a.amountCents || 0) - Number(b.amountCents || 0);
      if (sortBy === 'time_desc') return Number(b.secondsOfDay || 0) - Number(a.secondsOfDay || 0);
      return (a.secondsOfDay || 0) - (b.secondsOfDay || 0);
    });
    return filtered;
  }, [systemCategoryItems, matchedIds, qLower, sortBy]);

  const matchedTotalCents = matchedPairs.reduce((acc, m) => acc + Number(m.amountCents || 0), 0);
  const filteredExtraCents = filteredExtra.reduce((acc, ex) => acc + Number(ex.amountCents || 0), 0);
  const hasRede12hPairs = matchedPairs.some((p) => String(p.reasonText || '').includes('12h'));
  const targetChoicesForCategory = (cat: string): CashSystemCategoryTarget[] =>
    (['dinheiro', 'cartao', 'pix', 'pendente'] as CashSystemCategoryTarget[]).filter((c) => c !== cat);

  const detailTabs: Array<{ key: DetailTabKey; label: string; count: number; badgeClass: string }> = [
    {
      key: 'sobras',
      label: 'Sobras no Banco',
      count: extraItems.length,
      badgeClass: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
    },
    {
      key: 'faltas',
      label: 'Faltas no PDV',
      count: missingItems.length,
      badgeClass: 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
    },
    {
      key: 'tabela',
      label: 'Tabela Lado a Lado',
      count: missingItems.length + extraItems.length,
      badgeClass: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300'
    },
    {
      key: 'sugestoes',
      label: 'Sugestões',
      count: suggestions.length,
      badgeClass: 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
    },
    {
      key: 'conciliados',
      label: 'Conciliados Auto',
      count: matchedPairs.length,
      badgeClass: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
    },
    {
      key: 'todos',
      label: 'Todos do PDV',
      count: systemCategoryItems.length,
      badgeClass: 'bg-slate-200 dark:bg-[#2a3942] text-slate-700 dark:text-[#aebac1]'
    }
  ];

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm sm:p-3 lg:p-4 flex items-stretch justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Conciliação Detalhada — ${row.label}`}
    >
      <div
        className="w-full h-full rounded-none sm:rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#0b141a] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho Sticky Full-Screen */}
        <div className="shrink-0 border-b border-slate-200 dark:border-[#2a3942] bg-slate-50/95 dark:bg-[#202c33] px-4 sm:px-6 pt-4 pb-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                Conciliação Detalhada — {row.label}
              </h3>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-black tabular-nums ${
                  Math.abs(diff) <= 1
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : diff < 0
                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                      : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400'
                }`}
              >
                Diferença: {diff > 0 ? '+' : ''}
                {formatCents(diff)}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 min-h-[38px] rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-700 dark:text-[#e9edef] hover:border-[#00a884] active:scale-95 transition-all flex items-center gap-1.5"
            >
              <X size={15} /> Fechar (Esc)
            </button>
          </div>

          {/* Barra de Resumo + Troca Rápida de Linha */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] font-semibold">
                Sistema: <strong className="tabular-nums text-slate-900 dark:text-white">{formatCents(row.systemCents)}</strong>
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] font-semibold">
                Real: <strong className="tabular-nums text-emerald-600 dark:text-emerald-400">{formatCents(row.realCents)}</strong>
              </span>
              <span className="px-2.5 py-1.5 rounded-xl bg-slate-200/70 dark:bg-[#111b21] text-[11px] font-bold text-slate-600 dark:text-[#aebac1]">
                {matchedPairs.length} conciliado(s) • {suggestions.length} sugestão(ões) • {missingItems.length} faltando(s) • {extraItems.length} sobra(s)
              </span>
            </div>

            {switchableRows.length > 1 && onSelectMirrorKey && (
              <div className="flex flex-wrap items-center gap-1">
                {switchableRows.map((sr) => (
                  <button
                    key={sr.key}
                    type="button"
                    onClick={() => onSelectMirrorKey(sr.key)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold active:scale-95 transition-all ${
                      sr.key === row.key
                        ? 'bg-[#00a884] text-white'
                        : 'bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1] hover:border-[#00a884]'
                    }`}
                  >
                    {sr.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {(row.isAuto ||
            reconciliationBridge.extraCents > 0 ||
            reconciliationBridge.missingCents > 0 ||
            reconciliationBridge.crossCategoryNetCents !== 0) && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/80 dark:border-[#2a3942] bg-white/80 dark:bg-[#111b21]/80 px-3 py-2 text-[11px]">
              <span className="font-black uppercase tracking-wider text-slate-500 dark:text-[#8696a0] mr-1">
                Composição da diferença:
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('sobras')}
                className="px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold hover:bg-indigo-500/20 tabular-nums transition-colors"
                title="Clique para ir para Sobras no Banco"
              >
                + Sobras: {formatCents(reconciliationBridge.extraCents)}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('faltas')}
                className="px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 font-bold hover:bg-rose-500/20 tabular-nums transition-colors"
                title="Clique para ir para Faltas no PDV"
              >
                − Faltas: {formatCents(reconciliationBridge.missingCents)}
              </button>
              {reconciliationBridge.crossCategoryNetCents !== 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('conciliados')}
                  className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold hover:bg-emerald-500/20 tabular-nums transition-colors"
                  title="Lançamentos recebidos nesta forma cujo PDV estava em outra categoria (já conciliados em Conciliados Auto)"
                >
                  {reconciliationBridge.crossCategoryNetCents > 0 ? '+' : '−'} Trocas já conciliadas:{' '}
                  {formatCents(Math.abs(reconciliationBridge.crossCategoryNetCents))}
                </button>
              )}
              {Math.abs(reconciliationBridge.otherDeltaCents) > 0 && (
                <span
                  className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold tabular-nums"
                  title="Ajuste de cabeçalho RelConferencia / arredondamento dentro da tolerância"
                >
                  {reconciliationBridge.otherDeltaCents > 0 ? '+' : '−'} Ajuste RelConf/tol.:{' '}
                  {formatCents(Math.abs(reconciliationBridge.otherDeltaCents))}
                </span>
              )}
              <span className="ml-auto font-black text-slate-800 dark:text-white tabular-nums">
                = {diff > 0 ? '+' : ''}{formatCents(diff)}
              </span>
            </div>
          )}

          {/* Abas Focadas no Problema + Filtros Auxiliares de Conciliação */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0">
              {detailTabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.key);
                      setSourceFilter('all');
                      setOnlyMadrugada(false);
                      setOnlyWithCandidate(false);
                    }}
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

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar valor, cliente, hora, NSU..."
                  className="w-full pl-8 pr-7 py-1.5 min-h-[36px] rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    title="Limpar busca"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {(activeTab === 'sobras' || activeTab === 'faltas' || activeTab === 'todos') && (
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] px-2.5 py-1 min-h-[36px] text-xs">
                  <ArrowUpDown size={12} className="text-slate-400 shrink-0" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as DetailSortKey)}
                    aria-label="Ordenação"
                    className="bg-transparent text-xs font-semibold text-slate-700 dark:text-[#e9edef] focus:outline-none"
                  >
                    <option value="amount_desc" className="dark:bg-[#202c33]">Maior Valor ↓</option>
                    <option value="time_asc" className="dark:bg-[#202c33]">Horário ↑</option>
                    <option value="time_desc" className="dark:bg-[#202c33]">Horário ↓</option>
                    <option value="amount_asc" className="dark:bg-[#202c33]">Menor Valor ↑</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Barra Secundária de Filtros Contextuais por Origem/Regra */}
          {activeTab === 'sobras' && extraItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 font-bold text-slate-500 dark:text-[#8696a0] mr-1">
                <Filter size={11} /> Filtrar sobras:
              </span>
              <button
                type="button"
                onClick={() => setSourceFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-bold border transition-all ${
                  sourceFilter === 'all'
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white dark:bg-[#111b21] border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1]'
                }`}
              >
                Todas ({extraItems.length})
              </button>
              {extraSourceCounts.map(([src, count]) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSourceFilter(sourceFilter === src ? 'all' : src)}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition-all ${
                    sourceFilter === src
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white dark:bg-[#111b21] border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1]'
                  }`}
                >
                  {SOURCE_LABELS[src] || src.toUpperCase()} ({count})
                </button>
              ))}
              {candidateByExtraId.size > 0 && (
                <button
                  type="button"
                  onClick={() => setOnlyWithCandidate((v) => !v)}
                  className={`px-2.5 py-1 rounded-lg font-bold border inline-flex items-center gap-1 transition-all ${
                    onlyWithCandidate
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  <Sparkles size={11} /> Com par possível no PDV ({candidateByExtraId.size})
                </button>
              )}
              {madrugadaExtrasCount > 0 && (
                <button
                  type="button"
                  onClick={() => setOnlyMadrugada((v) => !v)}
                  className={`px-2.5 py-1 rounded-lg font-bold border inline-flex items-center gap-1 transition-all ${
                    onlyMadrugada
                      ? 'bg-amber-600 border-amber-600 text-white'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  <Clock size={11} /> Horário &lt; 06h ({madrugadaExtrasCount})
                </button>
              )}
            </div>
          )}

          {activeTab === 'conciliados' && matchedPairs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 font-bold text-slate-500 dark:text-[#8696a0] mr-1">
                <Filter size={11} /> Origem conciliada:
              </span>
              {[
                { key: 'all', label: `Todos (${matchedPairs.length})` },
                { key: 'ofx', label: 'OFX Banco' },
                { key: 'rede', label: 'Rede' },
                { key: 'c6pay', label: 'C6 Pay' },
                ...(hasRede12hPairs ? [{ key: 'rede_12h', label: 'Rede 12h ajustado' }] : []),
                { key: 'manual', label: 'Manuais / Confirmados' }
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSourceFilter(sourceFilter === opt.key ? 'all' : opt.key)}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition-all ${
                    sourceFilter === opt.key
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white dark:bg-[#111b21] border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Corpo Rolável Focado na Aba Ativa */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-4">
            {/* ABA 1: SOBRAS NO BANCO / MAQUININHA */}
            {activeTab === 'sobras' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-500/25 bg-indigo-500/5 px-4 py-3 text-xs">
                  <div className="text-indigo-900 dark:text-indigo-200 space-y-0.5">
                    <p className="font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      {RECONCILIATION_GLOSSARY.extra.title} ({filteredExtra.length} de {extraItems.length})
                    </p>
                    <p className="text-[11px] font-semibold">
                      {RECONCILIATION_GLOSSARY.extra.explanation}
                    </p>
                    <p className="text-[10.5px] opacity-85">
                      {RECONCILIATION_GLOSSARY.extra.actionHint}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="text-right">
                      <span className="text-sm font-black text-indigo-700 dark:text-indigo-300 tabular-nums block">
                        {filteredExtra.length !== extraItems.length
                          ? `Exibindo ${formatCents(filteredExtraCents)} de ${formatCents(reconciliationBridge.extraCents)}`
                          : `Soma das Sobras: ${formatCents(filteredExtraCents)}`}
                      </span>
                      <span className="text-[10.5px] text-indigo-700/80 dark:text-indigo-300/80">
                        Diferença do card ({diff > 0 ? '+' : ''}{formatCents(diff)}) = Sobras − Faltas{reconciliationBridge.crossCategoryNetCents !== 0 ? ' ± trocas' : ''}
                      </span>
                    </div>
                    {(missingItems.length > 0 || extraItems.length > 0) && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('tabela')}
                        className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-[11px] font-bold inline-flex items-center gap-1 active:scale-95 transition-all"
                      >
                        <Table2 size={12} /> Abrir em Tabela Lado a Lado
                      </button>
                    )}
                  </div>
                </div>

                {filteredExtra.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/50 py-10 text-center space-y-2">
                    <CheckCircle2 size={30} className="mx-auto text-emerald-500" />
                    <p className="text-xs font-bold text-slate-700 dark:text-[#e9edef]">
                      Nenhuma sobra pendente para os filtros selecionados.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {filteredExtra.map((ex) => {
                      const bestCandidate = candidateByExtraId.get(ex.id);
                      return (
                        <div
                          key={ex.id}
                          className="rounded-2xl bg-white dark:bg-[#202c33] border border-indigo-500/25 hover:border-indigo-500/50 p-3.5 space-y-2.5 shadow-sm transition-all"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                              {formatCents(ex.amountCents)}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#111b21] text-[10.5px] font-bold uppercase text-slate-600 dark:text-[#aebac1]">
                              {SOURCE_LABELS[ex.source?.toLowerCase()] || ex.source} • {formatDateBr(ex.dateStr)} {ex.timeStr}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-800 dark:text-[#e9edef] break-words">
                            {ex.description}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                            Terminal: {ex.terminalName || '-'} • Ref: {ex.referenceCode || '-'}
                          </p>

                          {bestCandidate && (
                            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="text-[11px] text-emerald-900 dark:text-emerald-200 min-w-0">
                                <p className="font-black flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                  <Sparkles size={11} className="shrink-0" />
                                  {bestCandidate.isExactAmount
                                    ? 'Par com valor idêntico encontrado no PDV:'
                                    : `Par aproximado (dif. ${formatCents(bestCandidate.amountDiffCents)}):`}
                                </p>
                                <p className="truncate font-semibold">
                                  {bestCandidate.item.timeStr} • {bestCandidate.item.description} ({formatCents(bestCandidate.item.amountCents)})
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => onManualLink([bestCandidate.item.id], [ex.id])}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shrink-0 active:scale-95 transition-all"
                              >
                                Vincular Agora
                              </button>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {linkableSystemPool.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setLinkingExtraId(linkingExtraId === ex.id ? null : ex.id);
                                  setLinkingExtraSysId(bestCandidate?.item.id || '');
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-[#00a884]/15 text-[#00a884] text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all"
                              >
                                <Link2 size={11} /> Vincular Outro PDV
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onIgnoreItem('real', ex.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#111b21] text-[11px] font-bold text-slate-600 dark:text-[#aebac1] hover:text-rose-500 flex items-center gap-1 active:scale-95 transition-all"
                            >
                              <EyeOff size={11} /> Ignorar (Não-PDV)
                            </button>
                          </div>

                          {linkingExtraId === ex.id && (
                            <div className="flex items-center gap-2 pt-1.5">
                              <select
                                value={linkingExtraSysId}
                                onChange={(e) => setLinkingExtraSysId(e.target.value)}
                                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs"
                              >
                                <option value="">Escolha a venda PDV...</option>
                                {linkableSystemPool.map((sys) => (
                                  <option key={sys.id} value={sys.id}>
                                    {formatCents(sys.amountCents)} • {CATEGORY_LABELS[sys.category] || sys.category} • {sys.timeStr} • {sys.description}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={!linkingExtraSysId}
                                onClick={() => {
                                  if (linkingExtraSysId) {
                                    onManualLink([linkingExtraSysId], [ex.id]);
                                    setLinkingExtraId(null);
                                    setLinkingExtraSysId('');
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#00a884] disabled:opacity-40 text-white text-xs font-bold shrink-0"
                              >
                                Vincular
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ABA 2: FALTAM NO BANCO / MAQUININHA */}
            {activeTab === 'faltas' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-500/25 bg-rose-500/5 px-4 py-3 text-xs">
                  <div className="text-rose-900 dark:text-rose-200 space-y-0.5">
                    <p className="font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                      {RECONCILIATION_GLOSSARY.missing.title} ({filteredMissing.length})
                    </p>
                    <p className="text-[11px] font-semibold">
                      {RECONCILIATION_GLOSSARY.missing.explanation}
                    </p>
                    <p className="text-[10.5px] opacity-85">
                      {RECONCILIATION_GLOSSARY.missing.actionHint}
                    </p>
                  </div>
                  {(missingItems.length > 0 || extraItems.length > 0) && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('tabela')}
                      className="px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-[11px] font-bold inline-flex items-center gap-1 shrink-0 active:scale-95 transition-all"
                    >
                      <Table2 size={12} /> Abrir em Tabela Lado a Lado
                    </button>
                  )}
                </div>
                {filteredMissing.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/50 py-10 text-center">
                    <p className="text-xs text-slate-500">Nenhuma falta pendente para este filtro.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {filteredMissing.map((it) => (
                      <div
                        key={it.id}
                        className="rounded-2xl bg-white dark:bg-[#202c33] border border-rose-500/25 p-3.5 space-y-2 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base font-black text-rose-600 dark:text-rose-400 tabular-nums">
                            {formatCents(it.amountCents)}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                            {it.timeStr} • {it.operatorName || '-'} • {it.terminalName || '-'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-[#e9edef]">{it.description}</p>
                        {it.metadata?.operationalAlerts?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {it.metadata.operationalAlerts.map((al, alIdx) => (
                              <span
                                key={`${al.code}_${alIdx}`}
                                title={al.detail}
                                className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-700 dark:text-amber-300"
                              >
                                ⚠ {al.label}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {it.metadata?.orderDetail && (
                          <p className="text-[11px] text-indigo-600 dark:text-indigo-300 font-medium truncate">
                            {it.metadata.orderDetail.items.length} item(ns):{' '}
                            {it.metadata.orderDetail.items.slice(0, 2).map((x) => `${x.qty}x ${x.displayName}`).join(', ')}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => setInspectedOp({ item: it, paired: pairedByItemId.get(it.id) || [] })}
                            className="px-2.5 py-1 rounded-lg bg-[#00a884]/15 text-[#00a884] text-[11px] font-bold flex items-center gap-1"
                          >
                            <ShoppingBag size={11} />
                            {it.metadata?.orderDetail ? `Ver Itens (${it.metadata.orderDetail.items.length})` : 'Detalhes'}
                          </button>
                          {targetChoicesForCategory(it.category).map((targetCat) => (
                            <button
                              key={targetCat}
                              type="button"
                              onClick={() => onReclassifySystemItem(it.id, targetCat)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#111b21] hover:bg-[#00a884]/15 hover:text-[#00a884] text-[11px] font-bold text-slate-600 dark:text-[#aebac1]"
                            >
                              Foi {CATEGORY_LABELS[targetCat]}
                            </button>
                          ))}
                          {allExtras.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setLinkingSystemId(linkingSystemId === it.id ? null : it.id);
                                setLinkingRealId('');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold flex items-center gap-1"
                            >
                              <Link2 size={11} /> Vincular Sobra
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onIgnoreItem('system', it.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#111b21] text-[11px] font-bold text-slate-500 hover:text-rose-500 flex items-center gap-1"
                          >
                            <EyeOff size={11} /> Justificar
                          </button>
                        </div>
                        {linkingSystemId === it.id && (
                          <div className="flex items-center gap-2 pt-1.5">
                            <select
                              value={linkingRealId}
                              onChange={(e) => setLinkingRealId(e.target.value)}
                              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs"
                            >
                              <option value="">Escolha a sobra...</option>
                              {allExtras.map((ex) => (
                                <option key={ex.id} value={ex.id}>
                                  {formatCents(ex.amountCents)} • {ex.source.toUpperCase()} • {ex.timeStr} • {ex.description}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={!linkingRealId}
                              onClick={() => {
                                if (linkingRealId) {
                                  onManualLink([it.id], [linkingRealId]);
                                  setLinkingSystemId(null);
                                  setLinkingRealId('');
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#00a884] disabled:opacity-40 text-white text-xs font-bold shrink-0"
                            >
                              Vincular
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ABA: TABELA LADO A LADO DE CONCILIAÇÃO MANUAL */}
            {activeTab === 'tabela' && (
              <CashManualReconciliationTable
                missingItems={missingItems}
                extraItems={extraItems}
                extraSystemPoolItems={linkableSystemPool}
                onManualLink={onManualLink}
                onIgnoreItem={onIgnoreItem}
                onInspectOperation={(it) => setInspectedOp({ item: it, paired: pairedByItemId.get(it.id) || [] })}
                emptyMissingMessage={`Nenhuma venda de ${row.label} aguardando recebimento!`}
                emptyExtraMessage={`Nenhum recebimento de ${row.label} sem venda no PDV!`}
              />
            )}

            {/* ABA 3: SUGESTÕES DE EQUIVALÊNCIA */}
            {activeTab === 'sugestoes' && (
              <div className="space-y-3">
                {suggestions.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/50 py-10 text-center space-y-2">
                    <CheckCircle2 size={30} className="mx-auto text-emerald-500" />
                    <p className="text-xs font-bold text-slate-700 dark:text-[#e9edef]">
                      Nenhuma sugestão automática pendente para {row.label}.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {suggestions.map((sug) => (
                      <div
                        key={sug.id}
                        className="rounded-2xl border border-amber-500/30 bg-white dark:bg-[#202c33] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            {sug.reasonType === 'small_diff' && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase">
                                Pequena Diferença
                              </span>
                            )}
                            <span className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                              {formatCents(sug.amountCents)}
                            </span>
                          </div>
                          <p className="text-[11.5px] font-semibold text-slate-700 dark:text-[#d1d7db]">{sug.reasonText}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onConfirmSuggestion(sug.id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
                          >
                            <CheckCircle2 size={13} /> Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => onRejectSuggestion(sug.id)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#2a3942] text-xs font-bold text-slate-600 dark:text-[#aebac1] hover:bg-rose-500/10 hover:text-rose-500 flex items-center gap-1"
                          >
                            <XCircle size={13} /> Rejeitar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ABA 4: LISTA ORGANIZADA DO QUE JÁ FOI CONCILIADO AUTOMATICAMENTE */}
            {activeTab === 'conciliados' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-xs">
                  <div>
                    <p className="font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Conciliados Automaticamente & Vínculos Confirmados ({filteredMatchedPairs.length})
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-[#aebac1] mt-0.5">
                      Comparativo direto entre o lançamento no PDV e a comprovação encontrada no extrato OFX / Maquininha.
                    </p>
                  </div>
                  <strong className="text-sm font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                    Total conciliado: {formatCents(matchedTotalCents)}
                  </strong>
                </div>

                {filteredMatchedPairs.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/50 py-10 text-center">
                    <p className="text-xs text-slate-500">Nenhum item conciliado encontrado para este filtro.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/80 overflow-hidden">
                    <div className="hidden md:grid md:grid-cols-12 gap-3 px-4 py-2.5 border-b border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#111b21] text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-[#8696a0]">
                      <div className="col-span-2">Valor</div>
                      <div className="col-span-4">PDV (Sistema)</div>
                      <div className="col-span-4">Banco / Maquininha (Real)</div>
                      <div className="col-span-2 text-right">Regra & Itens</div>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                      {filteredMatchedPairs.map((pair) => {
                        const primaryOp = (pair.systemItems || [])[0] || (pair.realItems || [])[0];
                        const pairedList = [...(pair.systemItems || []), ...(pair.realItems || [])];
                        const itemsCount = (pair.systemItems || []).reduce(
                          (acc, s) => acc + (s.metadata?.orderDetail?.items?.length || 0),
                          0
                        );
                        return (
                          <div
                            key={pair.id}
                            className="px-4 py-3 grid grid-cols-1 md:grid-cols-12 gap-2.5 md:items-center text-xs hover:bg-slate-50/70 dark:hover:bg-[#111b21]/40 transition-colors"
                          >
                            <div className="md:col-span-2 flex items-center justify-between md:block">
                              <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                                {formatCents(pair.amountCents)}
                              </span>
                              <span className="md:block text-[10px] font-bold uppercase text-slate-400">
                                {pair.matchType === 'matched_manual' ? 'Manual' : 'Automático'}
                              </span>
                            </div>

                            <div className="md:col-span-4 min-w-0 space-y-0.5">
                              {(pair.systemItems || []).map((s) => (
                                <div key={s.id} className="truncate">
                                  <span className="font-mono text-[11px] text-slate-500 mr-1.5">{s.timeStr}</span>
                                  <span className="font-semibold text-slate-800 dark:text-[#e9edef]">{s.description}</span>
                                </div>
                              ))}
                            </div>

                            <div className="md:col-span-4 min-w-0 space-y-0.5">
                              {(pair.realItems || []).map((r) => (
                                <div key={r.id} className="truncate">
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#111b21] text-[10px] font-bold uppercase text-slate-600 dark:text-[#aebac1] mr-1.5">
                                    {SOURCE_LABELS[r.source?.toLowerCase()] || r.source}
                                  </span>
                                  <span className="font-mono text-[11px] text-slate-500 mr-1.5">{r.timeStr}</span>
                                  <span className="font-medium text-slate-700 dark:text-[#d1d7db]">{r.description}</span>
                                </div>
                              ))}
                            </div>

                            <div className="md:col-span-2 flex md:flex-col items-center md:items-end justify-between gap-1">
                              <span className="text-[10.5px] text-slate-500 dark:text-[#8696a0] md:text-right">
                                {pair.reasonText}
                              </span>
                              {primaryOp && (
                                <button
                                  type="button"
                                  onClick={() => setInspectedOp({ item: primaryOp, paired: pairedList })}
                                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#111b21] border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10.5px] font-bold inline-flex items-center gap-1 hover:border-[#00a884]"
                                >
                                  <ShoppingBag size={10} />
                                  {itemsCount > 0 ? `Itens (${itemsCount})` : 'Detalhes'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ABA 5: TODOS OS LANÇAMENTOS DO PDV NESTA FORMA + RECLASSIFICAÇÃO */}
            {activeTab === 'todos' && (
              <div className="space-y-4">
                {sortedSystemItems.length > 0 || reclassifiedOutItems.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/75 p-4 space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#aebac1]">
                      Lançamentos do PDV em {row.label} ({sortedSystemItems.length}) — ajuste a forma caso tenha sido lançado errado no caixa
                    </p>

                    <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                      {sortedSystemItems.map((it) => {
                        const isMatched = matchedIds.has(it.id);
                        const reclassifiedFrom = typeof it.metadata?.reclassifiedFrom === 'string' ? it.metadata.reclassifiedFrom : '';
                        const orderDetail = it.metadata?.orderDetail;
                        return (
                          <div key={it.id} className="py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setInspectedOp({ item: it, paired: pairedByItemId.get(it.id) || [] })}
                                  className="text-left group flex items-center gap-2 flex-wrap hover:text-[#00a884] transition-colors"
                                  title="Clique para detalhar a operação e os itens consumidos"
                                >
                                  <span className="text-sm font-black text-slate-900 dark:text-white group-hover:text-[#00a884] tabular-nums">
                                    {formatCents(it.amountCents)}
                                  </span>
                                  <span className="font-semibold text-slate-800 dark:text-[#e9edef] group-hover:underline">
                                    {it.description}
                                  </span>
                                </button>
                                {orderDetail && (
                                  <button
                                    type="button"
                                    onClick={() => setInspectedOp({ item: it, paired: pairedByItemId.get(it.id) || [] })}
                                    className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold inline-flex items-center gap-1 hover:bg-indigo-500/25"
                                  >
                                    <ShoppingBag size={10} /> {orderDetail.items.length} item(ns)
                                  </button>
                                )}
                                {isMatched && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                                    Conciliado
                                  </span>
                                )}
                                {orderDetail?.hasFeeRemoval && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                                    Taxa removida
                                  </span>
                                )}
                                {reclassifiedFrom && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                                    Ajustado de {CATEGORY_LABELS[reclassifiedFrom] || reclassifiedFrom}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                                {it.timeStr} • Operador: {it.operatorName || '-'} • {it.terminalName || '-'}
                                {orderDetail?.items?.length ? (
                                  <span className="ml-1.5 text-slate-600 dark:text-[#aebac1]">
                                    • {orderDetail.items.slice(0, 2).map((x) => `${x.qty}x ${x.displayName}`).join(', ')}
                                    {orderDetail.items.length > 2 ? ` (+${orderDetail.items.length - 2})` : ''}
                                  </span>
                                ) : null}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              <span className="text-[10.5px] font-bold text-slate-400 mr-0.5">Mover para:</span>
                              {targetChoicesForCategory(it.category).map((targetCat) => (
                                <button
                                  key={targetCat}
                                  type="button"
                                  onClick={() => onReclassifySystemItem(it.id, targetCat)}
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#111b21] hover:border-[#00a884] hover:text-[#00a884] text-[11px] font-bold text-slate-600 dark:text-[#aebac1] transition-colors"
                                >
                                  {CATEGORY_LABELS[targetCat]}
                                </button>
                              ))}
                              {reclassifiedFrom && (
                                <button
                                  type="button"
                                  onClick={() => onReclassifySystemItem(it.id, null)}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1"
                                >
                                  <RotateCcw size={11} /> Desfazer
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {reclassifiedOutItems.length > 0 && (
                      <div className="pt-3 border-t border-slate-200 dark:border-[#2a3942] space-y-2">
                        <p className="text-[11px] font-black uppercase text-amber-600 dark:text-amber-400">
                          Ajustes manuais movidos desta categoria ({reclassifiedOutItems.length})
                        </p>
                        {reclassifiedOutItems.map((it) => (
                          <div key={it.id} className="flex items-center justify-between gap-2 text-xs bg-amber-500/5 border border-amber-500/25 rounded-xl px-3 py-2">
                            <span className="text-slate-700 dark:text-[#d1d7db]">
                              <strong>{formatCents(it.amountCents)}</strong> • {it.description} → movido para{' '}
                              <strong className="text-[#00a884]">{CATEGORY_LABELS[it.category] || it.category}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => onReclassifySystemItem(it.id, null)}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#111b21] border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1 shrink-0"
                            >
                              <RotateCcw size={11} /> Desfazer
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-[#8696a0] text-center py-8">
                    Nenhum lançamento individual detalhado vinculado a {categories.join(', ')} nos arquivos enviados.
                  </p>
                )}
              </div>
            )}

            {/* Específicos das abas Dinheiro / Pendentes */}
            {row.key === 'saldo_dinheiro' &&
              (saidasDetalhadas.length > 0 || (result.cashDrawerSummary?.manualCashAdjustments?.length || 0) > 0) && (
                <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/75 p-4 space-y-2.5">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#aebac1]">
                    Saídas, Vales, Justificativas e Sangrias Registradas no Turno
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                    {saidasDetalhadas
                      .filter((s) => !s.isManualAdjustment)
                      .map((s, idx) => (
                        <div key={`det-${idx}`} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#111b21]">
                          <span className="text-slate-700 dark:text-[#d1d7db] truncate pr-2">{s.label}</span>
                          <strong className="text-rose-500 tabular-nums shrink-0 whitespace-nowrap">{`-${formatCents(s.amountCents)}`}</strong>
                        </div>
                      ))}
                    {(result.cashDrawerSummary?.manualCashAdjustments || []).map((adj) => {
                      const isInflow = adj.direction === 'inflow';
                      return (
                        <div
                          key={`adj-${adj.id}`}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border ${
                            isInflow
                              ? 'border-emerald-500/25 bg-emerald-500/5'
                              : 'border-rose-500/25 bg-rose-500/5'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0 ${
                                  isInflow
                                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                                }`}
                              >
                                Justificativa
                              </span>
                              <span className="text-slate-800 dark:text-[#e9edef] font-semibold truncate">
                                {adj.description}
                              </span>
                            </div>
                            {adj.operator && (
                              <span className="block text-[10px] text-slate-500 dark:text-[#8696a0] truncate mt-0.5">
                                Resp.: {adj.operator}
                              </span>
                            )}
                          </div>
                          <strong
                            className={`tabular-nums shrink-0 whitespace-nowrap ${
                              isInflow ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                            }`}
                          >
                            {isInflow ? `+${formatCents(adj.amountCents)}` : `-${formatCents(adj.amountCents)}`}
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            {row.key === 'pendentes' && pendingDebtors.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/75 p-4 space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#aebac1]">
                  Notas Pendentes / Clientes no Fechamento TXT ({pendingDebtors.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                  {pendingDebtors.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#111b21]">
                      <span className="text-slate-700 dark:text-[#d1d7db] truncate pr-2">{p.debtor}</span>
                      <strong className="text-amber-600 dark:text-amber-400 tabular-nums shrink-0">{formatCents(p.amountCents)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <CashOperationDetailModal
        operationItem={inspectedOp?.item || null}
        pairedItems={inspectedOp?.paired || []}
        result={result}
        onClose={() => setInspectedOp(null)}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
