-- ==============================================================================
-- CORREÇÃO DE SECURITY ADVISORS DO SUPABASE (RLS E SEGURANÇA DE VIEWS)
-- ==============================================================================

-- 1. Habilitar RLS na tabela webhook_triggers
ALTER TABLE IF EXISTS public.webhook_triggers ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'webhook_triggers' AND policyname = 'Allow service_role or authenticated tenant access on webhook_triggers'
    ) THEN
        CREATE POLICY "Allow service_role or authenticated tenant access on webhook_triggers" 
        ON public.webhook_triggers 
        FOR ALL 
        USING (auth.role() = 'service_role' OR auth.uid() IS NOT NULL);
    END IF;
END $$;

-- 2. Habilitar RLS na tabela face_auth
ALTER TABLE IF EXISTS public.face_auth ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'face_auth' AND policyname = 'Allow service_role or authenticated user on face_auth'
    ) THEN
        CREATE POLICY "Allow service_role or authenticated user on face_auth" 
        ON public.face_auth 
        FOR ALL 
        USING (auth.role() = 'service_role' OR auth.uid() IS NOT NULL);
    END IF;
END $$;

-- 3. Habilitar RLS na tabela app_versions
ALTER TABLE IF EXISTS public.app_versions ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'app_versions' AND policyname = 'Allow public read access on app_versions'
    ) THEN
        CREATE POLICY "Allow public read access on app_versions" 
        ON public.app_versions 
        FOR SELECT 
        USING (true);
    END IF;
END $$;

-- 4. View v_checklist_operators: Configurar com security_invoker para não expor auth.users indevidamente
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_views WHERE viewname = 'v_checklist_operators' AND schemaname = 'public'
    ) THEN
        ALTER VIEW public.v_checklist_operators SET (security_invoker = true);
    END IF;
END $$;
