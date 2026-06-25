import { supabase, NODE_ID, retryWithBackoff } from '../supabase.js';
import realtime from '../realtime-publisher/index.js';
import qrcode from 'qrcode';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as tus from 'tus-js-client';
import FlowEngine from '../flow-runtime/index.js';
import AutomationWorker from '../automation-worker/agent.js';
import PushService from '../push-service/index.js';
import crypto from 'crypto';

class EventProcessor {
    constructor() {
        this.messageQueue = [];
        this.isFlushing = false;
        
        // Loop de processamento em lote a cada 2 segundos.
        setInterval(() => this.flushQueue(), 2000);
        
        this.tenantConfigs = new Map();
        this.instanceConfigs = new Map();
        this.lastGlobalMessageTimestamp = 0;
        
        this.pendingStatuses = new Map();
        this.processedMessagesCache = new Map(); // Cache de deduplicação de mensagens recentes
        this.statusUpdateQueue = new Map(); // Fila assíncrona para status atrasados
        this.aiSendRateLimiter = new Map(); // Rastreio de taxa de disparos automáticos por conversa para anti-spam
        this.isFlushingStatus = false;
        
        // Loop de reconciliation assíncrono para status (a cada 4s)
        setInterval(() => this.flushStatusQueue(), 4000);
        
        // Cleanup loop para evitar memory leaks nos status pendentes e cache de mensagens processadas
        setInterval(() => {
            const now = Date.now();
            for (const [key, value] of this.pendingStatuses.entries()) {
                if (now - value.timestamp > 300000) { // 5 minutos de TTL
                    this.pendingStatuses.delete(key);
                }
            }
            if (this.processedMessagesCache) {
                for (const [key, timestamp] of this.processedMessagesCache.entries()) {
                    if (now - timestamp > 120000) { // 2 minutos de TTL
                        this.processedMessagesCache.delete(key);
                    }
                }
            }
        }, 60000);
    }
    
    updatePendingStatus(msgId, newStatus) {
        if (!this.pendingStatuses) return;
        const existing = this.pendingStatuses.get(msgId);
        if (existing) {
            if (existing.status === 'read') return; // Cannot downgrade from read
            if (existing.status === 'delivered' && newStatus === 'SERVER_ACK') return; // Cannot downgrade from delivered
        }
        this.pendingStatuses.set(msgId, { status: newStatus, timestamp: Date.now() });
    }

    queueStatusUpdate(tenantId, instanceId, messageId, status) {
        // Enfileira para reconciliation assíncrono caso o banco sofra delay (Race Condition Mitigation)
        this.statusUpdateQueue.set(messageId, {
            tenantId,
            instanceId,
            status,
            timestamp: Date.now()
        });
    }

    async flushStatusQueue() {
        if (this.isFlushingStatus || this.statusUpdateQueue.size === 0) return;
        this.isFlushingStatus = true;

        try {
            const now = Date.now();
            const toProcess = [];
            
            for (const [msgId, data] of this.statusUpdateQueue.entries()) {
                 // Espera pelo menos 1.5s antes de bater no banco para dar tempo da flushQueue salvar a msg
                 if (now - data.timestamp > 1500) { 
                     toProcess.push({ msgId, ...data });
                 }
                 // Expira após 45 segundos (Não gera logs de aviso, apenas descarta pacificamente)
                 if (now - data.timestamp > 45000) {
                     this.statusUpdateQueue.delete(msgId);
                 }
            }

            if (toProcess.length === 0) return;

            // Agrupa as atualizações pendentes por status para fazer bulk update
            const statusGroups = {
                'SERVER_ACK': [],
                'delivered': [],
                'read': []
            };

            for (const item of toProcess) {
                if (statusGroups[item.status]) {
                    statusGroups[item.status].push(item.msgId);
                }
            }

            for (const [status, ids] of Object.entries(statusGroups)) {
                if (ids.length > 0) {
                     // Quebra em lotes de 200 IDs para evitar queries gigantes
                     for (let i = 0; i < ids.length; i += 200) {
                         const chunk = ids.slice(i, i + 200);
                         
                         const { data: existing } = await supabase.from('messages')
                             .select('id, whatsapp_message_id, status')
                             .in('whatsapp_message_id', chunk);

                         if (existing && existing.length > 0) {
                             const idsToUpdate = existing.filter(e => {
                                 // Evita regressão
                                 if (e.status === 'read' && status !== 'read') return false;
                                 if (e.status === 'delivered' && status === 'SERVER_ACK') return false;
                                 return true;
                             }).map(e => e.id);

                             if (idsToUpdate.length > 0) {
                                 await supabase.from('messages').update({ status }).in('id', idsToUpdate);
                             }

                             // Remove da fila as mensagens que foram encontradas no banco
                             for (const e of existing) {
                                 this.statusUpdateQueue.delete(e.whatsapp_message_id);
                             }
                         }
                     }
                }
            }
        } catch (e) {
            console.error('[EventProcessor] Erro no flushStatusQueue:', e);
        } finally {
            this.isFlushingStatus = false;
        }
    }
    
    async getTenantConfig(tenantId) {
        const cached = this.tenantConfigs.get(tenantId);
        // Cache por 60 segundos
        if (cached && (Date.now() - cached.timestamp < 60000)) {
            return cached.config;
        }

        try {
            const { data } = await retryWithBackoff(() => 
                supabase.from('companies').select('ignore_groups').eq('tenant_id', tenantId).single()
            );
            // Default é true (ignorar grupos) para retrocompatibilidade
            const config = { ignore_groups: data && data.ignore_groups !== null ? data.ignore_groups : true };
            this.tenantConfigs.set(tenantId, { config, timestamp: Date.now() });
            return config;
        } catch (e) {
            return { ignore_groups: true }; 
        }
    }

    async getInstanceConfig(instanceId) {
        if (!instanceId) return {};
        const cached = this.instanceConfigs.get(instanceId);
        if (cached && (Date.now() - cached.timestamp < 5000)) {
            return cached.config;
        }
        try {
            const { data, error } = await retryWithBackoff(() =>
                supabase.from('whatsapp_instances').select('settings').eq('id', instanceId).single()
            );
            if (error) console.error('[EventProcessor] Erro ao buscar config da instância:', error);
            const config = data?.settings || {};
            this.instanceConfigs.set(instanceId, { config, timestamp: Date.now() });
            return config;
        } catch (e) {
            console.error('[EventProcessor] Exception ao buscar config da instância:', e);
            return {};
        }
    }

    // Auxiliar: Filtra se é um grupo
    isGroup(jid) {
        return jid && jid.endsWith('@g.us');
    }

    // Auxiliar: Filtra se é um status ou newsletter
    isBroadcast(jid) {
        return jid === 'status@broadcast' || (jid && jid.endsWith('@newsletter'));
    }

    // Auxiliar: Filtra se é um LID (Linked Device ID)
    isLid(jid) {
        return jid && jid.endsWith('@lid');
    }

    async handleMessageUpsert(tenantId, instanceId, sock, m) {
        if (!m.messages || m.messages.length === 0) return;
 
        for (const msg of m.messages) {
            const msgId = msg.key?.id;
            if (msgId) {
                const safeInstanceId = instanceId || 'null_instance';
                const cacheKey = `${safeInstanceId}_${msgId}`;
                if (this.processedMessagesCache.has(cacheKey)) {
                    console.log(`[EventProcessor] Mensagem Duplicada Detectada em Cache de Memória (Ignorando). ID: ${msgId}`);
                    continue;
                }
                this.processedMessagesCache.set(cacheKey, Date.now());
            }

            try {
                fs.appendFileSync('event_debug.log', new Date().toISOString() + ' QUEUED RAW PAYLOAD: ' + JSON.stringify(msg) + '\n');
            } catch(e){}

            let jid = msg.key.remoteJid;

            // [LID Sync Override]
            // Multi-device connections (WhatsApp Web/Desktop or linked phones) send outgoing 'fromMe' 
            // messages tagged with '@lid' in remoteJid, but they include the actual target phone in remoteJidAlt.
            // By extracting it here, we rescue the sync message and map it perfectly to the real contact.
            if (jid && jid.includes('@lid')) {
                if (msg.key.remoteJidAlt && msg.key.remoteJidAlt.includes('@s.whatsapp.net')) {
                    jid = msg.key.remoteJidAlt;
                } else if (sock?.signalRepository?.lidMapping) {
                    try {
                        const resolvedPn = await sock.signalRepository.lidMapping.getPNForLID(jid);
                        if (resolvedPn && resolvedPn.includes('@s.whatsapp.net')) {
                            jid = resolvedPn;
                            console.log(`[EventProcessor] LID Resgatado via SignalRepository: ${msg.key.remoteJid} -> ${jid}`);
                        }
                    } catch (err) {
                        console.error('[EventProcessor] Erro ao buscar mapeamento de LID no SignalRepository:', err);
                    }
                }
            }

            if (!jid) continue;
            
            const instanceConfig = await this.getInstanceConfig(instanceId);
            const allowedGroups = instanceConfig.allowed_groups || [];
            
            // Ignora status e LIDs isolados, forçando a ignorar as ecos de múltiplos aparelhos para IDs nativos
            if (this.isBroadcast(jid) || this.isLid(jid)) {
                // Silenciado ou reduzido para não floodar os logs
                console.log(`[EventProcessor] Mensagem Descartada - Motivo: É um Broadcast ou LID isolado. JID: ${jid}`);
                continue;
            }
            
            // Ignora grupos se não estiverem na lista de permitidos
            if (this.isGroup(jid)) {
                if (!allowedGroups.includes(jid)) {
                    console.log(`[EventProcessor] Mensagem Descartada - Motivo: Grupo não sincronizado manualmente. JID: ${jid}. Allowed: ${JSON.stringify(allowedGroups)}`);
                    continue;
                }
            }

            // [LID Sync / Ciphertext Error Override]
            // Ignora stubs de falha de descriptografia (ex: Message absent from node)
            // Se salvarmos isso como mensagem vazia, o retry natural da Baileys será descartado por duplicidade de ID.
            if (msg.messageStubType && !msg.message) {
                console.log(`[EventProcessor] Ignorando Stub Type ${msg.messageStubType} s/conteudo. (Evitando perda por dup-id no retry) - JID: ${jid}`);
                continue;
            }

            try {
                const ownerJid = sock?.user?.id;
                let ownerPhone = null;
                if (ownerJid) {
                     ownerPhone = ownerJid.split('@')[0].split(':')[0];
                }
                const phone = jid.split('@')[0].split(':')[0];
                const cleanJid = phone + '@' + jid.split('@')[1];
                jid = cleanJid; // Sobrescreve jid com o JID limpo sem o sufixo de device
                
                // Evita auto-respostas bot-loop, mas não deve bloquear a inserção da mensagem no BD
                // para que a interface (CRM) possa mostrar conversas de 'self-chat' (testes do próprio usuário).
                const isSelfChat = (ownerPhone && phone === ownerPhone);

                const isHuman = EventProcessor.humanMessagesCache && EventProcessor.humanMessagesCache.has(msg.key.id);
                const isAutomation = EventProcessor.automationMessagesCache && EventProcessor.automationMessagesCache.has(msg.key.id);
                // Se for isSelfChat (enviado para si mesmo), apenas processe o evento "fromMe: true" para evitar duplicar a mensagem recebida e enviada
                if (isSelfChat && !msg.key.fromMe) {
                     console.info(`[Message Tracker] ℹ️ Ignorando evento fromMe:false em self-chat (evita duplicidade). JID: ${jid}`);
                     continue;
                }
                const senderType = msg.key.fromMe 
                    ? (isAutomation ? 'automation' : (isHuman ? 'human' : 'bot')) 
                    : 'client';
                const direction = msg.key.fromMe ? 'outbound' : 'inbound';
                
                // Se for outbound (fromMe), o msg.pushName é o nome do PRÓPRIO aparelho (ex: Burguer Plus).
                // Não devemos atribuir ao nome do cliente (jid).
                const pushName = msg.key.fromMe && !isSelfChat ? phone : (msg.pushName || phone);
                
                // Trata data da mensagem
                const timestampSecs = msg.messageTimestamp;
                let tsDate = new Date();
                if (typeof timestampSecs === 'number') {
                    tsDate = new Date(timestampSecs * 1000);
                } else if (timestampSecs && typeof timestampSecs.low === 'number') {
                    tsDate = new Date(timestampSecs.low * 1000);
                }

                // Garantir ordem estrita cronológica global para envios/recebimentos massivos no mesmo segundo
                let tsMs = tsDate.getTime();
                if (tsMs <= this.lastGlobalMessageTimestamp) {
                    tsMs = this.lastGlobalMessageTimestamp + 1;
                }
                this.lastGlobalMessageTimestamp = tsMs;
                tsDate = new Date(tsMs);


                const textMessage = this.extractTextFromMessage(msg);
                const msgType = this.extractTypeFromMessage(msg);

                let content = this.extractMessageContent(msg);
                if (content && content.protocolMessage) {
                    const p = content.protocolMessage;
                    
                    // Verifica se é uma edição de mensagem (MESSAGE_EDIT = 14)
                    // Ou se possui explicitamente a propriedade "editedMessage"
                    if (p.type === 14 || p.type === 'MESSAGE_EDIT' || p.editedMessage) {
                        if (p.key && p.key.id && p.editedMessage) {
                            const newText = this.extractTextFromMessage({ message: p.editedMessage });
                            supabase.from('messages')
                                .update({ text_content: newText })
                                .eq('whatsapp_message_id', p.key.id)
                                .then(({ error }) => {
                                    if (error) console.error('[EventProcessor] Erro ao atualizar mensagem editada:', error);
                                    else console.log('[EventProcessor] Mensagem editada processada no banco:', p.key.id);
                                });
                            
                            // Tenta publicar no realtime (não bloqueia o fluxo)
                            realtime.publishInboxEvent(tenantId, 'message.update', {
                                whatsapp_message_id: p.key.id,
                                text_content: newText
                            }).catch(() => {});
                        }
                        // Sempre pula o enfileiramento de protocolMessage de edição
                        continue; 
                    } 
                    
                    // Verifica se é uma mensagem apagada (REVOKE = 0)
                    else if (p.type === 0 || p.type === 'REVOKE') {
                        if (p.key && p.key.id) {
                            supabase.from('messages')
                                .update({ status: 'deleted' })
                                .eq('whatsapp_message_id', p.key.id)
                                .then(({ error }) => {
                                    if (error) console.error('[EventProcessor] Erro ao deletar mensagem:', error);
                                    else console.log('[EventProcessor] Mensagem apagada processada no banco:', p.key.id);
                                });

                            realtime.publishInboxEvent(tenantId, 'message.update', {
                                whatsapp_message_id: p.key.id,
                                status: 'deleted'
                            }).catch(() => {});
                        }
                        // Sempre pula o enfileiramento de protocolMessage de revoke
                        continue; 
                    }
                    
                    // Ignora silenciosamente outros protocolMessages (HISTORY_SYNC_NOTIFICATION, APP_STATE_SYNC_KEY_SHARE, etc)
                    continue; 
                }

                // Em memória: empurra pra fila invés de dar AWAIT no BD cru.
                this.messageQueue.push({
                    tenantId,
                    instanceId,
                    sock,
                    rawMsg: msg,
                    phone,
                    pushName,
                    jid,
                    timestamp: tsDate,
                    senderType,
                    direction,
                    msgType,
                    textMessage,
                    isSelfChat,
                    isHistory: m.type === 'append'
                });

                // Otimização: Se a mensagem for enviada por um humano (atendente),
                // força o flush imediato da fila para reduzir a latência percebida na tela do CRM.
                if (senderType === 'human') {
                    setTimeout(() => this.flushQueue(), 0);
                }

            } catch (e) {
                console.error(`[EventProcessor] Erro ao engatilhar mensagem na Queue:`, e);
            }
        }
    }

    async flushQueue() {
        if (this.isFlushing || this.messageQueue.length === 0) return;
        this.isFlushing = true;
        
        // Puxa até 1000 mensagens do buffer (Batch limit)
        let batch = this.messageQueue.splice(0, 1000);
        console.log(`[BatchProcessor] Drenando lote de ${batch.length} novas interações...`);

        // Filtra elementos pertencentes a instâncias deletadas para evitar violações de FK no banco
        const uniqueInstanceIds = Array.from(new Set(batch.map(b => b.instanceId).filter(Boolean)));
        if (uniqueInstanceIds.length > 0) {
            try {
                const { data: existingInstances, error: instError } = await supabase
                    .from('whatsapp_instances')
                    .select('id')
                    .in('id', uniqueInstanceIds);
                
                if (instError) {
                    console.error('[BatchProcessor] Erro ao buscar instâncias válidas:', instError);
                } else {
                    const validInstanceSet = new Set((existingInstances || []).map(i => i.id));
                    const filteredBatch = batch.filter(b => !b.instanceId || validInstanceSet.has(b.instanceId));
                    if (filteredBatch.length < batch.length) {
                        console.log(`[BatchProcessor] Ignoradas ${batch.length - filteredBatch.length} interações de instâncias deletadas/inválidas.`);
                        batch = filteredBatch;
                    }
                }
            } catch (err) {
                console.error('[BatchProcessor] Exceção crítica ao validar instâncias no banco:', err);
            }
        }

        if (batch.length === 0) {
            this.isFlushing = false;
            return;
        }
        
        try {
             // 1. Processa e Dedulplica Contatos
             const contactsMap = new Map();
             for(const b of batch) {
                 const key = `${b.tenantId}_${b.phone}`;
                 if(!contactsMap.has(key)) {
                     contactsMap.set(key, {
                         tenant_id: b.tenantId,
                         instance_id: b.instanceId,
                         phone: b.phone,
                         name: b.pushName,
                         whatsapp_jid: b.jid
                     });
                 }
             }
             
            // BULK UPSERT CONTACTS
             const contactsArray = Array.from(contactsMap.values());
             
             // Proteger contra overwrite de nomes e custom_names
             const phonesToSeek = contactsArray.map(c => c.phone);
             const tenantIdTarget = contactsArray[0]?.tenant_id;
             
             let existingMap = new Map();
             const contactBotStatusMap = new Map();
             if (tenantIdTarget && phonesToSeek.length > 0) {
                 const { data: existingDbContacts } = await supabase.from('contacts')
                     .select('*')
                     .eq('tenant_id', tenantIdTarget)
                     .in('phone', phonesToSeek);
                     
                 if (existingDbContacts) {
                     for (const e of existingDbContacts) {
                         existingMap.set(e.phone, e);
                         const isTempPaused = e.bot_paused_until && new Date(e.bot_paused_until) > new Date();
                         contactBotStatusMap.set(e.id, (e.bot_status === 'paused' || isTempPaused) ? 'paused' : 'active');
                     }
                 }
             }

             const safeContactsArray = contactsArray.map(c => {
                 const ex = existingMap.get(c.phone) || {};
                 // Respeita o custom_name ou o nome antigo se válido frente ao fallback bruto
                 const hasValidOldName = ex && ex.name && ex.name !== ex.phone && ex.name !== c.phone;
                 const finalName = ex?.custom_name ? ex.custom_name : (hasValidOldName ? ex.name : c.name);
                 
                 return {
                     tenant_id: c.tenant_id,
                     phone: c.phone,
                     name: finalName,
                     whatsapp_jid: c.whatsapp_jid,
                     instance_id: c.instance_id
                 };
             });
             
             const { data: upsertedContacts, error: contactErr } = await supabase.from('contacts')
                  .upsert(safeContactsArray, { onConflict: 'tenant_id, phone' })
                  .select('id, tenant_id, phone, whatsapp_jid');
                 
             if(contactErr) throw new Error("Contact Upsert Error: " + contactErr.message);
             
             const contactIdMap = new Map(); // phone+tenant -> contact_id
             for(const c of upsertedContacts) {
                 contactIdMap.set(`${c.tenant_id}_${c.phone}`, c.id);
             }
             
              const convMap = new Map();
              for(const b of batch) {
                  const cid = contactIdMap.get(`${b.tenantId}_${b.phone}`);
                  if(!cid) continue; 
                  
                  const key = `${b.tenantId}_${b.instanceId}_${cid}`;
                  if(!convMap.has(key)) {
                      convMap.set(key, {
                          tenant_id: b.tenantId,
                          instance_id: b.instanceId,
                          contact_id: cid,
                          unread_count: 0,
                          last_message_preview: b.textMessage,
                          last_message_at: b.timestamp,
                          status: 'bot',
                          has_inbound: false,
                          has_human_outbound: false
                      });
                  }
                  
                  const conv = convMap.get(key);
                  if (b.timestamp >= conv.last_message_at) {
                      conv.last_message_preview = b.textMessage;
                      conv.last_message_at = b.timestamp;
                  }
                  if (b.direction === 'inbound') {
                      conv.unread_count += 1;
                      conv.has_inbound = true;
                  }
                  if (b.direction === 'outbound' && b.senderType === 'human') {
                       conv.has_human_outbound = true;
                       AutomationWorker.cancelPendingMessage(b.conversationId);
                       AutomationWorker.cancelPendingMessage(b.jid);
                  }
              }
             
             // Verifica quais conversas já existem no banco
             const contactIds = Array.from(new Set(Array.from(convMap.values()).map(c => c.contact_id)));
             const { data: existingConvs, error: existError } = await supabase.from('conversations')
                  .select('id, tenant_id, instance_id, contact_id, unread_count, status, ai_paused')
                  .in('contact_id', contactIds);
                  
             if(existError) throw new Error("Conversation Select Error: " + existError.message);
             
             const existingConvMap = new Map();
             for(const e of existingConvs) {
                 // Usa tenant + instance + contact como chave de isolamento da conversa
                 const safeInstance = e.instance_id || 'null_instance';
                 existingConvMap.set(`${e.tenant_id}_${safeInstance}_${e.contact_id}`, e);
             }
             
             const toInsertConvs = [];
             const toUpdateConvs = []; 
             
             const updatedStatusMap = new Map();
             const updatedAiPausedMap = new Map();
             
             for(const [key, data] of convMap.entries()) {
                 const exist = existingConvMap.get(key);
                 let finalStatus = 'bot';
                 let finalAiPaused = false;
                 
                 if(exist) {
                     let nextStatus = exist.status || 'bot';
                     let nextAiPaused = exist.ai_paused || false;
                     
                     if ((exist.status === 'resolved' || exist.status === 'closed' || exist.status === 'snoozed') && (data.has_inbound || data.has_human_outbound)) {
                          if (data.has_inbound && !exist.ai_paused) {
                              nextStatus = 'bot';
                          } else {
                              nextStatus = 'open';
                          }
                      }

                      // Transição automática de open para bot se receber inbound e a IA estiver ativa
                      if (exist.status === 'open' && data.has_inbound && !exist.ai_paused) {
                          nextStatus = 'bot';
                      }
                      
                      if (data.has_human_outbound) {
                          nextAiPaused = true;
                      }
                      
                      finalStatus = nextStatus;
                      finalAiPaused = nextAiPaused;
                      
                      const updatePayload = {
                          id: exist.id,
                          tenant_id: data.tenant_id,
                          contact_id: data.contact_id,
                          unread_count: Number(exist.unread_count || 0) + Number(data.unread_count || 0),
                          last_message_preview: Array.from(String(data.last_message_preview || '')).slice(0, 50).join(''),
                          last_message_at: new Date(data.last_message_at).toISOString(),
                          updated_at: new Date().toISOString(),
                          status: nextStatus,
                          ai_paused: nextAiPaused
                      };

                      if (exist.status === 'snoozed' && nextStatus !== 'snoozed') {
                          updatePayload.snoozed_until = null;
                          updatePayload.snoozed_at = null;
                          updatePayload.snoozed_by = null;
                      }

                      toUpdateConvs.push(updatePayload);
                 } else {
                     let initialStatus = 'resolved';
                     let initialAiPaused = false;
                     if (data.has_inbound) {
                         initialStatus = 'bot';
                     } else if (data.has_human_outbound) {
                         initialStatus = 'open';
                         initialAiPaused = true;
                     }
                     
                     finalStatus = initialStatus;
                     finalAiPaused = initialAiPaused;
                     
                     toInsertConvs.push({
                         tenant_id: data.tenant_id,
                         instance_id: data.instance_id,
                         contact_id: data.contact_id,
                         status: initialStatus,
                         unread_count: data.unread_count,
                         last_message_preview: Array.from(String(data.last_message_preview || '')).slice(0, 50).join(''),
                         last_message_at: data.last_message_at.toISOString(),
                         ai_paused: initialAiPaused
                     });
                 }
                 
                 updatedStatusMap.set(key, finalStatus);
                 updatedAiPausedMap.set(key, finalAiPaused);
             }
             
             const insertedConvs = [];
             if(toInsertConvs.length > 0) {
                 // Usando upsert com a nova restrição de unicidade para evitar race conditions
                 const { data: res, error: errInst } = await supabase.from('conversations')
                     .upsert(toInsertConvs, { onConflict: 'tenant_id, instance_id, contact_id' })
                     .select('id, tenant_id, contact_id, instance_id');
                     
                 if(errInst) {
                       console.error('[BatchProcessor] Falha no upsert de conversas:', errInst.message);
                 } else if (res) {
                       insertedConvs.push(...res);
                 }
             }
             
             if(toUpdateConvs.length > 0) {
                 const { data: res, error: errUp } = await supabase.from('conversations').upsert(toUpdateConvs, { onConflict: 'id' }).select('id, tenant_id, contact_id, instance_id');
                 if(errUp) console.error('[BatchProcessor] Aviso: falha atualizando unread batch.', errUp.message);
             }
             
             // Agrupa os IDs das conversas finais no MAPA
             const finalConvIdMap = new Map();
             for(const e of existingConvs) finalConvIdMap.set(`${e.tenant_id}_${e.instance_id || 'null_instance'}_${e.contact_id}`, e.id);
             for(const e of insertedConvs) finalConvIdMap.set(`${e.tenant_id}_${e.instance_id || 'null_instance'}_${e.contact_id}`, e.id);
             
             // 2.5 Resolve Duplicatas de Mensagens ANTES do processo pesado de mídias e inserções
             const allMessageIds = batch.map(b => b.rawMsg.key.id).filter(Boolean);
             const existingIdsSet = new Set();
             if (allMessageIds.length > 0) {
                 // Busca IDs já existentes para evitar código 23505 (Unique Violation)
                 for(let i = 0; i < allMessageIds.length; i += 500) {
                     const chunk = allMessageIds.slice(i, i + 500);
                     const { data: existingMessages } = await supabase.from('messages')
                         .select('whatsapp_message_id, instance_id')
                         .in('whatsapp_message_id', chunk);
                     if (existingMessages) {
                         for (const m of existingMessages) {
                             // Garantindo suporte para instance_id nulo de legado
                             const safeInstanceId = m.instance_id || 'null_instance';
                             existingIdsSet.add(`${safeInstanceId}_${m.whatsapp_message_id}`);
                         }
                     }
                 }
             }

             const uniqueBatchMap = new Map();
             for (const b of batch) {
                 const safeInstanceId = b.instanceId || 'null_instance';
                 const dedupKey = `${safeInstanceId}_${b.rawMsg.key.id}`;
                 if (!existingIdsSet.has(dedupKey)) {
                     uniqueBatchMap.set(dedupKey, b);
                 }
             }
             const activeBatch = Array.from(uniqueBatchMap.values());

             if (activeBatch.length === 0) {
                 console.log(`[BatchProcessor] Lote concluído sem novas requisições (todas as ${batch.length} mensagens já existiam).`);
                 return;
             }

             // 3. Processa Mídias em Paralelo Segura (evitando Memory leaks)
             await Promise.all(activeBatch.map(async b => {
                 const cid = contactIdMap.get(`${b.tenantId}_${b.phone}`);
                 b.conversationId = finalConvIdMap.get(`${b.tenantId}_${b.instanceId}_${cid}`) || finalConvIdMap.get(`${b.tenantId}_null_instance_${cid}`);
                 const mapKey = `${b.tenantId}_${b.instanceId || 'null_instance'}_${cid}`;
                 b.convStatus = updatedStatusMap.get(mapKey) || existingConvMap.get(`${b.tenantId}_${b.instanceId}_${cid}`)?.status || existingConvMap.get(`${b.tenantId}_null_instance_${cid}`)?.status || 'bot';
                 const isConvPaused = updatedAiPausedMap.has(mapKey) ? updatedAiPausedMap.get(mapKey) : (existingConvMap.get(`${b.tenantId}_${b.instanceId}_${cid}`)?.ai_paused || false);
                 const contactBotStatus = contactBotStatusMap.get(cid) || 'active';
                 const isContactPaused = contactBotStatus === 'paused';
                 b.aiPaused = isConvPaused || isContactPaused;
                 
                 if (!b.conversationId) return; // ignora falha bruta
                 
                 // Tenta recuperar a URL do cache de mídias pendentes (outbound)
                 if (!b.mediaUrl && b.rawMsg?.key?.id && EventProcessor.pendingMediaCache) {
                     const cachedUrl = EventProcessor.pendingMediaCache.get(b.rawMsg.key.id);
                     if (cachedUrl) {
                         b.mediaUrl = cachedUrl;
                     }
                 }
                 
                 if (!b.mediaUrl && ['image', 'video', 'audio', 'document'].includes(b.msgType)) {
                     try {
                         const mediaMeta = this.extractMediaMeta(b.rawMsg, b.msgType) || {};
                         const stream = await downloadContentFromMessage(mediaMeta, b.msgType.replace('Message', ''));
                         
                         const mimeType = mediaMeta.mimetype || 'application/octet-stream';
                         const fileName = mediaMeta.fileName || 'media_' + Date.now();
                         const safeName = fileName.replace(/[^a-zA-Z0-9.\-]/g, '_');
                         const storagePath = `tenant_${b.tenantId}/instance_${b.instanceId}/${b.conversationId}/${Date.now()}_${safeName}`;
                         
                         const tmpFilePath = path.join(os.tmpdir(), `${Date.now()}_${safeName}`);
                         const writeStream = fs.createWriteStream(tmpFilePath);
                         
                         for await(const chunk of stream) {
                             writeStream.write(chunk);
                         }
                         writeStream.end();
                         await new Promise((resolve) => writeStream.on('finish', resolve));

                         const stats = fs.statSync(tmpFilePath);
                         const fileSize = stats.size;

                         const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
                         const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

                         await new Promise((resolve, reject) => {
                             const fileStream = fs.createReadStream(tmpFilePath);
                             const upload = new tus.Upload(fileStream, {
                                 endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
                                 retryDelays: [0, 3000, 5000, 10000, 20000],
                                 headers: {
                                     Authorization: `Bearer ${supabaseKey}`,
                                     'x-upsert': 'true'
                                 },
                                 uploadDataDuringCreation: true,
                                 metadata: {
                                     bucketName: 'chat_media',
                                     objectName: storagePath,
                                     contentType: mimeType
                                 },
                                 chunkSize: 6 * 1024 * 1024,
                                 uploadSize: fileSize,
                                 onError: function (error) {
                                     console.error('[TUS-BACKEND] Upload falhou:', error);
                                     reject(error);
                                 },
                                 onSuccess: function () {
                                     const { data: publicUrlData } = supabase.storage.from('chat_media').getPublicUrl(storagePath);
                                     b.mediaUrl = publicUrlData.publicUrl;
                                     resolve();
                                 }
                             });
                             upload.start();
                         });

                         // Limpeza e Setagem
                         fs.unlinkSync(tmpFilePath);
                         
                         b.mediaMetadata = {
                             mime_type: mimeType, file_name: fileName,
                             file_size: fileSize,
                             duration: mediaMeta.seconds, width: mediaMeta.width, height: mediaMeta.height,
                             page_count: mediaMeta.pageCount, is_voice_note: mediaMeta.ptt || false
                         };
                     } catch(err) {
                         console.warn(`[BatchProcessor] Aviso: Mídia expirada/inacessível para JID ${b.jid}. (Normal em History Sync) -> ${err.message}`);
                     }
                 }
             }));
             
             // 4. INSERE TODAS AS MENSAGENS NUM CHUTE SÓ (BULK INSERT)
             const messagesToInsert = activeBatch.map(b => {
                 const pendingStatus = this.pendingStatuses?.get(b.rawMsg.key.id)?.status;
                 const defaultStatus = b.direction === 'inbound' ? 'received' : 'delivered';
                 
                 return {
                     tenant_id: b.tenantId,
                     instance_id: b.instanceId,
                     conversation_id: b.conversationId,
                     direction: b.direction,
                     message_type: b.msgType,
                     status: pendingStatus || defaultStatus,
                     text_content: b.textMessage,
                     whatsapp_message_id: b.rawMsg.key.id,
                     sender_type: b.senderType,
                     timestamp: b.timestamp.toISOString(),
                     raw_payload: b.rawMsg,
                     media_url: b.mediaUrl || null,
                     media_metadata: b.mediaMetadata || null
                 };
             }).filter(m => m.conversation_id); // Filtra as que milagrosamente não pegaram conv ID
             
             let realInserted = [];
             
             if(messagesToInsert.length > 0) {
                 const { data: insertedMessages, error: msgErr } = await supabase.from('messages')
                    .insert(messagesToInsert)
                    .select('*');
                    
                 if(msgErr) {
                     console.warn(`[BatchProcessor] Insert em lote falhou (código ${msgErr.code}). Iniciando fallback de inserção 1 a 1...`);
                     // Fallback 1 by 1 salva as mensagens que não são duplicadas (ignora erro 23505 de cada item)
                     for (const m of messagesToInsert) {
                         const { data: singleInserted, error: singleErr } = await supabase.from('messages')
                             .insert([m])
                             .select('*');
                             
                         if (singleErr) {
                             if (singleErr.code !== '23505') {
                                 console.error(`[BatchProcessor] Erro na inserção individual falha para ID ${m.whatsapp_message_id}:`, singleErr);
                                 // Re-enfileira a mensagem para tentar novamente se for erro transiente e não tiver excedido o limite de 5 tentativas
                                 const originalItem = activeBatch.find(x => x.rawMsg?.key?.id === m.whatsapp_message_id && x.instanceId === m.instance_id);
                                 if (originalItem) {
                                     originalItem.retryCount = (originalItem.retryCount || 0) + 1;
                                     if (originalItem.retryCount < 5) {
                                         this.messageQueue.push(originalItem);
                                         console.warn(`[BatchProcessor] Enfileirando individualmente mensagem ID ${m.whatsapp_message_id} para nova tentativa (${originalItem.retryCount}/5).`);
                                     } else {
                                         console.error(`[BatchProcessor] EXCEÇÃO CRÍTICA: Mensagem ID ${m.whatsapp_message_id} descartada individualmente após 5 falhas.`);
                                         try {
                                             fs.appendFileSync('discarded_messages.log', `${new Date().toISOString()} [INDIVIDUAL FAILED] MsgId: ${m.whatsapp_message_id} - Payload: ${JSON.stringify(originalItem.rawMsg)}\n`);
                                         } catch (logErr) {}
                                     }
                                 }
                             }
                         } else if (singleInserted && singleInserted.length > 0) {
                             realInserted.push(singleInserted[0]);
                         }
                     }
                     console.log(`[BatchProcessor] Fallback 1 a 1 concluído. ${realInserted.length} novas mensagens salvadas de ${messagesToInsert.length} totais.`);
                 } else {
                     realInserted = insertedMessages || [];
                     console.log(`[BatchProcessor] ${realInserted.length} mensagens inseridas no lote com SUCESSO!`);
                 }
             }
             
             // 5. Fire socket events para realtime no painel (FrontEnd)
             const fetchedPictures = new Set();
             const aiTriggerMap = new Map();

             for(const msg of realInserted) {
                 const b = activeBatch.find(x => x.rawMsg.key.id === msg.whatsapp_message_id && x.instanceId === msg.instance_id);
                 if (!b) continue;

                 if (!b.isHistory) {
                     await realtime.publishInboxEvent(b.tenantId, 'message.new', {
                         message: msg,
                         contact_phone: b.phone,
                         conversation_id: b.conversationId
                     });

                     if (b.direction === 'inbound') {
                         const messageAgeSecs = (Date.now() - new Date(msg.timestamp).getTime()) / 1000;
                         if (messageAgeSecs < 120) {
                             PushService.sendNotification(b.tenantId, msg, b.phone, b.conversationId);
                         } else {
                             console.log(`[BatchProcessor] Push abortado para mensagem atrasada/offline (${Math.round(messageAgeSecs)}s atrás)`);
                         }

                         // Disparar Webhook Triggers para nova mensagem recebida
                         const cid = contactIdMap.get(`${b.tenantId}_${b.phone}`);
                         dispatchWebhookTriggers(b.tenantId, 'message_received', {
                             phone: b.phone,
                             message: b.textMessage,
                             conversation_id: b.conversationId,
                             contact_id: cid
                         }).catch(err => console.error('[WebhookTrigger] Falha ao despachar gatilho message_received:', err));

                         // Responde apenas se a conversa estiver sob os cuidados do bot ('bot' ou 'teste_robo')
                         // E não seja um self-chat (evita auto-loop em envios pro próprio numero)
                         if (!b.isSelfChat && !b.aiPaused && (b.convStatus === 'bot' || b.convStatus === 'teste_robo' || b.convStatus === 'open')) {
                             const existingTrigger = aiTriggerMap.get(b.conversationId);
                             if (!existingTrigger || new Date(msg.timestamp) > new Date(existingTrigger.msg.timestamp)) {
                                 aiTriggerMap.set(b.conversationId, { msg, b });
                             }
                         }
                     }
                 }
                 
                 // Puxa a foto do perfil assincronamente (background level 2) sem estourar tempo
                 // SISTEMA ANTI-BAN/ANTI-LOOP: Garantir que não dispare múltiplas requisições (por JID) para a Meta no caso de batch insert (sync histórico de 50 msgs).
                 if(b.sock && b.jid && !b.jid.includes('@g.us')) {
                     const picKey = `${b.tenantId}_${b.jid}`;
                     if (!fetchedPictures.has(picKey)) {
                         fetchedPictures.add(picKey);
                         b.sock.profilePictureUrl(b.jid, 'image')
                             .then(async (url) => {
                                 const cid = contactIdMap.get(`${b.tenantId}_${b.phone}`);
                                 if(cid) { 
                                     await supabase.from('contacts').update({ profile_picture_url: url }).eq('id', cid); 
                                 }
                             })
                             .catch(() => {});
                     }
                 }
             }

             // Executa os disparos da IA Luna consolidados (apenas a última mensagem de cada conversa no lote)
             for (const [convId, triggerData] of aiTriggerMap.entries()) {
                 const { msg, b } = triggerData;
                 
                 // SISTEMA ANTI-SPAM / RATE-LIMITER DE DISPAROS DE BOT
                 const now = Date.now();
                 let rateData = this.aiSendRateLimiter.get(convId);
                 if (!rateData) {
                     rateData = { timestamps: [] };
                 }
                 
                 // Filtra timestamps mais velhos que 60 segundos
                 rateData.timestamps = rateData.timestamps.filter(ts => now - ts < 60000);
                 
                 if (rateData.timestamps.length >= 5) { // Limite de 5 respostas de bot por minuto
                     console.warn(`[EventProcessor] Anti-Spam Ativado para convId ${convId}. Excesso de disparos de bot detectados (${rateData.timestamps.length} em 60s). Pausando IA.`);
                     
                     try {
                         // Pausa a IA e define como status 'open' para operador humano
                         await supabase.from('conversations').update({ ai_paused: true, status: 'open' }).eq('id', convId);
                         
                         // Registra uma mensagem de aviso de sistema na conversa para avisar o Atendente
                         const alertMsgText = `⚠️ Atendimento automático pausado: Taxa limite de respostas da IA excedida (limite contra bloqueio ativado).`;
                         const { data: insertedMsg } = await supabase.from('messages').insert({
                             tenant_id: b.tenantId,
                             instance_id: b.instanceId,
                             conversation_id: convId,
                             direction: 'outgoing',
                             message_type: 'text',
                             status: 'sent',
                             text_content: alertMsgText,
                             sender_type: 'system',
                             raw_payload: { system_alert: true }
                         }).select().single();
                         
                         if (insertedMsg) {
                             realtime.publishInboxEvent(b.tenantId, 'message.new', {
                                 message: insertedMsg,
                                 contact_phone: b.phone,
                                 conversation_id: convId
                             }).catch(() => {});
                         }
                     } catch (dbErr) {
                         console.error(`[EventProcessor] Erro ao pausar IA por spam no banco:`, dbErr);
                     }
                     
                     // Limpa os timestamps para evitar loops de escrita repetidos
                     this.aiSendRateLimiter.delete(convId);
                     continue; // Ignora o disparo
                 }
                 
                 // Registra o novo disparo
                 rateData.timestamps.push(now);
                 this.aiSendRateLimiter.set(convId, rateData);
                 
                 this.getInstanceConfig(b.instanceId).then(async (instanceConfig) => {
                      // 1. Verifica se o robô está ativo para esta caixa de entrada (padrão true se undefined)
                      const botActive = instanceConfig.bot_active !== false;
                      if (!botActive) {
                          console.warn(`[EventProcessor] Robô desativado nas configurações da caixa de entrada (${b.instanceId}). Silenciando robô.`);
                          return;
                      }

                      // 2. Verifica Whitelist de números de teste (Ambiente de Teste Real)
                      const hasTestNumbers = instanceConfig.bot_test_numbers && String(instanceConfig.bot_test_numbers).trim().length > 0;
                      let isTestAllowed = false;
                      let testNumbers = [];

                      if (hasTestNumbers) {
                          testNumbers = String(instanceConfig.bot_test_numbers)
                              .split(',')
                              .map(n => n.replace(/\D/g, ''))
                              .filter(n => n.length > 0);
                          
                          if (testNumbers.length > 0) {
                              const clientPhoneClean = String(b.phone || '').replace(/\D/g, '');
                              isTestAllowed = testNumbers.some(tn => {
                                  return clientPhoneClean.endsWith(tn) || tn.endsWith(clientPhoneClean);
                              });
                          }
                      }

                      // Se a conversa for 'open' (operador humano), o robô só responde se o cliente estiver explicitamente na whitelist de testes
                      if (b.convStatus === 'open') {
                          if (!isTestAllowed) {
                              console.log(`[EventProcessor] Conversa está aberta (operador humano) para o contato ${b.phone}. Cliente não está na whitelist de testes da instância. Silenciando robô.`);
                              return;
                          }
                          console.log(`[EventProcessor] Sandbox Ativo: Forçando resposta da IA em chat 'open' para o celular homologado (${b.phone}).`);
                      } else {
                          // Para status 'bot' ou 'teste_robo', se houver whitelist de testes configurada, o cliente precisa estar nela
                          if (testNumbers.length > 0 && !isTestAllowed) {
                              console.log(`[EventProcessor] Sandbox da Instância Ativo: Mensagem do celular (${b.phone}) não está na whitelist de testes da instância. Silenciando robô.`);
                              return;
                          }
                      }

                      try {
                          const { data: companyData } = await supabase.from('companies').select('global_ai_enabled').eq('id', b.tenantId).single();
                          // Se o IA estiver desativado globalmente e NÃO for um teste, aborta o processamento.
                          if (companyData && companyData.global_ai_enabled === false && b.convStatus !== 'teste_robo' && !isTestAllowed) {
                              console.log(`[BatchProcessor] IA e Automações Globais estão DESATIVADAS para o tenant ${b.tenantId}`);
                              return;
                          }

                          // Busca TODOS os bots do tenant para orquestração
                          const { data: allBotsData } = await supabase.from('bots').select('*').eq('tenant_id', b.tenantId);
                          const botsData = allBotsData || [];

                          // Filtra os bots ativos e habilitados para a instância atual
                          const eligibleBots = botsData.filter(bot => bot.status === 'active' && bot.autoReply === true && bot.channels && bot.channels.includes(b.instanceId));

                          let botData = null;
                          if (eligibleBots.length > 0) {
                              if (eligibleBots.length > 1) {
                                  console.log(`[EventProcessor] Múltiplos bots ativos (${eligibleBots.length}) elegíveis. Iniciando roteamento por assunto...`);
                                  botData = await AutomationWorker.routeMessageToBot(eligibleBots, b.textMessage);
                              } else {
                                  botData = eligibleBots[0];
                              }
                          }

                          // Se for teste_robo e não achou bot, tenta capturar a configuração base
                          if (!botData && b.convStatus === 'teste_robo') {
                              botData = botsData.find(bot => bot.channels && bot.channels.includes(b.instanceId)) || botsData[0];
                          }

                          // Se a caixa de entrada tiver o robô de autoatendimento ativado e não tiver bot específico vinculado,
                          // faz fallback para o bot ativo do tenant para que o atendimento ocorra.
                          if (!botData && instanceConfig.bot_active !== false) {
                               // Filtra os bots ativos associados ao canal atual
                               const channelBots = botsData.filter(bot => bot.status === 'active' && bot.channels && bot.channels.includes(b.instanceId));
                               if (channelBots.length > 0) {
                                   if (channelBots.length > 1) {
                                       console.log(`[EventProcessor] Fallback Múltiplos bots (${channelBots.length}) no canal ${b.instanceId}. Roteando por assunto...`);
                                       botData = await AutomationWorker.routeMessageToBot(channelBots, b.textMessage);
                                   } else {
                                       botData = channelBots[0];
                                   }
                                   if (botData) {
                                       botData = { ...botData, autoReply: true };
                                       console.log(`[EventProcessor] Fallback Canal: Utilizando o bot '${botData.name}' para a caixa de entrada ${b.instanceId}.`);
                                   }
                               }

                               if (!botData) {
                                   const activeBot = botsData.find(bot => bot.status === 'active') || botsData[0];
                                   if (activeBot) {
                                       botData = { ...activeBot, autoReply: true };
                                       console.log(`[EventProcessor] Fallback Geral: Utilizando o bot '${activeBot.name}' para a caixa de entrada ${b.instanceId} via ativação direta.`);
                                   }
                               }
                           }

                           if (!botData) {
                               console.warn(`[EventProcessor] Nenhum bot ativo ou elegível encontrado para a caixa de entrada ${b.instanceId}. Silenciando robô.`);
                           }

                          if (botData) {
                              // --- MODO SANDBOX / FILTRO DE TELEFONE DE TESTE ---
                              // Se o bot estiver em modo de teste (test_mode), ele responde estritamente
                              // apenas ao número de telefone definido em test_phone.
                              if (botData.test_mode === true) {
                                  const testPhoneClean = String(botData.test_phone || '').replace(/\D/g, '');
                                  const clientPhoneClean = String(b.phone || '').replace(/\D/g, '');
                                  
                                  if (clientPhoneClean !== testPhoneClean) {
                                      console.warn(`[EventProcessor] Sandbox Ativo: O bot ${botData.name} está em Modo de Teste e o celular recebido (${clientPhoneClean}) é diferente do celular sandbox (${testPhoneClean}). Silenciando robô.`);
                                      return;
                                  }
                                  console.log(`[EventProcessor] Sandbox Ativo: Mensagem do celular homologado (${clientPhoneClean}) autorizada para o bot ${botData.name}.`);
                              }

                              // Roteia para a Luna (AI Agent)
                              AutomationWorker.processMessage({
                                  tenantId: b.tenantId,
                                  instanceId: b.instanceId,
                                  conversationId: b.conversationId,
                                  contactId: contactIdMap.get(`${b.tenantId}_${b.phone}`),
                                  jid: b.jid,
                                  textMessage: b.textMessage,
                                  botId: botData.id,
                                  botSettings: botData,
                                  sock: b.sock,
                                  botDelay: instanceConfig.bot_delay,
                                  botInstructions: instanceConfig.bot_instructions
                              });
                          } else if (botsData.length === 0) {
                              // Fallback para o Runtime do Flow Builder APENAS se o tenant não tiver nenhuma configuração de bot (evita double-talk)
                              FlowEngine.processIncomingMessage({
                                  tenantId: b.tenantId,
                                  instanceId: b.instanceId,
                                  conversationId: b.conversationId,
                                  jid: b.jid,
                                  textMessage: b.textMessage,
                                  rawPayload: b.rawMsg,
                                  sock: b.sock
                              }).catch(e => console.error("[BatchProcessor] Erro no FlowEngine:", e));
                          }
                      } catch (err) {
                          console.error("[EventProcessor] Erro ao buscar dados do banco ou no roteamento inteligente:", err);
                      }
                  }).catch(e => console.error("[BatchProcessor] Erro ao buscar config da instância:", e));
             }
             
             // Emitir trigger de recarregamento se houver mensagens de history no lote (pra interface atualizar em massa)
             if (realInserted.length > 0 && batch.some(b => b.isHistory)) {
                 const firstTenant = batch[0].tenantId;
                 await realtime.publishInboxEvent(firstTenant, 'history.sync.completed', {
                     count: realInserted.length
                 });
             }
             
        } catch (e) {
             console.error("[BatchProcessor] Flush Error Critico:", e);
             // Re-enfileira os itens do lote para evitar perda de dados por falha temporária do banco de dados (ex: timeout)
             if (batch && batch.length > 0) {
                 console.log(`[BatchProcessor] Enfileirando novamente ${batch.length} mensagens para evitar perda de dados por falha crítica no lote.`);
                 for (const b of batch) {
                     b.retryCount = (b.retryCount || 0) + 1;
                     if (b.retryCount < 5) {
                         this.messageQueue.unshift(b); // Adiciona no início da fila para reprocessamento
                     } else {
                         const msgId = b.rawMsg?.key?.id || 'unknown';
                         console.error(`[BatchProcessor] EXCEÇÃO CRÍTICA: Mensagem ID ${msgId} descartada definitivamente após 5 tentativas de lote falhas.`);
                         try {
                             fs.appendFileSync('discarded_messages.log', `${new Date().toISOString()} [LOTE FAILED] MsgId: ${msgId} - Payload: ${JSON.stringify(b.rawMsg)}\n`);
                         } catch (logErr) {}
                     }
                 }
             }
        } finally {
             this.isFlushing = false;
        }
    }

    async handleMessagingHistorySet(tenantId, instanceId, sock, payload) {
        if (!instanceId) return;

        // Verifica se a instância de fato existe para evitar violação de chave estrangeira
        try {
            const { data: instCheck } = await supabase.from('whatsapp_instances').select('id').eq('id', instanceId).limit(1);
            if (!instCheck || instCheck.length === 0) {
                console.warn(`[EventProcessor] Instância ${instanceId} não existe mais no banco de dados. Ignorando sincronização de histórico.`);
                return;
            }
        } catch (e) {
            console.error(`[EventProcessor] Erro ao verificar existência da instância ${instanceId} para histórico:`, e);
            return;
        }

        const chats = payload.chats || [];
        const contacts = payload.contacts || [];
        const messages = payload.messages || [];
        const isLatest = payload.isLatest || false;
        
        console.log(`[EventProcessor] Histórico Recebido: ${chats.length} chats, ${contacts.length} contatos, ${messages.length} msgs. IsLatest: ${isLatest}`);
        
        
        const ownerJid = sock?.user?.id;
        let ownerPhone = null;
        if (ownerJid) {
             ownerPhone = ownerJid.split('@')[0].split(':')[0];
        }

        // Contacts (Fazemos um lote imediato pro Histórico base)
        const mappedContactsToHistory = {};
        for (const c of contacts) {
            let jid = c.id;
            if (!jid || this.isBroadcast(jid) || this.isGroup(jid) || this.isLid(jid)) continue;
            
            const phone = jid.split('@')[0].split(':')[0];
            const cleanJid = phone + '@' + jid.split('@')[1];
            jid = cleanJid; // Limpa o JID removendo sufixo de dispositivo
            
            // Pula o próprio número
            if (ownerPhone && phone === ownerPhone) continue;

            const pushName = c.notify || c.name || phone;
            mappedContactsToHistory[`${tenantId}_${phone}`] = { tenant_id: tenantId, phone: phone, name: pushName, whatsapp_jid: jid, instance_id: instanceId };
        }
        const histContacts = Object.values(mappedContactsToHistory);
        if(histContacts.length > 0) {
             const chunkLimit = 500;
             for (let i = 0; i < histContacts.length; i += chunkLimit) {
                 const chunk = histContacts.slice(i, i + chunkLimit);
                 await supabase.from('contacts').upsert(chunk, { onConflict: 'tenant_id, phone', ignoreDuplicates: true });
             }
        }

        // Verifica se a caixa já possui histórico de conversas gravado no Supabase
        let hasExistingHistory = false;
        try {
            const { count, error } = await supabase
                .from('conversations')
                .select('*', { count: 'exact', head: true })
                .eq('instance_id', instanceId);
            
            if (!error && count > 0) {
                hasExistingHistory = true;
                console.log(`[EventProcessor] Instância ${instanceId} já possui ${count} conversas no banco de dados. Ignorando sincronização de histórico de mensagens.`);
            }
        } catch (e) {
            console.error(`[EventProcessor] Erro ao verificar histórico de conversas no Supabase:`, e);
        }

        // Histórico em Massa de Mensagens: Distribuir em Timers (apenas se for primeira conexão)
        if (!hasExistingHistory && messages && messages.length > 0) {
            // Regra Anti-Ban e Anti-Loop: Limitar a 50 Contatos, 50 mensagens por contato, fatiados a cada 10 min
            const chatMap = new Map();
            for (const m of messages) {
                const jid = m.key.remoteJid;
                // Excluir grupos e broadcasts e ids vazios
                if (!jid || jid.includes('@g.us') || jid.includes('broadcast')) continue;
                
                if (!chatMap.has(jid)) chatMap.set(jid, []);
                // Limite de 50 mensagens de histórico por conversa
                if (chatMap.get(jid).length < 50) {
                     chatMap.get(jid).push(m);
                }
            }
            
            const validJids = Array.from(chatMap.keys());
            // Teto Global: 50 Contatos 
            const top50 = validJids.slice(0, 50);
            
            const batches = [];
            for (let i = 0; i < top50.length; i += 5) {
                batches.push(top50.slice(i, i + 5)); // Lotes de 5 contatos
            }
            
            console.log(`[EventProcessor] Sincronização Fragmentada de Histórico. Batches: ${batches.length} (5 contatos a cada 10m, cap de 50 contatos)`);

            batches.forEach((batch, index) => {
                 const msgsToProcess = [];
                 batch.forEach(jid => msgsToProcess.push(...chatMap.get(jid)));
                 
                 const chronologicMessages = msgsToProcess.reverse();
                 
                 // Lote 0 (Ponto de contato inicial) roda quase imediato. O restante avança em 10 Min (600,000 milissegundos)
                 const delayMs = index === 0 ? 5000 : index * 600000;
                 
                 setTimeout(async () => {
                      if (!sock) {
                          console.log(`[EventProcessor] Abortando Lote ${index+1}/${batches.length} do History Sync. Sock is undefined.`);
                          return;
                      }
                      await this.handleMessageUpsert(tenantId, instanceId, sock, { messages: chronologicMessages, type: 'append' });
                      console.log(`[EventProcessor] Sync Histórico do Lote ${index+1}/${batches.length} finalizado e enviado p/ UPSERT. (Registros no Lote: ${chronologicMessages.length})`);
                 }, delayMs);
            });
        }
        
        console.log(`[EventProcessor] Sync histórico absorvido e em processamento background.`);
    }

    async handleChatsUpsert(tenantId, instanceId, sock, chats) {
        console.log(`[EventProcessor] Novas chats (upsert): ${chats?.length}`);
    }

    async handleChatsUpdate(tenantId, instanceId, sock, updates) {
        // Envia para o banco numa bala se houver atualização.
        const phones = updates.map(u => u.id?.split('@')[0]?.split(':')[0]).filter(Boolean);
        if(phones.length === 0) return;
        
        const { data: contacts } = await supabase.from('contacts').select('id, phone').eq('tenant_id', tenantId).in('phone', phones);
        if(!contacts || contacts.length === 0) return;
        
        const contactIds = contacts.map(c => c.id);
        const { data: convs } = await supabase.from('conversations').select('id, contact_id').eq('tenant_id', tenantId).in('contact_id', contactIds);
        
        for (const update of updates) {
            const phone = update.id?.split('@')[0]?.split(':')[0];
            const contact = contacts.find(c => c.phone === phone);
            if(contact) {
                const conv = convs?.find(c => c.contact_id === contact.id);
                if(conv && update.unreadCount !== undefined) {
                      // Fire and forget
                      supabase.from('conversations').update({ unread_count: update.unreadCount }).eq('id', conv.id).then(()=>{});
                }
            }
        }
    }

    extractMessageContent(msg) {
        let content = msg.message;
        if (!content) return null;
        if (content.viewOnceMessage) content = content.viewOnceMessage.message;
        if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
        if (content.viewOnceMessageV2Extension) content = content.viewOnceMessageV2Extension.message;
        if (content.ephemeralMessage) content = content.ephemeralMessage.message;
        if (content.documentWithCaptionMessage) content = content.documentWithCaptionMessage.message;
        return content;
    }

    extractTextFromMessage(msg) {
        let content = this.extractMessageContent(msg);
        if (!content) return '';
        let text = '';
        if (content.conversation) text = content.conversation;
        else if (content.extendedTextMessage) text = content.extendedTextMessage.text;
        else if (content.imageMessage) text = content.imageMessage.caption || '📸 Imagem / Foto';
        else if (content.audioMessage) text = '🎵 Áudio';
        else if (content.videoMessage) text = content.videoMessage.caption || '🎥 Vídeo';
        else if (content.documentMessage) text = content.documentMessage.caption || '';
        else if (content.reactionMessage) text = '❤️ Reação: ' + content.reactionMessage.text;
        else if (content.contactMessage) text = '👤 Contato: ' + (content.contactMessage.displayName || '');
        else if (content.contactsArrayMessage) text = '👥 Múltiplos Contatos';
        else if (content.locationMessage) text = '📍 Localização';
        else if (content.stickerMessage) text = '🎫 Figurinha';
        else if (content.templateButtonReplyMessage) text = content.templateButtonReplyMessage.selectedDisplayText;
        else if (content.buttonsResponseMessage) text = content.buttonsResponseMessage.selectedDisplayText;
        else if (content.listResponseMessage) text = content.listResponseMessage.title;
        else if (content.interactiveResponseMessage) {
            try {
                if (content.interactiveResponseMessage.nativeFlowResponseMessage) {
                   const params = JSON.parse(content.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                   text = params.id || 'Opção selecionada';
                } else {
                   text = content.interactiveResponseMessage.body?.text || 'Interação Selecionada';
                }
            } catch(e) { text = 'Interação Selecionada'; }
        }
        else if (content.templateMessage) {
            try {
                const tm = content.templateMessage;
                const template = tm.hydratedTemplate || tm.hydratedFourRowTemplate || tm.fourRowTemplate || tm;
                let parts = [];
                if (template.hydratedTitleText) parts.push(`*${template.hydratedTitleText}*`);
                if (template.hydratedContentText) parts.push(template.hydratedContentText);
                else if (template.text) parts.push(template.text);
                
                if (template.hydratedFooterText) parts.push(`_${template.hydratedFooterText}_`);
                
                text = parts.length > 0 ? parts.join('\n\n') : '📱 Mensagem Interativa (Template)';
            } catch (e) { text = '📱 Mensagem Interativa (Template)'; }
        }
        else if (content.highlyStructuredMessage) {
            try {
                const hsm = content.highlyStructuredMessage;
                const template = hsm.hydratedHsm || hsm;
                let parts = [];
                if (template.hydratedTitleText) parts.push(`*${template.hydratedTitleText}*`);
                if (template.hydratedContentText) parts.push(template.hydratedContentText);
                if (template.hydratedFooterText) parts.push(`_${template.hydratedFooterText}_`);
                text = parts.length > 0 ? parts.join('\n\n') : '📱 Mensagem Estruturada (HSM)';
            } catch (e) { text = '📱 Mensagem Estruturada (HSM)'; }
        }
        else if (content.albumMessage) text = '📸 Álbum de Fotos';
        else if (content.secretEncryptedMessage) text = '✏️ Mensagem Editada';
        else if (content.buttonsMessage || content.listMessage) text = '📱 Mensagem Interativa';
        else text = '📎 Mensagem não suportada';
        // Anti-Bug: Remove caracteres nulos (\x00) que quebram o cast de JSON do PostgreSQL no Supabase (Upsert)
        return text ? String(text).replace(/\x00/g, '') : '';
    }

    extractMediaMeta(rawMsg, msgType) {
        if (!rawMsg || !rawMsg.message) return {};
        
        let content = rawMsg.message;
        if (content.viewOnceMessage) content = content.viewOnceMessage.message;
        if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;
        if (content.ephemeralMessage) content = content.ephemeralMessage.message;
        if (content.documentWithCaptionMessage) content = content.documentWithCaptionMessage.message;

        if (content[msgType + 'Message']) return content[msgType + 'Message'];
        
        if (content.templateMessage) {
            const tm = content.templateMessage;
            const template = tm.hydratedTemplate || tm.hydratedFourRowTemplate || tm.fourRowTemplate || tm;
            if (template && template[msgType + 'Message']) return template[msgType + 'Message'];
        }
        
        if (content.highlyStructuredMessage) {
            const hsm = content.highlyStructuredMessage;
            const template = hsm.hydratedHsm || hsm;
            if (template && template[msgType + 'Message']) return template[msgType + 'Message'];
        }
        
        return {};
    }

    extractTypeFromMessage(msg) {
        let content = this.extractMessageContent(msg);
        if (!content) return 'text';
        if (content.imageMessage) return 'image';
        if (content.audioMessage) return 'audio';
        if (content.videoMessage) return 'video';
        if (content.documentMessage) return 'document';
        if (content.contactMessage || content.contactsArrayMessage) return 'contact';
        if (content.locationMessage) return 'location';
        if (content.stickerMessage) return 'sticker';
        
        if (content.templateMessage) {
            const tm = content.templateMessage;
            const template = tm.hydratedTemplate || tm.hydratedFourRowTemplate || tm.fourRowTemplate || tm;
            if (template?.imageMessage) return 'image';
            if (template?.documentMessage) return 'document';
            if (template?.videoMessage) return 'video';
            if (template?.locationMessage) return 'location';
        }
        
        if (content.highlyStructuredMessage) {
            const hsm = content.highlyStructuredMessage;
            const template = hsm.hydratedHsm || hsm;
            if (template?.imageMessage) return 'image';
            if (template?.documentMessage) return 'document';
            if (template?.videoMessage) return 'video';
            if (template?.locationMessage) return 'location';
        }

        return 'text';
    }

    async handleMessageReceiptUpdate(tenantId, instanceId, sock, updates) {
        if (!updates || updates.length === 0) return;

        try {
            const instanceConfig = await this.getInstanceConfig(instanceId);
            const allowedGroups = instanceConfig.allowed_groups || [];

            for (const update of updates) {
                if (!update.key || !update.key.id) continue;
                
                const jid = update.key.remoteJid;
                
                if (jid && (this.isBroadcast(jid) || this.isLid(jid))) {
                    continue;
                }
                
                if (jid && this.isGroup(jid) && !allowedGroups.includes(jid)) {
                    continue;
                }

                // Type mapeia para read, se não for, consideramos delivered.
                let newStatus = 'delivered';
                if (update.receipt?.type === 'read' || update.receipt?.type === 'read-self') {
                    newStatus = 'read';
                }

                // Salva na memória p/ flushQueue (novas mensagens)
                this.updatePendingStatus(update.key.id, newStatus);
                // Enfileira p/ reconciliation (mensagens já existentes)
                this.queueStatusUpdate(tenantId, instanceId, update.key.id, newStatus);
            }

        } catch (e) {
             console.error(`[EventProcessor] Erro processando recibo (message-receipt.update):`, e);
        }
    }

    async handleMessagesUpdate(tenantId, instanceId, sock, updates) {
        if (!updates || updates.length === 0) return;

        try {
            for (const item of updates) {
                const { key, update } = item;
                if (!key || !key.id || update.status === undefined || update.status === null) continue;

                // WAMessageStatus enum: 
                // 2 = SERVER_ACK, 3 = DELIVERY_ACK, 4 = READ, 5 = PLAYED
                let newStatus = null;
                if (update.status === 2) newStatus = 'SERVER_ACK';
                if (update.status === 3) newStatus = 'delivered';
                if (update.status === 4 || update.status === 5) newStatus = 'read';

                if (newStatus) {
                    // Salva na memória p/ flushQueue
                    this.updatePendingStatus(key.id, newStatus);
                    // Enfileira p/ reconciliation assíncrona
                    this.queueStatusUpdate(tenantId, instanceId, key.id, newStatus);
                }
            }
        } catch (e) {
             console.error(`[EventProcessor] Erro processando status (messages.update):`, e);
        }
    }

    async handleConnectionUpdate(tenantId, instanceId, update) {
        const { connection, lastDisconnect, qr } = update;
        const payload = {};
        let eventName = 'instance.status';

        try {
            if (qr) {
                try {
                    const qrBase64 = await qrcode.toDataURL(qr);
                    payload.qr_code = qrBase64;
                    eventName = 'instance.qr_updated';
                    await supabase.from('whatsapp_instance_runtime')
                        .upsert({ instance_id: instanceId, tenant_id: tenantId, qr_code: qrBase64 }, { onConflict: 'instance_id' });
                } catch(e) {}
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                const loggedOut = reason === 401;
                const isTransient = [102, 408, 428, 440, 503, 515, 1006].includes(reason) || !reason;

                if (isTransient) {
                    await supabase.from('whatsapp_instances')
                        .update({ status: 'connecting', last_error: `Reconnecting (Code: ${reason})` })
                        .eq('id', instanceId)
                        .eq('assigned_node_id', NODE_ID);
                    payload.status = 'connecting';
                    payload.reason = reason;
                } else {
                    const errMsg = reason === 409
                        ? 'Desconectado por conflito: Outro dispositivo se conectou a esta conta de WhatsApp. O sistema suspendeu reconexões automáticas.'
                        : `Code: ${reason}`;
                    await supabase.from('whatsapp_instances')
                        .update({ status: 'offline', last_error: errMsg })
                        .eq('id', instanceId)
                        .eq('assigned_node_id', NODE_ID);
                    payload.status = 'offline';
                    payload.reason = reason;
                    if(loggedOut) payload.loggedOut = true;
                }
            }

            if (connection === 'open') {
                await supabase.from('whatsapp_instances')
                    .update({ status: 'connected', last_error: null })
                    .eq('id', instanceId)
                    .eq('assigned_node_id', NODE_ID);
                await supabase.from('whatsapp_instance_runtime').upsert({ instance_id: instanceId, tenant_id: tenantId, qr_code: null }, { onConflict: 'instance_id' });
                payload.status = 'connected';
            }

            if (Object.keys(payload).length > 0) {
               await realtime.publishInstanceEvent(tenantId, instanceId, eventName, payload);
            }
        } catch (err) {
            console.error("Erro no event connectionHandler:", err);
        }
    }
}

export { EventProcessor };
EventProcessor.pendingMediaCache = new Map();
EventProcessor.humanMessagesCache = new Map();
EventProcessor.automationMessagesCache = new Map();
export default new EventProcessor();

export async function dispatchWebhookTriggers(tenantId, eventType, data) {
    try {
        const { data: triggers, error } = await supabase
            .from('webhook_triggers')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('event_type', eventType)
            .eq('is_active', true);

        if (error) {
            console.error(`[WebhookTrigger] Erro ao buscar gatilhos para o tenant ${tenantId}:`, error);
            return;
        }

        if (!triggers || triggers.length === 0) return;

        for (const trigger of triggers) {
            let processedUrl = trigger.url;
            let processedBody = trigger.body_template || '{}';

            // Substituir tokens simples
            const tokens = {
                '{{event}}': eventType || '',
                '{{tenant_id}}': tenantId || '',
                '{{phone}}': data.phone || '',
                '{{message}}': data.message || '',
                '{{conversation_id}}': data.conversation_id || '',
                '{{contact_id}}': data.contact_id || ''
            };

            for (const [token, value] of Object.entries(tokens)) {
                processedUrl = processedUrl.replaceAll(token, value);
                processedBody = processedBody.replaceAll(token, value);
            }

            const fetchOptions = {
                method: trigger.action_type === 'webhook_get' ? 'GET' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(trigger.headers || {})
                }
            };

            if (trigger.action_type === 'webhook_post') {
                fetchOptions.body = processedBody;
            }

            console.log(`[WebhookTrigger] Disparando gatilho '${trigger.name}' (${trigger.action_type}) para: ${processedUrl}`);
            fetch(processedUrl, fetchOptions)
                .then(async (res) => {
                    console.log(`[WebhookTrigger] Gatilho '${trigger.name}' respondeu com status ${res.status}`);
                })
                .catch((err) => {
                    console.error(`[WebhookTrigger] Falha ao enviar requisição para '${trigger.name}':`, err.message);
                });
        }
    } catch (e) {
        console.error('[WebhookTrigger] Falha ao executar gatilhos:', e);
    }
}
