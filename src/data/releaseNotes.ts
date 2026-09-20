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

