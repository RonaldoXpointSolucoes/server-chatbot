import { supabase } from '../supabase.js';
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
    }
    
    async getTenantConfig(tenantId) {
        const cached = this.tenantConfigs.get(tenantId);
        // Cache por 60 segundos
        if (cached && (Date.now() - cached.timestamp < 60000)) {
            return cached.config;
        }

        try {
            const { data } = await supabase.from('companies').select('ignore_groups').eq('tenant_id', tenantId).single();
            // Default é true (ignorar grupos) para retrocompatibilidade
            const config = { ignore_groups: data && data.ignore_groups !== null ? data.ignore_groups : true };
            this.tenantConfigs.set(tenantId, { config, timestamp: Date.now() });
            return config;
        } catch (e) {
            return { ignore_groups: true }; 
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
            try {
                fs.appendFileSync('event_debug.log', new Date().toISOString() + ' QUEUED RAW PAYLOAD: ' + JSON.stringify(msg) + '\n');
            } catch(e){}

            let jid = msg.key.remoteJid;

            // [LID Sync Override]
            // Multi-device connections (WhatsApp Web/Desktop or linked phones) send outgoing 'fromMe' 
            // messages tagged with '@lid' in remoteJid, but they include the actual target phone in remoteJidAlt.
            // By extracting it here, we rescue the sync message and map it perfectly to the real contact.
            if (jid && jid.includes('@lid') && msg.key.remoteJidAlt && msg.key.remoteJidAlt.includes('@s.whatsapp.net')) {
                jid = msg.key.remoteJidAlt;
            }

            if (!jid) continue;
            
            const config = await this.getTenantConfig(tenantId);
            
            // Ignora status e LIDs isolados, forçando a ignorar as ecos de múltiplos aparelhos para IDs nativos
            if (this.isBroadcast(jid) || this.isLid(jid)) continue;
            
            // Ignora grupos dependendo da opção da empresa
            if (config.ignore_groups && this.isGroup(jid)) continue;

            try {
                const ownerJid = sock?.user?.id;
                let ownerPhone = null;
                if (ownerJid) {
                     ownerPhone = ownerJid.split(':')[0].split('@')[0];
                }
                const phone = jid.split('@')[0];
                
                // Evita que o proprio número da instância seja logado como um contato ou conversa
                if (ownerPhone && phone === ownerPhone) {
                     continue;
                }

                const isHuman = EventProcessor.humanMessagesCache && EventProcessor.humanMessagesCache.has(msg.key.id);
                const senderType = msg.key.fromMe ? (isHuman ? 'human' : 'bot') : 'client';
                const direction = msg.key.fromMe ? 'outbound' : 'inbound';
                
                // Se for outbound (fromMe), o msg.pushName é o nome do PRÓPRIO aparelho (ex: Burguer Plus).
                // Não devemos atribuir ao nome do cliente (jid).
                const pushName = msg.key.fromMe ? phone : (msg.pushName || phone);
                
                // Trata data da mensagem
                const timestampSecs = msg.messageTimestamp;
                let tsDate = new Date();
                if (typeof timestampSecs === 'number') {
                    tsDate = new Date(timestampSecs * 1000);
                } else if (timestampSecs && typeof timestampSecs.low === 'number') {
                    tsDate = new Date(timestampSecs.low * 1000);
                }

                const textMessage = this.extractTextFromMessage(msg);
                const msgType = this.extractTypeFromMessage(msg);

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
                    isHistory: m.type === 'append'
                });

            } catch (e) {
                console.error(`[EventProcessor] Erro ao engatilhar mensagem na Queue:`, e);
            }
        }
    }

    async flushQueue() {
        if (this.isFlushing || this.messageQueue.length === 0) return;
        this.isFlushing = true;
        
        // Puxa até 1000 mensagens do buffer (Batch limit)
        const batch = this.messageQueue.splice(0, 1000);
        console.log(`[BatchProcessor] Drenando lote de ${batch.length} novas interações...`);
        
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
             if (tenantIdTarget && phonesToSeek.length > 0) {
                 const { data: existingDbContacts } = await supabase.from('contacts')
                     .select('*')
                     .eq('tenant_id', tenantIdTarget)
                     .in('phone', phonesToSeek);
                     
                 if (existingDbContacts) {
                     for (const e of existingDbContacts) {
                         existingMap.set(e.phone, e);
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
             
             // 2. Processa Conversas (Conversations)
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
                         status: 'bot'
                     });
                 }
                 
                 const conv = convMap.get(key);
                 if (b.timestamp >= conv.last_message_at) {
                     conv.last_message_preview = b.textMessage;
                     conv.last_message_at = b.timestamp;
                 }
                 if (b.direction === 'inbound') {
                     conv.unread_count += 1;
                 }
             }
             
             // Verifica quais conversas já existem no banco
             const contactIds = Array.from(new Set(Array.from(convMap.values()).map(c => c.contact_id)));
             const { data: existingConvs, error: existError } = await supabase.from('conversations')
                  .select('id, tenant_id, instance_id, contact_id, unread_count, status')
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
             
             for(const [key, data] of convMap.entries()) {
                 const exist = existingConvMap.get(key);
                 if(exist) {
                     toUpdateConvs.push({
                         id: exist.id,
                         tenant_id: data.tenant_id,
                         contact_id: data.contact_id,
                         unread_count: Number(exist.unread_count || 0) + Number(data.unread_count || 0),
                         last_message_preview: String(data.last_message_preview || '').substring(0, 50),
                         last_message_at: new Date(data.last_message_at).toISOString(),
                         updated_at: new Date().toISOString()
                     });
                 } else {
                     toInsertConvs.push({
                         tenant_id: data.tenant_id,
                         instance_id: data.instance_id,
                         contact_id: data.contact_id,
                         status: 'bot',
                         unread_count: data.unread_count,
                         last_message_preview: data.last_message_preview.substring(0, 50),
                         last_message_at: data.last_message_at.toISOString()
                     });
                 }
             }
             
             const insertedConvs = [];
             if(toInsertConvs.length > 0) {
                 // Usando upsert com a nova restrição de unicidade para evitar race conditions
                 const { data: res, error: errInst } = await supabase.from('conversations')
                     .upsert(toInsertConvs, { onConflict: 'tenant_id, instance_id, contact_id' })
                     .select('id, tenant_id, contact_id');
                     
                 if(errInst) {
                       console.error('[BatchProcessor] Falha no upsert de conversas:', errInst.message);
                 } else if (res) {
                       insertedConvs.push(...res);
                 }
             }
             
             if(toUpdateConvs.length > 0) {
                 const { data: res, error: errUp } = await supabase.from('conversations').upsert(toUpdateConvs, { onConflict: 'id' }).select('id, tenant_id, contact_id');
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
                         .select('whatsapp_message_id')
                         .in('whatsapp_message_id', chunk);
                     if (existingMessages) {
                         for (const m of existingMessages) existingIdsSet.add(m.whatsapp_message_id);
                     }
                 }
             }

             const uniqueBatchMap = new Map();
             for (const b of batch) {
                 if (!existingIdsSet.has(b.rawMsg.key.id)) {
                     uniqueBatchMap.set(b.rawMsg.key.id, b);
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
                 b.conversationId = finalConvIdMap.get(`${b.tenantId}_${b.instanceId}_${cid}`);
                 b.convStatus = existingConvMap.get(`${b.tenantId}_${b.instanceId}_${cid}`)?.status || 'bot';
                 
                 if (!b.conversationId) return; // ignora falha bruta
                 
                 if (!b.mediaUrl && ['image', 'video', 'audio', 'document'].includes(b.msgType)) {
                     try {
                         const mediaMeta = b.rawMsg.message[b.msgType + 'Message'] || {};
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
             const messagesToInsert = activeBatch.map(b => ({
                 tenant_id: b.tenantId,
                 conversation_id: b.conversationId,
                 direction: b.direction,
                 message_type: b.msgType,
                 status: 'delivered',
                 text_content: b.textMessage,
                 whatsapp_message_id: b.rawMsg.key.id,
                 sender_type: b.senderType,
                 timestamp: b.timestamp.toISOString(),
                 raw_payload: b.rawMsg,
                 media_url: b.mediaUrl || null,
                 media_metadata: b.mediaMetadata || null
             })).filter(m => m.conversation_id); // Filtra as que milagrosamente não pegaram conv ID
             
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

             for(const msg of realInserted) {
                 const b = activeBatch.find(x => x.rawMsg.key.id === msg.whatsapp_message_id);
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

                         // Responde apenas se a conversa estiver sob os cuidados do bot ('bot' ou 'teste_robo')
                         if (b.convStatus === 'bot' || b.convStatus === 'teste_robo') {
                             
                             supabase.from('companies').select('global_ai_enabled').eq('id', b.tenantId).single()
                                 .then(({ data: companyData }) => {
                                     // Se o IA estiver desativado globalmente e NÃO for um teste, aborta o processamento.
                                     if (companyData && companyData.global_ai_enabled === false && b.convStatus !== 'teste_robo') {
                                         console.log(`[BatchProcessor] IA e Automações Globais estão DESATIVADAS para o tenant ${b.tenantId}`);
                                         return;
                                     }

                                     // Busca TODOS os bots do tenant para evitar fallback indevido ao FlowEngine
                                     supabase.from('bots').select('*').eq('tenant_id', b.tenantId)
                                         .then(({ data: allBotsData }) => {
                                     const botsData = allBotsData || [];
                                     // Encontra bot ativo e com autoReply ligado para esta instância
                                     let botData = botsData.find(bot => bot.status === 'active' && bot.autoReply === true && bot.channels && bot.channels.includes(b.instanceId));
                                     
                                     // Se for teste_robo, ignora as validações de ativação para testes e tenta capturar a configuração base
                                     if (!botData && b.convStatus === 'teste_robo') {
                                         botData = botsData.find(bot => bot.channels && bot.channels.includes(b.instanceId)) || botsData[0];
                                     }
                                     
                                     if (botData) {
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
                                             sock: b.sock
                                         });
                                     } else if (botsData.length === 0) {
                                         // Fallback para o Runtime do Flow Builder APENAS se o tenant não tiver nenhuma configuração de bot (evita double-talk)
                                         FlowEngine.processIncomingMessage({
                                             tenantId: b.tenantId,
                                             instanceId: b.instanceId,
                                             jid: b.jid,
                                             textMessage: b.textMessage,
                                             rawPayload: b.rawMsg,
                                             sock: b.sock
                                         }).catch(e => console.error("[BatchProcessor] Erro no FlowEngine:", e));
                                     }
                                 }).catch(e => console.error("[BatchProcessor] Erro ao checar bots:", e));
                             }).catch(e => console.error("[BatchProcessor] Erro ao checar companies global flag:", e));
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
             
             // Emitir trigger de recarregamento se houver mensagens de history no lote (pra interface atualizar em massa)
             if (realInserted.length > 0 && batch.some(b => b.isHistory)) {
                 const firstTenant = batch[0].tenantId;
                 await realtime.publishInboxEvent(firstTenant, 'history.sync.completed', {
                     count: realInserted.length
                 });
             }
             
        } catch (e) {
             console.error("[BatchProcessor] Flush Error Critico:", e);
        } finally {
             this.isFlushing = false;
        }
    }

    async handleMessagingHistorySet(tenantId, instanceId, sock, payload) {
        const chats = payload.chats || [];
        const contacts = payload.contacts || [];
        const messages = payload.messages || [];
        const isLatest = payload.isLatest || false;
        
        console.log(`[EventProcessor] Histórico Recebido: ${chats.length} chats, ${contacts.length} contatos, ${messages.length} msgs. IsLatest: ${isLatest}`);
        
        
        const ownerJid = sock?.user?.id;
        let ownerPhone = null;
        if (ownerJid) {
             ownerPhone = ownerJid.split(':')[0].split('@')[0];
        }

        // Contacts (Fazemos um lote imediato pro Histórico base)
        const mappedContactsToHistory = {};
        for (const c of contacts) {
            const jid = c.id;
            if (this.isBroadcast(jid) || this.isGroup(jid) || this.isLid(jid)) continue;
            const phone = jid.split('@')[0];
            
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

        // Histórico em Massa de Mensagens: Distribuir em Timers
        if (messages && messages.length > 0) {
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
        const phones = updates.map(u => u.id?.split('@')[0]).filter(Boolean);
        if(phones.length === 0) return;
        
        const { data: contacts } = await supabase.from('contacts').select('id, phone').eq('tenant_id', tenantId).in('phone', phones);
        if(!contacts || contacts.length === 0) return;
        
        const contactIds = contacts.map(c => c.id);
        const { data: convs } = await supabase.from('conversations').select('id, contact_id').eq('tenant_id', tenantId).in('contact_id', contactIds);
        
        for (const update of updates) {
            const phone = update.id?.split('@')[0];
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
        else if (content.documentMessage) text = content.documentMessage.fileName || content.documentMessage.title || '📁 Documento';
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
        else text = '📎 Formato não suportado (' + Object.keys(content)[0] + ')';
        
        // Anti-Bug: Remove caracteres nulos (\x00) que quebram o cast de JSON do PostgreSQL no Supabase (Upsert)
        return text ? String(text).replace(/\x00/g, '') : '';
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
        return 'text';
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
                const isTransient = [408, 428, 440, 503, 515].includes(reason);

                if (isTransient) {
                    await supabase.from('whatsapp_instances').update({ status: 'connecting', last_error: `Reconnecting (Code: ${reason})` }).eq('id', instanceId);
                    payload.status = 'connecting';
                    payload.reason = reason;
                } else {
                    await supabase.from('whatsapp_instances').update({ status: 'offline', last_error: `Code: ${reason}` }).eq('id', instanceId);
                    payload.status = 'offline';
                    payload.reason = reason;
                    if(loggedOut) payload.loggedOut = true;
                }
            }

            if (connection === 'open') {
                await supabase.from('whatsapp_instances').update({ status: 'connected', last_error: null }).eq('id', instanceId);
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
export default new EventProcessor();
