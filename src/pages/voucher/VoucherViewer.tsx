import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import {
  Ticket,
  CheckCircle2,
  Clock,
  Building2,
  User,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  Share2,
  Copy,
  Check,
  Zap,
  Calendar,
  Sparkles,
  Loader2,
  Info,
  Ban,
  Printer,
  Scissors,
  Award,
  ExternalLink,
  MapPin,
  Utensils,
  Compass,
  Store
} from 'lucide-react';
import { supabase } from '../../services/supabase';

const ENGINE_URL = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';
const QR_INTERVAL = 30; // Segundos para auto-renovação do JWT

interface RestaurantInfo {
  nome: string;
  endereco: string;
  cardapioUrl?: string;
  instagram?: string;
  googleMapsUrl?: string;
}

export default function VoucherViewer() {
  const { token } = useParams<{ token: string }>();
  const [voucherData, setVoucherData] = useState<any>(null);
  const [restaurantInfo, setRestaurantInfo] = useState<RestaurantInfo>({
    nome: 'BURGUER PLUS',
    endereco: 'Praça Miguel Ortega, 340 - Parque Assunção - Taboão da Serra/SP',
    cardapioUrl: 'https://www.burguerplus.com.br',
    instagram: 'https://instagram.com/burguerplus',
    googleMapsUrl: 'https://maps.google.com/?q=Praça+Miguel+Ortega+340+Taboão+da+Serra+SP'
  });

  const [qrJwt, setQrJwt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(QR_INTERVAL);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isRenewing, setIsRenewing] = useState<boolean>(false);
  const [isDetached, setIsDetached] = useState<boolean>(false); // Estado interativo de destaque do canhoto

  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper para resolver dados institucionais do restaurante (onde consumir o voucher)
  const fetchRestaurantInfo = async (tenantId?: string) => {
    const defaultInfo: RestaurantInfo = {
      nome: 'BURGUER PLUS',
      endereco: 'Praça Miguel Ortega, 340 - Parque Assunção - Taboão da Serra/SP',
      cardapioUrl: 'https://www.burguerplus.com.br',
      instagram: 'https://instagram.com/burguerplus',
      googleMapsUrl: 'https://maps.google.com/?q=Praça+Miguel+Ortega+340+Taboão+da+Serra+SP'
    };

    try {
      const tId = tenantId || '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

      // 1. Tenta recuperar do localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('account_settings_') || key.startsWith('tenant_settings_'))) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed) {
              const resName = parsed.nome_ia || parsed.nome_empresa || parsed.businessName || defaultInfo.nome;
              const resEnd = parsed.endereco || defaultInfo.endereco;
              const resCardapio = parsed.link_cardapio || defaultInfo.cardapioUrl;
              const resInsta = parsed.instagram || defaultInfo.instagram;
              const resMaps = parsed.google_maps || `https://maps.google.com/?q=${encodeURIComponent(resEnd)}`;
              setRestaurantInfo({
                nome: resName,
                endereco: resEnd,
                cardapioUrl: resCardapio,
                instagram: resInsta,
                googleMapsUrl: resMaps
              });
              return;
            }
          }
        }
      }

      // 2. Busca do Supabase
      const { data: comp } = await supabase
        .from('companies')
        .select('name, settings')
        .eq('id', tId)
        .maybeSingle();

      if (comp) {
        const s = comp.settings || {};
        const resName = comp.name || s.nome_ia || s.nome_empresa || s.businessName || defaultInfo.nome;
        const resEnd = s.endereco || (s.street ? `${s.street}, ${s.number || ''} - ${s.neighborhood || ''} - ${s.city || ''}/${s.state || ''}` : defaultInfo.endereco);
        const resCardapio = s.link_cardapio || defaultInfo.cardapioUrl;
        const resInsta = s.instagram || defaultInfo.instagram;
        const resMaps = s.google_maps || `https://maps.google.com/?q=${encodeURIComponent(resEnd)}`;

        setRestaurantInfo({
          nome: resName,
          endereco: resEnd,
          cardapioUrl: resCardapio,
          instagram: resInsta,
          googleMapsUrl: resMaps
        });
      }
    } catch (e) {
      console.warn('[VoucherViewer] Erro ao carregar info do restaurante:', e);
    }
  };

  // Helper para resolver o nome real da empresa parceira (concedente do benefício)
  const resolveCompanyName = (voucher: any): { razaoSocial: string; nomeFantasia?: string } => {
    let razao = voucher.voucher_empresas_parceiras?.razao_social || voucher.empresa_razao_social || voucher.empresa_nome || '';
    let fantasia = voucher.voucher_empresas_parceiras?.nome_fantasia || voucher.empresa_nome_fantasia || '';

    if (!razao || razao === 'Empresa Parceira' || razao === 'Cliente Avulso (Sem Vínculo B2B)') {
      try {
        const empId = voucher.empresa_id;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('voucher_companies_')) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const list = JSON.parse(raw);
              if (Array.isArray(list)) {
                const found = empId ? list.find((c: any) => c.id === empId) : list[0];
                if (found) {
                  razao = found.razao_social || razao;
                  fantasia = found.nome_fantasia || fantasia;
                  break;
                }
              }
            }
          }
        }
      } catch (_) {}
    }

    return {
      razaoSocial: razao || 'TERRAS GONÇALVES SOCIEDADE DE ADVOGADOS',
      nomeFantasia: fantasia || undefined
    };
  };

  // 1. Carrega dados do voucher com prioridade absoluta para o Supabase em tempo real
  const loadVoucher = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);

      const cleanToken = token.trim();

      // --- CAMADA 1: Supabase em Tempo Real (Fonte da Verdade) ---
      try {
        const { data, error: dbErr } = await supabase
          .from('vouchers')
          .select('*')
          .or(`public_token.ilike.${cleanToken},id.eq.${cleanToken}`)
          .maybeSingle();

        if (!dbErr && data) {
          const comp = resolveCompanyName(data);
          const formatted = {
            id: data.id,
            tenant_id: data.tenant_id,
            public_token: data.public_token,
            status: data.status || 'CRIADO',
            valor: Number(data.valor) || 50.0,
            beneficiario_nome: data.beneficiario_nome || 'Colaborador / Convidado',
            beneficiario_whatsapp: data.beneficiario_whatsapp || '',
            validade_fim: data.validade_fim,
            campanha_nome: data.campanha_nome || 'Presente Corporativo Especial',
            campanha_descricao: data.observacoes || 'Benefício exclusivo BURGUER PLUS',
            empresa_razao_social: data.empresa_razao_social || data.empresa_nome || comp.razaoSocial,
            empresa_nome_fantasia: comp.nomeFantasia,
            observacoes: data.observacoes,
            data_resgate: data.data_resgate,
            atendente_id: data.atendente_id,
            created_at: data.created_at
          };
          setVoucherData(formatted);
          setQrJwt(data.public_token);
          setCountdown(QR_INTERVAL);
          fetchRestaurantInfo(data.tenant_id);
          setLoading(false);

          // Atualiza cache local sincronizado
          try {
            localStorage.setItem(`voucher_token_${cleanToken}`, JSON.stringify(formatted));
            localStorage.setItem(`voucher_token_${cleanToken.toLowerCase()}`, JSON.stringify(formatted));
          } catch (_) {}
          return;
        }
      } catch (supabaseErr) {
        console.warn('[VoucherViewer] Erro ao consultar Supabase em nuvem:', supabaseErr);
      }

      // --- CAMADA 2: Backend REST Engine ---
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(`${ENGINE_URL}/api/v1/vouchers/public/${cleanToken}?_t=${Date.now()}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          if (json.success && json.voucher) {
            const comp = resolveCompanyName(json.voucher);
            const formatted = {
              ...json.voucher,
              empresa_razao_social: comp.razaoSocial,
              empresa_nome_fantasia: comp.nomeFantasia
            };
            setVoucherData(formatted);
            setQrJwt(json.qrJwt || json.voucher.public_token);
            setCountdown(json.expiresInSeconds || QR_INTERVAL);
            fetchRestaurantInfo(json.voucher.tenant_id);
            setLoading(false);
            localStorage.setItem(`voucher_token_${cleanToken}`, JSON.stringify(formatted));
            return;
          }
        }
      } catch (apiErr) {
        console.warn('[VoucherViewer] Backend REST indisponível:', apiErr);
      }

      // --- CAMADA 3: LocalStorage (Fallback offline) ---
      try {
        const directCached = localStorage.getItem(`voucher_token_${cleanToken}`) || localStorage.getItem(`voucher_token_${cleanToken.toLowerCase()}`);
        if (directCached) {
          const v = JSON.parse(directCached);
          if (v && (v.public_token === cleanToken || v.id === cleanToken || (v.public_token || '').toLowerCase() === cleanToken.toLowerCase())) {
            const comp = resolveCompanyName(v);
            setVoucherData({
              ...v,
              public_token: v.public_token || cleanToken,
              empresa_razao_social: comp.razaoSocial,
              empresa_nome_fantasia: comp.nomeFantasia,
              valor: Number(v.valor) || 50.0
            });
            setQrJwt(v.public_token || cleanToken);
            setCountdown(QR_INTERVAL);
            fetchRestaurantInfo(v.tenant_id);
            setLoading(false);
            return;
          }
        }

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('voucher_items_') || key.startsWith('vouchers_'))) {
            const raw = localStorage.getItem(key);
            if (raw) {
              const list = JSON.parse(raw);
              if (Array.isArray(list)) {
                const found = list.find((item: any) => 
                  (item.public_token || '').toLowerCase() === cleanToken.toLowerCase() || 
                  (item.id || '').toLowerCase() === cleanToken.toLowerCase()
                );
                if (found) {
                  const comp = resolveCompanyName(found);
                  const formatted = {
                    ...found,
                    public_token: found.public_token || cleanToken,
                    empresa_razao_social: comp.razaoSocial,
                    empresa_nome_fantasia: comp.nomeFantasia,
                    valor: Number(found.valor) || 50.0
                  };
                  setVoucherData(formatted);
                  setQrJwt(found.public_token || cleanToken);
                  setCountdown(QR_INTERVAL);
                  fetchRestaurantInfo(found.tenant_id);
                  setLoading(false);
                  localStorage.setItem(`voucher_token_${cleanToken}`, JSON.stringify(formatted));
                  return;
                }
              }
            }
          }
        }
      } catch (localErr) {
        console.warn('[VoucherViewer] Erro ao ler local:', localErr);
      }

      // Fallback gracioso
      fetchRestaurantInfo();
      throw new Error('Voucher não localizado ou expirado.');
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar voucher.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Listener Realtime: atualiza instantaneamente quando o voucher for resgatado no caixa
  useEffect(() => {
    if (!token) return;
    const cleanToken = token.trim().toLowerCase();

    const channel = supabase
      .channel(`voucher_realtime_viewer_${cleanToken}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vouchers'
        },
        (payload) => {
          const updated = payload.new as any;
          if (
            (updated.public_token && updated.public_token.toLowerCase() === cleanToken) ||
            (updated.id && updated.id.toLowerCase() === cleanToken)
          ) {
            setVoucherData((prev: any) => {
              if (!prev) return prev;
              const merged = {
                ...prev,
                status: updated.status,
                data_resgate: updated.data_resgate,
                atendente_id: updated.atendente_id,
                updated_at: updated.updated_at
              };
              try {
                localStorage.setItem(`voucher_token_${cleanToken}`, JSON.stringify(merged));
              } catch (_) {}
              return merged;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [token]);

  // 2. Renova o JWT do QR Code dinâmico a cada 30 segundos
  const renewQrToken = useCallback(async () => {
    if (!token || voucherData?.status === 'UTILIZADO') return;
    try {
      setIsRenewing(true);
      const res = await fetch(`${ENGINE_URL}/api/v1/vouchers/renew-qr/${token}?_t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.qrJwt) {
          setQrJwt(json.qrJwt);
          setCountdown(QR_INTERVAL);
        }
      }
    } catch (e) {
      console.warn('Erro ao renovar token QR:', e);
    } finally {
      setIsRenewing(false);
    }
  }, [token, voucherData?.status]);

  useEffect(() => {
    loadVoucher();
  }, [loadVoucher]);

  // 3. Loop do Countdown
  useEffect(() => {
    if (voucherData?.status === 'UTILIZADO' || voucherData?.status === 'CANCELADO') return;

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          renewQrToken();
          return QR_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [renewQrToken, voucherData?.status]);

  // 4. Realtime no Supabase para escutar resgate no caixa
  useEffect(() => {
    if (!voucherData?.id) return;

    const channel = supabase
      .channel(`public:vouchers:viewer:${voucherData.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vouchers', filter: `id=eq.${voucherData.id}` },
        (payload: any) => {
          const updated = payload.new;
          if (updated) {
            setVoucherData((prev: any) => ({
              ...prev,
              status: updated.status,
              data_resgate: updated.data_resgate,
              atendente_id: updated.atendente_id
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [voucherData?.id]);

  const copyVoucherLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Motor de Impressão VIP de Show / Ingresso com Canhoto
  const handlePrintVipTicket = () => {
    if (!voucherData) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const formattedVal = Number(voucherData.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formattedDate = new Date(voucherData.validade_fim).toLocaleDateString('pt-BR');
    const empresaNome = voucherData.empresa_razao_social || 'TERRAS GONÇALVES SOCIEDADE DE ADVOGADOS';
    const qrUrl = window.location.href;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>VIP Pass Ticket - ${voucherData.public_token}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;900&family=JetBrains+Mono:wght@700;900&display=swap');
            
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Montserrat', sans-serif;
              background: #f4f6f8;
              padding: 40px 20px;
              display: flex;
              justify-content: center;
              align-items: center;
              color: #111;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .ticket-container {
              width: 840px;
              background: #ffffff;
              border-radius: 24px;
              box-shadow: 0 20px 50px rgba(0,0,0,0.15);
              display: flex;
              position: relative;
              overflow: hidden;
              border: 2px solid #00a884;
            }

            .ticket-container::before {
              content: '';
              position: absolute;
              top: -14px;
              right: 244px;
              width: 28px;
              height: 28px;
              background: #f4f6f8;
              border-radius: 50%;
              border-bottom: 2px solid #00a884;
              z-index: 10;
            }

            .ticket-container::after {
              content: '';
              position: absolute;
              bottom: -14px;
              right: 244px;
              width: 28px;
              height: 28px;
              background: #f4f6f8;
              border-radius: 50%;
              border-top: 2px solid #00a884;
              z-index: 10;
            }

            .ticket-main {
              flex: 1;
              padding: 30px 34px;
              background: linear-gradient(135deg, #0b141a 0%, #111b21 100%);
              color: #ffffff;
              position: relative;
            }

            .ticket-main::before {
              content: 'VIP PASS';
              position: absolute;
              bottom: 10px;
              right: 20px;
              font-size: 80px;
              font-weight: 900;
              color: rgba(255,255,255,0.03);
              letter-spacing: 6px;
              pointer-events: none;
            }

            .badge-gold {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: linear-gradient(90deg, #d97706, #f59e0b);
              color: #0b141a;
              font-size: 10.5px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              padding: 4px 14px;
              border-radius: 20px;
              margin-bottom: 10px;
            }

            .company-name {
              font-size: 17px;
              font-weight: 900;
              color: #00a884;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 2px;
            }

            .company-subtitle {
              font-size: 10.5px;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 1px;
              font-weight: 600;
              margin-bottom: 16px;
            }

            .restaurant-box {
              background: rgba(0, 168, 132, 0.08);
              border: 1px solid rgba(0, 168, 132, 0.3);
              border-radius: 14px;
              padding: 12px 16px;
              margin-bottom: 16px;
            }

            .restaurant-tag {
              font-size: 9.5px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: #34d399;
              display: flex;
              align-items: center;
              gap: 4px;
              margin-bottom: 3px;
            }

            .restaurant-name {
              font-size: 15px;
              font-weight: 900;
              color: #ffffff;
              text-transform: uppercase;
            }

            .restaurant-address {
              font-size: 10.5px;
              color: #94a3b8;
              margin-top: 2px;
            }

            .middle-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              background: rgba(255,255,255,0.04);
              border: 1px solid rgba(255,255,255,0.1);
              padding: 14px 18px;
              border-radius: 16px;
              margin-bottom: 16px;
            }

            .value-block .label {
              font-size: 9.5px;
              color: #94a3b8;
              text-transform: uppercase;
              font-weight: 700;
              letter-spacing: 1px;
            }

            .value-block .amount {
              font-size: 30px;
              font-weight: 900;
              color: #00a884;
              line-height: 1.1;
              margin-top: 2px;
            }

            .beneficiary-block {
              text-align: right;
            }

            .beneficiary-block .name {
              font-size: 15px;
              font-weight: 800;
              color: #ffffff;
            }

            .token-pill {
              display: inline-block;
              font-family: 'JetBrains Mono', monospace;
              font-size: 11px;
              background: rgba(0,168,132,0.15);
              color: #00a884;
              border: 1px solid rgba(0,168,132,0.3);
              padding: 3px 8px;
              border-radius: 6px;
              margin-top: 3px;
              font-weight: 700;
            }

            .footer-info {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              font-size: 10.5px;
              color: #94a3b8;
            }

            .perforation-line {
              width: 0px;
              border-left: 2px dashed #00a884;
              position: relative;
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .cut-label {
              position: absolute;
              background: #0b141a;
              color: #00a884;
              font-size: 9px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 1px;
              padding: 6px 4px;
              writing-mode: vertical-rl;
              text-orientation: mixed;
              border: 1px dashed #00a884;
              border-radius: 6px;
              white-space: nowrap;
            }

            .ticket-stub {
              width: 258px;
              padding: 26px 20px;
              background: #0d171d;
              color: #ffffff;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              text-align: center;
              border-left: 1px solid rgba(255,255,255,0.05);
            }

            .stub-header {
              font-size: 9.5px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: #94a3b8;
            }

            .stub-restaurant {
              font-size: 10px;
              font-weight: 800;
              color: #00a884;
              text-transform: uppercase;
              margin-top: 2px;
            }

            .qr-box {
              background: #ffffff;
              padding: 9px;
              border-radius: 14px;
              box-shadow: 0 6px 16px rgba(0,0,0,0.3);
              margin: 10px 0;
            }

            .stub-amount {
              font-size: 17px;
              font-weight: 900;
              color: #00a884;
              margin-bottom: 2px;
            }

            .stub-beneficiary {
              font-size: 11px;
              color: #ffffff;
              font-weight: 700;
              margin-bottom: 6px;
              max-width: 180px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .signature-box {
              width: 100%;
              border-top: 1px solid rgba(255,255,255,0.2);
              padding-top: 5px;
              font-size: 8.5px;
              color: #64748b;
              text-transform: uppercase;
            }
          </style>
        </head>
        <body>
          ${isUtilizado ? `
            <div style="max-width: 820px; margin: 0 auto 12px; background: #ffe4e6; border: 2px solid #e11d48; color: #9f1239; padding: 10px 16px; border-radius: 12px; font-family: sans-serif; font-size: 12px; font-weight: bold; text-align: center;">
              🚨 ATENÇÃO: ESTE VOUCHER JÁ FOI UTILIZADO E LIQUIDADO NO CAIXA DA ${restaurantInfo.nome} EM ${new Date(voucherData.data_resgate || Date.now()).toLocaleString('pt-BR')} • NÃO É MAIS VÁLIDO PARA CONSUMO
            </div>
          ` : ''}
          <div class="ticket-container" style="${isUtilizado ? 'border-color: #e11d48;' : ''}">
            <div class="ticket-main">
              <div class="badge-gold">${isUtilizado ? '🔒 COMPROVANTE DE VOUCHER UTILIZADO 🔒' : '★ VIP COMPLIMENTARY PASS ★'}</div>
              <div class="company-name">${empresaNome}</div>
              <div class="company-subtitle">Programa de Benefício & Cortesia Corporativa</div>

              <!-- Estabelecimento de Consumo -->
              <div class="restaurant-box">
                <div class="restaurant-tag">🍔 LOCAL DE CONSUMO EXCLUSIVO:</div>
                <div class="restaurant-name">${restaurantInfo.nome}</div>
                <div class="restaurant-address">📍 ${restaurantInfo.endereco}</div>
              </div>

              <div class="middle-row">
                <div class="value-block">
                  <div class="label">${isUtilizado ? 'Valor Resgatado' : 'Valor Liberado'}</div>
                  <div class="amount" style="${isUtilizado ? 'color: #94a3b8; text-decoration: line-through;' : ''}">${formattedVal}</div>
                  ${isUtilizado ? '<div style="font-size: 10px; color: #e11d48; font-weight: 900; margin-top: 2px;">✓ LIQUIDADO NO CAIXA</div>' : ''}
                </div>
                <div class="beneficiary-block">
                  <div class="label">Beneficiário</div>
                  <div class="name">${voucherData.beneficiario_nome}</div>
                  <div class="token-pill">${voucherData.public_token}</div>
                </div>
              </div>

              <div class="footer-info">
                <div>
                  <strong>Validade Original:</strong> ${formattedDate}<br/>
                  <strong>Site / Cardápio:</strong> ${restaurantInfo.cardapioUrl || 'www.burguerplus.com.br'}
                </div>
                <div style="text-align: right;">
                  ${isUtilizado ? `Baixa confirmada no PDV da ${restaurantInfo.nome}.` : `Apresente este voucher no balcão da ${restaurantInfo.nome} para resgate.`}
                </div>
              </div>
            </div>

            <div class="perforation-line">
              <span class="cut-label">✂ ${isUtilizado ? 'CANHOTO BAIXADO' : 'DESTACAR NO CAIXA'}</span>
            </div>

            <div class="ticket-stub">
              <div>
                <div class="stub-header">${isUtilizado ? 'CANHOTO RESGATADO' : 'CANHOTO DO CAIXA'}</div>
                <div class="stub-restaurant">${restaurantInfo.nome}</div>
              </div>
              
              <div class="qr-box" style="${isUtilizado ? 'opacity: 0.3;' : ''}">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(qrUrl)}" width="110" height="110" alt="QR Code" />
              </div>

              <div class="stub-amount" style="${isUtilizado ? 'color: #e11d48; font-size: 13px;' : ''}">
                ${isUtilizado ? '✓ BAIXA CONCLUÍDA' : formattedVal}
              </div>
              <div class="stub-beneficiary">${voucherData.beneficiario_nome}</div>
              
              <div class="signature-box">
                ${isUtilizado
                  ? `Visto do Caixa: BAIXADO EM<br/>${new Date(voucherData.data_resgate || Date.now()).toLocaleString('pt-BR')}`
                  : 'Visto do Caixa / Data:<br/>____/____/________'
                }
              </div>
            </div>
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div className="h-full h-[100dvh] w-full bg-[#070c0e] text-slate-100 flex flex-col items-center justify-center p-4 overflow-y-auto">
        <div className="flex flex-col items-center gap-3 bg-[#0d171d] p-8 rounded-[32px] border border-white/10 shadow-2xl">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <span className="text-xs font-bold text-slate-400">Carregando Ingresso VIP Digital...</span>
        </div>
      </div>
    );
  }

  if (error || !voucherData) {
    return (
      <div className="h-full h-[100dvh] w-full bg-[#070c0e] text-slate-100 flex flex-col items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-sm bg-[#0d171d] border border-rose-500/30 p-7 rounded-[32px] text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-black text-white">Voucher Não Encontrado</h2>
          <p className="text-xs text-slate-400">{error || 'O link informado pode estar incorreto ou expirado.'}</p>
        </div>
      </div>
    );
  }

  const isUtilizado = voucherData.status === 'UTILIZADO';
  const isValidado = voucherData.status === 'VALIDADO';
  const isExpirado = voucherData.status === 'EXPIRADO' || new Date(voucherData.validade_fim) < new Date();
  const valorFormatado = Number(voucherData.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const empresaExibicao = voucherData.empresa_razao_social || 'TERRAS GONÇALVES SOCIEDADE DE ADVOGADOS';

  return (
    <div className="h-full h-[100dvh] w-full bg-[#060a0d] text-slate-100 flex flex-col items-center justify-start pt-3 pb-24 px-3 sm:pt-6 sm:pb-12 sm:px-6 font-sans relative overflow-x-hidden overflow-y-auto overscroll-y-contain">
      
      {/* Luzes de Fundo & Glow Neon */}
      <div className={`fixed -top-32 -left-32 w-96 h-96 rounded-full blur-[140px] pointer-events-none transition-colors duration-500 ${isUtilizado ? 'bg-rose-500/15' : 'bg-emerald-500/10'}`} />
      <div className={`fixed -bottom-32 -right-32 w-96 h-96 rounded-full blur-[140px] pointer-events-none transition-colors duration-500 ${isUtilizado ? 'bg-purple-500/15' : 'bg-teal-500/10'}`} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/5 rounded-full blur-[160px] pointer-events-none" />

      {/* ========================================================= */}
      {/* BARRA SUPERIOR DE AÇÕES & STATUS */}
      {/* ========================================================= */}
      <div className="w-full max-w-4xl flex items-center justify-between gap-2 mb-3 sm:mb-4 z-20 px-1 pt-1 sm:pt-0">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shadow-lg shrink-0 ${
            isUtilizado
              ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-rose-500/10'
              : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-emerald-500/10'
          }`}>
            {isUtilizado ? <Ban className="w-4 h-4" /> : <Ticket className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 block truncate">
              {isUtilizado ? 'Ingresso VIP Resgatado' : 'Ingresso Digital VIP'}
            </span>
            <span className={`text-[11px] sm:text-xs font-mono font-black truncate block ${isUtilizado ? 'text-rose-400' : 'text-emerald-400'}`}>
              {voucherData.public_token}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={copyVoucherLink}
            className="px-3 py-1.5 sm:px-3.5 sm:py-2 bg-[#111b21]/90 hover:bg-[#16222a] border border-white/10 text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
            title="Copiar Link Oficial"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="text-[11px] sm:text-xs">{copied ? 'Copiado!' : 'Compartilhar'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrintVipTicket}
            className={`px-3 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-xs font-black uppercase tracking-wider rounded-xl hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 ${
              isUtilizado
                ? 'bg-gradient-to-r from-rose-600 to-purple-600 text-white shadow-rose-600/20'
                : 'bg-gradient-to-r from-emerald-500 to-teal-400 text-[#0b141a] shadow-emerald-500/20'
            }`}
            title={isUtilizado ? 'Imprimir Comprovante de Baixa' : 'Imprimir Modelo Oficial'}
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isUtilizado ? 'Comprovante' : 'Imprimir'}</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SUPER BANNER DE ALERTA: VOUCHER JÁ UTILIZADO */}
      {/* ========================================================= */}
      {isUtilizado && (
        <div className="w-full max-w-4xl mb-3.5 bg-gradient-to-r from-rose-950/90 via-[#26050e] to-purple-950/90 border-2 border-rose-500/70 rounded-2xl p-3.5 sm:p-4 shadow-[0_0_40px_rgba(244,63,94,0.35)] flex flex-col sm:flex-row items-center justify-between gap-3 text-left relative overflow-hidden animate-in fade-in slide-in-from-top-3 duration-300 z-20">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border-2 border-rose-500/50 text-rose-400 flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/30">
              <Ban className="w-6 h-6 text-rose-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-sm flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> VOUCHER JÁ UTILIZADO NO CAIXA
                </span>
                <span className="text-[10.5px] font-black text-rose-300 uppercase tracking-wide">
                  NÃO É MAIS VÁLIDO PARA USO
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                A baixa e o resgate deste cupom já foram efetuados no balcão de atendimento da <strong>{restaurantInfo.nome}</strong>.
              </p>
              {voucherData.data_resgate && (
                <div className="text-[11px] text-rose-400 font-mono font-bold mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-rose-400" />
                  <span>Baixa realizada em: {new Date(voucherData.data_resgate).toLocaleString('pt-BR')}</span>
                  {voucherData.atendente_id && (
                    <span className="text-slate-400"> • Operador: {voucherData.atendente_id}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="px-4 py-2 rounded-xl bg-black/50 border border-rose-500/40 text-rose-300 text-xs font-mono font-black shrink-0 self-stretch sm:self-center text-center">
            STATUS: RESGATADO
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ESTRUTURA DO TICKET VIP (HORIZONTAL NO PC / VERTICAL NO CELULAR) */}
      {/* ========================================================= */}
      <div className="w-full max-w-4xl relative z-10 transition-all duration-300 mb-6">
        
        <div className="flex flex-col md:flex-row items-stretch justify-center relative">
          
          {/* ========================================================= */}
          {/* 1. CORPO PRINCIPAL DO INGRESSO (LADO ESQUERDO / PARTE SUPERIOR) */}
          {/* ========================================================= */}
          <div className={`flex-1 rounded-t-[28px] md:rounded-t-none md:rounded-l-[28px] p-4 sm:p-7 md:p-8 relative overflow-hidden shadow-2xl transition-all duration-500 ${
            isUtilizado
              ? 'bg-gradient-to-br from-[#12070a] via-[#170a0f] to-[#0c0507] border-2 border-rose-500/60 shadow-[0_0_50px_rgba(244,63,94,0.2)]'
              : 'bg-gradient-to-br from-[#0c1418] via-[#101b22] to-[#0c1317] border-2 border-emerald-500/40'
          } ${isDetached ? 'md:-translate-x-2' : ''}`}>
            
            {/* Marca d'água decorativa de fundo */}
            <div className="absolute -bottom-4 right-4 text-6xl sm:text-8xl font-black text-white/[0.02] tracking-widest pointer-events-none select-none">
              {isUtilizado ? 'UTILIZADO' : 'VIP PASS'}
            </div>

            {/* Selo Carimbado Central "RESGATADO" */}
            {isUtilizado && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 select-none -rotate-12 border-4 border-rose-500/70 bg-rose-950/80 backdrop-blur-md px-6 py-3 rounded-2xl shadow-[0_0_50px_rgba(244,63,94,0.5)] text-center animate-in zoom-in-90 duration-300">
                <div className="text-[11px] font-black tracking-widest text-rose-300 uppercase">
                  ★ RESGATADO & BAIXADO NO PDV ★
                </div>
                <div className="text-xl sm:text-2xl font-black tracking-tighter text-white uppercase mt-0.5">
                  VOUCHER UTILIZADO
                </div>
                <div className="text-[9.5px] font-mono font-bold text-rose-400 mt-0.5">
                  {voucherData.data_resgate ? new Date(voucherData.data_resgate).toLocaleString('pt-BR') : 'LIQUIDAÇÃO CONFIRMADA'}
                </div>
                <div className="text-[9px] font-black uppercase text-rose-300/80 tracking-widest mt-1 border-t border-rose-500/30 pt-1">
                  NÃO É MAIS VÁLIDO PARA REUTILIZAÇÃO
                </div>
              </div>
            )}

            {/* Badge de Cabeçalho Oficial */}
            {isUtilizado ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 sm:px-3.5 sm:py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] sm:text-[10.5px] font-black uppercase tracking-widest mb-2.5 shadow-sm">
                <Ban className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-400" />
                <span>★ VOUCHER LIQUIDADO NO CAIXA ★</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 sm:px-3.5 sm:py-1 rounded-full bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] sm:text-[10.5px] font-black uppercase tracking-widest mb-2.5 shadow-sm">
                <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
                <span>★ VIP COMPLIMENTARY PASS ★</span>
              </div>
            )}

            {/* Nome e Subtítulo da Empresa Concedente (Patrocinadora B2B) */}
            <div className="space-y-0.5 mb-3.5 text-left">
              <span className="text-[9.5px] uppercase font-black tracking-wider text-slate-400 flex items-center gap-1">
                <Building2 className={`w-3 h-3 ${isUtilizado ? 'text-rose-400' : 'text-emerald-400'}`} /> Oferecido com Carinho por:
              </span>
              <h1 className={`text-base sm:text-xl font-black uppercase tracking-tight leading-tight ${isUtilizado ? 'text-rose-300' : 'text-emerald-400'}`}>
                {empresaExibicao}
              </h1>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                PROGRAMA DE BENEFÍCIO & CORTESIA CORPORATIVA
              </p>
            </div>

            {/* ========================================================= */}
            {/* BLOCO: ESTABELECIMENTO DE CONSUMO (RESTAURANTE ONDE USAR) */}
            {/* ========================================================= */}
            <div className={`border rounded-2xl p-3 sm:p-4 mb-3.5 text-left space-y-2 shadow-sm ${
              isUtilizado
                ? 'bg-gradient-to-r from-rose-950/30 via-[#14060b] to-purple-950/30 border-rose-500/30'
                : 'bg-gradient-to-r from-emerald-950/40 via-[#0a181e] to-teal-950/40 border-emerald-500/35'
            }`}>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-white/5 pb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black shrink-0 ${
                    isUtilizado ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <span className={`text-[9px] font-black uppercase tracking-wider block ${isUtilizado ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {isUtilizado ? 'Resgate realizado exclusivamente em:' : 'Válido para consumo exclusivamente em:'}
                    </span>
                    <strong className="text-sm sm:text-lg font-black text-white uppercase tracking-tight">
                      {restaurantInfo.nome}
                    </strong>
                  </div>
                </div>

                <span className={`text-[8.5px] sm:text-[9px] font-black px-2 py-0.5 rounded-full border self-start sm:self-auto ${
                  isUtilizado
                    ? 'text-rose-300 bg-rose-500/20 border-rose-500/30'
                    : 'text-emerald-300 bg-emerald-500/20 border-emerald-500/30'
                }`}>
                  RESTAURANTE CONVENIADO
                </span>
              </div>

              {/* Endereço */}
              <div className="flex items-start gap-1.5 text-xs text-slate-300">
                <MapPin className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isUtilizado ? 'text-rose-400' : 'text-emerald-400'}`} />
                <span className="leading-snug text-[11px] sm:text-xs">{restaurantInfo.endereco}</span>
              </div>

              {/* Botões de Ação do Restaurante (Cardápio, GPS, Instagram) */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5">
                {restaurantInfo.cardapioUrl && (
                  <a
                    href={restaurantInfo.cardapioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-[10.5px] sm:text-[11px] font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                  >
                    <Utensils className="w-3 h-3 text-emerald-400" />
                    <span>Ver Cardápio Online</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                  </a>
                )}

                {restaurantInfo.googleMapsUrl && (
                  <a
                    href={restaurantInfo.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-[10.5px] sm:text-[11px] font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                  >
                    <Compass className="w-3 h-3 text-teal-400" />
                    <span>Como Chegar (GPS)</span>
                  </a>
                )}

                {restaurantInfo.instagram && (
                  <a
                    href={restaurantInfo.instagram.startsWith('http') ? restaurantInfo.instagram : `https://instagram.com/${restaurantInfo.instagram.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-[10.5px] sm:text-[11px] font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                    title="Instagram do Restaurante"
                  >
                    <svg className="w-3 h-3 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
                    </svg>
                    <span>Instagram</span>
                  </a>
                )}
              </div>

            </div>

            {/* Card Escuro: Valor Liberado & Beneficiário */}
            <div className={`border rounded-2xl p-3 sm:p-4 mb-3.5 flex flex-row items-center justify-between gap-2 shadow-inner ${
              isUtilizado ? 'bg-[#120609]/90 border-rose-500/25' : 'bg-[#070c0f]/90 border-white/10'
            }`}>
              
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                  {isUtilizado ? 'VALOR RESGATADO' : 'VALOR LIBERADO'}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-xl sm:text-3xl font-black tracking-tight ${
                    isUtilizado ? 'text-slate-400 line-through opacity-80' : 'text-emerald-400'
                  }`}>
                    {valorFormatado}
                  </span>
                  {isUtilizado && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/50 text-[11px] font-black uppercase">
                      ✓ BAIXADO
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
                  Beneficiário
                </span>
                <span className="text-xs sm:text-base font-black text-white block truncate max-w-[150px] sm:max-w-[200px]">
                  {voucherData.beneficiario_nome}
                </span>
                <span className={`inline-block font-mono font-black text-[10px] border px-1.5 py-0.5 rounded-lg mt-0.5 ${
                  isUtilizado
                    ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                    : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                }`}>
                  {voucherData.public_token}
                </span>
              </div>

            </div>

            {/* Informações de Rodapé do Ticket */}
            <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-1.5 text-left text-xs text-slate-400 pt-2 border-t border-white/5">
              <div className="space-y-0.5 text-[11px] sm:text-xs">
                <div>
                  <strong>Validade Original:</strong> <span className="text-slate-200">{new Date(voucherData.validade_fim).toLocaleDateString('pt-BR')}</span>
                </div>
                <div>
                  <strong>Observação:</strong> <span className="text-slate-200">{voucherData.observacoes || voucherData.campanha_nome || 'Crédito Corporativo Direto'}</span>
                </div>
              </div>

              <div className="text-left sm:text-right text-[10px] sm:text-[10.5px] text-slate-500 font-semibold max-w-[240px]">
                {isUtilizado
                  ? `Baixa registrada no terminal PDV da ${restaurantInfo.nome}.`
                  : `Apresente este voucher no balcão da ${restaurantInfo.nome} para resgate.`}
              </div>
            </div>

          </div>

          {/* ========================================================= */}
          {/* 2. LINHA DE PICOTE PERFURADO & BOTÃO DESTACAR INTERATIVO */}
          {/* ========================================================= */}
          <div className="relative flex md:flex-col items-center justify-center bg-transparent z-20">
            
            {/* Entalhes Circulares nos Cantos */}
            <div className="hidden md:block absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-[#060a0d] rounded-full border-b-2 border-slate-700 z-30" />
            <div className="md:hidden absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#060a0d] rounded-full border-r-2 border-slate-700 z-30" />

            <div className="hidden md:block absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-[#060a0d] rounded-full border-t-2 border-slate-700 z-30" />
            <div className="md:hidden absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#060a0d] rounded-full border-l-2 border-slate-700 z-30" />

            {/* Linha Picotada Tracejada */}
            <div className={`w-full md:w-0 md:h-full border-t-2 md:border-t-0 md:border-l-2 border-dashed py-3 md:py-0 md:px-3 flex items-center justify-center ${
              isUtilizado ? 'border-rose-500/40' : 'border-emerald-500/50'
            }`}>
              
              {/* Botão de Destaque Interativo */}
              <button
                type="button"
                onClick={() => setIsDetached(!isDetached)}
                className={`group px-3.5 py-1.5 md:py-3 border rounded-full md:rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 select-none ${
                  isUtilizado
                    ? 'bg-[#15060a] hover:bg-[#200810] text-rose-400 border-rose-500/40'
                    : 'bg-[#0c1418] hover:bg-[#14232b] text-emerald-400 border-emerald-500/40'
                }`}
                title={isDetached ? 'Juntar Canhoto' : 'Destacar Canhoto no Caixa'}
              >
                <Scissors className={`w-3.5 h-3.5 transition-transform ${isDetached ? 'rotate-90 text-amber-400' : 'group-hover:rotate-45'}`} />
                <span className="md:[writing-mode:vertical-rl] md:rotate-180">
                  {isUtilizado ? 'CANHOTO LIQUIDADO' : (isDetached ? 'CANHOTO DESTACADO' : 'DESTACAR NO CAIXA')}
                </span>
              </button>

            </div>

          </div>

          {/* ========================================================= */}
          {/* 3. CANHOTO DO CAIXA COM QR CODE (LADO DIREITO / PARTE INFERIOR) */}
          {/* ========================================================= */}
          <div className={`w-full md:w-72 rounded-b-[28px] md:rounded-b-none md:rounded-r-[28px] p-4 sm:p-6 flex flex-col items-center justify-between text-center relative shadow-2xl transition-all duration-500 ${
            isUtilizado
              ? 'bg-gradient-to-b from-[#14060a] via-[#180a0f] to-[#0d0507] border-2 border-rose-500/60 shadow-[0_0_40px_rgba(244,63,94,0.2)]'
              : 'bg-gradient-to-b from-[#0c171d] via-[#101b22] to-[#081014] border-2 border-emerald-500/40'
          } ${isDetached ? 'md:translate-x-4 md:rotate-1 translate-y-3 shadow-[0_20px_50px_rgba(0,168,132,0.25)]' : ''}`}>
            
            {/* Header do Canhoto com Nome da Loja */}
            <div className="w-full text-center space-y-0.5 mb-1.5">
              <span className="text-[9px] sm:text-[9.5px] font-black uppercase tracking-widest text-slate-400 block">
                {isUtilizado ? 'CANHOTO RESGATADO' : 'CANHOTO DO CAIXA'}
              </span>
              <span className={`text-[10.5px] font-black uppercase tracking-tight block ${isUtilizado ? 'text-rose-400' : 'text-emerald-400'}`}>
                {restaurantInfo.nome}
              </span>
            </div>

            {/* QR Code com Overlay de Bloqueio se Utilizado ou Expirado */}
            <div className="relative p-3 bg-white rounded-2xl shadow-2xl ring-4 my-2 transition-transform hover:scale-105 overflow-hidden">
              <div className={(isUtilizado || isExpirado) ? 'opacity-20 blur-[2px]' : ''}>
                <QRCode value={qrJwt || voucherData.public_token} size={150} />
              </div>

              {/* Overlay de Bloqueio do QR Code */}
              {(isUtilizado || isExpirado) && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-[2px] flex flex-col items-center justify-center p-3 text-center z-20">
                  <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center mb-1.5 shadow-lg shadow-rose-600/40">
                    <Ban className="w-5 h-5" />
                  </div>
                  <strong className="text-[10px] font-black text-rose-400 uppercase tracking-wide leading-tight">
                    {isUtilizado ? 'QR CODE INATIVO' : 'QR CODE EXPIRADO'}
                  </strong>
                  <span className="text-[8px] text-slate-300 mt-0.5 font-bold uppercase">
                    {isUtilizado ? 'CUPOM RESGATADO' : 'PRAZO ENCERRADO'}
                  </span>
                </div>
              )}
            </div>

            {/* Barra e Contador de Auto-Renovação Antifraude */}
            <div className="w-full space-y-1 my-1">
              <div className="flex items-center justify-between text-[9.5px] font-bold text-slate-400">
                <span className="flex items-center gap-1">
                  {isUtilizado ? (
                    <>
                      <Ban className="w-2.5 h-2.5 text-rose-400" />
                      <span className="text-rose-400 font-bold">Status: LIQUIDADO</span>
                    </>
                  ) : (
                    <>
                      <RotateCw className={`w-2.5 h-2.5 text-emerald-400 ${isRenewing ? 'animate-spin' : ''}`} />
                      <span>Dinâmico Antifraude</span>
                    </>
                  )}
                </span>
                <span className={`font-mono ${isUtilizado ? 'text-rose-400' : 'text-emerald-300'}`}>
                  {isUtilizado ? '0s (Encerrado)' : `${countdown}s`}
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                    isUtilizado
                      ? 'bg-rose-500 w-full'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  }`}
                  style={{ width: isUtilizado ? '100%' : `${(countdown / QR_INTERVAL) * 100}%` }}
                />
              </div>
            </div>

            {/* Valor e Beneficiário no Canhoto */}
            <div className="space-y-0.5 my-1">
              <span className={`text-xl font-black block ${
                isUtilizado ? 'text-slate-400 line-through' : 'text-emerald-400'
              }`}>
                {valorFormatado}
              </span>
              <span className="text-xs font-bold text-white block max-w-[200px] truncate">
                {voucherData.beneficiario_nome}
              </span>
            </div>

            {/* Campo de Visto do Caixa */}
            {isUtilizado ? (
              <div className="w-full border-t border-rose-500/30 pt-2 mt-1 text-[8.5px] text-rose-300 font-bold text-center">
                ✓ VISTO DO CAIXA CONFIRMADO<br />
                <span className="font-mono text-white text-[9px] block mt-0.5">
                  {voucherData.data_resgate ? new Date(voucherData.data_resgate).toLocaleString('pt-BR') : 'CONFIRMADO NO PDV'}
                </span>
              </div>
            ) : (
              <div className="w-full border-t border-white/10 pt-2 mt-1 text-[8.5px] text-slate-500 uppercase font-semibold">
                Visto do Caixa / Data:<br />
                <span className="font-mono text-slate-400">____/____/________</span>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* ========================================================= */}
      {/* RODAPÉ INFORMATIVO COM PADDING EXTRA PARA MOBILE */}
      {/* ========================================================= */}
      <div className="w-full max-w-4xl flex flex-col sm:flex-row items-center justify-between gap-1 text-[10px] sm:text-[11px] text-slate-500 font-bold z-20 px-2 pb-16 sm:pb-8 text-center sm:text-left">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className={`w-3.5 h-3.5 shrink-0 ${isUtilizado ? 'text-rose-400' : 'text-emerald-400'}`} />
          <span>{isUtilizado ? 'Ativo Digital Liquidado e Auditado via JWT' : 'Autenticação Criptográfica JWT Antifraude'}</span>
        </span>
        <span>X-Point Voucher Digital • {restaurantInfo.nome}</span>
      </div>

    </div>
  );
}
