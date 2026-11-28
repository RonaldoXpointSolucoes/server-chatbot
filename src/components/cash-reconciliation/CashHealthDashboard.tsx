import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  QrCode,
  CreditCard,
  Banknote,
  Clock,
  Receipt,
  Ban,
  Coffee,
  Percent,
  Users,
  Activity,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Trash2,
  User,
  Calendar,
  Zap
} from 'lucide-react';

import {
  CashMirrorRow,
  CashReconciliationResult,
  formatCents
} from '../../types/cashReconciliation';
import {
  buildAcquirerFeeComparison,
  buildMirrorRowDetails,
  formatDateBr,
  formatDateBrShort,
  formatDateHeaderBadge,
  parseForcedCashMetaFromSession
} from '../../utils/cashReconciliationServiceHelper.mjs';
import {
  resolveAuditWarningsExpandState,
  resolveNextAuditWarningsUserOverride
} from '../../utils/cashReportCompleteness.mjs';
import { CashSessionRow } from '../../services/cashReconciliationService';
import { CashMetricDetailModal, HealthMetricKey } from './CashMetricDetailModal';
import { GeneralDiffTabKey } from './CashGeneralDiffModal';

export interface HistoricalStatsData {
  totalSessions: number;
  balancedCount: number;
  forcedBalancedCount?: number;
  balancedRatePct: number;
  avgHealthScore: number;
  totalShortageCents: number;
  totalSurplusCents: number;
  series: Array<{
    id: string;
    referenceDate: string;
    status: string;
    healthScore: number;
    systemTotalCents: number;
    realTotalCents: number;
    diffCents: number;
    shiftLabel?: string;
    operatorName?: string | null;
    createdAt?: string;
    isDraft?: boolean;
    isForcedBalanced?: boolean;
    forcedReason?: string;
    rawScoreBeforeForce?: number | null;
  }>;
}

function formatCreatedTimeHm(rawTimestamp?: string | null): string {
  if (!rawTimestamp) return '';
  const str = String(rawTimestamp).trim();
  if (!str) return '';
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
  }
  const match = str.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : '';
}

function getCompactOperatorTag(operatorName?: string | null, shiftLabel?: string): string {
  const op = String(operatorName || '').trim();
  if (op) return op.split(/\s+/)[0].slice(0, 10);
  const shift = String(shiftLabel || '').trim();
  if (shift && shift.toLowerCase() !== 'diário') return shift.slice(0, 10);
  return '';
}

interface CashHealthHistoryCardProps {
  historicalStats: HistoricalStatsData;
  sessions?: CashSessionRow[];
  onSelectSession?: (sessionId: string) => void;
  onDeleteSession?: (session: CashSessionRow) => void;
}

export function CashHealthHistoryCard({
  historicalStats,
  sessions = [],
  onSelectSession,
  onDeleteSession
}: CashHealthHistoryCardProps) {
  if (historicalStats.totalSessions <= 0) return null;

  const visibleSeries = historicalStats.series.slice(-14);
  const seriesDateCounts = new Map<string, number>();
  for (const pt of visibleSeries) {
    seriesDateCounts.set(pt.referenceDate, (seriesDateCounts.get(pt.referenceDate) || 0) + 1);
  }

  const sessionDateCounts = new Map<string, number>();
  for (const s of sessions) {
    sessionDateCounts.set(s.reference_date, (sessionDateCounts.get(s.reference_date) || 0) + 1);
  }

  return (
    <div className="rounded-3xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-xl p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1]">
            Evolução Histórica da Saúde do Controle ({historicalStats.totalSessions} fechamentos)
          </h3>
          <p className="text-xs text-slate-500 dark:text-[#8696a0] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              Taxa de batimento:{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">{historicalStats.balancedRatePct}%</strong>
            </span>
            <span>•</span>
            <span>
              Saúde média: <strong>{historicalStats.avgHealthScore}%</strong>
            </span>
            <span>•</span>
            <span>
              Faltas acumuladas:{' '}
              <strong className="text-rose-500 tabular-nums whitespace-nowrap">{formatCents(historicalStats.totalShortageCents)}</strong>
            </span>
            <span>•</span>
            <span>
              Sobras:{' '}
              <strong className="text-indigo-500 tabular-nums whitespace-nowrap">{formatCents(historicalStats.totalSurplusCents)}</strong>
            </span>
          </p>
        </div>
      </div>

      <div className="flex items-end gap-2.5 overflow-x-auto pb-1">
        {visibleSeries.map((pt) => {
          const isForced = Boolean(pt.isForcedBalanced);
          const barColor = isForced
            ? 'bg-gradient-to-t from-amber-500 via-orange-500 to-fuchsia-500 animate-pulse'
            : pt.status === 'balanced'
              ? 'bg-emerald-500'
              : pt.status === 'attention'
                ? 'bg-amber-500'
                : pt.status === 'shortage'
                  ? 'bg-rose-500'
                  : pt.status === 'draft'
                    ? 'bg-slate-400 dark:bg-slate-500'
                    : 'bg-indigo-500';
          const shortDate = formatDateBrShort(pt.referenceDate);
          const fullDate = formatDateBr(pt.referenceDate);
          const timeHm = formatCreatedTimeHm(pt.createdAt);
          const hasSameDaySiblings = (seriesDateCounts.get(pt.referenceDate) || 0) > 1;
          const compactTag = hasSameDaySiblings
            ? getCompactOperatorTag(pt.operatorName, pt.shiftLabel)
            : '';
          const tooltipParts = [
            fullDate + (timeHm ? ` às ${timeHm}` : ''),
            pt.operatorName ? `Op: ${pt.operatorName}` : '',
            pt.shiftLabel ? `Turno: ${pt.shiftLabel}` : '',
            pt.isDraft ? 'Rascunho' : 'Fechado',
            isForced
              ? `FORÇADO A 100%${pt.rawScoreBeforeForce !== null && pt.rawScoreBeforeForce !== undefined ? ` (Técnica ${pt.rawScoreBeforeForce}%)` : ''}`
              : `Saúde ${pt.healthScore}%`,
            `Dif ${pt.diffCents > 0 ? '+' : pt.diffCents < 0 ? '-' : ''}${formatCents(Math.abs(pt.diffCents))}`
          ].filter(Boolean);

          return (
            <button
              key={pt.id}
              type="button"
              onClick={() => onSelectSession?.(pt.id)}
              title={tooltipParts.join(' • ')}
              className="flex flex-col items-center gap-1 min-w-[52px] group cursor-pointer active:scale-95 transition-transform"
            >
              <span
                className={`text-[10px] font-bold tabular-nums inline-flex items-center gap-0.5 ${
                  isForced
                    ? 'text-amber-600 dark:text-amber-300 animate-pulse font-black'
                    : 'text-slate-500 dark:text-[#8696a0] group-hover:text-[#00a884]'
                }`}
              >
                {pt.healthScore}%{isForced ? '⚡' : ''}
              </span>
              <div
                className={`relative w-7 h-16 rounded-lg bg-slate-100 dark:bg-[#111b21] flex items-end overflow-hidden p-0.5 ${
                  isForced
                    ? 'ring-2 ring-amber-500/80'
                    : pt.isDraft
                      ? 'ring-1 ring-amber-400/60'
                      : ''
                }`}
              >
                <div
                  className={`w-full rounded-md ${barColor} transition-all group-hover:opacity-80`}
                  style={{ height: `${Math.max(12, Math.min(100, pt.healthScore))}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-500 dark:text-[#8696a0] whitespace-nowrap">
                {shortDate}
              </span>
              {(hasSameDaySiblings || timeHm) && (
                <span
                  className={`text-[9px] font-mono leading-none whitespace-nowrap max-w-[56px] truncate ${
                    hasSameDaySiblings
                      ? 'font-bold text-[#008f6f] dark:text-[#00a884]'
                      : 'text-slate-400 dark:text-[#8696a0]'
                  }`}
                >
                  {timeHm || compactTag || (pt.isDraft ? 'Rasc.' : '')}
                </span>
              )}
              {hasSameDaySiblings && compactTag && timeHm && (
                <span className="text-[8.5px] font-semibold text-slate-500 dark:text-[#aebac1] leading-none max-w-[56px] truncate">
                  {compactTag}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {sessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {sessions.slice(0, 6).map((s) => {
            const diff = Number(s.diff_cents || 0);
            const signedDiff = `${diff > 0 ? '+' : diff < 0 ? '-' : ''}${formatCents(Math.abs(diff))}`;
            const timeHm = formatCreatedTimeHm(s.created_at);
            const isSameDayDuplicate = (sessionDateCounts.get(s.reference_date) || 0) > 1;
            const isDraft = !s.closed_at || s.status === 'draft';
            const operatorLabel = s.operator_name?.trim() || '';
            const shiftLabel = s.shift_label?.trim() || '';

            const isForced = parseForcedCashMetaFromSession(s).isForced;

            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectSession?.(s.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectSession?.(s.id);
                  }
                }}
                className={`text-left rounded-2xl border p-3.5 space-y-2 transition-all cursor-pointer active:scale-[0.99] min-w-0 overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#00a884]/50 ${
                  isForced
                    ? 'border-amber-500/60 bg-amber-500/[0.06] hover:border-amber-500'
                    : 'border-slate-200/80 dark:border-[#2a3942] bg-slate-50/75 dark:bg-[#111b21]/80 hover:border-[#00a884]/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-black text-slate-900 dark:text-white whitespace-nowrap">
                      {formatDateBr(s.reference_date)}
                    </span>
                    {timeHm && (
                      <span
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold whitespace-nowrap ${
                          isSameDayDuplicate
                            ? 'bg-[#00a884]/15 text-[#008f6f] dark:text-[#00a884]'
                            : 'bg-slate-200/70 dark:bg-[#202c33] text-slate-600 dark:text-[#aebac1]'
                        }`}
                      >
                        <Clock size={10} />
                        {timeHm}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isForced ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 border border-amber-500/60 text-amber-700 dark:text-amber-300 whitespace-nowrap inline-flex items-center gap-1 animate-pulse">
                        <Zap size={10} /> 100% Forçado{isDraft ? ' • Rasc.' : ''}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00a884]/15 text-[#00a884] whitespace-nowrap">
                        Saúde {s.health_score}%{isDraft ? ' • Rascunho' : ''}
                      </span>
                    )}
                    {onDeleteSession && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(s);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                        aria-label={`Excluir fechamento de ${formatDateBr(s.reference_date)}${timeHm ? ` às ${timeHm}` : ''}`}
                        title="Excluir fechamento"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 active:scale-95 transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {(operatorLabel || shiftLabel) && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-600 dark:text-[#aebac1] min-w-0">
                    {operatorLabel && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/90 dark:bg-[#202c33] border border-slate-200/80 dark:border-[#2a3942] font-semibold truncate max-w-[160px]">
                        <User size={10} className="text-slate-400 shrink-0" />
                        <span className="truncate">{operatorLabel}</span>
                      </span>
                    )}
                    {shiftLabel && (
                      <span className="px-2 py-0.5 rounded-md bg-white/90 dark:bg-[#202c33] border border-slate-200/80 dark:border-[#2a3942] font-semibold whitespace-nowrap">
                        Turno: {shiftLabel}
                      </span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-[11px] min-w-0">
                  <div className="min-w-0">
                    <p className="text-[9.5px] uppercase font-bold text-slate-400">Sistema</p>
                    <p className="font-bold text-slate-800 dark:text-[#e9edef] tabular-nums whitespace-nowrap truncate">
                      {formatCents(s.system_total_cents)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9.5px] uppercase font-bold text-slate-400">Real</p>
                    <p className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap truncate">
                      {formatCents(s.real_total_cents)}
                    </p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-[9.5px] uppercase font-bold text-slate-400">Diferença</p>
                    <p className={`font-black tabular-nums whitespace-nowrap truncate ${
                      Math.abs(diff) <= 100 ? 'text-emerald-500' : diff < 0 ? 'text-rose-500' : 'text-indigo-500'
                    }`}>
                      {signedDiff}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CashHealthDashboardProps {
  result: CashReconciliationResult;
  onOpenMirrorCategory?: (mirrorKey: string) => void;
  onOpenGeneralDiff?: (tab?: GeneralDiffTabKey) => void;
  onOpenHealthRoadmap?: () => void;
  onOpenChecklist?: () => void;
}

const STATUS_BADGE: Record<string, { label: string; badgeClass: string; barClass: string; icon: React.ReactNode }> = {
  balanced: {
    label: 'CAIXA BATEU',
    badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    barClass: 'from-emerald-500 to-teal-400',
    icon: <CheckCircle2 size={18} />
  },
  attention: {
    label: 'ATENÇÃO / PENDENTE DE VÍNCULO',
    badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    barClass: 'from-amber-500 to-orange-400',
    icon: <AlertTriangle size={18} />
  },
  shortage: {
    label: 'FALTA DETECTADA',
    badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
    barClass: 'from-rose-500 to-pink-500',
    icon: <TrendingDown size={18} />
  },
  surplus: {
    label: 'SOBRA DETECTADA',
    badgeClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
    barClass: 'from-indigo-500 to-cyan-400',
    icon: <TrendingUp size={18} />
  }
};

export function CashHealthDashboard({
  result,
  onOpenMirrorCategory,
  onOpenGeneralDiff,
  onOpenHealthRoadmap,
  onOpenChecklist
}: CashHealthDashboardProps) {
  const [activeMetricKey, setActiveMetricKey] = useState<HealthMetricKey | null>(null);
  const [validationExpandOverride, setValidationExpandOverride] = useState<boolean | null>(null);
  const prevCriticalSigRef = useRef<string>('');
  const statusMeta = STATUS_BADGE[result.status] || STATUS_BADGE.attention;
  const getMirror = (key: string): CashMirrorRow =>
    result.mirrorRows?.find((r) => r.key === key) || {
      key,
      label: key,
      systemCents: 0,
      realCents: 0,
      diffCents: 0,
      hasRealInput: false,
      isAuto: false,
      sourceNote: ''
    };

  const pixRow = getMirror('pix');
  const cardRow = getMirror('cartao');
  const pendRow = getMirror('pendentes');
  const pixBridge = useMemo(() => buildMirrorRowDetails(result, 'pix').reconciliationBridge, [result]);
  const cardBridge = useMemo(() => buildMirrorRowDetails(result, 'cartao').reconciliationBridge, [result]);
  const acquirerComparison = useMemo(
    () =>
      buildAcquirerFeeComparison(
        (result.realItems || []).filter((it) => it.category === 'cartao' || Number(it.feeCents || 0) > 0)
      ),
    [result.realItems]
  );
  const renderChannelBridgeNote = (bridge?: {
    extraCents: number;
    missingCents: number;
    crossCategoryNetCents: number;
  }) => {
    if (!bridge || (bridge.extraCents === 0 && bridge.missingCents === 0 && bridge.crossCategoryNetCents === 0)) {
      return null;
    }
    const cross = bridge.crossCategoryNetCents || 0;
    return (
      <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0] mt-1.5 truncate">
        Sobras <strong className="text-indigo-600 dark:text-indigo-400">{formatCents(bridge.extraCents)}</strong>
        {' • '}
        Faltas <strong className="text-rose-600 dark:text-rose-400">{formatCents(bridge.missingCents)}</strong>
        {cross !== 0 ? (
          <>
            {' • '}
            Trocas <strong className="text-emerald-600 dark:text-emerald-400">{cross > 0 ? '+' : '-'}{formatCents(Math.abs(cross))}</strong>
          </>
        ) : null}
      </p>
    );
  };
  const drawer = result.cashDrawerSummary || {};
  const metrics = result.financialMetrics || {};
  const periodDiag = result.periodDiagnostics;
  const validationWarnings = periodDiag?.validationWarnings || [];
  const hasMissingCardAcquirers = validationWarnings.some((w) => w.code === 'missing_card_acquirers');
  const hasRoutineOrFileIssue = validationWarnings.some((w) =>
    w.code === 'missing_routine_report' ||
    w.code === 'wrong_day_real_file' ||
    w.code === 'zero_value_date_file' ||
    w.code === 'summary_acquirer_file' ||
    w.code === 'missing_card_acquirers'
  );
  const criticalErrors = validationWarnings.filter((w) => w.severity === 'error');
  const hasCriticalValidationError = criticalErrors.length > 0;
  const hasWrongDayAlert = validationWarnings.some(
    (w) => w.code === 'wrong_day_real_file' || w.code === 'wrong_day_system_file'
  );
  const criticalSig = criticalErrors.map((w) => `${w.code}:${w.title}`).join('|');

  useEffect(() => {
    setValidationExpandOverride((prev) =>
      resolveNextAuditWarningsUserOverride(prevCriticalSigRef.current, criticalSig, prev)
    );
    prevCriticalSigRef.current = criticalSig;
  }, [criticalSig]);

  const isValidationExpanded = resolveAuditWarningsExpandState(hasCriticalValidationError, validationExpandOverride);
  const diffCents = Number(result.diffTotalCents || 0);
  const formattedDiff = `${diffCents > 0 ? '+' : diffCents < 0 ? '-' : ''}${formatCents(Math.abs(diffCents))}`;
  const cashDrawerRow = (result.mirrorRows || []).find((r) => r.key === 'saldo_dinheiro');
  const cashDrawerDiffCents = Number(cashDrawerRow?.diffCents || 0);
  const hasDigitalPending = (result.missingInBank?.length || 0) + (result.extraInBank?.length || 0) > 0;
  const formattedDrawerDiff = `${cashDrawerDiffCents > 0 ? '+' : cashDrawerDiffCents < 0 ? '-' : ''}${formatCents(Math.abs(cashDrawerDiffCents))}`;

  return (
    <div className="space-y-4">
      {validationWarnings.length > 0 && (
        <div
          className={`rounded-2xl border px-3.5 py-2.5 text-xs transition-all ${
            hasWrongDayAlert
              ? 'animate-cash-wrong-day-blink border-rose-500 bg-rose-500/15 text-rose-900 dark:text-rose-100'
              : hasCriticalValidationError
                ? 'border-rose-500/35 bg-rose-500/10 text-rose-800 dark:text-rose-200'
                : validationWarnings.some((w) => w.severity === 'warning')
                  ? 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                  : 'border-cyan-500/35 bg-cyan-500/10 text-cyan-900 dark:text-cyan-200'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
              <AlertTriangle size={15} className={`shrink-0 ${hasWrongDayAlert ? 'animate-cash-wrong-day-badge text-rose-500 dark:text-rose-300' : ''}`} />
              {hasWrongDayAlert && (
                <span className="animate-cash-wrong-day-badge px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider shrink-0">
                  Data errada
                </span>
              )}
              <span className="font-black">
                {validationWarnings.length} alerta(s) de auditoria:
              </span>
              <span className="truncate opacity-90">
                {validationWarnings.map((w) => w.title).join(' • ')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {hasRoutineOrFileIssue && onOpenChecklist && (
                <button
                  type="button"
                  onClick={onOpenChecklist}
                  className="px-2.5 py-1 rounded-lg bg-[#00a884]/15 hover:bg-[#00a884]/25 border border-[#00a884]/35 text-[#008f6f] dark:text-[#00a884] text-[11px] font-bold shrink-0 active:scale-95 transition-all"
                >
                  Rotina & Checklist
                </button>
              )}
              <button
                type="button"
                aria-expanded={isValidationExpanded}
                onClick={() => setValidationExpandOverride(!isValidationExpanded)}
                className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-[#111b21]/80 border border-current/20 text-[11px] font-bold flex items-center gap-1 shrink-0 active:scale-95 transition-all"
              >
                <span>{isValidationExpanded ? 'Ocultar Detalhes' : 'Ver Detalhes'}</span>
                {isValidationExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>

          {isValidationExpanded && (
            <div className="mt-2.5 pt-2.5 border-t border-current/15 space-y-2">
              {validationWarnings.map((warn, idx) => {
                const isWrongDayItem = warn.code === 'wrong_day_real_file' || warn.code === 'wrong_day_system_file';
                return (
                  <div
                    key={`${warn.code}_${idx}`}
                    className={`flex items-start gap-2 ${isWrongDayItem ? 'rounded-xl px-2 py-1.5 border border-rose-500/60 bg-rose-500/15' : ''}`}
                  >
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase shrink-0 ${
                        isWrongDayItem
                          ? 'animate-cash-wrong-day-badge bg-rose-600 text-white'
                          : 'bg-white/70 dark:bg-[#111b21]/70'
                      }`}
                    >
                      {isWrongDayItem ? 'Data Errada' : warn.severity === 'error' ? 'Erro' : warn.severity === 'warning' ? 'Atenção' : 'Info'}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold leading-tight">{warn.title}</p>
                      <p className="text-[11px] opacity-90 leading-snug mt-0.5">{warn.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Hero de Saúde do Controle */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-xl p-4 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.28)]">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div className="space-y-3 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-black tracking-wide ${statusMeta.badgeClass}`}>
                {statusMeta.icon}
                {statusMeta.label}
              </span>
              {result.isForcedBalanced && (
                <button
                  type="button"
                  onClick={() => onOpenHealthRoadmap?.()}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/70 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-fuchsia-500/20 text-amber-700 dark:text-amber-300 text-xs font-black tracking-wide animate-pulse hover:brightness-110 transition-all"
                  title="Este fechamento foi forçado para 100% mantendo a diferença real visível"
                >
                  <Zap size={13} />
                  100% FORÇADO • Real: {result.rawHealthScore ?? result.healthScore}%
                </button>
              )}
              {result.storeName && (
                <span className="text-xs font-bold text-slate-600 dark:text-[#aebac1] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#111b21]">
                  {result.storeName}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00a884]/15 border border-[#00a884]/40 text-xs font-black text-[#008f6f] dark:text-[#00e5a8] whitespace-nowrap shadow-xs">
                <Calendar size={13} />
                Caixa: {formatDateHeaderBadge(result.referenceDate, result.periodEnd || result.referenceDate)}
                {result.operatorName ? ` • Op: ${result.operatorName}` : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="min-w-0 overflow-hidden rounded-2xl bg-slate-50 dark:bg-[#111b21]/80 border border-slate-200/70 dark:border-[#2a3942] px-3.5 sm:px-4 py-3">
                <p className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#8696a0] truncate">
                  Total Sistema (PDV)
                </p>
                <p className="text-lg sm:text-xl xl:text-[22px] font-black text-slate-900 dark:text-white mt-0.5 tabular-nums whitespace-nowrap truncate">
                  {formatCents(result.systemTotalCents)}
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl bg-slate-50 dark:bg-[#111b21]/80 border border-slate-200/70 dark:border-[#2a3942] px-3.5 sm:px-4 py-3">
                <p className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#8696a0] truncate">
                  Total Real Apurado
                </p>
                <p className="text-lg sm:text-xl xl:text-[22px] font-black text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums whitespace-nowrap truncate">
                  {formatCents(result.realTotalCents)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenGeneralDiff?.(hasDigitalPending ? 'tabela' : 'canais')}
                className="min-w-0 overflow-hidden text-left group rounded-2xl bg-slate-50 dark:bg-[#111b21]/80 border border-slate-200/80 dark:border-[#2a3942] hover:border-[#00a884]/70 hover:bg-white dark:hover:bg-[#111b21] px-3.5 sm:px-4 py-3 cursor-pointer active:scale-[0.98] transition-all"
                title="Clique para abrir todos os valores que ainda não foram conciliados no banco, maquininha e gaveta"
              >
                <div className="flex items-center justify-between gap-1">
                  <p className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#8696a0] truncate">
                    Diferença Geral
                  </p>
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#00a884]/15 text-[#008f6f] dark:text-[#00a884] text-[9.5px] font-black shrink-0 group-hover:bg-[#00a884] group-hover:text-white transition-colors">
                    Clique aqui <ChevronRight size={10} />
                  </span>
                </div>
                <p className={`text-lg sm:text-xl xl:text-[22px] font-black mt-0.5 tabular-nums whitespace-nowrap truncate ${
                  Math.abs(diffCents) <= 100
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : diffCents < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-indigo-600 dark:text-indigo-400'
                }`}>
                  {formattedDiff}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-[#8696a0] truncate mt-0.5">
                  {hasDigitalPending
                    ? cashDrawerDiffCents !== 0
                      ? `${result.missingInBank?.length || 0} venda(s) PDV • Gaveta ${formattedDrawerDiff}`
                      : `${result.missingInBank?.length || 0} venda(s) PDV • ${result.extraInBank?.length || 0} receb. banco`
                    : cashDrawerDiffCents !== 0
                      ? `Gaveta ${formattedDrawerDiff} • Ver resumo por canal`
                      : 'Ver resumo por canal e conciliados'}
                </p>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600 dark:text-[#aebac1] pt-1">
              <button
                type="button"
                onClick={() => onOpenGeneralDiff?.('conciliados')}
                className="hover:text-[#00a884] hover:underline transition-colors"
                title="Ver todas as transações já conciliadas"
              >
                <strong>{result.matchedPairs?.length || 0}</strong> transações batidas
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => onOpenGeneralDiff?.('sugestoes')}
                className={`hover:underline transition-colors ${result.suggestions?.length ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}`}
                title="Abrir dicas automáticas de vínculo"
              >
                <strong>{result.suggestions?.length || 0}</strong> sugestões de vínculo
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => onOpenGeneralDiff?.('tabela')}
                className={`hover:underline transition-colors ${result.missingInBank?.length ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}`}
                title="A venda está no PDV. Falta localizar o recebimento no banco."
              >
                <strong>{result.missingInBank?.length || 0}</strong> vendas s/ recebimento (PDV)
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => onOpenGeneralDiff?.('tabela')}
                className={`hover:underline transition-colors ${result.extraInBank?.length ? 'text-indigo-600 dark:text-indigo-400 font-bold' : ''}`}
                title="O recebimento está no banco. Falta localizar a venda no PDV."
              >
                <strong>{result.extraInBank?.length || 0}</strong> recebimentos s/ venda (Banco)
              </button>
              {result.deduplicatedItems?.length > 0 && (
                <>
                  <span>•</span>
                  <span className="text-cyan-600 dark:text-cyan-400">
                    <strong>{result.deduplicatedItems.length}</strong> PIX C6 Pay deduplicados c/ OFX
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Termômetro Score de Saúde (Clicável p/ Guia 100% e Batimento Rápido) */}
          <button
            type="button"
            onClick={() => onOpenHealthRoadmap?.()}
            className={`xl:w-64 2xl:w-72 shrink-0 text-left group rounded-2xl border p-4 flex flex-col justify-between gap-2.5 cursor-pointer active:scale-[0.98] transition-all ${
              result.isForcedBalanced
                ? 'border-amber-500/70 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-fuchsia-500/10 hover:border-amber-500 shadow-[0_0_24px_rgba(245,158,11,0.18)]'
                : 'border-slate-200/80 dark:border-[#2a3942] bg-gradient-to-br from-slate-50 to-white dark:from-[#111b21] dark:to-[#18242b] hover:border-[#00a884]/70'
            }`}
            title="Clique para abrir o plano completo para chegar a 100%, bater pendências ou forçar fechamento"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#8696a0] flex items-center gap-1.5">
                {result.isForcedBalanced ? (
                  <Zap size={13} className="text-amber-500 animate-pulse" />
                ) : (
                  <Activity size={13} className="text-[#00a884]" />
                )}
                Saúde do Caixa
              </span>
              <div className="flex items-center gap-1.5">
                {result.isForcedBalanced ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/60 text-amber-700 dark:text-amber-300 text-[9.5px] font-black uppercase animate-pulse">
                    Forçado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#00a884]/15 text-[#008f6f] dark:text-[#00a884] text-[9.5px] font-black group-hover:bg-[#00a884] group-hover:text-white transition-colors">
                    Resolver <ChevronRight size={10} />
                  </span>
                )}
                <span
                  className={`text-2xl font-black tabular-nums whitespace-nowrap ${
                    result.isForcedBalanced ? 'text-amber-600 dark:text-amber-300' : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {result.healthScore}%
                </span>
              </div>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-[#2a3942] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  result.isForcedBalanced
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-fuchsia-500 animate-pulse'
                    : `bg-gradient-to-r ${statusMeta.barClass}`
                }`}
                style={{ width: `${Math.max(4, Math.min(100, result.healthScore || 0))}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-[#8696a0] leading-snug">
              {result.isForcedBalanced
                ? `Técnica real: ${result.rawHealthScore ?? result.healthScore}% • Diferença: ${formattedDiff}. Clique para revisar.`
                : hasMissingCardAcquirers
                  ? 'Importe Rede e C6 Pay para conciliar os cartões do PDV.'
                  : drawer.countedCents === null
                    ? 'Informe o Dinheiro Contado na gaveta na aba Espelho para finalizar o fechamento.'
                    : Math.abs(diffCents) <= 100 && !result.suggestions?.length && !result.missingInBank?.length && !result.extraInBank?.length
                      ? 'Conferência conciliada dentro da tolerância.'
                      : 'Clique aqui para ver exatamente o que falta resolver para 100%.'}
            </p>
          </button>
        </div>
      </div>

      {/* 4 Cards por Canal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-3">
        {/* PIX */}
        <button
          type="button"
          onClick={() => onOpenMirrorCategory?.('pix')}
          className="min-w-0 overflow-hidden text-left rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/85 dark:bg-[#202c33]/85 hover:border-[#00a884]/50 backdrop-blur-md p-4 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5 min-w-0 truncate">
              <QrCode size={15} className="text-cyan-500 shrink-0" />
              <span className="truncate">PIX (OFX + Maquininhas)</span>
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${
              pixRow.diffCents === 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {pixRow.diffCents > 0 ? '+' : pixRow.diffCents < 0 ? '-' : ''}{formatCents(Math.abs(pixRow.diffCents))}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-slate-400 truncate">Real Confirmado</p>
              <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums whitespace-nowrap">{formatCents(pixRow.realCents)}</p>
            </div>
            <div className="text-right min-w-0">
              <p className="text-[10px] uppercase font-bold text-slate-400 truncate">Sistema</p>
              <p className="text-xs sm:text-sm font-bold text-slate-600 dark:text-[#aebac1] tabular-nums whitespace-nowrap">{formatCents(pixRow.systemCents)}</p>
            </div>
          </div>
          {renderChannelBridgeNote(pixBridge)}
          {metrics.pixBreakdown && (metrics.pixBreakdown.ofxCents > 0 || metrics.pixBreakdown.redePixCents > 0 || metrics.pixBreakdown.c6PayPostCutoffCents > 0) && (
            <p className="text-[10px] text-slate-500 dark:text-[#8696a0] mt-1 truncate">
              {metrics.pixBreakdown.ofxByBank?.length
                ? metrics.pixBreakdown.ofxByBank.map((b) => `${b.bankLabel} ${formatCents(b.amountCents)}`).join(' • ')
                : `OFX ${formatCents(metrics.pixBreakdown.ofxCents)}`}
              {metrics.pixBreakdown.redePixCents > 0 ? ` • Rede PIX ${formatCents(metrics.pixBreakdown.redePixCents)}` : ''}
              {metrics.pixBreakdown.c6PayPostCutoffCents > 0 ? ` • C6 Pós ${formatCents(metrics.pixBreakdown.c6PayPostCutoffCents)}` : ''}
            </p>
          )}
        </button>

        {/* Cartões */}
        <button
          type="button"
          onClick={() => onOpenMirrorCategory?.('cartao')}
          className="min-w-0 overflow-hidden text-left rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/85 dark:bg-[#202c33]/85 hover:border-[#00a884]/50 backdrop-blur-md p-4 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5 min-w-0 truncate">
              <CreditCard size={15} className="text-indigo-500 shrink-0" />
              <span className="truncate">Cartões (Rede + C6 Pay)</span>
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${
              cardRow.diffCents === 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {cardRow.diffCents > 0 ? '+' : cardRow.diffCents < 0 ? '-' : ''}{formatCents(Math.abs(cardRow.diffCents))}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-slate-400 truncate">Real Bruto</p>
              <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums whitespace-nowrap">{formatCents(cardRow.realCents)}</p>
            </div>
            <div className="text-right min-w-0">
              <p className="text-[10px] uppercase font-bold text-slate-400 truncate">Sistema</p>
              <p className="text-xs sm:text-sm font-bold text-slate-600 dark:text-[#aebac1] tabular-nums whitespace-nowrap">{formatCents(cardRow.systemCents)}</p>
            </div>
          </div>
          {hasMissingCardAcquirers ? (
            <p className="text-[10.5px] font-semibold text-amber-600 dark:text-amber-400 mt-1.5 truncate">
              Aguardando upload Rede / C6 Pay
            </p>
          ) : (
            <>
              {renderChannelBridgeNote(cardBridge)}
              {metrics.cardBreakdown && (metrics.cardBreakdown.redeCardCents > 0 || metrics.cardBreakdown.c6PayCardCents > 0) && (
                <p className="text-[10px] text-slate-500 dark:text-[#8696a0] mt-1 truncate">
                  {acquirerComparison.hasMultipleSources && acquirerComparison.sources.length >= 2
                    ? acquirerComparison.sources
                        .map((s: { label: string; grossCents: number; effectiveRatePct: number }) =>
                          `${s.label} ${formatCents(s.grossCents)} (${s.effectiveRatePct.toFixed(2).replace('.', ',')}%)`
                        )
                        .join(' • ')
                    : `Rede ${formatCents(metrics.cardBreakdown.redeCardCents)} • C6 Pay ${formatCents(metrics.cardBreakdown.c6PayCardCents)}`}
                </p>
              )}
              {acquirerComparison.hasMultipleSources && acquirerComparison.headlineSavingsCents > 0 && (
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                  Dif. {acquirerComparison.rateSpreadPctPoints.toFixed(2).replace('.', ',')} p.p. • Economia possível:{' '}
                  +{formatCents(acquirerComparison.headlineSavingsCents)}
                </p>
              )}
            </>
          )}
        </button>

        {/* Dinheiro */}
        <button
          type="button"
          onClick={() => onOpenMirrorCategory?.('saldo_dinheiro')}
          className="min-w-0 overflow-hidden text-left rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/85 dark:bg-[#202c33]/85 hover:border-[#00a884]/50 backdrop-blur-md p-4 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5 min-w-0 truncate">
              <Banknote size={15} className="text-emerald-500 shrink-0" />
              <span className="truncate">Dinheiro em Gaveta</span>
            </span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-[#8696a0] shrink-0 whitespace-nowrap">
              Sangria: {formatCents(drawer.sangriaCents)}
              {(drawer.sangriaIntermediariaCents || 0) > 0 ? ` (+${formatCents(drawer.sangriaIntermediariaCents)} turno)` : ''}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-slate-400 truncate">Esperado Pós-Sangria</p>
              <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums whitespace-nowrap">{formatCents(drawer.expectedAfterSangriaCents)}</p>
            </div>
            <div className="text-right min-w-0">
              <p className="text-[10px] uppercase font-bold text-slate-400 truncate">Contado</p>
              <p className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                {drawer.countedCents !== null && drawer.countedCents !== undefined ? formatCents(drawer.countedCents) : 'A informar'}
              </p>
            </div>
          </div>
          {(drawer.outrasSaidasCents || 0) > 0 && (
            <p className="text-[10px] text-rose-500 dark:text-rose-400 mt-1 truncate">
              Outras saídas descontadas: -{formatCents(drawer.outrasSaidasCents)}
            </p>
          )}
          {(drawer.swappedToDigitalCents || 0) > 0 && (
            <p className="text-[10.5px] text-amber-600 dark:text-amber-400 mt-1.5">
              Ajustado c/ trocas p/ digital ({formatCents(drawer.swappedToDigitalCents)}): esperado físico{' '}
              <strong>{formatCents(drawer.adjustedCashExpectedCents)}</strong>
            </p>
          )}
        </button>

        {/* Pendentes & Auditoria */}
        <button
          type="button"
          onClick={() => onOpenMirrorCategory?.('pendentes')}
          className="min-w-0 overflow-hidden text-left rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/85 dark:bg-[#202c33]/85 hover:border-[#00a884]/50 backdrop-blur-md p-4 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5 min-w-0 truncate">
              <Clock size={15} className="text-amber-500 shrink-0" />
              <span className="truncate">Pendentes & Consumo</span>
            </span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-[#8696a0] shrink-0 whitespace-nowrap">
              {metrics.pendingDebtors?.length || 0} devedor(es)
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-slate-400 truncate">Notas Pendentes</p>
              <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums whitespace-nowrap">{formatCents(pendRow.systemCents)}</p>
            </div>
            <div className="text-right min-w-0">
              <p className="text-[10px] uppercase font-bold text-slate-400 truncate">Consumo Interno</p>
              <p className="text-xs sm:text-sm font-bold text-slate-600 dark:text-[#aebac1] tabular-nums whitespace-nowrap">{formatCents(metrics.internalConsumptionCents)}</p>
            </div>
          </div>
        </button>
      </div>

      {/* Faixa de Custos, Taxas e Risco Operacional (todos clicáveis) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {(
          [
            {
              key: 'fees' as HealthMetricKey,
              title: 'Clique para detalhar taxas MDR por maquininha e economia possível',
              label: 'Taxas Cartão',
              icon: <Percent size={11} className="shrink-0" />,
              value: formatCents(metrics.totalMdrFeeCents),
              valueClass: 'text-rose-600 dark:text-rose-400',
              subNote:
                acquirerComparison.hasMultipleSources && acquirerComparison.headlineSavingsCents > 0
                  ? `Econ. +${formatCents(acquirerComparison.headlineSavingsCents)} (${acquirerComparison.cheapestSource?.label || ''})`
                  : acquirerComparison.hasMultipleSources && acquirerComparison.rateSpreadPctPoints > 0
                    ? `Dif. ${acquirerComparison.rateSpreadPctPoints.toFixed(2).replace('.', ',')} p.p.`
                    : ''
            },
            {
              key: 'net_digital' as HealthMetricKey,
              title: 'Clique para detalhar valor líquido digital por canal',
              label: 'Líquido Digital',
              icon: <Receipt size={11} className="shrink-0" />,
              value: formatCents(metrics.totalNetDigitalCents),
              valueClass: 'text-emerald-600 dark:text-emerald-400',
              subNote: ''
            },
            {
              key: 'cancelled' as HealthMetricKey,
              title: 'Clique para listar os itens cancelados',
              label: `Cancelados (${metrics.cancelledCount || 0})`,
              icon: <Ban size={11} className="shrink-0" />,
              value: formatCents(metrics.cancelledCents),
              valueClass: 'text-slate-800 dark:text-[#e9edef]',
              subNote: ''
            },
            {
              key: 'discounts' as HealthMetricKey,
              title: 'Clique para ver descontos e consumo interno',
              label: 'Descontos',
              icon: <Coffee size={11} className="shrink-0" />,
              value: formatCents(metrics.discountsCents),
              valueClass: 'text-slate-800 dark:text-[#e9edef]',
              subNote: ''
            },
            {
              key: 'delivery_house_fees' as HealthMetricKey,
              title: 'Clique para separar taxa de entrega e taxa da casa',
              label: 'Taxa Entrega + Casa',
              icon: null,
              value: formatCents((metrics.deliveryFeeCents || 0) + (metrics.serviceFeeCents || 0)),
              valueClass: 'text-slate-800 dark:text-[#e9edef]',
              subNote: ''
            },
            {
              key: 'guests' as HealthMetricKey,
              title: 'Clique para ver resumo de público e ticket médio',
              label: `Pessoas (${metrics.guestCount || 0})`,
              icon: <Users size={11} className="shrink-0" />,
              value: `${formatCents(metrics.averageTicketCents)}/p`,
              valueClass: 'text-slate-800 dark:text-[#e9edef]',
              subNote: ''
            }
          ] as const
        ).map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setActiveMetricKey(card.key)}
            className="min-w-0 overflow-hidden text-left group rounded-xl border border-slate-200/70 dark:border-[#2a3942] bg-white/75 dark:bg-[#202c33]/75 hover:border-[#00a884]/60 px-3 py-2.5 transition-all cursor-pointer active:scale-[0.98]"
            title={card.title}
          >
            <div className="flex items-center justify-between gap-1 text-[10px] uppercase font-bold text-slate-400">
              <span className="flex items-center gap-1 min-w-0 truncate">
                {card.icon}
                <span className="truncate">{card.label}</span>
              </span>
              <ChevronRight size={11} className="shrink-0 opacity-50 group-hover:opacity-100 group-hover:text-[#00a884]" />
            </div>
            <p className={`text-sm font-black mt-0.5 tabular-nums whitespace-nowrap truncate ${card.valueClass}`}>
              {card.value}
            </p>
            {card.subNote && (
              <p className="text-[9.5px] font-bold text-emerald-600 dark:text-emerald-400 truncate mt-0.5 tabular-nums">
                {card.subNote}
              </p>
            )}
          </button>
        ))}
      </div>

      {activeMetricKey && (
        <CashMetricDetailModal
          metricKey={activeMetricKey}
          result={result}
          onClose={() => setActiveMetricKey(null)}
        />
      )}
    </div>
  );
}
