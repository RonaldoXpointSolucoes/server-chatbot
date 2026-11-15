import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Building2,
  Calendar,
  Check,
  CheckSquare,
  Clock,
  Copy,
  ExternalLink,
  Gift,
  Key,
  Loader2,
  MessageCircle,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Ticket,
  Upload,
  User,
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
  StoreProfile,
  VoucherCampaign,
  VoucherColaborador,
  VoucherPartnerCompany,
  VoucherRecord,
  voucherService,
  WhatsAppInstanceLite
} from '../../services/voucherService';

const WEEKDAYS = [
  { id: 0, short: 'Dom' },
  { id: 1, short: 'Seg' },
  { id: 2, short: 'Ter' },
  { id: 3, short: 'Qua' },
  { id: 4, short: 'Qui' },
  { id: 5, short: 'Sex' },
  { id: 6, short: 'Sáb' }
];

const defaultValidityDate = (days = 30): string => {
  const dt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return dt.toISOString().slice(0, 10);
};

// =============================================================================
// 1. MODAL DE EMISSÃO DE VOUCHER INDIVIDUAL OU EM LOTE P/ COLABORADORES
// =============================================================================
interface IssueVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  storeName: string;
  operatorName: string;
  partners: VoucherPartnerCompany[];
  campaigns: VoucherCampaign[];
  colaboradores: VoucherColaborador[];
  instances: WhatsAppInstanceLite[];
  defaultInstanceId?: string | null;
  preselectedPartnerId?: string | null;
  preselectedMode?: 'single' | 'batch';
  onSuccess: () => Promise<void>;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const IssueVoucherModal: React.FC<IssueVoucherModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  storeName,
  operatorName,
  partners,
  campaigns,
  colaboradores,
  instances,
  defaultInstanceId,
  preselectedPartnerId,
  preselectedMode = 'single',
  onSuccess,
  onToast
}) => {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [empresaId, setEmpresaId] = useState<string>('');
  const [campanhaId, setCampanhaId] = useState<string>('');
  const [validadeDate, setValidadeDate] = useState<string>(defaultValidityDate(30));
  const [observacoes, setObservacoes] = useState<string>('');
  const [autoSendWhatsApp, setAutoSendWhatsApp] = useState<boolean>(true);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [issuing, setIssuing] = useState<boolean>(false);

  // Individual state
  const [beneficiarioNome, setBeneficiarioNome] = useState<string>('');
  const [beneficiarioWhatsapp, setBeneficiarioWhatsapp] = useState<string>('');
  const [selectedColabId, setSelectedColabId] = useState<string>('');
  const [singleValor, setSingleValor] = useState<string>('50');

  // Batch state
  const [batchUnitValor, setBatchUnitValor] = useState<string>('50');
  const [selectedColabIds, setSelectedColabIds] = useState<string[]>([]);
  const [csvRaw, setCsvRaw] = useState<string>('');
  const [batchSource, setBatchSource] = useState<'saved' | 'csv'>('saved');

  useEffect(() => {
    if (!isOpen) return;
    setMode(preselectedMode || 'single');
    const initialPartner = preselectedPartnerId || '';
    setEmpresaId(initialPartner);
    setCampanhaId('');
    setValidadeDate(defaultValidityDate(30));
    setObservacoes('');
    setBeneficiarioNome('');
    setBeneficiarioWhatsapp('');
    setSelectedColabId('');
    setSingleValor('50');
    setBatchUnitValor('50');
    setCsvRaw('');
    setBatchSource('saved');
    const connected = instances.filter((i) => isInstanceConnected(i.status));
    setSelectedInstanceId(defaultInstanceId || connected[0]?.id || instances[0]?.id || '');
    setAutoSendWhatsApp(connected.length > 0);
  }, [isOpen, preselectedPartnerId, preselectedMode, instances, defaultInstanceId]);

  const selectedPartner = useMemo(
    () => partners.find((p) => p.id === empresaId) || null,
    [partners, empresaId]
  );

  const partnerColabs = useMemo(() => {
    if (!empresaId) return colaboradores.filter((c) => c.ativo !== false);
    return colaboradores.filter((c) => c.empresa_id === empresaId && c.ativo !== false);
  }, [colaboradores, empresaId]);

  // Select all saved collaborators automatically when entering batch mode for a partner
  useEffect(() => {
    if (mode === 'batch' && empresaId) {
      setSelectedColabIds(partnerColabs.map((c) => c.id));
    } else if (!empresaId) {
      setSelectedColabIds([]);
    }
  }, [mode, empresaId, partnerColabs]);

  if (!isOpen) return null;

  const handleCampaignChange = (newCampId: string) => {
    setCampanhaId(newCampId);
    const cmp = campaigns.find((c) => c.id === newCampId);
    if (cmp) {
      if (cmp.valor_voucher > 0) {
        setSingleValor(String(cmp.valor_voucher));
        setBatchUnitValor(String(cmp.valor_voucher));
      }
      if (cmp.empresa_id && !empresaId) {
        setEmpresaId(cmp.empresa_id);
      }
      if (cmp.restaurante_instance_id) {
        setSelectedInstanceId(cmp.restaurante_instance_id);
      }
      if (cmp.validade_fim) {
        setValidadeDate(cmp.validade_fim.slice(0, 10));
      }
    }
  };

  const handlePickSingleColab = (cid: string) => {
    setSelectedColabId(cid);
    const found = partnerColabs.find((c) => c.id === cid);
    if (found) {
      setBeneficiarioNome(found.nome);
      setBeneficiarioWhatsapp(found.whatsapp || '');
    }
  };

  const toggleBatchColab = (cid: string) => {
    setSelectedColabIds((prev) => (prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid]));
  };

  const parsedCsvList = parseColaboradoresCsv(csvRaw);
  const unitVal = Math.max(0, Number((mode === 'single' ? singleValor : batchUnitValor).replace(',', '.')) || 0);

  const batchItemsPreview =
    mode === 'batch'
      ? batchSource === 'saved'
        ? partnerColabs
            .filter((c) => selectedColabIds.includes(c.id))
            .map((c) => ({
              colaborador_id: c.id,
              beneficiario_nome: c.nome,
              beneficiario_whatsapp: c.whatsapp || null,
              valor: unitVal,
              observacoes: observacoes.trim() || null
            }))
        : parsedCsvList.map((row) => ({
            colaborador_id: null,
            beneficiario_nome: row.nome,
            beneficiario_whatsapp: row.whatsapp || null,
            valor: unitVal,
            observacoes: observacoes.trim() || null
          }))
      : [
          {
            colaborador_id: selectedColabId || null,
            beneficiario_nome: beneficiarioNome.trim(),
            beneficiario_whatsapp: normalizePhoneDigits(beneficiarioWhatsapp) || null,
            valor: unitVal,
            observacoes: observacoes.trim() || null
          }
        ];

  const totalIssueValue = batchItemsPreview.reduce((acc, item) => acc + item.valor, 0);
  const hasPartnerBalanceError =
    Boolean(selectedPartner) && totalIssueValue > Number(selectedPartner?.saldo_credito || 0) + 0.001;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) {
      onToast('error', 'Selecione uma loja no topo esquerdo.');
      return;
    }
    if (unitVal <= 0) {
      onToast('error', 'O valor do voucher deve ser maior que zero.');
      return;
    }
    if (mode === 'single' && !beneficiarioNome.trim()) {
      onToast('error', 'Informe o nome do beneficiário.');
      return;
    }
    if (mode === 'batch' && batchItemsPreview.length === 0) {
      onToast('error', 'Selecione pelo menos 1 colaborador ou cole uma lista CSV válida.');
      return;
    }
    if (hasPartnerBalanceError) {
      onToast(
        'error',
        `Saldo insuficiente na empresa ${selectedPartner?.nome_fantasia || selectedPartner?.razao_social}. Disponível: ${formatBRL(
          selectedPartner?.saldo_credito
        )}`
      );
      return;
    }

    setIssuing(true);
    try {
      const validadeIso = new Date(`${validadeDate}T23:59:59-03:00`).toISOString();
      const res = await voucherService.merchantIssueVouchers({
        tenantId,
        empresaId: empresaId || null,
        campanhaId: campanhaId || null,
        items: batchItemsPreview,
        validadeFim: validadeIso,
        observacoes: observacoes.trim() || undefined,
        usuarioResponsavel: operatorName
      });

      const issued = res.vouchers || [];
      let whatsappSummary = '';

      if (autoSendWhatsApp && issued.length > 0) {
        const idsWithPhone = issued.filter((v) => normalizePhoneDigits(v.beneficiario_whatsapp).length >= 10).map((v) => v.id);
        if (idsWithPhone.length > 0) {
          try {
            const sendRes = await voucherService.merchantSendBatchWhatsApp(
              tenantId,
              idsWithPhone,
              selectedInstanceId || null
            );
            whatsappSummary = ` WhatsApp: ${sendRes.sentCount} enviado(s)${
              sendRes.failedCount > 0 ? `, ${sendRes.failedCount} na fila/falha` : ''
            }.`;
          } catch (waErr: any) {
            whatsappSummary = ` (Voucher criado, mas envio WhatsApp falhou: ${waErr?.message || 'erro'})`;
          }
        }
      }

      onToast(
        'success',
        `${issued.length} voucher(es) emitido(s) (${formatBRL(res.total_emitido)})!${whatsappSummary}`
      );
      await onSuccess();
      onClose();
    } catch (err: any) {
      onToast('error', err?.message || 'Erro ao emitir voucher(es).');
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-2xl max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-3xl bg-[#0b1526] border border-white/15 shadow-2xl overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-5 py-4 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Emitir Voucher • {storeName}</h2>
              <p className="text-xs text-slate-400">
                Emita voucher individual avulso, vinculado a empresa parceira ou em lote para colaboradores.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4 sm:p-5 pb-8 sm:pb-5 space-y-4">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-900 border border-white/10">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`h-11 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                mode === 'single' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-300 hover:text-white'
              }`}
            >
              <User className="w-4 h-4" /> Voucher Individual
            </button>
            <button
              type="button"
              onClick={() => setMode('batch')}
              className={`h-11 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                mode === 'batch' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" /> Emissão em Lote B2B
            </button>
          </div>

          {/* Partner & Campaign Link */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Origem / Empresa Parceira</label>
              <select
                value={empresaId}
                onChange={(e) => {
                  setEmpresaId(e.target.value);
                  setSelectedColabId('');
                }}
                className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-400"
              >
                <option value="">Voucher Direto da Loja (Sem Vínculo B2B)</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.ativo === false}>
                    {p.nome_fantasia || p.razao_social} — Saldo: {formatBRL(p.saldo_credito)}
                    {p.ativo === false ? ' [SUSPENSA]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Campanha (Opcional)</label>
              <select
                value={campanhaId}
                onChange={(e) => handleCampaignChange(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-400"
              >
                <option value="">Sem campanha específica</option>
                {campaigns
                  .filter((c) => c.ativo !== false)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({formatBRL(c.valor_voucher)})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {selectedPartner && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/25 flex items-center justify-between text-xs">
              <span className="text-emerald-200 flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-emerald-300" />
                Saldo disponível em <strong>{selectedPartner.nome_fantasia || selectedPartner.razao_social}</strong>:
              </span>
              <strong className="text-sm text-emerald-300">{formatBRL(selectedPartner.saldo_credito)}</strong>
            </div>
          )}

          {mode === 'single' ? (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              {selectedPartner && partnerColabs.length > 0 && (
                <div>
                  <label className="block text-[11px] font-medium text-cyan-300 mb-1">
                    Preencher de Colaborador Cadastrado (opcional)
                  </label>
                  <select
                    value={selectedColabId}
                    onChange={(e) => handlePickSingleColab(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-cyan-400/30 text-xs text-white"
                  >
                    <option value="">-- Digitar manualmente ou escolher --</option>
                    {partnerColabs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} {c.whatsapp ? `• ${formatPhoneDisplay(c.whatsapp)}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-6">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nome do Beneficiário <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={beneficiarioNome}
                    onChange={(e) => setBeneficiarioNome(e.target.value)}
                    placeholder="Ex: Maria Clara"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-900 border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-xs font-medium text-slate-300 mb-1">WhatsApp (Envio QR)</label>
                  <input
                    type="text"
                    value={beneficiarioWhatsapp}
                    onChange={(e) => setBeneficiarioWhatsapp(e.target.value)}
                    placeholder="11999998888"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-900 border border-white/15 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={singleValor}
                    onChange={(e) => setSingleValor(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-white/15 text-sm font-bold text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchSource('saved')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      batchSource === 'saved' ? 'bg-cyan-500 text-slate-950' : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    Colaboradores Salvos ({partnerColabs.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchSource('csv')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                      batchSource === 'csv' ? 'bg-cyan-500 text-slate-950' : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" /> Colar CSV / Lista Rápida
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300">Valor cada (R$):</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={batchUnitValor}
                    onChange={(e) => setBatchUnitValor(e.target.value)}
                    className="w-24 h-10 px-3 rounded-xl bg-slate-900 border border-white/15 text-sm font-bold text-white"
                  />
                </div>
              </div>

              {batchSource === 'saved' ? (
                partnerColabs.length === 0 ? (
                  <div className="p-5 rounded-xl bg-slate-900/70 border border-dashed border-white/15 text-center text-xs text-slate-400">
                    {empresaId
                      ? 'Esta empresa ainda não possui colaboradores salvos. Cadastre na aba Empresas Parceiras ou use "Colar CSV / Lista Rápida".'
                      : 'Selecione uma Empresa Parceira acima ou utilize "Colar CSV / Lista Rápida".'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{selectedColabIds.length} selecionado(s)</span>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedColabIds(partnerColabs.map((c) => c.id))}
                          className="text-emerald-300 hover:underline"
                        >
                          Selecionar todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedColabIds([])}
                          className="text-slate-400 hover:underline"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                    <div className="max-h-44 overflow-y-auto divide-y divide-white/10 rounded-xl border border-white/10 bg-slate-950/60">
                      {partnerColabs.map((c) => {
                        const checked = selectedColabIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleBatchColab(c.id)}
                            className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-white/[0.04]"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {checked ? (
                                <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-500 shrink-0" />
                              )}
                              <span className="text-xs font-medium text-white truncate">{c.nome}</span>
                            </div>
                            <span className="text-[11px] text-slate-400 shrink-0 ml-2">
                              {c.whatsapp ? formatPhoneDisplay(c.whatsapp) : 'Sem WhatsApp'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )
              ) : (
                <div>
                  <textarea
                    rows={4}
                    value={csvRaw}
                    onChange={(e) => setCsvRaw(e.target.value)}
                    placeholder={'Nome;WhatsApp\nAna Lima;11999112233\nCarlos Pedro;11988112233'}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-white/15 text-xs text-white font-mono placeholder-slate-500"
                  />
                  <div className="text-[11px] text-slate-400 mt-1">
                    {parsedCsvList.length} pessoa(s) detectada(s) na lista.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Validade, Observações e Envio WhatsApp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> Validade do Voucher
              </label>
              <input
                type="date"
                required
                value={validadeDate}
                onChange={(e) => setValidadeDate(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-slate-900 border border-white/15 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Observações / Regra Visível</label>
              <input
                type="text"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex: Válido para almoço no salão"
                className="w-full h-11 px-3.5 rounded-xl bg-slate-900 border border-white/15 text-sm text-white"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-500/[0.06] border border-emerald-400/20 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-white">
                <input
                  type="checkbox"
                  checked={autoSendWhatsApp}
                  onChange={(e) => setAutoSendWhatsApp(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                <MessageCircle className="w-4 h-4 text-emerald-400" />
                Enviar link e QR Code automaticamente no WhatsApp após emitir
              </label>
            </div>
            {autoSendWhatsApp && instances.length > 0 && (
              <select
                value={selectedInstanceId}
                onChange={(e) => setSelectedInstanceId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-white"
              >
                {instances.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    Caixa: {inst.display_name || inst.whatsapp_name || inst.phone_number || inst.id} ({inst.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          {hasPartnerBalanceError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-400/35 text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>
                Total da emissão ({formatBRL(totalIssueValue)}) excede o saldo atual da empresa (
                {formatBRL(selectedPartner?.saldo_credito)}). Recarregue os créditos ou reduza a quantidade/valor.
              </span>
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/10">
            <div className="text-xs text-slate-300">
              Total: <strong className="text-white text-sm">{batchItemsPreview.length} voucher(es)</strong> •{' '}
              <strong className="text-emerald-300 text-sm">{formatBRL(totalIssueValue)}</strong>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={issuing || hasPartnerBalanceError}
                className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold flex items-center gap-2 disabled:opacity-50"
              >
                {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {mode === 'single' ? 'Emitir Voucher' : `Emitir ${batchItemsPreview.length} Voucher(es)`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

// =============================================================================
// 2. MODAL DE CAMPANHA PROMOCIONAL OU CORPORATIVA
// =============================================================================
interface CampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  editingCampaign: VoucherCampaign | null;
  partners: VoucherPartnerCompany[];
  instances: WhatsAppInstanceLite[];
  onSaved: () => Promise<void>;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const CampaignModal: React.FC<CampaignModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  editingCampaign,
  partners,
  instances,
  onSaved,
  onToast
}) => {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valorVoucher, setValorVoucher] = useState('40');
  const [empresaId, setEmpresaId] = useState('');
  const [quantidadeTotal, setQuantidadeTotal] = useState('100');
  const [validadeFim, setValidadeFim] = useState(defaultValidityDate(60));
  const [diasPermitidos, setDiasPermitidos] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [horaInicio, setHoraInicio] = useState('00:00');
  const [horaFim, setHoraFim] = useState('23:59');
  const [instanceId, setInstanceId] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingCampaign) {
      setNome(editingCampaign.nome || '');
      setDescricao(editingCampaign.descricao || '');
      setValorVoucher(String(editingCampaign.valor_voucher ?? 40));
      setEmpresaId(editingCampaign.empresa_id || '');
      setQuantidadeTotal(String(editingCampaign.quantidade_total ?? 100));
      setValidadeFim(editingCampaign.validade_fim ? editingCampaign.validade_fim.slice(0, 10) : defaultValidityDate(60));
      setDiasPermitidos(editingCampaign.horarios_permitidos?.dias || [0, 1, 2, 3, 4, 5, 6]);
      setHoraInicio(editingCampaign.horarios_permitidos?.inicio || '00:00');
      setHoraFim(editingCampaign.horarios_permitidos?.fim || '23:59');
      setInstanceId(editingCampaign.restaurante_instance_id || '');
      setAtivo(editingCampaign.ativo !== false);
    } else {
      setNome('');
      setDescricao('');
      setValorVoucher('40');
      setEmpresaId('');
      setQuantidadeTotal('100');
      setValidadeFim(defaultValidityDate(60));
      setDiasPermitidos([0, 1, 2, 3, 4, 5, 6]);
      setHoraInicio('00:00');
      setHoraFim('23:59');
      setInstanceId('');
      setAtivo(true);
    }
  }, [isOpen, editingCampaign]);

  if (!isOpen) return null;

  const toggleDay = (d: number) => {
    setDiasPermitidos((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      onToast('error', 'Informe o nome da campanha.');
      return;
    }
    const partner = partners.find((p) => p.id === empresaId);
    setSaving(true);
    try {
      await voucherService.merchantSaveCampaign({
        tenantId,
        id: editingCampaign?.id || null,
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        valor_voucher: Math.max(0, Number(valorVoucher.replace(',', '.')) || 0),
        empresa_id: empresaId || null,
        empresa_nome: partner ? partner.nome_fantasia || partner.razao_social : null,
        quantidade_total: Math.max(1, parseInt(quantidadeTotal || '100', 10) || 100),
        validade_fim: validadeFim ? new Date(`${validadeFim}T23:59:59-03:00`).toISOString() : null,
        horarios_permitidos: {
          dias: diasPermitidos.length > 0 ? diasPermitidos : [0, 1, 2, 3, 4, 5, 6],
          inicio: horaInicio || '00:00',
          fim: horaFim || '23:59'
        },
        restaurante_instance_id: instanceId || null,
        ativo
      });
      onToast('success', editingCampaign ? 'Campanha atualizada!' : 'Campanha criada com sucesso!');
      await onSaved();
      onClose();
    } catch (err: any) {
      onToast('error', err?.message || 'Erro ao salvar campanha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-xl max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-3xl bg-[#0b1526] border border-white/15 shadow-2xl overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-5 py-4 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {editingCampaign ? 'Editar Campanha de Vouchers' : 'Nova Campanha de Vouchers'}
              </h2>
              <p className="text-xs text-slate-400">Defina regras de valor, janela horária (BRT) e parceiro vinculado.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4 sm:p-5 pb-8 sm:pb-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8">
              <label className="block text-xs font-medium text-slate-300 mb-1">Nome da Campanha *</label>
              <input
                type="text"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Almoço Executivo Corporativo"
                className="w-full h-11 px-3.5 rounded-xl bg-slate-900 border border-white/15 text-sm text-white"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-slate-300 mb-1">Valor Padrão (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={valorVoucher}
                onChange={(e) => setValorVoucher(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-slate-900 border border-white/15 text-sm font-bold text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Descrição / Regras ao Cliente</label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Válido para consumo no salão, não cumulativo com outras promoções"
              className="w-full h-11 px-3.5 rounded-xl bg-slate-900 border border-white/15 text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Empresa Vinculada</label>
              <select
                value={empresaId}
                onChange={(e) => setEmpresaId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-white"
              >
                <option value="">Qualquer / Uso Geral</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome_fantasia || p.razao_social}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Validade Fim</label>
              <input
                type="date"
                value={validadeFim}
                onChange={(e) => setValidadeFim(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Qtd. Planejada</label>
              <input
                type="number"
                min="1"
                value={quantidadeTotal}
                onChange={(e) => setQuantidadeTotal(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-white"
              />
            </div>
          </div>

          {/* Dias e Horários Permitidos (BRT) */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
            <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-300" /> Dias e Horário Permitidos para Resgate (Horário de Brasília)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => {
                const active = diasPermitidos.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleDay(day.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      active ? 'bg-amber-400 text-slate-950' : 'bg-white/10 text-slate-400'
                    }`}
                  >
                    {day.short}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Das</label>
                <input
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Até as</label>
                <input
                  type="time"
                  value={horaFim}
                  onChange={(e) => setHoraFim(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-white"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            {instances.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Instância WhatsApp Preferencial</label>
                <select
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-white"
                >
                  <option value="">Usar caixa padrão da loja</option>
                  {instances.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.display_name || i.whatsapp_name || i.phone_number}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-white pt-4">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-500"
              />
              Campanha Ativa para Resgate
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
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
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar Campanha
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =============================================================================
// 3. MODAL DETALHES / QR / WHATSAPP / CANCELAR & ESTORNAR VOUCHER
// =============================================================================
interface VoucherDetailModalProps {
  voucher: VoucherRecord | null;
  onClose: () => void;
  tenantId: string;
  storeName: string;
  operatorName: string;
  instances: WhatsAppInstanceLite[];
  defaultInstanceId?: string | null;
  onRefresh: () => Promise<void>;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const VoucherDetailModal: React.FC<VoucherDetailModalProps> = ({
  voucher,
  onClose,
  tenantId,
  storeName,
  operatorName,
  instances,
  defaultInstanceId,
  onRefresh,
  onToast
}) => {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [sendingWa, setSendingWa] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!voucher) return;
    const connected = instances.filter((i) => isInstanceConnected(i.status));
    setSelectedInstanceId(defaultInstanceId || connected[0]?.id || instances[0]?.id || '');
  }, [voucher?.id, instances, defaultInstanceId]);

  if (!voucher) return null;

  const publicUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/voucher/${voucher.public_token}` : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      onToast('success', 'Link VIP do voucher copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast('error', 'Não foi possível copiar o link.');
    }
  };

  const handleSendWhatsApp = async () => {
    setSendingWa(true);
    try {
      await voucherService.merchantSendVoucherWhatsApp(voucher.id, selectedInstanceId || null);
      onToast('success', 'Voucher enviado para o WhatsApp do beneficiário!');
      await onRefresh();
    } catch (err: any) {
      onToast('error', err?.message || 'Erro ao enviar voucher via WhatsApp.');
    } finally {
      setSendingWa(false);
    }
  };

  const handleCancelOrReactivate = async (acao: 'CANCELAR' | 'REATIVAR') => {
    setToggling(true);
    try {
      await voucherService.merchantCancelOrReactivate({
        tenantId,
        voucherId: voucher.id,
        acao,
        motivo: acao === 'CANCELAR' ? 'Cancelado pelo gestor no painel' : 'Reativado pelo gestor',
        usuarioResponsavel: operatorName
      });
      onToast(
        'success',
        acao === 'CANCELAR'
          ? voucher.empresa_id
            ? 'Voucher cancelado e crédito estornado automaticamente para a empresa parceira!'
            : 'Voucher cancelado!'
          : 'Voucher reativado com sucesso!'
      );
      await onRefresh();
      onClose();
    } catch (err: any) {
      onToast('error', err?.message || 'Operação não permitida neste status.');
    } finally {
      setToggling(false);
    }
  };

  const statusUpper = String(voucher.status || '').toUpperCase();
  const canCancel = statusUpper !== 'RESGATADO' && statusUpper !== 'CANCELADO' && statusUpper !== 'UTILIZADO';
  const canReactivate = statusUpper === 'CANCELADO';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-3xl bg-[#0b1526] border border-white/15 shadow-2xl overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-5 py-4 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{voucher.beneficiario_nome || 'Beneficiário'}</h2>
              <p className="text-xs text-slate-400">
                {voucher.empresa_razao_social || voucher.empresa_nome || storeName} • {voucher.public_token}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4 sm:p-5 pb-8 sm:pb-5 space-y-4">
          <div className="flex flex-col items-center p-5 rounded-2xl bg-white text-slate-950">
            <QRCode value={publicUrl} size={160} />
            <div className="mt-3 text-xs font-mono font-bold tracking-widest text-slate-700">
              {voucher.public_token}
            </div>
            <div className="mt-1 text-2xl font-black text-emerald-700">{formatBRL(voucher.valor)}</div>
            <div className="text-[11px] font-semibold uppercase text-slate-500 mt-0.5">
              Status: {voucher.status} • Validade:{' '}
              {voucher.validade_fim ? new Date(voucher.validade_fim).toLocaleDateString('pt-BR') : '-'}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="flex-1 h-11 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white flex items-center justify-center gap-2"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              Copiar Link VIP
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 h-11 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-xs font-semibold text-cyan-200 flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" /> Abrir Voucher VIP
            </a>
          </div>

          {/* WhatsApp Section */}
          <div className="p-3.5 rounded-2xl bg-emerald-500/[0.06] border border-emerald-400/20 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" /> Envio WhatsApp
              </span>
              <span className="text-slate-300">
                {voucher.beneficiario_whatsapp ? formatPhoneDisplay(voucher.beneficiario_whatsapp) : 'Sem telefone'}
              </span>
            </div>
            {instances.length > 0 && (
              <select
                value={selectedInstanceId}
                onChange={(e) => setSelectedInstanceId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-white/15 text-xs text-white"
              >
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.display_name || i.whatsapp_name || i.phone_number} ({i.status})
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              disabled={sendingWa || !voucher.beneficiario_whatsapp || statusUpper === 'CANCELADO'}
              onClick={handleSendWhatsApp}
              className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {sendingWa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {voucher.mensagem_envio_status === 'ENVIADO' ? 'Reenviar Voucher no WhatsApp' : 'Enviar Voucher no WhatsApp'}
            </button>
          </div>

          {/* Cancel / Reactivate */}
          {(canCancel || canReactivate) && (
            <div className="pt-2 border-t border-white/10">
              {canCancel && (
                <button
                  type="button"
                  disabled={toggling}
                  onClick={() => handleCancelOrReactivate('CANCELAR')}
                  className="w-full h-11 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                  {voucher.empresa_id
                    ? `Cancelar Voucher & Estornar ${formatBRL(voucher.valor)} para Parceira`
                    : 'Cancelar Voucher'}
                </button>
              )}
              {canReactivate && (
                <button
                  type="button"
                  disabled={toggling}
                  onClick={() => handleCancelOrReactivate('REATIVAR')}
                  className="w-full h-11 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-200 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Reativar Voucher
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// 4. MODAL DE CONFIGURAÇÕES DA LOJA (WHATSAPP PADRÃO + PIN CAIXA + LINKS)
// =============================================================================
interface VoucherSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  store: StoreProfile | null;
  instances: WhatsAppInstanceLite[];
  onSaved: () => Promise<void>;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const VoucherSettingsModal: React.FC<VoucherSettingsModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  store,
  instances,
  onSaved,
  onToast
}) => {
  const [defaultInstanceId, setDefaultInstanceId] = useState('');
  const [terminalPin, setTerminalPin] = useState('');
  const [clearPin, setClearPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningRenewals, setRunningRenewals] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDefaultInstanceId(store?.voucher_default_instance_id || '');
    setTerminalPin('');
    setClearPin(false);
  }, [isOpen, store]);

  if (!isOpen) return null;

  const scannerUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/voucher-scanner?empresa=${encodeURIComponent(tenantId)}` : '';
  const portalLoginUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/voucher-empresa/login?empresa=${encodeURIComponent(tenantId)}`
      : '';

  const copyLink = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      onToast('success', `${label} copiado!`);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      onToast('error', 'Erro ao copiar.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const pinParam = clearPin ? '' : terminalPin.trim() ? terminalPin.trim() : undefined;
      await voucherService.merchantSaveSettings(tenantId, defaultInstanceId || null, pinParam);
      onToast('success', 'Configurações de Vouchers da loja salvas!');
      await onSaved();
      onClose();
    } catch (err: any) {
      onToast('error', err?.message || 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleRunRenewals = async () => {
    setRunningRenewals(true);
    try {
      const res = await voucherService.merchantRunMonthlyRenewal(tenantId, null);
      onToast(
        res.applied_count > 0 ? 'success' : 'info',
        res.applied_count > 0
          ? `${res.applied_count} empresa(s) renovada(s) para a competência atual!`
          : 'Todas as empresas com plano mensal já estavam atualizadas nesta competência.'
      );
      await onSaved();
    } catch (err: any) {
      onToast('error', err?.message || 'Erro ao processar renovações mensais.');
    } finally {
      setRunningRenewals(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-3xl bg-[#0b1526] border border-white/15 shadow-2xl overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-5 py-4 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Configurações de Vouchers da Loja</h2>
              <p className="text-xs text-slate-400">{store?.name || 'Estabelecimento Ativo'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4 sm:p-5 pb-8 sm:pb-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4 text-emerald-400" />
              Caixa WhatsApp Padrão para Disparos do Portal B2B & Vouchers
            </label>
            <select
              value={defaultInstanceId}
              onChange={(e) => setDefaultInstanceId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-white/15 text-sm text-white"
            >
              <option value="">Seleção automática (primeira instância conectada desta loja)</option>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.display_name || i.whatsapp_name || i.phone_number || i.id} ({i.status})
                </option>
              ))}
            </select>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                PIN de Segurança do Terminal Caixa (PDV)
              </label>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  store?.has_terminal_pin
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {store?.has_terminal_pin ? 'PIN Configurado' : 'Sem PIN (exige login CRM)'}
              </span>
            </div>
            <input
              type="text"
              value={terminalPin}
              disabled={clearPin}
              onChange={(e) => setTerminalPin(e.target.value)}
              placeholder={store?.has_terminal_pin ? 'Digite novo PIN para substituir...' : 'Ex: 4829'}
              className="w-full h-11 px-3.5 rounded-xl bg-slate-900 border border-white/15 text-sm text-white disabled:opacity-40"
            />
            {store?.has_terminal_pin && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearPin}
                  onChange={(e) => setClearPin(e.target.checked)}
                  className="w-4 h-4 rounded accent-rose-500"
                />
                Remover PIN (exigir apenas usuário CRM autenticado no caixa)
              </label>
            )}
          </div>

          {/* Links Rápidos Isolados do Tenant */}
          <div className="p-4 rounded-2xl bg-cyan-500/[0.05] border border-cyan-400/20 space-y-3">
            <div className="text-xs font-bold text-cyan-300">Links Exclusivos Desta Loja (Multi-Tenant)</div>
            <div>
              <div className="text-[11px] text-slate-400 mb-1">Portal Login das Empresas Parceiras</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={portalLoginUrl}
                  className="flex-1 h-10 px-3 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-200 font-mono"
                />
                <button
                  type="button"
                  onClick={() => copyLink('portal', portalLoginUrl, 'Link do Portal B2B')}
                  className="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white font-semibold"
                >
                  {copiedKey === 'portal' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 mb-1">Terminal Scanner / Caixa PDV</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={scannerUrl}
                  className="flex-1 h-10 px-3 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-200 font-mono"
                />
                <button
                  type="button"
                  onClick={() => copyLink('scanner', scannerUrl, 'Link do Terminal Caixa')}
                  className="h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white font-semibold"
                >
                  {copiedKey === 'scanner' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-300">
              Forçar verificação manual das renovações mensais desta loja na competência atual:
            </div>
            <button
              type="button"
              disabled={runningRenewals}
              onClick={handleRunRenewals}
              className="h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              {runningRenewals ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Renovar Agora
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-semibold"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar Configurações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
