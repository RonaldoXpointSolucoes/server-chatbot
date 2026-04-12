import express from 'express';
import multer from 'multer';
import { pipeline } from '@xenova/transformers';
import { supabase } from '../supabase.js';
import { PDFParse } from 'pdf-parse';


const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Singleton para o modelo de embeddings local, grátis e offline
class EmbeddingsPipeline {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance = null;

  static async getInstance(progress_callback = null) {
    if (this.instance === null) {
      // Primeira vez ele vai baixar do HuggingFace (~22MB) pro sistema local
      this.instance = await pipeline(this.task, this.model, { quantized: true, progress_callback });
    }
    return this.instance;
  }
}

// Helper: Text Splitter (Chunking semântico básico)
function splitTextIntoChunks(text, chunkSize = 300, overlap = 50) {
  const words = text.split(/\s+/);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    chunks.push(chunk);
    i += (chunkSize - overlap);
  }
  return chunks;
}

// Rota de Injeção RAG (Upload de Arquivos multi-empresa)
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        // Obrigatório passar o x-tenant-id em multitenant
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

        const { originalname, buffer, mimetype, size } = req.file;

        let content = '';

        // Extração de Textos PDF vs outros (TXT, CSV)
        if (mimetype === 'application/pdf') {
            const parser = new PDFParse({ data: buffer });
            const data = await parser.getText();
            content = data.text;
            await parser.destroy();
        } else {
            content = buffer.toString('utf-8');
        }

        if (!content || content.trim() === '') {
            return res.status(400).json({ error: 'Arquivo vazio ou texto indetectável.' });
        }

        // 1. Grava na knowledge_documents para aparecer na UI
        const { data: docData, error: docError } = await supabase
            .from('knowledge_documents')
            .insert([{
                tenant_id,
                name: originalname,
                type: mimetype,
                status: 'processing',
                metadata: { size }
            }])
            .select('*')
            .single();

        if (docError) throw docError;

        const documentId = docData.id;

        // Responder com sucesso rápido para UI (evitar timeout) e delegar processamento pesado!
        res.json({ status: 'processing', document_id: documentId, message: 'Vetorização iniciada.' });

        // -- BACKGROUND PROCESS ENGINE --
        (async () => {
            try {
                const chunks = splitTextIntoChunks(content, 300, 50);
                const transformer = await EmbeddingsPipeline.getInstance();

                const dbChunks = [];

                // Vetorizar todos os Chunks usando a IA embarcada
                for (let i = 0; i < chunks.length; i++) {
                    const chunkText = chunks[i];
                    if(chunkText.trim().length < 5) continue;

                    // Gerar matriz de similaridade
                    const output = await transformer(chunkText, { pooling: 'mean', normalize: true });
                    const embeddingVector = Array.from(output.data);

                    dbChunks.push({
                        document_id: documentId,
                        tenant_id,
                        content: chunkText,
                        embedding: embeddingVector
                    });
                    
                    // Supabase tem limites de inserção por lote. Caso DBChunks fique gigante, fariamos batch.
                    // Inserindo em lotes de 100 para evitar payload grande demais.
                    if (dbChunks.length >= 100) {
                        await supabase.from('knowledge_chunks').insert([...dbChunks]);
                        dbChunks.length = 0;
                    }
                }

                // Inserir o resto
                if (dbChunks.length > 0) {
                    await supabase.from('knowledge_chunks').insert(dbChunks);
                }

                // Arquivo 100% lido pela IA.
                await supabase.from('knowledge_documents').update({ status: 'ready' }).eq('id', documentId);

            } catch (bgError) {
                console.error("Erro crítico no Pipeline RAG:", bgError);
                await supabase.from('knowledge_documents').update({ status: 'error', metadata: { err: bgError.message } }).eq('id', documentId);
            }
        })();

    } catch(err) {
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

// Listar seus documentos (Isolados pelo RLS / tenant)
router.get('/', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'];
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        const { data, error } = await supabase
            .from('knowledge_documents')
            .select('*')
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Excluir um documento e, por CASCADE, perde todos os vetores da IA
router.delete('/:id', async (req, res) => {
     try {
        const tenant_id = req.headers['x-tenant-id'];
        const docId = req.params.id;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        const { error } = await supabase.from('knowledge_documents').delete().eq('id', docId).eq('tenant_id', tenant_id);
        if (error) throw error;

        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// API de TESTE de Matching (Para provar o RAG com Supabase pgvector)
router.post('/match', async (req, res) => {
   try {
        const tenant_id = req.headers['x-tenant-id'];
        const { query } = req.body;
        
        if (!query || !tenant_id) return res.status(400).json({ error: 'Missing query or tenant' });

        // 1. Vetoriza a frase da pergunta
        const transformer = await EmbeddingsPipeline.getInstance();
        const output = await transformer(query, { pooling: 'mean', normalize: true });
        const queryEmbedding = Array.from(output.data);

        // 2. Busca Semântica (IA) com Assertividade Elevada (match_threshold 0.45)
        const { data: semanticMatches, error: semanticError } = await supabase.rpc('match_knowledge_chunks', {
             query_embedding: queryEmbedding,
             match_threshold: 0.45,
             match_count: 5,
             p_tenant_id: tenant_id
        });

        if (semanticError) throw semanticError;

        // 3. Busca Textual Exata (Keyword Match / Fallback WebSearch do Postgres)
        // Isso garante que palavras como "cadastro" e "produto" tenham peso extremo se baterem exato!
        let formattedQuery = query.trim().split(/\s+/).join(' | '); // Formata para websearch OR/AND se quiser
        const { data: textMatches, error: textError } = await supabase
            .from('knowledge_chunks')
            .select('id, document_id, content, metadata')
            .eq('tenant_id', tenant_id)
            .textSearch('content', query, { type: 'websearch', config: 'portuguese' })
            .limit(3);

        // 4. Fusão e Deduplicação (Algoritmo de Reciprocal Rank Fusion / Bônus Simplificado)
        const fusionMap = new Map();

        // Processa Semântica
        if (semanticMatches) {
            semanticMatches.forEach(match => {
                fusionMap.set(match.id, { 
                    ...match, 
                    method: 'Semântico (RAG)', 
                    finalScore: match.similarity 
                });
            });
        }

        // Processa Textual
        if (textMatches && !textError) {
            textMatches.forEach(match => {
                if (fusionMap.has(match.id)) {
                    // Match perfeito: A semântica E a palavra-chave encontraram o mesmo texto. Bônus massivo!
                    const existing = fusionMap.get(match.id);
                    existing.finalScore += 0.25; 
                    existing.method = 'Sinergia Híbrida (Vetor + Exact)';
                } else {
                    // Encontrado APENAS pela palavra chave exata. Assume grau forte (75%).
                    fusionMap.set(match.id, { 
                        ...match, 
                        similarity: 0.75, 
                        method: 'Exato (Lexical)', 
                        finalScore: 0.75 
                    });
                }
            });
        }

        // Ordena os Campeões Absolutos
        const finalMatches = Array.from(fusionMap.values())
            .sort((a, b) => b.finalScore - a.finalScore)
            .slice(0, 4) // Retorna os 4 arquivos mais tops
            .map(m => ({
                 content: m.content,
                 similarity: m.finalScore > 1 ? 1 : m.finalScore, // Trava maximo em 100%
                 method: m.method
            }));

        res.json({ matches: finalMatches });
   } catch(e) {
        res.status(500).json({ error: e.message });
   }
});

export default router;
