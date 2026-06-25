import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Credenciais do Supabase ausentes no .env");
}

const customFetch = async (input: RequestInfo | URL, init?: RequestInit, retries = 3, delay = 1000): Promise<Response> => {
  try {
    return await fetch(input, init);
  } catch (error: any) {
    const isNetworkError = 
      error.name === 'TypeError' && error.message === 'Failed to fetch';
      
    if (retries > 0 && isNetworkError) {
      console.warn(`[Supabase Network] Falha de conexão. Retentando em ${delay}ms... (Tentativas restantes: ${retries})`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
      return customFetch(input, init, retries - 1, delay * 2);
    }
    
    if (isNetworkError) {
      console.error('[Supabase Network] Falha definitiva de conexão. Verifique sua internet.', error);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('supabase-network-error', {
          detail: { 
            message: "Sua conexão com a internet parece instável ou o servidor demorou a responder.",
            originalError: error.message 
          }
        }));
      }
    }
    throw error;
  }
};

const customAuthStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    const keepLogged = localStorage.getItem('keep_logged') === 'true';
    return keepLogged ? localStorage.getItem(key) : sessionStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    const keepLogged = localStorage.getItem('keep_logged') === 'true';
    if (keepLogged) {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customAuthStorage,
    persistSession: true
  },
  global: {
    fetch: customFetch
  }
});

// Interceptador global de ciclo de vida de autenticação para evitar sessões zumbis
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    // Se estiver offline, não limpa a sessão local ainda, pois pode ser apenas falha temporária de rede ao tentar atualizar o token
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
      console.warn("[Supabase Auth] SIGNED_OUT detectado mas o usuário está offline. Mantendo sessão local.");
      return;
    }

    console.warn("[Supabase Auth] Session invalidated or signed out. Clearing local session state...");
    
    // Limpeza de credenciais do Tenant e Usuário
    localStorage.removeItem('current_tenant_id');
    localStorage.removeItem('current_tenant_name');
    localStorage.removeItem('current_user_name');
    localStorage.removeItem('current_user_role');
    localStorage.removeItem('current_user_email');
    localStorage.removeItem('allowed_instances');
    localStorage.removeItem('allowed_companies');
    localStorage.removeItem('keep_logged');
    
    sessionStorage.removeItem('current_tenant_id');
    sessionStorage.removeItem('current_tenant_name');
    sessionStorage.removeItem('current_user_name');
    sessionStorage.removeItem('current_user_role');
    sessionStorage.removeItem('current_user_email');
    sessionStorage.removeItem('allowed_instances');
    sessionStorage.removeItem('allowed_companies');
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
  latitude?: string;
  longitude?: string;
  addresses?: any[];
  ap?: string;
  block?: string;
  reference?: string;
  notes?: string;
  tags?: any[];
  company_ids?: string[];
  phone: string;
  evolution_remote_jid?: string; // Mantido como optional para retrocompatibilidade
  whatsapp_jid?: string;
  bot_status: 'active' | 'paused';
  bot_paused_until?: string;
  open_date?: string;
  company_size?: string;
  legal_nature?: string;
  main_activity?: string;
  secondary_activities?: string;
  created_at: string;
  is_pinned?: boolean;
  pinned_instances?: string[];
  id_gastro_food?: string;
}
