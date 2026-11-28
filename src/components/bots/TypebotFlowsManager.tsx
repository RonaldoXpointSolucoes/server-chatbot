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
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  Bot, 
  Layers, 
  ArrowRight, 
  Sparkles, 
  X,
  FileCode,
  Tag,
  CornerDownRight,
  BookOpen,
  Building2,
  ArrowRightLeft
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';
import { cn } from '../../lib/utils';
import { parseTypebotToFlow } from '../../utils/typebotParser';
import { OFFICIAL_FLOW_TEMPLATES } from '../../data/flowTemplates';
import TestSimulator from '../Flow/TestSimulator';
import LiveFlowDiagnosticPanel from '../Flow/LiveFlowDiagnosticPanel';

interface TriggerRule {
  type: 'EXACT' | 'CONTAINS' | 'STARTS_WITH' | 'ALL';
  value: string;
}

interface TypebotFlowsManagerProps {
  onFlowsChange?: () => void;
}

const STANDALONE_TEMPLATE_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export function TypebotFlowsManager({ onFlowsChange }: TypebotFlowsManagerProps) {
  const navigate = useNavigate();
  const tenantInfo = useChatStore(state => state.tenantInfo);
  const tenantId = tenantInfo?.id || (typeof window !== 'undefined' 
    ? (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'))
    : null);

  const [flows, setFlows] = useState<any[]>([]);
  const [globalTemplates, setGlobalTemplates] = useState<any[]>([]);
  const [tenantsList, setTenantsList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft'>('all');

  // Modais
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [selectedFlowForMove, setSelectedFlowForMove] = useState<any | null>(null);
  const [targetTenantId, setTargetTenantId] = useState<string>('');
  const [moveMode, setMoveMode] = useState<'move' | 'copy'>('move');

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
      fetchTenantsAndGlobalTemplates();
    }
  }, [tenantId]);

  const fetchTenantsAndGlobalTemplates = async () => {
    try {
      const [{ data: tData }, { data: gFlows }] = await Promise.all([
        supabase.from('tenants').select('id, name').neq('id', STANDALONE_TEMPLATE_TENANT_ID).order('name'),
        supabase.from('flows').select('*').eq('tenant_id', STANDALONE_TEMPLATE_TENANT_ID).order('name')
      ]);

      if (tData) setTenantsList(tData);

      if (gFlows && gFlows.length > 0) {
        const gIds = gFlows.map(f => f.id);
        const { data: gVersions } = await supabase
          .from('flow_versions')
          .select('id, flow_id, status, nodes, edges, created_at')
          .in('flow_id', gIds)
          .order('created_at', { ascending: false });

        const enriched = gFlows.map(f => {
          const latestVer = (gVersions || []).find(v => v.flow_id === f.id);
          return { ...f, latest_version: latestVer || null };
        });
        setGlobalTemplates(enriched);
      } else {
        setGlobalTemplates([]);
      }
    } catch (err) {
      console.warn('[TypebotFlowsManager] Erro ao buscar empresas/templates:', err);
    }
  };

  const fetchFlows = async () => {
    if (!tenantId) return;
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
        // Também busca a versão mais recente de cada fluxo para exibir contagem real de blocos/conexões mesmo quando PAUSADO
        const flowIds = data.map(f => f.id);
        let versionsByFlow: Record<string, any> = {};
        if (flowIds.length > 0) {
          const { data: allVersions } = await supabase
            .from('flow_versions')
            .select('id, flow_id, status, nodes, edges, created_at')
            .in('flow_id', flowIds)
            .order('created_at', { ascending: false });

          if (allVersions) {
            for (const v of allVersions) {
              if (!versionsByFlow[v.flow_id]) {
                versionsByFlow[v.flow_id] = v;
              }
            }
          }
        }

        const enrichedFlows = data.map(f => ({
          ...f,
          latest_version: f.flow_versions || versionsByFlow[f.id] || null
        }));
        setFlows(enrichedFlows);
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

      // 1. Cria o registro raiz do fluxo (sempre PAUSADO inicialmente)
      const { data: newFlow, error: flowErr } = await supabase
        .from('flows')
        .insert({
          tenant_id: tenantId,
          name: newFlowName.trim(),
          trigger_rules: triggers,
          active_version_id: null
        })
        .select()
        .single();

      if (flowErr || !newFlow) throw flowErr || new Error('Falha ao criar fluxo');

      // 2. Cria a versão inicial com nó de início e mensagem de boas-vindas
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
                    text: `Olá! Seja bem-vindo(a) ao autoatendimento da *${tenantInfo?.name || 'nossa empresa'}*.`
                  },
                  {
                    id: 'b-2',
                    flowType: 'buttons',
                    label: 'Menu de Opções',
                    text: 'Como posso te ajudar hoje?',
                    var_name: 'opcao_menu',
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

      if (verErr) throw verErr;

      if (version) {
        setIsCreateModalOpen(false);
        setNewFlowName('');
        onFlowsChange?.();
        navigate(`/flows/${newFlow.id}/edit`);
      }
    } catch (err: any) {
      console.error('[TypebotFlowsManager] Erro ao criar novo fluxo:', err);
      alert('Erro ao criar fluxo: ' + (err.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInstallOfficialTemplate = async (template: any, isFromDatabase = false) => {
    if (!tenantId) return;
    setIsSubmitting(true);
    try {
      let nodes: any[] = [];
      let edges: any[] = [];
      let triggerRules: TriggerRule[] = [
        { type: 'EXACT', value: 'oi' },
        { type: 'EXACT', value: 'olá' },
        { type: 'EXACT', value: 'menu' }
      ];

      if (isFromDatabase) {
        nodes = template.latest_version?.nodes || [];
        edges = template.latest_version?.edges || [];
        if (Array.isArray(template.trigger_rules) && template.trigger_rules.length > 0) {
          triggerRules = template.trigger_rules;
        }
      } else {
        const parsed = parseTypebotToFlow(template.data);
        nodes = parsed.nodes;
        edges = parsed.edges;
      }

      const { data: createdFlow, error: fErr } = await supabase
        .from('flows')
        .insert({
          tenant_id: tenantId,
          name: `${template.name}`,
          trigger_rules: triggerRules,
          active_version_id: null // Nasce pausado por segurança
        })
        .select()
        .single();

      if (fErr || !createdFlow) throw fErr || new Error('Erro ao criar fluxo a partir do modelo');

      await supabase
        .from('flow_versions')
        .insert({
          flow_id: createdFlow.id,
          status: 'PUBLISHED',
          nodes,
          edges
        });

      setIsTemplatesModalOpen(false);
      await fetchFlows();
      onFlowsChange?.();
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { message: `Modelo "${template.name}" adicionado como Pausado em ${tenantInfo?.name || 'sua empresa'}!`, type: 'success' }
      }));
    } catch (err: any) {
      alert('Erro ao instalar modelo: ' + (err.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMoveOrCopyFlow = async () => {
    if (!selectedFlowForMove || !targetTenantId) return;
    setIsSubmitting(true);
    try {
      const targetTenantName = tenantsList.find(t => t.id === targetTenantId)?.name || 'Empresa destino';

      if (moveMode === 'move') {
        const { error } = await supabase
          .from('flows')
          .update({
            tenant_id: targetTenantId,
            active_version_id: null, // Pausa ao transferir para evitar disparo acidental na empresa destino
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedFlowForMove.id);

        if (error) throw error;
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { message: `Fluxo "${selectedFlowForMove.name}" movido para ${targetTenantName}!`, type: 'success' }
        }));
      } else {
        const ver = selectedFlowForMove.latest_version || selectedFlowForMove.flow_versions;
        const { data: copiedFlow, error: copyErr } = await supabase
          .from('flows')
          .insert({
            tenant_id: targetTenantId,
            name: `${selectedFlowForMove.name}`,
            trigger_rules: selectedFlowForMove.trigger_rules || [],
            active_version_id: null
          })
          .select()
          .single();

        if (copyErr || !copiedFlow) throw copyErr;

        await supabase.from('flow_versions').insert({
          flow_id: copiedFlow.id,
          status: 'PUBLISHED',
          nodes: ver?.nodes || [],
          edges: ver?.edges || []
        });

        window.dispatchEvent(new CustomEvent('toast', {
          detail: { message: `Fluxo "${selectedFlowForMove.name}" copiado para ${targetTenantName}!`, type: 'success' }
        }));
      }

      setIsMoveModalOpen(false);
      setSelectedFlowForMove(null);
      await fetchFlows();
      onFlowsChange?.();
    } catch (err: any) {
      alert('Erro ao transferir fluxo: ' + (err.message || String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const [togglingFlowId, setTogglingFlowId] = useState<string | null>(null);

  const handleToggleFlowActive = async (flow: any) => {
    if (togglingFlowId === flow.id) return;
    setTogglingFlowId(flow.id);
    try {
      const isCurrentlyActive = Boolean(flow.active_version_id);
      let newActiveVersionId: string | null = null;

      if (!isCurrentlyActive) {
        // 1. Verifica se já existe outro fluxo ativo na mesma empresa com gatilho conflitante
        const otherActiveFlows = flows.filter(f => f.id !== flow.id && Boolean(f.active_version_id));
        if (otherActiveFlows.length > 0) {
          const otherNames = otherActiveFlows.map(f => `"${f.name}"`).join(', ');
          const pauseOthers = window.confirm(
            `O fluxo ${otherNames} já está ATIVO.\n\nDeseja desativar automaticamente ${otherNames} para que apenas "${flow.name}" responda no WhatsApp sem conflito?\n(OK = Substituir e deixar apenas "${flow.name}" ativo | Cancelar = Manter ambos ativos)`
          );
          if (pauseOthers) {
            const otherIds = otherActiveFlows.map(f => f.id);
            await supabase
              .from('flows')
              .update({ active_version_id: null, updated_at: new Date().toISOString() })
              .in('id', otherIds);

            const { data: otherVers } = await supabase
              .from('flow_versions')
              .select('id')
              .in('flow_id', otherIds);
            const otherVerIds = (otherVers || []).map(v => v.id);
            if (otherVerIds.length > 0) {
              await supabase.from('conversation_states').delete().in('flow_version_id', otherVerIds);
            }
          }
        }

        // 2. Busca a versão mais recente (ou cria uma versão inicial se não houver) e garante status PUBLISHED
        const { data: versions } = await supabase
          .from('flow_versions')
          .select('id, status')
          .eq('flow_id', flow.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (versions && versions.length > 0) {
          newActiveVersionId = versions[0].id;
          if (versions[0].status !== 'PUBLISHED') {
            await supabase
              .from('flow_versions')
              .update({ status: 'PUBLISHED' })
              .eq('id', newActiveVersionId);
          }
        } else {
          const { data: createdVer } = await supabase
            .from('flow_versions')
            .insert({
              flow_id: flow.id,
              status: 'PUBLISHED',
              nodes: [],
              edges: []
            })
            .select('id')
            .single();
          if (createdVer) newActiveVersionId = createdVer.id;
        }

        // 3. Garante que as instâncias WhatsApp conectadas desta empresa estejam com bot_active = true
        const { data: instList } = await supabase
          .from('whatsapp_instances')
          .select('id, settings')
          .eq('tenant_id', tenantId);
        if (instList && instList.length > 0) {
          await Promise.all(
            instList.map(inst => {
              const curSettings = inst.settings || {};
              if (curSettings.bot_active === false || curSettings.is_api_only === true) {
                return supabase
                  .from('whatsapp_instances')
                  .update({
                    settings: { ...curSettings, bot_active: true, is_api_only: false, chat_enabled: true }
                  })
                  .eq('id', inst.id);
              }
              return Promise.resolve();
            })
          );
        }
      } else {
        // DESATIVANDO O BOOT (Switch OFF):
        // Encerra todas as sessões ativas (conversation_states) vinculadas às versões deste fluxo
        // para garantir que nenhum cliente em andamento continue recebendo respostas deste bot.
        const { data: flowVers } = await supabase
          .from('flow_versions')
          .select('id')
          .eq('flow_id', flow.id);
        const verIds = (flowVers || []).map(v => v.id);
        if (verIds.length > 0) {
          await supabase
            .from('conversation_states')
            .delete()
            .in('flow_version_id', verIds);
        }
      }

      const { error: updErr } = await supabase
        .from('flows')
        .update({ 
          active_version_id: newActiveVersionId,
          updated_at: new Date().toISOString()
        })
        .eq('id', flow.id);

      if (updErr) throw updErr;

      setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, active_version_id: newActiveVersionId } : f));
      await fetchFlows();
      onFlowsChange?.();

      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: newActiveVersionId
            ? `🟢 Boot "${flow.name}" ATIVADO e pronto para responder no WhatsApp!`
            : `⚪ Boot "${flow.name}" DESATIVADO. Ele não responderá a nenhuma mensagem.`,
          type: newActiveVersionId ? 'success' : 'info'
        }
      }));
    } catch (err: any) {
      console.error('[TypebotFlowsManager] Erro ao alternar status do fluxo:', err);
      alert('Erro ao alterar status do fluxo: ' + (err.message || String(err)));
    } finally {
      setTogglingFlowId(null);
    }
  };

  const handleDeleteFlow = async (flowId: string, flowName: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o fluxo "${flowName}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      // 1. Desvincula active_version_id do fluxo antes de remover versões
      const { error: unlinkErr } = await supabase
        .from('flows')
        .update({ active_version_id: null })
        .eq('id', flowId);
      if (unlinkErr) {
        console.warn('[TypebotFlowsManager] Aviso ao desvincular active_version_id:', unlinkErr.message);
      }

      // 2. Busca todas as versões do fluxo para limpar estados de conversa vinculados
      const { data: versions } = await supabase
        .from('flow_versions')
        .select('id')
        .eq('flow_id', flowId);
      const versionIds = (versions || []).map(v => v.id);

      if (versionIds.length > 0) {
        // Limpa ou desvincula conversation_states que apontam para qualquer versão deste fluxo
        const { error: stateDelErr } = await supabase
          .from('conversation_states')
          .delete()
          .in('flow_version_id', versionIds);
        if (stateDelErr) {
          await supabase
            .from('conversation_states')
            .update({ flow_version_id: null, current_state: 'START' })
            .in('flow_version_id', versionIds);
        }

        const { error: verDelErr } = await supabase
          .from('flow_versions')
          .delete()
          .eq('flow_id', flowId);
        if (verDelErr) {
          console.warn('[TypebotFlowsManager] Aviso ao remover flow_versions:', verDelErr.message);
        }
      }

      // 3. Remove o fluxo (ON DELETE CASCADE no banco garante limpeza residual de versões e estados)
      const { error: delError } = await supabase.from('flows').delete().eq('id', flowId);
      if (delError) {
        throw new Error(delError.message);
      }

      setFlows(prev => prev.filter(f => f.id !== flowId));
      onFlowsChange?.();
      window.dispatchEvent(new CustomEvent('toast', { 
        detail: { message: `Fluxo "${flowName}" excluído com sucesso!`, type: 'success' } 
      }));
    } catch (err: any) {
      console.error('[TypebotFlowsManager] Erro ao deletar fluxo:', err);
      alert('Erro ao excluir fluxo: ' + (err.message || String(err)));
    }
  };

  const handleDuplicateFlow = async (flow: any) => {
    try {
      const { data: latestVersion } = await supabase
        .from('flow_versions')
        .select('*')
        .eq('flow_id', flow.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Cria cópia sempre como PAUSADO (active_version_id: null) para não entrar em produção sem revisão
      const { data: duplicatedFlow } = await supabase
        .from('flows')
        .insert({
          tenant_id: tenantId,
          name: `${flow.name} (Cópia)`,
          trigger_rules: flow.trigger_rules || [],
          active_version_id: null
        })
        .select()
        .single();

      if (duplicatedFlow && latestVersion) {
        await supabase
          .from('flow_versions')
          .insert({
            flow_id: duplicatedFlow.id,
            status: 'DRAFT',
            nodes: latestVersion.nodes || [],
            edges: latestVersion.edges || []
          });
      }

      await fetchFlows();
      onFlowsChange?.();
      window.dispatchEvent(new CustomEvent('toast', { 
        detail: { message: `Cópia de "${flow.name}" criada como Pausado!`, type: 'success' } 
      }));
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
      const cleanTriggers = editingTriggers.filter(t => t.type === 'ALL' || t.value.trim() !== '');
      await supabase
        .from('flows')
        .update({ 
          trigger_rules: cleanTriggers,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedFlowForTriggers.id);

      setFlows(prev => prev.map(f => f.id === selectedFlowForTriggers.id ? { ...f, trigger_rules: cleanTriggers } : f));
      setIsTriggerModalOpen(false);
      setSelectedFlowForTriggers(null);
      window.dispatchEvent(new CustomEvent('toast', { 
        detail: { message: 'Gatilhos de disparo atualizados com sucesso!', type: 'success' } 
      }));
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
        JSON.parse(text);
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

      // Cria o registro do fluxo como PAUSADO (active_version_id: null) para revisão segura antes de ativar
      const { data: newFlow, error: flowErr } = await supabase
        .from('flows')
        .insert({
          tenant_id: tenantId,
          name: flowTitle,
          trigger_rules: [
            { type: 'EXACT', value: 'oi' },
            { type: 'EXACT', value: 'olá' },
            { type: 'EXACT', value: 'menu' }
          ],
          active_version_id: null
        })
        .select()
        .single();

      if (flowErr || !newFlow) throw flowErr || new Error('Falha ao registrar fluxo importado');

      await supabase
        .from('flow_versions')
        .insert({
          flow_id: newFlow.id,
          status: 'PUBLISHED',
          nodes: nodes,
          edges: edges
        });

      setIsImportModalOpen(false);
      setImportJsonText('');
      setImportFlowName('');
      setImportFileName('');
      await fetchFlows();
      onFlowsChange?.();
      navigate(`/flows/${newFlow.id}/edit`);
    } catch (err: any) {
      console.error('[TypebotFlowsManager] Erro ao importar Typebot:', err);
      setImportError('Falha ao processar e salvar o Typebot: ' + (err.message || String(err)));
    }
  };

  const handleOpenSimulator = async (flow: any) => {
    try {
      const versionObj = flow.flow_versions || flow.latest_version;
      let nodes = versionObj?.nodes;
      let edges = versionObj?.edges;

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

  // Calcula ordem de prioridade real de disparo entre os fluxos ativos
  const activePriorityOrderIds = [...flows]
    .filter(f => Boolean(f.active_version_id))
    .sort((a, b) => {
      const rA: TriggerRule[] = typeof a.trigger_rules === 'string' ? JSON.parse(a.trigger_rules || '[]') : (a.trigger_rules || []);
      const rB: TriggerRule[] = typeof b.trigger_rules === 'string' ? JSON.parse(b.trigger_rules || '[]') : (b.trigger_rules || []);
      const aSpec = Array.isArray(rA) && rA.some(r => r && ['EXACT', 'STARTS_WITH', 'CONTAINS'].includes(r.type));
      const bSpec = Array.isArray(rB) && rB.some(r => r && ['EXACT', 'STARTS_WITH', 'CONTAINS'].includes(r.type));
      return Number(bSpec) - Number(aSpec);
    })
    .map(f => f.id);

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-300">
      {/* 1. BARRA SLIM DE COMANDO AO VIVO (RECOLHIDA POR PADRÃO PARA MÁXIMA ÁREA ÚTIL) */}
      <LiveFlowDiagnosticPanel
        tenantId={tenantId}
        tenantName={tenantInfo?.name || 'Empresa Atual'}
        flows={flows}
        onFlowsUpdated={() => {
          fetchFlows();
          onFlowsChange?.();
        }}
      />

      {/* 2. TOOLBAR UNIFICADA: BUSCA + FILTROS COM CONTADORES + AÇÕES RÁPIDAS */}
      <div className="p-3 rounded-2xl bg-[#14161b]/90 border border-white/10 backdrop-blur-xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shadow-lg">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          {/* Barra de Pesquisa Compacta */}
          <div className="relative flex-1 max-w-md group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-white/35 group-focus-within:text-emerald-400 transition-all" />
            </div>
            <input
              type="text"
              placeholder="Buscar robô/fluxo por nome ou gatilho..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-white/35 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/40 transition-all"
            />
          </div>

          {/* Filtro Segmentado de Status */}
          <div className="flex bg-black/40 border border-white/10 p-1 rounded-xl shrink-0">
            <button
              onClick={() => setStatusFilter('all')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                statusFilter === 'all' ? "bg-white/15 text-white shadow-sm" : "text-white/45 hover:text-white/80"
              )}
            >
              Todos ({flows.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
                statusFilter === 'active'
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "text-white/45 hover:text-white/80"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Ativos ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('draft')}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                statusFilter === 'draft' ? "bg-white/15 text-white shadow-sm" : "text-white/45 hover:text-white/80"
              )}
            >
              Desativados ({flows.length - activeCount})
            </button>
          </div>
        </div>

        {/* Botões de Ação Primários e Secundários */}
        <div className="flex flex-wrap items-center gap-2 justify-end shrink-0">
          <button
            onClick={() => setIsTemplatesModalOpen(true)}
            className="px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-bold rounded-xl transition-all border border-indigo-500/25 hover:border-indigo-500/40 flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <BookOpen size={13} className="text-indigo-400" />
            <span>Modelos Prontos</span>
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-white/85 text-xs font-bold rounded-xl transition-all border border-white/10 hover:border-white/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Upload size={13} className="text-teal-400" />
            <span>Importar .JSON</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black rounded-xl transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Plus size={15} />
            <span>Novo Fluxo</span>
          </button>
        </div>
      </div>

      {/* 3. GRID DE CARDS DE BOTS COM SWITCH INTERATIVO ON/OFF */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-white/40">
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
          <span className="text-xs font-semibold">Carregando fluxos de {tenantInfo?.name || 'sua empresa'}...</span>
        </div>
      ) : filteredFlows.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-10 bg-white/[0.02] border border-white/5 rounded-3xl text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Waypoints size={28} />
          </div>
          <div className="flex flex-col gap-1 max-w-md">
            <h3 className="text-base font-bold text-white">Nenhum fluxo encontrado em {tenantInfo?.name || 'sua empresa'}</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              {searchTerm 
                ? 'Nenhum fluxo corresponde aos termos pesquisados. Tente outro nome ou palavra-chave.'
                : 'Crie seu primeiro fluxo determinístico estilo Typebot, escolha um modelo da biblioteca oficial ou importe um arquivo .json.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-1">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} />
              <span>Criar Primeiro Fluxo</span>
            </button>
            <button
              onClick={() => setIsTemplatesModalOpen(true)}
              className="px-3.5 py-2 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-xs font-bold rounded-xl transition-all border border-indigo-500/30 flex items-center gap-1.5 cursor-pointer"
            >
              <BookOpen size={14} />
              <span>Usar Modelo Pronto</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredFlows.map(flow => {
            const isActive = Boolean(flow.active_version_id);
            const isToggling = togglingFlowId === flow.id;
            const rules: TriggerRule[] = typeof flow.trigger_rules === 'string' 
              ? JSON.parse(flow.trigger_rules || '[]') 
              : (flow.trigger_rules || []);
            const visibleRules = rules.filter((r: any) => r && r.type !== '__META__' && (r as any).keyword !== '__META__');

            const versionObj = flow.flow_versions || flow.latest_version;
            const nodesCount = versionObj?.nodes?.length || 0;
            const edgesCount = versionObj?.edges?.length || 0;
            const priorityRank = isActive ? activePriorityOrderIds.indexOf(flow.id) + 1 : 0;
            const hasSpecificRule = visibleRules.some(r => r && ['EXACT', 'STARTS_WITH', 'CONTAINS'].includes(r.type));

            return (
              <div 
                key={flow.id}
                className={cn(
                  "flex flex-col justify-between p-5 rounded-3xl transition-all duration-300 relative group backdrop-blur-xl overflow-hidden",
                  isActive
                    ? "bg-gradient-to-br from-[#11221c]/95 via-[#12191e]/95 to-[#0f1317]/95 border-2 border-emerald-400/70 ring-2 ring-emerald-500/10 shadow-[0_10px_35px_rgba(16,185,129,0.18)] hover:shadow-[0_14px_45px_rgba(16,185,129,0.28)]"
                    : "bg-[#14161b]/80 border border-white/10 hover:border-white/20 shadow-lg shadow-black/40"
                )}
              >
                <div>
                  {/* Faixa Superior Compacta de Status + Switch Direto ON/OFF */}
                  <div className={cn(
                    "mb-4 -mx-5 -mt-5 px-4 py-2.5 border-b flex items-center justify-between gap-2 transition-colors",
                    isActive
                      ? "bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-emerald-600/15 border-emerald-400/35"
                      : "bg-white/[0.02] border-white/5"
                  )}>
                    <div className="flex items-center gap-2 min-w-0">
                      {isActive ? (
                        <>
                          <span className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-90" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-200 truncate">
                            Respondendo no WhatsApp
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-400 text-slate-950 shrink-0">
                            {priorityRank}º {hasSpecificRule ? 'Gatilho' : 'Geral'}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-zinc-600 shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 truncate">
                            Desativado (Não responde)
                          </span>
                        </>
                      )}
                    </div>

                    {/* SWITCH INTERATIVO DE ATIVAÇÃO / DESATIVAÇÃO DO BOT */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isActive}
                      disabled={isToggling}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFlowActive(flow);
                      }}
                      title={
                        isActive
                          ? "Switch Ligado (ON): Clique para desativar este bot e parar respostas imediatamente"
                          : "Switch Desligado (OFF): Clique para ativar este bot no WhatsApp"
                      }
                      className={cn(
                        "group/switch inline-flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-full border transition-all cursor-pointer select-none shrink-0 active:scale-95 disabled:opacity-60",
                        isActive
                          ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                          : "bg-black/40 border-white/15 text-white/50 hover:border-white/30 hover:text-white/80"
                      )}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider">
                        {isToggling ? '...' : isActive ? 'ON' : 'OFF'}
                      </span>
                      <span
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors duration-200 ease-in-out",
                          isActive ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" : "bg-zinc-700"
                        )}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transform ring-0 transition duration-200 ease-in-out",
                            isActive ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </span>
                    </button>
                  </div>

                  {/* Header do Card: Ícone + Nome + Metadados */}
                  <div className="flex items-center justify-between gap-3 mb-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all",
                        isActive
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 shadow-[0_0_18px_rgba(16,185,129,0.2)]"
                          : "bg-white/5 text-white/40 border border-white/10"
                      )}>
                        <Waypoints size={20} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <h4
                          onClick={() => navigate(`/flows/${flow.id}/edit`)}
                          className={cn(
                            "text-base font-black transition-colors truncate cursor-pointer hover:underline",
                            isActive ? "text-white group-hover:text-emerald-300" : "text-white/80"
                          )}
                          title={flow.name}
                        >
                          {flow.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/45">
                          <span className="flex items-center gap-1">
                            <Layers size={11} className="text-emerald-400/80" />
                            {nodesCount} {nodesCount === 1 ? 'bloco' : 'blocos'}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <CornerDownRight size={11} className="text-indigo-400/80" />
                            {edgesCount} {edgesCount === 1 ? 'conexão' : 'conexões'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Gatilhos de Disparo Compactos */}
                  <div className="p-2.5 bg-black/35 rounded-2xl border border-white/[0.06] mb-4 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/45 flex items-center gap-1">
                        <Tag size={10} className="text-emerald-400" />
                        Gatilho de Disparo
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenTriggersModal(flow)}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold hover:underline cursor-pointer"
                      >
                        Editar Gatilhos
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-[60px] overflow-y-auto styled-scrollbar pr-1">
                      {visibleRules.length === 0 ? (
                        <span className="text-[11px] text-white/30 italic">Nenhum gatilho definido</span>
                      ) : (
                        visibleRules.map((r, i) => (
                          <span 
                            key={i}
                            className="px-2 py-0.5 rounded-lg bg-white/[0.05] text-white/80 border border-white/10 text-[10px] font-mono flex items-center gap-1"
                          >
                            <span className="text-[9px] text-emerald-400 font-bold">
                              {r.type === 'ALL' ? 'TODOS:' : r.type === 'EXACT' ? 'IGUAL:' : r.type === 'CONTAINS' ? 'CONTÉM:' : `${r.type}:`}
                            </span>
                            {r.type === 'ALL' ? 'Qualquer Mensagem' : `"${r.value}"`}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Barra de Ações do Card */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1">
                    {/* Botão Testar no Simulador */}
                    <button
                      type="button"
                      onClick={() => handleOpenSimulator(flow)}
                      className="p-2 rounded-xl bg-white/[0.04] hover:bg-emerald-500/15 text-white/70 hover:text-emerald-300 border border-white/5 hover:border-emerald-500/30 transition-all cursor-pointer"
                      title="Testar no Simulador"
                    >
                      <Play size={14} className="text-emerald-400" />
                    </button>

                    {/* Botão Duplicar */}
                    <button
                      type="button"
                      onClick={() => handleDuplicateFlow(flow)}
                      className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/10 text-white/65 hover:text-white border border-white/5 transition-all cursor-pointer"
                      title="Duplicar Fluxo"
                    >
                      <Copy size={14} />
                    </button>

                    {/* Botão Mover/Copiar para outra Empresa */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFlowForMove(flow);
                        const firstOther = tenantsList.find(t => t.id !== tenantId)?.id || '';
                        setTargetTenantId(firstOther);
                        setMoveMode('move');
                        setIsMoveModalOpen(true);
                      }}
                      className="p-2 rounded-xl bg-white/[0.04] hover:bg-indigo-500/20 text-white/60 hover:text-indigo-300 border border-white/5 hover:border-indigo-500/30 transition-all cursor-pointer"
                      title="Transferir ou Copiar para outra Empresa"
                    >
                      <ArrowRightLeft size={14} />
                    </button>

                    {/* Botão Excluir */}
                    <button
                      type="button"
                      onClick={() => handleDeleteFlow(flow.id, flow.name)}
                      className="p-2 rounded-xl bg-white/[0.04] hover:bg-rose-500/20 text-white/45 hover:text-rose-400 border border-white/5 hover:border-rose-500/30 transition-all cursor-pointer"
                      title="Excluir Fluxo"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Botão Abrir Construtor Visual */}
                  <button
                    type="button"
                    onClick={() => navigate(`/flows/${flow.id}/edit`)}
                    className={cn(
                      "flex-1 py-2 px-3.5 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95 border",
                      isActive
                        ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-300 shadow-emerald-500/20"
                        : "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/30"
                    )}
                  >
                    <Edit3 size={13} />
                    <span>Editar no Builder</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: BIBLIOTECA DE MODELOS OFICIAIS */}
      {isTemplatesModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#141518] border border-white/10 rounded-3xl w-full max-w-3xl p-6 shadow-2xl relative max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Biblioteca de Modelos Oficiais (Typebot)</h3>
                  <p className="text-xs text-white/50">
                    Instale um fluxo completo em <strong className="text-indigo-300">{tenantInfo?.name || 'sua empresa'}</strong> (nasce Pausado para sua revisão)
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsTemplatesModalOpen(false)}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto styled-scrollbar pr-1 space-y-4 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {OFFICIAL_FLOW_TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-indigo-500/40 flex flex-col justify-between gap-4 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {tpl.category}
                        </span>
                        <Sparkles size={14} className="text-amber-400" />
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1">{tpl.name}</h4>
                      <p className="text-xs text-white/50 leading-relaxed">{tpl.description}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleInstallOfficialTemplate(tpl, false)}
                      className="w-full py-2.5 px-4 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Instalar em {tenantInfo?.name || 'Empresa Atual'}</span>
                    </button>
                  </div>
                ))}

                {globalTemplates.map((gTpl) => {
                  const nCount = gTpl.latest_version?.nodes?.length || 0;
                  const eCount = gTpl.latest_version?.edges?.length || 0;
                  return (
                    <div
                      key={gTpl.id}
                      className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-emerald-500/40 flex flex-col justify-between gap-4 transition-all"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Modelo de Gastronomia / Delivery
                          </span>
                          <span className="text-[10px] text-white/40 font-mono">
                            {nCount} blocos • {eCount} conexões
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white mb-1">{gTpl.name}</h4>
                        <p className="text-xs text-white/50 leading-relaxed">
                          Fluxo estruturado com menu interativo, envio de cardápio, horário de funcionamento e transferência para atendente.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleInstallOfficialTemplate(gTpl, true)}
                        className="w-full py-2.5 px-4 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Plus size={14} />
                        <span>Instalar em {tenantInfo?.name || 'Empresa Atual'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MOVER OU COPIAR FLUXO PARA OUTRA EMPRESA */}
      {isMoveModalOpen && selectedFlowForMove && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#141518] border border-white/10 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Building2 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Transferir ou Copiar entre Empresas</h3>
                  <p className="text-xs text-white/50 truncate max-w-[260px]">{selectedFlowForMove.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsMoveModalOpen(false)}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 border border-white/10 rounded-xl">
                <button
                  type="button"
                  onClick={() => setMoveMode('move')}
                  className={cn(
                    "py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    moveMode === 'move' ? "bg-indigo-600 text-white shadow" : "text-white/50 hover:text-white"
                  )}
                >
                  Mover Fluxo
                </button>
                <button
                  type="button"
                  onClick={() => setMoveMode('copy')}
                  className={cn(
                    "py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    moveMode === 'copy' ? "bg-emerald-600 text-white shadow" : "text-white/50 hover:text-white"
                  )}
                >
                  Copiar Fluxo
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/50 block mb-1.5">
                  Empresa de Destino
                </label>
                <select
                  value={targetTenantId}
                  onChange={(e) => setTargetTenantId(e.target.value)}
                  className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500/50"
                >
                  <option value="" disabled>Selecione uma empresa...</option>
                  {tenantsList.filter(t => t.id !== tenantId).map(t => (
                    <option key={t.id} value={t.id} className="bg-[#141518] text-white">
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-white/50">
                {moveMode === 'move'
                  ? 'O fluxo será transferido para a empresa selecionada como Pausado, deixando de aparecer na empresa atual.'
                  : 'Uma cópia idêntica dos blocos e conexões será criada como Pausado na empresa selecionada.'}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-6">
                <button
                  type="button"
                  onClick={() => setIsMoveModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !targetTenantId}
                  onClick={handleMoveOrCopyFlow}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 size={14} />
                  <span>{moveMode === 'move' ? 'Confirmar Transferência' : 'Confirmar Cópia'}</span>
                </button>
              </div>
            </div>
          </div>
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
                  <p className="text-xs text-white/50">Empresa: {tenantInfo?.name || 'Empresa Atual'}</p>
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

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-white/50 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span>O fluxo nasce como <strong>Rascunho (Pausado)</strong>. Ele nunca atende o WhatsApp até que você o ative manualmente no painel.</span>
              </div>

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
                  <p className="text-xs text-white/50">Empresa destino: {tenantInfo?.name || 'Empresa Atual'}</p>
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
                  <span>Converter e Abrir no Builder</span>
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
          onClose={() => setIsSimulatorOpen(false)}
          nodes={activeFlowForTest.nodes}
          edges={activeFlowForTest.edges}
        />
      )}
    </div>
  );
}

export default TypebotFlowsManager;
