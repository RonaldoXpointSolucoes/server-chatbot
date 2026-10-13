import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransportOpen, getSessionSocket, sessionConnectionDiagnostics } from '../src/session-manager/socket-state.js';
import { beginConnectionAttempt, connectionProgress, getConnectionDiagnostics, connectionNeedsProtection, connectDecision } from '../src/session-manager/connection-lifecycle.js';

test('status polling retains the closing socket so its 515 event still owns the session', () => {
    const sock = { ws: { isClosed: true }, user: { id: 'test@s.whatsapp.net' } };
    const sessions = new Map([['scan', { sock }]]);
    beginConnectionAttempt('scan', 'tenant');
    connectionProgress('scan', { isNewLogin: true });
    for (let i = 0; i < 10; i++) assert.equal(getSessionSocket(sessions, 'scan'), null);
    // The real listener's ownership condition must still pass after polling.
    assert.equal(sessions.get('scan')?.sock, sock);
    connectionProgress('scan', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 }, message: 'restart required' } } }, { hasIdentity: true });
    assert.equal(getConnectionDiagnostics('scan').phase, 'reconnecting');
    const replacement = { ws: { isOpen: true }, user: sock.user };
    sessions.set('scan', { sock: replacement });
    assert.notEqual(sessions.get('scan')?.sock, sock);
    assert.equal(getSessionSocket(sessions, 'scan', true), replacement);
});

test('a live anonymous QR transport is protected without claiming authentication', () => {
    const sock = { ws: { isOpen: true, socket: { readyState: 1 } } };
    const sessions = new Map([['qr-protect', { sock }]]);
    beginConnectionAttempt('qr-protect', 'tenant');
    connectionProgress('qr-protect', { qr: 'private' });
    assert.equal(isTransportOpen(sock), true);
    assert.equal(getSessionSocket(sessions, 'qr-protect', true), null);
    assert.equal(connectionNeedsProtection(getConnectionDiagnostics('qr-protect'), { hasSession: true, wsOpen: true, now: Date.now() + 200000 }), true);
});

test('gateway QR diagnostics preserve a live anonymous socket on legacy refresh', () => {
    const id = 'gateway-qr';
    const sock = { ws: { isOpen: true, socket: { readyState: 1 } } };
    const manager = { sessions: new Map([[id, { sock }]]), authenticatedSessions: new Set(), pairingPendingSync: new Map() };
    const a = beginConnectionAttempt(id, 'tenant');
    connectionProgress(id, { qr: 'private' });
    const d = sessionConnectionDiagnostics(manager, id);
    assert.equal(d.wsOpen, true);
    assert.equal(d.authenticated, false);
    assert.equal(d.attemptId, a.attemptId);
    assert.equal(connectDecision({ ...d, hasSession: true, forceNew: true }), 'preserve');
    sock.ws.isClosed = true;
    assert.equal(sessionConnectionDiagnostics(manager, id).wsOpen, false);
});

test('gateway identity and transport alone do not confirm the pending handshake', () => {
    const id = 'gateway-handshake';
    const manager = { sessions: new Map([[id, { sock: { ws: { isOpen: true }, user: { id: 'test@s.whatsapp.net' } } }]]), authenticatedSessions: new Set([id]), pairingPendingSync: new Map([[id, true]]) };
    beginConnectionAttempt(id, 'tenant');
    connectionProgress(id, { syncingKeys: true }, { hasIdentity: true });
    assert.equal(sessionConnectionDiagnostics(manager, id).authenticated, false);
    connectionProgress(id, { connection: 'open' }, { hasIdentity: true });
    manager.pairingPendingSync.delete(id);
    assert.equal(sessionConnectionDiagnostics(manager, id).authenticated, true);
});

test('watchdog waits for recent scan/restart activity, then reports a recoverable failure', () => {
    beginConnectionAttempt('timeout', 'tenant');
    connectionProgress('timeout', { syncingKeys: true }, { hasIdentity: true });
    const d = getConnectionDiagnostics('timeout');
    assert.equal(connectionNeedsProtection(d, { hasSession: true, now: Date.parse(d.updatedAt) + 30000 }), true);
    assert.equal(connectionNeedsProtection(d, { hasSession: true, now: Date.parse(d.updatedAt) + 91000 }), false);
    connectionProgress('timeout', { connection: 'close', recoveryStopped: true, lastDisconnect: { error: { output: { statusCode: 408 }, message: 'Authentication timeout; credentials preserved' } } }, { hasIdentity: true });
    const failed = getConnectionDiagnostics('timeout');
    assert.equal(failed.phase, 'error');
    assert.equal(failed.handshakeProtected, false);
    assert.equal(failed.retryAllowed, true);
    assert.equal(failed.lastDisconnect.code, 408);
});
