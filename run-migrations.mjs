import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:Xx%40gh03360102@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
});

async function initDB() {
  try {
    await client.connect();
    console.log('Conectado ao PostgreSQL via Pooler.');

    const createTables = `
      -- Enable UUID extension if not exists
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- Table: Plans
      CREATE TABLE IF NOT EXISTS plans (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(255) NOT NULL,
          price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
          features JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Table: Companies
      CREATE TABLE IF NOT EXISTS companies (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(255) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'trial',
          plan_id UUID REFERENCES plans(id),
          evolution_api_instance VARCHAR(255),
          evolution_api_key VARCHAR(255),
          trial_ends_at TIMESTAMP WITH TIME ZONE,
          current_period_end TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Table: Payments
      CREATE TABLE IF NOT EXISTS payments (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
          amount NUMERIC(10,2) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          due_date TIMESTAMP WITH TIME ZONE NOT NULL,
          payment_date TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- ACRESCENTAR TENANT OBRIGATÓRIO NAS EXISTENTES
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES companies(id);
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES companies(id);
    `;

    console.log('Aplicando DDLs...');
    await client.query(createTables);
    console.log('Tabelas e Relações criadas com sucesso!');

    // Check if plans exist to insert defaults
    const { rows: plans } = await client.query('SELECT id, name FROM plans');
    let planIdPro = null;

    if (plans.length === 0) {
      console.log('Inserindo planos iniciais...');
      const insertPlans = `
        INSERT INTO plans (name, price, features) VALUES
        ('Plano de Teste (7 Dias)', 0.00, '{"max_users": 1, "max_connections": 1}'),
        ('Plano Básico', 49.90, '{"max_users": 3, "max_connections": 1}'),
        ('Plano PRO', 99.90, '{"max_users": 10, "max_connections": 3}'),
        ('Plano Super', 199.90, '{"max_users": 999, "max_connections": 10}')
        RETURNING id, name;
      `;
      const res = await client.query(insertPlans);
      console.log('Planos inseridos:', res.rows);
      planIdPro = res.rows.find(p => p.name === 'Plano PRO')?.id;
    } else {
      console.log('Planos já existem, pulando inserção.');
      planIdPro = plans.find(p => p.name === 'Plano PRO')?.id;
    }

    // Criar XPoint Soluções
    if (planIdPro) {
       const { rows: xpoint } = await client.query("SELECT id FROM companies WHERE name = 'XPoint Soluções'");
       let xpointId;
       if (xpoint.length === 0) {
         console.log('Criando Tenant Mestre "XPoint Soluções"...');
         const res = await client.query(`
            INSERT INTO companies (name, status, plan_id, evolution_api_instance, current_period_end)
            VALUES ('XPoint Soluções', 'active', $1, 'XpointSystem', '2026-04-15T00:00:00Z')
            RETURNING id;
         `, [planIdPro]);
         xpointId = res.rows[0].id;
         console.log('XPoint criada! ID:', xpointId);
       } else {
         xpointId = xpoint[0].id;
         console.log('XPoint já existe! ID:', xpointId);
       }

       // Migrar contatos e mensagens antigos para a XPoint
       console.log('Migrando contatos herdados para a XPoint Soluções...');
       await client.query('UPDATE contacts SET tenant_id = $1 WHERE tenant_id IS NULL', [xpointId]);
       await client.query('UPDATE messages SET tenant_id = $1 WHERE tenant_id IS NULL', [xpointId]);
       console.log('Migração concluída.');

       // Garantir o login real 
       // Se o tenantName for 'XPoint Soluções', tem que validar. Vamos deixar isso pra UI.
    }

  } catch (error) {
    console.error('Erro ao inicializar o banco:', error);
  } finally {
    await client.end();
  }
}

initDB();
