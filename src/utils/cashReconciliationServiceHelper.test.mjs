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

import { parseUiMoneyInputToCents, SESSION_LIST_COLUMNS } from './cashReconciliationServiceHelper.mjs';

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
