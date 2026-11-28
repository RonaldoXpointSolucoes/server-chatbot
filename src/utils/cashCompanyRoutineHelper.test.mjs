import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANY_ROUTINE_RULE_PATTERN,
  buildCompanyRoutineStorageKey,
  isCompanyRoutineRule,
  createEmptyRoutineProfile,
  normalizeRoutineProfile,
  parseRoutineProfileFromRules,
  loadRoutineProfileFromStorage,
  saveRoutineProfileToStorage,
  learnRoutineFromParsedFiles,
  bootstrapRoutineFromSessions,
  mergeRoutineProfiles,
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


test('bootstrapRoutineFromSessions usa created_at quando reference_date está ausente e sintetiza arquivos via reportCompleteness', () => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const legacySessions = [
    {
      id: 'legacy-1',
      created_at: '2026-11-18T22:10:00Z',
      reconciled_summary: {
        reportCompleteness: {
          system: {
            present: [{ fileType: 'pdv_vendas', present: true }, { fileType: 'rel_conferencia', present: true }]
          },
          bank: {
            present: [
              {
                fileType: 'extrato_ofx',
                bankKey: 'banco_336',
                bankCode: '336',
                bankLabel: 'Banco C6',
                acctLast4: '0726',
                present: true
              },
              {
                fileType: 'extrato_ofx',
                bankKey: 'banco_341',
                bankCode: '341',
                bankLabel: 'Banco Itaú',
                acctLast4: '8812',
                present: true
              },
              { fileType: 'adquirente_rede', present: true }
            ]
          }
        }
      }
    }
  ];

  const bootstrapped = bootstrapRoutineFromSessions(createEmptyRoutineProfile(), legacySessions);
  assert.equal(bootstrapped.changed, true);
  assert.equal(bootstrapped.profile.banks.banco_336.lastSeenDate, '2026-11-18');
  assert.notEqual(bootstrapped.profile.banks.banco_336.lastSeenDate, todayIso);
  assert.equal(bootstrapped.profile.banks.banco_336.seenCount, 1);
  assert.equal(bootstrapped.profile.banks.banco_341.lastSeenDate, '2026-11-18');
  assert.equal(bootstrapped.profile.banks.banco_341.bankLabel, 'Banco Itaú');
  assert.equal(bootstrapped.profile.reports.pdv_vendas.lastSeenDate, '2026-11-18');
  assert.equal(bootstrapped.profile.reports.rel_conferencia.seenCount, 1);
  assert.equal(bootstrapped.profile.reports.adquirente_rede.seenCount, 1);

  // Novo upload na data de hoje incrementa normalmente sem colapsar com a sessão legada
  const todayUpload = learnRoutineFromParsedFiles(
    bootstrapped.profile,
    [
      {
        fileType: 'extrato_ofx',
        status: 'ok',
        summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6' }
      }
    ],
    todayIso
  );
  assert.equal(todayUpload.changed, true);
  assert.equal(todayUpload.profile.banks.banco_336.seenCount, 2);
  assert.equal(todayUpload.profile.banks.banco_336.lastSeenDate, todayIso);
});

test('mergeRoutineProfiles respeita precedência de enabled pelo updatedAt mais recente e mescla contadores e entradas', () => {
  const localOlder = {
    version: 1,
    updatedAt: '2026-11-19T10:00:00Z',
    banks: {
      banco_336: {
        bankKey: 'banco_336',
        bankCode: '336',
        bankLabel: 'Banco C6',
        acctLast4: '0726',
        seenCount: 4,
        lastSeenDate: '2026-11-19',
        enabled: true
      },
      banco_001: {
        bankKey: 'banco_001',
        bankCode: '001',
        bankLabel: 'Banco do Brasil',
        seenCount: 1,
        lastSeenDate: '2026-11-17',
        enabled: true
      }
    },
    reports: {
      pdv_vendas: { fileType: 'pdv_vendas', seenCount: 4, lastSeenDate: '2026-11-19', enabled: true }
    }
  };

  const remoteNewer = {
    version: 1,
    updatedAt: '2026-11-20T15:00:00Z',
    banks: {
      banco_336: {
        bankKey: 'banco_336',
        bankCode: '336',
        bankLabel: 'Banco C6',
        acctLast4: '',
        seenCount: 2,
        lastSeenDate: '2026-11-20',
        enabled: false
      },
      banco_341: {
        bankKey: 'banco_341',
        bankCode: '341',
        bankLabel: 'Banco Itaú',
        seenCount: 2,
        lastSeenDate: '2026-11-20',
        enabled: true
      }
    },
    reports: {
      pdv_vendas: { fileType: 'pdv_vendas', seenCount: 2, lastSeenDate: '2026-11-20', enabled: true },
      pdv_cancelamentos: { fileType: 'pdv_cancelamentos', seenCount: 1, lastSeenDate: '2026-11-20', enabled: false }
    }
  };

  const merged = mergeRoutineProfiles(localOlder, remoteNewer);
  assert.equal(merged.updatedAt, '2026-11-20T15:00:00Z');
  // Remoto mais recente prevalece em enabled=false e preserva maior seenCount/lastSeenDate e acctLast4 do local
  assert.equal(merged.banks.banco_336.enabled, false);
  assert.equal(merged.banks.banco_336.seenCount, 4);
  assert.equal(merged.banks.banco_336.lastSeenDate, '2026-11-20');
  assert.equal(merged.banks.banco_336.acctLast4, '0726');
  // Bancos exclusivos de cada lado são preservados
  assert.equal(merged.banks.banco_001.bankLabel, 'Banco do Brasil');
  assert.equal(merged.banks.banco_341.bankLabel, 'Banco Itaú');
  // Relatórios mesclados corretamente
  assert.equal(merged.reports.pdv_vendas.seenCount, 4);
  assert.equal(merged.reports.pdv_vendas.lastSeenDate, '2026-11-20');
  assert.equal(merged.reports.pdv_cancelamentos.enabled, false);

  // Ordem inversa de argumentos (primeiro argumento mais recente) mantém mesma precedência por updatedAt
  const mergedReversed = mergeRoutineProfiles(remoteNewer, localOlder);
  assert.equal(mergedReversed.banks.banco_336.enabled, false);
  assert.equal(mergedReversed.banks.banco_336.seenCount, 4);
  assert.equal(mergedReversed.banks.banco_336.acctLast4, '0726');
});

test('normalizeRoutineProfile remove entradas espúrias de adquirentes aprendidas por engano como banco (ex.: Relatorio-Vendas-C6Pay_Resumido)', () => {
  const dirty = {
    version: 1,
    updatedAt: '2026-11-26T16:21:14.845Z',
    banks: {
      banco_336: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6', acctLast4: '0726', seenCount: 5, lastSeenDate: '2026-11-25', enabled: true },
      banco_relatorio_vendas_c6pay_resumido: {
        bankKey: 'banco_relatorio_vendas_c6pay_resumido',
        bankCode: '',
        bankLabel: 'Relatorio-Vendas-C6Pay_Resumido',
        acctLast4: '',
        seenCount: 1,
        lastSeenDate: '2026-11-24',
        enabled: true
      }
    },
    reports: {
      adquirente_c6pay: { fileType: 'adquirente_c6pay', seenCount: 4, lastSeenDate: '2026-11-25', enabled: true },
      adquirente_rede: { fileType: 'adquirente_rede', seenCount: 5, lastSeenDate: '2026-11-25', enabled: true }
    }
  };

  const cleaned = normalizeRoutineProfile(dirty);
  assert.ok(cleaned.banks.banco_336, 'Banco C6 legítimo deve ser mantido');
  assert.equal(cleaned.banks.banco_relatorio_vendas_c6pay_resumido, undefined, 'Arquivo C6Pay Resumido não pode permanecer salvo como extrato bancário');

  // Cadastro explícito manual de um banco esperado (ex.: Banco C6 + Itaú) funciona antes de qualquer upload
  const manualAdded = toggleRoutineBankExpected(createEmptyRoutineProfile(), 'banco_341', true, {
    bankCode: '341',
    bankLabel: 'Banco Itaú',
    acctLast4: '1234'
  });
  assert.equal(manualAdded.banks.banco_341.bankLabel, 'Banco Itaú');
  assert.equal(manualAdded.banks.banco_341.enabled, true);
});
