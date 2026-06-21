import React, { useState, useEffect } from 'react';
import { 
  Puzzle, 
  Key, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  ExternalLink, 
  Code2, 
  Terminal, 
  Layers, 
  AlertTriangle,
  ChevronRight,
  MessageSquare,
  FileCode,
  Globe,
  Settings,
  HelpCircle,
  Zap,
  Plus,
  Trash2,
  Edit,
  Play,
  Sparkles,
  Info,
  Sliders,
  X
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

interface Instance {
  id: string;
  display_name: string;
  status: string;
  api_key: string | null;
  color?: string;
}

interface WebhookTrigger {
  id: string;
  tenant_id: string;
  name: string;
  event_type: 'message_received' | 'ticket_resolved' | 'ai_paused';
  action_type: 'webhook_get' | 'webhook_post';
  url: string;
  headers: Record<string, string>;
  body_template: string | null;
  is_active: boolean;
  created_at: string;
}

export default function Integrations() {
  const tenantInfo = useChatStore(state => state.tenantInfo);
  const updateTenantSettings = useChatStore(state => state.updateTenantSettings);
  const tenantIdFromStore = tenantInfo?.id;
  const tenantId = tenantIdFromStore || (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
  
  const [globalApiKey, setGlobalApiKey] = useState<string>('');
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);

  // Gemini API Key states
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [isSavingGeminiKey, setIsSavingGeminiKey] = useState(false);

  const geminiApiKeyFromSettings = tenantInfo?.settings?.gemini_api_key;

  useEffect(() => {
    if (geminiApiKeyFromSettings) {
      setGeminiKeyInput(geminiApiKeyFromSettings);
    } else {
      setGeminiKeyInput('');
    }
  }, [geminiApiKeyFromSettings]);

  const handleSaveGeminiKey = async () => {
    setIsSavingGeminiKey(true);
    try {
      await updateTenantSettings({ gemini_api_key: geminiKeyInput.trim() });
      alert('Chave do Gemini atualizada com sucesso!');
    } catch (e) {
      alert('Erro ao atualizar a chave do Gemini.');
    } finally {
      setIsSavingGeminiKey(false);
    }
  };
  
  // Tabs navigation
  const [activeTab, setActiveTab] = useState<'api' | 'triggers'>('api');
  
  // Triggers states
  const [triggers, setTriggers] = useState<WebhookTrigger[]>([]);
  const [loadingTriggers, setLoadingTriggers] = useState(false);
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<WebhookTrigger | null>(null);

  // Form fields state
  const [triggerName, setTriggerName] = useState('');
  const [eventType, setEventType] = useState<'message_received' | 'ticket_resolved' | 'ai_paused'>('message_received');
  const [actionType, setActionType] = useState<'webhook_get' | 'webhook_post'>('webhook_post');
  const [triggerUrl, setTriggerUrl] = useState('');
  const [customHeaders, setCustomHeaders] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }]);
  const [bodyTemplate, setBodyTemplate] = useState('{\n  "event": "{{event}}",\n  "phone": "{{phone}}",\n  "message": "{{message}}",\n  "conversation_id": "{{conversation_id}}",\n  "contact_id": "{{contact_id}}"\n}');

  // Simulation state
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [simulating, setSimulating] = useState(false);

  // Visibilidade de chaves
  const [showGlobalKey, setShowGlobalKey] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  
  // Confirmações de Cópia
  const [copiedGlobal, setCopiedGlobal] = useState(false);
  const [copiedInstances, setCopiedInstances] = useState<Record<string, boolean>>({});
  const [copiedCode, setCopiedCode] = useState(false);
  
  // Modais de confirmação de regeneração
  const [confirmGlobalRegen, setConfirmGlobalRegen] = useState(false);
  const [confirmInstanceRegen, setConfirmInstanceRegen] = useState<string | null>(null); // Armazena id da instância
  
  // Estados dos Exemplos de Código
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [activeLangTab, setActiveLangTab] = useState<'curl' | 'node'>('curl');
  const [activeEndpointTab, setActiveEndpointTab] = useState<'text' | 'media'>('text');

  // Carregar dados (Empresa/GlobalApiKey, Instâncias e Gatilhos)
  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // 1. Carregar Empresa para pegar a global_api_key
      const { data: company, error: compError } = await supabase
        .from('companies')
        .select('global_api_key')
        .eq('id', tenantId)
        .single();
      
      if (!compError && company) {
        setGlobalApiKey(company.global_api_key || '');
      }

      // 2. Carregar Instâncias
      const { data: waInstances, error: instError } = await supabase
        .from('whatsapp_instances')
        .select('id, display_name, status, api_key, color')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!instError && waInstances) {
        setInstances(waInstances);
        if (waInstances.length > 0 && !selectedInstanceId) {
          setSelectedInstanceId(waInstances[0].id);
        }
      }

      // 3. Carregar Gatilhos
      const { data: triggerList, error: trigError } = await supabase
        .from('webhook_triggers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      
      if (!trigError && triggerList) {
        const formatted = triggerList.map((item: any) => ({
          ...item,
          headers: typeof item.headers === 'object' && item.headers !== null ? item.headers : {}
        }));
        setTriggers(formatted);
      }
    } catch (err) {
      console.error('Erro ao carregar dados de integração:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  // Ativar/desativar gatilho
  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      const { error } = await supabase
        .from('webhook_triggers')
        .update({ is_active: active })
        .eq('id', id);
      if (error) throw error;
      setTriggers(prev => prev.map(t => t.id === id ? { ...t, is_active: active } : t));
    } catch (e) {
      console.error('Erro ao alternar status do gatilho:', e);
    }
  };

  // Abrir modal de criação
  const openCreateModal = () => {
    setEditingTrigger(null);
    setTriggerName('');
    setEventType('message_received');
    setActionType('webhook_post');
    setTriggerUrl('');
    setCustomHeaders([{ key: '', value: '' }]);
    setBodyTemplate('{\n  "event": "{{event}}",\n  "phone": "{{phone}}",\n  "message": "{{message}}",\n  "conversation_id": "{{conversation_id}}",\n  "contact_id": "{{contact_id}}"\n}');
    setSimulationLogs([]);
    setShowTriggerModal(true);
  };

  // Abrir modal de edição
  const openEditModal = (trigger: WebhookTrigger) => {
    setEditingTrigger(trigger);
    setTriggerName(trigger.name);
    setEventType(trigger.event_type);
    setActionType(trigger.action_type);
    setTriggerUrl(trigger.url);
    
    const parsedHeaders = Object.entries(trigger.headers || {}).map(([key, value]) => ({
      key,
      value
    }));
    setCustomHeaders(parsedHeaders.length > 0 ? parsedHeaders : [{ key: '', value: '' }]);
    setBodyTemplate(trigger.body_template || '');
    setSimulationLogs([]);
    setShowTriggerModal(true);
  };

  // Deletar gatilho
  const handleDeleteTrigger = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este gatilho?')) return;
    try {
      const { error } = await supabase
        .from('webhook_triggers')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setTriggers(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      console.error('Erro ao deletar gatilho:', e);
    }
  };

  // Salvar gatilho (Novo ou Editado)
  const handleSaveTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    const headersObj: Record<string, string> = {};
    customHeaders.forEach(h => {
      if (h.key.trim() && h.value.trim()) {
        headersObj[h.key.trim()] = h.value.trim();
      }
    });

    const triggerData = {
      tenant_id: tenantId,
      name: triggerName.trim(),
      event_type: eventType,
      action_type: actionType,
      url: triggerUrl.trim(),
      headers: headersObj,
      body_template: actionType === 'webhook_post' ? bodyTemplate : null,
      is_active: editingTrigger ? editingTrigger.is_active : true
    };

    try {
      if (editingTrigger) {
        const { error } = await supabase
          .from('webhook_triggers')
          .update(triggerData)
          .eq('id', editingTrigger.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('webhook_triggers')
          .insert([triggerData]);
        if (error) throw error;
      }

      await fetchData(); // Recarrega tudo
      setShowTriggerModal(false);
    } catch (err) {
      console.error('Erro ao salvar gatilho:', err);
      alert('Ocorreu um erro ao salvar o gatilho. Certifique-se de preencher todos os campos corretamente.');
    }
  };

  // Simular disparo
  const handleSimulate = () => {
    if (!triggerUrl.trim()) {
      setSimulationLogs(['❌ Erro: Por favor, preencha a URL de destino para simular o disparo.']);
      return;
    }
    setSimulating(true);
    setSimulationLogs([]);

    const mockPhone = '5511975960999';
    const mockMessage = eventType === 'message_received' ? 'Olá, gostaria de saber o status do meu pedido!' : 'Ticket resolved';
    const mockConvId = 'conv_8a7b3c2d-9e1f-4a3b-2c1d';
    const mockContactId = 'cont_2b3c4d5e-6f7a-8b9c-0d1e';

    const tokens = {
      '{{event}}': eventType,
      '{{tenant_id}}': tenantId || 'default-tenant-id',
      '{{phone}}': mockPhone,
      '{{message}}': mockMessage,
      '{{conversation_id}}': mockConvId,
      '{{contact_id}}': mockContactId
    };

    let simulatedUrl = triggerUrl.trim();
    let simulatedBody = actionType === 'webhook_post' ? bodyTemplate : '';

    for (const [token, value] of Object.entries(tokens)) {
      simulatedUrl = simulatedUrl.replaceAll(token, value);
      if (actionType === 'webhook_post') {
        simulatedBody = simulatedBody.replaceAll(token, value);
      }
    }

    const headersObj: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    customHeaders.forEach(h => {
      if (h.key.trim() && h.value.trim()) {
        headersObj[h.key.trim()] = h.value.trim();
      }
    });

    const mockLogs = [
      `⚡ Iniciando simulação para evento: "${eventType}"`,
      `🔍 Analisando parâmetros do Gatilho...`,
      `⚙️ Substituindo tokens na URL...`,
      `   ↳ URL Original: ${triggerUrl}`,
      `   ↳ URL Final:    ${simulatedUrl}`,
      actionType === 'webhook_post' ? `📦 Montando payload JSON do POST...` : `📡 Configurando requisição GET...`,
      ...(actionType === 'webhook_post' ? [
        `   ↳ Body Template:`,
        simulatedBody.split('\n').map(line => `      ${line}`).join('\n')
      ] : []),
      `🔑 Adicionando Cabeçalhos HTTP:`,
      ...Object.entries(headersObj).map(([k, v]) => `   ↳ ${k}: ${v}`),
      `🚀 Disparando chamada HTTP fictícia...`,
      `⏳ Aguardando retorno do servidor remoto...`,
      `🟢 [Status 200 OK] Conexão bem-sucedida!`,
      `📂 Resposta simulada recebida:`,
      `   {`,
      `     "success": true,`,
      `     "message": "Webhook recebido com sucesso",`,
      `     "trigger_name": "${triggerName || 'Gatilho de Teste'}",`,
      `     "timestamp": "${new Date().toISOString()}"`,
      `   }`
    ];

    let currentLogIndex = 0;
    const interval = setInterval(() => {
      if (currentLogIndex < mockLogs.length) {
        setSimulationLogs(prev => [...prev, mockLogs[currentLogIndex]]);
        currentLogIndex++;
      } else {
        clearInterval(interval);
        setSimulating(false);
      }
    }, 250);
  };

  // Função auxiliar de geração de chaves seguras
  const generateSecureKey = (prefix: string) => {
    const arr = new Uint8Array(24);
    window.crypto.getRandomValues(arr);
    const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${prefix}_${hex}`;
  };

  // Gerar/Regenerar Chave Global da Empresa
  const handleRegenerateGlobalKey = async () => {
    if (!tenantId) return;
    const newKey = generateSecureKey('sk_global');
    try {
      const { error } = await supabase
        .from('companies')
        .update({ global_api_key: newKey })
        .eq('id', tenantId);

      if (error) throw error;
      
      setGlobalApiKey(newKey);
      setConfirmGlobalRegen(false);
      
      // Registrar log de auditoria
      useChatStore.getState().logOperation(
        'UPDATE',
        'companies',
        tenantId,
        { global_api_key: 'REGENERATED' },
        { global_api_key: 'REGENERATED' }
      );
    } catch (e) {
      console.error('Erro ao salvar chave global:', e);
    }
  };

  // Gerar/Regenerar Chave de uma Instância Específica
  const handleRegenerateInstanceKey = async (instanceId: string) => {
    const newKey = generateSecureKey('sk_inst');
    try {
      const { error } = await supabase
        .from('whatsapp_instances')
        .update({ api_key: newKey })
        .eq('id', instanceId);

      if (error) throw error;

      setInstances(prev => prev.map(inst => inst.id === instanceId ? { ...inst, api_key: newKey } : inst));
      setConfirmInstanceRegen(null);
      
      // Registrar log de auditoria
      useChatStore.getState().logOperation(
        'UPDATE',
        'whatsapp_instances',
        instanceId,
        { api_key: 'REGENERATED' },
        { api_key: 'REGENERATED' }
      );
    } catch (e) {
      console.error('Erro ao salvar chave da instância:', e);
    }
  };

  // Copiar chave global para clipboard
  const copyGlobalToClipboard = () => {
    if (!globalApiKey) return;
    navigator.clipboard.writeText(globalApiKey);
    setCopiedGlobal(true);
    setTimeout(() => setCopiedGlobal(false), 2000);
  };

  // Copiar chave de instância para clipboard
  const copyInstanceToClipboard = (id: string, key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedInstances(prev => ({ ...prev, [id]: true }));
    setTimeout(() => setCopiedInstances(prev => ({ ...prev, [id]: false })), 2000);
  };

  // Alternar visibilidade de chaves específicas
  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Obter instância selecionada para os exemplos de código
  const activeInstance = instances.find(inst => inst.id === selectedInstanceId);
  const exampleInstanceName = activeInstance?.display_name || 'instancia_teste';
  const exampleApiKey = activeInstance?.api_key || 'SUA_API_KEY_DA_CAIXA';

  // Gerar Snippet de Código baseado nas abas selecionadas
  const getCodeSnippet = () => {
    if (activeLangTab === 'curl') {
      if (activeEndpointTab === 'text') {
        return `curl --request POST \\
  --url "${ENGINE_URL}/message/sendText" \\
  --header "Content-Type: application/json" \\
  --header "apikey: ${exampleApiKey}" \\
  --data '{
    "number": "5511975960999",
    "text": "Olá! Esta é uma mensagem de teste enviada pela API 🚀",
    "instance": "${exampleInstanceName}"
  }'`;
      } else {
        return `curl --request POST \\
  --url "${ENGINE_URL}/message/sendMedia" \\
  --header "apikey: ${exampleApiKey}" \\
  --header "Content-Type: multipart/form-data" \\
  --form "number=5511975960999" \\
  --form "mediatype=image" \\
  --form "instance=${exampleInstanceName}" \\
  --form "file=@/caminho/para/sua/imagem.png"`;
      }
    } else {
      // Node.js (fetch)
      if (activeEndpointTab === 'text') {
        return `const myHeaders = new Headers();
myHeaders.append("Content-Type", "application/json");
myHeaders.append("apikey", "${exampleApiKey}");

const raw = JSON.stringify({
  "number": "5511975960999",
  "text": "Olá! Esta é uma mensagem de teste enviada pela API 🚀",
  "instance": "${exampleInstanceName}"
});

const requestOptions = {
  method: 'POST',
  headers: myHeaders,
  body: raw,
  redirect: 'follow'
};

fetch("${ENGINE_URL}/message/sendText", requestOptions)
  .then(response => response.json())
  .then(result => console.log(result))
  .catch(error => console.error('Erro ao enviar mensagem:', error));`;
      } else {
        return `const myHeaders = new Headers();
myHeaders.append("apikey", "${exampleApiKey}");

const formdata = new FormData();
formdata.append("number", "5511975960999");
formdata.append("mediatype", "image");
formdata.append("instance", "${exampleInstanceName}");
// file deve ser um Blob/File do NodeJS (ou buffer)
formdata.append("file", fileInput.files[0], "imagem.png");

const requestOptions = {
  method: 'POST',
  headers: myHeaders,
  body: formdata,
  redirect: 'follow'
};

fetch("${ENGINE_URL}/message/sendMedia", requestOptions)
  .then(response => response.json())
  .then(result => console.log(result))
  .catch(error => console.error('Erro ao enviar mídia:', error));`;
      }
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(getCodeSnippet());
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#18181b] text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-indigo-400" />
          <span className="text-sm font-medium tracking-tight">Carregando integrações...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full bg-[#18181b] px-6 py-8 md:px-10 text-slate-100 font-sans animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-x-hidden">
      
      {/* Header Premium */}
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#2a2a2f]/60 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-2xl text-indigo-400">
              <Puzzle size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent animate-in fade-in duration-300">
              {activeTab === 'api' ? 'Integrações de API' : 'Gatilhos & Webhooks'}
            </h1>
          </div>
          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
            {activeTab === 'api' 
              ? 'Conecte sistemas externos (como o seu ERP, CRM ou plataformas de e-commerce) ao seu motor de WhatsApp. Use as chaves globais da empresa ou chaves de caixas específicas.'
              : 'Configure gatilhos para integrar com plataformas externas em tempo real. Dispare webhooks GET ou POST sempre que certas condições forem atendidas.'}
          </p>
        </div>

        {/* Link Swagger */}
        {activeTab === 'api' && (
          <a 
            href={`${ENGINE_URL}/swagger/teste.html`}
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 self-start md:self-center px-4 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/50 rounded-xl text-indigo-400 hover:text-indigo-300 font-medium text-sm transition-all duration-200 shadow-sm"
          >
            <Globe size={16} />
            <span>Console Swagger UI</span>
            <ExternalLink size={14} className="opacity-75" />
          </a>
        )}
      </header>

      {/* Seletor de Abas */}
      <div className="flex border-b border-[#2a2a2f]/60 mb-8">
        <button
          onClick={() => setActiveTab('api')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'api'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Key size={16} />
          <span>Chaves de API</span>
        </button>
        <button
          onClick={() => setActiveTab('triggers')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'triggers'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Zap size={16} />
          <span>Gatilhos & Webhooks</span>
        </button>
      </div>

      {activeTab === 'api' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-300">
          
          {/* Lado Esquerdo: Gestão de Chaves */}
          <div className="lg:col-span-7 space-y-8">
            
            {/* Card 1: Chave Global */}
            <section className="relative overflow-hidden backdrop-blur-xl bg-[#1e1e24]/60 border border-[#2a2a2f]/80 rounded-[24px] p-6 shadow-2xl transition-all duration-300 hover:border-[#3a3a45]">
              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                  <Globe size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-white tracking-tight">Chave de API Global</h3>
                  <p className="text-xs text-slate-400">Permite envio por qualquer caixa de entrada da empresa</p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-5">
                <div className="relative flex-1">
                  <input
                    type={showGlobalKey ? 'text' : 'password'}
                    readOnly
                    value={globalApiKey || 'sk_global_nao_gerada'}
                    className="w-full bg-[#141416]/95 border border-[#2a2a2f] rounded-xl px-4 py-3 text-sm font-mono text-indigo-300 focus:outline-none focus:border-indigo-500/50 transition-colors pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGlobalKey(!showGlobalKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showGlobalKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <button
                  onClick={copyGlobalToClipboard}
                  disabled={!globalApiKey}
                  className="p-3 bg-[#2a2a2f] hover:bg-[#34343d] border border-[#2a2a2f] rounded-xl text-slate-300 hover:text-white transition-all active:scale-95 disabled:opacity-50"
                  title="Copiar Chave"
                >
                  {copiedGlobal ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                </button>

                <button
                  onClick={() => setConfirmGlobalRegen(true)}
                  className="p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 rounded-xl text-red-400 hover:text-red-300 transition-all active:scale-95"
                  title="Regenerar Chave Global"
                >
                  <RefreshCw size={16} />
                </button>
              </div>

              {!globalApiKey && (
                <div className="mt-4 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 rounded-xl leading-relaxed">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>Nenhuma chave global ativa encontrada. Clique no botão de regenerar para criar a sua chave.</span>
                </div>
              )}
            </section>

            {/* Card 2: Chaves por Caixa de Entrada */}
            <section className="relative overflow-hidden backdrop-blur-xl bg-[#1e1e24]/60 border border-[#2a2a2f]/80 rounded-[24px] p-6 shadow-2xl transition-all duration-300 hover:border-[#3a3a45]">
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex items-center gap-2.5 mb-6">
                <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400">
                  <Key size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-white tracking-tight">Chaves de API por Caixa de Entrada</h3>
                  <p className="text-xs text-slate-400">Chaves de acesso exclusivas para cada canal de WhatsApp</p>
                </div>
              </div>

              <div className="space-y-4">
                {instances.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 border border-dashed border-[#2a2a2f] rounded-2xl">
                    Nenhuma caixa de entrada ativa encontrada no momento.
                  </div>
                ) : (
                  instances.map((inst) => (
                    <div 
                      key={inst.id}
                      className="p-4 rounded-2xl bg-[#141416]/50 border border-[#2a2a2f] flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:bg-[#141416]/80"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          {inst.color && <div className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: inst.color }}></div>}
                          <h4 className="font-medium text-slate-200 truncate">{inst.display_name}</h4>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            inst.status === 'connected' 
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-slate-500/15 text-slate-400 border border-slate-500/20'
                          }`}>
                            {inst.status === 'connected' ? 'conectado' : inst.status}
                          </span>
                        </div>
                        <div className="font-mono text-xs text-slate-400 truncate max-w-[280px]">
                          ID: {inst.id}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-1 md:justify-end">
                        <div className="relative flex-1 md:flex-initial md:w-[220px]">
                          <input
                            type={visibleKeys[inst.id] ? 'text' : 'password'}
                            readOnly
                            value={inst.api_key || 'Chave pendente'}
                            className="w-full bg-[#141416]/95 border border-[#2a2a2f] rounded-xl px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none pr-8"
                          />
                          <button
                            type="button"
                            onClick={() => toggleKeyVisibility(inst.id)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
                          >
                            {visibleKeys[inst.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>

                        <button
                          onClick={() => copyInstanceToClipboard(inst.id, inst.api_key || '')}
                          disabled={!inst.api_key}
                          className="p-2 bg-[#2a2a2f] hover:bg-[#34343d] border border-[#2a2a2f] rounded-xl text-slate-300 hover:text-white transition-all disabled:opacity-50"
                          title="Copiar"
                        >
                          {copiedInstances[inst.id] ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>

                        <button
                          onClick={() => setConfirmInstanceRegen(inst.id)}
                          className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 rounded-xl text-red-400 hover:text-red-300 transition-all"
                          title="Regenerar Chave"
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Card 3: Gemini API Key */}
            <section className="relative overflow-hidden backdrop-blur-xl bg-[#1e1e24]/60 border border-[#2a2a2f]/80 rounded-[24px] p-6 shadow-2xl transition-all duration-300 hover:border-[#3a3a45]">
              <div className="absolute top-0 right-0 w-48 h-48 bg-[#00a884]/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-2 bg-[#00a884]/10 border border-[#00a884]/20 rounded-xl text-[#00a884]">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-white tracking-tight">Chave de API do Gemini (I.A.)</h3>
                  <p className="text-xs text-slate-400">Configure sua chave individual para o recurso de Magia da IA</p>
                </div>
              </div>

              <div className="space-y-4 mt-5">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Para utilizar a Magia da IA no painel de atendimento (melhorar respostas, analisar conversações, etc.), você precisa de uma chave de API do Gemini. 
                  Você pode obter uma chave gratuita ou de uso pago em <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-[#00a884] hover:underline font-semibold inline-flex items-center gap-0.5">Google AI Studio <ExternalLink size={10} className="inline" /></a>.
                </p>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showGeminiKey ? 'text' : 'password'}
                      value={geminiKeyInput}
                      onChange={(e) => setGeminiKeyInput(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full bg-[#141416]/95 border border-[#2a2a2f] rounded-xl px-4 py-3 text-sm font-mono text-emerald-300 focus:outline-none focus:border-[#00a884]/50 transition-colors pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                    >
                      {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <button
                    onClick={handleSaveGeminiKey}
                    disabled={isSavingGeminiKey}
                    className="px-5 py-3 bg-[#00a884] hover:bg-[#00c298] text-[#111b21] rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 shadow-[0_4px_14px_0_rgba(0,168,132,0.2)]"
                  >
                    {isSavingGeminiKey ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>

                {geminiKeyInput.trim() ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 rounded-xl leading-relaxed">
                    <Check size={14} className="shrink-0" />
                    <span>Sua chave de API personalizada está ativa e sendo usada com prioridade sobre a chave padrão.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 rounded-xl leading-relaxed">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>Nenhuma chave personalizada configurada. A aplicação está usando a chave padrão do sistema (definida no servidor).</span>
                  </div>
                )}
              </div>
            </section>

          </div>

          {/* Lado Direito: Snippets de Código e Documentação */}
          <div className="lg:col-span-5 space-y-8">
            
            {/* Card: Documentação & Códigos de Exemplo */}
            <section className="backdrop-blur-xl bg-[#1e1e24]/60 border border-[#2a2a2f]/80 rounded-[24px] p-6 shadow-2xl flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-6">
                  <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                    <Code2 size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white tracking-tight">Exemplos de Código</h3>
                    <p className="text-xs text-slate-400">Integre o envio de mensagens de forma rápida</p>
                  </div>
                </div>

                {/* Seletor de Instância para os Exemplos */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    1. Escolha a Caixa / Instância
                  </label>
                  <select
                    value={selectedInstanceId}
                    onChange={(e) => setSelectedInstanceId(e.target.value)}
                    className="w-full bg-[#141416]/95 border border-[#2a2a2f] rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500/50"
                  >
                    {instances.map(inst => (
                      <option key={inst.id} value={inst.id}>
                        {inst.display_name} ({inst.api_key ? 'Chave configurada' : 'Sem chave'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Seletor de Endpoint */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    2. Tipo de Envio
                  </label>
                  <div className="flex bg-[#141416] p-1 rounded-xl border border-[#2a2a2f]">
                    <button
                      onClick={() => setActiveEndpointTab('text')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        activeEndpointTab === 'text' 
                          ? 'bg-[#2a2a2f] text-white' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Enviar Texto
                    </button>
                    <button
                      onClick={() => setActiveEndpointTab('media')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        activeEndpointTab === 'media' 
                          ? 'bg-[#2a2a2f] text-white' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Enviar Mídia
                    </button>
                  </div>
                </div>

                {/* Seletor de Linguagem */}
                <div className="flex justify-between items-center mb-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveLangTab('curl')}
                      className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                        activeLangTab === 'curl' 
                          ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' 
                          : 'bg-[#141416]/50 text-slate-400 hover:text-white border border-transparent'
                      }`}
                    >
                      cURL
                    </button>
                    <button
                      onClick={() => setActiveLangTab('node')}
                      className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                        activeLangTab === 'node' 
                          ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' 
                          : 'bg-[#141416]/50 text-slate-400 hover:text-white border border-transparent'
                      }`}
                    >
                      NodeJS
                    </button>
                  </div>

                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    {copiedCode ? (
                      <>
                        <Check size={12} className="text-emerald-400" />
                        <span className="text-emerald-400">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Copiar código</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Snippet Code block */}
                <div className="relative">
                  <pre className="w-full bg-[#141416]/95 border border-[#2a2a2f] rounded-2xl p-4 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre leading-normal styled-scrollbar max-h-[300px]">
                    {getCodeSnippet()}
                  </pre>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#2a2a2f]/60 flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400">
                  <HelpCircle size={16} />
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Você pode utilizar tanto a <b>Chave Global</b> da empresa quanto a <b>Chave da Instância</b> no cabeçalho <code>apikey</code> de suas requisições.
                </p>
              </div>
            </section>

          </div>

        </div>
      ) : (
        /* ABA DE GATILHOS (WEBHOOKS) */
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Gatilhos de Integração</h2>
              <p className="text-xs text-slate-400">Gerencie as regras e ações condicionais enviadas para URLs externas.</p>
            </div>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md active:scale-95"
            >
              <Plus size={16} />
              <span>Novo Gatilho</span>
            </button>
          </div>

          {triggers.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-[#2a2a2f] bg-[#1e1e24]/30 rounded-[24px] space-y-4">
              <div className="p-4 bg-indigo-500/10 rounded-full text-indigo-400 border border-indigo-500/20">
                <Zap size={32} className="animate-pulse" />
              </div>
              <div className="max-w-md space-y-1">
                <h4 className="font-semibold text-white">Nenhum gatilho configurado</h4>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Crie o seu primeiro gatilho de webhook para iniciar a automação em tempo real com seu CRM, ERP ou outras APIs.
                </p>
              </div>
              <button
                onClick={openCreateModal}
                className="px-4 py-2 bg-[#2a2a2f] hover:bg-[#34343d] border border-[#3a3a45] text-indigo-300 hover:text-white rounded-xl text-sm font-semibold transition-all"
              >
                Configurar Webhook
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {triggers.map(trigger => (
                <div
                  key={trigger.id}
                  className="relative overflow-hidden backdrop-blur-xl bg-[#1e1e24]/60 border border-[#2a2a2f]/80 rounded-[24px] p-6 shadow-2xl transition-all duration-300 hover:border-[#3a3a45] flex flex-col justify-between"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
                  
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400 shrink-0">
                          <Zap size={16} />
                        </div>
                        <h3 className="font-semibold text-white tracking-tight truncate">{trigger.name}</h3>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => openEditModal(trigger)}
                          className="p-1.5 hover:bg-[#2a2a2f] rounded-lg text-slate-400 hover:text-white transition-colors"
                          title="Editar"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteTrigger(trigger.id)}
                          className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 hover:text-red-300 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                        trigger.event_type === 'message_received'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/25'
                          : trigger.event_type === 'ticket_resolved'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                      }`}>
                        {trigger.event_type === 'message_received'
                          ? 'Mensagem Recebida'
                          : trigger.event_type === 'ticket_resolved'
                          ? 'Ticket Resolvido'
                          : 'IA Pausada'}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                        trigger.action_type === 'webhook_post'
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/25'
                          : 'bg-teal-500/10 text-teal-400 border-teal-500/25'
                      }`}>
                        {trigger.action_type === 'webhook_post' ? 'POST' : 'GET'}
                      </span>
                    </div>

                    <div className="bg-[#141416]/95 border border-[#2a2a2f] rounded-xl px-3 py-2.5 text-xs font-mono text-indigo-300 break-all mb-4">
                      {trigger.url}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#2a2a2f]/60 pt-4 mt-2">
                    <span className="text-[11px] text-slate-400">
                      {Object.keys(trigger.headers || {}).length} Headers configurados
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={trigger.is_active}
                        onChange={(e) => handleToggleActive(trigger.id, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[#2a2a2f] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                      <span className="ml-2 text-[11px] font-medium text-slate-300">
                        {trigger.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= MODAIS DE SEGURANÇA (CONFIRMAÇÕES) ================= */}

      {/* Modal 1: Confirmar Regeneração Chave Global */}
      {confirmGlobalRegen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#1e1e24] border border-[#2a2a2f] rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertTriangle size={22} />
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">Regenerar Chave Global?</h3>
            </div>
            
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Ao regenerar a chave global de API, <b>todas</b> as integrações externas ativas que utilizam esta chave (como o seu ERP principal) pararão de funcionar imediatamente até que você atualize a chave no outro sistema. Deseja continuar?
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmGlobalRegen(false)}
                className="px-4 py-2.5 bg-[#2a2a2f] hover:bg-[#34343d] rounded-xl text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegenerateGlobalKey}
                className="px-4 py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 rounded-xl text-sm font-medium text-white transition-colors"
              >
                Sim, Regenerar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Confirmar Regeneração Chave de Instância */}
      {confirmInstanceRegen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#1e1e24] border border-[#2a2a2f] rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertTriangle size={22} />
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">Regenerar Chave da Caixa?</h3>
            </div>
            
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Ao regenerar a chave exclusiva desta caixa de entrada, qualquer integração específica apontada diretamente para esta instância utilizando esta chave deixará de autenticar. Tem certeza que deseja prosseguir?
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmInstanceRegen(null)}
                className="px-4 py-2.5 bg-[#2a2a2f] hover:bg-[#34343d] rounded-xl text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleRegenerateInstanceKey(confirmInstanceRegen)}
                className="px-4 py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 rounded-xl text-sm font-medium text-white transition-colors"
              >
                Sim, Regenerar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE CONFIGURAÇÃO DE GATILHO ================= */}
      {showTriggerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
          <div className="w-full max-w-3xl bg-[#1e1e24] border border-[#2a2a2f] rounded-[28px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 my-8">
            <header className="flex items-center justify-between border-b border-[#2a2a2f]/60 pb-4 mb-5">
              <div className="flex items-center gap-2.5 text-indigo-400">
                <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                  <Zap size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {editingTrigger ? 'Editar Gatilho de Webhook' : 'Novo Gatilho de Webhook'}
                  </h3>
                  <p className="text-xs text-slate-400">Configure as condições e as ações de disparo do webhook.</p>
                </div>
              </div>
              <button
                onClick={() => setShowTriggerModal(false)}
                className="p-1.5 hover:bg-[#2a2a2f] rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </header>

            <form onSubmit={handleSaveTrigger} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nome do Gatilho */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Nome do Gatilho
                  </label>
                  <input
                    type="text"
                    required
                    value={triggerName}
                    onChange={(e) => setTriggerName(e.target.value)}
                    placeholder="Ex: Enviar para meu CRM"
                    className="w-full bg-[#141416]/95 border border-[#2a2a2f] rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                </div>

                {/* Condição / Evento */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Condição (Evento do Sistema)
                  </label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as any)}
                    className="w-full bg-[#141416]/95 border border-[#2a2a2f] rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500/50"
                  >
                    <option value="message_received">Mensagem Recebida (inbound)</option>
                    <option value="ticket_resolved">Ticket Resolvido (concluído)</option>
                    <option value="ai_paused">Inteligência Artificial Pausada (manual ou auto)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Tipo de Ação */}
                <div className="md:col-span-1">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Ação (Método HTTP)
                  </label>
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value as any)}
                    className="w-full bg-[#141416]/95 border border-[#2a2a2f] rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500/50"
                  >
                    <option value="webhook_post">Enviar Webhook POST</option>
                    <option value="webhook_get">Enviar Webhook GET</option>
                  </select>
                </div>

                {/* URL de Destino */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex justify-between">
                    <span>URL de Destino</span>
                    <span className="text-[10px] text-slate-500 normal-case font-normal">Aceita tokens</span>
                  </label>
                  <input
                    type="url"
                    required
                    value={triggerUrl}
                    onChange={(e) => setTriggerUrl(e.target.value)}
                    placeholder="https://seu-sistema.com/webhook"
                    className="w-full bg-[#141416]/95 border border-[#2a2a2f] rounded-xl px-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500/50 transition-colors font-mono text-xs"
                  />
                </div>
              </div>

              {/* Botões de atalhos de tokens para a URL */}
              <div className="flex flex-wrap gap-1.5 items-center bg-[#141416]/40 p-2 border border-[#2a2a2f]/60 rounded-xl">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1.5">Inserir variáveis:</span>
                {[
                  { token: '{{phone}}', label: 'Telefone' },
                  { token: '{{event}}', label: 'Evento' },
                  { token: '{{message}}', label: 'Mensagem' },
                  { token: '{{conversation_id}}', label: 'ID Conversa' },
                  { token: '{{contact_id}}', label: 'ID Contato' },
                ].map(item => (
                  <button
                    key={item.token}
                    type="button"
                    onClick={() => setTriggerUrl(prev => prev + item.token)}
                    className="px-2 py-0.5 bg-[#2a2a2f] hover:bg-[#34343d] border border-[#3a3a45] rounded-md text-[10px] font-mono text-slate-300 hover:text-white transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Cabeçalhos Customizados */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex justify-between items-center">
                  <span>Cabeçalhos HTTP Personalizados</span>
                  <button
                    type="button"
                    onClick={() => setCustomHeaders(prev => [...prev, { key: '', value: '' }])}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold uppercase tracking-wider"
                  >
                    + Adicionar Header
                  </button>
                </label>

                <div className="space-y-2 max-h-[140px] overflow-y-auto styled-scrollbar pr-1">
                  {customHeaders.map((header, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Key (Ex: Authorization)"
                        value={header.key}
                        onChange={(e) => {
                          const updated = [...customHeaders];
                          updated[idx].key = e.target.value;
                          setCustomHeaders(updated);
                        }}
                        className="flex-1 bg-[#141416]/95 border border-[#2a2a2f] rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Value (Ex: Bearer token123)"
                        value={header.value}
                        onChange={(e) => {
                          const updated = [...customHeaders];
                          updated[idx].value = e.target.value;
                          setCustomHeaders(updated);
                        }}
                        className="flex-1 bg-[#141416]/95 border border-[#2a2a2f] rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (customHeaders.length === 1) {
                            setCustomHeaders([{ key: '', value: '' }]);
                          } else {
                            setCustomHeaders(customHeaders.filter((_, i) => i !== idx));
                          }
                        }}
                        className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Corpo JSON para POST */}
              {actionType === 'webhook_post' && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Corpo JSON da Requisição
                    </label>
                    <div className="flex gap-1.5">
                      {[
                        { token: '{{phone}}', label: 'Telefone' },
                        { token: '{{message}}', label: 'Mensagem' },
                        { token: '{{event}}', label: 'Evento' },
                        { token: '{{conversation_id}}', label: 'ID Conversa' },
                        { token: '{{contact_id}}', label: 'ID Contato' },
                      ].map(item => (
                        <button
                          key={item.token}
                          type="button"
                          onClick={() => setBodyTemplate(prev => prev + ' ' + item.token)}
                          className="px-2 py-0.5 bg-[#2a2a2f] hover:bg-[#34343d] border border-[#3a3a45] rounded-md text-[10px] font-mono text-slate-300 hover:text-white transition-colors"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    value={bodyTemplate}
                    onChange={(e) => setBodyTemplate(e.target.value)}
                    placeholder="JSON Payload..."
                    className="w-full bg-[#141416]/95 border border-[#2a2a2f] rounded-xl px-4 py-2.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500/50 transition-colors styled-scrollbar"
                  />
                </div>
              )}

              {/* Simulador de Disparo */}
              <div className="border border-[#2a2a2f] bg-[#141416]/40 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <Terminal size={14} />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Simulador de Gatilho</span>
                  </div>
                  <button
                    type="button"
                    disabled={simulating}
                    onClick={handleSimulate}
                    className="flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    <Play size={10} className={simulating ? 'animate-spin' : ''} />
                    <span>{simulating ? 'Simulando...' : 'Simular Disparo'}</span>
                  </button>
                </div>

                <div className="bg-[#0c0c0e] rounded-xl p-3 border border-[#2a2a2f] font-mono text-[10px] text-emerald-400/90 h-[120px] overflow-y-auto styled-scrollbar whitespace-pre-wrap leading-normal">
                  {simulationLogs.length === 0 ? (
                    <span className="text-slate-500 italic">Nenhuma simulação executada ainda. Preencha os campos e clique em "Simular Disparo" para testar o fluxo de dados.</span>
                  ) : (
                    simulationLogs.map((log, idx) => (
                      <div key={idx} className={log.startsWith('❌') ? 'text-red-400' : log.startsWith('✅') || log.startsWith('🟢') ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Ações do Form */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2a2a2f]/60">
                <button
                  type="button"
                  onClick={() => setShowTriggerModal(false)}
                  className="px-4 py-2.5 bg-[#2a2a2f] hover:bg-[#34343d] rounded-xl text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 rounded-xl text-sm font-semibold text-white transition-colors flex items-center gap-2"
                >
                  <Sparkles size={14} />
                  <span>{editingTrigger ? 'Salvar Alterações' : 'Criar Gatilho'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .styled-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .styled-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .styled-scrollbar::-webkit-scrollbar-thumb {
          background: #2a2a2f;
          border-radius: 4px;
        }
        .styled-scrollbar:hover::-webkit-scrollbar-thumb {
          background: #3a3a45;
        }
      `}</style>
    </div>
  );
}
