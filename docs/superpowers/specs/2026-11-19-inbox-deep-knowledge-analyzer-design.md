# Design Spec — Análise Profunda de Histórico por Caixa (Playbook & Base de Conhecimento RAG 2.0)

**Data:** 2026-11-19  
**Autor:** Antigravity (Arquitetura ChatBoot)  
**Status:** Aguardando aprovação do usuário para seguir ao plano de implementação (`writing-plans`)

---

## 1. Contexto, Problema e Objetivos

Em empresas multi-atendimento do ChatBoot (ex.: **Burguer Plus**, **X-Point Soluções**, entre outras), uma mesma empresa opera **múltiplas caixas de entrada (`whatsapp_instances`)**, onde cada caixa representa um domínio, departamento ou persona distinta (*Comercial*, *Financeiro*, *Suporte*, *Delivery / iPhone*, *Android*, etc.).

Hoje, o sistema possui o pipeline `RAG 2.0` (`knowledge-curator.js`), correções manuais (`ai_reasoning_adjustments`) e um auto-treinador pontual (`auto-rag-trainer.js`) que analisa apenas as últimas 20 mensagens de uma única conversa encerrada e gera documentos globais sem isolamento por caixa. Isso cria 3 problemas para aprendizado em escala a partir do histórico real:
1. **Mistura de Domínios**: Regras, argumentos e tom de voz de uma caixa *Comercial* se misturam com *Financeiro* ou *Suporte* se caírem apenas na Base Global.
2. **Falta de Destilação em Lote + Excesso de Ruído ("Lixo")**: O histórico real no PostgreSQL contém milhares de mensagens de `bot`, logs de `system` (`✅ Resolvido...`), automações (`automation`), reações (`❤️ Reação:`), mídias vazias (`📸 Imagem / Foto`), cumprimentos fáticos (*"oi/ok/obrigado"*) e dados sensíveis de clientes (CPFs, nomes completos, endereços, CEPs, códigos de pedido pontuais).
3. **Ausência de Checkpoint Incremental por Caixa**: Não há registro da data até onde cada caixa já foi analisada (`last_knowledge_analyzed_at`), impedindo reexecuções futuras incrementais apenas sobre mensagens novas.

### Objetivos Aprovados
1. **Acesso por Submenu na Caixa**: Disponibilizar em cada caixa um submenu/ação clara (**"Análise Profunda da Caixa (IA & RAG)"**), independente de estar logado na Burguer Plus, X-Point ou qualquer outro tenant.
2. **Mineração Histórica Profunda Focada em Atendimento Humano Real**: Varrer o histórico existente no PostgreSQL (`whatsapp_instances` -> `messages` / `conversations`) priorizando exclusivamente diálogos **Cliente ↔ Atendente Humano** (`sender_type IN ('client', 'human', 'agent')`, incluindo `transcription` de áudios), ignorando `bot`, `system` e `automation` para que a IA aprenda o comportamento humano real e dúvidas legítimas dos clientes sem absorver vícios antigos de robôs ou notificações automáticas.
3. **Funil de Filtragem em 10 Camadas ("Filtrar de 1 a 10 vezes") + Transformação**: Não copiar mensagens brutas; filtrar rigorosamente o lixo/LGPD em múltiplas passadas e **transformar/reescrever** o conhecimento em um Documento Estruturado de alta qualidade (separando *Comportamento & Tom de Voz da Caixa*, *Regras & Políticas Reais*, *FAQs & Soluções Validadas* e *Abordagens de Venda/Atendimento*) para ajudar a IA a atender e vender melhor.
4. **Implantação Direta Automática + Edição Posterior**: O processo gera, consolida, implanta e vetoriza automaticamente o documento na Base de Conhecimento da caixa (`knowledge_documents` / `knowledge_chunks`), deixando tudo consultável e editável em `/knowledge` (com trilha de auditoria do que foi descartado).
5. **Isolamento por Caixa + Compartilhamento Global Opcional**: Conhecimento extraído fica vinculado à caixa (`instance_id`). Na operação, a IA da caixa consome **Base Global (`instance_id IS NULL`) + Base da Própria Caixa (`instance_id = caixa_atual`)**. O usuário pode promover qualquer documento de caixa para Global (ou voltar para exclusivo da caixa) com 1 clique.
6. **Watermark Incremental Atômico por Data**: Grava a data exata de corte (`cutoff_at`) analisada em cada caixa para que execuções futuras processem apenas `timestamp > last_knowledge_analyzed_at` (com opção explícita caso o administrador queira forçar reanálise completa do zero).

### Não-Objetivos (Escopo Delimitado)
- **Não extrair nem sobrescrever preços ou lista de produtos de cardápio**: O cardápio oficial continua sincronizado exclusivamente pelo módulo ERP Gastrofood (`cardapio_digital_auto_healed.txt` + ferramentas em tempo real). O extrator proíbe e filtra preços/itens de pratos nas conversas.
- **Não depender de socket Baileys online**: A análise lê o histórico diretamente do PostgreSQL/Supabase, funcionando inclusive para caixas desconectadas ou históricas com milhares de mensagens (ex.: `Android` na Burguer Plus).
- **Não alterar credenciais/instâncias legadas fora dos endpoints de RAG**: Preserva integralmente o roteamento multi-nó existente da API WhatsApp.

---

## 2. Arquitetura Geral e Fronteiras de Módulos

```
[UI: MainSidebar (Submenu ⋮) / ChatDashboard / InboxesList / InboxSettings]
                                │
                                ▼
              [InboxDeepAnalysisModal.tsx]
           (Status, Watermark, Filtro & Auditoria)
                                │
        POST /api/v1/knowledge/inbox-analyze/:instanceId/start
        GET  /api/v1/knowledge/inbox-analyze/:instanceId/status
        GET  /api/v1/knowledge/inbox-analyze/runs/:runId
                                │
                                ▼
[Express API: server/src/api-gateway/knowledge.js] (Valida Tenant + Lock Concorrência)
                                │
                                ▼ (Job Assíncrono em Background)
[Engine: server/src/api-gateway/inbox-knowledge-analyzer.js]
  ├─ Lê checkpoint incremental (whatsapp_instances.last_knowledge_analyzed_at)
  ├─ Pagina PostgreSQL (messages + conversations) por keyset (timestamp, id)
  ├─ Executa Funil de 10 Camadas (Pré-LLM -> Map Gemini 2.5 Flash -> Reduce -> Pós-LLM RAG Curator)
  ├─ Reutiliza knowledge-curator.js (commitCuratedDocument, detectSensitiveOrNoisyPatterns, sanitizeRagText)
  ├─ Vetoriza no Xenova/all-MiniLM-L6-v2 com instance_id vinculado
  └─ Atualiza watermark atomicamente (somente após commit 100% concluído)
                                │
                                ▼
[Consumo em Tempo Real: server/src/automation-worker/agent.js]
  ├─ Passa instanceId para hybridRetrieveKnowledge(...) -> match_knowledge_chunks_hybrid(..., p_instance_id)
  └─ Injeta Playbook Comportamental da Caixa ativa + Chunks (Globais + Caixa) no System Prompt
```

---

## 3. Modelo de Dados e Migrações Idempotentes (`server/src/index.js`)

Todas as alterações DDL são aditivas e retrocompatíveis, executadas de forma idempotente em `runMigrations()`:

### 3.1. Isolamento por Caixa em `knowledge_documents` e `knowledge_chunks`
```sql
ALTER TABLE IF EXISTS public.knowledge_documents
  ADD COLUMN IF NOT EXISTS instance_id uuid NULL;

ALTER TABLE IF EXISTS public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS instance_id uuid NULL;

CREATE INDEX IF NOT EXISTS knowledge_documents_tenant_instance_idx
  ON public.knowledge_documents (tenant_id, instance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS knowledge_chunks_tenant_instance_idx
  ON public.knowledge_chunks (tenant_id, instance_id);
```
- **Regra de Escopo**:
  - `instance_id IS NULL` = **Documento Global da Empresa** (visível para todas as caixas do tenant).
  - `instance_id = <uuid>` = **Documento Exclusivo da Caixa** (visível para atendimentos dessa caixa + na aba filtrada dessa caixa em `/knowledge`).

### 3.2. Checkpoint Incremental em `whatsapp_instances`
```sql
ALTER TABLE IF EXISTS public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS last_knowledge_analyzed_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS last_knowledge_document_id uuid NULL,
  ADD COLUMN IF NOT EXISTS last_knowledge_run_id uuid NULL;
```

### 3.3. Tabela de Auditoria de Execuções `inbox_knowledge_runs`
```sql
CREATE TABLE IF NOT EXISTS public.inbox_knowledge_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  instance_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued | collecting | filtering | synthesizing | vectorizing | completed | no_new_data | failed
  mode text NOT NULL DEFAULT 'incremental', -- incremental | full
  window_start timestamp with time zone NULL,
  window_end timestamp with time zone NOT NULL,
  progress_pct integer NOT NULL DEFAULT 0,
  current_stage integer NOT NULL DEFAULT 1,
  current_step_label text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  discarded_samples jsonb NOT NULL DEFAULT '[]'::jsonb,
  extracted_behavior_summary text NULL,
  result_markdown text NULL,
  document_id uuid NULL,
  error_message text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone NULL
);

CREATE INDEX IF NOT EXISTS inbox_knowledge_runs_tenant_instance_idx
  ON public.inbox_knowledge_runs (tenant_id, instance_id, created_at DESC);
```

### 3.4. Evolução das Funções RPC `match_knowledge_chunks` e `match_knowledge_chunks_hybrid`
Adicionar parâmetro opcional `p_instance_id uuid DEFAULT NULL`:
- Filtro `WHERE` nas consultas vetoriais e lexicais:
  ```sql
  AND (p_instance_id IS NULL OR kc.instance_id IS NULL OR kc.instance_id = p_instance_id)
  ```
- **Priorização de Caixa em RRF**: Chunks com `kc.instance_id = p_instance_id` recebem bônus leve determinístico (`+0.012` em `rrf_score` no SQL e preservado no re-ranking de `hybridRetrieveKnowledge`) para que, havendo empate semântico entre uma diretriz genérica e uma regra específica daquela caixa (ex.: *Comercial X-Point*), a regra da caixa vença sem ocultar os fatos globais.
- **Compatibilidade com chamadas antigas**: Como `p_instance_id` tem `DEFAULT NULL`, chamadores que não passam `p_instance_id` continuam enxergando os documentos globais/tenant sem quebrar contratos (e é feita a limpeza explícita com `DROP FUNCTION IF EXISTS` das assinaturas anteriores para evitar ambiguidade `PGRST203` no PostgREST).

---

## 4. Pipeline de Análise Profunda e Funil de Filtragem em 10 Camadas

Módulo dedicado: `server/src/api-gateway/inbox-knowledge-analyzer.js`.

### 4.1. Controle de Janela Temporal e Keyset Pagination
1. Ao iniciar `startInboxDeepAnalysis({ tenantId, instanceId, mode })`:
   - Busca a instância na tabela `whatsapp_instances` validando que `id = instanceId AND tenant_id = tenantId`.
   - Congela `windowEnd = new Date().toISOString()`.
   - Define `windowStart`:
     - Se `mode === 'full'` ou `last_knowledge_analyzed_at === null`: `windowStart = null` (varre desde o primeiro registro da caixa).
     - Se `mode === 'incremental'` e `last_knowledge_analyzed_at !== null`: `windowStart = instance.last_knowledge_analyzed_at` (varre apenas `timestamp > windowStart AND timestamp <= windowEnd`).
2. **Coleta em Streaming Paginado por Keyset** (`(timestamp ASC, id ASC)` em páginas de `2.000` linhas via SQL/Supabase):
   - Filtra diretamente na query:
     - `tenant_id = $1`
     - `instance_id = $2`
     - `sender_type IN ('client', 'human', 'agent')`
     - `timestamp <= $windowEnd` (e `> $windowStart` quando incremental).
   - Caso não haja mensagens novas elegíveis no intervalo: finaliza o run imediatamente com `status = 'no_new_data'` (sem gastar chamadas Gemini e sem sobrescrever o documento existente).

### 4.2. As 10 Camadas de Filtragem e Transformação

| Camada | Tipo | Regra Executada | Métrica Registrada em `stats` |
| :---: | :--- | :--- | :--- |
| **1** | **Recorte de Autoria & Canal** | Mantém apenas `client`, `human` e `agent` da caixa selecionada. Incorpora `transcription` caso `message_type === 'audio'` possua transcrição válida. Ignora 100% `bot`, `system` e `automation`. | `rawMessagesRead`, `keptAuthoredMessages` |
| **2** | **Higiene de Protocolo & Mídia Vazia** | Descarta reações (`^[❤️👍😂😮😢🙏]*\s*Reação:` ou emojis isolados), placeholders sem conteúdo (`📸 Imagem / Foto`, `🎵 Áudio`, `🎥 Vídeo`, `📄 Documento` sem texto/transcrição), avisos automáticos (`Resolvido em lote`), e remove assinaturas de prefixo (`*Nome do Atendente:*\n\n`) preservando o papel interno `[Atendente]`. | `droppedProtocolNoise` |
| **3** | **Filtro de Entropia & Micro-Conversas** | Reagrupa por `conversation_id`. Remove turnos fáticos puros (*"oi", "olá", "bom dia", "ok", "tá bom", "obrigado", "beleza", "show", "blz", "combinado"*, `< 6` caracteres ou 1–2 palavras sem conteúdo). Descarta conversas inteiras que não possuam ao menos **1 resposta humana substantiva (`>= 20` chars)** OU padrão relevante de dúvida recorrente de cliente. | `totalConversations`, `keptSubstantiveConversations`, `droppedLowEntropyTurns`, `droppedEmptyConversations` |
| **4** | **Deduplicação Pré-LLM & Score de Frequência** | Normaliza frases dos atendentes (`normalizeForComparison`) para contabilizar respostas/explicações repetidas ao longo do histórico. Prioriza conversas densas, multi-turno e com alta recorrência (amostragem estratificada com orçamento máximo de **10 lotes Map**, ~35–45 conversas substanciais por lote, cobrindo tanto frequência quanto recência para evitar estouro de tokens em caixas com 70k+ msgs). | `deduplicatedPatternsCount`, `selectedConversationsForLlm` |
| **5** | **Escudo LGPD & Anonimização Pré-LLM** | Antes de enviar qualquer diálogo para a API Gemini, redige dados pessoais de clientes/terceiros: CPFs, CNPJs numéricos de terceiros, CEPs residenciais, sequências de rua/número/bloco/apto de entrega, e-mails pessoais de clientes, telefones pessoais (`55\d{10,11}`) e IDs/links temporários de pedido (`#12345`). **Preservação corporativa**: CNPJ/chave PIX oficial e endereço comercial da empresa (confrontados com `companies.settings` e/ou alta recorrência dos atendentes) não são mascarados quando fazem parte da política de pagamento ou retirada da própria empresa. | `maskedPiiCount` |
| **6** | **Extração Semântica Map (`gemini-2.5-flash`)** | Cada lote recebe prompt rigoroso de Arquiteto de Atendimento & Vendas extraindo exclusivamente em JSON estruturado: `behavior_signals` (tom de voz, postura, saudações, empatia, condução), `business_rules` (políticas reais duradouras, prazos, pagamentos, compatibilidades técnicas), `faq_solutions` (pergunta generalizada + resposta ideal), `sales_objections` (objeção do cliente + técnica vencedora) e `rejected_items` (ruídos filtrados pela IA). **Proibição estrita**: proibido extrair nomes/preços de lanches/produtos de cardápio (ERP), falta temporária de item em um dia ou casos individuais de um cliente. | `mapBatchesTotal`, `mapBatchesCompleted`, `mapExtractedFactsCount` |
| **7** | **Transformação, Reescrita & Síntese Reduce (`gemini-2.5-flash`)** | Consolida todos os JSONs dos lotes Map, elimina contradições internas, corrige português informal/erros de digitação dos atendentes (ex.: *"infelismente não"* ➔ diretriz clara e polida) e **reescreve em Markdown estratégico de elite** dividido em 4 blocos claros: **(1) Identidade, Comportamento & Tom de Voz da Caixa**, **(2) Regras Operacionais, Políticas & Pagamentos**, **(3) Perguntas Frequentes (FAQ) & Soluções Validadas**, **(4) Playbook de Vendas & Contorno de Objeções**. Também gera `extracted_behavior_summary` (resumo compacto <= 900 chars para guiar o tom de voz no runtime). | `reduceSynthesizedSections` |
| **8** | **Anti-Conflito & Anti-Duplicação com RAG Existente** | Cruza contra `companies.settings` (Fonte da Verdade de link do cardápio, horário, PIX oficial) e contra chunks existentes do tenant/caixa usando `knowledge-curator.js`. Remove recomendações conflitantes com configurações oficiais da empresa, descarta fatos >= 0.90 equivalentes ao que já está no cardápio oficial ou em outros docs do tenant. | `deduplicatedAgainstExistingRag` |
| **9** | **Auditoria Pós-LLM Anti-Lixo & LGPD** | Executa `sanitizeRagText` + `detectSensitiveOrNoisyPatterns` bloco a bloco do Markdown final e realiza uma segunda filtragem determinística: descarta seções/bullets curtos (< 25 chars), genéricos, com indícios de PII (`cpf`, `apto/bloco`) ou texto residual sem valor de atendimento/venda, guardando até 15 amostras em `discarded_samples` para transparência no modal. | `postLlmRejectedItems` |
| **10** | **Merge Incremental & Vetorização Atômica na Caixa** | Busca o Documento Vivo existente da caixa (`knowledge_documents` onde `tenant_id = X AND instance_id = Y AND metadata->>'source' = 'inbox_deep_analyzer'`). Na 1ª vez, cria; nas próximas execuções **incrementais**, executa merge semântico (preservando o conhecimento consolidado + incorporando apenas novidades evoluídas via Gemini Reduce sem duplicar seções anteriores). Em seguida invoca `commitCuratedDocument` (estendido para aceitar `instanceId`) gerando chunks estruturados de até 135 palavras e embeddings 384-d via `Xenova/all-MiniLM-L6-v2`. | `finalChunksCount`, `skippedDuplicateChunks` |

### 4.3. Garantia Atômica de Watermark e Concorrência
- **Lock por Caixa**: Apenas **1 execução ativa** (`status IN ('queued', 'collecting', 'filtering', 'synthesizing', 'vectorizing')`) permitida por `(tenant_id, instance_id)` simultaneamente; chamadas concorrentes retornam `409 Conflict` com o `runId` ativo para o cliente apenas acompanhar o progresso.
- **Fallback Sem Chave Gemini**: Utiliza `resolveServerOrTenantGeminiKey(supabase, tenantId)` (mesmo cofre já validado em produção). Se o LLM falhar temporariamente após retries com backoff, marca `status = 'failed'`, registra `error_message` legível e **NÃO** avança `last_knowledge_analyzed_at`.
- **Avanço de Checkpoint**: Somente após `commitCuratedDocument` retornar `status = 'ready'` (ou se `status = 'no_new_data'`), atualiza `whatsapp_instances.last_knowledge_analyzed_at = windowEnd`, `last_knowledge_document_id = docId` e `last_knowledge_run_id = runId`.

---

## 5. Consumo em Tempo Real pela IA (`AutomationWorker`)

Em `server/src/automation-worker/agent.js`:
1. **`hybridRetrieveKnowledge`**: `AutomationWorker.generateResponse` já recebe `instanceId`. Passar `instanceId` para `hybridRetrieveKnowledge` ➔ `match_knowledge_chunks_hybrid` e `match_knowledge_chunks` (com `p_instance_id: instanceId`).
2. **Injeção do Playbook Comportamental da Caixa**: Fonte única da verdade em `knowledge_documents.metadata.behavior_profile` (evita duplicação de estado com `whatsapp_instances.settings`). No início da montagem do contexto de `generateResponse`, quando `instanceId` for válido, buscar o documento ativo mais prioritário em `knowledge_documents` (`tenant_id = X AND status = 'ready' AND metadata->>'source' = 'inbox_deep_analyzer' AND (instance_id = instanceId OR instance_id IS NULL)`, ordenando por `instance_id IS NOT NULL DESC, updated_at DESC`, com cache leve em RAM de 60s invalidado na atualização). Se existir `metadata.behavior_profile`, injetar uma seção compacta (<= 1.000 caracteres):
   ```text
   ### PLAYBOOK DE COMPORTAMENTO E TOM DE VOZ DESTA CAIXA ###
   Adapte sua postura, abordagem e estilo de atendimento às diretrizes reais consolidadas para este canal:
   <behavior_profile>
   ```
   - Como a fonte única é o próprio documento no banco: se o usuário posteriormente **promover o documento para Global** (`instance_id = null`), **restringir à Caixa** ou **excluir o documento** em `/knowledge`, o efeito no comportamento do robô é imediato (após até 60s de TTL do cache ou invalidação imediata via API).
   - Se o usuário **editar manualmente o documento em `/knowledge`**, o `PUT /api/v1/knowledge/:id` re-vetoriza os chunks no `pgvector` e re-sincroniza `metadata.behavior_profile` automaticamente caso o texto possua a seção `# Perfil & Comportamento` (ou mantém resumo da 1ª seção).

---

## 6. Especificação de Rotas da API (`/api/v1/knowledge/...`)

Adicionadas em `server/src/api-gateway/knowledge.js`:
1. **`GET /api/v1/knowledge/inbox-analyze/:instanceId/status`** (`x-tenant-id` obrigatório):
   - Retorna dados da caixa (`id`, `display_name`, `last_knowledge_analyzed_at`, `last_knowledge_document_id`), contagem estimada de mensagens elegíveis (`client`/`human`/`agent`) **pendentes desde a última análise**, run ativo (se houver), último run concluído e histórico dos últimos 10 runs da caixa.
2. **`POST /api/v1/knowledge/inbox-analyze/:instanceId/start`** (`x-tenant-id` obrigatório):
   - Body: `{ mode?: 'incremental' | 'full' }`.
   - Cria o registro em `inbox_knowledge_runs` com `status = 'queued'`, dispara `runInboxDeepAnalysisJob(...)` em background e retorna `202 Accepted` `{ ok: true, run }`.
3. **`GET /api/v1/knowledge/inbox-analyze/runs/:runId`** (`x-tenant-id` obrigatório):
   - Retorna o progresso detalhado ao vivo (`status`, `progress_pct`, `current_stage`, `current_step_label`, `stats`, `discarded_samples`, `result_markdown`, `document_id`, `error_message`).
4. **`PATCH /api/v1/knowledge/:id/scope`** (`x-tenant-id` obrigatório):
   - Body: `{ instanceId: string | null }` (`null` promove para Global da Empresa; `<uuid>` vincula à Caixa específica).
   - Atualiza `instance_id` atomicamente em `knowledge_documents` **e** em todos os seus registros de `knowledge_chunks`.
5. **Extensão das rotas existentes (`/overview`, `/`, `/:id/content`, `PUT /:id`, `POST /commit`, `POST /match`, `DELETE /:id`)**:
   - Aceitar query/header/body opcional `instance_id` (`'all'`, `'global'`, ou UUID) para filtrar ou consultar por caixa no `/knowledge` sem quebrar nenhuma chamada existente.

---

## 7. Fluxo Visual (UI/UX) e Pontos de Acesso nas Caixas

### 7.1. Submenu na Caixa (Múltiplos Pontos Consistentes)
1. **Sidebar Esquerda (`src/components/MainSidebar.tsx`)**:
   - Cada caixa listada abaixo de "Todas as conversas" passa a exibir um botão discreto `⋮` (`MoreVertical`) ao passar o mouse (e sempre acessível em mobile/foco), além do clique com botão direito que já abre `instanceContextMenu`.
   - Dentro desse **Submenu da Caixa**, adicionar a opção destacada:
     - **🧠 Análise Profunda da Caixa (Base IA)** ➔ abre o `InboxDeepAnalysisModal` diretamente para aquela caixa específica (independentemente de qual caixa esteja filtrada no chat).
2. **Seletor de Caixas no Chat (`src/pages/ChatDashboard.tsx`)**:
   - Ao lado do switch toggle de cada caixa no popover (`renderChannelPickerInner`), adicionar botão compacto de submenu/ação (`🧠` / `MoreVertical`) para acessar a Análise Profunda da caixa escolhida.
3. **Gestão de Caixas (`src/pages/settings/InboxesList.tsx`, `src/pages/settings/InboxSettings.tsx` e `src/pages/InstancesDashboard.tsx`)**:
   - Botão/atalho **"🧠 Análise Profunda (RAG)"** nos cards de caixa e nova aba/painel ou botão no cabeçalho de `InboxSettings.tsx`.

### 7.2. Estúdio Modal: `src/components/modals/InboxDeepAnalysisModal.tsx`
Design Glassmorphism escuro alinhado à identidade visual do ChatBoot (`#0b141a` / `#182229` / esmeralda + índigo/violeta):
- **Cabeçalho**: Nome da Caixa + Nome da Empresa logada + Badge de escopo (`Exclusivo desta Caixa`).
- **Cartão de Checkpoint & Auditoria Temporal**:
  - Se já foi analisada: *"Última análise concluída em DD/MM/AAAA às HH:mm — próximas análises processarão apenas as **X** novas mensagens cliente/atendente posteriores a essa data."*
  - Se nunca foi analisada: *"Primeira análise da caixa — irá minerar todo o histórico humano/cliente disponível (**Y** mensagens elegíveis no banco)."*
- **Controles de Execução**:
  - Botão primário: **"Analisar Dados Novos e Implantar na Base"** (ou **"Iniciar 1ª Análise Profunda"**).
  - Botão secundário (confirmação dupla caso já exista análise): **"Reanalisar Histórico Completo do Zero"** (`mode: 'full'`).
- **Stepper ao Vivo das 10 Camadas**:
  - Mostra progresso percentual (`0% -> 100%`), estágio atual (1 a 10) e contadores em tempo real (*Msgs lidas ➔ Filtradas por ruído/bot/sistema ➔ LGPD protegida ➔ Lotes destilados ➔ Chunks gravados*).
- **Resultado Final & Transparência Anti-Lixo**:
  - Visualizador Markdown limpo do documento gerado (*Comportamento da Caixa + Regras + FAQs + Vendas*).
  - Aba/Expansor **"Relatório de Filtragem (Lixo Descartado)"** exibindo exatamente quanto lixo foi barrado e amostras anônimas do que foi rejeitado.
  - Ações rápidas pós-conclusão: **Abrir/Editar em Base de Conhecimento (`/knowledge?instanceId=...`)** e **Alternar Global ⇄ Exclusivo da Caixa** em 1 clique.

### 7.3. Evolução de `src/pages/KnowledgeBase.tsx`
- Carrega a lista de caixas (`whatsapp_instances`) da empresa logada.
- Barra de filtro de escopo acima da lista de bases: **`Todas`** | **`🌐 Globais da Empresa`** | dropdown **`📦 Caixa: <Nome da Caixa>`**.
- Cada documento de caixa exibe badge identificando a caixa proprietária + botão rápido **"Tornar Global"** / **"Restringir à Caixa"** (chamando `PATCH /api/v1/knowledge/:id/scope`) + botão **"🧠 Atualizar via Análise Profunda"** quando filtrado por uma caixa.
- Preserva 100% da edição de conteúdo (`PUT /:id`), visualização Markdown e simulador `RAG Match` (permitindo simular busca como Global ou simulando uma Caixa específica!).

---

## 8. Segurança, Performance e Estratégia de Testes

1. **Multi-Tenancy Estrito**: Toda rota exige e valida `x-tenant-id` combinando `tenant_id` e `instance_id` nas queries; nunca vaza mensagens, runs ou chunks de outra empresa.
2. **Prevenção de Sobrecarga**: Paginação keyset SQL sem carregar todas as linhas em RAM de uma só vez; Map-Reduce respeitando tamanho de prompt (< 45k chars por chamada) e fallback/backoff exponencial em `429/5xx` da API Gemini.
3. **Suite de Testes (`node --test`)**:
   - Testes unitários para todas as camadas determinísticas do `inbox-knowledge-analyzer.js` (filtro de autoria, remoção de assinaturas `*Nome:*`, remoção de reações/placeholders/lixo fático, mascaramento LGPD pré-LLM, ranking/deduplicação pré-LLM, auditoria pós-LLM, montagem incremental de janela e construção de payload sem alterar o cardápio ERP).
   - Teste de contrato/integração verificando `runMigrations()` SQL (novas colunas + RPCs `match_knowledge_chunks_hybrid`), lock de concorrência (`409`), proteção do watermark em falhas e escopo `Global <-> Caixa`.
   - Verificação de build Frontend (`npm run build`) + verificação de sintaxe (`node --check`) no Backend.
