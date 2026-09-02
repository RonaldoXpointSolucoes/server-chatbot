import { GoogleGenerativeAI } from "@google/generative-ai";
import { useChatStore } from "../store/chatStore";

// Ensure there is a way to handle missing keys gracefully in UI
const fallbackApiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const fallbackGcpKey = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY || "";

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

    const isValidKey = (key: string | null | undefined): boolean => {
      if (!key || key.length < 5) return false;
      const clean = key.replace(/^['"]|['"]$/g, '').trim();
      return !LEAKED_KEYS.includes(clean);
    };

    // 1. Check local override
    const localKey = typeof window !== 'undefined' ? localStorage.getItem('user_gemini_api_key') : null;
    if (isValidKey(localKey)) {
      return localKey!.replace(/^['"]|['"]$/g, '').trim();
    }
    
    // 2. Check store / database settings
    try {
      const storeKey = useChatStore.getState().tenantInfo?.settings?.gemini_api_key;
      if (isValidKey(storeKey)) {
        return storeKey!.replace(/^['"]|['"]$/g, '').trim();
      }
    } catch (e) {}

    // 3. Fallback to VITE_GEMINI_API_KEY directly
    if (isValidKey(fallbackApiKey)) {
      return fallbackApiKey.replace(/^['"]|['"]$/g, '').trim();
    }

    // 4. Fallback to Google Cloud API key if it starts with AIza (only if Gemini key is not set)
    if (isValidKey(fallbackGcpKey)) {
      const cleanGcp = fallbackGcpKey.replace(/^['"]|['"]$/g, '').trim();
      if (cleanGcp.startsWith('AIza')) {
        return cleanGcp;
      }
    }

    return '';
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

  async analyzeConversationWithFeedback(
    history: {role: string, text: string, time: string}[],
    previousAnalysis?: { summary: string; feedback: string; periodInfo?: string }
  ): Promise<{ summary: string, feedback: string }> {
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

    let prompt = '';
    if (previousAnalysis && (previousAnalysis.summary || previousAnalysis.feedback)) {
      prompt = `Você é um supervisor de qualidade e especialista sênior em Customer Experience (CX).
O cliente já possui uma ANÁLISE PRÉVIA consolidada até ${previousAnalysis.periodInfo || 'a última auditoria'}:

[RESUMO ANTERIOR CONSOLIDADO]:
${previousAnalysis.summary || 'Nenhum resumo anterior'}

[AUDITORIA E FALHAS ANTERIORES]:
${previousAnalysis.feedback || 'Nenhum feedback anterior'}

Abaixo estão as NOVAS MENSAGENS que ocorreram na conversa APÓS a data dessa última auditoria:
${historyText || '(Nenhuma mensagem adicional)'}

Sua tarefa é UNIFICAR e ATUALIZAR a análise e auditoria de forma contínua, integrando o contexto consolidado anterior com as novas ocorrências recentes:
1. "summary": Resumo cronológico completo e fluido da conversa inteira em português (com uso sutil de emojis e tópicos para fácil visualização pelo atendente). Mantenha os pontos-chave do passado e incorpore as novas mensagens recentes de maneira contínua e coesa.
2. "feedback": Uma análise diagnóstica interna e honesta atualizada da conversa. Avalie a evolução do caso: se as falhas anteriores foram corrigidas, se o cliente continua satisfeito/frustrado, se surgiram novos problemas ou falhas da empresa (demora, respostas erradas da IA, falta de empatia, problemas técnicos, etc.), ou se a tratativa recente foi assertiva. Use tópicos e emojis.

Regras importantes de retorno:
- Retorne EXATAMENTE e APENAS o JSON contendo as chaves "summary" e "feedback".
- NUNCA coloque blocos de marcação markdown (\`\`\`json ou \`\`\$) na resposta, nem saudações/explicações antes ou depois. Retorne apenas o objeto JSON cru e limpo para que possamos fazer JSON.parse imediatamente.
- Não deixe nenhuma chave do JSON vazia.`;
    } else {
      prompt = `Você é um supervisor de qualidade e especialista em Customer Experience (CX) de altíssimo nível.
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
    }

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
    const model = this.getGenAI().getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Um título curto e atraente para o quadro (ex: 'Processo Seletivo', 'Funil de Vendas')."
            },
            description: {
              type: "string",
              description: "Uma breve descrição de 1 linha sobre a finalidade desse funil."
            },
            stages: {
              type: "array",
              description: "Entre 3 e 6 etapas ordenadas logicamente.",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Um identificador string único em letras minúsculas sem espaços (ex: 'novo', 'analise')."
                  },
                  label: {
                    type: "string",
                    description: "O título legível da etapa (ex: 'Novo Lead', 'Em Análise')."
                  },
                  subtitle: {
                    type: "string",
                    description: "Uma legenda super curta explicando a ação dessa etapa."
                  },
                  color: {
                    type: "string",
                    description: "Uma classe de cor do Tailwind CSS (bg-blue-500, bg-yellow-500, bg-emerald-500, bg-purple-500, bg-rose-500, bg-indigo-500)."
                  }
                },
                required: ["id", "label", "subtitle", "color"]
              }
            }
          },
          required: ["name", "description", "stages"]
        }
      }
    });

    const prompt = `Você é uma Inteligência Artificial especialista em gestão comercial, CRM e processos operacionais (Kanban).
Sua missão é ler a seguinte descrição do processo fornecido pelo usuário e gerar a estrutura perfeita de um Quadro Kanban de CRM com suas respectivas etapas (colunas).

Descrição do processo:
"${description}"

Gere o JSON contendo exatamente as informações solicitadas no schema.`;

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

  async generateFeaturePlanFromAudioOrText(params: {
    textPrompt?: string;
    audioBase64?: string;
    audioMimeType?: string;
    attachments?: Array<{
      base64: string;
      mimeType: string;
      fileName?: string;
      type: 'image' | 'video' | 'audio';
    }>;
    boardName?: string;
  }): Promise<{
    title: string;
    category: string;
    priority: number;
    tags: string[];
    technical_plan: string;
    summary: string;
    suggested_stage_label: string;
  }> {
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
            title: {
              type: "string",
              description: "Título curto, claro e profissional da funcionalidade, melhoria ou correção (ex: '[Chat] Envio de Áudio com Transcrição e Fotos')."
            },
            category: {
              type: "string",
              description: "Categoria principal: 'Chat', 'Sistema / SaaS', 'Backend / API', 'I.A / Gemini', 'Integração', 'UI/UX' ou 'Correção'."
            },
            priority: {
              type: "integer",
              description: "1 (Normal/Baixa), 2 (Média/Importante) ou 3 (Alta/Crítica)."
            },
            tags: {
              type: "array",
              description: "Lista de 3 a 6 tags curtas e técnicas (ex: ['Frontend', 'Mobile-First', 'Supabase', 'IA', 'Video', 'UI/UX']).",
              items: { type: "string" }
            },
            summary: {
              type: "string",
              description: "Resumo executivo de 1 a 3 linhas explicando com precisão o que será feito e o valor agregado para o usuário/negócio."
            },
            suggested_stage_label: {
              type: "string",
              description: "Etapa recomendada para o card (ex: 'Backlog / Ideias', 'Em Análise' ou 'Em Desenvolvimento')."
            },
            technical_plan: {
              type: "string",
              description: "Plano técnico completo e altamente estruturado em Markdown contendo: 🎯 Objetivo, 📋 Requisitos e Regras de Negócio, 🛠️ Passo a Passo Técnico de Implementação (arquivos e lógica a alterar no React, Node.js e Supabase), 🧪 Critérios de Aceite & Validação."
            }
          },
          required: ["title", "category", "priority", "tags", "summary", "suggested_stage_label", "technical_plan"]
        }
      }
    });

    const systemPrompt = `Você é um Engenheiro de Software Sênior & Arquiteto de Sistemas Fullstack com mais de 25 anos de experiência em plataformas SaaS, Chatbots WhatsApp, React, Node.js, Supabase, TailwindCSS, Mobile-First e Inteligência Artificial.

Sua missão é analisar de forma profunda e abrangente todos os dados fornecidos pelo usuário (áudios gravados, textos descritivos, imagens/prints de tela e vídeos de demonstração de comportamento) para criar um Plano de Engenharia e Especificação Técnica de altíssimo nível.

Quadro de destino: ${params.boardName || 'Desenvolvimento & Roadmap'}
${params.textPrompt ? `Descrição ou instruções fornecidas pelo usuário: "${params.textPrompt}"` : ''}

DIRETRIZES DE PROCESSAMENTO MULTIMODAL AVANÇADO:
1. 🎙️ **ANÁLISE DE ÁUDIO**:
   - Transcreva e processe o áudio eliminando completamente vícios de linguagem ("ééé", "tipo assim", "aí", pausas, repetições e hesitações).
   - Extraia a verdadeira intenção e necessidade por trás do que foi falado pelo desenvolvedor ou gestor.
2. 🖼️ **ANÁLISE DE PRINTS & FOTOS (SCREENSHOTS / UI)**:
   - Se houver imagens anexadas, inspecione minuciosamente todos os detalhes visuais: textos na tela, botões, modais, erros de console/telas, elementos sobrepostos, espaçamentos ou telas que precisam de melhoria.
   - Integre o contexto das imagens diretamente no plano de código.
3. 🎥 **ANÁLISE DE VÍDEOS**:
   - Se houver vídeos anexados, mapeie a sequência exata de ações, fluxos de tela demonstrados, bugs ocorridos e transições gravadas.
4. 📱 **DIRETRIZ MOBILE-FIRST & USABILIDADE**:
   - Todo plano deve garantir ergonomia e responsividade impecáveis para dispositivos móveis (toque mínimo 48px, zero overflow horizontal, carregamento fluido).
5. 📝 **ESTRUTURAÇÃO EM LISTAS E BULLET POINTS (OBRIGATÓRIO)**:
   - Organize todos os requisitos, regras e passos em listas numeradas (1., 2., 3., etc.) ou bullet points (- item).
   - Evite parágrafos longos ou texto corrido sem divisão; cada requisito funcional deve ser um item independente e conciso.

ESTRUTURA OBRIGATÓRIA DO PLANO TÉCNICO (technical_plan em Markdown):
1. 🎯 **Objetivo & Visão Geral**: O problema resolvido e o resultado esperado em tópicos claros.
2. 📋 **Requisitos Funcionais & Regras de Negócio**: Lista numerada (1., 2., 3...) sintetizando detalhadamente cada item extraído do áudio/texto.
3. 🛠️ **Arquitetura & Passo a Passo de Implementação**:
   - Componentes Frontend a criar ou editar (React / TypeScript / Tailwind) com caminhos de arquivo
   - Serviços, APIs e endpoints de Backend (se aplicável)
   - Estrutura de banco e storage (Supabase, policies, buckets)
4. 🧪 **Critérios de Aceite & Validação**: Checklist numerado de testes e homologação para QA.

Seja extremamente prático, direto, profissional e com foco em código limpo, seguro e escalável.`;

    const parts: any[] = [{ text: systemPrompt }];

    // Adiciona áudio principal se houver
    if (params.audioBase64) {
      parts.push({
        inlineData: {
          mimeType: params.audioMimeType || 'audio/webm',
          data: params.audioBase64
        }
      });
    }

    // Adiciona anexos multimodais adicionais (fotos, prints, vídeos, áudios)
    if (params.attachments && params.attachments.length > 0) {
      for (const att of params.attachments) {
        if (att.base64 && att.mimeType) {
          parts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: att.base64
            }
          });
        }
      }
    }

    const result = await model.generateContent(parts);
    const response = await result.response;
    const text = response.text().trim();
    try {
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      console.error("Erro no parse do plano técnico multimodal:", text);
      throw new Error("Falha ao estruturar o plano técnico multimodal com a IA.");
    }
  }

  async qualifyCrmLead(historyText: string, additionalNotes?: string): Promise<{ customerName: string, mainInterest: string, businessType: string, priority: number, summaryHTML: string }> {
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
            customerName: {
              type: "string",
              description: "Nome completo extraído do cliente (vazio se não encontrado)."
            },
            mainInterest: {
              type: "string",
              description: "O produto/serviço que ele tem interesse. Escolha entre: 'Sistema', 'Totem', 'Desenvolvimento', 'Revenda', 'Outros'."
            },
            businessType: {
              type: "string",
              description: "O tipo de empresa dele. Escolha entre: 'Gastronomia', 'Revendedor', 'Pesquisa Iniciante', 'Outros'."
            },
            priority: {
              type: "integer",
              description: "1 (baixo), 2 (médio) ou 3 (alto) com base no nível de engajamento."
            },
            summaryHTML: {
              type: "string",
              description: "Um resumo comercial rico com marcadores e parágrafos contendo a dor do cliente, proposta de valor e combinados finais formatado em HTML simples."
            }
          },
          required: ["customerName", "mainInterest", "businessType", "priority", "summaryHTML"]
        }
      }
    });

    const prompt = `Analise a seguinte conversa do WhatsApp e notas adicionais de atendimento comercial.
Sua missão é extrair as intenções de compra, prioridade e gerar um resumo comercial rico formatado em HTML.

--- DADOS DA CONVERSA ---
${historyText}

--- NOTAS ADICIONAIS ---
${additionalNotes || 'Nenhuma nota adicional.'}

Gere o JSON contendo exatamente as informações solicitadas no schema.`;

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
  }): Promise<{ 
    problem_description: string; 
    summary: string; 
    problems_checklist: Array<{ text: string, resolved: boolean }>; 
    resolution_summary: string;
    sentiment?: 'Positivo' | 'Neutro' | 'Insatisfeito';
    improvement_suggestions?: string[];
    key_learnings?: string[];
    root_cause?: string;
    error_log?: string;
  }> {
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
            problem_description: {
              type: "string",
              description: "Resumo extremamente simplificado focado na falha ou solicitação principal (máximo de 8 palavras, ex: 'Notas fiscais em contingência pendentes de reemissão')."
            },
            summary: {
              type: "string",
              description: "Resumo conciso da ação resolutiva final tomada pelo suporte (máximo de 25 palavras)."
            },
            sentiment: {
              type: "string",
              description: "Sentimento geral do cliente ao final do atendimento: 'Positivo', 'Neutro' ou 'Insatisfeito'."
            },
            root_cause: {
              type: "string",
              description: "Causa raiz identificada para o problema relatado (1 frase técnica)."
            },
            improvement_suggestions: {
              type: "array",
              description: "Sugestões práticas de melhoria de processo, produto ou atendimento baseadas neste ticket.",
              items: { type: "string" }
            },
            key_learnings: {
              type: "array",
              description: "Regras de negócio ou aprendizados chave extraídos para enriquecer a base de conhecimento RAG.",
              items: { type: "string" }
            },
            problems_checklist: {
              type: "array",
              description: "Lista de problemas REAIS E DISTINTOS relatados pelo cliente.",
              items: {
                type: "object",
                properties: {
                  text: { 
                    type: "string", 
                    description: "O problema ou dúvida citado pelo cliente (máximo de 8 palavras)." 
                  },
                  resolved: { 
                    type: "boolean",
                    description: "True se o problema foi resolvido, false se pendente." 
                  }
                },
                required: ["text", "resolved"]
              }
            },
            resolution_summary: {
              type: "string",
              description: "Descrição detalhada do atendimento com etapas e marcadores (- )."
            }
          },
          required: ["problem_description", "summary", "problems_checklist", "resolution_summary"]
        }
      }
    });
    
    const opsText = params.operators.map(op => `${op.name} (${op.percentage}% de participação, ${op.count} msgs)`).join(', ');
    const historyText = params.messages.slice(-65).map(m => `[${m.timestamp}] ${m.sender === 'human' ? 'Atendente' : 'Cliente'}: ${m.text}`).join('\n');

    const prompt = `Você é um Engenheiro de Qualidade de Atendimento, Auditor e Especialista em IA para CRM/RAG.
Sua missão é analisar profundamente o histórico de atendimento a seguir para:
1. Extrair a descrição clara do problema e a resolução.
2. Identificar a causa raiz técnica e o sentimento implícito do cliente ('Positivo', 'Neutro', 'Insatisfeito').
3. Gerar sugestões de melhoria contínua de processos/produtos.
4. Extrair aprendizados estruturados para enriquecer a base RAG.

--- REGRAS DE UNIFICAÇÃO DE CHECKLIST ---
1. Agrupe problemas do mesmo assunto em APENAS UM ITEM DO CHECKLIST.
2. O checklist deve conter apenas falhas categoricamente distintas.

--- METADADOS DO CHAMADO ---
- Horário de Abertura: ${params.opened_at}
- Horário de Encerramento: ${params.closed_at}
- Atendentes Participantes: ${opsText || 'Nenhum atendente humano'}
- Encerrado por: ${params.closed_by}

--- HISTÓRICO DE MENSAGENS DO TICKET ---
${historyText}

Gere o JSON contendo exatamente as informações solicitadas no schema.`;

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
        resolution_summary: parsed.resolution_summary || "Sem detalhes",
        sentiment: parsed.sentiment || "Neutro",
        root_cause: parsed.root_cause || undefined,
        improvement_suggestions: parsed.improvement_suggestions || [],
        key_learnings: parsed.key_learnings || []
      };
    } catch (e: any) {
      console.error("Erro ao analisar ticket com Gemini:", text, e);
      return {
        problem_description: "Erro no processamento do problema.",
        summary: "Erro ao gerar resumo da solução.",
        problems_checklist: [],
        resolution_summary: `Chamado finalizado pelo atendente ${params.closed_by}. Participantes: ${opsText}.`,
        error_log: e.message || String(e)
      };
    }
  }

  async analyzeLogsAndGenerateFixPlan(params: {
    consoleLogs: any[];
    serverErrors: any[];
    gastrofoodLogs?: any[];
    astsErrors?: any[];
    screenshotBase64?: string;
    boardName?: string;
  }): Promise<{
    title: string;
    category: string;
    priority: number;
    tags: string[];
    summary: string;
    suggested_stage_label: string;
    technical_plan: string;
    analyzed_count: {
      console: number;
      server: number;
      gastrofood: number;
      asts: number;
    };
  }> {
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
            title: {
              type: "string",
              description: "Título conciso, técnico e profissional do card de correção (ex: '[Sistema / Correção Crítica] Resolução de Loop de Lock no SessionManager e Estabilização Baileys')."
            },
            category: {
              type: "string",
              description: "Categoria do card: 'Correção', 'Backend / API', 'Sistema / SaaS', 'Chat' ou 'Integração'."
            },
            priority: {
              type: "integer",
              description: "Prioridade: 1 (Baixa), 2 (Média) ou 3 (Alta/Crítica se houver erros de conexão, loops de lock ou exceções de servidor)."
            },
            tags: {
              type: "array",
              description: "Lista de 4 a 6 tags técnicas em maiúsculas (ex: ['BACKEND', 'NODE.JS', 'SESSION-MANAGER', 'CONCORRENCIA', 'IA-PLANO', 'DEVLOGGER']).",
              items: { type: "string" }
            },
            summary: {
              type: "string",
              description: "Resumo executivo de 2 a 3 linhas com o diagnóstico consolidado das falhas de todas as abas e a solução definitiva recomendada."
            },
            suggested_stage_label: {
              type: "string",
              description: "Coluna de destino no Kanban (deve ser 'Em Análise')."
            },
            technical_plan: {
              type: "string",
              description: "Plano técnico completo em Markdown com seções detalhadas: 🚨 Diagnóstico & Causa Raiz, 🎯 Objetivo da Correção, 🛠️ Arquivos & Modificações Necessárias, 🧪 Critérios de Aceite & Testes, e 📜 Extrato Chave dos Logs."
            }
          },
          required: ["title", "category", "priority", "tags", "summary", "suggested_stage_label", "technical_plan"]
        }
      }
    });

    // Consolidar e limpar logs para o prompt
    const sanitizeLogsForPrompt = (list: any[], maxCount: number = 35) => {
      if (!list || !Array.isArray(list)) return [];
      return list.slice(0, maxCount).map(item => {
        if (typeof item === 'string') return item;
        if (item.type === 'gastrofood_api') {
          const action = item.action || 'API Gastrofood';
          const method = item.method || 'POST';
          const url = item.url ? ` (${item.url})` : '';
          const status = item.status ? ` - Status: ${item.status}` : '';
          const dir = item.direction ? ` [${item.direction.toUpperCase()}]` : '';
          const err = item.error ? ` | Erro: ${typeof item.error === 'object' ? JSON.stringify(item.error).substring(0, 250) : item.error}` : '';
          const resp = item.response ? ` | Retorno: ${typeof item.response === 'object' ? JSON.stringify(item.response).substring(0, 250) : item.response}` : '';
          return `[GASTROFOOD_API]${dir} ${action} - ${method}${url}${status}${err}${resp}`;
        }
        const type = item.type || item.level || 'log';
        const src = item.source || item.type || 'App';
        const msg = item.message || item.error || '';
        const dt = item.details ? JSON.stringify(item.details).substring(0, 300) : '';
        return `[${type.toUpperCase()}] (${src}): ${msg}${dt ? ` | Detalhes: ${dt}` : ''}`;
      });
    };

    const sanitizedConsole = sanitizeLogsForPrompt(params.consoleLogs, 40);
    const sanitizedServer = sanitizeLogsForPrompt(params.serverErrors, 40);
    const sanitizedGastrofood = sanitizeLogsForPrompt(params.gastrofoodLogs || [], 20);
    const sanitizedAsts = sanitizeLogsForPrompt(params.astsErrors || [], 20);

    const systemPrompt = `Você é um Engenheiro de Software Sênior Staff / SRE & Arquiteto de Sistemas Fullstack com 25+ anos de experiência, especializado em NodeJS, React/Vite, Supabase Postgres, Baileys WhatsApp Engine e APIs REST.

Sua tarefa é analisar PROFUNDAMENTE e SEM SUPERFICIALIDADE todo o conjunto de logs de diagnóstico, contadores e erros capturados no Antigravity DevLogger e no Servidor Node.js. Se uma captura de tela (screenshot) foi fornecida, analise visualmente os contadores no topo, abas, alertas e erros exibidos na interface.

Quadro Kanban de Destino: ${params.boardName || 'Desenvolvimento & Roadmap'}
Coluna Destino Obrigatória: 'Em Análise'

=== LOGS DO SERVIDOR NODE.JS (${params.serverErrors.length} capturados) ===
${sanitizedServer.length > 0 ? sanitizedServer.join('\n') : 'Nenhum erro direto do servidor Node.'}

=== LOGS DO CONSOLE / DEVLOGGER FRONTEND (${params.consoleLogs.length} capturados) ===
${sanitizedConsole.length > 0 ? sanitizedConsole.join('\n') : 'Nenhum erro de console.'}

=== LOGS DE API GASTROFOOD / INTEGRAÇÕES (${(params.gastrofoodLogs || []).length} capturados) ===
${sanitizedGastrofood.length > 0 ? sanitizedGastrofood.join('\n') : 'Nenhuma falha Gastrofood.'}

=== AUDITORIA ASTS (${(params.astsErrors || []).length} capturados) ===
${sanitizedAsts.length > 0 ? sanitizedAsts.join('\n') : 'Nenhuma anomalia ASTS.'}

DIRETRIZES TÉCNICAS OBRIGATÓRIAS:
1. Se houver loops de lock no SessionManager ('Aguardando liberação do lock... tentativa X/4' ou 'possui lock ativo e saudável no nó alpha-worker'), analise a causa raiz da concorrência de nós, lease do Supabase e normalize a identificação de nós para evitar loops de espera infinitos.
2. Identifique os problemas REAIS em cada aba (Console, Servidor Node, Gastrofood, ASTS), sem ignorar falhas de rede, 404 de tabelas Supabase ou chamadas de API.
3. Elabore um plano técnico extremamente acionável, de nível sênior, pronto para o Antigravity codificar e resolver definitivamente.
4. Estruture o "technical_plan" em Markdown contendo:
   - 🚨 **Diagnóstico e Causa Raiz dos Erros Identificados**
   - 🎯 **Objetivo da Correção**
   - 🛠️ **Arquivos do Projeto & Passo a Passo de Código** (especifique os caminhos exatos dos arquivos ex: 'server/src/session-manager/index.js', 'src/...', e funções a ajustar)
   - 🧪 **Critérios de Aceite & Validação**
   - 📜 **Extrato Relevante dos Logs Analisados**
`;

    const promptContents: any[] = [systemPrompt];
    if (params.screenshotBase64) {
      promptContents.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: params.screenshotBase64
        }
      });
    }

    const result = await model.generateContent(promptContents);
    const response = await result.response;
    const text = response.text().trim();
    
    try {
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        ...parsed,
        suggested_stage_label: 'Em Análise',
        analyzed_count: {
          console: params.consoleLogs.length,
          server: params.serverErrors.length,
          gastrofood: (params.gastrofoodLogs || []).length,
          asts: (params.astsErrors || []).length
        }
      };
    } catch (e) {
      console.error("Erro ao analisar JSON retornado da IA:", text);
      throw new Error("Falha ao analisar a resposta da IA para os logs.");
    }
  }

  async enhanceCardText(params: {
    content: string;
    action: 'improve' | 'structure' | 'checklist' | 'suggest_tags' | 'fix_grammar';
    cardTitle?: string;
  }): Promise<{ result: string; suggestedTags?: string[]; suggestedPriority?: number }> {
    if (!this.isConfigured()) {
      throw new Error('Chave de API do Gemini não configurada. Por favor, adicione sua chave nas configurações.');
    }

    const model = this.getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.3
      }
    });

    let prompt = "";
    if (params.action === 'structure') {
      prompt = `Você é um Arquiteto de Software Sênior e Product Manager.
Pegue o título e o conteúdo base abaixo e elabore um Plano Técnico de Engenharia estruturado em Markdown limpo, direto e profissional contendo as seções:
🎯 **Objetivo & Visão Geral**
📋 **Requisitos Funcionais & Regras de Negócio**
🛠️ **Arquitetura & Passo a Passo de Implementação**
🧪 **Critérios de Aceite & Validação**

Título da Tarefa: "${params.cardTitle || 'Nova Funcionalidade'}"
Texto Base / Rascunho:
${params.content || params.cardTitle || 'Descrever objetivo e passos de implementação.'}

Retorne APENAS o conteúdo formatado em Markdown, sem tags de código \`\`\` adicionais em volta do texto todo e sem comentários de abertura ou fechamento.`;
    } else if (params.action === 'improve') {
      prompt = `Você é um Engenheiro de Software Sênior especialista em documentação técnica e clareza.
Reescreva e aprimore o texto abaixo tornando-o mais conciso, profissional, direto e bem estruturado em Markdown (usando negritos e marcadores onde couber). Mantenha rigorosamente o idioma Português (pt-BR).

Texto Original:
${params.content}

Retorne APENAS o texto aprimorado em Markdown, sem introduções.`;
    } else if (params.action === 'checklist') {
      prompt = `Converta os tópicos e itens do texto abaixo em um checklist Markdown de tarefas acionáveis com caixas de seleção no formato:
- [ ] Tarefa ou requisito 1
- [ ] Tarefa ou requisito 2

Texto Base:
${params.content}

Retorne APENAS a lista com as caixas de seleção Markdown (- [ ]).`;
    } else if (params.action === 'fix_grammar') {
      prompt = `Revise e corrija os erros de gramática, pontuação, acentuação e concordância do texto abaixo, mantendo rigorosamente o sentido e as marcações de Markdown:

Texto:
${params.content}

Retorne APENAS o texto corrigido.`;
    } else if (params.action === 'suggest_tags') {
      prompt = `Analise o título e o conteúdo do cartão do CRM abaixo e sugira:
1. Até 6 tags técnicas e funcionais pertinentes (ex: ["Frontend", "React", "Mobile-First", "UI/UX", "Bugfix", "IA"]).
2. Um nível de prioridade sugerido (1 = Baixa, 2 = Média, 3 = Alta).
3. Um resumo executivo conciso em 1 ou 2 frases.

Título: ${params.cardTitle || ''}
Conteúdo:
${params.content}

Responda ESTRITAMENTE em formato JSON:
{
  "tags": ["Tag1", "Tag2"],
  "priority": 2,
  "summary": "Resumo do que deve ser feito"
}`;

      const result = await model.generateContent(prompt);
      const text = (await result.response).text().trim();
      try {
        const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          result: parsed.summary || params.content,
          suggestedTags: parsed.tags || [],
          suggestedPriority: parsed.priority || 2
        };
      } catch (e) {
        return { result: params.content, suggestedTags: [], suggestedPriority: 2 };
      }
    }

    const result = await model.generateContent(prompt);
    const text = (await result.response).text().trim();
    return { result: text };
  }

  async generateChecklistFromMultimodal(params: {
    prompt?: string;
    audioBase64?: string;
    audioMimeType?: string;
    imageBase64?: string;
    imageMimeType?: string;
    pdfBase64?: string;
    excelText?: string;
    fileName?: string;
  }): Promise<{
    title: string;
    description: string;
    category: string;
    suggested_sector?: string;
    suggested_shifts?: string[];
    items: Array<{
      title: string;
      description: string;
      response_type: string;
      is_required: boolean;
      weight: number;
      is_critical: boolean;
      require_evidence: boolean;
      permit_observation: boolean;
      min_meta: number | null;
      max_meta: number | null;
      measurement_unit: string;
      options?: string[] | null;
    }>;
  }> {
    if (!this.isConfigured()) {
      throw new Error('Chave de API do Gemini não configurada. Configure sua chave em Configurações.');
    }

    const model = this.getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });

    const systemPrompt = `Você é um Engenheiro de Processos Operacionais e Especialista em Qualidade e Segurança Alimentar para Restaurantes, Franquias, Lanchonetes e Operações Gastronômicas.
Sua missão é analisar os insumos fornecidos (áudio falado, imagem de prancheta/ficha de inspeção, documento PDF de Procedimento Operacional Padrão - POP, planilha Excel ou prompt de texto) e estruturar um Checklist Operacional de Alto Nível.

REGRAS DE EXTRAÇÃO E ESTRUTURAÇÃO:
1. Extraia e gere itens objetivos, claros e acionáveis para o operador em campo no tablet/totem.
2. Identifique o tipo de resposta mais adequado para cada item entre:
   - 'conformity' (Conforme / Não Conforme / Não se Aplica) -> Ideal para procedimentos operacionais e auditorias.
   - 'boolean' ou 'yes_no' (Sim / Não).
   - 'temperature' (com min_meta e max_meta em °C) -> Ex: Freezer (-18°C a -12°C), Pista Fria (0°C a 4°C), Fritadeira/Chapa (160°C a 180°C).
   - 'numeric' (com min_meta e max_meta) -> Para contagem de estoque, pesagem ou metas numéricas.
   - 'photo' (onde a evidência fotográfica é essencial, como organização de praça ou fechamento de caixa).
   - 'text' (para observações ou registros textuais).
3. Sinalize itens vitais para a saúde pública ou integridade da operação com "is_critical: true" e "require_evidence: true".
4. Sugira o setor mais apropriado ("COZINHA", "SALÃO", "BAR", "CAIXA", "GERAL") e os turnos recomendados ("cafe", "almoco", "jantar").

RESPONDA ESTRITAMENTE EM FORMATO JSON VÁLIDO (sem comentários ou texto fora do bloco JSON):
{
  "title": "Nome profissional do checklist (ex: Abertura e Higiene de Cozinha)",
  "description": "Explicação resumida do objetivo do checklist",
  "category": "Abertura / Fechamento / Higiene / Controle de Temperatura / Recebimento / Salão",
  "suggested_sector": "COZINHA",
  "suggested_shifts": ["cafe", "almoco", "jantar"],
  "items": [
    {
      "title": "Título claro da tarefa",
      "description": "Orientação prática para o colaborador executar",
      "response_type": "conformity",
      "is_required": true,
      "weight": 1,
      "is_critical": false,
      "require_evidence": false,
      "permit_observation": true,
      "min_meta": null,
      "max_meta": null,
      "measurement_unit": "un",
      "options": null
    }
  ]
}`;

    const parts: any[] = [{ text: systemPrompt }];

    if (params.prompt) {
      parts.push({ text: `Instruções e Prompt do Usuário:\n${params.prompt}` });
    }

    if (params.excelText) {
      parts.push({ text: `Conteúdo extraído da planilha Excel/CSV (${params.fileName || 'planilha'}):\n${params.excelText}` });
    }

    if (params.audioBase64) {
      parts.push({
        inlineData: {
          mimeType: params.audioMimeType || 'audio/webm',
          data: params.audioBase64
        }
      });
      parts.push({ text: "Analise o áudio gravado/enviado com instruções operacionais e extraia todas as tarefas e regras mencionadas." });
    }

    if (params.imageBase64) {
      parts.push({
        inlineData: {
          mimeType: params.imageMimeType || 'image/jpeg',
          data: params.imageBase64
        }
      });
      parts.push({ text: "Analise a imagem/foto acima (ficha, prancheta, anotações ou documento impresso) e extraia todas as rotinas e regras de conformidade visíveis." });
    }

    if (params.pdfBase64) {
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: params.pdfBase64
        }
      });
      parts.push({ text: `Analise o documento PDF anexado (${params.fileName || 'manual.pdf'}) e extraia as etapas de verificação e rotinas operacionais.` });
    }

    const result = await model.generateContent(parts);
    const responseText = (await result.response).text().trim();
    const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    try {
      const parsed = JSON.parse(cleanJson);
      return {
        title: parsed.title || 'Checklist Operacional Inteligente',
        description: parsed.description || 'Checklist gerado por Inteligência Artificial',
        category: parsed.category || 'Geral',
        suggested_sector: parsed.suggested_sector || 'COZINHA',
        suggested_shifts: Array.isArray(parsed.suggested_shifts) ? parsed.suggested_shifts : ['almoco', 'jantar'],
        items: Array.isArray(parsed.items) ? parsed.items.map((it: any, idx: number) => ({
          title: it.title || `Tarefa ${idx + 1}`,
          description: it.description || '',
          response_type: it.response_type || 'conformity',
          is_required: it.is_required ?? true,
          weight: typeof it.weight === 'number' ? it.weight : 1,
          is_critical: Boolean(it.is_critical),
          require_evidence: Boolean(it.require_evidence),
          permit_observation: it.permit_observation !== false,
          min_meta: typeof it.min_meta === 'number' ? it.min_meta : null,
          max_meta: typeof it.max_meta === 'number' ? it.max_meta : null,
          measurement_unit: it.measurement_unit || (it.response_type === 'temperature' ? '°C' : 'un'),
          options: Array.isArray(it.options) ? it.options : null
        })) : []
      };
    } catch (parseErr) {
      console.error('[GeminiService] Erro ao parsear checklist JSON:', parseErr, responseText);
      throw new Error('A IA não retornou uma estrutura JSON válida. Tente reformular ou anexar um documento mais nítido.');
    }
  }
}

export const geminiService = new GeminiService();

export interface ChecklistItem {
  text: string;
  resolved: boolean;
  ticketId?: number | string;
}

export function sanitizeChecklistItems(items: ChecklistItem[]): ChecklistItem[] {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [];
  }

  // Clusters de tópicos conhecidos para consolidar variações redundantes do mesmo problema
  const TOPIC_CLUSTERS = [
    {
      key: 'IMPRESSAO',
      pattern: /impress|imprim|spooler|toner|papel|etiqueta/i,
      unifiedText: 'Falha ou erro na impressão de cupons e documentos fiscais'
    },
    {
      key: 'NFE_EMISSAO',
      pattern: /nfe|nota fiscal|danfe|sat|nfce|conting/i,
      unifiedText: 'Falha ou travamento na emissão de NFe / notas fiscais'
    },
    {
      key: 'LENTIDAO_SISTEMA',
      pattern: /lento|lentid|travan|congel|parou de responder/i,
      unifiedText: 'Sistema lento ou travando'
    },
    {
      key: 'BALANCA',
      pattern: /balan[cç]a|peso|pesagem|filizola|toledo/i,
      unifiedText: 'Problema ou falha na integração com balança'
    },
    {
      key: 'TEF_CARTAO',
      pattern: /tef|cart[aã]o|maquininha|pos|stone|rede|cielo|bin/i,
      unifiedText: 'Erro de comunicação com TEF / maquininha de cartão'
    },
    {
      key: 'RELATORIO_FINANCEIRO',
      pattern: /relat[oó]rio|cupo.*contab|financeiro/i,
      unifiedText: 'Envio ou geração de relatórios / documentos contábeis'
    },
    {
      key: 'REDE_INTERNET',
      pattern: /internet|wifi|roteador|sem sinal|rede/i,
      unifiedText: 'Instabilidade de conexão de rede ou internet'
    }
  ];

  const processedList: ChecklistItem[] = [];
  const matchedClusterKeys = new Set<string>();
  const seenTexts = new Set<string>();

  for (const item of items) {
    const rawText = (item.text || '').trim();
    if (!rawText) continue;

    // Verificar se o item pertence a algum cluster de assunto técnico conhecido
    let matchedCluster = null;
    for (const cluster of TOPIC_CLUSTERS) {
      if (cluster.pattern.test(rawText)) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      if (!matchedClusterKeys.has(matchedCluster.key)) {
        matchedClusterKeys.add(matchedCluster.key);
        processedList.push({
          text: matchedCluster.unifiedText,
          resolved: item.resolved !== false,
          ticketId: item.ticketId
        });
      }
    } else {
      // Normalização e desduplicação por similaridade direta de texto
      const normalizedKey = rawText.toLowerCase().replace(/[^\w\s]/g, '').trim();
      if (!seenTexts.has(normalizedKey)) {
        seenTexts.add(normalizedKey);
        processedList.push({
          text: rawText,
          resolved: item.resolved !== false,
          ticketId: item.ticketId
        });
      }
    }
  }

  return processedList;
}

