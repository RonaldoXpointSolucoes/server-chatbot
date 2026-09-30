import React, { useState } from 'react';
import { 
  Bot, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Key, 
  MessageSquare, 
  Radio, 
  Zap, 
  ExternalLink, 
  X,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { AiDiagnosticsReport, runAiHealthCheck } from '../../services/aiHealthCheckService';

interface AiDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: AiDiagnosticsReport | null;
  tenantId: string;
  onRecheck?: (newReport: AiDiagnosticsReport) => void;
  onToggleAi?: (desiredState: boolean) => void;
  globalAiEnabled?: boolean;
}

export const AiDiagnosticsModal: React.FC<AiDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  report: initialReport,
  tenantId,
  onRecheck,
  onToggleAi,
  globalAiEnabled = true
}) => {
  const navigate = useNavigate();
  const [report, setReport] = useState<AiDiagnosticsReport | null>(initialReport);
  const [isRetesting, setIsRetesting] = useState(false);

  // Sincronizar com props quando o modal abrir
  React.useEffect(() => {
    setReport(initialReport);
  }, [initialReport]);

  if (!isOpen || !report) return null;

  const handleRunRecheck = async () => {
    if (!tenantId || isRetesting) return;
    setIsRetesting(true);
    try {
      const newReport = await runAiHealthCheck(tenantId);
      setReport(newReport);
      onRecheck?.(newReport);
    } catch (e) {
      console.error('Erro ao reexecutar diagnóstico:', e);
    } finally {
      setIsRetesting(false);
    }
  };

  const handleActionClick = (route?: string) => {
    if (route) {
      onClose();
      navigate(route);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'api_key':
        return <Key size={14} className="text-amber-500" />;
      case 'bots':
        return <Bot size={14} className="text-indigo-400" />;
      case 'channels':
        return <Radio size={14} className="text-emerald-500" />;
      case 'simulation':
        return <Zap size={14} className="text-cyan-400" />;
      default:
        return <Bot size={14} className="text-gray-400" />;
    }
  };

  const getStatusBadge = (status: 'ok' | 'warning' | 'error') => {
    switch (status) {
      case 'ok':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={11} /> 100% OK
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle size={11} /> Atenção
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
            <XCircle size={11} /> Falha Crítica
          </span>
        );
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-[#182229] border border-gray-200 dark:border-[#2a3942] rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-150 dark:border-[#2a3942]/70 bg-gray-50/80 dark:bg-[#111b21]/70">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shadow-inner shrink-0",
              report.isHealthy && !report.hasWarnings 
                ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20" 
                : report.hasErrors 
                  ? "bg-red-500/15 text-red-500 border border-red-500/20" 
                  : "bg-amber-500/15 text-amber-500 border border-amber-500/20"
            )}>
              {report.hasErrors ? <ShieldAlert size={22} /> : <ShieldCheck size={22} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                  Validação & Diagnóstico do Robô I.A
                </h3>
              </div>
              <p className="text-[12px] text-gray-500 dark:text-[#8696a0] mt-0.5">
                Verificação completa de prontidão e testes operacionais internos
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-150 dark:hover:bg-[#2a3942] transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Resumo do Status Geral */}
        <div className="px-5 py-4 border-b border-gray-150 dark:border-[#2a3942]/50 bg-gray-50/40 dark:bg-[#111b21]/30">
          <div className={cn(
            "p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm",
            report.isHealthy && !report.hasWarnings
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
              : report.hasErrors
                ? "bg-red-500/10 border-red-500/30 text-red-800 dark:text-red-300"
                : "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
          )}>
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 shrink-0">
                {report.isHealthy && !report.hasWarnings ? (
                  <CheckCircle2 className="text-emerald-500" size={18} />
                ) : report.hasErrors ? (
                  <XCircle className="text-red-500" size={18} />
                ) : (
                  <AlertTriangle className="text-amber-500" size={18} />
                )}
              </div>
              <div>
                <div className="font-semibold text-xs sm:text-sm">
                  {report.summary}
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  Pontuação de Prontidão: <span className="font-bold">{report.score}%</span> • Testado em {new Date(report.timestamp).toLocaleTimeString('pt-BR')}
                </div>
              </div>
            </div>

            <button
              onClick={handleRunRecheck}
              disabled={isRetesting}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#202c33] border border-gray-300 dark:border-[#2a3942] hover:bg-gray-100 dark:hover:bg-[#2a3942] text-gray-700 dark:text-gray-200 transition shrink-0 shadow-xs disabled:opacity-60"
            >
              <RefreshCw size={13} className={cn(isRetesting && "animate-spin text-[#00a884]")} />
              <span>{isRetesting ? 'Validando...' : 'Re-testar Agora'}</span>
            </button>
          </div>
        </div>

        {/* Lista de Itens do Diagnóstico */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-[#8696a0] mb-1">
            Pilares de Funcionamento do Robô I.A
          </div>

          {report.items.map((item) => (
            <div 
              key={item.id}
              className={cn(
                "p-3.5 rounded-xl border transition-all duration-200",
                item.status === 'ok' 
                  ? "bg-white dark:bg-[#1f2c34]/50 border-gray-200 dark:border-[#2a3942]/60 hover:border-emerald-500/30" 
                  : item.status === 'error'
                    ? "bg-red-500/5 dark:bg-red-950/20 border-red-500/30 hover:border-red-500/50"
                    : "bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-[#111b21] shrink-0 mt-0.5">
                    {getCategoryIcon(item.category)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs text-gray-900 dark:text-gray-100">
                        {item.name}
                      </span>
                      {getStatusBadge(item.status)}
                      {item.latencyMs !== undefined && (
                        <span className="text-[10px] text-gray-400 font-mono">
                          {item.latencyMs}ms
                        </span>
                      )}
                    </div>
                    <p className={cn(
                      "text-xs mt-1 leading-relaxed",
                      item.status === 'error' 
                        ? "text-red-700 dark:text-red-400 font-medium" 
                        : item.status === 'warning'
                          ? "text-amber-700 dark:text-amber-400 font-medium"
                          : "text-gray-600 dark:text-gray-300"
                    )}>
                      {item.message}
                    </p>
                    {item.details && (
                      <p className="text-[11px] text-gray-500 dark:text-[#8696a0] mt-1 leading-normal">
                        {item.details}
                      </p>
                    )}
                  </div>
                </div>

                {item.actionLabel && item.actionRoute && (
                  <button
                    onClick={() => handleActionClick(item.actionRoute)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#00a884]/15 hover:bg-[#00a884]/25 text-[#00a884] dark:text-[#00a884] border border-[#00a884]/30 transition shrink-0 mt-0.5"
                  >
                    <span>{item.actionLabel}</span>
                    <ExternalLink size={10} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer com Ações */}
        <div className="p-4 border-t border-gray-150 dark:border-[#2a3942]/70 bg-gray-50/80 dark:bg-[#111b21]/70 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-gray-500 dark:text-[#8696a0] text-center sm:text-left">
            {report.hasErrors ? (
              <span className="text-red-500 font-medium">Corrija os erros apontados para que o robô possa responder clientes.</span>
            ) : report.hasWarnings ? (
              <span className="text-amber-500 font-medium">Robô pronto para responder, com avisos informativos.</span>
            ) : (
              <span className="text-emerald-500 font-medium">Tudo pronto! O robô responderá clientes automaticamente.</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {report.hasErrors && onToggleAi && (
              <button
                type="button"
                onClick={() => {
                  onToggleAi(false);
                  onClose();
                }}
                className="px-3 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#202c33] transition"
              >
                Desativar Robô por Segurança
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-semibold text-white shadow-md transition-all",
                report.hasErrors 
                  ? "bg-gray-700 hover:bg-gray-800 dark:bg-[#2a3942] dark:hover:bg-[#32424b]" 
                  : "bg-[#00a884] hover:bg-[#008f6f]"
              )}
            >
              {report.hasErrors ? 'Fechar e Corrigir' : 'Confirmar e Prosseguir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
