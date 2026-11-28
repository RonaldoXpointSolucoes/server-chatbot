import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  History,
  MessageCircle,
  Paperclip,
  PlusCircle,
  Receipt,
  RotateCcw,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  X
} from 'lucide-react';
import {
  CashAgendaAttachment,
  CashAgendaItemKind,
  CashPendingAgendaItem,
  CashReconciliationItem,
  formatCents
} from '../../types/cashReconciliation';
import {
  addCashAgendaNote,
  addDaysToIsoDate,
  createCashAgendaItem,
  evaluateAgendaNotifications,
  getTodayLocalIsoDate,
  reopenCashAgendaItem,
  rescheduleCashAgendaItem,
  settleCashAgendaItem
} from '../../utils/cashPendingAgendaHelper.mjs';
import { formatDateBr } from '../../utils/cashReconciliationServiceHelper.mjs';
import { BrlCurrencyInput } from '../ui/BrlCurrencyInput';

export interface CashAgendaInitialDraft {
  kind: CashAgendaItemKind;
  amountCents: number;
  originDate: string;
  dueDate?: string;
  title: string;
  description: string;
  customerOrSupplier?: string;
  operatorName?: string;
  sourceSessionId?: string | null;
  sourceItemId?: string | null;
  sourceCategory?: string;
}

export interface SettleAgendaExtraOptions {
  linkBankItemId?: string | null;
  addDrawerJustification?: boolean;
}

interface CashPendingAgendaModalProps {
  isOpen: boolean;
  tenantId: string;
  items: CashPendingAgendaItem[];
  initialDraft?: CashAgendaInitialDraft | null;
  initialFocusItemId?: string | null;
  initialQuickSettle?: boolean;
  currentReferenceDate?: string;
  currentSessionId?: string | null;
  extraInBank?: CashReconciliationItem[];
  onSaveAgendaItems: (nextItems: CashPendingAgendaItem[]) => Promise<void> | void;
  onAfterCreateFromSale?: (opts: {
    sourceItemId: string;
    mode: 'move_to_pending' | 'keep_missing';
    agendaItem: CashPendingAgendaItem;
  }) => void;
  onAfterSettleItem?: (
    settledItem: CashPendingAgendaItem,
    extraOpts: SettleAgendaExtraOptions
  ) => void;
  onClose: () => void;
}

type AgendaFilterTab = 'waiting' | 'urgent' | 'resolved' | 'all';
type AgendaKindFilter = 'all' | 'payment_awaiting' | 'missing_receipt';

async function compressAttachmentFile(file: File): Promise<CashAgendaAttachment | null> {
  const nowIso = new Date().toISOString();
  const isImage = file.type.startsWith('image/');
  if (isImage) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 960;
          const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * ratio));
          const h = Math.max(1, Math.round(img.height * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(String(reader.result || ''));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = () => resolve(String(reader.result || ''));
        img.src = String(reader.result || '');
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    return {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      fileName: file.name,
      mimeType: 'image/jpeg',
      dataUrl,
      uploadedAt: nowIso
    };
  }

  if (file.size > 350 * 1024) {
    return null;
  }
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    dataUrl: rawUrl,
    uploadedAt: nowIso
  };
}

export function CashPendingAgendaModal({
  isOpen,
  tenantId,
  items,
  initialDraft = null,
  initialFocusItemId = null,
  initialQuickSettle = false,
  currentReferenceDate = '',
  currentSessionId = null,
  extraInBank = [],
  onSaveAgendaItems,
  onAfterCreateFromSale,
  onAfterSettleItem,
  onClose
}: CashPendingAgendaModalProps) {
  const todayIso = getTodayLocalIsoDate();
  const summary = useMemo(() => evaluateAgendaNotifications(items, todayIso), [items, todayIso]);

  const [filterTab, setFilterTab] = useState<AgendaFilterTab>('waiting');
  const [kindFilter, setKindFilter] = useState<AgendaKindFilter>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Campos de Criação
  const [formKind, setFormKind] = useState<CashAgendaItemKind>('payment_awaiting');
  const [formAmountCents, setFormAmountCents] = useState<number | null>(null);
  const [formOriginDate, setFormOriginDate] = useState(todayIso);
  const [formDueDate, setFormDueDate] = useState(addDaysToIsoDate(todayIso, 1));
  const [formTitle, setFormTitle] = useState('');
  const [formCustomer, setFormCustomer] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formOperator, setFormOperator] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAttachments, setFormAttachments] = useState<CashAgendaAttachment[]>([]);
  const [saleMode, setSaleMode] = useState<'move_to_pending' | 'keep_missing'>('move_to_pending');
  const [formError, setFormError] = useState('');

  // Estados por card (Baixa / Reagendamento / Timeline)
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [settleDate, setSettleDate] = useState(todayIso);
  const [settleMethod, setSettleMethod] = useState<
    'pix' | 'cartao' | 'dinheiro' | 'transferencia' | 'nota_fiscal' | 'outros'
  >('pix');
  const [settleDocNum, setSettleDocNum] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [settleAttachments, setSettleAttachments] = useState<CashAgendaAttachment[]>([]);
  const [settleLinkBankId, setSettleLinkBankId] = useState<string>('');
  const [settleAddDrawerAdj, setSettleAddDrawerAdj] = useState(true);

  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(addDaysToIsoDate(todayIso, 1));
  const [rescheduleNote, setRescheduleNote] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<CashAgendaAttachment | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported'
  );

  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    if (initialDraft) {
      setShowCreateForm(true);
      setFormKind(initialDraft.kind);
      setFormAmountCents(initialDraft.amountCents > 0 ? initialDraft.amountCents : null);
      const orig = initialDraft.originDate || currentReferenceDate || todayIso;
      setFormOriginDate(orig);
      setFormDueDate(initialDraft.dueDate || addDaysToIsoDate(orig, 1));
      setFormTitle(initialDraft.title || '');
      setFormCustomer(initialDraft.customerOrSupplier || '');
      setFormPhone('');
      setFormOperator(initialDraft.operatorName || '');
      setFormDescription(initialDraft.description || '');
      setFormAttachments([]);
      setSaleMode('move_to_pending');
      setSettlingId(null);
      setRescheduleId(null);
    } else {
      setShowCreateForm(false);
      if (initialFocusItemId) {
        const target = items.find((it) => it.id === initialFocusItemId);
        if (target) {
          setFilterTab(target.status === 'resolved' ? 'resolved' : 'waiting');
          if (initialQuickSettle && target.status === 'waiting') {
            setSettlingId(target.id);
            setSettleDate(todayIso);
            setSettleMethod(target.kind === 'missing_receipt' ? 'nota_fiscal' : 'pix');
            setSettleDocNum('');
            setSettleNotes('');
            setSettleAttachments([]);
            setSettleAddDrawerAdj(target.kind === 'missing_receipt');
            setExpandedHistoryId(target.id);
          } else {
            setExpandedHistoryId(target.id);
          }
        }
      }
    }
  }, [isOpen, initialDraft, initialFocusItemId, initialQuickSettle, currentReferenceDate, todayIso, items]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewAttachment) setPreviewAttachment(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, previewAttachment]);

  const visibleItems = useMemo(() => {
    const pool =
      filterTab === 'waiting'
        ? summary.waitingItems
        : filterTab === 'urgent'
          ? [...summary.overdueItems, ...summary.dueTodayItems]
          : filterTab === 'resolved'
            ? summary.resolvedItems
            : [...summary.waitingItems, ...summary.resolvedItems];

    return pool.filter((it: CashPendingAgendaItem) =>
      kindFilter === 'all' ? true : it.kind === kindFilter
    ) as CashPendingAgendaItem[];
  }, [filterTab, kindFilter, summary]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleRequestBrowserNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await window.Notification.requestPermission();
      setNotifPermission(perm);
      if (perm === 'granted' && summary.overdueCount + summary.dueTodayCount > 0) {
        new window.Notification('ChatBoot • Agenda Financeira', {
          body: `${summary.overdueCount + summary.dueTodayCount} pendência(s) aguardando resolução (${formatCents(
            summary.totalOverdueOrTodayCents
          )}).`
        });
      }
    } catch {
      // silencioso se bloqueado
    }
  };

  const handleCreateSubmit = async () => {
    const amt = Math.round(Number(formAmountCents || 0));
    if (amt <= 0) {
      setFormError('Informe um valor válido maior que R$ 0,00.');
      return;
    }
    if (!formTitle.trim()) {
      setFormError('Informe um título ou referência (ex.: MESA 002 ou Compra Mercado).');
      return;
    }
    const created = createCashAgendaItem({
      tenantId,
      kind: formKind,
      amountCents: amt,
      originDate: formOriginDate || todayIso,
      dueDate: formDueDate || addDaysToIsoDate(todayIso, 1),
      title: formTitle.trim(),
      description: formDescription.trim(),
      customerOrSupplier: formCustomer.trim(),
      contactPhone: formPhone,
      operatorName: formOperator.trim(),
      sourceSessionId: initialDraft?.sourceSessionId ?? currentSessionId ?? null,
      sourceItemId: initialDraft?.sourceItemId ?? null,
      sourceCategory: initialDraft?.sourceCategory,
      attachments: formAttachments
    }) as CashPendingAgendaItem;

    await onSaveAgendaItems([created, ...items]);

    if (initialDraft?.sourceItemId && onAfterCreateFromSale) {
      onAfterCreateFromSale({
        sourceItemId: initialDraft.sourceItemId,
        mode: saleMode,
        agendaItem: created
      });
    }

    setShowCreateForm(false);
    setFilterTab('waiting');
    setFormError('');
  };

  const handleConfirmSettle = async (target: CashPendingAgendaItem) => {
    const settled = settleCashAgendaItem(target, {
      resolvedDate: settleDate || todayIso,
      resolvedMethod: settleMethod,
      resolvedSessionId: currentSessionId || null,
      resolvedBankItemId: settleLinkBankId || null,
      resolvedReceiptNumber: settleDocNum.trim(),
      resolvedNotes: settleNotes.trim(),
      attachments: settleAttachments
    }) as CashPendingAgendaItem;

    const next = items.map((it) => (it.id === target.id ? settled : it));
    await onSaveAgendaItems(next);
    onAfterSettleItem?.(settled, {
      linkBankItemId: settleLinkBankId || null,
      addDrawerJustification: target.kind === 'missing_receipt' && settleAddDrawerAdj
    });
    setSettlingId(null);
  };

  const handleConfirmReschedule = async (target: CashPendingAgendaItem) => {
    const updated = rescheduleCashAgendaItem(target, {
      newDueDate: rescheduleDate || addDaysToIsoDate(todayIso, 1),
      reason: rescheduleNote.trim()
    }) as CashPendingAgendaItem;
    await onSaveAgendaItems(items.map((it) => (it.id === target.id ? updated : it)));
    setRescheduleId(null);
    setRescheduleNote('');
  };

  const handleQuickLogContact = async (target: CashPendingAgendaItem) => {
    const updated = addCashAgendaNote(target, {
      action: 'contacted',
      text: `Cobrança / contato realizado em ${formatDateBr(todayIso)}`
    }) as CashPendingAgendaItem;
    await onSaveAgendaItems(items.map((it) => (it.id === target.id ? updated : it)));
  };

  const handleReopen = async (target: CashPendingAgendaItem) => {
    const reopened = reopenCashAgendaItem(target, {
      newDueDate: addDaysToIsoDate(todayIso, 1),
      reason: 'Reaberto manualmente para acompanhamento'
    }) as CashPendingAgendaItem;
    await onSaveAgendaItems(items.map((it) => (it.id === target.id ? reopened : it)));
  };

  const handleDelete = async (target: CashPendingAgendaItem) => {
    await onSaveAgendaItems(items.filter((it) => it.id !== target.id));
  };

  const modal = (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-sm sm:p-3 lg:p-5 flex items-end sm:items-stretch justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Agenda Financeira de Pendências e Notas Fiscais"
    >
      <div
        className="w-full max-w-5xl h-[94vh] sm:h-full rounded-t-[28px] sm:rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#0b141a] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33] px-4 sm:px-6 pt-4 pb-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                  summary.urgency === 'urgent'
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-300 animate-pulse'
                    : 'bg-[#00a884]/15 border-[#00a884]/35 text-[#00a884]'
                }`}
              >
                <CalendarClock size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    Agenda Financeira — Clientes em Espera & Notas Pendentes
                  </h3>
                  {summary.openCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs font-black tabular-nums">
                      {summary.openCount} em espera • {formatCents(summary.totalWaitingCents)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                  Documente falhas de pagamento ou notas fiscais ausentes, agende cobrança/lembrete entre dias e dê baixa assim que for resolvido.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {notifPermission !== 'unsupported' && notifPermission !== 'granted' && (
                <button
                  type="button"
                  onClick={handleRequestBrowserNotifications}
                  className="px-3 py-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1.5"
                >
                  <Bell size={13} /> Ativar Aviso Navegador
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm((v) => !v);
                  if (!showCreateForm) {
                    setFormKind('payment_awaiting');
                    setFormAmountCents(null);
                    setFormOriginDate(currentReferenceDate || todayIso);
                    setFormDueDate(addDaysToIsoDate(currentReferenceDate || todayIso, 1));
                    setFormTitle('');
                    setFormCustomer('');
                    setFormPhone('');
                    setFormOperator('');
                    setFormDescription('');
                    setFormAttachments([]);
                    setFormError('');
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
              >
                <PlusCircle size={14} /> {showCreateForm ? 'Voltar p/ Lista' : 'Nova Pendência'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-700 dark:text-[#e9edef] flex items-center gap-1"
              >
                <X size={14} /> Fechar
              </button>
            </div>
          </div>

          {!showCreateForm && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { k: 'waiting' as AgendaFilterTab, label: `Em Espera (${summary.openCount})` },
                  { k: 'urgent' as AgendaFilterTab, label: `Vencidas / Hoje (${summary.overdueCount + summary.dueTodayCount})` },
                  { k: 'resolved' as AgendaFilterTab, label: `Resolvidas (${summary.resolvedCount})` },
                  { k: 'all' as AgendaFilterTab, label: `Todas (${summary.openCount + summary.resolvedCount})` }
                ].map((t) => (
                  <button
                    key={t.k}
                    type="button"
                    onClick={() => setFilterTab(t.k)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      filterTab === t.k
                        ? 'bg-[#00a884] text-white shadow-sm'
                        : 'bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1] hover:border-[#00a884]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {[
                  { k: 'all' as AgendaKindFilter, label: 'Todos os Tipos' },
                  { k: 'payment_awaiting' as AgendaKindFilter, label: 'Clientes / Recebimento' },
                  { k: 'missing_receipt' as AgendaKindFilter, label: 'Notas / Cupons Fiscais' }
                ].map((kf) => (
                  <button
                    key={kf.k}
                    type="button"
                    onClick={() => setKindFilter(kf.k)}
                    className={`px-2.5 py-1 rounded-lg border font-bold ${
                      kindFilter === kf.k
                        ? 'border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-slate-500 dark:text-[#8696a0]'
                    }`}
                  >
                    {kf.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {showCreateForm ? (
            <div className="max-w-3xl mx-auto rounded-2xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/75 p-4 sm:p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  Documentar Pendência para Resolução em Outro Dia
                </h4>
                <span className="text-[11px] text-slate-500 dark:text-[#8696a0]">
                  Notificará até ser marcada como resolvida
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setFormKind('payment_awaiting')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    formKind === 'payment_awaiting'
                      ? 'border-rose-500 bg-rose-500/10 text-rose-800 dark:text-rose-200'
                      : 'border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-slate-600 dark:text-[#aebac1]'
                  }`}
                >
                  <p className="font-black flex items-center gap-1.5">
                    <UserX size={14} /> Cliente em Espera (Não Pago / Falha)
                  </p>
                  <p className="text-[10.5px] opacity-80 mt-0.5">
                    Ex.: R$ 72,00 deu falha no cartão/PIX — agendar p/ cobrar e baixar quando o cliente pagar.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormKind('missing_receipt')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    formKind === 'missing_receipt'
                      ? 'border-orange-500 bg-orange-500/10 text-orange-800 dark:text-orange-200'
                      : 'border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-slate-600 dark:text-[#aebac1]'
                  }`}
                >
                  <p className="font-black flex items-center gap-1.5">
                    <Receipt size={14} /> Nota / Cupom Fiscal Pendente (Gaveta)
                  </p>
                  <p className="text-[10.5px] opacity-80 mt-0.5">
                    Ex.: Falta de dinheiro na gaveta de compra feita sem cupom fiscal para registrar depois.
                  </p>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[10.5px] font-black uppercase text-slate-500 mb-1">
                    Referência / Identificação *
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder={
                      formKind === 'missing_receipt'
                        ? 'Ex.: Falta na gaveta — Compra insumos sem cupom'
                        : 'Ex.: MESA 002 • DEBITO (Falha pagamento)'
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#00a884]"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-black uppercase text-slate-500 mb-1">
                    Valor (R$) *
                  </label>
                  <BrlCurrencyInput
                    valueCents={formAmountCents}
                    onChangeCents={(c) => setFormAmountCents(c)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-sm font-black text-rose-600 dark:text-rose-400 focus:outline-none focus:border-[#00a884]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10.5px] font-black uppercase text-slate-500 mb-1">
                    {formKind === 'missing_receipt' ? 'Fornecedor / Quem comprou' : 'Nome do Cliente'}
                  </label>
                  <input
                    type="text"
                    value={formCustomer}
                    onChange={(e) => setFormCustomer(e.target.value)}
                    placeholder={formKind === 'missing_receipt' ? 'Ex.: Mercado / Motoboy' : 'Ex.: Carlos Mesa 02'}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-black uppercase text-slate-500 mb-1">
                    WhatsApp / Telefone (opcional)
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="11999998888"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-black uppercase text-slate-500 mb-1">
                    Operador / Responsável
                  </label>
                  <input
                    type="text"
                    value={formOperator}
                    onChange={(e) => setFormOperator(e.target.value)}
                    placeholder="Ex.: Julinha Gerente"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10.5px] font-black uppercase text-slate-500 mb-1">
                    Data do Caixa de Origem
                  </label>
                  <input
                    type="date"
                    value={formOriginDate}
                    onChange={(e) => setFormOriginDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-black uppercase text-slate-500 mb-1">
                    Notificar / Cobrar em (Agenda)
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <input
                      type="date"
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                      className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border border-amber-500/40 bg-white dark:bg-[#111b21] text-xs font-bold text-slate-900 dark:text-white"
                    />
                    {[
                      { label: 'Hoje', days: 0 },
                      { label: 'Amanhã', days: 1 },
                      { label: '+3d', days: 3 },
                      { label: '+7d', days: 7 }
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setFormDueDate(addDaysToIsoDate(todayIso, opt.days))}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] hover:border-[#00a884] text-[10.5px] font-bold"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10.5px] font-black uppercase text-slate-500 mb-1">
                  Documentação / Motivo Detalhado
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={
                    formKind === 'missing_receipt'
                      ? 'Descreva o que foi comprado em dinheiro e quem ficou de trazer a nota/cupom fiscal...'
                      : 'Descreva o motivo da falha no pagamento, o combinado com o cliente e como ele vai pagar...'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#00a884]"
                />
              </div>

              {/* Comportamento no Caixa atual se veio de uma venda PDV s/ recebimento */}
              {initialDraft?.sourceItemId && (
                <div className="rounded-xl border border-cyan-500/35 bg-cyan-500/10 p-3 space-y-2">
                  <p className="font-black text-cyan-800 dark:text-cyan-200">
                    Como deseja tratar esta venda ({formatCents(formAmountCents || 0)}) no fechamento de{' '}
                    {formatDateBr(formOriginDate)}?
                  </p>
                  <div className="space-y-1.5">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={saleMode === 'move_to_pending'}
                        onChange={() => setSaleMode('move_to_pending')}
                        className="mt-0.5 accent-[#00a884]"
                      />
                      <span>
                        <strong>Mover p/ Nota Pendente (Em Espera) neste caixa</strong> — remove a falta do
                        Cartão/PIX na conferência do dia e documenta na Agenda até o pagamento real.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={saleMode === 'keep_missing'}
                        onChange={() => setSaleMode('keep_missing')}
                        className="mt-0.5 accent-[#00a884]"
                      />
                      <span>
                        <strong>Manter como Falta no Cartão/PIX deste caixa</strong> — preserva a falta neste fechamento e apenas cria o lembrete na Agenda.
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Anexar print/foto opcional */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <label className="px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-[#3b4a54] bg-white dark:bg-[#111b21] hover:border-[#00a884] cursor-pointer text-[11px] font-bold inline-flex items-center gap-1.5">
                  <Upload size={13} className="text-[#00a884]" />
                  Anexar Print / Cupom / Comprovante ({formAttachments.length})
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const filesList = Array.from(e.target.files || []);
                      const converted = (await Promise.all(filesList.map(compressAttachmentFile))).filter(
                        Boolean
                      ) as CashAgendaAttachment[];
                      setFormAttachments((prev) => [...prev, ...converted]);
                      e.target.value = '';
                    }}
                  />
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] text-xs font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateSubmit}
                    className="px-4 py-2 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white text-xs font-black flex items-center gap-1.5"
                  >
                    <CheckCircle2 size={14} /> Salvar na Agenda & Notificar
                  </button>
                </div>
              </div>

              {formAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formAttachments.map((att) => (
                    <span
                      key={att.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] text-[11px]"
                    >
                      <Paperclip size={11} /> {att.fileName}
                    </span>
                  ))}
                </div>
              )}

              {formError && <p className="text-rose-500 font-bold">{formError}</p>}
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 size={34} className="mx-auto text-emerald-500" />
              <p className="text-sm font-black text-slate-800 dark:text-white">
                Nenhuma pendência nesta visualização!
              </p>
              <p className="text-xs text-slate-500 dark:text-[#8696a0]">
                Quando houver falha no pagamento de cliente ou falta em gaveta aguardando nota fiscal, clique em &quot;Em Espera&quot; ou &quot;Nova Pendência&quot;.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleItems.map((item) => {
                const isWaiting = item.status === 'waiting';
                const isOverdue = isWaiting && item.dueDate < todayIso;
                const isDueToday = isWaiting && item.dueDate === todayIso;
                const isSettling = settlingId === item.id;
                const isRescheduling = rescheduleId === item.id;
                const isHistOpen = expandedHistoryId === item.id;

                const matchingExtrasForToday =
                  isWaiting && item.kind === 'payment_awaiting'
                    ? (extraInBank || []).filter(
                        (e) => Math.abs(Number(e.amountCents || 0) - item.amountCents) <= 300
                      )
                    : [];

                const whatsappChargeUrl =
                  item.contactPhone && item.contactPhone.length >= 10
                    ? `https://wa.me/${item.contactPhone.startsWith('55') ? item.contactPhone : `55${item.contactPhone}`}?text=${encodeURIComponent(
                        `Olá${item.customerOrSupplier ? ` ${item.customerOrSupplier}` : ''}, tudo bem? Passando para lembrar da pendência referente ao pedido ${item.title} de ${formatDateBr(item.originDate)} no valor de ${formatCents(item.amountCents)}. Assim que realizar o pagamento, por favor nos avise para darmos baixa!`
                      )}`
                    : null;

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-4 space-y-3 text-xs transition-all ${
                      !isWaiting
                        ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                        : isOverdue
                          ? 'border-rose-500/60 bg-rose-500/[0.06]'
                          : isDueToday
                            ? 'border-amber-500/60 bg-amber-500/[0.06]'
                            : 'border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#202c33]/80'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase inline-flex items-center gap-1 ${
                              item.kind === 'missing_receipt'
                                ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {item.kind === 'missing_receipt' ? <Receipt size={11} /> : <UserX size={11} />}
                            {item.kind === 'missing_receipt' ? 'Nota / Cupom Pendente' : 'Cliente em Espera'}
                          </span>

                          {isWaiting ? (
                            isOverdue ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase animate-pulse">
                                Vencida ({formatDateBr(item.dueDate)})
                              </span>
                            ) : isDueToday ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase animate-pulse">
                                Vence Hoje ({formatDateBr(item.dueDate)})
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 text-[10px] font-bold">
                                Agendado p/ {formatDateBr(item.dueDate)}
                              </span>
                            )
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase inline-flex items-center gap-1">
                              <CheckCircle2 size={11} /> Resolvido em {formatDateBr(item.resolvedDate || '')}
                            </span>
                          )}

                          <span className="text-sm font-black text-slate-900 dark:text-white">{item.title}</span>
                          <span className="text-base font-black text-rose-600 dark:text-rose-400 tabular-nums">
                            {formatCents(item.amountCents)}
                          </span>
                        </div>

                        <p className="text-slate-700 dark:text-[#d1d7db] leading-relaxed">{item.description}</p>

                        <p className="text-[11px] text-slate-500 dark:text-[#8696a0] flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={11} /> Origem: <strong>{formatDateBr(item.originDate)}</strong>
                          </span>
                          {item.customerOrSupplier && (
                            <span className="inline-flex items-center gap-1">
                              <UserCheck size={11} /> <strong>{item.customerOrSupplier}</strong>
                            </span>
                          )}
                          {item.operatorName && <span>• Op.: {item.operatorName}</span>}
                          {item.resolvedMethod && (
                            <span className="text-emerald-700 dark:text-emerald-300 font-bold">
                              • Baixa: {item.resolvedMethod.toUpperCase()}
                              {item.resolvedReceiptNumber ? ` (Doc: ${item.resolvedReceiptNumber})` : ''}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {isWaiting ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setSettlingId(isSettling ? null : item.id);
                                setRescheduleId(null);
                                setSettleDate(currentReferenceDate || todayIso);
                                setSettleMethod(item.kind === 'missing_receipt' ? 'nota_fiscal' : 'pix');
                                setSettleDocNum('');
                                setSettleNotes('');
                                setSettleAttachments([]);
                                setSettleLinkBankId(matchingExtrasForToday[0]?.id || '');
                                setSettleAddDrawerAdj(item.kind === 'missing_receipt');
                              }}
                              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black flex items-center gap-1 shadow-sm"
                            >
                              {item.kind === 'missing_receipt' ? (
                                <>
                                  <FileCheck2 size={13} /> Registrar Nota / Cupom
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 size={13} /> Pagamento Realizado
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setRescheduleId(isRescheduling ? null : item.id);
                                setSettlingId(null);
                                setRescheduleDate(addDaysToIsoDate(todayIso, 1));
                                setRescheduleNote('');
                              }}
                              className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] hover:border-amber-500 text-[11px] font-bold flex items-center gap-1"
                            >
                              <CalendarClock size={12} /> Reagendar
                            </button>

                            {whatsappChargeUrl && (
                              <a
                                href={whatsappChargeUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => void handleQuickLogContact(item)}
                                className="px-2.5 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1"
                              >
                                <MessageCircle size={12} /> Cobrar WhatsApp <ExternalLink size={10} />
                              </a>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleReopen(item)}
                            className="px-2.5 py-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] font-bold inline-flex items-center gap-1"
                          >
                            <RotateCcw size={12} /> Reabrir
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setExpandedHistoryId(isHistOpen ? null : item.id)}
                          className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-[11px] font-semibold flex items-center gap-1"
                        >
                          <History size={12} /> Histórico ({item.history?.length || 0})
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDelete(item)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10"
                          title="Excluir da Agenda"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Formulário Inline de Quitação / Baixa */}
                    {isSettling && (
                      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/[0.06] p-3.5 space-y-3">
                        <p className="font-black text-emerald-800 dark:text-emerald-200">
                          {item.kind === 'missing_receipt'
                            ? 'Registrar Nota / Cupom Fiscal Recebido & Dar Baixa'
                            : 'Confirmar Pagamento Realizado & Quitar Pendência'}
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                              Data Real da Resolução
                            </label>
                            <input
                              type="date"
                              value={settleDate}
                              onChange={(e) => setSettleDate(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                              Forma / Meio Realizado
                            </label>
                            <select
                              value={settleMethod}
                              onChange={(e) => setSettleMethod(e.target.value as typeof settleMethod)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold"
                            >
                              {item.kind === 'missing_receipt' ? (
                                <>
                                  <option value="nota_fiscal">Nota / Cupom Fiscal</option>
                                  <option value="dinheiro">Devolução em Dinheiro na Gaveta</option>
                                  <option value="pix">Reembolso via PIX</option>
                                  <option value="outros">Outros</option>
                                </>
                              ) : (
                                <>
                                  <option value="pix">PIX</option>
                                  <option value="cartao">Cartão (Maquininha)</option>
                                  <option value="dinheiro">Dinheiro</option>
                                  <option value="transferencia">Transferência / Depósito</option>
                                  <option value="outros">Outros</option>
                                </>
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                              {item.kind === 'missing_receipt' ? 'Nº Nota / Cupom Fiscal' : 'Nº Comprovante / NSU (opc.)'}
                            </label>
                            <input
                              type="text"
                              value={settleDocNum}
                              onChange={(e) => setSettleDocNum(e.target.value)}
                              placeholder={item.kind === 'missing_receipt' ? 'Ex.: NFC-e 004821' : 'Ex.: NSU / E2E PIX'}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs"
                            />
                          </div>
                        </div>

                        {matchingExtrasForToday.length > 0 && (
                          <div className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 p-2.5 space-y-1">
                            <p className="font-bold text-cyan-800 dark:text-cyan-200 text-[11px]">
                              💡 Encontrado(s) recebimento(s) sem venda hoje com valor compatível! Vincular a quitação a ele(s):
                            </p>
                            <select
                              value={settleLinkBankId}
                              onChange={(e) => setSettleLinkBankId(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-cyan-500/40 bg-white dark:bg-[#111b21] text-xs font-semibold"
                            >
                              <option value="">Não vincular a sobra do caixa aberto</option>
                              {matchingExtrasForToday.map((ex) => (
                                <option key={ex.id} value={ex.id}>
                                  {ex.source.toUpperCase()} {ex.timeStr} • {formatCents(ex.amountCents)} — {ex.description}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {item.kind === 'missing_receipt' && currentReferenceDate && (
                          <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-[#d1d7db] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settleAddDrawerAdj}
                              onChange={(e) => setSettleAddDrawerAdj(e.target.checked)}
                              className="accent-[#00a884]"
                            />
                            Lançar automaticamente nas &quot;Justificativas de Gaveta&quot; deste caixa aberto ({formatCents(item.amountCents)})
                          </label>
                        )}

                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={settleNotes}
                            onChange={(e) => setSettleNotes(e.target.value)}
                            placeholder="Observações da baixa (ex.: Pago no Itaú / Cupom referente a insumos)..."
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs"
                          />
                          <label className="px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-[#3b4a54] bg-white dark:bg-[#111b21] cursor-pointer text-[11px] font-bold inline-flex items-center gap-1 shrink-0">
                            <Upload size={12} /> Foto/Cupom ({settleAttachments.length})
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              multiple
                              className="hidden"
                              onChange={async (e) => {
                                const list = Array.from(e.target.files || []);
                                const conv = (await Promise.all(list.map(compressAttachmentFile))).filter(
                                  Boolean
                                ) as CashAgendaAttachment[];
                                setSettleAttachments((prev) => [...prev, ...conv]);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSettlingId(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#2a3942] text-[11px] font-bold"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleConfirmSettle(item)}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black flex items-center gap-1"
                          >
                            <CheckCircle2 size={13} /> Confirmar Baixa Definitiva
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Formulário Inline de Reagendamento */}
                    {isRescheduling && (
                      <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-3 space-y-2">
                        <p className="font-bold text-amber-800 dark:text-amber-200">
                          Nova Data de Cobrança / Lembrete
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="date"
                            value={rescheduleDate}
                            onChange={(e) => setRescheduleDate(e.target.value)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold"
                          />
                          <input
                            type="text"
                            value={rescheduleNote}
                            onChange={(e) => setRescheduleNote(e.target.value)}
                            placeholder="Motivo do reagendamento (ex.: Cliente vai acertar sexta)..."
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => void handleConfirmReschedule(item)}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-black shrink-0"
                          >
                            Salvar Nova Data
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Anexos + Linha do Tempo */}
                    {(isHistOpen || (item.attachments && item.attachments.length > 0)) && (
                      <div className="pt-2 border-t border-slate-200/70 dark:border-[#2a3942] space-y-2 text-[11px]">
                        {item.attachments && item.attachments.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-500">Anexos:</span>
                            {item.attachments.map((att) => (
                              <button
                                key={att.id}
                                type="button"
                                onClick={() => setPreviewAttachment(att)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-[#111b21] border border-slate-200 dark:border-[#2a3942] hover:border-[#00a884] text-slate-700 dark:text-[#d1d7db] font-semibold"
                              >
                                <Paperclip size={11} /> {att.fileName}
                              </button>
                            ))}
                          </div>
                        )}

                        {isHistOpen && item.history && item.history.length > 0 && (
                          <div className="space-y-1 pl-2 border-l-2 border-[#00a884]/40">
                            {item.history.map((h) => (
                              <p key={h.id} className="text-slate-600 dark:text-[#aebac1]">
                                <span className="font-mono text-[10px] text-slate-400 mr-1.5">
                                  {h.at.slice(0, 10).split('-').reverse().join('/')} {h.at.slice(11, 16)}
                                </span>
                                {h.text}
                                {h.author ? ` (${h.author})` : ''}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox de Anexo */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-[10001] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            className="max-w-3xl max-h-[90vh] bg-white dark:bg-[#111b21] rounded-2xl p-3 space-y-2 overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <strong className="text-slate-900 dark:text-white">{previewAttachment.fileName}</strong>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-[#202c33] font-bold"
              >
                Fechar
              </button>
            </div>
            {previewAttachment.mimeType.startsWith('image/') ? (
              <img
                src={previewAttachment.dataUrl}
                alt={previewAttachment.fileName}
                className="max-h-[75vh] w-auto mx-auto rounded-lg"
              />
            ) : (
              <a
                href={previewAttachment.dataUrl}
                download={previewAttachment.fileName}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00a884] text-white font-bold text-xs"
              >
                Baixar Anexo ({previewAttachment.fileName})
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modal, document.body);
}
