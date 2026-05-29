import React, { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { Plus, Search, Edit2, Trash2, MessageSquareText, Zap, ChevronLeft, Save, Building, Paperclip, Image as ImageIcon, Video, X, Loader2, Copy, Mic, Square, Wand2, CheckCircle2, Sparkles, FileText, ExternalLink, Globe } from 'lucide-react';
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
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(undefined);
  const [mediaType, setMediaType] = useState<string | undefined>(undefined);
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
        await updateQuickReply(editingId, shortcut, content, finalMediaUrl, finalMediaType);
      } else {
        await addQuickReply(shortcut, content, finalMediaUrl, finalMediaType);
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
    setMediaFile(null);
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
    setEditingId(null);
    setMediaFile(null);
    setMediaUrl(undefined);
    setMediaType(undefined);
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
    <div className="h-screen bg-gray-50 dark:bg-[#0b141a] flex flex-col transition-colors duration-200">
      {/* Header Premium */}
      <header className="bg-white dark:bg-[#111B21] border-b dark:border-white/5 px-6 py-4 flex items-center justify-between sticky top-0 z-10 transition-colors duration-200">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/admin')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-[#d1d7db]" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-[#e9edef] flex items-center gap-2">
              <MessageSquareText className="w-6 h-6 text-blue-600" />
              Respostas Prontas
            </h1>
            <p className="text-sm text-gray-500 dark:text-[#8696a0]">
              Gerencie atalhos para respostas rápidas (ex: /ola).
            </p>
          </div>
        </div>
        
        <button 
          onClick={openNewModal}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-sm shadow-blue-200"
        >
          <Plus className="w-5 h-5" />
          Nova Resposta
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Barra de Pesquisa */}
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 dark:text-[#8696a0] absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Buscar por atalho ou conteúdo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-[#202C33] dark:text-[#e9edef] dark:placeholder-[#8696a0] shadow-sm transition-colors duration-200"
            />
          </div>

          {/* Lista de Respostas */}
          {filteredReplies.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-[#111B21] rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm transition-colors duration-200">
              <Zap className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-[#e9edef] mb-2">Nenhuma resposta pronta encontrada</h3>
              <p className="text-gray-500 dark:text-[#8696a0]">
                {searchTerm ? 'Tente buscar com outros termos.' : 'Clique no botão acima para criar seu primeiro atalho.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredReplies.map((reply) => (
                <div key={reply.id} className="bg-white dark:bg-[#111B21] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md dark:hover:shadow-black/50 transition-all duration-300 group animate-in slide-in-from-bottom-2 fade-in">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <div className="inline-flex items-center px-3 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium text-sm">
                          {reply.shortcut}
                        </div>
                        {tenantInfo?.name && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-[#8696a0] text-xs font-medium border border-gray-200 dark:border-white/10" title="Empresa">
                            <Building className="w-3.5 h-3.5" />
                            {tenantInfo.name}
                          </div>
                        )}
                        {reply.media_url && (
                          <div className="flex items-center gap-2 mt-3">
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewMedia({ url: reply.media_url, type: reply.media_type as 'video' | 'image' | 'audio' | 'document' });
                              }}
                              className="inline-flex items-center gap-3 px-3 py-2 rounded-2xl bg-white/50 dark:bg-white/5 text-gray-700 dark:text-[#8696a0] text-xs font-semibold border border-gray-200 dark:border-white/10 hover:bg-white dark:hover:bg-white/10 transition-all cursor-pointer group shadow-sm hover:shadow-md"
                              title="Ver Mídia"
                            >
                              {reply.media_type === 'video' ? (
                                <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-black/10 flex items-center justify-center">
                                  <video src={reply.media_url} className="w-full h-full object-cover" preload="metadata" />
                                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                    <Video className="w-5 h-5 text-white" />
                                  </div>
                                </div>
                              ) : reply.media_type === 'audio' ? (
                                <div className="w-16 h-16 rounded-xl overflow-hidden bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                  <Mic className="w-6 h-6 text-blue-500" />
                                </div>
                              ) : reply.media_type === 'document' ? (
                                <div className="w-16 h-16 rounded-xl overflow-hidden bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                  <FileText className="w-6 h-6 text-emerald-500" />
                                </div>
                              ) : (
                                <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/10">
                                  <img src={reply.media_url} alt="Mídia anexada" className="w-full h-full object-cover" />
                                </div>
                              )}
                              <span>Ver Mídia</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(reply.media_url);
                                alert('Link da mídia copiado!');
                              }}
                              className="p-3 text-gray-500 hover:text-blue-600 bg-white/50 dark:bg-white/5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-2xl transition-all shadow-sm hover:shadow-md border border-gray-200 dark:border-white/10"
                              title="Copiar Link Público"
                            >
                              <Copy className="w-5 h-5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <ExpandableText content={reply.content} />
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEdit(reply)}
                        className="p-2 text-gray-400 dark:text-[#8696a0] hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(reply.id)}
                        className="p-2 text-gray-400 dark:text-[#8696a0] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal Criar/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111B21] rounded-3xl w-full max-w-lg shadow-2xl dark:shadow-black/80 overflow-hidden animate-in zoom-in-95 duration-200 border dark:border-white/5">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-gray-50/50 dark:bg-[#202C33]">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-[#e9edef] flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                {editingId ? 'Editar Resposta' : 'Nova Resposta Pronta'}
              </h2>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[#d1d7db] mb-1">Atalho (Shortcut)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={shortcut}
                    onChange={(e) => setShortcut(e.target.value)}
                    placeholder="/ola"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-mono text-sm bg-white dark:bg-[#202C33] text-gray-900 dark:text-[#e9edef] placeholder-gray-400 dark:placeholder-[#8696a0]"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-[#8696a0]">
                    Obrigatório iniciar com /
                  </div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-[#d1d7db]">Conteúdo da Mensagem</label>
                  <button
                    type="button"
                    onClick={() => setIsAiDrawerOpen(!isAiDrawerOpen)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md shadow-indigo-500/10 transition-all hover:scale-[1.03] active:scale-[0.98] duration-200 group relative overflow-hidden"
                  >
                    <Sparkles size={11} className="text-white animate-pulse" />
                    <span>I.A. Assistente RAG</span>
                  </button>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Olá! Como posso ajudar você hoje?"
                  rows={6}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none bg-white dark:bg-[#202C33] text-gray-900 dark:text-[#e9edef] placeholder-gray-400 dark:placeholder-[#8696a0]"
                />
              </div>

              {/* Painel Premium de Visualização de Link Detectado */}
              {(isLoadingPreview || linkPreviewData) && (
                <div className="p-4 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 dark:border-blue-500/35 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-300 relative overflow-hidden backdrop-blur-md shadow-lg dark:shadow-black/40 flex gap-4">
                  {isLoadingPreview ? (
                    <div className="flex items-center justify-center w-full py-4 gap-3">
                      <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
                      <span className="text-xs font-semibold text-gray-500 dark:text-[#8696a0] animate-pulse">Obtendo pré-visualização premium do link...</span>
                    </div>
                  ) : (
                    linkPreviewData && (
                      <>
                        {linkPreviewData.image ? (
                          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-black/5 dark:bg-white/5 border dark:border-white/10 shrink-0 shadow-sm relative group">
                            <img 
                              src={linkPreviewData.image} 
                              alt="Thumbnail do link" 
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" 
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-20 h-20 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                            <Globe className="w-8 h-8 animate-pulse" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                          <div>
                            <div className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                              <span className="flex h-1.5 w-1.5 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                              </span>
                              Link Detectado
                            </div>
                            <h4 className="text-xs font-black text-gray-800 dark:text-[#e9edef] truncate leading-tight mb-0.5">
                              {linkPreviewData.title || "Visualizar Link"}
                            </h4>
                            <p className="text-[11px] text-gray-500 dark:text-[#8696a0] line-clamp-2 leading-snug">
                              {linkPreviewData.description || "Sem descrição disponível."}
                            </p>
                          </div>
                          
                          <a 
                            href={linkPreviewData.url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-1 text-[10px] font-extrabold text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 mt-2 hover:underline transition-all active:scale-95"
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
                <div className="p-5 bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-purple-500/5 border border-blue-500/20 dark:border-blue-500/35 rounded-3xl animate-in slide-in-from-top-4 fade-in duration-300 relative overflow-hidden backdrop-blur-md shadow-lg dark:shadow-black/40">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
                  <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-purple-500/10 rounded-full blur-xl pointer-events-none"></div>
                  
                  {/* Status do RAG */}
                  <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-gray-200/50 dark:border-white/5">
                     <span className="text-[11px] uppercase tracking-wider font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                       <Sparkles size={13} className="animate-pulse text-indigo-500" /> Redigir com I.A.
                     </span>
                     {ragDocuments.length > 0 ? (
                       <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-extrabold border border-emerald-500/20 shadow-sm animate-pulse" title="Sua base de conhecimento pgvector está ativa">
                         <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                         RAG Conectado ({ragDocuments.length} bases)
                       </span>
                     ) : (
                       <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-extrabold border border-amber-500/20 shadow-sm" title="Nenhuma base de conhecimento cadastrada. A I.A. usará conhecimento global.">
                         <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                         Gemini Global Ativo
                       </span>
                     )}
                  </div>

                  {/* 1. Seleção Inteligente de Bases de RAG */}
                  {ragDocuments.length > 0 && (
                    <div className="mb-4">
                      <label className="text-[10px] font-bold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide flex items-center gap-1 mb-2">
                        <Building className="w-3.5 h-3.5 text-blue-500" />
                        <span>Focar em Bases de Conhecimento específicas</span>
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
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-[11px] font-semibold border backdrop-blur-md active:scale-95 transition-all duration-300 ${
                                isSelected 
                                  ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20' 
                                  : 'bg-white/40 dark:bg-white/5 border-gray-200/50 dark:border-white/10 text-gray-600 dark:text-[#d1d7db] hover:bg-white/80 dark:hover:bg-white/10'
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
                    <label className="text-[10px] font-bold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide flex items-center gap-1 mb-2">
                      <Wand2 className="w-3.5 h-3.5 text-purple-500" />
                      <span>Estilo / Tom de Voz da Resposta</span>
                    </label>
                    <div className="grid grid-cols-5 gap-1 bg-gray-100/50 dark:bg-black/30 p-1 rounded-2xl border border-gray-200/40 dark:border-white/5 backdrop-blur-md">
                      {[
                        { id: 'professional', label: 'Polido', icon: '👔' },
                        { id: 'friendly', label: 'Amigável', icon: '😊' },
                        { id: 'persuasive', label: 'Vendas', icon: '🚀' },
                        { id: 'technical', label: 'Técnico', icon: '🔧' },
                        { id: 'direct', label: 'Direto', icon: '⚡' }
                      ].map(t => {
                        const isSelected = aiTone === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setAiTone(t.id)}
                            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all duration-300 active:scale-95 ${
                              isSelected 
                                ? 'bg-white dark:bg-[#202C33] text-blue-600 dark:text-blue-400 shadow-md border border-gray-200/20 scale-[1.03]' 
                                : 'text-gray-500 dark:text-[#8696a0] hover:text-gray-700 dark:hover:text-[#d1d7db]'
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
                     <label className="text-[10px] font-bold text-gray-500 dark:text-[#8696a0] uppercase tracking-wide flex items-center gap-1">O que a I.A. deve responder?</label>
                     <div className="flex gap-2">
                       <input 
                         type="text"
                         value={aiPrompt}
                         onChange={(e) => setAiPrompt(e.target.value)}
                         onKeyDown={(e) => e.key === 'Enter' && handleGenerateWithAi()}
                         placeholder="Ex: Explique as regras de troca e frete grátis..."
                         className="flex-1 px-4 py-2.5 text-xs rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#202C33] text-gray-900 dark:text-[#e9edef] focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-gray-400 dark:placeholder-[#8696a0]"
                       />
                       <button
                         type="button"
                         disabled={isGenerating || !aiPrompt.trim()}
                         onClick={handleGenerateWithAi}
                         className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl px-4 py-2.5 text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                       >
                         {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                         <span>Gerar</span>
                       </button>
                     </div>
                  </div>

                  {/* 3. Painel de Matches do pgvector */}
                  {ragMatches.length > 0 && (
                    <div className="mt-4 p-3 bg-white/40 dark:bg-black/20 border border-blue-500/10 rounded-2xl animate-in slide-in-from-top-3 duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles size={11} className="text-amber-500 animate-pulse" />
                          <span>Trechos Semânticos Extraídos (RAG)</span>
                        </label>
                        <span className="text-[9px] font-bold bg-blue-500/10 text-blue-500 dark:text-blue-400 px-2 py-0.5 rounded-full">
                          {ragMatches.length} fragmentos encontrados
                        </span>
                      </div>
                      
                      <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                        {ragMatches.map((match, idx) => {
                          const similarityPct = match.similarity ? Math.round(match.similarity * 100) : 90;
                          return (
                            <div key={idx} className="p-2.5 bg-white/70 dark:bg-white/5 border border-gray-200/50 dark:border-white/5 rounded-xl text-[11px] relative overflow-hidden group shadow-sm hover:shadow-md transition-all">
                              <div className="absolute top-0 right-0 h-full w-1 bg-gradient-to-b from-blue-500 to-indigo-500"></div>
                              
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-bold text-gray-800 dark:text-[#e9edef] truncate max-w-[200px]" title={match.docName || match.documentName || 'Documento RAG'}>
                                  📄 {match.docName || match.documentName || 'Documento RAG'}
                                </span>
                                <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                  Relevância: {similarityPct}%
                                </span>
                              </div>
                              
                              <p className="text-gray-600 dark:text-[#8696a0] italic line-clamp-2 leading-relaxed">
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
                     <div className="mt-4 p-4 bg-white/80 dark:bg-[#111B21] border border-blue-500/10 dark:border-white/5 rounded-2xl animate-in zoom-in-95 duration-200 relative shadow-sm">
                        <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-gray-100 dark:border-white/5">
                           <span className="text-[10px] uppercase font-extrabold text-gray-500 dark:text-[#8696a0] flex items-center gap-1.5">
                             Sugestão de Atalho: 
                             <span className="font-mono text-blue-600 dark:text-blue-400 font-bold bg-blue-500/5 dark:bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/10">
                               {aiGeneratedResult.shortcut}
                             </span>
                           </span>
                        </div>
                        <p className="text-[12px] text-gray-700 dark:text-[#d1d7db] whitespace-pre-wrap leading-relaxed max-h-[140px] overflow-y-auto pr-1 font-medium bg-gray-50/50 dark:bg-[#202C33]/50 p-3 rounded-xl border border-gray-100 dark:border-white/5">
                           {aiGeneratedResult.text}
                        </p>
                        
                        <div className="flex gap-2 mt-4 pt-2">
                           <button
                             type="button"
                             onClick={handleApplyAiResult}
                             className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white py-2.5 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/10 transition-all flex items-center justify-center gap-1.5 hover:scale-[1.02] active:scale-95 duration-200"
                           >
                             <CheckCircle2 size={14} />
                             <span>Aplicar no Formulário</span>
                           </button>
                           <button
                             type="button"
                             onClick={() => setAiGeneratedResult(null)}
                             className="px-4 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-600 dark:text-[#d1d7db] py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center active:scale-95"
                           >
                             <span>Descartar</span>
                           </button>
                        </div>
                     </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[#d1d7db] mb-1">Mídia Anexada (Opcional)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        setMediaFile(file);
                        setMediaUrl(URL.createObjectURL(file));
                        const fileType = file.type;
                        if (fileType.startsWith('video/')) {
                          setMediaType('video');
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
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                  />
                  
                  {!mediaUrl ? (
                    <div className="flex w-full gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-gray-300 dark:border-white/20 rounded-xl text-gray-600 dark:text-[#8696a0] hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-400 transition-colors"
                      >
                        <Paperclip className="w-5 h-5" />
                        Anexar Arquivo
                      </button>
                      
                      {isRecording ? (
                        <button
                          onClick={stopRecording}
                          className="flex items-center gap-2 px-4 py-3 border border-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors animate-pulse"
                        >
                          <Square className="w-5 h-5 fill-current" />
                          {formatTime(recordingTime)}
                        </button>
                      ) : (
                        <button
                          onClick={startRecording}
                          className="flex items-center gap-2 px-4 py-3 border border-gray-300 dark:border-white/20 rounded-xl text-gray-600 dark:text-[#8696a0] hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-400 transition-colors"
                        >
                          <Mic className="w-5 h-5" />
                          Gravar
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="relative w-full border border-gray-200 dark:border-white/10 rounded-xl p-2 flex items-center gap-3 bg-gray-50 dark:bg-[#202C33]">
                      <div 
                        onClick={() => setPreviewMedia({ url: mediaUrl, type: mediaType as 'video' | 'image' | 'audio' | 'document' })}
                        className="w-12 h-12 bg-gray-200 dark:bg-[#111B21] rounded-lg flex items-center justify-center overflow-hidden shrink-0 cursor-pointer group/preview relative"
                        title="Ver em tela cheia"
                      >
                        {mediaType === 'video' ? (
                          <>
                            <video src={mediaUrl} className="w-full h-full object-cover" preload="metadata" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity">
                              <Search className="w-5 h-5 text-white" />
                            </div>
                          </>
                        ) : mediaType === 'audio' ? (
                          <div className="flex items-center justify-center w-full h-full bg-blue-100 dark:bg-blue-900/30">
                             <Mic className="w-6 h-6 text-blue-500" />
                          </div>
                        ) : mediaType === 'document' ? (
                          <div className="flex items-center justify-center w-full h-full bg-emerald-100 dark:bg-emerald-900/30">
                             <FileText className="w-6 h-6 text-emerald-500" />
                          </div>
                        ) : (
                          <>
                            <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity">
                              <Search className="w-5 h-5 text-white" />
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex-1 truncate">
                        <p className="text-sm font-medium text-gray-800 dark:text-[#e9edef] truncate">
                          {mediaFile ? mediaFile.name : 'Mídia salva'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-[#8696a0]">
                          {mediaType === 'video' ? 'Vídeo' : mediaType === 'audio' ? 'Áudio' : mediaType === 'document' ? 'Documento' : 'Imagem'}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setMediaFile(null);
                          setMediaUrl(undefined);
                          setMediaType(undefined);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-[#202C33] flex justify-end gap-3 transition-colors duration-200">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 rounded-xl font-medium text-gray-600 dark:text-[#d1d7db] hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isUploading}
                className="px-5 py-2.5 rounded-xl font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm shadow-blue-200 flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {uploadProgress ? `${uploadProgress}%` : 'Enviando...'}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {editingId ? 'Salvar Alterações' : 'Criar Atalho'}
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
          className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[100] animate-in fade-in duration-300"
          onClick={() => setPreviewMedia(null)}
        >
          <button 
            onClick={() => setPreviewMedia(null)}
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-10"
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
                className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain bg-black"
              />
            ) : previewMedia.type === 'audio' ? (
              <div className="bg-white dark:bg-[#202C33] p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-6 min-w-[300px]">
                <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center animate-pulse">
                  <Mic className="w-10 h-10 text-blue-500" />
                </div>
                <audio src={previewMedia.url} controls autoPlay className="w-full max-w-sm" />
              </div>
            ) : previewMedia.type === 'document' ? (
              <div className="bg-white dark:bg-[#111B21] p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4 w-full max-w-4xl h-[80vh] overflow-hidden border border-white/10" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between w-full pb-3 border-b border-gray-100 dark:border-white/5">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-[#e9edef] flex items-center gap-2">
                    <FileText className="w-6 h-6 text-emerald-500 animate-pulse" />
                    Visualização do Documento
                  </h3>
                  <a 
                    href={previewMedia.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 flex items-center gap-1.5 hover:scale-[1.02] active:scale-95 duration-200"
                  >
                    Abrir em Nova Aba
                  </a>
                </div>
                {previewMedia.url.toLowerCase().endsWith('.pdf') || previewMedia.url.includes('pdf') || previewMedia.url.startsWith('blob:') ? (
                  <iframe 
                    src={previewMedia.url} 
                    className="w-full flex-1 rounded-2xl border border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#202C33]"
                    title="Visualização do PDF"
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center py-12">
                    <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mb-4">
                      <FileText className="w-10 h-10 text-emerald-500" />
                    </div>
                    <p className="text-sm font-medium text-gray-800 dark:text-[#e9edef] text-center mb-2">
                      Este documento não suporta visualização direta.
                    </p>
                    <p className="text-xs text-gray-500 dark:text-[#8696a0] text-center mb-6 max-w-sm">
                      Clique no botão acima para abrir e fazer o download do documento de forma nativa.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <img 
                src={previewMedia.url} 
                alt="Visualização em Tela Cheia" 
                className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain bg-black/50"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
