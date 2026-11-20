import test from 'node:test';
import assert from 'node:assert/strict';
import * as analyzer from '../src/api-gateway/inbox-knowledge-analyzer.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INSTANCE_ID = '22222222-2222-4222-8222-222222222222';

function createJobSupabaseMock({
    instance = null,
    company = { id: TENANT_ID, name: 'Burguer Plus', settings: { cnpj: '59075836000106', link_cardapio: 'https://pedir.site/burguerplus' } },
    messages = [],
    runs = [],
    knowledgeDocs = [],
    knowledgeChunks = []
} = {}) {
    let runSeq = 1;
    let docSeq = 1;
    const state = {
        instance: instance || {
            id: INSTANCE_ID,
            tenant_id: TENANT_ID,
            display_name: 'iPhone',
            last_knowledge_analyzed_at: null,
            last_knowledge_document_id: null,
            last_knowledge_run_id: null
        },
        company,
        messages,
        runs: [...runs],
        knowledgeDocs: [...knowledgeDocs],
        knowledgeChunks: [...knowledgeChunks],
        instanceUpdates: []
    };

    function matchesFilters(row, filters) {
        return filters.every(([kind, col, val]) => {
            if (kind === 'eq') return row[col] === val;
            if (kind === 'gt') return row[col] > val;
            if (kind === 'lte') return row[col] <= val;
            if (kind === 'in') return Array.isArray(val) && val.includes(row[col]);
            if (kind === 'is') return row[col] === val;
            if (kind === 'or') {
                // Handle keyset pagination OR: timestamp.gt.TS,and(timestamp.eq.TS,id.gt.ID)
                const expr = String(col || '');
                const keysetMatch = expr.match(/^timestamp\.gt\.([^,]+),and\(timestamp\.eq\.([^,]+),id\.gt\.([^)]+)\)$/);
                if (keysetMatch) {
                    const [, tsGt, tsEq, idGt] = keysetMatch;
                    return row.timestamp > tsGt || (row.timestamp === tsEq && String(row.id) > idGt);
                }
                if (expr.includes('instance_id.eq.')) {
                    const idMatch = expr.split('instance_id.eq.')[1]?.split(',')[0];
                    return row.instance_id == null || row.instance_id === idMatch;
                }
            }
            return true;
        });
    }

    const supabase = {
        _state: state,
        from(table) {
            const q = {
                table,
                op: 'select',
                filters: [],
                orders: [],
                limitVal: null,
                rangePair: null,
                payload: null
            };
            const execSelect = () => {
                let rows = [];
                if (table === 'whatsapp_instances') rows = [state.instance];
                else if (table === 'companies') rows = [state.company];
                else if (table === 'messages') rows = state.messages;
                else if (table === 'inbox_knowledge_runs') rows = state.runs;
                else if (table === 'knowledge_documents') rows = state.knowledgeDocs;
                else if (table === 'knowledge_chunks') rows = state.knowledgeChunks;

                let filtered = rows.filter(r => matchesFilters(r, q.filters));
                if (q.orders.length > 0) {
                    filtered = [...filtered].sort((a, b) => {
                        for (const { col, ascending } of q.orders) {
                            const cmp = String(a[col] || '').localeCompare(String(b[col] || ''));
                            if (cmp !== 0) return ascending ? cmp : -cmp;
                        }
                        return 0;
                    });
                }
                if (q.rangePair) {
                    filtered = filtered.slice(q.rangePair[0], q.rangePair[1] + 1);
                } else if (q.limitVal != null) {
                    filtered = filtered.slice(0, q.limitVal);
                }
                return filtered;
            };

            const builder = {
                select() { return builder; },
                insert(rows) {
                    q.op = 'insert';
                    q.payload = rows;
                    if (table === 'inbox_knowledge_runs') {
                        const inserted = rows.map(r => ({
                            id: r.id || `run-${runSeq++}`,
                            created_at: new Date().toISOString(),
                            ...r
                        }));
                        state.runs.push(...inserted);
                        q.insertedRows = inserted;
                    } else if (table === 'knowledge_documents') {
                        const inserted = rows.map(r => ({
                            id: r.id || `doc-${docSeq++}`,
                            created_at: new Date().toISOString(),
                            ...r
                        }));
                        state.knowledgeDocs.push(...inserted);
                        q.insertedRows = inserted;
                    } else if (table === 'knowledge_chunks') {
                        const inserted = rows.map((r, i) => ({ id: `chk-${state.knowledgeChunks.length + i + 1}`, ...r }));
                        state.knowledgeChunks.push(...inserted);
                        q.insertedRows = inserted;
                    }
                    return builder;
                },
                update(payload) {
                    q.op = 'update';
                    q.payload = payload;
                    return builder;
                },
                delete() { q.op = 'delete'; return builder; },
                eq(col, val) {
                    // Support metadata->>source eq filter via JSON key fallback
                    if (col === 'metadata->>source') {
                        q.filters.push(['eq_meta_source', col, val]);
                    } else {
                        q.filters.push(['eq', col, val]);
                    }
                    return builder;
                },
                gt(col, val) { q.filters.push(['gt', col, val]); return builder; },
                lte(col, val) { q.filters.push(['lte', col, val]); return builder; },
                in(col, val) { q.filters.push(['in', col, val]); return builder; },
                is(col, val) { q.filters.push(['is', col, val]); return builder; },
                or(expr) { q.filters.push(['or', expr]); return builder; },
                order(col, opts = {}) { q.orders.push({ col, ascending: opts.ascending !== false }); return builder; },
                limit(n) { q.limitVal = n; return builder; },
                range(a, b) { q.rangePair = [a, b]; return builder; },
                maybeSingle() {
                    if (q.op === 'select') {
                        const fixedFilters = q.filters.map(f => {
                            if (f[0] === 'eq_meta_source') return f;
                            return f;
                        });
                        q.filters = fixedFilters;
                        const allRows = execSelect().filter(r => {
                            return q.filters.every(f => f[0] !== 'eq_meta_source' || r?.metadata?.source === f[2]);
                        });
                        return Promise.resolve({ data: allRows[0] || null, error: null });
                    }
                    return builder.then(r => ({ data: Array.isArray(r.data) ? (r.data[0] || null) : r.data, error: r.error }));
                },
                single() {
                    if (q.op === 'insert') {
                        return Promise.resolve({ data: q.insertedRows[0], error: null });
                    }
                    return builder.then(r => ({ data: Array.isArray(r.data) ? (r.data[0] || null) : r.data, error: r.error }));
                },
                then(resolve, reject) {
                    if (q.op === 'insert') {
                        return Promise.resolve({ data: q.insertedRows, error: null }).then(resolve, reject);
                    }
                    if (q.op === 'delete') {
                        if (table === 'knowledge_chunks') {
                            state.knowledgeChunks = state.knowledgeChunks.filter(c => !matchesFilters(c, q.filters));
                        }
                        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
                    }
                    if (q.op === 'update') {
                        if (table === 'inbox_knowledge_runs') {
                            const updated = [];
                            for (const r of state.runs) {
                                if (matchesFilters(r, q.filters)) {
                                    Object.assign(r, q.payload);
                                    updated.push(r);
                                }
                            }
                            return Promise.resolve({ data: updated, error: null }).then(resolve, reject);
                        }
                        if (table === 'whatsapp_instances') {
                            if (matchesFilters(state.instance, q.filters)) {
                                Object.assign(state.instance, q.payload);
                                state.instanceUpdates.push({ ...q.payload });
                            }
                            return Promise.resolve({ data: [state.instance], error: null }).then(resolve, reject);
                        }
                        if (table === 'knowledge_documents') {
                            const updated = [];
                            for (const d of state.knowledgeDocs) {
                                if (matchesFilters(d, q.filters)) {
                                    Object.assign(d, q.payload);
                                    updated.push(d);
                                }
                            }
                            return Promise.resolve({ data: updated, error: null }).then(resolve, reject);
                        }
                    }
                    const rows = execSelect().filter(r =>
                        q.filters.every(f => f[0] !== 'eq_meta_source' || r?.metadata?.source === f[2])
                    );
                    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
                }
            };
            return builder;
        }
    };
    return supabase;
}

test('collectEligibleInboxMessages paginates across keyset boundaries including identical timestamps', async () => {
    const supabase = createJobSupabaseMock({
        messages: [
            { id: '01', tenant_id: TENANT_ID, instance_id: INSTANCE_ID, conversation_id: 'c1', sender_type: 'client', message_type: 'text', text_content: 'Vocês entregam no Jd São Judas agora?', timestamp: '2026-11-18T10:00:00.000Z' },
            { id: '02', tenant_id: TENANT_ID, instance_id: INSTANCE_ID, conversation_id: 'c1', sender_type: 'human', message_type: 'text', text_content: '*Atendente:*\n\nSim, entregamos no Jardim São Judas em até 45 minutos.', timestamp: '2026-11-18T10:00:00.000Z' },
            { id: '03', tenant_id: TENANT_ID, instance_id: INSTANCE_ID, conversation_id: 'c1', sender_type: 'bot', message_type: 'text', text_content: 'Olá bot antigo', timestamp: '2026-11-18T10:01:00.000Z' },
            { id: '04', tenant_id: TENANT_ID, instance_id: INSTANCE_ID, conversation_id: 'c1', sender_type: 'client', message_type: 'text', text_content: 'Qual chave pix vocês usam para pagamento adiantado?', timestamp: '2026-11-18T10:02:00.000Z' }
        ]
    });

    const collected = await analyzer.collectEligibleInboxMessages({
        supabase,
        tenantId: TENANT_ID,
        instanceId: INSTANCE_ID,
        windowStart: null,
        windowEnd: '2026-11-19T23:59:59.000Z',
        pageSize: 2
    });

    assert.equal(collected.eligibleMessages.length, 3, 'Should collect all 3 client/human messages across pages while excluding bot');
    assert.equal(collected.eligibleMessages[1].text, 'Sim, entregamos no Jardim São Judas em até 45 minutos.');
});

test('startInboxDeepAnalysis returns conflict 409 lock when an active run is already executing', async () => {
    const supabase = createJobSupabaseMock({
        runs: [{ id: 'run-active', tenant_id: TENANT_ID, instance_id: INSTANCE_ID, status: 'synthesizing', progress_pct: 55 }]
    });

    const res = await analyzer.startInboxDeepAnalysis({
        supabase,
        tenantId: TENANT_ID,
        instanceId: INSTANCE_ID,
        mode: 'incremental'
    });

    assert.equal(res.conflict, true);
    assert.equal(res.activeRun.id, 'run-active');
    assert.equal(supabase._state.runs.length, 1);
});

test('startInboxDeepAnalysis finishes cleanly as no_new_data without calling LLM when watermark has no unseen messages', async () => {
    const oldWatermark = '2026-11-19T12:00:00.000Z';
    const supabase = createJobSupabaseMock({
        instance: {
            id: INSTANCE_ID,
            tenant_id: TENANT_ID,
            display_name: 'iPhone',
            last_knowledge_analyzed_at: oldWatermark,
            last_knowledge_document_id: 'doc-prev',
            last_knowledge_run_id: 'run-prev'
        },
        messages: [
            { id: 'm1', tenant_id: TENANT_ID, instance_id: INSTANCE_ID, conversation_id: 'c1', sender_type: 'client', message_type: 'text', text_content: 'Mensagem antiga já analisada antes do corte', timestamp: '2026-11-19T11:00:00.000Z' }
        ]
    });

    let llmCalled = false;
    const res = await analyzer.startInboxDeepAnalysis({
        supabase,
        tenantId: TENANT_ID,
        instanceId: INSTANCE_ID,
        mode: 'incremental',
        nowIso: '2026-11-19T23:10:00.000Z',
        deps: {
            resolveApiKey: async () => 'fake-key',
            callLlmJson: async () => { llmCalled = true; return {}; },
            callLlmText: async () => { llmCalled = true; return ''; }
        }
    });

    await res.completionPromise;
    assert.equal(llmCalled, false);
    assert.equal(supabase._state.runs[0].status, 'no_new_data');
    assert.equal(supabase._state.runs[0].progress_pct, 100);
    assert.equal(supabase._state.instance.last_knowledge_analyzed_at, '2026-11-19T23:10:00.000Z');
});

test('startInboxDeepAnalysis runs full Map-Reduce + incremental merge + vectorization and advances watermark only on success', async () => {
    const supabase = createJobSupabaseMock({
        messages: [
            { id: 'm1', tenant_id: TENANT_ID, instance_id: INSTANCE_ID, conversation_id: 'c1', sender_type: 'client', message_type: 'text', text_content: 'Como funciona o pagamento por PIX na entrega?', timestamp: '2026-11-18T12:00:00.000Z' },
            { id: 'm2', tenant_id: TENANT_ID, instance_id: INSTANCE_ID, conversation_id: 'c1', sender_type: 'human', message_type: 'text', text_content: '*Atendente:*\n\nAceitamos PIX na hora pela chave CNPJ 59075836000106 e pedimos o comprovante.', timestamp: '2026-11-18T12:01:00.000Z' }
        ]
    });

    const fakeTransformer = async () => ({ data: new Float32Array(384).fill(0.05) });
    const res = await analyzer.startInboxDeepAnalysis({
        supabase,
        tenantId: TENANT_ID,
        instanceId: INSTANCE_ID,
        mode: 'incremental',
        nowIso: '2026-11-19T20:00:00.000Z',
        deps: {
            resolveApiKey: async () => 'fake-key',
            getTransformer: async () => fakeTransformer,
            callLlmJson: async () => ({
                behavior_signals: ['Atendimento objetivo, simpático e acolhedor no WhatsApp.'],
                business_rules: ['O pagamento via PIX utiliza a chave CNPJ oficial 59075836000106 mediante envio de comprovante.'],
                faq_solutions: [{ question: 'Como pagar via PIX?', answer: 'Pela chave CNPJ oficial enviada no atendimento com envio de comprovante.' }],
                sales_objections: ['Oferecer retirada rápida no balcão caso o bairro esteja fora da zona expressa.'],
                rejected_items: ['cumprimento simples']
            }),
            callLlmText: async () => `# 1. Identidade, Comportamento & Tom de Voz da Caixa
- Adotar linguagem próxima, objetiva e cordial chamando o cliente pelo primeiro nome.

# 2. Regras Operacionais, Políticas & Pagamentos
- Pagamentos via PIX utilizam exclusivamente a chave CNPJ oficial 59075836000106, solicitando confirmação por comprovante.

# 3. Perguntas Frequentes (FAQ) & Soluções Validadas
- Como pagar via PIX? Informar a chave CNPJ oficial da loja e confirmar o recebimento do comprovante antes da produção.

# 4. Playbook de Vendas & Contorno de Objeções
- Quando o cliente hesitar pelo tempo de entrega, sugerir retirada expressa no balcão da unidade.`
        }
    });

    await res.completionPromise;
    assert.equal(supabase._state.runs[0].status, 'completed');
    assert.equal(supabase._state.knowledgeDocs.length, 1);
    assert.equal(supabase._state.knowledgeDocs[0].instance_id, INSTANCE_ID);
    assert.equal(supabase._state.knowledgeDocs[0].metadata.source, 'inbox_deep_analyzer');
    assert.ok(supabase._state.knowledgeDocs[0].metadata.behavior_profile.includes('primeiro nome'));
    assert.equal(supabase._state.instance.last_knowledge_analyzed_at, '2026-11-19T20:00:00.000Z');
    assert.equal(supabase._state.instance.last_knowledge_document_id, supabase._state.knowledgeDocs[0].id);

    // 2nd incremental run with new message preserves existing document via incremental merge
    supabase._state.messages.push(
        { id: 'm3', tenant_id: TENANT_ID, instance_id: INSTANCE_ID, conversation_id: 'c2', sender_type: 'client', message_type: 'text', text_content: 'Vocês aceitam ticket alimentação VR no balcão?', timestamp: '2026-11-19T21:00:00.000Z' },
        { id: 'm4', tenant_id: TENANT_ID, instance_id: INSTANCE_ID, conversation_id: 'c2', sender_type: 'human', message_type: 'text', text_content: 'No momento não aceitamos vale-alimentação, apenas PIX e cartão crédito ou débito.', timestamp: '2026-11-19T21:01:00.000Z' }
    );

    let capturedExistingDocInReduce = '';
    const res2 = await analyzer.startInboxDeepAnalysis({
        supabase,
        tenantId: TENANT_ID,
        instanceId: INSTANCE_ID,
        mode: 'incremental',
        nowIso: '2026-11-19T22:00:00.000Z',
        deps: {
            resolveApiKey: async () => 'fake-key',
            getTransformer: async () => fakeTransformer,
            callLlmJson: async () => ({
                behavior_signals: [],
                business_rules: ['Não aceita vale-alimentação/VR; aceita PIX e cartões de crédito/débito.'],
                faq_solutions: [],
                sales_objections: [],
                rejected_items: []
            }),
            callLlmText: async (prompt) => {
                capturedExistingDocInReduce = prompt;
                return `# 1. Identidade, Comportamento & Tom de Voz da Caixa
- Adotar linguagem próxima, objetiva e cordial chamando o cliente pelo primeiro nome.

# 2. Regras Operacionais, Políticas & Pagamentos
- Pagamentos via PIX utilizam exclusivamente a chave CNPJ oficial 59075836000106, solicitando confirmação por comprovante.
- Não aceitamos vale-alimentação/VR; os pagamentos aceitos são PIX e cartões de crédito ou débito.`;
            }
        }
    });

    await res2.completionPromise;
    assert.match(capturedExistingDocInReduce, /59075836000106/, 'Incremental reduce must receive existing consolidated knowledge');
    assert.equal(supabase._state.knowledgeDocs.length, 1, 'Should update living inbox document in place');
    assert.equal(supabase._state.instance.last_knowledge_analyzed_at, '2026-11-19T22:00:00.000Z');
});

test('startInboxDeepAnalysis preserves previous watermark untouched if LLM fails mid-execution', async () => {
    const prevTs = '2026-11-18T00:00:00.000Z';
    const supabase = createJobSupabaseMock({
        instance: {
            id: INSTANCE_ID,
            tenant_id: TENANT_ID,
            display_name: 'Comercial',
            last_knowledge_analyzed_at: prevTs,
            last_knowledge_document_id: null,
            last_knowledge_run_id: null
        },
        messages: [
            { id: 'm1', tenant_id: TENANT_ID, instance_id: INSTANCE_ID, conversation_id: 'c1', sender_type: 'client', message_type: 'text', text_content: 'Qual o prazo para entrega técnica do totem?', timestamp: '2026-11-19T10:00:00.000Z' },
            { id: 'm2', tenant_id: TENANT_ID, instance_id: INSTANCE_ID, conversation_id: 'c1', sender_type: 'human', message_type: 'text', text_content: 'O prazo médio de produção e despacho é de 7 dias úteis após aprovação.', timestamp: '2026-11-19T10:02:00.000Z' }
        ]
    });

    const res = await analyzer.startInboxDeepAnalysis({
        supabase,
        tenantId: TENANT_ID,
        instanceId: INSTANCE_ID,
        mode: 'incremental',
        nowIso: '2026-11-19T22:30:00.000Z',
        deps: {
            resolveApiKey: async () => 'fake-key',
            callLlmJson: async () => { throw new Error('Gemini 503 overloaded'); }
        }
    });

    await res.completionPromise;
    assert.equal(supabase._state.runs[0].status, 'failed');
    assert.match(supabase._state.runs[0].error_message, /Gemini 503/i);
    assert.equal(supabase._state.instance.last_knowledge_analyzed_at, prevTs, 'Watermark MUST NOT advance on failure');
});
