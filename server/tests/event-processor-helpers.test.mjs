import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWhatsAppTimestamp,
  isHistoricalUpsert,
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
