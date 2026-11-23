import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  XCircle,
  Link2,
  ArrowRightLeft,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Search,
  X
} from 'lucide-react';
import {
  CashMirrorRow,
  CashReconciliationItem,
  CashReconciliationResult,
  CashSuggestion,
  formatCents
} from '../../types/cashReconciliation';
import { buildMirrorRowDetails } from '../../utils/cashReconciliationServiceHelper.mjs';

export type CashSystemCategoryTarget = 'dinheiro' | 'cartao' | 'pix' | 'pendente';

const CATEGORY_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  pix: 'Pix',
  pendente: 'Pendente'
};

function itemMatchesQuery(it: CashReconciliationItem, qLower: string): boolean {
  if (!qLower) return true;
  return `${it.description} ${it.referenceCode} ${it.operatorName} ${it.terminalName} ${it.timeStr} ${(it.amountCents / 100).toFixed(2)}`
    .toLowerCase()
    .includes(qLower);
}

interface CashMirrorRowDetailPanelProps {
  row: CashMirrorRow;
  switchableRows?: CashMirrorRow[];
  result: CashReconciliationResult;
  onSelectMirrorKey?: (key: string) => void;
  onConfirmSuggestion: (suggestionId: string) => void;
  onRejectSuggestion: (suggestionId: string) => void;
  onManualLink: (systemIds: string[], realIds: string[]) => void;
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
  const [searchTerm, setSearchTerm] = useState('');
  const [showMatched, setShowMatched] = useState(false);
  const [linkingSystemId, setLinkingSystemId] = useState<string | null>(null);
  const [linkingRealId, setLinkingRealId] = useState<string>('');
  const [linkingExtraId, setLinkingExtraId] = useState<string | null>(null);
  const [linkingExtraSysId, setLinkingExtraSysId] = useState<string>('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
    saidasDetalhadas
  } = details as {
    categories: string[];
    matchedPairs: NonNullable<CashReconciliationResult['matchedPairs']>;
    suggestions: CashSuggestion[];
    missingItems: CashReconciliationItem[];
    extraItems: CashReconciliationItem[];
    systemCategoryItems: CashReconciliationItem[];
    reclassifiedOutItems: CashReconciliationItem[];
    pendingDebtors: Array<{ debtor: string; amountCents: number }>;
    saidasDetalhadas: Array<{ label: string; amountCents: number; isSangria: boolean }>;
  };

  const matchedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of matchedPairs) {
      for (const s of m.systemItems || []) ids.add(s.id);
    }
    return ids;
  }, [matchedPairs]);

  const qLower = searchTerm.trim().toLowerCase();
  const filteredMissing = useMemo(
    () => missingItems.filter((it) => itemMatchesQuery(it, qLower)),
    [missingItems, qLower]
  );
  const filteredExtra = useMemo(
    () => extraItems.filter((it) => itemMatchesQuery(it, qLower)),
    [extraItems, qLower]
  );

  const sortedSystemItems = useMemo(() => {
    const filtered = systemCategoryItems.filter((it) => itemMatchesQuery(it, qLower));
    filtered.sort((a, b) => {
      const aMatched = matchedIds.has(a.id) ? 1 : 0;
      const bMatched = matchedIds.has(b.id) ? 1 : 0;
      if (aMatched !== bMatched) return aMatched - bMatched;
      return (a.secondsOfDay || 0) - (b.secondsOfDay || 0);
    });
    return filtered;
  }, [systemCategoryItems, matchedIds, qLower]);

  const matchedTotalCents = matchedPairs.reduce((acc, m) => acc + Number(m.amountCents || 0), 0);
  const diff = Number(row.diffCents || 0);
  const allExtras = result.extraInBank || [];

  const linkableSystemPool = useMemo(() => {
    const missing = result.missingInBank || [];
    const dinheiroAndPendente = (result.systemItems || []).filter(
      (s) => !matchedIds.has(s.id) && (s.category === 'dinheiro' || s.category === 'pendente')
    );
    const seen = new Set<string>();
    const combined: CashReconciliationItem[] = [];
    for (const item of [...missing, ...dinheiroAndPendente]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        combined.push(item);
      }
    }
    return combined;
  }, [result.missingInBank, result.systemItems, matchedIds]);

  const targetChoicesForCategory = (cat: string): CashSystemCategoryTarget[] =>
    (['dinheiro', 'cartao', 'pix', 'pendente'] as CashSystemCategoryTarget[]).filter((c) => c !== cat);

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
        <div className="shrink-0 border-b border-slate-200 dark:border-[#2a3942] bg-slate-50/95 dark:bg-[#202c33] px-4 sm:px-6 py-4 space-y-3">
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
              className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-700 dark:text-[#e9edef] hover:border-[#00a884] flex items-center gap-1.5"
            >
              <X size={15} /> Fechar (Esc)
            </button>
          </div>

          {/* Barra de Resumo + Troca Rápida de Linha + Busca */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
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

            <div className="flex flex-wrap items-center gap-2">
              {switchableRows.length > 1 && onSelectMirrorKey && (
                <div className="flex flex-wrap items-center gap-1">
                  {switchableRows.map((sr) => (
                    <button
                      key={sr.key}
                      type="button"
                      onClick={() => onSelectMirrorKey(sr.key)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
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

              <div className="relative min-w-[220px] flex-1 sm:flex-initial">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrar valor, mesa, hora..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Corpo Rolável em Largura Completa */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-7xl mx-auto space-y-5">
            {/* 1. Sugestões automáticas envolvendo esta categoria */}
            {suggestions.length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                <p className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <ArrowRightLeft size={14} /> Sugestões de Conciliação / Troca de Forma ({suggestions.length})
                </p>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {suggestions.map((sug) => (
                    <div
                      key={sug.id}
                      className="rounded-xl border border-amber-500/30 bg-white dark:bg-[#202c33] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 text-xs">
                        <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
                          {formatCents(sug.amountCents)}
                        </span>
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
              </div>
            )}

            {/* 2. Faltam no Banco vs Sobram no Banco desta categoria */}
            {(filteredMissing.length > 0 || filteredExtra.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4 space-y-3">
                  <p className="text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    Faltam no Banco / Maquininha ({filteredMissing.length})
                  </p>
                  {filteredMissing.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhuma falta pendente para este filtro.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredMissing.map((it) => (
                        <div
                          key={it.id}
                          className="rounded-xl bg-white dark:bg-[#202c33] border border-slate-200/80 dark:border-[#2a3942] p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-black text-rose-600 dark:text-rose-400 tabular-nums">
                              {formatCents(it.amountCents)}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                              {it.timeStr} • {it.operatorName || '-'}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-800 dark:text-[#e9edef]">{it.description}</p>
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
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
                                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs"
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
                                className="px-3 py-1.5 rounded-lg bg-[#00a884] disabled:opacity-40 text-white text-xs font-bold"
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

                <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-4 space-y-3">
                  <p className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Sobram no Banco / Maquininha ({filteredExtra.length})
                  </p>
                  {filteredExtra.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhuma sobra pendente para este filtro.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredExtra.map((ex) => (
                        <div
                          key={ex.id}
                          className="rounded-xl bg-white dark:bg-[#202c33] border border-slate-200/80 dark:border-[#2a3942] p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                              {formatCents(ex.amountCents)}
                            </span>
                            <span className="text-[10.5px] font-bold uppercase text-slate-500">
                              {ex.source} • {ex.timeStr}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-800 dark:text-[#e9edef]">{ex.description}</p>
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {linkableSystemPool.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setLinkingExtraId(linkingExtraId === ex.id ? null : ex.id);
                                  setLinkingExtraSysId('');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-[#00a884]/15 text-[#00a884] text-[11px] font-bold flex items-center gap-1"
                              >
                                <Link2 size={11} /> Vincular Venda PDV
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onIgnoreItem('real', ex.id)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#111b21] text-[11px] font-bold text-slate-500 hover:text-rose-500 flex items-center gap-1"
                            >
                              <EyeOff size={11} /> Ignorar (Não-PDV)
                            </button>
                          </div>
                          {linkingExtraId === ex.id && (
                            <div className="flex items-center gap-2 pt-1.5">
                              <select
                                value={linkingExtraSysId}
                                onChange={(e) => setLinkingExtraSysId(e.target.value)}
                                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs"
                              >
                                <option value="">Escolha a venda PDV...</option>
                                {linkableSystemPool.map((sys) => (
                                  <option key={sys.id} value={sys.id}>
                                    {formatCents(sys.amountCents)} • {CATEGORY_LABELS[sys.category] || sys.category} • {sys.timeStr} • {sys.referenceCode}
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
                                className="px-3 py-1.5 rounded-lg bg-[#00a884] disabled:opacity-40 text-white text-xs font-bold"
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
              </div>
            )}

            {/* 3. Lançamentos do PDV nesta forma + ajuste manual */}
            {(sortedSystemItems.length > 0 || reclassifiedOutItems.length > 0) && (
              <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/75 p-4 space-y-3">
                <p className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#aebac1]">
                  Lançamentos do PDV em {row.label} ({sortedSystemItems.length}) — ajuste a forma caso tenha sido lançado errado no caixa
                </p>

                <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                  {sortedSystemItems.map((it) => {
                    const isMatched = matchedIds.has(it.id);
                    const reclassifiedFrom = typeof it.metadata?.reclassifiedFrom === 'string' ? it.metadata.reclassifiedFrom : '';
                    return (
                      <div key={it.id} className="py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
                              {formatCents(it.amountCents)}
                            </span>
                            <span className="font-semibold text-slate-800 dark:text-[#e9edef]">{it.description}</span>
                            {isMatched && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                                Conciliado
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
            )}

            {/* 4. Específicos da linha */}
            {row.key === 'saldo_dinheiro' && saidasDetalhadas.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/75 p-4 space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#aebac1]">
                  Saídas, Vales e Sangrias Registradas no Turno
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                  {saidasDetalhadas.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#111b21]">
                      <span className="text-slate-700 dark:text-[#d1d7db] truncate pr-2">{s.label}</span>
                      <strong className="text-rose-500 tabular-nums shrink-0">-{formatCents(s.amountCents)}</strong>
                    </div>
                  ))}
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

            {/* 5. Conciliados com Sucesso */}
            {matchedPairs.length > 0 && (
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                <button
                  type="button"
                  onClick={() => setShowMatched((v) => !v)}
                  className="w-full flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-400"
                >
                  <span>
                    Ver {matchedPairs.length} lançamento(s) já conciliado(s) nesta linha ({formatCents(matchedTotalCents)})
                  </span>
                  {showMatched ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {showMatched && (
                  <div className="mt-3 divide-y divide-emerald-500/15 text-xs">
                    {matchedPairs.map((pair) => (
                      <div key={pair.id} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="text-slate-700 dark:text-[#d1d7db]">
                          <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {formatCents(pair.amountCents)}
                          </strong>{' '}
                          • PDV: {(pair.systemItems || []).map((s) => `${s.timeStr} ${s.description}`).join(' + ')} ↔ Real:{' '}
                          {(pair.realItems || []).map((r) => `${r.timeStr} ${r.description}`).join(' + ')}
                        </div>
                        <span className="text-[11px] text-slate-500 shrink-0">{pair.reasonText}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {matchedPairs.length === 0 &&
              suggestions.length === 0 &&
              missingItems.length === 0 &&
              extraItems.length === 0 &&
              sortedSystemItems.length === 0 &&
              pendingDebtors.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-[#8696a0] text-center py-6">
                  Nenhum lançamento individual detalhado vinculado a {categories.join(', ')} nos arquivos enviados.
                </p>
              )}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
