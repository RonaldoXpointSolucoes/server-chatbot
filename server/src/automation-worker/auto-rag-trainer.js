import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../supabase.js';
import { pipeline } from '../embeddings/pipeline.js';
import { decryptGeminiKey } from '../utils/geminiVault.js';
import {
    sanitizeRagText,
    computeNormalizedHash,
    detectSensitiveOrNoisyPatterns,
    fetchAllTenantChunks
} from '../api-gateway/knowledge-curator.js';

class LocalEmbeddingsPipeline {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance = null;

  static async getInstance() {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, this.model, { quantized: true });
    }
    return this.instance;
  }
}

class AutoRagTrainer {
    constructor() {
        this.genAI = null;
        this.keySuspended = false;
    }

    init() {
        if (this.keySuspended) return;
        const rawKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
        const apiKey = rawKey ? decryptGeminiKey(rawKey) : '';
        if (apiKey && !this.genAI) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        }
    }

    /**
     * Treina a base RAG do tenant a partir de uma conversa humanizada concluída.
     */
    async trainFromResolvedConversation(tenantId, conversationId) {
        try {
            this.init();
            if (!this.genAI || this.keySuspended) {
                console.info("[AutoRagTrainer] GEMINI_API_KEY ausente ou em contingência. Treinamento ignorado.");
                return;
            }

            console.log(`[AutoRagTrainer] Iniciando análise de auto-aprendizado para chat: ${conversationId}`);

            // 1. Busca as mensagens reais do chat
            const { data: messages, error: msgErr } = await supabase.from('messages')
                .select('text_content, sender_type, timestamp')
                .eq('tenant_id', tenantId)
                .eq('conversation_id', conversationId)
                .order('timestamp', { ascending: false })
                .limit(20);

            if (messages) messages.reverse(); // Coloca em ordem cronológica novamente

            if (msgErr || !messages || messages.length === 0) {
                console.log(`[AutoRagTrainer] Nenhuma mensagem encontrada para o chat ${conversationId}`);
                return;
            }

            // Filtra conversas que foram encerradas em lote ou que não possuem interações humanas reais
            const isBatchResolved = messages.some(m => m.text_content && m.text_content.includes('Resolvido em lote'));
            if (isBatchResolved) {
                console.log(`[AutoRagTrainer] Conversa ${conversationId} foi resolvida em lote. Análise de I.A ignorada.`);
                return;
            }

            const hasHumanMessages = messages.some(m => m.sender_type === 'human');
            if (!hasHumanMessages) {
                console.log(`[AutoRagTrainer] Conversa ${conversationId} não possui respostas humanas. Ignorando aprendizado.`);
                return;
            }

            // 2. Formata a conversa como diálogo limpo
            const dialogLines = messages.map(m => {
                const role = m.sender_type === 'client' ? 'Cliente' : (m.sender_type === 'human' ? 'Atendente Humano' : 'I.A. (Bot)');
                return `${role}: ${m.text_content || ''}`;
            });
            const chatTranscript = dialogLines.join('\n');

            // 3. Monta o prompt especializado para extração de conhecimento comercial
            const systemPrompt = `Você é um Analista de Conhecimento Comercial experiente e SRE de Inteligência Artificial.
Sua missão é ler a transcrição de um atendimento entre um cliente e um atendente humano e extrair fatos de conhecimento e regras de negócios cruciais discutidos e resolvidos na conversa.

Você deve extrair fatos que sirvam para enriquecer o cérebro RAG (Geração Aumentada de Recuperação) do nosso robô agente para que ele aprenda com os atendentes humanos.

REGRAS DE EXTRAÇÃO E BLINDAGEM DE QUALIDADE (ESTRITAS):
1. Extraia APENAS regras de negócio duradouras, globais e reutilizáveis em português brasileiro claro.
2. PROIBIÇÕES ABSOLUTAS (LGPD e LIXO):
   - NUNCA mencione endereços residenciais, condomínios, blocos ou apartamentos de clientes.
   - NUNCA mencione telefones pessoais, CPFs, chaves PIX pessoais de terceiros/motoboys ou nomes de clientes.
   - NUNCA extraia conversas internas de equipe (ex: desligar totem, sistemas internos administrativos como DataDivas/alarmes) ou falhas momentâneas/passageiras (ex: falta temporária de ingrediente ou restrição de um único dia).
   - NUNCA extraia taxas de entrega avulsas por endereço/bairro (taxas são calculadas dinamicamente por CEP) nem opções numéricas obsoletas de URA ("digite 1", "digite 2").
   - NUNCA extraia nomes, descrições ou preços de produtos do cardápio (o cardápio oficial é sincronizado diretamente pelo ERP).
3. Ignore cumprimentos, conversas informais ou casos específicos sem regra geral. Se não houver nenhuma regra nova duradoura, retorne ABSOLUTAMENTE VAZIO.

Retorne os fatos extraídos um por linha, iniciando diretamente pelo fato sem numeração, sem marcadores (- ou *) e sem explicações.`;

            const modelName = 'gemini-2.5-flash';
            const model = this.genAI.getGenerativeModel({ model: modelName });
            
            const result = await model.generateContent([
                { text: systemPrompt },
                { text: `Aqui está o histórico completo do atendimento comercial:\n\n${chatTranscript}` }
            ]);

            const responseText = result.response.text()?.trim();
            if (!responseText || responseText.length < 5) {
                console.log(`[AutoRagTrainer] Nenhum conhecimento útil extraído da conversa ${conversationId}.`);
                return;
            }

            // 4. Trata e filtra os fatos extraídos pelo Gemini
            const rawFacts = responseText.split('\n').map(f => f.replace(/^[-*•\d.\s]+/, '').trim()).filter(f => f.length > 10);
            if (rawFacts.length === 0) {
                console.log(`[AutoRagTrainer] Nenhum fato válido extraído da resposta do Gemini para conversa ${conversationId}.`);
                return;
            }

            console.log(`[AutoRagTrainer] ${rawFacts.length} fatos novos extraídos via Gemini:`, rawFacts);

            // 5. Busca ou cria o documento único do Auto-Aprendizado (protegido contra múltiplos rows)
            const autoDocName = 'Auto-Aprendizado Dinâmico (Conversas)';
            let { data: doc, error: docSeekErr } = await supabase
                .from('knowledge_documents')
                .select('id, metadata')
                .eq('tenant_id', tenantId)
                .eq('name', autoDocName)
                .is('agent_id', null)
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (docSeekErr) {
                console.error("[AutoRagTrainer] Falha ao consultar documento virtual de aprendizado:", docSeekErr);
                return;
            }

            if (!doc) {
                const { data: newDoc, error: createErr } = await supabase.from('knowledge_documents')
                    .insert({
                        tenant_id: tenantId,
                        name: autoDocName,
                        type: 'text/markdown',
                        status: 'ready',
                        metadata: { source: 'auto-rag-trainer', category: 'Conhecimento Geral', auto_learned: true, chunks_total: 0, chunks_processed: 0, rag_version: '2.0' }
                    })
                    .select('id, metadata')
                    .single();

                if (createErr || !newDoc) {
                    console.error("[AutoRagTrainer] Falha ao criar documento virtual de aprendizado:", createErr);
                    return;
                }
                doc = newDoc;
            }

            const docId = doc.id;

            // 6. Pré-carrega hashes existentes para bloquear duplicatas exatas e testa similaridade vetorial (< 0.84)
            const existingChunks = await fetchAllTenantChunks(supabase, tenantId, false);
            const existingHashes = new Set(
                existingChunks.map(c => c.metadata?.chunk_hash || computeNormalizedHash(String(c.content || '').replace(/^\[[^\]]+\]\s*/, '')))
            );
            let currentDocChunksCount = existingChunks.filter(c => c.document_id === docId).length;

            const transformer = await LocalEmbeddingsPipeline.getInstance();
            let insertedCount = 0;

            for (const rawFact of rawFacts) {
                try {
                    const cleanFact = sanitizeRagText(rawFact);
                    if (!cleanFact || cleanFact.length < 15) continue;

                    const sensitiveAlerts = detectSensitiveOrNoisyPatterns(cleanFact);
                    if (sensitiveAlerts.some(a => a.severity === 'critical')) {
                        console.log(`[AutoRagTrainer] Fato descartado pelo Gatekeeper LGPD/Qualidade: "${cleanFact}"`);
                        continue;
                    }

                    const factHash = computeNormalizedHash(cleanFact);
                    if (existingHashes.has(factHash)) {
                        console.log(`[AutoRagTrainer] Fato duplicado ignorado: "${cleanFact}"`);
                        continue;
                    }

                    const enrichedContent = `[${autoDocName} > Aprendizado Validado]\n${cleanFact}`;
                    const output = await transformer(enrichedContent, { pooling: 'mean', normalize: true });
                    const embeddingVector = Array.from(output.data);

                    // Bloqueia paráfrases semânticas redundantes (>= 0.84 de similaridade)
                    const { data: simHits } = await supabase.rpc('match_knowledge_chunks', {
                        query_embedding: embeddingVector,
                        match_threshold: 0.84,
                        match_count: 1,
                        p_tenant_id: tenantId,
                        p_agent_id: null
                    });
                    if (simHits && simHits.length > 0) {
                        console.log(`[AutoRagTrainer] Fato semanticamente redundante ignorado (sim=${simHits[0].similarity.toFixed(2)}): "${cleanFact}"`);
                        continue;
                    }

                    const { error: chunkErr } = await supabase.from('knowledge_chunks').insert({
                        document_id: docId,
                        tenant_id: tenantId,
                        content: enrichedContent,
                        embedding: embeddingVector,
                        chunk_index: currentDocChunksCount,
                        metadata: {
                            document_name: autoDocName,
                            section_title: 'Aprendizado Validado',
                            category: 'Conhecimento Geral',
                            chunk_hash: factHash,
                            source: 'auto-rag-trainer',
                            conversation_id: conversationId,
                            trained_at: new Date().toISOString(),
                            rag_version: '2.0'
                        }
                    });

                    if (chunkErr) {
                        console.error(`[AutoRagTrainer] Erro ao inserir chunk do fato no Supabase:`, chunkErr);
                    } else {
                        existingHashes.add(factHash);
                        currentDocChunksCount++;
                        insertedCount++;
                        console.log(`[AutoRagTrainer] Fato inédito indexado na base vetorial RAG 2.0: "${cleanFact}"`);
                    }
                } catch (embErr) {
                    console.error(`[AutoRagTrainer] Falha ao vetorizar/indexar fato individual:`, embErr);
                }
            }

            if (insertedCount > 0) {
                await supabase.from('knowledge_documents').update({
                    status: 'ready',
                    metadata: {
                        ...(doc.metadata || {}),
                        source: 'auto-rag-trainer',
                        category: 'Conhecimento Geral',
                        auto_learned: true,
                        chunks_total: currentDocChunksCount,
                        chunks_processed: currentDocChunksCount,
                        rag_version: '2.0',
                        last_update: new Date().toISOString()
                    }
                }).eq('id', docId);
            }

            console.log(`[AutoRagTrainer] Treinamento concluído para chat ${conversationId}. Novos fatos adicionados: ${insertedCount}/${rawFacts.length}.`);

        } catch (err) {
            const errMsg = String(err?.message || err || '');
            if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') || errMsg.includes('UNAUTHENTICATED') || errMsg.includes('API key not valid')) {
                this.keySuspended = true;
                this.genAI = null;
                console.info('[AutoRagTrainer] Chave Gemini suspensa por falha 401/403. Auto-treinamento em modo contingência.');
                return;
            }
            console.error('[AutoRagTrainer] Falha crítica no pipeline de auto-treinamento:', err);
        }
    }
}

export default new AutoRagTrainer();
