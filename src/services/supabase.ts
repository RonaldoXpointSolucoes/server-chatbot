import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Credenciais do Supabase ausentes no .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Interceptador global de ciclo de vida de autenticação para evitar sessões zumbis
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    console.warn("[Supabase Auth] Session invalidated or signed out. Clearing local session state...");
    
    // Limpeza de credenciais do Tenant e Usuário
    localStorage.removeItem('current_tenant_id');
    localStorage.removeItem('current_tenant_name');
    sessionStorage.removeItem('current_tenant_id');
    sessionStorage.removeItem('current_tenant_name');
    sessionStorage.removeItem('current_user_email');
    sessionStorage.removeItem('current_user_role');
    sessionStorage.removeItem('admin_token');
    
    // Se estiver em uma rota restrita, força redirecionamento instantâneo para o login corporativo
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path !== '/' && path !== '/admin/login' && path !== '/features') {
        window.location.href = '/';
      }
    }
  }
});

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
  custom_name?: string;
  fantasy_name?: string;
  push_name?: string;
  profile_picture_url?: string;
  document_type?: string;
  document_number?: string;
  email?: string;
  cep?: string;
  address_street?: string;
  address_number?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  notes?: string;
  tags?: any[];
  phone: string;
  evolution_remote_jid?: string; // Mantido como optional para retrocompatibilidade
  whatsapp_jid?: string;
  bot_status: 'active' | 'paused';
  open_date?: string;
  company_size?: string;
  legal_nature?: string;
  main_activity?: string;
  secondary_activities?: string;
  created_at: string;
  is_pinned?: boolean;
  pinned_instances?: string[];
}
