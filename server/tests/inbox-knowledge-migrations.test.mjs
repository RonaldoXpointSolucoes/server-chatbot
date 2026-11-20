import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInboxKnowledgeMigrationSql } from '../src/db/inboxKnowledgeMigrationsSql.js';

test('buildInboxKnowledgeMigrationSql adds per-inbox DDL columns, indexes and runs table', () => {
    const sql = buildInboxKnowledgeMigrationSql();

    assert.match(sql, /ALTER TABLE IF EXISTS public\.knowledge_documents[\s\S]*ADD COLUMN IF NOT EXISTS instance_id uuid NULL/i);
    assert.match(sql, /ALTER TABLE IF EXISTS public\.knowledge_chunks[\s\S]*ADD COLUMN IF NOT EXISTS instance_id uuid NULL/i);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS knowledge_documents_tenant_instance_idx\s+ON public\.knowledge_documents \(tenant_id, instance_id, created_at DESC\)/i);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS knowledge_chunks_tenant_instance_idx\s+ON public\.knowledge_chunks \(tenant_id, instance_id\)/i);

    assert.match(sql, /ALTER TABLE IF EXISTS public\.whatsapp_instances[\s\S]*ADD COLUMN IF NOT EXISTS last_knowledge_analyzed_at timestamp with time zone NULL/i);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS last_knowledge_document_id uuid NULL/i);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS last_knowledge_run_id uuid NULL/i);

    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.inbox_knowledge_runs/i);
    assert.match(sql, /window_start timestamp with time zone NULL/i);
    assert.match(sql, /window_end timestamp with time zone NOT NULL/i);
    assert.match(sql, /discarded_samples jsonb NOT NULL DEFAULT '\[\]'::jsonb/i);
    assert.match(sql, /extracted_behavior_summary text NULL/i);
    assert.match(sql, /result_markdown text NULL/i);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS inbox_knowledge_runs_tenant_instance_idx/i);
});

test('buildInboxKnowledgeMigrationSql drops overloaded RPC signatures and adds p_instance_id scope + priority boost', () => {
    const sql = buildInboxKnowledgeMigrationSql();

    assert.match(sql, /DROP FUNCTION IF EXISTS public\.match_knowledge_chunks\(vector\(384\), double precision, integer, uuid, text\)/i);
    assert.match(sql, /DROP FUNCTION IF EXISTS public\.match_knowledge_chunks_hybrid\(vector\(384\), text, uuid, text, double precision, integer\)/i);

    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.match_knowledge_chunks\([\s\S]*p_instance_id uuid DEFAULT NULL::uuid/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.match_knowledge_chunks_hybrid\([\s\S]*p_instance_id uuid DEFAULT NULL::uuid/i);

    assert.match(sql, /\(p_instance_id IS NULL OR kc\.instance_id IS NULL OR kc\.instance_id = p_instance_id\)/i);
    assert.match(sql, /CASE WHEN p_instance_id IS NOT NULL AND coalesce\(v\.instance_id, l\.instance_id\) = p_instance_id THEN 0\.012 ELSE 0\.0 END/i);

    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.match_knowledge_chunks\(vector\(384\), double precision, integer, uuid, text, uuid\) TO anon, authenticated, service_role/i);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.match_knowledge_chunks_hybrid\(vector\(384\), text, uuid, text, double precision, integer, uuid\) TO anon, authenticated, service_role/i);
});
