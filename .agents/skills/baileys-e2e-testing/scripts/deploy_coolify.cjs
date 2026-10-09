const https = require('https');

const COOLIFY_URL = 'https://coolify.xpointsolucoes.com';
const TOKEN = '4|aLosTpKEm9NMoTz7OUb7o0HrwY4xlJRM0vIwYOgZ8bdf853a';

const targetUuid = process.argv[2] || 'wh1ss8sy848ufj6zh8t492y7';
const envName = targetUuid === 'wh1ss8sy848ufj6zh8t492y7' ? 'ServerChatBaileys-Alpha (Homologação)' : 'ServerChatBaileys-Produção (Produção)';

console.log(`[Coolify Deploy] Iniciando deploy para: ${envName} (UUID: ${targetUuid})`);

function requestCoolify(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, COOLIFY_URL);
    const options = {
      method,
      rejectUnauthorized: false,
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout na requisição ao Coolify')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  try {
    // 1. Trigger deploy
    // Coolify v4 uses /api/v1/deploy?uuid=... or /api/v1/deploy with query param
    console.log(`[Coolify Deploy] Enviando POST /api/v1/deploy?uuid=${targetUuid}...`);
    let deployRes = await requestCoolify('POST', `/api/v1/deploy?uuid=${targetUuid}`);
    
    if (deployRes.status !== 200 && deployRes.status !== 201) {
      console.log(`[Coolify Deploy] Tentativa com tag_or_uuid... Status anterior: ${deployRes.status}`);
      deployRes = await requestCoolify('POST', `/api/v1/deploy?tag_or_uuid=${targetUuid}`);
    }

    console.log('[Coolify Deploy] Resposta do trigger:', JSON.stringify(deployRes));

    // Handle responses like { deployments: [ { deployment_uuid: "..." } ] } or { deployment_uuid: "..." }
    let deploymentUuid = null;
    if (deployRes.data) {
      if (deployRes.data.deployment_uuid) {
        deploymentUuid = deployRes.data.deployment_uuid;
      } else if (Array.isArray(deployRes.data.deployments) && deployRes.data.deployments.length > 0) {
        deploymentUuid = deployRes.data.deployments[0].deployment_uuid;
      } else if (Array.isArray(deployRes.data) && deployRes.data[0]?.deployment_uuid) {
        deploymentUuid = deployRes.data[0].deployment_uuid;
      }
    }

    if (!deploymentUuid) {
      console.log('[Coolify Deploy] Não foi retornado deployment_uuid explícito. Monitorando status da aplicação via /api/v1/applications/' + targetUuid);
    } else {
      console.log(`[Coolify Deploy] Deployment UUID capturado: ${deploymentUuid}`);
    }

    // Monitor loop
    let attempts = 0;
    const maxAttempts = 60; // 5 minutos (a cada 5s)
    let finished = false;

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, 5000));

      if (deploymentUuid) {
        let check = await requestCoolify('GET', `/api/v1/deployments/${deploymentUuid}`);
        let status = check.data?.status;

        // Se a rota individual não encontrar, busca na lista global de deployments
        if (!status || status === 'unknown' || check.status === 404) {
          const listRes = await requestCoolify('GET', `/api/v1/deployments`);
          if (Array.isArray(listRes.data)) {
            const found = listRes.data.find(d => d.deployment_uuid === deploymentUuid || d.application_name?.toLowerCase().includes(targetUuid === 'wh1ss8sy848ufj6zh8t492y7' ? 'alpha' : 'produção'));
            if (found) {
              status = found.status;
            }
          }
        }

        status = status || 'unknown';
        process.stdout.write(`\r[Coolify Deploy] Tentativa ${attempts}/${maxAttempts} - Status: ${status}        `);

        if (status === 'finished' || status === 'success') {
          console.log(`\n✅ [Coolify Deploy] Build finalizado com SUCESSO!`);
          finished = true;
          break;
        } else if (status === 'failed' || status === 'error') {
          console.log(`\n❌ [Coolify Deploy] Build FALHOU com status: ${status}`);
          process.exit(1);
        }
      } else {
        // Checar via /api/v1/applications/UUID
        const appCheck = await requestCoolify('GET', `/api/v1/applications/${targetUuid}`);
        const appStatus = appCheck.data?.status || 'unknown';
        process.stdout.write(`\r[Coolify Deploy] Tentativa ${attempts}/${maxAttempts} - App status: ${appStatus}        `);
        // Se após algumas tentativas estiver running e não deploying
        if (attempts > 6 && (appStatus === 'running:healthy' || appStatus.includes('running'))) {
          console.log(`\n✅ [Coolify Deploy] Aplicação em execução saudável: ${appStatus}`);
          finished = true;
          break;
        }
      }
    }

    if (!finished) {
      console.log('\n⚠️ [Coolify Deploy] Tempo limite de monitoramento excedido.');
      process.exit(1);
    }

    console.log(`[Coolify Deploy] Concluído com sucesso para ${envName}!`);
    process.exit(0);

  } catch (err) {
    console.error('\n❌ [Coolify Deploy] Erro inesperado:', err);
    process.exit(1);
  }
}

run();
