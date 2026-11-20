export const MESSAGE_STATUS_PRIORITY = Object.freeze({
  pending: 1,
  sent: 2,
  server_ack: 2,
  delivered: 3,
  delivery_ack: 3,
  read: 4,
  played: 4
});

/**
 * Resolves numeric delivery precedence for a UI/DB message status string.
 */
export function resolveMessageStatusPriority(status) {
  if (typeof status !== 'string') return 0;
  const normalized = status.trim().toLowerCase();
  return Object.hasOwn(MESSAGE_STATUS_PRIORITY, normalized) ? MESSAGE_STATUS_PRIORITY[normalized] : 0;
}

/**
 * Keeps the highest-priority status between currentStatus and nextStatus
 * so delayed SERVER_ACK / sent updates never downgrade delivered or read ticks.
 */
export function pickHigherMessageStatus(currentStatus, nextStatus) {
  if (!nextStatus) return currentStatus;
  if (!currentStatus) return nextStatus;
  const currentPrio = resolveMessageStatusPriority(currentStatus);
  const nextPrio = resolveMessageStatusPriority(nextStatus);
  return nextPrio >= currentPrio ? nextStatus : currentStatus;
}

/**
 * Returns true when a message status is still awaiting recipient delivery
 * and should be reconciled against the database.
 */
export function shouldReconcileMessageStatus(status) {
  if (typeof status !== 'string') return false;
  const normalized = status.trim().toLowerCase();
  return normalized === 'pending' || normalized === 'sent' || normalized === 'server_ack';
}
