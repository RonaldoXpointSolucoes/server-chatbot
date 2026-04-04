import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type WebhookEngine = 'n8n' | 'supabase';

interface SettingsState {
  webhookEngine: WebhookEngine;
  setWebhookEngine: (engine: WebhookEngine) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      webhookEngine: 'n8n', // Default legado
      setWebhookEngine: (engine) => set({ webhookEngine: engine }),
    }),
    {
      name: 'chatboot-settings',
    }
  )
);
