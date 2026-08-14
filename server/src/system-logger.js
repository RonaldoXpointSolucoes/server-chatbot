import express from 'express';

const MAX_LOGS = 200;
const MAX_ERRORS = 100;
const logBuffer = [];
export const errorBuffer = [];
const gastrofoodBuffer = [];
const MAX_GASTROFOOD_LOGS = 100;
let clients = [];

const router = express.Router();

function broadcast(logEntry) {
  clients.forEach(client => {
    // Escreve os eventos no padrao SSE
    client.res.write(`data: ${JSON.stringify(logEntry)}\n\n`);
  });
}

const APP_ENV = (process.env.APP_ENV || 'production').toUpperCase();
const APP_NODE = process.env.APP_NODE || (APP_ENV === 'ALPHA' ? 'ALFA-A' : 'PROD-C');

function interceptConsole() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalInfo = console.info;

  function capture(level, originalFn, args) {
    let text = '';
    try {
        text = args.map(a => {
            if (a instanceof Error) return a.stack || a.message;
            return typeof a === 'object' ? JSON.stringify(a) : String(a);
        }).join(' ');
    } catch(e) {
        text = '[Non-serializable Object Object]';
    }

    if (!text.startsWith('[')) {
        text = `[${APP_ENV}][${APP_NODE}] ${text}`;
    }

    // Filtro de ruído: Ignora warnings de prekey bundle e logs rotineiros para não inundar o logger
    if (level === 'warn' && (
        text.includes('Closing open session in favor of incoming prekey bundle') ||
        text.includes('socket zumbi') ||
        text.includes('[History Sync] O WhatsApp não retornou') ||
        text.includes('[QueueProcessor] Falha de rede temporária ao carregar fila de mensagens') ||
        text.includes('[SnoozeManager] Conexão com o Supabase indisponível temporariamente') ||
        (text.includes('[WaCalls Listener]') && (text.includes('Contato não encontrado') || text.includes('mapeamento LID')))
    )) {
        originalFn.apply(console, args);
        return;
    }

    // Silencia erros rotineiros de reconexão / descriptografia do protocolo Signal (Baileys Bad MAC) do DevLogger UI
    const isBaileysDecryptError = text.includes('Bad MAC') ||
                                  text.includes('Failed to decrypt message with any known session') ||
                                  text.includes('Session error:Error: Bad MAC') ||
                                  text.includes('verifyMAC') ||
                                  text.includes('Decrypted message with closed session') ||
                                  text.includes('received error in ack') ||
                                  text.includes('error":"479"') ||
                                  text.includes('Own LID session created successfully') ||
                                  text.includes('sent retry receipt') ||
                                  text.includes('Connection Terminated') ||
                                  text.includes('status 428') ||
                                  text.includes('[QueueProcessor]') ||
                                  (text.includes('[Baileys]') && text.includes('connection errored')) ||
                                  (text.includes('libsignal') && text.includes('session_cipher'));
    if (isBaileysDecryptError) {
        originalFn.apply(console, args);
        return;
    }

    // Silencia completamente erros de comunicação com o WaCalls do buffer de erros e da UI (reduz ruído)
    const isWaCallsConnectionError = text.includes('[WaCalls SSE Proxy Error]') || 
                                     text.includes('[WaCalls Background Listener Error]') ||
                                     text.includes('[WaCalls Background Listener]') ||
                                     text.includes('[WaCalls REST Proxy Error]');
    if (isWaCallsConnectionError && (text.includes('fetch failed') || text.includes('ECONNREFUSED') || text.includes('Connection refused'))) {
        // Envia apenas para o stdout do servidor (console Node.js/Docker) sem poluir o painel administrativo da Web
        originalFn.apply(console, args);
        return;
    }

    const logEntry = {
      type: 'log',
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      level,
      message: text
    };
    
    logBuffer.push(logEntry);
    if (logBuffer.length > MAX_LOGS) {
      logBuffer.shift(); // Mantem o buffer num tamanho aceitavel (Custo de RAM)
    }

    if (level === 'error' || level === 'warn') {
      errorBuffer.push(logEntry);
      if (errorBuffer.length > MAX_ERRORS) errorBuffer.shift();
    }
    
    if (text.includes('[Gastrofood API]')) {
      try {
        const prefix = '[Gastrofood API]';
        const jsonStr = text.substring(text.indexOf(prefix) + prefix.length).trim();
        const parsed = JSON.parse(jsonStr);
        const gastroEntry = {
          id: parsed.id || Math.random().toString(36).substring(2, 9),
          timestamp: logEntry.timestamp,
          ...parsed
        };
        gastrofoodBuffer.push(gastroEntry);
        if (gastrofoodBuffer.length > MAX_GASTROFOOD_LOGS) {
          gastrofoodBuffer.shift();
        }
      } catch (e) {
        const isErrorMsg = text.includes('"direction":"error"') || text.includes('FAILED') || text.includes(' 500 ') || text.includes(' 400 ');
        const gastroEntry = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: logEntry.timestamp,
          type: 'gastrofood_api',
          direction: isErrorMsg ? 'error' : 'info',
          action: 'Gastrofood Call',
          error: text
        };
        gastrofoodBuffer.push(gastroEntry);
        if (gastrofoodBuffer.length > MAX_GASTROFOOD_LOGS) {
          gastrofoodBuffer.shift();
        }
      }
    }
    
    broadcast(logEntry);
    originalFn.apply(console, args);
  }

  console.log = (...args) => capture('log', originalLog, args);
  console.info = (...args) => capture('info', originalInfo, args);
  console.warn = (...args) => capture('warn', originalWarn, args);
  console.error = (...args) => capture('error', originalError, args);
}

export function addLog(level, message) {
  const logEntry = {
    type: 'log',
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    level,
    message: typeof message === 'string' ? message : JSON.stringify(message)
  };
  logBuffer.push(logEntry);
  if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  broadcast(logEntry);
}

// Inicializamos a interceptação global
interceptConsole();

// Ponto de Entrada para o Frontend Ouvir em Tempo Real
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Necessario para funcionar atras de um nginx/proxy sem bufferizar
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders && res.flushHeaders(); 

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  // Envia logs velhos logo na conexão
  res.write(`data: ${JSON.stringify({ type: 'init', logs: logBuffer })}\n\n`);

  req.on('close', () => {
    clients = clients.filter(c => c.id !== clientId);
  });
});

// Endpoint para alterar o nível de debug do Baileys dinamicamente
router.post('/level', async (req, res) => {
  try {
    const { level } = req.body;
    if (level === 'trace' || level === 'info') {
      const sm = await import('./session-manager/index.js');
      if (sm.default && sm.default.logger) {
        sm.default.logger.level = level;
      }
      res.json({ success: true, level });
    } else {
      res.status(400).json({ error: 'Nível inválido. Use "info" ou "trace".' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para polling de erros (Frontend DevLogger)
router.get('/recent-errors', (req, res) => {
  try {
    const since = req.query.since;
    let newErrors = errorBuffer;
    if (since) {
      const sinceTime = parseInt(since, 10);
      newErrors = errorBuffer.filter(e => new Date(e.timestamp).getTime() > sinceTime);
    }
    res.json({ success: true, errors: newErrors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para polling de logs da API Gastrofood
router.get('/gastrofood', (req, res) => {
  try {
    const since = req.query.since;
    let logs = gastrofoodBuffer;
    if (since && since !== '0') {
      const sinceTime = parseInt(since, 10);
      logs = gastrofoodBuffer.filter(e => new Date(e.timestamp).getTime() > sinceTime);
    }
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para limpar os logs da API Gastrofood de forma definitiva
router.delete('/gastrofood', (req, res) => {
  try {
    gastrofoodBuffer.length = 0;
    
    // Filtra e remove os logs do Gastrofood de logBuffer e errorBuffer
    for (let i = logBuffer.length - 1; i >= 0; i--) {
      if (logBuffer[i] && logBuffer[i].message && logBuffer[i].message.includes('[Gastrofood API]')) {
        logBuffer.splice(i, 1);
      }
    }
    for (let i = errorBuffer.length - 1; i >= 0; i--) {
      if (errorBuffer[i] && errorBuffer[i].message && errorBuffer[i].message.includes('[Gastrofood API]')) {
        errorBuffer.splice(i, 1);
      }
    }

    res.json({ success: true, message: 'Logs excluídos de forma definitiva.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para obter todos os logs recentes (diagnóstico avançado)
router.get('/all', (req, res) => {
  try {
    res.json({ success: true, logs: logBuffer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
