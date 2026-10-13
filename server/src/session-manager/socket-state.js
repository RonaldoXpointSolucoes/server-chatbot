// Transport readiness and WhatsApp authentication are different signals.
export function isTransportOpen(sock) {
    const ws = sock?.ws;
    if (!ws || ws.isClosed || ws.isClosing || ws.isConnecting) return false;
    if (ws.socket && ws.socket.readyState !== 1) return false;
    return ws.isOpen === true || ws.socket?.readyState === 1;
}

export function getSessionSocket(sessions, instanceId, requireAuthenticated = false) {
    const sock = sessions.get(instanceId)?.sock;
    if (!sock) return null;
    if (sock.ws?.isClosing || sock.ws?.isClosed) return null;
    if (requireAuthenticated) {
        const identity = sock.user?.id || sock.authState?.creds?.me?.id || sock.authState?.creds?.me?.jid;
        if (!identity || !isTransportOpen(sock)) return null;
    }
    // A status read must retain ownership until the close listener handles 515.
    return sock;
}
