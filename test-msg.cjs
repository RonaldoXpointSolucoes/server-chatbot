const https = require('https');

const postData = JSON.stringify({
  remoteJid: '5511999999999@s.whatsapp.net',
  page: 1
});

const options = {
  hostname: 'wsapi.xpointsolucoes.com.br',
  path: '/chat/findMessages/Ronaldo-Comercial',
  method: 'POST',
  headers: {
    'apikey': '356c087d9-4073-4ceb-986a-09083992518c',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, res => {
  console.log(`STATUS: ${res.statusCode}`);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('RESPONSE:', data));
});

req.on('error', error => console.error(error));
req.write(postData);
req.end();
