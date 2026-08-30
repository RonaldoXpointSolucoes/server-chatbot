import express from 'express';
import { supabase, resolveTargetJid } from '../supabase.js';
import sessionManager from '../session-manager/index.js';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB

// Helper de obtenção de socket com retry, auto-reconnect e backoff inteligente
async function getSocketWithRetry(tenantId, instanceId, maxRetries = 3) {
    const delays = [0, 1000, 2000, 3000];
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (delays[attempt] > 0) {
            await new Promise(r => setTimeout(r, delays[attempt]));
        }
        const sock = await sessionManager.getSocketOrWake(tenantId, instanceId, true);
        if (sock) return sock;
    }

    // Se ainda assim o socket estiver offline na RAM, dispara tentativa de start ativa da sessão
    try {
        console.warn(`[API Gateway] Socket da instância ${instanceId} offline na RAM. Tentando start ativo da sessão...`);
        await sessionManager.startSession(tenantId, instanceId, false, true);
        await new Promise(r => setTimeout(r, 1500));
        const sock = sessionManager.getSocket(instanceId);
        if (sock) return sock;
    } catch (startErr) {
        console.warn(`[API Gateway] Aviso ao tentar start ativo de ${instanceId}:`, startErr.message);
    }

    return null;
}

// Middleware de autenticação genérica para rotas de instância já existente
const requireApiKey = async (req, res, next) => {
    const apiKey = req.headers['apikey'] || req.headers['globalapikey'];
    const originIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'N/A';

    if (!apiKey) {
        console.warn(`[API Gateway] [Auth] ❌ Falha 401: Header 'apikey' ausente | Rota: ${req.method} ${req.originalUrl} | IP: ${originIp}`);
        return res.status(401).json({ error: 'ApiKey header is missing.' });
    }

    // Se for rota de criação de instância, identificamos o inquilino por x-tenant-id
    if (req.path === '/instance/create') {
        const tenantId = req.headers['x-tenant-id'];
        if (!tenantId) {
            console.warn(`[API Gateway] [InstanceCreate] ❌ Falha 400: x-tenant-id ausente | IP: ${originIp}`);
            return res.status(400).json({ error: 'x-tenant-id header is required for instance creation.' });
        }

        const { data: comp } = await supabase
            .from('companies')
            .select('global_api_key')
            .eq('id', tenantId)
            .single();

        const globalKey = comp ? comp.global_api_key : process.env.GLOBAL_API_KEY;

        if (globalKey && apiKey !== globalKey) {
            console.warn(`[API Gateway] [Auth] ❌ Falha 401: Global ApiKey inválida para tenant ${tenantId} | IP: ${originIp}`);
            return res.status(401).json({ error: 'Unauthorized Global ApiKey.' });
        }
        return next();
    }

    // Nas rotas Evolution-like, a identificação é pelo {name} no caso de GET/DELETE /instance/{name}
    // E no body (instance) para POST /message/sendText
    const instanceName = req.params.name || req.body.instance;
    if (!instanceName) {
        console.warn(`[API Gateway] [Auth] ❌ Falha 400: Nome da instância ausente no path ou body ("instance") | Rota: ${req.method} ${req.originalUrl} | IP: ${originIp}`);
        return res.status(400).json({ error: 'Instance name is missing in URL path or body ("instance").' });
    }

    // Valida no Banco pelo Nome da Instância
    const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, tenant_id, display_name, phone_number, status, api_key')
        .eq('display_name', instanceName)
        .single();

    if (error || !data) {
        console.warn(`[API Gateway] [Auth] ❌ Falha 404: Instância "${instanceName}" não encontrada no banco | Rota: ${req.method} ${req.originalUrl} | IP: ${originIp}`);
        return res.status(404).json({ error: 'Instance not found.' });
    }

    // Busca a Global Api Key da empresa associada a esta instância específica
    const { data: comp } = await supabase
        .from('companies')
        .select('global_api_key')
        .eq('id', data.tenant_id)
        .single();

    const globalKey = comp ? comp.global_api_key : process.env.GLOBAL_API_KEY;

    // Autoriza se for a ApiKey da Instância OU a Global Api Key da Empresa
    if (data.api_key !== apiKey && globalKey !== apiKey) {
        console.warn(`[API Gateway] [Auth] ❌ Falha 401: ApiKey inválida para instância ${data.id} ("${instanceName}") | IP: ${originIp}`);
        return res.status(401).json({ error: 'Unauthorized ApiKey.' });
    }

    req.instanceData = data; // { id, tenant_id, display_name, phone_number, status }
    req.apiKeyMasked = apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : 'N/A';
    req.originIp = originIp;
    next();
};

// Middleware global removido para não inferir em sub-rotas
// router.use(requireApiKey);

/**
 * @swagger
 * /instance/create:
 *   post:
 *     tags: [Instance]
 *     summary: Criar ou Inicializar uma instância WhatsApp
 *     description: Cria uma nova instância atrelada ao tenant ou inicializa uma se usar o mesmo nome.
 *     parameters:
 *       - in: header
 *         name: apikey
 *         required: true
 *         description: Pode ser a "GLOBAL_API_KEY".
 *         schema:
 *           type: string
 *           example: "sk_cd31511433a155678ade719569eaa0ff"
 *       - in: header
 *         name: x-tenant-id
 *         required: true
 *         description: O UUID do Tenant no banco de dados.
 *         schema:
 *           type: string
 *           example: "8b1e427b-2321-4ea7-9d7e-90f7d5cbad21"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               instanceName:
 *                 type: string
 *                 example: "Teste"
 *     responses:
 *       200:
 *         description: Info da Instância e ApiKey Gerada
 *       400:
 *         description: Parâmetros ou headers faltando
 *       401:
 *         description: ApiKey Inválida
 *       500:
 *         description: Violação de Constraints (ex. x-tenant-id não existe)
 */
router.post('/instance/create', requireApiKey, async (req, res) => {
    try {
        const { instanceName } = req.body;
        const tenantId = req.headers['x-tenant-id'];
        
        if (!instanceName || !tenantId) return res.status(400).json({ error: 'instanceName body and x-tenant-id header required.' });

        // Checar se já existe
        const { data: existing } = await supabase.from('whatsapp_instances')
             .select('*').eq('display_name', instanceName).eq('tenant_id', tenantId).single();
             
        if (existing) {
             // Inicia se não estiver rodando (opcional, só p/ não dar erro de já existe)
             if (existing.status === 'offline') {
                 await supabase.from('whatsapp_instances').update({ status: 'connecting' }).eq('id', existing.id);
                 sessionManager.createSession(tenantId, existing.id, true).catch(console.error);
             }
             return res.json({ instance: existing });
        }

        const apiKey = crypto.randomBytes(32).toString('hex');

        // Cria nova
        const { data: newInstance, error } = await supabase.from('whatsapp_instances').insert({
            tenant_id: tenantId,
            display_name: instanceName,
            status: 'connecting',
            api_key: apiKey
        }).select('*').single();

        if (error) throw error;

        // Tenta bootar
        sessionManager.createSession(tenantId, newInstance.id, true).catch(console.error);

        res.json({
            instance: {
                instanceName: newInstance.display_name,
                instanceId: newInstance.id,
                status: newInstance.status
            },
            hash: {
                apikey: apiKey
            }
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /instance/{name}/qrcode:
 *   get:
 *     tags: [Instance]
 *     summary: Pegar QR Code
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: apikey
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Base64 do QR Code da instância no estado "connecting/qr_ready".
 */
router.get('/instance/:name/qrcode', requireApiKey, async (req, res) => {
    try {
        const { id, status } = req.instanceData;
        if (status === 'connected') return res.status(400).json({ error: 'Instance already connected.' });

        const { data, error } = await supabase.from('whatsapp_instance_runtime')
            .select('qr_code')
            .eq('instance_id', id)
            .single();

        if (error || !data || !data.qr_code) return res.status(404).json({ error: 'QR Code not available yet. Try again in a few seconds.' });

        return res.json({
            instance: req.params.name,
            qrcode: {
                base64: data.qr_code
            }
        });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /instance/{name}/status:
 *   get:
 *     tags: [Instance]
 *     summary: Pegar o status da conexão da instância (online, offline, qr_ready)
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: apikey
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/instance/:name/status', requireApiKey, async (req, res) => {
    res.json({
        instance: req.params.name,
        state: req.instanceData.status
    });
});

/**
 * @swagger
 * /instance/{name}:
 *   delete:
 *     tags: [Instance]
 *     summary: Excluir a instância (Realiza Logout e remove do DB)
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: apikey
 *         required: true
 *         schema:
 *           type: string
 */
router.delete('/instance/:name', requireApiKey, async (req, res) => {
    try {
        const { id, tenant_id } = req.instanceData;
        const sock = sessionManager.getSocket(id);
        if (sock) {
            try { await sock.logout(); } catch(e){}
        }
        await supabase.from('whatsapp_instances').delete().eq('id', id);
        sessionManager.sessions.delete(id);
        res.json({ status: 'SUCCESS', message: 'Instance deleted' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});
/**
 * @swagger
 * /message/sendText:
 *   post:
 *     tags: [Message]
 *     summary: Enviar mensagem de texto simples
 *     description: Envia uma mensagem de texto via WhatsApp através da instância autenticada. Compatível com o ecossistema Evolution API.
 *     parameters:
 *       - in: header
 *         name: apikey
 *         required: true
 *         schema:
 *           type: string
 *           example: "sk_cd31511433a155678ade719569eaa0ff"
 *         description: A ApiKey da instância ou a Global ApiKey da Empresa
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - number
 *               - text
 *             properties:
 *               number:
 *                 type: string
 *                 description: O número de destino com DDD e DDI (ex 5511975960999 ou 11975960999)
 *                 example: "5511975960999"
 *               text:
 *                 type: string
 *                 description: A mensagem de texto a ser enviada
 *                 example: "Olá! Esta é uma mensagem de teste enviada diretamente pelo Swagger UI da Antigravity 🚀"
 */
router.post('/message/sendText', requireApiKey, async (req, res) => {
    const { number, text } = req.body;
    const { id, tenant_id, display_name } = req.instanceData;
    const originIp = req.originIp || 'N/A';

    console.log(`[API Gateway] [sendText] 📨 Disparo Externo Recebido | Instância: ${id} ("${display_name}") | Destino: ${number} | Caracteres: ${text?.length || 0} | IP: ${originIp}`);

    try {
        if (!number || !text) {
            console.warn(`[API Gateway] [sendText] ❌ Falha 400: 'number' ou 'text' ausentes no body | Instância: ${id} ("${display_name}") | IP: ${originIp}`);
            return res.status(400).json({ error: 'number and text are required in body' });
        }

        const sock = await getSocketWithRetry(tenant_id, id, 3);
        if (!sock) {
            console.warn(`[API Gateway] [sendText] ⚠️ Falha 400: Socket Offline ou não autenticado na RAM | Instância: ${id} ("${display_name}") | Destino: ${number}`);
            return res.status(400).json({ error: 'WhatsApp socket offline or not authenticated for this instance.' });
        }
        
        const remoteJid = await resolveTargetJid(sock, number, tenant_id);
        let msgResult;
        try {
            msgResult = await sock.sendMessage(remoteJid, { text }, { isAutomation: true });
        } catch (sendErr) {
            console.warn(`[API Gateway] [sendText] Aviso na 1ª tentativa de envio (${sendErr.message}). Tentando obter socket atualizado e retentar...`);
            const retrySock = await getSocketWithRetry(tenant_id, id, 2);
            if (retrySock) {
                msgResult = await retrySock.sendMessage(remoteJid, { text }, { isAutomation: true });
            } else {
                throw sendErr;
            }
        }

        try {
            const { EventProcessor } = await import('../event-processor/index.js');
            if (EventProcessor?.automationMessagesCache && msgResult?.key?.id) {
                EventProcessor.automationMessagesCache.set(`${id}_${msgResult.key.id}`, true);
                setTimeout(() => EventProcessor.automationMessagesCache.delete(`${id}_${msgResult.key.id}`), 60000);
            }
        } catch(e) {}

        console.log(`[API Gateway] [sendText] ✅ Sucesso no Envio | Instância: ${id} ("${display_name}") | Destino: ${remoteJid} | MsgID: ${msgResult?.key?.id}`);

        res.json({
            key: msgResult.key,
            message: msgResult.message,
            messageTimestamp: msgResult.messageTimestamp,
            status: "PENDING"
        });
    } catch (e) {
        console.error(`[API Gateway] [sendText] ❌ Exceção 500 ao Enviar Mensagem: ${e.message} | Instância: ${id} ("${display_name}") | Destino: ${number} | Stack: ${e.stack?.split('\n')[1] || ''}`);
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /message/sendMedia:
 *   post:
 *     tags: [Message]
 *     summary: Enviar mídia por arquivo (Multipart)
 *     description: Aceita document, audio, video ou image. Converte áudios .webm para .ogg compatível com celular e hospeda no Supabase antes de disparar.
 *     parameters:
 *       - in: header
 *         name: apikey
 *         required: true
 *         schema:
 *           type: string
 *           example: "sk_cd31511433a155678ade719569eaa0ff"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               number:
 *                 type: string
 *                 example: "5511975960999"
 *               mediatype:
 *                 type: string
 *                 description: audio, video, image, document
 *                 example: "image"
 *               instance:
 *                 type: string
 *                 example: "Teste"
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Mídia enviada e hospedada com sucesso. Retorna URL Supabase.
 *       400:
 *         description: Arquivo ou Socket faltando/offline.
 *       401:
 *         description: Autenticação inválida.
 *       500:
 *         description: Erros de armazenamento ou ffmpeg.
 */
router.post('/message/sendMedia', requireApiKey, upload.single('file'), async (req, res) => {
    const { number, mediatype, instance } = req.body;
    const { id, tenant_id, display_name } = req.instanceData;
    const file = req.file;
    const originIp = req.originIp || 'N/A';

    console.log(`[API Gateway] [sendMedia] 📨 Disparo de Mídia Recebido | Instância: ${id} ("${display_name}") | Tipo: ${mediatype} | Destino: ${number} | Arquivo: ${file?.originalname || 'N/A'} | IP: ${originIp}`);

    try {
        if (!file || !number || !mediatype || !instance) {
            console.warn(`[API Gateway] [sendMedia] ❌ Falha 400: Parâmetros obrigatórios ausentes | Instância: ${id} ("${display_name}") | IP: ${originIp}`);
            return res.status(400).json({ error: 'Missing file, number, mediatype or instance' });
        }

        const sock = await getSocketWithRetry(tenant_id, id, 3);
        if (!sock) {
            console.error(`[API Gateway] [sendMedia] ❌ Falha 400: Socket Offline na RAM | Instância: ${id} ("${display_name}") | Destino: ${number}`);
            return res.status(400).json({ error: 'Socket offline or not authenticated' });
        }

        const remoteJid = await resolveTargetJid(sock, number, tenant_id);
        const timestamp = Date.now();
        
        // Conversão WEBM p/ AudioNativo se for Audio
        if (mediatype === 'audio' && (file.mimetype.includes('webm') || file.originalname.endsWith('.webm'))) {
            try {
                const tempInput = path.join(os.tmpdir(), `in_${timestamp}.webm`);
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
                        .on('end', resolve)
                        .on('error', reject)
                        .save(tempOutput);
                });
                
                file.buffer = fs.readFileSync(tempOutput);
                file.mimetype = 'audio/ogg; codecs=opus';
                
                fs.unlinkSync(tempInput);
                fs.unlinkSync(tempOutput);
            } catch (e) {
                console.error("[API Gateway] Erro na conversão de audio ffmpeg:", e);
            }
        }

        // Upload do arquivo para o bucket do Supabase Storage
        const fileExt = file.originalname ? file.originalname.split('.').pop() : (mediatype === 'audio' ? 'ogg' : 'bin');
        const fileName = `${tenant_id}/${id}/${timestamp}_${crypto.randomBytes(4).toString('hex')}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: true
            });

        if (uploadError) {
            console.error("[API Gateway] Erro no upload Supabase Storage:", uploadError);
            return res.status(500).json({ error: 'Failed to upload media to storage', details: uploadError.message });
        }

        const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(fileName);
        const mediaUrl = publicUrlData.publicUrl;

        // Disparo Baileys de acordo com o mediatype
        let messagePayload = {};
        const isPtt = req.body.ptt === true || req.body.ptt === 'true' || mediatype === 'audio';

        if (mediatype === 'image') {
            messagePayload = { image: file.buffer, caption: req.body.caption || '' };
        } else if (mediatype === 'video') {
            messagePayload = { video: file.buffer, caption: req.body.caption || '' };
        } else if (mediatype === 'audio') {
            messagePayload = { audio: file.buffer, mimetype: 'audio/ogg; codecs=opus', ptt: isPtt };
        } else if (mediatype === 'document') {
            messagePayload = { 
                document: file.buffer, 
                mimetype: file.mimetype || 'application/octet-stream', 
                fileName: file.originalname || 'document',
                caption: req.body.caption || '' 
            };
        } else {
            return res.status(400).json({ error: `Unsupported mediatype: ${mediatype}` });
        }

        let msgResult;
        try {
            msgResult = await sock.sendMessage(remoteJid, messagePayload, { isAutomation: true });
        } catch (sendErr) {
            console.warn(`[API Gateway] [sendMedia] Aviso na 1ª tentativa (${sendErr.message}). Retentando com socket renovado...`);
            const retrySock = await getSocketWithRetry(tenant_id, id, 2);
            if (retrySock) {
                msgResult = await retrySock.sendMessage(remoteJid, messagePayload, { isAutomation: true });
            } else {
                throw sendErr;
            }
        }

        try {
            const { EventProcessor } = await import('../event-processor/index.js');
            if (EventProcessor?.automationMessagesCache && msgResult?.key?.id) {
                EventProcessor.automationMessagesCache.set(`${id}_${msgResult.key.id}`, true);
                setTimeout(() => EventProcessor.automationMessagesCache.delete(`${id}_${msgResult.key.id}`), 60000);
            }
        } catch(e) {}

        console.log(`[API Gateway] [sendMedia] ✅ Sucesso no Envio | Instância: ${id} ("${display_name}") | Destino: ${remoteJid} | MsgID: ${msgResult?.key?.id} | URL: ${mediaUrl}`);

        res.json({
            key: msgResult.key,
            message: msgResult.message,
            messageTimestamp: msgResult.messageTimestamp,
            mediaUrl: mediaUrl,
            status: "PENDING"
        });
    } catch (e) {
        console.error(`[API Gateway] [sendMedia] ❌ Exceção 500: ${e.message} | Instância: ${id} ("${display_name}") | Destino: ${number}`);
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /message/sendLocation:
 *   post:
 *     tags: [Message]
 *     summary: Enviar Localização (Coordenadas)
 *     parameters:
 *       - in: header
 *         name: apikey
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               number:
 *                 type: string
 *               instance:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               name:
 *                 type: string
 *               address:
 *                 type: string
 *     responses:
 *       200:
 *         description: Localização enviada com sucesso
 *  */
router.post('/message/sendLocation', requireApiKey, async (req, res) => {
    const { number, latitude, longitude, name, address } = req.body;
    const { id, tenant_id, display_name } = req.instanceData;
    const originIp = req.originIp || 'N/A';

    console.log(`[API Gateway] [sendLocation] 📨 Disparo de Localização Recebido | Instância: ${id} ("${display_name}") | Destino: ${number} | IP: ${originIp}`);

    try {
        if (!number || !latitude || !longitude) {
            console.warn(`[API Gateway] [sendLocation] ❌ Falha 400: Parâmetros obrigatórios ausentes | Instância: ${id}`);
            return res.status(400).json({ error: 'number, latitude and longitude required' });
        }

        const sock = await getSocketWithRetry(tenant_id, id, 3);
        if (!sock) {
            console.error(`[API Gateway] [sendLocation] ❌ Falha 400: Socket Offline na RAM | Instância: ${id} ("${display_name}") | Destino: ${number}`);
            return res.status(400).json({ error: 'Socket offline or not authenticated' });
        }

        const remoteJid = await resolveTargetJid(sock, number, tenant_id);
        const msgResult = await sock.sendMessage(remoteJid, {
            location: { degreesLatitude: latitude, degreesLongitude: longitude, name, address }
        }, { isAutomation: true });

        try {
            const { EventProcessor } = await import('../event-processor/index.js');
            if (EventProcessor?.automationMessagesCache && msgResult?.key?.id) {
                EventProcessor.automationMessagesCache.set(`${id}_${msgResult.key.id}`, true);
                setTimeout(() => EventProcessor.automationMessagesCache.delete(`${id}_${msgResult.key.id}`), 60000);
            }
        } catch(e) {}

        console.log(`[API Gateway] [sendLocation] ✅ Sucesso no Envio | Instância: ${id} | Destino: ${remoteJid} | MsgID: ${msgResult?.key?.id}`);

        res.json({ key: msgResult.key, status: "PENDING" });
    } catch (e) {
        console.error(`[API Gateway] [sendLocation] ❌ Exceção 500: ${e.message} | Instância: ${id} | Destino: ${number}`);
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /message/sendContact:
 *   post:
 *     tags: [Message]
 *     summary: Enviar Contato (vCard)
 *     parameters:
 *       - in: header
 *         name: apikey
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               number:
 *                 type: string
 *               instance:
 *                 type: string
 *               contactName:
 *                 type: string
 *               contactNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contato enviado com sucesso
 *  */
router.post('/message/sendContact', requireApiKey, async (req, res) => {
    const { number, contactName, contactNumber } = req.body;
    const { id, tenant_id, display_name } = req.instanceData;
    const originIp = req.originIp || 'N/A';

    console.log(`[API Gateway] [sendContact] 📨 Disparo de Contato Recebido | Instância: ${id} ("${display_name}") | Destino: ${number} | Contato: ${contactName} (${contactNumber}) | IP: ${originIp}`);

    try {
        if (!number || !contactName || !contactNumber) {
            console.warn(`[API Gateway] [sendContact] ❌ Falha 400: Parâmetros ausentes | Instância: ${id}`);
            return res.status(400).json({ error: 'number, contactName and contactNumber required' });
        }

        const sock = await getSocketWithRetry(tenant_id, id, 3);
        if (!sock) {
            console.error(`[API Gateway] [sendContact] ❌ Falha 400: Socket Offline na RAM | Instância: ${id} ("${display_name}") | Destino: ${number}`);
            return res.status(400).json({ error: 'Socket offline or not authenticated' });
        }

        const remoteJid = await resolveTargetJid(sock, number, tenant_id);
        
        // Formatar o vCard no padrão WhatsApp
        const formattedNumber = contactNumber.replace(/\D/g, '');
        const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL;type=CELL;type=VOICE;waid=${formattedNumber}:+${formattedNumber}\nEND:VCARD`;
        
        const msgResult = await sock.sendMessage(remoteJid, {
            contacts: {
                displayName: contactName,
                contacts: [{ vcard }]
            }
        }, { isAutomation: true });

        try {
            const { EventProcessor } = await import('../event-processor/index.js');
            if (EventProcessor?.automationMessagesCache && msgResult?.key?.id) {
                EventProcessor.automationMessagesCache.set(`${id}_${msgResult.key.id}`, true);
                setTimeout(() => EventProcessor.automationMessagesCache.delete(`${id}_${msgResult.key.id}`), 60000);
            }
        } catch(e) {}

        console.log(`[API Gateway] [sendContact] ✅ Sucesso no Envio | Instância: ${id} | Destino: ${remoteJid} | MsgID: ${msgResult?.key?.id}`);

        res.json({ key: msgResult.key, status: "PENDING" });
    } catch (e) {
        console.error(`[API Gateway] [sendContact] ❌ Exceção 500: ${e.message} | Instância: ${id} | Destino: ${number}`);
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /message/sendReaction:
 *   post:
 *     tags: [Message]
 *     summary: Reagir a uma mensagem
 *     parameters:
 *       - in: header
 *         name: apikey
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               number:
 *                 type: string
 *               instance:
 *                 type: string
 *               messageId:
 *                 type: string
 *                 description: O ID da mensagem que será reagida
 *               reaction:
 *                 type: string
 *                 description: O emoji da reação
 *                 example: "❤️"
 *               fromMe:
 *                 type: boolean
 *                 description: Informe "true" se a mensagem original foi enviada pela sua própria instância (você). Padrão é false (recebida do contato).
 *     responses:
 *       200:
 *         description: Reação enviada com sucesso
 *  */
router.post('/message/sendReaction', requireApiKey, async (req, res) => {
    const { number, messageId, reaction, fromMe = false } = req.body;
    const { id, tenant_id, display_name } = req.instanceData;
    const originIp = req.originIp || 'N/A';

    console.log(`[API Gateway] [sendReaction] 📨 Disparo de Reação Recebido | Instância: ${id} ("${display_name}") | Emoji: ${reaction} | Destino: ${number} | IP: ${originIp}`);

    try {
        if (!number || !messageId || !reaction) {
            console.warn(`[API Gateway] [sendReaction] ❌ Falha 400: Parâmetros ausentes | Instância: ${id}`);
            return res.status(400).json({ error: 'number, messageId and reaction required' });
        }

        const sock = await getSocketWithRetry(tenant_id, id, 3);
        if (!sock) {
            console.error(`[API Gateway] [sendReaction] ❌ Falha 400: Socket Offline na RAM | Instância: ${id} ("${display_name}") | Destino: ${number}`);
            return res.status(400).json({ error: 'Socket offline or not authenticated' });
        }

        const remoteJid = await resolveTargetJid(sock, number, tenant_id);
        
        const msgResult = await sock.sendMessage(remoteJid, {
            react: {
                text: reaction,
                key: { id: messageId, remoteJid, fromMe }
            }
        }, { isAutomation: true });

        try {
            const { EventProcessor } = await import('../event-processor/index.js');
            if (EventProcessor?.automationMessagesCache && msgResult?.key?.id) {
                EventProcessor.automationMessagesCache.set(`${id}_${msgResult.key.id}`, true);
                setTimeout(() => EventProcessor.automationMessagesCache.delete(`${id}_${msgResult.key.id}`), 60000);
            }
        } catch(e) {}

        console.log(`[API Gateway] [sendReaction] ✅ Sucesso no Envio | Instância: ${id} | Destino: ${remoteJid} | MsgID: ${msgResult?.key?.id}`);

        res.json({ key: msgResult.key, status: "PENDING" });
    } catch (e) {
        console.error(`[API Gateway] [sendReaction] ❌ Exceção 500: ${e.message} | Instância: ${id} | Destino: ${number}`);
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /instance/{name}/restart:
 *   put:
 *     tags: [Instance]
 *     summary: Reiniciar a Instância
 *     description: Derruba o socket atual e reconecta automaticamente sem precisar ler o QR Code novamente (se já estiver logado).
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: apikey
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Instância reiniciada
 */
router.put('/instance/:name/restart', requireApiKey, async (req, res) => {
    try {
        const { id, tenant_id } = req.instanceData;
        const sock = await sessionManager.getSocketOrWake(tenant_id, id);
        
        if (sock) {
            sock.ws.close();
            await new Promise(r => setTimeout(r, 1000));
        }
        
        // Chama a inicialização
        sessionManager.createSession(tenant_id, id, true).catch(console.error);

        res.json({ status: 'SUCCESS', error: false, message: 'Instance restarting' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /instance/{name}/chats:
 *   get:
 *     tags: [Instance]
 *     summary: Obter a lista de conversas da instância
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *           example: "Teste"
 *       - in: header
 *         name: apikey
 *         required: true
 *         schema:
 *           type: string
 *           example: "sk_cd31511433a155678ade719569eaa0ff"
 *     responses:
 *       200:
 *         description: Lista de conversas com dados do contato
 *       400:
 *         description: Parâmetros Ausentes
 *       401:
 *         description: ApiKey Inválida
 *       500:
 *         description: Erro interno de processamento
 */
router.get('/instance/:name/chats', requireApiKey, async (req, res) => {
    try {
        const { id } = req.instanceData;
        
        const { data, error } = await supabase
            .from('conversations')
            .select(`
                *,
                contact:contacts(*)
            `)
            .eq('instance_id', id)
            .order('last_message_at', { ascending: false });

        if (error) throw error;
        res.json({ chats: data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /instance/{name}/contacts:
 *   get:
 *     tags: [Instance]
 *     summary: Obter a lista de contatos da instância
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *           example: "Teste"
 *       - in: header
 *         name: apikey
 *         required: true
 *         schema:
 *           type: string
 *           example: "sk_cd31511433a155678ade719569eaa0ff"
 *     responses:
 *       200:
 *         description: Lista de contatos da instância
 *       400:
 *         description: Parâmetros Ausentes
 *       401:
 *         description: ApiKey Inválida
 *       500:
 *         description: Erro interno de processamento
 */
router.get('/instance/:name/contacts', requireApiKey, async (req, res) => {
    try {
        const { id } = req.instanceData;
        
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('instance_id', id)
            .order('name', { ascending: true, nullsFirst: false });

        if (error) throw error;
        res.json({ contacts: data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Rotas de compatibilidade para integradores de Bots (Typebot, EvolutionBot, Dify, Flowise, n8n, etc.)
router.all([
    '/typebot/changeStatus/:name?',
    '/typebot/:action?/:name?',
    '/evolutionBot/changeStatus/:name?',
    '/evolutionBot/:action?/:name?',
    '/openai/changeStatus/:name?',
    '/openai/:action?/:name?',
    '/dify/changeStatus/:name?',
    '/dify/:action?/:name?',
    '/flowise/changeStatus/:name?',
    '/flowise/:action?/:name?',
    '/n8n/changeStatus/:name?',
    '/n8n/:action?/:name?',
    '/evoai/changeStatus/:name?',
    '/evoai/:action?/:name?'
], (req, res) => {
    res.status(200).json({ status: 'SUCCESS', message: 'Bot status handled successfully' });
});

export default router;
