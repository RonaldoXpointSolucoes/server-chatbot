/**
 * Helpers for GastroFood/GestorPedidosService remote physical receipt alerts
 * (40-column thermal printer messages + order review banners).
 */

export const DEFAULT_AVISO_IMPRESSAO_URL =
  'https://service.xpointsolucoes.com.br:8443/v6/server/nuvem/GestorPedidosService/EnviarMensagemAtendente';

/**
 * Strips accents, em-dashes, non-ASCII characters (emojis) and control chars
 * so 40-column thermal printers never print corrupted glyphs.
 */
export function normalizeThermalPrinterText(text, maxLen = 150) {
  if (text === null || text === undefined) return '';
  let clean = String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (maxLen > 3 && clean.length > maxLen) {
    clean = `${clean.slice(0, maxLen - 3).trim()}...`;
  }
  return clean;
}

/**
 * Extracts key identifiers and summary fields from GastroFood `FinalizeOrder` responses and payload.
 */
export function extractGastrofoodOrderMeta(resData, finalPayload, contactInfo) {
  const res = (resData && typeof resData === 'object') ? resData : {};
  const nested = (res.data && typeof res.data === 'object') ? res.data : {};
  const jsOrder = (finalPayload?.jsOrder && typeof finalPayload.jsOrder === 'object')
    ? finalPayload.jsOrder
    : (finalPayload || {});

  const orderId = String(
    res.id || res.Id || res.idPedido || res.AIdPedido || res.Guid ||
    nested.id || nested.Id || nested.idPedido || ''
  ).trim();

  let orderNumber = String(
    res.CdPedido || res.cdPedido || res.numeroPedido || res.NumeroPedido ||
    res.numeroExibicao || res.displayNumber || res.NumberOrder || res.orderNumber ||
    nested.CdPedido || nested.numeroPedido || ''
  ).replace(/^#/, '').trim();

  if (!orderNumber && typeof res.ARetorno === 'string') {
    const m = res.ARetorno.match(/(?:pedido|ordem)\s*(?:n[º°o]?|#)?\s*[:=]?\s*(\d{2,})/i);
    if (m) orderNumber = m[1];
  }

  const rawCustomer = String(
    jsOrder?.customer?.NomeRazao || jsOrder?.custumer?.NomeRazao || contactInfo?.name || ''
  ).trim();
  const customerName = (rawCustomer && rawCustomer !== 'Cliente' && rawCustomer !== 'Cliente Simulador')
    ? rawCustomer
    : '';

  const totalNum = Number(jsOrder?.total ?? res?.total ?? 0);
  const total = Number.isNaN(totalNum) ? 0 : totalNum;
  const pagto = String(jsOrder?.pagto || '').trim();

  return { orderId, orderNumber, customerName, total, pagto };
}

/**
 * Builds a concise 40-column thermal receipt warning asking staff to review an AI-created order.
 */
export function buildOrderReviewPrinterMessage({ resData, finalPayload, contactInfo }) {
  const { orderNumber, customerName, total, pagto } = extractGastrofoodOrderMeta(resData, finalPayload, contactInfo);

  const numPart = orderNumber ? ` #${orderNumber}` : '';
  const firstCustomer = customerName ? customerName.split(/\s+/)[0].slice(0, 18) : '';
  const totalPart = total > 0 ? `R$ ${total.toFixed(2).replace('.', ',')}` : '';
  const pagtoPart = pagto ? pagto.split(/\s+/)[0] : '';

  const contextTokens = [firstCustomer, [totalPart, pagtoPart].filter(Boolean).join(' ')].filter(Boolean);
  const contextStr = contextTokens.length > 0 ? ` (${contextTokens.join(' - ')})` : '';

  const fullText = `ATENCAO: REVISAR PEDIDO${numPart}${contextStr} - FEITO AUTOMATICAMENTE PELA IA NO WHATSAPP COM O CLIENTE`;
  if (normalizeThermalPrinterText(fullText, 200).length <= 145) {
    return normalizeThermalPrinterText(fullText, 145);
  }

  const compactText = `ATENCAO: REVISAR PEDIDO${numPart}${contextStr} - FEITO PELA IA NO WHATSAPP`;
  return normalizeThermalPrinterText(compactText, 145);
}

/**
 * Builds the `GestorPedidosService/EnviarMensagemAtendente` GET URL when establishment and printer are configured.
 */
export function buildAvisoImpressaoUrl({ companySettings, message }) {
  const estab = String(companySettings?.aviso_impressao_estabelecimento || '').trim();
  const impressora = String(companySettings?.aviso_impressao_impressora || '').trim();
  const msg = String(message || '').trim();

  if (!estab || !impressora || !msg) return null;

  const baseUrl = String(companySettings?.aviso_impressao_url || DEFAULT_AVISO_IMPRESSAO_URL).split('?')[0];
  return `${baseUrl}?e=${encodeURIComponent(estab)}&d=${encodeURIComponent(impressora)}&m=${encodeURIComponent(msg)}`;
}

/**
 * Sends the printer notification asynchronously without ever throwing and breaking order completion.
 */
export async function dispatchAvisoImpressao({
  companySettings,
  message,
  action = 'Aviso Impressao',
  tenantId,
  fetchImpl = fetch,
  logFn = null,
  timeoutMs = 7000
}) {
  const fullUrl = buildAvisoImpressaoUrl({ companySettings, message });
  if (!fullUrl) {
    return { dispatched: false, reason: 'not_configured' };
  }

  if (typeof logFn === 'function') {
    logFn({
      direction: 'request',
      action,
      method: 'GET',
      url: fullUrl,
      payload: {
        estabelecimento: companySettings?.aviso_impressao_estabelecimento,
        impressora: companySettings?.aviso_impressao_impressora,
        mensagem: message
      },
      tenantId
    });
  }

  try {
    const res = await fetchImpl(fullUrl, {
      method: 'GET',
      headers: { Accept: 'application/json, text/plain, */*' },
      signal: AbortSignal.timeout(timeoutMs)
    });

    const rawBody = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
    if (typeof logFn === 'function') {
      logFn({
        direction: res.ok ? 'response' : 'error',
        action,
        method: 'GET',
        url: fullUrl,
        status: res.status,
        response: rawBody || { status: res.status },
        ...(res.ok ? {} : { error: rawBody || `HTTP ${res.status}` }),
        tenantId
      });
    }

    return {
      dispatched: Boolean(res.ok),
      status: res.status,
      url: fullUrl,
      message
    };
  } catch (err) {
    if (typeof logFn === 'function') {
      logFn({
        direction: 'error',
        action,
        method: 'GET',
        url: fullUrl,
        error: err?.message || String(err),
        tenantId
      });
    }
    return {
      dispatched: false,
      error: err?.message || String(err),
      url: fullUrl,
      message
    };
  }
}
