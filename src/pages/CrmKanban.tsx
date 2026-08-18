import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Code,
  Image as ImageIcon,
  Video as VideoIcon,
  Paperclip,
  Upload,
  Camera,
  Play,
  RotateCcw,
  FileImage,
  FileVideo
} from 'lucide-react';
import { useChatStore, instanceCache } from '../store/chatStore';
import { supabase } from '../services/supabase';
import { geminiService } from '../services/geminiService';
import KanbanBoardCreator from '../components/KanbanBoardCreator';
import RichTextEditor from '../components/RichTextEditor';
import { CardMediaCarousel, extractCardMedia } from '../components/CardMediaCarousel';
import { 
  CardMediaAttachment, 
  saveCardDraft, 
  loadCardDraft, 
  clearCardDraft 
} from '../utils/cardDraftStorage';
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
        border: 'border-blue-500/30 dark:border-blue-500/20',
        borderTop: 'border-t-blue-500',
        bgLight: 'bg-blue-500/10 dark:bg-blue-500/15',
        badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.15)]',
        dot: 'bg-blue-500 ring-4 ring-blue-500/20 shadow-[0_0_12px_rgba(59,130,246,0.5)]',
        glowGradient: 'from-blue-500 via-cyan-400 to-indigo-500',
        cardAccent: 'bg-blue-500 shadow-blue-500/30'
      };
    case 'emerald-500':
      return {
        text: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-500/30 dark:border-emerald-500/20',
        borderTop: 'border-t-emerald-500',
        bgLight: 'bg-emerald-500/10 dark:bg-emerald-500/15',
        badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]',
        dot: 'bg-emerald-500 ring-4 ring-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.5)]',
        glowGradient: 'from-emerald-500 via-teal-400 to-green-500',
        cardAccent: 'bg-emerald-500 shadow-emerald-500/30'
      };
    case 'amber-500':
      return {
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-500/30 dark:border-amber-500/20',
        borderTop: 'border-t-amber-500',
        bgLight: 'bg-amber-500/10 dark:bg-amber-500/15',
        badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]',
        dot: 'bg-amber-500 ring-4 ring-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.5)]',
        glowGradient: 'from-amber-500 via-orange-400 to-yellow-500',
        cardAccent: 'bg-amber-500 shadow-amber-500/30'
      };
    case 'rose-500':
      return {
        text: 'text-rose-600 dark:text-rose-400',
        border: 'border-rose-500/30 dark:border-rose-500/20',
        borderTop: 'border-t-rose-500',
        bgLight: 'bg-rose-500/10 dark:bg-rose-500/15',
        badge: 'bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.15)]',
        dot: 'bg-rose-500 ring-4 ring-rose-500/20 shadow-[0_0_12px_rgba(244,63,94,0.5)]',
        glowGradient: 'from-rose-500 via-pink-400 to-red-500',
        cardAccent: 'bg-rose-500 shadow-rose-500/30'
      };
    case 'violet-500':
      return {
        text: 'text-violet-600 dark:text-violet-400',
        border: 'border-violet-500/30 dark:border-violet-500/20',
        borderTop: 'border-t-violet-500',
        bgLight: 'bg-violet-500/10 dark:bg-violet-500/15',
        badge: 'bg-violet-500/15 text-violet-800 dark:text-violet-300 border border-violet-500/30 shadow-[0_0_10px_rgba(139,92,246,0.15)]',
        dot: 'bg-violet-500 ring-4 ring-violet-500/20 shadow-[0_0_12px_rgba(139,92,246,0.5)]',
        glowGradient: 'from-violet-500 via-purple-400 to-indigo-500',
        cardAccent: 'bg-violet-500 shadow-violet-500/30'
      };
    case 'fuchsia-500':
      return {
        text: 'text-fuchsia-600 dark:text-fuchsia-400',
        border: 'border-fuchsia-500/30 dark:border-fuchsia-500/20',
        borderTop: 'border-t-fuchsia-500',
        bgLight: 'bg-fuchsia-500/10 dark:bg-fuchsia-500/15',
        badge: 'bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-300 border border-fuchsia-500/30 shadow-[0_0_10px_rgba(217,70,239,0.15)]',
        dot: 'bg-fuchsia-500 ring-4 ring-fuchsia-500/20 shadow-[0_0_12px_rgba(217,70,239,0.5)]',
        glowGradient: 'from-fuchsia-500 via-pink-400 to-purple-500',
        cardAccent: 'bg-fuchsia-500 shadow-fuchsia-500/30'
      };
    case 'slate-500':
      return {
        text: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-500/30 dark:border-slate-500/20',
        borderTop: 'border-t-slate-500',
        bgLight: 'bg-slate-500/10 dark:bg-slate-500/15',
        badge: 'bg-slate-500/15 text-slate-800 dark:text-slate-300 border border-slate-500/30 shadow-[0_0_10px_rgba(100,116,139,0.15)]',
        dot: 'bg-slate-500 ring-4 ring-slate-500/20 shadow-[0_0_12px_rgba(100,116,139,0.5)]',
        glowGradient: 'from-slate-500 via-gray-400 to-zinc-500',
        cardAccent: 'bg-slate-500 shadow-slate-500/30'
      };
    default:
      return {
        text: 'text-indigo-600 dark:text-indigo-400',
        border: 'border-indigo-500/30 dark:border-indigo-500/20',
        borderTop: 'border-t-indigo-500',
        bgLight: 'bg-indigo-500/10 dark:bg-indigo-500/15',
        badge: 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.15)]',
        dot: 'bg-indigo-500 ring-4 ring-indigo-500/20 shadow-[0_0_12px_rgba(99,102,241,0.5)]',
        glowGradient: 'from-indigo-500 via-purple-400 to-cyan-500',
        cardAccent: 'bg-indigo-500 shadow-indigo-500/30'
      };
  }
};

// Utilitários para Extração Inteligente de Informações dos Cards
const parseCardHeaderInfo = (title: string) => {
  if (!title) return { category: null, cleanTitle: 'Sem título' };
  const match = title.match(/^\[(.*?)\]/);
  if (match) {
    return {
      category: match[1].trim(),
      cleanTitle: title.replace(/^\[(.*?)\]\s*/, '').trim()
    };
  }
  return {
    category: null,
    cleanTitle: title
  };
};

const getLeadSummarySnippet = (notes?: string | null) => {
  if (!notes) return null;
  const clean = notes
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/🎥\s*\[.*?\]\(.*?\)/g, '')
    .replace(/🎙️\s*\[.*?\]\(.*?\)/g, '')
    .replace(/^#+.*$/gm, '')
    .replace(/---/g, '')
    .replace(/<[^>]*>?/gm, '')
    .trim();
  const lines = clean.split('\n').map(l => l.trim()).filter(p => p.length > 0);
  const firstParagraph = lines.find(p => !p.startsWith('🎯') && !p.startsWith('📋') && !p.startsWith('🛠️') && !p.startsWith('🧪') && !p.startsWith('📎')) || lines[0];
  if (!firstParagraph) return null;
  return firstParagraph.length > 130 ? firstParagraph.slice(0, 130) + '...' : firstParagraph;
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
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
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
  const [collapsedStages, setCollapsedStages] = useState<Record<string, boolean>>(() => {
    if (typeof window !== 'undefined' && boardId) {
      try {
        const saved = localStorage.getItem(`crm_kanban_collapsed_stages_${boardId}`);
        return saved ? JSON.parse(saved) : {};
      } catch (e) {
        return {};
      }
    }
    return {};
  });

  // Função helper para alternar colapso de coluna com persistência imediata
  const toggleStageCollapse = (stageId: string, forceState?: boolean) => {
    setCollapsedStages(prev => {
      const nextState = {
        ...prev,
        [stageId]: forceState !== undefined ? forceState : !prev[stageId]
      };
      if (boardId && typeof window !== 'undefined') {
        try {
          localStorage.setItem(`crm_kanban_collapsed_stages_${boardId}`, JSON.stringify(nextState));
        } catch (e) {}
      }
      return nextState;
    });
  };

  // Carregar preferências salvas sempre que o boardId mudar
  useEffect(() => {
    if (!boardId || typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(`crm_kanban_collapsed_stages_${boardId}`);
      if (saved) {
        setCollapsedStages(JSON.parse(saved));
      }
    } catch (e) {}
  }, [boardId]);

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
    tagsString: '',
    notes: ''
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

  // Estados para Criação de Card com Áudio, Imagens, Vídeos & IA Multimodal
  const [isAiCardModalOpen, setIsAiCardModalOpen] = useState(false);
  const [isAiRecording, setIsAiRecording] = useState(false);
  const [aiRecordingSeconds, setAiRecordingSeconds] = useState(0);
  const [aiCardPrompt, setAiCardPrompt] = useState('');
  const [recordedAudioBase64, setRecordedAudioBase64] = useState<string | null>(null);
  const [recordedAudioMimeType, setRecordedAudioMimeType] = useState<string | null>(null);
  const [aiMediaAttachments, setAiMediaAttachments] = useState<CardMediaAttachment[]>([]);
  const [hasRecoveredDraft, setHasRecoveredDraft] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
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

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const aiMediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const aiAudioChunksRef = React.useRef<Blob[]>([]);
  const aiTimerIntervalRef = React.useRef<any>(null);

  // Utilitário para converter arquivo em base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const res = reader.result as string;
        resolve(res.split(',')[1] || '');
      };
      reader.onerror = error => reject(error);
    });
  };

  // Manipular adição de arquivos de mídia (imagens e vídeos)
  const handleAddMediaFiles = async (files: FileList | File[]) => {
    const newAttachments: CardMediaAttachment[] = [];
    setIsUploadingMedia(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;

      const isImg = file.type.startsWith('image/');
      const isVid = file.type.startsWith('video/');
      const isAud = file.type.startsWith('audio/');

      if (!isImg && !isVid && !isAud) continue;

      try {
        const base64 = await fileToBase64(file);
        const previewUrl = URL.createObjectURL(file);
        const attachment: CardMediaAttachment = {
          id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.name || (isImg ? 'screenshot.png' : 'video_demonstracao.mp4'),
          type: isImg ? 'image' : isVid ? 'video' : 'audio',
          mimeType: file.type || (isImg ? 'image/png' : isVid ? 'video/mp4' : 'audio/webm'),
          size: file.size,
          base64,
          previewUrl,
          file
        };
        newAttachments.push(attachment);
      } catch (e) {
        console.error('Erro ao converter arquivo em base64:', e);
      }
    }

    if (newAttachments.length > 0) {
      setAiMediaAttachments(prev => [...prev, ...newAttachments]);
    }
    setIsUploadingMedia(false);
  };

  // Remover anexo de mídia
  const handleRemoveMediaAttachment = (id: string) => {
    setAiMediaAttachments(prev => prev.filter(a => a.id !== id));
  };

  // Ouvinte de Colar (Ctrl+V / Clipboard Paste) para Prints e Screenshots
  useEffect(() => {
    if (!isAiCardModalOpen) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const file = new File([blob], `print_${Date.now()}.png`, { type: blob.type });
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        await handleAddMediaFiles(imageFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isAiCardModalOpen]);

  // Carregar rascunho do cache local ao abrir o modal
  useEffect(() => {
    if (!isAiCardModalOpen || !boardId) return;

    const loadDraft = async () => {
      const draft = await loadCardDraft(boardId);
      if (draft && (draft.textPrompt || draft.audioBase64 || (draft.attachments && draft.attachments.length > 0) || draft.generatedPlan)) {
        if (draft.textPrompt && !aiCardPrompt) setAiCardPrompt(draft.textPrompt);
        if (draft.audioBase64 && !recordedAudioBase64) {
          setRecordedAudioBase64(draft.audioBase64);
          setRecordedAudioMimeType(draft.audioMimeType || 'audio/webm');
        }
        if (draft.attachments && draft.attachments.length > 0 && aiMediaAttachments.length === 0) {
          setAiMediaAttachments(draft.attachments);
        }
        if (draft.generatedPlan && !generatedPlan) {
          setGeneratedPlan(draft.generatedPlan);
        }
        if (draft.targetStage && !selectedTargetStage) {
          setSelectedTargetStage(draft.targetStage);
        }
        setHasRecoveredDraft(true);
      }
    };

    loadDraft();
  }, [isAiCardModalOpen, boardId]);

  // Salvar rascunho automaticamente com debounce de 800ms
  useEffect(() => {
    if (!isAiCardModalOpen || !boardId) return;

    const timer = setTimeout(() => {
      if (aiCardPrompt || recordedAudioBase64 || aiMediaAttachments.length > 0 || generatedPlan) {
        saveCardDraft(boardId, {
          textPrompt: aiCardPrompt,
          audioBase64: recordedAudioBase64 || undefined,
          audioMimeType: recordedAudioMimeType || undefined,
          attachments: aiMediaAttachments,
          generatedPlan,
          targetStage: selectedTargetStage
        });
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [isAiCardModalOpen, boardId, aiCardPrompt, recordedAudioBase64, recordedAudioMimeType, aiMediaAttachments, generatedPlan, selectedTargetStage]);

  // Limpar Rascunho
  const handleClearDraft = async () => {
    if (!boardId) return;
    await clearCardDraft(boardId);
    setAiCardPrompt('');
    setRecordedAudioBase64(null);
    setRecordedAudioMimeType(null);
    setAiMediaAttachments([]);
    setGeneratedPlan(null);
    setHasRecoveredDraft(false);
  };

  // Gravação de Áudio
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
          setRecordedAudioBase64(base64Audio);
          setRecordedAudioMimeType('audio/webm');
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

  // Geração Multimodal do Plano com Gemini
  const handleGeneratePlanMultimodal = async () => {
    if (!aiCardPrompt.trim() && !recordedAudioBase64 && aiMediaAttachments.length === 0) {
      alert('Por favor, grave um áudio, envie fotos/vídeos ou digite o que precisa ser desenvolvido.');
      return;
    }

    try {
      setIsGeneratingPlan(true);
      const plan = await geminiService.generateFeaturePlanFromAudioOrText({
        textPrompt: aiCardPrompt,
        audioBase64: recordedAudioBase64 || undefined,
        audioMimeType: recordedAudioMimeType || 'audio/webm',
        attachments: aiMediaAttachments.map(a => ({
          base64: a.base64,
          mimeType: a.mimeType,
          fileName: a.name,
          type: a.type
        })),
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
      console.error('Erro ao gerar plano multimodal com IA:', err);
      alert('Falha ao gerar plano: ' + (err?.message || 'Tente fornecer mais detalhes.'));
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Criação do Card no Supabase com Upload de Mídias
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

      // Fazer upload das mídias anexadas para o Supabase Storage (se houver)
      let mediaMarkdownLinks = '';
      if (aiMediaAttachments.length > 0) {
        const uploadedLinks: string[] = [];
        for (const att of aiMediaAttachments) {
          try {
            const byteCharacters = atob(att.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: att.mimeType });
            const fileExt = att.name.split('.').pop() || (att.type === 'image' ? 'png' : 'mp4');
            const safeName = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${fileExt}`;
            const filePath = `crm_cards/${boardId}/${safeName}`;

            const { data: uploadData, error: uploadErr } = await supabase.storage
              .from('chat_media')
              .upload(filePath, blob, { contentType: att.mimeType, upsert: true });

            if (!uploadErr && uploadData) {
              const { data: { publicUrl } } = supabase.storage.from('chat_media').getPublicUrl(filePath);
              if (att.type === 'image') {
                uploadedLinks.push(`![${att.name}](${publicUrl})`);
              } else if (att.type === 'video') {
                uploadedLinks.push(`🎥 [Vídeo: ${att.name}](${publicUrl})`);
              } else {
                uploadedLinks.push(`🎙️ [Áudio: ${att.name}](${publicUrl})`);
              }
            }
          } catch (uploadException) {
            console.warn('Erro ao fazer upload da mídia anexada:', uploadException);
          }
        }

        if (uploadedLinks.length > 0) {
          mediaMarkdownLinks = `\n\n---\n### 📎 Mídias & Evidências Anexadas\n${uploadedLinks.join('\n\n')}`;
        }
      }

      const fullNotes = `${generatedPlan.summary}\n\n${generatedPlan.technical_plan}${mediaMarkdownLinks}`;

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
        notes: fullNotes
      };

      const { data, error } = await supabase
        .from('crm_leads')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      setLeads(prev => [...prev, data]);
      await clearCardDraft(boardId);
      setIsAiCardModalOpen(false);
      setGeneratedPlan(null);
      setAiCardPrompt('');
      setRecordedAudioBase64(null);
      setRecordedAudioMimeType(null);
      setAiMediaAttachments([]);
      setHasRecoveredDraft(false);
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

  // Sincronização em Tempo Real Multi-dispositivos (Supabase Realtime)
  useEffect(() => {
    if (!boardId) return;

    console.log(`[Kanban Realtime] Conectando canal para o quadro ${boardId}...`);

    const channel = supabase.channel(`crm_kanban:${boardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crm_leads',
          filter: `board_id=eq.${boardId}`
        },
        (payload) => {
          console.log('[Kanban Realtime] Evento recebido em crm_leads:', payload.eventType, payload);

          if (payload.eventType === 'INSERT') {
            const newLead: CRMLead = {
              ...payload.new as any,
              tags: Array.isArray(payload.new.tags) ? payload.new.tags : [],
              history: Array.isArray(payload.new.history) ? payload.new.history : []
            };
            setLeads(prev => {
              if (prev.some(l => l.id === newLead.id)) {
                return prev.map(l => l.id === newLead.id ? newLead : l);
              }
              return [...prev, newLead].sort((a, b) => (a.position || 0) - (b.position || 0));
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedLead: CRMLead = {
              ...payload.new as any,
              tags: Array.isArray(payload.new.tags) ? payload.new.tags : [],
              history: Array.isArray(payload.new.history) ? payload.new.history : []
            };

            setLeads(prev => {
              const exists = prev.some(l => l.id === updatedLead.id);
              if (!exists) {
                return [...prev, updatedLead].sort((a, b) => (a.position || 0) - (b.position || 0));
              }
              return prev.map(l => l.id === updatedLead.id ? { ...l, ...updatedLead } : l)
                .sort((a, b) => (a.position || 0) - (b.position || 0));
            });

            // Se o card atualizado estiver aberto no modal de detalhes, atualiza os dados em tempo real
            setSelectedLead(currentSelected => {
              if (currentSelected && currentSelected.id === updatedLead.id) {
                return { ...currentSelected, ...updatedLead };
              }
              return currentSelected;
            });
          } else if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.id;
            if (oldId) {
              setLeads(prev => prev.filter(l => l.id !== oldId));
              setSelectedLead(currentSelected => {
                if (currentSelected && currentSelected.id === oldId) {
                  return null;
                }
                return currentSelected;
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'crm_boards',
          filter: `id=eq.${boardId}`
        },
        (payload) => {
          console.log('[Kanban Realtime] Quadro atualizado em tempo real:', payload.new);
          if (payload.new) {
            setBoard(payload.new as any);
            setEditBoardForm({
              name: payload.new.name,
              description: payload.new.config?.description || '',
              stages: payload.new.config?.stages || []
            });
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Kanban Realtime] Status do canal crm_kanban:${boardId}:`, status);
        if (status === 'SUBSCRIBED') {
          setIsRealtimeConnected(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsRealtimeConnected(false);
        }
      });

    return () => {
      console.log(`[Kanban Realtime] Desconectando canal crm_kanban:${boardId}...`);
      supabase.removeChannel(channel);
    };
  }, [boardId]);

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
        notes: leadForm.notes || null,
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
        tagsString: '',
        notes: ''
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

  // Upload de Mídia / Evidência para o Lead Selecionado
  const handleUploadMediaToLead = async (file: File) => {
    if (!selectedLead || !boardId) return;
    try {
      setIsUploadingMedia(true);
      const fileExt = file.name.split('.').pop() || (file.type.startsWith('image/') ? 'png' : file.type.startsWith('video/') ? 'mp4' : 'mp3');
      const safeName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const filePath = `crm_cards/${boardId}/${safeName}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('chat_media')
        .upload(filePath, file, { contentType: file.type, upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from('chat_media').getPublicUrl(filePath);

      let mdLink = '';
      if (file.type.startsWith('image/')) {
        mdLink = `![${file.name}](${publicUrl})`;
      } else if (file.type.startsWith('video/')) {
        mdLink = `🎥 [Vídeo: ${file.name}](${publicUrl})`;
      } else {
        mdLink = `🎙️ [Áudio: ${file.name}](${publicUrl})`;
      }

      const currentNotes = selectedLead.notes || '';
      let newNotes = '';
      if (currentNotes.includes('### 📎 Mídias & Evidências Anexadas')) {
        newNotes = currentNotes.replace('### 📎 Mídias & Evidências Anexadas', `### 📎 Mídias & Evidências Anexadas\n${mdLink}`);
      } else {
        newNotes = `${currentNotes}\n\n---\n### 📎 Mídias & Evidências Anexadas\n${mdLink}`;
      }

      await handleSaveLeadEdits({ ...selectedLead, notes: newNotes });
    } catch (err: any) {
      console.error('Erro ao fazer upload da evidência:', err);
      alert('Erro ao anexar mídia: ' + (err?.message || 'Falha no upload'));
    } finally {
      setIsUploadingMedia(false);
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
      
      {/* Cabeçalho Kanban SaaS Premium (Apple / Linear / Vercel Level) */}
      <header className="shrink-0 flex flex-col gap-4 px-6 lg:px-8 py-4 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/80 dark:bg-[#0c1317]/85 backdrop-blur-2xl select-none z-10 shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
        {/* Linha 1: Identidade do Quadro & Botões Principais de Criação */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 shrink-0 ring-4 ring-indigo-500/10">
              <Sparkles size={20} className="animate-pulse text-amber-300" />
            </div>
            <div className="text-left min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg lg:text-xl font-black tracking-tight text-slate-900 dark:text-white font-sans truncate">
                  {board.name}
                </h1>
                <span className="text-[9.5px] px-2.5 py-0.5 bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-cyan-500/10 dark:from-violet-500/20 dark:to-cyan-500/20 text-indigo-600 dark:text-indigo-300 font-black uppercase rounded-lg border border-indigo-500/25 tracking-wider flex items-center gap-1.5 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  Kanban
                </span>
                <span className="text-[10px] px-2.5 py-0.5 bg-slate-100/90 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 font-bold rounded-lg border border-slate-200/80 dark:border-white/[0.08]">
                  {leads.length} {leads.length === 1 ? 'cartão' : 'cartões'}
                </span>
                <span className={cn(
                  "flex items-center gap-1.5 text-[9.5px] px-2.5 py-0.5 rounded-lg font-black border tracking-wider uppercase transition-colors shadow-xs",
                  isRealtimeConnected 
                    ? "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/25"
                    : "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/25"
                )}
                title={isRealtimeConnected ? "Sincronização em tempo real ativa em todos os dispositivos" : "Conectando ao canal em tempo real..."}
                >
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    isRealtimeConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500 animate-ping"
                  )} />
                  <span>{isRealtimeConnected ? 'Realtime Ativo' : 'Sincronizando'}</span>
                </span>
              </div>
              <p className="text-[11.5px] text-slate-500 dark:text-slate-400 font-sans font-medium mt-0.5 truncate max-w-2xl">
                {board.config?.description || 'Arraste e solte cartões para gerenciar tarefas e avançar fluxos'}
              </p>
            </div>
          </div>

          {/* Botões de Ação Primária em Destaque (Mobile-First Responsivo WCAG 48px lado a lado) */}
          <div className="grid grid-cols-2 gap-2.5 w-full sm:w-auto sm:flex sm:items-center shrink-0">
            <button 
              onClick={() => {
                setGeneratedPlan(null);
                setAiCardPrompt('');
                setSelectedTargetStage(pipelineStages[0]?.id || '');
                setIsAiCardModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-200 hover:scale-[1.02] active:scale-95 cursor-pointer ring-2 ring-white/20 min-h-[48px] sm:min-h-0 flex-1 sm:flex-initial"
            >
              <Mic size={15} className="text-amber-300 animate-pulse shrink-0" />
              <span className="truncate">Criar com Áudio & IA</span>
              <Sparkles size={13} className="text-amber-300 shrink-0 hidden sm:inline" />
            </button>

            <button 
              onClick={() => {
                setLeadForm(prev => ({ ...prev, status: pipelineStages[0]?.id || '' }));
                setIsAddLeadOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-95 cursor-pointer min-h-[48px] sm:min-h-0 flex-1 sm:flex-initial"
            >
              <Plus size={15} strokeWidth={2.5} className="shrink-0" />
              <span className="truncate">Novo Cartão</span>
            </button>
          </div>
        </div>

        {/* Linha 2: Barra de Ferramentas em Linha Única (Busca, Filtros, IconButton de Configurações) */}
        <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-slate-200/60 dark:border-white/[0.06] flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {/* Busca */}
            <div className="relative flex-1 min-w-[140px] sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={14} />
              <input 
                type="text" 
                placeholder="Pesquisar cartão..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2 w-full bg-slate-100/90 dark:bg-[#182229]/70 border border-slate-200/80 dark:border-white/[0.08] rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-slate-800 dark:text-slate-200 transition-all duration-200 shadow-xs"
              />
            </div>

            {/* Filtro de Agente */}
            <div className="relative shrink-0 select-none">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100/90 dark:bg-[#182229]/70 border border-slate-200/80 dark:border-white/[0.08] rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-indigo-500/50 transition-colors shadow-xs">
                <User size={13} className="text-slate-400 shrink-0" />
                <select 
                  value={selectedAgentFilter}
                  onChange={e => setSelectedAgentFilter(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer pr-1 max-w-[120px] sm:max-w-none truncate"
                >
                  <option value="all">Todos os Agentes</option>
                  <option value="unassigned">Não Atribuídos</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.full_name || a.email}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* IconButton Configurações do Quadro */}
          <div className="flex items-center shrink-0">
            <button
              onClick={() => setIsEditBoardOpen(true)}
              className="p-2.5 bg-slate-100/90 dark:bg-[#182229]/70 hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-200/80 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 rounded-xl transition-all duration-200 cursor-pointer shadow-xs hover:scale-105 active:scale-95"
              title="Configurações do Quadro"
              aria-label="Configurações do Quadro"
            >
              <Settings size={15} />
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
                onClick={() => toggleStageCollapse(stage.id, false)}
                className={cn(
                  "w-[68px] shrink-0 flex flex-col h-full bg-white/60 dark:bg-[#111b21]/60 backdrop-blur-xl rounded-[28px] border border-slate-200/80 dark:border-white/[0.08] overflow-hidden transition-all duration-300 cursor-pointer hover:shadow-lg select-none hover:border-indigo-500/40"
                )}
              >
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 to-purple-500" />
                <div className="flex-1 flex flex-col items-center justify-between py-6 h-full relative">
                  <div className="flex flex-col items-center gap-4">
                    <ChevronRight size={16} strokeWidth={3} className={colors.text} />
                    <span className={cn("text-[9.5px] font-black px-2 py-0.5 rounded-full border", colors.badge)}>
                      {colLeads.length}
                    </span>
                  </div>
                  
                  <div className={cn("rotate-90 origin-center whitespace-nowrap text-[11px] font-black uppercase tracking-wider py-4 my-auto select-none", colors.text)}>
                    {stage.label}
                  </div>
                  
                  <div className="text-[8.5px] tracking-widest font-black text-slate-400 dark:text-slate-500 uppercase">
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
                "w-[315px] shrink-0 flex flex-col h-full bg-slate-100/80 dark:bg-[#111b21]/75 backdrop-blur-2xl rounded-[28px] border border-slate-200/80 dark:border-white/[0.08] overflow-hidden transition-all duration-300 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)]",
                isOver && "border-indigo-500/60 dark:border-indigo-400/60 bg-indigo-500/[0.04] dark:bg-indigo-500/[0.06] shadow-[0_0_30px_rgba(99,102,241,0.15)]"
              )}
            >
              {/* Top Accent Gradient Line */}
              <div className={cn("h-1.5 w-full bg-gradient-to-r", colors.glowGradient)} />

              {/* Cabeçalho da Coluna - Minimalist Premium */}
              <div className="p-4 flex items-center justify-between shrink-0 select-none border-b border-slate-200/60 dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", colors.dot)} />
                  <div className="min-w-0 text-left">
                    <h3 className="text-[13px] font-black truncate font-sans tracking-tight leading-tight flex items-center gap-2 text-slate-900 dark:text-white">
                      {stage.label}
                      <span className={cn("px-2.5 py-0.5 rounded-full text-[9.5px] font-black shrink-0", colors.badge)}>
                        {colLeads.length}
                      </span>
                    </h3>
                    {stage.subtitle && (
                      <p className="text-[9.5px] text-slate-400 dark:text-slate-500 truncate leading-tight mt-0.5 font-bold uppercase tracking-wider">
                        {stage.subtitle}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Ações da Coluna */}
                <div className="flex items-center gap-1 shrink-0">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStageCollapse(stage.id, true);
                    }}
                    className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/10 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                    title="Dobrar Coluna"
                  >
                    <ChevronLeft size={13} strokeWidth={2.5} />
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
                    className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/10 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                    title="Editar Etapa"
                  >
                    <Sliders size={13} strokeWidth={2.5} />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setLeadForm(prev => ({ ...prev, status: stage.id }));
                      setIsAddLeadOpen(true);
                    }}
                    className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-white/10 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                    title="Criar Cartão"
                  >
                    <Plus size={13} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {/* Lista de Cartões */}
              <div 
                onDragOver={e => handleDragOver(e, stage.id)}
                onDragEnter={e => e.preventDefault()}
                onDrop={e => handleDrop(e, stage.id)}
                className="flex-1 overflow-y-auto p-3 space-y-3.5 custom-scrollbar flex flex-col"
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
                          className="border-2 border-dashed border-indigo-500/50 dark:border-indigo-400/40 bg-indigo-50/20 dark:bg-indigo-950/20 h-[115px] rounded-2xl animate-pulse transition-all duration-200" 
                        />
                      );
                    }

                    const clientContact = contacts.find(c => c.id === lead.customer_id);
                    const agentObj = agents.find(a => a.id === lead.agent_id);
                    const isBeingDragged = draggedLeadId === lead.id;

                    const priorityAccent = lead.priority === 3 
                      ? "bg-gradient-to-b from-rose-500 to-pink-600 shadow-[0_0_10px_rgba(244,63,94,0.4)]" 
                      : lead.priority === 2 
                        ? "bg-gradient-to-b from-amber-400 to-orange-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]" 
                        : "bg-gradient-to-b from-indigo-400/60 to-purple-500/40";

                    const { category, cleanTitle } = parseCardHeaderInfo(lead.title);
                    const summarySnippet = getLeadSummarySnippet(lead.notes);
                    const cardMediaList = extractCardMedia(lead.notes);
                    const hasMedia = cardMediaList.length > 0;
                    const hasTechnicalExecution = Boolean((lead.notes && (lead.notes.includes('DETALHAMENTO TÉCNICO') || lead.notes.includes('🛠️') || lead.notes.includes('Registro de Entrega'))) || lead.tags?.includes('IA-ENTREGUE') || lead.tags?.includes('DEV-EXECUTADO'));
                    const visibleTags = (lead.tags || []).filter(t => t !== 'IA-PLANO' && t !== 'IA-ENTREGUE' && t !== 'DEV-EXECUTADO' && t !== category);
                    const topTags = visibleTags.slice(0, 2);
                    const remainingTagsCount = visibleTags.length - topTags.length;

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
                            "group/card bg-white/95 dark:bg-[#182229]/90 backdrop-blur-xl p-4 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.25)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)] hover:border-indigo-500/40 dark:hover:border-indigo-400/40 hover:-translate-y-1 transition-all duration-300 cursor-grab active:cursor-grabbing relative overflow-hidden flex flex-col gap-2.5",
                            isBeingDragged && "border-2 border-dashed border-indigo-500/50 dark:border-indigo-400/40 bg-indigo-50/40 dark:bg-indigo-950/30 opacity-40 shadow-inner rotate-[1.5deg] scale-[0.98]"
                          )}
                        >
                          {/* Priority Indicator Pill Strip (Esquerda) */}
                          <div className={cn("absolute left-0 top-3 bottom-3 w-1.5 rounded-r-full", priorityAccent)} />

                          {/* Hover Action Toolbar */}
                          <div className="opacity-0 group-hover/card:opacity-100 transition-all absolute top-2.5 right-2.5 flex bg-slate-900/90 dark:bg-black/90 backdrop-blur-md px-2 py-1.5 rounded-xl gap-2 z-10 text-white shadow-xl border border-white/15 scale-90 group-hover/card:scale-100 duration-200 ease-out">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLead(lead.id);
                              }}
                              className="p-1 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Excluir Card"
                            >
                              <Trash2 size={12} />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyLead(lead);
                              }}
                              className="p-1 hover:text-indigo-400 transition-colors cursor-pointer"
                              title="Copiar Card"
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

                          {/* Linha 1: Data de Criação + Badges de Categoria & Mídia */}
                          <div className="flex items-center gap-1.5 flex-wrap pl-2 pr-6">
                            <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-100/90 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400 text-[9px] rounded-md border border-slate-200/50 dark:border-white/[0.05] font-semibold shrink-0">
                              <Clock size={9.5} className="text-indigo-500" />
                              <span>{lead.created_at ? format(new Date(lead.created_at), 'dd/MM • HH:mm') : '--/--'}</span>
                            </div>

                            {category && (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/25 font-black text-[8.5px] uppercase tracking-wider truncate max-w-[150px]">
                                {category}
                              </span>
                            )}

                            {hasMedia && (
                              <span className="px-1.5 py-0.5 rounded-md bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/20 text-[8.5px] font-black flex items-center gap-1 shrink-0 shadow-xs" title={`${cardMediaList.length} mídia(s) anexada(s)`}>
                                <Paperclip size={9.5} />
                                <span>{cardMediaList.length} {cardMediaList.length === 1 ? 'Mídia' : 'Mídias'}</span>
                              </span>
                            )}
                          </div>

                          {/* Linha 2: Avatar + Título Principal */}
                          <div className="flex gap-2.5 items-start pl-2">
                            {/* Avatar do Contato / Inicial */}
                            <div className="relative shrink-0 select-none mt-0.5">
                              {clientContact?.profile_picture_url ? (
                                <img 
                                  src={clientContact.profile_picture_url} 
                                  alt={lead.title}
                                  className="w-8 h-8 rounded-xl object-cover border border-slate-200/60 dark:border-white/10 shadow-sm"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500/15 to-purple-500/15 text-indigo-600 dark:text-indigo-300 text-xs font-black uppercase flex items-center justify-center border border-indigo-500/25 shadow-sm">
                                  {cleanTitle.split(' ').map(n => n[0]).slice(0, 2).join('') || 'C'}
                                </div>
                              )}
                              <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-[#00a884] border-2 border-white dark:border-[#182229] flex items-center justify-center shadow-sm">
                                <svg viewBox="0 0 24 24" className="w-1.5 h-1.5 text-white fill-current">
                                  <path d="M12.012 2C6.48 2 2 6.48 2 12.012c0 1.767.46 3.427 1.264 4.887L2 22l5.244-1.378a9.96 9.96 0 004.768 1.205C17.52 21.827 22 17.348 22 11.816 22 6.48 17.52 2 12.012 2zm5.727 14.152c-.244.69-1.42 1.264-1.94 1.31-.444.04-1.012.064-2.825-.69-2.31-.96-3.8-3.32-3.916-3.48-.117-.16-.94-1.258-.94-2.4 0-1.144.597-1.706.812-1.942.215-.236.467-.294.622-.294.156 0 .313 0 .445.006.14.006.33.006.505.428.182.434.622 1.517.676 1.63.053.112.09.243.013.397-.076.155-.117.25-.235.39-.117.14-.244.31-.35.42-.116.12-.238.25-.102.484.137.234.61 1.008 1.31 1.63.9.799 1.656 1.047 1.89 1.164.234.118.39.176.446.275.059.098.059.569-.185 1.259z" />
                                </svg>
                              </span>
                            </div>

                            {/* Título */}
                            <div className="flex-1 min-w-0 text-left">
                              <h4 className="text-[13px] font-extrabold text-slate-900 dark:text-slate-100 leading-snug tracking-tight line-clamp-2">
                                {cleanTitle}
                              </h4>
                            </div>
                          </div>

                          {/* Linha 3: Resumo Executivo / O que o card faz (Sem precisar abrir) */}
                          {summarySnippet && (
                            <div className="pl-2 pr-1">
                              <p className="text-[11px] text-slate-600 dark:text-slate-300/90 font-sans font-normal leading-relaxed line-clamp-2 bg-slate-50/70 dark:bg-black/20 p-2 rounded-xl border border-slate-200/40 dark:border-white/5">
                                {summarySnippet}
                              </p>
                            </div>
                          )}

                          {/* Miniatura das Evidências Anexadas no Card */}
                          {cardMediaList.length > 0 && (
                            <div className="pl-2 pr-1 flex items-center gap-1.5 overflow-hidden">
                              {cardMediaList.slice(0, 3).map((m, idx) => (
                                <div key={idx} className="relative w-8 h-8 rounded-lg overflow-hidden border border-slate-200/80 dark:border-white/10 shrink-0 bg-slate-100 dark:bg-black/30">
                                  {m.type === 'image' ? (
                                    <img src={m.url} alt={m.name} className="w-full h-full object-cover" loading="lazy" />
                                  ) : m.type === 'video' ? (
                                    <div className="w-full h-full flex items-center justify-center text-amber-500 bg-black/40">
                                      <Film size={12} />
                                    </div>
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-purple-500 bg-black/40">
                                      <Mic size={12} />
                                    </div>
                                  )}
                                </div>
                              ))}
                              {cardMediaList.length > 3 && (
                                <div className="w-8 h-8 rounded-lg border border-slate-200/80 dark:border-white/10 shrink-0 bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 flex items-center justify-center text-[9.5px] font-black">
                                  +{cardMediaList.length - 3}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Linha 4: Micro-Badges de Status (Prioridade, Probabilidade, Entrega Técnica, Faturamento) */}
                          <div className="flex items-center gap-1.5 flex-wrap pl-2 pt-0.5">
                            {/* Estrelas de Prioridade */}
                            <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100/80 dark:bg-white/[0.04] rounded-md border border-slate-200/40 dark:border-white/5">
                              {Array.from({ length: 3 }).map((_, i) => (
                                <Star 
                                  key={i} 
                                  size={10} 
                                  className={cn(
                                    "shrink-0",
                                    i < lead.priority 
                                      ? "fill-amber-400 text-amber-400" 
                                      : "text-slate-200 dark:text-slate-700"
                                  )} 
                                />
                              ))}
                            </div>

                            {/* Selo Técnico / IA Entregue */}
                            {hasTechnicalExecution && (
                              <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 text-[8.5px] font-black uppercase tracking-wider flex items-center gap-1 shadow-xs">
                                <CheckCircle2 size={10} />
                                Técnico OK
                              </span>
                            )}

                            {/* Probabilidade */}
                            {board.config?.features?.probability && (
                              <span className="text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider text-[8.5px] px-1.5 py-0.5 bg-slate-100 dark:bg-white/[0.04] rounded-md border border-slate-200/40 dark:border-white/5">
                                📈 {lead.probability}%
                              </span>
                            )}

                            {/* Faturamento (se houver) */}
                            {Number(lead.estimated_revenue || 0) > 0 && (
                              <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-black text-[9px] rounded-md border border-emerald-500/25 shrink-0">
                                R$ {Number(lead.estimated_revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                              </span>
                            )}
                          </div>

                          {/* Linha 5: Tags Resumidas Inteligentes (+N mais) */}
                          {visibleTags.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap pl-2">
                              {topTags.map((t, idx) => (
                                <span 
                                  key={idx} 
                                  className="px-1.5 py-0.5 bg-slate-100/90 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-white/[0.08] text-[8.5px] font-black uppercase rounded-md tracking-wider truncate max-w-[120px]"
                                >
                                  #{t}
                                </span>
                              ))}
                              {remainingTagsCount > 0 && (
                                <span 
                                  className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20 text-[8px] font-black uppercase rounded-md tracking-wider"
                                  title={visibleTags.slice(2).join(', ')}
                                >
                                  +{remainingTagsCount}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Linha 6: Rodapé com Prazo, Agente e Botão Avançar */}
                          <div className="mt-1 pt-2 border-t border-slate-200/60 dark:border-white/[0.06] flex items-center justify-between pl-2">
                            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-[9px] font-semibold">
                              <Calendar size={10.5} className="text-slate-400" />
                              <span>{lead.due_date ? format(new Date(lead.due_date), 'dd/MM/yy') : 'Sem prazo'}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              {agentObj && (
                                <span 
                                  className="w-5 h-5 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-white text-[8.5px] font-black uppercase flex items-center justify-center border border-white dark:border-[#182229] shadow-sm"
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
                                  className="group/btn text-[9.5px] font-black uppercase text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 hover:scale-105 active:scale-95 transition-all cursor-pointer bg-indigo-500/10 dark:bg-indigo-500/15 hover:bg-indigo-500/20 px-2 py-1 rounded-lg border border-indigo-500/20"
                                >
                                  <span>Avançar</span>
                                  <ChevronRight size={10} strokeWidth={3} className="transition-transform group-hover/btn:translate-x-0.5" />
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
                          className="border-2 border-dashed border-indigo-500/50 dark:border-indigo-400/40 bg-indigo-50/20 dark:bg-indigo-950/20 h-[115px] rounded-2xl animate-pulse transition-all duration-200" 
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
                        className="my-auto py-9 px-4 border-2 border-dashed border-slate-200/80 dark:border-white/[0.08] rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/[0.04] dark:hover:bg-indigo-500/[0.06] transition-all group/empty"
                      >
                        <div className="w-11 h-11 rounded-2xl bg-white/80 dark:bg-white/[0.06] flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover/empty:scale-110 group-hover/empty:text-indigo-500 transition-all mb-2.5 shadow-sm border border-slate-200/60 dark:border-white/[0.06]">
                          <Layers size={20} />
                        </div>
                        <p className="text-xs font-black text-slate-800 dark:text-slate-200">
                          Nenhum item nesta etapa
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
                          Arraste ou clique para criar
                        </p>
                        <span className="mt-3.5 inline-flex items-center gap-1.5 text-[9.5px] font-black uppercase text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/25 group-hover/empty:bg-indigo-600 group-hover/empty:text-white transition-all shadow-xs">
                          <Plus size={11} strokeWidth={3} />
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
                        className="border-2 border-dashed border-indigo-500/50 dark:border-indigo-400/40 bg-indigo-50/20 dark:bg-indigo-950/20 h-[115px] rounded-2xl animate-pulse transition-all duration-200" 
                      />
                    );
                  }

                  return itemsToRender;
                })()}
              </div>

              {/* Rodapé da Coluna Inteligente */}
              <div className="p-3.5 border-t border-slate-200/60 dark:border-white/[0.06] bg-white/30 dark:bg-white/[0.02] shrink-0 flex items-center justify-between text-[10px]">
                <span className="text-slate-400 dark:text-slate-500 font-black uppercase tracking-wider text-[9px]">
                  {colRevenue > 0 ? 'Total Estimado' : 'Total de Itens'}
                </span>
                {colRevenue > 0 ? (
                  <span className="px-2.5 py-0.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-black rounded-lg border border-emerald-500/25 shadow-xs">
                    R$ {colRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                ) : (
                  <span className="font-black text-slate-600 dark:text-slate-400 text-[10.5px]">
                    {colLeads.length} {colLeads.length === 1 ? 'item' : 'itens'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL: Adicionar Oportunidade / Cartão */}
      {isAddLeadOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111b21] w-full max-w-3xl rounded-[28px] border border-slate-200/50 dark:border-white/5 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-inner">
                  <Plus size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 font-sans uppercase tracking-wider">Nova Oportunidade / Cartão</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Crie cards estruturados com suporte a texto rico e assistência de I.A</p>
                </div>
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
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Título da Oportunidade / Tarefa *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ex: [Frontend] Nova tela de relatórios ou Nome do Cliente"
                    value={leadForm.title}
                    onChange={e => setLeadForm({ ...leadForm, title: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-[#202c33]/40 border border-slate-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-800 dark:text-slate-200 transition-all duration-300"
                  />
                </div>

                {/* Editor de Texto Rico com IA Gemini */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">
                      Descrição, Requisitos & Checklist
                    </label>
                    <span className="text-[9.5px] text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1">
                      <Sparkles size={11} /> IA Integrada
                    </span>
                  </div>
                  <RichTextEditor
                    value={leadForm.notes}
                    onChange={notes => setLeadForm(prev => ({ ...prev, notes }))}
                    cardTitle={leadForm.title}
                    placeholder="Descreva detalhes, requisitos técnicos ou clique em 'Assistente IA' para estruturar o plano automaticamente..."
                    minHeight="140px"
                    maxHeight="240px"
                    onSuggestTagsAndPriority={({ tags, priority }) => {
                      setLeadForm(prev => ({
                        ...prev,
                        tagsString: Array.from(new Set([...(prev.tagsString ? prev.tagsString.split(',').map(t => t.trim()) : []), ...tags])).join(', '),
                        priority: priority || prev.priority
                      }));
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Prioridade</label>
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
                  <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">Vincular Contato do WhatsApp (Opcional)</label>
                  <select 
                    value={leadForm.customer_id}
                    onChange={e => setLeadForm({ ...leadForm, customer_id: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-100/60 dark:bg-[#202c33]/40 border border-slate-200/50 dark:border-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-855 dark:text-slate-200 cursor-pointer appearance-none"
                  >
                    <option value="">Nenhum contato vinculado</option>
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>{c.custom_name || c.name} ({c.phone})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    placeholder="Ex: Frontend, React, UI/UX"
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
            <div className="bg-white dark:bg-[#111b21] w-full max-w-4xl rounded-t-[32px] sm:rounded-[28px] border border-slate-200/80 dark:border-white/10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[94vh] sm:max-h-[90vh]">
              
              {/* Header do Dashboard Executivo */}
              <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-200/50 dark:border-white/5 flex items-center justify-between shrink-0 bg-slate-50/70 dark:bg-[#0c1317]/80 backdrop-blur-xl">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={cn(
                    "w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg shrink-0",
                    selectedLead.status === 'testing'
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 shadow-amber-500/10"
                      : selectedLead.status === 'development'
                        ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 shadow-indigo-500/10"
                        : selectedLead.status === 'analysis'
                          ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/25 shadow-sky-500/10"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 shadow-emerald-500/10"
                  )}>
                    {selectedLead.status === 'testing' ? (
                      <Cpu size={22} className="animate-pulse" />
                    ) : selectedLead.status === 'development' ? (
                      <Wand2 size={22} />
                    ) : (
                      <Sparkles size={22} />
                    )}
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                        currentStageObj ? getColorClasses(currentStageObj.color).badge : "bg-slate-100 text-slate-600 border-slate-200"
                      )}>
                        {currentStageObj?.label || selectedLead.status}
                      </span>
                      {hasDeliveryInfo && (
                        <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 size={10} />
                          IA Entregue
                        </span>
                      )}
                      {extractCardMedia(selectedLead.notes).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setLeadDetailTab('notes')}
                          className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition-all cursor-pointer shadow-xs"
                          title="Clique para visualizar o carrossel de mídias e evidências"
                        >
                          <Paperclip size={10} />
                          {extractCardMedia(selectedLead.notes).length} {extractCardMedia(selectedLead.notes).length === 1 ? 'Mídia' : 'Mídias'}
                        </button>
                      )}
                      <span className="text-[10px] text-slate-400 font-mono font-bold">
                        #{selectedLead.id.slice(0, 8)}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 truncate mt-0.5 font-sans">
                      {selectedLead.title}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button 
                    onClick={handleCopyDeliveryText}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                    title="Copiar Relatório Completo para Dev"
                  >
                    {copiedDelivery ? (
                      <>
                        <CheckCheck size={13} className="text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span className="hidden sm:inline">Copiar Relatório</span>
                      </>
                    )}
                  </button>

                  <button 
                    onClick={() => handleCopyLead(selectedLead)}
                    className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-white/5 rounded-xl transition-all cursor-pointer"
                    title="Duplicar Card"
                  >
                    <Copy size={15} />
                  </button>
                  <button 
                    onClick={() => handleDeleteLead(selectedLead.id)}
                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                    title="Excluir Card"
                  >
                    <Trash2 size={15} />
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

              {/* Top KPI Banner (4 Mini-Dashboards Organizados) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 p-4 sm:p-5 bg-slate-100/50 dark:bg-[#0c1317]/50 border-b border-slate-200/50 dark:border-white/5 shrink-0 text-left">
                {/* KPI 1: Estágio do Fluxo */}
                <div className="p-3 bg-white dark:bg-[#182229] rounded-2xl border border-slate-200/60 dark:border-white/5 shadow-xs flex flex-col justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <Layers size={11} className="text-indigo-500" />
                    Coluna / Estágio
                  </span>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                      {currentStageObj?.label || selectedLead.status}
                    </span>
                    <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", currentStageObj ? getColorClasses(currentStageObj.color).dot : "bg-indigo-500")} />
                  </div>
                </div>

                {/* KPI 2: Validação & Build */}
                <div className="p-3 bg-white dark:bg-[#182229] rounded-2xl border border-slate-200/60 dark:border-white/5 shadow-xs flex flex-col justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <ShieldCheck size={11} className="text-emerald-500" />
                    Validação Técnica
                  </span>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 truncate">
                      {deliveryReport?.validation?.type_checking || 'TypeScript: 0 Erros'}
                    </span>
                  </div>
                </div>

                {/* KPI 3: Prioridade & Probabilidade */}
                <div className="p-3 bg-white dark:bg-[#182229] rounded-2xl border border-slate-200/60 dark:border-white/5 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <Star size={11} className="text-amber-500 fill-amber-400" />
                      Prioridade
                    </span>
                    <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400">
                      {selectedLead.probability}%
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className={cn(
                      "text-[10px] font-black uppercase px-2 py-0.5 rounded-md",
                      selectedLead.priority === 3 ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : selectedLead.priority === 2 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    )}>
                      {selectedLead.priority === 3 ? "🔴 Alta" : selectedLead.priority === 2 ? "🟡 Média" : "🟢 Baixa"}
                    </span>
                    <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full" style={{ width: `${selectedLead.probability}%` }} />
                    </div>
                  </div>
                </div>

                {/* KPI 4: Responsável & Prazo */}
                <div className="p-3 bg-white dark:bg-[#182229] rounded-2xl border border-slate-200/60 dark:border-white/5 shadow-xs flex flex-col justify-between">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                    <User size={11} className="text-cyan-500" />
                    Responsável / Prazo
                  </span>
                  <div className="mt-1.5 flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {agents.find(a => a.id === selectedLead.agent_id)?.full_name?.split(' ')[0] || 'Sem responsável'}
                    </span>
                    <span className="text-[9.5px] font-semibold text-slate-400 dark:text-slate-500 shrink-0">
                      {selectedLead.due_date ? format(new Date(selectedLead.due_date), 'dd/MM/yy') : 'Sem prazo'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Segmented Controls / Abas de Navegação */}
              <div className="px-5 sm:px-6 pt-3 pb-2 border-b border-slate-200/40 dark:border-white/5 flex items-center gap-2 overflow-x-auto custom-scrollbar bg-slate-50/30 dark:bg-black/10 shrink-0">
                <button
                  type="button"
                  onClick={() => setLeadDetailTab('overview')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black transition-all duration-200 flex items-center gap-2 shrink-0 cursor-pointer",
                    leadDetailTab === 'overview'
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  <Sliders size={14} />
                  <span>Dashboard & Geral</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLeadDetailTab('technical')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black transition-all duration-200 flex items-center gap-2 shrink-0 cursor-pointer relative",
                    leadDetailTab === 'technical'
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  <Cpu size={14} />
                  <span>Execução & Engenharia IA</span>
                  {hasDeliveryInfo && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setLeadDetailTab('notes')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black transition-all duration-200 flex items-center gap-2 shrink-0 cursor-pointer",
                    leadDetailTab === 'notes'
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  <FileText size={14} />
                  <span>Briefing & Mídias</span>
                  {extractCardMedia(selectedLead.notes).length > 0 && (
                    <span className={cn(
                      "px-1.5 py-0.2 rounded-full text-[9px] font-black",
                      leadDetailTab === 'notes'
                        ? "bg-white/20 text-white"
                        : "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                    )}>
                      {extractCardMedia(selectedLead.notes).length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setLeadDetailTab('history')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black transition-all duration-200 flex items-center gap-2 shrink-0 cursor-pointer",
                    leadDetailTab === 'history'
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  <History size={14} />
                  <span>Linha do Tempo ({selectedLead.history?.length || 0})</span>
                </button>
              </div>

              {/* Conteúdo da Aba Ativa */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 custom-scrollbar text-xs text-left bg-white dark:bg-[#111b21]">
                
                {/* ABA 1: DASHBOARD GERAL & COMERCIAL */}
                {leadDetailTab === 'overview' && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    {/* Título & Faturamento */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px]">Título do Card / Oportunidade</label>
                        <input 
                          type="text" 
                          value={selectedLead.title}
                          onChange={e => handleSaveLeadEdits({ ...selectedLead, title: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-extrabold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white transition-all shadow-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px]">Faturamento Estimado (R$)</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">R$</span>
                          <input 
                            type="number" 
                            value={selectedLead.estimated_revenue}
                            onChange={e => handleSaveLeadEdits({ ...selectedLead, estimated_revenue: Number(e.target.value) })}
                            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-extrabold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white transition-all shadow-xs"
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px]">Coluna / Estágio no Quadro</label>
                        <select 
                          value={selectedLead.status}
                          onChange={e => handleSaveLeadEdits({ ...selectedLead, status: e.target.value })}
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white cursor-pointer shadow-xs"
                        >
                          {pipelineStages.map(s => (
                            <option key={s.id} value={s.id} className="dark:bg-[#111b21]">{s.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px]">Nível de Prioridade</label>
                        <div className="flex items-center gap-1.5 h-[42px] px-2 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/10 rounded-2xl shadow-xs">
                          {[1, 2, 3].map(p => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => handleSaveLeadEdits({ ...selectedLead, priority: p })}
                              className={cn(
                                "flex-1 py-1.5 rounded-xl text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer",
                                selectedLead.priority === p
                                  ? p === 3 
                                    ? "bg-rose-500 text-white shadow-md shadow-rose-500/30"
                                    : p === 2
                                      ? "bg-amber-500 text-white shadow-md shadow-amber-500/30"
                                      : "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
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
                          <label className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px]">Probabilidade de Sucesso</label>
                          <span className="font-black text-indigo-600 dark:text-indigo-400 text-[11px]">{selectedLead.probability}%</span>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px]">Agente / Responsável</label>
                        <select 
                          value={selectedLead.agent_id || ''}
                          onChange={e => handleSaveLeadEdits({ ...selectedLead, agent_id: e.target.value || null })}
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white cursor-pointer shadow-xs"
                        >
                          <option value="" className="dark:bg-[#111b21]">Sem responsável atribuído</option>
                          {agents.map(a => (
                            <option key={a.id} value={a.id} className="dark:bg-[#111b21]">👤 {a.full_name || a.email}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px]">Prazo Limite / Vencimento</label>
                        <input 
                          type="date" 
                          value={selectedLead.due_date || ''}
                          onChange={e => handleSaveLeadEdits({ ...selectedLead, due_date: e.target.value || null })}
                          className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white transition-all shadow-xs"
                        />
                      </div>
                    </div>

                    {/* Tags / Marcadores */}
                    <div className="space-y-1.5">
                      <label className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px]">Tags & Marcadores Técnicos</label>
                      <input 
                        type="text" 
                        value={(selectedLead.tags || []).join(', ')}
                        placeholder="ex: BACKEND, NODE.JS, SESSION-MANAGER, BAILEYS"
                        onChange={e => {
                          const newTags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                          handleSaveLeadEdits({ ...selectedLead, tags: newTags });
                        }}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white transition-all shadow-xs"
                      />
                      {selectedLead.tags && selectedLead.tags.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap pt-1.5">
                          {selectedLead.tags.map((t, idx) => (
                            <span key={idx} className="text-[9.5px] font-black uppercase px-2.5 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Carrossel de Evidências Iniciais Anexadas */}
                    {extractCardMedia(selectedLead.notes).length > 0 && (
                      <div className="space-y-2 pt-3 border-t border-slate-200/60 dark:border-white/5">
                        <div className="flex items-center justify-between">
                          <label className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px] flex items-center gap-1.5">
                            <Paperclip size={12} className="text-purple-500" />
                            Evidências Iniciais & Capturas de Tela
                          </label>
                          <button
                            type="button"
                            onClick={() => setLeadDetailTab('notes')}
                            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <span>Ver no Briefing</span>
                            <ArrowRight size={10} />
                          </button>
                        </div>
                        <CardMediaCarousel 
                          notes={selectedLead.notes} 
                          cardTitle={selectedLead.title}
                          onUploadMedia={handleUploadMediaToLead}
                          isUploading={isUploadingMedia}
                        />
                      </div>
                    )}
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
                      <div className="p-5 bg-slate-50 dark:bg-[#182229] border border-indigo-500/30 rounded-2xl space-y-4 shadow-sm">
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
                                className="px-3.5 py-2 bg-white dark:bg-[#182229] hover:bg-slate-100 dark:hover:bg-[#222e38] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
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
                            <div className="p-3 bg-white/60 dark:bg-[#182229]/60 rounded-xl border border-slate-200/50 dark:border-white/5">
                              <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8.5px] block">📅 Data & Hora do Registro</span>
                              <span className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block">
                                {deliveryReport?.executed_at 
                                  ? format(new Date(deliveryReport.executed_at), 'dd/MM/yyyy HH:mm:ss')
                                  : selectedLead.created_at ? format(new Date(selectedLead.created_at), 'dd/MM/yyyy HH:mm:ss') : 'Hoje'}
                              </span>
                            </div>
                            <div className="p-3 bg-white/60 dark:bg-[#182229]/60 rounded-xl border border-slate-200/50 dark:border-white/5">
                              <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8.5px] block">🤖 Executor da Codificação</span>
                              <span className="font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5 block truncate">
                                {deliveryReport?.executor || 'Desenvolvedor / Antigravity AI'}
                              </span>
                            </div>
                            <div className="p-3 bg-white/60 dark:bg-[#182229]/60 rounded-xl border border-slate-200/50 dark:border-white/5">
                              <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8.5px] block">🔍 Validação & Build</span>
                              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                                <CheckCircle2 size={12} />
                                {deliveryReport?.validation?.type_checking || 'TypeScript: 0 Erros (OK)'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Carrossel de Evidências Anexadas ao Card */}
                        {extractCardMedia(selectedLead.notes).length > 0 && (
                          <div className="space-y-2">
                            <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px] flex items-center gap-1">
                              <Paperclip size={12} className="text-purple-500" />
                              Capturas e Evidências Iniciais da Demanda
                            </label>
                            <CardMediaCarousel 
                              notes={selectedLead.notes} 
                              cardTitle={selectedLead.title}
                              onUploadMedia={handleUploadMediaToLead}
                              isUploading={isUploadingMedia}
                            />
                          </div>
                        )}

                        {/* Resumo da Solução */}
                        <div className="space-y-2">
                          <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px] flex items-center gap-1">
                            <Sparkles size={12} className="text-amber-500" />
                            Resumo Executivo do que foi Codificado & Implementado
                          </label>
                          <div className="p-4 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/10 rounded-2xl text-slate-800 dark:text-slate-200 text-xs leading-relaxed whitespace-pre-wrap font-sans">
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
                                <div key={idx} className="p-4 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/10 rounded-2xl space-y-2">
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
                                  <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed font-sans">
                                    {item.description}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-6 bg-slate-50 dark:bg-[#182229] border border-slate-200/80 dark:border-white/10 rounded-2xl text-center space-y-3">
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

                {/* ABA 3: BRIEFING, NOTAS & MÍDIAS */}
                {leadDetailTab === 'notes' && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    {/* Galeria / Carrossel Interativo de Mídias e Evidências Iniciais */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[9.5px] flex items-center gap-1.5">
                          <Paperclip size={12} className="text-purple-500" />
                          Galeria de Evidências & Mídias Anexadas
                        </label>
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold">
                          {extractCardMedia(selectedLead.notes).length} {extractCardMedia(selectedLead.notes).length === 1 ? 'mídia anexada' : 'mídias anexadas'}
                        </span>
                      </div>

                      <CardMediaCarousel 
                        notes={selectedLead.notes} 
                        cardTitle={selectedLead.title}
                        onUploadMedia={handleUploadMediaToLead}
                        isUploading={isUploadingMedia}
                      />
                    </div>

                    {/* Editor de Texto Rico */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[9px]">
                          Briefing, Requisitos Técnicos & Checklist
                        </label>
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1">
                          <Sparkles size={11} /> Editor com IA Gemini
                        </span>
                      </div>

                      <RichTextEditor
                        value={selectedLead.notes || ''}
                        onChange={notes => handleSaveLeadEdits({ ...selectedLead, notes })}
                        cardTitle={selectedLead.title}
                        placeholder="Adicione observações importantes, escopo técnico, checklist ou use a I.A para estruturar..."
                        minHeight="220px"
                        maxHeight="460px"
                      />
                    </div>
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

                              <div className="p-3.5 bg-slate-50 dark:bg-[#182229] border border-slate-200/60 dark:border-white/5 rounded-xl space-y-1.5">
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
              <div className="px-5 sm:px-6 py-4 border-t border-slate-200/50 dark:border-white/5 bg-slate-50/70 dark:bg-[#0c1317]/80 shrink-0 flex items-center justify-between gap-3">
                {selectedLead.customer_id ? (
                  <button 
                    onClick={() => {
                      useChatStore.getState().setActiveChat(selectedLead.customer_id);
                      navigate('/chat');
                    }}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-emerald-500/15 hover:shadow-emerald-500/25 transition-all active:scale-95 cursor-pointer"
                  >
                    <MessageSquare size={14} />
                    <span>Abrir WhatsApp</span>
                  </button>
                ) : (
                  <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider hidden sm:inline">
                    Sem contato vinculado
                  </span>
                )}

                <div className="flex items-center gap-2">
                  {pipelineStages.findIndex(s => s.id === selectedLead.status) < pipelineStages.length - 1 && (
                    <button 
                      onClick={() => {
                        handleAdvanceLead(selectedLead);
                        setSelectedLead(null);
                      }}
                      className="px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-black rounded-xl text-xs shadow-md shadow-indigo-500/20 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
                    >
                      <span>Avançar Etapa</span>
                      <ChevronRight size={13} strokeWidth={3} />
                    </button>
                  )}

                  <button 
                    onClick={() => setSelectedLead(null)}
                    className="px-5 py-2.5 bg-slate-200/80 hover:bg-slate-300 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-all active:scale-95 cursor-pointer text-xs uppercase tracking-wider"
                  >
                    Fechar
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

      {/* MODAL: Criação Inteligente com Áudio, Fotos, Vídeos & IA Gemini Multimodal (Mobile First) */}
      {isAiCardModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111b21] w-full max-w-2xl rounded-t-[32px] sm:rounded-[28px] border-t sm:border border-slate-200/50 dark:border-white/10 overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] flex flex-col max-h-[94vh] transition-all">
            
            {/* Handle do Mobile (Bottom Sheet) */}
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-2.5 sm:hidden shrink-0" />

            {/* Inputs Ocultos de Mídia */}
            <input 
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  handleAddMediaFiles(e.target.files);
                }
              }}
            />
            <input 
              ref={videoInputRef}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  handleAddMediaFiles(e.target.files);
                }
              }}
            />
            <input 
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  handleAddMediaFiles(e.target.files);
                }
              }}
            />

            {/* Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-200/20 dark:border-white/5 bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-transparent flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
                  <Sparkles size={20} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white font-sans uppercase tracking-wider flex items-center gap-2 flex-wrap">
                    Criar Card Multimodal & IA
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-extrabold border border-indigo-500/30">
                      Gemini 2.5 Multimodal
                    </span>
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                    Grave áudio, anexe fotos/prints ou vídeos. A IA estruturará o plano de engenharia.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  stopAiAudioRecording();
                  setIsAiCardModalOpen(false);
                }} 
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Banner de Rascunho Salvo em Cache */}
            {hasRecoveredDraft && (
              <div className="px-5 py-2 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between text-[11px] text-indigo-300">
                <span className="flex items-center gap-1.5 font-semibold">
                  <RotateCcw size={13} className="text-indigo-400" />
                  Rascunho recuperado automaticamente do cache local
                </span>
                <button
                  type="button"
                  onClick={handleClearDraft}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-200 underline cursor-pointer"
                >
                  Limpar Rascunho
                </button>
              </div>
            )}

            {/* Conteúdo Rolável */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar text-xs">
              
              {/* 1. Gravador de Áudio */}
              <div className="p-4 sm:p-5 rounded-2xl border border-dashed border-indigo-500/30 bg-gradient-to-br from-indigo-500/[0.04] via-purple-500/[0.02] to-transparent flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 w-full sm:w-auto">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-all shrink-0",
                    isAiRecording 
                      ? "bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-500/40 ring-4 ring-rose-500/20" 
                      : recordedAudioBase64
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm"
                        : "bg-gradient-to-tr from-purple-500/20 to-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  )}>
                    {isAiRecording ? <Radio size={24} /> : recordedAudioBase64 ? <Check size={22} /> : <Mic size={24} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-black text-xs text-slate-900 dark:text-white flex items-center gap-2">
                      {isAiRecording ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                          Gravando Áudio... ({aiRecordingSeconds}s)
                        </>
                      ) : recordedAudioBase64 ? (
                        'Áudio Gravado & Salvo no Cache'
                      ) : (
                        'Gravar Ideia por Áudio'
                      )}
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {isAiRecording 
                        ? 'Descreva a funcionalidade e clique em Concluir' 
                        : recordedAudioBase64
                          ? 'Áudio pronto para análise com IA. Você pode regravar se quiser.'
                          : 'Fale pelo microfone para a IA transcrever e estruturar'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  {isAiRecording ? (
                    <button
                      type="button"
                      onClick={stopAiAudioRecording}
                      className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2 text-xs transition-all active:scale-95 cursor-pointer uppercase tracking-wider min-h-[44px]"
                    >
                      <Square size={14} />
                      Concluir Áudio
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isGeneratingPlan}
                      onClick={startAiAudioRecording}
                      className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-black shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 text-xs transition-all active:scale-95 cursor-pointer uppercase tracking-wider min-h-[44px]"
                    >
                      <Mic size={14} />
                      {recordedAudioBase64 ? 'Regravar Áudio' : 'Gravar por Voz'}
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Anexos de Prints, Fotos e Vídeos (Multimodal) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                    <Paperclip size={13} className="text-indigo-400" />
                    Anexar Prints, Fotos ou Vídeos ({aiMediaAttachments.length})
                  </label>
                  <span className="text-[10px] text-slate-400 hidden sm:inline">
                    Cole com <kbd className="px-1.5 py-0.5 bg-white/10 rounded border border-white/10 font-mono text-[9px]">Ctrl+V</kbd>
                  </span>
                </div>

                {/* Botões de Ação para Adicionar Mídia (Mobile-Friendly) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={isUploadingMedia || isGeneratingPlan}
                    className="p-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-center gap-2 font-bold text-slate-700 dark:text-slate-200 text-xs transition-all active:scale-95 cursor-pointer min-h-[46px]"
                  >
                    <ImageIcon size={16} className="text-indigo-400" />
                    <span>Fotos / Prints</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={isUploadingMedia || isGeneratingPlan}
                    className="p-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-center gap-2 font-bold text-slate-700 dark:text-slate-200 text-xs transition-all active:scale-95 cursor-pointer min-h-[46px]"
                  >
                    <VideoIcon size={16} className="text-purple-400" />
                    <span>Vídeos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isUploadingMedia || isGeneratingPlan}
                    className="p-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-center gap-2 font-bold text-slate-700 dark:text-slate-200 text-xs transition-all active:scale-95 cursor-pointer col-span-2 sm:col-span-1 min-h-[46px]"
                  >
                    <Camera size={16} className="text-cyan-400" />
                    <span>Câmera (Mobile)</span>
                  </button>
                </div>

                {/* Grade de Miniaturas de Mídias Anexadas */}
                {aiMediaAttachments.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                    {aiMediaAttachments.map(att => (
                      <div 
                        key={att.id} 
                        className="relative group rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/30 p-1.5 flex flex-col gap-1 shadow-sm"
                      >
                        <div className="h-20 sm:h-24 w-full rounded-xl overflow-hidden bg-slate-200 dark:bg-[#1a242c] flex items-center justify-center relative">
                          {att.type === 'image' ? (
                            <img 
                              src={att.previewUrl || `data:${att.mimeType};base64,${att.base64}`} 
                              alt={att.name}
                              className="w-full h-full object-cover" 
                            />
                          ) : att.type === 'video' ? (
                            <div className="flex flex-col items-center justify-center text-purple-400 gap-1">
                              <FileVideo size={28} />
                              <span className="text-[9px] font-bold uppercase tracking-wider">Vídeo</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-indigo-400 gap-1">
                              <Mic size={28} />
                              <span className="text-[9px] font-bold uppercase tracking-wider">Áudio</span>
                            </div>
                          )}

                          {/* Botão de Remover */}
                          <button
                            type="button"
                            onClick={() => handleRemoveMediaAttachment(att.id)}
                            className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-rose-600 text-white rounded-lg transition-all shadow-md cursor-pointer"
                            title="Remover anexo"
                          >
                            <X size={12} />
                          </button>
                        </div>

                        <div className="px-1 py-0.5">
                          <p className="text-[10px] font-bold text-slate-800 dark:text-slate-200 truncate">{att.name}</p>
                          <p className="text-[9px] text-slate-400">{(att.size / 1024).toFixed(0)} KB</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Entrada de Texto / Descrição Complementar */}
              <div className="space-y-2">
                <label className="font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[10px]">
                  Descreva o que precisa ser desenvolvido ou corrigido:
                </label>
                <textarea 
                  rows={3}
                  value={aiCardPrompt}
                  onChange={e => setAiCardPrompt(e.target.value)}
                  placeholder="Ex: No chat, ao clicar no botão de foto, quero abrir a câmera no mobile e permitir envio direto com pré-visualização no layout..."
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-slate-900 dark:text-white leading-relaxed custom-scrollbar transition-all min-h-[85px]"
                />
                
                <button
                  type="button"
                  disabled={isGeneratingPlan || (!aiCardPrompt.trim() && !recordedAudioBase64 && aiMediaAttachments.length === 0) || isAiRecording}
                  onClick={handleGeneratePlanMultimodal}
                  className="w-full py-3.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white rounded-2xl font-bold shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 text-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer min-h-[48px]"
                >
                  {isGeneratingPlan ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Analisando Áudios, Imagens, Vídeos e Gerando Plano Sênior com IA...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Gerar Plano de Engenharia com IA (Multimodal)
                    </>
                  )}
                </button>
              </div>

              {/* 4. Plano Gerado / Preview Estruturado */}
              {generatedPlan && (
                <div className="p-4 sm:p-5 bg-gradient-to-br from-indigo-500/[0.06] via-purple-500/[0.03] to-transparent border border-indigo-500/25 rounded-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between border-b border-indigo-500/15 pb-3">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                      🎯 Plano de Engenharia Sênior Estruturado
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
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[9px]">Coluna no Quadro</label>
                      <select 
                        value={selectedTargetStage}
                        onChange={e => setSelectedTargetStage(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-[#1a242c] border border-slate-200 dark:border-white/10 rounded-xl text-xs font-bold text-slate-900 dark:text-white cursor-pointer"
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
            <div className="px-5 sm:px-6 py-4 border-t border-slate-200/20 dark:border-white/5 bg-slate-50/50 dark:bg-black/10 shrink-0 flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 justify-end">
              <button 
                type="button" 
                onClick={() => {
                  stopAiAudioRecording();
                  setIsAiCardModalOpen(false);
                }}
                className="w-full sm:w-auto px-5 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 font-bold rounded-xl transition-all duration-200 text-xs active:scale-95 cursor-pointer uppercase tracking-wider min-h-[44px]"
              >
                Cancelar
              </button>
              <button 
                type="button"
                disabled={!generatedPlan || loading}
                onClick={handleConfirmCreateAiCard}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-500/25 transition-all duration-200 text-xs active:scale-95 disabled:opacity-50 cursor-pointer uppercase tracking-wider flex items-center justify-center gap-2 min-h-[44px]"
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Salvando Mídias e Card no Kanban...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
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
