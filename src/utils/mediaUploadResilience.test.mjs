import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyUploadFailure,
  isNetworkFetchError,
  probeFileReadable,
  resolveSupabaseRetryPolicy,
  runFileUploadQueue,
  sendMultipartWithRetry
} from './mediaUploadResilience.mjs';

test('resolveSupabaseRetryPolicy corta retentativas quando offline ou sinal abortado', () => {
  const offlineRest = resolveSupabaseRetryPolicy({
    url: 'https://yzbxsxabzncdzuxvlppt.supabase.co/rest/v1/contacts',
    method: 'GET',
    requestedRetries: 5,
    isOffline: true,
    signalAborted: false
  });
  assert.deepEqual(offlineRest, {
    maxRetries: 0,
    isStorageObjectWrite: false,
    shouldBypassBreaker: true,
    shouldEmitCloudWarning: false
  });

  const abortedReq = resolveSupabaseRetryPolicy({
    url: 'https://yzbxsxabzncdzuxvlppt.supabase.co/rest/v1/contacts',
    method: 'POST',
    requestedRetries: 5,
    isOffline: false,
    signalAborted: true
  });
  assert.equal(abortedReq.maxRetries, 0);
  assert.equal(abortedReq.shouldBypassBreaker, true);
  assert.equal(abortedReq.shouldEmitCloudWarning, false);
});

test('resolveSupabaseRetryPolicy limita POST de upload no Storage a 1 tentativa e protege o circuit breaker', () => {
  const storageUpload = resolveSupabaseRetryPolicy({
    url: 'https://yzbxsxabzncdzuxvlppt.supabase.co/storage/v1/object/chat_media/tenant_1/file.png',
    method: 'POST',
    requestedRetries: 5,
    isOffline: false,
    signalAborted: false
  });
  assert.equal(storageUpload.isStorageObjectWrite, true);
  assert.equal(storageUpload.maxRetries, 1);
  assert.equal(storageUpload.shouldBypassBreaker, true);
  assert.equal(storageUpload.shouldEmitCloudWarning, false);

  const storageDownload = resolveSupabaseRetryPolicy({
    url: 'https://yzbxsxabzncdzuxvlppt.supabase.co/storage/v1/object/chat_media/tenant_1/file.png',
    method: 'GET',
    requestedRetries: 5,
    isOffline: false,
    signalAborted: false
  });
  assert.equal(storageDownload.isStorageObjectWrite, false);
  assert.equal(storageDownload.maxRetries, 5);
  assert.equal(storageDownload.shouldBypassBreaker, false);
  assert.equal(storageDownload.shouldEmitCloudWarning, true);
});

test('isNetworkFetchError identifica TypeError Failed to fetch e variações de rede do browser', () => {
  assert.equal(isNetworkFetchError(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkFetchError(new TypeError('NetworkError when attempting to fetch resource.')), true);
  assert.equal(isNetworkFetchError(new TypeError('Load failed')), true);
  assert.equal(isNetworkFetchError(new Error('HTTP 500 Internal Server Error')), false);
  const abortErr = new Error('The user aborted a request.');
  abortErr.name = 'AbortError';
  assert.equal(isNetworkFetchError(abortErr), false);
});

test('classifyUploadFailure classifica offline, arquivo ilegível, timeout, rede e erro de servidor corretamente', () => {
  const offline = classifyUploadFailure(new TypeError('Failed to fetch'), { isOffline: true });
  assert.equal(offline.kind, 'offline');
  assert.equal(offline.logLevel, 'warn');
  assert.match(offline.userMessage, /Sem conexão com a internet/i);

  const fileChanged = classifyUploadFailure(Object.assign(new Error('ERR_UPLOAD_FILE_CHANGED'), { name: 'NotReadableError' }), { isOffline: false });
  assert.equal(fileChanged.kind, 'file_unreadable');
  assert.equal(fileChanged.logLevel, 'warn');
  assert.match(fileChanged.userMessage, /Selecione-o novamente/i);

  const timeout = classifyUploadFailure(Object.assign(new Error('Timeout'), { name: 'AbortError' }), { isOffline: false });
  assert.equal(timeout.kind, 'timeout');
  assert.equal(timeout.logLevel, 'warn');

  const net = classifyUploadFailure(new TypeError('Failed to fetch'), { isOffline: false });
  assert.equal(net.kind, 'network');
  assert.equal(net.logLevel, 'warn');
  assert.match(net.userMessage, /conexão/i);

  const server = classifyUploadFailure(new Error('Unsupported MIME type'), { isOffline: false });
  assert.equal(server.kind, 'server');
  assert.equal(server.logLevel, 'error');
  assert.match(server.userMessage, /Unsupported MIME type/);
});

test('probeFileReadable valida leitura real e rejeita arquivo movido ou ilegível', async () => {
  const validBlob = new Blob(['ok'], { type: 'text/plain' });
  await probeFileReadable(validBlob);

  const emptyBlob = new Blob([], { type: 'text/plain' });
  await probeFileReadable(emptyBlob);

  const brokenFile = {
    size: 128,
    slice() {
      return {
        async arrayBuffer() {
          const e = new Error('The requested file could not be read');
          e.name = 'NotReadableError';
          throw e;
        }
      };
    }
  };
  await assert.rejects(() => probeFileReadable(brokenFile), (err) => err.name === 'NotReadableError' && err.code === 'FILE_UNREADABLE');
});

test('sendMultipartWithRetry aborta sem chamar fetch quando offline', async () => {
  let fetchCalled = 0;
  await assert.rejects(
    () => sendMultipartWithRetry({
      url: 'https://api.example.test/send-media',
      headers: { apikey: 'k' },
      buildFormData: () => ({ id: 1 }),
      fetchFn: async () => {
        fetchCalled += 1;
        return new Response('{}', { status: 200 });
      },
      isOfflineFn: () => true,
      waitFn: async () => {}
    }),
    (err) => err.code === 'OFFLINE'
  );
  assert.equal(fetchCalled, 0);
});

test('sendMultipartWithRetry reconstrói novo FormData na retentativa após Failed to fetch transitório', async () => {
  const builtBodies = [];
  let attempt = 0;

  const res = await sendMultipartWithRetry({
    url: 'https://api.example.test/send-media',
    headers: { apikey: 'k' },
    buildFormData: () => {
      const token = { attemptMarker: builtBodies.length + 1 };
      builtBodies.push(token);
      return token;
    },
    fetchFn: async (_url, init) => {
      attempt += 1;
      if (attempt === 1) {
        throw new TypeError('Failed to fetch');
      }
      assert.notEqual(init.body, builtBodies[0]);
      assert.equal(init.body, builtBodies[1]);
      return new Response('{"ok":true}', { status: 200 });
    },
    isOfflineFn: () => false,
    waitFn: async () => {}
  });

  assert.equal(res.status, 200);
  assert.equal(attempt, 2);
  assert.equal(builtBodies.length, 2);
});

test('runFileUploadQueue congela FileList, captura rejeições sem unhandledrejection e executa finally', async () => {
  const liveArray = [{ name: 'um.png' }, { name: 'dois.png' }];
  const processed = [];
  const caught = [];
  let finallyCalled = false;

  await runFileUploadQueue(liveArray, async (file, index) => {
    // Simula input sendo limpo no meio da fila
    if (index === 0) {
      liveArray.length = 0;
      throw new TypeError('Failed to fetch');
    }
    processed.push(file.name);
  }, {
    onError: (err, file) => caught.push({ msg: err.message, name: file.name }),
    onFinally: () => { finallyCalled = true; }
  });

  assert.deepEqual(caught, [{ msg: 'Failed to fetch', name: 'um.png' }]);
  assert.deepEqual(processed, ['dois.png']);
  assert.equal(finallyCalled, true);
});
