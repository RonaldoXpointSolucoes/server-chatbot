import React from 'react';
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
  Activity
} from 'lucide-react';

import {
  CashMirrorRow,
  CashReconciliationResult,
  formatCents
} from '../../types/cashReconciliation';

interface CashHealthDashboardProps {
  result: CashReconciliationResult;
  historicalStats: {
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
  };
  onSelectSession?: (sessionId: string) => void;
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

export function CashHealthDashboard({ result, historicalStats, onSelectSession }: CashHealthDashboardProps) {
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

  return (
    <div className="space-y-4">
      {/* Hero de Saúde do Controle */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-xl p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.28)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-black tracking-wide ${statusMeta.badgeClass}`}>
                {statusMeta.icon}
                {statusMeta.label}
              </span>
              {result.storeName && (
                <span className="text-xs font-bold text-slate-600 dark:text-[#aebac1] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#111b21]">
                  {result.storeName}
                </span>
              )}
              <span className="text-xs font-mono text-slate-500 dark:text-[#8696a0]">
                Ref: {result.referenceDate}{result.operatorName ? ` • Op: ${result.operatorName}` : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="rounded-2xl bg-slate-50 dark:bg-[#111b21]/80 border border-slate-200/70 dark:border-[#2a3942] px-4 py-3">
                <p className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#8696a0]">
                  Total Sistema (PDV)
                </p>
                <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
                  {formatCents(result.systemTotalCents)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-[#111b21]/80 border border-slate-200/70 dark:border-[#2a3942] px-4 py-3">
                <p className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#8696a0]">
                  Total Real Apurado
                </p>
                <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                  {formatCents(result.realTotalCents)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-[#111b21]/80 border border-slate-200/70 dark:border-[#2a3942] px-4 py-3">
                <p className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#8696a0]">
                  Diferença Geral
                </p>
                <p className={`text-xl sm:text-2xl font-black mt-0.5 tabular-nums ${
                  Math.abs(diffCents) <= 100
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : diffCents < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-indigo-600 dark:text-indigo-400'
                }`}>
                  {diffCents > 0 ? '+' : ''}{formatCents(diffCents)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-[#aebac1] pt-1">
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
          <div className="lg:w-64 shrink-0 rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-gradient-to-br from-slate-50 to-white dark:from-[#111b21] dark:to-[#18242b] p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#8696a0] flex items-center gap-1.5">
                <Activity size={13} className="text-[#00a884]" />
                Saúde do Caixa
              </span>
              <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* PIX */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/85 dark:bg-[#202c33]/85 backdrop-blur-md p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5">
              <QrCode size={15} className="text-cyan-500" />
              PIX (OFX + Maquininhas)
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              pixRow.diffCents === 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {pixRow.diffCents > 0 ? '+' : ''}{formatCents(pixRow.diffCents)}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Real Confirmado</p>
              <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums">{formatCents(pixRow.realCents)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400">Sistema</p>
              <p className="text-sm font-bold text-slate-600 dark:text-[#aebac1] tabular-nums">{formatCents(pixRow.systemCents)}</p>
            </div>
          </div>
        </div>

        {/* Cartões */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/85 dark:bg-[#202c33]/85 backdrop-blur-md p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5">
              <CreditCard size={15} className="text-indigo-500" />
              Cartões (Rede + C6 Pay)
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              cardRow.diffCents === 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {cardRow.diffCents > 0 ? '+' : ''}{formatCents(cardRow.diffCents)}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Real Bruto</p>
              <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums">{formatCents(cardRow.realCents)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400">Sistema</p>
              <p className="text-sm font-bold text-slate-600 dark:text-[#aebac1] tabular-nums">{formatCents(cardRow.systemCents)}</p>
            </div>
          </div>
        </div>

        {/* Dinheiro */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/85 dark:bg-[#202c33]/85 backdrop-blur-md p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5">
              <Banknote size={15} className="text-emerald-500" />
              Dinheiro em Gaveta
            </span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-[#8696a0]">
              Sangria: {formatCents(drawer.sangriaCents)}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Esperado Pós-Sangria</p>
              <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums">{formatCents(drawer.expectedAfterSangriaCents)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400">Contado</p>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {drawer.countedCents !== null && drawer.countedCents !== undefined ? formatCents(drawer.countedCents) : 'A informar'}
              </p>
            </div>
          </div>
          {drawer.swappedToDigitalCents > 0 && (
            <p className="text-[10.5px] text-amber-600 dark:text-amber-400 mt-1.5">
              +{formatCents(drawer.swappedToDigitalCents)} trocados p/ Pix/Cartão confirmados
            </p>
          )}
        </div>

        {/* Pendentes & Auditoria */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/85 dark:bg-[#202c33]/85 backdrop-blur-md p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5">
              <Clock size={15} className="text-amber-500" />
              Pendentes & Consumo
            </span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-[#8696a0]">
              {metrics.pendingDebtors?.length || 0} devedor(es)
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Notas Pendentes</p>
              <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums">{formatCents(pendRow.systemCents)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400">Consumo Interno</p>
              <p className="text-sm font-bold text-slate-600 dark:text-[#aebac1] tabular-nums">{formatCents(metrics.internalConsumptionCents)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Faixa de Custos, Taxas e Risco Operacional */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="rounded-xl border border-slate-200/70 dark:border-[#2a3942] bg-white/75 dark:bg-[#202c33]/75 px-3 py-2.5">
          <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1"><Percent size={11} /> Taxas Cartão</p>
          <p className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5 tabular-nums">{formatCents(metrics.totalMdrFeeCents)}</p>
        </div>
        <div className="rounded-xl border border-slate-200/70 dark:border-[#2a3942] bg-white/75 dark:bg-[#202c33]/75 px-3 py-2.5">
          <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1"><Receipt size={11} /> Líquido Digital</p>
          <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">{formatCents(metrics.totalNetDigitalCents)}</p>
        </div>
        <div className="rounded-xl border border-slate-200/70 dark:border-[#2a3942] bg-white/75 dark:bg-[#202c33]/75 px-3 py-2.5">
          <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1"><Ban size={11} /> Cancelados ({metrics.cancelledCount || 0})</p>
          <p className="text-sm font-black text-slate-800 dark:text-[#e9edef] mt-0.5 tabular-nums">{formatCents(metrics.cancelledCents)}</p>
        </div>
        <div className="rounded-xl border border-slate-200/70 dark:border-[#2a3942] bg-white/75 dark:bg-[#202c33]/75 px-3 py-2.5">
          <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1"><Coffee size={11} /> Descontos</p>
          <p className="text-sm font-black text-slate-800 dark:text-[#e9edef] mt-0.5 tabular-nums">{formatCents(metrics.discountsCents)}</p>
        </div>
        <div className="rounded-xl border border-slate-200/70 dark:border-[#2a3942] bg-white/75 dark:bg-[#202c33]/75 px-3 py-2.5">
          <p className="text-[10px] uppercase font-bold text-slate-400">Taxa Entrega + Casa</p>
          <p className="text-sm font-black text-slate-800 dark:text-[#e9edef] mt-0.5 tabular-nums">{formatCents((metrics.deliveryFeeCents || 0) + (metrics.serviceFeeCents || 0))}</p>
        </div>
        <div className="rounded-xl border border-slate-200/70 dark:border-[#2a3942] bg-white/75 dark:bg-[#202c33]/75 px-3 py-2.5">
          <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1"><Users size={11} /> Pessoas ({metrics.guestCount || 0})</p>
          <p className="text-sm font-black text-slate-800 dark:text-[#e9edef] mt-0.5 tabular-nums">{formatCents(metrics.averageTicketCents)}/p</p>
        </div>
      </div>

      {/* Histórico Multi-Dias de Saúde */}
      {historicalStats.totalSessions > 0 && (
        <div className="rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/85 dark:bg-[#202c33]/85 backdrop-blur-md p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1]">
                Evolução Histórica da Saúde do Controle ({historicalStats.totalSessions} fechamentos)
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#8696a0] mt-0.5">
                Taxa de batimento: <strong className="text-emerald-600 dark:text-emerald-400">{historicalStats.balancedRatePct}%</strong> • Saúde média: <strong>{historicalStats.avgHealthScore}%</strong> • Faltas acumuladas: <strong className="text-rose-500">{formatCents(historicalStats.totalShortageCents)}</strong> • Sobras: <strong className="text-indigo-500">{formatCents(historicalStats.totalSurplusCents)}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-end gap-2 overflow-x-auto pb-1">
            {historicalStats.series.slice(-14).map((pt) => {
              const barColor =
                pt.status === 'balanced'
                  ? 'bg-emerald-500'
                  : pt.status === 'attention'
                    ? 'bg-amber-500'
                    : pt.status === 'shortage'
                      ? 'bg-rose-500'
                      : 'bg-indigo-500';
              return (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => onSelectSession?.(pt.id)}
                  title={`${pt.referenceDate} • Saúde ${pt.healthScore}% • Dif ${formatCents(pt.diffCents)}`}
                  className="flex flex-col items-center gap-1 min-w-[44px] group cursor-pointer"
                >
                  <span className="text-[10px] font-bold text-slate-500 dark:text-[#8696a0] group-hover:text-[#00a884]">
                    {pt.healthScore}%
                  </span>
                  <div className="w-7 h-16 rounded-lg bg-slate-100 dark:bg-[#111b21] flex items-end overflow-hidden p-0.5">
                    <div
                      className={`w-full rounded-md ${barColor} transition-all group-hover:opacity-80`}
                      style={{ height: `${Math.max(12, Math.min(100, pt.healthScore))}%` }}
                    />
                  </div>
                  <span className="text-[9.5px] font-mono text-slate-400">
                    {String(pt.referenceDate).slice(5).replace('-', '/')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
