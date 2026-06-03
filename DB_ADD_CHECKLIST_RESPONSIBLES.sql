-- ============================================================================
-- ADICIONA A COLUNA DE RESPONSÁVEIS (ARRAY DE OPERADORES) NA TABELA DE CHECKLISTS
-- ============================================================================

-- 1. Cria a coluna na tabela checklists se não existir
ALTER TABLE checklists 
ADD COLUMN IF NOT EXISTS responsible_ids UUID[] DEFAULT '{}';

-- 2. Atualiza registros antigos que possam ter nulo nessa nova coluna para garantir array vazio
UPDATE checklists 
SET responsible_ids = '{}' 
WHERE responsible_ids IS NULL;

-- 3. Mensagem de Confirmação
SELECT 'Coluna responsible_ids criada na tabela checklists com sucesso!' AS status;
