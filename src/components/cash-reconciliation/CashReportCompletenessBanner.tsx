import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, FileSpreadsheet, Landmark } from 'lucide-react';
import { CashReportCompleteness } from '../../types/cashReconciliation';

interface CashReportCompletenessBannerProps {
  completeness?: CashReportCompleteness | null;
}

export function CashReportCompletenessBanner({ completeness }: CashReportCompletenessBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!completeness) return null;

  const { system, bank, isComplete, percent, totalPresent, totalExpected, warnings } = completeness;

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
          <div className="min-w-0">
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
            </div>
            {!isComplete && warnings.length > 0 && (
              <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1">
                {warnings.join(' ')} Para conciliação e auditoria completa de itens, importe os arquivos faltantes.
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="px-3 py-1.5 rounded-xl bg-white/85 dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] font-bold text-[11px] text-slate-700 dark:text-[#d1d7db] hover:border-[#00a884] flex items-center gap-1 shrink-0 self-start sm:self-center"
        >
          {expanded ? 'Ocultar Checklist' : 'Ver Checklist 7+3'}
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
                  className={`rounded-xl border px-2.5 py-2 flex items-start gap-2 ${
                    item.present
                      ? 'bg-white/90 dark:bg-[#111b21] border-emerald-500/30'
                      : 'bg-amber-500/5 dark:bg-[#202c33]/80 border-amber-500/30'
                  }`}
                >
                  {item.present ? (
                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-800 dark:text-[#e9edef] truncate">{item.shortLabel}</p>
                    <p className="text-[10px] text-slate-500 dark:text-[#8696a0] leading-snug">{item.hint}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10.5px] font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5">
              <Landmark size={13} className="text-cyan-500" />
              Banco & Maquininhas ({bank.presentCount} de {bank.totalExpected})
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {bank.items.map((item) => (
                <div
                  key={item.fileType}
                  title={item.hint}
                  className={`rounded-xl border px-2.5 py-2 flex items-start gap-2 ${
                    item.present
                      ? 'bg-white/90 dark:bg-[#111b21] border-emerald-500/30'
                      : 'bg-amber-500/5 dark:bg-[#202c33]/80 border-amber-500/30'
                  }`}
                >
                  {item.present ? (
                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-800 dark:text-[#e9edef] truncate">{item.label}</p>
                    <p className="text-[10px] text-slate-500 dark:text-[#8696a0] leading-snug">{item.hint}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
