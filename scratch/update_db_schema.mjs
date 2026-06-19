import pg from 'pg';
import dotenv from 'dotenv';
import dns from 'dns';
dotenv.config();

const { Client } = pg;

const resolver = new dns.Resolver();
resolver.setServers(['1.1.1.1', '8.8.8.8']);

function resolveHost(host) {
  return new Promise((resolve, reject) => {
    // Tenta IPv6 primeiro
    resolver.resolve6(host, (err, addresses) => {
      if (!err && addresses && addresses.length > 0) {
        return resolve({ ip: addresses[0], family: 6 });
      }
      // Tenta IPv4 se IPv6 falhar
      resolver.resolve4(host, (err4, addresses4) => {
        if (!err4 && addresses4 && addresses4.length > 0) {
          return resolve({ ip: addresses4[0], family: 4 });
        }
        reject(err || err4 || new Error("Não foi possível resolver o host: " + host));
      });
    });
  });
}

async function main() {
  try {
    console.log("Resolvendo host db.yzbxsxabzncdzuxvlppt.supabase.co via DNS personalizado...");
    const { ip, family } = await resolveHost('db.yzbxsxabzncdzuxvlppt.supabase.co');
    console.log(`Resolvido: ${ip} (IPv${family})`);

    const hostStr = family === 6 ? `[${ip}]` : ip;
    const connectionString = process.env.DATABASE_URL.replace('db.yzbxsxabzncdzuxvlppt.supabase.co', hostStr);

    const client = new Client({
      connectionString
    });

    await client.connect();
    console.log("Conectado ao PostgreSQL.");

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
    await client.end();
  } catch (error) {
    console.error("Erro ao atualizar banco de dados:", error);
  }
}

main();
