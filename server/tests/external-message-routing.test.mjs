import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import multer from 'multer';
import { createExternalMessageRouting, externalMessageOwner, uploadedMediaBody } from '../src/api-gateway/external-message-routing.js';

const foodNext = 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6';
async function listen(t, app) {
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
    return `http://127.0.0.1:${server.address().port}`;
}

function gateway(owner, extra = {}) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.instanceData = { id: foodNext, tenant_id: 'test' }; next(); });
    app.use(createExternalMessageRouting({ nodeId: 'production-worker', isInstanceAllowed: () => false, alphaUrl: owner, ...extra }));
    app.use((req, res) => res.status(501).json({ localSocketInvoked: true }));
    return app;
}

test('legacy production text URL forwards to Alpha using only the supplied API key', async t => {
    const owner = express();
    owner.use(express.json());
    let received;
    owner.post('/message/sendText', (req, res) => {
        received = { body: req.body, headers: req.headers };
        res.status(202).json({ code: 'MESSAGE_QUEUED', queue_id: 'owner-queue' });
    });
    const ownerUrl = await listen(t, owner);
    const base = await listen(t, gateway(ownerUrl));
    const body = { instance: 'FoodNext', number: '5511975960999', text: 'test' };
    const response = await fetch(base + '/message/sendText', {
        method: 'POST', headers: { 'content-type': 'application/json', apikey: 'test-instance-key', authorization: 'do-not-forward', 'x-tenant-id': 'do-not-forward' }, body: JSON.stringify(body)
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { code: 'MESSAGE_QUEUED', queue_id: 'owner-queue' });
    assert.deepEqual(received.body, body);
    assert.equal(received.headers.apikey, 'test-instance-key');
    assert.equal(received.headers.authorization, undefined);
    assert.equal(received.headers['x-tenant-id'], undefined);
    assert.equal(response.headers.get('x-api-owner-node'), 'alpha-worker');
});

test('multipart upload is streamed intact to its owner before local parsing', async t => {
    const owner = express();
    owner.post('/message/sendMedia', multer().single('file'), (req, res) => {
        res.json({ fields: req.body, name: req.file.originalname, text: req.file.buffer.toString(), type: req.file.mimetype, apikey: req.headers.apikey, privilegedHeaders: !!(req.headers.authorization || req.headers['x-tenant-id'] || req.headers.cookie) });
    });
    const base = await listen(t, gateway(await listen(t, owner)));
    const form = uploadedMediaBody({ instance: 'FoodNext', number: '5511975960999', mediatype: 'document', caption: 'caption' }, { buffer: Buffer.from('external upload'), mimetype: 'text/plain', originalname: 'api-test.txt' });
    const response = await fetch(base + '/message/sendMedia', { method: 'POST', headers: { apikey: 'test-instance-key', authorization: 'do-not-forward', 'x-tenant-id': 'do-not-forward', cookie: 'do-not-forward' }, body: form });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { fields: { instance: 'FoodNext', number: '5511975960999', mediatype: 'document', caption: 'caption' }, name: 'api-test.txt', text: 'external upload', type: 'text/plain', apikey: 'test-instance-key', privilegedHeaders: false });
});

test('owner errors are preserved and network uncertainty never falls through to local enqueue', async t => {
    const owner = express();
    owner.post('/message/sendText', (req, res) => res.status(401).json({ error: 'Unauthorized ApiKey.' }));
    const base = await listen(t, gateway(await listen(t, owner)));
    const response = await fetch(base + '/message/sendText', { method: 'POST', headers: { apikey: 'test', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Unauthorized ApiKey.' });
    const unavailable = await listen(t, gateway('http://127.0.0.1:1', { fetchImpl: async () => { throw new Error('connection refused'); } }));
    const failed = await fetch(unavailable + '/message/sendText', { method: 'POST', headers: { apikey: 'test', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(failed.status, 502);
    assert.equal((await failed.json()).code, 'INSTANCE_OWNER_UNAVAILABLE');
});

test('routing is restricted to the two homologation instances and cannot loop', async t => {
    assert.equal(externalMessageOwner('customer-instance', 'production-worker'), null);
    assert.equal(externalMessageOwner(foodNext, 'alpha-worker'), null);
    const base = await listen(t, gateway('http://127.0.0.1:1', { fetchImpl: () => { throw new Error('must not fetch'); } }));
    const response = await fetch(base + '/message/sendText', { method: 'POST', headers: { apikey: 'test', 'x-api-owner-hop': '1' }, body: '{}' });
    assert.equal(response.status, 508);
    assert.equal((await response.json()).code, 'INSTANCE_ROUTING_LOOP');
});
