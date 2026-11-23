import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FILE_PASSWORD_RULE_PREFIX,
  isLikelyC6PayFileName,
  normalizePasswordFileKey,
  extractCnpjPrefix6,
  buildPasswordRulePattern,
  extractSavedPasswordsFromRules,
  isInternalCashSettingRule,
  filterVisibleFormulaRules,
  loadSavedFilePasswordsFromStorage,
  upsertSavedFilePasswordInStorage,
  removeSavedFilePasswordFromStorage,
  mergeSavedFilePasswordLists,
  buildPasswordCandidates
} from './cashFilePasswordHelper.mjs';

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  };
}

test('isLikelyC6PayFileName e normalizePasswordFileKey agrupam variações de Relatorio-Vendas-C6Pay_Detalhado', () => {
  assert.equal(isLikelyC6PayFileName('Relatorio-Vendas-C6Pay_Detalhado.xlsx'), true);
  assert.equal(isLikelyC6PayFileName('Relatorio-Vendas-C6Pay_Detalhado (1).xlsx'), true);
  assert.equal(isLikelyC6PayFileName('C6 - detalhado 2.xlsx'), true);
  assert.equal(isLikelyC6PayFileName('PlanilhaRecebimento.xlsx'), false);

  assert.equal(
    normalizePasswordFileKey('Relatorio-Vendas-C6Pay_Detalhado (2).xlsx'),
    'RELATORIO-VENDAS-C6PAY_DETALHADO'
  );
  assert.equal(
    normalizePasswordFileKey('Relatorio-Vendas-C6Pay_Detalhado_19_11_2026.xlsx'),
    'RELATORIO-VENDAS-C6PAY_DETALHADO'
  );
});

test('extractCnpjPrefix6 extrai os 6 primeiros dígitos de CNPJ válido ou objeto settings', () => {
  assert.equal(extractCnpjPrefix6('22.059.300/0001-45'), '220593');
  assert.equal(extractCnpjPrefix6('22059300000145'), '220593');
  assert.equal(extractCnpjPrefix6('220593'), '');
  assert.equal(extractCnpjPrefix6('12345678901'), ''); // CPF 11 dígitos não gera CNPJ6
  assert.equal(extractCnpjPrefix6({ fiscal: { cnpj: '12.345.678/0001-99' } }), '123456');
});

test('buildPasswordRulePattern mapeia C6 Pay para chave estável compartilhada e exclui da lista Fórmula 1', () => {
  const c6Pattern = buildPasswordRulePattern('Relatorio-Vendas-C6Pay_Detalhado.xlsx', 'adquirente_c6pay');
  assert.equal(c6Pattern, `${FILE_PASSWORD_RULE_PREFIX}adquirente_c6pay`);

  const rules = [
    { id: 'r1', rule_type: 'normalize_admin', pattern: 'C6 PIX', target_value: 'pix', is_active: true },
    {
      id: 'r2',
      rule_type: 'engine_setting',
      pattern: c6Pattern,
      target_value: '220593',
      is_active: true,
      notes: 'C6 Pay'
    }
  ];

  const visible = filterVisibleFormulaRules(rules);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'r1');

  const extracted = extractSavedPasswordsFromRules(rules);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].key, 'adquirente_c6pay');
  assert.equal(extracted[0].password, '220593');
  assert.equal(extracted[0].ruleId, 'r2');
});

test('buildPasswordCandidates prioriza senha salva da planilha/empresa e expande CNPJ colado manualmente', () => {
  // 1. Upload automático na 2ª vez usa senha fixa salva para C6 antes de padrões Excel
  const autoList = buildPasswordCandidates({
    fileName: 'Relatorio-Vendas-C6Pay_Detalhado (3).xlsx',
    savedPasswords: [
      { pattern: 'file_password:other_sheet', key: 'other_sheet', password: '999999' },
      { pattern: 'file_password:adquirente_c6pay', key: 'adquirente_c6pay', password: '220593' }
    ],
    tenantSettings: { cnpj: '11.111.111/0001-11' }
  });
  assert.deepEqual(autoList, ['220593', '999999', '111111', 'VelvetSweatshop', '']);

  // 2. Se operador colar CNPJ completo na 1ª vez, inclui também os 6 primeiros dígitos
  const manualCnpjList = buildPasswordCandidates({
    fileName: 'Relatorio-Vendas-C6Pay_Detalhado.xlsx',
    customPassword: '22.059.300/0001-45'
  });
  assert.deepEqual(manualCnpjList, ['22.059.300/0001-45', '220593']);

  // 3. Senha manual comum não gera heurística indevida
  assert.deepEqual(
    buildPasswordCandidates({ fileName: 'Planilha.xlsx', customPassword: 'minha-senha' }),
    ['minha-senha']
  );
});

test('storage de senhas fixas mantém isolamento estrito por tenant e faz merge sem duplicatas', () => {
  const storage = createMemoryStorage();
  upsertSavedFilePasswordInStorage(storage, 'tenant-a', {
    fileName: 'Relatorio-Vendas-C6Pay_Detalhado.xlsx',
    fileType: 'adquirente_c6pay',
    password: '220593'
  });
  upsertSavedFilePasswordInStorage(storage, 'tenant-b', {
    fileName: 'Relatorio-Vendas-C6Pay_Detalhado.xlsx',
    fileType: 'adquirente_c6pay',
    password: '778899'
  });

  const listA = loadSavedFilePasswordsFromStorage(storage, 'tenant-a');
  const listB = loadSavedFilePasswordsFromStorage(storage, 'tenant-b');
  assert.equal(listA.length, 1);
  assert.equal(listA[0].password, '220593');
  assert.equal(listB[0].password, '778899');

  const merged = mergeSavedFilePasswordLists(listA, [
    { pattern: 'file_password:adquirente_c6pay', key: 'adquirente_c6pay', password: '220593', ruleId: 'uuid-1' }
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].ruleId, 'uuid-1');

  removeSavedFilePasswordFromStorage(storage, 'tenant-a', 'adquirente_c6pay');
  assert.equal(loadSavedFilePasswordsFromStorage(storage, 'tenant-a').length, 0);
  assert.equal(loadSavedFilePasswordsFromStorage(storage, 'tenant-b').length, 1);
});

test('filterVisibleFormulaRules exclui configurações internas (file_password, company_routine:profile, whatsapp_notify:phone) mantendo regras da Fórmula 1', () => {
  const rules = [
    { id: 'r-admin', rule_type: 'normalize_admin', pattern: 'REDE PIX', target_value: 'pix', is_active: true },
    { id: 'r-ai-setting', rule_type: 'engine_setting', pattern: 'amountToleranceCents', target_value: '5', is_active: true, source_origin: 'ai' },
    { id: 'r-ignore', rule_type: 'ignore_ofx_memo', pattern: 'LOCASERV', target_value: 'credito_nao_pdv', is_active: true },
    { id: 'r-pwd', rule_type: 'engine_setting', pattern: `${FILE_PASSWORD_RULE_PREFIX}adquirente_c6pay`, target_value: '220593', is_active: true },
    { id: 'r-routine', rule_type: 'engine_setting', pattern: 'company_routine:profile', target_value: '{"banks":{}}', is_active: true },
    { id: 'r-wpp', rule_type: 'engine_setting', pattern: 'whatsapp_notify:phone', target_value: '5511999999999', is_active: true }
  ];

  assert.equal(isInternalCashSettingRule(rules[3]), true);
  assert.equal(isInternalCashSettingRule(rules[4]), true);
  assert.equal(isInternalCashSettingRule(rules[5]), true);
  assert.equal(isInternalCashSettingRule(rules[0]), false);
  assert.equal(isInternalCashSettingRule(rules[1]), false);

  const visible = filterVisibleFormulaRules(rules);
  assert.deepEqual(
    visible.map((r) => r.id),
    ['r-admin', 'r-ai-setting', 'r-ignore']
  );
});
