import { create } from 'zustand';
import { supabase, ContactRow } from '../services/supabase';
import { playNotificationSound } from '../utils/AudioEngine';
import { useDevStore } from './devStore';

export type MessageType = {
  id: string;
  whatsapp_id?: string;
  text: string;
  sender: 'client' | 'bot' | 'human' | 'system';
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'contact' | 'location' | 'interactive' | string;
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
  vcardWaid?: string; // WAID (Telefone) extraído de VCard
  payload?: any; // Rastreio de leitura interno e outros metadados
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
  conv_id?: string;
};

export const getRealContactId = (id: string) => id.includes('_') ? id.split('_')[0] : id;
export const getInstanceIdFromContact = (id: string) => id.includes('_') ? id.split('_')[1] : null;

export interface AgentType {
  id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  full_name?: string | null;
  signature?: string | null;
  use_signature?: boolean;
  email?: string | null;
}

export interface ContactGroup {
  id: string;
  name: string;
  color?: string;
  icon?: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  evolution_api_instance: string | null;
  settings?: any; // Novo campo
}

interface ChatState {
  contacts: ContactType[];
  activeChatId: string | null;
  evolutionConnected: boolean;
  instancesStatus: Record<string, string>;
  setInstanceStatus: (id: string, status: string) => void;
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
  appVersion: { version: string, deploy_date: string } | null;
  isSearchingGlobally: boolean;
  
  searchGlobalContacts: (term: string) => Promise<void>;
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
  updateTenantSettings: (newSettings: any) => Promise<void>; // Novo campo
  fetchInitialData: () => Promise<void>;
  subscribeToNewMessages: () => void;
  // Historical Sync
  syncEvolutionContacts: (instanceName: string) => Promise<void>;
  loadHistoricalMessages: (contactId: string, instanceName: string, forceSync?: boolean) => Promise<void>;
  
  // Local state updaters
  addMessageLocally: (contactId: string, msg: MessageType) => void;
  upsertContactLocally: (contact: ContactRow) => void;
  sendHumanMessage: (contactId: string, text: string, instanceName: string) => Promise<void>;
  editHumanMessage: (contactId: string, messageId: string, newText: string, instanceName: string) => Promise<void>;
  deleteHumanMessage: (contactId: string, messageId: string, instanceName: string) => Promise<void>;
  forwardMessage: (contactId: string, message: MessageType, instanceName: string) => Promise<void>;
  sendMediaFromUrl: (contactId: string, mediaUrl: string, mediaType: 'image' | 'video' | 'audio' | 'document', instanceName: string, caption?: string) => Promise<void>;
  uploadAndSendMedia: (contactId: string, file: File, mediaType: 'image' | 'video' | 'audio' | 'document', instanceName: string, isPtt?: boolean, caption?: string) => Promise<void>;
  updateContactCRM: (contactId: string, payload: Partial<ContactRow>) => Promise<void>;
  deleteContact: (contactId: string) => Promise<void>;
  togglePinContact: (contactId: string, instanceId?: string) => Promise<void>;
  toggleFavorite: (contactId: string) => Promise<void>;
  toggleBlockContact: (contactId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  fetchContactPicture: (contactId: string, jid: string, instanceName: string) => Promise<void>;
  
  // Omnichannel Actions
  fetchTenantAgents: () => Promise<void>;
  createAgent: (payload: { full_name: string; email: string; role: string; password?: string; allowed_instances?: string[]; allowed_companies?: string[]; signature?: string; use_signature?: boolean; }) => Promise<void>;
  updateAgent: (id: string, payload: { full_name: string; email: string; role: string; password?: string; allowed_instances?: string[]; allowed_companies?: string[]; signature?: string; use_signature?: boolean; }) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  updateConversationField: (contactId: string, payload: Record<string, any>) => Promise<void>;
  updateAgentProfile: (fullName: string, signature: string, use_signature: boolean) => Promise<void>;
  
  // Gemini Actions
  // Automations
  automations: any[];
  fetchAutomations: () => Promise<void>;
  
  // User Settings
  userSettings: any;
  filterType: string;
  setFilterType: (filter: string) => Promise<void>;

  // Labels
  fetchTenantLabels: () => Promise<void>;
  assignLabelToConversation: (contactId: string, labelId: string) => Promise<void>;
  removeLabelFromConversation: (contactId: string, labelId: string) => Promise<void>;
  
  // Quick Replies
  quickReplies: QuickReply[];
  fetchQuickReplies: () => Promise<void>;
  addQuickReply: (shortcut: string, content: string) => Promise<void>;
  updateQuickReply: (id: string, shortcut: string, content: string) => Promise<void>;
  deleteQuickReply: (id: string) => Promise<void>;
  
  // Contact Groups (Grupos Empresariais)
  addContactGroup: (group: Omit<ContactGroup, 'id'>) => Promise<void>;
  updateContactGroup: (id: string, group: Partial<ContactGroup>) => Promise<void>;
  deleteContactGroup: (id: string) => Promise<void>;
  
  // Theme Global
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;

  // Operations Logs
  logOperation: (action: 'INSERT' | 'UPDATE' | 'DELETE', tableName: string, recordId: string, beforeState: any, afterState: any) => Promise<void>;
  undoOperation: (logId: string, password: string) => Promise<{success: boolean; error?: string}>;
  toggleUnread: (contactId: string, currentUnread: number) => Promise<void>;
  markAsRead: (contactId: string) => Promise<void>;
  resolveConversation: (contactId: string) => Promise<void>;
  clearStore: () => void;
}

export interface QuickReply {
  id: string;
  tenant_id: string;
  shortcut: string;
  content: string;
  created_at?: string;
}

function parseAdvancedMsgMetadata(m: any) {
  let derivedType = m.message_type;
  let derivedText = m.text_content;
  let derivedQuoted: any = undefined;
  let vcardWaid: string | undefined = undefined;

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
              const waidMatch = payloadMessage.contactMessage.vcard?.match(/waid=(\d+)/);
              if (waidMatch) {
                  vcardWaid = waidMatch[1];
              }
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
              const full = [];
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
              const full = [];
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
             const full = [];
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
             const full = [];
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
             const full = [];
             if (lm.title) full.push(`*${lm.title.trim()}*`);
             if (lm.description) full.push(lm.description.trim());
             if (lm.footerText) full.push(`_${lm.footerText.trim()}_`);
             if (full.length > 0) derivedText = full.join('\n\n');
             derivedType = 'list';
             
             buttons = [{ id: 'list_btn', text: lm.buttonText || 'Ver Opções', type: 'action' }];
          }
      }
  } catch(e){}

  return { mediaType: derivedType, text: derivedText, quoted: derivedQuoted, buttons: buttons.length > 0 ? buttons : undefined, vcardWaid };
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
const instanceStatusTimeouts: Record<string, ReturnType<typeof setTimeout>> = {};

export const useChatStore = create<ChatState>((set, get) => ({
  contacts: [],
  activeChatId: null,
  evolutionConnected: false,
  instancesStatus: {},
  setInstanceStatus: (id, status) => {
    // Implementa regra moderna de consulta: Aguarda alguns segundos antes de setar offline/connecting
    // Se a conexão piscar, o timeout é limpo pelo status 'connected'
    if (status === 'connected') {
      if (instanceStatusTimeouts[id]) {
        clearTimeout(instanceStatusTimeouts[id]);
        delete instanceStatusTimeouts[id];
      }
      set(state => ({ instancesStatus: { ...state.instancesStatus, [id]: status } }));
    } else {
      // offline ou connecting
      const currentState = get().instancesStatus[id];
      if (currentState !== status) {
        if (!instanceStatusTimeouts[id]) {
          // Aguarda 10 segundos. Se a conexão voltar nesse período, o 'connected' cancela essa execução.
          instanceStatusTimeouts[id] = setTimeout(() => {
            set(state => ({ instancesStatus: { ...state.instancesStatus, [id]: status } }));
            delete instanceStatusTimeouts[id];
          }, 10000);
        }
      }
    }
  },
  connectedInstanceName: null,
  tenantInfo: null,
  agents: [],
  modalReason: null,
  isSubscribed: false,
  isSyncingHistory: {},
  pictureFetchLocks: {},
  appVersion: null,
  activeChannelFilter: localStorage.getItem('activeChannelFilter') || null,
  activeChannelName: localStorage.getItem('activeChannelName') || null,
  isQRModalOpen: false,
  qrModalTargetInstance: null,
  automations: [],
  tenantLabels: [],
  isSearchingGlobally: false,
  quickReplies: [],
  userSettings: {},
  filterType: (localStorage.getItem('chat_filter_preference') as string) || 'all',
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',

  clearStore: () => {
    if (get().isSubscribed) {
       supabase.removeAllChannels();
    }
    set({
      contacts: [],
      activeChatId: null,
      evolutionConnected: false,
      instancesStatus: {},
      connectedInstanceName: null,
      tenantInfo: null,
      agents: [],
      modalReason: null,
      isSubscribed: false,
      isSyncingHistory: {},
      pictureFetchLocks: {},
      activeChannelFilter: null,
      activeChannelName: null,
      isQRModalOpen: false,
      qrModalTargetInstance: null,
      automations: [],
      tenantLabels: [],
      isSearchingGlobally: false,
      quickReplies: [],
      appVersion: null,
      userSettings: {},
      filterType: 'all'
    });
  },
  
  setFilterType: async (filter) => {
    localStorage.setItem('chat_filter_preference', filter);
    set({ filterType: filter });
    try {
      const email = localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email');
      const state = get();
      if (email && state.tenantInfo) {
         const newSettings = { ...state.userSettings, filterType: filter };
         const { error } = await supabase.from('tenant_users')
            .update({ settings: newSettings })
            .eq('email', email)
            .eq('tenant_id', state.tenantInfo.id);
         
         if (error) {
           console.error("Erro ao salvar filtro no Supabase:", error);
         } else {
           set({ userSettings: newSettings });
         }
      }
    } catch(e) {
      console.error('[setFilterType] Exceção:', e);
    }
  },

  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#111b21');
    } else {
      document.documentElement.classList.remove('dark');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f0f2f5');
    }
    set({ theme });
  },
  
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

  fetchQuickReplies: async () => {
    try {
      const state = get();
      if (!state.tenantInfo) return;
      
      const { data, error } = await supabase
        .from('quick_replies')
        .select('*')
        .eq('tenant_id', state.tenantInfo.id)
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('Error fetching quick replies:', error);
        return;
      }
      
      set({ quickReplies: data || [] });
    } catch (err) {
      console.error('Failed to fetch quick replies:', err);
    }
  },

  addQuickReply: async (shortcut: string, content: string) => {
      const state = get();
      if (!state.tenantInfo) throw new Error('Tenant não encontrado');
      const { data, error } = await supabase.from('quick_replies').insert({
         tenant_id: state.tenantInfo.id,
         shortcut,
         content
      }).select().single();
      
      if (error) throw error;
      if (data) {
         set({ quickReplies: [data, ...state.quickReplies] });
      }
  },

  updateQuickReply: async (id: string, shortcut: string, content: string) => {
      const { error } = await supabase.from('quick_replies').update({
         shortcut, content
      }).eq('id', id);
      
      if (error) throw error;
      set(s => ({
         quickReplies: s.quickReplies.map(q => q.id === id ? { ...q, shortcut, content } : q)
      }));
  },

  deleteQuickReply: async (id: string) => {
      const { error } = await supabase.from('quick_replies').delete().eq('id', id);
      
      if (error) throw error;
      set(s => ({
         quickReplies: s.quickReplies.filter(q => q.id !== id)
      }));
  },

  addContactGroup: async (group) => {
    const state = get();
    if (!state.tenantInfo) return;
    const currentGroups: ContactGroup[] = state.tenantInfo.settings?.contactGroups || [];
    const newGroup = { ...group, id: crypto.randomUUID() };
    await state.updateTenantSettings({ contactGroups: [...currentGroups, newGroup] });
  },

  updateContactGroup: async (id, payload) => {
    const state = get();
    if (!state.tenantInfo) return;
    const currentGroups: ContactGroup[] = state.tenantInfo.settings?.contactGroups || [];
    const updated = currentGroups.map(g => g.id === id ? { ...g, ...payload } : g);
    await state.updateTenantSettings({ contactGroups: updated });
  },

  deleteContactGroup: async (id) => {
    const state = get();
    if (!state.tenantInfo) return;
    const currentGroups: ContactGroup[] = state.tenantInfo.settings?.contactGroups || [];
    const updated = currentGroups.filter(g => g.id !== id);
    await state.updateTenantSettings({ contactGroups: updated });
  },

  logOperation: async (action, tableName, recordId, beforeState, afterState) => {
    try {
      const tenantId = get().tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      if (!tenantId) return;
      
      const userStr = localStorage.getItem('user_info');
      const storedEmail = localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email');
      const storedName = localStorage.getItem('current_user_name') || sessionStorage.getItem('current_user_name');
      
      let userName = 'Sistema';
      
      if (storedEmail) {
        userName = storedEmail;
      } else if (storedName) {
        userName = storedName;
      } else if (userStr) {
        try {
           const user = JSON.parse(userStr);
           userName = user.email || user.name || 'Sistema';
        } catch(e) {}
      }

      await supabase.from('operation_logs').insert({
        tenant_id: tenantId,
        user_name: userName,
        action,
        table_name: tableName,
        record_id: recordId,
        before_state: beforeState,
        after_state: afterState
      });
    } catch(e) {
      console.error('Falha ao gerar log de operação:', e);
    }
  },

  undoOperation: async (logId, password) => {
    const UNDO_PASSWORD = import.meta.env.VITE_UNDO_PASSWORD || 'xpoint2025undo';
    if (password !== UNDO_PASSWORD) {
      return { success: false, error: 'Senha master incorreta.' };
    }

    try {
      // fetch log
      const { data: log, error: logError } = await supabase.from('operation_logs').select('*').eq('id', logId).single();
      if (logError || !log) return { success: false, error: 'Log não encontrado.' };

      const { action, table_name, record_id, before_state } = log;

      if (action === 'DELETE') {
        // Re-insert
        if (!before_state) return { success: false, error: 'Não há estado anterior para restaurar.' };
        const { error } = await supabase.from(table_name).insert(before_state);
        if (error) throw error;
      } else if (action === 'UPDATE') {
        // Restore before_state
        if (!before_state) return { success: false, error: 'Não há estado anterior para restaurar.' };
        const { error } = await supabase.from(table_name).update(before_state).eq('id', record_id);
        if (error) throw error;
      } else if (action === 'INSERT') {
        // Delete record
        if (!record_id) return { success: false, error: 'ID do registro não encontrado para desfazer a inserção.' };
        const { error } = await supabase.from(table_name).delete().eq('id', record_id);
        if (error) throw error;
      }

      await get().logOperation(
        'INSERT',
        'operation_logs',
        logId,
        null,
        { status: 'UNDONE', original_action: action }
      );

      return { success: true };
    } catch(err: any) {
      console.error('Erro ao desfazer:', err);
      return { success: false, error: err.message };
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

  setActiveChannelFilter: (id, name) => {
    if (id) {
        localStorage.setItem('activeChannelFilter', id);
    } else {
        localStorage.removeItem('activeChannelFilter');
    }
    if (name) {
        localStorage.setItem('activeChannelName', name);
    } else {
        localStorage.removeItem('activeChannelName');
    }
    
    // Limpa os contatos momentaneamente para forçar o loading state da UI e evitar misturas
    set({ contacts: [], activeChannelFilter: id, activeChannelName: name || null, activeChatId: null });
    
    // Recarrega os contatos baseados no novo filtro de canal
    setTimeout(() => {
        get().fetchInitialData();
    }, 50);
  },
  setActiveChat: (id) => set({ activeChatId: id }),

  sendHumanMessage: async (contactId, text, instanceName) => {
    console.log("[sendHumanMessage] Called with:", { contactId, text, instanceName });
    const state = get();
    const contact = state.contacts.find(c => c.id === contactId);
    if (!contact) {
       console.warn("[sendHumanMessage] Contact not found in store!", contactId);
       return;
    }
    
    // Verifica a conexão da instância específica da conversa
    const targetInstance = instanceName || contact.instance_id || state.connectedInstanceName;
    if (targetInstance && state.instancesStatus[targetInstance] && state.instancesStatus[targetInstance] !== 'connected') {
       set({ modalReason: 'A instância do WhatsApp atrelada a esta conversa está offline. Por favor, reconecte para enviar mensagens.' });
       return;
    }
    
    // Injeção Mágica de Assinatura (Signature)
    let finalMessageText = text;
    try {
       const currentUserEmail = localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email');
       if (currentUserEmail) {
           let agent = state.agents.find(a => a.email && a.email.toLowerCase() === currentUserEmail.toLowerCase());
           
           if (!agent && state.tenantInfo) {
               // Fallback direto no banco caso a store não tenha sido populada ainda
               const { data: agentData } = await supabase.from('tenant_users')
                  .select('use_signature, signature')
                  .eq('email', currentUserEmail)
                  .eq('tenant_id', state.tenantInfo.id)
                  .limit(1)
                  .maybeSingle();
               if (agentData) agent = agentData as any;
           }

           if (agent && agent.use_signature && agent.signature && agent.signature.trim().length > 0) {
              finalMessageText = `*${agent.signature}*\n\n${text}`;
           }
       }
    } catch (e) {
      console.error("Erro na injeção de assinatura:", e);
    }

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
         alert('Falha crítica de comunicação com o Motor Baileys. Verifique se o backend está rodando e online.');
      } else if (err.message.includes('Connection Closed')) {
         alert('Conexão instável com o WhatsApp (Connection Closed). O motor Baileys está tentando reconectar em segundo plano. Aguarde 5 segundos e tente novamente.');
      } else {
         alert(`Não foi possível enviar a mensagem: ${err.message}`);
      }
    }
  },

  editHumanMessage: async (contactId, messageId, newText, instanceName) => {
    const state = get();
    if (!instanceName || !state.instancesStatus[instanceName] || state.instancesStatus[instanceName] !== 'connected') {
       set({ modalReason: 'A instância do WhatsApp atrelada a esta conversa está offline. Por favor, reconecte para editar mensagens.' });
       return;
    }
    
    const contact = state.contacts.find(c => c.id === contactId);
    if (!contact || !state.tenantInfo) return;
    
    const msgToEdit = contact.messages.find(m => m.id === messageId);
    if (!msgToEdit || !msgToEdit.whatsapp_id) {
       alert('Não é possível editar esta mensagem pois a chave nativa não foi encontrada.');
       return;
    }

    try {
      const { editNativeMessage } = await import('../services/whatsappEngine');
      
      const { data: instDataDB } = await supabase.from('whatsapp_instances').select('api_key').eq('id', instanceName).single();
      const apiKey = instDataDB?.api_key || '';

      const messageKey = {
         remoteJid: contact.whatsapp_jid || (contact.phone + '@s.whatsapp.net'),
         fromMe: true,
         id: msgToEdit.whatsapp_id
      };

      await editNativeMessage(state.tenantInfo.id, instanceName, contact.whatsapp_jid || (contact.phone + '@s.whatsapp.net'), newText, messageKey, apiKey);
      
      // Update Database
      const finalNewText = newText.endsWith(' *(Editado)*') ? newText : newText + ' *(Editado)*';
      const { error: dbError } = await supabase
        .from('messages')
        .update({ text_content: finalNewText })
        .eq('id', messageId);
        
      if (dbError) throw dbError;

      // Update Local State Optimistically
      set((s) => ({
        contacts: s.contacts.map(c => {
          if (c.id === contactId) {
            return {
               ...c, 
               messages: c.messages.map(m => m.id === messageId ? { ...m, text: finalNewText } : m)
            };
          }
          return c;
        })
      }));

    } catch(err: any) {
      console.error('Erro ao editar mensagem:', err);
      alert(`Falha ao editar a mensagem: ${err.message}`);
    }
  },

  deleteHumanMessage: async (contactId, messageId, instanceName) => {
    const state = get();
    if (!instanceName || !state.instancesStatus[instanceName] || state.instancesStatus[instanceName] !== 'connected') {
       set({ modalReason: 'A instância do WhatsApp atrelada a esta conversa está offline. Por favor, reconecte para apagar mensagens.' });
       return;
    }
    
    const contact = state.contacts.find(c => c.id === contactId);
    if (!contact || !state.tenantInfo) return;
    
    const msgToDelete = contact.messages.find(m => m.id === messageId);
    if (!msgToDelete || !msgToDelete.whatsapp_id) {
       alert('Não é possível apagar remotamente esta mensagem (chave ausente). Ela será apagada apenas localmente.');
       // Still proceed to delete locally/DB if desired, but user expectation is remote delete.
    }

    try {
      if (msgToDelete && msgToDelete.whatsapp_id) {
         const { deleteNativeMessage } = await import('../services/whatsappEngine');
         
         const { data: instDataDB } = await supabase.from('whatsapp_instances').select('api_key').eq('id', instanceName).single();
         const apiKey = instDataDB?.api_key || '';

         const messageKey = {
            remoteJid: contact.whatsapp_jid || (contact.phone + '@s.whatsapp.net'),
            fromMe: true,
            id: msgToDelete.whatsapp_id
         };

         await deleteNativeMessage(state.tenantInfo.id, instanceName, contact.whatsapp_jid || (contact.phone + '@s.whatsapp.net'), messageKey, apiKey);
      }
      
      // Update Database
      const { error: dbError } = await supabase
        .from('messages')
        .update({ 
           status: 'deleted'
        })
        .eq('id', messageId);
        
      if (dbError) throw dbError;

      // Update Local State Optimistically
      set((s) => ({
        contacts: s.contacts.map(c => {
          if (c.id === contactId) {
            return {
               ...c, 
               messages: c.messages.map(m => m.id === messageId ? {
                  ...m, 
                  status: 'deleted'
               } : m)
            };
          }
          return c;
        })
      }));

    } catch(err: any) {
      console.error('Erro ao apagar mensagem:', err);
      alert(`Falha ao apagar a mensagem: ${err.message}`);
    }
  },

  uploadAndSendMedia: async (contactId, file, mediaType, instanceName, isPtt, caption) => {
    const state = get();
    if (!instanceName || !state.instancesStatus[instanceName] || state.instancesStatus[instanceName] !== 'connected') {
       set({ modalReason: 'A instância do WhatsApp está offline. Por favor, reconecte para enviar arquivos.' });
       return;
    }
    const contact = state.contacts.find(c => c.id === contactId);
    if (!contact || !state.tenantInfo) return;

    // Injeção Mágica de Assinatura na mídia
    let finalCaption = caption?.trim() ? caption.trim() : (mediaType === 'image' || mediaType === 'video' ? '' : (file.name || ''));
    
    if (!isPtt) {
       try {
           const currentUserEmail = localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email');
           if (currentUserEmail) {
               let agent = state.agents.find(a => a.email && a.email.toLowerCase() === currentUserEmail.toLowerCase());
               
               if (!agent && state.tenantInfo) {
                   const { data: agentData } = await supabase.from('tenant_users')
                      .select('use_signature, signature')
                      .eq('email', currentUserEmail)
                      .eq('tenant_id', state.tenantInfo.id)
                      .limit(1)
                      .maybeSingle();
                   if (agentData) agent = agentData as any;
               }

               if (agent && agent.use_signature && agent.signature && agent.signature.trim().length > 0) {
                  finalCaption = finalCaption ? `*${agent.signature}*\n\n${finalCaption}` : `*${agent.signature}*`;
               }
           }
       } catch (e) {
          console.error("Erro na injeção de assinatura na mídia:", e);
       }
    }

    // Atualiza otimista (Render Instantâneo Premium)
    const pseudoId = 'optimistic-media-' + Math.random().toString();
    const tempUrl = URL.createObjectURL(file);
    state.addMessageLocally(contactId, { 
      id: pseudoId, 
      text: finalCaption, 
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
      
      const initialType = blob.type;
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

  sendMediaFromUrl: async (contactId, mediaUrl, mediaType, instanceName, caption) => {
    const state = get();
    const contact = state.contacts.find(c => c.id === contactId);
    if (!contact || !state.tenantInfo) return;

    // Injeção Mágica de Assinatura na mídia
    let finalCaption = caption?.trim() ? caption.trim() : '';
    
    try {
       const currentUserEmail = localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email');
       if (currentUserEmail) {
           let agent = state.agents.find(a => a.email && a.email.toLowerCase() === currentUserEmail.toLowerCase());
           if (!agent && state.tenantInfo) {
               const { data: agentData } = await supabase.from('tenant_users')
                  .select('use_signature, signature')
                  .eq('email', currentUserEmail)
                  .eq('tenant_id', state.tenantInfo.id)
                  .limit(1)
                  .maybeSingle();
               if (agentData) agent = agentData as any;
           }
           
           if (agent && agent.use_signature && agent.signature && agent.signature.trim().length > 0) {
               finalCaption = finalCaption ? `*${agent.signature}*\n\n${finalCaption}` : `*${agent.signature}*`;
           }
       }
    } catch (e) {
      console.warn("Erro ao injetar assinatura na midia por URL", e);
    }

    // 1) Otimistic render - Criamos a bolha de mensagem simulando carregamento
    const pseudoId = 'optimistic-media-' + Math.random().toString();
    const isLocalUrl = mediaUrl.startsWith('blob:') || mediaUrl.startsWith('data:');
    
    state.addMessageLocally(contactId, { 
      id: pseudoId, 
      text: finalCaption, 
      sender: 'human', 
      mediaType: mediaType,
      mediaUrl: mediaUrl, // Always keep the mediaUrl so it renders the video properly
      timestamp: new Date() 
    });

    try {
      const jid = contact.whatsapp_jid || (contact.phone + '@s.whatsapp.net');
      const API_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
      const { data: instDataDB } = await supabase.from('whatsapp_instances').select('api_key').eq('id', instanceName).single();
      const apiKey = instDataDB?.api_key || '';

      let mimetype = 'application/octet-stream';
      if (mediaType === 'video') mimetype = 'video/mp4';
      else if (mediaType === 'image') mimetype = 'image/jpeg';
      else if (mediaType === 'audio') mimetype = 'audio/ogg';
      else if (mediaType === 'document') mimetype = 'application/pdf';

      const fileName = `canned_media_${Date.now()}`;

      console.log(`[sendMediaFromUrl] Disparando webhook para URL: ${mediaUrl}`);

      const res = await fetch(`${API_URL}/api/v1/instances/${instanceName}/send-media-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': state.tenantInfo.id,
          'apikey': apiKey
        },
        body: JSON.stringify({
          jid: jid,
          messageType: mediaType,
          mimetype: mimetype,
          caption: finalCaption,
          mediaUrl: mediaUrl,
          fileName: fileName,
          ptt: false
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar mídia via URL no motor');
      }

      console.log(`[sendMediaFromUrl] Retorno do webhook:`, data);

    } catch (err: any) {
      console.error('[sendMediaFromUrl] Falha:', err);
      alert('Falha ao enviar mídia da resposta pronta: ' + err.message);
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

    if (!instanceName || !state.instancesStatus[instanceName] || state.instancesStatus[instanceName] !== 'connected') {
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

        await supabase.from('contacts').update({ profile_picture_url: finalUrl }).eq('id', getRealContactId(contactId));
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
    await supabase.from('contacts').update({ bot_status: status }).eq('id', getRealContactId(contactId));
  },

  addMessageLocally: (contactId, msg, options) => {
    if (options?.isIgnored) msg.isIgnored = true;
    if (options?.isIgnoredSilent) msg.isIgnoredSilent = true;

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
              updatedMsgs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
              return { ...c, messages: updatedMsgs, conv_status: updatedStatus, snoozed_until: updatedSnooze };
            }
          }
          
          // Prevenção de Bug de Ordenação Otimista: se for uma mensagem otimista, garante que ela vá para o fim
          if (String(msg.id).startsWith('optimistic-') && c.messages.length > 0) {
             const lastTimestamp = c.messages[c.messages.length - 1].timestamp.getTime();
             if (msg.timestamp.getTime() <= lastTimestamp) {
                 msg.timestamp = new Date(lastTimestamp + 1000);
             }
          }
          
          const newMessages = [...c.messages, msg];
          newMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          
          return { ...c, messages: newMessages, conv_status: updatedStatus, snoozed_until: updatedSnooze };
        }
        return c;
      })
    }));
  },

  upsertContactLocally: (contact) => {
    // RBAC: Se for agente, só carrega contatos de instâncias permitidas
    const roleStr = typeof window !== 'undefined' ? (sessionStorage.getItem('current_user_role') || localStorage.getItem('current_user_role')) : null;
    const allowedStr = typeof window !== 'undefined' ? (sessionStorage.getItem('allowed_instances') || localStorage.getItem('allowed_instances')) : null;
    if (contact.instance_id && allowedStr) {
        try { 
            const allowedInstances = JSON.parse(allowedStr); 
            if (Array.isArray(allowedInstances) && allowedInstances.length > 0) {
                if (!allowedInstances.includes(contact.instance_id)) return;
            } else if (roleStr === 'agent' || roleStr === 'Agente') {
                return; // Agents with no allowed instances get nothing
            }
        } catch(e) {}
    }

    // VALIDAÇÃO INTELIGENTE APPWEB (Realtime Barreira)
    if (contact.whatsapp_jid && contact.whatsapp_jid.includes('@lid')) return;
    if (contact.phone && contact.phone.length > 15 && !contact.phone.includes('+')) return;

    // BARREIRA DE INSTÂNCIA: Impede contatos vazando entre caixas via realtime
    const currentActiveFilter = get().activeChannelFilter;
    if (currentActiveFilter && currentActiveFilter !== 'default' && currentActiveFilter !== 'all') {
        if (contact.instance_id && contact.instance_id !== currentActiveFilter) {
            console.log(`[Realtime Barreira] Ignorando contato da instância ${contact.instance_id} na visualização ativa ${currentActiveFilter}`);
            return;
        }
    }

    set((state) => {
      // 1. Resolvemos os dois principais identificadores unicos independentes (JID ou Telefone Formatado/Puro)
      const contactPhoneMatch = contact.phone || (contact.whatsapp_jid ? contact.whatsapp_jid.split('@')[0] : null);

      const effectiveInstanceId = contact.instance_id || 'default';
      const compositeId = contact.id.includes('_') ? contact.id : `${contact.id}_${effectiveInstanceId}`;

      const targetIndex = state.contacts.findIndex(c => 
         c.id === compositeId ||
         c.id === contact.id ||
         (((c.whatsapp_jid && c.whatsapp_jid === contact.whatsapp_jid) || 
         (c.phone && c.phone === contactPhoneMatch)) && c.instance_id === (contact.instance_id || null))
      );

      if (targetIndex !== -1) {
        // Encontrou existente! Vamos preservar o ID real do banco caso um deles seja temporário
        const existing = state.contacts[targetIndex];
        const isExistingTemp = existing.id.includes('temp-');
        const isNewTemp = contact.id.includes('temp-');
        
        const baseId = (!isExistingTemp) ? getRealContactId(existing.id) : (!isNewTemp ? getRealContactId(contact.id) : existing.id);
        const finalId = baseId.includes('temp-') ? baseId : (baseId.includes('_') ? baseId : `${baseId}_${effectiveInstanceId}`);
        
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
          id: compositeId,
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
    const currentState = get().contacts.find(c => c.id === contactId);
    const beforeState = currentState ? { ...currentState } : null;

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
      delete dbPayload.assigned_to;
      delete dbPayload.conv_status;

      // Recupera o estado original puro do banco para o log
      let rawBeforeState = null;
      try {
        const { data } = await supabase.from('contacts').select('*').eq('id', getRealContactId(contactId)).single();
        if (data) rawBeforeState = data;
      } catch (e) {}

      const { error } = await supabase.from('contacts').update(dbPayload).eq('id', getRealContactId(contactId));
      if (error) throw error;

      // Log Operation
      if (rawBeforeState) {
        const rawAfterState = { ...rawBeforeState, ...dbPayload };
        await get().logOperation('UPDATE', 'contacts', getRealContactId(contactId), rawBeforeState, rawAfterState);
      }
    } catch (e) {
      console.error('Erro ao editar contato no DB (CRM):', e);
      throw e;
    }
  },

  resolveConversation: async (contactId) => {
    try {
        const tenantInfo = get().tenantInfo;
        if (!tenantInfo) return;
        
        const currentUserEmail = typeof window !== 'undefined' ? (sessionStorage.getItem('current_user_email') || localStorage.getItem('current_user_email')) : null;
        let agentName = 'Agente';
        if (currentUserEmail) {
            const agent = get().agents.find(a => a.email === currentUserEmail);
            if (agent && agent.full_name) agentName = agent.full_name;
        }

        // Descobre a Conversation vinculada para update do Status/Assigned_to e Insert de Message
        const realContactId = getRealContactId(contactId);
        const instId = getInstanceIdFromContact(contactId);
        let query = supabase.from('conversations').select('id').eq('contact_id', realContactId).eq('tenant_id', tenantInfo.id);
        if (instId && instId !== 'default') query = query.eq('instance_id', instId);
        const { data: conv } = await query.order('last_message_at', { ascending: false }).limit(1).single();

        if (!conv) {
            console.warn('Conversa não encontrada para resolver o ticket.');
            return;
        }

        // 1. Inserir a mensagem interna System
        const msgText = `✅ Resolvido por ${agentName} dia ${new Date().toLocaleString('pt-BR')}`;
        
        const dbMsg = {
           conversation_id: conv.id, // Correto Schema: conversation_id e não contact_id
           tenant_id: tenantInfo.id,
           text_content: msgText, // Correto Schema: text_content e não text
           sender_type: 'system', // Correto Schema: sender_type e não sender
           direction: 'outgoing', // Coluna NOT NULL obrigatória no schema
           instance_id: get().contacts.find(c => c.id === contactId)?.instance_id
        };

        const { data: insertedMsg, error } = await supabase.from('messages').insert(dbMsg).select().single();
        
        if (!error && insertedMsg) {
            // Atualiza a interface da mensagem local
            const msgTypeObj: MessageType = {
               id: insertedMsg.id,
               text: insertedMsg.text_content,
               sender: 'system',
               timestamp: new Date(insertedMsg.timestamp || insertedMsg.created_at || Date.now())
            };
            get().addMessageLocally(contactId, msgTypeObj);
        }

        // 2. Remove o assignment direto na tabela certa (conversations)
        await supabase.from('conversations').update({ assigned_to: null, status: 'bot' }).eq('id', conv.id);

        // 3. Atualização local do estado para sumir da lista
        set((state) => ({
            contacts: state.contacts.map((c) => c.id === contactId ? { ...c, assigned_to: null, conv_status: 'bot' } : c)
        }));

    } catch (e) {
        console.error('Erro ao resolver conversa:', e);
    }
  },

  deleteContact: async (contactId) => {
    set((state) => ({
      contacts: state.contacts.filter((c) => c.id !== contactId),
      activeChatId: state.activeChatId === contactId ? null : state.activeChatId
    }));
    
    try {
      // Garantimos exclusão forte apagando mensagens antes de contatos, prevenindo falta de CASCADE
      await supabase.from('messages').delete().eq('contact_id', getRealContactId(contactId));
      await supabase.from('contacts').delete().eq('id', getRealContactId(contactId));
    } catch (e) {
      console.error('Erro ao excluir contato no DB:', e);
    }
  },

  togglePinContact: async (contactId, instanceId) => {
    const contact = get().contacts.find(c => c.id === contactId);
    if (!contact) return;
    
    const tenant = get().tenantInfo;
    const state = get();
    // Resolvemos a instancia alvo para array
    const currentBox = state.activeChannelFilter || contact.instance_id || state.connectedInstanceName;
    const effectiveInstanceId = instanceId || currentBox;
    
    let newPinned = [...(contact.pinned_instances || [])];
    const isCurrentlyPinned = contact.is_pinned || (effectiveInstanceId && newPinned.includes(effectiveInstanceId));
    const newStatus = !isCurrentlyPinned;

    if (effectiveInstanceId) {
       if (newStatus) {
          if (!newPinned.includes(effectiveInstanceId)) newPinned.push(effectiveInstanceId);
       } else {
          newPinned = newPinned.filter(id => id !== effectiveInstanceId);
       }
    }

    // Atualiza otimista UI
    set((state) => ({
      contacts: state.contacts.map((c) => c.id === contactId ? { 
          ...c, 
          is_pinned: newStatus,
          pinned_instances: newPinned 
      } : c)
    }));

    try {
      // 1. Atualiza na tabela Contacts (Legacy & Arrays)
      await supabase.from('contacts').update({ 
         is_pinned: newStatus,
         pinned_instances: newPinned 
      }).eq('id', getRealContactId(contactId));

      // 2. Atualiza na tabela Conversations (Nova Arquitetura)
      if (tenant) {
         const realContactId = getRealContactId(contactId);
         const instId = getInstanceIdFromContact(contactId);
         let query = supabase.from('conversations')
            .select('id')
            .eq('contact_id', realContactId)
            .eq('tenant_id', tenant.id);
            
         if (instId && instId !== 'default') query = query.eq('instance_id', instId);

         const { data: conv } = await query
            .order('last_message_at', { ascending: false })
            .limit(1)
            .maybeSingle();
            
         if (conv) {
            await supabase.from('conversations').update({ is_pinned: newStatus }).eq('id', conv.id);
         }
      }
    } catch (e) {
      console.error('Erro ao fixar contato no DB:', e);
      // Reverter alteração otimista
      set((state) => ({
        contacts: state.contacts.map((c) => c.id === contactId ? { 
            ...c, 
            is_pinned: contact.is_pinned,
            pinned_instances: contact.pinned_instances
        } : c)
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
        const realContactId = getRealContactId(contactId);
        const instId = getInstanceIdFromContact(contactId);
        let query = supabase.from('conversations').select('id').eq('contact_id', realContactId).eq('tenant_id', tenant.id);
        if (instId && instId !== 'default') query = query.eq('instance_id', instId);
        const { data: conv } = await query.order('last_message_at', { ascending: false }).limit(1).single();
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
      const { error } = await supabase.from('contacts').update({ is_blocked: newBlockedState }).eq('id', getRealContactId(contactId));
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
    const { activeChannelFilter, activeChannelName } = get();

    // UI Otimista
    set((state) => ({
      contacts: state.contacts.map(c => {
         let isMatch = true;
         if (activeChannelFilter) {
            const currentBox = c.instance_id || state.connectedInstanceName;
            if (currentBox !== activeChannelFilter && currentBox !== activeChannelName) {
                // tenta fallback para url de evolution
                const isEvoUrlMatch = c.instance_id && c.instance_id.includes(activeChannelFilter);
                if (!isEvoUrlMatch) {
                    isMatch = false;
                }
            }
         }
         return isMatch ? { ...c, unread: 0 } : c;
      })
    }));
    
    const tenant = get().tenantInfo;
    if(tenant) {
      try {
         let query = supabase.from('conversations').update({ unread_count: 0 }).eq('tenant_id', tenant.id).gt('unread_count', 0);
         
         if (activeChannelFilter) {
             // Opcional fallback de OR com name caso seja preciso, mas geralmente o DB é o ID:
             query = query.eq('instance_id', activeChannelFilter);
         }
         
         await query;
      } catch(e) {
         console.error('Erro ao marcar_todas_lidas: ', e);
      }
    }
  },

  toggleUnread: async (contactId: string, currentUnread: number) => {
    const newUnread = currentUnread > 0 ? 0 : 1; // Alterna entre 0 (lida) e 1 (não lida)
    
    // UI Otimista
    set((state) => ({
      contacts: state.contacts.map(c => c.id === contactId ? { ...c, unread: newUnread } : c)
    }));

    try {
      const { error } = await supabase.from('conversations').update({ unread_count: newUnread }).eq('contact_id', getRealContactId(contactId));
      if (error) throw error;
    } catch (e) {
      console.error('Erro ao alternar unread:', e);
      // Reverter atualização otimista
      set((state) => ({
        contacts: state.contacts.map(c => c.id === contactId ? { ...c, unread: currentUnread } : c)
      }));
    }
  },

  markAsRead: async (contactId: string) => {
    const state = get();
    const contact = state.contacts.find(c => c.id === contactId);
    if (!contact || contact.unread === 0) return;

    const unreadCount = contact.unread;

    const currentUserEmail = typeof window !== 'undefined' ? (sessionStorage.getItem('current_user_email') || localStorage.getItem('current_user_email') || 'Agente') : 'Agente';
    const currentUserName = typeof window !== 'undefined' ? (sessionStorage.getItem('current_user_name') || localStorage.getItem('current_user_name') || currentUserEmail) : 'Agente';

    const clientMsgs = contact.messages.filter(m => m.sender === 'client');
    const unreadMsgs = clientMsgs.slice(-unreadCount);
    const unreadIds = unreadMsgs.map(m => m.id).filter(id => !String(id).startsWith('optimistic-'));

    const readReceipt = {
      read_by_name: currentUserName,
      read_by_email: currentUserEmail,
      read_at: new Date().toISOString()
    };

    set((s) => ({
      contacts: s.contacts.map(c => c.id === contactId ? { 
        ...c, 
        unread: 0,
        messages: c.messages.map(m => unreadIds.includes(m.id) ? {
          ...m,
          payload: { ...(m.payload || {}), read_receipt: readReceipt }
        } : m)
      } : c)
    }));

    try {
      await supabase.from('conversations').update({ unread_count: 0 }).eq('contact_id', getRealContactId(contactId));

      if (unreadIds.length > 0) {
          const { data: currentRecords } = await supabase.from('messages').select('id, raw_payload').in('id', unreadIds);
          if (currentRecords) {
             for (const record of currentRecords) {
                 const newPayload = { ...((record as any).raw_payload || {}), read_receipt: readReceipt };
                 await supabase.from('messages').update({ raw_payload: newPayload }).eq('id', record.id);
             }
          }
      }
    } catch (e) {
      console.error('Erro ao marcar como lida:', e);
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

      const realContactId = getRealContactId(contactId);
      const instId = getInstanceIdFromContact(contactId);
      let query = supabase.from('conversations').select('id').eq('contact_id', realContactId).eq('tenant_id', tenant.id);
      if (instId && instId !== 'default') query = query.eq('instance_id', instId);
      const { data: convRecord } = await query.single();
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

      const realContactId = getRealContactId(contactId);
      const instId = getInstanceIdFromContact(contactId);
      let query = supabase.from('conversations').select('id').eq('contact_id', realContactId).eq('tenant_id', tenant.id);
      if (instId && instId !== 'default') query = query.eq('instance_id', instId);
      const { data: convRecord } = await query.single();
      if (!convRecord) return;

      const { error } = await supabase.from('conversation_labels').delete()
         .match({ conversation_id: convRecord.id, label_id: labelId });

      if (!error) {
         await state.fetchInitialData();
      }
   },

  searchGlobalContacts: async (term: string) => {
    const state = get();
    const tenant = state.tenantInfo;
    if (!tenant || !term || term.trim().length < 3) return;

    set({ isSearchingGlobally: true });

    try {
        const roleStr = typeof window !== 'undefined' ? (sessionStorage.getItem('current_user_role') || localStorage.getItem('current_user_role')) : null;
        let allowedInstances: string[] = [];
        const allowedStr = typeof window !== 'undefined' ? (sessionStorage.getItem('allowed_instances') || localStorage.getItem('allowed_instances')) : null;
        if (allowedStr) {
            try { allowedInstances = JSON.parse(allowedStr); } catch(e) {}
        }

        const { data: dbContacts, error: contactError } = await supabase
            .from('contacts')
            .select('*')
            .eq('tenant_id', tenant.id)
            .or(`name.ilike.%${term}%,custom_name.ilike.%${term}%,phone.ilike.%${term}%,whatsapp_jid.ilike.%${term}%`)
            .limit(50);

        if (contactError || !dbContacts || dbContacts.length === 0) {
            set({ isSearchingGlobally: false });
            return;
        }

        const contactIds = dbContacts.map(c => c.id);
        const { data: dbConvs } = await supabase
            .from('conversations')
            .select('*, conversation_labels(label_id)')
            .in('contact_id', contactIds);

        const conversationIds = dbConvs?.map(cv => cv.id) || [];

        const { data: dbMessages } = await supabase
            .from('messages')
            .select('conversation_id, text_content, message_type, timestamp, sender_type, status')
            .in('conversation_id', conversationIds)
            .order('timestamp', { ascending: false })
            .limit(100);

        const validContacts = dbContacts.filter(c => {
             const conv = dbConvs?.find(cv => cv.contact_id === c.id);
             const effectiveInstanceId = conv?.instance_id || c.instance_id;
             
             if (effectiveInstanceId) {
                 if (Array.isArray(allowedInstances) && allowedInstances.length > 0) {
                    if (!allowedInstances.includes(effectiveInstanceId)) return false;
                } else if (roleStr === 'agent' || roleStr === 'Agente') {
                    return false;
                }
            }
            const jid = c.whatsapp_jid || '';
            const phone = c.phone || '';
            if (jid.includes('@lid')) return false;
            if (phone.length > 15 && !phone.includes('+')) return false;
            return true;
        });

        const newContacts: ContactType[] = validContacts.map(dbC => {
            const conv = dbConvs?.find(cv => cv.contact_id === dbC.id);
            const msgs = conv ? (dbMessages?.filter(m => m.conversation_id === conv.id) || []) : [];
            
            const mappedMessages: MessageType[] = msgs.map((m: any) => ({
                id: m.id || Math.random().toString(),
                text: m.text_content,
                sender: m.sender_type,
                timestamp: new Date(m.timestamp),
                mediaType: m.message_type,
                status: m.status
            })).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            return {
                ...dbC,
                avatar: dbC.profile_picture_url || '',
                messages: mappedMessages,
                unread: conv?.unread_count || 0,
                lastMsgTimestamp: conv?.last_interaction_at ? new Date(conv.last_interaction_at).getTime() : new Date(dbC.created_at).getTime(),
                is_pinned: conv?.is_pinned || false,
                is_favorite: conv?.is_favorite || false,
                conv_status: conv?.status || 'pending',
                snoozed_until: conv?.snoozed_until,
                priority: conv?.priority,
                assigned_to: conv?.assigned_to,
                conv_labels: conv?.conversation_labels || [],
                instance_id: conv?.instance_id || dbC.instance_id
            } as ContactType;
        });

        set(state => {
            const existingContacts = [...state.contacts];
            let changed = false;
            newContacts.forEach(nc => {
                const idx = existingContacts.findIndex(c => c.id === nc.id);
                if (idx === -1) {
                    existingContacts.push(nc);
                    changed = true;
                }
            });
            // Ordenar contatos para que os recém pesquisados possam aparecer no topo caso tenham lastMsgTimestamp maior
            if (changed) {
                existingContacts.sort((a, b) => b.lastMsgTimestamp - a.lastMsgTimestamp);
            }
            return changed ? { contacts: existingContacts, isSearchingGlobally: false } : { isSearchingGlobally: false };
        });

    } catch (e) {
        console.error("Global search failed", e);
        set({ isSearchingGlobally: false });
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
       // Buscar Quick Replies
       await get().fetchQuickReplies();

       // Buscar settings do usuário logado
       try {
         const email = localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email');
         if (email && tenant) {
           const { data: userData } = await supabase.from('tenant_users')
             .select('settings')
             .eq('email', email)
             .eq('tenant_id', tenant.id)
             .maybeSingle();
             
           if (userData && userData.settings) {
             set({ userSettings: userData.settings });
             // Removida a restauracao forçada do filterType para evitar race condition
           }
         }
       } catch (err) {
          console.warn('Erro ao carregar settings do usuario:', err);
       }

       // Opcional: Buscar versão atual do app a partir do banco (tabela app_version)
       const { data: appVersionData } = await supabase.from('app_version').select('*').order('deploy_date', { ascending: false }).limit(1).maybeSingle();
       if (appVersionData) {
         set({ appVersion: { version: appVersionData.version, deploy_date: appVersionData.deploy_date } });
       }

       // Fetch labels
       await get().fetchTenantLabels();

       // 1. Puxa as conversas recentes, garantindo a mesma ordem do WhatsApp Web
       let convQuery = supabase.from('conversations')
          .select('*, conversation_labels(tenant_labels(*))')
          .eq('tenant_id', tenant.id);
          
       const activeChannel = get().activeChannelFilter;
       if (activeChannel) {
          convQuery = convQuery.or(`instance_id.eq.${activeChannel},unread_count.gt.0`);
       }

       const { data: dbConvs } = await convQuery
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
           if (allowedStr) {
               try { allowedInstances = JSON.parse(allowedStr); } catch(e) {}
           }

           // VALIDAÇÃO INTELIGENTE APPWEB: Filtra contatos que não tem telefone válido ou são LIDs de sistema (fantasma)
           const validContacts = dbContacts.filter(c => {
               const jid = c.whatsapp_jid || '';
               const phone = c.phone || '';
               if (jid.includes('@lid')) return false; // Bloqueia LIDs
               if (phone.length > 15 && !phone.includes('+')) return false; // Provável ID mascarado
               return true;
           });

           // RBAC: Filtra as conversas pela instância permitida
           const isGlobalAdmin = roleStr === 'owner' || roleStr === 'admin';
           const validConvs = dbConvs.filter(conv => {
               const dbC = validContacts.find(c => c.id === conv.contact_id);
               if (!dbC) return false; // Ignora se perder integridade ou for LID bloqueado
               
               const effectiveInstanceId = conv.instance_id || dbC.instance_id;
               
               // --- FILTRO DE CONVERSAS FANTASMAS ---
               // Ignorar conversas vazias (sem mensagens) caso não sejam a instância principal do contato,
               // evitando poluição no painel quando clicam num contato por engano.
               const isPrimary = conv.instance_id === dbC.instance_id;
               const isEmpty = !conv.last_message_preview && conv.unread_count === 0;
               if (isEmpty && !isPrimary) {
                   return false;
               }
               
               if (effectiveInstanceId && !isGlobalAdmin) {
                   if (allowedStr) {
                       if (allowedInstances.length === 0) return false; // Agente sem instâncias -> nada
                       if (!allowedInstances.includes(effectiveInstanceId)) return false; // Bloqueado
                   } else {
                       return false; // Bloqueado por falta de config
                   }
               }
               return true;
           });

           set((s) => {
               const newContacts = [...s.contacts];
               
               validConvs.forEach(conv => {
                  const dbC = validContacts.find(c => c.id === conv.contact_id);
                  if (!dbC) return; // Segurança extra

                  const phoneMatch = dbC.phone || (dbC.whatsapp_jid ? dbC.whatsapp_jid.split('@')[0] : null);
                  const compositeId = dbC.id + '_' + (conv.instance_id || dbC.instance_id || 'default');
                  const idx = newContacts.findIndex(c => 
                      c.id === compositeId || 
                      c.id === dbC.id // also match the raw UUID to upgrade it!
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
                        id: compositeId,
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
                        conv_labels: conv.conversation_labels ? conv.conversation_labels.map((cl: any) => cl.tenant_labels).filter(Boolean) : [],
                        instance_id: conv.instance_id || dbC.instance_id || null,
                        conv_id: conv.id
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
                        id: compositeId,
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
                        instance_id: conv.instance_id || dbC.instance_id || null,
                        conv_id: conv.id
                     });
                  }
               });
               const deduplicated: any[] = [];
               const seenIds = new Set();
               
               // Força que todos os contatos no estado tenham ID composto, para evitar bugs de state antigo
               const normalizedContacts = newContacts.map(c => {
                   if (!String(c.id).includes('_')) {
                       return { ...c, id: `${c.id}_${c.instance_id || 'default'}` };
                   }
                   return c;
               });

               // Mantém a ordem decrescente pra pegar sempre o mais recente em caso de duplicatas
               normalizedContacts.sort((a,b) => {
                  const tsA = a.timestamp || a.lastMsgTimestamp || 0;
                  const tsB = b.timestamp || b.lastMsgTimestamp || 0;
                  return tsB - tsA;
               });
               
               for (const c of normalizedContacts) {
                   if (!seenIds.has(c.id)) {
                       seenIds.add(c.id);
                       deduplicated.push(c);
                   }
               }
               
               return { contacts: deduplicated };
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

      const { data: tenantData } = await supabase.from('companies').select('*').eq('id', currentTenantId).maybeSingle();
      
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
             try {
                await fetchEngineStatus(currentTenantId, tenantData.evolution_api_instance, apiKey);
                set({ evolutionConnected: true, modalReason: null });
                get().fetchInitialData();
             } catch (e) {
                set({ evolutionConnected: false, modalReason: 'Servidor Node Offline - A API principal não está respondendo. O serviço pode estar em manutenção ou reiniciando.' });
             }
           } else if (instDataDB?.status === 'connecting') {
             set({ evolutionConnected: false });
           } else {
             try {
                await fetchEngineStatus(currentTenantId, tenantData.evolution_api_instance, apiKey);
                set({ evolutionConnected: false });
             } catch (e) {
                set({ evolutionConnected: false, modalReason: 'Servidor Node Offline - A API principal não está respondendo. O serviço pode estar em manutenção ou reiniciando.' });
             }
           }
        } else {
           set({ evolutionConnected: false });
        }
      }
    } catch (e) {
      console.error(e);
      set({ evolutionConnected: false, modalReason: 'Houve uma falha fatal na validação da sua empresa. Entre em contato com o suporte.' });
    }
  },

  updateTenantSettings: async (newSettings: any) => {
    const tenant = get().tenantInfo;
    if (!tenant) return;

    try {
      const currentSettings = tenant.settings || {};
      const mergedSettings = { ...currentSettings, ...newSettings };
      
      const { error } = await supabase
        .from('companies')
        .update({ settings: mergedSettings })
        .eq('id', tenant.id);

      if (error) throw error;

      await get().logOperation('UPDATE', 'companies', tenant.id, currentSettings, mergedSettings);

      set({ tenantInfo: { ...tenant, settings: mergedSettings } });
    } catch (error) {
      console.error('Erro ao atualizar configurações da conta:', error);
      throw error;
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
        
        // Puxa conversa pra este contato respeitando a instância!
        const localContact = get().contacts.find(c => c.id === contactId);
        const conv_id = localContact?.conv_id;
        let conv = null;

        if (conv_id) {
           const { data: convs } = await supabase.from('conversations').select('id, status').eq('id', conv_id).limit(1);
           if (convs && convs.length > 0) conv = convs[0];
        }

        if (!conv) {
            const { data: convs } = await supabase.from('conversations')
                  .select('id, status')
                  .eq('tenant_id', tenant.id)
                  .eq('contact_id', getRealContactId(contactId))
                  .eq('instance_id', instanceName)
                  .order('last_message_at', { ascending: false, nullsFirst: false })
                  .limit(1);
            
            conv = convs && convs.length > 0 ? convs[0] : null;
        }

        if (!conv) {
             // Em vez de inserir uma conversa vazia no banco e poluir o DB,
             // inicializamos a UI com array vazio.
             // A conversa será criada organicamente pelo Webhook no 1º envio/recebimento.
             const handleMapping = (messagesArray: any[]) => {
                 set((s) => {
                     const updated = [...s.contacts];
                     const idx = updated.findIndex(c => c.id === contactId);
                     if (idx !== -1) {
                         updated[idx] = {
                             ...updated[idx],
                             messages: messagesArray,
                             instance_id: instanceName,
                             conv_id: undefined
                         };
                     }
                     return { contacts: updated };
                 });
             };
             handleMapping([]);
             return;
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
           // 2. Ordenar cronologicamente ASCENDENTE e extrair timestamp real
           // O array bruto pode vir fora de ordem. Convertendo para ms caso haja epoch.
           const mappedMsgs = messagesArray.map(m => {
               const advanced = parseAdvancedMsgMetadata(m);
               const realTimestamp = new Date(m.timestamp);

               return {
                   id: m.id,
                   whatsapp_id: m.whatsapp_message_id,
                   text: advanced.text || m.text_content,
                   sender: m.sender_type,
                   mediaUrl: m.media_url,
                   mediaType: advanced.mediaType,
                   status: m.status,
                   timestamp: realTimestamp,
                   quoted: advanced.quoted,
                   buttons: advanced.buttons,
                   transcription: m.transcription,
                   vcardWaid: advanced.vcardWaid,
                   payload: m.payload
               };
           });

           // Garante a ordenação temporal estrita (a mais antiga primeiro, a mais nova por último)
           mappedMsgs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
           
           // 3. Deduplicar baseando-se no whatsapp_message_id e limpar msgs com problemas temporais
           const uniqueMsgs: any[] = [];
           const seenWaIds = new Set();
           for (const m of mappedMsgs) {
               if (m.whatsapp_id) {
                   if (seenWaIds.has(m.whatsapp_id)) continue;
                   seenWaIds.add(m.whatsapp_id);
               }
               uniqueMsgs.push(m);
           }

           set((s) => {
              const updated = [...s.contacts];
              const idx = updated.findIndex(c => c.id === contactId);
              if (idx !== -1) {
                  updated[idx] = {
                      ...updated[idx],
                      unread: 0,
                      messages: uniqueMsgs
                  };
              }
              return { contacts: updated };
           });
        };

        if (forceSync) {
            // Conversa tem base, prossegue com o sync on demand
            if (!get().isSyncingHistory[contactId]) {
                set((s) => ({ isSyncingHistory: { ...s.isSyncingHistory, [contactId]: true } }));
                try {
                    const API_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
                    const { data: instDataDB } = await supabase.from('whatsapp_instances').select('api_key').eq('id', instanceName).single();
                    const res = await fetch(`${API_URL}/api/v1/conversations/${conv.id}/sync-history`, {
                        method: 'POST',
                        headers: { 
                           'Content-Type': 'application/json',
                           'x-tenant-id': tenant.id,
                           'apikey': instDataDB?.api_key || ''
                        },
                        body: JSON.stringify({ instanceId: instanceName, count: 100, limit: 100 })
                    });
                    
                    const result = await res.json();
                    if (!res.ok) {
                        useDevStore.getState().addLog({
                            type: 'error',
                            message: `[History Sync] Erro no gateway ao solicitar histórico da API (Status ${res.status}).`,
                            source: 'ChatStore',
                            details: result
                        });
                        alert('Falha técnica ao solicitar histórico. Uma notificação detalhada foi salva no Antigravity Dev Logger.');
                    } else {
                        // O gateway do Node despacha a History Sync que entra numa fila assíncrona.
                        // Vamos aguardar 5 segundos para que as mensagens cheguem e sejam atualizadas pelo Realtime (no on('postgres_changes')).

                        // Mostramos um alert informativo (mas como é bloqueante, vamos só confiar no spinner).
                        await new Promise(r => setTimeout(r, 6000));
                        
                        const currentMsgsLength = (msgs && msgs.length) || 0;
                        const newLimit = currentMsgsLength + 100;

                        // Atualiza a vista atual caso algo não tenha vindo pelo realtime ou pra forçar atualização
                        const { data: fetchNewMsgs, error: fetchErr } = await supabase.from('messages')
                           .select('*')
                           .eq('tenant_id', tenant.id)
                           .eq('conversation_id', conv.id)
                           .order('timestamp', { ascending: false })
                           .limit(newLimit);
                           
                        const newMsgsLength = fetchNewMsgs ? fetchNewMsgs.length : 0;
                        
                        if (!fetchNewMsgs || newMsgsLength === 0 || newMsgsLength <= currentMsgsLength) {
                            // Removido o alert bloqueante pois o backend pode levar mais de 6 segundos para inserir o histórico no banco de dados
                            useDevStore.getState().addLog({
                                type: 'warn',
                                message: `[History Sync] Operação de busca aguardou 6s. Os dados podem não ter sido salvos ainda ou não há mais histórico disponível.`,
                                source: 'ChatStore',
                                details: { 
                                    erroSupabase: fetchErr, 
                                    mensagensRetornadas: newMsgsLength, 
                                    mensagensAtuais: currentMsgsLength,
                                    instancia: instanceName
                                }
                            });
                        } else {
                            useDevStore.getState().addLog({
                                type: 'success',
                                message: `[History Sync] Busca finalizada e novas mensagens renderizadas!`,
                                source: 'ChatStore',
                                details: { fetchCount: newMsgsLength }
                            });
                        }
                           
                        if (fetchNewMsgs) handleMapping(fetchNewMsgs);
                    }
                } catch (err: any) {
                    useDevStore.getState().addLog({
                            type: 'error',
                            message: `[History Sync] Exceção crítica ao tentar carregar histórico. Possível falha de rede/proxy no VITE_WHATSAPP_ENGINE_URL.`,
                            source: 'ChatStore',
                            details: err?.message || String(err)
                        });
                        console.error("Falha ao sincronizar histórico da Baileys (on demand):", err);
                    } finally {
                        set((s) => ({ isSyncingHistory: { ...s.isSyncingHistory, [contactId]: false } }));
                    }
                }
        }
        
        // Sempre deve remapear o que tem em banco seja do forceSync atualizado ou se cair apenas no fallback
        if (!forceSync && msgs) {
           handleMapping(msgs);
        }
    } catch(err) {
        console.error("Erro carregando history:", err);
    }
  },

  fetchTenantAgents: async () => {
    const tenantId = get().tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
    if (!tenantId) return;
    try {
      const { data: agentsData, error } = await supabase.from('tenant_users').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: true });
      if (error) throw error;
      set({ agents: agentsData || [] });
    } catch (e) {
      console.error('Erro ao buscar agentes:', e);
    }
  },

  createAgent: async (payload) => {
    const tenantId = get().tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
    if (!tenantId) return;
    try {
      // Gera um UUID local para o user_id provisório
      const { v4: uuidv4 } = await import('uuid');
      const tempUserId = uuidv4();
      const { error } = await supabase.from('tenant_users').insert([{
        tenant_id: tenantId,
        user_id: tempUserId,
        role: payload.role,
        full_name: payload.full_name,
        email: payload.email,
        password: payload.password,
        allowed_instances: payload.allowed_instances || [],
        allowed_companies: payload.allowed_companies || [],
        signature: payload.signature || null,
        use_signature: payload.use_signature || false
      }]);
      if (error) throw error;
      await get().fetchTenantAgents();
    } catch (e) {
      console.error('Erro ao criar agente:', e);
      throw e;
    }
  },

  updateAgent: async (id, payload) => {
    const tenantId = get().tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
    if (!tenantId) return;
    try {
      const { error } = await supabase.from('tenant_users').update({
        role: payload.role,
        full_name: payload.full_name,
        email: payload.email,
        password: payload.password,
        allowed_instances: payload.allowed_instances || [],
        allowed_companies: payload.allowed_companies || [],
        signature: payload.signature !== undefined ? payload.signature : null,
        use_signature: payload.use_signature !== undefined ? payload.use_signature : false
      }).eq('id', id).eq('tenant_id', tenantId);
      
      if (error) throw error;

      // Update storage if the updated agent is the currently logged in user
      const currentEmail = localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email');
      if (currentEmail === payload.email) {
          const allowedStr = JSON.stringify(payload.allowed_instances || []);
          if (localStorage.getItem('current_user_email')) {
              localStorage.setItem('allowed_instances', allowedStr);
          }
          if (sessionStorage.getItem('current_user_email')) {
              sessionStorage.setItem('allowed_instances', allowedStr);
          }
          window.location.reload();
      }

      await get().fetchTenantAgents();
    } catch (e) {
      console.error('Erro ao atualizar agente:', e);
      throw e;
    }
  },

  deleteAgent: async (id) => {
    const tenantId = get().tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
    if (!tenantId) return;
    try {
      const { error } = await supabase.from('tenant_users').delete()
        .eq('id', id).eq('tenant_id', tenantId);
      
      if (error) throw error;
      await get().fetchTenantAgents();
    } catch (e) {
      console.error('Erro ao deletar agente:', e);
      throw e;
    }
  },

  updateAgentProfile: async (fullName, signature, use_signature) => {
    const tenantId = get().tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
    if (!tenantId) return;
    try {
      const currentUserEmail = localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email');
      if (!currentUserEmail) return;

      let me = get().agents.find(a => a.email && a.email.toLowerCase() === currentUserEmail.toLowerCase());
      
      if (!me) {
          const { data: dbMe } = await supabase.from('tenant_users')
              .select('id')
              .eq('email', currentUserEmail)
              .eq('tenant_id', tenantId)
              .limit(1)
              .maybeSingle();
          if (dbMe) me = dbMe as any;
      }
      
      if (!me) {
          // Criar on the fly para o Owner (Company Admin)
          const { v4: uuidv4 } = await import('uuid');
          const tempUserId = uuidv4();
          const { data: newMe, error: insertErr } = await supabase.from('tenant_users').insert([{
             tenant_id: tenantId,
             user_id: tempUserId,
             role: 'admin',
             full_name: fullName,
             email: currentUserEmail,
             signature: signature,
             use_signature: use_signature
          }]).select('id').single();
          
          if (insertErr) throw insertErr;
          me = newMe as any;
      } else {
          const { error } = await supabase.from('tenant_users')
              .update({ full_name: fullName, signature: signature, use_signature: use_signature })
              .eq('tenant_id', tenantId)
              .eq('id', me.id);
          
          if (error) throw error;
      }
      
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
      const realContactId = getRealContactId(contactId);
      const instId = getInstanceIdFromContact(contactId);
      let query = supabase.from('conversations').select('id').eq('contact_id', realContactId).eq('tenant_id', tenant.id);
      if (instId && instId !== 'default') query = query.eq('instance_id', instId);
      const { data: conv } = await query.order('last_message_at', { ascending: false }).limit(1).single();
      if (!conv) return;

      const { error } = await supabase.from('conversations').update(payload).eq('id', conv.id);
      if (error) throw error;

      if ('assigned_to' in payload && payload.assigned_to) {
          let agentName = 'Agente';
          const agent = get().agents.find(a => a.id === payload.assigned_to);
          if (agent && agent.full_name) agentName = agent.full_name;
          
          const msgText = `🎫 Atribuído para ${agentName} dia ${new Date().toLocaleString('pt-BR')}`;
          const dbMsg = {
             conversation_id: conv.id,
             tenant_id: tenant.id,
             text_content: msgText,
             sender_type: 'system',
             direction: 'outgoing',
             timestamp: new Date().toISOString(),
             status: 'sent',
             instance_id: instId && instId !== 'default' ? instId : null
          };
          
          // Inserir silenciosamente (sem throw, erro de log não quebra update)
          await supabase.from('messages').insert(dbMsg);
          
          // Refletir na UI
          const pseudoId = 'system-assign-' + Date.now();
          get().addMessageLocally(contactId, { id: pseudoId, text: msgText, sender: 'system', timestamp: new Date() });
      }
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
        let convInstanceId = m.instance_id || null;
        
        // BARREIRA DE INSTÂNCIA: Bloqueia injeção de mensagens de outras caixas na UI atual
        const currentActiveFilter = get().activeChannelFilter;
        if (currentActiveFilter && currentActiveFilter !== 'default' && currentActiveFilter !== 'all') {
            if (convInstanceId && convInstanceId !== currentActiveFilter) {
                 console.log(`[Realtime Barreira] Ignorando msg INSERT da instância ${convInstanceId} na visualização ativa ${currentActiveFilter}`);
                 return;
            }
        }
        
        const currentState = get();
        let targetContactLocally = null;

        // OTIMIZAÇÃO: Evita 2 requests HTTP REST síncronos na hora do render
        if (m.conversation_id) {
             targetContactLocally = currentState.contacts.find((c: any) => c.conv_id === m.conversation_id);
             if (targetContactLocally) {
                 targetContactId = targetContactLocally.id.split('_')[0]; // real id
                 convInstanceId = targetContactLocally.instance_id;
             } else {
                 const { data: conv } = await supabase.from('conversations').select('contact_id, instance_id').eq('id', m.conversation_id).single();
                 if (conv) {
                     targetContactId = conv.contact_id;
                     convInstanceId = conv.instance_id;
                 }
             }
        }

        if (!targetContactId && m.contact_id) targetContactId = m.contact_id;
        if (!targetContactId) return;

        let cData = null;
        if (!targetContactLocally) {
             const { data } = await supabase.from('contacts').select('*').eq('id', targetContactId).single();
             cData = data;
             if (!cData) return;
        } else {
             cData = { ...targetContactLocally };
             cData.id = targetContactId;
        }

        // CRITICAL FIX: O contato local deve assumir a instância da conversa ativa para não sumir da caixa correta
        const effectiveInstanceId = convInstanceId || cData.instance_id;
        cData.instance_id = effectiveInstanceId;

        // RBAC: Verifica se o contato que recebeu a msg é de uma instância que o Agente tem acesso
        const roleStr = typeof window !== 'undefined' ? (sessionStorage.getItem('current_user_role') || localStorage.getItem('current_user_role')) : null;
        const allowedStr = typeof window !== 'undefined' ? (sessionStorage.getItem('allowed_instances') || localStorage.getItem('allowed_instances')) : null;
        const isGlobalAdmin = roleStr === 'owner' || roleStr === 'admin';
        if (!isGlobalAdmin) {
            if (allowedStr) {
                try { 
                    const allowedInstances = JSON.parse(allowedStr); 
                    if (Array.isArray(allowedInstances) && allowedInstances.length > 0) {
                        if (!effectiveInstanceId || !allowedInstances.includes(effectiveInstanceId)) return;
                    } else {
                        return; // Agents with no allowed instances get nothing
                    }
                } catch(e) {}
            } else {
                return; // Bloqueado por falta de config
            }
        }

        const expectedCompositeId = targetContactId + '_' + (effectiveInstanceId || 'default');

        if (!targetContactLocally) {
             targetContactLocally = currentState.contacts.find((c: any) => 
                 c.id === expectedCompositeId ||
                 (
                     ((c.whatsapp_jid && c.whatsapp_jid === cData.whatsapp_jid) || (c.phone && c.phone === cData.phone)) &&
                     (c.instance_id === effectiveInstanceId || (!c.instance_id && effectiveInstanceId === 'default'))
                 )
             );
        }
        
        if (!targetContactLocally) {
           get().upsertContactLocally(cData as any);
        }

        const cid = targetContactLocally ? targetContactLocally.id : expectedCompositeId;

        const isBlocked = cData.is_blocked || (targetContactLocally && targetContactLocally.is_blocked);
        if (isBlocked) {
            console.log(`[Realtime] Mensagem ignorada silenciosamente (Contato Bloqueado). CID: ${cid}`);
            return;
        }

        const advanced = parseAdvancedMsgMetadata(m);

        // Verifica automações
        let isIgnored = false;
        let isIgnoredSilent = false;
        
        const activeAutomations = get().automations.filter((auto: any) => auto.is_active && m.text_content);
        
        for (const auto of activeAutomations) {
           const patternText = auto.condition_text || auto.keyword || '';
           if (!patternText) continue;
           
           // Escapa caracteres especiais de regex
           const escapedPattern = patternText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
           // Substitui o (X) escapado por um grupo de captura (.*) que pega até o final da linha
           const finalPattern = escapedPattern.replace(/\\\(X\\\)/ig, '(.*)');
           // Flag 'i' para case-insensitive, 'm' para tratar múltiplas linhas (^ e $ funcionam por linha)
           const regex = new RegExp(finalPattern, 'im');
           const match = m.text_content.match(regex);
           
           if (match) {
               if (['ignore', 'ignore_message', 'ignore_message_silent'].includes(auto.action_type)) {
                   isIgnored = true;
                   if (auto.action_type === 'ignore_message_silent') isIgnoredSilent = true;
               } else if (auto.action_type === 'extract_contact_name') {
                   // O grupo 1 (se houver) conterá o valor extraído de (X)
                   const extractedVal = match.length > 1 ? match[1] : match[0];
                   const extractedName = extractedVal?.trim();
                   
                   // Atualiza o nome apenas se for válido e diferente do vazio
                   if (extractedName && extractedName.length > 1 && cid) {
                       console.log(`[Automation] Extraindo e salvando nome do contato: ${extractedName}`);
                       // Executa assincronamente sem bloquear o canal do Realtime
                       setTimeout(() => {
                           get().updateContactCRM(cid, { name: extractedName });
                       }, 200);
                   }
               }
           }
        }

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
          vcardWaid: advanced.vcardWaid,
          isIgnored: isIgnored,
          isIgnoredSilent: isIgnoredSilent,
          payload: m.payload
        });

        // Reordena o card pra cima e joga notificação +1 Unread caso a aba não seja ele
        set((s) => {
           const u = [...s.contacts];
           const i = u.findIndex(c => c.id === cid);
           if (i !== -1) {
              const updatedContact = { ...u[i] };
              
              if (!isIgnored) {
                 const msgTimestamp = new Date(m.timestamp).getTime();
                 const isHistorical = (Date.now() - msgTimestamp) > (5 * 60000); // Mais de 5 minutos = histórico
                 const currentLastMsgTs = updatedContact.lastMsgTimestamp || 0;
                 
                 // Garante que uma mensagem velha não sobrescreva o último lastMsgTimestamp caso existam msg mais novas
                 if (msgTimestamp > currentLastMsgTs) {
                     updatedContact.lastMsgTimestamp = msgTimestamp;
                 }
                 
                 const isClient = (m.sender_type === 'client' || !m.sender_type);
                 
                 // Impede notificação/Unread em mensagens antigas de sincronismo de histórico
                 if (isClient && !isHistorical) {
                     if (s.activeChatId !== cid) {
                         updatedContact.unread = (updatedContact.unread || 0) + 1;
                     }
                     
                     if (!isIgnoredSilent) {
                         if (effectiveInstanceId) {
                             supabase.from('whatsapp_instances').select('notification_sound').eq('id', effectiveInstanceId).single()
                               .then(({ data }) => {
                                   playNotificationSound(data?.notification_sound || 'default');
                               }).catch(() => {
                                   playNotificationSound('default');
                               });
                         } else {
                             playNotificationSound('default');
                         }
                     }
                 }
              }
              
              u[i] = updatedContact;
           }
           
           // Se o lastMsgTimestamp foi atualizado, reordena a lista de contatos para o contato correto subir,
           // ou descer, se for o caso. (Nossa view na sidebar renderiza baseado no timestamp)
           u.sort((a, b) => {
              const tsA = a.timestamp || a.lastMsgTimestamp || 0;
              const tsB = b.timestamp || b.lastMsgTimestamp || 0;
              return tsB - tsA;
           });
           
           return { contacts: u };
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `tenant_id=eq.${tenantId}` }, async (payload) => {
        const m = payload.new as any;

        // BARREIRA DE INSTÂNCIA: Bloqueia UPDATEs irrelevantes
        const currentActiveFilter = get().activeChannelFilter;
        if (currentActiveFilter && currentActiveFilter !== 'default' && currentActiveFilter !== 'all') {
            if (m.instance_id && m.instance_id !== currentActiveFilter) {
                 return;
            }
        }

        console.log('[Realtime] Message UPDATE:', m);
        set((s) => {
           const updatedContacts = [...s.contacts];
           // Tenta achar com fallback iterando as mensagens para bypassar conversa ausente no state.
           for (let i = 0; i < updatedContacts.length; i++) {
              if (!updatedContacts[i].messages) continue;
              const msgIndex = updatedContacts[i].messages.findIndex(msg => msg.id === m.id || (m.whatsapp_message_id && msg.whatsapp_id === m.whatsapp_message_id));
              if (msgIndex !== -1) {
                  const newMessages = [...updatedContacts[i].messages];
                  newMessages[msgIndex] = { 
                    ...newMessages[msgIndex], 
                    status: m.status,
                    ...(m.text_content !== undefined && { text_content: m.text_content })
                  };
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
         
         get().setInstanceStatus(inst.id, inst.status);

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
                           
                           // Check if the backend is actually down or if it's just WhatsApp disconnected
                           try {
                              const { fetchEngineStatus } = await import('../services/whatsappEngine');
                              await fetchEngineStatus(t.id, inst.id, inst.api_key || '');
                              set({ evolutionConnected: false, modalReason: 'A conexão com seu WhatsApp caiu. Escaneie o QR Code novamente para reconectar.' });
                           } catch (err) {
                              set({ evolutionConnected: false, modalReason: 'Servidor Node Offline - A API principal parou de responder. Tentando reconectar...' });
                           }
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
