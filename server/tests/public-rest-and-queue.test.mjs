import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createExternalMessageRouting } from '../src/api-gateway/external-message-routing.js';
import {
    extractPublicApiKey,
    isSafeExternalMediaUrl,
    matchesInstanceIdentifier,
    parseCoordinate
} from '../src/api-gateway/public-rest-helpers.js';
import { classifyOutboxMessage, resolveOutboxMediaSpec } from '../src/session-manager/outbox-classifier.js';
import { createPublicRestRouter } from '../src/api-gateway/public-rest.js';
import queueProcessor from '../src/session-manager/queue-processor.js';
import { EventProcessor } from '../src/event-processor/index.js';

const FOOD_NEXT_ID = 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6';
const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const INST_A = 'aaaa1111-1111-4111-8111-111111111111';
const INST_B = 'bbbb2222-2222-4222-8222-222222222222';

async function listen(t, app) {
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        server.closeAllConnections();
        return new Promise(resolve => server.close(resolve));
    });
    return `http://127.0.0.1:${server.address().port}`;
}

function createRestSupabaseMock(overrides = {}) {
    const state = {
        instances: overrides.instances || [
            {
                id: INST_A,
                tenant_id: TENANT_A,
                display_name: 'Comercial',
                phone_number: '5511999990001',
                status: 'connected',
                api_key: 'key-inst-a'
            },
            {
                id: INST_B,
                tenant_id: TENANT_B,
                display_name: 'Comercial',
                phone_number: '5511999990002',
                status: 'connected',
                api_key: 'key-inst-b'
            }
        ],
        companies: overrides.companies || [
            { id: TENANT_A, global_api_key: 'global-a' },
            { id: TENANT_B, global_api_key: 'global-b' }
        ],
        outboxInserts: [],
        uploads: []
    };

    const supabase = {
        _state: state,
        storage: {
            from(bucket) {
                return {
                    async upload(fileName, buffer, meta) {
                        state.uploads.push({ bucket, fileName, buffer, meta });
                        return { data: { path: fileName }, error: null };
                    },
                    getPublicUrl(fileName) {
                        return { data: { publicUrl: `https://storage.test/${bucket}/${fileName}` } };
                    }
                };
            }
        },
        from(table) {
            const q = { op: 'select', filters: [], payload: null, limitNum: null };
            const applyFilters = (rows) => rows.filter((r) => q.filters.every(([kind, col, val]) => {
                if (kind === 'eq') return r[col] === val;
                if (kind === 'in') return Array.isArray(val) && val.includes(r[col]);
                if (kind === 'ilike') return String(r[col] || '').toLowerCase() === String(val || '').toLowerCase();
                if (kind === 'or') {
                    return String(val).split(',').some(clause => {
                        const [c, op, target] = clause.split('.');
                        return op === 'eq' ? String(r[c] || '') === String(target) : false;
                    });
                }
                return true;
            }));
            const getSrc = () => {
                if (table === 'whatsapp_instances') return state.instances;
                if (table === 'companies') return state.companies;
                if (table === 'wa_outgoing_messages') return state.outboxInserts;
                return [];
            };
            const execSelect = () => {
                let out = applyFilters(getSrc());
                if (typeof q.limitNum === 'number') out = out.slice(0, q.limitNum);
                return out;
            };
            const builder = {
                select() { return builder; },
                insert(payload) {
                    q.op = 'insert';
                    q.payload = payload;
                    if (table === 'wa_outgoing_messages') {
                        const rows = Array.isArray(payload) ? payload : [payload];
                        const saved = rows.map((row, idx) => ({ id: `outbox-${state.outboxInserts.length + idx + 1}`, ...row }));
                        state.outboxInserts.push(...saved);
                        q.inserted = saved;
                    }
                    return builder;
                },
                eq(c, v) { q.filters.push(['eq', c, v]); return builder; },
                in(c, v) { q.filters.push(['in', c, v]); return builder; },
                ilike(c, v) { q.filters.push(['ilike', c, v]); return builder; },
                or(expr) { q.filters.push(['or', expr]); return builder; },
                limit(n) { q.limitNum = n; return builder; },
                async maybeSingle() {
                    if (q.op === 'insert') return { data: q.inserted?.[0] || null, error: null };
                    const rows = execSelect();
                    // Simulate PostgREST PGRST116 when > 1 rows matched maybeSingle
                    if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'Multiple rows' } };
                    return { data: rows[0] || null, error: null };
                },
                async single() {
                    if (q.op === 'insert') return { data: q.inserted?.[0] || null, error: null };
                    const rows = execSelect();
                    if (rows.length !== 1) return { data: null, error: { code: 'PGRST116' } };
                    return { data: rows[0], error: null };
                },
                then(resolve, reject) {
                    if (q.op === 'insert') {
                        return Promise.resolve({ data: q.inserted || [], error: null }).then(resolve, reject);
                    }
                    return Promise.resolve({ data: execSelect(), error: null }).then(resolve, reject);
                }
            };
            return builder;
        }
    };
    return supabase;
}

test('createExternalMessageRouting encaminha x-api-key e Bearer como apikey para Alpha sem vazar cookies', async t => {
    const owner = express();
    owner.use(express.json());
    const received = [];
    owner.post('/message/sendText', (req, res) => {
        received.push({ apikey: req.headers.apikey, auth: req.headers.authorization, cookie: req.headers.cookie });
        res.status(200).json({ key: { id: 'wa-1' }, status: 'PENDING' });
    });
    const ownerUrl = await listen(t, owner);

    const gw = express();
    gw.use(express.json());
    gw.use((req, res, next) => {
        req.instanceData = { id: FOOD_NEXT_ID, tenant_id: TENANT_A };
        next();
    });
    gw.use(createExternalMessageRouting({
        nodeId: 'production-worker',
        isInstanceAllowed: () => false,
        alphaUrl: ownerUrl
    }));
    const base = await listen(t, gw);

    const r1 = await fetch(`${base}/message/sendText`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': 'alpha-key-1', cookie: 'secret=1' },
        body: JSON.stringify({ number: '5511975960999', text: 'oi' })
    });
    assert.equal(r1.status, 200);

    const r2 = await fetch(`${base}/message/sendText`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer alpha-key-2', cookie: 'secret=2' },
        body: JSON.stringify({ number: '5511975960999', text: 'oi' })
    });
    assert.equal(r2.status, 200);

    assert.equal(received[0].apikey, 'alpha-key-1');
    assert.equal(received[0].cookie, undefined);
    assert.equal(received[1].apikey, 'alpha-key-2');
    assert.equal(received[1].auth, undefined);
});

test('public-rest-helpers valida URLs contra SSRF, extrai chaves, coordenadas zero e compara nomes', () => {
    assert.equal(extractPublicApiKey({ 'x-api-key': 'k1' }), 'k1');
    assert.equal(extractPublicApiKey({ authorization: 'Bearer k2' }), 'k2');
    assert.equal(extractPublicApiKey({}, { apikey: 'k3' }), 'k3');

    assert.equal(isSafeExternalMediaUrl('https://cdn.example.com/menu.png').ok, true);
    assert.equal(isSafeExternalMediaUrl('http://127.0.0.1:9000/health').ok, false);
    assert.equal(isSafeExternalMediaUrl('http://localhost/secret').ok, false);
    assert.equal(isSafeExternalMediaUrl('http://169.254.169.254/latest/meta-data').ok, false);
    assert.equal(isSafeExternalMediaUrl('http://10.0.0.5/internal').ok, false);
    assert.equal(isSafeExternalMediaUrl('http://192.168.1.10/local').ok, false);
    assert.equal(isSafeExternalMediaUrl('file:///etc/passwd').ok, false);

    assert.equal(parseCoordinate(0), 0);
    assert.equal(parseCoordinate('0'), 0);
    assert.equal(parseCoordinate(-23.5505), -23.5505);
    assert.equal(parseCoordinate(undefined), null);
    assert.equal(parseCoordinate('abc'), null);

    const inst = { id: INST_B, display_name: 'Comercial', phone_number: '5511999990002' };
    assert.equal(matchesInstanceIdentifier(inst, 'Comercial'), true);
    assert.equal(matchesInstanceIdentifier(inst, 'comercial'), true);
    assert.equal(matchesInstanceIdentifier(inst, INST_B), true);
    assert.equal(matchesInstanceIdentifier(inst, 'Financeiro'), false);
});

test('outbox-classifier e resolveOutboxMediaSpec nunca pausam IA para API externa e aceitam mediatype legado', () => {
    const extMsg = classifyOutboxMessage({
        message_type: 'media',
        priority: 2,
        options: { isAutomation: true, senderType: 'automation', isFallback: true }
    });
    assert.equal(extMsg.isAutomation, true);
    assert.equal(extMsg.shouldPauseAi, false);
    assert.equal(extMsg.shouldApplyAntiBanDelay, false);
    assert.equal(extMsg.senderType, 'automation');

    const humanMsg = classifyOutboxMessage({
        message_type: 'text',
        priority: 1,
        options: {}
    });
    assert.equal(humanMsg.isAutomation, false);
    assert.equal(humanMsg.shouldPauseAi, true);
    assert.equal(humanMsg.senderType, 'human');

    const campaignMsg = classifyOutboxMessage({
        message_type: 'text',
        priority: 5,
        options: {}
    });
    assert.equal(campaignMsg.isAutomation, true);
    assert.equal(campaignMsg.shouldApplyAntiBanDelay, true);
    assert.equal(campaignMsg.shouldPauseAi, false);

    assert.deepEqual(resolveOutboxMediaSpec({ message_type: 'image', media_url: 'https://cdn.test/foto.jpg' }), {
        isMedia: true,
        explicitMessageType: 'image'
    });
    assert.deepEqual(resolveOutboxMediaSpec({ message_type: 'media', media_url: 'https://cdn.test/doc.png', options: { messageType: 'document' } }), {
        isMedia: true,
        explicitMessageType: 'document'
    });
});

test('POST /message/sendText com fallback de reconexão e colisão de nomes entre empresas', async t => {
    const supabase = createRestSupabaseMock();
    const enqueued = [];
    const mockSessionManager = {
        sessions: new Map(),
        async hasValidSavedCredentials() { return true; },
        async getSocketOrWake() { return null; }, // força socket reconectando (não definitivo)
        async enqueueMessage(instanceId, payload) {
            enqueued.push({ instanceId, payload });
            return { id: 'q-text-1', status: 'pending' };
        }
    };

    const app = express();
    app.use(express.json());
    app.use('/', createPublicRestRouter({
        supabase,
        sessionManager: mockSessionManager,
        resolveTargetJid: async (_sock, num) => `${num}@s.whatsapp.net`,
        isInstanceAllowed: () => true,
        nodeId: 'production-worker'
    }));
    const base = await listen(t, app);

    // Empresa B envia "Comercial" com a api_key de B mesmo havendo outra caixa "Comercial" na Empresa A
    const res = await fetch(`${base}/message/sendText`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: 'key-inst-b' },
        body: JSON.stringify({ instance: 'Comercial', number: '5511975960999', text: 'Pedido confirmado!' })
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.code, 'MESSAGE_QUEUED');
    assert.equal(body.instance_id, INST_B);
    assert.equal(enqueued.length, 1);
    assert.equal(enqueued[0].instanceId, INST_B);
    assert.equal(enqueued[0].payload.options.isAutomation, true);
    assert.equal(enqueued[0].payload.options.senderType, 'automation');
    assert.equal(enqueued[0].payload.options.isFallback, true);
    assert.equal(enqueued[0].payload.options.forceQueue, true);
});

test('POST /message/sendMedia aceita JSON com URL segura, rejeita SSRF e grava fallback com message_type="media" + isAutomation', async t => {
    const supabase = createRestSupabaseMock();
    let triggerCount = 0;
    const mockQueueProcessor = {
        trigger() { triggerCount++; }
    };
    let sendShouldFail = true;
    const fakeSock = {
        user: { id: '5511999990001@s.whatsapp.net' },
        ws: { isOpen: true, readyState: 1 },
        async sendMessage(_jid, payload, opts) {
            if (sendShouldFail) throw new Error('Connection Closed');
            return { key: { id: 'wa-media-1', remoteJid: _jid, fromMe: true }, message: payload, messageTimestamp: 1700000000, _opts: opts };
        }
    };
    const mockSessionManager = {
        sessions: new Map([[INST_A, { sock: fakeSock }]]),
        async hasValidSavedCredentials() { return true; },
        async getSocketOrWake() { return fakeSock; }
    };

    const app = express();
    app.use(express.json());
    app.use('/', createPublicRestRouter({
        supabase,
        sessionManager: mockSessionManager,
        queueProcessor: mockQueueProcessor,
        resolveTargetJid: async (_sock, num) => `${num}@s.whatsapp.net`,
        isInstanceAllowed: () => true,
        nodeId: 'production-worker',
        isSocketOpenFn: () => true
    }));
    const base = await listen(t, app);

    // 1. Bloqueio de SSRF em JSON
    const ssrfRes = await fetch(`${base}/message/sendMedia/${INST_A}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: 'key-inst-a' },
        body: JSON.stringify({ number: '5511975960999', mediatype: 'image', media: 'http://127.0.0.1:9000/health' })
    });
    assert.equal(ssrfRes.status, 400);

    // 2. Oscilação durante envio multipart -> fallback deve salvar message_type: 'media' e priority >= 2 com options.isAutomation = true
    const form = new FormData();
    form.append('number', '5511975960999');
    form.append('mediatype', 'image');
    form.append('caption', 'Cardápio');
    form.append('file', new Blob([Buffer.from('fake-png')], { type: 'image/png' }), 'cardapio.png');

    const fallbackRes = await fetch(`${base}/message/sendMedia/${INST_A}`, {
        method: 'POST',
        headers: { apikey: 'key-inst-a' },
        body: form
    });
    assert.equal(fallbackRes.status, 202);
    const fbBody = await fallbackRes.json();
    assert.equal(fbBody.code, 'MEDIA_QUEUED_RECONNECTING');
    assert.equal(supabase._state.outboxInserts.length, 1);
    assert.equal(supabase._state.outboxInserts[0].message_type, 'media');
    assert.equal(supabase._state.outboxInserts[0].options?.isAutomation, true);
    assert.equal(supabase._state.outboxInserts[0].options?.messageType, 'image');
    assert.ok(triggerCount >= 1);

    // 3. JSON com URL pública segura e socket saudável
    sendShouldFail = false;
    const jsonOk = await fetch(`${base}/message/sendMedia/${INST_A}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: 'key-inst-a' },
        body: JSON.stringify({
            number: '5511975960999',
            mediatype: 'document',
            media: 'https://cdn.example.com/nota.pdf',
            fileName: 'nota.pdf',
            caption: 'Sua NF'
        })
    });
    assert.equal(jsonOk.status, 200);
    const okData = await jsonOk.json();
    assert.equal(okData.key.id, 'wa-media-1');
    assert.equal(okData.mediaUrl, 'https://cdn.example.com/nota.pdf');
});

test('POST /message/sendWhatsAppAudio e /message/sendLocation com coordenada zero e /:instance', async t => {
    const supabase = createRestSupabaseMock();
    const sentPayloads = [];
    const fakeSock = {
        user: { id: '5511999990001@s.whatsapp.net' },
        ws: { isOpen: true, readyState: 1 },
        async sendMessage(jid, payload, opts) {
            sentPayloads.push({ jid, payload, opts });
            return { key: { id: `wa-${sentPayloads.length}`, remoteJid: jid, fromMe: true }, messageTimestamp: 1700000000 };
        }
    };
    const mockSessionManager = {
        sessions: new Map([[INST_A, { sock: fakeSock }]]),
        async hasValidSavedCredentials() { return true; },
        async getSocketOrWake() { return fakeSock; }
    };

    const app = express();
    app.use(express.json());
    app.use('/', createPublicRestRouter({
        supabase,
        sessionManager: mockSessionManager,
        resolveTargetJid: async (_sock, num) => `${num}@s.whatsapp.net`,
        isInstanceAllowed: () => true,
        nodeId: 'production-worker',
        isSocketOpenFn: () => true
    }));
    const base = await listen(t, app);

    const locRes = await fetch(`${base}/message/sendLocation/${INST_A}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: 'key-inst-a' },
        body: JSON.stringify({ number: '5511975960999', latitude: 0, longitude: -51.0694, name: 'Marco Zero' })
    });
    assert.equal(locRes.status, 200);
    assert.equal(sentPayloads[0].payload.location.degreesLatitude, 0);

    const audioRes = await fetch(`${base}/message/sendWhatsAppAudio/${INST_A}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: 'key-inst-a' },
        body: JSON.stringify({ number: '5511975960999', audio: 'https://cdn.example.com/voz.ogg' })
    });
    assert.equal(audioRes.status, 200);
    assert.equal(sentPayloads[1].payload.audio.url, 'https://cdn.example.com/voz.ogg');
    assert.equal(sentPayloads[1].payload.ptt, true);
});

test('QueueProcessor.markDeliveredOrSync garante automationMessagesCache quando options.isAutomation é true mesmo com priority < 5', () => {
    EventProcessor.automationMessagesCache = new Map();
    EventProcessor.humanMessagesCache = new Map();
    const cls = classifyOutboxMessage({ message_type: 'media', priority: 2, options: { isAutomation: true } });
    queueProcessor.registerDispatchCache(INST_A, 'wa-msg-cache-1', cls);
    assert.equal(EventProcessor.automationMessagesCache.has(`${INST_A}_wa-msg-cache-1`), true);
    assert.equal(EventProcessor.humanMessagesCache.has(`${INST_A}_wa-msg-cache-1`), false);
});
