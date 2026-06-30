-- ============================================================================
-- SCRIPT DE SETUP: MÓDULO DE CHECKLIST OPERACIONAL GASTRONÔMICO SAAS
-- INTEGRADO AO ECOSSISTEMA TENANTS EXISTENTE
-- ============================================================================

-- 1. ENUMS E TIPOS CUSTOMIZADOS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('super_admin', 'company_admin', 'manager', 'operator');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'item_response_type') THEN
    CREATE TYPE item_response_type AS ENUM (
      'boolean', 'conformity', 'yes_no', 'numeric', 'temperature', 
      'counter', 'text', 'photo', 'stars', 'single_select', 'multi_select', 'datetime', 'kg'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'execution_status') THEN
    CREATE TYPE execution_status AS ENUM (
      'scheduled', 'available', 'in_progress', 'completed_on_time', 
      'completed_late', 'missed', 'blocked', 'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_severity') THEN
    CREATE TYPE alert_severity AS ENUM ('info', 'medium', 'high', 'critical');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_status') THEN
    CREATE TYPE alert_status AS ENUM ('pending', 'acknowledged', 'resolved');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_recurrency') THEN
    CREATE TYPE schedule_recurrency AS ENUM ('daily', 'weekly', 'monthly', 'custom');
  END IF;
END
$$;

-- 2. TABELAS DO MÓDULO DE CHECKLISTS

-- 2.1. Tabela de Unidades (Referenciando tenants do chatbot)
CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  cep VARCHAR(9) NOT NULL,
  street VARCHAR(255) NOT NULL,
  neighborhood VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  number VARCHAR(20) NOT NULL,
  complement VARCHAR(150),
  timezone VARCHAR(100) DEFAULT 'America/Sao_Paulo' NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  
  -- Geolocalização
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  radius_meters INT DEFAULT 150,
  require_geolocation BOOLEAN DEFAULT false NOT NULL,
  
  -- Restrições de Horário padrão da unidade
  require_schedule_limits BOOLEAN DEFAULT false NOT NULL,
  max_lead_minutes INT DEFAULT 60,
  max_lag_minutes INT DEFAULT 60,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.2. Exceções de Funcionamento da Unidade (Congelamento operacional)
CREATE TABLE IF NOT EXISTS unit_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT valid_date_range CHECK (start_date <= end_date)
);

-- 2.3. Setores do Restaurante (Cozinha, Salão, Bar, etc.)
CREATE TABLE IF NOT EXISTS sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.4. Perfis dos Usuários do Módulo Operacional (Referenciando auth.users do Supabase)
CREATE TABLE IF NOT EXISTS users_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  pin VARCHAR(5) CHECK (pin ~ '^[0-9]{5}$'), -- PIN de 5 dígitos
  role user_role DEFAULT 'operator' NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.5. Vínculo de Usuários com Unidades
CREATE TABLE IF NOT EXISTS user_unit_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users_profiles(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, unit_id)
);

-- 2.6. Vínculo de Usuários com Setores
CREATE TABLE IF NOT EXISTS user_sector_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users_profiles(id) ON DELETE CASCADE,
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, sector_id)
);

-- 2.7. Tabela de Checklists (Mãe)
CREATE TABLE IF NOT EXISTS checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users_profiles(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  tags VARCHAR(50)[],
  
  -- Regras de Horário específicas
  use_unit_schedule_rules BOOLEAN DEFAULT true NOT NULL,
  min_time_lead_minutes INT DEFAULT 60,
  max_time_lag_minutes INT DEFAULT 60,
  
  is_active BOOLEAN DEFAULT true NOT NULL,
  weight DECIMAL(5,2) DEFAULT 1.00 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.8. Checklist Vinculado a Unidades (N:N)
CREATE TABLE IF NOT EXISTS checklist_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  UNIQUE(checklist_id, unit_id)
);

-- 2.9. Itens do Checklist (Perguntas/Tarefas)
CREATE TABLE IF NOT EXISTS checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  response_type item_response_type NOT NULL,
  is_required BOOLEAN DEFAULT true NOT NULL,
  weight DECIMAL(5,2) DEFAULT 1.00 NOT NULL,
  sort_order INT DEFAULT 0 NOT NULL,
  
  -- Críticos e Evidências
  is_critical BOOLEAN DEFAULT false NOT NULL,
  require_evidence BOOLEAN DEFAULT false NOT NULL,
  permit_observation BOOLEAN DEFAULT true NOT NULL,
  
  -- Limites para Metas Numéricas/Temperatura
  min_meta DECIMAL(10,2),
  max_meta DECIMAL(10,2),
  measurement_unit VARCHAR(20),
  
  -- Opções em JSONB para dropdowns/seleções
  options JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.10. Agendamentos Automáticos de Checklists
CREATE TABLE IF NOT EXISTS checklist_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  responsible_user_id UUID REFERENCES users_profiles(id) ON DELETE SET NULL,
  
  start_time TIME NOT NULL,
  recurrency schedule_recurrency DEFAULT 'daily' NOT NULL,
  days_of_week INT[],
  days_of_month INT[],
  shift VARCHAR(50),
  
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.11. Execuções de Checklists (Instâncias das Rotinas)
CREATE TABLE IF NOT EXISTS checklist_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES checklist_schedules(id) ON DELETE SET NULL,
  
  user_id UUID NOT NULL REFERENCES users_profiles(id),
  scheduled_time TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INT,
  
  status execution_status DEFAULT 'in_progress' NOT NULL,
  score DECIMAL(5,2),
  
  -- Geolocalização capturada no início
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  lat_lng_precision DOUBLE PRECISION,
  distance_calculated DECIMAL(10,2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.12. Respostas dos Itens
CREATE TABLE IF NOT EXISTS checklist_item_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL REFERENCES checklist_executions(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users_profiles(id),
  
  response_value TEXT NOT NULL,
  
  is_conforming BOOLEAN DEFAULT true NOT NULL,
  is_meta_ok BOOLEAN DEFAULT true NOT NULL,
  is_done BOOLEAN DEFAULT true NOT NULL,
  observation TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(execution_id, item_id)
);

-- 2.13. Evidências (Fotos e Anexos)
CREATE TABLE IF NOT EXISTS checklist_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  response_id UUID NOT NULL REFERENCES checklist_item_responses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users_profiles(id),
  
  type VARCHAR(50) DEFAULT 'photo' NOT NULL,
  url TEXT NOT NULL,
  metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.14. Alertas Operacionais
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES checklist_executions(id) ON DELETE CASCADE,
  item_id UUID REFERENCES checklist_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users_profiles(id),
  
  type VARCHAR(100) NOT NULL,
  severity alert_severity DEFAULT 'medium' NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status alert_status DEFAULT 'pending' NOT NULL,
  
  read_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES users_profiles(id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.15. Configurações de Envio de Notificações
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id) ON DELETE CASCADE,
  
  event_type VARCHAR(100) NOT NULL,
  channel VARCHAR(50) NOT NULL,
  recipient_phone VARCHAR(20),
  recipient_email VARCHAR(255),
  is_active BOOLEAN DEFAULT true NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.16. Logs de Notificações Enviadas (Auditoria de Mensagens)
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
  
  channel VARCHAR(50) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  provider_response JSONB,
  error_message TEXT,
  
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.17. Histórico de Eventos de Pontuação (Score)
CREATE TABLE IF NOT EXISTS score_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users_profiles(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES checklist_executions(id) ON DELETE CASCADE,
  
  type VARCHAR(50) NOT NULL,
  points_earned DECIMAL(5,2) NOT NULL,
  points_possible DECIMAL(5,2) NOT NULL,
  details TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.18. Consolidado Periódico do Score
CREATE TABLE IF NOT EXISTS score_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users_profiles(id) ON DELETE CASCADE,
  
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  score_overall DECIMAL(5,2) NOT NULL,
  score_punctuality DECIMAL(5,2) NOT NULL,
  score_effort DECIMAL(5,2) NOT NULL,
  score_quality DECIMAL(5,2) NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, period_start, period_end)
);

-- 2.19. Logs de Auditoria do Módulo
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users_profiles(id) ON DELETE SET NULL,
  
  action VARCHAR(100) NOT NULL,
  entity_name VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  
  prev_data JSONB,
  new_data JSONB,
  ip_address VARCHAR(45),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. ÍNDICES DE PERFORMANCE OTIMIZADOS
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON users_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_units_tenant ON units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sectors_unit ON sectors(unit_id);
CREATE INDEX IF NOT EXISTS idx_checklists_tenant ON checklists(tenant_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_parent ON checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_executions_tenant_date ON checklist_executions(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_unit_status ON checklist_executions(unit_id, status);
CREATE INDEX IF NOT EXISTS idx_responses_execution ON checklist_item_responses(execution_id);
CREATE INDEX IF NOT EXISTS idx_evidences_response ON checklist_evidences(response_id);
CREATE INDEX IF NOT EXISTS idx_alerts_pending ON alerts(tenant_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_score_summaries_user_period ON score_summaries(user_id, period_start, period_end);

-- 4. POLÍTICAS DE RLS (ROW LEVEL SECURITY)
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_unit_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sector_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_item_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_evidences ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 4.1. Funções Auxiliares de RLS
CREATE OR REPLACE FUNCTION get_auth_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM users_profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_auth_tenant_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users_profiles
    WHERE id = auth.uid() AND role IN ('company_admin', 'super_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION has_access_to_unit(p_unit_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF is_auth_tenant_admin() THEN
    RETURN EXISTS (
      SELECT 1 FROM units 
      WHERE id = p_unit_id AND tenant_id = get_auth_tenant_id()
    );
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM user_unit_permissions
    WHERE user_id = auth.uid() AND unit_id = p_unit_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 4.2. Definição das Políticas de Acesso

-- Unidades
CREATE POLICY select_units ON units
  FOR SELECT USING (tenant_id = get_auth_tenant_id() AND has_access_to_unit(id));

CREATE POLICY admin_manage_units ON units
  FOR ALL USING (tenant_id = get_auth_tenant_id() AND is_auth_tenant_admin());

-- Perfis
CREATE POLICY select_profiles ON users_profiles
  FOR SELECT USING (tenant_id = get_auth_tenant_id());

CREATE POLICY admin_manage_profiles ON users_profiles
  FOR ALL USING (tenant_id = get_auth_tenant_id() AND is_auth_tenant_admin());

-- Checklists
CREATE POLICY select_checklists ON checklists
  FOR SELECT USING (
    tenant_id = get_auth_tenant_id() AND (
      is_auth_tenant_admin() OR
      EXISTS (
        SELECT 1 FROM checklist_units cu
        WHERE cu.checklist_id = checklists.id AND has_access_to_unit(cu.unit_id)
      )
    )
  );

CREATE POLICY admin_manage_checklists ON checklists
  FOR ALL USING (tenant_id = get_auth_tenant_id() AND is_auth_tenant_admin());

-- Execuções
CREATE POLICY select_executions ON checklist_executions
  FOR SELECT USING (tenant_id = get_auth_tenant_id() AND has_access_to_unit(unit_id));

CREATE POLICY insert_executions ON checklist_executions
  FOR INSERT WITH CHECK (
    tenant_id = get_auth_tenant_id() AND
    has_access_to_unit(unit_id) AND
    user_id = auth.uid()
  );

CREATE POLICY update_own_executions ON checklist_executions
  FOR UPDATE USING (tenant_id = get_auth_tenant_id() AND user_id = auth.uid())
  WITH CHECK (tenant_id = get_auth_tenant_id() AND user_id = auth.uid());

-- Respostas
CREATE POLICY select_responses ON checklist_item_responses
  FOR SELECT USING (tenant_id = get_auth_tenant_id());

CREATE POLICY insert_own_responses ON checklist_item_responses
  FOR INSERT WITH CHECK (tenant_id = get_auth_tenant_id() AND user_id = auth.uid());

CREATE POLICY update_own_responses ON checklist_item_responses
  FOR UPDATE USING (tenant_id = get_auth_tenant_id() AND user_id = auth.uid());

-- 5. TRIGGER: ALERTA DE ITEM CRÍTICO FORA DE CONFORMIDADE
CREATE OR REPLACE FUNCTION trigger_generate_critical_item_alert()
RETURNS TRIGGER AS $$
DECLARE
  v_is_critical BOOLEAN;
  v_item_title VARCHAR(255);
  v_checklist_title VARCHAR(255);
  v_execution_unit_id UUID;
  v_execution_sector_id UUID;
  v_execution_checklist_id UUID;
  v_operator_name VARCHAR(255);
BEGIN
  SELECT is_critical, title, checklist_id INTO v_is_critical, v_item_title, v_execution_checklist_id
  FROM checklist_items
  WHERE id = NEW.item_id;

  IF v_is_critical = FALSE OR v_is_critical IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_conforming = FALSE OR NEW.is_meta_ok = FALSE OR NEW.is_done = FALSE THEN
    SELECT unit_id, sector_id, user_id INTO v_execution_unit_id, v_execution_sector_id, NEW.user_id
    FROM checklist_executions
    WHERE id = NEW.execution_id;

    SELECT title INTO v_checklist_title FROM checklists WHERE id = v_execution_checklist_id;
    SELECT name INTO v_operator_name FROM users_profiles WHERE id = NEW.user_id;

    INSERT INTO alerts (
      tenant_id,
      unit_id,
      sector_id,
      checklist_id,
      execution_id,
      item_id,
      user_id,
      type,
      severity,
      title,
      message
    ) VALUES (
      NEW.tenant_id,
      v_execution_unit_id,
      v_execution_sector_id,
      v_execution_checklist_id,
      NEW.execution_id,
      NEW.item_id,
      NEW.user_id,
      'critical_item_fail',
      'critical',
      '🚨 Item Crítico Não Conforme: ' || v_item_title,
      'O operador ' || v_operator_name || ' assinalou uma falha crítica no checklist "' || v_checklist_title || '". Resposta informada: ' || NEW.response_value || '.'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_critical_item_alert ON checklist_item_responses;
CREATE TRIGGER trg_critical_item_alert
  AFTER INSERT OR UPDATE ON checklist_item_responses
  FOR EACH ROW
  EXECUTE FUNCTION trigger_generate_critical_item_alert();

-- 6. TRIGGER: CÁLCULO AUTOMÁTICO DE SCORE DE EXECUÇÃO
CREATE OR REPLACE FUNCTION calculate_execution_score()
RETURNS TRIGGER AS $$
DECLARE
  v_total_items_weight DECIMAL(10,2) := 0.00;
  v_conforming_items_weight DECIMAL(10,2) := 0.00;
  v_punctuality_points DECIMAL(5,2) := 0.00;
  v_quality_points DECIMAL(5,2) := 0.00;
  v_final_score DECIMAL(5,2) := 0.00;
  v_item_record RECORD;
  v_resp_record RECORD;
BEGIN
  IF NEW.status IN ('completed_on_time', 'completed_late') AND (OLD.status IS NULL OR OLD.status = 'in_progress') THEN
    IF NEW.status = 'completed_on_time' THEN
      v_punctuality_points := 100.00;
    ELSE
      v_punctuality_points := 50.00;
    END IF;

    FOR v_item_record IN 
      SELECT id, weight FROM checklist_items WHERE checklist_id = NEW.checklist_id AND is_required = TRUE
    LOOP
      v_total_items_weight := v_total_items_weight + v_item_record.weight;
      
      SELECT is_conforming, is_meta_ok, is_done INTO v_resp_record
      FROM checklist_item_responses
      WHERE execution_id = NEW.id AND item_id = v_item_record.id;

      IF FOUND THEN
        IF v_resp_record.is_conforming = TRUE AND v_resp_record.is_meta_ok = TRUE AND v_resp_record.is_done = TRUE THEN
          v_conforming_items_weight := v_conforming_items_weight + v_item_record.weight;
        END IF;
      END IF;
    END LOOP;

    IF v_total_items_weight > 0 THEN
      v_quality_points := (v_conforming_items_weight / v_total_items_weight) * 100.00;
    ELSE
      v_quality_points := 100.00;
    END IF;

    v_final_score := (0.40 * v_punctuality_points) + (0.60 * v_quality_points);
    NEW.score := v_final_score;

    INSERT INTO score_events (
      tenant_id, unit_id, user_id, execution_id, type, points_earned, points_possible, details
    ) VALUES 
      (NEW.tenant_id, NEW.unit_id, NEW.user_id, NEW.id, 'punctuality', v_punctuality_points, 100.00, 'Pontualidade da rotina.'),
      (NEW.tenant_id, NEW.unit_id, NEW.user_id, NEW.id, 'quality', v_quality_points, 100.00, 'Qualidade do preenchimento.');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_calculate_execution_score ON checklist_executions;
CREATE TRIGGER trg_calculate_execution_score
  BEFORE UPDATE ON checklist_executions
  FOR EACH ROW
  EXECUTE FUNCTION calculate_execution_score();
