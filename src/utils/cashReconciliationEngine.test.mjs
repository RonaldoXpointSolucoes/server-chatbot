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
  assert.equal(multiOfx.warnings.some((w) => /múltiplos dias/i.test(w)), false);

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
  assert.equal(warningCodes.includes('multi_day_filtered'), false, 'Relatórios multi-dias com dados do dia não devem gerar alerta');
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

test('classifyTxtDrawerOutflows separa sangria intermediaria (R$ 100) da Sangria CX. RET sem subtrair em duplicidade', async () => {
  const { classifyTxtDrawerOutflows, runCashReconciliation } = await import('./cashReconciliationEngine.mjs');
  const { DEFAULT_FORMULA_CONFIG } = await import('./cashFormulaRules.mjs');
  assert.equal(typeof classifyTxtDrawerOutflows, 'function');

  // Caso 23/11: RelConferencia incluiu SANGRIA (R$ 100) dentro de Saídas Pagamentos (R$ 344,29 = 244,29 + 100,00)
  // enquanto TXT listou SANGRIA (R$ 100) e SANGRIA CX. RET (R$ 724,45) somando R$ 824,45.
  const nov23Outflows = classifyTxtDrawerOutflows({
    txtSum: {
      saidasPagamentosCents: 24429,
      sangriaCents: 82445,
      saidasDetalhadas: [
        { label: 'SANGRIA', amountCents: 10000, isSangria: true },
        { label: 'Baixa em Contas a Pagar Ref. 1938 - Pao', amountCents: 1980, isSangria: false },
        { label: 'Baixa em Contas a Pagar Ref. 1939 - Bebidas', amountCents: 125, isSangria: false },
        { label: 'Baixa em Contas a Pagar Ref. 1940 - Mercadinho', amountCents: 9386, isSangria: false },
        { label: 'Baixa em Contas a Pagar Ref. 1941 - Carnes', amountCents: 12938, isSangria: false },
        { label: 'SANGRIA CX. RET', amountCents: 72445, isSangria: true }
      ]
    },
    relCash: { saidasPagamentosCents: 34429 },
    summaryTxtFile: {
      summary: {
        controleRows: [
          { method: 'DINHEIRO', sistemaCents: 77526, informadoCents: 72445, diffCents: -5081 },
          { method: 'SANGRIA', sistemaCents: 10000, informadoCents: 10000, diffCents: 0 }
        ]
      }
    }
  });

  assert.equal(nov23Outflows.saidasPagamentosCents, 24429);
  assert.equal(nov23Outflows.sangriaIntermediariaCents, 10000);
  assert.equal(nov23Outflows.sangriaFechamentoCents, 72445);
  assert.equal(nov23Outflows.sangriaTotalTxtCents, 82445);
  assert.equal(nov23Outflows.relConfIncludesIntermediateSangria, true);
  assert.equal(nov23Outflows.caixaCegoDinheiro?.informadoCents, 72445);
  assert.equal(nov23Outflows.caixaCegoSangria?.sistemaCents, 10000);

  // Caso 20/11 (sem sangria intermediaria): não altera nada
  const nov20Outflows = classifyTxtDrawerOutflows({
    txtSum: {
      saidasPagamentosCents: 2538,
      sangriaCents: 75030,
      saidasDetalhadas: [
        { label: 'Baixa em Contas a Pagar Ref. 1920', amountCents: 2538, isSangria: false },
        { label: 'SANGRIA CX. RET', amountCents: 75030, isSangria: true }
      ]
    },
    relCash: { saidasPagamentosCents: 2538 }
  });
  assert.equal(nov20Outflows.saidasPagamentosCents, 2538);
  assert.equal(nov20Outflows.sangriaIntermediariaCents, 0);
  assert.equal(nov20Outflows.sangriaFechamentoCents, 75030);
  assert.equal(nov20Outflows.relConfIncludesIntermediateSangria, false);

  // Integração E2E 23/11: saldo em dinheiro real deve refletir 724,45 (-50,81) em vez de 824,45 (+49,19) e pendentes recebem devedor
  const result23 = runCashReconciliation({
    parsedFiles: [
      {
        fileType: 'pdv_vendas',
        status: 'ok',
        periodStart: '2026-11-23',
        periodEnd: '2026-11-23',
        rows: [
          { dateStr: '2026-11-23', timeStr: '12:00:00', category: 'dinheiro', paymentMethodRaw: 'DINHEIRO', amountCents: 42230, tableOrOrder: '001' },
          { dateStr: '2026-11-23', timeStr: '13:50:59', category: 'pendente', paymentMethodRaw: 'NOTA PENDENTE', amountCents: 18900, tableOrOrder: '007' },
          { dateStr: '2026-11-23', timeStr: '21:58:21', category: 'pendente', paymentMethodRaw: 'NOTA PENDENTE', amountCents: 450, tableOrOrder: '071' },
          { dateStr: '2026-11-23', timeStr: '22:01:00', category: 'pendente', paymentMethodRaw: 'NOTA PENDENTE', amountCents: 450, tableOrOrder: '068' }
        ],
        summary: {}
      },
      {
        fileType: 'rel_conferencia',
        status: 'ok',
        summary: {
          cashBlock: {
            fundoManhaCents: 69725,
            vendaDinheiroCents: 42230,
            fundoNoiteCents: 0,
            outrasEntradasCents: 0,
            sangriaManhaCents: 0,
            sangriaNoiteCents: 0,
            saidasPagamentosCents: 34429,
            outrasSaidasCents: 0
          },
          systemRows: { saldo_dinheiro: 77526, pendentes: 19800, pix: 0, cartao: 0 },
          realRows: {}
        }
      },
      {
        fileType: 'fechamento_txt',
        status: 'ok',
        summary: {
          referenceDate: '2026-11-23',
          fundoCaixaCents: 69725,
          saidasPagamentosCents: 24429,
          sangriaCents: 82445,
          saidasDetalhadas: [
            { label: 'SANGRIA', amountCents: 10000, isSangria: true },
            { label: 'Baixa em Contas a Pagar Ref. 1938 - Pao', amountCents: 1980, isSangria: false },
            { label: 'Baixa em Contas a Pagar Ref. 1939 - Bebidas', amountCents: 125, isSangria: false },
            { label: 'Baixa em Contas a Pagar Ref. 1940 - Mercadinho', amountCents: 9386, isSangria: false },
            { label: 'Baixa em Contas a Pagar Ref. 1941 - Carnes', amountCents: 12938, isSangria: false },
            { label: 'SANGRIA CX. RET', amountCents: 72445, isSangria: true }
          ],
          pendingDebtors: [
            { debtor: 'CLEITON FERREIRA (', amountCents: 18900 },
            { debtor: 'ALESSANDRO BURGUER', amountCents: 450 },
            { debtor: 'RONALDO BURGUERPLUS', amountCents: 450 }
          ]
        }
      },
      {
        fileType: 'fechamento_resumo_txt',
        status: 'ok',
        summary: {
          controleRows: [
            { method: 'DINHEIRO', sistemaCents: 77526, informadoCents: 72445, diffCents: -5081 },
            { method: 'SANGRIA', sistemaCents: 10000, informadoCents: 10000, diffCents: 0 }
          ]
        }
      }
    ],
    manualInputs: { cashCountedCents: 0 },
    formulaConfig: DEFAULT_FORMULA_CONFIG
  });

  const cashRow = result23.mirrorRows.find((r) => r.key === 'saldo_dinheiro');
  assert.equal(cashRow.systemCents, 77526);
  assert.equal(cashRow.realCents, 72445);
  assert.equal(cashRow.diffCents, -5081);

  assert.equal(result23.cashDrawerSummary.saidasPagamentosCents, 24429);
  assert.equal(result23.cashDrawerSummary.sangriaIntermediariaCents, 10000);
  assert.equal(result23.cashDrawerSummary.sangriaCents, 72445);
  assert.equal(result23.cashDrawerSummary.sangriaTotalTxtCents, 82445);
  assert.equal(result23.cashDrawerSummary.expectedTotalCents, 77526);
  assert.equal(result23.cashDrawerSummary.expectedAfterSangriaCents, 5081);

  const p189 = result23.systemItems.find((i) => i.category === 'pendente' && i.amountCents === 18900);
  const p450 = result23.systemItems.find((i) => i.category === 'pendente' && i.amountCents === 450);
  assert.equal(p189.metadata.debtorName, 'CLEITON FERREIRA (');
  assert.deepEqual(p450.metadata.debtorCandidates, ['ALESSANDRO BURGUER', 'RONALDO BURGUERPLUS']);
});

test('runCashReconciliation nunca inclui NOTA PENDENTE (fiado) em sugestões agrupadas N:1 ou trocas swapped_method', () => {
  const parsedFiles = [
    {
      fileType: 'pdv_vendas',
      status: 'ok',
      periodStart: '2026-11-26',
      periodEnd: '2026-11-26',
      rows: [
        // Reproduz exatamente o print: MESA 015 DEBITO (7,00) + MESA 030 NOTA PENDENTE (38,00) vs C6 Pay (45,00)
        { rowIndex: 1, numero: '015', modulo: 'MESA', origem: 'MESA', amountCents: 700, receivedCents: 700, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'DEBITO', category: 'cartao', subType: 'debito', dateStr: '2026-11-26', timeStr: '13:38:00', secondsOfDay: 13 * 3600 + 38 * 60, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
        { rowIndex: 2, numero: '030', modulo: 'MESA', origem: 'MESA', amountCents: 3800, receivedCents: 3800, recebidoEmBranco: false, changeCents: 0, formaPagto: 'NOTA PENDENTE', administradora: 'NOTA PENDENTE', category: 'pendente', subType: 'nota_pendente', dateStr: '2026-11-26', timeStr: '13:33:33', secondsOfDay: 13 * 3600 + 33 * 60 + 33, operador: 'Op1', nomeMaquina: 'SERVIDOR' },
        // Reproduz falso swapped_method 1:1 (25/11): MESA 075 NOTA PENDENTE (13,00) vs C6 Pay DEBITO (13,00)
        { rowIndex: 3, numero: '075', modulo: 'MESA', origem: 'MESA', amountCents: 1300, receivedCents: 1300, recebidoEmBranco: false, changeCents: 0, formaPagto: 'NOTA PENDENTE', administradora: 'NOTA PENDENTE', category: 'pendente', subType: 'nota_pendente', dateStr: '2026-11-26', timeStr: '22:07:38', secondsOfDay: 22 * 3600 + 7 * 60 + 38, operador: 'Op1', nomeMaquina: 'SERVIDOR' }
      ]
    },
    {
      fileType: 'adquirente_c6pay',
      status: 'ok',
      periodStart: '2026-11-26',
      periodEnd: '2026-11-26',
      rows: [
        { rowIndex: 1, source: 'c6pay', isApproved: true, category: 'cartao', subType: 'debito', description: 'C6 Pay DEBITO VISA', amountCents: 4500, feeCents: 0, netCents: 4500, dateStr: '2026-11-26', timeStr: '13:37:07', secondsOfDay: 13 * 3600 + 37 * 60 + 7 },
        { rowIndex: 2, source: 'c6pay', isApproved: true, category: 'cartao', subType: 'debito', description: 'C6 Pay DEBITO MASTERCARD', amountCents: 1300, feeCents: 0, netCents: 1300, dateStr: '2026-11-26', timeStr: '21:05:30', secondsOfDay: 21 * 3600 + 5 * 60 + 30 }
      ]
    }
  ];

  const res = runCashReconciliation({ parsedFiles, formulaConfig: DEFAULT_FORMULA_CONFIG });

  const anyPendenteInSuggestions = res.suggestions.some((s) =>
    (s.systemItems || []).some((it) => it.category === 'pendente')
  );
  assert.equal(anyPendenteInSuggestions, false);
  assert.equal(res.suggestions.some((s) => s.reasonType === 'grouped_n_to_1' && s.amountCents === 4500), false);
  assert.equal(res.suggestions.some((s) => s.reasonType === 'swapped_method' && s.amountCents === 1300), false);

  // Pendentes continuam contabilizados no espelho e nunca vão para Faltas digitais
  assert.equal(res.mirrorRows.find((r) => r.key === 'pendentes')?.systemCents, 5100);
  assert.equal(res.missingInBank.some((m) => m.category === 'pendente'), false);

  // Caso raro de erro operacional: se o usuário mover manualmente o pendente para Cartão, ele passa a conciliar normalmente
  const pend13 = res.systemItems.find((s) => s.category === 'pendente' && s.amountCents === 1300);
  const reclassified = runCashReconciliation({
    parsedFiles,
    formulaConfig: DEFAULT_FORMULA_CONFIG,
    manualResolutions: [{ action: 'reclassify_system', systemIds: [pend13.id], targetCategory: 'cartao' }]
  });
  assert.equal(reclassified.matchedPairs.some((m) => m.amountCents === 1300), true);
  assert.equal(reclassified.mirrorRows.find((r) => r.key === 'pendentes')?.systemCents, 3800);
});

test('runCashReconciliation isola final.txt de outra data (24/11 R$ 423,28) no caixa de 25/11 (R$ 336,38), preserva Dinheiro do Caixa Cego (R$ 330,10) e valida divergências cruzadas', () => {
  // Cenário real de 25/11/2026 onde final.txt de 24/11/2026 foi anexado por engano
  const result25 = runCashReconciliation({
    parsedFiles: [
      {
        fileType: 'pdv_vendas',
        fileName: 'PlanilhaRecebimento.xlsx',
        status: 'ok',
        periodStart: '2026-11-25',
        periodEnd: '2026-11-25',
        rows: [
          { rowIndex: 1, numero: '001', modulo: 'MESA', origem: 'MESA', amountCents: 1700, receivedCents: 1700, formaPagto: 'NOTA PENDENTE', administradora: 'NOTA PENDENTE', category: 'pendente', subType: 'nota_pendente', dateStr: '2026-11-25', timeStr: '11:33:08', secondsOfDay: 41588 },
          { rowIndex: 2, numero: '007', modulo: 'MESA', origem: 'MESA', amountCents: 31938, receivedCents: 31938, formaPagto: 'NOTA PENDENTE', administradora: 'NOTA PENDENTE', category: 'pendente', subType: 'nota_pendente', dateStr: '2026-11-25', timeStr: '14:05:45', secondsOfDay: 50745 },
          { rowIndex: 3, numero: '010', modulo: 'MESA', origem: 'MESA', amountCents: 22807, receivedCents: 22807, formaPagto: 'DINHEIRO', administradora: 'DINHEIRO', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-25', timeStr: '15:00:00', secondsOfDay: 54000 }
        ],
        summary: {}
      },
      {
        fileType: 'rel_conferencia',
        fileName: 'RelConferencia.xlsx',
        status: 'ok',
        periodStart: '25 Nov',
        periodEnd: '25 Nov',
        summary: {
          headerLabel: '25 Nov',
          parsedCategoryCount: 10,
          cashBlock: {
            fundoManhaCents: 21585,
            vendaDinheiroCents: 22807,
            fundoNoiteCents: 0,
            outrasEntradasCents: 10000,
            sangriaManhaCents: 0,
            sangriaNoiteCents: 0,
            saidasPagamentosCents: 11673,
            outrasSaidasCents: 0
          },
          systemRows: {
            saldo_dinheiro: 42719,
            cartao: 329010,
            pix: 125552,
            pendentes: 33638,
            ifood: 0,
            ticket: 0,
            pago_online: 0,
            sem_bandeira: 0,
            outros: 0
          },
          realRows: {}
        }
      },
      {
        fileType: 'fechamento_resumo_txt',
        fileName: 'CAIXA_CEGO_25-11-2026_230638000.txt',
        status: 'ok',
        periodStart: '2026-11-25',
        periodEnd: '2026-11-25',
        summary: {
          storeName: 'BURGUER PLUS',
          operatorName: 'MARCELA',
          pendentesCents: 33638,
          descontosCents: 7566,
          consumoInternoCents: 39200,
          pagamentoFornecedoresCents: 11673,
          controleRows: [
            { method: 'DINHEIRO', sistemaCents: 42719, informadoCents: 33010, diffCents: -9709 },
            { method: 'PENDENTE', sistemaCents: 33638, informadoCents: 33638, diffCents: 0 }
          ]
        }
      },
      {
        fileType: 'fechamento_txt',
        fileName: 'final.txt',
        status: 'ok',
        periodStart: '2026-11-24',
        periodEnd: '2026-11-24',
        summary: {
          startDate: '2026-11-24',
          endDate: '2026-11-24',
          operatorName: 'RONALDO',
          fundoCaixaCents: 72445,
          saidasPagamentosCents: 16662,
          sangriaCents: 66585,
          notaPendenteCents: 42328,
          pendingDebtors: [
            { debtor: 'ALESSANDRO BURGUER', amountCents: 200 },
            { debtor: 'CLEITON FERREIRA (', amountCents: 27200 },
            { debtor: 'DAVID BURGUERPLUS', amountCents: 1290 },
            { debtor: 'JULIA GERENTE BURGU', amountCents: 800 },
            { debtor: 'KARINA BURGUER', amountCents: 1500 },
            { debtor: 'KARYN BURGUER', amountCents: 4900 },
            { debtor: 'MARCIO (AMIGO DO JO', amountCents: 4790 },
            { debtor: 'RONALDO BURGUERPLUS', amountCents: 1648 }
          ],
          saidasDetalhadas: [
            { label: 'SANGRIA', amountCents: 45000, isSangria: true },
            { label: 'SANGRIA CX. RET', amountCents: 21585, isSangria: true }
          ]
        }
      }
    ],
    manualInputs: { cashCountedCents: 0, categoryRealOverrides: { pendentes: 33638 } },
    formulaConfig: DEFAULT_FORMULA_CONFIG
  });

  assert.equal(result25.referenceDate, '2026-11-25');
  assert.equal(result25.operatorName, 'MARCELA');
  assert.equal(result25.financialMetrics.pendingDebtors.length, 0);
  assert.equal(result25.periodDiagnostics.quarantinedSystemFiles?.length, 1);
  assert.equal(result25.periodDiagnostics.quarantinedSystemFiles[0].fileName, 'final.txt');
  assert.equal(result25.periodDiagnostics.quarantinedSystemFiles[0].pendingCents, 42328);

  const wrongSysWarn = result25.periodDiagnostics.validationWarnings.find((w) => w.code === 'wrong_day_system_file');
  assert.ok(wrongSysWarn);
  assert.equal(wrongSysWarn.severity, 'error');
  assert.match(wrongSysWarn.message, /24\/11\/2026/);
  assert.match(wrongSysWarn.message, /423,28/);

  // Dinheiro deve usar os R$ 330,10 do CAIXA_CEGO de 25/11 em vez dos R$ 215,85 do final.txt de 24/11
  const cashRow = result25.mirrorRows.find((r) => r.key === 'saldo_dinheiro');
  assert.equal(cashRow.systemCents, 42719);
  assert.equal(cashRow.realCents, 33010);
  assert.equal(cashRow.diffCents, -9709);

  // Caso um TXT do MESMO dia tenha soma de devedores pendentes divergente do PDV, deve alertar pending_totals_mismatch
  const sameDayMismatch = runCashReconciliation({
    parsedFiles: [
      {
        fileType: 'pdv_vendas',
        fileName: 'PlanilhaRecebimento.xlsx',
        status: 'ok',
        periodStart: '2026-11-25',
        periodEnd: '2026-11-25',
        rows: [
          { rowIndex: 1, numero: '001', modulo: 'MESA', origem: 'MESA', amountCents: 33638, receivedCents: 33638, formaPagto: 'NOTA PENDENTE', administradora: 'NOTA PENDENTE', category: 'pendente', subType: 'nota_pendente', dateStr: '2026-11-25', timeStr: '11:33:08', secondsOfDay: 41588 }
        ],
        summary: {}
      },
      {
        fileType: 'fechamento_txt',
        fileName: 'final_25.txt',
        status: 'ok',
        periodStart: '2026-11-25',
        periodEnd: '2026-11-25',
        summary: {
          startDate: '2026-11-25',
          endDate: '2026-11-25',
          notaPendenteCents: 42328,
          pendingDebtors: [{ debtor: 'CLIENTE TESTE', amountCents: 42328 }]
        }
      }
    ],
    formulaConfig: DEFAULT_FORMULA_CONFIG
  });
  const pendWarn = sameDayMismatch.periodDiagnostics.validationWarnings.find((w) => w.code === 'pending_totals_mismatch');
  assert.ok(pendWarn);
  assert.equal(pendWarn.severity, 'error');
});

test('runCashReconciliation silently normalizes multi-day PDV/acquirer/OFX exports (days 01..10) to day 05 and preserves timestamp-less C6Pay/OFX rows', () => {
  const multiDayPdv = {
    fileType: 'pdv_vendas',
    fileName: 'PlanilhaRecebimento_01_a_10.xlsx',
    status: 'ok',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-10',
    rows: [
      { rowIndex: 1, numero: '100', modulo: 'MESA', origem: 'MESA', amountCents: 9900, receivedCents: 9900, formaPagto: 'CARTAO', administradora: 'CREDITO', category: 'cartao', subType: 'credito', dateStr: '2026-11-01', timeStr: '12:00:00', secondsOfDay: 43200 },
      { rowIndex: 2, numero: '105', modulo: 'MESA', origem: 'MESA', amountCents: 8500, receivedCents: 8500, formaPagto: 'CARTAO', administradora: 'CREDITO', category: 'cartao', subType: 'credito', dateStr: '2026-11-05', timeStr: '12:30:00', secondsOfDay: 45000 },
      { rowIndex: 3, numero: '106', modulo: 'DELIVERY', origem: 'DELIVERY', amountCents: 4500, receivedCents: 4500, formaPagto: 'PIX', administradora: 'PIX', category: 'pix', subType: 'pix', dateStr: '2026-11-05', timeStr: '13:00:00', secondsOfDay: 46800 },
      { rowIndex: 4, numero: '110', modulo: 'MESA', origem: 'MESA', amountCents: 7700, receivedCents: 7700, formaPagto: 'PIX', administradora: 'PIX', category: 'pix', subType: 'pix', dateStr: '2026-11-10', timeStr: '19:00:00', secondsOfDay: 68400 }
    ]
  };
  const relConf05 = {
    fileType: 'rel_conferencia',
    fileName: 'RelConferencia_05_11.xlsx',
    status: 'ok',
    periodStart: '05/11/2026',
    periodEnd: '05/11/2026',
    summary: {
      headerLabel: '05/11/2026',
      parsedCategoryCount: 2,
      cashBlock: {},
      systemRows: { cartao: 8500, pix: 4500 },
      realRows: {}
    }
  };
  // Simula C6Pay Resumido e OFX sem granularidade de horário (timeStr vazio ou 00:00:00 em todo arquivo)
  const c6ResumidoRange = {
    fileType: 'adquirente_c6pay',
    fileName: 'Relatorio-Vendas-C6Pay_Resumido.xlsx',
    status: 'ok',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-10',
    rows: [
      { rowIndex: 1, source: 'c6pay', isApproved: true, category: 'cartao', subType: 'credito', amountCents: 9900, netCents: 9700, feeCents: 200, dateStr: '2026-11-01', timeStr: '', secondsOfDay: 0, hasTime: false },
      { rowIndex: 2, source: 'c6pay', isApproved: true, category: 'cartao', subType: 'credito', amountCents: 8500, netCents: 8300, feeCents: 200, dateStr: '2026-11-05', timeStr: '00:00:00', secondsOfDay: 0, hasTime: true },
      { rowIndex: 3, source: 'c6pay', isApproved: true, category: 'cartao', subType: 'debito', amountCents: 3000, netCents: 2950, feeCents: 50, dateStr: '2026-11-10', timeStr: '00:00:00', secondsOfDay: 0, hasTime: true }
    ]
  };
  const ofxRangeNoTime = {
    fileType: 'extrato_ofx',
    fileName: 'Extrato_01_a_10.ofx',
    status: 'ok',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-10',
    rows: [
      { source: 'ofx', ofxClass: 'pix_cliente', category: 'pix', amountCents: 4500, dateStr: '2026-11-05', timeStr: '00:00:00', secondsOfDay: 0, hasTime: false },
      { source: 'ofx', ofxClass: 'pix_cliente', category: 'pix', amountCents: 7700, dateStr: '2026-11-10', timeStr: '00:00:00', secondsOfDay: 0, hasTime: false }
    ]
  };

  const res = runCashReconciliation({
    parsedFiles: [multiDayPdv, relConf05, c6ResumidoRange, ofxRangeNoTime],
    formulaConfig: DEFAULT_FORMULA_CONFIG
  });

  assert.equal(res.referenceDate, '2026-11-05');
  assert.equal(res.systemTotalCents, 13000, 'PDV multi-dias deve ser normalizado apenas para a competência 05/11 (8500 + 4500)');
  assert.equal(res.realTotalCents, 13000, 'C6Pay Resumido e OFX sem horário intra-dia de 05/11 NÃO devem ser descartados por preOpeningCutoffSec');
  assert.equal(res.diffTotalCents, 0);
  const codes = res.periodDiagnostics.validationWarnings.map((w) => w.code);
  assert.equal(codes.includes('multi_day_filtered'), false);
  assert.equal(codes.includes('wrong_day_real_file'), false);
  assert.equal(codes.includes('wrong_day_system_file'), false);

  // Arquivo realmente sem nenhum dado do dia 05/11 deve continuar avisando
  const emptyDayRede = {
    fileType: 'adquirente_rede',
    fileName: 'Rede_01_a_03.xlsx',
    status: 'ok',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-03',
    rows: [
      { rowIndex: 1, source: 'rede', isApproved: true, category: 'cartao', subType: 'credito', amountCents: 5000, netCents: 4900, dateStr: '2026-11-02', timeStr: '12:00:00', secondsOfDay: 43200 }
    ]
  };
  const resMissingDay = runCashReconciliation({
    parsedFiles: [multiDayPdv, relConf05, c6ResumidoRange, ofxRangeNoTime, emptyDayRede],
    formulaConfig: DEFAULT_FORMULA_CONFIG
  });
  assert.ok(
    resMissingDay.periodDiagnostics.validationWarnings.some((w) => w.code === 'wrong_day_real_file' && w.fileName !== '' && w.message.includes('Rede_01_a_03.xlsx')),
    'Arquivo sem nenhum lançamento do dia de competência deve gerar alerta wrong_day_real_file'
  );
});

test('auditoria de rotina esperada alerta falta de relatório salvo (2 C6 + 1 Rede), arquivo com R$ 0,00 na data e C6Pay Resumido', () => {
  const routineProfile = {
    version: 1,
    updatedAt: '2026-11-26T16:00:00Z',
    banks: {
      banco_336: {
        bankKey: 'banco_336',
        bankCode: '336',
        bankLabel: 'Banco C6',
        acctLast4: '0726',
        seenCount: 5,
        lastSeenDate: '2026-11-25',
        enabled: true
      }
    },
    reports: {
      adquirente_rede: { fileType: 'adquirente_rede', seenCount: 5, lastSeenDate: '2026-11-25', enabled: true },
      adquirente_c6pay: { fileType: 'adquirente_c6pay', seenCount: 4, lastSeenDate: '2026-11-25', enabled: true }
    }
  };

  const pdvFile = {
    fileType: 'pdv_vendas',
    fileName: 'PlanilhaRecebimento.xlsx',
    status: 'ok',
    periodStart: '2026-11-24',
    periodEnd: '2026-11-24',
    rows: [
      { category: 'cartao', methodRaw: 'CREDITO', dateStr: '2026-11-24', timeStr: '11:00:00', secondsOfDay: 39600, amountCents: 10000 },
      { category: 'cartao', methodRaw: 'DEBITO', dateStr: '2026-11-24', timeStr: '12:00:00', secondsOfDay: 43200, amountCents: 97519 },
      { category: 'pix', methodRaw: 'PIX', dateStr: '2026-11-24', timeStr: '13:00:00', secondsOfDay: 46800, amountCents: 5000 }
    ]
  };
  const ofxC6 = {
    fileType: 'extrato_ofx',
    fileName: 'Extrato_C6_24.ofx',
    status: 'ok',
    periodStart: '2026-11-24',
    periodEnd: '2026-11-24',
    summary: { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6', acctLast4: '0726' },
    rows: [
      { source: 'ofx', ofxClass: 'pix_cliente', category: 'pix', bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6', acctLast4: '0726', dateStr: '2026-11-24', timeStr: '13:00:00', secondsOfDay: 46800, amountCents: 5000, hasTime: true }
    ]
  };
  const redeFile = {
    fileType: 'adquirente_rede',
    fileName: 'Rede_24.csv',
    status: 'ok',
    periodStart: '2026-11-24',
    periodEnd: '2026-11-24',
    rows: [
      { rowIndex: 1, source: 'rede', isApproved: true, category: 'cartao', subType: 'credito', amountCents: 10000, netCents: 9700, dateStr: '2026-11-24', timeStr: '11:00:00', secondsOfDay: 39600 }
    ]
  };

  // Cenário 1: Mandou Rede + Banco C6, mas faltou Maquininha C6 Pay esperada na rotina
  const missingC6pRes = runCashReconciliation({
    parsedFiles: [pdvFile, ofxC6, redeFile],
    formulaConfig: DEFAULT_FORMULA_CONFIG,
    companyRoutineProfile: routineProfile
  });
  const missingC6pWarn = missingC6pRes.periodDiagnostics.validationWarnings.find((w) => w.code === 'missing_routine_report');
  assert.ok(missingC6pWarn, 'Deve alertar quando C6 Pay salva na rotina não for enviada mesmo tendo Rede');
  assert.match(missingC6pWarn.title + ' ' + missingC6pWarn.message, /C6 Pay/i);
  assert.equal(missingC6pWarn.severity, 'error');

  // Cenário 2: Arquivo C6 Pay enviado no dia mas sem NENHUM valor válido aprovado (R$ 0,00 em 24/11)
  const zeroC6PayFile = {
    fileType: 'adquirente_c6pay',
    fileName: 'C6Pay_Negadas.xlsx',
    status: 'ok',
    periodStart: '2026-11-24',
    periodEnd: '2026-11-24',
    rows: [
      { rowIndex: 1, source: 'c6pay', isApproved: false, statusRaw: 'Negada', category: 'cartao', subType: 'credito', amountCents: 97519, netCents: 0, dateStr: '2026-11-24', timeStr: '12:00:00', secondsOfDay: 43200, hasTime: true }
    ]
  };
  const zeroRes = runCashReconciliation({
    parsedFiles: [pdvFile, ofxC6, redeFile, zeroC6PayFile],
    formulaConfig: DEFAULT_FORMULA_CONFIG,
    companyRoutineProfile: routineProfile
  });
  const zeroWarn = zeroRes.periodDiagnostics.validationWarnings.find((w) => w.code === 'zero_value_date_file');
  assert.ok(zeroWarn, 'Arquivo com linhas na data porém R$ 0,00 em vendas aprovadas/recebimentos deve emitir zero_value_date_file');
  assert.equal(zeroWarn.severity, 'error');
  assert.match(zeroWarn.message, /C6Pay_Negadas\.xlsx/);

  // Cenário 3: Mandou C6Pay_Resumido agrupado com R$ 975,19 em cartões e R$ 182,50 de PIX agrupado (já coberto pelo OFX)
  const resumidoC6PayFile = {
    fileType: 'adquirente_c6pay',
    fileName: 'Relatorio-Vendas-C6Pay_Resumido.xlsx',
    status: 'ok',
    periodStart: '2026-11-24',
    periodEnd: '2026-11-24',
    summary: { isSummaryReport: true },
    rows: [
      { rowIndex: 1, source: 'c6pay', isApproved: true, category: 'cartao', subType: 'debito', amountCents: 97519, netCents: 96000, dateStr: '2026-11-24', timeStr: '', secondsOfDay: 0, hasTime: false },
      { rowIndex: 2, source: 'c6pay', isApproved: true, category: 'pix', subType: 'pix', amountCents: 18250, netCents: 18250, dateStr: '2026-11-24', timeStr: '', secondsOfDay: 0, hasTime: false }
    ]
  };
  const resumidoRes = runCashReconciliation({
    parsedFiles: [pdvFile, ofxC6, redeFile, resumidoC6PayFile],
    formulaConfig: DEFAULT_FORMULA_CONFIG,
    companyRoutineProfile: routineProfile
  });
  const cartaoRow = resumidoRes.mirrorRows.find((r) => r.key === 'cartao');
  const pixRow = resumidoRes.mirrorRows.find((r) => r.key === 'pix');
  assert.equal(cartaoRow.realCents, 107519, 'Cartões devem somar Rede + C6Pay Resumido');
  assert.equal(pixRow.realCents, 5000, 'PIX agrupado do C6Pay Resumido não deve duplicar sobre o extrato OFX presente');
  assert.ok(
    resumidoRes.periodDiagnostics.validationWarnings.some((w) => w.code === 'summary_acquirer_file'),
    'C6Pay Resumido deve alertar operador para enviar o modelo Detalhado'
  );
});

test('runCashReconciliation detects Delivery Dinheiro orders matching drawer shortage and applies Dinheiro -> Pendente reclassification', () => {
  const pdvFile = {
    fileType: 'pdv_vendas',
    status: 'ok',
    periodStart: '2026-11-25',
    periodEnd: '2026-11-25',
    rows: [
      { rowIndex: 1, numero: '42', modulo: 'DELIVERY', origem: 'DELIVERY', amountCents: 9709, receivedCents: 9709, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: '', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-25', timeStr: '20:15:00', secondsOfDay: 72900, operador: 'MARCELA', nomeMaquina: 'CAIXA' },
      { rowIndex: 2, numero: '10', modulo: 'MESA', origem: 'MESA', amountCents: 5000, receivedCents: 5000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: '', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-25', timeStr: '19:10:00', secondsOfDay: 69000, operador: 'MARCELA', nomeMaquina: 'CAIXA' },
      { rowIndex: 3, numero: '15', modulo: 'DELIVERY', origem: 'DELIVERY', amountCents: 33638, receivedCents: 33638, recebidoEmBranco: false, changeCents: 0, formaPagto: 'NOTA PENDENTE', administradora: '', category: 'pendente', subType: 'pendente', dateStr: '2026-11-25', timeStr: '21:00:00', secondsOfDay: 75600, operador: 'MARCELA', nomeMaquina: 'CAIXA' }
    ]
  };
  const relConf = {
    fileType: 'rel_conferencia',
    status: 'ok',
    periodStart: '2026-11-25',
    periodEnd: '2026-11-25',
    summary: {
      systemRows: {
        saldo_dinheiro: 42719,
        cartao: 0,
        pendentes: 33638,
        pix: 0
      },
      realRows: {
        saldo_dinheiro: 33010
      },
      cashBlock: {
        fundoManhaCents: 28010,
        vendaDinheiroCents: 14709,
        saidasPagamentosCents: 0,
        sangriaManhaCents: 0,
        sangriaNoiteCents: 0,
        outrasSaidasCents: 0,
        outrasEntradasCents: 0,
        fundoNoiteCents: 0
      }
    }
  };

  // Falta física na gaveta: 330,10 - 427,19 = -97,09 (-9709 cents), idêntica ao Delivery #42 em Dinheiro
  const before = runCashReconciliation({
    parsedFiles: [pdvFile, relConf],
    formulaConfig: DEFAULT_FORMULA_CONFIG,
    manualInputs: {
      cashCountedCents: 33010,
      cashDrawerZeroConfirmed: false,
      categoryRealOverrides: { pendentes: 33638 },
      pendentesAutoSynced: true
    }
  });

  const deliveryItem = before.systemItems.find((s) => s.referenceCode === '42');
  assert.ok(deliveryItem);

  const cashToPending = before.suggestions.find((s) => s.reasonType === 'cash_to_pending');
  assert.ok(cashToPending, 'Deve sugerir pedido Delivery em Dinheiro como provável Nota Pendente quando bate com falta na gaveta');
  assert.equal(cashToPending.suggestedTargetCategory, 'pendente');
  assert.equal(cashToPending.similarityPct, 100);
  assert.deepEqual(cashToPending.systemIds, [deliveryItem.id]);

  // Ao reclassificar o pedido #42 de dinheiro -> pendente, a falta no dinheiro zera (-97,09 -> 0) e pendentes sobe +97,09
  const after = runCashReconciliation({
    parsedFiles: [pdvFile, relConf],
    formulaConfig: DEFAULT_FORMULA_CONFIG,
    manualInputs: {
      cashCountedCents: 33010,
      cashDrawerZeroConfirmed: false,
      categoryRealOverrides: { pendentes: 33638 },
      pendentesAutoSynced: true
    },
    manualResolutions: [{ action: 'reclassify_system', systemIds: [deliveryItem.id], targetCategory: 'pendente' }]
  });

  const rowDin = after.mirrorRows.find((r) => r.key === 'saldo_dinheiro');
  const rowPend = after.mirrorRows.find((r) => r.key === 'pendentes');
  assert.equal(rowDin.systemCents, 33010);
  assert.equal(rowDin.diffCents, 0);
  assert.equal(rowPend.systemCents, 43347);
  assert.equal(after.suggestions.filter((s) => s.reasonType === 'cash_to_pending').length, 0);
});

test('runCashReconciliation suggests high-similarity Dinheiro candidates for shortages, 2-order Delivery sums, surpluses, and extraInBank', () => {
  // 1) Alta semelhança aproximada com falta na gaveta (-100,00 vs Delivery 95,00) e soma de 2 Delivery (52,09 + 45,00 = 97,09)
  const pdvApprox = {
    fileType: 'pdv_vendas',
    status: 'ok',
    periodStart: '2026-11-25',
    periodEnd: '2026-11-25',
    rows: [
      { rowIndex: 1, numero: '101', modulo: 'DELIVERY', origem: 'DELIVERY', amountCents: 9500, receivedCents: 9500, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: '', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-25', timeStr: '19:30:00', secondsOfDay: 70200, operador: 'Op1', nomeMaquina: 'CX1' },
      { rowIndex: 2, numero: '102', modulo: 'MESA', origem: 'MESA', amountCents: 2000, receivedCents: 2000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: '', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-25', timeStr: '18:00:00', secondsOfDay: 64800, operador: 'Op1', nomeMaquina: 'CX1' }
    ]
  };
  const approxRes = runCashReconciliation({
    parsedFiles: [pdvApprox],
    formulaConfig: DEFAULT_FORMULA_CONFIG,
    manualInputs: { cashCountedCents: 1500, cashDrawerZeroConfirmed: false }
  });
  const approxItem = approxRes.systemItems.find((s) => s.referenceCode === '101');
  const approxSug = approxRes.suggestions.find(
    (s) => s.reasonType === 'cash_to_pending' && s.systemIds.includes(approxItem?.id)
  );
  assert.ok(approxSug, 'Deve sugerir Delivery R$ 95,00 por alta semelhança (95%) contra falta de -R$ 100,00');
  assert.ok(approxSug.similarityPct >= 90);

  // 1B) Soma de 2 pedidos Delivery em Dinheiro (52,09 + 45,00 = 97,09) explicando falta de -97,09
  const pdvPair = {
    fileType: 'pdv_vendas',
    status: 'ok',
    periodStart: '2026-11-25',
    periodEnd: '2026-11-25',
    rows: [
      { rowIndex: 1, numero: '111', modulo: 'DELIVERY', origem: 'DELIVERY', amountCents: 5209, receivedCents: 5209, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: '', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-25', timeStr: '19:40:00', secondsOfDay: 70800, operador: 'Op1', nomeMaquina: 'CX1' },
      { rowIndex: 2, numero: '112', modulo: 'DELIVERY', origem: 'DELIVERY', amountCents: 4500, receivedCents: 4500, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: '', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-25', timeStr: '20:05:00', secondsOfDay: 72300, operador: 'Op1', nomeMaquina: 'CX1' },
      { rowIndex: 3, numero: '113', modulo: 'MESA', origem: 'MESA', amountCents: 3000, receivedCents: 3000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: '', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-25', timeStr: '18:30:00', secondsOfDay: 66600, operador: 'Op1', nomeMaquina: 'CX1' }
    ]
  };
  const pairRes = runCashReconciliation({
    parsedFiles: [pdvPair],
    formulaConfig: DEFAULT_FORMULA_CONFIG,
    manualInputs: { cashCountedCents: 3000, cashDrawerZeroConfirmed: false }
  });
  const pairSug = pairRes.suggestions.find((s) => s.reasonType === 'cash_to_pending' && s.systemIds.length === 2);
  assert.ok(pairSug, 'Deve sugerir soma de 2 pedidos Delivery (52,09 + 45,00) quando explica 100% a falta de -R$ 97,09');
  assert.equal(pairSug.amountCents, 9709);
  assert.equal(pairSug.similarityPct, 100);

  // 2) Sobra no banco (PIX R$ 73,50) com alta semelhança contra venda Delivery em Dinheiro (R$ 75,00) + sobra física +60,00 vs Pendente 60,00
  const pdvSimilarity = {
    fileType: 'pdv_vendas',
    status: 'ok',
    periodStart: '2026-11-25',
    periodEnd: '2026-11-25',
    rows: [
      { rowIndex: 1, numero: '201', modulo: 'DELIVERY', origem: 'DELIVERY', amountCents: 7500, receivedCents: 7500, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: '', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-25', timeStr: '20:00:00', secondsOfDay: 72000, operador: 'Op1', nomeMaquina: 'CX1' },
      { rowIndex: 2, numero: '202', modulo: 'DELIVERY', origem: 'DELIVERY', amountCents: 6000, receivedCents: 6000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'NOTA PENDENTE', administradora: '', category: 'pendente', subType: 'pendente', dateStr: '2026-11-25', timeStr: '20:10:00', secondsOfDay: 72600, operador: 'Op1', nomeMaquina: 'CX1' }
    ]
  };
  const ofxExtra = {
    fileType: 'extrato_ofx',
    status: 'ok',
    periodStart: '2026-11-25',
    periodEnd: '2026-11-25',
    rows: [
      { rowIndex: 1, source: 'ofx', ofxClass: 'pix_cliente', isCredit: true, isPdvEligible: true, category: 'pix', subType: 'pix', amountCents: 7350, description: 'PIX CLIENTE', dateStr: '2026-11-25', timeStr: '20:02:00', secondsOfDay: 72120, hasTime: true }
    ]
  };
  // Gaveta tem R$ 135,00 contra R$ 75,00 em Dinheiro esperado (+R$ 60,00 de sobra!) -> bate com Pendente R$ 60,00
  const simRes = runCashReconciliation({
    parsedFiles: [pdvSimilarity, ofxExtra],
    formulaConfig: DEFAULT_FORMULA_CONFIG,
    manualInputs: { cashCountedCents: 13500, cashDrawerZeroConfirmed: false }
  });
  const cashSim = simRes.suggestions.find((s) => s.reasonType === 'cash_similarity');
  assert.ok(cashSim, 'Deve sugerir vínculo de alta semelhança entre venda Dinheiro (R$ 75,00) e sobra PIX (R$ 73,50)');
  assert.equal(cashSim.suggestedTargetCategory, 'pix');
  assert.ok(cashSim.similarityPct >= 95);

  const surplusCash = simRes.suggestions.find((s) => s.reasonType === 'surplus_to_cash');
  assert.ok(surplusCash, 'Deve sugerir pedido Pendente R$ 60,00 como possível Dinheiro quando há sobra física de +R$ 60,00');
  assert.equal(surplusCash.suggestedTargetCategory, 'dinheiro');
});

test('25/11 lessons: suppresses false cash_drawer_txt_hint when Sangria covers TXT, avoids Pendentes error after reclassify_system, flags Delivery+Mesa mix on N:1 and surfaces high_similarity digital matches (84,64 vs 74,71 & 38 vs 45)', () => {
  const pdv25 = {
    fileType: 'pdv_vendas',
    fileName: 'PlanilhaRecebimento_25_11.xlsx',
    status: 'ok',
    periodStart: '2026-11-25',
    periodEnd: '2026-11-25',
    rows: [
      { rowIndex: 1, numero: '1', modulo: 'DELIVERY', origem: 'DELIVERY', amountCents: 9700, receivedCents: 9700, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: '', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-25', timeStr: '12:15:00', secondsOfDay: 44100, operador: 'MARCELA', nomeMaquina: 'CX1' },
      { rowIndex: 2, numero: '10', modulo: 'MESA', origem: 'MESA', amountCents: 33019 - 9700 + 11673 - 21585 - 10000, receivedCents: 33019 - 9700 + 11673 - 21585 - 10000, recebidoEmBranco: false, changeCents: 0, formaPagto: 'DINHEIRO', administradora: '', category: 'dinheiro', subType: 'dinheiro', dateStr: '2026-11-25', timeStr: '14:00:00', secondsOfDay: 50400, operador: 'MARCELA', nomeMaquina: 'CX1' },
      { rowIndex: 3, numero: '99', modulo: 'MESA', origem: 'MESA', amountCents: 33638, receivedCents: 33638, recebidoEmBranco: false, changeCents: 0, formaPagto: 'NOTA PENDENTE', administradora: 'NOTA PENDENTE', category: 'pendente', subType: 'pendente', dateStr: '2026-11-25', timeStr: '11:30:00', secondsOfDay: 41400, operador: 'MARCELA', nomeMaquina: 'CX1' },
      { rowIndex: 4, numero: '9', modulo: 'DELIVERY', origem: 'DELIVERY', amountCents: 3800, receivedCents: 3800, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'DEBITO', category: 'cartao', subType: 'debito', dateStr: '2026-11-25', timeStr: '13:16:47', secondsOfDay: 13 * 3600 + 16 * 60 + 47, operador: 'MARCELA', nomeMaquina: 'CX1' },
      { rowIndex: 5, numero: '015', modulo: 'MESA', origem: 'MESA', amountCents: 700, receivedCents: 700, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'DEBITO', category: 'cartao', subType: 'debito', dateStr: '2026-11-25', timeStr: '13:38:00', secondsOfDay: 13 * 3600 + 38 * 60, operador: 'MARCELA', nomeMaquina: 'CX1' },
      { rowIndex: 6, numero: '015', modulo: 'MESA', origem: 'MESA', amountCents: 8464, receivedCents: 8464, recebidoEmBranco: false, changeCents: 0, formaPagto: 'CARTÃO', administradora: 'PIX', category: 'pix', subType: 'pix', dateStr: '2026-11-25', timeStr: '21:47:42', secondsOfDay: 21 * 3600 + 47 * 60 + 42, operador: 'MARCELA', nomeMaquina: 'CX1' }
    ]
  };
  const txt25 = {
    fileType: 'fechamento_txt',
    fileName: 'Mov.Caixa_25_11.txt',
    status: 'ok',
    periodStart: '2026-11-25',
    periodEnd: '2026-11-25',
    summary: {
      startDate: '2026-11-25',
      endDate: '2026-11-25',
      fundoCaixaCents: 21585,
      saidasTotalCents: 11673,
      saldoDinheiroCents: 33010,
      sangriaTotalCents: 33010,
      notaPendenteCents: 33638,
      pendingDebtors: [{ debtor: 'CLIENTE PENDENTE', amountCents: 33638 }],
      saidasItens: [
        { label: '** Baixa em Contas a Pagar Ref. 64,74', amountCents: 6474, isSangria: false },
        { label: 'Vale / Despesa Diversa', amountCents: 5199, isSangria: false },
        { label: 'SANGRIA CX. RET', amountCents: 33010, isSangria: true }
      ]
    }
  };
  const rel25 = {
    fileType: 'rel_conferencia',
    fileName: 'RelConferencia_25_11.xlsx',
    status: 'ok',
    periodStart: '2026-11-25',
    periodEnd: '2026-11-25',
    summary: {
      parsedCategoryCount: 4,
      cashBlock: {
        fundoManhaCents: 21585,
        vendaDinheiroCents: 22807,
        fundoNoiteCents: 0,
        outrasEntradasCents: 10000,
        sangriaManhaCents: 0,
        sangriaNoiteCents: 33010,
        saidasPagamentosCents: 11673,
        outrasSaidasCents: 0
      },
      systemRows: {
        saldo_dinheiro: 42719,
        pendentes: 33638
      },
      realRows: {
        pendentes: 43338
      }
    }
  };
  const c6Pay25 = {
    fileType: 'adquirente_c6pay',
    fileName: 'Relatorio_C6Pay_25_11.xlsx',
    status: 'ok',
    periodStart: '2026-11-25',
    periodEnd: '2026-11-25',
    rows: [
      { rowIndex: 1, source: 'c6pay', isApproved: true, category: 'cartao', subType: 'debito', brand: 'VISA', amountCents: 4500, feeCents: 50, netCents: 4450, dateStr: '2026-11-25', timeStr: '13:37:07', secondsOfDay: 13 * 3600 + 37 * 60 + 7, hasTime: true }
    ]
  };
  const rede25 = {
    fileType: 'adquirente_rede',
    fileName: 'Rede_25_11.csv',
    status: 'ok',
    periodStart: '2026-11-25',
    periodEnd: '2026-11-25',
    rows: [
      { rowIndex: 1, source: 'rede', isApproved: true, category: 'pix', subType: 'pix', brand: 'PIX', amountCents: 7471, feeCents: 0, netCents: 7471, dateStr: '2026-11-25', timeStr: '21:34:00', secondsOfDay: 21 * 3600 + 34 * 60, hasTime: true }
    ]
  };

  const delivery1ItemId = runCashReconciliation({ parsedFiles: [pdv25] }).systemItems.find((i) => i.referenceCode === '1' && i.amountCents === 9700)?.id;
  assert.ok(delivery1ItemId);

  const res = runCashReconciliation({
    parsedFiles: [pdv25, txt25, rel25, c6Pay25, rede25],
    formulaConfig: DEFAULT_FORMULA_CONFIG,
    manualInputs: {
      cashCountedCents: 0,
      cashDrawerZeroConfirmed: false,
      categoryRealOverrides: { pendentes: 43338 }
    },
    manualResolutions: [
      { action: 'reclassify_system', systemIds: [delivery1ItemId], targetCategory: 'pendente' }
    ]
  });

  // 1) Não deve emitir cash_drawer_txt_hint (-R$ 330,10) pois a Sangria (R$ 330,10) já cobre a Fita TXT e resta só R$ 0,09
  assert.equal(
    res.periodDiagnostics.validationWarnings.some((w) => w.code === 'cash_drawer_txt_hint'),
    false,
    'Não deve alertar Saldo em dinheiro na gaveta zerado quando Sangria já cobre TXT'
  );

  // 2) Após reclassificar Delivery 1 (97,00) para Pendente, PDV original (336,38) bate com TXT: sem erro vermelho!
  assert.equal(
    res.periodDiagnostics.validationWarnings.some((w) => w.code === 'pending_totals_mismatch'),
    false,
    'Não deve disparar erro pending_totals_mismatch quando divergência decorre de ajuste manual p/ Pendente'
  );
  const adjustedWarn = res.periodDiagnostics.validationWarnings.find((w) => w.code === 'pending_totals_adjusted');
  assert.ok(adjustedWarn, 'Deve informar ajuste manual de Notas Pendentes sem alarme de erro');
  assert.equal(adjustedWarn.severity, 'info');
  assert.equal(res.periodDiagnostics.integrityChecks.pendentesMatchAcrossReports, true);

  // 3) N:1 que mistura DELIVERY 9 + MESA 015 deve sinalizar cautela de taxa de entrega no Delivery
  const groupedDelivery = res.suggestions.find((s) => s.reasonType === 'grouped_n_to_1');
  assert.ok(groupedDelivery);
  assert.equal(groupedDelivery.isDelivery, true);
  assert.match(groupedDelivery.reasonText, /Delivery.*Mesa|taxa de entrega/i);

  // 4) PIX MESA 015 (84,64) vs Rede PIX (74,71) -> alta semelhança (88%, dif -R$ 9,93 em 14 min)
  const pixSimSug = res.suggestions.find(
    (s) => s.reasonType === 'high_similarity' && s.systemItems?.[0]?.amountCents === 8464 && s.realItems?.[0]?.amountCents === 7471
  );
  assert.ok(pixSimSug, 'Deve sugerir vínculo de alta semelhança entre MESA 015 PIX (84,64) e Rede PIX (74,71)');
  assert.equal(pixSimSug.similarityPct, 88);
  assert.equal(pixSimSug.diffCents, -993);

  // 5) Se o usuário rejeitar o agrupamento N:1 (DELIVERY 9 + MESA 015), deve emergir sugestão de Delivery + taxa (38,00 -> 45,00, +7,00)
  const resAfterReject = runCashReconciliation({
    parsedFiles: [pdv25, txt25, rel25, c6Pay25, rede25],
    formulaConfig: DEFAULT_FORMULA_CONFIG,
    manualInputs: { cashCountedCents: 0, cashDrawerZeroConfirmed: false, categoryRealOverrides: { pendentes: 43338 } },
    manualResolutions: [
      { action: 'reclassify_system', systemIds: [delivery1ItemId], targetCategory: 'pendente' },
      { action: 'reject_suggestion', suggestionId: groupedDelivery.id }
    ]
  });
  const deliveryFeeSim = resAfterReject.suggestions.find(
    (s) => s.reasonType === 'high_similarity' && s.systemItems?.[0]?.amountCents === 3800 && s.realItems?.[0]?.amountCents === 4500
  );
  assert.ok(deliveryFeeSim, 'Ao rejeitar N:1, deve sugerir DELIVERY 9 (38,00) vs C6 Pay (45,00) como possível taxa de entrega (+7,00)');
  assert.equal(deliveryFeeSim.isDelivery, true);
  assert.equal(deliveryFeeSim.similarityPct, 84);
  assert.equal(deliveryFeeSim.diffCents, 700);

  // 6) Decomposição detalhada de healthBreakdown + Forçamento a 100% preservando Sobra (+R$ 9,03) e score real
  assert.ok(res.healthBreakdown, 'Motor deve retornar healthBreakdown detalhando pontos perdidos');
  assert.equal(res.healthBreakdown.rawHealthScore, res.healthScore);
  assert.equal(res.isForcedBalanced, false);

  const forcedRes = runCashReconciliation({
    parsedFiles: [pdv25, txt25, rel25, c6Pay25, rede25],
    formulaConfig: DEFAULT_FORMULA_CONFIG,
    manualInputs: {
      cashCountedCents: 0,
      cashDrawerZeroConfirmed: false,
      categoryRealOverrides: { pendentes: 43338 },
      forcedBalanced: {
        enabled: true,
        reason: 'Sobra de R$ 9,03 conferida no Turno Noite'
      }
    },
    manualResolutions: [
      { action: 'reclassify_system', systemIds: [delivery1ItemId], targetCategory: 'pendente' }
    ]
  });
  assert.equal(forcedRes.healthScore, 100);
  assert.equal(forcedRes.isForcedBalanced, true);
  assert.equal(forcedRes.rawHealthScore, res.healthScore);
  assert.equal(forcedRes.forcedBalanced.reason, 'Sobra de R$ 9,03 conferida no Turno Noite');
  assert.equal(forcedRes.diffTotalCents, res.diffTotalCents, 'Forçar 100% nunca pode apagar a Sobra/Falta real');
  assert.equal(forcedRes.status, res.status, 'Status financeiro real (sobra/falta) deve permanecer intacto');
});

