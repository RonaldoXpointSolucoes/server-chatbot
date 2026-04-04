-- Adicionar coluna Email e Senha na tabela de companhias (Inquilinos/Tenants)
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS password VARCHAR(255);

-- Definir a senha base para a XPoint Soluções e Atualizar
UPDATE companies
SET 
  email = 'ronaldo.xpointsolucoes@gmail.com',
  password = 'Xx@gh03360102'
WHERE name = 'XPoint Soluções';
