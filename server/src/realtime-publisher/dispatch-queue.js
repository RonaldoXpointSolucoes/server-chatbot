/** A shared budget prevents historical receipts from opening unlimited HTTP sockets. */
export class RealtimeDispatchQueue {
  constructor({ concurrency = 4, dispatch }) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid concurrency');
    this.concurrency = concurrency;
    this.dispatch = dispatch;
    this.active = 0;
    this.high = [];
    this.low = [];
    this.pendingByKey = new Map();
    this.scheduled = false;
  }

  enqueue(value, { priority = 'high', coalesceKey = null, merge = (_, next) => next } = {}) {
    const pending = coalesceKey ? this.pendingByKey.get(coalesceKey) : null;
    if (pending) {
      pending.value = merge(pending.value, value);
      return pending.promise;
    }
    const task = { value, coalesceKey };
    task.promise = new Promise((resolve, reject) => {
      task.resolve = resolve;
      task.reject = reject;
    });
    if (coalesceKey) this.pendingByKey.set(coalesceKey, task);
    (priority === 'low' ? this.low : this.high).push(task);
    this.schedule();
    return task.promise;
  }

  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    // Yield between dispatches so a burst cannot starve HTTP/WhatsApp callbacks.
    setImmediate(() => {
      this.scheduled = false;
      this.drain();
    });
  }

  drain() {
    while (this.active < this.concurrency && (this.high.length || this.low.length)) {
      const task = (this.high.length ? this.high : this.low).shift();
      if (task.coalesceKey) this.pendingByKey.delete(task.coalesceKey);
      this.active++;
      Promise.resolve()
        .then(() => this.dispatch(task.value))
        .then(task.resolve, task.reject)
        .finally(() => {
          this.active--;
          this.schedule();
        });
    }
  }
}

const statusRank = { pending: 0, sent: 1, SERVER_ACK: 2, delivered: 3, read: 4, played: 5 };

export function receiptDispatchOptions(channelName, eventType, payload) {
  const messageId = payload?.whatsapp_message_id || payload?.id;
  if (eventType !== 'message.update' || !messageId || !Object.hasOwn(statusRank, payload?.status)) return {};
  return {
    priority: 'low',
    coalesceKey: `${channelName}:${eventType}:${messageId}`,
    merge: (previous, next) => ({
      ...next,
      payload: {
        ...previous.payload,
        ...next.payload,
        status: statusRank[previous.payload.status] > statusRank[next.payload.status]
          ? previous.payload.status : next.payload.status
      }
    })
  };
}
