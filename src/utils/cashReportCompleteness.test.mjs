import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DATADIVAS_REPORT_SPECS,
  BANK_REPORT_SPECS,
  assessCashReportCompleteness,
  resolveAuditWarningsExpandState,
  resolveNextAuditWarningsUserOverride
} from './cashReportCompleteness.mjs';
import {
  createEmptyRoutineProfile,
  learnRoutineFromParsedFiles,
  toggleRoutineBankExpected,
  toggleRoutineReportExpected
} from './cashCompanyRoutineHelper.mjs';
import { runCashReconciliation } from './cashReconciliationEngine.mjs';

test('assessCashReportCompleteness tracks all 7 DataDivas and 3 bank reports and warns accurately on missing files', () => {
  assert.equal(DATADIVAS_REPORT_SPECS.length, 7);
  assert.equal(BANK_REPORT_SPECS.length, 3);

  const partial = assessCashReportCompleteness([
    { parsed: { status: 'ok', fileType: 'pdv_vendas' } },
    { parsed: { status: 'ok', fileType: 'rel_conferencia' } },
    { parsed: { status: 'ok', fileType: 'fechamento_txt' } },
    { parsed: { status: 'ok', fileType: 'extrato_generico' } },
    { parsed: { status: 'password_required', fileType: 'adquirente_c6pay' } }
  ]);

  assert.equal(partial.system.presentCount, 3);
  assert.equal(partial.system.totalExpected, 7);
  assert.equal(partial.system.missing.length, 4);
  assert.equal(partial.bank.presentCount, 1);
  assert.equal(partial.bank.totalExpected, 3);
  assert.equal(partial.bank.missing.length, 2);
  assert.equal(partial.totalPresent, 4);
  assert.equal(partial.totalExpected, 10);
  assert.equal(partial.isComplete, false);
  assert.equal(partial.warnings.length, 2);
  assert.match(partial.warnings[0], /4 de 7/);
  assert.match(partial.warnings[1], /C6 Pay/);

  const complete = assessCashReportCompleteness([
    ...DATADIVAS_REPORT_SPECS.map((s) => ({ status: 'ok', fileType: s.fileType })),
    ...BANK_REPORT_SPECS.map((b) => ({ status: 'ok', fileType: b.fileType }))
  ]);

  assert.equal(complete.totalPresent, 10);
  assert.equal(complete.totalExpected, 10);
  assert.equal(complete.percent, 100);
  assert.equal(complete.isComplete, true);
  assert.equal(complete.warnings.length, 0);
});


test('assessCashReportCompleteness expande bancos aprendidos (C6 + Itaú), alerta ausência parcial de Banco Itaú e limpa aviso ao dispensar', () => {
  const day1Files = [
    {
      parsed: {
        status: 'ok',
        fileType: 'extrato_ofx',
        summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6', acctLast4: '0726' }
      }
    },
    {
      parsed: {
        status: 'ok',
        fileType: 'extrato_ofx',
        summary: { bankKey: 'banco_341', bankCode: '341', bankLabel: 'Banco Itaú', acctLast4: '8812' }
      }
    },
    { parsed: { status: 'ok', fileType: 'adquirente_rede', summary: {} } },
    { parsed: { status: 'ok', fileType: 'adquirente_c6pay', summary: {} } },
    { parsed: { status: 'ok', fileType: 'pdv_vendas', summary: {} } }
  ];

  const learned = learnRoutineFromParsedFiles(createEmptyRoutineProfile(), day1Files, '2026-11-19').profile;

  const day2OnlyC6 = [
    ...DATADIVAS_REPORT_SPECS.map((s) => ({ status: 'ok', fileType: s.fileType })),
    {
      status: 'ok',
      fileType: 'extrato_ofx',
      summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6', acctLast4: '0726' }
    },
    { status: 'ok', fileType: 'adquirente_rede', summary: {} },
    { status: 'ok', fileType: 'adquirente_c6pay', summary: {} }
  ];

  const completeness = assessCashReportCompleteness(day2OnlyC6, learned);

  const c6Item = completeness.bank.items.find((i) => i.bankKey === 'banco_336');
  const itauItem = completeness.bank.items.find((i) => i.bankKey === 'banco_341');

  assert.ok(c6Item, 'Banco C6 deve aparecer em bank.items');
  assert.equal(c6Item.present, true);
  assert.equal(c6Item.isLearnedBank, true);
  assert.equal(c6Item.isHabitual, true);
  assert.equal(c6Item.seenCount, 1);
  assert.match(c6Item.label, /Banco C6 \(OFX\)/);

  assert.ok(itauItem, 'Banco Itaú deve aparecer em bank.items');
  assert.equal(itauItem.present, false);
  assert.equal(itauItem.isLearnedBank, true);
  assert.equal(itauItem.isHabitual, true);
  assert.equal(itauItem.seenCount, 1);
  assert.match(itauItem.label, /Banco Itaú \(OFX\)/);

  assert.equal(completeness.bank.totalExpected, 4);
  assert.equal(completeness.bank.presentCount, 3);
  assert.equal(completeness.isComplete, false);
  assert.ok(
    completeness.warnings.some((w) => /Banco Ita[uú]/i.test(w)),
    'Deve gerar alerta explícito mencionando Banco Itaú'
  );

  // Ao dispensar Banco Itaú na rotina, o alerta desaparece imediatamente
  const withoutItau = toggleRoutineBankExpected(learned, 'banco_341', false);
  const afterToggle = assessCashReportCompleteness(day2OnlyC6, withoutItau);

  assert.equal(afterToggle.warnings.some((w) => /Banco Ita[uú]/i.test(w)), false);
  assert.equal(afterToggle.bank.totalExpected, 3);
  assert.equal(afterToggle.bank.presentCount, 3);
  assert.equal(afterToggle.isComplete, true);
  assert.equal(afterToggle.warnings.length, 0);
});

test('assessCashReportCompleteness destaca novo banco não aprendido no upload ativo e respeita relatórios dispensados', () => {
  const learnedOnlyC6 = learnRoutineFromParsedFiles(
    createEmptyRoutineProfile(),
    [
      {
        status: 'ok',
        fileType: 'extrato_ofx',
        summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6' }
      }
    ],
    '2026-11-19'
  ).profile;

  const profileWithDismissedCancel = toggleRoutineReportExpected(learnedOnlyC6, 'pdv_cancelamentos', false);

  const files = [
    ...DATADIVAS_REPORT_SPECS.filter((s) => s.fileType !== 'pdv_cancelamentos').map((s) => ({
      status: 'ok',
      fileType: s.fileType
    })),
    {
      status: 'ok',
      fileType: 'extrato_ofx',
      summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6' }
    },
    {
      status: 'ok',
      fileType: 'extrato_ofx',
      summary: { bankKey: 'banco_001', bankCode: '001', bankLabel: 'Banco do Brasil', acctLast4: '1122' }
    },
    { status: 'ok', fileType: 'adquirente_rede' },
    { status: 'ok', fileType: 'adquirente_c6pay' }
  ];

  const completeness = assessCashReportCompleteness(files, profileWithDismissedCancel);
  const bbItem = completeness.bank.items.find((i) => i.bankKey === 'banco_001');
  assert.ok(bbItem, 'Novo banco enviado no upload ativo deve ser exibido');
  assert.equal(bbItem.present, true);
  assert.equal(bbItem.isLearnedBank, false);
  assert.equal(bbItem.isHabitual, false);
  assert.equal(completeness.system.totalExpected, 6);
  assert.equal(completeness.system.missing.length, 0);
  assert.equal(completeness.isComplete, true);
});

test('runCashReconciliation propaga companyRoutineProfile para result.reportCompleteness', () => {
  const learned = learnRoutineFromParsedFiles(
    createEmptyRoutineProfile(),
    [
      {
        status: 'ok',
        fileType: 'extrato_ofx',
        summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6' }
      },
      {
        status: 'ok',
        fileType: 'extrato_ofx',
        summary: { bankKey: 'banco_341', bankCode: '341', bankLabel: 'Banco Itaú' }
      }
    ],
    '2026-11-19'
  ).profile;

  const result = runCashReconciliation({
    parsedFiles: [
      {
        fileType: 'extrato_ofx',
        status: 'ok',
        periodStart: '2026-11-20',
        periodEnd: '2026-11-20',
        summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6' },
        rows: []
      }
    ],
    companyRoutineProfile: learned
  });

  const itau = result.reportCompleteness.bank.items.find((i) => i.bankKey === 'banco_341');
  assert.ok(itau);
  assert.equal(itau.present, false);
  assert.ok(result.reportCompleteness.warnings.some((w) => /Banco Ita[uú]/i.test(w)));
});

test('resolveAuditWarningsExpandState permite recolher com "Ocultar Detalhes" mesmo havendo erro crítico ativo', () => {
  // Sem erro: recolhido por padrão, usuário pode expandir
  assert.equal(resolveAuditWarningsExpandState(false, null), false);
  assert.equal(resolveAuditWarningsExpandState(false, true), true);

  // Com erro crítico: expandido por padrão (userOverride === null), MAS recolhe se usuário clicou Ocultar (false)
  assert.equal(resolveAuditWarningsExpandState(true, null), true);
  assert.equal(resolveAuditWarningsExpandState(true, false), false, 'Clique em Ocultar Detalhes deve recolher mesmo com erro crítico');
  assert.equal(resolveAuditWarningsExpandState(true, true), true);

  // Mudança de assinatura de erros reseta override para null apenas quando os erros mudarem
  assert.equal(resolveNextAuditWarningsUserOverride('err_a', 'err_a', false), false);
  assert.equal(resolveNextAuditWarningsUserOverride('err_a', 'err_a|err_b', false), null);
  assert.equal(resolveNextAuditWarningsUserOverride('err_a', '', false), null);
});
