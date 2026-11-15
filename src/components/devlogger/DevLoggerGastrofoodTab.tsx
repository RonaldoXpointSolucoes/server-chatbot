import React from 'react';
import { ChevronDown, ChevronUp, Copy, Network, Trash2 } from 'lucide-react';

interface DevLoggerGastrofoodTabProps {
  logs: any[];
  companies: any[];
  expandedLogs: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  onCopyAll: () => void;
  onClearAll: () => void;
  onCopyJson: (text: string, label: string) => void;
}

const formatDetails = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

/**
 * Monitor em tempo real de transações da API Gastrofood com resumo operacional e inspetor Request/Response.
 */
export const DevLoggerGastrofoodTab: React.FC<DevLoggerGastrofoodTabProps> = ({
  logs,
  companies,
  expandedLogs,
  onToggleExpand,
  onCopyAll,
  onClearAll,
  onCopyJson,
}) => {
  const errorCount = logs.filter((l) => l.direction === 'error').length;
  const pendingCount = logs.filter((l) => l.isPending).length;
  const successCount = logs.length - errorCount - pendingCount;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#070c10] overflow-hidden">
      {/* Barra de Resumo & Ações da Aba Gastrofood */}
      <div className="px-3 sm:px-4 py-2.5 bg-[#091017]/95 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px]">
          <span className="px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-slate-200 font-bold">
            Total: {logs.length}
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
            OK: {successCount}
          </span>
          {errorCount > 0 && (
            <span className="px-2.5 py-1 rounded-xl bg-rose-500/20 border border-rose-500/35 text-rose-300 font-black animate-pulse">
              Erros: {errorCount}
            </span>
          )}
          {pendingCount > 0 && (
            <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
              Pendentes: {pendingCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onCopyAll}
            disabled={logs.length === 0}
            className="px-3 py-1.5 min-h-[38px] rounded-xl bg-white/5 hover:bg-blue-500/20 border border-white/10 hover:border-blue-400/40 text-slate-200 hover:text-white text-[11px] font-bold font-mono transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 disabled:opacity-40"
            title="Copiar todas as transações Gastrofood formatadas"
          >
            <Copy size={13} />
            <span>Copiar</span>
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={logs.length === 0}
            className="px-3 py-1.5 min-h-[38px] rounded-xl bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-400/40 text-slate-300 hover:text-rose-200 text-[11px] font-bold font-mono transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 disabled:opacity-40"
            title="Limpar fila visual Gastrofood"
          >
            <Trash2 size={13} />
            <span>Limpar</span>
          </button>
        </div>
      </div>

      {/* Lista Rolável */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 flex flex-col gap-3 font-mono text-xs custom-scrollbar">
        {logs.length === 0 ? (
          <div className="m-auto py-10 px-6 flex flex-col items-center justify-center text-center space-y-4 select-none animate-in fade-in zoom-in-95 duration-300">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-blue-500/20 via-indigo-500/10 to-purple-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-2xl shadow-blue-500/20 relative">
              <Network size={32} className="animate-pulse text-blue-400" />
              <div className="absolute inset-0 rounded-3xl border border-blue-400/30 animate-ping pointer-events-none" />
            </div>
            <div className="space-y-1.5 max-w-sm">
              <h4 className="text-sm sm:text-base font-black text-white tracking-tight">
                Aguardando Transações Gastrofood
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Interaja com o chat ou aguarde a sincronização automática do cardápio para acompanhar chamadas Request/Response em tempo real.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {logs.map((log) => {
              const isExpanded = !!expandedLogs[log.id];
              const isPending = !!log.isPending;
              const isError = log.direction === 'error';
              const duration = log.responseTimestamp
                ? Math.max(0, new Date(log.responseTimestamp).getTime() - new Date(log.timestamp).getTime())
                : null;
              const companyName = log.tenant_id
                ? companies.find((c) => c.id === log.tenant_id)?.name || log.tenant_id
                : null;

              const payloadStr = formatDetails(log.payload);
              const resultStr = isError ? formatDetails(log.error) : formatDetails(log.response);

              return (
                <div
                  key={log.id}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isError
                      ? 'bg-gradient-to-br from-rose-950/30 via-[#0e151c] to-[#111922] border-l-4 border-l-rose-500 border-rose-500/35'
                      : isPending
                        ? 'bg-gradient-to-br from-amber-950/20 via-[#0e151c] to-[#111922] border-l-4 border-l-amber-400 border-amber-500/30'
                        : 'bg-[#101921] border-l-4 border-l-emerald-400 border-white/10 hover:border-white/20'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onToggleExpand(log.id)}
                    className="w-full p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left cursor-pointer hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border shrink-0 ${
                          isError
                            ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                            : !isPending
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse'
                        }`}
                      >
                        {log.status || (isError ? 'ERROR' : isPending ? 'REQ' : 'SUCCESS')}
                      </span>
                      {log.method && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[9px] font-black shrink-0">
                          {log.method}
                        </span>
                      )}
                      <span className="font-black text-white truncate text-xs sm:text-[13px]">
                        {log.action || 'API Gastrofood'}
                      </span>
                      {companyName && (
                        <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300 text-[10px] truncate max-w-[160px]">
                          🏢 {companyName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 text-[11px] text-slate-400 shrink-0">
                      {duration !== null && (
                        <span className="text-amber-300 font-bold bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-md text-[10px]">
                          ⚡ {duration}ms
                        </span>
                      )}
                      <span className="bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                        {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                      <span className="p-1 rounded-lg bg-white/5 text-slate-300">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3.5 pb-3.5 pt-2 border-t border-white/10 space-y-2.5 bg-black/25 animate-in fade-in duration-150">
                      {log.url && (
                        <div className="text-[11px] text-slate-300 bg-[#060b10] border border-white/10 rounded-xl px-3 py-2 break-all">
                          <span className="text-slate-400 font-bold mr-1.5">URL:</span>
                          {log.url}
                        </div>
                      )}

                      {payloadStr && (
                        <div className="rounded-xl overflow-hidden border border-white/10 bg-[#04080c]">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] border-b border-white/10">
                            <span className="text-[10px] font-black uppercase text-indigo-300">Payload (Request)</span>
                            <button
                              type="button"
                              onClick={() => onCopyJson(payloadStr, 'Payload Gastrofood copiado!')}
                              className="px-2 py-1 rounded-lg bg-white/5 hover:bg-indigo-500/25 text-slate-300 hover:text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer active:scale-95"
                            >
                              <Copy size={11} /> Copiar
                            </button>
                          </div>
                          <pre className="p-3 text-[11px] text-indigo-200 overflow-x-auto max-h-44 custom-scrollbar leading-relaxed">
                            {payloadStr}
                          </pre>
                        </div>
                      )}

                      {resultStr && (
                        <div className={`rounded-xl overflow-hidden border bg-[#04080c] ${isError ? 'border-rose-500/30' : 'border-emerald-500/25'}`}>
                          <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] border-b border-white/10">
                            <span className={`text-[10px] font-black uppercase ${isError ? 'text-rose-300' : 'text-emerald-300'}`}>
                              {isError ? 'Erro / Resposta com Falha' : 'Dados Recebidos (Response)'}
                            </span>
                            <button
                              type="button"
                              onClick={() => onCopyJson(resultStr, 'Resposta Gastrofood copiada!')}
                              className="px-2 py-1 rounded-lg bg-white/5 hover:bg-emerald-500/25 text-slate-300 hover:text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer active:scale-95"
                            >
                              <Copy size={11} /> Copiar
                            </button>
                          </div>
                          <pre className={`p-3 text-[11px] overflow-x-auto max-h-52 custom-scrollbar leading-relaxed ${isError ? 'text-rose-200' : 'text-cyan-200'}`}>
                            {resultStr}
                          </pre>
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
  );
};
