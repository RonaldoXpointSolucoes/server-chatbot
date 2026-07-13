# Customizações e Regras do Agente

## Regras Globais do Projeto (Deploy e Versionamento)

Sempre que o usuário digitar `deploy!`, ou solicitar um deploy, o agente **OBRIGATORIAMENTE** deve executar as seguintes ações:

1. **Incremento de Versão (Dígito Único)**: Incrementar a versão no arquivo `package.json` e `server/package.json`. Cada componente (`X.Y.Z`) só pode ir de `0` a `9` (nunca use dois dígitos, ex: evitar `.10`, `.22`). O valor máximo é `9`.
   - Se a versão atual for `X.Y.patch` onde `patch` < 9, incremente para `X.Y.(patch+1)` (ex: de `4.4.8` para `4.4.9`).
   - Se for `X.Y.9`, incremente o minor e zere o patch: `X.(Y+1).0` (ex: de `4.4.9` o próximo deve ser obrigatoriamente `4.5.0`).
   - Se for `X.9.9`, incremente o major: `(X+1).0.0` (ex: de `4.9.9` para `5.0.0`).
2. **Registro de Data/Hora de Build**: Se houver variáveis de ambiente como `VITE_PACKAGE_BUILD_DATE` (ou similar) no `.env`, atualize-a para a data/hora atual para que o frontend reflita o momento do deploy.
3. **Execução do Comando de Deploy**: Rodar o comando do projeto para deploy (ex: `npm run deploy`).
4. **Relatório**: Ao final, relatar claramente qual foi a versão gerada e o status do deploy no chat.

## Regras de Execução e Testes do Servidor (Sem Servidor Local)

1. **PROIBIDO INICIAR BACKEND LOCAL**: Nunca inicie ou execute o servidor de backend localmente na máquina do usuário (evitando comandos como `npm run dev` ou similares dentro da pasta `/server`). A execução simultânea do servidor de backend local e do servidor de produção em nuvem (Coolify) causa severos problemas de concorrência com o banco de dados Supabase e conflitos de sessão do WhatsApp (código 409), poluindo os logs do painel web e do console com falhas falsas de conexão.
2. **COMUNICAÇÃO EXCLUSIVA COM PRODUÇÃO**: A aplicação front-end (tanto em execução de desenvolvimento local `npm run dev` na raiz, quanto em produção online) deve **obrigatoriamente** se comunicar apenas com o backend de produção online publicado na nuvem (Coolify). O arquivo `.env` do front-end local deve sempre manter `VITE_WHATSAPP_ENGINE_URL` apontado para o endereço de produção.
3. **DEPLOY DE BACKEND ANTES DE TESTAR**: Quando houver necessidade de testar qualquer alteração feita no código do servidor de backend, a IA deve **obrigatoriamente** primeiro realizar o deploy das alterações do servidor na produção em nuvem (Coolify/GitHub) para que a alteração reflita no ambiente real, e somente depois orientar o usuário a testar.
4. **SILENCIAMENTO DE LOGS LOCAIS DE MICRO-SERVIÇOS**: Evitar e suprimir logs e alertas desnecessários de micro-serviços locais (como o `WaCalls` na porta 8080) caso o serviço de chamadas não esteja ativo localmente, garantindo tratamento profissional de todos os erros legítimos enviados pelo usuário.

## Regras de Atualização do Servidor (Node.js) vs. Frontend

1. **ALTERAÇÃO ESTREITAMENTE VISUAL / FRONTEND**: Se a mudança for de visual, comportamento de tela, estilo (CSS/Tailwind) ou ajustes em componentes de React na raiz/src (fora do diretório `/server`), o servidor Node.js **NÃO** deve ser atualizado, versionado ou reiniciado. Evite modificar arquivos dentro do diretório `/server` para que o Coolify não ative builds redundantes do motor.
2. **QUANDO ATUALIZAR O SERVIDOR NODE**: O backend só deve ser alterado e sofrer deploy se houver mudanças reais de lógica no diretório `/server/`, tais como:
   * Modificações no `SessionManager`, `EventProcessor`, `FlowEngine` ou biblioteca `baileys-core`.
   * Criação de tabelas, triggers Postgres, scripts de banco de dados ou arquivos SQL de migração.
   * Mudanças nas APIs de roteamento Express ou integrações externas (Gemini AI, Gastrofood API, etc.).
   * Atualizações de dependências no arquivo `/server/package.json`.
3. **INDICAÇÃO DE DEPLOY**: Ao efetuar commits puramente visuais, faça o commit com mensagens que deixem claro que a mudança é exclusiva do frontend (ex: `feat(ui): ...` ou `fix(ui): ...`) e apenas efetue o deploy do frontend (Vercel).

## Regras de Execução de Comandos Assíncronos e Deploys

1. **PROIBIDO CANCELAR OU INTERROMPER PROCESSOS DE DEPLOY EM MEIO À EXECUÇÃO**: Nunca force o cancelamento, interrupção ou concorrência de comandos de deploy ativos (ex: `npm run deploy` que invoca `vercel --prod`) ou chamadas sensíveis de infraestrutura. Interromper prematuramente processos de upload da CLI da Vercel ou Coolify bloqueia o estado do deploy remoto, resultando em builds parciais, arquivos de assets corrompidos (como js/css compilados apontando para caminhos antigos) ou perda de variáveis de ambiente ativas.
2. **AGUARDAR SEMPRE A CONCLUSÃO TOTAL**: Todo e qualquer comando de deploy iniciado deve ter seu ciclo completo acompanhado através dos logs até que o resultado final de sucesso ou falha real seja devolvido.


