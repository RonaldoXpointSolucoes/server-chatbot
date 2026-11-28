import React, { useMemo, useState } from 'react';
import {
  Search,
  ShoppingBag,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Bike,
  Utensils,
  Store,
  MonitorSmartphone,
  FileWarning,
  Layers,
  Filter,
  ArrowRightLeft,
  RotateCcw
} from 'lucide-react';
import {
  CashReconciliationItem,
  CashReconciliationResult,
  formatCents
} from '../../types/cashReconciliation';
import { CashSystemCategoryTarget } from './CashSuggestionCard';
import {
  buildPdvOrdersCatalog,
  filterPdvOrdersCatalog
} from '../../utils/cashOperationItemsHelper.mjs';

interface PdvOrderPaymentEntry {
  id: string;
  amountCents: number;
  category: string;
  methodLabel: string;
  timeStr: string;
  operatorName: string;
  paymentStatus: string;
  systemItem: CashReconciliationItem;
}

export interface PdvOrderCatalogEntry {
  id: string;
  anchorId: string;
  anchorSystemItem: CashReconciliationItem;
  pairedItems: CashReconciliationItem[];
  moduleKey: 'DELIVERY' | 'MESA' | 'BALCAO' | 'TOTEM' | 'OUTROS';
  moduleLabel: string;
  orderNumber: string;
  orderTitle: string;
  origin: string;
  terminalName: string;
  dateStr: string;
  timeStr: string;
  secondsOfDay: number;
  totalCents: number;
  itemsSubtotalCents: number;
  serviceFeeCents: number;
  discountCents: number;
  itemsCount: number;
  itemsPreview: string;
  orderDetail?: CashReconciliationItem['metadata'] extends infer M
    ? M extends { orderDetail?: infer D }
      ? D
      : never
    : never;
  payments: PdvOrderPaymentEntry[];
  paymentCategories: string[];
  isPending: boolean;
  debtorName: string;
  debtorCandidates: string[];
  operators: string[];
  waiters: string[];
  reconcilStatus: 'em_falta' | 'sugestao' | 'pendente' | 'conciliado' | 'dinheiro' | 'outros';
  hasCancelledItem: boolean;
  hasFeeRemoval: boolean;
  hasDiscount: boolean;
  hasReopenedTable: boolean;
  hasOperationalAlert: boolean;
}

interface CashPdvOrdersPanelProps {
  result: CashReconciliationResult;
  onInspectOrder: (item: CashReconciliationItem, pairedItems: CashReconciliationItem[]) => void;
  onReclassifySystemItem?: (systemId: string, targetCategory: CashSystemCategoryTarget | null) => void;
}

type ChannelTabKey = 'ALL' | 'DELIVERY' | 'MESA' | 'BALCAO' | 'TOTEM' | 'PENDENTE' | 'OUTROS';

const CHANNEL_PILLS: Array<{ key: ChannelTabKey; label: string; icon: React.ReactNode }> = [
  { key: 'ALL', label: 'Todos', icon: <Layers size={13} /> },
  { key: 'DELIVERY', label: 'Delivery', icon: <Bike size={13} /> },
  { key: 'MESA', label: 'Mesa', icon: <Utensils size={13} /> },
  { key: 'BALCAO', label: 'Balcão', icon: <Store size={13} /> },
  { key: 'TOTEM', label: 'Totem', icon: <MonitorSmartphone size={13} /> },
  { key: 'PENDENTE', label: 'Pendente', icon: <FileWarning size={13} /> },
  { key: 'OUTROS', label: 'Outros', icon: <Layers size={13} /> }
];

const STATUS_BADGES: Record<
  PdvOrderCatalogEntry['reconcilStatus'],
  { label: string; badgeClass: string }
> = {
  em_falta: {
    label: 'Sem recebimento (Falta)',
    badgeClass: 'bg-rose-500/15 border-rose-500/35 text-rose-700 dark:text-rose-300'
  },
  sugestao: {
    label: 'Sugestão de vínculo',
    badgeClass: 'bg-amber-500/15 border-amber-500/35 text-amber-800 dark:text-amber-300'
  },
  pendente: {
    label: 'Nota Pendente (Fiado)',
    badgeClass: 'bg-orange-500/15 border-orange-500/35 text-orange-800 dark:text-orange-300'
  },
  conciliado: {
    label: 'Conciliado',
    badgeClass: 'bg-emerald-500/15 border-emerald-500/35 text-emerald-700 dark:text-emerald-300'
  },
  dinheiro: {
    label: 'Dinheiro (Gaveta)',
    badgeClass: 'bg-teal-500/15 border-teal-500/35 text-teal-700 dark:text-teal-300'
  },
  outros: {
    label: 'Outros / Online',
    badgeClass: 'bg-slate-500/15 border-slate-500/30 text-slate-700 dark:text-[#aebac1]'
  }
};

export function CashPdvOrdersPanel({ result, onInspectOrder, onReclassifySystemItem }: CashPdvOrdersPanelProps) {
  const [channelFilter, setChannelFilter] = useState<ChannelTabKey>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [operatorFilter, setOperatorFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [query, setQuery] = useState<string>('');

  const catalog = useMemo(
    () =>
      buildPdvOrdersCatalog(result) as {
        orders: PdvOrderCatalogEntry[];
        moduleSummaries: Record<ChannelTabKey, { key: string; label: string; count: number; totalCents: number }>;
      },
    [result]
  );

  const operatorOptions = useMemo(() => {
    const names = new Set<string>();
    for (const ord of catalog.orders) {
      for (const op of ord.operators || []) names.add(op);
      for (const w of ord.waiters || []) names.add(w);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [catalog.orders]);

  const filteredOrders = useMemo(
    () =>
      filterPdvOrdersCatalog(catalog.orders, {
        moduleFilter: channelFilter,
        paymentFilter,
        statusFilter,
        operatorFilter,
        query,
        sortBy
      }) as PdvOrderCatalogEntry[],
    [catalog.orders, channelFilter, paymentFilter, statusFilter, operatorFilter, query, sortBy]
  );

  const filteredTotalCents = useMemo(
    () => filteredOrders.reduce((s, ord) => s + Number(ord.totalCents || 0), 0),
    [filteredOrders]
  );

  const hasActiveSubFilters =
    channelFilter !== 'ALL' ||
    paymentFilter !== 'all' ||
    statusFilter !== 'all' ||
    operatorFilter !== 'all' ||
    query.trim() !== '';

  return (
    <div className="space-y-4">
      {/* Pílulas de Canais (Delivery, Mesa, Balcão, Totem, Pendente, Outros) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
        {CHANNEL_PILLS.map((pill) => {
          const sum = catalog.moduleSummaries[pill.key] || { count: 0, totalCents: 0 };
          if (pill.key === 'OUTROS' && sum.count === 0 && channelFilter !== 'OUTROS') return null;
          const isActive = channelFilter === pill.key;
          return (
            <button
              key={pill.key}
              type="button"
              onClick={() => setChannelFilter(pill.key)}
              className={`rounded-2xl border px-3 py-2.5 text-left transition-all active:scale-[0.98] ${
                isActive
                  ? 'border-[#00a884] bg-[#00a884]/15 shadow-sm'
                  : 'border-slate-200/80 dark:border-[#2a3942] bg-slate-50/75 dark:bg-[#111b21]/75 hover:border-[#00a884]/50'
              }`}
            >
              <div className="flex items-center justify-between gap-1 text-[10.5px] font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1]">
                <span className="inline-flex items-center gap-1 truncate">
                  {pill.icon}
                  {pill.label}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-black tabular-nums ${
                    isActive
                      ? 'bg-[#00a884] text-white'
                      : 'bg-slate-200/80 dark:bg-[#202c33] text-slate-700 dark:text-[#d1d7db]'
                  }`}
                >
                  {sum.count}
                </span>
              </div>
              <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white tabular-nums mt-1 truncate">
                {formatCents(sum.totalCents)}
              </p>
            </button>
          );
        })}
      </div>

      {/* Barra de Filtros Avançados */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#111b21]/60 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-[#aebac1] inline-flex items-center gap-1.5">
            <Filter size={13} className="text-[#00a884]" />
            Filtros de Análise ({filteredOrders.length} pedido(s) • {formatCents(filteredTotalCents)})
          </span>
          {hasActiveSubFilters && (
            <button
              type="button"
              onClick={() => {
                setChannelFilter('ALL');
                setPaymentFilter('all');
                setStatusFilter('all');
                setOperatorFilter('all');
                setQuery('');
              }}
              className="text-[11px] font-bold text-[#00a884] hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <div className="relative lg:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar pedido, mesa, produto, cliente, garçom ou R$..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            />
          </div>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            aria-label="Filtrar por forma de pagamento"
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-xs font-semibold text-slate-700 dark:text-[#e9edef] focus:outline-none focus:ring-2 focus:ring-[#00a884]"
          >
            <option value="all">Pagamento: Todos</option>
            <option value="cartao">Cartão (Crédito/Débito)</option>
            <option value="pix">PIX</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="pendente">Nota Pendente</option>
            <option value="ifood">iFood / Online</option>
            <option value="ticket">Ticket / Outros</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filtrar por status da auditoria"
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-xs font-semibold text-slate-700 dark:text-[#e9edef] focus:outline-none focus:ring-2 focus:ring-[#00a884]"
          >
            <option value="all">Status: Todos</option>
            <option value="em_falta">Sem recebimento (Em falta)</option>
            <option value="sugestao">Com sugestão</option>
            <option value="conciliado">Conciliados</option>
            <option value="pendente">Nota Pendente (Fiado)</option>
            <option value="dinheiro">Dinheiro (Gaveta)</option>
            <option value="alertas">Com alertas (Cancel./10%/Reaberta)</option>
          </select>

          <div className="flex gap-2">
            <select
              value={operatorFilter}
              onChange={(e) => setOperatorFilter(e.target.value)}
              aria-label="Filtrar por operador ou garçom"
              className="flex-1 min-w-0 px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-xs font-semibold text-slate-700 dark:text-[#e9edef] focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            >
              <option value="all">Op./Garçom: Todos</option>
              {operatorOptions.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Ordenar pedidos"
              className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-xs font-semibold text-slate-700 dark:text-[#e9edef] focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            >
              <option value="recent">Mais recentes</option>
              <option value="oldest">Mais antigos</option>
              <option value="amount_desc">Maior R$</option>
              <option value="amount_asc">Menor R$</option>
              <option value="order_number">Nº Pedido</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista Organizada de Pedidos */}
      {filteredOrders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/60 dark:bg-[#111b21]/50 py-10 text-center space-y-2">
          <CheckCircle2 size={32} className="mx-auto text-slate-400" />
          <p className="text-xs font-bold text-slate-700 dark:text-[#e9edef]">
            Nenhum pedido encontrado para os filtros aplicados.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredOrders.map((ord) => {
            const stMeta = STATUS_BADGES[ord.reconcilStatus] || STATUS_BADGES.outros;
            return (
              <div
                key={ord.id}
                onClick={() => onInspectOrder(ord.anchorSystemItem, ord.pairedItems)}
                className="cursor-pointer rounded-2xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#111b21]/90 hover:border-[#00a884]/60 px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-sm transition-all"
              >
                <div className="min-w-0 space-y-1 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-700 dark:text-indigo-300 text-[10.5px] font-black uppercase">
                      {ord.moduleLabel}
                    </span>
                    <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                      {ord.orderTitle}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black ${stMeta.badgeClass}`}>
                      {stMeta.label}
                    </span>
                    {(ord.debtorName || ord.debtorCandidates.length > 0) && (
                      <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-black text-cyan-800 dark:text-cyan-200">
                        {ord.debtorName ? `Cliente: ${ord.debtorName}` : `Possível: ${ord.debtorCandidates.join(' / ')}`}
                      </span>
                    )}
                    {ord.hasOperationalAlert && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        <AlertTriangle size={10} />
                        {[
                          ord.hasReopenedTable && 'Reaberta',
                          ord.hasCancelledItem && 'Cancel.',
                          ord.hasFeeRemoval && 'Sem 10%',
                          ord.hasDiscount && 'Desc.'
                        ]
                          .filter(Boolean)
                          .join(' • ') || 'Atenção'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-[#8696a0]">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} /> {ord.timeStr || '--:--'}
                    </span>
                    {ord.operators.length > 0 && <span>• Op: {ord.operators.join(', ')}</span>}
                    {ord.waiters.length > 0 && <span>• Garçom: {ord.waiters.join(', ')}</span>}
                    {ord.payments.map((p) => (
                      <span
                        key={p.id}
                        className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#202c33] text-slate-700 dark:text-[#d1d7db] text-[10px] font-semibold"
                      >
                        {p.methodLabel}: {formatCents(p.amountCents)}
                      </span>
                    ))}
                  </div>

                  {ord.itemsPreview && (
                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium truncate">
                      <ShoppingBag size={11} className="inline mr-1 -mt-0.5" />
                      {ord.itemsCount} item(ns): {ord.itemsPreview}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2 shrink-0">
                  <div className="text-right tabular-nums">
                    <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white underline decoration-[#00a884]/50 decoration-dotted underline-offset-4">
                      {formatCents(ord.totalCents)}
                    </span>
                    {ord.serviceFeeCents > 0 && (
                      <p className="text-[10px] text-slate-500 dark:text-[#8696a0]">
                        + taxa {formatCents(ord.serviceFeeCents)}
                      </p>
                    )}
                  </div>
                  {onReclassifySystemItem && (() => {
                    const cashPay = ord.payments.find((p) => p.category === 'dinheiro');
                    const reclassifiedPay = ord.payments.find((p) =>
                      typeof p.systemItem?.metadata?.reclassifiedFrom === 'string'
                    );
                    if (cashPay) {
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onReclassifySystemItem(cashPay.id, 'pendente');
                          }}
                          title="Lançado em Dinheiro por engano? Converter para Nota Pendente em 1 clique"
                          className="px-2.5 py-2 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/35 text-orange-700 dark:text-orange-300 text-[11px] font-black inline-flex items-center gap-1 active:scale-95 transition-all"
                        >
                          <ArrowRightLeft size={12} /> Dinheiro → Pendente
                        </button>
                      );
                    }
                    if (reclassifiedPay) {
                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onReclassifySystemItem(reclassifiedPay.id, null);
                          }}
                          title="Desfazer alteração manual de forma de pagamento"
                          className="px-2.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-[11px] font-bold inline-flex items-center gap-1 active:scale-95 transition-all"
                        >
                          <RotateCcw size={12} /> Desfazer
                        </button>
                      );
                    }
                    return null;
                  })()}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspectOrder(ord.anchorSystemItem, ord.pairedItems);
                    }}
                    className="px-3 py-2 rounded-xl bg-[#00a884]/15 hover:bg-[#00a884]/25 border border-[#00a884]/35 text-[#008f6f] dark:text-[#00a884] text-[11px] font-black inline-flex items-center gap-1.5 active:scale-95 transition-all"
                  >
                    <ShoppingBag size={13} />
                    {ord.itemsCount > 0 ? `Ver Itens (${ord.itemsCount})` : 'Detalhes'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
