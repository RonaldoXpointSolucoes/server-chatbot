import React, { useState, useEffect, useRef } from 'react';
import { useChatStore, CannedResponseType, QuickReplyCategory } from '../store/chatStore';
import { 
  Plus, Search, Edit2, Trash2, MessageSquareText, Zap, ChevronLeft, Save, 
  Building, Paperclip, Image as ImageIcon, Video, X, Loader2, Copy, Mic, 
  Square, Wand2, CheckCircle2, Sparkles, FileText, ExternalLink, Globe, 
  Play, Film, Folder, FolderPlus, FolderTree, FolderOpen, Layers, 
  ChevronRight, ChevronDown, Hash, Palette, Tag, Filter, CornerDownRight,
  FolderMinus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { uploadResumableFile } from '../services/tusUploader';
import { geminiService } from '../services/geminiService';

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

export const CATEGORY_COLORS = [
  { label: 'Azul', hex: '#3b82f6', bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-500/20' },
  { label: 'Índigo', hex: '#6366f1', bg: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-500/20' },
  { label: 'Roxo', hex: '#8b5cf6', bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-500/20' },
  { label: 'Rosa', hex: '#ec4899', bg: 'bg-pink-500/10', text: 'text-pink-600 dark:text-pink-400', border: 'border-pink-500/20' },
  { label: 'Esmeralda', hex: '#10b981', bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/20' },
  { label: 'Âmbar', hex: '#f59e0b', bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20' },
  { label: 'Ciano', hex: '#06b6d4', bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-500/20' },
  { label: 'Vermelho', hex: '#ef4444', bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/20' },
];

const ExpandableText = ({ content }: { content: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = content.split('\n').length > 3 || content.length > 150;

  return (
    <div className="mt-1">
      <p className={`text-gray-700 dark:text-[#d1d7db] whitespace-pre-wrap ${!isExpanded && isLong ? 'line-clamp-3' : ''}`}>
        {content}
      </p>
      {isLong && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium mt-1.5 transition-colors cursor-pointer"
        >
          {isExpanded ? 'Ver menos' : 'Ver tudo'}
        </button>
      )}
    </div>
  );
};

export function CannedResponses() {
  const navigate = useNavigate();
  const { 
    quickReplies, 
    fetchQuickReplies, 
    addQuickReply, 
    updateQuickReply, 
    deleteQuickReply, 
    addQuickReplyCategory, 
    updateQuickReplyCategory, 
    deleteQuickReplyCategory, 
    tenantInfo 
  } = useChatStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Categorias & Filtros de Navegação
  const categories: QuickReplyCategory[] = tenantInfo?.settings?.quickReplyCategories || [];
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'all' | 'uncategorized' | string>('all');
  const [selectedSubcategoryFilter, setSelectedSubcategoryFilter] = useState<string | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<QuickReplyCategory | null>(null);

  // Form State Categoria
  const [catFormName, setCatFormName] = useState('');
  const [catFormParentId, setCatFormParentId] = useState<string | ''>('');
  const [catFormShortcut, setCatFormShortcut] = useState('');
  const [catFormColor, setCatFormColor] = useState(CATEGORY_COLORS[0].hex);

  // Form State Resposta Pronta
  const [shortcut, setShortcut] = useState('');
  const [content, setContent] = useState('');
  const [responseType, setResponseType] = useState<CannedResponseType>('STANDARD');
  const [selectedCategoryForReply, setSelectedCategoryForReply] = useState<string | ''>('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [mediaType, setMediaType] = useState<string | undefined>(undefined);
  const [videoDuration, setVideoDuration] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [previewMedia, setPreviewMedia] = useState<{ url: string, type: 'video' | 'image' | 'audio' | 'document' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados para Preview de Link Premium
  const [detectedLink, setDetectedLink] = useState<string | null>(null);
  const [linkPreviewData, setLinkPreviewData] = useState<{
    title: string | null;
    description: string | null;
    url: string;
    image: string | null;
    jpegThumbnail: string | null;
  } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Estados locais para Assistente I.A. & RAG pgvector
  const [ragDocuments, setRagDocuments] = useState<any[]>([]);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiGeneratedResult, setAiGeneratedResult] = useState<{ text: string, shortcut: string } | null>(null);
  const [selectedRagDocIds, setSelectedRagDocIds] = useState<string[]>([]);
  const [aiTone, setAiTone] = useState<string>('professional');
  const [ragMatches, setRagMatches] = useState<any[]>([]);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], `recorded_audio_${Date.now()}.webm`, { type: 'audio/webm' });
        setMediaFile(file);
        setMediaUrl(URL.createObjectURL(file));
        setMediaType('audio');
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (err) {
      console.error("Erro ao acessar microfone", err);
      alert("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  useEffect(() => {
    fetchQuickReplies();
  }, [fetchQuickReplies]);

  // Efeito para carregar as bases de conhecimento RAG
  useEffect(() => {
    const fetchRagDocs = async () => {
      try {
        const tId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
        const { data } = await supabase
          .from('knowledge_documents')
          .select('id, name, status')
          .eq('tenant_id', tId);
        setRagDocuments(data || []);
      } catch (err) {
        console.warn("Erro ao buscar documentos RAG:", err);
      }
    };
    if (isModalOpen) {
      fetchRagDocs();
    }
  }, [isModalOpen, tenantInfo]);

  // Efeito assíncrono para preview de link
  useEffect(() => {
    const extractUrlFromText = (text: string) => {
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      return text.match(urlRegex)?.[0];
    };

    const link = extractUrlFromText(content);
    if (!link) {
      setDetectedLink(null);
      setLinkPreviewData(null);
      return;
    }

    if (link === detectedLink) return;

    setDetectedLink(link);
    setIsLoadingPreview(true);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${ENGINE_URL}/api/v1/utils/link-preview?url=${encodeURIComponent(link)}`);
        if (response.ok) {
          const data = await response.json();
          setLinkPreviewData(data);
        } else {
          setLinkPreviewData(null);
        }
      } catch (err) {
        console.warn('[CannedResponses] Erro ao obter preview do link:', err);
        setLinkPreviewData(null);
      } finally {
        setIsLoadingPreview(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [content, detectedLink]);

  // Funções Auxiliares de Hierarquia de Categorias
  const getCategory = (catId?: string | null): QuickReplyCategory | undefined => {
    if (!catId) return undefined;
    return categories.find(c => c.id === catId);
  };

  const getCategoryPath = (catId?: string | null): string => {
    if (!catId) return '';
    const cat = categories.find(c => c.id === catId);
    if (!cat) return '';
    if (cat.parent_id) {
      const parent = categories.find(c => c.id === cat.parent_id);
      if (parent) {
        return `${getCategoryPath(parent.id)} › ${cat.name}`;
      }
    }
    return cat.name;
  };

  const getCategoryColor = (catId?: string | null): string => {
    const cat = getCategory(catId);
    return cat?.color || '#3b82f6';
  };

  // Obter todos os IDs descendentes de uma categoria (inclusive ela mesma)
  const getAllDescendantCategoryIds = (catId: string): string[] => {
    const result: string[] = [catId];
    const directChildren = categories.filter(c => c.parent_id === catId);
    for (const child of directChildren) {
      result.push(...getAllDescendantCategoryIds(child.id));
    }
    return result;
  };

  // Contagem de respostas prontas vinculadas a uma categoria
  const getCategoryItemCount = (catId: string): number => {
    const descendantIds = new Set(getAllDescendantCategoryIds(catId));
    return (quickReplies || []).filter(q => q.category_id && descendantIds.has(q.category_id)).length;
  };

  // Árvore plana ordenada para selects
  interface FlatTreeItem {
    id: string;
    name: string;
    path: string;
    depth: number;
    color?: string;
  }

  const getFlatCategoryTree = (parentId: string | null = null, depth = 0): FlatTreeItem[] => {
    const items = categories.filter(c => (parentId === null ? !c.parent_id : c.parent_id === parentId));
    let flat: FlatTreeItem[] = [];
    for (const item of items) {
      flat.push({
        id: item.id,
        name: item.name,
        path: getCategoryPath(item.id),
        depth,
        color: item.color
      });
      flat = flat.concat(getFlatCategoryTree(item.id, depth + 1));
    }
    return flat;
  };

  // Pastas Raiz (nível 1)
  const rootCategories = categories.filter(c => !c.parent_id);

  // Subcategorias da pasta raiz selecionada no filtro
  const activeRootSubcategories = selectedCategoryFilter !== 'all' && selectedCategoryFilter !== 'uncategorized'
    ? categories.filter(c => c.parent_id === selectedCategoryFilter)
    : [];

  // Filtragem de Respostas
  const filteredReplies = (quickReplies || []).filter(reply => {
    // 1. Filtro por Busca de Texto
    const matchesSearch = 
      reply.shortcut.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reply.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (reply.category_id && getCategoryPath(reply.category_id).toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    // 2. Filtro por Categoria Selecionada
    if (selectedCategoryFilter === 'all') {
      return true;
    }

    if (selectedCategoryFilter === 'uncategorized') {
      return !reply.category_id;
    }

    // Se uma subcategoria específica estiver ativa
    if (selectedSubcategoryFilter) {
      const subDescendants = new Set(getAllDescendantCategoryIds(selectedSubcategoryFilter));
      return reply.category_id ? subDescendants.has(reply.category_id) : false;
    }

    // Se a categoria raiz estiver ativa
    const allowedIds = new Set(getAllDescendantCategoryIds(selectedCategoryFilter));
    return reply.category_id ? allowedIds.has(reply.category_id) : false;
  });

  const handleGenerateWithAi = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    setAiGeneratedResult(null);
    setRagMatches([]);

    let ragContext = '';
    
    try {
      const tId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
      
      if (ragDocuments.length > 0) {
         try {
           const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/match`, {
               method: 'POST',
               headers: {
                   'x-tenant-id': tId,
                   'Content-Type': 'application/json'
               },
               body: JSON.stringify({ 
                 query: aiPrompt,
                 documentIds: selectedRagDocIds.length > 0 ? selectedRagDocIds : undefined
               })
           });
           
           if (response.ok) {
              const data = await response.json();
              if (data.matches && data.matches.length > 0) {
                 let matches = data.matches;
                 if (selectedRagDocIds.length > 0) {
                   matches = matches.filter((m: any) => selectedRagDocIds.includes(m.documentId || m.document_id));
                 }
                 setRagMatches(matches);
                 if (matches.length > 0) {
                   ragContext = matches
                      .slice(0, 4)
                      .map((r: any) => `[Arquivo: ${r.docName || r.documentName || 'Base RAG'}] ...${r.content}...`)
                      .join('\n\n');
                 }
              }
           }
         } catch (err) {
           console.warn("Falha ao buscar similaridade semântica RAG:", err);
         }
      }

      const result = await geminiService.generateCannedResponse(aiPrompt, ragContext, aiTone);
      setAiGeneratedResult(result);
    } catch (err: any) {
      alert(`Falha ao gerar resposta pronta com I.A.: ${err.message || 'Tente novamente.'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyAiResult = () => {
    if (!aiGeneratedResult) return;
    setShortcut(aiGeneratedResult.shortcut);
    setContent(aiGeneratedResult.text);
    setIsAiDrawerOpen(false);
    setAiPrompt('');
    setAiGeneratedResult(null);
  };

  const handleSave = async () => {
    if (!shortcut.startsWith('/')) {
      alert('O atalho deve começar com uma barra (ex: /ola)');
      return;
    }
    if (!shortcut.trim() || !content.trim()) {
      alert('Preencha todos os campos obrigatórios!');
      return;
    }

    if (responseType === 'TUTORIAL') {
      const hasVideo = (mediaFile && mediaFile.type.startsWith('video/')) || (mediaUrl && (mediaType === 'video' || !mediaType));
      if (!hasVideo) {
        alert('Respostas do tipo Tutorial exigem um vídeo anexado (preferencialmente .mp4). Por favor, anexe um vídeo antes de salvar.');
        return;
      }
    }

    setIsUploading(true);
    let finalMediaUrl = mediaUrl;
    let finalMediaType = mediaType;

    try {
      if (mediaFile && tenantInfo) {
        const fileExt = mediaFile.name.split('.').pop();
        const fileName = `${tenantInfo.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        setUploadProgress('30');
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('chat_media')
          .upload(fileName, mediaFile, {
            upsert: true,
            contentType: mediaFile.type
          });
        setUploadProgress('75');

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
          .from('chat_media')
          .getPublicUrl(fileName);
        
        finalMediaUrl = publicUrlData.publicUrl;
        setUploadProgress('100');

        const fileType = mediaFile.type;
        if (fileType.startsWith('video/')) {
          finalMediaType = 'video';
        } else if (fileType.startsWith('audio/')) {
          finalMediaType = 'audio';
        } else if (fileType === 'application/pdf' || fileType.startsWith('application/') || fileType.startsWith('text/')) {
          finalMediaType = 'document';
        } else {
          finalMediaType = 'image';
        }
      }

      const categoryIdToSave = selectedCategoryForReply ? selectedCategoryForReply : null;

      if (editingId) {
        await updateQuickReply(editingId, shortcut, content, finalMediaUrl, finalMediaType, responseType, categoryIdToSave);
      } else {
        await addQuickReply(shortcut, content, finalMediaUrl, finalMediaType, responseType, categoryIdToSave);
      }
      
      setIsModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error(error);
      alert('Erro ao salvar resposta: ' + (error?.message || 'Tente novamente.'));
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  const handleEdit = (reply: any) => {
    setEditingId(reply.id);
    setShortcut(reply.shortcut);
    setContent(reply.content);
    setMediaUrl(reply.media_url);
    setMediaType(reply.media_type);
    setResponseType((reply.type as CannedResponseType) || 'STANDARD');
    setSelectedCategoryForReply(reply.category_id || '');
    setMediaFile(null);
    setVideoDuration(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta resposta pronta?')) {
      try {
        await deleteQuickReply(id);
      } catch (error: any) {
        console.error(error);
        alert('Erro ao excluir: ' + (error?.message || 'Tente novamente.'));
      }
    }
  };

  const resetForm = () => {
    setShortcut('/');
    setContent('');
    setResponseType('STANDARD');
    setSelectedCategoryForReply('');
    setEditingId(null);
    setMediaFile(null);
    setMediaUrl(undefined);
    setMediaType(undefined);
    setVideoDuration(null);
    setUploadProgress('');
    setIsAiDrawerOpen(false);
    setAiPrompt('');
    setAiGeneratedResult(null);
    setSelectedRagDocIds([]);
    setAiTone('professional');
    setRagMatches([]);
  };

  const openNewModal = () => {
    resetForm();
    if (selectedCategoryFilter !== 'all' && selectedCategoryFilter !== 'uncategorized') {
      setSelectedCategoryForReply(selectedSubcategoryFilter || selectedCategoryFilter);
    }
    setIsModalOpen(true);
  };

  // Gerenciador de Categorias (CRUD)
  const openCategoryManager = () => {
    setEditingCategory(null);
    setCatFormName('');
    setCatFormParentId('');
    setCatFormShortcut('');
    setCatFormColor(CATEGORY_COLORS[0].hex);
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catFormName.trim()) {
      alert('Informe o nome da categoria ou projeto.');
      return;
    }

    try {
      if (editingCategory) {
        await updateQuickReplyCategory(editingCategory.id, {
          name: catFormName.trim(),
          parent_id: catFormParentId ? catFormParentId : null,
          shortcut: catFormShortcut.trim() ? catFormShortcut.trim() : undefined,
          color: catFormColor
        });
      } else {
        await addQuickReplyCategory({
          name: catFormName.trim(),
          parent_id: catFormParentId ? catFormParentId : null,
          shortcut: catFormShortcut.trim() ? catFormShortcut.trim() : undefined,
          color: catFormColor
        });
      }

      setEditingCategory(null);
      setCatFormName('');
      setCatFormParentId('');
      setCatFormShortcut('');
      setCatFormColor(CATEGORY_COLORS[0].hex);
    } catch (err: any) {
      alert('Erro ao salvar categoria: ' + (err?.message || 'Tente novamente.'));
    }
  };

  const handleStartEditCategory = (cat: QuickReplyCategory) => {
    setEditingCategory(cat);
    setCatFormName(cat.name);
    setCatFormParentId(cat.parent_id || '');
    setCatFormShortcut(cat.shortcut || '');
    setCatFormColor(cat.color || CATEGORY_COLORS[0].hex);
  };

  const handleDeleteCategory = async (catId: string) => {
    const cat = getCategory(catId);
    const count = getCategoryItemCount(catId);
    const promptMsg = count > 0
      ? `Atenção: A pasta "${cat?.name}" e suas subpastas possuem ${count} resposta(s) vinculada(s). Excluir esta pasta desvinculará essas respostas. Deseja continuar?`
      : `Deseja realmente excluir a pasta "${cat?.name}"?`;

    if (confirm(promptMsg)) {
      try {
        await deleteQuickReplyCategory(catId);
        if (selectedCategoryFilter === catId) {
          setSelectedCategoryFilter('all');
          setSelectedSubcategoryFilter(null);
        }
      } catch (err: any) {
        alert('Erro ao excluir categoria: ' + (err?.message || 'Tente novamente.'));
      }
    }
  };

  return (
    <div className="h-screen bg-slate-50 dark:bg-[#0c1317] flex flex-col transition-colors duration-200 overflow-x-hidden">
      {/* Header Premium */}
      <header className="bg-white/80 dark:bg-[#111B21]/90 border-b border-slate-100 dark:border-white/5 px-6 py-4.5 flex items-center justify-between sticky top-0 z-20 backdrop-blur-md transition-colors duration-200">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/admin')}
            className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-2xl text-slate-500 hover:text-slate-700 dark:text-[#aebac1] dark:hover:text-white transition-colors cursor-pointer active:scale-95"
            title="Voltar"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-black text-slate-800 dark:text-[#e9edef] flex items-center gap-2 uppercase tracking-wide">
              <MessageSquareText className="w-5.5 h-5.5 text-blue-600 dark:text-blue-500" />
              Respostas Prontas & Pastas
            </h1>
            <p className="text-[11px] font-bold text-slate-400 dark:text-[#8696a0] mt-0.5">
              Organize respostas rápidas por projetos, pastas e subcategorias (ex: /AppGarcom).
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2.5">
          <button 
            onClick={openCategoryManager}
            className="bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-[#e9edef] px-3.5 py-2.5 rounded-2xl flex items-center gap-2 transition-all font-bold text-xs uppercase tracking-wider cursor-pointer border border-slate-200/60 dark:border-white/5 active:scale-95 duration-200"
            title="Gerenciar Categorias e Subpastas"
          >
            <FolderTree className="w-4 h-4 text-blue-500" />
            <span className="hidden sm:inline">Gerenciar Pastas</span>
          </button>

          <button 
            onClick={openNewModal}
            className="bg-gradient-to-tr from-blue-600 to-indigo-650 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2.5 rounded-2xl flex items-center gap-2 transition-all shadow-md shadow-blue-500/10 font-bold text-xs uppercase tracking-wider cursor-pointer active:scale-95 duration-200"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>Nova Resposta</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-[#0c1317]/50">
        <div className="max-w-5xl mx-auto space-y-5">
          
          {/* Barra de Pesquisa */}
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 dark:text-[#8696a0] absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Buscar por atalho, conteúdo ou pasta (ex: /AppGarcom, /totem)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-white/5 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 bg-white dark:bg-[#182229]/40 dark:text-[#e9edef] dark:placeholder-[#8696a0] shadow-sm transition-all duration-200 font-medium text-sm"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Barra de Pastas / Categorias (Nível Principal) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-blue-500" />
                Filtrar por Pasta / Projeto
              </span>
              <button 
                onClick={openCategoryManager}
                className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus size={12} />
                Nova Pasta
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none no-scrollbar select-none">
              {/* Chip: Todas */}
              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryFilter('all');
                  setSelectedSubcategoryFilter(null);
                }}
                className={`px-3.5 py-2 rounded-2xl text-xs font-bold shrink-0 transition-all flex items-center gap-2 cursor-pointer border ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                    : 'bg-white dark:bg-[#182229]/60 text-slate-600 dark:text-[#aebac1] border-slate-200/70 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Todas</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  selectedCategoryFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-[#8696a0]'
                }`}>
                  {quickReplies?.length || 0}
                </span>
              </button>

              {/* Chips das Pastas Raiz */}
              {rootCategories.map(cat => {
                const count = getCategoryItemCount(cat.id);
                const isSelected = selectedCategoryFilter === cat.id;
                const catColor = cat.color || '#3b82f6';
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryFilter(cat.id);
                      setSelectedSubcategoryFilter(null);
                    }}
                    style={{
                      borderColor: isSelected ? catColor : undefined,
                      backgroundColor: isSelected ? catColor : undefined
                    }}
                    className={`px-3.5 py-2 rounded-2xl text-xs font-bold shrink-0 transition-all flex items-center gap-2 cursor-pointer border ${
                      isSelected
                        ? 'text-white shadow-md'
                        : 'bg-white dark:bg-[#182229]/60 text-slate-700 dark:text-[#e9edef] border-slate-200/70 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <span 
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSelected ? 'bg-white' : ''}`} 
                      style={{ backgroundColor: isSelected ? '#ffffff' : catColor }}
                    />
                    <span className="truncate max-w-[130px]">{cat.name}</span>
                    {cat.shortcut && (
                      <span className={`text-[10px] font-mono ${isSelected ? 'text-white/80' : 'opacity-70'}`}>
                        {cat.shortcut}
                      </span>
                    )}
                    <span 
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                        isSelected 
                          ? 'bg-black/20 text-white' 
                          : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-[#8696a0]'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}

              {/* Chip: Sem Pasta / Raiz */}
              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryFilter('uncategorized');
                  setSelectedSubcategoryFilter(null);
                }}
                className={`px-3.5 py-2 rounded-2xl text-xs font-bold shrink-0 transition-all flex items-center gap-2 cursor-pointer border ${
                  selectedCategoryFilter === 'uncategorized'
                    ? 'bg-slate-700 text-white border-slate-700 shadow-md'
                    : 'bg-white dark:bg-[#182229]/60 text-slate-600 dark:text-[#aebac1] border-slate-200/70 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Sem Pasta</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  selectedCategoryFilter === 'uncategorized' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-[#8696a0]'
                }`}>
                  {(quickReplies || []).filter(q => !q.category_id).length}
                </span>
              </button>
            </div>

            {/* Sub-barra de Subpastas da Pasta Selecionada */}
            {activeRootSubcategories.length > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-2xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/15 animate-in fade-in slide-in-from-top-1 duration-200 overflow-x-auto">
                <span className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 pl-2 shrink-0 flex items-center gap-1">
                  <CornerDownRight className="w-3 h-3" />
                  Subpastas:
                </span>
                
                <button
                  type="button"
                  onClick={() => setSelectedSubcategoryFilter(null)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                    selectedSubcategoryFilter === null
                      ? 'bg-blue-600 text-white shadow-xs font-black'
                      : 'bg-white/80 dark:bg-black/20 text-slate-600 dark:text-[#aebac1] hover:bg-white'
                  }`}
                >
                  Todas do projeto ({getCategoryItemCount(selectedCategoryFilter)})
                </button>

                {activeRootSubcategories.map(sub => {
                  const subCount = getCategoryItemCount(sub.id);
                  const isSubSelected = selectedSubcategoryFilter === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setSelectedSubcategoryFilter(sub.id)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSubSelected
                          ? 'bg-blue-600 text-white shadow-xs font-black'
                          : 'bg-white/80 dark:bg-black/20 text-slate-700 dark:text-[#e9edef] hover:bg-white'
                      }`}
                    >
                      <Folder className="w-3 h-3 opacity-80" />
                      <span>{sub.name}</span>
                      <span className="text-[9px] opacity-75 font-mono">({subCount})</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lista de Respostas Prontas */}
          {filteredReplies.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-[#111B21] rounded-3xl border border-slate-100 dark:border-white/5 shadow-sm transition-colors duration-200 flex flex-col items-center justify-center">
              <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-full mb-4">
                <Zap className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              </div>
              <h3 className="text-base font-extrabold text-slate-800 dark:text-[#e9edef] mb-1.5 uppercase tracking-wide">
                Nenhuma resposta encontrada
              </h3>
              <p className="text-xs font-semibold text-slate-400 dark:text-[#8696a0] max-w-xs mb-4">
                {searchTerm 
                  ? `Nenhum resultado para "${searchTerm}".`
                  : selectedCategoryFilter !== 'all' 
                    ? 'Esta pasta ainda não possui respostas associadas.' 
                    : 'Clique no botão acima para criar seu primeiro atalho.'}
              </p>
              <button
                onClick={openNewModal}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition-all cursor-pointer"
              >
                + Criar Resposta Nesta Pasta
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredReplies.map((reply) => {
                const categoryPath = getCategoryPath(reply.category_id);
                const categoryColor = getCategoryColor(reply.category_id);

                return (
                  <div 
                    key={reply.id} 
                    className="bg-white/80 dark:bg-[#182229]/30 backdrop-blur-md rounded-3xl p-5 border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-md hover:border-blue-500/20 dark:hover:border-blue-500/20 transition-all duration-300 group flex flex-col justify-between h-full relative overflow-hidden"
                  >
                    <div className="space-y-4">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono font-black text-xs border border-blue-500/10">
                            {reply.shortcut}
                          </span>

                          {/* Badge de Categoria/Pasta com Cor */}
                          {categoryPath && (
                            <button
                              type="button"
                              onClick={() => {
                                if (reply.category_id) {
                                  const cat = getCategory(reply.category_id);
                                  if (cat?.parent_id) {
                                    setSelectedCategoryFilter(cat.parent_id);
                                    setSelectedSubcategoryFilter(cat.id);
                                  } else {
                                    setSelectedCategoryFilter(reply.category_id);
                                    setSelectedSubcategoryFilter(null);
                                  }
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border shadow-2xs hover:scale-105 active:scale-95 transition-all cursor-pointer"
                              style={{
                                backgroundColor: `${categoryColor}15`,
                                color: categoryColor,
                                borderColor: `${categoryColor}30`
                              }}
                              title={`Filtrar pela pasta: ${categoryPath}`}
                            >
                              <Folder className="w-3 h-3" />
                              <span className="truncate max-w-[150px]">{categoryPath}</span>
                            </button>
                          )}

                          {reply.type === 'TUTORIAL' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-purple-500/15 to-indigo-500/15 text-purple-600 dark:text-purple-400 text-[10px] font-black uppercase tracking-wider border border-purple-500/20 shadow-xs">
                              <Video className="w-3 h-3 text-purple-500" />
                              Tutorial
                            </span>
                          )}

                          {tenantInfo?.name && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-[#8696a0] text-[10px] font-bold border border-slate-200/40 dark:border-white/5" title="Empresa">
                              <Building className="w-3 h-3" />
                              {tenantInfo.name}
                            </span>
                          )}
                        </div>
                        
                        {/* Ações */}
                        <div className="flex gap-1 shrink-0">
                          <button 
                            onClick={() => handleEdit(reply)}
                            className="p-1.5 text-slate-400 dark:text-[#8696a0] hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDelete(reply.id)}
                            className="p-1.5 text-slate-400 dark:text-[#8696a0] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/5 rounded-lg transition-colors cursor-pointer"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="pr-2">
                        <ExpandableText content={reply.content} />
                      </div>
                    </div>

                    {reply.media_url && (
                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-white/5 shrink-0">
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewMedia({ url: reply.media_url, type: (reply.media_type as any) || (reply.type === 'TUTORIAL' ? 'video' : 'image') });
                          }}
                          className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-2xl border transition-all cursor-pointer min-w-0 ${
                            reply.type === 'TUTORIAL'
                              ? 'bg-purple-500/5 dark:bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/10'
                              : 'bg-slate-50 dark:bg-black/10 border-slate-200/30 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/5'
                          }`}
                          title={reply.type === 'TUTORIAL' ? "Assistir Vídeo Tutorial" : "Ver Mídia"}
                        >
                          {reply.media_type === 'video' || reply.type === 'TUTORIAL' ? (
                            <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-black/20 flex items-center justify-center shrink-0 border border-purple-500/20">
                              <video src={reply.media_url} className="w-full h-full object-cover" preload="metadata" />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                              </div>
                            </div>
                          ) : reply.media_type === 'audio' ? (
                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                              <Mic className="w-4 h-4 text-blue-500" />
                            </div>
                          ) : reply.media_type === 'document' ? (
                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-emerald-500" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-black/5 dark:bg-white/5 border dark:border-white/5 shrink-0">
                              <img src={reply.media_url} alt="Mídia anexada" className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={`text-[10px] font-black uppercase tracking-wider leading-none ${
                              reply.type === 'TUTORIAL' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-[#8696a0]'
                            }`}>
                              {reply.type === 'TUTORIAL' ? 'Vídeo Tutorial' : 'Mídia Anexa'}
                            </p>
                            <p className="text-xs font-bold text-slate-700 dark:text-[#e9edef] truncate mt-0.5">
                              {reply.type === 'TUTORIAL' ? 'Assistir Tutorial' : 'Visualizar Anexo'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(reply.media_url);
                            alert('Link da mídia copiado!');
                          }}
                          className="p-3 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-white/5 rounded-2xl transition-all border border-slate-200/30 dark:border-white/5 cursor-pointer shadow-sm"
                          title="Copiar Link Público"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Modal Criar/Editar Resposta Pronta */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#182229] rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border dark:border-white/5 flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-[#202C33]/30 shrink-0">
              <h2 className="text-base font-black text-slate-800 dark:text-[#e9edef] flex items-center gap-2 uppercase tracking-wider">
                <Zap className="w-4.5 h-4.5 text-amber-500" />
                {editingId ? 'Editar Resposta' : 'Nova Resposta Pronta'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              
              {/* Seletor de Categoria / Pasta */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                    Pasta / Categoria de Projeto
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      openCategoryManager();
                    }}
                    className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <FolderPlus size={12} />
                    + Criar Pasta
                  </button>
                </div>
                <div className="relative">
                  <select
                    value={selectedCategoryForReply}
                    onChange={(e) => setSelectedCategoryForReply(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-white/5 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 bg-slate-50 dark:bg-black/10 text-slate-800 dark:text-[#e9edef] text-sm font-semibold cursor-pointer"
                  >
                    <option value="">📁 Sem Pasta (Raiz / Geral)</option>
                    {getFlatCategoryTree().map((catItem) => (
                      <option key={catItem.id} value={catItem.id}>
                        {catItem.depth > 0 ? `  ↳ ${catItem.path}` : `📁 ${catItem.name}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tipo da Resposta */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1.5">Tipo da Resposta</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-black/20 p-1.5 rounded-2xl border border-slate-200/50 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => setResponseType('STANDARD')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                      responseType === 'STANDARD'
                        ? 'bg-white dark:bg-[#202C33] text-blue-600 dark:text-blue-400 shadow-sm border dark:border-white/5 font-black'
                        : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-700 dark:hover:text-[#d1d7db]'
                    }`}
                  >
                    <MessageSquareText className="w-4 h-4" />
                    <span>Padrão</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResponseType('TUTORIAL');
                      if (mediaType && mediaType !== 'video') {
                        setMediaFile(null);
                        setMediaUrl(undefined);
                        setMediaType(undefined);
                        setVideoDuration(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }
                    }}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                      responseType === 'TUTORIAL'
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-650 text-white shadow-sm shadow-purple-500/20 font-black'
                        : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-700 dark:hover:text-[#d1d7db]'
                    }`}
                  >
                    <Video className="w-4 h-4" />
                    <span>Tutorial (Vídeo)</span>
                  </button>
                </div>
              </div>

              {/* Atalho */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1.5">Atalho (Shortcut)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={shortcut}
                    onChange={(e) => setShortcut(e.target.value)}
                    placeholder="/ola"
                    className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-white/5 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-mono font-bold text-sm bg-slate-50 dark:bg-black/10 text-slate-800 dark:text-[#e9edef] placeholder-slate-400 dark:placeholder-[#8696a0]"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">
                    Iniciar com /
                  </div>
                </div>
              </div>
              
              {/* Conteúdo */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Conteúdo da Mensagem</label>
                  <button
                    type="button"
                    onClick={() => setIsAiDrawerOpen(!isAiDrawerOpen)}
                    className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md shadow-indigo-500/10 transition-all hover:scale-[1.03] active:scale-98 duration-200 cursor-pointer"
                  >
                    <Sparkles size={11} className="text-white animate-pulse" />
                    <span>I.A. Assistente RAG</span>
                  </button>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Olá! Como posso ajudar você hoje?"
                  rows={5}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/5 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 resize-none bg-slate-50 dark:bg-black/10 text-slate-800 dark:text-[#e9edef] placeholder-slate-400 dark:placeholder-[#8696a0] font-medium text-sm"
                />
              </div>

              {/* Preview de Link */}
              {(isLoadingPreview || linkPreviewData) && (
                <div className="p-4 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 border border-blue-500/10 dark:border-blue-500/20 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-300 relative overflow-hidden backdrop-blur-md shadow-inner flex gap-3.5">
                  {isLoadingPreview ? (
                    <div className="flex items-center justify-center w-full py-4 gap-3">
                      <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
                      <span className="text-xs font-semibold text-slate-500 dark:text-[#8696a0] animate-pulse">Obtendo pré-visualização do link...</span>
                    </div>
                  ) : (
                    linkPreviewData && (
                      <>
                        {linkPreviewData.image ? (
                          <div className="w-18 h-18 rounded-2xl overflow-hidden bg-black/5 dark:bg-white/5 border dark:border-white/10 shrink-0 shadow-sm relative group">
                            <img 
                              src={linkPreviewData.image} 
                              alt="Thumbnail do link" 
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-18 h-18 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                            <Globe className="w-6 h-6 animate-pulse" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 text-left">
                          <div>
                            <div className="text-[9px] font-black text-blue-600 dark:text-blue-450 uppercase tracking-widest flex items-center gap-1.5 mb-1 leading-none">
                              <span className="flex h-1.5 w-1.5 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                              </span>
                              Link Detectado
                            </div>
                            <h4 className="text-xs font-black text-slate-800 dark:text-[#e9edef] truncate leading-tight mb-0.5">
                              {linkPreviewData.title || "Visualizar Link"}
                            </h4>
                            <p className="text-[10px] text-slate-500 dark:text-[#8696a0] line-clamp-2 leading-relaxed">
                              {linkPreviewData.description || "Sem descrição disponível."}
                            </p>
                          </div>
                          
                          <a 
                            href={linkPreviewData.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-1 text-[10px] font-extrabold text-blue-500 hover:text-blue-600 dark:text-blue-405 mt-2 hover:underline transition-all cursor-pointer"
                          >
                            <span className="truncate max-w-[200px]">{linkPreviewData.url.replace(/^https?:\/\//, '')}</span>
                            <ExternalLink size={10} />
                          </a>
                        </div>
                      </>
                    )
                  )}
                </div>
              )}

              {/* Assistente IA */}
              {isAiDrawerOpen && (
                <div className="p-5 bg-gradient-to-br from-blue-500/5 via-indigo-500/5 to-purple-500/5 border border-blue-500/10 dark:border-blue-500/25 rounded-[24px] animate-in slide-in-from-top-4 fade-in duration-300 relative overflow-hidden shadow-inner text-left">
                  <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-slate-100 dark:border-white/5">
                     <span className="text-[10px] uppercase tracking-wider font-black text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                       <Sparkles size={12} className="text-indigo-500 animate-pulse" /> Redigir com I.A.
                     </span>
                     {ragDocuments.length > 0 ? (
                       <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-wider border border-emerald-500/10 animate-pulse">
                         RAG Conectado
                       </span>
                     ) : (
                       <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-405 text-[9px] font-black uppercase tracking-wider border border-amber-500/10">
                         Gemini Global
                       </span>
                     )}
                  </div>

                  <div className="space-y-3">
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Descreva o que a resposta pronta deve dizer (ex: Explicar como baixar o AppGarçom e enviar link)..."
                      rows={3}
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-blue-500/20 dark:border-white/10 text-xs bg-white dark:bg-[#111B21] text-slate-800 dark:text-[#e9edef] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium"
                    />

                    <div className="flex justify-between items-center">
                      <select
                        value={aiTone}
                        onChange={(e) => setAiTone(e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 text-[11px] font-bold bg-white dark:bg-[#111B21] text-slate-700 dark:text-[#e9edef]"
                      >
                        <option value="professional">Tom Profissional</option>
                        <option value="friendly">Tom Amigável / Humanizado</option>
                        <option value="direct">Tom Direto & Objetivo</option>
                      </select>

                      <button
                        type="button"
                        onClick={handleGenerateWithAi}
                        disabled={isGenerating || !aiPrompt.trim()}
                        className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                      >
                        {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                        {isGenerating ? 'Gerando...' : 'Gerar'}
                      </button>
                    </div>

                    {aiGeneratedResult && (
                      <div className="p-3 bg-white dark:bg-[#111B21] rounded-2xl border border-emerald-500/20 space-y-2 mt-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-mono font-black text-blue-600 dark:text-blue-400">{aiGeneratedResult.shortcut}</span>
                          <button
                            type="button"
                            onClick={handleApplyAiResult}
                            className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                          >
                            <CheckCircle2 size={12} />
                            Aplicar no Formulário
                          </button>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-[#d1d7db] whitespace-pre-wrap">{aiGeneratedResult.text}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Upload de Mídia / Tutorial */}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1.5">
                  {responseType === 'TUTORIAL' ? 'Vídeo Tutorial Anexo (Obrigatório)' : 'Mídia Anexa (Opcional)'}
                </label>
                
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setMediaFile(file);
                      setMediaUrl(URL.createObjectURL(file));
                      const fileType = file.type;
                      if (fileType.startsWith('video/')) setMediaType('video');
                      else if (fileType.startsWith('audio/')) setMediaType('audio');
                      else if (fileType.startsWith('application/') || fileType.startsWith('text/')) setMediaType('document');
                      else setMediaType('image');
                    }
                  }}
                  accept={responseType === 'TUTORIAL' ? 'video/mp4,video/*' : 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx'}
                  className="hidden"
                />

                {!mediaFile && !mediaUrl ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 border-2 border-dashed border-slate-200 dark:border-white/10 hover:border-blue-500/50 dark:hover:border-blue-500/50 rounded-2xl p-4 text-center transition-colors cursor-pointer group flex flex-col items-center justify-center gap-2"
                    >
                      <Paperclip className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
                      <span className="text-xs font-bold text-slate-600 dark:text-[#8696a0] group-hover:text-blue-500">
                        {responseType === 'TUTORIAL' ? 'Selecionar Vídeo MP4' : 'Anexar Imagem, Vídeo ou PDF'}
                      </span>
                    </button>

                    {responseType === 'STANDARD' && (
                      <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`px-4 rounded-2xl flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all cursor-pointer ${
                          isRecording 
                            ? 'bg-rose-500 text-white animate-pulse' 
                            : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-[#aebac1] hover:bg-slate-200'
                        }`}
                      >
                        <Mic className="w-4 h-4" />
                        <span>{isRecording ? formatTime(recordingTime) : 'Gravar'}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                      {mediaType === 'video' || responseType === 'TUTORIAL' ? <Video size={18} /> : mediaType === 'audio' ? <Mic size={18} /> : mediaType === 'document' ? <FileText size={18} /> : <ImageIcon size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-[#e9edef] truncate">{mediaFile?.name || 'Mídia carregada'}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-black">{mediaType || 'Anexo'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMediaFile(null);
                        setMediaUrl(undefined);
                        setMediaType(undefined);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="p-1.5 hover:bg-rose-500/10 text-rose-500 rounded-xl transition-colors cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-[#202C33]/30 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 rounded-2xl font-bold text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isUploading}
                className="px-5 py-2.5 rounded-2xl font-bold text-xs uppercase tracking-wider bg-gradient-to-tr from-blue-600 to-indigo-650 hover:from-blue-700 hover:to-indigo-700 text-white disabled:opacity-50 transition-all shadow-md shadow-blue-500/10 flex items-center gap-1.5 cursor-pointer active:scale-95 duration-200"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {uploadProgress ? `${uploadProgress}%` : 'Enviando...'}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {editingId ? 'Salvar Alterações' : 'Criar Resposta'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gestão de Categorias e Subpastas */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#182229] rounded-[32px] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border dark:border-white/5 flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-[#202C33]/30 shrink-0">
              <h2 className="text-base font-black text-slate-800 dark:text-[#e9edef] flex items-center gap-2 uppercase tracking-wider">
                <FolderTree className="w-5 h-5 text-blue-500" />
                Gerenciar Pastas & Projetos
              </h2>
              <button 
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Formulário: Nova ou Editar Pasta */}
              <form onSubmit={handleSaveCategory} className="p-4.5 rounded-3xl bg-slate-50 dark:bg-black/20 border border-slate-200/70 dark:border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-[#e9edef] flex items-center gap-1.5">
                    {editingCategory ? <Edit2 size={13} className="text-blue-500" /> : <FolderPlus size={13} className="text-emerald-500" />}
                    {editingCategory ? `Editar: ${editingCategory.name}` : 'Criar Nova Pasta ou Subcategoria'}
                  </h3>
                  {editingCategory && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(null);
                        setCatFormName('');
                        setCatFormParentId('');
                        setCatFormShortcut('');
                        setCatFormColor(CATEGORY_COLORS[0].hex);
                      }}
                      className="text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                    >
                      Cancelar Edição
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1">
                      Nome da Pasta / Projeto *
                    </label>
                    <input
                      type="text"
                      value={catFormName}
                      onChange={(e) => setCatFormName(e.target.value)}
                      placeholder="Ex: AppGarçom, Tutoriais, Totens..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111B21] text-slate-800 dark:text-[#e9edef] text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1">
                      Pasta Mãe (Opcional - p/ Subcategoria)
                    </label>
                    <select
                      value={catFormParentId}
                      onChange={(e) => setCatFormParentId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111B21] text-slate-800 dark:text-[#e9edef] text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
                    >
                      <option value="">📁 Nenhuma (Pasta Principal / Raiz)</option>
                      {categories
                        .filter(c => !editingCategory || c.id !== editingCategory.id)
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            📁 {getCategoryPath(c.id)}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1">
                      Atalho da Pasta no Chat (Opcional)
                    </label>
                    <input
                      type="text"
                      value={catFormShortcut}
                      onChange={(e) => setCatFormShortcut(e.target.value)}
                      placeholder="Ex: /AppGarcom"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111B21] text-slate-800 dark:text-[#e9edef] text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1">
                      Cor da Pasta
                    </label>
                    <div className="flex items-center gap-1.5 pt-1">
                      {CATEGORY_COLORS.map(c => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => setCatFormColor(c.hex)}
                          style={{ backgroundColor: c.hex }}
                          className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                            catFormColor === c.hex ? 'scale-125 ring-2 ring-offset-2 ring-blue-500 shadow-md' : 'hover:scale-110 opacity-70 hover:opacity-100'
                          }`}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-blue-500/10 cursor-pointer active:scale-95"
                  >
                    <Save size={13} />
                    <span>{editingCategory ? 'Atualizar Pasta' : 'Salvar Pasta'}</span>
                  </button>
                </div>
              </form>

              {/* Lista de Pastas Criadas em Árvore */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                  <FolderTree size={13} className="text-blue-500" />
                  Estrutura de Pastas Existentes ({categories.length})
                </h3>

                {categories.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl text-slate-400 text-xs font-medium">
                    Nenhuma pasta criada ainda. Crie uma acima (ex: AppGarçom).
                  </div>
                ) : (
                  <div className="space-y-2">
                    {getFlatCategoryTree().map((catItem) => {
                      const cat = getCategory(catItem.id);
                      const count = getCategoryItemCount(catItem.id);
                      const catColor = cat?.color || '#3b82f6';

                      return (
                        <div
                          key={catItem.id}
                          style={{ marginLeft: `${catItem.depth * 20}px` }}
                          className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-[#111B21] border border-slate-100 dark:border-white/5 shadow-2xs hover:border-blue-500/30 transition-all group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span 
                              className="w-3 h-3 rounded-full shrink-0 shadow-2xs" 
                              style={{ backgroundColor: catColor }}
                            />
                            {catItem.depth > 0 && (
                              <CornerDownRight size={13} className="text-slate-400 shrink-0" />
                            )}
                            <span className="font-bold text-xs text-slate-800 dark:text-[#e9edef] truncate">
                              {catItem.name}
                            </span>
                            {cat?.shortcut && (
                              <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono text-[10px] font-bold">
                                {cat.shortcut}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-[#8696a0] text-[10px] font-bold">
                              {count} resposta(s)
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => cat && handleStartEditCategory(cat)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                              title="Editar"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(catItem.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/5 rounded-lg transition-colors cursor-pointer"
                              title="Excluir"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-[#202C33]/30 flex justify-end">
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="px-5 py-2.5 rounded-2xl font-bold text-xs uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer shadow-md shadow-blue-500/10"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview Media FullScreen */}
      {previewMedia && (
        <div 
          className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-[100] animate-in fade-in duration-300"
          onClick={() => setPreviewMedia(null)}
        >
          <button 
            onClick={() => setPreviewMedia(null)}
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-10 cursor-pointer"
            title="Fechar"
          >
            <X className="w-6 h-6" />
          </button>
          
          <div 
            className="w-full max-w-5xl max-h-screen p-4 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {previewMedia.type === 'video' ? (
              <video 
                src={previewMedia.url} 
                controls 
                autoPlay 
                className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain bg-black"
              />
            ) : previewMedia.type === 'audio' ? (
              <div className="bg-white dark:bg-[#202C33] p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-6 min-w-[300px]">
                <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center animate-pulse">
                  <Mic className="w-8 h-8 text-blue-500" />
                </div>
                <audio src={previewMedia.url} controls autoPlay className="w-full max-w-sm" />
              </div>
            ) : previewMedia.type === 'document' ? (
              <div className="bg-white dark:bg-[#111B21] p-6 rounded-[32px] shadow-2xl flex flex-col items-center gap-4 w-full max-w-4xl h-[80vh] overflow-hidden border border-white/5" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between w-full pb-3 border-b border-slate-100 dark:border-white/5">
                  <h3 className="text-base font-black text-slate-800 dark:text-[#e9edef] flex items-center gap-2 uppercase tracking-wide">
                    <FileText className="w-5 h-5 text-emerald-500" />
                    Visualizar Documento
                  </h3>
                  <a 
                    href={previewMedia.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md shadow-blue-500/10 flex items-center gap-1.5 hover:scale-[1.02] active:scale-95 duration-200"
                  >
                    Abrir em Nova Aba
                  </a>
                </div>
                {previewMedia.url.toLowerCase().endsWith('.pdf') || previewMedia.url.includes('pdf') || previewMedia.url.startsWith('blob:') ? (
                  <iframe 
                    src={previewMedia.url} 
                    className="w-full flex-1 rounded-2xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black/10"
                    title="Visualização do PDF"
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center py-12">
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/20 rounded-2xl flex items-center justify-center mb-4">
                      <FileText className="w-8 h-8 text-emerald-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-800 dark:text-[#e9edef] text-center mb-2">
                      Este documento não suporta visualização direta.
                    </p>
                    <p className="text-xs text-slate-500 dark:text-[#8696a0] text-center mb-6 max-w-sm">
                      Clique no botão acima para abrir e fazer o download do documento de forma nativa.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <img 
                src={previewMedia.url} 
                alt="Visualização em Tela Cheia" 
                className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain bg-black/50"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
