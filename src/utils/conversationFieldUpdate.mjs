const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_CONVERSATION_COLUMNS = new Set([
  'status',
  'assigned_to',
  'unread_count',
  'snoozed_until',
  'snoozed_at',
  'snoozed_by',
  'priority',
  'ai_paused',
  'ai_paused_manually',
  'is_pinned',
  'is_favorite',
  'updated_at'
]);

/**
 * Filtra apenas colunas reais da tabela `conversations`, descartando flags de UI
 * ou colunas pertencentes à tabela `contacts` (evitando erro HTTP 400 PostgREST).
 */
export function buildConversationsDbUpdatePayload(payload = {}) {
  const dbPayload = {};
  if (!payload || typeof payload !== 'object') return dbPayload;

  for (const [key, value] of Object.entries(payload)) {
    if (ALLOWED_CONVERSATION_COLUMNS.has(key) && value !== undefined) {
      dbPayload[key] = value;
    }
  }

  if ('ai_paused' in payload && !('status' in payload)) {
    dbPayload.status = payload.ai_paused ? 'open' : 'bot';
  }

  return dbPayload;
}

/**
 * Garante um UUID válido de instância para inserções em `messages.instance_id`
 * sem jamais enviar nomes amigáveis (ex: "iPhone") nem "default".
 */
export function resolveValidMessageInstanceUuid({
  cachedUuid = null,
  instId = null,
  contactInstanceId = null
} = {}) {
  for (const candidate of [cachedUuid, instId, contactInstanceId]) {
    if (typeof candidate === 'string' && UUID_REGEX.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  return null;
}

export function shouldEmitSnoozeReopenSystemMessage({ prevStatus = null, payload = {} } = {}) {
  return Boolean(prevStatus === 'snoozed' && payload?.status === 'open');
}

export function resolveSystemMessageConversationId({ knownConvId = null, queriedConvId = null } = {}) {
  return knownConvId || queriedConvId || null;
}
