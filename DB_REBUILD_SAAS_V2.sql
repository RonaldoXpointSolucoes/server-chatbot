-- DESTROI TUDO EXISTENTE PARA GARANTIR LIMPEZA
drop table if exists outbox_events cascade;
drop table if exists handoff_sessions cascade;
drop table if exists messages cascade;
drop table if exists conversations cascade;
drop table if exists contacts cascade;
drop table if exists wa_auth_keys cascade;
drop table if exists wa_auth_credentials cascade;
drop table if exists whatsapp_instance_runtime cascade;
drop table if exists whatsapp_instances cascade;
drop table if exists tenant_users cascade;
drop table if exists knowledge_embeddings cascade;
drop table if exists knowledge_chunks cascade;
drop table if exists knowledge_documents cascade;
drop table if exists knowledge_base cascade;
drop table if exists tenants cascade;

create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- 9.1 tenants
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  plan text default 'free',
  status text default 'active',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 9.2 tenant_users
create table tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null, -- referência ao auht.users (Supabase nativo) ou gerado externamente
  role text default 'agent', -- 'owner', 'admin', 'agent', 'viewer'
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique (tenant_id, user_id)
);

-- 9.3 whatsapp_instances
create table whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  display_name text,
  phone_number text,
  status text default 'offline', -- 'offline', 'connecting', 'qr_ready', 'connected'
  assigned_node_id text, -- qual worker é dono
  lease_until timestamp with time zone,
  last_error text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 9.4 whatsapp_instance_runtime
create table whatsapp_instance_runtime (
  instance_id uuid primary key references whatsapp_instances(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  qr_code text,
  pairing_code text,
  socket_state text,
  sync_progress jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 9.5 wa_auth_credentials
create table wa_auth_credentials (
  instance_id uuid primary key references whatsapp_instances(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  creds_data jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 9.6 wa_auth_keys
create table wa_auth_keys (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references whatsapp_instances(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  key_name text not null,
  key_data jsonb not null,
  unique(instance_id, key_name)
);

-- 9.7 contacts
create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text,
  phone text not null, -- number without +
  whatsapp_jid text, -- original JID do whatsapp
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(tenant_id, phone)
);

-- 9.8 conversations
create table conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  status text default 'bot', -- 'open', 'human', 'bot', 'closed'
  assigned_to uuid references tenant_users(id) on delete set null,
  unread_count integer default 0,
  last_message_preview text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 9.9 messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null, -- 'inbound' ou 'outbound'
  message_type text default 'text', -- 'text', 'image', 'audio', etc
  status text default 'sent', -- 'sent', 'delivered', 'read', 'failed'
  text_content text,
  media_url text,
  raw_payload jsonb,
  whatsapp_message_id text, -- stanza id
  sender_type text default 'client', -- 'client', 'bot', 'human', 'system'
  timestamp timestamp with time zone default timezone('utc'::text, now())
);

-- 9.10 handoff_sessions
create table handoff_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  agent_id uuid references tenant_users(id) on delete set null,
  started_at timestamp with time zone default timezone('utc'::text, now()),
  ended_at timestamp with time zone
);

-- 9.11 outbox_events
create table outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text default 'pending', -- 'pending', 'processing', 'completed', 'failed'
  retry_count integer default 0,
  next_retry_at timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 9.12 knowledge_documents / chunks / embeddings
create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null,
  source_type text, -- 'pdf', 'url', 'text'
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  content text not null,
  chunk_index integer
);

create table knowledge_embeddings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  chunk_id uuid not null references knowledge_chunks(id) on delete cascade,
  embedding vector(1536)
);

-- RLS (Row Level Security)
alter table tenants enable row level security;
alter table tenant_users enable row level security;
alter table whatsapp_instances enable row level security;
alter table whatsapp_instance_runtime enable row level security;
alter table wa_auth_credentials enable row level security;
alter table wa_auth_keys enable row level security;
alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table handoff_sessions enable row level security;
alter table outbox_events enable row level security;
alter table knowledge_documents enable row level security;
alter table knowledge_chunks enable row level security;
alter table knowledge_embeddings enable row level security;

-- Setup de Policies "Global para API" nesta etapa inicial da arquitetura
-- Em produção pesada, usar o auth.uid() = user_id
create policy "Allow all on tenants" on tenants for all using (true);
create policy "Allow all on tenant_users" on tenant_users for all using (true);
create policy "Allow all on whatsapp_instances" on whatsapp_instances for all using (true);
create policy "Allow all on whatsapp_instance_runtime" on whatsapp_instance_runtime for all using (true);
create policy "Allow all on wa_auth_credentials" on wa_auth_credentials for all using (true);
create policy "Allow all on wa_auth_keys" on wa_auth_keys for all using (true);
create policy "Allow all on contacts" on contacts for all using (true);
create policy "Allow all on conversations" on conversations for all using (true);
create policy "Allow all on messages" on messages for all using (true);
create policy "Allow all on handoff_sessions" on handoff_sessions for all using (true);
create policy "Allow all on outbox_events" on outbox_events for all using (true);
create policy "Allow all on knowledge_documents" on knowledge_documents for all using (true);
create policy "Allow all on knowledge_chunks" on knowledge_chunks for all using (true);
create policy "Allow all on knowledge_embeddings" on knowledge_embeddings for all using (true);


-- REALTIME PUBLICATIONS (Importante: as instâncias e mensagens precisam acender o painel ao vivo)
drop publication if exists supabase_realtime;
create publication supabase_realtime;
alter publication supabase_realtime add table tenants;
alter publication supabase_realtime add table whatsapp_instances;
alter publication supabase_realtime add table whatsapp_instance_runtime;
alter publication supabase_realtime add table contacts;
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table messages;
