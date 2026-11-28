/**
 * Motor puro de Memória Adaptativa por Empresa para Conferência de Caixa.
 * Aprende bancos (C6, Itaú, etc.) e relatórios diários habituais isolados por tenantId.
 */

import { identifyBankInstitution } from './cashFileParsers.mjs';

export const COMPANY_ROUTINE_RULE_PATTERN = 'company_routine:profile';

export function buildCompanyRoutineStorageKey(tenantId) {
  return `cash_recon_routine_${String(tenantId || 'default').trim()}`;
}

export function isCompanyRoutineRule(rule) {
  return Boolean(rule && String(rule.pattern || '').trim() === COMPANY_ROUTINE_RULE_PATTERN);
}

export function createEmptyRoutineProfile() {
  return {
    version: 1,
    updatedAt: '',
    banks: {},
    reports: {}
  };
}

function normalizeIsoDate(raw) {
  if (!raw) return '';
  const str = String(raw).trim();
  const iso = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return '';
}

export function isSpuriousAcquirerBankEntry(bankKey = '', bankLabel = '') {
  const hay = `${bankKey || ''} ${bankLabel || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[_./\\-]+/g, ' ');
  return (
    /\bC6\s*PAY\b/.test(hay) ||
    /\bC6PAY\b/.test(hay) ||
    /\bRELATORIO\s+VENDAS\s+C6/.test(hay) ||
    /\bREDE\s+REL\b/.test(hay)
  );
}

export function normalizeRoutineProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createEmptyRoutineProfile();
  }

  const banks = {};
  for (const [key, entry] of Object.entries(raw.banks || {})) {
    if (!entry || typeof entry !== 'object') continue;
    const bankKey = String(entry.bankKey || key || '').trim();
    if (!bankKey) continue;
    const bankLabel = String(entry.bankLabel || bankKey).trim();
    if (isSpuriousAcquirerBankEntry(bankKey, bankLabel)) continue;
    const count = Number(entry.seenCount);
    banks[bankKey] = {
      bankKey,
      bankCode: String(entry.bankCode || '').trim(),
      bankLabel,
      acctLast4: String(entry.acctLast4 || '').trim(),
      seenCount: Number.isFinite(count) && count >= 0 ? Math.round(count) : 0,
      lastSeenDate: normalizeIsoDate(entry.lastSeenDate),
      enabled: entry.enabled !== false
    };
  }

  const reports = {};
  for (const [key, entry] of Object.entries(raw.reports || {})) {
    if (!entry || typeof entry !== 'object') continue;
    const fileType = String(entry.fileType || key || '').trim();
    if (!fileType) continue;
    const count = Number(entry.seenCount);
    reports[fileType] = {
      fileType,
      seenCount: Number.isFinite(count) && count >= 0 ? Math.round(count) : 0,
      lastSeenDate: normalizeIsoDate(entry.lastSeenDate),
      enabled: entry.enabled !== false
    };
  }

  return {
    version: Number(raw.version || 1) || 1,
    updatedAt: String(raw.updatedAt || '').trim(),
    banks,
    reports
  };
}

/**
 * Extrai metadados canônicos de banco a partir de um arquivo parseado (ou snapshot salvo).
 */
export function extractBankMetaFromParsedFile(rawItem) {
  const file = rawItem?.parsed || rawItem;
  if (!file || file.status !== 'ok') return null;
  if (file.fileType !== 'extrato_ofx' && file.fileType !== 'extrato_generico') return null;

  const sum = file.summary || {};
  const row0 = Array.isArray(file.rows) && file.rows.length > 0 ? file.rows[0] : {};

  const explicitKey = String(sum.bankKey || row0.bankKey || '').trim();
  const rawCode = String(sum.bankCode || row0.bankCode || sum.bankId || row0.bankId || '').trim();
  const rawLabel = String(sum.bankLabel || row0.bankLabel || sum.bankName || row0.bankName || '').trim();
  const rawAcctLast4 = String(sum.acctLast4 || row0.acctLast4 || '').trim();
  const rawAcctId = String(sum.acctId || row0.acctId || rawAcctLast4).trim();
  const rawFileName = String(file.fileName || rawItem?.fileName || '').trim();

  if (
    isSpuriousAcquirerBankEntry(explicitKey, rawLabel) ||
    isSpuriousAcquirerBankEntry(rawFileName, rawLabel)
  ) {
    return null;
  }

  const identified = identifyBankInstitution({
    bankName: rawLabel,
    bankId: rawCode,
    acctId: rawAcctId,
    fileName: rawFileName
  });

  if (explicitKey) {
    return {
      bankKey: explicitKey,
      bankCode: rawCode || identified.bankCode || '',
      bankLabel: rawLabel || identified.bankLabel || explicitKey,
      acctLast4: rawAcctLast4 || identified.acctLast4 || ''
    };
  }

  const hasSourceSignals = Boolean(rawLabel || rawCode || rawFileName);
  if (!identified.bankKey || (identified.bankKey === 'banco_ofx' && !hasSourceSignals)) {
    return null;
  }

  return identified;
}

/**
 * Lê o perfil de rotina salvo nas regras do Supabase (`company_routine:profile`).
 */
export function parseRoutineProfileFromRules(rules = []) {
  if (!Array.isArray(rules)) return null;

  const candidates = rules
    .filter(
      (r) =>
        r &&
        r.is_active !== false &&
        (!r.rule_type || r.rule_type === 'engine_setting') &&
        isCompanyRoutineRule(r) &&
        typeof r.target_value === 'string' &&
        r.target_value.trim().length > 0
    )
    .sort((a, b) => {
      const ta = String(b.updated_at || b.created_at || '');
      const tb = String(a.updated_at || a.created_at || '');
      return ta.localeCompare(tb);
    });

  for (const rule of candidates) {
    try {
      const parsed = JSON.parse(rule.target_value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeRoutineProfile(parsed);
      }
    } catch {
      // ignora JSON inválido e tenta próxima regra válida se houver
    }
  }

  return null;
}

export function loadRoutineProfileFromStorage(storage, tenantId) {
  const cleanTenant = String(tenantId || '').trim();
  if (!storage || !cleanTenant) return null;
  try {
    const raw = storage.getItem(buildCompanyRoutineStorageKey(cleanTenant));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return normalizeRoutineProfile(parsed);
  } catch {
    return null;
  }
}

export function saveRoutineProfileToStorage(storage, tenantId, profile) {
  const cleanTenant = String(tenantId || '').trim();
  if (!storage || !cleanTenant || !profile) return false;
  try {
    const normalized = normalizeRoutineProfile(profile);
    storage.setItem(buildCompanyRoutineStorageKey(cleanTenant), JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function mergeRoutineProfiles(localProfile, remoteProfile) {
  if (!localProfile && !remoteProfile) return createEmptyRoutineProfile();
  if (!localProfile) return normalizeRoutineProfile(remoteProfile);
  if (!remoteProfile) return normalizeRoutineProfile(localProfile);

  const local = normalizeRoutineProfile(localProfile);
  const remote = normalizeRoutineProfile(remoteProfile);
  const localNewer = Boolean(local.updatedAt && (!remote.updatedAt || local.updatedAt > remote.updatedAt));
  const primary = localNewer ? local : remote;
  const secondary = localNewer ? remote : local;

  const banks = {};
  for (const key of new Set([...Object.keys(secondary.banks), ...Object.keys(primary.banks)])) {
    const p = primary.banks[key];
    const s = secondary.banks[key];
    if (p && s) {
      banks[key] = {
        bankKey: key,
        bankCode: p.bankCode || s.bankCode,
        bankLabel: p.bankLabel || s.bankLabel,
        acctLast4: p.acctLast4 || s.acctLast4,
        seenCount: Math.max(p.seenCount, s.seenCount),
        lastSeenDate: p.lastSeenDate >= s.lastSeenDate ? p.lastSeenDate : s.lastSeenDate,
        enabled: p.enabled
      };
    } else {
      banks[key] = { ...(p || s) };
    }
  }

  const reports = {};
  for (const key of new Set([...Object.keys(secondary.reports), ...Object.keys(primary.reports)])) {
    const p = primary.reports[key];
    const s = secondary.reports[key];
    if (p && s) {
      reports[key] = {
        fileType: key,
        seenCount: Math.max(p.seenCount, s.seenCount),
        lastSeenDate: p.lastSeenDate >= s.lastSeenDate ? p.lastSeenDate : s.lastSeenDate,
        enabled: p.enabled
      };
    } else {
      reports[key] = { ...(p || s) };
    }
  }

  return {
    version: Math.max(primary.version, secondary.version, 1),
    updatedAt: primary.updatedAt || secondary.updatedAt,
    banks,
    reports
  };
}

/**
 * Atualiza de forma pura o perfil aprendido da empresa a partir dos arquivos válidos importados.
 */
export function learnRoutineFromParsedFiles(profile, parsedFiles = [], referenceDate = '') {
  const next = normalizeRoutineProfile(profile);
  if (!Array.isArray(parsedFiles) || parsedFiles.length === 0) {
    return { profile: next, changed: false };
  }

  const explicitDate = normalizeIsoDate(referenceDate);
  const firstFileDate = parsedFiles
    .map((raw) => raw?.parsed || raw)
    .filter((f) => f && f.status === 'ok')
    .map((f) => normalizeIsoDate(f.periodStart) || normalizeIsoDate(f.periodEnd))
    .find(Boolean);
  const batchDate = explicitDate || firstFileDate || new Date().toISOString().slice(0, 10);
  const seenBanksInBatch = new Set();
  const seenReportsInBatch = new Set();
  let changed = false;

  for (const rawItem of parsedFiles) {
    const file = rawItem?.parsed || rawItem;
    if (!file || file.status !== 'ok' || !file.fileType) continue;

    const fileType = String(file.fileType).trim();
    if (!fileType) continue;

    const effectiveDate =
      explicitDate ||
      normalizeIsoDate(file.periodStart) ||
      normalizeIsoDate(file.periodEnd) ||
      batchDate;

    if (!seenReportsInBatch.has(fileType)) {
      seenReportsInBatch.add(fileType);
      const existingReport = next.reports[fileType];
      if (!existingReport) {
        next.reports[fileType] = {
          fileType,
          seenCount: 1,
          lastSeenDate: effectiveDate,
          enabled: true
        };
        changed = true;
      } else if (effectiveDate && (!existingReport.lastSeenDate || effectiveDate > existingReport.lastSeenDate)) {
        next.reports[fileType] = {
          ...existingReport,
          seenCount: existingReport.seenCount + 1,
          lastSeenDate: effectiveDate
        };
        changed = true;
      }
    }

    if (fileType === 'extrato_ofx' || fileType === 'extrato_generico') {
      const bankMeta = extractBankMetaFromParsedFile(rawItem);
      if (bankMeta && bankMeta.bankKey && !seenBanksInBatch.has(bankMeta.bankKey)) {
        seenBanksInBatch.add(bankMeta.bankKey);
        const existingBank = next.banks[bankMeta.bankKey];
        if (!existingBank) {
          next.banks[bankMeta.bankKey] = {
            bankKey: bankMeta.bankKey,
            bankCode: bankMeta.bankCode || '',
            bankLabel: bankMeta.bankLabel || bankMeta.bankKey,
            acctLast4: bankMeta.acctLast4 || '',
            seenCount: 1,
            lastSeenDate: effectiveDate,
            enabled: true
          };
          changed = true;
        } else {
          const isNewDay = Boolean(
            effectiveDate && (!existingBank.lastSeenDate || effectiveDate > existingBank.lastSeenDate)
          );
          const mergedCode = existingBank.bankCode || bankMeta.bankCode || '';
          const mergedAcct = existingBank.acctLast4 || bankMeta.acctLast4 || '';
          const mergedLabel =
            existingBank.bankLabel && existingBank.bankLabel !== existingBank.bankKey
              ? existingBank.bankLabel
              : bankMeta.bankLabel || existingBank.bankLabel;

          const metaImproved =
            mergedCode !== existingBank.bankCode ||
            mergedAcct !== existingBank.acctLast4 ||
            mergedLabel !== existingBank.bankLabel;

          if (isNewDay || metaImproved) {
            next.banks[bankMeta.bankKey] = {
              ...existingBank,
              bankCode: mergedCode,
              bankLabel: mergedLabel,
              acctLast4: mergedAcct,
              seenCount: isNewDay ? existingBank.seenCount + 1 : existingBank.seenCount,
              lastSeenDate: isNewDay ? effectiveDate : existingBank.lastSeenDate
            };
            changed = true;
          }
        }
      }
    }
  }

  if (changed) {
    next.updatedAt = new Date().toISOString();
  }

  return { profile: next, changed };
}

function buildFilesFromSession(session) {
  if (!session || typeof session !== 'object') return [];
  const snap = session.reconciled_summary || session;
  const directSnapshot = Array.isArray(snap.parsedFilesSnapshot)
    ? snap.parsedFilesSnapshot
    : Array.isArray(session.files)
      ? session.files
      : null;

  if (directSnapshot && directSnapshot.length > 0) {
    return directSnapshot.map((item) => {
      const f = item?.parsed || item;
      return f && typeof f === 'object' ? { ...f, status: f.status || 'ok' } : null;
    }).filter(Boolean);
  }

  const completeness = snap.reportCompleteness;
  if (!completeness || typeof completeness !== 'object') return [];

  const synthesized = [];
  for (const sysItem of completeness.system?.present || []) {
    if (sysItem?.fileType) {
      synthesized.push({ status: 'ok', fileType: sysItem.fileType, summary: {} });
    }
  }
  for (const bankItem of completeness.bank?.present || []) {
    if (bankItem?.bankKey) {
      synthesized.push({
        status: 'ok',
        fileType: bankItem.fileType || 'extrato_ofx',
        summary: {
          bankKey: bankItem.bankKey,
          bankCode: bankItem.bankCode || '',
          bankLabel: bankItem.bankLabel || bankItem.shortLabel || bankItem.bankKey,
          acctLast4: bankItem.acctLast4 || ''
        }
      });
    } else if (bankItem?.fileType && bankItem.fileType !== 'extrato_ofx') {
      synthesized.push({ status: 'ok', fileType: bankItem.fileType, summary: {} });
    }
  }
  return synthesized;
}

/**
 * Alimenta inicialmente a rotina da empresa a partir de sessões históricas salvas em ordem cronológica.
 */
export function bootstrapRoutineFromSessions(profile, sessions = []) {
  let current = normalizeRoutineProfile(profile);
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return { profile: current, changed: false };
  }

  const sorted = [...sessions]
    .filter(Boolean)
    .sort((a, b) => {
      const da = normalizeIsoDate(a.reference_date || a.referenceDate || a.created_at || a.createdAt);
      const db = normalizeIsoDate(b.reference_date || b.referenceDate || b.created_at || b.createdAt);
      if (da !== db) return da.localeCompare(db);
      const ca = String(a.created_at || a.createdAt || '');
      const cb = String(b.created_at || b.createdAt || '');
      return ca.localeCompare(cb);
    });

  let anyChanged = false;
  for (const session of sorted) {
    const refDate = normalizeIsoDate(
      session.reference_date || session.referenceDate || session.created_at || session.createdAt
    );
    const files = buildFilesFromSession(session);
    if (files.length === 0) continue;
    const res = learnRoutineFromParsedFiles(current, files, refDate);
    current = res.profile;
    if (res.changed) anyChanged = true;
  }

  return { profile: current, changed: anyChanged };
}

export const bootstrapRoutineFromSessionHistory = bootstrapRoutineFromSessions;

/**
 * Ativa ou dispensa um banco aprendido na rotina esperada da empresa.
 */
export function toggleRoutineBankExpected(profile, bankKey, enabled, fallbackMeta = null) {
  const next = normalizeRoutineProfile(profile);
  const key = String(bankKey || '').trim();
  if (!key) return next;

  const existing = next.banks[key];
  if (!existing && !fallbackMeta?.bankLabel) {
    return next;
  }

  next.banks[key] = existing
    ? { ...existing, enabled: Boolean(enabled) }
    : {
        bankKey: key,
        bankCode: String(fallbackMeta?.bankCode || '').trim(),
        bankLabel: String(fallbackMeta?.bankLabel || key).trim(),
        acctLast4: String(fallbackMeta?.acctLast4 || '').trim(),
        seenCount: 0,
        lastSeenDate: '',
        enabled: Boolean(enabled)
      };
  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * Ativa ou dispensa um relatório do catálogo (DataDivas ou Maquininha) na rotina da empresa.
 */
export function toggleRoutineReportExpected(profile, fileType, enabled) {
  const next = normalizeRoutineProfile(profile);
  const ft = String(fileType || '').trim();
  if (!ft) return next;

  const existing = next.reports[ft];
  next.reports[ft] = existing
    ? { ...existing, enabled: Boolean(enabled) }
    : {
        fileType: ft,
        seenCount: 0,
        lastSeenDate: '',
        enabled: Boolean(enabled)
      };
  next.updatedAt = new Date().toISOString();
  return next;
}
