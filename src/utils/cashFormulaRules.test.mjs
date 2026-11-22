import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FORMULA_CONFIG,
  mergeCompanyFormulaRules,
  normalizePdvPayment,
  classifyOfxCredit
} from './cashFormulaRules.mjs';

test('normalizePdvPayment maps DataDivas payment methods and irregular administradoras consistently', () => {
  const cfg = DEFAULT_FORMULA_CONFIG;
  assert.equal(normalizePdvPayment('CARTÃO', 'PIX C6 BANK', cfg).category, 'pix');
  assert.equal(normalizePdvPayment('CARTÃO', 'PAGO ONLINE PIX', cfg).category, 'pix');
  assert.equal(normalizePdvPayment('CARTÃO', 'PIX', cfg).category, 'pix');

  assert.deepEqual(
    { category: normalizePdvPayment('CARTÃO', 'ANTONIO ALBERTO CREDITO', cfg).category, subType: normalizePdvPayment('CARTÃO', 'ANTONIO ALBERTO CREDITO', cfg).subType },
    { category: 'cartao', subType: 'credito' }
  );
  assert.deepEqual(
    { category: normalizePdvPayment('CARTÃO', '/ CREDITO', cfg).category, subType: normalizePdvPayment('CARTÃO', '/ CREDITO', cfg).subType },
    { category: 'cartao', subType: 'credito' }
  );
  assert.deepEqual(
    { category: normalizePdvPayment('CARTÃO', 'VISA ELECTRON', cfg).category, subType: normalizePdvPayment('CARTÃO', 'VISA ELECTRON', cfg).subType },
    { category: 'cartao', subType: 'debito' }
  );

  assert.equal(normalizePdvPayment('DINHEIRO', 'DINHEIRO', cfg).category, 'dinheiro');
  assert.equal(normalizePdvPayment('NOTA PENDENTE', 'NOTA PENDENTE', cfg).category, 'pendente');
  assert.equal(normalizePdvPayment('CONSUMO INTERNO', 'CONSUMO INTERNO', cfg).category, 'outros');
  assert.equal(normalizePdvPayment('CONSUMO INTERNO', 'CONSUMO INTERNO', cfg).subType, 'consumo_interno');
  assert.equal(normalizePdvPayment('SEM BANDEIRA', 'SEM BANDEIRA', cfg).subType, 'sem_bandeira');
});

test('mergeCompanyFormulaRules applies custom company rules with precedence over defaults', () => {
  const cfg = mergeCompanyFormulaRules([
    { rule_type: 'normalize_admin', pattern: 'VR ALIM', target_value: 'ticket', is_active: true },
    { rule_type: 'ignore_ofx_memo', pattern: 'FORNECEDOR XYZ', target_value: 'credito_nao_pdv', is_active: true },
    { rule_type: 'normalize_admin', pattern: 'INATIVA', target_value: 'outros', is_active: false },
    { rule_type: 'engine_setting', pattern: 'amountToleranceCents', target_value: '5', is_active: true }
  ]);

  assert.equal(normalizePdvPayment('CARTÃO', 'VR ALIM REFEICAO', cfg).category, 'ticket');
  assert.equal(cfg.amountToleranceCents, 5);
  assert.equal(classifyOfxCredit('PIX RECEBIDO FORNECEDOR XYZ', '01a1f443-9631-0ebe-d222-1b4905cf6ace', 15000, cfg), 'credito_nao_pdv');
});

test('classifyOfxCredit recognizes UUID-backed Pix without "Pix" prefix, PAYGO settlements and non-PDV transfers', () => {
  const cfg = DEFAULT_FORMULA_CONFIG;
  assert.equal(classifyOfxCredit('DJALMAOLIVEIR', '01a1f52b-0b71-7f89-ec0a-3a722738f0a3', 9300, cfg), 'pix_cliente');
  assert.equal(classifyOfxCredit('Pix qr code recebido de JOSE LUIZ DA SILVA', '01a1f668-c742-db2b-e8a5-41bf9f6e0b62', 9955, cfg), 'pix_cliente');
  assert.equal(classifyOfxCredit('ANTECIP. - PAYGO ADMINISTR - Elo Crédito', '202611190000290119179', 7142, cfg), 'liquidacao_maquininha');
  assert.equal(classifyOfxCredit('CART. DEBIT - PAYGO ADMINISTR - Maestro ', '202611190000279490031', 92044, cfg), 'liquidacao_maquininha');
  assert.equal(classifyOfxCredit('Pix recebido de LOCASERV MARKETING E SERVICOS LTDA', '01a1f443-9631-0ebe-d222-1b4905cf6ace', 790000, cfg), 'credito_nao_pdv');
});
