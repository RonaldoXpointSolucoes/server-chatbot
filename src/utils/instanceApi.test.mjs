import assert from 'node:assert/strict';
import test from 'node:test';
import { ALPHA_API_URL, PRODUCTION_API_URL, apiTestOutcome, instanceApiEndpoint, instanceApiSnippet, instanceApiUrl, redactApiResponse } from './instanceApi.mjs';

const food = { id: 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6' };
const client = { id: 'cliente-id', assigned_node_id: 'production-worker' };

test('a URL respeita o worker e reconhece as caixas Alpha sem assigned_node_id', () => {
  assert.equal(instanceApiUrl(food), ALPHA_API_URL);
  assert.equal(instanceApiUrl({ id: 'another', assigned_node_id: 'alpha-worker' }), ALPHA_API_URL);
  assert.equal(instanceApiUrl(client), PRODUCTION_API_URL);
  assert.equal(instanceApiUrl(client, 'https://api.example.test///'), 'https://api.example.test');
});

test('mídia autentica pela instância na URL mesmo antes de processar multipart', () => {
  assert.equal(instanceApiEndpoint(food, 'media'), `${ALPHA_API_URL}/message/sendMedia/${food.id}`);
  const code = instanceApiSnippet({ instance: food, kind: 'media' });
  assert.ok(code.includes(`/message/sendMedia/${food.id}`));
  assert.ok(code.includes('--form-string'));
  assert.ok(!code.includes('Content-Type'));
  assert.ok(!code.includes('masterkey'));
  assert.ok(!code.includes('x-tenant-id'));
});

test('o exemplo Node.js de mídia usa arquivo do Node e boundary automático', () => {
  const code = instanceApiSnippet({ instance: client, kind: 'media', language: 'node' });
  assert.ok(code.includes("import { openAsBlob } from 'node:fs'"));
  assert.ok(code.includes('new FormData()'));
  assert.ok(!code.includes('fileInput'));
  assert.ok(!code.includes('Content-Type'));
});

test('o exemplo texto usa UUID e chave apenas no cabeçalho público', () => {
  const code = instanceApiSnippet({ instance: food, apiKey: 'fake-key', language: 'node' });
  assert.ok(code.includes(`"instance": "${food.id}"`));
  assert.ok(code.includes('apikey: "fake-key"'));
  assert.ok(code.includes("'Content-Type': 'application/json'"));
  assert.ok(!code.includes('Authorization'));
  assert.ok(!code.includes('masterkey'));
});

test('fila 202 não é entrega e PENDING com ID confirma só aceitação', () => {
  assert.equal(apiTestOutcome(202, { queue_id: 'queue123', status: 'PENDING' }).state, 'queued');
  const accepted = apiTestOutcome(200, { key: { id: 'official123' }, status: 'PENDING' });
  assert.equal(accepted.state, 'accepted');
  assert.equal(accepted.messageId, 'official123');
  assert.ok(accepted.message.includes('A confirmação de entrega depende do destinatário'));
  assert.equal(apiTestOutcome(200, {}).state, 'unconfirmed');
  assert.equal(apiTestOutcome(401, { error: 'Unauthorized' }).state, 'error');
});

test('respostas não expõem credenciais por campo ou texto de erro', () => {
  const output = redactApiResponse({ api_key: 'fake-key', nested: { token: 'fake-token' }, error: 'Rejected fake-key', key: { id: 'message-id' } }, 'fake-key');
  assert.ok(!output.includes('fake-key'));
  assert.ok(!output.includes('fake-token'));
  assert.ok(output.includes('message-id'));
});
