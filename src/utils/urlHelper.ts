/**
 * Utilitário centralizado para detecção, validação e normalização de URLs/Links
 * para garantir compatibilidade com a API do WhatsApp (Baileys) e renderização visual.
 */

// Regex para captura de URLs: com http(s), com www., ou domínios comuns com caminho
export const URL_REGEX = /(https?:\/\/[^\s<>'"]+|www\.[a-zA-Z0-9-]+\.[^\s<>'"]+|(?:[a-zA-Z0-9-]+\.)+(?:com\.br|com|net\.br|net|org\.br|org|app|io|me|ai|co|link|site|store|tech|dev|br)\/[^\s<>'"]*)/gi;

export interface ExtractedUrlInfo {
  original: string;
  normalized: string;
  hasHttps: boolean;
}

/**
 * Normaliza todas as URLs encontradas em um texto, garantindo que iniciem com https://
 * Preserva pontuações de final de frase (ex: "acesse www.site.com." não inclui o ponto final na URL)
 */
export function normalizeUrlsInText(text: string): string {
  if (!text || typeof text !== 'string') return text || '';

  return text.replace(URL_REGEX, (matched) => {
    let cleanUrl = matched;
    let trailingPunct = '';
    
    // Separa pontuação final comum da língua natural (.,;:!?)
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
 * Extrai todas as URLs de um texto com informações se já possuem https:// ou não
 */
export function extractUrlsFromText(text: string): ExtractedUrlInfo[] {
  if (!text || typeof text !== 'string') return [];

  const matches = text.match(URL_REGEX) || [];
  return matches.map((m) => {
    let cleanUrl = m;
    const punctMatch = m.match(/([.,;:!?]+)$/);
    if (punctMatch) {
      cleanUrl = m.slice(0, -punctMatch[1].length);
    }

    const hasHttps = cleanUrl.startsWith('https://');
    let normalized = cleanUrl;
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }

    return {
      original: cleanUrl,
      normalized,
      hasHttps
    };
  });
}

/**
 * Formata um texto dividindo em segmentos para renderização React (texto puro, variáveis, e URLs)
 */
export type FormattedTextSegment = 
  | { type: 'text'; content: string }
  | { type: 'variable'; content: string }
  | { type: 'url'; content: string; href: string };

export function parseTextToSegments(text: string): FormattedTextSegment[] {
  if (!text) return [];

  // Primeiro divide por variáveis {{nome}} ou {nome}
  const variableParts = text.split(/(\{\{[^}]+\}\}|\{[^}]+\})/g);
  const segments: FormattedTextSegment[] = [];

  for (const part of variableParts) {
    if (!part) continue;

    const varMatch = part.match(/^\{\{?([^}]+)\}?\}$/);
    if (varMatch) {
      segments.push({
        type: 'variable',
        content: varMatch[1].trim()
      });
      continue;
    }

    // Dentro do texto livre, procura por URLs
    let remaining = part;
    let match: RegExpExecArray | null;
    const regex = new RegExp(URL_REGEX.source, 'gi');

    let lastIdx = 0;
    while ((match = regex.exec(remaining)) !== null) {
      const matchIndex = match.index;
      const matchedString = match[0];

      // Texto antes da URL
      if (matchIndex > lastIdx) {
        segments.push({
          type: 'text',
          content: remaining.slice(lastIdx, matchIndex)
        });
      }

      // Separa pontuação final
      let cleanUrl = matchedString;
      let trailingPunct = '';
      const punctMatch = matchedString.match(/([.,;:!?]+)$/);
      if (punctMatch) {
        trailingPunct = punctMatch[1];
        cleanUrl = matchedString.slice(0, -trailingPunct.length);
      }

      let href = cleanUrl;
      if (!href.startsWith('http://') && !href.startsWith('https://')) {
        href = 'https://' + href;
      }

      segments.push({
        type: 'url',
        content: cleanUrl,
        href
      });

      if (trailingPunct) {
        segments.push({
          type: 'text',
          content: trailingPunct
        });
      }

      lastIdx = matchIndex + matchedString.length;
    }

    if (lastIdx < remaining.length) {
      segments.push({
        type: 'text',
        content: remaining.slice(lastIdx)
      });
    }
  }

  return segments;
}
