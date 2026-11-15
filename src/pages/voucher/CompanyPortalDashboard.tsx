import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ticket,
  Users,
  Wallet,
  History,
  Plus,
  Send,
  Search,
  LogOut,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Loader2,
  Building2,
  Sparkles,
  AlertCircle,
  Percent,
  CreditCard,
  Trash2,
  Edit2,
  Upload,
  CheckSquare,
  Square,
  Store,
  Phone,
  Ban,
  Calendar,
  TrendingUp,
  X,
  MessageCircle
} from 'lucide-react';
import {
  voucherService,
  VoucherPartnerCompany,
  StoreProfile,
  VoucherRecord,
  VoucherColaborador,
  VoucherCreditOrder,
  VoucherEventRecord,
  formatBRL,
  formatPhoneDisplay,
  parseColaboradoresCsv
} from '../../services/voucherService';

type PortalTab = 'vouchers' | 'colaboradores' | 'creditos' | 'extrato';

export default function CompanyPortalDashboard() {
  const navigate = useNavigate();
  const [portalToken, setPortalToken] = useState<string | null>(() => localStorage.getItem('voucher_portal_token'));
  const [empresa, setEmpresa] = useState<VoucherPartnerCompany | null>(null);
  const [restaurante, setRestaurante] = useState<StoreProfile | null>(null);
  const [vouchers, setVouchers] = useState<VoucherRecord[]>([]);
  const [colaboradores, setColaboradores] = useState<VoucherColaborador[]>([]);
  const [creditOrders, setCreditOrders] = useState<VoucherCreditOrder[]>([]);
  const [events, setEvents] = useState<VoucherEventRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<PortalTab>('vouchers');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Filters & Selections
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ATIVOS' | 'RESGATADOS' | 'CANCELADOS'>('TODOS');
  const [selectedVouchers, setSelectedVouchers] = useState<string[]>([]);
  const [selectedColabs, setSelectedColabs] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingWaIds, setSendingWaIds] = useState<Record<string, boolean>>({});
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // Issue Single Modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueColabId, setIssueColabId] = useState('');
  const [issueNome, setIssueNome] = useState('');
  const [issueWhatsapp, setIssueWhatsapp] = useState('');
  const [issueValor, setIssueValor] = useState('50');
  const [issueValidadeDias, setIssueValidadeDias] = useState('30');
  const [issueObs, setIssueObs] = useState('');
  const [issueAutoSendWa, setIssueAutoSendWa] = useState(true);
  const [issuing, setIssuing] = useState(false);

  // Batch Issue Modal (selected collaborators)
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchValor, setBatchValor] = useState('50');
  const [batchValidadeDias, setBatchValidadeDias] = useState('30');
  const [batchObs, setBatchObs] = useState('');
  const [batchAutoSendWa, setBatchAutoSendWa] = useState(true);
  const [batchIssuing, setBatchIssuing] = useState(false);

  // Collaborator Modal & CSV Import Modal
  const [showColabModal, setShowColabModal] = useState(false);
  const [editingColab, setEditingColab] = useState<VoucherColaborador | null>(null);
  const [colabNome, setColabNome] = useState('');
  const [colabWhats, setColabWhats] = useState('');
  const [colabCpf, setColabCpf] = useState('');
  const [colabEmail, setColabEmail] = useState('');
  const [colabCargo, setColabCargo] = useState('');
  const [savingColab, setSavingColab] = useState(false);

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);

  // Buy Credits State
  const [buyCreditAmount, setBuyCreditAmount] = useState('500');
  const [buyPaymentMethod, setBuyPaymentMethod] = useState<'PIX' | 'BOLETO' | 'TRANSFERENCIA' | 'CARTAO' | 'FATURADO'>('PIX');
  const [buyObs, setBuyObs] = useState('');
  const [requestingCredit, setRequestingCredit] = useState(false);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const clearAndRedirect = useCallback(() => {
    localStorage.removeItem('voucher_portal_token');
    localStorage.removeItem('voucher_empresa_session');
    localStorage.removeItem('voucher_restaurante_info');
    navigate('/voucher-empresa/login', { replace: true });
  }, [navigate]);

  const loadDashboard = useCallback(
    async (silent = false) => {
      const token = localStorage.getItem('voucher_portal_token');
      if (!token) {
        clearAndRedirect();
        return;
      }
      setPortalToken(token);

      try {
        if (!silent) setLoading(true);
        else setRefreshing(true);

        const data = await voucherService.portalGetDashboard(token);
        setEmpresa(data.empresa);
        setRestaurante(data.restaurante);
        setVouchers(data.vouchers || []);
        setColaboradores(data.colaboradores || []);
        setCreditOrders(data.credit_orders || []);
        setEvents(data.events || []);

        localStorage.setItem('voucher_empresa_session', JSON.stringify(data.empresa));
        localStorage.setItem('voucher_restaurante_info', JSON.stringify(data.restaurante));
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.toLowerCase().includes('expirada') || msg.toLowerCase().includes('inválida') || msg.toLowerCase().includes('inativa')) {
          clearAndRedirect();
          return;
        }
        showToast('error', msg || 'Erro ao carregar dados do portal.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [clearAndRedirect, showToast]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleLogout = async () => {
    if (portalToken) {
      try {
        await voucherService.portalLogout(portalToken);
      } catch {}
    }
    clearAndRedirect();
  };

  // Filtered Vouchers
  const filteredVouchers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return vouchers.filter(v => {
      const isUsed = v.status === 'RESGATADO' || v.status === 'UTILIZADO';
      const isCancelled = v.status === 'CANCELADO';
      const isExpired = v.status === 'EXPIRADO' || (v.validade_fim && new Date(v.validade_fim) < new Date() && !isUsed && !isCancelled);
      const isActive = !isUsed && !isCancelled && !isExpired;

      if (statusFilter === 'ATIVOS' && !isActive) return false;
      if (statusFilter === 'RESGATADOS' && !isUsed) return false;
      if (statusFilter === 'CANCELADOS' && !isCancelled && !isExpired) return false;

      if (!q) return true;
      return (
        (v.public_token || '').toLowerCase().includes(q) ||
        (v.beneficiario_nome || '').toLowerCase().includes(q) ||
        (v.beneficiario_whatsapp || '').includes(q)
      );
    });
  }, [vouchers, searchTerm, statusFilter]);

  const metrics = useMemo(() => {
    let totalEmitido = 0;
    let ativosCount = 0;
    let ativosValor = 0;
    let resgatadosCount = 0;
    let resgatadosValor = 0;

    for (const v of vouchers) {
      const val = Number(v.valor || 0);
      if (v.status !== 'CANCELADO') totalEmitido += val;
      if (v.status === 'RESGATADO' || v.status === 'UTILIZADO') {
        resgatadosCount++;
        resgatadosValor += val;
      } else if (v.status !== 'CANCELADO' && v.status !== 'EXPIRADO') {
        ativosCount++;
        ativosValor += val;
      }
    }
    return { totalEmitido, ativosCount, ativosValor, resgatadosCount, resgatadosValor };
  }, [vouchers]);

  // Copy voucher link
  const handleCopyLink = (v: VoucherRecord) => {
    const url = `${window.location.origin}/voucher/${v.public_token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(v.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Send Single WhatsApp via secure backend portal endpoint
  const handleSendWhatsApp = async (voucherIds: string[]) => {
    if (!portalToken || voucherIds.length === 0) return;
    const mapUpdate: Record<string, boolean> = {};
    voucherIds.forEach(id => (mapUpdate[id] = true));
    setSendingWaIds(prev => ({ ...prev, ...mapUpdate }));

    try {
      const res = await voucherService.portalSendWhatsApp(portalToken, voucherIds);
      if (res.sentCount > 0 && res.failedCount === 0) {
        showToast('success', `${res.sentCount} voucher(s) enviado(s) com sucesso para o WhatsApp!`);
      } else if (res.sentCount > 0) {
        showToast('error', `Enviados: ${res.sentCount}. Falharam: ${res.failedCount}. Verifique os telefones ou conexão WhatsApp da loja.`);
      } else {
        const firstErr = res.results?.[0]?.error || 'Não foi possível enviar via WhatsApp.';
        showToast('error', firstErr);
      }
      await loadDashboard(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao disparar WhatsApp.');
    } finally {
      setSendingWaIds(prev => {
        const next = { ...prev };
        voucherIds.forEach(id => delete next[id]);
        return next;
      });
    }
  };

  // Issue Single Voucher
  const handleIssueSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalToken) return;
    const valorNum = parseFloat(issueValor.replace(',', '.'));
    if (!issueNome.trim()) {
      showToast('error', 'Informe o nome do colaborador / beneficiário.');
      return;
    }
    if (isNaN(valorNum) || valorNum <= 0) {
      showToast('error', 'Informe um valor válido maior que zero.');
      return;
    }

    setIssuing(true);
    try {
      const validadeFim = new Date(Date.now() + (parseInt(issueValidadeDias, 10) || 30) * 86400000).toISOString();
      const res = await voucherService.portalIssueVouchers(
        portalToken,
        [
          {
            colaborador_id: issueColabId || null,
            beneficiario_nome: issueNome.trim(),
            beneficiario_whatsapp: issueWhatsapp.trim() || null,
            valor: valorNum,
            observacoes: issueObs.trim() || null
          }
        ],
        validadeFim,
        issueObs.trim() || undefined
      );

      setShowIssueModal(false);
      setIssueColabId('');
      setIssueNome('');
      setIssueWhatsapp('');
      setIssueObs('');

      const created = res.vouchers || [];
      if (issueAutoSendWa && created.length > 0 && created[0].beneficiario_whatsapp) {
        showToast('success', `Voucher ${created[0].public_token} emitido! Enviando WhatsApp...`);
        await handleSendWhatsApp([created[0].id]);
      } else {
        showToast('success', `Voucher emitido! Saldo atualizado: ${formatBRL(res.saldo_novo)}`);
        await loadDashboard(true);
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao emitir voucher.');
    } finally {
      setIssuing(false);
    }
  };

  // Issue Batch to Selected Collaborators
  const handleIssueBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalToken || selectedColabs.length === 0) return;

    const valorUnit = parseFloat(batchValor.replace(',', '.'));
    if (isNaN(valorUnit) || valorUnit <= 0) {
      showToast('error', 'Informe um valor unitário válido.');
      return;
    }

    const targets = colaboradores.filter(c => selectedColabs.includes(c.id));
    if (targets.length === 0) return;

    setBatchIssuing(true);
    try {
      const validadeFim = new Date(Date.now() + (parseInt(batchValidadeDias, 10) || 30) * 86400000).toISOString();
      const items = targets.map(c => ({
        colaborador_id: c.id,
        beneficiario_nome: c.nome,
        beneficiario_whatsapp: c.whatsapp || null,
        valor: valorUnit,
        observacoes: batchObs.trim() || null
      }));

      const res = await voucherService.portalIssueVouchers(portalToken, items, validadeFim, batchObs.trim() || undefined);
      setShowBatchModal(false);
      setSelectedColabs([]);

      const withPhone = (res.vouchers || []).filter(v => Boolean(v.beneficiario_whatsapp)).map(v => v.id);
      if (batchAutoSendWa && withPhone.length > 0) {
        showToast('success', `${res.vouchers.length} voucher(s) gerados! Disparando ${withPhone.length} WhatsApp(s)...`);
        await handleSendWhatsApp(withPhone);
      } else {
        showToast('success', `${res.vouchers.length} voucher(s) emitidos com sucesso!`);
        await loadDashboard(true);
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao emitir lote de vouchers.');
    } finally {
      setBatchIssuing(false);
    }
  };

  // Cancel & Refund Voucher
  const handleCancelVoucher = async (v: VoucherRecord) => {
    if (!portalToken) return;
    if (!window.confirm(`Cancelar o voucher ${v.public_token} (${v.beneficiario_nome}) e estornar ${formatBRL(v.valor)} para o saldo da empresa?`)) {
      return;
    }
    setCancelingId(v.id);
    try {
      const res = await voucherService.portalCancelVoucher(portalToken, v.id, 'Cancelado e estornado pelo Portal B2B');
      showToast('success', `Voucher cancelado! ${formatBRL(res.saldo_estornado)} estornados ao seu saldo.`);
      await loadDashboard(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao cancelar voucher.');
    } finally {
      setCancelingId(null);
    }
  };

  // Save Collaborator
  const openColabModal = (col?: VoucherColaborador) => {
    if (col) {
      setEditingColab(col);
      setColabNome(col.nome);
      setColabWhats(col.whatsapp || '');
      setColabCpf(col.cpf || '');
      setColabEmail(col.email || '');
      setColabCargo(col.cargo || '');
    } else {
      setEditingColab(null);
      setColabNome('');
      setColabWhats('');
      setColabCpf('');
      setColabEmail('');
      setColabCargo('');
    }
    setShowColabModal(true);
  };

  const handleSaveColab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalToken || !colabNome.trim()) return;
    setSavingColab(true);
    try {
      await voucherService.portalSaveColaborador(portalToken, {
        id: editingColab?.id || null,
        nome: colabNome.trim(),
        whatsapp: colabWhats.trim(),
        cpf: colabCpf.trim(),
        email: colabEmail.trim(),
        cargo: colabCargo.trim(),
        ativo: true
      });
      setShowColabModal(false);
      showToast('success', editingColab ? 'Colaborador atualizado!' : 'Colaborador cadastrado!');
      await loadDashboard(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao salvar colaborador.');
    } finally {
      setSavingColab(false);
    }
  };

  const handleDeleteColab = async (c: VoucherColaborador) => {
    if (!portalToken) return;
    if (!window.confirm(`Remover o colaborador "${c.nome}" da lista?`)) return;
    try {
      await voucherService.portalDeleteColaborador(portalToken, c.id);
      setSelectedColabs(prev => prev.filter(id => id !== c.id));
      showToast('success', 'Colaborador removido.');
      await loadDashboard(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao remover colaborador.');
    }
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalToken) return;
    const rows = parseColaboradoresCsv(csvText);
    if (rows.length === 0) {
      showToast('error', 'Nenhum colaborador identificado. Use formato: Nome; WhatsApp; CPF; Cargo');
      return;
    }

    setImportingCsv(true);
    try {
      let ok = 0;
      for (const r of rows) {
        await voucherService.portalSaveColaborador(portalToken, r);
        ok++;
      }
      setShowCsvModal(false);
      setCsvText('');
      showToast('success', `${ok} colaborador(es) importado(s) com sucesso!`);
      await loadDashboard(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Erro durante importação.');
    } finally {
      setImportingCsv(false);
    }
  };

  // Request Discounted Credit Purchase Order
  const creditNumeric = Math.max(parseFloat(buyCreditAmount.replace(',', '.')) || 0, 0);
  const discountPct = Number(empresa?.desconto_compra_percent || 0);
  const discountMoney = Number((creditNumeric * (discountPct / 100)).toFixed(2));
  const netToPay = Number((creditNumeric - discountMoney).toFixed(2));

  const handleRequestCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalToken) return;
    if (creditNumeric < 10) {
      showToast('error', 'Informe um valor mínimo de R$ 10,00 em créditos.');
      return;
    }
    setRequestingCredit(true);
    try {
      await voucherService.portalRequestCreditOrder(portalToken, creditNumeric, buyPaymentMethod, buyObs.trim() || undefined);
      setBuyObs('');
      showToast('success', `Pedido de ${formatBRL(creditNumeric)} em créditos enviado para aprovação do estabelecimento!`);
      await loadDashboard(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao solicitar créditos.');
    } finally {
      setRequestingCredit(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b0e] text-slate-200 flex flex-col items-center justify-center gap-3 p-4">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        <span className="text-sm font-semibold text-slate-400">Carregando Portal Corporativo...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b0e] text-slate-100 pb-20">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 left-4 sm:left-auto sm:max-w-md z-50 p-4 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-start gap-3 animate-in slide-in-from-top-4 ${
            toast.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/95 border-rose-500/50 text-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <span className="text-xs sm:text-sm font-medium flex-1">{toast.msg}</span>
          <button type="button" onClick={() => setToast(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#0b1116]/85 backdrop-blur-xl border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-extrabold text-white truncate">
                  {empresa?.nome_fantasia || empresa?.razao_social}
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase">
                  Portal B2B
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 truncate mt-0.5">
                <Store className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                Convênio ativo em <strong className="text-slate-200">{restaurante?.name || 'Estabelecimento'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => loadDashboard(true)}
              disabled={refreshing}
              className="min-h-[42px] px-3.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 flex items-center gap-1.5 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => setShowIssueModal(true)}
              className="min-h-[42px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950/50 transition-all"
            >
              <Plus className="w-4 h-4" /> Emitir Voucher
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Sair do Portal"
              className="min-h-[42px] px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* KPI Overview Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-3xl bg-gradient-to-br from-emerald-950/50 via-slate-900/80 to-slate-900/90 border border-emerald-500/30 p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Saldo Disponível</span>
              <Wallet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-3xl font-black text-white">{formatBRL(empresa?.saldo_credito)}</div>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {empresa?.credito_mensal_ativo && Number(empresa.valor_credito_mensal) > 0 && (
                  <span className="px-2 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold">
                    Mensal: {formatBRL(empresa.valor_credito_mensal)} (Dia {empresa.dia_renovacao_mensal})
                  </span>
                )}
                {Number(empresa?.desconto_compra_percent || 0) > 0 && (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                    {empresa?.desconto_compra_percent}% OFF recarga
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-slate-900/75 border border-slate-800/80 p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Vouchers Ativos</span>
              <Ticket className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="text-2xl font-black text-white">{formatBRL(metrics.ativosValor)}</div>
              <p className="text-xs text-slate-400 mt-1">{metrics.ativosCount} cupons disponíveis p/ uso</p>
            </div>
          </div>

          <div className="rounded-3xl bg-slate-900/75 border border-slate-800/80 p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Resgatados na Loja</span>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-2xl font-black text-white">{formatBRL(metrics.resgatadosValor)}</div>
              <p className="text-xs text-slate-400 mt-1">{metrics.resgatadosCount} baixas confirmadas</p>
            </div>
          </div>

          <div className="rounded-3xl bg-slate-900/75 border border-slate-800/80 p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Equipe Cadastrada</span>
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="text-2xl font-black text-white">{colaboradores.length}</div>
              <p className="text-xs text-slate-400 mt-1">
                {empresa?.permitir_compra_creditos ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('creditos')}
                    className="text-emerald-400 hover:underline font-bold"
                  >
                    + Comprar créditos com desconto
                  </button>
                ) : (
                  'Colaboradores ativos no convênio'
                )}
              </p>
            </div>
          </div>
        </section>

        {/* Responsive Navigation Tabs */}
        <nav className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[
            { id: 'vouchers' as PortalTab, label: `Vouchers (${vouchers.length})`, icon: Ticket },
            { id: 'colaboradores' as PortalTab, label: `Colaboradores (${colaboradores.length})`, icon: Users },
            { id: 'creditos' as PortalTab, label: 'Créditos & Desconto', icon: Percent },
            { id: 'extrato' as PortalTab, label: `Extrato (${events.length})`, icon: History }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[46px] px-4 rounded-2xl text-xs font-extrabold flex items-center gap-2 shrink-0 border transition-all ${
                  active
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-950/50'
                    : 'bg-slate-900/75 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* ==================== TAB 1: VOUCHERS ==================== */}
        {activeTab === 'vouchers' && (
          <section className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar por token, nome do colaborador ou WhatsApp..."
                  className="w-full min-h-[46px] pl-10 pr-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto">
                {(['TODOS', 'ATIVOS', 'RESGATADOS', 'CANCELADOS'] as const).map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`min-h-[42px] px-3.5 rounded-xl text-xs font-bold border shrink-0 transition-all ${
                      statusFilter === st
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {selectedVouchers.length > 0 && (
              <div className="rounded-2xl bg-emerald-950/50 border border-emerald-500/40 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-emerald-300">
                  {selectedVouchers.length} voucher(s) selecionado(s)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSendWhatsApp(selectedVouchers)}
                    className="min-h-[40px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> Enviar Selecionados no WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedVouchers([])}
                    className="min-h-[40px] px-3 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                  >
                    Limpar
                  </button>
                </div>
              </div>
            )}

            {filteredVouchers.length === 0 ? (
              <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-10 text-center space-y-3">
                <Ticket className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-base font-bold text-white">Nenhum voucher encontrado</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Clique em "Emitir Voucher" ou selecione colaboradores na aba Colaboradores para gerar e enviar no WhatsApp automaticamente.
                </p>
                <button
                  type="button"
                  onClick={() => setShowIssueModal(true)}
                  className="min-h-[46px] px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Emitir Primeiro Voucher
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVouchers.map(v => {
                  const isUsed = v.status === 'RESGATADO' || v.status === 'UTILIZADO';
                  const isCancelled = v.status === 'CANCELADO';
                  const checked = selectedVouchers.includes(v.id);
                  const isSending = Boolean(sendingWaIds[v.id]);

                  return (
                    <div
                      key={v.id}
                      className={`rounded-3xl border p-5 flex flex-col justify-between gap-4 transition-all ${
                        isUsed
                          ? 'bg-slate-900/50 border-slate-800/80'
                          : isCancelled
                          ? 'bg-rose-950/15 border-rose-900/40 opacity-75'
                          : 'bg-slate-900/80 border-slate-800 hover:border-emerald-500/40'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {!isUsed && !isCancelled && v.beneficiario_whatsapp && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedVouchers(prev =>
                                    prev.includes(v.id) ? prev.filter(x => x !== v.id) : [...prev, v.id]
                                  )
                                }
                                className="text-slate-400 hover:text-emerald-400 shrink-0"
                              >
                                {checked ? <CheckSquare className="w-4 h-4 text-emerald-400" /> : <Square className="w-4 h-4" />}
                              </button>
                            )}
                            <span className="font-mono font-black text-sm text-emerald-400 truncate">{v.public_token}</span>
                          </div>

                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase shrink-0 ${
                              isUsed
                                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                : isCancelled
                                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {v.status}
                          </span>
                        </div>

                        <div>
                          <div className="text-base font-bold text-white truncate">{v.beneficiario_nome}</div>
                          <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span>{formatPhoneDisplay(v.beneficiario_whatsapp)}</span>
                            {v.mensagem_envio_status && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  v.mensagem_envio_status === 'ENVIADO' || v.mensagem_envio_status === 'NA_FILA'
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : v.mensagem_envio_status === 'ERRO'
                                    ? 'bg-rose-500/15 text-rose-300'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                WA: {v.mensagem_envio_status}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-end justify-between pt-2 border-t border-slate-800/80">
                          <div>
                            <div className="text-[10px] uppercase text-slate-500 font-bold">Valor</div>
                            <div className="text-2xl font-black text-white">{formatBRL(v.valor)}</div>
                          </div>
                          <div className="text-right text-[11px] text-slate-400">
                            <div>Validade</div>
                            <div className="font-semibold text-slate-200">
                              {new Date(v.validade_fim).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {!isCancelled && (
                          <button
                            type="button"
                            onClick={() => handleSendWhatsApp([v.id])}
                            disabled={isSending || !v.beneficiario_whatsapp}
                            className="min-h-[42px] px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5"
                          >
                            {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            WhatsApp
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopyLink(v)}
                          className="min-h-[42px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5"
                        >
                          {copiedId === v.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedId === v.id ? 'Copiado' : 'Copiar Link'}
                        </button>

                        <a
                          href={`/voucher/${v.public_token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-[40px] px-3 rounded-xl bg-slate-800/70 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Abrir Cupom
                        </a>

                        {!isUsed && !isCancelled && (
                          <button
                            type="button"
                            onClick={() => handleCancelVoucher(v)}
                            disabled={cancelingId === v.id}
                            className="min-h-[40px] px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5"
                          >
                            {cancelingId === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ==================== TAB 2: COLABORADORES ==================== */}
        {activeTab === 'colaboradores' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => openColabModal()}
                  className="min-h-[46px] px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Cadastrar Colaborador
                </button>
                <button
                  type="button"
                  onClick={() => setShowCsvModal(true)}
                  className="min-h-[46px] px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2"
                >
                  <Upload className="w-4 h-4 text-cyan-400" /> Importar em Lote (CSV)
                </button>
              </div>

              {selectedColabs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBatchModal(true)}
                  className="min-h-[46px] px-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg"
                >
                  <Ticket className="w-4 h-4" /> Gerar Voucher p/ {selectedColabs.length} Selecionado(s)
                </button>
              )}
            </div>

            {colaboradores.length === 0 ? (
              <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-10 text-center space-y-3">
                <Users className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-base font-bold text-white">Nenhum colaborador cadastrado</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Cadastre sua equipe para gerar vouchers individuais ou mensais em lote com apenas 1 clique e disparo automático no WhatsApp.
                </p>
              </div>
            ) : (
              <div className="rounded-3xl bg-slate-900/75 border border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedColabs(
                        selectedColabs.length === colaboradores.length ? [] : colaboradores.map(c => c.id)
                      )
                    }
                    className="font-bold text-emerald-400 flex items-center gap-2"
                  >
                    {selectedColabs.length === colaboradores.length ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    Selecionar Todos ({colaboradores.length})
                  </button>
                  <span>Selecione para emitir em lote</span>
                </div>

                <div className="divide-y divide-slate-800/70">
                  {colaboradores.map(col => {
                    const isChecked = selectedColabs.includes(col.id);
                    return (
                      <div key={col.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/30">
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedColabs(prev =>
                                prev.includes(col.id) ? prev.filter(id => id !== col.id) : [...prev, col.id]
                              )
                            }
                            className="p-1 text-slate-400 hover:text-emerald-400 shrink-0"
                          >
                            {isChecked ? <CheckSquare className="w-5 h-5 text-emerald-400" /> : <Square className="w-5 h-5" />}
                          </button>
                          <div className="min-w-0">
                            <div className="font-bold text-white text-sm truncate">{col.nome}</div>
                            <div className="text-xs text-slate-400 flex items-center gap-3 flex-wrap mt-0.5">
                              <span>📱 {formatPhoneDisplay(col.whatsapp)}</span>
                              {col.cargo && <span>• {col.cargo}</span>}
                              {col.cpf && <span>• CPF: {col.cpf}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setIssueColabId(col.id);
                              setIssueNome(col.nome);
                              setIssueWhatsapp(col.whatsapp || '');
                              setShowIssueModal(true);
                            }}
                            className="min-h-[40px] px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5"
                          >
                            <Ticket className="w-3.5 h-3.5" /> Gerar Voucher
                          </button>
                          <button
                            type="button"
                            onClick={() => openColabModal(col)}
                            className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteColab(col)}
                            className="min-h-[40px] px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ==================== TAB 3: CREDITOS & DESCONTO ==================== */}
        {activeTab === 'creditos' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Plan & Monthly Allowance Info */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-3xl bg-slate-900/75 border border-slate-800 p-6 space-y-4">
                <div className="flex items-center gap-2.5 text-cyan-400 font-extrabold text-sm">
                  <Calendar className="w-5 h-5" /> Plano Recorrente Mensal
                </div>
                {empresa?.credito_mensal_ativo ? (
                  <div className="space-y-3 text-sm">
                    <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30">
                      <div className="text-xs text-cyan-300 font-bold uppercase">Crédito Mensal Ativo</div>
                      <div className="text-2xl font-black text-white mt-1">
                        {formatBRL(empresa.valor_credito_mensal)} / mês
                      </div>
                      <div className="text-xs text-slate-300 mt-1">
                        Renovação todo <strong>dia {empresa.dia_renovacao_mensal}</strong> •{' '}
                        {empresa.modo_renovacao_mensal === 'ACUMULAR'
                          ? 'Soma ao saldo anterior'
                          : 'Completa o teto mensal'}
                      </div>
                      {empresa.ultima_renovacao_competencia && (
                        <div className="text-[11px] text-emerald-400 font-semibold mt-2">
                          ✓ Competência renovada: {empresa.ultima_renovacao_competencia}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Sua empresa opera atualmente no modo pré-pago / sob demanda. Caso queira habilitar um limite mensal fixo automático, solicite ao estabelecimento.
                  </p>
                )}

                {restaurante?.whatsapp && (
                  <a
                    href={`https://wa.me/${restaurante.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
                      `Olá ${restaurante.name}! Aqui é da empresa ${empresa?.nome_fantasia || empresa?.razao_social}. Gostaria de falar sobre nossos créditos de vouchers.`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full min-h-[46px] rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-400" /> Falar com Financeiro do Estabelecimento
                  </a>
                )}
              </div>
            </div>

            {/* Buy Credits with Negotiated Discount */}
            <div className="lg:col-span-7 space-y-5">
              <div className="rounded-3xl bg-slate-900/75 border border-emerald-500/30 p-6 space-y-5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-emerald-400" /> Comprar Créditos com Desconto
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      O crédito é adicionado ao saldo assim que o estabelecimento confirmar o pagamento.
                    </p>
                  </div>
                  {discountPct > 0 && (
                    <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-black">
                      SEU DESCONTO: {discountPct}% OFF
                    </span>
                  )}
                </div>

                {!empresa?.permitir_compra_creditos ? (
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
                    A solicitação autônoma de créditos não está habilitada neste contrato. Entre em contato com {restaurante?.name}.
                  </div>
                ) : (
                  <form onSubmit={handleRequestCredit} className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {[300, 500, 1000, 2000].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setBuyCreditAmount(String(preset))}
                          className={`min-h-[40px] px-4 rounded-xl text-xs font-extrabold border transition-all ${
                            creditNumeric === preset
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                              : 'bg-slate-950/70 text-slate-300 border-slate-800 hover:border-emerald-500/40'
                          }`}
                        >
                          +{formatBRL(preset)}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                          Valor em Créditos (R$)
                        </label>
                        <input
                          type="number"
                          min="10"
                          step="10"
                          value={buyCreditAmount}
                          onChange={e => setBuyCreditAmount(e.target.value)}
                          className="w-full min-h-[48px] px-4 rounded-2xl bg-slate-950/80 border border-slate-700 text-white font-bold text-base outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                          Forma de Pagamento
                        </label>
                        <select
                          value={buyPaymentMethod}
                          onChange={e => setBuyPaymentMethod(e.target.value as any)}
                          className="w-full min-h-[48px] px-4 rounded-2xl bg-slate-950/80 border border-slate-700 text-white text-sm font-bold outline-none focus:border-emerald-500"
                        >
                          <option value="PIX">PIX (Aprovação Rápida)</option>
                          <option value="TRANSFERENCIA">Transferência TED / DOC</option>
                          <option value="BOLETO">Boleto Corporativo</option>
                          <option value="CARTAO">Cartão de Crédito Corporativo</option>
                          <option value="FATURADO">Faturamento Mensal</option>
                        </select>
                      </div>
                    </div>

                    {/* Discount Summary Breakdown */}
                    <div className="rounded-2xl bg-slate-950/75 border border-slate-800 p-4 space-y-2 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Crédito que entra para seus colaboradores:</span>
                        <span className="font-bold text-white">{formatBRL(creditNumeric)}</span>
                      </div>
                      <div className="flex justify-between text-amber-300">
                        <span>Desconto exclusivo da parceria ({discountPct}%):</span>
                        <span className="font-bold">- {formatBRL(discountMoney)}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm">
                        <span className="font-bold text-emerald-300">Valor líquido a pagar:</span>
                        <span className="text-xl font-black text-emerald-400">{formatBRL(netToPay)}</span>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={buyObs}
                      onChange={e => setBuyObs(e.target.value)}
                      placeholder="Observação opcional (ex: Centro de Custo / CNPJ faturamento)"
                      className="w-full min-h-[44px] px-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-white outline-none focus:border-emerald-500"
                    />

                    <button
                      type="submit"
                      disabled={requestingCredit}
                      className="w-full min-h-[50px] rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2"
                    >
                      {requestingCredit ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Solicitar Compra de {formatBRL(creditNumeric)} (Pagar {formatBRL(netToPay)})
                    </button>
                  </form>
                )}
              </div>

              {/* Orders History */}
              {creditOrders.length > 0 && (
                <div className="rounded-3xl bg-slate-900/75 border border-slate-800 p-5 space-y-3">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    Histórico de Compras & Recargas
                  </h3>
                  <div className="space-y-2.5">
                    {creditOrders.map(ord => (
                      <div key={ord.id} className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="font-bold text-white">
                            +{formatBRL(ord.valor_credito)} em créditos{' '}
                            <span className="text-slate-400 font-normal">
                              (Pago: {formatBRL(ord.valor_pago)} • {ord.forma_pagamento})
                            </span>
                          </div>
                          <div className="text-slate-500 mt-0.5">
                            {new Date(ord.created_at).toLocaleString('pt-BR')}
                            {ord.desconto_percent > 0 && ` • ${ord.desconto_percent}% OFF`}
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase shrink-0 ${
                            ord.status === 'APROVADO'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : ord.status === 'REJEITADO'
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ==================== TAB 4: EXTRATO LEDGER ==================== */}
        {activeTab === 'extrato' && (
          <section className="rounded-3xl bg-slate-900/75 border border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-400" /> Extrato Auditável de Movimentações
              </h2>
              <span className="text-xs text-slate-400">Últimos {events.length} eventos</span>
            </div>
            {events.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">Nenhuma movimentação registrada ainda.</div>
            ) : (
              <div className="divide-y divide-slate-800/70">
                {events.map(ev => {
                  const isCreditIn =
                    ev.tipo_operacao.includes('RECARGA') ||
                    ev.tipo_operacao.includes('RENOVACAO') ||
                    ev.tipo_operacao.includes('ESTORN') ||
                    ev.tipo_operacao.includes('APROVADA') ||
                    ev.tipo_operacao === 'CREDITO_INICIAL';
                  return (
                    <div key={ev.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-bold text-[10px]">
                            {ev.tipo_operacao}
                          </span>
                          {ev.voucher_token && (
                            <span className="font-mono font-bold text-emerald-400">{ev.voucher_token}</span>
                          )}
                          <span className="text-slate-400">• {ev.beneficiario_nome}</span>
                        </div>
                        <p className="text-slate-400 mt-1">{ev.motivo}</p>
                      </div>
                      <div className="sm:text-right shrink-0">
                        <div className={`text-sm font-black ${isCreditIn ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {isCreditIn ? '+' : ''}
                          {formatBRL(ev.valor)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {new Date(ev.data_hora || ev.created_at || Date.now()).toLocaleString('pt-BR')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* ==================== MODAL: EMITIR VOUCHER INDIVIDUAL ==================== */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" /> Emitir Voucher Corporativo
              </h3>
              <button type="button" onClick={() => setShowIssueModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleIssueSingle} className="space-y-3.5">
              {colaboradores.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                    Selecionar Colaborador Cadastrado (Opcional)
                  </label>
                  <select
                    value={issueColabId}
                    onChange={e => {
                      const id = e.target.value;
                      setIssueColabId(id);
                      const found = colaboradores.find(c => c.id === id);
                      if (found) {
                        setIssueNome(found.nome);
                        setIssueWhatsapp(found.whatsapp || '');
                      }
                    }}
                    className="w-full min-h-[46px] px-3.5 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Digitar manualmente --</option>
                    {colaboradores.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nome} {c.whatsapp ? `(${formatPhoneDisplay(c.whatsapp)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Nome do Beneficiário *
                </label>
                <input
                  type="text"
                  required
                  value={issueNome}
                  onChange={e => setIssueNome(e.target.value)}
                  placeholder="Ex: Maria Clara Oliveira"
                  className="w-full min-h-[46px] px-4 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                    WhatsApp (para envio)
                  </label>
                  <input
                    type="tel"
                    value={issueWhatsapp}
                    onChange={e => setIssueWhatsapp(e.target.value)}
                    placeholder="11999998888"
                    className="w-full min-h-[46px] px-4 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={issueValor}
                    onChange={e => setIssueValor(e.target.value)}
                    className="w-full min-h-[46px] px-4 rounded-2xl bg-slate-950 border border-slate-700 text-sm font-bold text-emerald-400 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Validade (dias)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={issueValidadeDias}
                    onChange={e => setIssueValidadeDias(e.target.value)}
                    className="w-full min-h-[46px] px-4 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Observação</label>
                  <input
                    type="text"
                    value={issueObs}
                    onChange={e => setIssueObs(e.target.value)}
                    placeholder="Ex: Meta mensal / Almoço"
                    className="w-full min-h-[46px] px-4 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={issueAutoSendWa}
                  onChange={e => setIssueAutoSendWa(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
                <span className="text-xs font-semibold text-emerald-200">
                  Enviar automaticamente o QR Code para o WhatsApp do colaborador via {restaurante?.name || 'loja'}
                </span>
              </label>

              <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
                <span>Saldo disponível: <strong className="text-white">{formatBRL(empresa?.saldo_credito)}</strong></span>
                <button
                  type="submit"
                  disabled={issuing}
                  className="min-h-[48px] px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center gap-2"
                >
                  {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar Emissão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: EMISSAO EM LOTE (COLABORADORES) ==================== */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-white">Gerar Lote p/ {selectedColabs.length} Colaboradores</h3>
              <button type="button" onClick={() => setShowBatchModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleIssueBatch} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Valor Unitário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={batchValor}
                    onChange={e => setBatchValor(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-2xl bg-slate-950 border border-slate-700 text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Validade (dias)</label>
                  <input
                    type="number"
                    min="1"
                    value={batchValidadeDias}
                    onChange={e => setBatchValidadeDias(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-2xl bg-slate-950 border border-slate-700 text-white"
                  />
                </div>
              </div>
              <input
                type="text"
                value={batchObs}
                onChange={e => setBatchObs(e.target.value)}
                placeholder="Motivo do lote (ex: Vale refeição mês atual)"
                className="w-full min-h-[46px] px-3.5 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white"
              />
              <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={batchAutoSendWa}
                  onChange={e => setBatchAutoSendWa(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
                <span className="text-xs font-semibold text-emerald-200">Disparar WhatsApp para todos com telefone</span>
              </label>
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs flex justify-between">
                <span className="text-slate-400">Débito total do lote:</span>
                <strong className="text-emerald-400 font-black">
                  {formatBRL((parseFloat(batchValor) || 0) * selectedColabs.length)}
                </strong>
              </div>
              <button
                type="submit"
                disabled={batchIssuing}
                className="w-full min-h-[48px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2"
              >
                {batchIssuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Emitir {selectedColabs.length} Vouchers Agora
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: CADASTRAR/EDITAR COLABORADOR ==================== */}
      {showColabModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-white">
                {editingColab ? 'Editar Colaborador' : 'Novo Colaborador'}
              </h3>
              <button type="button" onClick={() => setShowColabModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveColab} className="space-y-3">
              <input
                type="text"
                required
                value={colabNome}
                onChange={e => setColabNome(e.target.value)}
                placeholder="Nome completo *"
                className="w-full min-h-[46px] px-4 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white"
              />
              <input
                type="tel"
                value={colabWhats}
                onChange={e => setColabWhats(e.target.value)}
                placeholder="WhatsApp com DDD (ex: 11999998888)"
                className="w-full min-h-[46px] px-4 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={colabCpf}
                  onChange={e => setColabCpf(e.target.value)}
                  placeholder="CPF (opcional)"
                  className="w-full min-h-[46px] px-4 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white"
                />
                <input
                  type="text"
                  value={colabCargo}
                  onChange={e => setColabCargo(e.target.value)}
                  placeholder="Cargo / Setor"
                  className="w-full min-h-[46px] px-4 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white"
                />
              </div>
              <input
                type="email"
                value={colabEmail}
                onChange={e => setColabEmail(e.target.value)}
                placeholder="E-mail (opcional)"
                className="w-full min-h-[46px] px-4 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white"
              />
              <button
                type="submit"
                disabled={savingColab}
                className="w-full min-h-[48px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2"
              >
                {savingColab ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Salvar Colaborador
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: IMPORTAR CSV ==================== */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-white">Importar Equipe via CSV / Planilha</h3>
              <button type="button" onClick={() => setShowCsvModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Cole linhas no formato <code className="text-emerald-400">Nome; WhatsApp; CPF; Cargo</code> (uma pessoa por linha):
            </p>
            <form onSubmit={handleImportCsv} className="space-y-3">
              <textarea
                rows={6}
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder={'Ana Souza; 11988887777; 12345678900; Vendas\nBruno Lima; 11977776666; ; Cozinha'}
                className="w-full p-3.5 rounded-2xl bg-slate-950 border border-slate-700 text-xs font-mono text-white outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={importingCsv}
                className="w-full min-h-[48px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2"
              >
                {importingCsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Importar Colaboradores Agora
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
