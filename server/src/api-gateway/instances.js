import express from 'express';
import sessionManager, { isSocketOpen, isInstanceAllowedForNode } from '../session-manager/index.js';
import queueProcessor from '../session-manager/queue-processor.js';
import { supabase, NODE_ID, resolveTargetJid } from '../supabase.js';
import { activePairingAttempts, logAndNotifyConnectionEvent } from '../event-processor/connection-notifier.js';
import { beginConnectionAttempt, getConnectionDiagnostics, connectDecision, shouldClearCredentials, connectionProgress, diagnosticLogDetails } from '../session-manager/connection-lifecycle.js';
import { recordStructuredEvent } from '../diagnostics/telemetry.js';
import { sessionConnectionDiagnostics } from '../session-manager/socket-state.js';
import { forwardInternalInstanceRequest } from './external-message-routing.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB
const router = express.Router();
const pendingConnectionStarts = new Set();
const connectionSnapshot = instanceId => sessionConnectionDiagnostics(sessionManager, instanceId);

const requireTenant = async (req, res, next) => {
    const tenantId = req.headers['x-tenant-id'];
    const apiKey = req.headers['apikey'];
    const isMasterKey = apiKey === 'chatboot-secret-key' || apiKey === '356c087d9-4073-4ceb-986a-09083992518c';

    const instanceId = req.params.instanceId;
    if (instanceId) {
        let query = supabase
            .from('whatsapp_instances')
            .select('api_key, tenant_id')
            .eq('id', instanceId);

        if (!isMasterKey && tenantId) {
            query = query.eq('tenant_id', tenantId);
        }

        const { data, error } = await query.maybeSingle();
            
        if (error || !data) return res.status(404).json({ error: 'Instance not found or unauthorized' });
        
        req.tenantId = data.tenant_id || tenantId || '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

        // Se a chamada enviar a chave API (integração externa), valida com a api_key da instância.
        if (apiKey && data.api_key) {
             if (data.api_key !== apiKey && !isMasterKey) return res.status(401).json({ error: 'Invalid API Key provided for this instance' });
        }
    } else {
        if (!tenantId && !isMasterKey) return res.status(400).json({ error: 'x-tenant-id header missing' });
        req.tenantId = tenantId || '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
    }

    next();
};

router.post('/instances/:instanceId/connect', requireTenant, async (req, res) => {
    const { instanceId } = req.params;
    const tenantId = req.tenantId;
    let handedOff = false;
    let ownsStart = false;
    try {
        res.setHeader('Cache-Control', 'no-store');
        const requestId = String(req.headers['x-trace-id'] || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0,80) || undefined;
        const diagnostic = connectionSnapshot(instanceId);
        const sock = sessionManager.sessions.get(instanceId)?.sock;
        // A QR refresh must be idempotent, including old clients using force_new=true.
        const decision = connectDecision({
            ...diagnostic, hasSession: Boolean(sock),
            starting: pendingConnectionStarts.has(instanceId) || sessionManager.connectingState.has(instanceId),
            reconnecting: sessionManager.reconnectingTimers.has(instanceId),
            pairingInProgress: sessionManager.pairingInProgress.has(instanceId),
            resetSession: req.body?.resetSession === true
        });
        if (decision !== 'start') {
            if (req.query.force_new === 'true' || req.body?.forceNew) {
                logAndNotifyConnectionEvent({ tenantId, instanceId, eventType: 'qr_refresh_preserved', status: diagnostic.authenticated ? 'connected' : 'connecting', details: { requestId, decision } }).catch(() => {});
            }
            return res.json({ ok: true, status: diagnostic.authenticated ? 'connected' : 'connecting', instanceId, sessionReused: true, diagnostic, message: diagnostic.message });
        }
        if (!isInstanceAllowedForNode(instanceId, tenantId)) {
            return res.status(409).json({ ok: false, code: 'WRONG_NODE', error: 'Esta instância deve ser conectada no servidor responsável por ela.', diagnostic });
        }
        pendingConnectionStarts.add(instanceId);
        ownsStart = true;
        beginConnectionAttempt(instanceId, tenantId, requestId);
        await logAndNotifyConnectionEvent({ tenantId, instanceId, eventType: 'connection_request', status: 'connecting', details: { requestId, source: req.body?.source || 'api', resetRequested: req.body?.resetSession === true } });
        if (sock) await sessionManager.closeSession(instanceId);
        const { data: authCreds, error: authError } = await supabase.from('wa_auth_credentials').select('creds_data').eq('instance_id', instanceId).maybeSingle();
        if (authError) throw authError;
        const hasStoredIdentity = Boolean(authCreds?.creds_data?.me?.id || authCreds?.creds_data?.me?.jid);
        if (shouldClearCredentials({ resetSession: req.body?.resetSession === true, hasStoredIdentity })) {
            const { clearInstanceMemoryCache, flushPendingWrites } = await import('../session-manager/auth.js');
            await flushPendingWrites(instanceId);
            clearInstanceMemoryCache(instanceId);
            for (const table of ['wa_auth_credentials', 'wa_auth_keys', 'whatsapp_instance_runtime']) {
                const { error } = await supabase.from(table).delete().eq('instance_id', instanceId);
                if (error) throw error;
            }
        }
        const { error: stateError } = await supabase.from('whatsapp_instances').update({ status: 'connecting', reconnect_attempts: 0, last_error: null, assigned_node_id: NODE_ID }).eq('id', instanceId).eq('tenant_id', tenantId);
        if (stateError) throw stateError;
        activePairingAttempts.set(instanceId, { timestamp: Date.now(), source: 'api_connect_request', tenantId });
        sessionManager.reconnectAttempts.delete(instanceId);
        sessionManager.conflictAttempts.delete(instanceId);
        sessionManager.createSession(tenantId, instanceId, true).then(sock => {
            if (!sock) throw new Error('O servidor não inicializou o socket desta instância.');
        }).catch(error => {
            connectionProgress(instanceId, { connection: 'close', lastDisconnect: { error: { message: error.message, output: { statusCode: 500 } } } });
            logAndNotifyConnectionEvent({ tenantId, instanceId, eventType: 'connection_error', status: 'offline', error: error.message, details: { source: 'node_session_start' } }).catch(() => {});
        }).finally(() => pendingConnectionStarts.delete(instanceId));
        handedOff = true;
        const diagnosticNow = connectionSnapshot(instanceId);
        return res.status(202).json({ ok: true, status: 'connecting', instanceId, sessionReused: false, diagnostic: diagnosticNow, message: 'Solicitação aceita. Aguarde a geração do QR e a autenticação pelo WhatsApp.' });
    } catch (error) {
        connectionProgress(instanceId, { connection: 'close', lastDisconnect: { error: { message: error.message, output: { statusCode: 500 } } } });
        return res.status(500).json({ ok: false, code: 'CONNECTION_START_FAILED', error: error.message, diagnostic: connectionSnapshot(instanceId) });
    } finally {
        if (ownsStart && !handedOff) pendingConnectionStarts.delete(instanceId);
    }
});

router.post('/instances/:instanceId/pairing-code', requireTenant, async (req, res) => {
    let ownsPairing = false;
    try {
        const { instanceId } = req.params;
        const { phoneNumber } = req.body;
        const tenantId = req.tenantId;

        if (!phoneNumber) return res.status(400).json({ error: 'Número de telefone obrigatório' });
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        const diagnostic = connectionSnapshot(instanceId);
        if (diagnostic.authenticated || diagnostic.handshakeProtected || sessionManager.pairingInProgress.has(instanceId)) {
            return res.status(409).json({ ok: false, code: 'PAIRING_PROTECTED', error: diagnostic.authenticated ? 'Esta instância já está conectada. O dispositivo foi preservado.' : 'O pareamento está em andamento. Aguarde a confirmação do WhatsApp.', diagnostic });
        }

        const forceNew = req.query.force === 'true' || req.query.force_new === 'true' || req.body?.force === true || req.body?.force_new === true;

        // Marca que o pareamento está em progresso para que /connect não feche o socket prematuramente
        sessionManager.pairingInProgress.add(instanceId);
        ownsPairing = true;
        sessionManager.authenticatedSessions.delete(instanceId);
        sessionManager.pairingPendingSync.delete(instanceId);

        let activeSock = sessionManager.sessions.get(instanceId)?.sock;
        const isSocketReadyForPairing = activeSock && activeSock.ws && (activeSock.ws.isOpen || activeSock.ws.readyState === 1) && !activeSock.authState?.creds?.me?.id;

        if (!isSocketReadyForPairing) {
            console.log(`[API] /pairing-code: Encerrando e limpando sessão antiga para instância ${instanceId}...`);
            await sessionManager.closeSession(instanceId);
            if (sessionManager.connectingState.has(instanceId)) {
                 sessionManager.connectingState.delete(instanceId);
            }

            console.log(`[API] Limpando credenciais antigas para Pairing Code na instância ${instanceId}...`);
            const { sessionCaches } = await import('../session-manager/auth.js');
            if (sessionCaches && sessionCaches.has(instanceId)) {
                sessionCaches.delete(instanceId);
            }
            await supabase.from('wa_auth_credentials').delete().eq('instance_id', instanceId);
            await supabase.from('wa_auth_keys').delete().eq('instance_id', instanceId);
            await supabase.from('whatsapp_instance_runtime').delete().eq('instance_id', instanceId);

            await supabase.from('whatsapp_instances')
                .update({ status: 'connecting', phone_number: cleanPhone, last_error: null })
                .eq('id', instanceId)
                .eq('tenant_id', tenantId);

            console.log(`[API] Criando sessão Baileys para Pairing Code...`);
            activeSock = await sessionManager.createSession(tenantId, instanceId, true);
        }

        if (!activeSock) {
            sessionManager.pairingInProgress.delete(instanceId);
            return res.status(500).json({ error: 'Não foi possível inicializar a conexão do WhatsApp para gerar o código.' });
        }

        // Aguarda a rápida abertura do Websocket e a conclusão da ignição criptográfica (Noise Handshake)
        let code = null;
        let attempts = 0;
        let wsWasOpen = false;
        while (attempts < 60) {
            if (activeSock.ws && (activeSock.ws.isOpen || activeSock.ws.readyState === 1)) {
                if (!wsWasOpen) {
                    wsWasOpen = true;
                    // Aguarda 1 segundo para o Noise Handshake se estabilizar na rede da Meta
                    await new Promise(r => setTimeout(r, 1000));
                }
                try {
                    code = await activeSock.requestPairingCode(cleanPhone);
                    if (code) {
                        console.log(`[API] Pairing Code gerado para instância ${instanceId}; código omitido dos logs.`);
                        break;
                    }
                } catch (err) {
                    console.warn(`[API/pairing-code] Tentativa rápida ${attempts + 1}/60 ao gerar código (${cleanPhone}):`, err.message);
                }
            }
            await new Promise(resolve => setTimeout(resolve, 300));
            attempts++;
        }

        if (!code && activeSock.authState?.creds?.pairingCode) {
            code = activeSock.authState.creds.pairingCode;
        }

        if (!code) {
            return res.status(400).json({ error: 'O motor Baileys está inicializando a ignição do WhatsApp. Clique em "Solicitar Código de 8 Dígitos" novamente em 2 segundos.' });
        }

        // Salva pairing_code no runtime do Supabase para escuta via Realtime
        await supabase.from('whatsapp_instance_runtime')
            .upsert({ instance_id: instanceId, tenant_id: tenantId, pairing_code: code }, { onConflict: 'instance_id' });

        activePairingAttempts.set(instanceId, {
            timestamp: Date.now(),
            source: 'api_pairing_code_request',
            tenantId
        });

        res.json({ ok: true, code, instanceId, diagnostic: connectionSnapshot(instanceId) });
    } catch (e) {
        console.error('[API/pairing-code] Erro ao gerar pairing code:', e.message);
        res.status(500).json({ ok: false, code: 'PAIRING_CODE_FAILED', error: e.message, diagnostic: connectionSnapshot(req.params.instanceId) });
    } finally {
        if (ownsPairing) sessionManager.pairingInProgress.delete(req.params.instanceId);
    }
});

router.post('/instances/:instanceId/disconnect', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        
        if (sock) {
            try { await sock.logout(); } catch(e) {}
        } else {
            await supabase.from('wa_auth_credentials').delete().eq('instance_id', instanceId);
            await supabase.from('wa_auth_keys').delete().eq('instance_id', instanceId);
            await supabase.from('whatsapp_instances').update({ status: 'offline' }).eq('id', instanceId);
        }

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Endpoint para consulta de histórico e logs de conexão da instância
router.get('/instances/:instanceId/connection-logs', async (req, res) => {
    try {
        const { instanceId } = req.params;
        const limit = Math.max(1, Math.min(80, parseInt(req.query.limit || '30', 10) || 30));

        const { data: logs, error } = await supabase
            .from('system_logs')
            .select('*')
            .eq('type', 'WhatsApp Connection')
            .filter('payload->>instance_id', 'eq', instanceId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            throw error;
        }

        res.setHeader('Cache-Control', 'no-store');
        res.json({ ok: true, diagnostic: connectionSnapshot(instanceId), logs: logs || [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Endpoint de Diagnóstico e Ping nos Servidores do WhatsApp (Meta WebSocket Ping)
router.get('/instances/:instanceId/ping-whatsapp', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const tenantId = req.tenantId;

        const startTime = Date.now();
        const sock = sessionManager.getSocket(instanceId);

        const isMemoryActive = Boolean(sessionManager.sessions.has(instanceId));
        const isAuthenticated = connectionSnapshot(instanceId).authenticated;
        const isWsOpen = Boolean(sock?.ws && (sock.ws.isOpen || sock.ws.readyState === 1));

        let metaPingMs = null;
        let metaStatus = isAuthenticated && isWsOpen ? 'connected' : isWsOpen ? 'connecting' : 'disconnected';
        let metaPingError = null;

        if (isWsOpen && isAuthenticated && sock) {
            const pingStart = Date.now();
            try {
                if (typeof sock.sendPresenceUpdate === 'function') {
                    await sock.sendPresenceUpdate('available');
                }
                metaPingMs = Date.now() - pingStart;
            } catch (pErr) {
                metaPingMs = Date.now() - pingStart;
                metaStatus = 'error';
                metaPingError = pErr.message;
            }
        }

        const totalLatencyMs = Date.now() - startTime;

        return res.json({
            ok: true,
            instanceId,
            tenantId,
            status: metaStatus,
            memoryActive: isMemoryActive,
            authenticated: isAuthenticated,
            wsOpen: isWsOpen,
            wsReadyState: sock?.ws ? sock.ws.readyState : null,
            metaPingMs,
            metaPingError,
            diagnostic: connectionSnapshot(instanceId),
            serverLatencyMs: totalLatencyMs,
            nodeId: NODE_ID,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.post('/instances/:instanceId/invoke', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { method, args } = req.body;

        // Se a instância pertence a outro worker (ex: alpha-worker vs production-worker), encaminha a requisição diretamente ao nó detentor do socket
        if (await forwardInternalInstanceRequest(req, res, instanceId)) {
            return;
        }

        const isAllowedOnThisNode = isInstanceAllowedForNode(instanceId, req.tenantId);
        
        // Intercepta envio de mensagens de texto/mídia para enfileirar no outbox resiliente (wa_outgoing_messages)
        if (method === 'sendMessage') {
            const jid = args ? args[0] : null;
            const content = args ? args[1] : null;

            // 1. Verificação prévia de status no banco de dados para evitar tentativas em instâncias desconectadas
            const { data: instCheck } = await supabase
                .from('whatsapp_instances')
                .select('id, status, last_error, display_name')
                .eq('id', instanceId)
                .maybeSingle();

            const isDisconnected = instCheck && 
                ['offline', 'logged_out', 'blocked_12h', 'disconnected', 'paused', 'close', 'closed'].includes(instCheck.status);

            if (isDisconnected) {
                console.log(`[API Gateway] [Invoke/sendMessage] Fast-Fail 400 (instância inativa/desconectada): Instância ${instanceId} ("${instCheck?.display_name || instanceId}") está desconectada no banco (status: ${instCheck?.status || 'desconhecido'}).`);
                return res.status(400).json({
                    ok: false,
                    error: `Instância WhatsApp "${instCheck?.display_name || instanceId}" está desconectada (${instCheck?.last_error || 'requer nova conexão/pareamento'}). Por favor, reconecte-a para enviar mensagens.`,
                    code: 'INSTANCE_DISCONNECTED',
                    instance_id: instanceId,
                    status: instCheck?.status || 'disconnected',
                    last_error: instCheck?.last_error || null
                });
            }
            
            // Se for uma edição de mensagem (contém 'edit') ou exclusão/revogação (contém 'delete'), necessita do socket ativo diretamente no Baileys
            if (content && (content.edit || content.delete)) {
                const sock = await sessionManager.getSocketOrWake(req.tenantId, instanceId, true);
                if (!sock) return res.status(400).json({ error: 'Socket offline ou não conectado.' });
                
                // Normalização defensiva do JID para o Brasil (+55)
                let targetJid = jid;
                if (targetJid && typeof targetJid === 'string' && !targetJid.endsWith('@g.us')) {
                    targetJid = await resolveTargetJid(sock, jid, req.tenantId);
                }

                if (content.delete && typeof content.delete === 'object') {
                    if (!content.delete.remoteJid) {
                        content.delete.remoteJid = targetJid;
                    }
                }

                if (content.edit && typeof content.edit === 'object') {
                    if (!content.edit.remoteJid) {
                        content.edit.remoteJid = targetJid;
                    }

                    // Se o ID for um ID temporário EDGE_... ou optimistic-... atualiza wa_outgoing_messages / messages diretamente sem acionar Baileys
                    if (content.edit.id && (String(content.edit.id).startsWith('EDGE_') || String(content.edit.id).startsWith('optimistic-'))) {
                        const rawUuid = String(content.edit.id).replace('EDGE_', '');
                        const formattedUuid = rawUuid.length === 32 ? 
                            `${rawUuid.slice(0,8)}-${rawUuid.slice(8,12)}-${rawUuid.slice(12,16)}-${rawUuid.slice(16,20)}-${rawUuid.slice(20)}` : rawUuid;
                        
                        try {
                            const { data: outboxMsg } = await supabase
                                .from('wa_outgoing_messages')
                                .select('*')
                                .eq('id', formattedUuid)
                                .maybeSingle();

                            if (outboxMsg && (outboxMsg.status === 'pending' || outboxMsg.status === 'processing')) {
                                await supabase
                                    .from('wa_outgoing_messages')
                                    .update({ body: content.text })
                                    .eq('id', formattedUuid);
                                console.log(`[Invoke Edit] Mensagem pendente na fila ${formattedUuid} atualizada para novo texto antes do envio.`);
                            }

                            // Sincroniza também no Supabase messages
                            await supabase
                                .from('messages')
                                .update({ text_content: content.text })
                                .eq('whatsapp_message_id', content.edit.id);

                        } catch (e) {}

                        return res.json({ ok: true, result: { key: content.edit }, updatedOutbox: true });
                    }
                }

                console.log(`[Invoke] Executando ${content.delete ? 'DELETE/REVOKE' : 'EDIT'} de mensagem na instância ${instanceId}:`, content);
                
                // Se o WebSocket estiver em handshaking, aguarda brevemente (até 1s)
                if (sock.ws && !sock.ws.isOpen && sock.ws.readyState !== 1) {
                    await new Promise(r => setTimeout(r, 1000));
                }

                try {
                    const sendFn = sock.originalSendMessage || sock.sendMessage;
                    const sent = await sendFn(targetJid, content);
                    
                    // Se for edição de mensagem, sincroniza imediatamente na tabela messages do Supabase preservando original_text
                    if (content.edit && content.edit.id && content.text) {
                        supabase.from('messages')
                            .select('id, text_content, raw_payload')
                            .eq('whatsapp_message_id', content.edit.id)
                            .maybeSingle()
                            .then(({ data: existingMsg }) => {
                                if (existingMsg) {
                                    const originalText = existingMsg.raw_payload?.original_text || existingMsg.text_content || '';
                                    const updatedPayload = {
                                        ...(existingMsg.raw_payload || {}),
                                        is_edited: true,
                                        original_text: originalText,
                                        edited_text: content.text,
                                        edited_at: new Date().toISOString()
                                    };
                                    supabase.from('messages')
                                        .update({
                                            text_content: content.text,
                                            status: 'edited',
                                            raw_payload: updatedPayload,
                                            updated_at: new Date().toISOString()
                                        })
                                        .eq('id', existingMsg.id)
                                        .then(() => {})
                                        .catch(() => {});
                                }
                            })
                            .catch(() => {});
                    }

                    // Se for exclusão de mensagem, atualiza o status na tabela messages do Supabase
                    if (content.delete && content.delete.id) {
                        supabase.from('messages')
                            .update({ status: 'deleted' })
                            .eq('whatsapp_message_id', content.delete.id)
                            .then(({ error }) => {
                                if (error) console.error('[Invoke Delete] Erro ao atualizar status no banco:', error);
                                else console.log('[Invoke Delete] Status da mensagem atualizado para deleted no banco:', content.delete.id);
                            });
                    }

                    return res.json({ ok: true, result: sent, key: sent?.key });
                } catch (actionErr) {
                    console.warn(`[Invoke ${content.delete ? 'DELETE' : 'EDIT'}] Falha operacional no WhatsApp:`, actionErr.message);
                    return res.status(400).json({
                        ok: false,
                        error: `O WhatsApp não permitiu ${content.delete ? 'apagar' : 'editar'} a mensagem: ${actionErr.message || 'Prazo limite expirado.'}`,
                        code: 'ACTION_FAILED'
                    });
                }
            } else if (jid && content) {
                let messageType = 'text';
                let body = content.text || '';
                let mediaUrl = null;

                if (content.image || content.video || content.audio || content.document) {
                    messageType = 'media';
                    const mediaObj = content.image || content.video || content.audio || content.document;
                    mediaUrl = mediaObj?.url || null;
                    body = content.caption || '';
                }

                // Normalização defensiva do JID para o Brasil (+55) com suporte a 8 e 9 dígitos (DDD 34, 31, etc)
                let targetJid = jid;
                if (targetJid && typeof targetJid === 'string' && !targetJid.endsWith('@g.us')) {
                    targetJid = await resolveTargetJid(null, jid, req.tenantId);
                }

                // Extração do traceId do cabeçalho ou corpo para telemetria E2E
                const traceMatch = (body || '').match(/E2E-[A-Za-z0-9-_]+/);
                const traceId = req.headers['x-trace-id'] || req.body?.traceId || (traceMatch ? traceMatch[0] : null);

                recordStructuredEvent({
                    event: 'MESSAGE_SEND_REQUEST',
                    traceId,
                    instanceId,
                    direction: 'outbound',
                    details: { targetJid, messageType, length: body?.length || 0 }
                });

                console.log(`[API Gateway] [MSG_TRACE:GATEWAY_RECEIVE] Instância: ${instanceId} | JID: ${targetJid} | Tipo: ${messageType} | TraceId: ${traceId || 'N/A'}`);

                // FAST-PATH: Se a instância pertence a este nó e o socket estiver na memória e conectado, envia IMEDIATAMENTE (< 300ms)
                let activeSock = isAllowedOnThisNode ? sessionManager.sessions.get(instanceId)?.sock : null;
                let hasCreds = Boolean(activeSock?.authState?.creds?.me?.id || activeSock?.user?.id);
                let isSockConnected = isAllowedOnThisNode && activeSock && (!activeSock.ws || activeSock.ws.isOpen || activeSock.ws.readyState === 1) && hasCreds;

                // Smart-Wake: se o socket pertencer a este nó e estiver conectando, aguarda no máximo 1.2s
                if (isAllowedOnThisNode && !isSockConnected && messageType === 'text') {
                    try {
                        const { waitForSocketOpen } = await import('../session-manager/index.js');
                        if (activeSock && activeSock.ws && !activeSock.ws.isClosed && !activeSock.ws.isClosing) {
                            await waitForSocketOpen(activeSock, 1200);
                        } else {
                            const wakePromise = sessionManager.getSocketOrWake(req.tenantId, instanceId, true);
                            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_FAST_WAKE')), 1200));
                            const waked = await Promise.race([wakePromise, timeoutPromise]);
                            if (waked) activeSock = waked;
                        }
                    } catch (e) {}
                    hasCreds = Boolean(activeSock?.authState?.creds?.me?.id || activeSock?.user?.id);
                    isSockConnected = activeSock && (!activeSock.ws || activeSock.ws.isOpen || activeSock.ws.readyState === 1) && hasCreds;
                }

                if (isSockConnected && messageType === 'text') {
                    let sentResult = null;
                    let lastFastErr = null;
                    const sendFn = activeSock.originalSendMessage || activeSock.sendMessage;

                    try {
                        const tSendStart = Date.now();
                        recordStructuredEvent({ event: 'BAILEYS_SEND_START', traceId, instanceId, direction: 'outbound', attempt: 1 });
                        
                        // Dispara com skipDelay e timeout de 8.0s (tentativa única) para cobrir handshakes Signal a frio sem estourar o timeout HTTP do cliente (18s)
                        const sendPromise = sendFn(targetJid, content, { skipDelay: true, isHuman: true });
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('TIMEOUT_FASTPATH_SEND')), 8000)
                        );
                        sentResult = await Promise.race([sendPromise, timeoutPromise]);
                        const sendDuration = Date.now() - tSendStart;

                        recordStructuredEvent({
                            event: 'BAILEYS_SEND_SUCCESS',
                            traceId,
                            instanceId,
                            whatsappMessageId: sentResult?.key?.id,
                            durationMs: sendDuration,
                            direction: 'outbound',
                            attempt: 1
                        });
                    } catch (attemptErr) {
                        lastFastErr = attemptErr;
                        if (String(attemptErr?.message || '').includes('TIMEOUT_FASTPATH_SEND')) {
                            activeSock._fastPathTimeouts = (activeSock._fastPathTimeouts || 0) + 1;
                            if (activeSock._fastPathTimeouts >= 2 && typeof activeSock.end === 'function') {
                                console.warn(`[API Gateway] Auto-reciclando socket de ${instanceId} após ${activeSock._fastPathTimeouts} timeouts consecutivos no Fast-Path...`);
                                activeSock._fastPathTimeouts = 0;
                                try { activeSock.end({ message: 'connection closed', output: { statusCode: 428 } }); } catch (e) {}
                            }
                        }
                    }

                    if (sentResult) {
                        if (activeSock) activeSock._fastPathTimeouts = 0;
                        console.log(`[API Gateway] [MSG_TRACE:FASTPATH_SENT] Instância: ${instanceId} | WhatsAppMsgId: ${sentResult?.key?.id} | JID: ${targetJid}`);

                        // Grava no outbox já como 'sent' para histórico e auditoria com messageId oficial
                        supabase.from('wa_outgoing_messages').insert({
                            instance_id: instanceId,
                            tenant_id: req.tenantId,
                            chat_jid: targetJid,
                            message_type: messageType,
                            body: body,
                            media_url: mediaUrl,
                            status: 'sent',
                            sent_at: new Date().toISOString(),
                            options: { messageId: sentResult?.key?.id },
                            priority: 1
                        }).then(() => {}).catch(() => {});

                        // Sincroniza com o eventProcessor registrando como mensagem humana
                        try {
                            const { EventProcessor, default: eventProcessor } = await import('../event-processor/index.js');
                            const processor = eventProcessor || (EventProcessor?.instance) || (typeof EventProcessor === 'function' ? new EventProcessor() : EventProcessor);
                            const epClass = EventProcessor || processor?.constructor;

                            if (processor && sentResult && sentResult.key) {
                                if (epClass && !epClass.humanMessagesCache) epClass.humanMessagesCache = new Map();
                                if (epClass && epClass.humanMessagesCache) {
                                    epClass.humanMessagesCache.set(`${instanceId}_${sentResult.key.id}`, true);
                                    setTimeout(() => epClass.humanMessagesCache && epClass.humanMessagesCache.delete(`${instanceId}_${sentResult.key.id}`), 60000);
                                }

                                if (typeof processor.handleMessageUpsert === 'function') {
                                    processor.handleMessageUpsert(req.tenantId, instanceId, activeSock, {
                                        messages: [sentResult],
                                        type: 'notify'
                                    }).catch(() => {});
                                }
                            }
                        } catch (e) {}

                        // Emite broadcast de baixa latência (<30ms) para refletir 'sent' na UI imediatamente
                        try {
                            const { default: realtime } = await import('../realtime-publisher/index.js');
                            if (realtime && typeof realtime.publishInboxEvent === 'function') {
                                realtime.publishInboxEvent(req.tenantId, 'message.update', {
                                    whatsapp_message_id: sentResult?.key?.id,
                                    status: 'sent',
                                    chat_jid: targetJid
                                }).catch(() => {});
                            }
                        } catch (rtErr) {}

                        return res.json({ 
                            ok: true, 
                            result: sentResult,
                            key: sentResult?.key 
                        });
                    } else if (lastFastErr) {
                        console.log(`[Invoke/FastPath] Socket transitório indisponível (${lastFastErr.message}), delegando para outbox queue resiliente`);
                    }
                }

                // Fallback para Outbox Queue Resiliente
                const { data: newOutbox, error: outboxErr } = await supabase
                    .from('wa_outgoing_messages')
                    .insert({
                        instance_id: instanceId,
                        tenant_id: req.tenantId || (await supabase.from('whatsapp_instances').select('tenant_id').eq('id', instanceId).maybeSingle().then(r => r.data?.tenant_id)),
                        chat_jid: targetJid,
                        message_type: messageType,
                        body: body,
                        media_url: mediaUrl,
                        status: 'pending',
                        priority: 1
                    })
                    .select()
                    .maybeSingle();

                if (outboxErr) {
                    console.error('[API Gateway] Erro ao gravar outbox de fallback:', outboxErr.message);
                }

                const outboxId = newOutbox?.id || `fallback_${Date.now()}`;
                const mockId = `EDGE_${outboxId.replace(/-/g, '')}`;
                console.log(`[API Gateway] [MSG_TRACE:OUTBOX_ENQUEUED] Instância: ${instanceId} | OutboxId: ${outboxId} | MockId: ${mockId} | JID: ${targetJid}`);

                // Sincroniza imediatamente na tabela 'messages' para garantir que nunca suma ao recarregar a tela (F5)
                try {
                    const cleanPhone = String(targetJid).replace(/\D/g, '');
                    supabase
                        .from('contacts')
                        .select('id')
                        .eq('tenant_id', req.tenantId)
                        .eq('phone', cleanPhone)
                        .limit(1)
                        .then(({ data: contacts }) => {
                            if (contacts && contacts.length > 0) {
                                supabase
                                    .from('conversations')
                                    .select('id')
                                    .eq('contact_id', contacts[0].id)
                                    .eq('tenant_id', req.tenantId)
                                    .order('updated_at', { ascending: false })
                                    .limit(1)
                                    .then(({ data: convs }) => {
                                        if (convs && convs.length > 0) {
                                            supabase.from('messages').upsert({
                                                conversation_id: convs[0].id,
                                                tenant_id: req.tenantId,
                                                instance_id: instanceId,
                                                direction: 'outbound',
                                                message_type: messageType || 'text',
                                                text_content: body,
                                                sender_type: 'human',
                                                status: 'pending',
                                                whatsapp_message_id: mockId,
                                                raw_payload: {
                                                    outbox_id: newOutbox?.id || outboxId,
                                                    enqueued_at: new Date().toISOString()
                                                },
                                                timestamp: new Date().toISOString()
                                            }, { onConflict: 'whatsapp_message_id' }).then(() => {}).catch(() => {});
                                        }
                                    }).catch(() => {});
                            }
                        }).catch(() => {});
                } catch (e) {
                    console.warn('[API Gateway] Aviso ao sincronizar outbox pendente em messages:', e.message);
                }

                // Tenta acordar o socket em segundo plano apenas se pertencer a este nó e engatilha o QueueProcessor
                if (isAllowedOnThisNode) {
                    sessionManager.getSocketOrWake(req.tenantId, instanceId).catch(() => {});
                    queueProcessor.trigger(req.tenantId, instanceId);
                }

                return res.json({ 
                    ok: true, 
                    result: {
                        key: {
                            remoteJid: targetJid,
                            fromMe: true,
                            id: mockId
                        }
                    }
                });
            }
        }

        if (method === 'sendPresenceUpdate') {
            const sock = await sessionManager.getSocketOrWake(req.tenantId, instanceId);
            if (!sock) {
                return res.json({ ok: false, message: 'Socket offline or presence update ignored' });
            }
            try {
                const result = await sock.sendPresenceUpdate(...(args || []));
                return res.json({ ok: true, result });
            } catch (err) {
                return res.json({ ok: false, message: err?.message || 'Presence update failed' });
            }
        }

        const sock = await sessionManager.getSocketOrWake(req.tenantId, instanceId);
        if (!sock) return res.status(200).json({ ok: false, error: 'Socket offline' });

        // Intercept custom macros that don't exist directly on sock
        if (method === 'syncContacts') {
            const history = sessionManager.pendingHistorySyncs?.get(instanceId);
            if (!history) {
                return res.json({ 
                    ok: false, 
                    message: 'Histórico de sincronização não encontrado em cache. Certifique-se de que a instância esteja conectada. Se necessário, desconecte e reconecte no painel para forçar o carregamento do histórico.' 
                });
            }
            
            // Dispara a sincronização em segundo plano de forma assíncrona
            import('../event-processor/index.js').then(({ default: eventProcessor }) => {
                eventProcessor.handleMessagingHistorySet(req.tenantId, instanceId, sock, history)
                    .then(() => {
                        console.log(`[SessionManager] Sincronização manual do histórico concluída com sucesso para a instância ${instanceId}`);
                    })
                    .catch(err => {
                        console.error(`[SessionManager] Erro na sincronização manual do histórico para ${instanceId}:`, err);
                    });
            }).catch(err => {
                console.error(`[SessionManager] Erro ao carregar EventProcessor para sincronização:`, err);
            });

            return res.json({ 
                ok: true, 
                message: 'A sincronização de contatos e histórico foi iniciada em segundo plano. Os dados serão carregados no seu painel em instantes.' 
            });
        }
        
        if (method === 'clearStore') {
            return res.json({ ok: true, message: 'A arquitetura atual não utiliza in-memory store global, RAM está otimizada automaticamente.' });
        }



        if(typeof sock[method] !== 'function') return res.status(400).json({ error: `Method ${method} not found on Baileys socket` });

        try {
            const result = await sock[method](...(args || []));
            res.json({ ok: true, result });
        } catch (sockError) {
            // Se o Baileys disparar um erro (ex: not-authorized ao buscar avatar protegido)
            // Retornamos 200 com ok: false para não estourar 400/500 no DevLogger do frontend para erros esperados
            const errorMsg = sockError?.message || (typeof sockError === 'string' ? sockError : 'Engine instruction failed');
            return res.status(200).json({ ok: false, error: errorMsg });
        }
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// ENVIAR MEDIA POR URL (Pós-upload TUS via Frontend)
router.post('/instances/:instanceId/send-media-url', requireTenant, express.json(), async (req, res) => {
    try {
        const { instanceId } = req.params;

        if (await forwardInternalInstanceRequest(req, res, instanceId)) {
            return;
        }
        const isAllowedOnThisNode = isInstanceAllowedForNode(instanceId, req.tenantId);
        
        // 1. Verificação prévia de integridade no banco / memória para suportar cluster multi-nó
        const localSock = isAllowedOnThisNode ? sessionManager.getSocket(instanceId) : null;
        if (!localSock) {
            const { data: instCheck } = await supabase
                .from('whatsapp_instances')
                .select('id, status, last_error, display_name')
                .eq('id', instanceId)
                .maybeSingle();

            const isDisconnected = !instCheck || 
                ['offline', 'logged_out', 'blocked_12h', 'disconnected', 'paused', 'close', 'closed'].includes(instCheck.status);

            if (isDisconnected) {
                console.log(`[API Gateway] [send-media-url] Fast-Fail 400: Instância ${instanceId} desconectada (status: ${instCheck?.status || 'desconhecido'}).`);
                return res.status(400).json({ 
                    ok: false,
                    error: `Instância WhatsApp "${instCheck?.display_name || instanceId}" está desconectada (${instCheck?.last_error || 'requer reconexão'}). Por favor, reconecte-a para enviar arquivos.`,
                    code: 'INSTANCE_DISCONNECTED',
                    instance_id: instanceId,
                    status: instCheck?.status || 'disconnected'
                });
            }

            if (isAllowedOnThisNode) {
                sessionManager.getSocketOrWake(req.tenantId, instanceId).catch(() => {});
            }
        }

        const { mediaUrl, mimetype, fileName, jid, caption, messageType, ptt, responseType } = req.body;

        if (!mediaUrl || !jid || !messageType) {
            return res.status(400).json({ error: 'Missing mediaUrl, jid or messageType' });
        }

        const finalResponseType = responseType === 'TUTORIAL' ? 'TUTORIAL' : 'STANDARD';
        console.log(`[send-media-url] Queueing ${messageType} (${finalResponseType}) from URL: ${mediaUrl} to ${jid}`);

        const { data: newOutbox, error: outboxErr } = await supabase
            .from('wa_outgoing_messages')
            .insert({
                instance_id: instanceId,
                tenant_id: req.tenantId,
                chat_jid: jid,
                message_type: 'media',
                body: caption || '',
                media_url: mediaUrl,
                response_type: finalResponseType,
                options: {
                    mimetype,
                    fileName,
                    messageType,
                    ptt: Boolean(ptt),
                    responseType: finalResponseType
                },
                status: 'pending',
                priority: 1
            })
            .select()
            .single();

        if (outboxErr) throw outboxErr;

        // Despacha a mensagem instantaneamente acordando o QueueProcessor apenas se pertencer a este nó
        if (isAllowedOnThisNode) {
            queueProcessor.trigger(req.tenantId, instanceId);
        }

        res.json({ 
            ok: true, 
            result: {
                key: {
                    remoteJid: jid,
                    fromMe: true,
                    id: `EDGE_${newOutbox.id.replace(/-/g, '')}`
                },
                messageTimestamp: Math.floor(Date.now() / 1000)
            },
            media_url: mediaUrl 
        });
    } catch (e) {
        console.error('Send media url error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ENVIAR MEDIA
router.post('/instances/:instanceId/send-media', requireTenant, upload.single('media'), async (req, res) => {
    try {
        const { instanceId } = req.params;

        // 1. Verificação prévia de integridade no banco / memória para suportar cluster multi-nó
        const localSock = sessionManager.getSocket(instanceId);
        if (!localSock) {
            const { data: instCheck } = await supabase
                .from('whatsapp_instances')
                .select('id, status, last_error, display_name')
                .eq('id', instanceId)
                .maybeSingle();

            const isDisconnected = !instCheck || 
                ['offline', 'logged_out', 'blocked_12h', 'disconnected', 'paused', 'close', 'closed'].includes(instCheck.status);

            if (isDisconnected) {
                console.log(`[API Gateway] [send-media] Fast-Fail 400: Instância ${instanceId} desconectada (status: ${instCheck?.status || 'desconhecido'}).`);
                return res.status(400).json({ 
                    ok: false,
                    error: `Instância WhatsApp "${instCheck?.display_name || instanceId}" está desconectada (${instCheck?.last_error || 'requer reconexão'}). Por favor, reconecte-a para enviar arquivos.`,
                    code: 'INSTANCE_DISCONNECTED',
                    instance_id: instanceId,
                    status: instCheck?.status || 'disconnected'
                });
            }

            sessionManager.getSocketOrWake(req.tenantId, instanceId).catch(() => {});
        }

        const tenantId = req.tenantId;
        const file = req.file;
        const { jid, caption, messageType } = req.body; // image, video, audio, document

        if (!file || !jid || !messageType) {
            return res.status(400).json({ error: 'Missing file, jid or messageType' });
        }

        // Convert WebM to OGG Opus if it's an audio note
        const timestamp = Date.now();
        console.log(`[send-media] Received request! messageType: ${messageType}, file: ${file.originalname}, mime: ${file.mimetype}, size: ${file.buffer.length}`);
        
        if (messageType === 'audio') {
            try {
                console.log(`[send-media] Starting ffmpeg conversion to WhatsApp OGG Opus...`);
                const tempInput = path.join(os.tmpdir(), `in_${timestamp}.tmp`);
                const tempOutput = path.join(os.tmpdir(), `out_${timestamp}.ogg`);
                
                fs.writeFileSync(tempInput, file.buffer);
                
                await new Promise((resolve, reject) => {
                    ffmpeg(tempInput)
                        .audioCodec('libopus')
                        .audioChannels(1)
                        .audioFrequency(48000)
                        .outputOptions([
                            '-avoid_negative_ts make_zero',
                            '-map_metadata -1',
                            '-b:a 48k',
                            '-vbr on',
                            '-compression_level 8',
                            '-application voip'
                        ])
                        .format('ogg')
                        .on('end', () => {
                            console.log(`[send-media] Conversion finished!`);
                            resolve();
                        })
                        .on('error', (err, stdout, stderr) => {
                            console.error(`[send-media] FFMPEG ERROR:`, stderr);
                            reject(err);
                        })
                        .save(tempOutput);
                });
                
                const convertedBuffer = fs.readFileSync(tempOutput);
                console.log(`[send-media] Read converted buffer, size is: ${convertedBuffer.length}`);
                
                // Sobrescreve as propriedades do arquivo com a versão convertida
                file.buffer = convertedBuffer;
                file.mimetype = 'audio/ogg';
                
                // Atualiza a extensão pra ogg se não for
                file.originalname = file.originalname.replace(/\.[^/.]+$/, "") + ".ogg";
                
                // Clean up temp files
                try { fs.unlinkSync(tempInput); } catch (e) {}
                try { fs.unlinkSync(tempOutput); } catch (e) {}
                
            } catch (err) {
                console.error('Error converting Audio to OGG Opus:', err);
                return res.status(500).json({ error: 'Failed to convert audio file format' });
            }
        }

        // Upload to Supabase Storage First
        const ext = file.originalname.split('.').pop() || 'tmp';
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_');
        const storagePath = `tenant_${tenantId}/instance_${instanceId}/${jid}/${timestamp}_${safeName}`;

        const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('chat_media')
            .upload(storagePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        let mediaUrl = '';
        if (uploadErr) {
            console.error('Supabase media upload error:', uploadErr);
             mediaUrl = 'upload_failed';
        } else {
            const { data: publicUrlData } = supabase.storage.from('chat_media').getPublicUrl(storagePath);
            mediaUrl = publicUrlData.publicUrl;
        }

        // Em vez de enviar diretamente via sock.sendMessage, enfileira na fila do Edge BR
        const isPttAudio = Boolean(req.body.ptt === 'true' || req.body.ptt === true || messageType === 'audio');
        const { data: newOutbox, error: outboxErr } = await supabase
            .from('wa_outgoing_messages')
            .insert({
                instance_id: instanceId,
                tenant_id: tenantId,
                chat_jid: jid,
                message_type: 'media',
                body: caption || '',
                media_url: mediaUrl,
                options: {
                    mimetype: file.mimetype,
                    fileName: file.originalname,
                    messageType: messageType,
                    ptt: isPttAudio,
                    responseType: 'STANDARD'
                },
                status: 'pending',
                priority: 1
            })
            .select()
            .single();

        if (outboxErr) throw outboxErr;

        // Despacha a mensagem instantaneamente acordando o QueueProcessor
        queueProcessor.trigger(tenantId, instanceId);

        res.json({ 
            ok: true, 
            result: {
                key: {
                    remoteJid: jid,
                    fromMe: true,
                    id: `EDGE_${newOutbox.id.replace(/-/g, '')}`
                },
                messageTimestamp: Math.floor(Date.now() / 1000)
            },
            media_url: mediaUrl 
        });
    } catch (e) {
        console.error('Send media error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/instances/:instanceId/:action', requireTenant, async (req, res) => {
    try {
        const { instanceId, action } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        
        if (action === 'reconnect') {
            await sessionManager.closeSession(instanceId);
            sessionManager.createSession(req.tenantId, instanceId, true).catch(console.error);
            return res.json({ ok: true, message: 'Reconectando...' });
        }
        
        // generic actions for UI mock support
        res.json({ ok: true, message: `Mock Action ${action} triggered` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/instances/:instanceId', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        
        if (sock) {
            try { await sock.logout(); } catch(e) {}
        }
        
        await sessionManager.closeSession(instanceId);

        await supabase.from('whatsapp_instances').delete().eq('id', instanceId);

        res.json({ ok: true, message: 'Deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/instances/:instanceId/groups', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        const groups = await sock.groupFetchAllParticipating();
        res.json({ ok: true, groups });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/instances/:instanceId/groups/:groupId', requireTenant, async (req, res) => {
    try {
        const { instanceId, groupId } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        const metadata = await sock.groupMetadata(groupId);
        res.json({ ok: true, metadata });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Criar novo grupo
router.post('/instances/:instanceId/groups', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { subject, participants } = req.body; // participants: array of JIDs
        if (!subject || !participants || !Array.isArray(participants)) {
            return res.status(400).json({ error: 'Faltam subject ou participants array' });
        }
        
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        const group = await sock.groupCreate(subject, participants);
        res.json({ ok: true, group });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Atualizar nome do grupo
router.put('/instances/:instanceId/groups/:groupId/subject', requireTenant, async (req, res) => {
    try {
        const { instanceId, groupId } = req.params;
        const { subject } = req.body;
        
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        await sock.groupUpdateSubject(groupId, subject);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Atualizar descrição do grupo
router.put('/instances/:instanceId/groups/:groupId/description', requireTenant, async (req, res) => {
    try {
        const { instanceId, groupId } = req.params;
        const { description } = req.body;
        
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        await sock.groupUpdateDescription(groupId, description);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Atualizar configurações (announcement, not_announcement, locked, unlocked)
router.put('/instances/:instanceId/groups/:groupId/settings', requireTenant, async (req, res) => {
    try {
        const { instanceId, groupId } = req.params;
        const { setting } = req.body;
        
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        await sock.groupSettingUpdate(groupId, setting);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Gerenciar participantes (add, remove, promote, demote)
router.post('/instances/:instanceId/groups/:groupId/participants', requireTenant, async (req, res) => {
    try {
        const { instanceId, groupId } = req.params;
        const { participants, action } = req.body; // action = 'add', 'remove', 'promote', 'demote'
        
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        const result = await sock.groupParticipantsUpdate(groupId, participants, action);
        res.json({ ok: true, result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Sair do grupo
router.delete('/instances/:instanceId/groups/:groupId/leave', requireTenant, async (req, res) => {
    try {
        const { instanceId, groupId } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        await sock.groupLeave(groupId);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Obter código de convite
router.get('/instances/:instanceId/groups/:groupId/invite-code', requireTenant, async (req, res) => {
    try {
        const { instanceId, groupId } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        const code = await sock.groupInviteCode(groupId);
        res.json({ ok: true, code });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Revogar código de convite
router.post('/instances/:instanceId/groups/:groupId/revoke-invite', requireTenant, async (req, res) => {
    try {
        const { instanceId, groupId } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        const code = await sock.groupRevokeInvite(groupId);
        res.json({ ok: true, code });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Aceitar convite
router.post('/instances/:instanceId/groups/accept-invite/:code', requireTenant, async (req, res) => {
    try {
        const { instanceId, code } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        const groupId = await sock.groupAcceptInvite(code);
        res.json({ ok: true, groupId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Obter foto do grupo
router.get('/instances/:instanceId/groups/:groupId/profile-picture', requireTenant, async (req, res) => {
    try {
        const { instanceId, groupId } = req.params;
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        const url = await sock.profilePictureUrl(groupId, 'image').catch(() => null);
        res.json({ ok: true, url });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Alterar foto do grupo
router.put('/instances/:instanceId/groups/:groupId/profile-picture', requireTenant, async (req, res) => {
    try {
        const { instanceId, groupId } = req.params;
        const { url } = req.body;
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        await sock.updateProfilePicture(groupId, { url });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Ligar/Desligar mensagens temporárias
router.put('/instances/:instanceId/groups/:groupId/ephemeral', requireTenant, async (req, res) => {
    try {
        const { instanceId, groupId } = req.params;
        const { ephemeralExpiration } = req.body;
        const sock = sessionManager.getSocket(instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

        await sock.groupToggleEphemeral(groupId, ephemeralExpiration);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/instances/:instanceId/status', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;

        const sock = sessionManager.getSocket(instanceId);
        const isSocketOpenStatus = sock ? isSocketOpen(sock) : false;
        const isSessionAuth = connectionSnapshot(instanceId).authenticated;

        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const { data, error } = await supabase
            .from('whatsapp_instances')
            .select('status, phone_number, display_name, last_error, whatsapp_instance_runtime(qr_code, pairing_code)')
            .eq('id', instanceId)
            .single();

        if (error) throw error;
        
        if (data) {
            let finalStatus = data.status;
            if (isSocketOpenStatus && isSessionAuth) {
                const isLocalDev = process.env.DISABLE_AUTO_START_SESSIONS === 'true';
                finalStatus = isLocalDev ? 'connected_local' : 'connected';

                if (data.status !== finalStatus) {
                    await supabase.from('whatsapp_instances')
                        .update({ status: finalStatus, assigned_node_id: NODE_ID, last_error: null })
                        .eq('id', instanceId);
                }
            } else {
                // Se a sessão NÃO possui socket aberto ou não está autenticada, não pode ser 'connected' ou 'connected_local'
                if (finalStatus === 'connected' || finalStatus === 'connected_local') {
                    finalStatus = sessionManager.connectingState.has(instanceId) ? 'connecting' : 'disconnected';
                }
            }

            const runtimeData = Array.isArray(data.whatsapp_instance_runtime)
                ? data.whatsapp_instance_runtime[0]
                : data.whatsapp_instance_runtime;
            const qrCode = runtimeData?.qr_code || null;
            const pairingCode = runtimeData?.pairing_code || null;
            const diagnostic = connectionSnapshot(instanceId);
            const showQr = !diagnostic.authenticated && !diagnostic.handshakeProtected && !['error','expired','waiting_qr'].includes(diagnostic.phase);
            return res.json({
                data: {
                    ...data,
                    whatsapp_instance_runtime: undefined,
                    status: finalStatus,
                    is_authenticated: isSocketOpenStatus && isSessionAuth,
                    qr_code: showQr ? qrCode : null,
                    qr_base64: showQr ? qrCode : null,
                    pairing_code: pairingCode,
                    diagnostic,
                    message: diagnostic.message,
                    nodeId: NODE_ID
                }
            });
        }
        res.json({ data: null });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
