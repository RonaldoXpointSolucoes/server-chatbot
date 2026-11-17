/**
 * Retorna true quando o navegador reporta explicitamente que está sem conexão.
 */
export function isOfflineBrowser() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Identifica erros de cancelamento ou expiração de timeout em chamadas fetch.
 */
export function isAbortOrTimeoutError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return err.name === 'AbortError' || err.name === 'TimeoutError' || msg.includes('aborted');
}

/**
 * Identifica falhas transitórias de transporte/rede do navegador (ex: TypeError: Failed to fetch).
 */
export function isNetworkFetchError(err) {
  if (!err || isAbortOrTimeoutError(err)) return false;
  const msg = String(err.message || '');
  return (
    err.name === 'TypeError' &&
    (msg === 'Failed to fetch' || msg.includes('fetch') || msg.includes('NetworkError') || msg.includes('Load failed'))
  );
}

/**
 * Define a política de retentativas e Circuit Breaker do customFetch Supabase por tipo de requisição.
 * Escritas no Storage e chamadas com navegador offline não devem gerar loops longos nem abrir o breaker do banco.
 */
export function resolveSupabaseRetryPolicy({
  url,
  method = 'GET',
  requestedRetries = 5,
  isOffline = isOfflineBrowser(),
  signalAborted = false
}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const isStorageObjectWrite =
    typeof url === 'string' &&
    url.includes('/storage/v1/object/') &&
    normalizedMethod !== 'GET' &&
    normalizedMethod !== 'HEAD';

  if (isOffline || signalAborted) {
    return {
      maxRetries: 0,
      isStorageObjectWrite,
      shouldBypassBreaker: true,
      shouldEmitCloudWarning: false
    };
  }

  if (isStorageObjectWrite) {
    return {
      maxRetries: Math.min(requestedRetries, 1),
      isStorageObjectWrite: true,
      shouldBypassBreaker: true,
      shouldEmitCloudWarning: false
    };
  }

  return {
    maxRetries: requestedRetries,
    isStorageObjectWrite: false,
    shouldBypassBreaker: false,
    shouldEmitCloudWarning: true
  };
}

/**
 * Classifica falhas finais de upload para escolher mensagem amigável ao usuário e severidade de log adequada.
 */
export function classifyUploadFailure(err, { isOffline = isOfflineBrowser() } = {}) {
  const msg = String(err?.message || '');

  if (isOffline || err?.code === 'OFFLINE') {
    return {
      kind: 'offline',
      logLevel: 'warn',
      userMessage: 'Sem conexão com a internet. Verifique seu Wi-Fi ou rede e tente enviar o arquivo novamente.'
    };
  }

  if (
    err?.name === 'NotReadableError' ||
    err?.code === 'FILE_UNREADABLE' ||
    msg.includes('UPLOAD_FILE_CHANGED')
  ) {
    return {
      kind: 'file_unreadable',
      logLevel: 'warn',
      userMessage: 'O arquivo selecionado foi alterado, movido ou não pôde ser lido pelo navegador. Selecione-o novamente.'
    };
  }

  if (isAbortOrTimeoutError(err)) {
    return {
      kind: 'timeout',
      logLevel: 'warn',
      userMessage: 'Tempo limite esgotado ao enviar o arquivo. Verifique sua conexão e tente novamente.'
    };
  }

  if (isNetworkFetchError(err)) {
    return {
      kind: 'network',
      logLevel: 'warn',
      userMessage: 'Falha temporária de conexão ao enviar o arquivo (rede instável ou arquivo excedeu o limite do servidor). Tente novamente em instantes.'
    };
  }

  return {
    kind: 'server',
    logLevel: 'error',
    userMessage: `Falha ao enviar arquivo para o WhatsApp: ${msg || 'Erro desconhecido'}`
  };
}

/**
 * Verifica rapidamente os primeiros bytes do arquivo para detectar arquivos movidos/removidos antes de subir para a rede.
 */
export async function probeFileReadable(file) {
  if (!file || typeof file.slice !== 'function' || typeof file.size !== 'number') {
    return;
  }
  if (file.size === 0) {
    return;
  }
  try {
    const chunk = file.slice(0, Math.min(file.size, 64));
    if (typeof chunk.arrayBuffer === 'function') {
      await chunk.arrayBuffer();
    }
  } catch (readErr) {
    const err = new Error('O arquivo não pôde ser lido pelo navegador (ERR_UPLOAD_FILE_CHANGED).');
    err.name = 'NotReadableError';
    err.code = 'FILE_UNREADABLE';
    err.cause = readErr;
    throw err;
  }
}

/**
 * Executa upload multipart reconstruindo um FormData novo em eventual retentativa de falha transitória de rede.
 */
export async function sendMultipartWithRetry({
  url,
  headers,
  buildFormData,
  timeoutMs = 45000,
  maxRetries = 1,
  retryDelayMs = 600,
  fetchFn = fetch,
  isOfflineFn = isOfflineBrowser,
  waitFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}) {
  if (isOfflineFn()) {
    const offlineErr = new Error('Sem conexão com a internet.');
    offlineErr.name = 'NetworkOfflineError';
    offlineErr.code = 'OFFLINE';
    throw offlineErr;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

    try {
      return await fetchFn(url, {
        method: 'POST',
        headers,
        body: buildFormData(),
        ...(controller ? { signal: controller.signal } : {})
      });
    } catch (err) {
      const canRetry = attempt < maxRetries && !isOfflineFn() && isNetworkFetchError(err);
      if (!canRetry) {
        throw err;
      }
      await waitFn(retryDelayMs);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}

/**
 * Processa fila sequencial de arquivos com snapshot imutável e captura segura por item, evitando unhandledrejection.
 */
export async function runFileUploadQueue(files, handler, { onError, onFinally } = {}) {
  const snapshot = Array.from(files || []);
  try {
    for (let i = 0; i < snapshot.length; i++) {
      const file = snapshot[i];
      try {
        await handler(file, i);
      } catch (err) {
        if (typeof onError === 'function') {
          onError(err, file, i);
        }
      }
    }
  } finally {
    if (typeof onFinally === 'function') {
      onFinally();
    }
  }
}
