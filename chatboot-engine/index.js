const nodeCrypto = require('crypto');
if (!globalThis.crypto) {
    globalThis.crypto = nodeCrypto.webcrypto;
}

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
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
    const { forceReset } = req.body || {};
    try {
        const result = await instanceManager.createSession(tenantId, forceReset);
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
        
        let sock = instanceManager.sessions.get(tenantId);
        if(!sock) {
            console.log(`[LAZY LOAD] Restaurando motor em memória para SEND em ${tenantId}`);
            try {
               await instanceManager.createSession(tenantId);
               sock = instanceManager.sessions.get(tenantId);
            } catch(e) {
               console.error("Falha fatal no LAZY LOAD", e);
            }
        }

        // Anti-Connection Closed Protector
        if (sock && (!sock.user || !sock.isConnectionFullyOpen)) {
            throw new Error("Conexão ao WhatsApp sendo reestabelecida (Handshake). Aguarde cerca de 10 segundos e tente reenviar. Se o erro persistir o celular está sem internet.");
        }

        // JID Builder
        const remoteJid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
        await instanceManager.sendMessage(tenantId, remoteJid, text);
        res.json({ success: true, message: 'Disparo efetuado.' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Rota para Deletar Instância
app.delete('/instance/:tenantId/delete', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const sock = instanceManager.sessions.get(tenantId);
        
        if (sock) {
            try { sock.logout('User requested deletion'); } catch(e) {}
            try { sock.ws?.close(); } catch(e) {}
            instanceManager.sessions.delete(tenantId);
            instanceManager.qrs.delete(tenantId);
            instanceManager.stores.delete(tenantId);
        }
        
        const { supabase } = require('./supabase');
        
        // Limpar auth states
        await supabase.from('wa_auth_states').delete().eq('tenant_id', tenantId);
        
        // Limpar da nova base permanentemente
        await supabase.from('whatsapp_instances').delete().eq('id', tenantId);
        
        console.log(`[${tenantId}] Instância EXCLUÍDA do servidor e banco.`);
        res.json({ success: true, message: 'Instância completamente deletada.' });
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
        
        let store = instanceManager.stores.get(tenantId);
        if(!store) {
            // Lazy load se o backend reiniciou mas o frontend ainda está pedindo chats
            console.log(`[LAZY LOAD] Restaurando motor em memória para ${tenantId}`);
            try {
                await instanceManager.createSession(tenantId);
                store = instanceManager.stores.get(tenantId);
            } catch (err) {
                console.error("Falha no lazy load", err);
            }
        }
        if(!store) return res.json([]);
        
        // Retorna top 50 recem interagidos
        const rawChats = store.chats.all().sort((a,b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0)).slice(0, 50);
        
        // Enriquecer com a ultima mensagem e com o NOME DO CONTATO
        const enrichedChats = rawChats.map(chat => {
            const chatMsgs = store.messages[chat.id]?.array || [];
            
            // Busca dados de Contato na raiz do proprio Node Memory Store
            const contactData = store.contacts[chat.id];
            
            let resolvedName = chat.pushName || chat.name;
            if (contactData) {
                resolvedName = contactData.name || contactData.notify || contactData.verifiedName || resolvedName;
            }
            if (!resolvedName && chatMsgs.length > 0) {
                resolvedName = chatMsgs[chatMsgs.length - 1]?.pushName || resolvedName;
            }
            
            chat.pushName = resolvedName;
            chat.name = resolvedName;

            if(chatMsgs.length > 0) {
               return {
                  ...chat,
                  lastMessage: chatMsgs[chatMsgs.length - 1]
               };
            }
            return chat;
        });

        res.json(enrichedChats);
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
        // Pega as ultimas 150 para que a janela de chat do front-end fique rica
        res.json(msgs.slice(-150));
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

// ==========================================
// ROTA PARA PAIRING CODE (LOGAR SEM QR, COM NUMERO)
// ==========================================
app.post('/instance/:tenantId/pairing-code', async (req, res) => {
    const { tenantId } = req.params;
    const { forceReset, phoneNumber } = req.body || {};
    try {
        const result = await instanceManager.createSession(tenantId, forceReset, true, phoneNumber);
        res.json({ message: 'Session started for Pairing Code generation', result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// FERRAMENTAS SRE - DEBUG NATIVO
// ==========================================

// Global Health
app.get('/debug/healthz', (req, res) => {
    res.json({
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        engineVersion: '2.0.1-Stable',
        compileDate: '2026-04-05T00:20:00-03:00',
        changelog: [
            "Correção do erro 500 no WebHook enviando 'Connection Closed'",
            "Adicionado Lazy Load para restaurar o Socket em caso de limpeza de memória no Node",
            "Refatoração profunda da integração React <-> Node via Baileys API"
        ],
        activeTenantsLoaded: Array.from(instanceManager.sessions.keys()),
        qrsOrPairingsPending: Array.from(instanceManager.qrs.keys())
    });
});

// Tenant Health
app.get('/debug/tenant/:tenantId', (req, res) => {
    const { tenantId } = req.params;
    const sock = instanceManager.sessions.get(tenantId);
    if(!sock) return res.json({ status: 'offline', tenantId });

    const store = instanceManager.stores.get(tenantId);
    
    res.json({
        tenantId,
        status: sock.user ? 'authenticated' : 'awaiting_auth',
        me: sock.user || null,
        RAM_Store: {
            contactsCount: store && store.contacts ? Object.keys(store.contacts).length : 0,
            chatsCount: store && store.chats ? store.chats.all().length : 0,
            messagesCachedCount: store && store.messages ? Object.keys(store.messages).length : 0
        }
    });
});

// Inicialização Global
app.listen(PORT, async () => {
    console.log(`📡 [ANTIGRAVITY WHATSAPP ENGINE] Online na Porta ${PORT}`);
    console.log(`>>> Sem intermediários, conexão Postgres direta via Baileys.`);
});
