import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCentsAsBrlInput,
  formatLiveBrlInput,
  formatReaisAsBrlInput,
  parseFormattedBrlToCents,
  parseFormattedBrlToReais
} from './currencyInputMask.mjs';

test('formatCentsAsBrlInput formats integers into BRL edit strings cleanly', () => {
  assert.equal(formatCentsAsBrlInput(null), '');
  assert.equal(formatCentsAsBrlInput(undefined), '');
  assert.equal(formatCentsAsBrlInput(0), '0,00');
  assert.equal(formatCentsAsBrlInput(1), '0,01');
  assert.equal(formatCentsAsBrlInput(50), '0,50');
  assert.equal(formatCentsAsBrlInput(33010), '330,10');
  assert.equal(formatCentsAsBrlInput(123456), '1.234,56');
  assert.equal(formatCentsAsBrlInput(-9709), '-97,09');
});

test('formatLiveBrlInput auto-formats sequential digits without requiring dot or comma', () => {
  let state = '';
  const sequence = [
    { key: '3', expectedText: '0,03', expectedCents: 3 },
    { key: '3', expectedText: '0,33', expectedCents: 33 },
    { key: '0', expectedText: '3,30', expectedCents: 330 },
    { key: '1', expectedText: '33,01', expectedCents: 3301 },
    { key: '0', expectedText: '330,10', expectedCents: 33010 }
  ];

  for (const step of sequence) {
    const res = formatLiveBrlInput(`${state}${step.key}`, state);
    assert.equal(res.text, step.expectedText);
    assert.equal(res.cents, step.expectedCents);
    state = res.text;
  }

  const big = formatLiveBrlInput(`${state}9`, state);
  assert.equal(big.text, '3.301,09');
  assert.equal(big.cents, 330109);
  assert.equal(big.reais, 3301.09);
});

test('formatLiveBrlInput supports zero, backspace unblocking, clearing, and stray punctuation', () => {
  const zero = formatLiveBrlInput('0', '');
  assert.deepEqual(zero, { text: '0,00', cents: 0, reais: 0 });

  const fromZeroToFive = formatLiveBrlInput('0,005', '0,00');
  assert.deepEqual(fromZeroToFive, { text: '0,05', cents: 5, reais: 0.05 });

  const backspaceToZero = formatLiveBrlInput('0,0', '0,05');
  assert.deepEqual(backspaceToZero, { text: '0,00', cents: 0, reais: 0 });

  const backspaceClearFromZero = formatLiveBrlInput('0,0', '0,00');
  assert.deepEqual(backspaceClearFromZero, { text: '', cents: null, reais: 0 });

  const strayComma = formatLiveBrlInput('3,30,', '3,30');
  assert.deepEqual(strayComma, { text: '3,30', cents: 330, reais: 3.3 });

  const cleared = formatLiveBrlInput('', '330,10');
  assert.deepEqual(cleared, { text: '', cents: null, reais: 0 });
});

test('formatLiveBrlInput handles pasted formatted or decimal values into empty fields', () => {
  assert.deepEqual(formatLiveBrlInput('R$ 1.234,56', ''), { text: '1.234,56', cents: 123456, reais: 1234.56 });
  assert.deepEqual(formatLiveBrlInput('99.5', ''), { text: '99,50', cents: 9950, reais: 99.5 });
  assert.deepEqual(formatLiveBrlInput('99,5', ''), { text: '99,50', cents: 9950, reais: 99.5 });
  assert.deepEqual(formatLiveBrlInput('33010', ''), { text: '330,10', cents: 33010, reais: 330.1 });
});

test('formatReaisAsBrlInput and parseFormattedBrl helpers convert accurately', () => {
  assert.equal(formatReaisAsBrlInput(330.1), '330,10');
  assert.equal(formatReaisAsBrlInput(1234.56), '1.234,56');
  assert.equal(formatReaisAsBrlInput(0, { allowEmptyZero: true }), '');
  assert.equal(formatReaisAsBrlInput(0), '0,00');

  assert.equal(parseFormattedBrlToCents('1.234,56'), 123456);
  assert.equal(parseFormattedBrlToCents(''), null);
  assert.equal(parseFormattedBrlToReais('1.234,56'), 1234.56);
  assert.equal(parseFormattedBrlToReais(''), 0);
});
