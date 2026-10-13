export function connectionView(data = {}) {
  const d = data.diagnostic || {};
  const status = data.status || data.sessionStatus || 'disconnected';
  const connected = data.is_authenticated === true || d.authenticated === true || (d.authenticated !== false && ['connected','connected_local','open'].includes(status));
  const authenticating = !connected && (d.handshakeProtected || ['authenticating','reconnecting'].includes(d.phase) || data.pairingSuccess || data.syncingKeys || data.scanningDetected || data.pairing_code === 'CONNECTED_PENDING_SYNC');
  const terminal = !connected && ['error','expired'].includes(d.phase);
  const qr = !connected && !authenticating && !terminal && (!d.phase || d.phase === 'qr_ready') ? data.qrBase64 || data.qr_base64 || data.base64 || data.qrCode || data.qr_code || null : null;
  return {
    status: connected ? 'connected' : authenticating ? 'connecting' : status,
    step: connected ? 4 : authenticating ? 3 : qr ? 2 : 1,
    message: d.message || (connected ? 'WhatsApp conectado e autenticado.' : authenticating ? 'Celular identificado. Aguarde a autenticação; não gere outro QR.' : qr ? 'QR ativo. Leia pelo WhatsApp no celular.' : 'Aguardando resposta do servidor WhatsApp.'),
    qr, connected, authenticating, terminal,
    expiresAt: d.qrExpiresAt || null,
    diagnostic: d,
    // A refresh reads status. It never erases credentials or restarts a socket.
    canStart: !connected && !authenticating && (d.retryAllowed === true || (!d.phase && !qr))
  };
}

export function qrSeconds(expiresAt, now = Date.now()) {
  return expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt)-now)/1000)) : 0;
}

export async function readEngineResponse(response) {
  let json;
  try { json = await response.json(); }
  catch {
    const error = new Error(response.ok ? 'O servidor Node devolveu uma resposta inválida. A sessão foi preservada.' : `Servidor Node indisponível (HTTP ${response.status}). A sessão foi preservada; aguarde e atualize o status.`);
    error.status = response.status;
    throw error;
  }
  const data = json?.data || json;
  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `Servidor respondeu HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return data;
}
