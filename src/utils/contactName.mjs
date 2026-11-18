const PLACEHOLDER_NAMES = new Set([
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
  'desconhecido',
]);

/**
 * Normalizes whitespace and diacritics for comparisons.
 */
function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Checks whether a name is empty or a generic placeholder label.
 */
export function isPlaceholderContactName(name, blockedNames = []) {
  if (typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;

  const norm = normalizeText(trimmed);
  if (!norm || PLACEHOLDER_NAMES.has(norm)) return true;

  const compact = norm.replace(/\s+/g, '');
  for (const blocked of blockedNames) {
    if (!blocked || typeof blocked !== 'string') continue;
    const normBlocked = normalizeText(blocked);
    if (!normBlocked) continue;
    if (norm === normBlocked || compact === normBlocked.replace(/\s+/g, '')) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a contact name contains only digits/phone punctuation and matches the phone number.
 */
export function isPhoneOnlyName(name, phone) {
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

/**
 * Detects PIX payment instruction / bank payload messages that must never rename a customer.
 */
export function isPixOrPaymentMessage(textContent) {
  if (typeof textContent !== 'string' || !textContent.trim()) return false;
  return /(\bnosso\s+pix\b|\bchave\s+pix\b|copia\s+e\s+cola|br\.gov\.bcb\.pix|00020101)/i.test(textContent);
}

/**
 * Resolves a fallback contact identifier strictly to its phone number when no real name exists.
 */
export function resolvePhoneFallback(phone, whatsappJid) {
  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  if (cleanPhone && cleanPhone !== 'undefined' && cleanPhone !== 'null') {
    return cleanPhone;
  }
  if (typeof whatsappJid === 'string' && whatsappJid.trim()) {
    const jidUser = whatsappJid.split('@')[0]?.split(':')[0]?.trim();
    if (jidUser && jidUser !== 'undefined' && jidUser !== 'null') {
      return jidUser;
    }
  }
  return '';
}

/**
 * Sanitizes a non-custom contact name, falling back to the phone number when invalid or generic.
 */
export function sanitizeContactNameValue(targetName, fallbackPhone, blockedNames = []) {
  const fallback = resolvePhoneFallback(fallbackPhone);
  if (typeof targetName !== 'string') return fallback || null;
  const trimmed = targetName.trim();
  if (!trimmed) return fallback || null;

  if (isPlaceholderContactName(trimmed, blockedNames)) {
    return fallback || null;
  }
  return trimmed;
}

/**
 * Returns true if the contact currently has no curated custom_name and no valid non-phone name.
 */
export function needsContactName(contact) {
  if (!contact) return true;
  const custom = typeof contact.custom_name === 'string' ? contact.custom_name.trim() : '';
  if (custom && !isPlaceholderContactName(custom) && !normalizeText(custom).includes('locaserv')) {
    return false;
  }

  const currentName = typeof contact.name === 'string' ? contact.name.trim() : '';
  if (!currentName) return true;
  if (isPlaceholderContactName(currentName)) return true;
  if (isPhoneOnlyName(currentName, contact.phone)) return true;
  if (normalizeText(currentName).includes('locaserv')) return true;
  return false;
}

/**
 * Safely extracts a contact name from an automation rule only on eligible client messages
 * and only when the contact still lacks a real name.
 */
export function extractContactNameFromAutomation({
  textContent,
  conditionText,
  senderType,
  direction,
  fromMe = false,
  existingContact = null,
  blockedNames = [],
}) {
  if (senderType !== 'client') return null;
  const normDir = typeof direction === 'string' ? direction.toLowerCase().trim() : '';
  if (normDir === 'outbound' || normDir === 'outgoing') return null;
  if (fromMe === true) return null;

  if (!textContent || typeof textContent !== 'string') return null;
  if (!conditionText || typeof conditionText !== 'string') return null;
  if (isPixOrPaymentMessage(textContent)) return null;

  if (existingContact && !needsContactName(existingContact)) {
    return null;
  }

  const escapedPattern = conditionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const finalPattern = escapedPattern.replace(/\\\(X\\\)/ig, '\\s*([^\\r\\n]+)');
  const regex = new RegExp(finalPattern, 'im');
  const match = textContent.match(regex);
  if (!match) return null;

  const rawExtracted = match.length > 1 ? match[1] : match[0];
  const candidate = typeof rawExtracted === 'string' ? rawExtracted.trim() : '';

  if (candidate.length < 2 || candidate.length >= 100) return null;
  if (!/[A-Za-zÀ-ÿ]/.test(candidate)) return null;

  const normCandidate = normalizeText(candidate);
  if (
    normCandidate.includes('locaserv') ||
    normCandidate.includes('chave pix') ||
    normCandidate.includes('nosso pix') ||
    isPlaceholderContactName(candidate, blockedNames) ||
    isPhoneOnlyName(candidate, existingContact?.phone)
  ) {
    return null;
  }

  return candidate;
}
