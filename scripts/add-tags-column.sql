-- Adicione a coluna tags na tabela contacts para permitir salvar os Grupos Empresariais
-- Execute este script no SQL Editor do seu Supabase Dashboard

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb;
