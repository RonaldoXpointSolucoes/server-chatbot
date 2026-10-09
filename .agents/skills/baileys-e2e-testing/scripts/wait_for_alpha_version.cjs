const https = require('https');

const COOLIFY_URL = 'https://coolify.xpointsolucoes.com';
const TOKEN = '4|aLosTpKEm9NMoTz7OUb7o0HrwY4xlJRM0vIwYOgZ8bdf853a';

function get(path) {
  return new Promise((resolve) => {
    https.get(COOLIFY_URL + path, {
      rejectUnauthorized: false,
      headers: { 'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
      });
    }).on('error', (err) => resolve({ error: err.message }));
  });
}

function checkHealth() {
  return new Promise((resolve) => {
    https.get('https://wh1ss8sy848ufj6zh8t492y7.69.62.92.212.sslip.io/health', { rejectUnauthorized: false, timeout: 5000 }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve({ error: d }); }
      });
    }).on('error', err => resolve({ error: err.message }));
  });
}

const targetVersion = process.argv[2] || '7.7.5';

async function main() {
  console.log(`[Monitor Alpha] Aguardando conclusão do build e ativação da versão ${targetVersion}...`);
  for (let i = 1; i <= 60; i++) {
    const health = await checkHealth();
    
    console.log(`[${i}/60] Versão atual em Alpha /health: ${health?.version || 'aguardando resposta...'}`);
    
    if (health?.version === targetVersion) {
      console.log(`✅ [Monitor Alpha] Versão ${targetVersion} ativa e em execução no ambiente Alpha!`);
      process.exit(0);
    }
    
    await new Promise(r => setTimeout(r, 6000));
  }
  console.log(`⚠️ [Monitor Alpha] Timeout aguardando versão ${targetVersion}`);
  process.exit(1);
}

main();
