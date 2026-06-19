import pg from 'pg';
const { Client } = pg;

const connectionString = "postgresql://postgres.yzbxsxabzncdzuxvlppt:Xx%40gh03360102@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";

async function main() {
  const client = new Client({ 
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
  try {
    await client.connect();
    console.log("Conectado com SUCESSO via Pooler sa-east-1 no port 5432!");
    const res = await client.query("SELECT 1");
    console.log("Query test:", res.rows);
  } catch (err) {
    console.error("Falha ao conectar:", err);
  } finally {
    await client.end();
  }
}

main();
