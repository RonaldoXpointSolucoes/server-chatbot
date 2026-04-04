import pg from 'pg';
import fs from 'fs';

// Helper for basic .env file reading ignoring libraries
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
  console.error("Adicione a variável no final do .env: DATABASE_URL=postgresql://postgres... e tente novamente.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: connectionString,
});

async function run() {
  const sql = process.argv[2];
  if(!sql) {
      console.error("❌ O arquivo SQL deve ser fornecido via argumento: node supabase-sql.mjs \"SELECT 1;\"");
      process.exit(1);
  }
  
  try {
    await client.connect();
    console.log(`🔌 Conectado ao PostgreSQL.`);
    
    const res = await client.query(sql);
    console.log(`✅ Sucesso. Linhas processadas/afetadas se aplicável: ${res.rowCount || 0}`);
    if (res.rows && res.rows.length > 0) {
        console.table(res.rows);
    }
  } catch (err) {
    console.error('❌ ERRO NO SQL:', err.message);
  } finally {
    await client.end();
  }
}

run();
