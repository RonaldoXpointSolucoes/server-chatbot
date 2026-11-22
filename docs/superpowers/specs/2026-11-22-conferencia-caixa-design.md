# Design Spec — Módulo Conferência Caixa (Conciliação Financeira & Dashboard de Saúde)

**Data:** 2026-11-22  
**Autor:** Antigravity (Arquitetura ChatBoot)  
**Status:** Aguardando revisão e aprovação do usuário para avançar ao plano de implementação (`writing-plans`)

---

## 1. Contexto, Problema e Objetivos

Na operação diária do restaurante (ex.: **Burguer Plus**), o fechamento e a conferência de caixa exigem cruzar manualmente vários relatórios exportados de sistemas diferentes:
1. **`PlanilhaRecebimento` (DataDivas — Vendas do Dia, `.xlsx`/`.xls`/`.csv`)**: traz os pedidos/recebimentos detalhados, porém com `Forma Pagto` e `Administradora` inconsistentes (ex.: `PIX`, `PIX C6 BANK` e `PAGO ONLINE PIX` cadastrados dentro de `Forma Pagto = CARTÃO`; bandeiras misturadas com nomes como `ANTONIO ALBERTO CREDITO` ou `/ CREDITO`; linhas em dinheiro com troco onde `Recebido > Valor`; linhas com `Recebido` vazio).
2. **`RelConferencia` (DataDivas — Planilha de Conferência, `.xlsx`/`.csv`)**: traz o bloco de dinheiro (`Fundo de Caixa Manha`, `Venda em Dinheiro`, `Fundo de Caixa Noite`, `Outras Entradas`, `Sangria Manha/Noite`, `Saidas Pagamentos`) e a tabela resumo `SISTEMA × REAL × DIF`.
3. **Fechamento do Movimento PDV (`.txt`)**: relatório de impressão de caixa fechada contendo totais por sub-meio, `SANGRIA CX. RET`, detalhamento nominal das `SAIDAS NO TOTAL` (vales e contas pagas), devedores nominais das `VENDAS PENDENTES`, `PRODUTOS CANCELADOS`, `CONSUMO INTERNO`, `DESCONTO.10%`, `TAXA ENTREGA`, `TAXA S. CASA`, `CUPONS FISCAIS` e `QUANTIDADE PESSOAS MESA`.
4. **Extratos Bancários (`OFX` — C6 Bank, Itaú e outros bancos)**: trazem os créditos PIX recebidos em conta corrente, liquidações de adquirentes de dias anteriores (ex.: `PAYGO ADMINISTR`), transferências corporativas não ligadas ao PDV (ex.: `LOCASERV`) e débitos/pagamentos.
5. **Relatórios Detalhados das Maquininhas (`Rede` e `C6 Pay`, `.xlsx`/`.csv`)**: listam vendas aprovadas, vendas em PIX na máquina, tentativas `Não autorizada`, taxas MDR/antecipação e valores líquidos.

Hoje, essa conciliação é feita manualmente item por item, consumindo muito tempo para detectar:
- Vendas lançadas no PDV que **não apareceram** nos bancos/maquininhas (**Faltas**);
- Valores recebidos nos bancos/maquininhas que **não constam** no PDV (**Sobras**);
- **Trocas de forma de pagamento** (ex.: venda lançada como `DINHEIRO` no PDV, mas recebida via `PIX` ou `CARTÃO` na maquininha no mesmo minuto);
- **Pagamentos divididos ou agrupados (`1:N` / `N:1`)** (ex.: 1 venda no PDV equivalente à soma de 2 transações na maquininha ou vice-versa);
- **Duplicidades naturais entre relatórios** (ex.: PIX na maquininha C6 Pay que também aparece no extrato OFX do C6 Bank).

### Objetivos Aprovados
1. **Novo Menu Dedicado**: Criar o item **Conferência Caixa** logo abaixo de **Respostas Prontas** na barra lateral (`MainSidebar.tsx`), abrindo a rota `/conferencia-caixa`.
2. **Upload Unificado Multi-Formato**: Permitir carregar todos os arquivos do fechamento de uma vez (`.xlsx`, `.xls`, `.csv`, `.ofx`, `.txt`), com detecção automática pelo conteúdo e suporte amigável caso algum `.xlsx` (como exportações da C6 Pay) venha protegido por senha.
3. **Abordagem Híbrida Escolhida (Opção A + IA Sob Demanda)**:
   - **Núcleo Determinístico ("Fórmula 1") no Frontend + Histórico no Supabase**: precisão exata ao centavo, execução instantânea, zero risco de alucinação aritmética e histórico multi-dias por empresa (`tenant_id`).
   - **Camada de IA Auditora & Evolutiva Sob Demanda**: acionada pelo usuário quando houver divergências não resolvidas ou erro de leitura em novos layouts, utilizando `geminiService.ts` para investigar hipóteses de vínculo, diagnosticar falhas e **sugerir melhorias permanentes nas regras da Fórmula 1** da empresa.
4. **Dashboard Moderno de Saúde do Caixa + Mesa de Conferência**: Exibir imediatamente se o caixa **Bateu**, teve **Falta** ou **Sobra**, com score de saúde (`0–100%`), tabela espelho da `RelConferencia` (`SISTEMA × REAL × DIF`), filas organizadas (*Sugestões de Equivalência em 1 clique*, *Faltam no Banco*, *Sobram no Banco*, *Auditoria de Pendentes/Cancelados/Taxas*) e evolução histórica ao longo dos dias/meses.

### Não-Objetivos (Escopo Delimitado)
- **Não alterar o servidor backend Node.js (`/server`)**: o módulo opera 100% no modelo *Client-Side First + Supabase* (incluindo chamadas de IA via `geminiService.ts`, que já usa o proxy seguro existente).
- **Não realizar conciliação automática via API bancária (Open Finance)**: a entrada de dados ocorre via upload dos arquivos gerados pelo usuário (`.xlsx`, `.xls`, `.csv`, `.ofx`, `.txt`).
- **Não alterar credenciais ou fluxos legados do WhatsApp/Baileys/CRM**.

---

## 2. Arquitetura de Módulos e Fluxo de Dados

```
[Upload Multi-Arquivo (.xlsx / .xls / .csv / .ofx / .txt)]
                          │
                          ▼
        [cashFileParsers.mjs + Proteção Senha OOXML]
   (Detecta tipo: PDV Vendas | RelConferencia | TXT | OFX | Rede | C6Pay)
                          │
                          ▼
      [cashReconciliationEngine.mjs — Motor "Fórmula 1"]
   ├─ Passe 1: Normalização PDV + Regras customizadas (cashFormulaRules.mjs)
   ├─ Passe 2: Deduplicação C6Pay PIX × OFX C6 + Filtro Não-PDV (PAYGO/LOCASERV)
   ├─ Passe 3: Conciliação Exata 1:1 (valor ±0,01 + categoria + terminal + horário)
   ├─ Passe 4: Detecção de Trocas de Modalidade & Combinações 1:N / N:1
   └─ Passe 5: Espelho RelConferencia (SISTEMA × REAL × DIF) & Health Score (0–100)
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
[Dashboard & Mesa Interativa]   [Sob Demanda: geminiService.ts]
 - Confirma/Rejeita Sugestões    - Investiga sobras/faltas/erros de parse
 - Digita Dinheiro/Sangria REAL  - Sugere novas regras da "Fórmula 1"
          │                               │
          └───────────────┬───────────────┘
                          ▼
         [cashReconciliationService.ts ──▶ Supabase (RLS por tenant_id)]
         (Sessões diárias, arquivos, itens, vínculos e regras aprendidas)
```

---

## 3. Especificação dos Parsers Multi-Formato (`src/utils/cashFileParsers.mjs`)

### 3.1. Tratamento Universal de Excel, CSV, OFX e TXT
- **Leitura de `.xlsx`/`.xls`**: utiliza `xlsx` (SheetJS já presente no `package.json`). Lê simultaneamente valores brutos (`raw: true`) para precisão numérica decimal e valores formatados (`raw: false`) / `XLSX.SSF.parse_date_code` para normalizar datas seriais do Excel (ex.: `46345` → `2026-11-19`) e frações de hora (ex.: `25569.93488` → `22:26:14`).
- **Arquivos Excel Protegidos por Senha (ex.: C6 Pay `EncryptedPackage`)**:
  - Ao detectar erro `File is password-protected` ou container CFB `EncryptionInfo`/`EncryptedPackage`, o leitor:
    1. Tenta automaticamente desbloqueio padrão sem interação caso utilize chave padrão conhecida (ex.: `VelvetSweatshop`);
    2. Caso exija senha real do usuário, marca o arquivo no card de upload com status `"Senha necessária"`, exibindo input inline seguro no card para o usuário informar a senha e descriptografar em memória via WebCrypto (OOXML Agile/Standard Encryption) — ou orientando abrir/re-salvar sem senha/CSV.
- **Parser Monetário Blindado (`parseMoneyValue`)**: suporta `R$ 1.234,56`, `R$ 185.35`, ` R$ -   `, `50,00*`, `-0.12` e números puros JS, convertendo tudo para inteiro em centavos (`Math.round(val * 100)`) durante as comparações para eliminar imprecisão de ponto flutuante (`0.1 + 0.2 !== 0.3`).

### 3.2. Assinaturas de Auto-Detecção por Tipo de Arquivo
1. **`pdv_vendas` (`PlanilhaRecebimento`)**:
   - Identifica cabeçalho contendo `Numero`, `Modulo`, `Origem`, `Valor`, `Forma Pagto`, `Administradora`.
   - Preserva todas as 13 colunas originais e marca `recebidoEmBranco = true` quando `Valor > 0` e `Recebido` estiver vazio/nulo, mantendo `Valor` como valor da venda.
2. **`rel_conferencia` (`RelConferencia`)**:
   - Identifica presença de `ENTRADA EM DINHEIRO`, `SAIDAS DINHEIRO` e cabeçalho `TIPO, DESCRICAO, SISTEMA, REAL, DIF`.
   - Extrai dinamicamente o bloco superior (`Fundo de Caixa Manha`, `Venda em Dinheiro`, `Fundo de Caixa Noite`, `Outras Entradas`, `Sangria Manha`, `Sangria Noite`, `Saidas Pagamentos`, `Outras Saidas`) e as linhas da tabela de conferência (`Saldo em Dinheiro`, `Credito, Debito e Voucher`, `iFood`, `Pendentes`, `Pix`, `Pago Online`, `Ticket`, `Sem Bandeira*`, `Outros`, `Total`).
3. **`fechamento_txt` (`Movimento Fechado PDV`)**:
   - Identifica linhas com `MOVIMENTO FECHADO`, `Mov.Caixa` e `ENTRADAS NO TOTAL`.
   - Extrai: loja/operador/início/fim, `VENDAS NO GERAL`, `OUTROS TOTAIS` (`CONSUMO INTERNO`, `TAXA ENTREGA DELIVERY`, `NOTA PENDENTE`, `DESCONTO.10%`, `TAXA S. CASA`, `QUANTIDADE PESSOAS MESA`), `PRODUTOS CANCELADOS` (lista + total), `VENDAS PENDENTES` (lista nominal devedores + soma), `CUPONS FISCAIS`, `FUNDO DE CAIXA`, `SAIDAS NO TOTAL` (discriminando `SANGRIA CX. RET` de vales/contas a pagar) e `SALDO DINHEIRO`.
4. **`extrato_ofx` (C6 Bank, Itaú e outros bancos `.ofx`)**:
   - Parser OFXSGML/XML tolerante a tags sem fechamento explícito (`<TAG>valor`).
   - Extrai banco (`<BANKID>` / `<ORG>`), conta (`<ACCTID>`), período (`<DTSTART>`..`<DTEND>`) e cada `<STMTTRN>` (`fitid`, `trnamt`, `dtposted`, `trntype`, `refnum`, `memo`).
   - Classifica cada lançamento do OFX em 4 subtipos:
     - **`pix_cliente`**: `CREDIT` com `<MEMO>` contendo `pix` (exceto transferências corporativas filtradas) **ou** `<REFNUM>` no formato UUID (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) quando `<MEMO>` trouxer apenas o nome do pagador (ex.: `DJALMAOLIVEIR`);
     - **`liquidacao_maquininha`**: `CREDIT` com `<MEMO>` contendo palavras-chave de liquidação configuráveis (`PAYGO`, `ANTECIP.`, `CART. DEBIT`, `REDE `, `CIELO`, `GETNET`, `STONE`, `C6PAY`) — não entra como venda do dia, fica visível na aba de Repasses/Liquidações;
     - **`credito_nao_pdv`**: `CREDIT` que bate com regras de transferência não-PDV da empresa (ex.: `LOCASERV MARKETING` ou valor acima do teto configurável marcado manualmente como repasse);
     - **`debito_saida`**: `TRNTYPE = DEBIT` ou `TRNAMT < 0` (registrado apenas para auditoria de saídas bancárias).
   - **Suporte a Extratos Bancários Itaú em `.csv`/`.xlsx` (Fallback)**: se o usuário subir um extrato do Itaú que não seja `.ofx`, o detector procura colunas de extrato (`data`, `lancamento`/`historico`/`descricao`, `valor`/`credito`/`debito`); caso não reconheça automaticamente o cabeçalho, oferece mapeamento de 3 colunas ou análise via botão IA.
5. **`adquirente_rede` (`Rede_Rel_Vendas`)**:
   - Localiza a linha de cabeçalho contendo `data da venda`, `hora da venda`, `status da venda`, `valor da venda atualizado`, `modalidade`.
   - Aceita registros com `status da venda` em `['aprovada', 'pago']` (cartão = `aprovada`; Pix = `pago`).
   - Usa `valor da venda atualizado` (fallback `valor da venda original`) como valor bruto; lê `valor total das taxas descontadas` e `valor líquido` (quando `-`, como no Pix, assume líquido = bruto).
6. **`adquirente_c6pay` (`Relatorio-Vendas-C6Pay_Detalhado`)**:
   - Localiza a linha de cabeçalho contendo `Data da venda`, `Hora da venda`, `Modalidade`, `Status da venda`, `Valor da venda bruta (R$)`.
   - Separa `Status da venda = Aprovada` (ativas para conciliação) de `Não autorizada` / canceladas (exibidas na aba de Auditoria).
   - Mantém tolerância de data de virada (`±1 dia` em relação ao período do arquivo, evitando descarte de vendas como o registro `2026-11-20 21:51:28` dentro do relatório de `19/11`).
   - Lê `ID PDC`, `Nº série maquininha`, `Taxas (R$)`, `Valor líquido da venda (R$)` e `NSU`.

---

## 4. Motor de Conciliação "Fórmula 1" (`src/utils/cashReconciliationEngine.mjs`)

Toda comparação de valores trabalha em **centavos inteiros (`cents`)**, evitando erros de arredondamento.

### 4.1. Passe 1 — Normalização do PDV (`PlanilhaRecebimento`)
Mapeamento padrão (estendido dinamicamente pelas regras da empresa em `cashFormulaRules.mjs`):
1. Se `Forma Pagto` contém `DINHEIRO` → categoria **`dinheiro`** (valor = `Valor`; troco = `max(0, Recebido - Valor)`).
2. Se `Forma Pagto` contém `PENDENTE` → categoria **`pendente`**.
3. Se `Forma Pagto` contém `CONSUMO INTERNO` ou `SEM BANDEIRA` → categoria **`outros`** (marcando `subtipo = 'consumo_interno'` ou `'sem_bandeira'`; não entra no total de vendas esperadas no banco).
4. Se `Administradora` contém `PIX` (mesmo quando `Forma Pagto = CARTÃO`, ex.: `PIX`, `PIX C6 BANK`, `PAGO ONLINE PIX`) → categoria **`pix`**.
5. Se `Administradora` contém `IFOOD` → categoria **`ifood`**.
6. Se `Administradora` contém `TICKET` / `ALELO` / `SODEXO` / `VR` / `VA` (quando configurado para linha separada) → categoria **`ticket`** ou **`cartao`** conforme configuração de `RelConferencia`.
7. Caso contrário, se `Forma Pagto` contém `CARTÃO` / `CARTAO` / `CREDITO` / `DEBITO` → categoria **`cartao`** (inferindo subtipo `credito` ou `debito` por palavras-chave na `Administradora`, tratando casos como `/ CREDITO`, `VISA ELECTRON`, `ANTONIO ALBERTO CREDITO`).
8. Regras da empresa têm precedência antes do fallback acima, permitindo corrigir/mapear novas administradoras sem mexer no código.

### 4.2. Passe 2 — Deduplicação entre Fontes Reais (Zero Contagem Dupla)
- **C6 Pay PIX × OFX C6 Bank**:
  - Para cada transação `pix` aprovada na `C6 Pay`, procura um lançamento `pix_cliente` no `OFX` com mesma quantia em centavos (`diff <= 1` centavo) e diferença de horário dentro da janela de liquidação imediata (padrão `±15 minutos`).
  - Quando encontra par: marca a entrada `C6 Pay` como **`deduplicated_with_ofx`** (vinculada ao ID do OFX), mantendo apenas **uma** contagem no total real de `Pix` e exibindo na UI a etiqueta *"PIX C6 Pay confirmado no extrato C6"*.
  - PIX da `C6 Pay` ocorridos após o `DTEND` do OFX (ou fora dele) permanecem ativos na soma real de `Pix` com badge *"PIX C6 Pay (pós-corte OFX)"*.

### 4.3. Passe 3 — Conciliação Exata (`1:1`)
Compara as vendas digitais ativas do PDV (`pix` e `cartao`, com `cents > 0`) contra o conjunto consolidado e deduplicado das entradas reais (`Rede`, `C6 Pay`, `OFX pix_cliente`):
- **Score de Afinidade para desempate** (menor é melhor):
  1. Diferença de valor (`0` ou `1` centavo);
  2. Mesma categoria normalizada (`pix === pix` ou `cartao === cartao`);
  3. Afinidade de terminal/origem (`Nome Maquina` contém `REDE` → prioriza `Rede`; `TOTEM` / `SERVIDOR` → prioriza `C6 Pay` / `OFX`);
  4. Diferença absoluta de horário em segundos (janela padrão `±3 horas` no mesmo dia/turno).
- Os pares encontrados recebem status **`matched_exact`** (Bateu 100%).

### 4.4. Passe 4 — Sugestões Inteligentes de Equivalência (`Trocas` e `1:N / N:1`)
Executa sobre os itens que permaneceram sem par após o Passe 3:
1. **Troca de Forma de Pagamento (`swapped_method`)**:
   - Confronta entradas reais ainda livres contra **todas** as vendas PDV ainda livres (inclusive `dinheiro` e `pendente`!).
   - Se houver igualdade de valor (`±1 centavo`) dentro de janela configurada (padrão `±2 horas`), cria sugestão detalhada: ex. *"PDV lançou R$ 102,00 como DINHEIRO (Mesa 010 às 13:48:53), mas entrou R$ 102,00 via PIX na Rede às 13:47:43 (1m10s de diferença)"*.
2. **Agrupamento / Pagamento Dividido (`split_1_to_n` e `grouped_n_to_1`)**:
   - **1 PDV = Soma de 2 a 4 entradas reais (`1:N`)**: para cada venda PDV ainda sem par, busca subconjuntos de 2 a 4 entradas reais livres (preferencialmente na mesma maquininha/conta e em janela de tempo próxima, ex. `±3 horas`, com cap de segurança de busca combinatória para manter execução `< 20ms`) cuja soma em centavos feche exatamente o valor da venda.
   - **Soma de 2 a 4 vendas PDV = 1 entrada real (`N:1`)**: realiza o inverso (útil quando cliente ou entregador faz 1 Pix consolidado para 2 pedidos).
- Cada sugestão fica com status **`suggested`** até o usuário clicar em **Confirmar Vínculo** (`matched_manual`) ou **Rejeitar** (`rejected`).
- Ao confirmar uma sugestão de troca (ex.: `DINHEIRO → PIX/CARTÃO`), o sistema recalcula automaticamente tanto o total real de `Pix/Cartão` quanto o ajuste explicativo da gaveta de `Dinheiro`, mostrando quanto da aparente "falta no dinheiro" era na verdade venda paga no digital!

### 4.5. Passe 5 — Espelho `RelConferencia` e Health Score (`0–100%`)
- **Fonte `SISTEMA`**: usa os valores da `RelConferencia` importada quando presente; caso o usuário não importe a `RelConferencia`, calcula automaticamente a partir da `PlanilhaRecebimento` + `.txt` de Fechamento (exibindo badge *"Calculado do PDV"*).
- **Fonte `REAL`**:
  - `Pix` = soma das entradas reais deduplicadas de Pix (`OFX pix_cliente` + `Rede Pix` + `C6 Pay Pix` pós-corte OFX + vínculos manuais confirmados);
  - `Crédito, Débito e Voucher` = soma das entradas reais aprovadas de cartão (`Rede Cartão` + `C6 Pay Cartão` + vínculos manuais confirmados);
  - `Saldo em Dinheiro` = preenchido pelo operador no campo editável **"Dinheiro Contado na Gaveta"** (somado à `Sangria` informada no `.txt` ou ajustada na tela para comparar contra `Saldo em Dinheiro` da `RelConferencia` ou `SALDO DINHEIRO` do `.txt`);
  - `iFood`, `Pago Online`, `Ticket`, `Pendentes`, `Outros` = pré-preenchidos quando aplicável ou editáveis na tela pelo conferente.
- **Health Score (`0–100`)**:
  - Combina: (a) proporção do valor `SISTEMA` conciliado sem divergência, (b) penalidade proporcional a faltas/sobras líquidas não resolvidas em relação ao faturamento do dia e (c) pendências de sugestões não revisadas.
  - Classificação do fechamento:
    - **`balanced` (Bateu)**: diferença total absoluta ≤ tolerância (padrão R$ 1,00 ou configurável) e zero itens críticos pendentes;
    - **`attention` (Em Conferência / Atenção)**: sugestões pendentes de revisão ou divergência pequena/explicada por troca aguardando confirmação;
    - **`shortage` (Falta)**: diferença líquida negativa (`REAL < SISTEMA`);
    - **`surplus` (Sobra)**: diferença líquida positiva (`REAL > SISTEMA`).

---

## 5. Camada de IA Auditora & Melhoria Contínua da Fórmula 1 (`src/services/geminiService.ts`)

Acionada **exclusivamente sob demanda** pelo botão **"Investigar com IA & Melhorar Fórmula 1"**:
- **Payload compacto e estruturado**: envia apenas os itens que **faltam no banco**, itens que **sobram no banco**, transferências marcadas para revisão, eventuais erros de leitura de arquivo e o resumo das regras atuais da Fórmula 1 (nunca envia arquivos inteiros com milhares de linhas já conciliadas).
- **Retorno JSON estruturado** validado no cliente:
  1. `hypotheses[]`: hipóteses de conciliação que escaparam das regras determinísticas (ex.: diferença compatível com taxa MDR descontada na fonte, soma de itens em janelas mais distantes, correspondência entre nome do pagador OFX e pedido Delivery);
  2. `fileParseDiagnoses[]`: se algum arquivo novo (ex.: extrato Itaú em formato incomum) deu falha ou coluna ambígua, explica o mapeamento necessário;
  3. `formulaSuggestions[]`: sugestões estruturadas de novas regras para a **Fórmula 1**, tipadas como:
     - `normalize_admin_rule` (ex.: mapear `Administradora` contendo `"VR ALIM"` para `ticket` ou `cartao`);
     - `ignore_ofx_keyword` (ex.: ignorar `"LOCASERV"` como repasse não-PDV);
     - `time_window_adjustment` / `tolerance_adjustment` (ex.: ajustar tolerância de centavos ou janela de horário).
- O usuário revisa cada sugestão e clica em **"Aplicar na Fórmula 1 da Empresa"**, salvando em `cash_reconciliation_rules` no Supabase e re-executando a conciliação imediatamente na tela.

---

## 6. Modelo de Dados Supabase (`DB_SETUP_CASH_RECONCILIATION.sql`)

Todas as tabelas utilizam `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` (mesmo padrão multi-tenant de `DB_SETUP_CHECKLISTS.sql` e compatível com `companies.id` / `useChatStore.tenantInfo.id`), com `created_at` e `updated_at` UTC e índices por `(tenant_id, reference_date)`.

1. **`cash_reconciliation_sessions`**:
   - `id` (UUID PK), `tenant_id` (UUID FK), `reference_date` (DATE), `shift_label` (TEXT default `'Diário'`), `store_name` (TEXT), `operator_name` (TEXT);
   - `status` (`'draft' | 'balanced' | 'attention' | 'shortage' | 'surplus'`), `health_score` (NUMERIC(5,2));
   - `system_total_cents` (BIGINT), `real_total_cents` (BIGINT), `diff_cents` (BIGINT);
   - `cash_drawer_counted_cents` (BIGINT NULL), `cash_sangria_cents` (BIGINT DEFAULT 0), `cash_notes` (TEXT);
   - `reconciled_summary` (JSONB — espelho `SISTEMA × REAL × DIF` por categoria + breakdown de taxas MDR, cancelamentos, consumo interno, descontos, pessoas/ticket médio e pendentes nominais);
   - `ai_last_analysis` (JSONB NULL), `created_by_email` (TEXT), `closed_at` (TIMESTAMPTZ NULL), `created_at`, `updated_at`.
   - Constraint única opcional / índice composto `(tenant_id, reference_date, shift_label)` permitindo reabrir ou salvar múltiplas revisões com clareza.
2. **`cash_reconciliation_files`**:
   - `id` (UUID PK), `session_id` (UUID FK CASCADE), `tenant_id` (UUID FK), `file_name` (TEXT), `file_type` (`'pdv_vendas' | 'rel_conferencia' | 'fechamento_txt' | 'extrato_ofx' | 'adquirente_rede' | 'adquirente_c6pay' | 'extrato_generico'`), `file_size_bytes` (INT), `period_start` (TEXT), `period_end` (TEXT), `row_count` (INT), `parse_status` (`'ok' | 'warning' | 'error'`), `parse_warnings` (JSONB), `raw_summary` (JSONB), `created_at`.
3. **`cash_reconciliation_items`**:
   - `id` (UUID PK), `session_id` (UUID FK CASCADE), `tenant_id` (UUID FK), `file_id` (UUID FK NULL);
   - `side` (`'system' | 'real' | 'audit'`), `source` (`'pdv' | 'ofx' | 'rede' | 'c6pay' | 'manual'`), `category` (`'pix' | 'cartao' | 'dinheiro' | 'pendente' | 'ifood' | 'ticket' | 'outros' | 'nao_pdv'`), `sub_category` (TEXT);
   - `occurred_at` (TEXT), `amount_cents` (BIGINT), `net_amount_cents` (BIGINT NULL), `fee_cents` (BIGINT DEFAULT 0);
   - `reference_code` (TEXT — mesa/pedido/NSU/REFNUM), `description` (TEXT), `terminal_name` (TEXT), `operator_name` (TEXT);
   - `match_status` (`'matched_exact' | 'matched_manual' | 'suggested' | 'deduplicated_ofx' | 'unmatched_missing_in_bank' | 'unmatched_extra_in_bank' | 'ignored_non_pdv' | 'not_authorized' | 'audit_only'`);
   - `match_group_id` (UUID NULL), `match_reason` (TEXT NULL), `metadata` (JSONB DEFAULT `'{}'`).
4. **`cash_reconciliation_rules`**:
   - `id` (UUID PK), `tenant_id` (UUID FK), `rule_type` (`'normalize_admin' | 'ignore_ofx_memo' | 'terminal_affinity' | 'engine_setting'`), `pattern` (TEXT), `target_value` (TEXT), `source_origin` (`'default' | 'user' | 'ai_suggested'`), `is_active` (BOOLEAN DEFAULT true), `notes` (TEXT), `created_at`, `updated_at`.

### Segurança & Multi-Tenant (RLS)
- Todas as 4 tabelas terão `ENABLE ROW LEVEL SECURITY` com políticas baseadas em `tenant_id` (compatíveis com `get_auth_tenant_id()` / `tenant_users` + fallback seguro de leitura/escrita apenas para o `tenant_id` ativo verificado via `tenant_users` / `companies`, seguindo o padrão já existente no projeto).

---

## 7. Experiência do Usuário, Layout e Telas

### 7.1. Navegação (`MainSidebar.tsx` & `App.tsx`)
- Inserir item **Conferência Caixa** (ícone `Scale` ou `Wallet` do `lucide-react`) imediatamente abaixo de **Respostas Prontas** em `MainSidebar.tsx`.
- Registrar rota `<Route path="/conferencia-caixa" element={<ErrorBoundary><CashReconciliationDashboard /></ErrorBoundary>} />` em `App.tsx`.

### 7.2. Estrutura da Tela `/conferencia-caixa` (Mobile-First, Tema Claro/Escuro)
Seguindo a paleta e glassmorphism do ChatBoot (`bg-[#f0f2f5] dark:bg-[#111b21]`, cards translúcidos, contraste WCAG AAA, zero scrollbar horizontal):
1. **Header & Controle de Sessões**:
   - Título + seletor de data/conferência salva (dropdown/lista lateral de dias já fechados) + botão **"Nova Conferência"** + botão **"Salvar / Fechar Conferência"** + acesso rápido às **Regras da Fórmula 1**.
2. **Área de Upload Inteligente (Colapsável após importação)**:
   - Zona *drag-and-drop* aceitando múltiplos arquivos simultaneamente (`.xlsx`, `.xls`, `.csv`, `.ofx`, `.txt`);
   - Pílulas de status para cada arquivo enviado mostrando tipo detectado, período, quantidade de registros e eventuais prompts de senha para `.xlsx` protegido.
3. **Painel de Saúde do Caixa (Dashboard Executivo)**:
   - **Card Hero de Saúde**: Gauge/barra `0–100%` + Status (`BATEU`, `ATENÇÃO`, `FALTA -R$`, `SOBRA +R$`) + Resumo em linguagem natural (*"Total Sistema R$ X vs Real Confirmado R$ Y — 3 trocas de forma de pagamento detectadas"*);
   - **4 Cards por Canal**: **Pix**, **Cartão (Crédito/Débito/Voucher)**, **Dinheiro em Gaveta** (com composição `Fundo + Vendas − Saídas − Sangria`) e **Pendentes & Outros**;
   - **Faixa de Saúde Financeira & Risco**: Taxas MDR + Antecipação descontadas, Valor Líquido Real, Produtos Cancelados, Consumo Interno, Descontos e Ticket Médio por Pessoa;
   - **Painel Histórico de Saúde**: Gráfico comparativo dos últimos fechamentos salvos no Supabase (`Sistema × Real × Diferença` e `Score %` ao longo do mês).
4. **Mesa de Trabalho em 6 Abas**:
   - **Aba 1 — Espelho `RelConferencia` (`SISTEMA × REAL × DIF`)**: tabela interativa completa com entrada manual do Dinheiro Contado na Gaveta, Sangria e observações;
   - **Aba 2 — Sugestões de Equivalência (`Match Assistido`)**: cards lado a lado (`PDV` ↔ `Banco/Maquininha`) explicando troca de forma de pagamento ou soma `1:N`/`N:1`, com botões **Confirmar** / **Rejeitar**;
   - **Aba 3 — Faltam no Banco / Maquininha**: vendas PDV sem par + botão **Vincular Manualmente** a alguma sobra ou marcar como justificada;
   - **Aba 4 — Sobram no Banco / Maquininha**: entradas reais sem par + separação visual para repasses de dias anteriores (`PAYGO`, etc.) e transferências não-PDV (`LOCASERV`);
   - **Aba 5 — Auditoria Completa**: devedores nominais de `Vendas Pendentes`, `Produtos Cancelados`, `Saídas Pagamentos` (vales/baixas), `Consumo Interno` e transações `Não autorizadas`;
   - **Aba 6 — Auditor IA & Fórmula 1**: botão **"Investigar Divergências com IA"**, exibição de hipóteses, diagnóstico de leitura e aplicação em 1 clique de novas regras na Fórmula 1.

---

## 8. Estratégia de Testes e Critérios de Aceitação

1. **Testes Unitários Automatizados (`src/utils/cashFileParsers.test.mjs`, `src/utils/cashReconciliationEngine.test.mjs`)**:
   - Executáveis via `node --test`;
   - Validam cada parser (`.ofx` com caso `DJALMAOLIVEIR`, `.txt`, `PlanilhaRecebimento`, `RelConferencia`, `Rede` com status `aprovada`/`pago`, `C6 Pay` com `Não autorizada` e data `D+1`);
   - Validam os totais exatos de `19/11/2026`: `Pix = R$ 1.325,64`, `Cartão = R$ 3.115,10`, `Dinheiro Venda = R$ 345,10`, `Saldo Dinheiro RelConferencia = R$ 888,07`, `Saldo Dinheiro Pós-Sangria TXT = R$ 257,27`, `Pendentes = R$ 409,00`, `Consumo Interno = R$ 355,00`;
   - Validam deduplicação C6 Pay PIX × OFX C6 sem contagem dupla;
   - Validam detecção das 3 trocas de pagamento (`R$ 102,00`, `R$ 8,00`, `R$ 147,40`), detecção de split `1:N` (`R$ 50,00 = R$ 25,00 + R$ 25,00`), identificação das faltas e das sobras.
2. **Validação de Compilação & Lint**:
   - `npm run build` (inclui `scripts/check-tdz.cjs && vite build`) passando sem erros;
   - Verificação de responsividade e contraste nos modos Claro e Escuro.
3. **Não-Regressão**:
   - Nenhuma alteração em `/server`, rotas de chat existentes ou fluxos do WhatsApp.
