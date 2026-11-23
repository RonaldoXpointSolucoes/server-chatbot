import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Percent,
  Receipt,
  Ban,
  Coffee,
  Truck,
  Users
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
    subtitle: 'Taxas descontadas pelas adquirentes por transação aprovada',
    icon: <Percent size={18} className="text-rose-500" />
  },
  net_digital: {
    title: 'Líquido Digital por Canal',
    subtitle: 'Comparativo entre valor bruto, taxas MDR e valor líquido creditado',
    icon: <Receipt size={18} className="text-emerald-500" />
  },
  cancelled: {
    title: 'Itens Cancelados no PDV',
    subtitle: 'Cancelamentos registrados no fechamento do turno',
    icon: <Ban size={18} className="text-rose-500" />
  },
  discounts: {
    title: 'Descontos & Consumo Interno',
    subtitle: 'Concessões de desconto 10% e consumo da equipe no turno',
    icon: <Coffee size={18} className="text-amber-500" />
  },
  delivery_house_fees: {
    title: 'Taxa de Entrega + Taxa da Casa',
    subtitle: 'Separação entre taxa de delivery e taxa de serviço de salão',
    icon: <Truck size={18} className="text-indigo-500" />
  },
  guests: {
    title: 'Movimento de Pessoas & Ticket Médio',
    subtitle: 'Indicadores operacionais de atendimento e faturamento no salão',
    icon: <Users size={18} className="text-cyan-500" />
  }
};

interface CashMetricDetailModalProps {
  metricKey: HealthMetricKey;
  result: CashReconciliationResult;
  onClose: () => void;
}

export function CashMetricDetailModal({ metricKey, result, onClose }: CashMetricDetailModalProps) {
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

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] rounded-3xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-4 border-b border-slate-200 dark:border-[#2a3942] bg-slate-50/90 dark:bg-[#202c33]/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] flex items-center justify-center">
              {meta.icon}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">{meta.title}</h3>
              <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">{meta.subtitle}</p>
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

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {metricKey === 'fees' && (() => {
            const bySource = (detail.bySource as Array<{ source: string; count: number; grossCents: number; feeCents: number; netCents: number }>) || [];
            const items = (detail.items as CashReconciliationItem[]) || [];
            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-3.5">
                    <p className="text-[10px] font-black uppercase text-rose-500">Total de Taxas</p>
                    <p className="text-lg font-black text-rose-600 dark:text-rose-400 tabular-nums mt-0.5">
                      {formatCents(Number(detail.totalFeeCents || 0))}
                    </p>
                  </div>
                  {bySource.map((src) => (
                    <div key={src.source} className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-3.5">
                      <p className="text-[10px] font-black uppercase text-slate-500">{src.source} ({src.count} venda(s))</p>
                      <p className="text-base font-black text-slate-900 dark:text-white tabular-nums whitespace-nowrap mt-0.5">
                        {`-${formatCents(src.feeCents)}`}
                      </p>
                      <p className="text-[10.5px] text-slate-500">Bruto: {formatCents(src.grossCents)} • Líq: {formatCents(src.netCents)}</p>
                    </div>
                  ))}
                </div>

                {items.length === 0 ? (
                  <p className="text-slate-500 py-4 text-center">Nenhuma taxa individual informada nos relatórios carregados.</p>
                ) : (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] divide-y divide-slate-100 dark:divide-[#2a3942]">
                    {items.map((it) => {
                      const pct = it.amountCents > 0 ? ((Number(it.feeCents || 0) / it.amountCents) * 100).toFixed(2) : '0.00';
                      return (
                        <div key={it.id} className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <div>
                            <p className="font-bold text-slate-800 dark:text-[#e9edef]">{it.description}</p>
                            <p className="text-[11px] text-slate-500">{formatDateBr(it.dateStr)} {it.timeStr} • Bruto: {formatCents(it.amountCents)}</p>
                          </div>
                          <div className="text-left sm:text-right tabular-nums">
                            <span className="font-black text-rose-500 whitespace-nowrap">{`-${formatCents(it.feeCents)}`}</span>
                            <span className="text-[10.5px] text-slate-400 ml-1.5">({pct}%)</span>
                            <p className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-bold">
                              Líquido: {formatCents(it.netAmountCents ?? (it.amountCents - (it.feeCents || 0)))}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}

          {metricKey === 'net_digital' && (() => {
            const channels = (detail.channels as Array<{ key: string; label: string; count: number; grossCents: number; feeCents: number; netCents: number }>) || [];
            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-4">
                    <p className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">Líquido Digital Total</p>
                    <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                      {formatCents(Number(detail.totalNetDigitalCents || 0))}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4">
                    <p className="text-[10px] font-black uppercase text-rose-500">Taxas Descontadas</p>
                    <p className="text-xl font-black text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap mt-0.5">
                      {`-${formatCents(Number(detail.totalFeeCents || 0))}`}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] divide-y divide-slate-100 dark:divide-[#2a3942]">
                  {channels.length === 0 ? (
                    <p className="p-4 text-center text-slate-500">Sem transações digitais reais carregadas.</p>
                  ) : (
                    channels.map((ch) => (
                      <div key={ch.key} className="px-4 py-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{ch.label}</p>
                          <p className="text-[11px] text-slate-500">{ch.count} lançamento(s) • Bruto: {formatCents(ch.grossCents)}</p>
                        </div>
                        <div className="text-right tabular-nums">
                          <p className="font-black text-emerald-600 dark:text-emerald-400">{formatCents(ch.netCents)}</p>
                          {ch.feeCents > 0 && <p className="text-[10.5px] text-rose-500 whitespace-nowrap">{`Taxa: -${formatCents(ch.feeCents)}`}</p>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            );
          })()}

          {metricKey === 'cancelled' && (() => {
            const detailed = (detail.detailedItems as Array<{
              product: string;
              qty: number;
              totalCents: number;
              table: string;
              timeStr?: string;
              waiter?: string;
              operator?: string;
              reason?: string;
              reasonDetails?: string;
            }>) || [];
            const fallbackItems = (detail.items as Array<{ table: string; item: string; qty: number }>) || [];
            return (
              <>
                <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-500">Quantidade Cancelada</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white">{Number(detail.cancelledCount || 0)} item(ns)</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase text-slate-500">Valor Total</p>
                    <p className="text-lg font-black text-rose-500 tabular-nums">{formatCents(Number(detail.cancelledCents || 0))}</p>
                  </div>
                </div>
                {detailed.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] divide-y divide-slate-100 dark:divide-[#2a3942]">
                    {detailed.map((it, idx) => (
                      <div key={idx} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {it.qty}x {it.product} <span className="text-slate-400 font-semibold">• Pedido/Mesa {it.table || '-'}</span>
                          </p>
                          {(it.reason || it.reasonDetails || it.waiter || it.operator) && (
                            <p className="text-[11px] text-rose-600 dark:text-rose-300">
                              Motivo: <strong>{it.reason || '-'}</strong>
                              {it.reasonDetails ? ` ("${it.reasonDetails}")` : ''} • Garçom: {it.waiter || '-'} • Op: {it.operator || '-'}
                            </p>
                          )}
                        </div>
                        <div className="text-left sm:text-right shrink-0 tabular-nums">
                          {it.totalCents > 0 && (
                            <p className="font-black text-rose-500">{formatCents(it.totalCents)}</p>
                          )}
                          {it.timeStr && <p className="text-[10.5px] text-slate-400">{it.timeStr}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : fallbackItems.length === 0 ? (
                  <p className="text-slate-500 py-4 text-center">Nenhum item cancelado discriminado no fechamento.</p>
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
              </>
            );
          })()}

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
            const costCents = Number(detail.internalConsumptionCostCents || 0);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-4">
                    <p className="text-[10px] font-black uppercase text-slate-500">Descontos (10%)</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {formatCents(Number(detail.discountsCents || 0))}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-4">
                    <p className="text-[10px] font-black uppercase text-slate-500">Consumo Interno</p>
                    <p className="text-lg font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                      {formatCents(Number(detail.internalConsumptionCents || 0))}
                    </p>
                    <p className="text-[10.5px] text-slate-500 mt-1">
                      {costCents > 0 ? `Custo real (CMV): ${formatCents(costCents)}` : 'Não soma no faturamento de vendas.'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-4">
                    <p className="text-[10px] font-black uppercase text-slate-500">Total Sistema PDV</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {formatCents(Number(detail.systemTotalCents || 0))}
                    </p>
                  </div>
                </div>

                {discountDetails.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] divide-y divide-slate-100 dark:divide-[#2a3942]">
                    {discountDetails.map((d, idx) => (
                      <div key={idx} className="px-4 py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            Pedido {d.orderNumber || '-'} {d.module ? `(${d.module})` : ''} • {d.reason || d.source}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {d.timeStr || '-'} • Origem: {d.source} {d.employee ? `• Func: ${d.employee}` : ''} {d.details ? `• ${d.details}` : ''}
                          </p>
                        </div>
                        <strong className="text-amber-600 dark:text-amber-400 tabular-nums shrink-0">{formatCents(d.amountCents)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {metricKey === 'delivery_house_fees' && (() => {
            const feeRemovals = (detail.feeRemovals as Array<{
              orderNumber: string;
              module?: string;
              product: string;
              timeStr?: string;
              waiter?: string;
              reason?: string;
              details?: string;
              operator?: string;
            }>) || [];
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-4">
                    <p className="text-[10px] font-black uppercase text-slate-500">Taxa Entrega Delivery</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {formatCents(Number(detail.deliveryFeeCents || 0))}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-4">
                    <p className="text-[10px] font-black uppercase text-slate-500">Taxa Serviço Casa (S. Casa)</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {formatCents(Number(detail.serviceFeeCents || 0))}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-indigo-500/10 border border-indigo-500/25 p-4">
                    <p className="text-[10px] font-black uppercase text-indigo-500">Soma das Taxas</p>
                    <p className="text-lg font-black text-indigo-600 dark:text-indigo-400 tabular-nums mt-0.5">
                      {formatCents(Number(detail.totalCents || 0))}
                    </p>
                  </div>
                </div>

                {feeRemovals.length > 0 && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                    <p className="text-[11px] font-black uppercase text-amber-700 dark:text-amber-300">
                      Remoções de Taxa de Serviço Registradas ({feeRemovals.length})
                    </p>
                    <div className="divide-y divide-amber-500/15">
                      {feeRemovals.map((fr, i) => (
                        <div key={i} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                          <span>
                            <strong>{fr.module || 'MESA'} {fr.orderNumber}</strong> • {fr.product} ({fr.reason || '-'} {fr.details ? `— ${fr.details}` : ''})
                          </span>
                          <span className="text-slate-500 shrink-0">Op: {fr.operator || '-'} • {fr.timeStr || '-'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {metricKey === 'guests' && (() => {
            const topProducts = (detail.topProducts as Array<{ name: string; qty: number; totalCents: number }>) || [];
            const byModule = (detail.byModule as Array<{ module: string; itemsCount: number; totalCents: number }>) || [];
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-4">
                    <p className="text-[10px] font-black uppercase text-slate-500">Pessoas Atendidas em Mesa</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                      {Number(detail.guestCount || 0)} pessoas
                    </p>
                  </div>
                  <div className="rounded-2xl bg-cyan-500/10 border border-cyan-500/25 p-4">
                    <p className="text-[10px] font-black uppercase text-cyan-600 dark:text-cyan-400">Ticket Médio por Pessoa</p>
                    <p className="text-xl font-black text-cyan-600 dark:text-cyan-400 tabular-nums mt-0.5">
                      {formatCents(Number(detail.averageTicketCents || 0))}/pessoa
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-4">
                    <p className="text-[10px] font-black uppercase text-slate-500">Faturamento Base (Pix + Cartão + Dinheiro)</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {formatCents(Number(detail.revenueConsideredCents || 0))}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] p-4">
                    <p className="text-[10px] font-black uppercase text-slate-500">Notas Pendentes ({Number(detail.pendingCount || 0)} devedor(es))</p>
                    <p className="text-lg font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                      {formatCents(Number(detail.pendingCents || 0))}
                    </p>
                  </div>
                </div>

                {byModule.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {byModule.map((mod) => (
                      <div key={mod.module} className="rounded-xl border border-slate-200 dark:border-[#2a3942] p-3 bg-slate-50/70 dark:bg-[#202c33]/70">
                        <p className="text-[10px] font-black uppercase text-slate-500">{mod.module}</p>
                        <p className="text-sm font-black text-slate-900 dark:text-white tabular-nums">{formatCents(mod.totalCents)}</p>
                        <p className="text-[10px] text-slate-400">{mod.itemsCount} item(ns)</p>
                      </div>
                    ))}
                  </div>
                )}

                {topProducts.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-3 space-y-2">
                    <p className="text-[11px] font-black uppercase text-slate-600 dark:text-[#aebac1]">Top Produtos do Dia</p>
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
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
