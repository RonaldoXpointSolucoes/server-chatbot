import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function initDB() {
  try {
    await client.connect();
    console.log('Conectado ao PostgreSQL.');

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
    `;

    console.log('Criando tabelas...');
    await client.query(createTables);
    console.log('Tabelas criadas com sucesso!');

    // Check if plans exist to insert defaults
    const { rows: plans } = await client.query('SELECT id FROM plans');
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
    } else {
      console.log('Planos já existem, pulando inserção.');
    }

  } catch (error) {
    console.error('Erro ao inicializar o banco:', error);
  } finally {
    await client.end();
  }
}

initDB();
