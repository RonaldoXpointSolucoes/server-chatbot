import express from 'express';
import multer from 'multer';
import { pipeline } from '../embeddings/pipeline.js';
import { supabase as defaultSupabase } from '../supabase.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import autoRagTrainer from '../automation-worker/auto-rag-trainer.js';
import {
    isValidUuid,
    sanitizeRagText,
    computeNormalizedHash,
    detectSensitiveOrNoisyPatterns,
    extractTextFromFile,
    semanticChunkDocument,
    inferCategoryFromContent,
    fetchAllTenantChunks,
    analyzeCandidateForTenant,
    commitCuratedDocument,
    auditTenantKnowledgeHealth,
    sanitizeTenantKnowledgeBase,
    hybridRetrieveKnowledge as defaultHybridRetrieveKnowledge
} from './knowledge-curator.js';
import {
    startInboxDeepAnalysis as defaultStartInboxDeepAnalysis,
    getInboxAnalysisStatus as defaultGetInboxAnalysisStatus,
    getInboxAnalysisRun as defaultGetInboxAnalysisRun,
    extractBehaviorProfileSummary
} from './inbox-knowledge-analyzer.js';
import { invalidateInboxBehaviorCache as defaultInvalidateBehaviorCache } from '../automation-worker/inbox-behavior-cache.js';
import {
    encryptGeminiKey,
    decryptGeminiKey,
    buildGeminiKeyMeta,
    resolveServerOrTenantGeminiKey,
    invalidateTenantGeminiKeyCache,
    verifyGeminiProxySecurity,
    enforceGeminiBudgetGuardrails,
    redactGeminiSecrets,
    isValidPlainGeminiKey
} from '../utils/geminiVault.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB

// Singleton para o modelo de embeddings local, grátis e offline
class DefaultEmbeddingsPipeline {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance = null;

  static async getInstance(progress_callback = null) {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, this.model, { quantized: true, progress_callback });
    }
    return this.instance;
  }
}

function splitTextIntoChunks(text, documentName = 'Base', category = 'Geral') {
  return semanticChunkDocument(text, { documentName, category });
}

const suspendedKnowledgeKeys = new Set();

function buildLocalHelperFallback(action, text, user_query) {
    const baseText = String(text || user_query || '').trim();
    if (action === 'summarize-context') {
        return 'Atendimento em andamento via WhatsApp';
    }
    if (action === 'humanize' || action === 'empathize') {
        return baseText ? `Com certeza! 😊 ${baseText}` : 'Olá! Como posso te ajudar hoje? 😊';
    }
    if (action === 'emoji') {
        return baseText ? `${baseText} 😊✨` : 'Olá! 👋😊';
    }
    if (action === 'suggest') {
        return 'Olá! 😊 Entendi perfeitamente sua solicitação. Já estou verificando aqui para te ajudar da melhor forma!';
    }
    return baseText || 'Olá! Como posso te ajudar?';
}

// Função para sincronizar todas as correções de IA para um único documento RAG da empresa
export async function syncCorrectionsToRagDocument(tenantId) {
    const supabase = defaultSupabase;
    try {
        console.log(`[Corrections RAG Sync] Sincronizando correções da empresa ${tenantId} para o RAG...`);
        const { data: corrections, error: fetchErr } = await supabase
            .from('ai_reasoning_adjustments')
            .select('user_query, original_response, corrected_response, context_summary, created_at')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (fetchErr) throw fetchErr;

        const docName = "Manual de Raciocínio e Ajustes da I.A";

        if (!corrections || corrections.length === 0) {
            console.log(`[Corrections RAG Sync] Nenhuma correção encontrada. Excluindo documento antigo se existir.`);
            const { data: oldDocs } = await supabase
                .from('knowledge_documents')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('name', docName);

            if (oldDocs && oldDocs.length > 0) {
                const ids = oldDocs.map(d => d.id);
                await supabase.from('knowledge_chunks').delete().in('document_id', ids).eq('tenant_id', tenantId);
                await supabase.from('knowledge_documents').delete().in('id', ids).eq('tenant_id', tenantId);
            }
            return;
        }

        let content = `# Manual de Raciocínio, Tom de Voz e Instruções Corrigidas da I.A.\n\n`;
        content += `Este documento contém correções reais feitas por atendentes humanos para guiar as respostas da I.A.\n\n---\n\n`;

        corrections.forEach((c, idx) => {
            const cleanQuery = sanitizeRagText(c.user_query || '');
            const cleanOriginal = sanitizeRagText(c.original_response || '');
            const cleanCorrected = sanitizeRagText(c.corrected_response || '');
            const cleanContext = sanitizeRagText(c.context_summary || '');

            content += `## Correção ${idx + 1}:\n`;
            if (cleanContext) {
                content += `### Memória da Conversa (Contexto):\n"${cleanContext}"\n\n`;
            }
            content += `### Pergunta Similar do Cliente:\n"${cleanQuery}"\n\n`;
            if (cleanOriginal) {
                content += `### Resposta Incorreta Original (Não repetir):\n"${cleanOriginal}"\n\n`;
            }
            content += `### Comportamento e Resposta Esperada Corrigida (Seguir esta linha):\n"${cleanCorrected}"\n\n`;
            content += `---\n\n`;
        });

        content = sanitizeRagText(content);
        const contentHash = computeNormalizedHash(content);

        let { data: doc, error: docErr } = await supabase
            .from('knowledge_documents')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('name', docName)
            .order('created_at', { ascending: true })
            .limit(1)
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
                    content_hash: contentHash,
                    metadata: { size: content.length, category: 'Regras & Ajustes I.A.', source: 'corrections_system', content_hash: contentHash, last_update: new Date().toISOString() }
                }])
                .select('*')
                .single();

            if (createErr) throw createErr;
            doc = newDoc;
        } else {
            await supabase
                .from('knowledge_documents')
                .update({
                    status: 'processing',
                    content_hash: contentHash,
                    metadata: { size: content.length, category: 'Regras & Ajustes I.A.', source: 'corrections_system', content_hash: contentHash, last_update: new Date().toISOString() }
                })
                .eq('id', doc.id);
        }

        const docId = doc.id;
        await supabase.from('knowledge_chunks').delete().eq('document_id', docId).eq('tenant_id', tenantId);

        const chunks = semanticChunkDocument(content, {
            documentName: docName,
            category: 'Regras & Ajustes I.A.'
        });
        const transformer = await DefaultEmbeddingsPipeline.getInstance();
        const dbChunks = [];

        for (let i = 0; i < chunks.length; i++) {
            const ch = chunks[i];
            const output = await transformer(ch.embeddingText || ch.content, { pooling: 'mean', normalize: true });
            const embeddingVector = Array.from(output.data);

            dbChunks.push({
                document_id: docId,
                tenant_id: tenantId,
                content: ch.content,
                embedding: embeddingVector,
                chunk_index: i,
                metadata: {
                    document_name: docName,
                    section_title: ch.sectionTitle,
                    category: 'Regras & Ajustes I.A.',
                    chunk_hash: ch.chunkHash,
                    word_count: ch.wordCount,
                    source: 'corrections_system',
                    rag_version: '2.0'
                }
            });

            if (dbChunks.length >= 100) {
                await supabase.from('knowledge_chunks').insert([...dbChunks]);
                dbChunks.length = 0;
            }
        }

        if (dbChunks.length > 0) {
            await supabase.from('knowledge_chunks').insert(dbChunks);
        }

        await supabase
            .from('knowledge_documents')
            .update({
                status: 'ready',
                content_hash: contentHash,
                metadata: {
                    size: content.length,
                    category: 'Regras & Ajustes I.A.',
                    source: 'corrections_system',
                    content_hash: contentHash,
                    rag_version: '2.0',
                    chunks_total: chunks.length,
                    chunks_processed: chunks.length,
                    current_status: 'Concluído com sucesso!',
                    last_update: new Date().toISOString()
                }
            })
            .eq('id', docId);

        console.log(`[Corrections RAG Sync] Manual sincronizado com sucesso para o tenant ${tenantId}. Documento ID: ${docId} (${chunks.length} chunks)`);
    } catch (e) {
        console.error(`[Corrections RAG Sync] Erro crítico ao sincronizar correções para o RAG:`, e);
    }
}

export function createKnowledgeRouter(deps = {}) {
    const router = express.Router();
    const supabase = deps.supabase || defaultSupabase;
    const EmbeddingsPipeline = deps.EmbeddingsPipeline || DefaultEmbeddingsPipeline;
    const hybridRetrieveKnowledge = deps.hybridRetrieveKnowledge || defaultHybridRetrieveKnowledge;
    const invalidateBehaviorCache = deps.invalidateBehaviorCache || defaultInvalidateBehaviorCache;
    const startInboxDeepAnalysis = deps.inboxAnalyzer?.startInboxDeepAnalysis || defaultStartInboxDeepAnalysis;
    const getInboxAnalysisStatus = deps.inboxAnalyzer?.getInboxAnalysisStatus || defaultGetInboxAnalysisStatus;
    const getInboxAnalysisRun = deps.inboxAnalyzer?.getInboxAnalysisRun || defaultGetInboxAnalysisRun;

// ============================================================================
// RAG 2.0: OVERVIEW REAL, GATEKEEPER PRÉ-INGESTÃO, AUDITORIA E CURADORIA
// ============================================================================

// Retorna documentos enriquecidos com a contagem REAL de vetores do pgvector
router.get('/overview', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.query?.tenant_id;
        const agent_id = req.headers['x-agent-id'] || req.query?.agent_id || null;
        const instance_scope = req.query?.instance_id || req.headers['x-instance-id'] || 'all';
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        let docQuery = supabase
            .from('knowledge_documents')
            .select('*')
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false });

        if (agent_id) {
            docQuery = docQuery.eq('agent_id', agent_id);
        } else {
            docQuery = docQuery.is('agent_id', null);
        }

        if (instance_scope === 'global') {
            docQuery = docQuery.is('instance_id', null);
        } else if (isValidUuid(instance_scope)) {
            docQuery = docQuery.eq('instance_id', String(instance_scope).trim());
        }

        const [{ data: docs, error: docErr }, allChunks] = await Promise.all([
            docQuery,
            fetchAllTenantChunks(supabase, tenant_id, false)
        ]);
        if (docErr) throw docErr;

        const chunksByDoc = new Map();
        for (const ch of allChunks) {
            if (!agent_id && ch.agent_id) continue;
            if (agent_id && ch.agent_id !== agent_id) continue;
            chunksByDoc.set(ch.document_id, (chunksByDoc.get(ch.document_id) || 0) + 1);
        }

        const enrichedDocs = (docs || []).map(doc => {
            const realChunksCount = chunksByDoc.get(doc.id) || 0;
            return {
                ...doc,
                real_chunks_count: realChunksCount,
                category: doc.metadata?.category || inferCategoryFromContent(doc.name, ''),
                quality_score: doc.metadata?.quality_score ?? null
            };
        });

        const totalRealChunks = enrichedDocs.reduce((acc, d) => acc + d.real_chunks_count, 0);
        const emptyDocsCount = enrichedDocs.filter(d => d.status !== 'processing' && d.real_chunks_count === 0).length;
        const menuDocsCount = enrichedDocs.filter(d => /cardapio/i.test(d.name || '')).length;
        const readyDocuments = enrichedDocs.filter(d => d.status === 'ready' || d.status === 'processed').length;

        let healthScore = 100;
        if (emptyDocsCount > 0) healthScore -= Math.min(30, emptyDocsCount * 12);
        if (menuDocsCount > 1) healthScore -= 15;
        if (totalRealChunks > 300) healthScore -= 20; // Sinal típico de auto-aprendizado inflado/redundante

        res.json({
            documents: enrichedDocs,
            stats: {
                totalDocuments: enrichedDocs.length,
                readyDocuments,
                processingDocuments: enrichedDocs.filter(d => d.status === 'processing').length,
                totalRealChunks,
                emptyDocsCount,
                duplicateMenuAlert: menuDocsCount > 1,
                healthScore: Math.max(0, healthScore)
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Gatekeeper Pré-Ingestão: Extrai, analisa duplicidade/ruído/LGPD/conflitos e refatora com IA ANTES de gravar no banco
router.post('/analyze', upload.single('file'), async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id;
        const agent_id = req.headers['x-agent-id'] || req.body?.agent_id || null;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        let originalName = req.body?.title || 'conhecimento_manual.txt';
        let rawText = '';

        if (req.file) {
            originalName = req.file.originalname;
            rawText = await extractTextFromFile(req.file.buffer, req.file.mimetype, req.file.originalname);
        } else if (req.body?.content) {
            rawText = String(req.body.content);
        } else {
            return res.status(400).json({ error: 'Envie um arquivo ou conteúdo textual para análise.' });
        }

        const transformer = await EmbeddingsPipeline.getInstance();
        const apiKey = await resolveServerOrTenantGeminiKey(supabase, tenant_id);

        const analysis = await analyzeCandidateForTenant({
            supabase,
            transformer,
            apiKey,
            tenantId: tenant_id,
            agentId: agent_id,
            originalName,
            rawText
        });

        return res.json({ success: true, analysis });
    } catch (e) {
        console.error('[RAG Analyze] Erro na análise pré-ingestão:', e);
        return res.status(500).json({ error: e.message });
    }
});

// Commit Curado RAG 2.0: Grava texto refatorado após revisão ou ação direta (create | merge | replace)
router.post('/commit', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id;
        const agent_id = req.headers['x-agent-id'] || req.body?.agent_id || null;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        const {
            mode = 'create',
            targetDocumentId = null,
            title = 'base_conhecimento.md',
            category,
            content,
            qualityScore = 90,
            source = 'curated_rag_v2',
            instanceId = req.body?.instance_id || req.headers['x-instance-id'] || null,
            behaviorProfile = null
        } = req.body || {};

        if (!content || String(content).trim().length < 10) {
            return res.status(400).json({ error: 'Conteúdo insuficiente para vetorização.' });
        }

        const transformer = await EmbeddingsPipeline.getInstance();
        const result = await commitCuratedDocument({
            supabase,
            transformer,
            tenantId: tenant_id,
            agentId: agent_id,
            instanceId: isValidUuid(instanceId) ? String(instanceId).trim() : null,
            mode,
            targetDocumentId,
            title,
            category,
            content,
            qualityScore,
            source,
            behaviorProfile
        });

        invalidateBehaviorCache(tenant_id, isValidUuid(instanceId) ? String(instanceId).trim() : null);
        return res.json({ success: true, ...result });
    } catch (e) {
        console.error('[RAG Commit] Erro ao gravar base curada:', e);
        return res.status(500).json({ error: e.message });
    }
});

// Auditoria Forense Completa de Saúde do RAG do Tenant
router.post('/audit', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        const report = await auditTenantKnowledgeHealth({ supabase, tenantId: tenant_id });
        return res.json({ success: true, report });
    } catch (e) {
        console.error('[RAG Audit] Erro na auditoria:', e);
        return res.status(500).json({ error: e.message });
    }
});

// Saneamento Automático: Remove bases vazias, deduplica chunks redundantes, corrige URLs e sincroniza metadados
router.post('/sanitize', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        const transformer = await EmbeddingsPipeline.getInstance();
        const summary = await sanitizeTenantKnowledgeBase({
            supabase,
            transformer,
            tenantId: tenant_id
        });
        const updatedReport = await auditTenantKnowledgeHealth({ supabase, tenantId: tenant_id });

        return res.json({ success: true, summary, report: updatedReport });
    } catch (e) {
        console.error('[RAG Sanitize] Erro no saneamento:', e);
        return res.status(500).json({ error: e.message });
    }
});

// Rota de Injeção RAG (Upload de Arquivos multi-empresa com sanitização e chunking semântico 2.0)
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        // Obrigatório passar o x-tenant-id em multitenant
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id;
        const agent_id = req.headers['x-agent-id'] || req.body?.agent_id || null;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

        const { originalname, buffer, mimetype, size } = req.file;
        const content = await extractTextFromFile(buffer, mimetype, originalname);

        console.log(`[Upload Debug] File: ${originalname}, Mime: ${mimetype}, Buffer Size: ${buffer.length}, Extracted Content Length: ${content?.length || 0}`);

        if (!content || content.trim() === '') {
            console.log(`[Upload Debug] Failed: Content is empty or undetectable.`);
            return res.status(400).json({ error: 'Arquivo vazio ou texto indetectável.' });
        }

        const noiseAlerts = detectSensitiveOrNoisyPatterns(content);
        const hasFatalJunk = noiseAlerts.some(a => a.type === 'lixo' && a.severity === 'critical');
        if (hasFatalJunk && req.headers['x-force-upload'] !== 'true') {
            return res.status(422).json({
                error: noiseAlerts.find(a => a.type === 'lixo')?.description || 'Conteúdo considerado inválido ou de teste para RAG.'
            });
        }

        const contentHash = computeNormalizedHash(content);
        if (req.headers['x-force-upload'] !== 'true') {
            let dupCheckQ = supabase
                .from('knowledge_documents')
                .select('id, name')
                .eq('tenant_id', tenant_id)
                .eq('content_hash', contentHash);
            if (agent_id) dupCheckQ = dupCheckQ.eq('agent_id', agent_id);
            else dupCheckQ = dupCheckQ.is('agent_id', null);
            const { data: exactDup } = await dupCheckQ.maybeSingle();
            if (exactDup) {
                return res.status(409).json({
                    error: `Conteúdo idêntico ao documento já cadastrado "${exactDup.name}".`,
                    duplicateDocumentId: exactDup.id
                });
            }
        }

        const inferredCategory = inferCategoryFromContent(originalname, content);

        // 1. Grava na knowledge_documents para aparecer na UI
        const { data: docData, error: docError } = await supabase
            .from('knowledge_documents')
            .insert([{
                tenant_id,
                agent_id,
                name: originalname,
                type: mimetype,
                status: 'processing',
                content_hash: contentHash,
                metadata: { size, category: inferredCategory, content_hash: contentHash, rag_version: '2.0' }
            }])
            .select('*')
            .single();

        if (docError) throw docError;

        const documentId = docData.id;

        // Responder com sucesso rápido para UI (evitar timeout) e delegar processamento pesado!
        res.json({ status: 'processing', document_id: documentId, document: docData, message: 'Vetorização semântica iniciada.' });

        // -- BACKGROUND PROCESS ENGINE (Chunking Semântico + Deduplicação) --
        (async () => {
            try {
                const chunks = semanticChunkDocument(content, {
                    documentName: originalname,
                    category: inferredCategory
                });

                await supabase.from('knowledge_documents').update({
                    metadata: {
                        size,
                        category: inferredCategory,
                        content_hash: contentHash,
                        rag_version: '2.0',
                        chunks_total: chunks.length,
                        chunks_processed: 0,
                        current_status: 'Carregando pipeline de Inteligência Artificial...'
                    }
                }).eq('id', documentId);

                const transformer = await EmbeddingsPipeline.getInstance();
                const otherChunks = await fetchAllTenantChunks(supabase, tenant_id, false);
                const otherHashes = new Set(
                    otherChunks
                        .filter(c => c.document_id !== documentId)
                        .map(c => c.metadata?.chunk_hash || computeNormalizedHash(String(c.content || '').replace(/^\[[^\]]+\]\s*/, '')))
                );

                const dbChunks = [];
                let skippedDuplicates = 0;

                for (let i = 0; i < chunks.length; i++) {
                    const ch = chunks[i];
                    if (otherHashes.has(ch.chunkHash)) {
                        skippedDuplicates++;
                        continue;
                    }

                    if (i % 5 === 0) {
                        await supabase.from('knowledge_documents').update({
                            metadata: {
                                size,
                                category: inferredCategory,
                                content_hash: contentHash,
                                rag_version: '2.0',
                                chunks_total: chunks.length,
                                chunks_processed: i,
                                current_status: `Vetorizando bloco semântico ${i + 1} de ${chunks.length}...`
                            }
                        }).eq('id', documentId);
                    }

                    const output = await transformer(ch.embeddingText || ch.content, { pooling: 'mean', normalize: true });
                    const embeddingVector = Array.from(output.data);

                    dbChunks.push({
                        document_id: documentId,
                        tenant_id,
                        agent_id,
                        content: ch.content,
                        embedding: embeddingVector,
                        chunk_index: dbChunks.length,
                        metadata: {
                            document_name: originalname,
                            section_title: ch.sectionTitle,
                            category: ch.category,
                            chunk_hash: ch.chunkHash,
                            word_count: ch.wordCount,
                            char_count: ch.charCount,
                            rag_version: '2.0'
                        }
                    });

                    if (dbChunks.length >= 100) {
                        await supabase.from('knowledge_chunks').insert([...dbChunks]);
                        dbChunks.length = 0;
                    }
                }

                if (dbChunks.length > 0) {
                    await supabase.from('knowledge_chunks').insert(dbChunks);
                }

                const realInsertedCount = chunks.length - skippedDuplicates;
                await supabase.from('knowledge_documents').update({
                    status: 'ready',
                    content_hash: contentHash,
                    metadata: {
                        size,
                        category: inferredCategory,
                        content_hash: contentHash,
                        rag_version: '2.0',
                        chunks_total: realInsertedCount,
                        chunks_processed: realInsertedCount,
                        skipped_duplicates: skippedDuplicates,
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

// ============================================================================
// ANÁLISE PROFUNDA DE HISTÓRICO POR CAIXA (SUBMENU DA CAIXA -> RAG ISOLADO)
// IMPORTANTE: Declarado ANTES de rotas com /:id para evitar sombreamento Express
// ============================================================================

router.get('/inbox-analyze/runs/:runId', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.query?.tenant_id;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        const run = await getInboxAnalysisRun({
            supabase,
            tenantId: tenant_id,
            runId: req.params.runId
        });
        if (!run) return res.status(404).json({ error: 'Execução de análise não encontrada.' });
        return res.json({ ok: true, run });
    } catch (e) {
        return res.status(e.statusCode || 500).json({ error: e.message });
    }
});

router.get('/inbox-analyze/:instanceId/status', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.query?.tenant_id;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        const statusData = await getInboxAnalysisStatus({
            supabase,
            tenantId: tenant_id,
            instanceId: req.params.instanceId
        });
        return res.json({ ok: true, ...statusData });
    } catch (e) {
        return res.status(e.statusCode || 500).json({ error: e.message });
    }
});

router.post('/inbox-analyze/:instanceId/start', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        const mode = req.body?.mode === 'full' ? 'full' : 'incremental';
        const result = await startInboxDeepAnalysis({
            supabase,
            tenantId: tenant_id,
            instanceId: req.params.instanceId,
            mode,
            deps: {
                invalidateCache: invalidateBehaviorCache,
                getTransformer: () => EmbeddingsPipeline.getInstance()
            }
        });

        if (result.conflict) {
            return res.status(409).json({
                conflict: true,
                error: 'Já existe uma análise em andamento para esta caixa.',
                activeRun: result.activeRun
            });
        }

        return res.status(202).json({ ok: true, run: result.run });
    } catch (e) {
        return res.status(e.statusCode || 500).json({ error: e.message });
    }
});

// Listar seus documentos (Isolados pelo RLS / tenant)
router.get('/', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'];
        const agent_id = req.headers['x-agent-id'];
        const instance_scope = req.query?.instance_id || req.headers['x-instance-id'] || 'all';
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

        if (instance_scope === 'global') {
            query = query.is('instance_id', null);
        } else if (isValidUuid(instance_scope)) {
            query = query.eq('instance_id', String(instance_scope).trim());
        }

        const { data, error } = await query;
        res.json(data);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Resgata os chunks individuais de um documento (Raio-X de Vetores)
router.get('/:id/chunks', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'];
        const docId = req.params.id;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        const { data, error } = await supabase
            .from('knowledge_chunks')
            .select('id, document_id, chunk_index, content, metadata')
            .eq('document_id', docId)
            .eq('tenant_id', tenant_id)
            .order('chunk_index', { ascending: true, nullsFirst: false })
            .limit(300);

        if (error) throw error;
        res.json({ chunks: data || [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Resgata o conteúdo completo extraído do documento (preservando quebras de parágrafo sem cabeçalhos repetidos)
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

        const fullContent = (data || [])
            .map(c => String(c.content || '').replace(/^\[[^\]]+\]\n?/, '').trim())
            .filter(Boolean)
            .join('\n\n');
        
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
// Atualiza o documento enviando um novo conteúdo em formato de texto (Re-vetorização Semântica 2.0)
// Alterna escopo do documento atomicamente entre Global da Empresa (null) e Exclusivo da Caixa (UUID)
router.patch('/:id/scope', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'];
        const docId = req.params.id;
        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });

        const rawInstanceId = req.body?.instanceId ?? null;
        if (rawInstanceId !== null && rawInstanceId !== '' && !isValidUuid(rawInstanceId)) {
            return res.status(400).json({ error: 'instanceId inválido. Envie UUID válido ou null para Global.' });
        }
        const targetInstanceId = rawInstanceId && String(rawInstanceId).trim() ? String(rawInstanceId).trim() : null;

        const { data: existingDoc, error: docErr } = await supabase
            .from('knowledge_documents')
            .select('*')
            .eq('id', docId)
            .eq('tenant_id', tenant_id)
            .maybeSingle();

        if (docErr) throw docErr;
        if (!existingDoc) return res.status(404).json({ error: 'Documento não encontrado.' });

        if (targetInstanceId) {
            const { data: inst, error: instErr } = await supabase
                .from('whatsapp_instances')
                .select('id')
                .eq('id', targetInstanceId)
                .eq('tenant_id', tenant_id)
                .maybeSingle();
            if (instErr) throw instErr;
            if (!inst) return res.status(404).json({ error: 'Caixa de entrada não encontrada para esta empresa.' });
        }

        const nextMeta = {
            ...(existingDoc.metadata || {}),
            instance_id: targetInstanceId,
            updated_at: new Date().toISOString()
        };

        const { data: updatedDoc, error: updDocErr } = await supabase
            .from('knowledge_documents')
            .update({ instance_id: targetInstanceId, metadata: nextMeta })
            .eq('id', docId)
            .eq('tenant_id', tenant_id)
            .select('*')
            .single();
        if (updDocErr) throw updDocErr;

        const { error: updChunksErr } = await supabase
            .from('knowledge_chunks')
            .update({ instance_id: targetInstanceId })
            .eq('document_id', docId)
            .eq('tenant_id', tenant_id);
        if (updChunksErr) throw updChunksErr;

        invalidateBehaviorCache(tenant_id, existingDoc.instance_id || targetInstanceId);
        return res.json({ ok: true, document: updatedDoc });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Atualizar e RE-PROCESSAR o conteúdo completo de um documento (com Chunking Semântico RAG 2.0)
router.put('/:id', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'];
        const agent_id = req.headers['x-agent-id'] || null;
        const docId = req.params.id;
        const { content, title, category } = req.body;

        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });
        if (!content || content.trim() === '') return res.status(400).json({ error: 'O conteúdo não pode ser vazio.' });

        const cleanContent = sanitizeRagText(content);
        const contentHash = computeNormalizedHash(cleanContent);

        const { data: existingDoc } = await supabase
            .from('knowledge_documents')
            .select('id, name, instance_id, metadata')
            .eq('id', docId)
            .eq('tenant_id', tenant_id)
            .maybeSingle();

        const preservedInstanceId = existingDoc?.instance_id ?? null;
        const finalName = title ? String(title).trim() : (existingDoc?.name || 'base_conhecimento.md');
        const finalCategory = category || existingDoc?.metadata?.category || inferCategoryFromContent(finalName, cleanContent);
        const refreshedBehaviorProfile = (existingDoc?.metadata?.source === 'inbox_deep_analyzer' || /#\s*[^\n]*(?:Identidade|Comportamento|Tom de Voz)/i.test(cleanContent))
            ? extractBehaviorProfileSummary(cleanContent)
            : existingDoc?.metadata?.behavior_profile;

        let updateQuery = supabase
            .from('knowledge_documents')
            .update({
                name: finalName,
                status: 'processing',
                content_hash: contentHash
            })
            .eq('id', docId)
            .eq('tenant_id', tenant_id);
        if (agent_id) updateQuery = updateQuery.eq('agent_id', agent_id); else updateQuery = updateQuery.is('agent_id', null);
        const { error: updateError } = await updateQuery;
        
        if (updateError) throw updateError;

        res.json({ status: 'processing', document_id: docId, message: 'Re-vetorização semântica iniciada.' });

        (async () => {
            try {
                await supabase.from('knowledge_chunks').delete().eq('document_id', docId).eq('tenant_id', tenant_id);

                const chunks = semanticChunkDocument(cleanContent, {
                    documentName: finalName,
                    category: finalCategory
                });
                const size = Buffer.byteLength(cleanContent, 'utf-8');

                await supabase.from('knowledge_documents').update({
                    metadata: {
                        ...(existingDoc?.metadata || {}),
                        size,
                        category: finalCategory,
                        content_hash: contentHash,
                        rag_version: '2.0',
                        chunks_total: chunks.length,
                        chunks_processed: 0,
                        current_status: 'Gerando novos vetores semânticos...'
                    }
                }).eq('id', docId);

                const transformer = await EmbeddingsPipeline.getInstance();
                const dbChunks = [];

                for (let i = 0; i < chunks.length; i++) {
                    const ch = chunks[i];
                    const output = await transformer(ch.embeddingText || ch.content, { pooling: 'mean', normalize: true });
                    const embeddingVector = Array.from(output.data);

                    dbChunks.push({
                        document_id: docId,
                        tenant_id,
                        agent_id,
                        instance_id: preservedInstanceId,
                        content: ch.content,
                        embedding: embeddingVector,
                        chunk_index: i,
                        metadata: {
                            document_name: finalName,
                            section_title: ch.sectionTitle,
                            category: ch.category,
                            chunk_hash: ch.chunkHash,
                            word_count: ch.wordCount,
                            char_count: ch.charCount,
                            instance_id: preservedInstanceId,
                            rag_version: '2.0'
                        }
                    });

                    if (dbChunks.length >= 100) {
                        await supabase.from('knowledge_chunks').insert([...dbChunks]);
                        dbChunks.length = 0;
                    }
                }

                if (dbChunks.length > 0) {
                    await supabase.from('knowledge_chunks').insert(dbChunks);
                }

                await supabase.from('knowledge_documents').update({
                    status: 'ready',
                    content_hash: contentHash,
                    metadata: {
                        ...(existingDoc?.metadata || {}),
                        size,
                        category: finalCategory,
                        content_hash: contentHash,
                        instance_id: preservedInstanceId,
                        ...(refreshedBehaviorProfile ? { behavior_profile: refreshedBehaviorProfile } : {}),
                        rag_version: '2.0',
                        chunks_total: chunks.length,
                        chunks_processed: chunks.length,
                        current_status: 'Concluído com sucesso!',
                        updated_at: new Date().toISOString(),
                        last_update: new Date().toISOString()
                    }
                }).eq('id', docId);
                invalidateBehaviorCache(tenant_id, preservedInstanceId);

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

        invalidateBehaviorCache(tenant_id);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// API de TESTE de Matching Híbrido (Simulador Raio-X RAG 2.0 com RRF + MMR)
router.post('/match', async (req, res) => {
   try {
        const tenant_id = req.headers['x-tenant-id'];
        const agent_id = req.headers['x-agent-id'] || null;
        const { query, topK = 5, instanceId = null, instance_id = null } = req.body;
        const effectiveInstanceId = instanceId || instance_id || req.headers['x-instance-id'] || null;
        
        if (!query || !tenant_id) return res.status(400).json({ error: 'Missing query or tenant' });

        // 1. Vetoriza a frase da pergunta
        const transformer = await EmbeddingsPipeline.getInstance();
        const output = await transformer(query, { pooling: 'mean', normalize: true, priority: 1 });
        const queryEmbedding = Array.from(output.data);

        // 2. Busca Híbrida 2.0 (Vetorial pgvector + FTS PT-BR + RRF + MMR Diversity)
        const finalMatches = await hybridRetrieveKnowledge({
            supabase,
            queryEmbedding,
            queryText: query,
            tenantId: tenant_id,
            agentId: agent_id,
            instanceId: effectiveInstanceId,
            topK: Math.min(Number(topK) || 5, 8),
            vectorThreshold: 0.24
        });

        const promptPreview = finalMatches.length > 0
            ? finalMatches.map((m, idx) => `[Fonte ${idx + 1}: ${m.document_name}${m.section ? ` > ${m.section}` : ''}]\n${m.content}`).join('\n---\n')
            : '';

        res.json({ matches: finalMatches, promptPreview });
   } catch(e) {
        res.status(500).json({ error: e.message });
   }
});

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
        const output = await transformer(user_query, { pooling: 'mean', normalize: true, priority: 1 });
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

        const apiKey = await resolveServerOrTenantGeminiKey(supabase, tenant_id);
        if (!apiKey || suspendedKnowledgeKeys.has(apiKey)) {
            return res.json({
                success: true,
                text: buildLocalHelperFallback(action, text, user_query),
                contingency: true
            });
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

        try {
            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();
            return res.json({ success: true, text: responseText });
        } catch (aiErr) {
            const errMsg = String(aiErr?.message || aiErr || '');
            if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') || errMsg.includes('UNAUTHENTICATED') || errMsg.includes('API key not valid')) {
                suspendedKnowledgeKeys.add(apiKey);
            }
            console.info(`[Corrections Helper API] Contingência local acionada (${action}): ${errMsg.slice(0, 120)}`);
            return res.json({
                success: true,
                text: buildLocalHelperFallback(action, text, user_query),
                contingency: true
            });
        }
    } catch (e) {
        console.info('[Corrections Helper API] Contingência externa:', e.message);
        return res.json({
            success: true,
            text: buildLocalHelperFallback(req.body?.action, req.body?.text, req.body?.user_query),
            contingency: true
        });
    }
});

// Rota de treinamento multimodal - Etapa 1: Análise via Gemini
router.post('/train-multimodal/analyze', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id;
        const { botId, text, images, audio } = req.body;

        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });
        if (!botId) return res.status(400).json({ error: 'botId required' });

        const apiKey = await resolveServerOrTenantGeminiKey(supabase, tenant_id);
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
3. O campo 'suggestedPromptChanges' DEVE ser uma string contendo as novas diretrizes (em português). Caso decida retornar uma lista estruturada, envie como texto com linhas iniciadas por hífen (-).
4. O campo 'ragFacts' DEVE ser um array de strings.
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
            try {
                analysisResult = JSON.parse(cleanText);
            } catch (innerErr) {
                const match = cleanText.match(/\{[\s\S]*\}/);
                if (match) {
                    try {
                        analysisResult = JSON.parse(match[0]);
                    } catch (lastErr) {
                        console.error('[MultimodalTrain API] Falha ao fazer parse do bloco JSON encontrado:', match[0]);
                        throw lastErr;
                    }
                } else {
                    console.error('[MultimodalTrain API] Falha ao fazer parse do retorno do Gemini:', responseText);
                    throw new Error("Resposta da I.A. não retornou um JSON válido: " + innerErr.message);
                }
            }
        }

        let suggestedPromptChanges = analysisResult.suggestedPromptChanges || '';
        if (Array.isArray(suggestedPromptChanges)) {
            suggestedPromptChanges = suggestedPromptChanges.map(rule => `- ${rule}`).join('\n');
        } else if (typeof suggestedPromptChanges !== 'string') {
            suggestedPromptChanges = JSON.stringify(suggestedPromptChanges);
        }

        let ragFacts = analysisResult.ragFacts || [];
        if (!Array.isArray(ragFacts)) {
            if (typeof ragFacts === 'string') {
                ragFacts = ragFacts.split('\n').map(f => f.replace(/^[-*•\d.\s]+/, '').trim()).filter(f => f.length > 5);
            } else {
                ragFacts = [];
            }
        }

        res.json({
            success: true,
            analysis: analysisResult.analysis || '',
            suggestedPromptChanges,
            ragFacts
        });

    } catch (e) {
        console.error('[MultimodalTrain API - Analyze] Erro:', e);
        res.status(500).json({ error: e.message });
    }
});

// Rota de treinamento multimodal - Etapa 2: Gravar no Prompt do Robô
router.post('/train-multimodal/save-prompt', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id;
        const { botId, suggestedPromptChanges } = req.body;

        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });
        if (!botId) return res.status(400).json({ error: 'botId required' });

        // Busca o robô no banco
        const { data: bot, error: botErr } = await supabase
            .from('bots')
            .select('*')
            .eq('id', botId)
            .single();

        if (botErr || !bot) {
            return res.status(404).json({ error: 'Robô não encontrado.' });
        }

        const currentPrompt = bot.systemPrompt || bot.system_prompt || '';

        let promptChangesText = '';
        if (suggestedPromptChanges) {
            if (Array.isArray(suggestedPromptChanges)) {
                promptChangesText = suggestedPromptChanges.map(rule => `- ${rule}`).join('\n');
            } else if (typeof suggestedPromptChanges === 'string') {
                promptChangesText = suggestedPromptChanges;
            } else {
                promptChangesText = JSON.stringify(suggestedPromptChanges);
            }
        }

        if (promptChangesText.trim().length > 5) {
            const trainingHeader = `\n\n### REGRAS ADICIONAIS DE TREINAMENTO E CORREÇÃO DE ROTA (Atualizado em ${new Date().toLocaleDateString('pt-BR')}):\n`;
            const updatedPrompt = currentPrompt + trainingHeader + promptChangesText.trim();

            const { error: updateErr } = await supabase
                .from('bots')
                .update({ systemPrompt: updatedPrompt, updated_at: new Date().toISOString() })
                .eq('id', botId);

            if (updateErr) throw updateErr;
        }

        res.json({ success: true });

    } catch (e) {
        console.error('[MultimodalTrain API - Save Prompt] Erro:', e);
        res.status(500).json({ error: e.message });
    }
});

// Rota de treinamento multimodal - Etapa 3: Vetorizar e Gravar no RAG
router.post('/train-multimodal/save-rag', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id;
        const { botId, ragFacts } = req.body;

        if (!tenant_id) return res.status(400).json({ error: 'x-tenant-id required' });
        if (!botId) return res.status(400).json({ error: 'botId required' });

        // Busca o robô no banco
        const { data: bot, error: botErr } = await supabase
            .from('bots')
            .select('*')
            .eq('id', botId)
            .single();

        if (botErr || !bot) {
            return res.status(404).json({ error: 'Robô não encontrado.' });
        }

        let facts = [];
        if (ragFacts) {
            if (Array.isArray(ragFacts)) {
                facts = ragFacts.filter(f => f && typeof f === 'string' && f.trim().length > 5);
            } else if (typeof ragFacts === 'string') {
                facts = ragFacts.split('\n').map(f => f.replace(/^[-*•\d.\s]+/, '').trim()).filter(f => f.length > 5);
            }
        }

        let ragFactsCount = 0;

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
        }

        res.json({ success: true, ragFactsCount });

    } catch (e) {
        console.error('[MultimodalTrain API - Save RAG] Erro:', e);
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// PROXY SEGURO GEMINI & COFRE AES-256-GCM (SERVER-SIDE COM FIREWALL ANTI-HACKER)
// ==========================================

/**
 * POST /api/v1/knowledge/gemini-vault
 * Criptografa uma chave Gemini com AES-256-GCM (ENCv1:...) e persiste no banco com metadados mascarados,
 * garantindo que a chave em texto puro JAMAIS fique exposta em companies.settings ou no navegador.
 */
router.post('/gemini-vault', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenantId;
        if (!tenant_id) {
            return res.status(403).json({ error: 'x-tenant-id obrigatório para acesso ao Cofre Gemini.' });
        }

        const security = verifyGeminiProxySecurity(req, tenant_id);
        if (!security.allowed) {
            return res.status(security.status).json({ error: security.reason });
        }

        const action = req.body?.action || 'save';
        const { data: comp, error: compErr } = await supabase
            .from('companies')
            .select('settings')
            .eq('id', tenant_id)
            .maybeSingle();

        if (compErr) {
            return res.status(500).json({ error: 'Falha ao consultar empresa no Cofre.' });
        }

        const currentSettings = comp?.settings || {};

        if (action === 'remove') {
            const updatedSettings = {
                ...currentSettings,
                gemini_api_key: '',
                gemini_key_meta: null
            };
            const { error: updErr } = await supabase
                .from('companies')
                .update({ settings: updatedSettings })
                .eq('id', tenant_id);
            if (updErr) throw updErr;
            invalidateTenantGeminiKeyCache(tenant_id);
            return res.json({ ok: true, removed: true });
        }

        const rawKey = String(req.body?.apiKey || '').trim();
        if (!isValidPlainGeminiKey(rawKey)) {
            return res.status(400).json({
                ok: false,
                error: 'Formato inválido. Chaves oficiais do Google iniciam com "AIza" ou "AQ." e possuem no mínimo 25 caracteres.'
            });
        }

        const encryptedKey = encryptGeminiKey(rawKey);
        const meta = buildGeminiKeyMeta(rawKey);

        const updatedSettings = {
            ...currentSettings,
            gemini_api_key: encryptedKey,
            gemini_key_meta: meta
        };

        const { error: updErr } = await supabase
            .from('companies')
            .update({ settings: updatedSettings })
            .eq('id', tenant_id);

        if (updErr) throw updErr;

        invalidateTenantGeminiKeyCache(tenant_id);
        suspendedKnowledgeKeys.delete(rawKey);

        return res.json({
            ok: true,
            encryptedKey,
            meta
        });
    } catch (e) {
        console.error('[GeminiVault API] Erro:', redactGeminiSecrets(e.message));
        return res.status(500).json({ ok: false, error: redactGeminiSecrets(e.message) });
    }
});

router.post('/gemini-proxy', async (req, res) => {
    try {
        const tenant_id = req.headers['x-tenant-id'] || req.body?.tenantId;
        if (!tenant_id) {
            return res.status(403).json({ error: { message: 'x-tenant-id obrigatório para uso do motor Gemini.' } });
        }

        // 1. Firewall Anti-Hacker, Validação de Origem/Escudo e Rate Limiting com Auto-Ban
        const security = verifyGeminiProxySecurity(req, tenant_id);
        if (!security.allowed) {
            return res.status(security.status).json({ error: { message: security.reason } });
        }

        // 2. Resolução segura da chave no Cofre (Descriptografia em memória RAM exclusivamente no backend)
        const apiKey = await resolveServerOrTenantGeminiKey(supabase, tenant_id, req.body?.apiKey);
        if (!apiKey || apiKey.includes('SERVER_MANAGED') || suspendedKnowledgeKeys.has(apiKey)) {
            return res.status(200).json({ error: { code: 401, message: 'Chave Gemini em contingência no servidor.' }, contingency: true });
        }

        const payload = req.body?.payload;
        if (!payload || !Array.isArray(payload.contents)) {
            return res.status(400).json({ error: { message: 'Payload contents inválido.' } });
        }

        // 3. Proteção de Orçamento (Bloqueio de modelos caros Pro/Ultra e limite de tokens)
        const { safeModel, safePayload } = enforceGeminiBudgetGuardrails(req.body?.model, payload);

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const upstreamRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(safePayload)
        });

        const data = await upstreamRes.json().catch(() => ({}));
        if (upstreamRes.status === 401 || upstreamRes.status === 403) {
            suspendedKnowledgeKeys.add(apiKey);
            return res.status(200).json({ error: { code: upstreamRes.status, message: 'Chave Gemini suspensa ou revogada.' }, contingency: true });
        }
        return res.status(upstreamRes.status).json(data);
    } catch (e) {
        const safeMsg = redactGeminiSecrets(e.message || 'Erro no proxy Gemini');
        console.info('[GeminiProxy API] Contingência:', safeMsg);
        return res.status(200).json({ error: { message: safeMsg }, contingency: true });
    }
});

    return router;
}

const defaultRouter = createKnowledgeRouter();
export default defaultRouter;
