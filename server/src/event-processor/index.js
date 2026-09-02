import { supabase, NODE_ID, retryWithBackoff, resolveTargetJid } from '../supabase.js';
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
import { logAndNotifyConnectionEvent } from './connection-notifier.js';
import {
    isBroadcast,
    isGroup,
    isLid,
    extractMessageContent,
    extractTextFromMessage,
    extractMediaMeta,
    extractTypeFromMessage,
    getCanonicalBrPhone,
    getBrPhoneVariations
} from './helpers.js';

class EventProcessor {
    constructor() {
        this.messageQueue = [];
        this.isFlushing = false;
        
        // Loop de processamento em lote a cada 500ms.
        setInterval(() => this.flushQueue(), 500);
        
        this.tenantConfigs = new Map();
        this.instanceConfigs = new Map();
        this.lastGlobalMessageTimestamp = 0;
        
        this.pendingStatuses = new Map();
        this.processedMessagesCache = new Map(); // Cache de deduplicação de mensagens recentes
        this.statusUpdateQueue = new Map(); // Fila assíncrona para status atrasados
        this.aiSendRateLimiter = new Map(); // Rastreio de taxa de disparos automáticos por conversa para anti-spam
        this.isFlushingStatus = false;
        
        // Loop de reconciliation assíncrono para status (a cada 1s)
        setInterval(() => this.flushStatusQueue(), 1000);

        // Loop de auto-recuperação de mensagens não sincronizadas (Self-Healing a cada 30s)
        setInterval(() => this.reconcileMissingMessages(), 30000);
        
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

    async reconcileMissingMessages() {
        try {
            if (!this.reconciliationAttempts) {
                this.reconciliationAttempts = new Set();
            }
            // Limpa o set se ultrapassar 2000 entradas para evitar memory leak
            if (this.reconciliationAttempts.size > 2000) {
                this.reconciliationAttempts.clear();
            }

            const fifteenMinutesAgo = new Date(Date.now() - 15 * 60000).toISOString();
            const { data: rawMessages, error } = await supabase
                .from('wa_incoming_messages')
                .select('instance_id, tenant_id, message_id, raw_payload, from_me, chat_jid, message_type')
                .gte('received_at', fifteenMinutesAgo)
                .eq('from_me', false)
                .order('received_at', { ascending: true })
                .limit(100);

            if (error || !rawMessages || rawMessages.length === 0) return;

            // Filtra mensagens que não são de broadcast, não são protocolMessages e ainda não foram verificadas
            const candidateMessages = rawMessages.filter(r => 
                r.message_id && 
                !this.reconciliationAttempts.has(r.message_id) && 
                !this.isBroadcast(r.chat_jid) &&
                r.message_type !== 'protocolMessage' &&
                r.message_type !== 'senderKeyDistributionMessage' &&
                r.raw_payload
            );

            if (candidateMessages.length === 0) return;

            const messageIds = candidateMessages.map(r => r.message_id);
            const { data: existingMessages } = await supabase
                .from('messages')
                .select('whatsapp_message_id')
                .in('whatsapp_message_id', messageIds);

            const existingSet = new Set((existingMessages || []).map(m => m.whatsapp_message_id));
            const missingRaw = candidateMessages.filter(r => !existingSet.has(r.message_id));

            // Marca os candidatos no cache de verificação para não gerar loops a cada 30 segundos
            for (const r of candidateMessages) {
                this.reconciliationAttempts.add(r.message_id);
            }

            if (missingRaw.length > 0) {
                console.log(`[EventProcessor] Self-Healing: Re-processando ${missingRaw.length} mensagens reais pendentes...`);
                for (const r of missingRaw) {
                    await this.handleMessageUpsert(r.tenant_id, r.instance_id, null, { messages: [r.raw_payload], type: 'reconcile' });
                }
            }
        } catch (e) {
            console.error('[EventProcessor] Erro no reconcileMissingMessages:', e);
        }
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

    async resolveLidToPhone(instanceId, jid, sock, allowDbQuery = true) {
        if (!jid || !jid.includes('@lid')) return null;
        
        const cleanLid = jid.split('@')[0];
        
        // 1. Try socket repository RAM
        if (sock?.signalRepository?.lidMapping) {
            try {
                const resolvedPn = await sock.signalRepository.lidMapping.getPNForLID(jid);
                if (resolvedPn && resolvedPn.includes('@s.whatsapp.net')) {
                    return resolvedPn;
                }
            } catch (err) {
                console.error('[EventProcessor] Erro resolveLidToPhone (SignalRepository):', err);
            }
        }
        
        // 2. Try memory cache RAM
        try {
            const { sessionCaches } = await import('../session-manager/auth.js');
            const memCache = sessionCaches.get(instanceId);
            if (memCache) {
                const mappedPhone = memCache.get(`lid-mapping-${cleanLid}_reverse`);
                if (mappedPhone) {
                    return `${mappedPhone}@s.whatsapp.net`;
                }
            }
        } catch (e) {
            // Silenciado
        }

        if (!allowDbQuery) return null;
        
        // 3. Try global wa_auth_keys query (LID mappings are globally constant)
        try {
            const { data: dbKeys } = await supabase
                .from('wa_auth_keys')
                .select('key_data')
                .eq('key_name', `lid-mapping-${cleanLid}_reverse`)
                .limit(1);
            if (dbKeys && dbKeys.length > 0 && dbKeys[0].key_data) {
                return `${dbKeys[0].key_data}@s.whatsapp.net`;
            }
        } catch (e) {
            // Silenciado
        }
        
        // 4. Try global contacts query
        try {
            const { data: dbContact } = await supabase
                .from('contacts')
                .select('phone')
                .eq('whatsapp_jid', jid)
                .limit(1);
            if (dbContact && dbContact.length > 0 && dbContact[0].phone) {
                return `${dbContact[0].phone}@s.whatsapp.net`;
            }
        } catch (e) {
            // Silenciado
        }
        
        return null;
    }

    async handleMessageUpsert(tenantId, instanceId, sock, m) {
        if (!m || !m.messages || !Array.isArray(m.messages) || m.messages.length === 0) return;
 
        for (const msg of m.messages) {
            if (!msg || !msg.key) continue;
            const msgId = msg.key?.id;
            if (msgId) {
                const safeInstanceId = instanceId || 'null_instance';
                const cacheKey = `${safeInstanceId}_${msgId}`;
                
                // Ignora stubs de falha de descriptografia (ex: Message absent from node) na validação do cache,
                // permitindo que o retry natural do WhatsApp/Baileys seja processado com sucesso.
                const isDecryptionFailureStub = msg.messageStubType && !msg.message;
                const isHistorySync = m.type === 'append' || m.type === 'reconcile';

                const instanceConfig = await this.getInstanceConfig(instanceId);

                // Se a instância tiver sync_history === false ou is_api_only === true, ignora cargas de histórico antigo
                if ((instanceConfig.sync_history === false || instanceConfig.is_api_only === true) && isHistorySync) {
                    console.log(`[EventProcessor] Ignorando payload de histórico antigo/legado para instância API Gateway (${instanceId}).`);
                    continue;
                }
                
                if (!isDecryptionFailureStub && !isHistorySync && this.processedMessagesCache.has(cacheKey)) {
                    console.log(`[EventProcessor] Mensagem Duplicada Detectada em Cache de Memória (Ignorando). ID: ${msgId}`);
                    continue;
                }
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
                } else {
                    const resolvedPn = await this.resolveLidToPhone(instanceId, jid, sock);
                    if (resolvedPn) {
                        jid = resolvedPn;
                    }
                }
            }

            if (!jid) continue;

            // Grava a mensagem na tabela wa_incoming_messages (logs do Edge)
            try {
                const fromMe = msg.key.fromMe || false;
                const pushName = msg.pushName || (fromMe ? 'Me' : null);
                let bodyText = '';
                let mType = 'text';
                
                const content = msg.message;
                if (content) {
                    const keys = Object.keys(content);
                    if (keys.length > 0) {
                        mType = keys[0];
                        const mTypeObj = content[mType];
                        bodyText = content.conversation || mTypeObj?.text || mTypeObj?.caption || '';
                    }
                }

                const { error: incErr } = await supabase.from('wa_incoming_messages').upsert({
                    instance_id: instanceId,
                    tenant_id: tenantId,
                    chat_jid: jid,
                    message_id: msg.key.id,
                    from_me: fromMe,
                    push_name: pushName,
                    body: bodyText,
                    message_type: mType,
                    raw_payload: msg
                }, { onConflict: 'instance_id, message_id' });
                if (incErr) {
                    console.warn('[EventProcessor] Aviso ao gravar wa_incoming_messages:', incErr.message);
                }
            } catch (err) {
                console.warn('[EventProcessor] Falha de conexão ao gravar wa_incoming_messages (não impeditivo):', err.message);
            }
            
            const instanceConfig = await this.getInstanceConfig(instanceId);
            const allowedGroups = instanceConfig.enabled_groups || instanceConfig.allowed_groups || instanceConfig.enabledGroups || instanceConfig.allowedGroups || [];
            
            // Ignora status e LIDs isolados sem conteúdo de mensagem
            if (this.isBroadcast(jid) || (this.isLid(jid) && !msg.message)) {
                continue;
            }
            
            // Ignora grupos se não estiverem na lista de permitidos
            if (this.isGroup(jid)) {
                if (!allowedGroups.includes(jid)) {
                    continue;
                }
            }

            // [LID Sync / Ciphertext Error Override]
            // Ignora stubs de falha de descriptografia (ex: Message absent from node)
            // Se salvarmos isso como mensagem vazia, o retry natural da Baileys será descartado por duplicidade de ID.
            if (msg.messageStubType && !msg.message) {
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

                const isHuman = EventProcessor.humanMessagesCache && EventProcessor.humanMessagesCache.has(`${instanceId}_${msg.key.id}`);
                const isAutomation = EventProcessor.automationMessagesCache && EventProcessor.automationMessagesCache.has(`${instanceId}_${msg.key.id}`);
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
                    if (p.type === 14 || p.type === 'MESSAGE_EDIT' || p.editedMessage || content.editedMessage) {
                        const targetMsgId = p.key?.id || msg.key?.id;
                        if (targetMsgId) {
                             let newText = this.extractTextFromMessage({ message: p.editedMessage || content.editedMessage });
                             if (newText) {
                                 // Busca a mensagem original no banco para preservar o texto original
                                 supabase.from('messages')
                                     .select('id, text_content, raw_payload, status')
                                     .eq('whatsapp_message_id', targetMsgId)
                                     .maybeSingle()
                                     .then(async ({ data: existingMsg }) => {
                                         if (existingMsg) {
                                             const originalText = existingMsg.raw_payload?.original_text || existingMsg.text_content || '';
                                             const updatedPayload = {
                                                 ...(existingMsg.raw_payload || {}),
                                                 is_edited: true,
                                                 original_text: originalText,
                                                 edited_text: newText,
                                                 edited_at: new Date().toISOString()
                                             };

                                             await supabase.from('messages')
                                                 .update({
                                                     text_content: newText,
                                                     status: 'edited',
                                                     raw_payload: updatedPayload,
                                                     updated_at: new Date().toISOString()
                                                 })
                                                 .eq('id', existingMsg.id);

                                             console.log(`[EventProcessor] Mensagem editada atualizada com sucesso! ID: ${targetMsgId} | Texto Original: "${originalText}" -> Novo: "${newText}"`);

                                             realtime.publishInboxEvent(tenantId, 'message.update', {
                                                 id: existingMsg.id,
                                                 whatsapp_message_id: targetMsgId,
                                                 text_content: newText,
                                                 status: 'edited',
                                                 raw_payload: updatedPayload
                                             }).catch(() => {});
                                         }
                                     })
                                     .catch(err => console.error('[EventProcessor] Erro ao atualizar mensagem editada:', err));
                             }
                        }
                        // Sempre pula o enfileiramento de protocolMessage de edição para evitar mensagens duplicadas fantasma na UI
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

                // Marca no cache apenas quando a mensagem é válida e efetivamente enfileirada
                if (msg.key?.id) {
                    const safeInstanceId = instanceId || 'null_instance';
                    this.processedMessagesCache.set(`${safeInstanceId}_${msg.key.id}`, Date.now());
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
                    isHistory: Boolean(m.type === 'append' || m.type === 'reconcile' || (tsDate && (Date.now() - tsDate.getTime() > 60000)))
                });

                // Otimização de Baixa Latência (<1s): Força flush imediato da fila para mensagens em tempo real
                // (tanto mensagens do cliente no WhatsApp quanto do atendente no CRM)
                const isLiveRealtime = !Boolean(m.type === 'append' || m.type === 'reconcile' || (tsDate && (Date.now() - tsDate.getTime() > 60000)));
                if (senderType === 'human' || isLiveRealtime) {
                    setTimeout(() => this.flushQueue(), 10);
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

        // Helper para variação de telefones brasileiros (8 vs 9 dígitos em DDDs BR 55+11..29)
        const getBrPhoneVariations = (phoneStr) => {
            if (!phoneStr) return [];
            const clean = String(phoneStr).replace(/\D/g, '');
            if (!clean) return [];
            const res = [clean];
            if (clean.startsWith('55') && clean.length === 13 && clean.charAt(4) === '9') {
                res.push(clean.substring(0, 4) + clean.substring(5));
            } else if (clean.startsWith('55') && clean.length === 12) {
                res.push(clean.substring(0, 4) + '9' + clean.substring(4));
            } else if (!clean.startsWith('55')) {
                res.push('55' + clean);
                if (clean.length === 11 && clean.charAt(2) === '9') {
                    res.push('55' + clean.substring(0, 2) + clean.substring(3));
                } else if (clean.length === 10) {
                    res.push('55' + clean.substring(0, 2) + '9' + clean.substring(2));
                }
            }
            return Array.from(new Set(res));
        };

        // DUAL-ROUTING MULTI-INSTÂNCIA INTERNA
        // Se a mensagem for outbound e o destinatário b.phone corresponder a uma outra instância ativa do mesmo tenant,
        // gera a mensagem espelhada de inbound para a instância destinatária caso ela não conste no lote.
        try {
            const tenantIds = Array.from(new Set(batch.map(b => b.tenantId).filter(Boolean)));
            if (tenantIds.length > 0) {
                const { data: allTenantInstances } = await supabase
                    .from('whatsapp_instances')
                    .select('id, tenant_id, phone_number, display_name')
                    .in('tenant_id', tenantIds);

                if (allTenantInstances && allTenantInstances.length > 1) {
                    const instByPhone = new Map();
                    for (const inst of allTenantInstances) {
                        if (inst.phone_number) {
                            for (const v of getBrPhoneVariations(inst.phone_number)) {
                                instByPhone.set(`${inst.tenant_id}_${v}`, inst);
                            }
                        }
                    }

                    const extraClones = [];
                    for (const b of batch) {
                        if (b.direction === 'outbound' && b.tenantId && b.instanceId) {
                            const targetInst = instByPhone.get(`${b.tenantId}_${b.phone}`);
                            if (targetInst && targetInst.id !== b.instanceId) {
                                const senderInst = allTenantInstances.find(i => i.id === b.instanceId);
                                const senderPhone = senderInst?.phone_number || 'desconhecido';
                                
                                const alreadyInBatch = batch.some(x => x.instanceId === targetInst.id && x.direction === 'inbound' && (x.phone === senderPhone || x.textMessage === b.textMessage));
                                if (!alreadyInBatch) {
                                    extraClones.push({
                                        ...b,
                                        instanceId: targetInst.id,
                                        phone: senderPhone,
                                        jid: `${senderPhone}@s.whatsapp.net`,
                                        pushName: senderInst?.display_name || senderPhone,
                                        direction: 'inbound',
                                        senderType: 'client'
                                    });
                                }
                            }
                        }
                    }
                    if (extraClones.length > 0) {
                        console.log(`[BatchProcessor] Dual-Routing: Adicionadas ${extraClones.length} mensagens de inbound espelhadas entre instâncias internas.`);
                        batch.push(...extraClones);
                    }
                }
            }
        } catch (dualErr) {
            console.warn('[BatchProcessor] Aviso no Dual-Routing de instâncias internas:', dualErr.message);
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
              
              // Busca variações com 8 e 9 dígitos para evitar duplicatas fantasma em TODOS os tenants do lote
              const phonesToSeek = Array.from(new Set(contactsArray.flatMap(c => {
                  const phone = c.phone || (c.whatsapp_jid ? c.whatsapp_jid.split('@')[0] : null);
                  return phone ? getBrPhoneVariations(phone) : [];
              })));
              const tenantIdsToSeek = Array.from(new Set(contactsArray.map(c => c.tenant_id).filter(Boolean)));
              
              let existingMap = new Map();
              const contactBotStatusMap = new Map();
              if (tenantIdsToSeek.length > 0 && phonesToSeek.length > 0) {
                  const { data: existingDbContacts } = await supabase.from('contacts')
                      .select('*')
                      .in('tenant_id', tenantIdsToSeek)
                      .in('phone', phonesToSeek);
                      
                  if (existingDbContacts) {
                      for (const e of existingDbContacts) {
                          const mainKey = `${e.tenant_id}_${e.phone}`;
                          existingMap.set(mainKey, e);
                          if (e.whatsapp_jid) {
                              existingMap.set(`${e.tenant_id}_${e.whatsapp_jid}`, e);
                          }
                          const vars = getBrPhoneVariations(e.phone);
                          for (const v of vars) {
                              const varKey = `${e.tenant_id}_${v}`;
                              if (!existingMap.has(varKey)) {
                                  existingMap.set(varKey, e);
                              }
                          }
                          const isTempPaused = e.bot_paused_until && new Date(e.bot_paused_until) > new Date();
                          contactBotStatusMap.set(e.id, (e.bot_status === 'paused' || isTempPaused) ? 'paused' : 'active');
                      }
                  }
              }

              const uniqueContactsMap = new Map();
              for (const c of contactsArray) {
                  if (!c.phone && !c.whatsapp_jid) continue;
                  const rawPhone = c.phone || (c.whatsapp_jid ? c.whatsapp_jid.split('@')[0] : null);
                  if (!rawPhone) continue;

                  const currentTenant = c.tenant_id || '00000000-0000-0000-0000-000000000000';
                  let ex = existingMap.get(`${currentTenant}_${rawPhone}`) || (c.whatsapp_jid ? existingMap.get(`${currentTenant}_${c.whatsapp_jid}`) : null);
                  if (!ex) {
                      const vars = getBrPhoneVariations(rawPhone);
                      for (const v of vars) {
                          ex = existingMap.get(`${currentTenant}_${v}`);
                          if (ex) break;
                      }
                  }

                  const targetPhone = ex?.phone || rawPhone;
                  const key = `${currentTenant}_${targetPhone}`;

                  if (!uniqueContactsMap.has(key)) {
                      const isGroupContact = (c.whatsapp_jid && c.whatsapp_jid.endsWith('@g.us')) || targetPhone.endsWith('@g.us');
                      let finalName;
                      if (isGroupContact) {
                          finalName = ex?.custom_name || ex?.name || (c.name && !c.name.includes('@g.us') && c.name !== targetPhone ? c.name : 'Grupo de WhatsApp');
                      } else {
                          const hasValidOldName = ex && ex.name && ex.name !== ex.phone && ex.name !== targetPhone;
                          finalName = ex?.custom_name ? ex.custom_name : (hasValidOldName ? ex.name : (c.name || targetPhone));
                      }
                      let finalJid = c.whatsapp_jid;
                      if (!finalJid || finalJid.endsWith('@lid')) {
                          finalJid = `${targetPhone}@s.whatsapp.net`;
                      }

                      const validUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                      const rawId = ex?.id || (c.id && typeof c.id === 'string' && !c.id.includes('_') && c.id.length > 20 ? c.id : null);
                      const strId = rawId ? String(rawId).trim() : '';
                      const contactId = (strId && strId !== 'null' && strId !== 'undefined' && validUuidRegex.test(strId)) ? strId : crypto.randomUUID();

                      uniqueContactsMap.set(key, {
                          id: contactId,
                          tenant_id: currentTenant,
                          phone: targetPhone,
                          name: finalName,
                          whatsapp_jid: finalJid,
                          instance_id: c.instance_id || ex?.instance_id || null,
                          is_existing: Boolean(ex && ex.id),
                          ...(ex ? {
                              custom_name: ex.custom_name || null,
                              company_ids: ex.company_ids || [],
                              tags: ex.tags || [],
                              notes: ex.notes || null,
                              email: ex.email || null,
                              document_number: ex.document_number || null,
                              document_type: ex.document_type || null,
                              fantasy_name: ex.fantasy_name || null
                          } : {})
                      });
                  }
              }

              const allContactsToProcess = Array.from(uniqueContactsMap.values());
              const contactsToUpdate = [];
              const contactsToInsert = [];

              for (const item of allContactsToProcess) {
                  const { is_existing, ...contactPayload } = item;
                  if (is_existing) {
                      contactsToUpdate.push(contactPayload);
                  } else {
                      contactsToInsert.push(contactPayload);
                  }
              }
              
              let upsertedContacts = [];

              // 1. Atualizar contatos que já existem (onConflict por 'id' garante que NUNCA altera a primary key e evita erro 23503)
              if (contactsToUpdate.length > 0) {
                  const { data: resUp, error: errUp } = await supabase.from('contacts')
                      .upsert(contactsToUpdate, { onConflict: 'id' })
                      .select('id, tenant_id, phone, whatsapp_jid');
                  if (!errUp && resUp) {
                      upsertedContacts.push(...resUp);
                  } else {
                      // Se falhar em lote, preserva referências conhecidas
                      upsertedContacts.push(...contactsToUpdate);
                  }
              }

              // 2. Inserir novos contatos (onConflict por 'tenant_id, phone' cria ou ignora sem colidir)
              if (contactsToInsert.length > 0) {
                  const { data: resIns, error: errIns } = await supabase.from('contacts')
                      .upsert(contactsToInsert, { onConflict: 'tenant_id, phone', ignoreDuplicates: false })
                      .select('id, tenant_id, phone, whatsapp_jid');
                  
                  if (!errIns && resIns) {
                      upsertedContacts.push(...resIns);
                  } else if (errIns) {
                      console.warn('[BatchProcessor] Inserção de novos contatos em lote falhou (código ' + errIns.code + '): ' + errIns.message + '. Aplicando resolução resiliente...');
                      
                      // Busca contatos no DB para garantir recuperação de IDs reais em caso de concorrência
                      const { data: fallbackContacts } = await supabase.from('contacts')
                          .select('id, tenant_id, phone, whatsapp_jid')
                          .in('tenant_id', tenantIdsToSeek.length > 0 ? tenantIdsToSeek : ['00000000-0000-0000-0000-000000000000'])
                          .in('phone', phonesToSeek);

                      const fallbackIdMap = new Map();
                      if (fallbackContacts) {
                          for (const fb of fallbackContacts) {
                              fallbackIdMap.set(`${fb.tenant_id}_${fb.phone}`, fb);
                              for (const v of getBrPhoneVariations(fb.phone)) {
                                  fallbackIdMap.set(`${fb.tenant_id}_${v}`, fb);
                              }
                          }
                      }

                      for (const item of contactsToInsert) {
                          const existingFb = fallbackIdMap.get(`${item.tenant_id}_${item.phone}`);
                          if (existingFb) {
                              upsertedContacts.push(existingFb);
                          } else {
                              try {
                                  const { data: singleRes } = await supabase.from('contacts')
                                      .upsert(item, { onConflict: 'tenant_id, phone' })
                                      .select('id, tenant_id, phone, whatsapp_jid');
                                  if (singleRes && singleRes.length > 0) {
                                      upsertedContacts.push(...singleRes);
                                  } else {
                                      upsertedContacts.push(item);
                                  }
                              } catch (sErr) {
                                  console.error('[BatchProcessor] Erro na inserção individual de contato:', sErr.message);
                                  upsertedContacts.push(item);
                              }
                          }
                      }
                  }
              }
             
             const contactIdMap = new Map(); // phone+tenant -> contact_id (mapeia variações 8 e 9 dígitos)
             for (const c of upsertedContacts) {
                 contactIdMap.set(`${c.tenant_id}_${c.phone}`, c.id);
                 if (c.whatsapp_jid) {
                     contactIdMap.set(`${c.tenant_id}_${c.whatsapp_jid}`, c.id);
                 }
                 const vars = getBrPhoneVariations(c.phone);
                 for (const v of vars) {
                     contactIdMap.set(`${c.tenant_id}_${v}`, c.id);
                 }
             }
             
              const convMap = new Map();
              for(const b of batch) {
                  let cid = contactIdMap.get(`${b.tenantId}_${b.phone}`);
                  if (!cid) {
                      const targetPhone = getCanonicalBrPhone(b.phone) || b.phone;
                      const fallbackContact = safeContactsArray.find(sc => sc.tenant_id === b.tenantId && (sc.phone === targetPhone || sc.phone === b.phone));
                      cid = fallbackContact?.id || crypto.randomUUID();
                      contactIdMap.set(`${b.tenantId}_${b.phone}`, cid);
                  }

                  const key = `${b.tenantId}_${b.instanceId || 'null_instance'}_${cid}`;
                  if (!convMap.has(key)) {
                      convMap.set(key, {
                          tenant_id: b.tenantId,
                          instance_id: b.instanceId,
                          contact_id: cid,
                          unread_count: 0,
                          last_message_preview: b.textMessage,
                          last_message_at: b.timestamp,
                          status: 'resolved',
                          has_inbound: false,
                          has_human_outbound: false,
                          has_automation_outbound: false,
                          only_automation_outbound: true
                      });
                  }
                  
                  const conv = convMap.get(key);
                  if (b.timestamp >= conv.last_message_at) {
                      conv.last_message_preview = b.textMessage;
                      conv.last_message_at = b.timestamp;
                  }
                  if (!b.isHistory) {
                      if (b.direction === 'inbound') {
                          conv.unread_count += 1;
                          conv.has_inbound = true;
                          conv.only_automation_outbound = false;
                      }
                      if (b.direction === 'outbound') {
                          if (b.senderType === 'automation') {
                              conv.has_automation_outbound = true;
                          } else if (b.senderType === 'human') {
                              conv.has_human_outbound = true;
                              conv.only_automation_outbound = false;
                              AutomationWorker.cancelPendingMessage(b.conversationId);
                              AutomationWorker.cancelPendingMessage(b.jid);
                          } else {
                              conv.only_automation_outbound = false;
                          }
                      }
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
                 const instanceKey = e.instance_id || 'null_instance';
                 existingConvMap.set(`${e.tenant_id}_${instanceKey}_${e.contact_id}`, e);
             }
             
             const toInsertConvs = [];
             const toUpdateConvs = []; 
             
             const updatedStatusMap = new Map();
             const updatedAiPausedMap = new Map();
             
             for(const [key, data] of convMap.entries()) {
                 const exist = existingConvMap.get(key);
                 const contactBotStatus = contactBotStatusMap.get(data.contact_id) || 'active';
                 const isContactPaused = contactBotStatus === 'paused';

                 let finalStatus = 'resolved';
                 let finalAiPaused = false;
                 
                 if(exist) {
                     let nextStatus = exist.status || 'resolved';
                     let nextAiPaused = exist.ai_paused || isContactPaused || false;
                     const isOldHistory = data.last_message_at && (Date.now() - new Date(data.last_message_at).getTime() > 24 * 60 * 60 * 1000);
                      
                     // Regra Estrita: Se o lote não possuir mensagem recebida do cliente (inbound) nem envio humano expresso,
                     // MANTÉM intacto o status existente (se estava 'resolved', continua 'resolved', NUNCA reabre ticket!)
                     if (!data.has_inbound && !data.has_human_outbound) {
                         nextStatus = exist.status || 'resolved';
                     } else if ((exist.status === 'resolved' || exist.status === 'closed' || exist.status === 'snoozed') && !isOldHistory) {
                          if (data.has_inbound) {
                              nextStatus = (nextAiPaused || isContactPaused) ? 'open' : 'bot';
                          } else if (data.has_human_outbound) {
                              nextStatus = 'open';
                          }
                      }

                      // Transição automática de open para bot se receber inbound e a IA estiver ativa
                      if (exist.status === 'open' && data.has_inbound) {
                          nextStatus = (nextAiPaused || isContactPaused) ? 'open' : 'bot';
                      }
                      
                      if (data.has_human_outbound) {
                          nextAiPaused = true;
                      }
                      
                      finalStatus = nextStatus;
                      
                      const updatePayload = {
                          id: exist.id,
                          tenant_id: exist.tenant_id || data.tenant_id,
                          instance_id: data.instance_id || exist.instance_id,
                          contact_id: exist.contact_id || data.contact_id,
                          unread_count: Number(exist.unread_count || 0) + Number(data.unread_count || 0),
                          last_message_preview: Array.from(String(data.last_message_preview || '')).slice(0, 500).join(''),
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
                     let initialAiPaused = isContactPaused || false;
                     const isOldHistory = data.last_message_at && (Date.now() - new Date(data.last_message_at).getTime() > 24 * 60 * 60 * 1000);
                     if (!isOldHistory) {
                         if (data.has_inbound) {
                             initialStatus = isContactPaused ? 'open' : 'bot';
                             initialAiPaused = isContactPaused;
                         } else if (data.has_human_outbound) {
                             initialStatus = 'open';
                             initialAiPaused = true;
                         } else {
                             // Qualquer mensagem outbound (automação, status de pedido, notificação) inicia como 'resolved' (SEM abrir ticket!)
                             initialStatus = 'resolved';
                         }
                     }
                     
                     finalStatus = initialStatus;
                     finalAiPaused = initialAiPaused;
                     
                     toInsertConvs.push({
                         id: crypto.randomUUID(),
                         tenant_id: data.tenant_id,
                         instance_id: data.instance_id,
                         contact_id: data.contact_id,
                         status: initialStatus,
                         unread_count: data.unread_count,
                         last_message_preview: Array.from(String(data.last_message_preview || '')).slice(0, 500).join(''),
                         last_message_at: data.last_message_at.toISOString(),
                         ai_paused: initialAiPaused
                     });
                 }
                 
                 updatedStatusMap.set(key, finalStatus);
                 updatedAiPausedMap.set(key, finalAiPaused);
             }
             
             const insertedConvs = [];
              if(toInsertConvs.length > 0) {
                  const { data: res, error: errInst } = await supabase.from('conversations')
                      .insert(toInsertConvs)
                      .select('id, tenant_id, contact_id, instance_id');
                      
                  if(errInst) {
                        console.warn('[BatchProcessor] Insert conversas em lote falhou, tentando individualmente:', errInst.message);
                        for (const item of toInsertConvs) {
                            try {
                                const { data: itemRes } = await supabase.from('conversations')
                                    .insert([item])
                                    .select('id, tenant_id, contact_id, instance_id');
                                if (itemRes && itemRes.length > 0) insertedConvs.push(...itemRes);
                            } catch (sErr) {
                                console.error('[BatchProcessor] Erro na inserção individual de conversa:', sErr);
                            }
                        }
                  } else if (res) {
                        insertedConvs.push(...res);
                  }
              }
              
              if(toUpdateConvs.length > 0) {
                  const { data: res, error: errUp } = await supabase.from('conversations').upsert(toUpdateConvs, { onConflict: 'id' }).select('id, tenant_id, contact_id, instance_id');
                  if(errUp) console.warn('[BatchProcessor] Aviso: falha atualizando unread batch.', errUp.message);
              }
              
              // Agrupa os IDs das conversas finais no MAPA ESTRITO POR INSTÂNCIA
              const finalConvIdMap = new Map();
              for(const e of existingConvs) finalConvIdMap.set(`${e.tenant_id}_${e.instance_id || 'null_instance'}_${e.contact_id}`, e.id);
              for(const e of insertedConvs) finalConvIdMap.set(`${e.tenant_id}_${e.instance_id || 'null_instance'}_${e.contact_id}`, e.id);
              for(const item of toInsertConvs) {
                  const k = `${item.tenant_id}_${item.instance_id || 'null_instance'}_${item.contact_id}`;
                  if (!finalConvIdMap.has(k)) finalConvIdMap.set(k, item.id);
              }
             
             // 2.5 Resolve Duplicatas de Mensagens ANTES do processo pesado de mídias e inserções
             const allMessageIds = batch.map(b => b.rawMsg.key.id).filter(Boolean);
             const existingIdsSet = new Set();
             if (allMessageIds.length > 0) {
                 // Busca IDs já existentes para evitar código 23505 (Unique Violation)
                 for(let i = 0; i < allMessageIds.length; i += 500) {
                     const chunk = allMessageIds.slice(i, i + 500);
                      const uniqueTenantIds = Array.from(new Set(batch.map(b => b.tenantId).filter(Boolean)));
                      const { data: existingMessages } = await supabase.from('messages')
                          .select('whatsapp_message_id, instance_id')
                          .in('tenant_id', uniqueTenantIds)
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
                 let cid = contactIdMap.get(`${b.tenantId}_${b.phone}`);
                 if (!cid) {
                     const targetPhone = getCanonicalBrPhone(b.phone) || b.phone;
                     const fallbackContact = safeContactsArray.find(sc => sc.tenant_id === b.tenantId && (sc.phone === targetPhone || sc.phone === b.phone));
                     cid = fallbackContact?.id || crypto.randomUUID();
                     contactIdMap.set(`${b.tenantId}_${b.phone}`, cid);
                 }

                 const mapKey = `${b.tenantId}_${b.instanceId || 'null_instance'}_${cid}`;
                 b.conversationId = finalConvIdMap.get(mapKey) || finalConvIdMap.get(`${b.tenantId}_null_instance_${cid}`);

                 // Fallback isolado e seguro: se não tiver conversa mapeada, cria uma nova exclusiva desta instância
                 if (!b.conversationId) {
                     const fallbackConvId = crypto.randomUUID();
                     finalConvIdMap.set(mapKey, fallbackConvId);
                     b.conversationId = fallbackConvId;
                     supabase.from('conversations').insert([{
                         id: fallbackConvId,
                         tenant_id: b.tenantId,
                         instance_id: b.instanceId,
                         contact_id: cid,
                         status: 'bot',
                         unread_count: 1,
                         last_message_preview: Array.from(String(b.textMessage || '')).slice(0, 500).join(''),
                         last_message_at: new Date(b.timestamp).toISOString()
                     }]).then(() => {}).catch(e => console.error('[BatchProcessor] Erro no fallback de conversa isolada:', e));
                 }
                 
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
                         console.log(`[BatchProcessor] Aviso: Mídia expirada/inacessível para JID ${b.jid}. (Normal em History Sync) -> ${err.message}`);
                     }
                 }
             }));
             
             // 4. INSERE TODAS AS MENSAGENS NUM CHUTE SÓ (BULK INSERT)
             const messagesToInsert = activeBatch.map(b => {
                 const pendingStatus = this.pendingStatuses?.get(b.rawMsg.key.id)?.status;
                 const defaultStatus = b.direction === 'inbound' ? 'received' : 'SERVER_ACK';
                 
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
             
             if (messagesToInsert.length > 0) {
                  // Inserção direta e rápida de lote
                  let { data: insertedMessages, error: msgErr } = await supabase.from('messages')
                     .insert(messagesToInsert)
                     .select('*');
                     
                  if (msgErr) {
                      console.warn(`[BatchProcessor] Inserção em lote direta interceptou erro (${msgErr.code}: ${msgErr.message}). Iniciando resolução resiliente com filtro de idempotência...`);
                      
                      // 1. Consulta quais whatsapp_message_id do lote já existem no banco
                      const wIds = messagesToInsert.map(m => m.whatsapp_message_id).filter(Boolean);
                      const existingSet = new Set();
                      if (wIds.length > 0) {
                          try {
                              const { data: existingRows } = await supabase.from('messages')
                                  .select('whatsapp_message_id')
                                  .in('whatsapp_message_id', wIds);
                              if (existingRows) {
                                  existingRows.forEach(r => existingSet.add(r.whatsapp_message_id));
                              }
                          } catch (checkErr) {
                              console.warn(`[BatchProcessor] Aviso ao verificar mensagens existentes: ${checkErr.message}`);
                          }
                      }

                      // 2. Filtra somente as mensagens genuinamente inéditas
                      const trulyNewMessages = messagesToInsert.filter(m => !existingSet.has(m.whatsapp_message_id));
                      
                      if (trulyNewMessages.length > 0) {
                          const { data: batchNew, error: batchErr } = await supabase.from('messages')
                              .insert(trulyNewMessages)
                              .select('*');
                              
                          if (!batchErr && batchNew) {
                              realInserted.push(...batchNew);
                          } else {
                              // Fallback individual 1 a 1 para salvar com garantia
                              for (const m of trulyNewMessages) {
                                  const { data: sData, error: sErr } = await supabase.from('messages')
                                      .insert([m])
                                      .select('*');
                                      
                                  if (sData && sData.length > 0) {
                                      realInserted.push(sData[0]);
                                  } else if (sErr && sErr.code !== '23505') {
                                      console.error(`[BatchProcessor] Erro na inserção individual para ID ${m.whatsapp_message_id}:`, sErr.message || sErr);
                                      const originalItem = activeBatch.find(x => x.rawMsg?.key?.id === m.whatsapp_message_id && x.instanceId === m.instance_id);
                                      if (originalItem) {
                                          originalItem.retryCount = (originalItem.retryCount || 0) + 1;
                                          if (originalItem.retryCount < 5) {
                                              this.messageQueue.push(originalItem);
                                          } else {
                                              console.error(`[BatchProcessor] EXCEÇÃO CRÍTICA: Mensagem ID ${m.whatsapp_message_id} descartada individualmente após 5 falhas.`);
                                              try {
                                                  fs.appendFileSync('discarded_messages.log', `${new Date().toISOString()} [INDIVIDUAL FAILED] MsgId: ${m.whatsapp_message_id} - Payload: ${JSON.stringify(originalItem.rawMsg)}\n`);
                                              } catch (logErr) {}
                                          }
                                      }
                                  }
                              }
                          }
                      }
                      console.log(`[BatchProcessor] Resolução resiliente concluída. ${realInserted.length} novas mensagens salvas de ${messagesToInsert.length} totais.`);
                  } else {
                      realInserted = insertedMessages || [];
                      console.log(`[BatchProcessor] ${realInserted.length} mensagens processadas no lote com SUCESSO!`);
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
                 
                 if (rateData.timestamps.length >= 15) { // Limite de 15 respostas de bot por minuto
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
                          console.log(`[EventProcessor] Robô desativado nas configurações da caixa de entrada (${b.instanceId}). Silenciando robô.`);
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

                      // 0. Se a IA estiver pausada (ai_paused: true), aborta imediatamente (prioridade absoluta do atendente humano)
                      if (b.aiPaused) {
                          console.log(`[EventProcessor] IA está pausada para a conversa ${b.conversationId} (contato: ${b.phone}). Silenciando robô.`);
                          return;
                      }

                      // Se a conversa for 'open' (operador humano), o robô não deve atropelar o atendimento humano
                      if (b.convStatus === 'open') {
                          if (!isTestAllowed) {
                              console.log(`[EventProcessor] Conversa está aberta (operador humano) para o contato ${b.phone}. Silenciando robô.`);
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
                          // Se o IA estiver desativado globalmente e NÃO for o simulador admin (teste_robo), aborta o processamento.
                          if (companyData && companyData.global_ai_enabled === false && b.convStatus !== 'teste_robo') {
                              console.log(`[BatchProcessor] IA e Automações Globais estão DESATIVADAS para o tenant ${b.tenantId}`);
                              return;
                          }

                          // Busca TODOS os bots do tenant para orquestração
                          const { data: allBotsData } = await supabase.from('bots').select('*').eq('tenant_id', b.tenantId);
                          const botsData = allBotsData || [];

                          // Filtra os bots ativos e habilitados para a instância atual
                          const eligibleBots = botsData.filter(bot => bot.status === 'active' && bot.autoReply !== false && bot.channels && bot.channels.includes(b.instanceId));

                          let botData = null;
                          if (eligibleBots.length > 0) {
                              if (eligibleBots.length > 1) {
                                  console.log(`[EventProcessor] Múltiplos bots ativos (${eligibleBots.length}) elegíveis. Iniciando roteamento por assunto...`);
                                  botData = await AutomationWorker.routeMessageToBot(eligibleBots, b.textMessage, b.tenantId, b.conversationId);
                              } else {
                                  botData = eligibleBots[0];
                              }
                          }

                          // Se for teste_robo e não achou bot, tenta capturar a configuração base
                          if (!botData && b.convStatus === 'teste_robo') {
                              botData = botsData.find(bot => bot.channels && bot.channels.includes(b.instanceId)) || botsData[0];
                          }

                           if (!botData) {
                               console.log(`[EventProcessor] Nenhum bot ativo ou elegível encontrado para a caixa de entrada ${b.instanceId}. Silenciando robô.`);
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

        // Processa o histórico de forma assíncrona fora da pilha do evento do socket para NÃO bloquear o event loop e prevenir disconects (Code 428/408)
        setImmediate(async () => {
            try {
                const { data: instCheck } = await supabase.from('whatsapp_instances').select('id').eq('id', instanceId).limit(1);
                if (!instCheck || instCheck.length === 0) {
                    console.warn(`[EventProcessor] Instância ${instanceId} não existe mais no banco de dados. Encerrando sessão de memória residual.`);
                    sessionManager.closeSession(instanceId).catch(() => {});
                    return;
                }

                const chats = payload.chats || [];
                const contacts = payload.contacts || [];
                const messages = payload.messages || [];
                
                console.log(`[EventProcessor] Histórico de Conexão/Reconexão Recebido em Background: ${chats.length} chats, ${contacts.length} contatos, ${messages.length} mensagens.`);

                const ownerJid = sock?.user?.id;
                let ownerPhone = null;
                if (ownerJid) {
                     ownerPhone = ownerJid.split('@')[0].split(':')[0];
                }

                // 1. Sincronização de Contatos do Histórico
                const mappedContactsToHistory = {};
                for (const c of contacts) {
                    let jid = c.id;
                    if (!jid || this.isBroadcast(jid) || this.isGroup(jid)) continue;
                    
                    if (this.isLid(jid)) {
                        const resolvedPn = await this.resolveLidToPhone(instanceId, jid, sock, false);
                        if (resolvedPn) jid = resolvedPn;
                        else continue;
                    }
                    
                    const phone = jid.split('@')[0].split(':')[0];
                    if (!phone || phone.length < 5) continue;
                    const cleanJid = phone + '@' + (jid.split('@')[1] || 's.whatsapp.net');
                    jid = cleanJid;
                    
                    if (ownerPhone && phone === ownerPhone) continue;

                    const pushName = c.notify || c.name || phone;
                    mappedContactsToHistory[`${tenantId}_${phone}`] = { tenant_id: tenantId, phone: phone, name: pushName, whatsapp_jid: jid, instance_id: instanceId };
                }
                const histContacts = Object.values(mappedContactsToHistory);
                if (histContacts.length > 0) {
                     const chunkLimit = 500;
                     for (let i = 0; i < histContacts.length; i += chunkLimit) {
                         const chunk = histContacts.slice(i, i + chunkLimit);
                         try {
                             await supabase.from('contacts').upsert(chunk, { onConflict: 'tenant_id, phone', ignoreDuplicates: true });
                         } catch (e) {}
                     }
                }

                // 2. Sincronização de Mensagens (Prevenção Total de Perda de Mensagens Offline/Reconexão)
                if (messages && messages.length > 0) {
                    console.log(`[EventProcessor] Processando ${messages.length} mensagens do histórico em segundo plano...`);
                    const chronologicMessages = [...messages].reverse();
                    
                    // Processa em lotes de 100 mensagens por vez para alta performance sem travar a CPU
                    for (let i = 0; i < chronologicMessages.length; i += 100) {
                        const chunk = chronologicMessages.slice(i, i + 100);
                        await this.handleMessageUpsert(tenantId, instanceId, sock, { messages: chunk, type: 'append' });
                        await new Promise(r => setTimeout(r, 50));
                    }

                    await realtime.publishInboxEvent(tenantId, 'history.sync.completed', {
                        count: chronologicMessages.length
                    }).catch(() => {});
                }
                
                console.log(`[EventProcessor] Sync de histórico concluído com sucesso para instância ${instanceId}.`);
            } catch (err) {
                console.error(`[EventProcessor] Erro na sincronização de histórico da instância ${instanceId}:`, err.message);
            }
        });
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
                if(conv && update.unreadCount === 0) {
                      // Fire and forget - atualiza apenas em zeramento explícito
                      supabase.from('conversations').update({ unread_count: 0 }).eq('id', conv.id).then(()=>{});
                }
            }
        }
    }

    isBroadcast(jid) {
        return isBroadcast(jid);
    }

    isGroup(jid) {
        return isGroup(jid);
    }

    isLid(jid) {
        return isLid(jid);
    }

    extractMessageContent(msg) {
        return extractMessageContent(msg);
    }

    extractTextFromMessage(msg) {
        return extractTextFromMessage(msg);
    }

    extractMediaMeta(rawMsg, msgType) {
        return extractMediaMeta(rawMsg, msgType);
    }

    extractTypeFromMessage(msg) {
        return extractTypeFromMessage(msg);
    }

    async handleMessageReceiptUpdate(tenantId, instanceId, sock, updates) {
        if (!updates || updates.length === 0) return;

        try {
            const instanceConfig = await this.getInstanceConfig(instanceId);
            const allowedGroups = instanceConfig.enabled_groups || instanceConfig.allowed_groups || instanceConfig.enabledGroups || instanceConfig.allowedGroups || [];

            for (const update of updates) {
                if (!update.key || !update.key.id) continue;
                
                const jid = update.key.remoteJid;
                
                if (jid && this.isBroadcast(jid)) {
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
                // 0 = ERROR, 2 = SERVER_ACK, 3 = DELIVERY_ACK, 4 = READ, 5 = PLAYED
                let newStatus = null;
                if (update.status === 2) newStatus = 'SERVER_ACK';
                if (update.status === 3) newStatus = 'delivered';
                if (update.status === 4 || update.status === 5) newStatus = 'read';

                if (newStatus) {
                    // Salva na memória p/ flushQueue
                    this.updatePendingStatus(key.id, newStatus);
                    // Enfileira p/ reconciliation assíncrona
                    this.queueStatusUpdate(tenantId, instanceId, key.id, newStatus);
                } else {
                    const is463Error = (update.messageStubParameters && update.messageStubParameters[0] === '463') || (update.error === '463') || (update.error && String(update.error).includes('463'));
                    if (is463Error && key?.id) {
                        if (!this.ack463RetriedIds) this.ack463RetriedIds = new Set();
                        if (!this.ack463RetriedIds.has(key.id)) {
                            this.ack463RetriedIds.add(key.id);
                            setTimeout(() => this.ack463RetriedIds.delete(key.id), 60000);
                            console.warn(`[EventProcessor] ACK error 463 detectado para mensagem ${key.id} (JID: ${key.remoteJid}). Iniciando retry único...`);
                            this.handleAckError463Retry(tenantId, instanceId, sock, key).catch(console.error);
                        }
                    }
                }
            }
        } catch (e) {
             console.error(`[EventProcessor] Erro processando status (messages.update):`, e);
        }
    }

    async handleAckError463Retry(tenantId, instanceId, sock, key) {
        if (!key || !key.id || !key.remoteJid || key.remoteJid.endsWith('@g.us')) return;

        const rawJid = key.remoteJid;
        const phone = rawJid.split('@')[0].split(':')[0];

        // Cooldown defensivo por telefone para evitar tempestade de expurgo de chaves
        if (!this.ack463PhoneCooldown) this.ack463PhoneCooldown = new Map();
        const now = Date.now();
        const lastPurge = this.ack463PhoneCooldown.get(phone) || 0;
        if (now - lastPurge < 30000) {
            console.log(`[EventProcessor] Cooldown ativo para expurgo de sessão 463 do número ${phone}. Ignorando expurgo redundante.`);
            return;
        }
        this.ack463PhoneCooldown.set(phone, now);

        console.log(`[EventProcessor] ACK 463 detectado para ${phone} (Msg ID: ${key.id}). Purgando sessão Signal obsoleta...`);

        // 1. Purga as chaves de sessão Signal com problema do memCache e do Supabase (wa_auth_keys)
        if (sock && sock.authState && sock.authState.keys && typeof sock.authState.keys.set === 'function') {
            const getBrPhoneVariations = (phoneStr) => {
                if (!phoneStr) return [];
                const clean = String(phoneStr).replace(/\D/g, '');
                if (!clean) return [];
                const res = [clean];
                if (clean.startsWith('55') && clean.length === 13 && clean.charAt(4) === '9') {
                    res.push(clean.substring(0, 4) + clean.substring(5));
                } else if (clean.startsWith('55') && clean.length === 12) {
                    res.push(clean.substring(0, 4) + '9' + clean.substring(4));
                }
                return Array.from(new Set(res));
            };

            const vars = getBrPhoneVariations(phone);
            const sessionPurgeObj = {};
            sessionPurgeObj[rawJid] = null;
            sessionPurgeObj[`${phone}@s.whatsapp.net`] = null;
            sessionPurgeObj[`${phone}:0@s.whatsapp.net`] = null;
            for (const v of vars) {
                sessionPurgeObj[`${v}@s.whatsapp.net`] = null;
                sessionPurgeObj[`${v}:0@s.whatsapp.net`] = null;
            }
            try {
                await sock.authState.keys.set({ session: sessionPurgeObj });
                console.log(`[EventProcessor] ACK 463: Chaves de sessão obsoletas para ${phone} foram purgadas do memCache e DB.`);
            } catch (pErr) {
                console.warn(`[EventProcessor] Aviso ao purgar chaves 463:`, pErr.message);
            }
        }

        // 2. Localiza o texto da mensagem no banco (messages ou wa_outgoing_messages)
        let bodyText = null;
        const { data: dbMsg } = await supabase
            .from('messages')
            .select('text_content')
            .eq('instance_id', instanceId)
            .or(`whatsapp_message_id.eq.${key.id},id.eq.${key.id}`)
            .maybeSingle();

        if (dbMsg && dbMsg.text_content) {
            bodyText = dbMsg.text_content;
        } else {
            const { data: outMsg } = await supabase
                .from('wa_outgoing_messages')
                .select('body')
                .eq('instance_id', instanceId)
                .or(`chat_jid.eq.${rawJid},chat_jid.like.%${phone}%`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (outMsg && outMsg.body) bodyText = outMsg.body;
        }

        if (!bodyText) {
            console.warn(`[EventProcessor] ACK 463: Texto da mensagem ${key.id} não foi encontrado no banco para re-envio.`);
            return;
        }

        // 3. Re-dispara o envio com resolução de JID renovada e sessão Signal recém-criada
        const sendFn = sock.originalSendMessage || sock.sendMessage;
        if (typeof sendFn === 'function') {
            let targetJid = rawJid;
            try {
                targetJid = await resolveTargetJid(sock, rawJid, tenantId);
                const retryRes = await sendFn(targetJid, { text: bodyText });
                console.log(`[EventProcessor] ACK 463: Re-envio concluído com SUCESSO para ${targetJid}! Novo ID:`, retryRes?.key?.id);
            } catch (retryErr) {
                console.error(`[EventProcessor] Falha no re-envio ACK 463 para ${targetJid || rawJid}:`, retryErr.message);
            }
        }
    }

    async handleConnectionUpdate(tenantId, instanceId, update) {
        const { connection, lastDisconnect, qr } = update;
        const payload = {};
        let eventName = 'instance.status';

        try {
            if (update.passkeyRequired) {
                const errMsg = "Chave de Acesso (Passkey) Ativa: A conexão falhou porque há uma Chave de Acesso ativa nesta conta. Por segurança do WhatsApp, vinculações automatizadas não funcionam com chaves de acesso ativas. Se o aplicativo do celular forçar a criação de uma chave para conectar dispositivos (Catch-22), as soluções recomendadas são: 1) Migrar a conta para o WhatsApp Business; 2) Deixar a conta sem tentativas por 48h a 72h (Período de Resfriamento) para reduzir o score de risco; ou 3) Limpar o cache/reinstalar o WhatsApp no celular principal.";
                await supabase.from('whatsapp_instances')
                    .update({ status: 'offline', last_error: errMsg })
                    .eq('id', instanceId);
                
                await supabase.from('whatsapp_instance_runtime')
                    .update({ pairing_code: 'PASSKEY_BLOCKED', last_error: errMsg })
                    .eq('instance_id', instanceId);

                payload.status = 'offline';
                payload.last_error = errMsg;
                payload.passkeyBlocked = true;

                // Log e notificação de falha de conexão
                logAndNotifyConnectionEvent({
                    tenantId,
                    instanceId,
                    eventType: 'connection_error',
                    status: 'offline',
                    error: errMsg,
                    details: { passkeyBlocked: true }
                });

                await realtime.publishInstanceEvent(tenantId, instanceId, 'instance.status', payload);
                return;
            }

            // Verifica se a instância já possui credenciais AUTENTICADAS salvas em wa_auth_credentials E status conectado
            const { data: currentInst } = await supabase.from('whatsapp_instances')
                .select('status, phone_number, display_name')
                .eq('id', instanceId)
                .maybeSingle();

            const { data: authCreds } = await supabase.from('wa_auth_credentials')
                .select('instance_id, creds_data')
                .eq('instance_id', instanceId)
                .maybeSingle();

            const hasValidMe = Boolean(authCreds?.creds_data?.me?.id || authCreds?.creds_data?.me?.jid);
            const isConnStatus = currentInst && ['connected', 'connected_local'].includes(currentInst.status);
            // Considera conectada/autenticada APENAS se possuir usuário autenticado nos creds e status conectado
            const isAlreadyConnected = hasValidMe && isConnStatus;

            if (qr) {
                // Se a instância já possui autenticação válida com o WhatsApp, ignora a emissão de QR code para não poluir o frontend
                if (isAlreadyConnected) {
                    console.log(`[EventProcessor] Ignorando evento de QR Code parasita para instância ${instanceId} que já possui credenciais autenticadas salvas.`);
                    return;
                }

                try {
                    const toDataURL = qrcode.toDataURL || (qrcode.default && qrcode.default.toDataURL) || qrcode;
                    const qrBase64 = await toDataURL(qr);
                    payload.qr_code = qrBase64;
                    payload.status = 'qr_ready';
                    eventName = 'instance.qr_updated';

                    await retryWithBackoff(() =>
                        supabase.from('whatsapp_instances')
                            .update({ status: 'connecting', last_error: null })
                            .eq('id', instanceId)
                    );

                    await retryWithBackoff(() =>
                        supabase.from('whatsapp_instance_runtime')
                            .upsert({
                                instance_id: instanceId,
                                tenant_id: tenantId,
                                qr_code: qrBase64,
                                updated_at: new Date().toISOString()
                            }, { onConflict: 'instance_id' })
                    );

                    // Registra log da emissão do QR Code
                    logAndNotifyConnectionEvent({
                        tenantId,
                        instanceId,
                        eventType: 'qr_ready',
                        status: 'connecting',
                        details: { instanceName: currentInst?.display_name }
                    });

                    await realtime.publishInstanceEvent(tenantId, instanceId, 'instance.qr_updated', payload);
                } catch(e) {
                    console.error('[EventProcessor] Erro ao salvar QR code no banco:', e);
                }
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                const loggedOut = reason === 401;

                const isPausedOrBlocked = currentInst && ['paused', 'blocked_12h', 'forbidden', 'bad_session'].includes(currentInst.status);

                if (isPausedOrBlocked) {
                    console.log(`[EventProcessor] Mantendo status persistente '${currentInst.status}' para a instância ${instanceId}. Ignorando update de connection close.`);
                    payload.status = currentInst.status;
                    payload.reason = reason;
                    if (loggedOut) payload.loggedOut = true;
                    await realtime.publishInstanceEvent(tenantId, instanceId, 'instance.status', payload);
                    return;
                }

                // Verifica se há pareamento pendente de sincronização para tratar o close como transiente
                const { data: runtime } = await supabase.from('whatsapp_instance_runtime')
                    .select('pairing_code')
                    .eq('instance_id', instanceId)
                    .maybeSingle();
                const isPairingPendingSync = runtime?.pairing_code === 'CONNECTED_PENDING_SYNC';

                // Trata como transiente qualquer erro que não seja um encerramento definitivo/manual ou logout
                const isTransient = ![401, 403, 409, 410].includes(reason) || !reason || isPairingPendingSync;

                if (isTransient) {
                    if (isAlreadyConnected) {
                        console.log(`[EventProcessor] Ignorando evento de status transiente (code: ${reason}) para instância ${instanceId} que já está autenticada.`);
                        return;
                    }
                    await supabase.from('whatsapp_instances')
                        .update({ status: 'connecting', last_error: `Reconnecting (Code: ${reason})` })
                        .eq('id', instanceId);
                    payload.status = 'connecting';
                    payload.reason = reason;
                } else {
                    const errMsg = reason === 409
                        ? 'Desconectado por conflito: Outro dispositivo se conectou a esta conta de WhatsApp. O sistema suspendeu reconexões automáticas.'
                        : reason === 401
                        ? 'Sessão encerrada (Logout realizado pelo WhatsApp no celular).'
                        : `Falha de conexão com o WhatsApp (Código: ${reason || 'N/A'})`;

                    await supabase.from('whatsapp_instances')
                        .update({ status: 'offline', last_error: errMsg })
                        .eq('id', instanceId);
                    payload.status = 'offline';
                    payload.reason = reason;
                    if(loggedOut) payload.loggedOut = true;

                    // Log e disparo de alerta via FoodNext para erros definitivos
                    logAndNotifyConnectionEvent({
                        tenantId,
                        instanceId,
                        eventType: 'connection_error',
                        status: 'offline',
                        error: errMsg,
                        details: { reason, loggedOut, instanceName: currentInst?.display_name }
                    });
                }
            }
            if (connection === 'connecting') {
                if (isAlreadyConnected) {
                    console.log(`[EventProcessor] Ignorando evento de status connecting para instância ${instanceId} que já está autenticada.`);
                    return;
                }

                await supabase.from('whatsapp_instances')
                    .update({ status: 'connecting', last_error: null })
                    .eq('id', instanceId);
                payload.status = 'connecting';
                if (update.pairingSuccess) {
                    payload.pairingSuccess = true;
                    payload.phone = update.phone;

                    logAndNotifyConnectionEvent({
                        tenantId,
                        instanceId,
                        eventType: 'handshake_start',
                        status: 'connecting',
                        phone: update.phone,
                        details: { instanceName: currentInst?.display_name }
                    });
                }
            }

            if (connection === 'open') {
                const isLocalDev = process.env.DISABLE_AUTO_START_SESSIONS === 'true';
                const statusVal = isLocalDev ? 'connected_local' : 'connected';
                await supabase.from('whatsapp_instances')
                    .update({ status: statusVal, assigned_node_id: NODE_ID, last_error: null })
                    .eq('id', instanceId);
                const { data: existing } = await supabase.from('whatsapp_instance_runtime')
                    .select('instance_id')
                    .eq('instance_id', instanceId)
                    .maybeSingle();
                    
                if (existing) {
                    await supabase.from('whatsapp_instance_runtime')
                        .update({ qr_code: null, pairing_code: null })
                        .eq('instance_id', instanceId);
                } else {
                    await supabase.from('whatsapp_instance_runtime')
                        .insert({ instance_id: instanceId, tenant_id: tenantId, qr_code: null, pairing_code: null });
                }
                payload.status = statusVal;

                // Log e disparo de notificação de SUCESSO via própria caixa conectada
                const connectedPhone = currentInst?.phone_number || update?.phone || (authCreds?.creds_data?.me?.id ? authCreds.creds_data.me.id.split(':')[0].split('@')[0] : null);
                logAndNotifyConnectionEvent({
                    tenantId,
                    instanceId,
                    eventType: 'connection_success',
                    status: statusVal,
                    phone: connectedPhone,
                    details: { instanceName: currentInst?.display_name, nodeId: NODE_ID }
                });
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
        const triggers = await retryWithBackoff(async () => {
            const { data, error } = await supabase
                .from('webhook_triggers')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('event_type', eventType)
                .eq('is_active', true);
            if (error) throw error;
            return data;
        });

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
                },
                signal: AbortSignal.timeout(5000)
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
                    console.warn(`[WebhookTrigger] Falha no disparo do gatilho '${trigger.name}' (${processedUrl}): ${err.message}`);
                });
        }
    } catch (e) {
        console.error('[WebhookTrigger] Falha ao consultar gatilhos no banco:', e?.message || e);
    }
}
