import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseMoneyToCents,
  parseCashDateTime,
  parseUploadedCashFile
} from './cashFileParsers.mjs';

const UPLOAD_DIR = 'C:/Users/NOTE-(FORM)02JUL26/.gemini/antigravity/brain/15c2c45d-2e4f-4867-9efb-2507905522dd/.user_uploaded';

test('parseMoneyToCents converts BRL, US-dot Excel formatted strings, asterisks and negative values accurately', () => {
  assert.equal(parseMoneyToCents(' R$ 17.50 '), 1750);
  assert.equal(parseMoneyToCents('R$ 1.234,56'), 123456);
  assert.equal(parseMoneyToCents(' R$ -   '), 0);
  assert.equal(parseMoneyToCents('50,00*'), 5000);
  assert.equal(parseMoneyToCents(-0.12), -12);
  assert.equal(parseMoneyToCents(185.35), 18535);
  assert.equal(parseMoneyToCents('4.785,84'), 478584);
});

test('parseCashDateTime converts Excel numeric serials and formatted date/time strings', () => {
  const serial = parseCashDateTime(46345, 25569.93488425926);
  assert.equal(serial.dateStr, '2026-11-19');
  assert.equal(serial.timeStr, '22:26:14');
  assert.equal(serial.secondsOfDay, 22 * 3600 + 26 * 60 + 14);

  const br = parseCashDateTime('19/11/2026', '09:05:36');
  assert.equal(br.dateStr, '2026-11-19');
  assert.equal(br.timeStr, '09:05:36');
});

test('parseUploadedCashFile auto-detects and parses all 6 real report formats accurately', async () => {
  // 1. PlanilhaRecebimento (.xlsx)
  const pdvBuf = fs.readFileSync(`${UPLOAD_DIR}/media_1795378712225_e4f6a83a.xlsx`);
  const pdvRes = await parseUploadedCashFile({ fileName: 'PlanilhaRecebimento.xlsx', arrayBuffer: pdvBuf });
  assert.equal(pdvRes.status, 'ok');
  assert.equal(pdvRes.fileType, 'pdv_vendas');
  assert.equal(pdvRes.rows.length, 100);
  const blankRecRow = pdvRes.rows.find(r => r.amountCents === 5995 && r.timeStr === '20:48:57');
  assert.equal(blankRecRow.recebidoEmBranco, true);
  const changeRow = pdvRes.rows.find(r => r.amountCents === 4500 && r.category === 'dinheiro');
  assert.equal(changeRow.changeCents, 500);

  // 2. RelConferencia (.xlsx)
  const confBuf = fs.readFileSync(`${UPLOAD_DIR}/media_1795379540236_1b7010c2.xlsx`);
  const confRes = await parseUploadedCashFile({ fileName: 'RelConferencia.xlsx', arrayBuffer: confBuf });
  assert.equal(confRes.status, 'ok');
  assert.equal(confRes.fileType, 'rel_conferencia');
  assert.equal(confRes.summary.cashBlock.fundoManhaCents, 61055);
  assert.equal(confRes.summary.cashBlock.vendaDinheiroCents, 34510);
  assert.equal(confRes.summary.cashBlock.saidasPagamentosCents, 6758);
  assert.equal(confRes.summary.systemRows.saldo_dinheiro, 88807);
  assert.equal(confRes.summary.systemRows.cartao, 311510);
  assert.equal(confRes.summary.systemRows.pendentes, 40900);
  assert.equal(confRes.summary.systemRows.pix, 132564);
  assert.equal(confRes.summary.systemRows.total, 573781);

  // 3. Rede (.xlsx)
  const redeBuf = fs.readFileSync(`${UPLOAD_DIR}/media_1795378748853_11a72afc.xlsx`);
  const redeRes = await parseUploadedCashFile({ fileName: 'Rede_Rel_Vendas.xlsx', arrayBuffer: redeBuf });
  assert.equal(redeRes.status, 'ok');
  assert.equal(redeRes.fileType, 'adquirente_rede');
  assert.equal(redeRes.rows.length, 16);
  const redePix = redeRes.rows.filter(r => r.category === 'pix');
  assert.equal(redePix.length, 6);
  assert.equal(redePix.reduce((s, r) => s + r.amountCents, 0), 28649);

  // 4. C6 Pay (.xlsx)
  const c6pBuf = fs.readFileSync(`${UPLOAD_DIR}/media_1795379472661_df33ee0b.xlsx`);
  const c6pRes = await parseUploadedCashFile({ fileName: 'Relatorio-Vendas-C6Pay_Detalhado.xlsx', arrayBuffer: c6pBuf });
  assert.equal(c6pRes.status, 'ok');
  assert.equal(c6pRes.fileType, 'adquirente_c6pay');
  const c6pApproved = c6pRes.rows.filter(r => r.isApproved);
  const c6pDenied = c6pRes.rows.filter(r => !r.isApproved);
  assert.equal(c6pDenied.length, 4);
  assert.ok(c6pApproved.some(r => r.dateStr === '2026-11-20' && r.amountCents === 3630));

  // 5. Encrypted C6 Pay returns password_required cleanly without throwing
  const encBuf = fs.readFileSync(`${UPLOAD_DIR}/media_1795378790616_7c37f118.xlsx`);
  const encRes = await parseUploadedCashFile({ fileName: 'C6Pay-Protegido.xlsx', arrayBuffer: encBuf });
  assert.equal(encRes.status, 'password_required');

  // 6. C6 Bank OFX
  const ofxText = fs.readFileSync(`${UPLOAD_DIR}/media_1795378631614_64afeb10.ofx`, 'utf8');
  const ofxRes = await parseUploadedCashFile({ fileName: 'Extrato_C6.ofx', textContent: ofxText });
  assert.equal(ofxRes.status, 'ok');
  assert.equal(ofxRes.fileType, 'extrato_ofx');
  const pixClients = ofxRes.rows.filter(r => r.ofxClass === 'pix_cliente');
  assert.equal(pixClients.length, 16);
  assert.equal(pixClients.reduce((s, r) => s + r.amountCents, 0), 109215);

  // 7. Fechamento PDV (.txt)
  const txtSample = `BURGUER PLUS
========================================
MOVIMENTO FECHADO: 
INICIO.: 19/11/2026 07:29:06
FIM ...: 19/11/2026 23:01:14
OPERADOR: EDILZA
========================================
VENDAS NO GERAL.......: 4.785,84
OUTROS TOTAIS
CONSUMO INTERNO.........: 355,00
TAXA ENTREGA DELIVERY...: 57,00
NOTA PENDENTE...........: 409,00
DESCONTO.10%............: 54,80
TAXA S. CASA............: 114,35
QUANTIDADE PESSOAS MESA.: 62
PRODUTOS CANCELADOS
005     Costela Prime 12h              1
                        TOTAL QUANT... 3
                    VALOR TOTAL... 69,00
VENDAS PENDENTES
========================================
CLEITON FERREIRA (  NOTA PENDE    140,00*
RONALDO BURGUERPLUS NOTA PENDE     10,00*
========================================
                                  409,00
CUPONS FISCAIS       QTD.       TOTAL R$
EMITIDOS                3         347,00
ENTRADAS NO TOTAL
FUNDO DE CAIXA AUTO DIA ANTERIOR TURNO 1: 610,55
SAIDAS NO TOTAL                 VALOR R$
** VALE FUNC. - ISAAC              50,00*
** Baixa em Contas a Pagar Ref.     9,60*
** Baixa em Contas a Pagar Ref.     7,98*
SANGRIA CX. RET                   630,80
----------------------------------------
TOTAL GERAL.........: 698,38
SALDO DINHEIRO... R$    257,27`;
  const txtRes = await parseUploadedCashFile({ fileName: 'fechamento.txt', textContent: txtSample });
  assert.equal(txtRes.status, 'ok');
  assert.equal(txtRes.fileType, 'fechamento_txt');
  assert.equal(txtRes.summary.sangriaCents, 63080);
  assert.equal(txtRes.summary.saidasPagamentosCents, 6758);
  assert.equal(txtRes.summary.saldoDinheiroCents, 25727);
  assert.equal(txtRes.summary.consumoInternoCents, 35500);
  assert.equal(txtRes.summary.canceladosCents, 6900);
  assert.equal(txtRes.summary.pendingDebtors.length, 2);
});
