import test from 'node:test';
import assert from 'node:assert/strict';
import { pauseAiImmediatelyForHumanOperator } from '../src/automation-worker/human-pause.js';
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
