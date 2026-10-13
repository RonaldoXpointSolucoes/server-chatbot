import { EmbeddingWorkerClient } from './client.js';

const client = new EmbeddingWorkerClient();
const pipelines = new Map();

// Preserve the existing extractor(...).data API while keeping model loading,
// inference and mean pooling entirely off the WhatsApp/HTTP event loop.
export async function pipeline(task, model, { quantized = true, progress_callback = null } = {}) {
    if (task !== 'feature-extraction') throw new Error('Only embedding pipelines are supported');
    const key = `${task}:${model}:${quantized}`;
    if (!pipelines.has(key)) {
        const loading = client.request({ op: 'load', task, model, quantized }, progress_callback)
            .then(() => async (text, { priority = 10, ...options } = {}) => client.request({
                op: 'embed', task, model, quantized, text, options, priority
            }))
            .catch(error => { pipelines.delete(key); throw error; });
        pipelines.set(key, loading);
    }
    return pipelines.get(key);
}

export async function stopEmbeddingWorker() {
    pipelines.clear();
    await client.close();
}
