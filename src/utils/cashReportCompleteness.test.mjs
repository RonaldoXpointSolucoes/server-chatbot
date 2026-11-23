import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DATADIVAS_REPORT_SPECS,
  BANK_REPORT_SPECS,
  assessCashReportCompleteness
} from './cashReportCompleteness.mjs';

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
