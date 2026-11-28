import React from 'react';
import { ArrowRightLeft, CheckCircle2, ShoppingBag, Sparkles, Truck, XCircle } from 'lucide-react';
import {
  CashReconciliationItem,
  CashSuggestion,
  formatCents
} from '../../types/cashReconciliation';
import { RECONCILIATION_GLOSSARY } from '../../utils/cashReconciliationServiceHelper.mjs';

export type CashSystemCategoryTarget = 'dinheiro' | 'cartao' | 'pix' | 'pendente';

interface CashSuggestionCardProps {
  suggestion: CashSuggestion;
  variant?: 'default' | 'compact';
  onConfirmSuggestion: (suggestionId: string) => void;
  onRejectSuggestion: (suggestionId: string) => void;
  onReclassifySystemItems?: (systemIds: string[], targetCategory: CashSystemCategoryTarget) => void;
  onInspectOperation?: (item: CashReconciliationItem) => void;
}

const TARGET_LABEL: Record<CashSystemCategoryTarget, string> = {
  pendente: 'Nota Pendente',
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao: 'Cartão'
};

export const CashSuggestionCard: React.FC<CashSuggestionCardProps> = ({
  suggestion,
  variant = 'default',
  onConfirmSuggestion,
  onRejectSuggestion,
  onReclassifySystemItems,
  onInspectOperation
}) => {
  const isCashToPending = suggestion.reasonType === 'cash_to_pending';
  const isSurplusToCash = suggestion.reasonType === 'surplus_to_cash';
  const isCashSimilarity = suggestion.reasonType === 'cash_similarity';
  const isHighSimilarity = suggestion.reasonType === 'high_similarity';
  const isDrawerAnomaly = isCashToPending || isSurplusToCash;
  const sysIds = (suggestion.systemIds?.length
    ? suggestion.systemIds
    : (suggestion.systemItems || []).map((s) => s.id)
  ).filter(Boolean);

  const badgeText = isCashToPending
    ? 'Dinheiro → Nota Pendente'
    : isSurplusToCash
      ? 'Sobra Gaveta → Dinheiro'
      : isCashSimilarity
        ? `Alta Semelhança • Dinheiro ↔ ${
            suggestion.suggestedTargetCategory
              ? TARGET_LABEL[suggestion.suggestedTargetCategory]
              : 'Banco'
          }`
        : isHighSimilarity
          ? 'Alta Semelhança (Digital)'
          : suggestion.reasonType === 'swapped_method'
            ? 'Troca de Pagamento'
            : suggestion.reasonType === 'split_1_to_n'
              ? 'Pagamento Dividido (1:N)'
              : suggestion.reasonType === 'small_diff'
                ? 'Pequena Diferença (Troco / Taxa)'
                : 'Agrupado (N:1)';

  const cardToneClass = isCashToPending
    ? 'border-orange-500/35 bg-orange-500/[0.06]'
    : isSurplusToCash
      ? 'border-teal-500/35 bg-teal-500/[0.06]'
      : isCashSimilarity
        ? 'border-cyan-500/35 bg-cyan-500/[0.06]'
        : isHighSimilarity
          ? 'border-indigo-500/35 bg-indigo-500/[0.06]'
          : 'border-amber-500/30 bg-amber-500/5';

  const badgeToneClass = isCashToPending
    ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300'
    : isSurplusToCash
      ? 'bg-teal-500/20 text-teal-700 dark:text-teal-300'
      : isCashSimilarity
        ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300'
        : isHighSimilarity
          ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
          : 'bg-amber-500/20 text-amber-700 dark:text-amber-300';

  const canQuickReclassify = Boolean(
    onReclassifySystemItems && sysIds.length > 0 && suggestion.suggestedTargetCategory
  );

  return (
    <div
      className={`rounded-2xl border p-4 flex flex-col ${
        variant === 'default' ? 'lg:flex-row lg:items-center' : 'sm:flex-row sm:items-center'
      } justify-between gap-4 ${cardToneClass}`}
    >
      <div className="space-y-1.5 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase inline-flex items-center gap-1 ${badgeToneClass}`}>
            <Sparkles size={11} />
            {badgeText}
          </span>
          {suggestion.isDelivery && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-black uppercase inline-flex items-center gap-1">
              <Truck size={11} /> Delivery
            </span>
          )}
          {typeof suggestion.similarityPct === 'number' && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tabular-nums">
              {suggestion.similarityPct}% semelhante
            </span>
          )}
          <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
            {formatCents(suggestion.amountCents)}
          </span>
        </div>

        <p className="text-xs font-semibold text-slate-700 dark:text-[#d1d7db] leading-relaxed">
          {suggestion.reasonText}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 text-[11px]">
          <div className="rounded-xl bg-white/85 dark:bg-[#111b21]/85 px-3 py-2 border border-slate-200/70 dark:border-[#2a3942]">
            <p className="font-bold text-slate-400 uppercase text-[9.5px]">
              PDV (Sistema) • clique no valor p/ ver itens
            </p>
            {(suggestion.systemItems || []).map((s) => {
              const itemCount = s.metadata?.orderDetail?.items?.length || 0;
              return (
                <p key={s.id} className="text-slate-700 dark:text-[#e9edef] font-medium flex flex-wrap items-center gap-1 mt-0.5">
                  <span>
                    {s.timeStr || '-'} • {s.description} —
                  </span>
                  {onInspectOperation ? (
                    <button
                      type="button"
                      onClick={() => onInspectOperation(s)}
                      title="Clique para ver quais itens fazem parte deste pedido do PDV"
                      className="inline-flex items-center gap-1 font-black text-rose-600 dark:text-rose-300 hover:text-[#00a884] dark:hover:text-[#00a884] underline decoration-rose-500/45 hover:decoration-[#00a884] decoration-dotted underline-offset-4 cursor-pointer active:scale-95 transition-all"
                    >
                      <span>{formatCents(s.amountCents)}</span>
                      <ShoppingBag size={11} className="opacity-75 shrink-0" />
                    </button>
                  ) : (
                    <strong className="tabular-nums">{formatCents(s.amountCents)}</strong>
                  )}
                  {itemCount > 0 && (
                    <span className="text-[10px] font-bold text-[#008f6f] dark:text-[#00a884]">
                      ({itemCount} {itemCount === 1 ? 'item' : 'itens'})
                    </span>
                  )}
                </p>
              );
            })}
          </div>

          <div className="rounded-xl bg-white/85 dark:bg-[#111b21]/85 px-3 py-2 border border-slate-200/70 dark:border-[#2a3942]">
            {isDrawerAnomaly ? (
              <>
                <p className="font-bold text-slate-400 uppercase text-[9.5px]">
                  {isCashToPending ? 'Impacto na Gaveta de Dinheiro' : 'Impacto na Conferência'}
                </p>
                <p className="text-slate-700 dark:text-[#e9edef] font-medium mt-0.5 tabular-nums">
                  {isCashToPending ? (
                    <>
                      Diferença na gaveta:{' '}
                      <strong className="text-rose-600 dark:text-rose-400">
                        {formatCents(suggestion.drawerTargetCents || -suggestion.amountCents)}
                      </strong>{' '}
                      → Ao mudar para <strong>Nota Pendente</strong>, abate{' '}
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        {formatCents(suggestion.amountCents)}
                      </strong>{' '}
                      do Saldo em Dinheiro.
                    </>
                  ) : (
                    <>
                      Sobra na gaveta:{' '}
                      <strong className="text-indigo-600 dark:text-indigo-400">
                        +{formatCents(suggestion.drawerTargetCents || suggestion.amountCents)}
                      </strong>{' '}
                      → Ao mudar para <strong>Dinheiro</strong>, explica{' '}
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        {formatCents(suggestion.amountCents)}
                      </strong>
                      .
                    </>
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="font-bold text-slate-400 uppercase text-[9.5px]">
                  {RECONCILIATION_GLOSSARY.extra.title} (Banco / Maquininha)
                </p>
                {(suggestion.realItems || []).map((r) => (
                  <p key={r.id} className="text-slate-700 dark:text-[#e9edef] font-medium mt-0.5">
                    {r.timeStr || '-'} • {r.description} — <strong className="tabular-nums">{formatCents(r.amountCents)}</strong>
                  </p>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {isDrawerAnomaly && canQuickReclassify && suggestion.suggestedTargetCategory ? (
          <button
            type="button"
            onClick={() => onReclassifySystemItems?.(sysIds, suggestion.suggestedTargetCategory!)}
            className="px-3.5 py-2 min-h-[40px] rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <ArrowRightLeft size={14} />
            {suggestion.suggestedTargetCategory === 'pendente'
              ? 'Mudar p/ Pendente'
              : `Mudar p/ ${TARGET_LABEL[suggestion.suggestedTargetCategory]}`}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onConfirmSuggestion(suggestion.id)}
              className="px-3.5 py-2 min-h-[40px] rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <CheckCircle2 size={14} /> Confirmar Vínculo
            </button>
            {isCashSimilarity && canQuickReclassify && suggestion.suggestedTargetCategory && (
              <button
                type="button"
                onClick={() => onReclassifySystemItems?.(sysIds, suggestion.suggestedTargetCategory!)}
                className="px-3 py-2 min-h-[40px] rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <ArrowRightLeft size={14} /> Mudar p/ {TARGET_LABEL[suggestion.suggestedTargetCategory]}
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => onRejectSuggestion(suggestion.id)}
          className="px-3 py-2 min-h-[40px] rounded-xl border border-slate-300 dark:border-[#2a3942] hover:bg-rose-500/10 hover:text-rose-500 text-slate-600 dark:text-[#aebac1] text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
        >
          <XCircle size={14} /> Rejeitar
        </button>
      </div>
    </div>
  );
};
