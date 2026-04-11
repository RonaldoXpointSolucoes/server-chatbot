import { create } from 'zustand';
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
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  toggleVisibility: () => void;
  toggleEnabled: () => void;
}

export const useDevStore = create<DevStore>()(
  persist(
    (set, get) => ({
      logs: [],
      isVisible: false,
      isEnabled: false,
      addLog: (log) => {
        const newLog: LogEntry = {
          ...log,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString()
        };
        
        const state = get();
        if (state.isEnabled) {
            const tenantId = sessionStorage.getItem('current_tenant_id') || localStorage.getItem('tenantId');
            
            // Background async save to db
            supabase.from('system_logs').insert([{
               type: log.source || 'Frontend',
               message: log.message,
               level: log.type,
               payload: log.details ? JSON.stringify(log.details) : null,
               company_id: tenantId || null,
            }]).then(({ error }) => {
               if (error && log.source !== 'Fetch API: undefined') {
                   // Ignore to prevent loop
               }
            });
        }
        
        set((state) => ({ logs: [newLog, ...state.logs].slice(0, 100) }));
      },
      clearLogs: () => set({ logs: [] }),
      toggleVisibility: () => set((state) => ({ isVisible: !state.isVisible })),
      toggleEnabled: () => set((state) => ({ isEnabled: !state.isEnabled }))
    }),
    {
      name: 'dev-logger-config',
      partialize: (state) => ({ isEnabled: state.isEnabled }), 
    }
  )
);
