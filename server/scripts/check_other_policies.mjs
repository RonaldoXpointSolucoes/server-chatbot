import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT tablename, policyname, cmd, qual, with_check 
    FROM pg_policies 
    WHERE tablename IN ('contacts', 'messages', 'tenants', 'agents', 'bots')
    LIMIT 10;
  `);
  console.log('OUTRAS POLICIES:', JSON.stringify(res.rows, null, 2));

  // Consulta tabela tenants e o usuario do ronaldo
  const user = await client.query(`
    SELECT id, email FROM auth.users WHERE email = 'ronaldo.xpointsolucoes@gmail.com';
  `);
  console.log('USER ID:', user.rows);

  const tenantUsers = await client.query(`
    SELECT * FROM tenant_users WHERE user_id = '9057ca36-0b29-4fe5-89fb-be5e13387030';
  `);
  console.log('TENANT_USERS RONALDO:', tenantUsers.rows);

  await client.end();
}

run().catch(console.error);
