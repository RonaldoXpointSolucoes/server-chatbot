import { parentPort } from 'node:worker_threads';

export function startEmbeddingWorker({ load, embed }) {
    const queue = [];
    let running = false;
    let sequence = 0;
    async function drain() {
        if (running || !queue.length) return;
        running = true;
        queue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
        const job = queue.shift();
        const progress = value => parentPort.postMessage({ id: job.id, type: 'progress', progress: value });
        try {
            const result = job.op === 'load' ? await load(job, progress) : await embed(job, progress);
            const transfer = result?.data?.buffer instanceof ArrayBuffer ? [result.data.buffer] : [];
            parentPort.postMessage({ id: job.id, type: 'result', result }, transfer);
        } catch (error) {
            parentPort.postMessage({ id: job.id, type: 'error', error: error.message || 'Embedding failed' });
        } finally {
            running = false;
            // Allow interactive requests to enter the queue between background chunks.
            setImmediate(drain);
        }
    }
    parentPort.on('message', job => {
        queue.push({ ...job, sequence: ++sequence, priority: Number(job.priority) || 10 });
        setImmediate(drain);
    });
}
