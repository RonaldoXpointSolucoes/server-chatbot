/**
 * Utilitários puros para detecção, ordenação e persistência multi-tenant
 * de senhas fixas de planilhas Excel protegidas (ex.: Relatorio-Vendas-C6Pay_Detalhado).
 */

export const FILE_PASSWORD_RULE_PREFIX = 'file_password:';

export function buildSavedPasswordStorageKey(tenantId) {
  return `cash_recon_file_passwords_${String(tenantId || 'default').trim()}`;
}

export function isLikelyC6PayFileName(fileName) {
  const lower = String(fileName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /c6[\s_-]*(pay|detalhado)|relatorio[\s_-]*vendas[\s_-]*c6/.test(lower);
}

/**
 * Normaliza o nome de arquivo removendo extensão, datas e sufixos "(1)" para agrupar relatórios recorrentes.
 */
export function normalizePasswordFileKey(fileName) {
  const base = String(fileName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/\(\s*\d+\s*\)/g, '')
    .replace(/(?:^|[\s_-])\d{2,4}[-_/]\d{2}[-_/]\d{2,4}(?=$|[\s_-])/g, '')
    .replace(/\s+\d+\s*$/, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

  return base || 'PLANILHA_PROTEGIDA';
}

/**
 * Extrai os 6 primeiros dígitos numéricos de um CNPJ válido (14 dígitos) ou de tenant.settings.
 */
export function extractCnpjPrefix6(rawValueOrSettings) {
  if (!rawValueOrSettings) return '';
  if (typeof rawValueOrSettings === 'object') {
    const candidates = [
      rawValueOrSettings.cnpj,
      rawValueOrSettings.cpf_cnpj,
      rawValueOrSettings.document_number,
      rawValueOrSettings.company_cnpj,
      rawValueOrSettings.fiscal?.cnpj,
      rawValueOrSettings.empresa?.cnpj
    ];
    for (const c of candidates) {
      const prefix = extractCnpjPrefix6(c);
      if (prefix) return prefix;
    }
    return '';
  }
  const digits = String(rawValueOrSettings).replace(/\D/g, '');
  if (digits.length === 14) {
    return digits.slice(0, 6);
  }
  return '';
}

/**
 * Resolve o pattern persistido em cash_reconciliation_rules para uma planilha desbloqueada.
 */
export function buildPasswordRulePattern(fileName, fileType = '') {
  const ft = String(fileType || '').trim();
  if (ft === 'adquirente_c6pay' || isLikelyC6PayFileName(fileName)) {
    return `${FILE_PASSWORD_RULE_PREFIX}adquirente_c6pay`;
  }
  if (ft && ft !== 'unknown') {
    return `${FILE_PASSWORD_RULE_PREFIX}${ft}`;
  }
  return `${FILE_PASSWORD_RULE_PREFIX}${normalizePasswordFileKey(fileName)}`;
}

export function formatSavedPasswordLabel(patternOrKey, notes = '') {
  const raw = String(patternOrKey || '').replace(FILE_PASSWORD_RULE_PREFIX, '');
  if (raw === 'adquirente_c6pay' || isLikelyC6PayFileName(raw)) {
    return 'Maquininha C6 Pay (Relatorio-Vendas-C6Pay_Detalhado)';
  }
  if (raw === 'adquirente_rede') return 'Maquininha Rede';
  if (raw === 'pdv_vendas') return 'PDV Vendas (DataDivas)';
  if (raw === 'rel_conferencia') return 'Planilha de Conferência';
  if (notes) return notes;
  return raw;
}

const INTERNAL_ENGINE_SETTING_PATTERNS = new Set([
  'company_routine:profile',
  'whatsapp_notify:phone'
]);

export function isFilePasswordRule(rule) {
  return Boolean(rule && String(rule.pattern || '').startsWith(FILE_PASSWORD_RULE_PREFIX));
}

export function isInternalCashSettingRule(rule) {
  if (!rule) return false;
  if (isFilePasswordRule(rule)) return true;
  const pattern = String(rule.pattern || '').trim();
  return INTERNAL_ENGINE_SETTING_PATTERNS.has(pattern);
}

export function filterVisibleFormulaRules(rules = []) {
  if (!Array.isArray(rules)) return [];
  return rules.filter(r => Boolean(r) && !isInternalCashSettingRule(r));
}

export function extractSavedPasswordsFromRules(rules = []) {
  if (!Array.isArray(rules)) return [];
  const entries = [];
  for (const r of rules) {
    if (!r || r.is_active === false || !isFilePasswordRule(r)) continue;
    const pwd = String(r.target_value || '');
    if (!pwd) continue;
    const key = String(r.pattern).slice(FILE_PASSWORD_RULE_PREFIX.length);
    entries.push({
      pattern: String(r.pattern),
      key,
      label: formatSavedPasswordLabel(key, r.notes || ''),
      password: pwd,
      ruleId: r.id,
      fileType: key === 'adquirente_c6pay' || key === 'adquirente_rede' || key === 'pdv_vendas' ? key : '',
      updatedAt: r.updated_at || r.created_at || ''
    });
  }
  return entries;
}

export function loadSavedFilePasswordsFromStorage(storage, tenantId) {
  if (!storage || !tenantId) return [];
  try {
    const raw = storage.getItem(buildSavedPasswordStorageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(e => e && typeof e.password === 'string' && e.password.length > 0);
  } catch {
    return [];
  }
}

export function upsertSavedFilePasswordInStorage(storage, tenantId, entry) {
  if (!storage || !tenantId || !entry?.password) return [];
  const existing = loadSavedFilePasswordsFromStorage(storage, tenantId);
  const pattern = String(entry.pattern || buildPasswordRulePattern(entry.fileName || '', entry.fileType || ''));
  const key = pattern.startsWith(FILE_PASSWORD_RULE_PREFIX)
    ? pattern.slice(FILE_PASSWORD_RULE_PREFIX.length)
    : pattern;
  const normalizedEntry = {
    pattern,
    key,
    label: entry.label || formatSavedPasswordLabel(key, entry.fileName || ''),
    password: String(entry.password),
    fileType: entry.fileType || '',
    updatedAt: new Date().toISOString()
  };
  const updated = [normalizedEntry, ...existing.filter(e => e.pattern !== pattern)].slice(0, 20);
  try {
    storage.setItem(buildSavedPasswordStorageKey(tenantId), JSON.stringify(updated));
  } catch {
    // Falha silenciosa se quota de storage estiver indisponível
  }
  return updated;
}

export function removeSavedFilePasswordFromStorage(storage, tenantId, patternOrKey) {
  if (!storage || !tenantId || !patternOrKey) return [];
  const fullPattern = String(patternOrKey).startsWith(FILE_PASSWORD_RULE_PREFIX)
    ? String(patternOrKey)
    : `${FILE_PASSWORD_RULE_PREFIX}${patternOrKey}`;
  const existing = loadSavedFilePasswordsFromStorage(storage, tenantId);
  const updated = existing.filter(e => e.pattern !== fullPattern && e.key !== patternOrKey);
  try {
    storage.setItem(buildSavedPasswordStorageKey(tenantId), JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export function mergeSavedFilePasswordLists(localList = [], remoteList = []) {
  const byPattern = new Map();
  for (const item of [...(localList || []), ...(remoteList || [])]) {
    if (!item || !item.password) continue;
    const pattern = String(item.pattern || `${FILE_PASSWORD_RULE_PREFIX}${item.key || 'DEFAULT'}`);
    const key = pattern.startsWith(FILE_PASSWORD_RULE_PREFIX)
      ? pattern.slice(FILE_PASSWORD_RULE_PREFIX.length)
      : pattern;
    const normalized = {
      pattern,
      key,
      label: item.label || formatSavedPasswordLabel(key),
      password: String(item.password),
      ruleId: item.ruleId || byPattern.get(pattern)?.ruleId,
      fileType: item.fileType || byPattern.get(pattern)?.fileType || '',
      updatedAt: item.updatedAt || byPattern.get(pattern)?.updatedAt || ''
    };
    const prev = byPattern.get(pattern);
    // Remoto (com ruleId) prevalece quando ambos existem, ou mantém o mais recente
    if (!prev || (!prev.ruleId && normalized.ruleId) || (normalized.updatedAt && normalized.updatedAt > prev.updatedAt)) {
      byPattern.set(pattern, normalized);
    }
  }
  return Array.from(byPattern.values());
}

/**
 * Monta lista ordenada e sem duplicatas de senhas candidatas para abrir um arquivo Excel cifrado.
 */
export function buildPasswordCandidates({
  fileName = '',
  customPassword,
  savedPasswords = [],
  rulesConfig = null,
  tenantSettings = null
}) {
  const candidates = [];
  const pushUnique = (val) => {
    if (val === undefined || val === null) return;
    const str = String(val);
    if (!candidates.includes(str)) candidates.push(str);
  };

  if (customPassword !== undefined && customPassword !== '') {
    pushUnique(customPassword);
    // Se usuário colou CNPJ completo (14 dígitos), também testa os 6 primeiros dígitos (padrão C6 Pay)
    const cnpj6FromInput = extractCnpjPrefix6(customPassword);
    if (cnpj6FromInput) pushUnique(cnpj6FromInput);
    return candidates;
  }

  const allSaved = mergeSavedFilePasswordLists(savedPasswords, rulesConfig?.savedFilePasswords || []);
  const normName = normalizePasswordFileKey(fileName);
  const c6Hint = isLikelyC6PayFileName(fileName);

  const scored = allSaved.map((entry) => {
    const entryKey = String(entry.key || '').toUpperCase();
    let score = 1;
    if (entryKey === normName) score = 100;
    else if (c6Hint && (entryKey === 'ADQUIRENTE_C6PAY' || entryKey.includes('C6'))) score = 95;
    else if (normName && entryKey && (normName.includes(entryKey) || entryKey.includes(normName))) score = 70;
    return { entry, score };
  });
  scored.sort((a, b) => b.score - a.score);

  for (const { entry } of scored) {
    pushUnique(entry.password);
  }

  const cnpj6FromTenant = extractCnpjPrefix6(tenantSettings);
  if (cnpj6FromTenant) {
    pushUnique(cnpj6FromTenant);
  }

  pushUnique('VelvetSweatshop');
  pushUnique('');

  return candidates;
}
