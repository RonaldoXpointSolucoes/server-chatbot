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

async function getConfigFromDB(): Promise<{ role?: string, allowedInstances?: string[], isLoggedIn?: boolean } | null> {
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
// --- FIM INDEXEDDB RBAC CONFIG ---

self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'SYNC_USER_CONFIG') {
    await saveConfigToDB(event.data.config);
    console.log('[SW] User config persistido no IndexedDB:', event.data.config);
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

    // Filtro RBAC e Preferências por Caixa de Entrada
    const instanceId = data.data?.instanceId;
    const userConfig = await getConfigFromDB();
    
    if (userConfig && userConfig.isLoggedIn === false) {
        console.log('[SW] Push abortado (Background): Usuário deslogado na aplicação.');
        return; // Cancela a exibição
    }

    // Se as notificações desta caixa especificamente foram silenciadas pelo usuário
    if (instanceId && (userConfig as any)?.notifPrefs && (userConfig as any).notifPrefs[instanceId]) {
        const pref = (userConfig as any).notifPrefs[instanceId];
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

  const title = data.title || 'ChatBoot CRM';
  const options = {
    body: data.body || 'Você tem uma nova mensagem',
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/pwa-192x192.png',
    vibrate: [200, 100, 200],
    data: data.data || { url: '/' },
    actions: [
      {
        action: 'open',
        title: 'Abrir Chat',
      }
    ]
  };

  await self.registration.showNotification(title, options);
  })());
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        // If so, just focus it.
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, then open the target URL in a new window/tab.
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
