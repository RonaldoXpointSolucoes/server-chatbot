/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// Cleanup outdated caches
cleanupOutdatedCaches();

// Precache resources
precacheAndRoute(self.__WB_MANIFEST);

// --- IMPORTAÇÃO DE ESTRATÉGIAS WORKBOX PARA PWA PREMIUM ---
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { createHandlerBoundToURL } from 'workbox-precaching';

// 1. Roteamento de Fallback de Navegação para SPA (index.html)
try {
  const handler = createHandlerBoundToURL('/index.html');
  const navigationRoute = new NavigationRoute(handler, {
    denylist: [
      /\/_matrix/, // Ignorar rotas de chat motor/baileys se existirem no mesmo domínio
      /\/api\//,    // Ignorar requisições de API
      /\/v1\//      // Ignorar funções Supabase Edge
    ]
  });
  registerRoute(navigationRoute);
} catch (e) {
  console.warn('[SW] Falha ao registrar NavigationRoute fallback:', e);
}

// 2. Cache dinâmico de Estilos e Scripts
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({
    cacheName: 'static-resources',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
);

// 3. Cache dinâmico de Fontes Google (Google Fonts API)
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: 'google-fonts-stylesheets',
  })
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webformats',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 ano
        maxEntries: 50,
      }),
    ],
  })
);

// 4. Cache dinâmico de Imagens (Avatares, mídias de chat e logos)
registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'dynamic-images',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200]
      }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 dias de retenção
        purgeOnQuotaError: true
      }),
    ],
  })
);

// Permite que o cliente dite a ativação via botão "Atualizar"
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
clientsClaim();

// --- INÍCIO INDEXEDDB RBAC CONFIG ---
const DB_NAME = 'ChatBootSWConfig';
const STORE_NAME = 'userConfig';

function openDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveConfigToDB(config: any) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(config, 'currentConfig');
    return new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
  } catch (e) {
    console.error('[SW] Erro ao salvar no IndexedDB:', e);
  }
}

async function savePendingNotificationTarget(target: any) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(target, 'pendingNotificationTarget');
    return new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
  } catch (e) {
    console.error('[SW] Erro ao salvar pendingNotificationTarget no IndexedDB:', e);
  }
}

async function getConfigFromDB(): Promise<{
  role?: string;
  allowedInstances?: string[];
  isLoggedIn?: boolean;
  notifPrefs?: Record<string, any>;
  instancesMap?: Record<string, { name: string; phone?: string }>;
} | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get('currentConfig');
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

function extractQueryParam(urlStr: string | undefined, param: string): string | null {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr, self.location.origin);
    return parsed.searchParams.get(param);
  } catch {
    const match = urlStr.match(new RegExp(`[?&]${param}=([^&#]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }
}
// --- FIM INDEXEDDB RBAC CONFIG ---

self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'SYNC_USER_CONFIG') {
    await saveConfigToDB(event.data.config);
    console.log('[SW] User config persistido no IndexedDB:', event.data.config);
  } else if (event.data && event.data.type === 'CLEAR_PENDING_NOTIFICATION_TARGET') {
    await savePendingNotificationTarget(null);
  }
});

// Handle push events
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data: any = {};
    
    if (event.data) {
      try {
        data = event.data.json();
      } catch (e) {
        data = { title: 'Nova Notificação', body: event.data.text() };
      }
    }

    // Filtro de mensagens antigas (evita enxurrada de notificações acumuladas ao abrir o navegador/sistema)
    const createdAt = data.data?.createdAt;
    if (createdAt) {
      const ageMs = Date.now() - new Date(createdAt).getTime();
      const maxAgeMs = 3 * 60 * 1000; // 3 minutos
      if (ageMs > maxAgeMs) {
        console.log(`[SW] Push descartado por ser muito antigo (${Math.round(ageMs / 1000)}s de idade).`);
        return;
      }
    }

    const rawUrl = data.data?.url || '/';
    const instanceId = data.data?.instanceId || extractQueryParam(rawUrl, 'instance') || null;
    const conversationId = data.data?.conversationId || extractQueryParam(rawUrl, 'conversation') || null;
    const contactId = data.data?.contactId || extractQueryParam(rawUrl, 'contactId') || null;
    const contactPhone = data.data?.contactPhone || extractQueryParam(rawUrl, 'phone') || null;

    // Filtro RBAC e Preferências por Caixa de Entrada
    const userConfig = await getConfigFromDB();
    
    if (userConfig && userConfig.isLoggedIn === false) {
        console.log('[SW] Push abortado (Background): Usuário deslogado na aplicação.');
        return; // Cancela a exibição
    }

    // Se as notificações desta caixa especificamente foram silenciadas pelo usuário
    if (instanceId && userConfig?.notifPrefs && userConfig.notifPrefs[instanceId]) {
        const pref = userConfig.notifPrefs[instanceId];
        if (pref.is_enabled === false) {
            console.log(`[SW] Push abortado (Background): Caixa ${instanceId} silenciada pelo usuário.`);
            return; // Cancela a exibição
        }
    }

    const role = userConfig?.role?.toLowerCase() || '';
    const isGlobalAdmin = role === 'owner' || role === 'admin';

    if (userConfig && !isGlobalAdmin) {
        const allowed = userConfig.allowedInstances || [];
        if (!instanceId || !allowed.includes(instanceId)) {
            console.log(`[SW] Push abortado (Background): validação estrita de segurança de caixa. Acesso negado para instância: ${instanceId}`);
            return; // Cancela a exibição da notificação
        }
    }

    // Enriquecimento automático do Nome da Caixa via instancesMap sincronizado no IndexedDB
    const mappedInstance = (instanceId && userConfig?.instancesMap) ? userConfig.instancesMap[instanceId] : null;
    const instanceName = data.data?.instanceName || mappedInstance?.name || null;

    const rawTitle = (data.title || 'ChatBoot CRM').trim();
    const cleanContactName = data.data?.contactName || rawTitle.split(' • 📥 ')[0].trim();

    // Título exibe claramente o Nome do Contato + Caixa de Entrada
    const title = (instanceName && !rawTitle.includes(instanceName))
      ? `${rawTitle} • 📥 ${instanceName}`
      : rawTitle;

    // Corpo enriquecido com detalhes da mensagem + rodapé da Caixa e Telefone
    let bodyText = (data.body || 'Você recebeu uma nova mensagem').trim();
    if (instanceName && !bodyText.includes('📦') && !bodyText.includes('Caixa:')) {
      const metaParts: string[] = [`📦 Caixa: ${instanceName}`];
      if (contactPhone) {
        const digits = String(contactPhone).replace(/\D/g, '');
        if (digits.length >= 12 && digits.startsWith('55')) {
          const ddd = digits.slice(2, 4);
          const rest = digits.slice(4);
          const fmt = rest.length === 9 ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}` : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
          metaParts.push(`📱 ${fmt}`);
        }
      }
      bodyText = `${bodyText}\n${metaParts.join(' • ')}`;
    }

    const deepLinkUrl = `/chat?conversation=${encodeURIComponent(conversationId || '')}&instance=${encodeURIComponent(instanceId || '')}&contactId=${encodeURIComponent(contactId || '')}&phone=${encodeURIComponent(contactPhone || '')}&contactName=${encodeURIComponent(cleanContactName || '')}`;

    const notifTag = data.tag || (conversationId ? `conv_${conversationId}` : `inst_${instanceId || 'default'}_${cleanContactName}`);
    const notifImage = data.image || data.data?.mediaUrl || undefined;

    const options: any = {
      body: bodyText,
      icon: data.icon || '/pwa-192x192.png',
      badge: data.badge || '/pwa-192x192.png',
      tag: notifTag,
      renotify: true,
      vibrate: [200, 100, 200],
      timestamp: createdAt ? new Date(createdAt).getTime() : Date.now(),
      data: {
        ...(data.data || {}),
        url: deepLinkUrl,
        conversationId,
        instanceId,
        instanceName,
        contactId,
        contactPhone,
        contactName: cleanContactName
      },
      actions: [
        {
          action: 'open',
          title: instanceName ? `Abrir na caixa ${instanceName}` : 'Abrir Conversa',
        }
      ]
    };

    if (notifImage) {
      options.image = notifImage;
    }

    await self.registration.showNotification(title, options);
  })());
});

// Handle notification click: Direciona exatamente para a Caixa e Conversa da notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const rawUrl = notifData.url || '/';

  const conversationId = notifData.conversationId || extractQueryParam(rawUrl, 'conversation') || null;
  const instanceId = notifData.instanceId || extractQueryParam(rawUrl, 'instance') || null;
  const contactId = notifData.contactId || extractQueryParam(rawUrl, 'contactId') || null;
  const contactPhone = notifData.contactPhone || extractQueryParam(rawUrl, 'phone') || null;
  const rawTitle = (event.notification.title || '').split(' • 📥 ')[0].trim();
  const contactName = notifData.contactName || extractQueryParam(rawUrl, 'contactName') || rawTitle || null;
  const instanceName = notifData.instanceName || null;

  const targetUrl = `/chat?conversation=${encodeURIComponent(conversationId || '')}&instance=${encodeURIComponent(instanceId || '')}&contactId=${encodeURIComponent(contactId || '')}&phone=${encodeURIComponent(contactPhone || '')}&contactName=${encodeURIComponent(contactName || '')}`;

  const clickPayload = {
    conversationId,
    instanceId,
    instanceName,
    contactId,
    contactPhone,
    contactName,
    url: targetUrl,
    timestamp: Date.now()
  };

  event.waitUntil((async () => {
    // 1. Salva no IndexedDB para garantir que mesmo se a janela recarregar ou abrir do zero, o app saiba qual conversa abrir
    await savePendingNotificationTarget(clickPayload);

    // 2. Procura janelas/abas abertas do aplicativo
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    let focusedClient: WindowClient | null = null;

    for (const client of windowClients) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && !clientUrl.pathname.startsWith('/admin')) {
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            payload: clickPayload
          });
          if (!focusedClient && 'focus' in client) {
            focusedClient = await client.focus();
          }
        }
      } catch (e) {}
    }

    if (focusedClient) {
      return focusedClient;
    }

    // 3. Se não houver janela aberta do app, abre diretamente na URL com os parâmetros da caixa e conversa
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});

