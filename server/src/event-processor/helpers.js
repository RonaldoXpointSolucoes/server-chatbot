/**
 * Helper utilities for Baileys message parsing and content extraction.
 */

export function isBroadcast(jid) {
    return Boolean(jid && (
        jid.includes('@broadcast') || 
        jid.includes('status@broadcast') ||
        jid.endsWith('@newsletter') ||
        jid.includes('@newsletter')
    ));
}

export function isNewsletter(jid) {
    return Boolean(jid && (jid.endsWith('@newsletter') || jid.includes('@newsletter')));
}

export function isGroup(jid) {
    return Boolean(jid && (jid.endsWith('@g.us') || jid.includes('@g.us')));
}

export function isLid(jid) {
    return Boolean(jid && (jid.endsWith('@lid') || jid.includes('@lid')));
}

export function extractMessageContent(msg) {
    if (!msg || !msg.message) return null;
    let content = msg.message;
    let iterations = 0;
    while (content && iterations < 6) {
        iterations++;
        if (content.editedMessage) { content = content.editedMessage.message || content.editedMessage; continue; }
        if (content.viewOnceMessage) { content = content.viewOnceMessage.message; continue; }
        if (content.viewOnceMessageV2) { content = content.viewOnceMessageV2.message; continue; }
        if (content.viewOnceMessageV2Extension) { content = content.viewOnceMessageV2Extension.message; continue; }
        if (content.ephemeralMessage) { content = content.ephemeralMessage.message; continue; }
        if (content.documentWithCaptionMessage) { content = content.documentWithCaptionMessage.message; continue; }
        break;
    }
    return content;
}

export function extractTextFromMessage(msg) {
    let content = extractMessageContent(msg);
    if (!content) return '';
    let text = '';
    if (content.protocolMessage && content.protocolMessage.editedMessage) {
        return extractTextFromMessage({ message: content.protocolMessage.editedMessage });
    }
    if (content.editedMessage) {
        return extractTextFromMessage({ message: content.editedMessage.message || content.editedMessage });
    }
    if (content.conversation) text = content.conversation;
    else if (content.extendedTextMessage) text = content.extendedTextMessage.text;
    else if (content.imageMessage) text = content.imageMessage.caption || '📸 Imagem / Foto';
    else if (content.audioMessage) text = '🎵 Áudio';
    else if (content.videoMessage) text = content.videoMessage.caption || (content.videoMessage.ptv ? '🎥 Recado de Vídeo Redondo (PTV)' : '🎥 Vídeo');
    else if (content.ptvMessage) text = content.ptvMessage.caption || '🎥 Recado de Vídeo Redondo (PTV)';
    else if (content.documentMessage) text = content.documentMessage.caption || '';
    else if (content.reactionMessage) text = '❤️ Reação: ' + content.reactionMessage.text;
    else if (content.contactMessage) text = '👤 Contato: ' + (content.contactMessage.displayName || '');
    else if (content.contactsArrayMessage) text = '👥 Múltiplos Contatos';
    else if (content.locationMessage) text = '📍 Localização';
    else if (content.stickerMessage) text = '🎫 Figurinha';
    else if (content.pollCreationMessage || content.pollCreationMessageV2 || content.pollCreationMessageV3) {
        const poll = content.pollCreationMessage || content.pollCreationMessageV2 || content.pollCreationMessageV3;
        const opts = (poll.options || []).map((o, idx) => `${idx + 1}. ${o.optionName || o}`).join('\n');
        text = `📊 *Enquete:* ${poll.name || 'Enquete'}\n${opts}`;
    }
    else if (content.pollUpdateMessage) {
        text = '🗳️ Voto em Enquete';
    }
    else if (content.orderMessage) {
        const om = content.orderMessage;
        const total = om.totalAmount1000 ? ` - Total: R$ ${(Number(om.totalAmount1000) / 1000).toFixed(2)}` : '';
        text = `🛒 *Pedido do Catálogo WhatsApp* (${om.itemCount || 1} ${(om.itemCount || 1) === 1 ? 'item' : 'itens'}${total})${om.message ? `\n💬 ${om.message}` : ''}`;
    }
    else if (content.productMessage) {
        const prod = content.productMessage.product || {};
        const price = prod.priceAmount1000 ? ` - R$ ${(Number(prod.priceAmount1000) / 1000).toFixed(2)}` : '';
        text = `🛍️ *Produto:* ${prod.title || 'Item do Catálogo'}${price}${prod.description ? `\n${prod.description}` : ''}`;
    }
    else if (content.pinInChatMessage) {
        text = content.pinInChatMessage.type === 2 ? '📌 Mensagem desafixada' : '📌 Mensagem fixada no topo';
    }
    else if (content.templateButtonReplyMessage) text = content.templateButtonReplyMessage.selectedDisplayText;
    else if (content.buttonsResponseMessage) text = content.buttonsResponseMessage.selectedDisplayText;
    else if (content.listResponseMessage) text = content.listResponseMessage.title;
    else if (content.interactiveResponseMessage) {
        try {
            if (content.interactiveResponseMessage.nativeFlowResponseMessage) {
                const params = JSON.parse(content.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                text = params.id || 'Opção selecionada';
            } else {
                text = content.interactiveResponseMessage.body?.text || 'Interação Selecionada';
            }
        } catch(e) { text = 'Interação Selecionada'; }
    }
    else if (content.templateMessage) {
        try {
            const tm = content.templateMessage;
            const template = tm.hydratedTemplate || tm.hydratedFourRowTemplate || tm.fourRowTemplate || tm;
            let parts = [];
            if (template.hydratedTitleText) parts.push(`*${template.hydratedTitleText}*`);
            if (template.hydratedContentText) parts.push(template.hydratedContentText);
            else if (template.text) parts.push(template.text);
            
            if (template.hydratedFooterText) parts.push(`_${template.hydratedFooterText}_`);
            
            text = parts.length > 0 ? parts.join('\n\n') : '📱 Mensagem Interativa (Template)';
        } catch (e) { text = '📱 Mensagem Interativa (Template)'; }
    }
    else if (content.highlyStructuredMessage) {
        try {
            const hsm = content.highlyStructuredMessage;
            const template = hsm.hydratedHsm || hsm;
            let parts = [];
            if (template.hydratedTitleText) parts.push(`*${template.hydratedTitleText}*`);
            if (template.hydratedContentText) parts.push(template.hydratedContentText);
            if (template.hydratedFooterText) parts.push(`_${template.hydratedFooterText}_`);
            text = parts.length > 0 ? parts.join('\n\n') : '📱 Mensagem Estruturada (HSM)';
        } catch (e) { text = '📱 Mensagem Estruturada (HSM)'; }
    }
    else if (content.albumMessage) {
        const totalAlbum = (content.albumMessage.expectedImageCount || 0) + (content.albumMessage.expectedVideoCount || 0);
        text = `📸 Álbum de Mídia${totalAlbum > 0 ? ` (${totalAlbum} itens)` : ''}`;
    }
    else if (content.secretEncryptedMessage) text = '✏️ Mensagem Editada';
    else if (content.buttonsMessage || content.listMessage) text = '📱 Mensagem Interativa';
    else text = '📎 Mensagem não suportada';

    // Anti-Bug: Remove caracteres nulos (\x00) que quebram o cast de JSON do PostgreSQL no Supabase (Upsert)
    return text ? String(text).replace(/\x00/g, '') : '';
}

export function extractMediaMeta(rawMsg, msgType) {
    if (!rawMsg || !rawMsg.message) return {};
    
    let content = extractMessageContent(rawMsg);
    if (!content) return {};

    if (msgType === 'video' && content.ptvMessage) return { ...content.ptvMessage, ptv: true };
    if (content[msgType + 'Message']) return content[msgType + 'Message'];
    
    if (content.templateMessage) {
        const tm = content.templateMessage;
        const template = tm.hydratedTemplate || tm.hydratedFourRowTemplate || tm.fourRowTemplate || tm;
        if (template && template[msgType + 'Message']) return template[msgType + 'Message'];
    }
    
    if (content.highlyStructuredMessage) {
        const hsm = content.highlyStructuredMessage;
        const template = hsm.hydratedHsm || hsm;
        if (template && template[msgType + 'Message']) return template[msgType + 'Message'];
    }
    
    return {};
}

export function extractTypeFromMessage(msg) {
    let content = extractMessageContent(msg);
    if (!content) return 'text';
    if (content.imageMessage) return 'image';
    if (content.audioMessage) return 'audio';
    if (content.videoMessage || content.ptvMessage) return 'video';
    if (content.documentMessage) return 'document';
    if (content.contactMessage || content.contactsArrayMessage) return 'contact';
    if (content.locationMessage) return 'location';
    if (content.stickerMessage) return 'sticker';
    
    if (content.templateMessage) {
        const tm = content.templateMessage;
        const template = tm.hydratedTemplate || tm.hydratedFourRowTemplate || tm.fourRowTemplate || tm;
        if (template?.imageMessage) return 'image';
        if (template?.documentMessage) return 'document';
        if (template?.videoMessage) return 'video';
        if (template?.locationMessage) return 'location';
    }
    
    if (content.highlyStructuredMessage) {
        const hsm = content.highlyStructuredMessage;
        const template = hsm.hydratedHsm || hsm;
        if (template?.imageMessage) return 'image';
        if (template?.documentMessage) return 'document';
        if (template?.videoMessage) return 'video';
        if (template?.locationMessage) return 'location';
    }

    return 'text';
}

export function getCanonicalBrPhone(phoneStr) {
    if (!phoneStr) return '';
    const clean = String(phoneStr).replace(/\D/g, '');
    if (!clean) return '';
    if (clean.startsWith('55')) {
        if (clean.length === 12) {
            const ddd = parseInt(clean.substring(2, 4), 10);
            if (ddd >= 11 && ddd <= 99) {
                return clean.substring(0, 4) + '9' + clean.substring(4);
            }
        }
        return clean;
    }
    if (clean.length === 10) {
        return '55' + clean.substring(0, 2) + '9' + clean.substring(2);
    }
    if (clean.length === 11) {
        return '55' + clean;
    }
    return clean;
}

export function getBrPhoneVariations(phoneStr) {
    if (!phoneStr) return [];
    const clean = String(phoneStr).replace(/\D/g, '');
    if (!clean) return [];
    const res = [clean];
    if (clean.startsWith('55') && clean.length === 13 && clean.charAt(4) === '9') {
        res.push(clean.substring(0, 4) + clean.substring(5));
    } else if (clean.startsWith('55') && clean.length === 12) {
        res.push(clean.substring(0, 4) + '9' + clean.substring(4));
    } else if (!clean.startsWith('55')) {
        res.push('55' + clean);
        if (clean.length === 11 && clean.charAt(2) === '9') {
            res.push('55' + clean.substring(0, 2) + clean.substring(3));
        } else if (clean.length === 10) {
            res.push('55' + clean.substring(0, 2) + '9' + clean.substring(2));
        }
    }
    return Array.from(new Set(res));
}

const SERVER_PLACEHOLDER_NAMES = new Set([
    'null',
    'undefined',
    'novo contato',
    'contato desconhecido',
    'contato sem telefone',
    'contato sem nome',
    'contato',
    'sem nome',
    'empresa',
    'cliente',
    'desconhecido'
]);

function normalizeServerName(value) {
    if (typeof value !== 'string') return '';
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

export function isPlaceholderContactName(name, blockedNames = []) {
    if (typeof name !== 'string') return true;
    const trimmed = name.trim();
    if (!trimmed) return true;
    const norm = normalizeServerName(trimmed);
    if (!norm || SERVER_PLACEHOLDER_NAMES.has(norm)) return true;

    const compact = norm.replace(/\s+/g, '');
    for (const blocked of blockedNames) {
        if (!blocked || typeof blocked !== 'string') continue;
        const normBlocked = normalizeServerName(blocked);
        if (normBlocked && (norm === normBlocked || compact === normBlocked.replace(/\s+/g, ''))) {
            return true;
        }
    }
    return false;
}

export function isPhoneOnlyContactName(name, phone) {
    if (typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (!trimmed || !/^[\d\s()+.-]+$/.test(trimmed)) return false;
    const nameDigits = trimmed.replace(/\D/g, '');
    if (nameDigits.length < 4) return false;
    const phoneDigits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
    if (!phoneDigits) return true;
    if (nameDigits === phoneDigits) return true;
    if (nameDigits.length >= 8 && phoneDigits.length >= 8) {
        return nameDigits.slice(-8) === phoneDigits.slice(-8);
    }
    return false;
}

export function sanitizeIncomingContactName(rawName, phone, blockedNames = []) {
    const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
    if (typeof rawName !== 'string') return cleanPhone;
    const trimmed = rawName.trim();
    if (!trimmed || isPlaceholderContactName(trimmed, blockedNames)) {
        return cleanPhone;
    }
    return trimmed;
}

export function resolveBatchContactName(existingContact, incomingName, targetPhone, blockedNames = []) {
    if (existingContact?.custom_name && !isPlaceholderContactName(existingContact.custom_name, blockedNames)) {
        return existingContact.custom_name.trim();
    }

    const oldName = typeof existingContact?.name === 'string' ? existingContact.name.trim() : '';
    const hasValidOldName = Boolean(
        existingContact &&
        oldName &&
        !isPlaceholderContactName(oldName, blockedNames) &&
        oldName !== existingContact.phone &&
        oldName !== targetPhone &&
        !isPhoneOnlyContactName(oldName, existingContact.phone || targetPhone)
    );

    if (hasValidOldName) {
        return oldName;
    }

    return sanitizeIncomingContactName(incomingName, targetPhone, blockedNames) || targetPhone;
}

export const STATUS_PRIORITY = Object.freeze({
    pending: 0,
    sent: 1,
    server_ack: 2,
    delivered: 3,
    delivery_ack: 3,
    read: 4,
    played: 5
});

/**
 * Maps a message delivery/read status string to a monotonic precedence rank.
 * Unknown or empty statuses resolve to -1 so valid acks can advance them safely.
 */
export function resolveStatusPriority(status) {
    if (typeof status !== 'string') return -1;
    const normalized = status.trim().toLowerCase();
    return Object.hasOwn(STATUS_PRIORITY, normalized) ? STATUS_PRIORITY[normalized] : -1;
}

/**
 * Returns true only when transitioning from currentStatus to nextStatus
 * strictly advances delivery progress without ever regressing (e.g. blocks
 * late companion SERVER_ACK from overwriting delivered/read/played).
 */
export function shouldAcceptStatusTransition(currentStatus, nextStatus) {
    const nextRank = resolveStatusPriority(nextStatus);
    if (nextRank < 0) return false;
    const currentRank = resolveStatusPriority(currentStatus);
    return nextRank > currentRank;
}

/**
 * Normalizes a Baileys protobuf/unix timestamp into a bounded Date,
 * falling back to nowMs if missing, future-skewed (>60s), or >30 days stale.
 */
export function parseWhatsAppTimestamp(timestampSecs, nowMs = Date.now()) {
    let tsDate = new Date(nowMs);
    if (typeof timestampSecs === 'number') {
        tsDate = new Date(timestampSecs * 1000);
    } else if (timestampSecs && typeof timestampSecs.low === 'number') {
        tsDate = new Date(timestampSecs.low * 1000);
    }
    const originalMs = tsDate.getTime();
    if (originalMs > 0 && originalMs <= nowMs + 60000 && (nowMs - originalMs < 30 * 86400000)) {
        return new Date(originalMs);
    }
    return new Date(nowMs);
}

/**
 * Identifies whether a messages.upsert event represents historical sync
 * (append/reconcile or older than 60s) rather than a live realtime message.
 */
export function isHistoricalUpsert(upsertType, tsDate, nowMs = Date.now()) {
    return Boolean(
        upsertType === 'append' ||
        upsertType === 'reconcile' ||
        (tsDate && (nowMs - tsDate.getTime() > 60000))
    );
}

/**
 * Detects a live human operator intervention even when Baileys delivers a companion
 * WhatsApp Phone/Web outbound (`fromMe: true`) as `type: 'append'` within a recent window.
 */
export function isRecentHumanOperatorMessage({
    senderType,
    isHistory,
    tsDate,
    nowMs = Date.now(),
    windowMs = 120000
} = {}) {
    if (senderType !== 'human') return false;
    if (!isHistory) return true;
    const msgMs = tsDate instanceof Date ? tsDate.getTime() : Number(new Date(tsDate || 0).getTime());
    if (!Number.isFinite(msgMs) || msgMs <= 0) return false;
    const ageMs = nowMs - msgMs;
    return ageMs >= -60000 && ageMs <= windowMs;
}

/**
 * Resolves database state updates for a conversation aggregated in BatchProcessor.
 * Any live operator outbound intervention immediately forces status='open' and ai_paused=true.
 */
export function resolveBatchConversationTransition(exist, data, isContactPaused = false, nowMs = Date.now()) {
    const isOldHistory = Boolean(
        data?.last_message_at && (nowMs - new Date(data.last_message_at).getTime() > 24 * 60 * 60 * 1000)
    );

    if (exist) {
        let nextStatus = exist.status || 'resolved';
        let nextAiPaused = Boolean(exist.ai_paused || isContactPaused);
        let nextAiPausedManually = Boolean(exist.ai_paused_manually);

        if (!data?.has_inbound && !data?.has_human_outbound) {
            nextStatus = exist.status || 'resolved';
        } else if ((exist.status === 'resolved' || exist.status === 'closed' || exist.status === 'snoozed') && !isOldHistory) {
            if (data.has_human_outbound) {
                nextStatus = 'open';
            } else if (data.has_inbound) {
                nextStatus = (nextAiPaused || isContactPaused) ? 'open' : 'bot';
            }
        }

        if (exist.status === 'open' && data?.has_inbound && !data?.has_human_outbound) {
            nextStatus = (nextAiPaused || isContactPaused) ? 'open' : 'bot';
        }

        if (data?.has_human_outbound) {
            nextAiPaused = true;
            nextAiPausedManually = true;
            nextStatus = 'open';
        }

        return {
            status: nextStatus,
            ai_paused: nextAiPaused,
            ai_paused_manually: nextAiPausedManually,
            hasHumanOverride: Boolean(data?.has_human_outbound)
        };
    }

    let initialStatus = 'resolved';
    let initialAiPaused = Boolean(isContactPaused);
    let initialAiPausedManually = false;

    if (!isOldHistory) {
        if (data?.has_human_outbound) {
            initialStatus = 'open';
            initialAiPaused = true;
            initialAiPausedManually = true;
        } else if (data?.has_inbound) {
            initialStatus = isContactPaused ? 'open' : 'bot';
            initialAiPaused = Boolean(isContactPaused);
        } else {
            initialStatus = 'resolved';
        }
    }

    return {
        status: initialStatus,
        ai_paused: initialAiPaused,
        ai_paused_manually: initialAiPausedManually,
        hasHumanOverride: Boolean(data?.has_human_outbound && !isOldHistory)
    };
}


