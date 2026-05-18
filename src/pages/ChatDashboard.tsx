import React, { useState, useEffect, useRef } from 'react';
import { Bot, Settings, Users, Search, MoreVertical, Send, Check, CheckCheck, Smartphone, Power, Building2, Paperclip, Mic, FileText, Camera, Video, VideoOff, Image as ImageIcon, Pin, MessageSquarePlus, Star, Plus, Filter, Tag, Terminal, RefreshCw, History, BrainCircuit, ChevronDown, ChevronLeft, MapPin, User, Menu, Sparkles, Wand2, HeartHandshake, ShoppingBag, LifeBuoy, X, CheckCircle2, ExternalLink, ShieldAlert, Trash2, MessageCircle, Copy, Loader2, Ban, UserCheck, MessageSquareReply } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { DeleteModal, RenameModal, NewChatModal, BlockModal, ContactLabelsModal, ForwardMessageModal, SnoozeModal, AssociatedCompaniesModal } from '../components/ChatModals';
import ImageEditorModal from '../components/ImageEditorModal';
import { SettingsModal } from '../components/SettingsModal';
import { AgentSettingsModal } from '../components/AgentSettingsModal';
import { ChatOmniMenu } from '../components/ChatOmniMenu';
import { MainSidebar } from '../components/MainSidebar';
import { GeminiEditorModal } from '../components/GeminiEditorModal';
import ThemeToggle from '../components/ThemeToggle';
import { useDevStore } from '../store/devStore';
import { format, isToday, isYesterday } from 'date-fns';
import { Flag, Clock, Mail, MailOpen, CircleDollarSign, Edit2 } from 'lucide-react'; // Adicionado lucide pro flag
import { useShallow } from 'zustand/react/shallow';
import { MessageBubble } from '../components/chat/MessageBubble';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from '../services/supabase';
import { geminiService } from '../services/geminiService';
import { useScheduleMonitor } from '../hooks/useScheduleMonitor';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function getContactDisplayName(name: string | undefined | null, pushName: string | undefined | null, phone: string | undefined | null): string {
  let finalName = name || pushName;
  if (!finalName) return formatPhoneNumber(phone) || phone || '';
  return finalName;
}

export function formatPhoneNumber(phone: string | undefined | null): string {
  if (!phone) return '';
  // Cortar JID sulfix
  let cleaned = phone.split('@')[0];
  if (/[a-zA-Z]/.test(cleaned)) return cleaned;
  
  const cleanPhone = cleaned.replace(/\D/g, '');
  
  if (cleanPhone.startsWith('55') && (cleanPhone.length === 12 || cleanPhone.length === 13)) {
    const ddd = cleanPhone.substring(2, 4);
    const num = cleanPhone.substring(4);
    if (num.length === 9) {
      return `(${ddd}) ${num.substring(0, 5)}-${num.substring(5)}`;
    } else if (num.length === 8) {
      return `(${ddd}) ${num.substring(0, 4)}-${num.substring(4)}`;
    }
  } else if (cleanPhone.length === 10 || cleanPhone.length === 11) {
    const ddd = cleanPhone.substring(0, 2);
    const num = cleanPhone.substring(2);
    if (num.length === 9) {
      return `(${ddd}) ${num.substring(0, 5)}-${num.substring(5)}`;
    } else if (num.length === 8) {
      return `(${ddd}) ${num.substring(0, 4)}-${num.substring(4)}`;
    }
  }
  return cleaned;
}

export function renderMessageText(text: string) {
  if (!text) return null;
  
  // Detecção de mensagem citada na string (padrão de envio)
  const quoteMatch = text.match(/^> \*Mensagem Citada:\* "(.*?)"\n\n([\s\S]*)$/);
  
  if (quoteMatch) {
    const quotedText = quoteMatch[1];
    const actualMessage = quoteMatch[2];
    
    return (
      <div className="flex flex-col gap-1.5 w-full">
        <div 
          className="relative pl-3 pr-2 py-2 mb-0.5 bg-black/5 dark:bg-black/20 border-l-4 border-emerald-500 rounded-lg text-[0.85rem] text-[#54656f] dark:text-[#8696a0] whitespace-normal overflow-hidden max-w-full cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            if (quotedText) {
              const messageElements = document.querySelectorAll('.message-item-container');
              const targetElement = Array.from(messageElements).find(el => el.textContent?.includes(quotedText)) as HTMLElement;
              if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetElement.classList.add('bg-black/5', 'dark:bg-white/5', 'transition-colors', 'duration-500', 'rounded-xl');
                setTimeout(() => {
                  targetElement.classList.remove('bg-black/5', 'dark:bg-white/5');
                }, 1500);
              }
            }
          }}
        >
           <div className="font-bold text-emerald-600 dark:text-emerald-400 text-xs mb-1 opacity-90 drop-shadow-sm flex items-center gap-1">Mensagem Citada</div>
           <div className="line-clamp-3 italic opacity-90">{quotedText}</div>
        </div>
        <div>
           {renderMessageText(actualMessage)}
        </div>
      </div>
    );
  }

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a 
          key={i} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-[#00a884] dark:text-[#53bdeb] hover:underline font-semibold inline-flex items-center gap-0.5 align-middle mx-1 group"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="truncate block" style={{ maxWidth: 'min(100%, 250px)' }}>{part.replace(/^https?:\/\//, '')}</span>
          <ExternalLink size={12} className="inline opacity-80 shrink-0 group-hover:scale-110 transition-transform" />
        </a>
      );
    }
    
    // Tratamento para quebras de linha e formatação WhatsApp (apenas negrito básico para strings limpas)
    const lines = part.split('\n');
    return (
      <React.Fragment key={i}>
        {lines.map((line, j) => {
            const boldParts = line.split(/(\*[^*\n]+\*)/g);
            return (
              <React.Fragment key={j}>
                 {boldParts.map((bp, k) => {
                    if (bp.startsWith('*') && bp.endsWith('*') && bp.length > 2) {
                      return <strong key={k} className="font-bold tracking-tight text-inherit">{bp.substring(1, bp.length - 1)}</strong>;
                    }
                    return bp;
                 })}
                 {j < lines.length - 1 && <br />}
              </React.Fragment>
            );
        })}
      </React.Fragment>
    );
  });
}

export default function ChatDashboard() {
  const navigate = useNavigate();
  const tenantName = (localStorage.getItem('current_tenant_name') || sessionStorage.getItem('current_tenant_name'));
  const currentUserRole = typeof window !== 'undefined' ? (localStorage.getItem('current_user_role') || sessionStorage.getItem('current_user_role')) || 'admin' : 'admin';
  const { isEnabled: isDevLoggerEnabled } = useDevStore();
  // Monitor de agendamentos
  useScheduleMonitor();
  const [copiedDoc, setCopiedDoc] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [associatedCompaniesOpen, setAssociatedCompaniesOpen] = useState(false);
  const [allCompanies, setAllCompanies] = useState<any[]>([]);

  useEffect(() => {
    const fetchCompanies = async () => {
      const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      if (!tenantId) return;
      try {
        const { supabase } = await import('../services/supabase');
        const { data } = await supabase.from('contacts').select('id, name, fantasy_name, document_number').eq('tenant_id', tenantId).eq('document_type', 'cnpj');
        if (data) setAllCompanies(data);
      } catch (e) {}
    };
    fetchCompanies();
  }, []);

  const {  
    contacts, 
    activeChatId, 
    evolutionConnected, 
    connectedInstanceName,
    appVersion,
    setActiveChat, 
    sendHumanMessage, 
    forwardMessage,
    setBotStatus,
    fetchInitialData,
    fetchTenantConfig,
    subscribeToNewMessages,
    loadHistoricalMessages,
    fetchTenantAgents,
    modalReason,
    setModalReason,
    tenantInfo,
    agents,
    updateContactCRM,
    deleteContact,
    isSyncingHistory,
    markAllAsRead,
    toggleUnread,
    togglePinContact,
    toggleFavorite,
    toggleBlockContact,
    sendMediaFromUrl,
    uploadAndSendMedia,
    activeChannelFilter,
    setActiveChannelFilter,
    activeChannelName,
    fetchAutomations,
    searchGlobalContacts,
    isSearchingGlobally,
    filterType,
    setFilterType,
    resolveConversation,
    editHumanMessage,
    deleteHumanMessage,
    instancesStatus,
    setInstanceStatus
  } = useChatStore(useShallow(state => ({
    contacts: state.contacts, 
    activeChatId: state.activeChatId, 
    evolutionConnected: state.evolutionConnected, 
    connectedInstanceName: state.connectedInstanceName,
    appVersion: state.appVersion,
    setActiveChat: state.setActiveChat, 
    sendHumanMessage: state.sendHumanMessage, 
    forwardMessage: state.forwardMessage,
    setBotStatus: state.setBotStatus,
    fetchInitialData: state.fetchInitialData,
    fetchTenantConfig: state.fetchTenantConfig,
    subscribeToNewMessages: state.subscribeToNewMessages,
    loadHistoricalMessages: state.loadHistoricalMessages,
    fetchTenantAgents: state.fetchTenantAgents,
    modalReason: state.modalReason,
    setModalReason: state.setModalReason,
    tenantInfo: state.tenantInfo,
    agents: state.agents,
    updateContactCRM: state.updateContactCRM,
    deleteContact: state.deleteContact,
    isSyncingHistory: state.isSyncingHistory,
    markAllAsRead: state.markAllAsRead,
    toggleUnread: state.toggleUnread,
    togglePinContact: state.togglePinContact,
    toggleFavorite: state.toggleFavorite,
    toggleBlockContact: state.toggleBlockContact,
    sendMediaFromUrl: state.sendMediaFromUrl,
    uploadAndSendMedia: state.uploadAndSendMedia,
    activeChannelFilter: state.activeChannelFilter,
    setActiveChannelFilter: state.setActiveChannelFilter,
    activeChannelName: state.activeChannelName,
    fetchAutomations: state.fetchAutomations,
    searchGlobalContacts: state.searchGlobalContacts,
    isSearchingGlobally: state.isSearchingGlobally,
    filterType: state.filterType,
    setFilterType: state.setFilterType,
    resolveConversation: state.resolveConversation,
    editHumanMessage: state.editHumanMessage,
    deleteHumanMessage: state.deleteHumanMessage,
    instancesStatus: state.instancesStatus,
    setInstanceStatus: state.setInstanceStatus
  })));

  const [editingMessage, setEditingMessage] = useState<{ id: string, text: string } | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);

  // Execucao Incial Reativa
  // Efect removido (duplicado com o useEffect consolidado mais abaixo)
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAgentSettingsOpen, setIsAgentSettingsOpen] = useState(false);
  const isModalOpen = !!modalReason || isSettingsOpen || isAgentSettingsOpen;
  const [inputText, setInputText] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [quickReplyFilter, setQuickReplyFilter] = useState('');
  const quickReplies = useChatStore(state => state.quickReplies);
  const [replyMessage, setReplyMessage] = useState<{ id: string, text: string, sender: string } | null>(null);
  const [pastedImage, setPastedImage] = useState<File | null>(null);
  const [pastedImagePreview, setPastedImagePreview] = useState<string | null>(null);
  const [pastedImageCaption, setPastedImageCaption] = useState('');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // Lógica de rascunhos por chat
  const draftsRef = useRef<Record<string, string>>({});
  const prevActiveChatId = useRef<string | null>(null);
  const currentInputText = useRef(inputText);
  
  useEffect(() => {
    currentInputText.current = inputText;
  }, [inputText]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auto-resize do textarea sincronizado com o state inputText
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 20), 250)}px`;
    }
  }, [inputText]);

  // Estados dos novos menus fluídos
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [contactToEdit, setContactToEdit] = useState<any | null>(null);
  const [contactToDelete, setContactToDelete] = useState<{id: string; name: string} | null>(null);
  const [contactToBlock, setContactToBlock] = useState<{id: string; name: string; isBlocked: boolean} | null>(null);
  const [contactForLabels, setContactForLabels] = useState<any | null>(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [showSnoozeModal, setShowSnoozeModal] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [activeChatDropdown, setActiveChatDropdown] = useState(false);
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
  const [activeMsgDropdown, setActiveMsgDropdown] = useState<string | null>(null);
  const [messageToForward, setMessageToForward] = useState<any | null>(null);
  const { showMainSidebar, setShowMainSidebar } = (useOutletContext() as { showMainSidebar: boolean, setShowMainSidebar: (v: boolean) => void }) || { showMainSidebar: true, setShowMainSidebar: () => {} };
  
  // Estados para Resizer da Sidebar
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isDragging, setIsDragging] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left || 0;
      const newWidth = Math.max(280, Math.min(e.clientX - sidebarLeft, window.innerWidth * 0.5, 600));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  // Gemini AI States
  const [isGeminiPopoverOpen, setIsGeminiPopoverOpen] = useState(false);
  const [isGeminiProcessing, setIsGeminiProcessing] = useState(false);
  const [transcribingIds, setTranscribingIds] = useState<Record<string, boolean>>({});
  const [geminiSuggestion, setGeminiSuggestion] = useState<string | null>(null);
  const [aiSuggestionsList, setAiSuggestionsList] = useState<string[]>([]);
  const [geminiModalState, setGeminiModalState] = useState<{
    isOpen: boolean;
    originalText: string;
    suggestedText: string;
    intent: 'grammar' | 'sales' | 'enchant' | 'support' | 'analyze' | null;
  }>({
    isOpen: false,
    originalText: '',
    suggestedText: '',
    intent: null
  });

  // Estados para Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterContextMenu, setFilterContextMenu] = useState<{ type: string, x: number, y: number } | null>(null);
  const [instanceNamesMap, setInstanceNamesMap] = useState<Record<string, string>>({});
  const [instanceColorsMap, setInstanceColorsMap] = useState<Record<string, string>>({});
  const [availableInstancesList, setAvailableInstancesList] = useState<{id: string, display_name: string, color: string}[]>([]);

  // Estados de Paginação Local Virtual
  const [contactPageLimit, setContactPageLimit] = useState(20);
  const contactListRef = useRef<HTMLDivElement>(null);

  const handleContactScroll = () => {
    if (!contactListRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = contactListRef.current;
    if (scrollHeight - scrollTop - clientHeight < 150) {
      setContactPageLimit(prev => prev + 20);
    }
  };

  // Debounce para Busca Global
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchTerm && searchTerm.trim().length >= 3) {
         searchGlobalContacts(searchTerm);
      }
    }, 600);
    return () => clearTimeout(handler);
  }, [searchTerm, searchGlobalContacts]);
  
  useEffect(() => {
    const closeCb = () => {
       setFilterContextMenu(null);
       setActiveMsgDropdown(null);
       setActiveDropdown(null);
    };
    window.addEventListener('click', closeCb);
    return () => window.removeEventListener('click', closeCb);
  }, []);

  const activeChat = contacts.find(c => c.id === activeChatId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const prevMessagesLength = useRef(0);

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    // Considera "no fim" se estiver a menos de 150px do final
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
    setShowScrollButton(!isAtBottom);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (!messagesContainerRef.current) return;
    if (behavior === 'auto') {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    } else {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // Scroll inicial e quando muda de chat
  useEffect(() => {
    if (activeChatId) {
      setShowScrollButton(false);
      prevMessagesLength.current = activeChat?.messages?.length || 0;
      
      const doScroll = () => scrollToBottom('auto');
      
      // Cascata de tentativas para empurrar pro final caso o DOM e imagens atrasem
      doScroll();
      requestAnimationFrame(doScroll);
      const timeouts = [50, 150, 300, 600].map(ms => setTimeout(doScroll, ms));
      
      return () => timeouts.forEach(clearTimeout);
    }
  }, [activeChatId]);

  // Restaura e salva rascunhos ao trocar de chat
  useEffect(() => {
    if (prevActiveChatId.current !== activeChatId) {
      if (prevActiveChatId.current) {
        draftsRef.current[prevActiveChatId.current] = currentInputText.current;
      }
      if (activeChatId) {
        setInputText(draftsRef.current[activeChatId] || '');
      } else {
        setInputText('');
      }
      prevActiveChatId.current = activeChatId || null;
    }
  }, [activeChatId]);

  // Smart Auto-Scroll para novas mensagens
  useEffect(() => {
    const currentMessagesLength = activeChat?.messages?.length || 0;
    const diff = currentMessagesLength - prevMessagesLength.current;
    
    if (diff > 0) {
      const lastMsg = activeChat?.messages?.[currentMessagesLength - 1];
      const isMe = lastMsg && (lastMsg.sender === 'human' || lastMsg.sender === 'bot');
      
      if (!showScrollButton || isMe) {
        // Usa rolagem instantÇ｢nea ('auto') se vierem múltiplas mensagens de uma vez (ex: carregamento do histórico)
        // Usa 'smooth' apenas para novas mensagens recebidas 1 a 1
        const behavior = diff > 1 ? 'auto' : 'smooth';
        scrollToBottom(behavior);
        
        // Fallbacks para garantir que caia na última linha mesmo que as imagens demorem a renderizar
        if (diff > 1) {
           setTimeout(() => scrollToBottom('auto'), 150);
           setTimeout(() => scrollToBottom('auto'), 500);
        }
      }
    }
    prevMessagesLength.current = currentMessagesLength;
  }, [activeChat?.messages, showScrollButton]);


  useEffect(() => {
    (async () => {
      await fetchTenantConfig();
      await fetchInitialData();
      await fetchTenantAgents();
      
      // Chama subscriber *depois* do tenant carregado
      subscribeToNewMessages();
    })();

    supabase.from('whatsapp_instances').select('id, display_name, color, status').then(({data}) => {
      if (data) {
        const nameMap: Record<string, string> = {};
        const colorMap: Record<string, string> = {};
        
        const allowedStr = sessionStorage.getItem('allowed_instances') || localStorage.getItem('allowed_instances');
        let allowedInstances: string[] = [];
        if (allowedStr) {
           try { allowedInstances = JSON.parse(allowedStr); } catch(e) {}
        }
        
        const availableInstances = data.filter(d => {
           if (allowedInstances.length > 0 && !allowedInstances.includes(d.id)) return false;
           return true;
        });

        data.forEach(d => { 
           nameMap[d.id] = d.display_name; 
           if(d.color) colorMap[d.id] = d.color;
           setInstanceStatus(d.id, d.status);
        });
        
        setInstanceNamesMap(nameMap);
        setInstanceColorsMap(colorMap);
        setAvailableInstancesList(availableInstances);
      }
    });
  }, []);

  // Solução PWA: Atualiza os dados (contatos e mensagens) e força reconexão Realtime quando o app volta de background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[PWA Sync] App no foreground, sincronizando...');
        fetchInitialData();
        subscribeToNewMessages(); // Restabelece/Reconecta canal realtime
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [fetchInitialData, subscribeToNewMessages]);

  // Carrega mensagens do Evolution ao clicar num chat novo
  useEffect(() => {
     if (activeChatId && activeChat && evolutionConnected) {
       const properTargetInstance = activeChannelFilter || activeChat?.instance_id || connectedInstanceName;
       if (properTargetInstance) {
          loadHistoricalMessages(activeChatId, properTargetInstance);
       }
     }
  }, [activeChatId, activeChat?.instance_id, connectedInstanceName, evolutionConnected, loadHistoricalMessages]);

  // Solução para o botão voltar nativo do Android (Mobile)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = useChatStore.getState();
      if (state.activeChatId) {
        // Se tem chat aberto, fecha o chat em vez de fechar o app
        state.setActiveChat(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (activeChatId && window.innerWidth <= 768) {
      // Quando abre o chat no mobile, empilha um estado
      if (!window.history.state?.chatOpen) {
        window.history.pushState({ chatOpen: true }, '');
      }
    }
  }, [activeChatId]);


  const handleOpenVCardContact = (vcardWaid: string | undefined, contactName: string) => {
    if (!vcardWaid) {
      alert('Número de telefone não encontrado no vCard.');
      return;
    }
    const cleanWaid = vcardWaid.replace(/[^0-9]/g, '');
    const jid = `${cleanWaid}@s.whatsapp.net`;
    const existing = contacts.find(c => c.whatsapp_jid === jid || c.phone === cleanWaid);
    
    if (existing) {
      setActiveChatId(existing.id);
    } else {
      const tempId = `temp_${Date.now()}`;
      useChatStore.getState().upsertContactLocally({
        id: tempId,
        phone: cleanWaid,
        whatsapp_jid: jid,
        name: contactName || 'Contato vCard',
        unread: 0,
        messages: [],
        timestamp: Date.now()
      } as any);
      setActiveChatId(tempId);
    }

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 150);
  };

  const handleSendHuman = (e: React.FormEvent) => {
    e.preventDefault();
    const properTargetInstance = activeChannelFilter || activeChat?.instance_id || connectedInstanceName;
    console.log("[handleSendHuman] Attempting to send. Values:", { inputText, activeChatId, activeChatInstance: activeChat?.instance_id, connectedInstanceName, properTargetInstance });
    
    if (!inputText.trim() || !activeChatId || !properTargetInstance) {
       console.warn("[handleSendHuman] Blocked! One of the required values is missing.");
       return;
    }
    
    // Se a instÇ｢ncia estiver offline, alerta e não envia
    if (instancesStatus[properTargetInstance] && instancesStatus[properTargetInstance] !== 'connected') {
       alert('Inst穗cia offline. Conecte-a para enviar mensagens.');
       return;
    }
    
    // Se a instÇ｢ncia estiver offline, alerta e não envia
    if (instancesStatus[properTargetInstance] && instancesStatus[properTargetInstance] !== 'connected') {
       alert('Inst穗cia offline. Conecte-a para enviar mensagens.');
       return;
    }
    
    let finalMessageText = inputText;
    if (replyMessage) {
        const shortQuote = replyMessage.text.length > 80 ? replyMessage.text.substring(0, 80) + '...' : replyMessage.text;
        finalMessageText = `> *Mensagem Citada:* "${shortQuote}"\n\n${inputText}`;
    }

    // ATENÇグ: Numa versão final multi-tenant o instanceName deve vir do Login.
    sendHumanMessage(activeChatId, finalMessageText, properTargetInstance as string);
    setInputText('');
    setReplyMessage(null);
    if (activeChatId) draftsRef.current[activeChatId] = '';
    
    if (textareaRef.current) {
       textareaRef.current.style.height = 'auto';
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const properTargetInstance = activeChannelFilter || activeChat?.instance_id || connectedInstanceName;
    if (!file || !activeChatId || !properTargetInstance) return;
    
    let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('video/')) mediaType = 'video';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';

    await useChatStore.getState().uploadAndSendMedia(activeChatId, file, mediaType, properTargetInstance as string);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMicClick = async () => {
    const properTargetInstance = activeChannelFilter || activeChat?.instance_id || connectedInstanceName;
    if (!activeChatId || !properTargetInstance) return;

    if (isRecording) {
       // Stop recording
       if (mediaRecorderRef.current) {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
       }
       setIsRecording(false);
    } else {
       // Start recording
       try {
         const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
         const mediaRecorder = new MediaRecorder(stream);
         mediaRecorderRef.current = mediaRecorder;
         audioChunksRef.current = [];

         mediaRecorder.ondataavailable = e => audioChunksRef.current.push(e.data);
         mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const fileName = `audio_record_${Date.now()}.webm`;
            const file = new File([audioBlob], fileName, { type: 'audio/webm' });
            await useChatStore.getState().uploadAndSendMedia(activeChatId, file, 'audio', properTargetInstance as string, true);
         };

         mediaRecorder.start();
         setIsRecording(true);
       } catch (e) {
         alert("Permissão de microfone negada ou não suportada no seu navegador.");
       }
    }
  };

  const handleGeminiAction = async (type: 'grammar' | 'sales' | 'enchant' | 'support' | 'analyze') => {
    if (!activeChat) return;
    if (type !== 'analyze' && !inputText.trim()) return;

    setIsGeminiProcessing(true);
    try {
      const history = activeChat.messages
        ? activeChat.messages.map(m => ({ 
            role: m.sender === 'bot' ? 'IA' : m.sender === 'human' ? 'Atendente' : 'Cliente', 
            text: m.text || '' 
          }))
        : [];
      
      const suggestion = await geminiService.enhanceMessage(type === 'analyze' ? '' : inputText, type, history);
      
      setGeminiModalState({
        isOpen: true,
        originalText: type === 'analyze' ? 'Análise interna da conversa atual. Esta mensagem não será enviada.' : inputText,
        suggestedText: suggestion,
        intent: type
      });
    } catch (error: any) {
      alert(error.message || 'Erro ao comunicar com a IA (Verifique a API Key).');
    } finally {
      setIsGeminiProcessing(false);
      setIsGeminiPopoverOpen(false);
    }
  };

  const handleAiReplySuggestion = async (msg: Message) => {
    if (!activeChat) return;
    
    setIsGeminiProcessing(true);
    try {
      const history = activeChat.messages
        ? activeChat.messages.slice(-50).map(m => ({ 
            role: m.sender === 'client' ? 'user' : 'model', 
            text: m.transcription ? m.transcription : (m.text || '') 
          }))
        : [];
        
      const targetText = msg.transcription ? msg.transcription : (msg.text || '');
      const suggestions = await geminiService.suggestReplyWithContext(targetText, history);
      
      setReplyMessage({ id: msg.id, text: targetText || 'Mídia enviada', sender: msg.sender });
      setAiSuggestionsList(suggestions);
    } catch (error: any) {
      alert(error.message || 'Erro ao gerar sugestão de resposta com IA.');
    } finally {
      setIsGeminiProcessing(false);
    }
  };

  const handleTranscribeAudio = async (msgId: string, mediaUrl: string) => {
    if (!mediaUrl || transcribingIds[msgId] || !activeChatId) return;
    setTranscribingIds(s => ({ ...s, [msgId]: true }));
    try {
      await useChatStore.getState().requestTranscription(msgId, mediaUrl);
    } catch (e: any) {
      alert(e.message || "Erro ao transcrever áudio.");
    } finally {
      setTranscribingIds(s => ({ ...s, [msgId]: false }));
    }
  };

  const isContactPinned = (c: any) => {
    if (c.is_pinned) return true;
    const currentBox = activeChannelFilter || c.instance_id || connectedInstanceName;
    return currentBox && c.pinned_instances?.includes(currentBox);
  };

  return (
    <div className="flex w-full h-[100dvh] min-w-0 bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden font-sans relative">
      
      {/* Nossos Novos Modais Premium */}
      <RenameModal 
        isOpen={!!contactToEdit} 
        onClose={() => setContactToEdit(null)} 
        contactData={contactToEdit} 
        onSave={(payload) => {
          if(contactToEdit) updateContactCRM(contactToEdit.id, payload);
        }} 
      />
      
      <DeleteModal 
        isOpen={!!contactToDelete} 
        onClose={() => setContactToDelete(null)} 
        contactName={contactToDelete?.name || ''} 
        onConfirm={() => {
          if(contactToDelete) deleteContact(contactToDelete.id);
        }} 
      />

      <ForwardMessageModal 
        isOpen={!!messageToForward}
        onClose={() => setMessageToForward(null)}
        contacts={contacts}
        onForward={(contactId) => forwardMessage(contactId, messageToForward, activeChat?.instance_id || connectedInstanceName || '')}
        messagePreview={messageToForward?.text ? messageToForward.text.substring(0, 40) + '...' : (messageToForward?.mediaType ? `Mídia: ${messageToForward.mediaType}` : undefined)}
      />

      <SnoozeModal 
        isOpen={!!showSnoozeModal}
        onClose={() => setShowSnoozeModal(null)}
        contactId={showSnoozeModal || ''}
      />

      {activeChat?.company_ids && (
        <AssociatedCompaniesModal
          isOpen={associatedCompaniesOpen}
          onClose={() => setAssociatedCompaniesOpen(false)}
          companies={activeChat.company_ids
            .map((id: string) => allCompanies.find((c: any) => c.id === id))
            .filter(Boolean)}
        />
      )}

      {/* Modal de Preview de Imagem Colada (Agora com Editor de Imagem) */}
      {pastedImage && (
        <ImageEditorModal 
          file={pastedImage}
          onClose={() => {
            setPastedImage(null);
            setPastedImagePreview(null);
            setPastedImageCaption('');
          }}
          onSend={(editedFile, caption) => {
            if (activeChatId) {
              const properTargetInstance = activeChannelFilter || activeChat?.instance_id || connectedInstanceName;
              
              // Fechar imediatamente para percepção instantânea
              setPastedImage(null);
              setPastedImagePreview(null);
              setPastedImageCaption('');
              
              // Fazer o envio async por trás dos panos com o novo suporte a caption
              useChatStore.getState().uploadAndSendMedia(
                activeChatId, 
                editedFile, 
                'image', 
                properTargetInstance as string,
                false,
                caption
              ).catch(console.error);
            }
          }}
        />
      )}

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <AgentSettingsModal isOpen={isAgentSettingsOpen} onClose={() => setIsAgentSettingsOpen(false)} />

      <BlockModal 
        isOpen={!!contactToBlock}
        onClose={() => setContactToBlock(null)}
        contactName={contactToBlock?.name || ''}
        isBlocked={contactToBlock?.isBlocked || false}
        onConfirm={async () => {
          if (contactToBlock?.id) {
            await toggleBlockContact(contactToBlock.id);
          }
        }}
      />

      <ContactLabelsModal
        isOpen={!!contactForLabels}
        onClose={() => setContactForLabels(null)}
        contactId={contactForLabels?.id || ''}
        contactName={contactForLabels?.name || contactForLabels?.phone || ''}
      />

      <NewChatModal 
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        contacts={contacts}
        instances={availableInstancesList}
        defaultInstanceId={activeChannelFilter}
        onStartChat={(contactId, instanceId) => {
          setActiveChat(contactId);
          const properInstance = instanceId || connectedInstanceName;
          if (properInstance) {
            useChatStore.getState().loadHistoricalMessages(contactId, properInstance);
          }
        }}
        onStartNewNumber={async (phone, instanceId) => {
          let cleanPhone = phone.replace(/\D/g, '');
          if (cleanPhone && !cleanPhone.startsWith('55')) {
            cleanPhone = '55' + cleanPhone;
          }
          
          const jid = `${cleanPhone}@s.whatsapp.net`;
          
          let { data: existingContact } = await supabase
            .from('contacts')
            .select('*')
            .eq('tenant_id', tenantInfo?.id)
            .eq('phone', cleanPhone)
            .single();
            
          // Se não existe, criamos um novo
          if (!existingContact) {
            const { data: newContact, error } = await supabase.from('contacts').insert({
              tenant_id: tenantInfo?.id,
              instance_id: instanceId,
              name: cleanPhone,
              phone: cleanPhone,
              whatsapp_jid: jid,
              bot_status: 'active'
            }).select().single();
            
            if (newContact && !error) {
              existingContact = newContact;
            } else {
              console.error('Erro ao criar novo contato na base:', error);
              return;
            }
          }
          
          if (existingContact) {
             // Injeta no estado local se não existir para o ChatDashboard conseguir renderizar
             useChatStore.setState(state => {
               const exists = state.contacts.find(c => c.id === existingContact.id);
               if (exists) return state;
               return { 
                 contacts: [{
                   ...existingContact,
                   instance_id: instanceId,
                   messages: [],
                   unread: 0,
                   custom_name: existingContact.custom_name || existingContact.name,
                 }, ...state.contacts] 
               };
             });

             setActiveChat(existingContact.id);
             const properInstance = instanceId || connectedInstanceName;
             if (properInstance) {
               useChatStore.getState().loadHistoricalMessages(existingContact.id, properInstance);
             }
          }
        }}
      />

      <GeminiEditorModal 
        isOpen={geminiModalState.isOpen}
        onClose={() => setGeminiModalState(prev => ({ ...prev, isOpen: false }))}
        originalText={geminiModalState.originalText}
        suggestedText={geminiModalState.suggestedText}
        intent={geminiModalState.intent}
        onSend={(finalText) => {
           const properTargetInstance = activeChannelFilter || activeChat?.instance_id || connectedInstanceName;
           if (activeChatId && properTargetInstance) {
             sendHumanMessage(activeChatId, finalText, properTargetInstance as string);
             setInputText('');
             if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
             }
           }
        }}
      />

      {/* MainSidebar movido para o MainLayout global */}

      {/* Middle Sidebar (Contacts List) */}
      <div 
        ref={sidebarRef}
        className={cn(
          "w-full border-r border-[#d1d7db] dark:border-[#222d34] flex flex-col bg-white dark:bg-[#111b21] shrink-0",
          !isDragging && "transition-all",
          activeChatId ? "hidden md:flex" : "flex"
        )}
        style={{ width: window.innerWidth >= 768 ? sidebarWidth : '100%', maxWidth: window.innerWidth >= 768 ? sidebarWidth : '100%' }}
        onClick={() => setActiveDropdown(null)} // fecha qq dropdown ao clicar fora
      >
        
        {/* Header Premium da Sidebar */}
        <div className="h-20 bg-white/50 dark:bg-[#202c33]/80 backdrop-blur-xl flex flex-col justify-center px-4 py-2 border-b border-[#d1d7db] dark:border-[#222d34] flex-shrink-0 z-10 shadow-sm relative">
          {/* Versão e badge no header top-left */}
          <span className="absolute top-1 left-4 text-[10px] font-mono text-[#00a884] opacity-80 pointer-events-none whitespace-nowrap tracking-wide">
            {`v${appVersion?.version || import.meta.env.PACKAGE_VERSION || '2.4.6'} | Deploy: ${appVersion?.deploy_date ? new Date(appVersion.deploy_date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : (import.meta.env.PACKAGE_BUILD_DATE ? new Date(import.meta.env.PACKAGE_BUILD_DATE).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '22/05/2026, 17:15')}`}
          </span>
          
          <div className="flex items-center justify-between w-full mt-2">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowMainSidebar(!showMainSidebar)}
                className="flex p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1] transition-colors"
                title={showMainSidebar ? "Ocultar Menu Principal" : "Mostrar Menu Principal"}
              >
                <Menu size={20} />
              </button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#00a884] to-teal-400 flex items-center justify-center text-white font-bold shadow-md ring-2 ring-white dark:ring-[#202c33]">
                RA
              </div>
            </div>
            
            <div className="flex gap-3 text-[#54656f] dark:text-[#aebac1] items-center">
              <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-[#00a884]" onClick={() => setIsNewChatOpen(true)}>
                <MessageSquarePlus size={20} />
              </button>
              
              <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-emerald-500/20 transition-all text-emerald-500" title="Base de Conhecimento RAG" onClick={() => navigate('/knowledge')}>
                <BrainCircuit size={20} />
              </button>
              
              <ThemeToggle />
              
              {/* Menu de Opções Avançadas */}
              <div className="relative">
                <button 
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveDropdown(activeDropdown === 'sidebar-menu' ? null : 'sidebar-menu');
                  }}
                >
                  <MoreVertical size={20} />
                </button>
                {activeDropdown === 'sidebar-menu' && (
                  <div className="absolute right-0 top-12 w-56 bg-white dark:bg-[#233138] rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-[#304046] py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                    <button className="w-full text-left px-5 py-3 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3">
                      <Star size={18} className="text-yellow-500" />
                      <span className="text-[15px] text-[#3b4a54] dark:text-[#d1d7db]">Favoritas</span>
                    </button>
                    <button onClick={() => { navigate('/settings/labels'); setActiveDropdown(null); }} className="w-full text-left px-5 py-3 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3">
                      <Tag size={18} className="text-blue-500" />
                      <span className="text-[15px] text-[#3b4a54] dark:text-[#d1d7db]">Editar Etiquetas</span>
                    </button>
                    <button onClick={() => { markAllAsRead(); setActiveDropdown(null); }} className="w-full text-left px-5 py-3 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3">
                      <CheckCheck size={18} className="text-[#00a884]" />
                      <span className="text-[15px] text-[#3b4a54] dark:text-[#d1d7db]">Marcar todas lidas</span>
                    </button>
                    {isDevLoggerEnabled && (
                      <a href="/swagger/teste.html" target="_blank" rel="noopener noreferrer" className="w-full text-left px-5 py-3 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3 border-t border-gray-100 dark:border-[#304046]">
                        <Terminal size={18} className="text-blue-500" />
                        <span className="text-[15px] text-[#3b4a54] dark:text-[#d1d7db]">Swagger / API Docs</span>
                      </a>
                    )}
                    <button onClick={() => { setIsAgentSettingsOpen(true); setActiveDropdown(null); }} className="w-full text-left px-5 py-3 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3 border-t border-gray-100 dark:border-[#304046]">
                      <User size={18} className="text-emerald-500" />
                      <span className="text-[15px] text-[#3b4a54] dark:text-[#d1d7db]">Perfil do Agente</span>
                    </button>
                    <button onClick={() => { setIsSettingsOpen(true); setActiveDropdown(null); }} className="w-full text-left px-5 py-3 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3">
                      <Settings size={18} />
                      <span className="text-[15px] text-[#3b4a54] dark:text-[#d1d7db]">Configurações</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Alerta de Desconexão (Offline Banner) - Sidebar */}
        {(activeChannelFilter && instancesStatus[activeChannelFilter] !== 'connected') && (
          <div className="bg-orange-50 dark:bg-orange-950/40 border-y border-orange-200 dark:border-orange-900/50 p-3 flex flex-col gap-1 z-20 shadow-sm animate-in fade-in zoom-in-95 duration-300">
             <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 font-bold text-sm">
               <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping absolute"></span>
               <span className="w-2 h-2 rounded-full bg-orange-500 relative"></span>
               Atenção: Instância Offline
             </div>
             <p className="text-xs text-orange-700/80 dark:text-orange-300/80 leading-tight">
                A instância {activeChannelFilter} está offline. Verifique o aparelho ou reconecte.
             </p>
             <button onClick={() => useChatStore.getState().openQRModal(activeChannelFilter)} className="mt-1 text-xs bg-orange-100 dark:bg-orange-900/40 hover:bg-orange-200 dark:hover:bg-orange-800/40 text-orange-700 dark:text-orange-300 py-1.5 px-3 rounded-md font-medium transition-colors w-fit">
                Resolver Agora
             </button>
          </div>
        )}

        {/* Search e Filtros */}
        <div className="flex flex-col border-b border-[#f2f2f2] dark:border-[#222d34] px-3 py-2 gap-3 bg-white dark:bg-[#111b21]">
          <div className="flex items-center gap-2 w-full">
            <div className="flex w-full bg-[#f0f2f5] dark:bg-[#202c33] px-3 py-2 rounded-xl items-center gap-2 group transition-all ring-1 ring-transparent focus-within:ring-[#00a884]/50 shadow-inner">
              {isSearchingGlobally ? (
                  <Loader2 size={18} className="text-[#00a884] animate-spin flex-shrink-0" />
              ) : (
                  <Search size={18} className="text-[#54656f] dark:text-[#aebac1] group-focus-within:text-[#00a884] transition-colors flex-shrink-0" />
              )}
              <input 
                type="text" 
                placeholder="Pesquisar chat ou contato" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-none outline-none text-sm w-full dark:text-[#d1d7db] placeholder:text-[#54656f] dark:placeholder:text-[#aebac1]"
              />
            </div>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={cn("p-2 rounded-full transition-colors flex-shrink-0", showFilters || filterType !== 'all' ? "text-[#00a884] bg-[#00a884]/10" : "text-[#54656f] dark:text-[#aebac1] hover:bg-gray-100 dark:hover:bg-[#202c33]")}
              title="Filtros">
              <Filter size={18} />
            </button>
          </div>
          
          {/* Pills Filters (Glassmorphism inspired) */}
          {showFilters && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide relative select-none animate-in fade-in slide-in-from-top-2 duration-200">
               <button 
                  onContextMenu={(e) => { e.preventDefault(); setFilterContextMenu({ type: 'all', x: e.clientX, y: e.clientY }); }}
                  onClick={() => setFilterType('all')} 
                  className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap", filterType === 'all' ? "bg-[#00a884]/10 text-[#00a884] ring-1 ring-[#00a884]/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
                 Tudo
               </button>
               <button 
                  onContextMenu={(e) => { e.preventDefault(); setFilterContextMenu({ type: 'unread', x: e.clientX, y: e.clientY }); }}
                  onClick={() => setFilterType('unread')} 
                  className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap", filterType === 'unread' ? "bg-[#00a884]/10 text-[#00a884] ring-1 ring-[#00a884]/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
                 Não Lidas
               </button>
               <button 
                  onContextMenu={(e) => { e.preventDefault(); setFilterContextMenu({ type: 'mine', x: e.clientX, y: e.clientY }); }}
                  onClick={() => setFilterType('mine')} 
                  className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1", filterType === 'mine' ? "bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
                 <User size={14} className={filterType === 'mine' ? "text-indigo-600" : ""} /> Minhas
               </button>
               <button 
                  onContextMenu={(e) => { e.preventDefault(); setFilterContextMenu({ type: 'favorite', x: e.clientX, y: e.clientY }); }}
                  onClick={() => setFilterType('favorite')} 
                  className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1", filterType === 'favorite' ? "bg-yellow-500/10 text-yellow-600 ring-1 ring-yellow-500/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
                 <Star size={14} className={filterType === 'favorite' ? "fill-yellow-600" : ""} /> Favoritas
               </button>
               <button 
                  onContextMenu={(e) => { e.preventDefault(); setFilterContextMenu({ type: 'labels', x: e.clientX, y: e.clientY }); }}
                  onClick={() => setFilterType('labels')} 
                  className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1", filterType === 'labels' ? "bg-blue-500/10 text-blue-600 ring-1 ring-blue-500/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
                 <Tag size={14} /> Etiquetas
               </button>
               <button 
                  onContextMenu={(e) => { e.preventDefault(); setFilterContextMenu({ type: 'blocked', x: e.clientX, y: e.clientY }); }}
                  onClick={() => setFilterType('blocked')} 
                  className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1", filterType === 'blocked' ? "bg-red-500/10 text-red-600 ring-1 ring-red-500/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
                 <Ban size={14} className={filterType === 'blocked' ? "text-red-600" : ""} /> Bloqueados
               </button>
            </div>
          )}

          {/* Context Menu flutuante do Filtro */}
          {filterContextMenu && (
            <div 
               className="fixed z-[9999] bg-white dark:bg-[#233138] border border-black/5 dark:border-white/5 rounded-xl shadow-2xl py-1.5 flex flex-col min-w-[220px] animate-in fade-in zoom-in-95 duration-100"
               style={{ top: filterContextMenu.y, left: filterContextMenu.x }}
               onClick={e => e.stopPropagation()}
            >
              {filterContextMenu.type === 'unread' && (
                <button 
                  onClick={async () => {
                     const m = useChatStore.getState().markAllAsRead;
                     if (m) await m();
                     setFilterContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-3 border-b border-black/5 dark:border-white/5 text-sm font-medium text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-3"
                >
                  <CheckCheck size={16} className="text-[#00a884]" /> Marcar todas como lidas
                </button>
              )}
              {filterContextMenu.type === 'favorite' && (
                <button 
                  onClick={async () => {
                     const favs = contacts.filter(c => c.is_favorite);
                     if (favs.length) {
                        try {
                           // Otimista
                           useChatStore.setState((s) => ({
                             contacts: s.contacts.map(c => ({...c, is_favorite: false}))
                           }));
                           const tenant = useChatStore.getState().tenantInfo;
                           if (tenant) {
                              await supabase.from('conversations').update({ is_favorite: false }).eq('tenant_id', tenant.id).eq('is_favorite', true);
                           }
                        } catch(e) {}
                     }
                     setFilterContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-3 border-b border-black/5 dark:border-white/5 text-sm font-medium text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-3"
                >
                  <Star size={16} className="text-gray-400" /> Desfazer todas as favoritas
                </button>
              )}
              {filterContextMenu.type === 'all' && (
                <button 
                  onClick={async () => {
                     const m = useChatStore.getState().markAllAsRead;
                     if (m) await m();
                     setFilterContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-3 border-b border-black/5 dark:border-white/5 text-sm font-medium text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-3"
                >
                  <CheckCheck size={16} className="text-[#00a884]" /> Limpar crachás não lidos
                </button>
              )}
              {filterContextMenu.type === 'labels' && (
                 <div className="px-4 py-3 text-xs text-center text-gray-500 dark:text-gray-400">Sem ações globais para etiquetas ativas.</div>
              )}
            </div>
          )}
        </div>

        {/* Chat List Realtime */}
        <div className="flex-1 overflow-y-auto" ref={contactListRef} onScroll={handleContactScroll}>
          {contacts.length === 0 && (
             <p className="text-xs text-center p-6 text-gray-400">Nenhuma conversa encontrada ou aguardando conexão web-socket...</p>
          )}

          {contacts.filter(c => {
             // 1) RBAC ENFORCEMENT - A REGRA DE OURO (Nunca mostrar conversas que não tenho acesso)
             const roleStr = typeof window !== 'undefined' ? (sessionStorage.getItem('current_user_role') || localStorage.getItem('current_user_role')) : null;
             const isGlobalAdmin = roleStr === 'owner' || roleStr === 'admin';
             
             if (!isGlobalAdmin) {
                 const allowedStr = typeof window !== 'undefined' ? (sessionStorage.getItem('allowed_instances') || localStorage.getItem('allowed_instances')) : null;
                 let allowedInstances: string[] = [];
                 if (allowedStr) {
                     try { allowedInstances = JSON.parse(allowedStr); } catch(e) {}
                 }
                 
                 // Agente sem array de permissões não vê nada.
                 if (allowedStr) {
                     if (allowedInstances.length === 0) return false; // Sem instÇ｢ncias -> Sem acesso

                     const effectiveInstId = c.instance_id || connectedInstanceName; // fallback pra órfãos
                     if (effectiveInstId && !allowedInstances.includes(effectiveInstId)) {
                         return false; // BLOQUEADO!
                     }
                 } else {
                     return false; // BLOQUEADO! Agente logado precisa de permissão clara
                 }
             }

             // 2) FILTRO POR CAIXA ESPECÇ孝ICA (Menu esquerdo)
             if (activeChannelFilter) {
                 const dbInstId = c.instance_id;
                 const effectiveId = connectedInstanceName;

                 if (!dbInstId) {
                     // Fallback conversas antigas órfãs
                     if (effectiveId !== activeChannelFilter && effectiveId !== activeChannelName) return false;
                 } else {
                     // Conversas nativas
                     if (dbInstId !== activeChannelFilter && dbInstId !== activeChannelName) return false;
                 }
             }

             // 3) BUSCA EM TEXTO
             if (searchTerm && !c.name?.toLowerCase().includes(searchTerm.toLowerCase()) && !c.whatsapp_jid?.includes(searchTerm)) {
               return false;
             }
             // Lógica de Contatos Bloqueados
             if (filterType === 'blocked') {
                 if (!c.is_blocked) return false;
             } else {
                 if (c.is_blocked) return false; // Esconde os bloqueados em todas as outras views (All, Unread, Favoritos, etc)
             }

             // Filtros de Pills
             if (filterType === 'unread' && c.unread <= 0 && c.id !== activeChatId) return false;
             if (filterType === 'favorite' && !c.is_favorite) return false;
             if (filterType === 'labels' && !(c.conv_labels && c.conv_labels.length > 0)) return false;
             if (filterType === 'mine') {
                 const currentUserEmail = sessionStorage.getItem('current_user_email') || localStorage.getItem('current_user_email');
                 const currentAgent = agents.find(a => a.email === currentUserEmail);
                 if (!currentAgent || c.assigned_to !== currentAgent.id) return false;
             }
             
             // Filtro de Adiado (Snoozed)
             if (c.conv_status === 'snoozed' && c.snoozed_until) {
                const untilTimestamp = new Date(c.snoozed_until).getTime();
                if (untilTimestamp > Date.now()) {
                   // Esconde se ainda não expirou, a menos que o usuário esteja forçando a pesquisa ativamente
                   if (!searchTerm) return false;
                }
             }

             return true;
          }).sort((a,b) => {
             const aPinned = isContactPinned(a);
             const bPinned = isContactPinned(b);
             if (aPinned && !bPinned) return -1;
             if (!aPinned && bPinned) return 1;
             
             let aLastMsg;
             if (a.messages) {
               for (let i = a.messages.length - 1; i >= 0; i--) {
                 if (!a.messages[i].isIgnoredSilent && !a.messages[i].isIgnored) { aLastMsg = a.messages[i]; break; }
               }
             }

             let bLastMsg;
             if (b.messages) {
               for (let i = b.messages.length - 1; i >= 0; i--) {
                 if (!b.messages[i].isIgnoredSilent && !b.messages[i].isIgnored) { bLastMsg = b.messages[i]; break; }
               }
             }
             
             const aTime = Math.max(a.lastMsgTimestamp || 0, aLastMsg ? new Date(aLastMsg.timestamp).getTime() : 0);
             const bTime = Math.max(b.lastMsgTimestamp || 0, bLastMsg ? new Date(bLastMsg.timestamp).getTime() : 0);
             
             return bTime - aTime;
          }).slice(0, contactPageLimit).map((contact) => {
             const lastMsg = contact.messages?.[contact.messages.length - 1];
             const timeDisplay = lastMsg 
               ? (isToday(lastMsg.timestamp) ? format(lastMsg.timestamp, 'HH:mm') 
                  : isYesterday(lastMsg.timestamp) ? 'Ontem' 
                  : format(lastMsg.timestamp, 'dd/MM/yyyy'))
               : contact.lastMsgTimestamp 
                  ? (isToday(new Date(contact.lastMsgTimestamp)) ? format(new Date(contact.lastMsgTimestamp), 'HH:mm') 
                     : isYesterday(new Date(contact.lastMsgTimestamp)) ? 'Ontem' 
                     : format(new Date(contact.lastMsgTimestamp), 'dd/MM/yyyy'))
                  : '';
                  
             // Verifica se a ultima msg foi mandada por voce testando sender
             const isMe = lastMsg && (lastMsg.sender === 'bot' || lastMsg.sender === 'human');

             return (
              <div 
                key={contact.id}
                onClick={() => {
                  setActiveChat(contact.id);
                  const properTargetInstance = activeChannelFilter || contact.instance_id || connectedInstanceName;
                  if (properTargetInstance) {
                    useChatStore.getState().loadHistoricalMessages(contact.id, properTargetInstance);
                    if (contact.avatar?.includes('ui-avatars')) {
                      useChatStore.getState().fetchContactPicture(contact.id, contact.whatsapp_jid || (contact.phone + '@s.whatsapp.net'), properTargetInstance);
                    }
                  }
                  if (contact.unread > 0) {
                    useChatStore.getState().markAsRead(contact.id);
                  }
                }}
                className={cn(
                  "group flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-[#f2f2f2] dark:border-[#222d34] overflow-visible",
                  activeChatId === contact.id ? "bg-[#f0f2f5] dark:bg-[#2a3942]" : "hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
                )}
              >
                <div className="relative shrink-0">
                  <img 
                      src={contact.avatar} 
                      alt="Avatar" 
                      className="w-12 h-12 rounded-full object-cover shadow-sm hover:scale-105 transition-transform duration-200 cursor-pointer ring-2 ring-transparent hover:ring-[#00a884]/30" 
                      onClick={(e) => { e.stopPropagation(); setFullscreenImage(contact.avatar); }}
                      onError={(e) => {
                        e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(getContactDisplayName(contact.custom_name || contact.name, contact.push_name, contact.phone))}&background=random&color=fff`;
                      }}
                    />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <div className="flex flex-col truncate pr-2">
                       <div className="flex flex-col gap-0.5 w-full">
                         {/* Name and Priority Flags */}
                         <span className="font-medium text-[#111b21] dark:text-[#e9edef] truncate flex items-center gap-1.5">
                           <span className="truncate">{getContactDisplayName(contact.custom_name || contact.name, contact.push_name, contact.phone)}</span>
                           {contact.priority === 'urgent' && <Flag size={12} className="fill-rose-500 text-rose-500 shrink-0" />}
                           {contact.priority === 'high' && <Flag size={12} className="fill-orange-500 text-orange-500 shrink-0" />}
                           {contact.conv_status === 'snoozed' && contact.snoozed_until && new Date(contact.snoozed_until).getTime() > Date.now() && <Clock size={12} className="text-amber-500 shrink-0" />}
                         </span>

                         {/* Labels and Assigned Agent on a new line */}
                         {(contact.assigned_to || (contact.conv_labels && contact.conv_labels.length > 0)) && (
                           <div className="flex items-center gap-1.5 overflow-hidden w-full flex-wrap mt-0.5">
                             {contact.assigned_to && (
                               <span className="shrink-0 px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 border border-indigo-100 dark:border-indigo-500/20 text-[9px] font-bold uppercase rounded flex items-center gap-1">
                                 <User size={9} />
                                 <span className="max-w-[50px] truncate">{agents.find(a => a.id === contact.assigned_to)?.full_name?.split(' ')[0] || 'Ag'}</span>
                               </span>
                             )}
                             {contact.conv_labels && contact.conv_labels.length > 0 && (
                               <div className="flex items-center gap-1 overflow-hidden shrink-0">
                                 {contact.conv_labels.map((l: any, i: number) => {
                                   const isHex = l.color?.startsWith('#');
                                   return (
                                     <span key={i} className={cn("px-1.5 py-0.5 text-[9px] font-bold text-white rounded-full flex items-center max-w-[80px] truncate shadow-sm border border-black/10", !isHex && l.color ? l.color : "bg-blue-500")} style={isHex ? { backgroundColor: l.color } : {}} title={l.name}>
                                       {l.name}
                                     </span>
                                   );
                                 })}
                               </div>
                             )}
                           </div>
                         )}
                       </div>
                       {contact.fantasy_name && (
                         <span className="text-[11px] text-gray-500 dark:text-[#8696a0] truncate flex items-center gap-1">
                           <Building2 size={10} className="shrink-0" />
                           {contact.fantasy_name}
                         </span>
                       )}
                      {!activeChannelFilter && (contact.instance_id ? instanceNamesMap[contact.instance_id] : connectedInstanceName) && (() => {
                          const instColor = contact.instance_id ? instanceColorsMap[contact.instance_id] : undefined;
                          return (
                            <span 
                              className="text-[10px] px-1.5 py-[2px] rounded-md border font-medium truncate mt-1 w-fit max-w-[140px] flex items-center gap-1 shadow-sm transition-all"
                              style={instColor ? { 
                                backgroundColor: `${instColor}15`, 
                                borderColor: `${instColor}30`, 
                                color: instColor 
                              } : {
                                backgroundColor: 'rgba(0,0,0,0.05)',
                                borderColor: 'rgba(0,0,0,0.05)'
                              }}
                            >
                              <Smartphone size={10} className="shrink-0 opacity-80" />
                              <span className="truncate">{contact.instance_id ? instanceNamesMap[contact.instance_id] : connectedInstanceName}</span>
                            </span>
                          );
                      })()}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={cn("text-[11px] font-medium min-w-fit ml-1 flex items-center gap-1", contact.unread > 0 ? "text-[#00a884]" : "text-[#54656f] dark:text-[#8696a0]")}>
                        {isContactPinned(contact) && <Pin size={12} className="text-[#00a884] rotate-45 fill-current opacity-80" />}
                        {timeDisplay}
                      </span>
                      
                      {/* Menu de Ações (Dropdown) */}
                      <div className="relative isolate" onClick={e => e.stopPropagation()}>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDropdown(activeDropdown === contact.id ? null : contact.id);
                          }}
                          className="p-1 text-[#54656f] hover:text-[#111b21] dark:text-[#aebac1] dark:hover:text-[#e9edef] rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <MoreVertical size={16} />
                        </button>
                        
                        {activeDropdown === contact.id && (
                          <div className="absolute right-0 top-6 w-52 bg-white dark:bg-[#233138] border border-black/5 dark:border-white/5 rounded-xl shadow-xl py-2 z-[99] animate-in fade-in zoom-in-95 duration-100">
                            <button 
                              className="w-full text-left px-5 py-3 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3 border-t border-gray-100 dark:border-[#304046]"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                const instanceToPin = activeChannelFilter || contact.instance_id || connectedInstanceName;
                                togglePinContact(contact.id, instanceToPin); 
                                setActiveDropdown(null); 
                              }}
                            >
                              <Pin size={14} className={isContactPinned(contact) ? "rotate-45" : ""} />
                              {isContactPinned(contact) ? "Desafixar conversa" : "Fixar no topo"}
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(contact.id); setActiveDropdown(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-2"
                            >
                              <Star size={14} className={contact.is_favorite ? "text-yellow-500 fill-yellow-500" : "text-gray-400"} />
                              {contact.is_favorite ? "Remover dos favoritos" : "Favoritar"}
                            </button>
                            <button 
                              onClick={async (e) => { 
                                e.stopPropagation(); 
                                const properTargetInstance = activeChannelFilter || contact.instance_id || connectedInstanceName;
                                if (properTargetInstance) {
                                  await useChatStore.getState().loadHistoricalMessages(contact.id, properTargetInstance, true);
                                }
                                setActiveDropdown(null); 
                              }}
                              disabled={isSyncingHistory[contact.id]}
                              className="w-full text-left px-4 py-2 text-sm text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-2"
                            >
                              <History size={14} className={cn(isSyncingHistory[contact.id] ? "animate-spin text-[#00a884]" : "")} />
                              {isSyncingHistory[contact.id] ? "Buscando..." : "Buscar Histórico"}
                            </button>
                            
                            {/* Novos botões inseridos */}
                            <button 
                              onClick={async (e) => { 
                                e.stopPropagation(); 
                                const email = sessionStorage.getItem('current_user_email') || localStorage.getItem('current_user_email');
                                if (email) {
                                  const me = agents.find(a => a.email === email);
                                  if (me) {
                                    await useChatStore.getState().updateConversationField(contact.id, { assigned_to: me.id });
                                  }
                                }
                                setActiveDropdown(null); 
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-2"
                            >
                              <UserCheck size={14} className="text-[#00a884]" /> Atribuir a mim
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); toggleUnread(contact.id, contact.unread); setActiveDropdown(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-2"
                            >
                              {contact.unread > 0 ? (
                                <><MailOpen size={14} className="text-gray-500" /> Marcar como lida</>
                              ) : (
                                <><Mail size={14} className="text-[#00a884]" /> Marcar como não lida</>
                              )}
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setShowSnoozeModal(contact.id); setActiveDropdown(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-2"
                            >
                              <Clock size={14} className="text-amber-500" />
                              Adiar
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setContactForLabels(contact); setActiveDropdown(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-2"
                            >
                              <Tag size={14} className="text-blue-500" />
                              Atribuir etiqueta
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setContactToEdit(contact); setActiveDropdown(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-2"
                            >
                              <User size={14} className="text-gray-500" />
                              Editar contato
                            </button>

                            <div className="h-px w-full bg-gray-100 dark:bg-white/10 my-1" />

                            {currentUserRole === 'admin' && (
                              <>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setContactToBlock({id: contact.id, name: contact.name || contact.phone, isBlocked: !!contact.is_blocked}); setActiveDropdown(null); }}
                                  className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center gap-2"
                                >
                                  <ShieldAlert size={14} />
                                  {contact.is_blocked ? "Desbloquear contato" : "Bloquear contato"}
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setContactToDelete({id: contact.id, name: contact.name || contact.phone}); setActiveDropdown(null); }}
                                  className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center gap-2"
                                >
                                  <Trash2 size={14} />
                                  Apagar conversa
                                </button>
                              </>
                            )}

                            <div className="h-px w-full bg-gray-100 dark:bg-white/10 my-1" />

                            <button 
                              onClick={(e) => { e.stopPropagation(); setActiveDropdown(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors flex items-center gap-2"
                            >
                              <X size={14} />
                              Fechar menu
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex text-[13px] text-[#54656f] dark:text-[#8696a0] truncate mt-0.5 items-center justify-between">
                    <div className="flex items-center gap-1.5 truncate w-full pr-2">
                       {isMe && (
                           lastMsg?.status === 'READ' || lastMsg?.status === 'read' ? <CheckCheck size={14} className="text-[#53bdeb] shrink-0" /> : 
                           lastMsg?.status === 'DELIVERY_ACK' || lastMsg?.status === 'SERVER_ACK' || lastMsg?.status === 'delivered' ? <CheckCheck size={14} className="text-gray-400 shrink-0" /> :
                           <Check size={14} className="text-gray-400 shrink-0" />
                       )}
                       {contact.bot_status === 'paused' ? <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0 mr-1" /> : !isMe && <Bot size={13} className="text-[#00a884] shrink-0" />}
                       
                       {/* Renderiza indicador de midia estilo WhatsApp Web */}
                       {(() => {
                           if (!lastMsg) return <span className="truncate">Nova conversa...</span>;
                           let icon = null;
                           if (lastMsg.mediaType === 'image') icon = <Camera size={13} className="shrink-0 text-gray-500 dark:text-gray-400" />;
                           else if (lastMsg.mediaType === 'video') icon = <Video size={13} className="shrink-0 text-gray-500 dark:text-gray-400" />;
                           else if (lastMsg.mediaType === 'audio') icon = <Mic size={13} className={cn("shrink-0", lastMsg.status === 'READ' && isMe ? "text-[#53bdeb]" : "text-[#00a884]")} />;
                           else if (lastMsg.mediaType === 'document') icon = <FileText size={13} className="shrink-0 text-gray-500 dark:text-gray-400" />;
                           else if (lastMsg.mediaType === 'location') icon = <MapPin size={13} className="shrink-0 text-gray-500 dark:text-gray-400" />;
                           else if (lastMsg.mediaType === 'contact') icon = <User size={13} className="shrink-0 text-gray-500 dark:text-gray-400" />;
                           
                           return (
                              <div className="flex items-center gap-1 truncate w-full">
                                {icon}
                                <span className={cn("truncate", icon ? "" : "ml-0")}>{lastMsg.text || 'Nova conversa...'}</span>
                              </div>
                           );
                       })()}
                    </div>
                    {contact.unread > 0 && (
                      <div className="bg-[#00a884] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 shadow-sm">
                        {contact.unread > 99 ? '99+' : contact.unread}
                      </div>
                    )}
                  </div>
                </div>
              </div>
             )
          })}
        </div>
      </div>

      {/* Resizer Handle */}
      <div 
        className={cn(
          "hidden md:flex w-1.5 cursor-col-resize z-50 shrink-0 transition-colors relative group border-l border-r border-[#d1d7db] dark:border-[#222d34] bg-[#f0f2f5] dark:bg-[#202c33]",
          isDragging ? "bg-[#00a884]/30 border-[#00a884]" : "hover:bg-[#00a884]/20 hover:border-[#00a884]/50"
        )}
        onMouseDown={(e) => { e.preventDefault(); setIsDragging(true); }}
        title="Arraste para redimensionar"
      >
        {/* Hitbox expandida para facilitar o clique */}
        <div className="absolute -left-2 -right-2 top-0 bottom-0 cursor-col-resize" />
        {/* Ícone sutil no meio */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-400 group-hover:text-[#00a884] transition-colors pointer-events-none">
          <MoreVertical size={12} className="opacity-50" />
        </div>
      </div>

      {/* Main Chat Area */}
      {activeChat ? (
        <div 
          onClick={() => setActiveChatDropdown(false)}
          className={cn("flex-1 flex flex-col relative w-full h-full max-w-[100vw] overflow-hidden min-w-0 bg-[#efeae2] dark:bg-[#0b141a]", !activeChatId && "hidden md:flex")} 
          style={{
           backgroundImage: 'url("https://w7.pngwing.com/pngs/946/407/png-transparent-whatsapp-background-theme-pattern-design.png")',
           backgroundSize: 'cover',
           backgroundBlendMode: 'overlay',
           opacity: 0.95
        }}>
          
          {/* Chat Header */}
          <div className="relative h-16 shrink-0 bg-[#f0f2f5] dark:bg-[#202c33] flex items-center justify-between px-4 z-20 shadow-sm border-l border-white/5">
            <div className="flex items-center gap-3 relative">
              <button className="sm:hidden p-2 -ml-2 mr-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1]" onClick={() => {
                setActiveChat(null);
                if (window.history.state?.chatOpen) window.history.back();
              }}>
                <ChevronLeft size={24} />
              </button>
              
              <div className="flex items-center gap-3 relative">
                {/* Badge flutuante cobrindo foto e nome */}
                {(() => {
                   const otherUnreadCount = contacts.filter(c => c.id !== activeChatId).reduce((acc, c) => acc + (c.unread || 0), 0);
                   if (otherUnreadCount > 0) {
                      return (
                        <div className="sm:hidden absolute -inset-y-2 -inset-x-2 z-30 flex items-center bg-[#f0f2f5] dark:bg-[#202c33] rounded-r-lg">
                          <button 
                            onClick={() => {
                              setActiveChat(null);
                              if (window.history.state?.chatOpen) window.history.back();
                            }}
                            className="group flex items-center gap-2.5 bg-[#00a884] px-4 py-1.5 rounded-full shadow-[0_0_20px_rgba(0,168,132,0.6)] animate-pulse hover:scale-105 transition-all w-full"
                          >
                            <div className="relative flex items-center justify-center w-7 h-7 bg-white/20 rounded-full text-white">
                              <MessageCircle size={14} className="group-hover:animate-bounce" />
                              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 border border-[#00a884] rounded-full" />
                            </div>
                            <span className="text-[13px] font-bold text-white tracking-tight whitespace-nowrap">
                              {otherUnreadCount} {otherUnreadCount === 1 ? 'nova' : 'novas'}
                            </span>
                          </button>
                        </div>
                      );
                   }
                   return null;
                })()}

                <img 
                    src={activeChat.avatar} 
                    alt="Avatar" 
                    className="w-10 h-10 rounded-full object-cover hover:scale-105 transition-transform duration-200 cursor-pointer ring-2 ring-transparent hover:ring-[#00a884]/30" 
                    onClick={(e) => { e.stopPropagation(); setFullscreenImage(activeChat.avatar); }}
                    onError={(e) => {
                      e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(getContactDisplayName(activeChat.custom_name || activeChat.name, activeChat.push_name, activeChat.phone))}&background=random&color=fff`;
                    }}
                  />
                <div className="flex flex-col justify-center">
                  <h2 className="font-medium text-[#111b21] dark:text-[#e9edef] leading-tight flex items-center gap-2">
                    <span className="truncate max-w-[200px] sm:max-w-md">{getContactDisplayName(activeChat.custom_name || activeChat.name, activeChat.push_name, activeChat.phone)}</span>
                    
                    {activeChat.phone && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (activeChat.phone) {
                            navigator.clipboard.writeText(activeChat.phone);
                            setCopiedPhone(true);
                            setTimeout(() => setCopiedPhone(false), 2000);
                          }
                        }}
                        className={cn(
                          "transition-all p-1 rounded cursor-pointer duration-300 flex items-center justify-center border border-black/5 dark:border-white/5",
                          copiedPhone 
                            ? "text-[#00a884] bg-[#00a884]/10 opacity-100 scale-105" 
                            : "text-[#54656f] dark:text-[#aebac1] opacity-60 hover:opacity-100 hover:text-[#00a884] bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10"
                        )}
                        title="Copiar Número"
                      >
                        {copiedPhone ? <CheckCircle2 size={13} className="animate-in zoom-in" /> : <Copy size={13} />}
                      </button>
                    )}

                    {activeChat.phone && getContactDisplayName(activeChat.custom_name || activeChat.name, activeChat.push_name, activeChat.phone) !== formatPhoneNumber(activeChat.phone) && (
                      <span className="text-[12px] text-[#54656f] dark:text-[#8696a0] font-mono inline-block mt-0.5 border border-black/5 dark:border-white/10 px-1.5 rounded-md bg-black/5 dark:bg-white/5 hidden sm:inline-block">
                        {formatPhoneNumber(activeChat.phone)}
                      </span>
                    )}
                  </h2>
                  
                  {/* Premium Company Info & Document */}
                  {(activeChat.fantasy_name || activeChat.document_number) && (
                    <div className="flex items-center gap-2 text-[12px] text-[#54656f] dark:text-[#8696a0] mt-0.5 animate-in fade-in slide-in-from-top-1 duration-300">
                      {activeChat.fantasy_name && (
                        <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full border border-black/5 dark:border-white/5 backdrop-blur-sm" title="Empresa">
                          <Building2 size={12} className="text-[#00a884] opacity-80" />
                          <span className="font-medium truncate max-w-[150px]">{activeChat.fantasy_name}</span>
                        </div>
                      )}
                      
                      {activeChat.document_number && (
                        <div className="flex items-center gap-1.5 group/doc bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-full border border-black/5 dark:border-white/5 backdrop-blur-sm transition-all hover:border-[#00a884]/30">
                          <span className="font-mono tracking-wide">{activeChat.document_number}</span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeChat.document_number) {
                                const rawCnpj = activeChat.document_number.replace(/\D/g, '');
                                window.open(`https://mensalidadedatadivas.vercel.app/?e=${rawCnpj}`, '_blank');
                              }
                            }}
                            className="transition-all p-0.5 rounded cursor-pointer duration-300 flex items-center justify-center text-[#54656f] dark:text-[#aebac1] opacity-40 group-hover/doc:opacity-100 hover:text-emerald-500 hover:bg-black/5 dark:hover:bg-white/10"
                            title="Ver Faturamento (NF-e)"
                          >
                            <CircleDollarSign size={12} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeChat.document_number) {
                                navigator.clipboard.writeText(activeChat.document_number);
                                setCopiedDoc(true);
                                setTimeout(() => setCopiedDoc(false), 2000);
                              }
                            }}
                            className={cn(
                              "transition-all p-0.5 rounded cursor-pointer duration-300 flex items-center justify-center",
                              copiedDoc ? "text-[#00a884] opacity-100 scale-110" : "text-[#54656f] dark:text-[#aebac1] opacity-40 group-hover/doc:opacity-100 hover:text-[#00a884] hover:bg-black/5 dark:hover:bg-white/10"
                            )}
                            title="Copiar Documento"
                          >
                            {copiedDoc ? <CheckCircle2 size={12} className="animate-in zoom-in" /> : <Copy size={12} />}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Header Area */}
            <div className="flex items-center gap-2 sm:gap-4">
              
              <div className="hidden lg:flex items-center gap-2">
                <button 
                  onClick={() => {
                    resolveConversation(activeChat.id);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-full transition-colors text-sm font-medium border border-emerald-200 dark:border-emerald-500/20 animate-in fade-in"
                  title="Resolver Conversa"
                >
                  <CheckCircle2 size={16} />
                  <span>Resolver</span>
                </button>

                <ChatOmniMenu contactId={activeChat.id} />
              </div>

              {/* Mobile Actions Menu (Responsive Menu) */}
              <div className="lg:hidden relative">
                <button 
                  className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all text-[#54656f] dark:text-[#aebac1]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMobileHeaderMenuOpen(!mobileHeaderMenuOpen);
                    setActiveChatDropdown(false);
                  }}
                  title="Menu de Ações Mobile"
                >
                  <Menu size={20} />
                </button>
                {mobileHeaderMenuOpen && (
                   <div className="absolute right-0 top-12 w-[260px] bg-white dark:bg-[#233138] rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-[#304046] p-3 z-[100] animate-in fade-in zoom-in-95 duration-200 flex flex-col gap-3">
                      <button 
                        onClick={() => {
                          resolveConversation(activeChat.id);
                          setMobileHeaderMenuOpen(false);
                        }}
                        className="flex items-center justify-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-lg transition-colors text-sm font-medium border border-emerald-200 dark:border-emerald-500/20 w-full"
                      >
                        <CheckCircle2 size={16} />
                        <span>Resolver Conversa</span>
                      </button>
                      
                      <div className="flex flex-col gap-2 bg-gray-50 dark:bg-[#111b21] p-2 rounded-lg border border-black/5 dark:border-white/5">
                        <span className="text-[11px] text-gray-500 text-center font-bold uppercase tracking-wider">Status & Atribuição</span>
                        <div className="flex justify-center w-full">
                           <ChatOmniMenu contactId={activeChat.id} />
                        </div>
                      </div>
                   </div>
                )}
              </div>
              
              {/* Chat Actions Dropdown Premium */}
              <div className="relative">
                <button 
                  className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all text-[#54656f] dark:text-[#aebac1]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveChatDropdown(!activeChatDropdown);
                  }}
                >
                  <MoreVertical size={20} />
                </button>
                
                {activeChatDropdown && (
                  <div className="absolute right-0 top-12 w-64 bg-white dark:bg-[#233138] rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-[#304046] py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                    
                    {/* Bot Controls in Menu */}
                    <div className="border-b border-gray-100 dark:border-[#304046] mb-1 pb-1">
                      {activeChat.bot_status === 'paused' ? (
                        <button 
                          onClick={() => { setBotStatus(activeChat.id, 'active'); setActiveChatDropdown(false); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3 transition-colors"
                        >
                          <Power size={16} className="text-[#00a884]" />
                          <span className="text-[14px] text-[#3b4a54] dark:text-[#d1d7db] font-medium">Devolver para IA</span>
                        </button>
                      ) : (
                        <button 
                          onClick={() => { setBotStatus(activeChat.id, 'paused'); setActiveChatDropdown(false); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3 transition-colors"
                        >
                          <Bot size={16} className="text-yellow-600" />
                          <span className="text-[14px] text-[#3b4a54] dark:text-[#d1d7db] font-medium">Pausar a IA</span>
                        </button>
                      )}
                    </div>

                    <button 
                      onClick={async () => {
                        const properTargetInstance = activeChannelFilter || activeChat?.instance_id || connectedInstanceName;
                        if (properTargetInstance) {
                          await loadHistoricalMessages(activeChat.id, properTargetInstance, true);
                        }
                        setActiveChatDropdown(false);
                      }}
                      disabled={isSyncingHistory[activeChat.id]}
                      className="w-full text-left px-4 py-2.5 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3 transition-colors active:bg-gray-100"
                    >
                      <History size={16} className={cn("text-[#00a884]", isSyncingHistory[activeChat.id] && "animate-spin")} />
                      <span className="text-[14px] text-[#3b4a54] dark:text-[#d1d7db]">
                         {isSyncingHistory[activeChat.id] ? "Buscando..." : "Buscar Histórico"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Badge flutuante de novas mensagens foi movido para o cabeçalho */}

          {/* Chat Messages */}
          <div 
             className="flex-1 overflow-y-auto p-4 z-10 flex flex-col gap-2"
             ref={messagesContainerRef}
             onScroll={handleScroll}
          >
            {isSyncingHistory[activeChat.id] && (
               <div className="flex justify-center my-4 animate-in fade-in duration-300">
                  <span className="bg-white dark:bg-[#202c33] text-[#54656f] dark:text-[#8696a0] text-xs px-4 py-2 rounded-full flex items-center gap-2 shadow-sm border border-black/5 dark:border-white/5">
                     <span className="w-4 h-4 border-2 border-t-transparent border-[#00a884] rounded-full animate-spin"></span>
                     Sincronizando histórico anterior...
                  </span>
               </div>
            )}
            
            {activeChat.messages?.filter(m => m.text || m.mediaUrl).map((msg, index, arr) => {
               const isMe = msg.sender === 'human' || msg.sender === 'bot';
               
               let showDateSeparator = false;
               let dateSeparatorText = '';
               
               if (index === 0) {
                  showDateSeparator = true;
               } else {
                  const prevMsg = arr[index - 1];
                  const currentDay = format(new Date(msg.timestamp), 'yyyy-MM-dd');
                  const prevDay = format(new Date(prevMsg.timestamp), 'yyyy-MM-dd');
                  if (currentDay !== prevDay) {
                     showDateSeparator = true;
                  }
               }
               
               if (showDateSeparator) {
                  const date = new Date(msg.timestamp);
                  const daysOfWeek = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
                  if (isToday(date)) dateSeparatorText = 'HOJE';
                  else if (isYesterday(date)) dateSeparatorText = 'ONTEM';
                  else dateSeparatorText = `${daysOfWeek[date.getDay()]}, ${format(date, "dd/MM/yyyy")}`;
               }
               
               const separatorNode = showDateSeparator ? (
                  <div className="flex justify-center my-4 w-full">
                     <span className="bg-[#f0f2f5]/90 dark:bg-[#202c33]/90 text-[#54656f] dark:text-[#8696a0] text-[11px] px-3 py-1 rounded-lg border border-black/5 dark:border-white/5 font-medium shadow-sm uppercase tracking-wider">
                       {dateSeparatorText}
                     </span>
                  </div>
               ) : null;
               
               return (
                 <MessageBubble 
                   key={msg.id}
                   msg={msg}
                   index={index}
                   totalMessages={arr.length}
                   activeChat={activeChat}
                   activeMsgDropdown={activeMsgDropdown}
                   setActiveMsgDropdown={setActiveMsgDropdown}
                   setReplyMessage={setReplyMessage}
                   textareaRef={textareaRef}
                   handleAiReplySuggestion={handleAiReplySuggestion}
                   setMessageToForward={setMessageToForward}
                   setEditingMessage={setEditingMessage}
                   setMessageToDelete={setMessageToDelete}
                   setFullscreenImage={setFullscreenImage}
                   handleTranscribeAudio={handleTranscribeAudio}
                   transcribingIds={transcribingIds}
                   handleOpenVCardContact={handleOpenVCardContact}
                   renderMessageText={renderMessageText}
                   showDateSeparator={showDateSeparator}
                   dateSeparatorText={dateSeparatorText}
                 />
               )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Botão de Rolar para Baixo Premium */}
          {showScrollButton && (
            <button
               onClick={() => scrollToBottom('smooth')}
               className="absolute right-6 bottom-[85px] z-50 w-11 h-11 bg-white/80 dark:bg-[#202c33]/80 backdrop-blur-md rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] shadow-[0_4px_12px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.4)] border border-white/50 dark:border-white/5 hover:bg-white dark:hover:bg-[#202c33] hover:text-[#00a884] dark:hover:text-[#00a884] transition-all hover:scale-105 active:scale-95 animate-in fade-in slide-in-from-bottom-5 duration-300"
               title="Ir para o fim da conversa"
               aria-label="Ir para o fim da conversa"
            >
               <ChevronDown size={24} />
               {activeChat?.unread > 0 && (
                 <span className="absolute top-0 right-0 w-3 h-3 bg-[#00a884] rounded-full border-2 border-white dark:border-[#202c33]"></span>
               )}
            </button>
          )}

          {/* Input Area */}
          <div className="flex flex-col shrink-0 z-10 w-full bg-[#f0f2f5] dark:bg-[#202c33] shadow-sm border-t border-[#d1d7db] dark:border-[#222d34] relative">
            {/* Reply Preview Box */}
            {replyMessage && (
              <div className="flex items-start bg-black/5 dark:bg-black/20 p-3 relative animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-t-xl mx-2 mt-2 group/replybox border border-black/5 dark:border-white/5">
                <div className="w-1.5 h-full absolute left-0 top-0 bottom-0 bg-[#00a884] rounded-l-xl"></div>
                <div className="flex flex-col ml-3 flex-1 pr-8">
                  <span className="text-[12px] font-bold text-[#00a884] mb-0.5">{replyMessage.sender === 'human' || replyMessage.sender === 'me' ? 'Você' : getContactDisplayName(activeChat?.custom_name || activeChat?.name, activeChat?.push_name, activeChat?.phone)}</span>
                  <span className="text-[13px] text-[#54656f] dark:text-[#aebac1] line-clamp-2 leading-relaxed">{replyMessage.text}</span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setReplyMessage(null)} 
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors bg-white/50 dark:bg-black/20 p-1.5 rounded-full shadow-sm hover:scale-105"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            
            {/* AI Processing State Box */}
            {isGeminiProcessing && (
              <div className="flex items-center gap-3 bg-gradient-to-r from-[#00a884]/10 to-teal-500/10 p-3 mx-2 mt-2 rounded-xl border border-[#00a884]/20 animate-in fade-in slide-in-from-bottom-2 duration-300 relative z-10 shadow-sm backdrop-blur-md">
                <Sparkles size={16} className="text-[#00a884] animate-pulse" />
                <span className="text-[12px] text-[#111b21] dark:text-[#e9edef] font-medium">A IA está processando sua sugestão de resposta...</span>
              </div>
            )}
            
            {/* AI Suggestions Box */}
            {aiSuggestionsList.length > 0 && !isGeminiProcessing && (
              <div className="flex flex-col gap-2 bg-gradient-to-r from-[#00a884]/10 to-teal-500/10 p-3 mx-2 mt-2 rounded-xl border border-[#00a884]/20 animate-in fade-in slide-in-from-bottom-2 duration-300 relative z-10 shadow-sm backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#00a884] uppercase tracking-wide">
                    <Sparkles size={12} className="animate-pulse" /> Escolha uma sugestão da IA:
                  </div>
                  <button onClick={() => setAiSuggestionsList([])} className="text-[#54656f] hover:text-red-500 transition-colors bg-white/50 dark:bg-black/20 p-1 rounded-full"><X size={14}/></button>
                </div>
                <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                  {aiSuggestionsList.map((suggestion, idx) => (
                    <button 
                      key={idx}
                      type="button"
                      onClick={() => {
                        setInputText(suggestion);
                        setAiSuggestionsList([]);
                        setTimeout(() => textareaRef.current?.focus(), 100);
                      }}
                      className="shrink-0 max-w-[280px] bg-white dark:bg-[#2a3942] hover:bg-[#f0f2f5] dark:hover:bg-[#202c33] border border-[#00a884]/30 text-left px-3 py-2 rounded-lg shadow-sm transition-all hover:scale-[1.02] active:scale-95 flex flex-col group"
                    >
                      <span className="text-[12px] text-[#111b21] dark:text-[#e9edef] line-clamp-3 leading-relaxed">"{suggestion}"</span>
                      <span className="text-[10px] text-[#00a884] font-medium mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">Usar esta →</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Offline Banner Above Input */}
            {activeChat && activeChat.instance_id && instancesStatus[activeChat.instance_id] && instancesStatus[activeChat.instance_id] !== 'connected' && (
              <div className="bg-red-50/90 dark:bg-[#2a1314]/90 backdrop-blur-md border-t border-red-200 dark:border-red-900/50 p-2.5 flex items-center justify-between z-20 shadow-inner">
                <div className="flex items-center gap-2.5 text-red-600 dark:text-[#f48686]">
                  <div className="bg-red-500/10 p-1.5 rounded-lg border border-red-500/20">
                    <ShieldAlert size={16} className="animate-pulse" />
                  </div>
                  <span className="text-[12px] font-medium tracking-wide">InstÇ｢ncia offline. Conecte-a para enviar mensagens.</span>
                </div>
                <button 
                  type="button"
                  onClick={() => useChatStore.getState().openQRModal(activeChat.instance_id)}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                >
                  <Power size={14} />
                  Reconectar
                </button>
              </div>
            )}
            
            <form onSubmit={handleSendHuman} className="min-h-[70px] flex items-end px-4 py-3 gap-3 relative">
              <button 
                type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
            >
              <Paperclip size={20} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileUpload} 
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
            />

            <div className="flex flex-1 items-end bg-white dark:bg-[#2a3942] rounded-xl px-4 py-2 border border-transparent focus-within:border-[#00a884]/50 transition-colors shadow-sm relative">
              {/* Quick Replies Popover */}
              {showQuickReplies && quickReplies.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 w-[350px] max-w-[90vw] bg-white dark:bg-[#202c33] rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden z-[100] animate-in fade-in zoom-in-95 slide-in-from-bottom-4">
                  <div className="p-3 bg-gray-50/50 dark:bg-[#111b21]/50 border-b border-gray-100 dark:border-white/5 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    笞｡ Respostas Prontas
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar">
                    {quickReplies.filter(qr => qr.shortcut.toLowerCase().includes(quickReplyFilter) || qr.content.toLowerCase().includes(quickReplyFilter)).map(qr => (
                      <button
                        key={qr.id}
                        type="button"
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-[#2a3942] transition-colors border-b border-gray-50 dark:border-white/5 last:border-0 group"
                        onClick={async () => {
                          setShowQuickReplies(false);
                          if (qr.media_url) {
                            try {
                              const properTargetInstance = activeChannelFilter || activeChat?.instance_id || connectedInstanceName;
                              if (activeChat && properTargetInstance) {
                                await useChatStore.getState().sendMediaFromUrl(
                                  activeChat.id, 
                                  qr.media_url, 
                                  (qr.media_type as 'image'|'video'|'audio'|'document') || 'image', 
                                  properTargetInstance, 
                                  qr.content
                                );
                              }
                              setInputText('');
                              setTimeout(() => textareaRef.current?.focus(), 10);
                            } catch (e) {
                              console.error('Erro ao enviar mídia da resposta rápida:', e);
                              alert('Falha ao enviar mídia da resposta pronta.');
                              setInputText(qr.content);
                              setTimeout(() => textareaRef.current?.focus(), 10);
                            }
                          } else {
                            setInputText(qr.content);
                            setTimeout(() => textareaRef.current?.focus(), 10);
                          }
                        }}
                      >
                        <div className="font-semibold text-blue-600 dark:text-blue-400 text-[13px] mb-1 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                          {qr.shortcut}
                          {qr.media_url && (
                             <span className="flex items-center gap-1 text-[10px] text-gray-500 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded-md">
                                {qr.media_type === 'video' ? <Video className="w-3 h-3" /> : qr.media_type === 'audio' ? <Mic className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                                Mídia
                             </span>
                          )}
                        </div>
                        <div className="text-gray-600 dark:text-gray-300 text-[13px] line-clamp-2 leading-relaxed">{qr.content}</div>
                      </button>
                    ))}
                    {quickReplies.filter(qr => qr.shortcut.toLowerCase().includes(quickReplyFilter) || qr.content.toLowerCase().includes(quickReplyFilter)).length === 0 && (
                      <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-[13px]">
                        Nenhuma resposta encontrada para "{quickReplyFilter}"
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <textarea 
                ref={textareaRef}
                value={inputText}
                spellCheck={true}
                lang="pt-BR"
                onChange={e => {
                  const val = e.target.value;
                  setInputText(val);
                  if (val.startsWith('/')) {
                    setShowQuickReplies(true);
                    setQuickReplyFilter(val.substring(1).toLowerCase());
                  } else {
                    setShowQuickReplies(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    const isMobileEnv = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    if (isMobileEnv) {
                      // Pular linha no Android/Mobile
                      return; // Deixa o comportamento default da textarea
                    }
                    e.preventDefault();
                    if (inputText.trim()) {
                      handleSendHuman(e as any);
                    }
                  }
                }}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                      e.preventDefault();
                      const file = items[i].getAsFile();
                      if (file) {
                        setPastedImage(file);
                        setPastedImagePreview(URL.createObjectURL(file));
                        setPastedImageCaption('');
                      }
                      break;
                    }
                  }
                }}
                rows={1}
                placeholder="Responda como humano e a IA sera pausada automaticamente..."
                className="bg-transparent border-none outline-none w-full text-sm text-[#111b21] dark:text-[#e9edef] placeholder:text-[#54656f] dark:placeholder:text-[#aebac1] resize-none pb-0.5 overflow-y-auto max-h-[250px] scrollbar-thin"
              />
              <button 
                type="button" 
                onClick={() => setIsGeminiPopoverOpen(!isGeminiPopoverOpen)}
                className="ml-2 mb-0.5 p-1.5 text-[#00a884] hover:bg-[#00a884]/10 rounded-full transition-colors flex-shrink-0"
                title="Assistente IA"
              >
                <Sparkles size={20} />
              </button>

              {/* Popover UI Gemini */}
              {isGeminiPopoverOpen && (
                <div className="absolute bottom-full right-0 mb-3 bg-white/95 dark:bg-[#202c33]/95 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-2xl shadow-xl w-72 p-2 animate-in fade-in zoom-in duration-200 z-50">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-black/5 dark:border-white/5 mb-2">
                    <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-[#00a884] to-teal-500 flex items-center justify-center text-white shadow-sm">
                      <Wand2 size={12} />
                    </div>
                    <span className="text-xs font-semibold text-[#111b21] dark:text-[#aebac1]">Magia da IA</span>
                    <button onClick={() => setIsGeminiPopoverOpen(false)} className="ml-auto text-[#54656f] hover:text-red-500 p-1"><X size={14}/></button>
                  </div>
                  
                  {isGeminiProcessing ? (
                    <div className="flex flex-col items-center justify-center py-6 gap-3">
                        <RefreshCw size={24} className="text-[#00a884] animate-spin" />
                        <span className="text-xs text-[#54656f] dark:text-[#aebac1] animate-pulse">A IA está processando...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <button onClick={() => handleGeminiAction('grammar')} disabled={!inputText.trim()} className="flex items-center gap-3 w-full p-2.5 text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#111b21] dark:text-[#e9edef] group">
                        <CheckCircle2 size={16} className="text-blue-500 group-hover:scale-110 transition-transform" /> Corrigir Gramática & Ortografia
                      </button>
                      <button onClick={() => handleGeminiAction('sales')} disabled={!inputText.trim()} className="flex items-center gap-3 w-full p-2.5 text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#111b21] dark:text-[#e9edef] group">
                        <ShoppingBag size={16} className="text-emerald-500 group-hover:scale-110 transition-transform" /> Focar em Vendas
                      </button>
                      <button onClick={() => handleGeminiAction('enchant')} disabled={!inputText.trim()} className="flex items-center gap-3 w-full p-2.5 text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#111b21] dark:text-[#e9edef] group">
                        <HeartHandshake size={16} className="text-pink-500 group-hover:scale-110 transition-transform" /> Encantar Cliente
                      </button>
                      <button onClick={() => handleGeminiAction('support')} disabled={!inputText.trim()} className="flex items-center gap-3 w-full p-2.5 text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#111b21] dark:text-[#e9edef] group">
                        <LifeBuoy size={16} className="text-orange-500 group-hover:scale-110 transition-transform" /> Melhorar Suporte/Dúvida
                      </button>
                      
                      <div className="my-1 border-t border-black/5 dark:border-white/5"></div>
                      
                      <button onClick={() => handleGeminiAction('analyze')} className="flex items-center gap-3 w-full p-2.5 text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors text-[#111b21] dark:text-[#e9edef] group">
                        <BrainCircuit size={16} className="text-purple-500 group-hover:scale-110 transition-transform" /> Analisar Conversa / Dar Feedback
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {inputText.trim() ? (
              <button 
                type="submit"
                className="w-10 h-10 flex items-center justify-center bg-[#00a884] text-white rounded-full shadow-md hover:scale-105 transition-transform active:scale-95"
              >
                <Send size={16} className="translate-x-0.5" />
              </button>
            ) : (
              <button 
                type="button"
                onClick={handleMicClick}
                className={cn(
                   "w-10 h-10 flex items-center justify-center rounded-full shadow-md hover:scale-105 transition-all active:scale-95",
                   isRecording ? "bg-red-500 text-white animate-pulse" : "bg-transparent text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 shadow-none"
                )}
              >
                <Mic size={20} />
              </button>
            )}
          </form>
          </div>
        </div>
      ) : (
        <div className="hidden sm:flex flex-1 flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#222d34] border-l border-white/5 relative z-10">
          <Bot size={80} className="text-gray-300 dark:text-[#2a3942] mb-6" />
          <h1 className="text-3xl font-light text-[#54656f] dark:text-[#8696a0]">SaaS Multi-Agente Híbrido</h1>
          <div className="text-sm text-[#54656f] dark:text-[#8696a0] mt-2 flex items-center gap-2"><div className="w-2 h-2 bg-[#00a884] rounded-full animate-pulse"></div> Conectado com banco de dados</div>
        </div>
      )}

      {/* Modal de Tela Cheia para Imagens */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 z-[99999] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setFullscreenImage(null)}
          onContextMenu={(e) => { e.preventDefault(); setFullscreenImage(null); }}
        >
          <button 
            onClick={() => setFullscreenImage(null)}
            className="absolute top-6 right-6 text-white p-2 bg-black/50 hover:bg-white/20 rounded-full transition-colors z-50 shadow-lg"
          >
            <X size={24} />
          </button>
          <img 
            src={fullscreenImage} 
            alt="Imagem em Tela Cheia" 
            className="max-w-full max-h-[90vh] object-contain select-none animate-in zoom-in-95 duration-300 shadow-2xl rounded-lg"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Modal de Edição de Mensagem (Visual Premium) */}
      {editingMessage && (
        <div className="fixed inset-0 z-[99999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111b21] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-white/20 dark:border-white/10 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <div className="p-6 border-b border-gray-100 dark:border-[#202c33] bg-gradient-to-r from-blue-50 to-transparent dark:from-blue-900/10">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-3">
                <Edit2 size={24} className="text-blue-500" /> Editar Mensagem
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Apenas o texto pode ser editado. Essa alteração refletirá no aparelho do cliente.</p>
            </div>
            <div className="p-6 bg-[#f0f2f5]/30 dark:bg-[#0b141a]/30">
              <textarea
                autoFocus
                className="w-full h-32 p-4 bg-white dark:bg-[#202c33] border border-gray-200 dark:border-[#304046] rounded-2xl resize-none outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-[#111b21] dark:text-[#e9edef] text-[15px] shadow-sm transition-all"
                value={editingMessage.text}
                onChange={(e) => setEditingMessage({ ...editingMessage, text: e.target.value })}
                placeholder="Digite a nova mensagem..."
              />
            </div>
            <div className="p-4 bg-gray-50 dark:bg-[#202c33]/50 border-t border-gray-100 dark:border-[#202c33] flex justify-end gap-3">
              <button
                onClick={() => setEditingMessage(null)}
                className="px-5 py-2.5 rounded-xl font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!activeChatId) return;
                  const instanceToUse = activeChat?.instance_id || activeChat?.whatsapp_instance;
                  if (!instanceToUse) return;
                  
                  await editHumanMessage(activeChatId, editingMessage.id, editingMessage.text, instanceToUse);
                  setEditingMessage(null);
                }}
                disabled={!editingMessage.text.trim()}
                className="px-6 py-2.5 rounded-xl font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2"
              >
                <Edit2 size={18} /> Salvar Edição
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Exclusão de Mensagem (Visual Premium) */}
      {messageToDelete && (
        <div className="fixed inset-0 z-[99999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111b21] w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-white/20 dark:border-white/10 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <div className="p-6 bg-gradient-to-br from-red-50 to-white dark:from-red-900/10 dark:to-[#111b21] flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4 border-4 border-white dark:border-[#111b21] shadow-inner">
                <Trash2 size={32} className="text-red-500 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Apagar Mensagem?</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Esta ação é irreversível e apagará a mensagem para todos na conversa.
              </p>
              
              <div className="flex w-full gap-3">
                <button
                  onClick={() => setMessageToDelete(null)}
                  className="flex-1 py-3 rounded-xl font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-[#202c33] hover:bg-gray-200 dark:hover:bg-[#304046] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (!activeChatId) return;
                    const instanceToUse = activeChat?.instance_id || activeChat?.whatsapp_instance;
                    if (!instanceToUse) return;
                    
                    await deleteHumanMessage(activeChatId, messageToDelete, instanceToUse);
                    setMessageToDelete(null);
                  }}
                  className="flex-1 py-3 rounded-xl font-medium text-white bg-red-600 hover:bg-red-700 shadow-md hover:shadow-lg transition-all active:scale-95"
                >
                  Apagar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
