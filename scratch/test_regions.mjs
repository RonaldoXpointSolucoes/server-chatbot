import pg from 'pg';
const { Client } = pg;

const regions = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'sa-east-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1',
  'ca-central-1'
];

async function testRegion(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const connectionString = `postgresql://postgres.yzbxsxabzncdzuxvlppt:Xx%40gh03360102@${host}:6543/postgres`;
  const client = new Client({ 
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });

  try {
    await client.connect();
    console.log(`[${region}] CONECTADO COM SUCESSO!`);
    await client.end();
    return true;
  } catch (err) {
    const errMsg = err.message || '';
    if (errMsg.includes('tenant/user') && errMsg.includes('not found')) {
      // Quietly ignore "tenant/user not found"
    } else {
      console.log(`[${region}] Erro diferente: ${errMsg}`);
    }
    return false;
  }
}

async function main() {
  console.log("Iniciando testes de região de pooler...");
  for (const region of regions) {
    await testRegion(region);
  }
  console.log("Testes finalizados.");
}

main();
