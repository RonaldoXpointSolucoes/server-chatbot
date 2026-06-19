import pg from 'pg';
const { Client } = pg;

async function main() {
  const client = new Client({ 
    connectionString: "postgresql://postgres:Xx%40gh03360102@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
    options: "-c project=yzbxsxabzncdzuxvlppt",
    ssl: {
      rejectUnauthorized: false
    }
  });
  try {
    await client.connect();
    console.log("Conectado com SUCESSO usando a propriedade options no sa-east-1!");
    const res = await client.query("SELECT 1 as x");
    console.log("Query test:", res.rows);
  } catch (err) {
    console.error("Falha ao conectar:", err);
  } finally {
    await client.end();
  }
}

main();
