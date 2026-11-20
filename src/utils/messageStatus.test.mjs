import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickHigherMessageStatus,
  resolveMessageStatusPriority,
  shouldReconcileMessageStatus
} from './messageStatus.mjs';

test('pickHigherMessageStatus never downgrades delivered or read back to SERVER_ACK or sent', () => {
  assert.equal(pickHigherMessageStatus('delivered', 'SERVER_ACK'), 'delivered');
  assert.equal(pickHigherMessageStatus('DELIVERY_ACK', 'sent'), 'DELIVERY_ACK');
  assert.equal(pickHigherMessageStatus('read', 'delivered'), 'read');
  assert.equal(pickHigherMessageStatus('played', 'SERVER_ACK'), 'played');
});

test('pickHigherMessageStatus advances lower statuses forward', () => {
  assert.equal(pickHigherMessageStatus('pending', 'sent'), 'sent');
  assert.equal(pickHigherMessageStatus('sent', 'delivered'), 'delivered');
  assert.equal(pickHigherMessageStatus('SERVER_ACK', 'delivered'), 'delivered');
  assert.equal(pickHigherMessageStatus('delivered', 'read'), 'read');
});

test('shouldReconcileMessageStatus reconciles pending, sent and SERVER_ACK only', () => {
  assert.equal(shouldReconcileMessageStatus('pending'), true);
  assert.equal(shouldReconcileMessageStatus('sent'), true);
  assert.equal(shouldReconcileMessageStatus('SERVER_ACK'), true);
  assert.equal(shouldReconcileMessageStatus('server_ack'), true);
  assert.equal(shouldReconcileMessageStatus('delivered'), false);
  assert.equal(shouldReconcileMessageStatus('read'), false);
});

test('resolveMessageStatusPriority returns 0 for unknown statuses', () => {
  assert.equal(resolveMessageStatusPriority(undefined), 0);
  assert.equal(resolveMessageStatusPriority('error'), 0);
});
