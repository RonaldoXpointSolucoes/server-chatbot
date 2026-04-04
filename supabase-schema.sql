-- Habilita extensão de vetores nativa
create extension if not exists vector;

-- Tabela de Restaurantes (Tenants)
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  evolution_instance_name text,
  n8n_webhook_url text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Tabela de Contatos (Clientes do Restaurante)
create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  name text,
  phone text not null,
  evolution_remote_jid text not null,
  bot_status text default 'active', -- 'active' ou 'paused' (quando humano assume)
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(tenant_id, phone)
);

-- Tabela de Mensagens
create table messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  whatsapp_id text unique, -- id original da evolution api (evita dupes)
  text_content text,
  sender_type text not null, -- 'client', 'bot', 'human', 'system'
  timestamp timestamp with time zone default timezone('utc'::text, now())
);

-- Tabela da Base de Conhecimento RAG (Cardápio, FAQs, Taxas)
create table knowledge_base (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  content text not null,
  category text,
  embedding vector(1536), -- Vector format para o OpenAI/OpenRouter
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- ATIVAÇÃO DE SEGURANÇA (Row Level Security)
alter table tenants enable row level security;
alter table contacts enable row level security;
alter table messages enable row level security;
alter table knowledge_base enable row level security;

-- Políticas Base (Permite acesso irrestrito para Autenticados neste estágio inicial do MVP, para fácil conexão por n8n e Front)
create policy "Enable all for public" on tenants for all using (true);
create policy "Enable all for public" on contacts for all using (true);
create policy "Enable all for public" on messages for all using (true);
create policy "Enable all for public" on knowledge_base for all using (true);

-- ATIVAÇÃO DE REALTIME WEBSOCKET (Supabase Realtime)
-- Estes comandos são obrigatórios para habilitar o envio de eventos (INSERT/UPDATE/DELETE) 
-- pela nuvem até a interface em React (Zustand), caso contrário os balões não piscam na tela.
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table contacts;
