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
    const channel = this.getChannel(channelName);
    const fullPayload = {
      ...payload,
      timestamp: new Date().toISOString()
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
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
        const isAbortOrTimeout = e.name === 'AbortError' || e.message?.includes('aborted') || e.message?.includes('timeout') || e.message?.includes('fetch failed');
        if (attempt === 1 && isAbortOrTimeout) {
          await new Promise(r => setTimeout(r, 400));
          continue;
        }
        if (isAbortOrTimeout) {
          // Log suprimido para evitar poluição visual de logs em picos de concorrência
        } else {
          console.error("[RealtimePublisher] Error publishInstanceEvent:", e.message || e);
        }
      }
    }
  }

  async publishInboxEvent(tenantId, eventType, payload) {
    if (!tenantId) return;
    const channelName = `tenant:${tenantId}:inbox`;
    const channel = this.getChannel(channelName);
    const fullPayload = {
      ...payload,
      timestamp: new Date().toISOString()
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
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
        const isAbortOrTimeout = e.name === 'AbortError' || e.message?.includes('aborted') || e.message?.includes('timeout') || e.message?.includes('fetch failed');
        if (attempt === 1 && isAbortOrTimeout) {
          await new Promise(r => setTimeout(r, 400));
          continue;
        }
        if (isAbortOrTimeout) {
          // Log suprimido para evitar poluição visual de logs em picos de concorrência
        } else {
          console.error("[RealtimePublisher] Error publishInboxEvent:", e.message || e);
        }
      }
    }
  }
}

export default new RealtimePublisher();
