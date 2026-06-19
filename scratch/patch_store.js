import fs from 'fs';
import path from 'path';

const filePath = path.resolve('src/store/chatStore.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Patch the Interface (regex to handle line endings)
const interfaceRegex = /assignLabelToConversation: \(contactId: string, labelId: string\) => Promise<void>;\r?\n\s*removeLabelFromConversation: \(contactId: string, labelId: string\) => Promise<void>;/;

const interfaceReplacement = `assignLabelToConversation: (contactId: string, labelId: string) => Promise<void>;
  removeLabelFromConversation: (contactId: string, labelId: string) => Promise<void>;
  syncConversationLabelsWithTags: (realContactId: string, tags: string[]) => Promise<void>;`;

if (!interfaceRegex.test(content)) {
  console.error("Erro: Interface target não encontrado!");
  process.exit(1);
}
content = content.replace(interfaceRegex, interfaceReplacement);
console.log("1. Assinatura da Interface adicionada com sucesso!");

// 2. Patch the Labels Implementation
const labelsRegex = /assignLabelToConversation: async \([\s\S]*?removeLabelFromConversation: async \([\s\S]*?\n {3,7}\},\r?\n/;

const labelsReplacement = `syncConversationLabelsWithTags: async (realContactId: string, tags: string[]) => {
      const state = get();
      const tenant = state.tenantInfo;
      if (!tenant) return;
      try {
        const { data: convs } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_id', realContactId)
          .eq('tenant_id', tenant.id);

        if (convs && convs.length > 0) {
          const convIds = convs.map(c => c.id);
          
          await supabase
            .from('conversation_labels')
            .delete()
            .in('conversation_id', convIds);

          if (tags && tags.length > 0) {
            const insertRows = convIds.flatMap(convId => 
              tags.map(tagId => ({
                conversation_id: convId,
                label_id: tagId
              }))
            );
            if (insertRows.length > 0) {
              await supabase.from('conversation_labels').insert(insertRows);
            }
          }
        }
      } catch (e) {
        console.error('Erro ao sincronizar labels de conversas', e);
      }
    },

    assignLabelToConversation: async (contactId: string, labelId: string) => {
       const state = get();
       const tenant = state.tenantInfo;
       if (!tenant) return;
       const conv = state.contacts.find(c => c.id === contactId);
       if (!conv) return;

       const realContactId = getRealContactId(contactId);

       const { data: contactData } = await supabase
         .from('contacts')
         .select('tags')
         .eq('id', realContactId)
         .single();

       let currentTags: string[] = [];
       if (contactData && Array.isArray(contactData.tags)) {
         currentTags = contactData.tags;
       }

       if (!currentTags.includes(labelId)) {
         currentTags = [...currentTags, labelId];
         await supabase
           .from('contacts')
           .update({ tags: currentTags })
           .eq('id', realContactId);
         
         await state.syncConversationLabelsWithTags(realContactId, currentTags);
       }

       await state.fetchInitialData();
    },

    removeLabelFromConversation: async (contactId: string, labelId: string) => {
       const state = get();
       const tenant = state.tenantInfo;
       if (!tenant) return;

       const realContactId = getRealContactId(contactId);

       const { data: contactData } = await supabase
         .from('contacts')
         .select('tags')
         .eq('id', realContactId)
         .single();

       if (contactData && Array.isArray(contactData.tags)) {
         const currentTags = contactData.tags;
         if (currentTags.includes(labelId)) {
           const updatedTags = currentTags.filter((t: string) => t !== labelId);
           await supabase
             .from('contacts')
             .update({ tags: updatedTags })
             .eq('id', realContactId);
           
           await state.syncConversationLabelsWithTags(realContactId, updatedTags);
         }
       }

       await state.fetchInitialData();
    },
`;

if (!labelsRegex.test(content)) {
  console.error("Erro: Regex de implementação de labels não condiz!");
  process.exit(1);
}
content = content.replace(labelsRegex, labelsReplacement);
console.log("2. Implementação das labels atualizada com sucesso!");

// 3. Patch the upsertContactLocally and updateContactCRM Implementation
const crmRegex = /upsertContactLocally: \(contact\) => \{[\s\S]*?updateContactCRM: async \(contactId, payload\) => \{[\s\S]*?\n {2,4}\},\r?\n/;

const crmReplacement = `upsertContactLocally: (contact) => {
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
    const isGroup = contact.whatsapp_jid?.endsWith('@g.us');
    if (contact.phone && contact.phone.length > 15 && !contact.phone.includes('+') && !isGroup) return;

    // BARREIRA DE INSTÂNCIA: Impede contatos vazando entre caixas via realtime
    const currentActiveFilter = get().activeChannelFilter;
    if (currentActiveFilter && currentActiveFilter !== 'default' && currentActiveFilter !== 'all') {
        if (contact.instance_id && contact.instance_id !== currentActiveFilter) {
            console.log(\`[Realtime Barreira] Ignorando contato da instância \${contact.instance_id} na visualização ativa \${currentActiveFilter}\`);
            return;
        }
    }

    set((state) => {
      // 1. Resolvemos os dois principais identificadores unicos independentes (JID ou Telefone Formatado/Puro)
      const contactPhoneMatch = contact.phone || (contact.whatsapp_jid ? contact.whatsapp_jid.split('@')[0] : null);
      const realContactId = getRealContactId(contact.id);

      let foundAny = false;
      const updatedContacts = state.contacts.map((c) => {
         const cRealId = getRealContactId(c.id);
         const isMatch = cRealId === realContactId ||
                         (c.whatsapp_jid && contact.whatsapp_jid && c.whatsapp_jid === contact.whatsapp_jid) ||
                         (c.phone && contactPhoneMatch && c.phone === contactPhoneMatch);
                         
         if (isMatch) {
            foundAny = true;
            const isExistingTemp = c.id.includes('temp-');
            const isNewTemp = contact.id.includes('temp-');
            
            const baseId = (!isExistingTemp) ? getRealContactId(c.id) : (!isNewTemp ? getRealContactId(contact.id) : c.id);
            // Preserva o composite ID original daquela caixa (se já tinha)
            const effectiveInstanceId = c.instance_id || contact.instance_id || 'default';
            const finalId = c.id.includes('_') ? c.id : (baseId.includes('temp-') ? baseId : \`\${baseId}_\${effectiveInstanceId}\`);
            
            const finalCustomName = c.custom_name || contact.custom_name;
            const fallbackName = c.name !== c.phone && c.name ? c.name : contact.name;
            
            const tname = get().tenantInfo?.name || '';
            let finalName = finalCustomName || fallbackName;
            finalName = sanitizeContactName(finalName, contactPhoneMatch || contact.phone, tname) || finalName;

            // Converter a coluna tags (array de IDs) em conv_labels usando tenantLabels da store
            const updatedTags = Array.isArray(contact.tags) ? contact.tags : (Array.isArray(c.tags) ? c.tags : []);
            const conv_labels = get().tenantLabels.filter(tl => updatedTags.includes(tl.id));

            return {
              ...c,
              ...contact,
              id: finalId,
              custom_name: finalCustomName,
              name: finalName,
              avatar: contact.profile_picture_url || contact.avatar || c.avatar || \`https://ui-avatars.com/api/?name=\${encodeURIComponent(finalName || contactPhoneMatch || 'U')}&background=random&color=fff\`,
              conv_labels: conv_labels
            };
         }
         return c;
      });

      if (!foundAny) {
         // Contato novinho folha
         const effectiveInstanceId = contact.instance_id || 'default';
         const compositeId = contact.id.includes('_') ? contact.id : \`\${contact.id}_\${effectiveInstanceId}\`;
         const tname = get().tenantInfo?.name || '';
         let finalName = contact.custom_name || contact.name;
         finalName = sanitizeContactName(finalName, contactPhoneMatch || contact.phone, tname) || finalName;
         
         const updatedTags = Array.isArray(contact.tags) ? contact.tags : [];
         const conv_labels = get().tenantLabels.filter(tl => updatedTags.includes(tl.id));

         const newContact: ContactType = {
           ...contact,
           id: compositeId,
           name: finalName,
           avatar: \`https://ui-avatars.com/api/?name=\${encodeURIComponent(finalName || contact.phone)}&background=random&color=fff\`,
           messages: [],
           unread: 0,
           instance_id: contact.instance_id || null,
           lastMsgTimestamp: new Date(contact.created_at || Date.now()).getTime(),
           conv_labels: conv_labels
         };
         updatedContacts.push(newContact);
      }

      // DEDUPLICAÇÃO RÍGIDA DE SEGURANÇA: Garante que NUNCA existam dois contatos com o mesmo ID
      const seen = new Set();
      const deduped: any[] = [];
      
      updatedContacts.forEach(c => {
         const key = c.id;
         if (!seen.has(key)) {
            seen.add(key);
            deduped.push(c);
         } else {
            console.warn(\`[upsertContactLocally] Removendo duplicata rígida de contato detectada no state:\`, c.id);
         }
      });

      return { contacts: deduped };
    });
  },

  updateContactCRM: async (contactId, payload) => {
    const realContactId = getRealContactId(contactId);
    const currentState = get().contacts.find(c => c.id === contactId);
    const beforeState = currentState ? { ...currentState } : null;

    // UI Otimista: atualiza todas as caixas/conversas correspondentes a este contato no state
    set((state) => ({
      contacts: state.contacts.map((c) => {
         if (getRealContactId(c.id) === realContactId) {
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
        const { data } = await supabase.from('contacts').select('*').eq('id', realContactId).single();
        if (data) rawBeforeState = data;
      } catch (e) {}

      const { error } = await supabase.from('contacts').update(dbPayload).eq('id', realContactId);
      if (error) throw error;

      // Log Operation
      if (rawBeforeState) {
        const rawAfterState = { ...rawBeforeState, ...dbPayload };
        await get().logOperation('UPDATE', 'contacts', realContactId, rawBeforeState, rawAfterState);
      }
    } catch (e) {
      console.error('Erro ao editar contato no DB (CRM):', e);
      throw e;
    }
  },
`;

if (!crmRegex.test(content)) {
  console.error("Erro: Regex de CRM não condiz!");
  process.exit(1);
}
content = content.replace(crmRegex, crmReplacement);
console.log("3. Implementação do CRM e upsertContactLocally atualizada com sucesso!");

fs.writeFileSync(filePath, content, 'utf8');
console.log("Arquivo de store atualizado com sucesso!");
