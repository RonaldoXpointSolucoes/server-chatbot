import React, { useState, useEffect, useRef } from 'react';
import { Bot, Settings, Users, Search, MoreVertical, Send, Check, CheckCheck, Smartphone, Power, Building2, Paperclip, Mic, FileText, Camera, Video, Image as ImageIcon, Pin, MessageSquarePlus, Star, Plus, Filter, Tag, Terminal, RefreshCw, History, BrainCircuit, ChevronDown, ChevronLeft, MapPin, User, Menu, Sparkles, Wand2, HeartHandshake, ShoppingBag, LifeBuoy, X, CheckCircle2 } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { DeleteModal, RenameModal, NewChatModal } from '../components/ChatModals';
import { SettingsModal } from '../components/SettingsModal';
import { AgentSettingsModal } from '../components/AgentSettingsModal';
import { ChatOmniMenu } from '../components/ChatOmniMenu';
import { MainSidebar } from '../components/MainSidebar';
import { GeminiEditorModal } from '../components/GeminiEditorModal';
import ThemeToggle from '../components/ThemeToggle';
import { useDevStore } from '../store/devStore';
import { format, isToday, isYesterday } from 'date-fns';
import { Flag, Clock } from 'lucide-react'; // Adicionado lucide pro flag
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import EvolutionModal from '../components/EvolutionModal';
import { supabase } from '../services/supabase';
import { geminiService } from '../services/geminiService';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function getContactDisplayName(name: string | undefined | null, pushName: string | undefined | null, phone: string | undefined | null): string {
  let finalName = name || pushName;
  if (!finalName) return phone || '';
  const lowerName = finalName.toLowerCase();
  if (lowerName.includes('x point') || lowerName.includes('x-point') || lowerName.includes('xpoint') || lowerName === 'empresa' || lowerName.includes('solu')) {
    return phone || finalName;
  }
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

export default function ChatDashboard() {
  const navigate = useNavigate();
  const tenantName = sessionStorage.getItem('current_tenant_name');
  const { isEnabled: isDevLoggerEnabled } = useDevStore();
  const {  
    contacts, 
    activeChatId, 
    evolutionConnected, 
    connectedInstanceName,
    appVersion,
    setActiveChat, 
    sendHumanMessage, 
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
    togglePinContact,
    toggleFavorite,
    activeChannelFilter,
    activeChannelName
  } = useChatStore();

  // Execucao Incial Reativa
  useEffect(() => {
    fetchTenantConfig().then(() => {
       fetchInitialData();
       fetchTenantAgents();
    });
    subscribeToNewMessages();
  }, []);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAgentSettingsOpen, setIsAgentSettingsOpen] = useState(false);
  const isModalOpen = !!modalReason || isSettingsOpen || isAgentSettingsOpen;
  const [inputText, setInputText] = useState('');

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

  // Estados dos novos menus fluídos
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [contactToEdit, setContactToEdit] = useState<any | null>(null);
  const [contactToDelete, setContactToDelete] = useState<{id: string; name: string} | null>(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [activeChatDropdown, setActiveChatDropdown] = useState(false);
  const { showMainSidebar, setShowMainSidebar } = (useOutletContext() as { showMainSidebar: boolean, setShowMainSidebar: (v: boolean) => void }) || { showMainSidebar: true, setShowMainSidebar: () => {} };
  
  // Gemini AI States
  const [isGeminiPopoverOpen, setIsGeminiPopoverOpen] = useState(false);
  const [isGeminiProcessing, setIsGeminiProcessing] = useState(false);
  const [geminiSuggestion, setGeminiSuggestion] = useState<string | null>(null);
  const [geminiModalState, setGeminiModalState] = useState<{
    isOpen: boolean;
    originalText: string;
    suggestedText: string;
    intent: 'grammar' | 'sales' | 'enchant' | 'support' | null;
  }>({
    isOpen: false,
    originalText: '',
    suggestedText: '',
    intent: null
  });

  // Estados para Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'unread' | 'favorite' | 'labels'>('all');
  const [filterContextMenu, setFilterContextMenu] = useState<{ type: string, x: number, y: number } | null>(null);
  const [instanceNamesMap, setInstanceNamesMap] = useState<Record<string, string>>({});
  
  useEffect(() => {
    const closeCb = () => setFilterContextMenu(null);
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
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Scroll inicial e quando muda de chat
  useEffect(() => {
    if (activeChatId) {
      scrollToBottom('auto'); // Vai pro fim instantâneo
      setShowScrollButton(false);
      prevMessagesLength.current = activeChat?.messages?.length || 0;
      
      // Fallback para imagens/mídias carregando
      const timeout = setTimeout(() => {
        // Usa 'auto' para evitar a animação indesejada de rolar visualmente até o fim da página ao abrir nova conversa
        scrollToBottom('auto');
      }, 150);
      return () => clearTimeout(timeout);
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
        // Usa rolagem instantânea ('auto') se vierem múltiplas mensagens de uma vez (ex: carregamento do histórico)
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
    })();
    subscribeToNewMessages();

    supabase.from('whatsapp_instances').select('id, display_name').then(({data}) => {
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(d => { map[d.id] = d.display_name; });
        setInstanceNamesMap(map);
      }
    });
  }, []);

  // Carrega mensagens do Evolution ao clicar num chat novo
  useEffect(() => {
     if (activeChatId && activeChat && evolutionConnected) {
       const properTargetInstance = activeChat.instance_id || connectedInstanceName;
       if (properTargetInstance) {
          loadHistoricalMessages(activeChatId, properTargetInstance);
       }
     }
  }, [activeChatId, activeChat?.instance_id, connectedInstanceName, evolutionConnected, loadHistoricalMessages]);

  const handleSendHuman = (e: React.FormEvent) => {
    e.preventDefault();
    const properTargetInstance = activeChat?.instance_id || connectedInstanceName;
    if (!inputText.trim() || !activeChatId || !properTargetInstance) return;
    
    // ATENÇÃO: Numa versão final multi-tenant o instanceName deve vir do Login.
    sendHumanMessage(activeChatId, inputText, properTargetInstance as string);
    setInputText('');
    if (activeChatId) draftsRef.current[activeChatId] = '';
    
    if (textareaRef.current) {
       textareaRef.current.style.height = 'auto';
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const properTargetInstance = activeChat?.instance_id || connectedInstanceName;
    if (!file || !activeChatId || !properTargetInstance) return;
    
    let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('video/')) mediaType = 'video';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';

    await useChatStore.getState().uploadAndSendMedia(activeChatId, file, mediaType, properTargetInstance as string);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMicClick = async () => {
    const properTargetInstance = activeChat?.instance_id || connectedInstanceName;
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

  const handleGeminiAction = async (type: 'grammar' | 'sales' | 'enchant' | 'support') => {
    if (!inputText.trim() || !activeChat) return;

    setIsGeminiProcessing(true);
    try {
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
    } catch (error: any) {
      alert(error.message || 'Erro ao comunicar com a IA (Verifique a API Key).');
    } finally {
      setIsGeminiProcessing(false);
      setIsGeminiPopoverOpen(false);
    }
  };

  return (
    <div className="flex w-full h-full min-w-0 bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden font-sans relative">
      
      {useChatStore(s => s.isQRModalOpen) && <EvolutionModal 
          targetInstanceName={useChatStore.getState().qrModalTargetInstance}
          onClose={() => {
            useChatStore.getState().closeQRModal();
            setModalReason(null);
          }} 
      />}

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

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <AgentSettingsModal isOpen={isAgentSettingsOpen} onClose={() => setIsAgentSettingsOpen(false)} />

      <NewChatModal 
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        contacts={contacts}
        onStartChat={(contactId) => {
          setActiveChat(contactId);
          if (connectedInstanceName) {
            useChatStore.getState().loadHistoricalMessages(contactId, connectedInstanceName);
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
           const properTargetInstance = activeChat?.instance_id || connectedInstanceName;
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
      <div className={cn(
        "w-full sm:w-[30%] sm:min-w-[320px] lg:w-[320px] lg:max-w-[340px] border-r border-[#d1d7db] dark:border-[#222d34] flex flex-col bg-white dark:bg-[#111b21] transition-all",
        activeChatId ? "hidden sm:flex" : "flex"
      )}
        onClick={() => setActiveDropdown(null)} // fecha qq dropdown ao clicar fora
      >
        
        {/* Header Premium da Sidebar */}
        <div className="h-20 bg-white/50 dark:bg-[#202c33]/80 backdrop-blur-xl flex flex-col justify-center px-4 py-2 border-b border-[#d1d7db] dark:border-[#222d34] flex-shrink-0 z-10 shadow-sm relative">
          <span className="absolute top-1 left-4 text-[10px] font-mono text-[#00a884] opacity-80 whitespace-nowrap">
            {appVersion ? `${appVersion.version} | Deploy: ${new Date(appVersion.deploy_date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : "v2.0.14 | Deploy: ..."}
          </span>
          
          <div className="flex items-center justify-between w-full mt-2">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowMainSidebar(!showMainSidebar)}
                className="hidden lg:flex p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1] transition-colors"
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
                    <button className="w-full text-left px-5 py-3 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3">
                      <Tag size={18} className="text-blue-500" />
                      <span className="text-[15px] text-[#3b4a54] dark:text-[#d1d7db]">Etiquetas</span>
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

        {/* Alerta de Desconexão (Offline Banner) */}
        {!evolutionConnected && (
          <div className="bg-orange-50 dark:bg-orange-950/40 border-y border-orange-200 dark:border-orange-900/50 p-3 flex flex-col gap-1 z-20 shadow-sm animate-in fade-in zoom-in-95 duration-300">
             <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 font-bold text-sm">
               <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping absolute"></span>
               <span className="w-2 h-2 rounded-full bg-orange-500 relative"></span>
               Atenção: Sistema Offline
             </div>
             <p className="text-xs text-orange-700/80 dark:text-orange-300/80 leading-tight">
                O WhatsApp desconectou ou o servidor está reiniciando. Verifique o aparelho ou abra as configurações de WhatsApp.
             </p>
             <button onClick={() => useChatStore.getState().openQRModal()} className="mt-1 text-xs bg-orange-100 dark:bg-orange-900/40 hover:bg-orange-200 dark:hover:bg-orange-800/40 text-orange-700 dark:text-orange-300 py-1.5 px-3 rounded-md font-medium transition-colors w-fit">
                Resolver Agora
             </button>
          </div>
        )}

        {/* Search e Filtros */}
        <div className="flex flex-col border-b border-[#f2f2f2] dark:border-[#222d34] px-3 py-2 gap-3 bg-white dark:bg-[#111b21]">
          <div className="flex w-full bg-[#f0f2f5] dark:bg-[#202c33] px-3 py-2 rounded-xl items-center gap-2 group transition-all ring-1 ring-transparent focus-within:ring-[#00a884]/50 shadow-inner">
            <Search size={18} className="text-[#54656f] dark:text-[#aebac1] group-focus-within:text-[#00a884] transition-colors" />
            <input 
              type="text" 
              placeholder="Pesquisar chat ou contato" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-full dark:text-[#d1d7db] placeholder:text-[#54656f] dark:placeholder:text-[#aebac1]"
            />
          </div>
          
          {/* Pills Filters (Glassmorphism inspired) */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide relative select-none">
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
          </div>

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
        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 && (
             <p className="text-xs text-center p-6 text-gray-400">Nenhuma conversa encontrada ou aguardando conexão web-socket...</p>
          )}

          {contacts.filter(c => {
             // Debug para entender o bug do filtro quando Comercial X-Point é clicado!
             if (activeChannelFilter) {
                 const dbInstId = c.instance_id;
                 const effectiveId = connectedInstanceName;
                 console.log("DEBUG CHANNEL FILTER:", {
                     contactName: c.contact_name,
                     dbInstId,
                     effectiveId,
                     activeFilter: activeChannelFilter,
                     activeName: activeChannelName
                 });

                 if (!dbInstId) {
                     // Fallback conversas antigas órfãs. Vão para a instância padrão (connectedInstanceName)
                     if (effectiveId !== activeChannelFilter && effectiveId !== activeChannelName) return false;
                 } else {
                     // Conversas nativas. Compara com ID gerado UUID ou Legacy Name
                     if (dbInstId !== activeChannelFilter && dbInstId !== activeChannelName) return false;
                 }
             }

             // Busca em texto
             if (searchTerm && !c.name?.toLowerCase().includes(searchTerm.toLowerCase()) && !c.whatsapp_jid?.includes(searchTerm)) {
               return false;
             }
             // Filtros de Pills
             if (filterType === 'unread' && c.unread <= 0) return false;
             if (filterType === 'favorite' && !c.is_favorite) return false;
             if (filterType === 'labels' && !(c.conv_labels && c.conv_labels.length > 0)) return false;
             
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
             if (a.is_pinned && !b.is_pinned) return -1;
             if (!a.is_pinned && b.is_pinned) return 1;
             
             const aLastMsg = a.messages?.[a.messages.length - 1];
             const bLastMsg = b.messages?.[b.messages.length - 1];
             
             const aTime = Math.max(a.lastMsgTimestamp || 0, aLastMsg ? new Date(aLastMsg.timestamp).getTime() : 0);
             const bTime = Math.max(b.lastMsgTimestamp || 0, bLastMsg ? new Date(bLastMsg.timestamp).getTime() : 0);
             
             return bTime - aTime;
          }).map((contact) => {
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
                  const properTargetInstance = contact.instance_id || connectedInstanceName;
                  if (properTargetInstance) {
                    useChatStore.getState().loadHistoricalMessages(contact.id, properTargetInstance);
                    if (contact.avatar?.includes('ui-avatars')) {
                      useChatStore.getState().fetchContactPicture(contact.id, contact.whatsapp_jid || (contact.phone + '@s.whatsapp.net'), properTargetInstance);
                    }
                  }
                }}
                className={cn(
                  "group flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-[#f2f2f2] dark:border-[#222d34] overflow-visible",
                  activeChatId === contact.id ? "bg-[#f0f2f5] dark:bg-[#2a3942]" : "hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
                )}
              >
                <div className="relative shrink-0">
                  <img src={contact.avatar} alt="Avatar" className="w-12 h-12 rounded-full object-cover shadow-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <div className="flex flex-col truncate pr-2">
                       <span className="font-medium text-[#111b21] dark:text-[#e9edef] truncate flex items-center gap-1.5">
                         <span className="truncate">{formatPhoneNumber(getContactDisplayName(contact.custom_name || contact.name, contact.push_name, contact.phone))}</span>
                         {contact.priority === 'urgent' && <Flag size={12} className="fill-rose-500 text-rose-500 shrink-0" />}
                         {contact.priority === 'high' && <Flag size={12} className="fill-orange-500 text-orange-500 shrink-0" />}
                         {contact.conv_status === 'snoozed' && contact.snoozed_until && new Date(contact.snoozed_until).getTime() > Date.now() && <Clock size={12} className="text-amber-500 shrink-0" />}
                         {contact.assigned_to && (
                           <span className="shrink-0 px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 border border-indigo-100 dark:border-indigo-500/20 text-[9px] font-bold uppercase rounded flex items-center gap-1">
                             <User size={9} />
                             <span className="max-w-[50px] truncate">{agents.find(a => a.id === contact.assigned_to)?.full_name?.split(' ')[0] || 'Ag'}</span>
                           </span>
                         )}
                       </span>
                      {!activeChannelFilter && (contact.instance_id ? instanceNamesMap[contact.instance_id] : connectedInstanceName) && (
                        <span className="text-[10px] px-1.5 py-[2px] rounded-md bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 text-slate-600 dark:text-[#aebac1] font-medium truncate mt-1 w-fit max-w-[140px] flex items-center gap-1 shadow-sm">
                          <Smartphone size={10} className="shrink-0 opacity-80" />
                          <span className="truncate">{contact.instance_id ? instanceNamesMap[contact.instance_id] : connectedInstanceName}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={cn("text-[11px] font-medium min-w-fit ml-1 flex items-center gap-1", contact.unread > 0 ? "text-[#00a884]" : "text-[#54656f] dark:text-[#8696a0]")}>
                        {contact.is_pinned && <Pin size={12} className="text-[#00a884] rotate-45 fill-current opacity-80" />}
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
                          <div className="absolute right-0 top-6 w-44 bg-white dark:bg-[#233138] border border-black/5 dark:border-white/5 rounded-xl shadow-xl py-2 z-[99] animate-in fade-in zoom-in-95 duration-100">
                            <button 
                              onClick={(e) => { e.stopPropagation(); togglePinContact(contact.id); setActiveDropdown(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors flex items-center gap-2"
                            >
                              <Pin size={14} className={contact.is_pinned ? "rotate-45" : ""} />
                              {contact.is_pinned ? "Desafixar conversa" : "Fixar no topo"}
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
                                const properTargetInstance = contact.instance_id || connectedInstanceName;
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
                            <button 
                              onClick={(e) => { e.stopPropagation(); setContactToEdit(contact); setActiveDropdown(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-[#3b4a54] dark:text-[#d1d7db] hover:bg-[#f5f6f6] dark:hover:bg-[#182229] transition-colors"
                            >
                              Editar contato
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setContactToDelete({id: contact.id, name: contact.name || contact.phone}); setActiveDropdown(null); }}
                              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            >
                              Apagar conversa
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex text-[13px] text-[#54656f] dark:text-[#8696a0] truncate mt-0.5 items-center justify-between">
                    <div className="flex items-center gap-1.5 truncate w-full pr-2">
                       {isMe && (
                           lastMsg?.status === 'READ' ? <CheckCheck size={14} className="text-[#53bdeb] shrink-0" /> : 
                           lastMsg?.status === 'DELIVERY_ACK' || lastMsg?.status === 'SERVER_ACK' ? <CheckCheck size={14} className="text-gray-400 shrink-0" /> :
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

      {/* Main Chat Area */}
      {activeChat ? (
        <div 
          onClick={() => setActiveChatDropdown(false)}
          className={cn("flex-1 flex flex-col relative w-full h-full max-w-[100vw] overflow-hidden min-w-0 bg-[#efeae2] dark:bg-[#0b141a]", !activeChatId && "hidden sm:flex")} 
          style={{
           backgroundImage: 'url("https://w7.pngwing.com/pngs/946/407/png-transparent-whatsapp-background-theme-pattern-design.png")',
           backgroundSize: 'cover',
           backgroundBlendMode: 'overlay',
           opacity: 0.95
        }}>
          
          {/* Chat Header */}
          <div className="relative h-16 bg-[#f0f2f5] dark:bg-[#202c33] flex items-center justify-between px-4 z-20 shadow-sm border-l border-white/5">
            <div className="flex items-center gap-3">
              <button className="sm:hidden p-2 -ml-2 mr-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#54656f] dark:text-[#aebac1]" onClick={() => setActiveChat(null)}>
                <ChevronLeft size={24} />
              </button>
              <img src={activeChat.avatar} alt="Avatar" className="w-10 h-10 rounded-full object-cover" />
              <div>
                <h2 className="font-medium text-[#111b21] dark:text-[#e9edef] leading-tight flex items-center gap-2">
                  <span className="truncate max-w-[200px] sm:max-w-md">{formatPhoneNumber(getContactDisplayName(activeChat.custom_name || activeChat.name, activeChat.push_name, activeChat.phone))}</span>
                  {activeChat.phone && getContactDisplayName(activeChat.custom_name || activeChat.name, activeChat.push_name, activeChat.phone) !== formatPhoneNumber(activeChat.phone) && (
                    <span className="text-[12px] text-[#54656f] dark:text-[#8696a0] font-mono inline-block mt-0.5 border border-black/5 dark:border-white/10 px-1.5 rounded-md bg-black/5 dark:bg-white/5 hidden sm:inline-block">
                      {formatPhoneNumber(activeChat.phone)}
                    </span>
                  )}
                </h2>
              </div>
            </div>

            {/* Right Header Area */}
            <div className="flex items-center gap-2 sm:gap-4">
              
              <ChatOmniMenu contactId={activeChat.id} />
              
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
                        const properTargetInstance = activeChat.instance_id || connectedInstanceName;
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
            
            {activeChat.messages?.filter(m => m.text || m.mediaUrl).map((msg) => {
               const isMe = msg.sender === 'human' || msg.sender === 'bot';
               
               if (msg.sender === 'system') {
                 return (
                  <div key={msg.id} className="flex justify-center my-4">
                    <span className="bg-[#f0f2f5]/90 dark:bg-[#202c33]/90 text-[#54656f] dark:text-[#8696a0] text-[11px] px-3 py-1 rounded-lg flex items-center gap-2 border border-yellow-500/20 shadow-sm">
                      <Bot size={12} className="text-yellow-600" /> {msg.text}
                    </span>
                  </div>
                 )
               }

               return (
                  <div key={msg.id} className={cn("flex w-full mb-1", isMe ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "px-3 pb-2 pt-1.5 rounded-2xl shadow-sm max-w-[65%] relative group animate-in fade-in slide-in-from-bottom-2 backdrop-blur-md",
                      isMe ? "bg-[#d9fdd3]/90 dark:bg-[#005c4b]/95 text-[#111b21] dark:text-[#e9edef] rounded-tr-sm" 
                           : "bg-white/95 dark:bg-[#202c33]/90 text-[#111b21] dark:text-[#e9edef] rounded-tl-sm border border-black/5 dark:border-white/5 border-l-4 border-l-[#00a884]"
                    )}>
                      {msg.sender === 'bot' && (
                        <div className="flex items-center gap-1 mb-1 text-[10px] text-[#005c4b] dark:text-[#1d9782] opacity-80 font-bold uppercase tracking-wider">
                          <Bot size={10} /> IA ChatBoot
                        </div>
                      )}
                      {msg.sender === 'human' && (
                        <div className="flex items-center gap-1 mb-1 text-[10px] text-[#005c4b] dark:text-[#1d9782] opacity-80 font-bold uppercase tracking-wider">
                           <User size={10} /> Você (Atendente)
                        </div>
                      )}
                      {!isMe && (
                        <div className="flex items-center gap-1.5 mb-1 text-[11px] text-[#00a884] font-bold tracking-tight">
                           <User size={11} className="opacity-80" /> 
                           <span className="truncate">{getContactDisplayName(activeChat.custom_name || activeChat.name, activeChat.push_name, activeChat.phone)}</span>
                        </div>
                      )}

                      {/* Quoted Message Render */}
                      {msg.quoted && (
                         <div className="bg-black/5 dark:bg-black/20 border-l-4 border-[#00a884] rounded-lg p-2 mb-2 w-full flex flex-col gap-0.5 relative overflow-hidden group/quote">
                           <div className="absolute inset-0 bg-white/40 dark:bg-white/5 opacity-0 group-hover/quote:opacity-100 transition-opacity pointer-events-none"></div>
                           <span className="text-[11px] font-bold text-[#00a884] opacity-90 truncate">
                             {msg.quoted.sender && activeChat.phone && msg.quoted.sender.includes(activeChat.phone.replace(/\D/g, '')) 
                               ? getContactDisplayName(activeChat.custom_name || activeChat.name, activeChat.push_name, activeChat.phone)
                               : 'Você'
                             }
                           </span>
                           <span className="text-[13px] text-[#54656f] dark:text-[#aebac1] leading-snug line-clamp-3">
                             {msg.quoted.text}
                           </span>
                         </div>
                      )}
                      
                      {/* Media Render Premium Elements */}
                      {msg.mediaUrl && msg.mediaType === 'image' && (
                         <div className="relative group overflow-hidden rounded-xl border border-black/5 dark:border-white/5 mb-1 bg-black/5 dark:bg-black/20">
                           <img src={msg.mediaUrl} alt="Imagem" className="max-w-full h-auto max-h-[350px] object-cover hover:scale-[1.02] transition-transform duration-300" />
                         </div>
                      )}
                      
                      {msg.mediaUrl && (msg.mediaType === 'video' || msg.mediaUrl.endsWith('.mp4')) && (
                         <div className="relative group overflow-hidden rounded-xl border border-black/5 dark:border-white/5 mb-1 bg-black/5 dark:bg-black/20">
                           <video src={msg.mediaUrl} controls className="max-w-full max-h-[350px] object-contain rounded-xl" />
                         </div>
                      )}
                      
                      {msg.mediaUrl && msg.mediaType === 'audio' && (
                         <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-[#1d272b] dark:to-[#172124] p-1.5 rounded-3xl mb-1 border border-emerald-100/50 dark:border-emerald-900/30">
                            <audio src={msg.mediaUrl} controls controlsList="nodownload" className="max-w-[220px] sm:max-w-[260px] h-10 custom-audio" />
                         </div>
                      )}
                      
                      {msg.mediaType === 'document' && (
                         <div className="flex items-center gap-3 bg-gradient-to-br from-[#f0f2f5] to-white dark:from-[#2a3942] dark:to-[#202c33] p-3 rounded-xl mb-1 border border-gray-200 dark:border-gray-700/50 group">
                            <div className="bg-[#00a884]/10 p-2 text-[#00a884] rounded-lg group-hover:scale-110 transition-transform">
                              <FileText size={20} />
                            </div>
                            <div className="flex flex-col flex-1 overflow-hidden">
                               <span className="text-[14px] font-medium truncate max-w-[180px] text-gray-700 dark:text-gray-200">{msg.text || 'Documento Anexado'}</span>
                               {!msg.mediaUrl ? (
                                  <span className="text-[11px] text-orange-500 dark:text-orange-400 font-medium">Download falhou no servidor</span>
                               ) : (
                                  <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#00a884] hover:underline font-medium">Baixar Documento</a>
                               )}
                            </div>
                         </div>
                      )}
                      
                      {msg.mediaType === 'location' && (
                         <div className="flex flex-col gap-1 bg-gradient-to-br from-[#f0f2f5] to-white dark:from-[#2a3942] dark:to-[#202c33] p-3 rounded-xl mb-1 border border-gray-200 dark:border-gray-700/50 min-w-[200px]">
                            <div className="flex items-center gap-2 text-[#00a884] mb-1">
                               <MapPin size={18} />
                               <span className="font-semibold text-[13px]">Localização</span>
                            </div>
                            <span className="text-[13px] text-gray-700 dark:text-gray-300 leading-snug">{msg.text || 'Localização enviada'}</span>
                            <div className="mt-2 text-xs text-brand-primary font-medium flex items-center justify-center w-full bg-[#00a884]/10 p-2 rounded-lg cursor-pointer hover:bg-[#00a884]/20 transition-colors" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${msg.text?.replace(/[^0-9.,-]/g, '')}`, '_blank')}>
                               Abrir no Maps
                            </div>
                         </div>
                      )}
                      
                      {msg.mediaType === 'contact' && (
                         <div className="flex flex-col bg-gradient-to-br from-[#f0f2f5] to-white dark:from-[#2a3942] dark:to-[#202c33] p-1 rounded-xl mb-1 border border-gray-200 dark:border-gray-700/50 min-w-[220px]">
                            <div className="flex items-center gap-3 p-2">
                               <div className="bg-[#00a884]/10 p-3 rounded-full text-[#00a884] shrink-0">
                                  <User size={22} className="fill-current/20" />
                               </div>
                               <div className="flex flex-col overflow-hidden">
                                  <span className="text-[14px] font-semibold text-gray-800 dark:text-gray-100 truncate">{msg.text || 'Contato'}</span>
                                  <span className="text-[11px] text-gray-500 font-medium tracking-wide uppercase mt-0.5">Cartão VCard</span>
                               </div>
                            </div>
                            <div className="border-t border-gray-100 dark:border-gray-700/50 mt-1 p-2">
                               <button 
                                  onClick={() => alert(`Funcionalidade de enviar mensagem para este contato vCard será implementada no próximo ciclo (Nome: ${msg.text})`)}
                                  className="w-full text-xs text-brand-primary font-medium flex items-center justify-center bg-[#00a884]/10 p-2 rounded-lg cursor-pointer hover:bg-[#00a884]/20 transition-colors">
                                  Abrir / Enviar Mensagem
                               </button>
                            </div>
                         </div>
                      )}
                      
                      {(!msg.mediaType || (msg.mediaType !== 'document' && msg.mediaType !== 'location' && msg.mediaType !== 'contact' && (!msg.mediaUrl || msg.text))) && (
                         <span className="text-[14px] leading-[1.4] block pr-10 whitespace-pre-wrap break-words break-all sm:break-normal word-break shadow-none mt-1">{msg.text}</span>
                      )}
                      
                      <div className="absolute right-2 bottom-1 flex items-center gap-1 text-[9px] text-[#54656f] dark:text-gray-400">
                        {format(msg.timestamp, 'HH:mm')}
                        {isMe && (
                           msg.status === 'READ' ? <CheckCheck size={12} className="text-[#53bdeb] ml-0.5" /> : 
                           msg.status === 'DELIVERY_ACK' || msg.status === 'SERVER_ACK' ? <CheckCheck size={12} className="text-gray-400 ml-0.5" /> :
                           <Check size={12} className="text-gray-400 ml-0.5" />
                        )}
                      </div>
                    </div>
                  </div>
               )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Botão de Rolar para Baixo Premium */}
          {showScrollButton && (
            <button
               onClick={() => scrollToBottom('smooth')}
               className="absolute right-6 bottom-[85px] z-50 w-11 h-11 bg-white/80 dark:bg-[#202c33]/80 backdrop-blur-md rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] shadow-[0_4px_12px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.4)] border border-white/50 dark:border-white/5 hover:bg-white dark:hover:bg-[#202c33] hover:text-[#00a884] dark:hover:text-[#00a884] transition-all hover:scale-105 active:scale-95 animate-in fade-in slide-in-from-bottom-5 duration-300"
               title="Ir para o fim d conversa"
               aria-label="Ir para o fim da conversa"
            >
               <ChevronDown size={24} />
               {activeChat?.unread > 0 && (
                 <span className="absolute top-0 right-0 w-3 h-3 bg-[#00a884] rounded-full border-2 border-white dark:border-[#202c33]"></span>
               )}
            </button>
          )}

          {/* Input Area */}
          <form onSubmit={handleSendHuman} className="h-16 bg-[#f0f2f5] dark:bg-[#202c33] flex items-center px-4 gap-3 z-10 shadow-sm border-t border-[#d1d7db] dark:border-[#222d34]">
            
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
              <textarea 
                ref={textareaRef}
                value={inputText}
                spellCheck={true}
                lang="pt-BR"
                onChange={e => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (inputText.trim()) {
                      handleSendHuman(e as any);
                    }
                  }
                }}
                rows={1}
                placeholder="Responda como humano e a IA será pausada automaticamente..."
                className="bg-transparent border-none outline-none w-full text-sm text-[#111b21] dark:text-[#e9edef] placeholder:text-[#54656f] dark:placeholder:text-[#aebac1] resize-none pb-0.5 overflow-hidden max-h-[120px] scrollbar-thin"
                style={{
                   // A simple inline trick to handle height locally without an extra useEffect
                   height: "auto",
                   minHeight: "20px"
                }}
                onInput={(e) => {
                   const target = e.target as HTMLTextAreaElement;
                   target.style.height = 'auto';
                   target.style.height = `${target.scrollHeight}px`;
                }}
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
                      <button onClick={() => handleGeminiAction('sales')} disabled={!inputText.trim()} className="flex items-center gap-3 w-full p-2.5 text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#111b21] dark:text-[#e9edef] group">
                        <ShoppingBag size={16} className="text-emerald-500 group-hover:scale-110 transition-transform" /> Focar em Vendas
                      </button>
                      <button onClick={() => handleGeminiAction('enchant')} disabled={!inputText.trim()} className="flex items-center gap-3 w-full p-2.5 text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#111b21] dark:text-[#e9edef] group">
                        <HeartHandshake size={16} className="text-pink-500 group-hover:scale-110 transition-transform" /> Encantar Cliente
                      </button>
                      <button onClick={() => handleGeminiAction('support')} disabled={!inputText.trim()} className="flex items-center gap-3 w-full p-2.5 text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#111b21] dark:text-[#e9edef] group">
                        <LifeBuoy size={16} className="text-orange-500 group-hover:scale-110 transition-transform" /> Melhorar Suporte/Dúvida
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
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-[#222d34] border-l border-white/5 relative z-10">
          <Bot size={80} className="text-gray-300 dark:text-[#2a3942] mb-6" />
          <h1 className="text-3xl font-light text-[#54656f] dark:text-[#8696a0]">SaaS Multi-Agente Híbrido</h1>
          <div className="text-sm text-[#54656f] dark:text-[#8696a0] mt-2 flex items-center gap-2"><div className="w-2 h-2 bg-[#00a884] rounded-full animate-pulse"></div> Conectado com banco de dados</div>
        </div>
      )}

    </div>
  );
}
