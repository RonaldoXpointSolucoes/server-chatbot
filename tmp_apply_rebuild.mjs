import fs from 'fs';
import pg from 'pg';
import path from 'path';

const { Client } = pg;

async function executeSql() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres';
  
  if (!connectionString) {
    console.error("DATABASE_URL não configurada!");
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log("Conectado ao Supabase.");

    const sqlFilePath = path.join(process.cwd(), 'DB_REBUILD_SAAS_V2.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');

    console.log("Executando script de reconstrução...");
    await client.query(sql);

    console.log("✅ Banco Supabase reconstruído com sucesso seguindo o modelo V2!");
  } catch (err) {
    console.error("Erro na execução do SQL:", err);
  } finally {
    await client.end();
  }
}

executeSql();
