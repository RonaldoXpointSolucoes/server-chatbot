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
    [key: string]: unknown;
  };
}

export interface CashSuggestion {
  id: string;
  reasonType: 'swapped_method' | 'split_1_to_n' | 'grouped_n_to_1';
  reasonText: string;
  amountCents: number;
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
}

export interface CashDrawerSummary {
  fundoManhaCents?: number;
  vendaDinheiroCents?: number;
  fundoNoiteCents?: number;
  outrasEntradasCents?: number;
  sangriaCents?: number;
  saidasPagamentosCents?: number;
  outrasSaidasCents?: number;
  expectedTotalCents?: number;
  expectedAfterSangriaCents?: number;
  adjustedCashExpectedCents?: number;
  countedCents?: number | null;
  swappedToDigitalCents?: number;
  saidasDetalhadas?: Array<{ label: string; amountCents: number; isSangria: boolean }>;
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
}

export interface CashReconciliationResult {
  referenceDate: string;
  storeName?: string;
  operatorName?: string;
  status: 'balanced' | 'attention' | 'shortage' | 'surplus';
  healthScore: number;
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
  nonPdvItems?: CashReconciliationItem[];
  notAuthorizedItems?: CashReconciliationItem[];
  deduplicatedItems?: CashReconciliationItem[];
  debitAuditItems?: CashReconciliationItem[];
  financialMetrics: CashFinancialMetrics;
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
  fileSizeBytes?: number;
}

export interface CashManualInputs {
  cashCountedCents?: number | null;
  sangriaOverrideCents?: number | null;
  notes?: string;
  shiftLabel?: string;
  categoryRealOverrides?: Record<string, number>;
}

export interface CashResolutionAction {
  action: 'confirm_suggestion' | 'reject_suggestion' | 'manual_link' | 'ignore_item';
  suggestionId?: string;
  systemIds?: string[];
  realIds?: string[];
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

export function formatCents(cents: number | null | undefined): string {
  const value = Number(cents || 0) / 100;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
