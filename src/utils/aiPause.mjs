/**
 * Pure helpers deciding how manual human operator sends immediately pause AI
 * across text, audio, media, contact cards, and forwarded messages.
 */

export function isContactDefinitivelyPaused(contact) {
  if (!contact || typeof contact !== 'object') return false;
  return Boolean(
    contact.bot_status === 'paused' ||
    (contact.ai_paused_manually && !contact.bot_paused_until)
  );
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
