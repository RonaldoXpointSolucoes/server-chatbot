/**
 * Utilitário backend para detecção e normalização de URLs/Links em mensagens de fluxo e WhatsApp API.
 * Garante que qualquer link enviado via WhatsApp API (Baileys) possua o prefixo https://
 * para ser reconhecido como hiperlink clicável pelos clientes WhatsApp (Android, iOS, Web e Desktop).
 */

export const URL_REGEX = /(https?:\/\/[^\s<>'"]+|www\.[a-zA-Z0-9-]+\.[^\s<>'"]+|(?:[a-zA-Z0-9-]+\.)+(?:com\.br|com|net\.br|net|org\.br|org|app|io|me|ai|co|link|site|store|tech|dev|br)\/[^\s<>'"]*)/gi;

/**
 * Normaliza todas as URLs encontradas em um texto, garantindo que iniciem com https://
 * Preserva pontuações finais de frase (.,;:!?) para não quebrar a sintaxe do link.
 * 
 * @param {string} text
 * @returns {string}
 */
export function normalizeUrlsInText(text) {
    if (!text || typeof text !== 'string') return text || '';

    return text.replace(URL_REGEX, (matched) => {
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

        return cleanUrl + trailingPunct;
    });
}

/**
 * Extrai lista de URLs encontradas no texto
 * 
 * @param {string} text 
 * @returns {string[]}
 */
export function extractUrlsFromText(text) {
    if (!text || typeof text !== 'string') return [];
    const matches = text.match(URL_REGEX) || [];
    return matches.map(m => {
        let clean = m.replace(/[.,;:!?]+$/, '');
        if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
            clean = 'https://' + clean;
        }
        return clean;
    });
}
