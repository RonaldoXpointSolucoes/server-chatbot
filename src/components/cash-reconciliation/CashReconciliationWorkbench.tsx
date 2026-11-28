import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Search,
  Sparkles,
  Link2,
  Plus,
  Trash2,
  Power,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  Calendar,
  CalendarClock,
  Receipt,
  Table2,
  RotateCcw,
  ShoppingBag
} from 'lucide-react';
import {
  CashAiAnalysis,
  CashAuditInsights,
  CashManualInputs,
  CashMirrorRow,
  CashPendingAgendaItem,
  CashReconciliationItem,
  CashReconciliationResult,
  CashSuggestion,
  SavedCashFilePassword,
  formatCents
} from '../../types/cashReconciliation';
import { CashRuleRow } from '../../services/cashReconciliationService';
import { filterVisibleFormulaRules } from '../../utils/cashFilePasswordHelper.mjs';
import { formatReopenedTableAudit } from '../../utils/cashOperationItemsHelper.mjs';
import { findCrossDayAgendaMatchesForExtras } from '../../utils/cashPendingAgendaHelper.mjs';
import { CashAgendaInitialDraft } from './CashPendingAgendaModal';
import {
  RECONCILIATION_GLOSSARY,
  buildLinkableSystemPool,
  buildPairedItemsByIdMap,
  filterVisibleMirrorRows,
  formatDateBr,
  formatDateHeaderBadge,
  parseUiMoneyInputToCents
} from '../../utils/cashReconciliationServiceHelper.mjs';
import { buildPdvOrdersCatalog } from '../../utils/cashOperationItemsHelper.mjs';
import {
  CashDrawerOutflowsModal,
  DrawerOutflowModalTab
} from './CashDrawerOutflowsModal';
import { CashManualReconciliationTable } from './CashManualReconciliationTable';
import { CashOperationDetailModal } from './CashOperationDetailModal';
import { CashPdvOrdersPanel } from './CashPdvOrdersPanel';
import { CashSuggestionCard } from './CashSuggestionCard';
import { BrlCurrencyInput } from '../ui/BrlCurrencyInput';
import { formatCentsAsBrlInput } from '../../utils/currencyInputMask.mjs';
import {
  CashMirrorRowDetailPanel,
  CashSystemCategoryTarget
} from './CashMirrorRowDetailPanel';

type TabKey = 'espelho' | 'pedidos' | 'tabela' | 'sugestoes' | 'faltam' | 'sobram' | 'auditoria' | 'ia';

interface CashReconciliationWorkbenchProps {
  result: CashReconciliationResult;
  manualInputs: CashManualInputs;
  selectedMirrorKey?: string | null;
  onSelectMirrorKey?: (key: string | null) => void;
  onUpdateManualInputs: (patch: Partial<CashManualInputs>) => void;
  onConfirmSuggestion: (suggestionId: string) => void;
  onRejectSuggestion: (suggestionId: string) => void;
  onManualLink: (systemIds: string[], realIds: string[], note?: string) => void;
  onIgnoreItem: (side: 'system' | 'real', id: string) => void;
  onReclassifySystemItem: (systemId: string, targetCategory: CashSystemCategoryTarget | null) => void;
  onReclassifySystemItems?: (systemIds: string[], targetCategory: CashSystemCategoryTarget) => void;
  agendaItems?: CashPendingAgendaItem[];
  onOpenScheduleAgenda?: (draft?: CashAgendaInitialDraft) => void;
  onScheduleAgendaFromItem?: (item: CashReconciliationItem) => void;
  onSettleCrossDayAgendaMatch?: (agendaItem: CashPendingAgendaItem, bankItem: CashReconciliationItem) => void;
  onOpenAgendaItem?: (itemId: string, quickSettle?: boolean) => void;
  manualResolutionsCount?: number;
  onUndoLastResolution?: () => void;
  rules: CashRuleRow[];
  savedPasswords?: SavedCashFilePassword[];
  onDeleteSavedPassword?: (patternKey: string, ruleId?: string) => Promise<void>;
  onCreateRule: (rule: {
    rule_type: CashRuleRow['rule_type'];
    pattern: string;
    target_value: string;
    source_origin?: CashRuleRow['source_origin'];
    notes?: string;
  }) => Promise<void>;
  onToggleRule: (ruleId: string, isActive: boolean) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
  aiAnalysis: CashAiAnalysis | null;
  isAnalyzingAi: boolean;
  onRunAiAnalysis: (question?: string) => void;
}

const parseInputToCents = parseUiMoneyInputToCents;

function centsToInputStr(cents: number | null | undefined): string {
  return formatCentsAsBrlInput(cents);
}

export function CashReconciliationWorkbench({
  result,
  manualInputs,
  selectedMirrorKey: controlledMirrorKey,
  onSelectMirrorKey,
  onUpdateManualInputs,
  onConfirmSuggestion,
  onRejectSuggestion,
  onManualLink,
  onIgnoreItem,
  onReclassifySystemItem,
  onReclassifySystemItems,
  agendaItems = [],
  onOpenScheduleAgenda,
  onScheduleAgendaFromItem,
  onSettleCrossDayAgendaMatch,
  onOpenAgendaItem,
  manualResolutionsCount = 0,
  onUndoLastResolution,
  rules,
  savedPasswords = [],
  onDeleteSavedPassword,
  onCreateRule,
  onToggleRule,
  onDeleteRule,
  aiAnalysis,
  isAnalyzingAi,
  onRunAiAnalysis
}: CashReconciliationWorkbenchProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('espelho');
  const [internalMirrorKey, setInternalMirrorKey] = useState<string | null>(null);
  const expandedMirrorKey = controlledMirrorKey !== undefined ? controlledMirrorKey : internalMirrorKey;
  const setExpandedMirrorKey = (key: string | null) => {
    if (onSelectMirrorKey) onSelectMirrorKey(key);
    else setInternalMirrorKey(key);
  };
  const [showZeroMirrorRows, setShowZeroMirrorRows] = useState(false);
  const [drawerDetailTab, setDrawerDetailTab] = useState<DrawerOutflowModalTab | null>(null);
  const [inspectedOp, setInspectedOp] = useState<{
    item: CashReconciliationItem;
    paired: CashReconciliationItem[];
  } | null>(null);
  const [editingMirrorKey, setEditingMirrorKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMissingId, setSelectedMissingId] = useState<string | null>(null);
  const [selectedExtraId, setSelectedExtraId] = useState<string | null>(null);
  const [showNonPdv, setShowNonPdv] = useState(false);
  const [showOutOfPeriod, setShowOutOfPeriod] = useState(false);

  // Estado para IA & Nova Regra da Fórmula 1
  const [aiQuestion, setAiQuestion] = useState('');
  const [newRuleType, setNewRuleType] = useState<CashRuleRow['rule_type']>('normalize_admin');
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleTarget, setNewRuleTarget] = useState('pix');
  const [newRuleNotes, setNewRuleNotes] = useState('');

  // Estado para Justificativas manuais de gaveta (saídas/entradas sem lançamento no PDV)
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [adjDirection, setAdjDirection] = useState<'outflow' | 'inflow'>('outflow');
  const [adjDescription, setAdjDescription] = useState('');
  const [adjAmountText, setAdjAmountText] = useState('');
  const [adjOperator, setAdjOperator] = useState('');
  const [adjFormError, setAdjFormError] = useState('');

  const [showDrawerAdjustments, setShowDrawerAdjustments] = useState<boolean>(() =>
    Boolean(
      (manualInputs.outrasSaidasOverrideCents ?? 0) > 0 ||
        (manualInputs.outrasEntradasOverrideCents ?? 0) > 0 ||
        manualInputs.saidasPagamentosOverrideCents != null ||
        (manualInputs.fundoNoiteOverrideCents ?? 0) > 0
    )
  );
  const [notesText, setNotesText] = useState<string>(() => manualInputs.notes || '');
  const notesTextRef = useRef(notesText);
  const notesDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  notesTextRef.current = notesText;

  useEffect(() => {
    const incomingNotes = manualInputs.notes || '';
    if (notesTextRef.current !== incomingNotes && notesDebounceTimerRef.current === null) {
      setNotesText(incomingNotes);
    }
  }, [manualInputs.notes]);

  useEffect(() => {
    return () => {
      if (notesDebounceTimerRef.current !== null) {
        clearTimeout(notesDebounceTimerRef.current);
      }
    };
  }, []);

  const queryLower = searchTerm.trim().toLowerCase();

  const filteredMissing = useMemo(() => {
    const list: CashReconciliationItem[] = result.missingInBank || [];
    if (!queryLower) return list;
    return list.filter((it) =>
      `${it.description} ${it.referenceCode} ${it.operatorName} ${it.timeStr} ${(it.amountCents / 100).toFixed(2)}`
        .toLowerCase()
        .includes(queryLower)
    );
  }, [result.missingInBank, queryLower]);

  const filteredExtra = useMemo(() => {
    const list: CashReconciliationItem[] = result.extraInBank || [];
    if (!queryLower) return list;
    return list.filter((it) =>
      `${it.description} ${it.referenceCode} ${it.source} ${it.timeStr} ${(it.amountCents / 100).toFixed(2)}`
        .toLowerCase()
        .includes(queryLower)
    );
  }, [result.extraInBank, queryLower]);

  const pairedByItemId = useMemo(
    () => buildPairedItemsByIdMap(result.matchedPairs || []) as Map<string, CashReconciliationItem[]>,
    [result.matchedPairs]
  );

  const pdvOrdersCount = useMemo(
    () => (buildPdvOrdersCatalog(result) as { orders: unknown[] }).orders.length,
    [result]
  );

  const tabs: Array<{ key: TabKey; label: string; count?: number; highlight?: string }> = [
    { key: 'espelho', label: 'Espelho RelConferencia' },
    {
      key: 'pedidos',
      label: 'Pedidos PDV',
      count: pdvOrdersCount
    },
    {
      key: 'tabela',
      label: 'Tabela Conciliação',
      count: (result.missingInBank?.length || 0) + (result.extraInBank?.length || 0),
      highlight:
        (result.missingInBank?.length || 0) + (result.extraInBank?.length || 0) > 0 ? 'cyan' : undefined
    },
    {
      key: 'sugestoes',
      label: 'Sugestões',
      count: result.suggestions?.length || 0,
      highlight: (result.suggestions?.length || 0) > 0 ? 'amber' : undefined
    },
    {
      key: 'faltam',
      label: 'Vendas s/ Receb. (PDV)',
      count: result.missingInBank?.length || 0,
      highlight: (result.missingInBank?.length || 0) > 0 ? 'rose' : undefined
    },
    {
      key: 'sobram',
      label: 'Receb. s/ Venda (Banco)',
      count: result.extraInBank?.length || 0,
      highlight: (result.extraInBank?.length || 0) > 0 ? 'indigo' : undefined
    },
    { key: 'auditoria', label: 'Auditoria & Taxas' },
    { key: 'ia', label: 'Auditor IA & Fórmula 1' }
  ];

  const manualAdjustments = useMemo(
    () => (Array.isArray(manualInputs.manualCashAdjustments) ? manualInputs.manualCashAdjustments : []),
    [manualInputs.manualCashAdjustments]
  );

  const handleAddCashAdjustment = () => {
    const desc = adjDescription.trim();
    const amountCents = parseInputToCents(adjAmountText);
    if (!desc) {
      setAdjFormError('Informe a justificativa (ex.: Bolo da Marcela).');
      return;
    }
    if (!amountCents || amountCents <= 0) {
      setAdjFormError('Informe um valor maior que R$ 0,00.');
      return;
    }
    const operator = adjOperator.trim();
    const nextList = [
      ...manualAdjustments,
      {
        id: `adj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        direction: adjDirection,
        description: desc,
        amountCents,
        ...(operator ? { operator } : {}),
        createdAt: new Date().toISOString()
      }
    ];
    onUpdateManualInputs({ manualCashAdjustments: nextList });
    setAdjDescription('');
    setAdjAmountText('');
    setAdjOperator('');
    setAdjFormError('');
    setShowAdjustmentForm(false);
  };

  const handleRemoveCashAdjustment = (adjId: string) => {
    const nextList = manualAdjustments.filter((a) => a.id !== adjId);
    onUpdateManualInputs({ manualCashAdjustments: nextList });
  };

  const drawer = result.cashDrawerSummary || {};
  const metrics = result.financialMetrics || {};
  const cashRow = (result.mirrorRows || []).find((r) => r.key === 'saldo_dinheiro') || null;
  const dateBadge = formatDateHeaderBadge(result.referenceDate, result.periodEnd || result.referenceDate);
  const mirrorVisibility = useMemo(
    () => filterVisibleMirrorRows(result.mirrorRows || [], manualInputs.categoryRealOverrides || {}, showZeroMirrorRows),
    [result.mirrorRows, manualInputs.categoryRealOverrides, showZeroMirrorRows]
  );

  return (
    <div className="rounded-3xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-xl shadow-sm overflow-hidden">
      {/* Navegação por Abas */}
      <div className="border-b border-slate-200/80 dark:border-[#2a3942] px-3 sm:px-5 pt-3 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1.5">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3.5 py-2.5 text-xs font-bold whitespace-nowrap rounded-t-xl border-b-2 transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'border-[#00a884] text-[#00a884] bg-[#00a884]/5'
                    : 'border-transparent text-slate-600 dark:text-[#8696a0] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.key === 'tabela' && <Table2 size={13} className="shrink-0" />}
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                      tab.highlight === 'amber'
                        ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        : tab.highlight === 'rose'
                          ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                          : tab.highlight === 'indigo'
                            ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                            : tab.highlight === 'cyan'
                              ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300'
                              : 'bg-slate-200 dark:bg-[#2a3942] text-slate-600 dark:text-[#aebac1]'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dateBadge && (
            <span className="mb-1.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#00a884]/15 border border-[#00a884]/35 text-[11px] font-black text-[#008f6f] dark:text-[#00e5a8] whitespace-nowrap">
              <Calendar size={12} /> Caixa: {dateBadge}
            </span>
          )}
          {manualResolutionsCount > 0 && onUndoLastResolution && (
            <button
              type="button"
              onClick={onUndoLastResolution}
              className="mb-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1 shrink-0 whitespace-nowrap active:scale-95 transition-all"
              title="Desfazer a última conciliação ou justificativa confirmada nesta conferência"
            >
              <RotateCcw size={12} /> Desfazer Último ({manualResolutionsCount})
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo das Abas */}
      <div className="p-4 sm:p-6">
        {/* ABA 1: ESPELHO RELCONFERENCIA */}
        {activeTab === 'espelho' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Entrada Manual de Dinheiro Contado & Sangria */}
              <div className="lg:col-span-1 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Fechamento Físico da Gaveta
                </h4>
                <div className="space-y-2 text-xs text-slate-600 dark:text-[#aebac1]">
                  <div className="flex justify-between gap-2">
                    <span>Fundo de Caixa Manhã:</span>
                    <strong className="tabular-nums whitespace-nowrap shrink-0">{formatCents(drawer.fundoManhaCents)}</strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>(+) Vendas em Dinheiro PDV:</span>
                    <strong className="tabular-nums whitespace-nowrap shrink-0">{formatCents(drawer.vendaDinheiroCents)}</strong>
                  </div>
                  {(drawer.fundoNoiteCents || 0) > 0 && (
                    <div className="flex justify-between gap-2">
                      <span>(+) Fundo de Caixa Noite:</span>
                      <strong className="tabular-nums whitespace-nowrap shrink-0">{formatCents(drawer.fundoNoiteCents)}</strong>
                    </div>
                  )}
                  {(drawer.outrasEntradasCents || 0) > 0 && (
                    <div className="flex justify-between gap-2">
                      <span>(+) Outras Entradas:</span>
                      <strong className="tabular-nums whitespace-nowrap shrink-0">{formatCents(drawer.outrasEntradasCents)}</strong>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setDrawerDetailTab('pagamentos')}
                    title="Clique para detalhar todas as baixas, vales e contas pagas pela gaveta"
                    className="w-full flex justify-between items-center gap-2 text-left rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-rose-500/10 transition-colors group"
                  >
                    <span className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 group-hover:text-rose-500">
                      (-) Saídas Pagamentos (Vales/Contas):
                      <ChevronRight size={12} className="opacity-70 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                    <strong className="tabular-nums text-rose-500 whitespace-nowrap shrink-0">{`-${formatCents(drawer.saidasPagamentosCents)}`}</strong>
                  </button>
                  {(drawer.sangriaIntermediariaCents || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setDrawerDetailTab('sangria')}
                      title="Sangria realizada durante o turno (já abatida do Saldo Sistema, sem duplicar na CX. RET)"
                      className="w-full flex justify-between items-center gap-2 text-left rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-amber-500/10 transition-colors group"
                    >
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 underline decoration-dotted underline-offset-2">
                        (-) Sangria Intermediária (Turno):
                        <ChevronRight size={12} className="opacity-70 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                      <strong className="tabular-nums text-amber-600 dark:text-amber-400 whitespace-nowrap shrink-0">{`-${formatCents(drawer.sangriaIntermediariaCents)}`}</strong>
                    </button>
                  )}
                  {(drawer.outrasSaidasCents || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setDrawerDetailTab('pagamentos')}
                      title="Clique para ver justificativas e outras saídas da gaveta"
                      className="w-full flex justify-between items-center gap-2 text-left rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-rose-500/10 transition-colors group"
                    >
                      <span className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2">
                        (-) Outras Saídas (Não lançadas):
                        <ChevronRight size={12} className="opacity-70" />
                      </span>
                      <strong className="tabular-nums text-rose-500 whitespace-nowrap shrink-0">{`-${formatCents(drawer.outrasSaidasCents)}`}</strong>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDrawerDetailTab('sangria')}
                    title="Clique para detalhar Sangria do fechamento (CX. RET) e sangrias do turno"
                    className="w-full flex justify-between items-center gap-2 text-left rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-rose-500/10 transition-colors group"
                  >
                    <span className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 group-hover:text-rose-500">
                      (-) Sangria do Turno{(drawer.sangriaIntermediariaCents || 0) > 0 ? ' (CX. RET)' : ''}:
                      <ChevronRight size={12} className="opacity-70 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                    <strong className="tabular-nums text-rose-500 whitespace-nowrap shrink-0">{`-${formatCents(drawer.sangriaCents)}`}</strong>
                  </button>
                  <div className="pt-1.5 border-t border-emerald-500/20 flex justify-between gap-2 font-bold text-slate-900 dark:text-white">
                    <span>Esperado na Gaveta:</span>
                    <span className="tabular-nums whitespace-nowrap shrink-0">{formatCents(drawer.expectedAfterSangriaCents)}</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-[#d1d7db]">
                      Dinheiro Contado na Gaveta (R$)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextOverrides = { ...(manualInputs.categoryRealOverrides || {}) };
                        if (nextOverrides.saldo_dinheiro !== undefined) delete nextOverrides.saldo_dinheiro;
                        onUpdateManualInputs({
                          cashCountedCents: 0,
                          cashDrawerZeroConfirmed: true,
                          categoryRealOverrides: nextOverrides
                        });
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all ${
                        manualInputs.cashDrawerZeroConfirmed && drawer.countedCents === 0
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white/90 dark:bg-[#111b21] border-slate-300 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1] hover:border-[#00a884]'
                      }`}
                      title="Confirmar que ficou R$ 0,00 na gaveta (somente valor da Sangria)"
                    >
                      Só Sangria (R$ 0,00)
                    </button>
                  </div>
                  <BrlCurrencyInput
                    valueCents={manualInputs.cashDrawerZeroConfirmed ? 0 : (manualInputs.cashCountedCents ?? null)}
                    onChangeCents={(parsed) => {
                      const nextOverrides = { ...(manualInputs.categoryRealOverrides || {}) };
                      if (nextOverrides.saldo_dinheiro !== undefined) {
                        delete nextOverrides.saldo_dinheiro;
                        onUpdateManualInputs({
                          cashCountedCents: parsed,
                          cashDrawerZeroConfirmed: false,
                          categoryRealOverrides: nextOverrides
                        });
                      } else {
                        onUpdateManualInputs({
                          cashCountedCents: parsed,
                          cashDrawerZeroConfirmed: false
                        });
                      }
                    }}
                    placeholder="0,00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-[#d1d7db] mb-1">
                    Ajuste de Sangria (R$, opcional)
                  </label>
                  <BrlCurrencyInput
                    valueCents={manualInputs.sangriaOverrideCents ?? null}
                    onChangeCents={(parsed) => onUpdateManualInputs({ sangriaOverrideCents: parsed })}
                    placeholder={`Padrão do TXT: ${centsToInputStr(drawer.sangriaCents) || '0,00'}`}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  />
                  {(drawer.sangriaIntermediariaCents || 0) > 0 && (
                    <p className="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      Refere-se à retirada final CX. RET. A sangria intermediária ({formatCents(drawer.sangriaIntermediariaCents)}) já foi descontada acima.
                    </p>
                  )}
                </div>

                {/* Justificativas Manuais de Gaveta (ex.: saídas sem lançamento no PDV) */}
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block text-[11px] font-black text-amber-800 dark:text-amber-300">
                        Justificativas de Gaveta ({manualAdjustments.length})
                      </span>
                      <span className="block text-[10px] text-slate-500 dark:text-[#8696a0]">
                        Saídas ou reforços não lançados no PDV (ex.: Bolo da Marcela ou cupom pendente)
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {onOpenScheduleAgenda && (
                        <button
                          type="button"
                          onClick={() => {
                            const gapCents =
                              Math.abs(Number(cashRow?.diffCents || 0)) > 100
                                ? Math.abs(Number(cashRow?.diffCents || 0))
                                : Math.max(0, Number(drawer.expectedAfterSangriaCents || 0));
                            onOpenScheduleAgenda({
                              kind: 'missing_receipt',
                              amountCents: gapCents,
                              originDate: result.referenceDate,
                              title: 'Nota / Cupom Fiscal Pendente (Gaveta)',
                              description:
                                'Falta de dinheiro na gaveta aguardando entrega de nota ou cupom fiscal de compra para registrar depois.',
                              operatorName: result.operatorName || '',
                              sourceCategory: 'dinheiro'
                            });
                          }}
                          className="px-2 py-1 rounded-lg border border-amber-500/45 bg-amber-500/15 hover:bg-amber-500 text-amber-700 hover:text-white dark:text-amber-300 text-[10px] font-black flex items-center gap-1 transition-all"
                          title="Agendar falta da gaveta como Nota/Cupom Fiscal pendente para registrar depois"
                        >
                          <CalendarClock size={11} /> Nota Depois
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setAdjFormError('');
                          setShowAdjustmentForm((v) => !v);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#00a884] hover:bg-[#008f6f] text-white text-[10.5px] font-bold flex items-center gap-1 transition-all active:scale-95"
                      >
                        <Plus size={12} /> {showAdjustmentForm ? 'Fechar' : 'Justificar'}
                      </button>
                    </div>
                  </div>

                  {(() => {
                    const openReceipts = (agendaItems || []).filter(
                      (ag) => ag.status === 'waiting' && ag.kind === 'missing_receipt'
                    );
                    if (openReceipts.length === 0) return null;
                    return (
                      <div className="space-y-1 pt-0.5">
                        {openReceipts.slice(0, 3).map((rec) => (
                          <div
                            key={rec.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-orange-500/35 bg-orange-500/10 px-2.5 py-1.5 text-[10.5px]"
                          >
                            <span className="min-w-0 truncate font-semibold text-orange-900 dark:text-orange-200 flex items-center gap-1">
                              <Receipt size={11} className="shrink-0" />
                              <span className="truncate">{rec.title} ({formatCents(rec.amountCents)})</span>
                            </span>
                            {onOpenAgendaItem && (
                              <button
                                type="button"
                                onClick={() => onOpenAgendaItem(rec.id, true)}
                                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black shrink-0"
                              >
                                Chegou Nota!
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {manualAdjustments.length > 0 && (
                    <div className="space-y-1.5">
                      {manualAdjustments.map((adj) => {
                        const isInflow = adj.direction === 'inflow';
                        return (
                          <div
                            key={adj.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#111b21] px-2.5 py-1.5 text-[11px]"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0 ${
                                    isInflow
                                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                  }`}
                                >
                                  {isInflow ? 'Entrada +' : 'Saída -'}
                                </span>
                                <span className="font-bold text-slate-800 dark:text-[#e9edef] truncate">
                                  {adj.description}
                                </span>
                              </div>
                              {adj.operator && (
                                <span className="block text-[10px] text-slate-500 dark:text-[#8696a0] truncate mt-0.5">
                                  Resp.: {adj.operator}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <strong
                                className={`tabular-nums whitespace-nowrap ${
                                  isInflow ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                                }`}
                              >
                                {isInflow ? `+${formatCents(adj.amountCents)}` : `-${formatCents(adj.amountCents)}`}
                              </strong>
                              <button
                                type="button"
                                onClick={() => handleRemoveCashAdjustment(adj.id)}
                                title="Remover justificativa"
                                className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {showAdjustmentForm && (
                    <div className="rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] p-2.5 space-y-2">
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAdjDirection('outflow')}
                          className={`py-1.5 rounded-lg text-[10.5px] font-bold border transition-all ${
                            adjDirection === 'outflow'
                              ? 'border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              : 'border-slate-200 dark:border-[#2a3942] text-slate-500 dark:text-[#8696a0]'
                          }`}
                        >
                          Saída da Gaveta (-)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdjDirection('inflow')}
                          className={`py-1.5 rounded-lg text-[10.5px] font-bold border transition-all ${
                            adjDirection === 'inflow'
                              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'border-slate-200 dark:border-[#2a3942] text-slate-500 dark:text-[#8696a0]'
                          }`}
                        >
                          Entrada / Troco (+)
                        </button>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 dark:text-[#aebac1] mb-0.5">
                          Motivo / Justificativa *
                        </label>
                        <input
                          type="text"
                          value={adjDescription}
                          onChange={(e) => {
                            setAdjDescription(e.target.value);
                            if (adjFormError) setAdjFormError('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCashAdjustment();
                            }
                          }}
                          placeholder="Ex.: Bolo da Marcela (não lançado no PDV)"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 dark:text-[#aebac1] mb-0.5">
                            Valor (R$) *
                          </label>
                          <BrlCurrencyInput
                            valueText={adjAmountText}
                            onChangeText={(val) => {
                              setAdjAmountText(val);
                              if (adjFormError) setAdjFormError('');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCashAdjustment();
                              }
                            }}
                            placeholder="0,00"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 dark:text-[#aebac1] mb-0.5">
                            Responsável (opcional)
                          </label>
                          <input
                            type="text"
                            value={adjOperator}
                            onChange={(e) => setAdjOperator(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCashAdjustment();
                              }
                            }}
                            placeholder="Ex.: Marcela / Gerência"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                          />
                        </div>
                      </div>

                      {adjFormError && (
                        <p className="text-[10.5px] font-bold text-rose-500">{adjFormError}</p>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAdjustmentForm(false);
                            setAdjFormError('');
                          }}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#2a3942] text-[10.5px] font-bold text-slate-600 dark:text-[#aebac1]"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleAddCashAdjustment}
                          className="px-3 py-1 rounded-lg bg-[#00a884] hover:bg-[#008f6f] text-white text-[10.5px] font-bold"
                        >
                          Adicionar Justificativa
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-white/50 dark:bg-[#111b21]/40 p-2.5">
                  <button
                    type="button"
                    onClick={() => setShowDrawerAdjustments((v) => !v)}
                    className="w-full flex items-center justify-between text-[11px] font-bold text-emerald-700 dark:text-emerald-400"
                  >
                    <span>Ajustes PDV Base / Fundo Noite</span>
                    {showDrawerAdjustments ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showDrawerAdjustments && (
                    <div className="grid grid-cols-2 gap-2 mt-2.5">
                      {(
                        [
                          { key: 'outrasSaidasOverrideCents', label: 'Outras Saídas (R$)', placeholder: 'Ex: 55,00' },
                          { key: 'outrasEntradasOverrideCents', label: 'Outras Entradas (R$)', placeholder: '0,00' },
                          { key: 'saidasPagamentosOverrideCents', label: 'Saídas Pagam. (R$)', placeholder: centsToInputStr(drawer.saidasPagamentosCents) || '0,00' },
                          { key: 'fundoNoiteOverrideCents', label: 'Fundo Noite (R$)', placeholder: '0,00' }
                        ] as const
                      ).map((field) => (
                        <div key={field.key}>
                          <label className="block text-[10px] font-bold text-slate-600 dark:text-[#aebac1] mb-0.5 truncate">
                            {field.label}
                          </label>
                          <BrlCurrencyInput
                            valueCents={manualInputs[field.key] ?? null}
                            onChangeCents={(parsed) => {
                              onUpdateManualInputs({ [field.key]: parsed });
                            }}
                            placeholder={field.placeholder}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-[#d1d7db] mb-1">
                    Observações do Fechamento
                  </label>
                  <textarea
                    rows={2}
                    value={notesText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNotesText(val);
                      if (notesDebounceTimerRef.current !== null) {
                        clearTimeout(notesDebounceTimerRef.current);
                      }
                      notesDebounceTimerRef.current = setTimeout(() => {
                        notesDebounceTimerRef.current = null;
                        onUpdateManualInputs({ notes: val });
                      }, 250);
                    }}
                    onBlur={() => {
                      if (notesDebounceTimerRef.current !== null) {
                        clearTimeout(notesDebounceTimerRef.current);
                        notesDebounceTimerRef.current = null;
                      }
                      if ((manualInputs.notes || '') !== notesTextRef.current) {
                        onUpdateManualInputs({ notes: notesTextRef.current });
                      }
                    }}
                    placeholder="Ex.: Vale assinado, troco conferido..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  />
                </div>
              </div>

              {/* Tabela Espelho SISTEMA x REAL x DIF */}
              <div className="lg:col-span-2 space-y-2.5 overflow-x-auto">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-[#8696a0]">
                    Clique em uma linha para ver a conciliação, diferenças e ajustar a forma manualmente.
                  </span>
                  {mirrorVisibility.hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowZeroMirrorRows((v) => !v)}
                      className="text-[11px] font-bold text-[#00a884] hover:underline"
                    >
                      {showZeroMirrorRows
                        ? `Ocultar ${mirrorVisibility.hiddenCount} linha(s) zerada(s)`
                        : `Mostrar ${mirrorVisibility.hiddenCount} linha(s) zerada(s)`}
                    </button>
                  )}
                </div>

                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#2a3942] text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#8696a0]">
                      <th className="py-2.5 px-3 font-black">Descrição</th>
                      <th className="py-2.5 px-3 font-black text-right">Sistema</th>
                      <th className="py-2.5 px-3 font-black text-right">Real</th>
                      <th className="py-2.5 px-3 font-black text-right">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#2a3942]/70 text-xs sm:text-sm">
                    {mirrorVisibility.visibleRows.map((row: CashMirrorRow) => {
                      const diff = Number(row.diffCents || 0);
                      const isEditable = !row.isAuto;
                      const isSelected = expandedMirrorKey === row.key;
                      const overrideVal = manualInputs.categoryRealOverrides?.[row.key];
                      const effectiveCents =
                        editingMirrorKey === row.key
                          ? overrideVal !== undefined
                            ? overrideVal
                            : (row.hasRealInput ? row.realCents : null)
                          : (row.hasRealInput ? row.realCents : null);

                      return (
                        <tr
                          key={row.key}
                          onClick={() => setExpandedMirrorKey(isSelected ? null : row.key)}
                          title="Clique para abrir a conciliação em tela cheia e ajustar lançamentos desta categoria"
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#00a884]/8 dark:bg-[#00a884]/10'
                              : 'hover:bg-slate-50/70 dark:hover:bg-[#111b21]/50'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-800 dark:text-[#e9edef] flex items-center gap-1.5 flex-wrap">
                              <ChevronRight
                                size={14}
                                className={isSelected ? 'text-[#00a884] shrink-0' : 'text-slate-400 shrink-0'}
                              />
                              <span>{row.label}</span>
                              {row.isAuto && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9.5px] font-bold">
                                  AUTO
                                </span>
                              )}
                              {row.key === 'saldo_dinheiro' && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDrawerDetailTab('dinheiro');
                                  }}
                                  className="px-2 py-0.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-700 dark:text-emerald-300 text-[10px] font-black whitespace-nowrap"
                                  title="Abrir detalhamento completo do Saldo em Dinheiro, Vales e Sangrias"
                                >
                                  Detalhar composição
                                </button>
                              )}
                            </div>
                            {row.sourceNote && (
                              <p className="text-[10.5px] pl-5 text-slate-500 dark:text-[#8696a0]">{row.sourceNote}</p>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-700 dark:text-[#d1d7db] tabular-nums">
                            {formatCents(row.systemCents)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                            {isEditable ? (
                              <BrlCurrencyInput
                                valueCents={effectiveCents}
                                onClick={(e) => e.stopPropagation()}
                                onFocus={(e) => {
                                  setEditingMirrorKey(row.key);
                                  e.target.select();
                                }}
                                onChangeCents={(parsed) => {
                                  const nextOverrides = { ...(manualInputs.categoryRealOverrides || {}) };
                                  if (parsed === null) delete nextOverrides[row.key];
                                  else nextOverrides[row.key] = parsed;
                                  onUpdateManualInputs({
                                    categoryRealOverrides: nextOverrides,
                                    ...(row.key === 'pendentes' ? { pendentesTouched: true, pendentesAutoSynced: false } : {})
                                  });
                                }}
                                onBlur={() => {
                                  setEditingMirrorKey((curr) => (curr === row.key ? null : curr));
                                }}
                                placeholder="0,00"
                                aria-label={`Valor real de ${row.label}`}
                                className="w-24 sm:w-28 text-right px-2.5 py-1 rounded-lg border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                              />
                            ) : (
                              formatCents(row.realCents)
                            )}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-black tabular-nums ${
                              Math.abs(diff) <= 1
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : diff < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-indigo-600 dark:text-indigo-400'
                            }`}
                          >
                            {diff > 0 ? '+' : ''}{formatCents(diff)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-100/80 dark:bg-[#111b21] font-black text-sm">
                      <td className="py-3 px-3 text-slate-900 dark:text-white">TOTAL GERAL</td>
                      <td className="py-3 px-3 text-right text-slate-900 dark:text-white tabular-nums">
                        {formatCents(result.systemTotalCents)}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCents(result.realTotalCents)}
                      </td>
                      <td
                        className={`py-3 px-3 text-right tabular-nums ${
                          Math.abs(result.diffTotalCents) <= 100
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : result.diffTotalCents < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-indigo-600 dark:text-indigo-400'
                        }`}
                      >
                        {result.diffTotalCents > 0 ? '+' : ''}{formatCents(result.diffTotalCents)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {(() => {
                  const cashAnomalies = (result.suggestions || []).filter(
                    (s) =>
                      s.reasonType === 'cash_to_pending' ||
                      s.reasonType === 'surplus_to_cash' ||
                      s.reasonType === 'cash_similarity'
                  );
                  if (cashAnomalies.length === 0) return null;
                  const topSug = cashAnomalies[0];
                  const topSysIds = (topSug.systemIds?.length ? topSug.systemIds : (topSug.systemItems || []).map((s) => s.id)).filter(Boolean);
                  const canReclassifyTop = Boolean(topSysIds.length > 0 && topSug.suggestedTargetCategory);
                  return (
                    <div className="rounded-2xl border border-orange-500/35 bg-orange-500/10 p-3.5 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-800 dark:text-orange-200 text-[10px] font-black uppercase">
                            Suspeita de Dinheiro / Pendente ({cashAnomalies.length})
                          </span>
                          {typeof topSug.similarityPct === 'number' && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                              {topSug.similarityPct}% semelhante
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {canReclassifyTop && topSug.suggestedTargetCategory && (
                            <button
                              type="button"
                              onClick={() => {
                                if (onReclassifySystemItems) {
                                  onReclassifySystemItems(topSysIds, topSug.suggestedTargetCategory!);
                                } else {
                                  topSysIds.forEach((id) => onReclassifySystemItem(id, topSug.suggestedTargetCategory!));
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black active:scale-95 transition-all"
                            >
                              {topSug.suggestedTargetCategory === 'pendente'
                                ? 'Mudar p/ Pendente (1 Clique)'
                                : `Mudar p/ ${topSug.suggestedTargetCategory.toUpperCase()}`}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setActiveTab('sugestoes')}
                            className="px-2.5 py-1.5 rounded-lg border border-orange-500/35 bg-white/80 dark:bg-[#111b21] text-orange-700 dark:text-orange-300 text-[11px] font-bold"
                          >
                            Ver Sugestões
                          </button>
                        </div>
                      </div>
                      <p className="text-[11.5px] font-semibold text-slate-800 dark:text-[#e9edef] leading-relaxed">
                        {topSug.reasonText}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ABA: PEDIDOS DO PDV POR CANAL (DELIVERY, MESA, BALCAO, TOTEM, PENDENTE) */}
        {activeTab === 'pedidos' && (
          <CashPdvOrdersPanel
            result={result}
            onInspectOrder={(item, paired) => setInspectedOp({ item, paired })}
            onReclassifySystemItem={onReclassifySystemItem}
          />
        )}

        {/* ABA: TABELA MODERNA DE CONCILIAÇÃO MANUAL */}
        {activeTab === 'tabela' && (
          <CashManualReconciliationTable
            missingItems={result.missingInBank || []}
            extraItems={result.extraInBank || []}
            extraSystemPoolItems={buildLinkableSystemPool(result) as CashReconciliationItem[]}
            agendaItems={agendaItems}
            currentReferenceDate={result.referenceDate}
            onManualLink={onManualLink}
            onIgnoreItem={onIgnoreItem}
            onScheduleAgendaFromItem={onScheduleAgendaFromItem}
            onSettleCrossDayAgendaMatch={onSettleCrossDayAgendaMatch}
            onInspectOperation={(it) => setInspectedOp({ item: it, paired: pairedByItemId.get(it.id) || [] })}
          />
        )}

        {/* ABA 2: SUGESTÕES DE EQUIVALÊNCIA */}
        {activeTab === 'sugestoes' && (
          <div className="space-y-4">
            {(result.suggestions || []).length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                <p className="text-sm font-bold text-slate-800 dark:text-[#e9edef]">
                  Nenhuma sugestão pendente no momento!
                </p>
                <p className="text-xs text-slate-500 dark:text-[#8696a0]">
                  Caso reste algo em Faltam/Sobram, você pode vincular manualmente ou usar o Auditor IA.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {(result.suggestions || []).map((sug: CashSuggestion) => (
                  <CashSuggestionCard
                    key={sug.id}
                    suggestion={sug}
                    onConfirmSuggestion={onConfirmSuggestion}
                    onRejectSuggestion={onRejectSuggestion}
                    onReclassifySystemItems={(ids, cat) => {
                      if (onReclassifySystemItems) {
                        onReclassifySystemItems(ids, cat);
                      } else {
                        ids.forEach((id) => onReclassifySystemItem(id, cat));
                      }
                    }}
                    onInspectOperation={(item) =>
                      setInspectedOp({ item, paired: pairedByItemId.get(item.id) || [] })
                    }
                  />
                ))}
              </div>
            )}

            {/* Vinculação Manual Rápida (Falta <-> Sobra) */}
            {(result.missingInBank?.length > 0 && result.extraInBank?.length > 0) && (
              <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#111b21]/60 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-[#aebac1] flex items-center gap-1.5">
                    <Link2 size={14} className="text-[#00a884]" />
                    Vincular Manualmente (Vendas s/ recebimento × Recebimentos s/ venda)
                  </h4>
                  <button
                    type="button"
                    onClick={() => setActiveTab('tabela')}
                    className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-[11px] font-bold inline-flex items-center gap-1 active:scale-95 transition-all"
                  >
                    <Table2 size={12} /> Abrir em Tabela Lado a Lado
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 items-end">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Item Faltando no PDV</label>
                    <select
                      value={selectedMissingId || ''}
                      onChange={(e) => setSelectedMissingId(e.target.value || null)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-xs text-slate-800 dark:text-white"
                    >
                      <option value="">Selecione...</option>
                      {(result.missingInBank || []).map((m: CashReconciliationItem) => (
                        <option key={m.id} value={m.id}>
                          {formatCents(m.amountCents)} • {m.timeStr} • {m.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Sobra no Banco/Maquininha</label>
                    <select
                      value={selectedExtraId || ''}
                      onChange={(e) => setSelectedExtraId(e.target.value || null)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-xs text-slate-800 dark:text-white"
                    >
                      <option value="">Selecione...</option>
                      {(result.extraInBank || []).map((eItem: CashReconciliationItem) => (
                        <option key={eItem.id} value={eItem.id}>
                          {formatCents(eItem.amountCents)} • {eItem.timeStr} • {eItem.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={!selectedMissingId || !selectedExtraId}
                    onClick={() => {
                      if (selectedMissingId && selectedExtraId) {
                        onManualLink([selectedMissingId], [selectedExtraId]);
                        setSelectedMissingId(null);
                        setSelectedExtraId(null);
                      }
                    }}
                    className="px-4 py-2 min-h-[38px] rounded-xl bg-[#00a884] disabled:opacity-40 hover:bg-[#008f6f] text-white text-xs font-bold transition-all"
                  >
                    Vincular Selecionados
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA 3: FALTAM NO BANCO (VENDAS SEM RECEBIMENTO) */}
        {activeTab === 'faltam' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-500/25 bg-rose-500/5 px-4 py-3 text-xs">
              <div className="text-rose-900 dark:text-rose-200 space-y-0.5">
                <p className="font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  {RECONCILIATION_GLOSSARY.missing.title} ({filteredMissing.length})
                </p>
                <p className="text-[11px] font-semibold">{RECONCILIATION_GLOSSARY.missing.explanation}</p>
                <p className="text-[10.5px] opacity-85">{RECONCILIATION_GLOSSARY.missing.actionHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('tabela')}
                className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-[11px] font-bold inline-flex items-center gap-1.5 shrink-0 active:scale-95 transition-all"
              >
                <Table2 size={13} /> Conciliar em Tabela Lado a Lado
              </button>
            </div>

            {result.periodDiagnostics?.validationWarnings?.some((w) => w.code === 'missing_card_acquirers') && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <span>
                  As vendas em <strong>Cartão</strong> aparecem aqui porque os relatórios das maquininhas <strong>Rede</strong> e <strong>C6 Pay</strong> ainda não foram importados nesta conferência.
                </span>
              </div>
            )}

            <div className="relative max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar por valor, mesa, hora..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#111b21] text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>

            {filteredMissing.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-[#8696a0] py-6 text-center">
                Nenhuma venda digital sem recebimento localizado nos extratos/maquininhas.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                {filteredMissing.map((it: CashReconciliationItem) => (
                  <div key={it.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setInspectedOp({ item: it, paired: pairedByItemId.get(it.id) || [] })}
                          title="Clique no valor para ver quais itens compõem esta venda"
                          className="inline-flex items-center gap-1 text-sm font-black text-rose-600 dark:text-rose-400 hover:text-[#00a884] dark:hover:text-[#00a884] tabular-nums underline decoration-rose-500/45 hover:decoration-[#00a884] decoration-dotted underline-offset-4 active:scale-95 transition-all"
                        >
                          <span>{formatCents(it.amountCents)}</span>
                          <ShoppingBag size={12} className="opacity-75 shrink-0" />
                        </button>
                        <span className="text-xs font-bold text-slate-800 dark:text-[#e9edef]">{it.description}</span>
                        {it.metadata?.recebidoEmBranco && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                            Recebido em branco no PDV
                          </span>
                        )}
                      </div>
                      {it.metadata?.orderDetail?.items?.length ? (
                        <p className="text-[11px] text-indigo-600 dark:text-indigo-300 font-medium mt-0.5 truncate">
                          {it.metadata.orderDetail.items.length} item(ns):{' '}
                          {it.metadata.orderDetail.items.slice(0, 2).map((x) => `${x.qty}x ${x.displayName}`).join(', ')}
                        </p>
                      ) : null}
                      <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                        {formatDateBr(it.dateStr)} {it.timeStr} • Operador: {it.operatorName || 'Não informado'} • Terminal: {it.terminalName || '-'}
                      </p>
                      {it.metadata?.operationalAlerts?.length ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {it.metadata.operationalAlerts.map((al, alIdx) => (
                            <span
                              key={`${al.code}_${alIdx}`}
                              title={al.detail}
                              className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-700 dark:text-amber-300"
                            >
                              ⚠ {al.label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      {onScheduleAgendaFromItem && (
                        <button
                          type="button"
                          onClick={() => onScheduleAgendaFromItem(it)}
                          className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500 text-amber-700 hover:text-white dark:text-amber-300 text-[11px] font-black inline-flex items-center gap-1 transition-all"
                          title="Documentar falha no pagamento e deixar em espera na Agenda até o cliente pagar"
                        >
                          <CalendarClock size={12} /> Deixar Em Espera
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onIgnoreItem('system', it.id)}
                        className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2a3942] hover:bg-slate-100 dark:hover:bg-[#111b21] text-[11px] font-bold text-slate-600 dark:text-[#aebac1]"
                      >
                        Justificar / Ocultar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA 4: SOBRAM NO BANCO (RECEBIMENTOS SEM VENDA) */}
        {activeTab === 'sobram' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-500/25 bg-indigo-500/5 px-4 py-3 text-xs">
              <div className="text-indigo-900 dark:text-indigo-200 space-y-0.5">
                <p className="font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  {RECONCILIATION_GLOSSARY.extra.title} ({filteredExtra.length})
                </p>
                <p className="text-[11px] font-semibold">{RECONCILIATION_GLOSSARY.extra.explanation}</p>
                <p className="text-[10.5px] opacity-85">{RECONCILIATION_GLOSSARY.extra.actionHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('tabela')}
                className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-[11px] font-bold inline-flex items-center gap-1.5 shrink-0 active:scale-95 transition-all"
              >
                <Table2 size={13} /> Conciliar em Tabela Lado a Lado
              </button>
            </div>

            <div className="relative max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar recebimentos sem venda..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#111b21] text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>

            {filteredExtra.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-[#8696a0] py-6 text-center">
                Nenhum recebimento sem venda nos extratos/maquininhas.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                {filteredExtra.map((it: CashReconciliationItem) => {
                  const crossDayMatch = (
                    findCrossDayAgendaMatchesForExtras([it], agendaItems, result.referenceDate) as Array<{
                      agendaItem: CashPendingAgendaItem;
                    }>
                  )[0];

                  return (
                    <div key={it.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                            {formatCents(it.amountCents)}
                          </span>
                          <span className="text-xs font-bold text-slate-800 dark:text-[#e9edef]">{it.description}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#111b21] text-[10px] font-bold uppercase text-slate-500">
                            {it.source}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                          {formatDateBr(it.dateStr)} {it.timeStr} • Ref: {it.referenceCode || '-'} • Terminal: {it.terminalName || '-'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        {crossDayMatch && onSettleCrossDayAgendaMatch && (
                          <button
                            type="button"
                            onClick={() => onSettleCrossDayAgendaMatch(crossDayMatch.agendaItem, it)}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-black inline-flex items-center gap-1 shadow-sm animate-pulse"
                          >
                            <CalendarClock size={12} /> Quitar Pendência ({formatDateBr(crossDayMatch.agendaItem.originDate)})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onIgnoreItem('real', it.id)}
                          className="self-start sm:self-center px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#2a3942] hover:bg-slate-100 dark:hover:bg-[#111b21] text-[11px] font-bold text-slate-600 dark:text-[#aebac1]"
                        >
                          Ignorar (Não-PDV)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(result.nonPdvItems?.length || 0) > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#111b21]/50 p-3">
                <button
                  type="button"
                  onClick={() => setShowNonPdv(v => !v)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-700 dark:text-[#aebac1]"
                >
                  <span>Liquidações de Dias Anteriores & Créditos Não-PDV ({result.nonPdvItems.length})</span>
                  {showNonPdv ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {showNonPdv && (
                  <div className="mt-2.5 divide-y divide-slate-200/70 dark:divide-[#2a3942] text-xs">
                    {(result.nonPdvItems || []).map((n: CashReconciliationItem) => (
                      <div key={n.id} className="py-2 flex justify-between gap-2">
                        <span className="text-slate-600 dark:text-[#aebac1]">{n.timeStr} • {n.description}</span>
                        <strong className="tabular-nums text-slate-800 dark:text-white">{formatCents(n.amountCents)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(result.outOfPeriodItems?.length || 0) > 0 &&
              Boolean(result.periodDiagnostics?.validationWarnings?.some((w) => w.code === 'wrong_day_real_file')) && (
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-2.5">
                <button
                  type="button"
                  onClick={() => setShowOutOfPeriod(v => !v)}
                  className="w-full flex items-center justify-between gap-2 text-xs font-bold text-cyan-800 dark:text-cyan-300"
                >
                  <span className="flex items-center gap-1.5">
                    <Calendar size={14} className="shrink-0" />
                    Lançamentos de Outras Datas Isolados pelo Filtro ({result.outOfPeriodItems?.length || 0})
                  </span>
                  {showOutOfPeriod ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {(result.periodDiagnostics?.datesBreakdown?.length || 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {result.periodDiagnostics!.datesBreakdown.map((d) => (
                      <span
                        key={d.dateStr}
                        className="px-2 py-0.5 rounded-lg bg-white/80 dark:bg-[#111b21] border border-cyan-500/20 text-[10.5px] font-semibold text-slate-700 dark:text-[#d1d7db] tabular-nums"
                      >
                        {formatDateBr(d.dateStr)}: {d.count}x
                        {d.pixCents > 0 ? ` • PIX ${formatCents(d.pixCents)}` : ''}
                        {d.cardCents > 0 ? ` • Cartão ${formatCents(d.cardCents)}` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {showOutOfPeriod && (
                  <div className="mt-2 divide-y divide-cyan-500/15 text-xs max-h-72 overflow-y-auto">
                    {(result.outOfPeriodItems || []).slice(0, 120).map((it) => (
                      <div key={it.id} className="py-1.5 flex items-center justify-between gap-2">
                        <span className="text-slate-700 dark:text-[#d1d7db] truncate">
                          <strong>{formatDateBr(it.dateStr)}</strong> {it.timeStr} • [{it.source?.toUpperCase()}] {it.description}
                        </span>
                        <strong className="tabular-nums text-slate-900 dark:text-white shrink-0">
                          {formatCents(it.amountCents)}
                        </strong>
                      </div>
                    ))}
                    {(result.outOfPeriodItems?.length || 0) > 120 && (
                      <p className="pt-2 text-[11px] text-slate-500 dark:text-[#8696a0]">
                        Exibindo os primeiros 120 de {result.outOfPeriodItems?.length} registros fora do período.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ABA 5: AUDITORIA DETALHADA */}
        {activeTab === 'auditoria' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-black uppercase text-[11px] text-slate-600 dark:text-[#aebac1]">
                  Devedores — Vendas Pendentes ({metrics.pendingDebtors?.length || 0})
                </h4>
                {metrics.pendingDebtors?.length ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-black tabular-nums">
                    Soma TXT: {formatCents(metrics.pendingDebtors.reduce((acc, d) => acc + Number(d.amountCents || 0), 0))}
                  </span>
                ) : null}
              </div>
              {metrics.pendingDebtors?.length ? (
                <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                  {metrics.pendingDebtors.map((d, idx: number) => (
                    <div key={idx} className="py-1.5 flex justify-between">
                      <span className="font-medium text-slate-700 dark:text-[#e9edef]">{d.debtor}</span>
                      <strong className="tabular-nums text-amber-600 dark:text-amber-400">{formatCents(d.amountCents)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">
                  {(result.periodDiagnostics?.quarantinedSystemFiles || []).some((qf) => qf.fileType === 'fechamento_txt')
                    ? 'O arquivo final.txt anexado pertencia a outra data e foi bloqueado automaticamente. Importe o final.txt do dia atual para listar os devedores.'
                    : 'Sem pendentes detalhados do .txt.'}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-4 space-y-2">
              <h4 className="font-black uppercase text-[11px] text-slate-600 dark:text-[#aebac1]">
                Saídas Pagamentos & Vales ({drawer.saidasDetalhadas?.length || 0})
              </h4>
              {drawer.saidasDetalhadas?.length ? (
                <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                  {drawer.saidasDetalhadas.map((s, idx: number) => (
                    <div key={idx} className="py-1.5 flex justify-between">
                      <span className="text-slate-700 dark:text-[#e9edef]">{s.label}</span>
                      <strong className="tabular-nums text-rose-500">{formatCents(s.amountCents)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">Sem detalhamento de saídas do .txt.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-4 space-y-2">
              <h4 className="font-black uppercase text-[11px] text-slate-600 dark:text-[#aebac1]">
                Tentativas Não Autorizadas ({result.notAuthorizedItems?.length || 0})
              </h4>
              {result.notAuthorizedItems?.length ? (
                <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                  {result.notAuthorizedItems.map((na: CashReconciliationItem) => (
                    <div key={na.id} className="py-1.5 flex justify-between">
                      <span className="text-slate-600 dark:text-[#aebac1]">{na.timeStr} • {na.description}</span>
                      <strong className="tabular-nums text-slate-500">{formatCents(na.amountCents)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">Nenhuma tentativa negada nas maquininhas.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-4 space-y-2">
              <h4 className="font-black uppercase text-[11px] text-slate-600 dark:text-[#aebac1]">
                PIX C6 Pay Deduplicados c/ OFX ({result.deduplicatedItems?.length || 0})
              </h4>
              {result.deduplicatedItems?.length ? (
                <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                  {result.deduplicatedItems.map((dp: CashReconciliationItem) => (
                    <div key={dp.id} className="py-1.5 flex justify-between">
                      <span className="text-slate-600 dark:text-[#aebac1]">{dp.timeStr} • {dp.matchReason}</span>
                      <strong className="tabular-nums text-cyan-600 dark:text-cyan-400">{formatCents(dp.amountCents)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400">Nenhuma duplicidade detectada.</p>
              )}
            </div>

            {result.auditInsights && (
              <CashAuditInsightsSection insights={result.auditInsights} />
            )}
          </div>
        )}

        {/* ABA 6: AUDITOR IA & EVOLUÇÃO DA FÓRMULA 1 */}
        {activeTab === 'ia' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles size={16} className="text-indigo-500" />
                    Auditor IA — Rastreamento de Falhas & Evolução da Fórmula 1
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-[#aebac1] mt-0.5">
                    Quando houver sobras, faltas ou falhas de leitura de arquivo, a IA investiga as pendências e propõe novas regras permanentes para a Fórmula 1.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isAnalyzingAi}
                  onClick={() => onRunAiAnalysis(aiQuestion)}
                  className="px-4 py-2.5 min-h-[42px] rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shrink-0 active:scale-95 transition-all"
                >
                  {isAnalyzingAi ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Investigar Divergências com IA
                </button>
              </div>

              <input
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder="Dúvida opcional para a IA (ex.: Por que sobrou R$ 33,00 na C6 Pay?)"
                className="w-full px-3 py-2 rounded-xl border border-indigo-500/20 bg-white/90 dark:bg-[#111b21] text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />

              {aiAnalysis && (
                <div className="space-y-3 pt-2">
                  <div className="rounded-xl bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] p-3 text-xs text-slate-800 dark:text-[#e9edef]">
                    <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase text-[10px] mb-1">Diagnóstico Executivo</p>
                    <p>{aiAnalysis.summary}</p>
                  </div>

                  {aiAnalysis.hypotheses?.length > 0 && (
                    <div className="space-y-2">
                      {aiAnalysis.hypotheses.map((h, idx: number) => (
                        <div key={idx} className="rounded-xl bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">
                              {h.title} <span className="text-[10px] font-bold uppercase text-indigo-500">({h.confidence})</span>
                            </p>
                            <p className="text-slate-600 dark:text-[#aebac1] mt-0.5">{h.explanation}</p>
                          </div>
                          {h.systemItemIds?.length > 0 && h.realItemIds?.length > 0 && (
                            <button
                              type="button"
                              onClick={() => onManualLink(h.systemItemIds, h.realItemIds)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold shrink-0"
                            >
                              Aplicar Vínculo
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {aiAnalysis.fileDiagnoses?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-black uppercase text-amber-600 dark:text-amber-400">
                        Diagnóstico de Arquivos & Leitura
                      </p>
                      {aiAnalysis.fileDiagnoses.map((fd, idx: number) => (
                        <div key={idx} className="rounded-xl bg-amber-500/5 border border-amber-500/25 p-3 text-xs">
                          <p className="font-bold text-slate-900 dark:text-white">{fd.fileName}</p>
                          <p className="text-slate-700 dark:text-[#d1d7db] mt-0.5">{fd.issue}</p>
                          {fd.fixGuidance && (
                            <p className="text-amber-700 dark:text-amber-300 mt-1 font-medium">{fd.fixGuidance}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {aiAnalysis.formulaSuggestions?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-black uppercase text-emerald-600 dark:text-emerald-400">
                        Melhorias Sugeridas na Fórmula 1
                      </p>
                      {aiAnalysis.formulaSuggestions.map((s, idx: number) => (
                        <div key={idx} className="rounded-xl bg-emerald-500/5 border border-emerald-500/25 p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">
                              [{s.ruleType}] <code className="text-emerald-600 dark:text-emerald-400">{s.pattern}</code> → <strong>{s.targetValue}</strong>
                            </p>
                            <p className="text-slate-600 dark:text-[#aebac1] mt-0.5">{s.reason}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onCreateRule({
                              rule_type: s.ruleType,
                              pattern: s.pattern,
                              target_value: s.targetValue,
                              source_origin: 'ai_suggested',
                              notes: s.reason
                            })}
                            className="px-3 py-1.5 rounded-lg bg-[#00a884] hover:bg-[#008f6f] text-white font-bold shrink-0"
                          >
                            Aplicar na Fórmula 1
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Gerenciador de Regras da Fórmula 1 */}
            {savedPasswords.length > 0 && (
              <SavedFilePasswordsCard
                savedPasswords={savedPasswords}
                onDeleteSavedPassword={onDeleteSavedPassword}
              />
            )}

            <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-4 space-y-4">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#aebac1]">
                  Regras Customizadas da Fórmula 1 ({filterVisibleFormulaRules(rules).length})
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                  Regras salvas para esta empresa são aplicadas automaticamente em toda nova conferência.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Tipo</label>
                  <select
                    value={newRuleType}
                    onChange={(e) => setNewRuleType(e.target.value as CashRuleRow['rule_type'])}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-800 dark:text-white"
                  >
                    <option value="normalize_admin">Normalizar Administradora</option>
                    <option value="ignore_ofx_memo">Ignorar OFX / Não-PDV</option>
                    <option value="engine_setting">Parâmetro do Motor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Trecho / Chave</label>
                  <input
                    type="text"
                    value={newRulePattern}
                    onChange={(e) => setNewRulePattern(e.target.value)}
                    placeholder={newRuleType === 'engine_setting' ? 'amountToleranceCents' : 'Ex: VR ALIM ou LOCASERV'}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Destino / Valor</label>
                  <input
                    type="text"
                    value={newRuleTarget}
                    onChange={(e) => setNewRuleTarget(e.target.value)}
                    placeholder="pix | cartao | ticket | credito_nao_pdv"
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-800 dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  disabled={!newRulePattern.trim() || !newRuleTarget.trim()}
                  onClick={async () => {
                    await onCreateRule({
                      rule_type: newRuleType,
                      pattern: newRulePattern,
                      target_value: newRuleTarget,
                      source_origin: 'user',
                      notes: newRuleNotes
                    });
                    setNewRulePattern('');
                    setNewRuleNotes('');
                  }}
                  className="px-3 py-2 min-h-[36px] rounded-xl bg-[#00a884] disabled:opacity-40 hover:bg-[#008f6f] text-white text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Plus size={14} /> Salvar Regra
                </button>
              </div>

              {filterVisibleFormulaRules(rules).length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-[#2a3942] text-xs">
                  {filterVisibleFormulaRules(rules).map((r) => (
                    <div key={r.id} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-white">{r.pattern}</span>{' '}
                        <span className="text-slate-400">→</span>{' '}
                        <span className="font-bold text-[#00a884]">{r.target_value}</span>
                        <span className="ml-2 text-[10px] text-slate-400 uppercase">({r.rule_type} • {r.source_origin})</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onToggleRule(r.id, !r.is_active)}
                          className={`p-1.5 rounded-lg ${r.is_active ? 'text-emerald-500 bg-emerald-500/10' : 'text-slate-400 bg-slate-200 dark:bg-[#111b21]'}`}
                          title={r.is_active ? 'Regra ativa' : 'Regra desativada'}
                        >
                          <Power size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRule(r.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"
                          title="Excluir regra"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {drawerDetailTab !== null && (
        <CashDrawerOutflowsModal
          isOpen={drawerDetailTab !== null}
          initialTab={drawerDetailTab}
          drawer={drawer}
          cashRow={cashRow}
          dateBadge={dateBadge}
          outflowNotesByKey={manualInputs.outflowNotesByKey || {}}
          onSaveOutflowNote={(key, note) => {
            const nextNotes = { ...(manualInputs.outflowNotesByKey || {}) };
            if (note.trim()) nextNotes[key] = note.trim();
            else delete nextNotes[key];
            onUpdateManualInputs({ outflowNotesByKey: nextNotes });
          }}
          onOpenCashRowDetail={() => setExpandedMirrorKey('saldo_dinheiro')}
          onClose={() => setDrawerDetailTab(null)}
        />
      )}

      {expandedMirrorKey && (() => {
        const selectedRow = (result.mirrorRows || []).find((r) => r.key === expandedMirrorKey);
        if (!selectedRow) return null;
        return (
          <CashMirrorRowDetailPanel
            row={selectedRow}
            switchableRows={mirrorVisibility.visibleRows}
            result={result}
            onSelectMirrorKey={(k) => setExpandedMirrorKey(k)}
            onConfirmSuggestion={onConfirmSuggestion}
            onRejectSuggestion={onRejectSuggestion}
            onManualLink={onManualLink}
            onIgnoreItem={onIgnoreItem}
            onReclassifySystemItem={onReclassifySystemItem}
            onReclassifySystemItems={onReclassifySystemItems}
            onClose={() => setExpandedMirrorKey(null)}
          />
        );
      })()}
    </div>
  );
}

function SavedFilePasswordsCard({
  savedPasswords,
  onDeleteSavedPassword
}: {
  savedPasswords: SavedCashFilePassword[];
  onDeleteSavedPassword?: (patternKey: string, ruleId?: string) => Promise<void>;
}) {
  const [revealedPattern, setRevealedPattern] = useState<string | null>(null);

  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-3">
      <div>
        <h4 className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <KeyRound size={13} />
          Senhas Fixas Memorizadas de Planilhas ({savedPasswords.length})
        </h4>
        <p className="text-[11px] text-slate-500 dark:text-[#8696a0] mt-0.5">
          Estas senhas abrem automaticamente suas planilhas protegidas (como Relatorio-Vendas-C6Pay_Detalhado) nas próximas conferências desta empresa.
        </p>
      </div>

      <div className="divide-y divide-emerald-500/15 text-xs">
        {savedPasswords.map((sp) => {
          const isRevealed = revealedPattern === sp.pattern;
          return (
            <div key={sp.pattern} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-bold text-slate-800 dark:text-white block truncate">{sp.label}</span>
                <span className="text-[11px] font-mono text-slate-500 dark:text-[#8696a0]">
                  Senha: {isRevealed ? sp.password : '••••••••'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setRevealedPattern(isRevealed ? null : sp.pattern)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-white/60 dark:hover:bg-[#111b21]"
                  title={isRevealed ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                {onDeleteSavedPassword && (
                  <button
                    type="button"
                    onClick={() => onDeleteSavedPassword(sp.pattern, sp.ruleId)}
                    className="px-2 py-1 rounded-lg text-rose-500 hover:bg-rose-500/10 text-[11px] font-bold flex items-center gap-1"
                    title="Remover senha salva (será solicitada no próximo envio)"
                  >
                    <Trash2 size={12} /> Esquecer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CashAuditInsightsSection({ insights }: { insights: CashAuditInsights }) {
  return (
    <div className="space-y-4">
      {(insights.reopenedTables.length > 0 || insights.feeRemovals.length > 0 || insights.zeroPdvReceipts.length > 0) && (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4 space-y-3">
          <h4 className="font-black uppercase text-[11px] text-rose-600 dark:text-rose-400">
            Superpoderes de Auditoria — Alertas de Caixa & Risco Operacional
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {insights.reopenedTables.length > 0 && (
              <div className="rounded-xl bg-white dark:bg-[#111b21] border border-rose-500/20 p-3 space-y-2">
                <p className="font-black text-rose-600 dark:text-rose-400 text-[11px] uppercase">
                  Mesas Reabertas / Recebimentos Excluídos ({insights.reopenedTables.length})
                </p>
                {insights.reopenedTables.map((r, i) => {
                  const info = formatReopenedTableAudit(r);
                  return (
                    <div
                      key={i}
                      className="rounded-lg bg-rose-500/5 border border-rose-500/15 px-2.5 py-2 space-y-0.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                        <span className="font-bold text-rose-700 dark:text-rose-300">
                          {info.actionTitle}
                        </span>
                        <div className="flex items-center gap-1">
                          {info.eventTag && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-[9.5px] font-black uppercase text-rose-700 dark:text-rose-200">
                              {info.eventTag}
                            </span>
                          )}
                          {info.orderNumber && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#202c33] font-mono text-[10px] font-bold text-slate-700 dark:text-[#d1d7db]">
                              Cód. #{info.orderNumber}
                            </span>
                          )}
                        </div>
                      </div>
                      {info.eventDetail && (
                        <p className="text-[10.5px] text-slate-600 dark:text-[#aebac1]">
                          {info.eventDetail}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {insights.zeroPdvReceipts.length > 0 && (
              <div className="rounded-xl bg-white dark:bg-[#111b21] border border-amber-500/20 p-3 space-y-1.5">
                <p className="font-black text-amber-600 dark:text-amber-400 text-[11px] uppercase">
                  Recebimentos Zerados R$ 0,00 ({insights.zeroPdvReceipts.length})
                </p>
                {insights.zeroPdvReceipts.map((z, i) => (
                  <p key={i} className="text-slate-700 dark:text-[#d1d7db] text-[11px]">• {z.rawText}</p>
                ))}
              </div>
            )}
          </div>
          {insights.feeRemovals.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-[#111b21] border border-amber-500/20 p-3 space-y-1.5">
              <p className="font-black text-amber-600 dark:text-amber-400 text-[11px] uppercase">
                Remoções de Taxa de Serviço 10% ({insights.feeRemovals.length} item(ns))
              </p>
              <div className="divide-y divide-slate-100 dark:divide-[#2a3942] max-h-48 overflow-y-auto">
                {insights.feeRemovals.slice(0, 12).map((fr, i) => (
                  <div key={i} className="py-1 flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate">
                      <strong>{fr.module || 'MESA'} {fr.orderNumber}</strong> • {fr.product} ({fr.reason || '-'})
                    </span>
                    <span className="text-slate-500 shrink-0">Op: {fr.operator || '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(insights.byModule.length > 0 || insights.byWaiter.length > 0 || insights.topProducts.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {insights.topProducts.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-black uppercase text-[11px] text-slate-600 dark:text-[#aebac1]">
                  Top Produtos Vendidos ({insights.totalSoldItemsCount} itens)
                </h4>
                {insights.complementsCents > 0 && (
                  <span className="text-[10.5px] font-bold text-indigo-500">
                    + Complementos: {formatCents(insights.complementsCents)}
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                {insights.topProducts.slice(0, 8).map((p, i) => (
                  <div key={i} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-700 dark:text-[#d1d7db]">{p.qty}x {p.name}</span>
                    <strong className="tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">{formatCents(p.totalCents)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {insights.byWaiter.length > 0 && (
            <div className="rounded-2xl border border-slate-200 dark:border-[#2a3942] p-4 space-y-2">
              <h4 className="font-black uppercase text-[11px] text-slate-600 dark:text-[#aebac1]">
                Vendas por Garçom & Canal ({insights.byModule.map((m) => `${m.module}: ${formatCents(m.totalCents)}`).join(' • ')})
              </h4>
              <div className="divide-y divide-slate-100 dark:divide-[#2a3942]">
                {insights.byWaiter.slice(0, 8).map((w, i) => (
                  <div key={i} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-700 dark:text-[#d1d7db]">
                      {w.name} <span className="text-[10.5px] text-slate-400">({w.itemsCount} itens{w.feeRemovalsCount > 0 ? ` • ${w.feeRemovalsCount} sem taxa` : ''})</span>
                    </span>
                    <strong className="tabular-nums text-slate-900 dark:text-white shrink-0">{formatCents(w.totalCents)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <CashOperationDetailModal
        operationItem={inspectedOp?.item || null}
        pairedItems={inspectedOp?.paired || []}
        result={result}
        onReclassifySystemItem={onReclassifySystemItem}
        onScheduleAgendaFromItem={onScheduleAgendaFromItem}
        onClose={() => setInspectedOp(null)}
      />
    </div>
  );
}
