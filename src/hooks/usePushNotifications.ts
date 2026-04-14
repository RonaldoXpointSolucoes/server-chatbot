import { useEffect } from 'react';
import { supabase } from '../services/supabase';


// Public VAPID key generated previously
const VAPID_PUBLIC_KEY = 'BHUicMvZIyz2f9F33OIj9S6EMlh-UdP39ZEl02XMqPJfXXpJM_HkIHKcS4n2k3pJ0NaXNeQkGoSHOL495TuAUMw';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const tenantId = sessionStorage.getItem('current_tenant_id');

  useEffect(() => {
    if (!tenantId || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    const initPush = async () => {
      try {
        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.log('Permissão de notificação negada.');
          return;
        }

        // Wait for service worker to be ready
        const registration = await navigator.serviceWorker.ready;

        // Try to get existing subscription
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          console.log('Nenhuma subscription encontrada, criando uma...');
          // Subscribe to Push
          const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
          });
        }

        // Parse subscription to save in DB
        const subData = JSON.parse(JSON.stringify(subscription));

        // Save to Supabase (upsert logic based on endpoint)
        const { error } = await supabase
          .from('push_subscriptions')
          .upsert({
            tenant_id: tenantId,
            endpoint: subData.endpoint,
            p256dh: subData.keys.p256dh,
            auth: subData.keys.auth,
            user_agent: navigator.userAgent
          }, { onConflict: 'endpoint' });

        if (error) { 
          console.error('Erro ao salvar push_subscription no Supabase:', error);
        } else {
          console.log('Push Subscription ativada com sucesso para o usuário!');
        }

      } catch (error) {
        console.error('Erro ao inicializar push notifications:', error);
      }
    };

    initPush();
  }, [tenantId]);
}
