const CACHE_KEY_PREFIX = 'chatboot_global_ai_state_v1:';

export function getActiveTenantIdFromStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const tid = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
    return tid && tid !== 'undefined' && tid !== 'null' ? tid : null;
  } catch (_) {
    return null;
  }
}

export function buildGlobalAiCacheKey(tenantId) {
  return `${CACHE_KEY_PREFIX}${String(tenantId || '').trim()}`;
}

export function readCachedGlobalAiState(tenantId) {
  if (typeof window === 'undefined' || !tenantId) return null;
  const key = buildGlobalAiCacheKey(tenantId);
  try {
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.enabled !== 'boolean') return null;
    return {
      enabled: parsed.enabled,
      audit: parsed.audit ?? null,
      updatedAt: Number(parsed.updatedAt || 0)
    };
  } catch (_) {
    return null;
  }
}

export function writeCachedGlobalAiState(tenantId, state) {
  if (typeof window === 'undefined' || !tenantId || typeof state?.enabled !== 'boolean') return;
  const key = buildGlobalAiCacheKey(tenantId);
  try {
    const payload = JSON.stringify({
      enabled: state.enabled,
      audit: state.audit ?? null,
      updatedAt: Date.now()
    });
    localStorage.setItem(key, payload);
  } catch (_) {}
}

export function resolveHydratedGlobalAiState({ dbCompany = null, cachedState = null } = {}) {
  if (dbCompany && typeof dbCompany.global_ai_enabled === 'boolean') {
    return {
      enabled: dbCompany.global_ai_enabled,
      audit: dbCompany.settings?.global_ai_audit ?? cachedState?.audit ?? null
    };
  }
  if (cachedState && typeof cachedState.enabled === 'boolean') {
    return {
      enabled: cachedState.enabled,
      audit: cachedState.audit ?? null
    };
  }
  return {
    enabled: true,
    audit: null
  };
}

export function isPostgrestUpdateConfirmed({ updatedRow = null, error = null } = {}) {
  if (error) return false;
  return Boolean(updatedRow && updatedRow.id);
}
