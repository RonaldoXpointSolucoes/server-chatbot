const https = require('https');

const options = {
  hostname: 'wsapi.xpointsolucoes.com.br',
  path: '/instance/connectionState/Ronaldo-Comercial',
  method: 'GET',
  headers: {
    'apikey': '356c087d9-4073-4ceb-986a-09083992518c'
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('RESPONSE:', data));
});

req.on('error', error => console.error(error));
req.end();
