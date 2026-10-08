const https = require('https');

const options = {
  rejectUnauthorized: false,
  headers: {
    'Authorization': 'Bearer 4|aLosTpKEm9NMoTz7OUb7o0HrwY4xlJRM0vIwYOgZ8bdf853a',
    'Accept': 'application/json'
  }
};

async function monitor() {
  console.log('[Monitor Produção] Iniciando acompanhamento do build de Produção (g40cf1zwsesdql4lt6eqhnyk)...');
  let attempts = 0;
  while (attempts < 60) {
    attempts++;
    await new Promise(r => setTimeout(r, 6000));

    // 1. Checa lista de deployments ativos
    const list = await new Promise(res => {
      https.get('https://coolify.xpointsolucoes.com/api/v1/deployments', options, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          try { res(JSON.parse(d)); } catch(e) { res([]); }
        });
      }).on('error', () => res([]));
    });

    const active = list.find(x => x.application_name?.includes('Produção') || x.deployment_uuid === 'g40cf1zwsesdql4lt6eqhnyk');
    if (active) {
      console.log(`Tentativa ${attempts} - Status do build: ${active.status}`);
      if (active.status === 'failed' || active.status === 'error') {
        console.error('❌ Build falhou!');
        process.exit(1);
      }
    } else {
      // Se saiu da lista de ativos, verifica o status do container
      const app = await new Promise(res => {
        https.get('https://coolify.xpointsolucoes.com/api/v1/applications/owckk0k8w8soo40w40owc4ss', options, r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => {
            try { res(JSON.parse(d)); } catch(e) { res({}); }
          });
        }).on('error', () => res({}));
      });

      console.log(`Tentativa ${attempts} - Build concluído! Container status: ${app.status}`);
      if (app.status?.includes('running')) {
        console.log('✅ Servidor de Produção rodando com sucesso!');
        process.exit(0);
      }
    }
  }
  console.log('Tempo limite excedido.');
  process.exit(1);
}

monitor();
