-- Índices de Alta Performance para Aceleração Instantânea de Mensagens e Conversas
-- Elimina Seq Scan em tabelas com mais de 100k linhas

-- 1. Mensagens por Conversa e Data (Crucial para abrir chat em 10ms)
CREATE INDEX IF NOT EXISTS idx_messages_conv_timestamp_desc 
ON public.messages (conversation_id, timestamp DESC);

-- 2. Mensagens por Tenant e Conversa
CREATE INDEX IF NOT EXISTS idx_messages_tenant_conv 
ON public.messages (tenant_id, conversation_id);

-- 3. Conversas por Tenant, Instância e Data da Última Mensagem (Crucial para Sidebar)
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_inst_lastmsg 
ON public.conversations (tenant_id, instance_id, last_message_at DESC);

-- 4. Conversas por Contato e Tenant
CREATE INDEX IF NOT EXISTS idx_conversations_contact_tenant 
ON public.conversations (contact_id, tenant_id);

-- 5. Contatos por Tenant e Telefone
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_phone 
ON public.contacts (tenant_id, phone);

-- 6. Contatos por Tenant e WhatsApp JID
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_jid 
ON public.contacts (tenant_id, whatsapp_jid);

-- 7. Anotações/Tarefas de Contato por Tenant e Data
CREATE INDEX IF NOT EXISTS idx_contact_notes_tenant_contact 
ON public.contact_notes (tenant_id, contact_id, created_at DESC);
