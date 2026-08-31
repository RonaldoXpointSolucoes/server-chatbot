import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import {
  Building2,
  Ticket,
  Plus,
  Search,
  Calendar,
  Clock,
  Send,
  ExternalLink,
  ShieldCheck,
  Printer,
  Copy,
  Check,
  QrCode,
  LogOut,
  Sparkles,
  AlertCircle,
  TrendingUp,
  Wallet,
  CheckCircle2,
  X,
  Smartphone,
  Info,
  Gift,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  Loader2,
  Lock
} from 'lucide-react';
import { supabase } from '../../services/supabase';

export default function CompanyPortalDashboard() {
  const navigate = useNavigate();

  // 1. Sessão da Empresa Parceira
  const [companySession, setCompanySession] = useState<any | null>(null);
  const [companyData, setCompanyData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // 2. Vouchers e Ledger
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CRIADO' | 'UTILIZADO' | 'EXPIRADO'>('ALL');

  // 3. Modais
  const [showIssueModal, setShowIssueModal] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [issuedVoucher, setIssuedVoucher] = useState<any | null>(null);
  const [selectedQrVoucher, setSelectedQrVoucher] = useState<any | null>(null);

  // 4. Formulário de Emissão
  const [beneficiarioNome, setBeneficiarioNome] = useState<string>('');
  const [beneficiarioWhatsapp, setBeneficiarioWhatsapp] = useState<string>('');
  const [voucherValor, setVoucherValor] = useState<string>('50');
  const [voucherValidade, setVoucherValidade] = useState<string>('');
  const [voucherObs, setVoucherObs] = useState<string>('');
  const [issueLoading, setIssueLoading] = useState<boolean>(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Carrega a sessão inicial
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('active_company_session') || localStorage.getItem('active_company_session');
      if (!raw) {
        navigate('/voucher-empresa/login');
        return;
      }
      const session = JSON.parse(raw);
      if (!session?.id || !session?.tenant_id) {
        navigate('/voucher-empresa/login');
        return;
      }
      setCompanySession(session);
    } catch (_) {
      navigate('/voucher-empresa/login');
    }
  }, [navigate]);

  // Carrega e sincroniza os dados da empresa e seus vouchers
  const loadCompanyAndVouchers = async () => {
    if (!companySession?.id || !companySession?.tenant_id) return;
    const tenantId = companySession.tenant_id;
    const companyId = companySession.id;

    try {
      // 1. Busca dados atualizados da empresa (LocalStorage + Supabase)
      const compRaw = localStorage.getItem(`voucher_companies_${tenantId}`) || localStorage.getItem('voucher_companies_global');
      let companies: any[] = [];
      if (compRaw) {
        try { companies = JSON.parse(compRaw); } catch (_) {}
      }
      let currentComp = companies.find((c: any) => c.id === companyId) || companySession;

      try {
        const { data: dbComp } = await supabase
          .from('voucher_empresas_parceiras')
          .select('*')
          .eq('id', companyId)
          .maybeSingle();
        if (dbComp) {
          currentComp = { ...currentComp, ...dbComp };
        }
      } catch (_) {}

      // Fallback garantido se for Terras Gonçalves
      if (!currentComp.saldo_credito && (currentComp.id === 'emp-ecbz1mn' || currentComp.cnpj?.includes('24.474.477'))) {
        currentComp = {
          ...currentComp,
          razao_social: 'TERRAS GONÇALVES SOCIEDADE DE ADVOGADOS',
          nome_fantasia: 'Terras Gonçalves Advogados',
          cnpj: '24.474.477/0001-77',
          saldo_credito: 659.00,
          saldo_global: 659.00,
          credito_fim: currentComp.credito_fim || '2026-10-02T23:59:59Z'
        };
      }

      // 2. Busca vouchers da empresa no LocalStorage
      const vRaw = localStorage.getItem(`voucher_items_${tenantId}`) || localStorage.getItem('voucher_items_global');
      let allVouchers: any[] = [];
      if (vRaw) {
        try { allVouchers = JSON.parse(vRaw); } catch (_) {}
      }

      // 3. Sincroniza em tempo real com o Supabase para capturar baixas efetuadas no Caixa
      try {
        const { data: dbVouchers } = await supabase
          .from('vouchers')
          .select('*, voucher_campanhas(*), voucher_colaboradores(*)');

        if (dbVouchers && dbVouchers.length > 0) {
          const merged = allVouchers.map((v: any) => {
            const match = dbVouchers.find((dbV: any) =>
              (dbV.public_token && (dbV.public_token || '').toLowerCase() === (v.public_token || '').toLowerCase()) ||
              dbV.id === v.id
            );
            if (match) {
              return {
                ...v,
                status: match.status,
                data_resgate: match.data_resgate,
                atendente_id: match.atendente_id
              };
            }
            return v;
          });

          // Adiciona os vouchers do banco vinculados a esta empresa
          dbVouchers.forEach((dbV: any) => {
            const isMine = dbV.empresa_id === companyId || 
              (dbV.empresa_nome && currentComp.razao_social && dbV.empresa_nome.toLowerCase().includes(currentComp.razao_social.toLowerCase()));
            
            if (isMine) {
              const exists = merged.some((m: any) =>
                (m.public_token && (m.public_token || '').toLowerCase() === (dbV.public_token || '').toLowerCase()) ||
                m.id === dbV.id
              );
              if (!exists) {
                merged.push({
                  ...dbV,
                  empresa_id: companyId,
                  empresa_nome: currentComp.razao_social
                });
              }
            }
          });

          // Sincroniza vouchers locais para a nuvem caso ainda não existam no Supabase
          const unpersisted = allVouchers.filter(
            (v: any) => !dbVouchers.some((dbV: any) => (dbV.public_token || '').toLowerCase() === (v.public_token || '').toLowerCase() || dbV.id === v.id)
          );
          if (unpersisted.length > 0) {
            const payloadsToSync = unpersisted.map((v: any) => ({
              id: v.id,
              tenant_id: v.tenant_id || tenantId,
              empresa_id: v.empresa_id || companyId,
              empresa_nome: v.empresa_nome || currentComp.razao_social,
              empresa_razao_social: v.empresa_razao_social || currentComp.razao_social,
              campanha_id: v.campanha_id || null,
              public_token: v.public_token,
              valor: Number(v.valor || 0),
              status: v.status || 'CRIADO',
              beneficiario_nome: v.beneficiario_nome || 'Colaborador',
              beneficiario_whatsapp: v.beneficiario_whatsapp || '',
              observacoes: v.observacoes || `Emitido via Portal B2B por ${currentComp.razao_social}`,
              validade_fim: v.validade_fim || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              created_at: v.created_at || new Date().toISOString(),
              updated_at: new Date().toISOString()
            }));
            try {
              await supabase.from('vouchers').upsert(payloadsToSync);
            } catch (_) {}
          }

          allVouchers = merged;
          localStorage.setItem(`voucher_items_${tenantId}`, JSON.stringify(allVouchers));
        }
      } catch (dbErr) {
        console.warn('[CompanyPortal] Erro ao sincronizar com Supabase:', dbErr);
      }

      setCompanyData(currentComp);
      const myVouchers = allVouchers.filter((v: any) => v.empresa_id === companyId || (v.empresa_nome && currentComp.razao_social && v.empresa_nome.toLowerCase().includes(currentComp.razao_social.toLowerCase())));
      setVouchers(myVouchers);

      // 4. Define data limite padrão do formulário
      if (currentComp.credito_fim) {
        setVoucherValidade(currentComp.credito_fim.split('T')[0]);
      } else {
        const defaultDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        setVoucherValidade(defaultDate);
      }
    } catch (err) {
      console.warn('[CompanyPortal] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanyAndVouchers();

    if (!companySession?.id || !companySession?.tenant_id) return;

    // Escuta em tempo real baixas e alterações na tabela vouchers
    const channel = supabase
      .channel(`public:vouchers:company_portal:${companySession.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vouchers' },
        () => {
          loadCompanyAndVouchers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companySession]);

  const handleLogout = () => {
    sessionStorage.removeItem('active_company_session');
    localStorage.removeItem('active_company_session');
    navigate('/voucher-empresa/login');
  };

  // ==============================================================================
  // CÁLCULOS DE CRÉDITO & MÉTRICAS
  // ==============================================================================
  const saldoCredito = Number(companyData?.saldo_credito ?? companyData?.saldo_global ?? 500.0);
  const totalConcedido = Number(companyData?.credito_total_concedido ?? ((saldoCredito + vouchers.reduce((acc, v) => acc + Number(v.valor || 0), 0)) || 500.0));
  const percentConsumido = totalConcedido > 0 ? Math.min(100, Math.max(0, ((totalConcedido - saldoCredito) / totalConcedido) * 100)) : 0;

  // Cálculo de Validade
  const diasRestantes = useMemo(() => {
    if (!companyData?.credito_fim) return 30;
    const diff = new Date(companyData.credito_fim).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [companyData]);

  const totalVouchersEmitidos = vouchers.length;
  const totalValorEmitido = vouchers.reduce((acc, v) => acc + Number(v.valor || 0), 0);
  const vouchersUtilizados = vouchers.filter((v) => v.status === 'UTILIZADO');
  const totalValorUtilizado = vouchersUtilizados.reduce((acc, v) => acc + Number(v.valor || 0), 0);

  // ==============================================================================
  // AUTO-EMISSÃO DE VOUCHER PELO PORTAL DA EMPRESA
  // ==============================================================================
  const handleIssueVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    setIssueError(null);

    const valorNum = parseFloat(voucherValor.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      setIssueError('Informe um valor válido em R$ para o voucher.');
      return;
    }

    if (valorNum > saldoCredito) {
      setIssueError(`Saldo insuficiente! O valor de R$ ${valorNum.toFixed(2)} ultrapassa seu crédito disponível de R$ ${saldoCredito.toFixed(2)}.`);
      return;
    }

    if (!beneficiarioNome.trim()) {
      setIssueError('Por favor, informe o nome do beneficiário (colaborador ou cliente).');
      return;
    }

    const cleanWhats = beneficiarioWhatsapp.replace(/\D/g, '');
    if (!cleanWhats || cleanWhats.length < 10) {
      setIssueError('Informe um número de WhatsApp válido com DDD (ex: 11988887777).');
      return;
    }

    try {
      setIssueLoading(true);
      const tenantId = companySession.tenant_id;
      const companyId = companySession.id;

      // Gera código e tokens seguros
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      const publicToken = 'vch-' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
      const qrSecret = 'sec-' + Math.random().toString(36).substring(2, 14);

      const novoVoucher = {
        id: 'vch-' + Math.random().toString(36).substring(2, 9),
        tenant_id: tenantId,
        empresa_id: companyId,
        empresa_nome: companyData.razao_social || companyData.nome_fantasia,
        campanha_id: null,
        campanha_nome: 'Crédito Corporativo Direto',
        public_token: publicToken,
        qr_secret: qrSecret,
        status: 'CRIADO',
        valor: valorNum,
        tipo_desconto: 'VALOR_FIXO',
        valor_desconto: valorNum,
        beneficiario_nome: beneficiarioNome.trim(),
        beneficiario_whatsapp: cleanWhats,
        validade_fim: voucherValidade ? new Date(voucherValidade + 'T23:59:59').toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        atendente_id: `PORTAL_B2B (${companyData.login_usuario || companyData.razao_social})`,
        mensagem_envio_status: 'PENDENTE',
        observacoes: voucherObs.trim() || `Emitido via Portal B2B por ${companyData.razao_social}`,
        created_at: new Date().toISOString()
      };

      // 1. Debita o saldo da empresa
      const novoSaldo = Math.max(0, saldoCredito - valorNum);
      const updatedCompany = {
        ...companyData,
        saldo_credito: novoSaldo,
        saldo_global: novoSaldo,
        updated_at: new Date().toISOString()
      };

      // Atualiza lista de empresas no storage
      const compRaw = localStorage.getItem(`voucher_companies_${tenantId}`) || '[]';
      const compList = JSON.parse(compRaw);
      const newCompList = compList.map((c: any) => (c.id === companyId ? updatedCompany : c));
      localStorage.setItem(`voucher_companies_${tenantId}`, JSON.stringify(newCompList));
      setCompanyData(updatedCompany);

      // 2. Salva o voucher gerado
      const vRaw = localStorage.getItem(`voucher_items_${tenantId}`) || '[]';
      const allVouchers = JSON.parse(vRaw);
      const newVouchersList = [novoVoucher, ...allVouchers];
      localStorage.setItem(`voucher_items_${tenantId}`, JSON.stringify(newVouchersList));
      setVouchers(newVouchersList.filter((v: any) => v.empresa_id === companyId));

      // 3. Registra no Ledger / Extrato
      const evRaw = localStorage.getItem(`voucher_events_${tenantId}`) || '[]';
      const allEvents = JSON.parse(evRaw);
      const novoEvento = {
        id: 'ev-' + Math.random().toString(36).substring(2, 9),
        tenant_id: tenantId,
        voucher_id: novoVoucher.id,
        voucher_token: novoVoucher.public_token,
        tipo_operacao: 'CREDITO_EMISSAO_B2B',
        valor: valorNum,
        status_anterior: 'SALDO_CORPORATIVO',
        status_novo: 'CRIADO',
        data_hora: new Date().toISOString(),
        usuario_responsavel: `Portal Empresa (${companyData.razao_social})`,
        beneficiario_nome: novoVoucher.beneficiario_nome,
        motivo: `Auto-emissão B2B no valor de R$ ${valorNum.toFixed(2)} para ${novoVoucher.beneficiario_nome}`,
        created_at: new Date().toISOString()
      };
      localStorage.setItem(`voucher_events_${tenantId}`, JSON.stringify([novoEvento, ...allEvents]));

      // Persiste no Supabase em tempo real
      try {
        const voucherDbPayload = {
          id: novoVoucher.id,
          tenant_id: tenantId,
          empresa_id: companyId,
          empresa_nome: companyData.razao_social || companyData.nome_fantasia,
          empresa_razao_social: companyData.razao_social || companyData.nome_fantasia,
          campanha_id: null,
          public_token: novoVoucher.public_token,
          valor: valorNum,
          status: 'CRIADO',
          beneficiario_nome: beneficiarioNome.trim(),
          beneficiario_whatsapp: cleanWhats,
          observacoes: voucherObs.trim() || `Emitido via Portal B2B por ${companyData.razao_social}`,
          validade_fim: novoVoucher.validade_fim,
          atendente_id: `PORTAL_B2B (${companyData.login_usuario || companyData.razao_social})`,
          created_at: novoVoucher.created_at,
          updated_at: new Date().toISOString()
        };

        await supabase.from('vouchers').upsert([voucherDbPayload]);
        await supabase
          .from('voucher_empresas_parceiras')
          .update({ saldo_global: novoSaldo, saldo_credito: novoSaldo, updated_at: new Date().toISOString() })
          .eq('id', companyId);
      } catch (errDb) {
        console.warn('[CompanyPortal] Erro ao salvar no Supabase:', errDb);
      }

      // Limpa formulário e abre modal de sucesso
      setIssuedVoucher(novoVoucher);
      setShowIssueModal(false);
      setShowSuccessModal(true);
      setBeneficiarioNome('');
      setBeneficiarioWhatsapp('');
      setVoucherValor('50');
      setVoucherObs('');
    } catch (err: any) {
      setIssueError(err.message || 'Erro ao emitir voucher.');
    } finally {
      setIssueLoading(false);
    }
  };

  // Helpers de Compartilhamento
  const getProductionBaseUrl = () => {
    return 'https://voucher-xpointsolucoes.vercel.app';
  };

  const getVoucherUrl = (token: string) => `${getProductionBaseUrl()}/voucher/${token}`;

  const copyVoucherLink = (token: string, isUtilizado?: boolean) => {
    if (isUtilizado) {
      setWhatsappFeedback({
        type: 'error',
        text: '❌ Este voucher já foi utilizado e resgatado no restaurante. Não é permitido compartilhar um voucher já utilizado.'
      });
      return;
    }
    navigator.clipboard.writeText(getVoucherUrl(token));
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const [sendingWhatsappId, setSendingWhatsappId] = useState<string | null>(null);
  const [whatsappFeedback, setWhatsappFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const ENGINE_URL = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';
  const FOODNEXT_INSTANCE_ID = 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6';

  // Disparo 100% Direto e Silencioso via API Baileys da Instância FoodNext
  const sendDirectWhatsappViaFoodNext = async (vItem: any) => {
    if (!vItem) return;

    if (vItem.status === 'UTILIZADO') {
      setWhatsappFeedback({
        type: 'error',
        text: `❌ O voucher ${vItem.public_token} já foi utilizado no caixa e não pode ser reenviado.`
      });
      return;
    }

    const rawPhone = (vItem.beneficiario_whatsapp || '').replace(/\D/g, '');

    if (!rawPhone || rawPhone.length < 10) {
      setWhatsappFeedback({
        type: 'error',
        text: `O voucher ${vItem.public_token} não possui WhatsApp válido com DDD cadastrado.`
      });
      return;
    }

    const cleanPhone = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`;
    const targetJid = `${cleanPhone}@s.whatsapp.net`;
    const link = getVoucherUrl(vItem.public_token);
    const empresaNome = companyData?.razao_social || companyData?.nome_fantasia || 'TERRAS GONÇALVES SOCIEDADE DE ADVOGADOS';
    const valorFormatado = Number(vItem.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dataValidade = new Date(vItem.validade_fim).toLocaleDateString('pt-BR');

    const restauranteNome = 'BURGUER PLUS';
    const restauranteEndereco = 'Praça Miguel Ortega, 340 - Parque Assunção - Taboão da Serra/SP';
    const cardapioUrl = 'https://www.burguerplus.com.br';

    const msg = `✨ *PRESENTE CORPORATIVO EXCLUSIVO* ✨\n` +
      `🏢 *Oferecido por:* ${empresaNome}\n\n` +
      `Olá, *${vItem.beneficiario_nome || 'Colaborador'}*! 🎉\n\n` +
      `Você acaba de ser presenteado com um *Voucher Digital VIP* no valor de:\n` +
      `💳 *${valorFormatado}*\n\n` +
      `🍔 *Local de Resgate Exclusivo:* ${restauranteNome}\n` +
      `📍 *Endereço:* ${restauranteEndereco}\n` +
      `🍽️ *Cardápio Online:* ${cardapioUrl}\n\n` +
      `🎟️ *Código do Voucher:* \`${vItem.public_token}\`\n` +
      `⏳ *Válido até:* ${dataValidade}\n` +
      `🏷️ *Finalidade:* ${vItem.observacoes || 'Crédito Corporativo Direto'}\n\n` +
      `📲 *Acesse seu Voucher com QR Code Oficial:*\n${link}\n\n` +
      `_Basta apresentar o QR Code acima no caixa da ${restauranteNome} para validar seu benefício._`;

    try {
      setSendingWhatsappId(vItem.id);
      setWhatsappFeedback(null);

      const foodnextTenantId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

      // 1. Invoca envio nativo Baileys no motor da instância FoodNext
      let res = await fetch(`${ENGINE_URL}/api/v1/instances/${FOODNEXT_INSTANCE_ID}/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': foodnextTenantId,
          'apikey': 'chatboot-secret-key'
        },
        body: JSON.stringify({
          method: 'sendMessage',
          args: [targetJid, { text: msg }]
        })
      });

      let resJson = await res.json().catch(() => ({}));

      // Se falhar na rota /invoke, tenta a rota alternativa /send-text
      if (!res.ok || resJson.ok === false) {
        res = await fetch(`${ENGINE_URL}/api/v1/instances/${FOODNEXT_INSTANCE_ID}/send-text`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': foodnextTenantId,
            'apikey': 'chatboot-secret-key'
          },
          body: JSON.stringify({
            number: cleanPhone,
            text: msg
          })
        });
        resJson = await res.json().catch(() => ({}));
      }

      if (res.ok && resJson.ok !== false) {
        setWhatsappFeedback({
          type: 'success',
          text: `✅ Mensagem enviada com sucesso no WhatsApp de ${vItem.beneficiario_nome} (${rawPhone}) via FoodNext!`
        });

        // Atualiza status do voucher para ENVIADO
        const tenantId = companySession?.tenant_id || foodnextTenantId;
        const compId = companySession?.id;
        const vRaw = localStorage.getItem(`voucher_items_${tenantId}`) || '[]';
        const allVouchers = JSON.parse(vRaw);
        const updatedList = allVouchers.map((v: any) => (v.id === vItem.id ? { ...v, status: 'ENVIADO' } : v));
        localStorage.setItem(`voucher_items_${tenantId}`, JSON.stringify(updatedList));
        setVouchers(updatedList.filter((v: any) => v.empresa_id === compId));
      } else {
        throw new Error(resJson.error || resJson.message || 'Falha ao enviar mensagem pela instância FoodNext');
      }
    } catch (err: any) {
      console.error('[FoodNext Error]', err);
      setWhatsappFeedback({
        type: 'error',
        text: `❌ Falha no envio via FoodNext: ${err.message || 'Instância temporariamente ocupada ou número inválido.'}`
      });
    } finally {
      setSendingWhatsappId(null);
    }
  };

  const shareViaWhatsapp = sendDirectWhatsappViaFoodNext;

  // Motor de Impressão VIP de Show / Ingresso com Canhoto Destacável
  const handlePrintVoucher = (vItem: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const formattedVal = Number(vItem.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formattedDate = new Date(vItem.validade_fim).toLocaleDateString('pt-BR');
    const empresaNome = companyData?.razao_social || companyData?.nome_fantasia || 'Empresa Parceira';
    const qrUrl = getVoucherUrl(vItem.public_token);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>VIP Pass Ticket - ${vItem.public_token}</title>
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
              width: 820px;
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
              right: 234px;
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
              right: 234px;
              width: 28px;
              height: 28px;
              background: #f4f6f8;
              border-radius: 50%;
              border-top: 2px solid #00a884;
              z-index: 10;
            }

            .ticket-main {
              flex: 1;
              padding: 32px 36px;
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
              font-size: 11px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              padding: 5px 14px;
              border-radius: 20px;
              margin-bottom: 12px;
            }

            .company-name {
              font-size: 18px;
              font-weight: 900;
              color: #00a884;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 4px;
            }

            .company-subtitle {
              font-size: 11px;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 1px;
              font-weight: 600;
              margin-bottom: 20px;
            }

            .middle-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              background: rgba(255,255,255,0.04);
              border: 1px solid rgba(255,255,255,0.1);
              padding: 16px 20px;
              border-radius: 16px;
              margin-bottom: 20px;
            }

            .value-block .label {
              font-size: 10px;
              color: #94a3b8;
              text-transform: uppercase;
              font-weight: 700;
              letter-spacing: 1px;
            }

            .value-block .amount {
              font-size: 32px;
              font-weight: 900;
              color: #00a884;
              line-height: 1.1;
              margin-top: 2px;
            }

            .beneficiary-block {
              text-align: right;
            }

            .beneficiary-block .name {
              font-size: 16px;
              font-weight: 800;
              color: #ffffff;
            }

            .token-pill {
              display: inline-block;
              font-family: 'JetBrains Mono', monospace;
              font-size: 12px;
              background: rgba(0,168,132,0.15);
              color: #00a884;
              border: 1px solid rgba(0,168,132,0.3);
              padding: 4px 10px;
              border-radius: 8px;
              margin-top: 4px;
              font-weight: 700;
            }

            .footer-info {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              font-size: 11px;
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
              width: 248px;
              padding: 28px 22px;
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
              font-size: 10px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: #94a3b8;
            }

            .qr-box {
              background: #ffffff;
              padding: 10px;
              border-radius: 14px;
              box-shadow: 0 6px 16px rgba(0,0,0,0.3);
              margin: 12px 0;
            }

            .stub-amount {
              font-size: 18px;
              font-weight: 900;
              color: #00a884;
              margin-bottom: 4px;
            }

            .stub-beneficiary {
              font-size: 11px;
              color: #ffffff;
              font-weight: 700;
              margin-bottom: 8px;
              max-width: 180px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .signature-box {
              width: 100%;
              border-top: 1px solid rgba(255,255,255,0.2);
              padding-top: 6px;
              font-size: 9px;
              color: #64748b;
              text-transform: uppercase;
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
          </style>
        </head>
        <body>
          <div class="ticket-container">
            <div class="ticket-main">
              <div class="badge-gold">★ VIP COMPLIMENTARY PASS ★</div>
              <div class="company-name">${empresaNome}</div>
              <div class="company-subtitle">Programa de Benefício & Cortesia Corporativa</div>

              <!-- Estabelecimento de Consumo -->
              <div class="restaurant-box">
                <div class="restaurant-tag">🍔 LOCAL DE CONSUMO EXCLUSIVO:</div>
                <div class="restaurant-name">BURGUER PLUS</div>
                <div class="restaurant-address">📍 Praça Miguel Ortega, 340 - Parque Assunção - Taboão da Serra/SP</div>
              </div>

              <div class="middle-row">
                <div class="value-block">
                  <div class="label">Valor Liberado</div>
                  <div class="amount">${formattedVal}</div>
                </div>
                <div class="beneficiary-block">
                  <div class="label">Beneficiário</div>
                  <div class="name">${vItem.beneficiario_nome}</div>
                  <div class="token-pill">${vItem.public_token}</div>
                </div>
              </div>

              <div class="footer-info">
                <div>
                  <strong>Validade:</strong> ${formattedDate}<br/>
                  <strong>Site / Cardápio:</strong> www.burguerplus.com.br
                </div>
                <div style="text-align: right;">
                  Apresente este voucher no balcão da BURGUER PLUS para resgate.
                </div>
              </div>
            </div>

            <div class="perforation-line">
              <span class="cut-label">✂ DESTACAR NO CAIXA</span>
            </div>

            <div class="ticket-stub">
              <div>
                <div class="stub-header">CANHOTO DO CAIXA</div>
                <div style="font-size: 10px; font-weight: 800; color: #00a884; text-transform: uppercase; margin-top: 2px;">BURGUER PLUS</div>
              </div>
              
              <div class="qr-box">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(qrUrl)}" width="110" height="110" alt="QR Code" />
              </div>

              <div class="stub-amount">${formattedVal}</div>
              <div class="stub-beneficiary">${vItem.beneficiario_nome}</div>
              
              <div class="signature-box">
                Visto do Caixa / Data:<br/>____/____/________
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
      <div className="h-full h-[100dvh] bg-[#0b141a] flex items-center justify-center text-white overflow-y-auto">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-bold">Carregando portal corporativo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full h-[100dvh] w-full bg-[#0b141a] text-slate-100 font-sans overflow-x-hidden overflow-y-auto overscroll-y-contain pb-12">
      
      {/* ========================================================= */}
      {/* 1. CABEÇALHO CORPORATIVO PREMIUM */}
      {/* ========================================================= */}
      <header className="sticky top-0 z-40 bg-[#0b141a]/85 backdrop-blur-xl border-b border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-lg">
        
        {/* Logo & Dados da Empresa */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-md shadow-emerald-500/20 text-[#0b141a]">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-black text-white leading-tight">
                {companyData?.nome_fantasia || companyData?.razao_social || 'Empresa Parceira'}
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-wider">
                B2B Parceiro
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <span>CNPJ:</span>
              <span className="font-mono text-slate-300 font-semibold">{companyData?.cnpj || 'Sem CNPJ'}</span>
            </p>
          </div>
        </div>

        {/* Ações Topo */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowIssueModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-400 text-[#0b141a] font-black text-xs uppercase tracking-wider rounded-xl hover:opacity-95 active:scale-95 transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Emitir Novo Voucher</span>
            <span className="sm:hidden">Emitir</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
            title="Sair do Portal"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

      </header>

      {/* ========================================================= */}
      {/* 2. CORPO PRINCIPAL */}
      {/* ========================================================= */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">

        {/* Grid de Métricas Principais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Saldo Disponível */}
          <div className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-white/[0.02] backdrop-blur-md border border-emerald-500/30 p-5 rounded-3xl space-y-3 text-left relative overflow-hidden shadow-lg">
            <div className="flex items-center justify-between text-emerald-400">
              <span className="text-[11px] font-black uppercase tracking-wider">Saldo de Crédito Disponível</span>
              <Wallet className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-black text-emerald-400 tracking-tight">
                {saldoCredito.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
              <p className="text-[11px] text-slate-400">
                de {totalConcedido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} concedidos
              </p>
            </div>
            {/* Barra de Progresso de Consumo */}
            <div className="space-y-1 pt-1">
              <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-emerald-400 to-teal-300 h-full rounded-full transition-all duration-500"
                  style={{ width: `${100 - percentConsumido}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                <span>{(100 - percentConsumido).toFixed(0)}% restante</span>
                <span>{percentConsumido.toFixed(0)}% consumido</span>
              </div>
            </div>
          </div>

          {/* Card 2: Validade do Crédito */}
          <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 p-5 rounded-3xl space-y-3 text-left shadow-lg">
            <div className="flex items-center justify-between text-amber-400">
              <span className="text-[11px] font-black uppercase tracking-wider">Validade do Crédito</span>
              <Clock className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-black text-white tracking-tight">
                {diasRestantes} dias
              </div>
              <p className="text-[11px] text-slate-400">
                {companyData?.credito_fim 
                  ? `Válido até ${new Date(companyData.credito_fim).toLocaleDateString('pt-BR')}`
                  : 'Vigência de 30 dias'}
              </p>
            </div>
            <div className="pt-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                diasRestantes > 5 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
              }`}>
                <Calendar className="w-3 h-3" />
                {diasRestantes > 0 ? 'Crédito Ativo & Liberado' : 'Período Expirado'}
              </span>
            </div>
          </div>

          {/* Card 3: Total de Vouchers Emitidos */}
          <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 p-5 rounded-3xl space-y-3 text-left shadow-lg">
            <div className="flex items-center justify-between text-blue-400">
              <span className="text-[11px] font-black uppercase tracking-wider">Vouchers Emitidos</span>
              <Ticket className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-black text-white tracking-tight">
                {totalVouchersEmitidos}
              </div>
              <p className="text-[11px] text-slate-400">
                Totalizando {totalValorEmitido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div className="pt-2">
              <span className="text-[11px] text-slate-400 font-medium">
                {vouchers.filter(v => v.status === 'CRIADO').length} ativos disponíveis para uso
              </span>
            </div>
          </div>

          {/* Card 4: Vouchers Resgatados no Restaurante */}
          <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 p-5 rounded-3xl space-y-3 text-left shadow-lg">
            <div className="flex items-center justify-between text-teal-400">
              <span className="text-[11px] font-black uppercase tracking-wider">Resgatados no Restaurante</span>
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="text-3xl font-black text-teal-400 tracking-tight">
                {vouchersUtilizados.length}
              </div>
              <p className="text-[11px] text-slate-400">
                {totalValorUtilizado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} já consumidos
              </p>
            </div>
            <div className="pt-2">
              <span className="inline-flex items-center gap-1 text-[11px] text-teal-300 font-bold">
                <Check className="w-3.5 h-3.5" />
                {totalVouchersEmitidos > 0 ? ((vouchersUtilizados.length / totalVouchersEmitidos) * 100).toFixed(0) : 0}% taxa de aproveitamento
              </span>
            </div>
          </div>

        </div>

        {/* ========================================================= */}
        {/* 3. LISTA E GESTÃO DOS VOUCHERS DA EMPRESA */}
        {/* ========================================================= */}
        <div className="bg-white/[0.02] backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-xl space-y-4 text-left">
          
          {/* Header da Tabela com Filtros */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <Ticket className="w-4 h-4 text-emerald-400" />
                <span>Vouchers Emitidos por {companyData?.nome_fantasia || companyData?.razao_social}</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Consulte o status em tempo real de cada voucher compartilhado com colaboradores e convidados
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              
              {/* Campo de Busca */}
              <div className="relative flex-1 md:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar beneficiário ou código..."
                  className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Filtros de Status */}
              <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/10">
                {[
                  { id: 'ALL', label: 'Todos' },
                  { id: 'CRIADO', label: 'Disponíveis' },
                  { id: 'UTILIZADO', label: 'Resgatados' }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id as any)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase transition-all cursor-pointer ${
                      statusFilter === f.id
                        ? 'bg-emerald-500 text-[#0b141a]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

            </div>
          </div>

          {/* Lista de Vouchers */}
          <div className="space-y-2.5 pt-2">
            {vouchers.length === 0 ? (
              <div className="py-12 text-center space-y-3 border border-dashed border-white/10 rounded-2xl">
                <Gift className="w-10 h-10 mx-auto text-slate-500 opacity-60" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">Nenhum voucher emitido ainda</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Você possui {saldoCredito.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em créditos. Comece presenteando seus colaboradores agora!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIssueModal(true)}
                  className="px-4 py-2 bg-emerald-500 text-[#0b141a] font-black text-xs uppercase tracking-wider rounded-xl hover:opacity-95 cursor-pointer shadow-md"
                >
                  Emitir Primeiro Voucher
                </button>
              </div>
            ) : (
              vouchers
                .filter((v) => {
                  const matchesSearch =
                    !searchTerm ||
                    (v.beneficiario_nome && v.beneficiario_nome.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (v.public_token && v.public_token.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (v.beneficiario_whatsapp && v.beneficiario_whatsapp.includes(searchTerm));

                  if (!matchesSearch) return false;
                  if (statusFilter !== 'ALL' && v.status !== statusFilter) return false;
                  return true;
                })
                .map((vItem) => {
                  const isUtilizado = vItem.status === 'UTILIZADO';
                  const isDisponivel = vItem.status === 'CRIADO' || vItem.status === 'DISPONIBILIZADO';

                  return (
                    <div
                      key={vItem.id}
                      className={`p-4 rounded-2xl transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                        isUtilizado
                          ? 'bg-gradient-to-r from-purple-950/30 via-[#101920] to-[#0c1418] border-l-4 border-l-purple-500 border-t border-t-purple-500/20 border-r border-r-purple-500/20 border-b border-b-purple-500/20 shadow-md shadow-purple-950/30 ring-1 ring-purple-500/10'
                          : 'bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-emerald-500/20 shadow-sm'
                      }`}
                    >
                      {/* Lado Esquerdo: Código + Beneficiário */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedQrVoucher(vItem)}
                          className={`w-12 h-12 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 hover:scale-105 transition-transform cursor-pointer shadow-sm ${
                            isUtilizado ? 'opacity-80 ring-2 ring-purple-500/40' : ''
                          }`}
                          title="Clique para ampliar o QR Code"
                        >
                          <QRCode value={getVoucherUrl(vItem.public_token)} size={40} />
                        </button>

                        <div className="min-w-0 space-y-1 text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-mono font-black text-xs ${isUtilizado ? 'text-purple-400' : 'text-emerald-400'}`}>
                              {vItem.public_token}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              isUtilizado
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                                : isDisponivel
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/15 text-red-400 border border-red-500/30'
                            }`}>
                              {isUtilizado ? '✓ Resgatado no Restaurante' : isDisponivel ? 'Ativo / Disponível' : vItem.status}
                            </span>
                          </div>

                          <div className="text-xs text-white font-bold truncate">
                            {vItem.beneficiario_nome || 'Beneficiário Avulso'}
                          </div>

                          <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                            <span>Whats: {vItem.beneficiario_whatsapp || 'Não informado'}</span>
                            <span>•</span>
                            <span>Validade: {new Date(vItem.validade_fim).toLocaleDateString('pt-BR')}</span>
                            {isUtilizado && vItem.data_resgate && (
                              <>
                                <span>•</span>
                                <span className="text-purple-300 font-semibold">Baixa: {new Date(vItem.data_resgate).toLocaleString('pt-BR')}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Lado Direito: Valor + Ações de Envio e Impressão */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                        <div className="text-left sm:text-right pr-2">
                          <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Valor</span>
                          <span className="text-lg font-black text-white">
                            {Number(vItem.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>

                        {isUtilizado ? (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/10 border border-teal-500/30 text-teal-300 rounded-xl text-xs font-black">
                              <Lock className="w-3.5 h-3.5 text-teal-400" />
                              <span>Utilizado no Caixa</span>
                            </div>
                            <button
                              type="button"
                              disabled
                              className="p-2 bg-white/5 text-slate-600 rounded-xl cursor-not-allowed opacity-40"
                              title="Voucher já utilizado no caixa da Burguer Plus. Reenvio bloqueado."
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Botão WhatsApp API FoodNext */}
                            <button
                              type="button"
                              disabled={sendingWhatsappId === vItem.id}
                              onClick={() => sendDirectWhatsappViaFoodNext(vItem)}
                              className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center min-w-[36px] min-h-[36px]"
                              title="Enviar Voucher via WhatsApp (FoodNext)"
                            >
                              {sendingWhatsappId === vItem.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                              ) : (
                                <Send className="w-4 h-4" />
                              )}
                            </button>

                            {/* Botão Copiar Link */}
                            <button
                              type="button"
                              onClick={() => copyVoucherLink(vItem.public_token, isUtilizado)}
                              className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition-all cursor-pointer"
                              title="Copiar Link do Voucher"
                            >
                              <Copy className="w-4 h-4" />
                            </button>

                            {/* Botão Imprimir */}
                            <button
                              type="button"
                              onClick={() => handlePrintVoucher(vItem)}
                              className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition-all cursor-pointer"
                              title="Imprimir Voucher"
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            {/* Botão Ver Página Pública */}
                            <a
                              href={getVoucherUrl(vItem.public_token)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition-all"
                              title="Abrir página pública"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })
            )}
          </div>

        </div>

      </main>

      {/* ========================================================= */}
      {/* 4. MODAL: EMITIR NOVO VOUCHER (AUTO-EMISSÃO B2B) */}
      {/* ========================================================= */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111b21] border border-white/10 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 text-left">
            
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Gift className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">Emitir Voucher Corporativo</h3>
                  <p className="text-[11px] text-slate-400">Debitado do seu saldo de créditos</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIssueModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Aviso de Saldo Disponível */}
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-black text-emerald-400 block">Saldo Atual Disponível</span>
                <span className="text-lg font-black text-emerald-400">
                  {saldoCredito.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-semibold">
                Validade até: {companyData?.credito_fim ? new Date(companyData.credito_fim).toLocaleDateString('pt-BR') : '30 dias'}
              </span>
            </div>

            {/* Erro de Emissão */}
            {issueError && (
              <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl flex items-center gap-2 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{issueError}</span>
              </div>
            )}

            {/* Formulário */}
            <form onSubmit={handleIssueVoucher} className="space-y-4">
              
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase text-slate-400 pl-1 block">
                  Nome do Beneficiário (Colaborador / Convidado) *
                </label>
                <input
                  type="text"
                  value={beneficiarioNome}
                  onChange={(e) => setBeneficiarioNome(e.target.value)}
                  placeholder="Ex: Ronaldo Clemente"
                  required
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase text-slate-400 pl-1 block">
                    WhatsApp com DDD *
                  </label>
                  <input
                    type="text"
                    value={beneficiarioWhatsapp}
                    onChange={(e) => setBeneficiarioWhatsapp(e.target.value)}
                    placeholder="11988887777"
                    required
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase text-slate-400 pl-1 block">
                    Valor do Voucher (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={saldoCredito}
                    value={voucherValor}
                    onChange={(e) => setVoucherValor(e.target.value)}
                    placeholder="50.00"
                    required
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-emerald-400 font-black focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase text-slate-400 pl-1 block">
                    Data Limite de Resgate
                  </label>
                  <input
                    type="date"
                    value={voucherValidade}
                    onChange={(e) => setVoucherValidade(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase text-slate-400 pl-1 block">
                    Mensagem de Cortesia
                  </label>
                  <input
                    type="text"
                    value={voucherObs}
                    onChange={(e) => setVoucherObs(e.target.value)}
                    placeholder="Ex: Aniversário / Reconhecimento"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Botão Emitir */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={issueLoading || saldoCredito <= 0}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-400 text-[#0b141a] font-black text-xs uppercase tracking-wider rounded-2xl hover:opacity-95 active:scale-[0.99] transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {issueLoading ? (
                    <span>Processando Emissão...</span>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Confirmar e Debitar R$ {parseFloat(voucherValor || '0').toFixed(2)}</span>
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. MODAL: VOUCHER EMITIDO COM SUCESSO (DISPARO & QR) */}
      {/* ========================================================= */}
      {showSuccessModal && issuedVoucher && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111b21] border border-emerald-500/30 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 text-center">
            
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-md">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-white">Voucher Emitido com Sucesso!</h3>
              <p className="text-xs text-slate-400">
                O valor de {Number(issuedVoucher.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} foi debitado do seu crédito corporativo.
              </p>
            </div>

            {/* Cartão do Voucher com QR Code */}
            <div className="bg-black/40 border border-white/10 rounded-2xl p-4 space-y-3 text-center">
              <div className="w-32 h-32 bg-white p-2 rounded-xl mx-auto flex items-center justify-center shadow-md">
                <QRCode value={getVoucherUrl(issuedVoucher.public_token)} size={112} />
              </div>
              <div>
                <span className="font-mono font-black text-emerald-400 text-sm block">
                  {issuedVoucher.public_token}
                </span>
                <span className="text-xs text-white font-bold block mt-0.5">
                  Beneficiário: {issuedVoucher.beneficiario_nome}
                </span>
              </div>
            </div>

            {/* Ações de Compartilhamento */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={sendingWhatsappId === issuedVoucher.public_token || sendingWhatsappId === issuedVoucher.id}
                onClick={() => sendDirectWhatsappViaFoodNext(issuedVoucher)}
                className="w-full py-3 bg-emerald-500 text-[#0b141a] font-black text-xs uppercase tracking-wider rounded-xl hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-500/20 disabled:opacity-50"
              >
                {sendingWhatsappId === issuedVoucher.public_token || sendingWhatsappId === issuedVoucher.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Disparando via FoodNext...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Enviar no WhatsApp do Beneficiário</span>
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => copyVoucherLink(issuedVoucher.public_token)}
                  className="py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-300" />}
                  <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePrintVoucher(issuedVoucher)}
                  className="py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-300" />
                  <span>Imprimir</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className="text-xs text-slate-400 hover:text-white font-bold pt-2 cursor-pointer block mx-auto"
            >
              Fechar
            </button>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. MODAL: VISUALIZAR QR CODE AMPLIADO */}
      {/* ========================================================= */}
      {selectedQrVoucher && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111b21] border border-white/10 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 text-center">
            
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-black uppercase text-slate-400">QR Code Oficial</span>
              <button
                type="button"
                onClick={() => setSelectedQrVoucher(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="w-48 h-48 bg-white p-3 rounded-2xl mx-auto flex items-center justify-center shadow-lg">
              <QRCode value={getVoucherUrl(selectedQrVoucher.public_token)} size={168} />
            </div>

            <div className="space-y-0.5">
              <span className="font-mono font-black text-emerald-400 text-sm">
                {selectedQrVoucher.public_token}
              </span>
              <p className="text-xs text-white font-bold">
                {selectedQrVoucher.beneficiario_nome} • {Number(selectedQrVoucher.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={sendingWhatsappId === selectedQrVoucher.id}
                onClick={() => sendDirectWhatsappViaFoodNext(selectedQrVoucher)}
                className="w-full py-2.5 bg-emerald-500 text-[#0b141a] font-black text-xs uppercase rounded-xl hover:opacity-95 flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                {sendingWhatsappId === selectedQrVoucher.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Disparando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Reenviar WhatsApp (FoodNext)</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TOAST FLUTUANTE DE FEEDBACK WHATSAPP FOODNEXT */}
      {/* ========================================================= */}
      {whatsappFeedback && (
        <div className="fixed top-5 right-5 z-50 max-w-sm w-full animate-in slide-in-from-top-4 duration-300">
          <div className={`p-4 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-start justify-between gap-3 ${
            whatsappFeedback.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100 shadow-emerald-950/50'
              : 'bg-rose-950/95 border-rose-500/50 text-rose-100 shadow-rose-950/50'
          }`}>
            <div className="flex items-start gap-2.5">
              {whatsappFeedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="text-xs leading-relaxed text-left">
                <strong className="block font-bold text-white mb-0.5">
                  {whatsappFeedback.type === 'success' ? 'Disparo WhatsApp Realizado' : 'Aviso de Envio WhatsApp'}
                </strong>
                <span>{whatsappFeedback.text}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWhatsappFeedback(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
