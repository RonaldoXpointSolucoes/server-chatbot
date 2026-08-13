export interface EnvironmentConfig {
  id: 'alpha' | 'production';
  name: string;
  url: string;
  badgeColor: string;
  headerBadgeText: string;
}

const CANDIDATES_PROD = [
  import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim(),
  'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io',
  'https://api.xpointsolucoes.com',
  'http://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io'
].filter(Boolean) as string[];

const CANDIDATES_ALPHA = [
  'https://wh1ss8sy848ufj6zh8t492y7.69.62.92.212.sslip.io',
  'https://api-alpha.xpointsolucoes.com',
  'http://wh1ss8sy848ufj6zh8t492y7.69.62.92.212.sslip.io'
];

const STORAGE_KEY_ENV = 'chatboot.environment';
const STORAGE_KEY_URL = 'chatboot.environment_url';

export const ENVIRONMENTS: Record<'alpha' | 'production', EnvironmentConfig> = {
  production: {
    id: 'production',
    name: 'PRODUÇÃO',
    url: CANDIDATES_PROD[0],
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 border',
    headerBadgeText: '🟢 PRODUÇÃO'
  },
  alpha: {
    id: 'alpha',
    name: 'ALFA',
    url: CANDIDATES_ALPHA[0],
    badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30 border',
    headerBadgeText: '🔴 ALFA'
  }
};

export const getCurrentEnvironment = (): EnvironmentConfig => {
  const stored = localStorage.getItem(STORAGE_KEY_ENV);
  const activeEnv = stored === 'alpha' ? ENVIRONMENTS.alpha : ENVIRONMENTS.production;
  const storedUrl = localStorage.getItem(`${STORAGE_KEY_URL}.${activeEnv.id}`);
  if (storedUrl) {
    activeEnv.url = storedUrl;
  }
  return activeEnv;
};

export const getActiveEngineUrl = (): string => {
  return getCurrentEnvironment().url;
};

export const setEnvironment = (envId: 'alpha' | 'production') => {
  localStorage.setItem(STORAGE_KEY_ENV, envId);
  window.dispatchEvent(new CustomEvent('chatboot:environment_changed', { detail: ENVIRONMENTS[envId] }));
};

export const validateServerEnvironment = async (targetEnv: 'alpha' | 'production'): Promise<{
  valid: boolean;
  serverEnv?: string;
  serverNode?: string;
  version?: string;
  error?: string;
}> => {
  const candidates = targetEnv === 'alpha' ? CANDIDATES_ALPHA : CANDIDATES_PROD;
  const savedUrl = localStorage.getItem(`${STORAGE_KEY_URL}.${targetEnv}`);
  
  // Reordena candidatos para tentar a URL salva primeiro, se existir
  const orderedCandidates = savedUrl 
    ? [savedUrl, ...candidates.filter(u => u !== savedUrl)]
    : candidates;

  let lastError = '';

  for (const candidateUrl of orderedCandidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${candidateUrl}/api/v1/system/info`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        lastError = `Servidor retornou status HTTP ${res.status}`;
        continue;
      }

      const data = await res.json();
      const serverEnv = (data.environment || '').toLowerCase();
      
      if (serverEnv === targetEnv) {
        ENVIRONMENTS[targetEnv].url = candidateUrl;
        localStorage.setItem(`${STORAGE_KEY_URL}.${targetEnv}`, candidateUrl);
        return {
          valid: true,
          serverEnv: data.environment,
          serverNode: data.node,
          version: data.version
        };
      } else {
        return {
          valid: false,
          error: `Divergência: O servidor em ${candidateUrl} está configurado como '${data.environment}', mas o ambiente selecionado foi '${targetEnv}'.`
        };
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        lastError = `Timeout ao conectar com ${candidateUrl}`;
      } else {
        lastError = err.message || 'Falha de conexão de rede';
      }
    }
  }

  return { valid: false, error: lastError || 'Servidor indisponível ou inacessível.' };
};
