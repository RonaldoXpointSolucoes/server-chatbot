-- ============================================================================
-- SCRIPT DE SETUP: TABELAS DO CARDÁPIO ONLINE E ADICIONAIS (GASTROFOOD)
-- PARA CONSULTA DA INTELIGÊNCIA ARTIFICIAL (LUNA IA) NO WHATSAPP
-- ============================================================================

-- 1. Tabela de Grupos / Categorias do Cardápio
CREATE TABLE IF NOT EXISTS cardapio_grupos (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL,
    ordem INTEGER DEFAULT 0,
    descricao TEXT NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE cardapio_grupos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo em cardapio_grupos" ON cardapio_grupos;
CREATE POLICY "Permitir tudo em cardapio_grupos" ON cardapio_grupos FOR ALL USING (true) WITH CHECK (true);

-- 2. Tabela de Produtos
CREATE TABLE IF NOT EXISTS cardapio_produtos (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL,
    grupo_id TEXT REFERENCES cardapio_grupos(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    image TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE cardapio_produtos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo em cardapio_produtos" ON cardapio_produtos;
CREATE POLICY "Permitir tudo em cardapio_produtos" ON cardapio_produtos FOR ALL USING (true) WITH CHECK (true);

-- 3. Tabela de Passos (Perguntas / Obrigatoriedades de Adicionais)
CREATE TABLE IF NOT EXISTS cardapio_passos (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL,
    produto_id TEXT REFERENCES cardapio_produtos(id) ON DELETE CASCADE,
    pergunta TEXT NOT NULL,
    sub_titulo TEXT,
    qtd_min INTEGER DEFAULT 0,
    qtd_max INTEGER DEFAULT 1,
    ordem INTEGER DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE cardapio_passos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo em cardapio_passos" ON cardapio_passos;
CREATE POLICY "Permitir tudo em cardapio_passos" ON cardapio_passos FOR ALL USING (true) WITH CHECK (true);

-- 4. Tabela de Opções / Itens Selecionáveis dos Passos
CREATE TABLE IF NOT EXISTS cardapio_opcoes (
    id TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL,
    passo_id TEXT REFERENCES cardapio_passos(id) ON DELETE CASCADE,
    descricao TEXT NOT NULL,
    preco NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    imagem TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE cardapio_opcoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo em cardapio_opcoes" ON cardapio_opcoes;
CREATE POLICY "Permitir tudo em cardapio_opcoes" ON cardapio_opcoes FOR ALL USING (true) WITH CHECK (true);
