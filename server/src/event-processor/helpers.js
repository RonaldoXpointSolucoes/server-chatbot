/**
 * Helper utilities for Baileys message parsing and content extraction.
 */

export function isBroadcast(jid) {
    return Boolean(jid && (jid.includes('@broadcast') || jid.includes('status@broadcast')));
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
    if (content.editedMessage) content = content.editedMessage.message || content.editedMessage;
    if (content.viewOnceMessage) content = content.viewOnceMessage.message;
    if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
    if (content.viewOnceMessageV2Extension) content = content.viewOnceMessageV2Extension.message;
    if (content.ephemeralMessage) content = content.ephemeralMessage.message;
    if (content.documentWithCaptionMessage) content = content.documentWithCaptionMessage.message;
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
    else if (content.videoMessage) text = content.videoMessage.caption || '🎥 Vídeo';
    else if (content.documentMessage) text = content.documentMessage.caption || '';
    else if (content.reactionMessage) text = '❤️ Reação: ' + content.reactionMessage.text;
    else if (content.contactMessage) text = '👤 Contato: ' + (content.contactMessage.displayName || '');
    else if (content.contactsArrayMessage) text = '👥 Múltiplos Contatos';
    else if (content.locationMessage) text = '📍 Localização';
    else if (content.stickerMessage) text = '🎫 Figurinha';
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
    else if (content.albumMessage) text = '📸 Álbum de Fotos';
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
    if (content.videoMessage) return 'video';
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
