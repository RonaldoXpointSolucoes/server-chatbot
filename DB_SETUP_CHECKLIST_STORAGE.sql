-- =========================================================================
-- CONFIGURAÇÃO DO BUCKET DE STORAGE E POLÍTICAS RLS PARA EVIDÊNCIAS DE CHECKLIST
-- =========================================================================

-- 1. Criação do Bucket 'checklist-evidences' como Público
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'checklist-evidences',
  'checklist-evidences',
  true,
  10485760, -- limite de 10MB por arquivo
  '{"image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"}'
)
ON CONFLICT (id) DO UPDATE SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Garantir RLS habilitado na tabela storage.objects (por segurança)
-- Nota: O RLS já vem ativado por padrão na tabela de objetos do Supabase Storage.
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Limpar políticas de segurança conflitantes legadas
DROP POLICY IF EXISTS "Leitura pública de checklist-evidences" ON storage.objects;
DROP POLICY IF EXISTS "Upload público de checklist-evidences" ON storage.objects;
DROP POLICY IF EXISTS "Edição pública de checklist-evidences" ON storage.objects;

-- 4. Criar políticas de segurança na tabela storage.objects para o bucket checklist-evidences

-- Permissão de Leitura pública para qualquer visitante visualizando as evidências
CREATE POLICY "Leitura pública de checklist-evidences"
ON storage.objects FOR SELECT
USING (bucket_id = 'checklist-evidences');

-- Permissão de Inserção livre/pública para permitir upload a partir do PWA tablet
CREATE POLICY "Upload público de checklist-evidences"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'checklist-evidences');

-- Permissão de Edição/Atualização livre para permitir a substituição de fotos (upsert: true)
CREATE POLICY "Edição pública de checklist-evidences"
ON storage.objects FOR UPDATE
USING (bucket_id = 'checklist-evidences')
WITH CHECK (bucket_id = 'checklist-evidences');

-- Mensagem de Confirmação
SELECT 'Bucket checklist-evidences configurado com políticas de segurança com sucesso!' AS status;
