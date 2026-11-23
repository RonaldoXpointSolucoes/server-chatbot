import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageCircle,
  Phone,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldCheck
} from 'lucide-react';
import { normalizeBrazilWhatsappNumber } from '../../utils/cashReportExportHelper.mjs';

interface NormalizedPhoneResult {
  ok: boolean;
  digits: string;
  jid: string;
  display: string;
  error?: string;
}

export interface CashWhatsappSendModalProps {
  isOpen: boolean;
  targetLabel: string;
  initialPhone?: string;
  previewText?: string;
  isSending: boolean;
  allowEditNumber?: boolean;
  onSend: (phone: string, savePhone: boolean) => Promise<void> | void;
  onClose: () => void;
}

export function CashWhatsappSendModal({
  isOpen,
  targetLabel,
  initialPhone = '',
  previewText = '',
  isSending,
  allowEditNumber = true,
  onSend,
  onClose
}: CashWhatsappSendModalProps) {
  const [phoneInput, setPhoneInput] = useState('');
  const [savePhone, setSavePhone] = useState(true);
  const [touched, setTouched] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const wasOpenRef = useRef(false);

  const initialNorm = useMemo<NormalizedPhoneResult | null>(() => {
    const raw = String(initialPhone || '').trim();
    return raw ? (normalizeBrazilWhatsappNumber(raw) as NormalizedPhoneResult) : null;
  }, [initialPhone]);

  const isLockedNumber = !allowEditNumber && Boolean(initialNorm?.ok);
  const effectivePhoneInput = isLockedNumber ? String(initialPhone || '').trim() : phoneInput;

  const phoneValidation = useMemo<NormalizedPhoneResult>(
    () => normalizeBrazilWhatsappNumber(effectivePhoneInput) as NormalizedPhoneResult,
    [effectivePhoneInput]
  );

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!isOpen || wasOpen) return;

    const raw = String(initialPhone || '').trim();
    setPhoneInput(initialNorm?.ok ? initialNorm.display : raw);
    setSavePhone(true);
    setTouched(false);
    setShowPreview(Boolean(previewText && raw && initialNorm?.ok));
  }, [isOpen, initialPhone, initialNorm, previewText]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSending) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSending, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const hasAnyDigits = effectivePhoneInput.replace(/\D/g, '').length > 0;
  const showError = Boolean(!isLockedNumber && !phoneValidation.ok && (touched || effectivePhoneInput.replace(/\D/g, '').length >= 10));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!phoneValidation.ok || isSending) return;
    await onSend(phoneValidation.digits, savePhone);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={() => {
        if (!isSending) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cash-whatsapp-modal-title"
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] rounded-t-3xl sm:rounded-2xl border border-emerald-500/30 dark:border-[#2a3942] bg-white dark:bg-[#111b21] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-5 py-4 bg-gradient-to-r from-[#00a884]/15 via-emerald-500/5 to-transparent border-b border-slate-200 dark:border-[#2a3942] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#00a884]/15 border border-[#00a884]/30 text-[#00a884] flex items-center justify-center shrink-0">
              <MessageCircle size={19} />
            </div>
            <div className="min-w-0">
              <h3
                id="cash-whatsapp-modal-title"
                className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate"
              >
                Enviar Resumo via WhatsApp
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-[#aebac1] truncate">
                {targetLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSending}
            onClick={onClose}
            aria-label="Fechar janela"
            className="p-2 rounded-xl text-slate-500 dark:text-[#aebac1] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#202c33] active:scale-95 transition-all shrink-0"
          >
            <X size={17} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="rounded-xl border border-[#00a884]/25 bg-[#00a884]/10 px-3.5 py-2.5 text-[11px] text-slate-700 dark:text-[#d1d7db] flex items-start gap-2">
              <ShieldCheck size={15} className="text-[#00a884] shrink-0 mt-0.5" />
              <span>
                Envio automático pela caixa oficial <strong>FoodNext</strong> com resumo executivo completo (PDV × Real, PIX por banco, cartões, gaveta e alertas).
              </span>
            </div>

            <div>
              <label
                htmlFor="cash-whatsapp-phone-input"
                className="block text-xs font-bold text-slate-800 dark:text-[#e9edef] mb-1.5"
              >
                WhatsApp de destino da empresa (com DDD)
              </label>

              {isLockedNumber ? (
                <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white tabular-nums">
                    <Phone size={15} className="text-[#00a884] shrink-0" />
                    <span>{phoneValidation.display}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                    Número salvo
                  </span>
                </div>
              ) : (
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#00a884]" />
                  <input
                    id="cash-whatsapp-phone-input"
                    type="tel"
                    inputMode="tel"
                    autoFocus
                    disabled={isSending}
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    onBlur={() => {
                      setTouched(true);
                      if (phoneValidation.ok) {
                        setPhoneInput(phoneValidation.display);
                      }
                    }}
                    placeholder="Ex: (11) 99999-9999"
                    className={`w-full pl-10 pr-3.5 py-3 text-sm font-semibold rounded-xl border bg-white dark:bg-[#202c33] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
                      showError
                        ? 'border-rose-500/60 focus:ring-rose-500/30'
                        : phoneValidation.ok
                          ? 'border-emerald-500/60 focus:ring-emerald-500/30'
                          : 'border-slate-300 dark:border-[#2a3942] focus:ring-[#00a884]'
                    }`}
                  />
                </div>
              )}

              {hasAnyDigits && phoneValidation.ok && !isLockedNumber && (
                <p className="mt-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="shrink-0" />
                  Formato válido: <span className="tabular-nums">{phoneValidation.display}</span>
                </p>
              )}

              {showError && (
                <p className="mt-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>{phoneValidation.error}</span>
                </p>
              )}
            </div>

            {!isLockedNumber && (
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/80 dark:bg-[#202c33]/60 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={savePhone}
                  disabled={isSending}
                  onChange={(e) => setSavePhone(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#00a884] focus:ring-[#00a884]"
                />
                <span className="text-xs text-slate-700 dark:text-[#d1d7db] leading-snug font-medium">
                  Manter número salvo para esta empresa e não perguntar novamente
                </span>
              </label>
            )}

            {previewText.trim().length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/80 dark:bg-[#202c33]/60 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowPreview((prev) => !prev)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-bold text-slate-700 dark:text-[#e9edef] hover:bg-slate-100/80 dark:hover:bg-[#202c33] transition-colors"
                >
                  <span>Prévia do resumo que será enviado</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#008f6f] dark:text-[#00a884]">
                    {showPreview ? 'Ocultar' : 'Visualizar'}
                    {showPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </span>
                </button>

                {showPreview && (
                  <div className="px-3.5 pb-3 pt-1 border-t border-slate-200/70 dark:border-[#2a3942]">
                    <div className="max-h-48 overflow-y-auto rounded-xl bg-emerald-50/80 dark:bg-[#0b141a] border border-emerald-500/20 p-3">
                      <pre className="whitespace-pre-wrap break-words font-sans text-[11.5px] leading-relaxed text-slate-800 dark:text-[#e9edef]">
                        {previewText}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="shrink-0 px-5 py-3.5 border-t border-slate-200 dark:border-[#2a3942] bg-slate-50/90 dark:bg-[#202c33]/90 flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2">
            <button
              type="button"
              disabled={isSending}
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-[#2a3942] bg-white dark:bg-[#111b21] text-xs font-bold text-slate-700 dark:text-[#d1d7db] hover:bg-slate-100 dark:hover:bg-[#202c33] active:scale-95 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!phoneValidation.ok || isSending}
              className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] rounded-xl bg-[#00a884] hover:bg-[#008f6f] disabled:opacity-45 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all"
            >
              {isSending ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />}
              {isSending ? 'Enviando via FoodNext...' : 'Enviar Agora'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
