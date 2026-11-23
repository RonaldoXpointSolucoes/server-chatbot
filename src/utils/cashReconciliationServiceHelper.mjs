/**
 * Helpers puros de serialização, validação e agregação histórica para Conferência de Caixa.
 */
import { parseMoneyToCents } from './cashFileParsers.mjs';

export const SESSION_LIST_COLUMNS = [
  'id',
  'tenant_id',
  'reference_date',
  'shift_label',
  'store_name',
  'operator_name',
  'status',
  'health_score',
  'system_total_cents',
  'real_total_cents',
  'diff_cents',
  'cash_drawer_counted_cents',
  'cash_sangria_cents',
  'cash_notes',
  'created_by_email',
  'closed_at',
  'created_at',
  'updated_at'
].join(', ');

export function parseUiMoneyInputToCents(raw) {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === '-') return null;
  return parseMoneyToCents(trimmed);
}

export function isMissingCashTableError(error) {
  if (!error) return false;
  const code = String(error.code || '').toUpperCase();
  const msg = String(error.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist')
  );
}

export function buildSessionPersistencePayload({
  tenantId,
  userEmail = '',
  parsedFiles = [],
  result = {},
  manualInputs = {},
  manualResolutions = [],
  aiAnalysis = null,
  markClosed = false
}) {
  if (!tenantId || !String(tenantId).trim()) {
    throw new Error('tenantId é obrigatório para persistir a conferência de caixa.');
  }

  const cleanTenantId = String(tenantId).trim();
  const nowIso = new Date().toISOString();

  // Guarda snapshot compacto dos arquivos parseados para permitir reabrir e ajustar uma conferência salva
  const parsedFilesSnapshot = (parsedFiles || [])
    .filter(f => f && f.status === 'ok')
    .map(f => ({
      fileName: f.fileName,
      fileType: f.fileType,
      status: f.status,
      periodStart: f.periodStart || '',
      periodEnd: f.periodEnd || '',
      warnings: f.warnings || [],
      rows: f.rows || [],
      summary: f.summary || {}
    }));

  const sessionPayload = {
    tenant_id: cleanTenantId,
    reference_date: result.referenceDate || new Date().toISOString().slice(0, 10),
    shift_label: manualInputs.shiftLabel || 'Diário',
    store_name: result.storeName || null,
    operator_name: result.operatorName || null,
    status: result.status || 'draft',
    health_score: Number(result.healthScore ?? 0),
    system_total_cents: Math.round(Number(result.systemTotalCents || 0)),
    real_total_cents: Math.round(Number(result.realTotalCents || 0)),
    diff_cents: Math.round(Number(result.diffTotalCents || 0)),
    cash_drawer_counted_cents: manualInputs.cashCountedCents !== undefined && manualInputs.cashCountedCents !== null
      ? Math.round(Number(manualInputs.cashCountedCents))
      : null,
    cash_sangria_cents: Math.round(Number(result.cashDrawerSummary?.sangriaCents || 0)),
    cash_notes: manualInputs.notes || null,
    reconciled_summary: {
      mirrorRows: result.mirrorRows || [],
      cashDrawerSummary: result.cashDrawerSummary || {},
      financialMetrics: result.financialMetrics || {},
      reportCompleteness: result.reportCompleteness || null,
      auditInsights: result.auditInsights || null,
      manualInputs,
      manualResolutions,
      parsedFilesSnapshot
    },
    ai_last_analysis: aiAnalysis || null,
    created_by_email: userEmail || null,
    closed_at: markClosed ? nowIso : null
  };

  const filePayloads = (parsedFiles || []).map(f => ({
    tenant_id: cleanTenantId,
    file_name: f.fileName || 'arquivo',
    file_type: f.fileType || 'unknown',
    file_size_bytes: Number(f.fileSizeBytes || 0),
    period_start: f.periodStart || '',
    period_end: f.periodEnd || '',
    row_count: Array.isArray(f.rows) ? f.rows.length : 0,
    parse_status: f.status === 'ok' ? (f.warnings?.length ? 'warning' : 'ok') : 'error',
    parse_warnings: f.warnings || [],
    raw_summary: f.summary || {}
  }));

  const itemPayloads = [];
  const pushItem = (item, matchStatus, groupId = null, reason = null) => {
    itemPayloads.push({
      tenant_id: cleanTenantId,
      item_key: String(item.id || `${item.side}_${itemPayloads.length}`),
      side: item.side || 'system',
      source: item.source || 'pdv',
      category: item.category || 'outros',
      sub_category: item.subCategory || null,
      occurred_at: item.timeStr || null,
      amount_cents: Math.round(Number(item.amountCents || 0)),
      net_amount_cents: item.netAmountCents !== undefined && item.netAmountCents !== null ? Math.round(Number(item.netAmountCents)) : null,
      fee_cents: Math.round(Number(item.feeCents || 0)),
      reference_code: item.referenceCode || null,
      description: item.description || null,
      terminal_name: item.terminalName || null,
      operator_name: item.operatorName || null,
      match_status: matchStatus,
      match_group_id: groupId,
      match_reason: reason,
      metadata: item.metadata || {}
    });
  };

  for (const pair of result.matchedPairs || []) {
    for (const s of pair.systemItems || []) pushItem(s, pair.matchType || 'matched_exact', pair.id, pair.reasonText);
    for (const r of pair.realItems || []) pushItem(r, pair.matchType || 'matched_exact', pair.id, pair.reasonText);
  }
  for (const sug of result.suggestions || []) {
    for (const s of sug.systemItems || []) pushItem(s, 'suggested', sug.id, sug.reasonText);
    for (const r of sug.realItems || []) pushItem(r, 'suggested', sug.id, sug.reasonText);
  }
  for (const item of result.missingInBank || []) pushItem(item, 'unmatched_missing_in_bank');
  for (const item of result.extraInBank || []) pushItem(item, 'unmatched_extra_in_bank');
  for (const item of result.deduplicatedItems || []) pushItem(item, 'deduplicated_ofx', item.linkedOfxId || null, item.matchReason);
  for (const item of result.nonPdvItems || []) pushItem(item, 'ignored_non_pdv');
  for (const item of result.notAuthorizedItems || []) pushItem(item, 'not_authorized');

  return { sessionPayload, filePayloads, itemPayloads };
}

function compareTimestampsAsc(a, b) {
  const sa = String(a || '').trim();
  const sb = String(b || '').trim();
  if (!sa && !sb) return 0;
  if (!sa) return -1;
  if (!sb) return 1;
  const ta = Date.parse(sa);
  const tb = Date.parse(sb);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
    return ta - tb;
  }
  return sa.localeCompare(sb);
}

export function computeHistoricalHealthStats(sessions = []) {
  const valid = Array.isArray(sessions) ? sessions.filter(Boolean) : [];
  if (valid.length === 0) {
    return {
      totalSessions: 0,
      balancedCount: 0,
      balancedRatePct: 0,
      avgHealthScore: 0,
      totalShortageCents: 0,
      totalSurplusCents: 0,
      series: []
    };
  }

  let balancedCount = 0;
  let scoreSum = 0;
  let totalShortageCents = 0;
  let totalSurplusCents = 0;

  for (const s of valid) {
    if (s.status === 'balanced') balancedCount++;
    scoreSum += Number(s.health_score || 0);
    const diff = Number(s.diff_cents || 0);
    if (diff < 0) totalShortageCents += Math.abs(diff);
    else if (diff > 0) totalSurplusCents += diff;
  }

  const series = valid
    .map((s) => {
      const shiftRaw = String(s.shift_label ?? s.shiftLabel ?? '').trim();
      const operatorRaw = s.operator_name ?? s.operatorName ?? null;
      const operatorName =
        typeof operatorRaw === 'string' && operatorRaw.trim().length > 0
          ? operatorRaw.trim()
          : null;
      const createdAt = String(s.created_at || s.createdAt || '');
      const isDraft = Boolean(s.status === 'draft' || !s.closed_at);

      return {
        id: s.id,
        referenceDate: s.reference_date || s.referenceDate || '',
        status: s.status,
        healthScore: Number(s.health_score || 0),
        systemTotalCents: Number(s.system_total_cents || 0),
        realTotalCents: Number(s.real_total_cents || 0),
        diffCents: Number(s.diff_cents || 0),
        shiftLabel: shiftRaw || 'Diário',
        operatorName,
        createdAt,
        isDraft
      };
    })
    .sort((a, b) => {
      const dateCmp = String(a.referenceDate || '').localeCompare(String(b.referenceDate || ''));
      if (dateCmp !== 0) return dateCmp;
      const timeCmp = compareTimestampsAsc(a.createdAt, b.createdAt);
      if (timeCmp !== 0) return timeCmp;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

  return {
    totalSessions: valid.length,
    balancedCount,
    balancedRatePct: Math.round((balancedCount / valid.length) * 100),
    avgHealthScore: Math.round(scoreSum / valid.length),
    totalShortageCents,
    totalSurplusCents,
    series
  };
}

export const MIRROR_KEY_TO_CATEGORIES = {
  saldo_dinheiro: ['dinheiro'],
  cartao: ['cartao'],
  pix: ['pix'],
  pendentes: ['pendente'],
  ifood: ['ifood'],
  pago_online: ['pago_online'],
  ticket: ['ticket'],
  sem_bandeira: ['sem_bandeira'],
  outros: ['outros', 'pago_online', 'sem_bandeira']
};

export function filterVisibleMirrorRows(mirrorRows = [], categoryRealOverrides = {}, showZeroRows = false) {
  const rows = Array.isArray(mirrorRows) ? mirrorRows : [];
  const overrides = categoryRealOverrides || {};
  const isNonZeroOrOverridden = (row) =>
    Number(row.systemCents || 0) !== 0 ||
    Number(row.realCents || 0) !== 0 ||
    overrides[row.key] !== undefined;

  const hiddenCount = rows.filter(r => !isNonZeroOrOverridden(r)).length;
  const visibleRows = showZeroRows ? rows : rows.filter(isNonZeroOrOverridden);
  return { visibleRows, hiddenCount };
}

export function buildMirrorRowDetails(result = {}, rowKey = '') {
  const categories = MIRROR_KEY_TO_CATEGORIES[rowKey] || [rowKey];
  const catSet = new Set(categories);

  const matchedPairs = (result.matchedPairs || []).filter(
    pair =>
      (pair.systemItems || []).some(s => catSet.has(s.category)) ||
      (pair.realItems || []).some(r => catSet.has(r.category))
  );

  const suggestions = (result.suggestions || []).filter(
    sug =>
      (sug.systemItems || []).some(s => catSet.has(s.category)) ||
      (sug.realItems || []).some(r => catSet.has(r.category))
  );

  const missingItems = (result.missingInBank || []).filter(s => catSet.has(s.category));
  const extraItems = (result.extraInBank || []).filter(r => catSet.has(r.category));

  const systemCategoryItems = (result.systemItems || []).filter(s => catSet.has(s.category));
  const reclassifiedOutItems = (result.systemItems || []).filter(
    s => s.metadata?.reclassifiedFrom && catSet.has(s.metadata.reclassifiedFrom) && !catSet.has(s.category)
  );

  const pendingDebtors = rowKey === 'pendentes' ? (result.financialMetrics?.pendingDebtors || []) : [];
  const saidasDetalhadas = rowKey === 'saldo_dinheiro' ? (result.cashDrawerSummary?.saidasDetalhadas || []) : [];

  return {
    categories,
    matchedPairs,
    suggestions,
    missingItems,
    extraItems,
    systemCategoryItems,
    reclassifiedOutItems,
    pendingDebtors,
    saidasDetalhadas
  };
}

export function buildActiveDraftStorageKey(tenantId) {
  return `cash_recon_active_draft_${String(tenantId || '').trim()}`;
}

export function buildDraftDismissedStorageKey(tenantId) {
  return `cash_recon_draft_dismissed_${String(tenantId || '').trim()}`;
}

export function serializeActiveCashDraft({
  activeSessionId = null,
  files = [],
  manualInputs = {},
  manualResolutions = [],
  aiAnalysis = null
} = {}) {
  const safeFiles = (Array.isArray(files) ? files : [])
    .filter(f => f && f.parsed && f.parsed.status === 'ok')
    .map(f => ({
      id: f.id,
      fileName: f.fileName,
      fileSizeBytes: Number(f.fileSizeBytes || 0),
      parsed: f.parsed
    }));

  return {
    version: 1,
    activeSessionId: activeSessionId || null,
    files: safeFiles,
    manualInputs: manualInputs || {},
    manualResolutions: Array.isArray(manualResolutions) ? manualResolutions : [],
    aiAnalysis: aiAnalysis || null,
    updatedAt: new Date().toISOString()
  };
}

export function saveActiveCashDraftToStorage(storage, tenantId, draft) {
  if (!storage || !tenantId) return false;
  const serialized = serializeActiveCashDraft(draft);
  if (serialized.files.length === 0) {
    storage.removeItem(buildActiveDraftStorageKey(tenantId));
    return false;
  }
  try {
    storage.setItem(buildActiveDraftStorageKey(tenantId), JSON.stringify(serialized));
    return true;
  } catch {
    return false;
  }
}

export function loadActiveCashDraftFromStorage(storage, tenantId) {
  if (!storage || !tenantId) return null;
  try {
    const raw = storage.getItem(buildActiveDraftStorageKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.files) || parsed.files.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveCashDraftFromStorage(storage, tenantId) {
  if (!storage || !tenantId) return;
  try {
    storage.removeItem(buildActiveDraftStorageKey(tenantId));
  } catch {
    // ignorar falha de acesso ao storage
  }
}

export function isDraftAutoResumeDismissed(storage, tenantId) {
  if (!storage || !tenantId) return false;
  try {
    return storage.getItem(buildDraftDismissedStorageKey(tenantId)) === '1';
  } catch {
    return false;
  }
}

export function setDraftAutoResumeDismissed(storage, tenantId, dismissed) {
  if (!storage || !tenantId) return;
  try {
    const key = buildDraftDismissedStorageKey(tenantId);
    if (dismissed) storage.setItem(key, '1');
    else storage.removeItem(key);
  } catch {
    // ignorar falha de acesso ao storage
  }
}

export function pickMostRecentOpenDraftSession(sessions = []) {
  const open = (Array.isArray(sessions) ? sessions : []).filter(s => s && !s.closed_at);
  if (open.length === 0) return null;
  open.sort((a, b) => {
    const ta = Date.parse(a.updated_at || a.created_at || '') || 0;
    const tb = Date.parse(b.updated_at || b.created_at || '') || 0;
    return tb - ta;
  });
  return open[0];
}

export function buildHealthMetricDetail(result = {}, metricKey = '') {
  const metrics = result.financialMetrics || {};
  const audit = result.auditInsights || {};
  const realItems = Array.isArray(result.realItems) ? result.realItems : [];
  const drawer = result.cashDrawerSummary || {};
  const getMirror = (k) => (result.mirrorRows || []).find(r => r.key === k) || { systemCents: 0, realCents: 0, diffCents: 0 };

  if (metricKey === 'fees') {
    const feeItems = realItems
      .filter(it => Number(it.feeCents || 0) > 0)
      .sort((a, b) => Number(b.feeCents || 0) - Number(a.feeCents || 0));
    const bySource = new Map();
    for (const it of feeItems) {
      const key = `${it.source || 'outro'}`;
      const cur = bySource.get(key) || { source: key.toUpperCase(), count: 0, grossCents: 0, feeCents: 0, netCents: 0 };
      cur.count += 1;
      cur.grossCents += Number(it.amountCents || 0);
      cur.feeCents += Number(it.feeCents || 0);
      cur.netCents += Number(it.netAmountCents ?? it.amountCents ?? 0);
      bySource.set(key, cur);
    }
    return {
      metricKey,
      totalFeeCents: Number(metrics.totalMdrFeeCents || 0),
      items: feeItems,
      bySource: Array.from(bySource.values())
    };
  }

  if (metricKey === 'net_digital') {
    const channelMap = new Map();
    for (const it of realItems) {
      const key = `${it.source || 'outro'}_${it.category || 'outros'}`;
      const label = `${String(it.source || '').toUpperCase()} (${String(it.category || '').toUpperCase()})`;
      const cur = channelMap.get(key) || { key, label, count: 0, grossCents: 0, feeCents: 0, netCents: 0 };
      cur.count += 1;
      cur.grossCents += Number(it.amountCents || 0);
      cur.feeCents += Number(it.feeCents || 0);
      cur.netCents += Number(it.netAmountCents ?? it.amountCents ?? 0);
      channelMap.set(key, cur);
    }
    return {
      metricKey,
      totalNetDigitalCents: Number(metrics.totalNetDigitalCents || 0),
      totalFeeCents: Number(metrics.totalMdrFeeCents || 0),
      channels: Array.from(channelMap.values())
    };
  }

  if (metricKey === 'cancelled') {
    const detailed = Array.isArray(audit.cancelledDetails) ? audit.cancelledDetails : [];
    return {
      metricKey,
      cancelledCount: Number(metrics.cancelledCount || detailed.length || 0),
      cancelledCents: Number(metrics.cancelledCents || 0),
      items: Array.isArray(metrics.cancelledItems) ? metrics.cancelledItems : [],
      detailedItems: detailed
    };
  }

  if (metricKey === 'discounts') {
    return {
      metricKey,
      discountsCents: Number(metrics.discountsCents || 0),
      internalConsumptionCents: Number(metrics.internalConsumptionCents || 0),
      internalConsumptionCostCents: Number(audit.internalConsumptionCostCents || 0),
      systemTotalCents: Number(result.systemTotalCents || 0),
      discountDetails: Array.isArray(audit.discountDetails) ? audit.discountDetails : []
    };
  }

  if (metricKey === 'delivery_house_fees') {
    const deliveryFeeCents = Number(metrics.deliveryFeeCents || 0);
    const serviceFeeCents = Number(metrics.serviceFeeCents || 0);
    return {
      metricKey,
      deliveryFeeCents,
      serviceFeeCents,
      totalCents: deliveryFeeCents + serviceFeeCents,
      feeRemovals: Array.isArray(audit.feeRemovals) ? audit.feeRemovals : []
    };
  }

  const pixSys = Number(getMirror('pix').systemCents || 0);
  const cardSys = Number(getMirror('cartao').systemCents || 0);
  const cashSys = Number(drawer.vendaDinheiroCents || 0);
  const pendSys = Number(getMirror('pendentes').systemCents || 0);
  return {
    metricKey: 'guests',
    guestCount: Number(metrics.guestCount || 0),
    averageTicketCents: Number(metrics.averageTicketCents || 0),
    revenueConsideredCents: pixSys + cardSys + cashSys,
    pendingCount: Array.isArray(metrics.pendingDebtors) ? metrics.pendingDebtors.length : 0,
    pendingCents: pendSys,
    internalConsumptionCents: Number(metrics.internalConsumptionCents || 0),
    topProducts: Array.isArray(audit.topProducts) ? audit.topProducts : [],
    byWaiter: Array.isArray(audit.byWaiter) ? audit.byWaiter : [],
    byModule: Array.isArray(audit.byModule) ? audit.byModule : [],
    complementsCents: Number(audit.complementsCents || 0)
  };
}

export function formatDateBr(rawDate) {
  if (!rawDate) return '';
  const str = String(rawDate).trim();
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[1]}/${br[2]}/${br[3]}`;
  return str;
}

export function formatDateBrShort(rawDate) {
  if (!rawDate) return '';
  const str = String(rawDate).trim();
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (iso) return `${iso[3]}/${iso[2]}`;
  const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[1]}/${br[2]}`;
  return str;
}

/**
 * Extrai mensagem legível tanto de instâncias Error quanto de objetos PostgREST ({ message, details, hint, code }).
 */
export function extractCashErrorMessage(err, fallback = 'falha desconhecida') {
  if (!err) return fallback;
  if (typeof err === 'string') return err.trim() || fallback;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object') {
    const parts = [err.message, err.error_description, err.details, err.hint].filter(
      (v) => typeof v === 'string' && v.trim().length > 0
    );
    if (parts.length > 0) return parts.join(' • ');
    if (err.code) return `Código ${err.code}`;
  }
  return fallback;
}

/**
 * Decide se a operação no cliente JWT deve tentar fallback no masterSupabase
 * (ex.: erro de RLS/401/403/406/PGRST116 ou linha/lista filtrada silenciosamente em acesso multi-empresa).
 */
export function shouldRetryWithMasterClient({ data, error, expectRow = false, fallbackOnEmptyArray = false }) {
  if (isMissingCashTableError(error)) return false;

  if (error) {
    const code = String(error?.code || '');
    const status = Number(error?.status || 0);
    const msg = String(error?.message || '').toLowerCase();
    return (
      status === 401 ||
      status === 403 ||
      status === 406 ||
      code === '42501' ||
      code === 'PGRST301' ||
      code === 'PGRST116' ||
      msg.includes('row-level security') ||
      msg.includes('jwt')
    );
  }

  if (expectRow && !data) return true;
  if (fallbackOnEmptyArray && Array.isArray(data) && data.length === 0) return true;
  return false;
}
