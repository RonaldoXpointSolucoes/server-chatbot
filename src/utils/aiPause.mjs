/**
 * Pure helpers deciding how manual human operator sends immediately pause AI
 * across text, audio, media, contact cards, and forwarded messages.
 */

export const DEFAULT_HUMAN_PAUSE_WINDOW_MS = 30 * 60000;

export function isContactDefinitivelyPaused(contact) {
  if (!contact || typeof contact !== 'object') return false;
  return Boolean(
    contact.bot_status === 'paused' ||
    (contact.ai_paused_manually && !contact.bot_paused_until)
  );
}

export function hasActiveTemporaryPause(contact, nowMs = Date.now()) {
  if (!contact || typeof contact !== 'object' || !contact.bot_paused_until) return false;
  const untilMs = new Date(contact.bot_paused_until).getTime();
  return Number.isFinite(untilMs) && untilMs > nowMs;
}

export function hasRecentHumanMessage(
  contact,
  nowMs = Date.now(),
  windowMs = DEFAULT_HUMAN_PAUSE_WINDOW_MS
) {
  const msgs = contact?.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) return false;

  const sorted = [...msgs].sort((a, b) => {
    const ta = new Date(a?.timestamp || a?.created_at || 0).getTime();
    const tb = new Date(b?.timestamp || b?.created_at || 0).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  for (const m of sorted) {
    if (!m) continue;
    const tsMs = new Date(m.timestamp || m.created_at || 0).getTime();
    if (!Number.isFinite(tsMs) || tsMs <= 0) continue;

    const sender = String(m.sender || '').toLowerCase();
    const senderType = String(m.sender_type || '').toLowerCase();
    const text = String(m.text || m.text_content || '');

    if (sender === 'system' || senderType === 'system') {
      if (text.includes('IA Luna Retomada') || m.raw_payload?.ai_resumed === true) {
        return false;
      }
      continue;
    }

    if (
      sender === 'me' ||
      sender === 'human' ||
      sender === 'agent' ||
      senderType === 'human' ||
      senderType === 'agent'
    ) {
      const ageMs = nowMs - tsMs;
      return ageMs >= -60000 && ageMs <= windowMs;
    }
  }

  return false;
}

export function shouldPreserveHumanAiPauseOnResolve(
  contact,
  nowMs = Date.now(),
  windowMs = DEFAULT_HUMAN_PAUSE_WINDOW_MS
) {
  return Boolean(
    isContactDefinitivelyPaused(contact) ||
    hasActiveTemporaryPause(contact, nowMs) ||
    hasRecentHumanMessage(contact, nowMs, windowMs)
  );
}

export function resolvePostResolveAiPauseState({
  contact = null,
  reactivateAi = undefined,
  forceReactivateAi = false,
  nowMs = Date.now(),
  pauseDurationMs = DEFAULT_HUMAN_PAUSE_WINDOW_MS
} = {}) {
  if (isContactDefinitivelyPaused(contact)) {
    return {
      nextAiPaused: true,
      nextAiPausedManually: true,
      nextBotStatus: 'paused',
      nextBotPausedUntil: null,
      preservedHumanPause: false
    };
  }

  const tempPauseActive = hasActiveTemporaryPause(contact, nowMs);
  const recentHumanMsg = hasRecentHumanMessage(contact, nowMs, pauseDurationMs);

  if (!forceReactivateAi && (tempPauseActive || recentHumanMsg)) {
    const existingMs = contact?.bot_paused_until ? new Date(contact.bot_paused_until).getTime() : 0;
    const nextBotPausedUntil =
      Number.isFinite(existingMs) && existingMs > nowMs
        ? contact.bot_paused_until
        : new Date(nowMs + pauseDurationMs).toISOString();

    return {
      nextAiPaused: true,
      nextAiPausedManually: false,
      nextBotStatus: 'active',
      nextBotPausedUntil,
      preservedHumanPause: true
    };
  }

  if (reactivateAi !== undefined) {
    const paused = !reactivateAi;
    return {
      nextAiPaused: paused,
      nextAiPausedManually: paused,
      nextBotStatus: paused ? 'paused' : 'active',
      nextBotPausedUntil: null,
      preservedHumanPause: false
    };
  }

  const pausedManually = Boolean(contact?.ai_paused_manually);
  return {
    nextAiPaused: pausedManually,
    nextAiPausedManually: pausedManually,
    nextBotStatus: pausedManually ? 'paused' : 'active',
    nextBotPausedUntil: null,
    preservedHumanPause: false
  };
}

export function resolveOperatorSendAiPauseAction({
  globalAiEnabled = true,
  contact = null,
  nowMs = Date.now(),
  pauseDurationMs = 30 * 60000
} = {}) {
  if (!contact || typeof contact !== 'object') {
    return {
      shouldUpdateConversation: false,
      shouldCancelBackend: Boolean(globalAiEnabled),
      payload: null
    };
  }

  const definitivelyPaused = isContactDefinitivelyPaused(contact);
  const needsConversationSync = !contact.ai_paused || contact.conv_status === 'bot';

  if (definitivelyPaused) {
    return {
      shouldUpdateConversation: needsConversationSync,
      shouldCancelBackend: true,
      payload: needsConversationSync ? { ai_paused: true, ai_paused_manually: true } : null
    };
  }

  if (globalAiEnabled || contact.conv_status === 'bot') {
    return {
      shouldUpdateConversation: true,
      shouldCancelBackend: true,
      payload: {
        ai_paused: true,
        ai_paused_manually: true,
        ai_paused_until: new Date(nowMs + pauseDurationMs).toISOString()
      }
    };
  }

  return {
    shouldUpdateConversation: false,
    shouldCancelBackend: true,
    payload: null
  };
}
