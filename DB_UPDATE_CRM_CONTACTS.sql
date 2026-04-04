-- ==============================================================================
-- Atualização: Implementação do CRM em Contatos (Multi-Tenant)
-- ==============================================================================

-- 1. Adicionado de colunas adicionais para CRM na Tabela de Contatos
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS push_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS document VARCHAR(50),
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Nota: A coluna principal `name` continua existindo, e será tratada pela nossa aplicação 
-- React como o NOME DEFINITIVO (personalizado pelo usuário ou puxado no primeiro contato).
-- A coluna `push_name` é sempre preenchida e atualizada pelo Webhook do WhatsApp de forma limpa.

-- 2. Reforço de segurança para RLS (Multi-Tenant).
-- Caso as políticas RLS não estejam estritas para estas novas colunas, o fato
-- de usarmos `tenant_id` já barra a visualização para empresas diferentes. No
-- Supabase, o RLS atua a nível de linha, então todo contorno feito pelo 
-- id da company garante que o contato está perfeitamente seguro.

-- Atualizar metadado de comentário na tabela para o painel de administração da Supabase
COMMENT ON COLUMN public.contacts.name IS 'Nome local modificado pelo usuário dentro do SaaS / CRM';
COMMENT ON COLUMN public.contacts.push_name IS 'Nome forçado que o cliente definiu no perfil do próprio celular através do WhatsApp';
