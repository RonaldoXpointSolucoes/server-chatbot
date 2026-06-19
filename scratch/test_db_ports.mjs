import pg from 'pg';
const { Client } = pg;

const configs = [
  {
    host: 'aws-0-sa-east-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.yzbxsxabzncdzuxvlppt',
    password: 'Xx@gh03360102',
    ssl: { rejectUnauthorized: false }
  },
  {
    host: 'aws-0-sa-east-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.yzbxsxabzncdzuxvlppt',
    password: 'Xx@gh03360102',
    ssl: { rejectUnauthorized: false }
  }
];

async function test(config, index) {
    const client = new Client(config);
    try {
        await client.connect();
        console.log(`Config ${index} connected successfully!`);
        const res = await client.query('SELECT NOW()');
        console.log(`Config ${index} time:`, res.rows[0]);
        await client.end();
    } catch (err) {
        console.error(`Config ${index} failed:`, err.message);
    }
}

async function run() {
    await test(configs[0], 0);
    await test(configs[1], 1);
}
run();
