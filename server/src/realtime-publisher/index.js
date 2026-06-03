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
    try {
      const channelName = `tenant:${tenantId}:instance:${instanceId}`;
      const channel = this.getChannel(channelName);
      await channel.httpSend(eventType, {
        ...payload,
        timestamp: new Date().toISOString()
      });
    } catch(e) {
      console.error("[RealtimePublisher] Error publishInstanceEvent:", e);
    }
  }

  async publishInboxEvent(tenantId, eventType, payload) {
    if (!tenantId) return;
    try {
      const channelName = `tenant:${tenantId}:inbox`;
      const channel = this.getChannel(channelName);
      await channel.httpSend(eventType, {
        ...payload,
        timestamp: new Date().toISOString()
      });
    } catch(e) {
      console.error("[RealtimePublisher] Error publishInboxEvent:", e);
    }
  }
}

export default new RealtimePublisher();
