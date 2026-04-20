-- 1. Setup Function and Trigger for new Companies / Tenants
CREATE OR REPLACE FUNCTION setup_new_tenant_onboarding()
RETURNS TRIGGER AS $$
BEGIN
    -- Inserir as etiquetas iniciais padrões para essa empresa!
    INSERT INTO public.tenant_labels (tenant_id, name, color)
    VALUES 
        (NEW.id, 'Novo Cliente', '#3b82f6'),
        (NEW.id, 'Em Atendimento', '#10b981'),
        (NEW.id, 'Pendente', '#f59e0b'),
        (NEW.id, 'Suporte', '#8b5cf6'),
        (NEW.id, 'Finalizado', '#64748b')
    ON CONFLICT DO NOTHING; -- in case we add unique constraints later

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_onboard_tenant ON public.tenants;
CREATE TRIGGER trg_onboard_tenant
AFTER INSERT ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION setup_new_tenant_onboarding();

-- 2. Setup Function and Trigger for new WhatsApp Instances
CREATE OR REPLACE FUNCTION setup_new_whatsapp_instance()
RETURNS TRIGGER AS $$
BEGIN
    -- Se o JSONb for vazio, imputa o setup obrigatorio
    IF NEW.settings IS NULL OR NEW.settings::text = '{}' THEN
        NEW.settings = '{"reject_calls": false, "ignore_groups": false, "always_online": true, "sync_history": false, "read_messages": false}'::jsonb;
    END IF;

    -- Se status vier em branco, garante que fique 'offline' no primeiro nano-segundo
    IF NEW.status IS NULL OR NEW.status = '' THEN
        NEW.status = 'offline';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Executa 'BEFORE INSERT' assim ele ajusta os dados na memoria ANTES de escrever na tabela real.
DROP TRIGGER IF EXISTS trg_onboard_whatsapp_instance ON public.whatsapp_instances;
CREATE TRIGGER trg_onboard_whatsapp_instance
BEFORE INSERT ON public.whatsapp_instances
FOR EACH ROW
EXECUTE FUNCTION setup_new_whatsapp_instance();
