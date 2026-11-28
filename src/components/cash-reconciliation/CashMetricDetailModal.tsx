import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Percent,
  Receipt,
  Ban,
  Coffee,
  Truck,
  Users,
  TrendingDown,
  Award,
  Search,
  Clock,
  CreditCard,
  ShoppingBag,
  AlertTriangle,
  Sparkles,
  UserCheck,
  Layers
} from 'lucide-react';
import {
  CashReconciliationItem,
  CashReconciliationResult,
  formatCents
} from '../../types/cashReconciliation';
import { buildHealthMetricDetail, formatDateBr } from '../../utils/cashReconciliationServiceHelper.mjs';

export type HealthMetricKey =
  | 'fees'
  | 'net_digital'
  | 'cancelled'
  | 'discounts'
  | 'delivery_house_fees'
  | 'guests';

const METRIC_META: Record<HealthMetricKey, { title: string; subtitle: string; icon: React.ReactNode }> = {
  fees: {
    title: 'Detalhamento de Taxas de Cartão (MDR)',
    subtitle: 'Comparativo entre bancos/adquirentes, diferença de tarifas e simulação de economia',
    icon: <Percent size={18} className="text-rose-500" />
  },
  net_digital: {
    title: 'Líquido Digital por Canal',
    subtitle: 'Bruto, taxas MDR descontadas, participação e eficiência entre adquirentes',
    icon: <Receipt size={18} className="text-emerald-500" />
  },
  cancelled: {
    title: 'Itens Cancelados no PDV',
    subtitle: 'Auditoria completa por motivo, garçom/operador, mesa e horário no turno',
    icon: <Ban size={18} className="text-rose-500" />
  },
  discounts: {
    title: 'Descontos & Consumo Interno',
    subtitle: 'Rankings por colaborador e motivo, concessões de 10% e itens consumidos pela equipe',
    icon: <Coffee size={18} className="text-amber-500" />
  },
  delivery_house_fees: {
    title: 'Taxa de Entrega + Taxa da Casa',
    subtitle: 'Entregas Delivery, cobrança de 10% no salão e auditoria de isenções/remoções',
    icon: <Truck size={18} className="text-indigo-500" />
  },
  guests: {
    title: 'Movimento de Pessoas & Ticket Médio',
    subtitle: 'Indicadores operacionais de atendimento e faturamento por canal',
    icon: <Users size={18} className="text-cyan-500" />
  }
};

interface AcquirerSourceStat {
  source: string;
  label: string;
  count: number;
  grossCents: number;
  feeCents: number;
  netCents: number;
  effectiveRatePct: number;
  creditCount: number;
  creditGrossCents: number;
  creditFeeCents: number;
  creditRatePct: number | null;
  debitCount: number;
  debitGrossCents: number;
  debitFeeCents: number;
  debitRatePct: number | null;
}

interface AcquirerProfileComparison {
  key: string;
  label: string;
  modality: string;
  brand: string;
  matchScope: 'brand' | 'modality';
  cheapestSource: string;
  cheapestLabel: string;
  cheapestRatePct: number;
  mostExpensiveSource: string;
  mostExpensiveLabel: string;
  mostExpensiveRatePct: number;
  spreadPctPoints: number;
  potentialSavingsCents: number;
  entries: Array<{
    source: string;
    label: string;
    count: number;
    grossCents: number;
    feeCents: number;
    ratePct: number;
    excessFeeCents: number;
  }>;
}

interface AcquirerComparisonData {
  hasMultipleSources: boolean;
  sources: AcquirerSourceStat[];
  cheapestSource: AcquirerSourceStat | null;
  mostExpensiveSource: AcquirerSourceStat | null;
  rateSpreadPctPoints: number;
  profileComparisons: AcquirerProfileComparison[];
  optimalRoutingSavingsCents: number;
  globalAverageSavingsCents: number;
  headlineSavingsCents: number;
  monthlyProjectedSavingsCents: number;
  recommendations: string[];
}

function formatPctBr(pct: number | null | undefined): string {
  return `${Number(pct || 0).toFixed(2).replace('.', ',')}%`;
}

function formatPpBr(pp: number | null | undefined): string {
  return `${Number(pp || 0).toFixed(2).replace('.', ',')} p.p.`;
}

function ProgressRankBar({
  label,
  sublabel,
  valueCents,
  maxCents,
  countText,
  tone = 'emerald'
}: {
  label: string;
  sublabel?: string;
  valueCents: number;
  maxCents: number;
  countText?: string;
  tone?: 'emerald' | 'rose' | 'amber' | 'indigo' | 'cyan';
}) {
  const pctWidth = maxCents > 0 ? Math.min(100, Math.max(4, Math.round((valueCents / maxCents) * 100))) : 0;
  const barTone = {
    emerald: 'bg-emerald-500',
    rose: 'bg-rose-500',
    amber: 'bg-amber-500',
    indigo: 'bg-indigo-500',
    cyan: 'bg-cyan-500'
  }[tone];
  const textTone = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    rose: 'text-rose-600 dark:text-rose-400',
    amber: 'text-amber-600 dark:text-amber-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    cyan: 'text-cyan-600 dark:text-cyan-400'
  }[tone];

  return (
    <div className="space-y-1.5 py-2">
      <div className="flex items-start justify-between gap-2 text-xs">
        <div className="min-w-0">
          <p className="font-bold text-slate-900 dark:text-white truncate">{label}</p>
          {sublabel && <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0] truncate">{sublabel}</p>}
        </div>
        <div className="text-right tabular-nums shrink-0">
          <strong className={`font-black ${textTone}`}>{formatCents(valueCents)}</strong>
          {countText && <span className="block text-[10px] text-slate-500 dark:text-[#8696a0]">{countText}</span>}
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-[#111b21] overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${barTone}`} style={{ width: `${pctWidth}%` }} />
      </div>
    </div>
  );
}

function AcquirerComparisonSection({ comparison }: { comparison?: AcquirerComparisonData }) {
  if (!comparison || !comparison.hasMultipleSources || comparison.sources.length < 2) {
    return null;
  }

  const cheapest = comparison.cheapestSource;
  const mostExp = comparison.mostExpensiveSource;

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-cyan-500/10 p-4 space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-[10.5px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
            <TrendingDown size={14} /> Comparativo Entre Adquirentes & Simulação de Economia
          </p>
          <p className="text-xs text-slate-700 dark:text-[#d1d7db]">
            Diferença média entre{' '}
            <strong>{cheapest?.label}</strong> ({formatPctBr(cheapest?.effectiveRatePct)}) e{' '}
            <strong>{mostExp?.label}</strong> ({formatPctBr(mostExp?.effectiveRatePct)}):{' '}
            <strong className="text-rose-600 dark:text-rose-400">
              {formatPpBr(comparison.rateSpreadPctPoints)}
            </strong>
          </p>
        </div>

        <div className="rounded-xl bg-white/90 dark:bg-[#111b21]/90 border border-emerald-500/35 px-3.5 py-2 text-left sm:text-right shrink-0">
          <span className="block text-[9.5px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            Economia Usando a Mais Econômica
          </span>
          <strong className="text-lg font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
            {comparison.headlineSavingsCents > 0
              ? `+${formatCents(comparison.headlineSavingsCents)} hoje`
              : 'Taxas equilibradas hoje'}
          </strong>
          {comparison.monthlyProjectedSavingsCents > 0 && (
            <span className="block text-[10px] font-bold text-slate-500 dark:text-[#8696a0] tabular-nums">
              Projeção (~30d nesse mix): {formatCents(comparison.monthlyProjectedSavingsCents)}/mês
            </span>
          )}
        </div>
      </div>

      {/* Ranking entre adquirentes / bancos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {comparison.sources.map((src, idx) => {
          const isBest = idx === 0;
          const diffPp = cheapest ? Math.max(0, src.effectiveRatePct - cheapest.effectiveRatePct) : 0;
          return (
            <div
              key={src.source}
              className={`rounded-xl border p-3 transition-all ${
                isBest
                  ? 'border-emerald-500/45 bg-white/95 dark:bg-[#111b21]/95 shadow-sm'
                  : 'border-slate-200/80 dark:border-[#2a3942] bg-white/75 dark:bg-[#202c33]/75'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-slate-900 dark:text-white text-xs inline-flex items-center gap-1.5">
                  {isBest && <Award size={13} className="text-emerald-500 shrink-0" />}
                  {src.label}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    isBest
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {isBest ? 'Mais Econômica' : `+${formatPpBr(diffPp)}`}
                </span>
              </div>

              <div className="mt-2 flex items-baseline justify-between gap-2 tabular-nums">
                <div>
                  <span className="text-[10px] uppercase text-slate-400 block">Taxa Média Efetiva</span>
                  <strong className="text-base font-black text-slate-900 dark:text-white">
                    {formatPctBr(src.effectiveRatePct)}
                  </strong>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase text-slate-400 block">Total MDR</span>
                  <strong className="text-sm font-black text-rose-600 dark:text-rose-400">
                    -{formatCents(src.feeCents)}
                  </strong>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[#2a3942] flex flex-wrap items-center justify-between gap-1 text-[10.5px] text-slate-500 dark:text-[#8696a0] tabular-nums">
                <span>
                  Créd:{' '}
                  <strong className="text-slate-700 dark:text-[#d1d7db]">
                    {src.creditRatePct !== null ? formatPctBr(src.creditRatePct) : '-'}
                  </strong>
                </span>
                <span>
                  Déb:{' '}
                  <strong className="text-slate-700 dark:text-[#d1d7db]">
                    {src.debitRatePct !== null ? formatPctBr(src.debitRatePct) : '-'}
                  </strong>
                </span>
                <span>Bruto: {formatCents(src.grossCents)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparativo justo por Modalidade & Bandeira */}
      {comparison.profileComparisons.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 dark:border-[#2a3942] bg-white/85 dark:bg-[#111b21]/85 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-700 dark:text-[#aebac1]">
              Comparação Direta por Modalidade & Bandeira ({comparison.profileComparisons.length})
            </p>
            {comparison.globalAverageSavingsCents > 0 &&
              comparison.optimalRoutingSavingsCents > 0 &&
              comparison.globalAverageSavingsCents !== comparison.optimalRoutingSavingsCents && (
                <span className="text-[10px] text-slate-500 dark:text-[#8696a0] tabular-nums">
                  Pela média global ({cheapest?.label}): {formatCents(comparison.globalAverageSavingsCents)}
                </span>
              )}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
            {comparison.profileComparisons.map((prof) => (
              <div
                key={prof.key}
                className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-black text-slate-900 dark:text-white">{prof.label}</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-black text-[10px]">
                      Vence: {prof.cheapestLabel} ({formatPctBr(prof.cheapestRatePct)})
                    </span>
                    <span className="text-slate-500 dark:text-[#8696a0]">
                      vs {prof.mostExpensiveLabel} ({formatPctBr(prof.mostExpensiveRatePct)})
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                    {prof.entries
                      .map((e) => `${e.label}: ${e.count}x (${formatCents(e.grossCents)}) • ${formatPctBr(e.ratePct)}`)
                      .join(' | ')}
                  </p>
                </div>
                <div className="text-left sm:text-right shrink-0 tabular-nums">
                  <span className="block font-black text-emerald-600 dark:text-emerald-400">
                    Economia: +{formatCents(prof.potentialSavingsCents)}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-[#8696a0]">
                    Dif: {formatPpBr(prof.spreadPctPoints)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {comparison.recommendations.length > 0 && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-2 text-[11px] text-emerald-900 dark:text-emerald-200 space-y-1">
          <p className="font-black uppercase text-[9.5px] tracking-wider flex items-center gap-1">
            <Sparkles size={11} /> Dica de Roteamento na Maquininha
          </p>
          {comparison.recommendations.slice(0, 3).map((rec, idx) => (
            <p key={idx}>• {rec}</p>
          ))}
        </div>
      )}
    </div>
  );
}

interface CashMetricDetailModalProps {
  metricKey: HealthMetricKey;
  result: CashReconciliationResult;
  onClose: () => void;
}

export function CashMetricDetailModal({ metricKey, result, onClose }: CashMetricDetailModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [modalityFilter, setModalityFilter] = useState<string>('ALL');
  const [feeSortBy, setFeeSortBy] = useState<'fee_desc' | 'rate_desc' | 'time_desc'>('fee_desc');
  const [waiterFilter, setWaiterFilter] = useState<string>('ALL');
  const [reasonFilter, setReasonFilter] = useState<string>('ALL');
  const [subTab, setSubTab] = useState<string>('overview');

  useEffect(() => {
    setSearchTerm('');
    setSourceFilter('ALL');
    setModalityFilter('ALL');
    setFeeSortBy('fee_desc');
    setWaiterFilter('ALL');
    setReasonFilter('ALL');
    setSubTab('overview');
  }, [metricKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const detail = useMemo(
    () => buildHealthMetricDetail(result, metricKey) as Record<string, unknown>,
    [result, metricKey]
  );

  const meta = METRIC_META[metricKey];
  const qLower = searchTerm.trim().toLowerCase();

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md p-0 sm:p-6 flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
    >
      <div
        className="w-full max-w-5xl max-h-[92dvh] sm:max-h-[90vh] rounded-t-[28px] sm:rounded-3xl border border-slate-200 dark:border-[#2a3942] bg-white/95 dark:bg-[#111b21]/95 shadow-[0_20px_50px_rgba(0,0,0,0.35)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Glassmorphism */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-200 dark:border-[#2a3942] bg-slate-50/90 dark:bg-[#202c33]/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] flex items-center justify-center shrink-0 shadow-xs">
              {meta.icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">{meta.title}</h3>
              <p className="text-[11px] text-slate-500 dark:text-[#8696a0] truncate">{meta.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-600 dark:text-[#aebac1] hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 shrink-0 active:scale-95 transition-all"
          >
            <X size={14} /> Fechar
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto overscroll-y-contain p-4 sm:p-5 space-y-4 text-xs">
          {/* ==================== 1. TAXAS DE CARTÃO (MDR) ==================== */}
          {metricKey === 'fees' && (() => {
            const bySource = (detail.bySource as Array<{ source: string; count: number; grossCents: number; feeCents: number; netCents: number }>) || [];
            const items = (detail.items as CashReconciliationItem[]) || [];
            const comparison = detail.comparison as AcquirerComparisonData | undefined;
            const totalFeeCents = Number(detail.totalFeeCents || 0);
            const totalGross = Number(detail.totalCardGrossCents || 0);
            const avgRate = Number(detail.avgEffectiveRatePct || 0);

            const filteredFeeItems = items
              .filter((it) => {
                if (sourceFilter !== 'ALL' && String(it.source || '').toUpperCase() !== sourceFilter) return false;
                if (modalityFilter !== 'ALL') {
                  const sub = String(it.subCategory || '').toUpperCase();
                  const desc = String(it.description || '').toUpperCase();
                  const isDeb = sub.includes('DEB') || desc.includes('DEBIT');
                  if (modalityFilter === 'DEBITO' && !isDeb) return false;
                  if (modalityFilter === 'CREDITO' && isDeb) return false;
                }
                if (qLower) {
                  const hay = `${it.description} ${it.source} ${it.timeStr} ${(it.amountCents / 100).toFixed(2)} ${it.metadata?.bandeira || ''}`.toLowerCase();
                  if (!hay.includes(qLower)) return false;
                }
                return true;
              })
              .sort((a, b) => {
                if (feeSortBy === 'rate_desc') {
                  const rA = a.amountCents > 0 ? Number(a.feeCents || 0) / a.amountCents : 0;
                  const rB = b.amountCents > 0 ? Number(b.feeCents || 0) / b.amountCents : 0;
                  return rB - rA;
                }
                if (feeSortBy === 'time_desc') return (b.secondsOfDay || 0) - (a.secondsOfDay || 0);
                return Number(b.feeCents || 0) - Number(a.feeCents || 0);
              });

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-2xl bg-rose-500/10 border border-rose-500/25 p-3.5">
                    <p className="text-[10px] font-black uppercase text-rose-500">Total de Taxas MDR</p>
                    <p className="text-xl font-black text-rose-600 dark:text-rose-400 tabular-nums mt-0.5">
                      -{formatCents(totalFeeCents)}
                    </p>
                    <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0] mt-0.5 tabular-nums">
                      Taxa média: {formatPctBr(avgRate)} s/ {formatCents(totalGross)}
                    </p>
                  </div>
                  {bySource.map((src) => {
                    const srcRate = src.grossCents > 0 ? (src.feeCents / src.grossCents) * 100 : 0;
                    const isCheapest = comparison?.hasMultipleSources && comparison.cheapestSource?.source === src.source;
                    return (
                      <div
                        key={src.source}
                        className={`rounded-2xl border p-3.5 ${
                          isCheapest
                            ? 'bg-emerald-500/10 border-emerald-500/35'
                            : 'bg-slate-50 dark:bg-[#202c33] border-slate-200 dark:border-[#2a3942]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-[10px] font-black uppercase text-slate-500 dark:text-[#aebac1]">
                            {src.source} ({src.count} venda(s))
                          </p>
                          <span className="text-[10px] font-black tabular-nums text-slate-700 dark:text-white">
                            {formatPctBr(srcRate)}
                          </span>
                        </div>
                        <p className="text-base font-black text-slate-900 dark:text-white tabular-nums whitespace-nowrap mt-0.5">
                          {`-${formatCents(src.feeCents)}`}
                        </p>
                        <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0] tabular-nums">
                          Bruto: {formatCents(src.grossCents)} • Líq: {formatCents(src.netCents)}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <AcquirerComparisonSection comparison={comparison} />

                {/* Barra de filtros */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/60 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {['ALL', ...bySource.map((s) => s.source)].map((srcKey) => (
                      <button
                        key={srcKey}
                        type="button"
                        onClick={() => setSourceFilter(srcKey)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                          sourceFilter === srcKey
                            ? 'bg-[#00a884] text-white'
                            : 'bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1]'
                        }`}
                      >
                        {srcKey === 'ALL' ? `Todas (${items.length})` : srcKey}
                      </button>
                    ))}
                    <div className="h-4 w-px bg-slate-300 dark:bg-[#2a3942] mx-1 hidden sm:block" />
                    {(['ALL', 'CREDITO', 'DEBITO'] as const).map((mod) => (
                      <button
                        key={mod}
                        type="button"
                        onClick={() => setModalityFilter(mod)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                          modalityFilter === mod
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1]'
                        }`}
                      >
                        {mod === 'ALL' ? 'Créd + Déb' : mod === 'CREDITO' ? 'Crédito' : 'Débito'}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-48">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar bandeira, R$..."
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-[#00a884]"
                      />
                    </div>
                    <select
                      value={feeSortBy}
                      onChange={(e) => setFeeSortBy(e.target.value as 'fee_desc' | 'rate_desc' | 'time_desc')}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-semibold text-slate-700 dark:text-[#e9edef]"
                    >
                      <option value="fee_desc">Maior Taxa R$</option>
                      <option value="rate_desc">Maior % Efetiva</option>
                      <option value="time_desc">Mais Recentes</option>
                    </select>
                  </div>
                </div>

                {filteredFeeItems.length === 0 ? (
                  <p className="text-slate-500 py-6 text-center">Nenhuma taxa encontrada para os filtros selecionados.</p>
                ) : (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] divide-y divide-slate-100 dark:divide-[#2a3942] overflow-hidden bg-white dark:bg-[#111b21]/60">
                    {filteredFeeItems.map((it) => {
                      const pct = it.amountCents > 0 ? ((Number(it.feeCents || 0) / it.amountCents) * 100).toFixed(2) : '0.00';
                      return (
                        <div key={it.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 hover:bg-slate-50/70 dark:hover:bg-[#202c33]/40 transition-colors">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <CreditCard size={13} className="text-slate-400 shrink-0" />
                              <p className="font-bold text-slate-800 dark:text-[#e9edef] truncate">{it.description}</p>
                              {typeof it.metadata?.bandeira === 'string' && it.metadata.bandeira && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#202c33] text-[10px] font-bold text-slate-600 dark:text-[#aebac1]">
                                  {it.metadata.bandeira}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-[#8696a0] mt-0.5">
                              {formatDateBr(it.dateStr)} {it.timeStr || '-'} • Bruto: <strong className="tabular-nums">{formatCents(it.amountCents)}</strong>
                            </p>
                          </div>
                          <div className="text-left sm:text-right tabular-nums shrink-0">
                            <span className="font-black text-rose-500 whitespace-nowrap">{`-${formatCents(it.feeCents)}`}</span>
                            <span className="text-[10.5px] text-slate-400 ml-1.5">({pct.replace('.', ',')}%)</span>
                            <p className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-bold">
                              Líquido: {formatCents(it.netAmountCents ?? (it.amountCents - (it.feeCents || 0)))}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ==================== 2. LÍQUIDO DIGITAL POR CANAL ==================== */}
          {metricKey === 'net_digital' && (() => {
            const channels = (detail.channels as Array<{
              key: string;
              label: string;
              source?: string;
              category?: string;
              count: number;
              grossCents: number;
              feeCents: number;
              netCents: number;
              effectiveRatePct?: number;
              grossSharePct?: number;
            }>) || [];
            const comparison = detail.comparison as AcquirerComparisonData | undefined;
            const totalDigitalGross = Number(detail.totalDigitalGrossCents || 0);
            const totalFee = Number(detail.totalFeeCents || 0);
            const avgGlobalFeeRate = totalDigitalGross > 0 ? Number(((totalFee / totalDigitalGross) * 100).toFixed(2)) : 0;

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-4">
                    <p className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">Líquido Digital Total</p>
                    <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                      {formatCents(Number(detail.totalNetDigitalCents || 0))}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-4">
                    <p className="text-[10px] font-black uppercase text-slate-500">Bruto Digital (PIX + Cartão)</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {formatCents(totalDigitalGross)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4">
                    <p className="text-[10px] font-black uppercase text-rose-500">Taxas Descontadas</p>
                    <p className="text-xl font-black text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap mt-0.5">
                      {`-${formatCents(totalFee)}`}
                    </p>
                    <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">Média s/ digital: {formatPctBr(avgGlobalFeeRate)}</p>
                  </div>
                  <div className="rounded-2xl bg-indigo-500/10 border border-indigo-500/25 p-4">
                    <p className="text-[10px] font-black uppercase text-indigo-500">Economia Possível no Cartão</p>
                    <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums mt-0.5">
                      {comparison?.hasMultipleSources && comparison.headlineSavingsCents > 0
                        ? `+${formatCents(comparison.headlineSavingsCents)}`
                        : 'R$ 0,00'}
                    </p>
                    <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                      {comparison?.cheapestSource ? `Líder: ${comparison.cheapestSource.label}` : '1 adquirente ativa'}
                    </p>
                  </div>
                </div>

                <AcquirerComparisonSection comparison={comparison} />

                <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] divide-y divide-slate-100 dark:divide-[#2a3942] bg-white dark:bg-[#111b21]/60 overflow-hidden">
                  {channels.length === 0 ? (
                    <p className="p-6 text-center text-slate-500">Sem transações digitais reais carregadas.</p>
                  ) : (
                    channels.map((ch) => (
                      <div key={ch.key} className="px-4 py-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-slate-900 dark:text-white">{ch.label}</p>
                              {typeof ch.grossSharePct === 'number' && (
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#202c33] text-[10px] font-black text-slate-600 dark:text-[#aebac1] tabular-nums">
                                  {ch.grossSharePct}% do volume
                                </span>
                              )}
                              {Number(ch.feeCents || 0) > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-[10px] font-black text-rose-600 dark:text-rose-300 tabular-nums">
                                  MDR {formatPctBr(ch.effectiveRatePct)}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                              {ch.count} lançamento(s) • Bruto: {formatCents(ch.grossCents)}
                            </p>
                          </div>
                          <div className="text-right tabular-nums shrink-0">
                            <p className="font-black text-emerald-600 dark:text-emerald-400 text-sm">{formatCents(ch.netCents)}</p>
                            {ch.feeCents > 0 && <p className="text-[10.5px] text-rose-500 whitespace-nowrap">{`Taxa: -${formatCents(ch.feeCents)}`}</p>}
                          </div>
                        </div>
                        {totalDigitalGross > 0 && (
                          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#202c33] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${ch.category === 'pix' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                              style={{ width: `${Math.min(100, Math.max(4, ch.grossSharePct || 0))}%` }}
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })()}

          {/* ==================== 3. ITENS CANCELADOS NO PDV ==================== */}
          {metricKey === 'cancelled' && (() => {
            const detailed = (detail.detailedItems as Array<{
              code?: string;
              product: string;
              qty: number;
              totalCents: number;
              table: string;
              timeStr?: string;
              waiter?: string;
              operator?: string;
              machineName?: string;
              turn?: string;
              reason?: string;
              reasonDetails?: string;
              group?: string;
            }>) || [];
            const fallbackItems = (detail.items as Array<{ table: string; item: string; qty: number }>) || [];
            const byReason = (detail.byReason as Array<{ reason: string; count: number; totalCents: number; waiters: string[] }>) || [];
            const byWaiter = (detail.byWaiter as Array<{ name: string; count: number; totalCents: number; tablesCount: number }>) || [];
            const byGroup = (detail.byGroup as Array<{ group: string; count: number; totalCents: number }>) || [];
            const cancelledCents = Number(detail.cancelledCents || 0);
            const impactPct = Number(detail.impactPctOfSales || 0);

            const waiterOptions = Array.from(new Set(detailed.map((d) => d.waiter || d.operator || '').filter((x) => x && x !== '-')));
            const reasonOptions = byReason.map((r) => r.reason);

            const filteredDetailed = detailed.filter((it) => {
              const effWaiter = (it.waiter || it.operator || '').trim();
              if (waiterFilter !== 'ALL' && effWaiter !== waiterFilter) return false;
              const effReason = (it.reason && it.reason !== '-' ? it.reason : (it.reasonDetails || 'Motivo não especificado')).trim();
              if (reasonFilter !== 'ALL' && effReason !== reasonFilter) return false;
              if (qLower) {
                const hay = `${it.product} ${it.table} ${it.reason || ''} ${it.reasonDetails || ''} ${it.waiter || ''} ${it.operator || ''} ${it.group || ''}`.toLowerCase();
                if (!hay.includes(qLower)) return false;
              }
              return true;
            });

            const maxReasonCents = byReason[0]?.totalCents || cancelledCents || 1;
            const maxWaiterCents = byWaiter[0]?.totalCents || cancelledCents || 1;

            return (
              <div className="space-y-4">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-3.5">
                    <p className="text-[10px] font-black uppercase text-slate-500">Quantidade Cancelada</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
                      {Number(detail.cancelledCount || 0)} item(ns)
                    </p>
                  </div>
                  <div className="rounded-2xl bg-rose-500/10 border border-rose-500/25 p-3.5">
                    <p className="text-[10px] font-black uppercase text-rose-500">Total Cancelado</p>
                    <p className="text-xl font-black text-rose-600 dark:text-rose-400 tabular-nums mt-0.5">
                      {formatCents(cancelledCents)}
                    </p>
                    <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                      {impactPct > 0 ? `${formatPctBr(impactPct)} s/ vendas PDV` : 'Registrado no turno'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-3.5 min-w-0">
                    <p className="text-[10px] font-black uppercase text-slate-500">Principal Motivo</p>
                    <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate mt-1">
                      {byReason[0]?.reason || 'Não detalhado'}
                    </p>
                    {byReason[0] && (
                      <p className="text-[10.5px] text-rose-500 font-bold tabular-nums">
                        {byReason[0].count}x • {formatCents(byReason[0].totalCents)}
                      </p>
                    )}
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-3.5 min-w-0">
                    <p className="text-[10px] font-black uppercase text-slate-500">Garçom / Resp. Líder</p>
                    <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate mt-1">
                      {byWaiter[0]?.name || 'Não informado'}
                    </p>
                    {byWaiter[0] && (
                      <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0] tabular-nums">
                        {byWaiter[0].count}x • {formatCents(byWaiter[0].totalCents)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Rankings analíticos */}
                {detailed.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/70 p-3.5">
                      <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1] mb-1">
                        Cancelamentos por Motivo ({byReason.length})
                      </p>
                      <div className="divide-y divide-slate-200/60 dark:divide-[#2a3942]">
                        {byReason.slice(0, 6).map((r) => (
                          <ProgressRankBar
                            key={r.reason}
                            label={r.reason}
                            sublabel={r.waiters.length > 0 ? `Envolvidos: ${r.waiters.join(', ')}` : undefined}
                            valueCents={r.totalCents}
                            maxCents={maxReasonCents}
                            countText={`${r.count} item(ns)`}
                            tone="rose"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/70 p-3.5">
                      <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1] mb-1">
                        Cancelamentos por Garçom / Operador ({byWaiter.length})
                      </p>
                      <div className="divide-y divide-slate-200/60 dark:divide-[#2a3942]">
                        {byWaiter.slice(0, 6).map((w) => (
                          <ProgressRankBar
                            key={w.name}
                            label={w.name}
                            sublabel={`${w.tablesCount} mesa(s)/pedido(s)`}
                            valueCents={w.totalCents}
                            maxCents={maxWaiterCents}
                            countText={`${w.count} item(ns)`}
                            tone="amber"
                          />
                        ))}
                      </div>
                      {byGroup.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200/80 dark:border-[#2a3942] flex flex-wrap gap-1.5">
                          {byGroup.slice(0, 5).map((g) => (
                            <span
                              key={g.group}
                              className="px-2 py-0.5 rounded-full bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] text-[10px] font-bold text-slate-600 dark:text-[#aebac1]"
                            >
                              {g.group}: {g.count}x ({formatCents(g.totalCents)})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Filtros detalhados */}
                {detailed.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/60 p-3">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Filtrar produto, mesa, motivo ou garçom..."
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-[#00a884]"
                      />
                    </div>
                    {waiterOptions.length > 0 && (
                      <select
                        value={waiterFilter}
                        onChange={(e) => setWaiterFilter(e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-semibold text-slate-700 dark:text-[#e9edef]"
                      >
                        <option value="ALL">Garçom/Op: Todos</option>
                        {waiterOptions.map((w) => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                    )}
                    {reasonOptions.length > 1 && (
                      <select
                        value={reasonFilter}
                        onChange={(e) => setReasonFilter(e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-semibold text-slate-700 dark:text-[#e9edef]"
                      >
                        <option value="ALL">Motivo: Todos</option>
                        {reasonOptions.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {detailed.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] divide-y divide-slate-100 dark:divide-[#2a3942] bg-white dark:bg-[#111b21]/60 overflow-hidden">
                    {filteredDetailed.length === 0 ? (
                      <p className="p-6 text-center text-slate-500">Nenhum item cancelado para os filtros aplicados.</p>
                    ) : (
                      filteredDetailed.map((it, idx) => (
                        <div key={idx} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/70 dark:hover:bg-[#202c33]/40 transition-colors">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 font-black">
                                {it.qty}x
                              </span>
                              <p className="font-bold text-slate-900 dark:text-white">{it.product}</p>
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] text-[10px] font-black text-slate-600 dark:text-[#aebac1]">
                                Pedido/Mesa {it.table || '-'}
                              </span>
                              {it.group && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold">
                                  {it.group}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-rose-700 dark:text-rose-300">
                              <span>
                                Motivo: <strong>{it.reason && it.reason !== '-' ? it.reason : 'Registrado no App/Caixa'}</strong>
                                {it.reasonDetails ? ` — "${it.reasonDetails}"` : ''}
                              </span>
                            </div>
                            <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0] flex flex-wrap items-center gap-2">
                              {it.waiter && it.waiter !== '-' && (
                                <span className="inline-flex items-center gap-1"><UserCheck size={11} /> Garçom: <strong>{it.waiter}</strong></span>
                              )}
                              {it.operator && it.operator !== '-' && <span>• Op: {it.operator}</span>}
                              {it.machineName && <span>• Terminal: {it.machineName}</span>}
                              {it.turn && <span>• Turno {it.turn}</span>}
                            </p>
                          </div>
                          <div className="text-left sm:text-right shrink-0 tabular-nums">
                            <p className="text-sm font-black text-rose-600 dark:text-rose-400">
                              {it.totalCents > 0 ? formatCents(it.totalCents) : 'Cortesia/R$ 0,00'}
                            </p>
                            {it.timeStr && (
                              <p className="text-[10.5px] text-slate-400 inline-flex items-center gap-1 justify-end">
                                <Clock size={10} /> {it.timeStr}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : fallbackItems.length === 0 ? (
                  <p className="text-slate-500 py-6 text-center">Nenhum item cancelado discriminado no fechamento.</p>
                ) : (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] divide-y divide-slate-100 dark:divide-[#2a3942]">
                    {fallbackItems.map((it, idx) => (
                      <div key={idx} className="px-4 py-2.5 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{it.item}</p>
                          <p className="text-[11px] text-slate-500">Mesa {it.table}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold">
                          Qtd: {it.qty}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ==================== 4. DESCONTOS & CONSUMO INTERNO ==================== */}
          {metricKey === 'discounts' && (() => {
            const discountDetails = (detail.discountDetails as Array<{
              source: string;
              orderNumber: string;
              module?: string;
              timeStr?: string;
              amountCents: number;
              reason?: string;
              details?: string;
              employee?: string;
            }>) || [];
            const byEmployee = (detail.byEmployee as Array<{ employee: string; count: number; totalCents: number }>) || [];
            const byReason = (detail.byReason as Array<{ reason: string; count: number; totalCents: number }>) || [];
            const internalConsumptionItems = (detail.internalConsumptionItems as Array<{
              id: string;
              orderNumber: string;
              description: string;
              timeStr: string;
              operatorName: string;
              terminalName: string;
              amountCents: number;
              items: Array<{ qty: number; displayName: string; totalCents: number; waiter?: string }>;
            }>) || [];

            const costCents = Number(detail.internalConsumptionCostCents || 0);
            const discountsCents = Number(detail.discountsCents || 0);
            const internalCents = Number(detail.internalConsumptionCents || 0);
            const totalBenefitCents = Number(detail.totalBenefitCents ?? (discountsCents + internalCents));
            const impactPct = Number(detail.impactPctOfSales || 0);

            const filteredDiscounts = discountDetails.filter((d) => {
              if (!qLower) return true;
              const hay = `${d.orderNumber} ${d.module || ''} ${d.reason || ''} ${d.details || ''} ${d.employee || ''} ${d.source}`.toLowerCase();
              return hay.includes(qLower);
            });

            const maxEmpCents = byEmployee[0]?.totalCents || discountsCents || 1;
            const maxRsnCents = byReason[0]?.totalCents || discountsCents || 1;

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-3.5">
                    <p className="text-[10px] font-black uppercase text-slate-500">Descontos Concedidos</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {formatCents(discountsCents)}
                    </p>
                    <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                      {discountDetails.length} registro(s) detalhado(s)
                    </p>
                  </div>
                  <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-3.5">
                    <p className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">Consumo Interno</p>
                    <p className="text-xl font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                      {formatCents(internalCents)}
                    </p>
                    <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                      {costCents > 0 ? `Custo CMV: ${formatCents(costCents)}` : `${internalConsumptionItems.length} lançamento(s) PDV`}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-3.5">
                    <p className="text-[10px] font-black uppercase text-rose-500">Soma (Desc. + Consumo)</p>
                    <p className="text-xl font-black text-rose-600 dark:text-rose-400 tabular-nums mt-0.5">
                      {formatCents(totalBenefitCents)}
                    </p>
                    <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                      {impactPct > 0 ? `${formatPctBr(impactPct)} s/ vendas PDV` : 'Não entra no caixa líquido'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-3.5">
                    <p className="text-[10px] font-black uppercase text-slate-500">Total Sistema PDV</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {formatCents(Number(detail.systemTotalCents || 0))}
                    </p>
                  </div>
                </div>

                {/* Sub-abas */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { key: 'overview', label: 'Visão Geral & Rankings' },
                    { key: 'discounts_list', label: `Descontos (${discountDetails.length})` },
                    { key: 'internal_list', label: `Consumo Interno (${internalConsumptionItems.length})` }
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSubTab(tab.key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                        subTab === tab.key
                          ? 'border-[#00a884] bg-[#00a884]/15 text-[#008f6f] dark:text-[#00a884]'
                          : 'border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-slate-600 dark:text-[#aebac1]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {(subTab === 'overview' || subTab === 'discounts_list') && byEmployee.length > 0 && subTab === 'overview' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/70 p-3.5">
                      <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1] mb-1">
                        Descontos por Funcionário / Operador ({byEmployee.length})
                      </p>
                      <div className="divide-y divide-slate-200/60 dark:divide-[#2a3942]">
                        {byEmployee.slice(0, 6).map((emp) => (
                          <ProgressRankBar
                            key={emp.employee}
                            label={emp.employee}
                            valueCents={emp.totalCents}
                            maxCents={maxEmpCents}
                            countText={`${emp.count} desconto(s)`}
                            tone="amber"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/70 p-3.5">
                      <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1] mb-1">
                        Descontos por Motivo ({byReason.length})
                      </p>
                      <div className="divide-y divide-slate-200/60 dark:divide-[#2a3942]">
                        {byReason.slice(0, 6).map((r) => (
                          <ProgressRankBar
                            key={r.reason}
                            label={r.reason}
                            valueCents={r.totalCents}
                            maxCents={maxRsnCents}
                            countText={`${r.count} ocorrência(s)`}
                            tone="rose"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {(subTab === 'overview' || subTab === 'discounts_list') && (
                  <div className="space-y-2.5">
                    {discountDetails.length > 0 && (
                      <div className="relative max-w-sm">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Buscar desconto por pedido, motivo ou funcionário..."
                          className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-[#00a884]"
                        />
                      </div>
                    )}

                    {filteredDiscounts.length === 0 ? (
                      <p className="text-slate-500 py-4 text-center">
                        {discountDetails.length === 0
                          ? 'Nenhum desconto individual detalhado — importe a planilha de Descontos ou a fita resumo do DataDivas para ver cada concessão.'
                          : 'Nenhum desconto encontrado para a busca.'}
                      </p>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] divide-y divide-slate-100 dark:divide-[#2a3942] bg-white dark:bg-[#111b21]/60 overflow-hidden">
                        {filteredDiscounts.map((d, idx) => (
                          <div key={idx} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-white">
                                  Pedido {d.orderNumber || '-'} {d.module ? `(${d.module})` : ''}
                                </span>
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-black">
                                  {d.reason || d.source}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#202c33] text-[10px] font-semibold text-slate-500 dark:text-[#aebac1]">
                                  {d.source}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                                {d.timeStr || '-'} {d.employee ? `• Funcionário: ${d.employee}` : ''}
                                {d.details ? ` • Detalhe: "${d.details}"` : ''}
                              </p>
                            </div>
                            <strong className="text-sm font-black text-amber-600 dark:text-amber-400 tabular-nums shrink-0">
                              {formatCents(d.amountCents)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {(subTab === 'overview' || subTab === 'internal_list') && (
                  <div className="space-y-2.5">
                    <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1]">
                      Lançamentos de Consumo Interno no PDV ({internalConsumptionItems.length})
                    </p>
                    {internalConsumptionItems.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/50 p-4 text-slate-500 text-center">
                        Nenhum lançamento detalhado de Consumo Interno encontrado na PlanilhaRecebimento
                        {internalCents > 0 ? ` (Total apurado no fechamento: ${formatCents(internalCents)}).` : '.'}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {internalConsumptionItems.map((ci) => (
                          <div
                            key={ci.id}
                            className="rounded-2xl border border-amber-500/25 bg-white dark:bg-[#202c33]/75 p-3.5 space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                  <Coffee size={13} className="text-amber-500" />
                                  {ci.description}
                                  {ci.orderNumber && (
                                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#111b21] text-[10px] font-black">
                                      #{ci.orderNumber}
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                                  {ci.timeStr || '-'} • Op: {ci.operatorName || '-'} • Terminal: {ci.terminalName || '-'}
                                </p>
                              </div>
                              <strong className="text-sm font-black text-amber-600 dark:text-amber-400 tabular-nums">
                                {formatCents(ci.amountCents)}
                              </strong>
                            </div>
                            {ci.items.length > 0 && (
                              <div className="rounded-xl bg-slate-50 dark:bg-[#111b21] border border-slate-200/70 dark:border-[#2a3942] px-3 py-2 divide-y divide-slate-200/60 dark:divide-[#2a3942]">
                                {ci.items.map((prod, pIdx) => (
                                  <div key={pIdx} className="py-1 flex items-center justify-between gap-2 text-[11px]">
                                    <span className="text-slate-700 dark:text-[#d1d7db] truncate">
                                      <strong>{prod.qty}x</strong> {prod.displayName}
                                      {prod.waiter ? ` • Garçom: ${prod.waiter}` : ''}
                                    </span>
                                    <span className="font-bold tabular-nums text-slate-800 dark:text-white shrink-0">
                                      {formatCents(prod.totalCents)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ==================== 5. TAXA DE ENTREGA + TAXA DA CASA ==================== */}
          {metricKey === 'delivery_house_fees' && (() => {
            const feeRemovals = (detail.feeRemovals as Array<{
              orderNumber: string;
              module?: string;
              product: string;
              totalCents?: number;
              timeStr?: string;
              waiter?: string;
              reason?: string;
              details?: string;
              operator?: string;
            }>) || [];
            const deliveryOrders = (detail.deliveryOrders as Array<{
              id: string;
              orderNumber: string;
              description: string;
              timeStr: string;
              operatorName: string;
              amountCents: number;
              itemsSubtotalCents: number;
              inferredFeeCents: number;
              itemsCount: number;
            }>) || [];
            const serviceFeeOrders = (detail.serviceFeeOrders as Array<{
              id: string;
              orderNumber: string;
              module: string;
              timeStr: string;
              waiters: string[];
              itemsSubtotalCents: number;
              serviceFeeCents: number;
              totalPaidCents: number;
            }>) || [];
            const feeRemovalsByWaiter = (detail.feeRemovalsByWaiter as Array<{
              name: string;
              count: number;
              baseTotalCents: number;
              estimatedLostCents: number;
            }>) || [];

            const deliveryFeeCents = Number(detail.deliveryFeeCents || 0);
            const serviceFeeCents = Number(detail.serviceFeeCents || 0);
            const totalCents = Number(detail.totalCents || 0);
            const deliveryCount = Number(detail.deliveryOrdersCount || deliveryOrders.length || 0);
            const avgDeliveryFeeCents = Number(detail.avgDeliveryFeeCents || 0);
            const estimatedLostFeeCents = Number(detail.estimatedLostServiceFeeCents || 0);

            const filteredDeliveries = deliveryOrders.filter((d) => {
              if (!qLower) return true;
              return `${d.orderNumber} ${d.description} ${d.operatorName} ${d.timeStr}`.toLowerCase().includes(qLower);
            });

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-3.5">
                    <p className="text-[10px] font-black uppercase text-slate-500">Taxa Entrega Delivery</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {formatCents(deliveryFeeCents)}
                    </p>
                    <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0] tabular-nums">
                      {deliveryCount > 0
                        ? `${deliveryCount} entrega(s) • Média ${formatCents(avgDeliveryFeeCents)}/ped`
                        : 'Total apurado no fechamento'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-3.5">
                    <p className="text-[10px] font-black uppercase text-slate-500">Taxa Serviço Casa (10%)</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {formatCents(serviceFeeCents)}
                    </p>
                    <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                      {serviceFeeOrders.length > 0 ? `${serviceFeeOrders.length} mesa(s) detalhada(s)` : 'Taxa de salão no turno'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-indigo-500/10 border border-indigo-500/25 p-3.5">
                    <p className="text-[10px] font-black uppercase text-indigo-500">Soma das Taxas</p>
                    <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums mt-0.5">
                      {formatCents(totalCents)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-3.5">
                    <p className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">Remoções de 10% (Renúncia)</p>
                    <p className="text-xl font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                      {feeRemovals.length > 0 ? `-${formatCents(estimatedLostFeeCents)}` : 'R$ 0,00'}
                    </p>
                    <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                      {feeRemovals.length} item(ns) sem taxa de serviço
                    </p>
                  </div>
                </div>

                {/* Sub-abas */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { key: 'overview', label: `Remoções de Taxa (${feeRemovals.length})` },
                    { key: 'delivery_orders', label: `Pedidos Delivery (${deliveryOrders.length})` },
                    { key: 'service_orders', label: `Cobranças 10% Salão (${serviceFeeOrders.length})` }
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSubTab(tab.key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                        subTab === tab.key
                          ? 'border-[#00a884] bg-[#00a884]/15 text-[#008f6f] dark:text-[#00a884]'
                          : 'border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-slate-600 dark:text-[#aebac1]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {subTab === 'overview' && (
                  <div className="space-y-3">
                    {feeRemovalsByWaiter.length > 0 && (
                      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2">
                        <p className="text-[10.5px] font-black uppercase text-amber-700 dark:text-amber-300">
                          Isenções de Taxa 10% por Garçom / Responsável
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {feeRemovalsByWaiter.map((w) => (
                            <div
                              key={w.name}
                              className="rounded-xl bg-white/90 dark:bg-[#111b21]/90 border border-amber-500/20 px-3 py-2 flex items-center justify-between gap-2"
                            >
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white">{w.name}</p>
                                <p className="text-[10.5px] text-slate-500">{w.count} item(ns) • Consumo: {formatCents(w.baseTotalCents)}</p>
                              </div>
                              <strong className="text-amber-600 dark:text-amber-400 tabular-nums shrink-0">
                                Est. -{formatCents(w.estimatedLostCents)}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {feeRemovals.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/50 p-6 text-center space-y-1">
                        <p className="font-bold text-slate-700 dark:text-[#e9edef]">Nenhuma remoção manual de taxa de serviço registrada.</p>
                        <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                          Use as abas acima para inspecionar os pedidos Delivery ({deliveryOrders.length}) e as mesas com 10% ({serviceFeeOrders.length}).
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 divide-y divide-amber-500/15 overflow-hidden">
                        {feeRemovals.map((fr, i) => (
                          <div key={i} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-200 font-black">
                                  {fr.module || 'MESA'} #{fr.orderNumber}
                                </span>
                                <span className="font-bold text-slate-900 dark:text-white">{fr.product}</span>
                              </div>
                              <p className="text-amber-800 dark:text-amber-200">
                                Motivo: <strong>{fr.reason || 'Isenção manual'}</strong>
                                {fr.details ? ` — "${fr.details}"` : ''}
                              </p>
                              <p className="text-slate-500 dark:text-[#8696a0]">
                                {fr.waiter ? `Garçom: ${fr.waiter} • ` : ''}Op: {fr.operator || '-'} • {fr.timeStr || '-'}
                              </p>
                            </div>
                            <div className="text-left sm:text-right tabular-nums shrink-0">
                              {Number(fr.totalCents || 0) > 0 && (
                                <>
                                  <p className="font-black text-amber-700 dark:text-amber-300">
                                    Est. -{formatCents(Math.round(Number(fr.totalCents) * 0.1))}
                                  </p>
                                  <p className="text-[10px] text-slate-500">Base item: {formatCents(fr.totalCents)}</p>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {subTab === 'delivery_orders' && (
                  <div className="space-y-2.5">
                    {deliveryOrders.length > 0 && (
                      <div className="relative max-w-sm">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Buscar pedido Delivery por nº, forma ou R$..."
                          className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-[#00a884]"
                        />
                      </div>
                    )}
                    {filteredDeliveries.length === 0 ? (
                      <p className="p-6 text-center text-slate-500">Nenhum pedido Delivery encontrado na PlanilhaRecebimento.</p>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] divide-y divide-slate-100 dark:divide-[#2a3942] bg-white dark:bg-[#111b21]/60 overflow-hidden">
                        {filteredDeliveries.map((d) => (
                          <div key={d.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-black">
                                  DELIVERY #{d.orderNumber}
                                </span>
                                <span className="font-bold text-slate-900 dark:text-white truncate">{d.description}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                                {d.timeStr || '-'} • Op: {d.operatorName || '-'}
                                {d.itemsSubtotalCents > 0 ? ` • Produtos: ${formatCents(d.itemsSubtotalCents)} (${d.itemsCount} item(ns))` : ''}
                              </p>
                            </div>
                            <div className="text-left sm:text-right tabular-nums shrink-0">
                              <p className="font-black text-slate-900 dark:text-white">{formatCents(d.amountCents)}</p>
                              {d.inferredFeeCents > 0 && (
                                <p className="text-[10.5px] font-bold text-indigo-600 dark:text-indigo-400">
                                  Taxa entrega est.: +{formatCents(d.inferredFeeCents)}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {subTab === 'service_orders' && (
                  <div className="space-y-2.5">
                    {serviceFeeOrders.length === 0 ? (
                      <p className="p-6 text-center text-slate-500">
                        Importe o relatório de <strong>Itens Vendidos (Consumo Detalhado)</strong> para listar cada mesa/comanda que pagou Taxa de Serviço (10%).
                      </p>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] divide-y divide-slate-100 dark:divide-[#2a3942] bg-white dark:bg-[#111b21]/60 overflow-hidden">
                        {serviceFeeOrders.map((s) => (
                          <div key={s.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <p className="font-bold text-slate-900 dark:text-white">
                                {s.module} #{s.orderNumber}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                                {s.timeStr || '-'} {s.waiters.length > 0 ? `• Garçom: ${s.waiters.join(', ')}` : ''} • Consumo: {formatCents(s.itemsSubtotalCents)}
                              </p>
                            </div>
                            <div className="text-left sm:text-right tabular-nums shrink-0">
                              <p className="font-black text-emerald-600 dark:text-emerald-400">
                                Taxa 10%: {formatCents(s.serviceFeeCents)}
                              </p>
                              <p className="text-[10.5px] text-slate-500">Total conta: {formatCents(s.totalPaidCents)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ==================== 6. MOVIMENTO DE PESSOAS & TICKET ==================== */}
          {metricKey === 'guests' && (() => {
            const topProducts = (detail.topProducts as Array<{ name: string; qty: number; totalCents: number }>) || [];
            const byModule = (detail.byModule as Array<{ module: string; itemsCount: number; totalCents: number }>) || [];
            const byWaiter = (detail.byWaiter as Array<{ name: string; itemsCount: number; totalCents: number; feeRemovalsCount: number }>) || [];
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-4">
                    <p className="text-[10px] font-black uppercase text-slate-500">Pessoas Atendidas</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
                      {Number(detail.guestCount || 0)} pessoas
                    </p>
                  </div>
                  <div className="rounded-2xl bg-cyan-500/10 border border-cyan-500/25 p-4">
                    <p className="text-[10px] font-black uppercase text-cyan-600 dark:text-cyan-400">Ticket Médio / Pessoa</p>
                    <p className="text-xl font-black text-cyan-600 dark:text-cyan-400 tabular-nums mt-0.5">
                      {formatCents(Number(detail.averageTicketCents || 0))}/p
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-4">
                    <p className="text-[10px] font-black uppercase text-slate-500">Faturamento Base</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {formatCents(Number(detail.revenueConsideredCents || 0))}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-4">
                    <p className="text-[10px] font-black uppercase text-slate-500">Pendentes ({Number(detail.pendingCount || 0)})</p>
                    <p className="text-lg font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                      {formatCents(Number(detail.pendingCents || 0))}
                    </p>
                  </div>
                </div>

                {byModule.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {byModule.map((mod) => (
                      <div key={mod.module} className="rounded-xl border border-slate-200 dark:border-[#2a3942] p-3 bg-slate-50/70 dark:bg-[#202c33]/70">
                        <p className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1">
                          <Layers size={11} /> {mod.module}
                        </p>
                        <p className="text-sm font-black text-slate-900 dark:text-white tabular-nums">{formatCents(mod.totalCents)}</p>
                        <p className="text-[10px] text-slate-400">{mod.itemsCount} item(ns)</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {topProducts.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-3.5 space-y-2 bg-white dark:bg-[#202c33]/40">
                      <p className="text-[11px] font-black uppercase text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5">
                        <ShoppingBag size={12} className="text-emerald-500" /> Top Produtos do Dia
                      </p>
                      <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                        {topProducts.slice(0, 8).map((prod, i) => (
                          <div key={i} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                            <span className="truncate font-semibold text-slate-800 dark:text-[#e9edef]">{prod.qty}x {prod.name}</span>
                            <strong className="tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">{formatCents(prod.totalCents)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {byWaiter.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-3.5 space-y-2 bg-white dark:bg-[#202c33]/40">
                      <p className="text-[11px] font-black uppercase text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5">
                        <AlertTriangle size={12} className="text-amber-500" /> Atendimento por Garçom
                      </p>
                      <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                        {byWaiter.slice(0, 8).map((w, i) => (
                          <div key={i} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                            <span className="truncate font-semibold text-slate-800 dark:text-[#e9edef]">
                              {w.name}{' '}
                              <span className="text-[10px] text-slate-400">
                                ({w.itemsCount} itens{w.feeRemovalsCount > 0 ? ` • ${w.feeRemovalsCount} s/ taxa` : ''})
                              </span>
                            </span>
                            <strong className="tabular-nums text-slate-900 dark:text-white shrink-0">{formatCents(w.totalCents)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
