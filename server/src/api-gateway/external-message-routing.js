import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ALPHA_INSTANCES = new Set([
    'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6',
    '5c78d358-d449-41c4-b396-a04ab20a39e4'
]);
const DEFAULT_ALPHA_URL = 'https://wh1ss8sy848ufj6zh8t492y7.69.62.92.212.sslip.io';

export { ALPHA_INSTANCES, DEFAULT_ALPHA_URL };

const DEFAULT_PROD_URL = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';

export function externalMessageOwner(instanceId, nodeId, alphaUrl = DEFAULT_ALPHA_URL) {
    if (!ALPHA_INSTANCES.has(instanceId) || String(nodeId).includes('alpha')) return null;
    const url = new URL(alphaUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid Alpha API protocol');
    return url.origin;
}

/**
 * Resolve o worker proprietário de uma instância para rotas internas (/api/v1/instances/:id/invoke, /api/v1/messages/send).
 * Se a instância pertence ao alpha-worker e a requisição chegou no production-worker (ou vice-versa),
 * encaminha via HTTP interno com timeout curto. Se o worker remoto responder 2xx, encerra `res` e retorna `true`.
 * Caso contrário, retorna `false` para que o nó atual salve imediatamente no Outbox Resiliente (`wa_outgoing_messages`).
 */
export async function forwardInternalInstanceRequest(req, res, instanceId, options = {}) {
    if (!instanceId || req.headers['x-api-owner-hop']) return false;

    const appEnv = String(process.env.APP_ENV || '').toLowerCase();
    const currentNodeId = String(options.nodeId || process.env.NODE_ID || process.env.WORKER_NODE_ID || process.env.COOLIFY_CONTAINER_NAME || 'production-worker').toLowerCase();
    const isAlphaNode = appEnv === 'alpha' || appEnv === 'staging' || appEnv === 'homolog' || currentNodeId.includes('alpha') || currentNodeId.includes('homolog') || currentNodeId.includes('staging');
    const isAlphaInstance = ALPHA_INSTANCES.has(instanceId);

    let targetOrigin = null;
    if (isAlphaInstance && !isAlphaNode) {
        const rawUrl = options.alphaUrl || process.env.ALPHA_API_URL || DEFAULT_ALPHA_URL;
        targetOrigin = new URL(rawUrl).origin;
    } else if (!isAlphaInstance && isAlphaNode) {
        const rawUrl = options.prodUrl || process.env.PROD_API_URL || DEFAULT_PROD_URL;
        targetOrigin = new URL(rawUrl).origin;
    }

    if (!targetOrigin) return false;

    const timeoutMs = options.timeoutMs || 6500;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const headers = {
            'content-type': 'application/json',
            'x-api-owner-hop': '1'
        };
        if (req.headers.authorization) headers.authorization = req.headers.authorization;
        if (req.headers.apikey) headers.apikey = req.headers.apikey;
        if (req.headers.globalapikey) headers.globalapikey = req.headers.globalapikey;
        if (req.headers['x-tenant-id']) headers['x-tenant-id'] = req.headers['x-tenant-id'];
        if (req.headers['x-trace-id']) headers['x-trace-id'] = req.headers['x-trace-id'];

        const response = await fetch(targetOrigin + req.originalUrl, {
            method: req.method || 'POST',
            headers,
            body: JSON.stringify(req.body || {}),
            signal: controller.signal,
            redirect: 'follow'
        });

        if (response.ok) {
            const payload = await response.text();
            res.status(response.status);
            res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
            res.setHeader('x-api-owner-node', isAlphaInstance ? 'alpha-worker' : 'production-worker');
            res.send(payload);
            return true;
        }

        console.log(`[InternalRouting] Worker proprietário (${targetOrigin}) retornou HTTP ${response.status} para instância ${instanceId}. Aplicando fallback Outbox local.`);
        return false;
    } catch (err) {
        console.log(`[InternalRouting] Falha ao encaminhar requisição da instância ${instanceId} para ${targetOrigin} (${err?.message || err?.name}). Aplicando fallback Outbox local.`);
        return false;
    } finally {
        clearTimeout(timer);
    }
}

export function uploadedMediaBody(fields, file) {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields || {})) {
        for (const item of Array.isArray(value) ? value : [value]) form.append(name, String(item));
    }
    if (file) form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'file');
    return form;
}

// Only an already authenticated request can reach another worker. The receiving
// worker repeats authentication and owns all socket/queue operations.
export function createExternalMessageRouting({ nodeId, isInstanceAllowed, alphaUrl, fetchImpl = fetch }) {
    return async (req, res, next) => {
        if (!req.instanceData) return next(); // A global multipart key still needs its parsed instance.
        const { id, tenant_id } = req.instanceData;
        if (isInstanceAllowed(id, tenant_id)) return next();

        const owner = externalMessageOwner(id, nodeId, alphaUrl);
        if (!owner) {
            return res.status(409).json({ error: 'Esta instância pertence a outro servidor. Use a URL exibida no painel API.', code: 'INSTANCE_WRONG_NODE', instance_id: id });
        }
        if (req.headers['x-api-owner-hop']) {
            return res.status(508).json({ error: 'O servidor responsável pela instância não está disponível.', code: 'INSTANCE_ROUTING_LOOP', instance_id: id });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);
        const abort = () => controller.abort();
        req.once('aborted', abort);
        try {
            const headers = {
                apikey: req.headers.apikey || req.headers.globalapikey,
                'x-api-owner-hop': '1'
            };
            let body;
            const multipart = String(req.headers['content-type'] || '').startsWith('multipart/form-data');
            if (multipart && (req.file || req.readableEnded)) {
                body = uploadedMediaBody(req.body, req.file);
            } else if (multipart) {
                // Forward the untouched upload without buffering a second copy.
                headers['content-type'] = req.headers['content-type'];
                body = req;
            } else {
                headers['content-type'] = 'application/json';
                body = JSON.stringify(req.body || {});
            }
            const response = await fetchImpl(owner + req.originalUrl, {
                method: req.method, headers, body, duplex: 'half', signal: controller.signal,
                redirect: 'error'
            });
            res.status(response.status);
            res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
            res.setHeader('x-api-owner-node', 'alpha-worker');
            res.setHeader('Cache-Control', 'no-store');
            if (response.body) await pipeline(Readable.fromWeb(response.body), res);
            else res.end();
        } catch (error) {
            console.warn(`[API Gateway] External owner unavailable for ${id}: ${error.name}`);
            // Do not enqueue or resend after an uncertain response: the owner may
            // already have delivered this request to WhatsApp.
            if (!res.headersSent) res.status(502).json({ error: 'O servidor responsável pela instância não respondeu. Confira o histórico antes de repetir o envio.', code: 'INSTANCE_OWNER_UNAVAILABLE', instance_id: id });
        } finally {
            clearTimeout(timeout);
            req.off('aborted', abort);
        }
    };
}
