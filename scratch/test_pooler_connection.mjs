import pg from 'pg';
const { Client } = pg;

const connectionString = "postgresql://postgres.yzbxsxabzncdzuxvlppt:Xx%40gh03360102@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

async function main() {
  const client = new Client({ 
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
  try {
    await client.connect();
    console.log("Conectado com SUCESSO via Pooler us-east-1!");
    
    // Executa a migration
    const sql = `
      -- Adicionar coluna context_summary na tabela ai_reasoning_adjustments se não existir
      ALTER TABLE ai_reasoning_adjustments ADD COLUMN IF NOT EXISTS context_summary text;

      -- Atualizar a função RPC match_ai_reasoning_adjustments para retornar a coluna context_summary
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
        context_summary text,
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
          ara.context_summary,
          1 - (ara.embedding <=> query_embedding) AS similarity
        FROM ai_reasoning_adjustments ara
        WHERE ara.tenant_id = p_tenant_id
          AND 1 - (ara.embedding <=> query_embedding) > match_threshold
        ORDER BY ara.embedding <=> query_embedding
        LIMIT match_count;
      END;
      $$;
    `;

    console.log("Executando ALTER TABLE e atualizando função RPC...");
    await client.query(sql);
    console.log("Banco de dados atualizado com sucesso!");
  } catch (err) {
    console.error("Falha ao conectar:", err);
  } finally {
    await client.end();
  }
}

main();
