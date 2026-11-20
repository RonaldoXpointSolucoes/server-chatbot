# Análise Profunda de Histórico por Caixa (Playbook & Base de Conhecimento RAG 2.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar análise profunda incremental por caixa (`whatsapp_instances`) com funil anti-ruído/LGPD de 10 camadas via Gemini 2.5 Flash, curadoria/vetorização automática na Base RAG 2.0 isolada por `instance_id` (+ Base Global), consumo em tempo real pelo `AutomationWorker` e pontos de acesso em submenu por caixa na UI.

**Architecture:** Um módulo backend dedicado (`server/src/api-gateway/inbox-knowledge-analyzer.js`) pagina mensagens elegíveis (`client`, `human`, `agent`) via keyset em PostgreSQL/Supabase desde `whatsapp_instances.last_knowledge_analyzed_at`, executa filtragem determinística + LGPD, destila comportamento e regras em Map-Reduce (`gemini-2.5-flash`), reutiliza `knowledge-curator.js` estendido para `instance_id` para consolidar e vetorizar (`Xenova/all-MiniLM-L6-v2`) diretamente em `knowledge_documents`/`knowledge_chunks` e só avança o watermark após conclusão atômica. O `agent.js` passa `instanceId` para busca híbrida (`p_instance_id`) e injeta `metadata.behavior_profile` da caixa ativa; no frontend, um modal em estúdio (`InboxDeepAnalysisModal.tsx`) é acionado por submenu em cada caixa e `/knowledge` ganha filtro e alternância de escopo (`Global` ⇄ `Caixa`).

**Tech Stack:** Node.js (ESM, `node:test`), Express, Supabase JS + `pg`, `@google/generative-ai` (`gemini-2.5-flash`), `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2`), PostgreSQL `pgvector` HNSW + FTS PT-BR, React 18 + TypeScript + Tailwind CSS + Lucide Icons + Vite.

**Spec:** [docs/superpowers/specs/2026-11-19-inbox-deep-knowledge-analyzer-design.md](docs/superpowers/specs/2026-11-19-inbox-deep-knowledge-analyzer-design.md)

## Global Constraints

- Preservar integralmente alterações pré-existentes no working tree (`knowledge.js`, `knowledge-curator.js`, `agent.js`, `index.js`, `MainSidebar.tsx`, `ChatDashboard.tsx`, `KnowledgeBase.tsx`); nunca executar `git add -A`, `git checkout -- .`, `git push` ou deploys automáticos.
- Idioma padrão de UI, logs legíveis ao usuário, prompts e documentação: Português do Brasil (`pt-BR`).
- Multi-tenancy estrito (`x-tenant-id` obrigatório + validação `tenant_id` e `instance_id` combinados em todas as queries e rotas).
- Proibido depender de socket Baileys online; toda leitura histórica vem do PostgreSQL/Supabase.
- Proibido extrair/sobrescrever nomes ou preços de produtos do cardápio ERP Gastrofood ou manter lixo/PII de clientes na Base RAG.
- Fonte única da verdade do perfil comportamental da caixa: `knowledge_documents.metadata.behavior_profile`.
- Avançar `whatsapp_instances.last_knowledge_analyzed_at = windowEnd` SOMENTE após `commitCuratedDocument` retornar `status: 'ready'` ou em término limpo `'no_new_data'`.
- Toda criação de componente frontend/backend deve compilar com `npm run build` (inclui `node scripts/check-tdz.cjs`) e `node --check`.

## Review Focus

1. **Deduplicação intra-tenant entre caixas diferentes**: `commitCuratedDocument` não pode descartar um chunk da caixa *Financeiro* só porque frase idêntica já existe na caixa *Comercial*; a deduplicação de chunks só compara contra chunks do mesmo escopo (`c.instance_id === null || c.instance_id === instanceId`).
2. **Precedência de rotas Express (`/inbox-analyze/*` vs `/:id`)**: Rotas `/inbox-analyze/:instanceId/status`, `/inbox-analyze/:instanceId/start` e `/inbox-analyze/runs/:runId` devem ser declaradas antes de `GET /:id/chunks`, `GET /:id/content`, `PUT /:id` e `DELETE /:id` em `knowledge.js` para não colidir com `:id`.
3. **Escudo LGPD vs preservação de PIX/CNPJ corporativo**: Camada 5 deve redigir CPFs, CEPs, endereços de entrega, telefones e CNPJs de terceiros/clientes antes de enviar ao Gemini, mas preservar CNPJ/chave PIX/endereço oficial quando corresponder a `companies.settings` ou recorrência operacional da empresa.
4. **Integridade do watermark e lock de concorrência em falhas**: Apenas 1 execução ativa por `(tenant_id, instance_id)` (`409 Conflict` retornando `activeRun`); falhas no Gemini ou na vetorização marcam `status = 'failed'` e mantêm `last_knowledge_analyzed_at` intacto.
5. **Segurança de tipo UUID em runtime (`simulador`)**: `AutomationWorker.generateResponse` pode receber `instanceId = 'simulador'` ou strings não-UUID; validar formato UUID antes de enviar `p_instance_id` às RPCs PostgreSQL e queries em `knowledge_documents`/`knowledge_chunks` (caso contrário normalizar para `null`).

---

### Task 1: Migrações DDL Idempotentes e Evolução das RPCs Híbridas por Caixa

**Files:**
- Create: `server/src/db/inboxKnowledgeMigrationsSql.js`
- Modify: `server/src/index.js` (`runMigrations()` próximo às linhas 990-1155)
- Test: `server/tests/inbox-knowledge-migrations.test.mjs`

**Interfaces:**
- Produces (`server/src/db/inboxKnowledgeMigrationsSql.js`):
  - `buildInboxKnowledgeMigrationSql(): string`
- Consumes (`server/src/index.js`):
  - Incorpora `buildInboxKnowledgeMigrationSql()` ao bloco `migrationSQL` executado em `runMigrations()` e atualiza `GRANT EXECUTE` das assinaturas com `p_instance_id uuid`.

- [ ] **Step 1: Write the failing test**

Criar `server/tests/inbox-knowledge-migrations.test.mjs` validando com `node:test` e `node:assert/strict`:
- `buildInboxKnowledgeMigrationSql()` contém `ALTER TABLE IF EXISTS public.knowledge_documents ADD COLUMN IF NOT EXISTS instance_id uuid NULL`
- contém `ALTER TABLE IF EXISTS public.knowledge_chunks ADD COLUMN IF NOT EXISTS instance_id uuid NULL`
- contém índices `knowledge_documents_tenant_instance_idx` e `knowledge_chunks_tenant_instance_idx`
- contém colunas incrementais em `whatsapp_instances` (`last_knowledge_analyzed_at`, `last_knowledge_document_id`, `last_knowledge_run_id`)
- contém `CREATE TABLE IF NOT EXISTS public.inbox_knowledge_runs` com `window_start`, `window_end`, `discarded_samples`, `stats`, `extracted_behavior_summary`, `result_markdown`
- contém `DROP FUNCTION IF EXISTS` para assinaturas antigas de `match_knowledge_chunks` e `match_knowledge_chunks_hybrid` (evitando `PGRST203`), novo parâmetro `p_instance_id uuid DEFAULT NULL`, filtro `(p_instance_id IS NULL OR kc.instance_id IS NULL OR kc.instance_id = p_instance_id)`, bônus `+ 0.012` em `rrf_score` quando `kc.instance_id = p_instance_id`, e `GRANT EXECUTE` atualizado.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/inbox-knowledge-migrations.test.mjs`
Expected: FAIL (`Cannot find module '...inboxKnowledgeMigrationsSql.js'`).

- [ ] **Step 3: Implement `buildInboxKnowledgeMigrationSql()` e integrar em `server/src/index.js`**

- Em `server/src/db/inboxKnowledgeMigrationsSql.js`: exportar `buildInboxKnowledgeMigrationSql()` retornando o DDL completo da Seção 3 da Spec (3.1 a 3.4) com `DROP FUNCTION IF EXISTS` das assinaturas anteriores (5/6 args) + novas assinaturas de `match_knowledge_chunks` e `match_knowledge_chunks_hybrid` com `p_instance_id uuid DEFAULT NULL`.
- Em `server/src/index.js`: importar `buildInboxKnowledgeMigrationSql`, substituir o bloco antigo de `match_knowledge_chunks` / `match_knowledge_chunks_hybrid` em `runMigrations()` pela inclusão de `${buildInboxKnowledgeMigrationSql()}` antes de `NOTIFY pgrst, 'reload schema';`.

- [ ] **Step 4: Run test & syntax check to verify it passes**

Run: `node --test server/tests/inbox-knowledge-migrations.test.mjs && node --check server/src/index.js`
Expected: PASS (all assertions green + zero syntax errors).

- [ ] **Step 5: Commit**

```bash
git add server/src/db/inboxKnowledgeMigrationsSql.js server/src/index.js server/tests/inbox-knowledge-migrations.test.mjs
git commit -m "feat(rag): add per-inbox DDL columns, inbox_knowledge_runs and scoped hybrid RPCs"
```

---

### Task 2: Suporte a Escopo por Caixa (`instanceId`) e `behavior_profile` em `knowledge-curator.js`

**Files:**
- Modify: `server/src/api-gateway/knowledge-curator.js` (`fetchAllTenantChunks`, `commitCuratedDocument`, `hybridRetrieveKnowledge`)
- Test: `server/tests/knowledge-curator-instance-scope.test.mjs`

**Interfaces:**
- Produces (`server/src/api-gateway/knowledge-curator.js`):
  - `isValidUuid(val): boolean`
  - `fetchAllTenantChunks(supabase, tenantId, includeEmbeddings = false, instanceId = undefined)` (retorna chunks incluindo `instance_id`)
  - `commitCuratedDocument({ supabase, transformer, tenantId, agentId = null, instanceId = null, mode = 'create', targetDocumentId = null, title, type, category, content, qualityScore = 90, source = 'curated_rag_v2', behaviorProfile = null, extraMetadata = null, yieldMs = 15 })`
  - `hybridRetrieveKnowledge({ supabase, queryEmbedding, queryText, tenantId, agentId = null, instanceId = null, topK = 5, vectorThreshold = 0.24 })`

- [ ] **Step 1: Write the failing tests**

Criar `server/tests/knowledge-curator-instance-scope.test.mjs` cobrindo:
1. `commitCuratedDocument` com `instanceId: 'inst-comercial'` grava `instance_id: 'inst-comercial'` em `knowledge_documents` e em todos os `knowledge_chunks`, além de `metadata.behavior_profile`.
2. **Review Focus #1**: dado um chunk idêntico já salvo em outra caixa (`instance_id: 'inst-financeiro'`), `commitCuratedDocument` para `instanceId: 'inst-comercial'` NÃO descarta o chunk como duplicado, mas descarta se já existir na mesma caixa (`'inst-comercial'`) ou em documento Global (`null`).
3. **Review Focus #5**: `hybridRetrieveKnowledge` normaliza `instanceId: 'simulador'` para `p_instance_id: null` ao invocar RPC, e quando recebe UUID válido passa `p_instance_id`, aplica filtro de escopo no suplemento `ilike` e dá prioridade determinística ao chunk da caixa atual em caso de empate.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/knowledge-curator-instance-scope.test.mjs`
Expected: FAIL (`instance_id` ausente nos inserts e `p_instance_id` ausente na chamada RPC).

- [ ] **Step 3: Implement instance-scoped curation & retrieval in `server/src/api-gateway/knowledge-curator.js`**

- Adicionar `isValidUuid(value)` e normalizador `normalizeUuidOrNull(value)`.
- Em `fetchAllTenantChunks`: incluir `instance_id` no `.select(...)` e preservar filtro opcional por compatibilidade (`instanceId` se passado explícito).
- Em `commitCuratedDocument`: aceitar `instanceId = null`, `behaviorProfile = null`, `extraMetadata = null`; gravar `instance_id: safeInstanceId` no `insert`/`update` de `knowledge_documents` e no lote de `knowledge_chunks`; gravar `behavior_profile` e `instance_id` em `metadata`; filtrar `otherChunks` para deduplicação comparando apenas contra docs de escopo compatível (`c.document_id !== docId && (!safeInstanceId ? !c.instance_id : (!c.instance_id || c.instance_id === safeInstanceId))`).
- Em `hybridRetrieveKnowledge`: aceitar `instanceId = null`, normalizar via `normalizeUuidOrNull(instanceId)`, passar `p_instance_id: safeInstanceId` em ambas as RPCs (`match_knowledge_chunks_hybrid` e `match_knowledge_chunks`), incluir `instance_id` no `ilike` fallback filtrando `.or(\`instance_id.is.null,instance_id.eq.${safeInstanceId}\`)` quando `safeInstanceId` existe, e somar boost `+0.06` em `baseScore` para matches com `instance_id === safeInstanceId`.

- [ ] **Step 4: Run test & syntax check to verify it passes**

Run: `node --test server/tests/knowledge-curator-instance-scope.test.mjs && node --check server/src/api-gateway/knowledge-curator.js`
Expected: PASS (3/3 tests pass, zero syntax errors).

- [ ] **Step 5: Commit**

```bash
git add server/src/api-gateway/knowledge-curator.js server/tests/knowledge-curator-instance-scope.test.mjs
git commit -m "feat(rag): support per-inbox instance_id scope and behavior_profile in knowledge-curator"
```

---

### Task 3: Engine Determinístico de Filtragem Anti-Ruído, Amostragem Estratificada e Escudo LGPD (Camadas 1–5 e 8–9)

**Files:**
- Create: `server/src/api-gateway/inbox-knowledge-analyzer.js` (módulo inicial com funções puras das camadas determinísticas)
- Test: `server/tests/inbox-knowledge-analyzer-filters.test.mjs`

**Interfaces:**
- Consumes (`server/src/api-gateway/knowledge-curator.js`):
  - `normalizeForComparison`, `sanitizeRagText`, `detectSensitiveOrNoisyPatterns`
- Produces (`server/src/api-gateway/inbox-knowledge-analyzer.js`):
  - `computeAnalysisWindow({ mode, lastKnowledgeAnalyzedAt, nowIso }): { windowStart: string | null, windowEnd: string, effectiveMode: 'incremental' | 'full' }`
  - `isEligibleAuthoredMessage(msg): { eligible: boolean, text: string, role: 'Cliente' | 'Atendente' | null }` (Camada 1)
  - `cleanProtocolAndNoise(text): { keep: boolean, cleaned: string, reason: string | null }` (Camada 2)
  - `groupAndFilterConversations(messages): { conversations: Array, stats: object, samples: Array }` (Camada 3)
  - `scoreAndPackMapBatches(conversations, options): { batches: Array, stats: object }` (Camada 4 — máx 10 lotes)
  - `maskPiiPreservingCompanyData(text, companySettings, repeatedCompanyTokens): { maskedText: string, maskedCount: number }` (Camada 5 — Review Focus #3)
  - `collectRepeatedCompanyTokens(conversations): Set<string>`
  - `auditAndCleanSynthesizedMarkdown({ markdown, companySettings, existingChunks, instanceId }): { cleanedMarkdown: string, discardedSamples: Array, stats: object, behaviorProfile: string }` (Camadas 8 e 9)

- [ ] **Step 1: Write the failing tests**

Criar `server/tests/inbox-knowledge-analyzer-filters.test.mjs` testando todas as camadas determinísticas:
1. `computeAnalysisWindow`: primeira execução (`lastKnowledgeAnalyzedAt: null`) retorna `windowStart: null, effectiveMode: 'full'`; modo `incremental` com timestamp retorna `windowStart` exato; modo `full` força `windowStart: null`.
2. **Camada 1 (`isEligibleAuthoredMessage`)**: aceita `client`, `human`, `agent`; promove `message_type === 'audio'` com `transcription` válida; descarta `bot`, `system`, `automation`.
3. **Camada 2 (`cleanProtocolAndNoise`)**: remove prefixo `*Ronaldo Clemente:*\n\n` mantendo conteúdo útil; descarta reações (`❤️ Reação:`, `👍`), placeholders vazios (`📸 Imagem / Foto`), notificações automáticas (`✅ Resolvido por`, `Resolvido em lote`, `✨ SEU PEDIDO ESTÁ SENDO PREPARADO!`).
4. **Camada 3 (`groupAndFilterConversations`)**: descarta turnos fáticos (`oi`, `ok`, `obrigado`, `bom dia`, `blz`) e descarta conversas inteiras sem nenhuma resposta humana substantiva (`>= 20` chars) nem dúvida recorrente relevante de cliente.
5. **Camada 4 (`scoreAndPackMapBatches`)**: com 450 conversas simuladas, empacota no máximo `10` lotes (`batches.length <= 10`) priorizando conversas ricas/recorrentes e recentes.
6. **Camada 5 (`maskPiiPreservingCompanyData` - Review Focus #3)**: mascara CPF (`123.456.789-00`), CEP de cliente (`06787-500`), rua/apto (`Rua Padre Cícero, 120, Bloco B apto 32`), telefone (`5511988887777`), pedido (`#13130`), e **PRESERVA** CNPJ/PIX oficial (`59075836000106`) e endereço comercial quando presentes em `companySettings` ou identificados como token corporativo repetido pelos atendentes.
7. **Camadas 8 e 9 (`auditAndCleanSynthesizedMarkdown`)**: descarta bullets curtos (< 25 chars), com indícios de PII residual ou preços de lanches inventados quando `companySettings.link_cardapio` existir (`X-Salada por R$ 28,90`), registra amostras em `discardedSamples` (<= 15) e extrai `behaviorProfile` (`<= 900` chars).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/inbox-knowledge-analyzer-filters.test.mjs`
Expected: FAIL (`Cannot find module '...inbox-knowledge-analyzer.js'`).

- [ ] **Step 3: Implement the deterministic layers in `server/src/api-gateway/inbox-knowledge-analyzer.js`**

Implementar todas as funções puras listadas em Interfaces, com helpers curtos e limpos (sem duplicação de regexes de ruído/LGPD e reaproveitando `normalizeForComparison`, `sanitizeRagText` e `detectSensitiveOrNoisyPatterns` do `knowledge-curator.js`).

- [ ] **Step 4: Run test & syntax check to verify it passes**

Run: `node --test server/tests/inbox-knowledge-analyzer-filters.test.mjs && node --check server/src/api-gateway/inbox-knowledge-analyzer.js`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add server/src/api-gateway/inbox-knowledge-analyzer.js server/tests/inbox-knowledge-analyzer-filters.test.mjs
git commit -m "feat(rag): implement 10-layer deterministic pre/post-LLM filter and LGPD shield"
```

---

### Task 4: Orquestrador Map-Reduce Gemini 2.5 Flash, Keyset Streaming, Lock de Concorrência e Watermark Incremental

**Files:**
- Modify: `server/src/api-gateway/inbox-knowledge-analyzer.js` (adicionar camadas 6, 7 e 10, keyset SQL/Supabase pagination, job runner e consultas de status/run)
- Test: `server/tests/inbox-knowledge-job.test.mjs`

**Interfaces:**
- Consumes (`server/src/utils/geminiVault.js`, `server/src/api-gateway/knowledge-curator.js`):
  - `resolveServerOrTenantGeminiKey`
  - `commitCuratedDocument`, `fetchAllTenantChunks`
- Produces (`server/src/api-gateway/inbox-knowledge-analyzer.js`):
  - `collectEligibleInboxMessages({ supabase, tenantId, instanceId, windowStart, windowEnd, pageSize }): Promise<{ rawMessagesRead: number, eligibleMessages: Array, discardedSamples: Array, droppedProtocolNoise: number }>`
  - `extractMapBatchWithGemini({ callLlmJson, batch, inboxName, companyName, companySettings, batchIndex, totalBatches }): Promise<object>`
  - `reduceSynthesizedKnowledgeWithGemini({ callLlmText, mapResults, existingDocMarkdown, mode, inboxName, companyName, companySettings }): Promise<{ markdown: string, behaviorSummary: string }>`
  - `startInboxDeepAnalysis({ supabase, tenantId, instanceId, mode = 'incremental', deps = {} }): Promise<{ conflict?: boolean, activeRun?: object, run?: object, completionPromise?: Promise<void> }>`
  - `getInboxAnalysisStatus({ supabase, tenantId, instanceId }): Promise<{ instance, pendingEligibleCount, activeRun, lastCompletedRun, recentRuns }>`
  - `getInboxAnalysisRun({ supabase, tenantId, runId }): Promise<object | null>`

- [ ] **Step 1: Write the failing tests**

Criar `server/tests/inbox-knowledge-job.test.mjs` com mocks de Supabase, Gemini JSON/Text e embedding transformer validando:
1. Keyset pagination coleta múltiplas páginas (`pageSize: 2`) ordenadas por `(timestamp ASC, id ASC)` sem duplicar ou pular mensagens na fronteira de timestamps iguais.
2. Lock de concorrência (**Review Focus #4**): se já existe run ativo (`status IN ('queued', 'collecting', 'filtering', 'synthesizing', 'vectorizing')`) para `(tenantId, instanceId)`, `startInboxDeepAnalysis` retorna `{ conflict: true, activeRun }` sem criar outro run.
3. Fluxo `no_new_data` (**Review Focus #4**): em execução incremental sem mensagens novas após `last_knowledge_analyzed_at`, não chama Gemini, não apaga documento existente, marca run como `'no_new_data'` e atualiza `last_knowledge_analyzed_at = windowEnd`.
4. Fluxo completo (`incremental` na 1ª vez e depois `incremental` na 2ª vez com documento existente): executa Map -> Reduce/Merge -> Auditoria -> `commitCuratedDocument` com `instanceId`, grava `status = 'completed'`, `document_id`, `extracted_behavior_summary` e atualiza `whatsapp_instances.last_knowledge_analyzed_at = windowEnd`.
5. Falha no LLM ou ausência de chave Gemini (**Review Focus #4**): marca `inbox_knowledge_runs.status = 'failed'`, popula `error_message` e verifica explicitamente que `whatsapp_instances.last_knowledge_analyzed_at` NÃO foi alterado!

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/inbox-knowledge-job.test.mjs`
Expected: FAIL (`startInboxDeepAnalysis is not a function`).

- [ ] **Step 3: Implement Map-Reduce Gemini orchestrator, keyset pagination and atomic watermark runner**

Em `server/src/api-gateway/inbox-knowledge-analyzer.js`:
- Implementar paginação keyset (`order('timestamp').order('id')` ou filtro composto `(timestamp.gt.${lastTs},and(timestamp.eq.${lastTs},id.gt.${lastId}))`) em páginas de `2000` linhas respeitando `windowStart` (`timestamp > windowStart`) e `windowEnd` (`timestamp <= windowEnd`).
- Implementar wrapper `@google/generative-ai` (`gemini-2.5-flash`) com retry + backoff exponencial para `429/5xx`, parse tolerante a JSON em markdown fences e limite de prompt `< 45k` chars.
- Na Camada 10 (`mode === 'incremental'` quando já existe documento `metadata->>'source' = 'inbox_deep_analyzer'`), ler conteúdo atual do documento para que o Reduce faça merge evolutivo sem duplicar nem apagar regras anteriores; em seguida invocar `commitCuratedDocument` (`mode: existingDoc ? 'replace' : 'create'`) passando `instanceId`, `behaviorProfile`, `source: 'inbox_deep_analyzer'`, `extraMetadata: { last_run_id: runId, last_window_end: windowEnd }`.
- Atualizar progresso e estágios (`1..10`, `0..100%`) em `inbox_knowledge_runs` ao longo das etapas e manter `completionPromise` acessível para testes sem bloquear a resposta HTTP `202`.

- [ ] **Step 4: Run tests & syntax check to verify it passes**

Run: `node --test server/tests/inbox-knowledge-job.test.mjs server/tests/inbox-knowledge-analyzer-filters.test.mjs && node --check server/src/api-gateway/inbox-knowledge-analyzer.js`
Expected: PASS (all job and filter tests pass).

- [ ] **Step 5: Commit**

```bash
git add server/src/api-gateway/inbox-knowledge-analyzer.js server/tests/inbox-knowledge-job.test.mjs
git commit -m "feat(rag): add Gemini Map-Reduce orchestrator, keyset collector, lock and atomic watermark"
```

---

### Task 5: Rotas Express `/inbox-analyze/*`, `PATCH /:id/scope` e Filtros por Caixa em `knowledge.js`

**Files:**
- Modify: `server/src/api-gateway/knowledge.js`
- Test: `server/tests/knowledge-routes-inbox.test.mjs`

**Interfaces:**
- Consumes (`server/src/api-gateway/inbox-knowledge-analyzer.js`, `server/src/api-gateway/knowledge-curator.js`):
  - `startInboxDeepAnalysis`, `getInboxAnalysisStatus`, `getInboxAnalysisRun`
  - `hybridRetrieveKnowledge`, `commitCuratedDocument`
- Exposes (Router mounted at `/api/v1/knowledge`):
  - `GET /inbox-analyze/:instanceId/status`
  - `POST /inbox-analyze/:instanceId/start`
  - `GET /inbox-analyze/runs/:runId`
  - `PATCH /:id/scope`
  - Query/Body optional `instance_id` / `instanceId` em `/overview`, `/`, `/commit`, `PUT /:id`, `/match`

- [ ] **Step 1: Write the failing tests**

Criar `server/tests/knowledge-routes-inbox.test.mjs` testando os handlers/router com Express + request simulado (sem abrir porta de rede externa):
1. **Review Focus #2**: `GET /inbox-analyze/runs/:runId` e `GET /inbox-analyze/:instanceId/status` respondem com os handlers de inbox analysis e NÃO caem em `GET /:id/content` nem `/:id`.
2. `POST /inbox-analyze/:instanceId/start` sem `x-tenant-id` retorna `400`; com lock ativo retorna `409 { conflict: true, activeRun }`; válido retorna `202 { ok: true, run }`.
3. `PATCH /:id/scope` com `{ instanceId: null }` ou UUID atualiza `knowledge_documents.instance_id` **e** `knowledge_chunks.instance_id` para o `tenant_id` validado.
4. `GET /overview?instance_id=global` filtra apenas documentos globais (`instance_id IS NULL`), `GET /overview?instance_id=<uuid>` filtra os da caixa, e `POST /match` repassa `instanceId` para `hybridRetrieveKnowledge`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/knowledge-routes-inbox.test.mjs`
Expected: FAIL (`404` / rota não implementada).

- [ ] **Step 3: Exportar factory de router testável/injetável ou estender `server/src/api-gateway/knowledge.js`**

- Extrair ou criar `createKnowledgeRouter(deps)` com defaults reais (`supabase`, `EmbeddingsPipeline`, `inboxAnalyzer`, `invalidateCache`) e exportar `export default router;` usando defaults reais para manter 100% de compatibilidade com `server/src/api-gateway/index.js`!
- Registrar `GET /inbox-analyze/runs/:runId`, `GET /inbox-analyze/:instanceId/status` e `POST /inbox-analyze/:instanceId/start` **antes** de `GET /:id/chunks` e `PUT /:id`.
- Registrar `PATCH /:id/scope` validando UUID de `instanceId` (ou `null`) e ownership da caixa em `whatsapp_instances` antes de atualizar `knowledge_documents` e `knowledge_chunks` atomicamente + invalidar cache do playbook em RAM.
- Estender `/overview`, `/`, `POST /commit`, `PUT /:id` (preservando `instance_id` nos novos chunks e atualizando `behavior_profile` caso o Markdown editado contenha seção `# ... Comportamento ...`) e `POST /match` (`instanceId`).

- [ ] **Step 4: Run tests & syntax check to verify it passes**

Run: `node --test server/tests/knowledge-routes-inbox.test.mjs && node --check server/src/api-gateway/knowledge.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/api-gateway/knowledge.js server/tests/knowledge-routes-inbox.test.mjs
git commit -m "feat(api): add inbox deep analysis endpoints, scope toggle and per-inbox RAG filters"
```

---

### Task 6: Consumo em Tempo Real no `AutomationWorker` (`agent.js`) — Playbook Comportamental e RAG por Caixa

**Files:**
- Create (ou exportar helper limpo): `server/src/automation-worker/inbox-behavior-cache.js` (ou dentro de `agent.js` se conciso — preferir módulo pequeno compartilhável com `knowledge.js` para invalidação imediata ao editar/alternar escopo!)
- Modify: `server/src/automation-worker/agent.js` (`generateResponse`, próximo às linhas 2545–2730)
- Modify: `server/src/api-gateway/knowledge.js` (chamar `invalidateInboxBehaviorCache` em `PATCH /:id/scope`, `PUT /:id`, `DELETE /:id`)
- Test: `server/tests/agent-inbox-behavior.test.mjs`

**Interfaces:**
- Produces (`server/src/automation-worker/inbox-behavior-cache.js`):
  - `getInboxBehaviorProfile({ supabase, tenantId, instanceId, ttlMs = 60000 }): Promise<string | null>`
  - `invalidateInboxBehaviorCache(tenantId, instanceId?): void`
- Consumes (`server/src/automation-worker/agent.js`):
  - Em `generateResponse({ ..., instanceId })`: normaliza `safeInstanceId = isValidUuid(instanceId) ? instanceId : null`, passa `instanceId: safeInstanceId` para `hybridRetrieveKnowledge(...)` e injeta `### PLAYBOOK DE COMPORTAMENTO E TOM DE VOZ DESTA CAIXA ###` quando `getInboxBehaviorProfile` retornar texto não-vazio.

- [ ] **Step 1: Write the failing tests**

Criar `server/tests/agent-inbox-behavior.test.mjs` validando:
1. Prioridade de caixa sobre global: se existe doc da caixa (`instance_id = <uuid>`) e doc Global (`instance_id = null`) com `metadata.source = 'inbox_deep_analyzer'`, `getInboxBehaviorProfile` retorna o `behavior_profile` da caixa, truncado a `<= 1000` chars.
2. **Review Focus #5**: se `instanceId = 'simulador'` ou inválido, `getInboxBehaviorProfile` consulta apenas escopo seguro (`null`) e NÃO dispara filtro SQL UUID inválido; `formatInboxBehaviorPromptSection` retorna string formatada correta.
3. Cache TTL + `invalidateInboxBehaviorCache(tenantId, instanceId)` força releitura na próxima chamada quando documento é editado, excluído ou promovido a Global.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/tests/agent-inbox-behavior.test.mjs`
Expected: FAIL (`Cannot find module '...inbox-behavior-cache.js'`).

- [ ] **Step 3: Implement `inbox-behavior-cache.js`, wire `agent.js` and `knowledge.js`**

- Criar `server/src/automation-worker/inbox-behavior-cache.js` com cache em RAM (`Map` com TTL 60s), `getInboxBehaviorProfile`, `invalidateInboxBehaviorCache` e `formatInboxBehaviorPromptSection`.
- Em `server/src/automation-worker/agent.js`: normalizar `safeInstanceId` (nunca enviar `'simulador'` para UUID SQL), passar `instanceId: safeInstanceId` para `hybridRetrieveKnowledge` e injetar `formatInboxBehaviorPromptSection(behaviorProfile)` no `basePrompt` antes de `botInstructions`.
- Em `server/src/api-gateway/knowledge.js`: chamar `invalidateInboxBehaviorCache(tenant_id)` após `PATCH /:id/scope`, `PUT /:id`, `DELETE /:id` e no commit do analyzer.

- [ ] **Step 4: Run tests & syntax check to verify it passes**

Run: `node --test server/tests/agent-inbox-behavior.test.mjs && node --check server/src/automation-worker/agent.js server/src/automation-worker/inbox-behavior-cache.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/automation-worker/inbox-behavior-cache.js server/src/automation-worker/agent.js server/src/api-gateway/knowledge.js server/tests/agent-inbox-behavior.test.mjs
git commit -m "feat(agent): inject per-inbox behavior playbook and pass instanceId to hybrid RAG retrieval"
```

---

### Task 7: Modal Estúdio `InboxDeepAnalysisModal.tsx` (Status, 10 Camadas ao Vivo, Lixo Descartado e Alternância Global)

**Files:**
- Create: `src/components/modals/InboxDeepAnalysisModal.tsx`
- Modify (se necessário extrair constante de etapas compartilhável ou helpers puros testáveis): opcional `src/utils/inboxKnowledgeUtils.ts` + `src/utils/inboxKnowledgeUtils.test.mjs`

**Interfaces:**
- Produces (`src/components/modals/InboxDeepAnalysisModal.tsx`):
  ```tsx
  export interface InboxDeepAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    tenantId: string;
    companyName?: string;
    instanceId: string;
    instanceName: string;
    onCompleted?: (documentId?: string | null) => void;
  }
  export const InboxDeepAnalysisModal: React.FC<InboxDeepAnalysisModalProps>
  ```
- Consumes API:
  - `GET ${ENGINE_URL}/api/v1/knowledge/inbox-analyze/${instanceId}/status` (`headers: { 'x-tenant-id': tenantId }`)
  - `POST ${ENGINE_URL}/api/v1/knowledge/inbox-analyze/${instanceId}/start` (`{ mode }`)
  - `GET ${ENGINE_URL}/api/v1/knowledge/inbox-analyze/runs/${runId}` (polling 1.5s enquanto ativo)
  - `PATCH ${ENGINE_URL}/api/v1/knowledge/${docId}/scope` (`{ instanceId: string | null }`)

- [ ] **Step 1: Write failing unit tests for helper formatting & stage metadata (`src/utils/inboxKnowledgeUtils.test.mjs`)**

Testar helpers puros para o modal: cálculo de rótulo de checkpoint (`formatInboxCheckpointSummary` exibindo `DD/MM/AAAA às HH:mm` e pendentes, ou 1ª análise histórica), mapeamento dos 10 estágios e normalização segura de contadores `stats`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/inboxKnowledgeUtils.test.mjs`
Expected: FAIL (`Cannot find module '...inboxKnowledgeUtils.mjs'`).

- [ ] **Step 3: Implement helper (`src/utils/inboxKnowledgeUtils.mjs` / `.d.ts` seguindo padrão `remoteAccess`) e `src/components/modals/InboxDeepAnalysisModal.tsx`**

- Criar `src/utils/inboxKnowledgeUtils.mjs` (+ `.d.mts`) com `INBOX_ANALYSIS_STAGES` (1..10), `formatInboxCheckpointSummary(...)`, `normalizeRunStats(...)`.
- Criar `src/components/modals/InboxDeepAnalysisModal.tsx` em Glassmorphism escuro (`#0b141a` / `#182229` / esmeralda + índigo/violeta) com:
  - Cabeçalho (Nome da Caixa + Empresa + badge de escopo).
  - Card de Checkpoint & Auditoria Temporal (mostra última análise + novas msgs pendentes ou histórico inicial).
  - Controles `"Analisar Dados Novos e Implantar na Base"` (`incremental`) e `"Reanalisar Histórico Completo do Zero"` (`full`, com confirmação quando já analisada).
  - Stepper ao vivo das 10 camadas + contadores em tempo real + tratamento automático de `409 Conflict` conectando no `activeRun`.
  - Visualizador Markdown do resultado gerado (`extracted_behavior_summary` + documento completo), aba **"Relatório de Filtragem (Lixo Descartado)"** listando amostras anônimas `discarded_samples`, botão **Abrir em `/knowledge?instanceId=...`** e toggle 1-clique **Global ⇄ Exclusivo da Caixa**.

- [ ] **Step 4: Run test & frontend type/build check**

Run: `node --test src/utils/inboxKnowledgeUtils.test.mjs && npm run build`
Expected: PASS (tests green + Vite/TDZ build succeeds with zero errors).

- [ ] **Step 5: Commit**

```bash
git add src/utils/inboxKnowledgeUtils.mjs src/utils/inboxKnowledgeUtils.d.mts src/utils/inboxKnowledgeUtils.test.mjs src/components/modals/InboxDeepAnalysisModal.tsx
git commit -m "feat(ui): create InboxDeepAnalysisModal studio and 10-layer progress telemetry"
```

---

### Task 8: Integração do Submenu por Caixa em Todas as Telas + Filtro e Escopo na `KnowledgeBase.tsx`

**Files:**
- Modify: `src/components/MainSidebar.tsx` (botão `⋮` sempre acessível em foco/hover/mobile em cada caixa + item `🧠 Análise Profunda da Caixa (IA)` em `instanceContextMenu` + estado e render de `<InboxDeepAnalysisModal />`)
- Modify: `src/pages/ChatDashboard.tsx` (botão discreto `🧠` / `MoreVertical` em cada caixa de `renderChannelPickerInner` abrindo `<InboxDeepAnalysisModal />`)
- Modify: `src/pages/settings/InboxesList.tsx` (botão de ação `🧠 Análise Profunda` em cada item da lista + `<InboxDeepAnalysisModal />`)
- Modify: `src/pages/settings/InboxSettings.tsx` (botão destacado no cabeçalho de configurações da caixa abrindo `<InboxDeepAnalysisModal />`)
- Modify: `src/pages/InstancesDashboard.tsx` (botão `🧠 Análise Profunda (RAG)` em cada card de instância + `<InboxDeepAnalysisModal />`)
- Modify: `src/pages/KnowledgeBase.tsx` (carregar `whatsapp_instances` da empresa, ler `?instanceId=...`, barra de filtro `Todas | 🌐 Globais da Empresa | 📦 Caixa`, badge de caixa no card do documento, toggle `Tornar Global` / `Restringir à Caixa` via `PATCH /api/v1/knowledge/:id/scope`, atalho `🧠 Atualizar via Análise Profunda` e seletor opcional de caixa no `Simulador Raio-X`)

- [ ] **Step 1: Atualizar pontos de entrada por Caixa (Sidebar, Chat Channel Picker, InboxesList, InboxSettings, InstancesDashboard)**

Conectar o `<InboxDeepAnalysisModal />` passando `tenantId`, `companyName` (do store/empresa logada), `instanceId` e `instanceName` corretos da caixa clicada em cada um dos 5 componentes, garantindo `e.stopPropagation()` para não disparar navegação ou filtro acidental de chat.

- [ ] **Step 2: Atualizar `src/pages/KnowledgeBase.tsx` para Escopo Global vs Caixa**

- Carregar `whatsapp_instances` do `tenantId` logado (`id, display_name, status, last_knowledge_analyzed_at`).
- Adicionar filtro de escopo (`selectedScope`: `'all' | 'global' | string`) inicializado de `?instanceId=` da URL, filtrando `filteredDocuments` conforme `doc.instance_id`.
- Exibir badge de escopo (`🌐 Global da Empresa` ou `📦 Caixa: <nome>`) + botão 1-clique para alternar escopo (`PATCH /api/v1/knowledge/:id/scope`) + botão `"🧠 Análise Profunda"` quando uma caixa estiver filtrada + seletor no `Simulador Raio-X` enviando `instanceId` no `/match`.

- [ ] **Step 3: Verificar build completo + lint dos arquivos tocados + todos os testes Backend & Frontend**

Run:
- `node --test server/tests/inbox-knowledge-migrations.test.mjs server/tests/knowledge-curator-instance-scope.test.mjs server/tests/inbox-knowledge-analyzer-filters.test.mjs server/tests/inbox-knowledge-job.test.mjs server/tests/knowledge-routes-inbox.test.mjs server/tests/agent-inbox-behavior.test.mjs src/utils/inboxKnowledgeUtils.test.mjs`
- `node --check server/src/index.js server/src/api-gateway/knowledge.js server/src/api-gateway/knowledge-curator.js server/src/api-gateway/inbox-knowledge-analyzer.js server/src/automation-worker/agent.js`
- `npm run build`

Expected: 100% PASS em todos os testes unitários/contrato, sintaxe Node limpa e build Vite + TDZ concluído sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/MainSidebar.tsx src/pages/ChatDashboard.tsx src/pages/settings/InboxesList.tsx src/pages/settings/InboxSettings.tsx src/pages/InstancesDashboard.tsx src/pages/KnowledgeBase.tsx
git commit -m "feat(ui): wire per-inbox deep analysis submenus and inbox scope management in KnowledgeBase"
```

---

## Self-Review Checklist (Executado após escrita do plano)
1. **Spec coverage**: Todas as seções (1 a 8) da especificação têm tarefa dedicada: SQL/RPC (Task 1), `knowledge-curator.js` (Task 2), Funil 10 camadas (Tasks 3–4), Rotas API `/inbox-analyze/*` + `/:id/scope` + `/overview` + `/match` (Task 5), `AutomationWorker` `behavior_profile` + `p_instance_id` (Task 6), `InboxDeepAnalysisModal.tsx` (Task 7), submenus em todas as telas + `/knowledge` (Task 8). Nenhuma lacuna.
2. **Type/Signature consistency**: `buildInboxKnowledgeMigrationSql`, `isValidUuid`, `commitCuratedDocument({ instanceId, behaviorProfile, ... })`, `hybridRetrieveKnowledge({ instanceId, ... })`, `startInboxDeepAnalysis`, `getInboxAnalysisStatus`, `getInboxAnalysisRun`, `getInboxBehaviorProfile`, `invalidateInboxBehaviorCache` e `InboxDeepAnalysisModalProps` batem 100% entre todas as tarefas.
3. **Review Focus coverage**: Cada um dos 5 pontos críticos possui teste explícito na respectiva tarefa dona (`Task 2`, `Task 3`, `Task 4`, `Task 5`, `Task 6`).
