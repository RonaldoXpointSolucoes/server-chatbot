import { supabase, getSupabaseHealthStatus } from '../services/supabase';
import { useChatStore } from '../store/chatStore';
import { reportError } from './errorLogger';

export type AuditSeverity = 'critical' | 'warn' | 'ok';
export type AuditCategory = 'database' | 'whatsapp' | 'outbox' | 'ai_vault' | 'store_realtime' | 'logs';
export type CaptureProbeKind = 'report_error' | 'http_404' | 'promise_rejection' | 'node_logs_sync';

export interface PreventiveFinding {
  id: string;
  category: AuditCategory;
  title: string;
  severity: AuditSeverity;
  summary: string;
  detail?: string;
  recommendation: string;
  latencyMs?: number;
  count?: number;
  rawPayload?: any;
}

export interface PulledSystemLog {
  id: string;
  created_at: string;
  level: string;
  type: string;
  message: string;
  source: string;
  company_id?: string | null;
  payload?: any;
}

export interface PreventiveAuditReport {
  ranAt: string;
  durationMs: number;
  score: number;
  status: 'healthy' | 'degraded' | 'critical';
  findings: PreventiveFinding[];
  pulledLogs: PulledSystemLog[];
  counts: { critical: number; warn: number; ok: number };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidUuid = (val?: string | null): val is string => Boolean(val && UUID_REGEX.test(val.trim()));

/**
 * Executa um GET HTTP com timeout protegido para endpoints de diagnóstico do backend Node.
 */
async function probeEndpointJson(url: string, timeoutMs = 4500): Promise<{ ok: boolean; status: number; latencyMs: number; data: any; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = performance.now();

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'x-asts-test': 'true' }
    });
    const latencyMs = Math.round(performance.now() - t0);
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, latencyMs, data };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - t0);
    const msg = err?.name === 'AbortError' ? `Timeout (> ${timeoutMs}ms)` : (err?.message || 'Erro de rede');
    return { ok: false, status: 0, latencyMs, data: null, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Busca erros e alertas reais recentes no Supabase (`system_logs`) e no buffer RAM do servidor Node.
 */
export async function fetchRecentRealLogs(tenantId: string | null, engineUrl: string): Promise<PulledSystemLog[]> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const collected: PulledSystemLog[] = [];
  const seenKeys = new Set<string>();

  const pushUnique = (item: PulledSystemLog) => {
    const cleanKey = `${item.source}:${item.message.slice(0, 120)}`;
    if (seenKeys.has(cleanKey)) return;
    seenKeys.add(cleanKey);
    collected.push(item);
  };

  let dbQuery = supabase
    .from('system_logs')
    .select('id, created_at, level, type, message, company_id, payload')
    .in('level', ['error', 'warn', 'fatal'])
    .gte('created_at', twoHoursAgo)
    .order('created_at', { ascending: false })
    .limit(25);

  if (isValidUuid(tenantId)) {
    dbQuery = dbQuery.or(`company_id.eq.${tenantId},company_id.is.null`);
  }

  const [dbRes, nodeRes] = await Promise.all([
    dbQuery.then((r) => r, (err) => ({ data: null, error: err })),
    probeEndpointJson(`${engineUrl}/api/v1/system/logs/recent-errors?since=0`, 4000)
  ]);

  if (dbRes?.data && Array.isArray(dbRes.data)) {
    dbRes.data.forEach((row: any) => {
      pushUnique({
        id: String(row.id || `db_${Math.random()}`),
        created_at: row.created_at || new Date().toISOString(),
        level: row.level || 'error',
        type: row.type || 'Supabase system_logs',
        message: row.message || 'Erro sem mensagem registrada',
        source: row.payload?.source === 'frontend' ? 'Frontend (system_logs)' : (row.type || 'Banco (system_logs)'),
        company_id: row.company_id || null,
        payload: row.payload
      });
    });
  }

  const nodeErrors = nodeRes.ok && Array.isArray(nodeRes.data?.errors) ? nodeRes.data.errors : [];
  nodeErrors.forEach((err: any, idx: number) => {
    pushUnique({
      id: `node_${err.timestamp || idx}_${idx}`,
      created_at: err.timestamp || new Date().toISOString(),
      level: err.level === 'warn' ? 'warn' : 'error',
      type: 'Servidor Node.js',
      message: err.message || String(err),
      source: 'Servidor Node.js (Buffer Live)',
      payload: err
    });
  });

  return collected.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Audita latência REST do Supabase, Circuit Breaker local e status do WebSocket Realtime.
 */
async function auditDatabaseAndCircuitBreaker(): Promise<PreventiveFinding[]> {
  const findings: PreventiveFinding[] = [];
  const health = getSupabaseHealthStatus();
  const storeState = useChatStore.getState() as any;
  const realtimeStatus: string = storeState?.realtimeStatus || 'unknown';

  const t0 = performance.now();
  const { error: dbErr } = await supabase.from('companies').select('id').limit(1);
  const latencyMs = Math.round(performance.now() - t0);

  if (dbErr || health.isCircuitOpen) {
    findings.push({
      id: 'db_connectivity',
      category: 'database',
      title: 'Supabase Cloud & Disjuntor (Circuit Breaker)',
      severity: 'critical',
      latencyMs,
      summary: health.isCircuitOpen
        ? `Disjuntor em estado ${health.circuitState} (${health.consecutiveFailures} falhas consecutivas)`
        : `Falha na consulta REST ao Supabase: ${dbErr?.message || 'Erro desconhecido'}`,
      detail: 'Requisições ao banco estão sendo bloqueadas ou falhando em produção.',
      recommendation: 'Verifique status do projeto Supabase, chaves no .env ou acione o reset manual do disjuntor (`supabase-manual-retry`).'
    });
  } else if (latencyMs > 1500 || health.consecutiveFailures > 0 || health.hasReportedServiceError) {
    findings.push({
      id: 'db_connectivity',
      category: 'database',
      title: 'Supabase Cloud & Latência REST',
      severity: 'warn',
      latencyMs,
      summary: `Banco acessível em ${latencyMs}ms, mas com sinais de instabilidade prévia (${health.consecutiveFailures} falhas / state=${health.circuitState}).`,
      detail: 'Latências acima de 1.500ms precedem erros 503 e travamentos de carregamento no chat.',
      recommendation: 'Monitorar consumo de CPU/Conexões no Supabase e índices das tabelas messages/contacts.'
    });
  } else {
    findings.push({
      id: 'db_connectivity',
      category: 'database',
      title: 'Supabase Cloud & Disjuntor',
      severity: 'ok',
      latencyMs,
      summary: `REST estável (${latencyMs}ms) • CircuitBreaker ${health.circuitState} (0 falhas)`,
      recommendation: 'Banco respondendo dentro dos parâmetros normais.'
    });
  }

  if (realtimeStatus === 'disconnected' || realtimeStatus === 'error') {
    findings.push({
      id: 'realtime_wss',
      category: 'store_realtime',
      title: 'WebSocket Realtime (Mensagens ao Vivo)',
      severity: 'critical',
      summary: `Canal Realtime em estado "${realtimeStatus}". Novas mensagens não atualizam a tela sem F5.`,
      recommendation: 'Cheque firewall/proxy bloqueando wss:// ou token JWT expirado no Supabase Realtime.'
    });
  } else {
    findings.push({
      id: 'realtime_wss',
      category: 'store_realtime',
      title: 'WebSocket Realtime (Mensagens ao Vivo)',
      severity: realtimeStatus === 'connecting' ? 'warn' : 'ok',
      summary: `Canal Realtime em estado "${realtimeStatus}".`,
      recommendation: realtimeStatus === 'connecting'
        ? 'Canal ainda sincronizando handshake WebSocket.'
        : 'Escuta em tempo real operante.'
    });
  }

  return findings;
}

/**
 * Audita saúde das caixas WhatsApp, desincronia da caixa padrão da empresa e bloqueios RBAC de operadores.
 */
async function auditWhatsAppInboxesAndRbac(tenantId: string | null): Promise<PreventiveFinding[]> {
  if (!isValidUuid(tenantId)) {
    return [{
      id: 'whatsapp_no_tenant',
      category: 'whatsapp',
      title: 'Caixas WhatsApp & RBAC do Tenant',
      severity: 'warn',
      summary: 'Nenhum tenant ativo selecionado no contexto local.',
      recommendation: 'Selecione uma empresa para validar caixas conectadas e permissões dos atendentes.'
    }];
  }

  const [instRes, compRes, usersRes] = await Promise.all([
    supabase.from('whatsapp_instances').select('id, display_name, status, phone_number').eq('tenant_id', tenantId),
    supabase.from('companies').select('id, name, evolution_api_instance').eq('id', tenantId).maybeSingle(),
    supabase.from('tenant_users').select('id, full_name, role, allowed_instances').eq('tenant_id', tenantId)
  ]);

  const findings: PreventiveFinding[] = [];
  if (instRes.error) {
    findings.push({
      id: 'whatsapp_query_err',
      category: 'whatsapp',
      title: 'Caixas WhatsApp (whatsapp_instances)',
      severity: 'critical',
      summary: `Erro ao consultar caixas do tenant: ${instRes.error.message}`,
      recommendation: 'Verifique políticas RLS da tabela whatsapp_instances.'
    });
    return findings;
  }

  const instances = instRes.data || [];
  const connected = instances.filter((i: any) => i.status === 'connected' || i.status === 'open');
  const disconnected = instances.filter((i: any) => i.status !== 'connected' && i.status !== 'open');

  if (instances.length === 0) {
    findings.push({
      id: 'whatsapp_empty',
      category: 'whatsapp',
      title: 'Caixas de Entrada WhatsApp',
      severity: 'critical',
      summary: 'Nenhuma caixa cadastrada para este tenant.',
      recommendation: 'Crie e conecte ao menos 1 caixa em Configurações -> Caixas de Entrada.'
    });
  } else if (connected.length === 0) {
    findings.push({
      id: 'whatsapp_all_offline',
      category: 'whatsapp',
      title: 'Caixas de Entrada WhatsApp',
      severity: 'critical',
      count: instances.length,
      summary: `Todas as ${instances.length} caixa(s) estão offline (${instances.map((i: any) => `${i.display_name}: ${i.status}`).join(', ')}).`,
      detail: 'Clientes não recebem nem disparam respostas de robôs/atendentes enquanto não reconectar.',
      recommendation: 'Reconecte o QR Code ou cheque o SessionManager no Coolify.'
    });
  } else if (disconnected.length > 0) {
    findings.push({
      id: 'whatsapp_partial_offline',
      category: 'whatsapp',
      title: 'Caixas de Entrada WhatsApp',
      severity: 'warn',
      count: disconnected.length,
      summary: `${connected.length} online, porém ${disconnected.length} offline (${disconnected.map((i: any) => `${i.display_name} [${i.status}]`).join(', ')}).`,
      recommendation: 'Verifique se as caixas offline devem ser reconectadas ou removidas.'
    });
  } else {
    findings.push({
      id: 'whatsapp_ok',
      category: 'whatsapp',
      title: 'Caixas de Entrada WhatsApp',
      severity: 'ok',
      count: connected.length,
      summary: `${connected.length}/${instances.length} caixa(s) online e conectadas.`,
      recommendation: 'Conexões WhatsApp ativas sem quedas pendentes.'
    });
  }

  // Valida desync entre companies.evolution_api_instance e caixas existentes
  const defaultInstId = compRes.data?.evolution_api_instance;
  if (instances.length > 0 && defaultInstId) {
    const matched = instances.find((i: any) => i.id === defaultInstId);
    if (!matched) {
      findings.push({
        id: 'whatsapp_default_orphan',
        category: 'whatsapp',
        title: 'Desincronia da Caixa Padrão (evolution_api_instance)',
        severity: 'warn',
        summary: `Empresa aponta para instância "${defaultInstId}" que não pertence ou foi removida deste tenant.`,
        recommendation: 'Atualize a caixa padrão em Caixas de Entrada para evitar falhas de envio automático.'
      });
    } else if (matched.status !== 'connected' && matched.status !== 'open' && connected.length > 0) {
      findings.push({
        id: 'whatsapp_default_offline',
        category: 'whatsapp',
        title: 'Caixa Padrão Offline com Outra Disponível',
        severity: 'warn',
        summary: `Caixa padrão "${matched.display_name}" está ${matched.status}, enquanto "${connected[0].display_name}" está conectada.`,
        recommendation: 'Automações sem instance_id explícito podem falhar. Reconecte ou altere a caixa padrão.'
      });
    }
  }

  // Valida atendentes sem nenhuma instância permitida (causa chat em branco!)
  const users = usersRes.data || [];
  const validInstanceIds = new Set(instances.map((i: any) => i.id));
  const blockedOperators = users.filter((u: any) => {
    const isAdmin = u.role === 'master' || u.role === 'admin' || u.role === 'owner';
    if (isAdmin) return false;
    const allowed = Array.isArray(u.allowed_instances) ? u.allowed_instances : [];
    if (allowed.length === 0) return false; // null/vazio na política significa "todas" ou "nenhuma" dependendo da empresa; só alerta se houver IDs órfãos
    return allowed.every((id: string) => !validInstanceIds.has(id));
  });

  if (blockedOperators.length > 0) {
    findings.push({
      id: 'rbac_orphan_instances',
      category: 'whatsapp',
      title: 'RBAC Operadores x Caixas Órfãs',
      severity: 'warn',
      count: blockedOperators.length,
      summary: `${blockedOperators.length} atendente(s) com IDs de caixa inexistentes em allowed_instances (${blockedOperators.map((u: any) => u.full_name).join(', ')}).`,
      recommendation: 'Reconfigure as permissões em Configurações -> Usuários para evitar tela de chat vazia.'
    });
  }

  return findings;
}

/**
 * Audita Outbox (`wa_outgoing_messages`), Event Loop Lag, Vazamento de Listeners Baileys e Reconnect Storms no Servidor Node.
 */
async function auditOutboxAndEngineTelemetry(engineUrl: string): Promise<PreventiveFinding[]> {
  const [healthProbe, msgProbe, telemetryProbe] = await Promise.all([
    probeEndpointJson(`${engineUrl}/debug/healthz`, 4000),
    probeEndpointJson(`${engineUrl}/debug/messages-health`, 4500),
    probeEndpointJson(`${engineUrl}/api/v1/diagnostics/telemetry`, 4500)
  ]);

  const findings: PreventiveFinding[] = [];

  if (!healthProbe.ok || !healthProbe.data) {
    findings.push({
      id: 'node_offline',
      category: 'outbox',
      title: 'Servidor Backend Node.js & Baileys Engine',
      severity: 'critical',
      latencyMs: healthProbe.latencyMs,
      summary: `Motor inacessível em ${engineUrl} (HTTP ${healthProbe.status || 'ERR'}: ${healthProbe.error || 'sem resposta'}).`,
      recommendation: 'Verifique o container no Coolify e a variável VITE_WHATSAPP_ENGINE_URL.'
    });
    return findings;
  }

  findings.push({
    id: 'node_online',
    category: 'outbox',
    title: 'Servidor Backend Node.js',
    severity: healthProbe.latencyMs > 1500 ? 'warn' : 'ok',
    latencyMs: healthProbe.latencyMs,
    summary: `v${healthProbe.data.engineVersion || '?'} online (Baileys ${healthProbe.data.baileysVersion || '?'}) • RTT ${healthProbe.latencyMs}ms`,
    recommendation: healthProbe.latencyMs > 1500
      ? 'Latência elevada até a VPS. Avalie carga do container.'
      : 'Gateway Node respondendo com baixa latência.'
  });

  // Outbox wa_outgoing_messages
  if (msgProbe.ok && msgProbe.data?.outbox) {
    const ob = msgProbe.data.outbox;
    const stuck = Number(ob.stuckInProcessing || 0);
    const failed = Number(ob.failed || 0);
    const pending = Number(ob.pending || 0);
    const sentHour = Number(ob.sentLastHour || 0);

    if (stuck > 0 || failed > 0) {
      findings.push({
        id: 'outbox_queue',
        category: 'outbox',
        title: 'Fila Outbox (wa_outgoing_messages)',
        severity: stuck > 0 ? 'critical' : 'warn',
        count: stuck + failed,
        summary: `${stuck} travada(s) >5min em processing • ${failed} falhada(s) • ${pending} pendente(s) (${sentHour} enviadas/1h)`,
        detail: stuck > 0 ? 'Mensagens presas em "processing" indicam trava de socket ou falha no QueueProcessor.' : undefined,
        recommendation: 'Inspecione o QueueProcessor e reconecte sessões com socket travado.',
        rawPayload: ob.stuckSamples
      });
    } else if (pending > 15) {
      findings.push({
        id: 'outbox_backlog',
        category: 'outbox',
        title: 'Acúmulo na Fila Outbox',
        severity: 'warn',
        count: pending,
        summary: `${pending} mensagens aguardando envio na fila (${sentHour} enviadas na última hora).`,
        recommendation: 'Acompanhe o ritmo de disparo e fila Antiban para evitar atraso nas respostas.'
      });
    } else {
      findings.push({
        id: 'outbox_ok',
        category: 'outbox',
        title: 'Fila Outbox (wa_outgoing_messages)',
        severity: 'ok',
        summary: `Fila saudável (${pending} pendentes, 0 travadas, ${sentHour} enviadas na última 1h).`,
        recommendation: 'Entrega assíncrona fluindo sem represamento.'
      });
    }
  }

  // Event Loop, Listeners e Storms
  const tel = telemetryProbe.data?.telemetry;
  if (telemetryProbe.ok && tel) {
    const p50 = Number(tel.eventLoop?.p50Ms ?? 0);
    const p95 = Number(tel.eventLoop?.p95Ms ?? 0);
    const heapMb = Number(tel.memory?.heapUsedMb ?? 0);
    const baileysInstances: any[] = tel.baileys?.instances || [];
    const leakedListeners = baileysInstances.filter((i) => Number(i.totalListeners || 0) > 8);
    const storm = Boolean(tel.baileys?.anyReconnectStorm);

    if (storm || leakedListeners.length > 0 || p50 >= 150) {
      findings.push({
        id: 'engine_telemetry_alert',
        category: 'outbox',
        title: 'Event Loop & Listeners Baileys',
        severity: storm || p50 >= 150 ? 'critical' : 'warn',
        summary: `P50: ${p50}ms | P95: ${p95}ms | Heap: ${heapMb}MB${leakedListeners.length > 0 ? ` | ${leakedListeners.length} instância(s) com >8 listeners` : ''}${storm ? ' | TEMPESTADE DE RECONEXÃO!' : ''}`,
        detail: leakedListeners.length > 0
          ? `Possível memory leak em sessões: ${leakedListeners.map((i) => `${i.displayName || i.instanceId} (${i.totalListeners} listeners)`).join(', ')}`
          : undefined,
        recommendation: 'Reinicie as sessões com acúmulo de listeners ou investigue loops de reconexão 440/401.'
      });
    } else {
      findings.push({
        id: 'engine_telemetry_ok',
        category: 'outbox',
        title: 'Event Loop & Memória Node.js',
        severity: p50 >= 50 ? 'warn' : 'ok',
        summary: `Event Loop P50: ${p50}ms (P95: ${p95}ms) • Heap: ${heapMb}MB • ${baileysInstances.length} sessões monitoradas sem vazamento`,
        recommendation: p50 >= 50
          ? 'P50 levemente acima de 50ms. Observe picos de I/O síncrono.'
          : 'Processo Node livre de bloqueios no Event Loop.'
      });
    }
  }

  return findings;
}

/**
 * Audita o Cofre Blindado da chave Gemini (ENCv1) e variáveis globais críticas do cliente (`link_cardapio`, `nome_ia`).
 */
async function auditAiVaultAndGlobalVars(tenantId: string | null): Promise<PreventiveFinding[]> {
  if (!isValidUuid(tenantId)) return [];

  const { data: comp, error } = await supabase
    .from('companies')
    .select('id, name, global_ai_enabled, settings')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !comp) {
    return [{
      id: 'ai_company_err',
      category: 'ai_vault',
      title: 'Configurações de IA & Variáveis Globais',
      severity: 'warn',
      summary: `Não foi possível ler settings da empresa: ${error?.message || 'Registro não encontrado'}`,
      recommendation: 'Confirme se o tenant selecionado possui registro válido em companies.'
    }];
  }

  const findings: PreventiveFinding[] = [];
  const settings = (comp.settings && typeof comp.settings === 'object') ? comp.settings : {};
  const rawKey = String(settings.gemini_api_key || '').trim();
  const hasMeta = Boolean(settings.gemini_key_meta);
  const aiEnabled = Boolean(comp.global_ai_enabled);
  const linkCardapio = String(settings.link_cardapio || '').trim();

  if (!rawKey && aiEnabled) {
    findings.push({
      id: 'ai_key_missing',
      category: 'ai_vault',
      title: 'Chave Gemini (IA Global Ativa)',
      severity: 'critical',
      summary: `A empresa "${comp.name}" está com IA Global ligada, mas nenhuma chave Gemini está configurada no cofre.`,
      recommendation: 'Cadastre a chave Gemini em Configurações -> Integrações antes que clientes recebam silêncio da IA.'
    });
  } else if (rawKey && !rawKey.startsWith('ENCv1:') && !rawKey.includes('SERVER_MANAGED')) {
    findings.push({
      id: 'ai_key_plaintext',
      category: 'ai_vault',
      title: 'Chave Gemini Sem Blindagem AES (Legado)',
      severity: 'warn',
      summary: 'A chave salva não utiliza criptografia ENCv1: no banco de dados.',
      recommendation: 'Re-salve a chave em Configurações -> Integrações para ativar proteção AES-GCM + metadados mascarados.'
    });
  } else if (rawKey) {
    findings.push({
      id: 'ai_key_vault_ok',
      category: 'ai_vault',
      title: 'Cofre de Chave Gemini (Anti-Fraude)',
      severity: 'ok',
      summary: hasMeta
        ? `Chave protegida (${settings.gemini_key_meta?.maskedPreview || 'ENCv1 ativo'})`
        : 'Chave cifrada ativa no cofre do servidor.',
      recommendation: 'Segredo protegido contra vazamento no frontend.'
    });
  }

  if (linkCardapio && !/^https?:\/\/.+/i.test(linkCardapio)) {
    findings.push({
      id: 'global_var_menu_invalid',
      category: 'ai_vault',
      title: 'Variável Global link_cardapio Inválida',
      severity: 'warn',
      summary: `Valor atual "${linkCardapio}" não começa com http:// ou https://.`,
      recommendation: 'Corrija em Configurações -> Conta -> Variáveis Globais para que o botão "Cardápio 30d" e robôs enviem um link clicável.'
    });
  } else if (!linkCardapio && aiEnabled) {
    findings.push({
      id: 'global_var_menu_empty',
      category: 'ai_vault',
      title: 'Variável Global link_cardapio Ausente',
      severity: 'warn',
      summary: 'link_cardapio está vazio; robôs com {{link_cardapio}} ou atalho "Cardápio 30d" ficarão sem URL do cliente.',
      recommendation: 'Preencha o link do cardápio em Configurações -> Conta -> Variáveis Globais.'
    });
  }

  return findings;
}

/**
 * Audita integridade do estado em memória do Zustand (`useChatStore`) e acesso real ao bucket `chat_media`.
 */
async function auditStoreAndStorageIntegrity(): Promise<PreventiveFinding[]> {
  const findings: PreventiveFinding[] = [];
  const storeState = useChatStore.getState() as any;

  if (!storeState) {
    findings.push({
      id: 'store_missing',
      category: 'store_realtime',
      title: 'Estado Global Zustand (useChatStore)',
      severity: 'critical',
      summary: 'useChatStore não retornou estado ativo.',
      recommendation: 'Recarregue a página ou revise src/store/chatStore.ts.'
    });
  } else {
    const requiredFns = ['sendHumanMessage', 'fetchInitialData', 'setActiveChat', 'upsertContactLocally'];
    const missing = requiredFns.filter((fn) => typeof storeState[fn] !== 'function');

    const contacts: any[] = Array.isArray(storeState.contacts) ? storeState.contacts : [];
    const seenIds = new Set<string>();
    const dupIds: string[] = [];
    const phoneGroups = new Map<string, string[]>();

    contacts.forEach((c) => {
      if (seenIds.has(c.id)) dupIds.push(c.id);
      seenIds.add(c.id);
      if (c.phone && c.tenant_id) {
        const key = `${c.tenant_id}:${c.phone}`;
        const list = phoneGroups.get(key) || [];
        list.push(c.id);
        phoneGroups.set(key, list);
      }
    });

    const dupPhones = Array.from(phoneGroups.entries()).filter(([, ids]) => ids.length > 1);

    if (missing.length > 0 || dupIds.length > 0 || dupPhones.length > 0) {
      findings.push({
        id: 'store_integrity',
        category: 'store_realtime',
        title: 'Integridade do ChatStore & Contatos',
        severity: missing.length > 0 ? 'critical' : 'warn',
        count: missing.length + dupIds.length + dupPhones.length,
        summary: [
          missing.length > 0 ? `Funções ausentes: ${missing.join(', ')}` : null,
          dupIds.length > 0 ? `${dupIds.length} IDs duplicados` : null,
          dupPhones.length > 0 ? `${dupPhones.length} telefones duplicados no mesmo tenant` : null
        ].filter(Boolean).join(' • '),
        detail: dupPhones.length > 0
          ? `Exemplo: ${dupPhones.slice(0, 3).map(([k, ids]) => `${k.split(':')[1]} (${ids.length}x)`).join(', ')}`
          : undefined,
        recommendation: 'Deduplique contatos em upsertContactLocally e execute resync da store (fetchInitialData).'
      });
    } else {
      findings.push({
        id: 'store_integrity',
        category: 'store_realtime',
        title: 'Integridade do ChatStore & Contatos',
        severity: 'ok',
        summary: `${contacts.length} contatos em cache sem duplicidade de ID ou telefone.`,
        recommendation: 'Store React/Zustand consistente.'
      });
    }
  }

  // Teste real no bucket oficial chat_media
  const storageT0 = performance.now();
  const { error: storageErr } = await supabase.storage.from('chat_media').list('', { limit: 1 });
  const storageLatency = Math.round(performance.now() - storageT0);

  if (storageErr) {
    findings.push({
      id: 'storage_bucket',
      category: 'store_realtime',
      title: 'Storage de Mídias (chat_media)',
      severity: 'warn',
      latencyMs: storageLatency,
      summary: `Leitura do bucket "chat_media" retornou aviso: ${storageErr.message}`,
      recommendation: 'Verifique políticas do bucket chat_media caso envie imagens/áudios falhe.'
    });
  } else {
    findings.push({
      id: 'storage_bucket',
      category: 'store_realtime',
      title: 'Storage de Mídias (chat_media)',
      severity: 'ok',
      latencyMs: storageLatency,
      summary: `Bucket chat_media acessível (${storageLatency}ms).`,
      recommendation: 'Upload/download de anexos operante.'
    });
  }

  return findings;
}

/**
 * Executa varredura preventiva multi-camada completa (100% não destrutiva) para detectar erros reais e riscos latentes.
 */
export async function runPreventiveAudit(tenantId: string | null, engineUrl: string): Promise<PreventiveAuditReport> {
  const start = performance.now();

  const [dbFindings, waFindings, outboxFindings, aiFindings, storeFindings, pulledLogs] = await Promise.all([
    auditDatabaseAndCircuitBreaker(),
    auditWhatsAppInboxesAndRbac(tenantId),
    auditOutboxAndEngineTelemetry(engineUrl),
    auditAiVaultAndGlobalVars(tenantId),
    auditStoreAndStorageIntegrity(),
    fetchRecentRealLogs(tenantId, engineUrl)
  ]);

  const findings: PreventiveFinding[] = [
    ...dbFindings,
    ...waFindings,
    ...outboxFindings,
    ...aiFindings,
    ...storeFindings
  ];

  const errorLogs = pulledLogs.filter((l) => l.level === 'error' || l.level === 'fatal');
  const warnLogs = pulledLogs.filter((l) => l.level === 'warn');

  if (errorLogs.length > 0 || warnLogs.length > 0) {
    findings.unshift({
      id: 'recent_system_logs',
      category: 'logs',
      title: 'Erros Reais Históricos (Últimas 2h)',
      severity: errorLogs.length > 0 ? 'critical' : 'warn',
      count: pulledLogs.length,
      summary: `${errorLogs.length} erro(s) e ${warnLogs.length} alerta(s) reais encontrados em system_logs / Buffer Node e hidratados no Console.`,
      detail: pulledLogs.slice(0, 2).map((l) => `[${l.source}] ${l.message.slice(0, 140)}`).join(' | '),
      recommendation: 'Abra a aba CONSOLE filtrando "Ação Requerida" ou clique em "I.A CRM" para analisar a causa raiz.',
      rawPayload: pulledLogs.slice(0, 5)
    });
  } else {
    findings.push({
      id: 'recent_system_logs_ok',
      category: 'logs',
      title: 'Histórico de Erros Reais (Últimas 2h)',
      severity: 'ok',
      summary: 'Nenhum error/warn encontrado em system_logs ou no buffer recente do Servidor Node.',
      recommendation: 'Sem incidentes registrados na janela recente.'
    });
  }

  const counts = findings.reduce(
    (acc, item) => {
      acc[item.severity] += 1;
      return acc;
    },
    { critical: 0, warn: 0, ok: 0 }
  );

  const score = Math.max(0, Math.min(100, 100 - counts.critical * 20 - counts.warn * 7));
  const status: PreventiveAuditReport['status'] = counts.critical > 0 ? 'critical' : counts.warn > 0 ? 'degraded' : 'healthy';

  return {
    ranAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - start),
    score,
    status,
    findings,
    pulledLogs,
    counts
  };
}

/**
 * Executa sondas controladas para validar que todos os interceptadores reais de captura (ReportError, Fetch HTTP, Promise Rejection e Sync Node) estão ativos.
 */
export async function runControlledCaptureProbe(
  kind: CaptureProbeKind,
  engineUrl: string,
  tenantId: string | null
): Promise<{ ok: boolean; summary: string }> {
  const stamp = new Date().toLocaleTimeString('pt-BR');

  if (kind === 'report_error') {
    await reportError(
      new Error(`[SANDBOX-VALIDAÇÃO ${stamp}] Sonda controlada de pipeline errorLogger -> DevLogger -> system_logs`),
      { trigger: 'sandbox_probe', tenantId: tenantId || undefined, nonFatal: true },
      'Sandbox Probe'
    );
    return { ok: true, summary: 'Sonda reportError disparada no pipeline Frontend -> DevLogger -> system_logs.' };
  }

  if (kind === 'http_404') {
    const res = await fetch(`${engineUrl}/api/v1/__devlogger_probe_404?ts=${Date.now()}`, { method: 'GET' });
    return {
      ok: res.status >= 400,
      summary: `Requisição HTTP real retornou status ${res.status}. Confira no Console se o interceptador window.fetch registrou a rota.`
    };
  }

  if (kind === 'promise_rejection') {
    Promise.reject(new Error(`[SANDBOX-VALIDAÇÃO ${stamp}] Sonda de Unhandled Promise Rejection controlada`));
    return { ok: true, summary: 'Promise rejection não tratada emitida; o listener unhandledrejection deve registrá-la no Console.' };
  }

  // node_logs_sync: puxa logs reais mais recentes do servidor Node sem injetar erro falso
  const nodeRes = await probeEndpointJson(`${engineUrl}/api/v1/system/logs/recent-errors?since=0`, 4000);
  if (!nodeRes.ok) {
    return { ok: false, summary: `Falha ao consultar buffer Node (${nodeRes.error || `HTTP ${nodeRes.status}`}).` };
  }
  const errCount = Array.isArray(nodeRes.data?.errors) ? nodeRes.data.errors.length : 0;
  return {
    ok: true,
    summary: `Endpoint /api/v1/system/logs/recent-errors ativo (${nodeRes.latencyMs}ms): ${errCount} evento(s) no buffer Node.`
  };
}
