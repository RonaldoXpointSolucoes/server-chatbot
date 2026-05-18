import React, { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Bot, User, MoreVertical, Edit2, Trash2, Ban, 
  MessageSquareReply, Camera, Video, VideoOff, Mic, 
  FileText, MapPin, Sparkles, Check, CheckCheck, RefreshCw,
  LayoutTemplate, Smartphone, Eye
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { cn, getContactDisplayName } from '../../pages/ChatDashboard';
import { ImageIcon } from 'lucide-react';

// Necessitamos tipagens básicas
interface MessageBubbleProps {
  msg: any;
  index: number;
  totalMessages: number;
  activeChat: any; // Ideally only what we need: phone, name, custom_name, push_name
  activeMsgDropdown: string | null;
  setActiveMsgDropdown: (id: string | null) => void;
  setReplyMessage: (msg: any) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  handleAiReplySuggestion: (msg: any) => void;
  setMessageToForward: (msg: any) => void;
  setEditingMessage: (msg: any) => void;
  setMessageToDelete: (id: string) => void;
  setFullscreenImage: (url: string | null) => void;
  handleTranscribeAudio: (id: string, url: string) => void;
  transcribingIds: Record<string, boolean>;
  handleOpenVCardContact: (vcardWaid: string | undefined, text: string | undefined) => void;
  renderMessageText: (text: string | undefined) => React.ReactNode;
  showDateSeparator: boolean;
  dateSeparatorText: string;
}

export const MessageBubble = memo(({
  msg,
  index,
  totalMessages,
  activeChat,
  activeMsgDropdown,
  setActiveMsgDropdown,
  setReplyMessage,
  textareaRef,
  handleAiReplySuggestion,
  setMessageToForward,
  setEditingMessage,
  setMessageToDelete,
  setFullscreenImage,
  handleTranscribeAudio,
  transcribingIds,
  handleOpenVCardContact,
  renderMessageText,
  showDateSeparator,
  dateSeparatorText
}: MessageBubbleProps) => {
  
  const isMe = msg.sender === 'human' || msg.sender === 'bot' || msg.sender === 'me';
  
  // Usado pra saber se a bolha precisa exibir menu pra cima ou baixo
  const [dropdownDirection, setDropdownDirection] = useState<'up' | 'down'>('down');
  const [dropdownCoords, setDropdownCoords] = useState<{x: number, y: number} | null>(null);
  
  const separatorNode = showDateSeparator ? (
    <div className="flex justify-center my-4 w-full">
       <span className="bg-[#f0f2f5]/90 dark:bg-[#202c33]/90 text-[#54656f] dark:text-[#8696a0] text-[11px] px-3 py-1 rounded-lg border border-black/5 dark:border-white/5 font-medium shadow-sm uppercase tracking-wider">
         {dateSeparatorText}
       </span>
    </div>
  ) : null;
  
  if (msg.sender === 'system') {
    return (
     <div key={msg.id} className="flex flex-col w-full">
       {separatorNode}
       <div className="flex justify-center my-4">
         <span className="bg-[#f0f2f5]/90 dark:bg-[#202c33]/90 text-[#54656f] dark:text-[#8696a0] text-[11px] px-3 py-1 rounded-lg flex items-center gap-2 border border-yellow-500/20 shadow-sm">
           <Bot size={12} className="text-yellow-600" /> {msg.text}
         </span>
       </div>
     </div>
    )
  }

  const isLastMessages = index >= totalMessages - 2;

  return (
    <div id={`msg-${(msg as any).whatsapp_id || msg.id}`} className="flex flex-col w-full message-item-container">
      {separatorNode}
      <div 
        className={`relative flex items-center mb-1 group w-full ${isMe ? 'justify-end' : 'justify-start'} ${
          activeMsgDropdown === msg.id ? "z-[99999] relative" : "z-10 relative"
        }`}
      >
      <div className={cn(
        "pl-3 pr-8 pb-3 pt-1.5 min-w-[120px] min-h-[48px] rounded-2xl shadow-sm max-w-[85%] md:max-w-[65%] relative group animate-in fade-in slide-in-from-bottom-2 backdrop-blur-md",
        isMe ? "bg-[#d9fdd3]/90 dark:bg-[#005c4b]/95 text-[#111b21] dark:text-[#e9edef] rounded-tr-sm" 
             : "bg-white/95 dark:bg-[#202c33]/90 text-[#111b21] dark:text-[#e9edef] rounded-tl-sm border border-black/5 dark:border-white/5 border-l-4 border-l-[#00a884]"
      )}>
         {/* Menu de Três Pontinhos para Responder/Encaminhar */}
         <div 
           className="absolute top-1 right-1 flex items-center justify-center w-7 h-7 cursor-pointer text-[#54656f] dark:text-[#aebac1] hover:text-[#00a884] dark:hover:text-[#00a884] bg-transparent hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-all duration-200 z-10"
           onClick={(e) => {
             e.stopPropagation();
             if (activeMsgDropdown === msg.id) {
                setActiveMsgDropdown(null);
             } else {
                const rect = e.currentTarget.getBoundingClientRect();
                setDropdownCoords({ x: rect.right, y: rect.bottom });
                // Se a bolha estiver muito pra baixo e o menu (aprox 250px) for cortar a tela, abre pra cima
                if (window.innerHeight - rect.bottom < 250) {
                    setDropdownDirection('up');
                } 
                // Se a bolha estiver muito pra cima e o menu for sumir no cabeçalho (aprox 150px de folga pro cabeçalho)
                else if (rect.top < 150) {
                    setDropdownDirection('down');
                }
                // Senão usa uma decisão razoável
                else {
                    setDropdownDirection(isLastMessages ? 'up' : 'down');
                }
                setActiveMsgDropdown(msg.id);
             }
           }}
         >
           <MoreVertical size={16} className="opacity-40 hover:opacity-100" />
           
           {activeMsgDropdown === msg.id && dropdownCoords && createPortal(
              <div 
                className={cn(
                 "fixed w-44 bg-white/95 dark:bg-[#202c33]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl md:rounded-[24px] shadow-[0_10px_40px_rgba(0,0,0,0.5)] py-2 z-[999999] animate-in fade-in zoom-in-95 duration-200",
                 dropdownDirection === 'up' ? "origin-bottom-right" : "origin-top-right"
                )}
                style={{
                  top: dropdownDirection === 'down' ? dropdownCoords.y + 4 : undefined,
                  bottom: dropdownDirection === 'up' ? window.innerHeight - dropdownCoords.y + 24 : undefined,
                  left: dropdownCoords.x - 176
                }}
                onClick={e => e.stopPropagation()}
              >
                <button 
                  onClick={() => {
                    setReplyMessage({ id: msg.id, text: msg.text || 'Mídia enviada', sender: msg.sender });
                    textareaRef.current?.focus();
                    setActiveMsgDropdown(null);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3 transition-colors text-[14px] text-[#3b4a54] dark:text-[#d1d7db]"
                >
                  Responder
                </button>
                <button 
                  onClick={() => {
                    handleAiReplySuggestion(msg);
                    setActiveMsgDropdown(null);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-[#d9fdd3]/50 dark:hover:bg-[#005c4b]/30 flex items-center gap-3 transition-all duration-300 text-[14px] text-[#00a884] font-medium"
                >
                  <Sparkles size={16} className="text-[#00a884] animate-pulse" /> Responder com I.A
                </button>
                <button 
                  onClick={() => {
                    setMessageToForward(msg);
                    setActiveMsgDropdown(null);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3 transition-colors text-[14px] text-[#3b4a54] dark:text-[#d1d7db]"
                >
                  Encaminhar
                </button>
                
                {msg.mediaType === 'audio' && msg.mediaUrl && !msg.transcription && (
                  <button 
                    onClick={() => {
                      handleTranscribeAudio(msg.id, msg.mediaUrl!);
                      setActiveMsgDropdown(null);
                    }}
                    disabled={transcribingIds[msg.id]}
                    className="w-full text-left px-4 py-2 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3 transition-colors text-[14px] text-[#3b4a54] dark:text-[#d1d7db]"
                  >
                    {transcribingIds[msg.id] ? <RefreshCw size={16} className="animate-spin text-indigo-500" /> : <Mic size={16} className="text-indigo-500" />} 
                    {transcribingIds[msg.id] ? 'Transcrevendo...' : 'Transcrever áudio'}
                  </button>
                )}
                
                {isMe && (
                  <>
                    <div className="w-full h-px bg-black/5 dark:bg-white/5 my-1"></div>
                    <button 
                      onClick={() => {
                        setEditingMessage({ id: msg.id, text: (msg.text || '').replace(' *(Editado)*', '') });
                        setActiveMsgDropdown(null);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center gap-3 transition-colors text-[14px] text-blue-600 dark:text-blue-400 font-medium"
                    >
                      <Edit2 size={16} /> Editar
                    </button>
                    <button 
                      onClick={() => {
                        setMessageToDelete(msg.id);
                        setActiveMsgDropdown(null);
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors text-[14px] text-red-600 dark:text-red-400 font-medium"
                    >
                      <Trash2 size={16} /> Apagar
                    </button>
                  </>
                )}
              </div>,
              document.body
           )}
         </div>

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

        {/* Quoted Message Render */}
        {msg.status === 'deleted' && (
           <div className="flex items-center gap-1.5 mb-1.5 bg-red-500/10 dark:bg-red-900/20 px-2 py-1 rounded-md text-red-600 dark:text-red-400 font-medium text-[11px] w-fit italic">
             <Ban size={12} /> Apagada {msg.sender === 'bot' || msg.sender === 'human' ? 'por você' : 'pelo cliente'}
           </div>
        )}
        
        {msg.quoted && (
           <div 
             className="bg-black/5 dark:bg-black/20 border-l-4 border-[#00a884] rounded-lg p-2 mb-2 w-full flex flex-col gap-0.5 relative overflow-hidden group/quote cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
             onClick={(e) => {
               e.stopPropagation();
               const targetId = `msg-${msg.quoted!.id}`;
               let targetElement = document.getElementById(targetId);
               
               if (!targetElement && msg.quoted?.text) {
                 const messageElements = document.querySelectorAll('.message-item-container');
                 targetElement = Array.from(messageElements).find(el => el.textContent?.includes(msg.quoted!.text)) as HTMLElement;
               }

               if (targetElement) {
                 targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                 targetElement.classList.add('bg-[#00a884]/20', 'dark:bg-[#00a884]/20', 'transition-colors', 'duration-500', 'rounded-xl', 'ring-2', 'ring-[#00a884]', 'ring-offset-2', 'dark:ring-offset-[#0b141a]');
                 setTimeout(() => {
                   targetElement!.classList.remove('bg-[#00a884]/20', 'dark:bg-[#00a884]/20', 'ring-2', 'ring-[#00a884]', 'ring-offset-2', 'dark:ring-offset-[#0b141a]');
                 }, 2000);
               } else {
                 alert('Mensagem original não encontrada na tela atual.');
               }
             }}
             title="Clique para ir até a mensagem original"
           >
             <div className="absolute inset-0 bg-white/40 dark:bg-white/5 opacity-0 group-hover/quote:opacity-100 transition-opacity pointer-events-none"></div>
             
             {/* Ícone indicador de clique para ir para mensagem */}
             <div className="absolute top-2 right-2 text-[#00a884] opacity-0 group-hover/quote:opacity-100 transition-opacity">
               <MessageSquareReply size={14} className="scale-x-[-1]" />
             </div>

             <span className="text-[11px] font-bold text-[#00a884] opacity-90 truncate pr-6">
               {msg.quoted.sender && activeChat?.phone && msg.quoted.sender.includes(activeChat.phone.replace(/\D/g, '')) 
                 ? getContactDisplayName(activeChat.custom_name || activeChat.name, activeChat.push_name, activeChat.phone)
                 : 'Você'
               }
             </span>
             <span className="text-[13px] text-[#54656f] dark:text-[#aebac1] leading-snug line-clamp-3 pr-2">
               {msg.quoted.text}
             </span>
           </div>
        )}
        
        {/* Media Render Premium Elements */}
        {msg.mediaUrl && msg.mediaType === 'image' && (
           <div 
             className="relative group overflow-hidden rounded-xl border border-black/5 dark:border-white/5 mb-1 bg-black/5 dark:bg-black/20 cursor-pointer"
             onClick={(e) => { e.stopPropagation(); setFullscreenImage(msg.mediaUrl || null); }}
             onContextMenu={(e) => { e.preventDefault(); setFullscreenImage(msg.mediaUrl || null); }}
           >
             <img src={msg.mediaUrl} alt="Imagem" className="max-w-full h-auto max-h-[350px] object-cover hover:scale-[1.02] transition-transform duration-300 pointer-events-none" />
             <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
               <div className="bg-black/50 text-white p-2 rounded-full backdrop-blur-md">
                 <ImageIcon size={20} />
               </div>
             </div>
           </div>
        )}
        
        {msg.mediaUrl && (msg.mediaType === 'video' || msg.mediaUrl.endsWith('.mp4')) && (
           <div className="relative group overflow-hidden rounded-xl border border-black/5 dark:border-white/5 mb-1 bg-black/5 dark:bg-black/20">
             <video src={msg.mediaUrl} controls className="max-w-full max-h-[350px] object-contain rounded-xl" />
           </div>
        )}
        
        {!msg.mediaUrl && msg.mediaType === 'video' && (
           <div className="flex items-center gap-3 bg-gradient-to-br from-[#f0f2f5] to-white dark:from-[#2a3942] dark:to-[#202c33] p-3 rounded-xl mb-1 border border-gray-200 dark:border-gray-700/50 group">
              <div className="bg-red-500/10 p-2 text-red-500 rounded-lg group-hover:scale-110 transition-transform">
                <VideoOff size={20} />
              </div>
              <div className="flex flex-col flex-1 overflow-hidden">
                 <span className="text-[14px] font-medium text-gray-700 dark:text-gray-200">Vídeo Recebido</span>
                 <span className="text-[11px] text-red-500 font-medium">Download indisponível (limite de 50MB excedido)</span>
              </div>
           </div>
        )}
        
        {msg.mediaUrl && msg.mediaType === 'audio' && (
           <div className="flex flex-col gap-1 mb-1">
             <div className={`flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-[#1d272b] dark:to-[#172124] p-1.5 rounded-3xl border border-emerald-100/50 dark:border-emerald-900/30 ${msg.transcription ? 'rounded-b-md' : ''}`}>
                <audio src={msg.mediaUrl} controls controlsList="nodownload" className="max-w-[220px] sm:max-w-[260px] h-10 custom-audio flex-1" />
                {!msg.transcription && (
                  <button 
                    onClick={() => handleTranscribeAudio(msg.id, msg.mediaUrl!)}
                    disabled={transcribingIds[msg.id]}
                    className="mr-2 p-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all border border-indigo-100 dark:border-indigo-800 disabled:opacity-50 group/btn"
                    title="Transcrever Áudio com IA"
                  >
                    {transcribingIds[msg.id] ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} className="group-hover/btn:scale-110 transition-transform" />}
                  </button>
                )}
             </div>
             {/* Transcription Block */}
             {msg.transcription && (
               <div className="flex animate-in fade-in slide-in-from-top-1 bg-white/60 dark:bg-black/20 backdrop-blur-md rounded-xl rounded-t-md p-3 text-sm text-gray-800 dark:text-gray-200 border border-black/5 dark:border-white/5 relative items-start gap-3 shadow-sm">
                 <Sparkles size={16} className="text-indigo-500 mt-0.5 shrink-0" />
                 <div className="flex-1 whitespace-pre-wrap leading-relaxed italic">
                   {msg.transcription}
                 </div>
               </div>
             )}
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
                    onClick={() => handleOpenVCardContact(msg.vcardWaid, msg.text)}
                    className="w-full text-xs text-brand-primary font-medium flex items-center justify-center bg-[#00a884]/10 p-2 rounded-lg cursor-pointer hover:bg-[#00a884]/20 transition-colors">
                    Abrir / Enviar Mensagem
                 </button>
              </div>
           </div>
        )}
        
        {(!msg.mediaType || (msg.mediaType !== 'document' && msg.mediaType !== 'location' && msg.mediaType !== 'contact' && (!msg.mediaUrl || msg.text))) && (
           (() => {
             const t = msg.text || '';
             const isUnsupported = t.includes('Mensagem não suportada');
             const isInteractive = t.includes('Mensagem Interativa') || t.includes('Mensagem Estruturada');
             const isSpecial = t.includes('Álbum de Fotos') || t.includes('Mensagem Editada');
             
             if (isUnsupported || isInteractive || isSpecial) {
               return (
                 <div className="flex flex-col gap-2 bg-gradient-to-br from-indigo-50/50 to-white dark:from-[#2a3942] dark:to-[#202c33] p-3 rounded-xl border border-indigo-100 dark:border-gray-700/50 mt-1 shadow-sm group">
                   <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                     <div className="bg-indigo-100 dark:bg-indigo-900/30 p-1.5 rounded-lg group-hover:scale-110 transition-transform">
                       {isInteractive ? <LayoutTemplate size={18} /> : <Smartphone size={18} />}
                     </div>
                     <span className="font-semibold text-[13px]">
                       {isInteractive ? 'Conteúdo Interativo' : isUnsupported ? 'Conteúdo não suportado' : t.replace(/^(?:📸|✏️)\s*/, '')}
                     </span>
                   </div>
                   <span className="text-[12px] text-gray-600 dark:text-gray-300 leading-snug">
                     {isInteractive ? 'Este tipo de mensagem (catálogo, botões ou listas) deve ser visualizado no aplicativo WhatsApp oficial.' : 'Esta mensagem utiliza um formato especial. Recomendamos abrir o WhatsApp no seu celular para visualizar.'}
                   </span>
                 </div>
               );
             }
             
             return (
               <span className="text-[14px] leading-[1.4] block whitespace-pre-wrap break-words overflow-hidden shadow-none mt-1">
                  {renderMessageText(t.replace(/^(?:磁|汐)\s*Vídeo\s*\n?/i, ''))}
                  {!msg.buttons && <span className="inline-block w-[110px] h-3 ml-2 shrink-0"></span>}
               </span>
             );
           })()
        )}

        {/* Render Interactive Buttons */}
        {msg.buttons && msg.buttons.length > 0 && (
           <div className="flex flex-col gap-1.5 mt-2 w-full pt-1 pb-4">
              {msg.buttons.map((btn: any) => (
                 <button 
                    key={btn.id}
                    className="w-full relative px-3 py-2 bg-gradient-to-r from-[#00a884]/5 to-[#00a884]/10 hover:from-[#00a884]/10 hover:to-[#00a884]/20 border border-[#00a884]/30 rounded-xl text-[#00a884] font-medium text-sm text-center shadow-sm hover:shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (btn.url) window.open(btn.url, '_blank');
                        else alert(`O cliente visualiza e clica neste botão: "${btn.text}" no celular dele.`);
                    }}
                    title="Este botão foi exibido para o cliente"
                 >
                    {btn.url ? <span className="p-0.5 bg-[#00a884]/20 rounded-md"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></span> : <span className="p-0.5 bg-[#00a884]/20 rounded-md"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg></span>}
                    <span className="truncate">{btn.text}</span>
                 </button>
              ))}
           </div>
        )}
        
        <div className="absolute right-2 bottom-1 flex items-center gap-1 text-[9px] text-[#54656f] dark:text-gray-400 bg-white/40 dark:bg-[#202c33]/40 px-1.5 py-0.5 rounded-full backdrop-blur-sm">
          {isToday(new Date(msg.timestamp)) ? format(new Date(msg.timestamp), "HH:mm'h'") : isYesterday(new Date(msg.timestamp)) ? `Ontem ${format(new Date(msg.timestamp), "HH:mm'h'")}` : format(new Date(msg.timestamp), "dd/MM HH:mm'h'")}
          {isMe && (
             msg.status === 'READ' || msg.status === 'read' ? <CheckCheck size={12} className="text-[#53bdeb] ml-0.5" /> : 
             msg.status === 'DELIVERY_ACK' || msg.status === 'SERVER_ACK' || msg.status === 'delivered' ? <CheckCheck size={12} className="text-gray-400 ml-0.5" /> :
             <Check size={12} className="text-gray-400 ml-0.5" />
          )}
        </div>
      </div>
      
      {/* Rastreio de Leitura (Read Receipt Interno) */}
      {!isMe && msg.payload?.read_receipt && (
         <div className="flex items-center gap-1.5 mt-0.5 ml-2 animate-in fade-in slide-in-from-top-1 opacity-80">
             <Eye size={12} className="text-[#00a884]" />
             <span className="text-[10px] text-[#54656f] dark:text-[#aebac1] font-medium tracking-wide">
               Lido por {msg.payload.read_receipt.read_by_name} às {format(new Date(msg.payload.read_receipt.read_at), "HH:mm")}
             </span>
         </div>
      )}
    </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Apenas re-renderiza se estas propriedades fundamentais mudarem.
  return (
    prevProps.msg.id === nextProps.msg.id &&
    prevProps.msg.status === nextProps.msg.status &&
    prevProps.msg.text === nextProps.msg.text &&
    prevProps.msg.transcription === nextProps.msg.transcription &&
    prevProps.msg.mediaUrl === nextProps.msg.mediaUrl &&
    prevProps.msg.payload?.read_receipt?.read_at === nextProps.msg.payload?.read_receipt?.read_at &&
    prevProps.activeMsgDropdown === nextProps.activeMsgDropdown &&
    prevProps.transcribingIds[prevProps.msg.id] === nextProps.transcribingIds[nextProps.msg.id] &&
    prevProps.showDateSeparator === nextProps.showDateSeparator
  );
});

MessageBubble.displayName = 'MessageBubble';
