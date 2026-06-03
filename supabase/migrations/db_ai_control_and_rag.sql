-- Adiciona a coluna ai_paused se não existir na tabela conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_paused boolean DEFAULT false;

-- Índices adicionais para otimização do status e pausa da I.A
CREATE INDEX IF NOT EXISTS conversations_ai_paused_idx ON conversations(ai_paused);
CREATE INDEX IF NOT EXISTS conversations_status_idx ON conversations(status);

-- Adiciona colunas para o Modo Sandbox de Testes do Robô se não existirem
ALTER TABLE bots ADD COLUMN IF NOT EXISTS test_mode boolean DEFAULT false;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS test_phone text;

