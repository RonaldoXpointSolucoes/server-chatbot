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
  HelpCircle
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

export default function Integrations() {
  const tenantIdFromStore = useChatStore(state => state.tenantInfo?.id);
  const tenantId = tenantIdFromStore || (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
  
  const [globalApiKey, setGlobalApiKey] = useState<string>('');
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  
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

  // Carregar dados (Empresa/GlobalApiKey e Instâncias)
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
    } catch (err) {
      console.error('Erro ao carregar dados de integração:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantId]);

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
      <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#2a2a2f]/60 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-2xl text-indigo-400">
              <Puzzle size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              Integrações de API
            </h1>
          </div>
          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
            Conecte sistemas externos (como o seu ERP, CRM ou plataformas de e-commerce) ao seu motor de WhatsApp. Use as chaves globais da empresa ou chaves de caixas específicas.
          </p>
        </div>

        {/* Link Swagger */}
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
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
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
