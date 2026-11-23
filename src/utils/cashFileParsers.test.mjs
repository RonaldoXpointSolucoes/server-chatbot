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

test('parseUploadedCashFile solicita senha na 1ª vez e abre C6 Pay automaticamente sem pedir depois que a senha fixa é salva', async () => {
  const XLSX = await import('xlsx');
  const crypto = await import('node:crypto');
  const XLSXLib = XLSX.CFB ? XLSX : XLSX.default || XLSX;

  const wb = XLSXLib.utils.book_new();
  const ws = XLSXLib.utils.aoa_to_sheet([
    ['Data da Venda', 'Hora da Venda', 'Modalidade', 'Bandeira', 'Status da Venda', 'Valor da Venda Bruta', 'Valor Líquido da Venda', 'Taxas (R$)', 'NSU', 'Nº Série Maquininha'],
    ['19/11/2026', '12:15:00', 'Crédito', 'Visa', 'Aprovada', '100,00', '98,00', '2,00', '900123', 'C6-01']
  ]);
  XLSXLib.utils.book_append_sheet(wb, ws, 'Vendas');
  const plainXlsx = XLSXLib.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Cifra o OOXML real com Agile 4.4 usando senha fixa dos 6 primeiros dígitos do CNPJ ('220593')
  const password = '220593';
  const kdSalt = Buffer.from('0123456789abcdef');
  const pSalt = Buffer.from('fedcba9876543210');
  const spinCount = 10;
  const packageKey = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex');
  const encodeUtf16Le = (s) => {
    const out = Buffer.alloc(s.length * 2);
    for (let i = 0; i < s.length; i++) out.writeUInt16LE(s.charCodeAt(i), i * 2);
    return out;
  };
  const pad36 = (b, len) => {
    const out = Buffer.alloc(len, 0x36);
    b.copy(out, 0, 0, Math.min(b.length, len));
    return out;
  };
  const aesEncCbc = (buf, key, iv) => {
    const c = crypto.createCipheriv('aes-256-cbc', key, iv);
    c.setAutoPadding(false);
    return Buffer.concat([c.update(buf), c.final()]);
  };

  let h = crypto.createHash('sha512').update(Buffer.concat([pSalt, encodeUtf16Le(password)])).digest();
  for (let i = 0; i < spinCount; i++) {
    const iter = Buffer.alloc(4);
    iter.writeUInt32LE(i, 0);
    h = crypto.createHash('sha512').update(Buffer.concat([iter, h])).digest();
  }
  const derive = (bk) => pad36(crypto.createHash('sha512').update(Buffer.concat([h, Buffer.from(bk)])).digest(), 32);
  const kInput = derive([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]);
  const kValue = derive([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]);
  const kSecret = derive([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]);
  const verifierInput = Buffer.from('1234567890123456');
  const verifierHash = crypto.createHash('sha512').update(verifierInput).digest();
  const ivSalt = pad36(pSalt, 16);
  const xml = `<encryption xmlns="http://schemas.microsoft.com/office/2006/encryption"><keyData saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${kdSalt.toString('base64')}"/><keyEncryptors><keyEncryptor uri="http://schemas.microsoft.com/office/2006/keyEncryptor/password"><encryptedKey spinCount="${spinCount}" saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${pSalt.toString('base64')}" encryptedVerifierHashInput="${aesEncCbc(verifierInput, kInput, ivSalt).toString('base64')}" encryptedVerifierHashValue="${aesEncCbc(verifierHash, kValue, ivSalt).toString('base64')}" encryptedKeyValue="${aesEncCbc(packageKey, kSecret, ivSalt).toString('base64')}"/></keyEncryptor></keyEncryptors></encryption>`;
  const infoBuf = Buffer.concat([Buffer.from([0x04, 0x00, 0x04, 0x00, 0x40, 0x00, 0x00, 0x00]), Buffer.from(xml, 'utf8')]);

  const encryptedChunks = [];
  for (let off = 0, seg = 0; off < plainXlsx.length; off += 4096, seg++) {
    const slice = Buffer.from(plainXlsx.subarray(off, Math.min(off + 4096, plainXlsx.length)));
    const paddedLen = Math.ceil(slice.length / 16) * 16;
    const padded = Buffer.alloc(paddedLen, 0);
    slice.copy(padded, 0);
    const segBuf = Buffer.alloc(4);
    segBuf.writeUInt32LE(seg, 0);
    const segIv = pad36(crypto.createHash('sha512').update(Buffer.concat([kdSalt, segBuf])).digest(), 16);
    encryptedChunks.push(aesEncCbc(padded, packageKey, segIv));
  }
  const pkgSize = Buffer.alloc(8);
  pkgSize.writeUInt32LE(plainXlsx.length, 0);
  const encPkg = Buffer.concat([pkgSize, ...encryptedChunks]);
  const cfb = XLSXLib.CFB.utils.cfb_new();
  XLSXLib.CFB.utils.cfb_add(cfb, 'EncryptionInfo', infoBuf);
  XLSXLib.CFB.utils.cfb_add(cfb, 'EncryptedPackage', encPkg);
  const protectedC6Buf = XLSXLib.CFB.write(cfb, { type: 'buffer' });

  // 1ª vez sem senha salva -> pede senha com dica do C6 Pay
  const firstAttempt = await parseUploadedCashFile({
    fileName: 'Relatorio-Vendas-C6Pay_Detalhado.xlsx',
    arrayBuffer: protectedC6Buf
  });
  assert.equal(firstAttempt.status, 'password_required');
  assert.equal(firstAttempt.fileType, 'adquirente_c6pay');

  // Senha incorreta -> permanece bloqueado com erro claro
  const wrongAttempt = await parseUploadedCashFile({
    fileName: 'Relatorio-Vendas-C6Pay_Detalhado.xlsx',
    arrayBuffer: protectedC6Buf,
    password: '000000'
  });
  assert.equal(wrongAttempt.status, 'password_required');
  assert.match(wrongAttempt.errorMessage, /Senha incorreta/i);

  // Colar CNPJ inteiro na 1ª vez -> extrai os 6 primeiros dígitos e desbloqueia
  let capturedPassword = '';
  const cnpjPasteAttempt = await parseUploadedCashFile({
    fileName: 'Relatorio-Vendas-C6Pay_Detalhado.xlsx',
    arrayBuffer: protectedC6Buf,
    password: '22.059.300/0001-45',
    onPasswordMatched: (pwd) => {
      capturedPassword = pwd;
    }
  });
  assert.equal(cnpjPasteAttempt.status, 'ok');
  assert.equal(cnpjPasteAttempt.fileType, 'adquirente_c6pay');
  assert.equal(capturedPassword, '220593');

  // 2ª vez em diante (sem passar password!) -> abre automaticamente usando senha salva (ou rulesConfig)
  const autoUnlockedAttempt = await parseUploadedCashFile({
    fileName: 'Relatorio-Vendas-C6Pay_Detalhado (2).xlsx',
    arrayBuffer: protectedC6Buf,
    savedPasswords: [{ pattern: 'file_password:adquirente_c6pay', key: 'adquirente_c6pay', password: '220593' }]
  });
  assert.equal(autoUnlockedAttempt.status, 'ok');
  assert.equal(autoUnlockedAttempt.fileType, 'adquirente_c6pay');
  assert.equal(autoUnlockedAttempt.rows.length, 1);
  assert.equal(autoUnlockedAttempt.summary.autoUnlocked, true);
  assert.equal(JSON.stringify(autoUnlockedAttempt).includes('220593'), false);
});
