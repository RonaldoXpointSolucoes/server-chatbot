-- Habilitar a extensão pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela para gerenciar os documentos (PDF, CSV, TXT, etc) carregados por empresa
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text,
  status text DEFAULT 'processing',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS nos documentos
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_documents_tenant_isolation ON knowledge_documents;
CREATE POLICY knowledge_documents_tenant_isolation ON knowledge_documents 
  FOR ALL USING (tenant_id = auth.uid() OR auth.role() = 'service_role');

-- Tabela para os Chunks e Vetores
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(384),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS nos chunks
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_chunks_tenant_isolation ON knowledge_chunks;
CREATE POLICY knowledge_chunks_tenant_isolation ON knowledge_chunks 
  FOR ALL USING (tenant_id = auth.uid() OR auth.role() = 'service_role');

-- Índices otimizados para busca semântica multi-tenant
CREATE INDEX IF NOT EXISTS knowledge_chunks_tenant_id_idx ON knowledge_chunks(tenant_id);
-- Índice HNSW no embedding (Opgvector HNSW precisa da dimensão. Vamos deixar sem indice HNSW generico por enquanto para evitar erros dependendo da versão do supabase, usaremos Indexação IVFFlat ou apenas seqscan que é rápido com filtro de tenant)
-- CREATE INDEX ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- Função de Match para Retorno de RAG
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(384),
  match_threshold float,
  match_count int,
  p_tenant_id uuid
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE kc.tenant_id = p_tenant_id
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
