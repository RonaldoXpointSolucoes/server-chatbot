import express from 'express';

const router = express.Router();

const getWaCallsUrl = () => {
    const envUrl = process.env.WACALLS_URL?.trim();
    if (envUrl) return envUrl;
    
    // Fallback inteligente para Docker Host no ambiente VPS Linux de produção
    if (process.env.NODE_ENV === 'production' || process.platform === 'linux') {
        return 'http://172.17.0.1:8080';
    }
    return 'http://localhost:8080';
};
const WACALLS_URL = getWaCallsUrl();

// Proxy para Server-Sent Events (SSE) do WaCalls
router.get('/wacalls/events', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const controller = new AbortController();
    
    // Se o cliente desconectar, interrompe a requisição ao servidor Go
    req.on('close', () => {
        controller.abort();
    });

    try {
        console.log(`[WaCalls SSE Proxy] Conectando ao upstream: ${WACALLS_URL}/api/events`);
        const response = await fetch(`${WACALLS_URL}/api/events`, {
            signal: controller.signal
        });

        if (!response.body) {
            throw new Error('Nenhum corpo de resposta retornado pelo servidor WaCalls');
        }

        // Repassa os chunks recebidos em tempo real para o cliente
        for await (const chunk of response.body) {
            res.write(chunk);
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('[WaCalls SSE Proxy Error]:', e.message);
        }
    } finally {
        res.end();
    }
});

// Proxy genérico para requisições REST da API WaCalls
router.all('/wacalls/*', async (req, res) => {
    const subpath = req.path.replace(/^\/wacalls/, '');
    const url = `${WACALLS_URL}/api${subpath}`;

    const options = {
        method: req.method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
        options.body = JSON.stringify(req.body);
    }

    try {
        const response = await fetch(url, options);
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
            const data = await response.json();
            return res.status(response.status).json(data);
        } else {
            const data = await response.text();
            return res.status(response.status).send(data);
        }
    } catch (e) {
        console.error(`[WaCalls REST Proxy Error] ${req.method} ${url}:`, e.message);
        return res.status(500).json({ error: 'Erro de comunicação com o servidor de chamadas.' });
    }
});

export default router;
