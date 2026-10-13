import { startEmbeddingWorker } from '../../src/embeddings/worker-runtime.js';
startEmbeddingWorker({
    load: async () => ({ ready: true }),
    embed: async job => {
        if (job.text === 'fail') throw new Error('Synthetic embedding failure');
        const until = Date.now() + (job.options?.busyMs || 0);
        while (Date.now() < until) Math.sqrt(12345);
        return { data: Float32Array.of(Number(job.text)), dims: [1, 1], type: 'float32' };
    }
});
