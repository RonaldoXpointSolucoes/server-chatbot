-- 1. Cria as colunas necessárias na tabela de mensagens
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type VARCHAR(50); -- 'image', 'video', 'audio', 'document'

-- 2. Habilita o bucket no Supabase Storage nativo (chat_media)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat_media', 'chat_media', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Cria Política BÁSICA para permitir envio de mídias para testes (Public Upload)
-- Num ambiente produtivo total, isso seria travado por RLS Authenticated
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'chat_media' );

CREATE POLICY "Public Uploads" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'chat_media' );
