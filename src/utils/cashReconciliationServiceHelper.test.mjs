import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSessionPersistencePayload,
  computeHistoricalHealthStats,
  isMissingCashTableError
} from './cashReconciliationServiceHelper.mjs';

test('buildSessionPersistencePayload requires tenantId and produces clean Supabase session, files and items payloads', () => {
  assert.throws(
    () => buildSessionPersistencePayload({ tenantId: '', parsedFiles: [], result: {}, manualInputs: {} }),
    /tenantId/i
  );

  const bundle = buildSessionPersistencePayload({
    tenantId: 'tenant-abc',
    userEmail: 'ronaldo@xpoint.com',
    parsedFiles: [
      {
        fileName: 'PlanilhaRecebimento.xlsx',
        fileType: 'pdv_vendas',
        status: 'ok',
        periodStart: '2026-11-19',
        periodEnd: '2026-11-19',
        warnings: [],
        rows: [{ id: 1 }],
        summary: { totalRows: 1 }
      }
    ],
    result: {
      referenceDate: '2026-11-19',
      storeName: 'BURGUER PLUS',
      operatorName: 'EDILZA',
      status: 'balanced',
      healthScore: 99,
      systemTotalCents: 573781,
      realTotalCents: 573781,
      diffTotalCents: 0,
      mirrorRows: [{ key: 'pix', label: 'Pix', systemCents: 132564, realCents: 132564, diffCents: 0 }],
      cashDrawerSummary: { sangriaCents: 63080, countedCents: 25727 },
      financialMetrics: { cancelledCents: 6900 },
      matchedPairs: [
        {
          id: 'match_1',
          matchType: 'matched_exact',
          reasonText: 'Bateu 1:1',
          systemItems: [{ id: 'sys_0', side: 'system', source: 'pdv', category: 'pix', subCategory: 'pix_pdv', amountCents: 5000, netAmountCents: 5000, feeCents: 0, timeStr: '11:54:34', referenceCode: '3', description: 'DELIVERY 3', terminalName: 'SERVIDOR', operatorName: 'Julinha', metadata: {} }],
          realItems: [{ id: 'real_0', side: 'real', source: 'ofx', category: 'pix', subCategory: 'pix_cliente', amountCents: 5000, netAmountCents: 5000, feeCents: 0, timeStr: '11:54:29', referenceCode: 'uuid', description: 'CINTHEA', terminalName: 'C6', operatorName: '', metadata: {} }]
        }
      ],
      suggestions: [],
      missingInBank: [{ id: 'sys_1', side: 'system', source: 'pdv', category: 'cartao', subCategory: 'credito', amountCents: 400, netAmountCents: 400, feeCents: 0, timeStr: '13:10:05', referenceCode: '030', description: 'MESA 030', terminalName: 'SERVIDOR', operatorName: 'Julinha', metadata: {} }],
      extraInBank: [],
      nonPdvItems: [],
      notAuthorizedItems: [],
      deduplicatedItems: []
    },
    manualInputs: { cashCountedCents: 25727, notes: 'Caixa conferido' },
    manualResolutions: [{ action: 'confirm_suggestion', suggestionId: 'sug_1' }],
    markClosed: true
  });

  assert.equal(bundle.sessionPayload.tenant_id, 'tenant-abc');
  assert.equal(bundle.sessionPayload.status, 'balanced');
  assert.equal(bundle.sessionPayload.health_score, 99);
  assert.equal(bundle.sessionPayload.cash_drawer_counted_cents, 25727);
  assert.equal(bundle.sessionPayload.cash_sangria_cents, 63080);
  assert.ok(bundle.sessionPayload.closed_at);
  assert.equal(bundle.filePayloads.length, 1);
  assert.equal(bundle.itemPayloads.length, 3);
  assert.ok(bundle.itemPayloads.every(it => it.tenant_id === 'tenant-abc'));
});

test('computeHistoricalHealthStats aggregates balanced rate, shortage/surplus totals and chronological chart series', () => {
  const stats = computeHistoricalHealthStats([
    { id: '2', reference_date: '2026-11-19', status: 'balanced', health_score: 100, system_total_cents: 500000, real_total_cents: 500000, diff_cents: 0 },
    { id: '1', reference_date: '2026-11-18', status: 'shortage', health_score: 82, system_total_cents: 400000, real_total_cents: 395000, diff_cents: -5000 },
    { id: '3', reference_date: '2026-11-20', status: 'surplus', health_score: 94, system_total_cents: 450000, real_total_cents: 452000, diff_cents: 2000 }
  ]);

  assert.equal(stats.totalSessions, 3);
  assert.equal(stats.balancedCount, 1);
  assert.equal(stats.balancedRatePct, 33);
  assert.equal(stats.avgHealthScore, 92);
  assert.equal(stats.totalShortageCents, 5000);
  assert.equal(stats.totalSurplusCents, 2000);
  assert.deepEqual(stats.series.map(s => s.referenceDate), ['2026-11-18', '2026-11-19', '2026-11-20']);
});

test('isMissingCashTableError detects PostgREST PGRST205 and Postgres 42P01 cleanly', () => {
  assert.equal(isMissingCashTableError({ code: 'PGRST205', message: 'Could not find the table public.cash_reconciliation_sessions' }), true);
  assert.equal(isMissingCashTableError({ code: '42P01', message: 'relation "cash_reconciliation_sessions" does not exist' }), true);
  assert.equal(isMissingCashTableError({ code: '23505', message: 'duplicate key' }), false);
});

import {
  parseUiMoneyInputToCents,
  SESSION_LIST_COLUMNS,
  filterVisibleMirrorRows,
  buildMirrorRowDetails,
  saveActiveCashDraftToStorage,
  loadActiveCashDraftFromStorage,
  clearActiveCashDraftFromStorage,
  isDraftAutoResumeDismissed,
  setDraftAutoResumeDismissed,
  pickMostRecentOpenDraftSession,
  buildHealthMetricDetail,
  formatDateBr,
  formatDateBrShort,
  extractCashErrorMessage,
  shouldRetryWithMasterClient
} from './cashReconciliationServiceHelper.mjs';

test('parseUiMoneyInputToCents handles pt-BR thousand separators and empty inputs accurately', () => {
  assert.equal(parseUiMoneyInputToCents(''), null);
  assert.equal(parseUiMoneyInputToCents('   '), null);
  assert.equal(parseUiMoneyInputToCents('1.257,27'), 125727);
  assert.equal(parseUiMoneyInputToCents('257,27'), 25727);
  assert.equal(parseUiMoneyInputToCents('1257.27'), 125727);
  assert.equal(parseUiMoneyInputToCents('-50,00'), -5000);
});

test('SESSION_LIST_COLUMNS excludes heavy reconciled_summary snapshot blob', () => {
  assert.equal(SESSION_LIST_COLUMNS.includes('reconciled_summary'), false);
  assert.equal(SESSION_LIST_COLUMNS.includes('ai_last_analysis'), false);
  assert.match(SESSION_LIST_COLUMNS, /reference_date/);
  assert.match(SESSION_LIST_COLUMNS, /health_score/);
});

test('filterVisibleMirrorRows hides rows with zero system and zero real unless overridden or toggled', () => {
  const rows = [
    { key: 'saldo_dinheiro', systemCents: 88807, realCents: 0 },
    { key: 'ifood', systemCents: 0, realCents: 0 },
    { key: 'ticket', systemCents: 0, realCents: 0 },
    { key: 'pix', systemCents: 132564, realCents: 154704 },
    { key: 'outros', systemCents: 0, realCents: 500 }
  ];

  const hidden = filterVisibleMirrorRows(rows, {}, false);
  assert.deepEqual(hidden.visibleRows.map(r => r.key), ['saldo_dinheiro', 'pix', 'outros']);
  assert.equal(hidden.hiddenCount, 2);

  const overridden = filterVisibleMirrorRows(rows, { ticket: 0 }, false);
  assert.deepEqual(overridden.visibleRows.map(r => r.key), ['saldo_dinheiro', 'ticket', 'pix', 'outros']);

  const allShown = filterVisibleMirrorRows(rows, {}, true);
  assert.equal(allShown.visibleRows.length, 5);
  assert.equal(allShown.hiddenCount, 2);
});

test('buildMirrorRowDetails groups matched pairs, suggestions, extra/missing items and reclassified items by mirror row', () => {
  const mockResult = {
    systemItems: [
      { id: 's1', category: 'dinheiro', amountCents: 3500, metadata: {} },
      { id: 's2', category: 'cartao', amountCents: 2000, metadata: { reclassifiedFrom: 'dinheiro', reclassifiedTo: 'cartao' } },
      { id: 's3', category: 'pix', amountCents: 5000, metadata: {} }
    ],
    matchedPairs: [
      { id: 'm1', systemItems: [{ id: 's3', category: 'pix' }], realItems: [{ id: 'r1', category: 'pix' }], amountCents: 5000 },
      { id: 'm2', systemItems: [{ id: 's2', category: 'cartao' }], realItems: [{ id: 'r2', category: 'cartao' }], amountCents: 2000 }
    ],
    suggestions: [
      { id: 'sug1', reasonType: 'swapped_method', systemItems: [{ id: 's1', category: 'dinheiro' }], realItems: [{ id: 'r3', category: 'pix' }], amountCents: 3500 }
    ],
    missingInBank: [
      { id: 's4', category: 'pix', amountCents: 1200 }
    ],
    extraInBank: [
      { id: 'r3', category: 'pix', amountCents: 3500 },
      { id: 'r4', category: 'cartao', amountCents: 2500 }
    ],
    cashDrawerSummary: {
      saidasDetalhadas: [{ label: 'VALE ISAAC', amountCents: 5000, isSangria: false }]
    },
    financialMetrics: {
      pendingDebtors: [{ debtor: 'JOAO', amountCents: 1000 }]
    }
  };

  const cashDetails = buildMirrorRowDetails(mockResult, 'saldo_dinheiro');
  assert.equal(cashDetails.systemCategoryItems.length, 1);
  assert.equal(cashDetails.reclassifiedOutItems.length, 1);
  assert.equal(cashDetails.reclassifiedOutItems[0].id, 's2');
  assert.equal(cashDetails.suggestions.length, 1);
  assert.equal(cashDetails.saidasDetalhadas.length, 1);

  const pixDetails = buildMirrorRowDetails(mockResult, 'pix');
  assert.equal(pixDetails.matchedPairs.length, 1);
  assert.equal(pixDetails.suggestions.length, 1);
  assert.equal(pixDetails.missingItems.length, 1);
  assert.equal(pixDetails.extraItems.length, 1);

  const pendDetails = buildMirrorRowDetails(mockResult, 'pendentes');
  assert.equal(pendDetails.pendingDebtors.length, 1);
});

test('active draft storage helpers roundtrip parsed files, manual inputs and auto-resume dismissal per tenant', () => {
  const mem = new Map();
  const mockStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k)
  };

  assert.equal(loadActiveCashDraftFromStorage(mockStorage, 't1'), null);

  saveActiveCashDraftToStorage(mockStorage, 't1', {
    activeSessionId: 'sess-123',
    files: [
      {
        id: 'f1',
        fileName: 'Planilha.xlsx',
        fileSizeBytes: 1024,
        arrayBuffer: new ArrayBuffer(8),
        parsed: { fileType: 'pdv_vendas', status: 'ok', rows: [{ id: 1 }], summary: { ok: true } }
      }
    ],
    manualInputs: { cashCountedCents: 25727, categoryRealOverrides: { saldo_dinheiro: 88807 } },
    manualResolutions: [{ action: 'reclassify_system', systemIds: ['s1'], targetCategory: 'cartao' }],
    aiAnalysis: null
  });

  const loaded = loadActiveCashDraftFromStorage(mockStorage, 't1');
  assert.equal(loaded.activeSessionId, 'sess-123');
  assert.equal(loaded.files.length, 1);
  assert.equal(loaded.files[0].arrayBuffer, undefined);
  assert.equal(loaded.manualInputs.categoryRealOverrides.saldo_dinheiro, 88807);
  assert.equal(loaded.manualResolutions.length, 1);
  assert.equal(loadActiveCashDraftFromStorage(mockStorage, 't2'), null);

  setDraftAutoResumeDismissed(mockStorage, 't1', true);
  assert.equal(isDraftAutoResumeDismissed(mockStorage, 't1'), true);
  setDraftAutoResumeDismissed(mockStorage, 't1', false);
  assert.equal(isDraftAutoResumeDismissed(mockStorage, 't1'), false);

  clearActiveCashDraftFromStorage(mockStorage, 't1');
  assert.equal(loadActiveCashDraftFromStorage(mockStorage, 't1'), null);
});

test('pickMostRecentOpenDraftSession returns newest unclosed draft and ignores closed sessions', () => {
  const closedOnly = [{ id: 'a', closed_at: '2026-11-22T10:00:00Z', updated_at: '2026-11-22T10:00:00Z' }];
  assert.equal(pickMostRecentOpenDraftSession(closedOnly), null);

  const mixed = [
    { id: 'closed-1', closed_at: '2026-11-22T12:00:00Z', updated_at: '2026-11-22T12:00:00Z' },
    { id: 'draft-older', closed_at: null, updated_at: '2026-11-22T09:00:00Z' },
    { id: 'draft-newest', closed_at: null, updated_at: '2026-11-22T11:30:00Z' }
  ];
  assert.equal(pickMostRecentOpenDraftSession(mixed)?.id, 'draft-newest');
});

test('buildHealthMetricDetail extracts itemized breakdowns for all 6 operational metric cards', () => {
  const mockResult = {
    realItems: [
      { id: 'r1', source: 'rede', category: 'cartao', subCategory: 'credito', amountCents: 10000, feeCents: 300, netAmountCents: 9700, timeStr: '12:00:00', description: 'Rede CREDITO VISA' },
      { id: 'r2', source: 'ofx', category: 'pix', subCategory: 'pix_cliente', amountCents: 5000, feeCents: 0, netAmountCents: 5000, timeStr: '12:05:00', description: 'PIX CLIENTE' }
    ],
    financialMetrics: {
      totalMdrFeeCents: 300,
      totalNetDigitalCents: 14700,
      cancelledCount: 1,
      cancelledCents: 6900,
      cancelledItems: [{ table: '005', item: 'Costela Prime 12h', qty: 1 }],
      internalConsumptionCents: 35500,
      discountsCents: 5480,
      deliveryFeeCents: 5700,
      serviceFeeCents: 11435,
      guestCount: 62,
      averageTicketCents: 7719,
      pendingDebtors: [{ debtor: 'CLEITON', amountCents: 14000 }]
    },
    cashDrawerSummary: { vendaDinheiroCents: 34510 },
    mirrorRows: [
      { key: 'pix', systemCents: 132564, realCents: 154704 },
      { key: 'cartao', systemCents: 311510, realCents: 317310 },
      { key: 'pendentes', systemCents: 40900, realCents: 0 }
    ]
  };

  assert.equal(buildHealthMetricDetail(mockResult, 'fees').items.length, 1);
  assert.equal(buildHealthMetricDetail(mockResult, 'net_digital').channels.length, 2);
  assert.equal(buildHealthMetricDetail(mockResult, 'cancelled').items[0].item, 'Costela Prime 12h');
  assert.equal(buildHealthMetricDetail(mockResult, 'discounts').discountsCents, 5480);
  assert.equal(buildHealthMetricDetail(mockResult, 'delivery_house_fees').totalCents, 17135);
  assert.equal(buildHealthMetricDetail(mockResult, 'guests').guestCount, 62);
});

test('formatDateBr and formatDateBrShort convert YYYY-MM-DD and ISO timestamps to Brazilian DD/MM(/YYYY) format', () => {
  assert.equal(formatDateBr('2026-11-19'), '19/11/2026');
  assert.equal(formatDateBr('2026-11-19T03:00:00.000Z'), '19/11/2026');
  assert.equal(formatDateBr('19/11/2026'), '19/11/2026');
  assert.equal(formatDateBr('19 Nov'), '19 Nov');
  assert.equal(formatDateBr(''), '');

  assert.equal(formatDateBrShort('2026-11-19'), '19/11');
  assert.equal(formatDateBrShort('2026-11-19T03:00:00.000Z'), '19/11');
  assert.equal(formatDateBrShort('19/11/2026'), '19/11');
  assert.equal(formatDateBrShort('19 Nov'), '19 Nov');
});

test('extractCashErrorMessage and shouldRetryWithMasterClient handle PostgREST 406/PGRST116 and silent RLS filtering cleanly', () => {
  assert.equal(
    extractCashErrorMessage({ code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object', status: 406 }),
    'Cannot coerce the result to a single JSON object'
  );
  assert.equal(extractCashErrorMessage(new Error('Falha de rede')), 'Falha de rede');
  assert.equal(extractCashErrorMessage(null, 'erro padrão'), 'erro padrão');

  assert.equal(shouldRetryWithMasterClient({ data: null, error: { code: 'PGRST116', status: 406 } }), true);
  assert.equal(shouldRetryWithMasterClient({ data: null, error: null, expectRow: true }), true);
  assert.equal(shouldRetryWithMasterClient({ data: [], error: null, fallbackOnEmptyArray: true }), true);
  assert.equal(shouldRetryWithMasterClient({ data: null, error: { code: 'PGRST205', status: 404 } }), false);
  assert.equal(shouldRetryWithMasterClient({ data: { id: 'ok' }, error: null, expectRow: true }), false);
});
