# Customizações e Regras do Agente

## Regras Globais do Projeto (Deploy e Versionamento)

Sempre que o usuário digitar `deploy!`, ou solicitar um deploy, o agente **OBRIGATORIAMENTE** deve executar as seguintes ações:

1. **Incremento de Versão**: Incrementar a versão no arquivo `package.json` (geralmente alterando o número `patch` da versão, ex: de `3.4.2` para `3.4.3`). Se a ferramenta `npm version patch` estiver disponível, use-a.
2. **Registro de Data/Hora de Build**: Se houver variáveis de ambiente como `VITE_PACKAGE_BUILD_DATE` (ou similar) no `.env`, atualize-a para a data/hora atual para que o frontend reflita o momento do deploy.
3. **Execução do Comando de Deploy**: Rodar o comando do projeto para deploy (ex: `npm run deploy`).
4. **Relatório**: Ao final, relatar claramente qual foi a versão gerada e o status do deploy no chat.

## Regras de Execução e Testes do Servidor (Sem Servidor Local)

1. **PROIBIDO INICIAR BACKEND LOCAL**: Nunca inicie ou execute o servidor de backend localmente na máquina do usuário (evitando comandos como `npm run dev` ou similares dentro da pasta `/server`). A execução simultânea do servidor de backend local e do servidor de produção em nuvem (Coolify) causa severos problemas de concorrência com o banco de dados Supabase e conflitos de sessão do WhatsApp (código 409), poluindo os logs do painel web e do console com falhas falsas de conexão.
2. **COMUNICAÇÃO EXCLUSIVA COM PRODUÇÃO**: A aplicação front-end (tanto em execução de desenvolvimento local `npm run dev` na raiz, quanto em produção online) deve **obrigatoriamente** se comunicar apenas com o backend de produção online publicado na nuvem (Coolify). O arquivo `.env` do front-end local deve sempre manter `VITE_WHATSAPP_ENGINE_URL` apontado para o endereço de produção.
3. **DEPLOY DE BACKEND ANTES DE TESTAR**: Quando houver necessidade de testar qualquer alteração feita no código do servidor de backend, a IA deve **obrigatoriamente** primeiro realizar o deploy das alterações do servidor na produção em nuvem (Coolify/GitHub) para que a alteração reflita no ambiente real, e somente depois orientar o usuário a testar.
4. **SILENCIAMENTO DE LOGS LOCAIS DE MICRO-SERVIÇOS**: Evitar e suprimir logs e alertas desnecessários de micro-serviços locais (como o `WaCalls` na porta 8080) caso o serviço de chamadas não esteja ativo localmente, garantindo tratamento profissional de todos os erros legítimos enviados pelo usuário.
