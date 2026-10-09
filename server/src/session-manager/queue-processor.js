import { supabase, NODE_ID, retryWithBackoff, resolveTargetJid } from '../supabase.js';
import { buildWhatsAppMessage } from './message-builder.js';
import { runOutgoingReconciliation } from './reconciler.js';

const OUTBOX_TTL_MS = 10 * 60 * 1000; // TTL estrito de 10 minutos: mensagens mais antigas são descartadas da fila

class QueueProcessor {
    constructor() {
        this.activeProcessors = new Set();
        this.pendingTriggers = new Set();
        this.running = false;
        this.timer = null;
    }

    start() {
        if (this.running) return;
        this.running = true;
        console.log(`[QueueProcessor] Iniciado processador de filas de outbox para o NODE_ID: ${NODE_ID} (TTL: 10min)`);
        
        // Limpeza de contingência inicial: expira mensagens com mais de 10 minutos
        this.cleanupExpiredMessages().catch(() => {});

        // Auto-recuperação inicial de mensagens presas
        this.reconcileStuckProcessingMessages().catch(() => {});

        // Inicia o loop de processamento
        this.loop();

        // Limpeza periódica de contingência (TTL 10min) e reconciliação a cada 45 segundos
        setInterval(() => {
            if (this.running) {
                this.cleanupExpiredMessages().catch(() => {});
                this.reconcileStuckProcessingMessages().catch(() => {});
                runOutgoingReconciliation().catch(() => {});
            }
        }, 45000);
    }

    /**
     * Limpa e expira automaticamente mensagens acumuladas na fila há mais de 10 minutos.
     * Impede loops, acúmulo infinito e envio tardio fora de contexto aos clientes.
     */
    async cleanupExpiredMessages() {
        try {
            const tenMinutesAgo = new Date(Date.now() - OUTBOX_TTL_MS).toISOString();
            const { data: expired, error } = await supabase
                .from('wa_outgoing_messages')
                .update({
                    status: 'failed',
                    last_error: 'Expirada por tempo limite de contingência (> 10min) - Envio tardio cancelado'
                })
                .in('status', ['pending', 'processing'])
                .lte('created_at', tenMinutesAgo)
                .select('id, instance_id, chat_jid');

            if (expired && expired.length > 0) {
                console.warn(`[QueueProcessor/TTL] ⏱️ Expiradas e canceladas ${expired.length} mensagens antigas (> 10min) da fila de outbox.`);
            }

            // Limpeza preventiva de mensagens antigas finalizadas (> 7 dias) para manter a tabela leve
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            await supabase
                .from('wa_outgoing_messages')
                .delete()
                .in('status', ['sent', 'failed'])
                .lte('created_at', sevenDaysAgo);
        } catch (err) {
            console.warn(`[QueueProcessor/TTL] Aviso ao limpar mensagens expiradas:`, err.message);
        }
    }

    /**
     * Auto-cura para mensagens que ficaram presas em status 'processing'
     * (ex: após reboot do servidor ou falha silenciosa de processo anterior)
     */
    async reconcileStuckProcessingMessages() {
        try {
            const tenMinutesAgo = new Date(Date.now() - OUTBOX_TTL_MS).toISOString();
            const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

            // Mensagens presas em processing com mais de 10 minutos expiram imediatamente
            await supabase
                .from('wa_outgoing_messages')
                .update({
                    status: 'failed',
                    last_error: 'Expirada em processamento órfão (> 10min)'
                })
                .eq('status', 'processing')
                .lte('created_at', tenMinutesAgo);

            // Mensagens recentes entre 3 e 10 minutos são recuperadas se attempts < 4
            const { data: stuckMsgs, error } = await supabase
                .from('wa_outgoing_messages')
                .select('id, attempts, last_error, created_at')
                .eq('status', 'processing')
                .gt('created_at', tenMinutesAgo)
                .lte('created_at', threeMinutesAgo)
                .limit(50);

            if (error || !stuckMsgs || stuckMsgs.length === 0) return;

            console.log(`[QueueProcessor/SelfHealing] 🩹 Auto-recuperando ${stuckMsgs.length} mensagens presas em status 'processing'...`);
            for (const s of stuckMsgs) {
                const currentAttempts = s.attempts || 0;
                const newStatus = currentAttempts >= 4 ? 'failed' : 'pending';
                await supabase
                    .from('wa_outgoing_messages')
                    .update({
                        status: newStatus,
                        scheduled_at: new Date().toISOString(),
                        last_error: currentAttempts >= 4 ? (s.last_error || 'Limite de tentativas atingido (Presa em processing)') : 'Recuperado de processamento órfão por auto-cura'
                    })
                    .eq('id', s.id)
                    .eq('status', 'processing');
            }
        } catch (e) {
            console.warn(`[QueueProcessor/SelfHealing] Aviso na recuperação de mensagens presas:`, e.message);
        }
    }

    stop() {
        this.running = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /**
     * Dispara o processamento imediato da fila para uma instância específica (Fast-Trigger)
     */
    trigger(tenantId, instanceId) {
        if (!instanceId || !this.running) return;
        setImmediate(async () => {
            try {
                if (this.activeProcessors.has(instanceId)) return;
                this.activeProcessors.add(instanceId);
                await this.processInstanceQueue(tenantId, instanceId).finally(() => {
                    this.activeProcessors.delete(instanceId);
                });
            } catch (err) {
                console.warn(`[QueueProcessor/Trigger] Aviso ao processar trigger imediato para ${instanceId}:`, err.message);
            }
        });
    }

    async loop() {
        if (!this.running) return;

        let instances = null;
        try {
            // 1. Busca instâncias que estão conectadas e são controladas especificamente por este worker
            const currentNodeId = String(NODE_ID).trim();
            instances = await retryWithBackoff(async () => {
                const { data, error } = await supabase
                    .from('whatsapp_instances')
                    .select('id, tenant_id, assigned_node_id, lease_until')
                    .eq('assigned_node_id', currentNodeId)
                    .in('status', ['connected', 'connected_local']);
                if (error) throw error;
                return data;
            });

            if (instances && instances.length > 0) {
                const now = new Date();

                for (const inst of instances) {
                    const instanceId = inst.id;
                    const tenantId = inst.tenant_id;
                    const assignedNodeId = inst.assigned_node_id ? String(inst.assigned_node_id).trim() : null;
                    const isLockedByOther = assignedNodeId && assignedNodeId !== currentNodeId && inst.lease_until && new Date(inst.lease_until) > now;

                    // Se a instância está sob lease ativo de outro worker, este nó não deve processá-la
                    if (isLockedByOther) continue;

                    // Isolamento de concorrência: só processa se a instância estiver vinculada a este nó ou se houver sessão ativa na RAM local
                    const { default: sessionManager } = await import('./index.js');
                    const isOwnedByMe = assignedNodeId === currentNodeId;
                    const hasLocalSession = sessionManager.sessions.has(instanceId);
                    if (!isOwnedByMe && !hasLocalSession) {
                        continue;
                    }

                    // Se já houver um processador rodando para esta instância, pula para não enviar em paralelo
                    if (this.activeProcessors.has(instanceId)) continue;

                    this.activeProcessors.add(instanceId);
                    this.processInstanceQueue(tenantId, instanceId).finally(() => {
                        this.activeProcessors.delete(instanceId);
                    });
                }
            }
        } catch (err) {
            if (err.message && (err.message.includes('fetch failed') || err.message.includes('timeout') || err.message.includes('Network'))) {
                console.info(`[QueueProcessor/Loop] Oscilação temporária de rede no loop de outbox. Auto-recuperando em 3s...`);
            } else {
                console.error(`[QueueProcessor/Loop] Erro no loop de outbox:`, err.message);
            }
        }

        // Agenda a próxima execução com intervalo adaptativo suave (2.5s se houver instâncias, 3.5s em repouso)
        const nextDelay = (instances && instances.length > 0) ? 2500 : 3500;
        this.timer = setTimeout(() => this.loop(), nextDelay);
    }

    async processInstanceQueue(tenantId, instanceId) {
        const { default: sessionManager } = await import('./index.js');
        const currentNodeId = String(NODE_ID).trim();
        const hasLocalSession = sessionManager.sessions.has(instanceId);

        // Se este nó não possui a sessão em RAM local, verifica no banco se ela pertence a outro nó ativo
        if (!hasLocalSession) {
            const { data: instCheck } = await supabase
                .from('whatsapp_instances')
                .select('assigned_node_id, lease_until, status')
                .eq('id', instanceId)
                .maybeSingle();

            const assignedNodeId = instCheck?.assigned_node_id ? String(instCheck.assigned_node_id).trim() : null;
            const now = new Date();
            const isLockedByOther = assignedNodeId && assignedNodeId !== currentNodeId && instCheck?.lease_until && new Date(instCheck.lease_until) > now;

            // Se outro nó ativo detém a posse da instância com lease válido, não interceptar a fila neste nó
            if (isLockedByOther) {
                console.log(`[QueueProcessor] Instância ${instanceId} está sob lock ativo do nó '${assignedNodeId}'. O envio do outbox será realizado pelo nó proprietário.`);
                return;
            }
        }

        while (this.running) {
            let msg = null;
            try {
                // Busca a próxima mensagem pendente da fila para esta instância (com TTL estrito de 10 minutos)
                const tenMinutesAgo = new Date(Date.now() - OUTBOX_TTL_MS).toISOString();
                const messages = await retryWithBackoff(async () => {
                    const { data, error } = await supabase
                        .from('wa_outgoing_messages')
                        .select('*')
                        .eq('instance_id', instanceId)
                        .eq('status', 'pending')
                        .gte('created_at', tenMinutesAgo) // TTL estrito de 10 minutos: mensagens mais antigas nunca são processadas
                        .lte('scheduled_at', new Date().toISOString())
                        .order('priority', { ascending: true })
                        .order('created_at', { ascending: true })
                        .limit(1);
                    if (error) throw error;
                    return data;
                });
                if (!messages || messages.length === 0) {
                    break; // Fila vazia, sai do loop de processamento contínuo
                }

                msg = messages[0];

                // Contingência: validação defensiva de idade da mensagem (> 10 minutos é descartada imediatamente)
                const msgAgeMs = Date.now() - new Date(msg.created_at).getTime();
                if (msgAgeMs > OUTBOX_TTL_MS) {
                    console.warn(`[QueueProcessor/TTL] Mensagem ${msg.id} expirou na fila (${Math.round(msgAgeMs / 1000)}s > 600s). Descartando envio para não entregar mensagem tardia.`);
                    await supabase
                        .from('wa_outgoing_messages')
                        .update({ 
                            status: 'failed',
                            last_error: 'Expirada por tempo limite de contingência de fila (> 10min)'
                        })
                        .eq('id', msg.id);
                    continue;
                }

                // 1. Marca a mensagem como em processamento
                const { data: updatedMsg, error: updateErr } = await supabase
                    .from('wa_outgoing_messages')
                    .update({ 
                        status: 'processing',
                        attempts: msg.attempts + 1
                    })
                    .eq('id', msg.id)
                    .eq('status', 'pending') // Garante que nenhum outro worker tomou a mensagem
                    .select()
                    .single();

                if (updateErr || !updatedMsg) {
                    continue; // Outro processo assumiu, tenta a próxima do loop
                }

                console.log(`[QueueProcessor] Processando mensagem ${msg.id} para ${msg.chat_jid} via instância ${instanceId}`);

                const { default: sessionManager } = await import('./index.js');
                sessionManager.logMonitoringEvent(instanceId, 'message_processing', { 
                    msg_id: msg.id, 
                    chat_jid: msg.chat_jid, 
                    message_type: msg.message_type,
                    attempts: msg.attempts 
                }).catch(()=>{});

                // 2. Obtém o socket da instância ativa ou desperta a sessão se necessário (com timeout defensivo de 3.5s para não travar outras instâncias)
                let sock = null;
                try {
                    const wakePromise = sessionManager.getSocketOrWake(tenantId, instanceId);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_QUEUE_WAKE')), 3500));
                    sock = await Promise.race([wakePromise, timeoutPromise]);
                } catch (wErr) {
                    console.warn(`[QueueProcessor] Timeout ou falha rápida ao obter socket para ${instanceId}:`, wErr.message);
                }
                const isOperator = (msg.priority || 1) < 5;

                let isSocketReady = sock && (!sock.ws || sock.ws.readyState === 1 || sock.ws.isOpen);
                let meId = sock?.user?.id || sock?.authState?.creds?.me?.id;

                // Se o socket estiver em processo de abertura/handshake, aguarda até 2.5s antes de postergar
                if (sock && (!isSocketReady || !meId)) {
                    try {
                        await new Promise((res) => {
                            if (!sock.ws) return res(true);
                            if (sock.ws.isOpen || sock.ws.readyState === 1) return res(true);
                            
                            let isDone = false;
                            let timer = null;
                            const cleanup = () => {
                                if (isDone) return;
                                isDone = true;
                                if (timer) clearTimeout(timer);
                                try {
                                    if (sock.ev && typeof sock.ev.off === 'function') {
                                        sock.ev.off('connection.update', onUpdate);
                                    }
                                } catch (e) {}
                            };

                            const onUpdate = (u) => {
                                if (u.connection === 'open') {
                                    cleanup();
                                    res(true);
                                } else if (u.connection === 'close') {
                                    cleanup();
                                    res(false);
                                }
                            };

                            timer = setTimeout(() => {
                                cleanup();
                                res(false);
                            }, 2500);

                            if (sock.ev && typeof sock.ev.on === 'function') {
                                sock.ev.on('connection.update', onUpdate);
                            } else {
                                cleanup();
                                res(false);
                            }
                        });
                        isSocketReady = sock && (!sock.ws || sock.ws.readyState === 1 || sock.ws.isOpen);
                        meId = sock?.user?.id || sock?.authState?.creds?.me?.id;
                    } catch (e) {}
                }

                if (!sock || !isSocketReady || !meId) {
                    const currentAttempts = (msg.attempts || 0);
                    const maxSocketWaitAttempts = 3;
                    
                    if (currentAttempts >= maxSocketWaitAttempts || msgAgeMs > (8 * 60 * 1000)) {
                        console.warn(`[QueueProcessor] [MSG_TRACE:OUTBOX_FAIL] Mensagem ${msg.id} atingiu limite de tentativas (${currentAttempts}/${maxSocketWaitAttempts}) ou tempo com socket offline da instância ${instanceId}. Marcando como failed.`);
                        await supabase
                            .from('wa_outgoing_messages')
                            .update({ 
                                status: 'failed',
                                last_error: 'Instância do WhatsApp desconectada ou tempo de contingência de envio atingido.'
                            })
                            .eq('id', msg.id);
                        break; // Sai do processamento desta instância no momento para não travar outras instâncias
                    }

                    const retryDelayMs = isOperator ? Math.min(800 * Math.pow(1.3, currentAttempts), 2500) : Math.min(3000 * Math.pow(1.3, currentAttempts), 15000);
                    console.log(`[QueueProcessor] [MSG_TRACE:OUTBOX_RETRY] Socket da instância ${instanceId} indisponível/reconectando (tentativa ${currentAttempts}/${maxSocketWaitAttempts}). Reagendando mensagem ${msg.id} em ${Math.round(retryDelayMs / 1000)}s...`);
                    await supabase
                        .from('wa_outgoing_messages')
                        .update({ 
                            status: 'pending',
                            scheduled_at: new Date(Date.now() + retryDelayMs).toISOString(),
                            last_error: 'Socket em reconexão ou temporariamente indisponível'
                        })
                        .eq('id', msg.id);
                    break; // Não tenta enviar outras mensagens desta mesma instância enquanto o socket estiver offline
                }

                // 3. Rate Limit / Delay Humano Anti-Ban:
                // Previne detecção de comportamento automatizado e disparos em rajada (burst) que causam bloqueios na Meta.
                // Se priority for >= 5 (campanhas/automação), aplicamos delay de 3.5s a 6s
                // Se priority for < 5 (operador manual em outbox), aplicamos delay humano de 1.2s a 2.2s com jitter
                if (msg.priority >= 5) {
                    const delay = Math.floor(Math.random() * (6000 - 3500 + 1)) + 3500;
                    console.log(`[QueueProcessor] [Anti-Ban] Aplicando delay de automação de ${delay / 1000}s antes do envio...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    const delay = Math.floor(Math.random() * (2200 - 1200 + 1)) + 1200;
                    console.log(`[QueueProcessor] [Anti-Ban] Cadência humana anti-ban aplicada (${delay}ms) para instância ${instanceId}.`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                // 4. Dispara o envio real usando o Baileys originalSendMessage ou sendMessage
                const sendFn = sock.originalSendMessage || sock.sendMessage;
                if (typeof sendFn !== 'function') {
                    throw new Error('Função de envio de mensagens indisponível no socket.');
                }

                let targetJid = msg.chat_jid;
                const isGroup = targetJid.endsWith('@g.us');
                if (!isGroup) {
                    try {
                        targetJid = await resolveTargetJid(sock, targetJid, msg.tenant_id);
                    } catch (err) {
                        console.warn(`[QueueProcessor] Erro na formatação do JID para ${targetJid}:`, err.message);
                    }
                }

                let result;
                const responseType = msg.response_type || msg.options?.responseType || 'STANDARD';

                const sendOptions = { priority: msg.priority, isAutomation: (msg.priority || 1) >= 5, skipDelay: true };

                if (msg.message_type === 'text') {
                    result = await sendFn(targetJid, { text: msg.body }, sendOptions);
                } else if (msg.message_type === 'media' && msg.media_url) {
                    // Se for TUTORIAL, garante validação estrita e envio com gifPlayback: true
                    if (responseType === 'TUTORIAL') {
                        console.log(`[QueueProcessor] Enviando resposta pronta TUTORIAL para ${targetJid} com gifPlayback: true`);
                        const tutorialPayload = buildWhatsAppMessage({
                            messageType: 'video',
                            mediaUrl: msg.media_url,
                            caption: msg.body || '',
                            mimetype: msg.options?.mimetype || 'video/mp4',
                            responseType: 'TUTORIAL'
                        });
                        result = await sendFn(targetJid, tutorialPayload);
                    } else {
                        // Envio de mídia por URL convencional (STANDARD)
                        let pathname = '';
                        try {
                            pathname = new URL(msg.media_url).pathname;
                        } catch (e) {
                            pathname = msg.media_url || '';
                        }

                        const isImage = pathname.match(/\.(jpeg|jpg|gif|png|webp)$/i);
                        const isVideo = pathname.match(/\.(mp4|3gp|mov|webm|avi|m4v)$/i);
                        const isAudio = pathname.match(/\.(mp3|ogg|wav|m4a|aac)$/i) || msg.media_url.includes('audio');

                        let forceDocument = false;
                        let fileSize = 0;
                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 5000);
                            const headRes = await fetch(msg.media_url, { method: 'HEAD', signal: controller.signal });
                            clearTimeout(timeoutId);
                            
                            if (headRes.ok) {
                                const len = headRes.headers.get('content-length');
                                if (len) {
                                    fileSize = parseInt(len, 10);
                                    // Aumentado limite para permitir que vídeos grandes de demonstração (até 150MB) sejam exibidos abertos no WhatsApp
                                    const sizeLimit = isVideo ? 150 * 1024 * 1024 : 15 * 1024 * 1024;
                                    if (fileSize > sizeLimit) {
                                        console.log(`[QueueProcessor] Arquivo de mídia é muito grande (${(fileSize / (1024 * 1024)).toFixed(2)}MB). Forçando envio como documento.`);
                                        forceDocument = true;
                                    }
                                }
                            }
                        } catch (headErr) {
                            console.warn(`[QueueProcessor] Falha ao consultar cabeçalho da mídia por URL (HEAD):`, headErr.message);
                        }

                        let rawFileName = msg.media_url.split('/').pop()?.split('?')[0] || '';
                        let cleanFileName = rawFileName;
                        if (cleanFileName.includes('_')) {
                            const parts = cleanFileName.split('_');
                            if (parts.length > 1 && /^\d+$/.test(parts[0])) {
                                cleanFileName = parts.slice(1).join('_');
                            }
                        }

                        const mediaOptions = buildWhatsAppMessage({
                            messageType: isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'document',
                            mediaUrl: msg.media_url,
                            caption: msg.body,
                            mimetype: msg.options?.mimetype,
                            fileName: msg.options?.fileName || cleanFileName,
                            responseType: 'STANDARD',
                            ptt: msg.options?.ptt || msg.media_url.includes('ptt') || msg.media_url.includes('audio'),
                            forceDocument
                        });

                        result = await sendFn(targetJid, mediaOptions);
                    }
                } else {
                    throw new Error(`Tipo de mensagem não suportado: ${msg.message_type}`);
                }

                if (result && targetJid !== msg.chat_jid && !targetJid.endsWith('@lid')) {
                    supabase.from('contacts')
                        .update({ whatsapp_jid: targetJid })
                        .eq('phone', msg.chat_jid.split('@')[0])
                        .eq('tenant_id', tenantId)
                        .then(({ error }) => {
                            if (error) console.error(`[QueueProcessor] Erro ao atualizar JID do contato no banco:`, error.message);
                            else console.log(`[QueueProcessor] JID de contato atualizado com sucesso no banco para: ${targetJid}`);
                        }).catch(() => {});
                }

                // 5. Sucesso: Atualiza a fila
                await supabase
                    .from('wa_outgoing_messages')
                    .update({ 
                        status: 'sent',
                        sent_at: new Date().toISOString(),
                        options: { ...(typeof msg.options === 'object' && msg.options !== null ? msg.options : {}), messageId: result?.key?.id },
                        last_error: null
                    })
                    .eq('id', msg.id);

                // Converte qualquer mensagem temporária mockId em messages para o ID definitivo do WhatsApp
                const mockId = `EDGE_${msg.id.replace(/-/g, '')}`;
                if (result?.key?.id) {
                    supabase.from('messages')
                        .update({ 
                            whatsapp_message_id: result.key.id,
                            status: 'sent'
                        })
                        .eq('whatsapp_message_id', mockId)
                        .then(() => {})
                        .catch(() => {});
                }

                // Notifica imediatamente o Frontend via Broadcast de baixa latência (<30ms)
                try {
                    const { default: realtime } = await import('../realtime-publisher/index.js');
                    if (realtime && typeof realtime.publishInboxEvent === 'function') {
                        realtime.publishInboxEvent(tenantId, 'message.update', {
                            mock_id: mockId,
                            whatsapp_message_id: result?.key?.id,
                            status: 'sent',
                            chat_jid: targetJid
                        }).catch(() => {});
                    }
                } catch (rtErr) {}

                // 6. Sincroniza a mensagem enviada com a tabela clássica de mensagens para o Frontend refletir
                try {
                    const { EventProcessor, default: eventProcessor } = await import('../event-processor/index.js');
                    const processor = eventProcessor || (EventProcessor?.instance) || (typeof EventProcessor === 'function' ? new EventProcessor() : EventProcessor);
                    const epClass = EventProcessor || processor?.constructor;

                    if (processor && result && result.key) {
                        if (msg.priority < 5 || (typeof isOperator !== 'undefined' && isOperator)) {
                            if (epClass && !epClass.humanMessagesCache) epClass.humanMessagesCache = new Map();
                            if (epClass && epClass.humanMessagesCache) {
                                epClass.humanMessagesCache.set(`${instanceId}_${result.key.id}`, true);
                                setTimeout(() => epClass.humanMessagesCache && epClass.humanMessagesCache.delete(`${instanceId}_${result.key.id}`), 60000);
                            }
                        }
                        const mockUpsert = {
                            messages: [result],
                            type: 'notify'
                        };
                        if (typeof processor.handleMessageUpsert === 'function') {
                            await processor.handleMessageUpsert(tenantId, instanceId, sock, mockUpsert);
                        }
                    }
                } catch (compatErr) {
                    console.error(`[QueueProcessor/Compatibility] Erro ao sincronizar mensagem enviada com as tabelas legadas:`, compatErr.message);
                }

                console.log(`[QueueProcessor] [MSG_TRACE:OUTBOX_SENT] Mensagem ${msg.id} enviada com sucesso para ${msg.chat_jid}. WhatsAppMsgId: ${result?.key?.id}`);
                sessionManager.logMonitoringEvent(instanceId, 'message_sent_success', { 
                    msg_id: msg.id, 
                    chat_jid: msg.chat_jid,
                    result: result ? { key: result.key } : null
                }).catch(()=>{});
            } catch (err) {
                if (msg) {
                    const errMsg = err?.message || err?.error || (typeof err === 'object' ? JSON.stringify(err) : String(err));
                    const isTransient = errMsg.includes('Connection Closed') || errMsg.includes('WebSocket') || errMsg.includes('restartRequired');
                    
                    if (isTransient) {
                        console.warn(`[QueueProcessor] [MSG_TRACE:OUTBOX_TRANSIENT] Oscilação temporária ao enviar mensagem ${msg.id}: ${errMsg}. Reagendando...`);
                    } else {
                        console.error(`[QueueProcessor] [MSG_TRACE:OUTBOX_ERROR] Falha ao enviar mensagem ${msg.id}:`, errMsg);
                    }

                    const isCryptoErr = 
                        errMsg.includes('All encryptions failed') || 
                        errMsg.includes('No sessions') || 
                        errMsg.includes('SessionError') || 
                        errMsg.includes('PreKey') || 
                        errMsg.includes('Bad MAC');

                    if (isCryptoErr) {
                        console.warn(`[QueueProcessor] Erro criptográfico de sessão (${errMsg}) para ${msg.chat_jid} via instância ${instanceId}. Limpando chaves e device-list para forçar renovação de pre-keys...`);
                        try {
                            const { clearRecipientSession } = await import('./auth.js');
                            clearRecipientSession(instanceId, msg.chat_jid);
                            const cleanPhone = String(msg.chat_jid).replace(/\D/g, '');
                            if (cleanPhone && cleanPhone.length >= 8) {
                                supabase.from('wa_auth_keys')
                                    .delete()
                                    .eq('instance_id', instanceId)
                                    .or(`key_name.eq.device-list-${cleanPhone},key_name.ilike.%${cleanPhone}%`)
                                    .then(() => {})
                                    .catch(() => {});
                            }
                        } catch (e) {}
                    }

                    const newAttempts = (msg.attempts || 0) + 1;
                    const maxAttempts = 3;
                    const isExpired = (Date.now() - new Date(msg.created_at).getTime()) > OUTBOX_TTL_MS;
                    const newStatus = (newAttempts >= maxAttempts || isExpired) ? 'failed' : 'pending';
                    const isOperator = (msg.priority || 1) < 5;
                    const retryDelayMs = isOperator ? (isCryptoErr ? 1000 : 1500) : 4000;

                    try {
                        const { default: sManager } = await import('./index.js');
                        sManager.logMonitoringEvent(instanceId, 'message_sent_failed', { 
                            msg_id: msg.id, 
                            chat_jid: msg.chat_jid, 
                            error: errMsg,
                            attempts: newAttempts,
                            expired: isExpired
                        }).catch(()=>{});
                    } catch (logErr) {}

                    const finalError = isExpired 
                        ? `Expirada por tempo limite de contingência (> 10min): ${errMsg || 'Tentativa cancelada'}`
                        : (errMsg || 'Erro de conexão/envio');

                    await supabase
                        .from('wa_outgoing_messages')
                        .update({ 
                            status: newStatus,
                            attempts: newAttempts,
                            last_error: finalError,
                            scheduled_at: new Date(Date.now() + retryDelayMs).toISOString()
                        })
                        .eq('id', msg.id);

                    // PREVENÇÃO DE SUMIÇO DE MENSAGEM: Se a mensagem falhar definitivamente,
                    // persiste na tabela 'messages' com status 'error' para ficar salva permanentemente no banco.
                    if (newStatus === 'failed') {
                        try {
                            const cleanPhone = String(msg.chat_jid).replace(/\D/g, '');
                            const mockId = `EDGE_${msg.id.replace(/-/g, '')}`;
                            
                            // Localiza o contato e a conversa ativa
                            const { data: contacts } = await supabase
                                .from('contacts')
                                .select('id')
                                .eq('tenant_id', msg.tenant_id)
                                .eq('phone', cleanPhone)
                                .limit(1);

                            let convId = null;
                            if (contacts && contacts.length > 0) {
                                const { data: convs } = await supabase
                                    .from('conversations')
                                    .select('id')
                                    .eq('contact_id', contacts[0].id)
                                    .eq('tenant_id', msg.tenant_id)
                                    .order('updated_at', { ascending: false })
                                    .limit(1);
                                if (convs && convs.length > 0) {
                                    convId = convs[0].id;
                                }
                            }

                            if (convId) {
                                await supabase.from('messages').upsert({
                                    conversation_id: convId,
                                    tenant_id: msg.tenant_id,
                                    instance_id: instanceId,
                                    direction: 'outbound',
                                    message_type: msg.message_type || 'text',
                                    text_content: msg.body,
                                    sender_type: 'human',
                                    status: 'error',
                                    whatsapp_message_id: mockId,
                                    raw_payload: {
                                        error: errMsg,
                                        outbox_id: msg.id,
                                        failed_at: new Date().toISOString()
                                    },
                                    timestamp: msg.created_at || new Date().toISOString()
                                }, { onConflict: 'whatsapp_message_id' });

                                console.log(`[QueueProcessor] Mensagem ${msg.id} com falha definitiva persistida na tabela 'messages' da conversa ${convId}.`);

                                // Notifica a interface em tempo real
                                const { default: realtime } = await import('../realtime-publisher/index.js');
                                if (realtime && typeof realtime.publishInboxEvent === 'function') {
                                    realtime.publishInboxEvent(msg.tenant_id, 'message.update', {
                                        whatsapp_message_id: mockId,
                                        status: 'error',
                                        errorMessage: errMsg
                                    }).catch(() => {});
                                }
                            }
                        } catch (persistErr) {
                            console.warn('[QueueProcessor] Falha ao persistir mensagem com erro em messages:', persistErr.message);
                        }
                    }
                } else {
                    if (err.message && (err.message.includes('fetch failed') || err.message.includes('timeout') || err.message.includes('Network'))) {
                        console.warn(`[QueueProcessor] Falha de rede temporária ao carregar fila de mensagens:`, err.message);
                    } else {
                        console.error(`[QueueProcessor] Falha ao carregar fila de mensagens:`, err.message);
                    }
                    break;
                }
            }
        }
    }

    trigger(tenantId, instanceId) {
        if (!this.running) return;
        if (this.activeProcessors.has(instanceId)) {
            this.pendingTriggers.add(instanceId);
            return;
        }

        this.activeProcessors.add(instanceId);
        this.processInstanceQueue(tenantId, instanceId).finally(() => {
            this.activeProcessors.delete(instanceId);
            if (this.pendingTriggers.has(instanceId)) {
                this.pendingTriggers.delete(instanceId);
                this.trigger(tenantId, instanceId);
            }
        });
    }
}

const queueProcessor = new QueueProcessor();
export default queueProcessor;
