export interface CashMirrorRow {
  key: string;
  label: string;
  systemCents: number;
  realCents: number;
  hasRealInput: boolean;
  diffCents: number;
  isAuto: boolean;
  sourceNote: string;
}

export interface CashOrderItemDetail {
  code?: string;
  product: string;
  displayName: string;
  comboParts?: string[];
  qty: number;
  unitCents: number;
  totalCents: number;
  serviceFeeCents?: number;
  discountCents?: number;
  bonusCents?: number;
  group?: string;
  subGroup?: string;
  timeStr?: string;
  waiter?: string;
  operator?: string;
  feeRemovalReason?: string;
  feeRemovalDetails?: string;
  feeRemovalOperator?: string;
  discountReason?: string;
  discountDetails?: string;
  discountOperator?: string;
}

export interface CashOperationOrderDetail {
  scopeKey: string;
  orderNumber: string;
  module: string;
  origin?: string;
  waiters: string[];
  operators: string[];
  splitCount: number;
  totalPaidCents: number;
  itemsSubtotalCents: number;
  serviceFeeCents: number;
  itemDiscountsCents: number;
  hasFeeRemoval?: boolean;
  hasDiscount?: boolean;
  items: CashOrderItemDetail[];
}

export interface LearnedBankRoutineEntry {
  bankKey: string;
  bankCode: string;
  bankLabel: string;
  acctLast4?: string;
  seenCount: number;
  lastSeenDate: string;
  enabled: boolean;
}

export interface LearnedReportRoutineEntry {
  fileType: string;
  seenCount: number;
  lastSeenDate: string;
  enabled: boolean;
}

export interface CompanyCashRoutineProfile {
  version: number;
  updatedAt: string;
  banks: Record<string, LearnedBankRoutineEntry>;
  reports: Record<string, LearnedReportRoutineEntry>;
}

export interface CashReportSpecStatus {
  fileType: string;
  label: string;
  shortLabel: string;
  priority: 'essential' | 'detail' | 'audit';
  hint: string;
  present: boolean;
  acceptedTypes?: string[];
  bankKey?: string;
  bankCode?: string;
  bankLabel?: string;
  acctLast4?: string;
  isLearnedBank?: boolean;
  isHabitual?: boolean;
  seenCount?: number;
  lastSeenDate?: string;
  enabled?: boolean;
}

export interface CashReportCompleteness {
  totalExpected: number;
  totalPresent: number;
  percent: number;
  isComplete: boolean;
  warnings: string[];
  hasLearnedRoutine?: boolean;
  habitualExpectedCount?: number;
  habitualPresentCount?: number;
  habitualMissingCount?: number;
  learnedBanks?: LearnedBankRoutineEntry[];
  system: {
    totalExpected: number;
    presentCount: number;
    items: CashReportSpecStatus[];
    present: CashReportSpecStatus[];
    missing: CashReportSpecStatus[];
  };
  bank: {
    totalExpected: number;
    presentCount: number;
    items: CashReportSpecStatus[];
    present: CashReportSpecStatus[];
    missing: CashReportSpecStatus[];
  };
}

export interface CashAuditInsights {
  totalSoldItemsCount: number;
  complementsCents: number;
  internalConsumptionCostCents: number;
  cancelledDetails: Array<{
    code?: string;
    product: string;
    qty: number;
    totalCents: number;
    table: string;
    timeStr?: string;
    waiter?: string;
    operator?: string;
    machineName?: string;
    turn?: string;
    reason?: string;
    reasonDetails?: string;
    group?: string;
  }>;
  discountDetails: Array<{
    source: string;
    orderNumber: string;
    module?: string;
    timeStr?: string;
    amountCents: number;
    reason?: string;
    details?: string;
    employee?: string;
  }>;
  feeRemovals: Array<{
    orderNumber: string;
    module?: string;
    product: string;
    totalCents: number;
    timeStr?: string;
    waiter?: string;
    reason?: string;
    details?: string;
    operator?: string;
  }>;
  reopenedTables: Array<{
    rawText: string;
    table?: string;
    orderNumber?: string;
    tableLabel?: string;
    actionTitle?: string;
    eventTag?: string;
    eventDetail?: string;
    auditHint?: string;
  }>;
  zeroPdvReceipts: Array<{
    rawText: string;
    table?: string;
    timeStr?: string;
    operatorName?: string;
  }>;
  topProducts: Array<{ name: string; qty: number; totalCents: number; category?: string }>;
  byWaiter: Array<{ name: string; itemsCount: number; totalCents: number; feeRemovalsCount: number }>;
  byModule: Array<{ module: string; itemsCount: number; totalCents: number }>;
  bySubGroup: Array<{ name: string; qty: number; totalCents: number }>;
}

export interface CashReconciliationItem {
  id: string;
  side: 'system' | 'real' | 'audit';
  source: string;
  category: string;
  subCategory: string;
  amountCents: number;
  netAmountCents?: number;
  feeCents?: number;
  dateStr: string;
  timeStr: string;
  secondsOfDay: number;
  referenceCode: string;
  description: string;
  terminalName: string;
  operatorName: string;
  matchStatus?: string;
  linkedOfxId?: string;
  matchReason?: string;
  metadata?: {
    recebidoEmBranco?: boolean;
    changeCents?: number;
    debtorName?: string;
    debtorCandidates?: string[];
    debtorMatchType?: 'exact_amount' | 'ambiguous_same_amount';
    orderDetail?: CashOperationOrderDetail;
    operationalAlerts?: Array<{
      code: 'reopened_table' | 'rapid_duplicate' | 'zero_receipt_on_table';
      severity: 'warning' | 'info';
      label: string;
      detail: string;
    }>;
    [key: string]: unknown;
  };
}

export interface CashSuggestion {
  id: string;
  reasonType:
    | 'swapped_method'
    | 'split_1_to_n'
    | 'grouped_n_to_1'
    | 'small_diff'
    | 'high_similarity'
    | 'cash_to_pending'
    | 'surplus_to_cash'
    | 'cash_similarity';
  reasonText: string;
  amountCents: number;
  diffCents?: number;
  similarityPct?: number;
  suggestedTargetCategory?: 'dinheiro' | 'cartao' | 'pix' | 'pendente';
  drawerTargetCents?: number;
  isDelivery?: boolean;
  systemIds: string[];
  realIds: string[];
  systemItems: CashReconciliationItem[];
  realItems: CashReconciliationItem[];
}

export interface CashMatchedPair {
  id: string;
  matchType: 'matched_exact' | 'matched_manual';
  reasonType: string;
  reasonText: string;
  systemItems: CashReconciliationItem[];
  realItems: CashReconciliationItem[];
  amountCents: number;
  diffCents?: number;
  note?: string;
}

export interface CashManualCashAdjustment {
  id: string;
  direction: 'outflow' | 'inflow';
  description: string;
  amountCents: number;
  operator?: string;
  createdAt?: string;
}

export interface CashDrawerSummary {
  fundoManhaCents?: number;
  vendaDinheiroCents?: number;
  fundoNoiteCents?: number;
  outrasEntradasCents?: number;
  sangriaCents?: number;
  sangriaIntermediariaCents?: number;
  sangriaTotalTxtCents?: number;
  relConfSaidasPagamentosCents?: number | null;
  relConfIncludesIntermediateSangria?: boolean;
  saidasPagamentosCents?: number;
  outrasSaidasCents?: number;
  expectedTotalCents?: number;
  expectedAfterSangriaCents?: number;
  adjustedCashExpectedCents?: number;
  countedCents?: number | null;
  swappedToDigitalCents?: number;
  manualOutflowsCents?: number;
  manualInflowsCents?: number;
  manualCashAdjustments?: CashManualCashAdjustment[];
  caixaCegoDinheiro?: {
    method: string;
    sistemaCents: number;
    informadoCents: number;
    diffCents: number;
  } | null;
  caixaCegoSangria?: {
    method: string;
    sistemaCents: number;
    informadoCents: number;
    diffCents: number;
  } | null;
  saidasDetalhadas?: Array<{
    label: string;
    amountCents: number;
    isSangria: boolean;
    kind?: 'pagamento_vale' | 'sangria_intermediaria' | 'sangria_fechamento' | 'justificativa';
    source?: string;
    includedInRelConfPagamentos?: boolean;
    isManualAdjustment?: boolean;
    direction?: 'outflow' | 'inflow';
    operator?: string;
  }>;
}

export interface CashFinancialMetrics {
  totalMdrFeeCents?: number;
  totalNetDigitalCents?: number;
  cancelledCount?: number;
  cancelledCents?: number;
  cancelledItems?: Array<{ table: string; item: string; qty: number }>;
  internalConsumptionCents?: number;
  discountsCents?: number;
  deliveryFeeCents?: number;
  serviceFeeCents?: number;
  pendingDebtors?: Array<{ debtor: string; amountCents: number }>;
  guestCount?: number;
  averageTicketCents?: number;
  pixBreakdown?: {
    ofxCents: number;
    ofxByBank: Array<{ bankKey: string; bankLabel: string; amountCents: number; count: number }>;
    redePixCents: number;
    c6PayPostCutoffCents: number;
    deduplicatedC6PayCents: number;
  };
  cardBreakdown?: {
    redeCardCents: number;
    c6PayCardCents: number;
  };
}

export interface CashValidationWarning {
  code:
    | 'multi_day_filtered'
    | 'wrong_day_real_file'
    | 'zero_value_date_file'
    | 'summary_acquirer_file'
    | 'missing_routine_report'
    | 'wrong_day_system_file'
    | 'pending_totals_mismatch'
    | 'pending_totals_adjusted'
    | 'cash_drawer_cross_mismatch'
    | 'digital_system_cross_mismatch'
    | 'multi_day_no_anchor'
    | 'missing_card_acquirers'
    | 'cash_drawer_txt_hint'
    | 'cash_drawer_uninformed'
    | 'pending_unconfirmed'
    | 'summary_file_warning';
  severity: 'info' | 'warning' | 'error';
  title: string;
  message: string;
}

export interface CashQuarantinedSystemFile {
  fileName: string;
  fileType: string;
  periodStart: string;
  periodEnd: string;
  periodBr: string;
  pendingCents: number;
  pendingCount: number;
  sangriaCents: number;
}

export interface CashCrossReportIntegrityChecks {
  pdvPendentesCents: number | null;
  relConfPendentesCents: number | null;
  caixaCegoPendentesCents: number | null;
  txtPendentesCents: number | null;
  txtDebtorsSumCents: number | null;
  txtDebtorsCount: number;
  pendentesMatchAcrossReports: boolean;
}

export interface CashSourcePeriodStat {
  fileName: string;
  fileType: string;
  periodStart: string;
  periodEnd: string;
  isSummaryReport?: boolean;
  totalRows: number;
  keptRows: number;
  keptValidCount?: number;
  keptAmountCents?: number;
  keptNonZeroOtherCount?: number;
  ignoredRows: number;
  ignoredPixCount: number;
  ignoredPixCents: number;
  ignoredCardCount: number;
  ignoredCardCents: number;
  ignoredOtherCount: number;
}

export interface CashPeriodDateBreakdown {
  dateStr: string;
  count: number;
  pixCount: number;
  pixCents: number;
  cardCount: number;
  cardCents: number;
  otherCount: number;
}

export interface CashPeriodDiagnostics {
  targetStartDate: string;
  targetEndDate: string;
  hasSystemPeriodAnchor: boolean;
  anchorSourceType: string;
  totalOutOfPeriodCount: number;
  outOfPeriodPixCount: number;
  outOfPeriodPixCents: number;
  outOfPeriodCardCount: number;
  outOfPeriodCardCents: number;
  outOfPeriodOtherCount: number;
  datesBreakdown: CashPeriodDateBreakdown[];
  sourcePeriodStats: CashSourcePeriodStat[];
  quarantinedSystemFiles?: CashQuarantinedSystemFile[];
  integrityChecks?: CashCrossReportIntegrityChecks;
  validationWarnings: CashValidationWarning[];
}

export interface CashForcedBalancedInput {
  enabled: boolean;
  reason?: string;
  forcedAt?: string;
  forcedBy?: string;
  rawHealthScoreBeforeForce?: number;
  rawDiffCents?: number;
}

export interface CashHealthBreakdown {
  rawHealthScore: number;
  diffPenaltyPts: number;
  structuralSugCount: number;
  structuralSugPenaltyPts: number;
  smallDiffSugCount: number;
  smallDiffSugPenaltyPts: number;
  missingCount: number;
  missingPenaltyPts: number;
  extraCount: number;
  extraPenaltyPts: number;
  absFocusDiffCents: number;
  baseVolumeCents: number;
  totalPenaltyPts: number;
}

export interface CashReconciliationResult {
  referenceDate: string;
  storeName?: string;
  operatorName?: string;
  status: 'balanced' | 'attention' | 'shortage' | 'surplus';
  healthScore: number;
  rawHealthScore?: number;
  isForcedBalanced?: boolean;
  forcedBalanced?: CashForcedBalancedInput | null;
  healthBreakdown?: CashHealthBreakdown;
  systemTotalCents: number;
  realTotalCents: number;
  diffTotalCents: number;
  digitalDiffCents?: number;
  mirrorRows: CashMirrorRow[];
  cashDrawerSummary: CashDrawerSummary;
  systemItems?: CashReconciliationItem[];
  realItems?: CashReconciliationItem[];
  matchedPairs?: CashMatchedPair[];
  suggestions?: CashSuggestion[];
  missingInBank?: CashReconciliationItem[];
  extraInBank?: CashReconciliationItem[];
  outOfPeriodItems?: Array<CashReconciliationItem & { sourceFileName?: string }>;
  nonPdvItems?: CashReconciliationItem[];
  notAuthorizedItems?: CashReconciliationItem[];
  deduplicatedItems?: CashReconciliationItem[];
  debitAuditItems?: CashReconciliationItem[];
  financialMetrics: CashFinancialMetrics;
  reportCompleteness?: CashReportCompleteness;
  periodDiagnostics?: CashPeriodDiagnostics;
  auditInsights?: CashAuditInsights;
}

export interface SavedCashFilePassword {
  pattern: string;
  key: string;
  label: string;
  password: string;
  ruleId?: string;
  fileType?: string;
  updatedAt?: string;
}

export interface ParsedCashFileResult {
  fileName: string;
  fileType: string;
  status: 'ok' | 'password_required' | 'error';
  errorMessage?: string;
  periodStart: string;
  periodEnd: string;
  warnings: string[];
  rows: unknown[];
  summary: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
  fileSizeBytes?: number;
}

export interface CashManualInputs {
  cashCountedCents?: number | null;
  sangriaOverrideCents?: number | null;
  fundoNoiteOverrideCents?: number | null;
  outrasEntradasOverrideCents?: number | null;
  saidasPagamentosOverrideCents?: number | null;
  outrasSaidasOverrideCents?: number | null;
  manualCashAdjustments?: CashManualCashAdjustment[];
  cashDrawerZeroConfirmed?: boolean;
  pendentesTouched?: boolean;
  pendentesAutoSynced?: boolean;
  outflowNotesByKey?: Record<string, string>;
  forcedBalanced?: CashForcedBalancedInput | null;
  notes?: string;
  shiftLabel?: string;
  categoryRealOverrides?: Record<string, number>;
}

export interface CashResolutionAction {
  action: 'confirm_suggestion' | 'reject_suggestion' | 'manual_link' | 'ignore_item' | 'reclassify_system';
  suggestionId?: string;
  systemIds?: string[];
  realIds?: string[];
  targetCategory?: 'dinheiro' | 'cartao' | 'pix' | 'pendente';
  note?: string;
}

export interface CashAiAnalysis {
  summary: string;
  hypotheses: Array<{
    title: string;
    systemItemIds: string[];
    realItemIds: string[];
    confidence: 'alta' | 'media' | 'baixa';
    explanation: string;
  }>;
  fileDiagnoses: Array<{ fileName: string; issue: string; fixGuidance: string }>;
  formulaSuggestions: Array<{
    ruleType: 'normalize_admin' | 'ignore_ofx_memo' | 'engine_setting';
    pattern: string;
    targetValue: string;
    reason: string;
  }>;
}

export type CashAgendaItemKind = 'payment_awaiting' | 'missing_receipt';
export type CashAgendaItemStatus = 'waiting' | 'resolved' | 'cancelled';

export interface CashAgendaAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  uploadedAt: string;
}

export interface CashAgendaHistoryLog {
  id: string;
  at: string;
  action: 'created' | 'contacted' | 'rescheduled' | 'resolved' | 'reopened' | 'note';
  text: string;
  author?: string;
}

export interface CashPendingAgendaItem {
  id: string;
  tenantId: string;
  kind: CashAgendaItemKind;
  status: CashAgendaItemStatus;
  amountCents: number;
  originDate: string;
  dueDate: string;
  title: string;
  description: string;
  customerOrSupplier: string;
  contactPhone?: string;
  operatorName?: string;
  sourceSessionId?: string | null;
  sourceItemId?: string | null;
  sourceCategory?: string;
  attachments?: CashAgendaAttachment[];
  history?: CashAgendaHistoryLog[];
  resolvedAt?: string | null;
  resolvedDate?: string | null;
  resolvedMethod?: 'pix' | 'cartao' | 'dinheiro' | 'transferencia' | 'nota_fiscal' | 'outros';
  resolvedSessionId?: string | null;
  resolvedBankItemId?: string | null;
  resolvedReceiptNumber?: string;
  resolvedNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export function formatCents(cents: number | null | undefined): string {
  const value = Number(cents || 0) / 100;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
