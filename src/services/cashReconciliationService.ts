import { supabase, masterSupabase } from './supabase';
import {
  buildSessionPersistencePayload,
  extractCashErrorMessage,
  isMissingCashTableError,
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
  CashAiAnalysis,
  CashManualInputs,
  CashMirrorRow,
  CashDrawerSummary,
  CashFinancialMetrics,
  CashReconciliationResult,
  CashResolutionAction,
  ParsedCashFileResult,
  SavedCashFilePassword
} from '../types/cashReconciliation';

export interface ReconciledSummarySnapshot {
  mirrorRows?: CashMirrorRow[];
  cashDrawerSummary?: CashDrawerSummary;
  financialMetrics?: CashFinancialMetrics;
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
}

const localSessionsKey = (tenantId: string) => `cash_recon_sessions_${tenantId}`;
const localRulesKey = (tenantId: string) => `cash_recon_rules_${tenantId}`;

function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
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

export function getMergedSavedFilePasswords(tenantId: string, rules: CashRuleRow[] = []): SavedCashFilePassword[] {
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
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

  if (typeof window !== 'undefined') {
    upsertSavedFilePasswordInStorage(window.localStorage, tenantId, {
      pattern,
      label,
      fileName: params.fileName,
      fileType: params.fileType || '',
      password: params.password
    });
  }

  try {
    const { data: existing, error: findErr } = await runWithTenantClient<CashRuleRow>(
      (client) =>
        client
          .from('cash_reconciliation_rules')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('rule_type', 'engine_setting')
          .eq('pattern', pattern)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      { expectRow: true }
    );

    if (findErr && isMissingCashTableError(findErr)) {
      return { rule: null, schemaMissing: true };
    }

    if (existing?.id) {
      if (existing.target_value === params.password && existing.is_active !== false) {
        return { rule: existing, schemaMissing: false };
      }
      const { data: updated, error: updErr } = await runWithTenantClient<CashRuleRow>(
        (client) =>
          client
            .from('cash_reconciliation_rules')
            .update({ target_value: params.password, is_active: true, notes: label })
            .eq('id', existing.id)
            .eq('tenant_id', tenantId)
            .select('*')
            .maybeSingle(),
        { expectRow: true }
      );
      if (updErr || !updated) {
        if (isMissingCashTableError(updErr)) return { rule: null, schemaMissing: true };
        throw new Error(extractCashErrorMessage(updErr, 'Erro ao atualizar senha fixa salva.'));
      }
      return { rule: updated, schemaMissing: false };
    }

    return await saveCashFormulaRule(tenantId, {
      rule_type: 'engine_setting',
      pattern,
      target_value: params.password,
      source_origin: 'user',
      notes: label
    });
  } catch (err) {
    console.warn('[Conferência Caixa] Senha fixa salva localmente; falha ao sincronizar na nuvem:', err);
    return { rule: null, schemaMissing: false };
  }
}

export async function deleteCashSavedFilePassword(
  tenantId: string,
  patternOrKey: string,
  ruleId?: string
): Promise<void> {
  if (!tenantId || !patternOrKey) return;
  if (typeof window !== 'undefined') {
    removeSavedFilePasswordFromStorage(window.localStorage, tenantId, patternOrKey);
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
