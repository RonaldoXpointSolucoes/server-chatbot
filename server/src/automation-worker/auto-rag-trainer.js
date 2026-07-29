import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../supabase.js';
import { pipeline } from '@xenova/transformers';

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
    }

    init() {
        const rawKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        const apiKey = rawKey ? rawKey.replace(/^['"]|['"]$/g, '') : '';
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
            if (!this.genAI) {
                console.warn("[AutoRagTrainer] GEMINI_API_KEY não configurada. Abortando treinamento.");
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

REGRAS DE EXTRAÇÃO:
1. Extraia apenas fatos declarativos concretos e autônomos. (Ex: "A taxa de entrega para o bairro Centro é R$ 7,00.", "O suporte comercial atende pelo telefone (11) 99999-9999 das 8h às 18h.", "Aceitamos pagamentos via PIX ou Cartão de Crédito.").
2. Escreva as regras de forma clara, em português brasileiro nativo, direta e sem menção a nomes de clientes específicos ou dados pessoais confidenciais (remova CPFs, telefones pessoais, nomes de clientes e links temporários).
3. Ignore conversas informais, cumprimentos, reclamações sem solução ou bate-papo irrelevante.
4. Se o diálogo não contiver nenhuma regra de negócios útil, fato duradouro ou informação comercial nova, você DEVE retornar absolutamente vazio.
5. NUNCA extraia fatos sobre a existência, nomes ou preços de produtos, lanches, pratos, bebidas ou acompanhamentos do cardápio. A lista oficial de produtos é integrada e atualizada de forma externa e NÃO deve ser aprendida a partir de diálogos de chat. Ignore totalmente menções a pratos ou lanches específicos na transcrição.

Retorne os fatos extraídos um por linha, iniciando diretamente pelo fato sem numeração, sem marcadores de tópicos (- ou *) e sem nenhuma introdução ou explicação adicional.`;

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

            // 5. Busca ou cria o documento virtual do RAG do Auto-Aprendizado
            let { data: doc, error: docSeekErr } = await supabase.from('knowledge_documents')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('name', 'Auto-Aprendizado Dinâmico (Conversas)')
                .maybeSingle();

            if (docSeekErr || !doc) {
                const { data: newDoc, error: createErr } = await supabase.from('knowledge_documents')
                    .insert({
                        tenant_id: tenantId,
                        name: 'Auto-Aprendizado Dinâmico (Conversas)',
                        type: 'text',
                        status: 'processed',
                        metadata: { source: 'auto-rag-trainer', auto_learned: true }
                    })
                    .select('id')
                    .single();

                if (createErr || !newDoc) {
                    console.error("[AutoRagTrainer] Falha ao criar documento virtual de aprendizado:", createErr);
                    return;
                }
                doc = newDoc;
            }

            const docId = doc.id;

            // 6. Vetoriza e indexa cada fato na tabela knowledge_chunks
            const transformer = await LocalEmbeddingsPipeline.getInstance();

            for (const fact of rawFacts) {
                try {
                    // Gera o embedding do fato (Vetor 384 dimensões do MiniLM)
                    const output = await transformer(fact, { pooling: 'mean', normalize: true });
                    const embeddingVector = Array.from(output.data);

                    const { error: chunkErr } = await supabase.from('knowledge_chunks').insert({
                        document_id: docId,
                        tenant_id: tenantId,
                        content: fact,
                        embedding: embeddingVector,
                        metadata: {
                            source: 'auto-rag-trainer',
                            conversation_id: conversationId,
                            trained_at: new Date().toISOString()
                        }
                    });

                    if (chunkErr) {
                        console.error(`[AutoRagTrainer] Erro ao inserir chunk do fato no Supabase:`, chunkErr);
                    } else {
                        console.log(`[AutoRagTrainer] Fato indexado com sucesso na base vetorial RAG: "${fact}"`);
                    }
                } catch (embErr) {
                    console.error(`[AutoRagTrainer] Falha ao vetorizar/indexar fato individual:`, embErr);
                }
            }

            console.log(`[AutoRagTrainer] Treinamento concluído com sucesso para chat: ${conversationId}`);

        } catch (err) {
            console.error('[AutoRagTrainer] Falha crítica no pipeline de auto-treinamento:', err);
        }
    }
}

export default new AutoRagTrainer();
