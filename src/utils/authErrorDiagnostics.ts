/**
 * Utilitário de Diagnóstico de Autenticação e Saúde da Infraestrutura
 * Analisa e expõe a causa raiz real de falhas no login (Supabase Quota 402, Servidor Coolify, Rede ou Credenciais).
 */

export interface LoginErrorInfo {
  title: string;
  message: string;
  code?: string | number;
  technicalDetails?: string;
  category: 'quota' | 'server' | 'network' | 'credentials' | 'auth_sync' | 'unknown';
  actionUrl?: string;
  actionLabel?: string;
}

export interface InfraHealthReport {
  supabase: {
    status: 'restricted' | 'online' | 'offline' | 'error';
    httpStatus?: number;
    title: string;
    message: string;
    details?: string;
    latencyMs?: number;
  };
  coolifyNode: {
    status: 'online' | 'offline' | 'error';
    httpStatus?: number;
    title: string;
    message: string;
    details?: string;
    latencyMs?: number;
  };
  network: {
    online: boolean;
  };
  summary: string;
  timestamp: string;
}

/**
 * Analisa qualquer erro retornado pelo Supabase (RPC, Auth, Fetch ou Catch)
 * e devolve uma estrutura rica e compreensível para o usuário final e para a equipe.
 */
export function parseLoginError(error: any, fallbackMessage?: string): LoginErrorInfo {
  if (!error && !fallbackMessage) {
    return {
      title: 'Falha na Autenticação',
      message: 'Ocorreu um erro ao processar o login.',
      category: 'unknown'
    };
  }

  const msg = error?.message || (typeof error === 'string' ? error : '') || fallbackMessage || '';
  const code = error?.code || error?.status || '';
  const details = error?.details || error?.hint || '';
  const combined = `${msg} ${code} ${details}`.toLowerCase();

  // 1. Quota / Restrição no Supabase Cloud (HTTP 402, Realtime Exceeded, Spend Cap, Fair Use)
  if (
    code === 402 ||
    code === '402' ||
    combined.includes('exceed_realtime_message_count_quota') ||
    combined.includes('restricted') ||
    combined.includes('spend cap') ||
    combined.includes('payment required') ||
    combined.includes('fair use') ||
    combined.includes('quota')
  ) {
    return {
      title: 'Supabase Bloqueado: Cota Excedida (HTTP 402)',
      message: 'A organização atingiu o limite de mensagens Realtime no Supabase Cloud. Como o Spend Cap (teto de gastos) está ativado, o Supabase bloqueou preventivamente todas as requisições à API.',
      code: '402 - QUOTA_RESTRICTED',
      technicalDetails: msg || 'Service restricted: exceed_realtime_message_count_quota. Owner must remove spend caps to restore service.',
      category: 'quota',
      actionUrl: 'https://supabase.com/dashboard/org/zjxnkpqpyizpqwxuoyo/billing',
      actionLabel: 'Abrir Painel de Billing no Supabase (Desativar Spend Cap)'
    };
  }

  // 2. Erros de Servidor / Infraestrutura Supabase (HTTP 500, 502, 503, 504)
  if (
    code === 500 || code === 502 || code === 503 || code === 504 ||
    combined.includes('502 bad gateway') ||
    combined.includes('503 service unavailable') ||
    combined.includes('504 gateway timeout') ||
    combined.includes('internal server error')
  ) {
    return {
      title: `Instabilidade no Supabase Cloud (HTTP ${code || '5xx'})`,
      message: 'Os servidores em nuvem do Supabase estão passando por instabilidade ou manutenção temporária.',
      code: `HTTP_${code || '5XX'}`,
      technicalDetails: msg || 'Servidor indisponível temporariamente',
      category: 'server'
    };
  }

  // 3. Falha de Conexão de Rede
  if (
    combined.includes('failed to fetch') ||
    combined.includes('networkerror') ||
    combined.includes('circuitbreaker') ||
    combined.includes('offline') ||
    combined.includes('abort')
  ) {
    return {
      title: 'Falha de Conexão de Rede',
      message: 'Não foi possível alcançar o servidor Supabase. Verifique sua conexão com a internet ou firewall.',
      code: 'NETWORK_ERROR',
      technicalDetails: msg || 'Falha ao executar fetch para a API',
      category: 'network'
    };
  }

  // 4. Credenciais Inválidas / Não Encontradas
  if (
    combined.includes('invalid login credentials') ||
    combined.includes('e-mail ou senha') ||
    combined.includes('inválid') ||
    combined.includes('not found') ||
    combined.includes('invalid_grant')
  ) {
    return {
      title: 'Credenciais Incorretas',
      message: 'E-mail corporativo ou senha de acesso incorretos. Por favor, confira os dados informados.',
      code: 'AUTH_INVALID_CREDENTIALS',
      technicalDetails: msg,
      category: 'credentials'
    };
  }

  // 5. Erro genérico mas com mensagem real exposta
  return {
    title: 'Falha ao Validar Credenciais',
    message: msg || 'Ocorreu um erro no servidor ao validar suas credenciais.',
    code: code || 'UNKNOWN_ERROR',
    technicalDetails: `${msg} ${details ? `(Detalhes: ${details})` : ''}`.trim(),
    category: 'unknown'
  };
}

/**
 * Executa um health check em tempo real para verificar a saúde dos servidores
 * (Supabase Cloud e WhatsApp Engine no Coolify), identificando exatamente onde está o problema.
 */
export async function checkInfraHealth(): Promise<InfraHealthReport> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const timestamp = new Date().toLocaleTimeString('pt-BR');

  // 1. Testa Supabase Cloud
  let supabaseResult: InfraHealthReport['supabase'] = {
    status: 'online',
    title: 'Supabase Cloud (Banco & Auth)',
    message: 'Operacional'
  };

  const sbStart = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const sbBaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://yzbxsxabzncdzuxvlppt.supabase.co';
    const sbAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const sbUrl = `${sbBaseUrl}/rest/v1/companies?select=id&limit=1`;

    const resp = await fetch(sbUrl, {
      method: 'GET',
      headers: {
        'apikey': sbAnonKey,
        'Authorization': `Bearer ${sbAnonKey}`
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    supabaseResult.latencyMs = Date.now() - sbStart;
    supabaseResult.httpStatus = resp.status;

    if (resp.status === 402) {
      let bodyText = '';
      try {
        const bodyJson = await resp.json();
        bodyText = bodyJson.message || JSON.stringify(bodyJson);
      } catch (_) {
        bodyText = 'Cota excedida (exceed_realtime_message_count_quota)';
      }
      supabaseResult.status = 'restricted';
      supabaseResult.title = 'Supabase Cloud: Restrito por Cota (HTTP 402)';
      supabaseResult.message = 'O projeto excedeu o limite de mensagens Realtime e foi bloqueado pelo Spend Cap.';
      supabaseResult.details = bodyText;
    } else if (resp.status >= 500) {
      supabaseResult.status = 'error';
      supabaseResult.title = `Supabase Cloud: Instabilidade (HTTP ${resp.status})`;
      supabaseResult.message = 'Os servidores da nuvem Supabase reportaram falha interna.';
    } else if (resp.ok || resp.status === 401 || resp.status === 406) {
      supabaseResult.status = 'online';
      supabaseResult.message = `Conexão bem-sucedida (${supabaseResult.latencyMs}ms)`;
    } else {
      supabaseResult.status = 'error';
      supabaseResult.message = `Status HTTP inesperado: ${resp.status}`;
    }
  } catch (err: any) {
    supabaseResult.latencyMs = Date.now() - sbStart;
    supabaseResult.status = 'offline';
    supabaseResult.title = 'Supabase Cloud: Inacessível';
    supabaseResult.message = err?.name === 'AbortError' ? 'Tempo de resposta excedido (Timeout)' : 'Falha ao conectar com o Supabase';
    supabaseResult.details = err?.message || String(err);
  }

  // 2. Testa Servidor WhatsApp Engine (Coolify Node.js)
  let coolifyResult: InfraHealthReport['coolifyNode'] = {
    status: 'online',
    title: 'WhatsApp Engine (Coolify Node)',
    message: 'Operacional'
  };

  const nodeStart = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const nodeBaseUrl = import.meta.env.VITE_WHATSAPP_ENGINE_URL || 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';
    const nodeUrl = `${nodeBaseUrl}/health`;

    const resp = await fetch(nodeUrl, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    coolifyResult.latencyMs = Date.now() - nodeStart;
    coolifyResult.httpStatus = resp.status;

    if (resp.ok) {
      let nodeData: any = {};
      try {
        nodeData = await resp.json();
      } catch (_) {}
      coolifyResult.status = 'online';
      coolifyResult.message = `Servidor Online (${coolifyResult.latencyMs}ms)`;
      coolifyResult.details = nodeData?.node ? `Node: ${nodeData.node} | Versão: ${nodeData.version || 'v7.x'}` : 'Operacional';
    } else {
      coolifyResult.status = 'error';
      coolifyResult.title = `WhatsApp Engine: Erro (HTTP ${resp.status})`;
      coolifyResult.message = `O servidor respondeu com status ${resp.status}`;
    }
  } catch (err: any) {
    coolifyResult.latencyMs = Date.now() - nodeStart;
    coolifyResult.status = 'offline';
    coolifyResult.title = 'WhatsApp Engine: Inacessível';
    coolifyResult.message = err?.name === 'AbortError' ? 'Tempo de resposta excedido (Timeout)' : 'Servidor Node.js não respondeu ao health check';
    coolifyResult.details = err?.message || String(err);
  }

  // 3. Gera veredito claro e executivo
  let summary = '';
  if (supabaseResult.status === 'restricted') {
    summary = 'O problema está no Supabase Cloud: a cota de mensagens Realtime foi estourada e o serviço está restrito (HTTP 402). O Coolify está saudável e respondendo normalmente.';
  } else if (supabaseResult.status === 'offline' && coolifyResult.status === 'online') {
    summary = 'Falha ao contatar o Supabase Cloud, mas o servidor WhatsApp (Coolify) está 100% operacional.';
  } else if (supabaseResult.status === 'online' && coolifyResult.status === 'offline') {
    summary = 'O Supabase está operacional, mas o servidor WhatsApp (Coolify) está offline.';
  } else if (supabaseResult.status === 'online' && coolifyResult.status === 'online') {
    summary = 'Todos os servidores estão 100% operacionais.';
  } else {
    summary = 'Foram detectadas instabilidades em múltiplos pontos da infraestrutura.';
  }

  return {
    supabase: supabaseResult,
    coolifyNode: coolifyResult,
    network: { online: isOnline },
    summary,
    timestamp
  };
}
