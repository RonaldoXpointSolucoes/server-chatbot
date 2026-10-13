import { pipeline } from '@xenova/transformers';
import { startEmbeddingWorker } from './worker-runtime.js';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

const models = new Map();
async function getModel(job, progress) {
    const key = `${job.task}:${job.model}:${job.quantized}`;
    if (!models.has(key)) {
        const loading = pipeline(job.task, job.model, {
            quantized: job.quantized,
            progress_callback: progress
        }).catch(error => { models.delete(key); throw error; });
        models.set(key, loading);
    }
    return models.get(key);
}
startEmbeddingWorker({
    load: async (job, progress) => { await getModel(job, progress); return { ready: true }; },
    embed: async (job, progress) => {
        const extractor = await getModel(job, progress);
        const output = await extractor(job.text, job.options);
        return { data: Float32Array.from(output.data), dims: output.dims, type: output.type };
    }
});
