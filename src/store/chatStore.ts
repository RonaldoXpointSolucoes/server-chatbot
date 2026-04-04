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
  
  setEvolutionConnection: (status, instanceName) => set((state) => {
    if (status && instanceName) {
      localStorage.setItem('@ChatBoot:evolutionInstance', instanceName);
    } else if (!status) {
      localStorage.removeItem('@ChatBoot:evolutionInstance');
    }
    return { 
      evolutionConnected: status, 
      connectedInstanceName: status && instanceName ? instanceName : (status ? state.connectedInstanceName : null) 
    };
  }),

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
      // 1. Manda pra Evolution e deixa o webhook N8N replicar pro Supabase!
      await sendTextMessage(instanceName, contact.evolution_remote_jid, text);
      
    } catch(err) {
      console.error(err);
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
      // 1. Upload pro Supabase
      const fileExt = file.name.split('.').pop();
      const fileName = `${state.tenantInfo.id}/${contactId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('chat_media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Pegar URL Publica
      const { data: { publicUrl } } = supabase.storage.from('chat_media').getPublicUrl(fileName);

      // Atualiza o local message com o public url
      set((s) => ({
        contacts: s.contacts.map(c => c.id === contactId ? {
          ...c,
          messages: c.messages.map(m => m.id === pseudoId ? { ...m, mediaUrl: publicUrl } : m)
        } : c)
      }));

      // 2. Enviar via Evolution API
      const { sendMediaMessage, sendWhatsAppAudio } = await import('../services/whatsappEngine');
      
      if (mediaType === 'audio') {
        await sendWhatsAppAudio(instanceName, contact.evolution_remote_jid, publicUrl);
      } else {
        await sendMediaMessage(instanceName, contact.evolution_remote_jid, mediaType, publicUrl, file.type, file.name);
      }

    } catch (err) {
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
      const contactPhoneMatch = contact.phone || (contact.evolution_remote_jid ? contact.evolution_remote_jid.split('@')[0] : null);

      let targetIndex = state.contacts.findIndex(c => 
         c.id === contact.id ||
         c.evolution_remote_jid === contact.evolution_remote_jid || 
         c.phone === contactPhoneMatch
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
          lastMsgTimestamp: Date.now()
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
    // 1. Puxa os contatos nativos do Tenant Atual no DB p/ os UUIDs e Nomes Oficiais serem os reais (sem duplicatas baseada em temp-)
    const tenant = get().tenantInfo;
    if (!tenant) return;

    try {
       const { data: dbContacts } = await supabase.from('contacts').select('*').eq('tenant_id', tenant.id);
       if (dbContacts && dbContacts.length > 0) {
           // Injeta inteligentemente todos os dbContacts no store, preservando quem ja existia
           set((s) => {
               const newContacts = [...s.contacts];
               
               dbContacts.forEach(dbC => {
                  const phoneMatch = dbC.phone || (dbC.evolution_remote_jid ? dbC.evolution_remote_jid.split('@')[0] : null);
                  const idx = newContacts.findIndex(c => 
                     c.id === dbC.id || 
                     c.evolution_remote_jid === dbC.evolution_remote_jid || 
                     c.phone === phoneMatch
                  );
                  
                  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(dbC.name || dbC.phone)}&background=random&color=fff`;

                  if (idx !== -1) {
                     // Atualiza os dados base, mas preserva mensagens e avatar se for real
                     const existing = newContacts[idx];
                     newContacts[idx] = {
                        ...existing,
                        ...dbC,
                        id: dbC.id, // garante ID real do banco
                        name: dbC.name || existing.name,
                        avatar: existing.avatar?.includes('ui-avatars') ? fallbackAvatar : (existing.avatar || fallbackAvatar)
                     };
                  } else {
                     // Insere fresco
                     newContacts.push({
                        ...dbC,
                        avatar: fallbackAvatar,
                        messages: [],
                        unread: 0,
                        lastMsgTimestamp: new Date(dbC.created_at).getTime()
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

        // Se o banco ja sabe o nome da instancia pre-cadastrada dessa empresa, iniciamos o sync via api
        if (tenantData.evolution_api_instance) {
           const { getInstanceConnectionState } = await import('../services/whatsappEngine');
           const state = await getInstanceConnectionState(tenantData.evolution_api_instance);
           if (state?.instance?.state === 'open') {
             set({ evolutionConnected: true });
             get().syncEvolutionContacts(tenantData.evolution_api_instance);
           } else {
             // Cai pro modal mas de forma justificada
             set({ evolutionConnected: false, modalReason: 'A conexão com seu WhatsApp foi encerrada ou expirada de forma remota. Por favor, conecte novamente relendo o QR Code.' });
           }
        } else {
           // Nenhuma instnacia na base, empresa recem-chegada
           set({ evolutionConnected: false, modalReason: 'Seja bem-vindo a sua plataforma! Crie a primeira conexão do seu número de WhatsApp comercial agora mesmo.' });
        }
      }
    } catch (e) {
      console.error('Erro pegando config SaaS', e);
    }
  },

  updateTenantInstance: async (newInst: string) => {
    const tenant = get().tenantInfo;
    if (!tenant) return;
    
    // Salva globalmente no SaaS Database que a empresa X está operando pela instância Y
    await supabase.from('companies').update({ evolution_api_instance: newInst }).eq('id', tenant.id);
    
    set({ 
       connectedInstanceName: newInst, 
       tenantInfo: { ...tenant, evolution_api_instance: newInst },
       modalReason: null
    });
  },

  setModalReason: (reason) => {
    set({ modalReason: reason });
  },

  syncEvolutionContacts: async (instanceName) => {
    try {
      const { fetchRecentChats } = await import('../services/whatsappEngine');
      const chats = await fetchRecentChats(instanceName);
      if(!chats || !Array.isArray(chats)) return;

      // Mapeia histórico da Evolution e injeta nativamente na UI
      set((currentState) => {
         const updatedContacts = [...currentState.contacts];
         
         chats.forEach((chat) => {
             const remoteJid = chat.remoteJid || chat.id;
             if(!remoteJid || (!remoteJid.includes('@s.whatsapp.net') && !remoteJid.includes('@g.us'))) return;
             
             const phone = remoteJid.split('@')[0];
             let existingIndex = updatedContacts.findIndex(c => 
                c.evolution_remote_jid === remoteJid || 
                (c.phone && c.phone === phone)
             );

             // Tenta pegar o nome de exibição do Wpp ou formata o telefone
             let finalName = chat.pushName || chat.name;
             if (!finalName) {
                if (phone.startsWith('55') && phone.length >= 12) {
                  finalName = `+55 (${phone.substring(2,4)}) ${phone.substring(4, phone.length - 4)}-${phone.substring(phone.length - 4)}`;
                } else {
                  finalName = phone;
                }
             }

             // Tenta pegar a foto de perfil real armazenada no cache da evolution ou usa iniciais do nome
             const realAvatar = chat.profilePicUrl || chat.profilePictureUrl || chat.picture;
             const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(finalName)}&background=random&color=fff`;

             // Tenta resgatar a ultima mensagem real pra nao ficar texto vazio ou mock
             let lastMsgText = "Nova conversa...";
             const lm = chat.lastMessage?.message || chat.message;
             if (lm) {
                lastMsgText = lm.conversation || lm.extendedTextMessage?.text || lm.text || (lm.videoMessage ? "📷 Vídeo" : lm.imageMessage ? "📷 Imagem" : lm.audioMessage ? "🎵 Áudio" : lastMsgText);
             }

             const rawTimestamp = chat.lastMessage?.messageTimestamp 
                ? chat.lastMessage.messageTimestamp * 1000 
                : chat.updatedAt ? new Date(chat.updatedAt).getTime() : Date.now();

             if(existingIndex === -1) {
                updatedContacts.push({
                    id: chat.id || `temp-${remoteJid}`, // ID temporario pro UI
                    tenant_id: 'local',
                    name: finalName,
                    phone,
                    evolution_remote_jid: remoteJid,
                    bot_status: 'active',
                    created_at: new Date().toISOString(),
                    avatar: realAvatar || fallbackAvatar,
                    messages: lastMsgText !== "Nova conversa..." ? [
                      { id: chat.lastMessage?.key?.id || `msg-${Date.now()}`, text: lastMsgText, sender: 'client', timestamp: new Date(rawTimestamp) }
                    ] : [],
                    unread: chat.unreadCount || 0,
                    lastMsgTimestamp: rawTimestamp
                });
             } else {
                // Atualiza o já existente
                const currentC = updatedContacts[existingIndex];
                updatedContacts[existingIndex] = {
                   ...currentC,
                   name: currentC.name === currentC.phone ? finalName : currentC.name, // Preserva nome nativo
                   avatar: realAvatar || fallbackAvatar, // Injeta a foto verdadeira do zap ou a inicial do nome corrigido
                   messages: currentC.messages.length === 0 && lastMsgText !== "Nova conversa..." 
                     ? [{ id: chat.lastMessage?.key?.id || `msg-${Date.now()}`, text: lastMsgText, sender: 'client', timestamp: new Date(rawTimestamp) }] 
                     : currentC.messages,
                   unread: chat.unreadCount || currentC.unread || 0,
                   lastMsgTimestamp: rawTimestamp
                };
             }
         });

         return { contacts: updatedContacts };
      });
      
    } catch(err) {
      console.warn("Erro ao sincronizar histórico nativo de chats:", err);
    }
  },

  loadHistoricalMessages: async (contactId, instanceName) => {
    const contact = get().contacts.find(c => c.id === contactId);
    if (!contact || !contact.evolution_remote_jid) return;

    try {
      const { fetchChatMessages, fetchProfilePicture } = await import('../services/whatsappEngine');
      // Pega a primeira pagina da evolution
      const remoteRecords = await fetchChatMessages(instanceName, contact.evolution_remote_jid, 1);
      
      // Busca inteligentemente a foto do usuario oficial via API Evolution, substituindo o mock (ui-avatars) se disponivel
      if (contact.avatar && contact.avatar.includes('ui-avatars.com')) {
         fetchProfilePicture(instanceName, contact.evolution_remote_jid).then(imgUrl => {
            if(imgUrl) {
               set((s) => {
                  const updated = [...s.contacts];
                  const idx = updated.findIndex(c => c.id === contactId);
                  if(idx !== -1) updated[idx].avatar = imgUrl;
                  return { contacts: updated };
               });
            }
         }).catch(e => console.warn("Avatar fetch ignored", e));
      }

      if (!remoteRecords || remoteRecords.length === 0) return;

      // Injeta apenas na Interface Visual (para não torrar o Supabase gravando o passado inteiro)
      set((state) => {
         const newContacts = [...state.contacts];
         const index = newContacts.findIndex(c => c.id === contactId);
         if(index === -1) return state;

         const currentMsgs = newContacts[index].messages;
         const historyMsgs: MessageType[] = [];

          // Evolution / baileys message record interpretation
          const dbMessagesToInsert: any[] = [];

          remoteRecords.forEach((msg: any) => {
             // Isolamento rigoroso para garantir que NUNCA mescle mensagens (redundância caso o backend retorne o histórico global)
             const msgRemoteJid = msg.key?.remoteJid || msg.remoteJid || msg.key?.remoteJidAlt;
             if (msgRemoteJid && msgRemoteJid !== contact.evolution_remote_jid && msgRemoteJid !== contact.evolution_remote_jid.replace('@s.whatsapp.net', '@lid')) return;

             const isFromMe = msg.key?.fromMe || msg.pushName === undefined;
             // Evolution v1 e v2 structures
             const textContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.textContent || msg.text || "";
             if(!textContent) return; // ignora midia no mvp
             
             const msgId = msg.key?.id || msg.id || msg.messageId;
             if(!msgId) return;

             // Se ja existe nao duplica na interface
             if(currentMsgs.some(m => m.whatsapp_id === msgId || m.id === msgId)) return;

             const timestamp = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000) : msg.createdAt ? new Date(msg.createdAt) : new Date();

             historyMsgs.push({
                id: msgId,
                whatsapp_id: msgId,
                text: textContent,
                sender: isFromMe ? 'human' : 'client', // No historico nativo tratamos human
                timestamp
             });

             // Prepara p/ gravar no DB (Sincronizando de fato o histórico com o PostgreSQL)
             if (!contact.id.includes('temp-')) {
                 dbMessagesToInsert.push({
                    contact_id: contact.id,
                    text_content: textContent,
                    sender_type: isFromMe ? 'human' : 'client',
                    whatsapp_id: msgId,
                    timestamp: timestamp.toISOString()
                 });
             }
          });

          if (dbMessagesToInsert.length > 0) {
             (async () => {
                try {
                  await supabase.from('messages').upsert(dbMessagesToInsert, { onConflict: 'whatsapp_id', ignoreDuplicates: true });
                  console.log('Histórico gravado no Supabase para', contact.name);
                } catch(e) {
                  console.warn(e);
                }
             })();
          }

          // Ordena cronologicamente e junta
          newContacts[index].messages = [...historyMsgs, ...currentMsgs].sort((a,b) => a.timestamp.getTime() - b.timestamp.getTime());

          return { contacts: newContacts };
       });
    } catch (err) {
      console.warn("Erro ao puxar histórico do wpp web", err);
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
        
        // Puxa o JID real do contato via UUID (já que o DB tem UUID mas a UI exibe instâncias por JID)
        const { data: contactRow } = await supabase.from('contacts').select('evolution_remote_jid').eq('id', m.contact_id).single();
        if(!contactRow || !contactRow.evolution_remote_jid) return;

        const currentState = get() as any;
        const targetContact = currentState.contacts.find((c: any) => c.evolution_remote_jid === contactRow.evolution_remote_jid);
        
        if (targetContact) {
            get().addMessageLocally(targetContact.id, {
              id: m.id,
              whatsapp_id: m.whatsapp_id,
              text: m.text_content,
              sender: m.sender_type,
              mediaUrl: m.media_url,
              mediaType: m.media_type,
              timestamp: new Date(m.timestamp)
            });

            // Reordena o card pra cima e joga notificação +1 Unread caso a aba não seja ele
            set((s) => {
               const u = [...s.contacts];
               const i = u.findIndex(c => c.id === targetContact.id);
               if (i !== -1) {
                  u[i].lastMsgTimestamp = new Date(m.timestamp).getTime();
                  if (s.activeChatId !== targetContact.id && m.sender_type !== 'bot' && m.sender_type !== 'human') {
                      u[i].unread = (u[i].unread || 0) + 1;
                  }
               }
               return { contacts: u };
            });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, async (payload) => {
        const m = payload.new as any;
        set((s) => {
           let updatedContacts = [...s.contacts];
           const cIndex = updatedContacts.findIndex(c => c.id === m.contact_id);
           if (cIndex !== -1) {
              const mIndex = updatedContacts[cIndex].messages.findIndex(msg => msg.id === m.id || msg.whatsapp_id === m.whatsapp_id);
              if (mIndex !== -1) {
                 updatedContacts[cIndex].messages[mIndex].status = m.status;
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
