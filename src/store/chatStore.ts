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
  loadHistoricalMessages: (contactId: string, instanceName: string) => Promise<void>;
  
  // Local state updaters
  addMessageLocally: (contactId: string, msg: MessageType) => void;
  upsertContactLocally: (contact: ContactRow) => void;
  sendHumanMessage: (contactId: string, text: string, instanceName: string) => Promise<void>;
  uploadAndSendMedia: (contactId: string, file: File, mediaType: 'image' | 'video' | 'audio' | 'document', instanceName: string) => Promise<void>;
  updateContactName: (contactId: string, newName: string) => Promise<void>;
  deleteContact: (contactId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  contacts: [],
  activeChatId: null,
  evolutionConnected: false,
  connectedInstanceName: null, // Será gerido unicamente via tenantInfo agora e não mais em localStorage para segurança SaaS
  tenantInfo: null,
  modalReason: null,
  isSubscribed: false, // Previne double-subscribe do react 18
  

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
      await sendTextMessage(state.tenantInfo.id, instanceName, contact.whatsapp_jid || (contact.phone + '@s.whatsapp.net'), text);
      
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

  uploadAndSendMedia: async (contactId, file, mediaType, instanceName) => {
    const state = get();
    const contact = state.contacts.find(c => c.id === contactId);
    if (!contact || !state.tenantInfo) return;

    // Atualiza otimista (Sem URL ainda)
    const pseudoId = 'optimistic-media-' + Math.random().toString();
    state.addMessageLocally(contactId, { 
      id: pseudoId, 
      text: file.name, 
      sender: 'human', 
      mediaType: mediaType,
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

      // Chamada HTTP pro Node (único dono do upload Supabase e Baileys)
      const res = await fetch(`http://localhost:9000/api/v1/instances/${instanceName}/send-media`, {
        method: 'POST',
        headers: {
          'x-tenant-id': state.tenantInfo.id
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao processar mídia no servidor');

      if (data.media_url) {
        set((s) => ({
          contacts: s.contacts.map(c => c.id === contactId ? {
            ...c,
            messages: c.messages.map(m => m.id === pseudoId ? { ...m, mediaUrl: data.media_url } : m)
          } : c)
        }));
      }

    } catch (err: any) {
      console.error('Falha ao upar/enviar media:', err);
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
        const finalName = existing.name !== existing.phone && existing.name ? existing.name : contact.name; // Preserva o nome se já modificado/escolhido pelo usuário

        const updatedContact: ContactType = {
          ...existing,
          ...contact,
          id: finalId,
          name: finalName,
          // Preserva o fallback avatar se a api ou realtime nao devolver algo util
          avatar: (contact as any).avatar || existing.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(finalName || contactPhoneMatch || 'U')}&background=random&color=fff`,
        };

        const newContacts = [...state.contacts];
        newContacts[targetIndex] = updatedContact;
        return { contacts: newContacts };
      } else {
        // Contato novinho folha
        const newContact: ContactType = {
          ...contact,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name || contact.phone)}&background=random&color=fff`, // Avatar ui-avatars idêntico ao Chatwoot
          messages: [],
          unread: 0,
          // usa lastMsgTimestamp para a sidebar saber quem eh primeiro
          lastMsgTimestamp: new Date(contact.created_at || Date.now()).getTime()
        };
        return { contacts: [...state.contacts, newContact] };
      }
    });
  },

  updateContactName: async (contactId, newName) => {
    set((state) => ({
      contacts: state.contacts.map((c) => c.id === contactId ? { ...c, name: newName } : c)
    }));
    try {
      await supabase.from('contacts').update({ name: newName }).eq('id', contactId);
    } catch (e) {
      console.error('Erro ao renomear contato no DB:', e);
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

  fetchInitialData: async () => {
    const tenant = get().tenantInfo;
    if (!tenant) return;

    try {
       // Puxa contatos
       const { data: dbContacts } = await supabase.from('contacts').select('*').eq('tenant_id', tenant.id);
       
       // Puxa conversas do tenant ordernadas
       const { data: dbConvs } = await supabase.from('conversations').select('*').eq('tenant_id', tenant.id).order('last_message_at', { ascending: false });

       if (dbContacts && dbContacts.length > 0) {
           set((s) => {
               const newContacts = [...s.contacts];
               
               dbContacts.forEach(dbC => {
                  const phoneMatch = dbC.phone || (dbC.whatsapp_jid ? dbC.whatsapp_jid.split('@')[0] : null);
                  const idx = newContacts.findIndex(c => 
                     c.id === dbC.id || 
                     c.whatsapp_jid === dbC.whatsapp_jid || 
                     c.phone === phoneMatch
                  );
                  
                  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(dbC.name || dbC.phone)}&background=random&color=fff`;
                  
                  // Busca conversa associada a este contato
                  const conv = dbConvs?.find(cv => cv.contact_id === dbC.id);

                  const preview = conv?.last_message_preview || '';
                  const unread = conv?.unread_count || 0;
                  const ts = conv?.last_message_at ? new Date(conv.last_message_at).getTime() : new Date(dbC.created_at).getTime();

                  if (idx !== -1) {
                     const existing = newContacts[idx];
                     newContacts[idx] = {
                        ...existing,
                        ...dbC,
                        id: dbC.id,
                        name: dbC.name || existing.name,
                        avatar: existing.avatar?.includes('ui-avatars') ? fallbackAvatar : (existing.avatar || fallbackAvatar),
                        unread: unread,
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
                     newContacts.push({
                        ...dbC,
                        avatar: fallbackAvatar,
                        messages: preview ? [{ id: 'preview-' + conv.id, text: preview, sender: 'client', timestamp: new Date(ts) }] : [],
                        unread: unread,
                        lastMsgTimestamp: ts
                     });
                  }
               });

               return { contacts: newContacts };
           });
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
           const stateRes = await fetchEngineStatus(tenantData.id, tenantData.evolution_api_instance);
           
           if (stateRes?.data?.status === 'connected') {
             set({ evolutionConnected: true, modalReason: null });
             get().fetchInitialData();
           } else {
             const instData = stateRes?.data;
 
             if (instData && (instData.status === 'connected' || instData.status === 'connecting')) {
                await createInstance(tenantData.id, tenantData.evolution_api_instance).catch(() => {});
                set({ evolutionConnected: true, modalReason: null });
                get().fetchInitialData();
             } else {
                set({ evolutionConnected: false, modalReason: 'A conexão com seu WhatsApp foi encerrada ou expirada de forma remota. Por favor, conecte novamente relendo o QR Code.' });
             }
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

  loadHistoricalMessages: async (contactId, _instanceName) => {
    try {
        const tenant = get().tenantInfo;
        if (!tenant) return;
        
        // Puxa conversa pra este contato (mesmo que n exista msg)
        const { data: conv } = await supabase.from('conversations').select('id').eq('tenant_id', tenant.id).eq('contact_id', contactId).single();
        if (!conv) return;

        // Limpar unread 
        await supabase.from('conversations').update({ unread_count: 0 }).eq('id', conv.id);
        
        const { data: msgs } = await supabase.from('messages')
               .select('*')
               .eq('tenant_id', tenant.id)
               .eq('conversation_id', conv.id)
               .order('timestamp', { ascending: true })
               .limit(200);
               
        if (msgs) {
           set((s) => {
              const updated = [...s.contacts];
              const idx = updated.findIndex(c => c.id === contactId);
              if (idx !== -1) {
                  updated[idx].unread = 0;
                  updated[idx].messages = msgs.map(m => ({
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
        }
    } catch(err) {
        console.error("Erro carregando history:", err);
    }
  },

  subscribeToNewMessages: () => {
    const state = get() as any;
    if (state.isSubscribed) return; // React 18 protection
    set({ isSubscribed: true } as any);

    const channel = supabase.channel('realtime_chat');
    
    // Escuta novas mensagens
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const m = payload.new as any;
        if (m.sender_type === 'human' || m.sender_type === 'bot' || m.sender_type === 'system') return; // Ignore echoes already updated

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
              u[i].lastMsgTimestamp = new Date(m.timestamp).getTime();
              if (s.activeChatId !== cid) {
                  u[i].unread = (u[i].unread || 0) + 1;
              }
           }
           return { contacts: u };
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, async (payload) => {
        const m = payload.new as any;
        set((s) => {
           let updatedContacts = [...s.contacts];
           // Tenta achar com fallback iterando as mensagens para bypassar conversa ausente no state.
           for (let i = 0; i < updatedContacts.length; i++) {
              const msgIndex = updatedContacts[i].messages.findIndex(msg => msg.id === m.id || (m.whatsapp_message_id && msg.whatsapp_id === m.whatsapp_message_id));
              if (msgIndex !== -1) {
                  updatedContacts[i].messages[msgIndex].status = m.status;
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
      .subscribe((_status, err) => {
         if (err) console.error("Realtime Error", err);
      });
  }
}));
