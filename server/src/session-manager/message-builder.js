/**
 * Builder centralizado de mensagens WhatsApp (Baileys) para o SaaS ChatBoot.
 * 
 * Regras de Negócio:
 * - 'TUTORIAL': Vídeo MP4 + Caption (texto da resposta pronta) + gifPlayback: true em mensagem única.
 * - 'STANDARD': Mídia convencional (imagem, áudio PTT/música, vídeo normal, documento) ou texto puro.
 */

/**
 * Constrói o objeto de mensagem Baileys adequado para o tipo de resposta/mídia.
 * 
 * @param {Object} params
 * @param {string} [params.messageType='text'] - 'text' | 'media' | 'image' | 'video' | 'audio' | 'document'
 * @param {string} [params.text=''] - Texto principal da mensagem
 * @param {string} [params.caption=''] - Legenda da mídia
 * @param {string} [params.mediaUrl=null] - URL pública da mídia
 * @param {string} [params.mimetype=null] - MIME type explícito
 * @param {string} [params.fileName=null] - Nome do arquivo para exibição
 * @param {'STANDARD' | 'TUTORIAL'} [params.responseType='STANDARD'] - Tipo da resposta pronta
 * @param {boolean} [params.ptt=false] - Se o áudio deve ser enviado como Push-to-Talk (gravado na hora)
 * @param {boolean} [params.forceDocument=false] - Se a mídia deve ser forçada como documento (ex: arquivos > limite)
 * @returns {Object} Payload formatado para sock.sendMessage(jid, payload)
 */
export function buildWhatsAppMessage({
    messageType = 'text',
    text = '',
    caption = '',
    mediaUrl = null,
    mimetype = null,
    fileName = null,
    responseType = 'STANDARD',
    ptt = false,
    forceDocument = false
}) {
    const finalCaption = caption || text || '';

    // ==========================================
    // 1. TIPO TUTORIAL (Vídeo + Caption + gifPlayback)
    // ==========================================
    if (responseType === 'TUTORIAL') {
        if (!mediaUrl) {
            throw new Error('Resposta pronta do tipo TUTORIAL precisa possuir uma URL de vídeo válida.');
        }

        return {
            video: {
                url: mediaUrl
            },
            caption: finalCaption,
            mimetype: mimetype || 'video/mp4',
            gifPlayback: true
        };
    }

    // ==========================================
    // 2. MENSAGEM DE TEXTO SIMPLES
    // ==========================================
    if ((messageType === 'text' || !mediaUrl) && !mediaUrl) {
        return {
            text: finalCaption
        };
    }

    // ==========================================
    // 3. MÍDIA STANDARD (Convencional)
    // ==========================================
    let pathname = '';
    try {
        pathname = new URL(mediaUrl).pathname;
    } catch (e) {
        pathname = mediaUrl || '';
    }

    const isImage = messageType === 'image' || Boolean(pathname.match(/\.(jpeg|jpg|gif|png|webp)$/i));
    const isVideo = messageType === 'video' || Boolean(pathname.match(/\.(mp4|3gp|mov|webm|avi|m4v)$/i));
    const isAudio = messageType === 'audio' || Boolean(pathname.match(/\.(mp3|ogg|wav|m4a|aac)$/i)) || mediaUrl.includes('audio');

    let cleanFileName = fileName || pathname.split('/').pop()?.split('?')[0] || '';
    if (cleanFileName.includes('_')) {
        const parts = cleanFileName.split('_');
        if (parts.length > 1 && /^\d+$/.test(parts[0])) {
            cleanFileName = parts.slice(1).join('_');
        }
    }

    const getMimeTypeFromFileName = (fName) => {
        const ext = fName.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'pdf': return 'application/pdf';
            case 'doc': return 'application/msword';
            case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            case 'xls': return 'application/vnd.ms-excel';
            case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            case 'ppt': return 'application/vnd.ms-powerpoint';
            case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
            case 'txt': return 'text/plain';
            case 'csv': return 'text/csv';
            case 'zip': return 'application/zip';
            case 'rar': return 'application/x-rar-compressed';
            case 'png': return 'image/png';
            case 'jpg':
            case 'jpeg': return 'image/jpeg';
            case 'gif': return 'image/gif';
            case 'webp': return 'image/webp';
            case 'mp3': return 'audio/mpeg';
            case 'ogg': return 'audio/ogg';
            case 'wav': return 'audio/wav';
            case 'mp4': return 'video/mp4';
            default: return mimetype || 'application/octet-stream';
        }
    };

    const mediaPayload = {};

    if (forceDocument) {
        mediaPayload.document = { url: mediaUrl };
        if (isVideo) mediaPayload.mimetype = 'video/mp4';
        else if (isImage) mediaPayload.mimetype = 'image/jpeg';
        else if (isAudio) mediaPayload.mimetype = 'audio/ogg';
        else mediaPayload.mimetype = mimetype || getMimeTypeFromFileName(cleanFileName);

        mediaPayload.fileName = cleanFileName || (isVideo ? 'video.mp4' : isImage ? 'image.jpg' : isAudio ? 'audio.ogg' : 'documento');
    } else if (isImage) {
        mediaPayload.image = { url: mediaUrl };
        mediaPayload.mimetype = mimetype || 'image/jpeg';
    } else if (isVideo) {
        mediaPayload.video = { url: mediaUrl };
        mediaPayload.mimetype = mimetype || 'video/mp4';
        mediaPayload.gifPlayback = false;
    } else if (isAudio) {
        mediaPayload.audio = { url: mediaUrl };
        mediaPayload.mimetype = mimetype || 'audio/ogg; codecs=opus';
        mediaPayload.ptt = ptt || mediaUrl.includes('ptt') || mediaUrl.includes('audio');
    } else {
        mediaPayload.document = { url: mediaUrl };
        mediaPayload.mimetype = mimetype || getMimeTypeFromFileName(cleanFileName);
        mediaPayload.fileName = cleanFileName || 'documento';
    }

    if (finalCaption) {
        mediaPayload.caption = finalCaption;
    }

    return mediaPayload;
}
