import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Helper para leitura do .env
const envMap = {};
try {
  const envText = fs.readFileSync('.env', 'utf-8');
  envText.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if(match) envMap[match[1]] = match[2].trim();
  });
} catch(e) {}

const connectionString = envMap.DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ ERRO CRÍTICO: 'DATABASE_URL' não definida no arquivo .env");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: connectionString,
});

async function run() {
  const filePath = process.argv[2];
  if(!filePath) {
      console.error("❌ O caminho do arquivo SQL deve ser fornecido: node scripts/supabase-sql-file.mjs \"caminho/para/arquivo.sql\"");
      process.exit(1);
  }
  
  let sqlText;
  try {
    sqlText = fs.readFileSync(path.resolve(filePath), 'utf-8');
  } catch(err) {
    console.error(`❌ Erro ao ler o arquivo SQL: ${err.message}`);
    process.exit(1);
  }
  
  try {
    await client.connect();
    console.log(`🔌 Conectado ao PostgreSQL.`);
    
    // Executa as queries
    const res = await client.query(sqlText);
    console.log(`✅ SQL Executado com Sucesso.`);
  } catch (err) {
    console.error('❌ ERRO NO SQL:', err.message);
    if (err.position) {
      console.error(`Erro próximo à posição: ${err.position}`);
    }
  } finally {
    await client.end();
  }
}

run();
