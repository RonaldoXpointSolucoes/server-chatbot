# 🏛️ Especificação Técnica da Arquitetura Next-Gen (v8.0) & Infraestrutura Homologada

Este documento define a nova arquitetura do ecossistema **ChatBoot**, concebida para **Alta Disponibilidade (99.99%)**, isolamento de falhas, eliminação de custos recorrentes de cloud de terceiros e escalabilidade linear em infraestrutura própria dedicada (VPS Hostinger KVM 2 com **Coolify** e **Appwrite**).

---

## 🖥️ 1. Infraestrutura Homologada & Validada em Produção

A infraestrutura foi testada e aprovada com sucesso via **SSH Root** e **Coolify Web Engine** em 03/09/2026:

| Parâmetro | Telemetria Real da Máquina | Status |
| :--- | :--- | :---: |
| **Endereço IPv4** | `179.199.142.157` | 🟢 Ativo |
| **Hostname** | `srv1954006.hstgr.cloud` | 🟢 Resolvido |
| **Localização** | Data Center Campinas, São Paulo (Brasil) — Baixíssima Latência | 🟢 <10ms |
| **Sistema Operacional** | Ubuntu 24.04 LTS (Kernel Linux 6.8.0-138-generic x86_64) | 🟢 Estável |
| **Processador (CPU)** | 2 vCPUs Dedicadas (Hostinger KVM 2) | 🟢 Idle |
| **Memória RAM** | **7.8 GB Total** • 1.1 GB Usado • **6.7 GB Livres** | 🟢 Ampla |
| **Armazenamento SSD** | **96 GB Total** • 7.2 GB Usado • **89 GB Livres (8% de uso)** | 🟢 89 GB NVMe |
| **Portas Abertas & Validadas** | 22 (SSH), 80 (HTTP), 443 (HTTPS), 8000 (Painel Coolify) | 🟢 Aprovadas |
| **Painel de Orquestração** | `https://coolify.xpointsolucoes.com.br` (SSL Let's Encrypt Ativo) | 🟢 Online Oficial |

### 🐳 Containers Ativos e Saudáveis no Coolify:
```
NAMES              STATUS                       PORTS
coolify-proxy      Up About an hour (healthy)   0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp, 0.0.0.0:8080->8080/tcp
coolify            Up About an hour (healthy)   0.0.0.0:8000->8080/tcp
coolify-db         Up About an hour (healthy)   5432/tcp (PostgreSQL)
coolify-redis      Up About an hour (healthy)   6379/tcp (Redis)
coolify-realtime   Up About an hour (healthy)   0.0.0.0:6001-6002->6001-6002/tcp (WebSockets)
coolify-sentinel   Up About an hour (healthy)   (Health Monitor)
```

---

## 🎯 2. Topologia dos 4 Microserviços na VPS Única

```mermaid
flowchart TD
    subgraph Internet ["🌐 Internet / Clientes"]
        WA["WhatsApp Network"]
        USER["Operadores & Clientes (Web / PWA)"]
        ERP["ERP Externo (Gastrofood / Webhooks)"]
    end

    subgraph VPS ["🖥️ VPS Dedicada (179.199.142.157 - Coolify Managed)"]
        PROXY["Reverse Proxy SSL (Traefik / Caddy)"]

        subgraph S1 ["1. Motor WhatsApp (Go)"]
            WM["Whatsmeow Engine (Go)\n• REST API Fiber / Sockets\n• SQLite / PG Session Store\n• 10MB a 25MB RAM / Sessão"]
        end

        subgraph S2 ["2. Servidor de IA & Chaves"]
            AI["AI Worker Engine (Node)\n• Vault Seguro de Chaves\n• Gemini 1.5/2.0 / OpenAI\n• RAG & Embeddings Locais\n• Fila Assíncrona Redis"]
        end

        subgraph S3 ["3. Servidor de Regras (Core)"]
            CORE["Core Business Engine (Node)\n• CRM Kanban & Fila Dev\n• Checklists Operacionais\n• Vouchers B2B & Ledger\n• Tickets & Atendimento\n• 100% Independente do WhatsApp"]
        end

        subgraph S4 ["4. Appwrite Self-Hosted"]
            AW_DB["Appwrite Databases (NoSQL / JSON)"]
            AW_RT["Appwrite Realtime (WebSockets)"]
            AW_ST["Appwrite Storage (SSD NVMe Local)"]
            AW_AUTH["Appwrite Auth & Teams (Multitenant)"]
        end

        REDIS["⚡ Redis Message Broker & Cache"]
    end

    WA <--> WM
    USER <--> PROXY
    ERP <--> PROXY
    PROXY --> WM
    PROXY --> CORE
    PROXY --> AW_DB
    PROXY --> USER

    WM <-->|Webhooks & REST| CORE
    CORE <-->|POST /ai/generate| AI
    CORE <-->|SDK Appwrite| AW_DB
    CORE <-->|Mídias| AW_ST
    CORE <--> REDIS
    WM <--> REDIS
    AI <--> REDIS
    AW_RT -.->|Realtime Updates| USER
```

---

## 🚀 3. Comparativo: Stack Anterior vs. Nova Stack Next-Gen

| Critério | Stack Anterior (v7.x) | Nova Stack Next-Gen (v8.x) | Ganho Estratégico |
| :--- | :--- | :--- | :--- |
| **Motor WhatsApp** | Baileys (Node.js) | **Whatsmeow (Go Nativo)** | **10x menos memória** (15MB vs 180MB/sessão), zero travamentos de Garbage Collector. |
| **Banco de Dados** | Supabase Cloud (Postgres) | **Appwrite Self-Hosted (VPS)** | **Custo $0 de nuvem externa**, sem limites de conexões pool ou egress de dados. |
| **Servidor de IA** | Acoplado no worker de automação | **Microserviço Dedicado de IA** | Chaves de API isoladas em vault, fila de geração assíncrona, não bloqueia o chat. |
| **Regras de Negócio** | Acopladas ao ciclo do Baileys | **Core Business Engine Independente** | **CRM e Checklists continuam 100% no ar** mesmo se instâncias de WhatsApp reiniciarem. |
| **Storage de Mídias** | Supabase Storage (Cloud) | **Appwrite Storage Local (SSD/NVMe)** | Armazenamento de áudios, comprovantes e fotos ilimitado sem cobrança por GB. |
| **Orquestração** | Deploy misto Vercel + Coolify | **Coolify Centralizado na VPS** | Monitoramento unificado, healthchecks automáticos e rollback instantâneo. |

---

## ⚡ 4. Especificação Técnica dos Microserviços

### 🔹 Serviço 1: Whatsmeow Engine (Go)
* **Repositório oficial**: [tulir/whatsmeow](https://github.com/tulir/whatsmeow)
* **Linguagem**: Go (Golang 1.22+)
* **Responsabilidade Exclusiva**:
  - Manter sockets WhatsApp multidevice de altíssima performance.
  - Gerenciar pareamento via QR Code e reconexão com backoff exponencial.
  - Encriptação e decriptação Signal Protocol executada em binário compilado nativo.
  - Expor API REST leve para envio de texto, áudio PTT, imagens, documentos e botões.
  - Disparar Webhooks HTTP imediatos para o **Core Business Engine** ao receber mensagens ou recibos (`sent`, `delivered`, `read`).

### 🔹 Serviço 2: AI Worker Service (Vault de Chaves & RAG)
* **Linguagem**: Node.js 22 LTS / Fastify
* **Responsabilidade Exclusiva**:
  - Centralizar todas as chaves secretas de provedores de IA (`GEMINI_API_KEY`, `OPENAI_API_KEY`, etc.) em um único container isolado da internet externa.
  - Executar embeddings e busca vetorial (RAG) em bases de conhecimento e cardápios digitais.
  - Processar filas assíncronas de IA via Redis para garantir tempo de resposta previsível.
  - Rate-limiting por tenant e quotas de consumo para proteção contra abusos.

### 🔹 Serviço 3: Core Business Engine (Regras de Negócio)
* **Linguagem**: Node.js Express / Fastify
* **Responsabilidade Exclusiva**:
  - CRM Kanban e pipelines de vendas (incluindo fila automatizada de desenvolvimento).
  - Checklists operacionais, tablets de conformidade de cozinha e auditoria fotográfica.
  - Vouchers corporativos B2B, leitura de QR Codes e extrato financeiro (ledger).
  - Tickets de atendimento, triagem automática, handoff Bot ➔ Humano.
  - Integrações com ERPs (Gastrofood) com cache persistente e janela de proteção de 1 hora.
  - **Zero acoplamento**: Se o WhatsApp cair ou sofrer banimento, as regras operacionais da empresa continuam operando normalmente.

### 🔹 Serviço 4: Appwrite Self-Hosted (BaaS Próprio na VPS)
* **Responsabilidade Exclusiva**:
  - **Databases**: Coleções de `conversations`, `messages`, `checklists`, `vouchers`, `crm_cards`.
  - **Realtime**: WebSockets nativos para sincronizar mensagens, status de digitação e cards no frontend.
  - **Storage**: Buckets locais para arquivos, fotos de checklists e áudios de clientes no SSD local.
  - **Auth & Teams**: Isolamento multitenant nativo por equipes/tenants via permissões granulares de coleção.

---

## 📅 5. Roadmap Prático de Implementação (Passo a Passo)

### 📍 Fase 1: Provisionamento do Appwrite Self-Hosted
1. Deploy da stack oficial do Appwrite via Docker Compose no Coolify na porta 8080/443.
2. Mapeamento de volumes persistentes do MariaDB/Postgres e Storage no SSD da VPS.
3. Criação do projeto `chatboot-production` e configuração de coleções, atributos e índices.
4. Geração de chaves de API com escopos completos para o backend.

### 📍 Fase 2: Motor Whatsmeow em Go Puro
1. Criação do módulo Go `services/whatsmeow-engine` utilizando `tulir/whatsmeow`.
2. Implementação da camada de persistência de credenciais e chaves criptográficas.
3. Criação da API REST leve em Go (Fiber) para gerenciamento de instâncias e mensagens.
4. Implementação do despachante de Webhooks para notificação instantânea de eventos ao Core Engine.
5. Dockerfile multi-stage com compilação estática em Go gerando imagem ultraleve de ~18MB.

### 📍 Fase 3: Servidor de IA & Vault de Chaves
1. Criação do container `services/ai-engine` isolado.
2. Centralização das chaves de API e integração com Google Gemini e OpenAI.
3. Criação de workers de fila assíncrona (Redis/BullMQ) para geração sem bloqueio de I/O.
4. Motor RAG local para indexação e consulta semântica de cardápios.

### 📍 Fase 4: Core Business Engine (Regras de Negócio)
1. Criação do container `services/business-engine`.
2. Implementação dos controladores de CRM, Checklists, Vouchers, Tickets e Gastrofood.
3. Integração direta com o Appwrite via SDK Server oficial.
4. Recepção e roteamento dos Webhooks enviados pelo Whatsmeow.

### 📍 Fase 5: Migração Gradual & Handoff de Produção
1. Execução de script de migração pontual de dados históricos do Supabase para o Appwrite.
2. Chaveamento do frontend React para escutar os WebSockets do Appwrite Realtime.
3. Testes E2E completos e virada de tráfego definitiva para a nova VPS.

---

## 📁 6. Estrutura de Diretórios Monorepo

```
ChatBoot/
├── services/
│   ├── whatsmeow-engine/         # Microserviço WhatsApp em GO (tulir/whatsmeow)
│   │   ├── main.go               # API REST Fiber / Gin
│   │   ├── session/              # Store de credenciais de sessão
│   │   ├── handlers/             # Tratamento de eventos e webhooks
│   │   ├── Dockerfile            # Container Go compilado (~18MB)
│   │   └── go.mod
│   │
│   ├── ai-engine/                # Servidor de IA & Vault de Chaves
│   │   ├── src/gemini/           # Orquestração de LLMs
│   │   ├── src/rag/              # Embeddings e RAG vetorial
│   │   ├── src/vault/            # Gestão e proteção de chaves
│   │   └── Dockerfile            # Container Node.js 22
│   │
│   ├── business-engine/          # Servidor de Regras de Negócio (Core)
│   │   ├── src/crm/              # Kanban e Fila Dev
│   │   ├── src/checklist/        # Checklists operacionais
│   │   ├── src/voucher/          # Vouchers B2B e ledger
│   │   ├── src/tickets/          # Atendimento e handoff
│   │   ├── src/integrations/     # Gastrofood (com cache 1h)
│   │   └── Dockerfile            # Container Node.js
│   │
│   └── appwrite-config/          # Configuração de deploy do Appwrite
│       ├── docker-compose.yml    # Stack oficial Appwrite para Coolify
│       └── schema/               # Schemas de coleções e atributos
│
├── src/                          # Frontend SPA React 18 + Vite
│   ├── components/               # Componentes UI (modais, CRM, chat)
│   ├── pages/                    # Telas da aplicação
│   ├── services/appwrite.ts      # Cliente SDK Appwrite (substitui supabase.ts)
│   └── store/                    # Zustand store central
│
└── docs/
    └── ARQUITETURA_NEXT_GEN_V8.md # Esta especificação técnica
```
