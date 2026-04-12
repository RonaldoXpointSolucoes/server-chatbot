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
};

export type ContactType = ContactRow & {
  avatar: string;
  messages: MessageType[];
  unread: number;
  lastMsgTimestamp: number; // novo campo para ordernar realista
  is_pinned?: boolean;
  is_favorite?: boolean;
  conv_labels?: any[];
};

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
  modalReason: string | null;
  isSubscribed: boolean;
  isSyncingHistory: Record<string, boolean>;
  appVersion: { version: string, deploy_date: string } | null;
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
  uploadAndSendMedia: (contactId: string, file: File, mediaType: 'image' | 'video' | 'audio' | 'document', instanceName: string, isPtt?: boolean) => Promise<void>;
  updateContactCRM: (contactId: string, payload: Partial<ContactRow>) => Promise<void>;
  deleteContact: (contactId: string) => Promise<void>;
  togglePinContact: (contactId: string) => Promise<void>;
  toggleFavorite: (contactId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  fetchContactPicture: (contactId: string, jid: string, instanceName: string) => Promise<void>;
  // Opcional para as etiquetas
  // labels: any[];
  // fetchLabels: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  contacts: [],
  activeChatId: null,
  evolutionConnected: false,
  connectedInstanceName: null, // Será gerido unicamente via tenantInfo agora e não mais em localStorage para segurança SaaS
  tenantInfo: null,
  modalReason: null,
  isSubscribed: false, // Previne double-subscribe do react 18
  isSyncingHistory: {},
  appVersion: null,

  setActiveChat: (id) => set({ activeChatId: id }),

  // Envia via Evolution API e nao cadastra nativo, pois webhook vai assumir
  sendHumanMessage: async (contactId, text, instanceName) => {
    const state = get();
    const contact = state.contacts.find(c => c.id === contactId);
    if (!contact) return;
    
    // Atualiza otimista UI
    const pseudoId = 'optimistic-' + Math.random().toString();
    state.addMessageLocally(contactId, { id: pseudoId, text, sender: 'human', timestamp: new Date() });

    try {
      const { sendTextMessage } = await import('../services/whatsappEngine');
      // 1. Manda pra Baileys Engine Local
      if (!state.tenantInfo) return;
      
      const { data: instDataDB } = await supabase.from('whatsapp_instances').select('api_key').eq('id', instanceName).single();
      const apiKey = instDataDB?.api_key || '';

      await sendTextMessage(state.tenantInfo.id, instanceName, contact.whatsapp_jid || (contact.phone + '@s.whatsapp.net'), text, apiKey);
      
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

  uploadAndSendMedia: async (contactId, file, mediaType, instanceName, isPtt) => {
    const state = get();
    const contact = state.contacts.find(c => c.id === contactId);
    if (!contact || !state.tenantInfo) return;

    // Atualiza otimista (Render Instantâneo Premium)
    const pseudoId = 'optimistic-media-' + Math.random().toString();
    const tempUrl = URL.createObjectURL(file);
    state.addMessageLocally(contactId, { 
      id: pseudoId, 
      text: file.name, 
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
      if (file.name) formData.append('caption', file.name);
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

  fetchContactPicture: async (contactId, jid, instanceName) => {
    const state = get();
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
        const url = data.result;
        await supabase.from('contacts').update({ profile_picture_url: url }).eq('id', contactId);
        set((s) => ({
          contacts: s.contacts.map(c => c.id === contactId ? { ...c, avatar: url } : c)
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
          // Previne duplicados por ID do DB ou whatsapp_id
          if (c.messages.some(m => m.id === msg.id || (msg.whatsapp_id && m.whatsapp_id === msg.whatsapp_id))) return c;
          
          // Tratamento de UI otimista: varre se ja tem uma mensagem igualzinha de 'human'
          if (msg.sender === 'human') {
            const optIndex = c.messages.findIndex(m => String(m.id).startsWith('optimistic-') && m.text === msg.text);
            if (optIndex !== -1) {
              const updatedMsgs = [...c.messages];
              updatedMsgs[optIndex] = msg; // substitui pelo registro do Realtime com UUID real
              return { ...c, messages: updatedMsgs };
            }
          }
          
          return { ...c, messages: [...c.messages, msg] };
        }
        return c;
      })
    }));
  },

  upsertContactLocally: (contact) => {
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
        const finalName = finalCustomName || fallbackName;

        const updatedContact: ContactType = {
          ...existing,
          ...contact,
          id: finalId,
          custom_name: finalCustomName,
          name: finalName,
          // Preserva o fallback avatar se a api ou realtime nao devolver algo util
          avatar: (contact as any).avatar || existing.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(finalName || contactPhoneMatch || 'U')}&background=random&color=fff`,
        };

        const newContacts = [...state.contacts];
        newContacts[targetIndex] = updatedContact;
        return { contacts: newContacts };
      } else {
        // Contato novinho folha
        const finalName = contact.custom_name || contact.name;
        const newContact: ContactType = {
          ...contact,
          name: finalName,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(finalName || contact.phone)}&background=random&color=fff`, // Avatar ui-avatars idêntico ao Chatwoot
          messages: [],
          unread: 0,
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
      const dbPayload = { ...payload };
      if (payload.name) {
         dbPayload.custom_name = payload.name; // Proteção para a trigger DB e lógica interna
      }
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

  fetchInitialData: async () => {
    const tenant = get().tenantInfo;
    if (!tenant) return;

    try {
       // Opcional: Buscar versão atual do app a partir do banco (tabela app_version)
       const { data: appVersionData } = await supabase.from('app_version').select('*').order('deploy_date', { ascending: false }).limit(1).maybeSingle();
       if (appVersionData) {
         set({ appVersion: { version: appVersionData.version, deploy_date: appVersionData.deploy_date } });
       }

       // 1. Puxa as conversas recentes, garantindo a mesma ordem do WhatsApp Web
       const { data: dbConvs } = await supabase.from('conversations')
          .select('*')
          .eq('tenant_id', tenant.id)
          .order('is_pinned', { ascending: false })
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(300);
          
       if (!dbConvs || dbConvs.length === 0) return;

       const contactIds = dbConvs.map(cv => cv.contact_id);

       // 2. Puxa os contatos dessas conversas
       const { data: dbContacts } = await supabase.from('contacts')
           .select('*')
           .eq('tenant_id', tenant.id)
           .in('id', contactIds);

       if (dbContacts && dbContacts.length > 0) {
           // VALIDAÇÃO INTELIGENTE APPWEB: Filtra contatos que não tem telefone válido ou são LIDs de sistema (fantasma)
           const validContacts = dbContacts.filter(c => {
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
                  
                  let finalName = dbC.custom_name || dbC.name || dbC.push_name || phoneMatch || dbC.phone;
                  if (finalName && typeof finalName === 'string') {
                     const lname = finalName.toLowerCase();
                     if (lname.includes('x point') || lname.includes('x-point') || lname === 'empresa' || lname.includes('soluções')) {
                        finalName = phoneMatch || dbC.phone; // Falback para telefone para evitar "XS" e "X Point"
                     }
                  }
                  
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
                     const finalName = finalCustomName || dbC.name || existing.name;
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
                        timestamp: ts
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
      const currentTenantId = sessionStorage.getItem('current_tenant_id');
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
           set((s) => {
              const updated = [...s.contacts];
              const idx = updated.findIndex(c => c.id === contactId);
              if (idx !== -1) {
                  updated[idx].unread = 0;
                  updated[idx].messages = orderedMsgs.map(m => ({
                      id: m.id,
                      whatsapp_id: m.whatsapp_message_id,
                      text: m.text_content,
                      sender: m.sender_type,
                      mediaUrl: m.media_url,
                      mediaType: m.message_type,
                      status: m.status,
                      timestamp: new Date(m.timestamp)
                  }));
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

  subscribeToNewMessages: () => {
    const state = get() as any;
    if (state.isSubscribed) return; // React 18 protection
    set({ isSubscribed: true } as any);

    const channelName = 'realtime_chat';
    // HMR fallback: Remove o canal caso já exista no cache do Supabase Client para evitar "cannot add callback after subscribe"
    const existingChannel = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existingChannel) {
        supabase.removeChannel(existingChannel);
    }
    
    const channel = supabase.channel(channelName);
    
    // Escuta novas mensagens
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const m = payload.new as any;
        console.log('[Realtime] Message INSERT:', m);

        if (m.sender_type === 'bot' || m.sender_type === 'system') return; // Ignore echoes that don't need realtime sync

        let targetContactId = m.conversation_id ? null : m.contact_id;
        
        if (m.conversation_id && !targetContactId) {
             const { data: conv } = await supabase.from('conversations').select('contact_id').eq('id', m.conversation_id).single();
             if (conv) targetContactId = conv.contact_id;
        }

        if (!targetContactId) return;

        const { data: cData } = await supabase.from('contacts').select('*').eq('id', targetContactId).single();
        if (!cData) return;

        const currentState = get();
        const targetContactLocally = currentState.contacts.find((c: any) => c.id === targetContactId || (c.whatsapp_jid && c.whatsapp_jid === cData.whatsapp_jid) || c.phone === cData.phone);
        
        if (!targetContactLocally) {
           get().upsertContactLocally(cData as any);
        }

        const cid = targetContactLocally ? targetContactLocally.id : cData.id;

        get().addMessageLocally(cid, {
          id: m.id,
          whatsapp_id: m.whatsapp_message_id,
          text: m.text_content,
          sender: m.sender_type || 'client',
          mediaUrl: m.media_url,
          mediaType: m.message_type,
          status: m.status,
          timestamp: new Date(m.timestamp)
        });

        // Reordena o card pra cima e joga notificação +1 Unread caso a aba não seja ele
        set((s) => {
           let u = [...s.contacts];
           const i = u.findIndex(c => c.id === cid);
           if (i !== -1) {
              const updatedContact = { ...u[i] };
              updatedContact.lastMsgTimestamp = new Date(m.timestamp).getTime();
              if (s.activeChatId !== cid) {
                  updatedContact.unread = (updatedContact.unread || 0) + 1;
              }
              u[i] = updatedContact;
           }
           return { contacts: u };
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, async (payload) => {
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, (payload) => {
        if(payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
           get().upsertContactLocally(payload.new as ContactRow);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_instances' }, async (payload) => {
         const t = get().tenantInfo;
         if (!t || !t.evolution_api_instance) return;
         const inst = payload.new as any;
         
         // Sincroniza estado de conexao com o banco via Realtime
         if (inst.id === t.evolution_api_instance) {
            console.log('[Realtime] Instance Status Changed:', inst.status);
            if (inst.status === 'connected') {
               if (!get().evolutionConnected) {
                  set({ evolutionConnected: true, modalReason: null });
                  get().fetchInitialData();
               }
            } else if (inst.status === 'offline' || inst.status === 'connecting') {
               if (get().evolutionConnected) {
                  set({ evolutionConnected: false, modalReason: 'A conexão com seu WhatsApp caiu ou o servidor reiniciou. Tentando reconectar...' });
               }
            }
         }
      })
      .subscribe((_status, err) => {
         if (err) console.error("Realtime Error", err);
      });
  }
}));
