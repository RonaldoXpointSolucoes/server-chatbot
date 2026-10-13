import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { EmbeddingWorkerClient } from '../src/embeddings/client.js';

const workerURL = new URL('./fixtures/embedding-worker.mjs', import.meta.url);
test('HTTP remains responsive during CPU-bound embedding work', async t => {
    const client = new EmbeddingWorkerClient({ workerURL });
    t.after(() => client.close());
    const server = createServer((req, res) => res.end('healthy'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    await client.request({ op: 'load' });
    const job = client.request({ op: 'embed', text: '42', options: { busyMs: 600 } });
    await new Promise(resolve => setTimeout(resolve, 80));
    const started = Date.now();
    const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    assert.equal(await response.text(), 'healthy');
    assert.ok(Date.now() - started < 300, 'Embedding work blocked the HTTP event loop');
    const result = await job;
    assert.ok(result.data instanceof Float32Array);
    assert.deepEqual(result.dims, [1, 1]);
    assert.equal(result.data[0], 42);
});

test('interactive embeddings overtake queued background chunks', async t => {
    const client = new EmbeddingWorkerClient({ workerURL });
    t.after(() => client.close());
    await client.request({ op: 'load' });
    const completed = [];
    const first = client.request({ op: 'embed', text: '1', options: { busyMs: 350 }, priority: 10 }).then(r => completed.push(r.data[0]));
    await new Promise(resolve => setTimeout(resolve, 50));
    const background = client.request({ op: 'embed', text: '2', priority: 10 }).then(r => completed.push(r.data[0]));
    const interactive = client.request({ op: 'embed', text: '3', priority: 1 }).then(r => completed.push(r.data[0]));
    await Promise.all([first, background, interactive]);
    assert.deepEqual(completed, [1, 3, 2]);
});

test('failed embeddings reject only their own request', async t => {
    const client = new EmbeddingWorkerClient({ workerURL });
    t.after(() => client.close());
    await assert.rejects(client.request({ op: 'embed', text: 'fail' }), /Synthetic embedding failure/);
    const result = await client.request({ op: 'embed', text: '7' });
    assert.equal(result.data[0], 7);
});

test('timed-out workers reject pending jobs and can restart', async t => {
    const client = new EmbeddingWorkerClient({ workerURL, timeoutMs: 1000 });
    t.after(() => client.close());
    await client.request({ op: 'load' });
    client.timeoutMs = 80;
    const results = await Promise.allSettled([
        client.request({ op: 'embed', text: '1', options: { busyMs: 400 } }),
        client.request({ op: 'embed', text: '2' })
    ]);
    assert.ok(results.every(r => r.status === 'rejected' && /timeout/.test(r.reason.message)));
    client.timeoutMs = 1000;
    const result = await client.request({ op: 'embed', text: '8' });
    assert.equal(result.data[0], 8);
});
