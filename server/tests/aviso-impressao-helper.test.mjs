import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AVISO_IMPRESSAO_URL,
  normalizeThermalPrinterText,
  extractGastrofoodOrderMeta,
  buildOrderReviewPrinterMessage,
  buildAvisoImpressaoUrl,
  dispatchAvisoImpressao
} from '../src/automation-worker/aviso-impressao-helper.js';

test('normalizeThermalPrinterText remove acentos, emojis e quebras para bobina termica', () => {
  const cleaned = normalizeThermalPrinterText('Atenção ⚠️:\nRevisar pedido — José\t(Não!');
  assert.equal(cleaned, 'Atencao : Revisar pedido - Jose (Nao!');
  assert.equal(cleaned.includes('\n'), false);
  assert.equal(cleaned.includes('\t'), false);
});

test('extractGastrofoodOrderMeta extrai numero do pedido, cliente, total e pagamento', () => {
  const meta = extractGastrofoodOrderMeta(
    { result: true, id: '9C42D612-1111-4444-8888-AABBCCDDEEFF', numeroPedido: '14170' },
    { jsOrder: { total: 33, pagto: 'Pix', customer: { NomeRazao: 'Rose Oliveira' } } },
    { name: 'Rose Cliente', phone: '5511979580806' }
  );
  assert.equal(meta.orderId, '9C42D612-1111-4444-8888-AABBCCDDEEFF');
  assert.equal(meta.orderNumber, '14170');
  assert.equal(meta.customerName, 'Rose Oliveira');
  assert.equal(meta.total, 33);
  assert.equal(meta.pagto, 'Pix');
});

test('buildOrderReviewPrinterMessage gera recado curto e claro avisando para revisar pedido feito pela IA', () => {
  const msg = buildOrderReviewPrinterMessage({
    resData: { result: true, CdPedido: 14170 },
    finalPayload: { jsOrder: { total: 40, pagto: 'Pix', customer: { NomeRazao: 'Rose Silva' } } },
    contactInfo: { name: 'Rose Silva', phone: '5511979580806' }
  });

  assert.match(msg, /REVISAR PEDIDO #14170/);
  assert.match(msg, /Rose/i);
  assert.match(msg, /R\$ 40,00/);
  assert.match(msg, /FEITO AUTOMATICAMENTE PELA IA/i);
  assert.ok(msg.length <= 150);
  // Nao deve conter caracteres acentuados nem quebras de linha
  assert.equal(/[^\x20-\x7E]/.test(msg), false);
});

test('buildAvisoImpressaoUrl retorna null quando estabelecimento ou impressora nao estao configurados', () => {
  assert.equal(buildAvisoImpressaoUrl({ companySettings: {}, message: 'Teste' }), null);
  assert.equal(buildAvisoImpressaoUrl({ companySettings: { aviso_impressao_estabelecimento: 'burguerplus' }, message: 'Teste' }), null);
  assert.equal(buildAvisoImpressaoUrl({ companySettings: { aviso_impressao_impressora: 'CAIXA' }, message: 'Teste' }), null);
});

test('buildAvisoImpressaoUrl monta URL limpa com parametros e, d, m ignorando query string antiga salva em aviso_impressao_url', () => {
  const url = buildAvisoImpressaoUrl({
    companySettings: {
      aviso_impressao_estabelecimento: 'burguerplus',
      aviso_impressao_impressora: 'CAIXA',
      aviso_impressao_url: `${DEFAULT_AVISO_IMPRESSAO_URL}?e=burguerplus&d=CAIXA&m=Teste+Recado+Impressora`
    },
    message: 'ATENCAO: REVISAR PEDIDO #14170'
  });

  assert.ok(url.startsWith(`${DEFAULT_AVISO_IMPRESSAO_URL}?e=burguerplus&d=CAIXA&m=`));
  assert.equal(url.includes('Teste+Recado+Impressora'), false);
  assert.ok(decodeURIComponent(url).includes('ATENCAO: REVISAR PEDIDO #14170'));
});

test('dispatchAvisoImpressao envia GET para GestorPedidosService e tolera falha de rede sem lancar excecao', async () => {
  const calls = [];
  const logged = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, text: async () => '{"result":true}' };
  };

  const resOk = await dispatchAvisoImpressao({
    companySettings: {
      aviso_impressao_estabelecimento: 'burguerplus',
      aviso_impressao_impressora: 'CAIXA'
    },
    message: 'ATENCAO: REVISAR PEDIDO #14170 - FEITO PELA IA',
    tenantId: 'tenant-1',
    fetchImpl: fakeFetch,
    logFn: (entry) => logged.push(entry)
  });

  assert.equal(resOk.dispatched, true);
  assert.equal(resOk.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.method, 'GET');
  assert.equal(logged.length, 2);
  assert.equal(logged[0].direction, 'request');
  assert.equal(logged[1].direction, 'response');

  // Offline/timeout resilience must never break order completion
  const resFail = await dispatchAvisoImpressao({
    companySettings: {
      aviso_impressao_estabelecimento: 'burguerplus',
      aviso_impressao_impressora: 'CAIXA'
    },
    message: 'ATENCAO: REVISAR PEDIDO',
    tenantId: 'tenant-1',
    fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
    logFn: (entry) => logged.push(entry)
  });

  assert.equal(resFail.dispatched, false);
  assert.equal(resFail.error, 'ECONNREFUSED');
  assert.equal(logged[logged.length - 1].direction, 'error');
});
