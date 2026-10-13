import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeDispatchQueue, receiptDispatchOptions } from '../src/realtime-publisher/dispatch-queue.js';
import { sendBroadcastHttp } from '../src/realtime-publisher/http-broadcast.js';

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test('1,000 distinct receipts preserve every ID while using at most four HTTP requests', async () => {
  let activeRequests = 0;
  let maximumRequests = 0;
  let canceledBodies = 0;
  let heartbeatTurns = 0;
  const delivered = new Set();
  const heartbeat = setInterval(() => heartbeatTurns++, 1);
  const channel = {
    broadcastEndpointURL: 'https://example.test/realtime/v1/api/broadcast',
    subTopic: 'tenant:test:inbox',
    socket: { apiKey: 'synthetic-key', fetch: async (_url, options) => {
      activeRequests++;
      maximumRequests = Math.max(maximumRequests, activeRequests);
      const message = JSON.parse(options.body).messages[0];
      await new Promise(resolve => setTimeout(resolve, 1));
      delivered.add(message.payload.whatsapp_message_id);
      activeRequests--;
      return { status: 202, body: { cancel: async () => { canceledBodies++; } } };
    } }
  };
  const queue = new RealtimeDispatchQueue({
    dispatch: item => sendBroadcastHttp(channel, item.eventType, item.payload)
  });
  try {
    await Promise.all(Array.from({ length: 1000 }, (_, index) => {
      const item = { eventType: 'message.update', payload: { whatsapp_message_id: `receipt-${index}`, status: 'read' } };
      return queue.enqueue(item, receiptDispatchOptions(channel.subTopic, item.eventType, item.payload));
    }));
    assert.equal(maximumRequests, 4);
    assert.equal(delivered.size, 1000);
    assert.equal(canceledBodies, 1000);
    assert.ok(heartbeatTurns > 10, 'the event loop must remain responsive during a receipt burst');
  } finally { clearInterval(heartbeat); }
});

test('a new message overtakes pending historical receipts', async () => {
  const order = [];
  const releaseRunning = [];
  const queue = new RealtimeDispatchQueue({ dispatch: async item => {
    order.push(item);
    if (order.length <= 4) await new Promise(resolve => releaseRunning.push(resolve));
  } });
  const receipts = Array.from({ length: 30 }, (_, index) => queue.enqueue(`receipt-${index}`, { priority: 'low' }));
  await nextTurn();
  assert.equal(order.length, 4);
  const message = queue.enqueue('new-message');
  for (const release of releaseRunning) release();
  await Promise.all([...receipts, message]);
  assert.equal(order[4], 'new-message');
});

test('pending receipts coalesce by message and channel without downgrading read status', async () => {
  const sent = [];
  const queue = new RealtimeDispatchQueue({ dispatch: async item => { sent.push(item); } });
  const publish = (channelName, id, status, extras = {}) => {
    const item = { channelName, eventType: 'message.update', payload: { whatsapp_message_id: id, status, ...extras } };
    return queue.enqueue(item, receiptDispatchOptions(channelName, item.eventType, item.payload));
  };
  const promises = [];
  for (let index = 0; index < 1000; index++) promises.push(publish('tenant:first', 'same-id', 'SERVER_ACK'));
  promises.push(publish('tenant:first', 'same-id', 'read', { id: 'database-id' }));
  promises.push(publish('tenant:first', 'same-id', 'delivered'));
  promises.push(publish('tenant:first', 'different-id', 'delivered'));
  promises.push(publish('tenant:second', 'same-id', 'SERVER_ACK'));
  await Promise.all(promises);
  assert.equal(sent.length, 3);
  const first = sent.find(item => item.channelName === 'tenant:first' && item.payload.whatsapp_message_id === 'same-id');
  assert.equal(first.payload.status, 'read');
  assert.equal(first.payload.id, 'database-id');
});

test('HTTP failures reject callers and release every dispatch slot', async () => {
  const queue = new RealtimeDispatchQueue({ dispatch: async index => {
    if (index < 4) throw new Error('synthetic failure');
    return index;
  } });
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => queue.enqueue(index)));
  assert.equal(results.filter(result => result.status === 'rejected').length, 4);
  assert.equal(results.at(-1).value, 19);
  await nextTurn();
  assert.equal(queue.active, 0);
});

test('successful broadcast preserves configured credentials and releases the body', async () => {
  let request;
  let canceled = false;
  const channel = {
    broadcastEndpointURL: 'https://example.test/broadcast', subTopic: 'tenant:example', private: true,
    socket: { apiKey: 'synthetic-api-key', accessTokenValue: 'synthetic-access-token', fetch: async (url, options) => {
      request = { url, options };
      return { status: 202, body: { cancel: async () => { canceled = true; } } };
    } }
  };
  await sendBroadcastHttp(channel, 'instance.status', { status: 'connected' });
  assert.equal(request.options.headers.apikey, 'synthetic-api-key');
  assert.equal(request.options.headers.Authorization, 'Bearer synthetic-access-token');
  assert.equal(JSON.parse(request.options.body).messages[0].topic, 'tenant:example');
  assert.equal(JSON.parse(request.options.body).messages[0].private, true);
  assert.equal(canceled, true);
});

test('broadcast timeout aborts the request and rejects promptly', async () => {
  const channel = {
    broadcastEndpointURL: 'https://example.test/broadcast', subTopic: 'tenant:example',
    socket: { fetch: async (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }) }
  };
  await assert.rejects(sendBroadcastHttp(channel, 'message.update', {}, 15), { name: 'AbortError' });
});

test('an HTTP rejection preserves its status and also releases the body', async () => {
  let canceled = false;
  const channel = {
    broadcastEndpointURL: 'https://example.test/broadcast', subTopic: 'tenant:example',
    socket: { fetch: async () => ({
      status: 503, statusText: 'Service Unavailable',
      json: async () => ({ message: 'Synthetic upstream failure' }),
      body: { cancel: async () => { canceled = true; } }
    }) }
  };
  await assert.rejects(sendBroadcastHttp(channel, 'message.update', {}), error =>
    error.status === 503 && error.message === 'Synthetic upstream failure');
  assert.equal(canceled, true);
});
