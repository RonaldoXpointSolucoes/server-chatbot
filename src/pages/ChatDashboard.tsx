import React, { useState, useEffect, useRef } from 'react';
import { Bot, Settings, Users, Search, MoreVertical, Send, Check, CheckCheck, Smartphone, Power, Building2, Paperclip, Mic, FileText, Camera, Video, Image as ImageIcon, Pin, MessageSquarePlus, Star, Plus, Filter, Tag, Terminal } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import EvolutionModal from '../components/EvolutionModal';
import { DeleteModal, RenameModal, NewChatModal } from '../components/ChatModals';
import { SettingsModal } from '../components/SettingsModal';
import ThemeToggle from '../components/ThemeToggle';

import { format, isToday, isYesterday } from 'date-fns';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export default function ChatDashboard() {
  const tenantName = sessionStorage.getItem('current_tenant_name');

  const {  
    contacts, 
    activeChatId, 
    evolutionConnected, 
    connectedInstanceName,
    setActiveChat, 
    sendHumanMessage, 
    setBotStatus,
    fetchInitialData,
    fetchTenantConfig,
    subscribeToNewMessages,
    loadHistoricalMessages,
    modalReason,
    setModalReason,
    tenantInfo,
    updateContactName,
    deleteContact,
    isSyncingHistory,
    markAllAsRead,
    togglePinContact,
    toggleFavorite
  } = useChatStore();

  // Execucao Incial Reativa
  useEffect(() => {
    fetchTenantConfig().then(() => {
       fetchInitialData();
    });
    subscribeToNewMessages();
  }, []);
  
  const [showEvolutionQR, setShowEvolutionQR] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isModalOpen = showEvolutionQR || !!modalReason || isSettingsOpen;
  const [inputText, setInputText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Estados dos novos menus fluídos
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [contactToEdit, setContactToEdit] = useState<{id: string; name: string} | null>(null);
  const [contactToDelete, setContactToDelete] = useState<{id: string; name: string} | null>(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  
  // Estados para Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'unread' | 'favorite' | 'labels'>('all');
  
  const activeChat = contacts.find(c => c.id === activeChatId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);


  useEffect(() => {
    (async () => {
      await fetchTenantConfig();
      await fetchInitialData();
    })();
    subscribeToNewMessages();
  }, []);

  // Carrega mensagens do Evolution ao clicar num chat novo
  useEffect(() => {
     if (activeChatId && connectedInstanceName && evolutionConnected) {
       loadHistoricalMessages(activeChatId, connectedInstanceName);
     }
  }, [activeChatId, connectedInstanceName, evolutionConnected, loadHistoricalMessages]);

  const handleSendHuman = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChatId || !connectedInstanceName) return;
    
    // ATENÇÃO: Numa versão final multi-tenant o instanceName deve vir do Login.
    sendHumanMessage(activeChatId, inputText, connectedInstanceName as string);
    setInputText('');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeChatId || !connectedInstanceName) return;
    
    let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('video/')) mediaType = 'video';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';

    await useChatStore.getState().uploadAndSendMedia(activeChatId, file, mediaType, connectedInstanceName);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMicClick = async () => {
    if (!activeChatId || !connectedInstanceName) return;

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
            await useChatStore.getState().uploadAndSendMedia(activeChatId, file, 'audio', connectedInstanceName, true);
         };

         mediaRecorder.start();
         setIsRecording(true);
       } catch (e) {
         alert("Permissão de microfone negada ou não suportada no seu navegador.");
       }
    }
  };

  return (
    <div className="flex h-[100dvh] w-full min-w-0 bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden font-sans relative">
      
      {isModalOpen && <EvolutionModal onClose={() => {
          setShowEvolutionQR(false);
          setModalReason(null);
      }} />}

      {/* Nossos Novos Modais Premium */}
      <RenameModal 
        isOpen={!!contactToEdit} 
        onClose={() => setContactToEdit(null)} 
        currentName={contactToEdit?.name || ''} 
        onSave={(newName) => {
          if(contactToEdit) updateContactName(contactToEdit.id, newName);
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

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

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

      {/* Left Sidebar */}
      <div className={cn(
        "w-full sm:w-[30%] sm:min-w-[320px] sm:max-w-[400px] border-r border-[#d1d7db] dark:border-[#222d34] flex flex-col bg-white dark:bg-[#111b21] transition-all",
        activeChatId ? "hidden sm:flex" : "flex"
      )}
        onClick={() => setActiveDropdown(null)} // fecha qq dropdown ao clicar fora
      >
        
        {/* Header Premium da Sidebar */}
        <div className="h-20 bg-white/50 dark:bg-[#202c33]/80 backdrop-blur-xl flex flex-col justify-center px-4 py-2 border-b border-[#d1d7db] dark:border-[#222d34] flex-shrink-0 z-10 shadow-sm relative">
          <span className="absolute top-1 left-4 text-[10px] font-mono text-[#00a884] opacity-80 whitespace-nowrap">v1.0.26 | Deploy: 07/04/2026 14:30</span>
          
          <div className="flex items-center justify-between w-full mt-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#00a884] to-teal-400 flex items-center justify-center text-white font-bold shadow-md ring-2 ring-white dark:ring-[#202c33]">
              RA
            </div>
            
            <div className="flex gap-3 text-[#54656f] dark:text-[#aebac1] items-center">
              <button onClick={() => setShowEvolutionQR(true)} className="group relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all" title={tenantInfo?.evolution_api_instance ? "Conectado" : "Conectar WhatsApp"}>
                <Smartphone size={20} className={cn("cursor-pointer transition-colors", evolutionConnected ? "text-[#00a884]" : "text-red-500 hover:text-red-600")} />
                {!evolutionConnected && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>}
              </button>
              
              <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-[#00a884]" onClick={() => setIsNewChatOpen(true)}>
                <MessageSquarePlus size={20} />
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
                    <button onClick={() => setIsSettingsOpen(true)} className="w-full text-left px-5 py-3 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3">
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
             <button onClick={() => setShowEvolutionQR(true)} className="mt-1 text-xs bg-orange-100 dark:bg-orange-900/40 hover:bg-orange-200 dark:hover:bg-orange-800/40 text-orange-700 dark:text-orange-300 py-1.5 px-3 rounded-md font-medium transition-colors w-fit">
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
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
             <button onClick={() => setFilterType('all')} className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap", filterType === 'all' ? "bg-[#00a884]/10 text-[#00a884] ring-1 ring-[#00a884]/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
               Tudo
             </button>
             <button onClick={() => setFilterType('unread')} className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap", filterType === 'unread' ? "bg-[#00a884]/10 text-[#00a884] ring-1 ring-[#00a884]/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
               Não Lidas
             </button>
             <button onClick={() => setFilterType('favorite')} className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1", filterType === 'favorite' ? "bg-yellow-500/10 text-yellow-600 ring-1 ring-yellow-500/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
               <Star size={14} className={filterType === 'favorite' ? "fill-yellow-600" : ""} /> Favoritas
             </button>
             <button onClick={() => setFilterType('labels')} className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1", filterType === 'labels' ? "bg-blue-500/10 text-blue-600 ring-1 ring-blue-500/30" : "bg-[#f0f2f5] dark:bg-[#202c33] text-[#54656f] dark:text-[#aebac1] hover:bg-gray-200 dark:hover:bg-gray-700")}>
               <Tag size={14} /> Etiquetas
             </button>
          </div>
        </div>

        {/* Chat List Realtime */}
        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 && (
             <p className="text-xs text-center p-6 text-gray-400">Nenhuma conversa encontrada ou aguardando conexão web-socket...</p>
          )}

          {contacts.filter(c => {
             // Busca em texto
             if (searchTerm && !c.name?.toLowerCase().includes(searchTerm.toLowerCase()) && !c.whatsapp_jid?.includes(searchTerm)) {
               return false;
             }
             // Filtros de Pills
             if (filterType === 'unread' && c.unread <= 0) return false;
             if (filterType === 'favorite' && !c.is_favorite) return false;
             if (filterType === 'labels' && !(c.conv_labels && c.conv_labels.length > 0)) return false;
             return true;
          }).sort((a,b) => {
             if (a.is_pinned && !b.is_pinned) return -1;
             if (!a.is_pinned && b.is_pinned) return 1;
             return b.lastMsgTimestamp - a.lastMsgTimestamp;
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
                  if (connectedInstanceName) {
                    useChatStore.getState().loadHistoricalMessages(contact.id, connectedInstanceName);
                  }
                }}
                className={cn(
                  "group flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-[#f2f2f2] dark:border-[#222d34] overflow-visible",
                  activeChatId === contact.id ? "bg-[#f0f2f5] dark:bg-[#2a3942]" : "hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]"
                )}
              >
                <img src={contact.avatar} alt="Avatar" className="w-12 h-12 rounded-full object-cover shadow-sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-medium text-[#111b21] dark:text-[#e9edef] truncate">{contact.name || contact.phone}</span>
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
                              onClick={(e) => { e.stopPropagation(); setContactToEdit({id: contact.id, name: contact.name}); setActiveDropdown(null); }}
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
        <div className={cn("flex-1 flex flex-col relative w-full h-full max-w-[100vw] overflow-hidden min-w-0 bg-[#efeae2] dark:bg-[#0b141a]", !activeChatId && "hidden sm:flex")} style={{
           backgroundImage: 'url("https://w7.pngwing.com/pngs/946/407/png-transparent-whatsapp-background-theme-pattern-design.png")',
           backgroundSize: 'cover',
           backgroundBlendMode: 'overlay',
           opacity: 0.95
        }}>
          
          {/* Chat Header */}
          <div className="h-16 bg-[#f0f2f5] dark:bg-[#202c33] flex items-center justify-between px-4 z-10 shadow-sm border-l border-white/5">
            <div className="flex items-center gap-3">
              <img src={activeChat.avatar} alt="Avatar" className="w-10 h-10 rounded-full object-cover" />
              <div>
                <h2 className="font-medium text-[#111b21] dark:text-[#e9edef] leading-tight">{activeChat.name || activeChat.phone}</h2>
                <div className="flex items-center gap-1 text-xs mt-0.5">
                  {activeChat.bot_status === 'paused' ? (
                    <span className="flex items-center gap-1 text-yellow-600 bg-yellow-500/10 px-1.5 py-0.5 rounded-sm"><Bot size={10} /> Humano Assumido</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[#00a884] bg-[#00a884]/10 px-1.5 py-0.5 rounded-sm"><Bot size={10} /> IA Ativa e Monitorando</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right Header Area */}
            <div className="flex items-center gap-4">
              <div className="text-[11px] uppercase tracking-wider text-[#54656f] dark:text-[#8696a0] font-bold flex items-center gap-1.5 pointer-events-none opacity-80 mix-blend-luminosity">
                <Building2 size={13} className="text-[#00a884]" /> EMPRESA: {tenantName}
              </div>
              
              {/* Controle da IA */}
              {activeChat.bot_status === 'paused' && (
                <button 
                  onClick={() => setBotStatus(activeChat.id, 'active')}
                  className="flex items-center gap-2 text-xs font-bold text-[#00a884] bg-[#00a884]/10 hover:bg-[#00a884]/20 px-3 py-1.5 rounded-full transition-colors border border-[#00a884]/30"
                >
                  <Power size={13} /> Devolver para IA
                </button>
              )}
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 z-10 flex flex-col gap-2">
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
                      "px-3 pb-2 pt-1.5 rounded-xl shadow-sm max-w-[65%] relative group animate-in fade-in slide-in-from-bottom-2",
                      isMe ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-none" 
                           : "bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-none"
                    )}>
                      {msg.sender === 'bot' && (
                        <div className="flex items-center gap-1 mb-1 text-[10px] text-[#005c4b] dark:text-[#1d9782] opacity-80 font-bold uppercase tracking-wider">
                          <Bot size={10} /> IA ChatBoot
                        </div>
                      )}
                      {msg.sender === 'human' && (
                        <div className="flex items-center gap-1 mb-1 text-[10px] text-[#00a884]/70 font-bold uppercase tracking-wider">
                           👤 Atendente Real
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
                      
                      {msg.mediaUrl && msg.mediaType === 'document' && (
                         <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-gradient-to-br from-[#f0f2f5] to-white dark:from-[#2a3942] dark:to-[#202c33] p-3 rounded-xl mb-1 hover:shadow-md transition-all duration-300 border border-gray-200 dark:border-gray-700/50 group">
                            <div className="bg-[#00a884]/10 p-2 text-[#00a884] rounded-lg group-hover:scale-110 transition-transform">
                              <FileText size={20} />
                            </div>
                            <span className="text-[14px] font-medium truncate max-w-[180px] text-gray-700 dark:text-gray-200">{msg.text || 'Documento Anexado'}</span>
                         </a>
                      )}
                      
                      {(!msg.mediaUrl || (msg.text && msg.mediaType !== 'document')) && (
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

            <div className="flex flex-1 items-center bg-white dark:bg-[#2a3942] rounded-xl px-4 py-2 border border-transparent focus-within:border-[#00a884]/50 transition-colors shadow-sm">
              <input 
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder="Responda como humano e a IA será pausada automaticamente..."
                className="bg-transparent border-none outline-none w-full text-sm text-[#111b21] dark:text-[#e9edef] placeholder:text-[#54656f] dark:placeholder:text-[#aebac1]"
              />
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
