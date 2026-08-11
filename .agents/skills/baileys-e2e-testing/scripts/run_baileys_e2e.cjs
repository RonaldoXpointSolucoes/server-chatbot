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

async function runCycle(cycleNumber) {
  const ts = new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 14);
  const nowMs = Date.now().toString().slice(-4);
  
  console.log(`\n======================================================`);
  console.log(`>>> INICIANDO CICLO ${cycleNumber} DE 3 (BAILEYS E2E TEST) <<<`);
  console.log(`======================================================`);

  // STEP 1: FoodNext -> Ronaldo-Web
  const fnText = `TESTE-BAILEYS-FN-RW-CICLO${cycleNumber}-${ts}-${nowMs}`;
  console.log(`[ETAPA 1] Enviando da caixa FoodNext para Ronaldo-Web (${RONALDO_WEB_JID})...`);
  console.log(`Texto: "${fnText}"`);

  const fnResult = await invokeSendMessage(FOODNEXT_INSTANCE_ID, RONALDO_WEB_JID, fnText);
  console.log(`[ETAPA 1] Retorno da Baileys Engine API:`, JSON.stringify(fnResult, null, 2));

  if (!fnResult.body || !fnResult.body.ok || !fnResult.body.result?.key?.id) {
    throw new Error(`Falha no envio da Etapa 1 do Ciclo ${cycleNumber}!`);
  }

  await delay(4000);

  // Checa status de entrega real no Supabase
  const fnDbVerification = await verifyDeliveryInDb(FOODNEXT_INSTANCE_ID, fnText);
  console.log(`[ETAPA 1] Verificação no Banco (wa_outgoing_messages):`, JSON.stringify(fnDbVerification, null, 2));

  // STEP 2: Ronaldo-Web -> FoodNext
  const rwText = `RESPOSTA-BAILEYS-RW-FN-CICLO${cycleNumber}-${ts}-${nowMs}`;
  console.log(`\n[ETAPA 2] Respondendo da caixa Ronaldo-Web para FoodNext (${FOODNEXT_JID})...`);
  console.log(`Texto: "${rwText}"`);

  const rwResult = await invokeSendMessage(RONALDO_WEB_INSTANCE_ID, FOODNEXT_JID, rwText);
  console.log(`[ETAPA 2] Retorno da Baileys Engine API:`, JSON.stringify(rwResult, null, 2));

  if (!rwResult.body || !rwResult.body.ok || !rwResult.body.result?.key?.id) {
    throw new Error(`Falha no envio da Etapa 2 do Ciclo ${cycleNumber}!`);
  }

  await delay(4000);

  // Checa status de entrega real no Supabase
  const rwDbVerification = await verifyDeliveryInDb(RONALDO_WEB_INSTANCE_ID, rwText);
  console.log(`[ETAPA 2] Verificação no Banco (wa_outgoing_messages):`, JSON.stringify(rwDbVerification, null, 2));

  console.log(`\n✅ CICLO ${cycleNumber} CONCLUÍDO!`);
  return {
    cycleNumber,
    fnSent: {
      text: fnText,
      messageId: fnResult.body.result.key.id,
      remoteJid: fnResult.body.result.key.remoteJid,
      dbStatus: fnDbVerification?.status || 'unknown',
      sentAt: fnDbVerification?.sent_at || null
    },
    rwReply: {
      text: rwText,
      messageId: rwResult.body.result.key.id,
      remoteJid: rwResult.body.result.key.remoteJid,
      dbStatus: rwDbVerification?.status || 'unknown',
      sentAt: rwDbVerification?.sent_at || null
    }
  };
}

async function main() {
  console.log("=== LIMPEZA DE LEASES DE CONCORRÊNCIA EM WHATSAPP_INSTANCES ===");
  await patchSupabase(`/rest/v1/whatsapp_instances?tenant_id=eq.${TENANT_ID}`, {
    assigned_node_id: null,
    lease_until: null
  });

  const summary = [];
  for (let c = 1; c <= 3; c++) {
    const res = await runCycle(c);
    summary.push(res);
    if (c < 3) await delay(3000);
  }

  console.log("\n\n======================================================");
  console.log("=== RESUMO DOS 3 CICLOS E2E VALIDADOS NA BAILEYS ===");
  console.log("======================================================");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(console.error);
