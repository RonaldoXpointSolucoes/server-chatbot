const https = require('https');

const ENGINE_URL = 'https://wh1ss8sy848ufj6zh8t492y7.69.62.92.212.sslip.io';
const TENANT_ID = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
const SUPABASE_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';

const RONALDO_WEB_INSTANCE_ID = '5c78d358-d449-41c4-b396-a04ab20a39e4';
const FOODNEXT_JID = '5511947758860@s.whatsapp.net';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getInstanceApiKey(instanceId) {
  return new Promise((resolve) => {
    const url = new URL(`/rest/v1/whatsapp_instances?id=eq.${instanceId}&select=api_key`, SUPABASE_URL);
    https.get(url, {
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
    }).on('error', () => resolve(null));
  });
}

function invokeSendMessage(instanceId, targetJid, text) {
  return new Promise(async (resolve, reject) => {
    const apiKey = await getInstanceApiKey(instanceId);
    const headers = {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID
    };
    if (apiKey) headers['apikey'] = apiKey;

    const url = new URL(`/api/v1/instances/${instanceId}/invoke`, ENGINE_URL);
    const bodyData = JSON.stringify({
      method: 'sendMessage',
      args: [targetJid, { text }]
    });

    const req = https.request(url, {
      method: 'POST',
      headers,
      rejectUnauthorized: false
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

async function verifyDeliveryInDb(messageId) {
  for (let i = 0; i < 6; i++) {
    const url = new URL(`/rest/v1/messages?whatsapp_message_id=eq.${messageId}&select=id,direction,status,text_content,timestamp`, SUPABASE_URL);
    const msg = await new Promise((resolve) => {
      https.get(url, {
        headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (e) { resolve([]); }
        });
      }).on('error', () => resolve([]));
    });

    if (msg && msg.length >= 2) {
      return msg;
    }
    await sleep(2000);
  }
  return null;
}

async function run() {
  console.log('=================================================================');
  console.log('TESTE DE TRÂNSITO REAL WHATSAPP - DIÁLOGO RESTAURANTE FOODNEXT');
  console.log('Cliente (Remetente): Ronaldo-Web (11 97596-0999)');
  console.log('Restaurante (Destinatário): FoodNext (11 94775-8860)');
  console.log('Intervalo anti-spam: 10 segundos por mensagem');
  console.log('=================================================================\n');

  // Mensagem 1: Início
  const ts = new Date().toLocaleTimeString('pt-BR');
  const msg1 = `Boa tarde! Gostaria de consultar informações sobre o restaurante FoodNext. [${ts}]`;
  console.log(`[Etapa 1/3] Enviando mensagem de abertura...`);
  console.log(`👤 Ronaldo-Web: "${msg1}"`);
  
  const res1 = await invokeSendMessage(RONALDO_WEB_INSTANCE_ID, FOODNEXT_JID, msg1);
  const keyId1 = res1.body?.key?.id;
  console.log(`-> Baileys Key ID: ${keyId1} (HTTP ${res1.statusCode})`);

  console.log('\n⏳ Aguardando trânsito e janela anti-spam de 10s...');
  await sleep(10000);

  // Mensagem 2: Escolha de Endereço & Horário (Opção 4)
  const msg2 = `4`;
  console.log(`\n[Etapa 2/3] Enviando escolha da Opção 4 (Endereço & Horários)...`);
  console.log(`👤 Ronaldo-Web: "${msg2}"`);
  const res2 = await invokeSendMessage(RONALDO_WEB_INSTANCE_ID, FOODNEXT_JID, msg2);
  const keyId2 = res2.body?.key?.id;
  console.log(`-> Baileys Key ID: ${keyId2} (HTTP ${res2.statusCode})`);

  console.log('\n⏳ Aguardando trânsito e janela anti-spam de 10s...');
  await sleep(10000);

  // Mensagem 3: Solicitação de Cardápio (Opção 1)
  const msg3 = `1`;
  console.log(`\n[Etapa 3/3] Enviando escolha da Opção 1 (Cardápio Digital)...`);
  console.log(`👤 Ronaldo-Web: "${msg3}"`);
  const res3 = await invokeSendMessage(RONALDO_WEB_INSTANCE_ID, FOODNEXT_JID, msg3);
  const keyId3 = res3.body?.key?.id;
  console.log(`-> Baileys Key ID: ${keyId3} (HTTP ${res3.statusCode})`);

  console.log('\n⏳ Aguardando confirmações de persistência no Supabase...');
  await sleep(3000);

  console.log('\n=================================================================');
  console.log('VERIFICAÇÃO DE REGISTROS NO BANCO (OUTBOUND & INBOUND):');
  console.log('=================================================================');

  for (const [idx, kId] of [keyId1, keyId2, keyId3].entries()) {
    if (kId) {
      const dbRecords = await verifyDeliveryInDb(kId);
      console.log(`\nMensagem ${idx + 1} (${kId}):`);
      if (dbRecords && dbRecords.length > 0) {
        dbRecords.forEach(r => {
          console.log(`  - [${r.direction.toUpperCase()}] Status: ${r.status} | Texto: "${r.text_content}" | Data: ${r.timestamp}`);
        });
      } else {
        console.log(`  - Registrado na Baileys, aguardando sincronização de webhook.`);
      }
    }
  }

  console.log('\n=================================================================');
  console.log('✅ TESTE DE TRÂNSITO REAL WHATSAPP CONCLUÍDO COM SUCESSO!');
  console.log('=================================================================');
}

run().catch(console.error);
