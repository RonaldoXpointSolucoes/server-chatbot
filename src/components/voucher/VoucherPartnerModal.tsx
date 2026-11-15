import React, { useEffect, useState } from 'react';
import {
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  Eye,
  EyeOff,
  Key,
  Loader2,
  MapPin,
  Percent,
  RefreshCw,
  Search,
  Sparkles,
  User,
  Wallet,
  X
} from 'lucide-react';
import { CnpjData, formatCep, formatCnpj, lookupCnpj } from '../../services/cnpjService';
import {
  formatBRL,
  normalizePhoneDigits,
  VoucherPartnerCompany,
  voucherService
} from '../../services/voucherService';

interface VoucherPartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  editingPartner: VoucherPartnerCompany | null;
  onSaved: (partner: VoucherPartnerCompany, generatedPassword?: string | null) => void;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

const PRESET_MONTHLY_VALUES = [200, 300, 400, 500, 1000];
const PRESET_DISCOUNT_VALUES = [0, 5, 10, 15, 20];

export const VoucherPartnerModal: React.FC<VoucherPartnerModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  editingPartner,
  onSaved,
  onToast
}) => {
  const [saving, setSaving] = useState(false);
  const [lookingUpCnpj, setLookingUpCnpj] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAddressSection, setShowAddressSection] = useState(false);

  const [razaoSocial, setRazaoSocial] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [statusCnpj, setStatusCnpj] = useState('');
  const [contatoNome, setContatoNome] = useState('');
  const [contatoWhatsapp, setContatoWhatsapp] = useState('');
  const [emailEmpresa, setEmailEmpresa] = useState('');
  const [loginUsuario, setLoginUsuario] = useState('');
  const [loginSenha, setLoginSenha] = useState('');

  const [saldoInicial, setSaldoInicial] = useState<string>('0');
  const [creditoFim, setCreditoFim] = useState('');
  const [limiteVouchers, setLimiteVouchers] = useState<string>('0');
  const [ativo, setAtivo] = useState(true);

  const [creditoMensalAtivo, setCreditoMensalAtivo] = useState(false);
  const [valorCreditoMensal, setValorCreditoMensal] = useState<string>('400');
  const [diaRenovacaoMensal, setDiaRenovacaoMensal] = useState<number>(1);
  const [modoRenovacaoMensal, setModoRenovacaoMensal] = useState<'RENOVAR_TETO' | 'ACUMULAR'>('RENOVAR_TETO');

  const [permitirCompraCreditos, setPermitirCompraCreditos] = useState(true);
  const [descontoCompraPercent, setDescontoCompraPercent] = useState<string>('0');

  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [telefoneEmpresa, setTelefoneEmpresa] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setShowPassword(false);
    if (editingPartner) {
      setRazaoSocial(editingPartner.razao_social || '');
      setNomeFantasia(editingPartner.nome_fantasia || '');
      setCnpj(editingPartner.cnpj || '');
      setStatusCnpj(editingPartner.status_cnpj || '');
      setContatoNome(editingPartner.contato_nome || '');
      setContatoWhatsapp(editingPartner.contato_whatsapp || '');
      setEmailEmpresa(editingPartner.email_empresa || '');
      setLoginUsuario(editingPartner.login_usuario || '');
      setLoginSenha('');
      setSaldoInicial(String(editingPartner.saldo_credito ?? 0));
      setCreditoFim(editingPartner.credito_fim ? editingPartner.credito_fim.slice(0, 10) : '');
      setLimiteVouchers(String(editingPartner.limite_vouchers ?? 0));
      setAtivo(editingPartner.ativo !== false);

      setCreditoMensalAtivo(Boolean(editingPartner.credito_mensal_ativo));
      setValorCreditoMensal(String(editingPartner.valor_credito_mensal ?? 400));
      setDiaRenovacaoMensal(Number(editingPartner.dia_renovacao_mensal || 1));
      setModoRenovacaoMensal(editingPartner.modo_renovacao_mensal === 'ACUMULAR' ? 'ACUMULAR' : 'RENOVAR_TETO');

      setPermitirCompraCreditos(editingPartner.permitir_compra_creditos !== false);
      setDescontoCompraPercent(String(editingPartner.desconto_compra_percent ?? 0));

      setCep(editingPartner.cep || '');
      setLogradouro(editingPartner.logradouro || '');
      setNumero(editingPartner.numero || '');
      setComplemento(editingPartner.complemento || '');
      setBairro(editingPartner.bairro || '');
      setCidade(editingPartner.municipio || '');
      setUf(editingPartner.uf || '');
      setTelefoneEmpresa(editingPartner.telefone_empresa || '');
      setShowAddressSection(Boolean(editingPartner.logradouro || editingPartner.cep));
    } else {
      setRazaoSocial('');
      setNomeFantasia('');
      setCnpj('');
      setStatusCnpj('');
      setContatoNome('');
      setContatoWhatsapp('');
      setEmailEmpresa('');
      setLoginUsuario('');
      setLoginSenha('');
      setSaldoInicial('0');
      setCreditoFim('');
      setLimiteVouchers('0');
      setAtivo(true);

      setCreditoMensalAtivo(false);
      setValorCreditoMensal('400');
      setDiaRenovacaoMensal(1);
      setModoRenovacaoMensal('RENOVAR_TETO');

      setPermitirCompraCreditos(true);
      setDescontoCompraPercent('0');

      setCep('');
      setLogradouro('');
      setNumero('');
      setComplemento('');
      setBairro('');
      setCidade('');
      setUf('');
      setTelefoneEmpresa('');
      setShowAddressSection(false);
    }
  }, [isOpen, editingPartner]);

  if (!isOpen) return null;

  const handleCnpjLookup = async () => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14) {
      onToast('error', 'Informe os 14 dígitos do CNPJ para consultar automaticamente.');
      return;
    }
    setLookingUpCnpj(true);
    try {
      const data: CnpjData = await lookupCnpj(clean);
      setCnpj(data.cnpj || formatCnpj(clean));
      if (data.razaoSocial) setRazaoSocial(data.razaoSocial);
      if (data.nomeFantasia) setNomeFantasia(data.nomeFantasia);
      if (data.cep) setCep(data.cep);
      if (data.logradouro) setLogradouro(data.logradouro);
      if (data.numero) setNumero(data.numero);
      if (data.complemento) setComplemento(data.complemento);
      if (data.bairro) setBairro(data.bairro);
      if (data.municipio) setCidade(data.municipio);
      if (data.uf) setUf(data.uf);
      if (data.telefone) setTelefoneEmpresa(data.telefone);
      if (data.email && !emailEmpresa) setEmailEmpresa(data.email);
      if (data.statusCnpj) setStatusCnpj(data.statusCnpj);
      if (!loginUsuario && data.nomeFantasia) {
        const suggested = data.nomeFantasia
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '');
        if (suggested) setLoginUsuario(suggested.slice(0, 24));
      }
      setShowAddressSection(true);
      onToast('success', 'Dados do CNPJ carregados da Receita!');
    } catch (err: any) {
      onToast('error', err?.message || 'Não foi possível consultar o CNPJ agora.');
    } finally {
      setLookingUpCnpj(false);
    }
  };

  const handleGenerateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let pass = '';
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setLoginSenha(pass);
    setShowPassword(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) {
      onToast('error', 'Selecione uma loja no menu superior antes de salvar.');
      return;
    }
    if (!razaoSocial.trim()) {
      onToast('error', 'Informe a Razão Social ou nome da empresa parceira.');
      return;
    }

    const monthlyVal = Math.max(0, Number(valorCreditoMensal.replace(',', '.')) || 0);
    const discountPct = Math.min(90, Math.max(0, Number(descontoCompraPercent.replace(',', '.')) || 0));
    const initialBal = Math.max(0, Number(saldoInicial.replace(',', '.')) || 0);
    const limitVch = Math.max(0, parseInt(limiteVouchers || '0', 10) || 0);

    setSaving(true);
    try {
      const res = await voucherService.merchantSavePartner({
        tenantId,
        id: editingPartner?.id || null,
        razao_social: razaoSocial.trim(),
        nome_fantasia: nomeFantasia.trim() || undefined,
        cnpj: cnpj.trim() || undefined,
        status_cnpj: statusCnpj.trim() || undefined,
        contato_nome: contatoNome.trim() || undefined,
        contato_whatsapp: normalizePhoneDigits(contatoWhatsapp) || undefined,
        email_empresa: emailEmpresa.trim() || undefined,
        login_usuario: loginUsuario.trim() || undefined,
        login_senha: loginSenha.trim() || undefined,
        saldo_inicial: editingPartner ? undefined : initialBal,
        credito_fim: creditoFim ? new Date(`${creditoFim}T23:59:59-03:00`).toISOString() : null,
        limite_vouchers: limitVch,
        ativo,
        credito_mensal_ativo: creditoMensalAtivo,
        valor_credito_mensal: monthlyVal,
        dia_renovacao_mensal: Math.min(28, Math.max(1, diaRenovacaoMensal || 1)),
        modo_renovacao_mensal: modoRenovacaoMensal,
        permitir_compra_creditos: permitirCompraCreditos,
        desconto_compra_percent: discountPct,
        cep: cep.trim() || undefined,
        logradouro: logradouro.trim() || undefined,
        numero: numero.trim() || undefined,
        complemento: complemento.trim() || undefined,
        bairro: bairro.trim() || undefined,
        cidade: cidade.trim() || undefined,
        uf: uf.trim().toUpperCase().slice(0, 2) || undefined,
        telefone_empresa: normalizePhoneDigits(telefoneEmpresa) || undefined
      });

      onSaved(res.partner, res.generated_password || (loginSenha.trim() || null));
      onClose();
    } catch (err: any) {
      onToast('error', err?.message || 'Erro ao salvar empresa parceira.');
    } finally {
      setSaving(false);
    }
  };

  const discountPreview = Math.min(90, Math.max(0, Number(descontoCompraPercent.replace(',', '.')) || 0));
  const simulatedPay1000 = 1000 * (1 - discountPreview / 100);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-3xl max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-3xl bg-[#0b1526] border border-white/15 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate">
                {editingPartner ? 'Editar Empresa Parceira' : 'Nova Empresa Parceira B2B'}
              </h2>
              <p className="text-xs text-slate-400">
                Configure acesso ao portal, benefício mensal recorrente e compra de créditos com desconto.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 transition shrink-0 active:scale-95"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-4 sm:p-5 pb-8 sm:pb-5 space-y-5">
          {/* 1. CNPJ & Identificação */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Identificação da Empresa
              </h3>
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                Convênio Ativo
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-5">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">CNPJ (Auto-preenchimento)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cnpj}
                    onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                    placeholder="00.000.000/0001-00"
                    className="w-full h-11 px-3 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={handleCnpjLookup}
                    disabled={lookingUpCnpj}
                    className="h-11 px-3.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50 transition"
                    title="Buscar CNPJ na Receita"
                  >
                    {lookingUpCnpj ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Buscar
                  </button>
                </div>
              </div>

              <div className="md:col-span-7">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Razão Social / Nome da Empresa <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  placeholder="Ex: Terras Gonçalves Engenharia Ltda"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="md:col-span-6">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Nome Fantasia (Exibido no Voucher)</label>
                <input
                  type="text"
                  value={nomeFantasia}
                  onChange={(e) => setNomeFantasia(e.target.value)}
                  placeholder="Ex: Terras Gonçalves"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Responsável / RH</label>
                <input
                  type="text"
                  value={contatoNome}
                  onChange={(e) => setContatoNome(e.target.value)}
                  placeholder="Nome do contato"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-300 mb-1.5">WhatsApp do RH</label>
                <input
                  type="text"
                  value={contatoWhatsapp}
                  onChange={(e) => setContatoWhatsapp(e.target.value)}
                  placeholder="11999998888"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                />
              </div>
            </div>
          </div>

          {/* 2. Credenciais Portal B2B */}
          <div className="p-4 rounded-2xl bg-cyan-500/[0.05] border border-cyan-400/20 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                <Key className="w-4 h-4" /> Login e Senha do Portal B2B da Empresa
              </h3>
              <span className="text-[11px] text-cyan-200/80">
                Permite a empresa entrar e emitir vouchers para os colaboradores dela
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">E-mail Corporativo</label>
                <input
                  type="email"
                  value={emailEmpresa}
                  onChange={(e) => setEmailEmpresa(e.target.value)}
                  placeholder="rh@empresa.com.br"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Usuário de Login</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    value={loginUsuario}
                    onChange={(e) => setLoginUsuario(e.target.value)}
                    placeholder="usuario ou e-mail"
                    className="w-full h-11 pl-9 pr-3.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {editingPartner ? 'Nova Senha (opcional)' : 'Senha Inicial (vazio = auto)'}
                </label>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={loginSenha}
                      onChange={(e) => setLoginSenha(e.target.value)}
                      placeholder={editingPartner ? 'Manter atual' : 'Auto-gerar'}
                      className="w-full h-11 pl-3.5 pr-9 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-3 text-slate-400 hover:text-white"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateRandomPassword}
                    className="h-11 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white font-medium flex items-center gap-1 shrink-0"
                    title="Gerar senha segura"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Crédito Mensal Recorrente + Compra com Desconto */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mensal Recorrente */}
            <div className="p-4 rounded-2xl bg-emerald-500/[0.05] border border-emerald-400/20 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Crédito Mensal Fixo
                </h3>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={creditoMensalAtivo}
                    onChange={(e) => setCreditoMensalAtivo(e.target.checked)}
                    className="w-4 h-4 rounded accent-emerald-500"
                  />
                  <span className="text-xs font-medium text-white">
                    {creditoMensalAtivo ? 'Ativo' : 'Desativado'}
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PRESET_MONTHLY_VALUES.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setCreditoMensalAtivo(true);
                      setValorCreditoMensal(String(val));
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                      creditoMensalAtivo && Number(valorCreditoMensal) === val
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-white/10 text-slate-300 hover:bg-white/15'
                    }`}
                  >
                    {formatBRL(val)}/mês
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Valor Mensal (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={!creditoMensalAtivo}
                    value={valorCreditoMensal}
                    onChange={(e) => setValorCreditoMensal(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white disabled:opacity-40 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">Dia Renovação (1-28)</label>
                  <select
                    disabled={!creditoMensalAtivo}
                    value={diaRenovacaoMensal}
                    onChange={(e) => setDiaRenovacaoMensal(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white disabled:opacity-40 focus:outline-none focus:border-emerald-400"
                  >
                    {Array.from({ length: 28 }, (_, idx) => idx + 1).map((day) => (
                      <option key={day} value={day}>
                        Todo dia {day}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!creditoMensalAtivo}
                  onClick={() => setModoRenovacaoMensal('RENOVAR_TETO')}
                  className={`p-2.5 rounded-xl border text-left transition disabled:opacity-40 ${
                    modoRenovacaoMensal === 'RENOVAR_TETO'
                      ? 'bg-emerald-500/20 border-emerald-400 text-white'
                      : 'bg-slate-900/60 border-white/10 text-slate-400 hover:border-white/25'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center gap-1">
                    {modoRenovacaoMensal === 'RENOVAR_TETO' && <Check className="w-3.5 h-3.5 text-emerald-300" />}
                    Completar Teto
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                    Completa saldo até o valor mensal contratado
                  </div>
                </button>
                <button
                  type="button"
                  disabled={!creditoMensalAtivo}
                  onClick={() => setModoRenovacaoMensal('ACUMULAR')}
                  className={`p-2.5 rounded-xl border text-left transition disabled:opacity-40 ${
                    modoRenovacaoMensal === 'ACUMULAR'
                      ? 'bg-emerald-500/20 border-emerald-400 text-white'
                      : 'bg-slate-900/60 border-white/10 text-slate-400 hover:border-white/25'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center gap-1">
                    {modoRenovacaoMensal === 'ACUMULAR' && <Check className="w-3.5 h-3.5 text-emerald-300" />}
                    Acumular Mês
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                    Soma +{formatBRL(Number(valorCreditoMensal) || 0)} ao saldo restante
                  </div>
                </button>
              </div>
            </div>

            {/* Compra de Créditos com Desconto */}
            <div className="p-4 rounded-2xl bg-amber-500/[0.05] border border-amber-400/20 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-2">
                  <Percent className="w-4 h-4" /> Compra com Desconto B2B
                </h3>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permitirCompraCreditos}
                    onChange={(e) => setPermitirCompraCreditos(e.target.checked)}
                    className="w-4 h-4 rounded accent-amber-500"
                  />
                  <span className="text-xs font-medium text-white">
                    {permitirCompraCreditos ? 'Permitida' : 'Bloqueada'}
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PRESET_DISCOUNT_VALUES.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setPermitirCompraCreditos(true);
                      setDescontoCompraPercent(String(pct));
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                      permitirCompraCreditos && Number(descontoCompraPercent) === pct
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-white/10 text-slate-300 hover:bg-white/15'
                    }`}
                  >
                    {pct}% OFF
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Desconto Negociado na Compra de Pacotes (%)
                </label>
                <div className="relative">
                  <Coins className="w-4 h-4 text-amber-300 absolute left-3 top-3.5" />
                  <input
                    type="number"
                    min="0"
                    max="90"
                    step="0.5"
                    disabled={!permitirCompraCreditos}
                    value={descontoCompraPercent}
                    onChange={(e) => setDescontoCompraPercent(e.target.value)}
                    className="w-full h-11 pl-9 pr-3 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white disabled:opacity-40 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/70 border border-white/10 text-[11px] text-slate-300">
                {permitirCompraCreditos ? (
                  <>
                    Simulação: ao comprar <strong>R$ 1.000,00</strong> em vouchers pelo portal, esta empresa paga{' '}
                    <strong className="text-amber-300">{formatBRL(simulatedPay1000)}</strong> ({discountPreview}% de desconto).
                  </>
                ) : (
                  'A empresa não poderá solicitar compra extra pelo portal (apenas recargas manuais ou cota mensal).'
                )}
              </div>
            </div>
          </div>

          {/* 4. Saldo Inicial & Regras Gerais */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                {editingPartner ? 'Saldo Atual (Use Recarga)' : 'Saldo Inicial (R$)'}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={Boolean(editingPartner)}
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white disabled:opacity-50 focus:outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Validade do Saldo (opcional)
              </label>
              <input
                type="date"
                value={creditoFim}
                onChange={(e) => setCreditoFim(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Limite Qtd. Vouchers (0 = livre)</label>
              <input
                type="number"
                min="0"
                value={limiteVouchers}
                onChange={(e) => setLimiteVouchers(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          {/* 5. Endereço Colapsável */}
          <div className="rounded-2xl bg-white/[0.02] border border-white/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAddressSection(!showAddressSection)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-300 hover:bg-white/[0.03] transition"
            >
              <span className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400" /> Endereço Completo & Telefone Comercial (Opcional)
              </span>
              {showAddressSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAddressSection && (
              <div className="p-4 pt-1 border-t border-white/10 grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-3">
                  <label className="block text-[11px] text-slate-400 mb-1">CEP</label>
                  <input
                    type="text"
                    value={cep}
                    onChange={(e) => setCep(formatCep(e.target.value))}
                    placeholder="00000-000"
                    className="w-full h-10 px-3 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-6">
                  <label className="block text-[11px] text-slate-400 mb-1">Logradouro</label>
                  <input
                    type="text"
                    value={logradouro}
                    onChange={(e) => setLogradouro(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] text-slate-400 mb-1">Número</label>
                  <input
                    type="text"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-[11px] text-slate-400 mb-1">Bairro</label>
                  <input
                    type="text"
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-[11px] text-slate-400 mb-1">Cidade / Município</label>
                  <input
                    type="text"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={uf}
                    onChange={(e) => setUf(e.target.value.toUpperCase())}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">Tel. Comercial</label>
                  <input
                    type="text"
                    value={telefoneEmpresa}
                    onChange={(e) => setTelefoneEmpresa(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="h-12 px-5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-semibold transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-12 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editingPartner ? 'Salvar Alterações da Empresa' : 'Cadastrar Empresa & Gerar Acesso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
