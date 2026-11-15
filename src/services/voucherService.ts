import { supabase } from './supabase';

export const getEngineUrl = (): string => {
  const envUrl = import.meta.env.VITE_WHATSAPP_ENGINE_URL;
  return (envUrl && String(envUrl).trim()) || 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';
};

export interface StoreProfile {
  id: string;
  name: string;
  company_name?: string;
  trade_name?: string;
  endereco?: string;
  link_cardapio?: string;
  instagram?: string;
  whatsapp?: string;
  logo_url?: string;
  voucher_default_instance_id?: string | null;
  has_terminal_pin?: boolean;
}

export interface VoucherPartnerCompany {
  id: string;
  tenant_id: string;
  razao_social: string;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  contato_nome?: string | null;
  contato_whatsapp?: string | null;
  email_empresa?: string | null;
  login_usuario?: string | null;
  tem_senha_configurada?: boolean;
  saldo_global?: number;
  saldo_credito: number;
  credito_total_concedido?: number;
  credito_inicio?: string | null;
  credito_fim?: string | null;
  ativo: boolean;
  limite_vouchers?: number;
  credito_mensal_ativo: boolean;
  valor_credito_mensal: number;
  dia_renovacao_mensal: number;
  modo_renovacao_mensal: 'RENOVAR_TETO' | 'ACUMULAR';
  ultima_renovacao_competencia?: string | null;
  permitir_compra_creditos: boolean;
  desconto_compra_percent: number;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  telefone_empresa?: string | null;
  status_cnpj?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface VoucherCampaign {
  id: string;
  tenant_id: string;
  empresa_id?: string | null;
  empresa_nome?: string | null;
  nome: string;
  descricao?: string | null;
  valor_voucher: number;
  tipo_desconto?: string;
  valor_desconto?: number;
  quantidade_total?: number;
  ativo: boolean;
  validade_fim?: string | null;
  horarios_permitidos?: { dias?: number[]; inicio?: string; fim?: string } | null;
  restaurante_instance_id?: string | null;
  created_at?: string;
}

export interface VoucherColaborador {
  id: string;
  tenant_id: string;
  empresa_id: string;
  nome: string;
  cpf?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  cargo?: string | null;
  departamento?: string | null;
  ativo: boolean;
  created_at?: string;
}

export interface VoucherRecord {
  id: string;
  tenant_id: string;
  empresa_id?: string | null;
  campanha_id?: string | null;
  campanha_nome?: string | null;
  colaborador_id?: string | null;
  public_token: string;
  valor: number;
  status: string;
  beneficiario_nome?: string | null;
  beneficiario_whatsapp?: string | null;
  empresa_nome?: string | null;
  empresa_razao_social?: string | null;
  observacoes?: string | null;
  validade_fim: string;
  data_resgate?: string | null;
  data_cancelamento?: string | null;
  atendente_id?: string | null;
  mensagem_envio_status?: string | null;
  mensagem_envio_erro?: string | null;
  mensagem_enviada_em?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface VoucherCreditOrder {
  id: string;
  tenant_id: string;
  empresa_id: string;
  valor_credito: number;
  desconto_percent: number;
  valor_desconto: number;
  valor_pago: number;
  forma_pagamento: string;
  origem: string;
  status: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';
  solicitado_por?: string | null;
  aprovado_por?: string | null;
  observacoes?: string | null;
  aprovado_em?: string | null;
  created_at: string;
}

export interface VoucherEventRecord {
  id: string;
  tenant_id: string;
  voucher_id?: string | null;
  voucher_token?: string | null;
  empresa_id?: string | null;
  tipo_operacao: string;
  valor: number;
  beneficiario_nome?: string | null;
  empresa_origem?: string | null;
  status_anterior?: string | null;
  status_novo?: string | null;
  data_hora?: string;
  usuario_responsavel?: string | null;
  motivo?: string | null;
  payload?: Record<string, any> | null;
  created_at?: string;
}

export interface WhatsAppInstanceLite {
  id: string;
  display_name?: string | null;
  whatsapp_name?: string | null;
  phone_number?: string | null;
  status: string;
}

export interface MerchantDashboardData {
  tenant: StoreProfile;
  partners: VoucherPartnerCompany[];
  campaigns: VoucherCampaign[];
  colaboradores: VoucherColaborador[];
  vouchers: VoucherRecord[];
  credit_orders: VoucherCreditOrder[];
  events: VoucherEventRecord[];
  instances: WhatsAppInstanceLite[];
}

export interface PortalDashboardData {
  empresa: VoucherPartnerCompany;
  restaurante: StoreProfile;
  vouchers: VoucherRecord[];
  colaboradores: VoucherColaborador[];
  credit_orders: VoucherCreditOrder[];
  events: VoucherEventRecord[];
}

export const formatBRL = (value: number | string | null | undefined): string => {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const normalizePhoneDigits = (raw?: string | null): string => {
  return String(raw || '').replace(/\D/g, '');
};

export const isInstanceConnected = (status?: string | null): boolean => {
  return ['CONNECTED', 'OPEN', 'ONLINE'].includes(String(status || '').toUpperCase());
};

export const formatPhoneDisplay = (raw?: string | null): string => {
  let d = normalizePhoneDigits(raw);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw || '-';
};

export const parseColaboradoresCsv = (rawText: string): Array<{
  nome: string;
  whatsapp?: string;
  cpf?: string;
  cargo?: string;
  email?: string;
}> => {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const parsed: Array<{ nome: string; whatsapp?: string; cpf?: string; cargo?: string; email?: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sep = line.includes(';') ? ';' : (line.includes('\t') ? '\t' : ',');
    const cols = line.split(sep).map(c => c.trim());
    if (!cols[0]) continue;
    if (i === 0 && cols[0].toLowerCase().includes('nome') && (cols[1] || '').toLowerCase().includes('whats')) {
      continue;
    }
    parsed.push({
      nome: cols[0],
      whatsapp: cols[1] ? normalizePhoneDigits(cols[1]) : undefined,
      cpf: cols[2] || undefined,
      cargo: cols[3] || undefined,
      email: cols[4] || undefined
    });
  }

  return parsed;
};

async function callRpc<T = any>(fnName: string, params: Record<string, any> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fnName, params);
  if (error) {
    throw new Error(error.message || `Falha ao executar ${fnName}`);
  }
  return data as T;
}

async function getMerchantAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

async function fetchEngineJson<T = any>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${getEngineUrl()}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error || `Erro HTTP ${res.status} ao comunicar com o servidor.`);
  }
  return body as T;
}

export const voucherService = {
  // =========================================================================
  // MERCHANT / HOST STORE ADMIN RPCs
  // =========================================================================
  merchantGetDashboard: (tenantId: string) =>
    callRpc<MerchantDashboardData & { success: boolean }>('voucher_merchant_get_dashboard', { p_tenant_id: tenantId }),

  merchantSavePartner: (params: {
    tenantId: string;
    id?: string | null;
    razao_social: string;
    nome_fantasia?: string;
    cnpj?: string;
    contato_nome?: string;
    contato_whatsapp?: string;
    email_empresa?: string;
    login_usuario?: string;
    login_senha?: string;
    saldo_inicial?: number;
    credito_inicio?: string | null;
    credito_fim?: string | null;
    limite_vouchers?: number;
    ativo?: boolean;
    credito_mensal_ativo?: boolean;
    valor_credito_mensal?: number;
    dia_renovacao_mensal?: number;
    modo_renovacao_mensal?: 'RENOVAR_TETO' | 'ACUMULAR';
    permitir_compra_creditos?: boolean;
    desconto_compra_percent?: number;
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    telefone_empresa?: string;
    status_cnpj?: string;
  }) =>
    callRpc<{ success: boolean; partner: VoucherPartnerCompany; generated_password?: string | null }>(
      'voucher_merchant_save_partner',
      {
        p_tenant_id: params.tenantId,
        p_id: params.id || null,
        p_razao_social: params.razao_social,
        p_nome_fantasia: params.nome_fantasia || null,
        p_cnpj: params.cnpj || null,
        p_contato_nome: params.contato_nome || null,
        p_contato_whatsapp: params.contato_whatsapp || null,
        p_email_empresa: params.email_empresa || null,
        p_login_usuario: params.login_usuario || null,
        p_login_senha: params.login_senha || null,
        p_saldo_inicial: params.saldo_inicial ?? 0,
        p_credito_inicio: params.credito_inicio || null,
        p_credito_fim: params.credito_fim || null,
        p_limite_vouchers: params.limite_vouchers ?? 0,
        p_ativo: params.ativo ?? true,
        p_credito_mensal_ativo: params.credito_mensal_ativo ?? false,
        p_valor_credito_mensal: params.valor_credito_mensal ?? 0,
        p_dia_renovacao_mensal: params.dia_renovacao_mensal ?? 1,
        p_modo_renovacao_mensal: params.modo_renovacao_mensal || 'RENOVAR_TETO',
        p_permitir_compra_creditos: params.permitir_compra_creditos ?? true,
        p_desconto_compra_percent: params.desconto_compra_percent ?? 0,
        p_cep: params.cep || null,
        p_logradouro: params.logradouro || null,
        p_numero: params.numero || null,
        p_complemento: params.complemento || null,
        p_bairro: params.bairro || null,
        p_cidade: params.cidade || null,
        p_uf: params.uf || null,
        p_telefone_empresa: params.telefone_empresa || null,
        p_status_cnpj: params.status_cnpj || null
      }
    ),

  merchantResetPartnerPassword: (tenantId: string, empresaId: string, novaSenha?: string | null) =>
    callRpc<{ success: boolean; plain_password: string; partner: VoucherPartnerCompany }>(
      'voucher_merchant_reset_partner_password',
      {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_nova_senha: novaSenha || null
      }
    ),

  merchantTogglePartner: (tenantId: string, empresaId: string, ativo: boolean) =>
    callRpc<{ success: boolean; partner: VoucherPartnerCompany }>('voucher_merchant_toggle_partner', {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId,
      p_ativo: ativo
    }),

  merchantSaveCampaign: (params: {
    tenantId: string;
    id?: string | null;
    nome: string;
    descricao?: string;
    valor_voucher: number;
    empresa_id?: string | null;
    empresa_nome?: string | null;
    quantidade_total?: number;
    validade_fim?: string | null;
    tipo_desconto?: string;
    valor_desconto?: number;
    horarios_permitidos?: { dias?: number[]; inicio?: string; fim?: string } | null;
    restaurante_instance_id?: string | null;
    ativo?: boolean;
  }) =>
    callRpc<{ success: boolean; campaign: VoucherCampaign }>('voucher_merchant_save_campaign', {
      p_tenant_id: params.tenantId,
      p_id: params.id || null,
      p_nome: params.nome,
      p_descricao: params.descricao || null,
      p_valor_voucher: params.valor_voucher,
      p_empresa_id: params.empresa_id || null,
      p_empresa_nome: params.empresa_nome || null,
      p_quantidade_total: params.quantidade_total ?? 100,
      p_validade_fim: params.validade_fim || null,
      p_tipo_desconto: params.tipo_desconto || 'VALOR_FIXO',
      p_valor_desconto: params.valor_desconto ?? params.valor_voucher ?? 0,
      p_horarios_permitidos: params.horarios_permitidos || null,
      p_restaurante_instance_id: params.restaurante_instance_id || null,
      p_ativo: params.ativo ?? true
    }),

  merchantDeleteCampaign: (tenantId: string, campanhaId: string) =>
    callRpc<{ success: boolean }>('voucher_merchant_delete_campaign', {
      p_tenant_id: tenantId,
      p_campanha_id: campanhaId
    }),

  merchantSaveColaborador: (params: {
    tenantId: string;
    empresaId: string;
    id?: string | null;
    nome: string;
    whatsapp?: string;
    cpf?: string;
    email?: string;
    cargo?: string;
    departamento?: string;
    ativo?: boolean;
  }) =>
    callRpc<{ success: boolean; colaborador: VoucherColaborador }>('voucher_merchant_save_colaborador', {
      p_tenant_id: params.tenantId,
      p_empresa_id: params.empresaId,
      p_id: params.id || null,
      p_nome: params.nome,
      p_whatsapp: params.whatsapp || null,
      p_cpf: params.cpf || null,
      p_email: params.email || null,
      p_cargo: params.cargo || null,
      p_departamento: params.departamento || null,
      p_ativo: params.ativo ?? true
    }),

  merchantDeleteColaborador: (tenantId: string, colaboradorId: string) =>
    callRpc<{ success: boolean }>('voucher_merchant_delete_colaborador', {
      p_tenant_id: tenantId,
      p_colaborador_id: colaboradorId
    }),

  merchantIssueVouchers: (params: {
    tenantId: string;
    empresaId?: string | null;
    campanhaId?: string | null;
    items: Array<{
      colaborador_id?: string | null;
      beneficiario_nome: string;
      beneficiario_whatsapp?: string | null;
      valor: number;
      observacoes?: string | null;
    }>;
    validadeFim: string;
    observacoes?: string;
    usuarioResponsavel?: string;
  }) =>
    callRpc<{ success: boolean; vouchers: VoucherRecord[]; total_emitido: number; partner?: VoucherPartnerCompany | null }>(
      'voucher_merchant_issue_vouchers',
      {
        p_tenant_id: params.tenantId,
        p_empresa_id: params.empresaId || null,
        p_campanha_id: params.campanhaId || null,
        p_items: params.items,
        p_validade_fim: params.validadeFim,
        p_observacoes: params.observacoes || null,
        p_usuario_responsavel: params.usuarioResponsavel || 'Painel Admin'
      }
    ),

  merchantRechargeCredit: (params: {
    tenantId: string;
    empresaId: string;
    valorCredito: number;
    descontoPercent?: number | null;
    formaPagamento?: string;
    novaValidade?: string | null;
    motivo?: string;
    usuarioResponsavel?: string;
  }) =>
    callRpc<{ success: boolean; partner: VoucherPartnerCompany; saldo_novo: number; order_id?: string }>(
      'voucher_merchant_recharge_credit',
      {
        p_tenant_id: params.tenantId,
        p_empresa_id: params.empresaId,
        p_valor_credito: params.valorCredito,
        p_desconto_percent: params.descontoPercent ?? null,
        p_forma_pagamento: params.formaPagamento || 'PIX',
        p_nova_validade: params.novaValidade || null,
        p_motivo: params.motivo || null,
        p_usuario_responsavel: params.usuarioResponsavel || 'Admin'
      }
    ),

  merchantDecideCreditOrder: (params: {
    tenantId: string;
    orderId: string;
    acao: 'APROVAR' | 'REJEITAR';
    motivo?: string;
    usuarioResponsavel?: string;
  }) =>
    callRpc<{ success: boolean; order: VoucherCreditOrder; partner?: VoucherPartnerCompany }>(
      'voucher_merchant_decide_credit_order',
      {
        p_tenant_id: params.tenantId,
        p_order_id: params.orderId,
        p_acao: params.acao,
        p_motivo: params.motivo || null,
        p_usuario_responsavel: params.usuarioResponsavel || 'Admin'
      }
    ),

  merchantCancelOrReactivate: (params: {
    tenantId: string;
    voucherId: string;
    acao: 'CANCELAR' | 'REATIVAR';
    motivo?: string;
    usuarioResponsavel?: string;
  }) =>
    callRpc<{ success: boolean; voucher: VoucherRecord; partner?: VoucherPartnerCompany | null }>(
      'voucher_merchant_cancel_or_reactivate',
      {
        p_tenant_id: params.tenantId,
        p_voucher_id: params.voucherId,
        p_acao: params.acao,
        p_motivo: params.motivo || null,
        p_usuario_responsavel: params.usuarioResponsavel || 'Admin'
      }
    ),

  merchantSaveSettings: (tenantId: string, defaultInstanceId?: string | null, terminalPin?: string | null) =>
    callRpc<{ success: boolean; tenant: StoreProfile }>('voucher_merchant_save_settings', {
      p_tenant_id: tenantId,
      p_default_instance_id: defaultInstanceId || null,
      p_terminal_pin: terminalPin !== undefined ? terminalPin : null
    }),

  merchantRunMonthlyRenewal: (tenantId: string, empresaId?: string | null) =>
    callRpc<{ success: boolean; applied_count: number; details: any[] }>('voucher_process_monthly_renewals', {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId || null,
      p_force_day: true
    }),

  merchantSendVoucherWhatsApp: async (voucherId: string, instanceId?: string | null) => {
    const headers = await getMerchantAuthHeaders();
    return fetchEngineJson(`/api/v1/vouchers/${encodeURIComponent(voucherId)}/send-whatsapp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ instanceId: instanceId || null })
    });
  },

  merchantSendBatchWhatsApp: async (tenantId: string, voucherIds: string[], instanceId?: string | null) => {
    const headers = await getMerchantAuthHeaders();
    return fetchEngineJson<{
      success: boolean;
      sentCount: number;
      failedCount: number;
      results: Array<{ id: string; success: boolean; error?: string }>;
    }>('/api/v1/vouchers/batch/send-whatsapp', {
      method: 'POST',
      headers,
      body: JSON.stringify({ tenantId, voucherIds, instanceId: instanceId || null })
    });
  },

  merchantSendPartnerAccessWhatsApp: async (params: {
    tenantId: string;
    empresaId: string;
    plainPassword?: string | null;
    instanceId?: string | null;
    portalUrl?: string | null;
  }) => {
    const headers = await getMerchantAuthHeaders();
    return fetchEngineJson('/api/v1/vouchers/tenant/send-access-whatsapp', {
      method: 'POST',
      headers,
      body: JSON.stringify(params)
    });
  },

  // =========================================================================
  // B2B PARTNER PORTAL RPCs & ENGINE CALLS
  // =========================================================================
  portalLogin: (usuario: string, senha: string, tenantId?: string | null) =>
    callRpc<{
      success: boolean;
      status?: 'MULTIPLE_STORES';
      error?: string;
      options?: Array<{ empresa_id: string; tenant_id: string; razao_social: string; nome_fantasia?: string; store_name: string }>;
      portal_token?: string;
      expires_at?: string;
      empresa?: VoucherPartnerCompany;
      restaurante?: StoreProfile;
    }>('voucher_portal_login', {
      p_usuario: usuario,
      p_senha: senha,
      p_tenant_id: tenantId || null
    }),

  portalLogout: (portalToken: string) =>
    callRpc<{ success: boolean }>('voucher_portal_logout', { p_portal_token: portalToken }),

  portalGetDashboard: (portalToken: string) =>
    callRpc<PortalDashboardData & { success: boolean }>('voucher_portal_get_dashboard', { p_portal_token: portalToken }),

  portalSaveColaborador: (
    portalToken: string,
    params: {
      id?: string | null;
      nome: string;
      whatsapp?: string;
      cpf?: string;
      email?: string;
      cargo?: string;
      departamento?: string;
      ativo?: boolean;
    }
  ) =>
    callRpc<{ success: boolean; colaborador: VoucherColaborador }>('voucher_portal_save_colaborador', {
      p_portal_token: portalToken,
      p_id: params.id || null,
      p_nome: params.nome,
      p_whatsapp: params.whatsapp || null,
      p_cpf: params.cpf || null,
      p_email: params.email || null,
      p_cargo: params.cargo || null,
      p_departamento: params.departamento || null,
      p_ativo: params.ativo ?? true
    }),

  portalDeleteColaborador: (portalToken: string, colaboradorId: string) =>
    callRpc<{ success: boolean }>('voucher_portal_delete_colaborador', {
      p_portal_token: portalToken,
      p_colaborador_id: colaboradorId
    }),

  portalIssueVouchers: (
    portalToken: string,
    items: Array<{
      colaborador_id?: string | null;
      beneficiario_nome: string;
      beneficiario_whatsapp?: string | null;
      valor: number;
      observacoes?: string | null;
    }>,
    validadeFim: string,
    observacoes?: string
  ) =>
    callRpc<{ success: boolean; vouchers: VoucherRecord[]; total_debitado: number; saldo_novo: number; empresa: VoucherPartnerCompany }>(
      'voucher_portal_issue_vouchers',
      {
        p_portal_token: portalToken,
        p_items: items,
        p_validade_fim: validadeFim,
        p_observacoes: observacoes || null
      }
    ),

  portalCancelVoucher: (portalToken: string, voucherId: string, motivo?: string) =>
    callRpc<{ success: boolean; voucher: VoucherRecord; saldo_estornado: number; saldo_novo: number; empresa: VoucherPartnerCompany }>(
      'voucher_portal_cancel_voucher',
      {
        p_portal_token: portalToken,
        p_voucher_id: voucherId,
        p_motivo: motivo || 'Cancelado pelo Portal B2B'
      }
    ),

  portalRequestCreditOrder: (portalToken: string, valorCredito: number, formaPagamento: string, observacoes?: string) =>
    callRpc<{ success: boolean; order: VoucherCreditOrder }>('voucher_portal_request_credit_order', {
      p_portal_token: portalToken,
      p_valor_credito: valorCredito,
      p_forma_pagamento: formaPagamento || 'PIX',
      p_observacoes: observacoes || null
    }),

  portalSendWhatsApp: async (portalToken: string, voucherIds: string | string[]) => {
    const ids = Array.isArray(voucherIds) ? voucherIds : [voucherIds];
    return fetchEngineJson<{
      success: boolean;
      sentCount: number;
      failedCount: number;
      results: Array<{ id: string; success: boolean; error?: string }>;
    }>('/api/v1/vouchers/portal/send-whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-portal-token': portalToken
      },
      body: JSON.stringify({ voucherIds: ids })
    });
  },

  // =========================================================================
  // PUBLIC VIEWER & POS SCANNER RPCs / ENGINE CALLS
  // =========================================================================
  publicGetVoucher: async (token: string) => {
    try {
      return await fetchEngineJson<{
        success: boolean;
        voucher: VoucherRecord;
        campanha?: VoucherCampaign | null;
        restaurante: StoreProfile;
        qrJwt?: string | null;
        expiresInSeconds?: number;
      }>(`/api/v1/vouchers/public/${encodeURIComponent(token)}`, { method: 'GET' });
    } catch {
      const rpcRes = await callRpc<any>('voucher_get_public', { p_token: token });
      if (!rpcRes?.success) {
        throw new Error(rpcRes?.error || 'Voucher não encontrado.');
      }
      return rpcRes;
    }
  },

  publicRenewQrToken: (token: string) =>
    fetchEngineJson<{ success: boolean; qrJwt: string; expiresInSeconds: number }>(
      `/api/v1/vouchers/public/${encodeURIComponent(token)}/token`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }
    ),

  scannerReserveVoucher: async (params: {
    token: string;
    tenantId?: string | null;
    atendente?: string;
    terminalPin?: string | null;
  }) => {
    const input = String(params.token || '').trim();
    if (input.includes('.')) {
      const headers = await getMerchantAuthHeaders();
      return fetchEngineJson('/api/v1/vouchers/redeem/reserve', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          token: input,
          tenantId: params.tenantId || null,
          atendenteId: params.atendente || 'Operador Caixa',
          terminalPin: params.terminalPin || null
        })
      });
    }

    const res = await callRpc<any>('voucher_scanner_reserve', {
      p_token: input,
      p_tenant_id: params.tenantId || null,
      p_atendente: params.atendente || 'Operador Caixa',
      p_terminal_pin: params.terminalPin || null
    });
    if (!res?.success) {
      const err: any = new Error(res?.error || 'Voucher indisponível para resgate.');
      err.voucher = res?.voucher;
      err.restaurante = res?.restaurante;
      err.code = res?.code;
      throw err;
    }
    return res;
  },

  scannerConfirmRedeem: async (params: {
    voucherIdOrToken: string;
    tenantId?: string | null;
    atendente?: string;
    terminalPin?: string | null;
  }) => {
    const res = await callRpc<any>('voucher_scanner_confirm', {
      p_voucher_id: params.voucherIdOrToken,
      p_tenant_id: params.tenantId || null,
      p_atendente: params.atendente || 'Operador Caixa',
      p_terminal_pin: params.terminalPin || null
    });
    if (!res?.success) {
      throw new Error(res?.error || 'Não foi possível finalizar o resgate.');
    }
    return res;
  }
};
