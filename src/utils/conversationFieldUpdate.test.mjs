import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConversationsDbUpdatePayload,
  resolveValidMessageInstanceUuid,
  shouldEmitSnoozeReopenSystemMessage,
  resolveSystemMessageConversationId
} from './conversationFieldUpdate.mjs';

test('buildConversationsDbUpdatePayload strips non-schema flags and maps ai_paused status', () => {
  const dbPause = buildConversationsDbUpdatePayload({
    ai_paused: true,
    ai_paused_manually: true,
    ai_paused_until: '2026-11-22T01:00:00Z',
    bot_paused_until: '2026-11-22T01:00:00Z',
    snoozed_by_system: true
  });

  assert.deepEqual(dbPause, {
    ai_paused: true,
    ai_paused_manually: true,
    status: 'open'
  });

  const dbAssign = buildConversationsDbUpdatePayload({
    assigned_to: 'agent-123'
  });
  assert.deepEqual(dbAssign, { assigned_to: 'agent-123' });
});

test('resolveValidMessageInstanceUuid never passes display names or "default" as UUID', () => {
  const uuidA = 'bbf0e8d4-d9e5-4eb9-934a-dd76f09e29aa';
  assert.equal(resolveValidMessageInstanceUuid({ instId: 'iPhone', contactInstanceId: uuidA }), uuidA);
  assert.equal(resolveValidMessageInstanceUuid({ instId: 'default', contactInstanceId: 'iPhone' }), null);
  assert.equal(resolveValidMessageInstanceUuid({ cachedUuid: uuidA, instId: 'iPhone' }), uuidA);
});

test('shouldEmitSnoozeReopenSystemMessage checks pre-optimistic prevStatus reliably', () => {
  assert.equal(shouldEmitSnoozeReopenSystemMessage({ prevStatus: 'snoozed', payload: { status: 'open' } }), true);
  assert.equal(shouldEmitSnoozeReopenSystemMessage({ prevStatus: 'open', payload: { status: 'open' } }), false);
});

test('resolveSystemMessageConversationId uses knownConvId cleanly when DB lookup was skipped', () => {
  const cid = '3e2b301d-7557-4765-9220-40be61788e82';
  assert.equal(resolveSystemMessageConversationId({ knownConvId: cid, queriedConvId: null }), cid);
  assert.equal(resolveSystemMessageConversationId({ knownConvId: null, queriedConvId: cid }), cid);
  assert.equal(resolveSystemMessageConversationId({ knownConvId: null, queriedConvId: null }), null);
});
