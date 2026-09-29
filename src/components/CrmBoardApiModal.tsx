import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Copy, 
  Check, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Zap, 
  ShieldCheck, 
  Code, 
  Terminal, 
  Sparkles, 
  AlertCircle, 
  ExternalLink, 
  X, 
  Layers, 
  Bot, 
  Globe, 
  ArrowRight,
  FileText,
  Sliders,
  CheckCircle2,
  Lock,
  Unlock,
  Cpu,
  BookOpen,
  ArrowUpRight,
  CheckCheck,
  Download,
  Share2,
  CheckSquare
} from 'lucide-react';
import { supabase } from '../services/supabase';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface CrmBoardApiConfig {
  enabled: boolean;
  key: string;
  created_at: string;
  last_used_at?: string | null;
  permissions?: {
    read_cards: boolean;
    write_cards: boolean;
    move_cards: boolean;
    create_cards: boolean;
  };
}

interface CrmBoardApiModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: {
    id: string;
    name: string;
    config: any;
  };
  onBoardUpdated: (updatedBoard: any) => void;
}

type ModalTab = 'credentials' | 'stages' | 'playground' | 'skill_builder';

export default function CrmBoardApiModal({
  isOpen,
  onClose,
  board,
  onBoardUpdated
}: CrmBoardApiModalProps) {
  // Estados principais
  const [activeTab, setActiveTab] = useState<ModalTab>('credentials');
  const [enabled, setEnabled] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  
  // Feedback de cópia
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedBoardId, setCopiedBoardId] = useState<boolean>(false);
  const [copiedBaseUrl, setCopiedBaseUrl] = useState<boolean>(false);
  const [copiedCodeTab, setCopiedCodeTab] = useState<string | null>(null);
  const [copiedStageId, setCopiedStageId] = useState<string | null>(null);
  
  // Criador de Skill para IAs
  const [commandTrigger, setCommandTrigger] = useState<string>('Fila dev');
  const [skillSlug, setSkillSlug] = useState<string>('');
  const [targetAiPreset, setTargetAiPreset] = useState<'universal' | 'cursor' | 'claude' | 'chatgpt'>('universal');
  const [skillViewMode, setSkillViewMode] = useState<'preview' | 'raw'>('preview');
  const [copiedSkill, setCopiedSkill] = useState<boolean>(false);
  const [downloadedSkill, setDownloadedSkill] = useState<boolean>(false);
  
  // Playground
  const [activeCodeLang, setActiveCodeLang] = useState<'curl' | 'js' | 'python'>('curl');
  const [activeActionTab, setActiveActionTab] = useState<'move' | 'list' | 'get' | 'comment'>('move');
  
  // Permissões
  const [permissions, setPermissions] = useState({
    read_cards: true,
    write_cards: true,
    move_cards: true,
    create_cards: true
  });

  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // URL Base do Servidor em Nuvem oficial do ChatBoot
  const baseUrl = (typeof window !== 'undefined' && import.meta.env.VITE_WHATSAPP_ENGINE_URL)
    ? `${import.meta.env.VITE_WHATSAPP_ENGINE_URL}/api/v1/crm`
    : 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io/api/v1/crm';

  // Gerador de chave segura prefixada
  const generateNewKey = () => {
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(20)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return `xpt_crm_live_${randomHex}`;
  };

  useEffect(() => {
    if (board && board.config) {
      const apiCfg = board.config.api;
      if (apiCfg) {
        setEnabled(Boolean(apiCfg.enabled));
        setApiKey(apiCfg.key || generateNewKey());
        if (apiCfg.permissions) {
          setPermissions({
            read_cards: apiCfg.permissions.read_cards ?? true,
            write_cards: apiCfg.permissions.write_cards ?? true,
            move_cards: apiCfg.permissions.move_cards ?? true,
            create_cards: apiCfg.permissions.create_cards ?? true
          });
        }
      } else {
        setEnabled(false);
        setApiKey(generateNewKey());
      }

      // Configuração inicial de identificador da skill
      const defaultSlug = (board.name || 'crm-board')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setSkillSlug(`fila-dev-${defaultSlug || 'quadro'}`);
    }
  }, [board, isOpen]);

  if (!isOpen || !board) return null;

  const stages = board.config?.stages || [];

  const handleCopy = (text: string, type: 'key' | 'boardId' | 'baseUrl' | 'code' | 'stage') => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else if (type === 'boardId') {
      setCopiedBoardId(true);
      setTimeout(() => setCopiedBoardId(false), 2000);
    } else if (type === 'baseUrl') {
      setCopiedBaseUrl(true);
      setTimeout(() => setCopiedBaseUrl(false), 2000);
    } else if (type === 'stage') {
      setCopiedStageId(text);
      setTimeout(() => setCopiedStageId(null), 2000);
    } else {
      setCopiedCodeTab(activeActionTab);
      setTimeout(() => setCopiedCodeTab(null), 2000);
    }
  };

  const handleRegenerateKey = () => {
    if (confirm('Atenção: Ao regenerar a chave de API, qualquer integração ou agente de IA que utilize a chave anterior deixará de funcionar imediatamente. Deseja continuar?')) {
      const newKey = generateNewKey();
      setApiKey(newKey);
      setShowKey(true);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const updatedApiConfig: CrmBoardApiConfig = {
        enabled,
        key: apiKey,
        created_at: board.config?.api?.created_at || new Date().toISOString(),
        last_used_at: board.config?.api?.last_used_at || null,
        permissions
      };

      const updatedConfig = {
        ...board.config,
        api: updatedApiConfig
      };

      const { data, error } = await supabase
        .from('crm_boards')
        .update({ config: updatedConfig })
        .eq('id', board.id)
        .select()
        .single();

      if (error) throw error;

      onBoardUpdated(data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erro ao salvar configurações da API:', err);
      alert('Erro ao salvar configurações da API: ' + (err.message || 'Falha no banco de dados.'));
    } finally {
      setSaving(false);
    }
  };

  // Cores dinâmicas para colunas
  const getStageColorStyles = (colorClass?: string) => {
    const base = (colorClass || '').replace('bg-', '');
    switch (base) {
      case 'blue-500':
        return {
          dot: 'bg-blue-500',
          badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25',
          borderHover: 'hover:border-blue-500/40'
        };
      case 'emerald-500':
        return {
          dot: 'bg-emerald-500',
          badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
          borderHover: 'hover:border-emerald-500/40'
        };
      case 'amber-500':
        return {
          dot: 'bg-amber-500',
          badge: 'bg-amber-500/10 text-amber-400 dark:text-amber-400 border-amber-500/25',
          borderHover: 'hover:border-amber-500/40'
        };
      case 'rose-500':
        return {
          dot: 'bg-rose-500',
          badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25',
          borderHover: 'hover:border-rose-500/40'
        };
      case 'purple-500':
      case 'violet-500':
        return {
          dot: 'bg-purple-500',
          badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25',
          borderHover: 'hover:border-purple-500/40'
        };
      default:
        return {
          dot: 'bg-indigo-500',
          badge: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25',
          borderHover: 'hover:border-indigo-500/40'
        };
    }
  };

  // Descoberta inteligente das colunas do quadro para regras de governança da IA
  const devStageObj = stages.find((s: any) => s.id === 'development' || s.label?.toLowerCase().includes('desenvolvimento') || s.label?.toLowerCase().includes('andamento')) || stages[2] || stages[0] || { id: 'development', label: 'Em Desenvolvimento' };
  const testStageObj = stages.find((s: any) => s.id === 'testing' || s.label?.toLowerCase().includes('teste') || s.label?.toLowerCase().includes('qa') || s.label?.toLowerCase().includes('validação')) || stages[3] || stages[stages.length - 1] || { id: 'testing', label: 'Em Testes & QA' };
  const analysisStageObj = stages.find((s: any) => s.id === 'analysis' || s.label?.toLowerCase().includes('análise') || s.label?.toLowerCase().includes('analise')) || stages[1] || { id: 'analysis', label: 'Em Análise' };
  const backlogStageObj = stages.find((s: any) => s.id === 'backlog' || s.label?.toLowerCase().includes('backlog') || s.label?.toLowerCase().includes('ideia')) || stages[0] || { id: 'backlog', label: 'Backlog / Ideias' };

  // Gerador dinâmico de documentação de Skill oficial para IAs
  const generateSkillMarkdown = () => {
    const authHeader = apiKey || '<SUA_CHAVE_DE_API>';
    const trigger = (commandTrigger || 'Fila dev').trim();
    const slug = (skillSlug || `fila-dev-${board.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`).trim();
    const boardTitle = board.name || 'ChatBoot CRM';
    const bId = board.id;

    const stagesTable = stages.map((s: any) => {
      let roleDesc = 'Coluna auxiliar do fluxo';
      if (s.id === devStageObj.id) roleDesc = '⚡ ALVO EXCLUSIVO DE DESENVOLVIMENTO PELA IA';
      else if (s.id === testStageObj.id) roleDesc = '🧪 ALVO DE DESTINO APÓS ENTREGA DOCUMENTADA (QA)';
      else if (s.id === analysisStageObj.id) roleDesc = '🔒 BLOQUEADO / LEITURA (AGUARDA AUTORIZAÇÃO)';
      else if (s.id === backlogStageObj.id) roleDesc = '💡 Banco de Ideias / Não mexer';
      return `| \`${s.id}\` | **${s.label}** | ${roleDesc} |`;
    }).join('\n');

    return `---
name: ${slug}
description: Skill oficial de esteira de desenvolvimento sênior e automação para o quadro '${boardTitle}'. Opera via API REST oficial, processando exclusivamente cards da coluna '${devStageObj.label}' e enviando para '${testStageObj.label}' com documentação técnica detalhada.
---

# Skill: Esteira de Desenvolvimento Autônomo — Quadro ${boardTitle}

> ⚡ **GATILHO DE ATIVAÇÃO**: Toda vez que o usuário digitar \`${trigger}\` (ou variações como \`${trigger.toLowerCase()}\`, \`/${trigger.toLowerCase().replace(/\\s+/g, '-')}\`), execute imediatamente este protocolo.

Esta skill ensina à IA (Cursor, Claude, Codex, ChatGPT ou Antigravity) como interagir com o quadro **${boardTitle}** (ID: \`${bId}\`) consumindo a API REST do CRM para ler demandas, imagens/vídeos de tela, desenvolver as soluções e mover os cartões mantendo governança estrita.

---

> [!CRITICAL]
> **REGRA DE OURO E GOVERNANÇA INVIOLÁVEL DA FILA DEV**:
> 1. **FOCO EXCLUSIVO NA LISTA '${devStageObj.label}' (\`status === '${devStageObj.id}'\`):**
>    - A IA **SÓ DEVE** pegar, assumir e resolver cards que estejam estritamente na coluna/lista **'${devStageObj.label}'**.
> 2. **BLOQUEIO TOTAL DA LISTA '${analysisStageObj.label}' (\`status === '${analysisStageObj.id}'\`) E DEMAIS COLUNAS:**
>    - É **ESTRITAMENTE PROIBIDO** iniciar codificação ou mover cards que estejam na coluna **'${analysisStageObj.label}'**. Eles aguardam aprovação manual do usuário. A IA pode no máximo listá-los em relatório de status sem alterá-los.
> 3. **DOCUMENTAÇÃO OBRIGATÓRIA DA ENTREGA & ENVIO PARA '${testStageObj.label}' (\`status === '${testStageObj.id}'\`):**
>    - Ao concluir as correções de cada card, a IA **DEVE OBRIGATORIAMENTE:**
>      a) Registrar um relatório técnico documentando com precisão o que foi feito (resumo executivo, arquitetura, arquivos modificados e testes de compilação).
>      b) Mover/enviar o card imediatamente para a lista **'${testStageObj.label}'** (\`${testStageObj.id}\`) através do endpoint oficial de transição.
>    - Após mover o card para QA, avançar imediatamente para o próximo card de '${devStageObj.label}' até que a coluna esteja completamente zerada (0 cards).

---

## 🔑 1. Credenciais e Conexão com a API REST

- **URL Base da API**: \`${baseUrl}\`
- **ID Único do Quadro (Board ID)**: \`${bId}\`
- **Chave de API (Bearer Token)**: \`${authHeader}\`
- **Header Obrigatório**: \`x-api-key: ${authHeader}\`

### Mapeamento das Colunas Deste Quadro:
| ID da Coluna (\`targetStage\`) | Nome da Coluna | Papel na Governança da IA |
| :--- | :--- | :--- |
${stagesTable}

---

## 🔄 2. Protocolo de Execução Sequencial da IA

Quando o comando \`${trigger}\` for disparado:

\`\`\`mermaid
sequenceDiagram
    autonumber
    actor User as Usuário
    participant AI as Agente IA Sênior
    participant API as API REST do CRM
    participant Code as Base de Código Local
    participant QA as Coluna ${testStageObj.label}

    User->>AI: "${trigger}"
    AI->>API: GET /boards/${bId}/cards?status=${devStageObj.id}
    API-->>AI: Lista ordenada de cards em desenvolvimento com anexos/mídias
    loop Para cada Card em '${devStageObj.label}'
        AI->>AI: Analisa requisitos e inspeciona todas as capturas de tela (Visão IA)
        AI->>Code: Implementa a solução com arquitetura sênior e Clean Code
        AI->>Code: Valida compilação local (build / testes)
        AI->>API: POST /boards/${bId}/cards/<CARD_ID>/move (targetStage: "${testStageObj.id}")
        API-->>QA: Card migrado com relatório técnico de entrega
    end
    AI->>User: Apresenta relatório consolidado de todas as tarefas concluídas
\`\`\`

---

## 🛠️ 3. Endpoints Oficiais para a IA Consumir

### Passo 1: Listar Cards para Execução (Apenas da Coluna '${devStageObj.label}')
\`\`\`bash
curl -X GET "${baseUrl}/boards/${bId}/cards?status=${devStageObj.id}" \\
  -H "x-api-key: ${authHeader}"
\`\`\`

### Passo 2: Ler Detalhes e Inspecionar Imagens Anexadas
\`\`\`bash
curl -X GET "${baseUrl}/boards/${bId}/cards/<CARD_ID>" \\
  -H "x-api-key: ${authHeader}"
\`\`\`
*Nota para a IA: O campo \`ai_context.image_urls_for_vision\` contém as URLs diretas de capturas de tela em alta resolução para inspeção via visão computacional.*

### Passo 3: Mover o Card Resolvido para '${testStageObj.label}' Documentando a Entrega
\`\`\`bash
curl -X POST "${baseUrl}/boards/${bId}/cards/<CARD_ID>/move" \\
  -H "x-api-key: ${authHeader}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "targetStage": "${testStageObj.id}",
    "agentName": "Agente IA Autônomo",
    "comment": "Implementação finalizada e validada. Card encaminhado para testes e homologação.",
    "deliveryReport": {
      "summary": "Descrição clara e detalhada das correções e refatorações realizadas.",
      "files": ["src/components/Exemplo.tsx", "server/src/api.js"]
    }
  }'
\`\`\`

### Passo 4: Registrar Anotações Intermediárias ou Comentários Técnicos (Opcional)
\`\`\`bash
curl -X POST "${baseUrl}/boards/${bId}/cards/<CARD_ID>/comment" \\
  -H "x-api-key: ${authHeader}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "comment": "Iniciei a análise das imagens e a refatoração do layout.",
    "author": "Agente IA"
  }'
\`\`\`

---

## 💡 4. Onde Salvar Esta Skill no seu Ambiente de IA:
- **Cursor IDE**: Crie o arquivo \`.cursor/skills/${slug}/SKILL.md\` ou adicione ao \`.cursorrules\`.
- **Claude Code**: Salve em \`.claude/skills/${slug}/SKILL.md\` ou no Project Knowledge da Anthropic.
- **ChatGPT / Codex**: Copie o conteúdo acima e cole nas "Instruções Personalizadas" (Custom Instructions) do seu GPT.
- **Antigravity**: Salve em \`.agents/skills/${slug}/SKILL.md\`.
`;
  };

  const handleCopySkill = () => {
    navigator.clipboard.writeText(generateSkillMarkdown());
    setCopiedSkill(true);
    setTimeout(() => setCopiedSkill(false), 2000);
  };

  const handleDownloadSkill = () => {
    const content = generateSkillMarkdown();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${skillSlug || 'SKILL'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloadedSkill(true);
    setTimeout(() => setDownloadedSkill(false), 2000);
  };

  // Gerador dinâmico de códigos de exemplo
  const targetExampleStage = stages.find((s: any) => s.id === 'testing' || s.label?.toLowerCase().includes('teste'))?.id || stages[stages.length - 1]?.id || 'testing';
  const filterExampleStage = stages.find((s: any) => s.id === 'development' || s.label?.toLowerCase().includes('desenvolvimento'))?.id || stages[0]?.id || 'development';

  const getCodeSnippet = () => {
    const authHeader = apiKey ? apiKey : '<SUA_API_KEY>';
    const bId = board.id;

    if (activeCodeLang === 'curl') {
      if (activeActionTab === 'list') {
        return `# 1. Listar cartões da coluna '${filterExampleStage}' com imagens e AI Pack\ncurl -X GET "${baseUrl}/boards/${bId}/cards?status=${filterExampleStage}" \\\n  -H "x-api-key: ${authHeader}"`;
      }
      if (activeActionTab === 'get') {
        return `# 2. Obter detalhes completos do cartão (inclui imagens em alta resolução para visão)\ncurl -X GET "${baseUrl}/boards/${bId}/cards/<CARD_ID>" \\\n  -H "x-api-key: ${authHeader}"`;
      }
      if (activeActionTab === 'move') {
        return `# 3. Mover o cartão para '${targetExampleStage}' e registrar a entrega técnica da IA\ncurl -X POST "${baseUrl}/boards/${bId}/cards/<CARD_ID>/move" \\\n  -H "x-api-key: ${authHeader}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "targetStage": "${targetExampleStage}",\n    "agentName": "Claude 3.7 / Cursor Agent",\n    "comment": "Implementação finalizada e validada em ambiente local.",\n    "deliveryReport": {\n      "summary": "Implementados novos componentes e rotas da API.",\n      "files": ["src/components/CrmBoardApiModal.tsx"]\n    }\n  }'`;
      }
      return `# 4. Registrar anotação ou comentário de progresso técnico no cartão\ncurl -X POST "${baseUrl}/boards/${bId}/cards/<CARD_ID>/comment" \\\n  -H "x-api-key: ${authHeader}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "comment": "Iniciei a análise das imagens e a refatoração do layout.",\n    "author": "Agente IA Autônomo"\n  }'`;
    }

    if (activeCodeLang === 'js') {
      if (activeActionTab === 'list') {
        return `// Buscar cartões para a IA processar\nconst res = await fetch("${baseUrl}/boards/${bId}/cards?status=${filterExampleStage}", {\n  headers: { "x-api-key": "${authHeader}" }\n});\nconst { cards } = await res.json();\n\n// Para cada cartão, acesse 'card.ai_context.image_urls_for_vision' ou 'card.media'\ncards.forEach(card => {\n  console.log(\`Demanda: \${card.clean_title} (\${card.media.length} mídias anexadas)\`);\n});`;
      }
      if (activeActionTab === 'get') {
        return `// Ler cartão específico com pacote multimodal completo\nconst res = await fetch("${baseUrl}/boards/${bId}/cards/<CARD_ID>", {\n  headers: { "x-api-key": "${authHeader}" }\n});\nconst { card } = await res.json();\n\nconsole.log("Título:", card.clean_title);\nconsole.log("Notas em Markdown:", card.notes_markdown);\nconsole.log("Imagens para IA:", card.ai_context.image_urls_for_vision);\nconsole.log("Critérios de Aceite:", card.acceptance_criteria);`;
      }
      if (activeActionTab === 'move') {
        return `// Mover cartão de etapa após o desenvolvimento\nconst res = await fetch("${baseUrl}/boards/${bId}/cards/<CARD_ID>/move", {\n  method: "POST",\n  headers: {\n    "x-api-key": "${authHeader}",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    targetStage: "${targetExampleStage}",\n    agentName: "Claude 3.7 Sonnet",\n    comment: "Implementação concluída com sucesso.",\n    deliveryReport: {\n      summary: "Código refatorado e validado.",\n      files: ["src/pages/CrmKanban.tsx"]\n    }\n  })\n});\nconst data = await res.json();\nconsole.log("Status atualizado:", data.new_status);`;
      }
      return `// Escrever progresso ou comentário no cartão\nconst res = await fetch("${baseUrl}/boards/${bId}/cards/<CARD_ID>/comment", {\n  method: "POST",\n  headers: {\n    "x-api-key": "${authHeader}",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    comment: "Analisando dependências e arquitetura...",\n    author: "Cursor Agent"\n  })\n});\nconst data = await res.json();`;
    }

    if (activeCodeLang === 'python') {
      if (activeActionTab === 'list') {
        return `import requests\n\nurl = "${baseUrl}/boards/${bId}/cards"\nheaders = {"x-api-key": "${authHeader}"}\nparams = {"status": "${filterExampleStage}"}\n\nresp = requests.get(url, headers=headers, params=params).json()\nfor card in resp.get("cards", []):\n    print(f"Demanda: {card['clean_title']} | Imagens: {len(card.get('media', []))}")\n    # Envie as imagens diretamente para Gemini Vision ou GPT-4o\n    image_urls = card["ai_context"]["image_urls_for_vision"]`;
      }
      if (activeActionTab === 'get') {
        return `import requests\n\ncard_id = "<CARD_ID>"\nurl = f"${baseUrl}/boards/${bId}/cards/{card_id}"\nheaders = {"x-api-key": "${authHeader}"}\n\ncard = requests.get(url, headers=headers).json().get("card", {})\nprint(f"Demanda: {card.get('title')}")\nprint(f"Notas: {card.get('notes_markdown')}")\nprint(f"Links externos: {card.get('links')}")`;
      }
      if (activeActionTab === 'move') {
        return `import requests\n\ncard_id = "<CARD_ID>"\nurl = f"${baseUrl}/boards/${bId}/cards/{card_id}/move"\nheaders = {\n    "x-api-key": "${authHeader}",\n    "Content-Type": "application/json"\n}\npayload = {\n    "targetStage": "${targetExampleStage}",\n    "agentName": "Python AI Worker",\n    "comment": "Finalizado processamento de dados e geração do relatório.",\n    "deliveryReport": {\n        "summary": "Scripts executados com sucesso e validados."\n    }\n}\nresp = requests.post(url, headers=headers, json=payload).json()\nprint("Novo status:", resp.get("new_status"))`;
      }
      return `import requests\n\ncard_id = "<CARD_ID>"\nurl = f"${baseUrl}/boards/${bId}/cards/{card_id}/comment"\nheaders = {\n    "x-api-key": "${authHeader}",\n    "Content-Type": "application/json"\n}\npayload = {\n    "comment": "Identificado requisito crítico de responsividade.",\n    "author": "DeepSeek R1"\n}\nresp = requests.post(url, headers=headers, json=payload).json()`;
    }

    return '';
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 dark:bg-black/85 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#111b21] w-full max-w-4xl rounded-t-[32px] sm:rounded-[28px] border border-slate-200/80 dark:border-white/[0.08] overflow-hidden shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 flex flex-col max-h-[92vh] sm:max-h-[88vh]">
        
        {/* Header com Identidade Visual Glassmorphism SaaS Premium */}
        <div className="px-6 py-5 border-b border-slate-200/80 dark:border-white/[0.08] bg-gradient-to-r from-violet-600/10 via-indigo-600/10 to-cyan-500/10 dark:from-violet-500/15 dark:via-indigo-500/15 dark:to-cyan-500/15 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-4 ring-indigo-500/15 shrink-0">
              <Zap size={22} className="text-amber-300 animate-pulse" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-sans tracking-tight">
                  Acesso à API & Automação com IAs
                </h3>
                <span className={cn(
                  "text-[10px] px-2.5 py-0.5 rounded-full font-black tracking-wider uppercase border flex items-center gap-1.5 shadow-2xs transition-colors",
                  enabled 
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-slate-200/80 dark:bg-white/10 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-white/10"
                )}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", enabled ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />
                  {enabled ? 'API Ativa' : 'Desativada'}
                </span>

                {/* Botão de Destaque Oficial: Criador de Skill */}
                <button
                  type="button"
                  onClick={() => setActiveTab('skill_builder')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs active:scale-95",
                    activeTab === 'skill_builder'
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/25 ring-2 ring-amber-400/30"
                      : "bg-gradient-to-r from-violet-600/15 via-indigo-600/15 to-amber-500/15 hover:from-violet-600/25 hover:to-amber-500/25 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30"
                  )}
                  title="Abrir Criador de Skill para IAs"
                >
                  <Sparkles size={13} className={activeTab === 'skill_builder' ? "text-white" : "text-amber-500 fill-amber-500"} />
                  <span>Criador de Skill</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 truncate">
                Quadro atual: <span className="font-bold text-slate-800 dark:text-slate-200">{board.name}</span>
              </p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            aria-label="Fechar modal"
            className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-2xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>

        {/* Barra de Navegação por Abas Segmentadas (Segmented Navigation) */}
        <div className="px-6 pt-3 pb-0 border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#152026]/70 shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-2.5">
            {[
              { id: 'credentials', label: 'Credenciais & Conexão', icon: Key },
              { id: 'stages', label: `Colunas do Quadro (${stages.length})`, icon: Sliders },
              { id: 'playground', label: 'Playground cURL / Node', icon: Terminal },
              { id: 'skill_builder', label: '🪄 Criador de Skill (IAs)', icon: Sparkles, highlight: true }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as ModalTab)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 whitespace-nowrap cursor-pointer min-h-[40px] select-none",
                    isActive
                      ? "bg-white dark:bg-[#1f2c34] text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/80 dark:border-white/10"
                      : (tab as any).highlight
                        ? "text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 font-black"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-white/5"
                  )}
                >
                  <Icon size={14} className={isActive ? "text-indigo-500" : (tab as any).highlight ? "text-amber-500 fill-amber-500" : "text-slate-400"} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conteúdo da Aba Ativa com Scroll Ergonômico */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1 text-left text-xs">
          
          {/* ======================================================== */}
          {/* ABA 1: CREDENCIAIS & CONEXÃO                             */}
          {/* ======================================================== */}
          {activeTab === 'credentials' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              
              {/* Card Hero: Toggle de Ativação da API com Switch Fluido */}
              <div className="bg-gradient-to-r from-slate-50 via-indigo-50/20 to-slate-50 dark:from-[#182229] dark:via-indigo-950/20 dark:to-[#182229] border border-slate-200/80 dark:border-white/[0.08] p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className={enabled ? "text-emerald-500" : "text-slate-400"} />
                    <h4 className="text-sm font-black text-slate-900 dark:text-white">
                      Permitir Acesso Externo via API
                    </h4>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed max-w-xl">
                    Habilita endpoints REST protegidos por token para que outros softwares, pipelines ou IAs (Cursor, Claude, Gemini, GPT-4o) possam ler demandas, mídias e mover cartões em tempo real.
                  </p>
                </div>

                {/* Switch Toggle 100% Responsivo e Ergonômico */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className={cn(
                    "text-xs font-black uppercase tracking-wider",
                    enabled ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"
                  )}>
                    {enabled ? 'Habilitada' : 'Desativada'}
                  </span>
                  
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => setEnabled(!enabled)}
                    className={cn(
                      "relative inline-flex h-7 w-14 items-center shrink-0 cursor-pointer rounded-full p-1 transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner",
                      enabled ? "bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/20" : "bg-slate-300 dark:bg-white/15"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out",
                        enabled ? "translate-x-7" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Card Cofre: Chave Secreta de API (Bearer Token) */}
              <div className="space-y-3.5 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/[0.08] p-5 rounded-2xl shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key size={16} className="text-amber-500" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Chave Secreta de API (Bearer Token)
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                    {enabled ? 'Token ativo para requisições' : 'Ative o switch acima para usar'}
                  </span>
                </div>

                {/* Input com Máscara e Botões de Ação */}
                <div className="flex items-center gap-2.5">
                  <div className="relative flex-1 min-w-0">
                    <input
                      type={showKey ? "text" : "password"}
                      readOnly
                      value={apiKey}
                      className="w-full pl-4 pr-11 py-3 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/[0.08] rounded-xl font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 select-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer p-1.5"
                      title={showKey ? "Ocultar Chave" : "Mostrar Chave"}
                    >
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopy(apiKey, 'key')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all duration-200 shrink-0 cursor-pointer shadow-sm active:scale-95 min-h-[44px]",
                      copiedKey
                        ? "bg-emerald-500 text-white shadow-emerald-500/25"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/25"
                    )}
                  >
                    {copiedKey ? <Check size={15} strokeWidth={2.5} /> : <Copy size={15} />}
                    <span>{copiedKey ? 'Copiado!' : 'Copiar Chave'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRegenerateKey}
                    className="p-3 bg-white dark:bg-[#111b21] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08] rounded-xl transition-all duration-200 shrink-0 cursor-pointer shadow-xs active:scale-95 hover:rotate-180 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Regenerar Nova Chave"
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
              </div>

              {/* Endpoints & Identificadores */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* URL Base */}
                <div className="p-4 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/[0.08] rounded-2xl space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Globe size={13} className="text-cyan-500" />
                      URL Base da API (Endpoint REST)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(baseUrl, 'baseUrl')}
                      className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1"
                      title="Copiar URL Base"
                    >
                      {copiedBaseUrl ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/[0.08] rounded-xl font-mono text-xs text-slate-700 dark:text-slate-300 select-all truncate">
                    {baseUrl}
                  </div>
                </div>

                {/* ID do Quadro */}
                <div className="p-4 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/[0.08] rounded-2xl space-y-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Layers size={13} className="text-violet-500" />
                      ID Único do Quadro (Board ID)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(board.id, 'boardId')}
                      className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1"
                      title="Copiar ID do Quadro"
                    >
                      {copiedBoardId ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/[0.08] rounded-xl font-mono text-xs text-slate-700 dark:text-slate-300 select-all truncate">
                    {board.id}
                  </div>
                </div>

              </div>

              {/* Permissões Granulares */}
              <div className="p-5 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/[0.08] rounded-2xl space-y-3.5 shadow-xs">
                <div className="flex items-center gap-2">
                  <Lock size={15} className="text-indigo-500" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Escopo de Permissões para Agentes de IA
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {[
                    { key: 'read_cards', label: 'Leitura de Cartões, Textos e Mídias (Imagens/Vídeos)' },
                    { key: 'move_cards', label: 'Movimentação entre Colunas & Relatórios de Entrega' },
                    { key: 'write_cards', label: 'Comentários Técnicos e Notas de Execução' },
                    { key: 'create_cards', label: 'Criação de Novos Cartões via API' }
                  ].map(perm => (
                    <label 
                      key={perm.key}
                      className="flex items-center gap-3 p-3 bg-white dark:bg-[#111b21] border border-slate-200/80 dark:border-white/[0.08] rounded-xl cursor-pointer hover:border-indigo-500/30 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={permissions[perm.key as keyof typeof permissions]}
                        onChange={e => setPermissions({ ...permissions, [perm.key]: e.target.checked })}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                        {perm.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* ABA 2: MAPEAMENTO DE COLUNAS                             */}
          {/* ======================================================== */}
          {activeTab === 'stages' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-500/20 p-4 rounded-2xl">
                <div>
                  <h4 className="font-black text-indigo-900 dark:text-indigo-300 text-xs uppercase tracking-wider">
                    Identificadores Técnicos das Colunas (targetStage)
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                    Ao solicitar para a IA mover um card, passe o ID exato abaixo no campo <code className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1 py-0.5 rounded font-mono font-bold">targetStage</code>.
                  </p>
                </div>
                <span className="text-[11px] font-bold text-slate-400">
                  {stages.length} colunas ativas
                </span>
              </div>

              {/* Grid de Colunas com Cores Reais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {stages.map((stage: any, index: number) => {
                  const colorStyles = getStageColorStyles(stage.color);
                  const isCopied = copiedStageId === stage.id;
                  return (
                    <div
                      key={stage.id}
                      onClick={() => handleCopy(stage.id, 'stage')}
                      className={cn(
                        "flex items-center justify-between p-4 bg-white dark:bg-[#182229] border border-slate-200/80 dark:border-white/[0.08] rounded-2xl transition-all duration-200 cursor-pointer group shadow-xs active:scale-98",
                        colorStyles.borderHover
                      )}
                      title="Clique para copiar este ID de coluna"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={cn("w-3.5 h-3.5 rounded-full shrink-0 shadow-sm", colorStyles.dot)} />
                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 dark:text-white text-xs truncate">
                              {stage.label}
                            </span>
                            <span className="text-[9.5px] px-2 py-0.2 rounded-md font-black uppercase text-slate-400 bg-slate-100 dark:bg-white/5">
                              #{index + 1}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                            <span>id:</span>
                            <span className="bg-indigo-500/10 px-1.5 py-0.5 rounded text-indigo-700 dark:text-indigo-300">
                              {stage.id}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={cn(
                        "flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black transition-colors shrink-0",
                        isCopied 
                          ? "bg-emerald-500 text-white" 
                          : "bg-slate-100 dark:bg-white/10 text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                      )}>
                        {isCopied ? (
                          <>
                            <Check size={12} strokeWidth={3} />
                            <span>Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copiar ID</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* ABA 3: PLAYGROUND & CÓDIGOS PARA IAS                     */}
          {/* ======================================================== */}
          {activeTab === 'playground' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              
              {/* Terminal SaaS Premium (Estilo VS Code / Mac OS) */}
              <div className="bg-slate-950 dark:bg-[#0c1317] border border-slate-800 dark:border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                
                {/* Header do Terminal com Botões de Janela e Seletor de Linguagens */}
                <div className="px-4 py-3 bg-black/50 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 mr-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-slate-400">
                      Terminal de Integração da API
                    </span>
                  </div>

                  {/* Seletor de Linguagem */}
                  <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10">
                    {(['curl', 'js', 'python'] as const).map(lang => (
                      <button
                        key={lang}
                        onClick={() => setActiveCodeLang(lang)}
                        className={cn(
                          "px-3.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-150 cursor-pointer",
                          activeCodeLang === lang
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-white"
                        )}
                      >
                        {lang === 'js' ? 'Node.js' : lang}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pílulas de Ações da API */}
                <div className="px-4 py-2.5 bg-black/30 border-b border-white/5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {[
                    { id: 'move', label: '1. Mover Card + Entrega IA' },
                    { id: 'list', label: '2. Listar Cards + Mídias' },
                    { id: 'get', label: '3. Obter Detalhes & Imagens' },
                    { id: 'comment', label: '4. Comentar no Card' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveActionTab(tab.id as any)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer",
                        activeActionTab === tab.id
                          ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Área de Código Formatado */}
                <div className="relative p-4 sm:p-5">
                  <pre className="font-mono text-[11.5px] leading-relaxed text-cyan-300 overflow-x-auto custom-scrollbar select-all">
                    <code>{getCodeSnippet()}</code>
                  </pre>

                  {/* Botão Flutuante de Cópia com Efeito de Sucesso */}
                  <button
                    type="button"
                    onClick={() => handleCopy(getCodeSnippet(), 'code')}
                    className={cn(
                      "absolute top-4 right-4 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold backdrop-blur-md transition-all active:scale-95 cursor-pointer shadow-lg",
                      copiedCodeTab === activeActionTab
                        ? "bg-emerald-500 text-white shadow-emerald-500/30"
                        : "bg-white/10 hover:bg-white/20 text-white border border-white/15"
                    )}
                  >
                    {copiedCodeTab === activeActionTab ? (
                      <>
                        <Check size={14} strokeWidth={2.5} />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copiar Código</span>
                      </>
                    )}
                  </button>
                </div>

              </div>

              {/* Dica de Integração com LLMs */}
              <div className="p-3.5 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center gap-3">
                <Bot size={20} className="text-indigo-500 shrink-0" />
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong>Dica Pro:</strong> O endpoint de leitura retorna o objeto <code className="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 px-1 py-0.5 rounded font-mono font-bold">ai_context.image_urls_for_vision</code> com links diretos das capturas de tela para alimentar Gemini Vision, Claude ou GPT-4o sem conversões manuais.
                </p>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* ABA 4: CRIADOR DE SKILL & CONHECIMENTO PARA IAS          */}
          {/* ======================================================== */}
          {activeTab === 'skill_builder' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              
              {/* Hero Banner do Criador de Skill */}
              <div className="bg-gradient-to-r from-amber-500/10 via-violet-600/10 to-indigo-600/10 dark:from-amber-500/15 dark:via-violet-600/15 dark:to-indigo-600/15 border border-amber-500/25 dark:border-amber-400/20 p-5 rounded-2xl space-y-2 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/25 shrink-0">
                      <Sparkles size={20} className="text-white fill-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">
                          Criador de Skill & Conhecimento Técnico para IAs
                        </h4>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                          Governança Inviolável
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                        Ensina a qualquer IA externa (Claude Code, Cursor Agent, ChatGPT, Codex, Antigravity) como consultar este quadro via API REST, processar demandas e mover cards respeitando a governança.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={handleCopySkill}
                      className={cn(
                        "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer min-h-[38px]",
                        copiedSkill
                          ? "bg-emerald-500 text-white shadow-emerald-500/25"
                          : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/25"
                      )}
                    >
                      {copiedSkill ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} />}
                      <span>{copiedSkill ? 'Copiado!' : 'Copiar SKILL.md'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadSkill}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-[#182229] hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 transition-all shadow-xs active:scale-95 cursor-pointer min-h-[38px]"
                      title="Baixar arquivo SKILL.md"
                    >
                      {downloadedSkill ? <Check size={14} className="text-emerald-500" /> : <Download size={14} />}
                      <span>{downloadedSkill ? 'Baixado!' : 'Baixar .md'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 3 Cartões de Governança Inviolável Visual (Regra do Usuário) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                
                {/* 1. Em Análise (Bloqueado) */}
                <div className="p-3.5 bg-rose-500/5 dark:bg-rose-950/20 border border-rose-500/20 rounded-2xl space-y-1">
                  <div className="flex items-center gap-2">
                    <Lock size={15} className="text-rose-500" />
                    <span className="font-black text-rose-700 dark:text-rose-400 text-xs">
                      1. {analysisStageObj.label} (Bloqueado)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                    <strong>Somente Leitura:</strong> A IA é estritamente proibida de codificar ou mover cards desta lista. Aguardam aprovação manual.
                  </p>
                </div>

                {/* 2. Em Desenvolvimento (Alvo Exclusivo) */}
                <div className="p-3.5 bg-amber-500/10 dark:bg-amber-950/25 border border-amber-500/30 rounded-2xl space-y-1 ring-2 ring-amber-500/20">
                  <div className="flex items-center gap-2">
                    <Zap size={15} className="text-amber-500 fill-amber-500" />
                    <span className="font-black text-amber-700 dark:text-amber-300 text-xs">
                      2. {devStageObj.label} (Alvo Único)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                    <strong>Foco Exclusivo:</strong> A IA só pega cards desta lista! Processa a fila em sequência até zerar todos os pendentes.
                  </p>
                </div>

                {/* 3. Em Testes & QA (Destino com Documentação) */}
                <div className="p-3.5 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-2xl space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckSquare size={15} className="text-emerald-500" />
                    <span className="font-black text-emerald-700 dark:text-emerald-400 text-xs">
                      3. {testStageObj.label} (Destino QA)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                    <strong>Documentação Obrigatória:</strong> Ao resolver o card, a IA documenta o que fez e move imediatamente para homologação.
                  </p>
                </div>

              </div>

              {/* Controles de Configuração da Skill */}
              <div className="p-4 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/[0.08] rounded-2xl space-y-3.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sliders size={16} className="text-indigo-500" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Personalização da Skill da IA
                    </h4>
                  </div>

                  {/* Seletor de Modo de Exibição */}
                  <div className="flex items-center bg-white dark:bg-[#111b21] p-1 rounded-xl border border-slate-200 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => setSkillViewMode('preview')}
                      className={cn(
                        "px-3 py-1 rounded-lg text-[10.5px] font-black transition-all cursor-pointer",
                        skillViewMode === 'preview'
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      )}
                    >
                      Visualização
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkillViewMode('raw')}
                      className={cn(
                        "px-3 py-1 rounded-lg text-[10.5px] font-black transition-all cursor-pointer",
                        skillViewMode === 'raw'
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      )}
                    >
                      Código Markdown (.md)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Comando Gatilho */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Terminal size={13} className="text-cyan-500" />
                      Comando de Ativação no Chat da IA
                    </label>
                    <input
                      type="text"
                      value={commandTrigger}
                      onChange={(e) => setCommandTrigger(e.target.value)}
                      placeholder="Ex: Fila dev ou /fila-dev"
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/[0.08] rounded-xl font-mono text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
                    />
                    <p className="text-[10px] text-slate-400">
                      Toda vez que você digitar isso na IA, ela ativará a esteira deste quadro.
                    </p>
                  </div>

                  {/* Identificador / Nome do Arquivo */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileText size={13} className="text-violet-500" />
                      Nome do Arquivo / Identificador da Skill
                    </label>
                    <input
                      type="text"
                      value={skillSlug}
                      onChange={(e) => setSkillSlug(e.target.value)}
                      placeholder="Ex: fila-dev-chatbot-crm"
                      className="w-full px-3.5 py-2.5 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/[0.08] rounded-xl font-mono text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
                    />
                    <p className="text-[10px] text-slate-400">
                      Nome salvo no cabeçalho YAML para indexação automática de agentes.
                    </p>
                  </div>
                </div>

                {/* Seletor de IA Destino */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Bot size={13} className="text-indigo-500" />
                    Onde você vai utilizar esta Skill?
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'universal', label: 'Universal / Antigravity', sub: '.agents/skills/' },
                      { id: 'cursor', label: 'Cursor IDE', sub: '.cursorrules' },
                      { id: 'claude', label: 'Claude Code', sub: '.claude/skills/' },
                      { id: 'chatgpt', label: 'ChatGPT / Codex', sub: 'Custom Instructions' }
                    ].map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setTargetAiPreset(item.id as any)}
                        className={cn(
                          "p-2.5 rounded-xl border text-left transition-all cursor-pointer",
                          targetAiPreset === item.id
                            ? "bg-indigo-500/10 border-indigo-500 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20"
                            : "bg-white dark:bg-[#111b21] border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20"
                        )}
                      >
                        <div className="font-extrabold text-xs">{item.label}</div>
                        <div className="font-mono text-[9.5px] opacity-70 mt-0.5">{item.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Área de Visualização da Skill Gerada */}
              {skillViewMode === 'preview' ? (
                <div className="p-5 bg-white dark:bg-[#182229] border border-slate-200/80 dark:border-white/[0.08] rounded-2xl space-y-4 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        SKILL.md &bull; {skillSlug}.md
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-2.5 py-0.5 rounded-lg border border-indigo-500/20">
                      Gatilho: "{commandTrigger}"
                    </span>
                  </div>

                  {/* Resumo Estruturado dos Pontos Ensinados para a IA */}
                  <div className="space-y-3">
                    <div className="p-3.5 bg-slate-50 dark:bg-[#111b21] rounded-xl border border-slate-200/60 dark:border-white/5 space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        1. Credenciais & Segurança Embutida
                      </span>
                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        A skill já injeta a URL base oficial (<code className="font-mono text-cyan-600 dark:text-cyan-400">{baseUrl}</code>), o token secreto de API e o ID do quadro, dispensando configurações manuais.
                      </p>
                    </div>

                    <div className="p-3.5 bg-slate-50 dark:bg-[#111b21] rounded-xl border border-slate-200/60 dark:border-white/5 space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        2. Regra de Execução Estrita
                      </span>
                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        A IA é instruída a <strong>apenas</strong> assumir cartões da coluna <span className="font-bold text-amber-600 dark:text-amber-400">"{devStageObj.label}"</span>. Cartões em <span className="font-bold text-rose-500">"{analysisStageObj.label}"</span> são estritamente bloqueados.
                      </p>
                    </div>

                    <div className="p-3.5 bg-slate-50 dark:bg-[#111b21] rounded-xl border border-slate-200/60 dark:border-white/5 space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        3. Ciclo de Entrega e Transição para Homologação
                      </span>
                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        Ao resolver cada demanda, a IA deve registrar o sumário da entrega (arquivos modificados e testes) e mover o cartão automaticamente para <span className="font-bold text-emerald-600 dark:text-emerald-400">"{testStageObj.label}"</span> via chamada REST.
                      </p>
                    </div>
                  </div>

                  {/* Instruções de Instalação Rápida */}
                  <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-500/20 rounded-xl flex items-start gap-3">
                    <Sparkles size={18} className="text-indigo-500 shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        Como utilizar agora:
                      </span>
                      <p>
                        Clique em <strong>"Baixar .md"</strong> ou <strong>"Copiar SKILL.md"</strong> e cole o conteúdo no arquivo de conhecimento da sua IA favorita. Sempre que você digitar <code className="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 px-1 py-0.5 rounded font-mono font-bold">{commandTrigger}</code>, ela executará toda a fila dev com autonomia máxima!
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Visualizador Raw Markdown */
                <div className="relative bg-slate-950 dark:bg-[#0c1317] border border-slate-800 dark:border-white/[0.1] rounded-2xl shadow-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-black/60 border-b border-white/10 flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-400">
                      {skillSlug}.md &bull; Markdown Formatado
                    </span>
                    <button
                      type="button"
                      onClick={handleCopySkill}
                      className="text-xs text-indigo-400 hover:text-white flex items-center gap-1 font-bold cursor-pointer"
                    >
                      {copiedSkill ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedSkill ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                  <pre className="p-5 font-mono text-[11.5px] leading-relaxed text-slate-300 max-h-96 overflow-y-auto custom-scrollbar select-all whitespace-pre-wrap">
                    {generateSkillMarkdown()}
                  </pre>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer Fixo com Botões de Ação Ergonômicos */}
        <div className="px-6 py-4.5 border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/90 dark:bg-[#111b21] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                <CheckCircle2 size={16} /> Configurações da API salvas com sucesso!
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-5 py-2.5 bg-slate-200/80 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-all duration-200 text-xs active:scale-95 cursor-pointer min-h-[44px] flex items-center justify-center"
            >
              Fechar
            </button>
            
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-extrabold rounded-xl shadow-lg shadow-indigo-500/25 transition-all duration-200 text-xs active:scale-95 cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              {saving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check size={15} strokeWidth={2.5} />
                  <span>Salvar Configurações</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
