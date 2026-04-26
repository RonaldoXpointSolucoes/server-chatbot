import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../supabase.js';
import { pipeline } from '@xenova/transformers';

// Helper if EmbeddingsPipeline is not exported easily:
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

class AutomationWorker {
    constructor() {
        // As chaves são carregadas no ambiente via dotenv
        this.genAI = null;
    }

    init() {
        const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        if (apiKey && !this.genAI) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        }
    }

    async getConversationHistory(tenantId, conversationId, limit = 10) {
        if (!conversationId) return [];
        const { data } = await supabase.from('messages')
            .select('text_content, sender_type')
            .eq('tenant_id', tenantId)
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: false })
            .limit(limit);
        
        if (!data) return [];
        
        // Return chronologically
        const rawHistory = data.reverse().map(m => ({
            role: m.sender_type === 'bot' || m.sender_type === 'agent' ? 'model' : 'user',
            parts: [{ text: m.text_content || '' }]
        }));

        // Sanitize history for Gemini (Must start with 'user', roles must alternate)
        const sanitizedHistory = [];
        for (const msg of rawHistory) {
            if (sanitizedHistory.length === 0 && msg.role !== 'user') continue;
            if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === msg.role) {
                sanitizedHistory[sanitizedHistory.length - 1].parts[0].text += '\n' + msg.parts[0].text;
            } else {
                sanitizedHistory.push({ role: msg.role, parts: [{ text: msg.parts[0].text }] });
            }
        }

        return sanitizedHistory;
    }

    async processMessage({ tenantId, instanceId, conversationId, contactId, jid, textMessage, botId, botSettings, sock }) {
        try {
            this.init();
            if (!this.genAI) {
                console.warn("[AutomationWorker] GEMINI_API_KEY não configurada.");
                return;
            }

            console.log(`[AutomationWorker] Processando mensagem para o bot: ${botSettings.name} | Tenant: ${tenantId}`);

            // 1. Busca contexto no RAG
            const transformer = await LocalEmbeddingsPipeline.getInstance();
            const output = await transformer(textMessage, { pooling: 'mean', normalize: true });
            const queryEmbedding = Array.from(output.data);

            const { data: semanticMatches } = await supabase.rpc('match_knowledge_chunks', {
                 query_embedding: queryEmbedding,
                 match_threshold: 0.45,
                 match_count: 3,
                 p_tenant_id: tenantId
            });

            let contextText = '';
            if (semanticMatches && semanticMatches.length > 0) {
                contextText = "\n\n### CONTEXTO DA BASE DE CONHECIMENTO ###\nVocê pode usar as informações a seguir para basear sua resposta caso seja útil:\n" +
                              semanticMatches.map(m => m.content).join("\n---\n");
            }

            // 2. Prepara o System Prompt
            const systemPrompt = (botSettings.system_prompt || "Você é um assistente prestativo.") + contextText;
            
            // 3. Obtem histórico da conversa
            let history = await this.getConversationHistory(tenantId, conversationId, 12);
            // remove last message as it will be sent as new prompt
            if (history.length > 0 && history[history.length - 1].role === 'user') {
                history.pop();
            }

            // Garantia de Integridade Estrita para Gemini API
            if (history.length > 0 && history[0].role !== 'user') {
                history.shift(); // Histórico DEVE iniciar com 'user'
            }
            // Filtra partes com texto vazio (Gemini crasha)
            history = history.filter(h => h.parts && h.parts[0] && h.parts[0].text && typeof h.parts[0].text === 'string' && h.parts[0].text.trim() !== '');

            // Reagrupa caso haja roles subsequentes iguais (Gemini exige alternância estrita)
            const finalHistory = [];
            for (const h of history) {
                if (finalHistory.length === 0) {
                    if (h.role === 'user') finalHistory.push(h);
                } else {
                    if (finalHistory[finalHistory.length - 1].role !== h.role) {
                        finalHistory.push(h);
                    } else {
                        finalHistory[finalHistory.length - 1].parts[0].text += '\n' + h.parts[0].text;
                    }
                }
            }
            history = finalHistory;

            // Garantia extra: O histórico enviado para o .startChat() não pode terminar com 'user'
            // pois o sendMessage logo em seguida fará um push de um novo 'user', quebrando a regra de alternância
            if (history.length > 0 && history[history.length - 1].role === 'user') {
                history.pop();
            }

            let modelName = botSettings.model || 'gemini-2.5-flash';
            if (modelName === 'gemini-1.5-pro' || modelName === 'gemini-1.5-flash') {
                modelName = 'gemini-2.5-flash';
            }
            const model = this.genAI.getGenerativeModel({ 
                model: modelName,
                systemInstruction: { parts: [{ text: systemPrompt }] },
                tools: [{
                    functionDeclarations: [
                        {
                            name: "Buscar_janelas_disponiveis",
                            description: "Busca os horários de agendamento disponíveis para um determinado dia.",
                            parameters: { type: "OBJECT", properties: { data_referencia: { type: "STRING", description: "Data YYYY-MM-DD" } }, required: ["data_referencia"] }
                        },
                        {
                            name: "Criar_agendamento",
                            description: "Cria um novo agendamento no sistema para o cliente.",
                            parameters: { type: "OBJECT", properties: { data_hora: { type: "STRING", description: "Data/hora ISO 8601" }, nome_cliente: { type: "STRING" }, assunto: { type: "STRING" } }, required: ["data_hora", "nome_cliente"] }
                        },
                        {
                            name: "Buscar_agendamentos_do_contato",
                            description: "Busca se este cliente já possui algum agendamento ativo.",
                            parameters: { type: "OBJECT", properties: {} }
                        },
                        {
                            name: "Escalar_humano",
                            description: "Transfere o atendimento para um atendente humano.",
                            parameters: { type: "OBJECT", properties: { motivo: { type: "STRING" } }, required: ["motivo"] }
                        },
                        {
                            name: "Enviar_texto_separado",
                            description: "Envia uma mensagem parcial antes da resposta final.",
                            parameters: { type: "OBJECT", properties: { texto: { type: "STRING" } }, required: ["texto"] }
                        },
                        {
                            name: "Atualizar_nome_contato",
                            description: "Atualiza o nome do contato no sistema quando o cliente informar seu nome na conversa ou no resumo de pedidos.",
                            parameters: { type: "OBJECT", properties: { nome_cliente: { type: "STRING" } }, required: ["nome_cliente"] }
                        }
                    ]
                }]
            });

            const chat = model.startChat({
                history: history,
                generationConfig: {
                    temperature: Number(botSettings.temperature) || 0.7,
                }
            });

            let finalResponseText = '';
            let keepLooping = true;
            let currentMessageText = textMessage;
            let loopCount = 0;
            const MAX_LOOPS = 5;

            // Executa com Function Calling Loop
            while (keepLooping && loopCount < MAX_LOOPS) {
                loopCount++;
                try {
                    const result = await chat.sendMessage(currentMessageText);
                    const response = result.response;
                    const calls = response.functionCalls();

                    if (calls && calls.length > 0) {
                        const call = calls[0];
                        console.log(`[AutomationWorker] AI quer chamar a tool: ${call.name}`);
                        
                        let functionResult = {};

                        if (call.name === "Buscar_janelas_disponiveis") {
                            // Simulação de janelas (Mock para o exemplo, poderia consultar o BD)
                            functionResult = { disponiveis: ["09:00", "10:30", "14:00", "16:00"] };
                        } 
                        else if (call.name === "Criar_agendamento") {
                            const { data, error } = await supabase.from('appointments').insert({
                                tenant_id: tenantId,
                                contact_id: contactId,
                                start_time: call.args.data_hora,
                                end_time: new Date(new Date(call.args.data_hora).getTime() + 60*60*1000).toISOString(),
                                notes: call.args.assunto
                            }).select('id');
                            functionResult = error ? { erro: error.message } : { sucesso: true, id: data[0].id };
                        }
                        else if (call.name === "Buscar_agendamentos_do_contato") {
                            const { data } = await supabase.from('appointments')
                                .select('*')
                                .eq('contact_id', contactId)
                                .in('status', ['scheduled']);
                            functionResult = data && data.length > 0 ? { agendamentos: data } : { agendamentos: [] };
                        }
                        else if (call.name === "Enviar_texto_separado") {
                            if (sock) {
                                await sock.sendMessage(jid, { text: call.args.texto });
                            }
                            functionResult = { status: "Mensagem enviada com sucesso" };
                        }
                        else if (call.name === "Escalar_humano") {
                            if (conversationId) {
                                await supabase.from('conversations').update({ status: 'open' }).eq('id', conversationId);
                                // Desativa bot desta conversa se houver algum log ou state (depende de como o event-processor roteia)
                            }
                            functionResult = { status: "Atendimento transferido. Encerre sua participação." };
                        }
                        else if (call.name === "Atualizar_nome_contato") {
                            if (contactId) {
                                await supabase.from('contacts').update({ name: call.args.nome_cliente }).eq('id', contactId);
                            }
                            functionResult = { status: "Nome do contato atualizado com sucesso no sistema para " + call.args.nome_cliente };
                        }
                        else {
                            functionResult = { erro: "Ferramenta desconhecida" };
                        }

                        // Envia o resultado da função de volta para a IA continuar o raciocínio
                        currentMessageText = [{
                            functionResponse: {
                                name: call.name,
                                response: functionResult
                            }
                        }];
                    } else {
                        // Sem tools a chamar, extrai texto final
                        finalResponseText = response.text();
                        keepLooping = false;
                    }
                } catch (loopError) {
                    console.error(`[AutomationWorker] Erro durante o loop de função (Iteração ${loopCount}):`, loopError);
                    finalResponseText = "Desculpe, ocorreu um pequeno erro interno ao processar sua requisição. Pode tentar novamente?";
                    keepLooping = false;
                }
            }

            if (loopCount >= MAX_LOOPS) {
                console.warn(`[AutomationWorker] Loop infinito detectado para a conversa ${conversationId}. Abortando geração.`);
                finalResponseText = finalResponseText || "Desculpe, encontrei uma dificuldade técnica. Em que posso ajudar?";
            }

            // 4. Envia resposta final
            if (finalResponseText && sock) {
                await sock.sendMessage(jid, { text: finalResponseText });
            }

        } catch (error) {
            console.error('[AutomationWorker] Falha ao processar AI:', error);
            if (sock) {
                // Notifica que ocorreu um erro? Melhor silenciar e registrar log.
            }
        }
    }
}

export default new AutomationWorker();
