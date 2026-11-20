export const DEFAULT_REMOTE_ADMIN_EMAIL = 'ronaldo.xpointsolucoes@gmail.com';
export const LEGACY_GLOBAL_ALLOWED_EMAILS_KEY = 'xpoint_allowed_google_emails_v1';
export const LEGACY_VERIFIED_GOOGLE_EMAIL_KEY = 'xpoint_google_oauth_verified_email';

const ALLOWED_EMAILS_KEY_PREFIX = 'xpoint_allowed_google_emails_v2_';
const VERIFIED_EMAIL_KEY_PREFIX = 'xpoint_google_oauth_verified_email_v2_';

/**
 * Normaliza e valida um ID de tenant, descartando placeholders vazios ou inválidos.
 */
export function normalizeRemoteTenantId(tenantId) {
  const clean = String(tenantId || '').trim();
  if (!clean || clean === 'undefined' || clean === 'null') return null;
  return clean;
}

/**
 * Normaliza endereços de e-mail para comparações determinísticas sem sensibilidade a maiúsculas.
 */
export function normalizeRemoteEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmailAddress(cleanEmail) {
  return Boolean(cleanEmail && cleanEmail.includes('@') && cleanEmail.includes('.'));
}

/**
 * Determina estritamente (default-deny) se uma empresa possui o módulo de Acesso Remoto ativo.
 */
export function isRemoteAccessEnabledForCompany(company) {
  return company?.settings?.remote_access_enabled === true;
}

/**
 * Resolve a habilitação do Acesso Remoto entre o tenant principal e um fallback sem vazar flags entre empresas.
 */
export function resolveRemoteAccessEnabled(primaryCompany, fallbackCompany) {
  if (primaryCompany && primaryCompany.settings && typeof primaryCompany.settings === 'object') {
    return isRemoteAccessEnabledForCompany(primaryCompany);
  }

  const primaryId = normalizeRemoteTenantId(primaryCompany?.id);
  const fallbackId = normalizeRemoteTenantId(fallbackCompany?.id);

  if (!fallbackCompany) return false;
  if (primaryId && fallbackId && primaryId !== fallbackId) return false;

  return isRemoteAccessEnabledForCompany(fallbackCompany);
}

/**
 * Retorna a chave de storage isolada por empresa para a lista de e-mails Google autorizados.
 */
export function getScopedAllowedEmailsStorageKey(tenantId) {
  const cleanId = normalizeRemoteTenantId(tenantId);
  return cleanId ? `${ALLOWED_EMAILS_KEY_PREFIX}${cleanId}` : null;
}

/**
 * Retorna a chave de storage isolada por empresa para o e-mail Google autenticado na sessão.
 */
export function getScopedVerifiedEmailStorageKey(tenantId) {
  const cleanId = normalizeRemoteTenantId(tenantId);
  return cleanId ? `${VERIFIED_EMAIL_KEY_PREFIX}${cleanId}` : null;
}

/**
 * Lê a lista de e-mails Google autorizados estritamente no escopo do tenant ativo.
 */
export function readScopedAllowedGoogleEmails(storage, tenantId) {
  const key = getScopedAllowedEmailsStorageKey(tenantId);
  if (!key) return [];

  const emails = new Set([normalizeRemoteEmail(DEFAULT_REMOTE_ADMIN_EMAIL)]);
  if (!storage || typeof storage.getItem !== 'function') {
    return Array.from(emails);
  }

  try {
    const raw = storage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          const clean = normalizeRemoteEmail(item);
          if (isValidEmailAddress(clean)) emails.add(clean);
        });
      }
    }
  } catch (_) {
    // ignora JSON corrompido no storage local
  }

  return Array.from(emails);
}

/**
 * Grava a lista de e-mails Google autorizados estritamente na chave do tenant informado.
 */
export function writeScopedAllowedGoogleEmails(storage, tenantId, emails = []) {
  const key = getScopedAllowedEmailsStorageKey(tenantId);
  if (!key) return [];

  const unique = Array.from(
    new Set(
      [DEFAULT_REMOTE_ADMIN_EMAIL, ...(Array.isArray(emails) ? emails : [])]
        .map(normalizeRemoteEmail)
        .filter(isValidEmailAddress)
    )
  );

  if (storage && typeof storage.setItem === 'function') {
    try {
      storage.setItem(key, JSON.stringify(unique));
    } catch (_) {
      // ignora restrição de quota
    }
  }

  return unique;
}

/**
 * Lê o último e-mail Google verificado exclusivamente para a empresa informada.
 */
export function readScopedVerifiedGoogleEmail(storage, tenantId) {
  const key = getScopedVerifiedEmailStorageKey(tenantId);
  if (!key || !storage || typeof storage.getItem !== 'function') return null;

  try {
    const clean = normalizeRemoteEmail(storage.getItem(key));
    return isValidEmailAddress(clean) ? clean : null;
  } catch (_) {
    return null;
  }
}

/**
 * Salva ou remove o e-mail Google verificado exclusivamente na chave da empresa informada.
 */
export function writeScopedVerifiedGoogleEmail(storage, tenantId, email) {
  const key = getScopedVerifiedEmailStorageKey(tenantId);
  if (!key || !storage) return;

  const clean = normalizeRemoteEmail(email);
  try {
    if (isValidEmailAddress(clean)) {
      if (typeof storage.setItem === 'function') storage.setItem(key, clean);
    } else if (typeof storage.removeItem === 'function') {
      storage.removeItem(key);
    }
  } catch (_) {
    // ignora falha de storage
  }
}

/**
 * Remove as chaves legadas globais de OAuth/allowlist para impedir vazamento entre empresas.
 */
export function clearLegacyGlobalRemoteStorage(storage) {
  if (!storage || typeof storage.removeItem !== 'function') return;
  try {
    storage.removeItem(LEGACY_GLOBAL_ALLOWED_EMAILS_KEY);
    storage.removeItem(LEGACY_VERIFIED_GOOGLE_EMAIL_KEY);
  } catch (_) {
    // ignora falha de storage
  }
}

/**
 * Limpa chaves remotas da empresa atual e chaves globais legadas (ex.: ao trocar de workspace).
 */
export function clearScopedRemoteStorageForTenant(storage, tenantId) {
  clearLegacyGlobalRemoteStorage(storage);
  if (!storage || typeof storage.removeItem !== 'function') return;

  const allowedKey = getScopedAllowedEmailsStorageKey(tenantId);
  const verifiedKey = getScopedVerifiedEmailStorageKey(tenantId);
  try {
    if (allowedKey) storage.removeItem(allowedKey);
    if (verifiedKey) storage.removeItem(verifiedKey);
  } catch (_) {
    // ignora falha de storage
  }
}

/**
 * Verifica se um contato/empresa pertence ao tenant ativo quando tenant_id está preenchido.
 */
export function isContactOwnedByTenant(contact, tenantId) {
  if (!contact || typeof contact !== 'object') return false;
  const activeId = normalizeRemoteTenantId(tenantId);
  const recordTenantId = normalizeRemoteTenantId(contact.tenant_id);
  if (!activeId || !recordTenantId) return true;
  return recordTenantId === activeId;
}

/**
 * Filtra coleções de contatos ou empresas vinculadas preservando apenas registros da empresa ativa.
 */
export function filterRecordsByTenant(records, tenantId) {
  if (!Array.isArray(records)) return [];
  const activeId = normalizeRemoteTenantId(tenantId);
  if (!activeId) return [];
  return records.filter((item) => isContactOwnedByTenant(item, activeId));
}

/**
 * Extrai e higieniza e-mails válidos de uma string separada por vírgula, ponto-e-vírgula ou quebra de linha.
 */
export function parseAllowedEmailsInput(rawInput) {
  if (!rawInput) return [];
  const tokens = String(rawInput).split(/[\n,;]+/);
  return Array.from(new Set(tokens.map(normalizeRemoteEmail).filter(isValidEmailAddress)));
}
