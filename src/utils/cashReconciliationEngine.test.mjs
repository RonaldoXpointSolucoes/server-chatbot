import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseUploadedCashFile } from './cashFileParsers.mjs';
import { DEFAULT_FORMULA_CONFIG } from './cashFormulaRules.mjs';
import { runCashReconciliation } from './cashReconciliationEngine.mjs';

const UPLOAD_DIR = 'C:/Users/NOTE-(FORM)02JUL26/.gemini/antigravity/brain/15c2c45d-2e4f-4867-9efb-2507905522dd/.user_uploaded';

async function load19NovParsedFiles() {
  const pdv = await parseUploadedCashFile({
    fileName: 'PlanilhaRecebimento.xlsx',
    arrayBuffer: fs.readFileSync(`${UPLOAD_DIR}/media_1795378712225_e4f6a83a.xlsx`)
  });
  const conf = await parseUploadedCashFile({
    fileName: 'RelConferencia.xlsx',
    arrayBuffer: fs.readFileSync(`${UPLOAD_DIR}/media_1795379540236_1b7010c2.xlsx`)
  });
  const rede = await parseUploadedCashFile({
    fileName: 'Rede_Rel_Vendas.xlsx',
    arrayBuffer: fs.readFileSync(`${UPLOAD_DIR}/media_1795378748853_11a72afc.xlsx`)
  });
  const c6p = await parseUploadedCashFile({
    fileName: 'Relatorio-Vendas-C6Pay_Detalhado.xlsx',
    arrayBuffer: fs.readFileSync(`${UPLOAD_DIR}/media_1795379472661_df33ee0b.xlsx`)
  });
  const ofx = await parseUploadedCashFile({
    fileName: 'Extrato_C6.ofx',
    textContent: fs.readFileSync(`${UPLOAD_DIR}/media_1795378631614_64afeb10.ofx`, 'utf8')
  });
  const txt = await parseUploadedCashFile({
    fileName: 'fechamento.txt',
    textContent: `BURGUER PLUS\nMOVIMENTO FECHADO:\nINICIO.: 19/11/2026 07:29:06\nFIM ...: 19/11/2026 23:01:14\nOPERADOR: EDILZA\nOUTROS TOTAIS\nCONSUMO INTERNO.........: 355,00\nTAXA ENTREGA DELIVERY...: 57,00\nNOTA PENDENTE...........: 409,00\nDESCONTO.10%............: 54,80\nTAXA S. CASA............: 114,35\nQUANTIDADE PESSOAS MESA.: 62\nPRODUTOS CANCELADOS\n005     Costela Prime 12h              1\n                        TOTAL QUANT... 3\n                    VALOR TOTAL... 69,00\nVENDAS PENDENTES\nCLEITON FERREIRA (  NOTA PENDE    140,00*\nRONALDO BURGUERPLUS NOTA PENDE     10,00*\nCUPONS FISCAIS\nEMITIDOS                3         347,00\nENTRADAS NO TOTAL\nFUNDO DE CAIXA AUTO DIA ANTERIOR TURNO 1: 610,55\nSAIDAS NO TOTAL\n** VALE FUNC. - ISAAC              50,00*\n** Baixa em Contas a Pagar Ref.     9,60*\n** Baixa em Contas a Pagar Ref.     7,98*\nSANGRIA CX. RET                   630,80\nTOTAL GERAL.........: 698,38\nSALDO DINHEIRO... R$    257,27`
  });
  return [pdv, conf, rede, c6p, ofx, txt];
}

test('runCashReconciliation reproduces exact 19/11 totals, deduplicates C6Pay PIX, and catches swapped Dinheiro payments', async () => {
  const parsedFiles = await load19NovParsedFiles();
  const result = runCashReconciliation({
    parsedFiles,
    rulesConfig: DEFAULT_FORMULA_CONFIG,
    manualInputs: { cashCountedCents: 25727 }
  });

  assert.equal(result.referenceDate, '2026-11-19');
  assert.equal(result.storeName, 'BURGUER PLUS');
  assert.equal(result.operatorName, 'EDILZA');

  const getRow = (k) => result.mirrorRows.find(r => r.key === k);
  assert.equal(getRow('pix').systemCents, 132564);
  assert.equal(getRow('cartao').systemCents, 311510);
  assert.equal(getRow('pendentes').systemCents, 40900);
  assert.equal(getRow('saldo_dinheiro').systemCents, 88807);

  // Deduplicação C6 Pay PIX vs OFX C6: exatamente os 5 PIX até 21:43
  assert.equal(result.deduplicatedItems.length, 5);
  assert.equal(result.notAuthorizedItems.length, 4);
  assert.ok(result.nonPdvItems.some(i => i.amountCents === 790000));

  // Detecção das 3 trocas de forma de pagamento (102, 8, 147.40 -> soma 25740)
  const swapped = result.suggestions.filter(s => s.reasonType === 'swapped_method');
  const swappedAmounts = swapped.map(s => s.amountCents).sort((a, b) => a - b);
  assert.deepEqual(swappedAmounts, [800, 10200, 14740]);

  // Confirmando as 3 sugestões de troca, o Real digital incorpora os 3 valores e o caixa de dinheiro explica 25740 trocados
  const resolved = runCashReconciliation({
    parsedFiles,
    rulesConfig: DEFAULT_FORMULA_CONFIG,
    manualInputs: { cashCountedCents: 25727 },
    manualResolutions: swapped.map(s => ({ action: 'confirm_suggestion', suggestionId: s.id }))
  });
  assert.equal(resolved.suggestions.filter(s => s.reasonType === 'swapped_method').length, 0);
  assert.equal(resolved.cashDrawerSummary.swappedToDigitalCents, 25740);
  assert.equal(resolved.financialMetrics.cancelledCents, 6900);
  assert.equal(resolved.financialMetrics.internalConsumptionCents, 35500);

  // Sobras na C6Pay sem par no PDV: 3300 e 2500 + 2500
  const extraAmounts = resolved.extraInBank.map(i => i.amountCents).sort((a, b) => a - b);
  assert.deepEqual(extraAmounts, [2500, 2500, 3300]);
  // Faltas no banco sem par: 400, 2800, 2900
  const missingAmounts = resolved.missingInBank.map(i => i.amountCents).sort((a, b) => a - b);
  assert.deepEqual(missingAmounts, [400, 2800, 2900]);
});

test('runCashReconciliation detects 1:N split payments and N:1 grouped payments in turn window', () => {
  const parsedFiles = [
    {
      fileType: 'pdv_vendas',
      status: 'ok',
      periodStart: '2026-11-19',
      periodEnd: '2026-11-19',
      rows: [
        { rowIndex: 1, numero: '010', modulo: 'MESA', origem: 'MESA', amountCents: 5000, receivedCents: 5000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'CREDITO', category: 'cartao', subType: 'credito', dateStr: '2026-11-19', timeStr: '22:50:00', secondsOfDay: 82200, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
        { rowIndex: 2, numero: '011', modulo: 'MESA', origem: 'MESA', amountCents: 1800, receivedCents: 1800, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'PIX', category: 'pix', subType: 'pix_pdv', dateStr: '2026-11-19', timeStr: '12:00:00', secondsOfDay: 43200, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
        { rowIndex: 3, numero: '012', modulo: 'MESA', origem: 'MESA', amountCents: 2200, receivedCents: 2200, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'PIX', category: 'pix', subType: 'pix_pdv', dateStr: '2026-11-19', timeStr: '12:02:00', secondsOfDay: 43320, operador: 'Op1', nomeMaquina: 'SERVIDOR' }
      ]
    },
    {
      fileType: 'adquirente_c6pay',
      status: 'ok',
      periodStart: '2026-11-19',
      periodEnd: '2026-11-19',
      rows: [
        { rowIndex: 1, source: 'c6pay', isApproved: true, category: 'cartao', subType: 'credito', amountCents: 2500, feeCents: 70, netCents: 2430, dateStr: '2026-11-19', timeStr: '22:51:03', secondsOfDay: 82263 },
        { rowIndex: 2, source: 'c6pay', isApproved: true, category: 'cartao', subType: 'credito', amountCents: 2500, feeCents: 70, netCents: 2430, dateStr: '2026-11-19', timeStr: '22:51:20', secondsOfDay: 82280 }
      ]
    },
    {
      fileType: 'extrato_ofx',
      status: 'ok',
      periodStart: '2026-11-19',
      periodEnd: '2026-11-19',
      rows: [
        { source: 'ofx', ofxClass: 'pix_cliente', category: 'pix', amountCents: 4000, dateStr: '2026-11-19', timeStr: '12:03:00', secondsOfDay: 43380, memo: 'PIX CLIENTE' }
      ]
    }
  ];

  const res = runCashReconciliation({ parsedFiles });
  assert.ok(res.suggestions.some(s => s.reasonType === 'split_1_to_n' && s.amountCents === 5000 && s.realIds.length === 2));
  assert.ok(res.suggestions.some(s => s.reasonType === 'grouped_n_to_1' && s.amountCents === 4000 && s.systemIds.length === 2));
  assert.ok(!Number.isNaN(res.healthScore));
});

test('runCashReconciliation computes clean mirrorRows without NaN when RelConferencia and TXT are omitted', () => {
  const partialFiles = [
    {
      fileType: 'pdv_vendas',
      status: 'ok',
      periodStart: '2026-11-19',
      periodEnd: '2026-11-19',
      rows: [
        { rowIndex: 1, numero: '001', modulo: 'MESA', origem: 'MESA', amountCents: 4200, receivedCents: 4200, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'PIX', category: 'pix', subType: 'pix_pdv', dateStr: '2026-11-19', timeStr: '12:00:00', secondsOfDay: 43200, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
        { rowIndex: 2, numero: '002', modulo: 'MESA', origem: 'MESA', amountCents: 3000, receivedCents: 3000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: 'DINHEIRO', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-19', timeStr: '12:15:00', secondsOfDay: 44100, operador: 'Op1', nomeMaquina: 'SERVIDOR' }
      ]
    },
    {
      fileType: 'extrato_ofx',
      status: 'ok',
      periodStart: '2026-11-19',
      periodEnd: '2026-11-19',
      rows: [
        { source: 'ofx', ofxClass: 'pix_cliente', category: 'pix', amountCents: 4200, dateStr: '2026-11-19', timeStr: '12:00:10', secondsOfDay: 43210, memo: 'PIX CLIENTE' }
      ]
    }
  ];

  const res = runCashReconciliation({ parsedFiles: partialFiles, manualInputs: { cashCountedCents: 3000 } });
  const pixRow = res.mirrorRows.find(r => r.key === 'pix');
  const cashRow = res.mirrorRows.find(r => r.key === 'saldo_dinheiro');
  assert.equal(pixRow.systemCents, 4200);
  assert.equal(pixRow.realCents, 4200);
  assert.equal(pixRow.diffCents, 0);
  assert.equal(cashRow.systemCents, 3000);
  assert.equal(cashRow.realCents, 3000);
  assert.equal(res.status, 'balanced');
  assert.ok(Number.isFinite(res.healthScore));
});
