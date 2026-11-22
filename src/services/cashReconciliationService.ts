import { supabase, masterSupabase } from './supabase';
import {
  buildSessionPersistencePayload,
  isMissingCashTableError
} from '../utils/cashReconciliationServiceHelper.mjs';

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
  reconciled_summary: any;
  ai_last_analysis?: any;
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
  } catch (_) {}
}

function isRlsOrJwtError(error: any): boolean {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return code === '42501' || code === 'PGRST301' || msg.includes('row-level security') || msg.includes('jwt');
}

async function runWithTenantClient<T>(
  fn: (client: typeof supabase) => Promise<{ data: T; error: any }>
): Promise<{ data: T; error: any; usedFallback: boolean }> {
  const first = await fn(supabase);
  if (!first.error || !isRlsOrJwtError(first.error)) {
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
  const { data, error } = await runWithTenantClient<CashSessionRow[]>((client) =>
    client
      .from('cash_reconciliation_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('reference_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
  );

  if (error) {
    if (isMissingCashTableError(error)) {
      return {
        sessions: readLocalJson<CashSessionRow[]>(localSessionsKey(tenantId), []),
        schemaMissing: true
      };
    }
    throw error;
  }
  return { sessions: data || [], schemaMissing: false };
}

export async function saveCashReconciliationSession(params: {
  tenantId: string;
  userEmail?: string;
  sessionId?: string | null;
  parsedFiles: any[];
  result: any;
  manualInputs: any;
  manualResolutions: any[];
  aiAnalysis?: any;
  markClosed?: boolean;
}): Promise<{ sessionId: string; schemaMissing: boolean; savedAt: string }> {
  const { sessionPayload, filePayloads, itemPayloads } = buildSessionPersistencePayload(params);
  const nowIso = new Date().toISOString();

  const writeSession = async (client: typeof supabase) => {
    if (params.sessionId) {
      return client
        .from('cash_reconciliation_sessions')
        .update(sessionPayload)
        .eq('id', params.sessionId)
        .eq('tenant_id', params.tenantId)
        .select('id')
        .single();
    }
    return client
      .from('cash_reconciliation_sessions')
      .insert(sessionPayload)
      .select('id')
      .single();
  };

  const res = await runWithTenantClient<{ id: string }>(writeSession);
  if (res.error) {
    if (isMissingCashTableError(res.error)) {
      const localList = readLocalJson<CashSessionRow[]>(localSessionsKey(params.tenantId), []);
      const localId = params.sessionId || `local_${Date.now()}`;
      const record: CashSessionRow = {
        id: localId,
        ...sessionPayload,
        created_at: nowIso,
        updated_at: nowIso
      };
      const updated = [record, ...localList.filter(s => s.id !== localId)].slice(0, 30);
      writeLocalJson(localSessionsKey(params.tenantId), updated);
      return { sessionId: localId, schemaMissing: true, savedAt: nowIso };
    }
    throw res.error;
  }

  const savedSessionId = res.data.id;
  const activeClient = res.usedFallback ? masterSupabase : supabase;

  if (params.sessionId) {
    await activeClient.from('cash_reconciliation_items').delete().eq('session_id', savedSessionId).eq('tenant_id', params.tenantId);
    await activeClient.from('cash_reconciliation_files').delete().eq('session_id', savedSessionId).eq('tenant_id', params.tenantId);
  }

  if (filePayloads.length > 0) {
    await activeClient
      .from('cash_reconciliation_files')
      .insert(filePayloads.map(f => ({ ...f, session_id: savedSessionId })));
  }

  if (itemPayloads.length > 0) {
    for (let i = 0; i < itemPayloads.length; i += 200) {
      const chunk = itemPayloads.slice(i, i + 200).map(it => ({ ...it, session_id: savedSessionId }));
      await activeClient.from('cash_reconciliation_items').insert(chunk);
    }
  }

  return { sessionId: savedSessionId, schemaMissing: false, savedAt: nowIso };
}

export async function listCashFormulaRules(
  tenantId: string
): Promise<{ rules: CashRuleRow[]; schemaMissing: boolean }> {
  if (!tenantId) return { rules: [], schemaMissing: false };
  const { data, error } = await runWithTenantClient<CashRuleRow[]>((client) =>
    client
      .from('cash_reconciliation_rules')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
  );

  if (error) {
    if (isMissingCashTableError(error)) {
      return {
        rules: readLocalJson<CashRuleRow[]>(localRulesKey(tenantId), []),
        schemaMissing: true
      };
    }
    throw error;
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

  const { data, error } = await runWithTenantClient<CashRuleRow>((client) =>
    client.from('cash_reconciliation_rules').insert(payload).select('*').single()
  );

  if (error) {
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
    throw error;
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

  const { error } = await runWithTenantClient((client) =>
    client.from('cash_reconciliation_rules').update({ is_active: isActive }).eq('id', ruleId).eq('tenant_id', tenantId)
  );
  if (error && !isMissingCashTableError(error)) throw error;
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

  const { error } = await runWithTenantClient((client) =>
    client.from('cash_reconciliation_rules').delete().eq('id', ruleId).eq('tenant_id', tenantId)
  );
  if (error && !isMissingCashTableError(error)) throw error;
}
