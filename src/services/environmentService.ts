export interface EnvironmentConfig {
  id: 'alpha' | 'production';
  name: string;
  url: string;
  badgeColor: string;
  headerBadgeText: string;
}

const DEFAULT_PROD_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';
const DEFAULT_ALPHA_URL = 'https://api-alpha.xpointsolucoes.com';

export const ENVIRONMENTS: Record<'alpha' | 'production', EnvironmentConfig> = {
  production: {
    id: 'production',
    name: 'PRODUÇÃO',
    url: DEFAULT_PROD_URL,
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border',
    headerBadgeText: '🟢 PRODUÇÃO'
  },
  alpha: {
    id: 'alpha',
    name: 'ALFA',
    url: DEFAULT_ALPHA_URL,
    badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30 border',
    headerBadgeText: '🔴 ALFA'
  }
};

const STORAGE_KEY = 'chatboot.environment';

export const getCurrentEnvironment = (): EnvironmentConfig => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'alpha') return ENVIRONMENTS.alpha;
  return ENVIRONMENTS.production;
};

export const getActiveEngineUrl = (): string => {
  return getCurrentEnvironment().url;
};

export const setEnvironment = (envId: 'alpha' | 'production') => {
  localStorage.setItem(STORAGE_KEY, envId);
  window.dispatchEvent(new CustomEvent('chatboot:environment_changed', { detail: ENVIRONMENTS[envId] }));
};

export const validateServerEnvironment = async (targetEnv: 'alpha' | 'production'): Promise<{
  valid: boolean;
  serverEnv?: string;
  serverNode?: string;
  version?: string;
  error?: string;
}> => {
  const envConfig = ENVIRONMENTS[targetEnv];
  try {
    const res = await fetch(`${envConfig.url}/api/v1/system/info`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      return { valid: false, error: `Servidor retornou status HTTP ${res.status}` };
    }

    const data = await res.json();
    const serverEnv = (data.environment || '').toLowerCase();
    
    // Se o ambiente configurado for alpha e o servidor retornar production (ou vice-versa), mismatch!
    const valid = serverEnv === targetEnv;
    return {
      valid,
      serverEnv: data.environment,
      serverNode: data.node,
      version: data.version
    };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Falha de comunicação de rede' };
  }
};
