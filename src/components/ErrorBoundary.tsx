import React, { Component, ErrorInfo, ReactNode } from "react";
import { useDevStore } from "../store/devStore";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error, errorInfo });

    try {
      useDevStore.getState().addLog({
        type: 'error',
        message: `Erro de Renderização: ${error.message || String(error)}`,
        source: 'React ErrorBoundary',
        details: {
          errorName: error.name,
          errorMessage: error.message,
          errorStack: error.stack,
          componentStack: errorInfo.componentStack
        }
      });
    } catch (err) {
      console.warn("Erro ao registrar log no devStore a partir do ErrorBoundary:", err);
    }
  }

  private handleReload = () => {
    try {
      sessionStorage.removeItem('lazy_chunk_reloaded');
      sessionStorage.removeItem('lazy_chunk_reloaded_at');
    } catch {
      // ignore storage errors
    }
    window.location.reload();
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message || '';
      const isChunkError =
        errMsg.includes('Failed to fetch dynamically imported module') ||
        errMsg.includes('Importing a module script failed');

      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-xl w-full rounded-2xl border border-rose-500/30 bg-white dark:bg-[#202c33] p-6 shadow-lg space-y-4 text-slate-800 dark:text-[#e9edef]">
            <h2 className="text-lg font-black text-rose-600 dark:text-rose-400">
              {isChunkError ? 'Nova versão disponível ou conexão interrompida' : 'Erro de Renderização do React'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-[#aebac1]">
              {isChunkError
                ? 'O módulo da página não pôde ser carregado (deploy recente ou servidor local reiniciado). Recarregue o aplicativo para sincronizar a versão atual.'
                : this.state.error?.toString()}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white text-xs font-bold transition-all"
              >
                Recarregar Aplicativo
              </button>
              <button
                type="button"
                onClick={this.handleRetry}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#2a3942] text-xs font-bold hover:border-[#00a884] transition-all"
              >
                Tentar Novamente
              </button>
            </div>
            <details className="text-[11px] text-slate-500 dark:text-[#8696a0]">
              <summary className="cursor-pointer font-semibold">Detalhes técnicos</summary>
              <p className="mt-2 font-mono break-all text-rose-500">{this.state.error?.toString()}</p>
              <pre className="mt-1 whitespace-pre-wrap text-[10px] overflow-x-auto">
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
