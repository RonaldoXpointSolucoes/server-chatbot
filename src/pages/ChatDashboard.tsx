import React, { useState, useEffect, useRef } from 'react';
import { Bot, Settings, Users, Search, MoreVertical, Send, Check, CheckCheck, Smartphone, Power, Building2, Paperclip, Mic, FileText, Camera, Video, VideoOff, Image as ImageIcon, Pin, MessageSquarePlus, Star, Plus, Filter, Tag, Terminal, RefreshCw, History, BrainCircuit, ChevronDown, ChevronLeft, MapPin, User, Menu, Sparkles, Wand2, HeartHandshake, ShoppingBag, LifeBuoy, X, CheckCircle2, ExternalLink, ShieldAlert, Trash2, MessageCircle, Copy, Loader2, Ban, UserCheck, MessageSquareReply, Ticket, RotateCcw, Wifi, Database, ShieldCheck } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
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
import { Flag, Clock, Mail, MailOpen, CircleDollarSign, Edit2, Undo2, AlertTriangle, CheckSquare, MessageSquare, Play, Pause, StopCircle, ZoomIn, ZoomOut, CalendarClock, Lightbulb } from 'lucide-react'; // Adicionado lucide pro flag e lightbulb para corretor discreto
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
           <div className="line-clamp-3 italic opacity-90">{formatTextWithMentions(quotedText)}</div>
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
};

export default function ChatDashboard() {
  const navigate = useNavigate();
  const tenantName = (localStorage.getItem('current_tenant_name') || sessionStorage.getItem('current_tenant_name'));
  const currentUserRole = typeof window !== 'undefined' ? (localStorage.getItem('current_user_role') || sessionStorage.getItem('current_user_role')) || 'admin' : 'admin';
  const { isEnabled: isDevLoggerEnabled } = useDevStore();
  // Monitor de agendamentos
  useScheduleMonitor();
  const lastSyncTimeRef = useRef(0);

  // Estados do Corretor Ortográfico PT-BR (Ultra-Performance)
  const [validWords, setValidWords] = useState<Set<string>>(new Set());
  const [personalDict, setPersonalDict] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('chatboot_personal_dict');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [activeWordUnderCursor, setActiveWordUnderCursor] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestionsPopover, setShowSuggestionsPopover] = useState(false);
  const [spellcheckerLoaded, setSpellcheckerLoaded] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    async function loadSpellchecker() {
      try {
        const dicRes = await fetch('/dictionaries/pt_BR.dic');
        if (!dicRes.ok) {
          throw new Error('Falha ao obter o dicionário local.');
        }
        const dicText = await dicRes.text();
        const lines = dicText.split('\n');
        
        const wordSet = new Set<string>();
        
        // Ignorar a primeira linha (contagem) e popular o Set
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const parts = line.split('/');
          const word = parts[0].trim();
          if (word) {
            wordSet.add(word.toLowerCase());
          }
        }
        
        setValidWords(wordSet);
        setSpellcheckerLoaded(true);
        console.log(`Corretor ortográfico PT-BR carregado localmente com ${wordSet.size} palavras!`);
      } catch (e) {
        console.error('Erro ao carregar o corretor ortográfico:', e);
      }
    }
    loadSpellchecker();
  }, []);

  const getLevenshteinDistance = (a: string, b: string): number => {
    const tmp = [];
    for (let i = 0; i <= a.length; i++) {
      tmp[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
      tmp[0][j] = j;
    }
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        tmp[i][j] = a[i - 1] === b[j - 1] 
          ? tmp[i - 1][j - 1] 
          : Math.min(tmp[i - 1][j - 1] + 1, tmp[i][j - 1] + 1, tmp[i - 1][j] + 1);
      }
    }
    return tmp[a.length][b.length];
  };

  const getSuggestions = (incorrectWord: string): string[] => {
    const word = incorrectWord.toLowerCase().trim();
    if (!word || validWords.size === 0) return [];
    
    const firstChar = word[0];
    const candidates: string[] = [];
    
    for (const val of validWords) {
      if (val[0] === firstChar && Math.abs(val.length - word.length) <= 2) {
        candidates.push(val);
      }
    }
    
    const scores = candidates.map(cand => ({
      word: cand,
      dist: getLevenshteinDistance(word, cand)
    }));
    
    const sorted = scores
      .filter(item => item.dist <= 2)
      .sort((a, b) => a.dist - b.dist);
      
    return sorted.slice(0, 4).map(item => item.word);
  };

  const isWordCorrect = (word: string) => {
    if (!spellcheckerLoaded) return true;
    const cleanWord = word.replace(/^[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+|[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+$/g, '').trim().toLowerCase();
    if (!cleanWord || /^\d+$/.test(cleanWord)) return true;
    if (personalDict.includes(cleanWord)) return true;
    return validWords.has(cleanWord);
  };

  const handleTextareaSelection = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const pos = target.selectionStart;
    const text = target.value;
    setScrollTop(target.scrollTop);
    
    if (!text || !spellcheckerLoaded) {
      setActiveWordUnderCursor(null);
      setSuggestions([]);
      return;
    }
    
    let start = pos;
    while (start > 0 && !/\s/.test(text[start - 1])) {
      start--;
    }
    let end = pos;
    while (end < text.length && !/\s/.test(text[end])) {
      end++;
    }
    
    const rawWord = text.substring(start, end);
    const cleanWord = rawWord.replace(/^[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+|[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+$/g, '').trim();
    
    if (cleanWord && !isWordCorrect(cleanWord)) {
      setActiveWordUnderCursor(cleanWord);
      const suggs = getSuggestions(cleanWord);
      setSuggestions(suggs);
    } else {
      setActiveWordUnderCursor(null);
      setSuggestions([]);
    }
  };

  const replaceWordInText = (oldWord: string, newWord: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const text = inputText;
    const pos = textarea.selectionStart;
    
    let start = pos;
    while (start > 0 && !/\s/.test(text[start - 1])) {
      start--;
    }
    let end = pos;
    while (end < text.length && !/\s/.test(text[end])) {
      end++;
    }
    
    const rawWord = text.substring(start, end);
    const startPunctMatch = rawWord.match(/^[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+/);
    const endPunctMatch = rawWord.match(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+$/);
    
    const startPunct = startPunctMatch ? startPunctMatch[0] : '';
    const endPunct = endPunctMatch ? endPunctMatch[0] : '';
    
    const replacement = startPunct + newWord + endPunct;
    const newText = text.substring(0, start) + replacement + text.substring(end);
    setInputText(newText);
    
    setActiveWordUnderCursor(null);
    setSuggestions([]);
    
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + replacement.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 50);
  };

  const addToPersonalDict = (word: string) => {
    const cleanWord = word.toLowerCase().trim();
    if (!cleanWord || personalDict.includes(cleanWord)) return;
    
    const newDict = [...personalDict, cleanWord];
    setPersonalDict(newDict);
    localStorage.setItem('chatboot_personal_dict', JSON.stringify(newDict));
    
    setActiveWordUnderCursor(null);
    setSuggestions([]);
  };

  const renderHighlightedText = () => {
    if (!inputText) return null;
    const wordsAndSpaces = inputText.split(/(\s+)/);
    
    return wordsAndSpaces.map((part, index) => {
      if (/^\s+$/.test(part)) {
        return <span key={index}>{part}</span>;
      }
      
      const cleanWord = part.replace(/^[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+|[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+$/g, '');
      
      if (cleanWord && !isWordCorrect(cleanWord)) {
        const startPunctMatch = part.match(/^[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+/);
        const endPunctMatch = part.match(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+$/);
        
        const startPunct = startPunctMatch ? startPunctMatch[0] : '';
        const endPunct = endPunctMatch ? endPunctMatch[0] : '';
        
        return (
          <span key={index} className="text-transparent">
            {startPunct}
            <span className="border-b-2 border-red-500 border-dotted text-transparent bg-red-500/5 select-none">
              {cleanWord}
            </span>
            {endPunct}
          </span>
        );
      }
      
      return <span key={index} className="text-transparent">{part}</span>;
    });
  };

  // Estados para Filtros (Movido para o topo para evitar erro de inicialização)
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [filterContextMenu, setFilterContextMenu] = useState<{ type: string, x: number, y: number } | null>(null);
  const [instanceNamesMap, setInstanceNamesMap] = useState<Record<string, string>>({});
  const [instanceColorsMap, setInstanceColorsMap] = useState<Record<string, string>>({});
  const [availableInstancesList, setAvailableInstancesList] = useState<{id: string, display_name: string, color: string}[]>([]);

  const [copiedDoc, setCopiedDoc] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [associatedCompaniesOpen, setAssociatedCompaniesOpen] = useState(false);
  const [companyDetailsOpen, setCompanyDetailsOpen] = useState(false);
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
    setInstanceStatus,
    ticketMode,
    setTicketMode,
    reopenConversation,
    resolveAllConversations,
    undoLastBatchResolve,
    reopenedTicketToast,
    setReopenedTicketToast,
    realtimeStatus,
    tenantLabels,
    fetchTenantLabels
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
    tenantLabels: state.tenantLabels,
    fetchTenantLabels: state.fetchTenantLabels
  })));

  const [editingMessage, setEditingMessage] = useState<{ id: string, text: string } | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);

  // Garante que o chat ativo seja marcado como lido automaticamente ao ser aberto ou ao receber novas mensagens
  useEffect(() => {
    if (activeChatId) {
      const activeContact = contacts.find(c => c.id === activeChatId);
      if (activeContact && Number(activeContact.unread || 0) > 0) {
        useChatStore.getState().markAsRead(activeChatId);
      }
    }
  }, [activeChatId, contacts]);

  // Execucao Incial Reativa
  // Efect removido (duplicado com o useEffect consolidado mais abaixo)
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAgentSettingsOpen, setIsAgentSettingsOpen] = useState(false);
  const [isSnoozedListOpen, setIsSnoozedListOpen] = useState(false);
  const isModalOpen = !!modalReason || isSettingsOpen || isAgentSettingsOpen || isSnoozedListOpen;
  const [inputText, setInputText] = useState('');
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
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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

  const systemHealth = React.useMemo<'green' | 'yellow' | 'red'>(() => {
    const internetOk = isOnline;
    const realtimeOk = realtimeStatus === 'connected';
    const evoOk = evolutionConnected;

    if (!internetOk || !evoOk || realtimeStatus === 'disconnected') {
      return 'red';
    } else if (realtimeStatus === 'connecting') {
      return 'yellow';
    }
    return 'green';
  }, [isOnline, realtimeStatus, evolutionConnected]);

  // Estados para Fechamento em Lote de Tickets (Modo Ticket Ativo)
  const [isConfirmBatchResolveOpen, setIsConfirmBatchResolveOpen] = useState(false);
  const [isUndoToastVisible, setIsUndoToastVisible] = useState(false);
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

  // Carrega mensagens do Evolution ao clicar num chat novo
  useEffect(() => {
     if (activeChatId && activeChat && evolutionConnected) {
       const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
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
    const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
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
    const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
    if (!file || !activeChatId || !properTargetInstance) return;
    
    let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('video/')) mediaType = 'video';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';

    await useChatStore.getState().uploadAndSendMedia(activeChatId, file, mediaType, properTargetInstance as string);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      
      <AssociatedCompaniesModal 
        isOpen={associatedCompaniesOpen}
        onClose={() => setAssociatedCompaniesOpen(false)}
        companies={activeChat?.company_ids?.map((id: string) => allCompanies.find((c: any) => c.id === id)).filter(Boolean) || []}
      />

      <CompanyDetailsModal
        isOpen={companyDetailsOpen}
        onClose={() => setCompanyDetailsOpen(false)}
        contact={activeChat}
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
           const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
           if (activeChatId && properTargetInstance) {
             sendHumanMessage(activeChatId, finalText, properTargetInstance as string);
             setInputText('');
             if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
             }
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
          <span className="absolute top-1 left-4 text-[10px] font-mono text-[#00a884] opacity-80 whitespace-nowrap">{`v${import.meta.env.PACKAGE_VERSION || '2.8.2'} | Deploy: ${import.meta.env.PACKAGE_BUILD_DATE ? new Date(import.meta.env.PACKAGE_BUILD_DATE).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '27/05/2026, 09:30'}`}</span>
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
                 systemHealth === 'yellow' ? "Atenção" : "Offline"}
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
                  <ShieldCheck size={16} className={evolutionConnected ? "text-emerald-500" : "text-rose-500"} />
                  <span className={cn(
                    "absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-white dark:border-[#111b21]",
                    evolutionConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                  )}></span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-medium text-gray-400 dark:text-[#8696a0]">WhatsApp</span>
                  <span className="text-[11px] font-bold text-gray-700 dark:text-[#d1d7db]">
                    {evolutionConnected ? "Conectado" : "Offline"}
                  </span>
                </div>
              </div>
            </div>
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
                      const colorBase = label.color?.replace('bg-', '') || 'indigo';
                      return (
                        <button
                          key={label.id}
                          onClick={() => setSelectedLabelId(label.id)}
                          className={cn(
                            "px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 border border-transparent shadow-sm",
                            isSelected
                              ? `bg-${colorBase}-500/15 text-${colorBase}-600 dark:text-${colorBase}-400 ring-1 ring-${colorBase}-500/30`
                              : "bg-gray-100 dark:bg-[#202c33] text-gray-600 dark:text-[#d1d7db] hover:bg-gray-200 dark:hover:bg-gray-700"
                          )}
                        >
                          <span 
                            className={cn(
                              "w-2 h-2 rounded-full shadow-inner shrink-0", 
                              !label.color?.startsWith('#') && label.color
                            )} 
                            style={label.color?.startsWith('#') ? { backgroundColor: label.color } : undefined} 
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
                  layout
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
                    "group flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-[#f2f2f2] dark:border-[#222d34] overflow-visible",
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
                                 <div className="flex items-center gap-1.5 overflow-hidden shrink-0 flex-wrap">
                                   {contact.conv_labels.map((l: any, i: number) => {
                                     const isHex = l.color?.startsWith('#');
                                     const colorBase = l.color?.replace('bg-', '') || 'blue';
                                     
                                     return (
                                       <span 
                                         key={i} 
                                         className={cn(
                                           "px-1.5 py-[2px] text-[8px] font-extrabold rounded-md flex items-center max-w-[95px] truncate shadow-sm border transition-all hover:scale-105 duration-200", 
                                           isHex 
                                             ? "" 
                                             : `bg-${colorBase}-500/15 text-${colorBase}-600 dark:text-${colorBase}-400 border-${colorBase}-500/20`
                                         )} 
                                         style={isHex ? { 
                                           backgroundColor: `${l.color}15`, 
                                           borderColor: `${l.color}30`, 
                                           color: l.color 
                                         } : {}} 
                                         title={l.name}
                                       >
                                         <span 
                                           className={cn("w-1.5 h-1.5 rounded-full mr-1 shrink-0 shadow-inner", !isHex && l.color)} 
                                           style={isHex ? { backgroundColor: l.color } : {}}
                                         />
                                         <span className="truncate">{l.name}</span>
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
                                  onClick={(e) => { e.stopPropagation(); resolveConversation(contact.id); setActiveDropdown(null); }}
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
                  <div className="flex items-center mt-0.5 animate-in fade-in slide-in-from-top-1 duration-300">
                    {(activeChat.fantasy_name || activeChat.document_number) ? (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setCompanyDetailsOpen(true);
                        }}
                        className="flex items-center gap-1.5 bg-[#00a884]/10 hover:bg-[#00a884]/20 px-2.5 py-0.5 rounded-full border border-[#00a884]/20 transition-all duration-200 group"
                        title="Ver Dados da Empresa e Faturamento"
                      >
                        <Building2 size={12} className="text-[#00a884] group-hover:scale-110 transition-transform" />
                        <span className="text-[11px] font-semibold text-[#00a884]">Ver Empresa</span>
                      </button>
                    ) : activeChat.phone ? (
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
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Header Area */}
            <div className="flex items-center gap-2 sm:gap-4">
              
              <div className="hidden lg:flex items-center gap-2">
                {activeChat.conv_status === 'resolved' ? (
                  <button 
                    onClick={() => {
                      reopenConversation(activeChat.id);
                    }}
                    className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-full transition-all duration-300 text-sm font-semibold border border-blue-200 dark:border-blue-500/20 shadow-sm animate-in fade-in hover:scale-105 active:scale-95"
                    title="Reabrir Conversa"
                  >
                    <RotateCcw size={16} className="animate-spin-once" />
                    <span>Reabrir Conversa</span>
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      resolveConversation(activeChat.id);
                    }}
                    className="flex items-center gap-2 px-4 py-1.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-full transition-all duration-300 text-sm font-semibold border border-emerald-200 dark:border-emerald-500/20 shadow-sm animate-in fade-in hover:scale-105 active:scale-95"
                    title="Resolver Conversa"
                  >
                    <CheckCircle2 size={16} />
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
                    onClick={() => resolveConversation(activeChat.id)}
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
                            resolveConversation(activeChat.id);
                            setMobileHeaderMenuOpen(false);
                          }}
                          className="flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded-xl transition-all text-sm font-semibold border border-emerald-200 dark:border-emerald-500/20 w-full shadow-sm hover:scale-[1.02]"
                        >
                          <CheckCircle2 size={16} />
                          <span>Resolver Conversa</span>
                        </button>
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
                          ⚡ Respostas Prontas
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
                                    const properTargetInstance = getStrictInstance(activeChat) || activeChannelFilter || connectedInstanceName;
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
                    
                    {/* Barra de Sugestões Ortográficas do Corretor (Sob demanda ao clicar na lâmpada) */}
                    {showSuggestionsPopover && activeWordUnderCursor && suggestions.length > 0 && (
                      <div className="absolute bottom-full left-4 mb-3 flex items-center gap-2 p-2 bg-white/95 dark:bg-[#202c33]/95 backdrop-blur-xl rounded-2xl border border-black/5 dark:border-white/10 shadow-2xl text-xs z-[101] animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200">
                        <span className="text-gray-500 dark:text-gray-400 font-medium pl-1">Sugestões para "{activeWordUnderCursor}":</span>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {suggestions.map((sugg, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => replaceWordInText(activeWordUnderCursor, sugg)}
                              className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-[#00a884] font-bold rounded-xl transition-all active:scale-95"
                            >
                              {sugg}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => addToPersonalDict(activeWordUnderCursor)}
                            className="px-2.5 py-1 bg-gray-100 dark:bg-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-gray-600 dark:text-gray-300 font-semibold rounded-xl flex items-center gap-1 transition-all active:scale-95 border border-transparent dark:border-white/5"
                          >
                            <Plus size={12} /> Adicionar
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="relative flex-1 min-w-0 min-h-[20px] flex items-end">
                      {/* Div de Highlight por trás (grifa as palavras em vermelho) */}
                      <div 
                        className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none select-none whitespace-pre-wrap break-words text-transparent text-sm resize-none pb-0.5 overflow-hidden leading-relaxed px-0 py-0"
                        style={{ 
                          font: 'inherit',
                          lineHeight: 'inherit',
                          maxHeight: '250px',
                          transform: `translateY(-${scrollTop}px)`
                        }}
                      >
                        {renderHighlightedText()}
                      </div>

                      <textarea 
                        ref={textareaRef}
                        value={inputText}
                        spellCheck={false}
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
                          setScrollTop(e.currentTarget.scrollTop);
                        }}
                        onSelect={handleTextareaSelection}
                        onClick={handleTextareaSelection}
                        onKeyUp={handleTextareaSelection}
                        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
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
                        placeholder="Responda como humano e a IA sera pausada automaticamente..."
                        className="bg-transparent border-none outline-none w-full text-sm text-[#111b21] dark:text-[#e9edef] placeholder:text-[#54656f] dark:placeholder:text-[#aebac1] resize-none pb-0.5 overflow-y-auto max-h-[250px] scrollbar-thin relative z-10"
                      />
                    </div>
                    {/* Botão de Sugestão Ortográfica Discreto */}
                    {activeWordUnderCursor && suggestions.length > 0 && (
                      <button 
                        type="button" 
                        onClick={() => setShowSuggestionsPopover(!showSuggestionsPopover)}
                        className={cn(
                          "mb-0.5 p-1.5 rounded-full transition-colors flex-shrink-0 relative active:scale-95 ml-1",
                          showSuggestionsPopover 
                            ? "text-[#00a884] bg-[#00a884]/10" 
                            : "text-amber-500 hover:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-400/10"
                        )}
                        title={`Ver sugestões de correção para "${activeWordUnderCursor}"`}
                      >
                        <Lightbulb size={20} className={cn(!showSuggestionsPopover && "animate-pulse")} />
                        {!showSuggestionsPopover && (
                          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                          </span>
                        )}
                      </button>
                    )}

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
                      className="w-10 h-10 flex items-center justify-center bg-[#00a884] text-white rounded-full shadow-md hover:scale-105 transition-transform active:scale-95 shrink-0"
                    >
                      <Send size={16} className="translate-x-0.5" />
                    </button>
                  ) : (
                    <button 
                      type="button"
                      onClick={handleMicClick}
                      className={cn(
                         "w-10 h-10 flex items-center justify-center rounded-full shadow-md hover:scale-105 transition-all active:scale-95 shrink-0",
                         audioState === 'recording' ? "bg-red-500 text-white animate-pulse" : "bg-transparent text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5 shadow-none"
                      )}
                    >
                      <Mic size={20} />
                    </button>
                  )}
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
