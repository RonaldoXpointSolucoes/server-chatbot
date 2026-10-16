import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useChatStore } from '../store/chatStore';


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
  const navigate = useNavigate();
  const location = useLocation();
  const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleGlobalSWClick = (event: MessageEvent) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICK' && event.data.payload) {
        const p = event.data.payload;
        if (!location.pathname.startsWith('/chat')) {
          navigate('/chat');
          setTimeout(() => {
            useChatStore.getState().openConversationFromNotification(p);
          }, 150);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleGlobalSWClick);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleGlobalSWClick);
    };
  }, [location.pathname, navigate]);

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

        const userEmail = localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email');

        // Função de gravação com retentativa e backoff exponencial para lidar com falhas de rede ou concorrência de locks
        const saveSubscriptionWithRetry = async (retries = 3, delay = 1000): Promise<boolean> => {
          try {
            const { error } = await supabase
              .from('push_subscriptions')
              .upsert({
                tenant_id: tenantId,
                endpoint: subData.endpoint,
                p256dh: subData.keys.p256dh,
                auth: subData.keys.auth,
                user_agent: navigator.userAgent,
                email: userEmail ? userEmail.trim().toLowerCase() : null
              }, { onConflict: 'endpoint' });

            if (error) throw error;
            console.log('Push Subscription ativada com sucesso para o usuário!');
            return true;
          } catch (err: any) {
            const isAbortError = err?.name === 'AbortError' || err?.message?.includes('AbortError') || err?.message?.includes('Lock') || err?.message?.includes('steal');
            const isNetworkError = err?.message?.includes('Failed to fetch') || !navigator.onLine;

            if (retries > 0 && (isAbortError || isNetworkError)) {
              console.warn(`[Push Notif Retry] Falha ao salvar subscription (${err.message || err.name}). Tentando novamente em ${delay}ms... (Tentativas restantes: ${retries})`);
              await new Promise(resolve => setTimeout(resolve, delay));
              return saveSubscriptionWithRetry(retries - 1, delay * 3);
            } else {
              console.error('Erro ao salvar push_subscription no Supabase após retentativas:', err);
              return false;
            }
          }
        };

        await saveSubscriptionWithRetry();

        // --- INÍCIO SINCRONIZAÇÃO RBAC & MAPA DE CAIXAS ---
        const syncConfigToSW = async () => {
          if (navigator.serviceWorker.controller) {
            const role = localStorage.getItem('current_user_role') || sessionStorage.getItem('current_user_role');
            const allowedStr = localStorage.getItem('allowed_instances') || sessionStorage.getItem('allowed_instances');
            const isLoggedIn = !!(localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));

            let allowedInstances = [];
            if (allowedStr) {
              try { allowedInstances = JSON.parse(allowedStr); } catch (e) {}
            }

            const notifPrefsStr = localStorage.getItem('user_inbox_notif_prefs_v1') || sessionStorage.getItem('user_inbox_notif_prefs_v1');
            let notifPrefs = {};
            if (notifPrefsStr) {
              try { notifPrefs = JSON.parse(notifPrefsStr); } catch (e) {}
            }

            // Mapa de caixas (instanceId -> { name, phone }) para enriquecer notificações no Service Worker
            const instancesMap: Record<string, { name: string; phone?: string }> = {};
            try {
              const { data: instRows } = await supabase
                .from('whatsapp_instances')
                .select('id, display_name, phone_number')
                .eq('tenant_id', tenantId);
              if (instRows) {
                for (const row of instRows) {
                  if (row.id && row.display_name) {
                    instancesMap[row.id] = { name: row.display_name, phone: row.phone_number || undefined };
                  }
                }
              }
            } catch (e) {}

            navigator.serviceWorker.controller.postMessage({
              type: 'SYNC_USER_CONFIG',
              config: { role, allowedInstances, isLoggedIn, notifPrefs, instancesMap }
            });
          }
        };

        // Sincroniza imediatamente ao carregar e depois a cada 2 minutos
        syncConfigToSW();
        const syncInterval = setInterval(syncConfigToSW, 2 * 60 * 1000);
        // --- FIM SINCRONIZAÇÃO RBAC & MAPA DE CAIXAS ---

        return () => clearInterval(syncInterval);
      } catch (error) {
        console.error('Erro ao inicializar push notifications:', error);
      }
    };

    initPush();
  }, [tenantId]);
}

