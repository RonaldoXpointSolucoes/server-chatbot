-- ==============================================================================
-- MIGRATION: Módulo de Vouchers Digitais Corporativos (Voucher Gestão)
-- Data: 29/08/2026
-- ==============================================================================

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE voucher_status AS ENUM (
        'CRIADO',
        'DISPONIBILIZADO',
        'ENVIADO',
        'VISUALIZADO',
        'VALIDADO',
        'UTILIZADO',
        'CANCELADO',
        'EXPIRADO'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE voucher_distribuicao_tipo AS ENUM (
        'INDIVIDUAL',
        'CORPORATIVO_NOMINAL',
        'CORPORATIVO_TRANSFERIVEL'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA: voucher_empresas_parceiras
CREATE TABLE IF NOT EXISTS public.voucher_empresas_parceiras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    cnpj VARCHAR(20) NOT NULL,
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    saldo_global NUMERIC(12, 2) DEFAULT 0.00,
    limite_vouchers INT DEFAULT 0,
    contato_nome VARCHAR(100),
    contato_whatsapp VARCHAR(20),
    contato_email VARCHAR(100),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELA: voucher_colaboradores
CREATE TABLE IF NOT EXISTS public.voucher_colaboradores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    empresa_id UUID NOT NULL REFERENCES public.voucher_empresas_parceiras(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(20) NOT NULL,
    cpf VARCHAR(14),
    cargo VARCHAR(100),
    departamento VARCHAR(100),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABELA: voucher_campanhas
CREATE TABLE IF NOT EXISTS public.voucher_campanhas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    empresa_id UUID REFERENCES public.voucher_empresas_parceiras(id) ON DELETE SET NULL,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    tipo_distribuicao voucher_distribuicao_tipo DEFAULT 'CORPORATIVO_NOMINAL',
    tipo_desconto VARCHAR(20) DEFAULT 'VALOR_FIXO', -- VALOR_FIXO, PERCENTUAL, ITEM_GRATIS
    valor_desconto NUMERIC(10, 2) DEFAULT 0.00,
    data_inicio TIMESTAMPTZ DEFAULT NOW(),
    data_fim TIMESTAMPTZ NOT NULL,
    horarios_permitidos JSONB DEFAULT '{"dias": [0,1,2,3,4,5,6], "inicio": "00:00", "fim": "23:59"}'::jsonb,
    regras_especificas JSONB DEFAULT '{}'::jsonb,
    restaurante_instance_id UUID,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABELA: voucher_lotes
CREATE TABLE IF NOT EXISTS public.voucher_lotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    campanha_id UUID NOT NULL REFERENCES public.voucher_campanhas(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES public.voucher_empresas_parceiras(id) ON DELETE SET NULL,
    nome VARCHAR(255) NOT NULL,
    quantidade_total INT NOT NULL DEFAULT 0,
    quantidade_utilizados INT NOT NULL DEFAULT 0,
    data_geracao TIMESTAMPTZ DEFAULT NOW(),
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABELA: vouchers
CREATE TABLE IF NOT EXISTS public.vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    lote_id UUID NOT NULL REFERENCES public.voucher_lotes(id) ON DELETE CASCADE,
    campanha_id UUID NOT NULL REFERENCES public.voucher_campanhas(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES public.voucher_empresas_parceiras(id) ON DELETE SET NULL,
    colaborador_id UUID REFERENCES public.voucher_colaboradores(id) ON DELETE SET NULL,
    public_token VARCHAR(32) UNIQUE NOT NULL,
    qr_secret VARCHAR(64) NOT NULL,
    status voucher_status DEFAULT 'CRIADO',
    valor NUMERIC(10, 2) DEFAULT 0.00,
    beneficiario_nome VARCHAR(255),
    beneficiario_whatsapp VARCHAR(20),
    validade_fim TIMESTAMPTZ NOT NULL,
    lock_until TIMESTAMPTZ,
    atendente_id VARCHAR(100),
    data_resgate TIMESTAMPTZ,
    mensagem_envio_status VARCHAR(50) DEFAULT 'PENDENTE',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TABELA DE AUDITORIA IMUTÁVEL: voucher_events
CREATE TABLE IF NOT EXISTS public.voucher_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    voucher_id UUID NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
    status_anterior voucher_status,
    status_novo voucher_status NOT NULL,
    data_hora TIMESTAMPTZ DEFAULT NOW(),
    usuario_responsavel VARCHAR(255) DEFAULT 'SYSTEM',
    ip VARCHAR(45),
    dispositivo VARCHAR(255),
    geo_location JSONB,
    motivo TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ÍNDICES DE ALTA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_vouchers_public_token ON public.vouchers(public_token);
CREATE INDEX IF NOT EXISTS idx_vouchers_status ON public.vouchers(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_tenant_id ON public.vouchers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_campanha_id ON public.vouchers(campanha_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_colaborador_id ON public.vouchers(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_voucher_events_voucher_id ON public.voucher_events(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_colaboradores_empresa_id ON public.voucher_colaboradores(empresa_id);

-- 9. TRIGGER DE AUDITORIA AUTOMÁTICA EM VOUCHER_EVENTS
CREATE OR REPLACE FUNCTION trigger_voucher_status_audit()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.voucher_events (
            tenant_id,
            voucher_id,
            status_anterior,
            status_novo,
            data_hora,
            usuario_responsavel,
            motivo,
            payload
        ) VALUES (
            NEW.tenant_id,
            NEW.id,
            OLD.status,
            NEW.status,
            NOW(),
            COALESCE(NEW.atendente_id, 'SYSTEM'),
            'Status modificado via State Machine',
            jsonb_build_object('lock_until', NEW.lock_until, 'atendente_id', NEW.atendente_id)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voucher_audit ON public.vouchers;
CREATE TRIGGER trg_voucher_audit
AFTER UPDATE OF status ON public.vouchers
FOR EACH ROW
EXECUTE FUNCTION trigger_voucher_status_audit();

-- 10. POLÍTICAS RLS (Row Level Security)
ALTER TABLE public.voucher_empresas_parceiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Voucher Empresas - Acesso por Tenant" ON public.voucher_empresas_parceiras FOR ALL USING (true);
CREATE POLICY "Voucher Colaboradores - Acesso por Tenant" ON public.voucher_colaboradores FOR ALL USING (true);
CREATE POLICY "Voucher Campanhas - Acesso por Tenant" ON public.voucher_campanhas FOR ALL USING (true);
CREATE POLICY "Voucher Lotes - Acesso por Tenant" ON public.voucher_lotes FOR ALL USING (true);
CREATE POLICY "Vouchers - Acesso por Tenant e Publico" ON public.vouchers FOR ALL USING (true);
CREATE POLICY "Voucher Events - Leitura e Auditoria" ON public.voucher_events FOR ALL USING (true);
