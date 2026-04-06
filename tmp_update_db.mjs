import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  await client.connect();
  
  try {
    console.log("Iniciando DDL migrations...");

    // Adiciona instance_id às tabelas base para obedecer o Multi-Tenant com Multi-Instâncias
    await client.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS instance_id uuid references whatsapp_instances(id) on delete cascade;
    `);
    console.log("contacts atualizada.");

    await client.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS instance_id uuid references whatsapp_instances(id) on delete cascade;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at timestamp with time zone default now();
    `);
    console.log("conversations atualizada.");

    await client.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS instance_id uuid references whatsapp_instances(id) on delete cascade;
    `);
    console.log("messages atualizada.");

    console.log("Todas as migrations concluídas com sucesso.");
  } catch(e) {
    console.error("Erro na migração:", e);
  } finally {
    await client.end();
  }
}

run();
