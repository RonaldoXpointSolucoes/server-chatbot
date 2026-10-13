import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).version;
const attempts = new Map();
const messages = {
    starting: 'Iniciando a conexão com o WhatsApp.',
    qr_ready: 'QR Code ativo. Leia pelo WhatsApp no celular.',
    authenticating: 'Leitura aceita pelo celular. Aguarde a autenticação; o QR não será reiniciado.',
    reconnecting: 'Restabelecendo o socket com as credenciais preservadas.',
    connected: 'WhatsApp conectado e autenticado.',
    expired: 'O WhatsApp encerrou a espera pelo QR. Solicite uma nova tentativa.',
    error: 'O WhatsApp encerrou a conexão. Consulte o motivo nos logs.'
};

export function beginConnectionAttempt(instanceId, tenantId, requestId = randomUUID()) {
    const now = Date.now();
    const attempt = { attemptId: randomUUID(), requestId, tenantId, phase: 'starting', startedAt: now, updatedAt: now, qrSequence: 0, qrExpiresAt: null, lastDisconnect: null };
    attempts.set(instanceId, attempt);
    return attempt;
}

export function connectionProgress(instanceId, update, { hasIdentity = false, tenantId } = {}) {
    const a = attempts.get(instanceId) || beginConnectionAttempt(instanceId, tenantId);
    const now = Date.now();
    if (update.connection === 'close') {
        const code = update.lastDisconnect?.error?.output?.statusCode;
        const reason = String(update.lastDisconnect?.error?.message || 'Conexão encerrada').slice(0,250);
        a.lastDisconnect = { code: code || null, reason, at: new Date(now).toISOString() };
        a.phase = code === 515 || (hasIdentity && ![401,403,409,410,411,440,500].includes(code)) ? 'reconnecting' : code === 408 ? 'expired' : 'error';
        a.qrExpiresAt = null;
    } else if (update.connection === 'open' && hasIdentity) {
        a.phase = 'connected';
        a.qrExpiresAt = null;
    } else if (a.phase !== 'connected' && (update.isNewLogin || update.scanningDetected || update.syncingKeys || update.pairingSuccess || hasIdentity)) {
        a.phase = 'authenticating';
        a.qrExpiresAt = null;
    } else if (update.qr) {
        a.phase = 'qr_ready';
        a.qrSequence++;
        // This matches the QR lifetime in the vendored Baileys socket.
        a.qrExpiresAt = now + (a.qrSequence === 1 ? 60000 : 20000);
    } else if (update.connection === 'connecting' && !['authenticating','reconnecting','connected','qr_ready'].includes(a.phase)) {
        a.phase = 'starting';
    }
    a.updatedAt = now;
    return a;
}

export function getConnectionDiagnostics(instanceId, { wsOpen = null, authenticated = false, hasIdentity = false } = {}) {
    const a = attempts.get(instanceId);
    let phase = authenticated ? 'connected' : a?.phase || (hasIdentity ? 'authenticating' : 'idle');
    if (!authenticated && phase === 'connected' && wsOpen === false) phase = 'reconnecting';
    if (phase === 'qr_ready' && a.qrExpiresAt <= Date.now()) phase = 'waiting_qr';
    const message = phase === 'waiting_qr' ? 'Aguardando o próximo QR gerado pelo WhatsApp, sem encerrar a sessão.' : messages[phase] || 'Solicite a conexão para iniciar.';
    return {
        phase, message, attemptId: a?.attemptId || null, requestId: a?.requestId || null,
        startedAt: a ? new Date(a.startedAt).toISOString() : null,
        elapsedMs: a ? Date.now() - a.startedAt : 0,
        updatedAt: a ? new Date(a.updatedAt).toISOString() : null,
        qrSequence: a?.qrSequence || 0,
        qrExpiresAt: phase === 'qr_ready' ? new Date(a.qrExpiresAt).toISOString() : null,
        lastDisconnect: a?.lastDisconnect || null,
        wsOpen, authenticated, hasIdentity, nodeId: process.env.NODE_ID || 'unknown',
        environment: process.env.APP_ENV || 'production', serverVersion: version,
        retryAllowed: ['idle','error','expired'].includes(phase),
        handshakeProtected: ['authenticating','reconnecting'].includes(phase),
        nextAction: phase === 'connected' ? 'Nenhuma ação necessária.' : ['authenticating','reconnecting'].includes(phase) ? 'Aguarde a confirmação do servidor. Não gere outro QR durante esta etapa.' : phase === 'qr_ready' ? 'Leia o QR em Aparelhos conectados no celular.' : 'Consulte os logs e solicite uma nova tentativa se a sessão terminou.'
    };
}

export function connectDecision({ authenticated, hasIdentity, wsOpen, hasSession, starting, reconnecting, pairingInProgress, phase, resetSession = false }) {
    // force_new from older QR screens is NOT authorization to erase a paired device.
    if (authenticated) return 'connected';
    if ((hasIdentity && wsOpen) || pairingInProgress || ['authenticating','reconnecting'].includes(phase)) return 'preserve';
    if (starting || reconnecting || (hasSession && wsOpen && !resetSession)) return 'preserve';
    return 'start';
}

export function shouldClearCredentials({ resetSession, hasStoredIdentity }) {
    return resetSession === true && !hasStoredIdentity;
}

export function diagnosticLogDetails(instanceId, extras = {}) {
    const d = getConnectionDiagnostics(instanceId);
    return { attemptId: d.attemptId, requestId: d.requestId, phase: d.phase, elapsedMs: d.elapsedMs, qrSequence: d.qrSequence, serverVersion: version, ...extras };
}
