import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  EyeOff,
  FileWarning,
  Link2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Target,
  Undo2,
  Wallet,
  Wrench,
  X,
  Zap
} from 'lucide-react';
import {
  CashManualInputs,
  CashPendingAgendaItem,
  CashReconciliationItem,
  CashReconciliationResult,
  CashResolutionAction,
  formatCents
} from '../../types/cashReconciliation';
import {
  buildCashHealthActionPlan,
  buildLinkableSystemPool,
  buildPairedItemsByIdMap,
  formatDateBr
} from '../../utils/cashReconciliationServiceHelper.mjs';
import { CashManualReconciliationTable } from './CashManualReconciliationTable';
import { CashOperationDetailModal, CashSystemCategoryTarget } from './CashOperationDetailModal';
import { CashSuggestionCard } from './CashSuggestionCard';

export type HealthRoadmapTabKey = 'roteiro' | 'batimento' | 'composicao';

interface CashHealthRoadmapModalProps {
  result: CashReconciliationResult;
  manualInputs: CashManualInputs;
  manualResolutions?: CashResolutionAction[];
  agendaItems?: CashPendingAgendaItem[];
  initialTab?: HealthRoadmapTabKey;
  onUpdateManualInputs: (patch: Partial<CashManualInputs>) => void;
  onConfirmSuggestion: (suggestionId: string) => void;
  onRejectSuggestion: (suggestionId: string) => void;
  onManualLink: (systemIds: string[], realIds: string[], note?: string) => void;
  onIgnoreItem: (side: 'system' | 'real', id: string) => void;
  onReclassifySystemItem?: (systemId: string, targetCategory: CashSystemCategoryTarget | null) => void;
  onReclassifySystemItems?: (systemIds: string[], targetCategory: CashSystemCategoryTarget) => void;
  onScheduleAgendaFromItem?: (item: CashReconciliationItem) => void;
  onSettleCrossDayAgendaMatch?: (agendaItem: CashPendingAgendaItem, bankItem: CashReconciliationItem) => void;
  onUndoLastResolution?: () => void;
  onOpenMirrorCategory?: (mirrorKey: string) => void;
  onOpenChecklist?: () => void;
  onClose: () => void;
}

const PRESET_FORCE_REASONS = [
  'Sobra/Falta residual conferida após auditoria completa',
  'Diferença de taxa de entrega / arredondamento de cliente',
  'Troco ou variação em centavos na maquininha',
  'Recebimento confirmado em outro canal fora dos arquivos'
];

function formatSignedCents(cents: number): string {
  const n = Math.round(Number(cents || 0));
  if (n > 0) return `+${formatCents(n)}`;
  if (n < 0) return `-${formatCents(Math.abs(n))}`;
  return formatCents(0);
}

export function CashHealthRoadmapModal({
  result,
  manualInputs,
  manualResolutions = [],
  agendaItems = [],
  initialTab,
  onUpdateManualInputs,
  onConfirmSuggestion,
  onRejectSuggestion,
  onManualLink,
  onIgnoreItem,
  onReclassifySystemItem,
  onReclassifySystemItems,
  onScheduleAgendaFromItem,
  onSettleCrossDayAgendaMatch,
  onUndoLastResolution,
  onOpenMirrorCategory,
  onOpenChecklist,
  onClose
}: CashHealthRoadmapModalProps) {
  const plan = useMemo(() => buildCashHealthActionPlan(result), [result]) as {
    rawHealthScore: number;
    effectiveHealthScore: number;
    isForcedBalanced: boolean;
    forcedReason: string;
    pointsMissing: number;
    diffTotalCents: number;
    cashDiffCents: number;
    missingTotalCents: number;
    extraTotalCents: number;
    tableNetDiffCents: number;
    diffPenaltyPts: number;
    sugRecoverablePts: number;
    missingRecoverablePts: number;
    extraRecoverablePts: number;
    unmatchedRecoverablePts: number;
    steps: Array<{
      key: string;
      priority: number;
      title: string;
      description: string;
      pendingCount: number;
      recoverablePoints: number;
      actionLabel: string;
      targetMode: string;
    }>;
    quickPairs: Array<{
      id: string;
      sysItems: CashReconciliationItem[];
      realItems: CashReconciliationItem[];
      similarityPct: number;
      diffCents: number;
      sameCategory: boolean;
      timeDiffMin: number;
      explainsGlobalDiff: boolean;
    }>;
  };

  const systemPoolItems = useMemo(
    () => buildLinkableSystemPool(result, manualResolutions) as CashReconciliationItem[],
    [result, manualResolutions]
  );

  const pairedByItemId = useMemo(
    () => buildPairedItemsByIdMap(result.matchedPairs || []) as Map<string, CashReconciliationItem[]>,
    [result.matchedPairs]
  );

  const [activeTab, setActiveTab] = useState<HealthRoadmapTabKey>(() => {
    if (initialTab) return initialTab;
    return 'roteiro';
  });
  const [forceReasonDraft, setForceReasonDraft] = useState<string>(
    manualInputs.forcedBalanced?.reason || PRESET_FORCE_REASONS[0]
  );
  const [inspectedOp, setInspectedOp] = useState<{
    item: CashReconciliationItem;
    paired: CashReconciliationItem[];
  } | null>(null);

  useEffect(() => {
    if (manualInputs.forcedBalanced?.reason) {
      setForceReasonDraft(manualInputs.forcedBalanced.reason);
    }
  }, [manualInputs.forcedBalanced?.reason]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !inspectedOp) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, inspectedOp]);

  const suggestions = result.suggestions || [];
  const missingItems = result.missingInBank || [];
  const extraItems = result.extraInBank || [];
  const breakdown = result.healthBreakdown;

  const handleApplyForce100 = () => {
    const reason = forceReasonDraft.trim() || PRESET_FORCE_REASONS[0];
    onUpdateManualInputs({
      forcedBalanced: {
        enabled: true,
        reason,
        forcedAt: new Date().toISOString(),
        rawHealthScoreBeforeForce: plan.rawHealthScore,
        rawDiffCents: plan.diffTotalCents
      }
    });
  };

  const handleRevertForce100 = () => {
    onUpdateManualInputs({
      forcedBalanced: null
    });
  };

  const handleStepAction = (targetMode: string) => {
    if (targetMode === 'batimento' || targetMode === 'sugestoes') {
      setActiveTab('batimento');
    } else if (targetMode === 'mirror_dinheiro') {
      onClose();
      onOpenMirrorCategory?.('saldo_dinheiro');
    } else if (targetMode === 'checklist') {
      onClose();
      onOpenChecklist?.();
    }
  };

  const diffToneClass =
    Math.abs(plan.diffTotalCents) <= 100
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
      : plan.diffTotalCents > 0
        ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';

  const modalContent = (
    <div
      className="fixed inset-0 z-[9998] bg-slate-950/80 backdrop-blur-sm sm:p-3 lg:p-5 flex items-end sm:items-stretch justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Saúde do Caixa — Guia para 100% e Batimento Rápido"
    >
      <div
        className="w-full max-w-6xl h-[94vh] sm:h-full rounded-t-[28px] sm:rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#0b141a] shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Sticky */}
        <div
          className={`shrink-0 border-b px-4 sm:px-6 pt-4 pb-3 space-y-3 ${
            plan.isForcedBalanced
              ? 'border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-fuchsia-500/10 dark:bg-[#202c33]'
              : 'border-slate-200 dark:border-[#2a3942] bg-slate-50/95 dark:bg-[#202c33]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                  plan.isForcedBalanced
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-300 animate-pulse'
                    : 'bg-[#00a884]/15 border-[#00a884]/35 text-[#00a884]'
                }`}
              >
                {plan.isForcedBalanced ? <Zap size={19} /> : <Activity size={19} />}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    Saúde do Caixa: {plan.effectiveHealthScore}%
                  </h3>

                  {plan.isForcedBalanced ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/60 text-[10.5px] font-black uppercase text-amber-700 dark:text-amber-300 animate-pulse">
                      <ShieldAlert size={12} />
                      Forçado a 100% (Técnica Real: {plan.rawHealthScore}%)
                    </span>
                  ) : plan.rawHealthScore < 100 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-[10.5px] font-black text-amber-700 dark:text-amber-300">
                      Faltam {plan.pointsMissing}% p/ 100%
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-[10.5px] font-black text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 size={12} /> 100% Conciliado
                    </span>
                  )}

                  <span className={`px-2.5 py-0.5 rounded-full border text-xs font-black tabular-nums ${diffToneClass}`}>
                    {plan.diffTotalCents > 0
                      ? `Sobra: ${formatSignedCents(plan.diffTotalCents)}`
                      : plan.diffTotalCents < 0
                        ? `Falta: ${formatSignedCents(plan.diffTotalCents)}`
                        : 'Diferença: R$ 0,00'}
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-[#8696a0] mt-0.5">
                  Ref: {formatDateBr(result.referenceDate)} •{' '}
                  {plan.isForcedBalanced
                    ? `Caixa fechado com aviso pulsante mantendo a ${plan.diffTotalCents >= 0 ? 'sobra' : 'falta'} real de ${formatSignedCents(plan.diffTotalCents)} visível para conferência.`
                    : 'Resolva as pendências abaixo passo a passo no Batimento Rápido ou homologue a diferença residual se já auditou tudo.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {manualResolutions.length > 0 && onUndoLastResolution && (
                <button
                  type="button"
                  onClick={onUndoLastResolution}
                  className="px-3 py-2 min-h-[38px] rounded-xl border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <RotateCcw size={13} /> Desfazer ({manualResolutions.length})
                </button>
              )}

              {plan.isForcedBalanced && (
                <button
                  type="button"
                  onClick={handleRevertForce100}
                  className="px-3 py-2 min-h-[38px] rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <Undo2 size={13} /> Desforçar 100%
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 min-h-[38px] rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-700 dark:text-[#e9edef] hover:border-[#00a884] active:scale-95 transition-all flex items-center gap-1.5"
              >
                <X size={15} /> Fechar (Esc)
              </button>
            </div>
          </div>

          {/* Barra de Progresso Viva */}
          <div className="space-y-1">
            <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-[#111b21] overflow-hidden flex">
              <div
                className={`h-full transition-all duration-500 ${
                  plan.isForcedBalanced
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-fuchsia-500 animate-pulse'
                    : plan.rawHealthScore >= 90
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : 'bg-gradient-to-r from-[#00a884] to-cyan-400'
                }`}
                style={{ width: `${Math.max(4, Math.min(100, plan.rawHealthScore))}%` }}
              />
              {plan.isForcedBalanced && plan.rawHealthScore < 100 && (
                <div
                  className="h-full bg-amber-400/50 animate-pulse"
                  style={{ width: `${Math.max(0, 100 - plan.rawHealthScore)}%` }}
                  title={`+${100 - plan.rawHealthScore}% forçado manualmente`}
                />
              )}
            </div>
          </div>

          {/* Abas */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('roteiro')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'roteiro'
                  ? 'bg-[#00a884] text-white shadow-sm'
                  : 'bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1] hover:border-[#00a884]'
              }`}
            >
              <Target size={13} />
              Roteiro para 100% ({plan.steps.length} etapas)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('batimento')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'batimento'
                  ? 'bg-[#00a884] text-white shadow-sm'
                  : 'bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1] hover:border-[#00a884]'
              }`}
            >
              <Wrench size={13} />
              Batimento Rápido ({missingItems.length + extraItems.length} pendentes)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('composicao')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === 'composicao'
                  ? 'bg-[#00a884] text-white shadow-sm'
                  : 'bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1] hover:border-[#00a884]'
              }`}
            >
              <Activity size={13} />
              Composição da Nota ({plan.rawHealthScore}%)
            </button>
          </div>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {activeTab === 'roteiro' && (
            <div className="space-y-5">
              {/* Resumo Rápido Sobra/Falta × Saúde */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/80 dark:bg-[#202c33]/80 p-3.5">
                  <p className="text-[10px] font-black uppercase text-slate-400">Saúde Técnica Atual</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                    {plan.rawHealthScore}%
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                    {plan.pointsMissing > 0
                      ? `Faltam ${plan.pointsMissing} pts para 100% natural`
                      : 'Sem pendências abertas'}
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                  <p className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-300">
                    Sugestões Prontas ({suggestions.length})
                  </p>
                  <p className="text-2xl font-black text-amber-600 dark:text-amber-300 tabular-nums mt-0.5">
                    +{plan.sugRecoverablePts} pts
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                    Ganhos imediatos ao revisar cada card
                  </p>
                </div>

                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3.5">
                  <p className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">
                    Faltas × Sobras Abertas
                  </p>
                  <p className="text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums mt-0.5">
                    +{plan.unmatchedRecoverablePts} pts
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-[#8696a0] tabular-nums">
                    {missingItems.length} PDV (-3 pts/un) • {extraItems.length} Banco (-2 pts/un)
                  </p>
                </div>

                <div className={`rounded-2xl border p-3.5 ${diffToneClass}`}>
                  <p className="text-[10px] font-black uppercase opacity-80">Diferença Analisada do Caixa</p>
                  <p className="text-2xl font-black tabular-nums mt-0.5">
                    {formatSignedCents(plan.diffTotalCents)}
                  </p>
                  <p className="text-[11px] opacity-85 tabular-nums">
                    Digital aberto: {formatSignedCents(plan.tableNetDiffCents)} • Gaveta: {formatSignedCents(plan.cashDiffCents)}
                  </p>
                </div>
              </div>

              {/* Passo a passo acionável */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1]">
                  Caminho Guiado para Bater Este Caixa
                </h4>
                {plan.steps.length === 0 ? (
                  <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-5 flex items-center gap-3 text-sm text-emerald-800 dark:text-emerald-200">
                    <CheckCircle2 size={22} className="shrink-0" />
                    <div>
                      <p className="font-black">Tudo resolvido! Todas as vendas e recebimentos estão batidos.</p>
                      <p className="text-xs opacity-90">
                        Você já pode clicar em <strong>Fechar Caixa</strong> no topo da tela.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {plan.steps.map((step, idx) => (
                      <div
                        key={step.key}
                        className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-6 h-6 rounded-full bg-[#00a884]/15 text-[#008f6f] dark:text-[#00a884] text-xs font-black flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <p className="text-sm font-black text-slate-900 dark:text-white">{step.title}</p>
                            {step.recoverablePoints > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                                até +{step.recoverablePoints}% Saúde
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-[#aebac1] pl-8">{step.description}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleStepAction(step.targetMode)}
                          className="px-4 py-2 min-h-[38px] rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 active:scale-95 transition-all"
                        >
                          {step.actionLabel}
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sugestões Prontas inline para resolver em 1 clique */}
              {suggestions.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-300 flex items-center gap-1.5">
                      <Sparkles size={14} /> Sugestões Prontas — Resolva Direto Aqui ({suggestions.length})
                    </h4>
                  </div>
                  <div className="space-y-2.5">
                    {suggestions.map((sug) => (
                      <CashSuggestionCard
                        key={sug.id}
                        suggestion={sug}
                        variant="compact"
                        onConfirmSuggestion={onConfirmSuggestion}
                        onRejectSuggestion={onRejectSuggestion}
                        onReclassifySystemItems={onReclassifySystemItems}
                        onInspectOperation={(item) =>
                          setInspectedOp({ item, paired: pairedByItemId.get(item.id) || [] })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Homologação Consciente: Forçar Saúde a 100% mantendo a Sobra/Falta + Aviso Pulsante */}
              <div
                className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
                  plan.isForcedBalanced
                    ? 'border-amber-500/60 bg-amber-500/10'
                    : 'border-slate-200 dark:border-[#2a3942] bg-slate-50/90 dark:bg-[#111b21]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 max-w-2xl">
                    <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Zap size={16} className="text-amber-500 shrink-0" />
                      {plan.isForcedBalanced
                        ? 'Caixa Homologado em 100% (Forçado)'
                        : 'Já conferiu tudo e restou diferença aceita? Forçar Saúde para 100%'}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-[#aebac1] leading-relaxed">
                      Ao forçar para <strong>100%</strong>, o sistema marca este fechamento com{' '}
                      <strong>aviso pulsante âmbar/laranja</strong> e{' '}
                      <strong>preserva integralmente a diferença real</strong> (neste caixa:{' '}
                      <strong className="tabular-nums">{formatSignedCents(plan.diffTotalCents)}</strong>) para consulta rápida no histórico, dashboard, WhatsApp e PDF.
                    </p>
                  </div>

                  {plan.isForcedBalanced && (
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/60 text-amber-700 dark:text-amber-300 text-[11px] font-black uppercase animate-pulse">
                      ⚡ Forçado a 100% • {formatSignedCents(plan.diffTotalCents)}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {PRESET_FORCE_REASONS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setForceReasonDraft(preset)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                        forceReasonDraft === preset
                          ? 'border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                          : 'border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-slate-600 dark:text-[#aebac1] hover:border-amber-500/50'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={forceReasonDraft}
                    onChange={(e) => setForceReasonDraft(e.target.value)}
                    placeholder="Motivo para homologar em 100% (ex.: Sobra de R$ 9,03 conferida no Turno)..."
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                  {plan.isForcedBalanced ? (
                    <>
                      <button
                        type="button"
                        onClick={handleApplyForce100}
                        className="px-4 py-2 min-h-[38px] rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black flex items-center justify-center gap-1.5 shrink-0"
                      >
                        <Zap size={14} /> Atualizar Motivo
                      </button>
                      <button
                        type="button"
                        onClick={handleRevertForce100}
                        className="px-4 py-2 min-h-[38px] rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-black flex items-center justify-center gap-1.5 shrink-0"
                      >
                        <Undo2 size={14} /> Voltar p/ {plan.rawHealthScore}%
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleApplyForce100}
                      className="px-4 py-2 min-h-[38px] rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-black flex items-center justify-center gap-1.5 shrink-0 shadow-sm active:scale-95 transition-all"
                    >
                      <Zap size={14} /> Forçar Caixa a 100% ({formatSignedCents(plan.diffTotalCents)})
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'batimento' && (
            <div className="space-y-5">
              {/* Banner "Caça à Sobra / Falta" */}
              <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/90 dark:bg-[#202c33]/80 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <p className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Target size={15} className="text-[#00a884]" />
                    Mesa de Batimento Rápido • Foco na Diferença ({formatSignedCents(plan.diffTotalCents)})
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-[#aebac1]">
                    Passo 1: confirme/rejeite pares rápidos abaixo. Passo 2: selecione na tabela lado a lado para vincular `N:1`, trocar forma de pagamento ou justificar exceções.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap tabular-nums">
                  <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold">
                    PDV s/ par: {formatCents(plan.missingTotalCents)} ({missingItems.length})
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold">
                    Banco s/ par: {formatCents(plan.extraTotalCents)} ({extraItems.length})
                  </span>
                  <span className={`px-2.5 py-1 rounded-lg border font-black ${diffToneClass}`}>
                    Total Caixa: {formatSignedCents(plan.diffTotalCents)}
                  </span>
                </div>
              </div>

              {/* Pares Rápidos Sugeridos (Cliques diretos) */}
              {plan.quickPairs.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-300 flex items-center gap-1.5">
                    <Link2 size={14} /> Pares Rápidos Candidatos (Maior Probabilidade de Batimento)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {plan.quickPairs.map((pair) => {
                      const sys = pair.sysItems[0];
                      const real = pair.realItems[0];
                      return (
                        <div
                          key={pair.id}
                          className="rounded-2xl border border-indigo-500/25 bg-indigo-500/[0.04] p-3.5 space-y-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black tabular-nums">
                                {pair.similarityPct}% semelhante
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-[#202c33] text-slate-700 dark:text-[#aebac1] text-[10px] font-bold tabular-nums">
                                Δ {formatSignedCents(pair.diffCents)} • {pair.timeDiffMin} min
                              </span>
                              {pair.explainsGlobalDiff && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-black">
                                  Explica {formatSignedCents(plan.diffTotalCents)}!
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-1.5 text-[11px]">
                            <div className="flex items-center justify-between gap-2 bg-white/80 dark:bg-[#111b21]/80 rounded-xl px-2.5 py-1.5 border border-slate-200/70 dark:border-[#2a3942]">
                              <span className="truncate text-slate-700 dark:text-[#d1d7db]">
                                <strong>PDV:</strong> {sys.timeStr || '-'} • {sys.description}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setInspectedOp({ item: sys, paired: pairedByItemId.get(sys.id) || [] })
                                }
                                className="font-black text-rose-600 dark:text-rose-400 hover:underline tabular-nums shrink-0"
                                title="Ver itens do pedido PDV"
                              >
                                {formatCents(sys.amountCents)}
                              </button>
                            </div>
                            <div className="flex items-center justify-between gap-2 bg-white/80 dark:bg-[#111b21]/80 rounded-xl px-2.5 py-1.5 border border-slate-200/70 dark:border-[#2a3942]">
                              <span className="truncate text-slate-700 dark:text-[#d1d7db]">
                                <strong>Banco:</strong> {real.timeStr || '-'} • {real.description}
                              </span>
                              <strong className="text-indigo-600 dark:text-indigo-400 tabular-nums shrink-0">
                                {formatCents(real.amountCents)}
                              </strong>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                onManualLink(
                                  pair.sysItems.map((i) => i.id),
                                  pair.realItems.map((i) => i.id),
                                  `Batimento rápido (${pair.similarityPct}% semelhança, Δ ${formatSignedCents(pair.diffCents)})`
                                )
                              }
                              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1"
                            >
                              <Link2 size={12} /> Vincular Par (Δ {formatSignedCents(pair.diffCents)})
                            </button>
                            {onReclassifySystemItem && (
                              <button
                                type="button"
                                onClick={() => onReclassifySystemItem(sys.id, 'pendente')}
                                className="px-2.5 py-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1"
                              >
                                <Wallet size={12} /> Mudar p/ Pendente
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onIgnoreItem('system', sys.id)}
                              className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-[#2a3942] hover:border-rose-500/40 text-slate-600 dark:text-[#aebac1] text-[11px] font-semibold flex items-center gap-1"
                              title="Justificar/arquivar esta venda do PDV"
                            >
                              <EyeOff size={12} /> Justificar PDV
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tabela Lado a Lado embutida para N:1, 1:N, buscas e reclassificações */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1]">
                  Mesa Completa Lado a Lado (Multi-seleção PDV × Banco)
                </h4>
                <CashManualReconciliationTable
                  missingItems={missingItems}
                  extraItems={extraItems}
                  extraSystemPoolItems={systemPoolItems}
                  agendaItems={agendaItems}
                  currentReferenceDate={result.referenceDate}
                  onManualLink={onManualLink}
                  onIgnoreItem={onIgnoreItem}
                  onScheduleAgendaFromItem={onScheduleAgendaFromItem}
                  onSettleCrossDayAgendaMatch={onSettleCrossDayAgendaMatch}
                  onInspectOperation={(item) =>
                    setInspectedOp({ item, paired: pairedByItemId.get(item.id) || [] })
                  }
                />
              </div>
            </div>
          )}

          {activeTab === 'composicao' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/80 overflow-hidden text-xs">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] flex items-center justify-between">
                  <span className="font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1]">
                    Decomposição Matemática da Saúde do Caixa
                  </span>
                  <span className="font-black text-slate-900 dark:text-white tabular-nums">
                    Base 100% − {100 - plan.rawHealthScore} pts = {plan.rawHealthScore}%
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                  <div className="px-4 py-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-[#e9edef]">
                        1. Vendas PDV s/ Recebimento no Banco ({breakdown?.missingCount ?? missingItems.length} item(ns))
                      </p>
                      <p className="text-[11px] text-slate-500">Cada venda sem vínculo desconta 3 pontos da Saúde</p>
                    </div>
                    <strong className="text-rose-600 dark:text-rose-400 tabular-nums">
                      -{breakdown?.missingPenaltyPts ?? missingItems.length * 3} pts
                    </strong>
                  </div>

                  <div className="px-4 py-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-[#e9edef]">
                        2. Recebimentos no Banco s/ Venda no PDV ({breakdown?.extraCount ?? extraItems.length} item(ns))
                      </p>
                      <p className="text-[11px] text-slate-500">Cada sobra bancária não vinculada/justificada desconta 2 pontos</p>
                    </div>
                    <strong className="text-indigo-600 dark:text-indigo-400 tabular-nums">
                      -{breakdown?.extraPenaltyPts ?? extraItems.length * 2} pts
                    </strong>
                  </div>

                  <div className="px-4 py-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-[#e9edef]">
                        3. Sugestões Estruturais Abertas ({breakdown?.structuralSugCount ?? 0} sugestão(ões))
                      </p>
                      <p className="text-[11px] text-slate-500">Agrupamentos N:1, 1:N ou trocas de forma (-2,5 pts cada até confirmar/rejeitar)</p>
                    </div>
                    <strong className="text-amber-600 dark:text-amber-400 tabular-nums">
                      -{breakdown?.structuralSugPenaltyPts ?? 0} pts
                    </strong>
                  </div>

                  <div className="px-4 py-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-[#e9edef]">
                        4. Sugestões de Pequena Diferença / Alta Semelhança ({breakdown?.smallDiffSugCount ?? 0} sugestão(ões))
                      </p>
                      <p className="text-[11px] text-slate-500">Diferenças de troco/taxa/semelhança digital (-1,5 pts cada)</p>
                    </div>
                    <strong className="text-amber-600 dark:text-amber-400 tabular-nums">
                      -{breakdown?.smallDiffSugPenaltyPts ?? 0} pts
                    </strong>
                  </div>

                  <div className="px-4 py-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-[#e9edef]">
                        5. Impacto Proporcional da Diferença Geral ({formatSignedCents(plan.diffTotalCents)})
                      </p>
                      <p className="text-[11px] text-slate-500">Proporção da divergência líquida sobre o volume total conferido</p>
                    </div>
                    <strong className="text-slate-700 dark:text-[#aebac1] tabular-nums">
                      -{breakdown?.diffPenaltyPts ?? 0} pts
                    </strong>
                  </div>

                  <div className="px-4 py-3.5 flex items-center justify-between gap-2 bg-slate-50 dark:bg-[#111b21]">
                    <span className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                      <FileWarning size={14} className="text-[#00a884]" />
                      Resultado Técnico Final {plan.isForcedBalanced ? '(antes do forçamento)' : ''}
                    </span>
                    <strong className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                      {plan.rawHealthScore}%
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <CashOperationDetailModal
        operationItem={inspectedOp?.item || null}
        pairedItems={inspectedOp?.paired || []}
        result={result}
        onReclassifySystemItem={
          onReclassifySystemItem
            ? (itemId, targetCat) => {
                onReclassifySystemItem(itemId, targetCat);
                setInspectedOp(null);
              }
            : undefined
        }
        onScheduleAgendaFromItem={onScheduleAgendaFromItem}
        onClose={() => setInspectedOp(null)}
      />
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
