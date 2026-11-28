import React, { useMemo } from 'react';
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Receipt,
  UserX
} from 'lucide-react';
import { CashPendingAgendaItem, formatCents } from '../../types/cashReconciliation';
import { evaluateAgendaNotifications } from '../../utils/cashPendingAgendaHelper.mjs';
import { formatDateBr } from '../../utils/cashReconciliationServiceHelper.mjs';

interface CashPendingAgendaBannerProps {
  items: CashPendingAgendaItem[];
  onOpenAgenda: (focusItemId?: string, quickSettle?: boolean) => void;
}

export function CashPendingAgendaBanner({
  items,
  onOpenAgenda
}: CashPendingAgendaBannerProps) {
  const summary = useMemo(() => evaluateAgendaNotifications(items), [items]);

  if (summary.openCount === 0) return null;

  const isUrgent = summary.urgency === 'urgent';
  const topPreview = (summary.overdueItems.length + summary.dueTodayItems.length > 0
    ? [...summary.overdueItems, ...summary.dueTodayItems, ...summary.upcomingItems]
    : summary.waitingItems
  ).slice(0, 3) as CashPendingAgendaItem[];

  return (
    <div
      className={`rounded-2xl border p-3.5 sm:p-4 shadow-sm space-y-2.5 transition-all ${
        isUrgent
          ? 'border-amber-500/60 bg-gradient-to-r from-rose-500/[0.08] via-amber-500/[0.10] to-orange-500/[0.06] dark:bg-[#202c33]'
          : 'border-cyan-500/40 bg-cyan-500/[0.06] dark:bg-[#202c33]'
      }`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <span
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
              isUrgent
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-300 animate-pulse'
                : 'bg-cyan-500/15 border-cyan-500/35 text-cyan-600 dark:text-cyan-300'
            }`}
          >
            {isUrgent ? <BellRing size={17} /> : <CalendarClock size={17} />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                Agenda Financeira Cross-Dias ({summary.openCount} em espera •{' '}
                <strong className="tabular-nums">{formatCents(summary.totalWaitingCents)}</strong>)
              </span>
              {summary.overdueCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase animate-pulse">
                  {summary.overdueCount} vencida(s)
                </span>
              )}
              {summary.dueTodayCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase animate-pulse">
                  {summary.dueTodayCount} vence(m) hoje
                </span>
              )}
              {summary.paymentAwaitingCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                  {summary.paymentAwaitingCount} cliente(s) p/ pagar
                </span>
              )}
              {summary.missingReceiptCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-700 dark:text-orange-300 text-[10px] font-bold">
                  {summary.missingReceiptCount} nota(s)/cupom(ns) pendente(s)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-[#aebac1] mt-0.5">
              Estes alertas permanecem ativos entre todos os dias e fechamentos até você informar o pagamento ou registrar a nota/cupom fiscal.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenAgenda()}
          className={`px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 shadow-sm active:scale-95 transition-all ${
            isUrgent
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white'
              : 'bg-[#00a884] hover:bg-[#008f6f] text-white'
          }`}
        >
          Abrir Agenda & Notificações <ChevronRight size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {topPreview.map((it) => {
          const isOverdue = it.dueDate < summary.todayIso;
          const isDueToday = it.dueDate === summary.todayIso;
          return (
            <div
              key={it.id}
              className="rounded-xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#111b21]/90 px-3 py-2 flex items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {it.kind === 'missing_receipt' ? (
                    <Receipt size={12} className="text-orange-500 shrink-0" />
                  ) : (
                    <UserX size={12} className="text-rose-500 shrink-0" />
                  )}
                  <span className="font-black text-slate-900 dark:text-white truncate max-w-[170px]">
                    {it.title}
                  </span>
                  <strong className="text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                    {formatCents(it.amountCents)}
                  </strong>
                </div>
                <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0] truncate mt-0.5 flex items-center gap-1">
                  <Clock size={10} />
                  Orig: {formatDateBr(it.originDate)} •{' '}
                  <span
                    className={
                      isOverdue
                        ? 'text-rose-600 dark:text-rose-400 font-bold'
                        : isDueToday
                          ? 'text-amber-600 dark:text-amber-300 font-bold'
                          : ''
                    }
                  >
                    Agenda: {formatDateBr(it.dueDate)}
                  </span>
                  {it.customerOrSupplier ? ` • ${it.customerOrSupplier}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenAgenda(it.id, true)}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500 text-emerald-700 hover:text-white dark:text-emerald-300 text-[10.5px] font-black shrink-0 inline-flex items-center gap-1 transition-all"
                title={
                  it.kind === 'missing_receipt'
                    ? 'Registrar nota/cupom fiscal agora'
                    : 'Informar que o cliente realizou o pagamento'
                }
              >
                <CheckCircle2 size={12} />
                {it.kind === 'missing_receipt' ? 'Nota' : 'Baixar'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
