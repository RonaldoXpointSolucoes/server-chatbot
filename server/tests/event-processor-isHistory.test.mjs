import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventProcessor } from '../src/event-processor/index.js';
import { supabase } from '../src/supabase.js';
import realtime from '../src/realtime-publisher/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const eventProcessorSource = fs.readFileSync(
  path.resolve(__dirname, '../src/event-processor/index.js'),
  'utf8'
);

const TEST_TENANT = '00000000-0000-0000-0000-000000000010';
const TEST_INSTANCE = '00000000-0000-0000-0000-000000000020';

function mockSupabaseForUnitTests(t, overrides = {}) {
  const updatedPayloads = [];
  const emittedBroadcasts = [];

  t.mock.method(realtime, 'publishInboxEvent', async (tenantId, eventType, payload) => {
    emittedBroadcasts.push({ tenantId, eventType, payload });
    return { ok: true };
  });

  t.mock.method(supabase, 'from', (table) => {
    if (overrides[table]) return overrides[table]();
    const chain = {
      select: () => chain,
      upsert: () => chain,
      insert: () => chain,
      update: (vals) => {
        updatedPayloads.push({ table, vals });
        return chain;
      },
      in: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null })
    };
    return chain;
  });

  return { updatedPayloads, emittedBroadcasts };
}

function createTestableProcessor() {
  const ep = new EventProcessor({ startBackgroundLoops: false });
  ep.resolveInstanceTenantId = async (_instId, tid) => tid || TEST_TENANT;
  ep.getTenantConfig = async () => ({ ignore_groups: true });
  ep.getInstanceConfig = async () => ({ enabled_groups: [] });
  ep.resolveLidToPhone = async (_instId, jid) => jid;
  // Prevent background setImmediate(flushQueue) from racing past test cleanup into network calls
  ep.flushQueue = async () => {};
  return ep;
}

test('handleMessageUpsert enqueues live fromMe message without cache hit and sets operator_source=whatsapp_device', async (t) => {
  mockSupabaseForUnitTests(t);
  const ep = createTestableProcessor();
  const loggedErrors = [];
  t.mock.method(console, 'error', (...args) => loggedErrors.push(args.map(String).join(' ')));

  const msgId = `TEST_LIVE_${Date.now()}`;
  const rawMsg = {
    key: { id: msgId, fromMe: true, remoteJid: '5511992144843@s.whatsapp.net' },
    message: { conversation: 'Mensagem enviada direto do celular' },
    messageTimestamp: Math.floor(Date.now() / 1000)
  };

  await ep.handleMessageUpsert(TEST_TENANT, TEST_INSTANCE, { user: { id: '5511943216659:1@s.whatsapp.net' } }, {
    type: 'notify',
    messages: [rawMsg]
  });

  assert.equal(loggedErrors.length, 0, `Unexpected console.error: ${loggedErrors.join(' | ')}`);
  assert.equal(ep.messageQueue.length, 1, 'live fromMe message must be enqueued instead of dropped');
  assert.equal(ep.messageQueue[0].isHistory, false);
  assert.equal(ep.messageQueue[0].rawMsg.operator_source, 'whatsapp_device');
  assert.equal(ep.messageQueue[0].senderType, 'human');
});

test('handleMessageUpsert marks historical fromMe append sync with isHistory=true without whatsapp_device tag', async (t) => {
  mockSupabaseForUnitTests(t);
  const ep = createTestableProcessor();
  const loggedErrors = [];
  t.mock.method(console, 'error', (...args) => loggedErrors.push(args.map(String).join(' ')));

  const msgId = `TEST_HIST_${Date.now()}`;
  const rawMsg = {
    key: { id: msgId, fromMe: true, remoteJid: '5511992144843@s.whatsapp.net' },
    message: { conversation: 'Historico antigo' },
    messageTimestamp: Math.floor((Date.now() - 5 * 60 * 1000) / 1000)
  };

  await ep.handleMessageUpsert(TEST_TENANT, TEST_INSTANCE, { user: { id: '5511943216659:1@s.whatsapp.net' } }, {
    type: 'append',
    messages: [rawMsg]
  });

  assert.equal(loggedErrors.length, 0, `Unexpected console.error: ${loggedErrors.join(' | ')}`);
  assert.equal(ep.messageQueue.length, 1, 'historical fromMe message must be enqueued cleanly');
  assert.equal(ep.messageQueue[0].isHistory, true);
  assert.equal(ep.messageQueue[0].rawMsg.operator_source, undefined);
});

test('out-of-order SERVER_ACK arriving after delivered must NOT downgrade statusUpdateQueue, pendingStatuses, or realtime broadcast', async (t) => {
  const { emittedBroadcasts } = mockSupabaseForUnitTests(t);
  const ep = createTestableProcessor();
  const msgId = `3EB0_OUT_OF_ORDER_${Date.now()}`;

  // 1) delivered (status = 3) arrives first (~550ms)
  await ep.handleMessagesUpdate(TEST_TENANT, TEST_INSTANCE, {}, [
    { key: { id: msgId, fromMe: true, remoteJid: '5511992144843@s.whatsapp.net' }, update: { status: 3 } }
  ]);
  // 2) SERVER_ACK (status = 2) arrives 364ms later (~916ms)
  await ep.handleMessagesUpdate(TEST_TENANT, TEST_INSTANCE, {}, [
    { key: { id: msgId, fromMe: true, remoteJid: '5511992144843@s.whatsapp.net' }, update: { status: 2 } }
  ]);

  assert.equal(ep.pendingStatuses.get(msgId)?.status, 'delivered');
  assert.equal(
    ep.statusUpdateQueue.get(msgId)?.status,
    'delivered',
    'queued DB update must remain delivered when late SERVER_ACK arrives'
  );
  assert.deepEqual(
    emittedBroadcasts.map((b) => b.payload.status),
    ['delivered'],
    'must not broadcast regressive SERVER_ACK after delivered'
  );

  // Direct queueStatusUpdate regression guard
  const msgId2 = `DIRECT_QUEUE_${Date.now()}`;
  ep.queueStatusUpdate(TEST_TENANT, TEST_INSTANCE, msgId2, 'read');
  ep.queueStatusUpdate(TEST_TENANT, TEST_INSTANCE, msgId2, 'delivered');
  ep.queueStatusUpdate(TEST_TENANT, TEST_INSTANCE, msgId2, 'SERVER_ACK');
  assert.equal(ep.statusUpdateQueue.get(msgId2)?.status, 'read');
});

test('flushStatusQueue skips updating or broadcasting played/read/delivered rows to lower status', async (t) => {
  const dbRows = [
    { id: 'row-played', whatsapp_message_id: 'WA_PLAYED', status: 'played', tenant_id: TEST_TENANT },
    { id: 'row-deliv', whatsapp_message_id: 'WA_DELIV', status: 'delivered', tenant_id: TEST_TENANT },
    { id: 'row-sent', whatsapp_message_id: 'WA_SENT', status: 'sent', tenant_id: TEST_TENANT }
  ];
  const { updatedPayloads, emittedBroadcasts } = mockSupabaseForUnitTests(t, {
    messages: () => {
      const chain = {
        select: () => chain,
        in: (_col, vals) => {
          chain._inVals = vals;
          return chain;
        },
        update: (vals) => {
          updatedPayloads.push({ table: 'messages', vals });
          return chain;
        },
        then: (resolve) => {
          const matched = dbRows.filter((r) => !chain._inVals || chain._inVals.includes(r.whatsapp_message_id) || chain._inVals.includes(r.id));
          return resolve({ data: matched, error: null });
        }
      };
      return chain;
    }
  });

  const ep = createTestableProcessor();
  ep.statusUpdateQueue.set('WA_PLAYED', { tenantId: TEST_TENANT, instanceId: TEST_INSTANCE, status: 'read', timestamp: Date.now() - 1000 });
  ep.statusUpdateQueue.set('WA_DELIV', { tenantId: TEST_TENANT, instanceId: TEST_INSTANCE, status: 'SERVER_ACK', timestamp: Date.now() - 1000 });
  ep.statusUpdateQueue.set('WA_SENT', { tenantId: TEST_TENANT, instanceId: TEST_INSTANCE, status: 'SERVER_ACK', timestamp: Date.now() - 1000 });

  await ep.flushStatusQueue();

  assert.equal(updatedPayloads.length, 1);
  assert.equal(updatedPayloads[0].vals.status, 'SERVER_ACK');
  assert.deepEqual(emittedBroadcasts.map((b) => b.payload.id), ['row-sent']);
});

test('event-processor/index.js has no undefined sock in flushQueue or undefined sessionManager in handleMessagingHistorySet', () => {
  assert.doesNotMatch(
    eventProcessorSource,
    /\btypeof\s+sock\?\.\s*updateMediaMessage|\bawait\s+sock\.updateMediaMessage\(/,
    'flushQueue must use b.sock instead of out-of-scope sock'
  );
  assert.match(
    eventProcessorSource,
    /b\.sock\?\.\s*updateMediaMessage/,
    'flushQueue media re-upload recovery must reference b.sock'
  );
  assert.doesNotMatch(
    eventProcessorSource,
    /^\s*sessionManager\.closeSession\(/m,
    'handleMessagingHistorySet must not reference unimported module-level sessionManager directly without dynamic import'
  );
});
