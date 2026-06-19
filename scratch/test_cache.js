import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"/, '').replace(/"$/, '').trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"/, '').replace(/"$/, '').trim();
const geminiKey = env.match(/^\s*VITE_GEMINI_API_KEY\s*=\s*(.*)/m)[1].trim().replace(/^"/, '').replace(/"$/, '').trim();

process.env.VITE_SUPABASE_URL = supabaseUrl;
process.env.SUPABASE_URL = supabaseUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
process.env.GEMINI_API_KEY = geminiKey;
process.env.VITE_GEMINI_API_KEY = geminiKey;

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  
  console.log("=== Importando AutomationWorker ===");
  const { default: AutomationWorker } = await import('../server/src/automation-worker/agent.js');
  
  // Vamos ler as configurações da empresa diretamente
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: companyData } = await supabase
      .from('companies')
      .select('name, settings')
      .eq('id', tenantId)
      .single();

  const companySettings = companyData.settings || {};
  
  // 1. Simula a chamada da ferramenta Consultar_produtos_cardapio (Primeira vez - Cache Miss)
  console.log("\n--- TESTE 1: Consultando produtos (Primeira Vez - Cache Miss) ---");
  const result1 = await AutomationWorker.generateResponse({
      tenantId,
      instanceId: '70be6e2e-a87a-4545-8d7d-46907c1cf327',
      conversationId: 'b1fdbcfb-6665-476c-9bbe-2cc64399dd94',
      contactId: 'ffa989a7-9840-44d8-8699-ede8c64ac9ca',
      jid: '5511975960999@s.whatsapp.net',
      textMessage: 'Quais lanches vocês vendem e quais os preços?',
      botId: 'dummy-bot',
      botSettings: { name: 'Luna Menu', systemPrompt: 'Você é a Luna. Você DEVE obrigatoriamente chamar a ferramenta Consultar_produtos_cardapio para listar os lanches e preços reais. Para fins de teste, finja que a loja está aberta.', temperature: 0.1 },
      sock: null,
      botDelay: 0,
      botInstructions: ''
  });
  
  console.log("Resultado da resposta final da IA (Primeira Vez):");
  console.log(result1);

  // 2. Segunda vez - Cache Hit
  console.log("\n--- TESTE 2: Consultando produtos (Segunda Vez - Cache Hit) ---");
  const result2 = await AutomationWorker.generateResponse({
      tenantId,
      instanceId: '70be6e2e-a87a-4545-8d7d-46907c1cf327',
      conversationId: 'b1fdbcfb-6665-476c-9bbe-2cc64399dd94',
      contactId: 'ffa989a7-9840-44d8-8699-ede8c64ac9ca',
      jid: '5511975960999@s.whatsapp.net',
      textMessage: 'Quais lanches vocês vendem e quais os preços?',
      botId: 'dummy-bot',
      botSettings: { name: 'Luna Menu', systemPrompt: 'Você é a Luna. Você DEVE obrigatoriamente chamar a ferramenta Consultar_produtos_cardapio para listar os lanches e preços reais. Para fins de teste, finja que a loja está aberta.', temperature: 0.1 },
      sock: null,
      botDelay: 0,
      botInstructions: ''
  });
  
  console.log("Resultado da resposta final da IA (Segunda Vez):");
  console.log(result2);
}

run();
