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

export function computeHistoricalHealthStats(sessions = []) {
  const valid = Array.isArray(sessions) ? [...sessions] : [];
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
    .map(s => ({
      id: s.id,
      referenceDate: s.reference_date,
      status: s.status,
      healthScore: Number(s.health_score || 0),
      systemTotalCents: Number(s.system_total_cents || 0),
      realTotalCents: Number(s.real_total_cents || 0),
      diffCents: Number(s.diff_cents || 0)
    }))
    .sort((a, b) => String(a.referenceDate).localeCompare(String(b.referenceDate)));

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
