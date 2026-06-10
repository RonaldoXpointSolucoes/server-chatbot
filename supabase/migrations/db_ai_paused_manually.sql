-- Adiciona a coluna ai_paused_manually se não existir na tabela conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_paused_manually boolean DEFAULT false;

-- Índice para otimização das buscas e filtros por essa flag
CREATE INDEX IF NOT EXISTS conversations_ai_paused_manually_idx ON conversations(ai_paused_manually);
