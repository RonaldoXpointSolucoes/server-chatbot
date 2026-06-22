import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL não configurada no .env");
  process.exit(1);
}

const { Client } = pg;
const client = new Client({ connectionString });

async function run() {
  try {
    await client.connect();
    console.log("Conectado ao PostgreSQL com sucesso.");

    const queries = [
      "ALTER TABLE bots ADD COLUMN IF NOT EXISTS cardapio_origem text DEFAULT 'supabase';",
      "ALTER TABLE bots ADD COLUMN IF NOT EXISTS cardapio_json_url text;",
      "ALTER TABLE bots ADD COLUMN IF NOT EXISTS cardapio_json_token text;",
      "ALTER TABLE bots ADD COLUMN IF NOT EXISTS cardapio_json_payload jsonb;"
    ];

    for (let q of queries) {
      console.log(`Executando: ${q}`);
      await client.query(q);
    }

    console.log("Colunas adicionadas com sucesso!");
  } catch (err) {
    console.error("Erro ao alterar tabela:", err);
  } finally {
    await client.end();
  }
}

run();
