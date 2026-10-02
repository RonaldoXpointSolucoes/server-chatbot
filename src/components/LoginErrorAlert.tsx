import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, WifiOff, Server, HelpCircle, ChevronDown, ChevronUp, Copy, Check, ExternalLink, Activity, X } from 'lucide-react';
import { LoginErrorInfo } from '../utils/authErrorDiagnostics';

interface LoginErrorAlertProps {
  error: LoginErrorInfo | null;
  onClear?: () => void;
  onOpenDiagnostics?: () => void;
}

export default function LoginErrorAlert({ error, onClear, onOpenDiagnostics }: LoginErrorAlertProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!error) return null;

  const handleCopy = () => {
    const textToCopy = `[DIAGNÓSTICO DE ERRO]\nTítulo: ${error.title}\nCódigo: ${error.code || 'N/A'}\nCategoria: ${error.category}\nMensagem: ${error.message}\nDetalhes Técnicos: ${error.technicalDetails || 'Nenhum detalhe adicional'}\nTimestamp: ${new Date().toISOString()}`;
    
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getBadgeConfig = () => {
    switch (error.category) {
      case 'quota':
        return {
          icon: <AlertTriangle size={15} className="text-red-500 shrink-0" />,
          badgeText: 'COTA EXCEDIDA (HTTP 402)',
          badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
          borderClass: 'border-red-500/30 dark:border-red-500/40',
          bgClass: 'bg-red-50/90 dark:bg-red-950/30'
        };
      case 'server':
        return {
          icon: <Server size={15} className="text-amber-500 shrink-0" />,
          badgeText: 'INSTABILIDADE NO SERVIDOR',
          badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
          borderClass: 'border-amber-500/30 dark:border-amber-500/40',
          bgClass: 'bg-amber-50/90 dark:bg-amber-950/30'
        };
      case 'network':
        return {
          icon: <WifiOff size={15} className="text-blue-500 shrink-0" />,
          badgeText: 'FALHA DE REDE',
          badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
          borderClass: 'border-blue-500/30 dark:border-blue-500/40',
          bgClass: 'bg-blue-50/90 dark:bg-blue-950/30'
        };
      case 'credentials':
        return {
          icon: <ShieldAlert size={15} className="text-rose-500 shrink-0" />,
          badgeText: 'ACESSO NEGADO',
          badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
          borderClass: 'border-rose-500/30 dark:border-rose-500/40',
          bgClass: 'bg-rose-50/90 dark:bg-rose-950/30'
        };
      default:
        return {
          icon: <HelpCircle size={15} className="text-slate-500 shrink-0" />,
          badgeText: 'ERRO NO LOGIN',
          badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
          borderClass: 'border-slate-300 dark:border-slate-700',
          bgClass: 'bg-slate-50 dark:bg-slate-900/40'
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <div className={`w-full mt-4 p-4 rounded-2xl border backdrop-blur-md transition-all shadow-lg animate-in fade-in slide-in-from-top-2 duration-300 ${config.bgClass} ${config.borderClass}`}>
      {/* Topo do Card */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {config.icon}
          <span className={`px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-md border uppercase ${config.badgeClass}`}>
            {config.badgeText}
          </span>
          {error.code && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
              [{error.code}]
            </span>
          )}
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5 rounded transition-colors"
            title="Fechar aviso"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Título e Mensagem */}
      <div className="text-left space-y-1">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white leading-snug">
          {error.title}
        </h4>
        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
          {error.message}
        </p>
      </div>

      {/* Botão de Ação Direta (ex: Billing no Supabase) */}
      {error.actionUrl && (
        <a
          href={error.actionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white font-semibold text-xs rounded-xl shadow-md shadow-red-500/20 transition-all cursor-pointer"
        >
          <span>{error.actionLabel || 'Acessar Painel'}</span>
          <ExternalLink size={13} className="shrink-0" />
        </a>
      )}

      {/* Detalhes Técnicos Retráteis */}
      {error.technicalDetails && (
        <div className="mt-3 pt-2.5 border-t border-gray-200/60 dark:border-white/10">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1 transition-colors"
            >
              {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showDetails ? 'Ocultar Detalhes Técnicos' : 'Ver Detalhes Técnicos da API'}
            </button>

            {showDetails && (
              <button
                type="button"
                onClick={handleCopy}
                className="text-[10px] text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 flex items-center gap-1 transition-colors font-medium"
                title="Copiar relatório"
              >
                {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            )}
          </div>

          {showDetails && (
            <div className="mt-2 p-2.5 bg-black/60 dark:bg-black/80 rounded-xl font-mono text-[11px] text-[#c9d1d9] leading-relaxed break-words whitespace-pre-wrap border border-white/5 select-all">
              {error.technicalDetails}
            </div>
          )}
        </div>
      )}

      {/* Atalho para Diagnóstico dos Servidores */}
      {onOpenDiagnostics && (
        <div className="mt-2.5 pt-2 border-t border-gray-200/40 dark:border-white/5 flex items-center justify-between">
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            Dúvidas sobre qual servidor falhou?
          </span>
          <button
            type="button"
            onClick={onOpenDiagnostics}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 transition-colors underline underline-offset-2"
          >
            <Activity size={12} />
            Testar Servidores
          </button>
        </div>
      )}
    </div>
  );
}
