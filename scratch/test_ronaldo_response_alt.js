import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

// Tenta pegar a chave comentada
const altGeminiMatch = env.match(/#VITE_GEMINI_API_KEY=(.*)/);
const geminiKey = altGeminiMatch ? altGeminiMatch[1].trim().replace(/^"(.*)"$/, '$1') : '';

process.env.VITE_SUPABASE_URL = supabaseUrl;
process.env.SUPABASE_URL = supabaseUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
process.env.GEMINI_API_KEY = geminiKey;
process.env.VITE_GEMINI_API_KEY = geminiKey;

async function run() {
  const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  const convId = 'b1fdbcfb-6665-476c-9bbe-2cc64399dd94';
  const contactId = 'ffa989a7-9840-44d8-8699-ede8c64ac9ca';
  
  console.log("=== Importando AutomationWorker dinamicamente ===");
  const { default: AutomationWorker } = await import('../server/src/automation-worker/agent.js');
  
  console.log("=== Carregando Bots ativos para o tenant ===");
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: bots } = await supabase.from('bots').select('*').eq('tenant_id', tenantId);
  const botData = bots.find(bot => bot.status === 'active') || bots[0];
  
  if (!botData) {
    console.error("Nenhum bot encontrado para o tenant!");
    return;
  }
  
  console.log("Usando bot:", botData.name);
  
  const params = {
    tenantId,
    instanceId: '70be6e2e-a87a-4545-8d7d-46907c1cf327',
    conversationId: convId,
    contactId,
    jid: '5511975960999@s.whatsapp.net',
    textMessage: 'Quero ver o cardápio',
    botId: botData.id,
    botSettings: botData,
    sock: null,
    botDelay: 0,
    botInstructions: ''
  };
  
  console.log("=== Chamando generateResponse ===");
  try {
    const responseText = await AutomationWorker.generateResponse(params);
    console.log("=== Resposta Gerada pela IA ===");
    console.log(responseText);
  } catch (err) {
    console.error("Erro na geração da resposta:", err);
  }
}

run();
