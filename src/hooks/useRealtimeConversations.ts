import { useEffect, useMemo, useCallback } from 'react';
import { useChatStore, ContactType, getEffectiveContactTime } from '../store/chatStore';

export interface UseRealtimeConversationsOptions {
  statusFilter?: 'all' | 'open' | 'bot' | 'snoozed' | 'resolved' | 'closed';
  searchQuery?: string;
  inboxFilter?: string | null;
}

export interface UseRealtimeConversationsReturn {
  conversations: ContactType[];
  totalConversations: number;
  totalUnread: number;
  activeChatId: string | null;
  realtimeStatus: string;
  isLoading: boolean;
  selectConversation: (id: string | null) => void;
  markAsRead: (id: string) => Promise<void>;
  refreshConversations: () => Promise<void>;
}

/**
 * Hook para gerenciar e escutar a lista de conversas/contatos em tempo real via Supabase Realtime e ChatStore.
 * Atualiza automaticamente a ordem com base no timestamp da última mensagem e reflete contadores de não lidas instantaneamente.
 */
export function useRealtimeConversations(
  options: UseRealtimeConversationsOptions = {}
): UseRealtimeConversationsReturn {
  const { statusFilter = 'all', searchQuery = '', inboxFilter } = options;

  const contacts = useChatStore((state) => state.contacts);
  const activeChatId = useChatStore((state) => state.activeChatId);
  const realtimeStatus = useChatStore((state) => state.realtimeStatus);
  const isChannelLoading = useChatStore((state) => state.isChannelLoading);
  const activeChannelFilter = useChatStore((state) => state.activeChannelFilter);
  const tenantInfo = useChatStore((state) => state.tenantInfo);
  const subscribeToNewMessages = useChatStore((state) => state.subscribeToNewMessages);
  const setActiveChatId = useChatStore((state) => state.setActiveChatId);
  const markAsReadStore = useChatStore((state) => state.markAsRead);
  const fetchContacts = useChatStore((state) => state.fetchContacts);

  // Inicializa a subscrição de Realtime apenas quando o tenantId estiver presente
  useEffect(() => {
    const tenantId = tenantInfo?.id || (typeof window !== 'undefined' ? (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) : null);
    if (tenantId && tenantId !== 'undefined' && tenantId !== 'null' && tenantId.trim()) {
      subscribeToNewMessages();
    }
  }, [subscribeToNewMessages, tenantInfo?.id]);

  const effectiveInbox = inboxFilter !== undefined ? inboxFilter : activeChannelFilter;

  // Filtra e ordena as conversas
  const conversations = useMemo(() => {
    let list = [...contacts];

    // Filtro por Caixa / Instância
    if (effectiveInbox && effectiveInbox !== 'all' && effectiveInbox !== 'default') {
      list = list.filter(
        (c) => c.instance_id === effectiveInbox || c.id?.includes(effectiveInbox)
      );
    }

    // Filtro por Status
    if (statusFilter !== 'all') {
      list = list.filter((c) => {
        const st = c.conv_status || 'open';
        return st === statusFilter;
      });
    }

    // Filtro por Busca de Texto (nome, telefone, tags)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((c) => {
        const nameMatch = c.name?.toLowerCase().includes(q) || c.custom_name?.toLowerCase().includes(q);
        const phoneMatch = c.phone?.replace(/\D/g, '').includes(q.replace(/\D/g, ''));
        return nameMatch || phoneMatch;
      });
    }

    // Ordenação estrita por atividade mais recente
    return list.sort((a, b) => getEffectiveContactTime(b) - getEffectiveContactTime(a));
  }, [contacts, effectiveInbox, statusFilter, searchQuery]);

  // Total de mensagens não lidas
  const totalUnread = useMemo(() => {
    return contacts.reduce((sum, c) => sum + (c.unread || 0), 0);
  }, [contacts]);

  const selectConversation = useCallback(
    (id: string | null) => {
      setActiveChatId(id);
      if (id) {
        markAsReadStore(id);
      }
    },
    [setActiveChatId, markAsReadStore]
  );

  const markAsRead = useCallback(
    async (id: string) => {
      await markAsReadStore(id);
    },
    [markAsReadStore]
  );

  const refreshConversations = useCallback(async () => {
    await fetchContacts();
  }, [fetchContacts]);

  return {
    conversations,
    totalConversations: conversations.length,
    totalUnread,
    activeChatId,
    realtimeStatus,
    isLoading: isChannelLoading,
    selectConversation,
    markAsRead,
    refreshConversations,
  };
}

export default useRealtimeConversations;
