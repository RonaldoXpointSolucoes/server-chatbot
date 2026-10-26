const fs = require('fs');
const path = require('path');

const consolidatedGroups = [
  {
    groupId: 'G01_CHAT_ORDER',
    targetCardId: '0070dfe0-6f82-4788-89b9-a43f7c8405c7',
    absorbedCardIds: ['35ecc473-ed5d-42b9-b101-c3ada7eaf61d'],
    title: '[Chat UI] Ordenação Estável da Lista de Conversas por Última Mensagem ao Resolver Tickets',
    priority: 2,
    tags: ['NEXT-GEN', 'Frontend', 'React', 'UI/UX', 'Chat', 'Appwrite', 'Sorting'],
    notes: `### 🎯 Objetivo & Visão Geral
Garantir que a lista lateral de conversas do chat mantenha uma ordenação estritamente cronológica decrescente baseada no timestamp da mensagem mais recente (\`last_message_at\` / \`updated_at\`), mesmo quando atendentes finalizarem ou resolverem tickets (individualmente ou em lote). Atualmente, a alteração de status do ticket provocava reordenação abrupta ou 'pulo' visual de conversas na lista.

---
### 🧩 Cartões Legados Consolidados (Pós 15/09)
- **#56** [\`0070dfe0\`]: \`[Chat] Manter Ordem de Listagem por Última Mensagem ao Resolver Conversa\`
- **#59** [\`35ecc473\`]: \`[Chat] Ordem da Lista de Chats Não Deve Alterar ao Resolver Tickets\`

---
### 🏗️ Contexto Arquitetural no Novo Ecossistema (ChatBoot-New)
- **Frontend**: React + Vite + TailwindCSS.
- **Banco de Dados**: Appwrite Self-Hosted (\`chatboot_db\`), coleção \`chats\` / \`conversations\`.
- **Realtime**: Appwrite Realtime WebSocket (\`client.subscribe('databases.chatboot_db.collections.chats.documents')\`).
- **Comportamento Esperado**: Ao receber evento de atualização de documento (\`databases.*.documents.*.update\`) indicando fechamento de ticket (\`status: 'closed'\`), o estado local de chats no Zustand (\`chatStore.ts\`) deve apenas atualizar os metadados do chat sem forçar um re-sort baseado no timestamp da alteração do ticket.

---
### 📋 Requisitos Técnicos & Regras de Negócio
1. **Critério de Ordenação Único**: O cálculo de \`sort\` da lista de conversas deve usar exclusivamente:
   \`Math.max(new Date(chat.last_message_at || 0).getTime(), new Date(chat.created_at || 0).getTime())\` de forma decrescente.
2. **Imutabilidade de Posição ao Resolver**: Quando o operador clica em "Resolver Conversa" ou "Concluir Ticket", o status visual muda para resolvido, mas a conversa permanece na mesma posição da lista até que uma nova mensagem chegue.
3. **Filtros de Lista**: Os filtros de aba ("Abertas", "Resolvidas", "Todas") devem filtrar os itens sem quebrar a consistência da ordenação interna.

---
### 🛠️ Arquivos & Componentes Alvo
- \`src/store/chatStore.ts\` (seletores e ordenação do array de chats)
- \`src/pages/ChatDashboard.tsx\` ou \`src/components/chat/ChatList.tsx\` (renderização e transições)
- \`src/services/appwriteChat.ts\` (handlers de eventos Realtime)

---
### 🚀 Passo a Passo de Implementação para a IA Desenvolvedora
1. Inspecionar o comparator da função de sort de conversas no \`chatStore.ts\`.
2. Remover qualquer ordenação secundária que priorize ou penalize chats com base no status (\`resolved\` / \`closed\`) ou na data de atualização do ticket (\`ticket_resolved_at\`).
3. Ao despachar o update de resolução via Appwrite Database (\`databases.updateDocument('chatboot_db', 'chats', chatId, { status: 'resolved' })\`), atualizar o item in-place no cache de estado local.
4. Validar que ao resolver 3 tickets consecutivos em conversas do meio da lista, a lista não pisca e os itens permanecem exatamente na ordem cronológica de última mensagem.

---
### 🧪 Critérios de Aceite & Validação (QA)
- [ ] Resolver conversa única: conversa permanece no mesmo índice visual até nova mensagem.
- [ ] Resolução em massa: nenhuma conversa pula de posição ou desaparece indevidamente da aba atual.
- [ ] Chegada de nova mensagem de cliente: conversa sobe imediatamente para a 1ª posição da lista.`
  },
  {
    groupId: 'G02_KANBAN_FOLD',
    targetCardId: '95836682-ec96-4e11-a4ce-942b5448e258',
    absorbedCardIds: [],
    title: '[Kanban CRM] Persistência do Estado de Dobra/Colapso das Colunas no LocalStorage',
    priority: 3,
    tags: ['NEXT-GEN', 'Frontend', 'React', 'Kanban', 'UI/UX', 'LocalStorage'],
    notes: `### 🎯 Objetivo & Visão Geral
Tornar permanente e persistente o estado de colapso/dobra de cada coluna do quadro Kanban no CRM. O usuário pode colapsar colunas menos acessadas (como 'Backlog' ou 'Concluído') para focar nas colunas de trabalho ativo ('Em Análise', 'Em Desenvolvimento', 'Em Testes'), e esse estado deve ser preservado mesmo após recarregar a página (F5) ou trocar de rotas.

---
### 🧩 Cartões Legados Consolidados (Pós 15/09)
- **#57** [\`95836682\`]: \`[Kanban] Persistência da Dobra de Colunas\`

---
### 🏗️ Contexto Arquitetural no Novo Ecossistema (ChatBoot-New)
- **Frontend**: React + TailwindCSS, visual glassmorphism SaaS.
- **Componente**: \`KanbanBoard.tsx\` / \`BoardColumn.tsx\`.
- **Persistência**: \`localStorage\` com chave isolada por quadro (\`crm_kanban_collapsed_columns_\${boardId}\`) e por usuário/tenant.

---
### 📋 Requisitos Técnicos & Regras de Negócio
1. **Estado Inicial**: Na montagem do componente, ler do \`localStorage\` as colunas colapsadas:
   \`\`\`ts
   const storageKey = \`crm_kanban_collapsed_\${boardId}\`;
   const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>(() => {
     try {
       const saved = localStorage.getItem(storageKey);
       return saved ? JSON.parse(saved) : {};
     } catch {
       return {};
     }
   });
   \`\`\`
2. **Atualização Reativa**: Ao clicar no botão de expandir/recolher coluna (chevron lateral), atualizar o estado e gravar no \`localStorage\`.
3. **Responsividade**: Em telas menores (mobile/tablet), colunas colapsadas devem ocupar apenas uma faixa vertical fina com texto orientado na vertical e contador de cards.

---
### 🛠️ Arquivos & Componentes Alvo
- \`src/components/crm/KanbanBoard.tsx\`
- \`src/components/crm/KanbanColumn.tsx\`
- \`src/hooks/useKanban.ts\`

---
### 🚀 Passo a Passo de Implementação para a IA Desenvolvedora
1. Localizar o componente de renderização das colunas do Kanban no CRM.
2. Adicionar hook customizado ou \`useEffect\` para persistência automática no \`localStorage\`.
3. Adicionar transição CSS suave (\`transition-all duration-300\`) para expansão e retração de largura da coluna.
4. Testar dobrar as colunas 'Backlog' e 'Concluído/Produção', dar refresh na tela e constatar que permanecem dobradas.

---
### 🧪 Critérios de Aceite & Validação (QA)
- [ ] Dobrar colunas -> F5 na página -> colunas continuam dobradas.
- [ ] Abrir outro quadro de CRM -> estado de colunas é independente por quadro.
- [ ] Contador de itens e botão de reabertura visíveis e clicáveis na coluna dobrada.`
  },
  {
    groupId: 'G03_QUICK_REPLIES',
    targetCardId: 'aacf5f31-6a64-4a3f-b8d6-27d5a32ded1a',
    absorbedCardIds: [],
    title: '[Chat UI] Inversão de Ordem no Modal de Respostas Rápidas: Mensagens Prontas antes das Pastas',
    priority: 3,
    tags: ['NEXT-GEN', 'Frontend', 'React', 'UI/UX', 'Chat', 'QuickReplies'],
    notes: `### 🎯 Objetivo & Visão Geral
Aprimorar a ergonomia e velocidade de atendimento no Chat: ao digitar \`/\` no campo de texto de envio de mensagem, o popover/modal de respostas rápidas deve exibir PRIMEIRO as mensagens prontas individuais e, logo abaixo, as pastas de categorias. Isso permite que o atendente acione as respostas mais frequentes com apenas um clique ou atalho de teclado sem precisar navegar por pastas.

---
### 🧩 Cartões Legados Consolidados (Pós 15/09)
- **#58** [\`aacf5f31\`]: \`[Chat] Inversão da Ordem de Exibição: Mensagens Prontas antes das Pastas\`

---
### 🏗️ Contexto Arquitetural no Novo Ecossistema (ChatBoot-New)
- **Frontend**: Componente de input do chat (\`ChatInput.tsx\` ou \`QuickRepliesModal.tsx\`).
- **Banco de Dados**: Coleção \`quick_replies\` no Appwrite com campos: \`title\`, \`content\`, \`shortcut\`, \`folder_id\`.

---
### 📋 Requisitos Técnicos & Regras de Negócio
1. **Estrutura Visual do Popover**:
   - Cabeçalho: Campo de busca com filtro em tempo real.
   - Bloco 1 (Topo): "⚡ Mensagens Prontas" (lista direta das mensagens mais usadas ou que combinam com o termo pesquisado).
   - Bloco 2 (Base): "📁 Pastas & Categorias" (agrupadores secundários).
2. **Navegação por Teclado**: Setas para cima/baixo (\`ArrowUp\` / \`ArrowDown\`) e \`Enter\` devem selecionar e injetar o texto da mensagem no input do chat imediatamente.

---
### 🛠️ Arquivos & Componentes Alvo
- \`src/components/chat/QuickRepliesPopover.tsx\`
- \`src/components/chat/ChatInput.tsx\`
- \`src/store/quickRepliesStore.ts\`

---
### 🚀 Passo a Passo de Implementação para a IA Desenvolvedora
1. Acessar o componente que renderiza o autocomplete ao digitar \`/\`.
2. Inverter a ordem de mapeamento: renderizar a seção de mensagens diretas (\`quickMessages\`) antes da seção de pastas (\`folders\`).
3. Manter a funcionalidade de clique em uma pasta expandir suas mensagens internas com breadcrumb de retorno.
4. Validar fluidez visual com estilo dark/glassmorphism e seleção via teclado.

---
### 🧪 Critérios de Aceite & Validação (QA)
- [ ] Digitar \`/\` no input: lista exibe as mensagens prontas no topo com atalho em badge.
- [ ] Pressionar Enter na primeira opção: mensagem é injetada no input e popover se fecha.
- [ ] Pastas acessíveis logo abaixo para quem precisar navegar por departamentos.`
  },
  {
    groupId: 'G04_AUDIO_TRANSCRIBE',
    targetCardId: '65061852-5440-4bbc-b5ba-5288c5efeafd',
    absorbedCardIds: [],
    title: '[Chat & Mídia] Correção de Gravação/Reprodução de Áudio Opus e Pipeline de Transcrição por IA',
    priority: 1,
    tags: ['NEXT-GEN', 'Frontend', 'Backend', 'Audio', 'Whisper', 'AI-Engine', 'Appwrite-Storage', 'Whatsmeow'],
    notes: `### 🎯 Objetivo & Visão Geral
Resolver de forma definitiva o problema de áudios corrompidos, 'picotados' ou com ruídos que impediam a reprodução limpa no chat e quebravam a transcrição/tradução automática por IA. O pipeline de áudio deve ser homologado ponta a ponta desde a captura no navegador até a transcrição no AI Engine.

---
### 🧩 Cartões Legados Consolidados (Pós 15/09)
- **#60** [\`65061852\`]: \`[Chat] Correção de Áudio com Falhas e Melhoria na Transcrição\`

---
### 🏗️ Contexto Arquitetural no Novo Ecossistema (ChatBoot-New)
- **Captura no Browser**: \`MediaRecorder\` com \`audio/webm;codecs=opus\`, taxa de amostragem de 48kHz, mono, bitrate 64kbps.
- **Armazenamento de Mídia**: Bucket \`chat_media\` no **Appwrite Storage Self-Hosted** (\`storage.createFile('chat_media', ...)\`).
- **Disparo WhatsApp**: **Whatsmeow Worker em Go** (\`POST /send/audio\` com flag PTT = true e mimeType \`audio/ogg; codecs=opus\`).
- **Transcrição**: Microsserviço desacoplado **AI Engine** (\`https://ai.179.199.142.157.sslip.io/transcribe\`) processando o áudio via Whisper / Gemini com fallback automático.

---
### 📋 Requisitos Técnicos & Regras de Negócio
1. **Gravação Resiliente**:
   - Utilizar \`timeslice: 250\` no \`recorder.start(250)\` para garantir acúmulo contínuo de chunks.
   - No \`onstop\`, concatenar os chunks num único \`Blob\` com tipo \`audio/ogg; codecs=opus\` ou \`audio/webm; codecs=opus\`.
   - Gerar pré-visualização de onda sonora (waveform) com reprodução de teste antes do envio.
2. **Player de Áudio Customizado**:
   - Barra de progresso deslizável, controle de velocidade (1x, 1.5x, 2x), tempo restante e status de envio.
3. **Pipeline de Transcrição**:
   - Assim que o áudio for persistido no Appwrite, disparar job assíncrono para o \`AI Engine\`.
   - O resultado da transcrição deve ser gravado no campo \`transcription\` do documento da mensagem no Appwrite e transmitido via Realtime para a UI, exibindo o balão de texto transcrito abaixo do player.

---
### 🛠️ Arquivos & Componentes Alvo
- \`src/components/chat/AudioRecorderModal.tsx\` / \`AudioPlayer.tsx\`
- \`src/services/appwriteStorage.ts\`
- Backend: Endpoint de webhook de recebimento de áudio do Whatsmeow Go
- AI Engine: Serviço de transcrição Whisper / Gemini

---
### 🚀 Passo a Passo de Implementação para a IA Desenvolvedora
1. Revisar o gravador de áudio no frontend garantindo integridade dos cabeçalhos de contêiner Ogg/WebM.
2. Configurar o upload do Blob para o bucket do Appwrite Storage com permissão pública de leitura para o tenant.
3. Implementar a chamada ao Whatsmeow Go para envio como mensagem de voz oficial (PTT).
4. No recebimento de áudios de clientes via Whatsmeow, acionar o endpoint de transcrição no AI Engine e persistir o texto transcrito no Appwrite.

---
### 🧪 Critérios de Aceite & Validação (QA)
- [ ] Gravar áudio de 15 segundos: áudio reproduz no player sem cliques, falhas ou travamento.
- [ ] Envio para WhatsApp do cliente: chega como áudio de voz com botão de reprodução verde/azul oficial.
- [ ] Transcrição automática: texto falado é exibido com precisão abaixo do áudio em menos de 3 segundos.`
  },
  {
    groupId: 'G05_MESSAGES_DEDUP_MEDIA',
    targetCardId: 'a7108213-3e56-4fde-9c93-0e31ffc9ea3b',
    absorbedCardIds: [
      'df62e4a1-1a48-4e9b-aeae-ddfa85bbab94',
      '6574d38b-cb8b-4eb0-9dba-dcd75461c4b4',
      '34ee5750-9e8c-46ee-af55-b1b07f26b7a5'
    ],
    title: '[Chat & Mensageria] Envio Otimista Rápido, Deduplicação no Realtime e Integridade de Mídias e Avatares',
    priority: 1,
    tags: ['NEXT-GEN', 'Frontend', 'Backend', 'Whatsmeow', 'Appwrite', 'Realtime', 'Deduplication', 'Media'],
    notes: `### 🎯 Objetivo & Visão Geral
Eliminar a duplicação de mensagens na tela do atendente, acabar com a latência no envio para o WhatsApp, e blindar o carregamento de mídias (fotos, vídeos, documentos) e avatares de contatos em redes instáveis. No sistema legado ocorriam conflitos entre inserção otimista local e eco do Realtime, além de falhas de rede no fetch de imagens.

---
### 🧩 Cartões Legados Consolidados (Pós 15/09)
- **#73** [\`a7108213\`]: \`[Correção Crítica] Eliminar Duplicação e Demora no Envio de Mensagens do Chat CRM\`
- **#66** [\`df62e4a1\`]: \`[Chat] Correção Crítica de Perda de Mensagens, Imagens e Vídeos do WhatsApp\`
- **#71** [\`6574d38b\`]: \`[Backend] Correção de Falhas de Envio de Mensagens e Melhoria na Robustez do Baileys\`
- **#26** [\`34ee5750\`]: \`[Frontend / Correção] Estabilização da Função fetchContactPicture em Redes Instáveis\`

---
### 🏗️ Contexto Arquitetural no Novo Ecossistema (ChatBoot-New)
- **Motor WhatsApp**: **Whatsmeow Go Engine** (\`https://whatsmeow.179.199.142.157.sslip.io\`), capaz de processar envios em menos de 300ms sem enfileiramento pesado no Node.
- **Banco e Storage**: **Appwrite Self-Hosted** (\`chatboot_db\`), coleção \`messages\` e bucket \`chat_media\`.
- **Mecanismo de Deduplicação**:
  * Ao enviar, o frontend gera um \`client_id\` (UUID v4) e renderiza a mensagem imediatamente como 'enviando' (status otimista).
  * O Whatsmeow Go e o Appwrite gravam o \`client_id\` no documento da mensagem junto ao \`message_id\` oficial do WhatsApp.
  * O listener do Appwrite Realtime faz match pelo \`client_id\`: se a mensagem já existe na tela, apenas atualiza seu status para 'enviado' (✓✓) sem duplicar o card na timeline.
- **Resiliência de Avatares**: Função \`fetchContactPicture\` com timeout de 3s, cache local (Memory/IndexedDB) e fallback para iniciais estilizadas em SVG em caso de falha de rede.

---
### 📋 Requisitos Técnicos & Regras de Negócio
1. **Envio Otimista com Reconciliação**:
   - Timeline do chat nunca deve piscar ou duplicar mensagem enviada pelo atendente.
   - Status visual: \`pending\` (relógio) ➔ \`sent\` (um check) ➔ \`delivered\` (dois checks) ➔ \`read\` (dois checks azuis).
2. **Mídias Grandes (Vídeos e Documentos)**:
   - Upload direto em chunks para o Appwrite Storage com barra de progresso em porcentagem.
   - Whatsmeow Go recebe a URL interna do Appwrite Storage e envia com stream otimizado sem sobrecarregar a memória RAM.
3. **Resiliência a Quedas de Conexão**:
   - Se o envio falhar após 3 tentativas de retry, a mensagem recebe status de \`error\` com botão vermelho de "Reenviar".

---
### 🛠️ Arquivos & Componentes Alvo
- \`src/store/chatStore.ts\` (lógica de reconciliação otimista e deduplicação)
- \`src/components/chat/MessageBubble.tsx\` / \`ChatMessagesList.tsx\`
- \`src/services/appwriteMessages.ts\`
- \`src/services/whatsmeowClient.ts\`
- \`src/utils/contactPicture.ts\`

---
### 🚀 Passo a Passo de Implementação para a IA Desenvolvedora
1. Implementar o gerador de \`client_id\` no momento do clique no botão enviar no \`chatStore.ts\`.
2. No handler de eventos do Appwrite Realtime, verificar:
   \`\`\`ts
   const exists = state.messages.some(m => m.client_id === newMsg.client_id || m.id === newMsg.id);
   if (exists) {
     // Atualiza in-place mantendo integridade
     updateMessageInPlace(newMsg);
   } else {
     appendMessage(newMsg);
   }
   \`\`\`
3. Atualizar o \`fetchContactPicture\` com bloco \`try/catch/timeout\` e retorno de \`null\` seguro sem estourar \`TypeError: Failed to fetch\`.
4. Testar envio sequencial de 5 mensagens rápidas (texto e fotos) e confirmar que nenhuma duplica.

---
### 🧪 Critérios de Aceite & Validação (QA)
- [ ] Envio de mensagem: feedback visual instantâneo (<50ms) e confirmação do Whatsmeow em <1s.
- [ ] Zero duplicação: mensagens enviadas nunca aparecem duas vezes na tela.
- [ ] Upload de imagens/vídeos: upload concluído, miniatura gerada e envio concluído sem erro de SMB.
- [ ] Redes instáveis: falhas de foto de perfil não travam o carregamento da lista de conversas.`
  },
  {
    groupId: 'G06_CRM_TICKETS_UI',
    targetCardId: '6c488d16-42e2-470e-a7d1-90e6bde89256',
    absorbedCardIds: [],
    title: '[CRM / UI/UX] Refatoração e Simplificação do Fluxo e Modais de Chamados (Mobile-First)',
    priority: 2,
    tags: ['NEXT-GEN', 'Frontend', 'React', 'CRM', 'UI/UX', 'Mobile-First', 'TailwindCSS'],
    notes: `### 🎯 Objetivo & Visão Geral
Refatorar as telas e modais de criação, edição e acompanhamento de chamados internos/tickets no CRM ChatBot. A experiência atual apresentava sobrecarga de informações, falta de alinhamento visual em dispositivos móveis/tablets e dificuldade para identificar com clareza a demanda original vs o que a equipe técnica entregou.

---
### 🧩 Cartões Legados Consolidados (Pós 15/09)
- **#52** [\`6c488d16\`]: \`[CRM] Refatoração de UI/UX e Simplificação do Fluxo de Chamados\`

---
### 🏗️ Contexto Arquitetural no Novo Ecossistema (ChatBoot-New)
- **Design System**: Mobile-First, TailwindCSS, Glassmorphism moderno (fundo escuro \`bg-slate-900/90\`, bordas suaves \`border-slate-800\`, acentos em roxo e azul elétrico).
- **Banco de Dados**: Coleção \`crm_leads\` no Appwrite Self-Hosted.
- **Componentes**: Modal de detalhes do chamado com arquitetura de duas abas bem divididas:
  1. Aba 1: "📋 Demanda Solicitada" (descrição, anexos do cliente, áudio, prioridade).
  2. Aba 2: "🚀 Entrega & Resolução" (relatório de execução técnica, evidências de teste, notas internas).

---
### 📋 Requisitos Técnicos & Regras de Negócio
1. **Layout Responsivo (Mobile, Tablet, Desktop)**:
   - Eliminar qualquer barra de rolagem horizontal desnecessária.
   - Modais em Mobile devem abrir como Bottom Sheet fluido ou tela cheia deslizante com botão de fechar acessível.
2. **Badges de Status & Prioridade**:
   - Status visual intuitivo: Backlog (Azul), Em Análise (Roxo), Em Desenvolvimento (Índigo), Em Testes & QA (Âmbar), Concluído / Produção (Esmeralda).
   - Prioridade: Baixa (Verde), Média (Amarelo), Alta (Laranja), Crítica / Urgente (Vermelho pulsante).
3. **Seção de Evidências Multimídia**:
   - Galeria de imagens/prints anexados ao chamado com visualizador lightbox integrado.

---
### 🛠️ Arquivos & Componentes Alvo
- \`src/components/crm/LeadDetailModal.tsx\`
- \`src/components/crm/CreateCardModal.tsx\`
- \`src/components/crm/CardStatusBadge.tsx\`

---
### 🚀 Passo a Passo de Implementação para a IA Desenvolvedora
1. Aplicar os 10 pontos de UI/UX recomendados no card legados.
2. Reestruturar o modal de chamados com abas simples e legíveis.
3. Adicionar upload de prints de evidência diretamente para o Appwrite Storage.
4. Garantir que a linha do tempo (histórico) liste quem moveu o chamado e quando com precisão.

---
### 🧪 Critérios de Aceite & Validação (QA)
- [ ] Abertura de chamado em tela de 375px (Mobile): todos os botões e textos visíveis sem corte.
- [ ] Visualização de chamado: distinção imediata entre solicitação do cliente e entrega técnica.
- [ ] Transição de status no modal: atualiza no quadro Kanban em tempo real via Appwrite.`
  },
  {
    groupId: 'G07_PRINT_PAUSE_AI',
    targetCardId: '67e06649-f8bd-4c44-bd12-87c641949be6',
    absorbedCardIds: [],
    title: '[Automação / Atendimento] Pausa Automática da IA por 1 Hora após Disparo de Impressão de Recado',
    priority: 2,
    tags: ['NEXT-GEN', 'Frontend', 'Backend', 'AI-Engine', 'Appwrite', 'Automação', 'Impressão'],
    notes: `### 🎯 Objetivo & Visão Geral
Implementar a pausa automática da Inteligência Artificial por exatamente uma hora sempre que o comando de envio de recado/pedido para a impressora térmica física for acionado em uma conversa. Isso evita que o robô continue enviando mensagens automáticas enquanto a equipe humana prepara o pedido físico ou opera no balcão/cozinha.

---
### 🧩 Cartões Legados Consolidados (Pós 15/09)
- **#10** [\`67e06649\`]: \`[ChatBot CRM] Pausar I.A. após Comando de Impressão\`

---
### 🏗️ Contexto Arquitetural no Novo Ecossistema (ChatBoot-New)
- **Banco de Dados**: Coleção \`chats\` no Appwrite Self-Hosted (\`chatboot_db\`), campo \`ai_paused_until\` (formato ISO 8601 string).
- **AI Engine**: Antes de gerar resposta automática para qualquer mensagem recebida no WhatsApp, o **AI Engine** consulta o campo \`ai_paused_until\` da conversa. Se \`new Date() < new Date(chat.ai_paused_until)\`, o processamento de IA é suprimido silenciosamente.
- **Frontend**: A interface do chat exibe um badge visual informando ao operador que a IA está pausada, exibindo o tempo restante em contagem regressiva e um botão para "Retomar IA Agora".

---
### 📋 Requisitos Técnicos & Regras de Negócio
1. **Gatilho de Ativação**:
   - Ao clicar no botão de "Imprimir Recado" ou disparar o comando de impressão (via QZ Tray, impressora térmica de 40 colunas ou API de impressão), gravar:
     \`ai_paused_until = new Date(Date.now() + 60 * 60 * 1000).toISOString()\`.
2. **Registro de Auditoria / Sistema**:
   - Inserir uma mensagem de sistema no chat: \`"🖨️ Recado impresso com sucesso. A I.A. foi pausada automaticamente por 1 hora para este atendimento."\`
3. **Retomada Manual**:
   - O atendente humano pode clicar em "Retomar I.A." a qualquer momento, setando \`ai_paused_until = null\`.

---
### 🛠️ Arquivos & Componentes Alvo
- Frontend: \`src/components/chat/ChatHeader.tsx\` (badge e botão de retomada), \`src/components/modals/PrintMessageModal.tsx\`
- Backend Node: \`services/core-business-engine/src/controllers/printController.js\`
- AI Engine: \`services/ai-engine/src/services/agentProcessor.js\` (verificação de pausa)

---
### 🚀 Passo a Passo de Implementação para a IA Desenvolvedora
1. Adicionar o atributo \`ai_paused_until\` (tipo string/datetime, nullable) na coleção \`chats\` do Appwrite.
2. Na ação de impressão bem-sucedida, atualizar o documento no Appwrite com a data atual + 60 minutos.
3. No middleware de IA do \`AI Engine\`, checar se a conversa está pausada antes de chamar o Gemini.
4. Renderizar indicador de status visual no topo da conversa com botão de play/resume.

---
### 🧪 Critérios de Aceite & Validação (QA)
- [ ] Disparar impressão -> IA não responde novas mensagens do cliente na próxima 1 hora.
- [ ] Chat exibe badge "IA Pausada (59m restantes)".
- [ ] Clicar em "Retomar IA" -> IA volta a responder imediatamente no próximo turno de conversa.`
  },
  {
    groupId: 'G08_GASTROFOOD_CACHE',
    targetCardId: '76ea4e88-77e3-4386-83a0-4d0b36e1c05a',
    absorbedCardIds: [
      'cf2525a4-fb74-489e-bdb0-6d28b8823e21',
      '0d62a46e-40c3-4b01-a09d-915db65e47d7',
      '0b008424-afcb-4538-ac13-6f4e0e091b37',
      'ddc63b7f-c654-4774-b180-694b859ccef6',
      '2b14497c-c38e-41bc-9b2b-a9f538d5cb52',
      'e376e146-2e5d-4f42-8bf7-90352afe3c76',
      'abbe500e-c3d5-4e3f-bc6b-eda6af2b6703'
    ],
    title: '[Integração Gastrofood] Cache Inteligente de Cardápio, Resiliência a Falhas HTTP e Sanitização de Rotas',
    priority: 2,
    tags: ['NEXT-GEN', 'Backend', 'Node.js', 'Gastrofood', 'Cache', 'API-Resilience', 'Core-Business-Engine'],
    notes: `### 🎯 Objetivo & Visão Geral
Consolidar a integração com o ERP/cardápio Gastrofood no novo microsserviço Core Business Engine, implementando cache inteligente em memória/Redis (TTL 10-15min), proteção contra respostas vazias inesperadas (stale-while-revalidate), compatibilidade de grafia (\`customer\` vs \`custumer\` do Delphi) e sanitização de rotas raiz para evitar poluição de logs com requisições 404 de scanners.

---
### 🧩 Cartões Legados Consolidados (Pós 15/09)
- **#1** [\`76ea4e88\`]: \`[Backend / Otimização] Tratamento de Rotas Raiz e Implementação de Cache Inteligente para API Gastrofood\`
- **#19** [\`cf2525a4\`]: \`[Integração / Correção] Refinamento de Logs e Resiliência do Cardápio Gastrofood\`
- Série de cards de falha repetida: **#37**, **#38**, **#39**, **#46**, **#47**, **#48** (Tratamento de Falhas e Resiliência em Chamadas de API)

---
### 🏗️ Contexto Arquitetural no Novo Ecossistema (ChatBoot-New)
- **Serviço Responsável**: **Core Business Engine Node.js** (\`https://api.179.199.142.157.sslip.io\`), hospedado no Coolify Novo na VPS Hostinger.
- **Camada de Caching**: Mecanismo de Cache em memória com chave \`gastrofood:menu:\${tenantId}\`, validade de 10 minutos, com invalidação manual via botão no painel de configurações.
- **Blindagem de Catálogo Vazio**: Se o Gastrofood responder HTTP 200 porém com lista vazia (\`produtos: []\`) enquanto houver cache anterior válido, o sistema mantém o cardápio do cache e emite log de alerta, impedindo que o robô de vendas diga que o restaurante não tem produtos.

---
### 📋 Requisitos Técnicos & Regras de Negócio
1. **Estratégia de Cache**:
   \`\`\`ts
   async function getGastrofoodMenu(tenantId, forceRefresh = false) {
     if (!forceRefresh && menuCache.has(tenantId)) {
       const cached = menuCache.get(tenantId);
       if (Date.now() - cached.timestamp < 10 * 60 * 1000) return cached.data;
     }
     const freshData = await fetchFromGastrofoodAPI(tenantId);
     if ((!freshData || freshData.length === 0) && menuCache.has(tenantId)) {
       return menuCache.get(tenantId).data; // Fallback gracioso
     }
     menuCache.set(tenantId, { timestamp: Date.now(), data: freshData });
     return freshData;
   }
   \`\`\`
2. **Normalização de Cargas do Delphi**: Tratar tanto \`custumer\` quanto \`customer\` nos payloads recebidos.
3. **Tratamento de Rota Raiz**: O Express deve responder \`GET /\` com \`{ status: "online", service: "Core Business Engine" }\` em vez de gerar erro 404 em log.

---
### 🛠️ Arquivos & Componentes Alvo
- \`services/core-business-engine/src/services/gastrofoodService.js\`
- \`services/core-business-engine/src/routes/gastrofoodRoutes.js\`
- \`src/pages/settings/Integrations.tsx\` (botão de limpar cache e testar conexão)

---
### 🚀 Passo a Passo de Implementação para a IA Desenvolvedora
1. No novo repositório Node, criar o serviço \`gastrofoodService.js\` com cache e retries (3 tentativas com backoff exponencial).
2. Adicionar o mecanismo de stale cache contra respostas 200 vazias.
3. Configurar rota de healthcheck e resposta padrão em \`/\`.
4. Integrar com o AI Engine para consulta rápida de cardápio nas mensagens do chatbot.

---
### 🧪 Critérios de Aceite & Validação (QA)
- [ ] 10 requisições seguidas de cardápio: apenas 1 chamada bate na API externa; as outras 9 retornam do cache em <10ms.
- [ ] API Gastrofood offline/vazia: cardápio anterior é preservado e atendimento continua operando.
- [ ] Endpoint \`GET /\` retorna status 200 com informações do serviço sem log de erro.`
  },
  {
    groupId: 'G09_DEVLOGGER_CONSOLE',
    targetCardId: '22e1900a-90c6-4899-9e21-426dc427502d',
    absorbedCardIds: [
      '7eb6faec-ab77-45c6-8524-208539623a99',
      '78c34f5a-0114-4473-8b47-a67be75344fd',
      'f4506bfc-0f67-441e-9fc7-4c71454e6a8e'
    ],
    title: '[DevTools & Observabilidade] Console do Servidor, Antigravity DevLogger com Filtros e Ação Criar Card CRM',
    priority: 2,
    tags: ['NEXT-GEN', 'Frontend', 'Observability', 'DevLogger', 'Appwrite', 'Coolify', 'UI/UX'],
    notes: `### 🎯 Objetivo & Visão Geral
Consolidar e modernizar a central de observabilidade técnica do sistema: o Console do Servidor e o Antigravity DevLogger. Resolver a exibição incorreta de status 'OFFLINE', implementar streaming e carregamento eficiente de logs com filtros avançados (ERROR, WARN, INFO), busca por texto, design Mobile-First e ação integrada de 1-clique para transformar qualquer erro crítico em um card de análise no CRM.

---
### 🧩 Cartões Legados Consolidados (Pós 15/09)
- **#64** [\`22e1900a\`]: \`[Logger] Refatoração e Otimização do Antigravity Dev Logger\`
- **#18** [\`7eb6faec\`]: \`[Console] Melhoria Abrangente do Log Viewer com IA & CRM\`
- **#25** [\`78c34f5a\`]: \`[UI/UX] Refatoração e Otimização da Tela de Logs Antigravity\`
- **#68** [\`f4506bfc\`]: \`[Sistema] Console do Servidor Incorreto: Status Offline e Falha na Exibição de Logs\`

---
### 🏗️ Contexto Arquitetural no Novo Ecossistema (ChatBoot-New)
- **Backend**: Endpoint de heartbeat \`/api/health\` no Core Business Engine e no Whatsmeow Worker informando CPU, RAM, uptime e status ativo.
- **Persistência de Logs**: Coleção \`system_logs\` no Appwrite Self-Hosted (\`chatboot_db\`).
- **Frontend**: Componente \`DevLogger.tsx\` e tela de Console (\`ServerConsole.tsx\`) com polling ou SSE leve para logs ao vivo.

---
### 📋 Requisitos Técnicos & Regras de Negócio
1. **Deteção Fiel de Status do Servidor**:
   - Polling a cada 15s em \`/health\`: status verde 'ONLINE' com badge de latência (ex: 45ms).
   - Se 3 heartbeats falharem consecutivamente, exibir 'OFFLINE' em vermelho com botão de 'Reconectar'.
2. **Filtros e Visualização de Logs**:
   - Níveis selecionáveis com contadores: [TODOS] [ERROS (3)] [AVISOS (12)] [INFO (45)].
   - Busca instantânea por termo ou ID de migalha (\`[MIGALHA X/Y]\`).
   - JSON viewer expansível para inspecionar payloads de requisições e stacktraces.
3. **Ação 'Criar Card no CRM'**:
   - Cada linha de log com nível \`ERROR\` tem um botão discreto "+ Criar Card CRM". Ao clicar, abre o modal de criação de card no CRM com título, stacktrace e contexto pré-preenchidos na coluna "Em Análise".

---
### 🛠️ Arquivos & Componentes Alvo
- \`src/components/DevLogger.tsx\`
- \`src/pages/settings/ServerConsole.tsx\`
- \`src/services/appwriteLogs.ts\`

---
### 🚀 Passo a Passo de Implementação para a IA Desenvolvedora
1. Refatorar \`DevLogger.tsx\` seguindo diretrizes Mobile-First (eliminar overflow horizontal).
2. Adicionar o hook de verificação periódica de saúde dos 4 microsserviços do novo ecossistema (Whatsmeow Go, Core Business Engine, AI Engine e Appwrite).
3. Conectar a tabela de logs à coleção \`system_logs\` do Appwrite.
4. Implementar a criação de cards no CRM com 1 clique.

---
### 🧪 Critérios de Aceite & Validação (QA)
- [ ] Console exibe status ONLINE quando os serviços estão ativos, sem falso-positivo de OFFLINE.
- [ ] Filtro por 'ERROS' isola imediatamente os logs de falha com payload legível.
- [ ] Botão 'Criar Card CRM' gera um lead na coluna 'analysis' com dados preenchidos.`
  },
  {
    groupId: 'G10_WHATSMEOW_ENGINE',
    targetCardId: '8fa0675b-cda5-4981-8923-13248289ccc5',
    absorbedCardIds: [
      'a0251eb0-80ea-4395-9df0-7d7d242637b5',
      '7ba0ca8d-71b3-40e1-a96e-eb58fcba47ae',
      'cb0899dd-2384-4863-822e-2e564d6db5f1',
      '1984f9c7-5ebc-4c49-8e43-8e4ce2ee2a4c',
      '6554f03f-05bb-4cf1-bfe0-dafbda3f9c66',
      '1e0e3db9-c70e-4ddc-87da-35c911b30ea8',
      'e455e759-dd9a-4c28-98e3-ea7cb817a863',
      '55498644-b049-43ee-8ecf-7557161e3898',
      'd4e8c1ea-9428-406a-a681-ae45d3bc6be4',
      '1364a66e-e9fa-47cb-9565-df0a28f58b6e',
      '0132fc4a-581d-400c-a1ba-2f883da89ec4',
      '6ad0ac65-edf0-4c4a-a029-2ad4f75b404b',
      '45b795b2-5f67-4e24-9f76-3a6f004adf4f',
      '05e93d18-a880-4cf6-88ad-61e4d8ec3d90',
      'abf282af-3916-4c2d-b8f3-96c4a9470744',
      '44d1c682-de7c-4145-8961-ed30cf03c3d3',
      '0143f779-8cf9-46b0-b888-ca4ba9ee6079',
      '5ccb12b8-edbe-493d-8263-401674f7c63d',
      'e68770a9-83c7-497d-aa2d-a6021272fc47',
      'df14c5c2-60ff-4e78-95ef-fcefb1eb3e58',
      '803e5c7d-089c-4db3-ae09-826f1c422c54',
      'b3e6ab55-46e7-4de1-a206-0e2f9817ed53',
      '1ae59814-8528-4e21-b830-9997842d7c63',
      'ea9d378a-73c7-4ee8-a2c9-ca724c095733',
      '78f1e591-357d-46da-84d3-fc55e8f6a9b6',
      'f2e4a81a-c75c-42cb-bdfa-c6031b4028dc',
      'd9861baa-a82f-4c17-91f1-3315a6b738e4',
      '6b4f6c5a-350b-47e0-af9d-b4b1a473b6aa',
      '5f3bf484-4f00-4b15-ade5-15181cbb2214',
      '2ec3604b-39b3-408b-bf64-0d7b0fbb980f',
      'a0251eb0-080a-4669-bcb8-0e6416af9a33',
      '85e5face-aaa7-4f37-9543-8ad64f3d2260',
      '5206e016-4272-4cbb-99e9-d0297801a89a',
      'bcdaff34-d126-4b4f-942f-e1c2eda91040'
    ],
    title: '[WhatsApp Engine Next-Gen] Substituição da Baileys por Whatsmeow Worker em Go e Conexão com Appwrite',
    priority: 1,
    tags: ['NEXT-GEN', 'Backend', 'Go', 'Whatsmeow', 'WhatsApp', 'Appwrite', 'Coolify', 'Architecture'],
    notes: `### 🎯 Objetivo & Visão Geral
Substituir definitivamente a biblioteca legada Baileys (Node.js) pelo **Whatsmeow Worker em Go**, erradicando de uma vez por todas os 34 incidentes recorrentes de conflito 409 (sessão duplicada), vazamento de memória em locks do SessionManager, timeout de sockets e perda de conexão no WhatsApp.

---
### 🧩 Cartões Legados Consolidados (Pós 15/09 - 34 Cards de Baileys / Sockets)
- Consolida **#65** [\`8fa0675b\`] e outros 33 cards de diagnósticos de Baileys, SessionManager e quedas de conexão gerados entre 15/09 e 10/10/2026.

---
### 🏗️ Contexto Arquitetural no Novo Ecossistema (ChatBoot-New)
- **Motor Whatsmeow**: Microsserviço de alta performance compilado em Go, rodando no Coolify Novo na VPS Hostinger (\`https://whatsmeow.179.199.142.157.sslip.io\`).
- **Vantagens de Engenharia**:
  * Em vez de instanciar WebSockets e crypto em JavaScript no Node (que travam o Event Loop), o Go gerencia concorrência com goroutines nativas e persistência SQLite/Postgres de alta velocidade.
  * O servidor Node.js agora atua exclusivamente como orquestrador de regras de negócio (\`Core Business Engine\`).
- **Fluxo de Conexão & QR Code**:
  1. Frontend solicita geração de sessão: \`POST /instances/init { instanceName: "caixa-01" }\`.
  2. Whatsmeow gera QR Code em Base64 e transmite via WebSocket/SSE.
  3. Ao ler o QR Code no celular, o Whatsmeow autentica, emite evento de conexão e grava o status na coleção \`whatsapp_sessions\` do Appwrite.
- **Fluxo de Mensagens**:
  * Mensagens recebidas do WhatsApp são enviadas via Webhook interno para o Core Business Engine e persistidas diretamente no Appwrite \`chatboot_db\`.
  * Mensagens enviadas pela UI chamam a API REST do Whatsmeow (\`POST /send/text\`, \`POST /send/media\`).

---
### 📋 Requisitos Técnicos & Regras de Negócio
1. **Zero Locks no Node**: Nenhuma lógica de mutex ou reentrant lock para gerenciar sockets de WhatsApp deve existir no código Node.js.
2. **Ciclo de Vida de Sessão Seguro**: O Whatsmeow Go cuida do keepalive, reconexão automática e reconexão silenciosa sem disparar códigos 409.
3. **Multi-Instâncias**: Suporte nativo a múltiplas instâncias isoladas (ex: FoodNext, Comercial, Financeiro).

---
### 🛠️ Arquivos & Componentes Alvo
- Serviço Go: \`services/whatsmeow-worker/\`
- Serviço Node: \`services/core-business-engine/src/services/whatsmeowClient.js\`
- Frontend: \`src/pages/settings/Connections.tsx\` (leitura de QR Code e status de instâncias)

---
### 🚀 Passo a Passo de Implementação para a IA Desenvolvedora
1. Não importar nem utilizar pacotes \`@whiskeysockets/baileys\` ou \`baileys-core\` no novo projeto.
2. Criar o cliente HTTP/WebSocket para comunicação com a API do Whatsmeow Go.
3. Atualizar a tela de conexões para exibir o QR Code retornado pelo Whatsmeow com timer de atualização.
4. Implementar webhook de ingestão de mensagens (\`/webhook/whatsmeow\`) no Core Business Engine gravando no Appwrite.

---
### 🧪 Critérios de Aceite & Validação (QA)
- [ ] Escanear QR Code: conexão estabelecida em <2 segundos com status conectado gravado no Appwrite.
- [ ] Envio e recebimento bidirecional de mensagens com latência inferior a 500ms.
- [ ] Reiniciar o container do Whatsmeow: reconexão automática sem perda de sessão e sem necessidade de novo QR Code.`
  },
  {
    groupId: 'G11_GEMINI_AI_CIRCUITBREAKER',
    targetCardId: '99a58067-0a72-4dee-8b58-c2b0b28ceb29',
    absorbedCardIds: [
      '0a98efed-8a90-482a-9f5b-9d224213a863',
      '97b004e3-b6c0-467a-8cb3-3cc4ed453f4f',
      'ec05f8c9-536e-4361-9d75-775569165165',
      '21a9471e-d713-4c76-819c-fa086ee179e9',
      '821e2cb3-5b84-4103-a33a-96c41cf79828'
    ],
    title: '[AI Engine Next-Gen] Pool Multi-Keys Gemini, Rotação em Rate Limit e CircuitBreaker Resiliente',
    priority: 1,
    tags: ['NEXT-GEN', 'AI-Engine', 'Gemini', 'Multi-Keys', 'CircuitBreaker', 'Resilience'],
    notes: `### 🎯 Objetivo & Visão Geral
Implementar no microsserviço desacoplado AI Engine uma infraestrutura resiliente de IA baseada na Google Gemini API (modelos \`gemini-2.0-flash\` e \`gemini-1.5-pro\`), com pool de múltiplas chaves de API (\`AIza...\` e \`AQ...\`), rotação automática em caso de erro 429 (rate limit / quota exceeded) e Circuit Breaker inteligente com contingência graciosa.

---
### 🧩 Cartões Legados Consolidados (Pós 15/09)
- Consolida **#44** [\`99a58067\`] e os outros 4 cards repetidos de credenciais Gemini e proteção contra CircuitBreaker (#45, #49, #54, #62).

---
### 🏗️ Contexto Arquitetural no Novo Ecossistema (ChatBoot-New)
- **Serviço**: **AI Engine** (\`https://ai.179.199.142.157.sslip.io\`), microsserviço dedicado a LLM, RAG e automação conversacional.
- **Pool de Credenciais**: O painel de configurações permite cadastrar uma lista de chaves de API do Google AI Studio.
- **Estratégia de Rotação (Round-Robin com Health Tracking)**:
  * O sistema mantém o estado de cada chave: \`status: 'healthy' | 'rate_limited' | 'invalid'\`.
  * Ao receber um erro 429 ou 403, a chave ativa é marcada temporariamente como \`rate_limited\` com cooldown de 5 minutos, e a requisição atual é re-tentada imediatamente na próxima chave saudável do pool sem impactar a resposta do usuário.
- **Circuit Breaker com Mensagem de Contingência**:
  * Se todas as chaves cadastradas esgotarem a cota simultaneamente, o Circuit Breaker entra em estado \`OPEN\` por 2 minutos.
  * O sistema não trava a fila de mensagens e responde com a mensagem de contingência configurada no tenant ("Olá! No momento estamos com alto volume de atendimentos..."), encaminhando o chamado para a fila humana do CRM.

---
### 📋 Requisitos Técnicos & Regras de Negócio
1. **Configuração de Modelo**: Usar primariamente \`gemini-2.0-flash\` (latência <1s e maior throughput).
2. **Timeout Estrito**: 8 segundos por chamada à API Gemini com cancelamento via \`AbortController\`.
3. **Log de Telemetria de Tokens**: Registrar o consumo de tokens de entrada e saída na coleção \`ai_usage_logs\` do Appwrite.

---
### 🛠️ Arquivos & Componentes Alvo
- \`services/ai-engine/src/services/geminiPool.js\`
- \`services/ai-engine/src/services/circuitBreaker.js\`
- \`src/pages/settings/Integrations.tsx\` (gestão das chaves Gemini)

---
### 🚀 Passo a Passo de Implementação para a IA Desenvolvedora
1. Criar a classe \`GeminiKeyPool\` com métodos \`getHealthyKey()\`, \`markRateLimited(key)\` e \`rotateKey()\`.
2. Encapsular as chamadas no Circuit Breaker com estados CLOSED, OPEN e HALF-OPEN.
3. Configurar endpoint \`POST /ai/chat\` no AI Engine recebendo o contexto da conversa e devolvendo o texto de resposta.
4. Adicionar testes unitários simulando retorno 429 e verificando a troca imediata para a chave secundária.

---
### 🧪 Critérios de Aceite & Validação (QA)
- [ ] Chave 1 atinge rate limit: chave 2 assume instantaneamente sem erro para o cliente.
- [ ] Todas as chaves offline: mensagem de contingência é entregue com sucesso e card é aberto para atendente humano.
- [ ] Consumo de tokens visível no dashboard de relatórios.`
  },
  {
    groupId: 'G12_APPWRITE_PERSISTENCE',
    targetCardId: '29f5c615-aaa1-46c9-8451-d87803f90ef5',
    absorbedCardIds: [
      '015f300c-25ed-483b-bf74-7d0dfcb0e6c0',
      '715c8eb5-9219-4c5d-bdce-58c41acfff79',
      '3cdd95ef-0b53-48b6-9959-9bd1662dea31',
      '0b2aebde-5054-4e64-8fbd-91fb0e187ecc',
      '943e1d31-72b7-4a4e-b606-01a32dbf1b8b',
      '17e79cc0-93ad-4a81-8685-9cdb020ac70b'
    ],
    title: '[Arquitetura de Dados Next-Gen] Migração Integral de Queries Supabase para Appwrite Self-Hosted (chatboot_db)',
    priority: 1,
    tags: ['NEXT-GEN', 'Database', 'Appwrite', 'Multi-Tenant', 'Architecture', 'Security'],
    notes: `### 🎯 Objetivo & Visão Geral
Concluir a migração da camada de persistência de dados e queries relacionais do Supabase Cloud para o **Appwrite Self-Hosted** (\`chatboot_db\`) na VPS Hostinger, resolvendo de forma permanente os erros de pool de conexão, dependência de RPCs proprietárias do Postgres e timeouts de rede externa.

---
### 🧩 Cartões Legados Consolidados (Pós 15/09)
- Consolida **#43** [\`29f5c615\`] e os outros 6 cards repetidos de erros de consulta e sincronização Supabase (#50, #51, #53, #55, #61, #63).

---
### 🏗️ Contexto Arquitetural no Novo Ecossistema (ChatBoot-New)
- **Instância**: Appwrite Self-Hosted instalado no Coolify Novo na VPS Hostinger (\`https://api.179.199.142.157.sslip.io\`).
- **Database ID**: \`chatboot_db\`.
- **Coleções Estruturadas**:
  * \`chats\`: Conversas com identificador do contato, canal, status, tags, \`last_message_at\`, \`ai_paused_until\`.
  * \`messages\`: Mensagens enviadas/recebidas com \`client_id\`, \`message_id\`, tipo (texto, áudio, mídia), status e timestamp.
  * \`contacts\`: Cadastro de contatos com nome, telefone, avatar, notas e atributos personalizados.
  * \`crm_boards\` e \`crm_leads\`: Gestão do Kanban de atendimento e desenvolvimento.
  * \`whatsapp_sessions\`: Estado das instâncias do Whatsmeow Go.
- **Segurança & Multi-Tenant**: Uso de **Appwrite Teams** para isolamento estrito por tenant. Todas as queries utilizam \`Query.equal('tenant_id', currentTenantId)\` e permissões de documento restritas à equipe do tenant.

---
### 📋 Requisitos Técnicos & Regras de Negócio
1. **Eliminação de Código Supabase**:
   - Nenhuma chamada a \`supabase.from(...)\` ou \`supabase.rpc(...)\` no projeto \`ChatBoot-New\`.
   - Utilizar exclusivamente o SDK oficial \`appwrite\` (Web e Node).
2. **Appwrite Realtime WebSocket**:
   - Inscrição em canais de coleções específicas com tratamento de reconexão automática e debounce de renderização.
3. **Paginação Eficiente com Queries**:
   - Utilizar \`Query.limit(50)\`, \`Query.orderDesc('created_at')\`, \`Query.cursorAfter(lastDocId)\` para histórico infinito sem sobrecarregar a memória do cliente.

---
### 🛠️ Arquivos & Componentes Alvo
- \`src/services/appwrite.ts\` (inicialização do client e instâncias de Databases, Storage e Teams)
- \`src/services/appwriteChat.ts\` (CRUD de conversas e mensagens)
- \`src/services/appwriteCrm.ts\` (CRUD de quadros e cards do Kanban)

---
### 🚀 Passo a Passo de Implementação para a IA Desenvolvedora
1. Verificar a existência das coleções no database \`chatboot_db\` do Appwrite.
2. Criar wrappers tipados em TypeScript para cada operação do Appwrite Databases.
3. Substituir os listeners do Supabase por \`client.subscribe()\` do Appwrite nos stores do Zustand.
4. Validar que todas as operações respeitam o isolamento multi-tenant via Team IDs.

---
### 🧪 Critérios de Aceite & Validação (QA)
- [ ] Carregamento inicial de conversas e mensagens ocorre 100% via Appwrite em <400ms.
- [ ] Mensagens recebidas em tempo real disparam atualização instantânea da UI via Appwrite Realtime.
- [ ] Zero dependência de Supabase no bundle final gerado pelo Vite.`
  },
  {
    groupId: 'G13_GOVERNANCE_FILA_DEV',
    targetCardId: 'd6058114-d7b7-47e0-b10b-05ba5a1df786',
    absorbedCardIds: ['b21153a2-d977-4a5e-9dd0-92e36f372425'],
    title: '[Governança & Automação] Aprimoramento da Skill \'Fila Dev\' e Análise Visual de Screenshots por IA',
    priority: 3,
    tags: ['NEXT-GEN', 'AI', 'Governance', 'Fila-Dev', 'Superpowers', 'UI/UX-Analysis'],
    notes: `### 🎯 Objetivo & Visão Geral
Consolidar a esteira de desenvolvimento autônomo e governança com a skill 'Fila Dev' e a capacidade de análise multimodal de capturas de tela (screenshots) por IA. O agente deve ser capaz de ler requisições do Kanban, inspecionar imagens e diagramas anexados aos cards, executar o desenvolvimento orientado a testes (TDD) e avançar os cards de forma transparente pelo fluxo de entrega.

---
### 🧩 Cartões Legados Consolidados (Pós 15/09)
- **#15** [\`d6058114\`]: \`[ChatBot] Melhoria da Skill 'Fila Dev' com Gestão de Requisições\`
- **#16** [\`b21153a2\`]: \`[Chat] Otimização de Layout UI/UX via IA com Análise de Screenshots\`

---
### 🏗️ Contexto Arquitetural no Novo Ecossistema (ChatBoot-New)
- **Skill**: \`.agents/skills/fila-dev/\` adaptada para consultar o quadro de Roadmap no Appwrite Database (\`crm_boards\` e \`crm_leads\`).
- **Análise Visual de Imagens**: Capacidade de receber prints anexados aos chamados no Appwrite Storage, analisar discrepâncias de layout, margens, cores e responsividade, e gerar código React/Tailwind com alta fidelidade visual.
- **Integração com Superpowers**: Acionamento automático das skills oficiais \`@skill:systematic-debugging\`, \`@skill:test-driven-development\` e \`@skill:verification-before-completion\`.

---
### 📋 Requisitos Técnicos & Regras de Negócio
1. **Governança Estrita das Colunas**:
   - A IA nunca inicia tarefas na coluna 'Em Análise' (\`analysis\`) sem que o usuário aprove ou mova para 'Em Desenvolvimento' (\`development\`).
   - Cards finalizados recebem sumário de entrega no histórico e são movidos para 'Em Testes & QA' (\`testing\`).
2. **Inspeção de Imagens**:
   - Antes de iniciar qualquer ajuste de UI, a IA baixa e analisa visualmente todos os prints anexados nas notas do card.

---
### 🛠️ Arquivos & Componentes Alvo
- \`.agents/skills/fila-dev/SKILL.md\`
- \`.agents/skills/fila-dev/scripts/get_dev_queue.cjs\`
- \`src/components/crm/KanbanBoard.tsx\`

---
### 🚀 Passo a Passo de Implementação para a IA Desenvolvedora
1. Atualizar os scripts da skill \`fila-dev\` para utilizar o cliente Appwrite do novo projeto.
2. Manter a formatação padronizada de relatórios técnicos de entrega.
3. Testar o comando 'Fila dev' listando e avançando cards no novo quadro.

---
### 🧪 Critérios de Aceite & Validação (QA)
- [ ] Comando 'Fila dev' lista os cards do quadro com visualização das colunas.
- [ ] Transições de status registram histórico de autoria com data/hora e resumo da entrega.`
  }
];

fs.writeFileSync(path.join(__dirname, 'consolidated_13_cards_spec.json'), JSON.stringify(consolidatedGroups, null, 2), 'utf8');
console.log('Saved consolidated_13_cards_spec.json with 13 rich specifications!');
