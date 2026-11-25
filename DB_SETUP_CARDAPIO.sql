-- ============================================================================
-- SCRIPT DE SETUP: TABELAS DO CARDÁPIO ONLINE E ADICIONAIS (GASTROFOOD)
-- PARA CONSULTA DA INTELIGÊNCIA ARTIFICIAL (LUNA IA) NO WHATSAPP
-- ============================================================================

-- 1. Tabela de Grupos / Categorias do Cardápio
CREATE TABLE IF NOT EXISTS cardapio_grupos (
    id TEXT,
    tenant_id UUID NOT NULL,
    ordem INTEGER DEFAULT 0,
    descricao TEXT NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id)
);
ALTER TABLE cardapio_grupos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo em cardapio_grupos" ON cardapio_grupos;
CREATE POLICY "Permitir tudo em cardapio_grupos" ON cardapio_grupos FOR ALL USING (true) WITH CHECK (true);

-- 2. Tabela de Produtos
CREATE TABLE IF NOT EXISTS cardapio_produtos (
    id TEXT,
    tenant_id UUID NOT NULL,
    grupo_id TEXT,
    codigo TEXT,
    codigo_pdv TEXT,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    image TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    tem_passos BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, grupo_id) REFERENCES cardapio_grupos(tenant_id, id) ON DELETE CASCADE
);
ALTER TABLE cardapio_produtos ADD COLUMN IF NOT EXISTS codigo TEXT;
ALTER TABLE cardapio_produtos ADD COLUMN IF NOT EXISTS codigo_pdv TEXT;
ALTER TABLE cardapio_produtos ADD COLUMN IF NOT EXISTS tem_passos BOOLEAN DEFAULT FALSE;
ALTER TABLE cardapio_produtos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo em cardapio_produtos" ON cardapio_produtos;
CREATE POLICY "Permitir tudo em cardapio_produtos" ON cardapio_produtos FOR ALL USING (true) WITH CHECK (true);

-- 3. Tabela de Passos (Perguntas / Obrigatoriedades de Adicionais)
CREATE TABLE IF NOT EXISTS cardapio_passos (
    id TEXT,
    tenant_id UUID NOT NULL,
    produto_id TEXT,
    pergunta TEXT NOT NULL,
    sub_titulo TEXT,
    qtd_min INTEGER DEFAULT 0,
    qtd_max INTEGER DEFAULT 1,
    qtd_free INTEGER DEFAULT 0,
    numero_passo INTEGER DEFAULT 1,
    tipo_calc_custom INTEGER DEFAULT 0,
    obrigatorio BOOLEAN DEFAULT FALSE,
    passo_adicionais BOOLEAN DEFAULT FALSE,
    ordem INTEGER DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, produto_id) REFERENCES cardapio_produtos(tenant_id, id) ON DELETE CASCADE
);
ALTER TABLE cardapio_passos ADD COLUMN IF NOT EXISTS qtd_free INTEGER DEFAULT 0;
ALTER TABLE cardapio_passos ADD COLUMN IF NOT EXISTS numero_passo INTEGER DEFAULT 1;
ALTER TABLE cardapio_passos ADD COLUMN IF NOT EXISTS tipo_calc_custom INTEGER DEFAULT 0;
ALTER TABLE cardapio_passos ADD COLUMN IF NOT EXISTS obrigatorio BOOLEAN DEFAULT FALSE;
ALTER TABLE cardapio_passos ADD COLUMN IF NOT EXISTS passo_adicionais BOOLEAN DEFAULT FALSE;
ALTER TABLE cardapio_passos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo em cardapio_passos" ON cardapio_passos;
CREATE POLICY "Permitir tudo em cardapio_passos" ON cardapio_passos FOR ALL USING (true) WITH CHECK (true);

-- 4. Tabela de Opções / Itens Selecionáveis dos Passos
CREATE TABLE IF NOT EXISTS cardapio_opcoes (
    id TEXT,
    tenant_id UUID NOT NULL,
    passo_id TEXT,
    produto_opcao_id TEXT,
    codigo TEXT,
    codigo_pdv TEXT,
    descricao TEXT NOT NULL,
    preco NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    imagem TEXT,
    ordem INTEGER DEFAULT 0,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, passo_id) REFERENCES cardapio_passos(tenant_id, id) ON DELETE CASCADE
);
ALTER TABLE cardapio_opcoes ADD COLUMN IF NOT EXISTS produto_opcao_id TEXT;
ALTER TABLE cardapio_opcoes ADD COLUMN IF NOT EXISTS codigo TEXT;
ALTER TABLE cardapio_opcoes ADD COLUMN IF NOT EXISTS codigo_pdv TEXT;
ALTER TABLE cardapio_opcoes ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0;
ALTER TABLE cardapio_opcoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo em cardapio_opcoes" ON cardapio_opcoes;
CREATE POLICY "Permitir tudo em cardapio_opcoes" ON cardapio_opcoes FOR ALL USING (true) WITH CHECK (true);
