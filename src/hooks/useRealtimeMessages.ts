import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useChatStore, MessageType, sortMessagesChronologically } from '../store/chatStore';

export interface UseRealtimeMessagesOptions {
  contactId?: string | null;
  autoScroll?: boolean;
}

export interface UseRealtimeMessagesReturn {
  messages: MessageType[];
  isLoading: boolean;
  realtimeStatus: string;
  activeContact: any;
  sendMessage: (text: string, options?: any) => Promise<any>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  scrollToBottom: (smooth?: boolean) => void;
  unreadCount: number;
}

/**
 * Hook para gerenciar e escutar mensagens de chat em tempo real via Supabase Realtime e ChatStore.
 * Garante ordenação cronológica estrita, auto-scroll e sincronização de status de entrega.
 */
export function useRealtimeMessages(options: UseRealtimeMessagesOptions = {}): UseRealtimeMessagesReturn {
  const { contactId, autoScroll = true } = options;

  const activeChatId = useChatStore((state) => state.activeChatId);
  const contacts = useChatStore((state) => state.contacts);
  const realtimeStatus = useChatStore((state) => state.realtimeStatus);
  const isChannelLoading = useChatStore((state) => state.isChannelLoading);
  const tenantInfo = useChatStore((state) => state.tenantInfo);
  const subscribeToNewMessages = useChatStore((state) => state.subscribeToNewMessages);
  const sendMessageStore = useChatStore((state) => state.sendMessage);

  const targetId = contactId !== undefined ? contactId : activeChatId;

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Inicializa e mantém a subscrição de Realtime ativa com guarda defensiva de tenantId
  useEffect(() => {
    const tenantId = tenantInfo?.id || (typeof window !== 'undefined' ? (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) : null);
    if (tenantId && tenantId !== 'undefined' && tenantId !== 'null' && tenantId.trim()) {
      subscribeToNewMessages();
    }
  }, [subscribeToNewMessages, tenantInfo?.id]);

  // Localiza o contato ativo no estado global
  const activeContact = useMemo(() => {
    if (!targetId) return null;
    return contacts.find((c) => c.id === targetId) || null;
  }, [contacts, targetId]);

  // Mensagens ordenadas cronologicamente
  const messages = useMemo(() => {
    if (!activeContact || !activeContact.messages) return [];
    return sortMessagesChronologically(activeContact.messages);
  }, [activeContact]);

  const unreadCount = activeContact?.unread || 0;

  // Função para rolar até a última mensagem
  const scrollToBottom = useCallback((smooth: boolean = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end',
      });
    }
  }, []);

  // Auto-scroll ao receber novas mensagens
  useEffect(() => {
    if (autoScroll && messages.length > 0) {
      scrollToBottom(false);
    }
  }, [messages.length, autoScroll, scrollToBottom]);

  // Wrapper para envio de mensagens com tracking
  const sendMessage = useCallback(
    async (text: string, opts?: any) => {
      if (!targetId || !text.trim()) return;
      const res = await sendMessageStore(targetId, text, opts);
      scrollToBottom(true);
      return res;
    },
    [targetId, sendMessageStore, scrollToBottom]
  );

  return {
    messages,
    isLoading: isChannelLoading,
    realtimeStatus,
    activeContact,
    sendMessage,
    messagesEndRef,
    scrollToBottom,
    unreadCount,
  };
}

export default useRealtimeMessages;
