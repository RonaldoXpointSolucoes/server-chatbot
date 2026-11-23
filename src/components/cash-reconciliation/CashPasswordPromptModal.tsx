import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, KeyRound, Eye, EyeOff, CheckCircle2, X, Loader2, ShieldCheck } from 'lucide-react';
import { UploadedCashFileItem } from './CashUploadDropzone';
import { isLikelyC6PayFileName } from '../../utils/cashFilePasswordHelper.mjs';

interface CashPasswordPromptModalProps {
  file: UploadedCashFileItem | null;
  pendingCount: number;
  isProcessing: boolean;
  onUnlock: (fileId: string, password: string, saveFixed: boolean) => Promise<boolean>;
  onClose: () => void;
}

export function CashPasswordPromptModal({
  file,
  pendingCount,
  isProcessing,
  onUnlock,
  onClose
}: CashPasswordPromptModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saveFixed, setSaveFixed] = useState(true);

  useEffect(() => {
    setPassword('');
    setShowPassword(false);
    setSaveFixed(true);
  }, [file?.id]);

  useEffect(() => {
    if (!file) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [file, isProcessing, onClose]);

  if (!file || typeof document === 'undefined') return null;

  const isC6Pay = isLikelyC6PayFileName(file.fileName) || file.parsed?.fileType === 'adquirente_c6pay';
  const errMsg = file.parsed?.errorMessage;
  const showIncorrectHint = Boolean(errMsg && /incorreta|não abriu/i.test(errMsg));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isProcessing) return;
    await onUnlock(file.id, password.trim(), saveFixed);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cash-pwd-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-amber-500/35 bg-white dark:bg-[#111b21] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border-b border-slate-200 dark:border-[#2a3942] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0">
              <Lock size={18} />
            </div>
            <div className="min-w-0">
              <h3 id="cash-pwd-modal-title" className="text-sm font-black text-slate-900 dark:text-white truncate">
                Planilha Protegida por Senha
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-[#8696a0] truncate">
                Solicitado apenas nesta 1ª vez quando a senha for fixa
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#202c33] transition-colors"
            title="Fechar e informar depois"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50 dark:bg-[#202c33]/70 px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Arquivo detectado
              </span>
              {pendingCount > 1 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">
                  +{pendingCount - 1} pendente(s)
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-slate-800 dark:text-[#e9edef] break-all mt-0.5">
              {file.fileName}
            </p>
          </div>

          {isC6Pay && (
            <div className="rounded-xl border border-[#00a884]/30 bg-[#00a884]/10 px-3.5 py-2.5 text-xs text-slate-700 dark:text-[#d1d7db] space-y-1">
              <p className="font-bold text-[#00a884] flex items-center gap-1.5">
                <ShieldCheck size={14} className="shrink-0" />
                Dica padrão C6 Pay ({'Relatorio-Vendas-C6Pay_Detalhado'})
              </p>
              <p className="text-[11px] leading-relaxed">
                Por padrão, a senha são os <strong>6 primeiros dígitos do CNPJ</strong> da empresa (somente números). Você pode digitar os 6 dígitos ou colar o CNPJ completo.
              </p>
            </div>
          )}

          {showIncorrectHint && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-300">
              {errMsg}
            </div>
          )}

          <div>
            <label htmlFor="cash-excel-password-input" className="block text-[11px] font-bold text-slate-700 dark:text-[#d1d7db] mb-1.5">
              Senha da planilha
            </label>
            <div className="relative">
              <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" />
              <input
                id="cash-excel-password-input"
                type={showPassword ? 'text' : 'password'}
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isC6Pay ? 'Ex: 6 primeiros dígitos do CNPJ...' : 'Digite a senha do Excel...'}
                className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-[#2a3942] bg-white dark:bg-[#202c33] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-[#2a3942] bg-slate-50/70 dark:bg-[#202c33]/40 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveFixed}
              onChange={(e) => setSaveFixed(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-[#00a884] focus:ring-[#00a884]"
            />
            <span className="text-xs text-slate-700 dark:text-[#d1d7db] leading-snug">
              <strong className="block text-slate-900 dark:text-white">
                Salvar senha fixa para esta empresa
              </strong>
              Não perguntar novamente quando enviar novas planilhas protegidas deste relatório.
            </span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={isProcessing}
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#2a3942] text-xs font-bold text-slate-600 dark:text-[#aebac1] hover:bg-slate-100 dark:hover:bg-[#202c33] transition-colors"
            >
              Depois
            </button>
            <button
              type="submit"
              disabled={!password.trim() || isProcessing}
              className="px-4 py-2 min-h-[38px] rounded-xl bg-[#00a884] hover:bg-[#008f6f] disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {saveFixed ? 'Desbloquear e Salvar Senha' : 'Desbloquear Planilha'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
