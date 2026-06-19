import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    await client.connect();
    console.log("Conectado ao PostgreSQL.");

    const sql = `
      -- Habilitar a extensão pgvector caso não esteja habilitada
      CREATE EXTENSION IF NOT EXISTS vector;

      -- Criar tabela ai_reasoning_adjustments (com chave estrangeira apontando para companies que é a tabela de tenants)
      CREATE TABLE IF NOT EXISTS ai_reasoning_adjustments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_query text NOT NULL,
        original_response text NOT NULL,
        corrected_response text NOT NULL,
        embedding vector(384),
        created_at timestamp with time zone DEFAULT now()
      );

      -- Habilitar RLS
      ALTER TABLE ai_reasoning_adjustments ENABLE ROW LEVEL SECURITY;

      -- Criar política de isolamento se não existir
      DROP POLICY IF EXISTS ai_reasoning_adjustments_tenant_isolation ON ai_reasoning_adjustments;
      CREATE POLICY ai_reasoning_adjustments_tenant_isolation ON ai_reasoning_adjustments 
        FOR ALL USING (tenant_id = auth.uid() OR auth.role() = 'service_role' OR true); -- Permite leitura/escrita no MVP

      -- Criar índices
      CREATE INDEX IF NOT EXISTS ai_reasoning_adjustments_tenant_id_idx ON ai_reasoning_adjustments(tenant_id);

      -- Função RPC de busca por similaridade
      CREATE OR REPLACE FUNCTION match_ai_reasoning_adjustments(
        query_embedding vector(384),
        match_threshold float,
        match_count int,
        p_tenant_id uuid
      )
      RETURNS TABLE (
        id uuid,
        user_query text,
        original_response text,
        corrected_response text,
        similarity float
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT
          ara.id,
          ara.user_query,
          ara.original_response,
          ara.corrected_response,
          1 - (ara.embedding <=> query_embedding) AS similarity
        FROM ai_reasoning_adjustments ara
        WHERE ara.tenant_id = p_tenant_id
          AND 1 - (ara.embedding <=> query_embedding) > match_threshold
        ORDER BY ara.embedding <=> query_embedding
        LIMIT match_count;
      END;
      $$;
    `;

    console.log("Executando DDL no banco de dados...");
    await client.query(sql);
    console.log("Tabela ai_reasoning_adjustments e função RPC match_ai_reasoning_adjustments criadas com sucesso!");
  } catch (error) {
    console.error("Erro ao executar script:", error);
  } finally {
    await client.end();
  }
}

main();
