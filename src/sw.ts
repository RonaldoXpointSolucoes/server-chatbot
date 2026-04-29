/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// Cleanup outdated caches
cleanupOutdatedCaches();

// Precache resources
precacheAndRoute(self.__WB_MANIFEST);

// Força a ativação imediata do novo Service Worker
self.skipWaiting();
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

    // --- Filtro RBAC (Role-Based Access Control) via IndexedDB ---
    // Impede que atendentes vejam notificações de instâncias às quais não têm acesso (mesmo em background).
    const instanceId = data.data?.instanceId;
    const userConfig = await getConfigFromDB();
    
    if (userConfig && userConfig.isLoggedIn === false) {
        console.log('[SW] Push abortado (Background): Usuário deslogado na aplicação.');
        return; // Cancela a exibição
    }

    const role = userConfig?.role?.toLowerCase() || '';
    if (userConfig && (role === 'agent' || role === 'agente') && instanceId) {
        const allowed = userConfig.allowedInstances || [];
        if (!allowed.includes(instanceId)) {
            console.log(`[SW] Push abortado (Background): agente não tem permissão para a caixa (instância: ${instanceId}).`);
            return; // Cancela a exibição da notificação
        }
    }

  const title = data.title || 'ChatBoot CRM';
  const options = {
    body: data.body || 'Você tem uma nova mensagem',
    icon: data.icon || '/pwa-192x192.svg',
    badge: data.badge || '/pwa-192x192.svg',
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
