const https = require('https');

const ENGINE_URL = 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';
const FOODNEXT_ID = 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6';
const RONALDO_WEB_JID = '5511975960999@s.whatsapp.net';
const TENANT_ID = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
const API_KEY = '356c087d9-4073-4ceb-986a-09083992518c';

const text = process.argv[2] || '[Resposta FoodNext] Mensagem recebida!';

async function sendReply() {
  const url = new URL(`/api/v1/instances/${FOODNEXT_ID}/invoke`, ENGINE_URL);
  const bodyData = JSON.stringify({
    method: 'sendMessage',
    args: [RONALDO_WEB_JID, { text }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID,
        'apikey': API_KEY
      },
      rejectUnauthorized: false
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[FoodNext Reply] Status: ${res.statusCode} | Resposta:`, data.slice(0, 200));
        resolve({ statusCode: res.statusCode, body: data });
      });
    });
    req.on('error', err => {
      console.error('[FoodNext Reply Error]:', err.message);
      reject(err);
    });
    req.write(bodyData);
    req.end();
  });
}

sendReply();
