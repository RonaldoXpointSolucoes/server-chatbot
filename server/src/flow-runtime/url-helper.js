/**
 * Utilitário backend para detecção, proteção de GUIDs e normalização de URLs/Links em mensagens de fluxo, IA e WhatsApp API.
 * 1. Garante que qualquer link enviado via WhatsApp API (Baileys) possua o prefixo https://
 *    para ser reconhecido como hiperlink clicável pelos clientes WhatsApp (Android, iOS, Web e Desktop).
 * 2. Protege chaves GUID/UUID (8-4-4-4-12) e sequências numéricas hifenizadas dentro de URLs (ex: links do iFood)
 *    codificando os hifens internos do GUID como %2D (padrão RFC 3986). Isso impede que o detector nativo de
 *    Chave Pix Aleatória (EVP) ou de telefone do WhatsApp/iOS/Android separe o GUID do restante do link.
 */

export const URL_REGEX = /(https?:\/\/[^\s<>'"]+|www\.[a-zA-Z0-9-]+\.[^\s<>'"]+|(?:[a-zA-Z0-9-]+\.)+(?:com\.br|com|net\.br|net|org\.br|org|app|io|me|ai|co|link|site|store|tech|dev|br)\/[^\s<>'"]*)/gi;

const UUID_IN_URL_REGEX = /([0-9a-fA-F]{8})(?:-|%(?:2d|2D))([0-9a-fA-F]{4})(?:-|%(?:2d|2D))([0-9a-fA-F]{4})(?:-|%(?:2d|2D))([0-9a-fA-F]{4})(?:-|%(?:2d|2D))([0-9a-fA-F]{12})/g;

/**
 * Protege GUIDs/UUIDs e sequências numéricas hifenizadas dentro do caminho de uma URL individual
 * substituindo os hifens internos por %2D (RFC 3986).
 * Preserva 100% a compatibilidade com navegadores, servidores web e deep links (iOS Universal Links / Android App Links),
 * mas impede que o WhatsApp Mobile interprete o UUID como Chave Pix Aleatória ou número de telefone separado.
 *
 * @param {string} url
 * @returns {string}
 */
export function protectGuidInUrl(url) {
    if (!url || typeof url !== 'string') return url || '';

    // Remove caracteres invisíveis (zero-width) eventualmente colados junto ao link
    let safeUrl = url.replace(/[\u200B-\u200D\uFEFF\u2060]/g, '');

    // Codifica hifens internos de qualquer UUID/GUID (8-4-4-4-12) como %2D
    safeUrl = safeUrl.replace(UUID_IN_URL_REGEX, '$1%2D$2%2D$3%2D$4%2D$5');

    // Protege também sequências numéricas estilo telefone (\d{4,5}-\d{4}) apenas no path da URL (após o domínio)
    const schemeIdx = safeUrl.indexOf('://');
    const pathStartIdx = schemeIdx !== -1 ? safeUrl.indexOf('/', schemeIdx + 3) : safeUrl.indexOf('/');
    if (pathStartIdx !== -1) {
        const originPart = safeUrl.slice(0, pathStartIdx);
        const pathAndQueryPart = safeUrl.slice(pathStartIdx).replace(/(\d{4,5})-(\d{3,5})/g, '$1%2D$2');
        safeUrl = originPart + pathAndQueryPart;
    }

    return safeUrl;
}

/**
 * Normaliza todas as URLs encontradas em um texto, garantindo que iniciem com https://
 * e que chaves GUID dentro do link fiquem protegidas contra quebra no WhatsApp Mobile.
 * Preserva pontuações finais de frase (.,;:!?) para não quebrar a sintaxe do link.
 * 
 * @param {string} text
 * @returns {string}
 */
export function normalizeUrlsInText(text) {
    if (!text || typeof text !== 'string') return text || '';

    // Garante espaço caso um emoji ou símbolo esteja colado imediatamente antes de http(s):// ou www. (sem quebrar https://www.)
    const spacedText = text.replace(/([^\s([<"'`:/a-zA-Z0-9._-])((?:https?:\/\/|www\.)[^\s<>'"]+)/gi, '$1 $2');

    return spacedText.replace(URL_REGEX, (matched) => {
        let cleanUrl = matched;
        let trailingPunct = '';

        const punctMatch = matched.match(/([.,;:!?]+)$/);
        if (punctMatch) {
            trailingPunct = punctMatch[1];
            cleanUrl = matched.slice(0, -trailingPunct.length);
        }

        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            cleanUrl = 'https://' + cleanUrl;
        }

        cleanUrl = protectGuidInUrl(cleanUrl);

        return cleanUrl + trailingPunct;
    });
}

/**
 * Extrai lista de URLs encontradas no texto (já normalizadas e com GUID protegido)
 * 
 * @param {string} text 
 * @returns {string[]}
 */
export function extractUrlsFromText(text) {
    if (!text || typeof text !== 'string') return [];
    const normalized = normalizeUrlsInText(text);
    const matches = normalized.match(URL_REGEX) || [];
    return matches.map(m => {
        let clean = m.replace(/[.,;:!?]+$/, '');
        if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
            clean = 'https://' + clean;
        }
        return protectGuidInUrl(clean);
    });
}

/**
 * Formata um slug de URL (ex: "churrasjuarez-marmitex-e-almoco") em título legível
 */
function formatSlugTitle(slug) {
    if (!slug) return '';
    return decodeURIComponent(slug)
        .replace(/%2D/gi, '-')
        .split('-')
        .filter(Boolean)
        .map(w => w.length <= 2 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
        .replace(/\b(sp|rj|mg|pr|rs|sc|ba|df|go|pe|ce|es|mt|ms|pa|am|ma|pb|rn|al|se|pi|to|ro|ac|ap|rr)$/i, (m) => m.toUpperCase());
}

/**
 * Constrói metadados de Link Preview resilientes quando o site alvo bloqueia o servidor (ex: Cloudflare 403 / "Just a moment..." no iFood).
 * Garante que o ExtendedTextMessage da Baileys sempre receba matched-text e canonical-url completos.
 *
 * @param {string} url
 * @param {object|undefined} existingInfo
 * @returns {object}
 */
export function ensureResilientUrlInfo(url, existingInfo = undefined) {
    const safeUrl = protectGuidInUrl(url);
    const rawTitle = existingInfo?.title ? String(existingInfo.title).trim() : '';
    const isBlockedOrBrokenTitle =
        !rawTitle ||
        /^(just a moment|um momento|attention required|access denied|403 forbidden|cloudflare|\|\s*undefined\s*\||undefined)/i.test(rawTitle);

    if (existingInfo && !isBlockedOrBrokenTitle) {
        return {
            ...existingInfo,
            'canonical-url': safeUrl,
            'matched-text': url
        };
    }

    const ifoodMatch = safeUrl.match(/ifood\.com\.br\/delivery\/([^/?#]+)\/([^/?#]+)/i);
    if (ifoodMatch) {
        const cityTitle = formatSlugTitle(ifoodMatch[1]);
        const storeTitle = formatSlugTitle(ifoodMatch[2]);
        return {
            'canonical-url': safeUrl,
            'matched-text': url,
            title: `${storeTitle} | iFood Delivery`,
            description: cityTitle
                ? `Peça online em ${storeTitle} (${cityTitle}) pelo iFood.`
                : `Faça seu pedido online em ${storeTitle} pelo iFood.`
        };
    }

    const gastroMatch = safeUrl.match(/gastrofood\.com\.br\/loja\/([^/?#]+)/i);
    if (gastroMatch) {
        const storeTitle = formatSlugTitle(gastroMatch[1]);
        return {
            'canonical-url': safeUrl,
            'matched-text': url,
            title: `${storeTitle} | Cardápio Digital`,
            description: `Acesse nosso cardápio digital e faça seu pedido online.`
        };
    }

    try {
        const parsed = new URL(safeUrl.startsWith('http') ? safeUrl : `https://${safeUrl}`);
        return {
            'canonical-url': safeUrl,
            'matched-text': url,
            title: existingInfo?.title && !isBlockedOrBrokenTitle ? existingInfo.title : parsed.hostname.replace(/^www\./, ''),
            description: existingInfo?.description || safeUrl
        };
    } catch {
        return {
            'canonical-url': safeUrl,
            'matched-text': url,
            title: 'Abrir Link',
            description: safeUrl
        };
    }
}

