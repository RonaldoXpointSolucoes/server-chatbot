import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CASH_AGENDA_RULE_PATTERN,
  addDaysToIsoDate,
  createCashAgendaItem,
  rescheduleCashAgendaItem,
  addCashAgendaNote,
  settleCashAgendaItem,
  reopenCashAgendaItem,
  evaluateAgendaNotifications,
  findCrossDayAgendaMatchesForExtras,
  buildSettlementAdjustmentFromReceipt,
  mergeCashAgendaLists,
  parseCashAgendaFromRules,
  saveCashAgendaToStorage,
  loadCashAgendaFromStorage
} from './cashPendingAgendaHelper.mjs';

test('create, reschedule, annotate, settle and reopen cross-day CashPendingAgendaItem (R$ 72,00 payment failure)', () => {
  const item = createCashAgendaItem({
    tenantId: 'tenant_bp',
    kind: 'payment_awaiting',
    amountCents: 7200,
    originDate: '2026-11-23',
    dueDate: '2026-11-24',
    title: 'MESA 002 • DEBITO',
    description: 'Falha no pagamento no cartão débito — cliente vai transferir amanhã',
    customerOrSupplier: 'Carlos Mesa 02',
    contactPhone: '11999998888',
    operatorName: 'Julinha Gerente',
    sourceItemId: 'sys_mesa002_7200',
    sourceCategory: 'cartao',
    nowIso: '2026-11-23T13:25:00.000Z'
  });

  assert.equal(item.status, 'waiting');
  assert.equal(item.amountCents, 7200);
  assert.equal(item.originDate, '2026-11-23');
  assert.equal(item.dueDate, '2026-11-24');
  assert.equal(item.history.length, 1);

  const contacted = addCashAgendaNote(item, {
    action: 'contacted',
    text: 'Enviado WhatsApp cobrando PIX de R$ 72,00',
    author: 'Ronaldo',
    nowIso: '2026-11-24T10:00:00.000Z'
  });
  assert.equal(contacted.history.length, 2);

  const rescheduled = rescheduleCashAgendaItem(contacted, {
    newDueDate: '2026-11-27',
    reason: 'Cliente pediu até sexta-feira',
    author: 'Ronaldo',
    nowIso: '2026-11-24T10:05:00.000Z'
  });
  assert.equal(rescheduled.dueDate, '2026-11-27');
  assert.equal(rescheduled.history.length, 3);

  const settled = settleCashAgendaItem(rescheduled, {
    resolvedDate: '2026-11-27',
    resolvedMethod: 'pix',
    resolvedNotes: 'Pago via PIX no Itaú confirmado em 27/11',
    resolvedBankItemId: 'real_ofx_7200',
    author: 'Ronaldo',
    nowIso: '2026-11-27T16:40:00.000Z'
  });
  assert.equal(settled.status, 'resolved');
  assert.equal(settled.resolvedMethod, 'pix');
  assert.equal(settled.resolvedDate, '2026-11-27');
  assert.equal(settled.resolvedBankItemId, 'real_ofx_7200');
  assert.equal(settled.history.length, 4);

  const reopened = reopenCashAgendaItem(settled, {
    newDueDate: '2026-11-28',
    reason: 'Estorno detectado, reaberto para cobrança',
    nowIso: '2026-11-27T18:00:00.000Z'
  });
  assert.equal(reopened.status, 'waiting');
  assert.equal(reopened.resolvedAt, null);
  assert.equal(reopened.dueDate, '2026-11-28');
});

test('evaluateAgendaNotifications tracks overdue, dueToday, upcoming, payment vs missing receipt counts and cross-day bank matches', () => {
  const waiting72 = createCashAgendaItem({
    tenantId: 'tenant_bp',
    kind: 'payment_awaiting',
    amountCents: 7200,
    originDate: '2026-11-23',
    dueDate: '2026-11-24',
    title: 'MESA 002 • DEBITO',
    description: 'Falha pagamento cliente',
    customerOrSupplier: 'Cliente Mesa 02',
    nowIso: '2026-11-23T14:00:00.000Z'
  });

  const missingReceipt5081 = createCashAgendaItem({
    tenantId: 'tenant_bp',
    kind: 'missing_receipt',
    amountCents: 5081,
    originDate: '2026-11-23',
    dueDate: '2026-11-27',
    title: 'Falta na Gaveta — Cupom Pendente',
    description: 'Compra de insumos em dinheiro sem cupom fiscal ainda',
    customerOrSupplier: 'Motoboy / Mercado',
    nowIso: '2026-11-23T22:00:00.000Z'
  });

  const futureItem = createCashAgendaItem({
    tenantId: 'tenant_bp',
    kind: 'payment_awaiting',
    amountCents: 4000,
    originDate: '2026-11-27',
    dueDate: '2026-11-30',
    title: 'DELIVERY 12 • PIX',
    description: 'Agendado segunda-feira',
    customerOrSupplier: 'Maria',
    nowIso: '2026-11-27T11:00:00.000Z'
  });

  const summary = evaluateAgendaNotifications([waiting72, missingReceipt5081, futureItem], '2026-11-27');
  assert.equal(summary.openCount, 3);
  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.dueTodayCount, 1);
  assert.equal(summary.upcomingCount, 1);
  assert.equal(summary.paymentAwaitingCount, 2);
  assert.equal(summary.missingReceiptCount, 1);
  assert.equal(summary.totalWaitingCents, 16281);
  assert.equal(summary.totalOverdueOrTodayCents, 12281);
  assert.equal(summary.urgency, 'urgent');

  // Em outro dia (27/11), sobra no banco PIX R$ 72,00 bate exatamente com a pendência de 23/11
  const extrasToday = [
    { id: 'ofx_27_1', category: 'pix', source: 'ofx', amountCents: 7200, dateStr: '2026-11-27', timeStr: '11:20:00', description: 'PIX RECEBIDO CARLOS' },
    { id: 'ofx_27_2', category: 'pix', source: 'ofx', amountCents: 1990, dateStr: '2026-11-27', timeStr: '14:00:00', description: 'PIX ALEATORIO' }
  ];
  const matches = findCrossDayAgendaMatchesForExtras(extrasToday, [waiting72, missingReceipt5081, futureItem], '2026-11-27');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].realItem.id, 'ofx_27_1');
  assert.equal(matches[0].agendaItem.id, waiting72.id);
  assert.equal(matches[0].similarityPct, 100);

  // Baixa de Cupom Fiscal gera justificativa pronta p/ abater falta da gaveta
  const resolvedReceipt = settleCashAgendaItem(missingReceipt5081, {
    resolvedDate: '2026-11-27',
    resolvedMethod: 'nota_fiscal',
    resolvedReceiptNumber: 'NFC-e 004821',
    resolvedNotes: 'Compra de tomates e gelo',
    author: 'Marcela',
    nowIso: '2026-11-27T12:00:00.000Z'
  });
  const cashAdj = buildSettlementAdjustmentFromReceipt(resolvedReceipt);
  assert.equal(cashAdj.direction, 'outflow');
  assert.equal(cashAdj.amountCents, 5081);
  assert.match(cashAdj.description, /NFC-e 004821/);
});

test('mergeCashAgendaLists, rule serialization and localStorage roundtrip isolate per tenantId', () => {
  const mem = new Map();
  const mockStorage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, String(v))
  };

  const a1 = createCashAgendaItem({
    id: 'ag_1',
    tenantId: 't1',
    kind: 'payment_awaiting',
    amountCents: 7200,
    originDate: '2026-11-23',
    dueDate: '2026-11-24',
    title: 'MESA 002',
    nowIso: '2026-11-23T10:00:00.000Z'
  });
  const a1Newer = settleCashAgendaItem(a1, {
    resolvedDate: '2026-11-27',
    resolvedMethod: 'pix',
    nowIso: '2026-11-27T10:00:00.000Z'
  });

  saveCashAgendaToStorage(mockStorage, 't1', [a1Newer]);
  const loadedLocal = loadCashAgendaFromStorage(mockStorage, 't1');
  assert.equal(loadedLocal.length, 1);
  assert.equal(loadedLocal[0].status, 'resolved');

  const rules = [
    {
      tenant_id: 't1',
      rule_type: 'engine_setting',
      pattern: CASH_AGENDA_RULE_PATTERN,
      is_active: true,
      target_value: JSON.stringify([a1])
    }
  ];
  const parsedFromRules = parseCashAgendaFromRules(rules, 't1');
  assert.equal(parsedFromRules.length, 1);
  assert.equal(parsedFromRules[0].status, 'waiting');

  // Merge mantém versão mais recente (updatedAt mais novo)
  const merged = mergeCashAgendaLists(loadedLocal, parsedFromRules);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'resolved');
  assert.equal(addDaysToIsoDate('2026-11-27', 1), '2026-11-28');
});
