import express from 'express';
import sessionManager, { isSocketOpen, isInstanceAllowedForNode } from '../session-manager/index.js';
import queueProcessor from '../session-manager/queue-processor.js';
import { supabase, NODE_ID, resolveTargetJid, retryWithBackoff } from '../supabase.js';
import { activePairingAttempts, logAndNotifyConnectionEvent } from '../event-processor/connection-notifier.js';
import { beginConnectionAttempt, getConnectionDiagnostics, connectDecision, shouldClearCredentials, connectionProgress, diagnosticLogDetails } from '../session-manager/connection-lifecycle.js';
import { recordStructuredEvent } from '../diagnostics/telemetry.js';
import { sessionConnectionDiagnostics } from '../session-manager/socket-state.js';
import { forwardInternalInstanceRequest, forwardInternalMultipartRequest } from './external-message-routing.js';
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

// Cache em memória (TTL 120s) para metadados de autenticação de instâncias, eliminando round-trip ao Supabase em cada requisição /invoke ou /status
const instanceAuthCache = new Map();
const INSTANCE_AUTH_CACHE_TTL_MS = 120 * 1000;

const requireTenant = async (req, res, next) => {
    const tenantId = req.headers['x-tenant-id'];
    const apiKey = req.headers['apikey'];
    const isMasterKey = apiKey === 'chatboot-secret-key' || apiKey === '356c087d9-4073-4ceb-986a-09083992518c' || apiKey === 'INTERNAL_KEY';

    const instanceId = req.params.instanceId;
    if (instanceId) {
        const now = Date.now();
        const cachedEntry = instanceAuthCache.get(instanceId);
        let data = (cachedEntry && (now - cachedEntry.ts < INSTANCE_AUTH_CACHE_TTL_MS)) ? cachedEntry.data : null;
        let error = null;

        if (!data) {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instanceId);
            let query = supabase
                .from('whatsapp_instances')
                .select('id, api_key, tenant_id, display_name');

            if (isUuid) {
                query = query.eq('id', instanceId);
            } else {
                query = query.or(`display_name.eq.${instanceId},whatsapp_name.eq.${instanceId}`);
            }

            const queryRes = await query.limit(1).maybeSingle();
            data = queryRes.data;
            error = queryRes.error;

            if (data && !error) {
                const entry = { data, ts: now };
                instanceAuthCache.set(instanceId, entry);
                if (data.id) instanceAuthCache.set(data.id, entry);
                if (data.display_name) instanceAuthCache.set(data.display_name, entry);
            }
        }
            
        if (error || !data) {
            if (req.body?.method === 'sendPresenceUpdate') {
                return res.status(200).json({ ok: false, skipped: true, message: 'Instance not active for presence update' });
            }
            return res.status(404).json({ error: 'Instance not found or unauthorized' });
        }

        const isStandalone = !data.tenant_id || data.tenant_id === '00000000-0000-0000-0000-000000000000';
        const hasValidInstanceApiKey = Boolean(apiKey && data.api_key && data.api_key === apiKey);
        const matchesTenant = Boolean(tenantId && data.tenant_id === tenantId);

        if (!isMasterKey && !hasValidInstanceApiKey && !isStandalone && !matchesTenant) {
            if (req.body?.method === 'sendPresenceUpdate') {
                return res.status(200).json({ ok: false, skipped: true, message: 'Presence update ignored across tenant boundary' });
            }
            return res.status(404).json({ error: 'Instance not found or unauthorized' });
        }

        req.params.instanceId = data.id;
        req.tenantId = (!isStandalone ? data.tenant_id : null) || tenantId || '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

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
        if (await forwardInternalInstanceRequest(req, res, instanceId, { forwardAllStatuses: true, timeoutMs: 12000 })) {
            return;
        }
        res.setHeader('Cache-Control', 'no-store');
        const requestId = String(req.headers['x-trace-id'] || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0,80) || undefined;
        const forceReset = req.body?.forceReset === true;
        const forceNew = forceReset || req.body?.forceNew === true || req.query?.force_new === 'true';
        const resetSession = forceReset || req.body?.resetSession === true || forceNew;

        if (typeof sessionManager.isConnectingStateActive === 'function') {
            sessionManager.isConnectingStateActive(instanceId);
        }

        if (forceReset) {
            pendingConnectionStarts.delete(instanceId);
            sessionManager.connectingState.delete(instanceId);
            sessionManager.connectingStateStartedAt?.delete?.(instanceId);
            sessionManager.instanceMutexes?.delete?.(instanceId);
            sessionManager.pairingInProgress.delete(instanceId);
        }

        const diagnostic = connectionSnapshot(instanceId);
        const sock = sessionManager.sessions.get(instanceId)?.sock;
        const diagnosticAgeMs = diagnostic.updatedAt ? (Date.now() - Date.parse(diagnostic.updatedAt)) : 0;
        const isStaleDiagnostic = !sock && Number.isFinite(diagnosticAgeMs) && diagnosticAgeMs > 45000;
        if (isStaleDiagnostic) {
            pendingConnectionStarts.delete(instanceId);
            sessionManager.connectingState.delete(instanceId);
            sessionManager.connectingStateStartedAt?.delete?.(instanceId);
            sessionManager.instanceMutexes?.delete?.(instanceId);
            sessionManager.pairingInProgress.delete(instanceId);
        }

        const isStarting = pendingConnectionStarts.has(instanceId) || sessionManager.connectingState.has(instanceId);
        const isReconnecting = sessionManager.reconnectingTimers.has(instanceId);
        const isPairing = sessionManager.pairingInProgress.has(instanceId);
        const nothingRunningInMemory = (!sock && !isStarting && !isReconnecting && !isPairing) || isStaleDiagnostic;
        const effectivePhase = nothingRunningInMemory && ['starting', 'authenticating', 'reconnecting'].includes(diagnostic.phase)
            ? 'idle'
            : diagnostic.phase;

        // A QR refresh must be idempotent, including old clients using force_new=true.
        const decision = connectDecision({
            ...diagnostic,
            phase: effectivePhase,
            hasSession: Boolean(sock),
            starting: isStarting,
            reconnecting: isReconnecting,
            pairingInProgress: isPairing,
            resetSession,
            forceReset
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

        // Limpa imediatamente o last_error no banco para evitar que o polling de status do frontend leia erros antigos durante o boot
        const { error: stateError } = await supabase.from('whatsapp_instances').update({ status: 'connecting', reconnect_attempts: 0, last_error: null, assigned_node_id: NODE_ID }).eq('id', instanceId).eq('tenant_id', tenantId);
        if (stateError) throw stateError;

        await logAndNotifyConnectionEvent({ tenantId, instanceId, eventType: 'connection_request', status: 'connecting', details: { requestId, source: req.body?.source || 'api', resetRequested: resetSession, forceReset } });
        if (sock || forceReset) await sessionManager.closeSession(instanceId);
        const { data: authCreds, error: authError } = await supabase.from('wa_auth_credentials').select('creds_data').eq('instance_id', instanceId).maybeSingle();
        if (authError) throw authError;
        const hasStoredIdentity = Boolean(authCreds?.creds_data?.me?.id || authCreds?.creds_data?.me?.jid);
        if (shouldClearCredentials({ resetSession, hasStoredIdentity, forceReset })) {
            const { clearInstanceMemoryCache, flushPendingWrites } = await import('../session-manager/auth.js');
            await flushPendingWrites(instanceId);
            clearInstanceMemoryCache(instanceId);
            for (const table of ['wa_auth_credentials', 'wa_auth_keys', 'whatsapp_instance_runtime']) {
                const { error } = await supabase.from(table).delete().eq('instance_id', instanceId);
                if (error) throw error;
            }
        } else if (!hasStoredIdentity) {
            await supabase.from('whatsapp_instance_runtime').delete().eq('instance_id', instanceId);
        }
        activePairingAttempts.set(instanceId, { timestamp: Date.now(), source: 'api_connect_request', tenantId });
        sessionManager.reconnectAttempts.delete(instanceId);
        sessionManager.conflictAttempts.delete(instanceId);
        sessionManager.autoHealingFailures?.delete(instanceId);
        sessionManager.autoHealingCooldowns?.delete(instanceId);
        sessionManager.reconnectingCoolingDown?.delete(instanceId);
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
        if (await forwardInternalInstanceRequest(req, res, instanceId, { forwardAllStatuses: true, timeoutMs: 25000 })) {
            return;
        }
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
        if (await forwardInternalInstanceRequest(req, res, instanceId, { forwardAllStatuses: true, timeoutMs: 10000 })) {
            return;
        }
        const sock = sessionManager.getSocket(instanceId);
        
        if (sock) {
            try { await sock.logout(); } catch(e) {}
            await sessionManager.closeSession(instanceId);
        }
        await supabase.from('wa_auth_credentials').delete().eq('instance_id', instanceId);
        await supabase.from('wa_auth_keys').delete().eq('instance_id', instanceId);
        await supabase.from('whatsapp_instance_runtime').delete().eq('instance_id', instanceId);
        await supabase.from('whatsapp_instances').update({ status: 'offline', last_error: null, assigned_node_id: null, lease_until: null }).eq('id', instanceId);

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
        if (await forwardInternalInstanceRequest(req, res, instanceId, { forwardAllStatuses: true })) {
            return;
        }
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
                let activeSock = isAllowedOnThisNode ? sessionManager.sessions.get(instanceId)?.sock : null;
                let targetJid = jid;
                if (targetJid && typeof targetJid === 'string' && !targetJid.endsWith('@g.us')) {
                    targetJid = await resolveTargetJid(activeSock, jid, req.tenantId);
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
                                    }).catch(epErr => {
                                        console.warn(`[API Gateway] [FastPath] Aviso ao sincronizar EventProcessor para ${instanceId}:`, epErr?.message || epErr);
                                    });
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

                // Fallback para Outbox Queue Resiliente: corrige status se estava falsamente connected e aciona reconexão
                if (isAllowedOnThisNode && !isSockConnected) {
                    supabase.from('whatsapp_instances')
                        .update({ status: 'connecting', last_error: 'Reconectando instância para envio de mensagens...', updated_at: new Date().toISOString() })
                        .eq('id', instanceId)
                        .then(() => {}, () => {});
                    const isStartingNow = typeof sessionManager.isConnectingStateActive === 'function' ? sessionManager.isConnectingStateActive(instanceId) : sessionManager.connectingState.has(instanceId);
                    if (!isStartingNow) {
                        sessionManager.createSession(req.tenantId, instanceId, false).catch(() => {});
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
            const sock = sessionManager.getSocket(req.params.instanceId || instanceId);
            if (!sock) {
                return res.json({ ok: false, skipped: true, message: 'Socket offline or presence update ignored' });
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

        const macroArg = (args && args[0]) || {};

        // Helper de timeout estrito para impedir que qualquer IQ/query do Baileys trave o Event Loop ou a requisição HTTP
        const withBaileysTimeout = async (promiseOrFn, timeoutMs = 12000, opLabel = 'BaileysOp') => {
            let timer = null;
            try {
                const targetPromise = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;
                return await Promise.race([
                    targetPromise,
                    new Promise((_, reject) => {
                        timer = setTimeout(() => {
                            reject(new Error(`TIMEOUT_${opLabel} (${timeoutMs}ms)`));
                        }, timeoutMs);
                    })
                ]);
            } finally {
                if (timer) clearTimeout(timer);
            }
        };

        if (!sessionManager.activeCatalogSyncs) {
            sessionManager.activeCatalogSyncs = new Set();
        }

        // ============================================================================
        // MACROS AVANÇADOS BAILEYS (18 FUNCIONALIDADES INTEGRADAS E BLINDADAS)
        // ============================================================================
        try {
            // 1. Fixar / Desafixar Mensagem no Chat (pin) - 24h (86400), 7d (604800), 30d (2592000)
            if (method === 'pinMessage') {
                const { jid, key, type = 1, time = 2592000 } = macroArg;
                if (!jid || !key || !key.id) return res.status(400).json({ ok: false, error: 'Missing jid or valid key.id' });
                const targetJid = jid.endsWith('@g.us') ? jid : await resolveTargetJid(sock, jid, req.tenantId);
                const VALID_PIN_TIMES = [86400, 604800, 2592000];
                const safePinTime = VALID_PIN_TIMES.includes(Number(time)) ? Number(time) : 2592000;
                const pinKey = {
                    remoteJid: key.remoteJid || targetJid,
                    fromMe: Boolean(key.fromMe),
                    id: String(key.id),
                    ...(key.participant ? { participant: key.participant } : {})
                };
                const sendFn = sock.originalSendMessage || sock.sendMessage.bind(sock);
                const result = await withBaileysTimeout(
                    sendFn(targetJid, {
                        pin: pinKey,
                        type: Number(type) === 0 || Number(type) === 2 ? 2 : 1,
                        time: Number(type) === 1 ? safePinTime : undefined
                    }),
                    12000,
                    'PIN_MESSAGE'
                );
                const isPinned = Number(type) === 1;
                if (pinKey.id) {
                    const { data: existingMsg } = await supabase
                        .from('messages')
                        .select('id, raw_payload')
                        .eq('whatsapp_message_id', pinKey.id)
                        .maybeSingle()
                        .then(r => r, () => ({ data: null }));
                    if (existingMsg) {
                        const updatedPayload = {
                            ...(existingMsg.raw_payload || {}),
                            pinned: isPinned,
                            pin_time: isPinned ? safePinTime : null,
                            pinned_at: isPinned ? new Date().toISOString() : null
                        };
                        await supabase.from('messages').update({ raw_payload: updatedPayload }).eq('id', existingMsg.id).then(r => r, () => {});
                    }
                }
                return res.json({ ok: true, result, pinned: isPinned });
            }

            // 1.1 Enviar e Fixar Link do Cardápio Digital por 30 Dias Automaticamente
            if (method === 'pinMenuLink') {
                const { jid, menuUrl, text, time = 2592000 } = macroArg;
                if (!jid) return res.status(400).json({ ok: false, error: 'Missing jid' });
                const targetJid = jid.endsWith('@g.us') ? jid : await resolveTargetJid(sock, jid, req.tenantId);
                const VALID_PIN_TIMES = [86400, 604800, 2592000];
                const safePinTime = VALID_PIN_TIMES.includes(Number(time)) ? Number(time) : 2592000;
                let finalUrl = menuUrl;
                if (!finalUrl) {
                    const { data: instData } = await supabase
                        .from('whatsapp_instances')
                        .select('gastrofood_url, menu_url, display_name')
                        .eq('id', instanceId)
                        .maybeSingle()
                        .then(r => r, () => ({ data: null }));
                    finalUrl = instData?.menu_url || instData?.gastrofood_url || 'https://cardapiodigital.io';
                }
                const finalBody = text || `🍔 *CARDÁPIO DIGITAL OFICIAL*\n\nFaça seu pedido de forma rápida e prática pelo nosso link abaixo:\n👉 ${finalUrl}`;
                const sendFn = sock.originalSendMessage || sock.sendMessage.bind(sock);
                const sentMsg = await withBaileysTimeout(sendFn(targetJid, { text: finalBody }), 12000, 'SEND_MENU_LINK');
                if (sentMsg?.key?.id) {
                    await new Promise(r => setTimeout(r, 300));
                    await withBaileysTimeout(
                        sendFn(targetJid, {
                            pin: sentMsg.key,
                            type: 1,
                            time: safePinTime
                        }),
                        8000,
                        'PIN_MENU_LINK'
                    ).catch(e => console.warn('[Invoke/pinMenuLink] Aviso ao fixar mensagem:', e.message));
                }
                return res.json({ ok: true, result: sentMsg, pinnedForSeconds: safePinTime });
            }

            // 2. Enviar Enquete Nativa Clicável (poll)
            if (method === 'sendPoll') {
                const { jid, name, values, selectableCount = 1 } = macroArg;
                if (!jid || !name || !Array.isArray(values)) {
                    return res.status(400).json({ ok: false, error: 'Enquete requer jid, pergunta (name) e ao menos 2 opções válidas (values).' });
                }
                const cleanValues = values.map(v => String(v || '').trim()).filter(Boolean).slice(0, 12);
                if (cleanValues.length < 2) {
                    return res.status(400).json({ ok: false, error: 'Enquete requer ao menos 2 opções não vazias.' });
                }
                const targetJid = jid.endsWith('@g.us') ? jid : await resolveTargetJid(sock, jid, req.tenantId);
                const result = await withBaileysTimeout(
                    sock.sendMessage(targetJid, {
                        poll: {
                            name: String(name).trim(),
                            values: cleanValues,
                            selectableCount: Math.max(1, Math.min(cleanValues.length, Number(selectableCount || 1)))
                        }
                    }, { isHuman: true, skipDelay: true }),
                    15000,
                    'SEND_POLL'
                );
                return res.json({ ok: true, result, key: result?.key });
            }

            // 4. Enviar Álbum de Mídias Agrupadas (albumMessage + albumParentKey)
            if (method === 'sendAlbum') {
                const { jid, medias = [], caption = '' } = macroArg;
                const validMedias = (Array.isArray(medias) ? medias : [])
                    .filter(m => m && typeof m.url === 'string' && m.url.trim().startsWith('http'))
                    .slice(0, 10);
                if (!jid || validMedias.length === 0) {
                    return res.status(400).json({ ok: false, error: 'Álbum requer jid e array medias com URLs HTTP/HTTPS válidas.' });
                }
                const targetJid = jid.endsWith('@g.us') ? jid : await resolveTargetJid(sock, jid, req.tenantId);
                const expectedImageCount = validMedias.filter(m => (m.type || 'image') === 'image').length;
                const expectedVideoCount = validMedias.filter(m => m.type === 'video').length;
                const sendFn = sock.originalSendMessage || sock.sendMessage.bind(sock);

                const albumParent = await withBaileysTimeout(
                    sendFn(targetJid, {
                        album: {
                            expectedImageCount,
                            expectedVideoCount,
                            caption: caption || undefined
                        }
                    }),
                    12000,
                    'SEND_ALBUM_HEADER'
                );

                const sentChildren = [];
                const failedChildren = [];
                for (let i = 0; i < validMedias.length; i++) {
                    const item = validMedias[i];
                    const isVid = item.type === 'video';
                    const childCaption = item.caption || (i === 0 ? caption : '') || undefined;
                    // Baileys v7 verifica message.albumParentKey diretamente no objeto content (messages.js:534)
                    const childPayload = isVid
                        ? { video: { url: item.url.trim() }, caption: childCaption, albumParentKey: albumParent?.key }
                        : { image: { url: item.url.trim() }, caption: childCaption, albumParentKey: albumParent?.key };
                    try {
                        const childRes = await withBaileysTimeout(
                            sendFn(targetJid, childPayload, { albumParentKey: albumParent?.key }),
                            18000,
                            `SEND_ALBUM_ITEM_${i + 1}`
                        );
                        sentChildren.push(childRes?.key);
                    } catch (childErr) {
                        failedChildren.push({ index: i, url: item.url, error: childErr.message });
                        console.warn(`[Invoke/sendAlbum] Aviso ao enviar item ${i + 1}/${validMedias.length} do álbum:`, childErr.message);
                    }
                }
                return res.json({
                    ok: sentChildren.length > 0,
                    albumKey: albumParent?.key,
                    childrenKeys: sentChildren,
                    failedChildren
                });
            }

            // 6. Ler Detalhes do Carrinho enviado pelo Cliente (getOrderDetails)
            if (method === 'getOrderDetails') {
                const { orderId, token } = macroArg;
                if (!orderId || !token) return res.status(400).json({ ok: false, error: 'Missing orderId or token' });
                const details = await withBaileysTimeout(sock.getOrderDetails(String(orderId), String(token)), 10000, 'GET_ORDER_DETAILS');
                return res.json({ ok: true, result: details });
            }

            // 7. Catálogo WhatsApp Business & Sincronização com Cardápio GastroFood + Envio de Produto Único
            if (method === 'getCatalog') {
                const { jid, limit = 50 } = macroArg;
                const safeLimit = Math.max(1, Math.min(100, Number(limit || 50)));
                const catalog = await withBaileysTimeout(
                    sock.getCatalog({ jid: jid || sock.user?.id, limit: safeLimit }),
                    12000,
                    'GET_CATALOG'
                );
                return res.json({ ok: true, result: catalog });
            }

            if (method === 'syncGastrofoodCatalog') {
                if (sessionManager.activeCatalogSyncs.has(instanceId)) {
                    return res.json({
                        ok: false,
                        error: 'Já existe uma sincronização de catálogo em andamento para esta instância. Aguarde alguns segundos.'
                    });
                }
                sessionManager.activeCatalogSyncs.add(instanceId);
                try {
                    const safeLimit = Math.max(1, Math.min(50, Number(macroArg.limit || 40)));
                    // 1. Busca produtos já sincronizados do GastroFood na tabela cardapio_produtos (ou força sync se vazio)
                    let { data: dbProducts } = await supabase
                        .from('cardapio_produtos')
                        .select('*')
                        .eq('instance_id', instanceId)
                        .eq('ativo', true)
                        .order('nome', { ascending: true })
                        .limit(safeLimit)
                        .then(r => r, () => ({ data: [] }));

                    if (!dbProducts || dbProducts.length === 0) {
                        try {
                            const { default: cardapioSync } = await import('../services/cardapioSync.js');
                            if (cardapioSync && typeof cardapioSync.syncInstance === 'function') {
                                await withBaileysTimeout(cardapioSync.syncInstance(instanceId), 15000, 'GASTROFOOD_SYNC');
                                const retryRes = await supabase
                                    .from('cardapio_produtos')
                                    .select('*')
                                    .eq('instance_id', instanceId)
                                    .eq('ativo', true)
                                    .order('nome', { ascending: true })
                                    .limit(safeLimit)
                                    .then(r => r, () => ({ data: [] }));
                                dbProducts = retryRes.data || [];
                            }
                        } catch (syncErr) {
                            console.warn('[Invoke/syncGastrofoodCatalog] Aviso ao acionar cardapioSync:', syncErr.message);
                        }
                    }

                    if (!dbProducts || dbProducts.length === 0) {
                        return res.json({
                            ok: false,
                            error: 'Nenhum produto ativo encontrado no cardápio desta instância. Verifique o token GastroFood na aba Integrações.'
                        });
                    }

                    let existingProducts = [];
                    try {
                        const currentCat = await withBaileysTimeout(
                            sock.getCatalog({ jid: sock.user?.id, limit: 100 }),
                            10000,
                            'GET_CATALOG_FOR_SYNC'
                        );
                        existingProducts = currentCat?.products || [];
                    } catch (catErr) {
                        console.warn('[Invoke/syncGastrofoodCatalog] Aviso ao ler catálogo atual:', catErr.message);
                    }

                    const defaultImage = 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80';
                    let createdCount = 0;
                    let updatedCount = 0;
                    let failedCount = 0;

                    for (const prod of dbProducts) {
                        try {
                            const prodName = String(prod.nome || 'Produto').trim().slice(0, 100);
                            const prodPrice = Math.max(100, Math.round(Number(prod.preco || 0) * 1000));
                            const prodDesc = String(prod.descricao || prod.categoria || prodName).trim().slice(0, 500);
                            const imgUrl = prod.imagem_url && String(prod.imagem_url).startsWith('http') ? prod.imagem_url : defaultImage;
                            const retailerId = String(prod.external_id || prod.id).slice(0, 50);

                            const existingMatch = existingProducts.find(
                                ep => (ep.retailerId && String(ep.retailerId) === retailerId) ||
                                      (ep.name && String(ep.name).toLowerCase() === prodName.toLowerCase())
                            );

                            const productPayload = {
                                name: prodName,
                                description: prodDesc,
                                price: prodPrice,
                                currency: 'BRL',
                                isHidden: false,
                                retailerId,
                                images: [{ url: imgUrl }]
                            };

                            if (existingMatch?.id && typeof sock.productUpdate === 'function') {
                                await withBaileysTimeout(sock.productUpdate(existingMatch.id, productPayload), 12000, 'PRODUCT_UPDATE');
                                updatedCount++;
                            } else if (typeof sock.productCreate === 'function') {
                                await withBaileysTimeout(sock.productCreate(productPayload), 12000, 'PRODUCT_CREATE');
                                createdCount++;
                            }
                        } catch (itemErr) {
                            failedCount++;
                            console.warn(`[Invoke/syncGastrofoodCatalog] Falha ao sincronizar produto "${prod?.nome}":`, itemErr.message);
                        }
                    }

                    return res.json({
                        ok: true,
                        totalProcessed: dbProducts.length,
                        createdCount,
                        updatedCount,
                        failedCount,
                        message: `Sincronização concluída! ${createdCount} criados e ${updatedCount} atualizados no Catálogo WhatsApp Business.`
                    });
                } finally {
                    sessionManager.activeCatalogSyncs.delete(instanceId);
                }
            }

            if (method === 'sendProduct') {
                const { jid, product } = macroArg;
                if (!jid || !product) return res.status(400).json({ ok: false, error: 'Missing jid or product' });
                const targetJid = jid.endsWith('@g.us') ? jid : await resolveTargetJid(sock, jid, req.tenantId);
                const ownerJid = sock.user?.id ? sock.user.id.split(':')[0] + (sock.user.id.includes('@') ? '' : '@s.whatsapp.net') : targetJid;
                const normalizedOwnerJid = ownerJid.includes('@') ? ownerJid : `${ownerJid}@s.whatsapp.net`;
                const price1000 = product.priceAmount1000 || Math.max(100, Math.round(Number(product.price || product.preco || 0) * 1000));
                const rawImgUrl = product.productImageUrl || product.imageUrl || product.imagem_url;
                const imgUrl = (rawImgUrl && String(rawImgUrl).startsWith('http'))
                    ? String(rawImgUrl).trim()
                    : 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80';

                const sendFn = sock.originalSendMessage || sock.sendMessage.bind(sock);
                const result = await withBaileysTimeout(
                    sendFn(targetJid, {
                        product: {
                            productImage: { url: imgUrl },
                            productId: String(product.productId || product.id || Date.now()),
                            title: String(product.title || product.nome || 'Produto'),
                            description: String(product.description || product.descricao || ''),
                            currencyCode: product.currencyCode || 'BRL',
                            priceAmount1000: price1000,
                            retailerId: String(product.retailerId || product.external_id || product.id || 'ITEM-1'),
                            url: product.url || undefined,
                            productImageCount: 1
                        },
                        businessOwnerJid: normalizedOwnerJid
                    }),
                    15000,
                    'SEND_PRODUCT'
                );
                return res.json({ ok: true, result, key: result?.key });
            }

            // 8. Editar Perfil Comercial e Capa (getBusinessProfile, updateBusinessProfile, updateCoverPhoto)
            if (method === 'getBusinessProfile') {
                const targetJid = macroArg.jid || sock.user?.id;
                const cleanJid = String(targetJid || '').split(':')[0] + (String(targetJid || '').includes('@') ? '' : '@s.whatsapp.net');
                const finalJid = cleanJid.includes('@s.whatsapp.net') ? cleanJid : `${cleanJid.split('@')[0]}@s.whatsapp.net`;
                const profile = await withBaileysTimeout(sock.getBusinessProfile(finalJid), 10000, 'GET_BUSINESS_PROFILE');
                return res.json({ ok: true, result: profile || null });
            }

            if (method === 'updateBusinessProfile') {
                const { address, email, description, websites, hours, coverPhotoUrl } = macroArg;
                if (typeof sock.updateBussinesProfile === 'function') {
                    await withBaileysTimeout(
                        sock.updateBussinesProfile({
                            address: address || '',
                            email: email || '',
                            description: description || '',
                            websites: Array.isArray(websites) ? websites : (websites ? [websites] : []),
                            hours: hours || undefined
                        }),
                        12000,
                        'UPDATE_BUSINESS_PROFILE'
                    );
                }
                if (coverPhotoUrl && String(coverPhotoUrl).startsWith('http') && typeof sock.updateCoverPhoto === 'function') {
                    await withBaileysTimeout(sock.updateCoverPhoto({ url: String(coverPhotoUrl).trim() }), 15000, 'UPDATE_COVER_PHOTO');
                }
                return res.json({ ok: true, message: 'Perfil comercial WhatsApp Business atualizado com sucesso!' });
            }

            // 9. Respostas Rápidas Nativas do Aparelho (addOrEditQuickReply / removeQuickReply)
            if (method === 'syncQuickReplies') {
                let replies = macroArg.quickReplies;
                if (!Array.isArray(replies)) {
                    const { data: dbReplies } = await supabase
                        .from('quick_replies')
                        .select('*')
                        .eq('tenant_id', req.tenantId)
                        .limit(50)
                        .then(r => r, () => ({ data: [] }));
                    replies = dbReplies || [];
                }
                let synced = 0;
                const cappedReplies = replies.slice(0, 50);
                for (const qr of cappedReplies) {
                    const shortcut = String(qr?.shortcut || qr?.title || '').replace(/^\//, '').trim();
                    const message = String(qr?.content || qr?.message || qr?.text || '').trim();
                    if (!shortcut || !message) continue;
                    try {
                        await withBaileysTimeout(
                            sock.addOrEditQuickReply({
                                timestamp: Math.floor(Date.now() / 1000).toString(),
                                shortcut,
                                message,
                                type: 'text',
                                count: 0,
                                keywords: []
                            }),
                            8000,
                            'ADD_QUICK_REPLY'
                        );
                        synced++;
                    } catch (qrErr) {
                        console.warn(`[Invoke/syncQuickReplies] Aviso no atalho /${shortcut}:`, qrErr.message);
                    }
                }
                return res.json({ ok: true, synced, message: `${synced} respostas rápidas sincronizadas com o aparelho WhatsApp Business.` });
            }

            // 10. Sincronização Bidirecional de Etiquetas (Labels) com Kanban CRM
            if (method === 'syncLabelsWithCrm') {
                let columns = macroArg.columns;
                if (!Array.isArray(columns) || columns.length === 0) {
                    const { data: stages } = await supabase
                        .from('crm_stages')
                        .select('id, name, color, position')
                        .eq('tenant_id', req.tenantId)
                        .order('position', { ascending: true })
                        .limit(20)
                        .then(r => r, () => ({ data: [] }));
                    columns = stages && stages.length > 0 ? stages : [
                        { name: 'Novo Lead', color: 1 },
                        { name: 'Em Atendimento', color: 2 },
                        { name: 'Pedido Realizado', color: 3 },
                        { name: 'Pós-Venda / Fidelizado', color: 4 }
                    ];
                }
                const syncedLabels = [];
                const cappedCols = columns.slice(0, 20);
                for (let i = 0; i < cappedCols.length; i++) {
                    const col = cappedCols[i];
                    const labelId = String(i + 1);
                    const labelName = String(col?.name || col?.title || `Etapa ${i + 1}`).trim();
                    const colorIdx = typeof col?.color === 'number' ? col.color : (i % 10);
                    try {
                        await withBaileysTimeout(
                            sock.addLabel(labelId, { name: labelName, color: colorIdx }),
                            8000,
                            'ADD_LABEL'
                        );
                        syncedLabels.push({ id: labelId, name: labelName, color: colorIdx });
                    } catch (lblErr) {
                        console.warn(`[Invoke/syncLabelsWithCrm] Aviso ao criar/atualizar label "${labelName}":`, lblErr.message);
                    }
                }
                const existingMap = Array.from((sessionManager.instanceLabelsCache?.get(instanceId) || new Map()).values());
                return res.json({ ok: true, syncedLabels, cachedLabels: existingMap });
            }

            if (method === 'setChatLabel') {
                const { jid, labelId, action = 'add' } = macroArg;
                if (!jid || !labelId) return res.status(400).json({ ok: false, error: 'Missing jid or labelId' });
                const targetJid = jid.endsWith('@g.us') ? jid : await resolveTargetJid(sock, jid, req.tenantId);
                if (action === 'remove') {
                    await withBaileysTimeout(sock.removeChatLabel(targetJid, String(labelId)), 8000, 'REMOVE_CHAT_LABEL');
                } else {
                    await withBaileysTimeout(sock.addChatLabel(targetJid, String(labelId)), 8000, 'ADD_CHAT_LABEL');
                }
                return res.json({ ok: true, action, labelId });
            }

            // 11. Favoritar Mensagens no Aparelho (star)
            if (method === 'starMessage') {
                const { jid, messageId, whatsappId, fromMe = false, star = true } = macroArg;
                if (!jid || (!whatsappId && !messageId)) return res.status(400).json({ ok: false, error: 'Missing jid or whatsappId' });
                const targetJid = jid.endsWith('@g.us') ? jid : await resolveTargetJid(sock, jid, req.tenantId);
                const targetWaId = String(whatsappId || messageId);
                await withBaileysTimeout(
                    sock.star(targetJid, [{ id: targetWaId, fromMe: Boolean(fromMe) }], Boolean(star)),
                    8000,
                    'STAR_MESSAGE'
                );

                const { data: existingMsg } = await supabase
                    .from('messages')
                    .select('id, raw_payload')
                    .or(`id.eq.${messageId || targetWaId},whatsapp_message_id.eq.${targetWaId}`)
                    .limit(1)
                    .maybeSingle()
                    .then(r => r, () => ({ data: null }));

                if (existingMsg) {
                    const updatedPayload = {
                        ...(existingMsg.raw_payload || {}),
                        starred: Boolean(star),
                        starred_at: star ? new Date().toISOString() : null
                    };
                    await supabase.from('messages').update({ raw_payload: updatedPayload }).eq('id', existingMsg.id).then(r => r, () => {});
                }
                return res.json({ ok: true, starred: Boolean(star) });
            }

            // 12. Modificar Estado do Chat no Aparelho (chatModify: archive, pin, mute, markRead, clear, delete)
            if (method === 'chatModify') {
                const { jid, mod } = macroArg;
                if (!jid || !mod || typeof mod !== 'object') return res.status(400).json({ ok: false, error: 'Missing jid or valid mod object' });
                const targetJid = jid.endsWith('@g.us') ? jid : await resolveTargetJid(sock, jid, req.tenantId);
                const safeMod = { ...mod };

                // Normaliza mute (true -> 8 horas em ms, false/0 -> null)
                if ('mute' in safeMod) {
                    if (safeMod.mute === true) {
                        safeMod.mute = Date.now() + 8 * 60 * 60 * 1000;
                    } else if (safeMod.mute === false || safeMod.mute === 0) {
                        safeMod.mute = null;
                    }
                }
                if ('pin' in safeMod) {
                    safeMod.pin = Boolean(safeMod.pin);
                }

                // Baileys v7 exige lastMessages preenchido para archive, markRead, clear e delete (chat-utils.js:445-545)
                const requiresLastMessages = 'archive' in safeMod || 'markRead' in safeMod || 'clear' in safeMod || 'delete' in safeMod;
                if (requiresLastMessages && (!Array.isArray(safeMod.lastMessages) || safeMod.lastMessages.length === 0)) {
                    let fallbackLastMsg = {
                        key: {
                            remoteJid: targetJid,
                            fromMe: true,
                            id: 'SYNC_LAST_MSG'
                        },
                        messageTimestamp: Math.floor(Date.now() / 1000)
                    };
                    try {
                        const cleanPhone = String(targetJid).split('@')[0].split(':')[0].replace(/\D/g, '');
                        if (cleanPhone && req.tenantId) {
                            const { data: contactRow } = await supabase
                                .from('contacts')
                                .select('id')
                                .eq('tenant_id', req.tenantId)
                                .eq('phone', cleanPhone)
                                .limit(1)
                                .maybeSingle()
                                .then(r => r, () => ({ data: null }));
                            if (contactRow?.id) {
                                const { data: lastConv } = await supabase
                                    .from('conversations')
                                    .select('id')
                                    .eq('tenant_id', req.tenantId)
                                    .eq('contact_id', contactRow.id)
                                    .order('updated_at', { ascending: false })
                                    .limit(1)
                                    .maybeSingle()
                                    .then(r => r, () => ({ data: null }));
                                if (lastConv?.id) {
                                    const { data: lastMsgRow } = await supabase
                                        .from('messages')
                                        .select('whatsapp_message_id, sender, timestamp')
                                        .eq('conversation_id', lastConv.id)
                                        .not('whatsapp_message_id', 'is', null)
                                        .order('timestamp', { ascending: false })
                                        .limit(1)
                                        .maybeSingle()
                                        .then(r => r, () => ({ data: null }));
                                    if (lastMsgRow?.whatsapp_message_id) {
                                        fallbackLastMsg = {
                                            key: {
                                                remoteJid: targetJid,
                                                fromMe: lastMsgRow.sender === 'me',
                                                id: lastMsgRow.whatsapp_message_id
                                            },
                                            messageTimestamp: lastMsgRow.timestamp
                                                ? Math.floor(new Date(lastMsgRow.timestamp).getTime() / 1000)
                                                : Math.floor(Date.now() / 1000)
                                        };
                                    }
                                }
                            }
                        }
                    } catch (lmErr) {}
                    safeMod.lastMessages = [fallbackLastMsg];
                }

                await withBaileysTimeout(sock.chatModify(safeMod, targetJid), 10000, 'CHAT_MODIFY');
                return res.json({ ok: true, mod: safeMod, jid: targetJid });
            }

            // 13. Sincronização Sob Demanda de Histórico Antigo (fetchMessageHistory)
            if (method === 'fetchMessageHistory') {
                const { jid, count = 50, oldestMsgKey, oldestMsgTimestamp } = macroArg;
                if (!jid) return res.status(400).json({ ok: false, error: 'Missing jid' });
                const targetJid = jid.endsWith('@g.us') ? jid : await resolveTargetJid(sock, jid, req.tenantId);
                const safeCount = Math.max(1, Math.min(50, Number(count || 50)));
                const keyToUse = (oldestMsgKey && oldestMsgKey.id) ? {
                    remoteJid: oldestMsgKey.remoteJid || targetJid,
                    fromMe: Boolean(oldestMsgKey.fromMe),
                    id: String(oldestMsgKey.id)
                } : {
                    remoteJid: targetJid,
                    fromMe: false,
                    id: 'OLDEST_SYNC_REQ'
                };
                const tsToUse = Number(oldestMsgTimestamp) > 0 ? Number(oldestMsgTimestamp) : (Math.floor(Date.now() / 1000) - 86400);
                const sessionId = await withBaileysTimeout(
                    sock.fetchMessageHistory(safeCount, keyToUse, tsToUse),
                    10000,
                    'FETCH_MESSAGE_HISTORY'
                );
                return res.json({
                    ok: true,
                    sessionId,
                    message: 'Solicitação enviada ao aparelho! As mensagens anteriores desta conversa chegarão automaticamente em instantes.'
                });
            }

            // 14. Consultar Bloqueio Temporário (Reachout Timelock) & Limite de Novas Conversas (NewChatMessageCap)
            if (method === 'getAccountHealthLimits') {
                const [timelockRes, capRes] = await Promise.allSettled([
                    typeof sock.fetchAccountReachoutTimelock === 'function'
                        ? withBaileysTimeout(sock.fetchAccountReachoutTimelock(), 8000, 'FETCH_TIMELOCK')
                        : Promise.resolve(null),
                    typeof sock.fetchNewChatMessageCap === 'function'
                        ? withBaileysTimeout(sock.fetchNewChatMessageCap(), 8000, 'FETCH_CHAT_CAP')
                        : Promise.resolve(null)
                ]);
                return res.json({
                    ok: true,
                    reachoutTimelock: timelockRes.status === 'fulfilled' ? timelockRes.value : { isActive: false, error: timelockRes.reason?.message },
                    newChatMessageCap: capRes.status === 'fulfilled' ? capRes.value : { error: capRes.reason?.message },
                    checkedAt: new Date().toISOString()
                });
            }

            // 15. Bloquear / Desbloquear Contatos no WhatsApp (updateBlockStatus + fetchBlocklist)
            if (method === 'updateBlockStatus') {
                const { jid, action = 'block' } = macroArg;
                if (!jid) return res.status(400).json({ ok: false, error: 'Missing jid' });
                const targetJid = jid.endsWith('@g.us') ? jid : await resolveTargetJid(sock, jid, req.tenantId);
                const blockAction = action === 'unblock' ? 'unblock' : 'block';
                try {
                    await withBaileysTimeout(sock.updateBlockStatus(targetJid, blockAction), 10000, 'UPDATE_BLOCK_STATUS');
                } catch (blkErr) {
                    // Baileys v7 requer mapeamento PN -> LID em updateBlockStatus (chats.js:297).
                    // Se o mapeamento LID ainda não existir no repositório local, resolve via onWhatsApp e retenta:
                    if (String(blkErr?.message || '').includes('LID') && typeof sock.onWhatsApp === 'function') {
                        const [waCheck] = (await withBaileysTimeout(sock.onWhatsApp(targetJid), 6000, 'ON_WHATSAPP_LID').catch(() => [])) || [];
                        if (waCheck?.lid) {
                            if (sock.signalRepository?.lidMapping?.storeLIDPNMapping) {
                                await sock.signalRepository.lidMapping.storeLIDPNMapping(waCheck.lid, targetJid).catch(() => {});
                            }
                            await withBaileysTimeout(sock.updateBlockStatus(waCheck.lid, blockAction), 10000, 'UPDATE_BLOCK_STATUS_LID');
                        } else {
                            throw blkErr;
                        }
                    } else {
                        throw blkErr;
                    }
                }
                return res.json({ ok: true, jid: targetJid, action: blockAction });
            }

            if (method === 'fetchBlocklist') {
                const blocklist = await withBaileysTimeout(sock.fetchBlocklist(), 10000, 'FETCH_BLOCKLIST');
                return res.json({ ok: true, blocklist: blocklist || [] });
            }

            // 16. Rejeição Automática de Chamadas & Link de Chamada (createCallLink / updateCallSettings)
            if (method === 'createCallLink') {
                const { media = 'audio', startTime } = macroArg;
                const safeMedia = media === 'video' ? 'video' : 'audio';
                const token = await withBaileysTimeout(
                    sock.createCallLink(safeMedia, startTime ? { startTime: Number(startTime) } : undefined),
                    10000,
                    'CREATE_CALL_LINK'
                );
                const callUrl = token ? `https://call.whatsapp.com/${safeMedia === 'video' ? 'video' : 'voice'}/${token}` : null;
                return res.json({ ok: true, token, url: callUrl, media: safeMedia });
            }

            if (method === 'getCallSettings') {
                const { data: instRow } = await supabase
                    .from('whatsapp_instances')
                    .select('reject_calls, call_reject_message')
                    .eq('id', instanceId)
                    .maybeSingle()
                    .then(r => r, () => ({ data: null }));
                return res.json({
                    ok: true,
                    rejectCalls: Boolean(instRow?.reject_calls),
                    rejectMessage: instRow?.call_reject_message || 'Olá! 🤖 Não atendemos chamadas de voz ou vídeo por este número. Por favor, envie uma mensagem de texto ou áudio que responderemos em instantes!'
                });
            }

            if (method === 'updateCallSettings') {
                const { rejectCalls, rejectMessage } = macroArg;
                await supabase
                    .from('whatsapp_instances')
                    .update({
                        reject_calls: Boolean(rejectCalls),
                        call_reject_message: rejectMessage || null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', instanceId)
                    .then(r => r, () => {});
                if (!sessionManager.callSettingsCache) sessionManager.callSettingsCache = new Map();
                sessionManager.callSettingsCache.set(instanceId, {
                    rejectCalls: Boolean(rejectCalls),
                    rejectMessage: rejectMessage || 'Olá! 🤖 Não atendemos chamadas de voz ou vídeo por este número. Por favor, envie uma mensagem de texto ou áudio que responderemos em instantes!',
                    fetchedAt: Date.now()
                });
                return res.json({ ok: true, rejectCalls: Boolean(rejectCalls), rejectMessage });
            }

            // 17. Atualizar Nome, Recado (Bio) e Foto da Própria Instância
            if (method === 'updateInstanceProfile') {
                const { name, status, pictureUrl } = macroArg;
                const myJid = sock.user?.id ? `${sock.user.id.split(':')[0].split('@')[0]}@s.whatsapp.net` : null;
                if (name && typeof sock.updateProfileName === 'function') {
                    await withBaileysTimeout(sock.updateProfileName(String(name).trim()), 10000, 'UPDATE_PROFILE_NAME');
                    await supabase.from('whatsapp_instances').update({ display_name: String(name).trim() }).eq('id', instanceId).then(r => r, () => {});
                }
                if (status !== undefined && typeof sock.updateProfileStatus === 'function') {
                    await withBaileysTimeout(sock.updateProfileStatus(String(status).trim()), 10000, 'UPDATE_PROFILE_STATUS');
                }
                if (pictureUrl && String(pictureUrl).startsWith('http') && myJid && typeof sock.updateProfilePicture === 'function') {
                    await withBaileysTimeout(sock.updateProfilePicture(myJid, { url: String(pictureUrl).trim() }), 15000, 'UPDATE_PROFILE_PICTURE');
                }
                return res.json({ ok: true, message: 'Perfil da instância atualizado no WhatsApp com sucesso!' });
            }

            // 18. Configurações de Privacidade do Chip
            if (method === 'getPrivacySettings') {
                const settings = await withBaileysTimeout(sock.fetchPrivacySettings(true), 10000, 'FETCH_PRIVACY_SETTINGS');
                return res.json({ ok: true, settings });
            }

            if (method === 'updatePrivacySettings') {
                const { lastSeen, online, readReceipts, callAdd, profilePicture, statusPrivacy, groupsAdd } = macroArg;
                if (lastSeen && typeof sock.updateLastSeenPrivacy === 'function') {
                    await withBaileysTimeout(sock.updateLastSeenPrivacy(lastSeen), 8000, 'PRIVACY_LAST_SEEN');
                }
                if (online && typeof sock.updateOnlinePrivacy === 'function') {
                    await withBaileysTimeout(sock.updateOnlinePrivacy(online), 8000, 'PRIVACY_ONLINE');
                }
                if (readReceipts && typeof sock.updateReadReceiptsPrivacy === 'function') {
                    await withBaileysTimeout(sock.updateReadReceiptsPrivacy(readReceipts), 8000, 'PRIVACY_READ_RECEIPTS');
                }
                if (callAdd && typeof sock.updateCallPrivacy === 'function') {
                    await withBaileysTimeout(sock.updateCallPrivacy(callAdd), 8000, 'PRIVACY_CALL');
                }
                if (profilePicture && typeof sock.updateProfilePicturePrivacy === 'function') {
                    await withBaileysTimeout(sock.updateProfilePicturePrivacy(profilePicture), 8000, 'PRIVACY_PICTURE');
                }
                if (statusPrivacy && typeof sock.updateStatusPrivacy === 'function') {
                    await withBaileysTimeout(sock.updateStatusPrivacy(statusPrivacy), 8000, 'PRIVACY_STATUS');
                }
                if (groupsAdd && typeof sock.updateGroupsAddPrivacy === 'function') {
                    await withBaileysTimeout(sock.updateGroupsAddPrivacy(groupsAdd), 8000, 'PRIVACY_GROUPS');
                }
                const updated = await withBaileysTimeout(sock.fetchPrivacySettings(true), 8000, 'FETCH_PRIVACY_AFTER').catch(() => ({}));
                return res.json({ ok: true, settings: updated });
            }
        } catch (macroErr) {
            const safeMsg = macroErr?.message || (typeof macroErr === 'string' ? macroErr : 'Falha na execução da macro Baileys');
            console.log(`[API Gateway / Invoke] Aviso controlado na macro "${method}" para instância ${instanceId}: ${safeMsg}`);
            return res.status(200).json({ ok: false, error: safeMsg, method });
        }

        if(typeof sock[method] !== 'function') return res.status(400).json({ error: `Method ${method} not found on Baileys socket` });

        try {
            const result = await withBaileysTimeout(sock[method](...(args || [])), 12000, `RAW_${method}`);
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

        const { mediaUrl, mimetype, fileName, jid, caption, messageType, ptt, ptv, viewOnce, responseType } = req.body;

        if (!mediaUrl || !jid || !messageType) {
            return res.status(400).json({ error: 'Missing mediaUrl, jid or messageType' });
        }

        const finalResponseType = responseType === 'TUTORIAL' ? 'TUTORIAL' : 'STANDARD';
        console.log(`[send-media-url] Queueing ${messageType} (${finalResponseType}) from URL: ${mediaUrl} to ${jid}`);

        // FAST-PATH DIRETO EM MEMÓRIA PARA MÍDIA VIA URL (Encaminhamentos e Respostas Rápidas < 300ms)
        const activeUrlSock = isAllowedOnThisNode ? (sessionManager.getSocket(instanceId) || sessionManager.sessions.get(instanceId)?.sock) : null;
        if (activeUrlSock && isSocketOpen(activeUrlSock) && /^https?:\/\//i.test(String(mediaUrl)) && finalResponseType === 'STANDARD') {
            try {
                let targetJid = String(jid).trim();
                if (!targetJid.includes('@')) {
                    targetJid = `${targetJid.replace(/\D/g, '')}@s.whatsapp.net`;
                }

                const fetchCtrl = new AbortController();
                const fetchTimer = setTimeout(() => fetchCtrl.abort(), 12000);
                const mediaFetchRes = await fetch(mediaUrl, { signal: fetchCtrl.signal }).finally(() => clearTimeout(fetchTimer));
                if (!mediaFetchRes.ok) {
                    throw new Error(`HTTP ${mediaFetchRes.status} ao baixar mediaUrl no Fast-Path`);
                }
                const mediaBuffer = Buffer.from(await mediaFetchRes.arrayBuffer());
                const detectedMime = mimetype && mimetype !== 'application/octet-stream'
                    ? mimetype
                    : (mediaFetchRes.headers.get('content-type') || 'application/octet-stream');

                let mediaPayload = {};
                if (messageType === 'image') {
                    mediaPayload = { image: mediaBuffer, caption: caption || '', mimetype: detectedMime, ...(viewOnce ? { viewOnce: true } : {}) };
                } else if (messageType === 'video') {
                    mediaPayload = { video: mediaBuffer, caption: ptv ? undefined : (caption || ''), mimetype: detectedMime, ...(ptv ? { ptv: true } : {}), ...(viewOnce ? { viewOnce: true } : {}) };
                } else if (messageType === 'audio') {
                    mediaPayload = { audio: mediaBuffer, mimetype: detectedMime.includes('ogg') ? 'audio/ogg; codecs=opus' : detectedMime, ptt: Boolean(ptt), ...(viewOnce ? { viewOnce: true } : {}) };
                } else {
                    mediaPayload = { document: mediaBuffer, mimetype: detectedMime, fileName: fileName || 'documento', caption: caption || '' };
                }

                const sendFn = activeUrlSock.originalSendMessage || activeUrlSock.sendMessage.bind(activeUrlSock);
                const directRes = await Promise.race([
                    sendFn(targetJid, mediaPayload),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_FASTPATH_MEDIA_URL')), 25000))
                ]);
                const realWaId = directRes?.key?.id || `FASTURL_${Date.now()}`;

                Promise.resolve().then(async () => {
                    try {
                        const { default: eventProcessor } = await import('../event-processor/index.js');
                        const msgPayload = directRes?.message || (
                            messageType === 'image' ? { imageMessage: { url: mediaUrl, mimetype: detectedMime, caption: caption || '' } } :
                            messageType === 'video' ? { videoMessage: { url: mediaUrl, mimetype: detectedMime, caption: caption || '' } } :
                            messageType === 'audio' ? { audioMessage: { url: mediaUrl, mimetype: detectedMime, ptt: Boolean(ptt) } } :
                            { documentMessage: { url: mediaUrl, mimetype: detectedMime, fileName: fileName || 'documento', caption: caption || '' } }
                        );
                        await eventProcessor.handleMessageUpsert(req.tenantId, instanceId, activeUrlSock, {
                            type: 'notify',
                            messages: [{
                                key: directRes?.key || { remoteJid: targetJid, fromMe: true, id: realWaId },
                                message: msgPayload,
                                messageTimestamp: directRes?.messageTimestamp || Math.floor(Date.now() / 1000),
                                status: 2
                            }]
                        });
                    } catch (epErr) {
                        console.warn(`[API Gateway] [send-media-url] Aviso ao sincronizar EventProcessor no Fast-Path:`, epErr.message);
                    }
                    try {
                        await retryWithBackoff(() =>
                            supabase.from('wa_outgoing_messages').insert({
                                instance_id: instanceId,
                                tenant_id: req.tenantId,
                                chat_jid: targetJid,
                                message_type: 'media',
                                body: caption || '',
                                media_url: mediaUrl,
                                response_type: finalResponseType,
                                options: {
                                    mimetype: detectedMime,
                                    fileName,
                                    messageType,
                                    ptt: Boolean(ptt),
                                    ptv: Boolean(ptv),
                                    viewOnce: Boolean(viewOnce),
                                    responseType: finalResponseType,
                                    whatsapp_message_id: realWaId
                                },
                                status: 'sent',
                                priority: 1,
                                updated_at: new Date().toISOString()
                            })
                        );
                    } catch {}
                });

                return res.json({
                    ok: true,
                    fastPath: true,
                    result: {
                        key: directRes?.key || { remoteJid: targetJid, fromMe: true, id: realWaId },
                        messageTimestamp: directRes?.messageTimestamp || Math.floor(Date.now() / 1000)
                    },
                    media_url: mediaUrl
                });
            } catch (fastUrlErr) {
                console.warn(`[API Gateway] [send-media-url] Fast-Path oscilou para ${instanceId} (${fastUrlErr.message}). Usando fila de contingência...`);
            }
        }

        const { data: newOutbox, error: outboxErr } = await retryWithBackoff(() =>
            supabase
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
                        ptv: Boolean(ptv),
                        viewOnce: Boolean(viewOnce),
                        responseType: finalResponseType
                    },
                    status: 'pending',
                    priority: 1
                })
                .select()
                .single()
        );

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

        // Roteamento transparente multi-nó (PROD-C <-> ALFA-A) para upload multipart de mídia
        if (await forwardInternalMultipartRequest(req, res, instanceId, 'media')) {
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
                console.log(`[API Gateway] [send-media] Fast-Fail 400: Instância ${instanceId} desconectada (status: ${instCheck?.status || 'desconhecido'}).`);
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

        // Inicia upload para Supabase Storage em paralelo com o envio direto no socket (reduz latência de mídia em 50%-70%)
        const ext = file.originalname.split('.').pop() || 'tmp';
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_');
        const storagePath = `tenant_${tenantId}/instance_${instanceId}/${jid}/${timestamp}_${safeName}`;

        const storageUploadPromise = supabase.storage
            .from('chat_media')
            .upload(storagePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            })
            .then(({ error: uploadErr }) => {
                if (uploadErr) {
                    console.warn('[send-media] Aviso no upload para Supabase Storage:', uploadErr.message || uploadErr);
                    return '';
                }
                const { data: publicUrlData } = supabase.storage.from('chat_media').getPublicUrl(storagePath);
                return publicUrlData?.publicUrl || '';
            })
            .catch((err) => {
                console.warn('[send-media] Exceção no upload para Supabase Storage:', err?.message || err);
                return '';
            });

        const isPttAudio = Boolean(req.body.ptt === 'true' || req.body.ptt === true || messageType === 'audio');
        const isPtvVideo = Boolean(req.body.ptv === 'true' || req.body.ptv === true);
        const isViewOnce = Boolean(req.body.viewOnce === 'true' || req.body.viewOnce === true);

        // FAST-PATH PARA MÍDIA: Se o socket está aberto na memória deste nó, envia o buffer diretamente via Baileys em paralelo ao Storage!
        const activeSock = sessionManager.getSocket(instanceId) || sessionManager.sessions.get(instanceId)?.sock;
        if (activeSock && isSocketOpen(activeSock)) {
            try {
                let targetJid = String(jid).trim();
                if (!targetJid.includes('@')) {
                    targetJid = `${targetJid.replace(/\D/g, '')}@s.whatsapp.net`;
                }
                let mediaPayload = {};
                if (messageType === 'image') {
                    mediaPayload = { image: file.buffer, caption: caption || '', mimetype: file.mimetype, ...(isViewOnce ? { viewOnce: true } : {}) };
                } else if (messageType === 'video') {
                    mediaPayload = { video: file.buffer, caption: isPtvVideo ? undefined : (caption || ''), mimetype: file.mimetype, ...(isPtvVideo ? { ptv: true } : {}), ...(isViewOnce ? { viewOnce: true } : {}) };
                } else if (messageType === 'audio') {
                    mediaPayload = { audio: file.buffer, mimetype: 'audio/ogg; codecs=opus', ptt: isPttAudio, ...(isViewOnce ? { viewOnce: true } : {}) };
                } else {
                    mediaPayload = { document: file.buffer, mimetype: file.mimetype || 'application/octet-stream', fileName: file.originalname || 'document', caption: caption || '' };
                }

                const sendFn = activeSock.originalSendMessage || activeSock.sendMessage.bind(activeSock);
                const [directRes, mediaUrl] = await Promise.all([
                    Promise.race([
                        sendFn(targetJid, mediaPayload),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_FASTPATH_MEDIA_SEND')), 25000))
                    ]),
                    storageUploadPromise
                ]);
                const realWaId = directRes?.key?.id || `FAST_${Date.now()}`;

                Promise.resolve().then(async () => {
                    try {
                        const { default: eventProcessor } = await import('../event-processor/index.js');
                        const msgPayload = directRes?.message || (
                            messageType === 'image' ? { imageMessage: { url: mediaUrl, mimetype: file.mimetype, caption: caption || '' } } :
                            messageType === 'video' ? { videoMessage: { url: mediaUrl, mimetype: file.mimetype, caption: caption || '' } } :
                            messageType === 'audio' ? { audioMessage: { url: mediaUrl, mimetype: 'audio/ogg; codecs=opus', ptt: isPttAudio } } :
                            { documentMessage: { url: mediaUrl, mimetype: file.mimetype, fileName: file.originalname, caption: caption || '' } }
                        );
                        await eventProcessor.handleMessageUpsert(tenantId, instanceId, activeSock, {
                            type: 'notify',
                            messages: [{
                                key: directRes?.key || { remoteJid: targetJid, fromMe: true, id: realWaId },
                                message: msgPayload,
                                messageTimestamp: directRes?.messageTimestamp || Math.floor(Date.now() / 1000),
                                status: 2
                            }]
                        });
                    } catch (epErr) {
                        console.warn(`[API Gateway] [send-media] Aviso ao sincronizar EventProcessor no Fast-Path:`, epErr.message);
                    }
                    try {
                        await supabase.from('wa_outgoing_messages').insert({
                            instance_id: instanceId,
                            tenant_id: tenantId,
                            chat_jid: targetJid,
                            message_type: 'media',
                            body: caption || '',
                            media_url: mediaUrl || 'sent_via_fastpath_buffer',
                            options: {
                                mimetype: file.mimetype,
                                fileName: file.originalname,
                                messageType: messageType,
                                ptt: isPttAudio,
                                responseType: 'STANDARD',
                                whatsapp_message_id: realWaId
                            },
                            status: 'sent',
                            priority: 1,
                            updated_at: new Date().toISOString()
                        });
                    } catch (auditErr) {}
                });

                return res.json({
                    ok: true,
                    fastPath: true,
                    result: {
                        key: directRes?.key || { remoteJid: targetJid, fromMe: true, id: realWaId },
                        messageTimestamp: directRes?.messageTimestamp || Math.floor(Date.now() / 1000)
                    },
                    media_url: mediaUrl
                });
            } catch (fastMediaErr) {
                console.warn(`[API Gateway] [send-media] Fast-Path de mídia oscilou para ${instanceId} (${fastMediaErr.message}). Usando fila de contingência...`);
            }
        }

        const mediaUrl = await storageUploadPromise;
        if (!mediaUrl) {
            return res.status(502).json({ error: 'Falha temporária no upload da mídia para o Storage e socket não disponível para envio direto. Tente novamente.' });
        }

        // Fallback: enfileira na fila de saída com retry resiliente
        const { data: newOutbox, error: outboxErr } = await retryWithBackoff(() =>
            supabase
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
                        ptv: isPtvVideo,
                        viewOnce: isViewOnce,
                        responseType: 'STANDARD'
                    },
                    status: 'pending',
                    priority: 1
                })
                .select()
                .single()
        );

        if (outboxErr) throw outboxErr;

        // Despacha a mensagem instantaneamente acordando o QueueProcessor apenas se pertencer a este nó
        if (isAllowedOnThisNode) {
            queueProcessor.trigger(tenantId, instanceId);
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
        console.error('Send media error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/instances/:instanceId/:action', requireTenant, async (req, res) => {
    try {
        const { instanceId, action } = req.params;
        if (await forwardInternalInstanceRequest(req, res, instanceId, { forwardAllStatuses: true, timeoutMs: 12000 })) {
            return;
        }
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
        if (await forwardInternalInstanceRequest(req, res, instanceId, { forwardAllStatuses: true })) {
            return;
        }

        const sock = sessionManager.getSocket(instanceId);
        const isSocketOpenStatus = sock ? isSocketOpen(sock) : false;
        const isSessionAuth = connectionSnapshot(instanceId).authenticated;

        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const { data, error } = await supabase
            .from('whatsapp_instances')
            .select('status, tenant_id, assigned_node_id, lease_until, phone_number, display_name, last_error, whatsapp_instance_runtime(qr_code, pairing_code)')
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
                    const isStartingNow = typeof sessionManager.isConnectingStateActive === 'function' ? sessionManager.isConnectingStateActive(instanceId) : sessionManager.connectingState.has(instanceId);
                    finalStatus = isStartingNow ? 'connecting' : 'disconnected';
                    const isAllowedHere = isInstanceAllowedForNode(instanceId, data.tenant_id);
                    const isLeaseExpiredOrLocal = !data.assigned_node_id || data.assigned_node_id === NODE_ID || !data.lease_until || new Date(data.lease_until).getTime() < Date.now();
                    if (isAllowedHere && isLeaseExpiredOrLocal) {
                        await supabase.from('whatsapp_instances')
                            .update({ status: finalStatus, updated_at: new Date().toISOString() })
                            .then(() => {}, () => {});
                    }
                }
            }

            const runtimeData = Array.isArray(data.whatsapp_instance_runtime)
                ? data.whatsapp_instance_runtime[0]
                : data.whatsapp_instance_runtime;
            const qrCode = runtimeData?.qr_code || null;
            const pairingCode = runtimeData?.pairing_code || null;
            const diagnostic = connectionSnapshot(instanceId);
            const hasActiveOrStartingSocket = Boolean(sock) || sessionManager.connectingState.has(instanceId) || pendingConnectionStarts.has(instanceId);
            const showQr = hasActiveOrStartingSocket && !diagnostic.authenticated && !diagnostic.handshakeProtected && !['error','expired'].includes(diagnostic.phase);
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
