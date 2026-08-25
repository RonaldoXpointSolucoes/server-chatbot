-- ALTERAÇÕES NA TABELA whatsapp_instances PARA COMPATIBILIDADE COM O EDGE BR
ALTER TABLE whatsapp_instances 
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS egress_ip text,
  ADD COLUMN IF NOT EXISTS egress_country text,
  ADD COLUMN IF NOT EXISTS egress_city text,
  ADD COLUMN IF NOT EXISTS reconnect_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disconnect_count_1h integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pair_count_24h integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safety_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_connected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_disconnected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_disconnect_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- TABELA DE FILA DE MENSAGENS DE SAÍDA (OUTBOX QUEUE)
CREATE TABLE IF NOT EXISTS wa_outgoing_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chat_jid text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  body text,
  media_url text,
  response_type text DEFAULT 'STANDARD',
  options jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed', 'paused', 'cancelled'
  priority integer NOT NULL DEFAULT 5,
  scheduled_at timestamp with time zone NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- TABELA DE LOG DE MENSAGENS DE ENTRADA (INCOMING LOG)
CREATE TABLE IF NOT EXISTS wa_incoming_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  chat_jid text NOT NULL,
  message_id text NOT NULL,
  from_me boolean NOT NULL DEFAULT false,
  push_name text,
  body text,
  message_type text,
  raw_payload jsonb,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(instance_id, message_id)
);

-- TABELA DE LOGS DE CONEXÃO E AUDITORIA DE IP
CREATE TABLE IF NOT EXISTS wa_connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  node_id text,
  event_type text NOT NULL, -- 'ip_check_ok', 'ip_check_failed', 'connecting', 'connected', etc
  connection_status text,
  disconnect_reason text,
  egress_ip text,
  egress_country text,
  payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- TABELA DE FILA DE COMANDOS DE CONTROLE REMOTO DA SESSÃO
CREATE TABLE IF NOT EXISTS wa_session_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  command text NOT NULL, -- 'connect', 'disconnect', 'restart', 'request_qr', etc
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  payload jsonb,
  result jsonb,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone
);

-- ATIVAÇÃO DE ROW LEVEL SECURITY (RLS) PARA AS NOVAS TABELAS
ALTER TABLE wa_outgoing_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_incoming_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_connection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_session_commands ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS DE ACESSO BASE (GLOBAL PARA MVP)
DROP POLICY IF EXISTS "Allow all on wa_outgoing_messages" ON wa_outgoing_messages;
CREATE POLICY "Allow all on wa_outgoing_messages" ON wa_outgoing_messages FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on wa_incoming_messages" ON wa_incoming_messages;
CREATE POLICY "Allow all on wa_incoming_messages" ON wa_incoming_messages FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on wa_connection_events" ON wa_connection_events;
CREATE POLICY "Allow all on wa_connection_events" ON wa_connection_events FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on wa_session_commands" ON wa_session_commands;
CREATE POLICY "Allow all on wa_session_commands" ON wa_session_commands FOR ALL USING (true) WITH CHECK (true);

-- REGISTRO DAS TABELAS NO SUPABASE REALTIME
-- Nota: Habilita envio de eventos em tempo real para as novas filas
ALTER PUBLICATION supabase_realtime ADD TABLE wa_outgoing_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE wa_incoming_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE wa_session_commands;
