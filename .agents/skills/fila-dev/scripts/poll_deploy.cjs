const https = require('https');

const deployUuid = process.argv[2] || 'wuzpkh7tr7vv9rwof5civdlk';
const coolifyToken = '4|aLosTpKEm9NMoTz7OUb7o0HrwY4xlJRM0vIwYOgZ8bdf853a';

function checkStatus() {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'coolify.xpointsolucoes.com',
      path: '/api/v1/deployments/' + deployUuid,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + coolifyToken
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ status: 'unknown', raw: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function poll() {
  console.log('Iniciando acompanhamento do deploy:', deployUuid);
  for (let i = 0; i < 60; i++) {
    const res = await checkStatus();
    const st = res.status;
    console.log(`[Tentativa ${i + 1}] Status: ${st}`);
    if (st === 'finished') {
      console.log('DEPLOY CONCLUÍDO COM SUCESSO (finished)');
      process.exit(0);
    }
    if (st === 'failed' || st === 'error' || st === 'cancelled') {
      console.error('DEPLOY FALHOU:', st);
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, 6000));
  }
  console.error('TIMEOUT aguardando deploy.');
  process.exit(2);
}

poll();
