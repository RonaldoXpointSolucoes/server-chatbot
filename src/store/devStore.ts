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
}

interface DevStore {
  logs: LogEntry[];
  isVisible: boolean;
  isEnabled: boolean;
  showServerLogs: boolean;
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  addBreadcrumb: (stepIndex: number, totalSteps: number, title: string, source?: string, details?: any) => void;
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
        // Sanitizar details para evitar sobrecarga de memória com imagens base64 ou payloads gigantes
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

        const newLog: LogEntry = {
          ...log,
          details: sanitizedDetails,
          id: uuidv4(),
          timestamp: new Date().toISOString()
        };
        
        const state = get();
        if (state.isEnabled) {
            const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || localStorage.getItem('tenantId');
            
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
                  const serialized = JSON.stringify(sanitizedDetails);
                  safePayload = serialized.length > 2000 ? serialized.substring(0, 2000) + '...' : serialized;
                } catch {
                  safePayload = null;
                }
              }

              supabase.from('system_logs').insert([{
                 type: log.source || 'Frontend',
                 message: (log.message || '').substring(0, 1000),
                 level: log.type,
                 payload: safePayload,
                 company_id: tenantId || null,
              }]).then(({ error }) => {
                 if (error && log.source !== 'Fetch API: undefined') {
                     // Ignore to prevent loop
                 }
              }).catch(() => {
                  // Ignore silent network errors
              });
            }
        }
        
        set((state) => ({ logs: [newLog, ...state.logs].slice(0, 150) }));
      },
      addBreadcrumb: (stepIndex, totalSteps, title, source = 'WhatsApp Flow', details) => {
        const message = `[MIGALHA ${stepIndex}/${totalSteps}] 📍 ${title}`;
        get().addLog({
          type: 'info',
          message,
          source,
          details
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
