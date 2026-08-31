import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Image as ImageIcon, 
  Film, 
  Mic, 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Download, 
  ExternalLink, 
  X, 
  Paperclip, 
  Eye, 
  Sparkles, 
  Volume2,
  Plus,
  Loader2,
  UploadCloud
} from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface CardMediaItem {
  id: string;
  url: string;
  name: string;
  type: 'image' | 'video' | 'audio';
  caption?: string;
}

/**
 * Função utilitária para extrair todas as mídias (imagens, vídeos e áudios)
 * embutidas no markdown de notas ou campos anexados do card.
 */
export function extractCardMedia(notes?: string | null): CardMediaItem[] {
  if (!notes || typeof notes !== 'string') return [];

  const items: CardMediaItem[] = [];
  const seenUrls = new Set<string>();

  const cleanUrl = (rawUrl: string): string => {
    return rawUrl.trim().replace(/[\)\]"'\.,;]+$/, '').trim();
  };

  const cleanName = (rawName: string): string => {
    const trimmed = rawName.trim().replace(/^📸\s*|!\[|\]$/g, '').trim();
    return trimmed || 'Evidência Anexada';
  };

  // 1. Regex para imagens markdown: ![nome](url)
  const imageRegex = /!\[(.*?)\]\((https?:\/\/[^\s\)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(notes)) !== null) {
    const rawName = cleanName(match[1] || 'Imagem Anexada');
    const url = cleanUrl(match[2] || '');
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      items.push({
        id: `img-${items.length}-${Math.random().toString(36).substring(2, 7)}`,
        url,
        name: rawName,
        type: 'image'
      });
    }
  }

  // 2. Regex para vídeos markdown: 🎥 [nome](url) ou links diretos com extensão de vídeo
  const videoRegex = /(?:🎥\s*)?\[(.*?)\]\((https?:\/\/[^\s\)]+\.(?:mp4|webm|mov|ogg)(?:\?[^\s\)]*)?)\)/gi;
  while ((match = videoRegex.exec(notes)) !== null) {
    const rawName = cleanName(match[1] || 'Vídeo Anexado');
    const url = cleanUrl(match[2] || '');
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      items.push({
        id: `vid-${items.length}-${Math.random().toString(36).substring(2, 7)}`,
        url,
        name: rawName,
        type: 'video'
      });
    }
  }

  // 3. Regex para áudios markdown: 🎙️ [nome](url) ou links diretos com extensão de áudio
  const audioRegex = /(?:🎙️\s*)?\[(.*?)\]\((https?:\/\/[^\s\)]+\.(?:mp3|wav|ogg|m4a|aac|opus)(?:\?[^\s\)]*)?)\)/gi;
  while ((match = audioRegex.exec(notes)) !== null) {
    const rawName = cleanName(match[1] || 'Áudio Anexado');
    const url = cleanUrl(match[2] || '');
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      items.push({
        id: `aud-${items.length}-${Math.random().toString(36).substring(2, 7)}`,
        url,
        name: rawName,
        type: 'audio'
      });
    }
  }

  // 4. Regex para URLs soltas de storage chat_media que não estejam dentro de markdown
  const storageRegex = /(https?:\/\/[^\s"'<>]+\/chat_media\/crm_cards\/[^\s"'<>]+)/gi;
  while ((match = storageRegex.exec(notes)) !== null) {
    const url = cleanUrl(match[1] || '');
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      const fileName = url.split('/').pop()?.split('?')[0] || 'Evidência Anexada';
      const isVideo = /\.(mp4|webm|mov)$/i.test(fileName);
      const isAudio = /\.(mp3|wav|ogg|m4a|opus)$/i.test(fileName);
      items.push({
        id: `storage-${items.length}-${Math.random().toString(36).substring(2, 7)}`,
        url,
        name: fileName,
        type: isVideo ? 'video' : isAudio ? 'audio' : 'image'
      });
    }
  }

  return items;
}

interface CardMediaCarouselProps {
  notes?: string | null;
  cardTitle?: string;
  className?: string;
  variant?: 'compact' | 'full' | 'hero';
  showTitle?: boolean;
  onUploadMedia?: (file: File) => Promise<void>;
  isUploading?: boolean;
}

export function CardMediaCarousel({
  notes,
  cardTitle,
  className = '',
  variant = 'full',
  showTitle = true,
  onUploadMedia,
  isUploading = false
}: CardMediaCarouselProps) {
  const mediaItems = useMemo(() => extractCardMedia(notes), [notes]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Garantir que currentIndex esteja dentro do range
  useEffect(() => {
    if (currentIndex >= mediaItems.length && mediaItems.length > 0) {
      setCurrentIndex(0);
    }
  }, [mediaItems.length, currentIndex]);

  const currentItem = mediaItems[currentIndex];

  const handlePrev = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentIndex(prev => (prev === 0 ? mediaItems.length - 1 : prev - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCurrentIndex(prev => (prev === mediaItems.length - 1 ? 0 : prev + 1));
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setZoomLevel(1);
    setLightboxOpen(true);
  };

  const handleLightboxPrev = () => {
    setLightboxIndex(prev => (prev === 0 ? mediaItems.length - 1 : prev - 1));
    setZoomLevel(1);
  };

  const handleLightboxNext = () => {
    setLightboxIndex(prev => (prev === mediaItems.length - 1 ? 0 : prev + 1));
    setZoomLevel(1);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0] && onUploadMedia) {
      await onUploadMedia(files[0]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Keyboard navigation no lightbox
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!lightboxOpen) return;
    if (e.key === 'Escape') setLightboxOpen(false);
    if (e.key === 'ArrowLeft') handleLightboxPrev();
    if (e.key === 'ArrowRight') handleLightboxNext();
  }, [lightboxOpen, mediaItems.length]);

  useEffect(() => {
    if (lightboxOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [lightboxOpen, handleKeyDown]);

  if (!mediaItems || mediaItems.length === 0) {
    if (!onUploadMedia) return null;

    // Estado vazio com opção de upload se callback for fornecido
    return (
      <div className={cn(
        "rounded-2xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#182229]/40 p-4 text-center space-y-2",
        className
      )}>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="image/*,video/*,audio/*" 
          className="hidden" 
        />
        <div className="flex flex-col items-center justify-center gap-1.5 py-2">
          <Paperclip size={18} className="text-slate-400" />
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
            Nenhuma evidência ou captura anexada a este card
          </p>
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="mt-1 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-extrabold border border-indigo-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Enviando...</span>
              </>
            ) : (
              <>
                <Plus size={13} />
                <span>Anexar Captura / Evidência</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  const activeLightboxItem = mediaItems[lightboxIndex] || currentItem;

  return (
    <>
      <div className={cn(
        "rounded-2xl border border-indigo-500/20 dark:border-indigo-500/15 bg-gradient-to-br from-indigo-500/[0.04] via-slate-50/50 to-purple-500/[0.03] dark:from-indigo-500/[0.08] dark:via-[#182229] dark:to-[#111b21] p-4 shadow-sm overflow-hidden flex flex-col gap-3 transition-all",
        className
      )}>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="image/*,video/*,audio/*" 
          className="hidden" 
        />

        {/* Cabeçalho do Carrossel */}
        {showTitle && (
          <div className="flex items-center justify-between gap-2 border-b border-indigo-500/10 dark:border-white/5 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Paperclip size={13} />
              </div>
              <div className="flex items-center gap-1.5">
                <h4 className="text-[11px] font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  Mídias & Evidências Anexadas
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 font-extrabold text-[9px]">
                  {mediaItems.length} {mediaItems.length === 1 ? 'mídia' : 'mídias'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onUploadMedia && (
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-xs"
                  title="Anexar mais evidências"
                >
                  {isUploading ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Plus size={11} />
                  )}
                  <span>Anexar</span>
                </button>
              )}

              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                <span>{currentIndex + 1} de {mediaItems.length}</span>
              </div>
            </div>
          </div>
        )}

        {/* Área Principal de Visualização da Mídia Atual */}
        {currentItem && (
          <div className="relative group/media rounded-xl overflow-hidden bg-slate-900/5 dark:bg-black/40 border border-slate-200/60 dark:border-white/5 flex items-center justify-center min-h-[180px] max-h-[340px]">
            {currentItem.type === 'image' ? (
              <img 
                src={currentItem.url} 
                alt={currentItem.name}
                onClick={() => openLightbox(currentIndex)}
                className="w-full h-full object-contain max-h-[340px] cursor-zoom-in transition-transform duration-300 hover:scale-[1.01]"
                loading="lazy"
              />
            ) : currentItem.type === 'video' ? (
              <video 
                src={currentItem.url} 
                controls 
                className="w-full max-h-[340px] rounded-xl object-contain bg-black"
              />
            ) : (
              <div className="p-6 flex flex-col items-center gap-3 text-slate-600 dark:text-slate-300 w-full">
                <div className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-500 flex items-center justify-center">
                  <Mic size={24} />
                </div>
                <span className="font-bold text-xs">{currentItem.name}</span>
                <audio src={currentItem.url} controls className="w-full max-w-sm" />
              </div>
            )}

            {/* Badge de Tipo de Mídia */}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/65 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-wider border border-white/10 shadow-sm pointer-events-none">
              {currentItem.type === 'image' ? (
                <>
                  <ImageIcon size={11} className="text-emerald-400" />
                  <span>Captura de Tela / Imagem</span>
                </>
              ) : currentItem.type === 'video' ? (
                <>
                  <Film size={11} className="text-amber-400" />
                  <span>Vídeo da Ocorrência</span>
                </>
              ) : (
                <>
                  <Volume2 size={11} className="text-purple-400" />
                  <span>Áudio Anexado</span>
                </>
              )}
            </div>

            {/* Botão de Expandir / Fullscreen no Hover */}
            <button
              type="button"
              onClick={() => openLightbox(currentIndex)}
              className="absolute top-2.5 right-2.5 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/15 opacity-0 group-hover/media:opacity-100 transition-all duration-200 cursor-pointer shadow-lg active:scale-95"
              title="Abrir em Tela Cheia"
            >
              <Maximize2 size={13} />
            </button>

            {/* Botões de Navegação Anterior/Próximo (se houver mais de 1 mídia) */}
            {mediaItems.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-black/60 hover:bg-black/85 text-white backdrop-blur-md border border-white/15 opacity-80 hover:opacity-100 transition-all duration-200 cursor-pointer shadow-lg active:scale-95 z-10"
                  title="Mídia Anterior"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-black/60 hover:bg-black/85 text-white backdrop-blur-md border border-white/15 opacity-80 hover:opacity-100 transition-all duration-200 cursor-pointer shadow-lg active:scale-95 z-10"
                  title="Próxima Mídia"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}
          </div>
        )}

        {/* Rodapé: Miniaturas e Ações Rápidas */}
        {mediaItems.length > 1 && (
          <div className="flex items-center justify-between gap-2 pt-1 overflow-x-auto custom-scrollbar">
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {mediaItems.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    "relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 cursor-pointer bg-black/20",
                    currentIndex === idx 
                      ? "border-indigo-500 ring-2 ring-indigo-500/30 scale-105" 
                      : "border-transparent opacity-60 hover:opacity-100"
                  )}
                >
                  {item.type === 'image' ? (
                    <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                  ) : item.type === 'video' ? (
                    <div className="w-full h-full flex items-center justify-center bg-slate-800 text-amber-400">
                      <Film size={14} />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-800 text-purple-400">
                      <Mic size={14} />
                    </div>
                  )}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => openLightbox(currentIndex)}
              className="px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 rounded-lg text-[10px] font-bold border border-indigo-500/20 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Eye size={12} />
              <span>Ver Galeria ({mediaItems.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* MODAL LIGHTBOX FULLSCREEN */}
      {lightboxOpen && activeLightboxItem && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-2xl animate-in fade-in duration-200">
          {/* Header Superior do Lightbox */}
          <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 flex items-center justify-between z-20 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 rounded-xl bg-white/10 text-white text-xs font-black uppercase tracking-wider backdrop-blur-md border border-white/10">
                {lightboxIndex + 1} / {mediaItems.length}
              </div>
              <div className="flex flex-col">
                <span className="text-white font-extrabold text-sm truncate max-w-xs sm:max-w-md">
                  {activeLightboxItem.name}
                </span>
                {cardTitle && (
                  <span className="text-slate-400 text-xs truncate max-w-xs sm:max-w-md">
                    Card: {cardTitle}
                  </span>
                )}
              </div>
            </div>

            {/* Ações da Barra Superior */}
            <div className="flex items-center gap-2">
              {activeLightboxItem.type === 'image' && (
                <>
                  <button
                    type="button"
                    onClick={() => setZoomLevel(prev => Math.min(prev + 0.5, 4))}
                    className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/10 transition-all cursor-pointer"
                    title="Aumentar Zoom"
                  >
                    <ZoomIn size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomLevel(prev => Math.max(prev - 0.5, 1))}
                    className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/10 transition-all cursor-pointer"
                    title="Diminuir Zoom"
                  >
                    <ZoomOut size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomLevel(1)}
                    className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/10 transition-all cursor-pointer"
                    title="Resetar Zoom"
                  >
                    <RotateCcw size={16} />
                  </button>
                </>
              )}

              <a
                href={activeLightboxItem.url}
                target="_blank"
                rel="noreferrer"
                download={activeLightboxItem.name}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/10 transition-all flex items-center justify-center cursor-pointer"
                title="Download / Abrir em Nova Aba"
              >
                <Download size={16} />
              </a>

              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="p-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 backdrop-blur-md border border-rose-500/30 transition-all cursor-pointer ml-2"
                title="Fechar (Esc)"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Conteúdo Central do Lightbox */}
          <div className="relative w-full h-full flex items-center justify-center p-6 sm:p-16 overflow-hidden">
            {activeLightboxItem.type === 'image' ? (
              <div 
                className="w-full h-full flex items-center justify-center overflow-auto custom-scrollbar cursor-grab active:cursor-grabbing"
              >
                <img 
                  src={activeLightboxItem.url} 
                  alt={activeLightboxItem.name}
                  style={{ transform: `scale(${zoomLevel})` }}
                  className="max-h-[85vh] max-w-[90vw] object-contain transition-transform duration-200 select-none shadow-2xl rounded-xl"
                />
              </div>
            ) : activeLightboxItem.type === 'video' ? (
              <video 
                src={activeLightboxItem.url} 
                controls 
                autoPlay 
                className="max-h-[80vh] max-w-[90vw] rounded-2xl shadow-2xl bg-black"
              />
            ) : (
              <div className="p-8 bg-slate-900/80 border border-white/10 rounded-3xl flex flex-col items-center gap-4 text-white shadow-2xl">
                <div className="w-16 h-16 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Mic size={32} />
                </div>
                <span className="font-extrabold text-base">{activeLightboxItem.name}</span>
                <audio src={activeLightboxItem.url} controls autoPlay className="w-full min-w-[320px]" />
              </div>
            )}

            {/* Setas de Navegação no Lightbox */}
            {mediaItems.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handleLightboxPrev}
                  className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 p-3.5 rounded-2xl bg-black/60 hover:bg-black/90 text-white backdrop-blur-xl border border-white/20 transition-all cursor-pointer shadow-2xl hover:scale-110 active:scale-95 z-20"
                  title="Anterior (Seta Esquerda)"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  type="button"
                  onClick={handleLightboxNext}
                  className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 p-3.5 rounded-2xl bg-black/60 hover:bg-black/90 text-white backdrop-blur-xl border border-white/20 transition-all cursor-pointer shadow-2xl hover:scale-110 active:scale-95 z-20"
                  title="Próxima (Seta Direita)"
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}
          </div>

          {/* Barra Inferior com Miniaturas no Lightbox */}
          {mediaItems.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 flex items-center gap-2 z-20 max-w-[90vw] overflow-x-auto custom-scrollbar">
              {mediaItems.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setLightboxIndex(idx);
                    setZoomLevel(1);
                  }}
                  className={cn(
                    "w-12 h-12 rounded-xl overflow-hidden border-2 transition-all shrink-0 cursor-pointer bg-white/5",
                    lightboxIndex === idx 
                      ? "border-indigo-400 ring-2 ring-indigo-400/40 scale-110" 
                      : "border-transparent opacity-50 hover:opacity-100"
                  )}
                >
                  {item.type === 'image' ? (
                    <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                  ) : item.type === 'video' ? (
                    <div className="w-full h-full flex items-center justify-center bg-slate-800 text-amber-400">
                      <Film size={14} />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-800 text-purple-400">
                      <Mic size={14} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
