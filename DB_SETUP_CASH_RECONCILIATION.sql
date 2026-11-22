-- ============================================================================
-- SCRIPT DE SETUP: MÓDULO CONFERÊNCIA DE CAIXA (MULTI-TENANT / SUPABASE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cash_reconciliation_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Sessões / Fechamentos Diários de Conferência de Caixa
CREATE TABLE IF NOT EXISTS public.cash_reconciliation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference_date DATE NOT NULL,
  shift_label TEXT NOT NULL DEFAULT 'Diário',
  store_name TEXT,
  operator_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'balanced', 'attention', 'shortage', 'surplus')),
  health_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  system_total_cents BIGINT NOT NULL DEFAULT 0,
  real_total_cents BIGINT NOT NULL DEFAULT 0,
  diff_cents BIGINT NOT NULL DEFAULT 0,
  cash_drawer_counted_cents BIGINT NULL,
  cash_sangria_cents BIGINT NOT NULL DEFAULT 0,
  cash_notes TEXT,
  reconciled_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_last_analysis JSONB NULL,
  created_by_email TEXT,
  closed_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS cash_reconciliation_sessions_tenant_date_idx
  ON public.cash_reconciliation_sessions (tenant_id, reference_date DESC, created_at DESC);

DROP TRIGGER IF EXISTS trg_cash_reconciliation_sessions_updated ON public.cash_reconciliation_sessions;
CREATE TRIGGER trg_cash_reconciliation_sessions_updated
  BEFORE UPDATE ON public.cash_reconciliation_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.cash_reconciliation_touch_updated_at();

-- 2. Arquivos Carregados em Cada Sessão
CREATE TABLE IF NOT EXISTS public.cash_reconciliation_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.cash_reconciliation_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  period_start TEXT,
  period_end TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  parse_status TEXT NOT NULL DEFAULT 'ok' CHECK (parse_status IN ('ok', 'warning', 'error')),
  parse_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS cash_reconciliation_files_session_idx
  ON public.cash_reconciliation_files (session_id, tenant_id);

-- 3. Itens Normalizados (PDV, Extratos, Adquirentes) & Estado do Vínculo
CREATE TABLE IF NOT EXISTS public.cash_reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.cash_reconciliation_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_id UUID NULL REFERENCES public.cash_reconciliation_files(id) ON DELETE SET NULL,
  item_key TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('system', 'real', 'audit')),
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT,
  occurred_at TEXT,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  net_amount_cents BIGINT NULL,
  fee_cents BIGINT NOT NULL DEFAULT 0,
  reference_code TEXT,
  description TEXT,
  terminal_name TEXT,
  operator_name TEXT,
  match_status TEXT NOT NULL,
  match_group_id TEXT NULL,
  match_reason TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS cash_reconciliation_items_session_idx
  ON public.cash_reconciliation_items (session_id, tenant_id, side, match_status);

-- 4. Regras Evolutivas da "Fórmula 1" por Empresa
CREATE TABLE IF NOT EXISTS public.cash_reconciliation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('normalize_admin', 'ignore_ofx_memo', 'terminal_affinity', 'engine_setting')),
  pattern TEXT NOT NULL,
  target_value TEXT NOT NULL,
  source_origin TEXT NOT NULL DEFAULT 'user' CHECK (source_origin IN ('default', 'user', 'ai_suggested')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS cash_reconciliation_rules_tenant_idx
  ON public.cash_reconciliation_rules (tenant_id, is_active, rule_type);

DROP TRIGGER IF EXISTS trg_cash_reconciliation_rules_updated ON public.cash_reconciliation_rules;
CREATE TRIGGER trg_cash_reconciliation_rules_updated
  BEFORE UPDATE ON public.cash_reconciliation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.cash_reconciliation_touch_updated_at();

-- 5. Segurança RLS Multi-Tenant
ALTER TABLE public.cash_reconciliation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_reconciliation_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_reconciliation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_sessions_tenant_policy ON public.cash_reconciliation_sessions;
CREATE POLICY cash_sessions_tenant_policy ON public.cash_reconciliation_sessions
  FOR ALL USING (
    auth.role() = 'service_role'
    OR (
      NULLIF(trim(COALESCE(auth.jwt() ->> 'email', '')), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = cash_reconciliation_sessions.tenant_id
            AND lower(c.email) = lower(auth.jwt() ->> 'email')
        )
        OR EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.tenant_id = cash_reconciliation_sessions.tenant_id
            AND lower(tu.email) = lower(auth.jwt() ->> 'email')
        )
      )
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      NULLIF(trim(COALESCE(auth.jwt() ->> 'email', '')), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = cash_reconciliation_sessions.tenant_id
            AND lower(c.email) = lower(auth.jwt() ->> 'email')
        )
        OR EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.tenant_id = cash_reconciliation_sessions.tenant_id
            AND lower(tu.email) = lower(auth.jwt() ->> 'email')
        )
      )
    )
  );

DROP POLICY IF EXISTS cash_files_tenant_policy ON public.cash_reconciliation_files;
CREATE POLICY cash_files_tenant_policy ON public.cash_reconciliation_files
  FOR ALL USING (
    auth.role() = 'service_role'
    OR (
      NULLIF(trim(COALESCE(auth.jwt() ->> 'email', '')), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = cash_reconciliation_files.tenant_id
            AND lower(c.email) = lower(auth.jwt() ->> 'email')
        )
        OR EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.tenant_id = cash_reconciliation_files.tenant_id
            AND lower(tu.email) = lower(auth.jwt() ->> 'email')
        )
      )
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      NULLIF(trim(COALESCE(auth.jwt() ->> 'email', '')), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = cash_reconciliation_files.tenant_id
            AND lower(c.email) = lower(auth.jwt() ->> 'email')
        )
        OR EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.tenant_id = cash_reconciliation_files.tenant_id
            AND lower(tu.email) = lower(auth.jwt() ->> 'email')
        )
      )
    )
  );

DROP POLICY IF EXISTS cash_items_tenant_policy ON public.cash_reconciliation_items;
CREATE POLICY cash_items_tenant_policy ON public.cash_reconciliation_items
  FOR ALL USING (
    auth.role() = 'service_role'
    OR (
      NULLIF(trim(COALESCE(auth.jwt() ->> 'email', '')), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = cash_reconciliation_items.tenant_id
            AND lower(c.email) = lower(auth.jwt() ->> 'email')
        )
        OR EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.tenant_id = cash_reconciliation_items.tenant_id
            AND lower(tu.email) = lower(auth.jwt() ->> 'email')
        )
      )
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      NULLIF(trim(COALESCE(auth.jwt() ->> 'email', '')), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = cash_reconciliation_items.tenant_id
            AND lower(c.email) = lower(auth.jwt() ->> 'email')
        )
        OR EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.tenant_id = cash_reconciliation_items.tenant_id
            AND lower(tu.email) = lower(auth.jwt() ->> 'email')
        )
      )
    )
  );

DROP POLICY IF EXISTS cash_rules_tenant_policy ON public.cash_reconciliation_rules;
CREATE POLICY cash_rules_tenant_policy ON public.cash_reconciliation_rules
  FOR ALL USING (
    auth.role() = 'service_role'
    OR (
      NULLIF(trim(COALESCE(auth.jwt() ->> 'email', '')), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = cash_reconciliation_rules.tenant_id
            AND lower(c.email) = lower(auth.jwt() ->> 'email')
        )
        OR EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.tenant_id = cash_reconciliation_rules.tenant_id
            AND lower(tu.email) = lower(auth.jwt() ->> 'email')
        )
      )
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      NULLIF(trim(COALESCE(auth.jwt() ->> 'email', '')), '') IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = cash_reconciliation_rules.tenant_id
            AND lower(c.email) = lower(auth.jwt() ->> 'email')
        )
        OR EXISTS (
          SELECT 1 FROM public.tenant_users tu
          WHERE tu.tenant_id = cash_reconciliation_rules.tenant_id
            AND lower(tu.email) = lower(auth.jwt() ->> 'email')
        )
      )
    )
  );
