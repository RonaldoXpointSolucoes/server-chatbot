import { GoogleGenerativeAI } from "@google/generative-ai";
import { useChatStore } from "../store/chatStore";

// Ensure there is a way to handle missing keys gracefully in UI
const fallbackApiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

const formatValueToString = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) {
    return val.map(item => `- ${formatValueToString(item)}`).join('\n');
  }
  if (typeof val === 'object') {
    return Object.entries(val)
      .map(([key, value]) => `**${key}**: ${formatValueToString(value)}`)
      .join('\n');
  }
  return String(val);
};

class GeminiService {
  getApiKey(): string {
    const LEAKED_KEYS = [
      "AIzaSyBS_DkByF6W2bCSue7RJbW4l43E7jqTozc"
    ];

    // 1. Check local override
    const localKey = typeof window !== 'undefined' ? localStorage.getItem('user_gemini_api_key') : null;
    if (localKey && localKey.length > 5) {
      const cleanKey = localKey.replace(/^['"]|['"]$/g, '').trim();
      if (LEAKED_KEYS.includes(cleanKey)) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('user_gemini_api_key');
        }
      } else {
        return cleanKey;
      }
    }
    
    // 2. Check store / database settings
    try {
      const storeKey = useChatStore.getState().tenantInfo?.settings?.gemini_api_key;
      if (storeKey && storeKey.length > 5) {
        const cleanKey = storeKey.replace(/^['"]|['"]$/g, '').trim();
        if (!LEAKED_KEYS.includes(cleanKey)) {
          return cleanKey;
        }
      }
    } catch (e) {}

    // 3. Fallback to env variable
    const cleanFallback = fallbackApiKey.replace(/^['"]|['"]$/g, '').trim();
    if (LEAKED_KEYS.includes(cleanFallback)) {
      return '';
    }
    return cleanFallback;
  }

  private getGenAI(): GoogleGenerativeAI {
    const key = this.getApiKey();
    return new GoogleGenerativeAI(key || 'unconfigured');
  }

  isConfigured(): boolean {
    const key = this.getApiKey();
    return key.length > 5;
  }

  async enhanceMessage(draft: string, intent: 'grammar' | 'sales' | 'enchant' | 'support' | 'analyze', contextHistory: {role: string, text: string}[]): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('VITE_GEMINI_API_KEY não configurada. Configure a sua chave de API nas Configurações do sistema.');
    }
    const model = this.getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });

    const historyText = contextHistory.slice(-15).map(m => `${m.role}: ${m.text}`).join('\n');

    let promptObj = "";
    switch(intent) {
      case 'grammar':
        promptObj = `Aja como um revisor profissional. Corrija gramática, pontuação e ortografia do texto abaixo, mantendo exatamente o mesmo sentido e o idioma português. Histórico da conversa (para contexto):\n${historyText}\n\nTexto a corrigir:\n${draft}`;
        break;
      case 'sales':
        promptObj = `Aja como um vendedor experiente e persuasivo. Reescreva o texto do Atendente focando em gerar urgência, destacar benefícios e aumentar o desejo do cliente de fechar negócio. SEJA BREVE E CONCISO, mantendo o profissionalismo em poucas linhas, sem fazer textos enormes. Histórico:\n${historyText}\n\nTexto do Atendente:\n${draft}`;
        break;
      case 'enchant':
        promptObj = `Aja como especialista em encantamento e sucesso do cliente (Customer Success). Reescreva o texto do Atendente para ser extremamente empático, humano, amigável e encantador. SEJA BREVE E DIRETO, evitando respostas longas, mas entregando muita simpatia em poucas palavras. Histórico:\n${historyText}\n\nTexto do Atendente:\n${draft}`;
        break;
      case 'support':
        promptObj = `Aja como um analista de suporte técnico excelente. Reescreva o texto do Atendente para ser claríssimo e amigável. Para dúvidas de suporte, PODE E DEVE MANTER OS DETALHES e ser bem ESPECÍFICO nas explicações, não economize no passo a passo se for para ajudar o cliente. Histórico:\n${historyText}\n\nTexto do Atendente:\n${draft}`;
        break;
      case 'analyze':
        promptObj = `Aja como um supervisor experiente de atendimento e vendas. Analise o histórico da conversa abaixo e forneça um feedback detalhado com insights importantes sobre o sentimento do cliente, o que ele está precisando e sugestões de próximos passos ou como conduzir. Histórico:\n${historyText}\n\nLembre-se que isto é um relatório para o ATENDENTE. Não é uma mensagem para ser enviada, mas um resumo de análise interna.`;
        break;
    }

    let formatRules = `
ATENÇÃO E REGRAS DE FORMATO:
1. Separe BEM o texto em parágrafos curtos pulando uma linha em branco entre eles.
2. Mantenha um tom mais formal e profissional. Use emojis de forma MUITO restrita (no máximo 1 ou 2 em toda a mensagem) apenas se estritamente necessário para quebrar o gelo.
3. Retorne APENAS a mensagem pronta para envio, sem aspas, sem marcadores de markdown, sem responder ou adicionar conversinha antes da resposta real.`;

    if (intent === 'analyze') {
       formatRules = `
ATENÇÃO E REGRAS DE FORMATO:
1. Separe BEM os pontos em tópicos curtos e objetivos.
2. Seja direto ao ponto. Use estilo de relatório interno, sem saudações e enrolações.
3. Use emojis para destacar pontos vitais.`;
    }

    const prompt = `${promptObj}\n${formatRules}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  }

  async chatWithArchitect(history: {role: 'user'|'model', text: string}[]): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Chave de API do Gemini não configurada. Configure a sua chave de API nas Configurações.');
    }
    const model = this.getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });

    // Build standard multi-turn format for Gemini
    const contents = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    // Start Chat
    const chat = model.startChat({
      history: contents,
      systemInstruction: {
        role: "system",
        parts: [{ text: `Você é um Arquiteto de I.A Expert Master, especializado em criar os melhores "System Prompts" do mercado para robôs de atendimento de WhatsApp, focando fortemente em Restaurantes, Lanchonetes, Delivery de comida, Clínicas e Oficinas.
Seu objetivo é extrair do cliente as informações chave (como nome do negócio, tom de voz desejado, cardápio principal ou serviços, tempo de resposta, regras especiais) de forma BEM natural e interativa.

Regras de Interação:
1. Faça Apenas 1 ou 2 perguntas de cada vez. Não assuste o cliente com muitas perguntas longas de uma vez.
2. Ajude o cliente sugerindo ideias (ex: "Legal que é uma pizzaria, você prefere que o robô já mande o link do cardápio logo de primeira ou espere o cliente pedir?").
3. Mantenha um tom muito empático, inspirador e com foco em VENDAS e ATENDIMENTO EXCELENTE (Customer Success). Use emojis.
4. Quando você julgar que já tem informações suficientes (ex: nome do negócio, o que vendem e principal regra), gere o "Prompt de Sistema Final".

QUANDO FOR CONCLUIR E GERAR O BOT:
Retorne no final da sua mensagem obrigatoriamente um bloco de código markdown começando com \`\`\`bot-config e terminando com \`\`\`. 
Dentro dele, passe um JSON com a configuração perfeita e maravilhosa do bot.

REGRAS CRÍTICAS DO JSON:
- O JSON deve ser perfeitamente válido.
- NUNCA use quebras de linha reais (Enter) dentro dos valores string (como no systemPrompt). Use SEMPRE "\\n" literal na string para que o JSON.parse não quebre.
- As strings devem estar sempre entre aspas duplas escapando aspas internas caso existam.

Exemplo do JSON final esperado dentro do bloco:
\`\`\`bot-config
{
  "name": "Nome sugerido",
  "description": "Pequena descrição de 1 linha",
  "systemPrompt": "Aqui entra o textão de System Prompt.\\nTodo o comportamento, regras e exemplos pro llm.\\n\\nQuanto mais rico, melhor.",
  "model": "gemini-1.5-pro",
  "temperature": 0.5
}
\`\`\`
Nunca esqueça dessa formatação JSON quando for a hora da entrega. Até lá, apenas converse e ajude o usuário com respostas curtas.` }]
      }
    });

    const result = await chat.sendMessage([
      "Agir como Arquiteto Expert. Me responda e analise o meu contexto anterior e a minha última mensagem, seguindo o seu System Prompt."
    ]);
    
    return result.response.text();
  }

  async transcribeAudio(mediaUrl: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Chave de API do Gemini não configurada. Configure a sua chave de API nas Configurações.');
    }

    try {
      // 1. Fetch o áudio e converte pra base64 (isso só funciona se não tiver CORS block)
      const req = await fetch(mediaUrl);
      if (!req.ok) throw new Error("Falha ao baixar o áudio da URL fornecida.");
      
      const blob = await req.blob();
      const base64DataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror =() => reject(new Error("Falha ao ler o áudio"));
        reader.readAsDataURL(blob);
      });
      const base64Audio = base64DataUrl.split(',')[1];
      
      // Vamos tentar deduzir o mimetype (ex vindo do whatsapp geralmente é ogg/oga, ou mpeg se for MP3)
      let mimeType = req.headers.get("content-type") || "audio/ogg";
      
      // DEBUB: if it's HTML, we shouldn't send it to Gemini! It means the URL is an error page or a Vercel 404.
      if (mimeType.includes("text/html")) {
        console.error("GeminiService Error: audio URL returned HTML string. URL:", mediaUrl);
        const textBody = await blob.text();
        console.error("HTML Body snippet:", textBody.substring(0, 500));
        throw new Error(`A URL do áudio é inválida ou não está acessível (retornou página web). URL: ${mediaUrl}`);
      }

      if(mimeType.includes("application/octet-stream")) mimeType = "audio/ogg"; // fallback comum

      const payload = {
        contents: [
          {
            parts: [
              { text: "Transcreva o que está sendo dito neste áudio aplicando as seguintes regras:\n1. Melhore a transcrição dividindo-a em parágrafos e adicionando espaçamentos por assunto para facilitar a leitura.\n2. Faça ajustes contextuais: se alguma palavra falada não fizer sentido no contexto da frase, altere para a palavra que faz mais sentido (correção semântica).\n3. Mantenha o sentido e a intenção original da fala.\n4. Se não houver voz ou ninguém falar, responda apenas com: '[Áudio sem fala detectável]'.\n5. Retorne APENAS o texto final da transcrição, sem introduções, aspas ou explicações." },
              {
                inlineData: {
                  mimeType,
                  data: base64Audio
                }
              }
            ]
          }
        ]
      };

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.getApiKey()}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if(data.error) {
         throw new Error(data.error.message);
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return text ? text.trim() : "[Nenhuma transcrição retornada]";
    } catch (err) {
      console.error("Erro em transcribeAudio:", err);
      throw err;
    }
  }

  async suggestReplyWithContext(targetMessageText: string, contextHistory: {role: string, text: string}[]): Promise<string[]> {
    if (!this.isConfigured()) {
      throw new Error('Chave de API do Gemini não configurada. Configure a sua chave de API nas Configurações.');
    }
    const model = this.getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });

    // Format the context
    const historyText = contextHistory.map(m => `${m.role === 'user' ? 'Cliente' : 'Atendente (VOCÊ)'}: ${m.text}`).join('\n');

    const promptObj = `Aja como um atendente especializado de altíssimo nível.
O atendente SOU EU. Você deve SEMPRE responder em primeira pessoa (Eu, nós). NUNCA fale de mim em terceira pessoa (Ex: "Ele ficou tocado", "O Ronaldo agradece"). Use sempre "Eu fiquei tocado", "Eu agradeço", "Ficamos felizes".

Preciso de TRÊS sugestões DIFERENTES de resposta para enviar ao cliente.
Eu, o Atendente, cliquei para "Responder" ESPECIFICAMENTE a esta mensagem do cliente: "${targetMessageText}"

Aqui está o histórico das últimas mensagens (até 50) para você entender perfeitamente o contexto geral:
--- HISTÓRICO ---
${historyText}
-----------------

Sua tarefa: Crie as TRÊS MELHORES sugestões possíveis focadas nessa mensagem específica ("${targetMessageText}"), baseando-se no contexto de toda a conversa.
Seja educado, prestativo e mantenha uma postura profissional e mais formal, evitando linguagem excessivamente descontraída. Cada uma das 3 sugestões deve ter um tom um pouco diferente (ex: uma curta e direta, uma empática, uma mais detalhada).`;

    const formatRules = `
ATENÇÃO E REGRAS DE FORMATO CRÍTICAS:
1. Retorne EXATAMENTE UM ARRAY JSON contendo as 3 strings com o texto pronto para envio. Nada além disso. 
2. NUNCA use marcadores markdown (\`\`\`json) ou textos introdutórios. Retorne apenas o array cru: ["Opção 1", "Opção 2", "Opção 3"]
3. Mantenha o tom profissional. Limite o uso de emojis (máximo 1 ou 2 por mensagem, ou nenhum).
4. LEMBRE-SE: PRIMEIRA PESSOA SEMPRE. NUNCA use terceira pessoa para falar do atendente/empresa.
5. FORMATAÇÃO: Sempre formate a mensagem de forma legível, com quebras de linha separando parágrafos ou diferentes assuntos. Use "\\n\\n" nas strings para criar os espaçamentos necessários.`;

    const prompt = `${promptObj}\n${formatRules}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    
    try {
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(String).slice(0, 3);
      }
      throw new Error("Formato inválido");
    } catch (e) {
      console.error("Erro no parse do JSON do Gemini, fallback:", text);
      return [text.substring(0, 300).replace(/["\[\]]/g, '')];
    }
  }

  async generateCannedResponse(promptUser: string, ragContext: string, tone: string = 'professional'): Promise<{ text: string, shortcut: string }> {
    if (!this.isConfigured()) {
      throw new Error('Chave de API do Gemini não configurada. Configure a sua chave de API nas Configurações.');
    }
    const model = this.getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });

    let toneInstruction = "Mantenha um tom profissional, polido, formal e extremamente educado.";
    switch (tone) {
      case 'friendly':
        toneInstruction = "Mantenha um tom amigável, acolhedor, caloroso, muito empático e humano.";
        break;
      case 'persuasive':
        toneInstruction = "Mantenha um tom persuasivo de vendas, destacando benefícios, gerando urgência comercial suave e incentivando o cliente a tomar uma ação ou fechar negócio.";
        break;
      case 'technical':
        toneInstruction = "Mantenha um tom técnico, claro e detalhado. Organize o conteúdo em passos lógicos, listas ou tópicos se necessário para facilitar a compreensão do suporte.";
        break;
      case 'direct':
        toneInstruction = "Mantenha um tom extremamente direto, curto e conciso. Vá direto ao ponto em poucas palavras ou no máximo duas frases curtas.";
        break;
    }

    const systemPrompt = `Você é uma Inteligência Artificial especialista em comunicação empresarial e atendimento ao cliente de altíssimo nível.
Sua missão é criar uma "Resposta Rápida/Pronta" perfeita para um operador de chat de suporte ou vendas.

A resposta deve ser baseada estritamente no prompt do usuário e complementarmente fundamentada no contexto da base de conhecimento (RAG) fornecido abaixo (se houver).

ESTILO DE ESCRITA:
${toneInstruction}

Você deve retornar obrigatoriamente um objeto JSON com exatamente duas propriedades:
1. "content": O texto final da resposta pronta criado de acordo com as instruções de estilo de escrita fornecidas, separando os assuntos em parágrafos pulando linha se necessário e usando emojis de forma muito moderada (1-2 no máximo).
2. "shortcut": Uma sugestão de atalho perfeito, curto, intuitivo e em letras minúsculas sem acentos/caracteres especiais, que comece obrigatoriamente com barra "/" (ex: "/cobranca", "/prazo-entrega", "/reembolso-pix") baseado no assunto da resposta gerada.

--- CONTEXTO RAG (BASE DE CONHECIMENTO DA EMPRESA) ---
${ragContext || 'Nenhum contexto de base de conhecimento fornecido. Use seu conhecimento geral com foco em atendimento profissional de sucesso do cliente.'}
-----------------------------------------------------

--- PROMPT/DADOS DO USUÁRIO OPERADOR ---
"${promptUser}"
----------------------------------------

REGRAS DE RETORNO CRÍTICAS:
1. Retorne EXATAMENTE e APENAS o JSON contendo as chaves "content" e "shortcut". 
2. NUNCA coloque blocos de marcação markdown (\`\`\`json ou \`\`\`) na resposta, nem saudações/explicações antes ou depois. Retorne apenas o objeto JSON cru e limpo para que possamos fazer JSON.parse imediatamente no frontend.`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const text = response.text().trim();
    
    try {
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.content && parsed.shortcut) {
        return {
          text: String(parsed.content),
          shortcut: String(parsed.shortcut)
        };
      }
      throw new Error("JSON incompleto");
    } catch (e) {
      console.error("Erro no parse do JSON de resposta pronta do Gemini, fallback:", text);
      const words = promptUser.split(' ');
      const fallbackShortcut = '/' + (words[0] ? words[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "") : "resposta");
      const cleanText = text.replace(/^{\s*"content"\s*:\s*"/gi, '').replace(/"\s*,\s*"shortcut"\s*:\s*".*"\s*}$/gi, '').replace(/\\n/g, '\n').trim();
      return {
        text: cleanText || text,
        shortcut: fallbackShortcut
      };
    }
  }

  async compareFaces(photoBase64_1: string, photoBase64_2: string): Promise<{ verified: boolean, confidence: number }> {
    if (!this.isConfigured()) {
      throw new Error('Chave de API do Gemini não configurada. Configure a sua chave de API nas Configurações.');
    }

    try {
      const model = this.getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `Você é um sistema biométrico de reconhecimento facial de alta segurança e precisão cirúrgica.
Sua tarefa é comparar as duas imagens fornecidas e determinar se pertencem à mesma pessoa física.

REGRAS DE SEGURANÇA E RIGOR BIOMÉTRICO EXTREMAS:
1. Se qualquer uma das imagens (especialmente a foto capturada pela câmera) apresentar obstrução severa do rosto, como:
   - Mãos cobrindo os olhos, testa, boca ou nariz (como no caso de tapar o rosto com as mãos).
   - Máscaras, óculos escuros de sol (que cobrem os olhos), lenços ou panos.
   - Ângulos tão extremos que impeçam a verificação de traços básicos.
   - Rosto ausente, desfocado, cortado ou mal iluminado ao extremo.
   Você DEVE marcar "verified" como false e "confidence" como 0 (zero), pois traços biométricos vitais estão ocultados e a validação é absolutamente impossível. NUNCA aprove rostos obstruídos!
2. Apenas marque "verified": true se os traços faciais principais (olhos, nariz, boca, estrutura óssea do rosto, barba se aplicável) estiverem perfeitamente visíveis, claros nas duas imagens e corresponderem com altíssima certeza à mesma pessoa física.
3. Se houver alguma dúvida ou obstrução parcial que reduza a clareza dos traços, a confiança deve ser reduzida drasticamente e o veredito verificado deve ser false.

Responda EXATAMENTE no formato JSON com as chaves:
{
  "verified": boolean,
  "confidence": number (de 0 a 100)
}
Retorne APENAS o JSON cru, sem marcações markdown ou blocos de código.`;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: photoBase64_1
          }
        },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: photoBase64_2
          }
        }
      ]);

      const text = result.response.text().trim();
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        verified: !!parsed.verified,
        confidence: Number(parsed.confidence || 0)
      };
    } catch (err) {
      console.error("Erro no reconhecimento facial com Gemini:", err);
      throw new Error("Falha no reconhecimento facial.");
    }
  }

  async analyzeConversationWithFeedback(history: {role: string, text: string, time: string}[]): Promise<{ summary: string, feedback: string }> {
    if (!this.isConfigured()) {
      throw new Error('Chave de API do Gemini não configurada. Configure a sua chave de API nas Configurações.');
    }
    const model = this.getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            summary: {
              type: "string",
              description: "Resumo cronológico e amigável da conversa em português (com uso de tópicos e emojis)."
            },
            feedback: {
              type: "string",
              description: "Auditoria interna detalhada identificando falhas na empresa, nível de frustração do cliente e gravidade do problema."
            }
          },
          required: ["summary", "feedback"]
        }
      }
    });

    const historyText = history.map(m => `[${m.time}] ${m.role}: ${m.text}`).join('\n');

    const prompt = `Você é um supervisor de qualidade e especialista em Customer Experience (CX) de altíssimo nível.
Analise o histórico da conversa abaixo entre o Cliente, o Atendente (ou IA) e o Sistema de forma detalhada e gere dois relatórios estruturados.

Histórico de mensagens a analisar:
${historyText}

O retorno DEVE ser obrigatoriamente no formato JSON cru, contendo exatamente duas chaves:
1. "summary": Um resumo cronológico e amigável da conversa em português (com uso sutil de emojis e tópicos para fácil visualização pelo atendente). Esse resumo deve resumir o que aconteceu de forma fluida.
2. "feedback": Uma análise diagnóstica interna e honesta da conversa. Indique se o caso é um problema grave ou não, se o cliente demonstrou frustração, e PRINCIPALMENTE avalie criticamente se houve alguma falha da nossa parte como empresa (ex: demora no atendimento, respostas erradas da IA, falta de empatia do atendente, problemas técnicos, etc.). Use tópicos e emojis.

Regras importantes de retorno:
- Retorne EXATAMENTE e APENAS o JSON contendo as chaves "summary" e "feedback".
- NUNCA coloque blocos de marcação markdown (\`\`\`json ou \`\`\$) na resposta, nem saudações/explicações antes ou depois. Retorne apenas o objeto JSON cru e limpo para que possamos fazer JSON.parse imediatamente.
- Não deixe nenhuma chave do JSON vazia.`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.summary && parsed.feedback) {
        return {
          summary: formatValueToString(parsed.summary),
          feedback: formatValueToString(parsed.feedback)
        };
      }
      throw new Error("JSON incompleto");
    } catch (e) {
      console.error("Erro ao analisar conversa com Gemini, retornando fallback:", e);
      try {
        const textResult = await model.generateContent(`Gere um resumo da conversa a seguir e uma análise de falhas em português.\nConversa:\n${historyText}`);
        const rawText = textResult.response.text();
        return {
          summary: "Resumo da Conversa:\n\n" + rawText,
          feedback: "Análise e Diagnóstico:\n\nNão foi possível estruturar o JSON de feedback automaticamente. Veja a análise geral acima."
        };
      } catch (err: any) {
        return {
          summary: "Erro ao carregar análise de conversa.",
          feedback: err.message || "Erro desconhecido."
        };
      }
    }
  }

  async extractBusinessRulesForRag(contextHistory: {role: string, text: string}[]): Promise<{ suggestedRules: string[] }> {
    if (!this.isConfigured()) {
      throw new Error('Chave de API do Gemini não configurada. Configure a sua chave de API nas Configurações.');
    }
    const model = this.getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            suggestedRules: {
              type: "array",
              items: {
                type: "string"
              },
              description: "Lista de regras comerciais de alta relevância, limpas, impessoais e formais."
            }
          },
          required: ["suggestedRules"]
        }
      }
    });

    const historyText = contextHistory.slice(-50).map(m => `${m.role === 'user' ? 'Cliente' : 'Atendente'}: ${m.text}`).join('\n');

    const prompt = `Você é um Analista de Sistemas e Engenheiro de Prompt experiente. Sua tarefa é analisar o histórico de conversa de atendimento no WhatsApp a seguir e extrair regras de negócios, políticas, processos, taxas, regras de cancelamento, políticas de bolo de aniversário, quantidade de pessoas e outras informações comerciais operacionais relevantes.

Instruções cruciais:
1. **Separação de fatos e regras corporativas**: Extraia apenas regras que sirvam de base de conhecimento reutilizável para o RAG (ex: "Clientes podem trazer seu próprio bolo para eventos de aniversário", "Reservas para mais de 25 pessoas devem ser escaladas para atendentes humanos", "O restaurante aceita PIX como meio de pagamento").
2. **Filtragem rígida**: IGNORE piadas, conversas cotidianas, agradecimentos, saudações formais/informais e detalhes hiperespecíficos que não servem como regra corporativa (ex: ignore "aniversário da sobrinha da Luciene dia 11/06"). Mantenha a base enxuta e limpa para não inchar o banco de dados.
3. **Escrita profissional**: Formule as regras de forma clara, em tópicos impessoais e curtos em português.
4. **Formato do JSON**: Retorne estritamente um JSON com a chave "suggestedRules" contendo a lista de strings. Nenhuma introdução ou formatação extra de markdown.

Histórico de Mensagens:
${historyText}`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.suggestedRules && Array.isArray(parsed.suggestedRules)) {
        return {
          suggestedRules: parsed.suggestedRules.map(String)
        };
      }
      throw new Error("JSON retornado não contém suggestedRules");
    } catch (e) {
      console.error("Erro ao extrair regras com Gemini:", e);
      throw e;
    }
  }

  async generateCrmBoardConfig(description: string): Promise<{ name: string, description: string, stages: any[] }> {
    if (!this.isConfigured()) {
      throw new Error('Chave de API do Gemini não configurada. Configure a sua chave de API nas Configurações.');
    }
    const model = this.getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Você é uma Inteligência Artificial especialista em gestão comercial, CRM e processos operacionais (Kanban).
Sua missão é ler a seguinte descrição do processo fornecido pelo usuário e gerar a estrutura perfeita de um Quadro Kanban de CRM com suas respectivas etapas (colunas).

Descrição do processo:
"${description}"

Você deve retornar obrigatoriamente um objeto JSON com as seguintes propriedades:
1. "name": Um título curto e atraente para o quadro (ex: "Processo Seletivo", "Funil de Vendas", "Produção de Pizzas").
2. "description": Uma breve descrição de 1 linha sobre a finalidade desse funil.
3. "stages": Um array contendo entre 3 e 6 etapas ordenadas logicamente. Cada etapa deve ser um objeto com:
   - "id": Um identificador string único em letras minúsculas sem espaços (ex: "novo", "analise", "entrevista").
   - "label": O título legível da etapa (ex: "Novo Lead", "Em Análise", "Entrevista").
   - "subtitle": Uma legenda super curta explicando a ação dessa etapa (ex: "Contato inicial", "Verificando documentos").
   - "color": Uma classe do Tailwind CSS para a cor da coluna (escolha entre: "bg-blue-500", "bg-yellow-500", "bg-emerald-500", "bg-purple-500", "bg-rose-500", "bg-indigo-500").

REGRAS DE RETORNO CRÍTICAS:
1. Retorne EXATAMENTE e APENAS o JSON.
2. NUNCA coloque blocos de marcação markdown (\`\`\`json ou \`\`\`) na resposta. Retorne apenas o JSON cru para fazermos JSON.parse de imediato.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    try {
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      console.error("Erro no parse do JSON de criação mágica:", text);
      throw new Error("Falha ao analisar a resposta da IA. Tente descrever o funil de forma diferente.");
    }
  }

  async qualifyCrmLead(historyText: string, additionalNotes?: string): Promise<{ customerName: string, mainInterest: string, businessType: string, priority: number, summaryHTML: string }> {
    if (!this.isConfigured()) {
      throw new Error('Chave de API do Gemini não configurada. Configure a sua chave de API nas Configurações.');
    }
    const model = this.getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Analise a seguinte conversa do WhatsApp e notas adicionais de atendimento comercial.
Sua missão é extrair as intenções de compra, prioridade e gerar um resumo comercial rico formatado em HTML.

--- DADOS DA CONVERSA ---
${historyText}

--- NOTAS ADICIONAIS ---
${additionalNotes || 'Nenhuma nota adicional.'}

Você deve retornar obrigatoriamente um objeto JSON com as seguintes propriedades:
{
  "customerName": "Nome completo extraído do cliente (vazio se não encontrado)",
  "mainInterest": "O produto/serviço que ele tem interesse. Escolha entre: 'Sistema', 'Totem', 'Desenvolvimento', 'Revenda', 'Outros'",
  "businessType": "O tipo de empresa dele. Escolha entre: 'Gastronomia', 'Revendedor', 'Pesquisa Iniciante', 'Outros'",
  "priority": 1 (baixo), 2 (médio) ou 3 (alto) com base no nível de engajamento e prontidão de compra,
  "summaryHTML": "Um resumo comercial rico com marcadores e parágrafos contendo a dor do cliente, proposta de valor e combinados finais."
}

REGRAS DE RETORNO CRÍTICAS:
1. Retorne EXATAMENTE e APENAS o JSON.
2. NUNCA coloque blocos de marcação markdown (\`\`\`json ou \`\`\`) na resposta.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    try {
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      console.error("Erro no parse do JSON de qualificação:", text);
      throw new Error("Falha ao analisar o histórico do lead com a IA.");
    }
  }

  async generateTicketAnalysis(params: {
    opened_at: string;
    closed_at: string;
    operators: { name: string, count: number, percentage: number }[];
    closed_by: string;
    messages: { sender: string, text: string, timestamp: string }[];
  }): Promise<{ problem_description: string, summary: string, problems_checklist: Array<{ text: string, resolved: boolean }>, resolution_summary: string }> {
    if (!this.isConfigured()) {
      throw new Error('Chave de API do Gemini não configurada. Configure a sua chave de API nas Configurações.');
    }
    const model = this.getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const opsText = params.operators.map(op => `${op.name} (${op.percentage}% de participação, ${op.count} msgs)`).join(', ');
    const historyText = params.messages.slice(-65).map(m => `[${m.timestamp}] ${m.sender === 'human' ? 'Atendente' : 'Cliente'}: ${m.text}`).join('\n');

    const prompt = `Você é um analista de suporte especialista em auditoria e controle de qualidade de chamados (tickets).
Sua missão é analisar o histórico de conversação de atendimento a seguir e preencher a descrição do problema, o resumo da solução, a lista cronológica de problemas discutidos e o relato detalhado da solução.

--- METADADOS DO CHAMADO ---
- Horário de Abertura: ${params.opened_at}
- Horário de Encerramento (Agora): ${params.closed_at}
- Atendentes Participantes do Chamado: ${opsText || 'Nenhum atendente humano registrado'}
- Encerrado por (Operador logado): ${params.closed_by}

--- HISTÓRICO DE MENSAGENS DO TICKET ---
${historyText}

Você deve gerar obrigatoriamente um objeto JSON em português contendo exatamente estas quatro propriedades:
{
  "problem_description": "Escreva um resumo extremamente simplificado, focado UNICAMENTE na falha ou solicitação principal, sem termos como 'usuário', 'cliente' ou 'atendente' (máximo de 8 palavras, ex: 'Sem acesso para imprimir relatório de fechamento de caixa' ou 'Problema de conexão com impressora'). Não use saudações ou palavras de preenchimento.",
  "summary": "Um resumo ultra-conciso (máximo de 25 palavras, 1 ou 2 frases curtas) de como a questão foi resolvida, focando na ação resolutiva final.",
  "problems_checklist": [
    {
      "text": "Escreva o problema ou dúvida de forma simplificada e direta (máximo de 8 palavras, ex: 'Sem acesso para imprimir relatório'). Organize rigorosamente na mesma ordem em que o cliente citou os problemas na conversa.",
      "resolved": true
    }
  ],
  "resolution_summary": "Descreva de forma cronológica, rica e detalhada o desenrolar do atendimento, o que foi explicado ou solucionado, e a participação dos atendentes. Use parágrafos (\\n\\n) e marcadores (bullet points com hífens '- ') para listar as etapas de solução de forma muito organizada e legível."
}

REGRAS DE RETORNO CRÍTICAS:
1. Retorne EXATAMENTE e APENAS o JSON.
2. NUNCA coloque blocos de marcação markdown (\`\`\`json ou \`\`\`) na resposta.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    try {
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        problem_description: parsed.problem_description || "Sem descrição",
        summary: parsed.summary || "Sem resumo",
        problems_checklist: parsed.problems_checklist || [],
        resolution_summary: parsed.resolution_summary || "Sem detalhes"
      };
    } catch (e) {
      console.error("Erro ao analisar ticket com Gemini:", text, e);
      return {
        problem_description: "Erro no processamento do problema.",
        summary: "Erro ao gerar resumo da solução.",
        problems_checklist: [],
        resolution_summary: `Chamado finalizado pelo atendente ${params.closed_by}. Participantes: ${opsText}.`
      };
    }
  }
}

export const geminiService = new GeminiService();

