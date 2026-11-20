/**
 * DDL idempotente e evolução das RPCs híbridas para suportar isolamento por caixa (`instance_id`),
 * checkpoints incrementais em `whatsapp_instances` e auditoria em `inbox_knowledge_runs`.
 */
export function buildInboxKnowledgeMigrationSql() {
    return `
          ALTER TABLE IF EXISTS public.knowledge_documents
            ADD COLUMN IF NOT EXISTS instance_id uuid NULL;

          ALTER TABLE IF EXISTS public.knowledge_chunks
            ADD COLUMN IF NOT EXISTS instance_id uuid NULL;

          CREATE INDEX IF NOT EXISTS knowledge_documents_tenant_instance_idx
            ON public.knowledge_documents (tenant_id, instance_id, created_at DESC);

          CREATE INDEX IF NOT EXISTS knowledge_chunks_tenant_instance_idx
            ON public.knowledge_chunks (tenant_id, instance_id);

          ALTER TABLE IF EXISTS public.whatsapp_instances
            ADD COLUMN IF NOT EXISTS last_knowledge_analyzed_at timestamp with time zone NULL,
            ADD COLUMN IF NOT EXISTS last_knowledge_document_id uuid NULL,
            ADD COLUMN IF NOT EXISTS last_knowledge_run_id uuid NULL;

          CREATE TABLE IF NOT EXISTS public.inbox_knowledge_runs (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL,
            instance_id uuid NOT NULL,
            status text NOT NULL DEFAULT 'queued',
            mode text NOT NULL DEFAULT 'incremental',
            window_start timestamp with time zone NULL,
            window_end timestamp with time zone NOT NULL,
            progress_pct integer NOT NULL DEFAULT 0,
            current_stage integer NOT NULL DEFAULT 1,
            current_step_label text,
            stats jsonb NOT NULL DEFAULT '{}'::jsonb,
            discarded_samples jsonb NOT NULL DEFAULT '[]'::jsonb,
            extracted_behavior_summary text NULL,
            result_markdown text NULL,
            document_id uuid NULL,
            error_message text NULL,
            created_at timestamp with time zone NOT NULL DEFAULT now(),
            completed_at timestamp with time zone NULL
          );

          CREATE INDEX IF NOT EXISTS inbox_knowledge_runs_tenant_instance_idx
            ON public.inbox_knowledge_runs (tenant_id, instance_id, created_at DESC);

          DROP FUNCTION IF EXISTS public.match_knowledge_chunks(vector, double precision, integer, uuid);
          DROP FUNCTION IF EXISTS public.match_knowledge_chunks(vector, double precision, integer, uuid, text);
          DROP FUNCTION IF EXISTS public.match_knowledge_chunks(vector(384), double precision, integer, uuid);
          DROP FUNCTION IF EXISTS public.match_knowledge_chunks(vector(384), double precision, integer, uuid, text);
          DROP FUNCTION IF EXISTS public.match_knowledge_chunks(vector(384), double precision, integer, uuid, text, uuid);

          CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
            query_embedding vector(384),
            match_threshold double precision,
            match_count integer,
            p_tenant_id uuid,
            p_agent_id text DEFAULT NULL::text,
            p_instance_id uuid DEFAULT NULL::uuid
          )
          RETURNS TABLE (
            id uuid,
            document_id uuid,
            content text,
            metadata jsonb,
            similarity double precision
          )
          LANGUAGE plpgsql
          AS $$
          BEGIN
            PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);
            PERFORM set_config('hnsw.ef_search', '120', true);
            RETURN QUERY
            SELECT
              kc.id,
              kc.document_id,
              kc.content,
              kc.metadata,
              1 - (kc.embedding <=> query_embedding) AS similarity
            FROM public.knowledge_chunks kc
            INNER JOIN public.knowledge_documents kd ON kd.id = kc.document_id
            WHERE kc.tenant_id = p_tenant_id
              AND kd.status IN ('ready', 'processed')
              AND (p_agent_id IS NULL OR kc.agent_id IS NULL OR kc.agent_id = p_agent_id)
              AND (p_instance_id IS NULL OR kc.instance_id IS NULL OR kc.instance_id = p_instance_id)
              AND (1 - (kc.embedding <=> query_embedding)) > match_threshold
            ORDER BY
              CASE WHEN p_instance_id IS NOT NULL AND kc.instance_id = p_instance_id THEN 0 ELSE 1 END,
              kc.embedding <=> query_embedding
            LIMIT match_count;
          END;
          $$;

          DROP FUNCTION IF EXISTS public.match_knowledge_chunks_hybrid(vector(384), text, uuid, text, double precision, integer);
          DROP FUNCTION IF EXISTS public.match_knowledge_chunks_hybrid(vector(384), text, uuid, text, double precision, integer, uuid);

          CREATE OR REPLACE FUNCTION public.match_knowledge_chunks_hybrid(
            query_embedding vector(384),
            query_text text,
            p_tenant_id uuid,
            p_agent_id text DEFAULT NULL::text,
            vector_threshold double precision DEFAULT 0.24,
            match_count integer DEFAULT 12,
            p_instance_id uuid DEFAULT NULL::uuid
          )
          RETURNS TABLE (
            id uuid,
            document_id uuid,
            document_name text,
            content text,
            metadata jsonb,
            vector_similarity double precision,
            lexical_score double precision,
            rrf_score double precision
          )
          LANGUAGE plpgsql
          AS $$
          DECLARE
            v_plain text;
            v_or_tsq tsquery;
          BEGIN
            PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);
            PERFORM set_config('hnsw.ef_search', '120', true);

            v_plain := coalesce(plainto_tsquery('portuguese', coalesce(query_text, ''))::text, '');
            IF length(trim(v_plain)) > 0 THEN
              v_or_tsq := to_tsquery('portuguese', replace(v_plain, ' & ', ' | '));
            ELSE
              v_or_tsq := NULL;
            END IF;

            RETURN QUERY
            WITH vector_hits AS (
              SELECT
                kc.id,
                kc.document_id,
                kc.instance_id,
                kd.name AS document_name,
                kc.content,
                kc.metadata,
                (1 - (kc.embedding <=> query_embedding))::double precision AS v_sim,
                row_number() OVER (ORDER BY kc.embedding <=> query_embedding ASC) AS v_rank
              FROM public.knowledge_chunks kc
              INNER JOIN public.knowledge_documents kd ON kd.id = kc.document_id
              WHERE kc.tenant_id = p_tenant_id
                AND kd.status IN ('ready', 'processed')
                AND (p_agent_id IS NULL OR kc.agent_id IS NULL OR kc.agent_id = p_agent_id)
                AND (p_instance_id IS NULL OR kc.instance_id IS NULL OR kc.instance_id = p_instance_id)
                AND (1 - (kc.embedding <=> query_embedding)) > vector_threshold
              ORDER BY kc.embedding <=> query_embedding ASC
              LIMIT GREATEST(match_count * 2, 24)
            ),
            lexical_hits AS (
              SELECT
                kc.id,
                kc.document_id,
                kc.instance_id,
                kd.name AS document_name,
                kc.content,
                kc.metadata,
                ts_rank_cd(to_tsvector('portuguese', coalesce(kc.content, '')), v_or_tsq)::double precision AS l_rank_raw,
                row_number() OVER (
                  ORDER BY ts_rank_cd(to_tsvector('portuguese', coalesce(kc.content, '')), v_or_tsq) DESC
                ) AS l_rank
              FROM public.knowledge_chunks kc
              INNER JOIN public.knowledge_documents kd ON kd.id = kc.document_id
              WHERE kc.tenant_id = p_tenant_id
                AND kd.status IN ('ready', 'processed')
                AND (p_agent_id IS NULL OR kc.agent_id IS NULL OR kc.agent_id = p_agent_id)
                AND (p_instance_id IS NULL OR kc.instance_id IS NULL OR kc.instance_id = p_instance_id)
                AND v_or_tsq IS NOT NULL
                AND to_tsvector('portuguese', coalesce(kc.content, '')) @@ v_or_tsq
              ORDER BY l_rank_raw DESC
              LIMIT GREATEST(match_count * 2, 24)
            ),
            combined AS (
              SELECT
                coalesce(v.id, l.id) AS id,
                coalesce(v.document_id, l.document_id) AS document_id,
                coalesce(v.document_name, l.document_name) AS document_name,
                coalesce(v.content, l.content) AS content,
                coalesce(v.metadata, l.metadata) AS metadata,
                coalesce(v.v_sim, 0.0)::double precision AS vector_similarity,
                coalesce(l.l_rank_raw, 0.0)::double precision AS lexical_score,
                (
                  coalesce(1.0 / (40.0 + v.v_rank), 0.0) +
                  coalesce(1.25 / (40.0 + l.l_rank), 0.0) +
                  (coalesce(v.v_sim, 0.0) * 0.04) +
                  (CASE WHEN p_instance_id IS NOT NULL AND coalesce(v.instance_id, l.instance_id) = p_instance_id THEN 0.012 ELSE 0.0 END)
                )::double precision AS rrf_score
              FROM vector_hits v
              FULL OUTER JOIN lexical_hits l ON v.id = l.id
            )
            SELECT *
            FROM combined
            ORDER BY rrf_score DESC, vector_similarity DESC, lexical_score DESC
            LIMIT match_count;
          END;
          $$;

          GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(vector(384), double precision, integer, uuid, text, uuid) TO anon, authenticated, service_role;
          GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks_hybrid(vector(384), text, uuid, text, double precision, integer, uuid) TO anon, authenticated, service_role;
    `;
}
