import test from 'node:test';
import assert from 'node:assert/strict';
import { isContactDefinitivelyPaused, resolveOperatorSendAiPauseAction } from './aiPause.mjs';

test('resolveOperatorSendAiPauseAction pauses immediately with +30m when globalAiEnabled is active', () => {
  const nowMs = Date.UTC(2026, 10, 20, 18, 0, 0);
  const action = resolveOperatorSendAiPauseAction({
    globalAiEnabled: true,
    contact: { id: 'c1', ai_paused: false, bot_status: 'active', conv_status: 'bot' },
    nowMs
  });

  assert.equal(action.shouldUpdateConversation, true);
  assert.equal(action.shouldCancelBackend, true);
  assert.equal(action.payload?.ai_paused, true);
  assert.equal(action.payload?.ai_paused_manually, true);
  assert.equal(action.payload?.ai_paused_until, new Date(nowMs + 30 * 60000).toISOString());
});

test('resolveOperatorSendAiPauseAction preserves definitive pause without downgrading to temp pause', () => {
  const pausedAction = resolveOperatorSendAiPauseAction({
    globalAiEnabled: true,
    contact: { id: 'c2', ai_paused: true, bot_status: 'paused', ai_paused_manually: true }
  });
  assert.equal(isContactDefinitivelyPaused({ bot_status: 'paused' }), true);
  assert.equal(pausedAction.shouldUpdateConversation, false);
  assert.equal(pausedAction.shouldCancelBackend, true);

  const staleConvAction = resolveOperatorSendAiPauseAction({
    globalAiEnabled: true,
    contact: { id: 'c3', ai_paused: false, bot_status: 'paused', conv_status: 'bot' }
  });
  assert.equal(staleConvAction.shouldUpdateConversation, true);
  assert.deepEqual(staleConvAction.payload, { ai_paused: true, ai_paused_manually: true });
});

test('resolveOperatorSendAiPauseAction still cancels backend when globalAiEnabled is false without spamming UI toggle', () => {
  const manualChat = resolveOperatorSendAiPauseAction({
    globalAiEnabled: false,
    contact: { id: 'c4', ai_paused: false, bot_status: 'active', conv_status: 'open' }
  });
  assert.equal(manualChat.shouldUpdateConversation, false);
  assert.equal(manualChat.shouldCancelBackend, true);

  const flowChat = resolveOperatorSendAiPauseAction({
    globalAiEnabled: false,
    contact: { id: 'c5', ai_paused: false, bot_status: 'active', conv_status: 'bot' }
  });
  assert.equal(flowChat.shouldUpdateConversation, true);
  assert.equal(flowChat.payload?.ai_paused, true);
});
