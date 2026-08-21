import { supabase, NODE_ID, retryWithBackoff, resolveTargetJid } from '../supabase.js';

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
        console.log(`[QueueProcessor] Iniciado processador de filas de outbox para o NODE_ID: ${NODE_ID}`);
        
        // Inicia o loop de processamento
        this.loop();
    }

    stop() {
        this.running = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    async loop() {
        if (!this.running) return;

        try {
            // 1. Busca instâncias que estão conectadas e são controladas por este worker (assigned_node_id = NODE_ID)
            const instances = await retryWithBackoff(async () => {
                const { data, error } = await supabase
                    .from('whatsapp_instances')
                    .select('id, tenant_id, assigned_node_id, lease_until')
                    .in('status', ['connected', 'connected_local']);
                if (error) throw error;
                return data;
            });

            if (instances && instances.length > 0) {
                const now = new Date();
                const currentNodeId = String(NODE_ID).trim();

                for (const inst of instances) {
                    const instanceId = inst.id;
                    const tenantId = inst.tenant_id;
                    const assignedNodeId = inst.assigned_node_id ? String(inst.assigned_node_id).trim() : null;
                    const isLockedByOther = assignedNodeId && assignedNodeId !== currentNodeId && inst.lease_until && new Date(inst.lease_until) > now;

                    // Se a instância está sob lease ativo de outro worker, este nó não deve processá-la
                    if (isLockedByOther) continue;

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

        // Agenda a próxima execução após 1.5 segundos para máxima agilidade
        this.timer = setTimeout(() => this.loop(), 1500);
    }

    async processInstanceQueue(tenantId, instanceId) {
        while (this.running) {
            let msg = null;
            try {
                // Busca a próxima mensagem pendente da fila para esta instância
                const messages = await retryWithBackoff(async () => {
                    const { data, error } = await supabase
                        .from('wa_outgoing_messages')
                        .select('*')
                        .eq('instance_id', instanceId)
                        .eq('status', 'pending')
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

                // 2. Obtém o socket da instância ativa ou desperta a sessão se necessário (Importação dinâmica)
                const sock = await sessionManager.getSocketOrWake(tenantId, instanceId);
                const isOperator = (msg.priority || 1) < 5;

                let isSocketReady = sock && (!sock.ws || sock.ws.readyState === 1 || sock.ws.isOpen);
                let meId = sock?.user?.id || sock?.authState?.creds?.me?.id;

                // Se o socket estiver em processo de abertura/handshake, aguarda até 2.5s antes de postergar
                if (sock && (!isSocketReady || !meId)) {
                    try {
                        await new Promise((res) => {
                            if (!sock.ws) return res(true);
                            if (sock.ws.isOpen || sock.ws.readyState === 1) return res(true);
                            const t = setTimeout(() => res(false), 2500);
                            const onUpdate = (u) => {
                                if (u.connection === 'open') {
                                    clearTimeout(t);
                                    sock.ev?.off('connection.update', onUpdate);
                                    res(true);
                                }
                            };
                            sock.ev?.on('connection.update', onUpdate);
                        });
                        isSocketReady = sock && (!sock.ws || sock.ws.readyState === 1 || sock.ws.isOpen);
                        meId = sock?.user?.id || sock?.authState?.creds?.me?.id;
                    } catch (e) {}
                }

                if (!sock || !isSocketReady || !meId) {
                    const retryDelayMs = isOperator ? 1500 : 8000;
                    console.log(`[QueueProcessor] Socket/Autenticação da instância ${instanceId} está indisponível/reconectando. Reagendando mensagem ${msg.id} em ${retryDelayMs / 1000}s...`);
                    await supabase
                        .from('wa_outgoing_messages')
                        .update({ 
                            status: 'pending',
                            scheduled_at: new Date(Date.now() + retryDelayMs).toISOString()
                        })
                        .eq('id', msg.id);
                    continue;
                }

                // 3. Rate Limit / Delay Humano Inteligente:
                // Se priority for >= 5 (campanhas/automoto), aplicamos delay humano estrito (6 a 12s)
                // Se priority for < 5 (operador manual), aplicamos um micro-delay de 100ms para evitar concorrência de rede
                if (msg.priority >= 5) {
                    const delay = Math.floor(Math.random() * (12000 - 6000 + 1)) + 6000;
                    console.log(`[QueueProcessor] Aplicando delay humano de ${delay / 1000}s antes do envio...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.log(`[QueueProcessor] Mensagem de alta prioridade (operador). Pulando delay de campanha (micro-delay 100ms).`);
                    await new Promise(resolve => setTimeout(resolve, 100));
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
                if (msg.message_type === 'text') {
                    result = await sendFn(targetJid, { text: msg.body });
                } else if (msg.message_type === 'media' && msg.media_url) {
                    // Envio de mídia por URL
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

                    const getMimeTypeFromFileName = (fileName) => {
                        const ext = fileName.split('.').pop()?.toLowerCase();
                        switch (ext) {
                            case 'pdf': return 'application/pdf';
                            case 'doc': return 'application/msword';
                            case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                            case 'xls': return 'application/vnd.ms-excel';
                            case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                            case 'ppt': return 'application/vnd.ms-powerpoint';
                            case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
                            case 'txt': return 'text/plain';
                            case 'csv': return 'text/csv';
                            case 'zip': return 'application/zip';
                            case 'rar': return 'application/x-rar-compressed';
                            case 'png': return 'image/png';
                            case 'jpg':
                            case 'jpeg': return 'image/jpeg';
                            case 'gif': return 'image/gif';
                            case 'webp': return 'image/webp';
                            case 'mp3': return 'audio/mpeg';
                            case 'ogg': return 'audio/ogg';
                            case 'wav': return 'audio/wav';
                            case 'mp4': return 'video/mp4';
                            default: return 'application/octet-stream';
                        }
                    };

                    const mediaOptions = {};
                    let rawFileName = msg.media_url.split('/').pop()?.split('?')[0] || '';
                    let cleanFileName = rawFileName;
                    if (cleanFileName.includes('_')) {
                        const parts = cleanFileName.split('_');
                        if (parts.length > 1 && /^\d+$/.test(parts[0])) {
                            cleanFileName = parts.slice(1).join('_');
                        }
                    }

                    if (forceDocument) {
                        mediaOptions.document = { url: msg.media_url };
                        if (isVideo) mediaOptions.mimetype = 'video/mp4';
                        else if (isImage) mediaOptions.mimetype = 'image/jpeg';
                        else if (isAudio) mediaOptions.mimetype = 'audio/ogg';
                        else mediaOptions.mimetype = getMimeTypeFromFileName(cleanFileName);

                        mediaOptions.fileName = cleanFileName || (isVideo ? 'video.mp4' : isImage ? 'image.jpg' : isAudio ? 'audio.ogg' : 'arquivo');
                    } else if (isImage) {
                        mediaOptions.image = { url: msg.media_url };
                        mediaOptions.mimetype = 'image/jpeg';
                    } else if (isVideo) {
                        mediaOptions.video = { url: msg.media_url };
                        mediaOptions.mimetype = 'video/mp4';
                        mediaOptions.gifPlayback = false;
                    } else if (isAudio) {
                        mediaOptions.audio = { url: msg.media_url };
                        mediaOptions.mimetype = 'audio/ogg; codecs=opus';
                        mediaOptions.ptt = msg.media_url.includes('ptt') || msg.media_url.includes('audio');
                    } else {
                        mediaOptions.document = { url: msg.media_url };
                        mediaOptions.mimetype = getMimeTypeFromFileName(cleanFileName);
                        mediaOptions.fileName = cleanFileName || 'documento';
                    }

                    if (msg.body) mediaOptions.caption = msg.body;

                    result = await sendFn(targetJid, mediaOptions);
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
                        last_error: null
                    })
                    .eq('id', msg.id);

                // 6. Sincroniza a mensagem enviada com a tabela clássica de mensagens para o Frontend refletir
                try {
                    const { default: eventProcessor } = await import('../event-processor/index.js');
                    if (eventProcessor && result && result.key) {
                        const mockUpsert = {
                            messages: [result],
                            type: 'notify'
                        };
                        await eventProcessor.handleMessageUpsert(tenantId, instanceId, sock, mockUpsert);
                    }
                } catch (compatErr) {
                    console.error(`[QueueProcessor/Compatibility] Erro ao sincronizar mensagem enviada com as tabelas legadas:`, compatErr.message);
                }

                console.log(`[QueueProcessor] Mensagem ${msg.id} enviada com sucesso.`);
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
                        console.warn(`[QueueProcessor] Oscilação temporária ao enviar mensagem ${msg.id}: ${errMsg}. Reagendando em 15s...`);
                    } else {
                        console.error(`[QueueProcessor] Falha ao enviar mensagem ${msg.id}:`, errMsg);
                    }

                    const newAttempts = (msg.attempts || 0) + 1;
                    const maxAttempts = 3;
                    const newStatus = newAttempts >= maxAttempts ? 'failed' : 'pending';
                    const isOperator = (msg.priority || 1) < 5;
                    const retryDelayMs = isOperator ? 2000 : 12000;

                    try {
                        const { default: sManager } = await import('./index.js');
                        sManager.logMonitoringEvent(instanceId, 'message_sent_failed', { 
                            msg_id: msg.id, 
                            chat_jid: msg.chat_jid,
                            error: errMsg,
                            attempts: newAttempts
                        }).catch(()=>{});
                    } catch (logErr) {}

                    await supabase
                        .from('wa_outgoing_messages')
                        .update({ 
                            status: newStatus,
                            attempts: newAttempts,
                            last_error: errMsg || 'Erro de conexão/envio',
                            scheduled_at: new Date(Date.now() + retryDelayMs).toISOString()
                        })
                        .eq('id', msg.id);
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
