require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const instanceManager = require('./instanceManager');

const app = express();
const PORT = process.env.PORT || 9000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Rota 1: Inicializar uma Instância ou Pegar QR
app.post('/instance/:tenantId/create', async (req, res) => {
    const { tenantId } = req.params;
    try {
        const result = await instanceManager.createSession(tenantId);
        res.json({ message: 'Session started', result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Rota 2: Verificar o QR Base64 ou Se Conectou
app.get('/instance/:tenantId/qrcode', async (req, res) => {
    const { tenantId } = req.params;
    
    // Se o user tá autenticado / logado
    const sock = instanceManager.sessions.get(tenantId);
    if(sock && sock.user) {
        return res.json({ connected: true, status: 'open' });
    }

    // Se nâo tá logado, exibe QR se tiver algum pendente na fila
    const qrData = instanceManager.qrs.get(tenantId);
    if(qrData) {
        return res.json({ qrcode: qrData });
    }
    
    res.json({ status: 'not_initialized_or_fetching' });
});

// Rota 3: Envio de Mensagem Nativa
app.post('/instance/:tenantId/send', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { number, text } = req.body;
        // JID Builder
        const remoteJid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
        await instanceManager.sendMessage(tenantId, remoteJid, text);
        res.json({ success: true, message: 'Disparo efetuado.' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// PARITY ROUTES (Mirror Evolution API Fetching)
// ==========================================

// Puxar Chats Recentes
app.get('/instance/:tenantId/chats', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const store = instanceManager.stores.get(tenantId);
        if(!store) return res.json([]);
        
        // Retorna top 30
        const chats = store.chats.all().slice(0, 30);
        res.json(chats);
    } catch(err) {
        res.json([]);
    }
});

// Puxar Mensagens de Historico de um contato
app.get('/instance/:tenantId/messages/:remoteJid', async (req, res) => {
    try {
        const { tenantId, remoteJid } = req.params;
        const store = instanceManager.stores.get(tenantId);
        if(!store) return res.json([]);
        
        const msgs = store.messages[remoteJid]?.array || [];
        // Pega as ultimas 50
        res.json(msgs.slice(-50));
    } catch(err) {
        res.json([]);
    }
});

// Resgatar Foto de Perfil
app.get('/instance/:tenantId/profilePic/:remoteJid', async (req, res) => {
    try {
        const { tenantId, remoteJid } = req.params;
        const sock = instanceManager.sessions.get(tenantId);
        if(!sock) return res.json({ url: null });
        
        const url = await sock.profilePictureUrl(remoteJid, 'image');
        res.json({ url });
    } catch(err) {
        res.json({ url: null });
    }
});

// Disparo de Mídia
app.post('/instance/:tenantId/sendMedia', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { number, mediaType, mediaUrl, mimetype, fileName, caption } = req.body;
        
        const sock = instanceManager.sessions.get(tenantId);
        if(!sock) throw new Error('Servidor Local Offline');

        const remoteJid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
        
        let msgPayload = {};
        if (mediaType === 'image') msgPayload = { image: { url: mediaUrl }, caption: caption || '' };
        else if (mediaType === 'video') msgPayload = { video: { url: mediaUrl }, caption: caption || '' };
        else if (mediaType === 'audio') msgPayload = { audio: { url: mediaUrl }, mimetype: mimetype || 'audio/mp4', ptt: true };
        else msgPayload = { document: { url: mediaUrl }, mimetype: mimetype || 'application/pdf', fileName: fileName || 'Documento' };

        await sock.sendMessage(remoteJid, msgPayload);
        res.json({ success: true, message: 'Mídia enfileirada e enviada.' });
    } catch(err) {
        console.error("Falha ao enviar midia via sock", err);
        res.status(500).json({ error: err.message });
    }
});

// Inicialização Global
app.listen(PORT, async () => {
    console.log(`📡 [ANTIGRAVITY WHATSAPP ENGINE] Online na Porta ${PORT}`);
    console.log(`>>> Sem intermediários, conexão Postgres direta via Baileys.`);
});
