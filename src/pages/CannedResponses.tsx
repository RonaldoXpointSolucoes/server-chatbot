import React, { useState, useEffect, useRef } from 'react';
import { useChatStore, CannedResponseType } from '../store/chatStore';
import { Plus, Search, Edit2, Trash2, MessageSquareText, Zap, ChevronLeft, Save, Building, Paperclip, Image as ImageIcon, Video, X, Loader2, Copy, Mic, Square, Wand2, CheckCircle2, Sparkles, FileText, ExternalLink, Globe, Play, Film } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { uploadResumableFile } from '../services/tusUploader';
import { geminiService } from '../services/geminiService';

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

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
          className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium mt-1.5 transition-colors"
        >
          {isExpanded ? 'Ver menos' : 'Ver tudo'}
        </button>
      )}
    </div>
  );
};

export function CannedResponses() {
  const navigate = useNavigate();
  const { quickReplies, fetchQuickReplies, addQuickReply, updateQuickReply, deleteQuickReply, tenantInfo } = useChatStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [shortcut, setShortcut] = useState('');
  const [content, setContent] = useState('');
  const [responseType, setResponseType] = useState<CannedResponseType>('STANDARD');
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

  // Estados locais adicionais para o Assistente I.A. & RAG pgvector
  const [ragDocuments, setRagDocuments] = useState<any[]>([]);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiGeneratedResult, setAiGeneratedResult] = useState<{ text: string, shortcut: string } | null>(null);

  // Novos estados locais premium de I.A. & RAG
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

  // Efeito assíncrono para detectar links no conteúdo e carregar metadados via API Gateway
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

    if (link === detectedLink) return; // evita loops se for o mesmo link

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
    }, 800); // 800ms debounce

    return () => clearTimeout(timer);
  }, [content, detectedLink]);

  // Efeito para carregar as bases de conhecimento RAG vetorizadas ativas no Supabase
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

  // Função para pesquisar similaridade semântica e redigir resposta pronta via Gemini
  const handleGenerateWithAi = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    setAiGeneratedResult(null);
    setRagMatches([]);

    let ragContext = '';
    
    try {
      const tId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
      
      // 1. Pesquisa similaridade semântica no banco pgvector se houver documentos cadastrados
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
                 // Filtrar os matches do RAG de acordo com os IDs selecionados (garantia frontend)
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
           console.warn("Falha ao buscar similaridade semântica RAG (servidor offline):", err);
         }
      }

      // 2. Chama o Gemini passando o Prompt, o Contexto RAG filtrado e o Tom de escrita
      const result = await geminiService.generateCannedResponse(aiPrompt, ragContext, aiTone);
      setAiGeneratedResult(result);
    } catch (err: any) {
      alert(`Falha ao gerar resposta pronta com I.A.: ${err.message || 'Tente novamente.'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Função para aplicar os dados sugeridos pela I.A. no formulário nativo do modal
  const handleApplyAiResult = () => {
    if (!aiGeneratedResult) return;
    setShortcut(aiGeneratedResult.shortcut);
    setContent(aiGeneratedResult.text);
    setIsAiDrawerOpen(false);
    setAiPrompt('');
    setAiGeneratedResult(null);
  };

  const filteredReplies = quickReplies?.filter(reply => 
    reply.shortcut.toLowerCase().includes(searchTerm.toLowerCase()) ||
    reply.content.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleSave = async () => {
    if (!shortcut.startsWith('/')) {
      alert('O atalho deve começar com uma barra (ex: /ola)');
      return;
    }
    if (!shortcut.trim() || !content.trim()) {
      alert('Preencha todos os campos!');
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

      if (editingId) {
        await updateQuickReply(editingId, shortcut, content, finalMediaUrl, finalMediaType, responseType);
      } else {
        await addQuickReply(shortcut, content, finalMediaUrl, finalMediaType, responseType);
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
    setIsModalOpen(true);
  };

  return (
    <div className="h-screen bg-slate-50 dark:bg-[#0c1317] flex flex-col transition-colors duration-200">
      {/* Header Premium */}
      <header className="bg-white/80 dark:bg-[#111B21]/90 border-b border-slate-100 dark:border-white/5 px-6 py-4.5 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md transition-colors duration-200">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/admin')}
            className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-2xl text-slate-500 hover:text-slate-700 dark:text-[#aebac1] dark:hover:text-white transition-colors cursor-pointer"
            title="Voltar"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-black text-slate-800 dark:text-[#e9edef] flex items-center gap-2 uppercase tracking-wide">
              <MessageSquareText className="w-5.5 h-5.5 text-blue-600 dark:text-blue-500" />
              Respostas Prontas
            </h1>
            <p className="text-[11px] font-bold text-slate-400 dark:text-[#8696a0] mt-0.5">
              Gerencie atalhos para respostas rápidas (ex: /ola).
            </p>
          </div>
        </div>
        
        <button 
          onClick={openNewModal}
          className="bg-gradient-to-tr from-blue-600 to-indigo-650 hover:from-blue-700 hover:to-indigo-700 text-white px-4 py-2.5 rounded-2xl flex items-center gap-2 transition-all shadow-md shadow-blue-500/10 font-bold text-xs uppercase tracking-wider cursor-pointer active:scale-95 duration-200"
        >
          <Plus className="w-4.5 h-4.5" />
          Nova Resposta
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-[#0c1317]/50">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {/* Barra de Pesquisa */}
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 dark:text-[#8696a0] absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Buscar por atalho ou conteúdo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-white/5 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 bg-white dark:bg-[#182229]/40 dark:text-[#e9edef] dark:placeholder-[#8696a0] shadow-sm transition-all duration-200 font-medium"
            />
          </div>

          {/* Lista de Respostas */}
          {filteredReplies.length === 0 ? (
            <div className="text-center py-24 bg-white dark:bg-[#111B21] rounded-3xl border border-slate-100 dark:border-white/5 shadow-sm transition-colors duration-200 flex flex-col items-center justify-center">
              <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-full mb-4">
                <Zap className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              </div>
              <h3 className="text-base font-extrabold text-slate-800 dark:text-[#e9edef] mb-1.5 uppercase tracking-wide">Nenhuma resposta pronta encontrada</h3>
              <p className="text-xs font-semibold text-slate-400 dark:text-[#8696a0] max-w-xs">
                {searchTerm ? 'Tente buscar com outros termos.' : 'Clique no botão no topo para criar seu primeiro atalho.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredReplies.map((reply) => (
                <div key={reply.id} className="bg-white/80 dark:bg-[#182229]/30 backdrop-blur-md rounded-3xl p-5 border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-md hover:border-blue-500/20 dark:hover:border-blue-500/20 transition-all duration-300 group flex flex-col justify-between h-full relative overflow-hidden">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono font-black text-xs border border-blue-500/10">
                          {reply.shortcut}
                        </span>
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
                      
                      {/* Ações (Sempre visíveis mas mais discretas por padrão) */}
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
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal Criar/Editar */}
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
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm shadow-purple-500/20 font-black'
                        : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-700 dark:hover:text-[#d1d7db]'
                    }`}
                  >
                    <Video className="w-4 h-4" />
                    <span>Tutorial (Vídeo)</span>
                  </button>
                </div>
              </div>

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
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/5 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 resize-none bg-slate-50 dark:bg-black/10 text-slate-800 dark:text-[#e9edef] placeholder-slate-400 dark:placeholder-[#8696a0] font-medium"
                />
              </div>

              {/* Painel Premium de Visualização de Link Detectado */}
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

              {/* Interface Premium de I.A. & RAG (Gaveta Expansível) */}
              {isAiDrawerOpen && (
                <div className="p-5 bg-gradient-to-br from-blue-500/5 via-indigo-500/5 to-purple-500/5 border border-blue-500/10 dark:border-blue-500/25 rounded-[24px] animate-in slide-in-from-top-4 fade-in duration-300 relative overflow-hidden shadow-inner text-left">
                  
                  {/* Status do RAG */}
                  <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-slate-100 dark:border-white/5">
                     <span className="text-[10px] uppercase tracking-wider font-black text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                       <Sparkles size={12} className="text-indigo-500 animate-pulse" /> Redigir com I.A.
                     </span>
                     {ragDocuments.length > 0 ? (
                       <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-wider border border-emerald-500/10 animate-pulse" title="Sua base de conhecimento pgvector está ativa">
                         RAG Conectado
                       </span>
                     ) : (
                       <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-405 text-[9px] font-black uppercase tracking-wider border border-amber-500/10" title="A I.A. usará conhecimento global.">
                         Gemini Global
                       </span>
                     )}
                  </div>

                  {/* 1. Seleção Inteligente de Bases de RAG */}
                  {ragDocuments.length > 0 && (
                    <div className="mb-4">
                      <label className="text-[9px] font-black text-slate-400 dark:text-[#8696a0] uppercase tracking-wider flex items-center gap-1 mb-2">
                        <Building className="w-3.5 h-3.5 text-blue-500" />
                        <span>Bases de Conhecimento RAG</span>
                      </label>
                      <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto pr-1">
                        {ragDocuments.map(doc => {
                          const isSelected = selectedRagDocIds.includes(doc.id);
                          return (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedRagDocIds(selectedRagDocIds.filter(id => id !== doc.id));
                                } else {
                                  setSelectedRagDocIds([...selectedRagDocIds, doc.id]);
                                }
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-extrabold border active:scale-95 transition-all duration-200 cursor-pointer ${
                                isSelected 
                                  ? 'bg-blue-600 border-blue-500 text-white shadow-sm' 
                                  : 'bg-white dark:bg-black/10 border-slate-200 dark:border-white/5 text-slate-600 dark:text-[#d1d7db] hover:bg-slate-50 dark:hover:bg-white/5'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500/70 animate-pulse'}`}></span>
                              <span className="truncate max-w-[125px]">{doc.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 2. Seleção Premium de Tom de Voz */}
                  <div className="mb-4">
                    <label className="text-[9px] font-black text-slate-400 dark:text-[#8696a0] uppercase tracking-wider flex items-center gap-1 mb-2">
                      <Wand2 className="w-3.5 h-3.5 text-purple-500" />
                      <span>Estilo da Resposta</span>
                    </label>
                    <div className="grid grid-cols-5 gap-1 bg-slate-100 dark:bg-black/20 p-1 rounded-2xl border border-slate-200/50 dark:border-white/5">
                      {[
                        { id: 'professional', label: 'Polido', icon: '👔' },
                        { id: 'friendly', label: 'Amigo', icon: '😊' },
                        { id: 'persuasive', label: 'Vendas', icon: '🚀' },
                        { id: 'technical', label: 'Téc', icon: '🔧' },
                        { id: 'direct', label: 'Direto', icon: '⚡' }
                      ].map(t => {
                        const isSelected = aiTone === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setAiTone(t.id)}
                            className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[9px] font-black transition-all duration-200 cursor-pointer ${
                              isSelected 
                                ? 'bg-white dark:bg-[#202C33] text-blue-600 dark:text-blue-400 shadow-sm border dark:border-white/5 scale-[1.02]' 
                                : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-700 dark:hover:text-[#d1d7db]'
                            }`}
                          >
                            <span className="text-xs mb-0.5">{t.icon}</span>
                            <span>{t.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Input do Prompt */}
                  <div className="flex flex-col gap-1.5">
                     <label className="text-[9px] font-black text-slate-400 dark:text-[#8696a0] uppercase tracking-wider flex items-center gap-1">O que a I.A. deve responder?</label>
                     <div className="flex gap-2">
                       <input 
                         type="text"
                         value={aiPrompt}
                         onChange={(e) => setAiPrompt(e.target.value)}
                         onKeyDown={(e) => e.key === 'Enter' && handleGenerateWithAi()}
                         placeholder="Ex: Regras de frete grátis..."
                         className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-white/5 bg-white dark:bg-black/10 text-slate-800 dark:text-[#e9edef] focus:outline-none focus:ring-4 focus:ring-blue-500/10 placeholder-slate-450"
                       />
                       <button
                         type="button"
                         disabled={isGenerating || !aiPrompt.trim()}
                         onClick={handleGenerateWithAi}
                         className="bg-gradient-to-r from-blue-600 to-indigo-650 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl px-3 py-2 text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer"
                       >
                         {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                         <span>Gerar</span>
                       </button>
                     </div>
                  </div>

                  {/* 3. Painel de Matches do pgvector */}
                  {ragMatches.length > 0 && (
                    <div className="mt-4 p-3 bg-white/50 dark:bg-black/10 border border-blue-500/10 rounded-2xl animate-in slide-in-from-top-3 duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1">
                          <Sparkles size={11} className="text-amber-500 animate-pulse" />
                          <span>Fontes Consultadas (RAG)</span>
                        </label>
                        <span className="text-[8px] font-black bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full uppercase leading-none">
                          {ragMatches.length} fragmentos
                        </span>
                      </div>
                      
                      <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                        {ragMatches.map((match, idx) => {
                          const similarityPct = match.similarity ? Math.round(match.similarity * 100) : 90;
                          return (
                            <div key={idx} className="p-2.5 bg-white/70 dark:bg-black/10 border border-slate-200/50 dark:border-white/5 rounded-xl text-[10px] relative overflow-hidden group shadow-sm hover:shadow-md transition-all">
                              <div className="absolute top-0 right-0 h-full w-1 bg-gradient-to-b from-blue-500 to-indigo-500"></div>
                              
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-extrabold text-slate-700 dark:text-[#e9edef] truncate max-w-[200px]" title={match.docName || match.documentName || 'Documento RAG'}>
                                  📄 {match.docName || match.documentName || 'Documento RAG'}
                                </span>
                                <span className="text-[8px] font-black text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase leading-none">
                                  {similarityPct}% Relevância
                                </span>
                              </div>
                              
                              <p className="text-slate-500 dark:text-[#8696a0] italic line-clamp-2 leading-relaxed">
                                "{match.content}"
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Preview do Resultado Gerado */}
                  {aiGeneratedResult && (
                     <div className="mt-4 p-4 bg-white dark:bg-black/10 border border-blue-500/10 rounded-2xl animate-in zoom-in-95 duration-200 relative shadow-sm">
                        <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-slate-100 dark:border-white/5">
                           <span className="text-[9px] uppercase font-black text-slate-400 dark:text-[#8696a0] flex items-center gap-1.5">
                             Sugestão de Atalho: 
                             <span className="font-mono text-blue-600 dark:text-blue-400 font-bold bg-blue-500/5 dark:bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/10">
                               {aiGeneratedResult.shortcut}
                             </span>
                           </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-[#d1d7db] whitespace-pre-wrap leading-relaxed max-h-[140px] overflow-y-auto pr-1 font-medium bg-slate-50/50 dark:bg-black/10 p-3 rounded-xl border border-slate-100 dark:border-white/5">
                           {aiGeneratedResult.text}
                        </p>
                        
                        <div className="flex gap-2 mt-4 pt-2">
                           <button
                             type="button"
                             onClick={handleApplyAiResult}
                             className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 hover:scale-[1.02] active:scale-95 duration-200 cursor-pointer"
                           >
                             <CheckCircle2 size={13} />
                             <span>Aplicar no Formulário</span>
                           </button>
                           <button
                             type="button"
                             onClick={() => setAiGeneratedResult(null)}
                             className="px-4 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-[#d1d7db] py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center active:scale-95 cursor-pointer"
                           >
                             <span>Descartar</span>
                           </button>
                        </div>
                     </div>
                  )}
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                    {responseType === 'TUTORIAL' ? 'Vídeo do Tutorial' : 'Mídia Anexada (Opcional)'}
                  </label>
                  {responseType === 'TUTORIAL' && (
                    <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/15">
                      Obrigatório
                    </span>
                  )}
                </div>

                {responseType === 'TUTORIAL' && (
                  <p className="text-[11px] text-slate-500 dark:text-[#8696a0] mb-2 leading-relaxed">
                    O vídeo será preparado automaticamente para reprodução contínua no WhatsApp com o texto acima como legenda.
                  </p>
                )}

                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        if (responseType === 'TUTORIAL' && !file.type.startsWith('video/')) {
                          alert('Para respostas do tipo Tutorial, apenas arquivos de vídeo (preferencialmente .mp4) são permitidos.');
                          if (fileInputRef.current) fileInputRef.current.value = '';
                          return;
                        }
                        setMediaFile(file);
                        const objectUrl = URL.createObjectURL(file);
                        setMediaUrl(objectUrl);
                        const fileType = file.type;
                        if (fileType.startsWith('video/')) {
                          setMediaType('video');
                          const tempVideo = document.createElement('video');
                          tempVideo.preload = 'metadata';
                          tempVideo.src = objectUrl;
                          tempVideo.onloadedmetadata = () => {
                            const mins = Math.floor(tempVideo.duration / 60);
                            const secs = Math.floor(tempVideo.duration % 60);
                            setVideoDuration(`${mins}:${secs.toString().padStart(2, '0')}`);
                          };
                        } else if (fileType.startsWith('audio/')) {
                          setMediaType('audio');
                        } else if (fileType === 'application/pdf' || fileType.startsWith('application/') || fileType.startsWith('text/')) {
                          setMediaType('document');
                        } else {
                          setMediaType('image');
                        }
                      }
                    }}
                    className="hidden"
                    accept={responseType === 'TUTORIAL' ? "video/mp4,video/*" : "image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"}
                  />
                  
                  {!mediaUrl ? (
                    <div className="flex w-full gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-dashed rounded-2xl transition-colors cursor-pointer text-xs font-bold ${
                          responseType === 'TUTORIAL'
                            ? 'border-purple-400 dark:border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/5 hover:bg-purple-500/10'
                            : 'border-slate-350 dark:border-white/10 text-slate-550 dark:text-[#8696a0] hover:bg-slate-50 dark:hover:bg-white/5 hover:border-slate-400'
                        }`}
                      >
                        {responseType === 'TUTORIAL' ? <Video className="w-4.5 h-4.5" /> : <Paperclip className="w-4.5 h-4.5" />}
                        {responseType === 'TUTORIAL' ? 'Anexar Vídeo (.mp4)' : 'Anexar Arquivo'}
                      </button>
                      
                      {responseType !== 'TUTORIAL' && (
                        isRecording ? (
                          <button
                            type="button"
                            onClick={stopRecording}
                            className="flex items-center gap-2 px-4 py-3 border border-rose-500 bg-rose-500/10 rounded-2xl text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 transition-colors animate-pulse cursor-pointer text-xs font-bold"
                          >
                            <Square className="w-4.5 h-4.5 fill-current" />
                            {formatTime(recordingTime)}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={startRecording}
                            className="flex items-center gap-2 px-4 py-3 border border-slate-300 dark:border-white/10 rounded-2xl text-slate-550 dark:text-[#8696a0] hover:bg-slate-50 dark:hover:bg-white/5 hover:border-slate-400 transition-colors cursor-pointer text-xs font-bold"
                          >
                            <Mic className="w-4.5 h-4.5" />
                            Gravar
                          </button>
                        )
                      )}
                    </div>
                  ) : (
                    <div className={`relative w-full border rounded-2xl p-2.5 flex items-center gap-3 ${
                      responseType === 'TUTORIAL'
                        ? 'bg-purple-500/5 dark:bg-purple-500/10 border-purple-500/20'
                        : 'bg-slate-50 dark:bg-black/10 border-slate-200 dark:border-white/5'
                    }`}>
                      <div 
                        onClick={() => setPreviewMedia({ url: mediaUrl, type: (mediaType as any) || (responseType === 'TUTORIAL' ? 'video' : 'image') })}
                        className="w-14 h-14 bg-slate-250 dark:bg-black/20 rounded-xl flex items-center justify-center overflow-hidden shrink-0 cursor-pointer group/preview relative border dark:border-white/5 shadow-xs"
                        title="Ver em tela cheia / Reproduzir"
                      >
                        {mediaType === 'video' || responseType === 'TUTORIAL' ? (
                          <>
                            <video src={mediaUrl} className="w-full h-full object-cover" preload="metadata" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-70 group-hover/preview:opacity-100 transition-opacity">
                              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                            </div>
                          </>
                        ) : mediaType === 'audio' ? (
                          <div className="flex items-center justify-center w-full h-full bg-blue-100 dark:bg-blue-900/20">
                             <Mic className="w-4 h-4 text-blue-500" />
                          </div>
                        ) : mediaType === 'document' ? (
                          <div className="flex items-center justify-center w-full h-full bg-emerald-100 dark:bg-emerald-900/20">
                             <FileText className="w-4 h-4 text-emerald-500" />
                          </div>
                        ) : (
                          <>
                            <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity">
                              <Search className="w-4 h-4 text-white" />
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-xs font-bold text-slate-800 dark:text-[#e9edef] truncate leading-tight">
                          {mediaFile ? mediaFile.name : (responseType === 'TUTORIAL' ? 'Vídeo tutorial anexado' : 'Mídia salva')}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-black uppercase tracking-wider ${
                            responseType === 'TUTORIAL' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-[#8696a0]'
                          }`}>
                            {responseType === 'TUTORIAL' ? 'Vídeo Tutorial' : mediaType === 'video' ? 'Vídeo' : mediaType === 'audio' ? 'Áudio' : mediaType === 'document' ? 'Documento' : 'Imagem'}
                          </span>
                          {mediaFile && (
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                              • {(mediaFile.size / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          )}
                          {videoDuration && (
                            <span className="text-[10px] font-mono font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.2 rounded">
                              {videoDuration}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1.5 text-[11px] font-bold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                          title="Substituir Mídia"
                        >
                          Substituir
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMediaFile(null);
                            setMediaUrl(undefined);
                            setMediaType(undefined);
                            setVideoDuration(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="p-1.5 hover:bg-rose-500/10 text-rose-500 rounded-xl transition-colors cursor-pointer"
                          title="Remover"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-[#202C33]/30 flex justify-end gap-3 shrink-0 transition-colors duration-200">
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
                    {editingId ? 'Salvar' : 'Criar'}
                  </>
                )}
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
