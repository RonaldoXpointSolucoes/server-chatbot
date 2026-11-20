import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createKnowledgeRouter } from '../src/api-gateway/knowledge.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INSTANCE_ID = '22222222-2222-4222-8222-222222222222';
const DOC_ID = '33333333-3333-4333-8333-333333333333';
const RUN_ID = '44444444-4444-4444-8444-444444444444';

function createRoutesSupabaseMock() {
    const state = {
        docs: [
            { id: DOC_ID, tenant_id: TENANT_ID, instance_id: INSTANCE_ID, agent_id: null, name: 'Playbook Comercial', status: 'ready', metadata: { category: 'Vendas' }, created_at: '2026-11-19T10:00:00Z' },
            { id: '33333333-3333-4333-8333-333333333339', tenant_id: TENANT_ID, instance_id: null, agent_id: null, name: 'Manual Global', status: 'ready', metadata: { category: 'Geral' }, created_at: '2026-11-19T09:00:00Z' }
        ],
        chunks: [
            { id: 'c1', document_id: DOC_ID, tenant_id: TENANT_ID, agent_id: null, instance_id: INSTANCE_ID, chunk_index: 0, content: 'Regra Comercial', metadata: { instance_id: INSTANCE_ID } },
            { id: 'c2', document_id: '33333333-3333-4333-8333-333333333339', tenant_id: TENANT_ID, agent_id: null, instance_id: null, chunk_index: 0, content: 'Regra Global', metadata: { instance_id: null } }
        ],
        instances: [
            { id: INSTANCE_ID, tenant_id: TENANT_ID, display_name: 'Comercial' }
        ],
        docUpdates: [],
        chunkUpdates: []
    };

    const supabase = {
        _state: state,
        from(table) {
            const q = { table, op: 'select', filters: [], payload: null, rangePair: null };
            const applyFilter = (rows) => rows.filter(r => q.filters.every(([kind, col, val]) => {
                if (kind === 'eq') return r[col] === val;
                if (kind === 'is') return r[col] === val;
                if (kind === 'or' && String(col).includes('instance_id.eq.')) {
                    const m = String(col).split('instance_id.eq.')[1]?.split(',')[0];
                    return r.instance_id == null || r.instance_id === m;
                }
                return true;
            }));
            const execSelect = () => {
                let src = [];
                if (table === 'knowledge_documents') src = state.docs;
                else if (table === 'knowledge_chunks') src = state.chunks;
                else if (table === 'whatsapp_instances') src = state.instances;
                let out = applyFilter(src);
                if (q.rangePair) out = out.slice(q.rangePair[0], q.rangePair[1] + 1);
                return out;
            };
            const builder = {
                select() { return builder; },
                delete() { q.op = 'delete'; return builder; },
                insert(rows) {
                    q.op = 'insert';
                    if (table === 'knowledge_chunks') {
                        const inserted = rows.map((r, i) => ({ id: `c-new-${i}`, ...r }));
                        state.chunks.push(...inserted);
                    }
                    return Promise.resolve({ data: rows, error: null });
                },
                update(payload) { q.op = 'update'; q.payload = payload; return builder; },
                eq(c, v) { q.filters.push(['eq', c, v]); return builder; },
                is(c, v) { q.filters.push(['is', c, v]); return builder; },
                or(expr) { q.filters.push(['or', expr]); return builder; },
                order() { return builder; },
                range(a, b) { q.rangePair = [a, b]; return builder; },
                maybeSingle() {
                    return Promise.resolve({ data: execSelect()[0] || null, error: null });
                },
                single() {
                    if (q.op === 'update') {
                        const target = applyFilter(table === 'knowledge_documents' ? state.docs : state.chunks);
                        for (const item of target) Object.assign(item, q.payload);
                        if (table === 'knowledge_documents') state.docUpdates.push(q.payload);
                        return Promise.resolve({ data: target[0] || null, error: null });
                    }
                    return Promise.resolve({ data: execSelect()[0] || null, error: null });
                },
                then(resolve, reject) {
                    if (q.op === 'delete' && table === 'knowledge_chunks') {
                        state.chunks = state.chunks.filter(c => !applyFilter([c]).length);
                        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
                    }
                    if (q.op === 'update') {
                        if (table === 'knowledge_documents') {
                            const matched = applyFilter(state.docs);
                            for (const item of matched) Object.assign(item, q.payload);
                            state.docUpdates.push(q.payload);
                            return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
                        }
                        if (table === 'knowledge_chunks') {
                            const matched = applyFilter(state.chunks);
                            for (const item of matched) Object.assign(item, q.payload);
                            state.chunkUpdates.push(q.payload);
                            return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
                        }
                    }
                    return Promise.resolve({ data: execSelect(), error: null }).then(resolve, reject);
                }
            };
            return builder;
        }
    };
    return supabase;
}

async function withTestServer(router, fn) {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/knowledge', router);
    const server = app.listen(0);
    const { port } = server.address();
    try {
        await fn(`http://127.0.0.1:${port}/api/v1/knowledge`);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

test('Knowledge routes handle inbox-analyze status, start (400/409/202), and run polling without /:id collision', async () => {
    const supabase = createRoutesSupabaseMock();
    let conflictMode = false;
    let statusCalledFor = null;
    let runCalledFor = null;

    const router = createKnowledgeRouter({
        supabase,
        inboxAnalyzer: {
            getInboxAnalysisStatus: async ({ instanceId }) => {
                statusCalledFor = instanceId;
                return { instance: { id: instanceId, display_name: 'Comercial' }, pendingEligibleCount: 12, activeRun: null, lastCompletedRun: null, recentRuns: [] };
            },
            startInboxDeepAnalysis: async ({ instanceId, mode, targetScope }) => {
                if (conflictMode) {
                    return { conflict: true, activeRun: { id: RUN_ID, status: 'synthesizing' } };
                }
                return { ok: true, run: { id: RUN_ID, instance_id: instanceId, mode, targetScope, status: 'queued' } };
            },
            getInboxAnalysisRun: async ({ runId }) => {
                runCalledFor = runId;
                return { id: runId, status: 'completed', progress_pct: 100 };
            }
        }
    });

    await withTestServer(router, async (baseUrl) => {
        const stRes = await fetch(`${baseUrl}/inbox-analyze/${INSTANCE_ID}/status`, {
            headers: { 'x-tenant-id': TENANT_ID }
        });
        assert.equal(stRes.status, 200);
        const stJson = await stRes.json();
        assert.equal(statusCalledFor, INSTANCE_ID);
        assert.equal(stJson.pendingEligibleCount, 12);

        const runRes = await fetch(`${baseUrl}/inbox-analyze/runs/${RUN_ID}`, {
            headers: { 'x-tenant-id': TENANT_ID }
        });
        assert.equal(runRes.status, 200);
        const runJson = await runRes.json();
        assert.equal(runCalledFor, RUN_ID);
        assert.equal(runJson.run.status, 'completed');

        const noTenantRes = await fetch(`${baseUrl}/inbox-analyze/${INSTANCE_ID}/start`, { method: 'POST' });
        assert.equal(noTenantRes.status, 400);

        conflictMode = true;
        const confRes = await fetch(`${baseUrl}/inbox-analyze/${INSTANCE_ID}/start`, {
            method: 'POST',
            headers: { 'x-tenant-id': TENANT_ID, 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'incremental' })
        });
        assert.equal(confRes.status, 409);

        conflictMode = false;
        const okRes = await fetch(`${baseUrl}/inbox-analyze/${INSTANCE_ID}/start`, {
            method: 'POST',
            headers: { 'x-tenant-id': TENANT_ID, 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'full', targetScope: 'global' })
        });
        assert.equal(okRes.status, 202);
        const okJson = await okRes.json();
        assert.equal(okJson.run.id, RUN_ID);
        assert.equal(okJson.run.mode, 'full');
        assert.equal(okJson.run.targetScope, 'global');
    });
});

test('PATCH /:id/scope toggles document & all its chunks between Inbox and Global and invalidates cache', async () => {
    const supabase = createRoutesSupabaseMock();
    const invalidatedCalls = [];

    const router = createKnowledgeRouter({
        supabase,
        invalidateBehaviorCache: (tId, iId) => invalidatedCalls.push({ tId, iId })
    });

    await withTestServer(router, async (baseUrl) => {
        const badRes = await fetch(`${baseUrl}/${DOC_ID}/scope`, {
            method: 'PATCH',
            headers: { 'x-tenant-id': TENANT_ID, 'content-type': 'application/json' },
            body: JSON.stringify({ instanceId: 'not-a-uuid' })
        });
        assert.equal(badRes.status, 400);

        // Promote to Global (null)
        const globalRes = await fetch(`${baseUrl}/${DOC_ID}/scope`, {
            method: 'PATCH',
            headers: { 'x-tenant-id': TENANT_ID, 'content-type': 'application/json' },
            body: JSON.stringify({ instanceId: null })
        });
        assert.equal(globalRes.status, 200);
        const globalJson = await globalRes.json();
        assert.equal(globalJson.document.instance_id, null);
        assert.equal(supabase._state.chunks[0].instance_id, null);
        assert.equal(invalidatedCalls.length, 1);

        // Restrict back to Inbox
        const inboxRes = await fetch(`${baseUrl}/${DOC_ID}/scope`, {
            method: 'PATCH',
            headers: { 'x-tenant-id': TENANT_ID, 'content-type': 'application/json' },
            body: JSON.stringify({ instanceId: INSTANCE_ID })
        });
        assert.equal(inboxRes.status, 200);
        assert.equal(supabase._state.docs[0].instance_id, INSTANCE_ID);
        assert.equal(supabase._state.chunks[0].instance_id, INSTANCE_ID);
    });
});

test('GET /overview filters by instance_id (global | uuid) and POST /match forwards instanceId', async () => {
    const supabase = createRoutesSupabaseMock();
    let capturedMatchArgs = null;

    const router = createKnowledgeRouter({
        supabase,
        EmbeddingsPipeline: {
            getInstance: async () => async () => ({ data: new Float32Array(384).fill(0.05) })
        },
        hybridRetrieveKnowledge: async (args) => {
            capturedMatchArgs = args;
            return [{ id: 'c1', document_name: 'Playbook Comercial', section: 'Regras', content: 'Regra Comercial', similarity: 0.91 }];
        }
    });

    await withTestServer(router, async (baseUrl) => {
        const globalOv = await fetch(`${baseUrl}/overview?instance_id=global`, {
            headers: { 'x-tenant-id': TENANT_ID }
        });
        assert.equal(globalOv.status, 200);
        const globalJson = await globalOv.json();
        assert.equal(globalJson.documents.length, 1);
        assert.equal(globalJson.documents[0].name, 'Manual Global');

        const inboxOv = await fetch(`${baseUrl}/overview?instance_id=${INSTANCE_ID}`, {
            headers: { 'x-tenant-id': TENANT_ID }
        });
        const inboxJson = await inboxOv.json();
        assert.equal(inboxJson.documents.length, 1);
        assert.equal(inboxJson.documents[0].name, 'Playbook Comercial');

        const matchRes = await fetch(`${baseUrl}/match`, {
            method: 'POST',
            headers: { 'x-tenant-id': TENANT_ID, 'content-type': 'application/json' },
            body: JSON.stringify({ query: 'como funciona', instanceId: INSTANCE_ID })
        });
        assert.equal(matchRes.status, 200);
        assert.equal(capturedMatchArgs.instanceId, INSTANCE_ID);
    });
});

test('PATCH /:id/scope syncs chunk metadata.instance_id and flushes full tenant cache on Global changes; PUT /:id clears removed behavior_profile', async () => {
    const supabase = createRoutesSupabaseMock();
    supabase._state.docs[0].metadata = { source: 'inbox_deep_analyzer', behavior_profile: 'Tom Antigo', instance_id: INSTANCE_ID };
    const invalidated = [];

    const router = createKnowledgeRouter({
        supabase,
        EmbeddingsPipeline: { getInstance: async () => async () => ({ data: new Float32Array(384).fill(0.05) }) },
        invalidateBehaviorCache: (tId, iId) => invalidated.push({ tId, iId })
    });

    await withTestServer(router, async (baseUrl) => {
        // Promote to Global -> must sync chunk metadata + invalidate entire tenant cache (iId === undefined)
        const globalRes = await fetch(`${baseUrl}/${DOC_ID}/scope`, {
            method: 'PATCH',
            headers: { 'x-tenant-id': TENANT_ID, 'content-type': 'application/json' },
            body: JSON.stringify({ instanceId: null })
        });
        assert.equal(globalRes.status, 200);
        assert.equal(supabase._state.chunks[0].metadata.instance_id, null);
        assert.equal(invalidated[0].iId, undefined, 'Promoting to Global must flush cache across ALL inboxes');

        // Edit via PUT /:id removing behavior section -> must clear stale behavior_profile
        const putRes = await fetch(`${baseUrl}/${DOC_ID}`, {
            method: 'PUT',
            headers: { 'x-tenant-id': TENANT_ID, 'content-type': 'application/json' },
            body: JSON.stringify({ content: '# 2. Regras Operacionais\n- Nova política comercial clara e objetiva sem seção de comportamento.' })
        });
        assert.equal(putRes.status, 200);
        await new Promise(r => setTimeout(r, 40));
        assert.equal(supabase._state.docs[0].metadata.behavior_profile, null);
    });
});
