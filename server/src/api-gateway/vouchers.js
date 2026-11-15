import express from 'express';
import crypto from 'crypto';
import voucherEngine from '../voucher-engine/index.js';
import { supabase } from '../supabase.js';

const router = express.Router();

const SUPER_ADMIN_EMAILS = new Set([
  'ronaldo.xpointsolucoes@gmail.com',
  'xpointsolucoes@gmail.com'
]);

/**
 * Verifica se o usuário autenticado via Supabase JWT ou API Key pertence ao tenant alvo
 */
async function verifyMerchantAccess(req, targetTenantId) {
  if (!targetTenantId) {
    throw Object.assign(new Error('tenantId é obrigatório.'), { status: 400 });
  }

  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (bearerToken) {
    const { data, error } = await supabase.auth.getUser(bearerToken);
    if (error || !data?.user) {
      throw Object.assign(new Error('Sessão expirada ou token inválido.'), { status: 401 });
    }

    const user = data.user;
    const userEmail = String(user.email || '').trim().toLowerCase();

    if (SUPER_ADMIN_EMAILS.has(userEmail)) {
      return { user, authMethod: 'jwt-superadmin' };
    }

    const { data: comp } = await supabase
      .from('companies')
      .select('id, email, economic_group_id, settings')
      .eq('id', targetTenantId)
      .maybeSingle();

    if (comp) {
      const allowedGoogle = Array.isArray(comp.settings?.allowed_google_emails)
        ? comp.settings.allowed_google_emails.map(e => String(e).trim().toLowerCase())
        : [];
      if (
        comp.id === user.id ||
        (userEmail && String(comp.email || '').trim().toLowerCase() === userEmail) ||
        (userEmail && allowedGoogle.includes(userEmail))
      ) {
        return { user, authMethod: 'jwt-company' };
      }

      if (comp.economic_group_id) {
        const { data: ownGroupComp } = await supabase
          .from('companies')
          .select('id')
          .eq('economic_group_id', comp.economic_group_id)
          .or(`id.eq.${user.id},email.ilike.${userEmail || '__none__'}`)
          .limit(1)
          .maybeSingle();
        if (ownGroupComp) {
          return { user, authMethod: 'jwt-economic-group' };
        }
      }
    }

    const { data: tuRows } = await supabase
      .from('tenant_users')
      .select('tenant_id, allowed_companies, user_id, email')
      .or(`user_id.eq.${user.id},email.ilike.${userEmail || '__none__'}`);

    const hasTuAccess = (tuRows || []).some(tu => {
      if (tu.tenant_id === targetTenantId) return true;
      return Array.isArray(tu.allowed_companies) && tu.allowed_companies.includes(targetTenantId);
    });

    if (hasTuAccess) {
      return { user, authMethod: 'jwt-tenant-user' };
    }

    throw Object.assign(new Error('Você não tem permissão para operar neste estabelecimento.'), { status: 403 });
  }

  const apiKey = String(req.headers['x-api-key'] || '').trim();
  if (apiKey) {
    if (process.env.CHATBOOT_API_KEY && apiKey === process.env.CHATBOOT_API_KEY) {
      return { authMethod: 'server-api-key' };
    }
    const { data: comp } = await supabase
      .from('companies')
      .select('global_api_key')
      .eq('id', targetTenantId)
      .maybeSingle();
    if (comp?.global_api_key && apiKey === comp.global_api_key) {
      return { authMethod: 'tenant-api-key' };
    }
  }

  throw Object.assign(new Error('Autenticação obrigatória para esta operação.'), { status: 401 });
}

/**
 * Valida sessão do Portal B2B via token opaco armazenado como SHA-256 em voucher_portal_sessions
 */
async function verifyPortalSession(req) {
  const portalToken = String(req.headers['x-portal-token'] || req.body?.portalToken || '').trim();
  if (!portalToken) {
    throw Object.assign(new Error('Token de sessão do Portal B2B ausente.'), { status: 401 });
  }

  const tokenHash = crypto.createHash('sha256').update(portalToken).digest('hex');
  const { data: sess, error } = await supabase
    .from('voucher_portal_sessions')
    .select('empresa_id, tenant_id, expires_at')
    .eq('token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !sess) {
    throw Object.assign(new Error('Sessão do Portal B2B inválida ou expirada.'), { status: 401 });
  }

  const { data: emp } = await supabase
    .from('voucher_empresas_parceiras')
    .select('id, tenant_id, ativo')
    .eq('id', sess.empresa_id)
    .eq('tenant_id', sess.tenant_id)
    .maybeSingle();

  if (!emp || emp.ativo === false) {
    throw Object.assign(new Error('Empresa parceira suspensa ou inativa.'), { status: 403 });
  }

  return sess;
}

/**
 * Verifica autorização para Terminal Caixa / Scanner (JWT do tenant OU PIN do caixa configurado na loja)
 */
async function verifyScannerAuth(req, voucherTenantId, terminalPin) {
  if (req.headers.authorization || req.headers['x-api-key']) {
    return verifyMerchantAccess(req, voucherTenantId);
  }

  if (terminalPin) {
    const { data: comp } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', voucherTenantId)
      .maybeSingle();
    const cfgPin = String(comp?.settings?.voucher_terminal_pin || '').trim();
    if (cfgPin && cfgPin === String(terminalPin).trim()) {
      return { authMethod: 'terminal-pin' };
    }
  }

  throw Object.assign(
    new Error('Terminal Caixa não autorizado. Faça login no sistema ou informe o PIN da loja.'),
    { status: 401 }
  );
}

// 1. Consulta pública de Voucher + QR Code dinâmico inicial
router.get('/public/:publicToken', async (req, res) => {
  try {
    const { publicToken } = req.params;
    const { data: pubRes, error: rpcErr } = await supabase.rpc('voucher_get_public', {
      p_token: publicToken
    });

    if (rpcErr || !pubRes?.success || !pubRes.voucher) {
      return res.status(404).json({ error: pubRes?.error || 'Voucher não encontrado ou inválido.' });
    }

    const { data: secRow } = await supabase
      .from('vouchers')
      .select('id, public_token, qr_secret, status')
      .eq('id', pubRes.voucher.id)
      .single();

    let qrJwt = null;
    if (secRow && !['RESGATADO', 'UTILIZADO', 'CANCELADO', 'EXPIRADO'].includes(secRow.status)) {
      let secret = secRow.qr_secret;
      if (!secret) {
        secret = crypto.randomBytes(32).toString('hex');
        await supabase.from('vouchers').update({ qr_secret: secret }).eq('id', secRow.id);
      }
      qrJwt = voucherEngine.generateQrToken(secRow.id, secRow.public_token, secret, 30);
    }

    return res.json({
      success: true,
      voucher: pubRes.voucher,
      campanha: pubRes.campanha,
      restaurante: pubRes.restaurante,
      qrJwt,
      expiresInSeconds: 30
    });
  } catch (err) {
    console.error('[Vouchers API] Erro ao consultar voucher público:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 2. Renovação dinâmica do QR Code JWT (POST e GET alias usados pelo VoucherViewer)
async function handleRenewQr(req, res) {
  try {
    const publicToken = String(req.params.publicToken || '').trim();
    const { data: voucher, error } = await supabase
      .from('vouchers')
      .select('id, public_token, qr_secret, status, validade_fim')
      .or(`public_token.ilike.${publicToken},id.eq.${publicToken}`)
      .limit(1)
      .maybeSingle();

    if (error || !voucher) {
      return res.status(404).json({ error: 'Voucher não encontrado.' });
    }

    if (['RESGATADO', 'UTILIZADO', 'CANCELADO', 'EXPIRADO'].includes(voucher.status)) {
      return res.status(400).json({ error: `Voucher está ${voucher.status}. QR dinâmico encerrado.` });
    }

    let secret = voucher.qr_secret;
    if (!secret) {
      secret = crypto.randomBytes(32).toString('hex');
      await supabase.from('vouchers').update({ qr_secret: secret }).eq('id', voucher.id);
    }

    const qrJwt = voucherEngine.generateQrToken(voucher.id, voucher.public_token, secret, 30);
    return res.json({
      success: true,
      qrJwt,
      token: qrJwt,
      expiresInSeconds: 30
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

router.post('/public/:publicToken/token', handleRenewQr);
router.get('/renew-qr/:publicToken', handleRenewQr);

// 3. Passo 1 do Resgate: Reserva atômica com verificação HMAC (quando JWT) e autenticação do terminal
router.post('/redeem/reserve', async (req, res) => {
  try {
    const { token, atendenteId = 'CAIXA_PRINCIPAL', tenantId = null, terminalPin = null } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token do voucher ou QR Code é obrigatório.' });
    }

    let lookupKey = String(token).trim();
    if (lookupKey.includes('.')) {
      const parts = lookupKey.split('.');
      try {
        const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        lookupKey = decoded.vid || decoded.pt || lookupKey;
      } catch (e) {
        return res.status(400).json({ error: 'QR Code dinâmico inválido.' });
      }
    }

    const { voucher } = await voucherEngine.loadVoucherGraphByTokenOrId(lookupKey);
    await verifyScannerAuth(req, voucher.tenant_id, terminalPin);

    const result = await voucherEngine.reserveVoucher(token, atendenteId, {
      expectedTenantId: tenantId || voucher.tenant_id,
      terminalPin: terminalPin || null
    });
    return res.json(result);
  } catch (err) {
    const status = err.status || 400;
    console.error('[Vouchers API] Falha na reserva do voucher:', err.message);
    return res.status(status).json({ error: err.message });
  }
});

// 4. Passo 2 do Resgate: Baixa Definitiva Atômica
router.post('/redeem/confirm', async (req, res) => {
  try {
    const { voucherId, token, publicToken, id, atendenteId = 'CAIXA_PRINCIPAL', tenantId = null, terminalPin = null } = req.body;
    const effectiveVoucherId = voucherId || token || publicToken || id;
    if (!effectiveVoucherId) {
      return res.status(400).json({ error: 'voucherId, token ou id é obrigatório para confirmação da baixa.' });
    }

    let lookupKey = String(effectiveVoucherId).trim();
    if (lookupKey.includes('.')) {
      try {
        const decoded = JSON.parse(Buffer.from(lookupKey.split('.')[1], 'base64url').toString('utf8'));
        lookupKey = decoded.vid || decoded.pt || lookupKey;
      } catch (e) {}
    }

    const { voucher } = await voucherEngine.loadVoucherGraphByTokenOrId(lookupKey);
    await verifyScannerAuth(req, voucher.tenant_id, terminalPin);

    const result = await voucherEngine.confirmRedeem(effectiveVoucherId, atendenteId, {
      expectedTenantId: tenantId || voucher.tenant_id,
      terminalPin: terminalPin || null
    });
    return res.json(result);
  } catch (err) {
    const status = err.status || 400;
    console.error('[Vouchers API] Falha na confirmação do resgate:', err.message);
    return res.status(status).json({ error: err.message });
  }
});

// 5. Envio pelo Portal B2B (autenticado por x-portal-token, dispara pela instância da loja host!)
router.post('/portal/send-whatsapp', async (req, res) => {
  try {
    const portalSession = await verifyPortalSession(req);
    const { voucherId, voucherIds } = req.body;
    const ids = Array.isArray(voucherIds) ? voucherIds : (voucherId ? [voucherId] : []);

    if (ids.length === 0 || ids.length > 100) {
      return res.status(400).json({ error: 'Informe entre 1 e 100 vouchers para envio.' });
    }

    const results = [];
    for (let i = 0; i < ids.length; i++) {
      try {
        const r = await voucherEngine.dispatchVoucherWhatsApp(ids[i], null, portalSession);
        results.push({ id: ids[i], success: true, ...r });
      } catch (e) {
        results.push({ id: ids[i], success: false, error: e.message });
      }
      if (i < ids.length - 1) {
        await new Promise(r => setTimeout(r, 900));
      }
    }

    const sentCount = results.filter(r => r.success).length;
    return res.json({
      success: sentCount > 0,
      sentCount,
      failedCount: results.length - sentCount,
      results
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// 6. Disparo de WhatsApp unitário pelo Painel Admin (estritamente autenticado no tenant do voucher)
router.post('/:id/send-whatsapp', async (req, res) => {
  try {
    const { id } = req.params;
    const { instanceId } = req.body || {};

    const { voucher } = await voucherEngine.loadVoucherGraphByTokenOrId(id);
    await verifyMerchantAccess(req, voucher.tenant_id);

    const result = await voucherEngine.dispatchVoucherWhatsApp(voucher.id, instanceId || null, null);
    return res.json(result);
  } catch (err) {
    console.error('[Vouchers API] Erro ao disparar WhatsApp:', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// 7. Disparo em lote pelo Painel Admin (estritamente no mesmo tenant, com throttling anti-ban)
router.post('/batch/send-whatsapp', async (req, res) => {
  try {
    const { tenantId, voucherIds = [], instanceId = null } = req.body || {};
    await verifyMerchantAccess(req, tenantId);

    if (!Array.isArray(voucherIds) || voucherIds.length === 0 || voucherIds.length > 200) {
      return res.status(400).json({ error: 'Informe entre 1 e 200 voucherIds para disparo em lote.' });
    }

    const results = [];
    for (let i = 0; i < voucherIds.length; i++) {
      const vid = voucherIds[i];
      try {
        const { voucher } = await voucherEngine.loadVoucherGraphByTokenOrId(vid);
        if (voucher.tenant_id !== tenantId) {
          throw new Error('Voucher pertence a outra loja.');
        }
        const r = await voucherEngine.dispatchVoucherWhatsApp(voucher.id, instanceId, null);
        results.push({ id: vid, success: true, ...r });
      } catch (e) {
        results.push({ id: vid, success: false, error: e.message });
      }
      if (i < voucherIds.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const sentCount = results.filter(r => r.success).length;
    return res.json({
      success: sentCount > 0,
      sentCount,
      failedCount: results.length - sentCount,
      results
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// 8. Envio das credenciais do Portal B2B ao WhatsApp da empresa parceira
router.post('/tenant/send-access-whatsapp', async (req, res) => {
  try {
    const { tenantId, empresaId, plainPassword = null, instanceId = null, portalUrl = null } = req.body || {};
    await verifyMerchantAccess(req, tenantId);

    if (!empresaId) {
      return res.status(400).json({ error: 'empresaId é obrigatório.' });
    }

    const result = await voucherEngine.dispatchPartnerAccessWhatsApp(
      tenantId,
      empresaId,
      plainPassword,
      instanceId,
      portalUrl
    );
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// 9. Geração em lote delegada à RPC atômica (substitui antiga tabela inexistente voucher_lotes)
router.post('/generate-batch', async (req, res) => {
  try {
    const {
      tenantId,
      campanhaId = null,
      empresaId = null,
      quantidade = 1,
      valor = 50.00,
      validadeFim,
      observacoes = null,
      items = null
    } = req.body || {};

    await verifyMerchantAccess(req, tenantId);

    if (!validadeFim) {
      return res.status(400).json({ error: 'validadeFim é obrigatório.' });
    }

    const batchItems = Array.isArray(items) && items.length > 0
      ? items
      : Array.from({ length: Math.min(Math.max(Number(quantidade) || 1, 1), 200) }, (_, idx) => ({
          beneficiario_nome: `Beneficiário Lote #${idx + 1}`,
          valor: Number(valor)
        }));

    const { data, error } = await supabase.rpc('voucher_merchant_issue_vouchers', {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId || null,
      p_campanha_id: campanhaId || null,
      p_items: batchItems,
      p_validade_fim: validadeFim,
      p_observacoes: observacoes || 'Lote gerado via API Gateway',
      p_usuario_responsavel: 'API Gateway'
    });

    if (error) throw error;

    return res.json({
      success: true,
      totalGerados: data?.vouchers?.length || 0,
      vouchers: data?.vouchers || []
    });
  } catch (err) {
    console.error('[Vouchers API] Erro ao gerar lote:', err);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
