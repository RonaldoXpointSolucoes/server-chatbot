import { supabase } from '../supabase.js';

class RealtimePublisher {
  constructor() {
    this.channels = new Map();
  }

  getChannel(channelName) {
    if (this.channels.has(channelName)) {
      return this.channels.get(channelName);
    }
    const channel = supabase.channel(channelName);
    this.channels.set(channelName, channel);
    return channel;
  }

  async publishInstanceEvent(tenantId, instanceId, eventType, payload) {
    if (!tenantId || !instanceId) return;
    const channelName = `tenant:${tenantId}:instance:${instanceId}`;
    const fullPayload = {
      ...payload,
      timestamp: new Date().toISOString()
    };

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const channel = this.getChannel(channelName);
        if (typeof channel.httpSend === 'function') {
          await channel.httpSend(eventType, fullPayload);
        } else if (typeof channel.send === 'function') {
          await channel.send({
            type: 'broadcast',
            event: eventType,
            payload: fullPayload
          });
        }
        return;
      } catch (e) {
        const errMsg = e.message || String(e);
        const isAbortOrTimeout = e.name === 'AbortError' || errMsg.includes('aborted') || errMsg.includes('timeout') || errMsg.includes('fetch failed');
        const isGatewayError = errMsg.includes('Bad Gateway') || errMsg.includes('502') || errMsg.includes('503') || errMsg.includes('504') || errMsg.includes('Gateway Timeout');
        const isTransient = isAbortOrTimeout || isGatewayError;

        if (isTransient && attempt < maxAttempts) {
          // Se for erro de Bad Gateway ou canal quebrado, expurga o canal em cache para recriar conexão fresca
          if (isGatewayError) {
            try {
              const oldChannel = this.channels.get(channelName);
              if (oldChannel && typeof oldChannel.unsubscribe === 'function') {
                oldChannel.unsubscribe();
              }
            } catch (unsubErr) {}
            this.channels.delete(channelName);
          }
          const backoffDelay = 500 * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, backoffDelay));
          continue;
        }

        if (isGatewayError || isAbortOrTimeout) {
          console.warn(`[RealtimePublisher] Oscilação transitória de upstream Supabase Realtime (${errMsg}) em publishInstanceEvent (${eventType}) para tenant ${tenantId}. Evento descartado graciosamente.`);
        } else {
          console.error("[RealtimePublisher] Error publishInstanceEvent:", errMsg);
        }
      }
    }
  }

  async publishInboxEvent(tenantId, eventType, payload) {
    if (!tenantId) return;
    const channelName = `tenant:${tenantId}:inbox`;
    const fullPayload = {
      ...payload,
      timestamp: new Date().toISOString()
    };

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const channel = this.getChannel(channelName);
        if (typeof channel.httpSend === 'function') {
          await channel.httpSend(eventType, fullPayload);
        } else if (typeof channel.send === 'function') {
          await channel.send({
            type: 'broadcast',
            event: eventType,
            payload: fullPayload
          });
        }
        return;
      } catch (e) {
        const errMsg = e.message || String(e);
        const isAbortOrTimeout = e.name === 'AbortError' || errMsg.includes('aborted') || errMsg.includes('timeout') || errMsg.includes('fetch failed');
        const isGatewayError = errMsg.includes('Bad Gateway') || errMsg.includes('502') || errMsg.includes('503') || errMsg.includes('504') || errMsg.includes('Gateway Timeout');
        const isTransient = isAbortOrTimeout || isGatewayError;

        if (isTransient && attempt < maxAttempts) {
          // Se for erro de Bad Gateway ou canal corrompido, limpa o canal em cache para forçar reconexão limpa
          if (isGatewayError) {
            try {
              const oldChannel = this.channels.get(channelName);
              if (oldChannel && typeof oldChannel.unsubscribe === 'function') {
                oldChannel.unsubscribe();
              }
            } catch (unsubErr) {}
            this.channels.delete(channelName);
          }
          const backoffDelay = 500 * Math.pow(2, attempt - 1);
          await new Promise(r => setTimeout(r, backoffDelay));
          continue;
        }

        if (isGatewayError || isAbortOrTimeout) {
          console.warn(`[RealtimePublisher] Oscilação transitória de upstream Supabase Realtime (${errMsg}) em publishInboxEvent (${eventType}) para tenant ${tenantId}. Evento descartado graciosamente.`);
        } else {
          console.error("[RealtimePublisher] Error publishInboxEvent:", errMsg);
        }
      }
    }
  }
}

export default new RealtimePublisher();
