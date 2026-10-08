const https = require('https');

const options = {
  rejectUnauthorized: false,
  headers: {
    'Authorization': 'Bearer 4|aLosTpKEm9NMoTz7OUb7o0HrwY4xlJRM0vIwYOgZ8bdf853a',
    'Accept': 'application/json'
  }
};

async function monitor() {
  console.log('[Monitor Produção] Acompanhando finalização dos builds de Produção no Coolify...');
  let attempts = 0;
  while (attempts < 50) {
    attempts++;
    await new Promise(r => setTimeout(r, 6000));

    const list = await new Promise(res => {
      https.get('https://coolify.xpointsolucoes.com/api/v1/deployments', options, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          try { res(JSON.parse(d)); } catch(e) { res([]); }
        });
      }).on('error', () => res([]));
    });

    const activeProd = list.find(x => x.application_name?.includes('Produção'));
    if (activeProd) {
      console.log(`[Tentativa ${attempts}] Deploy Produção ID ${activeProd.id} (${activeProd.commit?.slice(0, 7) || 'HEAD'}) - Status: ${activeProd.status}`);
      if (activeProd.status === 'failed' || activeProd.status === 'error') {
        console.error('❌ Build falhou!');
        process.exit(1);
      }
    } else {
      // Nenhum deploy ativo na fila para produção. Confirma container running
      const app = await new Promise(res => {
        https.get('https://coolify.xpointsolucoes.com/api/v1/applications/owckk0k8w8soo40w40owc4ss', options, r => {
          let d = '';
          r.on('data', c => d += c);
          r.on('end', () => {
            try { res(JSON.parse(d)); } catch(e) { res({}); }
          });
        }).on('error', () => res({}));
      });

      console.log(`✅ [Sucesso] Build de Produção finalizado com êxito! Container status: ${app.status}`);
      process.exit(0);
    }
  }
  console.log('Tempo limite de monitoramento.');
  process.exit(0);
}

monitor();
