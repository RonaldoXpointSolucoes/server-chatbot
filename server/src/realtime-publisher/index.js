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
    if (!tenantId || !instanceId) return Promise.resolve(false);
    return this.enqueue(`tenant:${tenantId}:instance:${instanceId}`, eventType, payload).catch(() => false);
  }

  publishInboxEvent(tenantId, eventType, payload) {
    if (!tenantId) return Promise.resolve(false);
    return this.enqueue(`tenant:${tenantId}:inbox`, eventType, payload).catch(() => false);
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
        return true;
      } catch (error) {
        const message = error?.message || String(error);
        const isNetworkError = error?.name === 'AbortError' || /aborted|timeout|fetch failed/i.test(message);
        const isGatewayError = error?.status >= 500 || /Bad Gateway|502|503|504|520|522|524|Gateway Timeout/i.test(message);
        const isTransientRealtimeError = /Tenant not found in database|Realtime is restarting|Unable to connect/i.test(message);
        if ((isNetworkError || isGatewayError || isTransientRealtimeError) && attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 600 * Math.pow(2, attempt - 1)));
          continue;
        }
        console.log(`[RealtimePublisher/Supabase] Broadcast HTTP ${eventType} ignorado após oscilação (${message}); sincronização garantida via banco.`);
        // Resolve gracefully so callers (e.g. BatchProcessor.flushQueue) never abort message processing on transient Realtime hiccups.
        return false;
      }
    }
    return false;
  }
}

export default new RealtimePublisher();
