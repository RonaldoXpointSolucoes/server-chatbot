# Plano completo de arquitetura SaaS com Baileys + Node.js + Supabase

## Versão do documento
- **Versão:** 1.0
- **Idioma:** Português do Brasil
- **Objetivo:** explicar, de forma clara e acessível, como construir um sistema SaaS multiempresa para WhatsApp usando **Baileys**, **Node.js** e **Supabase**, com foco em **escala**, **segurança**, **tempo real** e **facilidade para investigar erros**.

---

# 1. Resumo simples

Este projeto é um **sistema SaaS**.

Isso significa que:
- várias empresas vão usar o mesmo sistema;
- cada empresa terá seus próprios números, conversas e usuários;
- os dados de uma empresa **não podem aparecer** para outra;
- o sistema precisa crescer sem travar ou misturar informações.

Neste cenário:
- o **Baileys** será usado para falar com o WhatsApp Web;
- o **Node.js** será o servidor principal que controla o Baileys;
- o **Supabase** será o banco de dados, o sistema de tempo real e a base para memória/RAG;
- a **aplicação web** será o painel que o usuário vê.

## Ideia central da arquitetura

A regra principal é:

```text
Aplicação Web -> envia comandos -> Servidor Node
Servidor Node -> salva informações -> Supabase
Servidor Node -> publica eventos -> Supabase Realtime
Aplicação Web <- recebe atualizações -> Supabase Realtime
```

### Em português claro
- a tela do sistema **não conversa direto com o WhatsApp**;
- quem controla o WhatsApp é o **servidor Node**;
- tudo importante fica salvo no **Supabase**;
- a tela recebe as novidades em tempo real pelo **Supabase Realtime**.

Essa abordagem é melhor porque:
- deixa o sistema mais organizado;
- melhora a segurança;
- evita depender do navegador do usuário para as coisas continuarem funcionando;
- facilita escalar para muitas empresas.

---

# 2. O que é cada tecnologia

## 2.1 Baileys
O Baileys é uma biblioteca que simula o comportamento do **WhatsApp Web**.

Ela serve para:
- conectar um número;
- gerar QR Code;
- receber mensagens;
- enviar mensagens;
- detectar desconexões;
- trabalhar com eventos do WhatsApp.

### Importante
O Baileys **não é** a API oficial do WhatsApp Business.
Ele funciona usando a lógica do WhatsApp Web.

### O que isso significa na prática
- ele é poderoso;
- ele é flexível;
- mas exige cuidado com sessões, conexões e armazenamento de autenticação.

---

## 2.2 Node.js
O Node.js será o **servidor principal** do projeto.

Ele será responsável por:
- controlar as conexões do Baileys;
- criar sessões por empresa/número;
- decidir qual número envia ou recebe a mensagem;
- salvar informações no Supabase;
- publicar eventos em tempo real;
- executar automações;
- responder a comandos da aplicação web.

### Em termos simples
O Node será o **cérebro operacional**.

---

## 2.3 Supabase
O Supabase será usado para:
- banco de dados;
- autenticação;
- tempo real (Realtime);
- storage de arquivos;
- vetores/embeddings para RAG;
- segurança com RLS.

### Em termos simples
O Supabase será:
- a **memória** do sistema;
- a **fonte da verdade**;
- o **canal de atualização em tempo real** da interface.

---

## 2.4 Aplicação Web
É o painel que o usuário vai abrir.

Ela mostra:
- QR Code;
- status dos números;
- mensagens;
- lista de contatos;
- conversas;
- atendentes online;
- automações;
- relatórios;
- base de conhecimento.

### Ela não deve
- controlar diretamente o socket do WhatsApp;
- guardar a sessão do número;
- ser a única responsável por manter o sistema vivo.

---

# 3. Objetivo real dessa arquitetura

Criar um sistema que seja:
- multiempresa;
- seguro;
- escalável;
- em tempo real;
- fácil de manter;
- fácil de debugar;
- preparado para crescer.

---

# 4. Regra mais importante do projeto

## Nunca misturar empresas

Toda empresa precisa ter um identificador próprio:

- `tenant_id`

Tudo no sistema deve respeitar isso.

### Exemplo
Se a empresa A recebe uma mensagem, essa mensagem precisa ser salva com o `tenant_id` da empresa A.

Se a empresa B abrir o painel, ela **não pode** ver nada dessa mensagem.

### Por isso, quase tudo deve ter
- `tenant_id`
- `instance_id`
- `conversation_id`

---

# 5. Estrutura visual da arquitetura

```text
┌───────────────────────────────┐
│        Aplicação Web          │
│  painel, inbox, qr, status    │
└──────────────┬────────────────┘
               │
               │ comandos HTTP
               ▼
┌───────────────────────────────┐
│         Servidor Node         │
│  API + Session Manager        │
│  Baileys + automações         │
└───────┬───────────────┬───────┘
        │               │
        │ grava         │ publica eventos
        ▼               ▼
┌─────────────────────────────────────────┐
│               Supabase                  │
│ Postgres + Realtime + Auth + Storage    │
│ + pgvector/RAG                          │
└─────────────────────────────────────────┘
        ▲
        │
        │ atualizações em tempo real
        │
┌───────┴─────────────────────────────────┐
│              Aplicação Web               │
└──────────────────────────────────────────┘
```

---

# 6. Como a comunicação deve funcionar

## 6.1 Quando o usuário clicar em “Conectar número”

Fluxo:
1. a aplicação web chama o Node;
2. o Node abre ou reativa a sessão do Baileys;
3. o Baileys gera um QR Code;
4. o Node salva isso no Supabase;
5. o Node publica um evento em tempo real;
6. a aplicação web recebe o evento e mostra o QR.

### Por que isso é bom?
Porque a tela **não precisa gerar o QR** sozinha nem manter a lógica do WhatsApp.

---

## 6.2 Quando chegar uma mensagem nova

Fluxo:
1. o Baileys recebe a mensagem;
2. o Node identifica de qual empresa e número ela é;
3. o Node salva a mensagem;
4. o Node atualiza a conversa;
5. o Node publica evento em tempo real;
6. a tela recebe a novidade e atualiza.

### Resultado
A mensagem aparece rápido, mas também fica salva no banco.

---

## 6.3 Quando o operador enviar uma mensagem

Fluxo:
1. a aplicação web chama o endpoint do Node;
2. o Node valida se o usuário pertence à empresa correta;
3. o Node usa a instância correta do Baileys;
4. o Node envia a mensagem;
5. o Node salva status;
6. o Node publica evento de confirmação ou falha.

---

# 7. Componentes do backend Node

Mesmo que tudo comece em um único projeto, o ideal é pensar em módulos.

## 7.1 API Gateway
É a porta de entrada das ações da aplicação web.

### Função
Receber comandos como:
- conectar;
- desconectar;
- enviar mensagem;
- pedir QR;
- pedir pairing code;
- assumir atendimento;
- retomar bot.

### Motivo
Organiza melhor a entrada do sistema.

---

## 7.2 Session Manager
É o módulo que mantém as instâncias do Baileys ativas.

### Função
- abrir sessão;
- fechar sessão;
- reconectar;
- guardar em memória quais instâncias estão vivas;
- saber qual processo é dono de cada instância.

### Motivo
Sem isso, fica fácil perder controle de quem está conectado.

---

## 7.3 Event Processor
É quem escuta os eventos que o Baileys gera.

### Função
Reagir a eventos como:
- QR gerado;
- conexão aberta;
- conexão fechada;
- mensagem recebida;
- credenciais atualizadas.

### Motivo
Centraliza o tratamento dos acontecimentos do WhatsApp.

---

## 7.4 Realtime Publisher
Publica eventos no Supabase Realtime.

### Função
Avisar a aplicação web que algo mudou.

### Exemplos
- QR foi atualizado;
- nova mensagem chegou;
- status da conexão mudou;
- mensagem foi enviada;
- houve erro operacional.

### Motivo
A tela não precisa ficar consultando o banco toda hora.

---

## 7.5 Automation Worker
Executa tarefas automáticas.

### Exemplos
- responder cliente automaticamente;
- consultar o RAG;
- criar handoff para atendente;
- retomar atendimento do bot;
- processar fila de mensagens.

### Motivo
Separa a automação da parte principal do servidor.

---

# 8. Conceitos importantes para você entender

## 8.1 Tenant
É a empresa dentro do SaaS.

### Exemplo
- Burguer Plus = 1 tenant
- Pizzaria do João = 1 tenant
- Restaurante XP = 1 tenant

Cada tenant precisa ser isolado.

---

## 8.2 Instance
É uma conexão/número WhatsApp dentro da empresa.

### Exemplo
A empresa pode ter:
- número do comercial;
- número do suporte;
- número do delivery.

Cada um pode ser uma `instance`.

---

## 8.3 Conversation
É a conversa com um contato.

### Exemplo
Cliente João mandou mensagem no número do delivery.
Isso gera uma conversa específica.

---

## 8.4 Auth State
É o conjunto de credenciais que mantém a sessão do WhatsApp viva.

### Em linguagem simples
É o que faz o sistema lembrar que aquele número já foi autenticado.

### Muito importante
Isso precisa ser salvo com cuidado, criptografado e por instância.

---

## 8.5 Realtime
É a atualização em tempo real.

### Em linguagem simples
É o que faz a tela mudar sem precisar recarregar.

---

## 8.6 RLS
Significa **Row Level Security**.

### Em linguagem simples
É uma proteção do banco que garante que o usuário só consiga ver as linhas que pode ver.

### Exemplo
Se o usuário pertence à empresa A, o banco impede que ele veja os dados da empresa B.

---

## 8.7 RAG
É um sistema onde a IA busca informações em uma base de conhecimento antes de responder.

### Exemplo
Se a pizzaria tem:
- horário de atendimento;
- bairros atendidos;
- promoções;
- cardápio;
- regras da loja;

a IA pode responder usando essas informações.

---

# 9. Modelo de dados explicado para leigo

## 9.1 `tenants`
Guarda as empresas.

### Para que serve
Saber quais empresas existem dentro do sistema.

### Campos principais
- `id`: identificador da empresa
- `name`: nome da empresa
- `slug`: apelido único
- `plan`: plano contratado
- `status`: se está ativa ou não

---

## 9.2 `tenant_users`
Liga usuários às empresas.

### Para que serve
Um mesmo usuário pode participar de uma empresa ou mais.

### Campos principais
- `tenant_id`
- `user_id`
- `role`

### `role`
É o papel do usuário:
- owner
- admin
- agent
- viewer

---

## 9.3 `whatsapp_instances`
Guarda os números/instâncias do WhatsApp.

### Para que serve
Saber quais números pertencem à empresa e qual o estado deles.

### Campos importantes
- `display_name`: nome amigável
- `phone_number`: número
- `status`: estado da conexão
- `assigned_node_id`: qual servidor/worker está cuidando dessa instância
- `lease_until`: até quando aquele worker é o dono da instância
- `last_error`: último erro

### Por que isso existe
Para evitar dois servidores tentando controlar o mesmo número ao mesmo tempo.

---

## 9.4 `whatsapp_instance_runtime`
Guarda dados mais vivos da conexão.

### Exemplos
- QR atual
- pairing code
- estado do socket
- progresso de sincronização

### Motivo
Separar estado operacional de dados mais permanentes.

---

## 9.5 `wa_auth_credentials`
Guarda credenciais principais da sessão.

### Motivo
Manter a conexão autenticada depois que o QR foi lido.

### Importante
Esses dados precisam ficar protegidos.

---

## 9.6 `wa_auth_keys`
Guarda chaves auxiliares da sessão.

### Motivo
A Baileys usa várias informações internas para manter a sessão funcionando.

---

## 9.7 `contacts`
Guarda os contatos dos clientes.

### Motivo
Ter um cadastro unificado do cliente por tenant.

---

## 9.8 `conversations`
Guarda o estado da conversa.

### Motivo
Controlar se a conversa está:
- aberta;
- em atendimento humano;
- no bot;
- encerrada.

### Também serve para
- mostrar último preview;
- saber quantas mensagens não lidas existem;
- saber quem está atendendo.

---

## 9.9 `messages`
Guarda as mensagens.

### Motivo
Ter histórico, auditoria, busca e visualização.

### Campos importantes
- `direction`: inbound ou outbound
- `message_type`: texto, imagem, áudio, etc.
- `status`: enviada, lida, falhou...
- `raw_payload`: conteúdo bruto recebido do provedor

### Por que guardar o `raw_payload`
Porque ajuda muito no debug quando algo der errado.

---

## 9.10 `handoff_sessions`
Guarda quando a conversa foi passada para um humano.

### Motivo
Saber quando a automação parou e um atendente assumiu.

### Também ajuda no RAG
Porque respostas humanas boas podem virar aprendizado futuro.

---

## 9.11 `outbox_events`
Fila de eventos e tarefas pendentes.

### Motivo
Permitir retry e controle de falhas.

### Exemplo
Se uma mensagem não puder ser enviada naquele momento, ela pode entrar em fila.

---

## 9.12 `knowledge_documents`, `knowledge_chunks`, `knowledge_embeddings`
Essas tabelas formam a base do RAG.

### `knowledge_documents`
Documento inteiro.

### `knowledge_chunks`
Pedaços menores do documento.

### `knowledge_embeddings`
Versão vetorial desses pedaços para a IA pesquisar semanticamente.

### Motivo
Permitir respostas mais inteligentes e específicas por empresa.

---

# 10. Endpoints do Node explicados

## 10.1 Instâncias

### `POST /v1/instances`
Cria uma nova instância.

### `POST /v1/instances/:instanceId/connect`
Pede para conectar uma instância.

### `POST /v1/instances/:instanceId/disconnect`
Desconecta.

### `POST /v1/instances/:instanceId/request-qr`
Pede um novo QR.

### `POST /v1/instances/:instanceId/request-pairing-code`
Pede código de pareamento.

### `GET /v1/instances/:instanceId/status`
Consulta o status.

### `DELETE /v1/instances/:instanceId`
Exclui a instância.

---

## 10.2 Mensagens

### `POST /v1/messages/send`
Envia mensagem de texto.

### `POST /v1/messages/send-media`
Envia mídia.

### `POST /v1/messages/react`
Reage a uma mensagem.

### `POST /v1/messages/mark-read`
Marca como lida.

### `GET /v1/conversations/:conversationId/messages`
Busca histórico da conversa.

---

## 10.3 Conversas

### `GET /v1/conversations`
Lista conversas.

### `POST /v1/conversations/:conversationId/handoff`
Passa a conversa para humano.

### `POST /v1/conversations/:conversationId/resume-bot`
Devolve a conversa para o bot.

### `POST /v1/conversations/:conversationId/assign`
Atribui a um atendente.

### `POST /v1/conversations/:conversationId/close`
Encerra.

---

# 11. Realtime explicado de forma simples

## O que vai em Broadcast
Broadcast é bom para eventos rápidos e momentâneos.

### Exemplos
- QR atualizado
- pairing code gerado
- “conectando”
- “desconectou”
- mensagem acabou de chegar
- alerta de erro

## O que vai em Postgres Changes
É bom para mudanças persistidas no banco.

### Exemplos
- nova linha em mensagens
- mudança no status da conversa
- atualização de instância

## O que vai em Presence
É para presença de pessoas online.

### Exemplos
- atendente entrou
- atendente saiu
- alguém abriu uma conversa

---

# 12. Padrão de canais em tempo real

Recomendação:

```text
tenant:{tenant_id}
tenant:{tenant_id}:inbox
tenant:{tenant_id}:instance:{instance_id}
tenant:{tenant_id}:conversation:{conversation_id}
tenant:{tenant_id}:operators
tenant:{tenant_id}:alerts
```

## O que isso significa
### `tenant:{tenant_id}:instance:{instance_id}`
Canal para QR, pairing e status daquela instância.

### `tenant:{tenant_id}:inbox`
Canal para mensagens novas e atualizações gerais do inbox.

### `tenant:{tenant_id}:conversation:{conversation_id}`
Canal específico daquela conversa.

### `tenant:{tenant_id}:operators`
Canal da presença dos operadores.

---

# 13. Escalabilidade

## Problema que precisa ser evitado
Se dois processos Node tentarem controlar o mesmo número WhatsApp ao mesmo tempo, o sistema pode quebrar ou ficar inconsistente.

## Solução
Usar a lógica de **ownership por lease**.

### Em linguagem simples
Só um worker por vez pode ser o dono da instância.

### Campos usados para isso
- `assigned_node_id`
- `lease_until`
- `last_heartbeat_at`

### Como funciona
1. um worker assume a instância;
2. grava que é o dono;
3. renova esse “aluguel” periodicamente;
4. se morrer, outro worker pode assumir depois.

### Vantagem
Permite escalar horizontalmente com mais segurança.

---

# 14. Segurança

## 14.1 Nunca confiar só no front-end
O front-end pode mandar um `instance_id`, mas o backend precisa verificar se aquele usuário realmente pertence à empresa daquela instância.

## 14.2 Todo acesso precisa respeitar o tenant
Toda busca e toda gravação precisam considerar o `tenant_id`.

## 14.3 RLS no Supabase
É obrigatório usar RLS nas tabelas principais.

## 14.4 Auth state protegido
As credenciais da sessão do WhatsApp precisam ser:
- criptografadas;
- protegidas;
- acessadas só pelo backend.

---

# 15. Observabilidade e debug

Esta seção é uma das mais importantes do documento.

## Objetivo
Quando der problema, você precisa saber:
- o que aconteceu;
- onde aconteceu;
- em qual empresa aconteceu;
- em qual número aconteceu;
- em qual conversa aconteceu;
- em qual versão do sistema aconteceu.

## 15.1 O que o sistema precisa registrar em logs
Todo log importante deve ter:
- `timestamp`
- `level` (info, warn, error)
- `request_id`
- `tenant_id`
- `instance_id`
- `conversation_id` quando existir
- `user_id` quando existir
- `release_version`
- mensagem do erro
- stack trace quando houver

## 15.2 O que são esses campos
### `request_id`
É um identificador único da requisição.

### `release_version`
É a versão que está rodando.

### `tenant_id`
Mostra de qual empresa é o evento.

### `instance_id`
Mostra qual número/instância foi afetado.

### `conversation_id`
Mostra qual conversa foi afetada.

---

## 15.3 Endpoints de saúde

### `/debug/healthz`
Mostra se o processo está vivo.

### `/debug/readyz`
Mostra se ele está pronto de verdade.

## Diferença entre os dois
- `healthz`: “o processo está de pé?”
- `readyz`: “ele está pronto para receber tráfego e trabalhar?”

### Exemplo
O servidor pode estar vivo, mas sem conexão com banco ou sem capacidade de operar. Nesse caso:
- `healthz` pode estar ok;
- `readyz` pode estar falhando.

---

## 15.4 Problemas mais comuns que você precisa conseguir identificar

### 1. QR não aparece
Possíveis causas:
- instância não abriu;
- evento não foi tratado;
- evento não foi publicado no Realtime;
- front está ouvindo canal errado.

### 2. Mensagem chegou no WhatsApp mas não apareceu no painel
Possíveis causas:
- `messages.upsert` não foi processado;
- mensagem não foi salva;
- RLS bloqueou leitura;
- Realtime não publicou;
- front está no canal errado.

### 3. Número desconecta sozinho
Possíveis causas:
- sessão inválida;
- credenciais com problema;
- conflito entre workers;
- reconexão mal implementada.

### 4. Mistura de mensagens entre empresas
Possíveis causas graves:
- ausência de filtro por `tenant_id`;
- canais Realtime mal montados;
- queries sem validação;
- uso incorreto de credenciais administrativas.

### 5. O sistema entra em loop tentando corrigir algo
Possíveis causas:
- retry sem limite;
- tratamento de erro repetindo a mesma ação;
- evento que dispara ele mesmo novamente;
- reconexão sem condição de parada.

---

# 16. Método anti-loop para investigar problemas

Sempre usar este ciclo:

## Passo 1 — Definir o sintoma
Pergunte:
- o que exatamente falhou?
- quando aconteceu?
- em qual empresa?
- em qual número?
- em qual conversa?
- começou depois de deploy?

## Passo 2 — Coletar evidências
Procurar:
- logs
- status da instância
- último evento do socket
- estado no banco
- evento realtime
- versão atual

## Passo 3 — Criar no máximo 3 hipóteses
Nunca criar 20 hipóteses ao mesmo tempo.

## Passo 4 — Escolher 1 teste de maior valor
Fazer o teste mais útil e menos arriscado.

## Passo 5 — Registrar o resultado
Saber se a hipótese caiu ou se ficou mais forte.

## Passo 6 — Corrigir o mínimo possível
Nunca mexer em 10 coisas ao mesmo tempo.

## Passo 7 — Validar
Ver se resolveu e se não quebrou outra coisa.

---

# 17. Como saber onde está o problema

## Se o problema for de QR
Investigue nesta ordem:
1. endpoint de connect foi chamado?
2. instância foi criada/reativada?
3. `connection.update` veio?
4. `qr` veio no evento?
5. runtime foi salvo?
6. broadcast foi publicado?
7. front está inscrito no canal certo?

## Se o problema for de mensagem recebida
1. Baileys recebeu `messages.upsert`?
2. payload foi normalizado?
3. message foi persistida?
4. conversation foi atualizada?
5. realtime publicou?
6. RLS deixou o usuário ler?
7. front estava no canal certo?

## Se o problema for envio de mensagem
1. endpoint foi chamado?
2. tenant foi validado?
3. instância estava aberta?
4. payload estava correto?
5. Baileys retornou sucesso/erro?
6. status foi salvo?
7. realtime notificou?

---

# 18. Recomendação de evolução por fases

## Fase 1 — Base correta
- autenticação
- tenants
- usuários
- instâncias
- connect/QR
- mensagens recebidas
- persistência
- realtime básico

## Fase 2 — Operação completa
- envio de mensagens
- inbox
- handoff humano
- presença de operadores
- reconexão

## Fase 3 — Inteligência
- RAG por tenant
- automações
- respostas automáticas
- enriquecimento de conhecimento

## Fase 4 — Escala
- múltiplos workers
- lease por instância
- filas
- retries controlados
- observabilidade mais madura

---

# 19. O que eu recomendo fortemente

## 19.1 Não começar complexo demais
Mesmo que a arquitetura final seja grande, comece pelo núcleo correto.

## 19.2 Sempre salvar payload bruto
Isso ajuda muito quando der problema.

## 19.3 Nunca pular RLS
RLS não é opcional em um SaaS multiempresa.

## 19.4 Nunca deixar duas instâncias controlarem o mesmo número
Esse é um risco crítico.

## 19.5 Separar estado persistido de evento rápido
- banco = estado durável
- realtime = atualização da tela

---

# 20. Exemplo de evento bem documentado

## Evento: QR atualizado

### O que é
O Node gerou ou recebeu um novo QR Code para uma instância específica.

### Quem publica
Servidor Node.

### Quem consome
Aplicação web da empresa dona daquela instância.

### Canal sugerido
```text
tenant:{tenant_id}:instance:{instance_id}
```

### Exemplo JSON
```json
{
  "event": "instance.qr_updated",
  "tenant_id": "uuid",
  "instance_id": "uuid",
  "timestamp": "2026-04-05T14:00:00Z",
  "payload": {
    "qr_code": "data_or_string",
    "expires_in_seconds": 45
  }
}
```

### Por que isso existe
Para a tela conseguir mostrar o QR no momento certo.

### O que pode dar errado
- QR gerado mas não publicado
- QR publicado no canal errado
- front sem permissão
- front ouvindo o tópico errado

---

# 21. Exemplo de endpoint explicado

## `POST /v1/instances/:instanceId/connect`

### O que faz
Pede ao servidor que conecte uma instância WhatsApp.

### Quem chama
A aplicação web.

### O que o servidor precisa verificar
- o usuário está autenticado?
- ele pertence à empresa?
- a instância existe?
- a instância pertence ao tenant correto?
- já existe outro worker dono da instância?

### O que acontece depois
- abre sessão ou reativa;
- trata eventos do socket;
- publica atualizações em tempo real.

### Resposta ideal
```json
{
  "ok": true,
  "status": "connecting",
  "instanceId": "uuid"
}
```

---

# 22. Como explicar o papel de cada função no código

Quando você for olhando instruções técnicas, pense assim:

## Funções de controller
Recebem chamadas HTTP.

### Exemplo mental
“alguém clicou em um botão na tela e isso chegou no servidor”.

## Funções de service
Executam a lógica principal.

### Exemplo mental
“o servidor está fazendo o trabalho de verdade”.

## Funções de repository
Falam com o banco.

### Exemplo mental
“essa função lê ou grava informação”.

## Funções de publisher
Mandam eventos em tempo real.

### Exemplo mental
“essa função avisa a tela que alguma coisa mudou”.

## Funções de normalização
Transformam dados brutos em formato padronizado.

### Exemplo mental
“o WhatsApp mandou algo bagunçado e essa função organiza”.

---

# 23. Como pensar quando você ler uma instrução técnica

Use esta tradução mental:

- **Instância** = número conectado
- **Socket** = canal vivo de comunicação com o WhatsApp
- **Persistir** = salvar no banco
- **Emitir evento** = avisar em tempo real
- **Broadcast** = mensagem rápida para a interface
- **Lease** = posse temporária da instância por um worker
- **Worker** = processo que faz o trabalho
- **Retry** = tentar de novo
- **Fallback** = plano B
- **Payload** = dados recebidos ou enviados
- **RLS** = trava de segurança por linha

---

# 24. Checklist de qualidade antes de ir para produção

## Banco
- [ ] todas as tabelas principais têm `tenant_id`
- [ ] RLS está habilitado
- [ ] policies foram testadas

## Node
- [ ] logs estruturados funcionando
- [ ] `healthz` e `readyz` funcionando
- [ ] sessão Baileys salva fora de arquivo local simples
- [ ] reconexão controlada
- [ ] não existem loops de retry sem limite

## Realtime
- [ ] canais privados configurados
- [ ] tópicos seguem padrão por tenant
- [ ] front recebe QR em tempo real
- [ ] front recebe mensagem nova em tempo real

## Segurança
- [ ] backend valida `tenant_id`
- [ ] usuário não consegue acessar instância de outra empresa
- [ ] dados sensíveis protegidos

## Observabilidade
- [ ] logs incluem `tenant_id`
- [ ] logs incluem `instance_id`
- [ ] erros guardam stack
- [ ] payload bruto é salvo quando necessário

---

# 25. Conclusão final

A melhor arquitetura para esse projeto é:

- **Baileys no backend Node**
- **Supabase como banco + realtime + segurança + RAG**
- **Aplicação web recebendo estado e eventos do Supabase**
- **Comandos críticos indo para o Node**
- **Tudo isolado por tenant**

## Em linguagem simples
- a tela manda ordens;
- o servidor faz o trabalho com o WhatsApp;
- o banco guarda tudo;
- o realtime atualiza a tela;
- cada empresa fica separada;
- quando der erro, você consegue investigar.

---

# 26. Próximos documentos recomendados

Depois deste plano, os próximos documentos ideais seriam:

1. **Documento de banco de dados explicado tabela por tabela**
2. **Documento de endpoints com exemplos de requisição e resposta**
3. **Documento de eventos realtime com exemplos completos**
4. **Documento de debug e investigação de erros**
5. **Guia passo a passo de implementação para leigo**

---

# 27. Resumo ultra curto

Se você quiser guardar uma versão simples na cabeça, é esta:

```text
O Node controla o WhatsApp.
O Supabase guarda tudo e atualiza a tela.
A aplicação web manda comandos e recebe eventos.
Cada empresa tem seu próprio tenant.
Nada pode ser misturado.
Tudo precisa ser fácil de debugar.
```
