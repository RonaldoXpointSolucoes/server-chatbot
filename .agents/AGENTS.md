# Customizações e Regras do Agente

## Regras Globais do Projeto (Deploy e Versionamento)

Sempre que o usuário digitar `deploy!`, ou solicitar um deploy, o agente **OBRIGATORIAMENTE** deve executar as seguintes ações:

1. **Incremento de Versão**: Incrementar a versão no arquivo `package.json` (geralmente alterando o número `patch` da versão, ex: de `3.4.2` para `3.4.3`). Se a ferramenta `npm version patch` estiver disponível, use-a.
2. **Registro de Data/Hora de Build**: Se houver variáveis de ambiente como `VITE_PACKAGE_BUILD_DATE` (ou similar) no `.env`, atualize-a para a data/hora atual para que o frontend reflita o momento do deploy.
3. **Execução do Comando de Deploy**: Rodar o comando do projeto para deploy (ex: `npm run deploy`).
4. **Relatório**: Ao final, relatar claramente qual foi a versão gerada e o status do deploy no chat.
