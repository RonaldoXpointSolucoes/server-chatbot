/**
 * Classifica itens do outbox (wa_outgoing_messages) para evitar falso auto-pause da IA
 * em disparos de automação/API externa e garantir compatibilidade de tipos de mídia.
 */
export function classifyOutboxMessage(msg = {}) {
    const priority = Number(msg?.priority ?? 1);
    const options = msg?.options && typeof msg.options === 'object' ? msg.options : {};
    const isBot = Boolean(options.isBot === true || options.senderType === 'bot');
    const isAutomation = isBot || Boolean(
        options.isAutomation === true ||
        options.senderType === 'automation' ||
        priority >= 5
    );
    const isOperator = !isAutomation;
    const shouldApplyAntiBanDelay = priority >= 5 && options.skipDelay !== true;
    const shouldPauseAi = isOperator;
    const senderType = isBot ? 'bot' : (isAutomation ? 'automation' : 'human');

    return {
        priority,
        options,
        isBot,
        isAutomation,
        isOperator,
        shouldApplyAntiBanDelay,
        shouldPauseAi,
        senderType
    };
}

const SUPPORTED_MEDIA_MESSAGE_TYPES = new Set(['media', 'image', 'video', 'audio', 'document']);

/**
 * Normaliza a especificação de mídia aceita pelo QueueProcessor tanto para registros
 * padrão (`message_type: 'media'`) quanto legados (`image`, `video`, `audio`, `document`).
 */
export function resolveOutboxMediaSpec(msg = {}) {
    const rawType = String(msg?.message_type || 'text').toLowerCase();
    const isMedia = Boolean(msg?.media_url) && SUPPORTED_MEDIA_MESSAGE_TYPES.has(rawType);
    const explicitMessageType = msg?.options?.messageType || (rawType !== 'media' && SUPPORTED_MEDIA_MESSAGE_TYPES.has(rawType) ? rawType : null);
    return {
        isMedia,
        explicitMessageType
    };
}
