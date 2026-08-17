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
  Layers
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
  }[];
  chatwoot_conversation_id: string | null;
  created_at: string;
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
      const { error } = await supabase
        .from('crm_leads')
        .update({
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
        })
        .eq('id', updatedLead.id);

      if (error) throw error;
      setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
      setSelectedLead(updatedLead);
    } catch (err) {
      console.error('Erro ao salvar edições do lead:', err);
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
      
      {/* Cabeçalho Kanban Premium */}
      <header className="shrink-0 flex flex-col xl:flex-row xl:items-center justify-between gap-4.5 px-8 py-5 border-b border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-[#0c1317]/50 backdrop-blur-xl select-none z-10">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/10 shrink-0">
            <CircleDot size={20} className="animate-pulse" />
          </div>
          <div className="text-left">
            <h1 className="text-base font-extrabold tracking-tight text-slate-800 dark:text-slate-100 font-sans flex items-center gap-2">
              {board.name}
              <span className="text-[9px] px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-black uppercase rounded-lg border border-indigo-500/15">Kanban</span>
            </h1>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-sans font-bold mt-0.5">
              {board.config?.description || 'Arraste e solte cartões para avançar oportunidades e fechar negócios'}
            </p>
          </div>
        </div>

        {/* Controles de Filtros, Criação e Edição */}
        <div className="flex items-center gap-2.5 flex-wrap xl:flex-nowrap">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={13} />
            <input 
              type="text" 
              placeholder="Pesquisar cartão..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2.5 w-[190px] bg-slate-100/80 dark:bg-[#202c33]/40 border border-slate-200/40 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-800 dark:text-slate-200 transition-all duration-300"
            />
          </div>

          {/* Filtro de Agente */}
          <div className="relative cursor-pointer select-none">
            <select 
              value={selectedAgentFilter}
              onChange={e => setSelectedAgentFilter(e.target.value)}
              className="px-3.5 pr-8 py-2.5 bg-slate-100/80 dark:bg-[#202c33]/40 border border-slate-200/40 dark:border-white/5 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-800 dark:text-slate-200 cursor-pointer appearance-none"
            >
              <option value="all">👥 Todos os Agentes</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>👤 {a.full_name?.split(' ')[0] || a.email}</option>
              ))}
            </select>
          </div>

          {/* Ações */}
          <button 
            onClick={handleDeleteBoard}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-xl text-xs font-bold shadow-sm transition-all duration-200 active:scale-95 cursor-pointer"
            title="Excluir este quadro permanentemente"
          >
            <Trash2 size={13} />
            Excluir Quadro
          </button>
          <button 
            onClick={() => setIsEditBoardOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white dark:bg-[#202c33]/70 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-white/10 rounded-xl text-xs font-bold shadow-sm transition-all duration-200 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95 cursor-pointer"
          >
            <Settings size={13} />
            Configurar
          </button>
          <button 
            onClick={() => setIsCreatorOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white dark:bg-[#202c33]/70 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-white/10 rounded-xl text-xs font-bold shadow-sm transition-all duration-200 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-95 cursor-pointer"
          >
            <Plus size={13} />
            Novo Quadro
          </button>
          <button 
            onClick={() => {
              setGeneratedPlan(null);
              setAiCardPrompt('');
              setSelectedTargetStage(pipelineStages[0]?.id || '');
              setIsAiCardModalOpen(true);
            }}
            className="flex items-center gap-2 px-4.5 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-200 hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            <Mic size={14} className="text-amber-300 animate-pulse" />
            <span>Criar com Áudio & IA</span>
            <Sparkles size={12} className="text-amber-300" />
          </button>
          <button 
            onClick={() => {
              setLeadForm(prev => ({ ...prev, status: pipelineStages[0]?.id || '' }));
              setIsAddLeadOpen(true);
            }}
            className="flex items-center gap-1.5 px-4.5 py-2.5 bg-white dark:bg-[#202c33]/70 text-slate-800 dark:text-slate-200 border border-slate-200/60 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl text-xs font-black shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            <Plus size={13} strokeWidth={2.5} />
            Novo Cartão
          </button>
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
                "w-[290px] shrink-0 flex flex-col h-full bg-slate-50/60 dark:bg-[#182229]/40 backdrop-blur-md rounded-[28px] border border-slate-200/50 dark:border-white/5 overflow-hidden transition-all duration-300",
                isOver && "border-indigo-500/45 dark:border-indigo-500/30 bg-indigo-500/[0.01] dark:bg-indigo-500/[0.02]"
              )}
            >
              {/* Cabeçalho da Coluna - Minimalist Premium */}
              <div 
                className={cn(
                  "p-4 flex items-center justify-between shrink-0 select-none border-b border-slate-200/40 dark:border-white/5 transition-all relative border-t-4",
                  colors.borderTop
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", stage.color || "bg-indigo-500")} />
                  <div className="min-w-0 text-left">
                    <h3 className="text-xs font-black truncate font-sans tracking-wide leading-tight flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
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
                className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar"
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
                            "group/card bg-white/80 dark:bg-[#111b21]/75 backdrop-blur-md p-4.5 rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-sm hover:shadow-[0_12px_24px_rgba(0,0,0,0.04)] dark:hover:shadow-[0_12px_24px_rgba(0,0,0,0.25)] hover:border-slate-300 dark:hover:border-indigo-500/20 hover:-translate-y-0.5 transition-all duration-300 cursor-grab active:cursor-grabbing relative overflow-hidden",
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

                          {/* Informações de Faturamento */}
                          <div className="flex items-center justify-between mt-3 pl-1 text-[10px]">
                            <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8px]">
                              Faturamento
                            </span>
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black text-[10px] rounded-lg border border-emerald-500/15 shrink-0">
                              R$ {Number(lead.estimated_revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>

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

              {/* Rodapé da Coluna com Faturamento Total */}
              <div className="p-4 border-t border-black/[0.03] dark:border-white/[0.03] bg-black/[0.01] dark:bg-white/[0.01] shrink-0 flex items-center justify-between text-[10px]">
                <span className="text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider">Total Estimado</span>
                <span className="font-extrabold text-gray-800 dark:text-gray-200">
                  R$ {colRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
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

      {/* MODAL: Detalhes do Cartão / Oportunidade */}
      {selectedLead && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111b21] w-full max-w-2xl rounded-[28px] border border-slate-200/50 dark:border-white/5 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            {/* Cabeçalho */}
            <div className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-550/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-inner">
                  <FileText size={18} />
                </div>
                <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 font-sans uppercase tracking-wider">Detalhes do Lead</h3>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleDeleteLead(selectedLead.id)}
                  className="p-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-xl transition-colors cursor-pointer"
                  title="Excluir Oportunidade"
                >
                  <Trash2 size={14} />
                </button>
                <button 
                  onClick={() => setSelectedLead(null)} 
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Conteúdo Rolável */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs text-left bg-white dark:bg-[#111b21]">
              {/* Título & Faturamento rápido */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Nome/Título</label>
                  <input 
                    type="text" 
                    value={selectedLead.title}
                    onChange={e => handleSaveLeadEdits({ ...selectedLead, title: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white transition-all duration-300"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Faturamento Estimado (R$)</label>
                  <input 
                    type="number" 
                    value={selectedLead.estimated_revenue}
                    onChange={e => handleSaveLeadEdits({ ...selectedLead, estimated_revenue: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white transition-all duration-300"
                  />
                </div>
              </div>

              {/* IA Qualificador */}
              {board.config?.features?.aiSummary && (
                <div className="p-4.5 bg-indigo-500/[0.03] dark:bg-indigo-500/[0.06] border border-indigo-500/15 dark:border-indigo-500/10 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 font-sans uppercase tracking-wider text-[10px]">
                      <Sparkles size={14} className="animate-pulse" />
                      Qualificação por Inteligência Artificial
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      O Gemini analisará as conversas anteriores e atualizará o resumo de negócios e prioridades automaticamente.
                    </p>
                  </div>
                  <button 
                    type="button"
                    disabled={isQualifying}
                    onClick={handleAIQualify}
                    className="px-4.5 py-2.5 bg-gradient-to-tr from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-xs flex items-center gap-1.5 shrink-0 self-start md:self-auto"
                  >
                    {isQualifying ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        Qualificando...
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} />
                        Resumo IA
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Status, Prioridade e Probabilidade */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Coluna/Estágio</label>
                  <select 
                    value={selectedLead.status}
                    onChange={e => handleSaveLeadEdits({ ...selectedLead, status: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white cursor-pointer appearance-none"
                  >
                    {pipelineStages.map(s => (
                      <option key={s.id} value={s.id} className="dark:bg-[#111b21]">{s.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Prioridade</label>
                  <select 
                    value={selectedLead.priority}
                    onChange={e => handleSaveLeadEdits({ ...selectedLead, priority: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white cursor-pointer appearance-none"
                  >
                    <option value="1" className="dark:bg-[#111b21]">⭐ Baixa</option>
                    <option value="2" className="dark:bg-[#111b21]">⭐⭐ Média</option>
                    <option value="3" className="dark:bg-[#111b21]">⭐⭐⭐ Alta</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Probabilidade ({selectedLead.probability}%)</label>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={selectedLead.probability}
                    onChange={e => handleSaveLeadEdits({ ...selectedLead, probability: Number(e.target.value) })}
                    className="w-full mt-2.5 accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Responsável e Data */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Agente / Responsável</label>
                  <select 
                    value={selectedLead.agent_id || ''}
                    onChange={e => handleSaveLeadEdits({ ...selectedLead, agent_id: e.target.value || null })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white cursor-pointer appearance-none"
                  >
                    <option value="" className="dark:bg-[#111b21]">Sem responsável</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id} className="dark:bg-[#111b21]">{a.full_name || a.email}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Prazo de Vencimento</label>
                  <input 
                    type="date" 
                    value={selectedLead.due_date || ''}
                    onChange={e => handleSaveLeadEdits({ ...selectedLead, due_date: e.target.value || null })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white transition-all duration-300"
                  />
                </div>
              </div>

              {/* Notas e Histórico de Qualificação */}
              <div className="space-y-1">
                <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Resumo Comercial e Notas</label>
                {selectedLead.notes && selectedLead.notes.includes('<p>') ? (
                  <div 
                    className="p-4 bg-slate-50 dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-2xl min-h-[120px] text-slate-800 dark:text-slate-100 leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar"
                    dangerouslySetInnerHTML={{ __html: selectedLead.notes }}
                  />
                ) : (
                  <textarea 
                    rows={4}
                    placeholder="Adicione observações importantes sobre este cliente, dores dele, ou histórico..."
                    value={selectedLead.notes || ''}
                    onChange={e => handleSaveLeadEdits({ ...selectedLead, notes: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-2xl text-xs font-medium focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white leading-relaxed custom-scrollbar"
                  />
                )}
                {selectedLead.notes && selectedLead.notes.includes('<p>') && (
                  <button 
                    onClick={() => handleSaveLeadEdits({ ...selectedLead, notes: selectedLead.notes.replace(/<[^>]*>/g, '') })}
                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline mt-1.5 block"
                  >
                    ✏️ Editar notas como texto puro
                  </button>
                )}
              </div>

              {/* Histórico de Transições */}
              {selectedLead.history && selectedLead.history.length > 0 && (
                <div className="space-y-2.5">
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block text-[9px]">Histórico de Movimentações</label>
                  <div className="space-y-3 border-l border-indigo-500/25 pl-4 ml-2 text-left">
                    {selectedLead.history.map((h, i) => (
                      <div key={i} className="relative">
                        <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-indigo-500 border-2 border-white dark:border-[#111b21]" />
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          De <span className="font-black text-slate-800 dark:text-slate-200">{pipelineStages.find(s => s.id === h.from)?.label || h.from}</span> para{' '}
                          <span className="font-black text-slate-800 dark:text-slate-200">{pipelineStages.find(s => s.id === h.to)?.label || h.to}</span> por{' '}
                          <span className="font-black text-slate-800 dark:text-slate-200">{h.by}</span> em {format(new Date(h.at), 'dd/MM/yyyy HH:mm')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer fixado */}
            <div className="px-6 py-4.5 border-t border-slate-200/50 dark:border-white/5 bg-slate-50/50 dark:bg-black/10 shrink-0 flex items-center justify-between">
              {selectedLead.customer_id ? (
                <button 
                  onClick={() => {
                    useChatStore.getState().setActiveChat(selectedLead.customer_id);
                    navigate('/chat');
                  }}
                  className="flex items-center gap-1.5 px-4.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/25 transition-all duration-200 active:scale-95 cursor-pointer"
                >
                  <MessageSquare size={14} />
                  Abrir Chat do WhatsApp
                </button>
              ) : (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Sem contato vinculado</span>
              )}
              <button 
                onClick={() => setSelectedLead(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 font-bold rounded-xl transition-colors active:scale-95 cursor-pointer text-xs"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}

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
