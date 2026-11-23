import React from 'react';
import { X, ShieldAlert, AlertTriangle, CheckCircle2, Info, Focus } from 'lucide-react';
import type { FlowHealthIssue } from '../../utils/flowBlocksCatalog.mjs';

interface FlowHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  issues: FlowHealthIssue[];
  onFocusNode?: (nodeId: string, blockId?: string) => void;
}

export default function FlowHealthModal({
  isOpen,
  onClose,
  issues,
  onFocusNode,
}: FlowHealthModalProps) {
  if (!isOpen) return null;

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const isHealthy = errorCount === 0 && warningCount === 0;

  return (
    <div className="fixed inset-0 z-[125] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-[#141418] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-zinc-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 bg-[#1a1a20] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {isHealthy ? (
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            ) : errorCount > 0 ? (
              <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
            )}
            <div>
              <h2 className="text-sm font-bold text-white">
                Auditor de Saúde & Proteção Anti-Loop
              </h2>
              <p className="text-[11px] text-zinc-400">
                {isHealthy
                  ? 'Nenhum loop infinito ou erro estrutural encontrado neste fluxo.'
                  : `${errorCount} bloqueio(s) crítico(s) e ${warningCount} alerta(s) encontrado(s).`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
          {issues.length === 0 ? (
            <div className="p-6 rounded-xl bg-emerald-950/20 border border-emerald-500/25 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <p className="text-sm font-semibold text-emerald-200">
                Fluxo 100% Saudável e Protegido contra Loops!
              </p>
              <p className="text-xs text-emerald-200/75">
                Todos os loops passam por pausa humana/espera, URLs e opções estão preenchidas e não há autoreferências perigosas.
              </p>
            </div>
          ) : (
            issues.map((issue, idx) => {
              const styles =
                issue.severity === 'error'
                  ? 'bg-red-950/25 border-red-500/35 text-red-200'
                  : issue.severity === 'warning'
                  ? 'bg-amber-950/20 border-amber-500/35 text-amber-200'
                  : 'bg-sky-950/20 border-sky-500/30 text-sky-200';
              const badge =
                issue.severity === 'error'
                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                  : issue.severity === 'warning'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-sky-500/20 text-sky-300 border-sky-500/40';

              return (
                <div key={`${issue.code}-${idx}`} className={`p-3.5 rounded-xl border ${styles} space-y-2`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${badge}`}>
                        {issue.severity === 'error' ? 'CRÍTICO' : issue.severity === 'warning' ? 'ATENÇÃO' : 'DICA'}
                      </span>
                      <code className="text-[10px] font-mono opacity-75">{issue.code}</code>
                    </div>
                    {issue.nodeId && onFocusNode && (
                      <button
                        onClick={() => {
                          onFocusNode(issue.nodeId!, issue.blockId);
                          onClose();
                        }}
                        className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Focus className="w-3 h-3" />
                        Ir para Bloco
                      </button>
                    )}
                  </div>
                  <p className="text-xs font-medium">{issue.message}</p>
                  <p className="text-[11px] opacity-85 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      <strong>Como corrigir:</strong> {issue.suggestion}
                    </span>
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-[#1a1a20] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer"
          >
            Fechar Auditoria
          </button>
        </div>
      </div>
    </div>
  );
}
