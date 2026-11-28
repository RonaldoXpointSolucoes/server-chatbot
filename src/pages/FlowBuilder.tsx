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
    Minus,
    Pause,
    Trash2,
    UserCheck,
    RefreshCw,
    CheckCircle2,
    Tag,
    BookOpen,
    ShieldCheck,
    ShieldAlert,
    AlertTriangle,
    FlaskConical,
    ChevronRight,
    Terminal
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
import FlowHelpModal from '../components/Flow/FlowHelpModal';
import BlockHelpDrawer from '../components/Flow/BlockHelpDrawer';
import FlowHealthModal from '../components/Flow/FlowHealthModal';
import LiveFlowDiagnosticPanel, { type NodeLiveTelemetry } from '../components/Flow/LiveFlowDiagnosticPanel';
import { parseTypebotToFlow } from '../utils/typebotParser';
import { normalizeUrlsInText, extractUrlsFromText } from '../utils/urlHelper';
import { FlowActionsContext, getBlockTheme } from '../context/FlowActionsContext';
import {
    createDefaultBlockForType,
    buildBlockExampleFlow,
    analyzeFlowHealth,
    type FlowHealthIssue
} from '../utils/flowBlocksCatalog.mjs';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

// Lista estrita com os mesmos rótulos e seções fiéis ao Typebot
const NODE_TYPES = [
    // Categoria: Bubbles (Laranja / Coral)
    { type: 'send_message', label: 'Texto', icon: MessageSquare, category: 'Bubbles' },
    { type: 'image', label: 'Imagem', icon: ImageIcon, category: 'Bubbles' },
    { type: 'video', label: 'Vídeo', icon: Video, category: 'Bubbles' },
    { type: 'embed', label: 'Incorporar', icon: Code2, category: 'Bubbles' },
    { type: 'audio', label: 'Áudio', icon: Headphones, category: 'Bubbles' },

    // Categoria: Inputs (Laranja / Coral)
    { type: 'ask', label: 'Texto', icon: Type, category: 'Inputs' },
    { type: 'number_input', label: 'Número', icon: Hash, category: 'Inputs' },
    { type: 'email_input', label: 'Email', icon: Mail, category: 'Inputs' },
    { type: 'website_input', label: 'Website', icon: Globe, category: 'Inputs' },
    { type: 'date_input', label: 'Data', icon: Calendar, category: 'Inputs' },
    { type: 'phone_input', label: 'Telefone', icon: Phone, category: 'Inputs' },
    { type: 'buttons', label: 'Botão', icon: MousePointerClick, category: 'Inputs' },
    { type: 'poll', label: 'Enquete Nativa', icon: LayoutGrid, category: 'Inputs' },
    { type: 'pic_choice', label: 'Seleção de Imagem', icon: ImagePlay, category: 'Inputs' },
    { type: 'payment', label: 'Pagamento', icon: CreditCard, category: 'Inputs' },
    { type: 'rating', label: 'Avaliação', icon: Star, category: 'Inputs' },
    { type: 'file_input', label: 'Arquivo', icon: FileUp, category: 'Inputs' },

    // Categoria: Condicionais (Roxo / Violeta)
    { type: 'set_variable', label: 'Variável', icon: PenTool, category: 'Condicionais' },
    { type: 'condition', label: 'Condição', icon: Filter, category: 'Condicionais' },
    { type: 'redirect', label: 'Redirecionar', icon: ExternalLink, category: 'Condicionais' },
    { type: 'script', label: 'Script', icon: CodeSquare, category: 'Condicionais' },
    { type: 'typebot_link', label: 'Typebot', icon: Bot, category: 'Condicionais' },
    { type: 'wait', label: 'Espera', icon: Timer, category: 'Condicionais' },
    { type: 'jump', label: 'Pular', icon: FastForward, category: 'Condicionais' },
    { type: 'ab_test', label: 'Teste AB', icon: GitBranch, category: 'Condicionais' },
    { type: 'webhook', label: 'Webhook', icon: Webhook, category: 'Condicionais' },

    // Categoria: Eventos (Esmeralda / Ciano)
    { type: 'start', label: 'Início', icon: Play, category: 'Eventos' },
    { type: 'handoff', label: 'Atendente Humano', icon: UserCheck, category: 'Eventos' },
    { type: 'reply', label: 'Reply', icon: CornerUpLeft, category: 'Eventos' },
    { type: 'command', label: 'Comando', icon: CodeSquare, category: 'Eventos' }
];

function FlowBuilderContent() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const tenantInfo = useChatStore(state => state.tenantInfo);
    const tenant_id = tenantInfo?.id || (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
    const { screenToFlowPosition, fitView } = useReactFlow();
    const reactFlowWrapper = useRef<HTMLDivElement>(null);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [flowData, setFlowData] = useState<any>(null);
    const [versionData, setVersionData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [focusedStartNodeId, setFocusedStartNodeId] = useState<string | undefined>(undefined);
    const [availableFlows, setAvailableFlows] = useState<any[]>([]);
    const [conversationStates, setConversationStates] = useState<any[]>([]);
    const [loadingResults, setLoadingResults] = useState(false);
    const [configFlowName, setConfigFlowName] = useState('');
    const [configTriggers, setConfigTriggers] = useState<{ type: string; value: string }[]>([]);
    const [allowedInstanceIds, setAllowedInstanceIds] = useState<string[]>([]);
    const [companyInstances, setCompanyInstances] = useState<any[]>([]);
    const [paletteSubmenu, setPaletteSubmenu] = useState<{ type: string; label: string; top: number; left: number } | null>(null);
    const [helpBlockType, setHelpBlockType] = useState<string | null>(null);
    const [isHealthOpen, setIsHealthOpen] = useState(false);
    const [isLiveRadarOpen, setIsLiveRadarOpen] = useState(false);
    const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(false);
    const [activePaletteCategory, setActivePaletteCategory] = useState<string>('ALL');
    const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
    const [telemetryByGroup, setTelemetryByGroup] = useState<Record<string, NodeLiveTelemetry>>({});
    const [telemetryByBlock, setTelemetryByBlock] = useState<Record<string, NodeLiveTelemetry>>({});
    const [builderNotice, setBuilderNotice] = useState<{ title: string; detail: string; focusGroupId?: string } | null>(null);
    const [inspectorTestResult, setInspectorTestResult] = useState<Record<string, string>>({});

    const fileInputRef = useRef<HTMLInputElement>(null);
    const paletteSidebarRef = useRef<HTMLDivElement>(null);

    const flowHealthIssues: FlowHealthIssue[] = useMemo(
        () => analyzeFlowHealth(nodes, edges, { currentFlowId: id, triggerRules: configTriggers }),
        [nodes, edges, id, configTriggers]
    );

    // Callbacks do FlowActionsContext para interação de Painéis e Itens Internos
    const handleDuplicateGroup = useCallback((groupId: string) => {
        setNodes((nds) => {
            const targetNode = nds.find(n => n.id === groupId);
            if (!targetNode) return nds;

            const newGroupId = `group-${uuidv4().substring(0, 6)}`;
            const clonedBlocks = (targetNode.data?.blocks || []).map((b: any) => ({
                ...b,
                id: `${b.flowType || 'block'}-${uuidv4().substring(0, 6)}`
            }));

            const newNode: Node = {
                ...targetNode,
                id: newGroupId,
                selected: true,
                position: {
                    x: (targetNode.position?.x || 0) + 40,
                    y: (targetNode.position?.y || 0) + 40
                },
                data: {
                    ...targetNode.data,
                    id: newGroupId,
                    label: `${targetNode.data?.label || 'Grupo'} (Cópia)`,
                    blocks: clonedBlocks
                }
            };

            return nds.map(n => ({ ...n, selected: false })).concat(newNode);
        });
    }, [setNodes]);

    const handleDeleteGroup = useCallback((groupId: string) => {
        setNodes((nds) => nds.filter(n => n.id !== groupId));
        setEdges((eds) => eds.filter(e => e.source !== groupId && e.target !== groupId && !e.sourceHandle?.startsWith(groupId) && !e.targetHandle?.startsWith(groupId)));
        if (selectedNode?.id === groupId) {
            setSelectedNode(null);
        }
    }, [setNodes, setEdges, selectedNode]);

    const handleExecuteGroup = useCallback((groupId: string) => {
        setFocusedStartNodeId(groupId);
        setIsTesting(true);
    }, []);

    const handleUpdateGroupTitle = useCallback((groupId: string, newTitle: string) => {
        setNodes((nds) => nds.map(n => {
            if (n.id === groupId) {
                return {
                    ...n,
                    data: {
                        ...n.data,
                        label: newTitle
                    }
                };
            }
            return n;
        }));
    }, [setNodes]);

    const handleUpdateBlock = useCallback((groupId: string, blockIndex: number, updatedFields: Record<string, any>) => {
        setNodes((nds) => nds.map(n => {
            if (n.id === groupId) {
                const currentBlocks = [...(n.data?.blocks || [])];
                if (currentBlocks[blockIndex]) {
                    currentBlocks[blockIndex] = {
                        ...currentBlocks[blockIndex],
                        ...updatedFields
                    };
                }
                return {
                    ...n,
                    data: {
                        ...n.data,
                        blocks: currentBlocks
                    }
                };
            }
            return n;
        }));
    }, [setNodes]);

    const handleDeleteBlock = useCallback((groupId: string, blockIndex: number) => {
        setNodes((nds) => nds.map(n => {
            if (n.id === groupId) {
                const currentBlocks = [...(n.data?.blocks || [])];
                currentBlocks.splice(blockIndex, 1);
                return {
                    ...n,
                    data: {
                        ...n.data,
                        blocks: currentBlocks
                    }
                };
            }
            return n;
        }));
    }, [setNodes]);

    const handleMoveBlockBetweenGroups = useCallback((sourceGroupId: string, blockIndex: number, targetGroupId: string, targetIndex?: number) => {
        setNodes((nds) => {
            if (sourceGroupId === targetGroupId) {
                return nds.map(n => {
                    if (n.id === sourceGroupId) {
                        const currentBlocks = [...(n.data?.blocks || [])];
                        const [removed] = currentBlocks.splice(blockIndex, 1);
                        const insertAt = targetIndex !== undefined ? Math.min(targetIndex, currentBlocks.length) : currentBlocks.length;
                        currentBlocks.splice(insertAt, 0, removed);
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                blocks: currentBlocks
                            }
                        };
                    }
                    return n;
                });
            }

            let blockToMove: any = null;
            const intermediate = nds.map(n => {
                if (n.id === sourceGroupId) {
                    const currentBlocks = [...(n.data?.blocks || [])];
                    const [removed] = currentBlocks.splice(blockIndex, 1);
                    blockToMove = removed;
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            blocks: currentBlocks
                        }
                    };
                }
                return n;
            });

            if (!blockToMove) return nds;

            return intermediate.map(n => {
                if (n.id === targetGroupId) {
                    const currentBlocks = [...(n.data?.blocks || [])];
                    const insertAt = targetIndex !== undefined ? Math.min(targetIndex, currentBlocks.length) : currentBlocks.length;
                    currentBlocks.splice(insertAt, 0, blockToMove);
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            blocks: currentBlocks
                        }
                    };
                }
                return n;
            });
        });
    }, [setNodes]);

    const handleAddBlockToGroup = useCallback((groupId: string, blockData: any, targetIndex?: number) => {
        setNodes((nds) => nds.map(n => {
            if (n.id === groupId) {
                const currentBlocks = [...(n.data?.blocks || [])];
                const insertAt = targetIndex !== undefined ? Math.min(targetIndex, currentBlocks.length) : currentBlocks.length;
                currentBlocks.splice(insertAt, 0, blockData);
                return {
                    ...n,
                    data: {
                        ...n.data,
                        blocks: currentBlocks
                    }
                };
            }
            return n;
        }));
    }, [setNodes]);

    const handleLoadTemplate = (newNodes: Node[], newEdges: Edge[], templateName: string) => {
        setNodes(newNodes);
        setEdges(newEdges);
        setTimeout(() => {
            fitView({ duration: 800, padding: 0.2 });
        }, 150);
    };

    const handleAddSingleBlock = useCallback((blockType: string, labelOverride?: string) => {
        const newBlock = createDefaultBlockForType(blockType, labelOverride);
        const targetGroup = selectedNode?.type === 'typebot_group' ? selectedNode : null;
        if (targetGroup) {
            handleAddBlockToGroup(targetGroup.id, newBlock);
            setSelectedBlockId(newBlock.id);
        } else {
            const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => Number(n.position?.y || 0))) + 240 : 120;
            const groupId = `group-${uuidv4().substring(0, 6)}`;
            const newGroupNode: Node = {
                id: groupId,
                type: 'typebot_group',
                selected: true,
                position: { x: 180, y: maxY },
                data: {
                    id: groupId,
                    label: newBlock.label || 'Novo Grupo',
                    blocks: [newBlock],
                },
            };
            setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(newGroupNode));
            setSelectedNode(newGroupNode);
            setSelectedBlockId(newBlock.id);
            setTimeout(() => {
                fitView({ nodes: [{ id: groupId }], duration: 450, padding: 0.4 });
            }, 120);
        }
        setPaletteSubmenu(null);
    }, [selectedNode, handleAddBlockToGroup, nodes, setNodes, fitView]);

    const handleGenerateBlockExample = useCallback((blockType: string, openSimulatorAfter = false) => {
        const example = buildBlockExampleFlow(blockType, {
            existingNodes: nodes,
            companyName: tenantInfo?.name || 'Nossa Empresa',
        });

        setNodes((nds) => nds.map(n => ({ ...n, selected: false })).concat(example.nodes as Node[]));
        setEdges((eds) => eds.concat(example.edges as Edge[]));

        const focusNode = (example.nodes as Node[]).find(n => n.id === example.focusGroupId) || example.nodes[0];
        if (focusNode) {
            setSelectedNode(focusNode as Node);
            const firstBlk = (focusNode as any).data?.blocks?.[0];
            if (firstBlk?.id) setSelectedBlockId(firstBlk.id);
        }

        setPaletteSubmenu(null);
        setBuilderNotice({
            title: example.title,
            detail: `${example.description} (Dica de gatilho WhatsApp: ${example.triggerSuggestion})`,
            focusGroupId: example.focusGroupId,
        });

        setTimeout(() => {
            fitView({
                nodes: example.nodes.map((n: any) => ({ id: n.id })),
                duration: 500,
                padding: 0.25,
            });
        }, 120);

        if (openSimulatorAfter && example.focusGroupId) {
            setTimeout(() => {
                setFocusedStartNodeId(example.focusGroupId);
                setIsTesting(true);
            }, 250);
        }
    }, [nodes, tenantInfo, setNodes, setEdges, fitView]);

    const nodeTypes = useMemo(() => ({
        custom: CustomNode,
        typebot_group: GroupNode,
        group: GroupNode,
        start: CustomNode,
        default: CustomNode
    }), []);

    useEffect(() => {
        if (id) loadFlow();
    }, [tenant_id, id]);

    useEffect(() => {
        async function fetchAvailableFlows() {
            if (!tenant_id) return;
            const [{ data }, { data: insts }] = await Promise.all([
                supabase
                    .from('flows')
                    .select('id, name')
                    .eq('tenant_id', tenant_id)
                    .neq('id', id || '')
                    .order('name', { ascending: true }),
                supabase
                    .from('whatsapp_instances')
                    .select('id, display_name, phone_number, status')
                    .eq('tenant_id', tenant_id)
                    .order('display_name', { ascending: true })
            ]);
            if (data) setAvailableFlows(data);
            if (insts) setCompanyInstances(insts);
        }
        fetchAvailableFlows();
    }, [tenant_id, id]);

    useEffect(() => {
        if (!paletteSubmenu) return;
        const closeOnKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setPaletteSubmenu(null);
        };
        const closeOnOutside = () => setPaletteSubmenu(null);
        window.addEventListener('keydown', closeOnKey);
        window.addEventListener('click', closeOnOutside);
        return () => {
            window.removeEventListener('keydown', closeOnKey);
            window.removeEventListener('click', closeOnOutside);
        };
    }, [paletteSubmenu]);

    const fetchConversationStates = async () => {
        if (!id) return;
        setLoadingResults(true);
        try {
            const { data: versions } = await supabase
                .from('flow_versions')
                .select('id')
                .eq('flow_id', id);
            const vIds = (versions || []).map(v => v.id);
            if (vIds.length > 0) {
                const { data: states } = await supabase
                    .from('conversation_states')
                    .select('*')
                    .in('flow_version_id', vIds)
                    .order('updated_at', { ascending: false })
                    .limit(50);
                setConversationStates(states || []);
            } else {
                setConversationStates([]);
            }
        } catch (err) {
            console.warn('Erro ao buscar sessões do fluxo:', err);
        } finally {
            setLoadingResults(false);
        }
    };

    const handleResetConversationState = async (stateId: string) => {
        try {
            await supabase.from('conversation_states').delete().eq('id', stateId);
            setConversationStates(prev => prev.filter(s => s.id !== stateId));
        } catch (err) {
            alert('Erro ao encerrar sessão de conversa.');
        }
    };

    const loadFlow = async () => {
        setLoading(true);
        const { data: flow } = await supabase
            .from('flows')
            .select('*, flow_versions!fk_active_version(*)')
            .eq('id', id)
            .single();

        if (flow) {
            setFlowData(flow);
            setConfigFlowName(flow.name || '');
            const parsedRules = typeof flow.trigger_rules === 'string'
                ? JSON.parse(flow.trigger_rules || '[]')
                : (flow.trigger_rules || []);
            const metaRule = Array.isArray(parsedRules)
                ? parsedRules.find((r: any) => r && (r.type === '__META__' || r.keyword === '__META__'))
                : null;
            setAllowedInstanceIds(Array.isArray(metaRule?.allowedInstanceIds) ? metaRule.allowedInstanceIds : []);
            const userTriggers = Array.isArray(parsedRules)
                ? parsedRules.filter((r: any) => r && r.type !== '__META__' && r.keyword !== '__META__')
                : [];
            setConfigTriggers(userTriggers.length > 0 ? userTriggers : [{ type: 'EXACT', value: 'oi' }]);

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
                const rawNodes: any[] = version.nodes || [];
                const rawEdges: any[] = version.edges || [];

                // Normaliza nós legados (group -> typebot_group, content -> text, variable -> var_name)
                const normalizedLoadedNodes: Node[] = rawNodes.map((n: any) => {
                    if (n.type === 'group' || n.type === 'typebot_group') {
                        const normBlocks = (n.data?.blocks || []).map((b: any, bIdx: number) => ({
                            ...b,
                            id: b.id || `block-${n.id}-${bIdx}`,
                            flowType: b.flowType === 'message' ? 'send_message' : b.flowType === 'input' ? 'ask' : (b.flowType || 'send_message'),
                            label: b.label || (b.flowType === 'message' || b.flowType === 'send_message' ? 'Mensagem' : b.flowType === 'buttons' ? 'Botões' : b.flowType === 'poll' ? 'Enquete Nativa' : b.flowType === 'input' || b.flowType === 'ask' ? 'Pergunta' : b.flowType === 'handoff' ? 'Atendente Humano' : b.flowType),
                            text: b.text ?? b.content ?? '',
                            var_name: b.var_name ?? b.variable ?? '',
                            url: b.url ?? b.webhookUrl ?? ''
                        }));
                        return {
                            ...n,
                            type: 'typebot_group',
                            data: {
                                ...n.data,
                                id: n.id,
                                label: n.data?.label || n.data?.title || 'Grupo',
                                blocks: normBlocks
                            }
                        };
                    }
                    return n;
                });

                // Normaliza arestas para conectar perfeitamente nos handles do GroupNode
                const normalizedLoadedEdges: Edge[] = rawEdges.map((e: any) => {
                    const targetNode = normalizedLoadedNodes.find(n => n.id === e.target);
                    const sourceNode = normalizedLoadedNodes.find(n => n.id === e.source);
                    let targetHandle = e.targetHandle;
                    if (!targetHandle && targetNode?.type === 'typebot_group') {
                        targetHandle = `${e.target}-in`;
                    }
                    let sourceHandle = e.sourceHandle;
                    if (!sourceHandle && sourceNode?.type === 'typebot_group') {
                        const sBlocks = (sourceNode.data?.blocks as any[]) || [];
                        if (sBlocks.length > 0) {
                            sourceHandle = sBlocks[sBlocks.length - 1].id;
                        }
                    }
                    return {
                        ...e,
                        ...(sourceHandle ? { sourceHandle } : {}),
                        ...(targetHandle ? { targetHandle } : {}),
                        type: e.type || 'smoothstep',
                        animated: e.animated !== undefined ? e.animated : true
                    };
                });

                setNodes(normalizedLoadedNodes);
                setEdges(normalizedLoadedEdges);
            }
        }
        setLoading(false);
    };

    const onConnect = useCallback(
        (params: Connection | Edge) => setEdges((eds) => {
            let autoLabel: string | undefined = (params as Edge).label as string | undefined;
            if (!autoLabel && params.source && params.sourceHandle && params.sourceHandle.includes('-opt-')) {
                const [blkId, optIdxStr] = params.sourceHandle.split('-opt-');
                const optIdx = parseInt(optIdxStr, 10);
                const sNode = nodes.find(n => n.id === params.source);
                const blk = (sNode?.data?.blocks as any[])?.find((b: any) => b.id === blkId);
                if (blk && Array.isArray(blk.options) && blk.options[optIdx]) {
                    const optText = String(blk.options[optIdx]);
                    autoLabel = /^\d+\s*[-.]/.test(optText) ? optText : `${optIdx + 1} - ${optText}`;
                }
            }
            return addEdge({
                ...params,
                ...(autoLabel ? { label: autoLabel } : {}),
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#818cf8', strokeWidth: 3 },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 15,
                    height: 15,
                    color: '#818cf8',
                },
            }, eds);
        }),
        [setEdges, nodes],
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

            const newBlock = createDefaultBlockForType(type, label || undefined);

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

    const saveFlow = async (activateInProduction = true) => {
        if (!versionData || !flowData) return;

        // Validador anti-loop antes de publicar em produção
        if (activateInProduction) {
            const loopErrors = flowHealthIssues.filter((i) => i.code === 'UNPAUSED_CYCLE' || i.code === 'SELF_SUBFLOW');
            if (loopErrors.length > 0) {
                const proceed = window.confirm(
                    `⚠️ ALERTA ANTI-LOOP (${loopErrors.length} risco(s) crítico(s)):\n\n${loopErrors[0].message}\n\nSugestão: ${loopErrors[0].suggestion}\n\nDeseja abrir o Auditor de Saúde antes de publicar? Clique em "Cancelar" para revisar agora.`
                );
                if (!proceed) {
                    setIsHealthOpen(true);
                    return;
                }
            }
        }

        setSaving(true);

        // Identifica e normaliza URLs em todos os blocos e nós para compatibilidade com WhatsApp API
        let detectedLinksCount = 0;
        let normalizedLinksCount = 0;

        const normalizedNodes = nodes.map((node) => {
            if (node.type === 'typebot_group' && node.data?.blocks) {
                const newBlocks = (node.data.blocks as any[]).map((block) => {
                    let updatedBlock = { ...block };
                    if (block.text && typeof block.text === 'string') {
                        const original = block.text;
                        const normalized = normalizeUrlsInText(original);
                        const extracted = extractUrlsFromText(original);
                        detectedLinksCount += extracted.length;
                        if (original !== normalized) {
                            normalizedLinksCount += extracted.filter(u => !u.hasHttps).length;
                            updatedBlock.text = normalized;
                        }
                    }
                    if (block.options && Array.isArray(block.options)) {
                        updatedBlock.options = block.options.map((opt: string) => {
                            if (typeof opt === 'string') {
                                const norm = normalizeUrlsInText(opt);
                                const extracted = extractUrlsFromText(opt);
                                detectedLinksCount += extracted.length;
                                if (opt !== norm) {
                                    normalizedLinksCount += extracted.filter(u => !u.hasHttps).length;
                                }
                                return norm;
                            }
                            return opt;
                        });
                    }
                    return updatedBlock;
                });
                return {
                    ...node,
                    data: {
                        ...node.data,
                        blocks: newBlocks
                    }
                };
            }

            if (node.data?.text && typeof node.data.text === 'string') {
                const original = node.data.text;
                const normalized = normalizeUrlsInText(original);
                const extracted = extractUrlsFromText(original);
                detectedLinksCount += extracted.length;
                if (original !== normalized) {
                    normalizedLinksCount += extracted.filter(u => !u.hasHttps).length;
                }
                return {
                    ...node,
                    data: {
                        ...node.data,
                        text: normalized
                    }
                };
            }

            return node;
        });

        // Garante que arestas de botões tenham label compatível com o FlowEngine do backend
        const normalizedEdges = edges.map((e) => {
            if (!e.label && e.source && e.sourceHandle && e.sourceHandle.includes('-opt-')) {
                const [blkId, optIdxStr] = e.sourceHandle.split('-opt-');
                const optIdx = parseInt(optIdxStr, 10);
                const sNode = normalizedNodes.find(n => n.id === e.source);
                const blk = (sNode?.data?.blocks as any[])?.find((b: any) => b.id === blkId);
                if (blk && Array.isArray(blk.options) && blk.options[optIdx]) {
                    const optText = String(blk.options[optIdx]);
                    const autoLabel = /^\d+\s*[-.]/.test(optText) ? optText : `${optIdx + 1} - ${optText}`;
                    return { ...e, label: autoLabel };
                }
            }
            return e;
        });

        // Atualiza nós e arestas locais na tela
        setNodes(normalizedNodes);
        setEdges(normalizedEdges);

        // Captura o estado anterior para auditoria
        const { data: beforeVersion } = await supabase.from('flow_versions').select('*').eq('id', versionData.id).maybeSingle();
        const { data: beforeFlow } = await supabase.from('flows').select('*').eq('id', flowData.id).maybeSingle();

        await supabase.from('flow_versions').update({
            nodes: normalizedNodes,
            edges: normalizedEdges,
            status: 'PUBLISHED'
        }).eq('id', versionData.id);

        const baseTriggers = configTriggers.filter(t => t.type !== '__META__' && (t.type === 'ALL' || (t.value || '').trim() !== ''));
        const cleanTriggers: any[] = allowedInstanceIds.length > 0
            ? [...baseTriggers, { type: '__META__', value: '', allowedInstanceIds }]
            : baseTriggers;
        const nextActiveVerId = activateInProduction ? versionData.id : flowData.active_version_id;

        await supabase.from('flows').update({
            name: configFlowName.trim() || flowData.name,
            trigger_rules: cleanTriggers,
            active_version_id: nextActiveVerId,
            updated_at: new Date().toISOString()
        }).eq('id', flowData.id);

        setFlowData((prev: any) => ({
            ...prev,
            name: configFlowName.trim() || prev.name,
            trigger_rules: cleanTriggers,
            active_version_id: nextActiveVerId
        }));

        // Registrar logs de auditoria
        const afterVersion = { ...beforeVersion, nodes: normalizedNodes, edges: normalizedEdges, status: 'PUBLISHED' };
        await useChatStore.getState().logOperation('UPDATE', 'flow_versions', versionData.id, beforeVersion || null, afterVersion);

        const afterFlow = { ...beforeFlow, name: configFlowName.trim() || flowData.name, trigger_rules: cleanTriggers, active_version_id: nextActiveVerId };
        await useChatStore.getState().logOperation('UPDATE', 'flows', flowData.id, beforeFlow || null, afterFlow);

        setSaving(false);
        const linkMsg = detectedLinksCount > 0
            ? `\n\n🔗 ${detectedLinksCount} link(s) identificado(s) no fluxo! ${normalizedLinksCount > 0 ? `(${normalizedLinksCount} formatado(s) com https:// para envio clicável no WhatsApp)` : '(Todos já validados com https://)'}`
            : '';
        alert(activateInProduction ? `Salvo e Publicado em Produção com sucesso!${linkMsg}` : `Alterações salvas com sucesso!${linkMsg}`);
    };

    const handleTogglePauseFlow = async () => {
        if (!flowData || saving) return;
        const isLive = Boolean(flowData.active_version_id);

        try {
            if (isLive) {
                const { error } = await supabase
                    .from('flows')
                    .update({ active_version_id: null, updated_at: new Date().toISOString() })
                    .eq('id', flowData.id);
                if (error) throw error;

                // Encerra todas as sessões ativas (conversation_states) deste fluxo para garantir parada imediata
                const { data: vers } = await supabase
                    .from('flow_versions')
                    .select('id')
                    .eq('flow_id', flowData.id);
                const verIds = (vers || []).map(v => v.id);
                if (verIds.length > 0) {
                    await supabase.from('conversation_states').delete().in('flow_version_id', verIds);
                }

                setFlowData((prev: any) => ({ ...prev, active_version_id: null }));
                window.dispatchEvent(new CustomEvent('toast', {
                    detail: {
                        message: `⚪ Boot "${flowData.name}" DESATIVADO. Ele não responderá no WhatsApp.`,
                        type: 'info'
                    }
                }));
            } else {
                await saveFlow(true);
            }
        } catch (err: any) {
            console.error('Erro ao alternar status do fluxo:', err);
            alert('Falha ao alternar status do fluxo: ' + (err.message || String(err)));
        }
    };

    const handleExportBackup = () => {
        try {
            const flowName = flowData?.name || 'fluxo';
            const sanitizedName = flowName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            const fileName = `${sanitizedName}_backup.json`;

            const backupData = {
                version: 'chatboot-v1',
                name: flowData?.name || 'Fluxo ChatBoot',
                description: flowData?.description || '',
                tenant_id: tenant_id,
                exported_at: new Date().toISOString(),
                trigger_rules: flowData?.trigger_rules || [],
                nodes: nodes,
                edges: edges,
            };

            const jsonString = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Erro ao exportar backup do fluxo:', error);
            alert('Não foi possível exportar o backup do fluxo.');
        }
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const json = JSON.parse(evt.target?.result as string);
                let newNodes: Node[] = [];
                let newEdges: Edge[] = [];

                // 1. Caso seja backup gerado pelo ChatBoot (ou formato estruturado com nodes e edges)
                if (json && Array.isArray(json.nodes) && Array.isArray(json.edges)) {
                    newNodes = json.nodes;
                    newEdges = json.edges;
                }
                // 2. Caso seja arquivo JSON exportado do Typebot nativo (groups, events, variables)
                else if (json && (Array.isArray(json.groups) || Array.isArray(json.events))) {
                    const parsed = parseTypebotToFlow(json);
                    newNodes = parsed.nodes;
                    newEdges = parsed.edges;
                } else {
                    throw new Error('Formato de arquivo não reconhecido. Use um backup do ChatBoot (.json) ou um arquivo exportado do Typebot (.json).');
                }

                if (newNodes.length === 0) {
                    alert('Nenhum bloco ou nó foi encontrado no arquivo JSON importado.');
                    return;
                }

                if (window.confirm(`Isto irá carregar ${newNodes.length} grupo(s)/bloco(s) e ${newEdges.length} conexão(ões) no editor atual. Tem certeza?`)) {
                    setNodes(newNodes);
                    setEdges(newEdges);

                    setTimeout(() => {
                        fitView({ duration: 800, padding: 0.2 });
                    }, 150);
                }
            } catch (error: any) {
                alert(`Erro ao importar arquivo: ${error?.message || 'JSON inválido ou corrompido'}`);
                console.error('Erro no handleImport:', error);
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

        const handleTelemetryMapChange = useCallback(
            (byGroup: Record<string, NodeLiveTelemetry>, byBlock: Record<string, NodeLiveTelemetry>) => {
                setTelemetryByGroup(byGroup);
                setTelemetryByBlock(byBlock);
            },
            []
        );

        const handleAutoConnectOptions = useCallback(
            (sourceGroupId: string, sourceBlockId: string, options: string[]) => {
                const srcNode = nodes.find((n) => n.id === sourceGroupId);
                if (!srcNode || !Array.isArray(options) || options.length === 0) return;

                const baseX = (srcNode.position?.x || 380) + 460;
                const baseY = (srcNode.position?.y || 80) - Math.max(0, (options.length - 1) * 90);
                const createdNodes: Node[] = [];
                const createdEdges: Edge[] = [];

                options.forEach((optText, idx) => {
                    const handleId = `${sourceBlockId}-opt-${idx}`;
                    const alreadyConnected = edges.some(
                        (e) => e.source === sourceGroupId && e.sourceHandle === handleId
                    );
                    if (alreadyConnected) return;

                    const cleanOptLabel = String(optText || `Opção ${idx + 1}`).replace(/^\d+\s*[-.)]\s*/, '').trim();
                    const newGrpId = `group-opt-${idx + 1}-${uuidv4().substring(0, 4)}`;
                    const isAttendant = cleanOptLabel.toLowerCase().includes('atendente') || cleanOptLabel.toLowerCase().includes('humano');
                    const blkId = `b-opt-${idx + 1}-${uuidv4().substring(0, 4)}`;

                    createdNodes.push({
                        id: newGrpId,
                        type: 'typebot_group',
                        position: { x: baseX, y: baseY + idx * 210 },
                        data: {
                            id: newGrpId,
                            label: `Opção ${idx + 1} - ${cleanOptLabel}`,
                            blocks: [
                                isAttendant
                                    ? {
                                          id: blkId,
                                          flowType: 'handoff',
                                          label: 'Transferir para Atendente',
                                          text: `Perfeito! Estou transferindo seu atendimento sobre *${cleanOptLabel}* para nossa equipe humana. Aguarde um instante! 👤`
                                      }
                                    : {
                                          id: blkId,
                                          flowType: 'send_message',
                                          label: `Resposta: ${cleanOptLabel}`,
                                          text: `Você escolheu *${idx + 1} - ${cleanOptLabel}*.\n\nConfira as informações de *${tenantInfo?.name || 'nossa empresa'}*:`
                                      }
                            ]
                        }
                    });

                    createdEdges.push({
                        id: `e-${sourceGroupId}-${handleId}-${newGrpId}`,
                        source: sourceGroupId,
                        sourceHandle: handleId,
                        target: newGrpId,
                        targetHandle: `${newGrpId}-in`,
                        label: `${idx + 1} - ${cleanOptLabel}`,
                        type: 'smoothstep',
                        animated: true,
                        style: { stroke: '#10b981', strokeWidth: 3 },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            width: 15,
                            height: 15,
                            color: '#10b981'
                        }
                    });
                });

                if (createdNodes.length > 0) {
                    setNodes((nds) => nds.concat(createdNodes));
                    setEdges((eds) => eds.concat(createdEdges));
                    setTimeout(() => {
                        fitView({ duration: 600, padding: 0.25 });
                    }, 120);
                }
            },
            [nodes, edges, tenantInfo, setNodes, setEdges, fitView]
        );

        return (
        <FlowActionsContext.Provider
            value={{
                onDuplicateGroup: handleDuplicateGroup,
                onDeleteGroup: handleDeleteGroup,
                onExecuteGroup: handleExecuteGroup,
                onUpdateGroupTitle: handleUpdateGroupTitle,
                onUpdateBlock: handleUpdateBlock,
                onDeleteBlock: handleDeleteBlock,
                onMoveBlockBetweenGroups: handleMoveBlockBetweenGroups,
                onAddBlockToGroup: handleAddBlockToGroup,
                selectedBlockId,
                setSelectedBlockId,
                onOpenBlockInstructions: (fType: string) => setHelpBlockType(fType),
                onGenerateBlockExample: (fType: string) => handleGenerateBlockExample(fType, false),
                telemetryByGroup,
                telemetryByBlock,
            }}
        >
            <div className="flex flex-col h-full bg-[#0e0e11] text-zinc-200 select-none">
                {/* Header Unificado em 1 Linha (SaaS Moderno — Máxima Área de Canvas) */}
                <header className="h-13 px-3 bg-[#14151a]/95 backdrop-blur-xl border-b border-white/[0.08] flex items-center justify-between gap-2 z-20 shrink-0">
                    {/* 1. Esquerda: Voltar + Nome do Fluxo + Switch Interativo ON/OFF */}
                    <div className="flex items-center gap-2 min-w-0 shrink-0">
                        <button
                            onClick={() => navigate('/settings/bots?tab=typebot')}
                            className="p-1.5 hover:bg-white/10 rounded-xl transition-colors flex items-center gap-1 text-zinc-400 hover:text-white cursor-pointer shrink-0"
                            title="Voltar para Lista de Fluxos de Bot"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border ${
                                flowData?.active_version_id
                                    ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                                    : 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400'
                            }`}>
                                ⚡
                            </div>
                            <h1 className="text-sm font-black text-zinc-100 max-w-[140px] sm:max-w-[200px] truncate" title={flowData?.name}>
                                {flowData?.name || 'Construtor de Fluxo'}
                            </h1>

                            {/* Switch ON/OFF Direto no Header do Builder */}
                            <button
                                type="button"
                                role="switch"
                                aria-checked={Boolean(flowData?.active_version_id)}
                                disabled={saving}
                                onClick={handleTogglePauseFlow}
                                title={
                                    flowData?.active_version_id
                                        ? 'Boot ON-LINE: Clique no switch para desativar imediatamente no WhatsApp'
                                        : 'Boot PAUSADO: Clique no switch para publicar e ativar no WhatsApp'
                                }
                                className={`inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full border transition-all cursor-pointer shrink-0 active:scale-95 ${
                                    flowData?.active_version_id
                                        ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200 shadow-[0_0_14px_rgba(16,185,129,0.35)]'
                                        : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
                                }`}
                            >
                                <span className="text-[10px] font-black uppercase tracking-wider">
                                    {flowData?.active_version_id ? 'ON-LINE' : 'OFF'}
                                </span>
                                <span
                                    className={`relative inline-flex h-4 w-8 shrink-0 rounded-full p-0.5 transition-colors duration-200 ${
                                        flowData?.active_version_id ? 'bg-emerald-500' : 'bg-zinc-700'
                                    }`}
                                >
                                    <span
                                        className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition duration-200 ${
                                            flowData?.active_version_id ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* 2. Centro: Navegação Segmentada Limpa */}
                    <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 text-xs font-medium overflow-x-auto max-w-full shrink-0">
                        <button
                            onClick={() => setActiveTab('fluxo')}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${activeTab === 'fluxo' || activeTab === 'share' ? 'bg-white/15 text-white shadow-sm font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
                        >
                            Canvas
                        </button>
                        <button
                            onClick={() => setActiveTab('config')}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${activeTab === 'config' ? 'bg-white/15 text-white shadow-sm font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
                        >
                            Gatilhos & Caixas
                        </button>
                        <button
                            onClick={() => setActiveTab('tema')}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${activeTab === 'tema' ? 'bg-white/15 text-white shadow-sm font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
                        >
                            Variáveis
                        </button>
                        <button
                            onClick={() => {
                                setActiveTab('results');
                                fetchConversationStates();
                            }}
                            className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${activeTab === 'results' ? 'bg-white/15 text-white shadow-sm font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
                        >
                            Sessões
                        </button>
                    </div>

                    {/* 3. Direita: Radar Sob Demanda + Saúde + Menu Ferramentas Agrupado + Simular + Salvar/Publicar */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept=".json"
                            onChange={handleImport}
                        />

                        {/* Toggle do Radar Ao Vivo (recolhido por padrão para liberar o canvas) */}
                        <button
                            type="button"
                            onClick={() => setIsLiveRadarOpen(r => !r)}
                            className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all border active:scale-95 cursor-pointer whitespace-nowrap ${
                                isLiveRadarOpen
                                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                                    : 'bg-white/[0.04] text-zinc-300 hover:text-white border-white/10'
                            }`}
                            title="Abrir/Fechar Gaveta de Radar Ao Vivo e Testador FoodNext"
                        >
                            <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="hidden md:inline">Radar Ao Vivo</span>
                        </button>

                        {/* Auditoria Anti-Loop Compacta */}
                        <button
                            onClick={() => setIsHealthOpen(true)}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border active:scale-95 cursor-pointer whitespace-nowrap ${
                                flowHealthIssues.some(i => i.severity === 'error')
                                    ? 'bg-red-500/15 hover:bg-red-500/25 text-red-300 border-red-500/40'
                                    : flowHealthIssues.some(i => i.severity === 'warning')
                                        ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40'
                                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            }`}
                            title="Auditoria Anti-Loop e Integridade do Fluxo"
                        >
                            {flowHealthIssues.some(i => i.severity === 'error') ? (
                                <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                            ) : flowHealthIssues.some(i => i.severity === 'warning') ? (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            ) : (
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            )}
                            <span className="hidden lg:inline">
                                {flowHealthIssues.length > 0 ? `Saúde (${flowHealthIssues.length})` : 'Saúde ✓'}
                            </span>
                        </button>

                        {/* Menu Agrupado: Importar, Exportar e Ajuda */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsToolsMenuOpen(prev => !prev)}
                                className="bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border border-white/10 active:scale-95 cursor-pointer"
                                title="Importar, Exportar e Central de Ajuda"
                            >
                                <MoreHorizontal className="w-4 h-4" />
                                <span className="hidden xl:inline">Opções</span>
                            </button>

                            {isToolsMenuOpen && (
                                <div
                                    className="absolute right-0 top-10 z-50 w-52 bg-[#181920] border border-white/15 rounded-2xl shadow-2xl p-1.5 flex flex-col gap-1 text-xs animate-in fade-in zoom-in-95 duration-150"
                                    onMouseLeave={() => setIsToolsMenuOpen(false)}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsToolsMenuOpen(false);
                                            setIsHelpOpen(true);
                                        }}
                                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-zinc-200 hover:bg-white/10 transition-colors text-left cursor-pointer"
                                    >
                                        <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
                                        <span>Central de Ajuda & Modelos</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsToolsMenuOpen(false);
                                            fileInputRef.current?.click();
                                        }}
                                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-zinc-200 hover:bg-white/10 transition-colors text-left cursor-pointer"
                                    >
                                        <UploadCloud className="w-4 h-4 text-emerald-400 shrink-0" />
                                        <span>Importar Fluxo (.json)</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsToolsMenuOpen(false);
                                            handleExportBackup();
                                        }}
                                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-zinc-200 hover:bg-white/10 transition-colors text-left cursor-pointer"
                                    >
                                        <Share2 className="w-4 h-4 text-sky-400 shrink-0" />
                                        <span>Exportar Backup (.json)</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Simular Chat */}
                        <button
                            onClick={() => setIsTesting(true)}
                            className="bg-white/[0.05] hover:bg-white/10 text-zinc-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-white/10 active:scale-95 cursor-pointer whitespace-nowrap"
                            title="Abrir Simulador de Conversa"
                        >
                            <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
                            <span>Simular</span>
                        </button>

                        {/* Salvar Rascunho */}
                        <button
                            onClick={() => saveFlow(false)}
                            disabled={saving}
                            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-zinc-700 active:scale-95 cursor-pointer whitespace-nowrap"
                            title="Salvar alterações mantendo o status atual"
                        >
                            <Save className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span>Salvar</span>
                        </button>

                        {/* Publicar e Ativar no Ar */}
                        <button
                            onClick={() => saveFlow(true)}
                            disabled={saving}
                            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 active:scale-95 border border-emerald-400/30 cursor-pointer whitespace-nowrap"
                            title="Salvar e Ativar este fluxo em Produção no WhatsApp"
                        >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{saving ? 'Salvando...' : 'Publicar'}</span>
                        </button>
                    </div>
                </header>

            {/* Painel Retrátil Superior: Radar Ao Vivo de Chegada de Mensagens, Diagnóstico Técnico e Testador FoodNext */}
            {isLiveRadarOpen && (
                <div className="px-3 py-2 bg-[#121318] border-b border-zinc-800/90 z-10 shrink-0 max-h-[44vh] overflow-y-auto styled-scrollbar">
                    <LiveFlowDiagnosticPanel
                        tenantId={tenant_id}
                        tenantName={tenantInfo?.name || 'Empresa Atual'}
                        currentFlowId={id}
                        currentFlowName={flowData?.name || configFlowName}
                        nodes={nodes}
                        edges={edges}
                        compactMode
                        onTelemetryMapChange={handleTelemetryMapChange}
                        onAutoConnectOptions={handleAutoConnectOptions}
                        onFocusCanvasNode={(groupId, blockId) => {
                            setActiveTab('fluxo');
                            const target = nodes.find((n) => n.id === groupId);
                            if (target) setSelectedNode(target);
                            if (blockId) setSelectedBlockId(blockId);
                            setTimeout(() => {
                                fitView({ nodes: [{ id: groupId }], duration: 550, padding: 0.45 });
                            }, 80);
                        }}
                        onFlowsUpdated={() => loadFlow()}
                    />
                </div>
            )}

            {activeTab === 'config' ? (
                <div className="flex-1 overflow-y-auto p-8 bg-[#0e0e11]">
                    <div className="max-w-2xl mx-auto bg-[#18181b] border border-zinc-800 rounded-3xl p-6 space-y-6 shadow-2xl">
                        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                            <div>
                                <h2 className="text-lg font-bold text-white">Configurações do Fluxo</h2>
                                <p className="text-xs text-zinc-400">Defina o nome de identificação e os gatilhos de disparo no WhatsApp</p>
                            </div>
                            <span className="text-xs font-mono text-zinc-500">ID: {flowData?.id?.slice(0, 8)}</span>
                        </div>

                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-2">Nome do Fluxo</label>
                            <input
                                type="text"
                                value={configFlowName}
                                onChange={(e) => setConfigFlowName(e.target.value)}
                                className="w-full px-4 py-3 bg-[#121215] border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                    <Tag className="w-3.5 h-3.5 text-emerald-400" />
                                    Regras de Gatilho no WhatsApp
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setConfigTriggers([...configTriggers, { type: 'EXACT', value: '' }])}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Adicionar Regra
                                </button>
                            </div>

                            <div className="space-y-2">
                                {configTriggers.map((tr, idx) => (
                                    <div key={idx} className="flex items-center gap-2 p-2.5 bg-[#121215] border border-zinc-800 rounded-xl">
                                        <select
                                            value={tr.type}
                                            onChange={(e) => {
                                                const copy = [...configTriggers];
                                                copy[idx].type = e.target.value;
                                                setConfigTriggers(copy);
                                            }}
                                            className="bg-zinc-900 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none"
                                        >
                                            <option value="EXACT">Igual a (EXACT)</option>
                                            <option value="CONTAINS">Contém (CONTAINS)</option>
                                            <option value="STARTS_WITH">Começa com (STARTS_WITH)</option>
                                            <option value="ALL">Qualquer Mensagem (ALL)</option>
                                        </select>
                                        {tr.type !== 'ALL' ? (
                                            <input
                                                type="text"
                                                placeholder="Ex: oi, menu, cardapio..."
                                                value={tr.value}
                                                onChange={(e) => {
                                                    const copy = [...configTriggers];
                                                    copy[idx].value = e.target.value;
                                                    setConfigTriggers(copy);
                                                }}
                                                className="flex-1 bg-zinc-900 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-emerald-500"
                                            />
                                        ) : (
                                            <span className="flex-1 text-xs text-emerald-400 font-semibold px-2">
                                                Responde a qualquer mensagem recebida
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setConfigTriggers(configTriggers.filter((_, i) => i !== idx))}
                                            className="p-2 text-zinc-500 hover:text-rose-400 cursor-pointer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Escopo de Caixas WhatsApp (Segurança para Testes em FoodNext vs Produção) */}
                        <div className="space-y-3 pt-4 border-t border-zinc-800">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                                        <ShieldCheck className="w-4 h-4 text-indigo-400" />
                                        Escopo de Caixas (Instâncias WhatsApp)
                                    </label>
                                    <p className="text-[11px] text-zinc-400 mt-0.5">
                                        Restrinja este fluxo a uma caixa específica (ex: <strong className="text-emerald-300">FoodNext</strong> para homologação) ou deixe em branco para rodar em todas as caixas da empresa.
                                    </p>
                                </div>
                                {allowedInstanceIds.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setAllowedInstanceIds([])}
                                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer shrink-0"
                                    >
                                        Liberar Todas
                                    </button>
                                )}
                            </div>

                            {companyInstances.length === 0 ? (
                                <p className="text-xs text-zinc-500 italic">Carregando caixas da empresa...</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {companyInstances.map((inst) => {
                                        const isSelected = allowedInstanceIds.includes(inst.id);
                                        return (
                                            <label
                                                key={inst.id}
                                                className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                                                    isSelected
                                                        ? 'bg-indigo-600/15 border-indigo-500/50 text-white'
                                                        : 'bg-[#121215] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setAllowedInstanceIds((prev) => Array.from(new Set([...prev, inst.id])));
                                                        } else {
                                                            setAllowedInstanceIds((prev) => prev.filter((x) => x !== inst.id));
                                                        }
                                                    }}
                                                    className="w-3.5 h-3.5 rounded border-zinc-700 text-indigo-500 bg-zinc-900"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-semibold truncate flex items-center gap-1.5">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${inst.status === 'connected' ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                                                        <span className="truncate">{inst.display_name || inst.phone_number || inst.id.slice(0, 8)}</span>
                                                    </div>
                                                    <div className="text-[10px] font-mono text-zinc-500 truncate">{inst.phone_number || inst.id.slice(0, 8)}</div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                            <p className="text-[10px] text-amber-300/80">
                                {allowedInstanceIds.length === 0
                                    ? 'Modo atual: Todas as caixas conectadas desta empresa respondem a este fluxo.'
                                    : `Modo isolado: Somente ${allowedInstanceIds.length} caixa(s) selecionada(s) dispara(m) este fluxo (produção protegida).`}
                            </p>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                            <button
                                type="button"
                                onClick={() => setActiveTab('fluxo')}
                                className="px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800/60 cursor-pointer"
                            >
                                Voltar ao Editor Visual
                            </button>
                            <button
                                type="button"
                                onClick={() => saveFlow(false)}
                                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg cursor-pointer flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" /> Salvar Configurações
                            </button>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'tema' ? (
                <div className="flex-1 overflow-y-auto p-8 bg-[#0e0e11]">
                    <div className="max-w-3xl mx-auto bg-[#18181b] border border-zinc-800 rounded-3xl p-6 space-y-6 shadow-2xl">
                        <div>
                            <h2 className="text-lg font-bold text-white">Variáveis Dinâmicas & Ambiente do Simulador</h2>
                            <p className="text-xs text-zinc-400 mt-1">
                                Utilize estas variáveis entre chaves duplas nos seus blocos de texto para personalizar o atendimento em tempo real.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {[
                                { key: '{{pushName}}', desc: 'Nome do cliente no WhatsApp' },
                                { key: '{{saudacao}}', desc: 'Bom dia / Boa tarde / Boa noite automático' },
                                { key: '{{NomeEmpresa}}', desc: `Nome da empresa (${tenantInfo?.name || 'Empresa Atual'})` },
                                { key: '{{cardapio}}', desc: 'Link do cardápio digital ou catálogo' },
                                { key: '{{GoogleMaps}}', desc: 'Link de localização no Google Maps' },
                                { key: '{{EnderecoEmpresa}}', desc: 'Endereço físico cadastrado na empresa' },
                                { key: '{{HoraFuncionamento}}', desc: 'Horário de atendimento cadastrado' },
                                { key: '{{AbertoFechado}}', desc: 'Retorno de Webhook de status (true/false)' }
                            ].map((v) => (
                                <div key={v.key} className="p-3.5 bg-[#121215] border border-zinc-800 rounded-2xl flex items-center justify-between gap-2">
                                    <div>
                                        <span className="text-xs font-mono font-bold text-indigo-400 block">{v.key}</span>
                                        <span className="text-[11px] text-zinc-400">{v.desc}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => navigator.clipboard.writeText(v.key)}
                                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[10px] font-bold cursor-pointer"
                                    >
                                        Copiar
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-zinc-800">
                            <button
                                type="button"
                                onClick={() => setIsTesting(true)}
                                className="px-4 py-2.5 rounded-xl text-xs font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 flex items-center gap-2 cursor-pointer"
                            >
                                <Play className="w-4 h-4" /> Abrir Simulador WhatsApp / Web
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('fluxo')}
                                className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 cursor-pointer"
                            >
                                Voltar ao Fluxo
                            </button>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'results' ? (
                <div className="flex-1 overflow-y-auto p-8 bg-[#0e0e11]">
                    <div className="max-w-4xl mx-auto bg-[#18181b] border border-zinc-800 rounded-3xl p-6 space-y-5 shadow-2xl">
                        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                            <div>
                                <h2 className="text-lg font-bold text-white">Sessões e Resultados do Fluxo</h2>
                                <p className="text-xs text-zinc-400">Acompanhe os contatos que interagiram com este fluxo e reinicie sessões travadas</p>
                            </div>
                            <button
                                type="button"
                                onClick={fetchConversationStates}
                                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-2 cursor-pointer"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${loadingResults ? 'animate-spin' : ''}`} /> Atualizar
                            </button>
                        </div>

                        {loadingResults ? (
                            <div className="py-16 text-center text-xs text-zinc-500">Carregando sessões do fluxo...</div>
                        ) : conversationStates.length === 0 ? (
                            <div className="py-16 text-center space-y-2">
                                <p className="text-sm font-semibold text-zinc-300">Nenhuma sessão registrada para este fluxo ainda.</p>
                                <p className="text-xs text-zinc-500">Quando clientes acionarem este fluxo no WhatsApp, o progresso e variáveis capturadas aparecerão aqui.</p>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {conversationStates.map((st) => (
                                    <div key={st.id} className="p-4 bg-[#121215] border border-zinc-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-white font-mono">{st.remote_jid}</span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                                    st.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-300' :
                                                    st.status === 'PAUSED_BY_HUMAN' ? 'bg-amber-500/20 text-amber-300' :
                                                    'bg-zinc-800 text-zinc-400'
                                                }`}>
                                                    {st.status}
                                                </span>
                                                <span className="text-[10px] text-zinc-500 font-mono">Nó: {st.current_node_id}</span>
                                            </div>
                                            {st.variables && Object.keys(st.variables).length > 0 && (
                                                <div className="text-[11px] text-zinc-400 font-mono bg-black/40 px-2.5 py-1.5 rounded-lg border border-zinc-800/80">
                                                    {JSON.stringify(st.variables)}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleResetConversationState(st.id)}
                                            className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" /> Resetar Sessão
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar Esquerda Retrátil (Biblioteca de Blocos Organizada por Abas) */}
                <div
                    ref={paletteSidebarRef}
                    className={`${
                        isPaletteCollapsed ? 'w-11' : 'w-60'
                    } bg-[#121318] border-r border-white/[0.07] flex flex-col z-10 shrink-0 transition-all duration-200 overflow-hidden`}
                >
                    {/* Topo da Sidebar: Busca + Botão de Recolher para Maximizar Canvas */}
                    <div className="p-2.5 border-b border-white/[0.06] flex items-center justify-between gap-1.5">
                        {!isPaletteCollapsed && (
                            <div className="relative flex-1 flex items-center">
                                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Buscar bloco..."
                                    value={searchFilter}
                                    onChange={(e) => setSearchFilter(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
                                />
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => setIsPaletteCollapsed(c => !c)}
                            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5 cursor-pointer shrink-0 mx-auto"
                            title={isPaletteCollapsed ? 'Expandir Biblioteca de Blocos' : 'Recolher Biblioteca para Ampliar o Canvas'}
                        >
                            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isPaletteCollapsed ? '' : 'rotate-180'}`} />
                        </button>
                    </div>

                    {isPaletteCollapsed ? (
                        <div className="flex-1 flex flex-col items-center py-3 gap-3 text-zinc-500">
                            <button
                                type="button"
                                onClick={() => setIsPaletteCollapsed(false)}
                                className="p-2 rounded-xl hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                                title="Abrir Blocos de Mensagem"
                            >
                                <MessageSquare className="w-4 h-4 text-orange-400" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsPaletteCollapsed(false)}
                                className="p-2 rounded-xl hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                                title="Abrir Blocos de Pergunta/Input"
                            >
                                <MousePointerClick className="w-4 h-4 text-amber-400" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsPaletteCollapsed(false)}
                                className="p-2 rounded-xl hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                                title="Abrir Condicionais e Lógica"
                            >
                                <Filter className="w-4 h-4 text-purple-400" />
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Abas Rápidas de Filtro por Categoria */}
                            <div className="px-2.5 pt-2 pb-1.5 flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-white/[0.05]">
                                {[
                                    { id: 'ALL', label: 'Todos' },
                                    { id: 'Bubbles', label: 'Msgs' },
                                    { id: 'Inputs', label: 'Inputs' },
                                    { id: 'Condicionais', label: 'Lógica' },
                                    { id: 'Eventos', label: 'Eventos' }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActivePaletteCategory(tab.id)}
                                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                                            activePaletteCategory === tab.id
                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Categorias e Blocos */}
                            <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-3.5 styled-scrollbar">
                                {categories
                                    .filter(cat => activePaletteCategory === 'ALL' || cat === activePaletteCategory)
                                    .map((category) => (
                                    <div key={category}>
                                        <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 mb-1.5 px-1">{category}</h3>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {filteredNodeTypes.filter(n => n.category === category).map((nt) => {
                                                const theme = getBlockTheme(nt.type);
                                                const isSubmenuOpen = paletteSubmenu?.type === nt.type;
                                                return (
                                                    <button
                                                        key={nt.type}
                                                        type="button"
                                                        onDragStart={(event) => {
                                                            setPaletteSubmenu(null);
                                                            onDragStart(event, nt.type, nt.label);
                                                        }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                            const sidebarRight = paletteSidebarRef.current?.getBoundingClientRect().right ?? rect.right;
                                                            setPaletteSubmenu((prev) =>
                                                                prev?.type === nt.type
                                                                    ? null
                                                                    : {
                                                                          type: nt.type,
                                                                          label: nt.label,
                                                                          top: Math.max(72, Math.min(rect.top, window.innerHeight - 235)),
                                                                          left: Math.min(sidebarRight + 8, window.innerWidth - 268),
                                                                      }
                                                            );
                                                        }}
                                                        draggable
                                                        title={`${nt.label} — Arraste ao canvas ou clique para adicionar`}
                                                        className={`flex items-center justify-between gap-1.5 p-2 rounded-xl cursor-pointer transition-all text-left group border ${
                                                            isSubmenuOpen
                                                                ? 'bg-indigo-600/20 border-indigo-500/60 ring-1 ring-indigo-500/40'
                                                                : 'bg-[#1a1b22] border-white/[0.06] hover:bg-[#23252f] hover:border-white/15'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <nt.icon className={`w-3.5 h-3.5 ${theme.iconColor} shrink-0 group-hover:scale-110 transition-transform`} />
                                                            <span className="text-[11px] font-medium text-zinc-200 truncate">{nt.label}</span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Submenu Flutuante Ancorado FORA da sidebar (zero sobreposição sobre outros botões) */}
                {paletteSubmenu && (
                    <div
                        style={{ top: paletteSubmenu.top, left: paletteSubmenu.left }}
                        onClick={(e) => e.stopPropagation()}
                        className="fixed z-[130] w-64 bg-[#181820] border border-zinc-700 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-2.5 space-y-1.5"
                    >
                        <div className="px-2 py-1.5 border-b border-zinc-800 flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white truncate">{paletteSubmenu.label}</span>
                            <span className="text-[9px] font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 shrink-0">{paletteSubmenu.type}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                const targetType = paletteSubmenu.type;
                                setPaletteSubmenu(null);
                                setHelpBlockType(targetType);
                            }}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-100 hover:bg-indigo-600/20 hover:text-indigo-200 transition-colors cursor-pointer text-left"
                        >
                            <BookOpen className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                            <div>
                                <div className="font-semibold">1-) Instruções de uso</div>
                                <div className="text-[10px] text-zinc-400">Guia técnico, variáveis & anti-loop</div>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleGenerateBlockExample(paletteSubmenu.type, false)}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-100 hover:bg-amber-500/20 hover:text-amber-200 transition-colors cursor-pointer text-left"
                        >
                            <FlaskConical className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <div>
                                <div className="font-semibold">2-) Exemplo</div>
                                <div className="text-[10px] text-zinc-400">Gera exemplo funcional conectado</div>
                            </div>
                        </button>
                        <div className="pt-1 border-t border-zinc-800/80 grid grid-cols-2 gap-1">
                            <button
                                type="button"
                                onClick={() => handleGenerateBlockExample(paletteSubmenu.type, true)}
                                className="px-2 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                            >
                                <Play className="w-3 h-3 fill-current" /> Exemplo+Chat
                            </button>
                            <button
                                type="button"
                                onClick={() => handleAddSingleBlock(paletteSubmenu.type, paletteSubmenu.label)}
                                className="px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                            >
                                <Plus className="w-3 h-3" /> Só Bloco
                            </button>
                        </div>
                    </div>
                )}

                {/* Editor Graph Canvas */}
                <div className="flex-1 relative bg-[#0e0e11]" ref={reactFlowWrapper}>
                    {builderNotice && (
                        <div className="absolute top-4 left-4 z-20 max-w-md bg-[#181820]/95 border border-indigo-500/40 rounded-2xl px-4 py-3 shadow-2xl backdrop-blur flex items-start gap-3">
                            <FlaskConical className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0 text-xs">
                                <div className="font-bold text-white truncate">{builderNotice.title}</div>
                                <p className="text-[11px] text-zinc-300 mt-0.5 leading-snug">{builderNotice.detail}</p>
                                <div className="flex items-center gap-2 mt-2">
                                    {builderNotice.focusGroupId && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFocusedStartNodeId(builderNotice.focusGroupId);
                                                setIsTesting(true);
                                            }}
                                            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                        >
                                            <Play className="w-3 h-3 fill-current" /> Testar no Simulador
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setBuilderNotice(null)}
                                        className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] cursor-pointer"
                                    >
                                        Dispensar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
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
                        onPaneClick={() => setSelectedNode(null)}
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

                {/* Properties Inspector Drawer (Direita - com botão Fechar para liberar 100% do Canvas) */}
                {selectedNode && (
                    <div className="w-80 sm:w-96 bg-[#13141a]/95 backdrop-blur-2xl border-l border-white/10 p-5 flex flex-col gap-5 animate-in slide-in-from-right z-10 shadow-2xl overflow-y-auto styled-scrollbar">
                        <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-white/10">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-1.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 shrink-0">
                                    <Settings2 className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-bold text-white truncate">Inspector do Bloco</h3>
                                    <p className="text-[10px] text-zinc-400 truncate">Clique fora no canvas para fechar</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedNode(null)}
                                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-bold border border-white/10 cursor-pointer shrink-0"
                                title="Fechar Inspector e ampliar o canvas"
                            >
                                ✕ Fechar
                            </button>
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
                                        onBlur={(e) => {
                                            const norm = normalizeUrlsInText(e.target.value);
                                            if (norm !== e.target.value) handleDataChange('text', norm);
                                        }}
                                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all shadow-inner font-sans"
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
                                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-700/70">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0"></span>
                                                        <span className="text-xs font-semibold text-slate-200 truncate">{block.label || 'Bloco'}</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setHelpBlockType(block.flowType)}
                                                        className="px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                                                        title="Abrir Instruções de Uso deste Bloco"
                                                    >
                                                        <BookOpen className="w-3 h-3" /> Instruções
                                                    </button>
                                                </div>

                                                {['send_message', 'text', 'ask', 'text_input', 'buttons', 'poll', 'pic_choice', 'handoff', 'set_variable', 'email_input', 'number_input', 'phone_input', 'website_input', 'date_input', 'time_input', 'payment', 'rating', 'file_input', 'reply', 'redirect'].includes(block.flowType) && (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Texto / Pergunta</label>
                                                            <span className="text-[10px] text-zinc-500 font-mono">
                                                                {(block.text || '').split('\n').length} linha(s) • {(block.text || '').length} carac.
                                                            </span>
                                                        </div>

                                                        {/* Atalhos Rápidos de Variáveis com 1 clique */}
                                                        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                                                            {['{{pushName}}', '{{saudacao}}', '{{cardapio}}', '{{NomeEmpresa}}', '{{GoogleMaps}}'].map((v) => (
                                                                <button
                                                                    key={v}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const cur = block.text || '';
                                                                        updateBlock('text', cur ? `${cur} ${v}` : v);
                                                                    }}
                                                                    className="text-[9px] bg-slate-900 hover:bg-indigo-950 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 hover:border-indigo-400/50 px-1.5 py-0.5 rounded font-mono font-medium transition-colors shrink-0"
                                                                    title={`Inserir variável ${v}`}
                                                                >
                                                                    + {v}
                                                                </button>
                                                            ))}
                                                        </div>

                                                        <textarea
                                                            rows={Math.min(16, Math.max(7, (block.text || '').split('\n').length + 2))}
                                                            value={block.text || ''}
                                                            onChange={(e) => updateBlock('text', e.target.value)}
                                                            onBlur={(e) => {
                                                                const norm = normalizeUrlsInText(e.target.value);
                                                                if (norm !== e.target.value) {
                                                                    updateBlock('text', norm);
                                                                }
                                                            }}
                                                            placeholder="Digite a mensagem ou use as variáveis acima..."
                                                            className="w-full bg-slate-900 border border-slate-700 text-slate-100 p-3 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none resize-y min-h-[180px] max-h-[480px] transition-all font-sans leading-relaxed shadow-inner"
                                                        />
                                                        {(() => {
                                                            const detected = extractUrlsFromText(block.text || '');
                                                            if (detected.length === 0) return null;
                                                            const hasPendingHttps = detected.some(u => !u.hasHttps);
                                                            return (
                                                                <div className="mt-2 p-2.5 bg-sky-950/40 border border-sky-500/30 rounded-xl text-xs space-y-1.5 shadow-sm">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[11px] font-semibold text-sky-300 flex items-center gap-1.5">
                                                                            <ExternalLink className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                                                            {detected.length} link(s) identificado(s)
                                                                        </span>
                                                                        {hasPendingHttps && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    const norm = normalizeUrlsInText(block.text || '');
                                                                                    updateBlock('text', norm);
                                                                                }}
                                                                                className="text-[10px] bg-sky-600/40 hover:bg-sky-600/60 text-sky-200 px-2 py-0.5 rounded-lg border border-sky-400/40 transition-colors font-medium active:scale-95"
                                                                                title="Adicionar https:// automaticamente"
                                                                            >
                                                                                Ajustar https://
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    <div className="space-y-1 max-h-32 overflow-y-auto">
                                                                        {detected.map((item, idx) => (
                                                                            <div key={idx} className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-300 bg-slate-900/60 px-2 py-1 rounded border border-slate-800/80">
                                                                                <span className={item.hasHttps ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                                                                                    {item.hasHttps ? '✓ clicável' : '⚠ sem https'}
                                                                                </span>
                                                                                <span className="truncate flex-1" title={item.normalized}>{item.original}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
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
                                                    <div className="space-y-3">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">URL da Mídia / Embed</label>
                                                            <input
                                                                type="text"
                                                                value={block.url || ''}
                                                                onChange={(e) => updateBlock('url', e.target.value)}
                                                                placeholder="https://..."
                                                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-mono"
                                                            />
                                                        </div>
                                                        {['image', 'video'].includes(block.flowType) && (
                                                            <div>
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Legenda (Opcional)</label>
                                                                <input
                                                                    type="text"
                                                                    value={block.caption || block.text || ''}
                                                                    onChange={(e) => {
                                                                        const newBlocks = [...(selectedNode.data.blocks as any[])];
                                                                        newBlocks[idx] = { ...block, caption: e.target.value, text: e.target.value };
                                                                        handleDataChange('blocks', newBlocks as any);
                                                                    }}
                                                                    placeholder="Legenda da mídia..."
                                                                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {['buttons', 'pic_choice', 'cards', 'poll'].includes(block.flowType) && (
                                                    <div className="space-y-3">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Opções (Separadas por vírgula)</label>
                                                            <textarea
                                                                rows={3}
                                                                value={(block.options || []).join(', ')}
                                                                onChange={(e) => {
                                                                    const opts = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                                                    updateBlock('options', opts as any);
                                                                }}
                                                                placeholder="Fazer Pedido, Ver Cardápio, Falar com Atendente"
                                                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none resize-none transition-all"
                                                            />
                                                        </div>
                                                        {block.flowType === 'pic_choice' && (
                                                            <div className="space-y-1.5 p-2.5 bg-orange-950/20 border border-orange-500/30 rounded-xl">
                                                                <label className="text-[10px] font-bold text-orange-300 uppercase tracking-wider block">
                                                                    URLs das Imagens por Opção (1 por linha, na mesma ordem)
                                                                </label>
                                                                <textarea
                                                                    rows={3}
                                                                    value={(block.optionImages || []).join('\n')}
                                                                    onChange={(e) => {
                                                                        const imgs = e.target.value.split('\n').map(s => s.trim());
                                                                        updateBlock('optionImages', imgs as any);
                                                                    }}
                                                                    placeholder="https://.../foto-1.jpg&#10;https://.../foto-2.jpg"
                                                                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg text-[11px] font-mono outline-none focus:ring-1 focus:ring-orange-500"
                                                                />
                                                            </div>
                                                        )}
                                                        {block.flowType === 'poll' && (
                                                            <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl space-y-1.5">
                                                                <label className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">
                                                                    Quantidade Máxima de Escolhas (Enquete Nativa)
                                                                </label>
                                                                <select
                                                                    value={block.selectableCount || 1}
                                                                    onChange={(e) => updateBlock('selectableCount', Number(e.target.value) as any)}
                                                                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                                                                >
                                                                    <option value={1}>Escolha Única (1 opção - Recomendado para Menu/NPS)</option>
                                                                    <option value={2}>Até 2 opções</option>
                                                                    <option value={3}>Até 3 opções</option>
                                                                    <option value={5}>Múltipla Escolha (Até 5 opções)</option>
                                                                </select>
                                                                <p className="text-[10px] text-slate-400">
                                                                    O cliente vota com 1 toque na enquete nativa do WhatsApp e o fluxo segue para a ramificação da opção escolhida.
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {block.flowType === 'condition' && (
                                                    <div className="space-y-3 p-3 bg-purple-950/20 border border-purple-500/30 rounded-xl">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Regras Condicionais (SE / SENÃO)</label>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const currentItems = Array.isArray(block.items) ? [...block.items] : [];
                                                                    const newItem = {
                                                                        id: `${block.id}-item-${currentItems.length + 1}-${Date.now().toString().slice(-3)}`,
                                                                        varName: block.var_name || 'NumeroMenu',
                                                                        operator: '=',
                                                                        value: String(currentItems.length + 1),
                                                                        label: `SE ${block.var_name || 'NumeroMenu'} = ${currentItems.length + 1}`
                                                                    };
                                                                    const nextItems = [...currentItems, newItem];
                                                                    const newBlocks = [...(selectedNode.data.blocks as any[])];
                                                                    newBlocks[idx] = {
                                                                        ...block,
                                                                        items: nextItems,
                                                                        variable: nextItems[0]?.varName || 'NumeroMenu',
                                                                        operator: nextItems[0]?.operator || '=',
                                                                        value: nextItems[0]?.value || '1'
                                                                    };
                                                                    handleDataChange('blocks', newBlocks as any);
                                                                }}
                                                                className="px-2 py-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 rounded text-[10px] font-bold border border-purple-500/40 cursor-pointer"
                                                            >
                                                                + Regra SE
                                                            </button>
                                                        </div>

                                                        <div className="space-y-2">
                                                            {(Array.isArray(block.items) && block.items.length > 0 ? block.items : []).map((it: any, itIdx: number) => (
                                                                <div key={it.id || itIdx} className="p-2 bg-slate-900/90 border border-slate-700 rounded-lg space-y-1.5">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[10px] font-bold text-purple-400">SE #{itIdx + 1}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const nextItems = (block.items || []).filter((_: any, i: number) => i !== itIdx);
                                                                                updateBlock('items', nextItems as any);
                                                                            }}
                                                                            className="text-slate-500 hover:text-rose-400 cursor-pointer"
                                                                        >
                                                                            <Trash2 className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                    <div className="grid grid-cols-3 gap-1.5">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Variável"
                                                                            value={it.varName || ''}
                                                                            onChange={(e) => {
                                                                                const nextItems = [...(block.items || [])];
                                                                                nextItems[itIdx] = { ...it, varName: e.target.value, label: `SE ${e.target.value} ${it.operator || '='} ${it.value || ''}` };
                                                                                const newBlocks = [...(selectedNode.data.blocks as any[])];
                                                                                newBlocks[idx] = { ...block, items: nextItems, variable: nextItems[0]?.varName };
                                                                                handleDataChange('blocks', newBlocks as any);
                                                                            }}
                                                                            className="bg-slate-950 border border-slate-700 text-white px-2 py-1 rounded text-[10px] font-mono"
                                                                        />
                                                                        <select
                                                                            value={it.operator || '='}
                                                                            onChange={(e) => {
                                                                                const nextItems = [...(block.items || [])];
                                                                                nextItems[itIdx] = { ...it, operator: e.target.value, label: `SE ${it.varName || ''} ${e.target.value} ${it.value || ''}` };
                                                                                const newBlocks = [...(selectedNode.data.blocks as any[])];
                                                                                newBlocks[idx] = { ...block, items: nextItems, operator: nextItems[0]?.operator };
                                                                                handleDataChange('blocks', newBlocks as any);
                                                                            }}
                                                                            className="bg-slate-950 border border-slate-700 text-white px-1.5 py-1 rounded text-[10px]"
                                                                        >
                                                                            <option value="=">= (Igual)</option>
                                                                            <option value="≠">≠ (Diferente)</option>
                                                                            <option value="contains">Contém</option>
                                                                            <option value=">">&gt; (Maior)</option>
                                                                            <option value="<">&lt; (Menor)</option>
                                                                            <option value="exists">Existe</option>
                                                                        </select>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Valor"
                                                                            value={it.value || ''}
                                                                            onChange={(e) => {
                                                                                const nextItems = [...(block.items || [])];
                                                                                nextItems[itIdx] = { ...it, value: e.target.value, label: `SE ${it.varName || ''} ${it.operator || '='} ${e.target.value}` };
                                                                                const newBlocks = [...(selectedNode.data.blocks as any[])];
                                                                                newBlocks[idx] = { ...block, items: nextItems, value: nextItems[0]?.value };
                                                                                handleDataChange('blocks', newBlocks as any);
                                                                            }}
                                                                            className="bg-slate-950 border border-slate-700 text-white px-2 py-1 rounded text-[10px] font-mono"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {block.flowType === 'jump' && (
                                                    <div className="space-y-2 p-3 bg-purple-950/20 border border-purple-500/30 rounded-xl">
                                                        <label className="text-[10px] font-bold text-purple-300 uppercase tracking-wider block">Pular para o Grupo (Destino)</label>
                                                        <select
                                                            value={block.target_group_id || ''}
                                                            onChange={(e) => {
                                                                const targetGrp = nodes.find(n => n.id === e.target.value);
                                                                const newBlocks = [...(selectedNode.data.blocks as any[])];
                                                                newBlocks[idx] = {
                                                                    ...block,
                                                                    target_group_id: e.target.value,
                                                                    target_group_name: (targetGrp?.data?.label as string) || 'Menu'
                                                                };
                                                                handleDataChange('blocks', newBlocks as any);
                                                            }}
                                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-purple-500 outline-none"
                                                        >
                                                            <option value="">Selecione o grupo de destino...</option>
                                                            {nodes.filter(n => n.type === 'typebot_group' && n.id !== selectedNode.id).map(g => (
                                                                <option key={g.id} value={g.id}>{(g.data?.label as string) || g.id}</option>
                                                            ))}
                                                        </select>
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

                                                {block.flowType === 'payment' && (
                                                    <div className="space-y-3 p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl">
                                                        <div className="flex items-center gap-1.5 text-amber-400">
                                                            <CreditCard className="w-4 h-4" />
                                                            <label className="text-[10px] font-bold uppercase tracking-wider">Configuração Pix WhatsApp</label>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-400 block mb-1">Valor (R$ ou Variável)</label>
                                                            <input
                                                                type="text"
                                                                value={block.amount || ''}
                                                                onChange={(e) => updateBlock('amount', e.target.value)}
                                                                placeholder="Ex: 59,90 ou {{total_pedido}}"
                                                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-amber-500 outline-none transition-all font-mono"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-400 block mb-1">Chave Pix</label>
                                                            <input
                                                                type="text"
                                                                value={block.pix_key || ''}
                                                                onChange={(e) => updateBlock('pix_key', e.target.value)}
                                                                placeholder="Chave Pix ou {{chave_pix}}"
                                                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-amber-500 outline-none transition-all font-mono"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-400 block mb-1">Código Pix Copia e Cola (Opcional)</label>
                                                            <input
                                                                type="text"
                                                                value={block.pix_code || ''}
                                                                onChange={(e) => updateBlock('pix_code', e.target.value)}
                                                                placeholder="Payload Pix ou {{pix_copia_e_cola}}"
                                                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-amber-500 outline-none transition-all font-mono"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-400 block mb-1">Link de Pagamento (Opcional)</label>
                                                            <input
                                                                type="text"
                                                                value={block.payment_link || ''}
                                                                onChange={(e) => updateBlock('payment_link', e.target.value)}
                                                                placeholder="https://pagamento.com.br/..."
                                                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-amber-500 outline-none transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {block.flowType === 'embed' && (
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nome do Arquivo / PDF</label>
                                                        <input
                                                            type="text"
                                                            value={block.fileName || block.label || ''}
                                                            onChange={(e) => updateBlock('fileName', e.target.value)}
                                                            placeholder="Ex: cardapio-completo.pdf"
                                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                                        />
                                                    </div>
                                                )}

                                                {['number_input', 'email_input', 'website_input', 'phone_input', 'date_input', 'rating', 'buttons', 'poll', 'pic_choice'].includes(block.flowType) && (
                                                    <div className="p-2.5 bg-slate-900/60 border border-slate-700/70 rounded-xl space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Validar Resposta & Retentativas</label>
                                                            <input
                                                                type="checkbox"
                                                                checked={block.validate !== false}
                                                                onChange={(e) => updateBlock('validate', e.target.checked as any)}
                                                                className="w-3.5 h-3.5 rounded border-slate-700 text-indigo-500 bg-slate-900"
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-[10px] text-slate-400">Máx. erros antes de encerrar (anti-loop):</span>
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                max={10}
                                                                value={block.max_retries ?? 3}
                                                                onChange={(e) => updateBlock('max_retries', Math.max(1, Number(e.target.value) || 3) as any)}
                                                                className="w-16 bg-slate-950 border border-slate-700 text-slate-200 px-2 py-1 rounded text-xs font-mono text-center"
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {block.flowType === 'script' && (
                                                    <div className="space-y-2.5 p-3 bg-purple-950/20 border border-purple-500/30 rounded-xl">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Código JavaScript (Sandbox Segura)</label>
                                                            <span className="text-[9px] font-mono text-purple-400">timeout 150ms</span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => updateBlock('code', 'const total = Number(variables.quantidade || 1) * 49.90;\nsetVar("total_formatado", total.toFixed(2).replace(".", ","));')}
                                                                className="text-[9px] px-1.5 py-0.5 rounded bg-purple-900/50 hover:bg-purple-800 text-purple-200 border border-purple-500/30 cursor-pointer"
                                                            >
                                                                Preset: Calcular Total
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => updateBlock('code', 'const limpo = String(variables.nome_cliente || "").trim().toUpperCase();\nsetVar("nome_maiusculo", limpo);')}
                                                                className="text-[9px] px-1.5 py-0.5 rounded bg-purple-900/50 hover:bg-purple-800 text-purple-200 border border-purple-500/30 cursor-pointer"
                                                            >
                                                                Preset: Maiúsculas
                                                            </button>
                                                        </div>
                                                        <textarea
                                                            rows={5}
                                                            value={block.code || block.text || ''}
                                                            onChange={(e) => updateBlock('code', e.target.value)}
                                                            placeholder={'setVar("total", Number(variables.qtd || 1) * 10);'}
                                                            className="w-full bg-slate-950 border border-slate-700 text-purple-200 px-3 py-2 rounded-lg text-[11px] font-mono outline-none focus:ring-1 focus:ring-purple-500"
                                                        />
                                                        <div className="flex items-center justify-between gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    try {
                                                                        const sampleVars: Record<string, any> = { pushName: 'Ronaldo Teste', nome_cliente: 'Ronaldo', quantidade: '2', NumeroMenu: '1' };
                                                                        const fn = new Function('variables', 'setVar', `${block.code || block.text || ''}\nreturn variables;`);
                                                                        const out = fn(sampleVars, (k: string, v: any) => { sampleVars[k] = v; });
                                                                        setInspectorTestResult(prev => ({ ...prev, [block.id]: `✅ OK: ${JSON.stringify(out)}` }));
                                                                    } catch (err: any) {
                                                                        setInspectorTestResult(prev => ({ ...prev, [block.id]: `❌ Erro: ${err?.message}` }));
                                                                    }
                                                                }}
                                                                className="px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                                            >
                                                                <Play className="w-3 h-3" /> Testar Script
                                                            </button>
                                                        </div>
                                                        {inspectorTestResult[block.id] && (
                                                            <div className="p-2 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-zinc-200 break-all">
                                                                {inspectorTestResult[block.id]}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {block.flowType === 'ab_test' && (
                                                    <div className="space-y-2 p-3 bg-purple-950/20 border border-purple-500/30 rounded-xl">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Distribuição Teste A/B</label>
                                                            <span className="text-xs font-mono font-bold text-white">
                                                                A: {block.splitA ?? 50}% / B: {100 - (block.splitA ?? 50)}%
                                                            </span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min={0}
                                                            max={100}
                                                            step={5}
                                                            value={block.splitA ?? 50}
                                                            onChange={(e) => updateBlock('splitA', Number(e.target.value) as any)}
                                                            className="w-full accent-purple-500"
                                                        />
                                                        <p className="text-[10px] text-slate-400">
                                                            Conecte a porta roxa <strong>Ramo A</strong> e a porta <strong>Ramo B</strong> do bloco para comparar resultados.
                                                        </p>
                                                    </div>
                                                )}

                                                {block.flowType === 'redirect' && (
                                                    <div className="space-y-2.5 p-3 bg-purple-950/20 border border-purple-500/30 rounded-xl">
                                                        <label className="text-[10px] font-bold text-purple-300 uppercase tracking-wider block">URL de Redirecionamento Externo</label>
                                                        <input
                                                            type="url"
                                                            value={block.url || ''}
                                                            onChange={(e) => updateBlock('url', e.target.value)}
                                                            placeholder="https://xpointsolucoes.com.br/..."
                                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs font-mono"
                                                        />
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block pt-1">Ou Chamar Outro Fluxo (Opcional)</label>
                                                        <select
                                                            value={block.target_flow_id || ''}
                                                            onChange={(e) => updateBlock('target_flow_id', e.target.value)}
                                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs"
                                                        >
                                                            <option value="">Usar apenas URL externa acima</option>
                                                            {availableFlows.map(f => (
                                                                <option key={f.id} value={f.id}>{f.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}

                                                {block.flowType === 'reply' && (
                                                    <div className="flex items-center justify-between bg-sky-950/30 p-2.5 rounded-xl border border-sky-500/30">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-sky-300 uppercase tracking-wider block">Citar Mensagem do Cliente</label>
                                                            <span className="text-[10px] text-slate-400">Responde marcando (quote) no WhatsApp</span>
                                                        </div>
                                                        <input
                                                            type="checkbox"
                                                            checked={block.quote_message !== false}
                                                            onChange={(e) => updateBlock('quote_message', e.target.checked as any)}
                                                            className="w-4 h-4 rounded border-slate-700 text-sky-500 bg-slate-900"
                                                        />
                                                    </div>
                                                )}

                                                {block.flowType === 'command' && (
                                                    <div className="space-y-2.5 p-3 bg-sky-950/20 border border-sky-500/30 rounded-xl">
                                                        <label className="text-[10px] font-bold text-sky-300 uppercase tracking-wider block">Ação de Controle CRM</label>
                                                        <select
                                                            value={block.command_action || 'add_tag'}
                                                            onChange={(e) => updateBlock('command_action', e.target.value)}
                                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs"
                                                        >
                                                            <option value="add_tag">Adicionar Etiqueta (Tag) no Ticket</option>
                                                            <option value="remove_tag">Remover Etiqueta (Tag) do Ticket</option>
                                                            <option value="update_contact_name">Atualizar Nome do Contato</option>
                                                            <option value="pause_ai">Pausar Robô I.A. na Conversa</option>
                                                            <option value="resume_ai">Reativar Robô I.A. na Conversa</option>
                                                            <option value="close_ticket">Finalizar / Fechar Ticket no CRM</option>
                                                            <option value="clear_variables">Limpar Variáveis Temporárias</option>
                                                        </select>
                                                        {!['pause_ai', 'resume_ai', 'close_ticket', 'clear_variables'].includes(block.command_action || 'add_tag') && (
                                                            <div>
                                                                <label className="text-[10px] font-bold text-slate-400 block mb-1">Valor / Parâmetro</label>
                                                                <input
                                                                    type="text"
                                                                    value={block.command_value || ''}
                                                                    onChange={(e) => updateBlock('command_value', e.target.value)}
                                                                    placeholder="Ex: lead-quente ou {{nome_cliente}}"
                                                                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs font-mono"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {block.flowType === 'webhook' && (
                                                    <div className="space-y-3 p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl">
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <div>
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Método</label>
                                                                <select
                                                                    value={block.method || 'GET'}
                                                                    onChange={(e) => updateBlock('method', e.target.value)}
                                                                    className="w-full bg-slate-900 border border-slate-700 text-emerald-300 font-bold px-2 py-2 rounded-lg text-xs"
                                                                >
                                                                    <option value="GET">GET</option>
                                                                    <option value="POST">POST</option>
                                                                    <option value="PUT">PUT</option>
                                                                    <option value="DELETE">DELETE</option>
                                                                </select>
                                                            </div>
                                                            <div className="col-span-2">
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Variável de Retorno</label>
                                                                <input
                                                                    type="text"
                                                                    value={block.response_var_name || ''}
                                                                    onChange={(e) => updateBlock('response_var_name', e.target.value)}
                                                                    placeholder="Ex: AbertoFechado"
                                                                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-2.5 py-2 rounded-lg text-xs font-mono"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Webhook URL</label>
                                                            <input
                                                                type="url"
                                                                value={block.url || block.webhookUrl || ''}
                                                                onChange={(e) => {
                                                                    const newBlocks = [...(selectedNode.data.blocks as any[])];
                                                                    newBlocks[idx] = { ...block, url: e.target.value, webhookUrl: e.target.value };
                                                                    handleDataChange('blocks', newBlocks as any);
                                                                }}
                                                                placeholder="https://viacep.com.br/ws/{{cep}}/json/"
                                                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-mono"
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div>
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">JSON Path (Opcional)</label>
                                                                <input
                                                                    type="text"
                                                                    value={block.response_path || ''}
                                                                    onChange={(e) => updateBlock('response_path', e.target.value)}
                                                                    placeholder="Ex: localidade ou data.id"
                                                                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg text-[11px] font-mono"
                                                                />
                                                            </div>
                                                            <div className="flex items-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        const rawUrl = String(block.url || block.webhookUrl || '').replace(/\{\{cep\}\}/gi, '01001000').trim();
                                                                        const mtd = String(block.method || 'GET').toUpperCase();
                                                                        if (!rawUrl) {
                                                                            setInspectorTestResult(prev => ({ ...prev, [block.id]: '⚠️ Preencha a URL antes de testar.' }));
                                                                            return;
                                                                        }
                                                                        setInspectorTestResult(prev => ({ ...prev, [block.id]: '⏳ Testando requisição...' }));
                                                                        try {
                                                                            const opts: RequestInit = { method: mtd };
                                                                            if (mtd !== 'GET' && mtd !== 'HEAD' && block.body) {
                                                                                opts.headers = { 'Content-Type': 'application/json' };
                                                                                opts.body = block.body;
                                                                            }
                                                                            const res = await fetch(rawUrl, opts);
                                                                            const txt = await res.text();
                                                                            setInspectorTestResult(prev => ({ ...prev, [block.id]: `✅ HTTP ${res.status}: ${txt.slice(0, 140)}` }));
                                                                        } catch (err: any) {
                                                                            setInspectorTestResult(prev => ({ ...prev, [block.id]: `⚠️ ${err?.message || 'Falha/CORS no navegador (no servidor Node funciona sem CORS)'}` }));
                                                                        }
                                                                    }}
                                                                    className="w-full px-2.5 py-1.5 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                                                                >
                                                                    <FlaskConical className="w-3 h-3" /> Testar API
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {String(block.method || 'GET').toUpperCase() !== 'GET' && (
                                                            <div>
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Body JSON (POST/PUT)</label>
                                                                <textarea
                                                                    rows={3}
                                                                    value={block.body || ''}
                                                                    onChange={(e) => updateBlock('body', e.target.value)}
                                                                    placeholder={'{"nome": "{{nome_cliente}}"}'}
                                                                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg text-[11px] font-mono"
                                                                />
                                                            </div>
                                                        )}
                                                        {inspectorTestResult[block.id] && (
                                                            <div className="p-2 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-zinc-200 break-all">
                                                                {inspectorTestResult[block.id]}
                                                            </div>
                                                        )}
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

                                                {(block.flowType === 'set_variable' || block.flowType.endsWith('_input') || block.flowType === 'ask' || block.flowType === 'buttons' || block.flowType === 'poll' || block.flowType === 'pic_choice' || block.flowType === 'payment' || block.flowType === 'rating' || block.flowType === 'file_input') && (
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
            )}

            {isTesting && (
                <TestSimulator
                    nodes={nodes}
                    edges={edges}
                    startNodeId={focusedStartNodeId}
                    onClose={() => {
                        setIsTesting(false);
                        setFocusedStartNodeId(undefined);
                    }}
                />
            )}

            <FlowHelpModal 
                isOpen={isHelpOpen}
                onClose={() => setIsHelpOpen(false)}
                onLoadTemplate={handleLoadTemplate}
                onOpenBlockInstructions={(fType) => setHelpBlockType(fType)}
                onGenerateBlockExample={(fType, openSim) => handleGenerateBlockExample(fType, openSim)}
            />

            <BlockHelpDrawer
                flowType={helpBlockType}
                onClose={() => setHelpBlockType(null)}
                onGenerateExample={(fType, openSim) => handleGenerateBlockExample(fType, openSim)}
                onAddSingleBlock={(fType) => handleAddSingleBlock(fType)}
            />

            <FlowHealthModal
                isOpen={isHealthOpen}
                onClose={() => setIsHealthOpen(false)}
                issues={flowHealthIssues}
                onFocusNode={(nodeId, blockId) => {
                    const target = nodes.find((n) => n.id === nodeId);
                    if (target) setSelectedNode(target);
                    if (blockId) setSelectedBlockId(blockId);
                    setTimeout(() => {
                        fitView({ nodes: [{ id: nodeId }], duration: 500, padding: 0.4 });
                    }, 80);
                }}
            />
        </div>
        </FlowActionsContext.Provider>
    );
}

export default function FlowBuilder() {
    return (
        <ReactFlowProvider>
            <FlowBuilderContent />
        </ReactFlowProvider>
    );
}
