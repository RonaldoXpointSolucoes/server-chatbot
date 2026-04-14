-- ==============================================================================
-- Módulo: Flow Builder & Learning Pipeline
-- Descrição: Estruturas de dados essenciais para gerenciar fluxos visuais em 
-- uma arquitetura SaaS multi-tenant.
-- ==============================================================================

-- 1. TABELA DE AGREGADOR DE FLUXOS
CREATE TABLE IF NOT EXISTS public.flows (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL, -- FK virtual ou real para tenants
    name text NOT NULL,
    trigger_rules jsonb DEFAULT '[]'::jsonb, -- Condições ativadoras para este bot (keywords etc)
    active_version_id uuid, -- Qual versão do flow é a de produção agora
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 2. TABELA DE VERSÕES (IMUTÁVEL: para não quebrar chats num fluxo sendo modificado)
CREATE TABLE IF NOT EXISTS public.flow_versions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    flow_id uuid REFERENCES public.flows(id) ON DELETE CASCADE,
    status text DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    nodes jsonb DEFAULT '[]'::jsonb,
    edges jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- Foreign Key circular (adotada depois pois a tabela_versions não existia)
ALTER TABLE public.flows 
ADD CONSTRAINT fk_active_version 
FOREIGN KEY (active_version_id) 
REFERENCES public.flow_versions(id) 
ON DELETE SET NULL;


-- 3. ESTADO DA CONVERSA (MÁQUINA DE ESTADO DO USUARIO)
CREATE TABLE IF NOT EXISTS public.conversation_states (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL,
    remote_jid text NOT NULL, -- Identificador do usuario no wpp_engine
    flow_version_id uuid REFERENCES public.flow_versions(id),
    current_node_id text, -- Em qual bloco visual o cliente parou (útil para blocos 'ask')
    variables jsonb DEFAULT '{}'::jsonb, -- Armazena respostas e sessões coletadas
    status text DEFAULT 'BOT_ACTIVE' CHECK (status IN ('BOT_ACTIVE', 'HANDOFF_HUMAN', 'FINISHED')),
    history jsonb DEFAULT '[]'::jsonb, -- Rastreio das decisões tomadas para auditoria visual
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 4. LEARNING CANDIDATES (APRENDIZADO SUPERVISIONADO)
CREATE TABLE IF NOT EXISTS public.learning_candidates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL,
    original_chat_context text NOT NULL, -- Últimas mensagens q geraram a intervenção humana
    extracted_question text, -- Pergunta gerada pela IA após analisar problema
    extracted_answer text, -- Resposta objetiva q a IA formulou em cima do q o humano disse
    confidence_score float,
    status text DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'DUPLICATED')),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- 5. LOGS DE EXECUÇÃO / AUDITORIA RAG E FLOWS
CREATE TABLE IF NOT EXISTS public.execution_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_state_id uuid REFERENCES public.conversation_states(id) ON DELETE CASCADE,
    node_id text NOT NULL,
    action_taken text,
    duration_ms integer,
    error_details jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- INDEXES PARA OTIMIZAÇÃO (Caminho Crítico do Bot)
CREATE INDEX idx_conv_states_tenant_jid ON public.conversation_states(tenant_id, remote_jid) WHERE status = 'BOT_ACTIVE';
CREATE INDEX idx_learning_status ON public.learning_candidates(tenant_id, status);

-- Enable RLS nos próximos passos...
