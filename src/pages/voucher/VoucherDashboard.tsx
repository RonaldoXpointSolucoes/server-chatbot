import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock,
  Coins,
  CreditCard,
  DollarSign,
  Edit2,
  ExternalLink,
  Gift,
  History,
  Key,
  Loader2,
  MessageCircle,
  Percent,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Store,
  Ticket,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  XCircle
} from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { supabase } from '../../services/supabase';
import {
  formatBRL,
  formatPhoneDisplay,
  isInstanceConnected,
  normalizePhoneDigits,
  StoreProfile,
  VoucherCampaign,
  VoucherColaborador,
  VoucherCreditOrder,
  VoucherEventRecord,
  VoucherPartnerCompany,
  VoucherRecord,
  voucherService,
  WhatsAppInstanceLite
} from '../../services/voucherService';
import { VoucherPartnerModal } from '../../components/voucher/VoucherPartnerModal';
import {
  PartnerAccessModal,
  PartnerCollaboratorsModal,
  PartnerRechargeModal
} from '../../components/voucher/VoucherPartnerModals';
import {
  CampaignModal,
  IssueVoucherModal,
  VoucherDetailModal,
  VoucherSettingsModal
} from '../../components/voucher/VoucherIssueModals';

type DashboardTab = 'vouchers' | 'empresas' | 'pedidos' | 'campanhas' | 'auditoria';
type VoucherFilterStatus = 'TODOS' | 'ATIVOS' | 'RESGATADOS' | 'CANCELADOS';

const STATUS_BADGE: Record<string, string> = {
  CRIADO: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  DISPONIVEL: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  VISUALIZADO: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30',
  RESERVADO: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  RESGATADO: 'bg-indigo-500/15 text-indigo-300 border-indigo-400/30',
  UTILIZADO: 'bg-indigo-500/15 text-indigo-300 border-indigo-400/30',
  CANCELADO: 'bg-rose-500/15 text-rose-300 border-rose-400/30'
};

const ORDER_STATUS_BADGE: Record<string, string> = {
  PENDENTE: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
  APROVADO: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
  REJEITADO: 'bg-rose-500/20 text-rose-300 border-rose-400/30',
  CANCELADO: 'bg-slate-500/20 text-slate-300 border-slate-400/30'
};

const WA_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ENVIADO: { label: 'WhatsApp Enviado', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/25' },
  NA_FILA: { label: 'Na Fila Outbox', cls: 'text-amber-300 bg-amber-500/10 border-amber-400/25' },
  ERRO: { label: 'Erro no Envio', cls: 'text-rose-300 bg-rose-500/10 border-rose-400/25' },
  SEM_TELEFONE: { label: 'Sem Telefone', cls: 'text-slate-400 bg-white/5 border-white/10' },
  PENDENTE: { label: 'Não Enviado', cls: 'text-slate-300 bg-white/5 border-white/15' }
};

export default function VoucherDashboard() {
  const tenantInfo = useChatStore((state) => state.tenantInfo);
  const currentAccount = useChatStore((state) => state.currentAccount);

  const storedTenantId =
    typeof window !== 'undefined'
      ? localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')
      : null;
  const storedTenantName =
    typeof window !== 'undefined'
      ? localStorage.getItem('current_tenant_name') || sessionStorage.getItem('current_tenant_name')
      : null;
  const storedUserName =
    typeof window !== 'undefined'
      ? localStorage.getItem('current_user_name') || sessionStorage.getItem('current_user_name')
      : null;

  const tenantId = tenantInfo?.id || storedTenantId || currentAccount?.id || '';
  const currentTenantName = tenantInfo?.name || storedTenantName || currentAccount?.name || 'Loja Selecionada';
  const operatorName = storedUserName || currentAccount?.name || 'Gestor CRM';

  const [activeTab, setActiveTab] = useState<DashboardTab>('vouchers');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Dashboard Data
  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [partners, setPartners] = useState<VoucherPartnerCompany[]>([]);
  const [campaigns, setCampaigns] = useState<VoucherCampaign[]>([]);
  const [colaboradores, setColaboradores] = useState<VoucherColaborador[]>([]);
  const [vouchers, setVouchers] = useState<VoucherRecord[]>([]);
  const [creditOrders, setCreditOrders] = useState<VoucherCreditOrder[]>([]);
  const [events, setEvents] = useState<VoucherEventRecord[]>([]);
  const [instances, setInstances] = useState<WhatsAppInstanceLite[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [voucherFilter, setVoucherFilter] = useState<VoucherFilterStatus>('TODOS');
  const [partnerFilterId, setPartnerFilterId] = useState<string>('ALL');
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [sendingBatchWa, setSendingBatchWa] = useState(false);

  const [partnerSearch, setPartnerSearch] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState('ALL');
  const [runningRenewals, setRunningRenewals] = useState(false);
  const [decidingOrderId, setDecidingOrderId] = useState<string | null>(null);
  const [togglingPartnerId, setTogglingPartnerId] = useState<string | null>(null);
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);

  // Modals State
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueModalMode, setIssueModalMode] = useState<'single' | 'batch'>('single');
  const [issuePreselectedPartnerId, setIssuePreselectedPartnerId] = useState<string | null>(null);

  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState<VoucherPartnerCompany | null>(null);

  const [colabsModalPartner, setColabsModalPartner] = useState<VoucherPartnerCompany | null>(null);
  const [rechargeModalPartner, setRechargeModalPartner] = useState<VoucherPartnerCompany | null>(null);
  const [accessModalPartner, setAccessModalPartner] = useState<VoucherPartnerCompany | null>(null);
  const [accessModalPlainPwd, setAccessModalPlainPwd] = useState<string | null>(null);

  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<VoucherCampaign | null>(null);

  const [detailVoucher, setDetailVoucher] = useState<VoucherRecord | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 5500);
  }, []);

  const loadDashboard = useCallback(
    async (silent = false) => {
      if (!tenantId) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setAuthError(null);

      try {
        let res;
        try {
          res = await voucherService.merchantGetDashboard(tenantId);
        } catch (firstErr: any) {
          const msg = String(firstErr?.message || '');
          if (msg.toLowerCase().includes('autenticada') || msg.toLowerCase().includes('jwt')) {
            await supabase.auth.refreshSession().catch(() => null);
            res = await voucherService.merchantGetDashboard(tenantId);
          } else {
            throw firstErr;
          }
        }

        setStoreProfile(res.tenant || null);
        setPartners(res.partners || []);
        setCampaigns(res.campaigns || []);
        setColaboradores(res.colaboradores || []);
        setVouchers(res.vouchers || []);
        setCreditOrders(res.credit_orders || []);
        setEvents(res.events || []);
        setInstances(res.instances || []);
      } catch (err: any) {
        const message = err?.message || 'Não foi possível carregar os dados de vouchers desta loja.';
        setAuthError(message);
        showToast('error', message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId, showToast]
  );

  // Clean stale state & reload immediately when top-left active tenant switches
  useEffect(() => {
    setSelectedVoucherIds([]);
    setPartnerFilterId('ALL');
    setSearchTerm('');
    setColabsModalPartner(null);
    setRechargeModalPartner(null);
    setAccessModalPartner(null);
    setDetailVoucher(null);
    loadDashboard(false);
  }, [tenantId, loadDashboard]);

  // Derived KPIs & Lists
  const stats = useMemo(() => {
    let totalIssuedVal = 0;
    let totalRedeemedVal = 0;
    let totalRedeemedCount = 0;
    let activeVal = 0;
    let activeCount = 0;

    for (const v of vouchers) {
      const val = Number(v.valor || 0);
      const st = String(v.status || '').toUpperCase();
      if (st !== 'CANCELADO') {
        totalIssuedVal += val;
      }
      if (st === 'RESGATADO' || st === 'UTILIZADO') {
        totalRedeemedVal += val;
        totalRedeemedCount++;
      } else if (['CRIADO', 'DISPONIVEL', 'VISUALIZADO', 'RESERVADO'].includes(st)) {
        activeVal += val;
        activeCount++;
      }
    }

    const totalPartnerBalance = partners.reduce((acc, p) => acc + Number(p.saldo_credito || 0), 0);
    const activeMonthlyCount = partners.filter((p) => p.ativo !== false && p.credito_mensal_ativo).length;
    const pendingOrdersCount = creditOrders.filter((o) => o.status === 'PENDENTE').length;
    const redemptionRate = vouchers.length > 0 ? Math.round((totalRedeemedCount / vouchers.length) * 100) : 0;

    return {
      totalIssuedVal,
      totalRedeemedVal,
      totalRedeemedCount,
      activeVal,
      activeCount,
      totalPartnerBalance,
      activeMonthlyCount,
      pendingOrdersCount,
      redemptionRate
    };
  }, [vouchers, partners, creditOrders]);

  const connectedInstances = useMemo(
    () => instances.filter((i) => isInstanceConnected(i.status)),
    [instances]
  );

  const partnerMap = useMemo(() => {
    const map = new Map<string, VoucherPartnerCompany>();
    for (const p of partners) map.set(p.id, p);
    return map;
  }, [partners]);

  const filteredVouchers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return vouchers.filter((v) => {
      const st = String(v.status || '').toUpperCase();
      if (voucherFilter === 'ATIVOS' && !['CRIADO', 'DISPONIVEL', 'VISUALIZADO', 'RESERVADO'].includes(st)) return false;
      if (voucherFilter === 'RESGATADOS' && !['RESGATADO', 'UTILIZADO'].includes(st)) return false;
      if (voucherFilter === 'CANCELADOS' && st !== 'CANCELADO') return false;

      if (partnerFilterId === 'DIRECT' && v.empresa_id) return false;
      if (partnerFilterId !== 'ALL' && partnerFilterId !== 'DIRECT' && v.empresa_id !== partnerFilterId) return false;

      if (!q) return true;
      const partnerName = v.empresa_id ? partnerMap.get(v.empresa_id)?.razao_social || '' : '';
      return (
        String(v.public_token || '').toLowerCase().includes(q) ||
        String(v.beneficiario_nome || '').toLowerCase().includes(q) ||
        String(v.beneficiario_whatsapp || '').toLowerCase().includes(q) ||
        String(v.empresa_nome || '').toLowerCase().includes(q) ||
        String(v.empresa_razao_social || '').toLowerCase().includes(q) ||
        partnerName.toLowerCase().includes(q) ||
        String(v.campanha_nome || '').toLowerCase().includes(q)
      );
    });
  }, [vouchers, voucherFilter, partnerFilterId, searchTerm, partnerMap]);

  const filteredPartners = useMemo(() => {
    const q = partnerSearch.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter(
      (p) =>
        String(p.razao_social || '').toLowerCase().includes(q) ||
        String(p.nome_fantasia || '').toLowerCase().includes(q) ||
        String(p.cnpj || '').toLowerCase().includes(q) ||
        String(p.login_usuario || '').toLowerCase().includes(q)
    );
  }, [partners, partnerSearch]);

  const filteredEvents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return events.filter((ev) => {
      if (ledgerFilter !== 'ALL' && ev.tipo_operacao !== ledgerFilter) return false;
      if (!q) return true;
      return (
        String(ev.tipo_operacao || '').toLowerCase().includes(q) ||
        String(ev.beneficiario_nome || '').toLowerCase().includes(q) ||
        String(ev.empresa_origem || '').toLowerCase().includes(q) ||
        String(ev.voucher_token || '').toLowerCase().includes(q) ||
        String(ev.motivo || '').toLowerCase().includes(q)
      );
    });
  }, [events, ledgerFilter, searchTerm]);

  const colabCountByPartner = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of colaboradores) {
      if (c.ativo !== false) counts.set(c.empresa_id, (counts.get(c.empresa_id) || 0) + 1);
    }
    return counts;
  }, [colaboradores]);

  // Batch selection helpers
  const selectableVisibleIds = useMemo(
    () =>
      filteredVouchers
        .filter((v) => normalizePhoneDigits(v.beneficiario_whatsapp).length >= 10 && String(v.status).toUpperCase() !== 'CANCELADO')
        .map((v) => v.id),
    [filteredVouchers]
  );

  const toggleSelectVoucher = (id: string) => {
    setSelectedVoucherIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleBatchSendWhatsApp = async () => {
    if (selectedVoucherIds.length === 0) return;
    setSendingBatchWa(true);
    try {
      const res = await voucherService.merchantSendBatchWhatsApp(
        tenantId,
        selectedVoucherIds,
        storeProfile?.voucher_default_instance_id || null
      );
      showToast(
        res.failedCount > 0 ? 'info' : 'success',
        `Disparo concluído: ${res.sentCount} enviado(s)${res.failedCount > 0 ? `, ${res.failedCount} na fila/erro` : ''}.`
      );
      setSelectedVoucherIds([]);
      await loadDashboard(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Erro no envio em lote pelo WhatsApp.');
    } finally {
      setSendingBatchWa(false);
    }
  };

  const handleTogglePartnerActive = async (p: VoucherPartnerCompany) => {
    setTogglingPartnerId(p.id);
    try {
      await voucherService.merchantTogglePartner(tenantId, p.id, p.ativo === false);
      showToast('success', p.ativo === false ? 'Empresa parceira reativada!' : 'Empresa parceira suspensa.');
      await loadDashboard(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao alterar status da empresa.');
    } finally {
      setTogglingPartnerId(null);
    }
  };

  const handleDecideOrder = async (order: VoucherCreditOrder, acao: 'APROVAR' | 'REJEITAR') => {
    setDecidingOrderId(order.id);
    try {
      await voucherService.merchantDecideCreditOrder({
        tenantId,
        orderId: order.id,
        acao,
        motivo: acao === 'APROVAR' ? 'Aprovado no painel da loja' : 'Solicitação recusada pela loja',
        usuarioResponsavel: operatorName
      });
      showToast(
        acao === 'APROVAR' ? 'success' : 'info',
        acao === 'APROVAR'
          ? `Pedido aprovado! ${formatBRL(order.valor_credito)} creditado(s) para a empresa.`
          : 'Solicitação de crédito rejeitada.'
      );
      await loadDashboard(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao processar pedido de crédito.');
    } finally {
      setDecidingOrderId(null);
    }
  };

  const handleRunMonthlyRenewals = async () => {
    setRunningRenewals(true);
    try {
      const res = await voucherService.merchantRunMonthlyRenewal(tenantId, null);
      showToast(
        res.applied_count > 0 ? 'success' : 'info',
        res.applied_count > 0
          ? `${res.applied_count} empresa(s) receberam a renovação mensal de créditos!`
          : 'Nenhuma empresa pendente de renovação para a competência atual.'
      );
      await loadDashboard(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao executar renovações mensais.');
    } finally {
      setRunningRenewals(false);
    }
  };

  const handleDeleteCampaign = async (campanhaId: string) => {
    setDeletingCampaignId(campanhaId);
    try {
      await voucherService.merchantDeleteCampaign(tenantId, campanhaId);
      showToast('success', 'Campanha removida.');
      await loadDashboard(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao remover campanha.');
    } finally {
      setDeletingCampaignId(null);
    }
  };

  const openPartnerSavedAccess = async (partner: VoucherPartnerCompany, generatedPwd?: string | null) => {
    await loadDashboard(true);
    showToast('success', `Empresa "${partner.nome_fantasia || partner.razao_social}" salva com sucesso!`);
    if (generatedPwd) {
      setAccessModalPartner(partner);
      setAccessModalPlainPwd(generatedPwd);
    }
  };

  if (!tenantId) {
    return (
      <div className="min-h-screen bg-[#060d18] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full p-6 rounded-3xl bg-white/[0.04] border border-white/10 text-center space-y-3">
          <Store className="w-10 h-10 text-emerald-400 mx-auto" />
          <h2 className="text-lg font-bold">Nenhuma Empresa Selecionada</h2>
          <p className="text-sm text-slate-400">
            Selecione uma empresa/loja no seletor no topo superior esquerdo para gerenciar os vouchers corporativos dela.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060d18] text-slate-100 p-4 sm:p-6 space-y-5">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[60] max-w-md px-4 py-3.5 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-start gap-3 transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-400/40 text-emerald-100'
              : toast.type === 'error'
              ? 'bg-rose-950/90 border-rose-400/40 text-rose-100'
              : 'bg-cyan-950/90 border-cyan-400/40 text-cyan-100'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <div className="text-xs sm:text-sm font-medium leading-snug">{toast.message}</div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/30 to-cyan-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Voucher Gestão</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                Multi-Tenant B2B
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-white border border-white/15 flex items-center gap-1.5">
                <Store className="w-3 h-3 text-cyan-300" />
                {storeProfile?.name || currentTenantName}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Emita vouchers avulsos, cadastre empresas parceiras com portal próprio, créditos mensais e compras com desconto.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/voucher-scanner?empresa=${encodeURIComponent(tenantId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-bold text-white flex items-center gap-2 transition"
          >
            <QrCode className="w-4 h-4 text-cyan-300" />
            TERMINAL CAIXA
          </a>
          <a
            href={`/voucher-empresa/login?empresa=${encodeURIComponent(tenantId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-bold text-white flex items-center gap-2 transition"
          >
            <ExternalLink className="w-4 h-4 text-amber-300" />
            PORTAL B2B
          </a>
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-bold text-slate-200 flex items-center gap-2 transition"
            title="Configurar WhatsApp Padrão e PIN do Terminal Caixa"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Configurar Loja</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIssuePreselectedPartnerId(null);
              setIssueModalMode('single');
              setShowIssueModal(true);
            }}
            className="h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            EMITIR VOUCHER / LOTE
          </button>
        </div>
      </div>

      {/* Auth Error Banner if session invalid */}
      {authError && (
        <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-400/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm text-rose-100">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{authError}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => loadDashboard(false)}
              className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white"
            >
              Tentar Novamente
            </button>
            <a
              href="/login"
              className="h-10 px-4 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold flex items-center"
            >
              Revalidar Login CRM
            </a>
          </div>
        </div>
      )}

      {/* Pending Credit Purchase Requests Alert */}
      {stats.pendingOrdersCount > 0 && (
        <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-400/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs sm:text-sm text-amber-100">
            <Coins className="w-5 h-5 text-amber-300 shrink-0" />
            <span>
              <strong>{stats.pendingOrdersCount}</strong> pedido(s) de compra de créditos enviado(s) por empresas parceiras
              aguardando sua aprovação!
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('pedidos')}
            className="h-9 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold shrink-0"
          >
            Revisar Pedidos Agora
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>Total Emitido</span>
            <Ticket className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-white">{formatBRL(stats.totalIssuedVal)}</div>
          <div className="mt-1 text-xs text-slate-400">
            {vouchers.length} voucher(es) • {partners.length} parceira(s)
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>Total Resgatado</span>
            <DollarSign className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-400">{formatBRL(stats.totalRedeemedVal)}</div>
          <div className="mt-1 text-xs text-slate-400">
            {stats.totalRedeemedCount} baixa(s) • Taxa de resgate {stats.redemptionRate}%
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>Em Circulação</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-amber-300">{formatBRL(stats.activeVal)}</div>
          <div className="mt-1 text-xs text-slate-400">{stats.activeCount} disponíveis para resgate no caixa</div>
        </div>

        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>Saldo Carteira B2B</span>
            <Building2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-black text-indigo-300">{formatBRL(stats.totalPartnerBalance)}</div>
          <div className="mt-1 text-xs text-slate-400">
            {stats.activeMonthlyCount} plano(s) mensais • {connectedInstances.length} WhatsApp ativo(s)
          </div>
        </div>
      </div>

      {/* Navigation Tabs + Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('vouchers')}
            className={`h-11 px-4 rounded-xl text-xs font-extrabold flex items-center gap-2 transition ${
              activeTab === 'vouchers'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 border border-white/10'
            }`}
          >
            <Ticket className="w-4 h-4" />
            VOUCHERS ({vouchers.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('empresas')}
            className={`h-11 px-4 rounded-xl text-xs font-extrabold flex items-center gap-2 transition ${
              activeTab === 'empresas'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 border border-white/10'
            }`}
          >
            <Building2 className="w-4 h-4" />
            EMPRESAS PARCEIRAS ({partners.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pedidos')}
            className={`h-11 px-4 rounded-xl text-xs font-extrabold flex items-center gap-2 transition ${
              activeTab === 'pedidos'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 border border-white/10'
            }`}
          >
            <Coins className="w-4 h-4" />
            PEDIDOS DE CRÉDITO
            {stats.pendingOrdersCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                {stats.pendingOrdersCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('campanhas')}
            className={`h-11 px-4 rounded-xl text-xs font-extrabold flex items-center gap-2 transition ${
              activeTab === 'campanhas'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 border border-white/10'
            }`}
          >
            <Gift className="w-4 h-4" />
            CAMPANHAS ({campaigns.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('auditoria')}
            className={`h-11 px-4 rounded-xl text-xs font-extrabold flex items-center gap-2 transition ${
              activeTab === 'auditoria'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 border border-white/10'
            }`}
          >
            <History className="w-4 h-4" />
            EXTRATO / LEDGER ({events.length})
          </button>
        </div>

        <button
          type="button"
          disabled={refreshing}
          onClick={() => loadDashboard(true)}
          className="h-10 w-10 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 flex items-center justify-center text-slate-300"
          title="Atualizar dados"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="p-14 rounded-3xl bg-white/[0.03] border border-white/10 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <span className="text-sm font-medium">Carregando estrutura multi-tenant de vouchers...</span>
        </div>
      ) : (
        <>
          {/* ============================================================== */}
          {/* TAB 1: VOUCHERS */}
          {/* ============================================================== */}
          {activeTab === 'vouchers' && (
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por código, beneficiário, WhatsApp ou empresa parceira..."
                    className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/[0.04] border border-white/15 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <select
                  value={partnerFilterId}
                  onChange={(e) => setPartnerFilterId(e.target.value)}
                  className="h-11 px-3.5 rounded-xl bg-slate-900 border border-white/15 text-xs font-semibold text-white"
                >
                  <option value="ALL">Todas as Origens</option>
                  <option value="DIRECT">Somente Vouchers Diretos da Loja</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome_fantasia || p.razao_social}
                    </option>
                  ))}
                </select>

                <div className="flex flex-wrap gap-1.5">
                  {(['TODOS', 'ATIVOS', 'RESGATADOS', 'CANCELADOS'] as VoucherFilterStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setVoucherFilter(st)}
                      className={`h-11 px-3.5 rounded-xl text-xs font-extrabold transition ${
                        voucherFilter === st
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 border border-white/10'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bulk WhatsApp Action Bar */}
              {selectedVoucherIds.length > 0 && (
                <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-400/35 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs sm:text-sm font-semibold text-emerald-100">
                    {selectedVoucherIds.length} voucher(es) selecionado(s) para envio em lote
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedVoucherIds([])}
                      className="h-9 px-3 rounded-xl bg-white/10 text-xs font-semibold text-white"
                    >
                      Limpar Seleção
                    </button>
                    <button
                      type="button"
                      disabled={sendingBatchWa}
                      onClick={handleBatchSendWhatsApp}
                      className="h-9 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {sendingBatchWa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Disparar no WhatsApp
                    </button>
                  </div>
                </div>
              )}

              {filteredVouchers.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white/[0.03] border border-white/10 text-center space-y-3">
                  <Ticket className="w-10 h-10 text-slate-500 mx-auto" />
                  <h3 className="text-base font-bold text-white">Nenhum voucher encontrado</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Emita seu primeiro voucher individual avulso, vinculado a uma empresa parceira ou em lote para
                    colaboradores.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIssuePreselectedPartnerId(null);
                      setIssueModalMode('single');
                      setShowIssueModal(true);
                    }}
                    className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> EMITIR PRIMEIRO VOUCHER
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                  {/* Select All Strip */}
                  {selectableVisibleIds.length > 0 && (
                    <div className="px-4 py-2.5 bg-white/[0.03] border-b border-white/10 flex items-center justify-between text-xs text-slate-400">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedVoucherIds(
                            selectedVoucherIds.length === selectableVisibleIds.length ? [] : selectableVisibleIds
                          )
                        }
                        className="inline-flex items-center gap-2 text-slate-300 hover:text-white font-medium"
                      >
                        {selectedVoucherIds.length === selectableVisibleIds.length && selectableVisibleIds.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                        Selecionar todos com WhatsApp ({selectableVisibleIds.length})
                      </button>
                      <span>{filteredVouchers.length} exibido(s)</span>
                    </div>
                  )}

                  <div className="divide-y divide-white/10">
                    {filteredVouchers.map((v) => {
                      const stUpper = String(v.status || '').toUpperCase();
                      const waInfo = WA_STATUS_BADGE[v.mensagem_envio_status || 'PENDENTE'] || WA_STATUS_BADGE.PENDENTE;
                      const partnerObj = v.empresa_id ? partnerMap.get(v.empresa_id) : null;
                      const originLabel =
                        partnerObj?.nome_fantasia ||
                        partnerObj?.razao_social ||
                        v.empresa_razao_social ||
                        v.empresa_nome ||
                        'Avulso da Loja';
                      const canSelectWa =
                        normalizePhoneDigits(v.beneficiario_whatsapp).length >= 10 && stUpper !== 'CANCELADO';
                      const checked = selectedVoucherIds.includes(v.id);

                      return (
                        <div
                          key={v.id}
                          className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-white/[0.03] transition"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            {canSelectWa ? (
                              <button
                                type="button"
                                onClick={() => toggleSelectVoucher(v.id)}
                                className="mt-1 text-slate-400 hover:text-emerald-300 shrink-0"
                              >
                                {checked ? (
                                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            ) : (
                              <div className="w-4 shrink-0" />
                            )}

                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-sm text-white truncate">
                                  {v.beneficiario_nome || 'Beneficiário'}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${
                                    STATUS_BADGE[stUpper] || 'bg-white/10 text-slate-300 border-white/15'
                                  }`}
                                >
                                  {stUpper}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${waInfo.cls}`}>
                                  {waInfo.label}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                                <span className="font-mono text-slate-300">{v.public_token}</span>
                                <span>• {originLabel}</span>
                                {v.beneficiario_whatsapp && <span>• {formatPhoneDisplay(v.beneficiario_whatsapp)}</span>}
                                <span>
                                  • Validade:{' '}
                                  {v.validade_fim ? new Date(v.validade_fim).toLocaleDateString('pt-BR') : '-'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pl-7 md:pl-0">
                            <div className="text-left md:text-right">
                              <div className="text-base font-black text-emerald-300">{formatBRL(v.valor)}</div>
                              {v.campanha_nome && (
                                <div className="text-[10px] text-amber-300/90 truncate max-w-[140px]">
                                  {v.campanha_nome}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setDetailVoucher(v)}
                                className="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white flex items-center gap-1.5"
                              >
                                <QrCode className="w-4 h-4 text-cyan-300" />
                                QR / Ações
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: EMPRESAS PARCEIRAS (CRÉDITOS MENSAIS + DESCONTO + ACESSO) */}
          {/* ============================================================== */}
          {activeTab === 'empresas' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={partnerSearch}
                    onChange={(e) => setPartnerSearch(e.target.value)}
                    placeholder="Buscar empresa por nome, CNPJ ou usuário..."
                    className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/[0.04] border border-white/15 text-sm text-white"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={runningRenewals}
                    onClick={handleRunMonthlyRenewals}
                    className="h-11 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-bold text-white flex items-center gap-2 disabled:opacity-50"
                  >
                    {runningRenewals ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-cyan-300" />}
                    Processar Renovações do Mês
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPartner(null);
                      setShowPartnerModal(true);
                    }}
                    className="h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Nova Empresa Parceira
                  </button>
                </div>
              </div>

              {filteredPartners.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white/[0.03] border border-white/10 text-center space-y-3">
                  <Building2 className="w-10 h-10 text-slate-500 mx-auto" />
                  <h3 className="text-base font-bold text-white">Nenhuma empresa parceira cadastrada</h3>
                  <p className="text-xs text-slate-400 max-w-lg mx-auto">
                    Cadastre empresas conveniadas, crie login e senha exclusivos para o Portal B2B, configure benefício
                    mensal recorrente (ex: R$ 400/mês) ou libere compra de pacotes de créditos com desconto.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPartner(null);
                      setShowPartnerModal(true);
                    }}
                    className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Cadastrar Primeira Empresa
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredPartners.map((p) => {
                    const colabsTotal = colabCountByPartner.get(p.id) || 0;
                    const isActive = p.ativo !== false;

                    return (
                      <div
                        key={p.id}
                        className={`p-5 rounded-3xl border backdrop-blur-xl space-y-4 transition ${
                          isActive
                            ? 'bg-white/[0.04] border-white/12'
                            : 'bg-slate-950/70 border-rose-500/25 opacity-80'
                        }`}
                      >
                        {/* Top row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-extrabold text-white truncate">
                                {p.nome_fantasia || p.razao_social}
                              </h3>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  isActive
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                                }`}
                              >
                                {isActive ? 'Ativa' : 'Suspensa'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                              {p.razao_social} {p.cnpj ? `• CNPJ ${p.cnpj}` : ''}
                            </p>
                            <p className="text-[11px] text-cyan-300/90 mt-1">
                              Login Portal: <strong className="font-mono">{p.login_usuario || '—'}</strong>
                              {p.contato_whatsapp ? ` • WhatsApp: ${formatPhoneDisplay(p.contato_whatsapp)}` : ''}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-[10px] uppercase tracking-wider text-slate-400">Saldo Disponível</div>
                            <div className="text-2xl font-black text-emerald-300">{formatBRL(p.saldo_credito)}</div>
                          </div>
                        </div>

                        {/* Contract Pills */}
                        <div className="flex flex-wrap gap-2">
                          {p.credito_mensal_ativo ? (
                            <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-400/25 text-[11px] font-semibold text-emerald-200 flex items-center gap-1.5">
                              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                              Mensal: {formatBRL(p.valor_credito_mensal)} • Dia {p.dia_renovacao_mensal} (
                              {p.modo_renovacao_mensal === 'ACUMULAR' ? 'Acumula' : 'Teto Fixo'})
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-400">
                              Sem recarga mensal automática
                            </span>
                          )}

                          {p.permitir_compra_creditos ? (
                            <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-400/25 text-[11px] font-semibold text-amber-200 flex items-center gap-1.5">
                              <Percent className="w-3.5 h-3.5 text-amber-400" />
                              Compra no Portal: {Number(p.desconto_compra_percent || 0)}% OFF
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-400">
                              Compra no portal desativada
                            </span>
                          )}
                        </div>

                        {/* Actions Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-white/10">
                          <button
                            type="button"
                            onClick={() => setRechargeModalPartner(p)}
                            className="h-10 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-200 text-xs font-bold flex items-center justify-center gap-1.5"
                          >
                            <Wallet className="w-3.5 h-3.5" /> Recarregar / Vender
                          </button>

                          <button
                            type="button"
                            onClick={() => setColabsModalPartner(p)}
                            className="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                          >
                            <Users className="w-3.5 h-3.5 text-cyan-300" /> Colaboradores ({colabsTotal})
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIssuePreselectedPartnerId(p.id);
                              setIssueModalMode('batch');
                              setShowIssueModal(true);
                            }}
                            className="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                          >
                            <Send className="w-3.5 h-3.5 text-emerald-300" /> Emitir Lote
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setAccessModalPlainPwd(null);
                              setAccessModalPartner(p);
                            }}
                            className="h-10 px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/25 text-cyan-200 text-xs font-bold flex items-center justify-center gap-1.5"
                          >
                            <Key className="w-3.5 h-3.5" /> Acesso & Senha
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingPartner(p);
                              setShowPartnerModal(true);
                            }}
                            className="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Editar Plano
                          </button>

                          <button
                            type="button"
                            disabled={togglingPartnerId === p.id}
                            onClick={() => handleTogglePartnerActive(p)}
                            className={`h-10 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                              isActive
                                ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300'
                                : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            {isActive ? 'Suspender' : 'Reativar'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: PEDIDOS DE COMPRA DE CRÉDITOS B2B */}
          {/* ============================================================== */}
          {activeTab === 'pedidos' && (
            <div className="space-y-4">
              {creditOrders.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white/[0.03] border border-white/10 text-center space-y-2">
                  <Coins className="w-10 h-10 text-slate-500 mx-auto" />
                  <h3 className="text-base font-bold text-white">Nenhum pedido de crédito registrado ainda</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Quando uma empresa parceira solicitar compra de pacote de créditos com desconto pelo Portal B2B, ele
                    aparecerá aqui para aprovação em 1 clique.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {creditOrders.map((o) => {
                    const emp = partnerMap.get(o.empresa_id);
                    const isPending = o.status === 'PENDENTE';
                    return (
                      <div
                        key={o.id}
                        className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-white">
                              {emp?.nome_fantasia || emp?.razao_social || o.empresa_id}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${
                                ORDER_STATUS_BADGE[o.status] || 'bg-white/10 text-slate-300'
                              }`}
                            >
                              {o.status}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-semibold text-slate-300">
                              {o.forma_pagamento} • {o.origem}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            Solicitado em {new Date(o.created_at).toLocaleString('pt-BR')}
                            {o.solicitado_por ? ` por ${o.solicitado_por}` : ''}
                            {o.observacoes ? ` • "${o.observacoes}"` : ''}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between md:justify-end gap-4">
                          <div className="text-left md:text-right">
                            <div className="text-xs text-slate-400">
                              Crédito: <strong className="text-white">{formatBRL(o.valor_credito)}</strong>{' '}
                              {Number(o.desconto_percent) > 0 && (
                                <span className="text-amber-300">({o.desconto_percent}% OFF)</span>
                              )}
                            </div>
                            <div className="text-base font-black text-emerald-300">
                              Valor Líquido: {formatBRL(o.valor_pago)}
                            </div>
                          </div>

                          {isPending && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={decidingOrderId === o.id}
                                onClick={() => handleDecideOrder(o, 'REJEITAR')}
                                className="h-10 px-3.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                              >
                                <XCircle className="w-4 h-4" /> Rejeitar
                              </button>
                              <button
                                type="button"
                                disabled={decidingOrderId === o.id}
                                onClick={() => handleDecideOrder(o, 'APROVAR')}
                                className="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {decidingOrderId === o.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4" />
                                )}
                                Aprovar &amp; Creditar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: CAMPANHAS */}
          {/* ============================================================== */}
          {activeTab === 'campanhas' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCampaign(null);
                    setShowCampaignModal(true);
                  }}
                  className="h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Nova Campanha
                </button>
              </div>

              {campaigns.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white/[0.03] border border-white/10 text-center space-y-2">
                  <Gift className="w-10 h-10 text-slate-500 mx-auto" />
                  <h3 className="text-base font-bold text-white">Nenhuma campanha criada</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Crie campanhas com valores pré-definidos, janela de dias/horários permitidos no caixa e regras
                    corporativas ou promocionais.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {campaigns.map((cmp) => (
                    <div
                      key={cmp.id}
                      className="p-5 rounded-3xl bg-white/[0.04] border border-white/10 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-white">{cmp.nome}</h3>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                cmp.ativo !== false
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-slate-600/30 text-slate-400'
                              }`}
                            >
                              {cmp.ativo !== false ? 'Ativa' : 'Inativa'}
                            </span>
                          </div>
                          {cmp.descricao && <p className="text-xs text-slate-400 mt-1">{cmp.descricao}</p>}
                        </div>
                        <div className="text-lg font-black text-amber-300 shrink-0">
                          {formatBRL(cmp.valor_voucher)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
                        {cmp.empresa_nome && (
                          <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
                            Parceira: {cmp.empresa_nome}
                          </span>
                        )}
                        {cmp.horarios_permitidos && (
                          <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
                            Horário: {cmp.horarios_permitidos.inicio || '00:00'} às{' '}
                            {cmp.horarios_permitidos.fim || '23:59'}
                          </span>
                        )}
                        {cmp.validade_fim && (
                          <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
                            Até {new Date(cmp.validade_fim).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCampaign(cmp);
                            setShowCampaignModal(true);
                          }}
                          className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center gap-1.5"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button
                          type="button"
                          disabled={deletingCampaignId === cmp.id}
                          onClick={() => handleDeleteCampaign(cmp.id)}
                          className="h-9 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-xs font-semibold text-rose-200 flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {deletingCampaignId === cmp.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: EXTRATO / LEDGER AUDITÁVEL */}
          {/* ============================================================== */}
          {activeTab === 'auditoria' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrar extrato por operação, token, beneficiário ou motivo..."
                    className="w-full h-11 pl-10 pr-4 rounded-xl bg-white/[0.04] border border-white/15 text-sm text-white"
                  />
                </div>
                <select
                  value={ledgerFilter}
                  onChange={(e) => setLedgerFilter(e.target.value)}
                  className="h-11 px-3.5 rounded-xl bg-slate-900 border border-white/15 text-xs font-semibold text-white"
                >
                  <option value="ALL">Todas as Operações</option>
                  <option value="EMISSAO">Emissões</option>
                  <option value="RESGATE">Resgates no Caixa</option>
                  <option value="RECARGA_CREDITO">Recargas Manuais / Vendas</option>
                  <option value="RENOVACAO_MENSAL">Renovações Mensais</option>
                  <option value="COMPRA_CREDITO_APROVADA">Compras B2B Aprovadas</option>
                  <option value="CANCELAMENTO_ESTORNO">Cancelamentos & Estornos</option>
                  <option value="WHATSAPP_ENVIADO">Envios WhatsApp</option>
                </select>
              </div>

              {filteredEvents.length === 0 ? (
                <div className="p-10 rounded-3xl bg-white/[0.03] border border-white/10 text-center text-sm text-slate-400">
                  Nenhum evento registrado no extrato com os filtros atuais.
                </div>
              ) : (
                <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                  {filteredEvents.map((ev) => (
                    <div key={ev.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-lg bg-white/10 text-[10px] font-bold uppercase text-cyan-200">
                            {ev.tipo_operacao}
                          </span>
                          {ev.empresa_origem && (
                            <span className="text-xs font-semibold text-white">{ev.empresa_origem}</span>
                          )}
                          {ev.beneficiario_nome && (
                            <span className="text-xs text-slate-300">• {ev.beneficiario_nome}</span>
                          )}
                          {ev.voucher_token && (
                            <span className="text-[11px] font-mono text-slate-400">{ev.voucher_token}</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          {ev.motivo || 'Movimentação registrada'} •{' '}
                          {ev.data_hora || ev.created_at
                            ? new Date(ev.data_hora || ev.created_at || '').toLocaleString('pt-BR')
                            : '-'}
                          {ev.usuario_responsavel ? ` • por ${ev.usuario_responsavel}` : ''}
                        </div>
                      </div>
                      <div className="text-sm font-black text-emerald-300 shrink-0">
                        {Number(ev.valor || 0) > 0 ? formatBRL(ev.valor) : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ================================================================== */}
      {/* MODAIS CONECTADOS */}
      {/* ================================================================== */}
      <IssueVoucherModal
        isOpen={showIssueModal}
        onClose={() => setShowIssueModal(false)}
        tenantId={tenantId}
        storeName={storeProfile?.name || currentTenantName}
        operatorName={operatorName}
        partners={partners}
        campaigns={campaigns}
        colaboradores={colaboradores}
        instances={instances}
        defaultInstanceId={storeProfile?.voucher_default_instance_id}
        preselectedPartnerId={issuePreselectedPartnerId}
        preselectedMode={issueModalMode}
        onSuccess={() => loadDashboard(true)}
        onToast={showToast}
      />

      <VoucherPartnerModal
        isOpen={showPartnerModal}
        onClose={() => setShowPartnerModal(false)}
        tenantId={tenantId}
        editingPartner={editingPartner}
        onSaved={openPartnerSavedAccess}
        onToast={showToast}
      />

      <PartnerCollaboratorsModal
        isOpen={Boolean(colabsModalPartner)}
        onClose={() => setColabsModalPartner(null)}
        tenantId={tenantId}
        partner={colabsModalPartner}
        colaboradores={colaboradores}
        onRefresh={() => loadDashboard(true)}
        onOpenBatchIssueForPartner={(p) => {
          setIssuePreselectedPartnerId(p.id);
          setIssueModalMode('batch');
          setShowIssueModal(true);
        }}
        onToast={showToast}
      />

      <PartnerRechargeModal
        isOpen={Boolean(rechargeModalPartner)}
        onClose={() => setRechargeModalPartner(null)}
        tenantId={tenantId}
        partner={rechargeModalPartner}
        operatorName={operatorName}
        onSuccess={() => loadDashboard(true)}
        onToast={showToast}
      />

      <PartnerAccessModal
        isOpen={Boolean(accessModalPartner)}
        onClose={() => {
          setAccessModalPartner(null);
          setAccessModalPlainPwd(null);
        }}
        tenantId={tenantId}
        storeName={storeProfile?.name || currentTenantName}
        partner={accessModalPartner}
        initialPlainPassword={accessModalPlainPwd}
        instances={instances}
        defaultInstanceId={storeProfile?.voucher_default_instance_id}
        onToast={showToast}
        onRefresh={() => loadDashboard(true)}
      />

      <CampaignModal
        isOpen={showCampaignModal}
        onClose={() => setShowCampaignModal(false)}
        tenantId={tenantId}
        editingCampaign={editingCampaign}
        partners={partners}
        instances={instances}
        onSaved={() => loadDashboard(true)}
        onToast={showToast}
      />

      <VoucherDetailModal
        voucher={detailVoucher}
        onClose={() => setDetailVoucher(null)}
        tenantId={tenantId}
        storeName={storeProfile?.name || currentTenantName}
        operatorName={operatorName}
        instances={instances}
        defaultInstanceId={storeProfile?.voucher_default_instance_id}
        onRefresh={() => loadDashboard(true)}
        onToast={showToast}
      />

      <VoucherSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        tenantId={tenantId}
        store={storeProfile}
        instances={instances}
        onSaved={() => loadDashboard(true)}
        onToast={showToast}
      />
    </div>
  );
}
