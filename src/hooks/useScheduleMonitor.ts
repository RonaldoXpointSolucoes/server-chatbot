import { useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';

export function useScheduleMonitor() {
  const notifiedSet = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Roda a cada 1 minuto (60000 ms)
    const interval = setInterval(() => {
      const state = useChatStore.getState();
      const contacts = state.contacts;
      const now = new Date().getTime();

      contacts.forEach(async (c) => {
        if (c.conv_status === 'snoozed' && c.snoozed_until) {
          const snoozeTime = new Date(c.snoozed_until).getTime();
          
          // Reabrir conversa
          if (now >= snoozeTime) {
            console.log(`[Schedule] Reabrindo conversa do contato: ${c.name}`);
            
            // Remove do Set de notificados
            notifiedSet.current.delete(c.id);

            // Reabrir
            await state.updateConversationField(c.id, { 
              status: 'open', 
              snoozed_until: null 
            });

            // Dispara um som/alerta no browser (Opcional, apenas visual via API de Notification)
            if (Notification.permission === 'granted') {
              new Notification('Atendimento Agendado', {
                body: `A conversa com ${c.name || c.phone} foi reaberta agora.`,
                icon: c.avatar
              });
            }

            // Injeta uma mensagem de sistema no histórico da conversa (simulado no frontend, ou via DB dependendo de como messages funciona)
            // Se o chatStore tiver addSystemMessage ou similar... Vamos improvisar:
            // Isso irá disparar se a pessoa estiver na janela, ou ela vai ver ao entrar. 
            // Para ser robusto, é melhor usar o window.alert ou a própria lista do chatDashboard.
          } 
          // Notificar 15 minutos antes (Janela de 15 a 14 mins)
          else if (snoozeTime - now <= 15 * 60 * 1000 && snoozeTime - now > 14 * 60 * 1000) {
            if (!notifiedSet.current.has(c.id)) {
              console.log(`[Schedule] Alerta 15 minutos: ${c.name}`);
              notifiedSet.current.add(c.id);
              
              if (Notification.permission === 'granted') {
                new Notification('Retorno em Breve', {
                  body: `O retorno agendado com ${c.name || c.phone} ocorrerá em 15 minutos.`,
                  icon: c.avatar
                });
              } else {
                 // Fallback para alerta no navegador
                 // toast(`Retorno agendado com ${c.name || c.phone} em 15 minutos.`);
              }
            }
          }
        }
      });

    }, 60000);

    // Pedir permissão de notificação se não tiver
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Roda uma vez na montagem também para pegar atrasados
    setTimeout(() => {
      const state = useChatStore.getState();
      const now = new Date().getTime();
      state.contacts.forEach(async (c) => {
        if (c.conv_status === 'snoozed' && c.snoozed_until && now >= new Date(c.snoozed_until).getTime()) {
           await state.updateConversationField(c.id, { status: 'open', snoozed_until: null });
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);
}
