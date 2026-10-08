const https = require('https');

const TOKEN = '4|aLosTpKEm9NMoTz7OUb7o0HrwY4xlJRM0vIwYOgZ8bdf853a';

function call(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'coolify.xpointsolucoes.com',
      path,
      method,
      rejectUnauthorized: false,
      timeout: 15000,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
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
    req.end();
  });
}

async function main() {
  console.log('--- 1. App Info ---');
  try {
    const app = await call('/api/v1/applications/owckk0k8w8soo40w40owc4ss');
    console.log('App Status:', app.status, 'Name:', app.body?.name, 'Branch:', app.body?.git_branch, 'Status:', app.body?.status);
  } catch(e) { console.error('App err:', e.message); }

  console.log('--- 2. Deployments List ---');
  try {
    const deps = await call('/api/v1/deployments');
    if (Array.isArray(deps.body)) {
      console.log('Total Deployments:', deps.body.length);
      console.table(deps.body.slice(0, 6).map(d => ({
        uuid: d.deployment_uuid,
        app: d.application_name,
        status: d.status,
        created: d.created_at
      })));
    } else {
      console.log('Deps body:', deps.body || deps.raw);
    }
  } catch(e) { console.error('Deps err:', e.message); }
}

main();
