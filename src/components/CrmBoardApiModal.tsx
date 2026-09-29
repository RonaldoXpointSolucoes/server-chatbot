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
  CheckCircle2
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

export default function CrmBoardApiModal({
  isOpen,
  onClose,
  board,
  onBoardUpdated
}: CrmBoardApiModalProps) {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedBoardId, setCopiedBoardId] = useState<boolean>(false);
  const [copiedBaseUrl, setCopiedBaseUrl] = useState<boolean>(false);
  const [copiedCodeTab, setCopiedCodeTab] = useState<string | null>(null);
  const [copiedStageId, setCopiedStageId] = useState<string | null>(null);
  
  const [activeCodeLang, setActiveCodeLang] = useState<'curl' | 'js' | 'python'>('curl');
  const [activeActionTab, setActiveActionTab] = useState<'list' | 'get' | 'move' | 'comment'>('move');
  
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

  // Gerador dinâmico de códigos de exemplo
  const targetExampleStage = stages.find(s => s.id === 'testing' || s.label?.toLowerCase().includes('teste'))?.id || stages[stages.length - 1]?.id || 'testing';
  const filterExampleStage = stages.find(s => s.id === 'development' || s.label?.toLowerCase().includes('desenvolvimento'))?.id || stages[0]?.id || 'development';

  const getCodeSnippet = () => {
    const authHeader = apiKey ? apiKey : '<SUA_API_KEY>';
    const bId = board.id;

    if (activeCodeLang === 'curl') {
      if (activeActionTab === 'list') {
        return `# 1. Listar cartões da coluna '${filterExampleStage}' com imagens e AI Pack\ncurl -X GET "${baseUrl}/boards/${bId}/cards?status=${filterExampleStage}" \\\n  -H "x-api-key: ${authHeader}"`;
      }
      if (activeActionTab === 'get') {
        return `# 2. Obter detalhes completos do cartão (inclui imagens em alta resolução)\ncurl -X GET "${baseUrl}/boards/${bId}/cards/<CARD_ID>" \\\n  -H "x-api-key: ${authHeader}"`;
      }
      if (activeActionTab === 'move') {
        return `# 3. Mover o cartão para '${targetExampleStage}' e registrar a entrega técnica da IA\ncurl -X POST "${baseUrl}/boards/${bId}/cards/<CARD_ID>/move" \\\n  -H "x-api-key: ${authHeader}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "targetStage": "${targetExampleStage}",\n    "agentName": "Claude 3.7 / Cursor Agent",\n    "comment": "Implementação finalizada e validada em ambiente local.",\n    "deliveryReport": {\n      "summary": "Implementados novos componentes e rotas da API.",\n      "files": ["src/components/CrmBoardApiModal.tsx"]\n    }\n  }'`;
      }
      return `# 4. Registrar anotação ou comentário de progresso técnico no cartão\ncurl -X POST "${baseUrl}/boards/${bId}/cards/<CARD_ID>/comment" \\\n  -H "x-api-key: ${authHeader}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "comment": "Iniciei a análise das imagens e a refatoração do layout.",\n    "author": "Agente IA Autônomo"\n  }'`;
    }

    if (activeCodeLang === 'js') {
      if (activeActionTab === 'list') {
        return `// Buscar cartões para a IA processar\nconst res = await fetch("${baseUrl}/boards/${bId}/cards?status=${filterExampleStage}", {\n  headers: { "x-api-key": "${authHeader}" }\n});\nconst { cards } = await res.json();\n\n// Para cada cartão, acesse 'card.ai_context.image_urls_for_vision' ou 'card.media'\ncards.forEach(card => {\n  console.log(\`Demanda: \${card.title} (\${card.media.length} mídias anexadas)\`);\n});`;
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
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#111b21] w-full max-w-3xl rounded-[28px] border border-slate-200/80 dark:border-white/[0.08] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        
        {/* Header com Identidade Visual Premium */}
        <div className="px-6 py-4.5 border-b border-slate-200/80 dark:border-white/[0.08] bg-gradient-to-r from-violet-500/5 via-indigo-500/5 to-cyan-500/5 dark:from-violet-500/10 dark:to-cyan-500/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-4 ring-indigo-500/10">
              <Zap size={20} className="text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white font-sans tracking-tight">
                  Acesso à API & Automação com IAs
                </h3>
                <span className={cn(
                  "text-[9.5px] px-2.5 py-0.5 rounded-full font-black tracking-wider uppercase border flex items-center gap-1",
                  enabled 
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-white/10"
                )}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", enabled ? "bg-emerald-500 animate-pulse" : "bg-slate-400")} />
                  {enabled ? 'API Ativa' : 'Desativada'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 truncate max-w-md">
                Quadro: <span className="font-bold text-slate-700 dark:text-slate-300">{board.name}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo com Scroll Suave */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1 text-left text-xs">
          
          {/* Card 1: Master Switch de Habilitação da API */}
          <div className="bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/[0.08] p-4.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className={enabled ? "text-emerald-500" : "text-slate-400"} />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Permitir Acesso Externo via API
                </h4>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed max-w-lg">
                Habilita endpoints REST seguros com chave de autenticação para que outros softwares, scripts ou IAs (Cursor, Claude, Gemini, GPT-4o) possam ler, criar, comentar e mover cartões deste quadro.
              </p>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={cn(
                "relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
                enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-white/20"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                  enabled ? "translate-x-6" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* Card 2: Chave de Segurança (API Key) & Dados de Conexão */}
          <div className="space-y-4 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/[0.08] p-5 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key size={15} className="text-amber-500" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Chave Secreta de API (Bearer Token)
                </h4>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">
                {enabled ? 'Pronta para uso' : 'Ative a API acima para utilizar'}
              </span>
            </div>

            {/* Input da Chave com Máscara e Botões */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? "text" : "password"}
                  readOnly
                  value={apiKey}
                  className="w-full pl-3.5 pr-10 py-2.5 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/[0.08] rounded-xl font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 select-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  title={showKey ? "Ocultar Chave" : "Mostrar Chave"}
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleCopy(apiKey, 'key')}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 shrink-0 cursor-pointer shadow-xs",
                  copiedKey
                    ? "bg-emerald-500 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white"
                )}
              >
                {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedKey ? 'Copiado!' : 'Copiar'}</span>
              </button>

              <button
                type="button"
                onClick={handleRegenerateKey}
                className="p-2.5 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-slate-300 rounded-xl transition-all duration-200 shrink-0 cursor-pointer shadow-xs hover:rotate-180"
                title="Regenerar Nova Chave"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            {/* URL Base e Board ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  URL Base da API (Endpoint REST)
                </label>
                <div className="flex items-center gap-1.5 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/[0.08] px-3 py-2 rounded-xl">
                  <Globe size={13} className="text-cyan-500 shrink-0" />
                  <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate flex-1 select-all">
                    {baseUrl}
                  </span>
                  <button 
                    onClick={() => handleCopy(baseUrl, 'baseUrl')}
                    className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1"
                    title="Copiar URL Base"
                  >
                    {copiedBaseUrl ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  ID Único do Quadro (Board ID)
                </label>
                <div className="flex items-center gap-1.5 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/[0.08] px-3 py-2 rounded-xl">
                  <Layers size={13} className="text-violet-500 shrink-0" />
                  <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate flex-1 select-all">
                    {board.id}
                  </span>
                  <button 
                    onClick={() => handleCopy(board.id, 'boardId')}
                    className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1"
                    title="Copiar ID do Quadro"
                  >
                    {copiedBoardId ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Mapeamento de Colunas do Quadro (IDs para a IA mover cards) */}
          <div className="space-y-3 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/[0.08] p-5 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders size={15} className="text-indigo-500" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Mapeamento das Colunas deste Quadro (targetStage)
                </h4>
              </div>
              <span className="text-[10px] text-slate-400">
                Passe o ID exato no campo <code className="bg-slate-200 dark:bg-white/10 px-1 py-0.5 rounded text-indigo-500 font-bold">targetStage</code>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {stages.map((stage: any, index: number) => (
                <div 
                  key={stage.id} 
                  onClick={() => handleCopy(stage.id, 'stage')}
                  className="flex items-center justify-between p-2.5 bg-white dark:bg-[#111b21] border border-slate-200/70 dark:border-white/[0.06] rounded-xl hover:border-indigo-500/40 transition-colors cursor-pointer group shadow-2xs"
                  title="Clique para copiar o ID desta coluna"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0 bg-indigo-500" />
                    <div className="truncate">
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-xs truncate">
                        {stage.label}
                      </p>
                      <p className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold truncate">
                        id: {stage.id}
                      </p>
                    </div>
                  </div>
                  <div className="text-slate-400 group-hover:text-indigo-500 transition-colors shrink-0">
                    {copiedStageId === stage.id ? (
                      <Check size={13} className="text-emerald-500" />
                    ) : (
                      <Copy size={13} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 4: Snippets e Exemplos Prontos de Código (Playground da API) */}
          <div className="space-y-3 bg-slate-900 dark:bg-[#0c1317] border border-slate-800 dark:border-white/[0.08] p-5 rounded-2xl shadow-xl text-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-cyan-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  Exemplos Prontos de Integração para IAs e Softwares
                </h4>
              </div>

              {/* Seletor de Linguagem */}
              <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 self-start sm:self-auto">
                {(['curl', 'js', 'python'] as const).map(lang => (
                  <button
                    key={lang}
                    onClick={() => setActiveCodeLang(lang)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-150 cursor-pointer",
                      activeCodeLang === lang
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    {lang === 'js' ? 'Node / JS' : lang}
                  </button>
                ))}
              </div>
            </div>

            {/* Seletor de Ação da API */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
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
                      ? "bg-white/15 text-white border border-white/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Caixa de Código Formatada com Botão Copiar */}
            <div className="relative mt-2">
              <pre className="p-4 bg-black/60 rounded-xl font-mono text-[11px] text-cyan-300 overflow-x-auto custom-scrollbar border border-white/5 leading-relaxed selection:bg-indigo-500/40">
                <code>{getCodeSnippet()}</code>
              </pre>
              <button
                type="button"
                onClick={() => handleCopy(getCodeSnippet(), 'code')}
                className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold backdrop-blur-md border border-white/10 transition-all active:scale-95 cursor-pointer"
              >
                {copiedCodeTab === activeActionTab ? (
                  <>
                    <Check size={12} className="text-emerald-400" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Copiar Código</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </div>

        {/* Footer com Botão de Salvar Alterações */}
        <div className="px-6 py-4 border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#111b21] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                <CheckCircle2 size={16} /> Configurações salvas com sucesso!
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-200/80 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-all duration-200 text-xs active:scale-95 cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-extrabold rounded-xl shadow-lg shadow-indigo-500/25 transition-all duration-200 text-xs active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check size={14} strokeWidth={2.5} />
                  <span>Salvar Configurações da API</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
