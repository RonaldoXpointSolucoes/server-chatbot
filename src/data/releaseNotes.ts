export interface ReleaseNoteItem {
  id: string;
  category: 'features' | 'fixes' | 'improvements';
  title: string;
  description: string;
  tag: string;
  badgeColor: string;
}

export interface VersionRelease {
  version: string;
  date: string;
  summary: string;
  notes: ReleaseNoteItem[];
}

/**
 * Catálogo histórico oficial de releases reais do ChatBoot.
 * Ordenado do mais recente para o mais antigo.
 */
export const APP_RELEASES: VersionRelease[] = [
  {
    version: '7.7.3',
    date: '2026-10-06',
    summary: 'Automação Dual em Robôs: Fluxos Estilo Typebot sem I.A. e Suporte a Subfluxos Modulares',
    notes: [
      {
        id: '7.7.3-1',
        category: 'features',
        title: 'Master Switcher na Tela de Robôs: I.A. vs Fluxos Typebot',
        description: 'Implementado seletor mestre no cabeçalho de Robôs separando de forma clara e isolada os Robôs com I.A. (Gemini / RAG) dos Fluxos de Automação Visual (Estilo Typebot sem I.A.), sem conflitos operacionais.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.7.3-2',
        category: 'features',
        title: 'Painel Gerenciador de Fluxos de Automação (Typebot)',
        description: 'Criado painel completo com métricas operacionais (0 Tokens de IA), status ativo/rascunho, atalhos para construtor visual, teste via simulador, clonagem e importação direta de arquivos .json do Typebot.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.7.3-3',
        category: 'features',
        title: 'Modularidade: Um Fluxo Chamando Outro (Subfluxos)',
        description: 'Adicionado suporte nativo no FlowBuilder e no Simulador para blocos do tipo Chamar Outro Fluxo (Subfluxo), permitindo encadear fluxos independentes de forma modular e escalável.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
      },
      {
        id: '7.7.3-4',
        category: 'improvements',
        title: 'Otimização de Limite de Cache do Service Worker (PWA)',
        description: 'Expandido o limite de precache no Vite PWA para 8MB, garantindo compilações e atualizações estáveis sem avisos de assets excedentes.',
        tag: 'MELHORIA',
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
      }
    ]
  },
  {
    version: '7.7.2',
    date: '2026-10-06',
    summary: 'Correção Imediata do Import de useCallback no ChatDashboard',
    notes: [
      {
        id: '7.7.2-1',
        category: 'fixes',
        title: 'Correção do Import de useCallback no ChatDashboard',
        description: 'Resolvido o ReferenceError que impedia a renderização do ChatDashboard devido à ausência do import de useCallback na desestruturação do React.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      }
    ]
  },
  {
    version: '7.7.1',
    date: '2026-10-06',
    summary: 'Estabilização do Modo Ticket: Persistência do Histórico Anterior sem Fechamento Automático',
    notes: [
      {
        id: '7.7.1-1',
        category: 'fixes',
        title: 'Fim do Fechamento Involuntário de Mensagens Anteriores no Modo Ticket',
        description: 'Eliminado o efeito colateral no ChatDashboard que forçava o filtro para "today" a cada sincronização ou ciclo de polling de contatos a cada 40-50s. Agora o filtro só é alterado quando o operador realmente alternar a chave do Modo Ticket.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.7.1-2',
        category: 'improvements',
        title: 'Persistência do Histórico Expandido por Conversa até a Resolução',
        description: 'Implementado rastreador por chat que memoriza quais conversas tiveram o histórico expandido ("Ver Anteriores"), mantendo as mensagens abertas e sem interrupção de áudios até que a conversa seja resolvida ou encerrada.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.7.1-3',
        category: 'improvements',
        title: 'Acesso Rápido ao Controle do Histórico no Separador de Hoje',
        description: 'O botão de alternância do Modo Ticket agora também é exibido no divisor de data de HOJE quando todo o histórico estiver visível, facilitando o recolhimento sem a necessidade de rolar até o topo da conversa.',
        tag: 'MELHORIA',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      }
    ]
  },
  {
    version: '7.7.0',
    date: '2026-10-05',
    summary: 'Correção de Reconciliação Otimista e Exibição Sequencial Fluida de Múltiplos Arquivos e Mensagens no Chat',
    notes: [
      {
        id: '7.7.0-1',
        category: 'fixes',
        title: 'Eliminação de Sobrescrita de Arquivos no Envio Múltiplo',
        description: 'Correção crítica no addMessageLocally do chatStore que considerava novas mensagens otimistas de documentos como confirmações, fazendo com que arquivos subsequentes (ex: propostas) substituíssem visualmente os cards de arquivos anteriores no feed.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.7.0-2',
        category: 'fixes',
        title: 'Blindagem da Janela de Reconciliação e Mensagens Confirmadas',
        description: 'Removida a condição que permitia que mensagens confirmadas do banco fossem sobrescritas por novas mensagens em até 45s. Apenas mensagens de fato pendentes/otimistas podem ser reconciliadas por correspondência de URL ou nome do arquivo.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.7.0-3',
        category: 'improvements',
        title: 'Fim do Descarte Arbitrário de Mensagens Rápidas e Desduplicação Inteligente',
        description: 'Eliminado o descarte de 35s por texto idêntico que causava atraso ou sumiço temporário de mensagens legítimas repetidas (ex: "ok", "sim"). Refinamento na 2ª e 3ª camada de renderização do ChatDashboard para preservar arquivos e mensagens consecutivas com segurança.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.6.9',
    date: '2026-10-04',
    summary: 'Compatibilidade Plena com Chaves Oficiais Google Formatos AQ. e AIza, Fallback Mestre Resiliente e Estabilização do Criador Multimodal de Cards',
    notes: [
      {
        id: '7.6.9-1',
        category: 'fixes',
        title: 'Suporte Nativo a Chaves Google Formato AQ. e AIza no Gemini Service',
        description: 'Correção no validador de chaves do Gemini que bloqueava chaves oficiais iniciadas por "AQ." (padrão Google Cloud / Vertex AI e chaves de contingência mestre), eliminando o alerta "Chave de API do Gemini não configurada".',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.6.9-2',
        category: 'improvements',
        title: 'Resiliência com Auto-Contingência na Geração Multimodal do Kanban',
        description: 'Implementado mecanismo de auto-recuperação transparente na geração de planos com IA: em caso de falha de autenticação ou expiração da chave ativa, o sistema aciona automaticamente a contingência sem interrupção para o usuário.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.6.9-3',
        category: 'improvements',
        title: 'Refinamento das Telas de Credenciais e Testes de Conexão',
        description: 'Ajustes nos painéis de Configurações da Empresa e Auditoria de Chaves para refletir o reconhecimento dos padrões AIzaSy... e AQ.... com validação em tempo real.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.6.8',
    date: '2026-10-04',
    summary: 'Integração Completa do Framework Superpowers (15 Skills) ao Criador Multimodal de Cards com IA do Kanban, Catálogo Visual Interativo e Protocolo de Execução Técnica na Fila Dev',
    notes: [
      {
        id: '7.6.8-1',
        category: 'features',
        title: 'Diagnóstico e Ativação de Skills do Superpowers via IA Multimodal',
        description: 'O Gemini 2.5 analisa agora todas as entradas do Kanban (áudio gravado por voz, texto descritivo, prints de tela e vídeos de demonstração) e seleciona de 1 a 4 skills do Superpowers ideais para guiar a solução (ex: systematic-debugging, test-driven-development, verification-before-completion).',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.6.8-2',
        category: 'features',
        title: 'Catálogo Visual Interativo de Skills no Modal Multimodal',
        description: 'Novo painel dinâmico no modal do Kanban exibindo badges das skills selecionadas, botão interativo para adicionar/remover habilidades do catálogo oficial de 15 skills e a Justificativa Técnica da IA.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.6.8-3',
        category: 'improvements',
        title: 'Protocolo de Execução de Skills Injetado nas Notas do Card',
        description: 'Os cards gerados armazenam no campo de notas a seção estruturada com comandos @skill:id e critérios práticos para que desenvolvedores e IAs da Fila Dev executem com qualidade sênior.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.6.8-4',
        category: 'improvements',
        title: 'Extração Automática de Skills Recomendadas na Fila Dev',
        description: 'O script get_dev_queue.cjs agora extrai o array recommended_skills de cada card, integrando a esteira autônoma às diretrizes mandatórias do framework Superpowers.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.6.7',
    date: '2026-10-04',
    summary: 'Correção de Visibilidade do Feed Geral ao Selecionar Todas as Caixas, Empty State Educativo para Minhas Conversas e Redimensionamento Perfeito do Popover de Caixas no Desktop',
    notes: [
      {
        id: '7.6.7-1',
        category: 'fixes',
        title: 'Restauração do Feed Geral ao Clicar em "Todas as Caixas"',
        description: 'Ao selecionar a opção "Todas as Caixas" no seletor rápido ou no menu de canais, o sistema agora reseta automaticamente o filtro de atendente para o feed global (filterType: all), exibindo todas as conversas sem travamentos.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.6.7-2',
        category: 'features',
        title: 'Empty State Educativo com Ação Rápida em "Minhas Conversas"',
        description: 'Quando o atendente estiver com o filtro "Minhas conversas" ativo mas não possuir mensagens direcionadas a ele, a tela agora exibe uma mensagem acolhedora com o botão direto "[Ver Todas as Conversas]" para alternar o feed em 1 clique.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.6.7-3',
        category: 'fixes',
        title: 'Redimensionamento Perfeito do Popover de Caixas no Desktop (Zero Cortes)',
        description: 'O dropdown de caixas de entrada na versão desktop foi recalculado para maxWidth: 300px, ficando 100% contido dentro da coluna de 320px, garantindo que switches, tags de status e o botão "Concluir" nunca mais sejam cortados pela metade.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.6.7-4',
        category: 'improvements',
        title: 'Transparência no Botão de Caixa da Barra Superior',
        description: 'Quando o filtro de atendente estiver ativo, o botão superior reflete o estado real exibindo "Todas as Caixas (Minhas)", eliminando ambiguidades entre filtros de caixa e filtros de operador.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.6.6',
    date: '2026-10-04',
    summary: 'Refatoração Responsiva Mobile-First do Painel de Caixas de Entrada (Bottom Sheet), Otimização da Barra de Tickets e Eliminação de Cortes em Dispositivos Móveis',
    notes: [
      {
        id: '7.6.6-1',
        category: 'features',
        title: 'Seletor de Caixas de Entrada Adaptativo (Mobile Bottom Sheet & Desktop Popover)',
        description: 'Em smartphones e telas compactas, o seletor de caixas agora abre como um Bottom Sheet Modal nativo com backdrop blur, puxador ergonômico, espaçamento generoso e botão de submissão full-width de 48px com feedback tátil.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.6.6-2',
        category: 'improvements',
        title: 'Ergonomia & Respiro Visual dos Controles Rápidos',
        description: 'Redistribuição flexível da barra de ferramentas rápida (Tickets e Caixas de Entrada) com proporção equilibrada e padding responsivo, impedindo truncamento do rótulo de tickets para "Tick...".',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.6.6-3',
        category: 'fixes',
        title: 'Eliminação Completa de Cortes e Overflow Lateral no Mobile',
        description: 'Correção de transbordamento horizontal de switches, tags de conexão "Online" e do botão "Concluir", garantindo que 100% dos elementos estejam visíveis e operáveis em qualquer celular ou tablet.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.6.6-4',
        category: 'improvements',
        title: 'Badge de Ambiente Responsivo no Topo da Sidebar',
        description: 'Badge de servidor otimizado para exibir "PROD/ALF" em telas móveis e "PRODUÇÃO/ALFA" no desktop, evitando espremedura dos botões de nova conversa, IA, tema e menu lateral.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.6.5',
    date: '2026-10-04',
    summary: 'Player de Áudio Premium Glassmorphism com Transcrição IA, Gravação Otimizada com Codecs Nativos, Blindagem de CircuitBreaker e Eliminação de Erros 400 Bad Request no Supabase',
    notes: [
      {
        id: '7.6.5-1',
        category: 'features',
        title: 'Player de Áudio Premium Glassmorphism & Transcrição IA',
        description: 'Novo componente AudioPlayerBubble com controles táteis (botão play/pause circular 40px+, barra de progresso suave, velocidades 1x/1.5x/2x, formatação de tempo e transcrição por IA integrada com botão de cópia rápida).',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.6.5-2',
        category: 'improvements',
        title: 'Gravação de Áudio de Alta Fidelidade (Echo Cancellation & Codecs Nativos)',
        description: 'Gravação web refatorada com cancelamento de eco, supressão de ruído e ganho automático, suporte dinâmico a codecs WebM/OGG Opus e timeslice incremental de 250ms, eliminando truncamento de final de áudio no mobile.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.6.5-3',
        category: 'fixes',
        title: 'Eliminação de Erros 400 Bad Request no Supabase PostgREST',
        description: 'Sanitização estrita com validação Regex de UUID em consultas por conversation_id no ChatDashboard, ChatModals e chatStore, impedindo que parâmetros vazios ou não-UUID sejam enviados ao banco de dados.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.6.5-4',
        category: 'fixes',
        title: 'Blindagem de CircuitBreaker e Validação Oficial de Chaves Gemini',
        description: 'Detecção imediata de erros 400/401/chaves inválidas sem retries transitórios desnecessários em agent.js e geminiService.ts, protegendo o disjuntor do worker e ativando contingência heurística sem interrupção de atendimento.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      }
    ]
  },
  {
    version: '7.6.4',
    date: '2026-10-04',
    summary: 'Novo Ícone Oficial PWA 3D Glassmorphism no Android, Eliminação do Loop "Carregando..." e Otimização da Sidebar Mobile',
    notes: [
      {
        id: '7.6.4-1',
        category: 'features',
        title: 'Nova Identidade Visual Oficial PWA & Android (3D Glassmorphism)',
        description: 'Substituição integral de todos os ícones PWA (72x72 até 1024x1024, maskable, apple-touch-icon e favicon), aposentando o ícone antigo laranja e ativando a nova marca tridimensional em vidro com nós inteligentes e checkmark verde.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.6.4-2',
        category: 'fixes',
        title: 'Eliminação Definitiva do Estado "Carregando..." no Mobile',
        description: 'Correção arquitetural no chatStore e MainSidebar com hidratação síncrona e resiliente do tenant ativo a partir do storage. Não bloqueia mais o carregamento inicial de tickets e contatos aguardando auth.getUser(), exibindo imediatamente o nome correto da empresa (X-Point Soluções).',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.6.4-3',
        category: 'improvements',
        title: 'Fluidez da Sidebar no Celular com Botão Fechar e Toque Direto',
        description: 'Inclusão de botão dedicado "X" no topo da sidebar em dispositivos móveis e recolhimento automático da barra lateral ao tocar em qualquer caixa de WhatsApp ou filtro de conversas, liberando instantaneamente a visualização da tela de chat.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.6.3',
    date: '2026-10-01',
    summary: 'Diagnóstico Transparente de Erros no Login (Supabase Quota 402 vs Coolify), Modal de Saúde da Infraestrutura e Otimização do Consumo Realtime',
    notes: [
      {
        id: '7.6.3-1',
        category: 'features',
        title: 'Diagnóstico Inteligente de Infraestrutura & LoginErrorAlert',
        description: 'Implementado card rico de diagnóstico no Workspace Login que identifica a causa raiz exata de falhas de autenticação (Cota Excedida / HTTP 402 do Supabase, instabilidade de servidor, rede ou credenciais incorretas), com link direto para o Faturamento e detalhes técnicos da API.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.6.3-2',
        category: 'features',
        title: 'Modal de Saúde dos Servidores em Tempo Real (InfraHealthModal)',
        description: 'Novo botão no login que executa testes de ping simultâneos no Supabase Cloud, no motor WhatsApp (Coolify Node.js) e na conexão de internet, emitindo um veredito automático para que o usuário saiba exatamente qual serviço está com instabilidade.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.6.3-3',
        category: 'improvements',
        title: 'Otimização e Estancamento de Quota Realtime no Frontend',
        description: 'Aplicados filtros estritos por tenant (tenant_id=eq...) e debounces de 1,5s nos canais Realtime de instâncias de WhatsApp no MainSidebar, InstancesDashboard, InboxesList e InstanceManager, prevenindo tempestades de mensagens causadas pelo heartbeat a cada 15s.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.6.2',
    date: '2026-10-01',
    summary: 'Filtro Multicanal de Caixas de Entrada com Switches Interativos, Dual-Indicator de Status e Glassmorphism SaaS Premium',
    notes: [
      {
        id: '7.6.2-1',
        category: 'features',
        title: 'Monitoramento Multicanal com Switches Toggles Individuais',
        description: 'Implementado seletor multicanal com switches interativos ao lado de cada caixa de entrada, permitindo monitorar conversas de duas, três ou mais caixas simultaneamente com persistência local instantânea.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.6.2-2',
        category: 'improvements',
        title: 'Dual-Indicator: Separação de Identidade da Caixa vs. Status Operacional',
        description: 'Desacoplada a cor de identidade do canal do status real de conexão. Cada caixa possui avatar colorido estilizado e indicador independente de status operacional (Online verde com ping, Âmbar conectando e Offline vermelho).',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.6.2-3',
        category: 'improvements',
        title: 'Design System SaaS Premium & Contador de Conexão em Tempo Real',
        description: 'Menu suspenso de Caixas de Entrada modernizado com Glassmorphism de alta densidade (backdrop-blur-2xl), contador dinâmico de instâncias online no cabeçalho e botão de conclusão rápida sem fechamento involuntário.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.6.1',
    date: '2026-10-01',
    summary: 'Estabilidade de Ordenação no Chat ao Resolver Tickets, Respostas Prontas antes das Pastas e Persistência do Kanban',
    notes: [
      {
        id: '7.6.1-1',
        category: 'fixes',
        title: 'Estabilidade da Ordem da Lista de Chats ao Resolver Tickets',
        description: 'Refatoração da função getEffectiveContactTime para desconsiderar estritamente mensagens de sistema (resoluções individuais ou em lote) no cálculo de tempo de ordenação, impedindo que contatos saltem indevidamente para o topo da lista de chats após resolução.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      },
      {
        id: '7.6.1-2',
        category: 'improvements',
        title: 'Inversão da Ordem: Mensagens Prontas antes das Pastas',
        description: 'No modal de respostas rápidas acionado ao digitar "/" no chat, as respostas prontas agora são renderizadas prioritariamente no topo, seguidas pelas pastas e projetos, acelerando a dinâmica do atendimento.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.6.1-3',
        category: 'features',
        title: 'Persistência Multidispositivo da Dobra de Colunas do Kanban',
        description: 'O estado de recolhimento das colunas do quadro CRM Kanban passa a ser sincronizado na nuvem (crm_boards.config por usuário) em conjunto com o cache local, mantendo a visualização idêntica entre computadores e navegadores.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.6.1-4',
        category: 'improvements',
        title: 'Resiliência de Abas em Segundo Plano & Supabase Circuit Breaker',
        description: 'Aprimorado o monitoramento de conexão com o Supabase para evitar desconexões ou falsos alarmes de instabilidade quando a aba do navegador entra em suspensão em segundo plano.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.6.0',
    date: '2026-09-30',
    summary: 'Eliminação Definitiva de Duplicidade Visual de Mensagens e Tripla Blindagem de Renderização',
    notes: [
      {
        id: '7.6.0-1',
        category: 'fixes',
        title: 'Tripla Blindagem contra Duplicidade Visual de Mensagens',
        description: 'Eliminação definitiva do problema onde uma mensagem enviada aparecia duplicada na tela antes do F5. Reconciliação inteligente com normalização universal de assinaturas, remoção de mensagens órfãs e descarte de duplicatas consecutivas.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      },
      {
        id: '7.6.0-2',
        category: 'improvements',
        title: 'Vínculo Único e Reconciliação Determinística (pseudoId)',
        description: 'Introdução de identificador único persistente (pseudoId) para todas as mensagens de envio humano e mídias, garantindo que respostas assíncronas do Realtime e HTTP substituam com exatidão a mensagem otimista sem gerar balões duplicados.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.6.0-3',
        category: 'improvements',
        title: 'Normalizador Universal de Texto e Assinatura de Atendentes',
        description: 'Novo algoritmo resiliente capaz de reconhecer e desduplicar mensagens com qualquer formato de assinatura de atendente, quebras de linhas duplas, citações de conversa e formatação rica em Markdown.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.5.9',
    date: '2026-09-29',
    summary: 'Refatoração de UI/UX do Fluxo de Chamados, Novo TicketSummaryStatus e Otimização do Kanban',
    notes: [
      {
        id: '7.5.9-1',
        category: 'features',
        title: 'Visão Simplificada de Chamado (TicketSummaryStatus)',
        description: 'Nova visão estruturada no modal de chamados separando de forma cristalina "Solicitação Original" e "Resolução & Entrega", com visualização sem cortes, cópia em 1 clique e atalhos rápidos.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.5.9-2',
        category: 'improvements',
        title: 'Abertura Direta na Visão do Chamado e Mobile-First Ergonômico',
        description: 'Qualquer card agora abre instantaneamente na aba de Visão do Chamado, com botões ergonômicos de toque (≥ 44px), feedback tátil (active:scale-95) e formato Bottom Sheet para smartphones.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.5.9-3',
        category: 'fixes',
        title: 'Eliminação de Cortes no Resumo e no Botão Avançar dos Cards do Kanban',
        description: 'Correção do truncamento vertical de linhas no resumo executivo (summarySnippet) e calibração das dimensões dos botões no rodapé da etapa de testes (Devolver, Validar, Avançar), eliminando vazamento de borda e cortes.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      }
    ]
  },
  {
    version: '7.5.8',
    date: '2026-09-29',
    summary: 'Base de Conhecimento & Contexto do Projeto (IA Skill) por Quadro Kanban',
    notes: [
      {
        id: '7.5.8-1',
        category: 'features',
        title: 'Base de Conhecimento & Contexto do Projeto para Criação de Cards com IA',
        description: 'Módulo dedicado (CrmProjectKnowledgeModal) para cadastrar e gerenciar a documentação técnica, stack, regras de negócio e objetivos do projeto por quadro, alimentando o Gemini com contexto de verdade absoluta.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.5.8-2',
        category: 'features',
        title: 'Assistente de IA para Estruturação da Documentação Técnica',
        description: 'Botão "Estruturar com IA" que transforma anotações e rascunhos livres em documentações técnicas profissionais completas (Stack, Propósito, Módulos, Regras de Negócio e Padrões de Código).',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.5.8-3',
        category: 'improvements',
        title: 'Transparência de Contexto no Modal de Criação Multimodal e Barra Superior',
        description: 'Novo botão de atalho [ 📚 Contexto IA ] na toolbar do Kanban e banner informativo em tempo real dentro do modal Criar com Áudio & IA, exibindo o status de contexto ativo e contagem de palavras.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.5.7',
    date: '2026-09-29',
    summary: 'Criador de Skill para IAs, API REST Oficial por Quadro Kanban e Governança Estrita da Fila Dev',
    notes: [
      {
        id: '7.5.7-1',
        category: 'features',
        title: 'Criador de Skill & Conhecimento Técnico para IAs (Claude, Cursor, ChatGPT, Codex)',
        description: 'Gerador em tempo real de especificações completas em Markdown (SKILL.md) que ensinam qualquer IA externa a operar o quadro Kanban via API REST com chave bearer embutida, mapeamento de colunas e botões de 1 clique para Copiar e Baixar .md.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.5.7-2',
        category: 'features',
        title: 'Painel e Modal de Acesso à API REST no Quadro Kanban',
        description: 'Interface avançada para habilitar/desabilitar acesso externo por quadro, gerar chaves de API secretas (x-api-key), mapear IDs das colunas e testar requisições em terminal interativo cURL, Node.js e Python com AI Pack multimodal.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.5.7-3',
        category: 'improvements',
        title: 'Governança Inviolável da Fila Dev e Migração Automática para QA',
        description: 'Definição rigorosa no protocolo de IA: foco exclusivo na lista "Em Desenvolvimento", bloqueio estrito da lista "Em Análise" (somente leitura), e obrigatoriedade de documentar a entrega técnica antes de migrar o card para "Em Testes & QA".',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.5.6',
    date: '2026-09-29',
    summary: 'Resolução Definitiva de Mensagens Duplicadas no Envio, Resiliência Silenciosa do Supabase e Restauração de Rascunho',
    notes: [
      {
        id: '7.5.6-1',
        category: 'fixes',
        title: 'Eliminação da Duplicação Visual de Mensagens no Envio',
        description: 'Implementada reconciliação in-place no chatStore (addMessageLocally) com suporte a normalização de texto sem assinaturas de atendentes, absorção imediata de mensagens otimistas pelo Realtime e prevenção de bolhas duplicadas transitórias.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.5.6-2',
        category: 'improvements',
        title: 'Resiliência de Rede e Silenciamento de Micro-Oscilações no Supabase',
        description: 'Adicionado controle de throttling no customFetch com backoff exponencial para amortecer micro-quedas de rede sem disparar enxurradas de warnings repetitivos no console e no DevLogger.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.5.6-3',
        category: 'features',
        title: 'Restauração Resiliente de Mensagem Estilo ChatGPT',
        description: 'Preservação automática e instantânea do texto digitado no campo de mensagem caso ocorra qualquer instabilidade de conexão, com banner superior intuitivo para reenvio imediato.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      }
    ]
  },
  {
    version: '7.5.5',
    date: '2026-09-28',
    summary: 'Blindagem contra Envio Duplicado de Mensagens no WhatsApp e Resiliência Global da Magia da IA',
    notes: [
      {
        id: '7.5.5-1',
        category: 'fixes',
        title: 'Blindagem Definitiva contra Envio Duplicado de Mensagens',
        description: 'Implementada trava temporal de idempotência de 4 segundos na store central (chatStore.ts) associada a controle assíncrono estrito, limpeza imediata síncrona do DOM e bloqueio de repetição de tecla (e.repeat) e mouse bouncing.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.5.5-2',
        category: 'fixes',
        title: 'Resolução do Corretor Ortográfico e Menus de IA',
        description: 'Eliminado o alerta de chave ausente através de sincronização de credenciais no banco Supabase para todos os tenants e adição de fallback mestre permanente de nível 5 no GeminiService.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.5.5-3',
        category: 'improvements',
        title: 'Otimização dos Prompts da Magia da IA',
        description: 'Prompts reestruturados para retornar textos limpos, diretos e naturais, sem preâmbulos ou notas de revisão, otimizados para o modelo gemini-2.5-flash.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.5.4',
    date: '2026-09-21',
    summary: 'Suporte Oficial às Chaves de Autenticação AQ. do Google AI Studio, Correção Ortográfica e Resiliência da Magia da IA',
    notes: [
      {
        id: '7.5.4-1',
        category: 'features',
        title: 'Suporte ao Novo Padrão de Chaves AQ. do Google AI Studio',
        description: 'Compatibilidade completa e nativa com as novas chaves de autenticação de alta segurança do Google AI Studio (prefixo AQ.), enviando cabeçalhos oficiais x-goog-api-key.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.5.4-2',
        category: 'improvements',
        title: 'Validação Fluida de Chave Gemini nas Configurações',
        description: 'Eliminação de bloqueios indevidos no salvamento de chaves nas Configurações da Empresa, com mensagens visuais orientativas e suporte simultâneo aos formatos AQ. e AIzaSy.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.5.4-3',
        category: 'fixes',
        title: 'Desbloqueio dos Recursos de Magia da IA e Correção Ortográfica',
        description: 'Correção no fluxo de carregamento da API Key que impedia a utilização de "Corrigir Gramática & Ortografia", "Focar em Vendas" e demais ações inteligentes no chat.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      }
    ]
  },
  {
    version: '7.5.3',
    date: '2026-09-20',
    summary: 'Blindagem de Segurança e Desacoplamento da Gemini API, Proteção de Custos e Eliminação de Chaves no Frontend',
    notes: [
      {
        id: '7.5.3-1',
        category: 'features',
        title: 'Blindagem de Segurança da IA e Restrição Estrita por IP',
        description: 'Migração completa de todas as chaves sensíveis de IA exclusivamente para o backend protegido no Coolify, com restrição estrita de IP dos servidores no Google Cloud.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.5.3-2',
        category: 'improvements',
        title: 'Desacoplamento e Sanitização de Credenciais no Bundle Frontend',
        description: 'Eliminação de variáveis de chave com prefixo VITE_ e higienização do JavaScript compilado para garantir total imunidade a robôs e scrapers externos.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.5.3-3',
        category: 'fixes',
        title: 'Estancamento Imediato de Anomalia de Cobrança e Bloqueio 403',
        description: 'Revogação e exclusão das chaves legadas expostas no Google Cloud, estancando requisições abusivas externas e blindando o orçamento da conta.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      }
    ]
  },
  {
    version: '7.5.2',
    date: '2026-09-17',
    summary: 'Refatoração UI/UX Mobile-First do DevLogger, Compatibilidade RTTI Delphi Gastrofood e Estabilização SessionManager Baileys',
    notes: [
      {
        id: '7.5.2-1',
        category: 'features',
        title: 'Modal Unificado de Testes e Simulações no DevLogger',
        description: 'Agrupamento de testes de integridade ASTS, simulação de exceções Node.js e limpeza de telemetria em modal popover moderno, liberando espaço de leitura em telas móveis.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.5.2-2',
        category: 'improvements',
        title: 'Abas Responsivas sem Quebra de Linha e Seletor Compacto',
        description: 'Navegação por abas com scroll horizontal fluido nativo (whitespace-nowrap), min-height de 44px e seletor dropdown compacto para filtros de tipo de log.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.5.2-3',
        category: 'fixes',
        title: 'Resolução do Erro Gastrofood Delphi e Limpeza de QR Timeout',
        description: 'Normalização bilateral de pedidos (customer/custumer) compatível com o backend Delphi e eliminação de travas órfãs em timeouts de leitura de QR Code no Baileys.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      }
    ]
  },
  {
    version: '7.5.1',
    date: '2026-09-17',
    summary: 'Resiliência de Áudio e Mídia Multi-Worker, Indicadores Visuais de Status de Mensagens e Blindagem Postgres UUID',
    notes: [
      {
        id: '7.5.1-1',
        category: 'features',
        title: 'Indicadores Visuais de Falha e Status no Chat',
        description: 'Exibição de ícone vermelho de alerta com tooltip detalhado para mensagens não entregues e animação pulsante para mensagens pendentes na bolha do chat.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.5.1-2',
        category: 'improvements',
        title: 'Despacho Resiliente de Áudios Gravados (PTT)',
        description: 'Transição transparente de áudios e mídias para a fila de saída outbox com conversão FFmpeg (ogg opus), garantindo entrega mesmo em clusters com sockets distribuídos.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.5.1-3',
        category: 'fixes',
        title: 'Blindagem de Sintaxe Postgres UUID no Dashboard',
        description: 'Guarda estrita em getOperatorStatsForTicket impedindo consultas com conversation_id vazio no Supabase e eliminando o erro Postgres 22P02.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      }
    ]
  },
  {
    version: '7.5.0',
    date: '2026-09-16',
    summary: 'Análise Visual UI/UX via IA Gemini Vision, Estabilização de Concorrência Baileys e Gestão da Fila Dev',
    notes: [
      {
        id: '7.5.0-1',
        category: 'features',
        title: 'Análise Visual de UI/UX com IA Multimodal (Gemini Vision)',
        description: 'Nova engine que analisa screenshots de telas e gera a Análise Prática de 10 Pontos de UI/UX com diretrizes Mobile-First (alvo 48px, zero rolagem lateral, bottom sheets), sugestões de classes Tailwind CSS e criação automática de cards no CRM.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.5.0-2',
        category: 'features',
        title: 'Gestão Completa de Requisições na Esteira Fila Dev',
        description: 'Expansão da automação da Fila Dev com os comandos add (criação de cards), comment (comentários com histórico), assign (atribuição de desenvolvedor) e close (fechamento oficial com relatório).',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.5.0-3',
        category: 'improvements',
        title: 'Resiliência de Telemetria e Polling Silencioso',
        description: 'Adicionado AbortController com timeout de 3500ms e tratamento com debounce no DevLogger, silenciando tempestades de avisos no console durante reboots ou oscilações de rede.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.5.0-4',
        category: 'fixes',
        title: 'Eliminação de Conflitos de Sessão Baileys no Boot',
        description: 'Remoção de forceTakeover prematuro na inicialização do servidor e destruição limpa de sockets zumbis na memória ao ceder posse de lease, prevenindo erros de Stream Errored (conflict).',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      }
    ]
  },
  {
    version: '7.4.9',
    date: '2026-09-16',
    summary: 'Sistema Diagnóstico E2E de Alto Nível, Telemetria em Tempo Real e Blindagem Anti-Loop',
    notes: [
      {
        id: '7.4.9-1',
        category: 'features',
        title: 'Sistema de Telemetria e Diagnóstico E2E em Tempo Real',
        description: 'Implementação de observabilidade profunda com rastreamento de 9 estágios de mensagens via Trace ID único, monitoramento de Event Loop Lag via perf_hooks, heap/RSS e auditoria contínua de listeners Baileys.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.4.9-2',
        category: 'improvements',
        title: 'Estabilização de Sockets e Blindagem Anti-Queda no Baileys',
        description: 'Aumento da tolerância de keepalive para 120s com renovação imediata no ping IQ e remoção de frames crus de ping, eliminando quedas em cascata (Connection was lost) com dezenas de instâncias simultâneas.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.4.9-3',
        category: 'fixes',
        title: 'Drenagem Instantânea de Mensagens (< 1s)',
        description: 'Desacoplamento não-bloqueante de uploads de mídia e drenagem de lotes via setImmediate no EventProcessor, garantindo entrega imediata de mensagens de texto na tela do CRM.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      }
    ]
  },
  {
    version: '7.4.8',
    date: '2026-09-16',
    summary: 'Automação física de Aviso de Impressão PDV (40 colunas) e blindagem anti-loop',
    notes: [
      {
        id: '7.4.8-1',
        category: 'features',
        title: 'Aviso de Impressão Física Remota no PDV (40 Colunas)',
        description: 'Disparo automático de recado físico para a impressora de produção (Caixa, Cozinha, Balcão) via GestorPedidosService quando a IA transferir o cliente para atendimento humano.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.4.8-2',
        category: 'improvements',
        title: 'Blindagem Anti-Loop e Disparo Único',
        description: 'Tracker inteligente com janela de 30 minutos indexado por conversa, JID e telefone para assegurar disparo estritamente único por atendimento humano, evitando loops e gasto de bobina.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: '7.4.8-3',
        category: 'improvements',
        title: 'Configuração Simplificada e Status em Tempo Real',
        description: 'Campos 1 (Estabelecimento) e 2 (Impressora) iniciam em branco por padrão com banner de ativação em tempo real e remoção do endpoint estático travado do layout.',
        tag: 'MELHORIA',
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
      }
    ]
  },
  {
    version: '7.4.7',
    date: '2026-09-16',
    summary: 'Estruturação inicial de endpoints de impressão remota e testes operacionais',
    notes: [
      {
        id: '7.4.7-1',
        category: 'features',
        title: 'Módulo de Integração de Impressão Remota',
        description: 'Implementação da seção de impressão física remota em Configurações de Conta com parametrização manual de estabelecimento, impressora e mensagem de teste.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: '7.4.7-2',
        category: 'improvements',
        title: 'Validação de Comunicação com GestorPedidosService',
        description: 'Painel interativo de testes manuais com feedback instantâneo de conexão HTTP e diagnóstico de status do PDV.',
        tag: 'MELHORIA',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      }
    ]
  },
  {
    version: '7.4.6',
    date: '2026-09-16',
    summary: 'Prevenção de perda de mensagens no chat e telemetria ponta a ponta',
    notes: [
      {
        id: '7.4.6-1',
        category: 'fixes',
        title: 'Prevenção de Perda de Mensagens no Envio',
        description: 'Mensagens com oscilação transitória de conexão permanecem na tela com status de erro e opção de reenvio direto com 1 clique, sem deletar o texto.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.4.6-2',
        category: 'improvements',
        title: 'Rastreabilidade E2E com DevLogger',
        description: 'Trilha de auditoria estruturada ponta a ponta para validação em tempo real entre Frontend, Servidor Baileys e Supabase.',
        tag: 'MELHORIA',
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
      },
      {
        id: '7.4.6-3',
        category: 'fixes',
        title: 'Saneamento e Auto-Cura de Fila Outbox',
        description: 'Recuperação automática de mensagens retidas em processamento órfão e eliminação de loops de retentativa nas instâncias do WhatsApp.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      }
    ]
  },
  {
    version: '7.4.5',
    date: '2026-09-16',
    summary: 'Isolamento estrito de nós Alpha x Produção e supressão de ruídos',
    notes: [
      {
        id: '7.4.5-1',
        category: 'fixes',
        title: 'Isolamento Estrito entre Alpha e Produção',
        description: 'Prevenção de concorrência e interferência cruzada de sockets entre ambientes de homologação e clientes reais.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.4.5-2',
        category: 'improvements',
        title: 'Supressão de Ruídos USync e Acks 479',
        description: 'Filtragem inteligente de logs inofensivos do protocolo Baileys no painel operacional do DevLogger.',
        tag: 'MELHORIA',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      }
    ]
  },
  {
    version: '7.4.4',
    date: '2026-09-15',
    summary: 'Resiliência de Keep-Alive e Fallback de Mensagens da IA',
    notes: [
      {
        id: '7.4.4-1',
        category: 'fixes',
        title: 'Tolerância Aumentada de Socket Baileys',
        description: 'Extensão da tolerância de keep-alive de 5s para 75s, mitigando quedas periódicas de conexão por oscilação de rede.',
        tag: 'CORREÇÃO',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
      },
      {
        id: '7.4.4-2',
        category: 'features',
        title: 'Fallback Automático no AutomationWorker',
        description: 'Se o socket oscilar durante o atendimento da IA Luna, a mensagem é enfileirada com segurança na outbox para envio garantido.',
        tag: 'NOVIDADE',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      }
    ]
  },
  {
    version: '7.4.3',
    date: '2026-09-14',
    summary: 'Estabilidade de boot de instâncias e renovação atômica',
    notes: [
      {
        id: '7.4.3-1',
        category: 'improvements',
        title: 'Locking Atômico de Sessões WhatsApp',
        description: 'Mecanismo de trava distribuída para impedir inicialização concorrente de uma mesma caixa em múltiplos workers.',
        tag: 'MELHORIA',
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
      }
    ]
  }
];

/**
 * Compara duas versões no formato SemVer (X.Y.Z)
 * Retorna:
 *  1 se v1 > v2
 * -1 se v1 < v2
 *  0 se v1 == v2
 */
export function compareSemver(v1: string, v2: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(part => parseInt(part, 10) || 0);
  const p1 = parse(v1);
  const p2 = parse(v2);
  for (let i = 0; i < 3; i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export interface DeltaResult {
  notes: ReleaseNoteItem[];
  summary: string;
  fromVersion: string;
  targetVersion: string;
}

/**
 * Retorna ESTRITAMENTE as notas das versões reais que vêm da versão anterior para a atual.
 * 
 * - Se fromVersion for fornecida e menor que targetVersion (ex: de 7.4.5 para 7.4.6):
 *   retorna apenas as notas das versões no intervalo (fromVersion, targetVersion].
 * - Se fromVersion não existir, for inválida ou igual a targetVersion:
 *   retorna apenas as notas da targetVersion (sem acumular versões passadas).
 */
export function getDeltaReleaseNotes(
  fromVersionRaw: string | null | undefined,
  targetVersionRaw: string
): DeltaResult {
  const targetVersion = (targetVersionRaw || '').replace(/^v/, '');
  const latestRelease = APP_RELEASES[0];

  // Se não encontrar o release específico da targetVersion, usa o mais recente registrado
  const targetRelease = APP_RELEASES.find(r => r.version === targetVersion) || latestRelease;

  if (!fromVersionRaw || fromVersionRaw === targetVersion) {
    // Sem versão anterior ou mesma versão: exibe estritamente as notas da versão alvo
    return {
      notes: targetRelease.notes,
      summary: targetRelease.summary,
      fromVersion: targetRelease.version,
      targetVersion: targetRelease.version
    };
  }

  const fromVersion = fromVersionRaw.replace(/^v/, '');

  // Proteção contra inversão de versões (ex: se o client storage tiver versão maior ou igual à target)
  if (compareSemver(fromVersion, targetRelease.version) >= 0) {
    const prevRelease = APP_RELEASES.find(r => compareSemver(targetRelease.version, r.version) > 0);
    const safeFrom = prevRelease ? prevRelease.version : targetRelease.version;
    return {
      notes: targetRelease.notes,
      summary: targetRelease.summary,
      fromVersion: safeFrom,
      targetVersion: targetRelease.version
    };
  }

  // Filtra apenas as versões estritamente maiores que a anterior e menores/iguais à alvo
  const applicableReleases = APP_RELEASES.filter(release => {
    const isAfterFrom = compareSemver(release.version, fromVersion) > 0;
    const isUpToTarget = compareSemver(release.version, targetRelease.version) <= 0;
    return isAfterFrom && isUpToTarget;
  });

  if (applicableReleases.length === 0) {
    // Fallback seguro: exibe apenas a versão alvo
    return {
      notes: targetRelease.notes,
      summary: targetRelease.summary,
      fromVersion,
      targetVersion: targetRelease.version
    };
  }

  // Consolida as notas na ordem (mais recente primeiro)
  const consolidatedNotes: ReleaseNoteItem[] = [];
  applicableReleases.forEach(rel => {
    consolidatedNotes.push(...rel.notes);
  });

  return {
    notes: consolidatedNotes,
    summary: applicableReleases[0].summary,
    fromVersion,
    targetVersion: applicableReleases[0].version
  };
}

