/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// Cleanup outdated caches
cleanupOutdatedCaches();

// Precache resources
precacheAndRoute(self.__WB_MANIFEST);

// Handle push events
self.addEventListener('push', (event) => {
  let data: any = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Nova Notificação', body: event.data.text() };
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

  event.waitUntil(self.registration.showNotification(title, options));
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
