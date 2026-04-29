import React, { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { Plus, Search, Edit2, Trash2, MessageSquareText, Zap, ChevronLeft, Save, Building, Paperclip, Image as ImageIcon, Video, X, Loader2, Copy, Mic, Square } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { uploadResumableFile } from '../services/tusUploader';

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
  const [previewMedia, setPreviewMedia] = useState<{ url: string, type: 'video' | 'image' | 'audio' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        
        await uploadResumableFile({
          bucketName: 'chat_media',
          fileName: fileName,
          file: mediaFile,
          onProgress: (_, __, percentage) => {
            setUploadProgress(percentage);
          },
          onSuccess: (url) => {
            finalMediaUrl = url;
          }
        });

        // Caso o onSuccess execute rápido, ou para assegurar a URL, tentamos buscar via getPublicUrl para fallback
        if (!finalMediaUrl) {
          const { data: publicUrlData } = supabase.storage
            .from('chat_media')
            .getPublicUrl(fileName);
          finalMediaUrl = publicUrlData.publicUrl;
        }

        finalMediaType = mediaFile.type.startsWith('video/') ? 'video' : 'image';
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
                                setPreviewMedia({ url: reply.media_url, type: reply.media_type as 'video' | 'image' | 'audio' });
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
                      <p className="text-gray-700 dark:text-[#d1d7db] whitespace-pre-wrap">{reply.content}</p>
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
                <label className="block text-sm font-medium text-gray-700 dark:text-[#d1d7db] mb-1">Conteúdo da Mensagem</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Olá! Como posso ajudar você hoje?"
                  rows={6}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none bg-white dark:bg-[#202C33] text-gray-900 dark:text-[#e9edef] placeholder-gray-400 dark:placeholder-[#8696a0]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[#d1d7db] mb-1">Mídia Anexada (Opcional)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setMediaFile(e.target.files[0]);
                        setMediaUrl(URL.createObjectURL(e.target.files[0]));
                        const fileType = e.target.files[0].type;
                        setMediaType(fileType.startsWith('video/') ? 'video' : fileType.startsWith('audio/') ? 'audio' : 'image');
                      }
                    }}
                    className="hidden"
                    accept="image/*,video/*,audio/*"
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
                        onClick={() => setPreviewMedia({ url: mediaUrl, type: mediaType as 'video' | 'image' | 'audio' })}
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
                          {mediaType === 'video' ? 'Vídeo' : mediaType === 'audio' ? 'Áudio' : 'Imagem'}
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
