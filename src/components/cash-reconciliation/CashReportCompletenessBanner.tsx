import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Landmark,
  Sparkles,
  RotateCcw,
  EyeOff
} from 'lucide-react';
import {
  CashReportCompleteness,
  CompanyCashRoutineProfile,
  LearnedBankRoutineEntry
} from '../../types/cashReconciliation';
import { DATADIVAS_REPORT_SPECS, BANK_REPORT_SPECS } from '../../utils/cashReportCompleteness.mjs';

interface ReportSpecCatalogEntry {
  fileType: string;
  label: string;
  shortLabel: string;
  hint: string;
}

interface CashReportCompletenessBannerProps {
  completeness?: CashReportCompleteness | null;
  routineProfile?: CompanyCashRoutineProfile | null;
  onToggleRoutineBank?: (bankKey: string, enabled: boolean) => void;
  onToggleRoutineReport?: (fileType: string, enabled: boolean) => void;
}

export function CashReportCompletenessBanner({
  completeness,
  routineProfile = null,
  onToggleRoutineBank,
  onToggleRoutineReport
}: CashReportCompletenessBannerProps) {
  const [expanded, setExpanded] = useState(false);

  const reportSpecsMap = useMemo(() => {
    const map = new Map<string, ReportSpecCatalogEntry>();
    const allSpecs = [
      ...(DATADIVAS_REPORT_SPECS as ReadonlyArray<ReportSpecCatalogEntry>),
      ...(BANK_REPORT_SPECS as ReadonlyArray<ReportSpecCatalogEntry>)
    ];
    for (const spec of allSpecs) {
      if (spec?.fileType) map.set(spec.fileType, spec);
    }
    return map;
  }, []);

  const learnedBanks = useMemo<LearnedBankRoutineEntry[]>(() => {
    const merged = new Map<string, LearnedBankRoutineEntry>();
    for (const entry of completeness?.learnedBanks || []) {
      if (entry?.bankKey) merged.set(entry.bankKey, entry);
    }
    if (routineProfile?.banks) {
      for (const entry of Object.values(routineProfile.banks)) {
        if (entry?.bankKey) merged.set(entry.bankKey, entry);
      }
    }
    return Array.from(merged.values()).sort((a, b) =>
      String(a.bankLabel || a.bankKey).localeCompare(String(b.bankLabel || b.bankKey), 'pt-BR')
    );
  }, [completeness?.learnedBanks, routineProfile?.banks]);

  const bankPresenceByKey = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const item of completeness?.bank?.items || []) {
      if (item.bankKey) map.set(item.bankKey, Boolean(item.present));
    }
    return map;
  }, [completeness?.bank?.items]);

  const dismissedReports = useMemo(() => {
    if (!routineProfile?.reports) return [] as Array<{ fileType: string; label: string; isSystem: boolean }>;
    const systemTypes = new Set(
      (DATADIVAS_REPORT_SPECS as ReadonlyArray<ReportSpecCatalogEntry>).map((s) => s.fileType)
    );
    const activeSystemTypes = new Set((completeness?.system?.items || []).map((i) => i.fileType));
    const activeBankTypes = new Set((completeness?.bank?.items || []).map((i) => i.fileType));

    return Object.values(routineProfile.reports)
      .filter((r) => {
        if (!r || r.enabled !== false) return false;
        if (r.fileType === 'extrato_ofx' || r.fileType === 'extrato_generico') return false;
        const isSystem = systemTypes.has(r.fileType);
        return isSystem ? !activeSystemTypes.has(r.fileType) : !activeBankTypes.has(r.fileType);
      })
      .map((r) => {
        const spec = reportSpecsMap.get(r.fileType);
        return {
          fileType: r.fileType,
          label: spec?.shortLabel || spec?.label || r.fileType,
          isSystem: systemTypes.has(r.fileType)
        };
      });
  }, [routineProfile?.reports, completeness?.system?.items, completeness?.bank?.items, reportSpecsMap]);

  if (!completeness) return null;

  const { system, bank, isComplete, percent, totalPresent, totalExpected, warnings } = completeness;
  const activeLearnedBanks = learnedBanks.filter((b) => b.enabled !== false);
  const dismissedLearnedBanks = learnedBanks.filter((b) => b.enabled === false);
  const hasAnyLearnedBank = learnedBanks.length > 0;
  const dismissedSystemReports = dismissedReports.filter((r) => r.isSystem);
  const dismissedBankReports = dismissedReports.filter((r) => !r.isSystem);

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-xs transition-all ${
        isComplete
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-amber-500/30 bg-amber-500/10'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          {isComplete ? (
            <CheckCircle2 size={17} className="text-emerald-500 shrink-0 mt-0.5 sm:mt-0" />
          ) : (
            <AlertTriangle size={17} className="text-amber-500 shrink-0 mt-0.5 sm:mt-0" />
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black text-slate-900 dark:text-white">
                Checklist dos Relatórios ({totalPresent}/{totalExpected} • {percent}%)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/80 dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] font-bold text-[11px] text-slate-700 dark:text-[#d1d7db]">
                DataDivas: {system.presentCount}/{system.totalExpected}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/80 dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] font-bold text-[11px] text-slate-700 dark:text-[#d1d7db]">
                Bancos / Maquininhas: {bank.presentCount}/{bank.totalExpected}
              </span>
              {hasAnyLearnedBank && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00a884]/15 border border-[#00a884]/35 font-bold text-[10.5px] text-[#008f6f] dark:text-[#00a884]">
                  <Sparkles size={11} className="shrink-0" />
                  Rotina aprendida automaticamente
                </span>
              )}
            </div>

            {hasAnyLearnedBank && (
              <div className="flex flex-wrap items-center gap-1.5">
                {activeLearnedBanks.map((lb) => {
                  const isPresent = bankPresenceByKey.get(lb.bankKey) ?? false;
                  return (
                    <div
                      key={lb.bankKey}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-bold transition-colors ${
                        isPresent
                          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-800 dark:text-emerald-300'
                          : 'bg-white/85 dark:bg-[#111b21] border-amber-500/40 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      <Landmark size={11} className="shrink-0" />
                      <span>
                        {lb.bankLabel}
                        {lb.acctLast4 ? ` ••••${lb.acctLast4}` : ''}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[9.5px] uppercase font-black ${
                          isPresent
                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {isPresent ? 'Enviado' : 'Esperado'}
                      </span>
                      {onToggleRoutineBank && (
                        <button
                          type="button"
                          onClick={() => onToggleRoutineBank(lb.bankKey, false)}
                          className="ml-0.5 px-1.5 py-0.5 rounded-lg bg-slate-100 dark:bg-[#202c33] hover:bg-rose-500/15 text-slate-600 dark:text-[#aebac1] hover:text-rose-600 dark:hover:text-rose-300 text-[10px] font-semibold active:scale-95 transition-all"
                          title={`Dispensar ${lb.bankLabel} da rotina esperada de hoje`}
                        >
                          Sem mov. hoje
                        </button>
                      )}
                    </div>
                  );
                })}

                {dismissedLearnedBanks.map((lb) => (
                  <div
                    key={lb.bankKey}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-slate-300/80 dark:border-[#2a3942] bg-slate-100/80 dark:bg-[#202c33]/70 text-[11px] text-slate-600 dark:text-[#aebac1]"
                  >
                    <EyeOff size={11} className="shrink-0" />
                    <span className="line-through font-semibold">{lb.bankLabel}</span>
                    {onToggleRoutineBank && (
                      <button
                        type="button"
                        onClick={() => onToggleRoutineBank(lb.bankKey, true)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-[#00a884]/15 hover:bg-[#00a884]/25 text-[#008f6f] dark:text-[#00a884] text-[10px] font-bold active:scale-95 transition-all"
                      >
                        <RotateCcw size={10} />
                        Reativar na rotina
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!isComplete && warnings.length > 0 && (
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {warnings.join(' ')} Para conciliação e auditoria completa de itens, importe os arquivos faltantes.
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="px-3 py-1.5 rounded-xl bg-white/85 dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] font-bold text-[11px] text-slate-700 dark:text-[#d1d7db] hover:border-[#00a884] flex items-center gap-1 shrink-0 self-start sm:self-center active:scale-95 transition-all"
        >
          {expanded ? 'Ocultar Checklist' : `Ver Checklist (${system.totalExpected}+${bank.totalExpected})`}
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-[#2a3942] grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-2">
            <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5">
              <FileSpreadsheet size={13} className="text-indigo-500" />
              Sistema DataDivas ({system.presentCount} de {system.totalExpected})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {system.items.map((item) => (
                <div
                  key={item.fileType}
                  title={item.hint}
                  className={`rounded-xl border px-2.5 py-2 flex items-start justify-between gap-2 ${
                    item.present
                      ? 'bg-white/90 dark:bg-[#111b21] border-emerald-500/30'
                      : 'bg-amber-500/5 dark:bg-[#202c33]/80 border-amber-500/30'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {item.present ? (
                      <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1">
                        <p className="text-[11px] font-bold text-slate-800 dark:text-[#e9edef] truncate">{item.shortLabel}</p>
                        {item.isHabitual && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold">
                            Habitual
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-[#8696a0] leading-snug">{item.hint}</p>
                    </div>
                  </div>
                  {onToggleRoutineReport && (
                    <button
                      type="button"
                      onClick={() => onToggleRoutineReport(item.fileType, false)}
                      className="px-1.5 py-0.5 rounded-lg border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-300 text-[9.5px] font-semibold text-slate-500 dark:text-[#aebac1] shrink-0 active:scale-95 transition-all"
                      title="Dispensar este relatório da rotina esperada"
                    >
                      Sem mov. hoje
                    </button>
                  )}
                </div>
              ))}
            </div>

            {dismissedSystemReports.length > 0 && onToggleRoutineReport && (
              <div className="rounded-xl border border-slate-200/70 dark:border-[#2a3942] bg-white/60 dark:bg-[#111b21]/50 p-2 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#8696a0]">
                  Dispensados da rotina DataDivas
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {dismissedSystemReports.map((rep) => (
                    <button
                      key={rep.fileType}
                      type="button"
                      onClick={() => onToggleRoutineReport(rep.fileType, true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] hover:border-[#00a884] text-[10.5px] font-semibold text-slate-600 dark:text-[#d1d7db] active:scale-95 transition-all"
                    >
                      <RotateCcw size={10} className="text-[#00a884]" />
                      <span>{rep.label}</span>
                      <span className="text-[#008f6f] dark:text-[#00a884] font-bold">• Reativar na rotina</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5">
              <Landmark size={13} className="text-cyan-500" />
              Banco & Maquininhas ({bank.presentCount} de {bank.totalExpected})
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {bank.items.map((item) => {
                const isLearned = Boolean(item.isLearnedBank && item.bankKey);
                const canToggleBank = Boolean(isLearned && item.bankKey && onToggleRoutineBank);
                const canToggleAcquirer = Boolean(!item.isLearnedBank && item.fileType !== 'extrato_ofx' && onToggleRoutineReport);
                const isBankEnabled = item.enabled !== false;

                return (
                  <div
                    key={item.bankKey ? `${item.fileType}_${item.bankKey}` : item.fileType}
                    title={item.hint}
                    className={`rounded-xl border px-2.5 py-2 flex items-start justify-between gap-2 ${
                      item.present
                        ? 'bg-white/90 dark:bg-[#111b21] border-emerald-500/30'
                        : isLearned
                          ? 'bg-[#00a884]/5 dark:bg-[#202c33]/90 border-amber-500/40'
                          : 'bg-amber-500/5 dark:bg-[#202c33]/80 border-amber-500/30'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      {item.present ? (
                        <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[11px] font-bold text-slate-800 dark:text-[#e9edef] truncate">{item.label}</p>
                          {isLearned && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#00a884]/15 text-[#008f6f] dark:text-[#00a884] text-[9.5px] font-black">
                              <Sparkles size={9} />
                              Rotina{item.seenCount ? ` • ${item.seenCount}x` : ''}
                            </span>
                          )}
                          {!isLearned && item.isHabitual && (
                            <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[9.5px] font-bold">
                              Habitual
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-[#8696a0] leading-snug">{item.hint}</p>
                      </div>
                    </div>

                    {canToggleBank && item.bankKey && onToggleRoutineBank && (
                      <button
                        type="button"
                        onClick={() => onToggleRoutineBank(item.bankKey!, !isBankEnabled)}
                        className={`px-2 py-1 rounded-lg border text-[10px] font-bold shrink-0 active:scale-95 transition-all ${
                          isBankEnabled
                            ? 'border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] text-slate-600 dark:text-[#aebac1] hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-300'
                            : 'border-[#00a884]/40 bg-[#00a884]/15 text-[#008f6f] dark:text-[#00a884] hover:bg-[#00a884]/25'
                        }`}
                      >
                        {isBankEnabled ? 'Sem mov. hoje' : 'Reativar na rotina'}
                      </button>
                    )}

                    {canToggleAcquirer && onToggleRoutineReport && (
                      <button
                        type="button"
                        onClick={() => onToggleRoutineReport(item.fileType, false)}
                        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-300 text-[10px] font-bold text-slate-600 dark:text-[#aebac1] shrink-0 active:scale-95 transition-all"
                      >
                        Sem mov. hoje
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {(dismissedLearnedBanks.length > 0 || dismissedBankReports.length > 0) && (
              <div className="rounded-xl border border-slate-200/70 dark:border-[#2a3942] bg-white/60 dark:bg-[#111b21]/50 p-2 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#8696a0]">
                  Dispensados da rotina bancária
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {dismissedLearnedBanks.map((lb) => (
                    <button
                      key={lb.bankKey}
                      type="button"
                      disabled={!onToggleRoutineBank}
                      onClick={() => onToggleRoutineBank?.(lb.bankKey, true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] hover:border-[#00a884] text-[10.5px] font-semibold text-slate-600 dark:text-[#d1d7db] active:scale-95 transition-all"
                    >
                      <RotateCcw size={10} className="text-[#00a884]" />
                      <span>{lb.bankLabel}</span>
                      <span className="text-[#008f6f] dark:text-[#00a884] font-bold">• Reativar na rotina</span>
                    </button>
                  ))}
                  {dismissedBankReports.map((rep) => (
                    <button
                      key={rep.fileType}
                      type="button"
                      disabled={!onToggleRoutineReport}
                      onClick={() => onToggleRoutineReport?.(rep.fileType, true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] hover:border-[#00a884] text-[10.5px] font-semibold text-slate-600 dark:text-[#d1d7db] active:scale-95 transition-all"
                    >
                      <RotateCcw size={10} className="text-[#00a884]" />
                      <span>{rep.label}</span>
                      <span className="text-[#008f6f] dark:text-[#00a884] font-bold">• Reativar na rotina</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
