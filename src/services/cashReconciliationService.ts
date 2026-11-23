import { supabase, masterSupabase } from './supabase';
import { sendNativeMessage } from './whatsappEngine';
import {
  buildSessionPersistencePayload,
  clearActiveCashDraftFromStorage,
  extractCashErrorMessage,
  isMissingCashTableError,
  loadActiveCashDraftFromStorage,
  shouldRetryWithMasterClient,
  SESSION_LIST_COLUMNS
} from '../utils/cashReconciliationServiceHelper.mjs';
import {
  FILE_PASSWORD_RULE_PREFIX,
  buildPasswordRulePattern,
  extractSavedPasswordsFromRules,
  formatSavedPasswordLabel,
  loadSavedFilePasswordsFromStorage,
  mergeSavedFilePasswordLists,
  removeSavedFilePasswordFromStorage,
  upsertSavedFilePasswordInStorage
} from '../utils/cashFilePasswordHelper.mjs';
import {
  COMPANY_ROUTINE_RULE_PATTERN,
  createEmptyRoutineProfile,
  loadRoutineProfileFromStorage,
  mergeRoutineProfiles,
  normalizeRoutineProfile,
  parseRoutineProfileFromRules,
  saveRoutineProfileToStorage
} from '../utils/cashCompanyRoutineHelper.mjs';
import {
  CASH_WHATSAPP_RULE_PATTERN,
  extractCashWhatsappNumberFromRules,
  normalizeBrazilWhatsappNumber
} from '../utils/cashReportExportHelper.mjs';
import { logCashReconciliationEvent, logCashUnexpectedError } from '../utils/cashDevLogger';
import {
  CashAiAnalysis,
  CashAuditInsights,
  CashManualInputs,
  CashMirrorRow,
  CashDrawerSummary,
  CashFinancialMetrics,
  CashReconciliationResult,
  CashReportCompleteness,
  CashResolutionAction,
  CompanyCashRoutineProfile,
  ParsedCashFileResult,
  SavedCashFilePassword
} from '../types/cashReconciliation';

export interface ReconciledSummarySnapshot {
  mirrorRows?: CashMirrorRow[];
  cashDrawerSummary?: CashDrawerSummary;
  financialMetrics?: CashFinancialMetrics;
  reportCompleteness?: CashReportCompleteness;
  auditInsights?: CashAuditInsights;
  manualInputs?: CashManualInputs;
  manualResolutions?: CashResolutionAction[];
  parsedFilesSnapshot?: ParsedCashFileResult[];
}

export interface CashSessionRow {
  id: string;
  tenant_id: string;
  reference_date: string;
  shift_label: string;
  store_name?: string | null;
  operator_name?: string | null;
  status: 'draft' | 'balanced' | 'attention' | 'shortage' | 'surplus';
  health_score: number;
  system_total_cents: number;
  real_total_cents: number;
  diff_cents: number;
  cash_drawer_counted_cents?: number | null;
  cash_sangria_cents: number;
  cash_notes?: string | null;
  reconciled_summary: ReconciledSummarySnapshot;
  ai_last_analysis?: CashAiAnalysis | null;
  created_by_email?: string | null;
  closed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CashRuleRow {
  id: string;
  tenant_id: string;
  rule_type: 'normalize_admin' | 'ignore_ofx_memo' | 'terminal_affinity' | 'engine_setting';
  pattern: string;
  target_value: string;
  source_origin: 'default' | 'user' | 'ai_suggested';
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

const FOODNEXT_INSTANCE_ID = 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6';

const localSessionsKey = (tenantId: string) => `cash_recon_sessions_${tenantId}`;
const localRulesKey = (tenantId: string) => `cash_recon_rules_${tenantId}`;
const localWhatsappKey = (tenantId: string) => `cash_recon_whatsapp_${String(tenantId || '').trim()}`;

function getBrowserStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return null;
}

function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const storage = getBrowserStorage();
    const raw = storage ? storage.getItem(key) : null;
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key: string, value: unknown) {
  try {
    const storage = getBrowserStorage();
    storage?.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[Conferência Caixa] Falha ao gravar cache local:', err);
  }
}

async function runWithTenantClient<T>(
  fn: (client: typeof supabase) => PromiseLike<{ data: T | null; error: { code?: string; message?: string; status?: number } | null }>,
  options: { expectRow?: boolean; fallbackOnEmptyArray?: boolean } = {}
): Promise<{ data: T | null; error: { code?: string; message?: string; status?: number } | null; usedFallback: boolean }> {
  // Evita disparo garantido de 401/403 (que polui o DevLogger) quando o app está autenticado sem JWT Supabase Auth
  const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  if (!sessionData?.session?.access_token) {
    const directMaster = await fn(masterSupabase);
    return { ...directMaster, usedFallback: true };
  }

  const first = await fn(supabase);
  if (
    !shouldRetryWithMasterClient({
      data: first.data,
      error: first.error,
      expectRow: options.expectRow,
      fallbackOnEmptyArray: options.fallbackOnEmptyArray
    })
  ) {
    return { ...first, usedFallback: false };
  }
  const second = await fn(masterSupabase);
  return { ...second, usedFallback: true };
}

export async function listCashReconciliationSessions(
  tenantId: string,
  limit = 30
): Promise<{ sessions: CashSessionRow[]; schemaMissing: boolean }> {
  if (!tenantId) return { sessions: [], schemaMissing: false };
  const { data, error } = await runWithTenantClient<CashSessionRow[]>(
    (client) =>
      client
        .from('cash_reconciliation_sessions')
        .select(SESSION_LIST_COLUMNS)
        .eq('tenant_id', tenantId)
        .order('reference_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit),
    { fallbackOnEmptyArray: true }
  );

  if (error) {
    if (isMissingCashTableError(error)) {
      return {
        sessions: readLocalJson<CashSessionRow[]>(localSessionsKey(tenantId), []),
        schemaMissing: true
      };
    }
    throw new Error(extractCashErrorMessage(error, 'Erro ao listar conferências salvas.'));
  }
  return { sessions: data || [], schemaMissing: false };
}

export async function loadCashReconciliationSession(
  tenantId: string,
  sessionId: string
): Promise<CashSessionRow | null> {
  if (!tenantId || !sessionId) return null;
  if (sessionId.startsWith('local_')) {
    const localList = readLocalJson<CashSessionRow[]>(localSessionsKey(tenantId), []);
    return localList.find(s => s.id === sessionId) || null;
  }

  const { data, error } = await runWithTenantClient<CashSessionRow>(
    (client) =>
      client
        .from('cash_reconciliation_sessions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', sessionId)
        .maybeSingle(),
    { expectRow: true }
  );
  if (error) {
    if (isMissingCashTableError(error)) {
      const localList = readLocalJson<CashSessionRow[]>(localSessionsKey(tenantId), []);
      return localList.find(s => s.id === sessionId) || null;
    }
    throw new Error(extractCashErrorMessage(error, 'Erro ao carregar sessão de conferência.'));
  }
  return data;
}

export async function saveCashReconciliationSession(params: {
  tenantId: string;
  userEmail?: string;
  sessionId?: string | null;
  parsedFiles: ParsedCashFileResult[];
  result: CashReconciliationResult;
  manualInputs: CashManualInputs;
  manualResolutions: CashResolutionAction[];
  aiAnalysis?: CashAiAnalysis | null;
  markClosed?: boolean;
}): Promise<{ sessionId: string; schemaMissing: boolean; savedAt: string }> {
  const { sessionPayload, filePayloads, itemPayloads } = buildSessionPersistencePayload(params);
  const nowIso = new Date().toISOString();
  const isRemoteUpdate = Boolean(params.sessionId && !params.sessionId.startsWith('local_'));

  const writeSession = (client: typeof supabase) => {
    if (isRemoteUpdate && params.sessionId) {
      return client
        .from('cash_reconciliation_sessions')
        .update(sessionPayload)
        .eq('id', params.sessionId)
        .eq('tenant_id', params.tenantId)
        .select('id')
        .maybeSingle();
    }
    return client
      .from('cash_reconciliation_sessions')
      .insert(sessionPayload)
      .select('id')
      .maybeSingle();
  };

  let res = await runWithTenantClient<{ id: string }>(writeSession, { expectRow: true });

  // Se o sessionId remoto não existir mais no banco (ex.: excluído), re-insere como nova sessão em vez de falhar
  if (isRemoteUpdate && !res.error && !res.data) {
    res = await runWithTenantClient<{ id: string }>(
      (client) => client.from('cash_reconciliation_sessions').insert(sessionPayload).select('id').maybeSingle(),
      { expectRow: true }
    );
  }

  if (res.error || !res.data) {
    if (isMissingCashTableError(res.error)) {
      const localList = readLocalJson<CashSessionRow[]>(localSessionsKey(params.tenantId), []);
      const localId = params.sessionId || `local_${Date.now()}`;
      const record: CashSessionRow = {
        id: localId,
        ...(sessionPayload as Omit<CashSessionRow, 'id'>),
        created_at: nowIso,
        updated_at: nowIso
      };
      const updated = [record, ...localList.filter(s => s.id !== localId)].slice(0, 15);
      writeLocalJson(localSessionsKey(params.tenantId), updated);
      return { sessionId: localId, schemaMissing: true, savedAt: nowIso };
    }
    throw new Error(extractCashErrorMessage(res.error, 'Falha ao salvar sessão de conferência.'));
  }

  const savedSessionId = res.data.id;
  const activeClient = res.usedFallback ? masterSupabase : supabase;

  if (isRemoteUpdate && savedSessionId === params.sessionId) {
    const { error: delItemsErr } = await activeClient
      .from('cash_reconciliation_items')
      .delete()
      .eq('session_id', savedSessionId)
      .eq('tenant_id', params.tenantId);
    if (delItemsErr) throw new Error(extractCashErrorMessage(delItemsErr, 'Erro ao limpar itens da sessão.'));

    const { error: delFilesErr } = await activeClient
      .from('cash_reconciliation_files')
      .delete()
      .eq('session_id', savedSessionId)
      .eq('tenant_id', params.tenantId);
    if (delFilesErr) throw new Error(extractCashErrorMessage(delFilesErr, 'Erro ao limpar arquivos da sessão.'));
  }

  if (filePayloads.length > 0) {
    const { error: insFilesErr } = await activeClient
      .from('cash_reconciliation_files')
      .insert(filePayloads.map(f => ({ ...f, session_id: savedSessionId })));
    if (insFilesErr) throw new Error(extractCashErrorMessage(insFilesErr, 'Erro ao gravar arquivos da sessão.'));
  }

  if (itemPayloads.length > 0) {
    for (let i = 0; i < itemPayloads.length; i += 200) {
      const chunk = itemPayloads.slice(i, i + 200).map(it => ({ ...it, session_id: savedSessionId }));
      const { error: insItemsErr } = await activeClient.from('cash_reconciliation_items').insert(chunk);
      if (insItemsErr) throw new Error(extractCashErrorMessage(insItemsErr, 'Erro ao gravar itens da conferência.'));
    }
  }

  return { sessionId: savedSessionId, schemaMissing: false, savedAt: nowIso };
}

export async function deleteCashReconciliationSession(
  tenantId: string,
  sessionId: string
): Promise<{ deletedLocal: boolean; deletedRemote: boolean }> {
  const cleanTenantId = String(tenantId || '').trim();
  const cleanSessionId = String(sessionId || '').trim();
  if (!cleanTenantId || !cleanSessionId) {
    throw new Error('Empresa e sessão são obrigatórias para excluir o fechamento.');
  }

  const removeLocalArtifacts = (): boolean => {
    let removed = false;
    const storage = getBrowserStorage();
    if (storage) {
      const localList = readLocalJson<CashSessionRow[]>(localSessionsKey(cleanTenantId), []);
      const filtered = localList.filter((s) => s && s.id !== cleanSessionId);
      if (filtered.length !== localList.length) {
        writeLocalJson(localSessionsKey(cleanTenantId), filtered);
        removed = true;
      }
      const activeDraft = loadActiveCashDraftFromStorage(storage, cleanTenantId);
      if (activeDraft?.activeSessionId === cleanSessionId) {
        clearActiveCashDraftFromStorage(storage, cleanTenantId);
        removed = true;
      }
    }
    return removed;
  };

  if (cleanSessionId.startsWith('local_')) {
    const deletedLocal = removeLocalArtifacts();
    logCashReconciliationEvent({
      level: 'info',
      message: 'Fechamento local excluído com sucesso.',
      tenantId: cleanTenantId,
      requiresAction: false,
      details: {
        action: 'delete_session',
        sessionId: cleanSessionId,
        deletedLocal,
        deletedRemote: false
      }
    });
    return { deletedLocal, deletedRemote: false };
  }

  const { data, error } = await runWithTenantClient<{ id: string }[]>(
    (client) =>
      client
        .from('cash_reconciliation_sessions')
        .delete()
        .eq('id', cleanSessionId)
        .eq('tenant_id', cleanTenantId)
        .select('id'),
    { fallbackOnEmptyArray: true }
  );

  if (error) {
    if (isMissingCashTableError(error)) {
      const deletedLocal = removeLocalArtifacts();
      logCashReconciliationEvent({
        level: 'warn',
        message: 'Tabela de conferência ausente no banco; fechamento removido apenas do cache local.',
        tenantId: cleanTenantId,
        requiresAction: false,
        details: {
          action: 'delete_session',
          sessionId: cleanSessionId,
          deletedLocal,
          deletedRemote: false,
          schemaMissing: true
        }
      });
      return { deletedLocal, deletedRemote: false };
    }

    logCashUnexpectedError({
      action: 'excluir fechamento de caixa',
      err: error,
      tenantId: cleanTenantId,
      context: { sessionId: cleanSessionId }
    });
    throw new Error(extractCashErrorMessage(error, 'Erro ao excluir fechamento de caixa.'));
  }

  const deletedRemote = Array.isArray(data) && data.length > 0;
  const deletedLocal = removeLocalArtifacts();

  logCashReconciliationEvent({
    level: 'info',
    message: deletedRemote
      ? 'Fechamento de caixa excluído do histórico.'
      : 'Nenhum registro remoto encontrado para exclusão; cache local verificado.',
    tenantId: cleanTenantId,
    requiresAction: false,
    details: {
      action: 'delete_session',
      sessionId: cleanSessionId,
      deletedLocal,
      deletedRemote
    }
  });

  return { deletedLocal, deletedRemote };
}

export async function listCashFormulaRules(
  tenantId: string,
  skipRemote = false
): Promise<{ rules: CashRuleRow[]; schemaMissing: boolean }> {
  if (!tenantId) return { rules: [], schemaMissing: false };
  if (skipRemote) {
    return {
      rules: readLocalJson<CashRuleRow[]>(localRulesKey(tenantId), []),
      schemaMissing: true
    };
  }
  const { data, error } = await runWithTenantClient<CashRuleRow[]>(
    (client) =>
      client
        .from('cash_reconciliation_rules')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }),
    { fallbackOnEmptyArray: true }
  );

  if (error) {
    if (isMissingCashTableError(error)) {
      return {
        rules: readLocalJson<CashRuleRow[]>(localRulesKey(tenantId), []),
        schemaMissing: true
      };
    }
    throw new Error(extractCashErrorMessage(error, 'Erro ao listar regras da Fórmula 1.'));
  }
  return { rules: data || [], schemaMissing: false };
}

export async function saveCashFormulaRule(
  tenantId: string,
  rule: {
    rule_type: CashRuleRow['rule_type'];
    pattern: string;
    target_value: string;
    source_origin?: CashRuleRow['source_origin'];
    notes?: string;
  }
): Promise<{ rule: CashRuleRow; schemaMissing: boolean }> {
  const payload = {
    tenant_id: tenantId,
    rule_type: rule.rule_type,
    pattern: rule.pattern.trim(),
    target_value: rule.target_value.trim(),
    source_origin: rule.source_origin || 'user',
    is_active: true,
    notes: rule.notes || ''
  };

  const { data, error } = await runWithTenantClient<CashRuleRow>(
    (client) => client.from('cash_reconciliation_rules').insert(payload).select('*').maybeSingle(),
    { expectRow: true }
  );

  if (error || !data) {
    if (isMissingCashTableError(error)) {
      const localList = readLocalJson<CashRuleRow[]>(localRulesKey(tenantId), []);
      const localRule: CashRuleRow = {
        id: `local_rule_${Date.now()}`,
        ...payload,
        created_at: new Date().toISOString()
      };
      writeLocalJson(localRulesKey(tenantId), [localRule, ...localList]);
      return { rule: localRule, schemaMissing: true };
    }
    throw new Error(extractCashErrorMessage(error, 'Erro ao salvar regra da Fórmula 1.'));
  }
  return { rule: data, schemaMissing: false };
}

export async function toggleCashFormulaRule(tenantId: string, ruleId: string, isActive: boolean): Promise<void> {
  if (ruleId.startsWith('local_rule_')) {
    const localList = readLocalJson<CashRuleRow[]>(localRulesKey(tenantId), []);
    writeLocalJson(
      localRulesKey(tenantId),
      localList.map(r => (r.id === ruleId ? { ...r, is_active: isActive } : r))
    );
    return;
  }

  const { error } = await runWithTenantClient(
    (client) =>
      client
        .from('cash_reconciliation_rules')
        .update({ is_active: isActive })
        .eq('id', ruleId)
        .eq('tenant_id', tenantId)
        .select('id')
        .maybeSingle(),
    { expectRow: true }
  );
  if (error && !isMissingCashTableError(error)) {
    throw new Error(extractCashErrorMessage(error, 'Erro ao atualizar regra.'));
  }
}

export async function deleteCashFormulaRule(tenantId: string, ruleId: string): Promise<void> {
  if (ruleId.startsWith('local_rule_')) {
    const localList = readLocalJson<CashRuleRow[]>(localRulesKey(tenantId), []);
    writeLocalJson(
      localRulesKey(tenantId),
      localList.filter(r => r.id !== ruleId)
    );
    return;
  }

  const { error } = await runWithTenantClient(
    (client) =>
      client
        .from('cash_reconciliation_rules')
        .delete()
        .eq('id', ruleId)
        .eq('tenant_id', tenantId)
        .select('id')
        .maybeSingle(),
    { expectRow: true }
  );
  if (error && !isMissingCashTableError(error)) {
    throw new Error(extractCashErrorMessage(error, 'Erro ao excluir regra.'));
  }
}

async function upsertEngineSettingRule(
  tenantId: string,
  params: {
    pattern: string;
    targetValue: string;
    notes?: string;
    label?: string;
  }
): Promise<{ rule: CashRuleRow | null; schemaMissing: boolean }> {
  const cleanTenantId = String(tenantId || '').trim();
  const cleanPattern = String(params.pattern || '').trim();
  if (!cleanTenantId || !cleanPattern || params.targetValue === '') {
    return { rule: null, schemaMissing: false };
  }

  const noteText = params.notes ?? '';
  const actionLabel = params.label || 'configuração';

  try {
    const { data: existing, error: findErr } = await runWithTenantClient<CashRuleRow>(
      (client) =>
        client
          .from('cash_reconciliation_rules')
          .select('*')
          .eq('tenant_id', cleanTenantId)
          .eq('rule_type', 'engine_setting')
          .eq('pattern', cleanPattern)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      { expectRow: true }
    );

    if (findErr) {
      if (isMissingCashTableError(findErr)) {
        return { rule: null, schemaMissing: true };
      }
      throw new Error(extractCashErrorMessage(findErr, `Erro ao consultar ${actionLabel}.`));
    }

    if (existing?.id) {
      if (existing.target_value === params.targetValue && existing.is_active !== false) {
        return { rule: existing, schemaMissing: false };
      }
      const { data: updated, error: updErr } = await runWithTenantClient<CashRuleRow>(
        (client) =>
          client
            .from('cash_reconciliation_rules')
            .update({
              target_value: params.targetValue,
              is_active: true,
              notes: noteText
            })
            .eq('id', existing.id)
            .eq('tenant_id', cleanTenantId)
            .select('*')
            .maybeSingle(),
        { expectRow: true }
      );
      if (updErr || !updated) {
        if (isMissingCashTableError(updErr)) return { rule: null, schemaMissing: true };
        throw new Error(extractCashErrorMessage(updErr, `Erro ao atualizar ${actionLabel}.`));
      }
      return { rule: updated, schemaMissing: false };
    }

    const { data: inserted, error: insErr } = await runWithTenantClient<CashRuleRow>(
      (client) =>
        client
          .from('cash_reconciliation_rules')
          .insert({
            tenant_id: cleanTenantId,
            rule_type: 'engine_setting',
            pattern: cleanPattern,
            target_value: params.targetValue,
            source_origin: 'user',
            is_active: true,
            notes: noteText
          })
          .select('*')
          .maybeSingle(),
      { expectRow: true }
    );

    if (insErr || !inserted) {
      if (isMissingCashTableError(insErr)) return { rule: null, schemaMissing: true };
      throw new Error(extractCashErrorMessage(insErr, `Erro ao gravar ${actionLabel}.`));
    }

    return { rule: inserted, schemaMissing: false };
  } catch (err) {
    console.warn(`[Conferência Caixa] ${actionLabel} salva localmente; falha ao sincronizar na nuvem:`, err);
    return { rule: null, schemaMissing: false };
  }
}

export function getMergedSavedFilePasswords(tenantId: string, rules: CashRuleRow[] = []): SavedCashFilePassword[] {
  const storage = getBrowserStorage();
  const local = loadSavedFilePasswordsFromStorage(storage, tenantId);
  const remote = extractSavedPasswordsFromRules(rules);
  return mergeSavedFilePasswordLists(local, remote) as SavedCashFilePassword[];
}

export async function upsertCashSavedFilePassword(
  tenantId: string,
  params: { fileName: string; fileType?: string; password: string }
): Promise<{ rule: CashRuleRow | null; schemaMissing: boolean }> {
  if (!tenantId || !params.password) {
    return { rule: null, schemaMissing: false };
  }

  const pattern = buildPasswordRulePattern(params.fileName, params.fileType || '');
  const label = formatSavedPasswordLabel(pattern, params.fileName);
  const storage = getBrowserStorage();

  if (storage) {
    upsertSavedFilePasswordInStorage(storage, tenantId, {
      pattern,
      label,
      fileName: params.fileName,
      fileType: params.fileType || '',
      password: params.password
    });
  }

  return upsertEngineSettingRule(tenantId, {
    pattern,
    targetValue: params.password,
    notes: label,
    label: 'Senha fixa'
  });
}

export async function deleteCashSavedFilePassword(
  tenantId: string,
  patternOrKey: string,
  ruleId?: string
): Promise<void> {
  if (!tenantId || !patternOrKey) return;
  const storage = getBrowserStorage();
  if (storage) {
    removeSavedFilePasswordFromStorage(storage, tenantId, patternOrKey);
  }
  if (ruleId) {
    await deleteCashFormulaRule(tenantId, ruleId);
    return;
  }
  const fullPattern = patternOrKey.startsWith(FILE_PASSWORD_RULE_PREFIX)
    ? patternOrKey
    : `${FILE_PASSWORD_RULE_PREFIX}${patternOrKey}`;
  const { error } = await runWithTenantClient(
    (client) =>
      client
        .from('cash_reconciliation_rules')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('rule_type', 'engine_setting')
        .eq('pattern', fullPattern)
        .select('id'),
    { fallbackOnEmptyArray: true }
  );
  if (error && !isMissingCashTableError(error)) {
    throw new Error(extractCashErrorMessage(error, 'Erro ao remover senha fixa salva.'));
  }
}

export function getSavedCashWhatsappNumber(
  tenantId: string,
  rules: CashRuleRow[] = []
): string {
  const cleanTenantId = String(tenantId || '').trim();
  if (!cleanTenantId) return '';

  const tenantRules = Array.isArray(rules)
    ? rules
        .filter(
          (r) =>
            r &&
            (!r.tenant_id || r.tenant_id === cleanTenantId) &&
            r.rule_type === 'engine_setting' &&
            r.is_active !== false &&
            r.pattern === CASH_WHATSAPP_RULE_PATTERN &&
            String(r.target_value || '').trim().length > 0
        )
        .sort((a, b) =>
          String(b.updated_at || b.created_at || '').localeCompare(
            String(a.updated_at || a.created_at || '')
          )
        )
    : [];

  const remoteRaw = extractCashWhatsappNumberFromRules(tenantRules);
  const remoteNorm = remoteRaw ? normalizeBrazilWhatsappNumber(remoteRaw) : null;
  const remotePhone = remoteNorm?.ok ? remoteNorm.digits : '';
  const remoteUpdatedAt = String(tenantRules[0]?.updated_at || tenantRules[0]?.created_at || '');

  let localPhone = '';
  let localUpdatedAt = '';
  const storage = getBrowserStorage();
  if (storage) {
    try {
      const raw = storage.getItem(localWhatsappKey(cleanTenantId));
      if (raw) {
        const trimmed = raw.trim();
        let candidate = trimmed;
        if (trimmed.startsWith('{')) {
          const parsed = JSON.parse(trimmed) as { phone?: unknown; updatedAt?: unknown };
          candidate = String(parsed?.phone || '').trim();
          localUpdatedAt = String(parsed?.updatedAt || '');
        } else {
          candidate = trimmed.replace(/^"|"$/g, '').trim();
        }
        const localNorm = candidate ? normalizeBrazilWhatsappNumber(candidate) : null;
        if (localNorm?.ok) localPhone = localNorm.digits;
      }
    } catch {
      // ignora erro de leitura no storage local
    }
  }

  if (localPhone && remotePhone) {
    if (localUpdatedAt && (!remoteUpdatedAt || localUpdatedAt > remoteUpdatedAt)) {
      return localPhone;
    }
    return remotePhone;
  }
  return remotePhone || localPhone || '';
}

export async function upsertCashWhatsappNumber(
  tenantId: string,
  rawPhone: string
): Promise<{ phone: string; rule: CashRuleRow | null }> {
  const cleanTenantId = String(tenantId || '').trim();
  if (!cleanTenantId) {
    throw new Error('Empresa não identificada para salvar o número de WhatsApp.');
  }

  const normalized = normalizeBrazilWhatsappNumber(rawPhone);
  if (!normalized.ok) {
    throw new Error(normalized.error || 'Número de WhatsApp inválido.');
  }

  const storage = getBrowserStorage();
  if (storage) {
    writeLocalJson(localWhatsappKey(cleanTenantId), {
      phone: normalized.digits,
      updatedAt: new Date().toISOString()
    });
  }

  const { rule } = await upsertEngineSettingRule(cleanTenantId, {
    pattern: CASH_WHATSAPP_RULE_PATTERN,
    targetValue: normalized.digits,
    notes: `WhatsApp Fechamento (${normalized.display})`,
    label: 'Número WhatsApp'
  });

  return {
    phone: normalized.digits,
    rule
  };
}

export function getCompanyCashRoutine(
  tenantId: string,
  rules: CashRuleRow[] = []
): CompanyCashRoutineProfile {
  const cleanTenantId = String(tenantId || '').trim();
  if (!cleanTenantId) {
    return createEmptyRoutineProfile() as CompanyCashRoutineProfile;
  }

  const tenantRules = Array.isArray(rules)
    ? rules.filter((r) => !r?.tenant_id || r.tenant_id === cleanTenantId)
    : [];

  const storage = getBrowserStorage();
  const localProfile = loadRoutineProfileFromStorage(storage, cleanTenantId);
  const remoteProfile = parseRoutineProfileFromRules(tenantRules);
  return mergeRoutineProfiles(localProfile, remoteProfile) as CompanyCashRoutineProfile;
}

export async function saveCompanyCashRoutine(
  tenantId: string,
  profile: CompanyCashRoutineProfile
): Promise<{ rule: CashRuleRow | null }> {
  const cleanTenantId = String(tenantId || '').trim();
  if (!cleanTenantId || !profile) {
    return { rule: null };
  }

  const normalized = normalizeRoutineProfile(profile) as CompanyCashRoutineProfile;
  const toSave: CompanyCashRoutineProfile = {
    ...normalized,
    updatedAt: normalized.updatedAt || new Date().toISOString()
  };

  const storage = getBrowserStorage();
  if (storage) {
    saveRoutineProfileToStorage(storage, cleanTenantId, toSave);
  }

  const { rule } = await upsertEngineSettingRule(cleanTenantId, {
    pattern: COMPANY_ROUTINE_RULE_PATTERN,
    targetValue: JSON.stringify(toSave),
    notes: 'Rotina Financeira Aprendida (Bancos e Relatórios)',
    label: 'Rotina financeira'
  });

  return { rule };
}

interface FoodNextInstanceRow {
  id: string;
  tenant_id: string;
  display_name?: string | null;
  status?: string | null;
  api_key?: string | null;
}

function extractWhatsappMessageId(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const rec = response as Record<string, unknown>;
  const result = rec.result && typeof rec.result === 'object' ? (rec.result as Record<string, unknown>) : null;
  const directKey = rec.key && typeof rec.key === 'object' ? (rec.key as Record<string, unknown>) : null;
  const resultKey =
    result?.key && typeof result.key === 'object' ? (result.key as Record<string, unknown>) : null;

  const candidate = resultKey?.id ?? directKey?.id ?? rec.messageId ?? result?.messageId;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined;
}

export async function sendCashSummaryViaFoodNext(params: {
  tenantId: string;
  recipientPhone: string;
  summaryText: string;
  storeName?: string;
}): Promise<{ messageId?: string; sentTo: string }> {
  const cleanTenantId = String(params.tenantId || '').trim();

  const phoneNorm = normalizeBrazilWhatsappNumber(params.recipientPhone);
  if (!phoneNorm.ok) {
    throw new Error(phoneNorm.error || 'Número de WhatsApp inválido.');
  }

  const cleanSummary = String(params.summaryText || '').trim();
  if (!cleanSummary) {
    throw new Error('O resumo do fechamento está vazio e não pode ser enviado.');
  }

  const { data: byId, error: byIdErr } = await masterSupabase
    .from('whatsapp_instances')
    .select('id, tenant_id, display_name, status, api_key')
    .eq('id', FOODNEXT_INSTANCE_ID)
    .maybeSingle();

  let foodNext: FoodNextInstanceRow | null = byId as FoodNextInstanceRow | null;
  let lookupErr = byIdErr;

  if (!foodNext && !lookupErr) {
    const { data: byNameRows, error: byNameErr } = await masterSupabase
      .from('whatsapp_instances')
      .select('id, tenant_id, display_name, status, api_key')
      .ilike('display_name', '%FoodNext%')
      .limit(1);
    if (byNameErr) {
      lookupErr = byNameErr;
    } else if (Array.isArray(byNameRows) && byNameRows.length > 0) {
      foodNext = byNameRows[0] as FoodNextInstanceRow;
    }
  }

  if (lookupErr) {
    logCashReconciliationEvent({
      level: 'error',
      message: `Falha ao consultar instância FoodNext no Supabase: ${extractCashErrorMessage(lookupErr)}`,
      tenantId: cleanTenantId || null,
      requiresAction: true,
      details: {
        action: 'whatsapp_foodnext_lookup',
        instanceId: FOODNEXT_INSTANCE_ID,
        storeName: params.storeName || null
      }
    });
    throw new Error(`Erro ao localizar caixa WhatsApp FoodNext: ${extractCashErrorMessage(lookupErr)}`);
  }

  if (!foodNext) {
    logCashReconciliationEvent({
      level: 'error',
      message: 'Instância oficial FoodNext não encontrada na tabela whatsapp_instances.',
      tenantId: cleanTenantId || null,
      requiresAction: true,
      details: {
        action: 'whatsapp_foodnext_lookup',
        instanceId: FOODNEXT_INSTANCE_ID,
        storeName: params.storeName || null
      }
    });
    throw new Error('Instância oficial WhatsApp FoodNext não encontrada no cadastro.');
  }

  const isConnected = foodNext.status === 'connected' || foodNext.status === 'connected_local';
  if (!isConnected) {
    logCashReconciliationEvent({
      level: 'warn',
      message: `Caixa FoodNext (${foodNext.display_name || foodNext.id}) desconectada (status: ${foodNext.status || 'desconhecido'}).`,
      tenantId: cleanTenantId || null,
      requiresAction: true,
      details: {
        action: 'whatsapp_foodnext_send',
        instanceId: foodNext.id,
        instanceStatus: foodNext.status || 'unknown',
        sentTo: phoneNorm.digits,
        storeName: params.storeName || null
      }
    });
    throw new Error(
      `A caixa WhatsApp FoodNext está desconectada (status atual: ${foodNext.status || 'desconhecido'}). Reconecte a instância antes de enviar.`
    );
  }

  const apiKey = String(foodNext.api_key || '').trim();
  if (!apiKey) {
    logCashReconciliationEvent({
      level: 'error',
      message: 'Instância FoodNext sem chave de API configurada para envio.',
      tenantId: cleanTenantId || null,
      requiresAction: true,
      details: {
        action: 'whatsapp_foodnext_send',
        instanceId: foodNext.id,
        storeName: params.storeName || null
      }
    });
    throw new Error('A instância WhatsApp FoodNext não possui chave de API configurada.');
  }

  try {
    const response = await sendNativeMessage(
      foodNext.tenant_id,
      foodNext.id,
      phoneNorm.jid,
      cleanSummary,
      apiKey
    );
    const messageId = extractWhatsappMessageId(response);

    logCashReconciliationEvent({
      level: 'success',
      message: `Resumo de fechamento enviado via FoodNext para ${phoneNorm.display}`,
      tenantId: cleanTenantId || null,
      requiresAction: false,
      details: {
        action: 'whatsapp_foodnext_send',
        instanceId: foodNext.id,
        sentTo: phoneNorm.digits,
        displayPhone: phoneNorm.display,
        messageId: messageId || null,
        storeName: params.storeName || null
      }
    });

    return {
      ...(messageId ? { messageId } : {}),
      sentTo: phoneNorm.display
    };
  } catch (err: unknown) {
    logCashUnexpectedError({
      action: 'enviar resumo via WhatsApp FoodNext',
      err,
      tenantId: cleanTenantId || null,
      context: {
        instanceId: foodNext.id,
        sentTo: phoneNorm.digits,
        storeName: params.storeName || null
      }
    });
    throw new Error(extractCashErrorMessage(err, 'Falha ao enviar resumo pelo WhatsApp FoodNext.'));
  }
}
