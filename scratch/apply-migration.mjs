import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Client } = pg;
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres';

const client = new Client({ connectionString });

async function run() {
  try {
    await client.connect();
    console.log('Conectado ao PostgreSQL com sucesso.');

    const sqlPath = './supabase/migrations/db_ai_paused_manually.sql';
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executando query SQL de migração...');
    await client.query(sql);
    console.log('Coluna ai_paused_manually e index adicionados com sucesso no banco de dados!');
  } catch (err) {
    console.error('Erro ao executar migração:', err);
  } finally {
    await client.end();
  }
}

run();
