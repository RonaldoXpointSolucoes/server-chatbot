import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pauseAiImmediatelyForHumanOperator,
  evaluateRecentHumanConversationGuard,
  fetchRecentHumanConversationGuard
} from '../src/automation-worker/human-pause.js';
import AutomationWorker from '../src/automation-worker/agent.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const INSTANCE_ID = '22222222-2222-4222-8222-222222222222';
const CONTACT_ID = '33333333-3333-4333-8333-333333333333';
const CONV_ID = '44444444-4444-4444-8444-444444444444';

function createPauseMockSupabase() {
  const state = {
    contacts: [{ id: CONTACT_ID, tenant_id: TENANT_ID, phone: '5511992144843', bot_status: 'active' }],
    conversations: [{ id: CONV_ID, tenant_id: TENANT_ID, instance_id: INSTANCE_ID, contact_id: CONTACT_ID, status: 'bot', ai_paused: false, ai_paused_manually: false, last_message_at: '2026-11-20T18:00:00Z' }],
    conversation_states: [{ id: 'st-1', tenant_id: TENANT_ID, remote_jid: '5511992144843@s.whatsapp.net', status: 'BOT_ACTIVE' }]
  };

  const supabase = {
    _state: state,
    from(table) {
      const q = { op: 'select', filters: [], payload: null };
      const applyFilters = (rows) => rows.filter((r) => q.filters.every(([kind, col, val]) => {
        if (kind === 'eq') return r[col] === val;
        if (kind === 'in') return Array.isArray(val) && val.includes(r[col]);
        return true;
      }));
      const execSelect = () => applyFilters(state[table] || []);
      const builder = {
        select: () => builder,
        update: (p) => { q.op = 'update'; q.payload = p; return builder; },
        eq: (c, v) => { q.filters.push(['eq', c, v]); return builder; },
        in: (c, v) => { q.filters.push(['in', c, v]); return builder; },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: execSelect()[0] || null, error: null }),
        then(resolve, reject) {
          if (q.op === 'update') {
            const matched = applyFilters(state[table] || []);
            for (const row of matched) Object.assign(row, q.payload);
            return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: execSelect(), error: null }).then(resolve, reject);
        }
      };
      return builder;
    }
  };
  return supabase;
}

test('pauseAiImmediatelyForHumanOperator cancels pending AI jobs, sets human pause lock, updates conversation to open+paused and hands off FlowEngine', async () => {
  const supabase = createPauseMockSupabase();
  AutomationWorker.pendingJobs = new Map();
  AutomationWorker.recentHumanPauseMap = new Map();

  let timerFired = false;
  const fakeTimer = setTimeout(() => { timerFired = true; }, 5000);
  AutomationWorker.pendingJobs.set(CONV_ID, {
    key: CONV_ID,
    params: { conversationId: CONV_ID, contactId: CONTACT_ID, jid: '5511992144843@s.whatsapp.net', phone: '5511992144843' },
    generationTimeout: fakeTimer,
    sendTimeout: null,
    typingTimeout: null,
    cancelled: false
  });

  const res = await pauseAiImmediatelyForHumanOperator({
    supabase,
    AutomationWorker,
    tenantId: TENANT_ID,
    instanceId: INSTANCE_ID,
    jid: '5511992144843@s.whatsapp.net',
    reason: 'envio_operador_crm'
  });

  assert.equal(res.ok, true);
  assert.equal(res.conversationId, CONV_ID);
  assert.equal(timerFired, false);
  assert.equal(AutomationWorker.pendingJobs.size, 0, 'Pending AI job must be removed immediately');
  assert.ok(AutomationWorker.isRecentlyHumanPaused({ conversationId: CONV_ID, jid: '5511992144843@s.whatsapp.net' }));
  assert.equal(supabase._state.conversations[0].status, 'open');
  assert.equal(supabase._state.conversations[0].ai_paused, true);
  assert.equal(supabase._state.conversations[0].ai_paused_manually, true);
  assert.equal(supabase._state.conversation_states[0].status, 'HANDOFF_HUMAN');

  // processMessage must refuse re-queuing while pause override is active
  await AutomationWorker.processMessage({
    tenantId: TENANT_ID,
    instanceId: INSTANCE_ID,
    conversationId: CONV_ID,
    contactId: CONTACT_ID,
    jid: '5511992144843@s.whatsapp.net',
    textMessage: 'Oi'
  });
  assert.equal(AutomationWorker.pendingJobs.size, 0, 'processMessage must not schedule AI during human pause lock');

  // Explicit manual resume clears override cleanly
  AutomationWorker.clearHumanPauseOverride(CONV_ID, '5511992144843@s.whatsapp.net', CONTACT_ID);
  assert.equal(AutomationWorker.isRecentlyHumanPaused({ conversationId: CONV_ID }), null);
});

test('AutomationWorker.triggerGeneration aborts BEFORE calling generateResponse if conversation became human-paused', async (t) => {
  AutomationWorker.pendingJobs = new Map();
  AutomationWorker.recentHumanPauseMap = new Map();
  AutomationWorker.markHumanPause({ conversationId: CONV_ID, jid: '5511992144843@s.whatsapp.net', reason: 'operador_enviou' });

  let llmCalled = false;
  t.mock.method(AutomationWorker, 'generateResponse', async () => {
    llmCalled = true;
    return 'Resposta indevida';
  });

  AutomationWorker.pendingJobs.set(CONV_ID, {
    key: CONV_ID,
    textMessages: ['Oi, tem desconto?'],
    params: { tenantId: TENANT_ID, instanceId: INSTANCE_ID, conversationId: CONV_ID, contactId: CONTACT_ID, jid: '5511992144843@s.whatsapp.net' },
    generationTimeout: null,
    sendTimeout: null,
    typingTimeout: null,
    generating: false,
    obsolete: false,
    cancelled: false
  });

  await AutomationWorker.triggerGeneration(CONV_ID);
  assert.equal(llmCalled, false, 'LLM must never be invoked after operator intervened');
  assert.equal(AutomationWorker.pendingJobs.size, 0);
  AutomationWorker.recentHumanPauseMap.clear();
});

test('evaluateRecentHumanConversationGuard blocks AI even after ticket resolved when human sent Pix <30m ago', () => {
  const nowMs = Date.UTC(2026, 10, 22, 0, 29, 25);
  const res = evaluateRecentHumanConversationGuard([
    { sender_type: 'automation', direction: 'outbound', timestamp: '2026-11-22T00:15:23Z', text_content: 'Pedido a caminho' },
    { sender_type: 'client', direction: 'inbound', timestamp: '2026-11-22T00:26:39Z', text_content: 'Manda a chave do pix' },
    { sender_type: 'human', direction: 'outbound', timestamp: '2026-11-22T00:27:30Z', text_content: '*Ronaldo Clemente:* Chave Pix: 59075836000106' },
    { sender_type: 'system', direction: 'outgoing', timestamp: '2026-11-22T00:27:35Z', text_content: '✅ Resolvido por Agente dia 21/11/2026, 21:27:35' },
    { sender_type: 'client', direction: 'inbound', timestamp: '2026-11-22T00:29:23Z', text_content: 'Chave dando inválida' }
  ], { nowMs });

  assert.equal(res.blocked, true);
  assert.equal(res.reason, 'recent_human_operator_message');
});

test('evaluateRecentHumanConversationGuard ignores automation messages, expired human msgs (>30m), and explicit AI resume', () => {
  const nowMs = Date.UTC(2026, 10, 22, 1, 15, 0);

  // Explicit resume newer than human message allows AI
  const resumedRes = evaluateRecentHumanConversationGuard([
    { sender_type: 'human', direction: 'outbound', timestamp: new Date(nowMs - 120000).toISOString(), text_content: 'Oi' },
    { sender_type: 'system', direction: 'outgoing', timestamp: new Date(nowMs - 30000).toISOString(), text_content: '▶️ IA Luna Retomada por Ronaldo' }
  ], { nowMs });
  assert.equal(resumedRes.blocked, false);
  assert.equal(resumedRes.reason, 'explicit_ai_resume');

  // Automation outbound alone does not block AI
  const autoRes = evaluateRecentHumanConversationGuard([
    { sender_type: 'automation', direction: 'outbound', timestamp: new Date(nowMs - 60000).toISOString(), text_content: 'Pedido saiu para entrega' }
  ], { nowMs });
  assert.equal(autoRes.blocked, false);

  // Human outbound older than 30m allows new session
  const expiredRes = evaluateRecentHumanConversationGuard([
    { sender_type: 'human', direction: 'outbound', timestamp: new Date(nowMs - 45 * 60000).toISOString(), text_content: 'Tudo bem?' }
  ], { nowMs });
  assert.equal(expiredRes.blocked, false);
});

test('fetchRecentHumanConversationGuard + checkCanSendAiResponse block on real conversation schema without 400 error', async () => {
  const realCols = new Set(['id', 'status', 'ai_paused', 'ai_paused_manually', 'snoozed_until']);
  const contactCols = new Set(['id', 'bot_status', 'bot_paused_until']);
  const nowIso = new Date().toISOString();
  const futureIso = new Date(Date.now() + 20 * 60000).toISOString();

  // Temporary test verifying checkCanSendAiResponse returns disallowed cleanly when conversation is paused OR contact has bot_paused_until > now
  // Note: checkCanSendAiResponse uses module supabase directly; we test pure evaluator + fetchRecentHumanConversationGuard here
  const mockSb = {
    from(table) {
      let cols = '';
      const q = {
        select(c) { cols = c; return q; },
        eq() { return q; },
        order() { return q; },
        limit() { return q; },
        maybeSingle: async () => {
          if (table === 'conversations') {
            for (const col of cols.split(',').map(s => s.trim())) {
              if (!realCols.has(col)) return { data: null, error: { code: '42703', message: `column conversations.${col} does not exist` } };
            }
            return { data: { id: CONV_ID, status: 'open', ai_paused: true, ai_paused_manually: true, snoozed_until: null }, error: null };
          }
          if (table === 'contacts') {
            for (const col of cols.split(',').map(s => s.trim())) {
              if (!contactCols.has(col)) return { data: null, error: { code: '42703', message: `column contacts.${col} does not exist` } };
            }
            return { data: { id: CONTACT_ID, bot_status: 'active', bot_paused_until: futureIso }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve) {
          return Promise.resolve({
            data: [
              { sender_type: 'human', direction: 'outbound', timestamp: nowIso, text_content: 'Nosso pix é 59075836000106' }
            ],
            error: null
          }).then(resolve);
        }
      };
      return q;
    }
  };

  const guard = await fetchRecentHumanConversationGuard({ supabase: mockSb, conversationId: CONV_ID });
  assert.equal(guard.blocked, true);

  AutomationWorker.recentHumanPauseMap = new Map();
  const realCheckConvPaused = await AutomationWorker.checkCanSendAiResponse(CONV_ID, CONTACT_ID, '5511992144843@s.whatsapp.net', mockSb);
  assert.equal(realCheckConvPaused.allowed, false);
});

test('AutomationWorker.checkCanSendAiResponse blocks even on resolved+unpaused conv when human sent Pix <30m ago and enforces real schema', async () => {
  const realConvCols = new Set(['id', 'status', 'ai_paused', 'ai_paused_manually', 'snoozed_until']);
  const realContactCols = new Set(['id', 'bot_status', 'bot_paused_until']);
  const nowIso = new Date().toISOString();

  const mockLucieneSb = {
    from(table) {
      let cols = '';
      const q = {
        select(c) { cols = c; return q; },
        eq() { return q; },
        order() { return q; },
        limit() { return q; },
        maybeSingle: async () => {
          if (table === 'conversations') {
            for (const col of cols.split(',').map(s => s.trim())) {
              assert.ok(realConvCols.has(col), `Invalid conversations column queried: ${col}`);
            }
            return { data: { id: CONV_ID, status: 'resolved', ai_paused: false, ai_paused_manually: false, snoozed_until: null }, error: null };
          }
          if (table === 'contacts') {
            for (const col of cols.split(',').map(s => s.trim())) {
              assert.ok(realContactCols.has(col), `Invalid contacts column queried: ${col}`);
            }
            return { data: { id: CONTACT_ID, bot_status: 'active', bot_paused_until: null }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve) {
          return Promise.resolve({
            data: [
              { sender_type: 'human', direction: 'outbound', timestamp: nowIso, text_content: '*Ronaldo Clemente:* Nosso pix é 59075836000106' },
              { sender_type: 'system', direction: 'outgoing', timestamp: nowIso, text_content: '✅ Resolvido por Agente' }
            ],
            error: null
          }).then(resolve);
        }
      };
      return q;
    }
  };

  AutomationWorker.recentHumanPauseMap = new Map();
  const check = await AutomationWorker.checkCanSendAiResponse(CONV_ID, CONTACT_ID, '5511995072270@s.whatsapp.net', mockLucieneSb);
  assert.equal(check.allowed, false);
  assert.match(check.reason, /Operador humano/);
});
