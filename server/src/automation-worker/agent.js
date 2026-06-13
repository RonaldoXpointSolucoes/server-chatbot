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

    async routeMessageToBot(eligibleBots, textMessage) {
        if (!eligibleBots || eligibleBots.length === 0) return null;
        if (eligibleBots.length === 1) return eligibleBots[0];

        try {
            this.init();
            if (!this.genAI) {
                console.warn('[AutomationWorker] Gemini não inicializado no roteamento de bots. Usando fallback do primeiro bot.');
                return eligibleBots[0];
            }

            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

            const prompt = `Você é um orquestrador de atendimento inteligente. Analise a mensagem do cliente e decida qual dos seguintes agentes (bots) é o mais adequado para responder ao cliente com base em seus nomes e descrições.

Agentes disponíveis:
${eligibleBots.map(b => `- ID: "${b.id}" | Nome: "${b.name}" | Descrição: "${b.description || 'Sem descrição.'}"`).join('\n')}

Mensagem do cliente:
"${textMessage}"

Responda APENAS com o ID do agente escolhido, exatamente como está listado, sem formatações adicionais, sem markdown, sem aspas. Exemplo de resposta: "53a2db6c-d9c2-4760-8cbd-454ceccd280c".`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();
            
            const chosenBot = eligibleBots.find(b => responseText.includes(b.id) || b.id === responseText);
            if (chosenBot) {
                console.log(`[BotRouter] Roteamento inteligente escolheu o bot: "${chosenBot.name}" (ID: ${chosenBot.id}) para a mensagem: "${textMessage}"`);
                return chosenBot;
            } else {
                console.warn(`[BotRouter] Escolha da IA (${responseText}) não bate com os bots disponíveis. Usando fallback do primeiro bot.`);
                return eligibleBots[0];
            }
        } catch (err) {
            console.error('[BotRouter] Erro ao rotear mensagem inteligente:', err);
            return eligibleBots[0];
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

    async processMessage(params) {
        const { tenantId, instanceId, conversationId, contactId, jid, textMessage, botId, botSettings, sock, botDelay, botInstructions } = params;
        const key = conversationId || jid;

        if (!this.pendingJobs) {
            this.pendingJobs = new Map();
        }

        let job = this.pendingJobs.get(key);
        if (job) {
            // Cancela os cronômetros pendentes (tanto geração quanto envio)
            if (job.generationTimeout) clearTimeout(job.generationTimeout);
            if (job.sendTimeout) clearTimeout(job.sendTimeout);

            job.textMessages.push(textMessage);
            job.params = params; // Atualiza parâmetros para usar os mais recentes

            if (job.generating) {
                // Se a IA está gerando agora, marca como obsoleta para regerar ao finalizar
                job.obsolete = true;
                console.log(`[AutomationWorker] Novas mensagens recebidas durante a geração para ${key}. Resposta atual marcada como obsoleta.`);
            } else {
                // Re-agenda a geração após 1.5s de silêncio (debounce de entrada)
                job.generationTimeout = setTimeout(() => this.triggerGeneration(key), 1500);
                console.log(`[AutomationWorker] Nova mensagem adicionada ao job ativo para ${key}. Reiniciando debounce de entrada de 1.5s.`);
            }
        } else {
            job = {
                textMessages: [textMessage],
                params: params,
                generationTimeout: null,
                sendTimeout: null,
                generating: false,
                obsolete: false,
                responseText: null
            };
            this.pendingJobs.set(key, job);
            job.generationTimeout = setTimeout(() => this.triggerGeneration(key), 1500);
            console.log(`[AutomationWorker] Iniciada nova fila de processamento pós-debounce para ${key}. Resposta será gerada após 1.5s.`);
        }
    }

    cancelPendingMessage(conversationIdOrJid) {
        if (!conversationIdOrJid) return;
        const key = conversationIdOrJid;
        if (this.pendingJobs && this.pendingJobs.has(key)) {
            const job = this.pendingJobs.get(key);
            console.log(`[AutomationWorker] Cancelando resposta automática pendente para ${key} devido a ação/mensagem do atendente humano.`);
            if (job.generationTimeout) clearTimeout(job.generationTimeout);
            if (job.sendTimeout) clearTimeout(job.sendTimeout);
            this.pendingJobs.delete(key);
        }
    }

    async triggerGeneration(key) {
        const job = this.pendingJobs?.get(key);
        if (!job) return;

        job.generating = true;
        job.obsolete = false;
        job.generationTimeout = null;

        const combinedText = job.textMessages.join('\n');
        console.log(`[AutomationWorker] Iniciando geração da IA para ${key} com mensagens:\n"${combinedText}"`);

        try {
            const responseText = await this.generateResponse({
                ...job.params,
                textMessage: combinedText
            });

            // Se novas mensagens chegaram durante a geração, descarta e regera
            if (job.obsolete) {
                console.log(`[AutomationWorker] Geração finalizada para ${key}, mas nova mensagem chegou durante a chamada de API. Descartando resposta obsoleta.`);
                job.generating = false;
                job.generationTimeout = setTimeout(() => this.triggerGeneration(key), 1500);
                return;
            }

            job.generating = false;
            job.responseText = responseText;

            console.log(`[AutomationWorker] Resposta gerada para ${key}. Aguardando 15s de silêncio para enviar.`);

            if (job.sendTimeout) clearTimeout(job.sendTimeout);

            job.sendTimeout = setTimeout(async () => {
                try {
                    console.log(`[AutomationWorker] Fim do cronômetro de 15s para ${key}. Enviando resposta final.`);
                    const activeJob = this.pendingJobs?.get(key);
                    if (activeJob && activeJob.responseText === responseText) {
                        this.pendingJobs.delete(key);
                        await this.sendFinalResponse(activeJob.params, responseText);
                    }
                } catch (sendErr) {
                    console.error('[AutomationWorker] Erro ao enviar resposta após 15s:', sendErr);
                }
            }, 15000);

        } catch (genErr) {
            console.error('[AutomationWorker] Falha ao processar AI no triggerGeneration:', genErr);
            job.generating = false;
            this.pendingJobs.delete(key);
        }
    }

    async generateResponse({ tenantId, instanceId, conversationId, contactId, jid, textMessage, botId, botSettings, sock, botDelay, botInstructions }) {
        try {
            this.init();
            if (!this.genAI) {
                console.warn("[AutomationWorker] GEMINI_API_KEY não configurada.");
                return null;
            }

            console.log(`[AutomationWorker] Gerando resposta para o bot: ${botSettings.name} | Tenant: ${tenantId}`);

            // Carrega as variáveis globais da empresa
            let companyName = '';
            let companySettings = {};
            try {
                const { data: companyData } = await supabase
                    .from('companies')
                    .select('name, settings')
                    .eq('id', tenantId)
                    .single();

                if (companyData) {
                    companyName = companyData.name || '';
                    companySettings = companyData.settings || {};
                }
            } catch (err) {
                console.error(`[AutomationWorker] Erro ao carregar variáveis globais do tenant ${tenantId}:`, err);
            }

            const vars = {
                nomeIa: companySettings.nome_ia || companyName || 'Luna',
                endereco: companySettings.endereco || '',
                horarioFuncionamento: companySettings.horario_funcionamento || '',
                linkCardapio: companySettings.link_cardapio || '',
                instagram: companySettings.instagram || '',
                googleMaps: companySettings.google_maps || '',
                youtube: companySettings.youtube || '',
                tiktok: companySettings.tiktok || ''
            };

            // Determinar se a empresa está fechada no momento
            let isClosed = false;
            let nomeDiaAtual = 'Segunda-feira';
            let currentTimeStr = '00:00';
            
            try {
                const nowBr = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
                const diaDaSemana = nowBr.getDay(); // 0 = Domingo, 1 = Segunda, etc.
                const diasNomes = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
                nomeDiaAtual = diasNomes[diaDaSemana];
                
                const currentHour = nowBr.getHours();
                const currentMinute = nowBr.getMinutes();
                currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
                
                const horariosEstrutura = companySettings.horarios_estrutura;
                if (horariosEstrutura && Array.isArray(horariosEstrutura)) {
                    const configDia = horariosEstrutura.find(d => d.dia === nomeDiaAtual);
                    if (!configDia || !configDia.aberto) {
                        isClosed = true;
                    } else if (configDia.periodos && configDia.periodos.length > 0) {
                        let isWithinAnyPeriod = false;
                        for (const periodo of configDia.periodos) {
                            if (periodo.inicio && periodo.fim) {
                                const [startH, startM] = periodo.inicio.split(':').map(Number);
                                const [endH, endM] = periodo.fim.split(':').map(Number);
                                
                                const startVal = startH * 60 + startM;
                                const endVal = endH * 60 + endM;
                                const currentVal = currentHour * 60 + currentMinute;
                                
                                if (endVal < startVal) {
                                    // Turno passa da meia-noite (ex: 18:00 às 02:00)
                                    if (currentVal >= startVal || currentVal <= endVal) {
                                        isWithinAnyPeriod = true;
                                        break;
                                    }
                                } else {
                                    if (currentVal >= startVal && currentVal <= endVal) {
                                        isWithinAnyPeriod = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (!isWithinAnyPeriod) {
                            isClosed = true;
                        }
                    }
                }
            } catch (errHorario) {
                console.error('[AutomationWorker] Erro ao calcular horário de funcionamento:', errHorario);
            }

            const replaceTokens = (text) => {
                if (!text || typeof text !== 'string') return text;
                return text
                    .replace(/\[NOME_DA_EMPRESA\]/g, vars.nomeIa)
                    .replace(/\[ENDERECO_DA_EMPRESA\]/g, vars.endereco)
                    .replace(/\[HORARIO_FUNCIONAMENTO\]/g, vars.horarioFuncionamento)
                    .replace(/\[LINK_CARDAPIO\]/g, vars.linkCardapio)
                    .replace(/\[LINK_INSTAGRAM\]/g, vars.instagram)
                    .replace(/\[LINK_GOOGLE_MAPS\]/g, vars.googleMaps)
                    .replace(/\[LINK_YOUTUBE\]/g, vars.youtube)
                    .replace(/\[LINK_TIKTOK\]/g, vars.tiktok);
            };

            // Query Expansion para buscas RAG
            let expandedQueryText = textMessage;
            if (textMessage.trim().length < 15) {
                try {
                    const { data: lastBotMsg } = await supabase
                        .from('messages')
                        .select('text_content')
                        .eq('tenant_id', tenantId)
                        .eq('conversation_id', conversationId)
                        .eq('direction', 'outbound')
                        .order('timestamp', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (lastBotMsg && lastBotMsg.text_content) {
                        expandedQueryText = `IA perguntou: ${lastBotMsg.text_content} -> Cliente respondeu: ${textMessage}`;
                        console.log(`[AutomationWorker] Query Expansion ativada para busca semântica: "${expandedQueryText}"`);
                    }
                } catch (errExp) {
                    console.error('[AutomationWorker] Erro ao buscar última mensagem da IA para query expansion:', errExp);
                }
            }

            // 1. Busca contexto no RAG
            const transformer = await LocalEmbeddingsPipeline.getInstance();
            const output = await transformer(expandedQueryText, { pooling: 'mean', normalize: true });
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

            // 1b. Busca correções de raciocínio / comportamento da IA
            let correctionsText = '';
            try {
                const { data: reasoningAdjustments } = await supabase.rpc('match_ai_reasoning_adjustments', {
                     query_embedding: queryEmbedding,
                     match_threshold: 0.55, // Similaridade para correções
                     match_count: 3,
                     p_tenant_id: tenantId
                });

                if (reasoningAdjustments && reasoningAdjustments.length > 0) {
                    correctionsText = "\n\n### EXEMPLOS DE CORREÇÕES DE COMPORTAMENTO ANTERIORES (OBRIGATÓRIO SEGUIR) ###\n" +
                                      "O atendente corrigiu anteriormente respostas para perguntas similares de clientes. " +
                                      "Você deve seguir estritamente as diretrizes de tom, comportamento e resposta esperada abaixo:\n" +
                                      reasoningAdjustments.map((r, idx) => {
                                        let text = `Correção ${idx + 1}:\n`;
                                        if (r.context_summary) {
                                            text += `- Contexto/Memória da Conversa: "${r.context_summary}"\n`;
                                        }
                                        text += `- Pergunta Similar do Cliente: "${r.user_query}"\n` +
                                                `- Resposta Esperada Corrigida: "${r.corrected_response}"`;
                                        return text;
                                      }).join("\n---\n");
                }
            } catch (errCorr) {
                console.error('[AutomationWorker] Erro ao buscar correções de IA:', errCorr);
            }

            // 2. Prepara o System Prompt
            let basePrompt = botSettings.systemPrompt || botSettings.system_prompt || "Você é um assistente prestativo.";
            
            // Regra Global Estrita: Ocultar arquitetura interna de sub-robôs e unificar a persona como "Luna"
            basePrompt += `\n\n### DIRETRIZES DE IDENTIDADE E CONFIDENCIALIDADE (ESTRITAS) ###\n` +
                          `1. Sua identidade pública para o cliente é unicamente "Luna". Você deve se apresentar e se comportar apenas como Luna.\n` +
                          `2. NUNCA mencione termos de arquitetura interna de robôs ou outros nomes de robôs (como "Luna Menu", "Luna Pedido", "Luna SAC", "Luna Agendador", etc.) na conversa com o cliente.\n` +
                          `3. Jamais diga coisas como "posso chamar a Luna Pedido" ou "a Luna Menu vai te ajudar". Em vez disso, assuma toda a responsabilidade pela interação ou diga que você mesma (Luna) ajudará o cliente com o que for necessário (pedido, cardápio, agendamento, etc.).\n` +
                          `4. Para o cliente, você é única e seu nome é apenas Luna.\n`;

            // Regra Global de Humanização do Atendimento (WhatsApp Brasil)
            basePrompt += `\n\n### DIRETRIZES DE HUMANIZAÇÃO E TOM DE VOZ (ESTRITAS) ###\n` +
                          `1. Você deve soar como um ser humano extremamente caloroso, empático, educado e prestativo no WhatsApp, não como um assistente corporativo frio ou robótico.\n` +
                          `2. EVITE terminologias robóticas, jargões formais ou expressões engessadas (ex: "prezado", "prezada", "procedimento", "conforme solicitado", "estarei verificando", "atendimento transferido", "aguarde um instante/momento").\n` +
                          `3. Use escuta ativa: valide as emoções do cliente. Se ele relatar um problema ou demonstrar urgência/ansiedade, responda com empatia profunda (ex: "Entendo perfeitamente", "Sinto muito por isso, deixa comigo que vou resolver", "Vou te ajudar agora mesmo").\n` +
                          `4. Escreva com naturalidade: use parágrafos curtos, linguagem coloquial profissional fluida do Brasil e adicione de 1 a 3 emojis calorosos para humanizar a conversa, sem exagerar.\n` +
                          `5. PRIORIZE E SIGA ESTRITAMENTE as instruções e exemplos de respostas corrigidas que constam no Manual de Raciocínio e Ajustes da I.A ou nas correções anteriores. Se houver uma correção registrada para uma pergunta similar do cliente, você deve replicar o estilo, o tom e a solução adotada pelo atendente humano.\n`;

            if (botInstructions && botInstructions.trim().length > 0) {
                basePrompt += `\n\n### INSTRUÇÕES DE COMPORTAMENTO PERSONALIZADAS ###\nImportante: Siga estritamente as diretrizes e regras de personalidade a seguir em todas as interações:\n${botInstructions}\n`;
            }

            // Diretrizes de Horário de Funcionamento
            let storeStatusText = `\n\n### STATUS E HORÁRIO DE ATENDIMENTO ###\n` +
                                  `- Status Atual da Loja: ${isClosed ? 'FECHADA' : 'ABERTA'}\n` +
                                  `- Horário de Brasília Atual: ${currentTimeStr} (${nomeDiaAtual})\n` +
                                  `- Horário Geral da Empresa: ${vars.horarioFuncionamento || 'Não cadastrado'}\n`;
            
            if (isClosed) {
                storeStatusText += `\n⚠️ DIRETRIZ CRÍTICA (ESTRITA): A empresa está FECHADA neste momento. Você deve responder ao cliente de forma extremamente calorosa, empática e amigável informando que estamos fora do horário de atendimento. Indique os horários de funcionamento normais (acima) e convide-o com carinho a entrar em contato novamente quando reabrirmos. NUNCA faça anotações de pedidos, agendamento de turnos ou promessas de atendimento imediato se a casa estiver fechada.\n`;
            }
            
            basePrompt += storeStatusText;

            const systemPrompt = replaceTokens(basePrompt + contextText + correctionsText);
            
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
                        },
                        {
                            name: "Consultar_cep",
                            description: "Consulta informações de endereço completo (rua, bairro, cidade e estado) a partir de um número de CEP fornecido pelo cliente.",
                            parameters: {
                                type: "OBJECT",
                                properties: {
                                    cep: {
                                        type: "STRING",
                                        description: "O número de CEP fornecido pelo cliente (ex: 01001-000 ou 01001000)."
                                    }
                                },
                                required: ["cep"]
                            }
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
                                await supabase.from('conversations').update({ status: 'open', ai_paused: true }).eq('id', conversationId);
                            }
                            functionResult = { status: "Atendimento transferido. Encerre sua participação." };
                        }
                        else if (call.name === "Atualizar_nome_contato") {
                            if (contactId) {
                                await supabase.from('contacts').update({ name: call.args.nome_cliente }).eq('id', contactId);
                            }
                            functionResult = { status: "Nome do contato atualizado com sucesso no sistema para " + call.args.nome_cliente };
                        }
                        else if (call.name === "Consultar_cep") {
                            const rawCep = String(call.args.cep || '').replace(/\D/g, '');
                            if (rawCep.length !== 8) {
                                functionResult = { erro: "O CEP fornecido é inválido. Deve conter exatamente 8 algarismos." };
                            } else {
                                try {
                                    console.log(`[AutomationWorker - CEP] Consultando CEP ${rawCep} na ViaCEP...`);
                                    const response = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
                                    if (response.ok) {
                                        const data = await response.json();
                                        if (data.erro) {
                                            functionResult = { erro: "O CEP pesquisado não foi localizado na base dos Correios." };
                                        } else {
                                            functionResult = {
                                                logradouro: data.logradouro || '',
                                                bairro: data.bairro || '',
                                                cidade: data.localidade || '',
                                                estado: data.uf || '',
                                                cep: data.cep || ''
                                            };
                                        }
                                    } else {
                                        functionResult = { erro: "Serviço de busca de CEP temporariamente indisponível." };
                                    }
                                } catch (cepErr) {
                                    console.error("[AutomationWorker - CEP] Erro na requisição ViaCEP:", cepErr);
                                    functionResult = { erro: "Erro ao conectar-se ao servidor de CEP." };
                                }
                            }
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

            return finalResponseText;

        } catch (error) {
            console.error('[AutomationWorker] Falha ao processar AI na geração:', error);
            return null;
        }
    }

    async sendFinalResponse(params, finalResponseText) {
        const { tenantId, instanceId, conversationId, contactId, jid, botSettings, sock, botDelay } = params;
        
        try {
            if (finalResponseText && sock) {
                // Simulação de digitação (Atraso Humano) baseada no botDelay
                const delaySec = Number(botDelay) || 0;
                if (delaySec > 0) {
                    try {
                        await sock.sendPresenceUpdate('composing', jid);
                    } catch (e) {
                        console.error('[AutomationWorker] Falha ao enviar presença composing:', e);
                    }
                    await new Promise(resolve => setTimeout(resolve, delaySec * 1000));
                    try {
                        await sock.sendPresenceUpdate('paused', jid);
                    } catch (e) {}
                }

                const msgResult = await sock.sendMessage(jid, { text: finalResponseText });
                if (msgResult && msgResult.key) {
                    const { data: savedMsg } = await supabase.from('messages').insert({
                        tenant_id: tenantId,
                        instance_id: instanceId,
                        conversation_id: conversationId,
                        direction: 'outbound',
                        message_type: 'text',
                        status: 'sent',
                        text_content: finalResponseText,
                        whatsapp_message_id: msgResult.key.id,
                        sender_type: 'bot',
                        raw_payload: {
                            ...msgResult,
                            bot_name: botSettings?.name || 'IA ChatBoot'
                        }
                    }).select('*').single();

                    if (conversationId) {
                        await supabase.from('conversations').update({
                            updated_at: new Date().toISOString(),
                            last_message_at: new Date().toISOString(),
                            last_message_preview: finalResponseText.substring(0, 50)
                        }).eq('id', conversationId);
                    }

                    if (savedMsg) {
                        const { default: realtime } = await import('../realtime-publisher/index.js');
                        await realtime.publishInboxEvent(tenantId, 'message.new', {
                            message: savedMsg,
                            contact_phone: jid.split('@')[0],
                            conversation_id: conversationId
                        });
                    }
                }
            }
        } catch (err) {
            console.error('[AutomationWorker] Falha ao registrar ou enviar resposta final no BD:', err);
        }
    }
}

export default new AutomationWorker();
