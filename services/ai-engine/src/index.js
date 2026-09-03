import Fastify from 'fastify';
import cors from '@fastify/cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const fastify = Fastify({ logger: true });

await fastify.register(cors, { origin: '*' });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// Conexão Redis opcional para cache/filas
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
let redisClient = null;
try {
  redisClient = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  await redisClient.connect().catch(() => console.log('Redis offline, modo standalone'));
} catch (e) {
  console.log('Redis não conectado:', e.message);
}

// Healthcheck
fastify.get('/health', async () => {
  return {
    status: 'healthy',
    engine: 'AI Engine v8.0',
    hasGemini: !!genAI,
    redis: redisClient?.status === 'ready' ? 'connected' : 'disabled',
    timestamp: new Date().toISOString()
  };
});

// Chat Inteligente com Gemini 1.5 Flash
fastify.post('/ai/chat', async (request, reply) => {
  const { prompt, systemInstruction, history = [] } = request.body || {};

  if (!prompt) {
    return reply.status(400).send({ error: "O campo 'prompt' é obrigatório." });
  }

  if (!genAI) {
    return reply.status(500).send({ error: 'GEMINI_API_KEY não configurada no servidor de IA.' });
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction || 'Você é o assistente virtual inteligente do ChatBoot SaaS.'
    });

    const chat = model.startChat({
      history: history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      }))
    });

    const result = await chat.sendMessage(prompt);
    const responseText = result.response.text();

    return {
      success: true,
      model: 'gemini-1.5-flash',
      reply: responseText
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: error.message });
  }
});

// Transcrição de Áudios de WhatsApp
fastify.post('/ai/transcribe', async (request, reply) => {
  const { audioBase64, mimeType = 'audio/ogg' } = request.body || {};

  if (!audioBase64) {
    return reply.status(400).send({ error: "O campo 'audioBase64' é obrigatório." });
  }

  if (!genAI) {
    return reply.status(500).send({ error: 'GEMINI_API_KEY não configurada.' });
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: audioBase64.replace(/^data:audio\/\w+;base64,/, '')
        }
      },
      { text: 'Transcreva com exatidão o áudio acima em Português do Brasil. Retorne apenas o texto transcrito.' }
    ]);

    return {
      success: true,
      transcription: result.response.text().trim()
    };
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: error.message });
  }
});

const PORT = parseInt(process.env.PORT || '8082', 10);
const HOST = '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`AI Engine operando em http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
