import { supabase } from '../supabase.js';

class RealtimePublisher {
  constructor() {
    this.channels = new Map();
  }

  async getChannel(channelName) {
    if (this.channels.has(channelName)) {
      return this.channels.get(channelName);
    }
    
    return new Promise((resolve, reject) => {
      const channel = supabase.channel(channelName);
      
      const timeout = setTimeout(() => {
        supabase.removeChannel(channel);
        reject(new Error('Timeout subscribing to channel: ' + channelName));
      }, 5000);

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          this.channels.set(channelName, channel);
          resolve(channel);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          supabase.removeChannel(channel);
          this.channels.delete(channelName);
          reject(new Error('Failed to subscribe: ' + status));
        }
      });
    });
  }

  async publishInstanceEvent(tenantId, instanceId, eventType, payload) {
    if (!tenantId || !instanceId) return;
    try {
      const channelName = `tenant:${tenantId}:instance:${instanceId}`;
      const channel = await this.getChannel(channelName);
      await channel.send({
        type: 'broadcast',
        event: eventType,
        payload: { ...payload, timestamp: new Date().toISOString() }
      });
    } catch(e) {
      console.error("[RealtimePublisher] Error publishInstanceEvent:", e);
    }
  }

  async publishInboxEvent(tenantId, eventType, payload) {
    if (!tenantId) return;
    try {
      const channelName = `tenant:${tenantId}:inbox`;
      const channel = await this.getChannel(channelName);
      await channel.send({
        type: 'broadcast',
        event: eventType,
        payload: { ...payload, timestamp: new Date().toISOString() }
      });
    } catch(e) {
      console.error("[RealtimePublisher] Error publishInboxEvent:", e);
    }
  }
}

export default new RealtimePublisher();
