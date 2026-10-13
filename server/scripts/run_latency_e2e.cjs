const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const env = { ...(fs.existsSync('.env') ? dotenv.parse(fs.readFileSync('.env')) : {}), ...process.env };
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const targetEnv = option('--env', 'alpha');
const dbUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const dbKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!dbUrl || !dbKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured locally');
const db = createClient(dbUrl, dbKey, { auth: { persistSession: false, autoRefreshToken: false } });
const urls = {
  alpha: env.BAILEYS_ALPHA_API_URL || 'https://wh1ss8sy848ufj6zh8t492y7.69.62.92.212.sslip.io',
  production: env.BAILEYS_PRODUCTION_API_URL || 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io'
};
const sourceId = option('--source', 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6');
const receiverId = option('--receiver', '5c78d358-d449-41c4-b396-a04ab20a39e4');
const runId = `E2E-LATENCY-${Date.now()}`;
const results = [];
const observed = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let channel;
const base = instance => urls[String(instance.assigned_node_id).includes('alpha') ? 'alpha' : 'production'];
async function query(table, columns, filters) {
  let q = db.from(table).select(columns);
  for (const [key, value] of Object.entries(filters)) q = q.eq(key, value);
  const { data, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}
async function http(instance, route, options = {}) {
  const response = await fetch(base(instance) + route, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': instance.tenant_id, apikey: instance.api_key, ...options.headers },
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Engine HTTP ${response.status}: ${data.error || 'request failed'}`);
  return data;
}
async function checkSocket(instance) {
  const { telemetry } = await http(instance, '/api/v1/diagnostics/telemetry');
  const socket = telemetry.baileys.instances.find(i => i.instanceId === instance.id);
  if (!socket?.wsOpen || socket.authenticated !== true) throw new Error(`${instance.display_name}: socket not open/authenticated`);
  return { sessions: telemetry.baileys.activeSessionsCount, contexts: telemetry.process.asyncLocalStorageContexts, eventLoop: telemetry.eventLoop };
}
async function sendAndVerify(source, receiver, cycle, direction) {
  await checkSocket(source);
  await checkSocket(receiver);
  const traceId = `${runId}-C${cycle}-${direction}`;
  const text = `[Teste técnico ChatBoot] ${traceId}`;
  const started = Date.now();
  const expectedJid = `${receiver.phone_number}@s.whatsapp.net`;
  const response = await http(source, `/api/v1/instances/${source.id}/invoke`, {
    method: 'POST', headers: { 'x-trace-id': traceId },
    body: JSON.stringify({ method: 'sendMessage', args: [expectedJid, { text }] })
  });
  const apiMs = Date.now() - started;
  const key = response.result?.key || response.key;
  if (!key?.id || key.id.startsWith('EDGE_') || key.fromMe !== true || key.remoteJid !== expectedJid) {
    throw new Error(`${traceId}: API did not return the expected official WhatsApp key`);
  }
  const deadline = Date.now() + 60000;
  let lastState;
  while (Date.now() < deadline) {
    const [inbound, saved] = await Promise.all([
      query('wa_incoming_messages', 'instance_id,message_id,from_me,body,created_at', { instance_id: receiver.id, message_id: key.id, from_me: false }),
      query('messages', 'id,instance_id,direction,whatsapp_message_id,text_content,conversation_id,status', { whatsapp_message_id: key.id })
    ]);
    const events = await http(receiver, '/api/v1/diagnostics/events?limit=100');
    const socketEvent = events.events.find(e => e.event === 'BAILEYS_MESSAGES_UPSERT' && e.instanceId === receiver.id && e.whatsappMessageId === key.id && e.direction === 'inbound' && e.details?.fromMe === false);
    const sourceEvents = base(source) === base(receiver) ? events : await http(source, '/api/v1/diagnostics/events?limit=100');
    const receipt = sourceEvents.events.find(e => e.event === 'BAILEYS_MESSAGE_RECEIPT' && e.instanceId === source.id && e.whatsappMessageId === key.id && ['delivered', 'read'].includes(e.details?.status));
    const outbound = saved.filter(m => m.instance_id === source.id && m.direction === 'outbound' && m.text_content === text);
    const incoming = saved.filter(m => m.instance_id === receiver.id && m.direction === 'inbound' && m.text_content === text);
    const realtime = observed.get(`${receiver.id}:${key.id}`);
    lastState = { rawInbound: inbound.length, socketEvent: !!socketEvent, outbound: outbound.length, incoming: incoming.length, realtime: !!realtime, receipt: !!receipt };
    if (inbound.length === 1 && inbound[0].body === text && socketEvent && outbound.length === 1 && incoming.length === 1 && realtime && receipt) {
      const result = {
        traceId, cycle, direction, source: source.id, receiver: receiver.id,
        messageId: key.id, remoteJid: key.remoteJid, fromMe: key.fromMe,
        apiMs, inboundMs: realtime - started, verifiedMs: Date.now() - started,
        outbound: true, inbound: true, socketReceived: true, realtimeReceived: true,
        realWhatsAppValidated: true, receiptSource: receipt.details.source,
        conversations: [outbound[0].conversation_id, incoming[0].conversation_id], frontendValidated: false
      };
      results.push(result);
      console.log(JSON.stringify(result));
      return;
    }
    await sleep(400);
  }
  throw new Error(`${traceId}: timeout for ${key.id}: ${JSON.stringify(lastState)}`);
}
async function run() {
  const instances = await query('whatsapp_instances', 'id,tenant_id,display_name,phone_number,status,assigned_node_id,api_key', {});
  const source = instances.find(i => i.id === sourceId);
  const receiver = instances.find(i => i.id === receiverId);
  if (!source || !receiver || source.id === receiver.id || source.tenant_id !== receiver.tenant_id) throw new Error('Invalid test inbox pair');
  if ((targetEnv === 'alpha') !== String(source.assigned_node_id).includes('alpha')) throw new Error('Test source belongs to the wrong environment');
  console.log(JSON.stringify({ runId, environment: targetEnv, health: await checkSocket(source) }));
  channel = db.channel(`tenant:${source.tenant_id}:inbox`).on('broadcast', { event: 'message.new' }, ({ payload }) => {
    const msg = payload?.message || payload;
    const id = msg.whatsapp_message_id || msg.whatsapp_id;
    const instance = msg.instance_id || payload?.instance_id;
    if (id && instance) observed.set(`${instance}:${id}`, Date.now());
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timeout')), 15000);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) { clearTimeout(timer); reject(new Error(`Realtime: ${status}`)); }
    });
  });
  for (let cycle = 1; cycle <= 3; cycle++) {
    await sendAndVerify(source, receiver, cycle, 'A-B');
    await sleep(2000);
    await sendAndVerify(receiver, source, cycle, 'B-A');
    await sleep(2000);
  }
  console.log(JSON.stringify({ result: '3 real bidirectional cycles passed', finalHealth: await checkSocket(source) }));
}
run().catch(error => {
  console.error(JSON.stringify({ result: 'FAILED', error: error.message }));
  process.exitCode = 1;
}).finally(async () => {
  const report = option('--report', path.join('.local', 'latency', `${runId}-${targetEnv}.json`));
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, JSON.stringify({ runId, environment: targetEnv, passed: results.length === 6 && !process.exitCode, results }, null, 2));
  if (channel) await db.removeChannel(channel);
});
