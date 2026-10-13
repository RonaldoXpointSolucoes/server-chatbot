import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ALPHA_INSTANCES = new Set([
    'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6',
    '5c78d358-d449-41c4-b396-a04ab20a39e4'
]);
const DEFAULT_ALPHA_URL = 'http://wh1ss8sy848ufj6zh8t492y7.69.62.92.212.sslip.io';

export function externalMessageOwner(instanceId, nodeId, alphaUrl = DEFAULT_ALPHA_URL) {
    if (!ALPHA_INSTANCES.has(instanceId) || String(nodeId).includes('alpha')) return null;
    const url = new URL(alphaUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid Alpha API protocol');
    return url.origin;
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
