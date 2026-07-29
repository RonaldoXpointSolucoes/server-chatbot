import express from 'express';
import sessionManager from '../session-manager/index.js';
import queueProcessor from '../session-manager/queue-processor.js';
import { supabase, NODE_ID } from '../supabase.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB
const router = express.Router();

const requireTenant = async (req, res, next) => {
    const tenantId = req.headers['x-tenant-id'];
    const apiKey = req.headers['apikey'];

    if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header missing' });
    req.tenantId = tenantId;

    const instanceId = req.params.instanceId;
    if (instanceId) {
        const { data, error } = await supabase
            .from('whatsapp_instances')
            .select('api_key')
            .eq('id', instanceId)
            .eq('tenant_id', tenantId)
            .single();
            
        if (error || !data) return res.status(404).json({ error: 'Instance not found or unauthorized' });
        
        // Se a chamada enviar a chave API (integração externa), valida com a api_key da instância.
        if (apiKey && data.api_key) {
             if (data.api_key !== apiKey) return res.status(401).json({ error: 'Invalid API Key provided for this instance' });
        }
    }

    next();
};

router.post('/instances/:instanceId/connect', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const tenantId = req.tenantId;

        // Reset total de tentativas e timers de reconexão antigos em memória
        sessionManager.reconnectAttempts.delete(instanceId);
        sessionManager.conflictAttempts.delete(instanceId);
        sessionManager.authenticatedSessions.delete(instanceId);
        sessionManager.pairingPendingSync.delete(instanceId);
        if (sessionManager.reconnectingTimers.has(instanceId)) {
            clearTimeout(sessionManager.reconnectingTimers.get(instanceId));
            sessionManager.reconnectingTimers.delete(instanceId);
        }

        if (sessionManager.sessions.has(instanceId)) {
            console.log(`[API] /connect chamado, mas a sessão ${instanceId} já estava em memória. Forçando fechamento prévio.`);
            await sessionManager.closeSession(instanceId);
            if (sessionManager.connectingState.has(instanceId)) {
                 sessionManager.connectingState.delete(instanceId);
            }
        }
        
        // Ensure absolutely fresh credentials to force new QR Code generation
        console.log(`[API] Limpando credenciais antigas do DB e RAM para a instância ${instanceId} forçar novo QR Code...`);
        const { sessionCaches } = await import('../session-manager/auth.js');
        if (sessionCaches && sessionCaches.has(instanceId)) {
            sessionCaches.delete(instanceId);
        }
        await supabase.from('wa_auth_credentials').delete().eq('instance_id', instanceId);
        await supabase.from('wa_auth_keys').delete().eq('instance_id', instanceId);
        await supabase.from('whatsapp_instance_runtime').delete().eq('instance_id', instanceId);

        await supabase.from('whatsapp_instances')
            .update({ status: 'connecting', reconnect_attempts: 0, last_error: null, assigned_node_id: NODE_ID })
            .eq('id', instanceId)
            .eq('tenant_id', tenantId);

        sessionManager.createSession(tenantId, instanceId).catch(console.error);

        res.json({ ok: true, status: 'connecting', instanceId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/instances/:instanceId/pairing-code', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { phoneNumber } = req.body;
        const tenantId = req.tenantId;

        if (!phoneNumber) return res.status(400).json({ error: 'Número de telefone obrigatório' });
        const cleanPhone = phoneNumber.replace(/\D/g, '');

        if (sessionManager.sessions.has(instanceId)) {
            console.log(`[API] /pairing-code chamado, mas a sessão ${instanceId} já estava em memória. Forçando fechamento prévio.`);
            await sessionManager.closeSession(instanceId);
            if (sessionManager.connectingState.has(instanceId)) {
                 sessionManager.connectingState.delete(instanceId);
            }
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
            .update({ status: 'connecting', last_error: null })
            .eq('id', instanceId)
            .eq('tenant_id', tenantId);

        console.log(`[API] Criando sessão Baileys para Pairing Code...`);
        const activeSock = await sessionManager.createSession(tenantId, instanceId);

        if (!activeSock) {
            return res.status(500).json({ error: 'Não foi possível inicializar a conexão do WhatsApp para gerar o código.' });
        }

        // Aguarda a inicialização do soquete (Websocket estar pronto)
        let attempts = 0;
        let isReady = false;
        while (attempts < 15) {
            if (activeSock.ws && (activeSock.ws.isOpen || activeSock.ws.readyState === 1)) {
                isReady = true;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }

        if (!isReady) {
            return res.status(500).json({ error: 'A conexão com o WhatsApp foi criada, mas demorou a responder. Tente novamente.' });
        }

        console.log(`[API] Solicitando Pairing Code para o número ${cleanPhone}...`);
        const code = await activeSock.requestPairingCode(cleanPhone);
        
        res.json({ ok: true, code, instanceId });
    } catch (e) {
        console.error('[API/pairing-code] Erro ao gerar pairing code:', e.message);
        res.status(500).json({ error: e.message });
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

router.post('/instances/:instanceId/invoke', requireTenant, async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { method, args } = req.body;
        
        const sock = await sessionManager.getSocketOrWake(req.tenantId, instanceId);
        if(!sock) return res.status(400).json({ error: 'Socket offline' });

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

        if (method === 'sendMessage') {
            const jid = args[0];
            const content = args[1];
            
            // Se for uma edição de mensagem (contém a chave 'edit'), não insere na fila de saída (wa_outgoing_messages)
            // e deixa passar direto para o socket do Baileys para evitar duplicar a mensagem
            if (content && content.edit) {
                // Passa direto
            } else {
                let messageType = 'text';
            let body = content.text || '';
            let mediaUrl = null;

            if (content.image || content.video || content.audio || content.document) {
                messageType = 'media';
                const mediaObj = content.image || content.video || content.audio || content.document;
                mediaUrl = mediaObj.url;
                body = content.caption || '';
            }

            const { data: newOutbox, error: outboxErr } = await supabase
                .from('wa_outgoing_messages')
                .insert({
                    instance_id: instanceId,
                    tenant_id: req.tenantId,
                    chat_jid: jid,
                    message_type: messageType,
                    body: body,
                    media_url: mediaUrl,
                    status: 'pending',
                    priority: 1
                })
                .select()
                .single();

            if (outboxErr) throw outboxErr;

            // Despacha a mensagem instantaneamente acordando o QueueProcessor
            queueProcessor.trigger(req.tenantId, instanceId);

            const mockId = `EDGE_${newOutbox.id.replace(/-/g, '')}`;
            return res.json({ 
                ok: true, 
                result: {
                    key: {
                        remoteJid: jid,
                        fromMe: true,
                        id: mockId
                    },
                    messageTimestamp: Math.floor(Date.now() / 1000)
                }
            });
            }
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
        const sock = await sessionManager.getSocketOrWake(req.tenantId, instanceId);
        if (!sock) return res.status(400).json({ error: 'Socket offline' });

        const { mediaUrl, mimetype, fileName, jid, caption, messageType, ptt } = req.body;

        if (!mediaUrl || !jid || !messageType) {
            return res.status(400).json({ error: 'Missing mediaUrl, jid or messageType' });
        }

        console.log(`[send-media-url] Queueing ${messageType} from URL: ${mediaUrl} to ${jid}`);

        const { data: newOutbox, error: outboxErr } = await supabase
            .from('wa_outgoing_messages')
            .insert({
                instance_id: instanceId,
                tenant_id: req.tenantId,
                chat_jid: jid,
                message_type: 'media',
                body: caption || '',
                media_url: mediaUrl,
                status: 'pending',
                priority: 1
            })
            .select()
            .single();

        if (outboxErr) throw outboxErr;

        // Despacha a mensagem instantaneamente acordando o QueueProcessor
        queueProcessor.trigger(req.tenantId, instanceId);

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
        const sock = await sessionManager.getSocketOrWake(req.tenantId, instanceId);
        if (!sock) return res.status(400).json({ error: 'Socket offline' });

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
                        .audioFrequency(16000)
                        .outputOptions([
                            '-avoid_negative_ts make_zero',
                            '-map_metadata -1',
                            '-b:a 24k',
                            '-vbr on',
                            '-compression_level 10',
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
                file.mimetype = 'audio/ogg; codecs=opus';
                
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
        const { data: newOutbox, error: outboxErr } = await supabase
            .from('wa_outgoing_messages')
            .insert({
                instance_id: instanceId,
                tenant_id: tenantId,
                chat_jid: jid,
                message_type: 'media',
                body: caption || '',
                media_url: mediaUrl,
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
            sessionManager.createSession(req.tenantId, instanceId).catch(console.error);
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
        const { data, error } = await supabase
            .from('whatsapp_instances')
            .select('status, phone_number, display_name, last_error, whatsapp_instance_runtime(qr_code, pairing_code)')
            .eq('id', instanceId)
            .single();

        if (error) throw error;
        
        if (data) {
            const qrCode = data.whatsapp_instance_runtime?.qr_code || null;
            const pairingCode = data.whatsapp_instance_runtime?.pairing_code || null;
            return res.json({
                data: {
                    ...data,
                    qr_code: qrCode,
                    qr_base64: qrCode,
                    pairing_code: pairingCode
                }
            });
        }
        res.json({ data: null });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
