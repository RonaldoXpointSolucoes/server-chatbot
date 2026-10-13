/** REST broadcast with the existing Realtime client's authentication and fetch. */
export async function sendBroadcastHttp(channel, event, payload, timeoutMs = 10000) {
  const socket = channel.socket;
  // Retain compatibility with older SDKs which do not expose the REST transport.
  if (!socket?.fetch || !channel.broadcastEndpointURL) {
    if (typeof channel.httpSend === 'function') return channel.httpSend(event, payload, { timeout: timeoutMs });
    const result = await channel.send({ type: 'broadcast', event, payload }, { timeout: timeoutMs });
    if (result !== 'ok') throw new Error(`Realtime broadcast ${result || 'failed'}`);
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    const headers = { apikey: socket.apiKey || '', 'Content-Type': 'application/json' };
    if (socket.accessTokenValue) headers.Authorization = `Bearer ${socket.accessTokenValue}`;
    response = await socket.fetch(channel.broadcastEndpointURL, {
      method: 'POST', headers, signal: controller.signal,
      body: JSON.stringify({ messages: [{
        topic: channel.subTopic, event, payload, private: channel.private || false
      }] })
    });
    if (response.status === 202) return { success: true };
    let message = response.statusText || `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.error || body.message || message;
    } catch (_) {}
    const error = new Error(String(message).slice(0, 250));
    error.status = response.status;
    throw error;
  } finally {
    clearTimeout(timer);
    // The SDK's httpSend returns on 202 without releasing its response body.
    // Explicitly cancel it so sockets are reusable even during a receipt burst.
    try { await response?.body?.cancel(); } catch (_) {}
  }
}
