import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Landmark,
  Loader2,
  MessageCircle,
  Phone,
  RotateCcw,
  Scale,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
  X,
  Zap
} from 'lucide-react';
import { CashSessionRow } from '../../services/cashReconciliationService';
import {
  CompanyCashRoutineProfile,
  LearnedBankRoutineEntry,
  formatCents
} from '../../types/cashReconciliation';
import {
  formatDateBr,
  parseForcedCashMetaFromSession
} from '../../utils/cashReconciliationServiceHelper.mjs';
import { normalizeBrazilWhatsappNumber } from '../../utils/cashReportExportHelper.mjs';
import { DATADIVAS_REPORT_SPECS, BANK_REPORT_SPECS } from '../../utils/cashReportCompleteness.mjs';
import { CashHealthHistoryCard, HistoricalStatsData } from './CashHealthDashboard';
import { CashAddRoutineBankBar } from './CashAddRoutineBankBar';

type DashboardFilterKey = 'all' | 'closed' | 'draft' | 'diff';

interface RoutineSpecItem {
  fileType: string;
  label: string;
  shortLabel: string;
}

export interface CashDashboardOverviewProps {
  sessions: CashSessionRow[];
  historicalStats: HistoricalStatsData;
  routineProfile: CompanyCashRoutineProfile | null;
  savedWhatsappPhone?: string;
  hasActiveDraft: boolean;
  activeDraftFilesCount?: number;
  activeDraftDate?: string;
  busySessionId?: string | null;
  isActionLocked?: boolean;
  onNewConference: () => void;
  onContinueDraft: () => void;
  onDiscardDraft: () => void;
  onOpenSession: (sessionId: string) => void;
  onSendWhatsapp: (session: CashSessionRow) => void;
  onChangeWhatsappNumber?: () => void;
  onExportPdf: (session: CashSessionRow) => void;
  onDeleteSession: (session: CashSessionRow) => void;
  onToggleRoutineBank?: (bankKey: string, enabled: boolean) => void;
  onToggleRoutineReport?: (fileType: string, enabled: boolean) => void;
  onAddRoutineBank?: (bank: { bankCode: string; bankLabel: string; acctLast4?: string }) => void;
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

function sessionHasDifference(s: CashSessionRow): boolean {
  return (
    Math.abs(Number(s.diff_cents || 0)) > 100 ||
    s.status === 'shortage' ||
    s.status === 'surplus' ||
    s.status === 'attention'
  );
}

function getSessionStatusMeta(session: CashSessionRow): {
  label: string;
  badgeClass: string;
} {
  if (!session.closed_at || session.status === 'draft') {
    return {
      label: 'Rascunho',
      badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
    };
  }
  if (session.status === 'balanced') {
    return {
      label: 'Bateu',
      badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
    };
  }
  if (session.status === 'shortage') {
    return {
      label: 'Falta',
      badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
    };
  }
  if (session.status === 'surplus') {
    return {
      label: 'Sobra',
      badgeClass: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
    };
  }
  return {
    label: 'Atenção',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
  };
}

export function CashDashboardOverview({
  sessions,
  historicalStats,
  routineProfile,
  savedWhatsappPhone = '',
  hasActiveDraft,
  activeDraftFilesCount = 0,
  activeDraftDate = '',
  busySessionId = null,
  isActionLocked = false,
  onNewConference,
  onContinueDraft,
  onDiscardDraft,
  onOpenSession,
  onSendWhatsapp,
  onChangeWhatsappNumber,
  onExportPdf,
  onDeleteSession,
  onToggleRoutineBank,
  onToggleRoutineReport,
  onAddRoutineBank
}: CashDashboardOverviewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<DashboardFilterKey>('all');
  const [routineExpanded, setRoutineExpanded] = useState(false);

  const aggregates = useMemo(() => {
    let totalSystemCents = 0;
    let totalRealCents = 0;
    let closedCount = 0;
    let draftCount = 0;
    let diffCount = 0;
    const dateCounts = new Map<string, number>();

    for (const s of sessions) {
      totalSystemCents += Number(s.system_total_cents || 0);
      totalRealCents += Number(s.real_total_cents || 0);
      if (!s.closed_at || s.status === 'draft') draftCount += 1;
      else closedCount += 1;
      if (sessionHasDifference(s)) diffCount += 1;
      dateCounts.set(s.reference_date, (dateCounts.get(s.reference_date) || 0) + 1);
    }

    if (sessions.length === 0 && historicalStats.series.length > 0) {
      for (const pt of historicalStats.series) {
        totalSystemCents += Number(pt.systemTotalCents || 0);
        totalRealCents += Number(pt.realTotalCents || 0);
      }
    }

    return {
      totalSystemCents,
      totalRealCents,
      closedCount,
      draftCount,
      diffCount,
      dateCounts
    };
  }, [sessions, historicalStats.series]);

  const learnedBanks = useMemo<LearnedBankRoutineEntry[]>(() => {
    if (!routineProfile?.banks) return [];
    return Object.values(routineProfile.banks).sort((a, b) =>
      String(a.bankLabel || a.bankKey).localeCompare(String(b.bankLabel || b.bankKey), 'pt-BR')
    );
  }, [routineProfile?.banks]);

  const routineReports = useMemo(() => {
    const specs: RoutineSpecItem[] = [
      ...(DATADIVAS_REPORT_SPECS as ReadonlyArray<RoutineSpecItem>),
      ...(BANK_REPORT_SPECS as ReadonlyArray<RoutineSpecItem>).slice(1)
    ];
    return specs.map((spec) => {
      const entry = routineProfile?.reports?.[spec.fileType];
      return {
        fileType: spec.fileType,
        label: spec.shortLabel || spec.label,
        seenCount: entry ? Number(entry.seenCount || 0) : 0,
        enabled: entry ? entry.enabled !== false : true
      };
    });
  }, [routineProfile?.reports]);

  const formattedWhatsapp = useMemo(() => {
    const raw = String(savedWhatsappPhone || '').trim();
    if (!raw) return '';
    const norm = normalizeBrazilWhatsappNumber(raw) as { ok: boolean; display: string };
    return norm.ok ? norm.display : raw;
  }, [savedWhatsappPhone]);

  const filteredSessions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return sessions.filter((s) => {
      const isDraft = !s.closed_at || s.status === 'draft';
      if (statusFilter === 'closed' && isDraft) return false;
      if (statusFilter === 'draft' && !isDraft) return false;
      if (statusFilter === 'diff' && !sessionHasDifference(s)) return false;

      if (!query) return true;
      const dateBr = formatDateBr(s.reference_date);
      const timeHm = formatCreatedTimeHm(s.created_at);
      const searchable = [
        dateBr,
        s.reference_date,
        timeHm,
        s.operator_name || '',
        s.shift_label || '',
        s.store_name || '',
        s.cash_notes || ''
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [sessions, statusFilter, searchTerm]);

  const netBalanceCents = historicalStats.totalSurplusCents - historicalStats.totalShortageCents;
  const formattedNetBalance = `${netBalanceCents > 0 ? '+' : netBalanceCents < 0 ? '-' : ''}${formatCents(Math.abs(netBalanceCents))}`;
  const activeBanksCount = learnedBanks.filter((b) => b.enabled !== false).length;
  const activeAcquirers = routineReports.filter(
    (r) => (r.fileType === 'adquirente_rede' || r.fileType === 'adquirente_c6pay') && r.enabled
  );
  const totalActiveBankAndAcquirerCount = activeBanksCount + activeAcquirers.length;

  return (
    <div className="space-y-5 min-w-0 max-w-full overflow-x-hidden">
      {/* Cabeçalho Executivo */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-xl p-4 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.28)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#00a884]/15 border border-[#00a884]/30 text-[10.5px] font-black uppercase tracking-wider text-[#008f6f] dark:text-[#00a884]">
              <BarChart3 size={12} />
              Visão Executiva
            </span>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#8696a0]">
              {sessions.length} {sessions.length === 1 ? 'fechamento registrado' : 'fechamentos registrados'}
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white">
            Painel Executivo de Caixas
          </h2>
          <p className="text-xs text-slate-600 dark:text-[#aebac1]">
            Acompanhe a saúde financeira dos turnos, rotina bancária aprendida e disparos em 1 clique.
          </p>
        </div>

        <button
          type="button"
          onClick={onNewConference}
          className="w-full sm:w-auto px-5 py-3 min-h-[44px] rounded-2xl bg-[#00a884] hover:bg-[#008f6f] text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md shadow-[#00a884]/20 active:scale-95 transition-all shrink-0"
        >
          <Scale size={16} className="shrink-0" />
          + Nova Conferência
        </button>
      </div>

      {/* Banner de Recuperação de Rascunho Ativo */}
      {hasActiveDraft && (
        <div className="rounded-2xl border border-[#00a884]/35 bg-gradient-to-r from-[#00a884]/15 via-emerald-500/5 to-white/80 dark:from-[#00a884]/20 dark:via-[#202c33]/90 dark:to-[#202c33] backdrop-blur-md p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#00a884]/20 border border-[#00a884]/35 text-[#008f6f] dark:text-[#00a884] flex items-center justify-center shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                Você possui uma conferência em rascunho pronta para continuar
              </p>
              <p className="text-[11px] text-slate-600 dark:text-[#aebac1] mt-0.5 flex flex-wrap items-center gap-x-2">
                {activeDraftFilesCount > 0 && (
                  <span>
                    <strong>{activeDraftFilesCount}</strong> arquivo(s) carregado(s)
                  </span>
                )}
                {activeDraftDate && (
                  <span>
                    • Referência: <strong>{formatDateBr(activeDraftDate)}</strong>
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onContinueDraft}
              className="px-4 py-2.5 min-h-[42px] rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              <FolderOpen size={14} />
              Continuar Rascunho
            </button>
            <button
              type="button"
              onClick={onDiscardDraft}
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white/90 dark:bg-[#111b21] hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-bold text-slate-600 dark:text-[#aebac1] flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            >
              <Trash2 size={13} />
              Descartar
            </button>
          </div>
        </div>
      )}

      {/* 4 KPI Cards Consolidados */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Saúde Média & Taxa de Batimento */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-md p-4 shadow-sm flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#aebac1] flex items-center gap-1.5 truncate">
              <Activity size={13} className="text-[#00a884] shrink-0" />
              Saúde Média & Batimento
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10.5px] font-black tabular-nums whitespace-nowrap">
              {historicalStats.balancedRatePct}% bateu
            </span>
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
              {historicalStats.avgHealthScore}%
            </p>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-[#111b21] overflow-hidden mt-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#00a884] to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.max(4, Math.min(100, historicalStats.avgHealthScore || 0))}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
            {historicalStats.balancedCount} de {historicalStats.totalSessions} fechamento(s) conciliado(s)
          </p>
        </div>

        {/* KPI 2: Saldo Líquido (Faltas vs Sobras) */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-md p-4 shadow-sm flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#aebac1] flex items-center gap-1.5 truncate">
              {netBalanceCents < 0 ? (
                <TrendingDown size={13} className="text-rose-500 shrink-0" />
              ) : (
                <TrendingUp size={13} className="text-indigo-500 shrink-0" />
              )}
              Saldo Líquido (Faltas × Sobras)
            </span>
          </div>
          <p
            className={`text-xl sm:text-2xl font-black tabular-nums whitespace-nowrap truncate ${
              Math.abs(netBalanceCents) <= 100
                ? 'text-emerald-600 dark:text-emerald-400'
                : netBalanceCents < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-indigo-600 dark:text-indigo-400'
            }`}
          >
            {formattedNetBalance}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="text-rose-600 dark:text-rose-400 font-bold tabular-nums whitespace-nowrap">
              Faltas: {formatCents(historicalStats.totalShortageCents)}
            </span>
            <span className="text-indigo-600 dark:text-indigo-400 font-bold tabular-nums whitespace-nowrap">
              Sobras: {formatCents(historicalStats.totalSurplusCents)}
            </span>
          </div>
        </div>

        {/* KPI 3: Total Conciliado */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-md p-4 shadow-sm flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#aebac1] flex items-center gap-1.5 truncate">
              <Wallet size={13} className="text-emerald-500 shrink-0" />
              Total Conciliado (Real)
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap truncate">
            {formatCents(aggregates.totalRealCents)}
          </p>
          <div className="space-y-0.5 text-[11px] text-slate-500 dark:text-[#8696a0]">
            <p className="tabular-nums whitespace-nowrap truncate">
              Sistema PDV: <strong className="text-slate-700 dark:text-[#e9edef]">{formatCents(aggregates.totalSystemCents)}</strong>
            </p>
            <p className="truncate">
              {aggregates.closedCount} fechado(s) • {aggregates.draftCount} rascunho(s)
            </p>
          </div>
        </div>

        {/* KPI 4: Bancos & Rotina Aprendida + WhatsApp Salvo */}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-md p-4 shadow-sm flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="uppercase text-[10px] font-black tracking-wider text-slate-500 dark:text-[#aebac1] flex items-center gap-1.5 truncate">
              <Landmark size={13} className="text-cyan-500 shrink-0" />
              Bancos & Rotina Aprendida
            </span>
            <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 text-[10px] font-black whitespace-nowrap">
              {totalActiveBankAndAcquirerCount} ativo(s)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 min-h-[26px]">
            {learnedBanks.length === 0 && activeAcquirers.length === 0 ? (
              <span className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                Bancos serão aprendidos ao importar OFX.
              </span>
            ) : (
              <>
                {learnedBanks.slice(0, 3).map((bank) => {
                  const enabled = bank.enabled !== false;
                  return (
                    <span
                      key={bank.bankKey}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10.5px] font-bold ${
                        enabled
                          ? 'bg-[#00a884]/10 border-[#00a884]/30 text-[#008f6f] dark:text-[#00a884]'
                          : 'bg-slate-100 dark:bg-[#111b21] border-slate-200 dark:border-[#2a3942] text-slate-500 dark:text-[#8696a0] line-through'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-[#00a884]' : 'bg-slate-400'}`} />
                      {bank.bankLabel}
                    </span>
                  );
                })}
                {activeAcquirers.map((acq) => (
                  <span
                    key={acq.fileType}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border bg-indigo-500/10 border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-[10.5px] font-bold"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    {acq.label}
                  </span>
                ))}
              </>
            )}
          </div>

          <div className="pt-1 border-t border-slate-200/70 dark:border-[#2a3942] flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <Phone size={12} className="text-[#00a884] shrink-0" />
              <span className="truncate font-semibold text-slate-700 dark:text-[#d1d7db] tabular-nums">
                {formattedWhatsapp || 'WhatsApp não salvo'}
              </span>
              {onChangeWhatsappNumber && (
                <button
                  type="button"
                  onClick={onChangeWhatsappNumber}
                  className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#111b21] hover:bg-[#00a884]/15 text-[#008f6f] dark:text-[#00a884] text-[10px] font-bold whitespace-nowrap active:scale-95 transition-all"
                >
                  {formattedWhatsapp ? 'Trocar nº' : 'Definir nº'}
                </button>
              )}
            </div>

            <button
              type="button"
              aria-expanded={routineExpanded}
              onClick={() => setRoutineExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-600 dark:text-[#aebac1] hover:text-[#00a884] active:scale-95 transition-all whitespace-nowrap"
            >
              {routineExpanded ? 'Ocultar rotina' : 'Gerenciar rotina'}
              {routineExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>
      </div>

      {/* Gerenciador Colapsável de Rotina Aprendida (Bancos & Relatórios) */}
      {routineExpanded && (
        <div className="rounded-3xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-xl p-4 sm:p-5 shadow-sm space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#e9edef] flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#00a884]" />
                Rotina Financeira Aprendida da Empresa
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-[#8696a0] mt-0.5">
                Ative ou dispense bancos e relatórios habituais para ajustar o checklist inteligente desta empresa.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRoutineExpanded(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              aria-label="Fechar gerenciador de rotina"
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bancos aprendidos */}
            <div className="space-y-2">
              <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-500 dark:text-[#aebac1] flex items-center gap-1.5">
                <Landmark size={13} className="text-cyan-500" />
                Bancos Aprendidos via OFX ({learnedBanks.length})
              </p>
              {learnedBanks.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 dark:border-[#2a3942] p-3 text-xs text-slate-500 dark:text-[#8696a0]">
                  Nenhum banco aprendido ainda. Ao enviar extratos OFX (Itaú, C6, etc.), os bancos aparecem aqui automaticamente.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {learnedBanks.map((bank) => {
                    const enabled = bank.enabled !== false;
                    return (
                      <div
                        key={bank.bankKey}
                        className="rounded-xl border border-slate-200/80 dark:border-[#2a3942] bg-slate-50/75 dark:bg-[#111b21]/80 px-3 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 dark:text-white truncate">
                            {bank.bankLabel}
                            {bank.acctLast4 ? ` ••••${bank.acctLast4}` : ''}
                          </p>
                          <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                            {bank.seenCount}x visto{bank.lastSeenDate ? ` • Último: ${formatDateBr(bank.lastSeenDate)}` : ''}
                          </p>
                        </div>
                        {onToggleRoutineBank && (
                          <button
                            type="button"
                            onClick={() => onToggleRoutineBank(bank.bankKey, !enabled)}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold active:scale-95 transition-all shrink-0 ${
                              enabled
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-rose-500/15 hover:text-rose-600 hover:border-rose-500/30'
                                : 'bg-slate-200/70 dark:bg-[#202c33] text-slate-600 dark:text-[#aebac1] border border-slate-300 dark:border-[#2a3942] hover:border-[#00a884] hover:text-[#00a884]'
                            }`}
                          >
                            {enabled ? 'Ativo • Dispensar' : 'Dispensado • Reativar'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {onAddRoutineBank && (
                <div className="rounded-xl border border-slate-200/70 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#111b21]/60 p-2.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#8696a0]">
                    Adicionar / Fixar Banco OFX na Rotina
                  </p>
                  <CashAddRoutineBankBar onAddRoutineBank={onAddRoutineBank} />
                </div>
              )}
            </div>

            {/* Relatórios habituais */}
            <div className="space-y-2">
              <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-500 dark:text-[#aebac1] flex items-center gap-1.5">
                <FileSpreadsheet size={13} className="text-indigo-500" />
                Relatórios do Dia (DataDivas & Maquininhas)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {routineReports.map((rep) => (
                  <div
                    key={rep.fileType}
                    className="rounded-xl border border-slate-200/80 dark:border-[#2a3942] bg-slate-50/75 dark:bg-[#111b21]/80 px-2.5 py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className={`font-bold truncate ${rep.enabled ? 'text-slate-800 dark:text-[#e9edef]' : 'text-slate-500 dark:text-[#8696a0] line-through'}`}>
                        {rep.label}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-[#8696a0]">
                        {rep.seenCount > 0 ? `${rep.seenCount}x enviado` : 'Padrão'}
                      </p>
                    </div>
                    {onToggleRoutineReport && (
                      <button
                        type="button"
                        onClick={() => onToggleRoutineReport(rep.fileType, !rep.enabled)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold active:scale-95 transition-all shrink-0 ${
                          rep.enabled
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-rose-500/15 hover:text-rose-600'
                            : 'bg-slate-200/70 dark:bg-[#202c33] text-slate-500 dark:text-[#aebac1] hover:text-[#00a884]'
                        }`}
                      >
                        {rep.enabled ? 'Ativo' : 'Reativar'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gráfico Histórico Interativo (distingue múltiplos turnos no mesmo dia) */}
      {historicalStats.totalSessions > 0 && (
        <CashHealthHistoryCard
          historicalStats={historicalStats}
          onSelectSession={onOpenSession}
        />
      )}

      {/* Empty State ou Lista Filtrada de Fechamentos */}
      {sessions.length === 0 ? (
        <div className="rounded-3xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-xl p-8 sm:p-12 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-[#00a884]/15 border border-[#00a884]/30 text-[#00a884] flex items-center justify-center">
            <Scale size={30} />
          </div>
          <div className="max-w-lg mx-auto space-y-1.5">
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              Nenhum fechamento salvo no histórico ainda
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-[#aebac1]">
              Clique em <strong>+ Nova Conferência</strong> para enviar os relatórios do DataDivas, extratos bancários OFX e maquininhas. O painel aprende automaticamente os bancos desta empresa para os próximos dias.
            </p>
          </div>
          <button
            type="button"
            onClick={onNewConference}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] rounded-2xl bg-[#00a884] hover:bg-[#008f6f] text-white text-xs sm:text-sm font-black shadow-md active:scale-95 transition-all"
          >
            <Scale size={16} className="shrink-0" />
            + Nova Conferência
          </button>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-xl p-4 sm:p-5 shadow-sm space-y-4">
          {/* Barra de Busca & Filtros */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md min-w-0">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por data (ex: 19/11), operador ou turno..."
                className="w-full pl-10 pr-9 py-2.5 min-h-[42px] text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#111b21] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Limpar busca"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: 'all', label: 'Todos', count: sessions.length },
                  { key: 'closed', label: 'Fechados', count: aggregates.closedCount },
                  { key: 'draft', label: 'Rascunhos', count: aggregates.draftCount },
                  { key: 'diff', label: 'Com Diferença', count: aggregates.diffCount }
                ] as const
              ).map((pill) => {
                const active = statusFilter === pill.key;
                return (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setStatusFilter(pill.key)}
                    className={`px-3 py-2 min-h-[38px] rounded-xl border text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all ${
                      active
                        ? 'border-[#00a884] bg-[#00a884] text-white shadow-sm'
                        : 'border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#111b21] text-slate-700 dark:text-[#d1d7db] hover:border-[#00a884]/60'
                    }`}
                  >
                    <span>{pill.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-black tabular-nums ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200/80 dark:bg-[#202c33] text-slate-600 dark:text-[#aebac1]'
                      }`}
                    >
                      {pill.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista de Fechamentos */}
          {filteredSessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-[#2a3942] py-8 px-4 text-center space-y-2.5">
              <AlertTriangle size={26} className="mx-auto text-amber-500" />
              <p className="text-sm font-bold text-slate-800 dark:text-white">
                Nenhum fechamento encontrado com os filtros aplicados
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-700 dark:text-[#d1d7db] hover:border-[#00a884] active:scale-95 transition-all"
              >
                <RotateCcw size={13} />
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSessions.map((s) => {
                const dateBr = formatDateBr(s.reference_date) || 'Sem data';
                const timeHm = formatCreatedTimeHm(s.created_at);
                const isSameDayDuplicate = (aggregates.dateCounts.get(s.reference_date) || 0) > 1;
                const statusMeta = getSessionStatusMeta(s);
                const isDraft = !s.closed_at || s.status === 'draft';
                const diffCents = Number(s.diff_cents || 0);
                const signedDiff = `${diffCents > 0 ? '+' : diffCents < 0 ? '-' : ''}${formatCents(Math.abs(diffCents))}`;
                const isBusy = busySessionId === s.id;
                const disableCardActions = isActionLocked || Boolean(busySessionId);
                const operatorLabel = s.operator_name?.trim() || 'Operador não informado';
                const shiftLabel = s.shift_label?.trim() || 'Diário';
                const forcedMeta = parseForcedCashMetaFromSession(s);

                return (
                  <div
                    key={s.id}
                    className={`rounded-2xl border p-4 transition-all space-y-3 min-w-0 ${
                      forcedMeta.isForced
                        ? 'border-amber-500/60 bg-amber-500/[0.06] dark:bg-[#111b21]/85 hover:border-amber-500'
                        : 'border-slate-200/80 dark:border-[#2a3942] bg-slate-50/75 dark:bg-[#111b21]/85 hover:border-[#00a884]/50'
                    }`}
                  >
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5 min-w-0">
                      {/* Identidade do Fechamento */}
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-slate-900 dark:text-white whitespace-nowrap">
                            {dateBr}
                            {timeHm ? ` • ${timeHm}` : ''}
                          </span>

                          {isSameDayDuplicate && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-bold text-cyan-700 dark:text-cyan-300 whitespace-nowrap">
                              <Clock size={10} />
                              Múltiplo no dia
                            </span>
                          )}

                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10.5px] font-black whitespace-nowrap ${statusMeta.badgeClass}`}>
                            {s.status === 'balanced' && !isDraft && <CheckCircle2 size={11} />}
                            {statusMeta.label}
                          </span>

                          {forcedMeta.isForced ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-amber-500/65 bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10.5px] font-black tabular-nums whitespace-nowrap animate-pulse"
                              title={
                                forcedMeta.reason
                                  ? `Forçado a 100% • Motivo: ${forcedMeta.reason}`
                                  : 'Fechamento forçado a 100% mantendo a diferença real visível'
                              }
                            >
                              <Zap size={10} /> 100% FORÇADO
                              {forcedMeta.rawScore !== null ? ` (Real ${forcedMeta.rawScore}%)` : ''}
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-[#00a884]/15 text-[#008f6f] dark:text-[#00a884] text-[10.5px] font-black tabular-nums whitespace-nowrap">
                              Saúde {s.health_score}%
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 dark:text-[#aebac1]">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-[#202c33] border border-slate-200/80 dark:border-[#2a3942] font-semibold">
                            <User size={11} className="text-slate-400 shrink-0" />
                            {operatorLabel}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#202c33] border border-slate-200/80 dark:border-[#2a3942] font-semibold whitespace-nowrap">
                            Turno: {shiftLabel}
                          </span>
                          {s.store_name && (
                            <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#202c33] border border-slate-200/80 dark:border-[#2a3942] font-semibold truncate max-w-[200px]">
                              {s.store_name}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Valores Financeiros */}
                      <div className="grid grid-cols-3 gap-3 xl:min-w-[330px] rounded-xl bg-white/90 dark:bg-[#202c33]/90 border border-slate-200/70 dark:border-[#2a3942] px-3.5 py-2.5 min-w-0">
                        <div className="min-w-0">
                          <p className="text-[9.5px] uppercase font-bold text-slate-500 dark:text-[#8696a0]">Sistema</p>
                          <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap truncate">
                            {formatCents(s.system_total_cents)}
                          </p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9.5px] uppercase font-bold text-slate-500 dark:text-[#8696a0]">Real</p>
                          <p className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap truncate">
                            {formatCents(s.real_total_cents)}
                          </p>
                        </div>
                        <div className="min-w-0 text-right">
                          <p className="text-[9.5px] uppercase font-bold text-slate-500 dark:text-[#8696a0]">Diferença</p>
                          <p
                            className={`text-xs sm:text-sm font-black tabular-nums whitespace-nowrap truncate ${
                              Math.abs(diffCents) <= 100
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : diffCents < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-indigo-600 dark:text-indigo-400'
                            }`}
                          >
                            {signedDiff}
                          </p>
                        </div>
                      </div>

                      {/* 4 Botões de Ação */}
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={disableCardActions}
                          onClick={() => onOpenSession(s.id)}
                          className="px-3 py-2 min-h-[40px] rounded-xl bg-slate-900 dark:bg-[#2a3942] hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                        >
                          {isBusy ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
                          Abrir
                        </button>
                        <button
                          type="button"
                          disabled={disableCardActions}
                          onClick={() => onSendWhatsapp(s)}
                          className="px-3 py-2 min-h-[40px] rounded-xl bg-[#00a884] hover:bg-[#008f6f] disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        >
                          <MessageCircle size={13} />
                          WhatsApp
                        </button>
                        <button
                          type="button"
                          disabled={disableCardActions}
                          onClick={() => onExportPdf(s)}
                          className="px-3 py-2 min-h-[40px] rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                        >
                          <FileText size={13} />
                          PDF
                        </button>
                        <button
                          type="button"
                          disabled={disableCardActions}
                          onClick={() => onDeleteSession(s)}
                          className="px-3 py-2 min-h-[40px] rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                        >
                          <Trash2 size={13} />
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
