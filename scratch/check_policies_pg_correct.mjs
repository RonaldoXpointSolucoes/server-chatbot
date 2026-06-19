import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: 'aws-0-sa-east-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.yzbxsxabzncdzuxvlppt',
  password: 'Xx@gh03360102',
  ssl: { rejectUnauthorized: false }
});

async function run() {
    await client.connect();
    
    console.log('--- pg_policies for knowledge_documents ---');
    const res = await client.query(`SELECT * FROM pg_policies WHERE tablename = 'knowledge_documents'`);
    console.log(JSON.stringify(res.rows, null, 2));

    await client.end();
}
run();
