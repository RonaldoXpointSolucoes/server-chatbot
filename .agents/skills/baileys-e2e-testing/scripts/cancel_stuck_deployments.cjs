const https = require('https');

const TOKEN = '4|aLosTpKEm9NMoTz7OUb7o0HrwY4xlJRM0vIwYOgZ8bdf853a';

function call(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'coolify.xpointsolucoes.com',
      path,
      method,
      rejectUnauthorized: false,
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: data.slice(0, 500) });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function cancelDeployment(uuid) {
  console.log(`Tentando cancelar deployment ${uuid}...`);
  // Tentativa 1: POST /api/v1/deployments/{uuid}/cancel
  let res = await call(`/api/v1/deployments/${uuid}/cancel`, 'POST');
  console.log(`POST /cancel status:`, res.status, res.body || res.raw);
  
  if (res.status === 404 || res.status === 405) {
    // Tentativa 2: DELETE /api/v1/deployments/{uuid}
    res = await call(`/api/v1/deployments/${uuid}`, 'DELETE');
    console.log(`DELETE status:`, res.status, res.body || res.raw);
  }
}

async function main() {
  const stuckUuids = [
    'rigle1xaubi3w8wxfqhh7t73',
    'ouskseb5xy20e8dbpiy4tuo9',
    'rl4owtlnl2kaijfgxhx2npmj',
    'oovq7o8wenovonyfwoe3vdgr'
  ];

  for (const u of stuckUuids) {
    await cancelDeployment(u);
  }

  // Verifica status final
  console.log('\n--- Status dos deployments pós cancelamento ---');
  const deps = await call('/api/v1/deployments');
  if (Array.isArray(deps.body)) {
    console.table(deps.body.map(d => ({
      uuid: d.deployment_uuid,
      app: d.application_name,
      status: d.status,
      created: d.created_at
    })));
  }
}

main();
