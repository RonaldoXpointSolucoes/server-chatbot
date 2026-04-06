import { supabase } from '../supabase.js';
import realtime from '../realtime-publisher/index.js';
import qrcode from 'qrcode';
import { downloadMediaMessage } from '@whiskeysockets/baileys';


class EventProcessor {
    
    // Auxiliar: Filtra se é um grupo
    isGroup(jid) {
        return jid && jid.endsWith('@g.us');
    }

    // Auxiliar: Filtra se é um status ou newsletter
    isBroadcast(jid) {
        return jid === 'status@broadcast' || (jid && jid.endsWith('@newsletter'));
    }

    // Processa uma matriz de mensagens (seja vinda de history ou de upsert em tempo real)
    async handleMessageUpsert(tenantId, instanceId, sock, m) {
        if (!m.messages || m.messages.length === 0) return;

        for (const msg of m.messages) {
            const jid = msg.key.remoteJid;
            
            // Ignora status e grupos por enquanto
            if (this.isBroadcast(jid) || this.isGroup(jid)) continue;

            try {
                const senderType = msg.key.fromMe ? 'bot' : 'client';
                const direction = msg.key.fromMe ? 'outbound' : 'inbound';
                const phone = jid.split('@')[0];
                
                // Trata data da mensagem
                const timestampSecs = msg.messageTimestamp;
                let tsDate = new Date();
                if (typeof timestampSecs === 'number') {
                    tsDate = new Date(timestampSecs * 1000);
                } else if (timestampSecs && typeof timestampSecs.low === 'number') {
                    tsDate = new Date(timestampSecs.low * 1000);
                }

                // 1. Garante Contato
                let { data: contact } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('tenant_id', tenantId)
                    .eq('phone', phone)
                    .single();

                if (!contact) {
                    const pushName = msg.pushName || phone;
                    const { data: newContact, error } = await supabase.from('contacts').insert({
                        tenant_id: tenantId,
                        instance_id: instanceId, // Grava instance_id mas não trava se não existir a coluna graças ao Supabase (ele descarta ou no JS lançamos log de erro benigno)
                        phone: phone,
                        name: pushName,
                        whatsapp_jid: jid
                    }).select('id').single();
                    
                    // Supabase retorna erro se a coluna instance_id não existir na tabela contacts, então fazemos fallback
                    if (error && error.code === 'PGRST204') {
                        // try without instance_id
                        const fallback = await supabase.from('contacts').insert({
                            tenant_id: tenantId, phone: phone, name: pushName, whatsapp_jid: jid
                        }).select('id').single();
                        contact = fallback.data;
                    } else if (error) {
                         // Pode ser conflito
                         if (error.code === '23505') {
                            const ext = await supabase.from('contacts').select('id').eq('tenant_id', tenantId).eq('phone', phone).single();
                            contact = ext.data;
                         } else {
                            throw error;
                         }
                    } else {
                        contact = newContact;
                    }
                }

                if (!contact) continue;

                // 2. Garante Conversa
                let { data: conversations, error: convQueryErr } = await supabase
                    .from('conversations')
                    .select('id, unread_count')
                    .eq('tenant_id', tenantId)
                    .eq('contact_id', contact.id)
                    .order('last_message_at', { ascending: false, nullsFirst: false })
                    .limit(1);

                let conversation = conversations && conversations.length > 0 ? conversations[0] : null;

                const textMessage = this.extractTextFromMessage(msg);
                const msgType = this.extractTypeFromMessage(msg);

                if (!conversation) {
                    const { data: newConv, error } = await supabase.from('conversations').insert({
                        tenant_id: tenantId,
                        instance_id: instanceId,
                        contact_id: contact.id,
                        status: 'bot',
                        last_message_preview: textMessage.substring(0, 50),
                        last_message_at: tsDate.toISOString(),
                        unread_count: direction === 'inbound' ? 1 : 0
                    }).select('id').single();
                    
                    if (error && error.code === 'PGRST204') {
                        const fallback = await supabase.from('conversations').insert({
                           tenant_id: tenantId, contact_id: contact.id, status: 'bot', unread_count: direction === 'inbound' ? 1 : 0
                        }).select('id').single();
                        conversation = fallback.data;
                    } else if (error && error.message?.includes('instance_id')) {
                        const fallback = await supabase.from('conversations').insert({
                           tenant_id: tenantId, contact_id: contact.id, status: 'bot', unread_count: direction === 'inbound' ? 1 : 0
                        }).select('id').single();
                        conversation = fallback.data;
                    } else if (newConv) {
                        conversation = newConv;
                    }
                } else {
                    const unread = direction === 'inbound' ? conversation.unread_count + 1 : 0;
                    
                    // Supabase auto-ignora colunas inexistentes ou queixa. O update deve tolerar last_message_at.
                    const payloadUpdate = {
                        updated_at: new Date().toISOString(),
                        unread_count: unread,
                        last_message_preview: textMessage.substring(0, 50),
                        last_message_at: tsDate.toISOString()
                    };

                    const updateRes = await supabase.from('conversations').update(payloadUpdate).eq('id', conversation.id);
                    if (updateRes.error) {
                        // Tentar update só básico
                        await supabase.from('conversations').update({
                           updated_at: new Date().toISOString(), unread_count: unread, last_message_preview: textMessage.substring(0, 50)
                        }).eq('id', conversation.id);
                    }
                }

                if (!conversation) continue;

                // 2.5 Tratamento de Mídia
                let mediaUrl = EventProcessor.pendingMediaCache ? EventProcessor.pendingMediaCache.get(msg.key.id) || null : null;
                let mediaMetadata = null;

                if (!mediaUrl && ['image', 'video', 'audio', 'document'].includes(msgType)) {
                    try {
                        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { 
                            logger: console, 
                            reuploadRequest: sock.updateMediaMessage 
                        });
                        
                        const mediaMeta = msg.message[msgType + 'Message'] || {};
                        const mimeType = mediaMeta.mimetype || 'application/octet-stream';
                        const fileName = mediaMeta.fileName || 'media_' + Date.now();
                        const ext = mimeType.split('/')[1]?.split(';')[0] || 'tmp';
                        const safeName = fileName.replace(/[^a-zA-Z0-9.\-]/g, '_');
                        
                        const storagePath = `tenant_${tenantId}/instance_${instanceId}/${conversation.id}/${Date.now()}_${safeName}`;
                        
                        const { error: uploadErr } = await supabase.storage
                            .from('chat_media')
                            .upload(storagePath, buffer, { contentType: mimeType });
                        
                        if (uploadErr) {
                            console.error('[EventProcessor] Erro no upload da mídia:', uploadErr);
                        } else {
                            const { data: publicUrlData } = supabase.storage.from('chat_media').getPublicUrl(storagePath);
                            mediaUrl = publicUrlData.publicUrl;
                            
                            mediaMetadata = {
                                mime_type: mimeType,
                                file_name: fileName,
                                file_size: mediaMeta.fileLength?.low || mediaMeta.fileLength || buffer.length,
                                duration: mediaMeta.seconds,
                                width: mediaMeta.width,
                                height: mediaMeta.height,
                                page_count: mediaMeta.pageCount,
                                is_voice_note: mediaMeta.ptt || false
                            };
                        }
                    } catch (err) {
                        console.error('[EventProcessor] Falha ao baixar mídia do Baileys:', err);
                    }
                }

                // 3. Salva a Mensagem
                const msgPayload = {
                    tenant_id: tenantId,
                    instance_id: instanceId,
                    conversation_id: conversation.id,
                    direction,
                    message_type: msgType,
                    status: 'delivered',
                    text_content: textMessage,
                    whatsapp_message_id: msg.key.id,
                    sender_type: senderType,
                    timestamp: tsDate.toISOString(),
                    raw_payload: msg,
                    media_url: mediaUrl,
                    media_metadata: mediaMetadata
                };


                const { data: savedMsg, error: msgErr } = await supabase.from('messages').insert(msgPayload).select('*').single();

                let finalSavedMsg = savedMsg;
                if(msgErr) {
                    console.error('[EventProcessor] ERRO DB MESSAGE INSERT:', msgErr, 'Payload:', msgPayload);
                    if (msgErr.code !== '23505') {
                        // tenta sem instance_id
                        const { data: fallbackMsg, error: fallbackErr } = await supabase.from('messages').insert({
                            tenant_id: tenantId, conversation_id: conversation.id, direction, message_type: msgType, 
                            status: 'delivered', text_content: textMessage, whatsapp_message_id: msg.key.id, 
                            sender_type: senderType, timestamp: tsDate.toISOString(), raw_payload: msg, 
                            media_url: mediaUrl, media_metadata: mediaMetadata
                        }).select('*').single();
                        
                        if (fallbackErr) console.error('[EventProcessor] ERRO DB MESSAGE FALLBACK:', fallbackErr);
                        finalSavedMsg = fallbackMsg;
                    }
                }

                // Dispara apenas se não for histórico arcaico (sincronização inicial não costuma ter m.type === 'notify' para bulk antigo)
                if (finalSavedMsg && m.type !== 'append') {
                    await realtime.publishInboxEvent(tenantId, 'message.new', {
                        message: finalSavedMsg,
                        contact_phone: phone,
                        conversation_id: conversation.id
                    });
                }

            } catch (e) {
                console.error(`[EventProcessor] Erro ao tratar mensagens (loop):`, e);
            }
        }
    }

    async handleMessagingHistorySet(tenantId, instanceId, sock, payload) {
        const { chats, contacts, messages, isLatest } = payload;
        console.log(`[EventProcessor] Histórico Completo Recebido: ${chats.length} chats, ${contacts.length} contatos, ${messages.length} msgs. IsLatest: ${isLatest}`);
        
        // Contacts
        for (const c of contacts) {
            const jid = c.id;
            if (this.isBroadcast(jid) || this.isGroup(jid)) continue;
            
            const phone = jid.split('@')[0];
            const pushName = c.notify || c.name || phone;

            await supabase.from('contacts').upsert({
                tenant_id: tenantId,
                phone: phone,
                name: pushName,
                whatsapp_jid: jid
            }, { onConflict: 'tenant_id, phone', ignoreDuplicates: true });
        }

        // Chats (Conversations meta)
        for (const chat of chats) {
            const jid = chat.id;
            if (this.isBroadcast(jid) || this.isGroup(jid)) continue;
            
            const phone = jid.split('@')[0];
            
            // Busca contato local
            const { data: contact } = await supabase.from('contacts').select('id').eq('tenant_id', tenantId).eq('phone', phone).single();
            if (!contact) continue;

            let tsDate = new Date();
            if (chat.conversationTimestamp) {
                const ts = chat.conversationTimestamp;
                tsDate = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts.low * 1000);
            }

            // Busca se já existe conversa
            const { data: conv } = await supabase.from('conversations')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('contact_id', contact.id)
                .limit(1);

            if (!conv || conv.length === 0) {
                await supabase.from('conversations').insert({
                    tenant_id: tenantId,
                    contact_id: contact.id,
                    status: 'bot',
                    unread_count: chat.unreadCount || 0
                });
            } else {
                await supabase.from('conversations').update({
                    unread_count: chat.unreadCount || 0
                }).eq('id', conv[0].id);
            }
        }

        // O Bulk de messages normalmente é processado pelo array gigante messages. 
        // Vamos engatilhar o messageUpsert simulando um array the upsert se houver
        if (messages && messages.length > 0) {
            // Reverte a array para o mais antigo inserir primeiro e refletir a subida no tempo
            const chronologicMessages = [...messages].reverse(); 
            // Inserimos aos poucos para evitar travamento
            // Por otimização extrema, em SAAS, historicos mtos pesados devem usar insertBatch, mas o framework Supabase JS aceita.
            await this.handleMessageUpsert(tenantId, instanceId, sock, { messages: chronologicMessages, type: 'append' });
        }
        
        console.log(`[EventProcessor] Evento de sync histórico processado.`);
    }

    async handleChatsUpsert(tenantId, instanceId, sock, chats) {
        console.log(`[EventProcessor] Novas chats (upsert): ${chats.length}`);
        // Similar a history set chats logic, handled incrementally.
    }

    async handleChatsUpdate(tenantId, instanceId, sock, updates) {
        // updates é um array de Partial<Chat>
        for (const update of updates) {
            const jid = update.id;
            if (this.isBroadcast(jid) || this.isGroup(jid)) continue;

            const phone = jid.split('@')[0];
            const { data: contact } = await supabase.from('contacts').select('id').eq('tenant_id', tenantId).eq('phone', phone).single();
            if(!contact) continue;

            const { data: conversation } = await supabase.from('conversations').select('id').eq('tenant_id', tenantId).eq('contact_id', contact.id).single();
            if(!conversation) continue;

            if (update.unreadCount !== undefined) {
                 await supabase.from('conversations').update({ unread_count: update.unreadCount }).eq('id', conversation.id);
            }
        }
    }

    extractTextFromMessage(msg) {
        if (!msg.message) return '';
        if (msg.message.conversation) return msg.message.conversation;
        if (msg.message.extendedTextMessage) return msg.message.extendedTextMessage.text;
        if (msg.message.imageMessage) return msg.message.imageMessage.caption || '📸 Imagem / Foto';
        if (msg.message.audioMessage) return '🎵 Áudio';
        if (msg.message.videoMessage) return msg.message.videoMessage.caption || '🎥 Vídeo';
        if (msg.message.documentMessage) return '📁 Documento';
        if (msg.message.reactionMessage) return '❤️ Reação: ' + msg.message.reactionMessage.text;
        return '📎 Mensagem';
    }

    extractTypeFromMessage(msg) {
        if (!msg.message) return 'text';
        if (msg.message.imageMessage) return 'image';
        if (msg.message.audioMessage) return 'audio';
        if (msg.message.videoMessage) return 'video';
        if (msg.message.documentMessage) return 'document';
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
                } catch(e) {
                    console.error("Failed to generate QR base64:", e);
                }
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                const loggedOut = reason === 401;
                const isTransient = [408, 428, 440, 503, 515].includes(reason);

                if (isTransient) {
                    await supabase.from('whatsapp_instances')
                        .update({ status: 'connecting', last_error: `Reconnecting (Code: ${reason})` })
                        .eq('id', instanceId);
                    
                    payload.status = 'connecting';
                    payload.reason = reason;
                } else {
                    await supabase.from('whatsapp_instances')
                        .update({ status: 'offline', last_error: `Code: ${reason}` })
                        .eq('id', instanceId);
                    
                    payload.status = 'offline';
                    payload.reason = reason;
                    if(loggedOut) payload.loggedOut = true;
                }
            }

            if (connection === 'open') {
                await supabase.from('whatsapp_instances')
                    .update({ status: 'connected', last_error: null })
                    .eq('id', instanceId);
                
                await supabase.from('whatsapp_instance_runtime')
                    .upsert({ instance_id: instanceId, tenant_id: tenantId, qr_code: null }, { onConflict: 'instance_id' });

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
export default new EventProcessor();
