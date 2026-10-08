import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { persist } from 'zustand/middleware';
import { supabase } from '../services/supabase';

export interface LogEntry {
  id: string;
  type: 'log' | 'info' | 'warn' | 'error' | 'success';
  message: string;
  source: string;
  timestamp: string;
  details?: any;
  tenantId?: string;
  instanceId?: string;
  requiresAction?: boolean;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  step?: {
    current: number;
    total: number;
    title: string;
    status?: 'active' | 'success' | 'error' | 'timeout';
  };
}

interface DevStore {
  logs: LogEntry[];
  isVisible: boolean;
  isEnabled: boolean;
  showServerLogs: boolean;
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  addBreadcrumb: (
    stepIndex: number,
    totalSteps: number,
    title: string,
    source?: string,
    details?: any,
    status?: 'active' | 'success' | 'error' | 'timeout'
  ) => void;
  log: (type: 'log' | 'info' | 'warn' | 'error' | 'success', message: string, details?: any, source?: string) => void;
  clearLogs: () => void;
  toggleVisibility: () => void;
  toggleEnabled: () => void;
  setShowServerLogs: (val: boolean) => void;
}

export const useDevStore = create<DevStore>()(
  persist(
    (set, get) => ({
      logs: [],
      isVisible: false,
      isEnabled: false,
      addLog: (log) => {
        const msg = log.message || '';
        const lowerMsg = msg.toLowerCase();

        // 1. Filtragem e supressão de ruídos operacionais irrelevantes (INFO ou WARN que não exigem ação)
        const isIrrelevantNoise =
          lowerMsg.includes('telemetria temporariamente') ||
          lowerMsg.includes('telemetria em espera') ||
          lowerMsg.includes('mensagens processadas: 0') ||
          lowerMsg.includes('closing open session in favor of incoming prekey bundle') ||
          lowerMsg.includes('history sync is disabled') ||
          lowerMsg.includes('usync fetch yielded no results') ||
          lowerMsg.includes('pertence ao ambiente de testes') ||
          lowerMsg.includes('não pertence ao escopo deste nó') ||
          lowerMsg.includes('sent retry receipt') ||
          lowerMsg.includes('error in sending keep alive') ||
          lowerMsg.includes('keep alive called when ws not open');

        if (isIrrelevantNoise && log.type !== 'error') {
          return; // Suprime avisos cosméticos e irrelevantes
        }

        // 2. Detecção e Priorização de Erros Críticos e Ação Requerida
        const isTimeoutError =
          msg.includes('MIGALHA ERRO TIMEOUT') ||
          lowerMsg.includes('demorou mais de 3 minutos') ||
          lowerMsg.includes('timeout de 3 minutos');

        const isActionRequired =
          log.requiresAction ||
          isTimeoutError ||
          lowerMsg.includes('requires_action') ||
          lowerMsg.includes('ação requerida') ||
          lowerMsg.includes('acao requerida') ||
          lowerMsg.includes('watchdog') ||
          lowerMsg.includes('presa em status \'connecting\'') ||
          lowerMsg.includes('gateway http lento ou inacessível') ||
          lowerMsg.includes('erro ao editar mensagem') ||
          lowerMsg.includes('falha ao comunicar com motor');

        const finalType = isTimeoutError ? 'error' : log.type;
        const finalSeverity = isTimeoutError
          ? 'critical'
          : log.severity || (finalType === 'error' ? 'high' : finalType === 'warn' ? 'medium' : 'low');

        // 3. Sanitizar details para evitar sobrecarga de memória
        let sanitizedDetails = log.details;
        if (sanitizedDetails) {
          try {
            if (typeof sanitizedDetails === 'string') {
              if (sanitizedDetails.includes('data:image') || sanitizedDetails.length > 1500) {
                sanitizedDetails = sanitizedDetails.substring(0, 500) + '... [Truncado para performance]';
              }
            } else if (typeof sanitizedDetails === 'object') {
              const copy: Record<string, any> = Array.isArray(sanitizedDetails) ? [] : {};
              for (const [k, v] of Object.entries(sanitizedDetails)) {
                if (typeof v === 'string' && (v.includes('data:image') || v.length > 1500)) {
                  copy[k] = v.substring(0, 200) + '... [Imagem/Texto Extenso Omitido]';
                } else {
                  copy[k] = v;
                }
              }
              sanitizedDetails = copy;
            }
          } catch {
            sanitizedDetails = '[Dados omitidos]';
          }
        }

        // 4. Extração e Correlação Automática de tenantId e instanceId
        const extractedTenant =
          log.tenantId ||
          sanitizedDetails?.tenantId ||
          sanitizedDetails?.company_id ||
          (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) ||
          undefined;

        const extractedInstance =
          log.instanceId ||
          sanitizedDetails?.instanceId ||
          sanitizedDetails?.instance_id ||
          (msg.match(/instância\s+([a-zA-Z0-9_-]+)/i)?.[1]) ||
          undefined;

        const newLog: LogEntry = {
          ...log,
          type: finalType,
          details: sanitizedDetails,
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          tenantId: extractedTenant,
          instanceId: extractedInstance,
          requiresAction: isActionRequired,
          severity: finalSeverity
        };
        
        const state = get();
        if (state.isEnabled) {
            const tenantId = extractedTenant || localStorage.getItem('tenantId');
            
            // Evitar loops recursivos e duplicação: não envia ao banco erros gerados pelo próprio Supabase, DevLogger ou rotas de diagnóstico
            const isExcludedCall = 
              (log.source && (
                log.source.toLowerCase().includes('supabase') || 
                log.source.toLowerCase().includes('devlogger') ||
                log.source.toLowerCase().includes('servidor node.js')
              )) ||
              (log.message && (
                log.message.toLowerCase().includes('supabase.co') || 
                log.message.toLowerCase().includes('analyze-logs') ||
                log.message.includes('received error in ack') ||
                log.message.includes('Closing session')
              ));

            if (!isExcludedCall) {
              // Background async save to db com payload seguro
              let safePayload: string | null = null;
              if (sanitizedDetails) {
                try {
                  const serialized = JSON.stringify({
                    ...sanitizedDetails,
                    requires_action: isActionRequired,
                    severity: finalSeverity,
                    instance_id: extractedInstance
                  });
                  safePayload = serialized.length > 2000 ? serialized.substring(0, 2000) + '...' : serialized;
                } catch {
                  safePayload = null;
                }
              }

              supabase.from('system_logs').insert([{
                 type: log.source || 'Frontend',
                 message: (log.message || '').substring(0, 1000),
                 level: finalType,
                 payload: safePayload,
                 company_id: tenantId || null,
                 tenant_id: tenantId || null,
              }]).then(({ error }) => {
                 if (error && log.source !== 'Fetch API: undefined') {
                     // Ignore to prevent loop
                 }
              }).catch(() => {
                  // Ignore silent network errors
              });
            }
        }
        
        set((state) => ({ logs: [newLog, ...state.logs].slice(0, 200) }));
      },
      addBreadcrumb: (stepIndex, totalSteps, title, source = 'WhatsApp Flow', details, status = 'active') => {
        const isTimeout = status === 'timeout' || title.toLowerCase().includes('timeout');
        const isError = status === 'error' || isTimeout;
        const emoji = isTimeout ? '⏰❌' : isError ? '❌' : status === 'success' ? '✅' : '📍';
        const message = `[MIGALHA ${stepIndex}/${totalSteps}] ${emoji} ${title}`;

        const extractedTenant = details?.tenantId || details?.company_id || undefined;
        const extractedInstance = details?.instanceId || details?.instance_id || undefined;

        get().addLog({
          type: isTimeout ? 'error' : isError ? 'error' : status === 'success' ? 'success' : 'info',
          message,
          source,
          details: {
            ...details,
            breadcrumb: { stepIndex, totalSteps, title, status }
          },
          tenantId: extractedTenant,
          instanceId: extractedInstance,
          requiresAction: isTimeout || isError,
          severity: isTimeout ? 'critical' : isError ? 'high' : 'low',
          step: { current: stepIndex, total: totalSteps, title, status }
        });
      },
      log: (type, message, details, source = 'Sistema') => {
        get().addLog({
          type,
          message,
          source,
          details
        });
      },
      showServerLogs: false,
      clearLogs: () => set({ logs: [] }),
      toggleVisibility: () => set((state) => ({ isVisible: !state.isVisible })),
      toggleEnabled: () => set((state) => ({ isEnabled: !state.isEnabled })),
      setShowServerLogs: (val) => set({ showServerLogs: val })
    }),
    {
      name: 'dev-logger-config',
      partialize: (state) => ({ isEnabled: state.isEnabled }), 
    }
  )
);
