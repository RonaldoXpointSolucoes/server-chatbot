import { GoogleGenerativeAI } from "@google/generative-ai";

// Ensure there is a way to handle missing keys gracefully in UI
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

class GeminiService {
  private genAI: GoogleGenerativeAI;
  
  constructor() {
    this.genAI = new GoogleGenerativeAI(apiKey || 'unconfigured');
  }

  isConfigured(): boolean {
    return apiKey.length > 5;
  }

  async enhanceMessage(draft: string, intent: 'grammar' | 'sales' | 'enchant' | 'support' | 'analyze', contextHistory: {role: string, text: string}[]): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('VITE_GEMINI_API_KEY não configurada. Configure no arquivo .env para usar este recurso.');
    }
    const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
1. Separe BEM o texto em parágrafos curtos pulando uma linha em branco entre eles (isso ajuda a não ficar maçante de ler no celular).
2. Utilize alguns EMOJIS sutis que combinam com o assunto para deixar a mensagem mais leve e bonita.
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
      throw new Error('VITE_GEMINI_API_KEY não configurada. Configure no arquivo .env para usar este recurso.');
    }
    const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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
      throw new Error('VITE_GEMINI_API_KEY não configurada. Configure no arquivo .env para usar este recurso.');
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
              { text: "Transcreva exatamente o que está sendo dito neste áudio. Se não houver voz ou ninguém falar, responda com: '[Áudio sem fala detectável]'. Retorne APENAS o texto da transcrição, sem introduções ou explicações adicionais." },
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

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
}

export const geminiService = new GeminiService();
