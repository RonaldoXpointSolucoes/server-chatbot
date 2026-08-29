import express from 'express';
import crypto from 'crypto';
import voucherEngine from '../voucher-engine/index.js';
import { supabase } from '../supabase.js';

const router = express.Router();

// 1. Consulta pública de Voucher e geração de JWT de QR Code
router.get('/public/:publicToken', async (req, res) => {
  try {
    const { publicToken } = req.params;
    const { data: voucher, error } = await supabase
      .from('vouchers')
      .select('*, voucher_campanhas(*), voucher_empresas_parceiras(*), voucher_colaboradores(*)')
      .eq('public_token', publicToken)
      .maybeSingle();

    if (error || !voucher) {
      return res.status(404).json({ error: 'Voucher não encontrado ou inválido.' });
    }

    // Se estiver CRIADO/DISPONIBILIZADO/ENVIADO, marcar como VISUALIZADO
    if (voucher.status === 'CRIADO' || voucher.status === 'DISPONIBILIZADO' || voucher.status === 'ENVIADO') {
      await supabase.from('vouchers').update({
        status: 'VISUALIZADO',
        updated_at: new Date().toISOString()
      }).eq('id', voucher.id);
      voucher.status = 'VISUALIZADO';
    }

    // Gera o token JWT para o QR Code (TTL 30s)
    const qrJwt = voucherEngine.generateQrToken(voucher.id, voucher.public_token, voucher.qr_secret, 30);

    return res.json({
      success: true,
      voucher: {
        id: voucher.id,
        public_token: voucher.public_token,
        status: voucher.status,
        valor: voucher.valor,
        beneficiario_nome: voucher.beneficiario_nome || voucher.voucher_colaboradores?.nome,
        validade_fim: voucher.validade_fim,
        campanha_nome: voucher.voucher_campanhas?.nome,
        campanha_descricao: voucher.voucher_campanhas?.descricao,
        tipo_desconto: voucher.voucher_campanhas?.tipo_desconto,
        empresa_razao_social: voucher.voucher_empresas_parceiras?.razao_social,
        empresa_nome_fantasia: voucher.voucher_empresas_parceiras?.nome_fantasia,
        horarios_permitidos: voucher.voucher_campanhas?.horarios_permitidos,
        data_resgate: voucher.data_resgate
      },
      qrJwt,
      expiresInSeconds: 30
    });
  } catch (err) {
    console.error('[Vouchers API] Erro ao consultar voucher público:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 2. Renovação do JWT do QR Code (chamado a cada 30 segundos pelo frontend do colaborador)
router.post('/public/:publicToken/token', async (req, res) => {
  try {
    const { publicToken } = req.params;
    const { data: voucher, error } = await supabase
      .from('vouchers')
      .select('id, public_token, qr_secret, status, validade_fim')
      .eq('public_token', publicToken)
      .single();

    if (error || !voucher) {
      return res.status(404).json({ error: 'Voucher não encontrado.' });
    }

    if (voucher.status === 'UTILIZADO' || voucher.status === 'CANCELADO' || voucher.status === 'EXPIRADO') {
      return res.status(400).json({ error: `Voucher está ${voucher.status}. Não é possível gerar novo QR Code.` });
    }

    const qrJwt = voucherEngine.generateQrToken(voucher.id, voucher.public_token, voucher.qr_secret, 30);
    return res.json({
      success: true,
      qrJwt,
      expiresInSeconds: 30
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. Passo 1 do Resgate: Reserva com Lock de 2 minutos (Antifraude)
router.post('/redeem/reserve', async (req, res) => {
  try {
    const { token, atendenteId = 'CAIXA_PRINCIPAL' } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token do voucher ou QR Code é obrigatório.' });
    }

    const reqInfo = {
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      userAgent: req.headers['user-agent'] || null
    };

    const result = await voucherEngine.reserveVoucher(token, atendenteId, reqInfo);
    return res.json(result);
  } catch (err) {
    console.error('[Vouchers API] Falha na reserva do voucher:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// 4. Passo 2 do Resgate: Baixa Definitiva do Voucher
router.post('/redeem/confirm', async (req, res) => {
  try {
    const { voucherId, atendenteId = 'CAIXA_PRINCIPAL' } = req.body;
    if (!voucherId) {
      return res.status(400).json({ error: 'voucherId é obrigatório para confirmação da baixa.' });
    }

    const reqInfo = {
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      userAgent: req.headers['user-agent'] || null
    };

    const result = await voucherEngine.confirmRedeem(voucherId, atendenteId, reqInfo);
    return res.json(result);
  } catch (err) {
    console.error('[Vouchers API] Falha na confirmação do resgate:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// 5. Disparo de WhatsApp do Voucher via Baileys
router.post('/:id/send-whatsapp', async (req, res) => {
  try {
    const { id } = req.params;
    const { instanceId } = req.body;

    const result = await voucherEngine.dispatchVoucherWhatsApp(id, instanceId);
    return res.json(result);
  } catch (err) {
    console.error('[Vouchers API] Erro ao disparar WhatsApp:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 6. Geração de Lote de Vouchers para Campanhas
router.post('/generate-batch', async (req, res) => {
  try {
    const {
      tenantId,
      campanhaId,
      empresaId,
      nomeLote,
      quantidade = 10,
      valor = 50.00,
      validadeFim,
      colaboradoresIds = []
    } = req.body;

    if (!tenantId || !campanhaId || !validadeFim) {
      return res.status(400).json({ error: 'tenantId, campanhaId e validadeFim são obrigatórios.' });
    }

    // 1. Criar o lote
    const { data: lote, error: lErr } = await supabase
      .from('voucher_lotes')
      .insert({
        tenant_id: tenantId,
        campanha_id: campanhaId,
        empresa_id: empresaId || null,
        nome: nomeLote || `Lote ${new Date().toLocaleDateString('pt-BR')}`,
        quantidade_total: colaboradoresIds.length > 0 ? colaboradoresIds.length : quantidade,
        quantidade_utilizados: 0
      })
      .select()
      .single();

    if (lErr) throw lErr;

    // 2. Gerar registros de vouchers
    const vouchersToInsert = [];
    const totalToGenerate = colaboradoresIds.length > 0 ? colaboradoresIds.length : quantidade;

    for (let i = 0; i < totalToGenerate; i++) {
      const publicToken = 'VCH-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const qrSecret = crypto.randomBytes(32).toString('hex');
      const colabId = colaboradoresIds[i] || null;

      vouchersToInsert.push({
        tenant_id: tenantId,
        lote_id: lote.id,
        campanha_id: campanhaId,
        empresa_id: empresaId || null,
        colaborador_id: colabId,
        public_token: publicToken,
        qr_secret: qrSecret,
        status: 'CRIADO',
        valor: valor,
        validade_fim: validadeFim
      });
    }

    const { data: createdVouchers, error: vErr } = await supabase
      .from('vouchers')
      .insert(vouchersToInsert)
      .select();

    if (vErr) throw vErr;

    return res.json({
      success: true,
      lote,
      totalGerados: createdVouchers.length,
      vouchers: createdVouchers
    });
  } catch (err) {
    console.error('[Vouchers API] Erro ao gerar lote:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
