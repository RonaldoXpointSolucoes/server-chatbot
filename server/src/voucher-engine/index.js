import crypto from 'crypto';
import { supabase } from '../supabase.js';
import sessionManager from '../session-manager/index.js';

/**
 * Motor de Gestão de Vouchers Digitais Corporativos
 * State Machine: CRIADO -> DISPONIBILIZADO -> ENVIADO -> VISUALIZADO -> VALIDADO -> UTILIZADO (ou CANCELADO/EXPIRADO)
 */
class VoucherEngine {
  /**
   * Gera um JWT leve assinado via HMAC-SHA256 para o QR Code dinâmico
   * @param {string} voucherId 
   * @param {string} publicToken 
   * @param {string} secret 
   * @param {number} ttlSeconds Padrão 30 segundos
   */
  generateQrToken(voucherId, publicToken, secret, ttlSeconds = 30) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
      vid: voucherId,
      pt: publicToken,
      iat: now,
      exp: now + ttlSeconds
    })).toString('base64url');

    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }

  /**
   * Valida o JWT do QR Code
   */
  verifyQrToken(token, secret) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return { valid: false, reason: 'Formato de token inválido' };

      const [headerB64, payloadB64, signature] = parts;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return { valid: false, reason: 'Assinatura criptográfica inválida ou violada' };
      }

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      const now = Math.floor(Date.now() / 1000);

      if (payload.exp && now > payload.exp) {
        return { valid: false, reason: 'QR Code expirado. Por favor, atualize a tela.' };
      }

      return { valid: true, payload };
    } catch (err) {
      return { valid: false, reason: `Falha na decodificação do token: ${err.message}` };
    }
  }

  /**
   * Valida regras de horário e dias permitidos da campanha
   */
  validateCampaignRules(campanha) {
    if (!campanha) return { valid: true };
    const now = new Date();

    // Validade global da campanha
    if (campanha.data_fim && new Date(campanha.data_fim) < now) {
      return { valid: false, reason: 'Campanha já foi encerrada.' };
    }
    if (campanha.data_inicio && new Date(campanha.data_inicio) > now) {
      return { valid: false, reason: 'Campanha ainda não foi iniciada.' };
    }

    // Horários permitidos
    const horarios = campanha.horarios_permitidos;
    if (horarios && typeof horarios === 'object') {
      const currentDay = now.getDay(); // 0 = Domingo, 1 = Segunda, etc.
      if (Array.isArray(horarios.dias) && !horarios.dias.includes(currentDay)) {
        return { valid: false, reason: 'Voucher não é válido para o dia de hoje.' };
      }

      const currentHour = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
      if (horarios.inicio && currentHour < horarios.inicio) {
        return { valid: false, reason: `Voucher válido apenas a partir das ${horarios.inicio}.` };
      }
      if (horarios.fim && currentHour > horarios.fim) {
        return { valid: false, reason: `Voucher expirou para o horário de hoje (limite: ${horarios.fim}).` };
      }
    }

    return { valid: true };
  }

  /**
   * Passo 1 do Resgate: Reserva com Lock de 2 minutos e validação de regras
   */
  async reserveVoucher(qrTokenOrPublicToken, atendenteId = 'BALCAO_1', reqInfo = {}) {
    // 1. Localizar o voucher por token público ou QR Token
    let publicToken = qrTokenOrPublicToken;
    let isJwt = false;

    if (qrTokenOrPublicToken.includes('.')) {
      isJwt = true;
      try {
        const parts = qrTokenOrPublicToken.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        publicToken = payload.pt;
      } catch (e) {
        throw new Error('QR Code inválido ou corrompido.');
      }
    }

    // 2. Buscar voucher completo no Supabase
    const { data: voucher, error: vErr } = await supabase
      .from('vouchers')
      .select('*, voucher_campanhas(*), voucher_empresas_parceiras(*)')
      .eq('public_token', publicToken)
      .maybeSingle();

    if (vErr || !voucher) {
      throw new Error('Voucher não encontrado no sistema.');
    }

    // 3. Se for JWT, validar a assinatura com o segredo do voucher
    if (isJwt) {
      const tokenVerification = this.verifyQrToken(qrTokenOrPublicToken, voucher.qr_secret);
      if (!tokenVerification.valid) {
        throw new Error(tokenVerification.reason);
      }
    }

    // 4. Checar status da State Machine
    if (voucher.status === 'UTILIZADO') {
      throw new Error(`Este voucher já foi UTILIZADO em ${new Date(voucher.data_resgate || voucher.updated_at).toLocaleString('pt-BR')}.`);
    }
    if (voucher.status === 'CANCELADO') {
      throw new Error('Este voucher foi CANCELADO pela empresa parceira.');
    }
    if (voucher.status === 'EXPIRADO' || new Date(voucher.validade_fim) < new Date()) {
      throw new Error('Este voucher está EXPIRADO.');
    }

    // Checar se já está com lock ativo por outro atendente
    const now = new Date();
    if (voucher.status === 'VALIDADO' && voucher.lock_until && new Date(voucher.lock_until) > now) {
      if (voucher.atendente_id && voucher.atendente_id !== atendenteId) {
        throw new Error(`Voucher em processo de validação no caixa/atendente: ${voucher.atendente_id}. Aguarde.`);
      }
    }

    // 5. Validar regras da campanha
    const campaignRuleCheck = this.validateCampaignRules(voucher.voucher_campanhas);
    if (!campaignRuleCheck.valid) {
      throw new Error(campaignRuleCheck.reason);
    }

    // 6. Aplicar Lock de 2 minutos e mudar status para VALIDADO
    const lockUntil = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    const { data: updatedVoucher, error: uErr } = await supabase
      .from('vouchers')
      .update({
        status: 'VALIDADO',
        lock_until: lockUntil,
        atendente_id: atendenteId,
        updated_at: new Date().toISOString()
      })
      .eq('id', voucher.id)
      .select()
      .single();

    if (uErr) {
      throw new Error(`Erro ao aplicar reserva no voucher: ${uErr.message}`);
    }

    // 7. Registrar evento de auditoria
    await supabase.from('voucher_events').insert({
      tenant_id: voucher.tenant_id,
      voucher_id: voucher.id,
      status_anterior: voucher.status,
      status_novo: 'VALIDADO',
      usuario_responsavel: atendenteId,
      ip: reqInfo.ip || null,
      dispositivo: reqInfo.userAgent || null,
      motivo: 'Reserva temporária de 2 minutos para confirmação no caixa',
      payload: { lock_until: lockUntil, atendente_id: atendenteId }
    });

    return {
      success: true,
      voucher: updatedVoucher,
      campanha: voucher.voucher_campanhas,
      empresa: voucher.voucher_empresas_parceiras,
      lockExpiresInSeconds: 120
    };
  }

  /**
   * Passo 2 do Resgate: Baixa Definitiva do Voucher
   */
  async confirmRedeem(voucherId, atendenteId = 'BALCAO_1', reqInfo = {}) {
    const { data: voucher, error: vErr } = await supabase
      .from('vouchers')
      .select('*')
      .eq('id', voucherId)
      .single();

    if (vErr || !voucher) {
      throw new Error('Voucher não encontrado.');
    }

    if (voucher.status === 'UTILIZADO') {
      throw new Error('Voucher já foi utilizado anteriormente.');
    }

    const now = new Date();
    // Validar se está dentro do lock ou se está validado
    if (voucher.status !== 'VALIDADO' && voucher.status !== 'VISUALIZADO' && voucher.status !== 'DISPONIBILIZADO' && voucher.status !== 'ENVIADO') {
      throw new Error(`Status inválido para baixa: ${voucher.status}`);
    }

    // Baixa definitiva
    const { data: finalVoucher, error: fErr } = await supabase
      .from('vouchers')
      .update({
        status: 'UTILIZADO',
        data_resgate: now.toISOString(),
        lock_until: null,
        atendente_id: atendenteId,
        updated_at: now.toISOString()
      })
      .eq('id', voucher.id)
      .select()
      .single();

    if (fErr) {
      throw new Error(`Erro ao finalizar resgate: ${fErr.message}`);
    }

    // Atualizar contagem no lote
    if (voucher.lote_id) {
      try {
        const { data: lote } = await supabase.from('voucher_lotes').select('quantidade_utilizados').eq('id', voucher.lote_id).single();
        if (lote) {
          await supabase.from('voucher_lotes').update({ quantidade_utilizados: (lote.quantidade_utilizados || 0) + 1 }).eq('id', voucher.lote_id);
        }
      } catch (e) {}
    }

    // Registrar evento de auditoria imutável
    await supabase.from('voucher_events').insert({
      tenant_id: voucher.tenant_id,
      voucher_id: voucher.id,
      status_anterior: voucher.status,
      status_novo: 'UTILIZADO',
      usuario_responsavel: atendenteId,
      ip: reqInfo.ip || null,
      dispositivo: reqInfo.userAgent || null,
      motivo: 'Baixa definitiva realizada com sucesso no caixa/atendimento',
      payload: { data_resgate: now.toISOString(), atendente_id: atendenteId }
    });

    return {
      success: true,
      voucher: finalVoucher,
      message: 'Voucher resgatado e utilizado com sucesso!'
    };
  }

  /**
   * Envio automático de voucher pelo WhatsApp via Baileys com fallback
   */
  async dispatchVoucherWhatsApp(voucherId, instanceId = null) {
    const { data: voucher, error } = await supabase
      .from('vouchers')
      .select('*, voucher_campanhas(*), voucher_colaboradores(*), voucher_empresas_parceiras(*)')
      .eq('id', voucherId)
      .single();

    if (error || !voucher) {
      throw new Error('Voucher não encontrado para disparo.');
    }

    const phone = voucher.beneficiario_whatsapp || voucher.voucher_colaboradores?.whatsapp;
    if (!phone) {
      throw new Error('Número de WhatsApp do beneficiário não informado.');
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const voucherUrl = `https://chat-boot-theta.vercel.app/voucher/${voucher.public_token}`;
    const valorFormatado = Number(voucher.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const messageText = `🎟️ *Seu Voucher Digital Corporativo Chegou!*\n\n` +
      `Olá *${voucher.beneficiario_nome || voucher.voucher_colaboradores?.nome || 'Colaborador'}*,\n` +
      `Você recebeu um voucher corporativo especial de *${voucher.voucher_empresas_parceiras?.razao_social || 'Empresa Parceira'}*.\n\n` +
      `💰 *Valor:* ${valorFormatado}\n` +
      `🏷️ *Campanha:* ${voucher.voucher_campanhas?.nome || 'Benefício Corporativo'}\n` +
      `⏳ *Validade:* ${new Date(voucher.validade_fim).toLocaleDateString('pt-BR')}\n\n` +
      `👉 *Acesse seu Voucher e QR Code Digital:*\n${voucherUrl}\n\n` +
      `_Apresente o QR Code no balcão do restaurante para resgatar seu benefício._`;

    // Localizar a instância do WhatsApp (especificada, do restaurante ou conectada do tenant)
    let targetInstanceId = instanceId || voucher.voucher_campanhas?.restaurante_instance_id;
    let targetSession = null;

    if (targetInstanceId) {
      targetSession = sessionManager.getSession(targetInstanceId);
    }

    // Se não encontrou, busca a primeira sessão ativa
    if (!targetSession || targetSession.status !== 'connected') {
      const allSessions = sessionManager.getAllSessions();
      const activeOne = allSessions.find(s => s.status === 'connected');
      if (activeOne) {
        targetSession = sessionManager.getSession(activeOne.id);
        targetInstanceId = activeOne.id;
      }
    }

    if (!targetSession || !targetSession.socket) {
      throw new Error('Nenhuma instância do WhatsApp conectada no momento para realizar o disparo.');
    }

    const jid = `${cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone}@s.whatsapp.net`;
    const sendResult = await targetSession.socket.sendMessage(jid, { text: messageText });

    // Atualizar status para ENVIADO
    await supabase.from('vouchers').update({
      status: voucher.status === 'CRIADO' || voucher.status === 'DISPONIBILIZADO' ? 'ENVIADO' : voucher.status,
      mensagem_envio_status: 'ENVIADO',
      updated_at: new Date().toISOString()
    }).eq('id', voucher.id);

    return {
      success: true,
      messageId: sendResult.key?.id,
      sentTo: jid,
      instanceUsed: targetInstanceId
    };
  }
}

const voucherEngine = new VoucherEngine();
export default voucherEngine;
