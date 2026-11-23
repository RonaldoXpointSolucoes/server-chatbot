# Spec Arquitetural — Dashboard Executivo, Exclusão de Caixas, Envio WhatsApp (FoodNext), PDF e Memória Adaptativa de Bancos & Relatórios

**Data:** 2026-11-22  
**Módulo:** Conferência Caixa (`/conferencia-caixa`)  
**Abordagem Escolhida:** Abordagem A — Hub Dual (`Dashboard Executivo` ↔ `Workspace de Auditoria`) em `/conferencia-caixa`, persistindo histórico de sessões, configurações de WhatsApp e perfil de rotina financeira por empresa (`tenantId`) em `cash_reconciliation_sessions` e `cash_reconciliation_rules` + cache `localStorage`.

---

## 1. Objetivo e Escopo

Entregar quatro evoluções integradas no módulo de Conferência de Caixa:

1. **Exclusão de Fechamentos Salvos:** Permitir apagar fechamentos duplicados ou incorretos (incluindo múltiplos caixas do mesmo dia, como dois registros em `19/11`), com modal de confirmação explícita, remoção no Supabase + cache local + limpeza de rascunho ativo e atualização imediata das métricas históricas.
2. **Compartilhamento por WhatsApp (API FoodNext) & Relatório Executivo em PDF:**
   - **WhatsApp:** Enviar resumo estruturado do fechamento pela API da instância oficial **`FoodNext`** (`cc4efe36-f391-4b3d-a24c-ddcd8a293cf6`) para o celular da empresa. No **primeiro clique** (quando ainda não houver número salvo para a empresa ativa), exibir modal solicitando o número com DDD; ao confirmar e enviar, **salvar permanentemente** o número na empresa (`cash_reconciliation_rules` + `localStorage`) e nunca mais perguntar nos envios seguintes (com opção discreta para editar o número caso mude).
   - **PDF:** Gerar relatório executivo A4 limpo e formatado para impressão/PDF (sem menus laterais nem fundos escuros), utilizável tanto de dentro de um caixa aberto quanto diretamente pelos cards do Dashboard.
3. **Nova Tela de Dashboard Executivo (`/conferencia-caixa`):**
   - Ao abrir `/conferencia-caixa`, apresentar inicialmente uma tela gerencial limpa e focada nos fechamentos existentes e indicadores consolidados, reduzindo a sobrecarga visual do workspace detalhado.
   - A partir do Dashboard, o usuário pode **abrir** qualquer fechamento existente, **enviar WhatsApp**, **gerar PDF**, **excluir** ou iniciar **+ Nova Conferência** (entrando no workspace completo com botão `← Voltar ao Dashboard`).
4. **Memória Adaptativa por Empresa para Bancos (`Itaú` + `C6` + outros) e Relatórios Diários:**
   - Detectar automaticamente a identidade do banco em extratos OFX (`<ORG>`, `<BANKID>`, `<ACCTID>`) e planilhas bancárias (ex.: **Banco C6 `336`** e **Banco Itaú `341`**), tratando cada banco da empresa como uma fonte distinta em vez de um único slot genérico de OFX.
   - Aprender progressivamente a rotina financeira real da empresa (bancos utilizados + maquininhas + relatórios DataDivas recorrentes) conforme fechamentos são importados/salvos, alertando automaticamente sempre que algum banco habitual (ex.: veio só o OFX do `C6` e faltou o do `Itaú`) ou relatório recorrente estiver ausente na conciliação do dia.

---

## 2. Arquitetura e Interfaces por Camada

### 2.1. Camada de Identificação Bancária e Parse ([cashFileParsers.mjs](file:///c:/Users/NOTE-(FORM)02JUL26/Documents/Projetos/Antigravity/ChatBoot/src/utils/cashFileParsers.mjs))

- Adicionar extrator puro `identifyBankInstitution({ bankName, bankId, acctId, fileName, headerText })` com mapeamento normalizado de bancos brasileiros:
  - `336` / `C6` ➔ `{ bankKey: 'banco_336', bankCode: '336', bankLabel: 'Banco C6' }`
  - `341` / `ITAU` / `ITAÚ` ➔ `{ bankKey: 'banco_341', bankCode: '341', bankLabel: 'Banco Itaú' }`
  - Demais códigos (`001` Banco do Brasil, `033` Santander, `237` Bradesco, `077` Inter, `260` Nubank, `756` Sicoob, `748` Sicredi, `104` Caixa) ou fallback normalizado `banco_<codigo_ou_slug>`.
- Anexar `bankKey`, `bankCode`, `bankLabel` e `acctLast4` em `summary` e em cada linha de `parseOfxText` e `parseGenericBankMatrix`, bem como em `item.metadata` no motor [cashReconciliationEngine.mjs](file:///c:/Users/NOTE-(FORM)02JUL26/Documents/Projetos/Antigravity/ChatBoot/src/utils/cashReconciliationEngine.mjs) para exibição clara da origem bancária (`C6` vs `Itaú`) no detalhamento de PIX.

### 2.2. Motor de Aprendizado Contínuo e Completude ([cashCompanyRoutineHelper.mjs](file:///c:/Users/NOTE-(FORM)02JUL26/Documents/Projetos/Antigravity/ChatBoot/src/utils/cashCompanyRoutineHelper.mjs) + [cashReportCompleteness.mjs](file:///c:/Users/NOTE-(FORM)02JUL26/Documents/Projetos/Antigravity/ChatBoot/src/utils/cashReportCompleteness.mjs))

- **Estrutura `CompanyCashRoutineProfile`:**
  ```js
  {
    version: 1,
    updatedAt: string,
    banks: {
      [bankKey]: {
        bankKey: string,      // ex: 'banco_336', 'banco_341'
        bankCode: string,     // ex: '336', '341'
        bankLabel: string,    // ex: 'Banco C6', 'Banco Itaú'
        acctLast4?: string,
        seenCount: number,
        lastSeenDate: string, // YYYY-MM-DD
        enabled: boolean      // true = esperado diariamente; false = dispensado pelo usuário
      }
    },
    reports: {
      [fileType]: {
        fileType: string,     // ex: 'pdv_vendas', 'adquirente_rede', 'adquirente_c6pay', ...
        seenCount: number,
        lastSeenDate: string,
        enabled: boolean
      }
    }
  }
  ```
- **Regras de Aprendizado Automático:**
  - `learnRoutineFromParsedFiles(profile, parsedFiles, referenceDate)`:
    - Sempre que arquivos válidos (`status === 'ok'`) são importados ou salvos/fechados, atualiza `seenCount` e `lastSeenDate` de cada banco identificado (`extrato_ofx` / `extrato_generico`) e de cada tipo de relatório.
    - Novos bancos detectados (ex.: `Banco Itaú` e `Banco C6`) passam imediatamente a `enabled: true` no perfil da empresa.
    - Função auxiliar `bootstrapRoutineFromSessionHistory(profile, sessions)` alimenta inicialmente o perfil a partir de snapshots de sessões históricas já salvas (ou metadados `file_name`/`file_type`), garantindo memória imediata para empresas com histórico existente.
  - `toggleRoutineBankExpected(profile, bankKey, enabled)` e `toggleRoutineReportExpected(profile, fileType, enabled)`: permitem ao usuário marcar um banco como "Sem movimento hoje / Dispensar" ou reativar facilmente.
  - Persistência: armazenado em `cash_reconciliation_rules` com `rule_type: 'engine_setting'`, `pattern: 'company_routine:profile'` e `target_value: JSON.stringify(profile)`, espelhado em `localStorage` (`cash_recon_routine_<tenantId>`).
- **Validação Dinâmica (`assessCashReportCompleteness(parsedFiles, companyProfile)`):**
  - Preserva 100% de compatibilidade quando `companyProfile` for `null` (mantendo o checklist padrão `7 DataDivas + 3 Bancos/Maquininhas`).
  - Quando `companyProfile` possuir bancos aprendidos (`enabled: true`), expande a lista de Bancos & Maquininhas no resultado (`bank.items`) com um card/item individual por banco aprendido (ex.: **`Extrato Banco C6 (OFX)`** e **`Extrato Banco Itaú (OFX)`**), mantendo também `Rede` e `C6 Pay`.
  - Emite alertas específicos no array `warnings` e no banner:
    - Ex.: `"Falta o extrato do Banco Itaú (OFX) — banco aprendido na rotina diária desta empresa."`
    - Contabiliza separadamente relatórios aprendidos da rotina diária habitual vs opcionais do catálogo 7+3.

### 2.3. Exclusão de Sessões e Persistência Multi-Tenant ([cashReconciliationService.ts](file:///c:/Users/NOTE-(FORM)02JUL26/Documents/Projetos/Antigravity/ChatBoot/src/services/cashReconciliationService.ts) & [cashReconciliationServiceHelper.mjs](file:///c:/Users/NOTE-(FORM)02JUL26/Documents/Projetos/Antigravity/ChatBoot/src/utils/cashReconciliationServiceHelper.mjs))

- Adicionar `SESSION_LIST_COLUMNS` incluindo contagem/resumo compacto se necessário ou mantendo leveza (`id, tenant_id, reference_date, shift_label, store_name, operator_name, status, health_score, system_total_cents, real_total_cents, diff_cents, cash_drawer_counted_cents, cash_sangria_cents, cash_notes, created_by_email, closed_at, created_at, updated_at`), diferenciando visualmente múltiplos caixas da mesma data pelo horário de criação (`created_at`), operador (`operator_name`) e status (`Rascunho` vs `Fechado`).
- Adicionar `deleteCashReconciliationSession(tenantId, sessionId)`:
  - Se `sessionId` iniciar com `'local_'`: remove apenas de `localSessionsKey(tenantId)`.
  - Caso remoto: executa `delete().eq('id', sessionId).eq('tenant_id', tenantId).select('id')` via `runWithTenantClient` (respeitando `masterSupabase` fallback multiempresa) e remove também de qualquer cache local e rascunho ativo (`clearActiveCashDraftFromStorage` se `draft.activeSessionId === sessionId`).
- Em `computeHistoricalHealthStats(sessions)`: garantir ordenação estável por `(reference_date ASC, created_at ASC)` para múltiplas sessões no mesmo dia, anexando `shiftLabel`, `operatorName`, `createdAt` e `isDraft` em cada ponto da série para exibição precisa no gráfico histórico.
- Funções de serviço para WhatsApp da empresa e rotina:
  - `getSavedCashWhatsappNumber(tenantId, rules)`: lê de `cash_reconciliation_rules` (`pattern: 'whatsapp_notify:phone'`) + `localStorage`.
  - `upsertCashWhatsappNumber(tenantId, phone)`: normaliza dígitos e salva na tabela de regras + `localStorage`.
  - `getCompanyCashRoutine(tenantId, rules)` e `saveCompanyCashRoutine(tenantId, profile)`: lê/persiste o perfil aprendido em `cash_reconciliation_rules` (`pattern: 'company_routine:profile'`) + `localStorage`.
  - `sendCashSummaryViaFoodNext({ recipientPhone, summaryText, tenantId, storeName })`:
    - Consulta a instância `FoodNext` (`id = 'cc4efe36-f391-4b3d-a24c-ddcd8a293cf6'`, fallback por `display_name ilike '%FoodNext%'`) em `whatsapp_instances` via `runWithTenantClient(..., { expectRow: true })` (usando `masterSupabase` para leitura segura cross-tenant quando o usuário está operando outra empresa).
    - Valida se `status` está conectada (`connected` / `connected_local`) e possui `api_key`.
    - Normaliza o destinatário (`55` + DDD + número + `@s.whatsapp.net`) e envia usando `sendNativeMessage(foodNext.tenant_id, foodNext.id, jid, summaryText, foodNext.api_key)`.
    - Registra sucesso e eventuais falhas em [cashDevLogger.ts](file:///c:/Users/NOTE-(FORM)02JUL26/Documents/Projetos/Antigravity/ChatBoot/src/utils/cashDevLogger.ts).

### 2.4. Formatadores Puros de Resumo WhatsApp e Relatório PDF ([cashReportExportHelper.mjs](file:///c:/Users/NOTE-(FORM)02JUL26/Documents/Projetos/Antigravity/ChatBoot/src/utils/cashReportExportHelper.mjs))

- `normalizeBrazilWhatsappNumber(raw)`: limpa caracteres, valida 10–13 dígitos (adicionando DDI `55` se necessário), gera erro amigável se inválido e formata `(XX) XXXXX-XXXX` para UI.
- `buildCashWhatsappSummaryMessage({ result, session, storeName, manualInputs })`: monta mensagem executiva enxuta para WhatsApp com emojis e alinhamento limpo contendo:
  - Empresa, data (`DD/MM/YYYY`), operador/turno e veredito (`CAIXA BATEU` / `FALTA` / `SOBRA` / `ATENÇÃO`) + Saúde (`%`);
  - Bloco Totais: Sistema PDV × Real Apurado × Diferença;
  - Bloco Canais: PIX (destacando bancos recebidos quando disponíveis, ex.: C6 / Itaú), Cartões (Rede / C6 Pay), Dinheiro em Gaveta (Fundo, Venda, Sangria, Esperado, Contado), Pendentes & Consumo Interno, Descontos e Cancelamentos;
  - Alerta de pendências abertas / relatórios faltantes e observações do operador.
- `buildCashExecutivePdfHtml({ result, session, storeName, manualInputs })`: gera HTML auto-contido com CSS `@media print` otimizado para A4 (`margin: 12mm`), claro, limpo, com tabelas tipográficas (`tabular-nums`), quadros de Espelho Financeiro, resumo por banco/maquininha, resumo de auditoria (cancelamentos/descontos/taxas/top itens) e notas pendentes, abrindo janela isolada/iframe de impressão sem interferir no layout do CRM ChatBoot.

### 2.5. Interface e Experiência do Usuário (`Dashboard` ↔ `Workspace` + Modais)

- **`CashDashboardOverview.tsx`** (Novo componente dedicado à tela inicial do módulo):
  - **KPIs Globais (4 Cards Responsivos `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`):**
    1. Saúde Média & Taxa de Batimento
    2. Saldo Líquido de Diferenças (Faltas Acumuladas vs Sobras)
    3. Total Conciliado no Histórico
    4. Rotina Financeira Aprendida (`Itaú + C6 + Maquininhas + Relatórios Diários`, clicável para visualizar/gerenciar bancos aprendidos)
  - **Banner de Rascunho Ativo:** Quando houver arquivo carregado em rascunho não salvo/fechado, oferece `"Continuar Rascunho"` ou `"Descartar"`.
  - **Evolução Histórica Visual:** Gráfico em barras interativo destacando data (`DD/MM`), horário/turno quando houver mais de um caixa no mesmo dia, e status por cor.
  - **Lista / Grade de Fechamentos Existentes:** Busca por data/operador/status, filtro (`Todos` / `Fechados` / `Rascunhos` / `Com Diferença`). Cada card mostra claramente data, **horário/turno (para distinguir dois caixas no mesmo dia)**, operador, status, saúde %, Sistema × Real × Diferença e barra de ações:
    - **Abrir** (carrega a sessão e alterna para a visão de Auditoria Detalhada)
    - **WhatsApp** (envia resumo via FoodNext com 1 clique após número salvo)
    - **PDF** (gera relatório A4 imprimível)
    - **Excluir** (abre modal de confirmação)
- **Workspace de Auditoria em [CashReconciliationPage.tsx](file:///c:/Users/NOTE-(FORM)02JUL26/Documents/Projetos/Antigravity/ChatBoot/src/pages/CashReconciliationPage.tsx):**
  - Barra superior passa a incluir botão **`← Dashboard`** (retorna ao Dashboard Executivo sem descartar os arquivos abertos na sessão atual), além de **Salvar**, **Fechar Caixa**, **WhatsApp**, **PDF** e **Excluir** (quando editando uma sessão salva).
  - **Modais de Apoio:**
    - **`CashWhatsappSendModal.tsx`:** Pergunta o número de WhatsApp da empresa na primeira vez (com opção "Salvar número desta empresa para não perguntar mais"), permite pré-visualizar a mensagem antes do envio quando aberto manualmente, e tem ação rápida `"Alterar nº salvo"`.
    - **`CashDeleteConfirmModal.tsx`:** Confirmação visual segura com resumo do fechamento (`Data`, `Operador/Turno`, `Saúde %`, `Diferença`) antes da exclusão definitiva.
  - **`CashReportCompletenessBanner.tsx`:** Evoluído para exibir os bancos individuais aprendidos (`Extrato Banco C6 (OFX)`, `Extrato Banco Itaú (OFX)` etc.) e botão opcional em cada banco para dispensar/remover da rotina esperada caso não tenha havido movimento.

---

## 3. Fluxos de Dados e Segurança

- **Isolamento Multi-Tenant:** Toda leitura/gravação de sessões, número WhatsApp e rotina aprendida é estritamente vinculada a `tenantId`. Trocar de empresa no sistema reseta o estado em memória e carrega apenas os dados da empresa selecionada.
- **Segurança da API FoodNext:** A chave `api_key` da instância `FoodNext` não é hardcoded em código estático; é obtida dinamicamente do registro da instância em runtime e trafegada apenas na chamada autenticada do motor WhatsApp, sem registro de tokens em logs.
- **Privacidade no DevLogger:** Mensagens de envio WhatsApp e exclusões são registradas no Antigravity DevLogger ([cashDevLogger.ts](file:///c:/Users/NOTE-(FORM)02JUL26/Documents/Projetos/Antigravity/ChatBoot/src/utils/cashDevLogger.ts)) mascarando/ocultando credenciais e senhas.

---

## 4. Plano de Testes (Unitários e Verificação de UI)

1. `cashReportCompleteness.test.mjs`:
   - Identificação de bancos (`336 C6`, `341 Itaú`) em OFX e planilhas genéricas.
   - Aprendizado contínuo (`learnRoutineFromParsedFiles`): empresa que usou C6 + Itaú passa a esperar ambos; enviar só C6 dispara alerta explícito de que faltou `Banco Itaú`.
   - Toggle de banco/relatório dispensado e restauração a partir do histórico.
2. `cashReportExportHelper.test.mjs`:
   - Normalização/validação de telefones WhatsApp brasileiros (`10..13` dígitos, erro em inválidos).
   - Geração da mensagem executiva WhatsApp (inclusive distinguindo múltiplos bancos e sessão fechada vs rascunho).
   - Geração de HTML A4 limpo para PDF (escaping HTML XSS-safe em nomes de operadores/clientes).
3. `cashReconciliationServiceHelper.test.mjs` / exclusão & ordenação:
   - Múltiplas sessões na mesma data (`19/11` manhã/noite ou duplicadas) ordenadas e identificadas corretamente no histórico após exclusão.
4. Build & Tooling: `node --test src/utils/*.test.mjs`, `npx tsc --noEmit`, `node scripts/check-tdz.cjs`, `npx eslint`, `npm run build`.
