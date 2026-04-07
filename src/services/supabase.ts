import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Credenciais do Supabase ausentes no .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type MessageRow = {
  id: string;
  contact_id: string;
  text_content: string;
  sender_type: 'client' | 'bot' | 'human' | 'system';
  media_url?: string;
  media_type?: 'image' | 'video' | 'audio' | 'document';
  status?: string; // PENDING, SENT, DELIVERY_ACK, READ
  timestamp: string;
}

export type ContactRow = {
  id: string;
  tenant_id: string;
  name: string;
  push_name?: string;
  profile_picture_url?: string;
  email?: string;
  document?: string;
  notes?: string;
  tags?: any[];
  phone: string;
  evolution_remote_jid?: string; // Mantido como optional para retrocompatibilidade
  whatsapp_jid?: string;
  bot_status: 'active' | 'paused';
  created_at: string;
}
