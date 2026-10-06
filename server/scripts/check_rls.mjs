import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE tablename IN ('flows', 'flow_versions');
  `);
  console.log('POLICIES:', JSON.stringify(res.rows, null, 2));

  const rls = await client.query(`
    SELECT relname, relrowsecurity 
    FROM pg_class 
    WHERE relname IN ('flows', 'flow_versions');
  `);
  console.log('RLS STATUS:', rls.rows);

  await client.end();
}

run().catch(console.error);
