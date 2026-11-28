/**
 * Helpers puros de serialização, validação e agregação histórica para Conferência de Caixa.
 */
import { addDaysIso, parseMoneyToCents } from './cashFileParsers.mjs';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function compactParsedFileForClosingPeriod(file, referenceDate, periodDiag) {
  const baseRows = Array.isArray(file?.rows) ? file.rows : [];
  const targetStart = ISO_DATE_RE.test(String(periodDiag?.targetStartDate || ''))
    ? periodDiag.targetStartDate
    : (ISO_DATE_RE.test(String(referenceDate || '')) ? referenceDate : '');
  const targetEnd = ISO_DATE_RE.test(String(periodDiag?.targetEndDate || ''))
    ? periodDiag.targetEndDate
    : targetStart;

  if (!targetStart || baseRows.length === 0) {
    return {
      fileName: file.fileName,
      fileType: file.fileType,
      status: file.status,
      periodStart: file.periodStart || '',
      periodEnd: file.periodEnd || '',
      warnings: file.warnings || [],
      rows: baseRows,
      summary: file.summary || {}
    };
  }

  const nextDayAfterEnd = addDaysIso(targetEnd, 1);
  let hasDatedRows = false;
  let hasOutOfRange = false;
  for (const r of baseRows) {
    const dt = String(r?.dateStr || '');
    if (!ISO_DATE_RE.test(dt)) continue;
    hasDatedRows = true;
    if (dt < targetStart || dt > nextDayAfterEnd) {
      hasOutOfRange = true;
      break;
    }
  }

  const normalizedRows = hasDatedRows && hasOutOfRange
    ? baseRows.filter((r) => {
        const dt = String(r?.dateStr || '');
        if (!ISO_DATE_RE.test(dt)) return true;
        return dt >= targetStart && dt <= nextDayAfterEnd;
      })
    : baseRows;

  return {
    fileName: file.fileName,
    fileType: file.fileType,
    status: file.status,
    periodStart: hasDatedRows && hasOutOfRange ? targetStart : (file.periodStart || ''),
    periodEnd: hasDatedRows && hasOutOfRange ? targetEnd : (file.periodEnd || ''),
    warnings: file.warnings || [],
    rows: normalizedRows,
    summary: file.summary || {}
  };
}

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

const FORCED_MARKER_RE = /\s*\[FOR[ÇC]ADO 100%([^\]]*)\]/gi;

export function stripForcedCashMarkerTag(rawNotes) {
  return String(rawNotes || '')
    .replace(FORCED_MARKER_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildForcedCashMarkerTag(forcedBalanced, rawScore = 0, diffCents = 0) {
  if (!forcedBalanced || !forcedBalanced.enabled) return '';
  const cleanReason = String(forcedBalanced.reason || '')
    .replace(/[\[\]|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const safeScore = Math.max(0, Math.min(100, Math.round(Number(forcedBalanced.rawHealthScoreBeforeForce ?? rawScore ?? 0))));
  const safeDiff = Math.round(Number(forcedBalanced.rawDiffCents ?? diffCents ?? 0));
  return `[FORÇADO 100%|real:${safeScore}|dif:${safeDiff}${cleanReason ? `|motivo:${cleanReason}` : ''}]`;
}

export function composeCashNotesWithForcedTag(notes, forcedBalanced, rawScore = 0, diffCents = 0) {
  const cleanUserNotes = stripForcedCashMarkerTag(notes || '');
  const tag = buildForcedCashMarkerTag(forcedBalanced, rawScore, diffCents);
  return [cleanUserNotes, tag].filter(Boolean).join(' ').trim() || null;
}

export function parseForcedCashMetaFromSession(sessionRow = {}, manualInputs = null) {
  const inputsForced = manualInputs?.forcedBalanced || sessionRow?.reconciled_summary?.manualInputs?.forcedBalanced;
  if (inputsForced && inputsForced.enabled) {
    return {
      isForced: true,
      rawScore: Math.max(0, Math.min(100, Math.round(Number(inputsForced.rawHealthScoreBeforeForce ?? 0)))),
      diffCents: Math.round(Number(inputsForced.rawDiffCents ?? sessionRow?.diff_cents ?? 0)),
      reason: String(inputsForced.reason || '').trim()
    };
  }

  const rawNotes = String(sessionRow?.cash_notes || '');
  const markerMatch = rawNotes.match(/\[FOR[ÇC]ADO 100%([^\]]*)\]/i);
  if (markerMatch) {
    const inner = String(markerMatch[1] || '');
    const realMatch = inner.match(/\|real:(\d+)/i);
    const difMatch = inner.match(/\|dif:(-?\d+)/i);
    const reasonMatch = inner.match(/\|motivo:([^|\]]+)/i);
    return {
      isForced: true,
      rawScore: realMatch ? Number(realMatch[1]) : null,
      diffCents: difMatch ? Number(difMatch[1]) : Math.round(Number(sessionRow?.diff_cents || 0)),
      reason: reasonMatch ? String(reasonMatch[1]).trim() : ''
    };
  }

  const score = Number(sessionRow?.health_score ?? 0);
  const diffCents = Math.round(Number(sessionRow?.diff_cents ?? 0));
  const status = String(sessionRow?.status || '');
  if (score >= 100 && (Math.abs(diffCents) > 100 || (status && status !== 'balanced' && status !== 'draft'))) {
    return {
      isForced: true,
      rawScore: null,
      diffCents,
      reason: ''
    };
  }

  return {
    isForced: false,
    rawScore: score,
    diffCents,
    reason: ''
  };
}

export function buildSessionPersistencePayload({
  tenantId,
  userEmail = '',
  parsedFiles = [],
  result = {},
  manualInputs = {},
  manualResolutions = [],
  aiAnalysis = null,
  markClosed = false,
  preservedClosedAt = null
}) {
  if (!tenantId || !String(tenantId).trim()) {
    throw new Error('tenantId é obrigatório para persistir a conferência de caixa.');
  }

  const cleanTenantId = String(tenantId).trim();
  const nowIso = new Date().toISOString();

  // Guarda snapshot compacto dos arquivos parseados normalizado para a competência do fechamento
  const parsedFilesSnapshot = (parsedFiles || [])
    .filter(f => f && f.status === 'ok')
    .map(f => compactParsedFileForClosingPeriod(f, result?.referenceDate, result?.periodDiagnostics));

  const forcedMeta = manualInputs?.forcedBalanced?.enabled
    ? manualInputs.forcedBalanced
    : result?.forcedBalanced?.enabled
      ? result.forcedBalanced
      : null;
  const rawScoreBeforeForce = Number(result?.rawHealthScore ?? result?.healthBreakdown?.rawHealthScore ?? result?.healthScore ?? 0);
  const persistedCashNotes = composeCashNotesWithForcedTag(
    manualInputs.notes || '',
    forcedMeta,
    rawScoreBeforeForce,
    result?.diffTotalCents ?? 0
  );

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
    cash_notes: persistedCashNotes,
    reconciled_summary: {
      mirrorRows: result.mirrorRows || [],
      cashDrawerSummary: result.cashDrawerSummary || {},
      financialMetrics: result.financialMetrics || {},
      reportCompleteness: result.reportCompleteness || null,
      periodDiagnostics: result.periodDiagnostics || null,
      auditInsights: result.auditInsights || null,
      manualInputs,
      manualResolutions,
      parsedFilesSnapshot
    },
    ai_last_analysis: aiAnalysis || null,
    created_by_email: userEmail || null,
    closed_at: markClosed ? (preservedClosedAt || nowIso) : null
  };

  const filePayloads = (parsedFiles || []).map((f, idx) => {
    const snap = f?.status === 'ok'
      ? compactParsedFileForClosingPeriod(f, result?.referenceDate, result?.periodDiagnostics)
      : null;
    const rowsForCount = snap ? snap.rows : f.rows;
    return {
      tenant_id: cleanTenantId,
      file_name: f.fileName || 'arquivo',
      file_type: f.fileType || 'unknown',
      file_size_bytes: Number(f.fileSizeBytes || 0),
      period_start: (snap?.periodStart || f.periodStart || ''),
      period_end: (snap?.periodEnd || f.periodEnd || ''),
      row_count: Array.isArray(rowsForCount) ? rowsForCount.length : 0,
      parse_status: f.status === 'ok' ? (f.warnings?.length ? 'warning' : 'ok') : 'error',
      parse_warnings: f.warnings || [],
      raw_summary: f.summary || {},
      _idx: idx
    };
  }).map(({ _idx, ...rest }) => rest);

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
      forcedBalancedCount: 0,
      balancedRatePct: 0,
      avgHealthScore: 0,
      totalShortageCents: 0,
      totalSurplusCents: 0,
      series: []
    };
  }

  let balancedCount = 0;
  let forcedBalancedCount = 0;
  let scoreSum = 0;
  let totalShortageCents = 0;
  let totalSurplusCents = 0;

  for (const s of valid) {
    if (s.status === 'balanced') balancedCount++;
    if (parseForcedCashMetaFromSession(s).isForced) forcedBalancedCount++;
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
      const forcedMeta = parseForcedCashMetaFromSession(s);

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
        isDraft,
        isForcedBalanced: forcedMeta.isForced,
        forcedReason: forcedMeta.reason || '',
        rawScoreBeforeForce: forcedMeta.rawScore
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
    forcedBalancedCount,
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
      (sug.suggestedTargetCategory && catSet.has(sug.suggestedTargetCategory)) ||
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

  const mirrorRow = (result.mirrorRows || []).find((r) => r.key === rowKey) || null;
  const extraCents = extraItems.reduce((acc, item) => acc + Number(item?.amountCents || 0), 0);
  const missingCents = missingItems.reduce((acc, item) => acc + Number(item?.amountCents || 0), 0);
  const netPendingCents = extraCents - missingCents;

  let crossCategoryRealInCents = 0;
  let crossCategorySysOutCents = 0;
  let sameCategoryDeltaCents = 0;
  const crossCategoryPairs = [];

  for (const pair of matchedPairs) {
    const reals = Array.isArray(pair?.realItems) ? pair.realItems : [];
    const syss = Array.isArray(pair?.systemItems) ? pair.systemItems : [];
    const rIn = reals.filter((r) => catSet.has(r.category)).reduce((acc, r) => acc + Number(r.amountCents || 0), 0);
    const sIn = syss.filter((s) => catSet.has(s.category)).reduce((acc, s) => acc + Number(s.amountCents || 0), 0);
    const isPureSameCat =
      reals.every((r) => catSet.has(r.category)) && syss.every((s) => catSet.has(s.category));
    const pairNet = rIn - sIn;
    if (!isPureSameCat) {
      if (pairNet > 0) crossCategoryRealInCents += pairNet;
      else if (pairNet < 0) crossCategorySysOutCents += Math.abs(pairNet);
      if (pairNet !== 0) crossCategoryPairs.push(pair);
    } else {
      sameCategoryDeltaCents += pairNet;
    }
  }

  const crossCategoryNetCents = crossCategoryRealInCents - crossCategorySysOutCents;
  const mirrorDiffCents = mirrorRow ? Number(mirrorRow.diffCents || 0) : netPendingCents + crossCategoryNetCents;
  const otherDeltaCents = mirrorDiffCents - (netPendingCents + crossCategoryNetCents);

  return {
    categories,
    matchedPairs,
    suggestions,
    missingItems,
    extraItems,
    systemCategoryItems,
    reclassifiedOutItems,
    pendingDebtors,
    saidasDetalhadas,
    reconciliationBridge: {
      extraCents,
      missingCents,
      netPendingCents,
      crossCategoryRealInCents,
      crossCategorySysOutCents,
      crossCategoryNetCents,
      sameCategoryDeltaCents,
      otherDeltaCents,
      mirrorDiffCents,
      crossCategoryPairs
    }
  };
}

/**
 * Escolhe a aba inicial ideal no modal de conciliação detalhada com foco na discrepância real.
 */
export function resolveDetailPanelDefaultTab({
  diffCents = 0,
  extraCount = 0,
  missingCount = 0,
  suggestionsCount = 0,
  matchedCount = 0
} = {}) {
  if (diffCents > 1 && extraCount > 0) return 'sobras';
  if (suggestionsCount > 0) return 'sugestoes';
  if (diffCents < -1 && missingCount > 0) return 'faltas';
  if (extraCount > 0) return 'sobras';
  if (missingCount > 0) return 'faltas';
  if (matchedCount > 0) return 'conciliados';
  return 'todos';
}

/**
 * Sugere o candidato mais provável no PDV (faltas / dinheiro) para conciliar uma sobra em 1 clique.
 */
export function findBestCandidateForSobra(sobraItem, systemPool = [], maxToleranceCents = 200) {
  if (!sobraItem || !Array.isArray(systemPool) || systemPool.length === 0) return null;
  const target = Number(sobraItem.amountCents || 0);
  if (target <= 0) return null;

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const sobraSec = Number(sobraItem.secondsOfDay || 0);
  const isRedeAm = sobraItem.source === 'rede' && sobraSec < 12 * 3600;

  for (const sys of systemPool) {
    if (!sys) continue;
    const amtDiff = Math.abs(Number(sys.amountCents || 0) - target);
    if (amtDiff > maxToleranceCents) continue;

    const sysSec = Number(sys.secondsOfDay || 0);
    let timeDiff = Math.abs(sysSec - sobraSec);
    if (isRedeAm && sysSec >= 12 * 3600) {
      timeDiff = Math.min(timeDiff, Math.abs(sysSec - (sobraSec + 12 * 3600)));
    }
    const score = amtDiff * 100000 + timeDiff;
    if (score < bestScore) {
      bestScore = score;
      best = {
        item: sys,
        amountDiffCents: amtDiff,
        isExactAmount: amtDiff <= 1,
        timeDiffSec: timeDiff
      };
    }
  }
  return best;
}

/**
 * Filtra e ordena itens de Faltas/Sobras pelos critérios auxiliares do modal de conciliação.
 */
export function filterAndSortDetailItems(
  items = [],
  {
    query = '',
    sourceFilter = 'all',
    sortBy = 'amount_desc',
    onlyMadrugada = false,
    onlyWithCandidate = false,
    candidateMap = null
  } = {}
) {
  const qLower = String(query || '').trim().toLowerCase();
  const list = (Array.isArray(items) ? items : []).filter((it) => {
    if (!it) return false;
    if (sourceFilter && sourceFilter !== 'all') {
      if (String(it.source || '').toLowerCase() !== String(sourceFilter).toLowerCase()) return false;
    }
    if (onlyMadrugada && Number(it.secondsOfDay || 0) >= 6 * 3600) return false;
    if (onlyWithCandidate && candidateMap && !candidateMap.has(it.id)) return false;
    if (qLower) {
      const hay = `${it.description || ''} ${it.referenceCode || ''} ${it.operatorName || ''} ${it.terminalName || ''} ${it.source || ''} ${it.timeStr || ''} ${(Number(it.amountCents || 0) / 100).toFixed(2)} ${(Number(it.amountCents || 0) / 100).toFixed(2).replace('.', ',')}`.toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });

  list.sort((a, b) => {
    if (sortBy === 'amount_desc') return Number(b.amountCents || 0) - Number(a.amountCents || 0);
    if (sortBy === 'amount_asc') return Number(a.amountCents || 0) - Number(b.amountCents || 0);
    if (sortBy === 'time_desc') return Number(b.secondsOfDay || 0) - Number(a.secondsOfDay || 0);
    return Number(a.secondsOfDay || 0) - Number(b.secondsOfDay || 0);
  });

  return list;
}

/**
 * Filtra pares já conciliados automaticamente ou manualmente por busca e origem/regra.
 */
export function filterMatchedPairsForDetail(matchedPairs = [], { query = '', sourceFilter = 'all' } = {}) {
  const qLower = String(query || '').trim().toLowerCase();
  return (Array.isArray(matchedPairs) ? matchedPairs : []).filter((pair) => {
    if (!pair) return false;
    if (sourceFilter && sourceFilter !== 'all') {
      const realSources = (pair.realItems || []).map((r) => String(r.source || '').toLowerCase());
      if (sourceFilter === 'manual') {
        if (pair.matchType !== 'matched_manual') return false;
      } else if (sourceFilter === 'rede_12h') {
        if (!String(pair.reasonText || '').includes('12h')) return false;
      } else if (!realSources.includes(String(sourceFilter).toLowerCase())) {
        return false;
      }
    }
    if (qLower) {
      const hay = [
        pair.reasonText || '',
        (Number(pair.amountCents || 0) / 100).toFixed(2),
        (Number(pair.amountCents || 0) / 100).toFixed(2).replace('.', ','),
        ...(pair.systemItems || []).map((s) => `${s.description || ''} ${s.timeStr || ''} ${s.referenceCode || ''} ${s.operatorName || ''}`),
        ...(pair.realItems || []).map((r) => `${r.description || ''} ${r.timeStr || ''} ${r.source || ''} ${r.referenceCode || ''}`)
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });
}

export function buildActiveDraftStorageKey(tenantId) {
  return `cash_recon_active_draft_${String(tenantId || '').trim()}`;
}

export function buildDraftDismissedStorageKey(tenantId) {
  return `cash_recon_draft_dismissed_${String(tenantId || '').trim()}`;
}

export function buildPendingClosedPatchStorageKey(tenantId, sessionId) {
  return `cash_recon_closed_patch_${String(tenantId || '').trim()}_${String(sessionId || '').trim()}`;
}

export function serializeActiveCashDraft({
  activeSessionId = null,
  files = [],
  manualInputs = {},
  manualResolutions = [],
  aiAnalysis = null,
  pendingCloudSync = false,
  compactedForQuota = false
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
    pendingCloudSync: Boolean(pendingCloudSync),
    compactedForQuota: Boolean(compactedForQuota),
    files: safeFiles,
    manualInputs: manualInputs || {},
    manualResolutions: Array.isArray(manualResolutions) ? manualResolutions : [],
    aiAnalysis: aiAnalysis || null,
    updatedAt: new Date().toISOString()
  };
}

function compactSerializedDraftForQuota(serialized, level = 1) {
  const files = (serialized.files || []).map((f) => {
    const parsed = f.parsed || {};
    if (level === 1 && parsed.fileType !== 'pdv_itens_vendidos' && Array.isArray(parsed.rows) && parsed.rows.length <= 150) {
      return f;
    }
    return {
      ...f,
      parsed: {
        ...parsed,
        rows: []
      }
    };
  });
  return {
    ...serialized,
    compactedForQuota: true,
    aiAnalysis: level >= 2 ? null : serialized.aiAnalysis,
    files
  };
}

function writeDraftWithQuotaFallback(storage, storageKey, draft) {
  if (!storage || !storageKey) return false;
  const serialized = serializeActiveCashDraft(draft);
  if (serialized.files.length === 0) {
    storage.removeItem(storageKey);
    return false;
  }

  const candidates = [
    serialized,
    compactSerializedDraftForQuota(serialized, 1),
    compactSerializedDraftForQuota(serialized, 2)
  ];

  for (const candidate of candidates) {
    try {
      storage.setItem(storageKey, JSON.stringify(candidate));
      return true;
    } catch {
      // Tenta versão mais compacta caso localStorage atinja QuotaExceededError
    }
  }
  return false;
}

function readDraftFromStorage(storage, storageKey) {
  if (!storage || !storageKey) return null;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.files) || parsed.files.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveCashDraftToStorage(storage, tenantId, draft) {
  if (!storage || !tenantId) return false;
  return writeDraftWithQuotaFallback(storage, buildActiveDraftStorageKey(tenantId), draft);
}

export function loadActiveCashDraftFromStorage(storage, tenantId) {
  if (!storage || !tenantId) return null;
  return readDraftFromStorage(storage, buildActiveDraftStorageKey(tenantId));
}

export function savePendingClosedPatchToStorage(storage, tenantId, sessionId, draft) {
  if (!storage || !tenantId || !sessionId) return false;
  return writeDraftWithQuotaFallback(
    storage,
    buildPendingClosedPatchStorageKey(tenantId, sessionId),
    { ...draft, activeSessionId: sessionId, pendingCloudSync: true }
  );
}

export function loadPendingClosedPatchFromStorage(storage, tenantId, sessionId) {
  if (!storage || !tenantId || !sessionId) return null;
  return readDraftFromStorage(storage, buildPendingClosedPatchStorageKey(tenantId, sessionId));
}

export function clearPendingClosedPatchFromStorage(storage, tenantId, sessionId) {
  if (!storage || !tenantId || !sessionId) return;
  try {
    storage.removeItem(buildPendingClosedPatchStorageKey(tenantId, sessionId));
  } catch {
    // ignorar falha de acesso ao storage
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

function formatSourceLabel(rawSource) {
  const s = String(rawSource || '').trim().toUpperCase();
  if (s === 'C6PAY' || s === 'C6_PAY') return 'C6 Pay';
  if (s === 'REDE') return 'Rede';
  if (s === 'STONE') return 'Stone';
  if (s === 'PAGSEGURO') return 'PagSeguro';
  if (s === 'GETNET') return 'Getnet';
  if (s === 'CIELO') return 'Cielo';
  return s || 'Adquirente';
}

function normalizeCardModality(item) {
  const sub = String(item?.subCategory || '').toUpperCase();
  const desc = String(item?.description || '').toUpperCase();
  if (sub.includes('DEB') || desc.includes('DEBIT')) return 'DEBITO';
  if (sub.includes('VOUCH') || sub.includes('TICK') || desc.includes('VOUCH') || desc.includes('ALIM') || desc.includes('REFEIC')) {
    return 'VOUCHER';
  }
  return 'CREDITO';
}

function normalizeCardBrand(item) {
  const raw = String(item?.metadata?.bandeira || '').trim();
  let candidate = raw;
  if (!candidate) {
    const desc = String(item?.description || '').trim();
    const cleaned = desc
      .replace(/\b(rede|c6\s*pay|c6pay|credito|crédito|debito|débito|voucher|pix|pos)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    candidate = cleaned;
  }
  const upper = candidate.toUpperCase();
  if (!upper) return '';
  if (upper.includes('MASTER')) return 'MASTERCARD';
  if (upper.includes('VISA')) return 'VISA';
  if (upper.includes('ELO')) return 'ELO';
  if (upper.includes('AMEX') || upper.includes('AMERICAN')) return 'AMEX';
  if (upper.includes('HIPER')) return 'HIPERCARD';
  return upper;
}

/**
 * Compara taxas MDR entre todas as adquirentes/bancos presentes no fechamento,
 * apontando a diferença em pontos percentuais e a economia potencial em R$ caso
 * as transações fossem roteadas para a maquininha mais econômica (por bandeira/modalidade e média global).
 */
export function buildAcquirerFeeComparison(cardItems = []) {
  const validItems = (Array.isArray(cardItems) ? cardItems : []).filter(
    (it) => it && Number(it.amountCents || 0) > 0 && (it.category === 'cartao' || Number(it.feeCents || 0) > 0)
  );

  const bySourceMap = new Map();
  for (const it of validItems) {
    const src = String(it.source || 'outro').trim().toUpperCase();
    const cur = bySourceMap.get(src) || {
      source: src,
      label: formatSourceLabel(src),
      count: 0,
      grossCents: 0,
      feeCents: 0,
      netCents: 0,
      creditCount: 0,
      creditGrossCents: 0,
      creditFeeCents: 0,
      debitCount: 0,
      debitGrossCents: 0,
      debitFeeCents: 0
    };
    const gross = Number(it.amountCents || 0);
    const fee = Number(it.feeCents || 0);
    const net = Number(it.netAmountCents ?? Math.max(0, gross - fee));
    const modality = normalizeCardModality(it);

    cur.count += 1;
    cur.grossCents += gross;
    cur.feeCents += fee;
    cur.netCents += net;
    if (modality === 'DEBITO') {
      cur.debitCount += 1;
      cur.debitGrossCents += gross;
      cur.debitFeeCents += fee;
    } else if (modality === 'CREDITO') {
      cur.creditCount += 1;
      cur.creditGrossCents += gross;
      cur.creditFeeCents += fee;
    }
    bySourceMap.set(src, cur);
  }

  const sources = Array.from(bySourceMap.values())
    .map((s) => ({
      ...s,
      effectiveRatePct: s.grossCents > 0 ? Number(((s.feeCents / s.grossCents) * 100).toFixed(2)) : 0,
      creditRatePct: s.creditGrossCents > 0 ? Number(((s.creditFeeCents / s.creditGrossCents) * 100).toFixed(2)) : null,
      debitRatePct: s.debitGrossCents > 0 ? Number(((s.debitFeeCents / s.debitGrossCents) * 100).toFixed(2)) : null
    }))
    .sort((a, b) => a.effectiveRatePct - b.effectiveRatePct || b.grossCents - a.grossCents);

  const hasMultipleSources = sources.filter((s) => s.feeCents > 0 || s.grossCents > 0).length >= 2;
  const cheapestSource = sources[0] || null;
  const mostExpensiveSource = sources.length >= 2 ? sources[sources.length - 1] : null;
  const rateSpreadPctPoints =
    hasMultipleSources && cheapestSource && mostExpensiveSource
      ? Number(Math.max(0, mostExpensiveSource.effectiveRatePct - cheapestSource.effectiveRatePct).toFixed(2))
      : 0;

  let globalAverageSavingsCents = 0;
  if (hasMultipleSources && cheapestSource && cheapestSource.grossCents > 0) {
    const cheapestExactRate = cheapestSource.feeCents / cheapestSource.grossCents;
    for (const s of sources.slice(1)) {
      const hypotheticalFee = Math.round(s.grossCents * cheapestExactRate);
      if (s.feeCents > hypotheticalFee) {
        globalAverageSavingsCents += s.feeCents - hypotheticalFee;
      }
    }
  }

  // Comparação justa por Modalidade + Bandeira (ex.: CREDITO MASTERCARD Rede vs C6 Pay)
  const brandGroupMap = new Map();
  for (const it of validItems) {
    const modality = normalizeCardModality(it);
    const brand = normalizeCardBrand(it);
    if (!brand) continue;
    const key = `${modality}__${brand}`;
    const src = String(it.source || 'outro').trim().toUpperCase();
    const group = brandGroupMap.get(key) || { key, modality, brand, matchScope: 'brand', label: `${modality} ${brand}`, items: [], bySource: new Map() };
    group.items.push(it);
    const cur = group.bySource.get(src) || { source: src, label: formatSourceLabel(src), count: 0, grossCents: 0, feeCents: 0 };
    cur.count += 1;
    cur.grossCents += Number(it.amountCents || 0);
    cur.feeCents += Number(it.feeCents || 0);
    group.bySource.set(src, cur);
    brandGroupMap.set(key, group);
  }

  const profileComparisons = [];
  const coveredItemIds = new Set();

  const evaluateComparisonGroup = (group) => {
    if (group.bySource.size < 2) return null;
    const entries = Array.from(group.bySource.values())
      .filter((e) => e.grossCents > 0 && e.feeCents > 0)
      .map((e) => ({
        ...e,
        ratePct: Number(((e.feeCents / e.grossCents) * 100).toFixed(2)),
        exactRate: e.feeCents / e.grossCents
      }))
      .sort((a, b) => a.exactRate - b.exactRate);

    if (entries.length < 2) return null;
    const winner = entries[0];
    const loser = entries[entries.length - 1];
    const spreadPctPoints = Number(Math.max(0, loser.ratePct - winner.ratePct).toFixed(2));
    let potentialSavingsCents = 0;

    const enrichedEntries = entries.map((e, idx) => {
      const wouldPayCents = Math.round(e.grossCents * winner.exactRate);
      const excessFeeCents = idx === 0 ? 0 : Math.max(0, e.feeCents - wouldPayCents);
      potentialSavingsCents += excessFeeCents;
      return {
        source: e.source,
        label: e.label,
        count: e.count,
        grossCents: e.grossCents,
        feeCents: e.feeCents,
        ratePct: e.ratePct,
        excessFeeCents
      };
    });

    if (spreadPctPoints <= 0 && potentialSavingsCents <= 0) return null;

    return {
      key: group.key,
      label: group.label,
      modality: group.modality,
      brand: group.brand || '',
      matchScope: group.matchScope,
      cheapestSource: winner.source,
      cheapestLabel: winner.label,
      cheapestRatePct: winner.ratePct,
      mostExpensiveSource: loser.source,
      mostExpensiveLabel: loser.label,
      mostExpensiveRatePct: loser.ratePct,
      spreadPctPoints,
      potentialSavingsCents,
      entries: enrichedEntries
    };
  };

  for (const group of brandGroupMap.values()) {
    const evalRes = evaluateComparisonGroup(group);
    if (evalRes) {
      profileComparisons.push(evalRes);
      for (const it of group.items) {
        if (it?.id) coveredItemIds.add(it.id);
      }
    }
  }

  // Fallback por modalidade para transações cuja bandeira só apareceu em uma adquirente
  const modalityFallbackMap = new Map();
  for (const it of validItems) {
    if (it?.id && coveredItemIds.has(it.id)) continue;
    const modality = normalizeCardModality(it);
    const src = String(it.source || 'outro').trim().toUpperCase();
    const group = modalityFallbackMap.get(modality) || {
      key: `MOD__${modality}`,
      modality,
      brand: 'Demais bandeiras',
      matchScope: 'modality',
      label: `${modality} (demais bandeiras)`,
      items: [],
      bySource: new Map()
    };
    group.items.push(it);
    const cur = group.bySource.get(src) || { source: src, label: formatSourceLabel(src), count: 0, grossCents: 0, feeCents: 0 };
    cur.count += 1;
    cur.grossCents += Number(it.amountCents || 0);
    cur.feeCents += Number(it.feeCents || 0);
    group.bySource.set(src, cur);
    modalityFallbackMap.set(modality, group);
  }
  for (const group of modalityFallbackMap.values()) {
    const evalRes = evaluateComparisonGroup(group);
    if (evalRes) profileComparisons.push(evalRes);
  }

  profileComparisons.sort((a, b) => b.potentialSavingsCents - a.potentialSavingsCents);

  const optimalRoutingSavingsCents = profileComparisons.reduce((s, p) => s + Number(p.potentialSavingsCents || 0), 0);
  const headlineSavingsCents = optimalRoutingSavingsCents > 0 ? optimalRoutingSavingsCents : globalAverageSavingsCents;
  const monthlyProjectedSavingsCents = headlineSavingsCents * 30;

  const recommendations = profileComparisons
    .filter((p) => p.potentialSavingsCents > 0)
    .map(
      (p) =>
        `${p.label}: use ${p.cheapestLabel} (${p.cheapestRatePct.toFixed(2).replace('.', ',')}%) em vez de ${p.mostExpensiveLabel} (${p.mostExpensiveRatePct.toFixed(2).replace('.', ',')}%) • diferença de ${p.spreadPctPoints.toFixed(2).replace('.', ',')} p.p.`
    );

  if (recommendations.length === 0 && hasMultipleSources && globalAverageSavingsCents > 0 && cheapestSource && mostExpensiveSource) {
    recommendations.push(
      `Taxa média global: ${cheapestSource.label} (${cheapestSource.effectiveRatePct.toFixed(2).replace('.', ',')}%) vs ${mostExpensiveSource.label} (${mostExpensiveSource.effectiveRatePct.toFixed(2).replace('.', ',')}%) • diferença de ${rateSpreadPctPoints.toFixed(2).replace('.', ',')} p.p.`
    );
  }

  return {
    hasMultipleSources,
    sources,
    cheapestSource,
    mostExpensiveSource,
    rateSpreadPctPoints,
    profileComparisons,
    optimalRoutingSavingsCents,
    globalAverageSavingsCents,
    headlineSavingsCents,
    monthlyProjectedSavingsCents,
    recommendations
  };
}

export function buildHealthMetricDetail(result = {}, metricKey = '') {
  const metrics = result.financialMetrics || {};
  const audit = result.auditInsights || {};
  const realItems = Array.isArray(result.realItems) ? result.realItems : [];
  const systemItems = Array.isArray(result.systemItems) ? result.systemItems : [];
  const drawer = result.cashDrawerSummary || {};
  const getMirror = (k) => (result.mirrorRows || []).find(r => r.key === k) || { systemCents: 0, realCents: 0, diffCents: 0 };

  if (metricKey === 'fees') {
    const feeItems = realItems
      .filter(it => Number(it.feeCents || 0) > 0)
      .sort((a, b) => Number(b.feeCents || 0) - Number(a.feeCents || 0));
    const cardItemsForComp = realItems.filter(it => it.category === 'cartao' || Number(it.feeCents || 0) > 0);
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
    const comparison = buildAcquirerFeeComparison(cardItemsForComp);
    const totalCardGrossCents = feeItems.reduce((s, it) => s + Number(it.amountCents || 0), 0);
    const totalFeeCents = Number(metrics.totalMdrFeeCents || 0);
    const avgEffectiveRatePct =
      totalCardGrossCents > 0 ? Number(((totalFeeCents / totalCardGrossCents) * 100).toFixed(2)) : 0;
    return {
      metricKey,
      totalFeeCents,
      totalCardGrossCents,
      totalCardNetCents: feeItems.reduce((s, it) => s + Number(it.netAmountCents ?? (Number(it.amountCents || 0) - Number(it.feeCents || 0))), 0),
      avgEffectiveRatePct,
      items: feeItems,
      bySource: Array.from(bySource.values()),
      comparison
    };
  }

  if (metricKey === 'net_digital') {
    const channelMap = new Map();
    for (const it of realItems) {
      const key = `${it.source || 'outro'}_${it.category || 'outros'}`;
      const label = `${String(it.source || '').toUpperCase()} (${String(it.category || '').toUpperCase()})`;
      const cur = channelMap.get(key) || { key, label, source: String(it.source || '').toUpperCase(), category: it.category || 'outros', count: 0, grossCents: 0, feeCents: 0, netCents: 0 };
      cur.count += 1;
      cur.grossCents += Number(it.amountCents || 0);
      cur.feeCents += Number(it.feeCents || 0);
      cur.netCents += Number(it.netAmountCents ?? it.amountCents ?? 0);
      channelMap.set(key, cur);
    }
    const totalDigitalGrossCents = realItems.reduce((s, it) => s + Number(it.amountCents || 0), 0);
    const channels = Array.from(channelMap.values()).map((ch) => ({
      ...ch,
      effectiveRatePct: ch.grossCents > 0 ? Number(((ch.feeCents / ch.grossCents) * 100).toFixed(2)) : 0,
      grossSharePct: totalDigitalGrossCents > 0 ? Math.round((ch.grossCents / totalDigitalGrossCents) * 100) : 0
    }));
    const comparison = buildAcquirerFeeComparison(realItems.filter((it) => it.category === 'cartao' || Number(it.feeCents || 0) > 0));
    return {
      metricKey,
      totalNetDigitalCents: Number(metrics.totalNetDigitalCents || 0),
      totalDigitalGrossCents,
      totalFeeCents: Number(metrics.totalMdrFeeCents || 0),
      channels,
      comparison
    };
  }

  if (metricKey === 'cancelled') {
    const detailed = Array.isArray(audit.cancelledDetails) ? audit.cancelledDetails : [];
    const fallbackItems = Array.isArray(metrics.cancelledItems) ? metrics.cancelledItems : [];
    const cancelledCents = Number(metrics.cancelledCents || 0);
    const totalSalesRef = Math.max(Number(result.systemTotalCents || 0), 1);
    const impactPctOfSales = Number(((cancelledCents / totalSalesRef) * 100).toFixed(2));

    const byReasonMap = new Map();
    const byWaiterMap = new Map();
    const byGroupMap = new Map();

    for (const it of detailed) {
      const reasonLabel = (it.reason && it.reason !== '-') ? it.reason : (it.reasonDetails || 'Motivo não especificado');
      const rKey = reasonLabel.toUpperCase();
      const rCur = byReasonMap.get(rKey) || { reason: reasonLabel, count: 0, totalCents: 0, waiters: new Set() };
      rCur.count += 1;
      rCur.totalCents += Number(it.totalCents || 0);
      if (it.waiter && it.waiter !== '-') rCur.waiters.add(it.waiter);
      byReasonMap.set(rKey, rCur);

      const waiterName = String(it.waiter || it.operator || 'Não informado').trim() || 'Não informado';
      const wKey = waiterName.toUpperCase();
      const wCur = byWaiterMap.get(wKey) || { name: waiterName, count: 0, totalCents: 0, tables: new Set() };
      wCur.count += 1;
      wCur.totalCents += Number(it.totalCents || 0);
      if (it.table) wCur.tables.add(it.table);
      byWaiterMap.set(wKey, wCur);

      const grpName = String(it.group || 'OUTROS').trim() || 'OUTROS';
      const gCur = byGroupMap.get(grpName) || { group: grpName, count: 0, totalCents: 0 };
      gCur.count += 1;
      gCur.totalCents += Number(it.totalCents || 0);
      byGroupMap.set(grpName, gCur);
    }

    const byReason = Array.from(byReasonMap.values())
      .map((x) => ({
        reason: x.reason,
        count: x.count,
        totalCents: x.totalCents,
        waiters: Array.from(x.waiters)
      }))
      .sort((a, b) => b.totalCents - a.totalCents || b.count - a.count);

    const byWaiter = Array.from(byWaiterMap.values())
      .map((x) => ({
        name: x.name,
        count: x.count,
        totalCents: x.totalCents,
        tablesCount: x.tables.size
      }))
      .sort((a, b) => b.totalCents - a.totalCents || b.count - a.count);

    const byGroup = Array.from(byGroupMap.values()).sort((a, b) => b.totalCents - a.totalCents);

    return {
      metricKey,
      cancelledCount: Number(metrics.cancelledCount || detailed.length || 0),
      cancelledCents,
      impactPctOfSales,
      byReason,
      byWaiter,
      byGroup,
      items: fallbackItems,
      detailedItems: detailed
    };
  }

  if (metricKey === 'discounts') {
    const discountDetails = Array.isArray(audit.discountDetails) ? audit.discountDetails : [];
    const discountsCents = Number(metrics.discountsCents || 0);
    const internalConsumptionCents = Number(metrics.internalConsumptionCents || 0);
    const internalConsumptionCostCents = Number(audit.internalConsumptionCostCents || 0);
    const systemTotalCents = Number(result.systemTotalCents || 0);

    const byEmployeeMap = new Map();
    const byReasonMap = new Map();
    for (const d of discountDetails) {
      const emp = String(d.employee || 'Não identificado').trim() || 'Não identificado';
      const eCur = byEmployeeMap.get(emp.toUpperCase()) || { employee: emp, count: 0, totalCents: 0 };
      eCur.count += 1;
      eCur.totalCents += Number(d.amountCents || 0);
      byEmployeeMap.set(emp.toUpperCase(), eCur);

      const rsn = String(d.reason || d.source || 'Desconto').trim() || 'Desconto';
      const rCur = byReasonMap.get(rsn.toUpperCase()) || { reason: rsn, count: 0, totalCents: 0 };
      rCur.count += 1;
      rCur.totalCents += Number(d.amountCents || 0);
      byReasonMap.set(rsn.toUpperCase(), rCur);
    }

    const internalConsumptionItems = systemItems
      .filter(
        (s) =>
          s &&
          (s.subCategory === 'consumo_interno' ||
            /consumo\s*interno/i.test(`${s.metadata?.formaPagto || ''} ${s.description || ''}`))
      )
      .map((s) => ({
        id: s.id,
        orderNumber: s.referenceCode || s.metadata?.orderDetail?.orderNumber || '',
        description: s.description || 'Consumo Interno',
        timeStr: s.timeStr || '',
        operatorName: s.operatorName || '',
        terminalName: s.terminalName || '',
        amountCents: Number(s.amountCents || 0),
        items: Array.isArray(s.metadata?.orderDetail?.items) ? s.metadata.orderDetail.items : []
      }))
      .sort((a, b) => b.amountCents - a.amountCents);

    const totalBenefitCents = discountsCents + internalConsumptionCents;
    const impactPctOfSales = systemTotalCents > 0 ? Number(((totalBenefitCents / systemTotalCents) * 100).toFixed(2)) : 0;

    return {
      metricKey,
      discountsCents,
      internalConsumptionCents,
      internalConsumptionCostCents,
      systemTotalCents,
      totalBenefitCents,
      impactPctOfSales,
      byEmployee: Array.from(byEmployeeMap.values()).sort((a, b) => b.totalCents - a.totalCents),
      byReason: Array.from(byReasonMap.values()).sort((a, b) => b.totalCents - a.totalCents),
      internalConsumptionItems,
      discountDetails
    };
  }

  if (metricKey === 'delivery_house_fees') {
    const deliveryFeeCents = Number(metrics.deliveryFeeCents || 0);
    const serviceFeeCents = Number(metrics.serviceFeeCents || 0);
    const feeRemovals = Array.isArray(audit.feeRemovals) ? audit.feeRemovals : [];

    // Extrai pedidos Delivery do PDV para detalhar taxa de entrega média e volume de entregas
    const seenDeliveryKeys = new Set();
    const deliveryOrders = [];
    const seenServiceKeys = new Set();
    const serviceFeeOrders = [];

    for (const s of systemItems) {
      if (!s) continue;
      const modRaw = `${s.metadata?.orderDetail?.module || ''} ${s.metadata?.modulo || ''} ${s.description || ''}`.toUpperCase();
      const orderNum = String(s.referenceCode || s.metadata?.orderDetail?.orderNumber || s.id).trim();
      const scopeKey = s.metadata?.orderDetail?.scopeKey || `${modRaw}_${orderNum}_${s.timeStr || ''}`;

      if (modRaw.includes('DELIVERY') || modRaw.includes('IFOOD') || modRaw.includes('ENTREGA')) {
        if (!seenDeliveryKeys.has(scopeKey)) {
          seenDeliveryKeys.add(scopeKey);
          const od = s.metadata?.orderDetail;
          const totalOrder = Number(od?.totalPaidCents ?? s.amountCents ?? 0);
          const itemsSub = Number(od?.itemsSubtotalCents || 0);
          const inferredFee = itemsSub > 0 && totalOrder > itemsSub ? totalOrder - itemsSub : 0;
          deliveryOrders.push({
            id: s.id,
            orderNumber: orderNum,
            description: s.description || '',
            timeStr: s.timeStr || '',
            operatorName: s.operatorName || '',
            amountCents: totalOrder,
            itemsSubtotalCents: itemsSub,
            inferredFeeCents: inferredFee,
            itemsCount: Array.isArray(od?.items) ? od.items.length : 0
          });
        }
      }

      const odSvcFee = Number(s.metadata?.orderDetail?.serviceFeeCents || 0);
      if (odSvcFee > 0 && !seenServiceKeys.has(scopeKey)) {
        seenServiceKeys.add(scopeKey);
        serviceFeeOrders.push({
          id: s.id,
          orderNumber: orderNum,
          module: s.metadata?.orderDetail?.module || s.metadata?.modulo || 'MESA',
          timeStr: s.timeStr || '',
          waiters: Array.isArray(s.metadata?.orderDetail?.waiters) ? s.metadata.orderDetail.waiters : [],
          itemsSubtotalCents: Number(s.metadata?.orderDetail?.itemsSubtotalCents || 0),
          serviceFeeCents: odSvcFee,
          totalPaidCents: Number(s.metadata?.orderDetail?.totalPaidCents || s.amountCents || 0)
        });
      }
    }

    deliveryOrders.sort((a, b) => (b.timeStr || '').localeCompare(a.timeStr || ''));
    serviceFeeOrders.sort((a, b) => b.serviceFeeCents - a.serviceFeeCents);

    const deliveryGrossCents = deliveryOrders.reduce((s, d) => s + d.amountCents, 0);
    const avgDeliveryFeeCents =
      deliveryOrders.length > 0 && deliveryFeeCents > 0 ? Math.round(deliveryFeeCents / deliveryOrders.length) : 0;

    let estimatedLostServiceFeeCents = 0;
    const removalWaiterMap = new Map();
    for (const fr of feeRemovals) {
      const lost = Math.round(Number(fr.totalCents || 0) * 0.1);
      estimatedLostServiceFeeCents += lost;
      const wName = String(fr.waiter || fr.operator || 'Não informado').trim() || 'Não informado';
      const cur = removalWaiterMap.get(wName.toUpperCase()) || { name: wName, count: 0, baseTotalCents: 0, estimatedLostCents: 0 };
      cur.count += 1;
      cur.baseTotalCents += Number(fr.totalCents || 0);
      cur.estimatedLostCents += lost;
      removalWaiterMap.set(wName.toUpperCase(), cur);
    }

    return {
      metricKey,
      deliveryFeeCents,
      serviceFeeCents,
      totalCents: deliveryFeeCents + serviceFeeCents,
      deliveryOrdersCount: deliveryOrders.length,
      deliveryGrossCents,
      avgDeliveryFeeCents,
      deliveryOrders,
      serviceFeeOrders,
      estimatedLostServiceFeeCents,
      feeRemovalsByWaiter: Array.from(removalWaiterMap.values()).sort((a, b) => b.estimatedLostCents - a.estimatedLostCents),
      feeRemovals
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

const WEEKDAY_SHORT_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * Formata a data (ou intervalo) de referência do caixa com dia da semana para destaque visual no cabeçalho.
 */
export function formatDateHeaderBadge(startDate, endDate = '') {
  const startBr = formatDateBr(startDate);
  if (!startBr) return '';
  const endBr = formatDateBr(endDate);
  if (endBr && endBr !== startBr) {
    return `${startBr} a ${endBr}`;
  }
  const isoMatch = String(startDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const dt = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    const weekday = WEEKDAY_SHORT_PT[dt.getDay()];
    return weekday ? `${startBr} (${weekday})` : startBr;
  }
  return startBr;
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

export const RECONCILIATION_GLOSSARY = {
  missing: {
    title: 'Vendas sem recebimento',
    shortLabel: 'Falta no banco',
    explanation: 'A venda está no PDV. Falta localizar o recebimento no banco.',
    actionHint: 'Verifique se caiu em outro canal (Cartão ↔ PIX), em Dinheiro ou se ficou Pendente.'
  },
  extra: {
    title: 'Recebimentos sem venda',
    shortLabel: 'Sobra no banco',
    explanation: 'O recebimento está no banco. Falta localizar a venda no PDV.',
    actionHint: 'Vincule a uma venda ao lado ou clique em Ignorar (Não-PDV) se for transferência/dia anterior.'
  }
};

/**
 * Monta o pool de vendas do PDV elegíveis para vínculo manual (faltas digitais + Dinheiro em aberto).
 * Notas Pendentes (fiado) já estão resolvidas no fechamento e não entram em vínculos de banco/maquininha.
 */
export function buildLinkableSystemPool(result = {}, manualResolutions = []) {
  const missing = Array.isArray(result?.missingInBank) ? result.missingInBank : [];
  const matchedSysIds = new Set();
  for (const m of result?.matchedPairs || []) {
    for (const s of m?.systemItems || []) {
      if (s?.id) matchedSysIds.add(s.id);
    }
  }
  const ignoredSysIds = new Set();
  for (const res of manualResolutions || []) {
    if (res?.action === 'ignore_item') {
      for (const sid of res?.systemIds || []) ignoredSysIds.add(sid);
    }
  }

  const openCashItems = (result?.systemItems || []).filter(
    (s) =>
      s &&
      !matchedSysIds.has(s.id) &&
      !ignoredSysIds.has(s.id) &&
      s.category === 'dinheiro'
  );

  const seen = new Set();
  const combined = [];
  for (const item of [...missing, ...openCashItems]) {
    if (item?.id && !seen.has(item.id)) {
      seen.add(item.id);
      combined.push(item);
    }
  }
  return combined;
}

/**
 * Resume todos os valores não conciliados e divergências por canal que explicam a Diferença Geral.
 */
export function buildGeneralDiffSummary(result = {}) {
  const missingItems = Array.isArray(result?.missingInBank) ? result.missingInBank : [];
  const extraItems = Array.isArray(result?.extraInBank) ? result.extraInBank : [];
  const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
  const mirrorRows = Array.isArray(result?.mirrorRows) ? result.mirrorRows : [];
  const matchedPairs = Array.isArray(result?.matchedPairs) ? result.matchedPairs : [];

  const sumAmounts = (list) => list.reduce((acc, it) => acc + Number(it?.amountCents || 0), 0);
  const missingCents = sumAmounts(missingItems);
  const extraCents = sumAmounts(extraItems);
  const suggestionsCents = sumAmounts(suggestions);
  const tableNetDigitalCents = extraCents - missingCents;

  const divergentMirrorRows = mirrorRows.filter(
    (r) => r && (Number(r.diffCents || 0) !== 0 || (r.hasRealInput === false && Number(r.systemCents || 0) > 0))
  );
  const uninformedMirrorRows = mirrorRows.filter(
    (r) => r && r.hasRealInput === false && Number(r.systemCents || 0) > 0
  );
  const uninformedDiffCents = uninformedMirrorRows.reduce((acc, r) => acc + Number(r.diffCents || 0), 0);

  const cashDrawerRow = mirrorRows.find((r) => r && r.key === 'saldo_dinheiro') || null;
  const cashDrawerDiffCents = Number(cashDrawerRow?.diffCents || 0);
  const cashDrawerHasRealInput = cashDrawerRow ? cashDrawerRow.hasRealInput !== false : true;

  const otherNonDigitalRows = mirrorRows.filter(
    (r) =>
      r &&
      r.key !== 'cartao' &&
      r.key !== 'pix' &&
      r.key !== 'saldo_dinheiro' &&
      (Number(r.diffCents || 0) !== 0 || (r.hasRealInput === false && Number(r.systemCents || 0) > 0))
  );
  const otherChannelsDiffCents = otherNonDigitalRows.reduce((acc, r) => acc + Number(r.diffCents || 0), 0);

  const digitalMirrorDiffCents = mirrorRows
    .filter((r) => r && (r.key === 'cartao' || r.key === 'pix'))
    .reduce((acc, r) => acc + Number(r.diffCents || 0), 0);

  const matchedPairsWithDiff = [];
  for (const pair of matchedPairs) {
    if (!pair) continue;
    const sysList = Array.isArray(pair.systemItems) ? pair.systemItems : [];
    const realList = Array.isArray(pair.realItems) ? pair.realItems : [];
    const touchesNonDigital =
      sysList.some((s) => s && s.category !== 'pix' && s.category !== 'cartao') ||
      realList.some((r) => r && r.category !== 'pix' && r.category !== 'cartao');
    if (touchesNonDigital) continue;

    const sysSumCents = sumAmounts(sysList);
    const realSumCents = sumAmounts(realList);
    const diffCents = realSumCents - sysSumCents;
    if (diffCents !== 0) {
      matchedPairsWithDiff.push({
        id: pair.id || `pair_diff_${matchedPairsWithDiff.length}`,
        reasonType: pair.reasonType || '',
        reasonText: pair.reasonText || '',
        sysSumCents,
        realSumCents,
        diffCents
      });
    }
  }
  const matchedPairsDiffCents = matchedPairsWithDiff.reduce((acc, p) => acc + p.diffCents, 0);
  const digitalResidualDiffCents = digitalMirrorDiffCents - tableNetDigitalCents - matchedPairsDiffCents;

  const diffTotalCents = Number.isFinite(Number(result?.diffTotalCents))
    ? Number(result.diffTotalCents)
    : digitalMirrorDiffCents + cashDrawerDiffCents + otherChannelsDiffCents;
  const nonTableDiffCents = diffTotalCents - tableNetDigitalCents;
  const explainedDiffTotalCents =
    tableNetDigitalCents + matchedPairsDiffCents + digitalResidualDiffCents + cashDrawerDiffCents + otherChannelsDiffCents;

  return {
    missingItems,
    extraItems,
    suggestions,
    missingCents,
    extraCents,
    suggestionsCents,
    tableNetDigitalCents,
    netDigitalPendingCents: tableNetDigitalCents,
    cashDrawerRow,
    cashDrawerDiffCents,
    cashDrawerHasRealInput,
    otherNonDigitalRows,
    otherChannelsDiffCents,
    matchedPairsWithDiff,
    matchedPairsDiffCents,
    digitalMirrorDiffCents,
    digitalResidualDiffCents,
    nonTableDiffCents,
    explainedDiffTotalCents,
    divergentMirrorRows,
    uninformedMirrorRows,
    uninformedDiffCents,
    totalPendingCount: missingItems.length + extraItems.length + suggestions.length
  };
}

/**
 * Calcula saldo e status de compatibilidade da seleção atual na Tabela Lado a Lado.
 */
export function computeSelectionDiffMeta({ selectedSystemItems = [], selectedRealItems = [] } = {}) {
  const sysList = Array.isArray(selectedSystemItems) ? selectedSystemItems : [];
  const realList = Array.isArray(selectedRealItems) ? selectedRealItems : [];
  const sysTotalCents = sysList.reduce((acc, it) => acc + Number(it?.amountCents || 0), 0);
  const realTotalCents = realList.reduce((acc, it) => acc + Number(it?.amountCents || 0), 0);
  const hasBothSides = sysList.length > 0 && realList.length > 0;
  const diffCents = realTotalCents - sysTotalCents;
  const absDiff = Math.abs(diffCents);

  return {
    sysCount: sysList.length,
    realCount: realList.length,
    sysTotalCents,
    realTotalCents,
    diffCents,
    absDiffCents: absDiff,
    isExactMatch: hasBothSides && absDiff <= 1,
    isCloseMatch: hasBothSides && absDiff <= 200,
    canLink: hasBothSides
  };
}

/**
 * Ordena itens do lado oposto destacando quem bate exatamente ou se aproxima do valor selecionado.
 */
export function sortItemsByTargetMatch(items = [], targetCents = 0, targetSecondsOfDay = null) {
  const list = Array.isArray(items) ? items : [];
  const target = Number(targetCents || 0);
  if (target <= 0) {
    return list.map((item) => ({ item, matchRank: 'none', amountDiffCents: 0 }));
  }

  const annotated = list.map((item, idx) => {
    const amt = Number(item?.amountCents || 0);
    const amountDiffCents = Math.abs(amt - target);
    let timeDiffSec = Number.POSITIVE_INFINITY;
    if (Number.isFinite(targetSecondsOfDay) && Number.isFinite(Number(item?.secondsOfDay))) {
      const sec = Number(item.secondsOfDay);
      timeDiffSec = Math.abs(sec - Number(targetSecondsOfDay));
      if (item?.source === 'rede' && sec < 12 * 3600 && Number(targetSecondsOfDay) >= 12 * 3600) {
        timeDiffSec = Math.min(timeDiffSec, Math.abs(sec + 12 * 3600 - Number(targetSecondsOfDay)));
      }
    }
    const matchRank = amountDiffCents <= 1 ? 'exact' : amountDiffCents <= 200 ? 'close' : 'none';
    const priority = matchRank === 'exact' ? 0 : matchRank === 'close' ? 1 : 2;
    return { item, matchRank, amountDiffCents, timeDiffSec, priority, idx };
  });

  annotated.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.priority < 2) {
      if (a.amountDiffCents !== b.amountDiffCents) return a.amountDiffCents - b.amountDiffCents;
      if (a.timeDiffSec !== b.timeDiffSec) return a.timeDiffSec - b.timeDiffSec;
    }
    return a.idx - b.idx;
  });

  return annotated.map(({ item, matchRank, amountDiffCents }) => ({ item, matchRank, amountDiffCents }));
}

function stableJsonSerialize(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableJsonSerialize(v)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .filter((k) => value[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableJsonSerialize(value[k])}`)
    .join(',')}}`;
}

/**
 * Gera assinaturas determinísticas do estado da conferência para evitar gravar arquivos/itens em duplicidade durante o auto-save.
 */
export function buildCashDraftSyncSignature({
  activeSessionId = null,
  files = [],
  manualInputs = {},
  manualResolutions = [],
  aiAnalysis = null
} = {}) {
  const validFiles = (Array.isArray(files) ? files : []).filter((f) => f && f.parsed && f.parsed.status === 'ok');
  const filesSignature = validFiles
    .map((f) => {
      const p = f.parsed;
      const rowsCount = Array.isArray(p.rows) ? p.rows.length : 0;
      return `${f.fileName || p.fileName || ''}|${p.fileType || ''}|${p.periodStart || ''}|${p.periodEnd || ''}|${rowsCount}|${Number(f.fileSizeBytes || 0)}`;
    })
    .join(';;');

  const resolutionsSignature = stableJsonSerialize(Array.isArray(manualResolutions) ? manualResolutions : []);
  const inputsSignature = stableJsonSerialize(manualInputs || {});
  const aiSignature = stableJsonSerialize(aiAnalysis || null);
  const stateSignature = `${activeSessionId || ''}::${filesSignature}::${resolutionsSignature}::${inputsSignature}::${aiSignature}`;

  return {
    hasValidFiles: validFiles.length > 0,
    filesSignature,
    resolutionsSignature,
    inputsSignature,
    stateSignature
  };
}

/**
 * Decide se o rascunho local deve sobrepor o snapshot remoto ao reabrir uma sessão (ex.: fechado offline antes da nuvem responder).
 */
export function shouldPreferLocalDraftOverSession(localDraft, cloudSession) {
  if (!localDraft || !cloudSession) return false;
  if (!localDraft.activeSessionId || localDraft.activeSessionId !== cloudSession.id) return false;
  if (localDraft.pendingCloudSync) return true;
  const localTs = Date.parse(localDraft.updatedAt || '');
  const cloudTs = Date.parse(cloudSession.updated_at || cloudSession.created_at || '');
  return Number.isFinite(localTs) && (!Number.isFinite(cloudTs) || localTs > cloudTs);
}

/**
 * Aplica preenchimentos padrão no espelho aberto (Só Sangria R$ 0,00 na gaveta e Pendentes REAL = SISTEMA),
 * preservando edições manuais do usuário, rascunhos legados com override próprio e sessões já fechadas.
 */
export function buildDefaultManualInputsPatch(
  manualInputs = {},
  reconciliationResult = null,
  { isClosedSession = false } = {}
) {
  if (isClosedSession || !reconciliationResult) return null;

  const current = manualInputs && typeof manualInputs === 'object' ? manualInputs : {};
  const patch = {};
  let changed = false;

  const hasCashCounted =
    current.cashCountedCents !== undefined && current.cashCountedCents !== null;
  if (!hasCashCounted && current.cashDrawerZeroConfirmed === undefined) {
    patch.cashCountedCents = 0;
    patch.cashDrawerZeroConfirmed = true;
    changed = true;
  }

  const pendentesRow = Array.isArray(reconciliationResult.mirrorRows)
    ? reconciliationResult.mirrorRows.find((r) => r && r.key === 'pendentes')
    : null;
  const sysPendentesCents = Number(pendentesRow?.systemCents || 0);
  const currentOverrides =
    current.categoryRealOverrides && typeof current.categoryRealOverrides === 'object'
      ? current.categoryRealOverrides
      : {};
  const hasExplicitPendentes = currentOverrides.pendentes !== undefined;
  const userTouchedPendentes = Boolean(current.pendentesTouched);
  const canAutoFillPendentes =
    !userTouchedPendentes && (!hasExplicitPendentes || Boolean(current.pendentesAutoSynced));

  if (
    sysPendentesCents > 0 &&
    canAutoFillPendentes &&
    (!hasExplicitPendentes || Number(currentOverrides.pendentes) !== sysPendentesCents || current.pendentesAutoSynced !== true)
  ) {
    patch.categoryRealOverrides = {
      ...currentOverrides,
      pendentes: sysPendentesCents
    };
    patch.pendentesAutoSynced = true;
    changed = true;
  }

  return changed ? patch : null;
}

/**
 * Indexa itens de sistema ↔ recebimentos bancários vinculados para consulta bidirecional nos detalhes.
 */
export function buildPairedItemsByIdMap(matchedPairs = []) {
  const map = new Map();
  for (const pair of matchedPairs || []) {
    const sysItems = Array.isArray(pair?.systemItems) ? pair.systemItems : [];
    const realItems = Array.isArray(pair?.realItems) ? pair.realItems : [];
    for (const s of sysItems) {
      if (!s?.id) continue;
      const existing = map.get(s.id) || [];
      map.set(s.id, existing.length > 0 ? [...existing, ...realItems] : [...realItems]);
    }
    for (const r of realItems) {
      if (!r?.id) continue;
      const existing = map.get(r.id) || [];
      map.set(r.id, existing.length > 0 ? [...existing, ...sysItems] : [...sysItems]);
    }
  }
  return map;
}

/**
 * Monta o plano estruturado de ação para levar o caixa da Saúde atual até 100%,
 * gerando pares rápidos de batimento e dicas focadas na diferença real (sobra/falta).
 */
export function buildCashHealthActionPlan(result = {}) {
  const breakdown = result?.healthBreakdown || {};
  const rawHealthScore = Math.max(
    0,
    Math.min(100, Math.round(Number(breakdown.rawHealthScore ?? result?.rawHealthScore ?? result?.healthScore ?? 0)))
  );
  const effectiveHealthScore = Math.max(0, Math.min(100, Math.round(Number(result?.healthScore ?? rawHealthScore))));
  const isForcedBalanced = Boolean(result?.isForcedBalanced);
  const diffTotalCents = Math.round(Number(result?.diffTotalCents || 0));

  const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
  const missingInBank = Array.isArray(result?.missingInBank) ? result.missingInBank : [];
  const extraInBank = Array.isArray(result?.extraInBank) ? result.extraInBank : [];
  const drawer = result?.cashDrawerSummary || {};
  const warnings = Array.isArray(result?.periodDiagnostics?.validationWarnings)
    ? result.periodDiagnostics.validationWarnings
    : [];
  const criticalWarnings = warnings.filter((w) => w && (w.severity === 'error' || w.severity === 'warning'));

  const smallDiffCount = suggestions.filter(
    (s) => s.reasonType === 'small_diff' || s.reasonType === 'high_similarity'
  ).length;
  const nonDrawerSugCount = suggestions.filter(
    (s) => s.reasonType !== 'cash_to_pending' && s.reasonType !== 'surplus_to_cash'
  ).length;
  const structuralSugCount = Math.max(0, nonDrawerSugCount - smallDiffCount);

  const sugRecoverablePts = Math.round((structuralSugCount * 2.5 + smallDiffCount * 1.5) * 10) / 10;
  const missingRecoverablePts = missingInBank.length * 3;
  const extraRecoverablePts = extraInBank.length * 2;
  const unmatchedRecoverablePts = missingRecoverablePts + extraRecoverablePts;
  const diffPenaltyPts = Number(breakdown.diffPenaltyPts || 0);

  const mirrorRows = Array.isArray(result?.mirrorRows) ? result.mirrorRows : [];
  const cashRow = mirrorRows.find((r) => r && r.key === 'saldo_dinheiro') || null;
  const cashDiffCents = Number(cashRow?.diffCents || 0);
  const drawerUninformed = drawer.countedCents === null && !cashRow?.hasRealInput;

  const steps = [];

  if (suggestions.length > 0) {
    steps.push({
      key: 'suggestions',
      priority: 1,
      title: `Revisar ${suggestions.length} sugestão(ões) pronta(s) do auditor`,
      description: 'Confirmar ou rejeitar as sugestões já calculadas pelo sistema reduz faltas e sobras em 1 clique.',
      pendingCount: suggestions.length,
      recoverablePoints: Math.max(1, sugRecoverablePts),
      actionLabel: 'Abrir Sugestões',
      targetMode: 'sugestoes'
    });
  }

  if (missingInBank.length > 0 || extraInBank.length > 0) {
    steps.push({
      key: 'unmatched',
      priority: 2,
      title: `Bater ${missingInBank.length} venda(s) PDV × ${extraInBank.length} entrada(s) do Banco`,
      description:
        diffTotalCents !== 0
          ? `Use os pares rápidos abaixo para explicar ${diffTotalCents > 0 ? 'a sobra de +' : 'a falta de -'}R$ ${(Math.abs(diffTotalCents) / 100).toFixed(2).replace('.', ',')} e zerar pendências.`
          : 'Vincule os recebimentos restantes lado a lado, troque a forma de pagamento ou justifique exceções.',
      pendingCount: missingInBank.length + extraInBank.length,
      recoverablePoints: unmatchedRecoverablePts,
      actionLabel: 'Ir p/ Batimento Rápido',
      targetMode: 'batimento'
    });
  }

  if (drawerUninformed || Math.abs(cashDiffCents) > 100) {
    steps.push({
      key: 'drawer',
      priority: 3,
      title: drawerUninformed
        ? 'Confirmar Dinheiro Contado na gaveta'
        : `Verificar diferença física de ${cashDiffCents > 0 ? '+' : '-'}R$ ${(Math.abs(cashDiffCents) / 100).toFixed(2).replace('.', ',')} na gaveta`,
      description: drawerUninformed
        ? 'Confirme Só Sangria (R$ 0,00) ou digite o valor físico contado na aba Espelho.'
        : 'Confira se algum pedido Delivery em Dinheiro foi Nota Pendente ou lance uma justificativa de gaveta.',
      pendingCount: 1,
      recoverablePoints: 0,
      actionLabel: 'Abrir Saldo em Dinheiro',
      targetMode: 'mirror_dinheiro'
    });
  }

  if (criticalWarnings.length > 0) {
    steps.push({
      key: 'warnings',
      priority: 4,
      title: `Checar ${criticalWarnings.length} alerta(s) de auditoria/arquivos`,
      description: criticalWarnings.map((w) => w.title).slice(0, 2).join(' • '),
      pendingCount: criticalWarnings.length,
      recoverablePoints: 0,
      actionLabel: 'Ver Alertas & Checklist',
      targetMode: 'checklist'
    });
  }

  // Pares rápidos recomendados entre Faltam (PDV) e Sobram (Banco) que ainda não foram fechados
  const quickPairs = [];
  for (const sys of missingInBank) {
    let bestReal = null;
    let bestScore = Infinity;
    for (const real of extraInBank) {
      const sAmt = Number(sys.amountCents || 0);
      const rAmt = Number(real.amountCents || 0);
      const maxAmt = Math.max(sAmt, rAmt, 1);
      const simPct = Math.round((1 - Math.abs(sAmt - rAmt) / maxAmt) * 100);
      if (simPct < 65 && Math.abs(sAmt - rAmt) > 1500) continue;

      let dt = Number.isFinite(sys.secondsOfDay) && Number.isFinite(real.secondsOfDay)
        ? Math.abs(sys.secondsOfDay - real.secondsOfDay)
        : 3600;
      if (real.source === 'rede' && real.secondsOfDay < 12 * 3600 && sys.secondsOfDay >= 12 * 3600) {
        dt = Math.min(dt, Math.abs(sys.secondsOfDay - (real.secondsOfDay + 12 * 3600)));
      }
      const sameCatPenalty = sys.category === real.category ? 0 : 120000;
      const score = (100 - simPct) * 100000 + sameCatPenalty + dt;
      if (score < bestScore) {
        bestScore = score;
        bestReal = { real, simPct, diffCents: rAmt - sAmt, dt };
      }
    }
    if (bestReal) {
      quickPairs.push({
        id: `qpair_${sys.id}_${bestReal.real.id}`,
        sysItems: [sys],
        realItems: [bestReal.real],
        similarityPct: bestReal.simPct,
        diffCents: bestReal.diffCents,
        sameCategory: sys.category === bestReal.real.category,
        timeDiffMin: Math.max(1, Math.round(bestReal.dt / 60)),
        explainsGlobalDiff:
          diffTotalCents !== 0 &&
          Math.abs(bestReal.diffCents - diffTotalCents) <= Math.max(300, Math.round(Math.abs(diffTotalCents) * 0.35))
      });
    }
  }
  quickPairs.sort((a, b) => b.similarityPct - a.similarityPct || a.timeDiffMin - b.timeDiffMin);

  const missingTotalCents = missingInBank.reduce((s, i) => s + Number(i.amountCents || 0), 0);
  const extraTotalCents = extraInBank.reduce((s, i) => s + Number(i.amountCents || 0), 0);

  return {
    rawHealthScore,
    effectiveHealthScore,
    isForcedBalanced,
    forcedReason: result?.forcedBalanced?.reason || '',
    pointsMissing: Math.max(0, 100 - rawHealthScore),
    diffTotalCents,
    cashDiffCents,
    missingTotalCents,
    extraTotalCents,
    tableNetDiffCents: extraTotalCents - missingTotalCents,
    diffPenaltyPts,
    sugRecoverablePts,
    missingRecoverablePts,
    extraRecoverablePts,
    unmatchedRecoverablePts,
    steps,
    quickPairs: quickPairs.slice(0, 8)
  };
}
