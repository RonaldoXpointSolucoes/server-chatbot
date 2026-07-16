# Customizações e Regras do Agente

## Regras de Deploy e Versionamento (Sem Deploy Automático)

O deploy NUNCA deve ser executado de forma automática após alterações de código. O agente só poderá iniciar um deploy se o usuário explicitamente der um dos comandos abaixo no chat:

1. **Se o usuário digitar `Deploy`**:
   - Realiza o deploy do frontend na Vercel e atualiza a versão no `package.json` (apenas no frontend).
   - O incremento da versão deve seguir a regra de dígito único `X.Y.Z` (0 a 9 em cada componente, ex: de `4.9.4` para `4.9.5`). O valor máximo de cada componente é `9`.
   - Atualiza a variável `VITE_PACKAGE_BUILD_DATE` no `.env` para a data/hora atual.
   - Executa o comando de deploy do frontend (ex: `npm run deploy` que invoca a CLI do Vercel).
   - Relata a versão gerada e o status da publicação no chat.

2. **Se o usuário digitar `Deploy Server`**:
   - Realiza o deploy do servidor de backend Node.js.
   - Incrementa a versão no arquivo `server/package.json` seguindo a regra de dígito único `X.Y.Z`.
   - Executa o commit e o push das alterações do servidor Node para o repositório GitHub, que por sua vez dispara o deploy automático no Coolify em nuvem.
   - Relata o status do deploy no chat.

3. **Caso o usuário NÃO digite estes comandos, o agente NÃO deve realizar deploy de nenhum tipo (nem Vercel, nem Coolify).**

## Regras de Execução e Testes do Servidor (Evitando Conflitos Concorrentes)

1. **DETECÇÃO E EVITAÇÃO DE CONFLITOS EM DEV (isLocalDev)**:
   - Se o servidor de backend for iniciado localmente, ele detectará a presença de `IS_LOCAL_DEV=true` ou `DISABLE_AUTO_START_SESSIONS=true` no arquivo `.env` do projeto.
   - Ao identificar esse estado, o servidor local **suspenderá automaticamente** todos os serviços de background concorrentes (como `SnoozeManager`, `QueueProcessor`, sincronização de cardápios, `WaCalls` e ouvintes de alterações realtime no Supabase).
   - Isso impede problemas de concorrência com o Supabase e conflitos de sessão do WhatsApp (código 409), mantendo o servidor local inofensivo.
2. **COMUNICAÇÃO EXCLUSIVA COM PRODUÇÃO**: A aplicação front-end local (`npm run dev` na raiz) ou de produção online deve se comunicar apenas com o backend Node.js em produção no Coolify. O `.env` do front-end deve manter `VITE_WHATSAPP_ENGINE_URL` apontado para o endereço de produção online.
3. **DEPLOY DE BACKEND ANTES DE TESTAR**: Quando houver necessidade de testar qualquer alteração feita no código do servidor de backend, a IA deve primeiro realizar o deploy das alterações do servidor na produção em nuvem (via push no GitHub/Coolify) para que a alteração reflita no ambiente real, e somente depois orientar o usuário a testar.

## Regras de Atualização do Servidor (Node.js) vs. Frontend

1. **ALTERAÇÃO ESTREITAMENTE VISUAL / FRONTEND / SUPABASE**: Se a mudança envolver visual, comportamento de tela, estilo (CSS/Tailwind), ajustes em componentes React ou integrações diretas da aplicação com o Supabase (fora do diretório `/server`), o servidor Node.js **NÃO** deve ser atualizado, versionado ou reiniciado. Todos os desenvolvimentos que não envolvam diretamente lógica do backend Node.js (que está no Coolify) **não devem** de forma alguma atualizar o servidor Node, versioná-lo no `/server/package.json`, ou disparar deploy do backend no Coolify. Evite modificar arquivos dentro do diretório `/server` para que o Coolify não ative builds redundantes do motor.
2. **ARQUITETURA CLIENT-SIDE FIRST (APP + SUPABASE)**: Para novos recursos, fluxos de dados, CRM/Kanban, checklists ou tarefas, a lógica de negócio e as comunicações devem ser mantidas diretamente entre a aplicação cliente (React+Vite) e o banco de dados Supabase (utilizando o Supabase JS SDK, consultas diretas, tabelas e políticas RLS). O uso do servidor backend Node.js (Coolify) deve ser mantido no **mínimo absoluto possível**, reservando-o estritamente para APIs específicas, processamento offline ou regras exclusivas (como Baileys, RAG pesado ou integrações ERP).
3. **QUANDO ATUALIZAR O SERVIDOR NODE**: O backend só deve ser alterado e sofrer deploy se houver mudanças reais de lógica no diretório `/server/`, tais como:
   * Modificações no `SessionManager`, `EventProcessor`, `FlowEngine` ou biblioteca `baileys-core`.
   * Criação de triggers Postgres complexos que dependam de chamadas HTTP específicas do Node ou scripts de inicialização do servidor.
   * Mudanças nas APIs de roteamento Express ou integrações que exijam segurança de chaves em backend (ex: webhook do Gastrofood).
   * Atualizações de dependências no arquivo `/server/package.json`.
4. **INDICAÇÃO DE DEPLOY**: Ao efetuar commits puramente visuais ou de integrações diretas do Supabase, faça o commit com mensagens que deixem claro que a mudança é exclusiva do frontend (ex: `feat(ui): ...` ou `fix(ui): ...`) e apenas efetue o deploy do frontend (Vercel).

## Regras de Execução de Comandos Assíncronos e Deploys

1. **PROIBIDO CANCELAR OU INTERROMPER PROCESSOS DE DEPLOY EM MEIO À EXECUÇÃO**: Nunca force o cancelamento, interrupção ou concorrência de comandos de deploy ativos (ex: `npm run deploy` que invoca `vercel --prod`) ou chamadas sensíveis de infraestrutura. Interromper prematuramente processos de upload da CLI da Vercel ou Coolify bloqueia o estado do deploy remoto, resultando em builds parciais, arquivos de assets corrompidos ou perda de variáveis de ambiente ativas.
2. **AGUARDAR SEMPRE A CONCLUSÃO TOTAL**: Todo e qualquer comando de deploy iniciado deve ter seu ciclo completo acompanhado através dos logs até que o resultado final de sucesso ou falha real seja devolvido.
