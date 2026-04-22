import { create } from 'zustand';
import { supabase, ContactRow } from '../services/supabase';

export type MessageType = {
  id: string;
  whatsapp_id?: string;
  text: string;
  sender: 'client' | 'bot' | 'human' | 'system';
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  status?: string; // PENDING, SENT, DELIVERY_ACK, READ
  timestamp: Date;
  quoted?: {
      id: string;
      sender: string;
      text: string;
  };
  buttons?: Array<{ id: string; text: string; url?: string; type: string }>; // Novo campo!
  transcription?: string; // Transcrição de áudio via Gemini
  isIgnored?: boolean; // Flag para mensagens ignoradas por automações
  isIgnoredSilent?: boolean; // Flag para não atualizar posição no chat
};


export type ContactType = ContactRow & {
  avatar: string;
  messages: MessageType[];
  unread: number;
  lastMsgTimestamp: number; // novo campo para ordernar realista
  is_pinned?: boolean;
  is_favorite?: boolean;
  conv_status?: string;
  snoozed_until?: string | null;
  priority?: string | null;
  assigned_to?: string | null;
  conv_labels?: any[];
  instance_id?: string | null;
  is_blocked?: boolean;
};

export interface AgentType {
  id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  full_name?: string | null;
  signature?: string | null;
  email?: string | null;
}

export interface TenantInfo {
  id: string;
  name: string;
  evolution_api_instance: string | null;
}

interface ChatState {
  contacts: ContactType[];
  activeChatId: string | null;
  evolutionConnected: boolean;
  connectedInstanceName: string | null;
  tenantInfo: TenantInfo | null;
  agents: AgentType[];
  modalReason: string | null;
  isSubscribed: boolean;
  isSyncingHistory: Record<string, boolean>;
  pictureFetchLocks: Record<string, number>;
  activeChannelFilter: string | null;
  activeChannelName: string | null; // Adicionado para suportar old e nova engines comparations
  isQRModalOpen: boolean;
  qrModalTargetInstance: string | null;
  automations: any[];
  tenantLabels: any[];
  
  openQRModal: (instanceId?: string | null) => void;
  closeQRModal: () => void;
  
  setActiveChannelFilter: (channelId: string | null, channelName?: string) => void;
  setEvolutionConnection: (status: boolean, instanceName?: string | null) => void;
  setActiveChat: (id: string | null) => void;
  setBotStatus: (contactId: string, status: 'active' | 'paused') => Promise<void>;
  
  // Real DB actions
  fetchTenantConfig: () => Promise<void>;
  setModalReason: (reason: string | null) => void;
  updateTenantInstance: (newInstance: string) => Promise<void>;
  fetchInitialData: () => Promise<void>;
  subscribeToNewMessages: () => void;
  // Historical Sync
  syncEvolutionContacts: (instanceName: string) => Promise<void>;
  loadHistoricalMessages: (contactId: string, instanceName: string, forceSync?: boolean) => Promise<void>;
  
  // Local state updaters
  addMessageLocally: (contactId: string, msg: MessageType) => void;
  upsertContactLocally: (contact: ContactRow) => void;
  sendHumanMessage: (contactId: string, text: string, instanceName: string) => Promise<void>;
  forwardMessage: (contactId: string, message: MessageType, instanceName: string) => Promise<void>;
  uploadAndSendMedia: (contactId: string, file: File, mediaType: 'image' | 'video' | 'audio' | 'document', instanceName: string, isPtt?: boolean, caption?: string) => Promise<void>;
  updateContactCRM: (contactId: string, payload: Partial<ContactRow>) => Promise<void>;
  deleteContact: (contactId: string) => Promise<void>;
  togglePinContact: (contactId: string) => Promise<void>;
  toggleFavorite: (contactId: string) => Promise<void>;
  toggleBlockContact: (contactId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  fetchContactPicture: (contactId: string, jid: string, instanceName: string) => Promise<void>;
  
  // Omnichannel Actions
  fetchTenantAgents: () => Promise<void>;
  createAgent: (payload: { full_name: string; email: string; role: string; password?: string; allowed_instances?: string[]; allowed_companies?: string[] }) => Promise<void>;
  updateAgent: (id: string, payload: { full_name: string; email: string; role: string; password?: string; allowed_instances?: string[]; allowed_companies?: string[] }) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  updateConversationField: (contactId: string, payload: Record<string, any>) => Promise<void>;
  updateAgentProfile: (fullName: string, signature: string) => Promise<void>;
  
  // Gemini Actions
  // Automations
  automations: any[];
  fetchAutomations: () => Promise<void>;
  
  // Labels
  fetchTenantLabels: () => Promise<void>;
  assignLabelToConversation: (contactId: string, labelId: string) => Promise<void>;
  removeLabelFromConversation: (contactId: string, labelId: string) => Promise<void>;
}

function parseAdvancedMsgMetadata(m: any) {
  let derivedType = m.message_type;
  let derivedText = m.text_content;
  let derivedQuoted: any = undefined;

  try {
      const payloadMessage = m.raw_payload?.message;
      if (payloadMessage) {
          let contextInfo = null;
          if (payloadMessage.extendedTextMessage?.contextInfo) {
              contextInfo = payloadMessage.extendedTextMessage.contextInfo;
          } else if (payloadMessage.imageMessage?.contextInfo) {
              contextInfo = payloadMessage.imageMessage.contextInfo;
          } else if (payloadMessage.videoMessage?.contextInfo) {
              contextInfo = payloadMessage.videoMessage.contextInfo;
          } else if (payloadMessage.documentMessage?.contextInfo) {
              contextInfo = payloadMessage.documentMessage.contextInfo;
          } else if (payloadMessage.audioMessage?.contextInfo) {
              contextInfo = payloadMessage.audioMessage.contextInfo;
          } else if (payloadMessage.contactMessage?.contextInfo) {
              contextInfo = payloadMessage.contactMessage.contextInfo;
          }

          if (contextInfo && contextInfo.quotedMessage) {
              const qm = contextInfo.quotedMessage;
              let qText = '📎 Mídia';
              if (qm.conversation) qText = qm.conversation;
              else if (qm.extendedTextMessage?.text) qText = qm.extendedTextMessage.text;
              else if (qm.imageMessage) qText = qm.imageMessage.caption || '📸 Imagem';
              else if (qm.videoMessage) qText = qm.videoMessage.caption || '🎥 Vídeo';
              else if (qm.audioMessage) qText = '🎵 Áudio';
              else if (qm.documentMessage) qText = '📁 Documento';

              derivedQuoted = {
                  id: contextInfo.stanzaId,
                  sender: contextInfo.participant,
                  text: qText
              };
          }

          if (payloadMessage.locationMessage || payloadMessage.liveLocationMessage) {
              derivedType = 'location';
              const loc = payloadMessage.locationMessage || payloadMessage.liveLocationMessage;
              derivedText = `${loc.degreesLatitude},${loc.degreesLongitude}`;
          } else if (payloadMessage.contactMessage) {
              derivedType = 'contact';
              derivedText = payloadMessage.contactMessage.displayName || payloadMessage.contactMessage.vcard?.match(/FN:(.+)/)?.[1] || 'Contato';
          } else if (payloadMessage.contactsArrayMessage) {
              derivedType = 'contact';
              derivedText = payloadMessage.contactsArrayMessage.displayName || 'Vários Contatos';
          }
      }
  } catch(e) {}

  let buttons: any[] = [];
  
  try {
      const payloadMessage = m.raw_payload?.message;
      if (payloadMessage) {
          let targetMsg = payloadMessage;
          if (targetMsg?.viewOnceMessageV2?.message) targetMsg = targetMsg.viewOnceMessageV2.message;
          else if (targetMsg?.viewOnceMessage?.message) targetMsg = targetMsg.viewOnceMessage.message;
          else if (targetMsg?.documentWithCaptionMessage?.message) targetMsg = targetMsg.documentWithCaptionMessage.message;

          if (targetMsg?.templateMessage?.interactiveMessageTemplate) {
              const imt = targetMsg.templateMessage.interactiveMessageTemplate;
              let full = [];
              if (imt.header?.title) full.push(`*${imt.header.title.trim()}*`);
              if (imt.body?.text) full.push(imt.body.text.trim());
              if (imt.footer?.text) full.push(`_${imt.footer.text.trim()}_`);
              if (full.length > 0) derivedText = full.join('\n\n');
              derivedType = 'interactive';
              
              if (imt.nativeFlowMessage?.buttons) {
                 buttons = imt.nativeFlowMessage.buttons.map((b: any, i: number) => {
                     let dt = b.name;
                     let url;
                     try { if (b.buttonParamsJson) { const pj = JSON.parse(b.buttonParamsJson); dt = pj.display_text || dt; url = pj.url; } } catch(e){}
                     return { id: `btn_${i}`, text: dt, url, type: 'action' };
                 });
              }
          } else if (targetMsg?.interactiveMessage) {
              const im = targetMsg.interactiveMessage;
              let full = [];
              if (im.header?.title) full.push(`*${im.header.title.trim()}*`);
              else if (im.header?.subtitle) full.push(`*${im.header.subtitle.trim()}*`);
              if (im.body?.text) full.push(im.body.text.trim());
              if (im.footer?.text) full.push(`_${im.footer.text.trim()}_`);
              if (full.length > 0) derivedText = full.join('\n\n');
              derivedType = 'interactive';
              
              if (im.nativeFlowMessage?.buttons) {
                 buttons = im.nativeFlowMessage.buttons.map((b: any, i: number) => {
                     let dt = b.name;
                     let url;
                     try { if (b.buttonParamsJson) { const pj = JSON.parse(b.buttonParamsJson); dt = pj.display_text || dt; url = pj.url; } } catch(e){}
                     return { id: `btn_${i}`, text: dt, url, type: 'action' };
                 });
              }
          } else if (targetMsg?.templateMessage?.hydratedTemplate) {
             const ht = targetMsg.templateMessage.hydratedTemplate;
             let full = [];
             if (ht.hydratedTitleText) full.push(`*${ht.hydratedTitleText.trim()}*`);
             if (ht.hydratedContentText) full.push(ht.hydratedContentText.trim());
             if (ht.hydratedFooterText) full.push(`_${ht.hydratedFooterText.trim()}_`);
             if (full.length > 0) derivedText = full.join('\n\n');
             derivedType = 'template';
             
             if (ht.hydratedButtons) {
                 buttons = ht.hydratedButtons.map((b: any, i: number) => {
                     const btn = b.quickReplyButton || b.urlButton || b.callButton;
                     return { id: `btn_${i}`, text: btn?.displayText || btn?.text || 'Botão', url: btn?.url, type: 'action' };
                 });
             }
          } else if (targetMsg?.buttonsMessage) {
             const bm = targetMsg.buttonsMessage;
             let full = [];
             if (bm.contentText) full.push(bm.contentText.trim());
             if (bm.footerText) full.push(`_${bm.footerText.trim()}_`);
             if (full.length > 0) derivedText = full.join('\n\n');
             derivedType = 'buttons';
             
             if (bm.buttons) {
                 buttons = bm.buttons.map((b: any, i: number) => ({
                     id: b.buttonId || `btn_${i}`, text: b.buttonText?.displayText || 'Botão', type: 'action'
                 }));
             }
          } else if (targetMsg?.listMessage) {
             const lm = targetMsg.listMessage;
             let full = [];
             if (lm.title) full.push(`*${lm.title.trim()}*`);
             if (lm.description) full.push(lm.description.trim());
             if (lm.footerText) full.push(`_${lm.footerText.trim()}_`);
             if (full.length > 0) derivedText = full.join('\n\n');
             derivedType = 'list';
             
             buttons = [{ id: 'list_btn', text: lm.buttonText || 'Ver Opções', type: 'action' }];
          }
      }
  } catch(e){}

  return { mediaType: derivedType, text: derivedText, quoted: derivedQuoted, buttons: buttons.length > 0 ? buttons : undefined };
}

function sanitizeContactName(targetName: string | null | undefined, fallbackPhone: string | null | undefined, tenantName: string | null | undefined): string | null {
  if (!targetName) return fallbackPhone || null;
  const lname = targetName.toLowerCase();
  const tname = tenantName ? tenantName.toLowerCase().trim() : '';
  if ((tname && lname === tname) || (tname && lname.includes(tname)) || lname.includes('x point') || lname.includes('x-point') || lname === 'empresa' || lname.includes('soluções')) {
      return fallbackPhone || targetName; 
  }
  return targetName;
}

export const useChatStore = create<ChatState>((set, get) => ({
  contacts: [],
  activeChatId: null,
  evolutionConnected: false,
  connectedInstanceName: null,
  tenantInfo: null,
  agents: [],
  modalReason: null,
  isSubscribed: false,
  isSyncingHistory: {},
  pictureFetchLocks: {},
  appVersion: null,
  activeChannelFilter: null,
  isQRModalOpen: false,
  qrModalTargetInstance: null,
  automations: [],
  tenantLabels: [],
  
  fetchAutomations: async () => {
    try {
      const state = get();
      if (!state.tenantInfo) return;
      
      const { data, error } = await supabase
        .from('tenant_automations')
        .select('*')
        .eq('tenant_id', state.tenantInfo.id)
        .eq('is_active', true);
        
      if (error) {
        console.error('Error fetching automations:', error);
        return;
      }
      
      set({ automations: data || [] });
    } catch (err) {
      console.error('Failed to fetch automations:', err);
    }
  },

  requestTranscription: async (messageId: string, mediaUrl: string) => {
    try {
      const { geminiService } = await import('../services/geminiService');
      const text = await geminiService.transcribeAudio(mediaUrl);

      // Save to Supabase
      const { error } = await supabase.from('messages')
        .update({ transcription: text })
        .eq('id', messageId);

      if (error) {
        console.error('Erro ao salvar transcrição:', error);
      } else {
        // Update local state
        set(state => ({
          contacts: state.contacts.map(c => ({
            ...c,
            messages: c.messages.map(m => m.id === messageId ? { ...m, transcription: text } : m)
          }))
        }));
      }
    } catch(e) {
      console.error('Erro na transcrição de áudio:', e);
      throw e;
    }
  },

  openQRModal: (instanceId) => set({ isQRModalOpen: true, qrModalTargetInstance: instanceId || null }),
  closeQRModal: () => set({ isQRModalOpen: false, qrModalTargetInstance: null }),

  setActiveChannelFilter: (id, name) => set({ activeChannelFilter: id, activeChannelName: name || null, activeChatId: null }),
  setActiveChat: (id) => set({ activeChatId: id }),

  sendHumanMessage: async (contactId, text, instanceName) => {
    const state = get();
    const contact = state.contacts.find(c => c.id === contactId);
    if (!contact) return;
    
    // Injeção Mágica de Assinatura (Signature)
    let finalMessageText = text;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
         const agent = state.agents.find(a => a.user_id === user.id);
         if (agent && agent.signature && agent.signature.trim().length > 0) {
            finalMessageText = `${text}\n\n_${agent.signature}_`;
         }
      }
    } catch (e) {}

    // Atualiza otimista UI
    const pseudoId = 'optimistic-' + Math.random().toString();
    state.addMessageLocally(contactId, { id: pseudoId, text: finalMessageText, sender: 'human', timestamp: new Date() });

    try {
      const { sendTextMessage } = await import('../services/whatsappEngine');
      // 1. Manda pra Baileys Engine Local
      if (!state.tenantInfo) return;
      
      const { data: instDataDB } = await supabase.from('whatsapp_instances').select('api_key').eq('id', instanceName).single();
      const apiKey = instDataDB?.api_key || '';

      await sendTextMessage(state.tenantInfo.id, instanceName, contact.whatsapp_jid || (contact.phone + '@s.whatsapp.net'), finalMessageText, apiKey);
      
    } catch(err: any) {
      console.error(err);
      
      // Reverter mensagem otimista e alertar o usuario
      set((s) => ({
        contacts: s.contacts.map(c => {
          if (c.id === contactId) {
            return { ...c, messages: c.messages.filter(m => m.id !== pseudoId) };
          }
          return c;
        })
      }));
      
      if (err.message === 'Failed to fetch') {
         alert('Falha crítica de comunicação com o Motor Baileys Local na Porta 9000. Verifique se o terminal do servidor node está rodando (node index.js).');
      } else if (err.message === 'Connection Closed') {
         alert('Conexão instável com o WhatsApp (Connection Closed). O motor Baileys está tentando reconectar em segundo plano. Aguarde 5 segundos e tente novamente.');
      } else {
         alert('Erro ao enviar mensagem: ' + err.message);
      }
    }
  },

  uploadAndSendMedia: async (contactId, file, mediaType, instanceName, isPtt, caption) => {
    const state = get();
    const contact = state.contacts.find(c => c.id === contactId);
    if (!contact || !state.tenantInfo) return;

    // Atualiza otimista (Render Instantâneo Premium)
    const pseudoId = 'optimistic-media-' + Math.random().toString();
    const tempUrl = URL.createObjectURL(file);
    state.addMessageLocally(contactId, { 
      id: pseudoId, 
      text: caption?.trim() ? caption.trim() : file.name, 
      sender: 'human', 
      mediaType: mediaType,
      mediaUrl: tempUrl,
      timestamp: new Date() 
    });

    try {
      const formData = new FormData();
      formData.append('media', file);
      // Pega o jid. Padrão: DDI + NUMERO + @s.whatsapp.net
      const jid = contact.whatsapp_jid || (contact.phone + '@s.whatsapp.net');
      formData.append('jid', jid);
      formData.append('messageType', mediaType);
      
      const finalCaption = caption?.trim() ? caption.trim() : (file.name || '');
      if (finalCaption) formData.append('caption', finalCaption);
      
      if (isPtt) formData.append('ptt', 'true');

      // Chamada HTTP pro Node (único dono do upload Supabase e Baileys)
      const API_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
      const { data: instDataDB } = await supabase.from('whatsapp_instances').select('api_key').eq('id', instanceName).single();
      const apiKey = instDataDB?.api_key || '';

      const res = await fetch(`${API_URL}/api/v1/instances/${instanceName}/send-media`, {
        method: 'POST',
        headers: {
          'x-tenant-id': state.tenantInfo.id,
          'apikey': apiKey
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao processar mídia no servidor');

      console.log('[uploadAndSendMedia] Resposta do server:', data);
      
      if (data.media_url) {
        set((s) => ({
          contacts: s.contacts.map(c => c.id === contactId ? {
            ...c,
            // Procura o pseudoId e substitui a url temporaria
            messages: c.messages.map(m => m.id === pseudoId ? { ...m, mediaUrl: data.media_url } : m)
          } : c)
        }));
      }

    } catch (err: any) {
      console.error('[uploadAndSendMedia] Falha crítica:', err);
      // Se der erro, pelo menos mostramos no componente que a media deu erro
      // Não removemos para o dev ver onde falhou
    }
  },

  forwardMessage: async (contactId, message, instanceName) => {
    const state = get();
    // Se a mensagem original tiver texto ou caption e não tiver media, envia como text
    if (!message.mediaUrl) {
       await state.sendHumanMessage(contactId, message.text || "Mensagem encaminhada vazia", instanceName);
       return;
    }
    
    // Se tiver media, precisamos baixar para subir localmente
    try {
      const response = await fetch(message.mediaUrl);
      if (!response.ok) throw new Error("Erro ao obter a mídia para encaminhamento.");
      const blob = await response.blob();
      
      let initialType = blob.type;
      let ext = initialType.split('/')[1] || 'bin';
      
      // Mapeia extensões
      if (ext.startsWith('ogg')) ext = 'ogg';
      else if (ext.startsWith('jpeg')) ext = 'jpg';
      else if (ext.startsWith('png')) ext = 'png';
      else if (initialType.includes('pdf')) ext = 'pdf';
      else if (ext.startsWith('mp4')) ext = 'mp4';

      const file = new File([blob], `encaminhado_${Date.now()}.${ext}`, { type: initialType });
      
      const basicType = message.mediaType || (initialType.includes('image') ? 'image' : initialType.includes('video') ? 'video' : initialType.includes('audio') ? 'audio' : 'document');
      
      await state.uploadAndSendMedia(contactId, file, basicType as any, instanceName, false, message.text);
    } catch(err) {
      console.error("[forwardMessage] Erro ao extrair/encaminhar media:", err);
      alert('Houve uma falha ao preparar a mídia para o envio. Se possível, faça o download e envio manual.');
    }
  },

  fetchContactPicture: async (contactId, jid, instanceName) => {
    const state = get();
    const now = Date.now();
    const lastFetch = state.pictureFetchLocks[contactId];
    
    // Bloqueia e impede um novo fetch se tiver ocorrido nos últimos 60 minutos (3600000ms)
    // Isso evita o loop infinito de tentar puxar um avatar que realmente não existe ou a engine não conseguiu
    if (lastFetch && (now - lastFetch) < 3600000) {
       console.log(`[Anti-Spam/Loop] Fetch picture para ${jid} (${contactId}) ignorado. Último sync foi há menos de 1h.`);
       return;
    }

    if (!state.evolutionConnected) {
       return; // Previne requisições 400 previsiveis caso o socket esteja offline
    }
    
    // Atualiza o lock IMEDIATAMENTE (mesmo se falhar depois)
    set((s) => ({ pictureFetchLocks: { ...s.pictureFetchLocks, [contactId]: now } }));
    
    if (!state.tenantInfo) return;
    try {
      const { data: instDataDB } = await supabase.from('whatsapp_instances').select('api_key').eq('id', instanceName).single();
      const apiKey = instDataDB?.api_key || '';
      const API_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
      
      const res = await fetch(`${API_URL}/api/v1/instances/${instanceName}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': state.tenantInfo.id, 'apikey': apiKey },
        body: JSON.stringify({ method: 'profilePictureUrl', args: [jid, 'image'] })
      });
      const data = await res.json();
      if (res.ok && data.ok && data.result) {
        const baileysUrl = data.result;
        let finalUrl = baileysUrl;
        
        try {
          // Tenta baixar a imagem diretamente para contornar expirações futuras (WhatsApp CDN expiry)
          const imgRes = await fetch(baileysUrl);
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            const fileName = `avatars/${state.tenantInfo.id}/${contactId}-${Date.now()}.jpg`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('chat_media')
              .upload(fileName, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
              
            if (!uploadError && uploadData) {
              const { data: publicUrlData } = supabase.storage.from('chat_media').getPublicUrl(fileName);
              finalUrl = publicUrlData.publicUrl;
            } else {
              console.warn("[fetchContactPicture] Erro no upload para o Supabase Storage:", uploadError);
            }
          }
        } catch (dlErr) {
          console.warn("[fetchContactPicture] Falha ao baixar a imagem (possível CORS ou erro de rede). Usando URL original.", dlErr);
        }

        await supabase.from('contacts').update({ profile_picture_url: finalUrl }).eq('id', contactId);
        set((s) => ({
          contacts: s.contacts.map(c => c.id === contactId ? { ...c, avatar: finalUrl } : c)
        }));
      }
    } catch(err) {
      console.error("[fetchContactPicture] Erro:", err);
    }
  },

  setBotStatus: async (contactId, status) => {
    // Atualiza otimista
    set((state) => ({
      contacts: state.contacts.map((c) => c.id === contactId ? { ...c, bot_status: status } : c)
    }));
    // Assíncrono no DB
    await supabase.from('contacts').update({ bot_status: status }).eq('id', contactId);
  },

  addMessageLocally: (contactId, msg) => {
    set((state) => ({
      contacts: state.contacts.map((c) => {
        if (c.id === contactId) {
          // Acorda (Wake Up) se for mensagem de cliente e estiver em Snooze
          let updatedStatus = c.conv_status;
          let updatedSnooze = c.snoozed_until;
          if (msg.sender === 'client' && c.conv_status === 'snoozed') {
              updatedStatus = 'open';
              updatedSnooze = undefined; // trigger null cleanup
              // Atualiza o DB assincronamente em background sem bloquear
              setTimeout(() => {
                 get().updateConversationField(contactId, { status: 'open', snoozed_until: null });
              }, 100);
          }

          // Previne duplicados por ID do DB ou whatsapp_id
          if (c.messages.some(m => m.id === msg.id || (msg.whatsapp_id && m.whatsapp_id === msg.whatsapp_id))) {
             if (updatedStatus !== c.conv_status) return { ...c, conv_status: updatedStatus, snoozed_until: updatedSnooze };
             return c;
          }
          
          // Tratamento de UI otimista: varre se ja tem uma mensagem igualzinha pendente
          if (msg.sender === 'human' || msg.sender === 'bot') {
            const optIndex = c.messages.findIndex(m => {
                if (!String(m.id).startsWith('optimistic-')) return false;
                if (m.mediaType && msg.mediaType && m.mediaType === msg.mediaType) return true;
                return m.text === msg.text;
            });
            if (optIndex !== -1) {
              const updatedMsgs = [...c.messages];
              updatedMsgs[optIndex] = { ...msg, sender: 'human' }; // substitui pelo registro do Realtime com UUID real mantendo verde na UI
              return { ...c, messages: updatedMsgs, conv_status: updatedStatus, snoozed_until: updatedSnooze };
            }
          }
          
          return { ...c, messages: [...c.messages, msg], conv_status: updatedStatus, snoozed_until: updatedSnooze };
        }
        return c;
      })
    }));
  },

  upsertContactLocally: (contact) => {
    // RBAC: Se for agente, só carrega contatos de instâncias permitidas
    const roleStr = typeof window !== 'undefined' ? (sessionStorage.getItem('current_user_role') || localStorage.getItem('current_user_role')) : null;
    const allowedStr = typeof window !== 'undefined' ? (sessionStorage.getItem('allowed_instances') || localStorage.getItem('allowed_instances')) : null;
    if (roleStr === 'agent' && contact.instance_id && allowedStr) {
        try { 
            const allowedInstances = JSON.parse(allowedStr); 
            if (!allowedInstances.includes(contact.instance_id)) return;
        } catch(e) {}
    }

    // VALIDAÇÃO INTELIGENTE APPWEB (Realtime Barreira)
    if (contact.whatsapp_jid && contact.whatsapp_jid.includes('@lid')) return;
    if (contact.phone && contact.phone.length > 15 && !contact.phone.includes('+')) return;

    set((state) => {
      // 1. Resolvemos os dois principais identificadores unicos independentes (JID ou Telefone Formatado/Puro)
      const contactPhoneMatch = contact.phone || (contact.whatsapp_jid ? contact.whatsapp_jid.split('@')[0] : null);

      let targetIndex = state.contacts.findIndex(c => 
         c.id === contact.id ||
         (c.whatsapp_jid && c.whatsapp_jid === contact.whatsapp_jid) || 
         (c.phone && c.phone === contactPhoneMatch)
      );

      if (targetIndex !== -1) {
        // Encontrou existente! Vamos preservar o ID real do banco caso um deles seja temporário
        const existing = state.contacts[targetIndex];
        const isExistingTemp = existing.id.includes('temp-');
        const isNewTemp = contact.id.includes('temp-');
        
        const finalId = (!isExistingTemp) ? existing.id : (!isNewTemp ? contact.id : existing.id);
        const finalCustomName = existing.custom_name || contact.custom_name;
        const fallbackName = existing.name !== existing.phone && existing.name ? existing.name : contact.name;
        
        const tname = get().tenantInfo?.name || '';
        let finalName = finalCustomName || fallbackName;
        finalName = sanitizeContactName(finalName, contactPhoneMatch || contact.phone, tname) || finalName;

        const updatedContact: ContactType = {
          ...existing,
          ...contact,
          id: finalId,
          custom_name: finalCustomName,
          name: finalName,
          // Preserva o fallback avatar se a api ou realtime nao devolver algo util
          avatar: (contact as any).profile_picture_url || (contact as any).avatar || existing.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(finalName || contactPhoneMatch || 'U')}&background=random&color=fff`,
        };

        const newContacts = [...state.contacts];
        newContacts[targetIndex] = updatedContact;
        return { contacts: newContacts };
      } else {
        // Contato novinho folha
        const tname = get().tenantInfo?.name || '';
        let finalName = contact.custom_name || contact.name;
        finalName = sanitizeContactName(finalName, contactPhoneMatch || contact.phone, tname) || finalName;
        
        const newContact: ContactType = {
          ...contact,
          name: finalName,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(finalName || contact.phone)}&background=random&color=fff`, // Avatar ui-avatars idêntico ao Chatwoot
          messages: [],
          unread: 0,
          instance_id: contact.instance_id || null,
          // usa lastMsgTimestamp para a sidebar saber quem eh primeiro
          lastMsgTimestamp: new Date(contact.created_at || Date.now()).getTime()
        };
        return { contacts: [...state.contacts, newContact] };
      }
    });
  },

  updateContactCRM: async (contactId, payload) => {
    // UI Otimista: caso seja passado 'name', garantimos custom_name = name e name renderizado
    set((state) => ({
      contacts: state.contacts.map((c) => {
         if (c.id === contactId) {
             const customNameUpdate = payload.name ? { custom_name: payload.name, name: payload.name } : {};
             return { ...c, ...payload, ...customNameUpdate };
         }
         return c;
      })
    }));
    try {
      const dbPayload = { ...payload } as any;
      if (payload.name) {
         dbPayload.custom_name = payload.name; // Proteção para a trigger DB e lógica interna
      }
      
      // Omit values that do not exist strictly in the Supabase Schema to prevent PGRST204 errors
      delete dbPayload.bot_status;

      const { error } = await supabase.from('contacts').update(dbPayload).eq('id', contactId);
      if (error) throw error;
    } catch (e) {
      console.error('Erro ao editar contato no DB (CRM):', e);
      throw e;
    }
  },

  deleteContact: async (contactId) => {
    set((state) => ({
      contacts: state.contacts.filter((c) => c.id !== contactId),
      activeChatId: state.activeChatId === contactId ? null : state.activeChatId
    }));
    
    try {
      // Garantimos exclusão forte apagando mensagens antes de contatos, prevenindo falta de CASCADE
      await supabase.from('messages').delete().eq('contact_id', contactId);
      await supabase.from('contacts').delete().eq('id', contactId);
    } catch (e) {
      console.error('Erro ao excluir contato no DB:', e);
    }
  },

  togglePinContact: async (contactId) => {
    const contact = get().contacts.find(c => c.id === contactId);
    if (!contact) return;
    const newStatus = !contact.is_pinned;

    // Atualiza otimista UI
    set((state) => ({
      contacts: state.contacts.map((c) => c.id === contactId ? { ...c, is_pinned: newStatus } : c)
    }));

    try {
      await supabase.from('contacts').update({ is_pinned: newStatus }).eq('id', contactId);
    } catch (e) {
      console.error('Erro ao fixar contato no DB:', e);
      // Reverter alteração otimista
      set((state) => ({
        contacts: state.contacts.map((c) => c.id === contactId ? { ...c, is_pinned: !newStatus } : c)
      }));
    }
  },

  toggleFavorite: async (contactId) => {
    const contact = get().contacts.find(c => c.id === contactId);
    if (!contact) return;
    const newStatus = !contact.is_favorite;

    // Otimista
    set((state) => ({
      contacts: state.contacts.map((c) => c.id === contactId ? { ...c, is_favorite: newStatus } : c)
    }));
    
    // Obter conversation. Pq favorites fica na conversation
    const tenant = get().tenantInfo;
    if(tenant) {
      try {
        const { data: conv } = await supabase.from('conversations').select('id').eq('contact_id', contactId).eq('tenant_id', tenant.id).order('last_message_at', { ascending: false }).limit(1).single();
        if(conv) {
          await supabase.from('conversations').update({ is_favorite: newStatus }).eq('id', conv.id);
        }
      } catch (e) {
        console.error('Erro no Favorite:', e);
         set((state) => ({
            contacts: state.contacts.map((c) => c.id === contactId ? { ...c, is_favorite: !newStatus } : c)
         }));
      }
    }
  },

  toggleBlockContact: async (contactId) => {
    const contact = get().contacts.find(c => c.id === contactId);
    if (!contact) return;
    const newBlockedState = !contact.is_blocked;

    // Atualização otimista local
    set((state) => ({
      contacts: state.contacts.map((c) => c.id === contactId ? { ...c, is_blocked: newBlockedState } : c)
    }));

    try {
      const { error } = await supabase.from('contacts').update({ is_blocked: newBlockedState }).eq('id', contactId);
      if (error) throw error;
    } catch (e) {
      console.error('Erro ao bloquear contato:', e);
      // Reverter atualização otimista
      set((state) => ({
        contacts: state.contacts.map((c) => c.id === contactId ? { ...c, is_blocked: !newBlockedState } : c)
      }));
    }
  },

  markAllAsRead: async () => {
    // UI Otimista
    set((state) => ({
      contacts: state.contacts.map(c => ({...c, unread: 0}))
    }));
    
    const tenant = get().tenantInfo;
    if(tenant) {
      const activeContacts = get().contacts.filter(c => c.unread > 0);
      try {
         await supabase.from('conversations').update({ unread_count: 0 }).eq('tenant_id', tenant.id).gt('unread_count', 0);
      } catch(e) {
         console.error('Erro ao marcar_todas_lidas: ', e);
      }
    }
  },

  fetchTenantLabels: async () => {
     const tenant = get().tenantInfo;
     if (!tenant) return;
     try {
         const { data, error } = await supabase.from('tenant_labels').select('*').eq('tenant_id', tenant.id);
         if (!error && data) {
             set({ tenantLabels: data });
         }
     } catch (e) {
         console.error('Erro ao buscar labels do tenant', e);
     }
   },
   
   assignLabelToConversation: async (contactId: string, labelId: string) => {
      const state = get();
      const tenant = state.tenantInfo;
      if (!tenant) return;
      const conv = state.contacts.find(c => c.id === contactId);
      if (!conv) return;

      const { data: convRecord } = await supabase.from('conversations').select('id').eq('contact_id', contactId).eq('tenant_id', tenant.id).single();
      if (!convRecord) return;

      const { error } = await supabase.from('conversation_labels').insert({
         conversation_id: convRecord.id,
         label_id: labelId
      });

      if (!error) {
         await state.fetchInitialData(); // Reload para atualizar as labels
      }
   },

   removeLabelFromConversation: async (contactId: string, labelId: string) => {
      const state = get();
      const tenant = state.tenantInfo;
      if (!tenant) return;

      const { data: convRecord } = await supabase.from('conversations').select('id').eq('contact_id', contactId).eq('tenant_id', tenant.id).single();
      if (!convRecord) return;

      const { error } = await supabase.from('conversation_labels').delete()
         .match({ conversation_id: convRecord.id, label_id: labelId });

      if (!error) {
         await state.fetchInitialData();
      }
   },

  fetchInitialData: async () => {
    const tenant = get().tenantInfo;
    if (!tenant) return;

    try {
       // Buscar Automacoes
       await get().fetchAutomations();
       // Buscar Labels
       await get().fetchTenantLabels();

       // Opcional: Buscar versão atual do app a partir do banco (tabela app_version)
       const { data: appVersionData } = await supabase.from('app_version').select('*').order('deploy_date', { ascending: false }).limit(1).maybeSingle();
       if (appVersionData) {
         set({ appVersion: { version: appVersionData.version, deploy_date: appVersionData.deploy_date } });
       }

       // Fetch labels
       await get().fetchTenantLabels();

       // 1. Puxa as conversas recentes, garantindo a mesma ordem do WhatsApp Web
       const { data: dbConvs } = await supabase.from('conversations')
          .select('*, conversation_labels(labels(*))')
          .eq('tenant_id', tenant.id)
          .order('is_pinned', { ascending: false })
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(800);
          
       if (!dbConvs || dbConvs.length === 0) return;

       const contactIds = dbConvs.map(cv => cv.contact_id);

       // 2. Puxa os contatos em Lotes (Chunks) para evitar erro HTTP 400 URI Too Long na API Supabase
       const chunkSize = 150;
       let dbContacts: any[] = [];
       for (let i = 0; i < contactIds.length; i += chunkSize) {
           const chunk = contactIds.slice(i, i + chunkSize);
           const { data: chunkData, error } = await supabase.from('contacts')
               .select('*')
               .eq('tenant_id', tenant.id)
               .in('id', chunk);
               
           if (chunkData) {
               dbContacts = dbContacts.concat(chunkData);
           }
           if (error) {
              console.warn('Erro ao buscar dbContacts chunk', error);
           }
       }

       if (dbContacts && dbContacts.length > 0) {
           // RBAC: Se for agente, só carrega contatos de instâncias permitidas
           let allowedInstances: string[] = [];
           const roleStr = typeof window !== 'undefined' ? (sessionStorage.getItem('current_user_role') || localStorage.getItem('current_user_role')) : null;
           const allowedStr = typeof window !== 'undefined' ? (sessionStorage.getItem('allowed_instances') || localStorage.getItem('allowed_instances')) : null;
           if (roleStr === 'agent' && allowedStr) {
               try { allowedInstances = JSON.parse(allowedStr); } catch(e) {}
           }

           // VALIDAÇÃO INTELIGENTE APPWEB: Filtra contatos que não tem telefone válido ou são LIDs de sistema (fantasma)
           const validContacts = dbContacts.filter(c => {
               if (roleStr === 'agent' && c.instance_id) {
                   if (!allowedInstances.includes(c.instance_id)) return false;
               }
               const jid = c.whatsapp_jid || '';
               const phone = c.phone || '';
               if (jid.includes('@lid')) return false; // Bloqueia LIDs
               if (phone.length > 15 && !phone.includes('+')) return false; // Provável ID mascarado
               return true;
           });

           set((s) => {
               const newContacts = [...s.contacts];
               
               dbConvs.forEach(conv => {
                  const dbC = validContacts.find(c => c.id === conv.contact_id);
                  if (!dbC) return; // Ignora se perder integridade

                  const phoneMatch = dbC.phone || (dbC.whatsapp_jid ? dbC.whatsapp_jid.split('@')[0] : null);
                  const idx = newContacts.findIndex(c => 
                     c.id === dbC.id || 
                     c.whatsapp_jid === dbC.whatsapp_jid || 
                     c.phone === phoneMatch
                  );
                  
                  const tname = tenant?.name || '';
                  let finalName = dbC.custom_name || dbC.name || dbC.push_name || phoneMatch || dbC.phone;
                  finalName = sanitizeContactName(finalName, phoneMatch || dbC.phone, tname) || finalName;
                  
                  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(finalName)}&background=random&color=fff`;
                  
                  const preview = conv.last_message_preview || '';
                  const unread = conv.unread_count || 0;
                  const isFavorite = conv.is_favorite || false;
                  // Garante a prioridade absoluta pro is_pinned da conversa (já que WA fixa conversas, não contatos globalmente)
                  const isPinned = conv.is_pinned !== undefined ? conv.is_pinned : dbC.is_pinned;
                  // Se não tiver last_message_at (muito raro), usa a data de criação do contato
                  const ts = conv.last_message_at ? new Date(conv.last_message_at).getTime() : new Date(dbC.created_at).getTime();

                  if (idx !== -1) {
                     const existing = newContacts[idx];
                     const finalCustomName = dbC.custom_name || existing.custom_name;
                     const tname = tenant?.name || '';
                     let finalName = finalCustomName || dbC.name || existing.name;
                     finalName = sanitizeContactName(finalName, phoneMatch || dbC.phone, tname) || finalName;
                     
                     const avatarFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(finalName || dbC.phone)}&background=random&color=fff`;

                     newContacts[idx] = {
                        ...existing,
                        ...dbC,
                        id: dbC.id,
                        custom_name: finalCustomName,
                        name: finalName,
                        avatar: dbC.profile_picture_url || (existing.avatar?.includes('ui-avatars') ? avatarFallback : (existing.avatar || avatarFallback)),
                        unread: unread,
                        is_favorite: isFavorite,
                        is_pinned: isPinned,
                        lastMsgTimestamp: ts,
                        messages: existing.messages || [],
                        conv_status: conv.status,
                        snoozed_until: conv.snoozed_until,
                        priority: conv.priority,
                        assigned_to: conv.assigned_to,
                        conv_labels: conv.conversation_labels ? conv.conversation_labels.map((cl: any) => cl.labels) : [],
                        instance_id: dbC.instance_id || null
                     };
                     
                     // Injeta um preview fake se messages tiver vazio e tem preview no banco 
                     if (newContacts[idx].messages.length === 0 && preview) {
                        newContacts[idx].messages = [{
                           id: 'preview-' + conv.id,
                           text: preview,
                           sender: 'client',
                           timestamp: new Date(ts)
                        }];
                     }
                  } else {
                     const finalCustomName = dbC.custom_name;
                     const finalName = finalCustomName || dbC.name;
                     const avatarFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(finalName || dbC.phone)}&background=random&color=fff`;

                     newContacts.push({
                        ...dbC,
                        custom_name: finalCustomName,
                        name: finalName,
                        avatar: dbC.profile_picture_url || avatarFallback,
                        messages: preview ? [{ id: 'preview-' + conv.id, text: preview, sender: 'client', timestamp: new Date(ts) }] : [],
                        unread: unread,
                        is_favorite: isFavorite,
                        is_pinned: isPinned,
                        lastMsgTimestamp: ts,
                        timestamp: ts,
                        conv_status: conv.status,
                        snoozed_until: conv.snoozed_until,
                        priority: conv.priority,
                        assigned_to: conv.assigned_to,
                        instance_id: dbC.instance_id || null
                     });
                  }
               });

               return { contacts: newContacts.sort((a,b) => b.timestamp - a.timestamp) };
           });

           // Gatilho Automático: Busca capa na instância caso falte (após popular o state)
           const instanceName = tenant.evolution_instance_name;
           if (instanceName) {
               const missingDataContacts = dbContacts.filter(c => 
                 !c.profile_picture_url
               );
               
               if (missingDataContacts.length > 0) {
                 // Processa em background para não travar a UI
                 setTimeout(() => {
                   const storeState = get();
                   missingDataContacts.forEach(c => {
                     const jid = c.whatsapp_jid || (c.phone ? `${c.phone}@s.whatsapp.net` : null);
                     if (jid) {
                       storeState.fetchContactPicture(c.id, jid, instanceName);
                     }
                   });
                 }, 3000);
               }
           }
       }
    } catch(e) {
       console.error("Erro ao puxar initialDBContacts", e);
    }
  },

  fetchTenantConfig: async () => {
    try {
      const currentTenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
      if (!currentTenantId) return;

      const { data: tenantData } = await supabase.from('companies').select('*').eq('id', currentTenantId).single();
      
      if (tenantData) {
        set({
           tenantInfo: tenantData,
           connectedInstanceName: tenantData.evolution_api_instance || null
        });

        if (tenantData.evolution_api_instance) {
           const { fetchEngineStatus, createInstance } = await import('../services/whatsappEngine');
           
           // Buscar DB state
           const { data: instDataDB } = await supabase.from('whatsapp_instances').select('api_key, status').eq('id', tenantData.evolution_api_instance).single();
           const apiKey = instDataDB?.api_key || '';
           
           if (instDataDB?.status === 'connected') {
             set({ evolutionConnected: true, modalReason: null });
             get().fetchInitialData();
           } else if (instDataDB?.status === 'connecting') {
             set({ evolutionConnected: false, modalReason: 'O sistema está conectando ao WhatsApp...' });
           } else {
             set({ evolutionConnected: false, modalReason: 'A conexão com seu WhatsApp foi encerrada. Por favor, conecte novamente lendo o QR Code.' });
           }
        } else {
           set({ evolutionConnected: false, modalReason: 'Seja bem-vindo a sua plataforma! Crie a primeira conexão do seu número de WhatsApp comercial agora mesmo.' });
        }
      }
    } catch (e) {
      console.error(e);
      set({ evolutionConnected: false, modalReason: 'Houve uma falha fatal na validação da sua empresa. Entre em contato com o suporte.' });
    }
  },

  setEvolutionConnection: async (status, newInst) => {
    const tenant = get().tenantInfo;
    if (!tenant) return;
    
    await supabase.from('companies').update({ evolution_api_instance: newInst }).eq('id', tenant.id);
    
    set({ 
       connectedInstanceName: newInst || null, 
       tenantInfo: { ...tenant, evolution_api_instance: newInst || null },
       modalReason: null
    });
  },

  updateTenantInstance: async (newInst: string) => {
    get().setEvolutionConnection(true, newInst);
  },

  setModalReason: (reason) => {
    set({ modalReason: reason });
  },

  syncEvolutionContacts: async (_instanceName) => {
    get().fetchInitialData();
  },

  loadHistoricalMessages: async (contactId, instanceName, forceSync = false) => {
    try {
        const tenant = get().tenantInfo;
        if (!tenant) return;
        
        // Puxa conversa pra este contato (mesmo que n exista msg)
        const { data: convs } = await supabase.from('conversations')
              .select('id')
              .eq('tenant_id', tenant.id)
              .eq('contact_id', contactId)
              .order('last_message_at', { ascending: false, nullsFirst: false })
              .limit(1);
        
        let conv = convs && convs.length > 0 ? convs[0] : null;

        if (!conv) {
             const { data: newConv, error: insertErr } = await supabase.from('conversations').insert({
                 tenant_id: tenant.id,
                 contact_id: contactId,
                 unread_count: 0,
                 status: 'open',
                 last_message_at: new Date().toISOString()
             }).select('id').single();
             if (insertErr) {
                 console.error("[chatStore] ERRO AO INSERIR NOVA CONVERSA:", insertErr);
                 return;
             }
             if (newConv) conv = newConv;
             else return;
        }

        // Limpar unread 
        await supabase.from('conversations').update({ unread_count: 0 }).eq('id', conv.id);
        
        const { data: msgs } = await supabase.from('messages')
               .select('*')
               .eq('tenant_id', tenant.id)
               .eq('conversation_id', conv.id)
               .order('timestamp', { ascending: false })
               .limit(100);
               
        const handleMapping = (messagesArray: any[]) => {
           const orderedMsgs = messagesArray.reverse();
           
           // Deduplicate messages on initial load to resolve any historical/db corruptions
           const uniqueMsgs: any[] = [];
           const seenWaIds = new Set();
           for (const m of orderedMsgs) {
               if (m.whatsapp_message_id) {
                   if (seenWaIds.has(m.whatsapp_message_id)) continue;
                   seenWaIds.add(m.whatsapp_message_id);
               }
               uniqueMsgs.push(m);
           }

           set((s) => {
              const updated = [...s.contacts];
              const idx = updated.findIndex(c => c.id === contactId);
              if (idx !== -1) {
                  updated[idx].unread = 0;
                  updated[idx].messages = uniqueMsgs.map(m => {
                      const advanced = parseAdvancedMsgMetadata(m);
                      return {
                          id: m.id,
                          whatsapp_id: m.whatsapp_message_id,
                          text: advanced.text || m.text_content,
                          sender: m.sender_type,
                          mediaUrl: m.media_url,
                          mediaType: advanced.mediaType,
                          status: m.status,
                          timestamp: new Date(m.timestamp),
                          quoted: advanced.quoted,
                          buttons: advanced.buttons,
                          transcription: m.transcription
                      };
                  });
              }
              return { contacts: updated };
           });
        };

        if (forceSync) {
            if (msgs && msgs.length === 0) {
                // Impede tentativa inútil e avisa o cliente. A API do Baileys precisa de uma mensagem âncora.
                alert('A conversa no sistema (CRM) está completamente vazia no momento. Para iniciar uma busca profunda de histórico, o WhatsApp exige uma "mensagem âncora".\\n\\n💡 Dica: Envie agora mesmo uma mensagem (pode ser "Olá!") para estabelecer o vínculo local, e só depois clique em Buscar Histórico novamente.');
            } else {
                // Conversa tem base, prossegue com o sync on demand
                if (!get().isSyncingHistory[contactId]) {
                    set((s) => ({ isSyncingHistory: { ...s.isSyncingHistory, [contactId]: true } }));
                    try {
                        const API_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
                        const { data: instDataDB } = await supabase.from('whatsapp_instances').select('api_key').eq('id', instanceName).single();
                        await fetch(`${API_URL}/api/v1/conversations/${conv.id}/sync-history`, {
                            method: 'POST',
                            headers: { 
                               'Content-Type': 'application/json',
                               'x-tenant-id': tenant.id,
                               'apikey': instDataDB?.api_key || ''
                            },
                            body: JSON.stringify({ instanceId: instanceName })
                        });
                        
                        // Supabase deve ter sido populado pelo Node. Aguarda 1.0s para propagação de DB/replica
                        await new Promise(r => setTimeout(r, 1000));
                        
                        const { data: fetchNewMsgs } = await supabase.from('messages')
                           .select('*')
                           .eq('tenant_id', tenant.id)
                           .eq('conversation_id', conv.id)
                           .order('timestamp', { ascending: false })
                           .limit(100);
                           
                        if (fetchNewMsgs) handleMapping(fetchNewMsgs);

                    } catch (err) {
                        console.error("Falha ao sincronizar histórico da Baileys (on demand):", err);
                    } finally {
                        set((s) => ({ isSyncingHistory: { ...s.isSyncingHistory, [contactId]: false } }));
                    }
                }
            }
        }
        
        // Sempre deve remapear o que tem em banco seja do forceSync atualizado ou se cair apenas no fallback
        if (!forceSync && msgs && msgs.length > 0) {
           handleMapping(msgs);
        }
    } catch(err) {
        console.error("Erro carregando history:", err);
    }
  },

  fetchTenantAgents: async () => {
    const tenant = get().tenantInfo;
    if (!tenant) return;
    try {
      const { data: agentsData, error } = await supabase.from('tenant_users').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: true });
      if (error) throw error;
      set({ agents: agentsData || [] });
    } catch (e) {
      console.error('Erro ao buscar agentes:', e);
    }
  },

  createAgent: async (payload) => {
    const tenant = get().tenantInfo;
    if (!tenant) return;
    try {
      // Gera um UUID local para o user_id provisório
      const tempUserId = crypto.randomUUID();
      const { error } = await supabase.from('tenant_users').insert([{
        tenant_id: tenant.id,
        user_id: tempUserId,
        role: payload.role,
        full_name: payload.full_name,
        email: payload.email,
        password: payload.password,
        allowed_instances: payload.allowed_instances || [],
        allowed_companies: payload.allowed_companies || []
      }]);
      if (error) throw error;
      await get().fetchTenantAgents();
    } catch (e) {
      console.error('Erro ao criar agente:', e);
      throw e;
    }
  },

  updateAgent: async (id, payload) => {
    const tenant = get().tenantInfo;
    if (!tenant) return;
    try {
      const { error } = await supabase.from('tenant_users').update({
        role: payload.role,
        full_name: payload.full_name,
        email: payload.email,
        password: payload.password,
        allowed_instances: payload.allowed_instances || [],
        allowed_companies: payload.allowed_companies || []
      }).eq('id', id).eq('tenant_id', tenant.id);
      
      if (error) throw error;
      await get().fetchTenantAgents();
    } catch (e) {
      console.error('Erro ao atualizar agente:', e);
      throw e;
    }
  },

  deleteAgent: async (id) => {
    const tenant = get().tenantInfo;
    if (!tenant) return;
    try {
      const { error } = await supabase.from('tenant_users').delete()
        .eq('id', id).eq('tenant_id', tenant.id);
      
      if (error) throw error;
      await get().fetchTenantAgents();
    } catch (e) {
      console.error('Erro ao deletar agente:', e);
      throw e;
    }
  },

  updateAgentProfile: async (fullName, signature) => {
    const tenant = get().tenantInfo;
    if (!tenant) return;
    try {
      const userRes = await supabase.auth.getUser();
      if (!userRes.data.user) return;
      
      const { error } = await supabase.from('tenant_users').update({ full_name: fullName, signature: signature })
        .eq('tenant_id', tenant.id).eq('user_id', userRes.data.user.id);
      
      if (error) throw error;
      await get().fetchTenantAgents(); // Sincroniza localmente
    } catch (e) {
      console.error('Erro ao atualizar perfil do agente:', e);
      throw e;
    }
  },

  updateConversationField: async (contactId, payload) => {
    const tenant = get().tenantInfo;
    if (!tenant) return;
    
    // UI Otimista
    set((state) => ({
       contacts: state.contacts.map((c) => {
         if (c.id === contactId) {
            const stateUpdates: any = {};
            if ('status' in payload) stateUpdates.conv_status = payload.status;
            if ('snoozed_until' in payload) stateUpdates.snoozed_until = payload.snoozed_until;
            if ('priority' in payload) stateUpdates.priority = payload.priority;
            if ('assigned_to' in payload) stateUpdates.assigned_to = payload.assigned_to;
            return { ...c, ...stateUpdates };
         }
         return c;
       })
    }));

    try {
      const { data: conv } = await supabase.from('conversations').select('id').eq('contact_id', contactId).eq('tenant_id', tenant.id).order('last_message_at', { ascending: false }).limit(1).single();
      if (!conv) return;

      const { error } = await supabase.from('conversations').update(payload).eq('id', conv.id);
      if (error) throw error;
    } catch (e) {
      console.error('Erro ao atualizar campo da conversa:', e);
      // Aqui no mundo real adicionariamos reversão otimista
    }
  },

  subscribeToNewMessages: () => {
    const state = get() as any;
    if (state.isSubscribed) return; // React 18 protection
    let tenantId = state.tenantInfo?.id;
    if (!tenantId) {
        tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
    }
    if (!tenantId) {
        console.error('[Realtime] Cannot subscribe without tenantId. Ensure user is logged in.');
        return;
    }
    set({ isSubscribed: true } as any);

    const channelName = `realtime_chat_${tenantId}`;
    // HMR fallback: Remove o canal caso já exista no cache do Supabase Client para evitar "cannot add callback after subscribe"
    const existingChannel = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existingChannel) {
        supabase.removeChannel(existingChannel);
    }
    
    const channel = supabase.channel(channelName);
    
    // Escuta novas mensagens
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `tenant_id=eq.${tenantId}` }, async (payload) => {
        const m = payload.new as any;
        console.log('[Realtime] Message INSERT:', m);

        if (m.sender_type === 'system') return; // Ignore echoes that don't need realtime sync

        let targetContactId = m.conversation_id ? null : m.contact_id;
        
        if (m.conversation_id && !targetContactId) {
             const { data: conv } = await supabase.from('conversations').select('contact_id').eq('id', m.conversation_id).single();
             if (conv) targetContactId = conv.contact_id;
        }

        if (!targetContactId) return;

        const { data: cData } = await supabase.from('contacts').select('*').eq('id', targetContactId).single();
        if (!cData) return;

        // RBAC: Verifica se o contato que recebeu a msg é de uma instância que o Agente tem acesso
        const roleStr = typeof window !== 'undefined' ? (sessionStorage.getItem('current_user_role') || localStorage.getItem('current_user_role')) : null;
        const allowedStr = typeof window !== 'undefined' ? (sessionStorage.getItem('allowed_instances') || localStorage.getItem('allowed_instances')) : null;
        if (roleStr === 'agent' && cData.instance_id && allowedStr) {
            try { 
                const allowedInstances = JSON.parse(allowedStr); 
                if (!allowedInstances.includes(cData.instance_id)) return;
            } catch(e) {}
        }

        const currentState = get();
        const targetContactLocally = currentState.contacts.find((c: any) => c.id === targetContactId || (c.whatsapp_jid && c.whatsapp_jid === cData.whatsapp_jid) || c.phone === cData.phone);
        
        if (!targetContactLocally) {
           get().upsertContactLocally(cData as any);
        }

        const cid = targetContactLocally ? targetContactLocally.id : cData.id;

        const advanced = parseAdvancedMsgMetadata(m);

        // Verifica automações
        const ignoredAuto = get().automations.find((auto: any) => {
           if (['ignore', 'ignore_message', 'ignore_message_silent'].includes(auto.action_type) && auto.is_active && m.text_content) {
               // Handle variables like (X) replacing it with regex wildcard .*
               const patternText = auto.condition_text || auto.keyword || '';
               if (!patternText) return false;
               // Escapa caracteres especiais de regex, mas deixa o (X) ser substituído depois
               const escapedPattern = patternText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
               // Substitui o (X) escapado por um wildcard real
               const finalPattern = escapedPattern.replace(/\\\(X\\\)/ig, '.*');
               const regex = new RegExp(finalPattern, 'i');
               return regex.test(m.text_content);
           }
           return false;
        });
        const isIgnored = !!ignoredAuto;
        const isIgnoredSilent = ignoredAuto?.action_type === 'ignore_message_silent';

        get().addMessageLocally(cid, {
          id: m.id,
          whatsapp_id: m.whatsapp_message_id,
          text: advanced.text || m.text_content,
          sender: m.sender_type || 'client',
          mediaUrl: m.media_url,
          mediaType: advanced.mediaType,
          status: m.status,
          timestamp: new Date(m.timestamp),
          quoted: advanced.quoted,
          buttons: advanced.buttons,
          transcription: m.transcription,
          isIgnored: isIgnored,
          isIgnoredSilent: isIgnoredSilent
        });

        // Reordena o card pra cima e joga notificação +1 Unread caso a aba não seja ele
        set((s) => {
           let u = [...s.contacts];
           const i = u.findIndex(c => c.id === cid);
           if (i !== -1) {
              const updatedContact = { ...u[i] };
              
              if (!isIgnored) {
                 updatedContact.lastMsgTimestamp = new Date(m.timestamp).getTime();
                 if (s.activeChatId !== cid) {
                     updatedContact.unread = (updatedContact.unread || 0) + 1;
                 }
              }
              
              u[i] = updatedContact;
           }
           return { contacts: u };
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `tenant_id=eq.${tenantId}` }, async (payload) => {
        const m = payload.new as any;
        console.log('[Realtime] Message UPDATE:', m);
        set((s) => {
           let updatedContacts = [...s.contacts];
           // Tenta achar com fallback iterando as mensagens para bypassar conversa ausente no state.
           for (let i = 0; i < updatedContacts.length; i++) {
              const msgIndex = updatedContacts[i].messages.findIndex(msg => msg.id === m.id || (m.whatsapp_message_id && msg.whatsapp_id === m.whatsapp_message_id));
              if (msgIndex !== -1) {
                  const newMessages = [...updatedContacts[i].messages];
                  newMessages[msgIndex] = { ...newMessages[msgIndex], status: m.status };
                  updatedContacts[i] = { ...updatedContacts[i], messages: newMessages };
                  break;
              }
           }
           return { contacts: updatedContacts };
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `tenant_id=eq.${tenantId}` }, (payload) => {
        if(payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
           get().upsertContactLocally(payload.new as ContactRow);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_instances', filter: `tenant_id=eq.${tenantId}` }, async (payload) => {
         const t = get().tenantInfo;
         if (!t || !t.evolution_api_instance) return;
         const inst = payload.new as any;
         
         // Sincroniza estado de conexao com o banco via Realtime
         if (inst.id === t.evolution_api_instance) {
            console.log('[Realtime] Instance Status Changed:', inst.status);
            if (inst.status === 'connected') {
               if ((window as any)._disconnectTimer) {
                  clearInterval((window as any)._disconnectTimer);
                  (window as any)._disconnectTimer = null;
               }
               (window as any)._failCheckCount = 0;
               
               if (!get().evolutionConnected) {
                  set({ evolutionConnected: true, modalReason: null });
                  get().fetchInitialData();
               }
            } else if (inst.status === 'offline' || inst.status === 'connecting') {
               if (get().evolutionConnected) {
                  if (!(window as any)._disconnectTimer) {
                     (window as any)._failCheckCount = 0;
                     (window as any)._disconnectTimer = setInterval(async () => {
                        (window as any)._failCheckCount++;
                        
                        // Faz uma verificação de segurança no banco
                        const { data } = await supabase.from('whatsapp_instances').select('status').eq('id', inst.id).single();
                        
                        if (data && data.status === 'connected') {
                           clearInterval((window as any)._disconnectTimer);
                           (window as any)._disconnectTimer = null;
                           (window as any)._failCheckCount = 0;
                        } else if ((window as any)._failCheckCount >= 2) {
                           clearInterval((window as any)._disconnectTimer);
                           (window as any)._disconnectTimer = null;
                           (window as any)._failCheckCount = 0;
                           set({ evolutionConnected: false, modalReason: 'A conexão com seu WhatsApp caiu ou o servidor reiniciou. Tentando reconectar...' });
                        }
                     }, 10000);
                  }
               }
            }
         }
      })
      .subscribe((_status, err) => {
         if (err) console.error("Realtime Error", err);
      });
  }
}));
