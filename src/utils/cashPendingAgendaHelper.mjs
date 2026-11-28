/**
 * Helper puro da Agenda Cross-Dias de Pendências de Caixa:
 * - Clientes em espera (falha no pagamento para cobrar/receber em outro dia)
 * - Notas / Cupons fiscais pendentes de compras em dinheiro na gaveta
 * Isolamento estrito por tenantId, merge resiliente e detecção de quitações bancárias cross-day.
 */

export const CASH_AGENDA_RULE_PATTERN = 'cash_pending_agenda:items';

export function buildCashAgendaStorageKey(tenantId) {
  return `cash_recon_agenda_${String(tenantId || 'default').trim()}`;
}

export function getTodayLocalIsoDate(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysToIsoDate(isoDate, days = 0) {
  const clean = String(isoDate || '').trim().slice(0, 10);
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return getTodayLocalIsoDate();
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + Math.round(Number(days || 0)));
  return d.toISOString().slice(0, 10);
}

function makeUid(prefix = 'ag') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeIso(raw, fallback = '') {
  const s = String(raw || '').trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return fallback;
}

function sanitizeAttachments(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((a) => a && typeof a.dataUrl === 'string' && a.dataUrl.trim().length > 0)
    .slice(0, 6)
    .map((a, idx) => ({
      id: String(a.id || `att_${idx}_${Date.now()}`),
      fileName: String(a.fileName || 'anexo').trim().slice(0, 120),
      mimeType: String(a.mimeType || 'image/jpeg').trim().slice(0, 80),
      dataUrl: String(a.dataUrl),
      uploadedAt: String(a.uploadedAt || new Date().toISOString())
    }));
}

function sanitizeHistory(rawHist) {
  if (!Array.isArray(rawHist)) return [];
  return rawHist
    .filter((h) => h && typeof h.text === 'string' && h.text.trim().length > 0)
    .slice(-40)
    .map((h, idx) => ({
      id: String(h.id || `hist_${idx}`),
      at: String(h.at || new Date().toISOString()),
      action: ['created', 'contacted', 'rescheduled', 'resolved', 'reopened', 'note'].includes(h.action)
        ? h.action
        : 'note',
      text: String(h.text).trim(),
      ...(h.author ? { author: String(h.author).trim() } : {})
    }));
}

export function normalizeCashAgendaItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  const tenantId = String(raw.tenantId || '').trim();
  if (!id || !tenantId) return null;

  const amountCents = Math.max(0, Math.round(Number(raw.amountCents || 0)));
  const originDate = normalizeIso(raw.originDate, getTodayLocalIsoDate());
  const dueDate = normalizeIso(raw.dueDate, addDaysToIsoDate(originDate, 1));
  const kind = raw.kind === 'missing_receipt' ? 'missing_receipt' : 'payment_awaiting';
  const status = ['waiting', 'resolved', 'cancelled'].includes(raw.status) ? raw.status : 'waiting';
  const createdAt = String(raw.createdAt || new Date().toISOString());
  const updatedAt = String(raw.updatedAt || createdAt);

  return {
    id,
    tenantId,
    kind,
    status,
    amountCents,
    originDate,
    dueDate,
    title: String(raw.title || (kind === 'missing_receipt' ? 'Nota / Cupom Pendente' : 'Cliente em Espera')).trim(),
    description: String(raw.description || '').trim(),
    customerOrSupplier: String(raw.customerOrSupplier || '').trim(),
    contactPhone: String(raw.contactPhone || '').replace(/\D+/g, '').slice(0, 15),
    operatorName: String(raw.operatorName || '').trim(),
    sourceSessionId: raw.sourceSessionId ? String(raw.sourceSessionId) : null,
    sourceItemId: raw.sourceItemId ? String(raw.sourceItemId) : null,
    sourceCategory: raw.sourceCategory ? String(raw.sourceCategory) : undefined,
    attachments: sanitizeAttachments(raw.attachments),
    history: sanitizeHistory(raw.history),
    resolvedAt: raw.resolvedAt ? String(raw.resolvedAt) : null,
    resolvedDate: raw.resolvedDate ? normalizeIso(raw.resolvedDate, '') || null : null,
    resolvedMethod: raw.resolvedMethod || undefined,
    resolvedSessionId: raw.resolvedSessionId ? String(raw.resolvedSessionId) : null,
    resolvedBankItemId: raw.resolvedBankItemId ? String(raw.resolvedBankItemId) : null,
    resolvedReceiptNumber: raw.resolvedReceiptNumber ? String(raw.resolvedReceiptNumber).trim() : '',
    resolvedNotes: raw.resolvedNotes ? String(raw.resolvedNotes).trim() : '',
    createdAt,
    updatedAt
  };
}

export function createCashAgendaItem(params = {}) {
  const nowIso = String(params.nowIso || new Date().toISOString());
  const originDate = normalizeIso(params.originDate, getTodayLocalIsoDate());
  const dueDate = normalizeIso(params.dueDate, addDaysToIsoDate(originDate, 1));
  const kind = params.kind === 'missing_receipt' ? 'missing_receipt' : 'payment_awaiting';
  const amountCents = Math.max(0, Math.round(Number(params.amountCents || 0)));

  const initialText =
    params.description && String(params.description).trim()
      ? String(params.description).trim()
      : kind === 'missing_receipt'
        ? 'Falta na gaveta registrada para entrega futura de nota/cupom fiscal.'
        : 'Pagamento não concluído no caixa — deixado em espera para cobrança.';

  const item = normalizeCashAgendaItem({
    id: params.id || makeUid('ag'),
    tenantId: String(params.tenantId || '').trim(),
    kind,
    status: 'waiting',
    amountCents,
    originDate,
    dueDate,
    title:
      params.title ||
      (kind === 'missing_receipt' ? 'Cupom / Nota Fiscal Pendente' : 'Cliente em Espera'),
    description: initialText,
    customerOrSupplier: params.customerOrSupplier || '',
    contactPhone: params.contactPhone || '',
    operatorName: params.operatorName || '',
    sourceSessionId: params.sourceSessionId || null,
    sourceItemId: params.sourceItemId || null,
    sourceCategory: params.sourceCategory || undefined,
    attachments: params.attachments || [],
    history: [
      {
        id: makeUid('h'),
        at: nowIso,
        action: 'created',
        text: initialText,
        ...(params.operatorName ? { author: String(params.operatorName).trim() } : {})
      }
    ],
    resolvedAt: null,
    resolvedDate: null,
    createdAt: nowIso,
    updatedAt: nowIso
  });

  if (!item) {
    throw new Error('Dados inválidos ao criar item na Agenda de Pendências.');
  }
  return item;
}

export function addCashAgendaNote(item, { action = 'note', text = '', author = '', attachments = [], nowIso } = {}) {
  const ts = String(nowIso || new Date().toISOString());
  const cleanText = String(text || '').trim();
  const nextAttachments = sanitizeAttachments([...(item.attachments || []), ...(attachments || [])]);
  const nextHistory = cleanText
    ? [
        ...(item.history || []),
        {
          id: makeUid('h'),
          at: ts,
          action,
          text: cleanText,
          ...(author ? { author: String(author).trim() } : {})
        }
      ]
    : [...(item.history || [])];

  return normalizeCashAgendaItem({
    ...item,
    attachments: nextAttachments,
    history: nextHistory,
    updatedAt: ts
  });
}

export function rescheduleCashAgendaItem(item, { newDueDate, reason = '', author = '', nowIso } = {}) {
  const ts = String(nowIso || new Date().toISOString());
  const targetDue = normalizeIso(newDueDate, addDaysToIsoDate(getTodayLocalIsoDate(), 1));
  const noteText = reason
    ? `Reagendado para ${targetDue.split('-').reverse().join('/')} (${String(reason).trim()})`
    : `Reagendado para ${targetDue.split('-').reverse().join('/')}`;

  return addCashAgendaNote(
    {
      ...item,
      dueDate: targetDue
    },
    { action: 'rescheduled', text: noteText, author, nowIso: ts }
  );
}

export function settleCashAgendaItem(
  item,
  {
    resolvedDate,
    resolvedMethod = 'pix',
    resolvedSessionId = null,
    resolvedBankItemId = null,
    resolvedReceiptNumber = '',
    resolvedNotes = '',
    attachments = [],
    author = '',
    nowIso
  } = {}
) {
  const ts = String(nowIso || new Date().toISOString());
  const effDate = normalizeIso(resolvedDate, getTodayLocalIsoDate());
  const summaryParts = [
    item.kind === 'missing_receipt' ? 'Nota/Cupom fiscal registrado' : 'Pagamento confirmado e quitado',
    `em ${effDate.split('-').reverse().join('/')}`,
    resolvedMethod ? `(${String(resolvedMethod).toUpperCase()})` : '',
    resolvedReceiptNumber ? `• Doc: ${String(resolvedReceiptNumber).trim()}` : '',
    resolvedNotes ? `• ${String(resolvedNotes).trim()}` : ''
  ].filter(Boolean);

  return normalizeCashAgendaItem({
    ...item,
    status: 'resolved',
    resolvedAt: ts,
    resolvedDate: effDate,
    resolvedMethod,
    resolvedSessionId,
    resolvedBankItemId,
    resolvedReceiptNumber,
    resolvedNotes,
    attachments: sanitizeAttachments([...(item.attachments || []), ...(attachments || [])]),
    history: [
      ...(item.history || []),
      {
        id: makeUid('h'),
        at: ts,
        action: 'resolved',
        text: summaryParts.join(' '),
        ...(author ? { author: String(author).trim() } : {})
      }
    ],
    updatedAt: ts
  });
}

export function reopenCashAgendaItem(item, { newDueDate, reason = '', author = '', nowIso } = {}) {
  const ts = String(nowIso || new Date().toISOString());
  const targetDue = normalizeIso(newDueDate, addDaysToIsoDate(getTodayLocalIsoDate(), 1));
  const noteText = reason
    ? `Reaberto p/ ${targetDue.split('-').reverse().join('/')} (${String(reason).trim()})`
    : `Pendência reaberta para ${targetDue.split('-').reverse().join('/')}`;

  return normalizeCashAgendaItem({
    ...item,
    status: 'waiting',
    dueDate: targetDue,
    resolvedAt: null,
    resolvedDate: null,
    resolvedMethod: undefined,
    resolvedSessionId: null,
    resolvedBankItemId: null,
    history: [
      ...(item.history || []),
      {
        id: makeUid('h'),
        at: ts,
        action: 'reopened',
        text: noteText,
        ...(author ? { author: String(author).trim() } : {})
      }
    ],
    updatedAt: ts
  });
}

export function evaluateAgendaNotifications(items = [], todayIso = getTodayLocalIsoDate()) {
  const cleanToday = normalizeIso(todayIso, getTodayLocalIsoDate());
  const normalized = (Array.isArray(items) ? items : []).map(normalizeCashAgendaItem).filter(Boolean);
  const waitingItems = normalized
    .filter((it) => it.status === 'waiting')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.amountCents - a.amountCents);
  const resolvedItems = normalized
    .filter((it) => it.status === 'resolved')
    .sort((a, b) => String(b.resolvedAt || b.updatedAt).localeCompare(String(a.resolvedAt || a.updatedAt)));

  const overdueItems = waitingItems.filter((it) => it.dueDate < cleanToday);
  const dueTodayItems = waitingItems.filter((it) => it.dueDate === cleanToday);
  const upcomingItems = waitingItems.filter((it) => it.dueDate > cleanToday);

  const paymentAwaitingCount = waitingItems.filter((it) => it.kind === 'payment_awaiting').length;
  const missingReceiptCount = waitingItems.filter((it) => it.kind === 'missing_receipt').length;

  const totalWaitingCents = waitingItems.reduce((s, it) => s + Number(it.amountCents || 0), 0);
  const totalOverdueOrTodayCents = [...overdueItems, ...dueTodayItems].reduce(
    (s, it) => s + Number(it.amountCents || 0),
    0
  );

  const urgency =
    overdueItems.length + dueTodayItems.length > 0
      ? 'urgent'
      : waitingItems.length > 0
        ? 'active'
        : 'clear';

  return {
    todayIso: cleanToday,
    openCount: waitingItems.length,
    overdueCount: overdueItems.length,
    dueTodayCount: dueTodayItems.length,
    upcomingCount: upcomingItems.length,
    resolvedCount: resolvedItems.length,
    paymentAwaitingCount,
    missingReceiptCount,
    totalWaitingCents,
    totalOverdueOrTodayCents,
    urgency,
    waitingItems,
    overdueItems,
    dueTodayItems,
    upcomingItems,
    resolvedItems
  };
}

/**
 * Em um fechamento futuro (ex.: 27/11), compara entradas bancárias sem par (extraInBank)
 * contra pendências abertas de recebimento de dias anteriores (ex.: R$ 72,00 de 23/11).
 */
export function findCrossDayAgendaMatchesForExtras(extraInBank = [], agendaItems = [], currentReferenceDate = '') {
  const extras = Array.isArray(extraInBank) ? extraInBank : [];
  const items = (Array.isArray(agendaItems) ? agendaItems : [])
    .map(normalizeCashAgendaItem)
    .filter((it) => it && it.status === 'waiting' && it.kind === 'payment_awaiting');

  const cleanRef = normalizeIso(currentReferenceDate, '');
  const candidates = [];

  for (const realItem of extras) {
    const rAmt = Math.round(Number(realItem?.amountCents || 0));
    if (rAmt <= 0) continue;

    let bestMatch = null;
    for (const agendaItem of items) {
      if (cleanRef && agendaItem.originDate === cleanRef) continue;
      const aAmt = Math.round(Number(agendaItem.amountCents || 0));
      const diffCents = rAmt - aAmt;
      const absDiff = Math.abs(diffCents);
      const maxAmt = Math.max(aAmt, rAmt, 1);
      const similarityPct = Math.round((1 - absDiff / maxAmt) * 100);
      if (absDiff > 300 && similarityPct < 92) continue;

      if (!bestMatch || similarityPct > bestMatch.similarityPct || absDiff < bestMatch.absDiff) {
        bestMatch = {
          realItem,
          agendaItem,
          similarityPct,
          diffCents,
          absDiff
        };
      }
    }

    if (bestMatch) {
      candidates.push(bestMatch);
    }
  }

  candidates.sort((a, b) => b.similarityPct - a.similarityPct || a.absDiff - b.absDiff);
  return candidates;
}

/**
 * Converte a baixa de uma Nota/Cupom Fiscal pendente em lançamento de justificativa de saída na gaveta.
 */
export function buildSettlementAdjustmentFromReceipt(agendaItem) {
  const docPart = agendaItem?.resolvedReceiptNumber ? `NF/Cupom ${agendaItem.resolvedReceiptNumber} • ` : 'Nota/Cupom • ';
  const originBr = normalizeIso(agendaItem?.originDate, '')
    ? agendaItem.originDate.split('-').reverse().join('/')
    : '';
  const detailText = agendaItem?.resolvedNotes || agendaItem?.description || agendaItem?.title || 'Compra em dinheiro';
  return {
    id: `adj_ag_${agendaItem?.id || Date.now()}`,
    direction: 'outflow',
    description: `${docPart}${detailText}${originBr ? ` (Pendência de ${originBr})` : ''}`.slice(0, 140),
    amountCents: Math.max(0, Math.round(Number(agendaItem?.amountCents || 0))),
    operator: agendaItem?.customerOrSupplier || agendaItem?.operatorName || '',
    createdAt: agendaItem?.resolvedAt || new Date().toISOString()
  };
}

export function mergeCashAgendaLists(localList = [], remoteList = []) {
  const byId = new Map();
  for (const raw of [...(Array.isArray(remoteList) ? remoteList : []), ...(Array.isArray(localList) ? localList : [])]) {
    const item = normalizeCashAgendaItem(raw);
    if (!item) continue;
    const prev = byId.get(item.id);
    if (!prev || String(item.updatedAt).localeCompare(String(prev.updatedAt)) >= 0) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))
  );
}

export function parseCashAgendaFromRules(rules = [], tenantId = '') {
  const cleanTenant = String(tenantId || '').trim();
  const list = Array.isArray(rules) ? rules : [];
  const matching = list
    .filter(
      (r) =>
        r &&
        (!cleanTenant || !r.tenant_id || r.tenant_id === cleanTenant) &&
        r.rule_type === 'engine_setting' &&
        r.is_active !== false &&
        String(r.pattern || '').trim() === CASH_AGENDA_RULE_PATTERN &&
        String(r.target_value || '').trim().length > 0
    )
    .sort((a, b) =>
      String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''))
    );

  if (matching.length === 0) return [];
  try {
    const parsed = JSON.parse(String(matching[0].target_value));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCashAgendaItem).filter(Boolean);
  } catch {
    return [];
  }
}

export function loadCashAgendaFromStorage(storage, tenantId) {
  if (!storage || !tenantId) return [];
  try {
    const raw = storage.getItem(buildCashAgendaStorageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCashAgendaItem).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveCashAgendaToStorage(storage, tenantId, items = []) {
  if (!storage || !tenantId) return;
  try {
    const normalized = (Array.isArray(items) ? items : []).map(normalizeCashAgendaItem).filter(Boolean);
    storage.setItem(buildCashAgendaStorageKey(tenantId), JSON.stringify(normalized));
  } catch {
    // ignora falha de cota do storage local
  }
}
