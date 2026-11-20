export function normalizeEmailValue(value) {
  return String(value || '').trim().toLowerCase();
}

export function isMasterWorkspaceAdmin({ email, adminToken, saasAdmin } = {}) {
  const normEmail = normalizeEmailValue(email);
  if (normEmail === 'ronaldo.xpointsolucoes@gmail.com') {
    return true;
  }
  return String(adminToken || '') === 'true' && String(saasAdmin || '') === 'true';
}

export function normalizeAllowedCompanyIds(raw) {
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map(v => String(v || '').trim()).filter(Boolean)));
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed.map(v => String(v || '').trim()).filter(Boolean)));
      }
    } catch (_) {
      return [];
    }
  }
  return [];
}

const STANDALONE_PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000';

export function mergeAndSortWorkspaces({
  companies = [],
  activeTenantId = null,
  activeCompanyFallback = null,
  userEmail = null,
  preferredGroupId = null,
  includeStandalonePlaceholder = false
} = {}) {
  const normUserEmail = normalizeEmailValue(userEmail);
  const byId = new Map();

  for (const item of Array.isArray(companies) ? companies : []) {
    if (!item || !item.id) continue;
    if (
      !includeStandalonePlaceholder &&
      item.id === STANDALONE_PLACEHOLDER_ID &&
      item.id !== activeTenantId
    ) {
      continue;
    }
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...existing, ...item } : { ...item });
  }

  if (activeTenantId && !byId.has(activeTenantId) && activeCompanyFallback?.id === activeTenantId) {
    byId.set(activeTenantId, {
      id: activeTenantId,
      name: activeCompanyFallback.name || 'Empresa Atual',
      email: activeCompanyFallback.email || userEmail || null,
      status: activeCompanyFallback.status || 'active',
      plan_id: activeCompanyFallback.plan_id || null,
      economic_group_id: activeCompanyFallback.economic_group_id || null
    });
  }

  const scoreCompany = (comp) => {
    if (comp.id === activeTenantId) return 0;
    const compEmail = normalizeEmailValue(comp.email);
    if (normUserEmail && compEmail === normUserEmail) return 1;
    if (preferredGroupId && comp.economic_group_id === preferredGroupId) return 2;
    return 3;
  };

  return Array.from(byId.values()).sort((a, b) => {
    const scoreDiff = scoreCompany(a) - scoreCompany(b);
    if (scoreDiff !== 0) return scoreDiff;
    return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' });
  });
}

function normalizeSearchToken(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function filterWorkspacesByQuery(companies = [], query = '') {
  const norm = normalizeSearchToken(query);
  if (!norm) return Array.isArray(companies) ? companies : [];
  return (Array.isArray(companies) ? companies : []).filter((comp) => {
    const haystack = normalizeSearchToken(
      `${comp?.name || ''} ${comp?.email || ''} ${comp?.plan_name || ''}`
    );
    return haystack.includes(norm);
  });
}
