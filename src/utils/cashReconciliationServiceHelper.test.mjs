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

  // Snapshot persistido deve normalizar arquivos multi-dias mantendo somente linhas da competência do caixa
  const multiDayBundle = buildSessionPersistencePayload({
    tenantId: 'tenant-abc',
    parsedFiles: [
      {
        fileName: 'Extrato_01_a_10.ofx',
        fileType: 'extrato_ofx',
        status: 'ok',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-10',
        warnings: [],
        rows: [
          { dateStr: '2026-11-01', amountCents: 1000 },
          { dateStr: '2026-11-05', amountCents: 2500 },
          { dateStr: '2026-11-06', amountCents: 500 },
          { dateStr: '2026-11-10', amountCents: 9900 }
        ],
        summary: { totalRows: 4 }
      }
    ],
    result: {
      referenceDate: '2026-11-05',
      periodDiagnostics: { targetStartDate: '2026-11-05', targetEndDate: '2026-11-05', hasSystemPeriodAnchor: true },
      mirrorRows: [],
      matchedPairs: [],
      suggestions: [],
      missingInBank: [],
      extraInBank: []
    },
    manualInputs: {}
  });
  const snapFile = multiDayBundle.sessionPayload.reconciled_summary.parsedFilesSnapshot[0];
  assert.equal(snapFile.rows.length, 2, 'Snapshot deve preservar apenas linhas do dia de referência (05/11) e virada D+1 (06/11)');
  assert.deepEqual(snapFile.rows.map(r => r.dateStr), ['2026-11-05', '2026-11-06']);
  assert.equal(multiDayBundle.filePayloads[0].row_count, 2);
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

test('computeHistoricalHealthStats sorts multiple same-day sessions chronologically, exposes shift/operator/draft metadata, and recalculates after deletion', () => {
  const sessions = [
    {
      id: 'sess-19-noite',
      reference_date: '2026-11-19',
      shift_label: 'Noite',
      operator_name: 'Carlos',
      status: 'shortage',
      health_score: 80,
      system_total_cents: 500000,
      real_total_cents: 495000,
      diff_cents: -5000,
      closed_at: null,
      created_at: '2026-11-19T23:10:00.000Z'
    },
    {
      id: 'sess-19-manha',
      reference_date: '2026-11-19',
      shift_label: 'Manhã',
      operator_name: 'Edilza',
      status: 'balanced',
      health_score: 100,
      system_total_cents: 300000,
      real_total_cents: 300000,
      diff_cents: 0,
      closed_at: '2026-11-19T14:35:00.000Z',
      created_at: '2026-11-19T14:30:00.000Z'
    },
    {
      id: 'sess-18',
      reference_date: '2026-11-18',
      shift_label: 'Diário',
      operator_name: 'Edilza',
      status: 'surplus',
      health_score: 96,
      system_total_cents: 200000,
      real_total_cents: 201500,
      diff_cents: 1500,
      closed_at: '2026-11-18T22:00:00.000Z',
      created_at: '2026-11-18T21:50:00.000Z'
    }
  ];

  const stats = computeHistoricalHealthStats(sessions);

  assert.equal(stats.totalSessions, 3);
  assert.deepEqual(stats.series.map(s => s.id), ['sess-18', 'sess-19-manha', 'sess-19-noite']);
  assert.equal(stats.series[1].shiftLabel, 'Manhã');
  assert.equal(stats.series[1].operatorName, 'Edilza');
  assert.equal(stats.series[1].createdAt, '2026-11-19T14:30:00.000Z');
  assert.equal(stats.series[1].isDraft, false);

  assert.equal(stats.series[2].shiftLabel, 'Noite');
  assert.equal(stats.series[2].operatorName, 'Carlos');
  assert.equal(stats.series[2].createdAt, '2026-11-19T23:10:00.000Z');
  assert.equal(stats.series[2].isDraft, true);

  // Simula exclusão exata de apenas um dos fechamentos de 19/11 pelo id
  const afterDelete = computeHistoricalHealthStats(sessions.filter(s => s.id !== 'sess-19-noite'));
  assert.equal(afterDelete.totalSessions, 2);
  assert.equal(afterDelete.balancedCount, 1);
  assert.equal(afterDelete.balancedRatePct, 50);
  assert.equal(afterDelete.avgHealthScore, 98);
  assert.equal(afterDelete.totalShortageCents, 0);
  assert.equal(afterDelete.totalSurplusCents, 1500);
  assert.deepEqual(afterDelete.series.map(s => s.id), ['sess-18', 'sess-19-manha']);
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

test('detail panel helpers choose default tab, match sobra candidates, filter/sort sobras and filter auto-matched pairs', async () => {
  const {
    resolveDetailPanelDefaultTab,
    findBestCandidateForSobra,
    filterAndSortDetailItems,
    filterMatchedPairsForDetail
  } = await import('./cashReconciliationServiceHelper.mjs');

  assert.equal(resolveDetailPanelDefaultTab({ diffCents: 34790, extraCount: 9, missingCount: 6, suggestionsCount: 0, matchedCount: 14 }), 'sobras');
  assert.equal(resolveDetailPanelDefaultTab({ diffCents: -1200, extraCount: 0, missingCount: 3, suggestionsCount: 0, matchedCount: 5 }), 'faltas');
  assert.equal(resolveDetailPanelDefaultTab({ diffCents: 0, extraCount: 1, missingCount: 1, suggestionsCount: 2, matchedCount: 5 }), 'sugestoes');
  assert.equal(resolveDetailPanelDefaultTab({ diffCents: 0, extraCount: 0, missingCount: 0, suggestionsCount: 0, matchedCount: 8 }), 'conciliados');
  assert.equal(resolveDetailPanelDefaultTab({}), 'todos');

  const pdvPool = [
    { id: 'sys-1', numero: '002', origem: 'MESA 002', amountCents: 7755, timeStr: '20:45:52', secondsOfDay: 20 * 3600 + 45 * 60 + 52 },
    { id: 'sys-2', numero: '050', origem: 'MESA 050', amountCents: 600, timeStr: '13:42:36', secondsOfDay: 13 * 3600 + 42 * 60 + 36 }
  ];
  const sobraRede = { id: 'real-1', source: 'rede', description: 'Rede PIX', amountCents: 7755, timeStr: '08:45:29', secondsOfDay: 8 * 3600 + 45 * 60 + 29 };
  const sobraOfxMadrugada = { id: 'real-2', source: 'ofx', description: 'ANA CAROLINY', amountCents: 14740, timeStr: '04:42:10', secondsOfDay: 4 * 3600 + 42 * 60 + 10 };
  const sobraSemPar = { id: 'real-3', source: 'c6pay', description: 'C6 PIX', amountCents: 5700, timeStr: '02:58:18', secondsOfDay: 2 * 3600 + 58 * 60 + 18 };

  const cand1 = findBestCandidateForSobra(sobraRede, pdvPool, 200);
  assert.ok(cand1);
  assert.equal(cand1.item.id, 'sys-1');
  assert.equal(cand1.amountDiffCents, 0);
  assert.equal(cand1.isExactAmount, true);
  assert.equal(findBestCandidateForSobra(sobraSemPar, pdvPool, 200), null);

  const candidateMap = new Map([['real-1', cand1]]);
  const sobras = [sobraRede, sobraOfxMadrugada, sobraSemPar];

  assert.deepEqual(
    filterAndSortDetailItems(sobras, { sortBy: 'amount_desc' }).map((i) => i.id),
    ['real-2', 'real-1', 'real-3']
  );
  assert.deepEqual(
    filterAndSortDetailItems(sobras, { sourceFilter: 'ofx', onlyMadrugada: true }).map((i) => i.id),
    ['real-2']
  );
  assert.deepEqual(
    filterAndSortDetailItems(sobras, { onlyWithCandidate: true, candidateMap }).map((i) => i.id),
    ['real-1']
  );
  assert.deepEqual(
    filterAndSortDetailItems(sobras, { query: 'caroliny' }).map((i) => i.id),
    ['real-2']
  );

  const pairs = [
    {
      matchType: 'matched_exact',
      amountCents: 7755,
      reasonText: 'Bateu 1:1 (Rede formato 12h +12h • 23s)',
      systemItems: [{ id: 's1', referenceCode: '002', description: 'MESA 002', amountCents: 7755, timeStr: '20:45:52' }],
      realItems: [{ id: 'r1', source: 'rede', description: 'Rede PIX', amountCents: 7755, timeStr: '08:45:29' }]
    },
    {
      matchType: 'matched_exact',
      amountCents: 4500,
      reasonText: 'Bateu 1:1 (14s)',
      systemItems: [{ id: 's2', referenceCode: '009', description: 'DELIVERY', amountCents: 4500, timeStr: '19:10:00' }],
      realItems: [{ id: 'r2', source: 'ofx', description: 'PIX JOAO', amountCents: 4500, timeStr: '19:10:14' }]
    },
    {
      matchType: 'matched_manual',
      amountCents: 3200,
      reasonText: 'Vínculo manual',
      systemItems: [{ id: 's3', referenceCode: '012', description: 'MESA 012', amountCents: 3200, timeStr: '21:00:00' }],
      realItems: [{ id: 'r3', source: 'c6pay', description: 'C6 PIX', amountCents: 3200, timeStr: '21:01:00' }]
    }
  ];

  assert.equal(filterMatchedPairsForDetail(pairs, { sourceFilter: 'all' }).length, 3);
  assert.deepEqual(filterMatchedPairsForDetail(pairs, { sourceFilter: 'rede_12h' }).map((p) => p.realItems[0].id), ['r1']);
  assert.deepEqual(filterMatchedPairsForDetail(pairs, { sourceFilter: 'ofx' }).map((p) => p.realItems[0].id), ['r2']);
  assert.deepEqual(filterMatchedPairsForDetail(pairs, { sourceFilter: 'manual' }).map((p) => p.realItems[0].id), ['r3']);
  assert.deepEqual(filterMatchedPairsForDetail(pairs, { query: 'joao' }).map((p) => p.realItems[0].id), ['r2']);
});

test('buildMirrorRowDetails computes exact reconciliationBridge explaining Sobras - Faltas + CrossCategory === mirror diff', async () => {
  const { buildMirrorRowDetails } = await import('./cashReconciliationServiceHelper.mjs');
  const mockResult = {
    mirrorRows: [
      { key: 'pix', label: 'Pix', systemCents: 133224, realCents: 151174, diffCents: 17950, hasRealInput: true, isAuto: true }
    ],
    matchedPairs: [
      {
        id: 'm1',
        matchType: 'matched_exact',
        systemItems: [{ id: 's1', category: 'pix', amountCents: 100325 }],
        realItems: [{ id: 'r1', category: 'pix', amountCents: 100325 }],
        amountCents: 100325
      },
      {
        id: 'm_swap',
        matchType: 'matched_manual',
        reasonType: 'swapped_method',
        systemItems: [{ id: 's_card', category: 'cartao', amountCents: 12350 }],
        realItems: [{ id: 'r_pix_ofx', category: 'pix', amountCents: 12350 }],
        amountCents: 12350
      }
    ],
    suggestions: [],
    missingInBank: [{ id: 's_miss', category: 'pix', amountCents: 9450 }],
    extraInBank: [
      { id: 'r_ex1', category: 'pix', amountCents: 9350 },
      { id: 'r_ex2', category: 'pix', amountCents: 5700 }
    ],
    systemItems: []
  };

  const det = buildMirrorRowDetails(mockResult, 'pix');
  assert.equal(det.reconciliationBridge.extraCents, 15050);
  assert.equal(det.reconciliationBridge.missingCents, 9450);
  assert.equal(det.reconciliationBridge.netPendingCents, 5600);
  assert.equal(det.reconciliationBridge.crossCategoryRealInCents, 12350);
  assert.equal(det.reconciliationBridge.crossCategorySysOutCents, 0);
  assert.equal(det.reconciliationBridge.crossCategoryNetCents, 12350);
  assert.equal(det.reconciliationBridge.otherDeltaCents, 0);
  assert.equal(det.reconciliationBridge.mirrorDiffCents, 17950);
  assert.equal(det.reconciliationBridge.crossCategoryPairs.length, 1);
});

test('general diff, glossary, selection diff and target-match sorting helpers behave accurately', async () => {
  const {
    RECONCILIATION_GLOSSARY,
    buildLinkableSystemPool,
    buildGeneralDiffSummary,
    computeSelectionDiffMeta,
    sortItemsByTargetMatch
  } = await import('./cashReconciliationServiceHelper.mjs');

  assert.match(RECONCILIATION_GLOSSARY.missing.explanation, /PDV.*banco/i);
  assert.match(RECONCILIATION_GLOSSARY.extra.explanation, /banco.*PDV/i);

  const mockResult = {
    mirrorRows: [
      { key: 'pix', systemCents: 133224, realCents: 151174, hasRealInput: true, diffCents: 17950 },
      { key: 'saldo_dinheiro', systemCents: 81372, realCents: 75030, hasRealInput: true, diffCents: -6342 },
      { key: 'ifood', systemCents: 0, realCents: 0, hasRealInput: true, diffCents: 0 }
    ],
    missingInBank: [
      { id: 'm1', category: 'pix', amountCents: 9450, secondsOfDay: 49638 },
      { id: 'm2', category: 'cartao', amountCents: 4500, secondsOfDay: 50000 }
    ],
    extraInBank: [
      { id: 'e1', source: 'ofx', category: 'pix', amountCents: 9350, secondsOfDay: 48942 },
      { id: 'e2', source: 'rede', category: 'pix', amountCents: 5700, secondsOfDay: 10698 },
      { id: 'e3', source: 'rede', category: 'cartao', amountCents: 9450, secondsOfDay: 7200 }
    ],
    suggestions: [{ id: 'sug1', amountCents: 9450 }],
    matchedPairs: [{ id: 'mp1', systemItems: [{ id: 's_matched' }], realItems: [{ id: 'r_matched' }] }],
    systemItems: [
      { id: 's_matched', category: 'dinheiro', amountCents: 1000 },
      { id: 's_cash', category: 'dinheiro', amountCents: 5700 },
      { id: 's_pend', category: 'pendente', amountCents: 3000 }
    ]
  };

  const pool = buildLinkableSystemPool(mockResult, [{ action: 'ignore_item', systemIds: ['s_pend'] }]);
  assert.deepEqual(pool.map((i) => i.id), ['m1', 'm2', 's_cash']);

  const summary = buildGeneralDiffSummary(mockResult);
  assert.equal(summary.missingCents, 13950);
  assert.equal(summary.extraCents, 24500);
  assert.equal(summary.suggestionsCents, 9450);
  assert.equal(summary.divergentMirrorRows.length, 2);
  assert.equal(summary.totalPendingCount, 6);

  const exactMeta = computeSelectionDiffMeta({
    selectedSystemItems: [{ amountCents: 9450 }],
    selectedRealItems: [{ amountCents: 9450 }]
  });
  assert.equal(exactMeta.canLink, true);
  assert.equal(exactMeta.isExactMatch, true);
  assert.equal(exactMeta.diffCents, 0);

  const groupedMeta = computeSelectionDiffMeta({
    selectedSystemItems: [{ amountCents: 5000 }, { amountCents: 4450 }],
    selectedRealItems: [{ amountCents: 9350 }]
  });
  assert.equal(groupedMeta.diffCents, -100);
  assert.equal(groupedMeta.isCloseMatch, true);

  const ranked = sortItemsByTargetMatch(mockResult.extraInBank, 9450, 49638);
  assert.equal(ranked[0].item.id, 'e3');
  assert.equal(ranked[0].matchRank, 'exact');
  assert.equal(ranked[1].item.id, 'e1');
  assert.equal(ranked[1].matchRank, 'close');
  assert.equal(ranked[2].item.id, 'e2');
  assert.equal(ranked[2].matchRank, 'none');
});

test('saveActiveCashDraftToStorage compacts oversized drafts cleanly on QuotaExceededError and preserves sync signatures & local recovery priority', async () => {
  const {
    saveActiveCashDraftToStorage,
    loadActiveCashDraftFromStorage,
    buildCashDraftSyncSignature,
    shouldPreferLocalDraftOverSession
  } = await import('./cashReconciliationServiceHelper.mjs');

  const mem = new Map();
  const quotaStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => {
      if (String(v).length > 2200) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      mem.set(k, String(v));
    },
    removeItem: (k) => mem.delete(k)
  };

  const heavyRows = Array.from({ length: 120 }, (_, i) => ({
    rowIndex: i,
    product: `Hambúrguer Artesanal Super Duplo Especial Nro ${i}`,
    qty: 2,
    totalCents: 4500
  }));

  const saved = saveActiveCashDraftToStorage(quotaStorage, 't-quota', {
    activeSessionId: 'sess-cloud-1',
    pendingCloudSync: true,
    files: [
      {
        id: 'f-core',
        fileName: 'RelConferencia.xlsx',
        fileSizeBytes: 500,
        parsed: { fileType: 'rel_conferencia', status: 'ok', rows: [], summary: { total: 100 } }
      },
      {
        id: 'f-heavy',
        fileName: 'ProdutosVendidos.xls',
        fileSizeBytes: 900000,
        parsed: { fileType: 'pdv_itens_vendidos', status: 'ok', rows: heavyRows, summary: { topProducts: ['Burger'] } }
      }
    ],
    manualInputs: {
      cashCountedCents: 25000,
      manualCashAdjustments: [
        { id: 'adj1', direction: 'outflow', description: 'Bolo da Marcela', amountCents: 5500 }
      ]
    },
    manualResolutions: [{ action: 'ignore_item', realIds: ['r1'] }],
    aiAnalysis: null
  });

  assert.equal(saved, true);
  const restored = loadActiveCashDraftFromStorage(quotaStorage, 't-quota');
  assert.ok(restored, 'Rascunho compactado deve ser recuperado mesmo com limite de quota');
  assert.equal(restored.activeSessionId, 'sess-cloud-1');
  assert.equal(restored.pendingCloudSync, true);
  assert.equal(restored.compactedForQuota, true);
  assert.equal(restored.manualInputs.manualCashAdjustments[0].description, 'Bolo da Marcela');
  assert.equal(restored.files.length, 2);

  const sig1 = buildCashDraftSyncSignature({
    activeSessionId: 'sess-1',
    files: restored.files,
    manualInputs: { cashCountedCents: 1000 },
    manualResolutions: [],
    aiAnalysis: null
  });
  const sig2 = buildCashDraftSyncSignature({
    activeSessionId: 'sess-1',
    files: restored.files,
    manualInputs: { cashCountedCents: 2000 },
    manualResolutions: [],
    aiAnalysis: null
  });
  assert.equal(sig1.filesSignature, sig2.filesSignature);
  assert.notEqual(sig1.stateSignature, sig2.stateSignature);
  assert.equal(sig1.resolutionsSignature, sig2.resolutionsSignature);

  assert.equal(
    shouldPreferLocalDraftOverSession(
      { activeSessionId: 'sess-1', pendingCloudSync: true, updatedAt: '2026-11-23T10:00:00Z' },
      { id: 'sess-1', updated_at: '2026-11-23T12:00:00Z' }
    ),
    true
  );
  assert.equal(
    shouldPreferLocalDraftOverSession(
      { activeSessionId: 'sess-1', pendingCloudSync: false, updatedAt: '2026-11-23T13:00:00Z' },
      { id: 'sess-1', updated_at: '2026-11-23T12:00:00Z' }
    ),
    true
  );
  assert.equal(
    shouldPreferLocalDraftOverSession(
      { activeSessionId: 'sess-1', pendingCloudSync: false, updatedAt: '2026-11-23T11:00:00Z' },
      { id: 'sess-1', updated_at: '2026-11-23T12:00:00Z' }
    ),
    false
  );

  const {
    savePendingClosedPatchToStorage,
    loadPendingClosedPatchFromStorage,
    clearPendingClosedPatchFromStorage,
    buildSessionPersistencePayload: buildPayload
  } = await import('./cashReconciliationServiceHelper.mjs');

  const closedPatchSaved = savePendingClosedPatchToStorage(quotaStorage, 't-quota', 'sess-closed-1', {
    files: restored.files,
    manualInputs: { cashCountedCents: 19900, notes: 'Ajuste pós-fechamento' },
    manualResolutions: [],
    aiAnalysis: null
  });
  assert.equal(closedPatchSaved, true);
  const loadedClosedPatch = loadPendingClosedPatchFromStorage(quotaStorage, 't-quota', 'sess-closed-1');
  assert.equal(loadedClosedPatch.activeSessionId, 'sess-closed-1');
  assert.equal(loadedClosedPatch.pendingCloudSync, true);
  assert.equal(loadedClosedPatch.manualInputs.notes, 'Ajuste pós-fechamento');
  clearPendingClosedPatchFromStorage(quotaStorage, 't-quota', 'sess-closed-1');
  assert.equal(loadPendingClosedPatchFromStorage(quotaStorage, 't-quota', 'sess-closed-1'), null);

  const preservedPayload = buildPayload({
    tenantId: 't-quota',
    parsedFiles: [],
    result: { mirrorRows: [] },
    manualInputs: {},
    markClosed: true,
    preservedClosedAt: '2026-11-20T22:15:00.000Z'
  });
  assert.equal(preservedPayload.sessionPayload.closed_at, '2026-11-20T22:15:00.000Z');
});

test('buildGeneralDiffSummary decomposes full diffTotalCents (-114,42) across table pending (-50,00), matched small_diff (-1,00) and cash drawer (-63,42)', async () => {
  const { buildGeneralDiffSummary } = await import('./cashReconciliationServiceHelper.mjs');
  const mockResult20Nov = {
    diffTotalCents: -11442,
    mirrorRows: [
      { key: 'saldo_dinheiro', label: 'Saldo em Dinheiro', systemCents: 81372, realCents: 75030, hasRealInput: true, diffCents: -6342 },
      { key: 'cartao', label: 'Crédito, Débito e Voucher', systemCents: 345335, realCents: 327985, hasRealInput: true, diffCents: -17350 },
      { key: 'pix', label: 'Pix', systemCents: 133224, realCents: 145474, hasRealInput: true, diffCents: 12250 },
      { key: 'pendentes', label: 'Pendentes', systemCents: 40550, realCents: 40550, hasRealInput: true, diffCents: 0 }
    ],
    missingInBank: [
      { id: 'm1', category: 'cartao', amountCents: 2500, description: 'MESA 050 • CREDITO' },
      { id: 'm2', category: 'cartao', amountCents: 2500, description: 'MESA 050 • CREDITO' }
    ],
    extraInBank: [],
    suggestions: [],
    matchedPairs: [
      {
        id: 'pair-swap',
        matchType: 'matched_suggestion',
        reasonType: 'swapped_method',
        reasonText: 'Cartão PDV recebido como PIX no banco',
        amountCents: 12350,
        systemItems: [{ id: 's-swap', category: 'cartao', amountCents: 12350 }],
        realItems: [{ id: 'r-swap', category: 'pix', amountCents: 12350 }]
      },
      {
        id: 'pair-small-diff',
        matchType: 'matched_suggestion',
        reasonType: 'small_diff',
        reasonText: 'Delivery 94,50 recebido como PIX 93,50 (-R$ 1,00)',
        amountCents: 9350,
        systemItems: [{ id: 's-sd', category: 'pix', amountCents: 9450, description: 'Delivery 94,50' }],
        realItems: [{ id: 'r-sd', category: 'pix', amountCents: 9350, description: 'PIX Itaú 93,50' }]
      }
    ]
  };

  const summary = buildGeneralDiffSummary(mockResult20Nov);
  assert.equal(summary.missingCents, 5000);
  assert.equal(summary.extraCents, 0);
  assert.equal(summary.tableNetDigitalCents, -5000);
  assert.equal(summary.cashDrawerDiffCents, -6342);
  assert.equal(summary.cashDrawerHasRealInput, true);
  assert.equal(summary.matchedPairsDiffCents, -100);
  assert.equal(summary.matchedPairsWithDiff.length, 1);
  assert.equal(summary.matchedPairsWithDiff[0].diffCents, -100);
  assert.equal(summary.otherChannelsDiffCents, 0);
  assert.equal(summary.digitalResidualDiffCents, 0);
  assert.equal(summary.nonTableDiffCents, -6442);
  assert.equal(summary.explainedDiffTotalCents, -11442);
});

test('formatDateHeaderBadge formats single closing date with weekday and multi-day intervals clearly', async () => {
  const { formatDateHeaderBadge } = await import('./cashReconciliationServiceHelper.mjs');
  assert.equal(typeof formatDateHeaderBadge, 'function');

  const single = formatDateHeaderBadge('2026-11-23', '2026-11-23');
  assert.ok(single.includes('23/11/2026'));
  assert.ok(/seg/i.test(single));

  const range = formatDateHeaderBadge('2026-11-20', '2026-11-23');
  assert.equal(range, '20/11/2026 a 23/11/2026');

  assert.equal(formatDateHeaderBadge('', ''), '');
});

test('buildLinkableSystemPool exclui NOTA PENDENTE (fiado ja resolvido) mantendo faltas digitais e dinheiro em aberto', async () => {
  const { buildLinkableSystemPool, findBestCandidateForSobra } = await import('./cashReconciliationServiceHelper.mjs');
  const result = {
    missingInBank: [{ id: 'm_card', category: 'cartao', amountCents: 700, secondsOfDay: 49080 }],
    systemItems: [
      { id: 's_cash', category: 'dinheiro', amountCents: 1500, secondsOfDay: 48000 },
      { id: 's_pend', category: 'pendente', amountCents: 3000, secondsOfDay: 49000 }
    ],
    matchedPairs: []
  };

  const pool = buildLinkableSystemPool(result, []);
  assert.deepEqual(pool.map((i) => i.id), ['m_card', 's_cash']);

  const extraCardSameAsPending = { id: 'e_30', source: 'c6pay', category: 'cartao', amountCents: 3000, secondsOfDay: 49100 };
  assert.equal(findBestCandidateForSobra(extraCardSameAsPending, pool), null);
});
