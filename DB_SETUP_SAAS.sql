-- Script de Execução via SQL Editor no Supabase

-- 1. Habilitar UUIDs (caso ainda não esteja)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Planos e Licenças
CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    features JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Inquilinos (Tenant / Companies)
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

-- 4. Tabela de Pagamentos (Billing)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    payment_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Vincular Históricos (Contatos e Mensagens) ao Inquilino
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES companies(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES companies(id);

-- Opcional (se as policies existirem vai dar erro, então as Dropamos se der problema depois)
-- Deleta as funções atigas
-- DROP FUNCTION IF EXISTS trigger_set_updated_at CASCADE;

-------------------------------------------------------------------------------
-- POPULAR DADOS PADRÕES (MOKADOS DO ADMIN) 
-------------------------------------------------------------------------------

-- 6. Inserir Planos
INSERT INTO plans (id, name, price, features) 
VALUES 
    (uuid_generate_v4(), 'Plano de Teste (7 Dias)', 0.00, '{"max_users": 1, "max_connections": 1}'),
    (uuid_generate_v4(), 'Plano Básico', 49.90, '{"max_users": 3, "max_connections": 1}'),
    ('eebcfb78-cb7f-4740-b44c-35cdb12b5b31', 'Plano PRO', 99.90, '{"max_users": 10, "max_connections": 3}'),
    (uuid_generate_v4(), 'Plano Super', 199.90, '{"max_users": 999, "max_connections": 10}')
ON CONFLICT DO NOTHING;

-- 7. Criar seu Sistema "XPoint Soluções" como a primeira Empresa (Ativa)
INSERT INTO companies (id, name, status, plan_id, evolution_api_instance, current_period_end)
VALUES 
    ('8b1e427b-2321-4ea7-9d7e-90f7d5cbad21', 'XPoint Soluções', 'active', 'eebcfb78-cb7f-4740-b44c-35cdb12b5b31', 'XpointSystem', '2026-04-15 00:00:00Z')
ON CONFLICT DO NOTHING;

-- 8. Atrelar os contatos já existentes à XPoint Soluções (Migração)
UPDATE contacts SET tenant_id = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21' WHERE tenant_id IS NULL;
UPDATE messages SET tenant_id = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21' WHERE tenant_id IS NULL;
