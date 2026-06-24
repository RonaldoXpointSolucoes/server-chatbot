import express from 'express';
import multer from 'multer';
import { pipeline } from '@xenova/transformers';
import { supabase } from '../supabase.js';
import { PDFParse } from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';
import autoRagTrainer from '../automation-worker/auto-rag-trainer.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB

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
        const agent_id = req.headers['x-agent-id'] || req.body?.agent_id || null;
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

        console.log(`[Upload Debug] File: ${originalname}, Mime: ${mimetype}, Buffer Size: ${buffer.length}, Extracted Content Length: ${content?.length || 0}`);

        if (!content || content.trim() === '') {
            console.log(`[Upload Debug] Failed: Content is empty or undetectable.`);
            return res.status(400).json({ error: 'Arquivo vazio ou texto indetectável.' });
        }

        // 1. Grava na knowledge_documents para aparecer na UI
        const { data: docData, error: docError } = await supabase
            .from('knowledge_documents')
            .insert([{
                tenant_id,
                agent_id,
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
                
                // Grava inicialmente a quantidade total de chunks
                await supabase.from('knowledge_documents').update({
                    metadata: { 
                        size, 
                        chunks_total: chunks.length, 
                        chunks_processed: 0,
                        current_status: 'Carregando pipeline de Inteligência Artificial...' 
                    }
                }).eq('id', documentId);

                const transformer = await EmbeddingsPipeline.getInstance();

                const dbChunks = [];

                // Vetorizar todos os Chunks usando a IA embarcada
                for (let i = 0; i < chunks.length; i++) {
                    const chunkText = chunks[i];
                    
                    // Atualiza o progresso no banco de dados
                    await supabase.from('knowledge_documents').update({
                        metadata: { 
                            size, 
                            chunks_total: chunks.length, 
                            chunks_processed: i,
                            current_status: `Vetorizando trecho ${i + 1} de ${chunks.length}...`
                        }
                    }).eq('id', documentId);

                    if(chunkText.trim().length < 5) continue;

                    // Gerar matriz de similaridade
                    const output = await transformer(chunkText, { pooling: 'mean', normalize: true });
                    const embeddingVector = Array.from(output.data);

                    dbChunks.push({
                        document_id: documentId,
                        tenant_id,
                        agent_id,
                        content: chunkText,
                        embedding: embeddingVector,
                        chunk_index: i
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
                    await supabase.from('knowledge_documents').update({
                        metadata: { 
                            size, 
                            chunks_total: chunks.length, 
                            chunks_processed: chunks.length - 1,
                            current_status: 'Salvando vetores semânticos no banco de dados...' 
                        }
                    }).eq('id', documentId);

                    await supabase.from('knowledge_chunks').insert(dbChunks);
                }

                // Arquivo 100% lido pela IA.
                await supabase.from('knowledge_documents').update({ 
                    status: 'ready',
                    metadata: { 
                        size, 
                        chunks_total: chunks.length, 
                        chunks_processed: chunks.length,
                        current_status: 'Concluído com sucesso!' 
                    }
                }).eq('id', documentId);

            } catch (bgError) {
                console.error("Erro crítico no Pipeline RAG:", bgError);
                await supabase.from('knowledge_documents').update({ 
                    status: 'error', 
                    metadata: { 
                        size,
                        err: bgError.message, 
                        current_status: `Falha: ${bgError.message}` 
                    } 
                }).eq('id', documentId);
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
        const agent_id = req.headers['x-agent-id'];
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        let query = supabase
            .from('knowledge_documents')
            .select('*')
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false });

        if (agent_id) {
            query = query.eq('agent_id', agent_id);
        } else {
            query = query.is('agent_id', null);
        }

        const { data, error } = await query;
        res.json(data);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Resgata o conteúdo completo extraído do documento (Concatenando os chunks)
router.get('/:id/content', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'];
        const agent_id = req.headers['x-agent-id'];
        const docId = req.params.id;

        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        let query = supabase
            .from('knowledge_chunks')
            .select('content, chunk_index')
            .eq('document_id', docId)
            .eq('tenant_id', tenant_id)
            .order('chunk_index', { ascending: true, nullsFirst: false });

        if (agent_id) {
            query = query.eq('agent_id', agent_id);
        } else {
            query = query.is('agent_id', null);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Se por algum motivo existirem chunks antigos sem chunk_index, a ordem original pode não estar estritamente preservada (mas será unida).
        const fullContent = data.map(c => c.content).join(' ');
        
        res.json({ content: fullContent });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Treinamento manual do RAG a partir das últimas 20 mensagens de uma conversa
router.post('/manual-train', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id;
        const { conversationId } = req.body;

        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });
        if (!conversationId) return res.status(400).json({ error: 'conversationId required' });

        // Dispara o treinamento em background para não travar a requisição
        autoRagTrainer.trainFromResolvedConversation(tenant_id, conversationId).catch(err => {
            console.error(`[AutoRagTrainer Manual] Erro ao treinar conversa ${conversationId}:`, err);
        });

        res.json({ success: true, message: 'Treinamento manual RAG iniciado.' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});
// Atualiza o documento enviando um novo conteúdo em formato de texto (Re-vetorização)
router.put('/:id', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'];
        const agent_id = req.headers['x-agent-id'] || null;
        const docId = req.params.id;
        const { content } = req.body;

        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });
        if (!content || content.trim() === '') return res.status(400).json({ error: 'O conteúdo não pode ser vazio.' });

        // 1. Atualizar status na doc para processando
        let updateQuery = supabase.from('knowledge_documents').update({ status: 'processing' }).eq('id', docId).eq('tenant_id', tenant_id);
        if (agent_id) updateQuery = updateQuery.eq('agent_id', agent_id); else updateQuery = updateQuery.is('agent_id', null);
        const { error: updateError } = await updateQuery;
        
        if (updateError) throw updateError;

        // Retorna ok para a UI rapidamente.
        res.json({ status: 'processing', document_id: docId, message: 'Re-vetorização iniciada.' });

        // -- BACKGROUND PROCESS ENGINE --
        (async () => {
            try {
                // 2. Apagar TODOS os chunks antigos deste documento!
                await supabase.from('knowledge_chunks').delete().eq('document_id', docId).eq('tenant_id', tenant_id);

                // 3. Gerar novos chunks e embeddings
                const chunks = splitTextIntoChunks(content, 300, 50);
                
                // Grava inicialmente a quantidade total de chunks
                const docCheck = await supabase.from('knowledge_documents').select('metadata').eq('id', docId).single();
                const size = docCheck.data?.metadata?.size || 0;

                await supabase.from('knowledge_documents').update({
                    metadata: { 
                        size, 
                        chunks_total: chunks.length, 
                        chunks_processed: 0,
                        current_status: 'Carregando pipeline de Inteligência Artificial...' 
                    }
                }).eq('id', docId);

                const transformer = await EmbeddingsPipeline.getInstance();
                const dbChunks = [];

                for (let i = 0; i < chunks.length; i++) {
                    const chunkText = chunks[i];
                    
                    // Atualiza o progresso no banco de dados
                    await supabase.from('knowledge_documents').update({
                        metadata: { 
                            size, 
                            chunks_total: chunks.length, 
                            chunks_processed: i,
                            current_status: `Re-vetorizando trecho ${i + 1} de ${chunks.length}...`
                        }
                    }).eq('id', docId);

                    if(chunkText.trim().length < 5) continue;

                    const output = await transformer(chunkText, { pooling: 'mean', normalize: true });
                    const embeddingVector = Array.from(output.data);

                    dbChunks.push({
                        document_id: docId,
                        tenant_id,
                        agent_id,
                        content: chunkText,
                        embedding: embeddingVector,
                        chunk_index: i
                    });

                    if (dbChunks.length >= 100) {
                        await supabase.from('knowledge_chunks').insert([...dbChunks]);
                        dbChunks.length = 0;
                    }
                }

                if (dbChunks.length > 0) {
                    await supabase.from('knowledge_documents').update({
                        metadata: { 
                            size, 
                            chunks_total: chunks.length, 
                            chunks_processed: chunks.length - 1,
                            current_status: 'Salvando vetores semânticos no banco de dados...' 
                        }
                    }).eq('id', docId);

                    await supabase.from('knowledge_chunks').insert(dbChunks);
                }

                // 4. Marca doc como ready
                await supabase.from('knowledge_documents').update({ 
                    status: 'ready',
                    metadata: { 
                        size, 
                        chunks_total: chunks.length, 
                        chunks_processed: chunks.length,
                        current_status: 'Concluído com sucesso!',
                        updated_at: new Date().toISOString()
                    }
                }).eq('id', docId);

            } catch (bgError) {
                console.error("Erro crítico na Re-vetorização do RAG:", bgError);
                await supabase.from('knowledge_documents').update({ 
                    status: 'error', 
                    metadata: { 
                        err: bgError.message, 
                        current_status: `Falha na re-vetorização: ${bgError.message}` 
                    } 
                }).eq('id', docId);
            }
        })();

    } catch(e) {
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

// Excluir um documento e, por CASCADE, perde todos os vetores da IA
router.delete('/:id', async (req, res) => {
     try {
        const tenant_id = req.headers['x-tenant-id'];
        const agent_id = req.headers['x-agent-id'];
        const docId = req.params.id;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        let query = supabase.from('knowledge_documents').delete().eq('id', docId).eq('tenant_id', tenant_id);
        if (agent_id) {
            query = query.eq('agent_id', agent_id);
        } else {
            query = query.is('agent_id', null);
        }

        const { error } = await query;
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
        const agent_id = req.headers['x-agent-id'] || null;
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
             p_tenant_id: tenant_id,
             p_agent_id: agent_id
        });

        if (semanticError) throw semanticError;

        // 3. Busca Textual Exata (Keyword Match / Fallback WebSearch do Postgres)
        // Isso garante que palavras como "cadastro" e "produto" tenham peso extremo se baterem exato!
        let formattedQuery = query.trim().split(/\s+/).join(' | '); // Formata para websearch OR/AND se quiser
        let queryBuilder = supabase
            .from('knowledge_chunks')
            .select('id, document_id, content, metadata')
            .eq('tenant_id', tenant_id)
            .textSearch('content', query, { type: 'websearch', config: 'portuguese' })
            .limit(3);

        if (agent_id) {
            // Busca o texto no agent E nos globais (null)
            queryBuilder = queryBuilder.or(`agent_id.is.null,agent_id.eq.${agent_id}`);
        } else {
            queryBuilder = queryBuilder.is('agent_id', null);
        }

        const { data: textMatches, error: textError } = await queryBuilder;

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

// Função para sincronizar todas as correções de IA para um único documento RAG da empresa
async function syncCorrectionsToRagDocument(tenantId) {
    try {
        console.log(`[Corrections RAG Sync] Sincronizando correções da empresa ${tenantId} para o RAG...`);
        // 1. Busca todos os raciocínios da empresa
        const { data: corrections, error: fetchErr } = await supabase
            .from('ai_reasoning_adjustments')
            .select('user_query, original_response, corrected_response, context_summary, created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (fetchErr) throw fetchErr;

        const docName = "Manual de Raciocínio e Ajustes da I.A";

        // 2. Se não houver correções, deleta o documento do RAG
        if (!corrections || corrections.length === 0) {
            console.log(`[Corrections RAG Sync] Nenhuma correção encontrada. Excluindo documento antigo se existir.`);
            const { data: oldDoc } = await supabase
                .from('knowledge_documents')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('name', docName)
                .maybeSingle();

            if (oldDoc) {
                await supabase.from('knowledge_chunks').delete().eq('document_id', oldDoc.id).eq('tenant_id', tenantId);
                await supabase.from('knowledge_documents').delete().eq('id', oldDoc.id).eq('tenant_id', tenantId);
            }
            return;
        }

        // 3. Monta o markdown unificado do documento
        let content = `# Manual de Raciocínio, Tom de Voz e Instruções Corrigidas da I.A.\n\n`;
        content += `Este documento contém correções reais feitas por atendentes humanos para guiar as respostas da I.A. Siga de forma estrita as diretrizes de tom, empatia, escuta ativa e as respostas corretas abaixo para obter uma conversa de altíssimo nível humano e natural.\n\n---\n\n`;
        
        corrections.forEach((c, idx) => {
            content += `## Correção ${idx + 1}:\n`;
            if (c.context_summary) {
                content += `### Memória da Conversa (Contexto):\n"${c.context_summary}"\n\n`;
            }
            content += `### Pergunta Similar do Cliente:\n"${c.user_query}"\n\n`;
            if (c.original_response) {
                content += `### Resposta Incorreta Original (Não repetir):\n"${c.original_response}"\n\n`;
            }
            content += `### Comportamento e Resposta Esperada Corrigida (Seguir esta linha):\n"${c.corrected_response}"\n\n`;
            content += `---\n\n`;
        });

        // 4. Busca ou cria o documento correspondente em knowledge_documents
        let { data: doc, error: docErr } = await supabase
            .from('knowledge_documents')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('name', docName)
            .maybeSingle();

        if (docErr) throw docErr;

        if (!doc) {
            const { data: newDoc, error: createErr } = await supabase
                .from('knowledge_documents')
                .insert([{
                    tenant_id: tenantId,
                    name: docName,
                    type: 'text/markdown',
                    status: 'processing',
                    metadata: { size: content.length, source: 'corrections_system', last_update: new Date().toISOString() }
                }])
                .select('*')
                .single();

            if (createErr) throw createErr;
            doc = newDoc;
        } else {
            // Atualiza status para processing
            await supabase
                .from('knowledge_documents')
                .update({ 
                    status: 'processing',
                    metadata: { size: content.length, source: 'corrections_system', last_update: new Date().toISOString() }
                })
                .eq('id', doc.id);
        }

        const docId = doc.id;

        // 5. Deleta trechos (chunks) antigos
        await supabase.from('knowledge_chunks').delete().eq('document_id', docId).eq('tenant_id', tenantId);

        // 6. Divide o documento em chunks e vetoriza usando o pipeline de embeddings local
        const chunks = splitTextIntoChunks(content, 350, 50);
        const transformer = await EmbeddingsPipeline.getInstance();
        const dbChunks = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunkText = chunks[i];
            if (chunkText.trim().length < 5) continue;

            const output = await transformer(chunkText, { pooling: 'mean', normalize: true });
            const embeddingVector = Array.from(output.data);

            dbChunks.push({
                document_id: docId,
                tenant_id: tenantId,
                content: chunkText,
                embedding: embeddingVector,
                chunk_index: i
            });

            if (dbChunks.length >= 100) {
                await supabase.from('knowledge_chunks').insert([...dbChunks]);
                dbChunks.length = 0;
            }
        }

        if (dbChunks.length > 0) {
            await supabase.from('knowledge_chunks').insert(dbChunks);
        }

        // 7. Marca o documento como pronto
        await supabase
            .from('knowledge_documents')
            .update({ 
                status: 'ready',
                metadata: { 
                    size: content.length, 
                    source: 'corrections_system',
                    chunks_total: chunks.length,
                    chunks_processed: chunks.length,
                    current_status: 'Concluído com sucesso!',
                    last_update: new Date().toISOString()
                }
            })
            .eq('id', docId);

        console.log(`[Corrections RAG Sync] Manual sincronizado com sucesso para o tenant ${tenantId}. Documento ID: ${docId}`);
    } catch (e) {
        console.error(`[Corrections RAG Sync] Erro crítico ao sincronizar correções para o RAG:`, e);
    }
}

// Rota para salvar alterações de raciocínio / correções da IA
router.post('/corrections', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });
 
        const { user_query, original_response, corrected_response, context_summary } = req.body;
        if (!user_query || !corrected_response) {
            return res.status(400).json({ error: 'Missing user_query or corrected_response' });
        }
 
        // 1. Vetoriza o texto da pergunta
        const transformer = await EmbeddingsPipeline.getInstance();
        const output = await transformer(user_query, { pooling: 'mean', normalize: true });
        const embedding = Array.from(output.data);
 
        // 2. Grava na tabela ai_reasoning_adjustments (se já existir para essa exata query, atualiza)
        const { data: existingAdjust } = await supabase
            .from('ai_reasoning_adjustments')
            .select('id')
            .eq('tenant_id', tenant_id)
            .eq('user_query', user_query.trim())
            .maybeSingle();
 
        let data, error;
        if (existingAdjust) {
            const updateRes = await supabase
                .from('ai_reasoning_adjustments')
                .update({
                    original_response: original_response || '',
                    corrected_response: corrected_response.trim(),
                    context_summary: context_summary ? context_summary.trim() : null,
                    embedding,
                    created_at: new Date().toISOString()
                })
                .eq('id', existingAdjust.id)
                .select('*')
                .single();
            data = updateRes.data;
            error = updateRes.error;
        } else {
            const insertRes = await supabase
                .from('ai_reasoning_adjustments')
                .insert({
                    tenant_id,
                    user_query: user_query.trim(),
                    original_response: original_response || '',
                    corrected_response: corrected_response.trim(),
                    context_summary: context_summary ? context_summary.trim() : null,
                    embedding
                })
                .select('*')
                .single();
            data = insertRes.data;
            error = insertRes.error;
        }
 
        if (error) throw error;
 
        // 3. Sincroniza o RAG Document de forma assíncrona
        syncCorrectionsToRagDocument(tenant_id).catch(err => {
            console.error('[Corrections RAG Sync] Erro no background:', err);
        });
 
        res.json({ success: true, correction: data });
    } catch (e) {
        console.error('[Corrections API] Erro ao salvar correção:', e);
        res.status(500).json({ error: e.message });
    }
});
 
// Rota para listar correções cadastradas
router.get('/corrections', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.query?.tenant_id;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });
 
        const { data, error } = await supabase
            .from('ai_reasoning_adjustments')
            .select('id, user_query, original_response, corrected_response, context_summary, created_at')
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false });
 
        if (error) throw error;
 
        res.json({ corrections: data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Rota para excluir uma correção
router.delete('/corrections/:id', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'];
        const { id } = req.params;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        const { error } = await supabase
            .from('ai_reasoning_adjustments')
            .delete()
            .eq('id', id)
            .eq('tenant_id', tenant_id);

        if (error) throw error;

        // Sincroniza o RAG Document de forma assíncrona
        syncCorrectionsToRagDocument(tenant_id).catch(err => {
            console.error('[Corrections RAG Sync] Erro no background:', err);
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Rota auxiliar IA para processar, humanizar e sugerir melhorias de respostas
router.post('/corrections/helper', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'];
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        const { text, action, tone, user_query, conversationId } = req.body;
        if (!text && action !== 'suggest' && action !== 'summarize-context') {
            return res.status(400).json({ error: 'text is required' });
        }

        const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Chave API Gemini não configurada no servidor.' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        let prompt = '';
        if (action === 'summarize-context') {
            if (!conversationId) {
                return res.status(400).json({ error: 'conversationId is required for summarize-context' });
            }

            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            let finalConvId = conversationId;

            if (!uuidRegex.test(finalConvId)) {
                const parts = conversationId.split('_');
                const contactIdPart = parts[0];
                if (uuidRegex.test(contactIdPart)) {
                    const { data: conv } = await supabase
                        .from('conversations')
                        .select('id')
                        .eq('tenant_id', tenant_id)
                        .eq('contact_id', contactIdPart)
                        .order('last_message_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (conv) {
                        finalConvId = conv.id;
                    } else {
                        return res.json({ success: true, text: 'Sem contexto disponível' });
                    }
                } else {
                    return res.json({ success: true, text: 'ID de conversa inválido' });
                }
            }

            const { data: msgs, error: msgsErr } = await supabase
                .from('messages')
                .select('text_content, sender_type')
                .eq('tenant_id', tenant_id)
                .eq('conversation_id', finalConvId)
                .order('timestamp', { ascending: false })
                .limit(10);
            
            if (msgsErr) throw msgsErr;

            let historyText = '';
            if (msgs && msgs.length > 0) {
                historyText = msgs.reverse().map(m => {
                    const sender = m.sender_type === 'bot' || m.sender_type === 'agent' ? 'IA/Atendente' : 'Cliente';
                    return `${sender}: ${m.text_content}`;
                }).join('\n');
            }

            prompt = `Você é um analista de atendimento por WhatsApp. Analise o histórico recente da conversa e crie um resumo curto (uma linha, no máximo 15 palavras) sobre qual é o principal objetivo ou contexto da conversa (ex: "Cliente quer tirar dúvidas sobre horários" ou "Cliente está reclamando do atraso na entrega").
Seja muito direto, objetivo e conciso.

Histórico da Conversa:
${historyText || '(Nenhum histórico disponível)'}

Responda APENAS com o resumo em uma linha, sem introduções, sem explicações e sem aspas.`;
        } else if (action === 'humanize') {
            prompt = `Você é um especialista em atendimento ao cliente em português do Brasil, focado em humanizar e naturalizar conversas corporativas por WhatsApp.
Mantenha a informação e o sentido do texto original, mas reescreva-o de forma extremamente amigável, acolhedora, natural e profissional. Use expressões comuns no Brasil como "Com certeza!", "Pode deixar!", "Sem problemas!", mas sem soar exagerado. Adicione emojis calorosos e adequados se apropriado.

Texto original para humanizar:
"${text}"

Responda APENAS com o texto humanizado reescrito, sem introduções, sem explicações e sem aspas.`;
        } else if (action === 'tone') {
            let toneInstructions = '';
            if (tone === 'casual') {
                toneInstructions = 'casual, descontraído, caloroso e informal (mas respeitoso).';
            } else if (tone === 'professional') {
                toneInstructions = 'profissional, cortês, polido, focado na resolução e formal.';
            } else if (tone === 'empathetic') {
                toneInstructions = 'extremamente empático, acolhedor, compreensivo e de suporte a problemas.';
            } else if (tone === 'enthusiastic') {
                toneInstructions = 'entusiasta, enérgico, alegre, proativo e com emojis apropriados.';
            }

            prompt = `Você é um especialista em tom de voz para mensagens de WhatsApp.
Reescreva o texto a seguir para ter um tom de voz ${toneInstructions}.
Mantenha a informação básica do texto intacta.

Texto original:
"${text}"

Responda APENAS com o texto reescrito no tom solicitado, sem explicações, sem introduções e sem aspas.`;
        } else if (action === 'emoji') {
            prompt = `Você é um especialista em engajamento de mensagens de WhatsApp.
Insira emojis apropriados, calorosos e bem-posicionados no texto a seguir para torná-lo mais dinâmico e amigável. Não exagere na quantidade (use de 2 a 4 emojis bem selecionados). Mantenha as palavras idênticas.

Texto original:
"${text}"

Responda APENAS com o texto modificado, sem explicações, sem introduções e sem aspas.`;
        } else if (action === 'grammar') {
            prompt = `Corrija quaisquer erros gramaticais, ortográficos ou de digitação no texto a seguir, mantendo exatamente o mesmo sentido e estilo original.

Texto original:
"${text}"

Responda APENAS com o texto corrigido, sem explicações, sem introduções e sem aspas.`;
        } else if (action === 'suggest') {
            prompt = `Você é um assistente de inteligência artificial de alto nível.
O atendente quer que você sugira uma resposta perfeita, humanizada e empática para um cliente no WhatsApp.
O contexto é o seguinte:
- Mensagem/Pergunta recebida do cliente: "${user_query}"
- Resposta original incorreta/robotizada que a IA gerou antes: "${text || ''}"

Escreva uma resposta excelente que resolva a dúvida do cliente de maneira humana, natural, educada e calorosa. Use emojis de forma equilibrada.

Responda APENAS com a resposta sugerida, sem introduções, sem explicações e sem aspas.`;
        } else if (action === 'simplify') {
            prompt = `Você é um especialista em comunicação clara e humanizada por WhatsApp.
Reescreva a mensagem a seguir de forma extremamente direta, simples e amigável.
Remova jargões, termos corporativos engessados ou formalidades excessivas.
Mantenha a informação essencial intacta de forma coloquial e acolhedora.

Texto original:
"${text}"

Responda APENAS com a resposta simplificada reescrita, sem introduções, sem explicações e sem aspas.`;
        } else if (action === 'empathize') {
            prompt = `Você é um especialista em atendimento ao cliente focado em empatia profunda, escuta ativa e acolhimento por WhatsApp.
Reescreva a mensagem a seguir validando os sentimentos do cliente, usando conectores amigáveis de suporte (como "Entendo perfeitamente", "Deixa comigo que vou resolver", "Peço desculpas") e adicione emojis calorosos de forma equilibrada.

Texto original:
"${text}"

Responda APENAS com o texto empático reescrito, sem introduções, sem explicações e sem aspas.`;
        } else {
            return res.status(400).json({ error: 'Ação auxiliar inválida' });
        }

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();

        res.json({ success: true, text: responseText });
    } catch (e) {
        console.error('[Corrections Helper API] Erro:', e);
        res.status(500).json({ error: e.message });
    }
});

// Rota de treinamento multimodal (Imagens e Áudio) para alinhar e calibrar o robô
router.post('/train-multimodal', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id;
        const { botId, text, images, audio, destination } = req.body;

        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });
        if (!botId) return res.status(400).json({ error: 'botId required' });

        const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Chave API Gemini não configurada no servidor.' });
        }

        // 1. Busca o robô no banco
        const { data: bot, error: botErr } = await supabase
            .from('bots')
            .select('*')
            .eq('id', botId)
            .single();

        if (botErr || !bot) {
            return res.status(404).json({ error: 'Robô não encontrado.' });
        }

        const currentPrompt = bot.systemPrompt || bot.system_prompt || '';

        // 2. Inicializa o Gemini
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-2.5-flash',
            generationConfig: { responseMimeType: 'application/json' }
        });

        const systemPrompt = `Você é um Engenheiro de Prompt e Analista de Treinamento de IA de Elite.
Você está analisando feedback de treinamento para um chatbot (atendente virtual).
O usuário enviará:
- Um texto explicando a situação e qual é o comportamento desejado.
- Prints (capturas de tela) que mostram o comportamento incorreto da IA ou como ela agiu e como gostaríamos que ela se comportasse.
- Um áudio opcional com explicações adicionais sobre o caso.
- O prompt de sistema atual do robô.

Sua missão é deduzir a regra de negócio/comportamento desejado e gerar correções.
Você deve retornar ESTRITAMENTE um JSON com três campos:
{
  "analysis": "Explicação curta do que foi identificado de erro e como foi corrigido",
  "suggestedPromptChanges": "Novas diretrizes ou regras bem estruturadas (em formato de lista de tópicos em português) que devem ser adicionadas ao prompt do robô para corrigir a rota. Devem ser claras e fáceis de a IA obedecer. Não inclua os campos técnicos do prompt original, apenas as regras adicionais de comportamento de forma textual.",
  "ragFacts": ["Fato/regra de negócio 1 extraída em português", "Fato/regra de negócio 2 extraída em português"]
}

REGRAS DE CONTEÚDO:
1. Gere regras e fatos concisos, diretos e declarativos, em português brasileiro nativo.
2. Evite mencionar dados pessoais confidenciais do cliente nas regras (como telefones reais, CPFs, nomes).
3. Se a intenção do usuário for alterar o prompt, foque em gerar regras de comportamento para 'suggestedPromptChanges'.
4. Se for para adicionar conhecimento (RAG), gere fatos objetivos sobre a empresa ou regras gerais em 'ragFacts'.
`;

        const userInstructions = `
Aqui estão os dados para treinamento do robô:
- Nome do Robô: "${bot.name}"
- Descrição do Robô: "${bot.description || ''}"
- Prompt de Sistema Atual do Robô:
"""
${currentPrompt}
"""

- Explicação do usuário sobre o comportamento desejado/situação:
"${text || 'Sem descrição em texto.'}"

Por favor, analise a imagem (ou imagens) e o áudio fornecidos junto com a descrição acima para entender o erro ocorrido e como a rota do robô deve ser corrigida. Retorne o JSON com as correções sugeridas.
`;

        const parts = [
            { text: systemPrompt },
            { text: userInstructions }
        ];

        // Helper para limpar base64
        const cleanBase64 = (base64Str) => {
            if (!base64Str) return null;
            const commaIdx = base64Str.indexOf(',');
            if (commaIdx !== -1) {
                return base64Str.substring(commaIdx + 1);
            }
            return base64Str;
        };

        if (images && Array.isArray(images)) {
            for (const img of images) {
                const cleaned = cleanBase64(img.base64);
                if (cleaned) {
                    parts.push({
                        inlineData: {
                            data: cleaned,
                            mimeType: img.mimeType || 'image/png'
                        }
                    });
                }
            }
        }

        if (audio && audio.base64) {
            const cleanedAudio = cleanBase64(audio.base64);
            if (cleanedAudio) {
                parts.push({
                    inlineData: {
                        data: cleanedAudio,
                        mimeType: audio.mimeType || 'audio/webm'
                    }
                });
            }
        }

        console.log(`[MultimodalTrain] Enviando requisição multimodal para o Gemini para o bot ${botId}`);
        const result = await model.generateContent(parts);
        const responseText = result.response.text().trim();

        let analysisResult;
        try {
            analysisResult = JSON.parse(responseText);
        } catch (parseErr) {
            let cleanText = responseText;
            if (cleanText.includes('```json')) {
                cleanText = cleanText.split('```json')[1].split('```')[0].trim();
            } else if (cleanText.includes('```')) {
                cleanText = cleanText.split('```')[1].split('```')[0].trim();
            }
            analysisResult = JSON.parse(cleanText);
        }

        let savedToPrompt = false;
        let savedToRag = false;
        let ragFactsCount = 0;
        let promptChangesText = '';

        // Se destino for prompt ou ambos
        if ((destination === 'prompt' || destination === 'both') && analysisResult.suggestedPromptChanges) {
            const promptChanges = analysisResult.suggestedPromptChanges.trim();
            if (promptChanges.length > 5) {
                promptChangesText = promptChanges;
                const trainingHeader = `\n\n### REGRAS ADICIONAIS DE TREINAMENTO E CORREÇÃO DE ROTA (Atualizado em ${new Date().toLocaleDateString('pt-BR')}):\n`;
                const updatedPrompt = currentPrompt + trainingHeader + promptChanges;

                const { error: updateErr } = await supabase
                    .from('bots')
                    .update({ systemPrompt: updatedPrompt, updated_at: new Date().toISOString() })
                    .eq('id', botId);

                if (updateErr) throw updateErr;
                savedToPrompt = true;
            }
        }

        // Se destino for RAG ou ambos
        if ((destination === 'rag' || destination === 'both') && analysisResult.ragFacts && Array.isArray(analysisResult.ragFacts)) {
            const facts = analysisResult.ragFacts.filter(f => f && f.trim().length > 5);
            if (facts.length > 0) {
                ragFactsCount = facts.length;
                const docName = `Treinamento Multimodal (Áudio/Imagem) - Bot: ${bot.name}`;

                let { data: doc, error: docSeekErr } = await supabase.from('knowledge_documents')
                    .select('id')
                    .eq('tenant_id', tenant_id)
                    .eq('agent_id', botId)
                    .eq('name', docName)
                    .maybeSingle();

                if (docSeekErr || !doc) {
                    const { data: newDoc, error: createErr } = await supabase.from('knowledge_documents')
                        .insert({
                            tenant_id,
                            agent_id: botId,
                            name: docName,
                            type: 'text/plain',
                            status: 'processed',
                            metadata: { source: 'multimodal-trainer', trained_at: new Date().toISOString() }
                        })
                        .select('id')
                        .single();

                    if (createErr || !newDoc) throw createErr;
                    doc = newDoc;
                }

                const docId = doc.id;
                const transformer = await EmbeddingsPipeline.getInstance();

                for (let i = 0; i < facts.length; i++) {
                    const fact = facts[i];
                    const output = await transformer(fact, { pooling: 'mean', normalize: true });
                    const embeddingVector = Array.from(output.data);

                    const { error: chunkErr } = await supabase.from('knowledge_chunks').insert({
                        document_id: docId,
                        tenant_id,
                        agent_id: botId,
                        content: fact,
                        embedding: embeddingVector,
                        chunk_index: i,
                        metadata: {
                            source: 'multimodal-trainer',
                            trained_at: new Date().toISOString()
                        }
                    });
                    if (chunkErr) {
                        console.error("[MultimodalTrain] Erro ao inserir chunk RAG:", chunkErr);
                    }
                }
                savedToRag = true;
            }
        }

        res.json({
            success: true,
            analysis: analysisResult.analysis,
            savedToPrompt,
            savedToRag,
            ragFactsCount,
            promptChangesText,
            message: 'Treinamento multimodal processado com sucesso.'
        });

    } catch (e) {
        console.error('[MultimodalTrain API] Erro:', e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
