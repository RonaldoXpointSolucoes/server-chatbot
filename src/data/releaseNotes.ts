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

  // Filtra apenas as versões estritamente maiores que a anterior e menores/iguais à alvo
  const applicableReleases = APP_RELEASES.filter(release => {
    const isAfterFrom = compareSemver(release.version, fromVersion) > 0;
    const isUpToTarget = compareSemver(release.version, targetVersion) <= 0;
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
