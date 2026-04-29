import express from 'express';
import { supabase } from '../supabase.js';
import sessionManager from '../session-manager/index.js';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

// Middleware de autenticação genérica para rotas de instância já existente
const requireApiKey = async (req, res, next) => {
    const apiKey = req.headers['apikey'] || req.headers['globalapikey'];
    if (!apiKey) return res.status(401).json({ error: 'ApiKey header is missing.' });

    // Busca a Global Api Key
    const { data: comp } = await supabase.from('companies').select('global_api_key').single();
    const globalKey = comp ? comp.global_api_key : process.env.GLOBAL_API_KEY;

    if (req.path === '/instance/create') {
        if (globalKey && apiKey !== globalKey) {
            return res.status(401).json({ error: 'Unauthorized Global ApiKey.' });
        }
        return next();
    }

    // Nas rotas Evolution-like, a identificação é pelo {name} no caso de GET/DELETE /instance/{name}
    // E no body (instance) para POST /message/sendText
    const instanceName = req.params.name || req.body.instance;
    if (!instanceName) {
        return res.status(400).json({ error: 'Instance name is missing in URL path or body ("instance").' });
    }

    // Valida no Banco pela ApiKey e Nome
    const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, tenant_id, status, api_key')
        .eq('display_name', instanceName)
        .single();

    if (error || !data) {
        return res.status(404).json({ error: 'Instance not found.' });
    }

    // Autoriza se for a ApiKey da Instância OU a Global Api Key
    if (data.api_key !== apiKey && globalKey !== apiKey) {
        return res.status(401).json({ error: 'Unauthorized ApiKey.' });
    }

    req.instanceData = data; // { id, tenant_id, status }
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
                 sessionManager.createSession(tenantId, existing.id).catch(console.error);
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
        sessionManager.createSession(tenantId, newInstance.id).catch(console.error);

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
        const { id } = req.instanceData;
        const sock = sessionManager.getSocket(id);
        if (sock) {
            try { await sock.logout(); } catch(e){}
        }
        await sessionManager.closeSession(id);
        await supabase.from('whatsapp_instances').delete().eq('id', id);
        
        res.json({ status: 'SUCCESS', error: false, message: 'Instance deleted' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /message/sendText:
 *   post:
 *     tags: [Message]
 *     summary: Enviar texto
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               number:
 *                 type: string
 *                 description: O número de telefone com DDI e DDD
 *                 example: "5511975960999"
 *               text:
 *                 type: string
 *                 description: A mensagem de texto a ser enviada
 *                 example: "Olá! Esta é uma mensagem de teste enviada diretamente pelo Swagger UI da Antigravity 🚀"
 *               instance:
 *                 type: string
 *                 description: O nome exato da instância de envio
 *                 example: "Teste"
 *     responses:
 *       200:
 *         description: Mensagem postada na fila do Socket
 *       400:
 *         description: Socket Offline ou Parâmetros Ausentes
 *       401:
 *         description: ApiKey Inválida ou Nome da Instância não encontrado
 *       500:
 *         description: Erro interno de processamento
 */
router.post('/message/sendText', requireApiKey, async (req, res) => {
    try {
        const { number, text } = req.body;
        const { id, tenant_id } = req.instanceData;
        
        if (!number || !text) return res.status(400).json({ error: 'number and text are required in body' });

        const sock = sessionManager.getSocket(id);
        if (!sock) return res.status(400).json({ error: 'WhatsApp socket offline for this instance.' });
        
        const remoteJid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        const msgResult = await sock.sendMessage(remoteJid, { text });

        try {
            const { EventProcessor } = await import('../event-processor/index.js');
            if (EventProcessor?.humanMessagesCache && msgResult?.key?.id) {
                EventProcessor.humanMessagesCache.set(msgResult.key.id, true);
                setTimeout(() => EventProcessor.humanMessagesCache.delete(msgResult.key.id), 60000);
            }
        } catch(e) {}

        // A mensagem também será processada no `messages.upsert` de forma nativa e registrada no front.
        res.json({
            key: msgResult.key,
            message: msgResult.message,
            messageTimestamp: msgResult.messageTimestamp,
            status: "PENDING"
        });
    } catch (e) {
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
    try {
        const { number, mediatype, instance } = req.body;
        const { id, tenant_id } = req.instanceData;
        const file = req.file;

        if (!file || !number || !mediatype || !instance) {
            return res.status(400).json({ error: 'Missing file, number, mediatype or instance' });
        }

        const sock = sessionManager.getSocket(id);
        if (!sock) return res.status(400).json({ error: 'Socket offline' });

        const remoteJid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
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
                        .format('ogg')
                        .on('end', resolve)
                        .on('error', reject)
                        .save(tempOutput);
                });
                
                file.buffer = fs.readFileSync(tempOutput);
                file.mimetype = 'audio/ogg; codecs=opus';
                file.originalname = file.originalname.replace('.webm', '.ogg');
                try { fs.unlinkSync(tempInput); fs.unlinkSync(tempOutput); } catch(e){}
            } catch(err) {
                 console.error('Falha conversao opus', err);
            }
        }

        // Upload to Supabase Storage First
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_');
        const storagePath = `tenant_${tenant_id}/instance_${id}/${remoteJid}/${timestamp}_${safeName}`;

        const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('chat_media')
            .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });

        let mediaUrl = '';
        if (!uploadErr) {
            const { data: publicUrlData } = supabase.storage.from('chat_media').getPublicUrl(storagePath);
            mediaUrl = publicUrlData.publicUrl;
        }

        // Prepare message payload
        const sendPayload = {};
        if (mediatype === 'image') sendPayload.image = file.buffer;
        else if (mediatype === 'video') sendPayload.video = file.buffer;
        else if (mediatype === 'audio') { sendPayload.audio = file.buffer; sendPayload.mimetype = file.mimetype; sendPayload.ptt = true; } // ptt=true force audio note
        else if (mediatype === 'document') { sendPayload.document = file.buffer; sendPayload.mimetype = file.mimetype; sendPayload.fileName = file.originalname; }
        else return res.status(400).json({ error: 'Unsupported mediatype' });

        const msgResult = await sock.sendMessage(remoteJid, sendPayload);

        // Armazena URL no eventProcessor (opcional, só p renderizar imagem no UI frontend se ele assinar o socket interno)
        try {
            const { EventProcessor } = await import('../event-processor/index.js');
            if (EventProcessor?.pendingMediaCache && msgResult?.key?.id) {
                EventProcessor.pendingMediaCache.set(msgResult.key.id, mediaUrl);
                setTimeout(() => EventProcessor.pendingMediaCache.delete(msgResult.key.id), 60000);
            }
            if (EventProcessor?.humanMessagesCache && msgResult?.key?.id) {
                EventProcessor.humanMessagesCache.set(msgResult.key.id, true);
                setTimeout(() => EventProcessor.humanMessagesCache.delete(msgResult.key.id), 60000);
            }
        } catch(e) {}

        res.json({
            key: msgResult.key,
            message: msgResult.message,
            messageTimestamp: msgResult.messageTimestamp,
            status: "PENDING",
            media_url: mediaUrl
        });

    } catch (e) {
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

export default router;
