import { supabase } from '../supabase.js';
import { RealtimeDispatchQueue, receiptDispatchOptions } from './dispatch-queue.js';
import { sendBroadcastHttp } from './http-broadcast.js';

class RealtimePublisher {
  constructor() {
    this.channels = new Map();
    this.dispatchQueue = new RealtimeDispatchQueue({
      concurrency: 4,
      dispatch: ({ channelName, eventType, payload }) => this.dispatch(channelName, eventType, payload)
    });
  }

  getChannel(channelName) {
    if (this.channels.has(channelName)) return this.channels.get(channelName);
    const channel = supabase.channel(channelName);
    this.channels.set(channelName, channel);
    return channel;
  }

  publishInstanceEvent(tenantId, instanceId, eventType, payload) {
    if (!tenantId || !instanceId) return Promise.resolve();
    return this.enqueue(`tenant:${tenantId}:instance:${instanceId}`, eventType, payload);
  }

  publishInboxEvent(tenantId, eventType, payload) {
    if (!tenantId) return Promise.resolve();
    return this.enqueue(`tenant:${tenantId}:inbox`, eventType, payload);
  }

  enqueue(channelName, eventType, payload) {
    return this.dispatchQueue.enqueue({
      channelName, eventType, payload: { ...payload, timestamp: new Date().toISOString() }
    }, receiptDispatchOptions(channelName, eventType, payload));
  }

  async dispatch(channelName, eventType, payload) {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await sendBroadcastHttp(this.getChannel(channelName), eventType, payload);
        return;
      } catch (error) {
        const message = error.message || String(error);
        const isNetworkError = error.name === 'AbortError' || /aborted|timeout|fetch failed/i.test(message);
        const isGatewayError = error.status >= 500 || /Bad Gateway|502|503|504|Gateway Timeout/i.test(message);
        if ((isNetworkError || isGatewayError) && attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
          continue;
        }
        console.warn(`[RealtimePublisher/Supabase] Falha ao publicar ${eventType}; evento persistente pode ser atualizado pelo banco. ${message}`);
        // Always settle the caller; a failed request must release its dispatch slot.
        throw error;
      }
    }
  }
}

export default new RealtimePublisher();
