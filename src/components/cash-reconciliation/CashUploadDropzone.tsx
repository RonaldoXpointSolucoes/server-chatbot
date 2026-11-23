import React, { useRef, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Landmark,
  CheckCircle2,
  AlertTriangle,
  Lock,
  X,
  KeyRound,
  CreditCard,
  Loader2
} from 'lucide-react';

import { ParsedCashFileResult } from '../../types/cashReconciliation';
import { formatDateBr } from '../../utils/cashReconciliationServiceHelper.mjs';

export interface UploadedCashFileItem {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  arrayBuffer?: ArrayBuffer;
  textContent?: string;
  parsed: ParsedCashFileResult;
}

const FILE_TYPE_META: Record<string, { label: string; colorClass: string; icon: React.ReactNode }> = {
  pdv_vendas: {
    label: 'PDV Vendas (DataDivas)',
    colorClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    icon: <FileSpreadsheet size={15} />
  },
  rel_conferencia: {
    label: 'Planilha de Conferência',
    colorClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    icon: <FileSpreadsheet size={15} />
  },
  fechamento_txt: {
    label: 'Fechamento PDV (.txt)',
    colorClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    icon: <FileText size={15} />
  },
  extrato_ofx: {
    label: 'Extrato Bancário (OFX)',
    colorClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    icon: <Landmark size={15} />
  },
  extrato_generico: {
    label: 'Extrato Planilha',
    colorClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    icon: <Landmark size={15} />
  },
  adquirente_rede: {
    label: 'Maquininha Rede',
    colorClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
    icon: <CreditCard size={15} />
  },
  adquirente_c6pay: {
    label: 'Maquininha C6 Pay',
    colorClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    icon: <CreditCard size={15} />
  },
  unknown: {
    label: 'Não Reconhecido',
    colorClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    icon: <AlertTriangle size={15} />
  }
};

interface CashUploadDropzoneProps {
  files: UploadedCashFileItem[];
  isProcessing: boolean;
  savedPasswordsCount?: number;
  onAddFiles: (fileList: FileList | File[]) => void;
  onUnlockPasswordFile: (fileId: string, password: string, saveFixed?: boolean) => Promise<boolean> | void;
  onOpenPasswordModal?: (fileId: string) => void;
  onRemoveFile: (fileId: string) => void;
}

export function CashUploadDropzone({
  files,
  isProcessing,
  savedPasswordsCount = 0,
  onAddFiles,
  onUnlockPasswordFile,
  onOpenPasswordModal,
  onRemoveFile
}: CashUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [passwordMap, setPasswordMap] = useState<Record<string, string>>({});

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      onAddFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative group cursor-pointer rounded-2xl border-2 border-dashed p-5 sm:p-6 transition-all duration-200 ${
          isDragging
            ? 'border-[#00a884] bg-[#00a884]/10 scale-[1.005]'
            : 'border-slate-300/80 dark:border-[#2a3942] bg-white/80 dark:bg-[#202c33]/80 hover:border-[#00a884]/60 hover:bg-white dark:hover:bg-[#202c33]'
        } backdrop-blur-md shadow-sm`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv,.ofx,.txt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              onAddFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00a884]/20 to-emerald-500/10 border border-[#00a884]/30 flex items-center justify-center text-[#00a884] shrink-0 group-hover:scale-105 transition-transform">
              {isProcessing ? <Loader2 size={22} className="animate-spin" /> : <Upload size={22} />}
            </div>
            <div>
              <p className="text-sm sm:text-base font-bold text-slate-800 dark:text-[#e9edef]">
                Arraste ou selecione todos os arquivos de conferência do dia
              </p>
              <p className="text-xs text-slate-500 dark:text-[#8696a0] mt-0.5">
                Aceita <span className="font-semibold text-slate-700 dark:text-[#d1d7db]">.xlsx, .xls, .csv, .ofx e .txt</span> juntos — identificação automática (DataDivas, C6 Bank, Itaú, Rede, C6 Pay e RelConferencia).
              </p>
              {savedPasswordsCount > 0 && (
                <p className="inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  <KeyRound size={11} className="shrink-0" />
                  {savedPasswordsCount} senha(s) fixa(s) memorizada(s) — planilhas protegidas (ex.: C6 Pay) abrem automaticamente
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-[#00a884] hover:bg-[#008f6f] active:scale-95 text-white text-xs font-bold shadow-sm transition-all shrink-0"
          >
            Carregar Arquivos
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {files.map((item) => {
            const parsed = item.parsed || {};
            const meta = FILE_TYPE_META[parsed.fileType || 'unknown'] || FILE_TYPE_META.unknown;
            const isPwd = parsed.status === 'password_required';
            const isErr = parsed.status === 'error';

            return (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200/80 dark:border-[#2a3942] bg-white/90 dark:bg-[#202c33]/90 backdrop-blur-md p-3 shadow-sm flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold ${meta.colorClass}`}>
                        {meta.icon}
                        {meta.label}
                      </span>
                      {parsed.status === 'ok' && (
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                      )}
                      {parsed.status === 'ok' && Boolean(parsed.summary?.autoUnlocked) && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"
                          title="Planilha desbloqueada automaticamente com a senha fixa salva da empresa"
                        >
                          <KeyRound size={10} />
                          Auto-desbloqueada
                        </span>
                      )}
                      {isPwd && <Lock size={14} className="text-amber-500 shrink-0" />}
                      {isErr && <AlertTriangle size={14} className="text-rose-500 shrink-0" />}
                    </div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-[#e9edef] truncate mt-1.5" title={item.fileName}>
                      {item.fileName}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-[#8696a0] mt-0.5">
                      {parsed.status === 'ok'
                        ? `${parsed.rows?.length || 0} registro(s)${parsed.periodStart ? ` • ${formatDateBr(parsed.periodStart)}` : ''}`
                        : parsed.errorMessage || 'Aguardando leitura'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveFile(item.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                    title="Remover arquivo"
                  >
                    <X size={14} />
                  </button>
                </div>

                {parsed.warnings?.length > 0 && (
                  <p className="text-[10.5px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1">
                    {String(parsed.warnings[0]).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1')}
                  </p>
                )}

                {isPwd && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <KeyRound size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-500" />
                        <input
                          type="password"
                          value={passwordMap[item.id] || ''}
                          onChange={(e) => setPasswordMap(prev => ({ ...prev, [item.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              onUnlockPasswordFile(item.id, passwordMap[item.id] || '', true);
                            }
                          }}
                          placeholder="Digite a senha fixa do Excel..."
                          className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-amber-500/30 bg-amber-500/5 text-slate-800 dark:text-[#e9edef] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => onUnlockPasswordFile(item.id, passwordMap[item.id] || '', true)}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold active:scale-95 transition-all"
                      >
                        Abrir
                      </button>
                      {onOpenPasswordModal && (
                        <button
                          type="button"
                          onClick={() => onOpenPasswordModal(item.id)}
                          className="px-2 py-1.5 rounded-lg border border-amber-500/30 text-amber-600 dark:text-amber-300 text-[11px] font-bold hover:bg-amber-500/10 transition-colors"
                          title="Abrir tela assistida de senha"
                        >
                          Tela
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
