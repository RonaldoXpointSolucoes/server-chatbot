import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load env
const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const geminiApiKey = "AIzaSyBS_DkByF6W2bCSue7RJbW4l43E7jqTozc";

const supabase = createClient(supabaseUrl, serviceKey);

const sanitizeJsonString = (str) => {
  let result = '';
  let inString = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (char === '"') {
      if (i > 0 && str[i - 1] === '\\') {
        result += char;
        continue;
      }
      
      const getPrevNonWhitespaceChar = (index) => {
        for (let j = index - 1; j >= 0; j--) {
          if (!/\s/.test(str[j])) return str[j];
        }
        return '';
      };
      
      const getNextNonWhitespaceChar = (index) => {
        for (let j = index + 1; j < str.length; j++) {
          if (!/\s/.test(str[j])) return str[j];
        }
        return '';
      };
      
      const prev = getPrevNonWhitespaceChar(i);
      const next = getNextNonWhitespaceChar(i);
      
      const isStructural = 
        prev === '{' || 
        prev === ',' || 
        next === ':' || 
        prev === ':' || 
        next === ',' || 
        next === '}';
        
      if (isStructural) {
        inString = !inString;
        result += char;
      } else {
        result += '\\"';
      }
    } else if (char === '\n') {
      if (inString) {
        result += '\\n';
      } else {
        result += char;
      }
    } else if (char === '\r') {
      if (!inString) {
        result += char;
      }
    } else {
      result += char;
    }
  }
  return result;
};

const replaceTokens = (text) => {
  if (!text) return '';
  return text; // Simple return for test
};

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  const userText = 'tem salada caesar?';

  try {
    console.log("1. Fetching company settings...");
    const { data: company, error: errComp } = await supabase
      .from('companies')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (errComp) throw errComp;

    console.log("Company Name:", company.name);
    const settings = company.settings || {};
    console.log("Settings:", JSON.stringify(settings, null, 2));
    const street = settings.street || '';
    const number = settings.number || '';
    const neighborhood = settings.neighborhood || '';
    const city = settings.city || '';
    const state = settings.state || '';
    const operatingDays = settings.operatingDays || '';
    const openTime = settings.openTime || '';
    const closeTime = settings.closeTime || '';
    const customRules = settings.customRules || '';

    console.log("2. Fetching bots...");
    const { data: bots, error: errBots } = await supabase
      .from('bots')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    if (errBots) throw errBots;
    console.log(`Found ${bots.length} active bots.`);

    console.log("3. Fetching RAG context for 'salada'...");
    let contextText = '';
    const matchResponse = await fetch(`http://localhost:9000/api/v1/knowledge/match`, {
      method: 'POST',
      headers: {
        'x-tenant-id': tenantId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: userText })
    });
    
    if (matchResponse.ok) {
      const matchData = await matchResponse.json();
      if (matchData.matches && matchData.matches.length > 0) {
        contextText = "\n\n### CONTEXTO DA BASE DE CONHECIMENTO (RAG) ###\nVocê pode usar as informações a seguir para basear sua resposta caso seja útil:\n" +
                      matchData.matches.map((m) => m.content).join("\n---\n");
      }
    } else {
      console.warn("RAG match failed with status:", matchResponse.status);
    }

    console.log("RAG Context:", contextText);

    // Build prompt
    const linkCardapio = settings.link_cardapio || '';
    const addressText = street ? `${street}${number ? `, ${number}` : ''} - ${neighborhood} - ${city}/${state}` : '';
    const contextBase = `
Você é o "Orquestrador RAG" da empresa "${company.name || 'Nossa Empresa'}".
Horário de funcionamento: ${operatingDays ? `${operatingDays} - ${openTime} às ${closeTime}` : 'Não configurado'}
Endereço: ${addressText || 'Não configurado'}
Link do Cardápio: ${linkCardapio || 'Não configurado'}

Regras Customizadas / Super Prompt do Usuário:
${customRules || 'Nenhuma regra customizada cadastrada.'}

Você tem a seguinte equipe de robôs especialistas (Agentes Ativos) disponíveis no banco:
${bots.length > 0 
  ? bots.map(b => `- ID: ${b.id} | Nome: ${b.name} | Descrição: ${b.description || 'Sem descrição'} | Diretrizes/System Prompt: ${replaceTokens(b.systemPrompt)}`).join('\n')
  : '- ID: default | Nome: Maestro | Descrição: Atendimento geral | Diretrizes/System Prompt: Você é o Maestro, atenda de forma simpática.'}

INSTRUÇÕES DO ORQUESTRADOR:
1. Analise a última mensagem do usuário.
2. Identifique qual é a intenção do usuário.
3. Escolha OBRIGATORIAMENTE um dos robôs da lista acima (usando o campo ID) para assumir a resposta.
   - Se for o primeiro contato ou se nenhum robô se encaixar perfeitamente, escolha o robô mais adequado.
4. Gere a resposta final EXATAMENTE COMO o robô escolhido responderia, assumindo sua personalidade e system prompt.
5. Se houver informações da base de conhecimento (RAG) no contexto abaixo, use-as para responder ao cliente caso o robô escolhido precise delas.
6. Responda ESTRITAMENTE em formato JSON com os seguintes campos:
   {
     "intent": "classificação curta da intenção",
     "agentId": "id_do_robô_escolhido",
     "reasoning": "Sua justificativa para ter escolhido esse robô",
     "reply": "O texto de resposta formatado como se você fosse o robô escolhido, pronto para enviar ao cliente."
   }
7. DIRETRIZ GLOBAL DE IDENTIDADE E CONFIDENCIALIDADE (ESTRITA):
   - Para o cliente (na resposta final "reply"), a sua identidade é unicamente "Luna". Você é uma única assistente chamada Luna.
   - Os nomes de robôs internos da sua equipe (como "Luna Menu", "Luna Pedido", "Luna SAC", "Luna Agendador", etc.) são de uso estritamente corporativo interno. NUNCA revele ou mencione nenhum desses nomes de robôs nas suas respostas ao cliente.
   - Por exemplo, em vez de dizer "posso chamar a Luna Pedido para montar o seu pedido", você deve dizer "posso te ajudar a montar o seu pedido" ou "eu mesma posso montar o seu pedido".


Contexto RAG recuperado para esta pergunta:
${contextText || 'Nenhum contexto encontrado no RAG para esta pergunta.'}
`;

    console.log("4. Calling Gemini API...");
    const geminiHistory = [
      { role: 'user', parts: [{ text: userText }] }
    ];

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: contextBase }] },
        contents: geminiHistory,
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    let rawText = data.candidates[0].content.parts[0].text;
    console.log("Raw Gemini Text Output:\n", rawText);

    // Markdown stripping
    if (rawText.includes('```json')) {
      rawText = rawText.split('```json')[1].split('```')[0].trim();
    } else if (rawText.includes('```')) {
      rawText = rawText.split('```')[1].split('```')[0].trim();
    }

    console.log("\nStripped Text:\n", rawText);

    console.log("\n5. Running sanitizeJsonString...");
    const sanitizedText = sanitizeJsonString(rawText.trim());
    console.log("Sanitized Text:\n", sanitizedText);

    console.log("\n6. Running JSON.parse...");
    try {
      const result = JSON.parse(sanitizedText);
      console.log("SUCCESSFULLY PARSED!");
      console.log(result);
    } catch (e) {
      console.error("FAILED TO PARSE SANITIZED TEXT:", e);
      console.log("Let's try to parse the original stripped text without sanitization:");
      try {
        const result2 = JSON.parse(rawText.trim());
        console.log("PARSING ORIGINAL TEXT SUCCEEDED!");
        console.log(result2);
      } catch (e2) {
        console.error("FAILED TO PARSE ORIGINAL TEXT AS WELL:", e2);
      }
    }

  } catch (error) {
    console.error("Error running simulation:", error);
  }
}

run();
