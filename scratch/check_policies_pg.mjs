import pg from 'pg';
const { Client } = pg;

const connectionString = 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres';

async function run() {
    const client = new Client({ connectionString });
    await client.connect();
    
    console.log('--- pg_policies for knowledge_documents ---');
    const res = await client.query(`SELECT * FROM pg_policies WHERE tablename = 'knowledge_documents'`);
    console.log(JSON.stringify(res.rows, null, 2));

    await client.end();
}
run();
