export function buildConversationsDbUpdatePayload(payload?: Record<string, any>): Record<string, any>;

export function resolveValidMessageInstanceUuid(params?: {
  cachedUuid?: string | null;
  instId?: string | null;
  contactInstanceId?: string | null;
}): string | null;

export function shouldEmitSnoozeReopenSystemMessage(params?: {
  prevStatus?: string | null;
  payload?: Record<string, any>;
}): boolean;

export function resolveSystemMessageConversationId(params?: {
  knownConvId?: string | null;
  queriedConvId?: string | null;
}): string | null;
