import React, { useState, useEffect, useCallback } from 'react';
import {
  Ticket,
  Plus,
  Search,
  Building2,
  Users,
  Calendar,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Clock,
  Send,
  ExternalLink,
  ShieldCheck,
  FileText,
  AlertCircle,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  QrCode,
  Sparkles,
  Lock,
  History,
  X,
  Smartphone,
  PhoneCall,
  Percent,
  Gift,
  Edit2,
  PlusCircle,
  Layers,
  ChevronRight,
  User
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';

const ENGINE_URL = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';

const DEFAULT_COMPANIES = [
  {
    id: 'emp-1',
    razao_social: 'Tech Solutions Corp',
    nome_fantasia: 'TechCorp',
    cnpj: '12.345.678/0001-90',
    contato_nome: 'Carlos Eduardo',
    contato_whatsapp: '11988887777',
    limite_vouchers: 100,
    created_at: new Date().toISOString()
  }
];

const DEFAULT_CAMPAIGNS = [
  {
    id: 'cmp-1',
    empresa_id: 'emp-1',
    nome: 'Almoço Executivo Sexta-Feira',
    descricao: 'Benefício exclusivo para colaboradores de empresas parceiras',
    tipo_desconto: 'VALOR_FIXO',
    valor_desconto: 40.0,
    data_fim: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString()
  }
];

export default function VoucherDashboard() {
  const tenantInfo = useChatStore((state) => state.tenantInfo);
  const tenantId = tenantInfo?.id || '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

  const [activeTab, setActiveTab] = useState<'vouchers' | 'campanhas' | 'empresas' | 'auditoria'>('vouchers');
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Estados dos Dados
  const [vouchers, setVouchers] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem(`voucher_items_${tenantId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [campanhas, setCampanhas] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem(`voucher_campaigns_${tenantId}`);
      return saved ? JSON.parse(saved) : DEFAULT_CAMPAIGNS;
    } catch {
      return DEFAULT_CAMPAIGNS;
    }
  });

  const [empresas, setEmpresas] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem(`voucher_companies_${tenantId}`);
      return saved ? JSON.parse(saved) : DEFAULT_COMPANIES;
    } catch {
      return DEFAULT_COMPANIES;
    }
  });

  const [events, setEvents] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem(`voucher_events_${tenantId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modais de Criação e Edição
  const [showCreateVoucherModal, setShowCreateVoucherModal] = useState<boolean>(false);
  const [showCompanyModal, setShowCompanyModal] = useState<boolean>(false);
  const [editingCompany, setEditingCompany] = useState<any | null>(null);

  const [showCampaignModal, setShowCampaignModal] = useState<boolean>(false);
  const [editingCampaign, setEditingCampaign] = useState<any | null>(null);

  // Form Voucher (Lote ou Individual)
  const [voucherEmissionMode, setVoucherEmissionMode] = useState<'individual' | 'lote'>('individual');
  const [voucherForm, setVoucherForm] = useState({
    campanhaId: '',
    empresaId: '',
    beneficiarioNome: '',
    beneficiarioWhatsapp: '',
    quantidade: 5,
    valor: 40.0,
    validadeFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  // Form Campanha
  const [campaignForm, setCampaignForm] = useState({
    empresaId: '',
    nome: '',
    descricao: '',
    tipoDesconto: 'VALOR_FIXO',
    valorDesconto: 40.0,
    dataFim: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  // Form Empresa
  const [companyForm, setCompanyForm] = useState({
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    contatoNome: '',
    contatoWhatsapp: '',
    limiteVouchers: 100
  });

  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Sincroniza selects com entidades ativas
  useEffect(() => {
    if (empresas.length > 0) {
      if (!campaignForm.empresaId) setCampaignForm((prev) => ({ ...prev, empresaId: empresas[0].id }));
      if (!voucherForm.empresaId) setVoucherForm((prev) => ({ ...prev, empresaId: empresas[0].id }));
    }
    if (campanhas.length > 0 && !voucherForm.campanhaId) {
      setVoucherForm((prev) => ({ ...prev, campanhaId: campanhas[0].id, valor: campanhas[0].valor_desconto || 40.0 }));
    }
  }, [empresas, campanhas]);

  // Carrega dados do Supabase com fallback de cache
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const [vRes, cRes, eRes, evRes] = await Promise.allSettled([
        supabase.from('vouchers').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('voucher_campanhas').select('*').order('created_at', { ascending: false }),
        supabase.from('voucher_empresas_parceiras').select('*').order('created_at', { ascending: false }),
        supabase.from('voucher_events').select('*').order('created_at', { ascending: false }).limit(50)
      ]);

      if (vRes.status === 'fulfilled' && vRes.value.data && vRes.value.data.length > 0) {
        setVouchers(vRes.value.data);
        localStorage.setItem(`voucher_items_${tenantId}`, JSON.stringify(vRes.value.data));
      }
      if (cRes.status === 'fulfilled' && cRes.value.data && cRes.value.data.length > 0) {
        setCampanhas(cRes.value.data);
        localStorage.setItem(`voucher_campaigns_${tenantId}`, JSON.stringify(cRes.value.data));
      }
      if (eRes.status === 'fulfilled' && eRes.value.data && eRes.value.data.length > 0) {
        setEmpresas(eRes.value.data);
        localStorage.setItem(`voucher_companies_${tenantId}`, JSON.stringify(eRes.value.data));
      }
      if (evRes.status === 'fulfilled' && evRes.value.data && evRes.value.data.length > 0) {
        setEvents(evRes.value.data);
        localStorage.setItem(`voucher_events_${tenantId}`, JSON.stringify(evRes.value.data));
      }
    } catch (err: any) {
      console.warn('Carregamento com cache local ativo:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ==============================================================================
  // GESTÃO INLINE DE EMPRESA PARCEIRA (Criação e Edição)
  // ==============================================================================
  const openNewCompanyModal = () => {
    setEditingCompany(null);
    setCompanyForm({
      razaoSocial: '',
      nomeFantasia: '',
      cnpj: '',
      contatoNome: '',
      contatoWhatsapp: '',
      limiteVouchers: 100
    });
    setShowCompanyModal(true);
  };

  const openEditCompanyModal = (comp: any) => {
    setEditingCompany(comp);
    setCompanyForm({
      razaoSocial: comp.razao_social || '',
      nomeFantasia: comp.nome_fantasia || '',
      cnpj: comp.cnpj || '',
      contatoNome: comp.contato_nome || '',
      contatoWhatsapp: comp.contato_whatsapp || '',
      limiteVouchers: comp.limite_vouchers || 100
    });
    setShowCompanyModal(true);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm.razaoSocial.trim()) {
      setActionError('Por favor, informe a Razão Social da empresa.');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);

      if (editingCompany) {
        // EDIÇÃO
        const updatedObj = {
          ...editingCompany,
          razao_social: companyForm.razaoSocial.trim(),
          nome_fantasia: companyForm.nomeFantasia.trim() || companyForm.razaoSocial.trim(),
          cnpj: companyForm.cnpj.trim(),
          contato_nome: companyForm.contatoNome.trim(),
          contato_whatsapp: companyForm.contatoWhatsapp.replace(/\D/g, ''),
          limite_vouchers: Number(companyForm.limiteVouchers) || 100,
          updated_at: new Date().toISOString()
        };

        try {
          await supabase.from('voucher_empresas_parceiras').update(updatedObj).eq('id', editingCompany.id);
        } catch (dbErr) {
          console.warn('Update via store local:', dbErr);
        }

        const newList = empresas.map((emp) => (emp.id === editingCompany.id ? updatedObj : emp));
        setEmpresas(newList);
        localStorage.setItem(`voucher_companies_${tenantId}`, JSON.stringify(newList));
        setActionSuccess(`Empresa '${updatedObj.razao_social}' atualizada com sucesso!`);
      } else {
        // CRIAÇÃO
        const newCompany = {
          id: 'emp-' + Math.random().toString(36).substring(2, 9),
          tenant_id: tenantId,
          razao_social: companyForm.razaoSocial.trim(),
          nome_fantasia: companyForm.nomeFantasia.trim() || companyForm.razaoSocial.trim(),
          cnpj: companyForm.cnpj.trim(),
          contato_nome: companyForm.contatoNome.trim(),
          contato_whatsapp: companyForm.contatoWhatsapp.replace(/\D/g, ''),
          limite_vouchers: Number(companyForm.limiteVouchers) || 100,
          ativo: true,
          created_at: new Date().toISOString()
        };

        try {
          await supabase.from('voucher_empresas_parceiras').insert(newCompany);
        } catch (dbErr) {
          console.warn('Insert via store local:', dbErr);
        }

        const newList = [newCompany, ...empresas];
        setEmpresas(newList);
        localStorage.setItem(`voucher_companies_${tenantId}`, JSON.stringify(newList));

        // Seleciona automaticamente no formulário de emissão/campanha
        setVoucherForm((prev) => ({ ...prev, empresaId: newCompany.id }));
        setCampaignForm((prev) => ({ ...prev, empresaId: newCompany.id }));

        setActionSuccess(`Empresa '${newCompany.razao_social}' criada e selecionada com sucesso!`);
      }

      setShowCompanyModal(false);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || 'Erro ao salvar empresa.');
    } finally {
      setActionLoading(false);
    }
  };

  // ==============================================================================
  // GESTÃO INLINE DE CAMPANHA (Criação e Edição)
  // ==============================================================================
  const openNewCampaignModal = () => {
    setEditingCampaign(null);
    setCampaignForm({
      empresaId: voucherForm.empresaId || empresas[0]?.id || '',
      nome: '',
      descricao: '',
      tipoDesconto: 'VALOR_FIXO',
      valorDesconto: 40.0,
      dataFim: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
    setShowCampaignModal(true);
  };

  const openEditCampaignModal = (cmp: any) => {
    setEditingCampaign(cmp);
    setCampaignForm({
      empresaId: cmp.empresa_id || empresas[0]?.id || '',
      nome: cmp.nome || '',
      descricao: cmp.descricao || '',
      tipoDesconto: cmp.tipo_desconto || 'VALOR_FIXO',
      valorDesconto: cmp.valor_desconto || 40.0,
      dataFim: cmp.data_fim ? cmp.data_fim.split('T')[0] : new Date().toISOString().split('T')[0]
    });
    setShowCampaignModal(true);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignForm.nome.trim()) {
      setActionError('Por favor, informe o nome da campanha.');
      return;
    }
    if (!campaignForm.empresaId && empresas.length === 0) {
      setActionError('Cadastre uma Empresa Parceira primeiro.');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);

      const selectedEmpresa = empresas.find((emp) => emp.id === campaignForm.empresaId) || empresas[0];

      if (editingCampaign) {
        // EDIÇÃO
        const updatedObj = {
          ...editingCampaign,
          empresa_id: selectedEmpresa?.id,
          empresa_nome: selectedEmpresa?.razao_social,
          nome: campaignForm.nome.trim(),
          descricao: campaignForm.descricao.trim(),
          tipo_desconto: campaignForm.tipoDesconto,
          valor_desconto: Number(campaignForm.valorDesconto) || 40.0,
          data_fim: new Date(campaignForm.dataFim).toISOString(),
          updated_at: new Date().toISOString()
        };

        try {
          await supabase.from('voucher_campanhas').update(updatedObj).eq('id', editingCampaign.id);
        } catch (dbErr) {
          console.warn('Update via store local:', dbErr);
        }

        const newList = campanhas.map((c) => (c.id === editingCampaign.id ? updatedObj : c));
        setCampanhas(newList);
        localStorage.setItem(`voucher_campaigns_${tenantId}`, JSON.stringify(newList));
        setActionSuccess(`Campanha '${updatedObj.nome}' atualizada com sucesso!`);
      } else {
        // CRIAÇÃO
        const newCampaign = {
          id: 'cmp-' + Math.random().toString(36).substring(2, 9),
          tenant_id: tenantId,
          empresa_id: selectedEmpresa?.id,
          empresa_nome: selectedEmpresa?.razao_social,
          nome: campaignForm.nome.trim(),
          descricao: campaignForm.descricao.trim(),
          tipo_desconto: campaignForm.tipoDesconto,
          valor_desconto: Number(campaignForm.valorDesconto) || 40.0,
          data_fim: new Date(campaignForm.dataFim).toISOString(),
          ativo: true,
          created_at: new Date().toISOString()
        };

        try {
          await supabase.from('voucher_campanhas').insert(newCampaign);
        } catch (dbErr) {
          console.warn('Insert via store local:', dbErr);
        }

        const newList = [newCampaign, ...campanhas];
        setCampanhas(newList);
        localStorage.setItem(`voucher_campaigns_${tenantId}`, JSON.stringify(newList));

        // Seleciona automaticamente no formulário de emissão
        setVoucherForm((prev) => ({
          ...prev,
          campanhaId: newCampaign.id,
          valor: newCampaign.valor_desconto
        }));

        setActionSuccess(`Campanha '${newCampaign.nome}' criada e selecionada com sucesso!`);
      }

      setShowCampaignModal(false);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || 'Erro ao salvar campanha.');
    } finally {
      setActionLoading(false);
    }
  };

  // ==============================================================================
  // EMISSÃO DE VOUCHERS (Individual ou Lote)
  // ==============================================================================
  const handleCreateVouchers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (campanhas.length === 0) {
      setActionError('Crie uma Campanha primeiro para poder emitir vouchers.');
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);

      const selectedCampanha = campanhas.find((c) => c.id === voucherForm.campanhaId) || campanhas[0];
      const selectedEmpresa = empresas.find((e) => e.id === voucherForm.empresaId) || empresas[0];
      const countToEmit = voucherEmissionMode === 'individual' ? 1 : Number(voucherForm.quantidade) || 5;

      const newVouchers: any[] = [];
      const newEvents: any[] = [];

      for (let i = 0; i < countToEmit; i++) {
        const publicToken = 'VCH-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const voucherItem = {
          id: 'vch-' + Math.random().toString(36).substring(2, 9),
          tenant_id: tenantId,
          campanha_id: selectedCampanha?.id,
          empresa_id: selectedEmpresa?.id,
          public_token: publicToken,
          status: 'CRIADO',
          valor: Number(voucherForm.valor) || Number(selectedCampanha?.valor_desconto) || 40.0,
          beneficiario_nome:
            voucherEmissionMode === 'individual'
              ? voucherForm.beneficiarioNome.trim() || 'Colaborador'
              : `Beneficiário #${i + 1}`,
          beneficiario_whatsapp:
            voucherEmissionMode === 'individual' ? voucherForm.beneficiarioWhatsapp.replace(/\D/g, '') : '',
          validade_fim: new Date(voucherForm.validadeFim).toISOString(),
          created_at: new Date().toISOString(),
          voucher_campanhas: { nome: selectedCampanha?.nome },
          voucher_empresas_parceiras: { razao_social: selectedEmpresa?.razao_social }
        };

        newVouchers.push(voucherItem);

        newEvents.push({
          id: 'ev-' + Math.random().toString(36).substring(2, 9),
          tenant_id: tenantId,
          voucher_id: voucherItem.id,
          status_anterior: null,
          status_novo: 'CRIADO',
          data_hora: new Date().toISOString(),
          usuario_responsavel: 'SISTEMA_GESTAO',
          motivo: voucherEmissionMode === 'individual' ? 'Emissão Nominal Individual' : 'Emissão em Lote'
        });
      }

      try {
        await supabase.from('vouchers').insert(newVouchers);
      } catch (dbErr) {
        console.warn('Persistindo na store local:', dbErr);
      }

      const updatedVouchers = [...newVouchers, ...vouchers];
      const updatedEvents = [...newEvents, ...events];

      setVouchers(updatedVouchers);
      setEvents(updatedEvents);

      localStorage.setItem(`voucher_items_${tenantId}`, JSON.stringify(updatedVouchers));
      localStorage.setItem(`voucher_events_${tenantId}`, JSON.stringify(updatedEvents));

      setShowCreateVoucherModal(false);
      setVoucherForm({
        campanhaId: campanhas[0]?.id || '',
        empresaId: empresas[0]?.id || '',
        beneficiarioNome: '',
        beneficiarioWhatsapp: '',
        quantidade: 5,
        valor: 40.0,
        validadeFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });

      setActionSuccess(
        voucherEmissionMode === 'individual'
          ? `Voucher ${newVouchers[0].public_token} emitido com sucesso!`
          : `Lote com ${newVouchers.length} vouchers emitido com sucesso!`
      );
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || 'Erro ao emitir vouchers.');
    } finally {
      setActionLoading(false);
    }
  };

  // Disparo via WhatsApp
  const handleSendWhatsApp = async (voucher: any) => {
    try {
      setActionLoading(true);
      setActionError(null);
      setActionSuccess(null);

      const phone = voucher.beneficiario_whatsapp || '1141351987';
      const cleanPhone = phone.replace(/\D/g, '');
      const voucherUrl = `${window.location.origin}/voucher/${voucher.public_token}`;
      const valorFormatado = Number(voucher.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      const messageText = `🎟️ *Seu Voucher Digital Corporativo Chegou!*\n\n` +
        `Olá *${voucher.beneficiario_nome || 'Colaborador'}*,\n` +
        `Você recebeu um voucher corporativo especial de *${voucher.voucher_empresas_parceiras?.razao_social || 'Empresa Parceira'}*.\n\n` +
        `💰 *Valor:* ${valorFormatado}\n` +
        `🏷️ *Campanha:* ${voucher.voucher_campanhas?.nome || 'Benefício Corporativo'}\n` +
        `⏳ *Validade:* ${new Date(voucher.validade_fim).toLocaleDateString('pt-BR')}\n\n` +
        `👉 *Acesse seu Voucher e QR Code:*\n${voucherUrl}\n\n` +
        `_Apresente o QR Code no caixa para resgatar seu benefício._`;

      await fetch(`${ENGINE_URL}/api/v1/message/sendText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone,
          text: messageText
        })
      });

      const updatedList = vouchers.map((v) => (v.id === voucher.id ? { ...v, status: 'ENVIADO' } : v));
      setVouchers(updatedList);
      localStorage.setItem(`voucher_items_${tenantId}`, JSON.stringify(updatedList));

      setActionSuccess(`Voucher ${voucher.public_token} enviado via WhatsApp!`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || 'Erro ao disparar WhatsApp.');
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setActionLoading(false);
    }
  };

  // Métricas
  const totalEmitidos = vouchers.length;
  const totalUtilizados = vouchers.filter((v) => v.status === 'UTILIZADO').length;
  const totalAtivos = vouchers.filter((v) => v.status !== 'UTILIZADO' && v.status !== 'CANCELADO' && v.status !== 'EXPIRADO').length;
  const valorTotalResgatado = vouchers
    .filter((v) => v.status === 'UTILIZADO')
    .reduce((acc, v) => acc + Number(v.valor || 0), 0);
  const taxaConversao = totalEmitidos > 0 ? Math.round((totalUtilizados / totalEmitidos) * 100) : 0;

  const filteredVouchers = vouchers.filter((v) => {
    const q = searchTerm.toLowerCase();
    return (
      v.public_token?.toLowerCase().includes(q) ||
      v.beneficiario_nome?.toLowerCase().includes(q) ||
      v.voucher_campanhas?.nome?.toLowerCase().includes(q) ||
      v.voucher_empresas_parceiras?.razao_social?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] dark:bg-[#111b21] text-slate-900 dark:text-slate-100 overflow-y-auto p-3 sm:p-5 md:p-6 lg:p-8 space-y-5 overflow-x-hidden">
      
      {/* Header Principal Responsivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 border-b border-black/10 dark:border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25 border border-white/20 shrink-0">
            <Ticket className="w-6 h-6" />
          </div>
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black tracking-tight">Voucher Gestão</h1>
              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Corporativo
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
              Vouchers digitais corporativos com antifraude e automação WhatsApp.
            </p>
          </div>
        </div>

        {/* Botões de Ação Principais (Mínimo 48px de toque) */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={() => window.open('/voucher-scanner', '_blank')}
            className="flex-1 sm:flex-initial px-4 py-3 bg-white dark:bg-[#1f2c34] hover:bg-slate-100 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm min-h-[48px] active:scale-95"
          >
            <QrCode className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Terminal Caixa</span>
          </button>

          <button
            onClick={() => setShowCreateVoucherModal(true)}
            className="flex-1 sm:flex-initial px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/30 active:scale-95 cursor-pointer min-h-[48px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Emitir Voucher / Lote</span>
          </button>
        </div>
      </div>

      {/* Alertas de Ação */}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-600 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 bg-rose-500/20 border border-rose-500/40 rounded-2xl text-rose-600 dark:text-rose-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Grid de Métricas Executivas (Responsivo com Zero Overflow) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-[#1f2c34] p-4 rounded-2xl border border-black/5 dark:border-white/10 shadow-sm space-y-1 min-w-0">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-black uppercase tracking-wider">Total Emitidos</span>
            <Ticket className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black tracking-tight">{totalEmitidos}</div>
          <span className="text-[10px] text-slate-400 font-bold block truncate">{empresas.length} empresas parceiras</span>
        </div>

        <div className="bg-white dark:bg-[#1f2c34] p-4 rounded-2xl border border-black/5 dark:border-white/10 shadow-sm space-y-1 min-w-0">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-black uppercase tracking-wider">Total Resgatado</span>
            <DollarSign className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-black tracking-tight text-emerald-500 truncate">
            {valorTotalResgatado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
          <span className="text-[10px] text-slate-400 font-bold block truncate">{totalUtilizados} baixas confirmadas</span>
        </div>

        <div className="bg-white dark:bg-[#1f2c34] p-4 rounded-2xl border border-black/5 dark:border-white/10 shadow-sm space-y-1 min-w-0">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-black uppercase tracking-wider">Vouchers Ativos</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black tracking-tight text-amber-500">{totalAtivos}</div>
          <span className="text-[10px] text-slate-400 font-bold block truncate">Prontos para resgate</span>
        </div>

        <div className="bg-white dark:bg-[#1f2c34] p-4 rounded-2xl border border-black/5 dark:border-white/10 shadow-sm space-y-1 min-w-0">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-black uppercase tracking-wider">Taxa de Resgate</span>
            <TrendingUp className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-black tracking-tight text-purple-500">{taxaConversao}%</div>
          <span className="text-[10px] text-slate-400 font-bold block truncate">{campanhas.length} campanhas ativas</span>
        </div>
      </div>

      {/* Navegação de Abas Fluida */}
      <div className="flex items-center justify-between gap-3 border-b border-black/10 dark:border-white/10 pb-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('vouchers')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 min-h-[44px] shrink-0 ${
              activeTab === 'vouchers'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Ticket className="w-3.5 h-3.5" />
            <span>Vouchers ({vouchers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('campanhas')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 min-h-[44px] shrink-0 ${
              activeTab === 'campanhas'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Campanhas ({campanhas.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('empresas')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 min-h-[44px] shrink-0 ${
              activeTab === 'empresas'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Empresas ({empresas.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('auditoria')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 min-h-[44px] shrink-0 ${
              activeTab === 'auditoria'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Auditoria ({events.length})</span>
          </button>
        </div>

        <button
          onClick={fetchData}
          className="p-2.5 text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl cursor-pointer shrink-0"
          title="Atualizar dados"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ========================================================= */}
      {/* ABA 1: VOUCHERS */}
      {/* ========================================================= */}
      {activeTab === 'vouchers' && (
        <div className="space-y-4">
          
          {/* Barra de Pesquisa Única e Fluida */}
          <div className="w-full relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código, beneficiário ou empresa parceira..."
              className="w-full bg-white dark:bg-[#1f2c34] border border-black/10 dark:border-white/10 rounded-2xl pl-10 pr-4 py-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-bold shadow-sm"
            />
          </div>

          {filteredVouchers.length === 0 ? (
            <div className="bg-white dark:bg-[#1f2c34] rounded-2xl border border-black/10 dark:border-white/10 p-8 text-center space-y-3 shadow-sm">
              <Ticket className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
              <div className="space-y-1">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Nenhum voucher emitido ainda</h3>
                <p className="text-xs text-slate-400">Emita seu primeiro voucher corporativo individual ou em lote.</p>
              </div>
              <button
                onClick={() => setShowCreateVoucherModal(true)}
                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase inline-flex items-center gap-2 cursor-pointer shadow-md min-h-[48px]"
              >
                <Plus className="w-4 h-4" />
                <span>Emitir Primeiro Voucher</span>
              </button>
            </div>
          ) : (
            <>
              {/* VISUALIZAÇÃO EM CARDS PARA MOBILE (< md) */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredVouchers.map((v) => {
                  const isUtil = v.status === 'UTILIZADO';
                  const isVal = v.status === 'VALIDADO';
                  const isEnv = v.status === 'ENVIADO';

                  return (
                    <div
                      key={v.id}
                      className="bg-white dark:bg-[#1f2c34] p-4 rounded-2xl border border-black/10 dark:border-white/10 space-y-3 shadow-sm text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                          {v.public_token}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          isUtil
                            ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/30'
                            : isVal
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30 animate-pulse'
                            : isEnv
                            ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/30'
                            : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {v.status}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-emerald-500" />
                          <strong className="text-slate-900 dark:text-white font-bold">{v.beneficiario_nome || 'Colaborador'}</strong>
                          {v.beneficiario_whatsapp && (
                            <span className="text-[10px] text-slate-400 font-mono">+{v.beneficiario_whatsapp}</span>
                          )}
                        </div>

                        <div className="text-slate-500 dark:text-slate-400">
                          <span>{v.voucher_empresas_parceiras?.razao_social || 'Empresa Parceira'}</span>
                          <span className="mx-1">•</span>
                          <span className="text-emerald-500 font-semibold">{v.voucher_campanhas?.nome || 'Campanha'}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Valor</span>
                          <strong className="text-base font-black text-slate-900 dark:text-white">
                            {Number(v.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </strong>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSendWhatsApp(v)}
                            disabled={actionLoading}
                            className="p-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 rounded-xl cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                            title="Disparar via WhatsApp"
                          >
                            <Send className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => window.open(`/voucher/${v.public_token}`, '_blank')}
                            className="p-2.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 rounded-xl text-slate-400 hover:text-white cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                            title="Abrir Voucher Digital"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* TABELA RESPONSIVA PARA DESKTOP/TABLET (>= md) */}
              <div className="hidden md:block bg-white dark:bg-[#1f2c34] rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#0c1317] text-slate-400 font-black uppercase text-[10px] tracking-wider border-b border-black/5 dark:border-white/5">
                    <tr>
                      <th className="py-3.5 px-4">Código</th>
                      <th className="py-3.5 px-4">Beneficiário</th>
                      <th className="py-3.5 px-4">Empresa / Campanha</th>
                      <th className="py-3.5 px-4">Valor</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Validade</th>
                      <th className="py-3.5 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5 font-medium">
                    {filteredVouchers.map((v) => {
                      const isUtil = v.status === 'UTILIZADO';
                      const isVal = v.status === 'VALIDADO';
                      const isEnv = v.status === 'ENVIADO';

                      return (
                        <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="py-3.5 px-4 font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                            {v.public_token}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {v.beneficiario_nome || 'Colaborador'}
                            </div>
                            {v.beneficiario_whatsapp && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                +{v.beneficiario_whatsapp}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 dark:text-slate-300">
                            <div className="font-semibold">{v.voucher_empresas_parceiras?.razao_social || 'Empresa Parceira'}</div>
                            <span className="text-[10px] text-emerald-500 font-bold">{v.voucher_campanhas?.nome || 'Campanha'}</span>
                          </td>
                          <td className="py-3.5 px-4 font-black text-slate-900 dark:text-white text-sm">
                            {Number(v.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-[9.5px] font-black uppercase tracking-wider ${
                              isUtil
                                ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/30'
                                : isVal
                                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30 animate-pulse'
                                : isEnv
                                ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/30'
                                : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                            }`}>
                              {v.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-medium">
                            {new Date(v.validade_fim).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-3.5 px-4 text-right space-x-1.5">
                            <button
                              onClick={() => handleSendWhatsApp(v)}
                              disabled={actionLoading}
                              className="p-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 rounded-xl cursor-pointer transition-all active:scale-95 min-h-[40px] min-w-[40px] inline-flex items-center justify-center"
                              title="Disparar via WhatsApp"
                            >
                              <Send className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => window.open(`/voucher/${v.public_token}`, '_blank')}
                              className="p-2 bg-black/5 dark:bg-white/10 hover:bg-black/10 rounded-xl text-slate-400 hover:text-white cursor-pointer transition-all active:scale-95 min-h-[40px] min-w-[40px] inline-flex items-center justify-center"
                              title="Abrir Voucher Digital"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

        </div>
      )}

      {/* ========================================================= */}
      {/* ABA 2: CAMPANHAS */}
      {/* ========================================================= */}
      {activeTab === 'campanhas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Campanhas de Benefícios ({campanhas.length})
            </h2>
            <button
              onClick={openNewCampaignModal}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase flex items-center gap-2 cursor-pointer shadow-md min-h-[48px]"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Campanha</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campanhas.map((c) => (
              <div key={c.id} className="bg-white dark:bg-[#1f2c34] p-5 rounded-2xl border border-black/10 dark:border-white/10 space-y-3 shadow-sm text-left">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-base text-slate-900 dark:text-white leading-tight">{c.nome}</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      {c.tipo_desconto || 'VALOR_FIXO'}
                    </span>
                    <button
                      onClick={() => openEditCampaignModal(c)}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
                      title="Editar Campanha"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{c.descricao || 'Campanha corporativa.'}</p>
                <div className="pt-3 border-t border-black/5 dark:border-white/5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Empresa:</span>
                    <strong className="text-slate-900 dark:text-white font-bold">{c.empresa_nome || 'Empresa Parceira'}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Valor Unitário:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-black text-sm">
                      {Number(c.valor_desconto || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Validade:</span>
                    <span className="text-slate-300 font-mono">{new Date(c.data_fim).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ABA 3: EMPRESAS PARCEIRAS */}
      {/* ========================================================= */}
      {activeTab === 'empresas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Empresas Parceiras ({empresas.length})
            </h2>
            <button
              onClick={openNewCompanyModal}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase flex items-center gap-2 cursor-pointer shadow-md min-h-[48px]"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Empresa</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {empresas.map((e) => (
              <div key={e.id} className="bg-white dark:bg-[#1f2c34] p-5 rounded-2xl border border-black/10 dark:border-white/10 space-y-3 shadow-sm text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <h3 className="font-black text-sm text-slate-900 dark:text-white leading-tight truncate">{e.razao_social}</h3>
                  </div>
                  <button
                    onClick={() => openEditCompanyModal(e)}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer shrink-0"
                    title="Editar Empresa"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-xs text-slate-400 space-y-1.5 pt-1">
                  <div>CNPJ: <span className="font-mono text-slate-300 font-bold">{e.cnpj || 'Não informado'}</span></div>
                  <div>Contato: <span className="text-slate-300">{e.contato_nome} ({e.contato_whatsapp || 'Sem Whats'})</span></div>
                  <div>Limite: <span className="font-black text-emerald-400">{e.limite_vouchers} vouchers/mês</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ABA 4: AUDITORIA */}
      {/* ========================================================= */}
      {activeTab === 'auditoria' && (
        <div className="bg-white dark:bg-[#1f2c34] rounded-2xl border border-black/10 dark:border-white/10 p-5 shadow-sm text-left space-y-4">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Trilha de Auditoria Forense ({events.length} eventos)</span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {events.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">Nenhum evento registrado ainda.</p>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="p-3.5 bg-black/5 dark:bg-[#0c1317] rounded-xl border border-black/5 dark:border-white/5 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-emerald-500 dark:text-emerald-400">
                      {ev.status_anterior || 'CRIADO'} ➔ {ev.status_novo}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(ev.data_hora).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 dark:text-slate-300">{ev.motivo}</p>
                  <div className="text-[10px] text-slate-500 flex items-center gap-3 pt-0.5">
                    <span>Executor: {ev.usuario_responsavel}</span>
                    {ev.ip && <span>IP: {ev.ip}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EMISSÃO DE VOUCHER (COM GESTÃO INLINE DE DROPDOWNS) */}
      {/* ========================================================= */}
      {showCreateVoucherModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-[#1f2c34] border border-white/10 rounded-[32px] p-5 sm:p-6 shadow-2xl space-y-4 text-left my-auto">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Ticket className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-white">Emitir Vouchers Digitais</h3>
              </div>
              <button
                onClick={() => setShowCreateVoucherModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Alternador Modo Lote vs Individual */}
            <div className="flex bg-[#111b21] p-1 rounded-xl border border-white/10 text-xs font-black">
              <button
                type="button"
                onClick={() => setVoucherEmissionMode('individual')}
                className={`flex-1 py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px] ${
                  voucherEmissionMode === 'individual' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Individual / Nominal</span>
              </button>
              <button
                type="button"
                onClick={() => setVoucherEmissionMode('lote')}
                className={`flex-1 py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer min-h-[44px] ${
                  voucherEmissionMode === 'lote' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Emissão em Lote</span>
              </button>
            </div>

            <form onSubmit={handleCreateVouchers} className="space-y-3.5 text-xs">
              
              {/* CAMPO DE SELEÇÃO: EMPRESA PARCEIRA COM CRIAR/EDITAR INLINE */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-bold">Empresa Parceira</label>
                  <button
                    type="button"
                    onClick={openNewCompanyModal}
                    className="text-[11px] font-black text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>+ Nova Empresa</span>
                  </button>
                </div>
                <div className="flex gap-2">
                  <select
                    value={voucherForm.empresaId}
                    onChange={(e) => setVoucherForm({ ...voucherForm, empresaId: e.target.value })}
                    className="flex-1 bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                    required
                  >
                    {empresas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.razao_social} ({e.cnpj || 'Sem CNPJ'})
                      </option>
                    ))}
                  </select>
                  {voucherForm.empresaId && (
                    <button
                      type="button"
                      onClick={() => {
                        const comp = empresas.find((c) => c.id === voucherForm.empresaId);
                        if (comp) openEditCompanyModal(comp);
                      }}
                      className="p-3 bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white rounded-xl cursor-pointer min-h-[48px] min-w-[48px] flex items-center justify-center"
                      title="Editar Empresa Selecionada"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* CAMPO DE SELEÇÃO: CAMPANHA DE BENEFÍCIO COM CRIAR/EDITAR INLINE */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-bold">Campanha de Benefício</label>
                  <button
                    type="button"
                    onClick={openNewCampaignModal}
                    className="text-[11px] font-black text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>+ Nova Campanha</span>
                  </button>
                </div>
                <div className="flex gap-2">
                  <select
                    value={voucherForm.campanhaId}
                    onChange={(e) => {
                      const cmp = campanhas.find((c) => c.id === e.target.value);
                      setVoucherForm({
                        ...voucherForm,
                        campanhaId: e.target.value,
                        valor: cmp?.valor_desconto || voucherForm.valor
                      });
                    }}
                    className="flex-1 bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                    required
                  >
                    {campanhas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} — R$ {c.valor_desconto}
                      </option>
                    ))}
                  </select>
                  {voucherForm.campanhaId && (
                    <button
                      type="button"
                      onClick={() => {
                        const cmp = campanhas.find((c) => c.id === voucherForm.campanhaId);
                        if (cmp) openEditCampaignModal(cmp);
                      }}
                      className="p-3 bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white rounded-xl cursor-pointer min-h-[48px] min-w-[48px] flex items-center justify-center"
                      title="Editar Campanha Selecionada"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {voucherEmissionMode === 'individual' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Nome do Beneficiário</label>
                    <input
                      type="text"
                      value={voucherForm.beneficiarioNome}
                      onChange={(e) => setVoucherForm({ ...voucherForm, beneficiarioNome: e.target.value })}
                      placeholder="Ex: João da Silva"
                      className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 font-bold mb-1">WhatsApp para Envio</label>
                    <input
                      type="text"
                      value={voucherForm.beneficiarioWhatsapp}
                      onChange={(e) => setVoucherForm({ ...voucherForm, beneficiarioWhatsapp: e.target.value })}
                      placeholder="11999999999"
                      className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Quantidade de Vouchers no Lote</label>
                  <input
                    type="number"
                    value={voucherForm.quantidade}
                    onChange={(e) => setVoucherForm({ ...voucherForm, quantidade: Number(e.target.value) })}
                    className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                    min={1}
                    max={500}
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Valor do Voucher (R$)</label>
                  <input
                    type="number"
                    value={voucherForm.valor}
                    onChange={(e) => setVoucherForm({ ...voucherForm, valor: Number(e.target.value) })}
                    className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">Data Limite de Validade</label>
                  <input
                    type="date"
                    value={voucherForm.validadeFim}
                    onChange={(e) => setVoucherForm({ ...voucherForm, validadeFim: e.target.value })}
                    className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateVoucherModal(false)}
                  className="flex-1 py-3.5 bg-white/10 hover:bg-white/15 rounded-xl text-slate-300 font-black uppercase cursor-pointer min-h-[48px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-black uppercase cursor-pointer shadow-lg shadow-emerald-600/30 min-h-[48px]"
                >
                  {actionLoading ? 'Emitindo...' : 'Confirmar Emissão'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CRIAR OU EDITAR EMPRESA PARCEIRA */}
      {/* ========================================================= */}
      {showCompanyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-[#1f2c34] border border-white/10 rounded-[32px] p-5 sm:p-6 shadow-2xl space-y-4 text-left my-auto">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-white">
                  {editingCompany ? 'Editar Empresa Parceira' : 'Cadastrar Empresa Parceira'}
                </h3>
              </div>
              <button
                onClick={() => setShowCompanyModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCompany} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Razão Social</label>
                <input
                  type="text"
                  value={companyForm.razaoSocial}
                  onChange={(e) => setCompanyForm({ ...companyForm, razaoSocial: e.target.value })}
                  placeholder="Ex: Tech Solutions Brasil LTDA"
                  className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Nome Fantasia (Opcional)</label>
                <input
                  type="text"
                  value={companyForm.nomeFantasia}
                  onChange={(e) => setCompanyForm({ ...companyForm, nomeFantasia: e.target.value })}
                  placeholder="Ex: TechCorp"
                  className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">CNPJ</label>
                  <input
                    type="text"
                    value={companyForm.cnpj}
                    onChange={(e) => setCompanyForm({ ...companyForm, cnpj: e.target.value })}
                    placeholder="00.000.000/0001-00"
                    className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Limite Mensal</label>
                  <input
                    type="number"
                    value={companyForm.limiteVouchers}
                    onChange={(e) => setCompanyForm({ ...companyForm, limiteVouchers: Number(e.target.value) })}
                    className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Nome do Contato</label>
                  <input
                    type="text"
                    value={companyForm.contatoNome}
                    onChange={(e) => setCompanyForm({ ...companyForm, contatoNome: e.target.value })}
                    placeholder="Ex: Carlos Silva"
                    className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">WhatsApp de Contato</label>
                  <input
                    type="text"
                    value={companyForm.contatoWhatsapp}
                    onChange={(e) => setCompanyForm({ ...companyForm, contatoWhatsapp: e.target.value })}
                    placeholder="11988887777"
                    className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCompanyModal(false)}
                  className="flex-1 py-3.5 bg-white/10 hover:bg-white/15 rounded-xl text-slate-300 font-black uppercase cursor-pointer min-h-[48px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-black uppercase cursor-pointer shadow-lg shadow-emerald-600/30 min-h-[48px]"
                >
                  {actionLoading ? 'Salvando...' : editingCompany ? 'Salvar Alterações' : 'Cadastrar Empresa'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CRIAR OU EDITAR CAMPANHA */}
      {/* ========================================================= */}
      {showCampaignModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-[#1f2c34] border border-white/10 rounded-[32px] p-5 sm:p-6 shadow-2xl space-y-4 text-left my-auto">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-white">
                  {editingCampaign ? 'Editar Campanha' : 'Criar Nova Campanha'}
                </h3>
              </div>
              <button
                onClick={() => setShowCampaignModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCampaign} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Empresa Parceira Obrigatória</label>
                <select
                  value={campaignForm.empresaId}
                  onChange={(e) => setCampaignForm({ ...campaignForm, empresaId: e.target.value })}
                  className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                  required
                >
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.razao_social} ({e.cnpj || 'Sem CNPJ'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Nome da Campanha</label>
                <input
                  type="text"
                  value={campaignForm.nome}
                  onChange={(e) => setCampaignForm({ ...campaignForm, nome: e.target.value })}
                  placeholder="Ex: Almoço Corporativo de Sexta"
                  className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Descrição / Regras</label>
                <textarea
                  value={campaignForm.descricao}
                  onChange={(e) => setCampaignForm({ ...campaignForm, descricao: e.target.value })}
                  placeholder="Ex: Válido para 1 prato executivo ou buffet por colaborador"
                  rows={2}
                  className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-2.5 text-white font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Tipo de Desconto</label>
                  <select
                    value={campaignForm.tipoDesconto}
                    onChange={(e) => setCampaignForm({ ...campaignForm, tipoDesconto: e.target.value })}
                    className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                  >
                    <option value="VALOR_FIXO">Valor Fixo (R$)</option>
                    <option value="PERCENTUAL">Percentual (%)</option>
                    <option value="ITEM_GRATIS">Item Grátis</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Valor (R$ ou %)</label>
                  <input
                    type="number"
                    value={campaignForm.valorDesconto}
                    onChange={(e) => setCampaignForm({ ...campaignForm, valorDesconto: Number(e.target.value) })}
                    className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Data Limite da Campanha</label>
                <input
                  type="date"
                  value={campaignForm.dataFim}
                  onChange={(e) => setCampaignForm({ ...campaignForm, dataFim: e.target.value })}
                  className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-3 text-white font-bold min-h-[48px]"
                  required
                />
              </div>

              <div className="flex gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCampaignModal(false)}
                  className="flex-1 py-3.5 bg-white/10 hover:bg-white/15 rounded-xl text-slate-300 font-black uppercase cursor-pointer min-h-[48px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-black uppercase cursor-pointer shadow-lg shadow-emerald-600/30 min-h-[48px]"
                >
                  {actionLoading ? 'Salvando...' : editingCampaign ? 'Salvar Alterações' : 'Criar Campanha'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
