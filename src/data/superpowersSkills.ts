export interface SuperpowerSkill {
  id: string;
  name: string;
  category: 'Workflow' | 'Design & Requisitos' | 'Planejamento' | 'Execução' | 'Arquitetura' | 'Qualidade & Testes' | 'Debugging' | 'Code Review' | 'Git & Branches' | 'Meta-Skills' | 'Diagnóstico' | 'UI/UX' | 'Especializada';
  description: string;
  emoji: string;
  tag: string;
  badgeStyle: {
    bg: string;
    text: string;
    border: string;
  };
  promptGuideline: string;
}

export const SUPERPOWERS_SKILLS: SuperpowerSkill[] = [
  {
    id: 'using-superpowers',
    name: 'Using Superpowers',
    category: 'Workflow',
    description: 'Bootstrap inicial, roteamento e ativação obrigatória de skills do framework.',
    emoji: '⚡',
    tag: 'superpowers',
    badgeStyle: {
      bg: 'bg-amber-500/15',
      text: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-500/30'
    },
    promptGuideline: 'Estabelece a ativação prévia e sistemática de skills antes de iniciar tarefas complexas.'
  },
  {
    id: 'brainstorming',
    name: 'Brainstorming',
    category: 'Design & Requisitos',
    description: 'Refinamento socrático de ideias e especificações antes do código.',
    emoji: '💡',
    tag: 'brainstorming',
    badgeStyle: {
      bg: 'bg-yellow-500/15',
      text: 'text-yellow-600 dark:text-yellow-400',
      border: 'border-yellow-500/30'
    },
    promptGuideline: 'Explora intenções do usuário, requisitos ocultos e alternativas de arquitetura antes de qualquer linha de código.'
  },
  {
    id: 'writing-plans',
    name: 'Writing Plans',
    category: 'Planejamento',
    description: 'Criação de planos de implementação TDD/YAGNI detalhados.',
    emoji: '📝',
    tag: 'planning',
    badgeStyle: {
      bg: 'bg-blue-500/15',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-500/30'
    },
    promptGuideline: 'Estrutura especificação técnica passo a passo com critérios de aceite, arquivos impactados e ordem de execução.'
  },
  {
    id: 'executing-plans',
    name: 'Executing Plans',
    category: 'Execução',
    description: 'Execução disciplinada dos planos aprovados.',
    emoji: '⚙️',
    tag: 'execution',
    badgeStyle: {
      bg: 'bg-indigo-500/15',
      text: 'text-indigo-600 dark:text-indigo-400',
      border: 'border-indigo-500/30'
    },
    promptGuideline: 'Executa a implementação de forma metódica, sem desvios de escopo e com checagem de cada etapa.'
  },
  {
    id: 'subagent-driven-development',
    name: 'Subagent-Driven Development',
    category: 'Arquitetura',
    description: 'Arquitetura de desenvolvimento e revisão orientada a subagentes.',
    emoji: '🤖',
    tag: 'subagents',
    badgeStyle: {
      bg: 'bg-purple-500/15',
      text: 'text-purple-600 dark:text-purple-400',
      border: 'border-purple-500/30'
    },
    promptGuideline: 'Delega tarefas isoladas para subagentes com contexto limpo, revisando código entre etapas.'
  },
  {
    id: 'test-driven-development',
    name: 'Test-Driven Development',
    category: 'Qualidade & Testes',
    description: 'Ciclos estritos de TDD Red-Green-Refactor.',
    emoji: '🧪',
    tag: 'tdd',
    badgeStyle: {
      bg: 'bg-emerald-500/15',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-500/30'
    },
    promptGuideline: 'Exige testes unitários/integrados antes da implementação ou validação prévia de falha (Red) antes da solução (Green).'
  },
  {
    id: 'systematic-debugging',
    name: 'Systematic Debugging',
    category: 'Debugging',
    description: 'Protocolo de investigação causal e isolamento de bugs.',
    emoji: '🔍',
    tag: 'debugging',
    badgeStyle: {
      bg: 'bg-rose-500/15',
      text: 'text-rose-600 dark:text-rose-400',
      border: 'border-rose-500/30'
    },
    promptGuideline: 'Investiga a causa raiz, inspeciona logs e estados antes de propor correções de bugs.'
  },
  {
    id: 'verification-before-completion',
    name: 'Verification Before Completion',
    category: 'Qualidade & Testes',
    description: 'Validação e evidências rigorosas antes de encerrar tarefas.',
    emoji: '✅',
    tag: 'verification',
    badgeStyle: {
      bg: 'bg-teal-500/15',
      text: 'text-teal-600 dark:text-teal-400',
      border: 'border-teal-500/30'
    },
    promptGuideline: 'Comprova o sucesso com comandos de compilação, testes e evidências reais antes de declarar a tarefa concluída.'
  },
  {
    id: 'requesting-code-review',
    name: 'Requesting Code Review',
    category: 'Code Review',
    description: 'Preparação de diffs e submissão estruturada para revisão.',
    emoji: '👀',
    tag: 'code-review',
    badgeStyle: {
      bg: 'bg-violet-500/15',
      text: 'text-violet-600 dark:text-violet-400',
      border: 'border-violet-500/30'
    },
    promptGuideline: 'Prepara relatórios de diff e revisões de qualidade contra padrões arquiteturais antes do merge.'
  },
  {
    id: 'receiving-code-review',
    name: 'Receiving Code Review',
    category: 'Code Review',
    description: 'Análise e incorporação de feedbacks de revisão.',
    emoji: '📥',
    tag: 'review-feedback',
    badgeStyle: {
      bg: 'bg-sky-500/15',
      text: 'text-sky-600 dark:text-sky-400',
      border: 'border-sky-500/30'
    },
    promptGuideline: 'Analisa feedbacks recebidos com rigor técnico sem concordâncias cegas, validando correções.'
  },
  {
    id: 'dispatching-parallel-agents',
    name: 'Dispatching Parallel Agents',
    category: 'Orquestração' as any,
    description: 'Orquestração e paralelização de subagentes independentes.',
    emoji: '⚡',
    tag: 'parallel',
    badgeStyle: {
      bg: 'bg-cyan-500/15',
      text: 'text-cyan-600 dark:text-cyan-400',
      border: 'border-cyan-500/30'
    },
    promptGuideline: 'Paraleliza frentes de trabalho totalmente desacopladas para máxima velocidade.'
  },
  {
    id: 'using-git-worktrees',
    name: 'Using Git Worktrees',
    category: 'Git & Branches',
    description: 'Isolamento seguro de branches via Git worktrees.',
    emoji: '🌿',
    tag: 'worktrees',
    badgeStyle: {
      bg: 'bg-lime-500/15',
      text: 'text-lime-600 dark:text-lime-400',
      border: 'border-lime-500/30'
    },
    promptGuideline: 'Garante ambiente e branch isolados para testes e desenvolvimento de features sem interferir na workspace.'
  },
  {
    id: 'finishing-a-development-branch',
    name: 'Finishing a Development Branch',
    category: 'Git & Branches',
    description: 'Finalização limpa e merge de branches de feature.',
    emoji: '🎯',
    tag: 'git-finish',
    badgeStyle: {
      bg: 'bg-emerald-500/15',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-500/30'
    },
    promptGuideline: 'Garante testes finais e consolidação limpa da branch após conclusão da tarefa.'
  },
  {
    id: 'writing-skills',
    name: 'Writing Skills',
    category: 'Meta-Skills',
    description: 'Criação e avaliação de novas skills para o framework.',
    emoji: '📚',
    tag: 'meta-skills',
    badgeStyle: {
      bg: 'bg-fuchsia-500/15',
      text: 'text-fuchsia-600 dark:text-fuchsia-400',
      border: 'border-fuchsia-500/30'
    },
    promptGuideline: 'Modela, estrutura e avalia novas habilidades customizadas do framework de agentes.'
  },
  {
    id: 'diagnosing-superpowers',
    name: 'Diagnosing Superpowers',
    category: 'Diagnóstico',
    description: 'Diagnóstico e verificação de integridade do ambiente.',
    emoji: '🩺',
    tag: 'diagnostic',
    badgeStyle: {
      bg: 'bg-rose-500/15',
      text: 'text-rose-600 dark:text-rose-400',
      border: 'border-rose-500/30'
    },
    promptGuideline: 'Diagnostica gargalos, falhas de execução e inconsistências em sessões de agentes.'
  },
  // Skills do Ecossistema Integrado ChatBoot
  {
    id: 'ui-ux-enhancement',
    name: 'UI/UX Enhancement',
    category: 'UI/UX',
    description: 'Refinamento visual sênior, Mobile First e análise em 10 pontos.',
    emoji: '🎨',
    tag: 'ui-ux',
    badgeStyle: {
      bg: 'bg-pink-500/15',
      text: 'text-pink-600 dark:text-pink-400',
      border: 'border-pink-500/30'
    },
    promptGuideline: 'Aplica a análise estruturada em 10 pontos de UI/UX, Mobile First, glassmorphism e micro-animações.'
  },
  {
    id: 'baileys-e2e-testing',
    name: 'Baileys E2E Testing',
    category: 'Especializada',
    description: 'Testes e validações de envio/recebimento de mensagens reais do WhatsApp via Baileys.',
    emoji: '💬',
    tag: 'baileys',
    badgeStyle: {
      bg: 'bg-green-500/15',
      text: 'text-green-600 dark:text-green-400',
      border: 'border-green-500/30'
    },
    promptGuideline: 'Valida o ciclo bidirecional completo de envio e recebimento de mensagens WhatsApp via motor Baileys.'
  },
  {
    id: 'root-cause-analysis-expert',
    name: 'Root Cause Analysis Expert',
    category: 'Debugging',
    description: 'Análise causal raiz estruturada para falhas recorrentes (>2x).',
    emoji: '🔬',
    tag: 'root-cause',
    badgeStyle: {
      bg: 'bg-red-500/15',
      text: 'text-red-600 dark:text-red-400',
      border: 'border-red-500/30'
    },
    promptGuideline: 'Executa protocolo de trilha de migalhas e causa raiz de 7 passos para problemas reincidentes.'
  }
];

export function getSkillById(id: string): SuperpowerSkill | undefined {
  return SUPERPOWERS_SKILLS.find(s => s.id.toLowerCase() === id.toLowerCase());
}

export function formatSkillsMarkdownSection(skills: string[], rationale?: string): string {
  if (!skills || skills.length === 0) return '';

  const matched = skills.map(id => getSkillById(id)).filter(Boolean) as SuperpowerSkill[];
  if (matched.length === 0) return '';

  let md = `\n\n---\n### ⚡ Protocolo de Execução com Skills Superpowers\n`;
  md += `> **Diretriz para o Agente IA Desenvolvedor**: Ao assumir este card (ex: via \`Fila dev\` ou comando direto), consulte e ative rigorosamente as skills recomendadas abaixo antes e durante a codificação:\n\n`;

  matched.forEach(s => {
    md += `- **\`@skill:${s.id}\`** (${s.emoji} *${s.name}*): ${s.description}\n`;
  });

  if (rationale && rationale.trim()) {
    md += `\n**💡 Justificativa Técnica da IA:**\n${rationale.trim()}\n`;
  }

  return md;
}
