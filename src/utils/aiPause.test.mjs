import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isContactDefinitivelyPaused,
  resolveOperatorSendAiPauseAction,
  hasActiveTemporaryPause,
  hasRecentHumanMessage,
  shouldPreserveHumanAiPauseOnResolve,
  resolvePostResolveAiPauseState
} from './aiPause.mjs';

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

test('resolvePostResolveAiPauseState preserves 30m human cooldown when resolving right after sending Pix', () => {
  const nowMs = Date.UTC(2026, 10, 22, 0, 27, 35);
  const pauseUntil = new Date(nowMs + 29 * 60000).toISOString();
  const contactAfterPix = {
    id: 'luciene',
    bot_status: 'active',
    bot_paused_until: pauseUntil,
    ai_paused: true,
    ai_paused_manually: true,
    messages: [
      { sender: 'client', text: 'Manda a chave do pix', timestamp: new Date(nowMs - 40000) },
      { sender: 'me', text: 'Nosso pix é 59075836000106', timestamp: new Date(nowMs - 5000) }
    ]
  };

  assert.equal(hasActiveTemporaryPause(contactAfterPix, nowMs), true);
  assert.equal(hasRecentHumanMessage(contactAfterPix, nowMs), true);
  assert.equal(shouldPreserveHumanAiPauseOnResolve(contactAfterPix, nowMs), true);

  // Quick resolve passes reactivateAi=false (from !shouldPreserveHumanAiPauseOnResolve)
  const resolved = resolvePostResolveAiPauseState({
    contact: contactAfterPix,
    reactivateAi: true, // even if stale caller passed true without forceReactivateAi!
    forceReactivateAi: false,
    nowMs
  });

  assert.equal(resolved.nextAiPaused, true);
  assert.equal(resolved.nextAiPausedManually, false);
  assert.equal(resolved.nextBotStatus, 'active');
  assert.equal(resolved.nextBotPausedUntil, pauseUntil);
  assert.equal(resolved.preservedHumanPause, true);
});

test('hasRecentHumanMessage resets after explicit IA Luna Retomada system event', () => {
  const nowMs = Date.UTC(2026, 10, 22, 0, 30, 0);
  const contactResumed = {
    id: 'c6',
    bot_status: 'active',
    bot_paused_until: null,
    messages: [
      { sender: 'me', text: 'Oi', timestamp: new Date(nowMs - 120000) },
      { sender: 'system', text: '▶️ IA Luna Retomada por Ronaldo', timestamp: new Date(nowMs - 30000) }
    ]
  };

  assert.equal(hasRecentHumanMessage(contactResumed, nowMs), false);
  assert.equal(shouldPreserveHumanAiPauseOnResolve(contactResumed, nowMs), false);
});
