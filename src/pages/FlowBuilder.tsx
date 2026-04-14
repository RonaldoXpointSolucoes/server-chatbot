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
    UploadCloud
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

// Lista estrita baseada nas opções reais de builder estilo "Typebot"
const NODE_TYPES = [
    // Categoria: Bubbles
    { type: 'send_message', label: 'Text', icon: MessageSquare, category: 'Bubbles' },
    { type: 'image', label: 'Image', icon: ImageIcon, category: 'Bubbles' },
    { type: 'video', label: 'Video', icon: Video, category: 'Bubbles' },
    { type: 'audio', label: 'Audio', icon: Headphones, category: 'Bubbles' },
    { type: 'embed', label: 'Embed', icon: Code2, category: 'Bubbles' },

    // Categoria: Inputs
    { type: 'ask', label: 'Text', icon: Type, category: 'Inputs' },
    { type: 'number_input', label: 'Number', icon: Hash, category: 'Inputs' },
    { type: 'email_input', label: 'Email', icon: Mail, category: 'Inputs' },
    { type: 'website_input', label: 'Website', icon: Globe, category: 'Inputs' },
    { type: 'date_input', label: 'Date', icon: Calendar, category: 'Inputs' },
    { type: 'time_input', label: 'Time', icon: Clock, category: 'Inputs' },
    { type: 'phone_input', label: 'Phone', icon: Phone, category: 'Inputs' },
    { type: 'buttons', label: 'Buttons', icon: MousePointerClick, category: 'Inputs' },
    { type: 'pic_choice', label: 'Pic choice', icon: ImagePlay, category: 'Inputs' },
    { type: 'payment', label: 'Payment', icon: CreditCard, category: 'Inputs' },
    { type: 'rating', label: 'Rating', icon: Star, category: 'Inputs' },
    { type: 'file_input', label: 'File', icon: FileUp, category: 'Inputs' },
    { type: 'cards', label: 'Cards', icon: LayoutTemplate, category: 'Inputs' },

    // Categoria: Logic
    { type: 'set_variable', label: 'Set variable', icon: PenTool, category: 'Logic' },
    { type: 'condition', label: 'Condition', icon: Filter, category: 'Logic' },
    { type: 'redirect', label: 'Redirect', icon: ExternalLink, category: 'Logic' },
    { type: 'script', label: 'Script', icon: CodeSquare, category: 'Logic' },
    { type: 'typebot_link', label: 'Typebot', icon: Bot, category: 'Logic' },
    { type: 'wait', label: 'Wait', icon: Timer, category: 'Logic' },
    { type: 'ab_test', label: 'AB Test', icon: GitBranch, category: 'Logic' },
    { type: 'webhook', label: 'Webhook', icon: Webhook, category: 'Logic' },
    { type: 'jump', label: 'Jump', icon: FastForward, category: 'Logic' },
    { type: 'return', label: 'Return', icon: CornerUpLeft, category: 'Logic' }
];

function FlowBuilderContent() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const tenant_id = sessionStorage.getItem('current_tenant_id');
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
        if (!versionData) return;
        setSaving(true);

        await supabase.from('flow_versions').update({
            nodes,
            edges,
            status: 'PUBLISHED'
        }).eq('id', versionData.id);

        await supabase.from('flows').update({
            active_version_id: versionData.id
        }).eq('id', flowData.id);

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

    if (loading) return <div className="animate-pulse p-10 text-slate-300">Carregando flow...</div>;

    const categories = Array.from(new Set(NODE_TYPES.map(n => n.category)));

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-200">
            {/* Header */}
            <header className="p-4 bg-slate-900/80 border-b border-slate-700/50 backdrop-blur-xl flex justify-between items-center z-20">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/flows')}
                        className="p-2 hover:bg-slate-800 rounded-full transition-colors"
                        title="Voltar ao Gerenciador"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-400" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                            {flowData?.name}
                        </h1>
                        <p className="text-xs text-slate-500">Versão: {versionData?.status === 'PUBLISHED' ? 'Ativa' : 'Rascunho'}</p>
                    </div>
                </div>
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
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shadow-lg border border-slate-700/50"
                    >
                        <UploadCloud className="w-4 h-4" />
                        Importar Typebot
                    </button>
                    <button
                        onClick={() => setIsTesting(true)}
                        className="bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shadow-lg"
                    >
                        <Play className="w-4 h-4" />
                        Testar
                    </button>
                    <button
                        onClick={saveFlow}
                        disabled={saving}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shadow-lg shadow-indigo-900/20"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Publicando...' : 'Publicar'}
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar Esquerda (Drag & Drop) */}
                <div className="w-72 bg-slate-900/95 border-r border-slate-700/50 flex flex-col z-10 shadow-2xl overflow-y-auto">
                    <div className="p-4 border-b border-slate-800/50">
                        <div className="flex items-center gap-2 text-slate-300 font-semibold mb-1">
                            <LayoutGrid className="w-5 h-5 text-indigo-400" />
                            <h2>Blocos (Bubbles)</h2>
                        </div>
                        <p className="text-xs text-slate-500">Arraste para o canvas para criar</p>
                    </div>

                    <div className="p-4 flex flex-col gap-6">
                        {categories.map((category) => (
                            <div key={category}>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">{category}</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {NODE_TYPES.filter(n => n.category === category).map((nt) => (
                                        <div
                                            key={nt.type}
                                            onDragStart={(event) => onDragStart(event, nt.type, nt.label)}
                                            draggable
                                            className="flex flex-col items-center justify-center gap-2 p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl cursor-grab hover:bg-slate-800 hover:border-indigo-500/50 hover:shadow-lg transition-all"
                                        >
                                            <nt.icon className="w-5 h-5 text-slate-400" />
                                            <span className="text-[11px] text-center font-medium text-slate-300 leading-tight">{nt.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Editor Graph Canvas */}
                <div className="flex-1 relative" ref={reactFlowWrapper}>
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
                        className="bg-slate-900/40"
                        defaultEdgeOptions={{
                            type: 'smoothstep',
                            animated: true,
                            style: { stroke: '#818cf8', strokeWidth: 3 },
                            markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#818cf8' }
                        }}
                    >
                        <Background color="#334155" gap={24} size={2} />
                        <Controls className="bg-slate-800 border-slate-700 fill-slate-300 shadow-xl" />
                        <MiniMap
                            nodeColor="#6366f1"
                            maskColor="rgb(15, 23, 42, 0.8)"
                            style={{ backgroundColor: '#0f172a', border: '1px solid rgba(51, 65, 85, 0.5)' }}
                            className="rounded-xl shadow-2xl"
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
