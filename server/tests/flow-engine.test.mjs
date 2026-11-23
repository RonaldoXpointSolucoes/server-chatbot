import test from 'node:test';
import assert from 'node:assert/strict';

import { FlowEngine } from '../src/flow-runtime/index.js';
import {
    evaluateConditionExpression,
    evaluateConditionBlock,
    resolveMatchedOptionIndex,
    buildChoiceHandleCandidates,
    validateAndFormatBlockInput,
    isFlowAllowedForInstance,
    inferMediaMimeAndType,
    buildWebhookFetchOptions,
    extractJsonPath,
    executeSandboxedScript,
    resolveAbTestBranch,
    createTickLoopGuard,
} from '../src/flow-runtime/flow-helpers.js';

test('evaluateConditionBlock suporta lista block.items, operadores modernos e fallback -else', () => {
    const condBlock = {
        id: 'cond-1',
        flowType: 'condition',
        items: [
            { id: 'cond-item-1', varName: 'plano', operator: '≠', value: 'gratis' },
            { id: 'cond-item-2', varName: 'idade', operator: '>', value: '17' },
        ],
    };

    const resMatch1 = evaluateConditionBlock(condBlock, { plano: 'pro', idade: '15' });
    assert.equal(resMatch1.matched, true);
    assert.equal(resMatch1.item.id, 'cond-item-1');
    assert.ok(resMatch1.handleIds.includes('cond-item-1'));

    const resMatch2 = evaluateConditionBlock(condBlock, { plano: 'gratis', idade: '25' });
    assert.equal(resMatch2.matched, true);
    assert.equal(resMatch2.item.id, 'cond-item-2');
    assert.ok(resMatch2.handleIds.includes('cond-item-2'));

    const resElse = evaluateConditionBlock(condBlock, { plano: 'gratis', idade: '12' });
    assert.equal(resElse.matched, false);
    assert.ok(resElse.handleIds.includes('cond-1-else'));
});

test('evaluateConditionExpression cobre igual, diferente, contem, maior, menor, vazio e exists', () => {
    assert.equal(evaluateConditionExpression('SIM', 'equal', 'sim'), true);
    assert.equal(evaluateConditionExpression('nao', '≠', 'sim'), true);
    assert.equal(evaluateConditionExpression('Quero suporte urgente', 'contains', 'suporte'), true);
    assert.equal(evaluateConditionExpression('Quero vendas', 'not_contains', 'suporte'), true);
    assert.equal(evaluateConditionExpression('5511999999999', 'starts_with', '5511'), true);
    assert.equal(evaluateConditionExpression('42', '>', '10'), true);
    assert.equal(evaluateConditionExpression('5', '<', '10'), true);
    assert.equal(evaluateConditionExpression('   ', 'is_empty', ''), true);
    assert.equal(evaluateConditionExpression('ok', 'exists', ''), true);
});

test('resolveMatchedOptionIndex e validateAndFormatBlockInput não avançam em opção inválida e validam tipos', () => {
    const opts = [
        { id: 'opt-a', label: 'Comercial' },
        { id: 'opt-b', label: 'Suporte Técnico' },
    ];
    assert.equal(resolveMatchedOptionIndex('1', opts), 0);
    assert.equal(resolveMatchedOptionIndex('suporte técnico', opts), 1);
    assert.equal(resolveMatchedOptionIndex('99', opts), -1);

    const handleCandidates = buildChoiceHandleCandidates('btn-blk', 1, opts[1]);
    assert.ok(handleCandidates.includes('btn-blk-opt-1'));
    assert.ok(handleCandidates.includes('opt-b'));

    const badBtn = validateAndFormatBlockInput(
        { id: 'btn-blk', flowType: 'buttons', options: opts },
        { textMessage: 'banana' }
    );
    assert.equal(badBtn.valid, false);
    assert.equal(badBtn.matchedIndex, -1);

    const goodBtn = validateAndFormatBlockInput(
        { id: 'btn-blk', flowType: 'buttons', options: opts },
        { textMessage: '2' }
    );
    assert.equal(goodBtn.valid, true);
    assert.equal(goodBtn.matchedIndex, 1);
    assert.equal(goodBtn.value, 'Suporte Técnico');

    const badEmail = validateAndFormatBlockInput({ flowType: 'email_input' }, { textMessage: 'invalido' });
    assert.equal(badEmail.valid, false);
    const goodEmail = validateAndFormatBlockInput({ flowType: 'email_input' }, { textMessage: '  Teste@Empresa.COM ' });
    assert.equal(goodEmail.valid, true);
    assert.equal(goodEmail.value, 'teste@empresa.com');

    const goodNum = validateAndFormatBlockInput({ flowType: 'number_input' }, { textMessage: '49,90' });
    assert.equal(goodNum.valid, true);
    assert.equal(goodNum.value, '49.9');

    const goodDate = validateAndFormatBlockInput({ flowType: 'date_input' }, { textMessage: '25/12/2026' });
    assert.equal(goodDate.valid, true);
    assert.equal(goodDate.value, '25/12/2026');
    const badDate = validateAndFormatBlockInput({ flowType: 'date_input' }, { textMessage: '32/15/2026' });
    assert.equal(badDate.valid, false);

    const goodRating = validateAndFormatBlockInput({ flowType: 'rating' }, { textMessage: '5' });
    assert.equal(goodRating.valid, true);
    assert.equal(goodRating.value, '5');
    const badRating = validateAndFormatBlockInput({ flowType: 'rating' }, { textMessage: '9' });
    assert.equal(badRating.valid, false);

    // file_input deve aceitar documento/imagem mesmo sem textMessage (sem legenda)
    const fileRes = validateAndFormatBlockInput(
        { flowType: 'file_input' },
        { textMessage: '', mediaUrl: 'https://cdn.example.com/comprovante.pdf' }
    );
    assert.equal(fileRes.valid, true);
    assert.equal(fileRes.value, 'https://cdn.example.com/comprovante.pdf');
});

test('buildWebhookFetchOptions nunca inclui body em requisição GET/HEAD e extractJsonPath resolve caminhos', () => {
    const getSpec = buildWebhookFetchOptions(
        {
            flowType: 'webhook',
            method: 'GET',
            url: 'https://viacep.com.br/ws/{{cep}}/json/',
            body: '{"ignored":"for_get"}',
            response_path: 'localidade',
        },
        { cep: '01001000' }
    );
    assert.equal(getSpec.url, 'https://viacep.com.br/ws/01001000/json/');
    assert.equal(getSpec.fetchOptions.method, 'GET');
    assert.equal('body' in getSpec.fetchOptions, false);
    assert.equal(extractJsonPath({ cep: '01001-000', localidade: 'São Paulo' }, getSpec.responsePath), 'São Paulo');

    const postSpec = buildWebhookFetchOptions(
        {
            flowType: 'webhook',
            method: 'post',
            url: 'https://api.example.com/hook',
            body: '{"cliente":"{{nome}}"}',
        },
        { nome: 'Ronaldo' }
    );
    assert.equal(postSpec.fetchOptions.method, 'POST');
    assert.equal(postSpec.fetchOptions.body, '{"cliente":"Ronaldo"}');
});

test('executeSandboxedScript calcula variáveis em sandbox e bloqueia loop infinito por timeout', () => {
    const ok = executeSandboxedScript(
        'variables.total = Number(variables.preco || 0) * Number(variables.qtd || 1); setVar("desconto", 10);',
        { preco: '50', qtd: '3' },
        150
    );
    assert.equal(ok.success, true);
    assert.equal(ok.variables.total, 150);
    assert.equal(ok.variables.desconto, 10);

    const infinite = executeSandboxedScript('while (true) {}', {}, 60);
    assert.equal(infinite.success, false);
    assert.match(String(infinite.error), /timed out|Script/i);
});

test('isFlowAllowedForInstance respeita __META__.allowedInstanceIds e createTickLoopGuard bloqueia ciclo no mesmo tick', () => {
    const scopedFlow = {
        id: 'flow-test',
        trigger_rules: [
            { type: 'EXACT', keyword: '#teste' },
            { type: '__META__', allowedInstanceIds: ['inst-foodnext'] },
        ],
    };
    assert.equal(isFlowAllowedForInstance(scopedFlow, 'inst-foodnext'), true);
    assert.equal(isFlowAllowedForInstance(scopedFlow, 'inst-outra-producao'), false);

    const unscopedFlow = {
        id: 'flow-prod',
        trigger_rules: [{ type: 'EXACT', keyword: 'oi' }],
    };
    assert.equal(isFlowAllowedForInstance(unscopedFlow, 'inst-qualquer'), true);

    const guard = createTickLoopGuard(30, 2);
    assert.equal(guard.recordVisit('grp-A', 0).aborted, false);
    assert.equal(guard.recordVisit('grp-A', 0).aborted, false);
    assert.equal(guard.recordVisit('grp-A', 0).aborted, true);

    const ab = resolveAbTestBranch({ id: 'ab-1', splitA: 100 });
    assert.equal(ab.variant, 'a');
    assert.ok(ab.handleIds.includes('ab-1-a'));

    assert.equal(inferMediaMimeAndType('https://cdn.x.com/doc.pdf?token=1', 'embed').mimetype, 'application/pdf');
    assert.equal(inferMediaMimeAndType('https://cdn.x.com/audio.mp3', 'audio').mimetype, 'audio/mpeg');
});


function createMockSupabase(initialTables = {}) {
    const tables = {
        conversation_states: [],
        flows: [],
        flow_versions: [],
        companies: [{ id: 'tenant-1', name: 'X-Point', settings: { businessName: 'FoodNext Test' } }],
        tenants: [{ id: 'tenant-1', name: 'X-Point', settings: {} }],
        contacts: [{ tenant_id: 'tenant-1', whatsapp_jid: '5511975960999@s.whatsapp.net', name: 'Ronaldo' }],
        conversations: [{ id: 'conv-1', tenant_id: 'tenant-1', status: 'open', ai_paused: false, tags: [] }],
        messages: [],
        execution_logs: [],
        wa_outgoing_messages: [],
        ...initialTables,
    };
    let seq = 1;

    function buildQuery(tableName) {
        const filters = [];
        let op = 'select';
        let patchPayload = null;
        let orderCfg = null;
        let limitN = null;

        const applyFilters = (rows) => rows.filter((row) => filters.every((fn) => fn(row)));

        const execute = () => {
            const list = tables[tableName] || [];
            if (op === 'insert') {
                const items = (Array.isArray(patchPayload) ? patchPayload : [patchPayload]).map((p) => {
                    const row = {
                        id: p.id || `${tableName}-${seq++}`,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        ...JSON.parse(JSON.stringify(p)),
                    };
                    list.push(row);
                    return row;
                });
                return { data: items, error: null };
            }
            if (op === 'update') {
                const updated = [];
                for (const row of list) {
                    if (filters.every((fn) => fn(row))) {
                        Object.assign(row, JSON.parse(JSON.stringify(patchPayload)), { updated_at: new Date().toISOString() });
                        updated.push(row);
                    }
                }
                return { data: updated, error: null };
            }
            let out = applyFilters(list).map((r) => {
                if (tableName === 'flows' && r.active_version_id && !r.flow_versions) {
                    const fv = (tables.flow_versions || []).find((v) => v.id === r.active_version_id);
                    return { ...r, flow_versions: fv || null };
                }
                return r;
            });
            if (orderCfg) {
                out.sort((a, b) => {
                    const cmp = String(a[orderCfg.col] || '').localeCompare(String(b[orderCfg.col] || ''));
                    return orderCfg.asc ? cmp : -cmp;
                });
            }
            if (typeof limitN === 'number') {
                out = out.slice(0, limitN);
            }
            return { data: out, error: null };
        };

        const chain = {
            select() {
                if (op === 'select') op = 'select';
                return chain;
            },
            insert(payload) {
                op = 'insert';
                patchPayload = payload;
                return chain;
            },
            update(payload) {
                op = 'update';
                patchPayload = payload;
                return chain;
            },
            eq(col, val) {
                filters.push((r) => r[col] === val);
                return chain;
            },
            not(col, matchOp, val) {
                if (matchOp === 'is' && val === null) {
                    filters.push((r) => r[col] !== null && r[col] !== undefined);
                }
                return chain;
            },
            in(col, vals) {
                filters.push((r) => Array.isArray(vals) && vals.includes(r[col]));
                return chain;
            },
            order(col, opts = {}) {
                orderCfg = { col, asc: opts.ascending !== false };
                return chain;
            },
            limit(n) {
                limitN = n;
                return chain;
            },
            single() {
                const res = execute();
                const first = Array.isArray(res.data) ? res.data[0] : res.data;
                return Promise.resolve({ data: first || null, error: first ? null : { message: 'Not found' } });
            },
            maybeSingle() {
                const res = execute();
                const first = Array.isArray(res.data) ? res.data[0] : res.data;
                return Promise.resolve({ data: first || null, error: null });
            },
            then(resolve, reject) {
                return Promise.resolve(execute()).then(resolve, reject);
            },
        };
        return chain;
    }

    return {
        tables,
        from(tableName) {
            return buildQuery(tableName);
        },
    };
}

function createMockSocket() {
    const sent = [];
    const presences = [];
    let msgSeq = 1;
    return {
        sent,
        presences,
        ws: { isOpen: true },
        async sendPresenceUpdate(status, jid) {
            presences.push({ status, jid });
        },
        async sendMessage(jid, payload, options = {}) {
            const id = `BAE_MOCK_${msgSeq++}`;
            sent.push({ id, jid, payload, options });
            return { key: { id, remoteJid: jid, fromMe: true } };
        },
    };
}

test('FlowEngine integra escopo de instância, retry em buttons, condition items, script, reply quoted, file_input e handoff ai_paused', async () => {
    const nodes = [
        {
            id: 'grp-start',
            type: 'typebot_group',
            position: { x: 0, y: 0 },
            data: {
                blocks: [
                    { id: 'b-start', flowType: 'start', label: 'Início' },
                    { id: 'b-text', flowType: 'text', text: 'Olá {{nome_cliente}}, iniciando teste!' },
                    {
                        id: 'b-btn',
                        flowType: 'buttons',
                        text: 'Escolha o setor:',
                        var_name: 'setor',
                        options: ['Comercial', 'Suporte'],
                    },
                ],
            },
        },
        {
            id: 'grp-suporte',
            type: 'typebot_group',
            position: { x: 300, y: 0 },
            data: {
                blocks: [
                    { id: 'b-ask-name', flowType: 'text_input', text: 'Qual seu problema?', var_name: 'problema' },
                    { id: 'b-script', flowType: 'script', code: 'setVar("resumo", String(variables.problema || "").toUpperCase());' },
                    {
                        id: 'b-cond',
                        flowType: 'condition',
                        items: [{ id: 'cond-urgent', varName: 'setor', operator: '≠', value: 'Comercial' }],
                    },
                ],
            },
        },
        {
            id: 'grp-reply-handoff',
            type: 'typebot_group',
            position: { x: 600, y: 0 },
            data: {
                blocks: [
                    { id: 'b-reply', flowType: 'reply', text: 'Recebemos: {{resumo}}', quote_message: true },
                    { id: 'b-cmd', flowType: 'command', command_action: 'add_tag', command_value: 'vip-teste' },
                    { id: 'b-file', flowType: 'file_input', text: 'Envie o anexo sem legenda:', var_name: 'anexo_url' },
                    { id: 'b-handoff', flowType: 'handoff', text: 'Transferido para humano com anexo {{anexo_url}}.' },
                ],
            },
        },
    ];
    const edges = [
        { id: 'e1', source: 'grp-start', sourceHandle: 'b-btn-opt-1', target: 'grp-suporte' },
        { id: 'e2', source: 'grp-suporte', sourceHandle: 'cond-urgent', target: 'grp-reply-handoff' },
    ];

    const mockDb = createMockSupabase({
        flow_versions: [{ id: 'ver-1', flow_id: 'flow-1', nodes, edges }],
        flows: [
            {
                id: 'flow-1',
                tenant_id: 'tenant-1',
                name: 'Fluxo Escopado FoodNext',
                active_version_id: 'ver-1',
                trigger_rules: [
                    { type: 'EXACT', value: '#teste-all' },
                    { type: '__META__', allowedInstanceIds: ['inst-foodnext'] },
                ],
            },
        ],
    });
    const engine = new FlowEngine({ supabase: mockDb, sleep: async () => {} });
    const sock = createMockSocket();
    const jid = '5511975960999@s.whatsapp.net';

    // 1. Outra instância de produção NÃO pode disparar fluxo restrito à FoodNext
    const ignoredOtherInstance = await engine.processIncomingMessage({
        tenantId: 'tenant-1',
        instanceId: 'inst-producao',
        conversationId: 'conv-1',
        jid,
        textMessage: '#teste-all',
        sock,
    });
    assert.equal(ignoredOtherInstance, false);
    assert.equal(sock.sent.length, 0);

    // 2. Na FoodNext, o gatilho dispara Start -> Text -> Buttons (text prioritário sobre label)
    const triggered = await engine.processIncomingMessage({
        tenantId: 'tenant-1',
        instanceId: 'inst-foodnext',
        conversationId: 'conv-1',
        jid,
        textMessage: '#teste-all',
        sock,
    });
    assert.equal(triggered, true);
    assert.equal(sock.sent.length, 2);
    assert.match(sock.sent[0].payload.text, /Olá Ronaldo, iniciando teste!/);
    assert.match(sock.sent[1].payload.text, /Escolha o setor:/);

    // 3. Resposta inválida ("9") NO buttons pede correção sem avançar em falso
    await engine.processIncomingMessage({
        tenantId: 'tenant-1',
        instanceId: 'inst-foodnext',
        conversationId: 'conv-1',
        jid,
        textMessage: '9',
        sock,
    });
    assert.match(sock.sent[2].payload.text, /Opção não reconhecida/);

    // 4. Resposta válida ("2" = Suporte) segue b-btn-opt-1 -> b-ask-name (text_input corrigido!)
    await engine.processIncomingMessage({
        tenantId: 'tenant-1',
        instanceId: 'inst-foodnext',
        conversationId: 'conv-1',
        jid,
        textMessage: '2',
        sock,
    });
    assert.equal(sock.sent[3].payload.text, 'Qual seu problema?');

    // 5. Resposta texto "erro pix" -> Script -> Condition (≠ Comercial) -> Reply (quoted!) -> Command add_tag -> File Input
    const rawMsgInbound = { key: { id: 'INBOUND_MSG_77', remoteJid: jid, fromMe: false } };
    await engine.processIncomingMessage({
        tenantId: 'tenant-1',
        instanceId: 'inst-foodnext',
        conversationId: 'conv-1',
        jid,
        textMessage: 'erro pix',
        rawPayload: rawMsgInbound,
        sock,
    });
    const replySend = sock.sent[4];
    assert.equal(replySend.payload.text, 'Recebemos: ERRO PIX');
    assert.deepEqual(replySend.options.quoted, rawMsgInbound);
    assert.equal(sock.sent[5].payload.text, 'Envie o anexo sem legenda:');
    assert.ok(mockDb.tables.conversations[0].tags.includes('vip-teste'));

    // 6. Envio de arquivo sem legenda (textMessage === '', mediaUrl presente) -> Handoff envia aviso e pausa IA!
    await engine.processIncomingMessage({
        tenantId: 'tenant-1',
        instanceId: 'inst-foodnext',
        conversationId: 'conv-1',
        jid,
        textMessage: '',
        mediaUrl: 'https://cdn.example.com/nota.pdf',
        messageType: 'document',
        sock,
    });
    assert.match(sock.sent[6].payload.text, /Transferido para humano com anexo https:\/\/cdn\.example\.com\/nota\.pdf/);
    assert.equal(mockDb.tables.conversations[0].ai_paused, true);
    assert.equal(mockDb.tables.conversation_states[0].status, 'HANDOFF_HUMAN');
});

test('FlowEngine quebra imediatamente loop infinito de Jump sem pausa e ciclo de Subfluxo', async () => {
    const loopNodes = [
        {
            id: 'grp-a',
            type: 'typebot_group',
            data: { blocks: [{ id: 'b-a', flowType: 'text', text: 'Ping' }, { id: 'j-a', flowType: 'jump', target_group_id: 'grp-b' }] },
        },
        {
            id: 'grp-b',
            type: 'typebot_group',
            data: { blocks: [{ id: 'b-b', flowType: 'text', text: 'Pong' }, { id: 'j-b', flowType: 'jump', target_group_id: 'grp-a' }] },
        },
    ];
    const mockDb = createMockSupabase({
        flow_versions: [{ id: 'ver-loop', flow_id: 'flow-loop', nodes: loopNodes, edges: [] }],
        flows: [
            {
                id: 'flow-loop',
                tenant_id: 'tenant-1',
                name: 'Fluxo Loop',
                active_version_id: 'ver-loop',
                trigger_rules: [{ type: 'EXACT', value: '#loop' }],
            },
        ],
    });
    const engine = new FlowEngine({ supabase: mockDb, sleep: async () => {} });
    const sock = createMockSocket();

    await engine.processIncomingMessage({
        tenantId: 'tenant-1',
        instanceId: 'inst-foodnext',
        conversationId: 'conv-1',
        jid: '5511975960999@s.whatsapp.net',
        textMessage: '#loop',
        sock,
    });

    // Guardiao aborta no maximo apos 2 visitas ao mesmo bloco (bem antes de 25 mensagens!)
    assert.ok(sock.sent.length <= 4, `Esperado <= 4 mensagens antes do corte anti-loop, recebeu ${sock.sent.length}`);
    assert.equal(mockDb.tables.conversation_states[0].status, 'FINISHED');
    assert.ok(mockDb.tables.execution_logs.some((l) => l.action_taken === 'LOOP_ABORTED'));
});
