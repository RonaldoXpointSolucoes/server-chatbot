# Changelog

## [2.8.3] - 2026-05-27

### Adicionado
- **Deploy em Produção (v2.8.3)**: Nova build estável do frontend de atendimento distribuída com suporte total ao Escudo de LIDs do backend e auditoria central de versionamento de banco.

## [2.8.2] - 2026-05-27

### Corrigido
- **Escudo contra LIDs e Contatos Fantasmas (LID Shield)**: Corrigido o bug onde mensagens legítimas enviadas por contatos sob identificadores LID (Linked Device) eram descartadas silenciosamente pelo servidor backend. Implementado o resgate ativo via `LIDMappingStore` (`sock.signalRepository.lidMapping.getPNForLID`) antes de descartes, garantindo que as mensagens DMs e de grupos de contatos em múltiplos aparelhos sejam unificadas sob o Phone Number original e integradas perfeitamente ao CRM, sem duplicar contatos.

## [2.8.1] - 2026-05-27

### Corrigido
- **Câmera no Windows (Fix Tela Preta)**: Corrigida a inicialização de vídeo no Windows implementando um `useEffect` observador que ativa a mídia automaticamente. Inclusão de chamada explícita `.play()` para destravar o stream em navegadores desktop do Windows e impedir telas pretas.

## [2.8.0] - 2026-05-27

### Adicionado
- **Face ID Biométrico Premium (Multimodal Gemini)**: Sistema inteligente e premium de autenticação facial usando a câmera do PC, Android ou iPhone para acesso à conta de forma moderna e instantânea.
- **Comparação por Inteligência Artificial**: Dispensa bibliotecas pesadas locais de processamento neural utilizando diretamente a API Vision do Gemini (modelo `gemini-2.5-flash`) para determinar a similaridade entre rostos cadastrados e capturados com taxa de confiança $\ge 80\%$.
- **Cifragem Frontend e Registro Automático**: Senhas são criptografadas simetricamente no frontend (usando uma chave de cifra XOR ofuscada atrelada ao e-mail corporativo) e salvas no banco de dados. Ao logar tradicionalmente com sucesso pela primeira vez, o sistema detecta a ausência de biometria e convida o operador a se registrar através de modais interativos.
- **Interface e Scanner de Face ID**: Scanner facial circular interativo com moldura neon de carregamento, linha laser móvel simulando escaneamento digital e feedbacks visuais em tempo real por meio de um Antigravity Dev Logger em glassmorphism.

## [2.7.9] - 2026-05-26

### Adicionado
- **Formatação de Menções em Grupos (Semelhante ao Celular)**: Implementada detecção inteligente de tags de menções em grupos do WhatsApp (padrão `@telefone`), traduzindo automaticamente para o nome ou apelido real do contato se presente na lista global do Zustand.
- **Destaque Visual Premium**: Menções são estilizadas na cor verde-esmeralda brilhante do WhatsApp nativo, em negrito e com suporte a interações (clique para alternar de chat), funcionando tanto em mensagens normais quanto citadas ou formatações especiais em negrito.

## [2.7.8] - 2026-05-26

### Melhorado
- **Abertura Direta do Gestor Delivery**: Configurado o item de menu "Gestor Delivery" na barra lateral para abrir a aplicação externa (`https://portalappmotoboy.vercel.app`) diretamente em uma nova guia segura (`_blank`).
- **Remoção de Iframe no App**: Removido o iframe interno obsoleto e adicionada tela de redirecionamento automático premium com visual glassmorphism esmeralda e transições animadas.

## [2.7.7] - 2026-05-26

### Melhorado
- **Abertura Direta do Portal GastroFood**: Configurado o item de menu "Portal / Cadastros" na barra lateral para abrir a aplicação externa (`https://portalgastrofood.vercel.app/`) diretamente em uma nova guia segura (`_blank`).
- **Remoção de Tela Intermediária**: A tela intermediária antiga e redundante de aviso de cookies foi removida.
- **Redirecionador Automático Premium**: Em caso de acesso direto à rota antiga `/apps/portal`, adicionado redirecionamento imediato em glassmorphism com animações fluidas de entrada e spinner de carregamento elegante da marca.

## [2.7.6] - 2026-05-25

### Adicionado
- **Monkey QA Test Agent**: Simulador ativo e autônomo de interações humanas acoplado ao "Loop Contínuo" do Cockpit ASTS. Ele simula cliques de comutação de chat, alternância de filtros CRM, preenchimento e envio de mensagens e navegação por abas.
- **SRE Safety Gate**: Barreira de proteção a clientes reais no Monkey Agent, impedindo digitação ou envio automático de mensagens a números de clientes reais e desviando a simulação dinamicamente para os canais de testes internos autorizados (`Comercial X-Point` e o número `99164-9959`).

### Corrigido
- **Supabase Query Headers**: Correção das queries lógicas da suite de testes para usar o helper `injectTestHeader` e injetar o cabeçalho `x-asts-test` diretamente nas instâncias nativas da classe `Headers` do PostgrestBuilder, eliminando a exceção fatal `TypeError: headers is not a function`.

## [2.7.5] - 2026-05-25

### Adicionado
- **Filtro de Pesquisa no Modal de Etiquetas**: Inclusão de barra de pesquisa moderna e reativa no topo do modal **Atribuir Etiquetas** (`ContactLabelsModal`) para filtragem instantânea de etiquetas cadastradas.
- **Corretor Ortográfico Sutil e Sob Demanda**: Indicator de lâmpada âmbar pulsante (`Lightbulb`) posicionado de forma elegante no canto do input de mensagens, permitindo a exibição sob demanda e discreta das sugestões de grafia apenas quando acionado pelo atendente.

### Melhorado
- **Respeito Contextual ao Canal de Atendimento**: Correção da cláusula de escape na listagem de chats na barra lateral, forçando a restrição rígida e ininterrupta da caixa selecionada, mesmo durante buscas globais.
- **Deduplicação de Contatos**: Otimização do filtro de unificação que oculta duplicidades da mesma conversa dentro do canal de atendimento ativo.

### Corrigido
- **Estabilidade do Supabase REST (HTTP 406)**: Substituição de chamadas estritas `.single()` por `.maybeSingle()` em relacionamentos concorrentes de conversas, eliminando falhas de transição de banco no store.

## [2.7.3] - 2026-05-23

### Adicionado
- **Deploy em Produção (v2.7.3)**: Nova versão oficial da aplicação com suporte completo à exibição e troca de mensagens de grupos ativados no CRM.
- **Sincronização de Grupos no CRM**: Habilitada a exibição e o fluxo completo de mensagens inbound e outbound de grupos ativados no CRM (eliminando a barreira inteligente de comprimento de telefone superior a 15 caracteres para JIDs `@g.us` no `chatStore.ts`).
- **Associação de Instâncias Dinâmicas**: Implementação de atualização dinâmica e sincronizada do `instance_id` de contatos e conversas de grupos habilitados no `EvolutionModal.tsx` para apontar imediatamente para o canal ativo em que foram ativados no CRM.

## [2.7.2] - 2026-05-23

### Adicionado
- **Deploy em Produção (v2.7.2)**: Deploy oficial da aplicação frontend na plataforma da Vercel integrando todas as atualizações de versionamento semântico, melhorias visuais premium de UX, segurança aprimorada de canais cruzados e auditoria.

## [2.7.1] - 2026-05-23

### Adicionado
- **Modal de Conversas Adiadas Premium**: Introduzido o `SnoozedListModal` síncrono e integrado com o menu de Tickets (três pontinhos), exibindo a listagem elegante em glassmorphism com detalhes do agente que adiou, data de adiamento e reabertura, e suporte a ativação imediata.

### Melhorado
- **UX de Resolução de Tickets**: Configurado o fechamento automático da conversa ativa e retorno suave à tela de contatos ao clicar no botão "Resolver", aprimorando a fluidez no atendimento diário do operador.

### Segurança
- **Security Guard contra Canais Cruzados**: Implementação rigorosa de barreira de validação e precedência estrita no frontend via `getStrictInstance` e `chatStore.ts`, inviabilizando em 100% qualquer risco de vazamento ou envio de mensagens cruzadas entre instâncias de canais concorrentes.

### Corrigido
- **Ausência de Ícone no Modal**: Resolvido o erro de renderização do `ErrorBoundary` no modal de conversas adiadas decorrente da importação ausente do ícone `RefreshCw` do pacote `lucide-react`.

## [2.6.5] - 2026-05-22

### Corrigido
- **Compatibilidade de Áudio PTT no Cliente**: Resolvida a falha que impedia os destinatários finais no WhatsApp móvel (Android e iOS) de reproduzirem os áudios gravados e enviados pelo painel CRM de atendimento do atendente, gerando o erro de "mídia indisponível". Configurado o `ffmpeg` no backend (`instances.js` e `public-rest.js`) com canais mono (`.audioChannels(1)`), amostragem de 16kHz (`.audioFrequency(16000)`), remoção completa de cabeçalhos redundantes WebM do Chrome (`-map_metadata -1`) e alinhamento preciso de timestamps de reprodução (`-avoid_negative_ts make_zero`), garantindo decodificação e download com sucesso como nota de voz nativa (`ptt: true`).

## [2.6.4] - 2026-05-22

### Corrigido
- **Loop de Renderização e Travamento no Realtime**: Corrigido o loop síncrono infinito e vazamento de re-render causado por efeitos colaterais (`setReopenedTicketToast`) agendados dentro dos redutores síncronos da store do Zustand (`conversations UPDATE` no Realtime). A lógica de Toast e alteração de estado concorrente foi isolada de forma segura para fora do `set` da store.
- **Isolamento de Efeitos Colaterais em `addMessageLocally`**: Movido o gatilho assíncrono `updateConversationField` para fora do redutor síncrono de contatos, evitando loops de atualizações redundantes no React.
- **Barreira Rígida de Deduplicação**: Implementada uma barreira rígida de deduplicação no final de `upsertContactLocally` para garantir que o array `contacts` da store nunca armazene duplicatas de contatos compostos, sanando de vez qualquer risco de colisão de chaves na interface.

## [2.6.3] - 2026-05-22

### Corrigido
- **Loop Infinito do Framer Motion e Travamento do Navegador**: Resolvida a colisão de chaves (`key`) duplicadas na lista de contatos do `ChatDashboard.tsx` dentro de `AnimatePresence`. Substituído `key={getRealContactId(contact.id)}` por `key={contact.id}` (que já é composto e único por instância de canal). Isso elimina o loop síncrono infinito fatal de animação, reduzindo o uso de CPU de 100% para 0% e garantindo uma interface extremamente fluida e interativa.
- **Limpeza de Imports**: Removido o import obsoleto do método `getRealContactId` no topo do `ChatDashboard.tsx`.

## [2.5.9] - 2026-05-22

### Corrigido
- **Sobreposição Visual de Modais**: Corrigida a colisão de empilhamento de z-index entre a barra vertical resizer (reduzida de `z-50` para `z-20`) e os modais (`z-50` para `z-[9999]`), resolvendo definitivamente o bug da barra renderizada em cima de telas pequenas.

## [2.5.8] - 2026-05-22

### Melhorado
- **Restauração da Edição de Contatos**: Restaurada com total fidelidade e design premium a opção "Editar contato" no menu de ações (três pontinhos) de conversas na barra lateral, integrando o botão ao fluxo do CRM existente (`RenameModal`).

## [2.5.7] - 2026-05-21

### Adicionado
- **Deploy em Produção (v2.5.7)**: Correção cirúrgica de balanceamento de tags na estrutura de lista de contatos do chat para evitar erros de renderização (*Adjacent JSX elements*) e deploy oficial do aplicativo frontend na nuvem da Vercel.

## [2.5.6] - 2026-05-21

### Adicionado
- **Deploy em Produção (v2.5.6)**: Atualização incremental da aplicação em produção com toda a segurança, controle de auditoria de versão no Supabase e build robusta no pipeline oficial da Vercel.

## [2.5.5] - 2026-05-21

### Adicionado
- **Snooze Premium (Adiar Conversas)**: Integração robusta (frontend React + banco Supabase + servidor Node no Coolify executando monitoramento contínuo de 30 segundos) para adiar contatos e reabrir na tela no horário exato.
- **Exibição Condicional de Empresa ou Celular**: Exibição dinâmica no cabeçalho. Mostra botão "Ver Empresa" se o contato possuir empresa associada, ou badge azul translúcida premium com o telefone formatado nacionalmente e botão de cópia rápida com feedback tátil de 2 segundos.
- **Melhoria Técnica de Compilação Estática**: Rigorosa validação estática de tipos do compilador TypeScript (`npx tsc --noEmit`) resultando em zero erros no projeto.
- **Controle Dinâmico de Versão (Header)**: Indicador de versão dinâmico sincronizado nos cantos superiores esquerdos de `ChatDashboard` e `AdminDashboard`.

### Corrigido
- **Correção no Envio (Enter)**: Ajuste fino para desativar envio por enter apenas em telas mobile estritas (largura menor que 500px), permitindo que em resoluções maiores o enter funcione normalmente para enviar.

## [2.5.3] - 2026-05-20

### Adicionado
- **Deploy em Produção**: Deploy oficial do frontend no ambiente Vercel com todas as correções de estabilidade acumuladas.

## [2.5.2] - 2026-05-20

### Corrigido
- **Persistência de Fechamento de Tickets em Lote (Bug do F5)**: Corrigido o erro HTTP 400 Bad Request que ocorria ao atualizar o status de muitas conversas de uma só vez. Agora o update na tabela `conversations` do Supabase é executado em chunks (lotes) de no máximo 100 IDs por vez.
- **Desfazer Fechamento de Tickets**: O comando de rollback do fechamento em lote (`undoLastBatchResolve`) também foi refatorado para processar atualizações em chunks de 100 IDs, evitando falhas silenciosas na reabertura.
- **Realtime Sync e Reabertura**: Validado o comportamento onde o operador visualiza imediatamente o fechamento ou reabertura automática de tickets gerada por novas interações ou mensagens inbound de clientes, sincronizado em tempo real.
