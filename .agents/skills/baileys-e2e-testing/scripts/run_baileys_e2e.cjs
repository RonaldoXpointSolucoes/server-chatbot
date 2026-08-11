const https = require('https');

const ENGINE_URL = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';
const SUPABASE_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const TENANT_ID = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const FOODNEXT_INSTANCE_ID = 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6';
const RONALDO_WEB_INSTANCE_ID = '5c78d358-d449-41c4-b396-a04ab20a39e4';

const RONALDO_WEB_JID = '5511975960999@s.whatsapp.net';
const FOODNEXT_JID = '5511947758860@s.whatsapp.net';

function patchSupabase(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const bodyData = JSON.stringify(body);
    const req = https.request(url, {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(bodyData);
    req.end();
  });
}

function getInstanceApiKey(instanceId) {
  return new Promise((resolve) => {
    const url = new URL(`/rest/v1/whatsapp_instances?id=eq.${instanceId}&select=api_key`, SUPABASE_URL);
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed[0]?.api_key || null);
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function invokeSendMessage(instanceId, targetJid, text) {
  const instanceApiKey = await getInstanceApiKey(instanceId);
  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-id': TENANT_ID
  };
  if (instanceApiKey) {
    headers['apikey'] = instanceApiKey;
  }

  return new Promise((resolve, reject) => {
    const url = new URL(`/api/v1/instances/${instanceId}/invoke`, ENGINE_URL);
    const bodyData = JSON.stringify({
      method: 'sendMessage',
      args: [targetJid, { text }]
    });
    const req = https.request(url, {
      method: 'POST',
      headers
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.write(bodyData);
    req.end();
  });
}

function verifyDeliveryInDb(instanceId, textMatch) {
  return new Promise((resolve) => {
    const queryPath = `/rest/v1/wa_outgoing_messages?instance_id=eq.${instanceId}&body=like.*${encodeURIComponent(textMatch)}*&select=id,status,last_error,sent_at`;
    const url = new URL(queryPath, SUPABASE_URL);
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const msg = parsed && parsed[0];
          resolve(msg || null);
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runFullE2ETest() {
  const ts = new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 14);
  const nowMs = Date.now().toString().slice(-4);
  
  console.log("=== LIMPEZA DE LEASES DE CONCORRÊNCIA EM WHATSAPP_INSTANCES ===");
  await patchSupabase(`/rest/v1/whatsapp_instances?tenant_id=eq.${TENANT_ID}`, {
    assigned_node_id: null,
    lease_until: null
  });

  const fnSent = [];
  const rwReply = [];

  // FASE 1: FoodNext envia 3 mensagens em sequência para Ronaldo-Web
  console.log(`\n======================================================`);
  console.log(`>>> FASE 1: CAIXA FoodNext ENVIA 3 MENSAGENS PARA Ronaldo-Web <<<`);
  console.log(`======================================================`);

  for (let i = 1; i <= 3; i++) {
    const text = `[FoodNext ➔ Ronaldo-Web] Mensagem ${i} de 3 (${ts}-${nowMs})`;
    console.log(`\n[ENVIANDO ${i}/3] FoodNext ➔ Ronaldo-Web (${RONALDO_WEB_JID})...`);
    console.log(`Texto: "${text}"`);

    const result = await invokeSendMessage(FOODNEXT_INSTANCE_ID, RONALDO_WEB_JID, text);
    console.log(`[ENVIANDO ${i}/3] Retorno API Baileys:`, JSON.stringify(result, null, 2));

    await delay(3000);

    const dbVerif = await verifyDeliveryInDb(FOODNEXT_INSTANCE_ID, text);
    console.log(`[ENVIANDO ${i}/3] Verificação no Banco (wa_outgoing_messages):`, JSON.stringify(dbVerif, null, 2));

    fnSent.push({
      step: i,
      text,
      messageId: result.body?.result?.key?.id || 'unknown',
      remoteJid: RONALDO_WEB_JID,
      dbStatus: dbVerif?.status || 'unknown',
      sentAt: dbVerif?.sent_at || null
    });
  }

  await delay(4000);

  // FASE 2: Ronaldo-Web responde 3 mensagens em sequência para FoodNext
  console.log(`\n======================================================`);
  console.log(`>>> FASE 2: CAIXA Ronaldo-Web RESPONDE 3 MENSAGENS PARA FoodNext <<<`);
  console.log(`======================================================`);

  for (let i = 1; i <= 3; i++) {
    const text = `[Ronaldo-Web ➔ FoodNext] Resposta ${i} de 3 (${ts}-${nowMs})`;
    console.log(`\n[RESPONDENDO ${i}/3] Ronaldo-Web ➔ FoodNext (${FOODNEXT_JID})...`);
    console.log(`Texto: "${text}"`);

    const result = await invokeSendMessage(RONALDO_WEB_INSTANCE_ID, FOODNEXT_JID, text);
    console.log(`[RESPONDENDO ${i}/3] Retorno API Baileys:`, JSON.stringify(result, null, 2));

    await delay(3000);

    const dbVerif = await verifyDeliveryInDb(RONALDO_WEB_INSTANCE_ID, text);
    console.log(`[RESPONDENDO ${i}/3] Verificação no Banco (wa_outgoing_messages):`, JSON.stringify(dbVerif, null, 2));

    rwReply.push({
      step: i,
      text,
      messageId: result.body?.result?.key?.id || 'unknown',
      remoteJid: FOODNEXT_JID,
      dbStatus: dbVerif?.status || 'unknown',
      sentAt: dbVerif?.sent_at || null
    });
  }

  console.log("\n\n======================================================");
  console.log("=== RESUMO DO HISTÓRICO DE 6 MENSAGENS (3 ENVIADAS / 3 RECEBIDAS) ===");
  console.log("======================================================");
  console.log(JSON.stringify({ fnSent, rwReply }, null, 2));
}

runFullE2ETest().catch(console.error);
