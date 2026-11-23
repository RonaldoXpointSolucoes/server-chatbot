import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANY_ROUTINE_RULE_PATTERN,
  buildCompanyRoutineStorageKey,
  isCompanyRoutineRule,
  createEmptyRoutineProfile,
  parseRoutineProfileFromRules,
  loadRoutineProfileFromStorage,
  saveRoutineProfileToStorage,
  learnRoutineFromParsedFiles,
  bootstrapRoutineFromSessions,
  toggleRoutineBankExpected,
  toggleRoutineReportExpected
} from './cashCompanyRoutineHelper.mjs';

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  };
}

test('learnRoutineFromParsedFiles registra Banco C6 e Banco Itaú com enabled=true e seenCount=1 e respeita idempotência diária', () => {
  const empty = createEmptyRoutineProfile();
  const day1Files = [
    {
      fileType: 'extrato_ofx',
      fileName: 'Extrato_C6.ofx',
      status: 'ok',
      periodStart: '2026-11-19',
      summary: {
        bankKey: 'banco_336',
        bankCode: '336',
        bankLabel: 'Banco C6',
        acctLast4: '0726'
      }
    },
    {
      fileType: 'extrato_ofx',
      fileName: 'Extrato_Itau.ofx',
      status: 'ok',
      periodStart: '2026-11-19',
      summary: {
        bankKey: 'banco_341',
        bankCode: '341',
        bankLabel: 'Banco Itaú',
        acctLast4: '8812'
      }
    },
    { fileType: 'adquirente_rede', status: 'ok', periodStart: '2026-11-19', summary: {} },
    { fileType: 'adquirente_c6pay', status: 'ok', periodStart: '2026-11-19', summary: {} },
    { fileType: 'pdv_vendas', status: 'ok', periodStart: '2026-11-19', summary: {} },
    { fileType: 'pdv_cancelamentos', status: 'error', errorMessage: 'Arquivo inválido' }
  ];

  const first = learnRoutineFromParsedFiles(empty, day1Files, '2026-11-19');
  assert.equal(first.changed, true);
  assert.equal(first.profile.banks.banco_336.enabled, true);
  assert.equal(first.profile.banks.banco_336.seenCount, 1);
  assert.equal(first.profile.banks.banco_336.bankLabel, 'Banco C6');
  assert.equal(first.profile.banks.banco_336.acctLast4, '0726');
  assert.equal(first.profile.banks.banco_341.enabled, true);
  assert.equal(first.profile.banks.banco_341.seenCount, 1);
  assert.equal(first.profile.banks.banco_341.bankLabel, 'Banco Itaú');
  assert.equal(first.profile.reports.adquirente_rede.seenCount, 1);
  assert.equal(first.profile.reports.adquirente_c6pay.seenCount, 1);
  assert.equal(first.profile.reports.pdv_vendas.seenCount, 1);
  assert.equal(first.profile.reports.pdv_cancelamentos, undefined);

  // Mesmo dia não infla seenCount
  const sameDay = learnRoutineFromParsedFiles(first.profile, day1Files, '2026-11-19');
  assert.equal(sameDay.changed, false);
  assert.equal(sameDay.profile.banks.banco_336.seenCount, 1);
  assert.equal(sameDay.profile.banks.banco_341.seenCount, 1);

  // Dia seguinte incrementa seenCount
  const day2 = learnRoutineFromParsedFiles(sameDay.profile, day1Files, '2026-11-20');
  assert.equal(day2.changed, true);
  assert.equal(day2.profile.banks.banco_336.seenCount, 2);
  assert.equal(day2.profile.banks.banco_336.lastSeenDate, '2026-11-20');
  assert.equal(day2.profile.banks.banco_341.seenCount, 2);
});

test('learnRoutineFromParsedFiles identifica banco via fallback quando arquivo antigo não tem summary.bankKey', () => {
  const res = learnRoutineFromParsedFiles(
    createEmptyRoutineProfile(),
    [
      {
        fileType: 'extrato_generico',
        fileName: 'Extrato_Itau_19_11.xlsx',
        status: 'ok',
        periodStart: '2026-11-19',
        summary: {}
      }
    ],
    '2026-11-19'
  );

  assert.equal(res.changed, true);
  assert.equal(res.profile.banks.banco_341.bankLabel, 'Banco Itaú');
  assert.equal(res.profile.banks.banco_341.seenCount, 1);
  assert.equal(res.profile.banks.banco_341.enabled, true);
});

test('toggleRoutineBankExpected e toggleRoutineReportExpected são puros e preservam preferência ao aprender novamente', () => {
  const learned = learnRoutineFromParsedFiles(
    createEmptyRoutineProfile(),
    [
      {
        fileType: 'extrato_ofx',
        status: 'ok',
        summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6' }
      },
      {
        fileType: 'extrato_ofx',
        status: 'ok',
        summary: { bankKey: 'banco_341', bankCode: '341', bankLabel: 'Banco Itaú' }
      }
    ],
    '2026-11-19'
  ).profile;

  const disabledItau = toggleRoutineBankExpected(learned, 'banco_341', false);
  assert.equal(learned.banks.banco_341.enabled, true); // não muta objeto original
  assert.equal(disabledItau.banks.banco_341.enabled, false);
  assert.equal(disabledItau.banks.banco_336.enabled, true);

  // Aprendizado subsequente em novo dia mantém banco_341 dispensado
  const nextDay = learnRoutineFromParsedFiles(
    disabledItau,
    [
      {
        fileType: 'extrato_ofx',
        status: 'ok',
        summary: { bankKey: 'banco_341', bankCode: '341', bankLabel: 'Banco Itaú' }
      }
    ],
    '2026-11-20'
  ).profile;
  assert.equal(nextDay.banks.banco_341.enabled, false);
  assert.equal(nextDay.banks.banco_341.seenCount, 2);

  const toggledReport = toggleRoutineReportExpected(nextDay, 'pdv_cancelamentos', false);
  assert.equal(toggledReport.reports.pdv_cancelamentos.enabled, false);
  const reenabled = toggleRoutineBankExpected(toggledReport, 'banco_341', true);
  assert.equal(reenabled.banks.banco_341.enabled, true);
});

test('bootstrapRoutineFromSessions consolida histórico em ordem cronológica sem duplicar recargas', () => {
  const sessions = [
    {
      id: 's2',
      reference_date: '2026-11-20',
      created_at: '2026-11-20T23:00:00Z',
      reconciled_summary: {
        parsedFilesSnapshot: [
          {
            fileType: 'extrato_ofx',
            status: 'ok',
            summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6' }
          },
          { fileType: 'pdv_vendas', status: 'ok', summary: {} }
        ]
      }
    },
    {
      id: 's1-b',
      reference_date: '2026-11-19',
      created_at: '2026-11-19T22:00:00Z',
      reconciled_summary: {
        parsedFilesSnapshot: [
          {
            fileType: 'extrato_ofx',
            status: 'ok',
            summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6' }
          }
        ]
      }
    },
    {
      id: 's1-a',
      reference_date: '2026-11-19',
      created_at: '2026-11-19T14:00:00Z',
      reconciled_summary: {
        parsedFilesSnapshot: [
          {
            fileType: 'extrato_ofx',
            status: 'ok',
            summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6' }
          },
          {
            fileType: 'extrato_ofx',
            status: 'ok',
            summary: { bankKey: 'banco_341', bankCode: '341', bankLabel: 'Banco Itaú' }
          }
        ]
      }
    }
  ];

  const first = bootstrapRoutineFromSessions(createEmptyRoutineProfile(), sessions);
  assert.equal(first.changed, true);
  assert.equal(first.profile.banks.banco_336.seenCount, 2);
  assert.equal(first.profile.banks.banco_341.seenCount, 1);

  // Recarregar as mesmas sessões não duplica contadores
  const second = bootstrapRoutineFromSessions(first.profile, sessions);
  assert.equal(second.changed, false);
  assert.equal(second.profile.banks.banco_336.seenCount, 2);
});

test('parseRoutineProfileFromRules e storage mantêm isolamento estrito por tenantId', () => {
  const profileA = learnRoutineFromParsedFiles(
    createEmptyRoutineProfile(),
    [{ fileType: 'extrato_ofx', status: 'ok', summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6' } }],
    '2026-11-19'
  ).profile;

  const rules = [
    { id: 'r1', rule_type: 'normalize_admin', pattern: 'PIX', target_value: 'pix', is_active: true },
    { id: 'r2', rule_type: 'engine_setting', pattern: COMPANY_ROUTINE_RULE_PATTERN, target_value: '{bad json', is_active: true },
    {
      id: 'r3',
      rule_type: 'engine_setting',
      pattern: COMPANY_ROUTINE_RULE_PATTERN,
      target_value: JSON.stringify(profileA),
      is_active: true
    }
  ];

  assert.equal(isCompanyRoutineRule(rules[0]), false);
  assert.equal(isCompanyRoutineRule(rules[2]), true);

  const parsedFromRules = parseRoutineProfileFromRules(rules);
  assert.ok(parsedFromRules);
  assert.equal(parsedFromRules.banks.banco_336.bankLabel, 'Banco C6');

  const inactiveRules = [{ ...rules[2], is_active: false }];
  assert.equal(parseRoutineProfileFromRules(inactiveRules), null);

  const storage = createMemoryStorage();
  assert.equal(buildCompanyRoutineStorageKey('tenant-a'), 'cash_recon_routine_tenant-a');
  assert.equal(saveRoutineProfileToStorage(storage, 'tenant-a', profileA), true);
  assert.ok(loadRoutineProfileFromStorage(storage, 'tenant-a')?.banks.banco_336);
  assert.equal(loadRoutineProfileFromStorage(storage, 'tenant-b'), null);
});
