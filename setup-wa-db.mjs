import pg from 'pg';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres'
});

async function initWABase() {
  await client.connect();
  console.log('PostgreSQL Connected. Preparando tabelas CORE de WhatsApp Engine...');

  const query = `
    CREATE TABLE IF NOT EXISTS wa_auth_states (
        tenant_id UUID NOT NULL,
        key_id VARCHAR(255) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (tenant_id, key_id)
    );
  `;
  try {
     await client.query(query);
     console.log('Tabela wa_auth_states criada com Multi-Tenant Key Support!');
  } catch (e) {
     console.error(e);
  } finally {
     await client.end();
  }
}

initWABase();
