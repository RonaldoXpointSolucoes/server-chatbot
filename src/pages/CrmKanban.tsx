import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  ClipboardList, 
  Search, 
  User, 
  Clock, 
  CheckCircle2, 
  Plus, 
  Filter, 
  Loader2, 
  Calendar, 
  Trash2,
  Edit2,
  Sparkles,
  DollarSign,
  ChevronRight,
  TrendingUp,
  History,
  Power,
  Star,
  Settings,
  CircleDot,
  FileText,
  Building,
  UserCheck,
  MessageSquare,
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
  Copy,
  Sliders,
  X,
  Mic,
  Square,
  Radio,
  Wand2,
  Cpu,
  Layers,
  Check,
  CheckCheck,
  Terminal,
  FileCode2,
  ArrowRight,
  ShieldCheck,
  Zap,
  Code
} from 'lucide-react';
import { useChatStore, instanceCache } from '../store/chatStore';
import { supabase } from '../services/supabase';
import { geminiService } from '../services/geminiService';
import KanbanBoardCreator from '../components/KanbanBoardCreator';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'framer-motion';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const getColorClasses = (colorClass: string) => {
  const base = colorClass.replace('bg-', '');
  switch (base) {
    case 'blue-500':
      return {
        text: 'text-blue-600 dark:text-blue-400',
        border: 'border-blue-500/20 dark:border-blue-500/10',
        borderTop: 'border-t-blue-500',
        bgLight: 'bg-blue-500/10 dark:bg-blue-500/15',
        badge: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300 border border-blue-500/20'
      };
    case 'emerald-500':
      return {
        text: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-500/20 dark:border-emerald-500/10',
        borderTop: 'border-t-emerald-500',
        bgLight: 'bg-emerald-500/10 dark:bg-emerald-500/15',
        badge: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-500/20'
      };
    case 'amber-500':
      return {
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-500/20 dark:border-amber-500/10',
        borderTop: 'border-t-amber-500',
        bgLight: 'bg-amber-500/10 dark:bg-amber-500/15',
        badge: 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-500/20'
      };
    case 'rose-500':
      return {
        text: 'text-rose-600 dark:text-rose-400',
        border: 'border-rose-500/20 dark:border-rose-500/10',
        borderTop: 'border-t-rose-500',
        bgLight: 'bg-rose-500/10 dark:bg-rose-500/15',
        badge: 'bg-rose-500/10 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-500/20'
      };
    case 'violet-500':
      return {
        text: 'text-violet-600 dark:text-violet-400',
        border: 'border-violet-500/20 dark:border-violet-500/10',
        borderTop: 'border-t-violet-500',
        bgLight: 'bg-violet-500/10 dark:bg-violet-500/15',
        badge: 'bg-violet-500/10 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 border border-violet-500/20'
      };
    case 'fuchsia-500':
      return {
        text: 'text-fuchsia-600 dark:text-fuchsia-400',
        border: 'border-fuchsia-500/20 dark:border-fuchsia-500/10',
        borderTop: 'border-t-fuchsia-500',
        bgLight: 'bg-fuchsia-500/10 dark:bg-fuchsia-500/15',
        badge: 'bg-fuchsia-500/10 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300 border border-fuchsia-500/20'
      };
    case 'slate-500':
      return {
        text: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-500/20 dark:border-slate-500/10',
        borderTop: 'border-t-slate-500',
        bgLight: 'bg-slate-500/10 dark:bg-slate-500/15',
        badge: 'bg-slate-500/10 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300 border border-slate-500/20'
      };
    default:
      return {
        text: 'text-indigo-600 dark:text-indigo-400',
        border: 'border-indigo-500/20 dark:border-indigo-500/10',
        borderTop: 'border-t-indigo-500',
        bgLight: 'bg-indigo-500/10 dark:bg-indigo-500/15',
        badge: 'bg-indigo-500/10 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 border border-indigo-500/20'
      };
  }
};

// Interfaces do Kanban CRM
interface CRMBoard {
  id: string;
  name: string;
  config: {
    description?: string;
    features?: {
      agenda?: boolean;
      aiSummary?: boolean;
      probability?: boolean;
      associateCompany?: boolean;
      chatwootInboxId?: string | null;
    };
    stages?: {
      id: string;
      label: string;
      subtitle?: string;
      color: string;
    }[];
  };
}

interface CRMLead {
  id: string;
  board_id: string;
  title: string;
  status: string;
  estimated_revenue: number;
  probability: number;
  priority: number;
  notes: string;
  technical_execution_details?: string | null;
  customer_id: string | null;
  agent_id: string | null;
  start_date: string | null;
  due_date: string | null;
  tags: string[];
  history: {
    from: string;
    to: string;
    by: string;
    at: string;
    delivery_report?: any;
  }[];
  chatwoot_conversation_id: string | null;
  created_at: string;
  position?: number;
}

export default function CrmKanban() {
  const { id: boardId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenantInfo, agents, contacts } = useChatStore();
  const tenantId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');

  // Estados
  const [board, setBoard] = useState<CRMBoard | null>(null);
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [draggingOverStage, setDraggingOverStage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState('all');

  const lastMoveRef = React.useRef<{ leadId: string; stageId: string; hoverCardId: string | null; position: string | null } | null>(null);
  const droppedSuccessRef = React.useRef(false);
  const draggedOriginalStatusRef = React.useRef<string | null>(null);

  const cardPositionsRef = React.useRef<Record<string, { top: number; height: number; centerY: number; status: string }>>({});

  // Modais
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [isEditBoardOpen, setIsEditBoardOpen] = useState(false);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<CRMLead | null>(null);
  const [collapsedStages, setCollapsedStages] = useState<Record<string, boolean>>({});
  const [activeDraggedLeadId, setActiveDraggedLeadId] = useState<string | null>(null);

  // Estados de formulário para Lead
  const [leadForm, setLeadForm] = useState({
    title: '',
    status: '',
    estimated_revenue: 0,
    probability: 50,
    priority: 1,
    customer_id: '',
    agent_id: '',
    due_date: '',
    tagsString: ''
  });

  // Estados para edição do Quadro
  const [editBoardForm, setEditBoardForm] = useState({
    name: '',
    description: '',
    stages: [] as { id: string; label: string; subtitle?: string; color: string }[]
  });

  // IA status
  const [isQualifying, setIsQualifying] = useState(false);

  // Estados para o Modal Detalhes do Lead Modernizado
  const [leadDetailTab, setLeadDetailTab] = useState<'overview' | 'technical' | 'notes' | 'history'>('overview');
  const [copiedDelivery, setCopiedDelivery] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isEditingTechnical, setIsEditingTechnical] = useState(false);
  const [techSummaryInput, setTechSummaryInput] = useState('');
  const [techFilesInput, setTechFilesInput] = useState('');
  const [techValidationInput, setTechValidationInput] = useState('npx tsc --noEmit (0 erros)');
  const [techExecutorInput, setTechExecutorInput] = useState('');
  const [validationAlertMessage, setValidationAlertMessage] = useState<string | null>(null);

  // Estados para Criação de Card com Áudio & IA
  const [isAiCardModalOpen, setIsAiCardModalOpen] = useState(false);
  const [isAiRecording, setIsAiRecording] = useState(false);
  const [aiRecordingSeconds, setAiRecordingSeconds] = useState(0);
  const [aiCardPrompt, setAiCardPrompt] = useState('');
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<{
    title: string;
    category: string;
    priority: number;
    tags: string[];
    technical_plan: string;
    summary: string;
    suggested_stage_label: string;
  } | null>(null);
  const [selectedTargetStage, setSelectedTargetStage] = useState<string>('');

  const aiMediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const aiAudioChunksRef = React.useRef<Blob[]>([]);
  const aiTimerIntervalRef = React.useRef<any>(null);

  const startAiAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      aiAudioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      aiMediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          aiAudioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(aiAudioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          try {
            setIsGeneratingPlan(true);
            const plan = await geminiService.generateFeaturePlanFromAudioOrText({
              audioBase64: base64Audio,
              audioMimeType: 'audio/webm',
              boardName: board?.name
            });
            setGeneratedPlan(plan);
            if (pipelineStages.length > 0) {
              const matched = pipelineStages.find(s => 
                s.label.toLowerCase().includes(plan.suggested_stage_label.toLowerCase()) ||
                plan.suggested_stage_label.toLowerCase().includes(s.label.toLowerCase())
              );
              setSelectedTargetStage(matched?.id || pipelineStages[0].id);
            }
          } catch (err: any) {
            console.error('Erro ao gerar plano via áudio:', err);
            alert('Falha ao processar áudio: ' + (err?.message || 'Tente gravar novamente.'));
          } finally {
            setIsGeneratingPlan(false);
          }
        };
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsAiRecording(true);
      setAiRecordingSeconds(0);
      aiTimerIntervalRef.current = setInterval(() => {
        setAiRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Erro ao abrir microfone:', err);
      alert('Permissão de microfone negada ou indisponível no navegador.');
    }
  };

  const stopAiAudioRecording = () => {
    if (aiMediaRecorderRef.current && isAiRecording) {
      aiMediaRecorderRef.current.stop();
      setIsAiRecording(false);
      if (aiTimerIntervalRef.current) {
        clearInterval(aiTimerIntervalRef.current);
      }
    }
  };

  const handleGeneratePlanFromText = async () => {
    if (!aiCardPrompt.trim()) return;
    try {
      setIsGeneratingPlan(true);
      const plan = await geminiService.generateFeaturePlanFromAudioOrText({
        textPrompt: aiCardPrompt,
        boardName: board?.name
      });
      setGeneratedPlan(plan);
      if (pipelineStages.length > 0) {
        const matched = pipelineStages.find(s => 
          s.label.toLowerCase().includes(plan.suggested_stage_label.toLowerCase()) ||
          plan.suggested_stage_label.toLowerCase().includes(s.label.toLowerCase())
        );
        setSelectedTargetStage(matched?.id || pipelineStages[0].id);
      }
    } catch (err: any) {
      console.error('Erro ao gerar plano via texto:', err);
      alert('Falha ao gerar plano: ' + (err?.message || 'Tente detalhar mais a ideia.'));
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleConfirmCreateAiCard = async () => {
    if (!generatedPlan || !boardId || !tenantId) return;
    try {
      setLoading(true);
      const targetStatus = selectedTargetStage || pipelineStages[0]?.id || 'backlog';
      const colLeads = leads.filter(l => l.status === targetStatus);
      let newPosition = 0;
      if (colLeads.length > 0) {
        newPosition = (colLeads[colLeads.length - 1].position || 0) + 1000;
      }

      const payload = {
        tenant_id: tenantId,
        board_id: boardId,
        title: generatedPlan.title,
        status: targetStatus,
        position: newPosition,
        estimated_revenue: 0,
        probability: 80,
        priority: generatedPlan.priority || 2,
        customer_id: null,
        agent_id: null,
        due_date: null,
        tags: Array.from(new Set([...(generatedPlan.tags || []), generatedPlan.category, 'IA-PLANO'])),
        notes: `${generatedPlan.summary}\n\n${generatedPlan.technical_plan}`
      };

      const { data, error } = await supabase
        .from('crm_leads')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      setLeads(prev => [...prev, data]);
      setIsAiCardModalOpen(false);
      setGeneratedPlan(null);
      setAiCardPrompt('');
    } catch (err: any) {
      console.error('Erro ao salvar card gerado por IA:', err);
      alert('Erro ao criar card: ' + (err?.message || 'Falha no banco'));
    } finally {
      setLoading(false);
    }
  };

  // Buscar dados do Quadro e Leads
  const fetchData = async () => {
    if (!boardId || !tenantId) return;
    try {
      setLoading(true);
      // 1. Quadro
      const { data: boardData, error: boardErr } = await supabase
        .from('crm_boards')
        .select('*')
        .eq('id', boardId)
        .single();

      if (boardErr) throw boardErr;
      setBoard(boardData);
      setEditBoardForm({
        name: boardData.name,
        description: boardData.config?.description || '',
        stages: boardData.config?.stages || []
      });

      // 2. Leads
      const { data: leadsData, error: leadsErr } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('board_id', boardId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: false });

      if (leadsErr) throw leadsErr;
      
      const formattedLeads = (leadsData || []).map(lead => ({
        ...lead,
        tags: Array.isArray(lead.tags) ? lead.tags : [],
        history: Array.isArray(lead.history) ? lead.history : []
      }));
      setLeads(formattedLeads);
    } catch (err) {
      console.error('Erro ao buscar dados do Kanban:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [boardId, tenantId]);

  // Colunas do Pipeline
  const pipelineStages = useMemo(() => {
    return board?.config?.stages || [];
  }, [board]);

  // Filtros aplicados
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      const matchSearch = l.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (l.notes && l.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.tags && l.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase())));
      const matchAgent = selectedAgentFilter === 'all' || l.agent_id === selectedAgentFilter;
      return matchSearch && matchAgent;
    });
  }, [leads, searchTerm, selectedAgentFilter]);

  // Agrupamento por colunas
  const groupedLeads = useMemo(() => {
    const groups: Record<string, CRMLead[]> = {};
    pipelineStages.forEach(stage => {
      groups[stage.id] = [];
    });
    filteredLeads.forEach(lead => {
      let finalStatus = lead.status;
      if (!groups[finalStatus] && pipelineStages.length > 0) {
        finalStatus = pipelineStages[0].id;
      }
      if (groups[finalStatus]) {
        groups[finalStatus].push(lead);
      }
    });
    return groups;
  }, [filteredLeads, pipelineStages]);

  // Drag and Drop Lógica
  // Drag and Drop Lógica
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [dragOverCardPosition, setDragOverCardPosition] = useState<'before' | 'after' | null>(null);

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('text/plain', leadId);
    setDraggedLeadId(leadId);
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      draggedOriginalStatusRef.current = lead.status;
    }
    droppedSuccessRef.current = false;

    // Cache static absolute Y positions of all cards to prevent animation jitter loops
    const positions: Record<string, { top: number; height: number; centerY: number; status: string }> = {};
    const cardElements = document.querySelectorAll('[data-card-id]');
    cardElements.forEach(el => {
      const cid = el.getAttribute('data-card-id');
      if (cid && cid !== leadId) {
        const leadObj = leads.find(l => l.id === cid);
        if (leadObj) {
          const rect = el.getBoundingClientRect();
          const top = rect.top + window.scrollY;
          positions[cid] = {
            top,
            height: rect.height,
            centerY: top + rect.height / 2,
            status: leadObj.status
          };
        }
      }
    });
    cardPositionsRef.current = positions;
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDraggingOverStage(stageId);

    const colCardPositions = Object.entries(cardPositionsRef.current)
      .map(([id, pos]) => ({ id, ...pos }))
      .filter(p => p.status === stageId)
      .sort((a, b) => a.top - b.top);

    if (colCardPositions.length === 0) {
      setDragOverCardId(null);
      setDragOverCardPosition(null);
      return;
    }

    const mouseY = e.pageY;
    let closestCardId: string | null = null;
    let closestPosition: 'before' | 'after' | null = null;
    let minDistance = Infinity;

    colCardPositions.forEach(c => {
      const distance = Math.abs(mouseY - c.centerY);
      if (distance < minDistance) {
        minDistance = distance;
        closestCardId = c.id;
        closestPosition = mouseY < c.centerY ? 'before' : 'after';
      }
    });

    setDragOverCardId(closestCardId);
    setDragOverCardPosition(closestPosition);
  };

  const handleCardDragOver = (e: React.DragEvent, cardId: string) => {
    e.preventDefault();
  };

  const handleDragEnd = () => {
    setDraggedLeadId(null);
    setDraggingOverStage(null);
    setDragOverCardId(null);
    setDragOverCardPosition(null);
    lastMoveRef.current = null;
  };

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    if (!leadId) return;

    const leadToUpdate = leads.find(l => l.id === leadId);
    if (!leadToUpdate) return;

    // Validação de Governança: Para migrar para Em Testes & QA, exige detalhamento técnico
    const isTargetTesting = targetStage === 'testing' || targetStage.toLowerCase().includes('teste') || targetStage.toLowerCase().includes('qa');
    if (isTargetTesting && !hasTechnicalExecutionDetails(leadToUpdate)) {
      setSelectedLead(leadToUpdate);
      setLeadDetailTab('technical');
      setIsEditingTechnical(true);
      setValidationAlertMessage(`⚠️ O preenchimento do Detalhamento da Execução Técnica é obrigatório antes de migrar o card "${leadToUpdate.title}" para a etapa "Em Testes & QA".`);
      setDraggedLeadId(null);
      setDraggingOverStage(null);
      return;
    }

    // Sinalizar sucesso de drop
    droppedSuccessRef.current = true;

    // Obter leads da coluna de destino (ordenados por posição)
    const targetColLeads = leads
      .filter(l => l.status === targetStage && l.id !== leadId)
      .sort((a, b) => {
        const posDiff = (a.position || 0) - (b.position || 0);
        if (posDiff !== 0) return posDiff;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });

    const updatedColLeads = [...targetColLeads];
    if (dragOverCardId) {
      const targetIndex = targetColLeads.findIndex(l => l.id === dragOverCardId);
      if (targetIndex !== -1) {
        if (dragOverCardPosition === 'before') {
          updatedColLeads.splice(targetIndex, 0, leadToUpdate);
        } else {
          updatedColLeads.splice(targetIndex + 1, 0, leadToUpdate);
        }
      } else {
        updatedColLeads.push(leadToUpdate);
      }
    } else {
      updatedColLeads.push(leadToUpdate);
    }

    const reindexedLeads = updatedColLeads.map((l, idx) => ({
      ...l,
      status: targetStage,
      position: idx * 1000
    }));

    const oldStatus = draggedOriginalStatusRef.current || targetStage;
    const historyEntry = {
      from: oldStatus,
      to: targetStage,
      by: localStorage.getItem('current_user_name') || 'Agente',
      at: new Date().toISOString()
    };
    
    const draggedLead = reindexedLeads.find(l => l.id === leadId);
    if (draggedLead) {
      draggedLead.history = [...leadToUpdate.history, historyEntry];
    }

    setLeads(prev => {
      const otherLeads = prev.filter(l => l.status !== targetStage && l.id !== leadId);
      return [...otherLeads, ...reindexedLeads].sort((a, b) => (a.position || 0) - (b.position || 0));
    });

    const updatePromises = reindexedLeads.map(l => {
      const updateData: any = {
        status: l.status,
        position: l.position
      };
      if (l.id === leadId) {
        updateData.history = l.history;
      }
      return supabase
        .from('crm_leads')
        .update(updateData)
        .eq('id', l.id);
    });

    const results = await Promise.all(updatePromises);
    const hasError = results.some(r => r.error);

    if (hasError) {
      console.error('Erro ao salvar reordenação no banco');
      fetchData();
    }

    setDraggedLeadId(null);
    setDraggingOverStage(null);
    setDragOverCardId(null);
    setDragOverCardPosition(null);
    lastMoveRef.current = null;
  };

  // Soma de faturamento por coluna
  const columnRevenues = useMemo(() => {
    const revenues: Record<string, number> = {};
    pipelineStages.forEach(stage => {
      revenues[stage.id] = 0;
    });
    leads.forEach(lead => {
      const status = lead.status;
      if (revenues[status] !== undefined) {
        revenues[status] += Number(lead.estimated_revenue || 0);
      }
    });
    return revenues;
  }, [leads, pipelineStages]);

  // Avançar lead na coluna seguinte
  const handleAdvanceLead = async (lead: CRMLead) => {
    const currentIndex = pipelineStages.findIndex(s => s.id === lead.status);
    if (currentIndex === -1 || currentIndex === pipelineStages.length - 1) return;
    const nextStage = pipelineStages[currentIndex + 1].id;

    // Validação de Governança: Para migrar para Em Testes & QA, exige detalhamento técnico
    const isTargetTesting = nextStage === 'testing' || nextStage.toLowerCase().includes('teste') || nextStage.toLowerCase().includes('qa');
    if (isTargetTesting && !hasTechnicalExecutionDetails(lead)) {
      setSelectedLead(lead);
      setLeadDetailTab('technical');
      setIsEditingTechnical(true);
      setValidationAlertMessage(`⚠️ O preenchimento do Detalhamento da Execução Técnica é obrigatório antes de avançar o card "${lead.title}" para a etapa "Em Testes & QA".`);
      return;
    }

    const nextColLeads = leads
      .filter(l => l.status === nextStage && l.id !== lead.id)
      .sort((a, b) => (a.position || 0) - (b.position || 0));

    let newPosition = 0;
    if (nextColLeads.length > 0) {
      newPosition = (nextColLeads[nextColLeads.length - 1].position || 0) + 1000;
    }

    const historyEntry = {
      from: lead.status,
      to: nextStage,
      by: localStorage.getItem('current_user_name') || 'Agente',
      at: new Date().toISOString()
    };
    const updatedHistory = [...lead.history, historyEntry];

    const updatedLead = { ...lead, status: nextStage, position: newPosition, history: updatedHistory };
    setLeads(prev => prev.map(l => l.id === lead.id ? updatedLead : l));

    const { error } = await supabase
      .from('crm_leads')
      .update({ 
        status: nextStage,
        position: newPosition,
        history: updatedHistory
      })
      .eq('id', lead.id);

    if (error) {
      console.error('Erro ao avançar lead:', error);
      fetchData();
    }
  };

  // Adicionar Lead
  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !boardId) return;

    try {
      const targetStatus = leadForm.status || pipelineStages[0]?.id || 'new';
      const colLeads = leads
        .filter(l => l.status === targetStatus)
        .sort((a, b) => (a.position || 0) - (b.position || 0));

      let newPosition = 0;
      if (colLeads.length > 0) {
        newPosition = (colLeads[colLeads.length - 1].position || 0) + 1000;
      }

      const payload = {
        tenant_id: tenantId,
        board_id: boardId,
        title: leadForm.title,
        status: targetStatus,
        position: newPosition,
        estimated_revenue: leadForm.estimated_revenue,
        probability: leadForm.probability,
        priority: leadForm.priority,
        customer_id: leadForm.customer_id || null,
        agent_id: leadForm.agent_id || null,
        due_date: leadForm.due_date || null,
        tags: leadForm.tagsString ? leadForm.tagsString.split(',').map(t => t.trim()).filter(Boolean) : []
      };

      const { data, error } = await supabase
        .from('crm_leads')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      setLeads(prev => [...prev, data].sort((a, b) => (a.position || 0) - (b.position || 0)));
      setIsAddLeadOpen(false);
      setLeadForm({
        title: '',
        status: '',
        estimated_revenue: 0,
        probability: 50,
        priority: 1,
        customer_id: '',
        agent_id: '',
        due_date: '',
        tagsString: ''
      });
    } catch (err) {
      console.error('Erro ao criar lead:', err);
    }
  };

  // Deletar Lead
  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Deseja realmente excluir este cartão?')) return;
    try {
      const { error } = await supabase
        .from('crm_leads')
        .delete()
        .eq('id', leadId);
      if (error) throw error;
      setLeads(prev => prev.filter(l => l.id !== leadId));
      setSelectedLead(null);
    } catch (err) {
      console.error('Erro ao deletar lead:', err);
    }
  };

  // Copiar/Duplicar Lead
  const handleCopyLead = async (lead: CRMLead) => {
    try {
      const { data, error } = await supabase
        .from('crm_leads')
        .insert([{
          tenant_id: lead.tenant_id,
          board_id: lead.board_id,
          title: `${lead.title} (Cópia)`,
          status: lead.status,
          estimated_revenue: lead.estimated_revenue,
          probability: lead.probability,
          priority: lead.priority,
          notes: lead.notes,
          customer_id: lead.customer_id || null,
          agent_id: lead.agent_id || null,
          due_date: lead.due_date || null,
          tags: lead.tags
        }])
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setLeads(prev => [...prev, data]);
      }
    } catch (err) {
      console.error('Erro ao copiar lead:', err);
    }
  };

  // Deletar Quadro CRM
  const handleDeleteBoard = async () => {
    if (!board) return;
    if (!confirm(`Deseja realmente excluir permanentemente o quadro "${board.name}" e todas as suas oportunidades? Esta ação não pode ser desfeita.`)) return;
    
    try {
      const { error } = await supabase
        .from('crm_boards')
        .delete()
        .eq('id', board.id);

      if (error) throw error;
      
      // Atualizar a lista de quadros na sidebar
      useChatStore.getState().fetchCrmBoards();
      
      // Navegar para o painel estratégico
      navigate('/crm');
    } catch (err: any) {
      alert('Erro ao excluir quadro: ' + err.message);
    }
  };

  // Salvar edições do Lead selecionado
  const handleSaveLeadEdits = async (updatedLead: CRMLead) => {
    try {
      const updatePayload: any = {
        title: updatedLead.title,
        status: updatedLead.status,
        estimated_revenue: updatedLead.estimated_revenue,
        probability: updatedLead.probability,
        priority: updatedLead.priority,
        notes: updatedLead.notes,
        customer_id: updatedLead.customer_id || null,
        agent_id: updatedLead.agent_id || null,
        due_date: updatedLead.due_date || null,
        tags: updatedLead.tags
      };

      if (updatedLead.history) {
        updatePayload.history = updatedLead.history;
      }

      const { error } = await supabase
        .from('crm_leads')
        .update(updatePayload)
        .eq('id', updatedLead.id);

      if (error) throw error;
      setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
      setSelectedLead(updatedLead);
    } catch (err) {
      console.error('Erro ao salvar edições do lead:', err);
    }
  };

  // Verifica se o lead possui detalhamento técnico de execução registrado
  const hasTechnicalExecutionDetails = (lead: CRMLead) => {
    const latestDelivery = lead.history?.slice().reverse().find(h => (h as any).delivery_report);
    if (latestDelivery) return true;
    if (lead.technical_execution_details && lead.technical_execution_details.trim().length > 0) return true;
    if (lead.notes && (
      lead.notes.includes('### 🚀 Registro de Entrega & Execução Técnica') ||
      lead.notes.includes('Registro de Entrega') ||
      lead.notes.includes('🛠️ Arquitetura')
    )) {
      return true;
    }
    return false;
  };

  // Salvar detalhamento da execução técnica
  const handleSaveTechnicalExecution = async (lead: CRMLead, summary: string, filesText: string, validationText: string, executorName?: string) => {
    try {
      const filesList = filesText.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
        const parts = line.split('->').map(p => p.trim());
        return {
          file: parts[0] || line,
          functions: parts[1] ? parts[1].split(',').map(f => f.trim()) : ['Implementação'],
          description: parts[2] || parts[0] || line
        };
      });

      const executor = executorName || localStorage.getItem('current_user_name') || 'Desenvolvedor / Antigravity AI';

      const deliveryReport = {
        title: lead.title,
        status: 'testing',
        summary: summary || 'Execução técnica e implementação concluídas.',
        executor,
        executed_at: new Date().toISOString(),
        validation: {
          status: 'Aprovado',
          type_checking: validationText || 'npx tsc --noEmit (0 erros)'
        },
        files_modified: filesList.length > 0 ? filesList : [
          {
            file: 'Código-Fonte do Projeto',
            functions: ['Execução'],
            description: summary
          }
        ]
      };

      const newHistoryItem = {
        at: new Date().toISOString(),
        by: executor,
        to: lead.status === 'development' ? 'testing' : lead.status,
        from: lead.status,
        delivery_report: deliveryReport
      };

      const deliverySection = `\n\n---\n### 🚀 Registro de Entrega & Execução Técnica\n**Data/Hora:** ${new Date().toLocaleString('pt-BR')}\n**Executor:** ${executor}\n**Status:** Validado e migrado para Homologação & QA\n\n${summary}`;
      const cleanNotes = (lead.notes || '').split('### 🚀 Registro de Entrega & Execução Técnica')[0].trim();
      const updatedNotes = cleanNotes ? `${cleanNotes}${deliverySection}` : deliverySection.trim();

      const updatedLead: CRMLead = {
        ...lead,
        notes: updatedNotes,
        technical_execution_details: summary,
        history: [...(lead.history || []), newHistoryItem]
      };

      await handleSaveLeadEdits(updatedLead);
      setIsEditingTechnical(false);
    } catch (err: any) {
      console.error('Erro ao salvar detalhamento técnico:', err);
    }
  };

  // IA: Qualificar Lead comercial usando Gemini
  const handleAIQualify = async () => {
    if (!selectedLead) return;
    try {
      setIsQualifying(true);

      // 1. Coleta mensagens do contato para o Gemini analisar
      let chatHistoryText = '';
      if (selectedLead.customer_id) {
        const { data: msgs } = await supabase
          .from('messages')
          .select('text_content, sender_type')
          .eq('contact_id', selectedLead.customer_id)
          .order('timestamp', { ascending: true })
          .limit(30);
        
        if (msgs && msgs.length > 0) {
          chatHistoryText = msgs.map(m => `${m.sender_type === 'client' ? 'Cliente' : 'Atendente'}: ${m.text_content}`).join('\n');
        }
      }

      if (!chatHistoryText) {
        chatHistoryText = 'Sem histórico de mensagens disponível. Analisando apenas com as notas atuais do Lead.';
      }

      // 2. Chama o Gemini
      const response = await geminiService.qualifyCrmLead(chatHistoryText, selectedLead.notes);

      // 3. Monta tags novas baseadas no retorno
      const extraTags = ['PRÉ-QUALIFICADO IA'];
      if (response.mainInterest) extraTags.push(response.mainInterest.toUpperCase());
      if (response.businessType) extraTags.push(response.businessType.toUpperCase());
      const newTags = Array.from(new Set([...selectedLead.tags, ...extraTags]));

      // 4. Determina se avança
      let nextStatus = selectedLead.status;
      if (selectedLead.status === 'new' && pipelineStages.some(s => s.id === 'qualified')) {
        nextStatus = 'qualified';
      }

      const updatedLead: CRMLead = {
        ...selectedLead,
        title: response.customerName || selectedLead.title,
        notes: response.summaryHTML || selectedLead.notes,
        priority: response.priority || selectedLead.priority,
        status: nextStatus,
        tags: newTags
      };

      // 5. Grava
      await handleSaveLeadEdits(updatedLead);
    } catch (err: any) {
      alert(err.message || 'Falha ao qualificar lead com Inteligência Artificial.');
    } finally {
      setIsQualifying(false);
    }
  };

  // Salvar modificações do Quadro
  const handleUpdateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!board || !tenantId) return;

    try {
      const updatedConfig = {
        ...board.config,
        description: editBoardForm.description,
        stages: editBoardForm.stages
      };

      const { error } = await supabase
        .from('crm_boards')
        .update({
          name: editBoardForm.name,
          config: updatedConfig
        })
        .eq('id', board.id);

      if (error) throw error;
      setBoard({
        ...board,
        name: editBoardForm.name,
        config: updatedConfig
      });
      setIsEditBoardOpen(false);
      useChatStore.getState().fetchCrmBoards(); // atualizar sidebar
    } catch (err) {
      console.error('Erro ao atualizar configurações do quadro:', err);
    }
  };

  // Adicionar coluna ao formulário de edição do quadro
  const handleAddStageToForm = () => {
    const newId = `stage_${Date.now()}`;
    setEditBoardForm(prev => ({
      ...prev,
      stages: [...prev.stages, { id: newId, label: 'Nova Coluna', subtitle: 'Ação comercial', color: 'bg-blue-500' }]
    }));
  };

  // Remover coluna no formulário do quadro
  const handleRemoveStageFromForm = (id: string) => {
    setEditBoardForm(prev => ({
      ...prev,
      stages: prev.stages.filter(s => s.id !== id)
    }));
  };

  if (loading && !board) {
    return (
      <div className="flex items-center justify-center h-full bg-[#f0f2f5] dark:bg-[#0c1317]">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin text-amber-500 mx-auto" size={40} />
          <p className="text-gray-500 text-sm">Carregando painel Kanban...</p>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#f0f2f5] dark:bg-[#0c1317] p-6 text-center">
        <AlertTriangle className="text-amber-500 mb-4" size={48} />
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">Quadro Kanban não encontrado</h2>
        <p className="text-gray-500 text-sm mt-2 max-w-md">O painel Kanban que você tentou acessar não existe ou pertence a outra empresa.</p>
        <button onClick={() => navigate('/crm')} className="mt-6 px-5 py-2.5 bg-amber-500 text-white rounded-xl font-bold shadow-md hover:bg-amber-600 transition-colors">
          Voltar para o Painel Estratégico
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0c1317] overflow-hidden">
      
      {/* Cabeçalho Kanban SaaS Premium (Estilo Linear / Notion / Vercel) */}
      <header className="shrink-0 flex flex-col gap-3.5 px-6 lg:px-8 py-4.5 border-b border-slate-200/60 dark:border-white/10 bg-white/70 dark:bg-[#0c1317]/80 backdrop-blur-2xl select-none z-10 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        {/* Linha 1: Identidade do Quadro & Botões Principais de Criação */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0 ring-4 ring-indigo-500/10">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div className="text-left min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base lg:text-lg font-black tracking-tight text-slate-900 dark:text-white font-sans truncate">
                  {board.name}
                </h1>
                <span className="text-[9px] px-2.5 py-0.5 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 dark:from-purple-500/20 dark:to-indigo-500/20 text-purple-600 dark:text-purple-300 font-black uppercase rounded-lg border border-purple-500/20 tracking-wider flex items-center gap-1">
                  <Layers size={10} />
                  Kanban
                </span>
                <span className="text-[9px] px-2 py-0.5 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 font-bold rounded-lg border border-slate-200/60 dark:border-white/5">
                  {leads.length} {leads.length === 1 ? 'cartão' : 'cartões'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans font-medium mt-0.5 truncate max-w-2xl">
                {board.config?.description || 'Arraste e solte cartões para gerenciar tarefas e avançar fluxos'}
              </p>
            </div>
          </div>

          {/* Botões de Ação Primária em Destaque */}
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
            <button 
              onClick={() => {
                setGeneratedPlan(null);
                setAiCardPrompt('');
                setSelectedTargetStage(pipelineStages[0]?.id || '');
                setIsAiCardModalOpen(true);
              }}
              className="flex items-center gap-2 px-4.5 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-200 hover:scale-[1.02] active:scale-95 cursor-pointer ring-2 ring-white/10"
            >
              <Mic size={14} className="text-amber-300 animate-pulse" />
              <span>Criar com Áudio & IA</span>
              <Sparkles size={13} className="text-amber-300" />
            </button>

            <button 
              onClick={() => {
                setLeadForm(prev => ({ ...prev, status: pipelineStages[0]?.id || '' }));
                setIsAddLeadOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-black shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <Plus size={14} strokeWidth={2.5} />
              Novo Cartão
            </button>
          </div>
        </div>

        {/* Linha 2: Barra de Ferramentas (Busca, Filtros, Configurações do Quadro) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            {/* Busca */}
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={13} />
              <input 
                type="text" 
                placeholder="Pesquisar cartão..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8.5 pr-4 py-1.5 w-full sm:w-[210px] bg-slate-100/80 dark:bg-[#182229]/60 border border-slate-200/60 dark:border-white/10 rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-slate-800 dark:text-slate-200 transition-all duration-200"
              />
            </div>

            {/* Filtro de Agente */}
            <div className="relative cursor-pointer select-none">
              <select 
                value={selectedAgentFilter}
                onChange={e => setSelectedAgentFilter(e.target.value)}
                className="px-3 pr-7 py-1.5 bg-slate-100/80 dark:bg-[#182229]/60 border border-slate-200/60 dark:border-white/10 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 text-slate-700 dark:text-slate-300 cursor-pointer appearance-none"
              >
                <option value="all">👥 Todos os Agentes</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>👤 {a.full_name?.split(' ')[0] || a.email}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ações de Gestão do Quadro */}
          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
            <button 
              onClick={() => setIsCreatorOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100/80 dark:bg-[#182229]/60 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200/60 dark:border-white/10 rounded-xl text-xs font-bold transition-all hover:bg-slate-200/60 dark:hover:bg-white/10 active:scale-95 cursor-pointer"
            >
              <Plus size={12} strokeWidth={2.5} />
              Novo Quadro
            </button>
            <button 
              onClick={() => setIsEditBoardOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100/80 dark:bg-[#182229]/60 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200/60 dark:border-white/10 rounded-xl text-xs font-bold transition-all hover:bg-slate-200/60 dark:hover:bg-white/10 active:scale-95 cursor-pointer"
            >
              <Settings size={12} />
              Configurar
            </button>
            <button 
              onClick={handleDeleteBoard}
              className="flex items-center gap-1 px-2.5 py-1.5 text-rose-500/80 hover:text-rose-600 dark:text-rose-400/80 dark:hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
              title="Excluir este quadro permanentemente"
            >
              <Trash2 size={12} />
              Excluir
            </button>
          </div>
        </div>
      </header>

      {/* Kanban Board Container (Scrollable Horizontalmente) */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-6 select-none custom-scrollbar">
        {pipelineStages.map(stage => {
          const colLeads = groupedLeads[stage.id] || [];
          const colRevenue = columnRevenues[stage.id] || 0;
          const isOver = draggingOverStage === stage.id;
          const isCollapsed = collapsedStages[stage.id];
          const colors = getColorClasses(stage.color || 'bg-indigo-500');

          if (isCollapsed) {
            return (
              <div 
                key={stage.id}
                onClick={() => setCollapsedStages(prev => ({ ...prev, [stage.id]: false }))}
                className={cn(
                  "w-[64px] shrink-0 flex flex-col h-full bg-slate-100/40 dark:bg-[#182229]/20 backdrop-blur-md rounded-[28px] border border-slate-200/50 dark:border-white/5 overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-md select-none"
                )}
              >
                <div className={cn("flex-1 flex flex-col items-center justify-between py-6 h-full relative border-t-4", colors.borderTop)}>
                  <div className="flex flex-col items-center gap-4">
                    <ChevronRight size={14} strokeWidth={3} className={colors.text} />
                    <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-lg border", colors.badge)}>
                      {colLeads.length}
                    </span>
                  </div>
                  
                  <div className={cn("rotate-90 origin-center whitespace-nowrap text-[10px] font-black uppercase tracking-wider py-4 my-auto select-none", colors.text)}>
                    {stage.label}
                  </div>
                  
                  <div className="text-[8px] tracking-widest font-black text-slate-400 dark:text-slate-500">
                    EXPANDIR
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div 
              key={stage.id}
              onDragOver={e => handleDragOver(e, stage.id)}
              onDragEnter={e => e.preventDefault()}
              onDrop={e => handleDrop(e, stage.id)}
              className={cn(
                "w-[300px] shrink-0 flex flex-col h-full bg-slate-100/70 dark:bg-[#182229]/40 backdrop-blur-xl rounded-[28px] border border-slate-200/60 dark:border-white/10 overflow-hidden transition-all duration-300 shadow-sm",
                isOver && "border-indigo-500/50 dark:border-indigo-500/40 bg-indigo-500/[0.02] dark:bg-indigo-500/[0.04]"
              )}
            >
              {/* Cabeçalho da Coluna - Minimalist Premium */}
              <div 
                className={cn(
                  "p-4 flex items-center justify-between shrink-0 select-none border-b border-slate-200/50 dark:border-white/5 transition-all relative border-t-4",
                  colors.borderTop
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={cn("w-2.5 h-2.5 rounded-full shrink-0 shadow-sm ring-2 ring-white/20", stage.color || "bg-indigo-500")} />
                  <div className="min-w-0 text-left">
                    <h3 className="text-xs font-black truncate font-sans tracking-wide leading-tight flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                      {stage.label}
                      <span className={cn("px-2 py-0.5 rounded-lg text-[9px] font-black shrink-0", colors.badge)}>
                        {colLeads.length}
                      </span>
                    </h3>
                    {stage.subtitle && (
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 truncate leading-tight mt-0.5 font-bold uppercase tracking-wide">
                        {stage.subtitle}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Ações da Coluna */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsedStages(prev => ({ ...prev, [stage.id]: true }));
                    }}
                    className="p-1 hover:bg-slate-200/60 dark:hover:bg-white/5 rounded-md text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                    title="Dobrar Coluna"
                  >
                    <ChevronLeft size={12} strokeWidth={2.5} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditBoardForm({
                        name: board.name,
                        description: board.config?.description || '',
                        stages: pipelineStages
                      });
                      setIsEditBoardOpen(true);
                    }}
                    className="p-1 hover:bg-slate-200/60 dark:hover:bg-white/5 rounded-md text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                    title="Editar Etapa"
                  >
                    <Sliders size={12} strokeWidth={2.5} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setLeadForm(prev => ({ ...prev, status: stage.id }));
                      setIsAddLeadOpen(true);
                    }}
                    className="p-1 hover:bg-slate-200/60 dark:hover:bg-white/5 rounded-md text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                    title="Criar Oportunidade"
                  >
                    <Plus size={12} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {/* Lista de Cartões */}
              <div 
                onDragOver={e => handleDragOver(e, stage.id)}
                onDragEnter={e => e.preventDefault()}
                onDrop={e => handleDrop(e, stage.id)}
                className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar flex flex-col"
              >
                {(() => {
                  const itemsToRender: React.ReactNode[] = [];
                  let placeholderRendered = false;
                  const isDraggingOverThisStage = draggingOverStage === stage.id;

                  colLeads.forEach(lead => {
                    if (isDraggingOverThisStage && dragOverCardId === lead.id && dragOverCardPosition === 'before') {
                      placeholderRendered = true;
                      itemsToRender.push(
                        <motion.div 
                          layout
                          key="dnd-placeholder" 
                          data-placeholder="true"
                          className="border-2 border-dashed border-indigo-550/40 dark:border-indigo-400/30 bg-indigo-50/10 dark:bg-indigo-950/5 h-[110px] rounded-2xl animate-pulse transition-all duration-200" 
                        />
                      );
                    }

                    const clientContact = contacts.find(c => c.id === lead.customer_id);
                    const agentObj = agents.find(a => a.id === lead.agent_id);
                    const isBeingDragged = draggedLeadId === lead.id;

                    const priorityBorder = lead.priority === 3 
                      ? "border-l-[3.5px] border-l-rose-500" 
                      : lead.priority === 2 
                        ? "border-l-[3.5px] border-l-amber-500" 
                        : "border-l-[3.5px] border-l-indigo-500/20 dark:border-l-indigo-500/10";

                    itemsToRender.push(
                      <motion.div 
                        layout
                        key={lead.id}
                        className="w-full shrink-0 animate-in fade-in duration-200"
                      >
                        <div 
                          draggable="true"
                          data-card-id={lead.id}
                          onDragStart={e => handleDragStart(e, lead.id)}
                          onDragEnd={handleDragEnd}
                          onDragOver={e => handleCardDragOver(e, lead.id)}
                          onClick={() => setSelectedLead(lead)}
                          className={cn(
                            "group/card bg-white/90 dark:bg-[#111b21]/80 backdrop-blur-md p-4.5 rounded-2xl border border-slate-200/60 dark:border-white/5 shadow-sm hover:shadow-[0_12px_24px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_12px_24px_rgba(0,0,0,0.3)] hover:border-slate-300 dark:hover:border-indigo-500/30 hover:-translate-y-0.5 transition-all duration-300 cursor-grab active:cursor-grabbing relative overflow-hidden",
                            priorityBorder,
                            isBeingDragged && "border-2 border-dashed border-indigo-500/40 dark:border-indigo-400/30 bg-indigo-50/40 dark:bg-indigo-950/20 opacity-40 shadow-inner rotate-[1.5deg] scale-[0.98]"
                          )}
                        >
                          {/* Hover Action Toolbar */}
                          <div className="opacity-0 group-hover/card:opacity-100 transition-all absolute top-2.5 right-2.5 flex bg-slate-900/90 dark:bg-black/90 backdrop-blur-md px-2 py-1.5 rounded-xl gap-2.5 z-10 text-white shadow-lg border border-white/10 scale-90 group-hover/card:scale-100 duration-200 ease-out">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLead(lead.id);
                              }}
                              className="p-1 hover:text-red-400 transition-colors cursor-pointer"
                              title="Excluir Oportunidade"
                            >
                              <Trash2 size={12} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyLead(lead);
                              }}
                              className="p-1 hover:text-indigo-400 transition-colors cursor-pointer"
                              title="Copiar Oportunidade"
                            >
                              <Copy size={12} />
                            </button>
                            {clientContact && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  useChatStore.getState().setActiveChat(clientContact.id);
                                  navigate('/chat');
                                }}
                                className="p-1 hover:text-emerald-400 transition-colors cursor-pointer"
                                title="Abrir Chat"
                              >
                                <MessageSquare size={12} />
                              </button>
                            )}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLead(lead);
                              }}
                              className="p-1 hover:text-amber-400 transition-colors cursor-pointer"
                              title="Editar"
                            >
                              <Edit2 size={12} />
                            </button>
                          </div>

                          {/* Header do Cartão: Prazo de Vencimento/Criação */}
                          <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-slate-500 text-[9px] rounded-lg border border-slate-200/20 dark:border-white/[0.02] font-bold">
                              <Clock size={10} />
                              <span>{lead.created_at ? format(new Date(lead.created_at), 'dd/MM/yy • HH:mm') : '--/--/--'}</span>
                            </div>
                          </div>

                          {/* Corpo do Cartão: Avatar + Info */}
                          <div className="flex gap-3 items-start pl-0.5">
                            {/* Avatar do Cliente */}
                            <div className="relative shrink-0 select-none">
                              {clientContact?.profile_picture_url ? (
                                <img 
                                  src={clientContact.profile_picture_url} 
                                  alt={lead.title}
                                  className="w-8 h-8 rounded-xl object-cover border border-slate-200/20 dark:border-white/5"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-black uppercase flex items-center justify-center border border-indigo-500/15">
                                  {lead.title.split(' ').map(n => n[0]).slice(0, 2).join('') || 'C'}
                                </div>
                              )}
                              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#00a884] border-2 border-white dark:border-[#111b21] flex items-center justify-center shadow-sm">
                                <svg viewBox="0 0 24 24" className="w-2 h-2 text-white fill-current">
                                  <path d="M12.012 2C6.48 2 2 6.48 2 12.012c0 1.767.46 3.427 1.264 4.887L2 22l5.244-1.378a9.96 9.96 0 004.768 1.205C17.52 21.827 22 17.348 22 11.816 22 6.48 17.52 2 12.012 2zm5.727 14.152c-.244.69-1.42 1.264-1.94 1.31-.444.04-1.012.064-2.825-.69-2.31-.96-3.8-3.32-3.916-3.48-.117-.16-.94-1.258-.94-2.4 0-1.144.597-1.706.812-1.942.215-.236.467-.294.622-.294.156 0 .313 0 .445.006.14.006.33.006.505.428.182.434.622 1.517.676 1.63.053.112.09.243.013.397-.076.155-.117.25-.235.39-.117.14-.244.31-.35.42-.116.12-.238.25-.102.484.137.234.61 1.008 1.31 1.63.9.799 1.656 1.047 1.89 1.164.234.118.39.176.446.275.059.098.059.569-.185 1.259z" />
                                </svg>
                              </span>
                            </div>

                            {/* Título & Detalhes */}
                            <div className="flex-1 min-w-0 text-left">
                              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug line-clamp-2">
                                {lead.title}
                              </h4>
                              
                              {/* Priority e Probability */}
                              <div className="flex items-center gap-3 mt-2">
                                <div className="flex shrink-0">
                                  {Array.from({ length: 3 }).map((_, i) => (
                                    <Star 
                                      key={i} 
                                      size={10} 
                                      className={cn(
                                        "shrink-0",
                                        i < lead.priority 
                                          ? "fill-amber-400 text-amber-400" 
                                          : "text-slate-200 dark:text-slate-800"
                                      )} 
                                    />
                                  ))}
                                </div>

                                {board.config?.features?.probability && (
                                  <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8px]">
                                    📈 {lead.probability}% PROB.
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Informações de Faturamento (se houver valor) */}
                          {Number(lead.estimated_revenue || 0) > 0 && (
                            <div className="flex items-center justify-between mt-3 pl-1 text-[10px]">
                              <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8px]">
                                Faturamento
                              </span>
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black text-[10px] rounded-lg border border-emerald-500/15 shrink-0">
                                R$ {Number(lead.estimated_revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          )}

                          {/* Tags */}
                          {lead.tags && lead.tags.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap mt-3 pl-1">
                              {lead.tags.map((t, idx) => (
                                <span 
                                  key={idx} 
                                  className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/15 text-[8.5px] font-black uppercase rounded-md tracking-wide"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Footer do Cartão: Agente & Prazo */}
                          <div className="mt-3.5 pt-2.5 border-t border-slate-200/50 dark:border-white/5 flex items-center justify-between pl-1">
                            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-[9px] font-bold">
                              <Calendar size={11} />
                              <span>{lead.due_date ? format(new Date(lead.due_date), 'dd/MM/yyyy') : 'Sem prazo'}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              {agentObj && (
                                <span 
                                  className="w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-500 to-indigo-600 text-white text-[9px] font-black uppercase flex items-center justify-center border border-white dark:border-[#111b21] shadow-md shadow-indigo-500/10"
                                  title={`Responsável: ${agentObj.full_name || agentObj.email}`}
                                >
                                  {agentObj.full_name?.split(' ').map(n => n[0]).slice(0, 2).join('') || 'AG'}
                                </span>
                              )}

                              {pipelineStages.findIndex(s => s.id === lead.status) < pipelineStages.length - 1 && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAdvanceLead(lead);
                                  }}
                                  className="text-[9.5px] font-black uppercase text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-0.5 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                                >
                                  Avançar <ChevronRight size={10} strokeWidth={3} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );

                    if (isDraggingOverThisStage && dragOverCardId === lead.id && dragOverCardPosition === 'after') {
                      placeholderRendered = true;
                      itemsToRender.push(
                        <motion.div 
                          layout
                          key="dnd-placeholder" 
                          data-placeholder="true"
                          className="border-2 border-dashed border-indigo-550/40 dark:border-indigo-400/30 bg-indigo-50/10 dark:bg-indigo-950/5 h-[110px] rounded-2xl animate-pulse transition-all duration-200" 
                        />
                      );
                    }
                  });

                  // Empty State Ilustrado quando a coluna não tiver cartões
                  if (colLeads.length === 0 && !placeholderRendered && !isDraggingOverThisStage) {
                    itemsToRender.push(
                      <div 
                        key="empty-state" 
                        onClick={() => {
                          setLeadForm(prev => ({ ...prev, status: stage.id }));
                          setIsAddLeadOpen(true);
                        }}
                        className="my-auto py-8 px-4 border-2 border-dashed border-slate-200/80 dark:border-white/10 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer hover:border-indigo-500/40 hover:bg-indigo-500/[0.02] dark:hover:bg-indigo-500/[0.04] transition-all group/empty"
                      >
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover/empty:scale-110 group-hover/empty:text-indigo-500 transition-all mb-2">
                          <Layers size={18} />
                        </div>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Nenhum item nesta etapa
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                          Arraste ou clique para criar
                        </p>
                        <span className="mt-3 inline-flex items-center gap-1 text-[9px] font-black uppercase text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20 group-hover/empty:bg-indigo-500 group-hover/empty:text-white transition-all">
                          <Plus size={10} strokeWidth={3} />
                          Criar Cartão
                        </span>
                      </div>
                    );
                  }

                  if (isDraggingOverThisStage && !placeholderRendered) {
                    itemsToRender.push(
                      <motion.div 
                        layout
                        key="dnd-placeholder" 
                        data-placeholder="true"
                        className="border-2 border-dashed border-indigo-550/40 dark:border-indigo-400/30 bg-indigo-50/10 dark:bg-indigo-950/5 h-[110px] rounded-2xl animate-pulse transition-all duration-200" 
                      />
                    );
                  }

                  return itemsToRender;
                })()}
              </div>

              {/* Rodapé da Coluna Inteligente */}
              <div className="p-3.5 border-t border-slate-200/40 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01] shrink-0 flex items-center justify-between text-[10px]">
                <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8.5px]">
                  {colRevenue > 0 ? 'Total Estimado' : 'Total de Itens'}
                </span>
                {colRevenue > 0 ? (
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black rounded-lg border border-emerald-500/20">
                    R$ {colRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                ) : (
                  <span className="font-extrabold text-slate-600 dark:text-slate-400 text-[10px]">
                    {colLeads.length} {colLeads.length === 1 ? 'item' : 'itens'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL: Adicionar Oportunidade */}
      {isAddLeadOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111b21] w-full max-w-md rounded-[28px] border border-slate-200/50 dark:border-white/5 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
                  <Plus size={18} />
                </div>
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 font-sans uppercase tracking-wider">Nova Oportunidade</h3>
              </div>
              <button 
                onClick={() => setIsAddLeadOpen(false)} 
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs text-left">
                <div className="space-y-1">
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Título da Oportunidade *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ex: Nome da Empresa ou Cliente"
                    value={leadForm.title}
                    onChange={e => setLeadForm({ ...leadForm, title: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-[#202c33]/40 border border-slate-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-800 dark:text-slate-200 transition-all duration-300"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Faturamento Estimado</label>
                    <input 
                      type="number" 
                      placeholder="R$ 0,00"
                      value={leadForm.estimated_revenue || ''}
                      onChange={e => setLeadForm({ ...leadForm, estimated_revenue: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-[#202c33]/40 border border-slate-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10 text-slate-800 dark:text-slate-200 transition-all duration-300"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Probabilidade (%)</label>
                    <input 
                      type="number" 
                      min="0" 
                      max="100"
                      placeholder="50%"
                      value={leadForm.probability}
                      onChange={e => setLeadForm({ ...leadForm, probability: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-[#202c33]/40 border border-slate-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10 text-slate-800 dark:text-slate-200 transition-all duration-300"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Estágio Inicial</label>
                    <select 
                      value={leadForm.status}
                      onChange={e => setLeadForm({ ...leadForm, status: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-[#202c33]/40 border border-slate-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-800 dark:text-slate-200 cursor-pointer appearance-none"
                    >
                      {pipelineStages.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Prioridade (Estrelas)</label>
                    <select 
                      value={leadForm.priority}
                      onChange={e => setLeadForm({ ...leadForm, priority: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-[#202c33]/40 border border-slate-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-855 dark:text-slate-200 cursor-pointer appearance-none"
                    >
                      <option value="1">⭐ Baixa</option>
                      <option value="2">⭐⭐ Média</option>
                      <option value="3">⭐⭐⭐ Alta</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Vincular Contato do WhatsApp</label>
                  <select 
                    value={leadForm.customer_id}
                    onChange={e => setLeadForm({ ...leadForm, customer_id: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-[#202c33]/40 border border-slate-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-855 dark:text-slate-200 cursor-pointer appearance-none"
                  >
                    <option value="">Nenhum contato</option>
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>{c.custom_name || c.name} ({c.phone})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Responsável (Agente)</label>
                    <select 
                      value={leadForm.agent_id}
                      onChange={e => setLeadForm({ ...leadForm, agent_id: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-[#202c33]/40 border border-slate-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-855 dark:text-slate-200 cursor-pointer appearance-none"
                    >
                      <option value="">Ninguém</option>
                      {agents.map(a => (
                        <option key={a.id} value={a.id}>{a.full_name || a.email}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Data de Vencimento</label>
                    <input 
                      type="date" 
                      value={leadForm.due_date}
                      onChange={e => setLeadForm({ ...leadForm, due_date: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-[#202c33]/40 border border-slate-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-800 dark:text-slate-200 transition-all duration-300"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Tags (Separadas por vírgula)</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Totem, Sistema, Gastronomia"
                    value={leadForm.tagsString}
                    onChange={e => setLeadForm({ ...leadForm, tagsString: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-[#202c33]/40 border border-slate-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-800 dark:text-slate-200 transition-all duration-300"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-200/20 dark:border-white/5 bg-slate-50/50 dark:bg-black/10 shrink-0 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAddLeadOpen(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 rounded-xl font-bold transition-all duration-200 active:scale-95 cursor-pointer text-xs"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/25 transition-all duration-200 active:scale-95 cursor-pointer text-xs"
                >
                  Salvar Oportunidade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Detalhes do Cartão / Oportunidade Modernizado */}
      {selectedLead && (() => {
        // Extrair informações de entrega técnica da IA
        const latestDeliveryHistory = selectedLead.history?.slice().reverse().find(h => (h as any).delivery_report);
        const deliveryReport = (latestDeliveryHistory as any)?.delivery_report || null;
        const currentStageObj = pipelineStages.find(s => s.id === selectedLead.status);
        const hasDeliveryInfo = !!deliveryReport || (selectedLead.notes && selectedLead.notes.includes('### 🚀 Registro de Entrega & Execução Técnica'));

        const handleCopyDeliveryText = () => {
          let textToCopy = '';
          if (deliveryReport) {
            textToCopy = `📦 RELATÓRIO DE ENTREGA TÉCNICA (IA DEV)\n📅 Data/Hora: ${deliveryReport.executed_at ? format(new Date(deliveryReport.executed_at), 'dd/MM/yyyy HH:mm:ss') : new Date().toLocaleString('pt-BR')}\n🤖 Executor: ${deliveryReport.executor || 'Antigravity AI (Fila Dev)'}\n🧪 Status: Em Testes & QA\n\n📝 Resumo:\n${deliveryReport.summary || ''}\n\n🛠️ Arquivos & Funções Modificadas:\n${(deliveryReport.files_modified || []).map((f: any) => `• ${f.file}\n  Funções: ${(f.functions || []).join(', ')}\n  Detalhes: ${f.description || ''}`).join('\n\n')}\n\n🔍 Validação:\n• TypeScript: npx tsc --noEmit (0 erros)`;
          } else if (selectedLead.notes && selectedLead.notes.includes('### 🚀 Registro de Entrega & Execução Técnica')) {
            const parts = selectedLead.notes.split('### 🚀 Registro de Entrega & Execução Técnica');
            textToCopy = `### 🚀 Registro de Entrega & Execução Técnica\n` + parts[1].trim();
          } else {
            textToCopy = `Card: ${selectedLead.title}\nStatus: ${currentStageObj?.label || selectedLead.status}\nNotas:\n${selectedLead.notes || 'Sem notas'}`;
          }

          navigator.clipboard.writeText(textToCopy);
          setCopiedDelivery(true);
          setTimeout(() => setCopiedDelivery(false), 2500);
        };

        return (
          <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/85 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all duration-300">
            <div className="bg-white dark:bg-[#111b21] w-full max-w-3xl rounded-t-[32px] sm:rounded-[28px] border border-slate-200/80 dark:border-white/10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh] sm:max-h-[88vh]">
              
              {/* Top Banner com Gradiente e Identificação do Estágio */}
              <div className="px-6 pt-5 pb-4 border-b border-slate-200/50 dark:border-white/5 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-black/20">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center shadow-md shrink-0",
                    selectedLead.status === 'testing'
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      : selectedLead.status === 'development'
                        ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                        : selectedLead.status === 'analysis'
                          ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  )}>
                    {selectedLead.status === 'testing' ? (
                      <Cpu size={20} className="animate-pulse" />
                    ) : selectedLead.status === 'development' ? (
                      <Wand2 size={20} />
                    ) : (
                      <FileText size={20} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                        currentStageObj ? getColorClasses(currentStageObj.color).badge : "bg-slate-100 text-slate-600 border-slate-200"
                      )}>
                        {currentStageObj?.label || selectedLead.status}
                      </span>
                      {hasDeliveryInfo && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 size={10} />
                          IA Entregue
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                      {selectedLead.title}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button 
                    onClick={() => handleCopyLead(selectedLead)}
                    className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-white/5 rounded-xl transition-all cursor-pointer"
                    title="Duplicar Card"
                  >
                    <Copy size={16} />
                  </button>
                  <button 
                    onClick={() => handleDeleteLead(selectedLead.id)}
                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                    title="Excluir Oportunidade"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button 
                    onClick={() => setSelectedLead(null)} 
                    className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all cursor-pointer"
                    title="Fechar"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Segmented Controls / Abas de Navegação */}
              <div className="px-6 pt-3 pb-2 border-b border-slate-200/40 dark:border-white/5 flex items-center gap-1.5 overflow-x-auto custom-scrollbar bg-slate-50/30 dark:bg-black/10">
                <button
                  type="button"
                  onClick={() => setLeadDetailTab('overview')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center gap-1.5 shrink-0 cursor-pointer",
                    leadDetailTab === 'overview'
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  <Sliders size={13} />
                  Geral & Comercial
                </button>

                <button
                  type="button"
                  onClick={() => setLeadDetailTab('technical')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center gap-1.5 shrink-0 cursor-pointer relative",
                    leadDetailTab === 'technical'
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  <Cpu size={13} />
                  Execução & Entrega IA
                  {hasDeliveryInfo && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setLeadDetailTab('notes')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center gap-1.5 shrink-0 cursor-pointer",
                    leadDetailTab === 'notes'
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  <FileText size={13} />
                  Notas & Briefing
                </button>

                <button
                  type="button"
                  onClick={() => setLeadDetailTab('history')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center gap-1.5 shrink-0 cursor-pointer",
                    leadDetailTab === 'history'
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  <History size={13} />
                  Histórico ({selectedLead.history?.length || 0})
                </button>
              </div>

              {/* Conteúdo da Aba Ativa */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs text-left bg-white dark:bg-[#111b21]">
                
                {/* ABA 1: GERAL & COMERCIAL */}
                {leadDetailTab === 'overview' && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    {/* Título & Faturamento */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Nome / Título do Lead</label>
                        <input 
                          type="text" 
                          value={selectedLead.title}
                          onChange={e => handleSaveLeadEdits({ ...selectedLead, title: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Faturamento Estimado (R$)</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">R$</span>
                          <input 
                            type="number" 
                            value={selectedLead.estimated_revenue}
                            onChange={e => handleSaveLeadEdits({ ...selectedLead, estimated_revenue: Number(e.target.value) })}
                            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {/* IA Qualificador Gemini */}
                    {board.config?.features?.aiSummary && (
                      <div className="p-4.5 bg-gradient-to-br from-indigo-500/[0.06] via-indigo-500/[0.02] to-purple-500/[0.05] border border-indigo-500/20 dark:border-indigo-500/15 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                        <div className="space-y-1">
                          <h4 className="font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 font-sans uppercase tracking-wider text-[10.5px]">
                            <Sparkles size={14} className="animate-pulse text-amber-500" />
                            Qualificação Automática por IA (Gemini)
                          </h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            O Gemini analisa o histórico de conversas do cliente e calcula probabilidade de fechamento, prioridade e resumo executivo.
                          </p>
                        </div>
                        <button 
                          type="button"
                          disabled={isQualifying}
                          onClick={handleAIQualify}
                          className="px-4.5 py-2.5 bg-gradient-to-tr from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl font-bold shadow-md shadow-indigo-500/20 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-xs flex items-center gap-1.5 shrink-0 self-start md:self-auto"
                        >
                          {isQualifying ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              Analisando...
                            </>
                          ) : (
                            <>
                              <Sparkles size={13} />
                              Qualificar com IA
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Status, Prioridade e Probabilidade */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Coluna / Estágio</label>
                        <select 
                          value={selectedLead.status}
                          onChange={e => handleSaveLeadEdits({ ...selectedLead, status: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white cursor-pointer"
                        >
                          {pipelineStages.map(s => (
                            <option key={s.id} value={s.id} className="dark:bg-[#111b21]">{s.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Prioridade</label>
                        <div className="flex items-center gap-2 h-[42px] px-3 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/80 dark:border-white/10 rounded-xl">
                          {[1, 2, 3].map(p => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => handleSaveLeadEdits({ ...selectedLead, priority: p })}
                              className={cn(
                                "flex-1 py-1 rounded-lg text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer",
                                selectedLead.priority === p
                                  ? p === 3 
                                    ? "bg-rose-500 text-white shadow-sm"
                                    : p === 2
                                      ? "bg-amber-500 text-white shadow-sm"
                                      : "bg-emerald-500 text-white shadow-sm"
                                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-white/5"
                              )}
                            >
                              <Star size={11} className={selectedLead.priority === p ? "fill-current" : ""} />
                              {p === 1 ? "Baixa" : p === 2 ? "Média" : "Alta"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Probabilidade de Sucesso</label>
                          <span className="font-black text-indigo-600 dark:text-indigo-400 text-[10px]">{selectedLead.probability}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={selectedLead.probability}
                          onChange={e => handleSaveLeadEdits({ ...selectedLead, probability: Number(e.target.value) })}
                          className="w-full mt-2 accent-indigo-600 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
                        />
                      </div>
                    </div>

                    {/* Responsável e Data */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Agente / Responsável</label>
                        <select 
                          value={selectedLead.agent_id || ''}
                          onChange={e => handleSaveLeadEdits({ ...selectedLead, agent_id: e.target.value || null })}
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white cursor-pointer"
                        >
                          <option value="" className="dark:bg-[#111b21]">Sem responsável atribuído</option>
                          {agents.map(a => (
                            <option key={a.id} value={a.id} className="dark:bg-[#111b21]">{a.full_name || a.email}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Prazo Limite / Vencimento</label>
                        <input 
                          type="date" 
                          value={selectedLead.due_date || ''}
                          onChange={e => handleSaveLeadEdits({ ...selectedLead, due_date: e.target.value || null })}
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white transition-all"
                        />
                      </div>
                    </div>

                    {/* Tags / Marcadores */}
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Tags & Marcadores (separados por vírgula)</label>
                      <input 
                        type="text" 
                        value={(selectedLead.tags || []).join(', ')}
                        placeholder="ex: URGENTE, SISTEMA, BUGFIX, GASTROFOOD"
                        onChange={e => {
                          const newTags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                          handleSaveLeadEdits({ ...selectedLead, tags: newTags });
                        }}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/80 dark:border-white/10 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* ABA 2: EXECUÇÃO & ENTREGA TÉCNICA IA */}
                {leadDetailTab === 'technical' && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    {/* Alerta de Validação se houver */}
                    {validationAlertMessage && (
                      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start justify-between gap-3 text-amber-700 dark:text-amber-300 text-xs">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold block">Ação Bloqueada por Governança</span>
                            <span className="mt-0.5 block leading-relaxed">{validationAlertMessage}</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => setValidationAlertMessage(null)}
                          className="text-amber-500 hover:text-amber-700 p-1 cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}

                    {/* Modo Edição Manual do Detalhamento Técnico */}
                    {isEditingTechnical ? (
                      <div className="p-5 bg-slate-50 dark:bg-[#1a242c] border border-indigo-500/30 rounded-2xl space-y-4 shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 pb-3">
                          <div className="flex items-center gap-2">
                            <Code size={18} className="text-indigo-500" />
                            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                              Registrar / Atualizar Detalhamento da Execução Técnica
                            </h4>
                          </div>
                          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
                            Obrigatório para Testes & QA
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px] flex items-center gap-1">
                            <Sparkles size={11} className="text-amber-500" />
                            Resumo Executivo do que foi Desenvolvido / Codificado *
                          </label>
                          <textarea
                            rows={4}
                            value={techSummaryInput}
                            onChange={e => setTechSummaryInput(e.target.value)}
                            placeholder="Descreva as soluções, regras de negócio implementadas, correções e motivos técnicos..."
                            className="w-full px-3.5 py-2.5 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-sans leading-relaxed"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px] flex items-center gap-1">
                              <CheckCircle2 size={11} className="text-emerald-500" />
                              Validação Técnica / Testes Realizados
                            </label>
                            <input
                              type="text"
                              value={techValidationInput}
                              onChange={e => setTechValidationInput(e.target.value)}
                              placeholder="ex: npx tsc --noEmit (0 erros) ou Testes E2E OK"
                              className="w-full px-3.5 py-2 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px] flex items-center gap-1">
                              <User size={11} className="text-indigo-500" />
                              Executor / Desenvolvedor Responsável
                            </label>
                            <input
                              type="text"
                              value={techExecutorInput}
                              onChange={e => setTechExecutorInput(e.target.value)}
                              placeholder="Nome do desenvolvedor ou IA"
                              className="w-full px-3.5 py-2 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9px] flex items-center gap-1">
                            <FileCode2 size={11} className="text-indigo-500" />
                            Arquivos & Funções Modificadas (1 por linha: arquivo -&gt; funcoes -&gt; descricao)
                          </label>
                          <textarea
                            rows={3}
                            value={techFilesInput}
                            onChange={e => setTechFilesInput(e.target.value)}
                            placeholder="ex: src/pages/CrmKanban.tsx -&gt; handleDrop, handleSaveLeadEdits -&gt; Adicionada validação para estágio de testes"
                            className="w-full px-3.5 py-2 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/10 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-2">
                          <button
                            type="button"
                            onClick={() => setIsEditingTechnical(false)}
                            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!techSummaryInput.trim()) {
                                alert('O resumo executivo da execução técnica é obrigatório.');
                                return;
                              }
                              handleSaveTechnicalExecution(selectedLead, techSummaryInput, techFilesInput, techValidationInput, techExecutorInput);
                              setValidationAlertMessage(null);
                            }}
                            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Check size={14} />
                            Salvar Detalhamento Técnico
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Modo de Visualização do Relatório Técnico */
                      <>
                        <div className="p-5 bg-gradient-to-br from-emerald-500/[0.08] via-indigo-500/[0.04] to-purple-500/[0.06] border border-emerald-500/25 dark:border-emerald-500/20 rounded-2xl shadow-sm">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-500/15 pb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
                                <Cpu size={22} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                    ⚡ Detalhamento de Execução
                                  </span>
                                  <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                                    {currentStageObj?.label || selectedLead.status}
                                  </span>
                                </div>
                                <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-1">
                                  Registro de Implementação Técnica
                                </h4>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setTechSummaryInput(deliveryReport?.summary || selectedLead.technical_execution_details || '');
                                  const filesStr = (deliveryReport?.files_modified || []).map((f: any) => `${f.file} -> ${(f.functions || []).join(', ')} -> ${f.description || ''}`).join('\n');
                                  setTechFilesInput(filesStr);
                                  setTechValidationInput(deliveryReport?.validation?.type_checking || 'npx tsc --noEmit (0 erros)');
                                  setTechExecutorInput(deliveryReport?.executor || '');
                                  setIsEditingTechnical(true);
                                }}
                                className="px-3.5 py-2 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                              >
                                <Edit2 size={13} />
                                Editar Detalhamento
                              </button>

                              <button
                                type="button"
                                onClick={handleCopyDeliveryText}
                                className="px-3.5 py-2 bg-white dark:bg-[#1a242c] hover:bg-slate-100 dark:hover:bg-[#222e38] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                              >
                                {copiedDelivery ? (
                                  <>
                                    <CheckCheck size={14} className="text-emerald-500" />
                                    <span className="text-emerald-600 dark:text-emerald-400">Copiado!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={14} />
                                    Copiar Registro
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Metadados da Entrega */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-[10.5px]">
                            <div className="p-3 bg-white/60 dark:bg-[#1a242c]/60 rounded-xl border border-slate-200/50 dark:border-white/5">
                              <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8.5px] block">📅 Data & Hora do Registro</span>
                              <span className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block">
                                {deliveryReport?.executed_at 
                                  ? format(new Date(deliveryReport.executed_at), 'dd/MM/yyyy HH:mm:ss')
                                  : selectedLead.created_at ? format(new Date(selectedLead.created_at), 'dd/MM/yyyy HH:mm:ss') : 'Hoje'}
                              </span>
                            </div>
                            <div className="p-3 bg-white/60 dark:bg-[#1a242c]/60 rounded-xl border border-slate-200/50 dark:border-white/5">
                              <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8.5px] block">🤖 Executor da Codificação</span>
                              <span className="font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5 block truncate">
                                {deliveryReport?.executor || 'Desenvolvedor / Antigravity AI'}
                              </span>
                            </div>
                            <div className="p-3 bg-white/60 dark:bg-[#1a242c]/60 rounded-xl border border-slate-200/50 dark:border-white/5">
                              <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8.5px] block">🔍 Validação & Build</span>
                              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                                <CheckCircle2 size={12} />
                                {deliveryReport?.validation?.type_checking || 'TypeScript: 0 Erros (OK)'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Resumo da Solução */}
                        <div className="space-y-2">
                          <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px] flex items-center gap-1">
                            <Sparkles size={12} className="text-amber-500" />
                            Resumo Executivo do que foi Codificado & Implementado
                          </label>
                          <div className="p-4 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/80 dark:border-white/10 rounded-2xl text-slate-800 dark:text-slate-200 text-xs leading-relaxed whitespace-pre-wrap">
                            {deliveryReport?.summary || selectedLead.technical_execution_details || (
                              selectedLead.notes && selectedLead.notes.includes('### 🚀 Registro de Entrega & Execução Técnica')
                                ? selectedLead.notes.split('### 🚀 Registro de Entrega & Execução Técnica')[1].trim()
                                : 'Nenhum detalhamento registrado ainda. Clique em "Editar Detalhamento" para registrar a execução técnica deste card.'
                            )}
                          </div>
                        </div>

                        {/* Arquivos e Funções Modificadas */}
                        <div className="space-y-3">
                          <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px] flex items-center gap-1">
                            <Terminal size={12} className="text-indigo-500" />
                            Arquivos e Funções Modificadas no Código-Fonte
                          </label>

                          {deliveryReport?.files_modified && deliveryReport.files_modified.length > 0 ? (
                            <div className="space-y-3">
                              {deliveryReport.files_modified.map((item: any, idx: number) => (
                                <div key={idx} className="p-4 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/80 dark:border-white/10 rounded-2xl space-y-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/50 dark:border-white/5 pb-2">
                                    <div className="flex items-center gap-2 font-mono text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400">
                                      <FileCode2 size={14} />
                                      <span>{item.file}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {(item.functions || []).map((fn: string, fnIdx: number) => (
                                        <span key={fnIdx} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 rounded-md font-mono text-[9.5px] font-bold border border-indigo-500/15">
                                          fn: {fn}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                                    {item.description}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-6 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/80 dark:border-white/10 rounded-2xl text-center space-y-3">
                              <FileCode2 size={24} className="mx-auto text-slate-400" />
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Nenhum arquivo modificado foi listado explicitamente para este cartão.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setTechSummaryInput(deliveryReport?.summary || selectedLead.notes || '');
                                  setIsEditingTechnical(true);
                                }}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Plus size={14} />
                                Inserir Arquivos & Detalhes
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ABA 3: NOTAS & BRIEFING */}
                {leadDetailTab === 'notes' && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="flex justify-between items-center">
                      <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Briefing, Requisitos e Observações</label>
                      <button
                        type="button"
                        onClick={() => setIsEditingNotes(!isEditingNotes)}
                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {isEditingNotes ? "👁️ Visualizar Formatado" : "✏️ Modo Edição"}
                      </button>
                    </div>

                    {isEditingNotes ? (
                      <textarea 
                        rows={10}
                        placeholder="Adicione observações importantes, escopo técnico, dores do cliente ou histórico..."
                        value={selectedLead.notes || ''}
                        onChange={e => handleSaveLeadEdits({ ...selectedLead, notes: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-medium focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white leading-relaxed custom-scrollbar font-mono"
                      />
                    ) : selectedLead.notes && selectedLead.notes.includes('<p>') ? (
                      <div 
                        className="p-5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/80 dark:border-white/10 rounded-2xl min-h-[140px] text-slate-800 dark:text-slate-100 leading-relaxed max-h-[380px] overflow-y-auto custom-scrollbar prose dark:prose-invert text-xs"
                        dangerouslySetInnerHTML={{ __html: selectedLead.notes }}
                      />
                    ) : (
                      <div className="p-5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/80 dark:border-white/10 rounded-2xl min-h-[140px] text-slate-800 dark:text-slate-100 leading-relaxed max-h-[380px] overflow-y-auto custom-scrollbar whitespace-pre-wrap font-sans text-xs">
                        {selectedLead.notes || (
                          <span className="text-slate-400 dark:text-slate-500 italic">
                            Nenhuma nota cadastrada. Clique em "Modo Edição" para registrar o briefing deste lead.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ABA 4: HISTÓRICO DE TRANSIÇÕES */}
                {leadDetailTab === 'history' && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block text-[9px]">
                      Linha do Tempo de Movimentações na Esteira
                    </label>

                    {selectedLead.history && selectedLead.history.length > 0 ? (
                      <div className="space-y-4 border-l-2 border-indigo-500/25 dark:border-indigo-500/20 pl-5 ml-3 text-left">
                        {selectedLead.history.map((h, i) => {
                          const fromStage = pipelineStages.find(s => s.id === h.from)?.label || h.from;
                          const toStage = pipelineStages.find(s => s.id === h.to)?.label || h.to;
                          const isAi = h.by?.includes('Antigravity') || h.by?.includes('Fila Dev');

                          return (
                            <div key={i} className="relative group">
                              {/* Nó luminoso */}
                              <div className={cn(
                                "absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#111b21] shadow-sm transition-all",
                                isAi ? "bg-emerald-500 ring-4 ring-emerald-500/20" : "bg-indigo-500 ring-4 ring-indigo-500/20"
                              )} />

                              <div className="p-3.5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200/60 dark:border-white/5 rounded-xl space-y-1.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-slate-100">
                                    <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-white/10 text-[9.5px]">{fromStage}</span>
                                    <ArrowRight size={12} className="text-slate-400" />
                                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9.5px] font-black">{toStage}</span>
                                  </div>
                                  <span className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500">
                                    {format(new Date(h.at), 'dd/MM/yyyy HH:mm:ss')}
                                  </span>
                                </div>

                                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                  Executado por <span className="font-extrabold text-slate-700 dark:text-slate-200">{h.by}</span>
                                  {isAi && <span className="ml-1.5 px-1.5 py-0.2 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded text-[8.5px] font-black uppercase">Autônomo</span>}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-10 text-center text-slate-400 dark:text-slate-500">
                        <History size={28} className="mx-auto mb-2 opacity-40" />
                        <p className="font-bold text-xs">Nenhuma movimentação registrada até o momento.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer fixado com Ações */}
              <div className="px-6 py-4 border-t border-slate-200/50 dark:border-white/5 bg-slate-50/60 dark:bg-black/20 shrink-0 flex items-center justify-between gap-3">
                {selectedLead.customer_id ? (
                  <button 
                    onClick={() => {
                      useChatStore.getState().setActiveChat(selectedLead.customer_id);
                      navigate('/chat');
                    }}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-emerald-500/15 hover:shadow-emerald-500/25 transition-all active:scale-95 cursor-pointer"
                  >
                    <MessageSquare size={14} />
                    Abrir Chat do WhatsApp
                  </button>
                ) : (
                  <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                    Sem contato vinculado
                  </span>
                )}

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setSelectedLead(null)}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-all active:scale-95 cursor-pointer text-xs"
                  >
                    Fechar Painel
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* MODAL: Configurar / Editar Quadro */}
      {isEditBoardOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111b21] w-full max-w-lg rounded-[28px] border border-slate-200/50 dark:border-white/5 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner animate-pulse">
                  <Settings size={18} />
                </div>
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 font-sans uppercase tracking-wider">Configurações do Quadro</h3>
              </div>
              <button 
                onClick={() => setIsEditBoardOpen(false)} 
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateBoard} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs text-left">
                <div className="space-y-1">
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Nome do Quadro *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Nome do quadro"
                    value={editBoardForm.name}
                    onChange={e => setEditBoardForm({ ...editBoardForm, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-[#202c33]/40 border border-slate-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-800 dark:text-slate-200 transition-all duration-300"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Descrição</label>
                  <input 
                    type="text" 
                    placeholder="Descrição do processo"
                    value={editBoardForm.description}
                    onChange={e => setEditBoardForm({ ...editBoardForm, description: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-[#202c33]/40 border border-slate-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-800 dark:text-slate-200 transition-all duration-300"
                  />
                </div>

                {/* Lista de colunas/etapas editáveis */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center">
                    <label className="font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider text-[9px]">Etapas / Colunas</label>
                    <button 
                      type="button"
                      onClick={() => {
                        const newId = `stage_${Date.now()}`;
                        setEditBoardForm({
                          ...editBoardForm,
                          stages: [
                            ...editBoardForm.stages,
                            { id: newId, label: 'Nova Coluna', subtitle: 'Descrição', color: 'bg-indigo-500' }
                          ]
                        });
                      }}
                      className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold uppercase px-2.5 py-1 rounded-lg border border-emerald-500/15 hover:bg-emerald-500/15 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={10} strokeWidth={3} /> Adicionar Etapa
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                    {editBoardForm.stages.map((stage, index) => (
                      <div key={stage.id} className="flex gap-2 items-center bg-slate-50 dark:bg-[#182229] p-3 rounded-2xl border border-slate-200/50 dark:border-white/5">
                        <div className="w-5 h-5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black flex items-center justify-center shrink-0">
                          {index + 1}
                        </div>

                        <div className="grid grid-cols-2 gap-2 flex-1">
                          <input 
                            type="text"
                            required
                            placeholder="Etapa"
                            value={stage.label}
                            onChange={e => {
                              const newStages = [...editBoardForm.stages];
                              newStages[index].label = e.target.value;
                              setEditBoardForm({ ...editBoardForm, stages: newStages });
                            }}
                            className="px-3 py-1.5 bg-white dark:bg-[#202c33]/50 border border-slate-200/50 dark:border-white/5 rounded-xl text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                          />
                          <input 
                            type="text"
                            placeholder="Subtítulo"
                            value={stage.subtitle || ''}
                            onChange={e => {
                              const newStages = [...editBoardForm.stages];
                              newStages[index].subtitle = e.target.value;
                              setEditBoardForm({ ...editBoardForm, stages: newStages });
                            }}
                            className="px-3 py-1.5 bg-white dark:bg-[#202c33]/50 border border-slate-200/50 dark:border-white/5 rounded-xl text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                          />
                        </div>

                        {/* Seletor de cores simplificado */}
                        <select
                          value={stage.color || 'bg-indigo-500'}
                          onChange={e => {
                            const newStages = [...editBoardForm.stages];
                            newStages[index].color = e.target.value;
                            setEditBoardForm({ ...editBoardForm, stages: newStages });
                          }}
                          className="px-2 py-1 bg-white dark:bg-[#202c33]/50 border border-slate-200/50 dark:border-white/5 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          <option value="bg-blue-500">Azul</option>
                          <option value="bg-emerald-500">Verde</option>
                          <option value="bg-amber-500">Amarelo</option>
                          <option value="bg-rose-500">Vermelho</option>
                          <option value="bg-indigo-500">Índigo</option>
                          <option value="bg-violet-500">Roxo</option>
                          <option value="bg-fuchsia-500">Rosa</option>
                          <option value="bg-slate-500">Cinza</option>
                        </select>

                        <button 
                          type="button"
                          onClick={() => {
                            setEditBoardForm({
                              ...editBoardForm,
                              stages: editBoardForm.stages.filter((_, i) => i !== index)
                            });
                          }}
                          className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                          title="Remover etapa"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Zona de Perigo (Danger Zone) */}
                <div className="mt-6 pt-4 border-t border-rose-550/10 space-y-2">
                  <h4 className="font-extrabold text-rose-600 uppercase tracking-wider text-[9px]">Zona de Perigo</h4>
                  <div className="flex justify-between items-center bg-rose-500/[0.02] border border-rose-500/10 p-3.5 rounded-2xl">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">Excluir este quadro</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Excluirá permanentemente o quadro e todos os seus leads.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditBoardOpen(false);
                        handleDeleteBoard();
                      }}
                      className="px-3.5 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase shadow-sm active:scale-95 transition-all duration-200 cursor-pointer"
                    >
                      Excluir Quadro
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer fixado */}
              <div className="px-6 py-4 border-t border-slate-200/20 dark:border-white/5 bg-slate-50/50 dark:bg-black/10 shrink-0 flex gap-3 justify-end">
                <button 
                  type="button"
                  onClick={() => setIsEditBoardOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 font-bold rounded-xl transition-all duration-200 text-xs active:scale-95 cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all duration-200 text-xs active:scale-95 cursor-pointer"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Criação Inteligente com Áudio & IA Gemini */}
      {isAiCardModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111b21] w-full max-w-2xl rounded-[32px] border border-slate-200/50 dark:border-white/10 overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh] transition-all">
            
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5 bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-transparent flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Mic size={20} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white font-sans uppercase tracking-wider flex items-center gap-2">
                    Criar Card com Áudio & IA
                    <span className="text-[9px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-extrabold border border-indigo-500/30">
                      Gemini 2.5 Pro
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Fale ou digite sua ideia de funcionalidade. A IA criará o plano de engenharia e estruturará o card.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  stopAiAudioRecording();
                  setIsAiCardModalOpen(false);
                }} 
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Conteúdo Rolável */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs">
              
              {/* Gravador de Áudio */}
              <div className="p-5 rounded-2xl border border-dashed border-indigo-500/30 bg-gradient-to-br from-indigo-500/[0.04] via-purple-500/[0.02] to-transparent flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                    isAiRecording 
                      ? "bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-500/40 ring-4 ring-rose-500/20" 
                      : "bg-gradient-to-tr from-purple-500/20 to-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  )}>
                    {isAiRecording ? <Radio size={24} /> : <Mic size={24} />}
                  </div>
                  <div>
                    <h5 className="font-black text-xs text-slate-900 dark:text-white flex items-center gap-2">
                      {isAiRecording ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                          Gravando Áudio... ({aiRecordingSeconds}s)
                        </>
                      ) : (
                        'Gravar Ideia por Áudio'
                      )}
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {isAiRecording 
                        ? 'Descreva a funcionalidade para o sistema ou chat e clique em concluir' 
                        : 'Clique para falar pelo microfone e deixar a IA transcrever e planejar'}
                    </p>
                  </div>
                </div>

                {isAiRecording ? (
                  <button
                    type="button"
                    onClick={stopAiAudioRecording}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black shadow-lg shadow-rose-500/25 flex items-center gap-2 text-xs transition-all active:scale-95 cursor-pointer uppercase tracking-wider"
                  >
                    <Square size={14} />
                    Parar e Criar Plano
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isGeneratingPlan}
                    onClick={startAiAudioRecording}
                    className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-black shadow-md shadow-indigo-500/20 flex items-center gap-2 text-xs transition-all active:scale-95 cursor-pointer uppercase tracking-wider"
                  >
                    <Mic size={14} />
                    Gravar por Voz
                  </button>
                )}
              </div>

              {/* Entrada de Texto Alternativa */}
              <div className="space-y-2">
                <label className="font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[10px]">
                  Ou digite o que precisa ser desenvolvido / corrigido:
                </label>
                <textarea 
                  rows={3}
                  value={aiCardPrompt}
                  onChange={e => setAiCardPrompt(e.target.value)}
                  placeholder="Ex: Quero adicionar no chat um botão de envio de áudio gravado que seja automaticamente salvo no banco e gere transcrição em tempo real..."
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-900 dark:text-white leading-relaxed custom-scrollbar transition-all"
                />
                
                <button
                  type="button"
                  disabled={isGeneratingPlan || !aiCardPrompt.trim() || isAiRecording}
                  onClick={handleGeneratePlanFromText}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-500/15 flex items-center justify-center gap-2 text-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isGeneratingPlan ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Analisando e Gerando Plano de Desenvolvimento com IA...
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      Gerar Plano Técnico com IA
                    </>
                  )}
                </button>
              </div>

              {/* Plano Gerado / Preview Estruturado */}
              {generatedPlan && (
                <div className="p-5 bg-gradient-to-br from-indigo-500/[0.06] via-purple-500/[0.03] to-transparent border border-indigo-500/25 rounded-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between border-b border-indigo-500/15 pb-3">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                      🎯 Plano de Engenharia Estruturado
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      Prioridade: {generatedPlan.priority === 3 ? '🔴 Alta' : generatedPlan.priority === 2 ? '🟡 Média' : '🟢 Normal'}
                    </span>
                  </div>

                  {/* Título & Coluna de Destino */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[9px]">Título do Card</label>
                      <input 
                        type="text" 
                        value={generatedPlan.title}
                        onChange={e => setGeneratedPlan({ ...generatedPlan, title: e.target.value })}
                        className="w-full px-3.5 py-2 bg-white dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[9px]">Coluna no Quadro</label>
                      <select 
                        value={selectedTargetStage}
                        onChange={e => setSelectedTargetStage(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-900 dark:text-white cursor-pointer"
                      >
                        {pipelineStages.map(s => (
                          <option key={s.id} value={s.id} className="dark:bg-[#111b21]">{s.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex gap-1.5 flex-wrap">
                    {generatedPlan.tags.map((t, idx) => (
                      <span key={idx} className="text-[9px] font-black uppercase px-2.5 py-0.5 rounded-md bg-white dark:bg-white/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                        #{t}
                      </span>
                    ))}
                  </div>

                  {/* Resumo */}
                  <div className="p-3 bg-white/60 dark:bg-black/20 rounded-xl border border-black/5 dark:border-white/5">
                    <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-relaxed">
                      {generatedPlan.summary}
                    </p>
                  </div>

                  {/* Plano Detalhado em Markdown */}
                  <div className="space-y-1.5">
                    <label className="font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[9px]">Especificação Técnica & Requisitos</label>
                    <div className="p-4 bg-white dark:bg-[#0c1317] border border-slate-200 dark:border-white/10 rounded-xl max-h-[220px] overflow-y-auto custom-scrollbar text-[11px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-mono leading-relaxed select-text">
                      {generatedPlan.technical_plan}
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200/20 dark:border-white/5 bg-slate-50/50 dark:bg-black/10 shrink-0 flex gap-3 justify-end">
              <button 
                type="button" 
                onClick={() => {
                  stopAiAudioRecording();
                  setIsAiCardModalOpen(false);
                }}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 font-bold rounded-xl transition-all duration-200 text-xs active:scale-95 cursor-pointer uppercase tracking-wider"
              >
                Cancelar
              </button>
              <button 
                type="button"
                disabled={!generatedPlan || loading}
                onClick={handleConfirmCreateAiCard}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-500/25 transition-all duration-200 text-xs active:scale-95 disabled:opacity-50 cursor-pointer uppercase tracking-wider flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Salvando no Quadro...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    Confirmar e Criar Card no Kanban
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: Criador de Novos Quadros */}
      <KanbanBoardCreator 
        isOpen={isCreatorOpen} 
        onClose={() => setIsCreatorOpen(false)} 
        onCreated={() => {
          setIsCreatorOpen(false);
          useChatStore.getState().fetchCrmBoards(); // recarregar sidebar
        }}
      />

    </div>
  );
}
