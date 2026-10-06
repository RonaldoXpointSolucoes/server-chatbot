import { useChatStore } from '../store/chatStore';
import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import {
    ArrowLeft,
    Save,
    Settings2,
    MessageSquare,
    Image as ImageIcon,
    Video,
    Headphones,
    Code2,
    Type,
    Hash,
    Mail,
    Globe,
    Calendar,
    Clock,
    Phone,
    MousePointerClick,
    ImagePlay,
    CreditCard,
    Star,
    FileUp,
    LayoutTemplate,
    PenTool,
    Filter,
    ExternalLink,
    CodeSquare,
    Bot,
    Timer,
    GitBranch,
    Webhook,
    FastForward,
    CornerUpLeft,
    LayoutGrid,
    Play,
    UploadCloud,
    Lock,
    Search,
    Share2,
    HelpCircle,
    MoreHorizontal,
    Code,
    Plus,
    Minus
} from 'lucide-react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    ReactFlowProvider,
    useReactFlow,
    MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import CustomNode from '../components/Flow/CustomNode';
import GroupNode from '../components/Flow/GroupNode';
import TestSimulator from '../components/Flow/TestSimulator';
import { parseTypebotToFlow } from '../utils/typebotParser';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

// Lista estrita com os mesmos rótulos e seções fiéis ao Typebot
const NODE_TYPES = [
    // Categoria: Bubbles
    { type: 'send_message', label: 'Texto', icon: MessageSquare, category: 'Bubbles' },
    { type: 'image', label: 'Imagem', icon: ImageIcon, category: 'Bubbles' },
    { type: 'video', label: 'Vídeo', icon: Video, category: 'Bubbles' },
    { type: 'embed', label: 'Incorporar', icon: Code2, category: 'Bubbles' },
    { type: 'audio', label: 'Áudio', icon: Headphones, category: 'Bubbles' },

    // Categoria: Inputs
    { type: 'ask', label: 'Texto', icon: Type, category: 'Inputs' },
    { type: 'number_input', label: 'Número', icon: Hash, category: 'Inputs' },
    { type: 'email_input', label: 'Email', icon: Mail, category: 'Inputs' },
    { type: 'website_input', label: 'Website', icon: Globe, category: 'Inputs' },
    { type: 'date_input', label: 'Data', icon: Calendar, category: 'Inputs' },
    { type: 'phone_input', label: 'Telefone', icon: Phone, category: 'Inputs' },
    { type: 'buttons', label: 'Botão', icon: MousePointerClick, category: 'Inputs' },
    { type: 'pic_choice', label: 'Seleção de Imagem', icon: ImagePlay, category: 'Inputs' },
    { type: 'payment', label: 'Pagamento', icon: CreditCard, category: 'Inputs' },
    { type: 'rating', label: 'Avaliação', icon: Star, category: 'Inputs' },
    { type: 'file_input', label: 'Arquivo', icon: FileUp, category: 'Inputs' },

    // Categoria: Condicionais
    { type: 'set_variable', label: 'Variável', icon: PenTool, category: 'Condicionais' },
    { type: 'condition', label: 'Condição', icon: Filter, category: 'Condicionais' },
    { type: 'redirect', label: 'Redirecionar', icon: ExternalLink, category: 'Condicionais' },
    { type: 'script', label: 'Script', icon: CodeSquare, category: 'Condicionais' },
    { type: 'typebot_link', label: 'Typebot', icon: Bot, category: 'Condicionais' },
    { type: 'wait', label: 'Espera', icon: Timer, category: 'Condicionais' },
    { type: 'jump', label: 'Pular', icon: FastForward, category: 'Condicionais' },
    { type: 'ab_test', label: 'Teste AB', icon: GitBranch, category: 'Condicionais' }
];

function FlowBuilderContent() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const tenant_id = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
    const { screenToFlowPosition, fitView } = useReactFlow();
    const reactFlowWrapper = useRef<HTMLDivElement>(null);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [flowData, setFlowData] = useState<any>(null);
    const [versionData, setVersionData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [availableFlows, setAvailableFlows] = useState<any[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const nodeTypes = useMemo(() => ({
        custom: CustomNode,
        typebot_group: GroupNode,
        start: CustomNode,
        default: CustomNode
    }), []);

    useEffect(() => {
        if (tenant_id && id) loadFlow();
    }, [tenant_id, id]);

    useEffect(() => {
        async function fetchAvailableFlows() {
            if (!tenant_id) return;
            const { data } = await supabase
                .from('flows')
                .select('id, name')
                .eq('tenant_id', tenant_id)
                .neq('id', id || '')
                .order('name', { ascending: true });
            if (data) setAvailableFlows(data);
        }
        fetchAvailableFlows();
    }, [tenant_id, id]);

    const loadFlow = async () => {
        setLoading(true);
        const { data: flow } = await supabase
            .from('flows')
            .select('*, flow_versions!fk_active_version(*)')
            .eq('id', id)
            .single();

        if (flow) {
            setFlowData(flow);
            let version = flow.flow_versions;

            if (!version) {
                const { data: drafts } = await supabase
                    .from('flow_versions')
                    .select('*')
                    .eq('flow_id', id)
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (drafts && drafts.length > 0) version = drafts[0];
            }

            if (version) {
                setVersionData(version);
                setNodes(version.nodes || []);
                setEdges(version.edges || []);
            }
        }
        setLoading(false);
    };

    const onConnect = useCallback(
        (params: Connection | Edge) => setEdges((eds) => addEdge({
            ...params,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#818cf8', strokeWidth: 3 },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 15,
                height: 15,
                color: '#818cf8',
            },
        }, eds)),
        [setEdges],
    );

    const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
        event.dataTransfer.setData('application/reactflow/type', nodeType);
        event.dataTransfer.setData('application/reactflow/label', label);
        event.dataTransfer.effectAllowed = 'move';
    };

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // Target Group Detection
            const targetGroupElement = document.elementFromPoint(event.clientX, event.clientY)?.closest('.react-flow__node-typebot_group');
            const targetGroupId = targetGroupElement ? targetGroupElement.getAttribute('data-id') : null;

            // 1. Check if dragging an existing bubble from a group
            const internalDataRaw = event.dataTransfer.getData('application/reactflow/internal');
            if (internalDataRaw) {
                try {
                    const internalData = JSON.parse(internalDataRaw);
                    const { sourceGroupId, blockIndex, blockData } = internalData;

                    if (targetGroupId) {
                        // Dropped into another (or same) group
                        if (targetGroupId === sourceGroupId) {
                            // Same group: natively we would reorder, but for now we'll just ignore or push to end
                            return; // Skip reordering for now unless complex dnd is needed
                        }

                        // Move from sourceGroup to targetGroup
                        setNodes((nds) => {
                            return nds.map((node) => {
                                if (node.id === sourceGroupId) {
                                    // Remove from source
                                    const newBlocks = [...(node.data.blocks || [])];
                                    newBlocks.splice(blockIndex, 1);
                                    return { ...node, data: { ...node.data, blocks: newBlocks } };
                                }
                                if (node.id === targetGroupId) {
                                    // Add to target
                                    return { ...node, data: { ...node.data, blocks: [...(node.data.blocks || []), blockData] } };
                                }
                                return node;
                            });
                        });
                    } else {
                        // Dropped onto empty canvas -> Create new group and detach
                        const newGroupId = `group-${uuidv4().substring(0, 6)}`;
                        setNodes((nds) => {
                            // First, remove from old
                            const modifiedNodes = nds.map(node => {
                                if (node.id === sourceGroupId) {
                                    const newBlocks = [...(node.data.blocks || [])];
                                    newBlocks.splice(blockIndex, 1);
                                    return { ...node, data: { ...node.data, blocks: newBlocks } };
                                }
                                return node;
                            });

                            // Then create new
                            const newGroupNode: Node = {
                                id: newGroupId,
                                type: 'typebot_group',
                                position,
                                data: {
                                    id: newGroupId,
                                    label: 'Novo Grupo',
                                    blocks: [blockData]
                                },
                            };

                            return [...modifiedNodes, newGroupNode];
                        });
                    }
                } catch (e) {
                    console.error("Error parsing internal drag data", e);
                }
                return; // Finish execution for internal drag
            }

            // 2. Dragging a new bubble from the sidebar
            const type = event.dataTransfer.getData('application/reactflow/type');
            const label = event.dataTransfer.getData('application/reactflow/label');

            if (!type) return;

            const blockId = `${type}-${uuidv4().substring(0, 6)}`;
            const newBlock = {
                id: blockId,
                label,
                text: type === 'send_message' || type === 'ask' ? 'Novo texto...' : '',
                flowType: type,
                var_name: ''
            };

            if (targetGroupId) {
                // Append to target group
                setNodes((nds) => nds.map(node => {
                    if (node.id === targetGroupId) {
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                blocks: [...(node.data.blocks || []), newBlock]
                            }
                        };
                    }
                    return node;
                }));
            } else {
                // Create new group
                const groupId = `group-${uuidv4().substring(0, 6)}`;
                const newGroupNode: Node = {
                    id: groupId,
                    type: 'typebot_group',
                    position,
                    data: {
                        id: groupId,
                        label: 'Novo Grupo',
                        blocks: [newBlock]
                    },
                };
                setNodes((nds) => nds.concat(newGroupNode));
            }
        },
        [screenToFlowPosition, setNodes],
    );

    const saveFlow = async () => {
        if (!versionData || !flowData) return;
        setSaving(true);

        // Captura o estado anterior para auditoria
        const { data: beforeVersion } = await supabase.from('flow_versions').select('*').eq('id', versionData.id).maybeSingle();
        const { data: beforeFlow } = await supabase.from('flows').select('*').eq('id', flowData.id).maybeSingle();

        await supabase.from('flow_versions').update({
            nodes,
            edges,
            status: 'PUBLISHED'
        }).eq('id', versionData.id);

        await supabase.from('flows').update({
            active_version_id: versionData.id
        }).eq('id', flowData.id);

        // Registrar logs de auditoria
        const afterVersion = { ...beforeVersion, nodes, edges, status: 'PUBLISHED' };
        await useChatStore.getState().logOperation('UPDATE', 'flow_versions', versionData.id, beforeVersion || null, afterVersion);

        const afterFlow = { ...beforeFlow, active_version_id: versionData.id };
        await useChatStore.getState().logOperation('UPDATE', 'flows', flowData.id, beforeFlow || null, afterFlow);

        setSaving(false);
        alert("Salvo e Publicado com sucesso!");
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const json = JSON.parse(evt.target?.result as string);
                const { nodes: newNodes, edges: newEdges } = parseTypebotToFlow(json);

                if (window.confirm('Isto irá sobrescrever o fluxo no editor atual. Tem certeza?')) {
                    setNodes(newNodes);
                    setEdges(newEdges);

                    // Aguarda o React Flow renderizar os nós e depois centraliza a câmera
                    setTimeout(() => {
                        fitView({ duration: 800, padding: 0.2 });
                    }, 100);
                }
            } catch (error) {
                alert('Erro ao importar arquivo: JSON Typebot inválido ou corrompido');
                console.error(error);
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsText(file);
    };

    const handleNodeClick = (_: any, node: Node) => {
        setSelectedNode(node);
    };

    const handleDataChange = (field: string, value: string) => {
        if (!selectedNode) return;

        const updatedNodes = nodes.map((n) => {
            if (n.id === selectedNode.id) {
                return {
                    ...n,
                    data: {
                        ...n.data,
                        [field]: value
                    }
                };
            }
            return n;
        });

        setNodes(updatedNodes);
        setSelectedNode(updatedNodes.find(n => n.id === selectedNode.id) || null);
    };

    const [activeTab, setActiveTab] = useState<'fluxo' | 'tema' | 'config' | 'share' | 'results'>('fluxo');
    const [searchFilter, setSearchFilter] = useState('');

    const filteredNodeTypes = useMemo(() => {
        if (!searchFilter.trim()) return NODE_TYPES;
        return NODE_TYPES.filter(n => n.label.toLowerCase().includes(searchFilter.toLowerCase()) || n.category.toLowerCase().includes(searchFilter.toLowerCase()));
    }, [searchFilter]);

    const categories = Array.from(new Set(filteredNodeTypes.map(n => n.category)));

    return (
        <div className="flex flex-col h-full bg-[#0e0e11] text-zinc-200 select-none">
            {/* Header Estilo Typebot */}
            <header className="h-14 px-4 bg-[#18181b] border-b border-zinc-800/80 flex justify-between items-center z-20 shrink-0">
                {/* Esquerda: Logo + Título + Ajuda */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/flows')}
                        className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-1.5 text-zinc-400 hover:text-white"
                        title="Voltar ao Gerenciador de Fluxos"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-indigo-600/30 border border-indigo-500/40 rounded-lg flex items-center justify-center text-indigo-400 font-black text-xs">
                            ⚡
                        </div>
                        <h1 className="text-sm font-semibold text-zinc-100 max-w-[200px] truncate">
                            {flowData?.name || 'Hbi Pizza'}
                        </h1>
                    </div>

                    <button className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded-md hover:bg-zinc-800/60 transition-colors ml-1">
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>Ajuda</span>
                    </button>
                </div>

                {/* Centro: Abas do Typebot */}
                <div className="flex items-center bg-[#202024] p-1 rounded-xl border border-zinc-800 text-xs font-medium">
                    <button
                        onClick={() => setActiveTab('fluxo')}
                        className={`px-3 py-1 rounded-lg transition-all ${activeTab === 'fluxo' ? 'bg-[#2b2b31] text-white shadow-sm font-semibold' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                        Fluxo
                    </button>
                    <button
                        onClick={() => setActiveTab('tema')}
                        className={`px-3 py-1 rounded-lg transition-all ${activeTab === 'tema' ? 'bg-[#2b2b31] text-white shadow-sm font-semibold' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                        Tema
                    </button>
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`px-3 py-1 rounded-lg transition-all ${activeTab === 'config' ? 'bg-[#2b2b31] text-white shadow-sm font-semibold' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                        Configurações
                    </button>
                    <button
                        onClick={() => setActiveTab('share')}
                        className={`px-3 py-1 rounded-lg transition-all ${activeTab === 'share' ? 'bg-[#2b2b31] text-white shadow-sm font-semibold' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                        Compartilhar
                    </button>
                    <button
                        onClick={() => setActiveTab('results')}
                        className={`px-3 py-1 rounded-lg transition-all ${activeTab === 'results' ? 'bg-[#2b2b31] text-white shadow-sm font-semibold' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                        Resultados
                    </button>
                </div>

                {/* Direita: Compartilhar + Visualizar + Publicar */}
                <div className="flex items-center gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".json"
                        onChange={handleImport}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-[#202024] hover:bg-zinc-800 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all border border-zinc-800"
                        title="Importar arquivo JSON do Typebot"
                    >
                        <UploadCloud className="w-3.5 h-3.5" />
                        Importar
                    </button>
                    
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(window.location.href);
                            alert('Link do fluxo copiado para a área de transferência!');
                        }}
                        className="bg-[#202024] hover:bg-zinc-800 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all border border-zinc-800"
                    >
                        <Share2 className="w-3.5 h-3.5" />
                        Compartilhar
                    </button>

                    <button
                        onClick={() => setIsTesting(true)}
                        className="bg-[#202024] hover:bg-zinc-800 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all border border-zinc-800"
                    >
                        <Play className="w-3.5 h-3.5 text-zinc-400 fill-zinc-400" />
                        Visualizar
                    </button>

                    <button
                        onClick={saveFlow}
                        disabled={saving}
                        className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                    >
                        <Save className="w-3.5 h-3.5" />
                        {saving ? 'Publicando...' : 'Publicar'}
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar Esquerda (Toolbox Drag & Drop Estilo Typebot) */}
                <div className="w-64 bg-[#121215] border-r border-zinc-800/80 flex flex-col z-10 shrink-0 overflow-y-auto">
                    {/* Campo de Busca com Cadeado */}
                    <div className="p-3 border-b border-zinc-800/60">
                        <div className="relative flex items-center">
                            <input
                                type="text"
                                placeholder="Search"
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                className="w-full bg-[#1c1c21] border border-zinc-800/80 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 pr-8"
                            />
                            <Lock className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 pointer-events-none" />
                        </div>
                    </div>

                    {/* Categorias e Blocos */}
                    <div className="p-3 flex flex-col gap-4">
                        {categories.map((category) => (
                            <div key={category}>
                                <h3 className="text-xs font-semibold text-zinc-400 mb-2">{category}</h3>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {filteredNodeTypes.filter(n => n.category === category).map((nt) => (
                                        <div
                                            key={nt.type}
                                            onDragStart={(event) => onDragStart(event, nt.type, nt.label)}
                                            draggable
                                            className="flex items-center gap-2 p-2 bg-[#1c1c21] border border-zinc-800/80 rounded-lg cursor-grab hover:bg-[#25252b] hover:border-zinc-700 transition-all text-left group"
                                        >
                                            <nt.icon className="w-4 h-4 text-indigo-400 shrink-0 group-hover:scale-110 transition-transform" />
                                            <span className="text-[11px] font-medium text-zinc-300 truncate">{nt.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Editor Graph Canvas */}
                <div className="flex-1 relative bg-[#0e0e11]" ref={reactFlowWrapper}>
                    {/* Botões Flutuantes Superiores Direitos Estilo Typebot ({}, ..., +, -) */}
                    <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-[#18181b]/90 border border-zinc-800 p-1 rounded-lg backdrop-blur shadow-xl">
                        <button 
                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                            title="Variáveis do Fluxo"
                            onClick={() => alert('Variáveis disponíveis:\n{{pushName}}, {{saudacao}}, {{NomeEmpresa}}, {{cardapio}}, {{GoogleMaps}}, {{EnderecoEmpresa}}, {{DiaFuncionamento}}, {{HoraFuncionamento}}')}
                        >
                            <Code className="w-4 h-4" />
                        </button>
                        <button 
                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                            title="Mais Opções"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>
                        <div className="w-[1px] h-4 bg-zinc-800 mx-0.5" />
                        <button 
                            onClick={() => fitView()}
                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                            title="Ajustar Visualização (Fit View)"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={nodeTypes}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={handleNodeClick}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        fitView
                        className="bg-[#0e0e11]"
                        defaultEdgeOptions={{
                            type: 'smoothstep',
                            animated: true,
                            style: { stroke: '#6366f1', strokeWidth: 2.5 },
                            markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#6366f1' }
                        }}
                    >
                        <Background color="#1f1f23" gap={20} size={1.5} />
                        <Controls className="!bg-[#18181b] !border-zinc-800 !fill-zinc-400 !rounded-lg !shadow-xl" />
                        <MiniMap
                            nodeColor="#4f46e5"
                            maskColor="rgba(14, 14, 17, 0.85)"
                            style={{ backgroundColor: '#121215', border: '1px solid rgba(39, 39, 42, 0.8)' }}
                            className="rounded-xl shadow-2xl !bottom-4 !right-4"
                        />
                    </ReactFlow>
                </div>

                {/* Properties Sidebar (Direita) */}
                {selectedNode && (
                    <div className="w-80 bg-slate-800/95 backdrop-blur-2xl border-l border-slate-700/50 p-6 flex flex-col gap-6 animate-in slide-in-from-right z-10 shadow-2xl overflow-y-auto">
                        <div className="flex items-center gap-3 pb-4 border-b border-slate-700/50">
                            <Settings2 className="w-5 h-5 text-indigo-400" />
                            <h3 className="font-bold text-slate-200">Propriedades</h3>
                        </div>

                        <div className="flex flex-col gap-6">
                            {/* General Group Properties */}
                            <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Nome/Label do Grupo</label>
                                <input
                                    type="text"
                                    value={selectedNode.data?.label as string || ''}
                                    onChange={(e) => handleDataChange('label', e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-inner"
                                />
                            </div>

                            {/* Single Node Legacy Prop fallback (se for node avulso legado) */}
                            {selectedNode.type !== 'typebot_group' && ((selectedNode.data?.flowType as string) === 'send_message' || (selectedNode.data?.flowType as string) === 'ask') && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Conteúdo Original</label>
                                    <textarea
                                        rows={5}
                                        value={selectedNode.data?.text as string || ''}
                                        onChange={(e) => handleDataChange('text', e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all shadow-inner"
                                        placeholder="Use {{variavel}} para inserir dados dinâmicos."
                                    />
                                </div>
                            )}

                            {selectedNode.type !== 'typebot_group' && (selectedNode.data?.flowType as string) === 'typebot_link' && (
                                <div className="space-y-2 p-3.5 bg-indigo-950/30 border border-indigo-500/30 rounded-xl">
                                    <div className="flex items-center gap-2 text-indigo-400">
                                        <Bot className="w-4 h-4" />
                                        <label className="text-[10px] font-bold uppercase tracking-wider">Chamar Outro Fluxo (Subfluxo)</label>
                                    </div>
                                    <select
                                        value={selectedNode.data?.target_flow_id as string || ''}
                                        onChange={(e) => handleDataChange('target_flow_id', e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all cursor-pointer"
                                    >
                                        <option value="">Selecione o fluxo a ser chamado...</option>
                                        {availableFlows.map(f => (
                                            <option key={f.id} value={f.id}>{f.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-slate-400 leading-relaxed">
                                        Ao atingir este nó, o bot transita a conversa para o fluxo selecionado.
                                    </p>
                                </div>
                            )}

                            {/* Group Internal Blocks Map */}
                            {selectedNode.type === 'typebot_group' && selectedNode.data?.blocks && (selectedNode.data.blocks as any[]).length > 0 && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider border-b border-slate-700/50 pb-2">Blocos Internos</h4>

                                    {(selectedNode.data.blocks as any[]).map((block: any, idx: number) => {
                                        const updateBlock = (field: string, val: string) => {
                                            const newBlocks = [...(selectedNode.data.blocks as any[])];
                                            newBlocks[idx] = { ...block, [field]: val };
                                            handleDataChange('blocks', newBlocks);
                                        };

                                        return (
                                            <div key={block.id || idx} className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/50 space-y-3">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                                    <span className="text-xs font-semibold text-slate-200">{block.label || 'Bloco'}</span>
                                                </div>

                                                {['send_message', 'ask', 'email_input', 'number_input', 'phone_input', 'website_input', 'date_input', 'time_input', 'payment', 'rating', 'file_input'].includes(block.flowType) && (
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Texto / Pergunta</label>
                                                        <textarea
                                                            rows={3}
                                                            value={block.text || ''}
                                                            onChange={(e) => updateBlock('text', e.target.value)}
                                                            placeholder="Digite a mensagem..."
                                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none resize-none transition-all"
                                                        />
                                                    </div>
                                                )}

                                                {block.flowType === 'ask' && (
                                                    <div className="space-y-3 pt-2 border-t border-slate-700/50 mt-2">
                                                        <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded-lg border border-slate-700/50">
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Resposta Longa</label>
                                                            <input
                                                                type="checkbox"
                                                                checked={block.long_text || false}
                                                                onChange={(e) => updateBlock('long_text', e.target.checked as any)}
                                                                className="w-3.5 h-3.5 rounded border-slate-700 text-indigo-500 focus:ring-indigo-500 bg-slate-900"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Modo de Teclado (Mobile)</label>
                                                            <select
                                                                value={block.input_mode || 'text'}
                                                                onChange={(e) => updateBlock('input_mode', e.target.value)}
                                                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                                            >
                                                                <option value="text">Padrão (text)</option>
                                                                <option value="decimal">Decimal com vírgula (decimal)</option>
                                                                <option value="numeric">Números inteiros (numeric)</option>
                                                                <option value="tel">Telefone (tel)</option>
                                                                <option value="search">Busca (search)</option>
                                                                <option value="email">Email (email)</option>
                                                                <option value="url">URL (url)</option>
                                                            </select>
                                                        </div>

                                                        <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded-lg border border-slate-700/50">
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Permitir Anexos</label>
                                                            <input
                                                                type="checkbox"
                                                                checked={block.allow_attachments || false}
                                                                onChange={(e) => updateBlock('allow_attachments', e.target.checked as any)}
                                                                className="w-3.5 h-3.5 rounded border-slate-700 text-indigo-500 focus:ring-indigo-500 bg-slate-900"
                                                            />
                                                        </div>

                                                        <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded-lg border border-slate-700/50">
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recurso de Áudio Voz</label>
                                                            <input
                                                                type="checkbox"
                                                                checked={block.allow_audio_clips || false}
                                                                onChange={(e) => updateBlock('allow_audio_clips', e.target.checked as any)}
                                                                className="w-3.5 h-3.5 rounded border-slate-700 text-indigo-500 focus:ring-indigo-500 bg-slate-900"
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {['image', 'video', 'audio', 'embed'].includes(block.flowType) && (
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">URL da Mídia / Embed</label>
                                                        <input
                                                            type="text"
                                                            value={block.url || ''}
                                                            onChange={(e) => updateBlock('url', e.target.value)}
                                                            placeholder="https://..."
                                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                                        />
                                                    </div>
                                                )}

                                                {['buttons', 'pic_choice', 'cards'].includes(block.flowType) && (
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Opções (Separadas por vírgula)</label>
                                                        <textarea
                                                            rows={3}
                                                            value={(block.options || []).join(', ')}
                                                            onChange={(e) => {
                                                                const opts = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                                                updateBlock('options', opts as any);
                                                            }}
                                                            placeholder="Opção 1, Opção 2, Opção 3"
                                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none resize-none transition-all"
                                                        />
                                                    </div>
                                                )}

                                                {block.flowType === 'condition' && (
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Condição Lógica</label>
                                                        <input
                                                            type="text"
                                                            value={block.condition_expr || ''}
                                                            onChange={(e) => updateBlock('condition_expr', e.target.value)}
                                                            placeholder="Ex: variavel == '1'"
                                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-mono"
                                                        />
                                                    </div>
                                                )}

                                                {block.flowType === 'wait' && (
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Tempo (Segundos)</label>
                                                        <input
                                                            type="number"
                                                            value={block.wait_time || ''}
                                                            onChange={(e) => updateBlock('wait_time', e.target.value)}
                                                            placeholder="2"
                                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                                        />
                                                    </div>
                                                )}

                                                {block.flowType === 'webhook' && (
                                                    <div className="space-y-3">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Webhook URL</label>
                                                            <input
                                                                type="url"
                                                                value={block.webhookUrl || ''}
                                                                onChange={(e) => updateBlock('webhookUrl', e.target.value)}
                                                                placeholder="https://api.exemplo.com/webhook"
                                                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-mono"
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {block.flowType === 'typebot_link' && (
                                                    <div className="space-y-2 p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-xl">
                                                        <div className="flex items-center gap-2 text-indigo-400">
                                                            <Bot className="w-4 h-4" />
                                                            <label className="text-[10px] font-bold uppercase tracking-wider">Chamar Outro Fluxo (Subfluxo)</label>
                                                        </div>
                                                        <select
                                                            value={block.target_flow_id || ''}
                                                            onChange={(e) => updateBlock('target_flow_id', e.target.value)}
                                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all cursor-pointer"
                                                        >
                                                            <option value="">Selecione o fluxo a ser chamado...</option>
                                                            {availableFlows.map(f => (
                                                                <option key={f.id} value={f.id}>{f.name}</option>
                                                            ))}
                                                        </select>
                                                        <p className="text-[10px] text-slate-400 leading-relaxed">
                                                            Ao atingir este bloco, a conversa transita automaticamente para este fluxo secundário modular.
                                                        </p>
                                                    </div>
                                                )}

                                                {(block.flowType === 'set_variable' || block.flowType.endsWith('_input') || block.flowType === 'ask' || block.flowType === 'buttons' || block.flowType === 'pic_choice' || block.flowType === 'payment' || block.flowType === 'rating' || block.flowType === 'file_input') && (
                                                    <div>
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Salvar em Variável</label>
                                                        <input
                                                            type="text"
                                                            value={block.var_name || ''}
                                                            onChange={(e) => updateBlock('var_name', e.target.value)}
                                                            placeholder="Nome da variável"
                                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-mono"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {isTesting && (
                <TestSimulator
                    nodes={nodes}
                    edges={edges}
                    onClose={() => setIsTesting(false)}
                />
            )}
        </div>
    );
}

export default function FlowBuilder() {
    return (
        <ReactFlowProvider>
            <FlowBuilderContent />
        </ReactFlowProvider>
    );
}
