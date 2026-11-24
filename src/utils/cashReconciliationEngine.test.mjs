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

test('runCashReconciliation does not double-count confirmed swapped Dinheiro->Digital into realTotalCents and respects ignored items and multi-day dates', async () => {
  const parsedFiles = await load19NovParsedFiles();

  // Sem confirmar trocas ainda, apura baseline
  const initial = runCashReconciliation({
    parsedFiles,
    rulesConfig: DEFAULT_FORMULA_CONFIG,
    manualInputs: { cashCountedCents: 0 } // zero físico se 25740 foi pro digital + 63080 sangria -> vamos testar gaveta real de 0 vs 25727-25740
  });
  const digitalPixBefore = initial.mirrorRows.find(r => r.key === 'pix').realCents;
  const digitalCardBefore = initial.mirrorRows.find(r => r.key === 'cartao').realCents;

  // Cenário exato: gaveta física teve R$ 0,00 porque R$ 257,40 foram no digital e R$ 630,67/630,80 na sangria
  const swapped = initial.suggestions.filter(s => s.reasonType === 'swapped_method');
  const confirmed = runCashReconciliation({
    parsedFiles,
    rulesConfig: DEFAULT_FORMULA_CONFIG,
    manualInputs: { cashCountedCents: -13 },
    manualResolutions: swapped.map(s => ({ action: 'confirm_suggestion', suggestionId: s.id }))
  });

  // 1. Confirmar trocas NÃO deve inflar saldo_dinheiro.realCents nem duplicar realTotalCents!
  assert.equal(confirmed.mirrorRows.find(r => r.key === 'pix').realCents, digitalPixBefore);
  assert.equal(confirmed.mirrorRows.find(r => r.key === 'cartao').realCents, digitalCardBefore);
  assert.equal(confirmed.mirrorRows.find(r => r.key === 'saldo_dinheiro').realCents, 63080 - 13);
  assert.equal(confirmed.cashDrawerSummary.adjustedCashExpectedCents, 25727 - 25740);

  // 2. Ignorar um item extra no banco deve descontá-lo do realPixCents / realCartaoCents
  const extraCard = confirmed.extraInBank.find(e => e.category === 'cartao');
  const afterIgnore = runCashReconciliation({
    parsedFiles,
    rulesConfig: DEFAULT_FORMULA_CONFIG,
    manualInputs: { cashCountedCents: -13 },
    manualResolutions: [
      ...swapped.map(s => ({ action: 'confirm_suggestion', suggestionId: s.id })),
      { action: 'ignore_item', realIds: [extraCard.id] }
    ]
  });
  assert.equal(
    afterIgnore.mirrorRows.find(r => r.key === 'cartao').realCents,
    digitalCardBefore - extraCard.amountCents
  );

  // 3. Pendentes sem input REAL manual não devem forçar status 'shortage' quando caixa + digital batem
  const cleanDay = runCashReconciliation({
    parsedFiles: [
      {
        fileType: 'pdv_vendas',
        status: 'ok',
        periodStart: '2026-11-19',
        periodEnd: '2026-11-19',
        rows: [
          { rowIndex: 1, numero: '001', modulo: 'MESA', origem: 'MESA', amountCents: 5000, receivedCents: 5000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'PIX', category: 'pix', subType: 'pix_pdv', dateStr: '2026-11-19', timeStr: '12:00:00', secondsOfDay: 43200, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
          { rowIndex: 2, numero: '002', modulo: 'MESA', origem: 'MESA', amountCents: 10000, receivedCents: 10000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'NOTA PENDENTE', administradora: 'NOTA PENDENTE', category: 'pendente', subType: 'nota_pendente', dateStr: '2026-11-19', timeStr: '12:10:00', secondsOfDay: 43800, operador: 'Op1', nomeMaquina: 'SERVIDOR' }
        ]
      },
      {
        fileType: 'extrato_ofx',
        status: 'ok',
        periodStart: '2026-11-19',
        periodEnd: '2026-11-19',
        rows: [
          { source: 'ofx', ofxClass: 'pix_cliente', category: 'pix', amountCents: 5000, dateStr: '2026-11-19', timeStr: '12:00:10', secondsOfDay: 43210, memo: 'PIX CLIENTE' }
        ]
      }
    ],
    manualInputs: { cashCountedCents: 0 }
  });
  assert.equal(cleanDay.status, 'balanced');

  // 4. Multi-dia OFX não deve casar dias diferentes; virada meia-noite (23:55 vs 00:02 D+1) deve casar
  const multiDay = runCashReconciliation({
    parsedFiles: [
      {
        fileType: 'pdv_vendas',
        status: 'ok',
        periodStart: '2026-11-19',
        periodEnd: '2026-11-19',
        rows: [
          { rowIndex: 1, numero: '001', modulo: 'MESA', origem: 'MESA', amountCents: 5000, receivedCents: 5000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'PIX', category: 'pix', subType: 'pix_pdv', dateStr: '2026-11-19', timeStr: '12:00:00', secondsOfDay: 43200, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
          { rowIndex: 2, numero: '002', modulo: 'MESA', origem: 'MESA', amountCents: 7500, receivedCents: 7500, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'PIX', category: 'pix', subType: 'pix_pdv', dateStr: '2026-11-19', timeStr: '23:55:00', secondsOfDay: 86100, operador: 'Op1', nomeMaquina: 'SERVIDOR' }
        ]
      },
      {
        fileType: 'extrato_ofx',
        status: 'ok',
        periodStart: '2026-11-18',
        periodEnd: '2026-11-20',
        rows: [
          { source: 'ofx', ofxClass: 'pix_cliente', category: 'pix', amountCents: 5000, dateStr: '2026-11-18', timeStr: '12:00:05', secondsOfDay: 43205, memo: 'PIX DIA ANTERIOR' },
          { source: 'ofx', ofxClass: 'pix_cliente', category: 'pix', amountCents: 7500, dateStr: '2026-11-20', timeStr: '00:02:00', secondsOfDay: 120, memo: 'PIX VIRADA MEIA NOITE' }
        ]
      }
    ]
  });
  assert.equal(multiDay.matchedPairs.length, 1);
  assert.equal(multiDay.matchedPairs[0].amountCents, 7500);
  assert.equal(multiDay.missingInBank.length, 1);
  assert.equal(multiDay.missingInBank[0].amountCents, 5000);
  assert.equal(multiDay.extraInBank.length, 0);
  assert.equal(multiDay.outOfPeriodItems.length, 1);
  assert.equal(multiDay.outOfPeriodItems[0].dateStr, '2026-11-18');
  assert.equal(multiDay.mirrorRows.find(r => r.key === 'pix').realCents, 7500);

  // 5. manual_link com IDs inexistentes não deve criar par fantasma
  const ghostCheck = runCashReconciliation({
    parsedFiles: [],
    manualResolutions: [{ action: 'manual_link', systemIds: ['nao_existe'], realIds: ['nao_existe_2'] }]
  });
  assert.equal(ghostCheck.matchedPairs.length, 0);
});

test('runCashReconciliation supports reclassify_system (Dinheiro->Cartao) and saldo_dinheiro override', () => {
  const sampleFiles = [
    {
      fileType: 'pdv_vendas',
      status: 'ok',
      periodStart: '2026-11-19',
      periodEnd: '2026-11-19',
      rows: [
        { rowIndex: 1, numero: '001', modulo: 'MESA', origem: 'MESA', amountCents: 10000, receivedCents: 10000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'CREDITO', category: 'cartao', subType: 'credito', dateStr: '2026-11-19', timeStr: '12:00:00', secondsOfDay: 43200, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
        { rowIndex: 2, numero: '002', modulo: 'MESA', origem: 'MESA', amountCents: 3500, receivedCents: 3500, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: 'DINHEIRO', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-19', timeStr: '12:15:00', secondsOfDay: 44100, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
        { rowIndex: 3, numero: '003', modulo: 'MESA', origem: 'MESA', amountCents: 2000, receivedCents: 2000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: 'DINHEIRO', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-19', timeStr: '12:20:00', secondsOfDay: 44400, operador: 'Op1', nomeMaquina: 'SERVIDOR' }
      ]
    },
    {
      fileType: 'adquirente_rede',
      status: 'ok',
      periodStart: '2026-11-19',
      periodEnd: '2026-11-19',
      rows: [
        { rowIndex: 1, source: 'rede', isApproved: true, category: 'cartao', subType: 'credito', amountCents: 10000, feeCents: 200, netCents: 9800, dateStr: '2026-11-19', timeStr: '12:00:10', secondsOfDay: 43210 },
        { rowIndex: 2, source: 'rede', isApproved: true, category: 'cartao', subType: 'debito', amountCents: 3500, feeCents: 50, netCents: 3450, dateStr: '2026-11-19', timeStr: '12:15:20', secondsOfDay: 44120 }
      ]
    }
  ];

  const before = runCashReconciliation({
    parsedFiles: sampleFiles,
    manualInputs: { categoryRealOverrides: { saldo_dinheiro: 2000 } }
  });

  // Override direto no campo Real de Saldo em Dinheiro
  const cashRowBefore = before.mirrorRows.find(r => r.key === 'saldo_dinheiro');
  assert.equal(cashRowBefore.realCents, 2000);
  assert.equal(cashRowBefore.hasRealInput, true);

  // Usuário ajusta venda de R$ 35,00 que estava em DINHEIRO -> foi para CARTÃO
  const dinheiro35 = before.systemItems.find(s => s.category === 'dinheiro' && s.amountCents === 3500);
  assert.ok(dinheiro35);

  const after = runCashReconciliation({
    parsedFiles: sampleFiles,
    manualInputs: { categoryRealOverrides: { saldo_dinheiro: 2000 } },
    manualResolutions: [{ action: 'reclassify_system', systemIds: [dinheiro35.id], targetCategory: 'cartao' }]
  });

  const cashRowAfter = after.mirrorRows.find(r => r.key === 'saldo_dinheiro');
  const cardRowAfter = after.mirrorRows.find(r => r.key === 'cartao');
  assert.equal(cashRowAfter.systemCents, 2000);
  assert.equal(cashRowAfter.diffCents, 0);
  assert.equal(cardRowAfter.systemCents, 13500);
  assert.equal(cardRowAfter.realCents, 13500);
  assert.equal(cardRowAfter.diffCents, 0);
  assert.equal(after.systemTotalCents, before.systemTotalCents);
  assert.equal(after.matchedPairs.length, 2);
  assert.equal(after.extraInBank.length, 0);
  assert.equal(after.status, 'balanced');
  const adjustedItem = after.systemItems.find(s => s.id === dinheiro35.id);
  assert.equal(adjustedItem.category, 'cartao');
  assert.equal(adjustedItem.metadata.reclassifiedFrom, 'dinheiro');
});

test('runCashReconciliation integrates all 7 DataDivas reports of 20/11 and links items to operations', async () => {
  const parsedFiles = [
    await parseUploadedCashFile({
      fileName: 'PlanilhaRecebimento_20_11.xlsx',
      arrayBuffer: fs.readFileSync(`${UPLOAD_DIR}/media_1795399920235_e1d6e50f.xlsx`)
    }),
    await parseUploadedCashFile({
      fileName: 'RelConferencia_20_11.xlsx',
      arrayBuffer: fs.readFileSync(`${UPLOAD_DIR}/media_1795399920234_13d9ee40.xlsx`)
    }),
    await parseUploadedCashFile({
      fileName: 'MovCaixa_20_11.txt',
      textContent: fs.readFileSync(`${UPLOAD_DIR}/media_1795399920234_f94b9187.txt`, 'latin1')
    }),
    await parseUploadedCashFile({
      fileName: 'Fechamento_Resumo_20_11.txt',
      textContent: fs.readFileSync(`${UPLOAD_DIR}/media_1795399920234_cf61cab7.txt`, 'latin1')
    }),
    await parseUploadedCashFile({
      fileName: 'ItensVendidos_20_11.xlsx',
      arrayBuffer: fs.readFileSync(`${UPLOAD_DIR}/media_1795399840914_32008acd.xlsx`)
    }),
    await parseUploadedCashFile({
      fileName: 'Cancelamentos_20_11.xlsx',
      arrayBuffer: fs.readFileSync(`${UPLOAD_DIR}/media_1795399840914_2d8e87b4.xlsx`)
    }),
    await parseUploadedCashFile({
      fileName: 'Descontos_20_11.xlsx',
      arrayBuffer: fs.readFileSync(`${UPLOAD_DIR}/media_1795399840914_dc0c6dc9.xlsx`)
    })
  ];

  const result = runCashReconciliation({ parsedFiles });
  assert.equal(result.reportCompleteness.system.presentCount, 7);
  assert.equal(result.reportCompleteness.system.totalExpected, 7);
  assert.equal(result.reportCompleteness.bank.presentCount, 0);
  assert.equal(result.reportCompleteness.warnings.length, 1);

  const mesa2Credit = result.systemItems.find(
    (s) => s.referenceCode === '002' && s.amountCents === 4800 && s.timeStr === '12:23:05'
  );
  assert.ok(mesa2Credit?.metadata?.orderDetail);
  assert.equal(mesa2Credit.metadata.orderDetail.items.length, 2);
  assert.equal(mesa2Credit.metadata.orderDetail.itemsSubtotalCents, 4800);

  assert.equal(result.auditInsights.complementsCents, 57400);
  assert.equal(result.auditInsights.internalConsumptionCostCents, 8809);
  assert.equal(result.auditInsights.reopenedTables.length, 2);
  assert.equal(result.auditInsights.cancelledDetails.length, 2);
  assert.ok(result.auditInsights.feeRemovals.length > 0);
  assert.ok(result.auditInsights.topProducts.length > 0);
});

test('runCashReconciliation propagates bankKey, bankCode, bankLabel and acctLast4 into OFX realItems terminalName and metadata', () => {
  const result = runCashReconciliation({
    parsedFiles: [
      {
        fileType: 'extrato_ofx',
        status: 'ok',
        periodStart: '2026-11-19',
        periodEnd: '2026-11-19',
        summary: {
          bankKey: 'banco_341',
          bankCode: '341',
          bankLabel: 'Banco Itaú',
          acctLast4: '8812'
        },
        rows: [
          {
            source: 'ofx',
            ofxClass: 'pix_cliente',
            category: 'pix',
            amountCents: 4200,
            dateStr: '2026-11-19',
            timeStr: '12:00:10',
            secondsOfDay: 43210,
            memo: 'PIX RECEBIDO'
          }
        ]
      }
    ]
  });

  assert.equal(result.realItems.length, 1);
  const item = result.realItems[0];
  assert.equal(item.terminalName, 'Banco Itaú ••••8812');
  assert.equal(item.metadata.bankKey, 'banco_341');
  assert.equal(item.metadata.bankCode, '341');
  assert.equal(item.metadata.bankLabel, 'Banco Itaú');
  assert.equal(item.metadata.acctLast4, '8812');
});

test('runCashReconciliation isolates 20/11 target date from 07/11–22/11 multi-day OFX and flags missing acquirers & drawer hint', async () => {
  const pdv20 = await parseUploadedCashFile({
    fileName: 'PlanilhaRecebimento_20_11.xlsx',
    arrayBuffer: fs.readFileSync(`${UPLOAD_DIR}/media_1795399920235_e1d6e50f.xlsx`)
  });
  const conf20 = await parseUploadedCashFile({
    fileName: 'RelConferencia_20_11.xlsx',
    arrayBuffer: fs.readFileSync(`${UPLOAD_DIR}/media_1795399920234_13d9ee40.xlsx`)
  });
  const txt20 = await parseUploadedCashFile({
    fileName: 'final.txt',
    textContent: fs.readFileSync(`${UPLOAD_DIR}/media_1795399920234_f94b9187.txt`, 'latin1')
  });

  // Simula extrato OFX multi-dias (07/11 a 22/11) contendo PIX de outros dias e apenas 2 PIX de 20/11 (R$ 15,00 e R$ 13,00)
  const multiDayOfxText = `<OFX>
    <BANKMSGSRSV1><STMTTRNRS><STMTRS>
      <BANKACCTFROM><BANKID>336</BANKID><ACCTID>372910726</ACCTID></BANKACCTFROM>
      <BANKTRANLIST>
        <DTSTART>20261107000000</DTSTART><DTEND>20261122235959</DTEND>
        <STMTTRN><FITID>d07_1</FITID><TRNAMT>9000.00</TRNAMT><DTPOSTED>20261107150000</DTPOSTED><TRNTYPE>CREDIT</TRNTYPE><MEMO>Pix qr code recebido CLIENTE DIA 07</MEMO></STMTTRN>
        <STMTTRN><FITID>d19_1</FITID><TRNAMT>4392.83</TRNAMT><DTPOSTED>20261119190000</DTPOSTED><TRNTYPE>CREDIT</TRNTYPE><MEMO>Pix qr code recebido CLIENTE DIA 19</MEMO></STMTTRN>
        <STMTTRN><FITID>d20_1</FITID><TRNAMT>15.00</TRNAMT><DTPOSTED>20261120103435</DTPOSTED><TRNTYPE>CREDIT</TRNTYPE><MEMO>Pix qr code recebido CLIENTE A</MEMO></STMTTRN>
        <STMTTRN><FITID>d20_2</FITID><TRNAMT>13.00</TRNAMT><DTPOSTED>20261120115925</DTPOSTED><TRNTYPE>CREDIT</TRNTYPE><MEMO>Pix recebido c6 qr CLIENTE B</MEMO></STMTTRN>
        <STMTTRN><FITID>d21_late</FITID><TRNAMT>500.00</TRNAMT><DTPOSTED>20261121140000</DTPOSTED><TRNTYPE>CREDIT</TRNTYPE><MEMO>Pix qr code recebido CLIENTE DIA 21</MEMO></STMTTRN>
        <STMTTRN><FITID>d22_1</FITID><TRNAMT>250.00</TRNAMT><DTPOSTED>20261122120000</DTPOSTED><TRNTYPE>CREDIT</TRNTYPE><MEMO>Pix qr code recebido CLIENTE DIA 22</MEMO></STMTTRN>
      </BANKTRANLIST>
    </STMTRS></STMTTRNRS></BANKMSGSRSV1>
  </OFX>`;
  const multiOfx = await parseUploadedCashFile({
    fileName: 'Extrato_Conta_Corrente_C6Bank_22_11_2026.ofx',
    textContent: multiDayOfxText
  });
  assert.equal(multiOfx.periodStart, '2026-11-07');
  assert.equal(multiOfx.periodEnd, '2026-11-22');
  assert.ok(multiOfx.warnings.some((w) => /múltiplos dias/i.test(w)));

  const res = runCashReconciliation({
    parsedFiles: [txt20, pdv20, conf20, multiOfx],
    manualInputs: { cashCountedCents: 0, categoryRealOverrides: { pendentes: 40550 } }
  });

  assert.equal(res.referenceDate, '2026-11-20');
  assert.equal(res.systemTotalCents, 600481);

  // Somente os R$ 28,00 (1500 + 1300) de 20/11 entram em realPixCents — os R$ 14.142,83 de outros dias são isolados
  const pixRow = res.mirrorRows.find((r) => r.key === 'pix');
  assert.equal(pixRow.realCents, 2800);
  assert.equal(res.extraInBank.length, 0);
  assert.equal(res.outOfPeriodItems.length, 4);
  assert.equal(res.periodDiagnostics.totalOutOfPeriodCount, 4);
  assert.equal(res.periodDiagnostics.outOfPeriodPixCount, 4);
  assert.equal(res.periodDiagnostics.outOfPeriodPixCents, 1414283);

  const warningCodes = res.periodDiagnostics.validationWarnings.map((w) => w.code);
  assert.ok(warningCodes.includes('multi_day_filtered'));
  assert.ok(warningCodes.includes('missing_card_acquirers'));
  assert.ok(warningCodes.includes('cash_drawer_txt_hint'));
});

test('runCashReconciliation flags wrong-day real file and prevents multi-day C6Pay from collapsing into one day', async () => {
  const pdv20 = {
    fileType: 'pdv_vendas',
    fileName: 'PDV_20_11.xlsx',
    status: 'ok',
    periodStart: '2026-11-20',
    periodEnd: '2026-11-20',
    rows: [
      { rowIndex: 1, numero: '001', modulo: 'MESA', origem: 'MESA', amountCents: 5000, receivedCents: 5000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'CREDITO', category: 'cartao', subType: 'credito', dateStr: '2026-11-20', timeStr: '12:00:00', secondsOfDay: 43200, operador: 'Op1', nomeMaquina: 'SERVIDOR' }
    ]
  };
  const wrongDayRede = {
    fileType: 'adquirente_rede',
    fileName: 'Rede_19_11.xlsx',
    status: 'ok',
    periodStart: '2026-11-19',
    periodEnd: '2026-11-19',
    rows: [
      { rowIndex: 1, source: 'rede', isApproved: true, category: 'cartao', subType: 'credito', amountCents: 5000, feeCents: 100, netCents: 4900, dateStr: '2026-11-19', timeStr: '12:00:05', secondsOfDay: 43205 }
    ]
  };

  const resWrong = runCashReconciliation({ parsedFiles: [pdv20, wrongDayRede] });
  assert.equal(resWrong.realItems.length, 0);
  assert.equal(resWrong.outOfPeriodItems.length, 1);
  assert.ok(resWrong.periodDiagnostics.validationWarnings.some((w) => w.code === 'wrong_day_real_file' && w.severity === 'error'));
});

test('runCashReconciliation matches Rede 12h AM/PM timestamps (+12h) and excludes pre-opening OFX madrugada entries (< 05:30)', () => {
  const pdv20 = {
    fileType: 'pdv_vendas',
    fileName: 'PlanilhaRecebimento_20_11.xlsx',
    status: 'ok',
    periodStart: '2026-11-20',
    periodEnd: '2026-11-20',
    rows: [
      { rowIndex: 1, numero: '001', modulo: 'CAIXA', origem: 'CAIXA', amountCents: 5000, receivedCents: 5000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'DEBITO', category: 'cartao', subType: 'debito', dateStr: '2026-11-20', timeStr: '08:00:00', secondsOfDay: 8 * 3600, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
      { rowIndex: 2, numero: '002', modulo: 'MESA', origem: 'MESA 002', amountCents: 7755, receivedCents: 7755, recebidoEmBranco: false, changeCents: 0, formaPagto: 'PIX', administradora: 'PIX', category: 'pix', subType: 'pix', dateStr: '2026-11-20', timeStr: '20:45:52', secondsOfDay: 20 * 3600 + 45 * 60 + 52, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
      { rowIndex: 3, numero: '003', modulo: 'BALCÃO', origem: 'BALCÃO', amountCents: 400, receivedCents: 400, recebidoEmBranco: false, changeCents: 0, formaPagto: 'PIX', administradora: 'PIX', category: 'pix', subType: 'pix', dateStr: '2026-11-20', timeStr: '22:16:07', secondsOfDay: 22 * 3600 + 16 * 60 + 7, operador: 'Op1', nomeMaquina: 'SERVIDOR' }
    ]
  };

  const rede20 = {
    fileType: 'adquirente_rede',
    fileName: 'Rede_20_11.xlsx',
    status: 'ok',
    periodStart: '2026-11-20',
    periodEnd: '2026-11-20',
    rows: [
      { rowIndex: 1, source: 'rede', isApproved: true, category: 'cartao', subType: 'debito', amountCents: 5000, feeCents: 50, netCents: 4950, dateStr: '2026-11-20', timeStr: '08:00:10', secondsOfDay: 8 * 3600 + 10 },
      { rowIndex: 2, source: 'rede', isApproved: true, category: 'pix', subType: 'pix', amountCents: 7755, feeCents: 0, netCents: 7755, dateStr: '2026-11-20', timeStr: '08:45:29', secondsOfDay: 8 * 3600 + 45 * 60 + 29 },
      { rowIndex: 3, source: 'rede', isApproved: true, category: 'pix', subType: 'pix', amountCents: 400, feeCents: 0, netCents: 400, dateStr: '2026-11-20', timeStr: '10:15:40', secondsOfDay: 10 * 3600 + 15 * 60 + 40 }
    ]
  };

  const ofx20 = {
    fileType: 'extrato_ofx',
    fileName: 'Extrato_C6Bank.ofx',
    status: 'ok',
    periodStart: '2026-11-20',
    periodEnd: '2026-11-20',
    rows: [
      { rowIndex: 1, source: 'ofx', trnType: 'CREDIT', isCredit: true, category: 'pix', subType: 'pix', amountCents: 14740, description: 'Pix qr code recebido de ANA CAROLINY', dateStr: '2026-11-20', timeStr: '04:42:10', secondsOfDay: 4 * 3600 + 42 * 60 + 10 },
      { rowIndex: 2, source: 'ofx', trnType: 'CREDIT', isCredit: true, category: 'pix', subType: 'pix', amountCents: 2100, description: 'LEONARDODEJES', dateStr: '2026-11-20', timeStr: '04:41:23', secondsOfDay: 4 * 3600 + 41 * 60 + 23 }
    ]
  };

  const res = runCashReconciliation({ parsedFiles: [pdv20, rede20, ofx20] });
  const pixRow = res.mirrorRows.find((r) => r.key === 'pix');
  assert.ok(pixRow);
  assert.equal(pixRow.systemCents, 8155);
  assert.equal(pixRow.realCents, 8155);
  assert.equal(pixRow.diffCents, 0);
  assert.equal(res.extraInBank.filter((r) => r.category === 'pix').length, 0);
  assert.equal(res.missingInBank.filter((s) => s.category === 'pix').length, 0);
  assert.equal(res.matchedPairs.filter((p) => (p.reasonText || '').includes('12h')).length, 2);
  assert.equal(res.outOfPeriodItems.length, 2);
});

test('runCashReconciliation attaches orderDetail to missingInBank items (e.g. MESA 050 split)', async () => {
  const pdv20 = await parseUploadedCashFile({
    fileName: 'PlanilhaRecebimento_20_11.xlsx',
    arrayBuffer: fs.readFileSync(`${UPLOAD_DIR}/media_1795399920235_e1d6e50f.xlsx`)
  });
  const sold20 = await parseUploadedCashFile({
    fileName: 'ItensVendidos_20_11.xlsx',
    arrayBuffer: fs.readFileSync(`${UPLOAD_DIR}/media_1795399840914_32008acd.xlsx`)
  });
  const summary20 = await parseUploadedCashFile({
    fileName: 'Fechamento_Resumo_20_11.txt',
    textContent: fs.readFileSync(`${UPLOAD_DIR}/media_1795399920234_cf61cab7.txt`, 'latin1')
  });

  // Sem extratos bancários, os lançamentos digitais caem em missingInBank — e devem preservar orderDetail!
  const res = runCashReconciliation({ parsedFiles: [pdv20, sold20, summary20] });
  const mesa50Missing = res.missingInBank.find(
    (s) => s.referenceCode === '050' && s.amountCents === 2500 && s.timeStr === '12:03:39'
  );
  assert.ok(mesa50Missing, 'MESA 050 • R$ 25,00 (12:03:39) deve estar em missingInBank');
  assert.ok(mesa50Missing.metadata?.orderDetail, 'missingInBank deve preservar orderDetail para Ver Itens');
  assert.equal(mesa50Missing.metadata.orderDetail.items.length, 1);
  assert.equal(mesa50Missing.metadata.orderDetail.items[0].product, 'BALDE ORIGINAL');
  assert.equal(mesa50Missing.metadata.orderDetail.itemsSubtotalCents, 5000);
  assert.equal(mesa50Missing.metadata.orderDetail.splitCount, 2);

  const reopened50 = res.auditInsights.reopenedTables.find((r) => r.table === '050');
  assert.equal(reopened50?.orderNumber, '277702');
  assert.equal(reopened50?.actionTitle, 'Mesa 050 reaberta após fechamento');
  assert.equal(reopened50?.eventTag, 'Recebimento excluído');
});

test('runCashReconciliation matches 08h-23h overnight bank delays D->D+1, widens Rede 12h matching and rejects D+1 false positives', () => {
  const pdv = {
    fileType: 'pdv_vendas',
    fileName: 'PlanilhaRecebimento_19_11.xlsx',
    status: 'ok',
    periodStart: '2026-11-19',
    periodEnd: '2026-11-19',
    rows: [
      { rowIndex: 1, numero: '001', modulo: 'CAIXA', origem: 'CAIXA', amountCents: 3000, receivedCents: 3000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: 'DINHEIRO', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-19', timeStr: '08:05:00', secondsOfDay: 8 * 3600 + 300, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
      { rowIndex: 2, numero: '004', modulo: 'DELIVERY', origem: 'DELIVERY 4', amountCents: 5400, receivedCents: 5400, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'DEBITO', category: 'cartao', subType: 'debito', dateStr: '2026-11-19', timeStr: '13:25:21', secondsOfDay: 13 * 3600 + 25 * 60 + 21, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
      { rowIndex: 3, numero: '020', modulo: 'MESA', origem: 'MESA 020', amountCents: 8500, receivedCents: 8500, recebidoEmBranco: false, changeCents: 0, formaPagto: 'PIX', administradora: 'PIX', category: 'pix', subType: 'pix', dateStr: '2026-11-19', timeStr: '22:45:00', secondsOfDay: 22 * 3600 + 45 * 60, operador: 'Op1', nomeMaquina: 'SERVIDOR' }
    ]
  };

  const rede = {
    fileType: 'adquirente_rede',
    fileName: 'Rede_19_a_20_11.xlsx',
    status: 'ok',
    periodStart: '2026-11-19',
    periodEnd: '2026-11-20',
    rows: [
      // 19/11 02:19:45 em formato 12h = 14:19:45 (54m após venda das 13:25:21 -> deve casar via Pass 3B!)
      { rowIndex: 1, source: 'rede', isApproved: true, category: 'cartao', subType: 'debito', amountCents: 5400, feeCents: 80, netCents: 5320, dateStr: '2026-11-19', timeStr: '02:19:45', secondsOfDay: 2 * 3600 + 19 * 60 + 45 },
      // 20/11 01:59..02:58 sem venda compatível à noite em 19/11 (transações 12h da tarde de 20/11) -> NÃO podem virar sobras!
      { rowIndex: 2, source: 'rede', isApproved: true, category: 'cartao', subType: 'debito', amountCents: 5700, feeCents: 85, netCents: 5615, dateStr: '2026-11-20', timeStr: '02:58:58', secondsOfDay: 2 * 3600 + 58 * 60 + 58 },
      { rowIndex: 3, source: 'rede', isApproved: true, category: 'cartao', subType: 'debito', amountCents: 6950, feeCents: 100, netCents: 6850, dateStr: '2026-11-20', timeStr: '01:59:47', secondsOfDay: 1 * 3600 + 59 * 60 + 47 }
    ]
  };

  const ofx = {
    fileType: 'extrato_ofx',
    fileName: 'Extrato_18_a_20_11.ofx',
    status: 'ok',
    periodStart: '2026-11-19',
    periodEnd: '2026-11-20',
    rows: [
      // Venda de 19/11 22:45 caiu com delay no banco em 20/11 02:00 -> deve conciliar automaticamente com 19/11!
      { rowIndex: 1, source: 'ofx', ofxClass: 'pix_cliente', category: 'pix', amountCents: 8500, dateStr: '2026-11-20', timeStr: '02:00:00', secondsOfDay: 2 * 3600, memo: 'PIX CLIENTE ATRASO BANCARIO' }
    ]
  };

  const c6p = {
    fileType: 'adquirente_c6pay',
    fileName: 'C6Pay_19_11.xlsx',
    status: 'ok',
    periodStart: '2026-11-19',
    periodEnd: '2026-11-19',
    rows: [
      // C6 Pay 19/11 03:10 antes da abertura às 08h pertence à virada de 18/11 -> deve ficar fora de 19/11
      { rowIndex: 1, source: 'c6pay', isApproved: true, category: 'cartao', subType: 'credito', amountCents: 12000, feeCents: 300, netCents: 11700, dateStr: '2026-11-19', timeStr: '03:10:00', secondsOfDay: 3 * 3600 + 600 }
    ]
  };

  const res = runCashReconciliation({
    parsedFiles: [pdv, rede, ofx, c6p],
    manualInputs: { cashCountedCents: 3000 }
  });

  assert.equal(res.matchedPairs.length, 2);
  assert.ok(res.matchedPairs.some((p) => (p.reasonText || '').includes('12h') && p.amountCents === 5400));
  assert.ok(res.matchedPairs.some((p) => (p.reasonText || '').includes('pós-expediente D+1') && p.amountCents === 8500));
  assert.equal(res.missingInBank.length, 0);
  assert.equal(res.extraInBank.length, 0, 'Nenhum falso positivo de D+1 ou pré-abertura deve sobrar em extraInBank');
  assert.equal(res.outOfPeriodItems.length, 3, 'Os 2 itens Rede 20/11 sem venda noturna e 1 item C6Pay 03:10 devem ficar fora do período');
  assert.equal(res.status, 'balanced');
});

test('runCashReconciliation recovers multi-day C6Pay evening D+1 accounting-date shift (R$ 34,65), catches small_diff (-R$ 1,00), applies drawer overrides (R$ 55,00), annotates reopened tables and reports channel breakdown', () => {
  const pdv20 = {
    fileType: 'pdv_vendas',
    fileName: 'PlanilhaRecebimento.xlsx',
    status: 'ok',
    periodStart: '2026-11-20',
    periodEnd: '2026-11-20',
    rows: [
      { rowIndex: 1, numero: '050', modulo: 'MESA', origem: 'MESA', amountCents: 2500, receivedCents: 2500, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'CREDITO', category: 'cartao', subType: 'credito', dateStr: '2026-11-20', timeStr: '12:03:39', secondsOfDay: 12 * 3600 + 219, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
      { rowIndex: 2, numero: '050', modulo: 'MESA', origem: 'MESA', amountCents: 2500, receivedCents: 2500, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'CREDITO', category: 'cartao', subType: 'credito', dateStr: '2026-11-20', timeStr: '12:03:43', secondsOfDay: 12 * 3600 + 223, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
      { rowIndex: 3, numero: '2', modulo: 'DELIVERY', origem: 'DELIVERY 2', amountCents: 9450, receivedCents: 9450, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'PIX', category: 'pix', subType: 'pix_pdv', dateStr: '2026-11-20', timeStr: '13:47:18', secondsOfDay: 13 * 3600 + 47 * 60 + 18, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
      { rowIndex: 4, numero: '001', modulo: 'MESA', origem: 'MESA', amountCents: 9949, receivedCents: 9949, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'PIX', category: 'pix', subType: 'pix_pdv', dateStr: '2026-11-20', timeStr: '14:21:29', secondsOfDay: 14 * 3600 + 21 * 60 + 29, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
      { rowIndex: 5, numero: '002', modulo: 'MESA', origem: 'MESA', amountCents: 3465, receivedCents: 3465, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'MASTERCARD CREDITO', category: 'cartao', subType: 'credito', dateStr: '2026-11-20', timeStr: '21:36:38', secondsOfDay: 21 * 3600 + 36 * 60 + 38, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
      { rowIndex: 6, numero: '010', modulo: 'MESA', origem: 'MESA', amountCents: 20830, receivedCents: 20830, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: 'DINHEIRO', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-20', timeStr: '19:35:45', secondsOfDay: 19 * 3600 + 35 * 60 + 45, operador: 'Op1', nomeMaquina: 'SERVIDOR' }
    ]
  };

  const relConf20 = {
    fileType: 'rel_conferencia',
    fileName: 'RelConferencia.xlsx',
    status: 'ok',
    periodStart: '20 Nov',
    periodEnd: '20 Nov',
    rows: [],
    summary: {
      cashBlock: {
        fundoManhaCents: 63080,
        vendaDinheiroCents: 20830,
        fundoNoiteCents: 0,
        outrasEntradasCents: 0,
        sangriaManhaCents: 0,
        sangriaNoiteCents: 0,
        saidasPagamentosCents: 2538,
        outrasSaidasCents: 0
      },
      systemRows: {
        saldo_dinheiro: 81372,
        cartao: 8465,
        pix: 19399,
        pendentes: 0
      },
      realRows: {}
    }
  };

  const summary20 = {
    fileType: 'fechamento_resumo_txt',
    fileName: 'CAIXA_CEGO.txt',
    status: 'ok',
    periodStart: '2026-11-20',
    periodEnd: '2026-11-20',
    rows: [],
    summary: {
      mesasTransferidas: [
        { table: '050', orderNumber: '277702', rawText: 'Mesa 050 reaberta | Recebimento excluido 2.0 | Codigo: 277702' }
      ]
    }
  };

  const c6MultiDay = {
    fileType: 'adquirente_c6pay',
    fileName: 'Relatorio-Vendas-C6Pay_Detalhado - 20 e 21.xlsx',
    status: 'ok',
    periodStart: '2026-11-20',
    periodEnd: '2026-11-21',
    summary: { isSingleDayVirada: false, distinctDatesCount: 2 },
    rows: [
      // MESA 002 vendida em 20/11 às 21:36:38 mas carimbada com data contábil 21/11 às 21:36:33 na C6 Pay
      { rowIndex: 1, source: 'c6pay', isApproved: true, category: 'cartao', subType: 'credito', amountCents: 3465, feeCents: 80, netCents: 3385, dateStr: '2026-11-21', timeStr: '21:36:33', secondsOfDay: 21 * 3600 + 36 * 60 + 33 },
      // Venda legítima do dia seguinte (21/11) que não existe em 20/11 -> deve continuar em outOfPeriodItems!
      { rowIndex: 2, source: 'c6pay', isApproved: true, category: 'cartao', subType: 'debito', amountCents: 9100, feeCents: 100, netCents: 9000, dateStr: '2026-11-21', timeStr: '14:16:31', secondsOfDay: 14 * 3600 + 16 * 60 + 31 }
    ]
  };

  const rede20 = {
    fileType: 'adquirente_rede',
    fileName: 'Rede_20_11.csv',
    status: 'ok',
    periodStart: '2026-11-20',
    periodEnd: '2026-11-20',
    rows: [
      { rowIndex: 1, source: 'rede', isApproved: true, category: 'pix', subType: 'pix', amountCents: 9949, feeCents: 0, netCents: 9949, dateStr: '2026-11-20', timeStr: '02:20:55', secondsOfDay: 2 * 3600 + 20 * 60 + 55 }
    ]
  };

  const ofx20 = {
    fileType: 'extrato_ofx',
    fileName: 'Extrato_C6Bank.ofx',
    status: 'ok',
    periodStart: '2026-11-20',
    periodEnd: '2026-11-20',
    summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6', acctLast4: '0726' },
    rows: [
      { source: 'ofx', ofxClass: 'pix_cliente', category: 'pix', amountCents: 9350, dateStr: '2026-11-20', timeStr: '13:35:42', secondsOfDay: 13 * 3600 + 35 * 60 + 42, memo: 'Pix recebido de Amanda Silva', bankKey: 'banco_336', bankLabel: 'Banco C6', acctLast4: '0726' }
    ]
  };

  const res = runCashReconciliation({
    parsedFiles: [pdv20, relConf20, summary20, c6MultiDay, rede20, ofx20],
    manualInputs: {
      cashCountedCents: 0,
      sangriaOverrideCents: 75030,
      outrasSaidasOverrideCents: 5500
    }
  });

  // 1. C6 Pay D+1 evening accounting-date shift (34,65 às 21:36:33) recuperado! 91,00 continua isolado!
  const cardRow = res.mirrorRows.find(r => r.key === 'cartao');
  assert.equal(cardRow.realCents, 3465);
  assert.ok(res.matchedPairs.some(p => p.amountCents === 3465 && /contábil D\+1/i.test(p.reasonText)));
  assert.equal(res.outOfPeriodItems.length, 1);
  assert.equal(res.outOfPeriodItems[0].amountCents, 9100);

  // 2. Override manual de Outras Saídas (R$ 55,00) reduz saldo esperado para 758,72 e pós-sangria para 8,42 (-8,42 dif)
  const cashRow = res.mirrorRows.find(r => r.key === 'saldo_dinheiro');
  assert.equal(res.cashDrawerSummary.outrasSaidasCents, 5500);
  assert.equal(res.cashDrawerSummary.expectedAfterSangriaCents, 842);
  assert.equal(cashRow.systemCents, 75872);
  assert.equal(cashRow.diffCents, -842);

  // 3. Sugestão small_diff para Delivery 94,50 vs OFX 93,50 (-R$ 1,00)
  const smallDiffSug = res.suggestions.find(s => s.reasonType === 'small_diff');
  assert.ok(smallDiffSug, 'Deve sugerir vínculo de pequena diferença entre 94,50 e 93,50');
  assert.equal(smallDiffSug.diffCents, -100);

  // Confirmar small_diff mantém Real = 9350 (preserva -R$ 1,00 no fechamento!) e remove de Faltam/Sobram
  const afterSmallDiff = runCashReconciliation({
    parsedFiles: [pdv20, relConf20, summary20, c6MultiDay, rede20, ofx20],
    manualInputs: { cashCountedCents: 0, sangriaOverrideCents: 75030, outrasSaidasOverrideCents: 5500 },
    manualResolutions: [{ action: 'confirm_suggestion', suggestionId: smallDiffSug.id }]
  });
  assert.equal(afterSmallDiff.mirrorRows.find(r => r.key === 'pix').realCents, 9350 + 9949);
  assert.equal(afterSmallDiff.extraInBank.length, 0);

  // 4. Faltas da Mesa 050 anotadas automaticamente com reabertura + duplicidade em 4s
  const missing50 = afterSmallDiff.missingInBank.filter(m => m.referenceCode === '050');
  assert.equal(missing50.length, 2);
  assert.ok(missing50[0].metadata.operationalAlerts.some(a => a.code === 'reopened_table'));
  assert.ok(missing50[0].metadata.operationalAlerts.some(a => a.code === 'rapid_duplicate'));

  // 5. Breakdown transparente de PIX e Cartões
  assert.equal(afterSmallDiff.financialMetrics.pixBreakdown.ofxCents, 9350);
  assert.equal(afterSmallDiff.financialMetrics.pixBreakdown.redePixCents, 9949);
  assert.equal(afterSmallDiff.financialMetrics.cardBreakdown.c6PayCardCents, 3465);

  // 6. Health score refletindo pendências/faltas abaixo de 90%
  assert.ok(res.healthScore < 90, `Esperava healthScore < 90 com falta + pendências, obteve ${res.healthScore}`);
});

test('runCashReconciliation applies itemized manualCashAdjustments (ex.: Bolo da Marcela) to drawer, mirror row, and saidasDetalhadas', () => {
  const relConf20 = {
    fileType: 'rel_conferencia',
    fileName: 'RelConferencia_20.xlsx',
    status: 'ok',
    periodStart: '2026-11-20',
    periodEnd: '2026-11-20',
    summary: {
      cashBlock: {
        fundoManhaCents: 63080,
        vendaDinheiroCents: 20830,
        fundoNoiteCents: 0,
        outrasEntradasCents: 0,
        sangriaManhaCents: 0,
        sangriaNoiteCents: 0,
        saidasPagamentosCents: 2538,
        outrasSaidasCents: 0
      },
      systemRows: {
        saldo_dinheiro: 81372,
        pix: 0,
        cartao: 0,
        ifood: 0,
        pendentes: 0
      },
      realRows: {}
    },
    rows: []
  };

  const res = runCashReconciliation({
    parsedFiles: [relConf20],
    manualInputs: {
      cashCountedCents: 0,
      sangriaOverrideCents: 75030,
      manualCashAdjustments: [
        { id: 'adj-1', direction: 'outflow', description: 'Bolo da Marcela', amountCents: 5500, operator: 'Gerência' },
        { id: 'adj-2', direction: 'inflow', description: 'Reforço de Troco', amountCents: 1000, operator: 'Caixa' },
        { id: 'adj-invalid', direction: 'outflow', description: 'Sem valor', amountCents: 0 }
      ]
    }
  });

  // Saldo esperado base era 813,72 - 55,00 (saída justificada) + 10,00 (entrada justificada) = 768,72
  // Pós-sangria = 768,72 - 750,30 = 18,42
  assert.equal(res.cashDrawerSummary.manualOutflowsCents, 5500);
  assert.equal(res.cashDrawerSummary.manualInflowsCents, 1000);
  assert.equal(res.cashDrawerSummary.outrasSaidasCents, 5500);
  assert.equal(res.cashDrawerSummary.outrasEntradasCents, 1000);
  assert.equal(res.cashDrawerSummary.manualCashAdjustments.length, 2);
  assert.equal(res.cashDrawerSummary.expectedAfterSangriaCents, 1842);
  assert.equal(res.cashDrawerSummary.adjustedCashExpectedCents, 1842);

  const cashRow = res.mirrorRows.find(r => r.key === 'saldo_dinheiro');
  assert.equal(cashRow.systemCents, 76872);
  assert.equal(cashRow.diffCents, -1842);

  const boloDetail = res.cashDrawerSummary.saidasDetalhadas.find(d => d.label.includes('Bolo da Marcela'));
  assert.ok(boloDetail, 'Deve incluir saída justificada em saidasDetalhadas');
  assert.equal(boloDetail.amountCents, 5500);
  assert.equal(boloDetail.isManualAdjustment, true);
  assert.equal(boloDetail.direction, 'outflow');
  assert.ok(
    !res.cashDrawerSummary.saidasDetalhadas.some(d => d.label.includes('Reforço de Troco')),
    'Entrada justificada não deve ser listada em saidasDetalhadas como saída negativa'
  );
});
