import React, { useState, useEffect, useRef } from 'react';
import { Bot, Settings, Users, Search, MoreVertical, Send, Check, CheckCheck, Smartphone, Power, Building2, Paperclip, Mic, FileText, Camera, Video, VideoOff, Image as ImageIcon, Pin, MessageSquarePlus, Star, Plus, Filter, Tag, Terminal, RefreshCw, History, BrainCircuit, ChevronDown, ChevronLeft, MapPin, User, Menu, Sparkles, Wand2, HeartHandshake, ShoppingBag, LifeBuoy, X, CheckCircle2, ExternalLink, ShieldAlert, Trash2, MessageCircle, Copy, Loader2, Ban, UserCheck, MessageSquareReply, Ticket, RotateCcw, Wifi, Database, Save, ShieldCheck, Smile, Briefcase, Flag, Clock, Calendar, Mail, MailOpen, CircleDollarSign, Edit2, Undo2, AlertTriangle, CheckSquare, MessageSquare, Play, Pause, StopCircle, ZoomIn, ZoomOut, CalendarClock, Lightbulb, ClipboardList, UploadCloud } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { useWaCallsStore } from '../store/useWaCallsStore';
import { Phone } from 'lucide-react';
import { playNotificationSound } from '../utils/AudioEngine';
import { motion, AnimatePresence } from 'framer-motion';
import { DeleteModal, RenameModal, NewChatModal, BlockModal, ContactLabelsModal, ForwardMessageModal, SnoozeModal, AssociatedCompaniesModal, CompanyDetailsModal, SnoozedListModal } from '../components/ChatModals';
import ImageEditorModal from '../components/ImageEditorModal';
import { SettingsModal } from '../components/SettingsModal';
import { AgentSettingsModal } from '../components/AgentSettingsModal';
import { ChatOmniMenu } from '../components/ChatOmniMenu';
import { MainSidebar } from '../components/MainSidebar';
import { GeminiEditorModal } from '../components/GeminiEditorModal';
import ThemeToggle from '../components/ThemeToggle';
import { useDevStore } from '../store/devStore';
import { format, isToday, isYesterday } from 'date-fns';
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

export const resolveLabelColor = (colorStr: string) => {
  if (!colorStr) return { hex: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.25)', text: '#818cf8' };
  
  if (colorStr.startsWith('#')) {
    const hex = colorStr;
    return {
      hex,
      bg: `${hex}15`, // ~8% opacity
      border: `${hex}30`, // ~18% opacity
      text: hex
    };
  }
  
  const colorMap: Record<string, string> = {
    'bg-rose-500': '#f43f5e',
    'bg-emerald-500': '#10b981',
    'bg-indigo-500': '#6366f1',
    'bg-amber-500': '#f59e0b',
    'bg-purple-500': '#a855f7',
    'bg-cyan-500': '#06b6d4',
    'bg-slate-600': '#475569',
    'bg-[#182229]': '#34495e',
  };
  
  const cleanColor = colorStr.replace('bg-', '');
  const colorKey = Object.keys(colorMap).find(k => k.includes(cleanColor)) || colorStr;
  let hex = colorMap[colorKey];
  
  if (!hex) {
    const basicColor = cleanColor.split('-')[0];
    const basicMap: Record<string, string> = {
      rose: '#f43f5e',
      emerald: '#10b981',
      indigo: '#6366f1',
      amber: '#f59e0b',
      purple: '#a855f7',
      cyan: '#06b6d4',
      slate: '#475569',
      blue: '#3b82f6',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#eab308',
      orange: '#f97316',
      gray: '#6b7280',
      zinc: '#71717a',
    };
    hex = basicMap[basicColor] || '#6366f1';
  }
  
  return {
    hex,
    bg: `${hex}15`,
    border: `${hex}30`,
    text: hex
  };
};

export const getStrictInstance = (c: any): string | null => {
  if (!c) return null;
  const compositeInst = typeof c.id === 'string' && c.id.includes('_') ? c.id.split('_')[1] : null;
  return compositeInst || c.instance_id || null;
};

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
  
  // Função auxiliar de renderização de menções
  const formatTextWithMentions = (textString: string) => {
    const mentionRegex = /(@\d{8,15})/g;
    const mParts = textString.split(mentionRegex);
    
    return mParts.map((mp, mIdx) => {
      if (mp.match(mentionRegex)) {
        const phone = mp.substring(1); // remove o '@'
        const contacts = useChatStore.getState().contacts;
        const contact = contacts.find(c => c.phone === phone || c.whatsapp_jid?.startsWith(phone));
        
        const displayName = contact 
          ? (contact.custom_name || contact.name || contact.push_name || phone) 
          : phone;
          
        return (
          <span 
            key={mIdx} 
            className="text-emerald-500 dark:text-emerald-400 font-bold cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              if (contact) {
                useChatStore.setState({ activeChatId: contact.id });
              }
            }}
          >
            @{displayName}
          </span>
        );
      }
      return mp;
    });
  };

  // Detecção de mensagem citada na string (padrão de envio) - Suporta assinaturas e formatação sutil
  let prefixText = '';
  let quotedText = '';
  let actualMessage = '';
  let hasQuote = false;

  const quoteIndex = text.indexOf('> *Mensagem Citada:* "');
  if (quoteIndex !== -1) {
    prefixText = text.substring(0, quoteIndex).trim();
    const rest = text.substring(quoteIndex + '> *Mensagem Citada:* "'.length);
    const firstQuoteEnd = rest.indexOf('"');
    if (firstQuoteEnd !== -1) {
      quotedText = rest.substring(0, firstQuoteEnd);
      const afterQuote = rest.substring(firstQuoteEnd + 1);
      actualMessage = afterQuote.replace(/^[\r\n\s]+/, '');
      hasQuote = true;
    }
  }
  
  if (hasQuote) {
    return (
      <div className="flex flex-col gap-2 w-full animate-in fade-in slide-in-from-top-1 duration-300">
        {prefixText && (
          <div className="text-inherit font-semibold mb-1 opacity-90 pl-1 leading-relaxed">
            {renderMessageText(prefixText)}
          </div>
        )}
        <div 
          className="relative pl-4 pr-3 py-2.5 bg-slate-500/10 dark:bg-black/30 backdrop-blur-sm border border-slate-500/15 dark:border-white/5 border-l-4 border-l-slate-400 dark:border-l-slate-500 rounded-2xl text-[0.825rem] text-slate-600 dark:text-slate-300/90 whitespace-normal overflow-hidden max-w-full cursor-pointer hover:bg-slate-500/15 dark:hover:bg-black/40 hover:border-slate-500/25 dark:hover:border-white/10 hover:scale-[0.99] transition-all duration-300 group shadow-sm"
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
          {/* Ícone de Marca d'Água Elegante */}
          <div className="absolute right-3 top-2.5 text-slate-400 dark:text-slate-500 opacity-[0.12] dark:opacity-[0.15] group-hover:opacity-30 group-hover:scale-110 transition-all duration-300 transform rotate-12 pointer-events-none select-none">
            <MessageSquareReply size={36} className="stroke-[1.5]" />
          </div>

          <div className="font-bold text-slate-500 dark:text-slate-400 text-xs mb-1 opacity-90 drop-shadow-sm flex items-center gap-1.5 select-none">
            <MessageSquareReply size={12} className="opacity-80" />
            Mensagem Citada
          </div>
          <div className="line-clamp-2 italic opacity-85 leading-relaxed pl-1 pr-6 border-l border-white/5">
            {formatTextWithMentions(quotedText)}
          </div>
        </div>
        
        {/* Divisor Gradiente Elegante */}
        <div className="h-px w-full bg-gradient-to-r from-slate-500/20 via-slate-500/5 to-transparent my-0.5 opacity-60" />
        
        <div className="pl-1 text-slate-800 dark:text-slate-100 leading-relaxed">
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
                      return (
                        <strong key={k} className="font-bold tracking-tight text-inherit">
                          {formatTextWithMentions(bp.substring(1, bp.length - 1))}
                        </strong>
                      );
                    }
                    return <React.Fragment key={k}>{formatTextWithMentions(bp)}</React.Fragment>;
                 })}
                 {j < lines.length - 1 && <br />}
              </React.Fragment>
            );
        })}
      </React.Fragment>
    );
  });
}

const formatDisplayPhone = (phoneNum: string) => {
  if (!phoneNum) return '';
  let clean = phoneNum.replace(/\D/g, '');
  if (clean.startsWith('55') && clean.length >= 12) {
    clean = clean.substring(2);
  }
  if (clean.length === 11) {
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 7)}-${clean.substring(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.substring(0, 2)}) ${clean.substring(2, 6)}-${clean.substring(6)}`;
  }
  return phoneNum;
};const PORTUGUESE_COMMON_WORDS = new Set([
  'ok', 'vou', 'responder', 'olá', 'ola', 'sim', 'não', 'nao', 'tudo', 'bem', 'bom', 'boa', 'dia', 'tarde', 'noite',
  'por', 'favor', 'obrigado', 'obrigada', 'de', 'do', 'da', 'em', 'um', 'uma', 'os', 'as', 'o', 'a',
  'que', 'se', 'com', 'para', 'como', 'mais', 'mas', 'eu', 'você', 'voce', 'ele', 'ela', 'nós', 'nos', 'eles', 'elas',
  'me', 'te', 'lhe', 'nos', 'se', 'este', 'esta', 'isto', 'esse', 'essa', 'isso', 'aquele', 'aquela', 'aquilo',
  'ir', 'vai', 'vão', 'vamos', 'fui', 'foi', 'fomos', 'foram', 'iria', 'iriam', 'iremos',
  'ter', 'tenho', 'tem', 'temos', 'têm', 'tinha', 'tinham', 'terá', 'terão', 'teria', 'teriam',
  'ser', 'sou', 'é', 'e', 'somos', 'são', 'era', 'eram', 'será', 'serão', 'seria', 'seriam',
  'estar', 'estou', 'está', 'estamos', 'estão', 'estava', 'estavam', 'estará', 'estarão', 'estaria', 'estariam',
  'fazer', 'faço', 'faz', 'fazemos', 'fazem', 'fiz', 'fez', 'fizemos', 'fizeram', 'fará', 'farão', 'faria', 'fariam',
  'dizer', 'digo', 'diz', 'dizemos', 'dizem', 'disse', 'dissemos', 'disseram', 'dirá', 'dirão', 'diria', 'diriam',
  'poder', 'posso', 'pode', 'podemos', 'podem', 'pude', 'pôde', 'puderam', 'poderá', 'poderão', 'poderia', 'poderiam',
  'ver', 'vejo', 'vê', 'vemos', 'vêem', 'vi', 'viu', 'vimos', 'viram', 'verá', 'verão', 'veria', 'veriam',
  'dar', 'dou', 'dá', 'damos', 'dão', 'dei', 'deu', 'demos', 'deram', 'dará', 'darão', 'daria', 'dariam',
  'aqui', 'ali', 'lá', 'onde', 'quando', 'como', 'porque', 'porquê', 'qual', 'quais', 'quem', 'cujo', 'cuja'
]);

export default function ChatDashboard() {
  const navigate = useNavigate();
  const tenantName = (localStorage.getItem('current_tenant_name') || sessionStorage.getItem('current_tenant_name'));
  const currentUserRole = typeof window !== 'undefined' ? (localStorage.getItem('current_user_role') || sessionStorage.getItem('current_user_role')) || 'admin' : 'admin';
  const { isEnabled: isDevLoggerEnabled } = useDevStore();
  // Monitor de agendamentos
  useScheduleMonitor();
  const lastSyncTimeRef = useRef(0);

  // Estados para Filtros (Movido para o topo para evitar erro de inicialização)
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [filterContextMenu, setFilterContextMenu] = useState<{ type: string, x: number, y: number } | null>(null);
  const [instanceNamesMap, setInstanceNamesMap] = useState<Record<string, string>>({});
  const [instanceColorsMap, setInstanceColorsMap] = useState<Record<string, string>>({});
  const [availableInstancesList, setAvailableInstancesList] = useState<{id: string, display_name: string, color: string, tenant_id?: string}[]>([]);

  const [copiedDoc, setCopiedDoc] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [associatedCompaniesOpen, setAssociatedCompaniesOpen] = useState(false);
  const [companyDetailsOpen, setCompanyDetailsOpen] = useState<any | null>(null);
  const [allCompanies, setAllCompanies] = useState<any[]>([]);

  useEffect(() => {
    const fetchCompanies = async () => {
      const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      if (!tenantId) return;
      try {
        const { supabase } = await import('../services/supabase');
        // 1. Fetch explicit companies with document_type = 'cnpj'
        const { data: explicitCompanies } = await supabase
          .from('contacts')
          .select('id, name, fantasy_name, document_number, tags')
          .eq('tenant_id', tenantId)
          .eq('document_type', 'cnpj');

        // 2. Fetch all contacts that have company_ids defined to find referenced company IDs
        const { data: contactsWithCompanies } = await supabase
          .from('contacts')
          .select('company_ids')
          .eq('tenant_id', tenantId)
          .not('company_ids', 'is', null)
          .neq('company_ids', '{}');

        const referencedIds = new Set<string>();
        if (contactsWithCompanies) {
          contactsWithCompanies.forEach(c => {
            if (Array.isArray(c.company_ids)) {
              c.company_ids.forEach((id: string) => {
                if (id) referencedIds.add(id);
              });
            }
          });
        }

        let allMergedCompanies = explicitCompanies || [];
        if (referencedIds.size > 0) {
          const explicitIds = new Set(allMergedCompanies.map(c => c.id));
          const idsToFetch = Array.from(referencedIds).filter(id => !explicitIds.has(id));
          
          if (idsToFetch.length > 0) {
            const { data: linkedCompanies } = await supabase
              .from('contacts')
              .select('id, name, fantasy_name, document_number, tags')
              .eq('tenant_id', tenantId)
              .in('id', idsToFetch);
              
            if (linkedCompanies) {
              allMergedCompanies = [...allMergedCompanies, ...linkedCompanies];
            }
          }
        }

        setAllCompanies(allMergedCompanies);
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
    sendPresenceUpdate,
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
    setInstanceStatus,
    ticketMode,
    setTicketMode,
    reopenConversation,
    resolveAllConversations,
    undoLastBatchResolve,
    reopenedTicketToast,
    setReopenedTicketToast,
    historySyncError,
    setHistorySyncError,
    realtimeStatus,
    tenantLabels,
    fetchTenantLabels,
    globalAiEnabled,
    toggleGlobalAi
  } = useChatStore(useShallow(state => ({
    contacts: state.contacts,
    globalAiEnabled: state.globalAiEnabled,
    toggleGlobalAi: state.toggleGlobalAi, 
    activeChatId: state.activeChatId, 
    evolutionConnected: state.evolutionConnected, 
    connectedInstanceName: state.connectedInstanceName,
    appVersion: state.appVersion,
    setActiveChat: state.setActiveChat, 
    sendHumanMessage: state.sendHumanMessage, 
    sendPresenceUpdate: state.sendPresenceUpdate,
    forwardMessage: state.forwardMessage,
    setBotStatus: state.setBotStatus,
    fetchInitialData: state.fetchInitialData,
    fetchTenantConfig: state.fetchTenantConfig,
    subscribeToNewMessages: state.subscribeToNewMessages,
    realtimeStatus: state.realtimeStatus,
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
    setInstanceStatus: state.setInstanceStatus,
    ticketMode: state.ticketMode,
    setTicketMode: state.setTicketMode,
    reopenConversation: state.reopenConversation,
    resolveAllConversations: state.resolveAllConversations,
    undoLastBatchResolve: state.undoLastBatchResolve,
    reopenedTicketToast: state.reopenedTicketToast,
    setReopenedTicketToast: state.setReopenedTicketToast,
    historySyncError: state.historySyncError,
    setHistorySyncError: state.setHistorySyncError,
    tenantLabels: state.tenantLabels,
    fetchTenantLabels: state.fetchTenantLabels
  })));

  const [editingMessage, setEditingMessage] = useState<{ id: string, text: string } | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);

  // Garante que o chat ativo seja marcado como lido automaticamente ao ser aberto ou ao receber novas mensagens apenas se a tela/aba estiver com foco
  useEffect(() => {
    if (activeChatId) {
      const activeContact = contacts.find(c => c.id === activeChatId);
      if (activeContact && Number(activeContact.unread || 0) > 0 && !activeContact.isManuallyUnread) {
        if (typeof document !== 'undefined' && document.hasFocus()) {
          useChatStore.getState().markAsRead(activeChatId);
        }
      }
    }
  }, [activeChatId, contacts]);

  // Listener para marcar como lido quando o usuário retorna à aba ou foca a janela
  useEffect(() => {
    const handleFocusOrVisibility = () => {
      if (typeof document !== 'undefined' && document.hasFocus()) {
        const state = useChatStore.getState();
        if (state.activeChatId) {
          const activeContact = state.contacts.find(c => c.id === state.activeChatId);
          if (activeContact && (Number(activeContact.unread || 0) > 0 || activeContact.isManuallyUnread)) {
            state.markAsRead(state.activeChatId);
          }
        }
      }
    };

    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
    };
  }, []);

  // Limpa o termo de pesquisa (input e filtro) sempre que a caixa comercial/instância (activeChannelFilter) ou o tipo de filtro (filterType) for alterado
  useEffect(() => {
    setSearchTerm('');
  }, [activeChannelFilter, filterType]);

  // Execucao Incial Reativa
  // Efect removido (duplicado com o useEffect consolidado mais abaixo)
  
  const [chatMode, setChatMode] = useState<'chat' | 'internal_note'>('chat');
  
  // Typing indicator refs and handlers
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPresenceSentRef = useRef<number>(0);
  const activeJidRef = useRef<string | null>(null);

  const handleUserTyping = (currentVal: string) => {
    if (!activeChatId || chatMode === 'internal_note') return;

    const activeChat = contacts.find(c => c.id === activeChatId);
    if (!activeChat) return;

    const targetJid = activeChat.whatsapp_jid || (activeChat.phone + '@s.whatsapp.net');
    const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
    if (!properTargetInstance) return;

    activeJidRef.current = targetJid;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (!currentVal.trim()) {
      sendPresenceUpdate(activeChatId, 'paused', properTargetInstance).catch(() => {});
      lastPresenceSentRef.current = 0;
      return;
    }

    const now = Date.now();
    if (now - lastPresenceSentRef.current > 10000) {
      lastPresenceSentRef.current = now;
      sendPresenceUpdate(activeChatId, 'composing', properTargetInstance).catch(() => {});
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (activeChatId) {
        sendPresenceUpdate(activeChatId, 'paused', properTargetInstance).catch(() => {});
      }
      lastPresenceSentRef.current = 0;
    }, 4000);
  };

  useEffect(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (activeJidRef.current && activeChatId) {
      const prevContact = contacts.find(c => (c.whatsapp_jid || (c.phone + '@s.whatsapp.net')) === activeJidRef.current);
      if (prevContact) {
        const properTargetInstance = getStrictInstance(prevContact) || activeChannelFilter || connectedInstanceName;
        if (properTargetInstance) {
          sendPresenceUpdate(prevContact.id, 'paused', properTargetInstance).catch(() => {});
        }
      }
    }
    lastPresenceSentRef.current = 0;
  }, [activeChatId]);

  const [isTaskMode, setIsTaskMode] = useState(false);
  const [taskAssignedTo, setTaskAssignedTo] = useState<string | null>(null);
  const [checklistDraft, setChecklistDraft] = useState<string[]>([]);
  const [notePreviewMode, setNotePreviewMode] = useState(false);
  const [noteAttachedFile, setNoteAttachedFile] = useState<File | null>(null);
  const [noteAttachedPreview, setNoteAttachedPreview] = useState<string | null>(null);
  const [noteAttachedType, setNoteAttachedType] = useState<'image' | 'video' | 'audio' | 'document' | null>(null);
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);

  // Estados para Agendamento na Nota Interna e Alarme
  const [scheduleNote, setScheduleNote] = useState(false);
  const [scheduleNoteTitle, setScheduleNoteTitle] = useState('');
  const [scheduleNoteDate, setScheduleNoteDate] = useState('');
  const [scheduleNoteTime, setScheduleNoteTime] = useState('');
  const [activeAlarmAppointment, setActiveAlarmAppointment] = useState<any | null>(null);
  const [hasPlayedAlarmSound, setHasPlayedAlarmSound] = useState(false);
  const dismissedAlarmsRef = useRef<Set<string>>(new Set());

  // Monitor de Alarmes Ativos em tempo real
  useEffect(() => {
    const interval = setInterval(() => {
      const appointments = useChatStore.getState().appointments;
      if (!appointments || appointments.length === 0) return;
      
      const now = new Date().getTime();
      
      // Procurar algum agendamento ativo que venceu nos últimos 10 minutos
      const activeAlarm = appointments.find(appt => {
        if (appt.status !== 'scheduled') return false;
        if (dismissedAlarmsRef.current.has(appt.id)) return false;
        
        const startTime = new Date(appt.start_time).getTime();
        // Disparar se a hora atual for maior ou igual ao início E não tiver passado de 10 minutos (limite razoável)
        return now >= startTime && (now - startTime) <= 10 * 60 * 1000;
      });
      
      if (activeAlarm) {
        setActiveAlarmAppointment(activeAlarm);
      }
    }, 5000); // Checa a cada 5 segundos para precisão premium

    return () => clearInterval(interval);
  }, []);

  // Efeito para reproduzir som de alarme premium
  useEffect(() => {
    if (activeAlarmAppointment && !hasPlayedAlarmSound) {
      playNotificationSound('default'); // toca o som de notificação
      setHasPlayedAlarmSound(true);
    }
  }, [activeAlarmAppointment, hasPlayedAlarmSound]);

  const handleDismissAlarm = (apptId: string) => {
    dismissedAlarmsRef.current.add(apptId);
    setActiveAlarmAppointment(null);
    setHasPlayedAlarmSound(false);
  };

  const handleCompleteAlarmAppointment = async (apptId: string, updatedChecklist?: any[]) => {
    try {
      const payload: any = { status: 'completed' };
      if (updatedChecklist) {
        payload.checklist_items = updatedChecklist;
      }
      await useChatStore.getState().updateAppointment(apptId, payload);
      dismissedAlarmsRef.current.add(apptId);
      setActiveAlarmAppointment(null);
      setHasPlayedAlarmSound(false);
    } catch (e) {
      console.error("Erro ao concluir compromisso pelo alarme:", e);
    }
  };

  // Estados para o Modal Premium de Atribuição de Implantação Completa CRM
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  
  // Ref para cliques fora do menu de pausa
  const pauseMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pauseMenuRef.current && !pauseMenuRef.current.contains(event.target as Node)) {
        setShowPauseMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [showImplantacaoModal, setShowImplantacaoModal] = useState(false);
  const [implantacaoSelectedAgent, setImplantacaoSelectedAgent] = useState<string | null>(null);

  // Estados locais independentes para o Modal de Edição de Notas/Tarefas CRM
  const [editingNote, setEditingNote] = useState<any | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [editNoteChecklist, setEditNoteChecklist] = useState<any[]>([]);
  const [selectedContactForTasks, setSelectedContactForTasks] = useState<any | null>(null);
  const [editNoteAssignedTo, setEditNoteAssignedTo] = useState<string | null>(null);
  const [editNoteIsTask, setEditNoteIsTask] = useState(false);
  const [editNotePreviewMode, setEditNotePreviewMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Expor e expirar o método openEditNoteModal globalmente para a bolha MessageBubble
  useEffect(() => {
    (window as any).openEditNoteModal = (note: any) => {
      setEditingNote(note);
    };
    return () => {
      delete (window as any).openEditNoteModal;
    };
  }, []);

  // Estado do menu suspenso (Dropdown) de tarefas do operador
  const [isTasksDropdownOpen, setIsTasksDropdownOpen] = useState(false);

  // Descobrir operador conectado para controle de tarefas acumuladas (CRM)
  const currentUserEmail = typeof window !== 'undefined' ? (localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email')) : null;
  const currentAgent = agents.find(a => a.email && a.email.toLowerCase() === currentUserEmail?.toLowerCase());

  // Estado local para tarefas CRM ativas globais (independente de caixas)
  const [globalActiveTasks, setGlobalActiveTasks] = useState<any[]>([]);

  // Lógica computada para obter apenas as tarefas do atendente conectado a partir de globalActiveTasks
  const myActiveTasks = React.useMemo(() => {
    if (!currentAgent) return [];
    return globalActiveTasks.filter(t => 
      t.assignedTo === currentAgent.id || 
      t.assignedTo === currentAgent.user_id
    );
  }, [globalActiveTasks, currentAgent]);

  // Função para buscar do Supabase todas as tarefas ativas do operador logado
  const fetchGlobalActiveTasks = React.useCallback(async () => {
    if (!currentAgent) return;
    try {
      const tenantId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      if (!tenantId) return;

      const { data: notes, error } = await supabase
        .from('contact_notes')
        .select(`
          id,
          content,
          created_at,
          contact_id,
          assigned_to,
          created_by_name,
          checklist_items,
          contacts (
            id,
            name,
            custom_name,
            phone,
            instance_id
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('is_task', true)
        .eq('task_completed', false);

      if (error) throw error;

      if (notes) {
        const formatted = notes.map((n: any) => {
          const contactObj = n.contacts || {};
          return {
            noteId: n.id,
            contactId: n.contact_id,
            contactName: contactObj.custom_name || contactObj.name || contactObj.phone || 'Contato',
            instanceId: contactObj.instance_id,
            text: n.content || '',
            timestamp: new Date(n.created_at),
            createdByName: n.created_by_name || 'Agente',
            assignedTo: n.assigned_to,
            checklistItems: n.checklist_items || []
          };
        });
        formatted.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        setGlobalActiveTasks(formatted);
      }
    } catch (e) {
      console.warn('Erro ao carregar tarefas globais:', e);
    }
  }, [currentAgent, tenantInfo?.id]);

  // Efeito 1: Buscar tarefas globais na carga do agente
  useEffect(() => {
    fetchGlobalActiveTasks();
  }, [currentAgent, fetchGlobalActiveTasks]);

  // Expor fetchGlobalActiveTasks globalmente para o chatStore para atualizações otimistas locais
  useEffect(() => {
    (window as any).refreshGlobalActiveTasks = () => {
      fetchGlobalActiveTasks();
    };
    return () => {
      delete (window as any).refreshGlobalActiveTasks;
    };
  }, [fetchGlobalActiveTasks]);

  // Efeito 2: Realtime para manter as tarefas globais sincronizadas
  useEffect(() => {
    const tenantId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
    if (!tenantId || !currentAgent) return;

    const channel = supabase.channel(`public:contact_notes:tenant=${tenantId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'contact_notes', 
        filter: `tenant_id=eq.${tenantId}` 
      }, () => {
        fetchGlobalActiveTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantInfo?.id, currentAgent, fetchGlobalActiveTasks]);

  // Transição reativa e scroll de destaque visual para o card da timeline
  const handleSelectTask = async (contactId: string, noteId: string, instanceId?: string) => {
    // Fechar o dropdown de tarefas automaticamente
    setIsTasksDropdownOpen(false);

    // Encontrar o ID composto real correspondente a este contato no store
    const stateContacts = useChatStore.getState().contacts;
    const foundContact = stateContacts.find(c => 
      c.id === `${contactId}_${instanceId}` || 
      c.id.startsWith(`${contactId}_`) || 
      c.id === contactId
    );

    const targetContactId = foundContact ? foundContact.id : (instanceId ? `${contactId}_${instanceId}` : `${contactId}_default`);

    // Se o contato pertence a outra caixa (outro instanceId) que não a atual, mudar a caixa automaticamente
    const targetInstanceId = foundContact?.instance_id || instanceId;
    if (targetInstanceId && activeChannelFilter !== targetInstanceId) {
      useChatStore.getState().setActiveChannelFilter(targetInstanceId, null);
      useChatStore.getState().setFilterType('all');
      await useChatStore.getState().fetchInitialData();
    }

    // 1. Abre a conversa no painel central com o ID composto correto
    setActiveChat(targetContactId);

    // 2. Tenta focar na tarefa com polling adaptativo robusto (tenta a cada 100ms, por até 2.5 segundos)
    let attempts = 0;
    const maxAttempts = 25;

    const tryScrollAndHighlight = () => {
      const element = document.getElementById(`message-note-${noteId}`);
      if (element) {
        // Encontrou! Rola suavemente até o elemento centralizado
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Efeito de destaque premium piscante/borda com efeito glow
        element.classList.add('ring-4', 'ring-amber-500/60', 'animate-pulse', 'scale-[1.01]', 'duration-300');
        
        setTimeout(() => {
          element.classList.remove('ring-4', 'ring-amber-500/60', 'animate-pulse', 'scale-[1.01]');
        }, 2500);
        
        return true; // Sucesso
      }
      return false; // Não encontrado ainda
    };

    // Primeira tentativa imediata com um micro delay para o estado inicial
    setTimeout(() => {
      if (tryScrollAndHighlight()) return;

      // Se não achar de primeira, inicia o intervalo de tentativas
      const interval = setInterval(() => {
        attempts++;
        const found = tryScrollAndHighlight();
        if (found || attempts >= maxAttempts) {
          clearInterval(interval);
        }
      }, 100);
    }, 150);
  };

  const handleOpenContactTasks = (contactId: string) => {
    const contactObj = contacts.find(c => c.id === contactId);
    if (contactObj) {
      setSelectedContactForTasks(contactObj);
    }
  };

  // Monitorar abertura do modal para carregar os valores iniciais
  useEffect(() => {
    if (editingNote) {
      setEditNoteText(editingNote.text || '');
      setEditNoteChecklist(editingNote.checklistItems || []);
      setEditNoteAssignedTo(editingNote.assignedTo || null);
      setEditNoteIsTask(editingNote.isTask || false);
      setEditNotePreviewMode(false);
      setShowDeleteConfirm(false);
    }
  }, [editingNote]);

  // Auxiliares do Editor do Modal de Edição
  const insertMarkdownTagInEdit = (formatType: string, templateText?: string) => {
    const textarea = document.getElementById('edit-note-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    let replacement = "";

    if (templateText) {
      replacement = templateText;
    } else {
      switch (formatType) {
        case 'bold':
          replacement = `**${selectedText || 'texto'}**`;
          break;
        case 'italic':
          replacement = `*${selectedText || 'texto'}*`;
          break;
        case 'strikethrough':
          replacement = `~~${selectedText || 'texto'}~~`;
          break;
        case 'code':
          replacement = `\`${selectedText || 'código'}\``;
          break;
        case 'bullet_list':
          replacement = `\n- ${selectedText || 'item'}`;
          break;
        default:
          replacement = selectedText;
      }
    }

    const val = text.substring(0, start) + replacement + text.substring(end);
    setEditNoteText(val);

    // Reprogramar foco
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + replacement.length);
    }, 50);
  };

  // Atalhos de Teclado Dinâmico para o Checklist do Modal de Edição
  const handleEditChecklistKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newItems = [...editNoteChecklist];
      newItems.splice(index + 1, 0, { id: 'temp_' + Date.now(), text: '', completed: false });
      setEditNoteChecklist(newItems);
      setTimeout(() => {
        const nextInput = document.getElementById(`edit-checklist-item-${index + 1}`) as HTMLInputElement;
        if (nextInput) {
          nextInput.focus();
        }
      }, 50);
    } else if (e.key === 'Backspace' && editNoteChecklist[index].text === '') {
      e.preventDefault();
      if (editNoteChecklist.length > 1) {
        const newItems = editNoteChecklist.filter((_, i) => i !== index);
        setEditNoteChecklist(newItems);
        setTimeout(() => {
          const prevInput = document.getElementById(`edit-checklist-item-${index - 1 >= 0 ? index - 1 : 0}`) as HTMLInputElement;
          if (prevInput) {
            prevInput.focus();
          }
        }, 50);
      }
    }
  };

  // Auxiliares do Editor de Texto Poderoso (Markdown)
  const insertMarkdownTag = (formatType: string, templateText?: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    let replacement = "";

    if (templateText) {
      replacement = templateText;
    } else {
      switch (formatType) {
        case 'bold':
          replacement = `**${selectedText || 'texto'}**`;
          break;
        case 'italic':
          replacement = `*${selectedText || 'texto'}*`;
          break;
        case 'strikethrough':
          replacement = `~~${selectedText || 'texto'}~~`;
          break;
        case 'code':
          replacement = `\`${selectedText || 'código'}\``;
          break;
        case 'bullet_list':
          replacement = `\n- ${selectedText || 'item'}`;
          break;
        default:
          replacement = selectedText;
      }
    }

    const val = text.substring(0, start) + replacement + text.substring(end);
    setInputText(val);

    // Foca novamente no textarea e define a seleção de volta
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + replacement.length);
    }, 50);
  };

  const renderMarkdownPreview = (mdText: string) => {
    if (!mdText) return <span className="text-gray-400 dark:text-gray-500 italic block py-4 text-center">Nenhuma anotação digitada. Use a barra superior para formatar ou digite abaixo...</span>;
    
    // Parser seguro e leve de Markdown
    let html = mdText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
      
    // Headers ###
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-amber-600 dark:text-amber-400 font-extrabold text-sm tracking-wider uppercase mt-4 mb-2 flex items-center gap-1.5 border-b border-amber-500/10 pb-1">$1</h3>');
    // Bold **
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-extrabold text-amber-800 dark:text-amber-400">$1</strong>');
    // Italic *
    html = html.replace(/\*(.*?)\*/g, '<em class="italic text-gray-700 dark:text-gray-300">$1</em>');
    // Strikethrough ~~
    html = html.replace(/~~(.*?)~~/g, '<del class="line-through opacity-55">$1</del>');
    // Code block `
    html = html.replace(/`(.*?)`/g, '<code class="bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded font-mono text-[11.5px] text-amber-600 dark:text-amber-400 border border-black/5 dark:border-white/5">$1</code>');
    // Bullet list -
    html = html.replace(/^\- (.*$)/gim, '<li class="ml-4 list-disc pl-1 py-0.5 text-[13px] text-gray-700 dark:text-gray-200">$1</li>');
    // Quebras de linha
    html = html.replace(/\n/g, '<br />');

    return (
      <div 
        className="text-[13px] leading-relaxed text-gray-800 dark:text-gray-200 select-text max-h-[250px] overflow-y-auto pr-1 bg-black/5 dark:bg-black/20 p-3 rounded-xl border border-black/5 dark:border-white/5 shadow-inner"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  };

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAgentSettingsOpen, setIsAgentSettingsOpen] = useState(false);
  const [isSnoozedListOpen, setIsSnoozedListOpen] = useState(false);
  const isModalOpen = !!modalReason || isSettingsOpen || isAgentSettingsOpen || isSnoozedListOpen;
  const [inputText, setInputText] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [quickReplyFilter, setQuickReplyFilter] = useState('');
  const quickReplies = useChatStore(state => state.quickReplies);
  const [replyMessage, setReplyMessage] = useState<{ id: string, text: string, sender: string } | null>(null);
  const [pastedImage, setPastedImage] = useState<File | null>(null);
  const [pastedImagePreview, setPastedImagePreview] = useState<string | null>(null);
  const [pastedImageCaption, setPastedImageCaption] = useState('');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [fullscreenZoom, setFullscreenZoom] = useState(1);
  const [fullscreenPan, setFullscreenPan] = useState({ x: 0, y: 0 });
  const [isFullscreenDragging, setIsFullscreenDragging] = useState(false);
  const [fullscreenDragStart, setFullscreenDragStart] = useState({ x: 0, y: 0 });

  const closeFullscreenImage = () => {
    setFullscreenImage(null);
    setFullscreenZoom(1);
    setFullscreenPan({ x: 0, y: 0 });
    setIsFullscreenDragging(false);
  };

  const handleZoomIn = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFullscreenZoom(prev => Math.min(prev + 0.5, 5));
  };

  const handleZoomOut = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFullscreenZoom(prev => {
      const next = prev - 0.5;
      if (next <= 1) {
        setFullscreenPan({ x: 0, y: 0 });
        return 1;
      }
      return next;
    });
  };

  const handleResetZoom = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFullscreenZoom(1);
    setFullscreenPan({ x: 0, y: 0 });
    setIsFullscreenDragging(false);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (fullscreenZoom <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    setIsFullscreenDragging(true);
    setFullscreenDragStart({
      x: e.clientX - fullscreenPan.x,
      y: e.clientY - fullscreenPan.y
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!isFullscreenDragging || fullscreenZoom <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    const newX = e.clientX - fullscreenDragStart.x;
    const newY = e.clientY - fullscreenDragStart.y;
    setFullscreenPan({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!isFullscreenDragging) return;
    e.preventDefault();
    e.stopPropagation();
    setIsFullscreenDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // Estados para Monitor de Saúde Premium e Internet
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showHealthPanel, setShowHealthPanel] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('[Network] Conexão restabelecida. Sincronizando mensagens perdidas...');
      useChatStore.getState().syncMissedMessages().catch(e => console.error('[Network Sync] Falha:', e));
    };
    const handleOffline = () => setIsOnline(false);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Tab Focus] Usuário retornou à aba. Sincronizando mensagens perdidas...');
        useChatStore.getState().syncMissedMessages().catch(e => console.error('[Visibility Sync] Falha:', e));
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      console.log('[Manual Sync] Forçando reconexão e recarga...');
      await fetchInitialData();
      await subscribeToNewMessages(true);
    } catch (err) {
      console.error('[Manual Sync] Erro ao sincronizar:', err);
    } finally {
      setTimeout(() => {
        setIsSyncing(false);
      }, 1200);
    }
  };

  const whatsappStatusMemo = React.useMemo(() => {
    const currentTenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
    const tenantInstances = availableInstancesList.filter(inst => !currentTenantId || inst.tenant_id === currentTenantId);
    const total = tenantInstances.length;
    
    if (total === 0) {
      return {
        connected: evolutionConnected,
        label: evolutionConnected ? "Conectado" : "Offline",
        health: evolutionConnected ? 'green' as const : 'red' as const,
        percentage: evolutionConnected ? 100 : 0,
        connectedCount: evolutionConnected ? 1 : 0,
        total: 0
      };
    }

    const connectedCount = tenantInstances.filter(inst => instancesStatus[inst.id] === 'connected').length;
    const percentage = Math.round((connectedCount / total) * 100);

    let health: 'green' | 'yellow' | 'red' = 'red';
    let label = '';

    if (connectedCount === total) {
      health = 'green';
      label = "Conectado";
    } else if (connectedCount > 0) {
      health = 'yellow';
      label = `Parcial (${percentage}%)`;
    } else {
      health = 'red';
      label = "Offline";
    }

    return {
      connected: connectedCount > 0,
      label,
      health,
      percentage,
      connectedCount,
      total
    };
  }, [availableInstancesList, instancesStatus, evolutionConnected]);

  const systemHealth = React.useMemo<'green' | 'yellow' | 'red'>(() => {
    const internetOk = isOnline;
    
    if (!internetOk || realtimeStatus === 'disconnected' || whatsappStatusMemo.health === 'red') {
      return 'red';
    } else if (realtimeStatus === 'connecting' || whatsappStatusMemo.health === 'yellow') {
      return 'yellow';
    }
    return 'green';
  }, [isOnline, realtimeStatus, whatsappStatusMemo]);

  // Estados para Fechamento em Lote de Tickets (Modo Ticket Ativo)
  const [isConfirmBatchResolveOpen, setIsConfirmBatchResolveOpen] = useState(false);
  const [isUndoToastVisible, setIsUndoToastVisible] = useState(false);
  const [quickReplyToast, setQuickReplyToast] = useState<{ shortcut: string; type: 'sent' | 'applied' } | null>(null);
  const [pendingMediaToSend, setPendingMediaToSend] = useState<{ url: string; type: 'image' | 'video' | 'audio' | 'document'; name?: string } | null>(null);
  const [batchResolvedCount, setBatchResolvedCount] = useState(0);
  const [isProcessingBatchResolve, setIsProcessingBatchResolve] = useState(false);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cálculo de Tickets Ativos da Caixa Selecionada (respeitando RBAC e status)
  const activeTicketsCount = React.useMemo(() => {
    const roleStr = typeof window !== 'undefined' ? (sessionStorage.getItem('current_user_role') || localStorage.getItem('current_user_role')) : null;
    const isGlobalAdmin = roleStr === 'owner' || roleStr === 'admin';
    
    let allowedInstances: string[] = [];
    if (!isGlobalAdmin) {
      const allowedStr = typeof window !== 'undefined' ? (sessionStorage.getItem('allowed_instances') || localStorage.getItem('allowed_instances')) : null;
      if (allowedStr) {
        try { allowedInstances = JSON.parse(allowedStr); } catch(e) {}
      }
    }

    return contacts.filter(c => {
      // 1) RBAC Enforcement
      if (!isGlobalAdmin) {
        const allowedStr = typeof window !== 'undefined' ? (sessionStorage.getItem('allowed_instances') || localStorage.getItem('allowed_instances')) : null;
        if (allowedStr) {
          if (allowedInstances.length === 0) return false;
          const effectiveInstId = c.instance_id || connectedInstanceName;
          if (effectiveInstId && !allowedInstances.includes(effectiveInstId)) {
            return false;
          }
        } else {
          return false;
        }
      }

      // 2) Filtro de Caixa Ativa
      if (activeChannelFilter) {
        const dbInstId = c.instance_id;
        const effectiveId = connectedInstanceName;
        if (!dbInstId) {
          if (effectiveId !== activeChannelFilter && effectiveId !== activeChannelName) return false;
        } else {
          if (dbInstId !== activeChannelFilter && dbInstId !== activeChannelName) return false;
        }
      }

      // 3) Não estar bloqueado
      if (c.is_blocked) return false;

      // 4) Não estar resolvido (Somente tickets ativos)
      if (c.conv_status === 'resolved') return false;

      // 5) Não estar adiado ativo
      if (c.conv_status === 'snoozed' && c.snoozed_until) {
        const untilTimestamp = new Date(c.snoozed_until).getTime();
        if (untilTimestamp > Date.now()) return false;
      }

      return true;
    }).length;
  }, [contacts, activeChannelFilter, activeChannelName, connectedInstanceName]);

  const isContactPinned = (c: any) => {
    if (c.is_pinned) return true;
    const currentBox = activeChannelFilter || c.instance_id || connectedInstanceName;
    return currentBox && c.pinned_instances?.includes(currentBox);
  };

  const filteredContacts = React.useMemo(() => {
    const sorted = contacts.filter(c => {
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
               if (allowedInstances.length === 0) return false; // Sem instâncias -> Sem acesso

               const effectiveInstId = c.instance_id || connectedInstanceName; // fallback pra órfãos
               if (effectiveInstId && !allowedInstances.includes(effectiveInstId)) {
                   return false; // BLOQUEADO!
               }
           } else {
               return false; // BLOQUEADO! Agente logado precisa de permissão clara
           }
       }

       // 2) FILTRO POR CAIXA ESPECÍFICA (Menu esquerdo) - MANTIDO DURANTE PESQUISA A PEDIDO DO USUÁRIO
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

       // 3) BUSCA EM TEXTO E METADADOS
       if (searchTerm) {
           const s = searchTerm.toLowerCase();
           const match = c.name?.toLowerCase().includes(s) ||
                         c.custom_name?.toLowerCase().includes(s) ||
                         c.whatsapp_jid?.includes(searchTerm) ||
                         c.phone?.includes(searchTerm) ||
                         c.fantasy_name?.toLowerCase().includes(s) ||
                         c.document_number?.includes(searchTerm) ||
                         c.conv_labels?.some((l: any) => l.name?.toLowerCase().includes(s));
           if (!match) return false;
       }
       
       // Lógica de Contatos Bloqueados
       if (filterType === 'blocked') {
           if (!c.is_blocked) return false;
       } else {
           if (c.is_blocked) return false; // Esconde os bloqueados em todas as outras views (All, Unread, Favoritos, etc)
       }

       // Filtro de Tarefas CRM do operador ativo (independente de searchTerm)
       if (filterType === 'tasks') {
           const realContactId = c.id.includes('_') ? c.id.split('_')[0] : c.id;
           const hasActiveTask = myActiveTasks.some(t => t.contactId === realContactId);
           if (!hasActiveTask) return false;
       }

       // Filtros de Pills - IGNORADOS DURANTE PESQUISA
       if (!searchTerm) {
           if (filterType === 'unread' && c.unread <= 0 && c.id !== activeChatId) return false;
           if (filterType === 'favorite' && !c.is_favorite) return false;
           if (filterType === 'labels') {
              if (selectedLabelId) {
                 if (!(c.conv_labels && c.conv_labels.some((l: any) => l.id === selectedLabelId))) return false;
              } else {
                 if (!(c.conv_labels && c.conv_labels.length > 0)) return false;
              }
           }
           if (filterType === 'mine') {
               const currentUserEmail = sessionStorage.getItem('current_user_email') || localStorage.getItem('current_user_email');
               const currentAgent = agents.find(a => a.email === currentUserEmail);
               if (!currentAgent || c.assigned_to !== currentAgent.id) return false;
           }
       }
       
       // Filtro de Adiado (Snoozed)
       if (c.conv_status === 'snoozed' && c.snoozed_until) {
          const untilTimestamp = new Date(c.snoozed_until).getTime();
          if (untilTimestamp > Date.now()) {
             // Esconde se ainda não expirou, a menos que o usuário esteja forçando a pesquisa ativamente
             if (!searchTerm) return false;
          }
       }

       // Filtro de Modo Ticket (Estilo Chatwoot)
       if (ticketMode && !searchTerm) {
          if (c.conv_status === 'resolved') {
             return false;
          }
       }

       return true;
    }).sort((a,b) => {
        const aPinned = isContactPinned(a);
        const bPinned = isContactPinned(b);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        
        const aTime = a.lastMsgTimestamp || 0;
        const bTime = b.lastMsgTimestamp || 0;
        
        if (bTime !== aTime) {
           return bTime - aTime;
        }
        
        // Critério de desempate estável secundário por ID do contato
        return String(a.id).localeCompare(String(b.id));
     });

    // Deduplicação rígida de contatos na mesma caixa de atendimento (caixa_efetiva)
    const seenKeys = new Set<string>();
    const deduped: any[] = [];
    for (const c of sorted) {
      const realId = c.id.includes('_') ? c.id.split('_')[0] : c.id;
      const caixa = c.instance_id || connectedInstanceName || 'default';
      const key = `${realId}_${caixa}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        deduped.push(c);
      }
    }
    return deduped;
  }, [contacts, activeChannelFilter, searchTerm, filterType, selectedLabelId, activeChatId, ticketMode, agents, connectedInstanceName, activeChannelName]);

  const handleBatchResolveConfirm = async () => {
    setIsProcessingBatchResolve(true);
    try {
      const res = await resolveAllConversations();
      setIsConfirmBatchResolveOpen(false);
      if (res.success && res.count > 0) {
        setBatchResolvedCount(res.count);
        setIsUndoToastVisible(true);
        
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        
        undoTimeoutRef.current = setTimeout(() => {
          setIsUndoToastVisible(false);
        }, 8000);
      } else {
        alert("Nenhum ticket ativo para fechar no momento.");
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao fechar tickets.");
    } finally {
      setIsProcessingBatchResolve(false);
    }
  };

  const handleUndoBatchResolve = async () => {
    try {
      const undone = await undoLastBatchResolve();
      if (undone) {
        setIsUndoToastVisible(false);
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        alert("Encerramento em lote desfeito! Conversas restauradas.");
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao desfazer ação.");
    }
  };

  // Lógica de rascunhos por chat
  const draftsRef = useRef<Record<string, string>>({});
  const prevActiveChatId = useRef<string | null>(null);
  const currentInputText = useRef(inputText);
  const isSendingRef = useRef(false);
  
  useEffect(() => {
    currentInputText.current = inputText;
  }, [inputText]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Estados para Gravação e Preview de Áudio Premium (Glassmorphism UI)
  const [audioState, setAudioState] = useState<'idle' | 'recording' | 'reviewing'>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedAudioFile, setRecordedAudioFile] = useState<File | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);

  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-resize do textarea sincronizado com o state inputText
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 20), 250)}px`;
    }
  }, [inputText]);

  // Estados dos novos menus fluídos
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [menuOpenUpward, setMenuOpenUpward] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<any | null>(null);
  const [contactToDelete, setContactToDelete] = useState<{id: string; name: string} | null>(null);
  const [contactToBlock, setContactToBlock] = useState<{id: string; name: string; isBlocked: boolean} | null>(null);
  const [contactForLabels, setContactForLabels] = useState<any | null>(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [showSnoozeModal, setShowSnoozeModal] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [activeChatDropdown, setActiveChatDropdown] = useState(false);

  // Estados para Drag and Drop de Arquivos
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounter = useRef(0);

  // Estados para Extração e Validação do RAG
  const [isRagModalOpen, setIsRagModalOpen] = useState(false);
  const [isRagExtracting, setIsRagExtracting] = useState(false);
  const [extractedRules, setExtractedRules] = useState<Array<{ text: string; checked: boolean; similarity: number | null; matchContent: string | null }>>([]);
  const [saveFileName, setSaveFileName] = useState('');
  const [isSavingToRag, setIsSavingToRag] = useState(false);
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

  const [geminiPopoverSubView, setGeminiPopoverSubView] = useState<'main' | 'analyze_period'>('main');
  const [selectedAnalyzePeriod, setSelectedAnalyzePeriod] = useState<'2h' | '24h' | '3d' | '7d' | 'all'>('24h');
  const [transcriptionProgressText, setTranscriptionProgressText] = useState<string | null>(null);

  // AI Reasoning Corrections States
  const [isReasoningModalOpen, setIsReasoningModalOpen] = useState(false);
  const [reasoningBotMessage, setReasoningBotMessage] = useState<any>(null);
  const [reasoningUserQuery, setReasoningUserQuery] = useState('');
  const [reasoningCorrectedText, setReasoningCorrectedText] = useState('');
  const [isSavingReasoning, setIsSavingReasoning] = useState(false);
  const [isHelperLoading, setIsHelperLoading] = useState(false);
  const [helperActionActive, setHelperActionActive] = useState<string | null>(null);

  // Enhanced Cockpit RAG & Humanization states
  const [activeLeftTab, setActiveLeftTab] = useState<'context' | 'manual'>('context');
  const [correctionsList, setCorrectionsList] = useState<any[]>([]);
  const [searchCorrectionQuery, setSearchCorrectionQuery] = useState('');
  const [isLoadingCorrections, setIsLoadingCorrections] = useState(false);
  const [ragDocInfo, setRagDocInfo] = useState<any>(null);
  const [isLoadingRagDoc, setIsLoadingRagDoc] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'editor' | 'reference'>('editor');
  const [conversationContextSummary, setConversationContextSummary] = useState('');
  const [isContextSummaryLoading, setIsContextSummaryLoading] = useState(false);

  const getHumanizationScore = (text: string) => {
    if (!text) return { score: 0, tips: [], level: 'Baixo', color: 'text-red-400', bg: 'bg-red-500/10' };
    
    let score = 30; // base score for writing anything
    const tips: { type: 'good' | 'warning' | 'info'; text: string }[] = [];
    
    const trimmed = text.trim();
    
    // 1. Emojis
    const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu;
    const emojiMatches = trimmed.match(emojiRegex);
    const emojiCount = emojiMatches ? emojiMatches.length : 0;
    
    if (emojiCount > 0) {
      if (emojiCount > 5) {
        score += 5;
        tips.push({ type: 'warning', text: 'Muitos emojis! Tente usar de 1 a 3 para manter o profissionalismo.' });
      } else {
        score += 20;
        tips.push({ type: 'good', text: 'Excelente! O uso de emojis deixa a resposta mais calorosa.' });
      }
    } else {
      tips.push({ type: 'info', text: 'Adicione pelo menos um emoji amigável (ex: 😊, 👍, Combinado!).' });
    }

    // 2. Conversational words & Warm Greetings
    const warmWords = [
      'oi', 'ola', 'tudo bem', 'bom dia', 'boa tarde', 'boa noite', 
      'com certeza', 'claro', 'perfeito', 'combinado', 'pode deixar', 
      'sem problemas', 'deixa comigo', 'vou te ajudar', 'prazer', 
      'obrigado', 'obrigada', 'valeu', 'abraço', 'disponha'
    ];
    const lowerText = trimmed.toLowerCase();
    const foundWarm = warmWords.filter(w => lowerText.includes(w));
    if (foundWarm.length > 0) {
      score += Math.min(25, foundWarm.length * 10);
      tips.push({ type: 'good', text: `Tom amigável detectado com: "${foundWarm.slice(0, 3).join(', ')}".` });
    } else {
      tips.push({ type: 'info', text: 'Use palavras calorosas como "Com certeza!", "Pode deixar!", ou "Olá, tudo bem?".' });
    }

    // 3. Empathy & Active Listening
    const empathyWords = [
      'entendo', 'compreendo', 'peço desculpas', 'desculpa', 'perdão', 
      'sinto muito', 'vou resolver', 'verificando', 'ajudar'
    ];
    const foundEmpathy = empathyWords.filter(w => lowerText.includes(w));
    if (foundEmpathy.length > 0) {
      score += 15;
      tips.push({ type: 'good', text: 'Empatia e escuta ativa presentes na resposta.' });
    }

    // 4. Robotic / Formal Words (Negative)
    const roboticWords = [
      { word: 'prezado', suggestion: 'usar o nome do cliente ou "olá"' },
      { word: 'procedimento', suggestion: 'dizer "etapa" ou explicar o que será feito' },
      { word: 'conforme solicitado', suggestion: 'dizer "como você pediu" ou "aqui está"' },
      { word: 'estarei verificando', suggestion: 'dizer "já vou verificar" ou "estou verificando"' },
      { word: 'aguarde um instante', suggestion: 'dizer "um segundinho, por favor" ou "só um momento"' },
      { word: 'aguarde um momento', suggestion: 'dizer "só um minutinho"' },
      { word: 'infelizmente não', suggestion: 'oferecer uma alternativa de forma positiva' },
      { word: 'transferido', suggestion: 'dizer "vou te conectar com..."' },
      { word: 'sistema', suggestion: 'evitar mencionar "o sistema"' }
    ];
    let foundRobotic = false;
    roboticWords.forEach(rw => {
      if (rw.word && lowerText.includes(rw.word)) {
        score -= 15;
        foundRobotic = true;
        tips.push({ type: 'warning', text: `Evite "${rw.word}". Sugestão: ${rw.suggestion}.` });
      }
    });
    if (!foundRobotic && trimmed.length > 10) {
      score += 15;
      tips.push({ type: 'good', text: 'Linguagem natural e livre de termos corporativos engessados.' });
    }

    // 5. Length
    if (trimmed.length > 250) {
      score -= 10;
      tips.push({ type: 'info', text: 'Mensagem longa. Parágrafos curtos facilitam a leitura no WhatsApp.' });
    } else if (trimmed.length > 20 && trimmed.length <= 180) {
      score += 15;
    }

    // Bound score
    score = Math.max(10, Math.min(100, score));

    let level = 'Excelente';
    let color = 'text-emerald-400';
    let bg = 'bg-emerald-500/10';
    
    if (score < 50) {
      level = 'Robótico / Frio';
      color = 'text-red-400';
      bg = 'bg-red-500/10';
    } else if (score < 80) {
      level = 'Neutro / Apenas OK';
      color = 'text-yellow-400';
      bg = 'bg-yellow-500/10';
    }

    return { score, tips, level, color, bg };
  };

  const loadCorrectionsAndRagStatus = async () => {
    setIsLoadingCorrections(true);
    setIsLoadingRagDoc(true);
    try {
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || localStorage.getItem('tenantId') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
      const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

      const corrRes = await fetch(`${ENGINE_URL}/api/v1/knowledge/corrections?tenant_id=${tenantId}`, {
        headers: { 'x-tenant-id': tenantId }
      });
      if (corrRes.ok) {
        const data = await corrRes.json();
        setCorrectionsList(data.corrections || []);
      }

      const docsRes = await fetch(`${ENGINE_URL}/api/v1/knowledge`, {
        headers: { 'x-tenant-id': tenantId }
      });
      if (docsRes.ok) {
        const docs = await docsRes.json();
        const manualDoc = docs.find((d: any) => d.name === "Manual de Raciocínio e Ajustes da I.A");
        setRagDocInfo(manualDoc || null);
      }
    } catch (e) {
      console.error('Erro ao carregar dados do cockpit RAG:', e);
    } finally {
      setIsLoadingCorrections(false);
      setIsLoadingRagDoc(false);
    }
  };

  const handleDeleteCorrection = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta correção de raciocínio da IA?')) return;
    try {
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || localStorage.getItem('tenantId') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
      const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

      const res = await fetch(`${ENGINE_URL}/api/v1/knowledge/corrections/${id}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': tenantId }
      });

      if (res.ok) {
        setCorrectionsList(prev => prev.filter(c => c.id !== id));
        loadCorrectionsAndRagStatus();
      } else {
        const err = await res.json();
        alert(`Erro ao excluir correção: ${err.error || 'Erro desconhecido'}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Falha ao conectar com o servidor: ${e.message}`);
    }
  };

  const getPrecedingContextMessages = () => {
    if (!activeChat?.messages || !reasoningBotMessage) return [];
    const idx = activeChat.messages.findIndex((m: any) => m.id === reasoningBotMessage.id);
    if (idx === -1) return [];
    const startIdx = Math.max(0, idx - 4);
    return activeChat.messages.slice(startIdx, idx);
  };

  const handleHelperAction = async (action: string, tone?: string) => {
    if (!reasoningUserQuery.trim() && action === 'suggest') {
      alert('Escreva a pergunta do cliente primeiro para que a IA possa sugerir a resposta.');
      return;
    }
    if (!reasoningCorrectedText.trim() && action !== 'suggest') {
      alert('Escreva ou selecione uma resposta antes de usar esta ferramenta.');
      return;
    }

    setIsHelperLoading(true);
    setHelperActionActive(action + (tone ? `-${tone}` : ''));
    try {
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || localStorage.getItem('tenantId') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
      const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/corrections/helper`, {
        method: 'POST',
        headers: {
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: reasoningCorrectedText || reasoningBotMessage?.text || '',
          action,
          tone,
          user_query: reasoningUserQuery
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.text) {
          setReasoningCorrectedText(data.text);
        }
      } else {
        const errData = await response.json();
        alert(`Erro do assistente de IA: ${errData.error || 'Erro desconhecido'}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Falha ao conectar com o assistente: ${e.message}`);
    } finally {
      setIsHelperLoading(false);
      setHelperActionActive(null);
    }
  };

  const handleOpenAlterarRaciocinio = (botMsg: any) => {
    setReasoningBotMessage(botMsg);
    setReasoningCorrectedText(botMsg.text || '');
    setActiveLeftTab('context');
    setActiveMobileTab('editor');
    setConversationContextSummary('');
    
    // Encontra a mensagem do cliente que antecede a mensagem do robô na conversa atual
    let query = '';
    if (activeChat?.messages) {
      const idx = activeChat.messages.findIndex((m: any) => m.id === botMsg.id);
      if (idx > 0) {
        for (let i = idx - 1; i >= 0; i--) {
          const prevMsg = activeChat.messages[i];
          if (prevMsg.sender !== 'bot' && prevMsg.sender !== 'human' && prevMsg.sender !== 'system' && prevMsg.text) {
            query = prevMsg.text;
            break;
          }
        }
      }
    }
    setReasoningUserQuery(query);
    setIsReasoningModalOpen(true);
    loadCorrectionsAndRagStatus();

    // Buscar resumo de contexto da conversa via helper API
    if (activeChat?.id) {
      setIsContextSummaryLoading(true);
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || localStorage.getItem('tenantId') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
      const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
      fetch(`${ENGINE_URL}/api/v1/knowledge/corrections/helper`, {
        method: 'POST',
        headers: {
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'summarize-context',
          conversationId: activeChat.conv_id || activeChat.id
        })
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Response not ok');
      })
      .then(data => {
        if (data.success && data.text) {
          setConversationContextSummary(data.text);
        }
      })
      .catch(err => console.error('Erro ao carregar sumário de contexto:', err))
      .finally(() => setIsContextSummaryLoading(false));
    }
  };

  useEffect(() => {
    (window as any).debugOpenAlterarRaciocinio = handleOpenAlterarRaciocinio;
  }, []);

  const handleSaveReasoningCorrection = async () => {
    if (!reasoningUserQuery.trim() || !reasoningCorrectedText.trim() || !reasoningBotMessage) return;
    
    setIsSavingReasoning(true);
    try {
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || localStorage.getItem('tenantId') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
      const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/corrections`, {
        method: 'POST',
        headers: {
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_query: reasoningUserQuery.trim(),
          original_response: reasoningBotMessage.text || '',
          corrected_response: reasoningCorrectedText.trim(),
          context_summary: conversationContextSummary.trim() || null
        })
      });

      if (response.ok) {
        setIsReasoningModalOpen(false);
        setReasoningBotMessage(null);
        setReasoningUserQuery('');
        setReasoningCorrectedText('');
        alert('Raciocínio atualizado com sucesso! A IA aprenderá com este exemplo.');
      } else {
        const errData = await response.json();
        alert(`Erro ao salvar correção: ${errData.error || 'Erro desconhecido'}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Falha ao conectar com o servidor: ${e.message}`);
    } finally {
      setIsSavingReasoning(false);
    }
  };


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

  const executeResolve = async (contactId: string, reactivateAi: boolean) => {
    // 1. Salva a posição de scroll atual da lista lateral de chats
    const currentScrollTop = contactListRef.current ? contactListRef.current.scrollTop : 0;
    
    try {
      // 2. Dispara a ação de resolução
      await resolveConversation(contactId, reactivateAi);
      
      // 3. Estabilização absoluta em cascata de tempo para anular saltos enquanto o Framer-motion anima a saída
      const restoreScroll = () => {
        if (contactListRef.current) {
          contactListRef.current.scrollTop = currentScrollTop;
        }
      };
      
      restoreScroll();
      requestAnimationFrame(restoreScroll);
      [10, 30, 50, 100, 180, 300, 500].forEach(ms => setTimeout(restoreScroll, ms));
    } catch (err: any) {
      alert('Erro ao resolver conversa: ' + (err.message || String(err)));
    }
  };

  const handleResolveConversation = async (contactId: string) => {
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
      const realContactId = contact.id.includes('_') ? contact.id.split('_')[0] : contact.id;

      // 1. Caso o próprio contato seja uma empresa (está em allCompanies) e não tenha CNPJ
      const isSelfCompany = allCompanies.some(c => c.id === realContactId);
      if (isSelfCompany && !contact.document_number) {
        alert(`O CNPJ da empresa "${contact.fantasy_name || contact.name}" é obrigatório para resolver o ticket. Por favor, cadastre o CNPJ na ficha da empresa.`);
        setCompanyDetailsOpen(contact);
        return;
      }
      
      // 2. Caso o contato tenha empresas vinculadas e alguma não tenha CNPJ cadastrado
      const linkedCompanies = (contact.company_ids || [])
        .map((id: string) => allCompanies.find((c: any) => c.id === id))
        .filter(Boolean) || [];
      const companyWithMissingCnpj = linkedCompanies.find((c: any) => !c.document_number);
      
      if (companyWithMissingCnpj) {
        alert(`O CNPJ da empresa "${companyWithMissingCnpj.fantasy_name || companyWithMissingCnpj.name}" é obrigatório para resolver o ticket. Por favor, cadastre o CNPJ na ficha da empresa.`);
        setCompanyDetailsOpen(companyWithMissingCnpj);
        return;
      }
    }
    
    await executeResolve(contactId, true);
  };

  const handleStartChatWithSearchedNumber = async (phoneNumber: string) => {
    let cleanPhone = phoneNumber.replace(/\D/g, '');
    if (!cleanPhone) return;
    
    if (cleanPhone.length >= 10 && cleanPhone.length <= 11 && !cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone;
    }
    
    const jid = `${cleanPhone}@s.whatsapp.net`;
    const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id') || tenantInfo?.id;
    const properInstance = activeChannelFilter || connectedInstanceName;

    try {
      let { data: existingContact } = await supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('phone', cleanPhone)
        .maybeSingle();
        
      if (!existingContact) {
        const { data: newContact, error } = await supabase.from('contacts').insert({
          tenant_id: tenantId,
          instance_id: properInstance || null,
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
         useChatStore.setState(state => {
           const exists = state.contacts.find(c => c.id === existingContact.id);
           if (exists) return state;
           return { 
             contacts: [{
               ...existingContact,
               instance_id: properInstance || existingContact.instance_id,
               messages: [],
               unread: 0,
               custom_name: existingContact.custom_name || existingContact.name,
             }, ...state.contacts] 
           };
         });

         setActiveChat(existingContact.id);
         const targetInstance = properInstance || existingContact.instance_id;
         if (targetInstance) {
           useChatStore.getState().loadHistoricalMessages(existingContact.id, targetInstance);
         }
         setSearchTerm('');
      }
    } catch (err) {
      console.error('Erro no fluxo de iniciar novo chat com número pesquisado:', err);
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
      setReplyMessage(null); // Limpa rascunho de resposta (quote) ao trocar de conversa
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

    (async () => {
      try {
        const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id') || tenantInfo?.id;
        if (!tenantId) return;

        // 1. Buscar informações da empresa logada para ver seu grupo econômico
        const { data: currentComp } = await supabase
          .from('companies')
          .select('id, economic_group_id')
          .eq('id', tenantId)
          .maybeSingle();

        let allowedTenants = [tenantId];

        if (currentComp?.economic_group_id) {
          const { data: groupCompanies } = await supabase
            .from('companies')
            .select('id')
            .eq('economic_group_id', currentComp.economic_group_id);
          
          if (groupCompanies && groupCompanies.length > 0) {
            allowedTenants = groupCompanies.map(c => c.id);
          }
        }

        // 2. Buscar instâncias pertencentes ao grupo econômico
        const { data } = await supabase
          .from('whatsapp_instances')
          .select('id, display_name, color, status, tenant_id')
          .in('tenant_id', allowedTenants);

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

          const newStatuses: Record<string, string> = {};
          data.forEach(d => { 
             nameMap[d.id] = d.display_name; 
             if(d.color) colorMap[d.id] = d.color;
             newStatuses[d.id] = d.status;
          });
          
          useChatStore.setState(state => ({
             instancesStatus: {
                ...state.instancesStatus,
                ...newStatuses
             }
          }));
          
          setInstanceNamesMap(nameMap);
          setInstanceColorsMap(colorMap);
          setAvailableInstancesList(availableInstances);
        }
      } catch (err) {
        console.error("Erro ao carregar instâncias permitidas no ChatDashboard:", err);
      }
    })();
  }, []);

  // Solução PWA: Atualiza os dados (contatos e mensagens) e força reconexão Realtime com Cooldown de 10s quando volta do background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastSyncTimeRef.current < 10000) {
          console.log('[PWA Sync] Ignorando sincronização excessiva (cooldown ativo)');
          return;
        }
        lastSyncTimeRef.current = now;
        console.log('[PWA Sync] App no foreground, sincronizando...');
        fetchInitialData();
        subscribeToNewMessages(true); // Restabelece/Reconecta canal realtime de forma ativa, eliminando conexões zumbis
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchInitialData, subscribeToNewMessages]);

  // Carrega mensagens do banco local ao clicar num chat novo
  useEffect(() => {
     if (activeChatId && activeChat) {
       const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
       if (properTargetInstance) {
          loadHistoricalMessages(activeChatId, properTargetInstance);
       }
     }
  }, [activeChatId, activeChat?.instance_id, connectedInstanceName, loadHistoricalMessages]);

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

  const handleTriggerImplantacaoModel = () => {
    if (!activeChatId) {
      alert("Por favor, selecione um contato primeiro para aplicar o modelo de tarefas CRM.");
      return;
    }
    // Fechar dropdown de templates
    setShowTemplatesDropdown(false);
    // Definir agente inicial (o operador logado ou o primeiro agente disponível)
    const initialAgent = currentAgent ? currentAgent.id : (agents.length > 0 ? (agents[0].id || agents[0].user_id) : null);
    setImplantacaoSelectedAgent(initialAgent);
    // Abrir modal premium
    setShowImplantacaoModal(true);
  };

  const handleConfirmImplantacaoModel = async () => {
    setShowImplantacaoModal(false);

    const dias = [
      {
        title: "Dia 01 - Setup Completo",
        checklist: [
          "Mapeamento de infraestrutura, PC, Celular, Rede, Totem, Caixa, Delivery, Cozinha, Bar, Etc...",
          "Instalação de todo o sistema.",
          "Instalação de impressoras com ip especifico.",
          "Configurações de GastroFood, KDS, GestorDelivery, etc..."
        ]
      },
      {
        title: "Dia 02 - Cadastro de Produtos",
        checklist: [
          "Treinamento de cadastros básicos.",
          "Cadastro de categorias= SubGrupos.",
          "Cadastro de Produtos Básico.",
          "Cadastro de Produtos avançado Passos.",
          "Cadastro de Clientes, Colaboradores e Fornecedores.",
          "Cadastro de Usuários e permissões de acesso."
        ]
      },
      {
        title: "Dia 03 - Treinamento Operacional / Vendas",
        checklist: [
          "Modulo Mesa Computador",
          "App Garçom",
          "Módulo Delivery",
          "Módulo KDS",
          "Módulo Gestor Delivery",
          "Módulo AppMotoboy",
          "Financeiro Mobile"
        ]
      },
      {
        title: "Dia 04 - Treinamento Caixa / Fechamento",
        checklist: [
          "Cancelamentos de itens",
          "Impressão Cupom Fiscal",
          "Transferências",
          "Pagamento Nota Pendente.",
          "Alteração pedido delivery",
          "Todas as Mesas e Delivery precisam ser fechados antes de fechar o caixa.",
          "Fechamento de caixa cego",
          "Conferencia de caixa escritório."
        ]
      },
      {
        title: "Dia 05 - Revisão e teste pratico",
        checklist: [
          "Lançamento de pedidos em todos os modulos",
          "Conferencia das vias de produção",
          "Transferência de mesas",
          "Alterações de pedidos",
          "Impressão de cupom fiscal",
          "Cancelamentos",
          "Fechamento de caixa",
          "Conferencia de caixa"
        ]
      }
    ];

    try {
      for (let i = 0; i < dias.length; i++) {
        const dia = dias[i];
        const formattedChecklist = dia.checklist.map((item, idx) => ({
          id: `item-${Date.now()}-${i}-${idx}`,
          text: item,
          completed: false
        }));

        await useChatStore.getState().createInternalNote(
          activeChatId,
          `📋 ${dia.title}`,
          undefined,
          undefined,
          undefined,
          true,
          implantacaoSelectedAgent,
          formattedChecklist
        );
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    } catch (e) {
      console.error("[handleConfirmImplantacaoModel] Erro ao aplicar modelo CRM:", e);
      alert("Houve um erro técnico ao aplicar o modelo de tarefas CRM.");
    }
  };

  const handleExtractRulesForRag = async () => {
    if (!activeChat || !activeChat.messages || activeChat.messages.length === 0) {
      alert("A conversa não possui mensagens para serem analisadas.");
      return;
    }
    
    setIsRagModalOpen(true);
    setIsRagExtracting(true);
    setExtractedRules([]);

    try {
      const chatHistory = activeChat.messages.map(m => ({
        role: m.sender === 'client' ? 'user' : 'model',
        text: m.text
      }));

      const result = await geminiService.extractBusinessRulesForRag(chatHistory);
      
      if (!result.suggestedRules || result.suggestedRules.length === 0) {
        alert("A inteligência artificial não identificou nenhuma regra ou política comercial explícita nesta conversa.");
        setIsRagModalOpen(false);
        setIsRagExtracting(false);
        return;
      }

      // Validar similaridade de cada regra com match semântico contra o servidor RAG
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || localStorage.getItem('tenantId') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
      const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

      const evaluatedRules = await Promise.all(
        result.suggestedRules.map(async (ruleText) => {
          try {
            const matchRes = await fetch(`${ENGINE_URL}/api/v1/knowledge/match`, {
              method: 'POST',
              headers: {
                'x-tenant-id': tenantId,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ query: ruleText })
            });

            if (matchRes.ok) {
              const matchData = await matchRes.json();
              const bestMatch = matchData.matches && matchData.matches.length > 0 ? matchData.matches[0] : null;
              
              if (bestMatch && bestMatch.similarity >= 0.75) {
                return {
                  text: ruleText,
                  checked: false, // Desmarca por padrão por ser duplicada
                  similarity: bestMatch.similarity,
                  matchContent: bestMatch.content
                };
              }
            }
          } catch (matchErr) {
            console.error("Erro no match semântico da regra:", matchErr);
          }

          return {
            text: ruleText,
            checked: true,
            similarity: null,
            matchContent: null
          };
        })
      );

      setExtractedRules(evaluatedRules);
      
      const cleanName = (activeChat.name || activeChat.pushname || activeChat.phone || 'conversa').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "_");
      setSaveFileName(`regras_${cleanName}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '_')}.txt`);

    } catch (err: any) {
      console.error("Erro ao extrair regras para o RAG:", err);
      alert(err.message || "Erro de comunicação ao analisar conversa com a Inteligência Artificial.");
      setIsRagModalOpen(false);
    } finally {
      setIsRagExtracting(false);
    }
  };

  const handleSaveToRag = async () => {
    const approvedRules = extractedRules.filter(r => r.checked);
    if (approvedRules.length === 0) {
      alert("Por favor, selecione pelo menos uma regra para salvar.");
      return;
    }

    if (!saveFileName.trim()) {
      alert("Por favor, informe o nome do arquivo para gravação.");
      return;
    }

    let fileName = saveFileName.trim();
    if (!fileName.endsWith('.txt')) {
      fileName += '.txt';
    }

    setIsSavingToRag(true);

    try {
      const fileContent = approvedRules.map(r => r.text).join('\n\n');
      const virtualFile = new File([fileContent], fileName, { type: 'text/plain' });
      
      const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || localStorage.getItem('tenantId') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
      const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

      const formData = new FormData();
      formData.append('file', virtualFile);

      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/upload`, {
        method: 'POST',
        headers: {
          'x-tenant-id': tenantId
        },
        body: formData
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Erro no upload das regras.');
      }

      alert("Regras de negócio salvas e vetorizadas com sucesso no RAG global!");
      setIsRagModalOpen(false);
      setExtractedRules([]);
    } catch (err: any) {
      console.error("Erro salvando regras no RAG:", err);
      alert(err.message || "Erro ao conectar com o servidor RAG.");
    } finally {
      setIsSavingToRag(false);
    }
  };

  const handleSendHuman = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSendingRef.current) {
      console.warn("[handleSendHuman] Blocked! One message is already sending.");
      return;
    }

    const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
    console.log("[handleSendHuman] Attempting to send. Values:", { inputText, activeChatId, activeChatInstance: activeChat?.instance_id, connectedInstanceName, properTargetInstance });
    
    const isChecklistFilled = isTaskMode && checklistDraft.filter(i => i.trim()).length > 0;
    if ((!inputText.trim() && !isChecklistFilled) || !activeChatId || !properTargetInstance) {
       console.warn("[handleSendHuman] Blocked! One of the required values is missing.");
       return;
    }
    
    // Se a instância estiver offline, alerta e não envia (apenas para chats do WhatsApp)
    if (chatMode !== 'internal_note' && instancesStatus[properTargetInstance] && instancesStatus[properTargetInstance] !== 'connected') {
       alert('Instância offline. Conecte-a para enviar mensagens.');
       return;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (activeChatId && chatMode !== 'internal_note') {
      sendPresenceUpdate(activeChatId, 'paused', properTargetInstance).catch(() => {});
    }
    lastPresenceSentRef.current = 0;
    
    isSendingRef.current = true;
    setIsSendingMessage(true);

    try {
      if (chatMode === 'internal_note') {
        const noteText = !inputText.trim() && isTaskMode ? "📋 Checklist de Tarefa CRM criado." : inputText;
        const formattedChecklist = isTaskMode 
          ? checklistDraft
              .filter(item => item.trim() !== '')
              .map((item, idx) => ({ id: `item-${Date.now()}-${idx}`, text: item, completed: false }))
          : [];

        let uploadedMediaUrl = null;
        if (noteAttachedFile) {
          try {
            // Upload da mídia de anotação privada via bucket do Supabase
            const fileExt = noteAttachedFile.name.split('.').pop();
            const fileName = `${Date.now()}_note_attachment.${fileExt}`;
            const filePath = `${activeChatId}/${fileName}`;
            
            const { data, error } = await supabase.storage
              .from('chat-media')
              .upload(filePath, noteAttachedFile);
              
            if (error) throw error;
            
            const { data: { publicUrl } } = supabase.storage
              .from('chat-media')
              .getPublicUrl(filePath);
              
            uploadedMediaUrl = publicUrl;
          } catch (mediaError) {
            console.error('[handleSendHuman] Erro ao fazer upload de anexo de nota:', mediaError);
            alert('Erro ao fazer upload da mídia anexada.');
            return;
          }
        }
          
        // Chamada ao backend para criar nota
        await useChatStore.getState().createInternalNote(
          activeChatId,
          noteText,
          uploadedMediaUrl || undefined,
          noteAttachedType || undefined,
          noteAttachedFile ? { name: noteAttachedFile.name, size: noteAttachedFile.size } : undefined,
          isTaskMode,
          taskAssignedTo,
          formattedChecklist
        );

        // Criar compromisso na Agenda se estiver agendado
        if (scheduleNote && scheduleNoteDate && scheduleNoteTime) {
          try {
            const startDateTime = new Date(`${scheduleNoteDate}T${scheduleNoteTime}:00`);
            const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000); // 1 hora de duração
            
            const { getRealContactId } = await import('../store/chatStore');
            await useChatStore.getState().createAppointment({
              contact_id: getRealContactId(activeChatId),
              title: scheduleNoteTitle.trim() || noteText.substring(0, 50) || "Lembrete de Nota Interna",
              notes: noteText,
              start_time: startDateTime.toISOString(),
              end_time: endDateTime.toISOString(),
              status: 'scheduled',
              checklist_items: formattedChecklist.map(i => ({ id: i.id, text: i.text, completed: false }))
            });
          } catch (e) {
            console.error("Erro ao criar compromisso associado à nota interna:", e);
          }
        }
        
        // Reseta estados locais
        setInputText('');
        setChecklistDraft([]);
        setIsTaskMode(false);
        setTaskAssignedTo(null);
        setNoteAttachedFile(null);
        setNoteAttachedPreview(null);
        setNoteAttachedType(null);
        setNotePreviewMode(false);
        setScheduleNote(false);
        setScheduleNoteTitle('');
        setScheduleNoteDate('');
        setScheduleNoteTime('');
      } else {
        let finalMessageText = inputText;
        if (replyMessage) {
            const shortQuote = replyMessage.text.length > 80 ? replyMessage.text.substring(0, 80) + '...' : replyMessage.text;
            finalMessageText = `> *Mensagem Citada:* "${shortQuote}"\n\n${inputText}`;
        }

        // Reseta estados locais IMEDIATAMENTE para UX instantânea e responsiva
        setInputText('');
        setReplyMessage(null);
        if (activeChatId) draftsRef.current[activeChatId] = '';
        if (textareaRef.current) {
           textareaRef.current.style.height = 'auto';
        }

        if (pendingMediaToSend) {
          const mediaInfo = pendingMediaToSend;
          setPendingMediaToSend(null);
          
          useChatStore.getState().sendMediaFromUrl(
            activeChatId, 
            mediaInfo.url, 
            mediaInfo.type, 
            properTargetInstance as string, 
            finalMessageText,
            mediaInfo.name
          ).then(() => {
            setQuickReplyToast({ shortcut: 'Mídia', type: 'sent' });
            setTimeout(() => setQuickReplyToast(null), 3500);
          }).catch(mediaError => {
            console.error('[handleSendHuman] Erro ao enviar mídia engatilhada:', mediaError);
            alert('Erro ao enviar a mídia anexada.');
          });
        } else {
          // Envia em segundo plano (background) para não travar a digitação ou exibir loaders
          sendHumanMessage(activeChatId, finalMessageText, properTargetInstance as string).catch(err => {
             console.error('[handleSendHuman] Erro ao enviar mensagem:', err);
          });
        }
      }
    } catch (error) {
      console.error('[handleSendHuman] Erro inesperado durante o envio:', error);
    } finally {
      isSendingRef.current = false;
      setIsSendingMessage(false);
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
    if (!files || files.length === 0 || !activeChatId || !properTargetInstance) return;
    
    if (chatMode === 'internal_note') {
      const file = files[0];
      let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
      if (file.type.startsWith('image/')) mediaType = 'image';
      else if (file.type.startsWith('video/')) mediaType = 'video';
      else if (file.type.startsWith('audio/')) mediaType = 'audio';

      setNoteAttachedFile(file);
      setNoteAttachedType(mediaType);
      if (mediaType === 'image') {
        setNoteAttachedPreview(URL.createObjectURL(file));
      } else {
        setNoteAttachedPreview('attached');
      }
    } else {
      // Loop sequencial for para manter a ordem cronológica correta das mídias na conversa
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
        if (file.type.startsWith('image/')) mediaType = 'image';
        else if (file.type.startsWith('video/')) mediaType = 'video';
        else if (file.type.startsWith('audio/')) mediaType = 'audio';

        await useChatStore.getState().uploadAndSendMedia(activeChatId, file, mediaType, properTargetInstance as string);
      }
      setReplyMessage(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      await processFiles(files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDraggingFile(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    dragCounter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const formatAudioTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsRecordingPaused(true);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const handleResumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsRecordingPaused(false);
      
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  };

  const changePlaybackRate = () => {
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (reviewAudioRef.current) {
      reviewAudioRef.current.playbackRate = nextRate;
    }
  };

  const handleMicClick = async () => {
    const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
    if (!activeChatId || !properTargetInstance) return;

    if (audioState === 'recording') {
       // Stop recording (para revisar)
       handleStopRecording();
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
            const localUrl = URL.createObjectURL(audioBlob);

            setRecordedAudioFile(file);
            setRecordedAudioUrl(localUrl);
            setAudioState('reviewing');
            setAudioPlaying(false);
            setAudioCurrentTime(0);
            setIsRecordingPaused(false);
            setPlaybackRate(1);
         };

         mediaRecorder.start();
         setIsRecording(true);
         setAudioState('recording');
         setRecordingTime(0);
         setIsRecordingPaused(false);

         if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
         recordingIntervalRef.current = setInterval(() => {
           setRecordingTime(prev => prev + 1);
         }, 1000);
       } catch (e) {
         alert("Permissão de microfone negada ou não suportada no seu navegador.");
       }
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setIsRecording(false);
    setIsRecordingPaused(false);
  };

  const handleCancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null; // evita disparar onstop
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setIsRecording(false);
    setIsRecordingPaused(false);
    setAudioState('idle');
    setRecordingTime(0);
    setRecordedAudioFile(null);
    setRecordedAudioUrl(null);
  };

  const handleDiscardAudio = () => {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioFile(null);
    setRecordedAudioUrl(null);
    setAudioState('idle');
    setAudioPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setIsRecordingPaused(false);
    setPlaybackRate(1);
  };

  const handleSendRecordedAudio = async () => {
    const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
    if (!activeChatId || !properTargetInstance || !recordedAudioFile) return;

    try {
      const fileToSend = recordedAudioFile;
      const localUrl = recordedAudioUrl;

      // Reset de estado rápido para melhor percepção de velocidade do atendente (UX instantânea)
      setRecordedAudioFile(null);
      setRecordedAudioUrl(null);
      setAudioState('idle');
      setAudioPlaying(false);
      setAudioCurrentTime(0);
      setAudioDuration(0);
      setIsRecordingPaused(false);
      setPlaybackRate(1);
      setReplyMessage(null);

      if (localUrl) {
        URL.revokeObjectURL(localUrl);
      }

      await useChatStore.getState().uploadAndSendMedia(activeChatId, fileToSend, 'audio', properTargetInstance as string, true);
    } catch (err) {
      console.error('Erro ao enviar áudio gravado:', err);
      alert('Erro ao enviar áudio.');
    }
  };

  const togglePlayAudio = () => {
    if (!reviewAudioRef.current) return;
    if (audioPlaying) {
      reviewAudioRef.current.pause();
      setAudioPlaying(false);
    } else {
      reviewAudioRef.current.playbackRate = playbackRate;
      reviewAudioRef.current.play().then(() => {
        setAudioPlaying(true);
      }).catch(err => {
        console.error('Erro ao reproduzir áudio:', err);
      });
    }
  };

  const handleAudioTimeUpdate = () => {
    if (!reviewAudioRef.current) return;
    setAudioCurrentTime(reviewAudioRef.current.currentTime);
  };

  const handleAudioMetadata = () => {
    if (!reviewAudioRef.current) return;
    setAudioDuration(reviewAudioRef.current.duration || 0);
    reviewAudioRef.current.playbackRate = playbackRate;
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    if (!reviewAudioRef.current) return;
    reviewAudioRef.current.currentTime = targetTime;
    setAudioCurrentTime(targetTime);
  };

  const handleAudioEnded = () => {
    setAudioPlaying(false);
    setAudioCurrentTime(0);
    if (reviewAudioRef.current) {
      reviewAudioRef.current.currentTime = 0;
    }
  };

  const handleGeminiAction = async (type: 'grammar' | 'sales' | 'enchant' | 'support' | 'analyze') => {
    if (!activeChat) return;
    if (type !== 'analyze' && !inputText.trim()) return;

    setIsGeminiProcessing(true);
    try {
      if (type === 'analyze') {
        const now = Date.now();
        let cutoffTime = 0;
        switch (selectedAnalyzePeriod) {
          case '2h':
            cutoffTime = now - 2 * 60 * 60 * 1000;
            break;
          case '24h':
            cutoffTime = now - 24 * 60 * 60 * 1000;
            break;
          case '3d':
            cutoffTime = now - 3 * 24 * 60 * 60 * 1000;
            break;
          case '7d':
            cutoffTime = now - 7 * 24 * 60 * 60 * 1000;
            break;
          case 'all':
          default:
            cutoffTime = 0;
            break;
        }

        let messagesToAnalyze = activeChat.messages || [];
        if (cutoffTime > 0) {
          messagesToAnalyze = messagesToAnalyze.filter(m => new Date(m.timestamp).getTime() >= cutoffTime);
        }

        // Transcrever áudios sem transcrição com mais de 10 segundos no intervalo
        const audiosToTranscribe = messagesToAnalyze.filter(m => m.mediaType === 'audio' && m.mediaUrl && !m.transcription);
        
        if (audiosToTranscribe.length > 0) {
          setTranscriptionProgressText("Verificando duração dos áudios...");
          
          // Função helper para obter duração do áudio no browser
          const getAudioDuration = (url: string): Promise<number> => {
            return new Promise((resolve) => {
              const audio = new Audio(url);
              audio.addEventListener('loadedmetadata', () => {
                resolve(audio.duration);
              });
              audio.addEventListener('error', () => {
                resolve(0);
              });
              setTimeout(() => resolve(0), 4000); // 4s timeout
            });
          };

          // Obter durações em paralelo
          const audiosWithDurations = await Promise.all(
            audiosToTranscribe.map(async (msg) => {
              const duration = await getAudioDuration(msg.mediaUrl!);
              return { msg, duration };
            })
          );

          const longAudios = audiosWithDurations.filter(item => item.duration > 10);

          if (longAudios.length > 0) {
            for (let i = 0; i < longAudios.length; i++) {
              const { msg } = longAudios[i];
              setTranscriptionProgressText(`Transcrevendo áudio ${i + 1} de ${longAudios.length} (duração > 10s)...`);
              try {
                await useChatStore.getState().requestTranscription(msg.id, msg.mediaUrl!);
              } catch (err) {
                console.error("Falha ao transcrever áudio na análise:", err);
              }
            }
          }
          
          setTranscriptionProgressText(null);
        }

        // Atualizar mensagens com novas transcrições da store
        const updatedChat = useChatStore.getState().contacts.find(c => c.id === activeChat.id);
        if (updatedChat) {
          messagesToAnalyze = updatedChat.messages || [];
          if (cutoffTime > 0) {
            messagesToAnalyze = messagesToAnalyze.filter(m => new Date(m.timestamp).getTime() >= cutoffTime);
          }
        }

        // Formatar histórico para o Gemini
        const formattedHistory = messagesToAnalyze.map(m => {
          const senderName = m.sender === 'bot' ? 'IA (ChatBoot)' : m.sender === 'human' ? 'Atendente' : m.sender === 'system' ? 'Sistema' : 'Cliente';
          
          let textContent = m.text || '';
          if (m.mediaType === 'audio') {
            textContent = m.transcription ? `[Áudio Transcrito]: ${m.transcription}` : `[Áudio sem transcrição]`;
          } else if (m.mediaType) {
            textContent = `[Mídia do tipo: ${m.mediaType}] ${m.text || ''}`;
          }
          
          return {
            role: senderName,
            text: textContent,
            time: new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          };
        });

        if (formattedHistory.length === 0) {
          alert('Não há mensagens no período selecionado para analisar.');
          return;
        }

        const suggestion = await geminiService.analyzeConversationWithFeedback(formattedHistory);

        setGeminiModalState({
          isOpen: true,
          originalText: `Período analisado: ${selectedAnalyzePeriod === '2h' ? 'Últimas 2 horas' : selectedAnalyzePeriod === '24h' ? 'Últimas 24 horas' : selectedAnalyzePeriod === '3d' ? 'Últimos 3 dias' : selectedAnalyzePeriod === '7d' ? 'Últimos 7 dias' : 'Conversa Completa'}`,
          suggestedText: JSON.stringify(suggestion),
          intent: 'analyze'
        });

      } else {
        const history = activeChat.messages
          ? activeChat.messages.map(m => ({ 
              role: m.sender === 'bot' ? 'IA' : m.sender === 'human' ? 'Atendente' : 'Cliente', 
              text: m.text || '' 
            }))
          : [];
        
        const suggestion = await geminiService.enhanceMessage(inputText, type, history);
        
        setGeminiModalState({
          isOpen: true,
          originalText: inputText,
          suggestedText: suggestion,
          intent: type
        });
      }
    } catch (error: any) {
      alert(error.message || 'Erro ao comunicar com a IA (Verifique a API Key).');
    } finally {
      setIsGeminiProcessing(false);
      setIsGeminiPopoverOpen(false);
      setGeminiPopoverSubView('main');
      setTranscriptionProgressText(null);
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

  const handleCallContact = async () => {
    const instanceId = useChatStore.getState().evolution_api_instance || useChatStore.getState().tenantInfo?.evolution_api_instance || useChatStore.getState().connectedInstanceName;
    
    if (!instanceId) {
      alert("Nenhuma conexão de WhatsApp ativa foi selecionada para esta empresa. Para realizar chamadas de voz, é necessário ter uma conexão de WhatsApp ativa e pareada no módulo de voz. Redirecionando você para o Gerenciador de Instâncias...");
      navigate('/instances');
      return;
    }

    if (!activeChat || !activeChat.phone) {
      alert("Este contato não possui um número de telefone associado.");
      return;
    }

    // Atualiza o estado das sessões da API do WaCalls antes de prosseguir
    try {
      await useWaCallsStore.getState().fetchSessions();
    } catch (e) {
      console.warn("Falha ao buscar sessões do WaCalls:", e);
    }

    // Verifica se o módulo de voz (WaCalls) está ativado e pareado para esta instância
    const wacallSession = useWaCallsStore.getState().sessions.find(s => s.id === instanceId);
    
    if (!wacallSession || !wacallSession.paired) {
      alert("O Módulo de Ligações de Voz (WaCalls) não está ativado ou não está pareado para esta conexão. Por favor, ative as ligações de voz escaneando o QR Code de Voz no card correspondente. Redirecionando...");
      navigate('/instances');
      return;
    }

    try {
      await useWaCallsStore.getState().startCall(instanceId, activeChat.phone);
    } catch (err: any) {
      alert(err.message || "Erro ao efetuar chamada de voz.");
    }
  };

  return (
    <div className="flex w-full h-[100dvh] min-w-0 bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden font-sans relative">
      
      {/* Modal de Alarme de Compromisso Vencido */}
      {activeAlarmAppointment && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white/95 dark:bg-[#111b21]/95 backdrop-blur-xl rounded-[28px] border-2 border-red-500/40 dark:border-red-500/30 p-6 shadow-[0_20px_50px_rgba(239,68,68,0.25)] flex flex-col gap-5 text-left transform scale-100 transition-all duration-300 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-red-500/20 pb-3">
              <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400 font-extrabold text-sm uppercase tracking-wider">
                <AlertTriangle className="text-red-500 animate-bounce" size={20} />
                Alerta de Compromisso
              </div>
              <button 
                type="button" 
                onClick={() => handleDismissAlarm(activeAlarmAppointment.id)}
                className="text-gray-400 hover:text-red-500 transition-colors p-1.5 hover:bg-red-500/10 rounded-xl"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <h3 className="text-lg font-black text-gray-900 dark:text-white leading-tight">
                {activeAlarmAppointment.title}
              </h3>
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <Clock size={14} />
                <span>
                  {new Date(activeAlarmAppointment.start_time).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
            </div>

            {activeAlarmAppointment.notes && (
              <div className="bg-gray-50 dark:bg-[#202c33] border border-gray-150 dark:border-[#384c56] rounded-2xl p-4 text-xs text-gray-700 dark:text-gray-300 font-medium whitespace-pre-line max-h-32 overflow-y-auto scrollbar-thin">
                {activeAlarmAppointment.notes}
              </div>
            )}

            {/* Checklist de Compromisso */}
            {activeAlarmAppointment.checklist_items && activeAlarmAppointment.checklist_items.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Checklist de Tarefas
                </label>
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto scrollbar-thin pr-1">
                  {activeAlarmAppointment.checklist_items.map((item: any, idx: number) => (
                    <div key={item.id || idx} className="flex items-center gap-3 bg-gray-50/50 dark:bg-[#202c33]/50 hover:bg-gray-100/50 dark:hover:bg-[#202c33]/80 p-2.5 rounded-xl border border-gray-200/50 dark:border-gray-700/50 transition-all">
                      <button
                        type="button"
                        onClick={async () => {
                          const updatedChecklist = activeAlarmAppointment.checklist_items.map((i: any, k: number) => {
                            if ((i.id && i.id === item.id) || (!i.id && k === idx)) {
                              return { ...i, completed: !i.completed };
                            }
                            return i;
                          });
                          
                          // Atualiza local e DB
                          setActiveAlarmAppointment({ ...activeAlarmAppointment, checklist_items: updatedChecklist });
                          await useChatStore.getState().updateAppointment(activeAlarmAppointment.id, {
                            checklist_items: updatedChecklist
                          });
                        }}
                        className="flex items-center justify-center w-5 h-5 rounded-full border border-red-500/30 hover:border-red-500/60 dark:border-red-400/30 dark:hover:border-red-400/60 transition-all cursor-pointer shrink-0"
                      >
                        {item.completed ? (
                          <Check className="text-emerald-500" size={13} strokeWidth={3} />
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full bg-transparent" />
                        )}
                      </button>
                      <span className={cn(
                        "text-xs font-semibold select-none transition-all",
                        item.completed ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-200"
                      )}>
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3.5 mt-2">
              <button
                type="button"
                onClick={() => handleDismissAlarm(activeAlarmAppointment.id)}
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-[#202c33] dark:hover:bg-[#2c3d47] text-gray-700 dark:text-gray-200 rounded-2xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] border border-gray-200/40 dark:border-gray-700/40"
              >
                Dispensar
              </button>
              <button
                type="button"
                onClick={() => handleCompleteAlarmAppointment(
                  activeAlarmAppointment.id,
                  activeAlarmAppointment.checklist_items
                )}
                className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-red-500/20 hover:scale-[1.02] active:scale-[0.98]"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Modal Premium para Extração e Validação de Regras RAG */}
      {isRagModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300 text-left">
          <div className="bg-[#0b141a]/95 border border-amber-500/20 rounded-[2.5rem] p-6 md:p-8 max-w-2xl w-full shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            {/* Glow de fundo */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none"></div>
            
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl shadow-inner border border-amber-500/15">
                  <BrainCircuit size={22} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-gray-100">Extração Inteligente RAG</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Análise semântica da conversa com {activeChat?.name || 'Cliente'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsRagModalOpen(false)}
                className="p-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-xl transition-all"
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin my-2">
              {isRagExtracting ? (
                <div className="py-20 flex flex-col items-center justify-center gap-4 text-gray-400">
                  <div className="relative">
                    <div className="absolute inset-0 bg-amber-500 rounded-full blur-xl opacity-30 animate-pulse"></div>
                    <Loader2 size={40} className="animate-spin text-amber-500 relative z-10" />
                  </div>
                  <div className="text-center space-y-1">
                    <span className="text-sm font-bold text-gray-200 block">Lendo mensagens e processando regras...</span>
                    <span className="text-xs text-gray-400 block">Isso pode levar alguns segundos.</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4.5 mb-2">
                    <p className="text-xs text-gray-300 leading-relaxed font-semibold">
                      💡 Analisamos a conversa e extraímos as seguintes diretrizes corporativas abaixo. 
                      Revise, edite se necessário e selecione o que deseja alimentar na Base RAG do Bot.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {extractedRules.map((rule, idx) => (
                      <div 
                        key={idx} 
                        className={cn(
                          "bg-white/5 dark:bg-black/30 border rounded-2xl p-4 transition-all duration-300 flex flex-col gap-3 relative overflow-hidden animate-in slide-in-from-bottom-2 duration-300",
                          rule.checked ? "border-amber-500/30 bg-amber-500/[0.01]" : "border-white/5 opacity-70"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={rule.checked}
                            onChange={(e) => {
                              const next = [...extractedRules];
                              next[idx].checked = e.target.checked;
                              setExtractedRules(next);
                            }}
                            className="w-4.5 h-4.5 rounded border-gray-600 text-amber-500 focus:ring-amber-500/30 bg-black/40 mt-1 cursor-pointer"
                          />
                          <div className="flex-1">
                            <textarea
                              value={rule.text}
                              onChange={(e) => {
                                const next = [...extractedRules];
                                next[idx].text = e.target.value;
                                setExtractedRules(next);
                              }}
                              rows={2}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 transition-all resize-none font-medium"
                              placeholder="Regra..."
                            />
                            
                            <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
                              {rule.similarity && rule.similarity >= 0.75 ? (
                                <div className="flex items-center gap-1.5 text-[9px] text-amber-500 font-extrabold uppercase bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                                  <AlertTriangle size={10} />
                                  <span>Similaridade de {(rule.similarity * 100).toFixed(0)}%</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-[9px] text-emerald-400 font-extrabold uppercase bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                                  <CheckCircle2 size={10} />
                                  <span>Informação Única / Nova</span>
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setExtractedRules(extractedRules.filter((_, i) => i !== idx));
                                }}
                                className="text-gray-400 hover:text-red-500 text-[10px] font-bold flex items-center gap-1 hover:bg-red-500/10 px-2 py-1 rounded-lg transition-all"
                                title="Descartar Regra"
                              >
                                <Trash2 size={11} />
                                Descartar
                              </button>
                            </div>

                            {rule.similarity && rule.similarity >= 0.75 && rule.matchContent && (
                              <div className="mt-2 text-[10px] text-gray-400 italic bg-black/20 p-2.5 rounded-xl border border-white/5 select-none">
                                <span className="font-bold text-amber-500 not-italic block mb-0.5">Dado Existente no RAG:</span>
                                "{rule.matchContent.substring(0, 160)}..."
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Nome do Arquivo */}
                  <div className="flex flex-col gap-1.5 bg-black/20 p-4.5 rounded-2xl border border-white/5 mt-4">
                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1 select-none">
                      <Database size={11} />
                      <span>Nome do Arquivo na Base RAG (.txt)</span>
                    </label>
                    <input
                      type="text"
                      value={saveFileName}
                      onChange={e => setSaveFileName(e.target.value)}
                      className="bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500/50 transition-all font-semibold"
                      placeholder="Ex: regras_conversa.txt"
                    />
                    <span className="text-[9px] text-gray-500 font-semibold mt-0.5">
                      As regras marcadas serão compiladas e salvas sob este documento no RAG.
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 mt-4 border-t border-white/5 pt-4 shrink-0">
              <button
                type="button"
                onClick={() => setIsRagModalOpen(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-all"
                disabled={isSavingToRag}
              >
                Cancelar
              </button>
              
              {!isRagExtracting && extractedRules.length > 0 && (
                <button
                  type="button"
                  onClick={handleSaveToRag}
                  disabled={isSavingToRag || extractedRules.filter(r => r.checked).length === 0}
                  className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl px-5 py-2.5 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
                >
                  {isSavingToRag ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {isSavingToRag ? 'Gravando no RAG...' : 'Gravar no RAG'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <SnoozeModal 
        isOpen={!!showSnoozeModal}
        onClose={() => setShowSnoozeModal(null)}
        contactId={showSnoozeModal || ''}
      />
      
      <AssociatedCompaniesModal 
        isOpen={associatedCompaniesOpen}
        onClose={() => setAssociatedCompaniesOpen(false)}
        companies={activeChat?.company_ids?.map((id: string) => allCompanies.find((c: any) => c.id === id)).filter(Boolean) || []}
      />

      <CompanyDetailsModal
        isOpen={!!companyDetailsOpen}
        onClose={() => setCompanyDetailsOpen(null)}
        contact={companyDetailsOpen}
        parentContact={activeChat}
        onUpdateCompany={(updatedCompany) => {
          setAllCompanies(prev => prev.map(c => c.id === updatedCompany.id ? { ...c, ...updatedCompany } : c));
          if (activeChat && activeChat.id === updatedCompany.id) {
            setActiveChat({ ...activeChat, ...updatedCompany });
          }
        }}
        onClearAssociation={async () => {
          if (!activeChat || !companyDetailsOpen) return;
          try {
            const { supabase } = await import('../services/supabase');
            const cleanActiveChatId = activeChat.id.includes('_') ? activeChat.id.split('_')[0] : activeChat.id;
            
            // If the open details are of the active chat itself, clear all associated companies. Otherwise, filter out the specific company.
            const newCompanyIds = companyDetailsOpen.id === activeChat.id
              ? []
              : (activeChat.company_ids || []).filter((id: string) => id !== companyDetailsOpen.id);
            
            const updatePayload: any = { company_ids: newCompanyIds };
            if (companyDetailsOpen.id === activeChat.id) {
              updatePayload.fantasy_name = null;
            }
            
            const { error } = await supabase
              .from('contacts')
              .update(updatePayload)
              .eq('id', cleanActiveChatId);
              
            if (error) throw error;
            
            // Update active chat locally
            const updatedActiveChat = { 
              ...activeChat, 
              company_ids: newCompanyIds,
              ...(companyDetailsOpen.id === activeChat.id ? { fantasy_name: null } : {})
            };
            setActiveChat(updatedActiveChat);
            
            // Also update in the contacts list
            const currentContacts = useChatStore.getState().contacts;
            const updatedContacts = currentContacts.map((c: any) => {
              if (c.id === activeChat.id) {
                return { 
                  ...c, 
                  company_ids: newCompanyIds,
                  ...(companyDetailsOpen.id === activeChat.id ? { fantasy_name: null } : {})
                };
              }
              return c;
            });
            useChatStore.setState({ contacts: updatedContacts });
            
            setCompanyDetailsOpen(null);
            alert('Associação removida com sucesso!');
          } catch (err: any) {
            alert('Erro ao remover associação: ' + (err.message || String(err)));
          }
        }}
      />

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
              const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
              
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
      <SnoozedListModal isOpen={isSnoozedListOpen} onClose={() => setIsSnoozedListOpen(false)} />

      {/* Cockpit Premium em Tela Cheia para Alterar Raciocínio da IA */}
      {isReasoningModalOpen && reasoningBotMessage && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-[#0b141a] text-left animate-in fade-in duration-300 font-sans">
          
          {/* Header Barra Superior */}
          <div className="flex items-center justify-between px-6 py-4 bg-[#111b21] border-b border-white/10 shrink-0 shadow-md">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/20 shadow-inner">
                <BrainCircuit size={24} className="animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-100 flex items-center gap-2 tracking-wide">
                  Cockpit de Sintonia Fina da I.A. 
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">Multi-Empresa</span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Ensine a IA a responder melhor fornecendo o comportamento/resposta ideal.
                </p>
              </div>
            </div>
            
            {/* Mobile View Tab Switcher */}
            <div className="flex lg:hidden bg-[#202c33] p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => setActiveMobileTab('editor')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${activeMobileTab === 'editor' ? 'bg-[#005c4b] text-white' : 'text-gray-400'}`}
              >
                Ajuste & Prévia
              </button>
              <button 
                onClick={() => setActiveMobileTab('reference')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${activeMobileTab === 'reference' ? 'bg-[#005c4b] text-white' : 'text-gray-400'}`}
              >
                Histórico & RAG
              </button>
            </div>

            <button 
              onClick={() => {
                setIsReasoningModalOpen(false);
                setReasoningBotMessage(null);
              }}
              className="p-2.5 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-xl transition-all"
              title="Fechar Cockpit"
            >
              <X size={22} />
            </button>
          </div>

          {/* Corpo do Cockpit */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            
            {/* Coluna de Referência (Esquerda no Desktop, Ocultável no Mobile) */}
            <div className={`${
              activeMobileTab === 'reference' ? 'flex' : 'hidden lg:flex'
            } w-full lg:w-[32%] xl:w-[28%] min-w-[320px] max-w-[420px] bg-[#111b21]/40 border-r border-white/5 flex flex-col overflow-hidden`}>
              
              {/* Tabs do Painel Esquerdo */}
              <div className="flex border-b border-white/5 bg-[#111b21]/20 shrink-0">
                <button
                  onClick={() => setActiveLeftTab('context')}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all ${
                    activeLeftTab === 'context' 
                      ? 'border-sky-500 text-sky-400 bg-white/5' 
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <History size={14} /> Conversa & Contexto
                </button>
                <button
                  onClick={() => setActiveLeftTab('manual')}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all ${
                    activeLeftTab === 'manual' 
                      ? 'border-emerald-500 text-emerald-400 bg-white/5' 
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Database size={14} /> Manual RAG da Empresa
                </button>
              </div>

              {/* Conteúdo da Aba Esquerda */}
              <div className="flex-grow overflow-y-auto p-4 scrollbar-thin">
                
                {activeLeftTab === 'context' ? (
                  <div className="space-y-4 font-sans">
                    {/* Informações do Contato Ativo */}
                    {activeChat && (
                      <div className="p-3 bg-[#202c33]/40 border border-white/5 rounded-2xl flex items-center gap-3 shadow-inner">
                        <img 
                          src={activeChat.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(activeChat.name || 'C')}&background=00a884&color=fff`}
                          alt="Avatar"
                          className="w-10 h-10 rounded-full object-cover border border-white/10"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-gray-200 truncate">{activeChat.name || activeChat.phone}</p>
                          <p className="text-[11px] text-gray-400 font-mono mt-0.5">{activeChat.phone}</p>
                        </div>
                        {activeChat.ai_paused && (
                          <span className="text-[9px] font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-full uppercase">
                            I.A Pausada
                          </span>
                        )}
                      </div>
                    )}

                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                      Últimas Mensagens do Chat
                    </div>

                    {/* Preceding Messages */}
                    {getPrecedingContextMessages().map((msg: any, idx: number) => {
                      const isClient = msg.sender !== 'bot' && msg.sender !== 'human' && msg.sender !== 'system';
                      const isBot = msg.sender === 'bot';
                      
                      return (
                        <div 
                          key={idx} 
                          className={`flex flex-col max-w-[85%] ${
                            isClient ? 'mr-auto items-start' : 'ml-auto items-end'
                          }`}
                        >
                          <span className="text-[10px] text-gray-500 mb-0.5 px-2">
                            {isClient ? 'Cliente' : isBot ? 'I.A (Luna)' : 'Atendente'}
                          </span>
                          <div className={`rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                            isClient 
                              ? 'bg-[#202c33] text-white rounded-tl-none border border-white/5 shadow-md' 
                              : 'bg-[#005c4b]/30 text-white rounded-tr-none border border-[#005c4b]/20 shadow-md'
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      );
                    })}

                    {/* Resposta Original (A que está sendo corrigida) */}
                    <div className="pt-2">
                      <div className="rounded-2xl p-4 bg-red-950/20 border border-red-500/25 shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 bg-red-500/10 rounded-bl-xl border-l border-b border-red-500/20 text-[9px] font-bold text-red-400 uppercase tracking-wider">
                          Original Errada
                        </div>
                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block mb-1">
                          Resposta Gerada Pela I.A. (Original)
                        </span>
                        <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap select-text">
                          {reasoningBotMessage.text}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Aba do Manual RAG (Lista de Ajustes Existentes)
                  <div className="space-y-4 font-sans">
                    {/* Status da Vectorização do Manual */}
                    <div className="p-4 bg-[#111b21] border border-white/5 rounded-2xl space-y-2.5 relative overflow-hidden shadow-inner">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5 uppercase">
                          <Database size={13} className="text-emerald-400" /> RAG: Documento Unificado
                        </span>
                        {isLoadingRagDoc ? (
                          <Loader2 size={12} className="animate-spin text-emerald-400" />
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            ragDocInfo?.status === 'ready' 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' 
                              : ragDocInfo?.status === 'processing'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20 animate-pulse'
                              : 'bg-red-500/20 text-red-400 border border-red-500/20'
                          }`}>
                            {ragDocInfo?.status || 'Não Iniciado'}
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-1.5 text-xs text-gray-400 border-t border-white/5 pt-2 font-sans">
                        <div className="flex justify-between">
                          <span>Nome:</span> 
                          <span className="text-gray-200 font-semibold">{ragDocInfo?.name || "Manual de Raciocínio e Ajustes da I.A"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Blocos Vetoriais (Chunks):</span> 
                          <span className="text-gray-200 font-mono">{ragDocInfo?.metadata?.chunks_total || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Última Atualização:</span> 
                          <span className="text-gray-200 font-mono">
                            {(() => {
                              if (ragDocInfo?.metadata?.last_update) {
                                return new Date(ragDocInfo.metadata.last_update).toLocaleString('pt-BR');
                              }
                              if (correctionsList.length > 0) {
                                const dates = correctionsList.map(c => c.created_at ? new Date(c.created_at).getTime() : 0).filter(t => t > 0);
                                if (dates.length > 0) {
                                  return new Date(Math.max(...dates)).toLocaleString('pt-BR');
                                }
                              }
                              return 'Sem atualizações';
                            })()}
                          </span>
                        </div>
                        {ragDocInfo?.metadata?.current_status && (
                          <p className="text-[10px] text-sky-400 mt-1 italic">
                            Status atual: {ragDocInfo.metadata.current_status}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Barra de Pesquisa de Correções */}
                    <div className="relative">
                      <input 
                        type="text"
                        value={searchCorrectionQuery}
                        onChange={(e) => setSearchCorrectionQuery(e.target.value)}
                        placeholder="Pesquisar ajustes de raciocínio..."
                        className="w-full bg-[#111b21] border border-white/5 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-gray-500 outline-none focus:border-emerald-500 transition-all shadow-inner"
                      />
                      <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
                    </div>

                    {/* Lista de Correções */}
                    <div className="space-y-3">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                        Ajustes de Raciocínio ({correctionsList.length})
                      </div>
                      
                      {isLoadingCorrections ? (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-500 gap-2">
                          <Loader2 size={24} className="animate-spin text-emerald-400" />
                          <span className="text-xs">Buscando banco de correções...</span>
                        </div>
                      ) : correctionsList.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-xs italic">
                          Nenhuma correção de raciocínio cadastrada ainda.
                        </div>
                      ) : (
                        correctionsList
                          .filter(c => 
                            c.user_query?.toLowerCase().includes(searchCorrectionQuery.toLowerCase()) || 
                            c.corrected_response?.toLowerCase().includes(searchCorrectionQuery.toLowerCase())
                          )
                          .map((corr) => (
                            <div key={corr.id} className="p-3 bg-[#111b21] border border-white/5 rounded-2xl space-y-2 group shadow-md relative overflow-hidden">
                              <div className="flex justify-between items-start">
                                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                  Regra Ativa
                                </span>
                                <button
                                  onClick={() => handleDeleteCorrection(corr.id)}
                                  className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all"
                                  title="Excluir regra de raciocínio"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                              
                              <div className="space-y-1.5 text-xs">
                                {corr.context_summary && (
                                  <div>
                                    <span className="text-[10px] text-amber-500 font-bold block uppercase tracking-wider">Memória/Contexto da Conversa:</span>
                                    <p className="text-amber-400/90 italic">"{corr.context_summary}"</p>
                                  </div>
                                )}
                                <div>
                                  <span className="text-[10px] text-gray-500 font-bold block uppercase tracking-wider">Se o cliente perguntar:</span>
                                  <p className="text-gray-300 italic">"{corr.user_query}"</p>
                                </div>
                                <div>
                                  <span className="text-[10px] text-gray-500 font-bold block uppercase tracking-wider">A IA deve responder:</span>
                                  <p className="text-gray-200 whitespace-pre-wrap">"{corr.corrected_response}"</p>
                                </div>
                              </div>
                              <div className="flex flex-wrap justify-between items-center text-[9px] text-gray-500 border-t border-white/5 pt-1.5 mt-2 font-mono gap-1">
                                <span>Base: Manual de Raciocínio</span>
                                <span>Atualizado: {corr.created_at ? new Date(corr.created_at).toLocaleString('pt-BR') : 'Sem data'}</span>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Coluna Direita: Studio de Correção (Visível no Desktop, Ocultável no Mobile) */}
            <div className={`${
              activeMobileTab === 'editor' ? 'flex' : 'hidden lg:flex'
            } flex-grow flex-col overflow-y-auto p-6 bg-[#0b141a] scrollbar-thin`}>
              
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                
                {/* Coluna Studio A: Entradas Principais */}
                <div className="space-y-6">
                  {/* Memória da Conversa (Contexto Recente) */}
                  <div className="space-y-1.5 font-sans">
                    <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <History size={14} /> Memória da Conversa (Contexto Recente)
                    </label>
                    <div className="relative">
                      <textarea
                        value={conversationContextSummary}
                        onChange={(e) => setConversationContextSummary(e.target.value)}
                        className="w-full bg-[#111b21] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:border-amber-500 transition-all resize-none shadow-inner"
                        rows={2}
                        placeholder={isContextSummaryLoading ? "Gerando sumário de contexto..." : "Descreva o contexto ou resumo recente da conversa..."}
                      />
                      {isContextSummaryLoading && (
                        <div className="absolute right-3 top-3">
                          <Loader2 size={16} className="animate-spin text-amber-400" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500 block leading-normal">
                      A IA usará esta memória para ter mais contexto em respostas curtas (como "Sim" ou "Não") do cliente.
                    </span>
                  </div>

                  {/* Pergunta do Cliente (Gatilho) */}
                  <div className="space-y-1.5 font-sans">
                    <label className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare size={14} /> Pergunta do Cliente (Gatilho da Resposta)
                    </label>
                    <textarea
                      value={reasoningUserQuery}
                      onChange={(e) => setReasoningUserQuery(e.target.value)}
                      className="w-full bg-[#111b21] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:border-sky-500 transition-all resize-none shadow-inner"
                      rows={2}
                      placeholder="Pergunta do cliente..."
                    />
                    {conversationContextSummary && (
                      <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl space-y-1 animate-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-sky-400 uppercase tracking-wider">
                          <History size={12} /> Contexto / Memória Vinculada
                        </div>
                        <p className="text-xs text-sky-200/90 italic truncate">
                          "{conversationContextSummary}"
                        </p>
                      </div>
                    )}
                    <span className="text-[10px] text-gray-500 block leading-normal">
                      A IA usará a semântica dessa frase para identificar quando aplicar a sua nova resposta corrigida.
                    </span>
                  </div>

                  {/* Resposta Ajustada Esperada */}
                  <div className="space-y-1.5 font-sans">
                    <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Edit2 size={14} /> Resposta Ajustada Esperada (Instrução Correta)
                    </label>
                    <textarea
                      value={reasoningCorrectedText}
                      onChange={(e) => setReasoningCorrectedText(e.target.value)}
                      className="w-full bg-[#111b21] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-gray-500 outline-none focus:border-emerald-500 transition-all min-h-[150px] shadow-inner font-normal"
                      placeholder="Escreva aqui como a IA deveria responder..."
                    />
                    
                    {/* Atalhos Rápidos do Assistente de I.A */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => handleHelperAction('suggest')}
                        disabled={isHelperLoading}
                        className="px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 disabled:opacity-50 text-[11px] font-bold rounded-lg border border-emerald-500/20 flex items-center gap-1 transition-all"
                        title="Sugerir resposta ideal baseada na pergunta"
                      >
                        {helperActionActive === 'suggest' ? <Loader2 size={11} className="animate-spin" /> : <Bot size={12} />}
                        Sugerir Resposta
                      </button>
                      <button
                        onClick={() => handleHelperAction('humanize')}
                        disabled={isHelperLoading}
                        className="px-2.5 py-1 bg-[#202c33]/85 hover:bg-[#202c33] disabled:opacity-50 text-gray-200 text-[11px] font-medium rounded-lg border border-white/5 flex items-center gap-1 transition-all"
                        title="Deixar o texto mais humano e natural"
                      >
                        {helperActionActive === 'humanize' ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={12} />}
                        Humanizar
                      </button>
                      <button
                        onClick={() => handleHelperAction('grammar')}
                        disabled={isHelperLoading}
                        className="px-2.5 py-1 bg-[#202c33]/85 hover:bg-[#202c33] disabled:opacity-50 text-gray-200 text-[11px] font-medium rounded-lg border border-white/5 flex items-center gap-1 transition-all"
                        title="Corrigir erros ortográficos"
                      >
                        {helperActionActive === 'grammar' ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={12} />}
                        Corrigir Gramática
                      </button>
                      <button
                        onClick={() => handleHelperAction('simplify')}
                        disabled={isHelperLoading}
                        className="px-2.5 py-1 bg-[#202c33]/85 hover:bg-[#202c33] disabled:opacity-50 text-gray-200 text-[11px] font-medium rounded-lg border border-white/5 flex items-center gap-1 transition-all"
                        title="Simplificar o texto"
                      >
                        {helperActionActive === 'simplify' ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={12} />}
                        Simplificar
                      </button>
                      <button
                        onClick={() => handleHelperAction('emoji')}
                        disabled={isHelperLoading}
                        className="px-2.5 py-1 bg-[#202c33]/85 hover:bg-[#202c33] disabled:opacity-50 text-gray-200 text-[11px] font-medium rounded-lg border border-white/5 flex items-center gap-1 transition-all"
                        title="Adicionar emojis amigáveis"
                      >
                        {helperActionActive === 'emoji' ? <Loader2 size={11} className="animate-spin" /> : <Smile size={12} />}
                        Emojis
                      </button>
                    </div>
                    
                    {/* Realtime Humanization Meter Panel */}
                    {(() => {
                      const analysis = getHumanizationScore(reasoningCorrectedText);
                      return (
                        <div className={`mt-2 rounded-2xl p-4 ${analysis.bg} border border-white/5 space-y-3 transition-all duration-300`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                              <Sparkles size={14} className="text-emerald-400 animate-pulse" /> Diagnóstico de Humanização
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold uppercase ${analysis.color}`}>
                                {analysis.level}
                              </span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${analysis.color} bg-black/20`}>
                                {analysis.score}%
                              </span>
                            </div>
                          </div>
                          
                          <div className="w-full h-1.5 bg-[#202c33] rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 rounded-full ${
                                analysis.score < 50 ? 'bg-red-500' : analysis.score < 80 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${analysis.score}%` }}
                            />
                          </div>

                          {analysis.tips.length > 0 && (
                            <div className="space-y-1.5 pt-1 border-t border-white/5 max-h-[100px] overflow-y-auto scrollbar-thin">
                              {analysis.tips.map((tip, tIdx) => (
                                <div key={tIdx} className="flex items-start gap-1.5 text-xs text-gray-300">
                                  <span className="mt-1 shrink-0">
                                    {tip.type === 'good' ? (
                                      <span className="text-emerald-400">●</span>
                                    ) : tip.type === 'warning' ? (
                                      <span className="text-amber-500">▲</span>
                                    ) : (
                                      <span className="text-sky-400">ℹ</span>
                                    )}
                                  </span>
                                  <p className="leading-snug">{tip.text}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Coluna Studio B: Ferramentas & Preview */}
                <div className="space-y-6">
                  {/* Assistente de Inteligência Artificial */}
                  <div className="bg-[#111b21]/60 border border-white/5 rounded-3xl p-5 space-y-4 shadow-inner relative overflow-hidden font-sans">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
                    
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-xs font-extrabold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                        <Sparkles size={14} /> Assistente de Tom & Humanização (Gemini)
                      </span>
                      {isHelperLoading && (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                          <Loader2 size={12} className="animate-spin" /> Processando texto...
                        </span>
                      )}
                    </div>

                    <div className="space-y-4">
                      {/* Tons de Voz */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Mudar Tom de Voz:</label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { key: 'casual', label: 'Casual / Amigável', icon: Smile },
                            { key: 'professional', label: 'Profissional / Cortês', icon: Briefcase },
                            { key: 'empathetic', label: 'Super Empático', icon: HeartHandshake },
                            { key: 'enthusiastic', label: 'Entusiasta', icon: Sparkles }
                          ].map((t) => (
                            <button
                              key={t.key}
                              onClick={() => handleHelperAction('tone', t.key)}
                              disabled={isHelperLoading}
                              className="px-3 py-1.5 bg-[#202c33]/80 hover:bg-[#202c33] disabled:opacity-50 text-gray-200 text-xs font-medium rounded-xl border border-white/5 hover:border-emerald-500/20 flex items-center gap-1.5 transition-all"
                            >
                              {helperActionActive === `tone-${t.key}` && <Loader2 size={12} className="animate-spin" />}
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Ações Rápidas */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Ferramentas Rápidas de Humanização:</label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleHelperAction('suggest')}
                            disabled={isHelperLoading}
                            className="px-3 py-1.5 bg-[#005c4b] hover:bg-[#005c4b]/80 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/20"
                          >
                            {helperActionActive === 'suggest' ? <Loader2 size={12} className="animate-spin" /> : <Bot size={14} />}
                            Sugerir Resposta Ideal
                          </button>
                          <button
                            onClick={() => handleHelperAction('humanize')}
                            disabled={isHelperLoading}
                            className="px-3 py-1.5 bg-[#202c33]/80 hover:bg-[#202c33] disabled:opacity-50 text-gray-200 text-xs font-medium rounded-xl border border-white/5 flex items-center gap-1.5 transition-all"
                          >
                            {helperActionActive === 'humanize' ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={14} />}
                            Humanizar
                          </button>
                          <button
                            onClick={() => handleHelperAction('empathize')}
                            disabled={isHelperLoading}
                            className="px-3 py-1.5 bg-[#202c33]/80 hover:bg-[#202c33] disabled:opacity-50 text-gray-200 text-xs font-medium rounded-xl border border-white/5 flex items-center gap-1.5 transition-all"
                          >
                            {helperActionActive === 'empathize' ? <Loader2 size={12} className="animate-spin" /> : <HeartHandshake size={14} className="text-emerald-400" />}
                            Aplicar Empatia
                          </button>
                          <button
                            onClick={() => handleHelperAction('simplify')}
                            disabled={isHelperLoading}
                            className="px-3 py-1.5 bg-[#202c33]/80 hover:bg-[#202c33] disabled:opacity-50 text-gray-200 text-xs font-medium rounded-xl border border-white/5 flex items-center gap-1.5 transition-all"
                          >
                            {helperActionActive === 'simplify' ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={14} />}
                            Simplificar Linguagem
                          </button>
                          <button
                            onClick={() => handleHelperAction('emoji')}
                            disabled={isHelperLoading}
                            className="px-3 py-1.5 bg-[#202c33]/80 hover:bg-[#202c33] disabled:opacity-50 text-gray-200 text-xs font-medium rounded-xl border border-white/5 flex items-center gap-1.5 transition-all"
                          >
                            {helperActionActive === 'emoji' ? <Loader2 size={12} className="animate-spin" /> : <Smile size={14} />}
                            Adicionar Emojis
                          </button>
                          <button
                            onClick={() => handleHelperAction('grammar')}
                            disabled={isHelperLoading}
                            className="px-3 py-1.5 bg-[#202c33]/80 hover:bg-[#202c33] disabled:opacity-50 text-gray-200 text-xs font-medium rounded-xl border border-white/5 flex items-center gap-1.5 transition-all"
                          >
                            {helperActionActive === 'grammar' ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={14} />}
                            Corrigir Gramática
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Simulador WhatsApp Live Preview */}
                  <div className="space-y-1.5 font-sans">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Smartphone size={14} /> Pré-visualização do WhatsApp
                    </label>
                    
                    <div className="w-full rounded-3xl overflow-hidden border border-white/10 bg-[#0b141a] shadow-lg flex flex-col relative h-[200px]">
                      <div className="absolute inset-0 bg-opacity-20 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] opacity-[0.04] pointer-events-none"></div>
                      
                      <div className="relative flex-1 overflow-y-auto p-4 flex flex-col justify-end space-y-3">
                        {reasoningUserQuery && (
                          <div className="flex flex-col max-w-[75%] mr-auto items-start animate-in slide-in-from-left duration-300">
                            <div className="rounded-2xl rounded-tl-none px-3.5 py-1.5 text-xs bg-[#202c33] text-white shadow-md">
                              {reasoningUserQuery}
                            </div>
                          </div>
                        )}
                        
                        <div className="flex flex-col max-w-[75%] ml-auto items-end animate-in slide-in-from-right duration-300">
                          <div className="rounded-2xl rounded-tr-none px-3.5 py-1.5 text-xs bg-[#005c4b] text-white shadow-md text-left whitespace-pre-wrap leading-relaxed select-text font-sans">
                            {reasoningCorrectedText || "Digite a resposta acima para ver a prévia..."}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Footer Barra Inferior */}
          <div className="px-6 py-4 bg-[#111b21] border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 shadow-lg font-sans">
            <span className="text-[11px] text-gray-400 flex items-center gap-1.5 max-w-xl text-center sm:text-left leading-normal">
              <Database size={14} className="text-emerald-400 shrink-0" />
              Esta correção é armazenada na tabela RAG de raciocínio da empresa e sincronizada automaticamente em um documento RAG exclusivo (Manual de Ajustes) para que a IA aprenda em novos atendimentos de forma humana e com inteligência distribuída.
            </span>
            
            <div className="flex items-center gap-3 shrink-0">
              <button 
                onClick={() => {
                  setIsReasoningModalOpen(false);
                  setReasoningBotMessage(null);
                }}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 font-semibold rounded-xl text-sm transition-all"
                disabled={isSavingReasoning || isHelperLoading}
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveReasoningCorrection}
                className="px-6 py-2.5 bg-[#00a884] hover:bg-[#008f72] text-white font-bold rounded-xl text-sm shadow-lg shadow-[#00a884]/20 hover:shadow-[#00a884]/30 hover:-translate-y-0.5 transition-all flex items-center gap-2 disabled:opacity-50"
                disabled={isSavingReasoning || isHelperLoading || !reasoningCorrectedText.trim()}
              >
                {isSavingReasoning ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Enriquecendo I.A...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Salvar e Enriquecer IA
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}



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
           if (isSendingRef.current) return;
           const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
           if (activeChatId && properTargetInstance) {
             setInputText('');
             if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
             }
             sendHumanMessage(activeChatId, finalText, properTargetInstance as string).catch(err => {
                console.error('[GeminiEditorModal onSend] Erro ao enviar mensagem:', err);
             });
           }
        }}
      />

      {/* Modal de Confirmação de Resolução de Tickets em Lote (Design Premium) */}
      {isConfirmBatchResolveOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 dark:bg-black/85 backdrop-blur-sm transition-opacity" onClick={() => setIsConfirmBatchResolveOpen(false)} />
          
          <div className="relative bg-white dark:bg-[#202c33] rounded-3xl p-6 max-w-md w-full shadow-2xl border border-violet-500/10 dark:border-violet-500/20 transform transition-all animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center text-violet-600 dark:text-violet-400 mb-4 shadow-inner ring-4 ring-violet-500/5">
                <Ticket size={32} className="animate-pulse" />
              </div>
              
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 leading-snug">
                Fechar Todos os Tickets Ativos?
              </h3>
              
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                Esta ação marcará **todas as conversas ativas** {activeChannelFilter ? `da instância "${activeChannelFilter}"` : ''} como resolvidas (concluídas). Elas serão removidas da visualização ativa e arquivadas no banco de dados.
              </p>
              
              <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-600 dark:text-amber-400 text-xs mb-6 w-full justify-center">
                <AlertTriangle size={14} className="shrink-0" />
                <span>Esta operação será registrada nos logs de auditoria.</span>
              </div>
              
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setIsConfirmBatchResolveOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleBatchResolveConfirm}
                  disabled={isProcessingBatchResolve}
                  className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold bg-gradient-to-tr from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md shadow-violet-500/25 transition-all flex items-center justify-center gap-2"
                >
                  {isProcessingBatchResolve ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <CheckCheck size={16} />
                      Sim, Fechar Todos
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Flutuante de Undo (Desfazer) para Encerramento em Lote */}
      {isUndoToastVisible && (
        <div className="fixed bottom-6 left-6 z-[9999] max-w-sm w-full bg-white/80 dark:bg-[#202c33]/85 backdrop-blur-xl border border-violet-500/20 dark:border-violet-500/30 rounded-3xl p-4 shadow-2xl flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-5 duration-300 ring-4 ring-violet-500/5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-500/20 dark:bg-violet-500/30 rounded-2xl text-violet-600 dark:text-violet-400 flex items-center justify-center shadow-inner">
              <CheckSquare size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-900 dark:text-white">{batchResolvedCount} Tickets Resolvidos</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">Ação registrada na auditoria.</span>
            </div>
          </div>
          <button
            onClick={handleUndoBatchResolve}
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-tr from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold uppercase transition-all shadow-md shadow-violet-500/20"
          >
            <Undo2 size={12} />
            Desfazer
          </button>
        </div>
      )}

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
        <div className={cn(
          "h-20 bg-white/50 dark:bg-[#202c33]/80 backdrop-blur-xl flex flex-col justify-center px-4 py-2 border-b border-[#d1d7db] dark:border-[#222d34] flex-shrink-0 shadow-sm relative transition-all duration-200",
          activeDropdown === 'sidebar-menu' ? "z-30" : "z-10"
        )}>
          {/* Versão e badge no header top-left */}
          <span className="absolute top-1 left-4 text-[10px] font-mono text-[#00a884] opacity-80 whitespace-nowrap">{`v${import.meta.env.PACKAGE_VERSION || '3.1.5'} | Deploy: ${import.meta.env.PACKAGE_BUILD_DATE ? new Date(import.meta.env.PACKAGE_BUILD_DATE).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '13/06/2026, 17:02'}`}</span>
          <div className="flex items-center justify-between w-full mt-2">
            <div className="flex items-center gap-3">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setShowMainSidebar(!showMainSidebar);
                }}
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
              {/* Botão de Controle Global da IA (Glow verde se ativo, cinza/inativo se inativo - Visível apenas em mobile/tablet) */}
              <button 
                className={cn(
                  "p-2 rounded-full transition-all duration-300 relative group lg:hidden",
                  globalAiEnabled 
                    ? "bg-[#00a884]/15 text-[#00a884] hover:bg-[#00a884]/25 shadow-[0_0_12px_rgba(0,168,132,0.3)] border border-[#00a884]/20" 
                    : "bg-gray-100 dark:bg-gray-800/60 text-gray-400 dark:text-slate-500 hover:bg-gray-200 dark:hover:bg-gray-700/60 border border-transparent"
                )}
                title={globalAiEnabled ? "Desativar Robô I.A (Global)" : "Ativar Robô I.A (Global)"}
                onClick={toggleGlobalAi}
              >
                <Bot size={20} className={cn("transition-transform duration-500", globalAiEnabled && "animate-pulse scale-105")} />
                {/* Indicador de Status */}
                <span className={cn(
                  "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white dark:border-[#202c33] shadow-sm transition-all duration-300",
                  globalAiEnabled 
                    ? "bg-emerald-500 animate-pulse" 
                    : "bg-red-500"
                )}></span>
              </button>

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

        {/* Painel Premium de Controle Rápido (Saúde do Sistema & Modo Ticket) */}
        <div className="flex gap-2 mx-3 my-2 z-10 relative">
          {/* Botão de Semáforo de Saúde */}
          <button 
            onClick={() => setShowHealthPanel(!showHealthPanel)}
            className={cn(
              "flex-1 px-3 py-2.5 bg-white/40 dark:bg-black/20 backdrop-blur-md border border-gray-200/50 dark:border-white/5 rounded-2xl flex items-center justify-between transition-all hover:bg-gray-100/50 dark:hover:bg-white/10 active:scale-[0.98] shadow-sm select-none animate-in fade-in",
              showHealthPanel && "bg-gray-100/50 dark:bg-white/10 border-gray-300/50 dark:border-white/10"
            )}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className={cn(
                  "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                  systemHealth === 'green' ? "bg-emerald-400" :
                  systemHealth === 'yellow' ? "bg-amber-400" : "bg-rose-400"
                )}></span>
                <span className={cn(
                  "relative inline-flex rounded-full h-2 w-2",
                  systemHealth === 'green' ? "bg-emerald-500" :
                  systemHealth === 'yellow' ? "bg-amber-500" : "bg-rose-500"
                )}></span>
              </span>
              <span className="text-[11px] font-bold text-gray-600 dark:text-[#d1d7db] truncate">
                {systemHealth === 'green' ? "Operando" :
                 systemHealth === 'yellow' ? (
                   whatsappStatusMemo.total > 0 && whatsappStatusMemo.connectedCount < whatsappStatusMemo.total
                     ? `Atenção (${whatsappStatusMemo.percentage}%)`
                     : "Atenção"
                 ) : "Offline"}
              </span>
            </div>
            <ChevronDown 
              size={12} 
              className={cn(
                "text-gray-400 dark:text-[#aebac1] transition-transform duration-300 shrink-0",
                showHealthPanel && "rotate-180"
              )} 
            />
          </button>

          {/* Botão Modo Ticket Ativo */}
          <div className="flex-1 relative flex items-stretch">
            <button 
              onClick={() => setTicketMode(!ticketMode)}
              className={cn(
                "flex-1 px-3 py-2.5 backdrop-blur-md rounded-2xl flex items-center justify-between transition-all active:scale-[0.98] shadow-sm select-none border animate-in fade-in group",
                ticketMode 
                  ? "bg-violet-500/15 dark:bg-violet-500/25 border-violet-500/30 text-violet-700 dark:text-violet-300 font-semibold" 
                  : "bg-white/40 dark:bg-black/20 border-gray-200/50 dark:border-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-white/10"
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Ticket size={13} className={cn("shrink-0 transition-transform duration-300 group-hover:scale-110", ticketMode && "animate-pulse text-violet-500 dark:text-violet-400")} />
                <span className="text-[11px] font-bold truncate">
                  Tickets
                </span>
              </div>
              
              {ticketMode && (
                <span className="px-1.5 py-0.5 text-[9px] font-extrabold text-violet-600 bg-violet-500/20 dark:text-violet-300 dark:bg-violet-500/30 rounded-full border border-violet-500/20 shrink-0">
                  {activeTicketsCount}
                </span>
              )}
            </button>
            
            {ticketMode && (
              <div className="relative shrink-0 flex items-stretch">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveDropdown(activeDropdown === 'ticket-menu' ? null : 'ticket-menu');
                  }}
                  className="px-1.5 py-2.5 rounded-r-2xl border-l border-violet-500/20 bg-violet-500/10 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400 hover:bg-violet-500/25 flex items-center justify-center transition-all"
                  title="Opções do Ticket"
                >
                  <MoreVertical size={13} />
                </button>
                
                {activeDropdown === 'ticket-menu' && (
                  <div className="absolute right-0 top-11 w-52 bg-white dark:bg-[#233138] border border-gray-100 dark:border-[#304046] rounded-2xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <button 
                      onClick={() => {
                        setTicketMode(false);
                        setActiveDropdown(null);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-violet-500/10 transition-colors flex items-center gap-2"
                    >
                      <Ban size={13} className="text-gray-500 dark:text-gray-400" />
                      Desativar Modo Ticket
                    </button>
                    <button 
                      onClick={() => {
                        setIsConfirmBatchResolveOpen(true);
                        setActiveDropdown(null);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-violet-700 dark:text-violet-400 hover:bg-violet-500/10 transition-colors flex items-center gap-2 border-t border-violet-500/5"
                    >
                      <CheckSquare size={13} className="text-violet-600 dark:text-violet-400" />
                      Fechar todos os tickets
                    </button>
                    <button 
                      onClick={() => {
                        setIsSnoozedListOpen(true);
                        setActiveDropdown(null);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-violet-500/10 transition-colors flex items-center gap-2 border-t border-gray-100 dark:border-[#304046]"
                    >
                      <CalendarClock size={13} className="text-amber-500" />
                      Conversas Adiadas
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>


        {showHealthPanel && (
          <div className="bg-white/40 dark:bg-black/20 backdrop-blur-md border border-gray-200/50 dark:border-white/5 shadow-md rounded-2xl p-3.5 mx-3 mb-2 flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-500 dark:text-[#8696a0] uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Status do Sistema
              </span>
              <button 
                onClick={(e) => { e.stopPropagation(); handleManualSync(); }}
                disabled={isSyncing}
                className={cn(
                  "p-1.5 rounded-lg text-gray-500 dark:text-[#aebac1] hover:bg-gray-100/50 dark:hover:bg-white/10 transition-all flex items-center gap-1 text-[11px] font-semibold",
                  isSyncing && "text-[#00a884] dark:text-[#53bdeb]"
                )}
                title="Sincronizar conexões agora"
              >
                <RefreshCw size={13} className={cn(isSyncing && "animate-spin")} />
                {isSyncing ? "Sincronizando..." : "Sincronizar"}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Status 1: Internet */}
              <div className="bg-gray-50/50 dark:bg-[#202c33]/40 border border-gray-100 dark:border-white/5 rounded-xl p-2 flex flex-col items-center justify-center gap-1.5 text-center transition-all hover:scale-[1.02] duration-300">
                <div className="relative">
                  <Wifi size={16} className={isOnline ? "text-emerald-500" : "text-rose-500"} />
                  <span className={cn(
                    "absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-white dark:border-[#111b21]",
                    isOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                  )}></span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-medium text-gray-400 dark:text-[#8696a0]">Internet</span>
                  <span className="text-[11px] font-bold text-gray-700 dark:text-[#d1d7db]">
                    {isOnline ? "Online" : "Offline"}
                  </span>
                </div>
              </div>

              {/* Status 2: Banco de Dados (Realtime) */}
              <div className="bg-gray-50/50 dark:bg-[#202c33]/40 border border-gray-100 dark:border-white/5 rounded-xl p-2 flex flex-col items-center justify-center gap-1.5 text-center transition-all hover:scale-[1.02] duration-300">
                <div className="relative">
                  <Database size={16} className={
                    realtimeStatus === 'connected' ? "text-emerald-500" :
                    realtimeStatus === 'connecting' ? "text-amber-500" : "text-rose-500"
                  } />
                  <span className={cn(
                    "absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-white dark:border-[#111b21]",
                    realtimeStatus === 'connected' ? "bg-emerald-500 animate-pulse" :
                    realtimeStatus === 'connecting' ? "bg-amber-500 animate-pulse" : "bg-rose-500"
                  )}></span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-medium text-gray-400 dark:text-[#8696a0]">Realtime</span>
                  <span className="text-[11px] font-bold text-gray-700 dark:text-[#d1d7db] truncate max-w-full px-0.5">
                    {realtimeStatus === 'connected' ? "Ativo" :
                     realtimeStatus === 'connecting' ? "Conectando" : "Inativo"}
                  </span>
                </div>
              </div>

              {/* Status 3: Evolution Engine */}
              <div className="bg-gray-50/50 dark:bg-[#202c33]/40 border border-gray-100 dark:border-white/5 rounded-xl p-2 flex flex-col items-center justify-center gap-1.5 text-center transition-all hover:scale-[1.02] duration-300">
                <div className="relative">
                  <ShieldCheck 
                    size={16} 
                    className={
                      whatsappStatusMemo.health === 'green' ? "text-emerald-500" :
                      whatsappStatusMemo.health === 'yellow' ? "text-amber-500" : "text-rose-500"
                    } 
                  />
                  <span className={cn(
                    "absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-white dark:border-[#111b21]",
                    whatsappStatusMemo.health === 'green' ? "bg-emerald-500 animate-pulse" :
                    whatsappStatusMemo.health === 'yellow' ? "bg-amber-500 animate-pulse" : "bg-rose-500"
                  )}></span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-medium text-gray-400 dark:text-[#8696a0]">WhatsApp</span>
                  <span className="text-[11px] font-bold text-gray-700 dark:text-[#d1d7db] truncate max-w-full px-0.5" title={whatsappStatusMemo.label}>
                    {whatsappStatusMemo.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Painel Moderno de Tarefas Ativas do Operador Conectado (Sheila) em Menu Suspenso */}
        {currentAgent && myActiveTasks.length > 0 && (
          <div className="relative shrink-0 mx-3 my-1.5 z-40">
            {/* Overlay invisível para fechamento automático ao clicar fora */}
            {isTasksDropdownOpen && (
              <div 
                className="fixed inset-0 z-40 cursor-default" 
                onClick={() => setIsTasksDropdownOpen(false)}
              />
            )}

            {/* Botão de Disparo do Dropdown */}
            <button
              onClick={() => setIsTasksDropdownOpen(!isTasksDropdownOpen)}
              className={cn(
                "w-full p-3.5 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-500/15 dark:to-transparent border border-amber-500/20 hover:border-amber-500/30 rounded-[20px] shadow-sm flex items-center justify-between transition-all hover:scale-[1.01] active:scale-[0.99] select-none text-left relative overflow-hidden group z-50",
                isTasksDropdownOpen && "ring-1 ring-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/35"
              )}
            >
              {/* Brilho decorativo de fundo glassmorphic */}
              <div className="absolute -right-6 -bottom-6 w-16 h-16 bg-amber-500/10 group-hover:bg-amber-500/25 blur-xl rounded-full transition-colors pointer-events-none"></div>

              <div className="flex items-center gap-2 z-10 min-w-0">
                <ClipboardList size={16} className={cn("text-amber-500 shrink-0", isTasksDropdownOpen ? "animate-bounce" : "animate-pulse")} />
                <span className="text-[11px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest truncate">
                  Minhas Tarefas CRM
                </span>
              </div>

              <div className="flex items-center gap-2 z-10 shrink-0">
                <span className="px-2 py-0.5 bg-amber-500 text-white font-black text-[10px] rounded-full shadow-sm shadow-amber-500/20 font-sans">
                  {myActiveTasks.length} {myActiveTasks.length === 1 ? 'pendente' : 'pendentes'}
                </span>
                <ChevronDown 
                  size={14} 
                  className={cn(
                    "text-amber-600 dark:text-amber-400 transition-transform duration-300 shrink-0",
                    isTasksDropdownOpen && "rotate-180"
                  )} 
                  />
              </div>
            </button>

            {/* Menu Suspenso (Dropdown/Popover) Flutuante */}
            {isTasksDropdownOpen && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 bg-white/95 dark:bg-[#1f2c34]/95 backdrop-blur-md border border-amber-500/25 dark:border-amber-500/20 rounded-[20px] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] p-3 animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col gap-2">
                {/* Indicador superior estético */}
                <div className="text-[10px] font-black text-amber-600/80 dark:text-amber-400/80 uppercase tracking-wider pb-1.5 border-b border-amber-500/10 font-sans flex items-center justify-between">
                  <span>Selecionar Tarefa Pendente</span>
                  <span className="text-[9px] opacity-60 normal-case">Clique para focar</span>
                </div>

                <div className="flex flex-col gap-1.5 max-h-[190px] overflow-y-auto pr-0.5 custom-scrollbar">
                  {myActiveTasks.map((task) => {
                    const channelObj = availableInstancesList.find((inst: any) => inst.id === task.instanceId);
                    const channelName = channelObj ? (channelObj.display_name || channelObj.name) : 'Sem Caixa';
                    return (
                      <button
                        key={task.noteId}
                        onClick={() => handleSelectTask(task.contactId, task.noteId, task.instanceId)}
                        className="w-full text-left p-2.5 bg-[#f0f2f5]/60 dark:bg-[#202c33]/60 hover:bg-amber-500/10 dark:hover:bg-amber-500/10 border border-black/5 dark:border-white/5 hover:border-amber-500/30 rounded-xl flex items-center justify-between gap-3 transition-all hover:scale-[1.01] active:scale-[0.99] group/task-item font-sans"
                        title={`Ir para a conversa de ${task.contactName} na caixa ${channelName}`}
                      >
                        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                          <span className="text-[11px] font-bold text-gray-800 dark:text-gray-200 truncate group-hover/task-item:text-amber-600 dark:group-hover/task-item:text-amber-400 transition-colors">
                            👤 {task.contactName}
                          </span>
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate line-clamp-1">
                            {task.text.replace(/###|#|\*\*|\*/g, '').trim()}
                          </span>
                          <span className="text-[9px] font-bold text-indigo-600/80 dark:text-indigo-400/80 bg-indigo-500/5 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded-md mt-1 self-start flex items-center gap-1 transition-colors group-hover/task-item:bg-indigo-500/10 dark:group-hover/task-item:bg-indigo-500/20">
                            📥 {channelName}
                          </span>
                        </div>
                        <ChevronLeft size={14} className="text-gray-400 group-hover/task-item:text-amber-500 group-hover/task-item:-translate-x-0.5 transition-all shrink-0 rotate-180" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
              {searchTerm && (
                <button 
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="p-1 text-[#54656f] dark:text-[#aebac1] hover:text-red-500 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all flex-shrink-0 animate-in fade-in zoom-in-95 duration-200 active:scale-90"
                  title="Limpar pesquisa"
                >
                  <X size={16} />
                </button>
              )}
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
            <div className="flex flex-col gap-2 relative">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide relative select-none animate-in fade-in slide-in-from-top-2 duration-200">
                 <button 
                    onContextMenu={(e) => { e.preventDefault(); setFilterContextMenu({ type: 'all', x: e.clientX, y: e.clientY }); }}
                    onClick={() => { setFilterType('all'); setSelectedLabelId(null); }} 
                    className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap", filterType === 'all' ? "bg-[#00a884]/10 text-[#00a884] ring-1 ring-[#00a884]/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
                   Tudo
                 </button>
                 <button 
                    onContextMenu={(e) => { e.preventDefault(); setFilterContextMenu({ type: 'unread', x: e.clientX, y: e.clientY }); }}
                    onClick={() => { setFilterType('unread'); setSelectedLabelId(null); }} 
                    className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap", filterType === 'unread' ? "bg-[#00a884]/10 text-[#00a884] ring-1 ring-[#00a884]/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
                   Não Lidas
                 </button>
                 <button 
                    onContextMenu={(e) => { e.preventDefault(); setFilterContextMenu({ type: 'mine', x: e.clientX, y: e.clientY }); }}
                    onClick={() => { setFilterType('mine'); setSelectedLabelId(null); }} 
                    className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1", filterType === 'mine' ? "bg-indigo-500/10 text-indigo-600 ring-1 ring-indigo-500/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
                   <User size={14} className={filterType === 'mine' ? "text-indigo-600" : ""} /> Minhas
                 </button>
                 <button 
                    onContextMenu={(e) => { e.preventDefault(); setFilterContextMenu({ type: 'favorite', x: e.clientX, y: e.clientY }); }}
                    onClick={() => { setFilterType('favorite'); setSelectedLabelId(null); }} 
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
                    onClick={() => { setFilterType('blocked'); setSelectedLabelId(null); }} 
                    className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1", filterType === 'blocked' ? "bg-red-500/10 text-red-600 ring-1 ring-red-500/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
                   <Ban size={14} className={filterType === 'blocked' ? "text-red-600" : ""} /> Bloqueados
                 </button>
              </div>

              {filterType === 'labels' && tenantLabels && tenantLabels.length > 0 && (
                <div className="flex flex-col gap-1.5 p-2.5 bg-gray-50/60 dark:bg-black/30 backdrop-blur-md rounded-2xl border border-black/5 dark:border-white/5 animate-in fade-in slide-in-from-top-2 duration-300 shadow-inner">
                  <span className="text-[10px] font-bold text-gray-500 dark:text-[#8696a0] uppercase tracking-wider px-1 flex items-center gap-1.5">
                    <Tag size={10} className="text-[#00a884] dark:text-emerald-400" />
                    Filtrar por etiqueta:
                  </span>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 px-0.5 scrollbar-hide select-none">
                    <button
                      onClick={() => setSelectedLabelId(null)}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5",
                        selectedLabelId === null
                          ? "bg-[#00a884]/15 text-[#00a884] dark:text-emerald-400 ring-1 ring-[#00a884]/30"
                          : "bg-gray-100 dark:bg-[#202c33] text-gray-500 dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700"
                      )}
                    >
                      Todas
                    </button>
                    {tenantLabels.map((label) => {
                      const isSelected = selectedLabelId === label.id;
                      const styles = resolveLabelColor(label.color);
                      return (
                        <button
                          key={label.id}
                          onClick={() => setSelectedLabelId(label.id)}
                          className={cn(
                            "px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 border shadow-sm",
                            isSelected
                              ? ""
                              : "bg-gray-100 dark:bg-[#202c33] border-transparent text-gray-600 dark:text-[#d1d7db] hover:bg-gray-200 dark:hover:bg-gray-700"
                          )}
                          style={isSelected ? {
                            backgroundColor: styles.bg,
                            borderColor: styles.border,
                            color: styles.text
                          } : {}}
                        >
                          <span 
                            className="w-2 h-2 rounded-full shadow-inner shrink-0" 
                            style={{ backgroundColor: styles.hex }}
                          />
                          <span>{label.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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

        <div 
          ref={contactListRef} 
          onScroll={handleContactScroll} 
          className="flex-1 overflow-y-auto custom-scrollbar"
        >
           <AnimatePresence mode="popLayout">
            {/* Expressão 1: Nenhum contato encontrado durante a busca */}
            {filteredContacts.length === 0 && searchTerm && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key="no-contacts"
                className="flex flex-col items-center justify-center p-6 text-center w-full"
              >
                <div className="w-full max-w-sm bg-white/5 dark:bg-[#182229]/30 backdrop-blur-md border border-gray-100 dark:border-white/5 rounded-3xl p-6 shadow-xl flex flex-col items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-500 animate-pulse">
                    <MessageSquarePlus size={24} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-semibold text-gray-700 dark:text-[#d1d7db]">
                      Nenhum contato encontrado
                    </p>
                    <p className="text-xs text-gray-400 dark:text-[#8696a0] max-w-[200px] mx-auto">
                      Não encontramos nenhum chat ou contato para "{searchTerm}".
                    </p>
                  </div>
                  
                  {searchTerm.replace(/\D/g, '').length >= 8 && (
                    <button
                      onClick={() => handleStartChatWithSearchedNumber(searchTerm.replace(/\D/g, ''))}
                      className="w-full flex items-center justify-center gap-2.5 px-5 py-3.5 bg-[#00a884] hover:bg-[#008f70] text-white rounded-2xl shadow-lg hover:shadow-emerald-500/20 font-semibold text-sm transition-all active:scale-95 hover:scale-[1.02] duration-200"
                    >
                      <MessageSquarePlus size={18} className="shrink-0" />
                      <span>Enviar mensagem para {formatPhoneNumber(searchTerm.replace(/\D/g, ''))}</span>
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Expressão 2: Renderização estável dos contatos correspondentes */}
            {(filteredContacts.length > 0 || !searchTerm) && filteredContacts.slice(0, contactPageLimit).map((contact) => {
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
              const instColor = contact.instance_id ? instanceColorsMap[contact.instance_id] : undefined;

              const lastMsgText = (() => {
                if (!lastMsg) return contact.last_message_preview || '';
                if (lastMsg.text) return lastMsg.text;
                if (lastMsg.mediaType === 'image') return '📸 Imagem';
                if (lastMsg.mediaType === 'video') return '🎥 Vídeo';
                if (lastMsg.mediaType === 'audio') return '🎵 Áudio';
                if (lastMsg.mediaType === 'document') return '📁 Documento';
                return contact.last_message_preview || 'Mídia';
              })();

              return (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ type: "spring", stiffness: 350, damping: 35 }}
                  key={contact.id}
                  onClick={() => {
                    setActiveChat(contact.id);
                    const properTargetInstance = getStrictInstance(contact) || activeChannelFilter || contact.instance_id || connectedInstanceName;
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
                    "group flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-[#f2f2f2] dark:border-[#222d34] overflow-visible select-none",
                    activeChatId === contact.id ? "bg-[#f0f2f5] dark:bg-[#2a3942]" : "hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]",
                    activeDropdown === contact.id ? "z-30 relative" : "relative z-0"
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
                           {/* Nome e Flag / Badges de Prioridade */}
                           <span className="font-semibold text-[#111b21] dark:text-[#e9edef] text-sm tracking-tight truncate flex items-center justify-between gap-1.5 w-full">
                             <span className="truncate">{getContactDisplayName(contact.custom_name || contact.name, contact.push_name, contact.phone)}</span>
                             <div className="flex items-center gap-1 shrink-0">
                               {(() => {
                                 const getCleanId = (id: string) => id.includes('_') ? id.split('_')[0] : id;
                                 const contactTasks = globalActiveTasks.filter(t => 
                                   getCleanId(t.contactId) === getCleanId(contact.id)
                                 );
                                 if (contactTasks.length > 0) {
                                   return (
                                     <button
                                       type="button"
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         handleOpenContactTasks(contact.id);
                                       }}
                                       className="px-1.5 py-[2px] rounded-md text-[8px] font-black uppercase bg-amber-500/25 hover:bg-amber-500/35 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1 shadow-sm transition-all hover:scale-105 active:scale-95 animate-pulse shrink-0"
                                       title={`${contactTasks.length} ${contactTasks.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'} no CRM. Clique para visualizar.`}
                                     >
                                       <ClipboardList size={8} className="text-amber-500 shrink-0" />
                                       CRM: {contactTasks.length}
                                     </button>
                                   );
                                 }
                                 return null;
                               })()}
                               {contact.priority === 'urgent' && (
                                 <span className="px-1.5 py-[2px] rounded-md text-[8px] font-extrabold uppercase bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-0.5 shadow-sm animate-pulse">
                                   <Flag size={8} className="fill-current" />
                                   Urgente
                                 </span>
                               )}
                               {contact.priority === 'high' && (
                                 <span className="px-1.5 py-[2px] rounded-md text-[8px] font-extrabold uppercase bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-0.5 shadow-sm">
                                   <Flag size={8} className="fill-current" />
                                   Alta
                                 </span>
                               )}
                               {contact.conv_status === 'snoozed' && contact.snoozed_until && new Date(contact.snoozed_until).getTime() > Date.now() && (
                                 <span className="px-1.5 py-[2px] rounded-md text-[8px] font-extrabold uppercase bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 flex items-center gap-0.5 shadow-sm">
                                   <Clock size={8} />
                                   Adiado
                                 </span>
                               )}
                             </div>
                           </span>
  
                           {/* Labels and Assigned Agent on a new line */}
                           {(contact.assigned_to || (contact.conv_labels && contact.conv_labels.length > 0)) && (
                             <div className="flex items-center gap-1.5 overflow-hidden w-full flex-wrap mt-1">
                               {contact.assigned_to && (
                                 <span className="shrink-0 px-1.5 py-[2px] bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 text-[8px] font-extrabold uppercase rounded-md flex items-center gap-1 shadow-sm">
                                   <User size={8} />
                                   <span className="max-w-[60px] truncate">{agents.find(a => a.id === contact.assigned_to)?.full_name?.split(' ')[0] || 'Agente'}</span>
                                 </span>
                               )}
                               {contact.conv_labels && contact.conv_labels.length > 0 && (
                                 <div className="flex items-center gap-1.5 overflow-hidden shrink-0 flex-wrap mt-0.5">
                                   {contact.conv_labels.map((l: any, i: number) => {
                                     const styles = resolveLabelColor(l.color);
                                     return (
                                       <span 
                                         key={i} 
                                         className="px-2 py-[2.5px] text-[9px] font-bold rounded-full flex items-center max-w-[100px] truncate shadow-sm border transition-all hover:scale-105 duration-200" 
                                         style={{ 
                                           backgroundColor: styles.bg, 
                                           borderColor: styles.border, 
                                           color: styles.text 
                                         }} 
                                         title={l.name}
                                       >
                                         <span 
                                           className="w-1.5 h-1.5 rounded-full mr-1.5 shrink-0 shadow-inner" 
                                           style={{ backgroundColor: styles.hex }}
                                         />
                                         <span className="truncate tracking-wide">{l.name}</span>
                                       </span>
                                     );
                                    })}
                                 </div>
                               )}
                             </div>
                           )}
                         </div>
                           {contact.fantasy_name ? (
                             (() => {
                               const linkedCompanies = contact.company_ids
                                 ?.map((id: string) => allCompanies.find((c: any) => c.id === id))
                                 .filter(Boolean) || [];
                               const contactGroups = tenantInfo?.settings?.contactGroups || [];
                               const matchingGroups = contactGroups.filter((g: any) => 
                                 (Array.isArray(contact.tags) && contact.tags.includes(g.id)) ||
                                 linkedCompanies.some((c: any) => Array.isArray(c.tags) && c.tags.includes(g.id))
                               );
                               const hasGroup = matchingGroups.length > 0;
                               const hasCnpj = !!contact.document_number || linkedCompanies.some((c: any) => !!c.document_number);
                               const missingCnpj = !hasCnpj && !hasGroup;
                               return (
                                 <div className="flex items-center gap-1.5 truncate">
                                   <span className={cn("text-[11px] truncate flex items-center gap-1", missingCnpj ? "text-rose-500 dark:text-rose-400 font-medium" : "text-gray-500 dark:text-[#8696a0]")}>
                                     {missingCnpj ? <AlertTriangle size={10} className="shrink-0 text-rose-500 animate-pulse" /> : <Building2 size={10} className="shrink-0" />}
                                     {contact.fantasy_name}
                                   </span>
                                   {missingCnpj && (
                                     <span className="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-[1px] rounded border border-rose-500/20 shrink-0">FALTA CNPJ</span>
                                   )}
                                   {hasGroup && matchingGroups.map((g: any) => (
                                     <span 
                                       key={g.id} 
                                       className="text-[9px] font-bold px-1.5 py-[1px] rounded border shrink-0"
                                       style={{
                                         backgroundColor: `${g.color}15`,
                                         borderColor: `${g.color}30`,
                                         color: g.color
                                       }}
                                     >
                                       {g.name}
                                     </span>
                                   ))}
                                 </div>
                               );
                             })()
                           ) : (
                             (() => {
                               const linkedCompanies = contact.company_ids
                                 ?.map((id: string) => allCompanies.find((c: any) => c.id === id))
                                 .filter(Boolean) || [];
                               if (linkedCompanies.length > 0) {
                                 const contactGroups = tenantInfo?.settings?.contactGroups || [];
                                 const matchingGroups = contactGroups.filter((g: any) => 
                                   (Array.isArray(contact.tags) && contact.tags.includes(g.id)) ||
                                   linkedCompanies.some((c: any) => Array.isArray(c.tags) && c.tags.includes(g.id))
                                 );
                                 const hasGroup = matchingGroups.length > 0;
                                 const hasCnpj = !!contact.document_number || linkedCompanies.some((c: any) => !!c.document_number);
                                 const missingCnpj = !hasCnpj && !hasGroup;
                                 return (
                                   <div className="flex items-center gap-1.5 truncate">
                                     <span className={cn("text-[11px] font-medium truncate flex items-center gap-1", missingCnpj ? "text-rose-500 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                                       {missingCnpj ? <AlertTriangle size={10} className="shrink-0 text-rose-500 animate-pulse" /> : <Building2 size={10} className="shrink-0" />}
                                       {linkedCompanies[0].fantasy_name || linkedCompanies[0].name}
                                       {linkedCompanies.length > 1 && ` (+${linkedCompanies.length - 1})`}
                                     </span>
                                     {missingCnpj && (
                                       <span className="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-1.5 py-[1px] rounded border border-rose-500/20 shrink-0">FALTA CNPJ</span>
                                     )}
                                     {hasGroup && matchingGroups.map((g: any) => (
                                       <span 
                                         key={g.id} 
                                         className="text-[9px] font-bold px-1.5 py-[1px] rounded border shrink-0"
                                         style={{
                                           backgroundColor: `${g.color}15`,
                                           borderColor: `${g.color}30`,
                                           color: g.color
                                         }}
                                       >
                                         {g.name}
                                       </span>
                                     ))}
                                   </div>
                                 );
                               }
                               return null;
                             })()
                           )}
                           
                         
                        {!activeChannelFilter && (contact.instance_id ? instanceNamesMap[contact.instance_id] : connectedInstanceName) && (
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
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={cn("text-[11px] font-medium min-w-fit ml-1 flex items-center gap-1", contact.unread > 0 ? "text-[#00a884]" : "text-[#54656f] dark:text-[#8696a0]")}>
                          {isContactPinned(contact) && <Pin size={12} className="text-[#00a884] rotate-45 fill-current opacity-80" />}
                          {timeDisplay}
                        </span>
                        
                        {/* Menu de Ações (Dropdown) */}
                        <div className="relative" onClick={e => e.stopPropagation()}>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const openUp = e.clientY > window.innerHeight * 0.6;
                              setMenuOpenUpward(openUp);
                              setActiveDropdown(activeDropdown === contact.id ? null : contact.id);
                            }}
                            className="p-1 text-[#54656f] hover:text-[#111b21] dark:text-[#aebac1] dark:hover:text-[#e9edef] rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all opacity-80 hover:opacity-100"
                          >
                            <MoreVertical size={16} />
                          </button>
                          
                          {activeDropdown === contact.id && (
                            <div className={cn(
                              "absolute right-0 w-52 bg-white dark:bg-[#233138] border border-black/5 dark:border-white/5 rounded-xl shadow-xl py-2 z-[99] animate-in fade-in zoom-in-95 duration-100",
                              menuOpenUpward ? "bottom-6 origin-bottom" : "top-6 origin-top"
                            )}>
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
                                {Number(contact.unread || 0) > 0 ? (
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
                              {contact.conv_status === 'resolved' ? (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); reopenConversation(contact.id); setActiveDropdown(null); }}
                                  className="w-full text-left px-4 py-2 text-sm text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-2"
                                >
                                  <RotateCcw size={14} className="text-blue-500" />
                                  Reabrir Conversa
                                </button>
                              ) : (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleResolveConversation(contact.id); setActiveDropdown(null); }}
                                  className="w-full text-left px-4 py-2 text-sm text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-2"
                                >
                                  <CheckCircle2 size={14} className="text-emerald-500" />
                                  Resolver Conversa
                                </button>
                              )}
                              
                              <button 
                                onClick={(e) => { e.stopPropagation(); setContactToEdit(contact); setActiveDropdown(null); }}
                                className="w-full text-left px-4 py-2 text-sm text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-2"
                              >
                                <Edit2 size={14} className="text-[#00a884]" />
                                Editar contato
                              </button>
                              
                              <button 
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  setContactToBlock({ id: contact.id, name: contact.name, isBlocked: contact.is_blocked || false }); 
                                  setActiveDropdown(null); 
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors flex items-center gap-2 border-t border-gray-100 dark:border-[#304046]"
                              >
                                {contact.is_blocked ? (
                                  <>
                                    <ShieldCheck size={14} className="text-emerald-500" />
                                    Desbloquear Contato
                                  </>
                                ) : (
                                  <>
                                    <Ban size={14} className="text-red-500" />
                                    Bloquear Contato
                                  </>
                                )}
                              </button>
                              
                              <button 
                                onClick={(e) => { e.stopPropagation(); setContactToDelete({id: contact.id, name: contact.name}); setActiveDropdown(null); }}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors flex items-center gap-2 border-t border-gray-100 dark:border-[#304046]"
                              >
                                <Trash2 size={14} />
                                Excluir Contato
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Segunda linha: Preview da última mensagem e Badge de não lidas */}
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-[13px] text-gray-500 dark:text-[#8696a0] truncate flex-1 pr-2 flex items-center">
                        {isMe && (
                          <span className="inline-flex mr-1 align-middle text-[#00a884] dark:text-[#53bdeb] shrink-0">
                            {lastMsg.status === 'read' ? (
                              <CheckCheck size={15} className="text-[#00a884] dark:text-[#53bdeb]" />
                            ) : lastMsg.status === 'delivered' ? (
                              <CheckCheck size={15} className="text-[#8696a0]" />
                            ) : (
                              <Check size={15} className="text-[#8696a0]" />
                            )}
                          </span>
                        )}
                        <span className="truncate">{lastMsgText}</span>
                      </p>
                      
                      {contact.unread > 0 && (
                        <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-[#00a884] text-white text-[11px] font-bold flex items-center justify-center animate-in zoom-in-50 duration-200 shadow-sm shrink-0">
                          {contact.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Resizer Handle */}
      <div 
        className={cn(
          "hidden md:flex w-1.5 cursor-col-resize z-20 shrink-0 transition-colors relative group border-l border-r border-[#d1d7db] dark:border-[#222d34] bg-[#f0f2f5] dark:bg-[#202c33]",
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
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={cn("flex-1 flex flex-col relative w-full h-full max-w-[100vw] overflow-hidden min-w-0 bg-[#efeae2] dark:bg-[#0b141a]", !activeChatId && "hidden md:flex")} 
          style={{
           backgroundImage: 'url("https://w7.pngwing.com/pngs/946/407/png-transparent-whatsapp-background-theme-pattern-design.png")',
           backgroundSize: 'cover',
           backgroundBlendMode: 'overlay',
           opacity: 0.95
        }}>
          
          {/* Overlay Premium de Drag & Drop */}
          {isDraggingFile && (
            <div className="absolute inset-0 bg-[#efeae2]/45 dark:bg-[#0b141a]/45 backdrop-blur-[6px] z-[99] flex items-center justify-center p-6 animate-in fade-in duration-200 pointer-events-none">
              <div className="w-full max-w-md bg-white/95 dark:bg-[#222d34]/95 backdrop-blur-xl rounded-[32px] border-2 border-dashed border-[#00a884] p-10 flex flex-col items-center justify-center gap-6 shadow-[0_16px_48px_rgba(0,168,132,0.15)] transform scale-100 animate-in zoom-in-95 duration-200">
                <div className="w-20 h-20 rounded-full bg-[#00a884]/10 flex items-center justify-center text-[#00a884] animate-bounce duration-1000">
                  <UploadCloud size={40} className="stroke-[1.5]" />
                </div>
                <div className="text-center">
                  <h3 className="font-extrabold text-lg text-[#111b21] dark:text-[#e9edef] tracking-tight">Solte o arquivo para enviar</h3>
                  <p className="text-xs text-[#54656f] dark:text-[#8696a0] mt-1.5 font-medium">Imagens, vídeos, áudios ou documentos serão anexados automaticamente.</p>
                </div>
              </div>
            </div>
          )}
          
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
                  </h2>
                  
                  {/* Premium Company Info Button or Phone with Copy Option */}
                  <div className="flex items-center gap-2 mt-0.5 animate-in fade-in slide-in-from-top-1 duration-300 flex-wrap">
                    {(activeChat.fantasy_name || activeChat.document_number) ? (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompanyDetailsOpen(activeChat);
                        }}
                        className="flex items-center gap-1.5 bg-[#00a884]/10 hover:bg-[#00a884]/20 px-2.5 py-0.5 rounded-full border border-[#00a884]/20 transition-all duration-200 group"
                        title="Ver Dados da Empresa e Faturamento"
                      >
                        <Building2 size={12} className="text-[#00a884] group-hover:scale-110 transition-transform" />
                        <span className="text-[11px] font-semibold text-[#00a884]">Ver Empresa</span>
                      </button>
                    ) : (
                      <>
                        {activeChat.phone && (
                          <div className="flex items-center gap-1.5 bg-blue-500/10 dark:bg-blue-500/5 px-2.5 py-0.5 rounded-full border border-blue-500/20 text-blue-600 dark:text-blue-400 text-[11px] font-medium transition-all duration-200">
                            <span className="font-mono">{formatDisplayPhone(activeChat.phone)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(activeChat.phone);
                                setCopiedPhone(true);
                                setTimeout(() => setCopiedPhone(false), 2000);
                              }}
                              className="p-0.5 rounded hover:bg-blue-500/20 transition-colors flex items-center justify-center"
                              title="Copiar Celular"
                            >
                              {copiedPhone ? (
                                <CheckCircle2 size={11} className="text-emerald-500 animate-in zoom-in-95 duration-200" />
                              ) : (
                                <Copy size={11} className="opacity-70 hover:opacity-100 hover:scale-110 active:scale-95 transition-all duration-200" />
                              )}
                            </button>
                          </div>
                        )}
                        {(() => {
                          const linkedCompanies = activeChat.company_ids
                            ?.map((id: string) => allCompanies.find((c: any) => c.id === id))
                            .filter(Boolean) || [];
                          return linkedCompanies.map((comp: any) => (
                            <button
                              key={comp.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setCompanyDetailsOpen(comp);
                              }}
                              className="flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold transition-all duration-200"
                              title={`Empresa Vinculada: ${comp.fantasy_name || comp.name}`}
                            >
                              <Building2 size={10} className="shrink-0" />
                              <span className="truncate max-w-[120px]">{comp.fantasy_name || comp.name}</span>
                            </button>
                          ));
                        })()}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Header Area */}
            <div className="flex items-center gap-2 sm:gap-4">
              
              {/* Botão de Chamada de Voz WaCalls */}
              {activeChat && activeChat.phone && (
                <button
                  onClick={handleCallContact}
                  className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1] hover:text-[#00a884] dark:hover:text-[#00a884] transition-all duration-200 flex items-center justify-center"
                  title="Fazer ligação de voz via WhatsApp"
                >
                  <Phone size={18} className="stroke-[2.5]" />
                </button>
              )}

              <div className="hidden lg:flex items-center gap-2">
                {/* Botão Premium de Controle da I.A (Desktop) */}
                {globalAiEnabled ? (
                  <div className="relative" ref={pauseMenuRef}>
                    <button 
                    onClick={() => setShowPauseMenu(!showPauseMenu)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-300 text-xs font-semibold border shadow-sm hover:scale-105 active:scale-95 whitespace-nowrap",
                      !activeChat.ai_paused 
                        ? "bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]"
                        : "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-600 dark:text-amber-400"
                    )}
                    title="Opções da Inteligência Artificial"
                  >
                    <div className="relative flex items-center justify-center">
                      <BrainCircuit size={14} className={cn(!activeChat.ai_paused && "animate-pulse")} />
                      {!activeChat.ai_paused && (
                        <span className="absolute -top-1 -right-1 flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                        </span>
                      )}
                    </div>
                    <span>{!activeChat.ai_paused ? "I.A Ativa" : "I.A Pausada"}</span>
                    <ChevronDown size={12} className={cn("transition-transform duration-200", showPauseMenu && "rotate-180")} />
                  </button>

                  <AnimatePresence>
                    {showPauseMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700/50 py-2 z-[60]"
                      >
                        {activeChat.ai_paused ? (
                          <button
                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-emerald-600 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                            onClick={() => {
                               useChatStore.getState().updateConversationField(activeChat.id, { 
                                 ai_paused: false,
                                 ai_paused_manually: false,
                                 ai_paused_until: null
                               });
                               setShowPauseMenu(false);
                            }}
                          >
                            <Play size={16} />
                            <span>Retomar I.A Imediatamente</span>
                          </button>
                        ) : (
                          <>
                            <div className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                              Pausar Temporariamente
                            </div>
                            {[10, 60, 720].map((mins) => (
                              <button
                                key={mins}
                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                onClick={() => {
                                   const pauseUntil = new Date(Date.now() + mins * 60000).toISOString();
                                   useChatStore.getState().updateConversationField(activeChat.id, { 
                                     ai_paused: true,
                                     ai_paused_manually: true,
                                     ai_paused_until: pauseUntil
                                   });
                                   setShowPauseMenu(false);
                                }}
                              >
                                <Clock size={16} className="text-indigo-500" />
                                <span>Por {mins === 60 ? '1 hora' : mins === 720 ? '12 horas' : `${mins} minutos`}</span>
                              </button>
                            ))}
                            <div className="my-1 border-t border-slate-200 dark:border-slate-700/50"></div>
                            <button
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-amber-600 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                onClick={() => {
                                   useChatStore.getState().updateConversationField(activeChat.id, { 
                                     ai_paused: true,
                                     ai_paused_manually: true,
                                     ai_paused_until: null
                                   });
                                   setShowPauseMenu(false);
                                }}
                            >
                                <StopCircle size={16} />
                                <span>Pausar Definitivamente</span>
                            </button>
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  </div>
                ) : (
                  <div className="relative">
                    <button 
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-300 text-xs font-semibold border shadow-sm whitespace-nowrap bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:scale-105 active:scale-95"
                      title="O Robô de I.A está desativado globalmente para a empresa. Ative-o na barra lateral esquerda."
                      onClick={() => alert("O Robô de I.A está desativado globalmente para a empresa. Para utilizá-lo, ligue a chave 'Robô I.A' na barra lateral esquerda.")}
                    >
                      <div className="relative flex items-center justify-center">
                        <BrainCircuit size={14} className="text-rose-500 animate-pulse" />
                        <span className="absolute -top-1 -right-1 flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                        </span>
                      </div>
                      <span>I.A Inativa (Global)</span>
                    </button>
                  </div>
                )}

                {activeChat.conv_status === 'resolved' ? (
                  <button 
                    onClick={() => {
                      reopenConversation(activeChat.id);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-full transition-all duration-300 text-xs font-semibold border border-blue-200 dark:border-blue-500/20 shadow-sm animate-in fade-in hover:scale-105 active:scale-95 whitespace-nowrap"
                    title="Reabrir Conversa"
                  >
                    <RotateCcw size={14} className="animate-spin-once" />
                    <span>Reabrir Conversa</span>
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      handleResolveConversation(activeChat.id);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-full transition-all duration-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-500/20 shadow-sm animate-in fade-in hover:scale-105 active:scale-95 whitespace-nowrap"
                    title="Resolver Conversa"
                  >
                    <CheckCircle2 size={14} />
                    <span>Resolver</span>
                  </button>
                )}

                <ChatOmniMenu contactId={activeChat.id} />
              </div>

              {/* Mobile Quick Resolve Button (Visible only on mobile/tablet) */}
              <div className="lg:hidden animate-in zoom-in duration-200">
                {activeChat.conv_status === 'resolved' ? (
                  <button 
                    onClick={() => reopenConversation(activeChat.id)}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 active:scale-95 transition-all shadow-sm relative group"
                    title="Reabrir Conversa"
                  >
                    <RotateCcw size={14} className="group-hover:rotate-180 transition-transform duration-300" />
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white shadow-sm ring-1 ring-white">
                      R
                    </span>
                  </button>
                ) : (
                  <button 
                    onClick={() => handleResolveConversation(activeChat.id)}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-[#00a884] border border-emerald-200 dark:border-emerald-500/20 active:scale-95 transition-all shadow-sm relative group"
                    title="Resolver Conversa"
                  >
                    <CheckCircle2 size={14} className="group-hover:scale-110 transition-transform text-emerald-600 dark:text-[#00a884]" />
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 dark:bg-[#00a884] text-[9px] font-bold text-white shadow-sm ring-1 ring-white">
                      R
                    </span>
                  </button>
                )}
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
                      {activeChat.conv_status === 'resolved' ? (
                        <button 
                          onClick={() => {
                            reopenConversation(activeChat.id);
                            setMobileHeaderMenuOpen(false);
                          }}
                          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-xl transition-all text-sm font-semibold border border-blue-200 dark:border-blue-500/20 w-full shadow-sm hover:scale-[1.02]"
                        >
                          <RotateCcw size={16} />
                          <span>Reabrir Conversa</span>
                        </button>
                      ) : (
                        <button 
                          onClick={() => {
                            handleResolveConversation(activeChat.id);
                            setMobileHeaderMenuOpen(false);
                          }}
                          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-xl transition-all text-sm font-semibold border border-emerald-200 dark:border-emerald-500/20 w-full shadow-sm hover:scale-[1.02]"
                        >
                          <CheckCircle2 size={16} />
                          <span>Resolver Conversa</span>
                        </button>
                      )}
                      
                      {/* Botões de Controle da I.A (Mobile) */}
                      {activeChat.ai_paused ? (
                        <button 
                          onClick={() => {
                            useChatStore.getState().updateConversationField(activeChat.id, { 
                              ai_paused: false,
                              ai_paused_manually: false,
                              ai_paused_until: null
                            });
                            setMobileHeaderMenuOpen(false);
                          }}
                          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-[#00a884] rounded-xl transition-all text-sm font-semibold border border-emerald-200 dark:border-emerald-500/20 w-full shadow-sm hover:scale-[1.02]"
                        >
                          <Play size={16} />
                          <span>Retomar IA</span>
                        </button>
                      ) : (
                        <div className="flex flex-col gap-2 p-2 bg-amber-50/50 dark:bg-amber-500/5 rounded-xl border border-amber-100 dark:border-amber-500/10">
                          <div className="text-[11px] text-amber-600/80 dark:text-amber-500/80 text-center font-bold uppercase tracking-wider mb-0.5 flex items-center justify-center gap-1.5">
                            <BrainCircuit size={12} className="animate-pulse" />
                            <span>Pausar IA</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[10, 60, 720].map((mins) => (
                              <button
                                key={mins}
                                onClick={() => {
                                  const pauseUntil = new Date(Date.now() + mins * 60000).toISOString();
                                  useChatStore.getState().updateConversationField(activeChat.id, { 
                                    ai_paused: true,
                                    ai_paused_manually: true,
                                    ai_paused_until: pauseUntil
                                  });
                                  setMobileHeaderMenuOpen(false);
                                }}
                                className="flex items-center justify-center gap-1.5 px-2 py-2 bg-white dark:bg-[#111b21] text-amber-600 dark:text-amber-400 rounded-lg transition-all text-[11px] font-semibold border border-amber-200 dark:border-amber-500/20 shadow-sm active:scale-95 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                              >
                                <Clock size={12} />
                                <span>{mins === 60 ? '1 hora' : mins === 720 ? '12 horas' : `${mins} min`}</span>
                              </button>
                            ))}
                            <button
                              onClick={() => {
                                useChatStore.getState().updateConversationField(activeChat.id, { 
                                  ai_paused: true,
                                  ai_paused_manually: true,
                                  ai_paused_until: null
                                });
                                setMobileHeaderMenuOpen(false);
                              }}
                              className="flex items-center justify-center gap-1.5 px-2 py-2 bg-white dark:bg-[#111b21] text-red-600 dark:text-red-400 rounded-lg transition-all text-[11px] font-semibold border border-red-200 dark:border-red-500/20 shadow-sm active:scale-95 hover:bg-red-50 dark:hover:bg-red-500/10"
                            >
                              <StopCircle size={12} />
                              <span>Definitivo</span>
                            </button>
                          </div>
                        </div>
                      )}

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
                      {activeChat.ai_paused ? (
                        <button 
                          onClick={() => { 
                            useChatStore.getState().updateConversationField(activeChat.id, { 
                              ai_paused: false,
                              ai_paused_manually: false,
                              ai_paused_until: null
                            }); 
                            setActiveChatDropdown(false); 
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3 transition-colors"
                        >
                          <Power size={16} className="text-[#00a884]" />
                          <span className="text-[14px] text-[#3b4a54] dark:text-[#d1d7db] font-medium">Devolver para IA</span>
                        </button>
                      ) : (
                        <button 
                          onClick={() => { 
                            useChatStore.getState().updateConversationField(activeChat.id, { 
                              ai_paused: true,
                              ai_paused_manually: true,
                              ai_paused_until: null
                            }); 
                            setActiveChatDropdown(false); 
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3 transition-colors"
                        >
                          <Bot size={16} className="text-yellow-600 animate-pulse" />
                          <span className="text-[14px] text-[#3b4a54] dark:text-[#d1d7db] font-medium">Pausar a IA</span>
                        </button>
                      )}
                    </div>


                    <button 
                      onClick={async () => {
                        const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
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
             onClick={() => {
               if (activeChatId) {
                 const activeContact = contacts.find(c => c.id === activeChatId);
                 if (activeContact && (Number(activeContact.unread || 0) > 0 || activeContact.isManuallyUnread)) {
                   useChatStore.getState().markAsRead(activeChatId);
                 }
               }
             }}
          >
            {isSyncingHistory[activeChat.id] && (
               <div className="flex justify-center my-4 animate-in fade-in duration-300">
                  <span className="bg-white dark:bg-[#202c33] text-[#54656f] dark:text-[#8696a0] text-xs px-4 py-2 rounded-full flex items-center gap-2 shadow-sm border border-black/5 dark:border-white/5">
                     <span className="w-4 h-4 border-2 border-t-transparent border-[#00a884] rounded-full animate-spin"></span>
                     Sincronizando histórico anterior...
                  </span>
               </div>
            )}
            
            {(() => {
              const rawMsgs = activeChat.messages?.filter(m => m.text || m.mediaUrl) || [];
              const dedupedMsgs = rawMsgs.filter((msg, idx) => {
                if (msg.sender !== 'system') return true;
                const nextMsg = rawMsgs[idx + 1];
                return !nextMsg || nextMsg.sender !== 'system';
              });
              
              return dedupedMsgs.map((msg, index, arr) => {
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
                    onAlterarRaciocinio={handleOpenAlterarRaciocinio}
                  />
                );
              });
            })()}
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
            {audioState === 'recording' ? (
              <div className="min-h-[85px] w-full flex items-center px-6 py-4 gap-4 bg-gradient-to-r from-gray-50/90 to-white/90 dark:from-[#111b21]/95 dark:to-[#202c33]/95 backdrop-blur-xl border-t border-white/20 dark:border-white/5 animate-in slide-in-from-bottom duration-300">
                {/* Botão de Cancelar Gravação e Descartar */}
                <button 
                  type="button"
                  onClick={handleCancelRecording}
                  className="w-11 h-11 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 bg-black/5 dark:bg-white/5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-all duration-300 active:scale-90 hover:scale-110 shrink-0 border border-black/5 dark:border-white/5 hover:border-red-200 dark:hover:border-red-900/50 shadow-sm"
                  title="Cancelar Gravação e Descartar"
                >
                  <Trash2 size={20} className="transition-transform duration-300 hover:rotate-12" />
                </button>

                {/* Área do Gravador Ativo */}
                <div className={cn(
                  "flex-1 flex items-center rounded-2xl px-5 py-3 border transition-all duration-500 shadow-inner gap-4 min-w-0 bg-white/50 dark:bg-white/5 backdrop-blur-md",
                  isRecordingPaused 
                    ? "border-gray-300/30 dark:border-gray-700/30 shadow-none" 
                    : "border-red-500/20 dark:border-red-500/10"
                )}>
                  {/* Indicador de Status Gravação / Pausado */}
                  <div className="relative flex items-center justify-center shrink-0">
                    {isRecordingPaused ? (
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-gray-400 dark:bg-gray-500" />
                    ) : (
                      <>
                        <span className="animate-ping absolute inline-flex h-3.5 w-3.5 rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                      </>
                    )}
                  </div>
                  
                  <span className={cn(
                    "text-xs font-bold uppercase tracking-widest shrink-0 select-none hidden md:inline transition-colors duration-300",
                    isRecordingPaused 
                      ? "text-gray-400 dark:text-gray-500" 
                      : "text-red-500 dark:text-red-400"
                  )}>
                    {isRecordingPaused ? "Gravação Pausada" : "Gravando Áudio"}
                  </span>
                  
                  {/* Onda sonora visual de 14 barras com delays e alturas variadas */}
                  <div className="flex-1 flex items-center justify-center gap-1.5 px-3 overflow-hidden h-7">
                    {[
                      { h: 'h-3', delay: '0.1s', dur: '0.8s' },
                      { h: 'h-5', delay: '0.2s', dur: '0.6s' },
                      { h: 'h-2', delay: '0.3s', dur: '1s' },
                      { h: 'h-6', delay: '0.4s', dur: '0.7s' },
                      { h: 'h-4', delay: '0.15s', dur: '0.5s' },
                      { h: 'h-7', delay: '0.5s', dur: '0.9s' },
                      { h: 'h-3', delay: '0.25s', dur: '0.6s' },
                      { h: 'h-5', delay: '0.6s', dur: '0.8s' },
                      { h: 'h-2', delay: '0.35s', dur: '1.1s' },
                      { h: 'h-6', delay: '0.7s', dur: '0.7s' },
                      { h: 'h-4', delay: '0.45s', dur: '0.6s' },
                      { h: 'h-7', delay: '0.8s', dur: '0.9s' },
                      { h: 'h-3', delay: '0.55s', dur: '0.8s' },
                      { h: 'h-5', delay: '0.9s', dur: '0.7s' }
                    ].map((bar, index) => (
                      <div
                        key={index}
                        className={cn(
                          "w-0.75 rounded-full transition-all duration-500",
                          bar.h,
                          isRecordingPaused
                            ? "bg-gray-300 dark:bg-gray-600 scale-y-75"
                            : "bg-gradient-to-t from-red-500 via-pink-500 to-rose-500 animate-bounce"
                        )}
                        style={!isRecordingPaused ? {
                          animationDelay: bar.delay,
                          animationDuration: bar.dur
                        } : undefined}
                      />
                    ))}
                  </div>

                  {/* Cronômetro */}
                  <span className={cn(
                    "font-mono text-sm font-black select-none shrink-0 transition-colors duration-300",
                    isRecordingPaused 
                      ? "text-gray-400 dark:text-gray-500" 
                      : "text-red-500 dark:text-red-400"
                  )}>
                    {formatAudioTime(recordingTime)}
                  </span>
                </div>

                {/* Botão de Pausar / Retomar Gravação */}
                <button 
                  type="button"
                  onClick={isRecordingPaused ? handleResumeRecording : handlePauseRecording}
                  className={cn(
                    "w-11 h-11 flex items-center justify-center rounded-full shadow-md transition-all duration-300 hover:scale-105 active:scale-95 shrink-0 border border-white/20 dark:border-white/5",
                    isRecordingPaused
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-white/10 dark:hover:bg-white/15 dark:text-gray-200"
                  )}
                  title={isRecordingPaused ? "Retomar Gravação" : "Pausar Gravação"}
                >
                  {isRecordingPaused ? (
                    <Play size={18} className="translate-x-0.5" fill="currentColor" />
                  ) : (
                    <Pause size={18} fill="currentColor" />
                  )}
                </button>

                {/* Botão de Finalizar Gravação */}
                <button 
                  type="button"
                  onClick={handleStopRecording}
                  className="w-11 h-11 flex items-center justify-center bg-red-500 text-white rounded-full shadow-lg shadow-red-500/25 hover:bg-red-600 transition-all hover:scale-105 active:scale-95 shrink-0 border border-white/20 dark:border-white/5 animate-in zoom-in duration-300"
                  title="Concluir Gravação e Revisar"
                >
                  <StopCircle size={20} className={cn("transition-transform duration-300", !isRecordingPaused && "animate-pulse")} />
                </button>
              </div>
            ) : audioState === 'reviewing' ? (
              <div className="min-h-[85px] w-full flex items-center px-6 py-4 gap-4 bg-gradient-to-r from-gray-50/90 to-white/90 dark:from-[#111b21]/95 dark:to-[#202c33]/95 backdrop-blur-xl border-t border-white/20 dark:border-white/5 animate-in slide-in-from-bottom duration-300">
                {/* Elemento de Áudio oculto para o Preview */}
                {recordedAudioUrl && (
                  <audio 
                    ref={reviewAudioRef}
                    src={recordedAudioUrl}
                    onTimeUpdate={handleAudioTimeUpdate}
                    onLoadedMetadata={handleAudioMetadata}
                    onEnded={handleAudioEnded}
                    className="hidden"
                  />
                )}

                {/* Botão de Descartar Áudio (Lixeira) */}
                <button 
                  type="button"
                  onClick={handleDiscardAudio}
                  className="w-11 h-11 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 bg-black/5 dark:bg-white/5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-all duration-300 active:scale-90 hover:scale-110 shrink-0 border border-black/5 dark:border-white/5 hover:border-red-200 dark:hover:border-red-900/50 shadow-sm"
                  title="Descartar Gravação"
                >
                  <Trash2 size={20} className="transition-transform duration-300 hover:rotate-12" />
                </button>

                {/* Área do Player de Áudio Premium Glassmorphic */}
                <div className="flex-1 flex items-center bg-white/60 dark:bg-white/5 backdrop-blur-md rounded-2xl px-5 py-2.5 border border-emerald-500/10 dark:border-emerald-500/5 shadow-inner gap-4 min-w-0">
                  {/* Play / Pause */}
                  <button
                    type="button"
                    onClick={togglePlayAudio}
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/25 hover:scale-105 active:scale-95 transition-all duration-300 shrink-0"
                    title={audioPlaying ? "Pausar" : "Ouvir Gravação"}
                  >
                    {audioPlaying ? (
                      <Pause size={16} fill="currentColor" />
                    ) : (
                      <Play size={16} className="translate-x-0.5" fill="currentColor" />
                    )}
                  </button>

                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest shrink-0 select-none hidden md:inline">
                    Revisar
                  </span>

                  {/* Acelerador de Velocidade (Pílula Glassmorphic) */}
                  <button
                    type="button"
                    onClick={changePlaybackRate}
                    className="px-2.5 py-1 rounded-full text-xs font-black bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15 text-gray-700 dark:text-gray-200 hover:scale-105 active:scale-95 transition-all duration-300 shrink-0 border border-black/5 dark:border-white/5 select-none font-mono min-w-[45px] text-center"
                    title="Alterar Velocidade de Reprodução"
                  >
                    {playbackRate}x
                  </button>

                  {/* Timeline estilizada */}
                  <div className="flex-1 flex items-center relative group min-w-[60px] h-4">
                    <input 
                      type="range"
                      min={0}
                      max={audioDuration || 100}
                      step={0.01}
                      value={audioCurrentTime}
                      onChange={handleAudioSeek}
                      className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 dark:accent-emerald-500 outline-none transition-all duration-300 group-hover:h-1.5 focus:ring-1 focus:ring-emerald-500/35"
                    />
                  </div>

                  {/* Tempos do player */}
                  <div className="font-mono text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0 select-none whitespace-nowrap bg-black/5 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-black/5 dark:border-white/5">
                    {formatAudioTime(audioCurrentTime)} <span className="opacity-30 mx-0.5">/</span> {formatAudioTime(audioDuration)}
                  </div>
                </div>

                {/* Botão de Enviar Áudio Gravado */}
                <button 
                  type="button"
                  onClick={handleSendRecordedAudio}
                  className="w-11 h-11 flex items-center justify-center bg-gradient-to-tr from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-full shadow-lg shadow-emerald-500/25 transition-all hover:scale-105 active:scale-95 shrink-0 border border-white/20 dark:border-white/5 animate-in zoom-in duration-300 hover:rotate-2"
                  title="Enviar Áudio"
                >
                  <Send size={16} className="translate-x-0.5" />
                </button>
              </div>
            ) : (
              <>
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
                      <span className="text-[12px] font-medium tracking-wide">Instância offline. Conecte-a para enviar mensagens.</span>
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
                
                {/* Alternador de Modo de Chat Premium (WhatsApp vs Anotação Interna) */}
                {activeChat && (
                  <div className="flex items-center gap-2 px-4.5 py-2.5 border-t border-black/[0.03] dark:border-white/[0.03] bg-[#f0f2f5]/30 dark:bg-[#111b21]/30 backdrop-blur-lg select-none shrink-0 animate-in fade-in duration-300">
                    <div className="flex bg-gray-200/50 dark:bg-black/20 p-1 rounded-2xl gap-1 border border-black/[0.02] dark:border-white/[0.02] shadow-inner">
                      <button
                        type="button"
                        onClick={() => setChatMode('chat')}
                        className={cn(
                          "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 active:scale-95 shadow-sm",
                          chatMode === 'chat'
                            ? "bg-white dark:bg-gray-800 text-emerald-650 dark:text-emerald-455 border border-emerald-500/10 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                            : "bg-transparent border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        )}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" className={cn("shrink-0 transition-transform", chatMode === 'chat' && "scale-110")}>
                          <path d="M12.004 2c-5.51 0-9.99 4.49-9.99 10 0 1.91.53 3.69 1.47 5.23L2.24 21.91c-.13.34-.04.73.23 1 .18.18.42.27.67.27.08 0 .17-.01.25-.03l4.89-1.25c1.47.8 3.12 1.25 4.88 1.25 5.51 0 9.99-4.49 9.99-10s-4.48-10-9.99-10zm.01 17.52c-1.63 0-3.17-.46-4.51-1.32-.15-.1-.34-.13-.51-.09l-3.08.79.82-3.08c.05-.18.01-.37-.1-.52-1.01-.1.44-2.48-1.51-4.09-1.51-1.61 0-3.15.46-4.51 1.32-.15.1-.34.13-.51.09l-3.08.79.82-3.08c.05-.18.01-.37-.1-.52-1.01-.1.44-2.48-1.51-4.09-1.51z" />
                        </svg>
                        <span>WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatMode('internal_note')}
                        className={cn(
                          "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 active:scale-95 shadow-sm",
                          chatMode === 'internal_note'
                            ? "bg-amber-500 text-white border border-amber-500/10 shadow-[0_2px_8px_rgba(245,158,11,0.2)]"
                            : "bg-transparent border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        )}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={cn("shrink-0 transition-transform", chatMode === 'internal_note' && "scale-110")}>
                          <path d="M12 20h9"></path>
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                        <span>Anotação CRM</span>
                      </button>
                    </div>
                  </div>
                )}
                
                <form 
                  onSubmit={handleSendHuman} 
                  className={cn(
                    "min-h-[70px] flex px-4 py-3 gap-3 relative",
                    chatMode === 'internal_note'
                      ? "flex-col items-stretch md:flex-row md:items-end md:gap-3"
                      : "flex-row items-end gap-3"
                  )}
                >
                  {chatMode === 'internal_note' && noteAttachedPreview && (
                    <div className="absolute bottom-full left-4 mb-3.5 p-2 bg-amber-500/10 backdrop-blur-md rounded-2xl border border-amber-500/25 flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300 z-50 shadow-lg">
                      {noteAttachedType === 'image' && (
                        <img src={noteAttachedPreview} className="w-12 h-12 rounded-xl object-cover border border-amber-500/20 shadow-sm" />
                      )}
                      {noteAttachedType === 'video' && (
                        <div className="w-12 h-12 rounded-xl bg-black/25 flex items-center justify-center border border-amber-500/20 text-amber-700 dark:text-amber-400">
                          <Video size={16} />
                        </div>
                      )}
                      {noteAttachedType === 'audio' && (
                        <div className="w-12 h-12 rounded-xl bg-black/25 flex items-center justify-center border border-amber-500/20 text-amber-700 dark:text-amber-400">
                          <Mic size={16} />
                        </div>
                      )}
                      {noteAttachedType === 'document' && (
                        <div className="w-12 h-12 rounded-xl bg-black/25 flex items-center justify-center border border-amber-500/20 text-amber-700 dark:text-amber-400">
                          <FileText size={16} />
                        </div>
                      )}
                      <div className="flex flex-col text-[11px] text-amber-900 dark:text-amber-100 pr-7">
                        <span className="font-bold truncate max-w-[120px]">{noteAttachedFile?.name}</span>
                        <span className="opacity-60 uppercase text-[9px] font-black tracking-wider mt-0.5">{noteAttachedType}</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => {
                          setNoteAttachedFile(null);
                          setNoteAttachedPreview(null);
                          setNoteAttachedType(null);
                        }}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors shadow-md active:scale-90"
                      >
                        <X size={10} strokeWidth={3} />
                      </button>
                    </div>
                  )}

                  {chatMode !== 'internal_note' && pendingMediaToSend && (
                    <div className="absolute bottom-full left-4 mb-3.5 p-3.5 bg-white/80 dark:bg-[#111b21]/80 backdrop-blur-xl rounded-3xl border border-emerald-500/25 dark:border-emerald-500/35 flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300 z-50 shadow-2xl max-w-[280px]">
                      {pendingMediaToSend.type === 'image' && (
                        <img src={pendingMediaToSend.url} className="w-11 h-11 rounded-xl object-cover border border-emerald-500/20 shadow-sm shrink-0" />
                      )}
                      {pendingMediaToSend.type === 'video' && (
                        <div className="w-11 h-11 rounded-xl bg-black/25 flex items-center justify-center border border-emerald-500/20 text-emerald-500 shrink-0">
                          <Video size={16} />
                        </div>
                      )}
                      {pendingMediaToSend.type === 'audio' && (
                        <div className="w-11 h-11 rounded-xl bg-blue-500/15 flex items-center justify-center border border-blue-500/20 text-blue-500 shrink-0">
                          <Mic size={16} />
                        </div>
                      )}
                      {pendingMediaToSend.type === 'document' && (
                        <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center border border-emerald-500/20 text-emerald-500 shrink-0">
                          <FileText size={16} />
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-[9px] uppercase font-extrabold tracking-wider text-emerald-600 dark:text-emerald-400">
                          Mídia Pendente
                        </p>
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mt-0.5 truncate" title={pendingMediaToSend.name}>
                          {pendingMediaToSend.name}
                        </p>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => setPendingMediaToSend(null)}
                        className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-full transition-colors shrink-0 active:scale-90"
                        title="Remover anexo"
                      >
                        <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                      </button>
                    </div>
                  )}

                  {chatMode === 'internal_note' && isTaskMode && (
                    <div className="absolute bottom-full left-0 right-0 mb-[-1px] p-6 bg-gradient-to-br from-white/95 to-white/98 dark:from-[#152026]/95 dark:to-[#182229]/98 backdrop-blur-2xl rounded-t-[32px] border-t border-x border-amber-500/25 shadow-[0_-16px_48px_rgba(245,158,11,0.12)] flex flex-col gap-5 animate-in slide-in-from-bottom-3 duration-300 z-40 max-h-[380px] overflow-y-auto scrollbar-thin select-none">
                      
                      {/* Cabeçalho da Gaveta */}
                      <div className="flex items-center justify-between border-b border-amber-500/15 pb-3">
                        <div className="flex items-center gap-2.5 text-amber-750 dark:text-amber-400 font-extrabold text-xs tracking-wider uppercase">
                          <ClipboardList size={16} className="text-amber-500 animate-pulse shrink-0" />
                          <span>Checklist & Agendamento CRM</span>
                          {checklistDraft.length > 0 && (
                            <span className="ml-2 px-2.5 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-full font-mono text-[10px] font-black border border-amber-500/10 shadow-sm">
                              {checklistDraft.length} {checklistDraft.length === 1 ? 'item' : 'itens'}
                            </span>
                          )}
                        </div>
                        <button 
                          type="button"
                          onClick={() => setIsTaskMode(false)}
                          className="text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all p-1.5 hover:scale-105 active:scale-95 shrink-0"
                          title="Fechar Gaveta"
                        >
                          <X size={16} strokeWidth={2.5} />
                        </button>
                      </div>

                      {/* Grade de 2 Colunas */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        
                        {/* Coluna da Esquerda: Checklist */}
                        <div className="lg:col-span-7 flex flex-col gap-3">
                          <div className="flex items-center justify-between select-none">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                              <span>📋</span> Itens do Checklist
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setChecklistDraft([...checklistDraft, ""]);
                                setTimeout(() => {
                                  const nextInput = document.getElementById(`checklist-item-${checklistDraft.length}`);
                                  if (nextInput) (nextInput as HTMLInputElement).focus();
                                }, 50);
                              }}
                              className="text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 text-[10px] font-black tracking-wider uppercase flex items-center gap-1.5 hover:underline transition-all hover:scale-105 active:scale-95 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/15 rounded-full px-3.5 py-1.5 shrink-0 shadow-sm"
                            >
                              <Plus size={11} strokeWidth={3} />
                              <span>Adicionar Item</span>
                            </button>
                          </div>

                          <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1 scrollbar-thin">
                            {checklistDraft.map((item, index) => (
                              <div key={index} className="flex items-center gap-2.5 animate-in slide-in-from-left-2 duration-250 group">
                                {/* Círculo de checkbox simulado */}
                                <div className="w-4 h-4 rounded-full border border-dashed border-amber-500/40 hover:border-amber-500/70 transition-colors flex items-center justify-center shrink-0 cursor-pointer" title="Pronto para marcar na conclusão">
                                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500/0 group-hover:bg-amber-500/30 transition-all" />
                                </div>
                                <input
                                  id={`checklist-item-${index}`}
                                  type="text"
                                  value={item}
                                  onChange={(e) => {
                                    const next = [...checklistDraft];
                                    next[index] = e.target.value;
                                    setChecklistDraft(next);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const next = [...checklistDraft];
                                      next.splice(index + 1, 0, "");
                                      setChecklistDraft(next);
                                      
                                      // Foca no novo input criado
                                      setTimeout(() => {
                                        const nextInput = document.getElementById(`checklist-item-${index + 1}`);
                                        if (nextInput) {
                                          (nextInput as HTMLInputElement).focus();
                                        }
                                      }, 50);
                                    } else if (e.key === 'Backspace' && e.currentTarget.value === '' && checklistDraft.length > 1) {
                                      e.preventDefault();
                                      const next = checklistDraft.filter((_, idx) => idx !== index);
                                      setChecklistDraft(next);
                                      
                                      // Foca no input anterior
                                      setTimeout(() => {
                                        const prevId = index > 0 ? index - 1 : 0;
                                        const prevInput = document.getElementById(`checklist-item-${prevId}`);
                                        if (prevInput) {
                                          (prevInput as HTMLInputElement).focus();
                                        }
                                      }, 50);
                                    }
                                  }}
                                  placeholder={`Item ${index + 1}`}
                                  className="flex-1 bg-gray-50/45 dark:bg-[#202c33]/45 border border-amber-500/15 rounded-xl px-3.5 py-2 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 transition-all font-medium placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-inner"
                                />
                                {checklistDraft.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = checklistDraft.filter((_, idx) => idx !== index);
                                      setChecklistDraft(next);
                                    }}
                                    className="text-gray-400 hover:text-red-500 transition-colors p-2 hover:bg-red-500/10 rounded-xl active:scale-95 shrink-0"
                                    title="Remover Item"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Coluna da Direita: Atribuição e Agendamento */}
                        <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-amber-500/15 pt-5 lg:pt-0 lg:pl-6 flex flex-col gap-4.5 justify-start">
                          
                          {/* Operador Responsável */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 flex items-center gap-1.5 select-none">
                              <UserCheck size={13} className="text-amber-500" />
                              <span>Operador Responsável</span>
                            </label>
                            <select
                              value={taskAssignedTo || ""}
                              onChange={(e) => setTaskAssignedTo(e.target.value || null)}
                              className="bg-gray-50/50 dark:bg-[#202c33]/50 border border-amber-500/20 rounded-xl px-3.5 py-2 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 transition-all cursor-pointer font-semibold shadow-inner"
                            >
                              <option value="">(Nenhum - Atribuir a todos)</option>
                              {agents.map((agent: any) => (
                                <option key={agent.id} value={agent.id}>
                                  {agent.full_name || agent.email}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Switch de Agendar */}
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between border-t border-dashed border-amber-500/10 pt-3 select-none">
                              <label 
                                onClick={() => setScheduleNote(!scheduleNote)}
                                className="text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400 flex items-center gap-1.5 cursor-pointer hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                              >
                                <CalendarClock size={13} className="text-amber-500" />
                                <span>Agendar na Agenda Interna</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => setScheduleNote(!scheduleNote)}
                                className={cn(
                                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                  scheduleNote ? "bg-amber-500" : "bg-gray-200 dark:bg-gray-700"
                                )}
                              >
                                <span
                                  className={cn(
                                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                                    scheduleNote ? "translate-x-5" : "translate-x-0"
                                  )}
                                />
                              </button>
                            </div>

                            {scheduleNote && (
                              <div className="flex flex-col gap-3.5 animate-in fade-in slide-in-from-top-2 duration-300 pb-1">
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[9px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                    Assunto do Lembrete
                                  </label>
                                  <input
                                    type="text"
                                    value={scheduleNoteTitle}
                                    onChange={(e) => setScheduleNoteTitle(e.target.value)}
                                    placeholder="Ex: Retorno de orçamento com cliente"
                                    className="bg-gray-50/50 dark:bg-[#202c33]/50 border border-amber-500/20 rounded-xl px-3 py-2 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 transition-all font-semibold shadow-inner placeholder:text-gray-400/70"
                                  />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3.5">
                                  <div className="flex flex-col gap-1.5">
                                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                      <Calendar size={10} />
                                      <span>Data</span>
                                    </label>
                                    <input
                                      type="date"
                                      value={scheduleNoteDate}
                                      onChange={(e) => setScheduleNoteDate(e.target.value)}
                                      className="bg-gray-50/50 dark:bg-[#202c33]/50 border border-amber-500/20 rounded-xl px-3 py-2 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 transition-all font-semibold cursor-pointer shadow-inner"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1.5">
                                    <label className="text-[9px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                      <Clock size={10} />
                                      <span>Hora</span>
                                    </label>
                                    <input
                                      type="time"
                                      value={scheduleNoteTime}
                                      onChange={(e) => setScheduleNoteTime(e.target.value)}
                                      className="bg-gray-50/50 dark:bg-[#202c33]/50 border border-amber-500/20 rounded-xl px-3 py-2 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10 transition-all font-semibold cursor-pointer shadow-inner"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={cn(
                    "flex flex-1 border transition-all duration-300 relative shadow-sm",
                    chatMode === 'internal_note'
                      ? cn(
                          "flex-col items-stretch px-5 py-4 bg-gradient-to-b from-amber-500/[0.03] to-amber-600/[0.06] dark:from-amber-500/[0.06] dark:to-amber-600/[0.1] border-amber-500/35 focus-within:border-amber-500/60 focus-within:ring-4 focus-within:ring-amber-500/5 shadow-[0_8px_32px_rgba(245,158,11,0.06)] gap-3.5 order-first md:order-none",
                          isTaskMode ? "rounded-b-[32px] rounded-t-none border-t-amber-500/10" : "rounded-[32px]"
                        )
                      : "flex-row items-end px-4 py-2 bg-white dark:bg-[#2a3942] border-transparent focus-within:border-[#00a884]/50 gap-3 rounded-[24px]"
                  )}>
                    
                    {/* Barra de Ferramentas do Editor de Notas CRM */}
                    {chatMode === 'internal_note' && (
                      <div className="w-full flex items-center justify-between border-b border-amber-500/15 pb-2.5 select-none animate-in fade-in duration-300">
                        {/* Botões de Formatação */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => insertMarkdownTag('bold')}
                            className="p-1.5 rounded-xl hover:bg-amber-500/15 text-amber-700 dark:text-amber-400 transition-all hover:scale-105 active:scale-95 border border-transparent hover:border-amber-500/10"
                            title="Negrito (**)"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
                              <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => insertMarkdownTag('italic')}
                            className="p-1.5 rounded-xl hover:bg-amber-500/15 text-amber-700 dark:text-amber-400 transition-all hover:scale-105 active:scale-95 border border-transparent hover:border-amber-500/10"
                            title="Itálico (*)"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="19" y1="4" x2="10" y2="4"></line>
                              <line x1="14" y1="20" x2="5" y2="20"></line>
                              <line x1="15" y1="4" x2="9" y2="20"></line>
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => insertMarkdownTag('strikethrough')}
                            className="p-1.5 rounded-xl hover:bg-amber-500/15 text-amber-700 dark:text-amber-400 transition-all hover:scale-105 active:scale-95 border border-transparent hover:border-amber-500/10"
                            title="Riscado (~~)"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="5" y1="12" x2="19" y2="12"></line>
                              <path d="M16 6C16 6 14.5 4 12 4C9.5 4 7 6 7 8C7 10 9 11.5 12 12C15 12.5 17 14 17 16C17 18 14.5 20 12 20C9.5 20 8 18 8 18"></path>
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => insertMarkdownTag('code')}
                            className="p-1.5 rounded-xl hover:bg-amber-500/15 text-amber-700 dark:text-amber-400 transition-all hover:scale-105 active:scale-95 border border-transparent hover:border-amber-500/10"
                            title="Bloco de Código (`)"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="16 18 22 12 16 6"></polyline>
                              <polyline points="8 6 2 12 8 18"></polyline>
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => insertMarkdownTag('bullet_list')}
                            className="p-1.5 rounded-xl hover:bg-amber-500/15 text-amber-700 dark:text-amber-400 transition-all hover:scale-105 active:scale-95 border border-transparent hover:border-amber-500/10"
                            title="Lista Bullet (-)"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="8" y1="6" x2="21" y2="6"></line>
                              <line x1="8" y1="12" x2="21" y2="12"></line>
                              <line x1="8" y1="18" x2="21" y2="18"></line>
                              <line x1="3" y1="6" x2="3.01" y2="6"></line>
                              <line x1="3" y1="12" x2="3.01" y2="12"></line>
                              <line x1="3" y1="18" x2="3.01" y2="18"></line>
                            </svg>
                          </button>

                          <div className="w-[1px] h-4 bg-amber-500/20 mx-1.5 shrink-0" />

                          <button
                            type="button"
                            onClick={handleExtractRulesForRag}
                            className="px-3.5 py-1.5 rounded-xl text-[10px] bg-gradient-to-r from-amber-500 to-amber-650 hover:from-amber-600 hover:to-amber-700 text-white shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer select-none font-bold mr-1 shrink-0"
                            title="Mapear Regras de Negócio para o RAG"
                          >
                            <BrainCircuit size={12} className="animate-pulse" />
                            <span>Mapear RAG</span>
                          </button>

                          {/* Seletor de Modelos Rápidos */}
                          <div className="relative group/templates inline-block">
                            <button
                              type="button"
                              className="px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-500/10 hover:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/15 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer hover:scale-105 select-none font-bold"
                            >
                              💡 Modelos
                              <ChevronDown size={11} />
                            </button>
                            
                            <div className="absolute left-0 top-full mt-1.5 w-48 bg-white dark:bg-[#202c33] border border-amber-500/20 rounded-2xl shadow-xl hidden group-hover/templates:flex flex-col z-[110] py-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                              <button
                                type="button"
                                onClick={() => insertMarkdownTag('', '\n### 📅 Ata de Reunião\n- **Data/Hora**: \n- **Pautas Discutidas**:\n  - \n- **Decisões Tomadas**:\n  - \n- **Próximos Passos**:\n  - \n')}
                                className="w-full text-left px-3.5 py-2 text-[11px] text-gray-700 dark:text-gray-200 hover:bg-amber-500/10 transition-colors font-bold flex items-center gap-1.5"
                              >
                                <span>📅</span> Ata de Reunião
                              </button>
                              <button
                                type="button"
                                onClick={() => insertMarkdownTag('', '\n### 👤 Perfil do Lead / Cliente\n- **Dores/Necessidades**: \n- **Potencial de Compra**: \n- **Produtos de Interesse**: \n- **Observações**: \n')}
                                className="w-full text-left px-3.5 py-2 text-[11px] text-gray-700 dark:text-gray-200 hover:bg-amber-500/10 transition-colors font-bold flex items-center gap-1.5"
                              >
                                <span>👤</span> Perfil do Lead
                              </button>
                              <button
                                type="button"
                                onClick={() => insertMarkdownTag('', '\n### 🚨 TAREFA CRÍTICA / URGENTE\n- **Objetivo Principal**: \n- **Prazo Estimado**: \n- **Observação**: \n')}
                                className="w-full text-left px-3.5 py-2 text-[11px] text-gray-700 dark:text-gray-200 hover:bg-amber-500/10 transition-colors font-bold flex items-center gap-1.5"
                              >
                                <span>🚨</span> Tarefa Crítica
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Alternador de Modo de Escrita / Preview */}
                        <div className="flex items-center bg-amber-500/5 dark:bg-amber-500/10 rounded-xl p-0.5 border border-amber-500/15 shadow-inner">
                          <button
                            type="button"
                            onClick={() => setNotePreviewMode(false)}
                            className={cn(
                              "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all select-none font-bold",
                              !notePreviewMode
                                ? "bg-amber-500 text-white shadow-sm font-black"
                                : "text-gray-500 dark:text-gray-400 hover:text-amber-700 dark:hover:text-amber-400"
                            )}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setNotePreviewMode(true)}
                            className={cn(
                              "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all select-none font-bold",
                              notePreviewMode
                                ? "bg-amber-500 text-white shadow-sm font-black"
                                : "text-gray-500 dark:text-gray-400 hover:text-amber-700 dark:hover:text-amber-400"
                            )}
                          >
                            Visualizar
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Quick Replies Popover */}
                    {showQuickReplies && quickReplies.length > 0 && (
                      <div className="absolute bottom-full left-0 mb-2 w-[350px] max-w-[90vw] bg-white dark:bg-[#202c33] rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden z-[100] animate-in fade-in zoom-in-95 slide-in-from-bottom-4">
                        <div className="p-3 bg-gray-50/50 dark:bg-[#111b21]/50 border-b border-gray-100 dark:border-white/5 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
                          ⚡ Respostas Prontas
                        </div>
                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                          {quickReplies.filter(qr => qr.shortcut.toLowerCase().includes(quickReplyFilter) || qr.content.toLowerCase().includes(quickReplyFilter)).map(qr => (
                            <button
                              key={qr.id}
                              type="button"
                              className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-[#2a3942] transition-colors border-b border-gray-50 dark:border-white/5 last:border-0 group"
                              onClick={() => {
                                setShowQuickReplies(false);
                                setInputText(qr.content);
                                
                                if (qr.media_url) {
                                  setPendingMediaToSend({
                                    url: qr.media_url,
                                    type: (qr.media_type as 'image'|'video'|'audio'|'document') || 'image',
                                    name: qr.media_url.split('/').pop()?.split('_').slice(1).join('_') || 'Anexo da resposta rápida'
                                  });
                                  setQuickReplyToast({ shortcut: qr.shortcut, type: 'applied' });
                                  setTimeout(() => setQuickReplyToast(null), 3500);
                                } else {
                                  setPendingMediaToSend(null);
                                  setQuickReplyToast({ shortcut: qr.shortcut, type: 'applied' });
                                  setTimeout(() => setQuickReplyToast(null), 3500);
                                }
                                
                                setTimeout(() => textareaRef.current?.focus(), 10);
                              }}
                            >
                              <div className="font-semibold text-blue-600 dark:text-blue-400 text-[13px] mb-1 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors flex items-center gap-1.5">
                                {qr.shortcut}
                                {qr.media_url && (
                                   <span className="flex items-center gap-1 text-[10px] text-gray-500 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded-md">
                                      {qr.media_type === 'video' ? <Video className="w-3 h-3" /> : qr.media_type === 'audio' ? <Mic className="w-3 h-3" /> : qr.media_type === 'document' ? <FileText className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
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
                    
                    <div className="relative flex-1 min-w-0 min-h-[20px] flex items-end">
                      {chatMode === 'internal_note' && notePreviewMode ? (
                        <div className="w-full min-h-[36px] bg-transparent pb-0.5 overflow-y-auto max-h-[250px] relative z-10 animate-in fade-in duration-300 select-text">
                          {renderMarkdownPreview(inputText)}
                        </div>
                      ) : (
                        <textarea 
                          ref={textareaRef}
                          value={inputText}
                          spellCheck={true}
                          lang="pt-BR"
                          onFocus={() => {
                            if (activeChatId) {
                              const activeContact = contacts.find(c => c.id === activeChatId);
                              if (activeContact && (Number(activeContact.unread || 0) > 0 || activeContact.isManuallyUnread)) {
                                useChatStore.getState().markAsRead(activeChatId);
                              }
                            }
                          }}
                          onChange={e => {
                            const val = e.target.value;
                            setInputText(val);
                            if (val.startsWith('/')) {
                              setShowQuickReplies(true);
                              setQuickReplyFilter(val.substring(1).toLowerCase());
                            } else {
                              setShowQuickReplies(false);
                            }
                            handleUserTyping(val);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              const isCompactMobile = window.innerWidth < 500;
                              if (isCompactMobile) {
                                  return;
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
                          placeholder={
                            chatMode === 'internal_note'
                              ? "Escreva uma anotação interna sobre este contato (não será enviada al cliente)..."
                              : "Responda como humano e a IA sera pausada automaticamente..."
                          }
                          className={cn(
                            "bg-transparent border-none outline-none w-full text-sm font-sans leading-relaxed resize-none p-0 pb-0.5 overflow-y-auto max-h-[250px] scrollbar-thin relative z-10 transition-colors duration-200",
                            chatMode === 'internal_note'
                              ? "text-amber-950 dark:text-amber-50 placeholder:text-amber-700/50 dark:placeholder:text-amber-400/40"
                              : "text-[#111b21] dark:text-[#e9edef] placeholder:text-[#54656f] dark:placeholder:text-[#aebac1]"
                          )}
                        />
                      )}
                    </div>

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
                          <button 
                            onClick={() => {
                              setIsGeminiPopoverOpen(false);
                              setGeminiPopoverSubView('main');
                            }} 
                            className="ml-auto text-[#54656f] hover:text-red-500 p-1"
                          >
                            <X size={14}/>
                          </button>
                        </div>
                        
                        {isGeminiProcessing ? (
                          <div className="flex flex-col items-center justify-center py-6 px-4 gap-3 text-center">
                              <RefreshCw size={24} className="text-[#00a884] animate-spin" />
                              <span className="text-xs text-[#111b21] dark:text-[#e9edef] font-medium leading-relaxed animate-pulse">
                                {transcriptionProgressText || "A IA está processando..."}
                              </span>
                          </div>
                        ) : geminiPopoverSubView === 'analyze_period' ? (
                          <div className="flex flex-col gap-2 p-1">
                            <button 
                              onClick={() => setGeminiPopoverSubView('main')} 
                              className="flex items-center gap-1 text-[11px] text-[#54656f] dark:text-[#aebac1] hover:text-[#00a884] transition-colors pb-1 border-b border-black/5 dark:border-white/5 mb-1"
                            >
                              <ChevronLeft size={12} /> Voltar para o menu
                            </button>
                            
                            <span className="text-[10px] font-bold text-[#54656f] dark:text-[#aebac1] uppercase tracking-wider px-1 mb-1 block">Período de Análise</span>
                            
                            <div className="flex flex-col gap-0.5">
                              {[
                                { id: '2h', label: 'Últimas 2 horas' },
                                { id: '24h', label: 'Últimas 24 horas' },
                                { id: '3d', label: 'Últimos 3 dias' },
                                { id: '7d', label: 'Últimos 7 dias' },
                                { id: 'all', label: 'Conversa Toda' }
                              ].map(item => (
                                <button
                                  key={item.id}
                                  onClick={() => setSelectedAnalyzePeriod(item.id as any)}
                                  className={cn(
                                    "flex items-center justify-between w-full px-2.5 py-1.5 text-xs text-left rounded-lg transition-all",
                                    selectedAnalyzePeriod === item.id 
                                      ? "bg-[#00a884]/15 text-[#00a884] font-bold" 
                                      : "hover:bg-black/5 dark:hover:bg-white/5 text-[#111b21] dark:text-[#e9edef]"
                                  )}
                                >
                                  {item.label}
                                  {selectedAnalyzePeriod === item.id && <Check size={12} className="stroke-[3]" />}
                                </button>
                              ))}
                            </div>
                            
                            <button 
                              onClick={() => handleGeminiAction('analyze')} 
                              className="mt-2 flex items-center justify-center gap-2 w-full py-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-[0.98]"
                            >
                              <BrainCircuit size={14} /> Iniciar Análise
                            </button>
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
                            
                            <button onClick={() => setGeminiPopoverSubView('analyze_period')} className="flex items-center gap-3 w-full p-2.5 text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors text-[#111b21] dark:text-[#e9edef] group">
                              <BrainCircuit size={16} className="text-purple-500 group-hover:scale-110 transition-transform" /> Analisar Conversa / Dar Feedback
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Contêiner de Ações Inferior no Mobile / Contents no Desktop */}
                  <div className={cn(
                    chatMode === 'internal_note'
                      ? "flex items-center justify-between w-full mt-2 md:mt-0 md:w-auto md:contents"
                      : "contents"
                  )}>
                    {/* Botões de Ação da Esquerda */}
                    <div className="flex items-center gap-1.5 shrink-0">
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
                        multiple
                        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                      />

                      {chatMode === 'internal_note' && (
                        <button 
                          type="button"
                          onClick={() => {
                            const newMode = !isTaskMode;
                            setIsTaskMode(newMode);
                            if (newMode && checklistDraft.length === 0) {
                              setChecklistDraft([""]);
                            }
                          }}
                          className={cn(
                            "p-2 rounded-full transition-all shrink-0 animate-in fade-in zoom-in-95 duration-250",
                            isTaskMode
                              ? "text-amber-600 bg-amber-500/25 hover:bg-amber-500/35 scale-105 border border-amber-500/35"
                              : "text-amber-600 dark:text-amber-500 hover:bg-amber-500/10"
                          )}
                          title="Tornar Tarefa CRM / Checklist"
                        >
                          <CheckSquare size={20} />
                        </button>
                      )}

                      {chatMode === 'internal_note' && (
                        <div className="relative">
                          <button 
                            type="button"
                            onClick={() => setShowTemplatesDropdown(!showTemplatesDropdown)}
                            className={cn(
                              "p-2 rounded-full transition-all shrink-0 animate-in fade-in zoom-in-95 duration-250",
                              showTemplatesDropdown
                                ? "text-emerald-600 bg-emerald-500/25 hover:bg-emerald-500/35 scale-105 border border-emerald-500/35"
                                : "text-emerald-600 dark:text-emerald-500 hover:bg-emerald-500/10"
                            )}
                            title="Modelos de Tarefa CRM"
                          >
                            <Sparkles size={20} className={cn(showTemplatesDropdown ? "" : "animate-pulse")} />
                          </button>

                          {showTemplatesDropdown && (
                            <div className="absolute bottom-full left-0 mb-3.5 p-4 bg-white/95 dark:bg-[#111b21]/95 backdrop-blur-xl rounded-3xl border border-emerald-500/35 shadow-[0_8px_32px_rgba(16,185,129,0.18)] flex flex-col gap-3.5 w-72 z-50 animate-in slide-in-from-bottom-2 duration-300">
                              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-extrabold text-[10px] tracking-widest uppercase">
                                  <Sparkles size={14} className="text-emerald-500 animate-spin duration-3000" />
                                  Modelos de Tarefa CRM
                                </div>
                                <button 
                                  type="button"
                                  onClick={() => setShowTemplatesDropdown(false)}
                                  className="text-gray-400 hover:text-red-500 transition-all p-1 hover:scale-110"
                                >
                                  <X size={14} />
                                </button>
                              </div>

                              <div className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={handleTriggerImplantacaoModel}
                                  className="w-full text-left p-3 rounded-2xl border border-dashed border-emerald-500/25 hover:border-emerald-500/60 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all group flex gap-3 items-start cursor-pointer active:scale-[0.98]"
                                >
                                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 shrink-0 group-hover:scale-110 transition-transform">
                                    <Plus size={16} strokeWidth={3} />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-extrabold text-[11px] text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                                      Implantação Completa
                                    </span>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5 font-medium">
                                      Gera automaticamente as 5 tarefas diárias de implantação com seus respectivos checklists completos.
                                    </p>
                                  </div>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Botão de Enviar da Direita */}
                    <div className="flex items-center shrink-0">
                      {(inputText.trim() || (chatMode === 'internal_note' && isTaskMode)) ? (
                         <button 
                          type="submit"
                          disabled={isSendingMessage}
                          className={cn(
                            "w-10 h-10 flex items-center justify-center text-white rounded-full shadow-md transition-all shrink-0 animate-in fade-in zoom-in-95 duration-200",
                            isSendingMessage 
                              ? "opacity-50 cursor-not-allowed" 
                              : "hover:scale-105 active:scale-95",
                            chatMode === 'internal_note'
                              ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/35 border border-amber-600/10"
                              : "bg-[#00a884] hover:bg-[#00a884]/90 shadow-emerald-500/20"
                          )}
                        >
                          {isSendingMessage ? (
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <Send size={16} className="translate-x-0.5" />
                          )}
                        </button>
                      ) : (
                        chatMode !== 'internal_note' && (
                          <button 
                            type="button"
                            onClick={handleMicClick}
                            className={cn(
                               "w-10 h-10 flex items-center justify-center rounded-full shadow-md hover:scale-105 transition-all active:scale-95 shrink-0 animate-in fade-in zoom-in-95 duration-200",
                               audioState === 'recording' ? "bg-red-500 text-white animate-pulse" : "bg-transparent text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 shadow-none"
                            )}
                          >
                            <Mic size={20} />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </form>
              </>
            )}
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
          className="fixed inset-0 z-[99999] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200 overflow-hidden"
          onClick={closeFullscreenImage}
          onContextMenu={(e) => { e.preventDefault(); closeFullscreenImage(); }}
        >
          {/* Barra de Ferramentas Premium de Zoom (Glassmorphism) */}
          <div 
            className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-black/50 backdrop-blur-md border border-white/10 rounded-full shadow-2xl z-50 animate-in slide-in-from-top-4 duration-300 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleZoomOut}
              disabled={fullscreenZoom <= 1}
              className="text-white hover:text-emerald-400 p-1.5 hover:bg-white/10 active:scale-95 rounded-full transition-all disabled:opacity-40 disabled:hover:text-white disabled:hover:bg-transparent"
              title="Zoom Out"
            >
              <ZoomOut size={18} />
            </button>
            
            <span className="text-white text-xs font-semibold min-w-[2.5rem] text-center font-mono select-none">
              {fullscreenZoom.toFixed(1)}x
            </span>
            
            <button
              onClick={handleZoomIn}
              disabled={fullscreenZoom >= 5}
              className="text-white hover:text-emerald-400 p-1.5 hover:bg-white/10 active:scale-95 rounded-full transition-all disabled:opacity-40 disabled:hover:text-white disabled:hover:bg-transparent"
              title="Zoom In"
            >
              <ZoomIn size={18} />
            </button>

            {fullscreenZoom > 1 && (
              <button
                onClick={handleResetZoom}
                className="text-white hover:text-red-400 p-1.5 hover:bg-white/10 active:scale-95 rounded-full transition-all border-l border-white/10 pl-2.5 ml-1"
                title="Redefinir Foco"
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>

          <button 
            onClick={closeFullscreenImage}
            className="absolute top-6 right-6 text-white p-2.5 bg-black/50 hover:bg-white/10 active:scale-95 rounded-full transition-all z-50 shadow-lg border border-white/10"
          >
            <X size={20} />
          </button>

          <div 
            className="w-full h-full flex items-center justify-center overflow-hidden"
            onClick={closeFullscreenImage}
          >
            <img 
              src={fullscreenImage} 
              alt="Imagem em Tela Cheia" 
              className="max-w-full max-h-[90vh] object-contain select-none animate-in zoom-in-95 duration-300 shadow-2xl rounded-2xl"
              style={{
                transform: `translate(${fullscreenPan.x}px, ${fullscreenPan.y}px) scale(${fullscreenZoom})`,
                transition: isFullscreenDragging ? 'none' : 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                cursor: fullscreenZoom > 1 ? (isFullscreenDragging ? 'grabbing' : 'grab') : 'default',
                touchAction: 'none'
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.stopPropagation()}
            />
          </div>
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
                  onClick={() => {
                    if (!activeChatId) return;
                    const instanceToUse = activeChat?.instance_id || activeChat?.whatsapp_instance;
                    if (!instanceToUse) return;
                    
                    // Executa a deleção em segundo plano e trata erros
                    deleteHumanMessage(activeChatId, messageToDelete, instanceToUse).catch(() => {});
                    // Fecha o modal de confirmação imediatamente
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

      {/* Modal de Erro Premium para Sincronização de Histórico */}
      {historySyncError && (
        <div className="fixed inset-0 z-[99999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white/95 dark:bg-[#111b21]/95 backdrop-blur-md w-full max-w-md rounded-[28px] shadow-2xl overflow-hidden border border-black/5 dark:border-white/10 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <div className="p-6 bg-gradient-to-br from-amber-500/10 to-transparent dark:from-amber-500/5 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-3xl bg-amber-500/15 dark:bg-amber-500/10 flex items-center justify-center mb-4 border border-amber-500/20 shadow-inner animate-pulse">
                <History size={32} className="text-amber-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2.5">
                {historySyncError.title}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-6 whitespace-pre-line px-2">
                {historySyncError.message}
              </p>
              
              <div className="flex w-full gap-3">
                <button
                  onClick={() => setHistorySyncError(null)}
                  className="flex-1 py-3.5 rounded-2xl font-semibold text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-md hover:shadow-amber-500/25 transition-all hover:scale-[1.02] active:scale-95 duration-200"
                >
                  Entendi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Premium de Confirmação e Atribuição de Implantação Completa CRM */}
      {showImplantacaoModal && (
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white/95 dark:bg-[#1e2b34]/95 backdrop-blur-2xl w-full max-w-md rounded-[32px] border border-emerald-500/20 dark:border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 flex flex-col">
            
            {/* Header com gradiente sutil de emerald */}
            <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gradient-to-r from-emerald-500/10 to-transparent flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner">
                  <Sparkles size={20} className="animate-pulse" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                    Implantação Completa
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-sans">
                    Geração automática de checklist de 5 dias
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowImplantacaoModal(false)}
                className="text-gray-400 hover:text-red-500 transition-all p-1 hover:scale-110"
              >
                <X size={16} />
              </button>
            </div>

            {/* Conteúdo Central do Modal */}
            <div className="p-6 flex flex-col gap-5">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed font-sans font-medium">
                Deseja criar automaticamente as 5 tarefas do checklist de <b>'Implantação Completa'</b> para este cliente? As tarefas serão inseridas como anotações internas CRM.
              </p>

              {/* Seletor de Agentes Responsáveis */}
              <div className="flex flex-col gap-2 w-full text-left font-sans">
                <label className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                  Atribuir tarefas ao agente:
                </label>
                <div className="relative flex items-center w-full">
                  <select
                    value={implantacaoSelectedAgent || ''}
                    onChange={(e) => setImplantacaoSelectedAgent(e.target.value || null)}
                    className="w-full bg-[#f0f2f5] dark:bg-[#202c33] border border-emerald-500/20 dark:border-white/5 rounded-2xl px-4 py-3.5 text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-emerald-500 transition-all cursor-pointer font-bold appearance-none"
                  >
                    <option value="" className="font-bold text-gray-500 dark:bg-[#202c33]">Qualquer Operador</option>
                    {agents.map((agent: any) => (
                      <option key={agent.id} value={agent.id || agent.user_id} className="font-bold dark:bg-[#202c33]">
                        👤 {agent.full_name || agent.email}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 pointer-events-none text-emerald-600 dark:text-emerald-400">
                    <ChevronDown size={16} />
                  </div>
                </div>
              </div>
            </div>

            {/* Rodapé do Modal */}
            <div className="px-6 py-5 bg-gray-50/50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5 flex gap-3 justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowImplantacaoModal(false)}
                className="px-5 py-3 rounded-2xl text-sm font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white bg-[#f0f2f5] dark:bg-[#202c33] border border-transparent hover:border-gray-200 dark:hover:border-white/10 transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmImplantacaoModel}
                className="px-6 py-3 rounded-2xl text-sm font-extrabold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-md hover:shadow-emerald-500/20 transition-all active:scale-95 hover:scale-[1.01]"
              >
                Gerar e Atribuir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Notas Internas / Tarefas CRM (Design Ultra-Premium) */}
      {editingNote && (
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white/95 dark:bg-[#1e2b34]/95 backdrop-blur-2xl w-full max-w-2xl rounded-[32px] border border-amber-500/20 dark:border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 flex flex-col max-h-[90vh]">
            
            {/* Header com gradiente sutil e design premium */}
            <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gradient-to-r from-amber-500/10 to-transparent flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-inner">
                  <Edit2 size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                    Editar Anotação Interna
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Modifique o texto, checklist ou atribuição da tarefa CRM
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setEditingNote(null)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corpo do Modal - Scrollable se necessário */}
            <div className="p-6 flex-1 overflow-y-auto space-y-5 custom-scrollbar bg-gray-50/30 dark:bg-[#0c1317]/30">
              
              {/* Seletor de Tipo de Nota (Anotação Simples vs Tarefa CRM) */}
              <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-[#111b21]/50 backdrop-blur-md rounded-2xl border border-black/5 dark:border-white/5 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-500">
                    <CheckSquare size={16} />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Transformar em Tarefa CRM</span>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Habilita checklist e operador responsável</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditNoteIsTask(!editNoteIsTask)}
                  className={cn(
                    "w-12 h-6 rounded-full p-0.5 transition-all duration-300 focus:outline-none",
                    editNoteIsTask ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-700"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 rounded-full bg-white shadow-md transform transition-all duration-300",
                    editNoteIsTask ? "translate-x-6" : "translate-x-0"
                  )} />
                </button>
              </div>

              {/* Seletor de Operador (Apenas se for Tarefa CRM) */}
              {editNoteIsTask && (
                <div className="space-y-2 animate-in slide-in-from-top-3 duration-300">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">Atribuir a um Operador</label>
                  <div className="relative">
                    <select
                      value={editNoteAssignedTo || ''}
                      onChange={(e) => setEditNoteAssignedTo(e.target.value || null)}
                      className="w-full p-3.5 pl-10 bg-white/70 dark:bg-[#202c33]/70 backdrop-blur-md border border-gray-200 dark:border-white/10 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-amber-500/30 text-gray-800 dark:text-gray-100 appearance-none shadow-sm transition-all font-bold"
                    >
                      <option value="" className="text-gray-500">Nenhum operador atribuído</option>
                      {agents.map(agent => (
                        <option key={agent.id} value={agent.id} className="text-gray-800 dark:text-gray-200 font-bold">
                          {agent.full_name || agent.email}
                        </option>
                      ))}
                    </select>
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Editor de Texto Poderoso (Markdown) para o Modal */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">Anotação Interna (Markdown)</label>
                  
                  {/* Barra de Ferramentas e Alternador */}
                  <div className="flex flex-wrap items-center gap-2">
                    {!editNotePreviewMode && (
                      <div className="flex items-center bg-black/5 dark:bg-black/20 rounded-xl p-0.5 border border-black/5 dark:border-white/5 shadow-inner">
                        <button
                          type="button"
                          onClick={() => insertMarkdownTagInEdit('bold')}
                          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
                          title="Negrito"
                        >
                          <strong className="font-extrabold text-[13px] px-1">B</strong>
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMarkdownTagInEdit('italic')}
                          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
                          title="Itálico"
                        >
                          <em className="italic text-[13px] px-1">I</em>
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMarkdownTagInEdit('strikethrough')}
                          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
                          title="Tachado"
                        >
                          <span className="line-through text-[13px] px-0.5">S</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMarkdownTagInEdit('code')}
                          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
                          title="Bloco de Código"
                        >
                          <Terminal size={14} className="mx-0.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertMarkdownTagInEdit('bullet_list')}
                          className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
                          title="Lista com Marcadores"
                        >
                          <span className="font-black text-[13px] px-1">-</span>
                        </button>
                        
                        <div className="w-px h-4 bg-black/10 dark:bg-white/10 mx-1"></div>
                        
                        {/* Templates rápidos no Modal */}
                        <div className="relative group/edit-tmpl">
                          <button
                            type="button"
                            className="p-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-amber-500 dark:hover:text-amber-400 flex items-center gap-0.5 font-bold px-2 select-none"
                          >
                            <CalendarClock size={12} /> Templates
                          </button>
                          <div className="absolute bottom-full right-0 mb-1 hidden group-hover/edit-tmpl:block bg-white dark:bg-[#202c33] border border-gray-100 dark:border-white/10 rounded-xl shadow-xl w-44 overflow-hidden z-[110] animate-in fade-in duration-150">
                            <button
                              type="button"
                              onClick={() => insertMarkdownTagInEdit('', '\n### 📅 Ata de Reunião\n- **Data/Hora**: \n- **Pautas Discutidas**:\n  - \n- **Decisões Tomadas**:\n  - \n- **Próximos Passos**:\n  - \n')}
                              className="w-full text-left px-3 py-2 text-[10px] text-gray-700 dark:text-gray-200 hover:bg-amber-500/10 transition-colors font-bold flex items-center gap-1.5"
                            >
                              <span>📅</span> Ata de Reunião
                            </button>
                            <button
                              type="button"
                              onClick={() => insertMarkdownTagInEdit('', '\n### 👤 Perfil do Lead / Cliente\n- **Dores/Necessidades**: \n- **Potencial de Compra**: \n- **Produtos de Interesse**: \n- **Observações**: \n')}
                              className="w-full text-left px-3 py-2 text-[10px] text-gray-700 dark:text-gray-200 hover:bg-amber-500/10 transition-colors font-bold flex items-center gap-1.5"
                            >
                              <span>👤</span> Perfil do Lead
                            </button>
                            <button
                              type="button"
                              onClick={() => insertMarkdownTagInEdit('', '\n### 🚨 TAREFA CRÍTICA / URGENTE\n- **Objetivo Principal**: \n- **Prazo Estimado**: \n- **Observação**: \n')}
                              className="w-full text-left px-3 py-2 text-[10px] text-gray-700 dark:text-gray-200 hover:bg-amber-500/10 transition-colors font-bold flex items-center gap-1.5"
                            >
                              <span>🚨</span> Tarefa Crítica
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center bg-black/5 dark:bg-black/20 rounded-xl p-0.5 border border-black/5 dark:border-white/5 shadow-inner">
                      <button
                        type="button"
                        onClick={() => setEditNotePreviewMode(false)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all select-none font-bold",
                          !editNotePreviewMode
                            ? "bg-amber-500 text-white shadow-sm font-black"
                            : "text-gray-500 dark:text-gray-400 hover:text-amber-700 dark:hover:text-amber-400"
                        )}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditNotePreviewMode(true)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all select-none font-bold",
                          editNotePreviewMode
                            ? "bg-amber-500 text-white shadow-sm font-black"
                            : "text-gray-500 dark:text-gray-400 hover:text-amber-700 dark:hover:text-amber-400"
                        )}
                      >
                        Visualizar
                      </button>
                    </div>
                  </div>
                </div>
                
                {editNotePreviewMode ? (
                  <div className="w-full min-h-[140px] max-h-[250px] overflow-y-auto p-4 bg-white/50 dark:bg-[#111b21]/50 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-white/10 shadow-inner select-text">
                    {renderMarkdownPreview(editNoteText)}
                  </div>
                ) : (
                  <textarea
                    id="edit-note-textarea"
                    rows={5}
                    value={editNoteText}
                    onChange={(e) => setEditNoteText(e.target.value)}
                    placeholder="Escreva a anotação com formatação Markdown..."
                    className="w-full p-4 bg-white/70 dark:bg-[#202c33]/70 backdrop-blur-md border border-gray-200 dark:border-white/10 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-amber-500/30 text-gray-800 dark:text-gray-100 shadow-sm transition-all resize-none leading-relaxed"
                  />
                )}
              </div>

              {/* Checklist da Tarefa CRM (Apenas se for Tarefa CRM) */}
              {editNoteIsTask && (
                <div className="space-y-3 animate-in slide-in-from-top-3 duration-300">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                      <CheckSquare size={14} className="text-amber-500" /> Itens do Checklist
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setEditNoteChecklist([
                          ...editNoteChecklist,
                          { id: 'temp_' + Date.now(), text: '', completed: false }
                        ]);
                        setTimeout(() => {
                          const idx = editNoteChecklist.length;
                          const input = document.getElementById(`edit-checklist-item-${idx}`) as HTMLInputElement;
                          if (input) input.focus();
                        }, 50);
                      }}
                      className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-extrabold rounded-lg flex items-center gap-1 transition-all active:scale-95 border border-amber-500/10"
                    >
                      <Plus size={12} /> Adicionar Item
                    </button>
                  </div>
                  
                  {editNoteChecklist.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 dark:text-gray-500 italic text-xs bg-white/30 dark:bg-[#111b21]/30 rounded-2xl border border-dashed border-gray-200 dark:border-white/5">
                      Nenhum item no checklist. Clique em "+ Adicionar Item" ou pressione Enter no teclado.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                      {editNoteChecklist.map((item, idx) => (
                        <div 
                          key={item.id || idx} 
                          className="flex items-center gap-3 p-2 bg-white/60 dark:bg-[#111b21]/60 backdrop-blur-md rounded-xl border border-black/5 dark:border-white/5 hover:border-amber-500/15 dark:hover:border-white/10 transition-all shadow-sm group"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const newChecklist = [...editNoteChecklist];
                              newChecklist[idx].completed = !newChecklist[idx].completed;
                              setEditNoteChecklist(newChecklist);
                            }}
                            className={cn(
                              "w-5 h-5 rounded-md flex items-center justify-center border transition-all active:scale-90",
                              item.completed
                                ? "bg-emerald-500 border-emerald-500 text-white"
                                : "border-gray-300 dark:border-gray-600 hover:border-amber-500"
                            )}
                          >
                            {item.completed && <Check size={12} strokeWidth={3} />}
                          </button>
                          
                          <input
                            id={`edit-checklist-item-${idx}`}
                            type="text"
                            value={item.text}
                            onChange={(e) => {
                              const newChecklist = [...editNoteChecklist];
                              newChecklist[idx].text = e.target.value;
                              setEditNoteChecklist(newChecklist);
                            }}
                            onKeyDown={(e) => handleEditChecklistKeyDown(e, idx)}
                            placeholder="Descreva a sub-tarefa..."
                            className={cn(
                              "flex-1 bg-transparent border-none outline-none text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 transition-all font-semibold",
                              item.completed && "line-through opacity-50"
                            )}
                          />

                          <button
                            type="button"
                            onClick={() => {
                              const newChecklist = editNoteChecklist.filter((_, i) => i !== idx);
                              setEditNoteChecklist(newChecklist);
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                            title="Remover Item"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Base de Ação com Gradiente Sutil e Lixeira Vermelha */}
            <div className="p-5 bg-gray-50/80 dark:bg-[#111b21]/80 backdrop-blur-md border-t border-gray-100 dark:border-white/5 flex items-center justify-between shrink-0">
              
              {/* Botão de Excluir Nota (Com Confirmação integrada e design de atenção) */}
              {showDeleteConfirm ? (
                <div className="flex items-center gap-2 bg-red-500/10 dark:bg-red-950/20 p-1.5 pl-3 rounded-2xl border border-red-500/20 animate-in slide-in-from-left-3 duration-200">
                  <span className="text-[11px] font-bold text-red-600 dark:text-red-400">Excluir para sempre?</span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!editingNote || !activeChatId) return;
                      await useChatStore.getState().deleteInternalNote(editingNote.id, activeChatId);
                      setEditingNote(null);
                      setShowDeleteConfirm(false);
                    }}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] uppercase rounded-xl transition-all shadow-sm"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-2.5 py-1 text-gray-500 dark:text-gray-400 font-bold text-[10px] uppercase hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all"
                  >
                    Não
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 border border-transparent hover:border-red-200 dark:hover:border-red-900/40 rounded-2xl transition-all shadow-sm shrink-0 group"
                  title="Excluir Nota Interna"
                >
                  <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
                </button>
              )}

              {/* Botões de Salvar / Cancelar */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditingNote(null)}
                  className="px-5 py-2.5 rounded-2xl font-bold text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!editingNote) return;
                    // Filtrar itens em branco de forma inteligente antes de salvar no banco
                    const cleanChecklist = editNoteChecklist.filter(item => item.text.trim() !== '');
                    await useChatStore.getState().editInternalNote(
                      editingNote.id,
                      editNoteText,
                      editNoteIsTask,
                      editNoteAssignedTo,
                      cleanChecklist
                    );
                    setEditingNote(null);
                  }}
                  className="px-6 py-3 rounded-2xl font-bold text-xs text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2"
                >
                  <Check size={14} /> Salvar Alterações
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Modal Premium de Visualização das Tarefas do Contato [CRM] */}
      {selectedContactForTasks && (() => {
        const contact = selectedContactForTasks;
        const getCleanId = (id: string) => id.includes('_') ? id.split('_')[0] : id;
        const contactTasks = globalActiveTasks.filter(t => 
          getCleanId(t.contactId) === getCleanId(contact.id)
        );
        
        return (
          <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white/95 dark:bg-[#1e2b34]/95 backdrop-blur-2xl w-full max-w-lg rounded-[32px] border border-amber-500/25 dark:border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 flex flex-col max-h-[85vh]">
              
              {/* Header com gradiente sutil de âmbar */}
              <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gradient-to-r from-amber-500/10 to-transparent flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-inner">
                    <ClipboardList size={20} className="animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 font-sans">
                      Tarefas CRM do Contato
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-sans">
                      Lista de anotações internas ativas
                    </p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setSelectedContactForTasks(null)}
                  className="text-gray-400 hover:text-red-500 transition-all p-1 hover:scale-110"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Selo Identificador do Contato */}
              <div className="px-6 pt-4 shrink-0">
                <div className="flex items-center gap-3 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/15 p-3.5 rounded-2xl">
                  <img 
                    src={contact.avatar} 
                    className="w-10 h-10 rounded-full object-cover shadow-sm border border-amber-500/10" 
                    onError={(e) => {
                      e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(getContactDisplayName(contact.custom_name || contact.name, contact.push_name, contact.phone))}&background=random&color=fff`;
                    }}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-gray-800 dark:text-gray-100 text-sm truncate">
                      {getContactDisplayName(contact.custom_name || contact.name, contact.push_name, contact.phone)}
                    </span>
                    <span className="text-[9px] text-amber-700 dark:text-amber-400 font-black uppercase tracking-widest mt-0.5">
                      {contactTasks.length} {contactTasks.length === 1 ? 'tarefa ativa pendente' : 'tarefas ativas pendentes'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Corpo com a listagem de tarefas ativas */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {contactTasks.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 dark:text-gray-500 italic text-xs bg-gray-50/50 dark:bg-black/20 rounded-3xl border border-dashed border-gray-200 dark:border-white/5 flex flex-col items-center gap-3 animate-in fade-in duration-300">
                    <span className="text-2xl animate-bounce">🎉</span>
                    <span>Nenhuma tarefa ativa para este contato no momento.</span>
                  </div>
                ) : (
                  contactTasks.map((task) => {
                    return (
                      <div 
                        key={task.noteId} 
                        className="p-4 bg-gray-50/70 dark:bg-[#202c33]/70 backdrop-blur-md rounded-2xl border border-black/5 dark:border-white/5 flex flex-col gap-3 shadow-sm hover:border-amber-500/15 dark:hover:border-white/10 transition-all group/task"
                      >
                        {/* Autor e data */}
                        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2 text-[10px] text-gray-400 font-sans">
                          <span className="font-bold flex items-center gap-1">
                            👤 Criador: {task.createdByName || 'Agente'}
                          </span>
                          <span className="font-medium">
                            {format(new Date(task.timestamp), 'dd/MM/yyyy HH:mm')}
                          </span>
                        </div>

                        {/* Texto descritivo da tarefa */}
                        <div className="text-xs text-gray-700 dark:text-gray-200 font-medium whitespace-pre-wrap leading-relaxed select-text font-sans">
                          {renderMarkdownPreview(task.text)}
                        </div>

                        {/* Checklist da tarefa se houver */}
                        {task.checklistItems && task.checklistItems.length > 0 && (
                          <div className="mt-1 space-y-2 border-t border-black/5 dark:border-white/5 pt-2">
                            <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5 select-none font-sans">
                              <CheckSquare size={11} className="text-amber-500 animate-pulse" /> Checklist CRM ({task.checklistItems.filter((i: any) => i.completed).length}/{task.checklistItems.length})
                            </span>
                            
                            <div className="space-y-1.5 pl-0.5">
                              {task.checklistItems.map((item: any, idx: number) => {
                                return (
                                  <div 
                                    key={idx} 
                                    className="flex items-center gap-2 p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors select-none font-sans"
                                  >
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        // Modifica o item localmente de forma instantânea para feedback reativo imediato
                                        const updatedChecklist = [...task.checklistItems];
                                        updatedChecklist[idx].completed = !updatedChecklist[idx].completed;
                                        
                                        // Chama a mutação do chatStore
                                        await useChatStore.getState().toggleChecklistItem(
                                          task.contactId,
                                          task.noteId,
                                          idx
                                        );
                                      }}
                                      className={cn(
                                        "w-4.5 h-4.5 rounded flex items-center justify-center border transition-all active:scale-90 shrink-0",
                                        item.completed
                                          ? "bg-emerald-500 border-emerald-500 text-white"
                                          : "border-gray-300 dark:border-gray-600 hover:border-amber-500 bg-transparent"
                                      )}
                                    >
                                      {item.completed && <Check size={10} strokeWidth={3} />}
                                    </button>
                                    <span className={cn(
                                      "text-xs font-semibold text-gray-700 dark:text-gray-200 truncate",
                                      item.completed && "line-through opacity-50 font-normal"
                                    )}>
                                      {item.text}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Botão de Ir para a conversa e focar na Timeline */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedContactForTasks(null);
                            handleSelectTask(task.contactId, task.noteId, task.instanceId);
                          }}
                          className="mt-1 w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-extrabold text-[10px] uppercase rounded-xl border border-amber-500/10 hover:border-amber-500/30 flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all font-sans"
                        >
                          Ir Para a Conversa & Focar na Timeline 🔍
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Rodapé do Modal */}
              <div className="px-6 py-5 bg-gray-50/50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedContactForTasks(null)}
                  className="px-6 py-2.5 rounded-2xl text-xs font-bold text-gray-600 dark:text-gray-300 bg-[#f0f2f5] dark:bg-[#202c33] hover:bg-gray-200 dark:hover:bg-white/10 active:scale-95 transition-all shadow-sm font-sans"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast Premium Flutuante para Feedback de Resposta Pronta */}
      {quickReplyToast && (
        <div className="fixed top-6 right-6 z-[999999] animate-in fade-in slide-in-from-top-4 slide-in-from-right-4 duration-300">
          <div className="bg-white/80 dark:bg-[#111b21]/80 backdrop-blur-xl border border-emerald-500/20 dark:border-emerald-500/30 rounded-3xl p-5 shadow-2xl flex items-center gap-4 max-w-sm transition-all duration-300 hover:shadow-emerald-500/10">
            {/* Ícone Pulsante */}
            <div className="w-12 h-12 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 shrink-0 shadow-sm border border-emerald-500/20 animate-pulse">
              <Sparkles className="w-6 h-6 animate-spin" style={{ animationDuration: '3s' }} />
            </div>
            
            {/* Texto Informativo */}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs uppercase font-extrabold tracking-wider text-emerald-600 dark:text-emerald-400">
                Resposta Pronta
              </h4>
              <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 mt-1 truncate">
                {quickReplyToast.type === 'sent' 
                  ? `Atalho ${quickReplyToast.shortcut} enviado!` 
                  : `Atalho ${quickReplyToast.shortcut} colado!`}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {quickReplyToast.type === 'sent' 
                  ? 'A mídia foi disparada com sucesso.' 
                  : 'Texto inserido no campo de mensagem.'}
              </p>
            </div>
            
            {/* Botão de Fechar Rápido */}
            <button
              onClick={() => setQuickReplyToast(null)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition-colors shrink-0"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
