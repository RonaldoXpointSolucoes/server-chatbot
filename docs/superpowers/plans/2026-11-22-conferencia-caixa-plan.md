# Conferência Caixa (Conciliação Financeira & Dashboard de Saúde) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o menu **Conferência Caixa** abaixo de **Respostas Prontas** com upload unificado multi-formato (`.xlsx`, `.xls`, `.csv`, `.ofx`, `.txt`), motor determinístico "Fórmula 1" de conciliação e detecção de faltas/sobras/trocas/agrupamentos, camada de IA investigadora sob demanda, persistência multi-tenant no Supabase e dashboard moderno de saúde do caixa.

**Architecture:** Toda leitura de arquivos e conciliação matemática em centavos inteiros roda client-side em módulos ESM puros (`src/utils/cash*.mjs`) testáveis com `node --test`, aproveitando `xlsx` já instalado no projeto. O histórico, sessões fechadas e regras evolutivas da Fórmula 1 são persistidos diretamente no Supabase com isolamento por `tenant_id` (sem alterar `/server`), enquanto `geminiService.ts` atua sob demanda para investigar divergências complexas e sugerir novas regras da Fórmula 1.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Zustand (`useChatStore`), SheetJS (`xlsx` ^0.18.5), Supabase JS SDK + PostgreSQL RLS, Gemini Proxy (`geminiService.ts`), Node.js `node:test` + `node:assert/strict`, Vite.

**Spec:** [docs/superpowers/specs/2026-11-22-conferencia-caixa-design.md](docs/superpowers/specs/2026-11-22-conferencia-caixa-design.md)

## Global Constraints

- Arquitetura **Client-Side First + Supabase**: **nenhuma alteração** em `/server`, rotas WhatsApp/Baileys ou deploys automáticos (`git push` / `deploy` proibidos sem comando explícito do usuário).
- Idioma padrão de toda a interface, mensagens, relatórios e código comentado ao usuário: **Português do Brasil (pt-BR)**.
- Precisão financeira em **centavos inteiros (`Math.round(amount * 100)`)**: proibido comparar floats diretamente ou usar IA para somas determinísticas.
- Multi-tenancy estrito (`tenant_id` de `companies`/`tenants` em todas as tabelas e queries).
- Preservar integralmente regras de negócio e arquivos existentes no repositório; garantir compilação limpa via `npm run build` (que executa `node scripts/check-tdz.cjs && vite build`) e suporte perfeito aos temas Claro e Escuro em Mobile, Tablet e Desktop sem scrollbar horizontal.

## Review Focus

1. **Planilhas protegidas por senha (ex.: C6 Pay `EncryptedPackage`)**: o leitor deve detectar proteção OOXML sem travar o lote, tentar desbloqueio automático padrão (`VelvetSweatshop`/vazio) e permitir informar senha inline no card de upload ou orientar fallback.
2. **PIX no OFX sem palavra `"Pix"` no `<MEMO>` e deduplicação C6 Pay × OFX**: lançamentos como `DJALMAOLIVEIR` (UUID em `<REFNUM>`) devem ser classificados como `pix_cliente`, e PIX da C6 Pay já presentes no OFX devem ser deduplicados sem excluir PIX da C6 Pay ocorridos após o `DTEND` do OFX (`21:43`+).
3. **Datas seriais do Excel e virada `D+1` na C6 Pay (`2026-11-20` dentro de relatório `19/11`)**: converter números seriais de data/hora do Excel corretamente e não descartar vendas válidas por diferença de ±1 dia no cabeçalho do arquivo.
4. **`Recebido` em branco vs Troco (`Recebido > Valor`) no `PlanilhaRecebimento`**: linhas com `Valor > 0` e `Recebido` vazio devem usar `Valor` normalmente; pagamentos em dinheiro com troco (`Valor=45, Recebido=50`) devem somar `45` e registrar `5` apenas como troco.
5. **Conjunto parcial de arquivos & ausência de `RelConferencia` / `.txt`**: o motor deve calcular totais `SISTEMA` diretamente da `PlanilhaRecebimento` quando `RelConferencia` ou `.txt` não forem enviados, sem erros de `NaN` ou quebra de UI.

---

### Task 1: Schema Multi-Tenant no Supabase (`DB_SETUP_CASH_RECONCILIATION.sql`) e Contrato de Dados

**Files:**
- Create: `DB_SETUP_CASH_RECONCILIATION.sql`
- Create: `src/utils/cashReconciliationSchema.mjs`
- Test: `src/utils/cashReconciliationSchema.test.mjs`

**Interfaces:**
- Produces (`src/utils/cashReconciliationSchema.mjs`):
  - `buildCashReconciliationMigrationSql(): string`
  - `CASH_RECONCILIATION_TABLES: readonly ['cash_reconciliation_sessions', 'cash_reconciliation_files', 'cash_reconciliation_items', 'cash_reconciliation_rules']`
- Consumes: Padrão de `tenants(id)` e `get_auth_tenant_id()` / `tenant_users` de `DB_SETUP_CHECKLISTS.sql`.

- [ ] **Step 1: Write the failing test**

Criar `src/utils/cashReconciliationSchema.test.mjs` verificando que `buildCashReconciliationMigrationSql()` define as 4 tabelas (`cash_reconciliation_sessions`, `cash_reconciliation_files`, `cash_reconciliation_items`, `cash_reconciliation_rules`) com `IF NOT EXISTS`, chaves estrangeiras `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`, índices por `(tenant_id, reference_date)` / `(session_id)`, constraints de `status` e `ENABLE ROW LEVEL SECURITY` com policies por `tenant_id`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/cashReconciliationSchema.test.mjs`
Expected: FAIL (`Cannot find module '...cashReconciliationSchema.mjs'`).

- [ ] **Step 3: Implement `src/utils/cashReconciliationSchema.mjs` and write `DB_SETUP_CASH_RECONCILIATION.sql`**

- Em `src/utils/cashReconciliationSchema.mjs`, exportar `CASH_RECONCILIATION_TABLES` e `buildCashReconciliationMigrationSql()` retornando DDL idempotente completo para as 4 tabelas, trigger de `updated_at` e políticas RLS isolando `tenant_id` (compatível com `get_auth_tenant_id()` e fallback via `tenant_users`/`companies`).
- Gravar a saída exata do DDL em `DB_SETUP_CASH_RECONCILIATION.sql` na raiz para execução/aplicação via `scripts/supabase-sql-file.mjs`.

- [ ] **Step 4: Run test & apply migration check**

Run: `node --test src/utils/cashReconciliationSchema.test.mjs`
Expected: PASS (todas as asserções de DDL/RLS verdes). Se `DATABASE_URL` estiver configurada no `.env`, executar `node scripts/supabase-sql-file.mjs DB_SETUP_CASH_RECONCILIATION.sql` para criar as tabelas no Supabase imediatamente.

- [ ] **Step 5: Commit**

```powershell
git add DB_SETUP_CASH_RECONCILIATION.sql src/utils/cashReconciliationSchema.mjs src/utils/cashReconciliationSchema.test.mjs
git commit -m "feat(cash): add multi-tenant Supabase schema for cash reconciliation"
```

---

### Task 2: Regras Configuráveis da "Fórmula 1" e Normalização (`cashFormulaRules.mjs`)

**Files:**
- Create: `src/utils/cashFormulaRules.mjs`
- Test: `src/utils/cashFormulaRules.test.mjs`

**Interfaces:**
- Produces (`src/utils/cashFormulaRules.mjs`):
  - `DEFAULT_FORMULA_CONFIG: { amountToleranceCents: number; ofxPixDedupWindowSec: number; swapWindowSec: number; splitWindowSec: number; exactMatchWindowSec: number; nonPdvOfxKeywords: string[]; settlementOfxKeywords: string[]; adminRules: Array<{ pattern: string; category: NormalizedCategory; subType?: string }> }`
  - `mergeCompanyFormulaRules(customRules: CompanyRuleRow[]): FormulaConfig`
  - `normalizePdvPayment(formaPagto: string, administradora: string, config: FormulaConfig): { category: 'dinheiro' | 'pix' | 'cartao' | 'pendente' | 'ifood' | 'ticket' | 'outros'; subType: string; matchedRule?: string }`
  - `classifyOfxCredit(memo: string, refnum: string, amountCents: number, config: FormulaConfig): 'pix_cliente' | 'liquidacao_maquininha' | 'credito_nao_pdv'`

- [ ] **Step 1: Write the failing test**

Criar `src/utils/cashFormulaRules.test.mjs` cobrindo:
- `normalizePdvPayment('CARTÃO', 'PIX C6 BANK', cfg)` -> `{ category: 'pix' }`
- `normalizePdvPayment('CARTÃO', 'PAGO ONLINE PIX', cfg)` -> `{ category: 'pix' }`
- `normalizePdvPayment('CARTÃO', 'ANTONIO ALBERTO CREDITO', cfg)` -> `{ category: 'cartao', subType: 'credito' }`
- `normalizePdvPayment('CARTÃO', '/ CREDITO', cfg)` -> `{ category: 'cartao', subType: 'credito' }`
- `normalizePdvPayment('CARTÃO', 'VISA ELECTRON', cfg)` -> `{ category: 'cartao', subType: 'debito' }`
- `normalizePdvPayment('DINHEIRO', 'DINHEIRO', cfg)` -> `{ category: 'dinheiro' }`
- `normalizePdvPayment('NOTA PENDENTE', 'NOTA PENDENTE', cfg)` -> `{ category: 'pendente' }`
- `normalizePdvPayment('CONSUMO INTERNO', 'CONSUMO INTERNO', cfg)` -> `{ category: 'outros', subType: 'consumo_interno' }`
- Regra customizada da empresa sobrescreve o padrão (ex.: `VR ALIM` -> `ticket`).
- `classifyOfxCredit('DJALMAOLIVEIR', '01a1f52b-0b71-7f89-ec0a-3a722738f0a3', 9300, cfg)` -> `'pix_cliente'` (mesmo sem palavra `"Pix"` no memo).
- `classifyOfxCredit('ANTECIP. - PAYGO ADMINISTR - Elo Crédito', '202611190000290119179', 7142, cfg)` -> `'liquidacao_maquininha'`.
- `classifyOfxCredit('Pix recebido de LOCASERV MARKETING E SERVICOS LTDA', '01a1f443-9631-0ebe-d222-1b4905cf6ace', 790000, cfg)` com keyword `'LOCASERV'` -> `'credito_nao_pdv'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/cashFormulaRules.test.mjs`
Expected: FAIL (`Cannot find module '...cashFormulaRules.mjs'`).

- [ ] **Step 3: Implement `src/utils/cashFormulaRules.mjs`**

Implementar `DEFAULT_FORMULA_CONFIG`, `mergeCompanyFormulaRules`, `normalizePdvPayment` e `classifyOfxCredit` com normalização ASCII uppercase (`normalize('NFD').replace(/[\u0300-\u036f]/g, '')`), precedência de regras customizadas sobre padrões e detecção de UUID em `refnum` para PIX no OFX.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/utils/cashFormulaRules.test.mjs`
Expected: PASS (100% dos casos verdes).

- [ ] **Step 5: Commit**

```powershell
git add src/utils/cashFormulaRules.mjs src/utils/cashFormulaRules.test.mjs
git commit -m "feat(cash): add configurable Formula 1 normalization and OFX rules"
```

---

### Task 3: Desbloqueio OOXML & Parsers Multi-Formato (`cashOoxmlDecrypt.mjs` + `cashFileParsers.mjs`)

**Files:**
- Create: `src/utils/cashOoxmlDecrypt.mjs`
- Create: `src/utils/cashFileParsers.mjs`
- Test: `src/utils/cashOoxmlDecrypt.test.mjs`
- Test: `src/utils/cashFileParsers.test.mjs`

**Interfaces:**
- Produces (`src/utils/cashOoxmlDecrypt.mjs`):
  - `isEncryptedOoxmlBuffer(buffer: ArrayBuffer | Uint8Array): boolean`
  - `decryptOoxmlPackage(buffer: ArrayBuffer | Uint8Array, password: string): Promise<Uint8Array>` (compatível com WebCrypto no browser e `node:crypto` nos testes)
- Produces (`src/utils/cashFileParsers.mjs`):
  - `parseMoneyToCents(value: unknown): number`
  - `parseCashDateTime(dateVal: unknown, timeVal?: unknown): { dateStr: string; timeStr: string; secondsOfDay: number }`
  - `parseUploadedCashFile(input: { fileName: string; arrayBuffer?: ArrayBuffer | Uint8Array; textContent?: string; password?: string; rulesConfig?: FormulaConfig }): Promise<ParsedCashFileResult>`
  - Onde `ParsedCashFileResult` inclui: `fileType` (`'pdv_vendas' | 'rel_conferencia' | 'fechamento_txt' | 'extrato_ofx' | 'adquirente_rede' | 'adquirente_c6pay' | 'extrato_generico' | 'unknown'`), `status` (`'ok' | 'password_required' | 'error'`), `errorMessage?`, `periodStart`, `periodEnd`, `warnings: string[]`, `rows: any[]`, `summary: Record<string, any>`.

- [ ] **Step 1: Write the failing tests**

1. `src/utils/cashOoxmlDecrypt.test.mjs`:
   - Testa `isEncryptedOoxmlBuffer` retornando `false` para ZIP (`PK`) normal e `true` para container CFB contendo `EncryptionInfo`/`EncryptedPackage`.
   - Testa tentativa de descriptografia com senha incorreta lançando erro tipado `INVALID_PASSWORD` (e valida parser real de `EncryptionInfo` Agile/Standard quando uma fixture OOXML protegida é processada).
2. `src/utils/cashFileParsers.test.mjs`:
   - Testa `parseMoneyToCents` para `' R$ 17.50 '`, `'R$ 1.234,56'`, `' R$ -   '`, `'50,00*'`, `-0.12`, `185.35` -> centavos inteiros exatos (`1750`, `123456`, `0`, `5000`, `-12`, `18535`).
   - Testa `parseCashDateTime` para serial Excel (`46345`, `25569.93488425926` -> `'2026-11-19'`, `'22:26:14'`), `'19/11/2026'` e `'2026-11-20'`.
   - Testa `parseUploadedCashFile` para os 6 formatos reais (usando fixtures dos dados reais de 19/11/2026):
     - `PlanilhaRecebimento` (inclusive `Recebido` vazio preservando `Valor` + troco `45/50`);
     - `RelConferencia` (bloco superior `610.55`, `345.10`, `67.58`, `888.07` + tabela `Total = 5737.81`);
     - `FechamentoPDV .txt` (`SANGRIA CX. RET = 630.80`, `SAIDAS = 67.58`, `SALDO DINHEIRO = 257.27`, `10` devedores `VENDAS PENDENTES = 409.00`, `PRODUTOS CANCELADOS = 69.00`, `CONSUMO INTERNO = 355.00`);
     - `Extrato OFX C6` (16 `pix_cliente` somando `109215` centavos incluindo `DJALMAOLIVEIR`, `PAYGO` = `263919`, `LOCASERV` = `790000`, débitos = `-1178595`);
     - `Rede` (cabeçalho de 5 linhas ignorado, status `aprovada` e `pago`, bruto/taxas/líquido);
     - `C6 Pay` (3 linhas + separador ignorados, `Aprovada` vs `Não autorizada`, preservação da linha `2026-11-20 21:51:28`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/utils/cashOoxmlDecrypt.test.mjs src/utils/cashFileParsers.test.mjs`
Expected: FAIL (`Cannot find module`).

- [ ] **Step 3: Implement `cashOoxmlDecrypt.mjs` and `cashFileParsers.mjs`**

- Em `cashOoxmlDecrypt.mjs`: usar `XLSX.CFB` para checar streams `EncryptionInfo` / `EncryptedPackage` e implementar decifragem OOXML Agile (XML `<keyEncryptor>` + `SHA-512`/`SHA-1` + `AES-CBC` via `globalThis.crypto.subtle` com fallback `node:crypto` para testes Node).
- Em `cashFileParsers.mjs`: implementar leitura unificada via `xlsx` (`raw: true` + `raw: false`), parser OFXSGML tolerante, parser de linhas para `.txt` e parsers dedicados por assinatura de colunas/títulos, mais detector genérico de extrato bancário CSV/XLSX (Itaú/outros).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/utils/cashOoxmlDecrypt.test.mjs src/utils/cashFileParsers.test.mjs`
Expected: PASS (todos os testes verdes, validando os valores ao centavo).

- [ ] **Step 5: Commit**

```powershell
git add src/utils/cashOoxmlDecrypt.mjs src/utils/cashFileParsers.mjs src/utils/cashOoxmlDecrypt.test.mjs src/utils/cashFileParsers.test.mjs
git commit -m "feat(cash): add multi-format parsers and OOXML encrypted xlsx support"
```

---

### Task 4: Motor Determinístico de Conciliação "Fórmula 1" (`cashReconciliationEngine.mjs`)

**Files:**
- Create: `src/utils/cashReconciliationEngine.mjs`
- Test: `src/utils/cashReconciliationEngine.test.mjs`

**Interfaces:**
- Consumes: `ParsedCashFileResult[]` (`cashFileParsers.mjs`), `FormulaConfig` (`cashFormulaRules.mjs`).
- Produces (`src/utils/cashReconciliationEngine.mjs`):
  - `runCashReconciliation(params: { parsedFiles: ParsedCashFileResult[]; rulesConfig?: FormulaConfig; manualInputs?: { cashCountedCents?: number | null; sangriaOverrideCents?: number | null; notes?: string; categoryRealOverrides?: Record<string, number> }; manualResolutions?: Array<{ action: 'confirm_suggestion' | 'reject_suggestion' | 'manual_link' | 'ignore_item'; suggestionId?: string; systemIds?: string[]; realIds?: string[] }> }): ReconciliationResult`
  - Onde `ReconciliationResult` contém:
    - `referenceDate`, `storeName`, `operatorName`, `status` (`'balanced' | 'attention' | 'shortage' | 'surplus'`), `healthScore` (`0..100`)
    - `mirrorRows`: linhas espelho da `RelConferencia` (`key`, `label`, `systemCents`, `realCents`, `diffCents`, `sourceNote`)
    - `cashDrawerSummary`: `{ fundoManhaCents, vendaDinheiroCents, fundoNoiteCents, outrasEntradasCents, sangriaCents, saidasPagamentosCents, expectedTotalCents, expectedAfterSangriaCents, countedCents, swappedToDigitalCents }`
    - `systemItems`, `realItems`, `matchedPairs`, `suggestions`, `missingInBank`, `extraInBank`, `nonPdvItems`, `notAuthorizedItems`, `deduplicatedItems`
    - `financialMetrics`: `{ totalMdrFeeCents, totalNetDigitalCents, cancelledCount, cancelledCents, internalConsumptionCents, discountsCents, deliveryFeeCents, serviceFeeCents, pendingDebtors, guestCount, averageTicketCents }`

- [ ] **Step 1: Write the failing test**

Criar `src/utils/cashReconciliationEngine.test.mjs` testando o conjunto completo de 19/11/2026 + cenários de borda:
- Totais PDV normalizados: `pix = 132564`, `cartao = 311510`, `dinheiro = 34510`, `pendente = 40900`, `consumoInterno = 35500`.
- Deduplicação C6 Pay PIX × OFX C6: 5 PIX deduplicados (`3600`, `2050`, `9300`, `1400`, `9955`) somam apenas uma vez, enquanto `2100` e `14740` pós-21:43 permanecem ativos no Real.
- Detecção das 3 trocas de pagamento (`10200` Dinheiro↔PIX Rede, `800` Dinheiro↔Débito C6Pay, `14740` Dinheiro↔PIX C6Pay) na lista `suggestions` com `reasonType === 'swapped_method'`.
- Detecção de agrupamento `1:N` (`split_1_to_n`): venda PDV de `5000` centavos casando com `2500 + 2500` na maquininha em janela de 2h.
- Confirmação de sugestão via `manualResolutions` atualiza `matchedPairs`, zera a sugestão pendente e recalcula `mirrorRows` e `healthScore`.
- Execução parcial apenas com `PlanilhaRecebimento` + `Extrato OFX` (sem `RelConferencia` e sem `.txt`) calcula `mirrorRows` normalmente sem `NaN`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/cashReconciliationEngine.test.mjs`
Expected: FAIL (`Cannot find module '...cashReconciliationEngine.mjs'`).

- [ ] **Step 3: Implement `src/utils/cashReconciliationEngine.mjs`**

Implementar os 5 passes exatos da Spec (Normalização, Deduplicação C6Pay×OFX, Conciliação 1:1 com afinidade de terminal/horário, Trocas + Subset-Sum 1:N/N:1 com limite seguro de combinações, e Espelho `RelConferencia` + `Health Score`), mantendo funções puras e bem divididas por passe.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/utils/cashReconciliationEngine.test.mjs`
Expected: PASS (todos os testes verdes e totais ao centavo exatos).

- [ ] **Step 5: Commit**

```powershell
git add src/utils/cashReconciliationEngine.mjs src/utils/cashReconciliationEngine.test.mjs
git commit -m "feat(cash): implement Formula 1 deterministic cash reconciliation engine"
```

---

### Task 5: Camada de IA Auditora & Evolução da Fórmula 1 (`cashAiDiagnostics.mjs` + `geminiService.ts`)

**Files:**
- Create: `src/utils/cashAiDiagnostics.mjs`
- Test: `src/utils/cashAiDiagnostics.test.mjs`
- Modify: `src/services/geminiService.ts` (adicionar método `analyzeCashReconciliationIssues`)

**Interfaces:**
- Produces (`src/utils/cashAiDiagnostics.mjs`):
  - `buildCashAiAnalysisPrompt(params: { reconciliation: ReconciliationResult; parseErrors: ParsedCashFileResult[]; rulesConfig: FormulaConfig; userQuestion?: string }): string`
  - `parseCashAiAnalysisResponse(rawText: string): { summary: string; hypotheses: Array<{ title: string; systemItemIds: string[]; realItemIds: string[]; confidence: 'alta' | 'media' | 'baixa'; explanation: string }>; fileDiagnoses: Array<{ fileName: string; issue: string; fixGuidance: string }>; formulaSuggestions: Array<{ ruleType: 'normalize_admin' | 'ignore_ofx_memo' | 'engine_setting'; pattern: string; targetValue: string; reason: string }> }`
  - `toCompanyRulePayload(suggestion, tenantId): CashRuleInsertPayload`
- Produces (`src/services/geminiService.ts`):
  - `async analyzeCashReconciliationIssues(params): Promise<CashAiAnalysisResult>` (usa `this.executeResilientGenerateContent` com `responseMimeType: 'application/json'`).

- [ ] **Step 1: Write the failing test**

Criar `src/utils/cashAiDiagnostics.test.mjs` verificando:
- `buildCashAiAnalysisPrompt` inclui apenas os itens `missingInBank`, `extraInBank`, `parseErrors` e resumo das regras atuais (não serializa os 70+ itens já batidos para economizar tokens).
- `parseCashAiAnalysisResponse` interpreta JSON limpo ou cercado por markdown ```` ```json ```` e retorna arrays estruturados validados sem lançar erro caso algum campo venha omitido.
- `toCompanyRulePayload` converte sugestão da IA em registro válido para `cash_reconciliation_rules` com `source_origin: 'ai_suggested'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/cashAiDiagnostics.test.mjs`
Expected: FAIL (`Cannot find module '...cashAiDiagnostics.mjs'`).

- [ ] **Step 3: Implement `src/utils/cashAiDiagnostics.mjs` and integrate into `src/services/geminiService.ts`**

- Implementar prompt builder, parser resiliente e conversor de regra em `src/utils/cashAiDiagnostics.mjs`.
- Adicionar `analyzeCashReconciliationIssues` em `src/services/geminiService.ts` usando `executeResilientGenerateContent` (`gemini-2.5-flash`) e `parseCashAiAnalysisResponse`.

- [ ] **Step 4: Run test & TypeScript check**

Run: `node --test src/utils/cashAiDiagnostics.test.mjs; npx tsc --noEmit`
Expected: PASS (testes verdes e `tsc` sem erros no `geminiService.ts`).

- [ ] **Step 5: Commit**

```powershell
git add src/utils/cashAiDiagnostics.mjs src/utils/cashAiDiagnostics.test.mjs src/services/geminiService.ts
git commit -m "feat(cash): add on-demand AI reconciliation auditor and Formula 1 rule suggestions"
```

---

### Task 6: Camada de Persistência Multi-Tenant (`src/services/cashReconciliationService.ts`)

**Files:**
- Create: `src/services/cashReconciliationService.ts`
- Test: `src/utils/cashReconciliationServiceHelper.mjs` + `src/utils/cashReconciliationServiceHelper.test.mjs` (payload builders & validation puros)

**Interfaces:**
- Produces (`src/services/cashReconciliationService.ts`):
  - `listCashReconciliationSessions(tenantId: string, limit?: number): Promise<CashSessionRow[]>`
  - `loadCashReconciliationSession(tenantId: string, sessionId: string): Promise<LoadedSessionBundle>`
  - `saveCashReconciliationSession(params: { tenantId: string; userEmail?: string; sessionId?: string; parsedFiles: ParsedCashFileResult[]; result: ReconciliationResult; manualInputs: any; manualResolutions: any[]; aiAnalysis?: any; markClosed?: boolean }): Promise<{ sessionId: string }>`
  - `listCashFormulaRules(tenantId: string): Promise<CashRuleRow[]>`
  - `saveCashFormulaRule(tenantId: string, rule: NewCashRuleInput): Promise<CashRuleRow>`
  - `toggleCashFormulaRule(tenantId: string, ruleId: string, isActive: boolean): Promise<void>`
  - `deleteCashFormulaRule(tenantId: string, ruleId: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Criar `src/utils/cashReconciliationServiceHelper.test.mjs` validando:
- `buildSessionPersistencePayload` gera payload com `tenant_id` obrigatório (rejeita se vazio), `system_total_cents`, `real_total_cents`, `diff_cents`, `health_score`, `reconciled_summary` e lista normalizada de `files` e `items` sem campos `undefined`.
- `computeHistoricalHealthStats(sessions)` calcula taxa de batimento (%), acumulado de faltas/sobras e série ordenada cronologicamente.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/cashReconciliationServiceHelper.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement `src/utils/cashReconciliationServiceHelper.mjs` and `src/services/cashReconciliationService.ts`**

- Implementar os construtores puros e agregadores históricos em `cashReconciliationServiceHelper.mjs`.
- Implementar queries e transações em `src/services/cashReconciliationService.ts` usando `supabase` (com fallback seguro se sessão Supabase/JWT estiver em transição via `masterSupabase` estritamente escopado por `tenant_id`, seguindo o padrão verificado em `chatStore.ts`).

- [ ] **Step 4: Run test & TypeScript check**

Run: `node --test src/utils/cashReconciliationServiceHelper.test.mjs; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/utils/cashReconciliationServiceHelper.mjs src/utils/cashReconciliationServiceHelper.test.mjs src/services/cashReconciliationService.ts
git commit -m "feat(cash): add Supabase multi-tenant persistence and historical health queries"
```

---

### Task 7: Componentes Visuais do Dashboard & Mesa de Conferência (UI/UX SaaS Premium)

**Files:**
- Create: `src/components/cash-reconciliation/CashUploadDropzone.tsx`
- Create: `src/components/cash-reconciliation/CashHealthDashboard.tsx`
- Create: `src/components/cash-reconciliation/CashReconciliationWorkbench.tsx`
- Create: `src/pages/CashReconciliationPage.tsx`

**Interfaces:**
- Consumes: `parseUploadedCashFile`, `runCashReconciliation`, `mergeCompanyFormulaRules`, `geminiService.analyzeCashReconciliationIssues`, `cashReconciliationService`, `useChatStore` (`tenantInfo`, `currentUserEmail`), `useOutletContext` (`showMainSidebar`, `setShowMainSidebar`).
- Produces (`src/pages/CashReconciliationPage.tsx`): componente default export pronto para rota lazy em `src/App.tsx`.

- [ ] **Step 1: Implementar `CashUploadDropzone.tsx`**

Zona drag-and-drop para múltiplos arquivos (`.xlsx`, `.xls`, `.csv`, `.ofx`, `.txt`) exibindo cards com tipo detectado (`PlanilhaRecebimento`, `RelConferencia`, `Fechamento TXT`, `Extrato OFX`, `Rede`, `C6 Pay`), período, contagem de linhas, remoção individual e prompt de senha inline quando um arquivo retornar `status === 'password_required'`.

- [ ] **Step 2: Implementar `CashHealthDashboard.tsx`**

Painel executivo responsivo (Claro & Escuro) contendo:
- Card Hero com medidor de saúde (`0–100%`), badge semáforo (`Bateu`, `Atenção`, `Falta`, `Sobra`), `Total Sistema × Total Real × Diferença` e resumo das trocas detectadas;
- Grid de 4 KPIs por canal (`Pix`, `Cartão`, `Dinheiro em Gaveta` com fórmula detalhada, `Pendentes & Outros`);
- Faixa gerencial de taxas MDR/antecipação, líquido a receber, cancelamentos, consumo interno, descontos e ticket por pessoa;
- Painel de evolução histórica (barras/comparativo dos fechamentos salvos no Supabase).

- [ ] **Step 3: Implementar `CashReconciliationWorkbench.tsx`**

Mesa interativa com 6 abas:
1. **Espelho `RelConferencia`**: tabela `SISTEMA × REAL × DIF` com campos editáveis para Dinheiro Contado na Gaveta, Sangria, ajustes manuais e observações;
2. **Sugestões de Equivalência**: lista de trocas (`DINHEIRO ↔ PIX/CARTÃO`) e combinações `1:N / N:1` com botões 1-clique **Confirmar Vínculo** / **Rejeitar**;
3. **Faltam no Banco/Maquininha**: tabela filtrável com ação de **Vincular Manualmente** a uma sobra ou marcar justificativa;
4. **Sobram no Banco/Maquininha**: entradas reais sem par separando visualmente repasses (`PAYGO`) e transferências não-PDV (`LOCASERV`);
5. **Auditoria Detalhada**: Pendentes nominais (`.txt`), Produtos Cancelados, Saídas Pagamentos detalhadas, Consumo Interno e Tentativas `Não autorizadas`;
6. **Auditor IA & Fórmula 1**: botão **"Investigar Divergências com IA"**, exibição de hipóteses/diagnósticos, aplicação de melhorias sugeridas em 1 clique e CRUD de regras da Fórmula 1 da empresa.

- [ ] **Step 4: Implementar `src/pages/CashReconciliationPage.tsx` e verificar TypeScript**

Orquestra seletor de sessões salvas por data, botão **"Nova Conferência"**, botão **"Salvar / Fechar Conferência"**, modal/drawer de regras da Fórmula 1, e estado de carregamento/empty state ilustrado.

Run: `npx tsc --noEmit`
Expected: PASS (0 erros de tipagem).

- [ ] **Step 5: Commit**

```powershell
git add src/components/cash-reconciliation/CashUploadDropzone.tsx src/components/cash-reconciliation/CashHealthDashboard.tsx src/components/cash-reconciliation/CashReconciliationWorkbench.tsx src/pages/CashReconciliationPage.tsx
git commit -m "feat(ui): build Conferência Caixa health dashboard and reconciliation workbench"
```

---

### Task 8: Integração do Menu Lateral, Rota, Catálogo de Releases e Verificação Final

**Files:**
- Modify: `src/components/MainSidebar.tsx:1565-1573`
- Modify: `src/App.tsx:50-75,180-190`

**Interfaces:**
- Consumes: `CashReconciliationPage` (`src/pages/CashReconciliationPage.tsx`).
- Produces: Item **Conferência Caixa** imediatamente abaixo de **Respostas Prontas** no menu lateral e rota `/conferencia-caixa` protegida em `App.tsx`.

- [ ] **Step 1: Atualizar `src/components/MainSidebar.tsx` e `src/App.tsx`**

- Em `src/components/MainSidebar.tsx`: importar `Scale` (ou `Wallet`) de `lucide-react` e adicionar o `<NavItem>` **Conferência Caixa** logo abaixo do `<NavItem title="Respostas Prontas" ... />` navegando para `/conferencia-caixa` (chamando `onClose?.()` no mobile, como os demais links).
- Em `src/App.tsx`: adicionar `const CashReconciliationPage = lazyWithRetry(() => import('./pages/CashReconciliationPage'));` e registrar `<Route path="/conferencia-caixa" element={<ErrorBoundary><CashReconciliationPage /></ErrorBoundary>} />` dentro de `<Route element={<MainLayout />}>`.

- [ ] **Step 2: Executar toda a suíte de testes + lint + build completo**

Run: `node --test src/utils/cash*.test.mjs; npm run lint; npm run build`
Expected:
- Todos os testes `cash*.test.mjs` passando (`0` falhas);
- `npm run build` (`check-tdz.cjs && vite build`) saindo com código `0`.

- [ ] **Step 3: Verificação visual da UI (Desktop & Mobile, Modo Claro & Escuro)**

Iniciar `npm run dev` (ou preview) e verificar visualmente a renderização de `/conferencia-caixa` (menu posicionado abaixo de **Respostas Prontas**, dropzone, cards de saúde e abas em tema Claro e Escuro sem overflow horizontal) via subagente `browser` (seguindo as credenciais de automação do projeto se necessário) ou confirmar ausência de erros de console.

- [ ] **Step 4: Commit final da integração**

```powershell
git add src/components/MainSidebar.tsx src/App.tsx
git commit -m "feat(ui): wire Conferência Caixa menu item and /conferencia-caixa route"
```
