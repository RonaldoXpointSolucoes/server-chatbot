import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWhatsAppTimestamp,
  isHistoricalUpsert,
  isRecentHumanOperatorMessage,
  resolveBatchConversationTransition,
  resolveStatusPriority,
  shouldAcceptStatusTransition
} from '../src/event-processor/helpers.js';

test('parseWhatsAppTimestamp normalizes unix numbers, protobuf longs, and invalid future/stale timestamps', () => {
  const nowMs = Date.UTC(2026, 10, 20, 17, 0, 0);
  const recentSecs = Math.floor((nowMs - 5000) / 1000);
  assert.equal(parseWhatsAppTimestamp(recentSecs, nowMs).getTime(), recentSecs * 1000);
  assert.equal(parseWhatsAppTimestamp({ low: recentSecs }, nowMs).getTime(), recentSecs * 1000);

  // Far future (>60s) or >30d stale falls back to nowMs
  assert.equal(parseWhatsAppTimestamp(Math.floor((nowMs + 120000) / 1000), nowMs).getTime(), nowMs);
  assert.equal(parseWhatsAppTimestamp(Math.floor((nowMs - 31 * 86400000) / 1000), nowMs).getTime(), nowMs);
  assert.equal(parseWhatsAppTimestamp(null, nowMs).getTime(), nowMs);
});

test('isHistoricalUpsert flags append/reconcile and old (>60s) events accurately', () => {
  const nowMs = Date.UTC(2026, 10, 20, 17, 0, 0);
  const liveTs = new Date(nowMs - 5000);
  const oldTs = new Date(nowMs - 90000);

  assert.equal(isHistoricalUpsert('notify', liveTs, nowMs), false);
  assert.equal(isHistoricalUpsert('append', liveTs, nowMs), true);
  assert.equal(isHistoricalUpsert('reconcile', liveTs, nowMs), true);
  assert.equal(isHistoricalUpsert('notify', oldTs, nowMs), true);
});

test('shouldAcceptStatusTransition enforces strict monotonic advancement', () => {
  assert.equal(resolveStatusPriority('delivered'), 3);
  assert.equal(resolveStatusPriority('SERVER_ACK'), 2);

  assert.equal(shouldAcceptStatusTransition(undefined, 'SERVER_ACK'), true);
  assert.equal(shouldAcceptStatusTransition('SERVER_ACK', 'delivered'), true);
  assert.equal(shouldAcceptStatusTransition('delivered', 'read'), true);
  assert.equal(shouldAcceptStatusTransition('delivered', 'SERVER_ACK'), false);
  assert.equal(shouldAcceptStatusTransition('read', 'delivered'), false);
  assert.equal(shouldAcceptStatusTransition('played', 'read'), false);
  assert.equal(shouldAcceptStatusTransition('delivered', 'delivered'), false);
});

test('isRecentHumanOperatorMessage detects live notify and recent (<2m) companion append human messages', () => {
  const nowMs = Date.UTC(2026, 10, 20, 18, 0, 0);
  const recentTs = new Date(nowMs - 15000);
  const oldSyncTs = new Date(nowMs - 5 * 60000);

  assert.equal(isRecentHumanOperatorMessage({ senderType: 'human', isHistory: false, tsDate: recentTs, nowMs }), true);
  assert.equal(isRecentHumanOperatorMessage({ senderType: 'human', isHistory: true, tsDate: recentTs, nowMs }), true);
  assert.equal(isRecentHumanOperatorMessage({ senderType: 'human', isHistory: true, tsDate: oldSyncTs, nowMs }), false);
  assert.equal(isRecentHumanOperatorMessage({ senderType: 'automation', isHistory: false, tsDate: recentTs, nowMs }), false);
  assert.equal(isRecentHumanOperatorMessage({ senderType: 'bot', isHistory: false, tsDate: recentTs, nowMs }), false);
});

test('resolveBatchConversationTransition forces open + ai_paused=true immediately on human outbound', () => {
  const nowMs = Date.UTC(2026, 10, 20, 18, 0, 0);
  const existBot = { id: 'conv-1', status: 'bot', ai_paused: false, ai_paused_manually: false };
  const transition = resolveBatchConversationTransition(
    existBot,
    { has_inbound: true, has_human_outbound: true, last_message_at: new Date(nowMs - 1000) },
    false,
    nowMs
  );

  assert.equal(transition.status, 'open');
  assert.equal(transition.ai_paused, true);
  assert.equal(transition.ai_paused_manually, true);
  assert.equal(transition.hasHumanOverride, true);
});
