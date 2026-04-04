import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:Xx%40gh03360102@db.yzbxsxabzncdzuxvlppt.supabase.co:5432/postgres'
});

async function initLogs() {
  try {
    await client.connect();
    console.log('Conectado ao PostgreSQL. Criando tabela system_logs...');

    const createLogsTable = `
      CREATE TABLE IF NOT EXISTS system_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          type VARCHAR(100) NOT NULL,
          message TEXT NOT NULL,
          level VARCHAR(20) DEFAULT 'info',
          payload JSONB DEFAULT '{}',
          tenant_id UUID,
          company_id UUID,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    await client.query(createLogsTable);
    console.log('Tabela system_logs criada/verificada com sucesso!');

  } catch (error) {
    console.error('Erro ao inicializar system_logs:', error);
  } finally {
    await client.end();
  }
}

initLogs();
