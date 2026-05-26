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

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#ffebee', color: '#c62828', fontFamily: 'monospace' }}>
          <h2>Erro de Renderização do React!</h2>
          <p>{this.state.error && this.state.error.toString()}</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '11px' }}>
            {this.state.errorInfo?.componentStack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
