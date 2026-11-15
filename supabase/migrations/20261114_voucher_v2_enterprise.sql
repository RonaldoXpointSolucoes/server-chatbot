-- ============================================================================
-- X-POINT / CHATBOOT — ENTERPRISE CORPORATE VOUCHERS v2 MIGRATION
-- Multi-Tenant Strict Isolation, Security Hardening, Monthly Recurring Credits,
-- Discounted Credit Purchase Orders, Atomic Redemptions & Portal B2B Sessions.
-- Idempotent & backward-compatible with live production tables.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. SCHEMA EVOLUTION (IDEMPOTENT ALTER TABLE ADD COLUMN)
-- ----------------------------------------------------------------------------

-- 1.1 Partner Companies (voucher_empresas_parceiras)
ALTER TABLE public.voucher_empresas_parceiras
  ADD COLUMN IF NOT EXISTS senha_hash text,
  ADD COLUMN IF NOT EXISTS credito_mensal_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valor_credito_mensal numeric(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS dia_renovacao_mensal integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS modo_renovacao_mensal text NOT NULL DEFAULT 'RENOVAR_TETO',
  ADD COLUMN IF NOT EXISTS ultima_renovacao_competencia text,
  ADD COLUMN IF NOT EXISTS permitir_compra_creditos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS desconto_compra_percent numeric(5,2) NOT NULL DEFAULT 0.00;

UPDATE public.voucher_empresas_parceiras
SET
  saldo_credito = COALESCE(saldo_credito, saldo_global, 0.00),
  saldo_global = COALESCE(saldo_credito, saldo_global, 0.00),
  credito_total_concedido = COALESCE(credito_total_concedido, saldo_credito, saldo_global, 0.00),
  dia_renovacao_mensal = LEAST(GREATEST(COALESCE(dia_renovacao_mensal, 1), 1), 28),
  modo_renovacao_mensal = CASE
    WHEN COALESCE(modo_renovacao_mensal, 'RENOVAR_TETO') IN ('RENOVAR_TETO', 'ACUMULAR')
      THEN COALESCE(modo_renovacao_mensal, 'RENOVAR_TETO')
    ELSE 'RENOVAR_TETO'
  END;

-- Migrate any plaintext login_senha into bcrypt senha_hash and wipe plaintext
UPDATE public.voucher_empresas_parceiras
SET senha_hash = extensions.crypt(login_senha, extensions.gen_salt('bf', 10))
WHERE COALESCE(login_senha, '') <> ''
  AND senha_hash IS NULL;

UPDATE public.voucher_empresas_parceiras
SET login_senha = NULL
WHERE COALESCE(login_senha, '') <> ''
  AND senha_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_voucher_empresas_tenant_ativo
  ON public.voucher_empresas_parceiras (tenant_id, ativo);
CREATE INDEX IF NOT EXISTS idx_voucher_empresas_login_lower
  ON public.voucher_empresas_parceiras (lower(trim(login_usuario)));

-- 1.2 Campaigns (voucher_campanhas)
ALTER TABLE public.voucher_campanhas
  ADD COLUMN IF NOT EXISTS empresa_nome text,
  ADD COLUMN IF NOT EXISTS tipo_desconto text NOT NULL DEFAULT 'VALOR_FIXO',
  ADD COLUMN IF NOT EXISTS valor_desconto numeric(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS horarios_permitidos jsonb NOT NULL DEFAULT '{"dias":[0,1,2,3,4,5,6],"inicio":"00:00","fim":"23:59"}'::jsonb,
  ADD COLUMN IF NOT EXISTS restaurante_instance_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_voucher_campanhas_tenant_ativo
  ON public.voucher_campanhas (tenant_id, ativo);

-- 1.3 Collaborators (voucher_colaboradores)
ALTER TABLE public.voucher_colaboradores
  ADD COLUMN IF NOT EXISTS cargo text,
  ADD COLUMN IF NOT EXISTS departamento text,
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_voucher_colaboradores_tenant_empresa
  ON public.voucher_colaboradores (tenant_id, empresa_id, ativo);

-- 1.4 Vouchers (vouchers)
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS qr_secret text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  ADD COLUMN IF NOT EXISTS campanha_nome text,
  ADD COLUMN IF NOT EXISTS lock_until timestamptz,
  ADD COLUMN IF NOT EXISTS mensagem_envio_status text DEFAULT 'PENDENTE',
  ADD COLUMN IF NOT EXISTS mensagem_envio_erro text,
  ADD COLUMN IF NOT EXISTS mensagem_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS data_cancelamento timestamptz;

UPDATE public.vouchers
SET qr_secret = encode(extensions.gen_random_bytes(32), 'hex')
WHERE qr_secret IS NULL;

CREATE INDEX IF NOT EXISTS idx_vouchers_tenant_created
  ON public.vouchers (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vouchers_empresa_created
  ON public.vouchers (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vouchers_tenant_status
  ON public.vouchers (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vouchers_public_token_upper
  ON public.vouchers (upper(public_token));

-- 1.5 Ledger Events (voucher_events)
ALTER TABLE public.voucher_events
  ADD COLUMN IF NOT EXISTS empresa_id text,
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS dispositivo text,
  ADD COLUMN IF NOT EXISTS payload jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_voucher_events_tenant_created
  ON public.voucher_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voucher_events_empresa_created
  ON public.voucher_events (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voucher_events_voucher_id
  ON public.voucher_events (voucher_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_events_renewal_key
  ON public.voucher_events ((payload->>'renewal_key'))
  WHERE payload ? 'renewal_key';

-- 1.6 Partner Portal Sessions (opaque server-side session tokens)
CREATE TABLE IF NOT EXISTS public.voucher_portal_sessions (
  token_hash text PRIMARY KEY,
  empresa_id text NOT NULL REFERENCES public.voucher_empresas_parceiras(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voucher_portal_sessions_emp_exp
  ON public.voucher_portal_sessions (empresa_id, expires_at DESC);

-- 1.7 Discounted Credit Purchase Orders (voucher_credit_orders)
CREATE TABLE IF NOT EXISTS public.voucher_credit_orders (
  id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  empresa_id text NOT NULL REFERENCES public.voucher_empresas_parceiras(id) ON DELETE CASCADE,
  valor_credito numeric(10,2) NOT NULL CHECK (valor_credito > 0),
  desconto_percent numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (desconto_percent >= 0 AND desconto_percent < 100),
  valor_desconto numeric(10,2) NOT NULL DEFAULT 0.00,
  valor_pago numeric(10,2) NOT NULL CHECK (valor_pago >= 0),
  forma_pagamento text NOT NULL DEFAULT 'PIX',
  origem text NOT NULL DEFAULT 'PORTAL',
  status text NOT NULL DEFAULT 'PENDENTE',
  solicitado_por text,
  aprovado_por text,
  observacoes text,
  aprovado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voucher_credit_orders_tenant_status
  ON public.voucher_credit_orders (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voucher_credit_orders_empresa
  ON public.voucher_credit_orders (empresa_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. SECURITY HELPERS & MULTI-TENANT ACCESS GUARD
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.voucher_user_has_tenant_access(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_uid uuid;
  v_email text;
  v_role text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN false;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF COALESCE(auth.role(), '') = '' AND session_user IN ('postgres', 'supabase_admin') THEN
    RETURN true;
  END IF;

  IF auth.role() <> 'authenticated' THEN
    RETURN false;
  END IF;

  v_uid := auth.uid();
  v_email := lower(trim(COALESCE(auth.email(), '')));

  IF v_email IN ('ronaldo.xpointsolucoes@gmail.com', 'xpointsolucoes@gmail.com') THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = p_tenant_id
      AND (
        c.id = v_uid
        OR (v_email <> '' AND lower(trim(COALESCE(c.email, ''))) = v_email)
        OR (
          v_email <> ''
          AND c.settings IS NOT NULL
          AND jsonb_typeof(c.settings->'allowed_google_emails') = 'array'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(c.settings->'allowed_google_emails') AS em(val)
            WHERE lower(trim(em.val)) = v_email
          )
        )
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.companies c_target
    JOIN public.companies c_own ON c_own.economic_group_id = c_target.economic_group_id
    WHERE c_target.id = p_tenant_id
      AND c_target.economic_group_id IS NOT NULL
      AND (
        c_own.id = v_uid
        OR (v_email <> '' AND lower(trim(COALESCE(c_own.email, ''))) = v_email)
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE (
      tu.user_id = v_uid
      OR (v_email <> '' AND lower(trim(COALESCE(tu.email, ''))) = v_email)
    )
    AND (
      tu.tenant_id = p_tenant_id
      OR (
        tu.allowed_companies IS NOT NULL
        AND jsonb_typeof(tu.allowed_companies) = 'array'
        AND (
          tu.allowed_companies @> to_jsonb(p_tenant_id::text)
          OR tu.allowed_companies @> to_jsonb(p_tenant_id)
        )
      )
    )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_user_has_tenant_access_text(p_tenant_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
BEGIN
  IF p_tenant_id IS NULL OR trim(p_tenant_id) = '' THEN
    RETURN false;
  END IF;
  RETURN public.voucher_user_has_tenant_access(p_tenant_id::uuid);
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_assert_merchant_access(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID obrigatório para esta operação.';
  END IF;
  IF NOT public.voucher_user_has_tenant_access(p_tenant_id) THEN
    RAISE EXCEPTION 'Acesso negado ao tenant %.', p_tenant_id;
  END IF;
END;
$fn$;

-- Helper: returns sanitized partner JSON without login_senha / senha_hash
CREATE OR REPLACE FUNCTION public.voucher_sanitize_partner(p_row public.voucher_empresas_parceiras)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT to_jsonb(p_row) - 'login_senha' - 'senha_hash' || jsonb_build_object(
    'tem_senha_configurada', (COALESCE(p_row.senha_hash, '') <> '')
  );
$fn$;

-- Helper: returns public store branding from companies + settings
CREATE OR REPLACE FUNCTION public.voucher_get_store_profile(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'id', c.id,
      'name', COALESCE(NULLIF(trim(c.settings->>'businessName'), ''), NULLIF(trim(c.trade_name), ''), c.name),
      'company_name', c.name,
      'trade_name', c.trade_name,
      'endereco', COALESCE(
        NULLIF(trim(c.settings->>'endereco'), ''),
        NULLIF(trim(concat_ws(', ', NULLIF(c.settings->>'street', ''), NULLIF(c.settings->>'number', ''), NULLIF(c.settings->>'neighborhood', ''), NULLIF(c.settings->>'city', ''))), ''),
        ''
      ),
      'link_cardapio', COALESCE(NULLIF(trim(c.settings->>'link_cardapio'), ''), NULLIF(trim(c.settings->>'menuLink'), ''), ''),
      'instagram', COALESCE(NULLIF(trim(c.settings->>'instagram'), ''), ''),
      'whatsapp', COALESCE(NULLIF(trim(c.settings->>'whatsapp'), ''), NULLIF(trim(c.settings->>'phone'), ''), ''),
      'logo_url', COALESCE(NULLIF(trim(c.settings->>'logoUrl'), ''), NULLIF(trim(c.settings->>'avatar'), ''), ''),
      'voucher_default_instance_id', c.settings->>'voucher_default_instance_id',
      'has_terminal_pin', (COALESCE(trim(c.settings->>'voucher_terminal_pin'), '') <> '')
    )
    FROM public.companies c
    WHERE c.id = p_tenant_id
  ), jsonb_build_object('id', p_tenant_id, 'name', 'Estabelecimento', 'endereco', '', 'link_cardapio', '', 'instagram', '', 'whatsapp', ''));
$fn$;

-- ----------------------------------------------------------------------------
-- 3. LOCK DOWN RLS & COLUMN PERMISSIONS
-- ----------------------------------------------------------------------------

-- Drop insecure legacy wildcard policies
DROP POLICY IF EXISTS "Permitir tudo em voucher_empresas_parceiras" ON public.voucher_empresas_parceiras;
DROP POLICY IF EXISTS "Permitir tudo em voucher_campanhas" ON public.voucher_campanhas;
DROP POLICY IF EXISTS "Permitir tudo em voucher_colaboradores" ON public.voucher_colaboradores;
DROP POLICY IF EXISTS "Permitir tudo em vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Permitir tudo em voucher_events" ON public.voucher_events;

DROP POLICY IF EXISTS "voucher_empresas_tenant_auth" ON public.voucher_empresas_parceiras;
DROP POLICY IF EXISTS "voucher_campanhas_tenant_auth" ON public.voucher_campanhas;
DROP POLICY IF EXISTS "voucher_colaboradores_tenant_auth" ON public.voucher_colaboradores;
DROP POLICY IF EXISTS "vouchers_tenant_auth" ON public.vouchers;
DROP POLICY IF EXISTS "voucher_events_tenant_auth" ON public.voucher_events;
DROP POLICY IF EXISTS "voucher_credit_orders_tenant_auth" ON public.voucher_credit_orders;

ALTER TABLE public.voucher_empresas_parceiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_credit_orders ENABLE ROW LEVEL SECURITY;

-- Close ALL direct table privileges from anon
REVOKE ALL ON public.voucher_empresas_parceiras FROM anon;
REVOKE ALL ON public.voucher_campanhas FROM anon;
REVOKE ALL ON public.voucher_colaboradores FROM anon;
REVOKE ALL ON public.vouchers FROM anon;
REVOKE ALL ON public.voucher_events FROM anon;
REVOKE ALL ON public.voucher_portal_sessions FROM anon, authenticated;
REVOKE ALL ON public.voucher_credit_orders FROM anon;

-- Ensure authenticated can access tables ONLY within tenant AND NEVER password columns
REVOKE ALL ON public.voucher_empresas_parceiras FROM authenticated;
GRANT SELECT (
  id, tenant_id, razao_social, nome_fantasia, cnpj, contato_nome, contato_whatsapp,
  email_empresa, login_usuario, saldo_global, saldo_credito, credito_total_concedido,
  credito_inicio, credito_fim, ativo, limite_vouchers,
  credito_mensal_ativo, valor_credito_mensal, dia_renovacao_mensal, modo_renovacao_mensal,
  ultima_renovacao_competencia, permitir_compra_creditos, desconto_compra_percent,
  cep, logradouro, numero, complemento, bairro, municipio, uf,
  telefone_empresa, atividade_principal, natureza_juridica, data_abertura_cnpj, status_cnpj,
  created_at, updated_at
) ON public.voucher_empresas_parceiras TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_campanhas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voucher_colaboradores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;
GRANT SELECT, INSERT ON public.voucher_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.voucher_credit_orders TO authenticated;

CREATE POLICY "voucher_empresas_tenant_auth" ON public.voucher_empresas_parceiras
  FOR ALL TO authenticated
  USING (public.voucher_user_has_tenant_access(tenant_id))
  WITH CHECK (public.voucher_user_has_tenant_access(tenant_id));

CREATE POLICY "voucher_campanhas_tenant_auth" ON public.voucher_campanhas
  FOR ALL TO authenticated
  USING (public.voucher_user_has_tenant_access(tenant_id))
  WITH CHECK (public.voucher_user_has_tenant_access(tenant_id));

CREATE POLICY "voucher_colaboradores_tenant_auth" ON public.voucher_colaboradores
  FOR ALL TO authenticated
  USING (public.voucher_user_has_tenant_access(tenant_id))
  WITH CHECK (public.voucher_user_has_tenant_access(tenant_id));

CREATE POLICY "vouchers_tenant_auth" ON public.vouchers
  FOR ALL TO authenticated
  USING (public.voucher_user_has_tenant_access(tenant_id))
  WITH CHECK (public.voucher_user_has_tenant_access(tenant_id));

CREATE POLICY "voucher_events_tenant_auth" ON public.voucher_events
  FOR ALL TO authenticated
  USING (public.voucher_user_has_tenant_access_text(tenant_id))
  WITH CHECK (public.voucher_user_has_tenant_access_text(tenant_id));

CREATE POLICY "voucher_credit_orders_tenant_auth" ON public.voucher_credit_orders
  FOR ALL TO authenticated
  USING (public.voucher_user_has_tenant_access(tenant_id))
  WITH CHECK (public.voucher_user_has_tenant_access(tenant_id));

-- ----------------------------------------------------------------------------
-- 4. INTERNAL PORTAL SESSION & MONTHLY RENEWAL HELPERS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._voucher_apply_renewal_for_partner(
  p_empresa_id text,
  p_force_day boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
  v_now_sp timestamp;
  v_comp text;
  v_day int;
  v_target_day int;
  v_saldo_atual numeric(10,2);
  v_saldo_novo numeric(10,2);
  v_credito_added numeric(10,2);
  v_renewal_key text;
  v_event_id text;
BEGIN
  SELECT * INTO v_emp
  FROM public.voucher_empresas_parceiras
  WHERE id = p_empresa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'NOT_FOUND');
  END IF;

  IF NOT COALESCE(v_emp.ativo, false)
     OR NOT COALESCE(v_emp.credito_mensal_ativo, false)
     OR COALESCE(v_emp.valor_credito_mensal, 0) <= 0 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'DISABLED');
  END IF;

  v_now_sp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_comp := to_char(v_now_sp, 'YYYY-MM');
  v_day := EXTRACT(DAY FROM v_now_sp)::int;
  v_target_day := LEAST(GREATEST(COALESCE(v_emp.dia_renovacao_mensal, 1), 1), 28);

  IF COALESCE(v_emp.ultima_renovacao_competencia, '') = v_comp THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'ALREADY_RENEWED_THIS_MONTH', 'competencia', v_comp);
  END IF;

  IF NOT p_force_day AND v_day < v_target_day THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'BEFORE_RENEWAL_DAY', 'target_day', v_target_day, 'current_day', v_day);
  END IF;

  v_renewal_key := v_emp.id || ':' || v_comp;
  IF EXISTS (
    SELECT 1 FROM public.voucher_events WHERE (payload->>'renewal_key') = v_renewal_key
  ) THEN
    UPDATE public.voucher_empresas_parceiras
    SET ultima_renovacao_competencia = v_comp, updated_at = now()
    WHERE id = v_emp.id;
    RETURN jsonb_build_object('applied', false, 'reason', 'IDEMPOTENT_EVENT_EXISTS', 'competencia', v_comp);
  END IF;

  v_saldo_atual := GREATEST(COALESCE(v_emp.saldo_credito, v_emp.saldo_global, 0.00), 0.00);

  IF COALESCE(v_emp.modo_renovacao_mensal, 'RENOVAR_TETO') = 'ACUMULAR' THEN
    v_credito_added := v_emp.valor_credito_mensal;
    v_saldo_novo := v_saldo_atual + v_credito_added;
  ELSE
    -- RENOVAR_TETO: repõe saldo apenas até o teto mensal se estiver abaixo
    IF v_saldo_atual >= v_emp.valor_credito_mensal THEN
      v_credito_added := 0.00;
      v_saldo_novo := v_saldo_atual;
    ELSE
      v_credito_added := v_emp.valor_credito_mensal - v_saldo_atual;
      v_saldo_novo := v_emp.valor_credito_mensal;
    END IF;
  END IF;

  UPDATE public.voucher_empresas_parceiras
  SET
    saldo_credito = v_saldo_novo,
    saldo_global = v_saldo_novo,
    credito_total_concedido = COALESCE(credito_total_concedido, 0) + v_credito_added,
    ultima_renovacao_competencia = v_comp,
    updated_at = now()
  WHERE id = v_emp.id;

  v_event_id := 'ev-' || substr(md5(random()::text || clock_timestamp()::text || v_emp.id), 1, 10);
  INSERT INTO public.voucher_events (
    id, tenant_id, voucher_id, voucher_token, tipo_operacao, valor,
    beneficiario_nome, empresa_origem, empresa_id, status_anterior, status_novo,
    data_hora, usuario_responsavel, motivo, payload
  ) VALUES (
    v_event_id,
    v_emp.tenant_id::text,
    NULL,
    NULL,
    'RENOVACAO_MENSAL',
    v_credito_added,
    COALESCE(v_emp.nome_fantasia, v_emp.razao_social),
    COALESCE(v_emp.nome_fantasia, v_emp.razao_social),
    v_emp.id,
    'COMPETENCIA_' || v_comp,
    'CREDITO_RENOVADO',
    now(),
    'Motor Recorrente Mensal',
    format('Renovação mensal %s (%s): R$ %s adicionados (saldo final R$ %s)',
      v_comp, COALESCE(v_emp.modo_renovacao_mensal, 'RENOVAR_TETO'),
      to_char(v_credito_added, 'FM999999990.00'), to_char(v_saldo_novo, 'FM999999990.00')),
    jsonb_build_object(
      'renewal_key', v_renewal_key,
      'competencia', v_comp,
      'modo', COALESCE(v_emp.modo_renovacao_mensal, 'RENOVAR_TETO'),
      'teto_mensal', v_emp.valor_credito_mensal,
      'saldo_anterior', v_saldo_atual,
      'saldo_novo', v_saldo_novo,
      'credito_adicionado', v_credito_added
    )
  );

  RETURN jsonb_build_object(
    'applied', true,
    'empresa_id', v_emp.id,
    'competencia', v_comp,
    'credito_adicionado', v_credito_added,
    'saldo_novo', v_saldo_novo
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_process_monthly_renewals(
  p_tenant_id uuid DEFAULT NULL,
  p_empresa_id text DEFAULT NULL,
  p_force_day boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_rec RECORD;
  v_results jsonb := '[]'::jsonb;
  v_single jsonb;
  v_applied_count int := 0;
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF p_tenant_id IS NOT NULL THEN
      PERFORM public.voucher_assert_merchant_access(p_tenant_id);
    ELSE
      RAISE EXCEPTION 'Tenant ID obrigatório ao acionar renovação pelo painel.';
    END IF;
  END IF;

  FOR v_rec IN
    SELECT id
    FROM public.voucher_empresas_parceiras
    WHERE COALESCE(ativo, false) = true
      AND COALESCE(credito_mensal_ativo, false) = true
      AND COALESCE(valor_credito_mensal, 0) > 0
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      AND (p_empresa_id IS NULL OR id = p_empresa_id)
  LOOP
    v_single := public._voucher_apply_renewal_for_partner(v_rec.id, p_force_day);
    IF COALESCE((v_single->>'applied')::boolean, false) THEN
      v_applied_count := v_applied_count + 1;
      v_results := v_results || v_single;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'applied_count', v_applied_count,
    'details', v_results
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_resolve_portal_session(p_portal_token text)
RETURNS public.voucher_empresas_parceiras
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_hash text;
  v_sess public.voucher_portal_sessions%ROWTYPE;
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
BEGIN
  IF COALESCE(trim(p_portal_token), '') = '' THEN
    RAISE EXCEPTION 'Sessão do Portal B2B não informada. Faça login novamente.';
  END IF;

  v_hash := encode(extensions.digest(trim(p_portal_token), 'sha256'), 'hex');

  SELECT * INTO v_sess
  FROM public.voucher_portal_sessions
  WHERE token_hash = v_hash
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão do Portal B2B expirada ou inválida. Faça login novamente.';
  END IF;

  SELECT * INTO v_emp
  FROM public.voucher_empresas_parceiras
  WHERE id = v_sess.empresa_id
    AND tenant_id = v_sess.tenant_id;

  IF NOT FOUND OR NOT COALESCE(v_emp.ativo, false) THEN
    RAISE EXCEPTION 'Conta parceira inativa ou removida. Contate o estabelecimento.';
  END IF;

  UPDATE public.voucher_portal_sessions
  SET last_seen_at = now()
  WHERE token_hash = v_hash;

  RETURN v_emp;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 5. PARTNER B2B PORTAL RPCs
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.voucher_portal_login(
  p_usuario text,
  p_senha text,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_login text;
  v_digits text;
  v_rec public.voucher_empresas_parceiras%ROWTYPE;
  v_matches jsonb := '[]'::jsonb;
  v_matched_emp public.voucher_empresas_parceiras%ROWTYPE;
  v_match_count int := 0;
  v_store jsonb;
  v_raw_token text;
  v_hash text;
  v_exp timestamptz;
BEGIN
  v_login := lower(trim(COALESCE(p_usuario, '')));
  v_digits := regexp_replace(v_login, '\D', '', 'g');

  IF v_login = '' OR COALESCE(p_senha, '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe usuário e senha.');
  END IF;

  FOR v_rec IN
    SELECT e.*
    FROM public.voucher_empresas_parceiras e
    WHERE (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
      AND (
        lower(trim(COALESCE(e.login_usuario, ''))) = v_login
        OR lower(trim(COALESCE(e.email_empresa, ''))) = v_login
        OR (v_digits <> '' AND length(v_digits) >= 8 AND regexp_replace(COALESCE(e.cnpj, ''), '\D', '', 'g') = v_digits)
      )
    ORDER BY e.updated_at DESC NULLS LAST, e.created_at DESC
  LOOP
    -- Check hashed password (or migrate legacy plaintext if still present)
    IF COALESCE(v_rec.senha_hash, '') <> '' THEN
      IF extensions.crypt(p_senha, v_rec.senha_hash) <> v_rec.senha_hash THEN
        CONTINUE;
      END IF;
    ELSIF COALESCE(v_rec.login_senha, '') <> '' AND v_rec.login_senha = p_senha THEN
      UPDATE public.voucher_empresas_parceiras
      SET senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
          login_senha = NULL
      WHERE id = v_rec.id;
    ELSE
      CONTINUE;
    END IF;

    IF NOT COALESCE(v_rec.ativo, false) THEN
      CONTINUE;
    END IF;

    v_match_count := v_match_count + 1;
    v_matched_emp := v_rec;
    v_store := public.voucher_get_store_profile(v_rec.tenant_id);
    v_matches := v_matches || jsonb_build_object(
      'empresa_id', v_rec.id,
      'tenant_id', v_rec.tenant_id,
      'razao_social', v_rec.razao_social,
      'nome_fantasia', v_rec.nome_fantasia,
      'store_name', COALESCE(v_store->>'name', 'Estabelecimento')
    );
  END LOOP;

  IF v_match_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário ou senha incorretos, ou empresa parceira suspensa.');
  END IF;

  IF v_match_count > 1 AND p_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'MULTIPLE_STORES',
      'options', v_matches
    );
  END IF;

  -- Trigger monthly allowance check idempotently upon login
  PERFORM public._voucher_apply_renewal_for_partner(v_matched_emp.id, false);
  SELECT * INTO v_matched_emp FROM public.voucher_empresas_parceiras WHERE id = v_matched_emp.id;

  -- Issue opaque random 32-byte token (stored hashed server-side)
  DELETE FROM public.voucher_portal_sessions
  WHERE empresa_id = v_matched_emp.id
    AND expires_at < now();

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
  v_exp := now() + interval '24 hours';

  INSERT INTO public.voucher_portal_sessions (token_hash, empresa_id, tenant_id, expires_at)
  VALUES (v_hash, v_matched_emp.id, v_matched_emp.tenant_id, v_exp);

  RETURN jsonb_build_object(
    'success', true,
    'portal_token', v_raw_token,
    'expires_at', v_exp,
    'empresa', public.voucher_sanitize_partner(v_matched_emp),
    'restaurante', public.voucher_get_store_profile(v_matched_emp.tenant_id)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_portal_logout(p_portal_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
BEGIN
  IF COALESCE(trim(p_portal_token), '') <> '' THEN
    DELETE FROM public.voucher_portal_sessions
    WHERE token_hash = encode(extensions.digest(trim(p_portal_token), 'sha256'), 'hex');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_portal_get_dashboard(p_portal_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
BEGIN
  v_emp := public.voucher_resolve_portal_session(p_portal_token);
  PERFORM public._voucher_apply_renewal_for_partner(v_emp.id, false);
  SELECT * INTO v_emp FROM public.voucher_empresas_parceiras WHERE id = v_emp.id;

  RETURN jsonb_build_object(
    'success', true,
    'empresa', public.voucher_sanitize_partner(v_emp),
    'restaurante', public.voucher_get_store_profile(v_emp.tenant_id),
    'vouchers', COALESCE((
      SELECT jsonb_agg(to_jsonb(v) - 'qr_secret' ORDER BY v.created_at DESC)
      FROM public.vouchers v
      WHERE v.empresa_id = v_emp.id AND v.tenant_id = v_emp.tenant_id
    ), '[]'::jsonb),
    'colaboradores', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.nome ASC)
      FROM public.voucher_colaboradores c
      WHERE c.empresa_id = v_emp.id AND c.tenant_id = v_emp.tenant_id
    ), '[]'::jsonb),
    'credit_orders', COALESCE((
      SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC)
      FROM public.voucher_credit_orders o
      WHERE o.empresa_id = v_emp.id AND o.tenant_id = v_emp.tenant_id
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(to_jsonb(ev) ORDER BY ev.created_at DESC)
      FROM (
        SELECT *
        FROM public.voucher_events e
        WHERE e.tenant_id = v_emp.tenant_id::text
          AND (
            e.empresa_id = v_emp.id
            OR EXISTS (
              SELECT 1 FROM public.vouchers vx
              WHERE vx.id = e.voucher_id AND vx.empresa_id = v_emp.id
            )
          )
        ORDER BY e.created_at DESC NULLS LAST
        LIMIT 120
      ) ev
    ), '[]'::jsonb)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_portal_save_colaborador(
  p_portal_token text,
  p_id text DEFAULT NULL,
  p_nome text DEFAULT NULL,
  p_whatsapp text DEFAULT NULL,
  p_cpf text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_cargo text DEFAULT NULL,
  p_departamento text DEFAULT NULL,
  p_ativo boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
  v_id text;
  v_row public.voucher_colaboradores%ROWTYPE;
BEGIN
  v_emp := public.voucher_resolve_portal_session(p_portal_token);

  IF COALESCE(trim(p_nome), '') = '' THEN
    RAISE EXCEPTION 'Nome do colaborador é obrigatório.';
  END IF;

  IF COALESCE(trim(p_id), '') <> '' THEN
    UPDATE public.voucher_colaboradores
    SET
      nome = trim(p_nome),
      whatsapp = NULLIF(regexp_replace(COALESCE(p_whatsapp, ''), '\D', '', 'g'), ''),
      cpf = NULLIF(trim(COALESCE(p_cpf, '')), ''),
      email = NULLIF(lower(trim(COALESCE(p_email, ''))), ''),
      cargo = NULLIF(trim(COALESCE(p_cargo, '')), ''),
      departamento = NULLIF(trim(COALESCE(p_departamento, '')), ''),
      ativo = COALESCE(p_ativo, true),
      updated_at = now()
    WHERE id = p_id
      AND empresa_id = v_emp.id
      AND tenant_id = v_emp.tenant_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Colaborador não encontrado para esta empresa.';
    END IF;
  ELSE
    v_id := 'col-' || substr(md5(random()::text || clock_timestamp()::text || v_emp.id), 1, 10);
    INSERT INTO public.voucher_colaboradores (
      id, tenant_id, empresa_id, nome, cpf, whatsapp, email, cargo, departamento, ativo, created_at, updated_at
    ) VALUES (
      v_id, v_emp.tenant_id, v_emp.id, trim(p_nome),
      NULLIF(trim(COALESCE(p_cpf, '')), ''),
      NULLIF(regexp_replace(COALESCE(p_whatsapp, ''), '\D', '', 'g'), ''),
      NULLIF(lower(trim(COALESCE(p_email, ''))), ''),
      NULLIF(trim(COALESCE(p_cargo, '')), ''),
      NULLIF(trim(COALESCE(p_departamento, '')), ''),
      COALESCE(p_ativo, true),
      now(), now()
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('success', true, 'colaborador', to_jsonb(v_row));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_portal_delete_colaborador(
  p_portal_token text,
  p_colaborador_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
BEGIN
  v_emp := public.voucher_resolve_portal_session(p_portal_token);
  DELETE FROM public.voucher_colaboradores
  WHERE id = p_colaborador_id
    AND empresa_id = v_emp.id
    AND tenant_id = v_emp.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Colaborador não encontrado.';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_portal_issue_vouchers(
  p_portal_token text,
  p_items jsonb,
  p_validade_fim timestamptz,
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_sess_emp public.voucher_empresas_parceiras%ROWTYPE;
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
  v_store jsonb;
  v_prefix text;
  v_item jsonb;
  v_count int;
  v_existing_count int;
  v_total numeric(10,2) := 0;
  v_val numeric(10,2);
  v_saldo_atual numeric(10,2);
  v_saldo_novo numeric(10,2);
  v_vch_id text;
  v_token text;
  v_ev_id text;
  v_created jsonb := '[]'::jsonb;
  v_vch public.vouchers%ROWTYPE;
BEGIN
  v_sess_emp := public.voucher_resolve_portal_session(p_portal_token);

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Lista de beneficiários inválida.';
  END IF;

  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 200 THEN
    RAISE EXCEPTION 'Informe entre 1 e 200 vouchers por lote.';
  END IF;

  -- Lock partner row atomically
  SELECT * INTO v_emp
  FROM public.voucher_empresas_parceiras
  WHERE id = v_sess_emp.id
  FOR UPDATE;

  IF NOT FOUND OR NOT COALESCE(v_emp.ativo, false) THEN
    RAISE EXCEPTION 'Empresa parceira suspensa ou inexistente.';
  END IF;

  IF v_emp.credito_fim IS NOT NULL AND v_emp.credito_fim < now() THEN
    RAISE EXCEPTION 'O prazo de vigência dos créditos desta empresa expirou em %.', to_char(v_emp.credito_fim AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
  END IF;

  IF p_validade_fim IS NULL OR p_validade_fim <= now() THEN
    RAISE EXCEPTION 'A data de validade dos vouchers deve ser futura.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_val := COALESCE((v_item->>'valor')::numeric, 0);
    IF v_val <= 0 THEN
      RAISE EXCEPTION 'Cada voucher deve possuir valor maior que R$ 0,00.';
    END IF;
    IF COALESCE(trim(v_item->>'beneficiario_nome'), '') = '' THEN
      RAISE EXCEPTION 'Todo voucher emitido deve informar o nome do colaborador/beneficiário.';
    END IF;
    v_total := v_total + v_val;
  END LOOP;

  v_saldo_atual := GREATEST(COALESCE(v_emp.saldo_credito, v_emp.saldo_global, 0.00), 0.00);
  IF v_saldo_atual < v_total THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponível: R$ %, necessário: R$ %.',
      to_char(v_saldo_atual, 'FM999999990.00'), to_char(v_total, 'FM999999990.00');
  END IF;

  IF COALESCE(v_emp.limite_vouchers, 0) > 0 THEN
    SELECT count(*)::int INTO v_existing_count
    FROM public.vouchers
    WHERE empresa_id = v_emp.id
      AND tenant_id = v_emp.tenant_id
      AND status <> 'CANCELADO';
    IF (v_existing_count + v_count) > v_emp.limite_vouchers THEN
      RAISE EXCEPTION 'Limite de % vouchers contratado seria excedido (atual: %, solicitados: %).',
        v_emp.limite_vouchers, v_existing_count, v_count;
    END IF;
  END IF;

  v_saldo_novo := v_saldo_atual - v_total;
  UPDATE public.voucher_empresas_parceiras
  SET
    saldo_credito = v_saldo_novo,
    saldo_global = v_saldo_novo,
    updated_at = now()
  WHERE id = v_emp.id;

  v_store := public.voucher_get_store_profile(v_emp.tenant_id);
  v_prefix := upper(regexp_replace(COALESCE(v_store->>'name', 'VCH'), '[^A-Za-z0-9]', '', 'g'));
  IF length(v_prefix) < 2 THEN v_prefix := 'VCH'; END IF;
  v_prefix := substr(v_prefix, 1, 6);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_val := (v_item->>'valor')::numeric;
    v_vch_id := 'vch-' || substr(md5(random()::text || clock_timestamp()::text || v_emp.id), 1, 10);
    v_token := v_prefix || '-' || upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8));

    INSERT INTO public.vouchers (
      id, tenant_id, empresa_id, campanha_id, colaborador_id, public_token,
      valor, status, beneficiario_nome, beneficiario_whatsapp,
      empresa_nome, empresa_razao_social, observacoes, validade_fim,
      mensagem_envio_status, created_at, updated_at
    ) VALUES (
      v_vch_id,
      v_emp.tenant_id,
      v_emp.id,
      NULLIF(trim(COALESCE(v_item->>'campanha_id', '')), ''),
      NULLIF(trim(COALESCE(v_item->>'colaborador_id', '')), ''),
      v_token,
      v_val,
      'CRIADO',
      trim(v_item->>'beneficiario_nome'),
      NULLIF(regexp_replace(COALESCE(v_item->>'beneficiario_whatsapp', ''), '\D', '', 'g'), ''),
      COALESCE(v_emp.nome_fantasia, v_emp.razao_social),
      v_emp.razao_social,
      COALESCE(NULLIF(trim(COALESCE(v_item->>'observacoes', '')), ''), NULLIF(trim(COALESCE(p_observacoes, '')), '')),
      p_validade_fim,
      CASE WHEN regexp_replace(COALESCE(v_item->>'beneficiario_whatsapp', ''), '\D', '', 'g') <> '' THEN 'PENDENTE' ELSE 'SEM_TELEFONE' END,
      now(),
      now()
    )
    RETURNING * INTO v_vch;

    v_ev_id := 'ev-' || substr(md5(random()::text || clock_timestamp()::text || v_vch_id), 1, 10);
    INSERT INTO public.voucher_events (
      id, tenant_id, voucher_id, voucher_token, tipo_operacao, valor,
      beneficiario_nome, empresa_origem, empresa_id, status_anterior, status_novo,
      data_hora, usuario_responsavel, motivo, payload
    ) VALUES (
      v_ev_id, v_emp.tenant_id::text, v_vch.id, v_vch.public_token, 'EMITIDO_PORTAL', v_vch.valor,
      v_vch.beneficiario_nome, COALESCE(v_emp.nome_fantasia, v_emp.razao_social), v_emp.id,
      NULL, 'CRIADO', now(), 'Portal B2B (' || COALESCE(v_emp.login_usuario, v_emp.razao_social) || ')',
      COALESCE(v_vch.observacoes, 'Emissão pelo Portal B2B'),
      jsonb_build_object('saldo_restante', v_saldo_novo)
    );

    v_created := v_created || (to_jsonb(v_vch) - 'qr_secret');
  END LOOP;

  SELECT * INTO v_emp FROM public.voucher_empresas_parceiras WHERE id = v_emp.id;

  RETURN jsonb_build_object(
    'success', true,
    'vouchers', v_created,
    'total_debitado', v_total,
    'saldo_novo', v_saldo_novo,
    'empresa', public.voucher_sanitize_partner(v_emp)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_portal_cancel_voucher(
  p_portal_token text,
  p_voucher_id text,
  p_motivo text DEFAULT 'Cancelado pelo Portal B2B'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_sess_emp public.voucher_empresas_parceiras%ROWTYPE;
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
  v_vch public.vouchers%ROWTYPE;
  v_saldo_ant numeric(10,2);
  v_saldo_novo numeric(10,2);
  v_ev_id text;
BEGIN
  v_sess_emp := public.voucher_resolve_portal_session(p_portal_token);

  SELECT * INTO v_vch
  FROM public.vouchers
  WHERE id = p_voucher_id
    AND empresa_id = v_sess_emp.id
    AND tenant_id = v_sess_emp.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher não encontrado para esta empresa.';
  END IF;

  IF v_vch.status = 'RESGATADO' THEN
    RAISE EXCEPTION 'Este voucher já foi resgatado no caixa e não pode ser cancelado.';
  END IF;
  IF v_vch.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'Este voucher já está cancelado.';
  END IF;

  SELECT * INTO v_emp
  FROM public.voucher_empresas_parceiras
  WHERE id = v_sess_emp.id
  FOR UPDATE;

  v_saldo_ant := COALESCE(v_emp.saldo_credito, v_emp.saldo_global, 0.00);
  v_saldo_novo := v_saldo_ant + v_vch.valor;

  UPDATE public.vouchers
  SET
    status = 'CANCELADO',
    data_cancelamento = now(),
    lock_until = NULL,
    updated_at = now()
  WHERE id = v_vch.id
  RETURNING * INTO v_vch;

  UPDATE public.voucher_empresas_parceiras
  SET
    saldo_credito = v_saldo_novo,
    saldo_global = v_saldo_novo,
    updated_at = now()
  WHERE id = v_emp.id
  RETURNING * INTO v_emp;

  v_ev_id := 'ev-' || substr(md5(random()::text || clock_timestamp()::text || v_vch.id), 1, 10);
  INSERT INTO public.voucher_events (
    id, tenant_id, voucher_id, voucher_token, tipo_operacao, valor,
    beneficiario_nome, empresa_origem, empresa_id, status_anterior, status_novo,
    data_hora, usuario_responsavel, motivo, payload
  ) VALUES (
    v_ev_id, v_emp.tenant_id::text, v_vch.id, v_vch.public_token, 'ESTORNADO_CANCELAMENTO', v_vch.valor,
    v_vch.beneficiario_nome, COALESCE(v_emp.nome_fantasia, v_emp.razao_social), v_emp.id,
    'CRIADO', 'CANCELADO', now(), 'Portal B2B',
    COALESCE(NULLIF(trim(p_motivo), ''), 'Voucher cancelado e estornado ao saldo'),
    jsonb_build_object('saldo_anterior', v_saldo_ant, 'saldo_novo', v_saldo_novo)
  );

  RETURN jsonb_build_object(
    'success', true,
    'voucher', to_jsonb(v_vch) - 'qr_secret',
    'saldo_estornado', v_vch.valor,
    'saldo_novo', v_saldo_novo,
    'empresa', public.voucher_sanitize_partner(v_emp)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_portal_request_credit_order(
  p_portal_token text,
  p_valor_credito numeric,
  p_forma_pagamento text DEFAULT 'PIX',
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
  v_desc_pct numeric(5,2);
  v_desc_val numeric(10,2);
  v_pago numeric(10,2);
  v_order_id text;
  v_order public.voucher_credit_orders%ROWTYPE;
  v_ev_id text;
BEGIN
  v_emp := public.voucher_resolve_portal_session(p_portal_token);

  IF NOT COALESCE(v_emp.permitir_compra_creditos, false) THEN
    RAISE EXCEPTION 'A compra direta de créditos com desconto não está habilitada para sua empresa. Contate o estabelecimento.';
  END IF;

  IF p_valor_credito IS NULL OR p_valor_credito < 10 THEN
    RAISE EXCEPTION 'Informe um valor mínimo de R$ 10,00 em créditos.';
  END IF;

  v_desc_pct := GREATEST(LEAST(COALESCE(v_emp.desconto_compra_percent, 0.00), 99.00), 0.00);
  v_desc_val := ROUND(p_valor_credito * (v_desc_pct / 100.0), 2);
  v_pago := ROUND(p_valor_credito - v_desc_val, 2);

  v_order_id := 'ord-' || substr(md5(random()::text || clock_timestamp()::text || v_emp.id), 1, 10);
  INSERT INTO public.voucher_credit_orders (
    id, tenant_id, empresa_id, valor_credito, desconto_percent, valor_desconto,
    valor_pago, forma_pagamento, origem, status, solicitado_por, observacoes, created_at, updated_at
  ) VALUES (
    v_order_id,
    v_emp.tenant_id,
    v_emp.id,
    p_valor_credito,
    v_desc_pct,
    v_desc_val,
    v_pago,
    COALESCE(NULLIF(upper(trim(p_forma_pagamento)), ''), 'PIX'),
    'PORTAL',
    'PENDENTE',
    COALESCE(v_emp.contato_nome, v_emp.login_usuario, v_emp.razao_social),
    NULLIF(trim(COALESCE(p_observacoes, '')), ''),
    now(),
    now()
  )
  RETURNING * INTO v_order;

  v_ev_id := 'ev-' || substr(md5(random()::text || clock_timestamp()::text || v_order_id), 1, 10);
  INSERT INTO public.voucher_events (
    id, tenant_id, voucher_id, voucher_token, tipo_operacao, valor,
    beneficiario_nome, empresa_origem, empresa_id, status_anterior, status_novo,
    data_hora, usuario_responsavel, motivo, payload
  ) VALUES (
    v_ev_id, v_emp.tenant_id::text, NULL, v_order_id, 'PEDIDO_COMPRA_CREDITO', p_valor_credito,
    COALESCE(v_emp.nome_fantasia, v_emp.razao_social),
    COALESCE(v_emp.nome_fantasia, v_emp.razao_social),
    v_emp.id, 'NOVO', 'PENDENTE', now(), 'Portal B2B',
    format('Solicitação de R$ %s em créditos (desconto %s%% — pagar R$ %s via %s)',
      to_char(p_valor_credito, 'FM999999990.00'), to_char(v_desc_pct, 'FM990.00'),
      to_char(v_pago, 'FM999999990.00'), v_order.forma_pagamento),
    to_jsonb(v_order)
  );

  RETURN jsonb_build_object('success', true, 'order', to_jsonb(v_order));
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 6. MERCHANT / HOST ADMIN RPCs (TENANT-ISOLATED)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.voucher_merchant_get_dashboard(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
BEGIN
  PERFORM public.voucher_assert_merchant_access(p_tenant_id);
  PERFORM public.voucher_process_monthly_renewals(p_tenant_id, NULL, false);

  RETURN jsonb_build_object(
    'success', true,
    'tenant', public.voucher_get_store_profile(p_tenant_id),
    'partners', COALESCE((
      SELECT jsonb_agg(public.voucher_sanitize_partner(e) ORDER BY e.created_at DESC)
      FROM public.voucher_empresas_parceiras e
      WHERE e.tenant_id = p_tenant_id
    ), '[]'::jsonb),
    'campaigns', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC)
      FROM public.voucher_campanhas c
      WHERE c.tenant_id = p_tenant_id
    ), '[]'::jsonb),
    'colaboradores', COALESCE((
      SELECT jsonb_agg(to_jsonb(col) ORDER BY col.nome ASC)
      FROM public.voucher_colaboradores col
      WHERE col.tenant_id = p_tenant_id
    ), '[]'::jsonb),
    'vouchers', COALESCE((
      SELECT jsonb_agg(to_jsonb(v) - 'qr_secret' ORDER BY v.created_at DESC)
      FROM public.vouchers v
      WHERE v.tenant_id = p_tenant_id
    ), '[]'::jsonb),
    'credit_orders', COALESCE((
      SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC)
      FROM public.voucher_credit_orders o
      WHERE o.tenant_id = p_tenant_id
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(to_jsonb(ev) ORDER BY ev.created_at DESC)
      FROM (
        SELECT *
        FROM public.voucher_events e
        WHERE e.tenant_id = p_tenant_id::text
        ORDER BY e.created_at DESC NULLS LAST
        LIMIT 300
      ) ev
    ), '[]'::jsonb),
    'instances', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', wi.id,
        'display_name', wi.display_name,
        'whatsapp_name', wi.whatsapp_name,
        'phone_number', wi.phone_number,
        'status', wi.status
      ) ORDER BY (wi.status = 'connected') DESC, wi.display_name ASC)
      FROM public.whatsapp_instances wi
      WHERE wi.tenant_id = p_tenant_id
    ), '[]'::jsonb)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_merchant_save_partner(
  p_tenant_id uuid,
  p_id text DEFAULT NULL,
  p_razao_social text DEFAULT NULL,
  p_nome_fantasia text DEFAULT NULL,
  p_cnpj text DEFAULT NULL,
  p_contato_nome text DEFAULT NULL,
  p_contato_whatsapp text DEFAULT NULL,
  p_email_empresa text DEFAULT NULL,
  p_login_usuario text DEFAULT NULL,
  p_login_senha text DEFAULT NULL,
  p_saldo_inicial numeric DEFAULT 0,
  p_credito_inicio timestamptz DEFAULT NULL,
  p_credito_fim timestamptz DEFAULT NULL,
  p_limite_vouchers integer DEFAULT 0,
  p_ativo boolean DEFAULT true,
  p_credito_mensal_ativo boolean DEFAULT false,
  p_valor_credito_mensal numeric DEFAULT 0,
  p_dia_renovacao_mensal integer DEFAULT 1,
  p_modo_renovacao_mensal text DEFAULT 'RENOVAR_TETO',
  p_permitir_compra_creditos boolean DEFAULT true,
  p_desconto_compra_percent numeric DEFAULT 0,
  p_cep text DEFAULT NULL,
  p_logradouro text DEFAULT NULL,
  p_numero text DEFAULT NULL,
  p_complemento text DEFAULT NULL,
  p_bairro text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_telefone_empresa text DEFAULT NULL,
  p_status_cnpj text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_id text;
  v_row public.voucher_empresas_parceiras%ROWTYPE;
  v_login_norm text;
  v_hash text;
  v_dia int;
  v_modo text;
  v_ev_id text;
  v_temp_pwd text;
BEGIN
  PERFORM public.voucher_assert_merchant_access(p_tenant_id);

  IF COALESCE(trim(p_razao_social), '') = '' THEN
    RAISE EXCEPTION 'Razão Social / Nome da empresa parceira é obrigatório.';
  END IF;

  v_login_norm := NULLIF(lower(trim(COALESCE(p_login_usuario, ''))), '');
  IF v_login_norm IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.voucher_empresas_parceiras
      WHERE tenant_id = p_tenant_id
        AND lower(trim(COALESCE(login_usuario, ''))) = v_login_norm
        AND (p_id IS NULL OR id <> p_id)
    ) THEN
      RAISE EXCEPTION 'Já existe outra empresa parceira cadastrada com o login "%" nesta loja.', v_login_norm;
    END IF;
  END IF;

  v_dia := LEAST(GREATEST(COALESCE(p_dia_renovacao_mensal, 1), 1), 28);
  v_modo := CASE WHEN upper(trim(COALESCE(p_modo_renovacao_mensal, 'RENOVAR_TETO'))) = 'ACUMULAR' THEN 'ACUMULAR' ELSE 'RENOVAR_TETO' END;

  IF COALESCE(trim(p_login_senha), '') <> '' THEN
    v_hash := extensions.crypt(trim(p_login_senha), extensions.gen_salt('bf', 10));
  END IF;

  IF COALESCE(trim(p_id), '') <> '' THEN
    UPDATE public.voucher_empresas_parceiras
    SET
      razao_social = trim(p_razao_social),
      nome_fantasia = NULLIF(trim(COALESCE(p_nome_fantasia, '')), ''),
      cnpj = NULLIF(trim(COALESCE(p_cnpj, '')), ''),
      contato_nome = NULLIF(trim(COALESCE(p_contato_nome, '')), ''),
      contato_whatsapp = NULLIF(regexp_replace(COALESCE(p_contato_whatsapp, ''), '\D', '', 'g'), ''),
      email_empresa = NULLIF(lower(trim(COALESCE(p_email_empresa, ''))), ''),
      login_usuario = COALESCE(v_login_norm, login_usuario),
      senha_hash = COALESCE(v_hash, senha_hash),
      login_senha = NULL,
      credito_inicio = COALESCE(p_credito_inicio, credito_inicio),
      credito_fim = COALESCE(p_credito_fim, credito_fim),
      limite_vouchers = GREATEST(COALESCE(p_limite_vouchers, 0), 0),
      ativo = COALESCE(p_ativo, true),
      credito_mensal_ativo = COALESCE(p_credito_mensal_ativo, false),
      valor_credito_mensal = GREATEST(COALESCE(p_valor_credito_mensal, 0), 0),
      dia_renovacao_mensal = v_dia,
      modo_renovacao_mensal = v_modo,
      permitir_compra_creditos = COALESCE(p_permitir_compra_creditos, true),
      desconto_compra_percent = GREATEST(LEAST(COALESCE(p_desconto_compra_percent, 0), 99), 0),
      cep = NULLIF(trim(COALESCE(p_cep, '')), ''),
      logradouro = NULLIF(trim(COALESCE(p_logradouro, '')), ''),
      numero = NULLIF(trim(COALESCE(p_numero, '')), ''),
      complemento = NULLIF(trim(COALESCE(p_complemento, '')), ''),
      bairro = NULLIF(trim(COALESCE(p_bairro, '')), ''),
      municipio = NULLIF(trim(COALESCE(p_cidade, '')), ''),
      uf = NULLIF(upper(trim(COALESCE(p_uf, ''))), ''),
      telefone_empresa = NULLIF(trim(COALESCE(p_telefone_empresa, '')), ''),
      status_cnpj = NULLIF(trim(COALESCE(p_status_cnpj, '')), ''),
      updated_at = now()
    WHERE id = p_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Empresa parceira não encontrada neste estabelecimento.';
    END IF;
  ELSE
    v_id := 'emp-' || substr(md5(random()::text || clock_timestamp()::text || p_tenant_id::text), 1, 9);
    IF v_hash IS NULL AND v_login_norm IS NOT NULL THEN
      v_temp_pwd := upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));
      v_hash := extensions.crypt(v_temp_pwd, extensions.gen_salt('bf', 10));
    END IF;

    INSERT INTO public.voucher_empresas_parceiras (
      id, tenant_id, razao_social, nome_fantasia, cnpj, contato_nome, contato_whatsapp,
      email_empresa, login_usuario, login_senha, senha_hash,
      saldo_global, saldo_credito, credito_total_concedido,
      credito_inicio, credito_fim, ativo, limite_vouchers,
      credito_mensal_ativo, valor_credito_mensal, dia_renovacao_mensal, modo_renovacao_mensal,
      permitir_compra_creditos, desconto_compra_percent,
      cep, logradouro, numero, complemento, bairro, municipio, uf, telefone_empresa, status_cnpj,
      created_at, updated_at
    ) VALUES (
      v_id, p_tenant_id, trim(p_razao_social),
      NULLIF(trim(COALESCE(p_nome_fantasia, '')), ''),
      NULLIF(trim(COALESCE(p_cnpj, '')), ''),
      NULLIF(trim(COALESCE(p_contato_nome, '')), ''),
      NULLIF(regexp_replace(COALESCE(p_contato_whatsapp, ''), '\D', '', 'g'), ''),
      NULLIF(lower(trim(COALESCE(p_email_empresa, ''))), ''),
      v_login_norm, NULL, v_hash,
      GREATEST(COALESCE(p_saldo_inicial, 0), 0),
      GREATEST(COALESCE(p_saldo_inicial, 0), 0),
      GREATEST(COALESCE(p_saldo_inicial, 0), 0),
      p_credito_inicio, p_credito_fim, COALESCE(p_ativo, true), GREATEST(COALESCE(p_limite_vouchers, 0), 0),
      COALESCE(p_credito_mensal_ativo, false),
      GREATEST(COALESCE(p_valor_credito_mensal, 0), 0),
      v_dia, v_modo,
      COALESCE(p_permitir_compra_creditos, true),
      GREATEST(LEAST(COALESCE(p_desconto_compra_percent, 0), 99), 0),
      NULLIF(trim(COALESCE(p_cep, '')), ''),
      NULLIF(trim(COALESCE(p_logradouro, '')), ''),
      NULLIF(trim(COALESCE(p_numero, '')), ''),
      NULLIF(trim(COALESCE(p_complemento, '')), ''),
      NULLIF(trim(COALESCE(p_bairro, '')), ''),
      NULLIF(trim(COALESCE(p_cidade, '')), ''),
      NULLIF(upper(trim(COALESCE(p_uf, ''))), ''),
      NULLIF(trim(COALESCE(p_telefone_empresa, '')), ''),
      NULLIF(trim(COALESCE(p_status_cnpj, '')), ''),
      now(), now()
    )
    RETURNING * INTO v_row;

    IF COALESCE(v_row.saldo_credito, 0) > 0 THEN
      v_ev_id := 'ev-' || substr(md5(random()::text || clock_timestamp()::text || v_row.id), 1, 10);
      INSERT INTO public.voucher_events (
        id, tenant_id, voucher_id, voucher_token, tipo_operacao, valor,
        beneficiario_nome, empresa_origem, empresa_id, status_anterior, status_novo,
        data_hora, usuario_responsavel, motivo, payload
      ) VALUES (
        v_ev_id, p_tenant_id::text, NULL, NULL, 'CREDITO_INICIAL', v_row.saldo_credito,
        COALESCE(v_row.nome_fantasia, v_row.razao_social),
        COALESCE(v_row.nome_fantasia, v_row.razao_social),
        v_row.id, 'NOVO_CADASTRO', 'SALDO_ATIVO', now(), 'Admin Estabelecimento',
        format('Crédito inicial concedido no cadastro da empresa: R$ %s', to_char(v_row.saldo_credito, 'FM999999990.00')),
        jsonb_build_object('saldo_inicial', v_row.saldo_credito)
      );
    END IF;
  END IF;

  -- Auto-apply current month's allowance immediately on edit or when starting with zero initial balance
  IF (COALESCE(trim(p_id), '') <> '' OR COALESCE(p_saldo_inicial, 0) = 0)
     AND COALESCE(v_row.credito_mensal_ativo, false)
     AND COALESCE(v_row.valor_credito_mensal, 0) > 0 THEN
    PERFORM public._voucher_apply_renewal_for_partner(v_row.id, false);
    SELECT * INTO v_row FROM public.voucher_empresas_parceiras WHERE id = v_row.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'partner', public.voucher_sanitize_partner(v_row),
    'generated_password', v_temp_pwd
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_merchant_reset_partner_password(
  p_tenant_id uuid,
  p_empresa_id text,
  p_nova_senha text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
  v_plain text;
BEGIN
  PERFORM public.voucher_assert_merchant_access(p_tenant_id);

  SELECT * INTO v_emp
  FROM public.voucher_empresas_parceiras
  WHERE id = p_empresa_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa parceira não encontrada neste estabelecimento.';
  END IF;

  v_plain := NULLIF(trim(COALESCE(p_nova_senha, '')), '');
  IF v_plain IS NULL THEN
    v_plain := upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));
  END IF;

  IF length(v_plain) < 4 THEN
    RAISE EXCEPTION 'A senha deve possuir pelo menos 4 caracteres.';
  END IF;

  UPDATE public.voucher_empresas_parceiras
  SET
    senha_hash = extensions.crypt(v_plain, extensions.gen_salt('bf', 10)),
    login_senha = NULL,
    updated_at = now()
  WHERE id = v_emp.id
  RETURNING * INTO v_emp;

  -- Revoke existing B2B portal sessions on password reset
  DELETE FROM public.voucher_portal_sessions WHERE empresa_id = v_emp.id;

  RETURN jsonb_build_object(
    'success', true,
    'plain_password', v_plain,
    'partner', public.voucher_sanitize_partner(v_emp)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_merchant_save_campaign(
  p_tenant_id uuid,
  p_id text DEFAULT NULL,
  p_nome text DEFAULT NULL,
  p_descricao text DEFAULT NULL,
  p_valor_voucher numeric DEFAULT 0,
  p_empresa_id text DEFAULT NULL,
  p_empresa_nome text DEFAULT NULL,
  p_quantidade_total integer DEFAULT 100,
  p_validade_fim timestamptz DEFAULT NULL,
  p_tipo_desconto text DEFAULT 'VALOR_FIXO',
  p_valor_desconto numeric DEFAULT 0,
  p_horarios_permitidos jsonb DEFAULT NULL,
  p_restaurante_instance_id uuid DEFAULT NULL,
  p_ativo boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_id text;
  v_row public.voucher_campanhas%ROWTYPE;
BEGIN
  PERFORM public.voucher_assert_merchant_access(p_tenant_id);

  IF COALESCE(trim(p_nome), '') = '' THEN
    RAISE EXCEPTION 'Nome da campanha é obrigatório.';
  END IF;

  IF COALESCE(trim(p_id), '') <> '' THEN
    UPDATE public.voucher_campanhas
    SET
      empresa_id = NULLIF(trim(COALESCE(p_empresa_id, '')), ''),
      empresa_nome = NULLIF(trim(COALESCE(p_empresa_nome, '')), ''),
      nome = trim(p_nome),
      descricao = NULLIF(trim(COALESCE(p_descricao, '')), ''),
      valor_voucher = GREATEST(COALESCE(p_valor_voucher, 0), 0),
      tipo_desconto = COALESCE(NULLIF(trim(p_tipo_desconto), ''), 'VALOR_FIXO'),
      valor_desconto = GREATEST(COALESCE(p_valor_desconto, 0), 0),
      quantidade_total = GREATEST(COALESCE(p_quantidade_total, 1), 1),
      ativo = COALESCE(p_ativo, true),
      validade_fim = p_validade_fim,
      horarios_permitidos = COALESCE(p_horarios_permitidos, horarios_permitidos),
      restaurante_instance_id = p_restaurante_instance_id,
      updated_at = now()
    WHERE id = p_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Campanha não encontrada.';
    END IF;
  ELSE
    v_id := 'cmp-' || substr(md5(random()::text || clock_timestamp()::text || p_tenant_id::text), 1, 9);
    INSERT INTO public.voucher_campanhas (
      id, tenant_id, empresa_id, empresa_nome, nome, descricao,
      valor_voucher, tipo_desconto, valor_desconto, quantidade_total,
      ativo, validade_fim, horarios_permitidos, restaurante_instance_id, created_at, updated_at
    ) VALUES (
      v_id, p_tenant_id,
      NULLIF(trim(COALESCE(p_empresa_id, '')), ''),
      NULLIF(trim(COALESCE(p_empresa_nome, '')), ''),
      trim(p_nome),
      NULLIF(trim(COALESCE(p_descricao, '')), ''),
      GREATEST(COALESCE(p_valor_voucher, 0), 0),
      COALESCE(NULLIF(trim(p_tipo_desconto), ''), 'VALOR_FIXO'),
      GREATEST(COALESCE(p_valor_desconto, 0), 0),
      GREATEST(COALESCE(p_quantidade_total, 1), 1),
      COALESCE(p_ativo, true),
      p_validade_fim,
      COALESCE(p_horarios_permitidos, '{"dias":[0,1,2,3,4,5,6],"inicio":"00:00","fim":"23:59"}'::jsonb),
      p_restaurante_instance_id,
      now(), now()
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('success', true, 'campaign', to_jsonb(v_row));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_merchant_save_colaborador(
  p_tenant_id uuid,
  p_empresa_id text,
  p_id text DEFAULT NULL,
  p_nome text DEFAULT NULL,
  p_whatsapp text DEFAULT NULL,
  p_cpf text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_cargo text DEFAULT NULL,
  p_departamento text DEFAULT NULL,
  p_ativo boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_id text;
  v_row public.voucher_colaboradores%ROWTYPE;
BEGIN
  PERFORM public.voucher_assert_merchant_access(p_tenant_id);

  IF COALESCE(trim(p_empresa_id), '') = '' THEN
    RAISE EXCEPTION 'Empresa parceira obrigatória.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.voucher_empresas_parceiras
    WHERE id = p_empresa_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Empresa parceira não pertence a este estabelecimento.';
  END IF;
  IF COALESCE(trim(p_nome), '') = '' THEN
    RAISE EXCEPTION 'Nome do colaborador é obrigatório.';
  END IF;

  IF COALESCE(trim(p_id), '') <> '' THEN
    UPDATE public.voucher_colaboradores
    SET
      nome = trim(p_nome),
      whatsapp = NULLIF(regexp_replace(COALESCE(p_whatsapp, ''), '\D', '', 'g'), ''),
      cpf = NULLIF(trim(COALESCE(p_cpf, '')), ''),
      email = NULLIF(lower(trim(COALESCE(p_email, ''))), ''),
      cargo = NULLIF(trim(COALESCE(p_cargo, '')), ''),
      departamento = NULLIF(trim(COALESCE(p_departamento, '')), ''),
      ativo = COALESCE(p_ativo, true),
      updated_at = now()
    WHERE id = p_id AND tenant_id = p_tenant_id AND empresa_id = p_empresa_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador não encontrado.'; END IF;
  ELSE
    v_id := 'col-' || substr(md5(random()::text || clock_timestamp()::text || p_empresa_id), 1, 10);
    INSERT INTO public.voucher_colaboradores (
      id, tenant_id, empresa_id, nome, cpf, whatsapp, email, cargo, departamento, ativo, created_at, updated_at
    ) VALUES (
      v_id, p_tenant_id, p_empresa_id, trim(p_nome),
      NULLIF(trim(COALESCE(p_cpf, '')), ''),
      NULLIF(regexp_replace(COALESCE(p_whatsapp, ''), '\D', '', 'g'), ''),
      NULLIF(lower(trim(COALESCE(p_email, ''))), ''),
      NULLIF(trim(COALESCE(p_cargo, '')), ''),
      NULLIF(trim(COALESCE(p_departamento, '')), ''),
      COALESCE(p_ativo, true),
      now(), now()
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('success', true, 'colaborador', to_jsonb(v_row));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_merchant_delete_colaborador(
  p_tenant_id uuid,
  p_colaborador_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
BEGIN
  PERFORM public.voucher_assert_merchant_access(p_tenant_id);
  DELETE FROM public.voucher_colaboradores WHERE id = p_colaborador_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador não encontrado.'; END IF;
  RETURN jsonb_build_object('success', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_merchant_issue_vouchers(
  p_tenant_id uuid,
  p_empresa_id text DEFAULT NULL,
  p_campanha_id text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_validade_fim timestamptz DEFAULT (now() + interval '30 days'),
  p_observacoes text DEFAULT NULL,
  p_usuario_responsavel text DEFAULT 'Painel Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
  v_cmp public.voucher_campanhas%ROWTYPE;
  v_store jsonb;
  v_prefix text;
  v_item jsonb;
  v_count int;
  v_total numeric(10,2) := 0;
  v_val numeric(10,2);
  v_saldo_atual numeric(10,2) := 0;
  v_saldo_novo numeric(10,2) := 0;
  v_vch_id text;
  v_token text;
  v_ev_id text;
  v_created jsonb := '[]'::jsonb;
  v_vch public.vouchers%ROWTYPE;
  v_emp_id_clean text;
  v_cmp_id_clean text;
  v_emp_nome_final text;
  v_emp_razao_final text;
BEGIN
  PERFORM public.voucher_assert_merchant_access(p_tenant_id);

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Lista de vouchers inválida.';
  END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 500 THEN
    RAISE EXCEPTION 'Informe entre 1 e 500 vouchers por emissão.';
  END IF;

  v_emp_id_clean := NULLIF(trim(COALESCE(p_empresa_id, '')), '');
  v_cmp_id_clean := NULLIF(trim(COALESCE(p_campanha_id, '')), '');

  IF v_cmp_id_clean IS NOT NULL THEN
    SELECT * INTO v_cmp FROM public.voucher_campanhas
    WHERE id = v_cmp_id_clean AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Campanha não pertence a este estabelecimento.';
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_val := COALESCE((v_item->>'valor')::numeric, 0);
    IF v_val <= 0 THEN RAISE EXCEPTION 'Valor de cada voucher deve ser maior que zero.'; END IF;
    v_total := v_total + v_val;
  END LOOP;

  v_store := public.voucher_get_store_profile(p_tenant_id);
  v_prefix := upper(regexp_replace(COALESCE(v_store->>'name', 'VCH'), '[^A-Za-z0-9]', '', 'g'));
  IF length(v_prefix) < 2 THEN v_prefix := 'VCH'; END IF;
  v_prefix := substr(v_prefix, 1, 6);

  IF v_emp_id_clean IS NOT NULL THEN
    SELECT * INTO v_emp FROM public.voucher_empresas_parceiras
    WHERE id = v_emp_id_clean AND tenant_id = p_tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Empresa parceira não encontrada.'; END IF;
    IF NOT COALESCE(v_emp.ativo, false) THEN RAISE EXCEPTION 'Empresa parceira suspensa.'; END IF;

    v_saldo_atual := GREATEST(COALESCE(v_emp.saldo_credito, v_emp.saldo_global, 0.00), 0.00);
    IF v_saldo_atual < v_total THEN
      RAISE EXCEPTION 'Saldo da empresa insuficiente (disponível R$ %, necessário R$ %).',
        to_char(v_saldo_atual, 'FM999999990.00'), to_char(v_total, 'FM999999990.00');
    END IF;

    v_saldo_novo := v_saldo_atual - v_total;
    UPDATE public.voucher_empresas_parceiras
    SET saldo_credito = v_saldo_novo, saldo_global = v_saldo_novo, updated_at = now()
    WHERE id = v_emp.id;

    v_emp_nome_final := COALESCE(v_emp.nome_fantasia, v_emp.razao_social);
    v_emp_razao_final := v_emp.razao_social;
  ELSE
    v_emp_nome_final := COALESCE(v_store->>'name', 'Emissão Direta');
    v_emp_razao_final := COALESCE(v_store->>'company_name', v_store->>'name', 'Emissão Direta');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_val := (v_item->>'valor')::numeric;
    v_vch_id := 'vch-' || substr(md5(random()::text || clock_timestamp()::text || p_tenant_id::text), 1, 10);
    v_token := v_prefix || '-' || upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8));

    INSERT INTO public.vouchers (
      id, tenant_id, empresa_id, campanha_id, campanha_nome, colaborador_id, public_token,
      valor, status, beneficiario_nome, beneficiario_whatsapp,
      empresa_nome, empresa_razao_social, observacoes, validade_fim,
      mensagem_envio_status, created_at, updated_at
    ) VALUES (
      v_vch_id,
      p_tenant_id,
      v_emp_id_clean,
      v_cmp_id_clean,
      NULLIF(trim(COALESCE(v_cmp.nome, '')), ''),
      NULLIF(trim(COALESCE(v_item->>'colaborador_id', '')), ''),
      v_token,
      v_val,
      'CRIADO',
      COALESCE(NULLIF(trim(COALESCE(v_item->>'beneficiario_nome', '')), ''), 'Beneficiário Direto'),
      NULLIF(regexp_replace(COALESCE(v_item->>'beneficiario_whatsapp', ''), '\D', '', 'g'), ''),
      v_emp_nome_final,
      v_emp_razao_final,
      COALESCE(NULLIF(trim(COALESCE(v_item->>'observacoes', '')), ''), NULLIF(trim(COALESCE(p_observacoes, '')), '')),
      COALESCE(p_validade_fim, now() + interval '30 days'),
      CASE WHEN regexp_replace(COALESCE(v_item->>'beneficiario_whatsapp', ''), '\D', '', 'g') <> '' THEN 'PENDENTE' ELSE 'SEM_TELEFONE' END,
      now(),
      now()
    )
    RETURNING * INTO v_vch;

    v_ev_id := 'ev-' || substr(md5(random()::text || clock_timestamp()::text || v_vch_id), 1, 10);
    INSERT INTO public.voucher_events (
      id, tenant_id, voucher_id, voucher_token, tipo_operacao, valor,
      beneficiario_nome, empresa_origem, empresa_id, status_anterior, status_novo,
      data_hora, usuario_responsavel, motivo, payload
    ) VALUES (
      v_ev_id, p_tenant_id::text, v_vch.id, v_vch.public_token,
      CASE WHEN v_emp_id_clean IS NOT NULL THEN 'EMITIDO_EMPRESA_PARCEIRA' ELSE 'EMITIDO_ADMIN' END,
      v_vch.valor,
      v_vch.beneficiario_nome, v_emp_nome_final, v_emp_id_clean,
      NULL, 'CRIADO', now(), COALESCE(NULLIF(trim(p_usuario_responsavel), ''), 'Admin'),
      COALESCE(v_vch.observacoes, 'Emissão no Painel de Vouchers'),
      CASE WHEN v_emp_id_clean IS NOT NULL THEN jsonb_build_object('saldo_restante', v_saldo_novo) ELSE '{}'::jsonb END
    );

    v_created := v_created || (to_jsonb(v_vch) - 'qr_secret');
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'vouchers', v_created,
    'total_emitido', v_total,
    'partner', CASE WHEN v_emp_id_clean IS NOT NULL THEN (
      SELECT public.voucher_sanitize_partner(e) FROM public.voucher_empresas_parceiras e WHERE e.id = v_emp_id_clean
    ) ELSE NULL END
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_merchant_recharge_credit(
  p_tenant_id uuid,
  p_empresa_id text,
  p_valor_credito numeric,
  p_desconto_percent numeric DEFAULT NULL,
  p_forma_pagamento text DEFAULT 'PIX',
  p_nova_validade timestamptz DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_usuario_responsavel text DEFAULT 'Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
  v_saldo_ant numeric(10,2);
  v_saldo_novo numeric(10,2);
  v_desc_pct numeric(5,2);
  v_desc_val numeric(10,2);
  v_pago numeric(10,2);
  v_order_id text;
  v_ev_id text;
  v_op text;
BEGIN
  PERFORM public.voucher_assert_merchant_access(p_tenant_id);

  IF COALESCE(p_valor_credito, 0) = 0 THEN
    RAISE EXCEPTION 'Informe um valor diferente de zero.';
  END IF;

  SELECT * INTO v_emp
  FROM public.voucher_empresas_parceiras
  WHERE id = p_empresa_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa parceira não encontrada.'; END IF;

  v_saldo_ant := COALESCE(v_emp.saldo_credito, v_emp.saldo_global, 0.00);
  v_saldo_novo := v_saldo_ant + p_valor_credito;

  IF v_saldo_novo < 0 THEN
    RAISE EXCEPTION 'O ajuste deixaria o saldo negativo (atual R$ %).', to_char(v_saldo_ant, 'FM999999990.00');
  END IF;

  IF p_valor_credito > 0 THEN
    v_desc_pct := GREATEST(LEAST(COALESCE(p_desconto_percent, v_emp.desconto_compra_percent, 0.00), 99.00), 0.00);
    v_desc_val := ROUND(p_valor_credito * (v_desc_pct / 100.0), 2);
    v_pago := ROUND(p_valor_credito - v_desc_val, 2);
    v_op := CASE WHEN upper(trim(COALESCE(p_forma_pagamento, ''))) = 'CORTESIA' THEN 'RECARGA_CORTESIA' ELSE 'RECARGA_CREDITO' END;

    v_order_id := 'ord-' || substr(md5(random()::text || clock_timestamp()::text || v_emp.id), 1, 10);
    INSERT INTO public.voucher_credit_orders (
      id, tenant_id, empresa_id, valor_credito, desconto_percent, valor_desconto,
      valor_pago, forma_pagamento, origem, status, solicitado_por, aprovado_por, observacoes, aprovado_em, created_at, updated_at
    ) VALUES (
      v_order_id, p_tenant_id, v_emp.id, p_valor_credito, v_desc_pct, v_desc_val, v_pago,
      COALESCE(NULLIF(upper(trim(p_forma_pagamento)), ''), 'PIX'),
      'ADMIN', 'APROVADO',
      COALESCE(NULLIF(trim(p_usuario_responsavel), ''), 'Admin'),
      COALESCE(NULLIF(trim(p_usuario_responsavel), ''), 'Admin'),
      NULLIF(trim(COALESCE(p_motivo, '')), ''),
      now(), now(), now()
    );
  ELSE
    v_op := 'AJUSTE_SALDO';
  END IF;

  UPDATE public.voucher_empresas_parceiras
  SET
    saldo_credito = v_saldo_novo,
    saldo_global = v_saldo_novo,
    credito_total_concedido = COALESCE(credito_total_concedido, 0) + GREATEST(p_valor_credito, 0),
    credito_fim = COALESCE(p_nova_validade, credito_fim),
    updated_at = now()
  WHERE id = v_emp.id
  RETURNING * INTO v_emp;

  v_ev_id := 'ev-' || substr(md5(random()::text || clock_timestamp()::text || v_emp.id), 1, 10);
  INSERT INTO public.voucher_events (
    id, tenant_id, voucher_id, voucher_token, tipo_operacao, valor,
    beneficiario_nome, empresa_origem, empresa_id, status_anterior, status_novo,
    data_hora, usuario_responsavel, motivo, payload
  ) VALUES (
    v_ev_id, p_tenant_id::text, NULL, v_order_id, v_op, abs(p_valor_credito),
    COALESCE(v_emp.nome_fantasia, v_emp.razao_social),
    COALESCE(v_emp.nome_fantasia, v_emp.razao_social),
    v_emp.id,
    'SALDO_' || to_char(v_saldo_ant, 'FM999999990.00'),
    'SALDO_' || to_char(v_saldo_novo, 'FM999999990.00'),
    now(),
    COALESCE(NULLIF(trim(p_usuario_responsavel), ''), 'Admin'),
    COALESCE(NULLIF(trim(p_motivo), ''), format('Movimentação de crédito (%s): R$ %s', COALESCE(p_forma_pagamento, 'PIX'), to_char(p_valor_credito, 'FM999999990.00'))),
    jsonb_build_object('saldo_anterior', v_saldo_ant, 'saldo_novo', v_saldo_novo, 'valor_pago', v_pago, 'desconto_percent', v_desc_pct, 'order_id', v_order_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'partner', public.voucher_sanitize_partner(v_emp),
    'saldo_novo', v_saldo_novo,
    'order_id', v_order_id
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_merchant_decide_credit_order(
  p_tenant_id uuid,
  p_order_id text,
  p_acao text,
  p_motivo text DEFAULT NULL,
  p_usuario_responsavel text DEFAULT 'Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_order public.voucher_credit_orders%ROWTYPE;
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
  v_saldo_ant numeric(10,2);
  v_saldo_novo numeric(10,2);
  v_ev_id text;
  v_act text;
BEGIN
  PERFORM public.voucher_assert_merchant_access(p_tenant_id);
  v_act := upper(trim(COALESCE(p_acao, '')));

  SELECT * INTO v_order
  FROM public.voucher_credit_orders
  WHERE id = p_order_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido de crédito não encontrado.'; END IF;
  IF v_order.status <> 'PENDENTE' THEN
    RAISE EXCEPTION 'Este pedido já foi processado (status: %).', v_order.status;
  END IF;

  IF v_act = 'APROVAR' THEN
    SELECT * INTO v_emp
    FROM public.voucher_empresas_parceiras
    WHERE id = v_order.empresa_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Empresa parceira não encontrada.'; END IF;

    v_saldo_ant := COALESCE(v_emp.saldo_credito, v_emp.saldo_global, 0.00);
    v_saldo_novo := v_saldo_ant + v_order.valor_credito;

    UPDATE public.voucher_empresas_parceiras
    SET
      saldo_credito = v_saldo_novo,
      saldo_global = v_saldo_novo,
      credito_total_concedido = COALESCE(credito_total_concedido, 0) + v_order.valor_credito,
      updated_at = now()
    WHERE id = v_emp.id
    RETURNING * INTO v_emp;

    UPDATE public.voucher_credit_orders
    SET
      status = 'APROVADO',
      aprovado_por = COALESCE(NULLIF(trim(p_usuario_responsavel), ''), 'Admin'),
      aprovado_em = now(),
      observacoes = COALESCE(NULLIF(trim(COALESCE(p_motivo, '')), ''), observacoes),
      updated_at = now()
    WHERE id = v_order.id
    RETURNING * INTO v_order;

    v_ev_id := 'ev-' || substr(md5(random()::text || clock_timestamp()::text || v_order.id), 1, 10);
    INSERT INTO public.voucher_events (
      id, tenant_id, voucher_id, voucher_token, tipo_operacao, valor,
      beneficiario_nome, empresa_origem, empresa_id, status_anterior, status_novo,
      data_hora, usuario_responsavel, motivo, payload
    ) VALUES (
      v_ev_id, p_tenant_id::text, NULL, v_order.id, 'COMPRA_CREDITO_APROVADA', v_order.valor_credito,
      COALESCE(v_emp.nome_fantasia, v_emp.razao_social),
      COALESCE(v_emp.nome_fantasia, v_emp.razao_social),
      v_emp.id, 'PENDENTE', 'APROVADO', now(),
      COALESCE(NULLIF(trim(p_usuario_responsavel), ''), 'Admin'),
      format('Compra de crédito aprovada: +R$ %s em saldo (pago R$ %s com %s%% desc.)',
        to_char(v_order.valor_credito, 'FM999999990.00'), to_char(v_order.valor_pago, 'FM999999990.00'), to_char(v_order.desconto_percent, 'FM990.00')),
      jsonb_build_object('saldo_anterior', v_saldo_ant, 'saldo_novo', v_saldo_novo, 'order', to_jsonb(v_order))
    );

    RETURN jsonb_build_object('success', true, 'order', to_jsonb(v_order), 'partner', public.voucher_sanitize_partner(v_emp));
  ELSIF v_act = 'REJEITAR' THEN
    UPDATE public.voucher_credit_orders
    SET
      status = 'REJEITADO',
      aprovado_por = COALESCE(NULLIF(trim(p_usuario_responsavel), ''), 'Admin'),
      aprovado_em = now(),
      observacoes = COALESCE(NULLIF(trim(COALESCE(p_motivo, '')), ''), observacoes),
      updated_at = now()
    WHERE id = v_order.id
    RETURNING * INTO v_order;

    RETURN jsonb_build_object('success', true, 'order', to_jsonb(v_order));
  ELSE
    RAISE EXCEPTION 'Ação inválida: %. Use APROVAR ou REJEITAR.', p_acao;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_merchant_cancel_or_reactivate(
  p_tenant_id uuid,
  p_voucher_id text,
  p_acao text,
  p_motivo text DEFAULT NULL,
  p_usuario_responsavel text DEFAULT 'Admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_vch public.vouchers%ROWTYPE;
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
  v_saldo_ant numeric(10,2);
  v_saldo_novo numeric(10,2);
  v_ev_id text;
  v_act text;
BEGIN
  PERFORM public.voucher_assert_merchant_access(p_tenant_id);
  v_act := upper(trim(COALESCE(p_acao, '')));

  SELECT * INTO v_vch
  FROM public.vouchers
  WHERE id = p_voucher_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Voucher não encontrado neste estabelecimento.'; END IF;

  IF v_act = 'CANCELAR' THEN
    IF v_vch.status = 'RESGATADO' THEN
      RAISE EXCEPTION 'Não é possível cancelar um voucher já resgatado.';
    END IF;
    IF v_vch.status = 'CANCELADO' THEN
      RAISE EXCEPTION 'Este voucher já se encontra cancelado.';
    END IF;

    UPDATE public.vouchers
    SET status = 'CANCELADO', data_cancelamento = now(), lock_until = NULL, updated_at = now()
    WHERE id = v_vch.id
    RETURNING * INTO v_vch;

    IF COALESCE(v_vch.empresa_id, '') <> '' THEN
      SELECT * INTO v_emp FROM public.voucher_empresas_parceiras
      WHERE id = v_vch.empresa_id AND tenant_id = p_tenant_id FOR UPDATE;
      IF FOUND THEN
        v_saldo_ant := COALESCE(v_emp.saldo_credito, v_emp.saldo_global, 0.00);
        v_saldo_novo := v_saldo_ant + v_vch.valor;
        UPDATE public.voucher_empresas_parceiras
        SET saldo_credito = v_saldo_novo, saldo_global = v_saldo_novo, updated_at = now()
        WHERE id = v_emp.id
        RETURNING * INTO v_emp;
      END IF;
    END IF;

    v_ev_id := 'ev-' || substr(md5(random()::text || clock_timestamp()::text || v_vch.id), 1, 10);
    INSERT INTO public.voucher_events (
      id, tenant_id, voucher_id, voucher_token, tipo_operacao, valor,
      beneficiario_nome, empresa_origem, empresa_id, status_anterior, status_novo,
      data_hora, usuario_responsavel, motivo, payload
    ) VALUES (
      v_ev_id, p_tenant_id::text, v_vch.id, v_vch.public_token,
      CASE WHEN v_emp.id IS NOT NULL THEN 'ESTORNADO_CANCELAMENTO' ELSE 'CANCELADO' END,
      v_vch.valor, v_vch.beneficiario_nome, v_vch.empresa_nome, v_vch.empresa_id,
      'CRIADO', 'CANCELADO', now(), COALESCE(NULLIF(trim(p_usuario_responsavel), ''), 'Admin'),
      COALESCE(NULLIF(trim(p_motivo), ''), 'Cancelado pela gestão'),
      CASE WHEN v_emp.id IS NOT NULL THEN jsonb_build_object('saldo_anterior', v_saldo_ant, 'saldo_novo', v_saldo_novo) ELSE '{}'::jsonb END
    );
  ELSIF v_act = 'REATIVAR' THEN
    IF v_vch.status <> 'CANCELADO' THEN
      RAISE EXCEPTION 'Somente vouchers cancelados podem ser reativados.';
    END IF;

    IF COALESCE(v_vch.empresa_id, '') <> '' THEN
      SELECT * INTO v_emp FROM public.voucher_empresas_parceiras
      WHERE id = v_vch.empresa_id AND tenant_id = p_tenant_id FOR UPDATE;
      IF FOUND THEN
        v_saldo_ant := COALESCE(v_emp.saldo_credito, v_emp.saldo_global, 0.00);
        IF v_saldo_ant < v_vch.valor THEN
          RAISE EXCEPTION 'Saldo insuficiente na empresa para reativar este voucher (disponível R$ %).', to_char(v_saldo_ant, 'FM999999990.00');
        END IF;
        v_saldo_novo := v_saldo_ant - v_vch.valor;
        UPDATE public.voucher_empresas_parceiras
        SET saldo_credito = v_saldo_novo, saldo_global = v_saldo_novo, updated_at = now()
        WHERE id = v_emp.id
        RETURNING * INTO v_emp;
      END IF;
    END IF;

    UPDATE public.vouchers
    SET status = 'CRIADO', data_cancelamento = NULL, lock_until = NULL, updated_at = now()
    WHERE id = v_vch.id
    RETURNING * INTO v_vch;

    v_ev_id := 'ev-' || substr(md5(random()::text || clock_timestamp()::text || v_vch.id), 1, 10);
    INSERT INTO public.voucher_events (
      id, tenant_id, voucher_id, voucher_token, tipo_operacao, valor,
      beneficiario_nome, empresa_origem, empresa_id, status_anterior, status_novo,
      data_hora, usuario_responsavel, motivo, payload
    ) VALUES (
      v_ev_id, p_tenant_id::text, v_vch.id, v_vch.public_token, 'REATIVACAO_COBRANCA', v_vch.valor,
      v_vch.beneficiario_nome, v_vch.empresa_nome, v_vch.empresa_id,
      'CANCELADO', 'CRIADO', now(), COALESCE(NULLIF(trim(p_usuario_responsavel), ''), 'Admin'),
      COALESCE(NULLIF(trim(p_motivo), ''), 'Voucher reativado pela gestão'),
      CASE WHEN v_emp.id IS NOT NULL THEN jsonb_build_object('saldo_anterior', v_saldo_ant, 'saldo_novo', v_saldo_novo) ELSE '{}'::jsonb END
    );
  ELSE
    RAISE EXCEPTION 'Ação inválida: %. Use CANCELAR ou REATIVAR.', p_acao;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'voucher', to_jsonb(v_vch) - 'qr_secret',
    'partner', CASE WHEN v_emp.id IS NOT NULL THEN public.voucher_sanitize_partner(v_emp) ELSE NULL END
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_merchant_save_settings(
  p_tenant_id uuid,
  p_default_instance_id uuid DEFAULT NULL,
  p_terminal_pin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_settings jsonb;
BEGIN
  PERFORM public.voucher_assert_merchant_access(p_tenant_id);

  SELECT COALESCE(settings, '{}'::jsonb) INTO v_settings
  FROM public.companies
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Estabelecimento não encontrado.'; END IF;

  IF p_default_instance_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.whatsapp_instances
      WHERE id = p_default_instance_id AND tenant_id = p_tenant_id
    ) THEN
      RAISE EXCEPTION 'A caixa WhatsApp selecionada não pertence a este estabelecimento.';
    END IF;
    v_settings := v_settings || jsonb_build_object('voucher_default_instance_id', p_default_instance_id::text);
  ELSE
    v_settings := v_settings - 'voucher_default_instance_id';
  END IF;

  IF p_terminal_pin IS NOT NULL THEN
    IF trim(p_terminal_pin) = '' THEN
      v_settings := v_settings - 'voucher_terminal_pin';
    ELSE
      IF length(trim(p_terminal_pin)) < 4 THEN
        RAISE EXCEPTION 'O PIN do Terminal Caixa deve ter pelo menos 4 caracteres.';
      END IF;
      v_settings := v_settings || jsonb_build_object('voucher_terminal_pin', trim(p_terminal_pin));
    END IF;
  END IF;

  UPDATE public.companies
  SET settings = v_settings
  WHERE id = p_tenant_id;

  RETURN jsonb_build_object('success', true, 'tenant', public.voucher_get_store_profile(p_tenant_id));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_merchant_toggle_partner(
  p_tenant_id uuid,
  p_empresa_id text,
  p_ativo boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_emp public.voucher_empresas_parceiras%ROWTYPE;
BEGIN
  PERFORM public.voucher_assert_merchant_access(p_tenant_id);

  UPDATE public.voucher_empresas_parceiras
  SET ativo = COALESCE(p_ativo, true), updated_at = now()
  WHERE id = p_empresa_id AND tenant_id = p_tenant_id
  RETURNING * INTO v_emp;

  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa parceira não encontrada.'; END IF;

  IF NOT COALESCE(v_emp.ativo, true) THEN
    DELETE FROM public.voucher_portal_sessions WHERE empresa_id = v_emp.id;
  END IF;

  RETURN jsonb_build_object('success', true, 'partner', public.voucher_sanitize_partner(v_emp));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_merchant_delete_campaign(
  p_tenant_id uuid,
  p_campanha_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
BEGIN
  PERFORM public.voucher_assert_merchant_access(p_tenant_id);

  DELETE FROM public.voucher_campanhas
  WHERE id = p_campanha_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Campanha não encontrada.'; END IF;

  RETURN jsonb_build_object('success', true);
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 7. PUBLIC VIEWER & ATOMIC POS SCANNER RPCs
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.voucher_get_public(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_clean text;
  v_vch public.vouchers%ROWTYPE;
  v_cmp public.voucher_campanhas%ROWTYPE;
  v_ev_id text;
BEGIN
  v_clean := trim(COALESCE(p_token, ''));
  IF v_clean = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Código do voucher não informado.');
  END IF;

  SELECT * INTO v_vch
  FROM public.vouchers
  WHERE upper(public_token) = upper(v_clean) OR id = v_clean
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voucher não encontrado ou token inválido.');
  END IF;

  -- Mark first view atomically
  IF v_vch.status = 'CRIADO' THEN
    UPDATE public.vouchers
    SET status = 'VISUALIZADO', updated_at = now()
    WHERE id = v_vch.id AND status = 'CRIADO'
    RETURNING * INTO v_vch;

    v_ev_id := 'ev-' || substr(md5(random()::text || clock_timestamp()::text || v_vch.id), 1, 10);
    INSERT INTO public.voucher_events (
      id, tenant_id, voucher_id, voucher_token, tipo_operacao, valor,
      beneficiario_nome, empresa_origem, empresa_id, status_anterior, status_novo,
      data_hora, usuario_responsavel, motivo
    ) VALUES (
      v_ev_id, v_vch.tenant_id::text, v_vch.id, v_vch.public_token, 'VISUALIZADO', v_vch.valor,
      v_vch.beneficiario_nome, v_vch.empresa_nome, v_vch.empresa_id,
      'CRIADO', 'VISUALIZADO', now(), 'Beneficiário (Link Público)', 'Voucher visualizado pelo portador'
    );
  END IF;

  IF v_vch.validade_fim IS NOT NULL AND v_vch.validade_fim < now() AND v_vch.status NOT IN ('RESGATADO', 'CANCELADO', 'EXPIRADO') THEN
    UPDATE public.vouchers SET status = 'EXPIRADO', updated_at = now() WHERE id = v_vch.id RETURNING * INTO v_vch;
  END IF;

  IF COALESCE(v_vch.campanha_id, '') <> '' THEN
    SELECT * INTO v_cmp FROM public.voucher_campanhas WHERE id = v_vch.campanha_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'voucher', to_jsonb(v_vch) - 'qr_secret',
    'campanha', CASE WHEN v_cmp.id IS NOT NULL THEN jsonb_build_object(
      'id', v_cmp.id,
      'nome', v_cmp.nome,
      'descricao', v_cmp.descricao,
      'horarios_permitidos', v_cmp.horarios_permitidos
    ) ELSE NULL END,
    'restaurante', public.voucher_get_store_profile(v_vch.tenant_id)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public._voucher_authorize_scanner(
  p_tenant_id uuid,
  p_terminal_pin text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_pin_cfg text;
BEGIN
  IF public.voucher_user_has_tenant_access(p_tenant_id) THEN
    RETURN;
  END IF;

  SELECT trim(COALESCE(settings->>'voucher_terminal_pin', '')) INTO v_pin_cfg
  FROM public.companies
  WHERE id = p_tenant_id;

  IF COALESCE(v_pin_cfg, '') <> '' AND COALESCE(trim(p_terminal_pin), '') = v_pin_cfg THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Terminal Caixa não autorizado para esta loja. Faça login no CRM ou informe o PIN do Terminal Caixa.';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_scanner_reserve(
  p_token text,
  p_tenant_id uuid DEFAULT NULL,
  p_atendente text DEFAULT 'Operador Caixa',
  p_terminal_pin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_clean text;
  v_vch public.vouchers%ROWTYPE;
BEGIN
  v_clean := trim(COALESCE(p_token, ''));
  IF v_clean = '' THEN
    RAISE EXCEPTION 'Token ou código do voucher não informado.';
  END IF;

  SELECT * INTO v_vch
  FROM public.vouchers
  WHERE upper(public_token) = upper(v_clean) OR id = v_clean
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher não encontrado na base de dados desta rede.';
  END IF;

  IF p_tenant_id IS NOT NULL AND v_vch.tenant_id <> p_tenant_id THEN
    RAISE EXCEPTION 'Este voucher pertence a outro estabelecimento e não pode ser validado neste caixa.';
  END IF;

  PERFORM public._voucher_authorize_scanner(v_vch.tenant_id, p_terminal_pin);

  IF v_vch.status = 'RESGATADO' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_REDEEMED',
      'error', 'Voucher já resgatado anteriormente!',
      'voucher', to_jsonb(v_vch) - 'qr_secret',
      'restaurante', public.voucher_get_store_profile(v_vch.tenant_id)
    );
  END IF;

  IF v_vch.status = 'CANCELADO' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CANCELLED',
      'error', 'Voucher cancelado pela empresa ou administração.',
      'voucher', to_jsonb(v_vch) - 'qr_secret',
      'restaurante', public.voucher_get_store_profile(v_vch.tenant_id)
    );
  END IF;

  IF v_vch.validade_fim IS NOT NULL AND v_vch.validade_fim < now() THEN
    UPDATE public.vouchers SET status = 'EXPIRADO', updated_at = now() WHERE id = v_vch.id RETURNING * INTO v_vch;
    RETURN jsonb_build_object(
      'success', false,
      'code', 'EXPIRED',
      'error', 'Voucher com validade expirada.',
      'voucher', to_jsonb(v_vch) - 'qr_secret',
      'restaurante', public.voucher_get_store_profile(v_vch.tenant_id)
    );
  END IF;

  IF v_vch.status = 'RESERVADO' AND v_vch.lock_until IS NOT NULL AND v_vch.lock_until > now() THEN
    -- Allow re-check by same cashier if within lock or report lock
    RETURN jsonb_build_object(
      'success', true,
      'reserved_now', false,
      'voucher', to_jsonb(v_vch) - 'qr_secret',
      'restaurante', public.voucher_get_store_profile(v_vch.tenant_id)
    );
  END IF;

  UPDATE public.vouchers
  SET
    status = 'RESERVADO',
    lock_until = now() + interval '5 minutes',
    updated_at = now()
  WHERE id = v_vch.id
  RETURNING * INTO v_vch;

  RETURN jsonb_build_object(
    'success', true,
    'reserved_now', true,
    'voucher', to_jsonb(v_vch) - 'qr_secret',
    'restaurante', public.voucher_get_store_profile(v_vch.tenant_id)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.voucher_scanner_confirm(
  p_voucher_id text,
  p_tenant_id uuid DEFAULT NULL,
  p_atendente text DEFAULT 'Operador Caixa',
  p_terminal_pin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $fn$
DECLARE
  v_vch public.vouchers%ROWTYPE;
  v_prev_status text;
  v_ev_id text;
  v_atendente text;
BEGIN
  SELECT * INTO v_vch
  FROM public.vouchers
  WHERE id = p_voucher_id OR upper(public_token) = upper(p_voucher_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher não encontrado para baixa.';
  END IF;

  IF p_tenant_id IS NOT NULL AND v_vch.tenant_id <> p_tenant_id THEN
    RAISE EXCEPTION 'Voucher não pertence a este estabelecimento.';
  END IF;

  PERFORM public._voucher_authorize_scanner(v_vch.tenant_id, p_terminal_pin);

  IF v_vch.status = 'RESGATADO' THEN
    RAISE EXCEPTION 'Bloqueio antifraude: este voucher já foi resgatado!';
  END IF;
  IF v_vch.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'Voucher cancelado não pode ser resgatado.';
  END IF;
  IF v_vch.validade_fim IS NOT NULL AND v_vch.validade_fim < now() THEN
    UPDATE public.vouchers SET status = 'EXPIRADO', lock_until = NULL, updated_at = now() WHERE id = v_vch.id;
    RAISE EXCEPTION 'Voucher vencido não pode ser resgatado.';
  END IF;

  v_prev_status := v_vch.status;
  v_atendente := COALESCE(NULLIF(trim(p_atendente), ''), 'Operador Caixa');

  UPDATE public.vouchers
  SET
    status = 'RESGATADO',
    data_resgate = now(),
    atendente_id = v_atendente,
    lock_until = NULL,
    updated_at = now()
  WHERE id = v_vch.id
  RETURNING * INTO v_vch;

  v_ev_id := 'ev-' || substr(md5(random()::text || clock_timestamp()::text || v_vch.id), 1, 10);
  INSERT INTO public.voucher_events (
    id, tenant_id, voucher_id, voucher_token, tipo_operacao, valor,
    beneficiario_nome, empresa_origem, empresa_id, status_anterior, status_novo,
    data_hora, usuario_responsavel, motivo, payload
  ) VALUES (
    v_ev_id, v_vch.tenant_id::text, v_vch.id, v_vch.public_token, 'RESGATADO', v_vch.valor,
    v_vch.beneficiario_nome, v_vch.empresa_nome, v_vch.empresa_id,
    v_prev_status, 'RESGATADO', now(), v_atendente,
    'Baixa definitiva confirmada no Terminal Caixa',
    jsonb_build_object('atendente', v_atendente)
  );

  RETURN jsonb_build_object(
    'success', true,
    'voucher', to_jsonb(v_vch) - 'qr_secret',
    'restaurante', public.voucher_get_store_profile(v_vch.tenant_id)
  );
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 8. RPC EXECUTION GRANTS (STRICT SEPARATION OF PUBLIC VS AUTHENTICATED)
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.voucher_user_has_tenant_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_user_has_tenant_access_text(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_assert_merchant_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._voucher_apply_renewal_for_partner(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_resolve_portal_session(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._voucher_authorize_scanner(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_sanitize_partner(public.voucher_empresas_parceiras) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.voucher_user_has_tenant_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_user_has_tenant_access_text(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_assert_merchant_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._voucher_apply_renewal_for_partner(text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.voucher_resolve_portal_session(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._voucher_authorize_scanner(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.voucher_sanitize_partner(public.voucher_empresas_parceiras) TO service_role;

-- Public & B2B Portal RPCs
REVOKE ALL ON FUNCTION public.voucher_portal_login(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.voucher_portal_logout(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.voucher_portal_get_dashboard(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.voucher_portal_save_colaborador(text, text, text, text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.voucher_portal_delete_colaborador(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.voucher_portal_issue_vouchers(text, jsonb, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.voucher_portal_cancel_voucher(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.voucher_portal_request_credit_order(text, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.voucher_get_public(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.voucher_scanner_reserve(text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.voucher_scanner_confirm(text, uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.voucher_portal_login(text, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_portal_logout(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_portal_get_dashboard(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_portal_save_colaborador(text, text, text, text, text, text, text, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_portal_delete_colaborador(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_portal_issue_vouchers(text, jsonb, timestamptz, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_portal_cancel_voucher(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_portal_request_credit_order(text, numeric, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_get_public(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_scanner_reserve(text, uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_scanner_confirm(text, uuid, text, text) TO anon, authenticated, service_role;

-- Authenticated Merchant RPCs ONLY (never anon!)
REVOKE ALL ON FUNCTION public.voucher_process_monthly_renewals(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_merchant_get_dashboard(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_merchant_save_partner(uuid, text, text, text, text, text, text, text, text, text, numeric, timestamptz, timestamptz, integer, boolean, boolean, numeric, integer, text, boolean, numeric, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_merchant_reset_partner_password(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_merchant_save_campaign(uuid, text, text, text, numeric, text, text, integer, timestamptz, text, numeric, jsonb, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_merchant_save_colaborador(uuid, text, text, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_merchant_delete_colaborador(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_merchant_issue_vouchers(uuid, text, text, jsonb, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_merchant_recharge_credit(uuid, text, numeric, numeric, text, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_merchant_decide_credit_order(uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_merchant_cancel_or_reactivate(uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_merchant_save_settings(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_merchant_toggle_partner(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voucher_merchant_delete_campaign(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.voucher_process_monthly_renewals(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_merchant_get_dashboard(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_merchant_save_partner(uuid, text, text, text, text, text, text, text, text, text, numeric, timestamptz, timestamptz, integer, boolean, boolean, numeric, integer, text, boolean, numeric, text, text, text, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_merchant_reset_partner_password(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_merchant_save_campaign(uuid, text, text, text, numeric, text, text, integer, timestamptz, text, numeric, jsonb, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_merchant_save_colaborador(uuid, text, text, text, text, text, text, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_merchant_delete_colaborador(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_merchant_issue_vouchers(uuid, text, text, jsonb, timestamptz, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_merchant_recharge_credit(uuid, text, numeric, numeric, text, timestamptz, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_merchant_decide_credit_order(uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_merchant_cancel_or_reactivate(uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_merchant_save_settings(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_merchant_toggle_partner(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voucher_merchant_delete_campaign(uuid, text) TO authenticated, service_role;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
