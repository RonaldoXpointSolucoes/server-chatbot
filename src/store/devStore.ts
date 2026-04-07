import { create } from 'zustand';

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

export const useDevStore = create<DevStore>((set) => ({
  logs: [],
  isVisible: false,
  isEnabled: false,
  addLog: (log) => set((state) => {
    const newLog: LogEntry = {
      ...log,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    };
    // keep max 100 logs
    return { logs: [newLog, ...state.logs].slice(0, 100) };
  }),
  clearLogs: () => set({ logs: [] }),
  toggleVisibility: () => set((state) => ({ isVisible: !state.isVisible })),
  toggleEnabled: () => set((state) => ({ isEnabled: !state.isEnabled }))
}));
