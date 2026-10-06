import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Waypoints, 
  Play, 
  Pause, 
  Trash2, 
  Edit3, 
  Copy, 
  Upload, 
  FileJson, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  Bot, 
  Layers, 
  MessageSquare, 
  Filter, 
  ArrowRight, 
  Sparkles, 
  HelpCircle, 
  Settings2,
  X,
  FileCode,
  Tag,
  CornerDownRight,
  BookOpen
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';
import { cn } from '../../lib/utils';
import { parseTypebotToFlow } from '../../utils/typebotParser';
import TestSimulator from '../Flow/TestSimulator';

interface TriggerRule {
  type: 'EXACT' | 'CONTAINS' | 'STARTS_WITH' | 'ALL';
  value: string;
}

export function TypebotFlowsManager() {
  const navigate = useNavigate();
  const tenantId = typeof window !== 'undefined' 
    ? (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'))
    : null;

  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft'>('all');

  // Modais
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isTriggerModalOpen, setIsTriggerModalOpen] = useState(false);
  const [selectedFlowForTriggers, setSelectedFlowForTriggers] = useState<any | null>(null);
  const [activeFlowForTest, setActiveFlowForTest] = useState<{ nodes: any[]; edges: any[]; name: string } | null>(null);

  // Estados de criação
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowTriggerType, setNewFlowTriggerType] = useState<'EXACT' | 'CONTAINS' | 'ALL'>('EXACT');
  const [newFlowTriggerValue, setNewFlowTriggerValue] = useState('oi');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados de importação
  const [importJsonText, setImportJsonText] = useState('');
  const [importFlowName, setImportFlowName] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados de edição de gatilhos
  const [editingTriggers, setEditingTriggers] = useState<TriggerRule[]>([]);

  useEffect(() => {
    if (tenantId) {
      fetchFlows();
    }
  }, [tenantId]);

  const fetchFlows = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('flows')
        .select('*, flow_versions!fk_active_version(id, status, nodes, edges)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[TypebotFlowsManager] Erro ao buscar fluxos:', error);
      } else if (data) {
        setFlows(data);
      }
    } catch (err) {
      console.error('[TypebotFlowsManager] Exceção ao carregar fluxos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFlow = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tenantId || !newFlowName.trim()) return;

    setIsSubmitting(true);
    try {
      const triggers = newFlowTriggerType === 'ALL' 
        ? [{ type: 'ALL', value: '' }]
        : [{ type: newFlowTriggerType, value: newFlowTriggerValue.trim().toLowerCase() }];

      // 1. Cria o registro raiz do fluxo
      const { data: newFlow, error: flowErr } = await supabase
        .from('flows')
        .insert({
          tenant_id: tenantId,
          name: newFlowName.trim(),
          trigger_rules: triggers
        })
        .select()
        .single();

      if (flowErr || !newFlow) throw flowErr || new Error('Falha ao criar fluxo');

      // 2. Cria a versão inicial com nó de início e uma mensagem de boas-vindas inicial
      const startNodeId = 'start-1';
      const welcomeNodeId = 'welcome-group-1';
      const { data: version, error: verErr } = await supabase
        .from('flow_versions')
        .insert({
          flow_id: newFlow.id,
          status: 'DRAFT',
          nodes: [
            {
              id: startNodeId,
              type: 'start',
              position: { x: 120, y: 120 },
              data: { label: 'Início do Atendimento' }
            },
            {
              id: welcomeNodeId,
              type: 'typebot_group',
              position: { x: 380, y: 80 },
              data: {
                id: welcomeNodeId,
                label: 'Boas-Vindas & Opções',
                blocks: [
                  {
                    id: 'b-1',
                    flowType: 'send_message',
                    label: 'Mensagem Inicial',
                    text: 'Olá! Seja bem-vindo(a) ao nosso autoatendimento.'
                  },
                  {
                    id: 'b-2',
                    flowType: 'buttons',
                    label: 'Menu de Opções',
                    text: 'Como posso te ajudar hoje?',
                    options: ['1 - Informações', '2 - Falar com Atendente', '3 - Outros']
                  }
                ]
              }
            }
          ],
          edges: [
            {
              id: 'e-start-welcome',
              source: startNodeId,
              target: welcomeNodeId,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#10b981', strokeWidth: 3 }
            }
          ]
        })
        .select()
        .single();

      if (version) {
        // Marca como versão ativa inicial
        await supabase
          .from('flows')
          .update({ active_version_id: version.id })
          .eq('id', newFlow.id);

        setIsCreateModalOpen(false);
        setNewFlowName('');
        navigate(`/flows/${newFlow.id}/edit`);
      }
    } catch (err: any) {
      console.error('[TypebotFlowsManager] Erro ao criar novo fluxo:', err);
      alert('Erro ao criar fluxo: ' + (err.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleFlowActive = async (flow: any) => {
    try {
      const isCurrentlyActive = Boolean(flow.active_version_id);
      let newActiveVersionId: string | null = null;

      if (!isCurrentlyActive) {
        // Ativar: busca a versão mais recente
        const { data: versions } = await supabase
          .from('flow_versions')
          .select('id')
          .eq('flow_id', flow.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (versions && versions.length > 0) {
          newActiveVersionId = versions[0].id;
        }
      }

      await supabase
        .from('flows')
        .update({ 
          active_version_id: newActiveVersionId,
          updated_at: new Date().toISOString()
        })
        .eq('id', flow.id);

      setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, active_version_id: newActiveVersionId } : f));
    } catch (err) {
      console.error('[TypebotFlowsManager] Erro ao alternar status do fluxo:', err);
    }
  };

  const handleDeleteFlow = async (flowId: string, flowName: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o fluxo "${flowName}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      await supabase.from('flows').delete().eq('id', flowId);
      setFlows(prev => prev.filter(f => f.id !== flowId));
    } catch (err: any) {
      console.error('[TypebotFlowsManager] Erro ao deletar fluxo:', err);
      alert('Erro ao excluir fluxo: ' + (err.message || String(err)));
    }
  };

  const handleDuplicateFlow = async (flow: any) => {
    try {
      // 1. Busca os nós da versão ativa ou mais recente
      const { data: latestVersion } = await supabase
        .from('flow_versions')
        .select('*')
        .eq('flow_id', flow.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 2. Cria novo fluxo
      const { data: duplicatedFlow } = await supabase
        .from('flows')
        .insert({
          tenant_id: tenantId,
          name: `${flow.name} (Cópia)`,
          trigger_rules: flow.trigger_rules || []
        })
        .select()
        .single();

      if (duplicatedFlow && latestVersion) {
        const { data: newVersion } = await supabase
          .from('flow_versions')
          .insert({
            flow_id: duplicatedFlow.id,
            status: 'DRAFT',
            nodes: latestVersion.nodes || [],
            edges: latestVersion.edges || []
          })
          .select()
          .single();

        if (newVersion) {
          await supabase
            .from('flows')
            .update({ active_version_id: newVersion.id })
            .eq('id', duplicatedFlow.id);
        }
      }

      await fetchFlows();
    } catch (err: any) {
      console.error('[TypebotFlowsManager] Erro ao duplicar fluxo:', err);
      alert('Erro ao duplicar fluxo: ' + (err.message || String(err)));
    }
  };

  const handleOpenTriggersModal = (flow: any) => {
    setSelectedFlowForTriggers(flow);
    const parsedRules = typeof flow.trigger_rules === 'string' 
      ? JSON.parse(flow.trigger_rules || '[]') 
      : (flow.trigger_rules || []);
    setEditingTriggers(parsedRules.length > 0 ? parsedRules : [{ type: 'EXACT', value: 'oi' }]);
    setIsTriggerModalOpen(true);
  };

  const handleSaveTriggers = async () => {
    if (!selectedFlowForTriggers) return;
    try {
      await supabase
        .from('flows')
        .update({ 
          trigger_rules: editingTriggers,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedFlowForTriggers.id);

      setFlows(prev => prev.map(f => f.id === selectedFlowForTriggers.id ? { ...f, trigger_rules: editingTriggers } : f));
      setIsTriggerModalOpen(false);
      setSelectedFlowForTriggers(null);
    } catch (err: any) {
      alert('Erro ao salvar gatilhos: ' + (err.message || String(err)));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportError('');
    if (!importFlowName) {
      setImportFlowName(file.name.replace(/\.[^/.]+$/, ''));
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        JSON.parse(text); // Valida se é JSON válido
        setImportJsonText(text);
      } catch (err) {
        setImportError('O arquivo selecionado não contém um formato JSON válido.');
      }
    };
    reader.readAsText(file);
  };

  const handleImportTypebot = async () => {
    if (!tenantId || !importJsonText.trim()) return;

    try {
      setImportError('');
      const rawJson = JSON.parse(importJsonText);
      const { nodes, edges } = parseTypebotToFlow(rawJson);

      const flowTitle = importFlowName.trim() || rawJson.name || 'Fluxo Importado do Typebot';

      // 1. Cria o registro do fluxo
      const { data: newFlow, error: flowErr } = await supabase
        .from('flows')
        .insert({
          tenant_id: tenantId,
          name: flowTitle,
          trigger_rules: [{ type: 'EXACT', value: 'menu' }]
        })
        .select()
        .single();

      if (flowErr || !newFlow) throw flowErr || new Error('Falha ao registrar fluxo importado');

      // 2. Insere a versão com os nós parseados
      const { data: version } = await supabase
        .from('flow_versions')
        .insert({
          flow_id: newFlow.id,
          status: 'PUBLISHED',
          nodes: nodes,
          edges: edges
        })
        .select()
        .single();

      if (version) {
        await supabase
          .from('flows')
          .update({ active_version_id: version.id })
          .eq('id', newFlow.id);
      }

      setIsImportModalOpen(false);
      setImportJsonText('');
      setImportFlowName('');
      setImportFileName('');
      await fetchFlows();
      navigate(`/flows/${newFlow.id}/edit`);
    } catch (err: any) {
      console.error('[TypebotFlowsManager] Erro ao importar Typebot:', err);
      setImportError('Falha ao processar e salvar o Typebot: ' + (err.message || String(err)));
    }
  };

  const handleOpenSimulator = async (flow: any) => {
    try {
      let nodes = flow.flow_versions?.nodes;
      let edges = flow.flow_versions?.edges;

      if (!nodes || nodes.length === 0) {
        const { data: version } = await supabase
          .from('flow_versions')
          .select('nodes, edges')
          .eq('flow_id', flow.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        nodes = version?.nodes || [];
        edges = version?.edges || [];
      }

      setActiveFlowForTest({
        name: flow.name,
        nodes: nodes || [],
        edges: edges || []
      });
      setIsSimulatorOpen(true);
    } catch (err) {
      console.error('[TypebotFlowsManager] Erro ao carregar simulador:', err);
    }
  };

  // Filtragem
  const filteredFlows = flows.filter(flow => {
    const matchesSearch = flow.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      JSON.stringify(flow.trigger_rules || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'active') return Boolean(flow.active_version_id);
    if (statusFilter === 'draft') return !flow.active_version_id;

    return true;
  });

  const activeCount = flows.filter(f => Boolean(f.active_version_id)).length;

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-300">
      {/* Top Banner de Destaque / Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 backdrop-blur-md flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Total de Fluxos</span>
            <span className="text-2xl font-black text-white">{flows.length}</span>
            <span className="text-[11px] text-white/50">Fluxos estruturados no tenant</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
            <Waypoints size={24} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent border border-teal-500/20 backdrop-blur-md flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">Fluxos Ativos (No Ar)</span>
            <span className="text-2xl font-black text-white">{activeCount}</span>
            <span className="text-[11px] text-white/50">Respondendo no WhatsApp</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-inner">
            <Zap size={24} />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border border-indigo-500/20 backdrop-blur-md flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Consumo de IA</span>
            <span className="text-2xl font-black text-white">0 Tokens</span>
            <span className="text-[11px] text-emerald-400 font-semibold">100% Determinístico & Gratuito</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
            <Bot size={24} />
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Barra de Pesquisa */}
        <div className="relative w-full lg:w-[420px] group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-white/30 group-focus-within:text-emerald-400 transition-all" />
          </div>
          <input
            type="text"
            placeholder="Buscar por nome do fluxo ou palavra-chave..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-2xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner"
          />
        </div>

        {/* Filtros e Botões de Ação */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
          {/* Filtro Status */}
          <div className="flex bg-white/[0.03] border border-white/10 p-1 rounded-xl backdrop-blur-md">
            <button
              onClick={() => setStatusFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                statusFilter === 'all' ? "bg-white/15 text-white" : "text-white/40 hover:text-white/80"
              )}
            >
              Todos ({flows.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                statusFilter === 'active' ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-white/40 hover:text-white/80"
              )}
            >
              Ativos ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('draft')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                statusFilter === 'draft' ? "bg-white/15 text-white" : "text-white/40 hover:text-white/80"
              )}
            >
              Pausados ({flows.length - activeCount})
            </button>
          </div>

          {/* Importar Typebot */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-4 py-3 bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-bold rounded-2xl transition-all border border-white/10 hover:border-white/20 flex items-center gap-2 cursor-pointer shadow-sm backdrop-blur-md active:scale-95"
          >
            <Upload size={14} className="text-teal-400" />
            <span>Importar Typebot (.json)</span>
          </button>

          {/* Criar Novo Fluxo */}
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-5 py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <Plus size={16} />
            <span>Criar Novo Fluxo</span>
          </button>
        </div>
      </div>

      {/* Grid de Fluxos */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-white/40">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
          <span className="text-xs font-semibold">Carregando fluxos do tenant...</span>
        </div>
      ) : filteredFlows.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white/[0.02] border border-white/5 rounded-3xl text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Waypoints size={32} />
          </div>
          <div className="flex flex-col gap-1 max-w-md">
            <h3 className="text-base font-bold text-white">Nenhum fluxo encontrado</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              {searchTerm 
                ? 'Nenhum fluxo corresponde aos termos pesquisados. Tente outro nome ou palavra-chave.'
                : 'Crie seu primeiro fluxo determinístico estilo Typebot ou importe um arquivo .json para automatizar mensagens sem uso de inteligência artificial.'}
            </p>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <Plus size={14} />
              <span>Criar Primeiro Fluxo</span>
            </button>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/80 text-xs font-bold rounded-xl transition-all border border-white/10 flex items-center gap-2 cursor-pointer"
            >
              <Upload size={14} />
              <span>Importar do Typebot</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFlows.map(flow => {
            const isActive = Boolean(flow.active_version_id);
            const rules: TriggerRule[] = typeof flow.trigger_rules === 'string' 
              ? JSON.parse(flow.trigger_rules || '[]') 
              : (flow.trigger_rules || []);

            const nodesCount = flow.flow_versions?.nodes?.length || 0;
            const edgesCount = flow.flow_versions?.edges?.length || 0;

            return (
              <div 
                key={flow.id}
                className={cn(
                  "flex flex-col justify-between p-6 rounded-3xl border transition-all duration-300 relative group backdrop-blur-xl",
                  isActive
                    ? "bg-[#14181c]/80 border-emerald-500/30 hover:border-emerald-500/50 shadow-lg shadow-black/40 hover:shadow-emerald-500/10"
                    : "bg-[#141518]/70 border-white/10 hover:border-white/20 shadow-md shadow-black/40"
                )}
              >
                <div>
                  {/* Header do Card */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-11 h-11 rounded-2xl flex items-center justify-center transition-all",
                        isActive
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-inner"
                          : "bg-white/5 text-white/40 border border-white/10"
                      )}>
                        <Waypoints size={20} />
                      </div>
                      <div className="flex flex-col">
                        <h4 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors line-clamp-1">
                          {flow.name}
                        </h4>
                        <span className="text-[10px] text-white/40 font-mono">
                          ID: {flow.id.substring(0, 8)}...
                        </span>
                      </div>
                    </div>

                    {/* Status Pill & Switch */}
                    <button
                      type="button"
                      onClick={() => handleToggleFlowActive(flow)}
                      title={isActive ? "Pausar fluxo" : "Ativar fluxo"}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 cursor-pointer",
                        isActive
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30"
                          : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-emerald-400 animate-pulse" : "bg-white/30")} />
                      {isActive ? 'Ativo' : 'Pausado'}
                    </button>
                  </div>

                  {/* Gatilhos / Palavras-chave */}
                  <div className="p-3 bg-black/30 rounded-2xl border border-white/5 mb-4 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/40 flex items-center gap-1">
                        <Tag size={10} className="text-emerald-400" />
                        Gatilho de Disparo
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenTriggersModal(flow)}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold hover:underline cursor-pointer"
                      >
                        Configurar
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {rules.length === 0 ? (
                        <span className="text-[11px] text-white/30 italic">Nenhum gatilho definido</span>
                      ) : (
                        rules.map((r, i) => (
                          <span 
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-white/5 text-white/70 border border-white/10 text-[10px] font-mono flex items-center gap-1"
                          >
                            <span className="text-[9px] text-emerald-400 font-bold">{r.type}:</span>
                            {r.type === 'ALL' ? 'Qualquer Mensagem' : `"${r.value}"`}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Resumo de Nós */}
                  <div className="flex items-center gap-4 text-[11px] text-white/40 mb-6 font-medium">
                    <span className="flex items-center gap-1">
                      <Layers size={12} className="text-white/30" />
                      {nodesCount} {nodesCount === 1 ? 'bloco' : 'blocos'}
                    </span>
                    <span className="flex items-center gap-1">
                      <CornerDownRight size={12} className="text-white/30" />
                      {edgesCount} {edgesCount === 1 ? 'conexão' : 'conexões'}
                    </span>
                  </div>
                </div>

                {/* Barra de Ações do Card */}
                <div className="flex items-center justify-between gap-2 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-1.5">
                    {/* Botão Testar no Simulador */}
                    <button
                      type="button"
                      onClick={() => handleOpenSimulator(flow)}
                      className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/5 transition-all cursor-pointer"
                      title="Testar fluxo no Simulador"
                    >
                      <Play size={14} className="text-emerald-400" />
                    </button>

                    {/* Botão Duplicar */}
                    <button
                      type="button"
                      onClick={() => handleDuplicateFlow(flow)}
                      className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/5 transition-all cursor-pointer"
                      title="Duplicar fluxo"
                    >
                      <Copy size={14} />
                    </button>

                    {/* Botão Excluir */}
                    <button
                      type="button"
                      onClick={() => handleDeleteFlow(flow.id, flow.name)}
                      className="p-2.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-white/40 hover:text-rose-400 border border-white/5 hover:border-rose-500/30 transition-all cursor-pointer"
                      title="Excluir fluxo"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Botão Abrir Construtor Visual */}
                  <button
                    type="button"
                    onClick={() => navigate(`/flows/${flow.id}/edit`)}
                    className="flex-1 py-2.5 px-4 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
                  >
                    <Edit3 size={13} />
                    <span>Abrir no Builder</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: CRIAR NOVO FLUXO */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#141518] border border-white/10 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Waypoints size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Criar Novo Fluxo</h3>
                  <p className="text-xs text-white/50">Defina o nome e a regra de disparo inicial</p>
                </div>
              </div>
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateFlow} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/50 block mb-1.5">
                  Nome do Fluxo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Menu Principal de Autoatendimento"
                  value={newFlowName}
                  onChange={(e) => setNewFlowName(e.target.value)}
                  className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/50 block mb-1.5">
                  Tipo de Gatilho no WhatsApp
                </label>
                <select
                  value={newFlowTriggerType}
                  onChange={(e) => setNewFlowTriggerType(e.target.value as any)}
                  className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="EXACT">Palavra-chave Exata (Ex: "oi", "menu")</option>
                  <option value="CONTAINS">Mensagem Contendo Termo (Ex: "cardapio")</option>
                  <option value="ALL">Gatilho Geral / Boas-vindas (Qualquer Mensagem)</option>
                </select>
              </div>

              {newFlowTriggerType !== 'ALL' && (
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-white/50 block mb-1.5">
                    Termo ou Palavra-chave Ativadora
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: oi"
                    value={newFlowTriggerValue}
                    onChange={(e) => setNewFlowTriggerValue(e.target.value)}
                    className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 font-mono"
                  />
                  <span className="text-[11px] text-white/40 mt-1 block">
                    Quando o cliente enviar essa palavra no WhatsApp, o bot iniciará este fluxo determinístico.
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newFlowName.trim()}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? 'Criando...' : 'Criar e Abrir no Builder'}
                  <ArrowRight size={14} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: IMPORTAR TYPEBOT (.JSON) */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#141518] border border-white/10 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                  <Upload size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Importar Typebot (.json)</h3>
                  <p className="text-xs text-white/50">Carregue um fluxo exportado oficialmente do Typebot</p>
                </div>
              </div>
              <button 
                onClick={() => setIsImportModalOpen(false)}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {importError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/50 block mb-1.5">
                  Nome do Fluxo no ChatBoot
                </label>
                <input
                  type="text"
                  placeholder="Ex: Fluxo de Vendas (Typebot)"
                  value={importFlowName}
                  onChange={(e) => setImportFlowName(e.target.value)}
                  className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {/* Upload Área */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/50 block mb-1.5">
                  Arquivo Exportado do Typebot
                </label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/10 hover:border-emerald-500/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-white/[0.01] hover:bg-white/[0.03]"
                >
                  <FileCode size={32} className="text-teal-400 mb-2" />
                  <span className="text-xs font-bold text-white">
                    {importFileName ? importFileName : 'Clique para selecionar o arquivo .json'}
                  </span>
                  <span className="text-[10px] text-white/40 mt-1">
                    Exportação direta do painel do Typebot (grupos, blocos e arestas)
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!importJsonText.trim()}
                  onClick={handleImportTypebot}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 size={14} />
                  <span>Converter e Criar Fluxo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURAÇÃO DE GATILHOS */}
      {isTriggerModalOpen && selectedFlowForTriggers && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#141518] border border-white/10 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Tag size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Gatilhos de Disparo</h3>
                  <p className="text-xs text-white/50">{selectedFlowForTriggers.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsTriggerModalOpen(false)}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <span className="text-xs text-white/60 leading-relaxed block">
                Defina as palavras ou regras que farão este fluxo ser acionado automaticamente quando o cliente mandar mensagem no WhatsApp.
              </span>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {editingTriggers.map((tr, idx) => (
                  <div key={idx} className="p-3 bg-black/40 rounded-xl border border-white/10 flex items-center gap-2">
                    <select
                      value={tr.type}
                      onChange={(e) => {
                        const updated = [...editingTriggers];
                        updated[idx].type = e.target.value as any;
                        setEditingTriggers(updated);
                      }}
                      className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                    >
                      <option value="EXACT">Igual a</option>
                      <option value="CONTAINS">Contém</option>
                      <option value="STARTS_WITH">Começa com</option>
                      <option value="ALL">Qualquer Mensagem</option>
                    </select>

                    {tr.type !== 'ALL' ? (
                      <input
                        type="text"
                        placeholder="Ex: oi"
                        value={tr.value}
                        onChange={(e) => {
                          const updated = [...editingTriggers];
                          updated[idx].value = e.target.value;
                          setEditingTriggers(updated);
                        }}
                        className="flex-1 bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-emerald-500/50"
                      />
                    ) : (
                      <span className="flex-1 text-[11px] text-emerald-400 font-semibold px-2">
                        Dispara em qualquer mensagem inicial
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setEditingTriggers(editingTriggers.filter((_, i) => i !== idx))}
                      className="p-1 text-white/30 hover:text-rose-400 transition-colors"
                      title="Remover regra"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setEditingTriggers([...editingTriggers, { type: 'EXACT', value: '' }])}
                className="w-full py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-bold rounded-xl border border-dashed border-white/10 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>Adicionar Mais uma Palavra-chave</span>
              </button>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
                <button
                  type="button"
                  onClick={() => setIsTriggerModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveTriggers}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 size={14} />
                  <span>Salvar Gatilhos</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TEST SIMULATOR */}
      {isSimulatorOpen && activeFlowForTest && (
        <TestSimulator
          isOpen={isSimulatorOpen}
          onClose={() => setIsSimulatorOpen(false)}
          nodes={activeFlowForTest.nodes}
          edges={activeFlowForTest.edges}
        />
      )}
    </div>
  );
}

export default TypebotFlowsManager;
