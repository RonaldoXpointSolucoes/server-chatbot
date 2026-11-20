import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isValidUuid,
    commitCuratedDocument,
    hybridRetrieveKnowledge,
    auditTenantKnowledgeHealth,
    sanitizeTenantKnowledgeBase
} from '../src/api-gateway/knowledge-curator.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INST_COMERCIAL = '22222222-2222-4222-8222-222222222222';
const INST_FINANCEIRO = '33333333-3333-4333-8333-333333333333';

function createFakeTransformer() {
    return async () => ({
        data: new Float32Array(384).fill(0.05)
    });
}

function createCuratorSupabaseMock({ existingChunks = [], rpcHybridRows = [], rpcVecRows = [] } = {}) {
    const calls = {
        insertedDocs: [],
        updatedDocs: [],
        insertedChunks: [],
        rpcCalls: [],
        ilikeFilters: []
    };

    const mock = {
        calls,
        from(table) {
            const state = {
                table,
                op: 'select',
                filters: [],
                payload: null
            };
            const builder = {
                select(cols) { state.cols = cols; return builder; },
                insert(rows) {
                    state.op = 'insert';
                    state.payload = rows;
                    if (table === 'knowledge_documents') calls.insertedDocs.push(...rows);
                    if (table === 'knowledge_chunks') calls.insertedChunks.push(...rows);
                    return builder;
                },
                update(payload) {
                    state.op = 'update';
                    state.payload = payload;
                    if (table === 'knowledge_documents') calls.updatedDocs.push(payload);
                    return builder;
                },
                delete() { state.op = 'delete'; return builder; },
                eq(col, val) { state.filters.push(['eq', col, val]); return builder; },
                is(col, val) { state.filters.push(['is', col, val]); return builder; },
                or(expr) {
                    state.filters.push(['or', expr]);
                    if (table === 'knowledge_chunks') calls.ilikeFilters.push(expr);
                    return builder;
                },
                ilike(col, pat) { state.filters.push(['ilike', col, pat]); return builder; },
                order() { return builder; },
                limit() { return builder; },
                range(fromIdx, toIdx) {
                    if (table === 'knowledge_chunks' && state.op === 'select') {
                        const rows = existingChunks.slice(fromIdx, toIdx + 1);
                        return Promise.resolve({ data: rows, error: null });
                    }
                    return Promise.resolve({ data: [], error: null });
                },
                single() {
                    if (table === 'knowledge_documents' && state.op === 'insert') {
                        const row = { id: 'doc-new-1', ...state.payload[0] };
                        return Promise.resolve({ data: row, error: null });
                    }
                    if (table === 'knowledge_documents' && state.op === 'update') {
                        return Promise.resolve({ data: { id: 'doc-new-1', ...state.payload }, error: null });
                    }
                    return Promise.resolve({ data: null, error: null });
                },
                maybeSingle() {
                    return Promise.resolve({ data: null, error: null });
                },
                then(resolve, reject) {
                    if (table === 'knowledge_chunks' && state.op === 'select') {
                        const res = existingChunks.filter(c => {
                            for (const [kind, a, b] of state.filters) {
                                if (kind === 'or' && String(a).includes('instance_id.eq.')) {
                                    const matchId = String(a).split('instance_id.eq.')[1]?.split(',')[0];
                                    if (c.instance_id && c.instance_id !== matchId) return false;
                                }
                            }
                            return true;
                        });
                        return Promise.resolve({ data: res, error: null }).then(resolve, reject);
                    }
                    return Promise.resolve({ data: [], error: null }).then(resolve, reject);
                }
            };
            return builder;
        },
        rpc(fnName, params) {
            calls.rpcCalls.push({ fnName, params });
            if (fnName === 'match_knowledge_chunks_hybrid') {
                return Promise.resolve({ data: rpcHybridRows, error: null });
            }
            if (fnName === 'match_knowledge_chunks') {
                return Promise.resolve({ data: rpcVecRows, error: null });
            }
            return Promise.resolve({ data: [], error: null });
        }
    };
    return mock;
}

test('isValidUuid accepts RFC UUIDs and rejects simulator/invalid IDs', () => {
    assert.equal(isValidUuid(INST_COMERCIAL), true);
    assert.equal(isValidUuid('simulador'), false);
    assert.equal(isValidUuid(''), false);
    assert.equal(isValidUuid(null), false);
});

test('commitCuratedDocument stores instance_id and behavior_profile cleanly and only deduplicates within compatible scope', async () => {
    const sharedFact = 'Nossa política oficial de garantia cobre 90 dias úteis a partir da emissão da nota fiscal eletrônica.';
    // Chunk already exists in Financeiro (another inbox), NOT in Comercial or Global
    const supabase = createCuratorSupabaseMock({
        existingChunks: [
            {
                id: 'chunk-fin-1',
                document_id: 'doc-fin-1',
                tenant_id: TENANT_ID,
                agent_id: null,
                instance_id: INST_FINANCEIRO,
                content: `[Comercial | Garantia]\n${sharedFact}`,
                metadata: {}
            }
        ]
    });

    const result = await commitCuratedDocument({
        supabase,
        transformer: createFakeTransformer(),
        tenantId: TENANT_ID,
        instanceId: INST_COMERCIAL,
        title: 'Base Comercial',
        category: 'Comercial',
        content: `# Garantia Oficial\n\n${sharedFact}`,
        source: 'inbox_deep_analyzer',
        behaviorProfile: 'Tom consultivo, claro e direto para vendas B2B.',
        yieldMs: 0
    });

    assert.equal(supabase.calls.insertedDocs[0].instance_id, INST_COMERCIAL);
    assert.equal(supabase.calls.insertedChunks.length, 1);
    assert.equal(supabase.calls.insertedChunks[0].instance_id, INST_COMERCIAL);
    assert.equal(result.skippedDuplicates, 0, 'Must NOT skip chunk that only exists in a different inbox');
    assert.equal(result.document.metadata.behavior_profile, 'Tom consultivo, claro e direto para vendas B2B.');
});

test('hybridRetrieveKnowledge passes p_instance_id to RPC, normalizes non-UUID simulator, and prioritizes current inbox match', async () => {
    const supabase = createCuratorSupabaseMock({
        rpcHybridRows: [
            {
                id: 'c-global',
                document_id: 'd-global',
                document_name: 'Regras Gerais',
                content: 'O prazo padrão de entrega em São Paulo é combinado com o cliente conforme o bairro.',
                metadata: { instance_id: null },
                vector_similarity: 0.72,
                lexical_score: 0.5,
                rrf_score: 0.05
            },
            {
                id: 'c-inbox',
                document_id: 'd-inbox',
                document_name: 'Comercial X-Point',
                content: 'Na caixa Comercial, o prazo padrão de entrega em São Paulo inclui agendamento técnico expresso.',
                metadata: { instance_id: INST_COMERCIAL },
                vector_similarity: 0.72,
                lexical_score: 0.5,
                rrf_score: 0.062
            }
        ]
    });

    const matches = await hybridRetrieveKnowledge({
        supabase,
        queryEmbedding: new Array(384).fill(0.05),
        queryText: 'prazo padrao entrega sao paulo',
        tenantId: TENANT_ID,
        agentId: 'agent-1',
        instanceId: INST_COMERCIAL,
        topK: 2
    });

    assert.equal(supabase.calls.rpcCalls[0].params.p_instance_id, INST_COMERCIAL);
    assert.equal(matches[0].id, 'c-inbox', 'Inbox-specific chunk should rank above equal global chunk');

    await hybridRetrieveKnowledge({
        supabase,
        queryEmbedding: new Array(384).fill(0.05),
        queryText: 'prazo entrega',
        tenantId: TENANT_ID,
        instanceId: 'simulador',
        topK: 2
    });
    assert.equal(supabase.calls.rpcCalls[1].params.p_instance_id, null, 'Non-UUID simulator must become null for SQL UUID safety');
});

test('auditTenantKnowledgeHealth and sanitizeTenantKnowledgeBase isolate duplicate checks across different inboxes', async () => {
    const docs = [
        { id: 'doc-com', tenant_id: TENANT_ID, instance_id: INST_COMERCIAL, name: 'Comercial', status: 'ready', metadata: { chunks_total: 1 } },
        { id: 'doc-fin', tenant_id: TENANT_ID, instance_id: INST_FINANCEIRO, name: 'Financeiro', status: 'ready', metadata: { chunks_total: 1 } }
    ];
    const sharedContent = '[Geral] Nossa chave Pix oficial de pagamento antecipado usa o CNPJ cadastrado da empresa.';
    const sharedEmb = new Array(384).fill(0.05);
    const chunks = [
        { id: 'c-com', document_id: 'doc-com', tenant_id: TENANT_ID, instance_id: INST_COMERCIAL, chunk_index: 0, content: sharedContent, metadata: {}, embedding: sharedEmb },
        { id: 'c-fin', document_id: 'doc-fin', tenant_id: TENANT_ID, instance_id: INST_FINANCEIRO, chunk_index: 0, content: sharedContent, metadata: {}, embedding: sharedEmb }
    ];
    const deletedChunkIds = [];
    const deletedDocIds = [];
    const mockDb = {
        from(table) {
            const st = { table, op: 'select', filters: [] };
            const exec = () => {
                if (table === 'companies') return [{ name: 'Empresa', settings: {} }];
                if (table === 'knowledge_documents') return docs;
                if (table === 'knowledge_chunks') return chunks;
                return [];
            };
            const b = {
                select() { return b; },
                delete() { st.op = 'delete'; return b; },
                update() { st.op = 'update'; return b; },
                eq(c, v) { st.filters.push(['eq', c, v]); return b; },
                in(c, v) {
                    if (st.op === 'delete' && table === 'knowledge_chunks' && c === 'id') deletedChunkIds.push(...v);
                    return b;
                },
                order() { return b; },
                range(a, e) { return Promise.resolve({ data: exec().slice(a, e + 1), error: null }); },
                maybeSingle() { return Promise.resolve({ data: exec()[0] || null, error: null }); },
                then(res, rej) {
                    if (st.op === 'delete' && table === 'knowledge_documents') {
                        const idFilter = st.filters.find(f => f[1] === 'id');
                        if (idFilter) deletedDocIds.push(idFilter[2]);
                    }
                    return Promise.resolve({ data: exec(), error: null }).then(res, rej);
                }
            };
            return b;
        }
    };

    const audit = await auditTenantKnowledgeHealth({ supabase: mockDb, tenantId: TENANT_ID });
    assert.equal(audit.stats.exact_duplicate_chunks, 0, 'Same text in two different inboxes must NOT count as duplicate');
    assert.equal(audit.stats.near_duplicate_pairs, 0, 'Same vector in two different inboxes must NOT count as near duplicate');

    const sanitize = await sanitizeTenantKnowledgeBase({ supabase: mockDb, transformer: createFakeTransformer(), tenantId: TENANT_ID });
    assert.equal(sanitize.removedDuplicateChunks, 0, 'Sanitize must NOT erase identical chunks from a distinct inbox');
    assert.equal(deletedChunkIds.length, 0);
    assert.equal(deletedDocIds.length, 0);
});

test('commitCuratedDocument preserves existing chunks on embedding failure and preserves existing instance_id on replace/merge', async () => {
    let chunkDeletedBeforeEmbed = false;
    let chunkDeleteCount = 0;
    const insertedChunks = [];
    const insertedOrUpdatedDocs = [];

    const mockDb = {
        from(table) {
            const st = { table, op: 'select', payload: null };
            const b = {
                select() { return b; },
                delete() {
                    st.op = 'delete';
                    if (table === 'knowledge_chunks') chunkDeleteCount++;
                    return b;
                },
                update(p) { st.op = 'update'; st.payload = p; if (table === 'knowledge_documents') insertedOrUpdatedDocs.push(p); return b; },
                insert(rows) { st.op = 'insert'; if (table === 'knowledge_chunks') insertedChunks.push(...rows); return b; },
                eq() { return b; },
                is() { return b; },
                or() { return b; },
                order() { return b; },
                range() { return Promise.resolve({ data: [], error: null }); },
                maybeSingle() {
                    if (table === 'knowledge_documents') {
                        return Promise.resolve({ data: { id: 'doc-old', name: 'Comercial', instance_id: INST_COMERCIAL, metadata: {} }, error: null });
                    }
                    return Promise.resolve({ data: null, error: null });
                },
                single() {
                    return Promise.resolve({ data: { id: 'doc-old', instance_id: INST_COMERCIAL, ...(st.payload || {}) }, error: null });
                },
                then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); }
            };
            return b;
        }
    };

    // 1. Failing embedder must abort BEFORE deleting previous chunks
    await assert.rejects(
        commitCuratedDocument({
            supabase: mockDb,
            transformer: async () => {
                if (chunkDeleteCount > 0) chunkDeletedBeforeEmbed = true;
                throw new Error('Embed OOM');
            },
            tenantId: TENANT_ID,
            mode: 'replace',
            targetDocumentId: 'doc-old',
            content: '# Regra\n\nConteúdo válido longo o suficiente para gerar chunk semântico.',
            yieldMs: 0
        }),
        /Embed OOM/
    );
    assert.equal(chunkDeleteCount, 0, 'Existing chunks MUST NOT be deleted before new embeddings succeed');
    assert.equal(chunkDeletedBeforeEmbed, false);

    // 2. Successful replace with omitted instanceId preserves existingDoc.instance_id
    const okRes = await commitCuratedDocument({
        supabase: mockDb,
        transformer: createFakeTransformer(),
        tenantId: TENANT_ID,
        mode: 'replace',
        targetDocumentId: 'doc-old',
        content: '# Regra\n\nConteúdo válido longo o suficiente para gerar chunk semântico atualizado.',
        yieldMs: 0
    });
    assert.equal(okRes.document.instance_id, INST_COMERCIAL);
    assert.equal(insertedChunks[0].instance_id, INST_COMERCIAL);
});

test('hybridRetrieveKnowledge trusts authoritative SQL instance_id=null even if stale metadata.instance_id has old inbox UUID', async () => {
    const supabase = createCuratorSupabaseMock({
        rpcHybridRows: [
            {
                id: 'c-stale-global',
                document_id: 'd-global',
                instance_id: null,
                document_name: 'Doc Promovido para Global',
                content: 'Política de entrega expressa padrão válida para todas as unidades.',
                metadata: { instance_id: INST_COMERCIAL }, // stale!
                vector_similarity: 0.72,
                lexical_score: 0.5,
                rrf_score: 0.05
            },
            {
                id: 'c-true-inbox',
                document_id: 'd-inbox',
                instance_id: INST_COMERCIAL,
                document_name: 'Comercial Atual',
                content: 'Política de entrega expressa específica desta caixa comercial.',
                metadata: { instance_id: INST_COMERCIAL },
                vector_similarity: 0.72,
                lexical_score: 0.5,
                rrf_score: 0.062
            }
        ]
    });

    const matches = await hybridRetrieveKnowledge({
        supabase,
        queryEmbedding: new Array(384).fill(0.05),
        queryText: 'politica entrega expressa',
        tenantId: TENANT_ID,
        instanceId: INST_COMERCIAL,
        topK: 2
    });

    assert.equal(matches[0].id, 'c-true-inbox');
    assert.equal(matches[1].instance_id, null, 'Authoritative SQL column instance_id=null must win over stale metadata');
    assert.ok(matches[0].similarity > matches[1].similarity, 'Promoted global doc with stale metadata must not match priority bonus of true inbox doc');
});
