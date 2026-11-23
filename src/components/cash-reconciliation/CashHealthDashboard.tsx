import React, { useState } from 'react';
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
  ChevronRight
} from 'lucide-react';

import {
  CashMirrorRow,
  CashReconciliationResult,
  formatCents
} from '../../types/cashReconciliation';
import { formatDateBr, formatDateBrShort } from '../../utils/cashReconciliationServiceHelper.mjs';
import { CashSessionRow } from '../../services/cashReconciliationService';
import { CashMetricDetailModal, HealthMetricKey } from './CashMetricDetailModal';

interface HistoricalStatsData {
  totalSessions: number;
  balancedCount: number;
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
  }>;
}

interface CashHealthHistoryCardProps {
  historicalStats: HistoricalStatsData;
  sessions?: CashSessionRow[];
  onSelectSession?: (sessionId: string) => void;
}

export function CashHealthHistoryCard({
  historicalStats,
  sessions = [],
  onSelectSession
}: CashHealthHistoryCardProps) {
  if (historicalStats.totalSessions <= 0) return null;

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
        {historicalStats.series.slice(-14).map((pt) => {
          const barColor =
            pt.status === 'balanced'
              ? 'bg-emerald-500'
              : pt.status === 'attention'
                ? 'bg-amber-500'
                : pt.status === 'shortage'
                  ? 'bg-rose-500'
                  : 'bg-indigo-500';
          const shortDate = formatDateBrShort(pt.referenceDate);
          const fullDate = formatDateBr(pt.referenceDate);
          return (
            <button
              key={pt.id}
              type="button"
              onClick={() => onSelectSession?.(pt.id)}
              title={`${fullDate} • Saúde ${pt.healthScore}% • Dif ${formatCents(pt.diffCents)}`}
              className="flex flex-col items-center gap-1 min-w-[48px] group cursor-pointer active:scale-95 transition-transform"
            >
              <span className="text-[10px] font-bold text-slate-500 dark:text-[#8696a0] group-hover:text-[#00a884] tabular-nums">
                {pt.healthScore}%
              </span>
              <div className="w-7 h-16 rounded-lg bg-slate-100 dark:bg-[#111b21] flex items-end overflow-hidden p-0.5">
                <div
                  className={`w-full rounded-md ${barColor} transition-all group-hover:opacity-80`}
                  style={{ height: `${Math.max(12, Math.min(100, pt.healthScore))}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-500 dark:text-[#8696a0] whitespace-nowrap">
                {shortDate}
              </span>
            </button>
          );
        })}
      </div>

      {sessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {sessions.slice(0, 6).map((s) => {
            const diff = Number(s.diff_cents || 0);
            const signedDiff = `${diff > 0 ? '+' : diff < 0 ? '-' : ''}${formatCents(Math.abs(diff))}`;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSession?.(s.id)}
                className="text-left rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-slate-50/75 dark:bg-[#111b21]/80 hover:border-[#00a884]/60 p-3.5 space-y-2 transition-all cursor-pointer active:scale-[0.99] min-w-0 overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-900 dark:text-white whitespace-nowrap">
                    {formatDateBr(s.reference_date)}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00a884]/15 text-[#00a884] whitespace-nowrap shrink-0">
                    Saúde {s.health_score}%{!s.closed_at ? ' • Rascunho' : ''}
                  </span>
                </div>
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
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface CashHealthDashboardProps {
  result: CashReconciliationResult;
  historicalStats: HistoricalStatsData;
  onSelectSession?: (sessionId: string) => void;
  onOpenMirrorCategory?: (mirrorKey: string) => void;
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

export function CashHealthDashboard({ result, historicalStats, onSelectSession, onOpenMirrorCategory }: CashHealthDashboardProps) {
  const [activeMetricKey, setActiveMetricKey] = useState<HealthMetricKey | null>(null);
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
  const drawer = result.cashDrawerSummary || {};
  const metrics = result.financialMetrics || {};
  const diffCents = Number(result.diffTotalCents || 0);
  const formattedDiff = `${diffCents > 0 ? '+' : diffCents < 0 ? '-' : ''}${formatCents(Math.abs(diffCents))}`;

  return (
    <div className="space-y-4">
      {/* Hero de Saúde do Controle */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-xl p-4 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.28)]">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div className="space-y-3 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-black tracking-wide ${statusMeta.badgeClass}`}>
                {statusMeta.icon}
                {statusMeta.label}
              </span>
              {result.storeName && (
                <span className="text-xs font-bold text-slate-600 dark:text-[#aebac1] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#111b21]">
                  {result.storeName}
                </span>
              )}
              <span className="text-xs font-mono text-slate-500 dark:text-[#8696a0] whitespace-nowrap">
                Ref: {formatDateBr(result.referenceDate)}{result.operatorName ? ` • Op: ${result.operatorName}` : ''}
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
              <div className="min-w-0 overflow-hidden rounded-2xl bg-slate-50 dark:bg-[#111b21]/80 border border-slate-200/70 dark:border-[#2a3942] px-3.5 sm:px-4 py-3">
                <p className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#8696a0] truncate">
                  Diferença Geral
                </p>
                <p className={`text-lg sm:text-xl xl:text-[22px] font-black mt-0.5 tabular-nums whitespace-nowrap truncate ${
                  Math.abs(diffCents) <= 100
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : diffCents < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-indigo-600 dark:text-indigo-400'
                }`}>
                  {formattedDiff}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-[#aebac1] pt-1">
              <span><strong>{result.matchedPairs?.length || 0}</strong> transações batidas</span>
              <span>•</span>
              <span className={result.suggestions?.length ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}>
                <strong>{result.suggestions?.length || 0}</strong> sugestões de vínculo
              </span>
              <span>•</span>
              <span className={result.missingInBank?.length ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}>
                <strong>{result.missingInBank?.length || 0}</strong> faltam no banco
              </span>
              <span>•</span>
              <span className={result.extraInBank?.length ? 'text-indigo-600 dark:text-indigo-400 font-bold' : ''}>
                <strong>{result.extraInBank?.length || 0}</strong> sobram no banco
              </span>
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

          {/* Termômetro Score de Saúde */}
          <div className="xl:w-64 2xl:w-72 shrink-0 rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-gradient-to-br from-slate-50 to-white dark:from-[#111b21] dark:to-[#18242b] p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#8696a0] flex items-center gap-1.5">
                <Activity size={13} className="text-[#00a884]" />
                Saúde do Caixa
              </span>
              <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                {result.healthScore}%
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-[#2a3942] overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${statusMeta.barClass} transition-all duration-500`}
                style={{ width: `${Math.max(4, Math.min(100, result.healthScore || 0))}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-[#8696a0] leading-snug">
              {drawer.countedCents === null
                ? 'Informe o Dinheiro Contado na gaveta na aba Espelho para finalizar o fechamento.'
                : Math.abs(diffCents) <= 100 && !result.suggestions?.length
                  ? 'Conferência conciliada dentro da tolerância.'
                  : 'Revise as sugestões e itens pendentes nas abas abaixo.'}
            </p>
          </div>
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
              title: 'Clique para detalhar taxas MDR por maquininha',
              label: 'Taxas Cartão',
              icon: <Percent size={11} className="shrink-0" />,
              value: formatCents(metrics.totalMdrFeeCents),
              valueClass: 'text-rose-600 dark:text-rose-400'
            },
            {
              key: 'net_digital' as HealthMetricKey,
              title: 'Clique para detalhar valor líquido digital por canal',
              label: 'Líquido Digital',
              icon: <Receipt size={11} className="shrink-0" />,
              value: formatCents(metrics.totalNetDigitalCents),
              valueClass: 'text-emerald-600 dark:text-emerald-400'
            },
            {
              key: 'cancelled' as HealthMetricKey,
              title: 'Clique para listar os itens cancelados',
              label: `Cancelados (${metrics.cancelledCount || 0})`,
              icon: <Ban size={11} className="shrink-0" />,
              value: formatCents(metrics.cancelledCents),
              valueClass: 'text-slate-800 dark:text-[#e9edef]'
            },
            {
              key: 'discounts' as HealthMetricKey,
              title: 'Clique para ver descontos e consumo interno',
              label: 'Descontos',
              icon: <Coffee size={11} className="shrink-0" />,
              value: formatCents(metrics.discountsCents),
              valueClass: 'text-slate-800 dark:text-[#e9edef]'
            },
            {
              key: 'delivery_house_fees' as HealthMetricKey,
              title: 'Clique para separar taxa de entrega e taxa da casa',
              label: 'Taxa Entrega + Casa',
              icon: null,
              value: formatCents((metrics.deliveryFeeCents || 0) + (metrics.serviceFeeCents || 0)),
              valueClass: 'text-slate-800 dark:text-[#e9edef]'
            },
            {
              key: 'guests' as HealthMetricKey,
              title: 'Clique para ver resumo de público e ticket médio',
              label: `Pessoas (${metrics.guestCount || 0})`,
              icon: <Users size={11} className="shrink-0" />,
              value: `${formatCents(metrics.averageTicketCents)}/p`,
              valueClass: 'text-slate-800 dark:text-[#e9edef]'
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

      {/* Histórico Multi-Dias de Saúde */}
      <CashHealthHistoryCard historicalStats={historicalStats} onSelectSession={onSelectSession} />
    </div>
  );
}
