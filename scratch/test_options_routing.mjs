import pg from 'pg';
const { Client } = pg;

const connectionString = 'postgresql://postgres:Xx%40gh03360102@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?options=-c%20project%3Dyzbxsxabzncdzuxvlppt';

async function main() {
  const client = new Client({ 
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
  try {
    await client.connect();
    console.log("Conectado com SUCESSO usando options project routing no sa-east-1!");
    const res = await client.query("SELECT 1 as x");
    console.log("Query test:", res.rows);
  } catch (err) {
    console.error("Falha ao conectar:", err);
  } finally {
    await client.end();
  }
}

main();
