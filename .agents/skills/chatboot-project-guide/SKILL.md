---
name: chatboot-project-guide
description: Guia técnico e de regras para o projeto ChatBoot (Frontend React+Vite, Backend Node.js+Baileys, DB Supabase, Deploy Vercel/Coolify). Ative esta skill ao analisar ou modificar partes deste projeto.
---

# Guia do Projeto ChatBoot & Conhecimento Técnico

Este documento centraliza as principais descobertas técnicas e regras arquiteturais do projeto ChatBoot. Ele deve ser lido e aplicado como diretriz por qualquer agente de desenvolvimento trabalhando nesta base de código.

---

## 1. Visão Geral da Arquitetura

O ChatBoot é um SaaS de atendimento via WhatsApp integrado a soluções de Inteligência Artificial e automação de Delivery (Gastrofood).

```mermaid
graph TD
    Client[Frontend React + Zustand] -->|HTTPS / WSS| Server[Backend Node.js + Express]
    Client -->|Direct SDK| Supabase[(Supabase DB & Storage)]
    Server -->|Direct client pg / Realtime| Supabase
    Server -->|Socket Connection| Baileys[Baileys Core WhatsApp]
    Server -->|AI Reasoning / RAG| Gemini[Gemini API + Xenova Embeddings]
    Server -->|ERP Integrations| Gastrofood[Gastrofood API]
```

### Stack do Frontend (SaaS & Admin)
- **Framework**: React 18.3.1 + TypeScript + Vite.
- **Roteamento**: React Router DOM v7 (gerencia rotas `/chat`, `/contacts`, `/crm`, `/checklist/*`, `/admin/*`).
- **Gerenciamento de Estado**: Zustand (`src/store/chatStore.ts` de ~217KB que mantém o cache em memória de instâncias, chaves de API, mensagens e contatos).
- **Interface**: Tailwind CSS, Lucide React (ícones), Framer Motion (animações fluidas e premium).
- **Editor de Fluxos**: `@xyflow/react` para visualização e criação de robôs baseados em nós no FlowBuilder.

### Stack do Backend (WhatsApp Engine)
- **Runtime**: Node.js + Express rodando na porta `9000`.
- **Conectividade WhatsApp**: `@whiskeysockets/baileys` customizado e embutido via `baileys-core` local.
- **Inteligência Artificial**: `@google/generative-ai` (`gemini-2.5-flash`) para melhoria de texto, transcrição de áudio e arquitetura de prompts.
- **RAG & Embeddings Locais**: `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2` com dimensões de 384 vetores) executado diretamente no servidor para busca semântica em lote, sem dependência de serviços externos.
- **Banco de Dados**: PostgreSQL do Supabase via driver `pg` (com migrações automáticas de DDL no startup) e `@supabase/supabase-js`.

### 1.1. Arquitetura de Homologação (Staging Pipeline)

O ChatBoot adota um pipeline estrito de ambientes para evitar quebras em produção:

```mermaid
graph TD
    subgraph GitHub Repository
        MainBranch[Branch: main]
        StagingBranch[Branch: staging]
    end

    subgraph Produção [Ambiente de Produção Online]
        VercelProd[Vercel: chat-boot-theta.vercel.app]
        CoolifyProd[Coolify: Server Node Produção]
        SupaProd[(Supabase: Tenant Clientes Reais)]
    end

    subgraph Staging [Ambiente de Testes / Homologação]
        VercelStaging[Vercel: chat-boot-staging.vercel.app]
        CoolifyStaging[Coolify: Server Node Staging]
        SupaStaging[(Supabase: Tenant Empresa Teste)]
    end

    MainBranch -->|Auto Deploy / Push| VercelProd
    MainBranch -->|Auto Deploy / Push| CoolifyProd
    CoolifyProd --> SupaProd
    VercelProd --> CoolifyProd

    StagingBranch -->|Auto Deploy / Push| VercelStaging
    StagingBranch -->|Auto Deploy / Push| CoolifyStaging
    CoolifyStaging --> SupaStaging
    VercelStaging --> CoolifyStaging
```

#### Os 4 Pilares da Estratégia de Staging:
1. **Branch `staging` (Git Flow Simplificado)**: Código em desenvolvimento e testes.
2. **AppWeb Staging (Vercel Preview)**: Domínio `chat-boot-staging.vercel.app` vinculado à branch `staging` com `VITE_WHATSAPP_ENGINE_URL` apontado para o backend de staging.
3. **Backend Node Staging (Coolify Staging)**: Aplicação secundária no Coolify (`staging-worker`) conectada à branch `staging` com `IS_STAGING=true`.
4. **Isolamento de Banco (Supabase)**: Mesmo Supabase de produção isolado pelo Tenant "X-Point Testes & Dev" com instâncias de WhatsApp exclusivas de teste.

> ⚠️ **REGRA DE DEPLOY DE PRODUÇÃO**: Antes de realizar qualquer deploy para produção (`Deploy` ou `Deploy Server`), a IA deve obrigatoriamente recomendar e perguntar se o usuário deseja realizar um teste de homologação no ambiente de Staging (`chat-boot-staging.vercel.app`) primeiro.

---

## 2. Regras Críticas do Desenvolvedor

Essas regras são imutáveis e devem ser seguidas sem exceções para evitar quebras nos ambientes ativos:

> [!IMPORTANT]
> **PREVENÇÃO DE CONFLITOS NO BACKEND LOCAL**
> O backend local pode ser iniciado em ambiente de desenvolvimento, pois implementamos um mecanismo inteligente que detecta a flag `IS_LOCAL_DEV=true` ou `DISABLE_AUTO_START_SESSIONS=true` no arquivo `.env` da raiz e desativa automaticamente todos os serviços de background e triggers realtime concorrentes (como `SnoozeManager`, `QueueProcessor`, sincronização de cardápios, `WaCalls` e assinaturas realtime no Supabase). Isso impede conflitos de sessão 409 com o WhatsApp e execuções duplicadas de rotinas com o servidor de produção no Coolify.

- **Comunicação Exclusiva com Produção**: O arquivo `.env` do front-end em execução local deve sempre manter a variável `VITE_WHATSAPP_ENGINE_URL` apontada para a URL do motor em produção na nuvem (Coolify).
- **Alterações Visuais / Supabase**: Se a mudança envolver visual, comportamento de tela, estilo (CSS/Tailwind), ajustes em componentes React ou integrações diretas da aplicação com o Supabase (fora do diretório `/server`), o servidor Node.js **NÃO** deve ser atualizado, versionado ou reiniciado, evitando deploys extras desnecessários no Coolify.
- **Arquitetura Client-Side First (App + Supabase)**: Desenvolva novos recursos conectando a aplicação React diretamente com o Supabase (JS SDK, tabelas, políticas RLS), usando o servidor Node.js de backend o mínimo possível para manter a base de APIs e regras exclusivas (como Baileys, Gastrofood, RAG) do motor isoladas.
- **Deploy de Backend Antes de Testar**: Alterações feitas no código real do backend/servidor de produção devem ser deployadas antes de orientar o usuário a testar as funcionalidades.

### Fluxos de Deploy (Sugestão Proativa & Apenas Sob Demanda Explícita)

Ao concluir e verificar qualquer desenvolvimento ou correção localmente, a IA **PODE e DEVE SUGERIR** o deploy ao usuário. Porém, nenhum deploy ou `git push` deve ser executado automaticamente.

1. **Sugestão de Deploy**:
   - Ao finalizar a tarefa, a IA deve orientar: *"As alterações foram testadas localmente. Você pode escolher: `Deploy` (Vercel Frontend) ou `Deploy Server` (Backend Node com Homologação, Testes E2E Automáticos e Produção)."*

2. **Comando `Deploy`**:
   - **Alvo**: Frontend na **Vercel** (`chat-boot-theta.vercel.app`).
   - **Ação**: Incrementa o `patch` no `package.json` da raiz seguindo a regra de dígito único `X.Y.Z` (máximo `9`). Atualiza `VITE_PACKAGE_BUILD_DATE` no `.env` e roda `npm run deploy` (Vercel). Relata a nova versão no chat.

3. **Comando `Deploy Server` (Pipeline Único com Homologação Obrigatória & Testes E2E)**:
   - **Alvo**: Backend Node no **Coolify** (`ServerChatBaileys-Alpha` ➔ `ServerChatBaileys-Produção`).
   - **Etapa 1 - Homologação**: Incrementa a versão no `server/package.json` seguindo a regra de dígito único `X.Y.Z` (máximo `9`), atualiza as branches `develop` e `staging` (`git push origin main:develop`, `git push origin main:staging`) e dispara o deploy no Coolify Alpha (`ServerChatBaileys-Alpha` - UUID: `wh1ss8sy848ufj6zh8t492y7`), aguardando o build finalizar (`status: "finished"`).
   - **Etapa 2 - Validação E2E Automática (Quality Gate)**: Executa o script oficial `node .agents/skills/baileys-e2e-testing/scripts/run_baileys_e2e.cjs --env alpha`, validando os 3 ciclos bidirecionais entre FoodNext (`11 94775-8860`) e Ronaldo-Web (`11 97596-0999`) com conferência de `messageId` oficial da Baileys e gravação no banco (`status: "sent"`).
   - **Etapa 3 - Promoção para Produção (Somente com 100% de Sucesso)**: Se o teste for 100% aprovado, a IA envia o commit para a branch `main` (`git push origin main`), dispara o deploy de Produção no Coolify (`ServerChatBaileys-Produção` - UUID: `owckk0k8w8soo40w40owc4ss`), aguarda o build e relata a tabela de evidências.
   - **Etapa 4 - Bloqueio de Segurança em caso de Falha**: Se o teste E2E falhar em homologação, o deploy para produção é sumariamente cancelado e o relatório de erro é exibido.

4. **Regra de Cancelamento de Deploys Anteriores**:
   - Ao executar qualquer deploy no Coolify, a IA deve verificar se existem compilações anteriores em andamento (`in_progress`) ou na fila (`queued`) para a mesma aplicação e cancelá-las antes de iniciar o novo build.

5. **Se nenhum destes comandos for fornecido pelo usuário, nenhum git push ou deploy será efetuado.**

---

## 3. Funcionamento Interno dos Módulos Principais

### A. Persistência de Sessão e Chaves Baileys
- **Armazenamento**: As credenciais e chaves do WhatsApp são mantidas nas tabelas `wa_auth_credentials` (credencial principal da sessão) e `wa_auth_keys` (chaves criptográficas como pre-keys, chaves de estado de aplicativo).
- **Cache de RAM**: Para evitar o gargalo da rede do banco de dados (que costuma causar erros de timeout 408 e banimento de chips), o `useSupabaseAuthState` (`server/src/session-manager/auth.js`) carrega todas as chaves em memória (`Map` de cache) no boot da sessão.
- **Escrita em Fila**: As atualizações e exclusões de chaves são enfileiradas sequencialmente por instância (`enqueueWrite`) e salvas no Supabase em blocos (chunks) de até 500 registros para otimização de escrita concorrente.

### B. Proteção Contra Conflito de Chips (Dual-Chip Check)
- No evento `connection.update` aberto, o `SessionManager` (`server/src/session-manager/index.js`) extrai o número de telefone da sessão ativa e varre as outras sessões em memória.
- Se outro socket estiver aberto com o mesmo número de WhatsApp, a conexão anterior é forçadamente fechada e o status da outra instância é atualizado no banco de dados para `offline`, detalhando o motivo.

### C. Mecanismo de Filas do EventProcessor
- O `EventProcessor` (`server/src/event-processor/index.js`) utiliza um loop de processamento em lote a cada 2 segundos (`flushQueue`) para otimizar gravações de novas mensagens e atualizações de status.
- **Race Condition Mitigation**: Atualizações de leitura e recebimento de mensagens (`delivered`, `read`) são reconciliadas em lote com atraso controlado de 1.5 segundos para garantir que a mensagem já exista no banco de dados antes da atualização de status.

### D. Motor de Fluxos (FlowEngine)
- O `FlowEngine` (`server/src/flow-runtime/index.js`) executa robôs visuais de auto-atendimento.
- **Status do Estado**: Gerencia os estados de conversa via tabela `conversation_states` (`BOT_ACTIVE`, `FINISHED`, `HANDOFF_HUMAN`).
- **Pausa de Nós (Ask)**: Nós do tipo `ask` interrompem o loop de execução automática e esperam o input do usuário, salvando a resposta em uma variável configurável.
- **Handoff**: Transfere o controle da conversa para um atendente humano e desativa o bot.
- **Anti-Looping**: Um limite máximo de iterações (`MAX_NODES_PER_EXECUTION = 25`) é imposto por tick de mensagem para abortar e fechar estados corrompidos em loops infinitos de fluxo.

### E. Gastrofood & RAG Agent
- Localizado em `server/src/automation-worker/agent.js`, implementa o agente principal que integra com o Gastrofood ERP para realizar:
  - Sincronização de cardápios com cache em memória (TTL de 10 minutos).
  - Consulta de CEP, validação de telefone de cadastro e cálculo de frete.
  - Iniciação de pagamentos Pix via QR Code.
  - Finalização estruturada do pedido no Gastrofood.
- Processa buscas semânticas utilizando RAG sobre a tabela `knowledge_chunks` com suporte a funções PL/pgSQL específicas do Supabase (`match_knowledge_chunks`).

---

## 4. Estrutura do Banco de Dados (Supabase/PostgreSQL)

Os módulos operam sobre as seguintes tabelas críticas:
- `whatsapp_instances`: Registro e status dos conectores de chips do WhatsApp.
- `contacts` e `conversations`: Dados de clientes e status da thread de conversa (`status`, `ai_paused`).
- `messages`: Mensagens enviadas e recebidas com suporte a templates, CRM e metadados.
- `webhook_triggers`: Cadastro de webhooks que disparam ações externas em eventos como `ai_paused` e `ticket_resolved`.
- `wa_auth_credentials` e `wa_auth_keys`: Tokens de autenticação segura do WhatsApp Baileys.

---

## 5. Prevenção de Condições de Corrida e Regras de Pareamento (Código/QR)

Para evitar quebras de sincronismo e instâncias travadas em estado de conexão (`connecting`), siga as seguintes regras arquiteturais:

### A. Restrição de Eventos de Pareamento no Boot
O listener do evento `creds.update` em instâncias Baileys **nunca** deve atualizar o status do banco de dados para `"connecting"` ou emitir eventos de `pairingSuccess` se a sessão já estava previamente autenticada no momento do boot do contêiner/worker (`wasAuthenticatedOnBoot === true`). Isso impede que a re-inicialização automática ou oscilações de rede normais em sessões estáveis forcitem a interface de volta para `"connecting"`.

### B. Registro Síncrono de Sessão Ativa
Ao mudar o estado da conexão para `'open'`, a sessão correspondente deve ser inserida na lista de sessões autenticadas na memória (`this.authenticatedSessions.add(instanceId)`) de forma **síncrona e imediata** no início do listener de `connection.update`, antes de qualquer operação assíncrona (`await`). Isso elimina a janela de tempo (race condition) onde eventos simultâneos de `creds.update` leriam o estado em memória como falso e corromperiam o status no banco de dados.

### C. Atualização Ativa no Debounce do Store (Frontend)
O método `setInstanceStatus` no [chatStore.ts](file:///c:/Users/NOTE-(FORM)02JUL26/Documents/Projetos/Antigravity/ChatBoot/src/store/chatStore.ts) gerencia uma verificação assíncrona contra oscilações (`_offline_checks_${id}`). Caso essa rotina detecte que a instância retornou para o status `"connected"` ou `"connected_local"` no Supabase, ela deve **obrigatoriamente gravar o estado atualizado no store** imediatamente, em vez de apenas limpar o intervalo, garantindo o desaparecimento imediato dos banners de alerta ("Restabelecendo Conexão") no painel do usuário.

### D. Restrição de Chaves de Acesso (Passkeys) no WhatsApp
*   **Problema de Círculo Fechado (Catch-22)**: O WhatsApp implementa uma verificação de segurança ("Shortcake") que exige a assinatura de um desafio WebAuthn (`passkey_prologue_request`) quando a conta tem uma Chave de Acesso ativa. Headless clients (como o Baileys rodando em VPS) não possuem o assinante local (`signPasskeyAssertion`), fazendo com que a conexão expire.
*   **Restrição de Exclusão da Passkey**: Em contas com score de risco elevado ou sob políticas de segurança rígidas do WhatsApp, a remoção da Chave de Acesso no celular faz com que o aplicativo exiba a mensagem: `"Criar uma chave de acesso para entrar - Por questões de segurança, sua conta precisa de uma chave de acesso para conectar dispositivos."` impedindo a vinculação de qualquer dispositivo sem a criação de uma nova chave de acesso.
*   **Soluções Alternativas Conhecidas**:
    1.  **Migração para WhatsApp Business**: Contas do WhatsApp Business possuem políticas de segurança mais flexíveis quanto a pareamento e geralmente aceitam conexões sem exigir a criação forçada de Chave de Acesso.
    2.  **Período de Resfriamento (Cooling Period)**: Deixar a conta sem tentativas de pareamento por 48 a 72 horas para que o score de risco do WhatsApp expire, permitindo a conexão no fluxo clássico sem passkey.
    3.  **Reinstalação ou Troca de Aparelho**: Limpar os dados/cache do WhatsApp (ou reinstalar com backup prévio) para resetar o score de segurança local do dispositivo.

---

## 6. Tratamento de LIDs e Resolução do Erro 463 (Reachout Timelocked)

Para garantir o envio de mensagens para contatos com Login ID (LID) ativo sem disparar o erro `463` (NackCallerReachoutTimelocked) ou causar contatos duplicados e invisíveis no CRM, siga estritamente estas diretrizes:

### A. Domínio Correto de Envio (`@lid`)
O WhatsApp exige que envios para contatos cujos chips foram migrados para identificadores de login (LID) utilizem o domínio `@lid` (ex: `150547344662594@lid`). Tentar enviar para um LID utilizando o domínio clássico `@s.whatsapp.net` causará rejeição instantânea com o erro `463`.
* O resolvedor de filas (`queue-processor.js`) deve traduzir o JID telefônico do destinatário para o JID LID correspondente em memória RAM antes do envio.

### B. Aquisição de Token de Privacidade (`tctoken`) e Delay de Handshake
Quando o token de segurança (`tctoken`) não estiver presente no cache de chaves, o sistema deve forçar a troca de chaves na rede do WhatsApp:
1. Chame o método `sock.onWhatsApp(...)` passando **obrigatoriamente o JID de telefone clássico** (o método do Baileys não suporta LIDs diretos).
2. Introduza um **delay síncrono de pelo menos 2 segundos** (`setTimeout`/`Promise`) logo após a consulta para permitir que a biblioteca receba a resposta assíncrona do servidor, processe o aperto de mão criptográfico E2E no background e salve o `tctoken` na memória.

### C. Proteção do JID de Telefone no Banco de Dados
* **Nunca** atualize a coluna `whatsapp_jid` da tabela `contacts` no Supabase para `@lid`. O banco de dados deve preservar o JID clássico de telefone (`@s.whatsapp.net`).
* O frontend React descarta e oculta contatos cujo JID contém `@lid` devido a filtros visuais. Manter o JID clássico no banco de dados impede que o contato desapareça no painel e garante que o queue-processor continue resolvendo o JID localmente em tempo de execução de forma invisível para o usuário.

### D. Tradução Reversa de LID no EventProcessor
Para evitar que confirmações de entrega (ACKs) ou eventos de recebimento gerados por LIDs criem contatos duplicados no CRM:
* Intercepte o processamento no `handleMessageUpsert` do `event-processor/index.js`. Se o JID da mensagem recebida contiver `@lid`, consulte o mapeamento reverso `lid-mapping-[LID]_reverse` no cache de chaves da instância para traduzir o JID de volta para o telefone correspondente antes de qualquer salvamento ou atualização no banco.

---

## 7. Regra Estrita de Validação de Estado de Sessões e Protocolo de Pareamento (Prevenção de Trava de Conexão e Desconexão de Instâncias Ativas)

### A. O Problema Anatômico (A Armadilha do `pairingCode` Persistido)
1. **Onde ocorria a falha**:
   Ao solicitar um Código de Pareamento de 8 dígitos (ex: `SL54X6MD`), a biblioteca Baileys grava a propriedade `pairingCode` no objeto de credenciais em memória (`state.creds.pairingCode`).
2. **Ciclo de Persistência Supabase**:
   O `SessionManager` salva ciclicamente esse estado de credenciais na tabela `wa_auth_credentials` do Supabase via `saveCreds()`.
3. **A Armadilha do Reinício**:
   Mesmo após o usuário digitar o código no celular e o WhatsApp vincular o dispositivo, a propriedade `state.creds.pairingCode` permanecia gravada no JSON salvo no Supabase.
   Quando a instância reiniciava (ou ao reavaliar eventos `connection.update`), o código verificava:
   `isPairingPending = Boolean(state?.creds?.pairingCode)`
   Como a propriedade `pairingCode` ainda existia no JSON recarregado do banco, o sistema classificava a conexão como **"Pareamento Pendente" perpetuamente**, mesmo com a conexão no estado `open` e com o WhatsApp do celular já vinculado.
4. **Impacto em Cascata (Desconexão de Instâncias Ativas)**:
   Esse bloqueio falso forçava a sessão a ser mascarada como `connecting` para o Supabase, forçando os sockets a tentarem reconectar continuamente e derrubando sessões ativas com erro de colisão (código 409).

---

### B. Regra Definitiva de Resolução do Fluxo de Autenticação (`SessionManager`)
1. **Determinação Absoluta da Identidade de Usuário (`hasValidMeId`)**:
   Uma sessão já possui identidade WhatsApp válida se `sock.user?.id` ou `state.creds.me.id` contiver uma string de telefone válida (comprimento > 5 ou finalizada em `@s.whatsapp.net`).
2. **Regra Estrita de `isPairingPending`**:
   Uma sessão **NUNCA** pode ser tratada como "Pareamento Pendente" se ela já possui um `hasValidMeId` verdadeiro.
   ```javascript
   const meId = sock.user?.id || state?.creds?.me?.id || state?.creds?.me?.jid;
   const hasValidMeId = Boolean(meId && (String(meId).length > 5 || String(meId).includes('@s.whatsapp.net')));

   // Regra de Ouro: Só há pareamento pendente se AINDA NÃO EXISTIR um JID de usuário válido!
   const isPairingPending = !hasValidMeId && Boolean(state?.creds?.pairingCode);
   ```
3. **Limpeza Mandatória do Cache de Credenciais**:
   Assim que `hasValidMeId === true`, o `pairingCode` deve ser sumariamente excluído do objeto de credenciais em memória (`delete state.creds.pairingCode`) antes de salvar no Supabase, garantindo que o banco de dados seja limpo.
4. **NUNCA Exigir `registered === true` Estrito**:
   No Supabase, o campo `registered` em `wa_auth_credentials` frequentemente não é gravado explicitamente como booleano `true`. Exigir `registered === true` provoca falsos negativos. A presença de `hasValidMeId` é a autoridade máxima de autenticação.

---

### C. Check-list Rápido de Diagnóstico para Agentes Futuros (Se o Celular Mostrar Conectado mas o Sistema Ficar Preso em `Conectando`)
1. Inspecione `server/src/session-manager/index.js` nos ouvintes `creds.update` e `connection.update`.
2. Certifique-se de que `isPairingPending` dependa estritamente de `!hasValidMeId`.
3. Verifique se `isRealAuthConnection` avalia `update.connection === 'open' && hasValidMeId && !isPairingPending`.
4. Garanta que o incremento de versão no `server/package.json` respeite a regra de dígito único (`0` a `9` por campo) antes de enviar para o Coolify via `Deploy Server`.

---

## 8. As Duas Caixas de Testes Oficiais (FoodNext ↔ Ronaldo-Web)

### A. Conceito Fundamental de Caixa / Inbox
No ChatBoot, uma **Caixa de Atendimento** (ou Inbox) **não é apenas um receptor passivo de mensagens**. Cada caixa é uma conta viva de WhatsApp vinculada a um chip real com número próprio, capaz de:
- Enviar mensagens ativas para qualquer contato ou outra caixa da plataforma;
- Receber mensagens de entrada via conexão de socket real da Baileys;
- Gerar eventos no Supabase e acionar fluxos de IA ou agentes humanos.

### B. Mapeamento das Caixas de Teste Oficiais

Estas duas caixas são os pontos de teste estáticos para validação bidirecional do motor Baileys em produção:

```mermaid
graph LR
    SubFoodNext["Instância FoodNext<br/>(11) 94775-8860"] -->|Baileys sendMessage| Net[Rede WhatsApp Meta]
    Net -->|Socket Inbound| SubRonaldo["Instância Ronaldo-Web<br/>(11) 97596-0999"]
    SubRonaldo -->|Baileys sendMessage| Net
    Net -->|Socket Inbound| SubFoodNext
```

1. **Caixa FoodNext**:
   - **Nome**: `FoodNext`
   - **Telefone**: `(11) 94775-8860` (`5511947758860`)
   - **JID WhatsApp**: `5511947758860@s.whatsapp.net`
   - **Instance ID**: `cc4efe36-f391-4b3d-a24c-ddcd8a293cf6`
   - **Contact ID Mapeado**: `01f5b7d9-a846-4a9b-92ab-33a8d748b3d7`
   - **Conversation ID Mapeada**: `eb8b5ab9-4dd6-4ebd-8fb0-2c4e16f893fd`

2. **Caixa Ronaldo-Web**:
   - **Nome**: `Ronaldo-Web`
   - **Telefone**: `(11) 97596-0999` (`5511975960999`)
   - **JID WhatsApp**: `5511975960999@s.whatsapp.net`
   - **Instance ID**: `5c78d358-d449-41c4-b396-a04ab20a39e4`
   - **Contact ID Mapeado**: `9a003825-b2ca-4973-a52b-f55b912e9dbe`
   - **Conversation ID Mapeada**: `bc5c1fe7-a4de-4707-bbb1-176f52894c18`

> 💡 Para executar testes E2E completos e monitorar os retornos reais da Baileys entre essas duas caixas, utilize a skill `baileys-e2e-testing`.



