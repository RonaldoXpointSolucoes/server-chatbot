import express from 'express';

const MAX_LOGS = 200;
const logBuffer = [];
let clients = [];

const router = express.Router();

function broadcast(logEntry) {
  clients.forEach(client => {
    // Escreve os eventos no padrao SSE
    client.res.write(`data: ${JSON.stringify(logEntry)}\n\n`);
  });
}

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
    
    broadcast(logEntry);
    originalFn.apply(console, args);
  }

  console.log = (...args) => capture('log', originalLog, args);
  console.info = (...args) => capture('info', originalInfo, args);
  console.warn = (...args) => capture('warn', originalWarn, args);
  console.error = (...args) => capture('error', originalError, args);
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

export default router;
