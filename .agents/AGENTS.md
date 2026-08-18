# Customizações e Regras do Agente

## Arquitetura de Homologação (Staging) e Regras de Prevenção de Falhas em Produção

O projeto segue um pipeline estrito de homologação para impedir travamentos ou quebras em produção:

1. **Estrutura de Ambientes e Branches**:
   - **Produção (`main`)**:
     - **AppWeb (Vercel)**: `https://chat-boot-theta.vercel.app`
     - **Backend Node (Coolify)**: Aplicação de produção (`production-worker`).
     - **Banco (Supabase)**: `https://yzbxsxabzncdzuxvlppt.supabase.co` (Clientes Reais).
   - **Homologação / Staging (`staging`)**:
     - **AppWeb (Vercel Preview)**: `https://chat-boot-staging.vercel.app` (branch `staging`).
     - **Backend Node (Coolify Staging)**: Aplicação secundária (`staging-worker` na branch `staging`).
     - **Banco (Supabase)**: Mesmo Supabase de produção isolado via Tenant "X-Point Testes & Dev" ou Supabase Staging secundário.

2. **RECOMENDAÇÃO OBRIGATÓRIA DE TESTES EM STAGING ANTES DO DEPLOY DE PRODUÇÃO**:
   - Sempre que o usuário solicitar o deploy em produção (`Deploy` ou `Deploy Server`), a IA **DEVE OBRIGATORIAMENTE RECOMENDAR E PERGUNTAR** se o usuário gostaria de publicar e testar primeiro no ambiente de Staging (`branch: staging` / `chat-boot-staging.vercel.app`), garantindo uma bateria de testes prévia para evitar travamentos ou regressões em produção.

## Regra Obrigatoria de Analise Causal para Falhas Recorrentes (>2 Vezes)

Sempre que o usuário solicitar a correção de um problema persistente ou que já tenha sido abordado mais de 2 vezes sem solução definitiva:
1. **Acionamento da Skill**: A IA deve invocar e seguir o protocolo da skill `root-cause-analysis-expert`.
2. **Uso da Trilha de Migalhas (DevLogger)**: Deve-se obrigatoriamente inspecionar e registrar a trilha de migalhas `[MIGALHA X/Y]` do Antigravity DevLogger e do Supabase `system_logs` do Passo 1 ao Passo 7 antes de realizar edições de código.
3. **Mapeamento de Cadeia E2E**: Mapear UI -> State -> HTTP Gateway -> Baileys Socket -> Supabase DB para isolar o ponto exato da quebra.

## Regras de Deploy e Versionamento (Sem Deploy Automático e Sem Push Automático)

O deploy NUNCA deve ser executado de forma automática após alterações de código sem a solicitação explícita do usuário. O usuário dispõe de dois comandos oficiais de deploy: `Deploy` (Frontend) e `Deploy Server` (Backend com Pipeline Integrado de Homologação e Testes E2E).

1. **Sugestão Proativa de Deploy**:
   - Após concluir e verificar qualquer alteração de código ou correção de bug, a IA **PODE e DEVE SUGERIR** o deploy ao usuário (`Deploy` para Frontend ou `Deploy Server` para Backend).
   - A IA **NÃO DEVE** realizar deploy nem executar `git push` automaticamente sem a solicitação explícita do usuário através de um dos dois comandos.

2. **Se o usuário digitar `Deploy`**:
   - **Alvo**: Frontend na **Vercel** (`chat-boot-theta.vercel.app`).
   - Incrementa a versão no `package.json` da raiz seguindo a regra de dígito único `X.Y.Z` (0 a 9 em cada componente, ex: de `4.9.4` para `4.9.5`). O valor máximo de cada componente é `9`.
   - Atualiza a variável `VITE_PACKAGE_BUILD_DATE` no `.env` para a data/hora atual.
   - Executa o commit/push do frontend e a publicação na Vercel (`npm run deploy`).
   - Relata a versão gerada e o status da publicação no chat.

3. **Se o usuário digitar `Deploy Server` (Pipeline Único com Homologação Obrigatória & Testes E2E)**:
   - **Alvo**: Backend Node no **Coolify** (`ServerChatBaileys-Alpha` ➔ `ServerChatBaileys-Produção`).
   - **Etapa 1 - Homologação**:
     - Incrementa a versão no `server/package.json` seguindo a regra de dígito único `X.Y.Z`.
     - Atualiza as branches `develop` e `staging` (`git push origin main:develop`, `git push origin main:staging`).
     - Aciona o deploy da aplicação de Homologação no Coolify (`ServerChatBaileys-Alpha` - UUID: `wh1ss8sy848ufj6zh8t492y7`).
     - Acompanha o build no Coolify até a conclusão (`status: "finished"`).
   - **Etapa 2 - Validação E2E Automática (Quality Gate)**:
     - Executa o script oficial da skill `baileys-e2e-testing`:
       `node .agents/skills/baileys-e2e-testing/scripts/run_baileys_e2e.cjs --env alpha`
     - Valida os 3 ciclos bidirecionais de envio e recebimento entre as caixas **FoodNext** (`11 94775-8860`) e **Ronaldo-Web** (`11 97596-0999`).
     - Exige confirmação de `messageId` oficial da Baileys e gravação no banco (`status: "sent"`) para todas as 6 mensagens.
   - **Etapa 3 - Promoção para Produção (Somente com 100% de Sucesso)**:
     - Se todos os testes passarem com sucesso (TRUE), avança automaticamente para a produção:
     - Executa o commit e push para a branch `main` (`git push origin main`), disparando o build no Coolify Produção (`ServerChatBaileys-Produção` - UUID: `owckk0k8w8soo40w40owc4ss`).
     - Acompanha o deploy da produção até `finished`.
     - Apresenta a tabela de evidências do teste E2E e confirma a versão ativa em Produção.
   - **Etapa 4 - Bloqueio de Segurança em caso de Falha**:
     - Se o teste E2E em Homologação reprovar ou apresentar qualquer erro de socket/envio, o deploy de Produção é **SUMARIAMENTE BLOQUEADO**, protegendo o ambiente real contra quebras e exibindo o diagnóstico das falhas ocorridas.

4. **Caso o usuário NÃO digite um destes comandos, o agente NÃO deve realizar git push nem deploy de nenhum tipo.**

## Regras de Execução e Testes do Servidor (Evitando Conflitos Concorrentes)

1. **DETECÇÃO E EVITAÇÃO DE CONFLITOS EM DEV (isLocalDev)**:
   - Se o servidor de backend for iniciado localmente, ele detectará a presença de `IS_LOCAL_DEV=true` ou `DISABLE_AUTO_START_SESSIONS=true` no arquivo `.env` do projeto.
   - Ao identificar esse estado, o servidor local **suspenderá automaticamente** todos os serviços de background concorrentes (como `SnoozeManager`, `QueueProcessor`, sincronização de cardápios, `WaCalls` e ouvintes de alterações realtime no Supabase).
   - Isso impede problemas de concorrência com o Supabase e conflitos de sessão do WhatsApp (código 409), mantendo o servidor local inofensivo.
2. **COMUNICAÇÃO EXCLUSIVA COM PRODUÇÃO**: A aplicação front-end local (`npm run dev` na raiz) ou de produção online deve se comunicar apenas com o backend Node.js em produção no Coolify. O `.env` do front-end deve manter `VITE_WHATSAPP_ENGINE_URL` apontado para o endereço de produção online.
3. **DEPLOY DE BACKEND ANTES DE TESTAR**: Quando houver necessidade de testar qualquer alteração feita no código do servidor de backend, a IA deve primeiro sugerir ou realizar o deploy das alterações do servidor na produção em nuvem (via push no GitHub/Coolify sob solicitação do usuário) para que a alteração reflita no ambiente real, e somente depois orientar o usuário a testar.

## Regras de Atualização do Servidor (Node.js) vs. Frontend

1. **ALTERAÇÃO ESTREITAMENTE VISUAL / FRONTEND / SUPABASE**: Se a mudança envolver visual, comportamento de tela, estilo (CSS/Tailwind), ajustes em componentes React ou integrações diretas da aplicação com o Supabase (fora do diretório `/server`), o servidor Node.js **NÃO** deve ser atualizado, versionado ou reiniciado. Todos os desenvolvimentos que não envolvam diretamente lógica do backend Node.js (que está no Coolify) **não devem** de forma alguma atualizar o servidor Node, versioná-lo no `/server/package.json`, ou disparar deploy do backend no Coolify. Evite modificar arquivos dentro do diretório `/server` para que o Coolify não ative builds redundantes do motor.
2. **ARQUITETURA CLIENT-SIDE FIRST (APP + SUPABASE)**: Para novos recursos, fluxos de dados, CRM/Kanban, checklists ou tarefas, a lógica de negócio e as comunicações devem ser mantidas diretamente entre a aplicação cliente (React+Vite) e o banco de dados Supabase (utilizando o Supabase JS SDK, consultas diretas, tabelas e políticas RLS). O uso do servidor backend Node.js (Coolify) deve ser mantido no **mínimo absoluto possível**, reservando-o estritamente para APIs específicas, processamento offline ou regras exclusivas (como Baileys, RAG pesado ou integrações ERP).
3. **QUANDO ATUALIZAR O SERVIDOR NODE**: O backend só deve ser alterado e sofrer deploy se houver mudanças reais de lógica no diretório `/server/`, tais como:
   * Modificações no `SessionManager`, `EventProcessor`, `FlowEngine` ou biblioteca `baileys-core`.
   * Criação de triggers Postgres complexos que dependam de chamadas HTTP específicas do Node ou scripts de inicialização do servidor.
   * Mudanças nas APIs de roteamento Express ou integrações que exijam segurança de chaves em backend (ex: webhook do Gastrofood).
   * Atualizações de dependências no arquivo `/server/package.json`.
4. **INDICAÇÃO DE DEPLOY**: Ao efetuar commits puramente visuais ou de integrações diretas do Supabase, faça o commit com mensagens que deixem claro que a mudança é exclusiva do frontend (ex: `feat(ui): ...` ou `fix(ui): ...`) e apenas sugira ao usuário realizar o deploy quando apropriado.

## Regras de Execução de Comandos Assíncronos e Deploys

1. **PROIBIDO CANCELAR OU INTERROMPER PROCESSOS DE DEPLOY EM MEIO À EXECUÇÃO**: Nunca force o cancelamento, interrupção ou concorrência de comandos de deploy ativos (ex: `npm run deploy` que invoca `vercel --prod`) ou chamadas sensíveis de infraestrutura. Interromper prematuramente processos de upload da CLI da Vercel ou Coolify bloqueia o estado do deploy remoto, resultando em builds parciais, arquivos de assets corrompidos ou perda de variáveis de ambiente ativas.
2. **AGUARDAR SEMPRE A CONCLUSÃO TOTAL**: Todo e qualquer comando de deploy iniciado deve ter seu ciclo completo acompanhado através dos logs até que o resultado final de sucesso ou falha real seja devolvido.

## Regra do Comando de Testes "teste envios"

Sempre que o usuário digitar `teste envios` (ou variações como `teste envios.`, `Teste envios`, `teste de envios` ou `/teste-envios`):
1. **Acionamento Automático**: A IA deve imediatamente invocar a skill `baileys-e2e-testing`.
2. **Execução do Script**: Executar via `run_command` o script oficial de testes E2E:
   `node .agents/skills/baileys-e2e-testing/scripts/run_baileys_e2e.cjs`
3. **Acompanhamento e Relatório**: Acompanhar a execução dos 3 ciclos bidirecionais de envio e recebimento de mensagens entre as caixas **FoodNext** (`11 94775-8860`) e **Ronaldo-Web** (`11 97596-0999`) e apresentar a tabela de evidências e o resultado final ao usuário.

## Regra do Comando da Esteira de Desenvolvimento "Fila dev"

Sempre que o usuário digitar `Fila dev` (ou variações como `fila dev`, `Fila Dev`, `/fila-dev`, `fila dev.` ou `Desenvolver Fila`):
1. **Acionamento Automático**: A IA deve invocar a skill `fila-dev` e executar `node .agents/skills/fila-dev/scripts/get_dev_queue.cjs list` para inspecionar os cards do quadro **Desenvolvimento & Roadmap** (`95be1dee-9d28-47d9-8ccf-d51a337f1572`).
2. **Governança da Coluna "Em Análise" (`analysis`)**:
   - **PROIBIDO INICIAR DESENVOLVIMENTO**: A IA **NÃO PODE** alterar código nem iniciar tarefas que estejam nesta coluna.
   - **VISUALIZAÇÃO COMPLETA**: Exibir a listagem clara dos cards em análise, informando ao usuário que aguardam autorização prévia.
3. **Autonomia da Coluna "Em Desenvolvimento" (`development`)**:
   - **EXECUÇÃO AUTÔNOMA TOTAL**: Se houver itens nesta coluna, a IA deve ler os requisitos técnicos do card (`notes`), codificar as soluções no projeto, validar compilação/testes e migrar o card no banco para a coluna **"Em Testes & QA"** (`node .agents/skills/fila-dev/scripts/get_dev_queue.cjs move <CARD_ID> testing`).
   - Apresentar o relatório da entrega e confirmação da migração do card.





## Credenciais para Testes de Automação no Chrome

Sempre que o agente precisar realizar login de forma automatizada e testar as funcionalidades e fluxos no Chrome, deve utilizar as seguintes credenciais:
* **E-mail/Login**: `ronaldo.xpointsolucoes@gmail.com`
* **Senha**: `Cc@xroxmaxi7`
