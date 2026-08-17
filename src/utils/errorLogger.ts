import { supabase } from '../services/supabase';
import { useDevStore } from '../store/devStore';

interface ErrorContext {
  componentStack?: string;
  source?: string;
  url?: string;
  tenantId?: string;
  userId?: string;
  [key: string]: any;
}

/**
 * Utilitário centralizado de captura e persistência de erros do Frontend
 */
export const reportError = async (
  error: Error | string,
  context: ErrorContext = {},
  source: string = 'frontend'
) => {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const tenantId = typeof localStorage !== 'undefined' 
      ? (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id') || localStorage.getItem('tenantId')) 
      : undefined;

    const fullContext = {
      ...context,
      url: currentUrl,
      userAgent,
      tenantId: tenantId || context.tenantId,
      timestamp: new Date().toISOString()
    };

    // 1. Registra localmente no DevLogger UI
    useDevStore.getState().addLog({
      type: 'error',
      message: `[${source.toUpperCase()}] ${message}`,
      source: source || 'Frontend Error',
      details: {
        stack,
        context: fullContext
      }
    });

    // 2. Evita loops com o próprio Supabase
    if (
      message.toLowerCase().includes('supabase') || 
      message.toLowerCase().includes('system_logs') || 
      message.toLowerCase().includes('supabase.co')
    ) {
      return;
    }

    // 3. Persistência assíncrona no Supabase (system_logs)
    supabase.from('system_logs').insert([{
      type: 'Frontend Error',
      message,
      level: 'error',
      payload: {
        stack_trace: stack || null,
        context: fullContext,
        source: 'frontend',
        environment: import.meta.env.MODE || 'production'
      },
      company_id: tenantId || null,
      created_at: new Date().toISOString()
    }]).then(({ error: dbErr }) => {
      if (dbErr && !dbErr.message?.includes('schema cache')) {
        // Silencioso para evitar loop
      }
    }).catch(() => {
      // Ignora falhas de rede de forma não-bloqueante
    });

    // 4. Notifica o backend Node.js se a URL do motor estiver acessível
    const engineUrl = import.meta.env.VITE_WHATSAPP_ENGINE_URL || '';
    if (engineUrl && !engineUrl.includes('localhost')) {
      fetch(`${engineUrl}/api/v1/system/logs/error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          stack_trace: stack,
          context: fullContext,
          level: 'error',
          source: 'frontend',
          company_id: tenantId
        })
      }).catch(() => {
        // Falhas na comunicação com backend não devem interromper o app
      });
    }
  } catch (loggingErr) {
    // Garantia de execução não-bloqueante
  }
};

/**
 * Inicializa a interceptação de erros globais da janela do navegador
 */
export const setupGlobalErrorLogging = () => {
  if (typeof window === 'undefined') return;

  const handleGlobalError = (event: ErrorEvent) => {
    reportError(
      event.error || new Error(event.message),
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      },
      'window.onerror'
    );
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const err = reason instanceof Error ? reason : new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
    reportError(err, { type: 'unhandledrejection' }, 'window.unhandledrejection');
  };

  window.addEventListener('error', handleGlobalError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    window.removeEventListener('error', handleGlobalError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
};
