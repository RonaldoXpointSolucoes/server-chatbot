const https = require('https');

async function checkVersion() {
  console.log('[Monitor] Iniciando monitoramento da versão do backend de produção...');
  for (let i = 1; i <= 45; i++) {
    await new Promise(r => setTimeout(r, 6000));
    try {
      const data = await new Promise((resolve, reject) => {
        const req = https.get('https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io/health', { rejectUnauthorized: false, timeout: 5000 }, res => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => resolve(body));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      });
      const parsed = JSON.parse(data);
      console.log(`[Check ${i}/45] Versão atual em Produção: ${parsed.version} (${parsed.time})`);
      if (parsed.version === '7.6.6') {
        console.log('🎉 Backend Produção atualizado com sucesso para versão 7.6.6!');
        process.exit(0);
      }
    } catch (e) {
      console.log(`[Check ${i}/45] Aguardando inicialização do container... (${e.message})`);
    }
  }
  console.log('⚠️ Tempo limite atingido aguardando versão 7.6.6.');
  process.exit(1);
}
checkVersion();
