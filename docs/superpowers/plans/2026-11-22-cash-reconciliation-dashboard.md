# Dashboard Executivo, Exclusão de Caixas, WhatsApp FoodNext, PDF & Memória Adaptativa de Bancos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir `/conferencia-caixa` para abrir em um **Dashboard Executivo** resumido com ações de **Abrir**, **Enviar Resumo via WhatsApp (API FoodNext + nº memorizado por empresa)**, **Exportar Relatório Executivo PDF (A4)** e **Excluir Fechamentos**, além de dotar o sistema de **memória adaptativa por empresa** para identificar bancos (`Itaú` + `C6` + outros) e relatórios diários habituais e alertar automaticamente quando algum estiver faltando.

**Architecture:** Reaproveita a rota única `/conferencia-caixa` como Hub Dual (`Dashboard Executivo` ↔ `Workspace de Auditoria`), preservando rascunhos em andamento em memória e `localStorage`. Persistência de exclusões em `cash_reconciliation_sessions` (cascata no Supabase + cache local) e armazenamento do telefone WhatsApp e do perfil aprendido (`company_routine:profile`) em `cash_reconciliation_rules` (`engine_setting`) + `localStorage` isolado por `tenantId`.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, Supabase JS SDK, Node Native Test Runner (`node --test`), `whatsappEngine.ts` (`sendNativeMessage`).

**Spec:** [docs/superpowers/specs/2026-11-22-cash-reconciliation-dashboard-design.md](file:///c:/Users/NOTE-(FORM)02JUL26/Documents/Projetos/Antigravity/ChatBoot/docs/superpowers/specs/2026-11-22-cash-reconciliation-dashboard-design.md)

## Global Constraints

- Toda comunicação, labels de UI, mensagens de alerta, PDF e resumos WhatsApp em **Português do Brasil (pt-BR)**.
- Isolamento estrito multi-tenant por `tenantId` em sessões, perfis de rotina aprendidos, senhas fixas e telefone WhatsApp.
- Nunca hardcodar `api_key` da instância `FoodNext` (`cc4efe36-f391-4b3d-a24c-ddcd8a293cf6`); consultar dinamicamente de `whatsapp_instances` em runtime e nunca registrar chaves/tokens em logs.
- Nunca modificar arquivos dentro de `/server/` e nunca executar `git push` ou `deploy` sem comando explícito do usuário (`Deploy`).
- Regra UI/UX (`ui-ux-enhancement`): Dark/Light mode impecável, zero overflow horizontal em mobile (`grid-cols-1` ➔ `md:grid-cols-2` ➔ `lg:grid-cols-4`), `tabular-nums whitespace-nowrap` para valores monetários e feedback tátil `active:scale-95`.

## Review Focus

- **Sessões múltiplas na mesma data (`19/11` duplicado):** Garantir que excluir um fechamento apague exclusivamente pelo `id` exato sem remover o fechamento irmão do mesmo dia e mantenha ambas as barras/cards distintos por horário/operador/turno.
- **Múltiplos bancos na mesma empresa (`Banco C6` + `Banco Itaú`):** Garantir que importar apenas o OFX do C6 acuse especificamente a falta do extrato do **Banco Itaú** quando ambos estiverem aprendidos na rotina, permitindo ao usuário dispensar temporariamente (`enabled: false`) caso não tenha havido movimento.
- **Validação de telefone WhatsApp & fallback de número salvo:** Números inválidos/incompletos (`< 10` dígitos após normalização) devem retornar erro legível sem disparar requisição à API FoodNext e sem sobrescrever um número válido salvo anteriormente.
- **Sanitização HTML no PDF & campos nulos (`auditInsights` / `cashDrawerSummary`):** Nomes de clientes/operadores/produtos com `<`, `>`, `&`, `"` devem sofrer escaping seguro ao montar HTML A4, e fechamentos parciais/antigos sem snapshot completo devem renderizar sem `NaN` nem crash.
- **Carga sob demanda (Lazy Load) no Dashboard:** Como `SESSION_LIST_COLUMNS` omite `reconciled_summary`, ações diretas de **WhatsApp** e **PDF** nos cards do Dashboard devem buscar `loadCashReconciliationSession(tenantId, id)` antes de gerar o relatório e reportar erro claro caso a sessão não seja encontrada.

---

### Task 1: Identificação Canônica de Bancos (`Itaú`, `C6`, etc.) nos Parsers & Engine

**Files:**
- Modify: `src/utils/cashFileParsers.mjs:503-575` e `1050-1120`
- Modify: `src/utils/cashReconciliationEngine.mjs:210-235`
- Test: `src/utils/cashFileParsers.test.mjs`

**Interfaces:**
- Produces: `identifyBankInstitution({ bankName, bankId, acctId, fileName, headerText }) -> { bankKey: string, bankCode: string, bankLabel: string, acctLast4: string }` (exportada em `cashFileParsers.mjs`)
- Consumes: `parsedFiles[].summary.{bankKey, bankCode, bankLabel, acctLast4}` no `cashReconciliationEngine.mjs`

- [ ] **Step 1: Escrever teste falhando para `identifyBankInstitution` e enriquecimento OFX/planilha (`Itaú` e `C6`)**

Adicionar em `src/utils/cashFileParsers.test.mjs`: verificar que um OFX do C6 (`BANKID 336`, `ACCTID 372910726`) produz `{ bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6', acctLast4: '0726' }`, que um OFX do Itaú (`BANKID 341`, `ORG ITAU UNIBANCO S.A.`) produz `{ bankKey: 'banco_341', bankCode: '341', bankLabel: 'Banco Itaú' }` e que `Extrato_Itau_19_11.xlsx` em planilha genérica detecta `bankKey: 'banco_341'`.

- [ ] **Step 2: Rodar teste e confirmar falha**

Run: `node --test src/utils/cashFileParsers.test.mjs`
Expected: FAIL (`identifyBankInstitution is not a function` / campos ausentes).

- [ ] **Step 3: Implementar `identifyBankInstitution` em `src/utils/cashFileParsers.mjs` e propagar para OFX, Planilha Genérica e `cashReconciliationEngine.mjs`**

1. Criar tabela canônica de bancos brasileiros (`336` Banco C6, `341` Banco Itaú, `001` Banco do Brasil, `033` Santander, `237` Bradesco, `077` Inter, `260` Nubank, `104` Caixa, `756` Sicoob, `748` Sicredi) e fallback normalizado `banco_<codigo_ou_slug>`.
2. Em `parseOfxText`, chamar `identifyBankInstitution({ bankName, bankId, acctId, fileName })`, gravando `bankKey`, `bankCode`, `bankLabel` e `acctLast4` no `summary` e em cada linha.
3. Em `parseGenericBankMatrix`, aceitar `fileName` e inferir banco por `fileName` + primeiras linhas da matriz, gravando os mesmos metadados no `summary` e linhas.
4. Em `cashReconciliationEngine.mjs:210-235`, propagar `bankKey`, `bankLabel` e `acctLast4` para `item.terminalName` e `item.metadata`.

- [ ] **Step 4: Rodar testes**

Run: `node --test src/utils/cashFileParsers.test.mjs src/utils/cashReconciliationEngine.test.mjs`
Expected: PASS.

---

### Task 2: Motor de Memória Adaptativa por Empresa (`cashCompanyRoutineHelper.mjs` + `cashReportCompleteness.mjs`)

**Files:**
- Create: `src/utils/cashCompanyRoutineHelper.mjs`
- Create: `src/utils/cashCompanyRoutineHelper.test.mjs`
- Modify: `src/utils/cashReportCompleteness.mjs:1-142`
- Modify: `src/utils/cashReportCompleteness.test.mjs`
- Modify: `src/utils/cashReconciliationEngine.mjs:705-720`
- Modify: `src/types/cashReconciliation.ts:53-85`

**Interfaces:**
- Consumes: `identifyBankInstitution` metadata presente em `parsedFiles[].summary`, `rules` (`company_routine:profile`)
- Produces:
  - `createEmptyRoutineProfile() -> CompanyCashRoutineProfile`
  - `parseRoutineProfileFromRules(rules) -> CompanyCashRoutineProfile | null`
  - `learnRoutineFromParsedFiles(profile, parsedFiles, referenceDate) -> { profile: CompanyCashRoutineProfile, changed: boolean }`
  - `bootstrapRoutineFromSessions(profile, sessions) -> { profile: CompanyCashRoutineProfile, changed: boolean }`
  - `toggleRoutineBankExpected(profile, bankKey, enabled) -> CompanyCashRoutineProfile`
  - `toggleRoutineReportExpected(profile, fileType, enabled) -> CompanyCashRoutineProfile`
  - `assessCashReportCompleteness(parsedFiles, companyProfile = null) -> CashReportCompleteness`

- [ ] **Step 1: Escrever testes falhando para aprendizado de 2 bancos (`C6` + `Itaú`) e detecção de ausência parcial**

Em `src/utils/cashCompanyRoutineHelper.test.mjs` e `src/utils/cashReportCompleteness.test.mjs`:
1. `learnRoutineFromParsedFiles` com OFX do C6 + OFX do Itaú + Rede + C6 Pay + PDV registra `banco_336` e `banco_341` com `enabled: true`, `seenCount: 1`.
2. Ao chamar `assessCashReportCompleteness` no dia seguinte com **apenas OFX do C6**, validar que `bank.items` traz `Banco C6 (OFX)` com `present: true` e `Banco Itaú (OFX)` com `present: false`, gerando alerta explícito mencionando `Banco Itaú`.
3. Ao chamar `toggleRoutineBankExpected(profile, 'banco_341', false)`, validar que o aviso de `Banco Itaú` desaparece imediatamente.

- [ ] **Step 2: Rodar testes e confirmar falha**

Run: `node --test src/utils/cashCompanyRoutineHelper.test.mjs src/utils/cashReportCompleteness.test.mjs`
Expected: FAIL (`Cannot find module` / `bank.items` sem divisão por banco).

- [ ] **Step 3: Implementar `cashCompanyRoutineHelper.mjs`, atualizar `assessCashReportCompleteness` e tipagem em `cashReconciliation.ts`**

1. Implementar `cashCompanyRoutineHelper.mjs` com armazenamento isolado por `tenantId` (`cash_recon_routine_<tenantId>`), helpers puros de aprendizado (`learnRoutineFromParsedFiles`, `bootstrapRoutineFromSessions`, toggles) e extração segura de regras (`COMPANY_ROUTINE_RULE_PATTERN = 'company_routine:profile'`).
2. Atualizar `assessCashReportCompleteness(parsedFiles, companyProfile)` para expandir dinamicamente bancos aprendidos (`enabled !== false`) no bloco `bank.items` (preservando comportamento padrão quando `companyProfile` for nulo) e marcar cada item com `{ bankKey?, isLearnedBank?, isHabitual?, seenCount? }`.
3. Passar `companyRoutineProfile` opcional em `runCashReconciliation` repassando-o para `assessCashReportCompleteness(parsedFiles, companyRoutineProfile)`.

- [ ] **Step 4: Rodar testes**

Run: `node --test src/utils/cashCompanyRoutineHelper.test.mjs src/utils/cashReportCompleteness.test.mjs src/utils/cashReconciliationEngine.test.mjs`
Expected: PASS.

---

### Task 3: Formatadores Puros de Resumo WhatsApp & Relatório PDF A4 (`cashReportExportHelper.mjs`)

**Files:**
- Create: `src/utils/cashReportExportHelper.mjs`
- Create: `src/utils/cashReportExportHelper.test.mjs`

**Interfaces:**
- Consumes: `CashReconciliationResult`, `CashSessionRow`, `CashManualInputs`, `formatCents`, `formatDateBr`
- Produces:
  - `normalizeBrazilWhatsappNumber(raw) -> { ok: boolean, digits: string, jid: string, display: string, error?: string }`
  - `buildCashWhatsappSummaryMessage({ result, session, storeName, manualInputs }) -> string`
  - `buildCashPdfReportHtml({ result, session, storeName, manualInputs }) -> string`
  - `extractCashWhatsappNumberFromRules(rules) -> string`
  - `CASH_WHATSAPP_RULE_PATTERN = 'whatsapp_notify:phone'`

- [ ] **Step 1: Escrever testes falhando cobrindo validação de telefone, texto WhatsApp e HTML PDF com escaping XSS**

1. Testar `(11) 94775-8860`, `5511947758860`, `11947758860` ➔ validam e produzem `5511947758860@s.whatsapp.net`; testar `123` ➔ `{ ok: false, error: ... }`.
2. Testar `buildCashWhatsappSummaryMessage` com múltiplos bancos no `result` (`Banco C6` e `Banco Itaú`): garante presença de empresa, data `DD/MM/YYYY`, saúde `%`, PDV × Real × Diferença, PIX separado por banco quando houver, Cartões, Gaveta, Pendências e Consumo Interno.
3. Testar `buildCashPdfReportHtml` com operador `<script>alert(1)</script>` e `auditInsights: null`: verifica `@page`, tabela do espelho e zero tags `<script>` cruas sem escaping.

- [ ] **Step 2: Rodar teste e confirmar falha**

Run: `node --test src/utils/cashReportExportHelper.test.mjs`
Expected: FAIL (`Cannot find module`).

- [ ] **Step 3: Implementar `src/utils/cashReportExportHelper.mjs`**

Implementar `normalizeBrazilWhatsappNumber`, `escapeHtml`, `buildCashWhatsappSummaryMessage` (incluindo agrupamento automático dos PIX recebidos por `bankLabel`: C6 vs Itaú) e `buildCashPdfReportHtml` (documento A4 editorial claro e auto-contido).

- [ ] **Step 4: Rodar testes**

Run: `node --test src/utils/cashReportExportHelper.test.mjs`
Expected: PASS.

---

### Task 4: Exclusão de Fechamentos, Rotina, WhatsApp FoodNext & Helper de Estatísticas (`cashReconciliationService` & Helper)

**Files:**
- Modify: `src/utils/cashReconciliationServiceHelper.mjs:162-210`
- Modify: `src/utils/cashReconciliationServiceHelper.test.mjs`
- Modify: `src/services/cashReconciliationService.ts`

**Interfaces:**
- Consumes: `whatsappEngine.ts` (`sendNativeMessage`), `cashCompanyRoutineHelper.mjs`, `cashReportExportHelper.mjs`, `cashDevLogger.ts`
- Produces:
  - `computeHistoricalHealthStats(sessions)` com ordenação `(reference_date ASC, created_at ASC)` e campos `{ shiftLabel, operatorName, createdAt, isDraft }` na série
  - `deleteCashReconciliationSession(tenantId, sessionId) -> Promise<{ deletedLocal: boolean; deletedRemote: boolean }>`
  - `getSavedCashWhatsappNumber(tenantId, rules) -> string`
  - `upsertCashWhatsappNumber(tenantId, rawPhone) -> Promise<{ phone: string; rule: CashRuleRow | null }>`
  - `getCompanyCashRoutine(tenantId, rules) -> CompanyCashRoutineProfile`
  - `saveCompanyCashRoutine(tenantId, profile) -> Promise<{ rule: CashRuleRow | null }>`
  - `sendCashSummaryViaFoodNext({ tenantId, recipientPhone, summaryText, storeName }) -> Promise<{ messageId?: string; sentTo: string }>`

- [ ] **Step 1: Escrever teste falhando em `cashReconciliationServiceHelper.test.mjs` para 2 fechamentos na mesma data**

Validar que duas sessões na mesma data (`2026-11-19`) com horários diferentes permanecem ordenadas cronologicamente com seus metadados (`operatorName`, `shiftLabel`, `isDraft`) e que `computeHistoricalHealthStats` recalcula corretamente quando uma é removida da lista.

- [ ] **Step 2: Rodar teste e confirmar falha**

Run: `node --test src/utils/cashReconciliationServiceHelper.test.mjs`
Expected: FAIL nos novos campos/ordenação por `created_at`.

- [ ] **Step 3: Atualizar `cashReconciliationServiceHelper.mjs` e adicionar funções de exclusão, rotina, telefone e envio `FoodNext` em `cashReconciliationService.ts`**

1. Atualizar `computeHistoricalHealthStats` ordenando por `reference_date` e `created_at` e expondo `{ id, referenceDate, status, healthScore, systemTotalCents, realTotalCents, diffCents, shiftLabel, operatorName, createdAt, isDraft }`.
2. Em `cashReconciliationService.ts`:
   - Implementar `deleteCashReconciliationSession(tenantId, sessionId)` (Supabase + cache local + limpeza condicional do rascunho ativo).
   - Implementar persistência de telefone WhatsApp e perfil de rotina em `cash_reconciliation_rules` + `localStorage` reaproveitando `upsertEngineSettingRule` genérico (sem duplicar a lógica de `upsertCashSavedFilePassword`).
   - Implementar `sendCashSummaryViaFoodNext`: consulta dinâmica da instância `FoodNext` (`id: 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6'`) em `whatsapp_instances` via `masterSupabase`, valida status conectada, normaliza número e dispara `sendNativeMessage`.

- [ ] **Step 4: Rodar testes**

Run: `node --test src/utils/cashReconciliationServiceHelper.test.mjs`
Expected: PASS.

---

### Task 5: Novos Componentes Visuais (Dashboard Executivo, Modais WhatsApp/Exclusão e Checklist Adaptativo)

**Files:**
- Create: `src/components/cash-reconciliation/CashDashboardOverview.tsx`
- Create: `src/components/cash-reconciliation/CashWhatsappSendModal.tsx`
- Create: `src/components/cash-reconciliation/CashDeleteConfirmModal.tsx`
- Modify: `src/components/cash-reconciliation/CashReportCompletenessBanner.tsx`
- Modify: `src/components/cash-reconciliation/CashHealthDashboard.tsx:35-176`

**Interfaces:**
- Consumes: `CashSessionRow`, `CompanyCashRoutineProfile`, `CashReportCompleteness`, `HistoricalStatsData`
- Produces:
  - `<CashDashboardOverview />` (cards KPI consolidados, bancos aprendidos, banner de rascunho em aberto, busca/filtros de fechamentos, cards individuais com hora/operador/saúde/diferença e botões `Abrir`, `WhatsApp`, `PDF`, `Excluir` + CTA `+ Nova Conferência`)
  - `<CashWhatsappSendModal />` (solicita nº na 1ª vez, salva por empresa, permite enviar e trocar nº salvo depois)
  - `<CashDeleteConfirmModal />` (confirmação com resumo do fechamento)
  - `<CashReportCompletenessBanner />` com chips dos bancos aprendidos e ação rápida de dispensar/reativar banco na rotina

- [ ] **Step 1: Atualizar `CashHealthHistoryCard` e `CashReportCompletenessBanner.tsx`**

- Em `CashHealthDashboard.tsx`, permitir ações opcionais (`onDeleteSession`) e distinção de hora/operador quando houver mais de um fechamento na mesma data.
- Em `CashReportCompletenessBanner.tsx`, exibir badge de rotina aprendida (`Itaú`, `C6`, etc.) e callback opcional `onToggleRoutineBank(bankKey, enabled)` / `onToggleRoutineReport(fileType, enabled)` para o operador dispensar/reativar sem fricção.

- [ ] **Step 2: Criar `CashWhatsappSendModal.tsx`, `CashDeleteConfirmModal.tsx` e `CashDashboardOverview.tsx` seguindo as diretrizes UI/UX**

Implementar os três componentes com responsividade mobile-first (`grid-cols-1` ➔ `md:grid-cols-2` ➔ `lg:grid-cols-4`), contraste claro/escuro WCAG, valores com `tabular-nums whitespace-nowrap`, estados vazios claros e feedback tátil `active:scale-95`.

- [ ] **Step 3: Validar TypeScript & ESLint dos novos componentes**

Run: `npx tsc --noEmit`
Expected: 0 erros.

---

### Task 6: Orquestração em `CashReconciliationPage.tsx` (`Dashboard` ↔ `Workspace`), Impressão PDF & Verificação Completa

**Files:**
- Modify: `src/pages/CashReconciliationPage.tsx`

**Interfaces:**
- Integra: `viewMode: 'dashboard' | 'workspace'` (inicia em `'dashboard'`; ao clicar em **Abrir**, **Continuar Rascunho** ou **+ Nova Conferência**, alterna para `'workspace'` e exibe botão `← Voltar ao Dashboard`), aprendizado automático de bancos/relatórios (`learnRoutineFromParsedFiles` no upload e salvamento + bootstrap do histórico), ações `handleDeleteSession`, `handleTriggerWhatsappSend` (envia direto via FoodNext se já houver nº salvo ou abre `CashWhatsappSendModal` na 1ª vez) e `handleExportPdf` (abre janela/iframe limpo com `buildCashPdfReportHtml` e aciona impressão A4).

- [ ] **Step 1: Conectar estados, handlers e aprendizado contínuo em `CashReconciliationPage.tsx`**

1. Iniciar `viewMode = 'dashboard'` ao entrar em `/conferencia-caixa` (mantendo eventual rascunho recuperável no banner `"Continuar Rascunho"` do Dashboard, para que a tela inicial nunca abra poluída com o workspace pesado).
2. Ao importar arquivos válidos ou salvar/fechar caixa, atualizar `routineProfile` via `learnRoutineFromParsedFiles` e persistir em segundo plano via `saveCompanyCashRoutine` (registrando evento discreto quando novo banco como `Banco Itaú` ou `Banco C6` for aprendido pela primeira vez).
3. Implementar `handleDeleteSession`, `handleExportPdf` (com carregamento lazy da sessão se disparado pelo card do Dashboard), `handleOpenWhatsappFlow` (envia em 1 clique com FoodNext se já existir nº salvo; abre modal só se não existir nº ou usuário pedir para trocar) e logs correspondentes em `cashDevLogger.ts`.

- [ ] **Step 2: Executar toda a suíte de verificação**

Run (PowerShell):
`node --test src/utils/*.test.mjs; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node scripts/check-tdz.cjs; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npx tsc --noEmit; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npx eslint src/pages/CashReconciliationPage.tsx src/services/cashReconciliationService.ts src/types/cashReconciliation.ts src/components/cash-reconciliation/CashDashboardOverview.tsx src/components/cash-reconciliation/CashWhatsappSendModal.tsx src/components/cash-reconciliation/CashDeleteConfirmModal.tsx src/components/cash-reconciliation/CashReportCompletenessBanner.tsx src/components/cash-reconciliation/CashHealthDashboard.tsx src/utils/cashCompanyRoutineHelper.mjs src/utils/cashReportExportHelper.mjs src/utils/cashReportCompleteness.mjs src/utils/cashFileParsers.mjs; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npm run build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git checkout -- public/version.json`
Expected: `fail 0`, `[TDZ Guardrail Passed]`, `0 errors` em TypeScript/ESLint, Vite + PWA build completo com sucesso.
