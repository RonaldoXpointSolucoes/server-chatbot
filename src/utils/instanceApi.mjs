export const PRODUCTION_API_URL = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';
export const ALPHA_API_URL = 'https://wh1ss8sy848ufj6zh8t492y7.69.62.92.212.sslip.io';

export function instanceApiUrl(instance, productionUrl = PRODUCTION_API_URL) {
  const assignedNode = String(instance.assigned_node_id || '').toLowerCase();
  const alphaInstance = ['cc4efe36-f391-4b3d-a24c-ddcd8a293cf6', '5c78d358-d449-41c4-b396-a04ab20a39e4'].includes(instance.id);
  return (assignedNode.includes('alpha') || assignedNode.includes('staging') || alphaInstance
    ? ALPHA_API_URL : productionUrl || PRODUCTION_API_URL).replace(/\/+$/, '');
}

export function instanceApiEndpoint(instance, kind = 'text', productionUrl) {
  const base = instanceApiUrl(instance, productionUrl);
  // Multipart fields are parsed after authentication on older servers.
  return kind === 'media' ? `${base}/message/sendMedia/${encodeURIComponent(instance.id)}` : `${base}/message/sendText`;
}

const shellQuote = value => `'${String(value).replace(/'/g, `'"'"'`)}'`;

export function instanceApiSnippet({ instance, kind = 'text', language = 'curl', apiKey = 'SUA_CHAVE_DA_INSTANCIA', number = '5511975960999', text = 'Olá! Teste de envio pela API externa.', mediatype = 'image', productionUrl }) {
  const endpoint = instanceApiEndpoint(instance, kind, productionUrl);
  const [filename, mime] = ({ image: ['arquivo.png', 'image/png'], video: ['arquivo.mp4', 'video/mp4'], audio: ['arquivo.ogg', 'audio/ogg'], document: ['arquivo.pdf', 'application/pdf'] })[mediatype] || ['arquivo.bin', 'application/octet-stream'];
  if (language === 'curl') {
    const lines = ['curl --request POST', `  --url ${shellQuote(endpoint)}`, `  --header ${shellQuote(`apikey: ${apiKey}`)}`];
    if (kind === 'media') {
      lines.push(`  --form-string ${shellQuote(`number=${number}`)}`, `  --form-string ${shellQuote(`instance=${instance.id}`)}`, `  --form-string ${shellQuote(`mediatype=${mediatype}`)}`, `  --form-string ${shellQuote(`caption=${text}`)}`, `  --form ${shellQuote(`file=@/caminho/para/${filename}`)}`);
    } else {
      lines.push(`  --header ${shellQuote('Content-Type: application/json')}`, `  --data ${shellQuote(JSON.stringify({ number, text, instance: instance.id }, null, 2))}`);
    }
    return lines.join(' \\\n');
  }
  const keyLiteral = JSON.stringify(apiKey);
  const endpointLiteral = JSON.stringify(endpoint);
  const body = kind === 'media'
    ? `import { openAsBlob } from 'node:fs';\n\nconst form = new FormData();\nform.append('number', ${JSON.stringify(number)});\nform.append('instance', ${JSON.stringify(instance.id)});\nform.append('mediatype', ${JSON.stringify(mediatype)});\nform.append('caption', ${JSON.stringify(text)});\nform.append('file', await openAsBlob(${JSON.stringify(`./${filename}`)}, { type: ${JSON.stringify(mime)} }), ${JSON.stringify(filename)});\n`
    : `const body = ${JSON.stringify({ number, text, instance: instance.id }, null, 2)};\n`;
  return `${body}\nconst response = await fetch(${endpointLiteral}, {\n  method: 'POST',\n  headers: { apikey: ${keyLiteral}${kind === 'text' ? ", 'Content-Type': 'application/json'" : ''} },\n  body: ${kind === 'media' ? 'form' : 'JSON.stringify(body)'}\n});\nconst result = await response.json();\nif (!response.ok) throw new Error(result.error || result.message || \`HTTP \${response.status}\`);\nconsole.log({ http: response.status, messageId: result.key?.id, status: result.status, queueId: result.queue_id });\n// HTTP 202 indica fila; um ID de envio ainda não confirma a entrega no celular.`;
}

export function apiTestOutcome(httpStatus, payload = {}) {
  payload = payload && typeof payload === 'object' ? payload : {};
  const queued = httpStatus === 202 || payload.code === 'MESSAGE_QUEUED' || Boolean(payload.queue_id);
  const messageId = payload.key?.id || payload.whatsapp_message_id || payload.messageId || null;
  if (httpStatus < 200 || httpStatus >= 300 || payload.error) {
    return { state: 'error', messageId, message: payload.error || payload.message || `O servidor respondeu HTTP ${httpStatus}.` };
  }
  if (queued) return { state: 'queued', messageId: null, message: 'Mensagem na fila. O envio e a entrega ainda não foram confirmados.' };
  if (messageId) return { state: 'accepted', messageId, message: 'Envio aceito pelo WhatsApp com ID oficial. A confirmação de entrega depende do destinatário.' };
  return { state: 'unconfirmed', messageId: null, message: 'O servidor respondeu, mas não retornou um ID oficial de mensagem. Envio não confirmado.' };
}

export function redactApiResponse(value, apiKey) {
  return JSON.stringify(value, (key, item) => /apikey|api_key|token|secret|credential|authorization/i.test(key) ? '[oculto]' : item, 2)
    .replaceAll(apiKey || '\u0000', '[oculto]');
}
