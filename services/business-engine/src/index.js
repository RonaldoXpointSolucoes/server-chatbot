import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Client, Databases, ID, Query } from 'node-appwrite';
import dotenv from 'dotenv';

dotenv.config();

const fastify = Fastify({ logger: true });

await fastify.register(cors, { origin: '*' });

// Configuração do Appwrite Server SDK
const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'http://appwrite:80/v1';
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID || 'chatboot-production';
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID || 'chatboot_db';
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;

const appwriteClient = new Client();
if (APPWRITE_API_KEY) {
  appwriteClient
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);
}
const databases = new Databases(appwriteClient);

const WHATSMEOW_URL = process.env.WHATSMEOW_URL || 'http://whatsmeow-engine:8081';
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://ai-engine:8082';

// Cache Gastrofood em memória com janela de 1 hora
const gastroCache = {
  data: null,
  lastFetch: 0,
  TTL_MS: 60 * 60 * 1000 // 1 hora
};

// Healthcheck
fastify.get('/health', async () => {
  return {
    status: 'healthy',
    engine: 'Business Engine v8.0',
    appwrite: APPWRITE_API_KEY ? 'configured' : 'missing_key',
    databaseId: APPWRITE_DATABASE_ID,
    timestamp: new Date().toISOString()
  };
});

// Webhook Receptor do Whatsmeow
fastify.post('/webhooks/whatsapp', async (request, reply) => {
  const { event, data } = request.body || {};
  fastify.log.info({ event, data }, 'Evento WhatsApp recebido');

  if (event === 'message.upsert' && data) {
    const { instanceId, messageId, sender, text, fromMe, chatJid } = data;

    // 1. Gravar mensagem no Appwrite
    if (APPWRITE_API_KEY && text) {
      try {
        await databases.createDocument(
          APPWRITE_DATABASE_ID,
          'messages',
          ID.unique(),
          {
            conversationId: chatJid || sender,
            text: text,
            status: 'delivered',
            sender: fromMe ? 'me' : 'customer',
            messageId: messageId,
            tenantId: 'default'
          }
        );
      } catch (err) {
        fastify.log.error('Erro ao salvar mensagem no Appwrite:', err.message);
      }
    }

    // 2. Se a mensagem veio do cliente, acionar o AI Engine para responder
    if (!fromMe && text) {
      try {
        const aiRes = await fetch(`${AI_ENGINE_URL}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: text,
            systemInstruction: 'Você é a atendente virtual da empresa. Responda de forma gentil, direta e em Português do Brasil.'
          })
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          if (aiData.reply) {
            // Disparar resposta de volta via Whatsmeow
            await fetch(`${WHATSMEOW_URL}/instances/${instanceId}/send-text`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: chatJid || sender,
                text: aiData.reply
              })
            });
          }
        }
      } catch (err) {
        fastify.log.error('Erro no fluxo de IA/Whatsmeow:', err.message);
      }
    }
  }

  return { received: true };
});

// Gastrofood Cardápio com Cache de 1 hora
fastify.get('/gastrofood/cardapio', async (request, reply) => {
  const now = Date.now();
  if (gastroCache.data && (now - gastroCache.lastFetch < gastroCache.TTL_MS)) {
    return {
      cached: true,
      expiresInMinutes: Math.round((gastroCache.TTL_MS - (now - gastroCache.lastFetch)) / 60000),
      data: gastroCache.data
    };
  }

  // Simulação / Chamada à API oficial do Gastrofood
  try {
    const mockCardapio = [
      { id: '1', name: 'Almoço Executivo', price: 29.90, category: 'Pratos' },
      { id: '2', name: 'Suco Natural 500ml', price: 9.90, category: 'Bebidas' },
      { id: '3', name: 'Sobremesa do Dia', price: 12.00, category: 'Sobremesas' }
    ];

    gastroCache.data = mockCardapio;
    gastroCache.lastFetch = now;

    return {
      cached: false,
      refreshedAt: new Date().toISOString(),
      data: mockCardapio
    };
  } catch (err) {
    if (gastroCache.data) {
      return { cached: true, stale: true, data: gastroCache.data };
    }
    return reply.status(500).send({ error: 'Falha ao consultar Gastrofood: ' + err.message });
  }
});

// Vouchers B2B: Validação e Resgate
fastify.post('/vouchers/validate', async (request, reply) => {
  const { token } = request.body || {};
  if (!token) return reply.status(400).send({ error: 'Token obrigatório.' });

  try {
    const res = await databases.listDocuments(APPWRITE_DATABASE_ID, 'vouchers', [
      Query.equal('token', token)
    ]);

    if (res.total === 0) {
      return reply.status(404).send({ error: 'Voucher não encontrado.' });
    }

    const voucher = res.documents[0];
    return {
      valid: voucher.status === 'active' && voucher.balance > 0,
      voucher
    };
  } catch (err) {
    return reply.status(500).send({ error: err.message });
  }
});

const PORT = parseInt(process.env.PORT || '8083', 10);
const HOST = '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`Business Engine operando em http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
