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

// Rota 3: Envio de Mensagem Nativo (Substitui n8n e Evolution)
app.post('/instance/:tenantId/send', async (req, res) => {
    const { tenantId } = req.params;
    const { number, text } = req.body; // number limpo, ex: 5511999999999
    
    if(!number || !text) return res.status(400).json({ error: 'Faltam number ou text' });
    
    const remoteJid = `${number}@s.whatsapp.net`;
    try {
        await instanceManager.sendMessage(tenantId, remoteJid, text);
        res.json({ status: 'success', message: 'Mensagem ejetada no Whatsapp nativo.'});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Inicialização Global
app.listen(PORT, async () => {
    console.log(`📡 [ANTIGRAVITY WHATSAPP ENGINE] Online na Porta ${PORT}`);
    console.log(`>>> Sem intermediários, conexão Postgres direta via Baileys.`);
});
