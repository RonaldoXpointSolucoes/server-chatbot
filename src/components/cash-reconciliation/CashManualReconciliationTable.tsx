import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  CheckCircle2,
  EyeOff,
  HelpCircle,
  Link2,
  Search,
  ShoppingBag,
  Sparkles,
  X
} from 'lucide-react';
import {
  CashPendingAgendaItem,
  CashReconciliationItem,
  formatCents
} from '../../types/cashReconciliation';
import { findCrossDayAgendaMatchesForExtras } from '../../utils/cashPendingAgendaHelper.mjs';
import {
  RECONCILIATION_GLOSSARY,
  computeSelectionDiffMeta,
  formatDateBrShort,
  sortItemsByTargetMatch
} from '../../utils/cashReconciliationServiceHelper.mjs';

const CATEGORY_BADGE: Record<string, { label: string; cls: string }> = {
  pix: { label: 'PIX', cls: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/25' },
  cartao: { label: 'Cartão', cls: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/25' },
  dinheiro: { label: 'Dinheiro', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25' },
  pendente: { label: 'Pendente', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25' }
};

const SOURCE_LABELS: Record<string, string> = {
  ofx: 'OFX Banco',
  rede: 'Rede',
  c6pay: 'C6 Pay',
  pdv: 'PDV'
};

export interface CashManualReconciliationTableProps {
  missingItems: CashReconciliationItem[];
  extraItems: CashReconciliationItem[];
  extraSystemPoolItems?: CashReconciliationItem[];
  agendaItems?: CashPendingAgendaItem[];
  currentReferenceDate?: string;
  onManualLink: (systemIds: string[], realIds: string[], note?: string) => void;
  onIgnoreItem: (side: 'system' | 'real', id: string) => void;
  onInspectOperation?: (item: CashReconciliationItem) => void;
  onScheduleAgendaFromItem?: (item: CashReconciliationItem) => void;
  onSettleCrossDayAgendaMatch?: (agendaItem: CashPendingAgendaItem, bankItem: CashReconciliationItem) => void;
  defaultIncludeCashPool?: boolean;
  emptyMissingMessage?: string;
  emptyExtraMessage?: string;
}

function matchesSearch(it: CashReconciliationItem, qLower: string): boolean {
  if (!qLower) return true;
  const brVal = (Number(it.amountCents || 0) / 100).toFixed(2).replace('.', ',');
  const dotVal = (Number(it.amountCents || 0) / 100).toFixed(2);
  const debtorText = [it.metadata?.debtorName, ...(it.metadata?.debtorCandidates || [])]
    .filter(Boolean)
    .join(' ');
  return `${it.description || ''} ${debtorText} ${it.referenceCode || ''} ${it.operatorName || ''} ${it.terminalName || ''} ${it.source || ''} ${it.category || ''} ${it.timeStr || ''} ${brVal} ${dotVal}`
    .toLowerCase()
    .includes(qLower);
}

export function CashManualReconciliationTable({
  missingItems,
  extraItems,
  extraSystemPoolItems = [],
  agendaItems = [],
  currentReferenceDate = '',
  onManualLink,
  onIgnoreItem,
  onInspectOperation,
  onScheduleAgendaFromItem,
  onSettleCrossDayAgendaMatch,
  defaultIncludeCashPool = false,
  emptyMissingMessage = 'Todas as vendas digitais do PDV já estão conciliadas!',
  emptyExtraMessage = 'Todos os recebimentos do banco/maquininha já têm venda vinculada!'
}: CashManualReconciliationTableProps) {
  const waitingAgendaBySysId = useMemo(() => {
    const map = new Map<string, CashPendingAgendaItem>();
    for (const ag of agendaItems || []) {
      if (ag?.status === 'waiting' && ag.sourceItemId) {
        map.set(ag.sourceItemId, ag);
      }
    }
    return map;
  }, [agendaItems]);

  const crossDayMatchByRealId = useMemo(() => {
    const matches = findCrossDayAgendaMatchesForExtras(extraItems, agendaItems, currentReferenceDate) as Array<{
      realItem: CashReconciliationItem;
      agendaItem: CashPendingAgendaItem;
      similarityPct: number;
    }>;
    const map = new Map<string, { agendaItem: CashPendingAgendaItem; similarityPct: number }>();
    for (const m of matches) {
      if (m?.realItem?.id && m?.agendaItem) {
        map.set(m.realItem.id, { agendaItem: m.agendaItem, similarityPct: m.similarityPct });
      }
    }
    return map;
  }, [extraItems, agendaItems, currentReferenceDate]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'pix' | 'cartao'>('all');
  const [includeCashPool, setIncludeCashPool] = useState(defaultIncludeCashPool);
  const [selectedSysIds, setSelectedSysIds] = useState<string[]>([]);
  const [selectedRealIds, setSelectedRealIds] = useState<string[]>([]);
  const [linkNote, setLinkNote] = useState('');

  const extraPoolOnly = useMemo(() => {
    const missingSet = new Set(missingItems.map((m) => m.id));
    return extraSystemPoolItems.filter((it) => !missingSet.has(it.id) && (it.category === 'dinheiro' || it.category === 'pendente'));
  }, [missingItems, extraSystemPoolItems]);

  const combinedSystemItems = useMemo(() => {
    return includeCashPool ? [...missingItems, ...extraPoolOnly] : missingItems;
  }, [includeCashPool, missingItems, extraPoolOnly]);

  // Limpa automaticamente seleções de itens que já foram conciliados/ignorados em tempo real
  useEffect(() => {
    const validSys = new Set(combinedSystemItems.map((s) => s.id));
    const validReal = new Set(extraItems.map((r) => r.id));
    setSelectedSysIds((prev) => prev.filter((id) => validSys.has(id)));
    setSelectedRealIds((prev) => prev.filter((id) => validReal.has(id)));
  }, [combinedSystemItems, extraItems]);

  const qLower = searchTerm.trim().toLowerCase();

  const selectedSysItems = useMemo(() => {
    const idSet = new Set(selectedSysIds);
    return combinedSystemItems.filter((it) => idSet.has(it.id));
  }, [combinedSystemItems, selectedSysIds]);

  const selectedRealItems = useMemo(() => {
    const idSet = new Set(selectedRealIds);
    return extraItems.filter((it) => idSet.has(it.id));
  }, [extraItems, selectedRealIds]);

  const selectionMeta = useMemo(
    () => computeSelectionDiffMeta({ selectedSystemItems: selectedSysItems, selectedRealItems }),
    [selectedSysItems, selectedRealItems]
  );

  const filteredSystemRows = useMemo(() => {
    const base = combinedSystemItems.filter((it) => {
      if (categoryFilter !== 'all' && it.category !== categoryFilter && it.category !== 'dinheiro' && it.category !== 'pendente') {
        return false;
      }
      return matchesSearch(it, qLower);
    });
    const targetCents = selectedRealItems.length > 0 && selectedSysItems.length === 0 ? selectionMeta.realTotalCents : 0;
    const targetSec = selectedRealItems.length === 1 ? Number(selectedRealItems[0].secondsOfDay || 0) : null;
    return sortItemsByTargetMatch(base, targetCents, targetSec) as Array<{
      item: CashReconciliationItem;
      matchRank: 'exact' | 'close' | 'none';
      amountDiffCents: number;
    }>;
  }, [combinedSystemItems, categoryFilter, qLower, selectedRealItems, selectedSysItems.length, selectionMeta.realTotalCents]);

  const filteredRealRows = useMemo(() => {
    const base = extraItems.filter((it) => {
      if (categoryFilter !== 'all' && it.category !== categoryFilter) return false;
      return matchesSearch(it, qLower);
    });
    const targetCents = selectedSysItems.length > 0 && selectedRealItems.length === 0 ? selectionMeta.sysTotalCents : 0;
    const targetSec = selectedSysItems.length === 1 ? Number(selectedSysItems[0].secondsOfDay || 0) : null;
    return sortItemsByTargetMatch(base, targetCents, targetSec) as Array<{
      item: CashReconciliationItem;
      matchRank: 'exact' | 'close' | 'none';
      amountDiffCents: number;
    }>;
  }, [extraItems, categoryFilter, qLower, selectedSysItems, selectedRealItems.length, selectionMeta.sysTotalCents]);

  const toggleSys = (id: string) => {
    setSelectedSysIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleReal = (id: string) => {
    setSelectedRealIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleLinkSelected = () => {
    if (!selectionMeta.canLink) return;
    onManualLink(selectedSysIds, selectedRealIds, linkNote.trim() || undefined);
    setSelectedSysIds([]);
    setSelectedRealIds([]);
    setLinkNote('');
  };

  const sysTotalMissingCents = useMemo(
    () => missingItems.reduce((acc, it) => acc + Number(it.amountCents || 0), 0),
    [missingItems]
  );
  const realTotalExtraCents = useMemo(
    () => extraItems.reduce((acc, it) => acc + Number(it.amountCents || 0), 0),
    [extraItems]
  );
  const filteredSysTotalCents = useMemo(
    () => filteredSystemRows.reduce((acc, row) => acc + Number(row.item.amountCents || 0), 0),
    [filteredSystemRows]
  );
  const filteredRealTotalCents = useMemo(
    () => filteredRealRows.reduce((acc, row) => acc + Number(row.item.amountCents || 0), 0),
    [filteredRealRows]
  );
  const isFilteredView = categoryFilter !== 'all' || Boolean(qLower);

  return (
    <div className="space-y-4">
      {/* Guia Explicativo Didático (PDV × Banco) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 px-4 py-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-black text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
              <AlertCircle size={14} className="shrink-0" />
              {RECONCILIATION_GLOSSARY.missing.title} ({missingItems.length})
            </span>
            <strong className="tabular-nums text-rose-700 dark:text-rose-300">
              {formatCents(sysTotalMissingCents)}
            </strong>
          </div>
          <p className="text-[11.5px] font-semibold text-slate-700 dark:text-[#e9edef]">
            {RECONCILIATION_GLOSSARY.missing.explanation}
          </p>
          <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
            {RECONCILIATION_GLOSSARY.missing.actionHint}
          </p>
        </div>

        <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 px-4 py-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-black text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
              <HelpCircle size={14} className="shrink-0" />
              {RECONCILIATION_GLOSSARY.extra.title} ({extraItems.length})
            </span>
            <strong className="tabular-nums text-indigo-700 dark:text-indigo-300">
              {formatCents(realTotalExtraCents)}
            </strong>
          </div>
          <p className="text-[11.5px] font-semibold text-slate-700 dark:text-[#e9edef]">
            {RECONCILIATION_GLOSSARY.extra.explanation}
          </p>
          <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
            {RECONCILIATION_GLOSSARY.extra.actionHint}
          </p>
        </div>
      </div>

      {/* Filtros & Busca da Tabela Manual */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className="relative min-w-[220px] flex-1 sm:flex-initial">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar valor, hora, mesa, cliente..."
              className="w-full pl-8 pr-7 py-2 min-h-[38px] rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
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

          {(['all', 'pix', 'cartao'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-2 min-h-[38px] rounded-xl text-[11px] font-bold border transition-all active:scale-95 ${
                categoryFilter === cat
                  ? 'bg-[#00a884] border-[#00a884] text-white'
                  : 'bg-white dark:bg-[#111b21] border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1] hover:border-[#00a884]/60'
              }`}
            >
              {cat === 'all' ? 'Todos Canais' : cat === 'pix' ? 'Somente PIX' : 'Somente Cartão'}
            </button>
          ))}

          {extraPoolOnly.length > 0 && (
            <button
              type="button"
              onClick={() => setIncludeCashPool((v) => !v)}
              className={`px-3 py-2 min-h-[38px] rounded-xl text-[11px] font-bold border transition-all active:scale-95 ${
                includeCashPool
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white dark:bg-[#111b21] border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1] hover:border-emerald-500/60'
              }`}
              title="Útil quando uma venda paga em PIX ou Cartão foi lançada como Dinheiro ou Pendente no PDV"
            >
              {includeCashPool ? `Ocultar Dinheiro/Pend. PDV (${extraPoolOnly.length})` : `+ Incluir Dinheiro/Pend. PDV (${extraPoolOnly.length})`}
            </button>
          )}
        </div>

        <span className="text-[11px] text-slate-500 dark:text-[#8696a0]">
          Dica: marque 1 item de um lado para destacar automaticamente os valores compatíveis no outro lado (aceita 1:1, 1:N e N:1).
        </span>
      </div>

      {/* Barra Interativa de Vínculo ao Vivo */}
      {(selectedSysIds.length > 0 || selectedRealIds.length > 0) && (
        <div
          className={`sticky top-2 z-20 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all ${
            selectionMeta.isExactMatch
              ? 'border-emerald-500/50 bg-emerald-500/15 dark:bg-emerald-950/90'
              : selectionMeta.canLink
                ? 'border-amber-500/45 bg-amber-500/10 dark:bg-[#202c33]/95'
                : 'border-cyan-500/40 bg-cyan-500/10 dark:bg-[#202c33]/95'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-xl bg-white/90 dark:bg-[#111b21] border border-rose-500/25 font-bold text-slate-800 dark:text-white tabular-nums">
              PDV ({selectionMeta.sysCount}): <strong className="text-rose-600 dark:text-rose-400">{formatCents(selectionMeta.sysTotalCents)}</strong>
            </span>
            <span className="font-black text-slate-400">×</span>
            <span className="px-2.5 py-1 rounded-xl bg-white/90 dark:bg-[#111b21] border border-indigo-500/25 font-bold text-slate-800 dark:text-white tabular-nums">
              Banco ({selectionMeta.realCount}): <strong className="text-indigo-600 dark:text-indigo-400">{formatCents(selectionMeta.realTotalCents)}</strong>
            </span>

            {selectionMeta.canLink ? (
              <span
                className={`px-2.5 py-1 rounded-full font-black text-[11px] inline-flex items-center gap-1 tabular-nums ${
                  selectionMeta.isExactMatch
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                }`}
              >
                {selectionMeta.isExactMatch ? (
                  <>
                    <CheckCircle2 size={12} /> Bate exato (dif. {formatCents(selectionMeta.absDiffCents)})
                  </>
                ) : (
                  <>Diferença do vínculo: {selectionMeta.diffCents > 0 ? '+' : ''}{formatCents(selectionMeta.diffCents)}</>
                )}
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-cyan-800 dark:text-cyan-300 flex items-center gap-1">
                <Sparkles size={12} /> Selecione o item correspondente na tabela ao lado para vincular
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {selectionMeta.canLink && !selectionMeta.isExactMatch && (
              <input
                type="text"
                value={linkNote}
                onChange={(e) => setLinkNote(e.target.value)}
                placeholder="Motivo da dif. (ex: troco -R$ 1)"
                className="w-44 sm:w-52 px-2.5 py-2 min-h-[38px] rounded-xl border border-amber-500/40 bg-white/95 dark:bg-[#111b21] text-[11px] font-medium text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedSysIds([]);
                setSelectedRealIds([]);
                setLinkNote('');
              }}
              className="px-3 py-2 min-h-[38px] rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white/90 dark:bg-[#111b21] text-xs font-bold text-slate-600 dark:text-[#aebac1] active:scale-95 transition-all"
            >
              Limpar
            </button>
            <button
              type="button"
              disabled={!selectionMeta.canLink}
              onClick={handleLinkSelected}
              className="px-4 py-2 min-h-[38px] rounded-xl bg-[#00a884] hover:bg-[#008f6f] disabled:opacity-40 text-white text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              <Link2 size={14} /> Conciliar Selecionados Agora
            </button>
          </div>
        </div>
      )}

      {/* Tabelas Lado a Lado */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {/* TABELA ESQUERDA: VENDAS SEM RECEBIMENTO (PDV) */}
        <div className="rounded-2xl border border-rose-500/25 bg-white/90 dark:bg-[#111b21]/90 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-rose-500/20 bg-rose-500/10 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-rose-700 dark:text-rose-300">
                Vendas sem recebimento — PDV ({filteredSystemRows.length})
              </h4>
              <p className="text-[10.5px] text-rose-800/80 dark:text-rose-200/80">
                A venda está no PDV • Selecione para localizar o recebimento no banco
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-xs font-black text-rose-700 dark:text-rose-200 tabular-nums">
                Total: {formatCents(filteredSysTotalCents)}
              </span>
              {isFilteredView && filteredSysTotalCents !== sysTotalMissingCents && (
                <p className="text-[9.5px] text-rose-700/75 dark:text-rose-300/75 tabular-nums mt-0.5">
                  de {formatCents(sysTotalMissingCents)} geral
                </p>
              )}
            </div>
          </div>

          {filteredSystemRows.length === 0 ? (
            <div className="py-10 px-4 text-center space-y-1.5">
              <CheckCircle2 size={28} className="mx-auto text-emerald-500" />
              <p className="text-xs font-bold text-slate-700 dark:text-[#e9edef]">{emptyMissingMessage}</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-[#202c33] border-b border-slate-200 dark:border-[#2a3942] text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-[#8696a0]">
                  <tr>
                    <th className="py-2.5 px-3 w-9">Sel.</th>
                    <th className="py-2.5 px-2.5">Valor</th>
                    <th className="py-2.5 px-2.5">Venda / Mesa • Hora</th>
                    <th className="py-2.5 px-2.5">Forma</th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2a3942]/70">
                  {filteredSystemRows.map(({ item: it, matchRank }) => {
                    const isSelected = selectedSysIds.includes(it.id);
                    const catMeta = CATEGORY_BADGE[it.category] || {
                      label: String(it.category || '').toUpperCase(),
                      cls: 'bg-slate-200 text-slate-700 border-slate-300'
                    };
                    return (
                      <tr
                        key={it.id}
                        onClick={() => toggleSys(it.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#00a884]/15 dark:bg-[#00a884]/20'
                            : matchRank === 'exact'
                              ? 'bg-emerald-500/10 hover:bg-emerald-500/15'
                              : matchRank === 'close'
                                ? 'bg-amber-500/10 hover:bg-amber-500/15'
                                : 'hover:bg-slate-50 dark:hover:bg-[#202c33]/60'
                        }`}
                      >
                        <td className="py-2.5 px-3 align-middle">
                          <span
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-[#00a884] border-[#00a884] text-white'
                                : 'border-slate-300 dark:border-[#3b4a54] bg-white dark:bg-[#111b21]'
                            }`}
                          >
                            {isSelected && <Check size={12} />}
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 align-middle whitespace-nowrap">
                          {onInspectOperation ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onInspectOperation(it);
                              }}
                              title="Clique no valor para ver os itens deste pedido no PDV"
                              className="inline-flex items-center gap-1 font-black text-rose-600 dark:text-rose-400 hover:text-[#00a884] dark:hover:text-[#00a884] tabular-nums text-[13px] underline decoration-rose-500/45 hover:decoration-[#00a884] decoration-dotted underline-offset-4 active:scale-95 transition-all"
                            >
                              <span>{formatCents(it.amountCents)}</span>
                              <ShoppingBag size={11} className="opacity-75 shrink-0" />
                            </button>
                          ) : (
                            <span className="font-black text-rose-600 dark:text-rose-400 tabular-nums text-[13px]">
                              {formatCents(it.amountCents)}
                            </span>
                          )}
                          {matchRank === 'exact' && !isSelected && (
                            <span className="block text-[9.5px] font-black text-emerald-600 dark:text-emerald-400">
                              Par exato!
                            </span>
                          )}
                          {matchRank === 'close' && !isSelected && (
                            <span className="block text-[9.5px] font-bold text-amber-600 dark:text-amber-400">
                              Valor próximo
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 align-middle min-w-[150px]">
                          <p className="font-bold text-slate-800 dark:text-[#e9edef] leading-snug">{it.description}</p>
                          {(it.metadata?.debtorName || (it.metadata?.debtorCandidates?.length || 0) > 0) && (
                            <p className="mt-0.5">
                              {it.metadata?.debtorName ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-black text-cyan-800 dark:text-cyan-200">
                                  Cliente: {it.metadata.debtorName}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-800 dark:text-amber-200">
                                  Possível: {it.metadata?.debtorCandidates?.join(' / ')}
                                </span>
                              )}
                            </p>
                          )}
                          <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                            {formatDateBrShort(it.dateStr)} {it.timeStr}
                            {it.operatorName ? ` • ${it.operatorName}` : ''}
                          </p>
                          {it.metadata?.operationalAlerts?.length ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {it.metadata.operationalAlerts.map((al, alIdx) => (
                                <span
                                  key={`${al.code}_${alIdx}`}
                                  title={al.detail}
                                  className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[9.5px] font-bold text-amber-700 dark:text-amber-300"
                                >
                                  ⚠ {al.label}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2.5 px-2.5 align-middle whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${catMeta.cls}`}>
                            {catMeta.label}
                          </span>
                        </td>
                        <td
                          className="py-2.5 px-3 align-middle text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1 flex-wrap justify-end">
                            {onInspectOperation && (
                              <button
                                type="button"
                                onClick={() => onInspectOperation(it)}
                                className="p-1.5 rounded-lg bg-[#00a884]/10 text-[#00a884] hover:bg-[#00a884]/20"
                                title="Ver itens desta venda"
                              >
                                <ShoppingBag size={12} />
                              </button>
                            )}
                            {waitingAgendaBySysId.has(it.id) ? (
                              <span
                                className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/35 text-[10px] font-black text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"
                                title="Esta venda já está documentada na Agenda Financeira em espera"
                              >
                                <CalendarClock size={11} /> Na Agenda ({formatDateBrShort(waitingAgendaBySysId.get(it.id)?.dueDate)})
                              </span>
                            ) : onScheduleAgendaFromItem ? (
                              <button
                                type="button"
                                onClick={() => onScheduleAgendaFromItem(it)}
                                className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500 border border-amber-500/35 text-amber-700 hover:text-white dark:text-amber-300 text-[10.5px] font-black inline-flex items-center gap-1 transition-all"
                                title="Documentar falha no pagamento e deixar em espera na Agenda até o cliente pagar em outro dia"
                              >
                                <CalendarClock size={11} /> Em Espera
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => onIgnoreItem('system', it.id)}
                              className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#202c33] text-[10.5px] font-bold text-slate-500 hover:text-rose-500 inline-flex items-center gap-1"
                              title="Justificar / ocultar esta venda"
                            >
                              <EyeOff size={11} /> Justificar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* TABELA DIREITA: RECEBIMENTOS SEM VENDA (BANCO / MAQUININHA) */}
        <div className="rounded-2xl border border-indigo-500/25 bg-white/90 dark:bg-[#111b21]/90 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-indigo-500/20 bg-indigo-500/10 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                Recebimentos sem venda — Banco / Maquininha ({filteredRealRows.length})
              </h4>
              <p className="text-[10.5px] text-indigo-800/80 dark:text-indigo-200/80">
                O recebimento está no banco • Selecione para vincular à venda no PDV
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-xs font-black text-indigo-700 dark:text-indigo-200 tabular-nums">
                Total: {formatCents(filteredRealTotalCents)}
              </span>
              {isFilteredView && filteredRealTotalCents !== realTotalExtraCents && (
                <p className="text-[9.5px] text-indigo-700/75 dark:text-indigo-300/75 tabular-nums mt-0.5">
                  de {formatCents(realTotalExtraCents)} geral
                </p>
              )}
            </div>
          </div>

          {filteredRealRows.length === 0 ? (
            <div className="py-10 px-4 text-center space-y-1.5">
              <CheckCircle2 size={28} className="mx-auto text-emerald-500" />
              <p className="text-xs font-bold text-slate-700 dark:text-[#e9edef]">{emptyExtraMessage}</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-[#202c33] border-b border-slate-200 dark:border-[#2a3942] text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-[#8696a0]">
                  <tr>
                    <th className="py-2.5 px-3 w-9">Sel.</th>
                    <th className="py-2.5 px-2.5">Valor</th>
                    <th className="py-2.5 px-2.5">Recebimento • Hora</th>
                    <th className="py-2.5 px-2.5">Origem</th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#2a3942]/70">
                  {filteredRealRows.map(({ item: it, matchRank }) => {
                    const isSelected = selectedRealIds.includes(it.id);
                    const catMeta = CATEGORY_BADGE[it.category] || {
                      label: String(it.category || '').toUpperCase(),
                      cls: 'bg-slate-200 text-slate-700 border-slate-300'
                    };
                    return (
                      <tr
                        key={it.id}
                        onClick={() => toggleReal(it.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#00a884]/15 dark:bg-[#00a884]/20'
                            : matchRank === 'exact'
                              ? 'bg-emerald-500/10 hover:bg-emerald-500/15'
                              : matchRank === 'close'
                                ? 'bg-amber-500/10 hover:bg-amber-500/15'
                                : 'hover:bg-slate-50 dark:hover:bg-[#202c33]/60'
                        }`}
                      >
                        <td className="py-2.5 px-3 align-middle">
                          <span
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-[#00a884] border-[#00a884] text-white'
                                : 'border-slate-300 dark:border-[#3b4a54] bg-white dark:bg-[#111b21]'
                            }`}
                          >
                            {isSelected && <Check size={12} />}
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 align-middle whitespace-nowrap">
                          <span className="font-black text-indigo-600 dark:text-indigo-400 tabular-nums text-[13px]">
                            {formatCents(it.amountCents)}
                          </span>
                          {matchRank === 'exact' && !isSelected && (
                            <span className="block text-[9.5px] font-black text-emerald-600 dark:text-emerald-400">
                              Par exato!
                            </span>
                          )}
                          {matchRank === 'close' && !isSelected && (
                            <span className="block text-[9.5px] font-bold text-amber-600 dark:text-amber-400">
                              Valor próximo
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 align-middle min-w-[150px]">
                          <p className="font-bold text-slate-800 dark:text-[#e9edef] leading-snug break-words">{it.description}</p>
                          <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                            {formatDateBrShort(it.dateStr)} {it.timeStr}
                            {it.terminalName ? ` • ${it.terminalName}` : ''}
                          </p>
                        </td>
                        <td className="py-2.5 px-2.5 align-middle whitespace-nowrap">
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#202c33] text-[10px] font-bold text-slate-600 dark:text-[#aebac1]">
                              {SOURCE_LABELS[String(it.source || '').toLowerCase()] || String(it.source || '').toUpperCase()}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full border text-[9.5px] font-bold ${catMeta.cls}`}>
                              {catMeta.label}
                            </span>
                          </div>
                        </td>
                        <td
                          className="py-2.5 px-3 align-middle text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1 flex-wrap justify-end">
                            {crossDayMatchByRealId.has(it.id) && onSettleCrossDayAgendaMatch && (() => {
                              const match = crossDayMatchByRealId.get(it.id)!;
                              return (
                                <button
                                  type="button"
                                  onClick={() => onSettleCrossDayAgendaMatch(match.agendaItem, it)}
                                  className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10.5px] font-black inline-flex items-center gap-1 shadow-sm active:scale-95 transition-all animate-pulse"
                                  title={`Quita pendência de ${formatDateBrShort(match.agendaItem.originDate)}: ${match.agendaItem.title} (${formatCents(match.agendaItem.amountCents)})`}
                                >
                                  <CalendarClock size={11} /> Quitar ({formatDateBrShort(match.agendaItem.originDate)})
                                </button>
                              );
                            })()}
                            {matchRank === 'exact' && selectedSysIds.length >= 1 && selectedRealIds.length === 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  onManualLink(selectedSysIds, [it.id]);
                                  setSelectedSysIds([]);
                                }}
                                className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-bold inline-flex items-center gap-1 active:scale-95 transition-all"
                                title="Vincular imediatamente com a venda selecionada"
                              >
                                <Link2 size={11} /> Vincular
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onIgnoreItem('real', it.id)}
                              className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#202c33] text-[10.5px] font-bold text-slate-500 hover:text-rose-500 inline-flex items-center gap-1"
                              title="Marcar entrada como Não-PDV (ex.: transferência ou saldo anterior)"
                            >
                              <EyeOff size={11} /> Não-PDV
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
