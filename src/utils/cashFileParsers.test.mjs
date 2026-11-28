import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseMoneyToCents,
  parseCashDateTime,
  parseUploadedCashFile,
  identifyBankInstitution
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

test('parseUploadedCashFile detects and parses all 7 DataDivas reports from 20/11 sample files accurately', async () => {
  const soldBuf = fs.readFileSync(`${UPLOAD_DIR}/media_1795399840914_32008acd.xlsx`);
  const soldRes = await parseUploadedCashFile({ fileName: 'ItensVendidos_20_11.xlsx', arrayBuffer: soldBuf });
  assert.equal(soldRes.status, 'ok');
  assert.equal(soldRes.fileType, 'pdv_itens_vendidos');
  assert.equal(soldRes.summary.totalRows, 199);
  assert.equal(soldRes.summary.complementsCents, 57400);
  assert.ok(soldRes.summary.feeRemovalsCount > 0);

  const cancBuf = fs.readFileSync(`${UPLOAD_DIR}/media_1795399840914_2d8e87b4.xlsx`);
  const cancRes = await parseUploadedCashFile({ fileName: 'Cancelamentos_20_11.xlsx', arrayBuffer: cancBuf });
  assert.equal(cancRes.status, 'ok');
  assert.equal(cancRes.fileType, 'pdv_cancelamentos');
  assert.equal(cancRes.rows.length, 2);
  assert.equal(cancRes.summary.totalCancelledCents, 5500);
  assert.equal(cancRes.rows[0].reasonDetails, 'era a marmita da cida');

  const discBuf = fs.readFileSync(`${UPLOAD_DIR}/media_1795399840914_dc0c6dc9.xlsx`);
  const discRes = await parseUploadedCashFile({ fileName: 'Descontos_20_11.xlsx', arrayBuffer: discBuf });
  assert.equal(discRes.status, 'ok');
  assert.equal(discRes.fileType, 'pdv_descontos');
  assert.equal(discRes.rows.length, 0);

  const resumoTxt = fs.readFileSync(`${UPLOAD_DIR}/media_1795399920234_cf61cab7.txt`, 'latin1');
  const resumoRes = await parseUploadedCashFile({ fileName: 'Fechamento_Resumo.txt', textContent: resumoTxt });
  assert.equal(resumoRes.status, 'ok');
  assert.equal(resumoRes.fileType, 'fechamento_resumo_txt');
  assert.equal(resumoRes.periodStart, '2026-11-20');
  assert.equal(resumoRes.summary.consumoInternoCustoCents, 8809);
  assert.equal(resumoRes.summary.caixaDescontos.length, 12);
  assert.equal(resumoRes.summary.mesasTransferidas.length, 2);
});

test('parseUploadedCashFile unlocks real encrypted C6 Pay file even with headers above worksheet !ref', async () => {
  const encryptedBuf = fs.readFileSync(
    'C:/Users/NOTE-(FORM)02JUL26/.gemini/antigravity/brain/15c2c45d-2e4f-4867-9efb-2507905522dd/.user_uploaded/media_1795378790616_7c37f118.xlsx'
  );

  const locked = await parseUploadedCashFile({
    fileName: 'Relatorio-Vendas-C6Pay_Detalhado.xlsx',
    arrayBuffer: encryptedBuf
  });
  assert.equal(locked.status, 'password_required');
  assert.equal(locked.fileType, 'adquirente_c6pay');

  const unlocked = await parseUploadedCashFile({
    fileName: 'Relatorio-Vendas-C6Pay_Detalhado.xlsx',
    arrayBuffer: encryptedBuf,
    password: '590758'
  });
  assert.equal(unlocked.status, 'ok');
  assert.equal(unlocked.fileType, 'adquirente_c6pay');
  assert.equal(unlocked.rows.length, 57);
  assert.equal(unlocked.periodStart, '2026-11-19');
});

test('parseUploadedCashFile scans multiple sheets and attaches diagnostics on unrecognized workbooks', async () => {
  const XLSX = await import('xlsx');
  const XLSXLib = XLSX.utils ? XLSX : XLSX.default || XLSX;

  const wb = XLSXLib.utils.book_new();
  const coverSheet = XLSXLib.utils.aoa_to_sheet([['Resumo Gerencial'], ['Emitido em 20/11/2026']]);
  const dataSheet = XLSXLib.utils.aoa_to_sheet([
    ['Motivo', 'Desconto', 'Numero', 'Data', 'Hora', 'Funcionario', 'Turno', 'Origem'],
    ['CORTESIA', 12.5, '010', '20/11/2026', '19:00', 'JOAO', '1', 'MESA']
  ]);
  XLSXLib.utils.book_append_sheet(wb, coverSheet, 'Resumo');
  XLSXLib.utils.book_append_sheet(wb, dataSheet, 'Descontos');
  const multiBuf = XLSXLib.write(wb, { type: 'array', bookType: 'xlsx' });

  const multiRes = await parseUploadedCashFile({
    fileName: 'multi_abas.xlsx',
    arrayBuffer: multiBuf
  });
  assert.equal(multiRes.status, 'ok');
  assert.equal(multiRes.fileType, 'pdv_descontos');
  assert.equal(multiRes.rows.length, 1);

  const unknownWb = XLSXLib.utils.book_new();
  XLSXLib.utils.book_append_sheet(
    unknownWb,
    XLSXLib.utils.aoa_to_sheet([['Coluna A', 'Coluna B'], ['foo', 'bar']]),
    'AbaEstranha'
  );
  const unknownBuf = XLSXLib.write(unknownWb, { type: 'array', bookType: 'xlsx' });
  const unknownRes = await parseUploadedCashFile({
    fileName: 'desconhecida.xlsx',
    arrayBuffer: unknownBuf
  });
  assert.equal(unknownRes.status, 'error');
  assert.ok(unknownRes.diagnostics);
  assert.deepEqual(unknownRes.diagnostics.sheetNames, ['AbaEstranha']);
  assert.equal(unknownRes.diagnostics.sheets[0].detectedKind, 'unknown');
});

test('identifyBankInstitution resolves canonical Brazilian banks and normalizes fallback slugs', () => {
  assert.deepEqual(
    identifyBankInstitution({ bankId: '336', acctId: '372910726', bankName: 'BANCO C6 S.A.' }),
    { bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6', acctLast4: '0726' }
  );
  assert.deepEqual(
    identifyBankInstitution({ bankId: '341', bankName: 'ITAU UNIBANCO S.A.' }),
    { bankKey: 'banco_341', bankCode: '341', bankLabel: 'Banco Itaú', acctLast4: '' }
  );
  assert.equal(identifyBankInstitution({ bankId: '1' }).bankLabel, 'Banco do Brasil');
  assert.equal(identifyBankInstitution({ bankId: '033' }).bankLabel, 'Santander');
  assert.equal(identifyBankInstitution({ bankId: '237' }).bankLabel, 'Bradesco');
  assert.equal(identifyBankInstitution({ bankId: '077' }).bankLabel, 'Banco Inter');
  assert.equal(identifyBankInstitution({ bankId: '260' }).bankLabel, 'Nubank');
  assert.equal(identifyBankInstitution({ bankId: '104' }).bankLabel, 'Caixa Econômica');
  assert.equal(identifyBankInstitution({ bankId: '756' }).bankLabel, 'Sicoob');
  assert.equal(identifyBankInstitution({ bankId: '748' }).bankLabel, 'Sicredi');

  const safraByCode = identifyBankInstitution({ bankId: '422', bankName: 'Banco Safra S.A.', acctId: '98765-4' });
  assert.deepEqual(safraByCode, {
    bankKey: 'banco_422',
    bankCode: '422',
    bankLabel: 'Banco Safra S.A.',
    acctLast4: '7654'
  });

  const slugFallback = identifyBankInstitution({ fileName: 'Extrato_Stone_19_11.xlsx' });
  assert.equal(slugFallback.bankKey, 'banco_extrato_stone_19_11');
  assert.equal(slugFallback.bankCode, '');

  // Regression: generic "Caixa" in fileName or headerText must not misclassify as Caixa Econômica (104)
  const caixaSicoob = identifyBankInstitution({
    fileName: 'Caixa_Sicoob.xlsx',
    headerText: 'Movimento de Caixa Data Descricao Valor'
  });
  assert.deepEqual(caixaSicoob, {
    bankKey: 'banco_756',
    bankCode: '756',
    bankLabel: 'Sicoob',
    acctLast4: ''
  });

  const genericCaixa = identifyBankInstitution({
    fileName: 'Extrato_Caixa_19_11.xlsx',
    headerText: 'Movimento de Caixa Data Descricao Valor'
  });
  assert.notEqual(genericCaixa.bankKey, 'banco_104');
  assert.equal(genericCaixa.bankCode, '');
  assert.equal(genericCaixa.bankKey, 'banco_extrato_caixa_19_11');

  // Unambiguous Caixa Econômica identifiers still resolve to 104
  assert.equal(identifyBankInstitution({ bankName: 'CAIXA' }).bankKey, 'banco_104');
  assert.equal(identifyBankInstitution({ fileName: 'Extrato_CEF_19_11.xlsx' }).bankKey, 'banco_104');
  assert.equal(identifyBankInstitution({ fileName: 'Extrato_Caixa_Economica.xlsx' }).bankKey, 'banco_104');
});

test('parseUploadedCashFile enriches OFX and generic bank spreadsheets with canonical bankKey, bankCode, bankLabel and acctLast4', async () => {
  // 1. C6 OFX real (BANKID 336, ACCTID 372910726)
  const c6OfxText = fs.readFileSync(`${UPLOAD_DIR}/media_1795378631614_64afeb10.ofx`, 'utf8');
  const c6Res = await parseUploadedCashFile({ fileName: 'Extrato_C6.ofx', textContent: c6OfxText });
  assert.equal(c6Res.summary.bankKey, 'banco_336');
  assert.equal(c6Res.summary.bankCode, '336');
  assert.equal(c6Res.summary.bankLabel, 'Banco C6');
  assert.equal(c6Res.summary.acctLast4, '0726');
  assert.equal(c6Res.rows[0].bankKey, 'banco_336');
  assert.equal(c6Res.rows[0].bankLabel, 'Banco C6');
  assert.equal(c6Res.rows[0].acctLast4, '0726');

  // 2. Itaú OFX (BANKID 341, ORG ITAU UNIBANCO S.A.)
  const itauOfxText = `<OFX>
    <SIGNONMSGSRSV1><SONRS><FI><ORG>ITAU UNIBANCO S.A.</ORG><FID>341</FID></FI></SONRS></SIGNONMSGSRSV1>
    <BANKMSGSRSV1><STMTTRNRS><STMTRS>
      <BANKACCTFROM><BANKID>341</BANKID><ACCTID>99881-2</ACCTID></BANKACCTFROM>
      <BANKTRANLIST>
        <DTSTART>20261119000000</DTSTART><DTEND>20261119235959</DTEND>
        <STMTTRN><FITID>101</FITID><TRNAMT>50.00</TRNAMT><DTPOSTED>20261119120000</DTPOSTED><TRNTYPE>CREDIT</TRNTYPE><MEMO>PIX RECEBIDO CLIENTE</MEMO></STMTTRN>
      </BANKTRANLIST>
    </STMTRS></STMTTRNRS></BANKMSGSRSV1>
  </OFX>`;
  const itauOfxRes = await parseUploadedCashFile({ fileName: 'itau.ofx', textContent: itauOfxText });
  assert.equal(itauOfxRes.summary.bankKey, 'banco_341');
  assert.equal(itauOfxRes.summary.bankCode, '341');
  assert.equal(itauOfxRes.summary.bankLabel, 'Banco Itaú');
  assert.equal(itauOfxRes.summary.acctLast4, '98812'.slice(-4));
  assert.equal(itauOfxRes.rows[0].bankKey, 'banco_341');

  // 3. Planilha genérica Excel identificada pelo nome do arquivo (Extrato_Itau_19_11.xlsx)
  const XLSX = await import('xlsx');
  const XLSXLib = XLSX.utils ? XLSX : XLSX.default || XLSX;
  const wb = XLSXLib.utils.book_new();
  const ws = XLSXLib.utils.aoa_to_sheet([
    ['Data', 'Descrição', 'Valor'],
    ['19/11/2026', 'PIX RECEBIDO JOAO', 120.5]
  ]);
  XLSXLib.utils.book_append_sheet(wb, ws, 'Extrato');
  const itauXlsxBuf = XLSXLib.write(wb, { type: 'array', bookType: 'xlsx' });
  const itauXlsxRes = await parseUploadedCashFile({
    fileName: 'Extrato_Itau_19_11.xlsx',
    arrayBuffer: itauXlsxBuf
  });
  assert.equal(itauXlsxRes.status, 'ok');
  assert.equal(itauXlsxRes.fileType, 'extrato_generico');
  assert.equal(itauXlsxRes.summary.bankKey, 'banco_341');
  assert.equal(itauXlsxRes.summary.bankCode, '341');
  assert.equal(itauXlsxRes.summary.bankLabel, 'Banco Itaú');
  assert.equal(itauXlsxRes.rows[0].bankKey, 'banco_341');

  // 4. Planilha genérica CSV identificada pelo cabeçalho
  const bbCsv = 'Banco do Brasil - Extrato Conta Corrente\nData;Historico;Valor\n19/11/2026;PIX RECEBIDO MARIA;75,00\n';
  const bbCsvRes = await parseUploadedCashFile({
    fileName: 'extrato.csv',
    textContent: bbCsv
  });
  assert.equal(bbCsvRes.status, 'ok');
  assert.equal(bbCsvRes.fileType, 'extrato_generico');
  assert.equal(bbCsvRes.summary.bankKey, 'banco_001');
  assert.equal(bbCsvRes.summary.bankCode, '001');
  assert.equal(bbCsvRes.summary.bankLabel, 'Banco do Brasil');
});

test('parseUploadedCashFile distinguishes true multi-day C6 Pay exports from D+1 midnight virada and guards negative OFX credits', async () => {
  const XLSX = await import('xlsx');
  const XLSXLib = XLSX.utils ? XLSX : XLSX.default || XLSX;

  const wb = XLSXLib.utils.book_new();
  const ws = XLSXLib.utils.aoa_to_sheet([
    ['Data da Venda', 'Hora da Venda', 'Modalidade', 'Bandeira', 'Status da Venda', 'Valor da Venda Bruta', 'Valor Líquido da Venda', 'Taxas (R$)', 'NSU', 'Nº Série Maquininha'],
    ['18/11/2026', '12:00:00', 'Crédito', 'Visa', 'Aprovada', '100,00', '98,00', '2,00', '1', 'C6'],
    ['19/11/2026', '13:00:00', 'Crédito', 'Visa', 'Aprovada', '120,00', '118,00', '2,00', '2', 'C6'],
    ['20/11/2026', '14:00:00', 'Crédito', 'Mastercard', 'Aprovada', '50,00', '49,00', '1,00', '3', 'C6']
  ]);
  XLSXLib.utils.book_append_sheet(wb, ws, 'Vendas');
  const multiC6Res = await parseUploadedCashFile({
    fileName: 'C6Pay_Multi.xlsx',
    arrayBuffer: XLSXLib.write(wb, { type: 'array', bookType: 'xlsx' })
  });
  assert.equal(multiC6Res.status, 'ok');
  assert.equal(multiC6Res.fileType, 'adquirente_c6pay');
  assert.equal(multiC6Res.periodStart, '2026-11-18');
  assert.equal(multiC6Res.periodEnd, '2026-11-20');
  assert.equal(multiC6Res.summary.isSingleDayVirada, false);
  assert.equal(
    multiC6Res.warnings.some((w) => /múltiplos dias/i.test(w)),
    false,
    'Relatórios C6 Pay multi-dias não devem gerar aviso desnecessário no parser'
  );

  // Relatório Resumido C6Pay sem coluna HORA DA VENDA ou com data+hora juntas
  const wbResumido = XLSXLib.utils.book_new();
  const wsResumido = XLSXLib.utils.aoa_to_sheet([
    ['Data da Venda', 'Modalidade', 'Bandeira', 'Status da Venda', 'Valor da Venda Bruta', 'Valor Líquido da Venda', 'Taxas (R$)'],
    ['24/11/2026', 'Crédito', 'Visa', 'Aprovada', '85,00', '83,00', '2,00'],
    ['24/11/2026 21:15:00', 'PIX', 'PIX', 'Aprovada', '45,00', '45,00', '0,00'],
    ['25/11/2026', 'Débito', 'Elo', 'Aprovada', '30,00', '29,50', '0,50']
  ]);
  XLSXLib.utils.book_append_sheet(wbResumido, wsResumido, 'Resumido');
  const resumidoRes = await parseUploadedCashFile({
    fileName: 'Relatorio-Vendas-C6Pay_Resumido.xlsx',
    arrayBuffer: XLSXLib.write(wbResumido, { type: 'array', bookType: 'xlsx' })
  });
  assert.equal(resumidoRes.status, 'ok');
  assert.equal(resumidoRes.fileType, 'adquirente_c6pay');
  assert.equal(resumidoRes.rows.length, 3);
  assert.equal(resumidoRes.rows[0].hasTime, false);
  assert.equal(resumidoRes.rows[1].hasTime, true);
  assert.equal(resumidoRes.rows[1].timeStr, '21:15:00');
  assert.equal(resumidoRes.warnings.length, 0);

  // OFX com lançamento negativo marcado erroneamente como CREDIT nunca deve entrar como pix_cliente
  const strangeOfx = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
    <BANKACCTFROM><BANKID>336</BANKID><ACCTID>372910726</ACCTID></BANKACCTFROM>
    <BANKTRANLIST>
      <STMTTRN><FITID>1</FITID><TRNAMT>-45.00</TRNAMT><DTPOSTED>20261120110000</DTPOSTED><TRNTYPE>CREDIT</TRNTYPE><MEMO>ESTORNO PIX</MEMO></STMTTRN>
      <STMTTRN><FITID>2</FITID><TRNAMT>45.00</TRNAMT><DTPOSTED>20261120110500</DTPOSTED><TRNTYPE>CREDIT</TRNTYPE><MEMO>PIX RECEBIDO CLIENTE</MEMO></STMTTRN>
    </BANKTRANLIST>
  </STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const strangeRes = await parseUploadedCashFile({ fileName: 'strange.ofx', textContent: strangeOfx });
  assert.equal(strangeRes.rows.filter((r) => r.ofxClass === 'pix_cliente').length, 1);
  assert.equal(strangeRes.rows.find((r) => r.amountCents === -4500).ofxClass, 'debito_saida');
});

test('parseUploadedCashFile lê Relatorio-Vendas-C6Pay_Resumido sem STATUS DA VENDA e ignora linha TOTAL sem zerar vendas aprovadas', async () => {
  const XLSX = await import('xlsx');
  const XLSXLib = XLSX.utils ? XLSX : XLSX.default || XLSX;
  const wb = XLSXLib.utils.book_new();
  const ws = XLSXLib.utils.aoa_to_sheet([
    ['Data da Venda', 'Modalidade', 'Bandeira', 'Valor da Venda Bruta', 'Valor Líquido da Venda', 'Taxas (R$)'],
    ['24/11/2026', 'Crédito', 'Mastercard', '300,59', '291,50', '9,09'],
    ['24/11/2026', 'Débito', 'Mastercard', '322,50', '318,00', '4,50'],
    ['24/11/2026', 'Crédito', 'Visa', '126,00', '122,00', '4,00'],
    ['24/11/2026', 'Débito', 'Visa', '67,10', '66,00', '1,10'],
    ['24/11/2026', 'Voucher', 'Alelo', '159,00', '152,00', '7,00'],
    ['24/11/2026', 'PIX', 'PIX', '182,50', '182,50', '0,00'],
    ['Total', '', '', '1.157,69', '1.132,00', '25,69']
  ]);
  XLSXLib.utils.book_append_sheet(wb, ws, 'Resumido');

  const res = await parseUploadedCashFile({
    fileName: 'Relatorio-Vendas-C6Pay_Resumido.xlsx',
    arrayBuffer: XLSXLib.write(wb, { type: 'array', bookType: 'xlsx' })
  });

  assert.equal(res.status, 'ok');
  assert.equal(res.fileType, 'adquirente_c6pay');
  assert.equal(res.summary.isSummaryReport, true);
  assert.equal(res.rows.length, 6, 'Linha Total de rodapé deve ser ignorada');
  assert.equal(res.rows.filter((r) => r.isApproved).length, 6, 'Sem coluna STATUS, lançamentos positivos devem vir aprovados');
  const cardSumCents = res.rows.filter((r) => r.category === 'cartao' && r.isApproved).reduce((s, r) => s + r.amountCents, 0);
  assert.equal(cardSumCents, 97519);
});
