import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCashAiAnalysisPrompt,
  parseCashAiAnalysisResponse,
  toCompanyRulePayload
} from './cashAiDiagnostics.mjs';
import { DEFAULT_FORMULA_CONFIG } from './cashFormulaRules.mjs';

test('buildCashAiAnalysisPrompt includes only unresolved discrepancies, parse errors and current rules', () => {
  const prompt = buildCashAiAnalysisPrompt({
    reconciliation: {
      referenceDate: '2026-11-19',
      status: 'attention',
      healthScore: 92,
      systemTotalCents: 573781,
      realTotalCents: 570000,
      diffTotalCents: -3781,
      matchedPairs: new Array(75).fill({ id: 'matched_ok_hidden' }),
      suggestions: [{ id: 'sug_1', reasonType: 'swapped_method', reasonText: 'Troca exemplo', amountCents: 10200 }],
      missingInBank: [{ id: 'sys_99', description: 'MESA 009 CREDITO', amountCents: 2900, timeStr: '14:32:44', source: 'pdv' }],
      extraInBank: [{ id: 'real_88', description: 'C6 Pay CREDITO', amountCents: 3300, timeStr: '12:31:12', source: 'c6pay' }],
      nonPdvItems: [{ id: 'np_1', description: 'LOCASERV', amountCents: 790000 }]
    },
    parseErrors: [{ fileName: 'itau_estranho.csv', errorMessage: 'Coluna Valor não identificada' }],
    rulesConfig: DEFAULT_FORMULA_CONFIG,
    userQuestion: 'Por que sobrou R$ 33,00 na C6 Pay?'
  });

  assert.match(prompt, /MESA 009 CREDITO/);
  assert.match(prompt, /C6 Pay CREDITO/);
  assert.match(prompt, /itau_estranho\.csv/);
  assert.match(prompt, /Por que sobrou R\$ 33,00/);
  assert.equal(prompt.includes('matched_ok_hidden'), false);
});

test('parseCashAiAnalysisResponse extracts fenced JSON cleanly and defaults missing arrays safely', () => {
  const raw = '```json\n' + JSON.stringify({
    summary: 'Divergência concentrada em 1 venda não lançada.',
    hypotheses: [{ title: 'Possível venda sem registro', systemItemIds: [], realItemIds: ['real_88'], confidence: 'alta', explanation: 'Valor passou na C6Pay às 12:31' }],
    fileDiagnoses: [{ fileName: 'itau_estranho.csv', issue: 'Separador ;', fixGuidance: 'Usar coluna Lançamento' }],
    formulaSuggestions: [{ ruleType: 'normalize_admin', pattern: 'VR ALIM', targetValue: 'ticket', reason: 'Separar voucher na linha Ticket' }]
  }) + '\n```';

  const parsed = parseCashAiAnalysisResponse(raw);
  assert.equal(parsed.summary, 'Divergência concentrada em 1 venda não lançada.');
  assert.equal(parsed.hypotheses.length, 1);
  assert.equal(parsed.fileDiagnoses.length, 1);
  assert.equal(parsed.formulaSuggestions[0].ruleType, 'normalize_admin');

  const fallback = parseCashAiAnalysisResponse('Texto inválido sem JSON');
  assert.equal(fallback.hypotheses.length, 0);
  assert.ok(fallback.summary.length > 0);
});

test('toCompanyRulePayload builds tenant-scoped ai_suggested rule payload', () => {
  const payload = toCompanyRulePayload(
    { ruleType: 'ignore_ofx_memo', pattern: 'LOCASERV', targetValue: 'credito_nao_pdv', reason: 'Transferência interna' },
    'tenant-uuid-123'
  );
  assert.equal(payload.tenant_id, 'tenant-uuid-123');
  assert.equal(payload.rule_type, 'ignore_ofx_memo');
  assert.equal(payload.pattern, 'LOCASERV');
  assert.equal(payload.target_value, 'credito_nao_pdv');
  assert.equal(payload.source_origin, 'ai_suggested');
  assert.equal(payload.is_active, true);
});
