import net from 'node:net';

/**
 * Extrai a chave de API pública aceita nos endpoints externos (/message/*, /instance/*).
 */
export function extractPublicApiKey(headers = {}, query = {}) {
    const authHeader = String(headers.authorization || headers.Authorization || '');
    const bearerKey = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : null;
    return (
        headers.apikey ||
        headers.globalapikey ||
        headers['x-api-key'] ||
        headers['X-Api-Key'] ||
        bearerKey ||
        query?.apikey ||
        null
    );
}

/**
 * Normaliza slug de nome de caixa para matching resiliente (ex: Comercial-02 -> comercial2).
 */
export function normalizeInstanceSlug(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[-_\s]+/g, '')
        .replace(/0+(\d+)/g, '$1')
        .trim();
}

/**
 * Verifica se um identificador informado na URL/body corresponde a uma instância específica.
 */
export function matchesInstanceIdentifier(inst, identifier) {
    if (!inst || !identifier || typeof identifier !== 'string') return false;
    const clean = identifier.trim();
    if (!clean) return false;
    if (inst.id === clean) return true;

    const displayName = String(inst.display_name || '').trim();
    if (displayName && displayName.toLowerCase() === clean.toLowerCase()) return true;

    const targetSlug = normalizeInstanceSlug(clean);
    if (targetSlug && normalizeInstanceSlug(displayName) === targetSlug) return true;

    const cleanDigits = clean.replace(/\D/g, '');
    const phoneDigits = String(inst.phone_number || '').replace(/\D/g, '');
    if (cleanDigits.length >= 8 && phoneDigits) {
        if (phoneDigits === cleanDigits || phoneDigits === `55${cleanDigits}` || `55${phoneDigits}` === cleanDigits) {
            return true;
        }
    }
    return false;
}

/**
 * Extrai o telefone/JID de destino aceitando aliases comuns de integradores.
 */
export function extractTargetNumber(body = {}) {
    return body?.number || body?.phone || body?.to || body?.remoteJid || null;
}

/**
 * Extrai payload padronizado de texto para /message/sendText e aliases.
 */
export function extractSendTextPayload(body = {}) {
    return {
        number: extractTargetNumber(body),
        text: body?.text ?? body?.textMessage?.text ?? body?.message ?? body?.body ?? null
    };
}

/**
 * Converte coordenada preservando 0 (equador/meridiano de Greenwich).
 */
export function parseCoordinate(value) {
    if (value === undefined || value === null || value === '' || typeof value === 'boolean') {
        return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function isPrivateOrReservedIpv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
}

function isPrivateOrReservedIpv6(ip) {
    const lower = ip.toLowerCase().split('%')[0];
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) {
        const mapped = lower.slice(7);
        if (net.isIPv4(mapped)) return isPrivateOrReservedIpv4(mapped);
    }
    return false;
}

/**
 * Valida URL pública para mídia externa, bloqueando esquemas não-HTTP e alvos internos (SSRF).
 */
export function isSafeExternalMediaUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        return { ok: false, reason: 'URL da mídia ausente ou inválida.' };
    }
    let parsed;
    try {
        parsed = new URL(rawUrl.trim());
    } catch {
        return { ok: false, reason: 'URL da mídia malformada.' };
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { ok: false, reason: 'Protocolo da URL não suportado (use http ou https).' };
    }
    if (parsed.username || parsed.password) {
        return { ok: false, reason: 'URLs com credenciais embutidas não são permitidas.' };
    }
    const rawHost = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!rawHost || rawHost === 'localhost' || rawHost.endsWith('.localhost') || rawHost.endsWith('.local') || rawHost.endsWith('.internal')) {
        return { ok: false, reason: 'Destino de rede local/interno não permitido.' };
    }
    const ipVersion = net.isIP(rawHost);
    if (ipVersion === 4 && isPrivateOrReservedIpv4(rawHost)) {
        return { ok: false, reason: 'Endereço IPv4 privado ou reservado não permitido.' };
    }
    if (ipVersion === 6 && isPrivateOrReservedIpv6(rawHost)) {
        return { ok: false, reason: 'Endereço IPv6 privado ou reservado não permitido.' };
    }
    return { ok: true, url: parsed.toString() };
}

/**
 * Ajusta nome/extensão/MIME de upload após eventual transcodificação de áudio (.webm -> .ogg).
 */
export function normalizeAudioUploadMeta(file, mediatype, convertedToOgg = false) {
    const origName = file?.originalname || (mediatype === 'audio' ? 'audio.ogg' : 'arquivo');
    if (convertedToOgg) {
        const oggName = /\.webm$/i.test(origName) ? origName.replace(/\.webm$/i, '.ogg') : `${origName}.ogg`;
        return { ext: 'ogg', fileName: oggName, mimetype: 'audio/ogg; codecs=opus' };
    }
    const parts = origName.split('.');
    const extFromName = parts.length > 1 ? parts.pop().toLowerCase() : '';
    const fallbackExt = mediatype === 'audio' ? 'ogg' : mediatype === 'image' ? 'png' : mediatype === 'video' ? 'mp4' : 'bin';
    return {
        ext: extFromName || fallbackExt,
        fileName: origName,
        mimetype: file?.mimetype || 'application/octet-stream'
    };
}

/**
 * Remove funções/campos não serializáveis antes de gravar options JSONB no outbox.
 */
export function sanitizeOutboxOptions(options = {}) {
    if (!options || typeof options !== 'object') return {};
    const clean = {};
    for (const [k, v] of Object.entries(options)) {
        if (typeof v === 'function' || v === undefined) continue;
        clean[k] = v;
    }
    return clean;
}
