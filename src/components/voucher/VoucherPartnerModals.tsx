import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Coins,
  Copy,
  Edit2,
  ExternalLink,
  Key,
  Loader2,
  MessageCircle,
  Percent,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wallet,
  X
} from 'lucide-react';
import {
  formatBRL,
  formatPhoneDisplay,
  isInstanceConnected,
  normalizePhoneDigits,
  parseColaboradoresCsv,
  VoucherColaborador,
  VoucherPartnerCompany,
  voucherService,
  WhatsAppInstanceLite
} from '../../services/voucherService';
import { BrlCurrencyInput } from '../ui/BrlCurrencyInput';
import { parseFormattedBrlToReais } from '../../utils/currencyInputMask.mjs';

// =============================================================================
// 1. MODAL DE COLABORADORES DA EMPRESA PARCEIRA + IMPORTAÇÃO CSV
// =============================================================================
interface PartnerCollaboratorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  partner: VoucherPartnerCompany | null;
  colaboradores: VoucherColaborador[];
  onRefresh: () => Promise<void>;
  onOpenBatchIssueForPartner: (partner: VoucherPartnerCompany) => void;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const PartnerCollaboratorsModal: React.FC<PartnerCollaboratorsModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  partner,
  colaboradores,
  onRefresh,
  onOpenBatchIssueForPartner,
  onToast
}) => {
  const [editingColabId, setEditingColabId] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cpf, setCpf] = useState('');
  const [cargo, setCargo] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const [showCsvBox, setShowCsvBox] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const partnerColabs = useMemo(
    () => (partner ? colaboradores.filter((c) => c.empresa_id === partner.id) : []),
    [colaboradores, partner]
  );

  useEffect(() => {
    if (!isOpen) {
      setEditingColabId(null);
      setNome('');
      setWhatsapp('');
      setCpf('');
      setCargo('');
      setEmail('');
      setShowCsvBox(false);
      setCsvText('');
    }
  }, [isOpen, partner?.id]);

  if (!isOpen || !partner) return null;

  const resetForm = () => {
    setEditingColabId(null);
    setNome('');
    setWhatsapp('');
    setCpf('');
    setCargo('');
    setEmail('');
  };

  const handleEdit = (c: VoucherColaborador) => {
    setEditingColabId(c.id);
    setNome(c.nome || '');
    setWhatsapp(c.whatsapp || '');
    setCpf(c.cpf || '');
    setCargo(c.cargo || '');
    setEmail(c.email || '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      onToast('error', 'Informe o nome do colaborador.');
      return;
    }
    setSaving(true);
    try {
      await voucherService.merchantSaveColaborador({
        tenantId,
        empresaId: partner.id,
        id: editingColabId,
        nome: nome.trim(),
        whatsapp: normalizePhoneDigits(whatsapp) || undefined,
        cpf: cpf.trim() || undefined,
        cargo: cargo.trim() || undefined,
        email: email.trim() || undefined,
        ativo: true
      });
      onToast('success', editingColabId ? 'Colaborador atualizado!' : 'Colaborador adicionado!');
      resetForm();
      await onRefresh();
    } catch (err: any) {
      onToast('error', err?.message || 'Erro ao salvar colaborador.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (colabId: string) => {
    setDeletingId(colabId);
    try {
      await voucherService.merchantDeleteColaborador(tenantId, colabId);
      onToast('success', 'Colaborador removido.');
      await onRefresh();
    } catch (err: any) {
      onToast('error', err?.message || 'Erro ao remover colaborador.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleImportCsv = async () => {
    const rows = parseColaboradoresCsv(csvText);
    if (rows.length === 0) {
      onToast('error', 'Nenhuma linha válida encontrada. Use formato: Nome;WhatsApp;CPF;Cargo');
      return;
    }
    setImportingCsv(true);
    let imported = 0;
    try {
      for (const row of rows) {
        await voucherService.merchantSaveColaborador({
          tenantId,
          empresaId: partner.id,
          nome: row.nome,
          whatsapp: row.whatsapp,
          cpf: row.cpf,
          cargo: row.cargo,
          email: row.email,
          ativo: true
        });
        imported++;
      }
      onToast('success', `${imported} colaborador(es) importado(s) para ${partner.nome_fantasia || partner.razao_social}!`);
      setCsvText('');
      setShowCsvBox(false);
      await onRefresh();
    } catch (err: any) {
      onToast('error', `Importação interrompida após ${imported}: ${err?.message || 'Erro desconhecido'}`);
    } finally {
      setImportingCsv(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-3xl max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-3xl bg-[#0b1526] border border-white/15 shadow-2xl overflow-hidden">
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate">
                Colaboradores • {partner.nome_fantasia || partner.razao_social}
              </h2>
              <p className="text-xs text-slate-400">
                {partnerColabs.length} cadastrado(s) • Saldo disponível: {formatBRL(partner.saldo_credito)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 shrink-0 active:scale-95"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-4 sm:p-5 pb-8 sm:pb-5 space-y-4">
          {/* Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowCsvBox(!showCsvBox)}
              className="h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center gap-2 transition"
            >
              <Upload className="w-4 h-4 text-cyan-300" />
              {showCsvBox ? 'Ocultar Importação CSV' : 'Importar Lista / CSV em Massa'}
            </button>

            {partnerColabs.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBatchIssueForPartner(partner);
                }}
                className="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-2 transition"
              >
                <Send className="w-4 h-4" />
                Emitir Vouchers em Lote p/ Colaboradores
              </button>
            )}
          </div>

          {showCsvBox && (
            <div className="p-4 rounded-2xl bg-cyan-500/[0.06] border border-cyan-400/25 space-y-3">
              <p className="text-xs text-cyan-200">
                Cole uma lista (Excel/CSV) com uma pessoa por linha: <strong>Nome;WhatsApp;CPF;Cargo</strong>
              </p>
              <textarea
                rows={4}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={'Maria Silva;11999887766;12345678900;Analista\nJoão Souza;11988776655'}
                className="w-full p-3 rounded-xl bg-slate-950/90 border border-white/15 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={importingCsv}
                  onClick={handleImportCsv}
                  className="h-10 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {importingCsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Importar Colaboradores
                </button>
              </div>
            </div>
          )}

          {/* Add / Edit Form */}
          <form onSubmit={handleSave} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" />
                {editingColabId ? 'Editando Colaborador' : 'Adicionar Novo Colaborador'}
              </span>
              {editingColabId && (
                <button type="button" onClick={resetForm} className="text-xs text-slate-400 hover:text-white">
                  Cancelar edição
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <input
                type="text"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo *"
                className="sm:col-span-4 h-11 px-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-white focus:outline-none focus:border-emerald-400"
              />
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="WhatsApp (DDD+Número)"
                className="sm:col-span-3 h-11 px-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-white focus:outline-none focus:border-emerald-400"
              />
              <input
                type="text"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                placeholder="Cargo / Setor"
                className="sm:col-span-3 h-11 px-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-white focus:outline-none focus:border-emerald-400"
              />
              <button
                type="submit"
                disabled={saving}
                className="sm:col-span-2 h-11 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {editingColabId ? 'Salvar' : 'Incluir'}
              </button>
            </div>
          </form>

          {/* List */}
          {partnerColabs.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white/[0.02] border border-dashed border-white/15 text-slate-400 text-sm">
              Nenhum colaborador cadastrado para esta empresa ainda. Adicione acima ou importe em massa via CSV.
            </div>
          ) : (
            <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              {partnerColabs.map((col) => (
                <div key={col.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-white/[0.03]">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{col.nome}</div>
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                      <span>{col.whatsapp ? formatPhoneDisplay(col.whatsapp) : 'Sem WhatsApp'}</span>
                      {col.cargo && <span>• {col.cargo}</span>}
                      {col.cpf && <span>• CPF {col.cpf}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEdit(col)}
                      className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 flex items-center justify-center"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === col.id}
                      onClick={() => handleDelete(col.id)}
                      className="w-9 h-9 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 flex items-center justify-center disabled:opacity-50"
                      title="Remover"
                    >
                      {deletingId === col.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// 2. MODAL DE RECARGA / VENDA DE CRÉDITOS COM DESCONTO B2B
// =============================================================================
interface PartnerRechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  partner: VoucherPartnerCompany | null;
  operatorName: string;
  onSuccess: () => Promise<void>;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const PartnerRechargeModal: React.FC<PartnerRechargeModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  partner,
  operatorName,
  onSuccess,
  onToast
}) => {
  const [valorCredito, setValorCredito] = useState('400');
  const [descontoPercent, setDescontoPercent] = useState('0');
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [novaValidade, setNovaValidade] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !partner) return;
    setValorCredito(partner.valor_credito_mensal > 0 ? String(partner.valor_credito_mensal) : '400');
    setDescontoPercent(String(partner.desconto_compra_percent ?? 0));
    setFormaPagamento('PIX');
    setNovaValidade(partner.credito_fim ? partner.credito_fim.slice(0, 10) : '');
    setMotivo('');
  }, [isOpen, partner]);

  if (!isOpen || !partner) return null;

  const brlCredit = Math.max(0, parseFormattedBrlToReais(valorCredito));
  const pctDiscount = Math.min(100, Math.max(0, Number(descontoPercent.replace(',', '.')) || 0));
  const netToPay = brlCredit * (1 - pctDiscount / 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (brlCredit <= 0) {
      onToast('error', 'Informe um valor de crédito maior que zero.');
      return;
    }
    setSaving(true);
    try {
      const res = await voucherService.merchantRechargeCredit({
        tenantId,
        empresaId: partner.id,
        valorCredito: brlCredit,
        descontoPercent: pctDiscount,
        formaPagamento,
        novaValidade: novaValidade ? new Date(`${novaValidade}T23:59:59-03:00`).toISOString() : null,
        motivo: motivo.trim() || `Recarga / Venda (${formaPagamento})`,
        usuarioResponsavel: operatorName
      });
      onToast('success', `Crédito adicionado! Novo saldo da empresa: ${formatBRL(res.saldo_novo)}`);
      await onSuccess();
      onClose();
    } catch (err: any) {
      onToast('error', err?.message || 'Erro ao adicionar crédito.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-3xl bg-[#0b1526] border border-white/15 shadow-2xl overflow-hidden">
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white truncate">Recarregar / Vender Créditos</h2>
              <p className="text-xs text-slate-400 truncate max-w-[260px]">
                {partner.nome_fantasia || partner.razao_social} • Atual: {formatBRL(partner.saldo_credito)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 shrink-0 active:scale-95"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-4 sm:p-5 pb-8 sm:pb-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {[200, 300, 400, 500, 1000, 2000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setValorCredito(String(v))}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  parseFormattedBrlToReais(valorCredito) === v ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-slate-300 hover:bg-white/15'
                }`}
              >
                +{formatBRL(v)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Crédito Liberado (R$)</label>
              <BrlCurrencyInput
                required
                valueText={valorCredito}
                onChangeText={(val) => setValorCredito(val)}
                className="w-full h-11 px-3.5 rounded-xl bg-slate-900 border border-white/15 text-sm font-semibold text-white focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-amber-300" /> Desconto (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={descontoPercent}
                onChange={(e) => setDescontoPercent(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-slate-900 border border-white/15 text-sm text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Forma / Origem</label>
              <select
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-400"
              >
                <option value="PIX">PIX</option>
                <option value="BOLETO">Boleto Corporativo</option>
                <option value="TRANSFERENCIA">Transferência TED/DOC</option>
                <option value="CARTAO">Cartão</option>
                <option value="BONIFICACAO">Bonificação / Convênio Mensal</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Nova Validade (opcional)</label>
              <input
                type="date"
                value={novaValidade}
                onChange={(e) => setNovaValidade(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Observação / Referência</label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Pacote mensal ou compra antecipada c/ desconto"
              className="w-full h-11 px-3.5 rounded-xl bg-slate-900 border border-white/15 text-xs text-white focus:outline-none focus:border-emerald-400"
            />
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-400/25 flex items-center justify-between">
            <div className="text-xs text-slate-300">
              <div>Crédito a entrar na empresa: <strong className="text-white">{formatBRL(brlCredit)}</strong></div>
              <div>Novo saldo após recarga: <strong className="text-emerald-300">{formatBRL((partner.saldo_credito || 0) + brlCredit)}</strong></div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Valor Líquido Cobrado</div>
              <div className="text-lg font-extrabold text-amber-300">{formatBRL(netToPay)}</div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
              Confirmar Crédito
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =============================================================================
// 3. MODAL DE CREDENCIAIS PORTAL B2B & ENVIO POR WHATSAPP
// =============================================================================
interface PartnerAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  storeName: string;
  partner: VoucherPartnerCompany | null;
  initialPlainPassword?: string | null;
  instances: WhatsAppInstanceLite[];
  defaultInstanceId?: string | null;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
  onRefresh: () => Promise<void>;
}

export const PartnerAccessModal: React.FC<PartnerAccessModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  storeName,
  partner,
  initialPlainPassword,
  instances,
  defaultInstanceId,
  onToast,
  onRefresh
}) => {
  const [plainPassword, setPlainPassword] = useState<string>('');
  const [customPassword, setCustomPassword] = useState<string>('');
  const [resetting, setResetting] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !partner) return;
    setPlainPassword(initialPlainPassword || '');
    setCustomPassword('');
    const connected = instances.filter((i) => isInstanceConnected(i.status));
    setSelectedInstanceId(
      defaultInstanceId || connected[0]?.id || instances[0]?.id || ''
    );
  }, [isOpen, partner, initialPlainPassword, instances, defaultInstanceId]);

  if (!isOpen || !partner) return null;

  const portalUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/voucher-empresa/login?empresa=${encodeURIComponent(tenantId)}&u=${encodeURIComponent(
          partner.login_usuario || ''
        )}`
      : '';

  const copyText = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      onToast('success', `${label} copiado!`);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      onToast('error', 'Não foi possível copiar para a área de transferência.');
    }
  };

  const handleResetPassword = async (useCustom: boolean) => {
    if (useCustom && customPassword.trim().length < 4) {
      onToast('error', 'Digite uma senha com pelo menos 4 caracteres.');
      return;
    }
    setResetting(true);
    try {
      const res = await voucherService.merchantResetPartnerPassword(
        tenantId,
        partner.id,
        useCustom ? customPassword.trim() : null
      );
      setPlainPassword(res.plain_password);
      setCustomPassword('');
      onToast('success', 'Nova senha gerada e protegida com criptografia!');
      await onRefresh();
    } catch (err: any) {
      onToast('error', err?.message || 'Erro ao gerar nova senha.');
    } finally {
      setResetting(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!partner.contato_whatsapp) {
      onToast('error', 'Cadastre o WhatsApp do RH/responsável na empresa antes de enviar.');
      return;
    }
    setSendingWhatsApp(true);
    try {
      await voucherService.merchantSendPartnerAccessWhatsApp({
        tenantId,
        empresaId: partner.id,
        plainPassword: plainPassword || null,
        instanceId: selectedInstanceId || null,
        portalUrl
      });
      onToast('success', 'Credenciais de acesso enviadas para o WhatsApp da empresa parceira!');
    } catch (err: any) {
      onToast('error', err?.message || 'Falha ao enviar credenciais no WhatsApp.');
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const fullInviteText = [
    `Portal B2B de Vouchers — ${storeName}`,
    `Empresa: ${partner.nome_fantasia || partner.razao_social}`,
    `Link de Acesso: ${portalUrl}`,
    `Usuário: ${partner.login_usuario || '(não definido)'}`,
    plainPassword ? `Senha: ${plainPassword}` : 'Senha: (utilize a senha informada anteriormente ou gere uma nova no painel)',
    `Saldo atual: ${formatBRL(partner.saldo_credito)}`
  ].join('\n');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-xl max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-3xl bg-[#0b1526] border border-white/15 shadow-2xl overflow-hidden">
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white truncate">Acesso Portal B2B</h2>
              <p className="text-xs text-slate-400 truncate">{partner.nome_fantasia || partner.razao_social}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 shrink-0 active:scale-95"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] p-4 sm:p-5 pb-8 sm:pb-5 space-y-4">
          {/* Segurança Info */}
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/25 flex items-start gap-2.5 text-xs text-emerald-200">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-300" />
            <span>
              As senhas são armazenadas exclusivamente com hash criptográfico (bcrypt). Gere uma nova senha abaixo se
              precisar visualizar ou reenviar para o RH da empresa.
            </span>
          </div>

          {/* Link do Portal */}
          <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-white/10 space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Link Direto do Portal</div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={portalUrl}
                className="flex-1 h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-cyan-200 font-mono"
              />
              <button
                type="button"
                onClick={() => copyText('url', portalUrl, 'Link')}
                className="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white font-semibold flex items-center gap-1.5"
              >
                {copiedKey === 'url' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                Copiar
              </button>
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-10 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-xs text-cyan-200 font-semibold flex items-center gap-1.5"
              >
                <ExternalLink className="w-4 h-4" /> Abrir
              </a>
            </div>
          </div>

          {/* Usuário & Senha */}
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-slate-400 mb-1">Usuário de Login</div>
                <div className="h-10 px-3 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between text-sm font-mono text-white">
                  <span className="truncate">{partner.login_usuario || '—'}</span>
                  {partner.login_usuario && (
                    <button
                      type="button"
                      onClick={() => copyText('user', partner.login_usuario || '', 'Usuário')}
                      className="text-slate-400 hover:text-white ml-2"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 mb-1">Senha Temporária / Recém-Gerada</div>
                <div className="h-10 px-3 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-between text-sm font-mono">
                  {plainPassword ? (
                    <>
                      <span className="text-emerald-300 font-bold">{plainPassword}</span>
                      <button
                        type="button"
                        onClick={() => copyText('pwd', plainPassword, 'Senha')}
                        className="text-emerald-300 hover:text-emerald-200 ml-2"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">
                      {partner.tem_senha_configurada ? '•••••••• (Protegida)' : 'Sem senha ainda'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                disabled={resetting}
                onClick={() => handleResetPassword(false)}
                className="h-10 px-3.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-200 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Gerar Nova Senha Automática
              </button>

              <div className="flex-1 flex gap-1.5">
                <input
                  type="text"
                  value={customPassword}
                  onChange={(e) => setCustomPassword(e.target.value)}
                  placeholder="Ou digite uma senha..."
                  className="flex-1 h-10 px-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-white"
                />
                <button
                  type="button"
                  disabled={resetting || !customPassword.trim()}
                  onClick={() => handleResetPassword(true)}
                  className="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white font-semibold disabled:opacity-40"
                >
                  Definir
                </button>
              </div>
            </div>
          </div>

          {/* Envio via WhatsApp */}
          <div className="p-4 rounded-2xl bg-emerald-500/[0.06] border border-emerald-400/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> Enviar Acesso para o WhatsApp da Empresa
              </span>
              <span className="text-xs text-slate-300">
                {partner.contato_whatsapp ? formatPhoneDisplay(partner.contato_whatsapp) : 'Sem WhatsApp cadastrado'}
              </span>
            </div>

            {instances.length > 0 ? (
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Caixa WhatsApp da Loja ({storeName})</label>
                <select
                  value={selectedInstanceId}
                  onChange={(e) => setSelectedInstanceId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-white"
                >
                  {instances.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.display_name || inst.whatsapp_name || inst.phone_number || inst.id} ({inst.status})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="text-xs text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> Nenhuma instância WhatsApp conectada nesta loja. Use &quot;Copiar Convite&quot; abaixo.
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => copyText('invite', fullInviteText, 'Convite completo')}
                className="flex-1 h-11 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-2"
              >
                {copiedKey === 'invite' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                Copiar Texto do Acesso
              </button>
              <button
                type="button"
                disabled={sendingWhatsApp || !partner.contato_whatsapp}
                onClick={handleSendWhatsApp}
                className="flex-1 h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {sendingWhatsApp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar Credenciais no WhatsApp
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
