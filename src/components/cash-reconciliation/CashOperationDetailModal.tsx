import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ShoppingBag,
  CreditCard,
  AlertTriangle,
  Ban,
  Percent,
  UserCheck,
  Clock,
  Receipt,
  ArrowRightLeft,
  RotateCcw
} from 'lucide-react';
import {
  CashReconciliationItem,
  CashReconciliationResult,
  formatCents
} from '../../types/cashReconciliation';
import { formatDateBr } from '../../utils/cashReconciliationServiceHelper.mjs';
import { formatReopenedTableAudit, normalizeOrderNumber } from '../../utils/cashOperationItemsHelper.mjs';

export type CashSystemCategoryTarget = 'dinheiro' | 'cartao' | 'pix' | 'pendente';

const CATEGORY_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  pix: 'Pix',
  pendente: 'Nota Pendente'
};

interface CashOperationDetailModalProps {
  operationItem: CashReconciliationItem | null;
  pairedItems?: CashReconciliationItem[];
  result: CashReconciliationResult;
  onReclassifySystemItem?: (systemId: string, targetCategory: CashSystemCategoryTarget | null) => void;
  onClose: () => void;
}

export function CashOperationDetailModal({
  operationItem,
  pairedItems = [],
  result,
  onReclassifySystemItem,
  onClose
}: CashOperationDetailModalProps) {
  useEffect(() => {
    if (!operationItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [operationItem, onClose]);

  if (!operationItem || typeof document === 'undefined') return null;

  // Se o operador clicou em um lançamento Real conciliado, busca o pedido PDV vinculado para exibir os itens!
  const rawSystemAnchor =
    operationItem.side === 'system'
      ? operationItem
      : pairedItems.find((p) => p.side === 'system') || operationItem;

  const systemAnchor =
    (rawSystemAnchor.side === 'system'
      ? result.systemItems?.find((s) => s.id === rawSystemAnchor.id)
      : undefined) || rawSystemAnchor;

  const realAnchors =
    operationItem.side === 'real'
      ? [operationItem]
      : pairedItems.filter((p) => p.side === 'real');

  const orderDetail = systemAnchor.metadata?.orderDetail;
  const reclassifiedFrom =
    typeof systemAnchor.metadata?.reclassifiedFrom === 'string' ? systemAnchor.metadata.reclassifiedFrom : '';
  const normRef = normalizeOrderNumber(systemAnchor.referenceCode || orderDetail?.orderNumber || '');

  const audit = result.auditInsights;
  const linkedCancellations = (audit?.cancelledDetails || []).filter(
    (c) => normRef && normalizeOrderNumber(c.table) === normRef
  );
  const linkedFeeRemovals = (audit?.feeRemovals || []).filter(
    (f) => normRef && normalizeOrderNumber(f.orderNumber) === normRef
  );
  const linkedReopened = (audit?.reopenedTables || []).filter(
    (r) => normRef && (normalizeOrderNumber(r.table) === normRef || normalizeOrderNumber(r.orderNumber) === normRef)
  );
  const linkedDiscounts = (audit?.discountDetails || []).filter(
    (d) => normRef && normalizeOrderNumber(d.orderNumber) === normRef
  );

  const modal = (
    <div
      className="fixed inset-0 z-[10000] bg-slate-950/85 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Detalhamento da Operação e Itens"
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] rounded-3xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho da Operação */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#00a884]/15 border border-[#00a884]/30 text-[#00a884] flex items-center justify-center shrink-0">
              <ShoppingBag size={19} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">
                  {orderDetail ? `${orderDetail.module} #${orderDetail.orderNumber}` : operationItem.description}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-black tabular-nums">
                  {formatCents(operationItem.amountCents)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-[#8696a0] flex flex-wrap items-center gap-2 mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <Clock size={11} /> {formatDateBr(operationItem.dateStr)} {operationItem.timeStr}
                </span>
                {operationItem.operatorName && <span>• Op: {operationItem.operatorName}</span>}
                {operationItem.terminalName && <span>• Terminal: {operationItem.terminalName}</span>}
                {orderDetail?.waiters?.length ? (
                  <span className="inline-flex items-center gap-1 text-indigo-500 font-semibold">
                    • <UserCheck size={11} /> Garçom: {orderDetail.waiters.join(', ')}
                  </span>
                ) : null}
                {(operationItem.metadata?.debtorName || (operationItem.metadata?.debtorCandidates?.length || 0) > 0) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-[10.5px] font-black text-cyan-700 dark:text-cyan-300">
                    {operationItem.metadata?.debtorName
                      ? `Cliente: ${operationItem.metadata.debtorName}`
                      : `Possível devedor: ${operationItem.metadata?.debtorCandidates?.join(' / ')}`}
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-600 dark:text-[#aebac1] hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 shrink-0"
          >
            <X size={14} /> Fechar
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Ajuste Manual de Forma de Pagamento no Caixa */}
          {systemAnchor.side === 'system' && onReclassifySystemItem && (
            <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/90 dark:bg-[#202c33]/75 p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-[#e9edef] inline-flex items-center gap-1.5">
                    <ArrowRightLeft size={13} className="text-[#00a884]" />
                    Forma no PDV:{' '}
                    <strong className="text-[#008f6f] dark:text-[#00a884]">
                      {CATEGORY_LABELS[systemAnchor.category] || systemAnchor.category.toUpperCase()}
                    </strong>
                  </span>
                  {reclassifiedFrom && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                      Ajustado de {CATEGORY_LABELS[reclassifiedFrom] || reclassifiedFrom}
                    </span>
                  )}
                </div>

                {systemAnchor.category === 'dinheiro' && (
                  <button
                    type="button"
                    onClick={() => onReclassifySystemItem(systemAnchor.id, 'pendente')}
                    className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-black inline-flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                  >
                    <ArrowRightLeft size={12} /> Dinheiro → Nota Pendente
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10.5px] font-bold text-slate-500 dark:text-[#8696a0] mr-1">
                  Alterar pagamento para:
                </span>
                {(['dinheiro', 'cartao', 'pix', 'pendente'] as CashSystemCategoryTarget[]).map((cat) => {
                  const isCurrent = systemAnchor.category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => onReclassifySystemItem(systemAnchor.id, cat)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all ${
                        isCurrent
                          ? 'border-[#00a884] bg-[#00a884]/15 text-[#008f6f] dark:text-[#00a884] cursor-default'
                          : 'border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-slate-600 dark:text-[#aebac1] hover:border-[#00a884] hover:text-[#00a884]'
                      }`}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  );
                })}
                {reclassifiedFrom && (
                  <button
                    type="button"
                    onClick={() => onReclassifySystemItem(systemAnchor.id, null)}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <RotateCcw size={11} /> Desfazer
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Pagamentos Banco/Adquirente vinculados */}
          {realAnchors.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-2.5">
              <p className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <CreditCard size={13} /> Liquidação Real Vinculada ({realAnchors.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {realAnchors.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl bg-white dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white truncate">{r.description}</p>
                      <p className="text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                        {r.source.toUpperCase()} • {formatDateBr(r.dateStr)} {r.timeStr}
                        {r.referenceCode ? ` • NSU/Ref: ${r.referenceCode}` : ''}
                      </p>
                    </div>
                    <div className="text-right tabular-nums shrink-0">
                      <p className="font-black text-emerald-600 dark:text-emerald-400">{formatCents(r.amountCents)}</p>
                      {Number(r.feeCents || 0) > 0 && (
                        <p className="text-[10px] text-rose-500 whitespace-nowrap">
                          Taxa: -{formatCents(r.feeCents)} • Líq: {formatCents(r.netAmountCents ?? r.amountCents)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alertas de Auditoria da mesma Mesa / Pedido */}
          {(linkedReopened.length > 0 || linkedCancellations.length > 0 || linkedFeeRemovals.length > 0 || linkedDiscounts.length > 0) && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Eventos de Auditoria neste Pedido / Mesa
              </p>
              {linkedReopened.map((r, i) => {
                const info = formatReopenedTableAudit(r);
                return (
                  <div
                    key={`reop_${i}`}
                    className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-rose-700 dark:text-rose-300 text-xs flex flex-wrap items-center gap-1.5">
                        <span>{info.actionTitle}</span>
                        {info.eventTag && (
                          <span className="px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-[10px] font-black uppercase tracking-wide text-rose-700 dark:text-rose-200">
                            {info.eventTag}
                          </span>
                        )}
                      </span>
                      {info.orderNumber && (
                        <span className="px-2 py-0.5 rounded-md bg-white/80 dark:bg-[#111b21] border border-rose-500/25 text-[10.5px] font-mono font-bold text-rose-700 dark:text-rose-300">
                          Cód. #{info.orderNumber}
                        </span>
                      )}
                    </div>
                    {info.eventDetail && (
                      <p className="text-[11px] font-medium text-rose-800/90 dark:text-rose-200/90">
                        {info.eventDetail}
                      </p>
                    )}
                    <p className="text-[10.5px] text-slate-600 dark:text-[#8696a0]">
                      {info.auditHint}
                    </p>
                  </div>
                );
              })}
              {linkedCancellations.map((c, i) => (
                <div key={`canc_${i}`} className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1">
                      <Ban size={12} /> Cancelado: {c.qty}x {c.product}
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-[#d1d7db]">
                      Motivo: {c.reason || '-'} {c.reasonDetails ? `• "${c.reasonDetails}"` : ''} • Op: {c.operator || '-'}
                    </span>
                  </div>
                  <strong className="text-rose-600 dark:text-rose-400 tabular-nums shrink-0">{formatCents(c.totalCents)}</strong>
                </div>
              ))}
              {linkedDiscounts.map((d, i) => (
                <div key={`disc_${i}`} className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-2">
                  <span>
                    <strong className="text-amber-700 dark:text-amber-300">Desconto:</strong> {d.reason || d.source}{' '}
                    {d.details ? `(${d.details})` : ''} • Func: {d.employee || '-'}
                  </span>
                  <strong className="text-amber-700 dark:text-amber-300 tabular-nums shrink-0">{formatCents(d.amountCents)}</strong>
                </div>
              ))}
              {linkedFeeRemovals.length > 0 && (
                <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-200">
                  <Percent size={12} className="inline mr-1" />
                  Remoção de taxa 10% registrada em {linkedFeeRemovals.length} item(ns):{' '}
                  <strong>{linkedFeeRemovals[0].reason}</strong> ({linkedFeeRemovals[0].details || 'sem detalhes'}) • Op: {linkedFeeRemovals[0].operator || '-'}
                </div>
              )}
            </div>
          )}

          {/* Lista de Itens Consumidos */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 dark:bg-[#202c33] border-b border-slate-200 dark:border-[#2a3942] flex flex-wrap items-center justify-between gap-2">
              <p className="font-black uppercase tracking-wider text-slate-700 dark:text-[#aebac1] flex items-center gap-1.5">
                <Receipt size={14} className="text-[#00a884]" />
                Itens da Comanda / Pedido ({orderDetail?.items?.length || 0})
              </p>
              {orderDetail && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942]">
                    Produtos: {formatCents(orderDetail.itemsSubtotalCents)}
                  </span>
                  {orderDetail.serviceFeeCents > 0 && (
                    <span className="px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                      + Taxa Serviço/Entrega: {formatCents(orderDetail.serviceFeeCents)}
                    </span>
                  )}
                  {orderDetail.splitCount > 1 && (
                    <span className="px-2 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
                      Conta dividida ({orderDetail.splitCount} pagamentos • Total {formatCents(orderDetail.totalPaidCents)})
                    </span>
                  )}
                </div>
              )}
            </div>

            {!orderDetail || orderDetail.items.length === 0 ? (
              <div className="p-6 text-center text-slate-500 dark:text-[#8696a0] space-y-1">
                <p className="font-semibold text-slate-700 dark:text-[#d1d7db]">
                  Nenhum item detalhado vinculado a este lançamento.
                </p>
                <p className="text-[11px]">
                  Importe o relatório de <strong>Itens Vendidos (Consumo Detalhado)</strong> do DataDivas para visualizar os produtos, garçom e taxas desta operação.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                {orderDetail.items.map((item, idx) => (
                  <div key={`${item.code || idx}_${idx}`} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#202c33] font-black text-slate-700 dark:text-white">
                          {item.qty}x
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">{item.displayName}</span>
                        {item.subGroup && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#202c33] text-[10px] font-semibold text-slate-500 dark:text-[#8696a0]">
                            {item.subGroup}
                          </span>
                        )}
                      </div>
                      {item.comboParts && item.comboParts.length > 1 && (
                        <div className="flex flex-wrap gap-1 pl-1">
                          {item.comboParts.map((part, pIdx) => (
                            <span key={pIdx} className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[10px] font-medium">
                              • {part}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                        {item.timeStr || '-'} • Unit: {formatCents(item.unitCents)} • Garçom: {item.waiter || '-'}
                        {item.feeRemovalReason && (
                          <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-semibold">
                            • Sem taxa ({item.feeRemovalReason})
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-left sm:text-right tabular-nums shrink-0">
                      <p className="text-sm font-black text-slate-900 dark:text-white">{formatCents(item.totalCents)}</p>
                      {Number(item.discountCents || 0) > 0 && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                          Desc: -{formatCents(item.discountCents)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
