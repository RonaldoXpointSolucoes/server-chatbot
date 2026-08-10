import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Credenciais do Supabase ausentes no .env");
}

let hasReportedServiceError = false;

const customFetch = async (input: RequestInfo | URL, init?: RequestInit, retries = 5, delay = 1000): Promise<Response> => {
  const urlStr = typeof input === 'string' ? input : input.toString();
  const isAuthRequest = urlStr.includes('/auth/v1/token') || urlStr.includes('grant_type=refresh_token');

  try {
    const response = await fetch(input, init);

    // Identificar erros HTTP 5xx de servidor/infraestrutura Supabase
    if (response.status >= 500) {
      if (retries > 0) {
        console.warn(`[Supabase Cloud] Erro HTTP ${response.status} no servidor Supabase. Retentando em ${delay}ms... (Tentativas restantes: ${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return customFetch(input, init, retries - 1, Math.min(delay * 2, 5000));
      }

      if (typeof window !== 'undefined') {
        hasReportedServiceError = true;
        window.dispatchEvent(new CustomEvent('supabase-service-error', {
          detail: { 
            status: response.status,
            service: 'Supabase Cloud (Banco de Dados)',
            title: '☁️ Indisponibilidade na Nuvem (Supabase)',
            message: `O serviço em nuvem do Supabase retornou um erro de servidor (HTTP ${response.status}). O aplicativo continua operacional com dados em cache local.`,
            url: urlStr
          }
        }));
      }
    } else if (response.ok && hasReportedServiceError) {
      hasReportedServiceError = false;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('supabase-service-recovered', {
          detail: {
            service: 'Supabase Cloud (Banco de Dados)',
            title: '🟢 Serviço Supabase Restabelecido',
            message: 'A conexão com o banco de dados em nuvem Supabase foi restabelecida com sucesso.'
          }
        }));
      }
    }

    return response;
  } catch (error: any) {
    const isNetworkError = 
      error.name === 'TypeError' && (error.message === 'Failed to fetch' || error.message.includes('fetch'));
      
    if (retries > 0 && isNetworkError) {
      hasReportedServiceError = true;
      console.warn(`[Supabase Cloud] Oscilação de rede no servidor Supabase${isAuthRequest ? ' (Auth Refresh)' : ''}. Retentando em ${delay}ms... (Tentativas restantes: ${retries})`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
      return customFetch(input, init, retries - 1, Math.min(delay * 2, 5000));
    }
    
    if (isNetworkError) {
      console.error('[Supabase Cloud Network] Falha de conexão com a API do Supabase.', error);
      if (typeof window !== 'undefined') {
        hasReportedServiceError = true;
        window.dispatchEvent(new CustomEvent('supabase-network-error', {
          detail: { 
            service: 'Supabase Cloud (Banco de Dados)',
            title: '☁️ Instabilidade na Nuvem (Supabase)',
            message: "Instabilidade temporária no servidor do banco de dados (Supabase Cloud). O aplicativo continuará funcionando com os dados salvos.",
            originalError: error.message,
            url: typeof input === 'string' ? input : input.toString()
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

const MASTER_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';
export const masterSupabase = createClient(supabaseUrl, MASTER_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { fetch: customFetch }
});

// Interceptador global de ciclo de vida de autenticação para evitar sessões zumbis
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    const isExplicitLogout = typeof window !== 'undefined' && sessionStorage.getItem('user_explicit_logout') === 'true';
    const isOffline = typeof window !== 'undefined' && !window.navigator.onLine;
    const hasLocalUser = typeof window !== 'undefined' && Boolean(
      localStorage.getItem('current_user_email') || 
      sessionStorage.getItem('current_user_email') ||
      localStorage.getItem('current_tenant_id') ||
      sessionStorage.getItem('current_tenant_id')
    );

    // Se o evento SIGNED_OUT foi disparado por falha temporária de rede (Failed to fetch) ou sem um clique explícito em "Sair":
    if (!isExplicitLogout && (isOffline || hasReportedServiceError || hasLocalUser)) {
      console.warn("[Supabase Auth] SIGNED_OUT automático por oscilação de rede ignorado. Mantendo sessão local ativa.");
      return;
    }

    console.warn("[Supabase Auth] Session invalidated or signed out. Clearing local session state...");
    
    // Limpeza de credenciais do Tenant e Usuário
    localStorage.removeItem('current_tenant_id');
    localStorage.removeItem('current_tenant_name');
    localStorage.removeItem('current_user_name');
    localStorage.removeItem('current_user_role');
    localStorage.removeItem('current_user_email');
    localStorage.removeItem('current_user_id');
    localStorage.removeItem('allowed_instances');
    localStorage.removeItem('allowed_companies');
    localStorage.removeItem('keep_logged');
    
    sessionStorage.removeItem('current_tenant_id');
    sessionStorage.removeItem('current_tenant_name');
    sessionStorage.removeItem('current_user_name');
    sessionStorage.removeItem('current_user_role');
    sessionStorage.removeItem('current_user_email');
    sessionStorage.removeItem('current_user_id');
    sessionStorage.removeItem('allowed_instances');
    sessionStorage.removeItem('allowed_companies');
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('user_explicit_logout');
    
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
