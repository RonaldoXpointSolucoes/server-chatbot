import { Worker } from 'node:worker_threads';

export class EmbeddingWorkerClient {
    constructor({ workerURL = new URL('./worker.js', import.meta.url), timeoutMs = 300000 } = {}) {
        this.workerURL = workerURL;
        this.timeoutMs = timeoutMs;
        this.worker = null;
        this.pending = new Map();
        this.nextId = 0;
        this.closed = false;
    }

    ensureWorker() {
        if (this.closed) throw new Error('Embedding worker is closed');
        if (this.worker) return this.worker;
        const worker = new Worker(this.workerURL, {
            execArgv: [],
            resourceLimits: { maxOldGenerationSizeMb: 512 }
        });
        this.worker = worker;
        worker.unref();
        worker.on('message', message => {
            if (this.worker !== worker) return;
            const request = this.pending.get(message.id);
            if (!request) return;
            if (message.type === 'progress') {
                try { request.progress?.(message.progress); } catch {}
                return;
            }
            clearTimeout(request.timer);
            this.pending.delete(message.id);
            if (this.pending.size === 0) worker.unref();
            if (message.type === 'error') request.reject(new Error(message.error));
            else request.resolve(message.result);
        });
        worker.on('error', error => this.failWorker(worker, error));
        worker.on('exit', code => this.failWorker(worker, new Error(`Embedding worker exited (${code})`)));
        return worker;
    }

    failWorker(worker, error) {
        if (this.worker !== worker) return;
        this.worker = null;
        for (const request of this.pending.values()) {
            clearTimeout(request.timer);
            request.reject(error);
        }
        this.pending.clear();
        worker.terminate().catch(() => {});
    }

    request(payload, progress = null) {
        const worker = this.ensureWorker();
        const id = ++this.nextId;
        worker.ref();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => this.failWorker(worker, new Error('Embedding worker timeout')), this.timeoutMs);
            this.pending.set(id, { resolve, reject, timer, progress });
            try { worker.postMessage({ ...payload, id }); }
            catch (error) {
                clearTimeout(timer);
                this.pending.delete(id);
                if (this.pending.size === 0) worker.unref();
                reject(error);
            }
        });
    }

    async close() {
        this.closed = true;
        const worker = this.worker;
        if (worker) {
            this.failWorker(worker, new Error('Embedding worker stopped'));
            await worker.terminate();
        }
    }
}
