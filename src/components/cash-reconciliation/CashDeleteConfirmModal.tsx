import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Calendar,
  Clock,
  Loader2,
  Trash2,
  User,
  X
} from 'lucide-react';
import { CashSessionRow } from '../../services/cashReconciliationService';
import { formatCents } from '../../types/cashReconciliation';
import { formatDateBr } from '../../utils/cashReconciliationServiceHelper.mjs';

export interface CashDeleteConfirmModalProps {
  session: CashSessionRow | null;
  isDeleting: boolean;
  onConfirm: (sessionId: string) => Promise<void> | void;
  onClose: () => void;
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

export function CashDeleteConfirmModal({
  session,
  isDeleting,
  onConfirm,
  onClose
}: CashDeleteConfirmModalProps) {
  useEffect(() => {
    if (!session) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session, isDeleting, onClose]);

  if (!session || typeof document === 'undefined') return null;

  const dateBr = formatDateBr(session.reference_date) || 'Data não informada';
  const timeHm = formatCreatedTimeHm(session.created_at);
  const isDraft = !session.closed_at || session.status === 'draft';
  const operatorName = session.operator_name?.trim() || 'Operador não informado';
  const shiftLabel = session.shift_label?.trim() || 'Diário';
  const diffCents = Number(session.diff_cents || 0);
  const signedDiff = `${diffCents > 0 ? '+' : diffCents < 0 ? '-' : ''}${formatCents(Math.abs(diffCents))}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={() => {
        if (!isDeleting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cash-delete-modal-title"
    >
      <div
        className="w-full sm:max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-2xl border border-rose-500/35 dark:border-[#2a3942] bg-white dark:bg-[#111b21] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 bg-gradient-to-r from-rose-500/15 via-rose-500/5 to-transparent border-b border-slate-200 dark:border-[#2a3942] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Trash2 size={18} />
            </div>
            <div className="min-w-0">
              <h3
                id="cash-delete-modal-title"
                className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate"
              >
                Excluir Fechamento de Caixa?
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-[#aebac1] truncate">
                Confira os dados abaixo antes de confirmar a exclusão
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            aria-label="Cancelar exclusão"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#202c33] active:scale-95 transition-all shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/90 dark:bg-[#202c33]/80 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-black text-slate-900 dark:text-white whitespace-nowrap">
                  <Calendar size={14} className="text-[#00a884]" />
                  {dateBr}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] text-xs font-mono font-bold text-slate-700 dark:text-[#e9edef] whitespace-nowrap">
                  <Clock size={12} className="text-slate-400" />
                  {timeHm || 'Sem hora'}
                </span>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-black uppercase ${
                  isDraft
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {isDraft ? 'Rascunho' : 'Fechado'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700 dark:text-[#d1d7db]">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#111b21] border border-slate-200/80 dark:border-[#2a3942] font-semibold">
                <User size={12} className="text-slate-400 shrink-0" />
                {operatorName}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#111b21] border border-slate-200/80 dark:border-[#2a3942] font-semibold">
                Turno: {shiftLabel}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#00a884]/10 border border-[#00a884]/25 font-black text-[#008f6f] dark:text-[#00a884] tabular-nums">
                Saúde {session.health_score}%
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/70 dark:border-[#2a3942] text-xs">
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-[#8696a0]">Sistema</p>
                <p className="font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap truncate">
                  {formatCents(session.system_total_cents)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-[#8696a0]">Real</p>
                <p className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap truncate">
                  {formatCents(session.real_total_cents)}
                </p>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-[10px] uppercase font-bold text-slate-500 dark:text-[#8696a0]">Diferença</p>
                <p
                  className={`font-black tabular-nums whitespace-nowrap truncate ${
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
          </div>

          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              Esta ação é <strong>permanente</strong> e removerá este fechamento, seus arquivos e os itens conciliados do histórico da empresa.
            </span>
          </div>
        </div>

        <div className="shrink-0 px-5 py-3.5 border-t border-slate-200 dark:border-[#2a3942] bg-slate-50/90 dark:bg-[#202c33]/90 flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2">
          <button
            type="button"
            autoFocus
            disabled={isDeleting}
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-700 dark:text-[#d1d7db] hover:bg-slate-100 dark:hover:bg-[#202c33] active:scale-95 transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => void onConfirm(session.id)}
            className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
          >
            {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={14} />}
            {isDeleting ? 'Excluindo...' : 'Excluir Permanentemente'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
