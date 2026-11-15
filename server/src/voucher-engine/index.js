import crypto from 'crypto';
import { supabase } from '../supabase.js';
import sessionManager from '../session-manager/index.js';

const APP_PUBLIC_URL = process.env.PUBLIC_APP_URL || process.env.VITE_APP_URL || ((process.env.APP_ENV || '').toLowerCase() === 'alpha' ? 'https://chat-boot-staging.vercel.app' : 'https://chat-boot-theta.vercel.app');

/**
 * Motor de Gestão de Vouchers Digitais Corporativos (Multi-Tenant v2)
 * State Machine: CRIADO -> VISUALIZADO -> RESERVADO -> RESGATADO (ou CANCELADO/EXPIRADO)
 */
class VoucherEngine {
  constructor() {
    this._renewalInterval = null;
  }

  /**
   * Inicia o agendador horário de créditos mensais recorrentes (100% idempotente no PostgreSQL)
   */
  startMonthlyRenewalScheduler() {
    if (this._renewalInterval) return;

    const runCycle = async () => {
      try {
        const { data, error } = await supabase.rpc('voucher_process_monthly_renewals', {
          p_tenant_id: null,
          p_empresa_id: null,
          p_force_day: false
        });
        if (error) {
          console.warn('[VoucherEngine] Aviso no ciclo mensal recorrente:', error.message);
        } else if (data?.applied_count > 0) {
          console.log(`[VoucherEngine] Renovação mensal aplicada para ${data.applied_count} empresa(s) parceira(s).`);
        }
      } catch (err) {
        console.warn('[VoucherEngine] Erro inesperado no ciclo mensal:', err.message);
      }
    };

    setTimeout(runCycle, 15000);
    this._renewalInterval = setInterval(runCycle, 60 * 60 * 1000);
  }

  /**
   * Gera um JWT leve assinado via HMAC-SHA256 para o QR Code dinâmico
   */
  generateQrToken(voucherId, publicToken, secret, ttlSeconds = 30) {
    const safeSecret = secret || crypto.randomBytes(32).toString('hex');
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
      vid: voucherId,
      pt: publicToken,
      iat: now,
      exp: now + ttlSeconds
    })).toString('base64url');

    const signature = crypto
      .createHmac('sha256', safeSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }

  /**
   * Valida o JWT do QR Code usando comparação em tempo constante segura contra buffers de tamanhos distintos
   */
  verifyQrToken(token, secret) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length !== 3) return { valid: false, reason: 'Formato de QR Code inválido.' };

      const [headerB64, payloadB64, signature] = parts;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

      const sigBuf = Buffer.from(signature, 'utf8');
      const expBuf = Buffer.from(expectedSignature, 'utf8');

      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return { valid: false, reason: 'Assinatura criptográfica do QR Code inválida ou adulterada.' };
      }

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      const now = Math.floor(Date.now() / 1000);

      if (payload.exp && now > payload.exp) {
        return { valid: false, reason: 'QR Code expirado (30s). Aguarde a renovação automática na tela do portador.' };
      }

      return { valid: true, payload };
    } catch (err) {
      return { valid: false, reason: `Falha na decodificação do QR Code: ${err.message}` };
    }
  }

  /**
   * Obtém hora/dia atual no fuso oficial do Brasil (America/Sao_Paulo) independente do UTC do container Docker
   */
  getBrazilNowParts() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date());

    const map = {};
    for (const p of parts) map[p.type] = p.value;

    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const hourStr = `${String(map.hour === '24' ? '00' : map.hour).padStart(2, '0')}:${String(map.minute).padStart(2, '0')}`;
    return {
      dayOfWeek: weekdayMap[map.weekday] ?? new Date().getDay(),
      hourStr
    };
  }

  /**
   * Valida regras de horário, validade e dias permitidos da campanha no fuso BRT
   */
  validateCampaignRules(campanha) {
    if (!campanha) return { valid: true };
    const now = new Date();

    const endLimit = campanha.validade_fim || campanha.data_fim;
    if (endLimit && new Date(endLimit) < now) {
      return { valid: false, reason: 'Esta campanha já foi encerrada.' };
    }
    if (campanha.data_inicio && new Date(campanha.data_inicio) > now) {
      return { valid: false, reason: 'Esta campanha ainda não foi iniciada.' };
    }
    if (campanha.ativo === false) {
      return { valid: false, reason: 'Esta campanha está pausada ou inativa.' };
    }

    const horarios = campanha.horarios_permitidos;
    if (horarios && typeof horarios === 'object') {
      const { dayOfWeek, hourStr } = this.getBrazilNowParts();
      if (Array.isArray(horarios.dias) && horarios.dias.length > 0 && !horarios.dias.includes(dayOfWeek)) {
        return { valid: false, reason: 'Voucher desta campanha não é válido para o dia de hoje.' };
      }
      if (horarios.inicio && hourStr < horarios.inicio) {
        return { valid: false, reason: `Campanha válida apenas a partir das ${horarios.inicio}.` };
      }
      if (horarios.fim && hourStr > horarios.fim) {
        return { valid: false, reason: `Horário limite da campanha para hoje encerrado (${horarios.fim}).` };
      }
    }

    return { valid: true };
  }

  /**
   * Busca perfil sanitizado da loja host em companies.settings
   */
  async resolveStoreProfile(tenantId) {
    const { data, error } = await supabase.rpc('voucher_get_store_profile', { p_tenant_id: tenantId });
    if (!error && data) return data;

    const { data: comp } = await supabase
      .from('companies')
      .select('id, name, trade_name, settings')
      .eq('id', tenantId)
      .maybeSingle();

    const s = comp?.settings || {};
    return {
      id: tenantId,
      name: s.businessName || comp?.trade_name || comp?.name || 'Estabelecimento',
      endereco: s.endereco || '',
      link_cardapio: s.link_cardapio || s.menuLink || '',
      instagram: s.instagram || '',
      whatsapp: s.whatsapp || s.phone || '',
      voucher_default_instance_id: s.voucher_default_instance_id || null,
      has_terminal_pin: Boolean((s.voucher_terminal_pin || '').trim())
    };
  }

  /**
   * Resolve estritamente uma caixa WhatsApp pertencente ao mesmo tenant (ZERO vazamento cross-tenant)
   */
  async resolveTenantWhatsAppInstance(tenantId, explicitInstanceId = null, campanhaInstanceId = null) {
    const { data: tenantInstances, error } = await supabase
      .from('whatsapp_instances')
      .select('id, tenant_id, display_name, whatsapp_name, phone_number, status')
      .eq('tenant_id', tenantId);

    if (error) {
      throw new Error(`Falha ao consultar instâncias do estabelecimento: ${error.message}`);
    }

    const instances = tenantInstances || [];
    const storeProfile = await this.resolveStoreProfile(tenantId);
    const defaultCfgId = storeProfile?.voucher_default_instance_id || null;

    if (instances.length === 0) {
      throw new Error(`Nenhuma caixa WhatsApp configurada na conta "${storeProfile.name}".`);
    }

    const tenantInstanceMap = new Map(instances.map(i => [i.id, i]));
    const priorityIds = [];

    for (const candId of [explicitInstanceId, campanhaInstanceId, defaultCfgId]) {
      if (candId && tenantInstanceMap.has(candId) && !priorityIds.includes(candId)) {
        priorityIds.push(candId);
      }
    }

    for (const inst of instances) {
      if (inst.status === 'connected' && !priorityIds.includes(inst.id)) {
        priorityIds.push(inst.id);
      }
    }

    // 1. Tenta socket conectado em memória dentro do mesmo tenant
    for (const instId of priorityIds) {
      const liveSess = sessionManager.getSession(instId);
      if (liveSess && liveSess.tenantId === tenantId && liveSess.status === 'connected' && liveSess.socket) {
        return {
          instanceId: instId,
          instanceInfo: tenantInstanceMap.get(instId),
          liveSession: liveSess,
          storeProfile
        };
      }
    }

    // 2. Fallback seguro no mesmo tenant via fila/Outbox quando a instância está marked connected no banco
    for (const instId of priorityIds) {
      const dbInst = tenantInstanceMap.get(instId);
      if (dbInst && (dbInst.status === 'connected' || dbInst.status === 'connecting' || dbInst.status === 'reconnecting')) {
        return {
          instanceId: instId,
          instanceInfo: dbInst,
          liveSession: sessionManager.getSession(instId) || null,
          storeProfile
        };
      }
    }

    throw new Error(`Nenhuma caixa WhatsApp conectada no momento para "${storeProfile.name}". Conecte o WhatsApp da loja para realizar disparos.`);
  }

  /**
   * Formata telefone BR e envia via socket Baileys do tenant com fallback resiliente no Outbox do próprio tenant
   */
  async sendTextWithinTenant(tenantId, rawPhone, messageText, preferredInstanceId = null, campanhaInstanceId = null) {
    let digits = String(rawPhone || '').replace(/\D/g, '');
    if (digits.length < 10) {
      throw new Error('Telefone WhatsApp inválido ou incompleto.');
    }
    if (digits.length === 10 || digits.length === 11) {
      digits = `55${digits}`;
    }

    const resolved = await this.resolveTenantWhatsAppInstance(tenantId, preferredInstanceId, campanhaInstanceId);
    const { instanceId, liveSession, storeProfile } = resolved;
    let targetJid = `${digits}@s.whatsapp.net`;

    if (liveSession?.socket) {
      try {
        if (typeof liveSession.socket.onWhatsApp === 'function') {
          const waCheck = await liveSession.socket.onWhatsApp(digits);
          if (Array.isArray(waCheck) && waCheck[0]?.exists && waCheck[0]?.jid) {
            targetJid = waCheck[0].jid;
          }
        }
        const sendResult = await liveSession.socket.sendMessage(targetJid, { text: messageText });
        return {
          mode: 'direct',
          messageId: sendResult?.key?.id || null,
          sentTo: targetJid,
          instanceUsed: instanceId,
          storeProfile
        };
      } catch (sendErr) {
        console.warn(`[VoucherEngine] Falha no envio direto socket (${instanceId}), enfileirando no Outbox do mesmo tenant:`, sendErr.message);
      }
    }

    const queued = await sessionManager.enqueueMessage(instanceId, {
      targetJid,
      type: 'text',
      content: { text: messageText },
      options: { isAutomation: true, forceQueue: true, isFallback: true }
    });

    return {
      mode: 'queued',
      messageId: queued?.id ? `QUEUE_${queued.id}` : null,
      sentTo: targetJid,
      instanceUsed: instanceId,
      storeProfile
    };
  }

  /**
   * Garante ou recupera public_token/secret e busca voucher + entidades sem joins inválidos
   */
  async loadVoucherGraphByTokenOrId(tokenOrId) {
    const clean = String(tokenOrId || '').trim();
    if (!clean) throw new Error('Código do voucher não informado.');

    const { data: directMatch, error } = await supabase
      .from('vouchers')
      .select('*')
      .or(`id.eq.${clean},public_token.ilike.${clean}`)
      .limit(1)
      .maybeSingle();

    if (error || !directMatch) {
      throw new Error('Voucher não encontrado no sistema.');
    }

    let campanha = null;
    let empresa = null;
    let colaborador = null;

    if (directMatch.campanha_id) {
      const { data: cmp } = await supabase.from('voucher_campanhas').select('*').eq('id', directMatch.campanha_id).maybeSingle();
      campanha = cmp || null;
    }
    if (directMatch.empresa_id) {
      const { data: emp } = await supabase
        .from('voucher_empresas_parceiras')
        .select('id, tenant_id, razao_social, nome_fantasia, cnpj, contato_nome, contato_whatsapp, ativo')
        .eq('id', directMatch.empresa_id)
        .maybeSingle();
      empresa = emp || null;
    }
    if (directMatch.colaborador_id) {
      const { data: col } = await supabase.from('voucher_colaboradores').select('*').eq('id', directMatch.colaborador_id).maybeSingle();
      colaborador = col || null;
    }

    return { voucher: directMatch, campanha, empresa, colaborador };
  }

  /**
   * Passo 1 do Resgate via Terminal Caixa: valida JWT (se dinâmico), regras da campanha e reserva atômica no DB
   */
  async reserveVoucher(qrTokenOrPublicToken, atendenteId = 'CAIXA_PRINCIPAL', options = {}) {
    if (!qrTokenOrPublicToken) {
      throw new Error('Código ou QR Code do voucher é obrigatório.');
    }

    let input = String(qrTokenOrPublicToken).trim();
    let lookupKey = input;
    const isJwt = input.includes('.');

    if (isJwt) {
      const parts = input.split('.');
      if (parts.length !== 3) {
        throw new Error('QR Code dinâmico malformado.');
      }
      try {
        const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        lookupKey = decoded.vid || decoded.pt || '';
        if (!lookupKey) throw new Error('Payload ausente.');
      } catch (e) {
        throw new Error('QR Code inválido ou corrompido.');
      }
    }

    const { voucher, campanha, empresa } = await this.loadVoucherGraphByTokenOrId(lookupKey);

    if (options.expectedTenantId && voucher.tenant_id !== options.expectedTenantId) {
      throw new Error('Este voucher pertence a outro estabelecimento e não pode ser validado neste terminal.');
    }

    if (isJwt) {
      if (!voucher.qr_secret) {
        throw new Error('Voucher sem chave criptográfica de QR Code.');
      }
      const verification = this.verifyQrToken(input, voucher.qr_secret);
      if (!verification.valid) {
        throw new Error(verification.reason);
      }
    }

    const campaignCheck = this.validateCampaignRules(campanha);
    if (!campaignCheck.valid) {
      throw new Error(campaignCheck.reason);
    }

    const { data: rpcRes, error: rpcErr } = await supabase.rpc('voucher_scanner_reserve', {
      p_token: voucher.public_token,
      p_tenant_id: voucher.tenant_id,
      p_atendente: atendenteId,
      p_terminal_pin: options.terminalPin || null
    });

    if (rpcErr) {
      throw new Error(rpcErr.message);
    }
    if (!rpcRes?.success) {
      throw new Error(rpcRes?.error || 'Não foi possível validar o voucher.');
    }

    return {
      success: true,
      voucher: rpcRes.voucher,
      campanha,
      empresa,
      restaurante: rpcRes.restaurante,
      lockExpiresInSeconds: 300
    };
  }

  /**
   * Passo 2 do Resgate: Baixa definitiva atômica via RPC FOR UPDATE
   */
  async confirmRedeem(voucherIdOrToken, atendenteId = 'CAIXA_PRINCIPAL', options = {}) {
    if (!voucherIdOrToken) {
      throw new Error('Identificador ou token do voucher é obrigatório.');
    }

    let lookupKey = String(voucherIdOrToken).trim();
    if (lookupKey.includes('.')) {
      const parts = lookupKey.split('.');
      try {
        const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        lookupKey = decoded.vid || decoded.pt || lookupKey;
      } catch (e) {}
    }

    const { data: rpcRes, error: rpcErr } = await supabase.rpc('voucher_scanner_confirm', {
      p_voucher_id: lookupKey,
      p_tenant_id: options.expectedTenantId || null,
      p_atendente: atendenteId,
      p_terminal_pin: options.terminalPin || null
    });

    if (rpcErr) {
      throw new Error(rpcErr.message);
    }

    return {
      success: true,
      voucher: rpcRes.voucher,
      restaurante: rpcRes.restaurante,
      message: 'Voucher resgatado e baixado com sucesso!'
    };
  }

  /**
   * Envio de voucher ao WhatsApp do colaborador estritamente através da instância do tenant hospedeiro
   */
  async dispatchVoucherWhatsApp(voucherId, instanceId = null, portalContext = null) {
    const { voucher, campanha, empresa, colaborador } = await this.loadVoucherGraphByTokenOrId(voucherId);

    if (portalContext) {
      if (voucher.tenant_id !== portalContext.tenant_id || voucher.empresa_id !== portalContext.empresa_id) {
        throw new Error('Acesso negado: este voucher não pertence à empresa autenticada.');
      }
    }

    if (voucher.status === 'CANCELADO') {
      throw new Error('Voucher cancelado não pode ser enviado pelo WhatsApp.');
    }

    const phone = voucher.beneficiario_whatsapp || colaborador?.whatsapp;
    if (!phone) {
      await supabase.from('vouchers').update({
        mensagem_envio_status: 'SEM_TELEFONE',
        mensagem_envio_erro: 'WhatsApp do colaborador não informado.',
        updated_at: new Date().toISOString()
      }).eq('id', voucher.id);
      throw new Error('Número de WhatsApp do beneficiário não informado.');
    }

    const storeProfile = await this.resolveStoreProfile(voucher.tenant_id);
    const storeName = storeProfile?.name || 'Estabelecimento';
    const empresaNome = empresa?.nome_fantasia || empresa?.razao_social || voucher.empresa_nome || storeName;
    const beneficiario = voucher.beneficiario_nome || colaborador?.nome || 'Colaborador';
    const valorFormatado = Number(voucher.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const validadeStr = voucher.validade_fim ? new Date(voucher.validade_fim).toLocaleDateString('pt-BR') : 'Indeterminada';
    const voucherUrl = `${APP_PUBLIC_URL}/voucher/${voucher.public_token}`;

    const lines = [
      `🎟️ *Seu Voucher Digital Chegou!*`,
      ``,
      `Olá *${beneficiario}*!`,
      voucher.empresa_id
        ? `Você recebeu um benefício corporativo de *${empresaNome}* para utilizar em *${storeName}*.`
        : `Você recebeu um voucher especial de *${storeName}*.`,
      ``,
      `💰 *Crédito:* ${valorFormatado}`,
      `🔑 *Código:* \`${voucher.public_token}\``,
      campanha?.nome ? `🏷️ *Campanha:* ${campanha.nome}` : null,
      `⏳ *Válido até:* ${validadeStr}`,
      storeProfile?.endereco ? `📍 *Local:* ${storeProfile.endereco}` : null,
      storeProfile?.link_cardapio ? `🍔 *Cardápio:* ${storeProfile.link_cardapio}` : null,
      ``,
      `👉 *Abrir QR Code para apresentar no caixa:*`,
      voucherUrl
    ].filter(line => line !== null);

    const messageText = lines.join('\n');

    try {
      const sendInfo = await this.sendTextWithinTenant(
        voucher.tenant_id,
        phone,
        messageText,
        instanceId,
        campanha?.restaurante_instance_id || null
      );

      const newStatus = sendInfo.mode === 'direct' ? 'ENVIADO' : 'NA_FILA';
      await supabase.from('vouchers').update({
        mensagem_envio_status: newStatus,
        mensagem_enviada_em: new Date().toISOString(),
        mensagem_envio_erro: null,
        updated_at: new Date().toISOString()
      }).eq('id', voucher.id);

      const evId = `ev-${crypto.randomBytes(5).toString('hex')}`;
      await supabase.from('voucher_events').insert({
        id: evId,
        tenant_id: String(voucher.tenant_id),
        voucher_id: voucher.id,
        voucher_token: voucher.public_token,
        empresa_id: voucher.empresa_id || null,
        tipo_operacao: 'WHATSAPP_ENVIADO',
        valor: voucher.valor,
        beneficiario_nome: beneficiario,
        empresa_origem: empresaNome,
        status_anterior: voucher.status,
        status_novo: voucher.status,
        data_hora: new Date().toISOString(),
        usuario_responsavel: portalContext ? 'Portal B2B (WhatsApp)' : 'Estabelecimento (WhatsApp)',
        motivo: `Enviado via instância ${sendInfo.instanceUsed} (${sendInfo.mode}) para ${sendInfo.sentTo}`
      });

      return {
        success: true,
        voucherId: voucher.id,
        publicToken: voucher.public_token,
        messageId: sendInfo.messageId,
        mode: sendInfo.mode,
        sentTo: sendInfo.sentTo,
        instanceUsed: sendInfo.instanceUsed
      };
    } catch (sendErr) {
      await supabase.from('vouchers').update({
        mensagem_envio_status: 'ERRO',
        mensagem_envio_erro: sendErr.message,
        updated_at: new Date().toISOString()
      }).eq('id', voucher.id);
      throw sendErr;
    }
  }

  /**
   * Envia credenciais de acesso do Portal B2B diretamente para o responsável da empresa parceira
   */
  async dispatchPartnerAccessWhatsApp(tenantId, empresaId, plainPassword = null, instanceId = null, portalUrl = null) {
    const { data: empresa, error } = await supabase
      .from('voucher_empresas_parceiras')
      .select('id, tenant_id, razao_social, nome_fantasia, contato_nome, contato_whatsapp, login_usuario, saldo_credito, credito_mensal_ativo, valor_credito_mensal, desconto_compra_percent')
      .eq('id', empresaId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !empresa) {
      throw new Error('Empresa parceira não encontrada neste estabelecimento.');
    }

    if (!empresa.contato_whatsapp) {
      throw new Error('A empresa parceira não possui WhatsApp do responsável cadastrado.');
    }

    const storeProfile = await this.resolveStoreProfile(tenantId);
    const loginLink = portalUrl || `${APP_PUBLIC_URL}/voucher-empresa/login?empresa=${tenantId}`;
    const saldoStr = Number(empresa.saldo_credito || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const msgLines = [
      `🏢 *Portal Corporativo de Vouchers — ${storeProfile.name}*`,
      ``,
      `Olá *${empresa.contato_nome || empresa.nome_fantasia || empresa.razao_social}*!`,
      `Seus acessos ao Portal B2B de benefícios da parceria com *${storeProfile.name}* estão liberados:`,
      ``,
      `🔗 *Link do Portal:* ${loginLink}`,
      `👤 *Usuário:* \`${empresa.login_usuario || '(Não configurado)'}\``,
      plainPassword ? `🔐 *Senha:* \`${plainPassword}\`` : `🔐 _Utilize sua senha já cadastrada no portal._`,
      `💳 *Saldo Disponível:* ${saldoStr}`,
      empresa.credito_mensal_ativo && Number(empresa.valor_credito_mensal) > 0
        ? `🔄 *Crédito Mensal Recorrente:* ${Number(empresa.valor_credito_mensal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês`
        : null,
      Number(empresa.desconto_compra_percent || 0) > 0
        ? `🏷️ *Seu Desconto na Compra de Créditos:* ${Number(empresa.desconto_compra_percent)}% OFF`
        : null,
      ``,
      `_Pelo portal você cadastra colaboradores, gera vouchers e acompanha o extrato em tempo real._`
    ].filter(line => line !== null);

    const sendInfo = await this.sendTextWithinTenant(
      tenantId,
      empresa.contato_whatsapp,
      msgLines.join('\n'),
      instanceId,
      null
    );

    return {
      success: true,
      sentTo: sendInfo.sentTo,
      instanceUsed: sendInfo.instanceUsed,
      mode: sendInfo.mode
    };
  }
}

const voucherEngine = new VoucherEngine();
export default voucherEngine;
