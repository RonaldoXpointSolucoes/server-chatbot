import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2, Minimize2, 
  Gauge, FastForward, Rewind, X
} from 'lucide-react';
import { cn } from '../../pages/ChatDashboard';

interface VideoPlayerPremiumProps {
  src: string;
  className?: string;
}

export const VideoPlayerPremium: React.FC<VideoPlayerPremiumProps> = ({ src, className }) => {
  // Referências para o vídeo inline e vídeo em tela cheia
  const inlineVideoRef = useRef<HTMLVideoElement>(null);
  const lightboxVideoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Estados do Player Inline
  const [isInlinePlaying, setIsInlinePlaying] = useState(false);
  const [inlineTime, setInlineTime] = useState(0);
  const [inlineDuration, setInlineDuration] = useState(0);
  const [inlineVolume, setInlineVolume] = useState(1);
  const [isInlineMuted, setIsInlineMuted] = useState(false);
  const [inlineHovered, setInlineHovered] = useState(false);

  // Estados Globais de Reprodução Sincronizados
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Estados do Lightbox (Tela Cheia)
  const [isLightboxPlaying, setIsLightboxPlaying] = useState(false);
  const [lightboxTime, setLightboxTime] = useState(0);
  const [lightboxDuration, setLightboxDuration] = useState(0);
  const [lightboxVolume, setLightboxVolume] = useState(1);
  const [isLightboxMuted, setIsLightboxMuted] = useState(false);
  const [lightboxHovered, setLightboxHovered] = useState(false);
  
  // Controles de UI do Lightbox
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // Formata os segundos em MM:SS ou HH:MM:SS
  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const formattedSecs = secs < 10 ? `0${secs}` : secs;

    if (hrs > 0) {
      const formattedMins = mins < 10 ? `0${mins}` : mins;
      return `${hrs}:${formattedMins}:${formattedSecs}`;
    }
    return `${mins}:${formattedSecs}`;
  };

  // -----------------------------------------------------------------
  // PLAY / PAUSE INLINE
  // -----------------------------------------------------------------
  const toggleInlinePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!inlineVideoRef.current) return;

    if (isInlinePlaying) {
      inlineVideoRef.current.pause();
    } else {
      inlineVideoRef.current.play().catch(err => console.log('Erro play inline:', err));
    }
  };

  // -----------------------------------------------------------------
  // PLAY / PAUSE LIGHTBOX
  // -----------------------------------------------------------------
  const toggleLightboxPlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!lightboxVideoRef.current) return;

    if (isLightboxPlaying) {
      lightboxVideoRef.current.pause();
    } else {
      lightboxVideoRef.current.play().catch(err => console.log('Erro play lightbox:', err));
    }
  };

  // -----------------------------------------------------------------
  // SKIPS & SPEED LIGHTBOX
  // -----------------------------------------------------------------
  const skipLightbox = (seconds: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!lightboxVideoRef.current) return;
    lightboxVideoRef.current.currentTime = Math.max(0, Math.min(lightboxVideoRef.current.duration || 0, lightboxVideoRef.current.currentTime + seconds));
  };

  const changeSpeed = (rate: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPlaybackRate(rate);
    
    // Aplica no vídeo ativo
    if (isFullscreen && lightboxVideoRef.current) {
      lightboxVideoRef.current.playbackRate = rate;
    } else if (inlineVideoRef.current) {
      inlineVideoRef.current.playbackRate = rate;
    }
    setShowSpeedMenu(false);
  };

  // -----------------------------------------------------------------
  // VOLUME & MUTE LIGHTBOX
  // -----------------------------------------------------------------
  const toggleLightboxMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!lightboxVideoRef.current) return;
    const nextMuted = !isLightboxMuted;
    lightboxVideoRef.current.muted = nextMuted;
    setIsLightboxMuted(nextMuted);
  };

  const handleLightboxVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = parseFloat(e.target.value);
    if (!lightboxVideoRef.current) return;
    lightboxVideoRef.current.volume = val;
    setLightboxVolume(val);
    if (val === 0) {
      lightboxVideoRef.current.muted = true;
      setIsLightboxMuted(true);
    } else {
      lightboxVideoRef.current.muted = false;
      setIsLightboxMuted(false);
    }
  };

  // -----------------------------------------------------------------
  // SCRUBBER (TIMELINE) LIGHTBOX
  // -----------------------------------------------------------------
  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (!lightboxVideoRef.current) return;
    const val = parseFloat(e.target.value);
    lightboxVideoRef.current.currentTime = val;
    setLightboxTime(val);
  };

  // -----------------------------------------------------------------
  // ABERTURA E FECHAMENTO DO LIGHTBOX (SINCRONIZAÇÃO DE TEMPO)
  // -----------------------------------------------------------------
  const openLightbox = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    // Captura as informações do inline
    if (inlineVideoRef.current) {
      const currentTime = inlineVideoRef.current.currentTime;
      const wasPlaying = isInlinePlaying;
      
      // Pausa o inline
      inlineVideoRef.current.pause();
      
      // Seta os estados iniciais do Lightbox
      setLightboxTime(currentTime);
      setIsLightboxPlaying(wasPlaying);
      setLightboxVolume(inlineVolume);
      setIsLightboxMuted(isInlineMuted);
      
      // Abre o modal
      setIsFullscreen(true);
    }
  };

  const closeLightbox = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    if (lightboxVideoRef.current && inlineVideoRef.current) {
      const currentTime = lightboxVideoRef.current.currentTime;
      const wasPlaying = isLightboxPlaying;
      
      // Pausa o lightbox
      lightboxVideoRef.current.pause();
      
      // Fecha o modal
      setIsFullscreen(false);
      
      // Retorna as informações para o inline
      inlineVideoRef.current.currentTime = currentTime;
      inlineVideoRef.current.playbackRate = playbackRate;
      inlineVideoRef.current.volume = lightboxVolume;
      inlineVideoRef.current.muted = isLightboxMuted;
      setInlineTime(currentTime);
      setInlineVolume(lightboxVolume);
      setIsInlineMuted(isLightboxMuted);
      
      if (wasPlaying) {
        // Aguarda uma pequena fração para garantir a sincronização do frame do vídeo antes de dar play
        setTimeout(() => {
          inlineVideoRef.current?.play().catch(err => console.log('Erro play inline pós lightbox:', err));
        }, 50);
      }
    } else {
      setIsFullscreen(false);
    }
  };

  // -----------------------------------------------------------------
  // SINCRONIZAÇÃO DO VÍDEO DO LIGHTBOX APÓS MONTADO
  // -----------------------------------------------------------------
  useEffect(() => {
    if (isFullscreen && lightboxVideoRef.current && inlineVideoRef.current) {
      const inlineVideo = inlineVideoRef.current;
      const lightboxVideo = lightboxVideoRef.current;

      // Sincroniza tempo de início e velocidade
      lightboxVideo.currentTime = inlineTime;
      lightboxVideo.playbackRate = playbackRate;
      lightboxVideo.volume = inlineVolume;
      lightboxVideo.muted = isInlineMuted;

      if (isInlinePlaying) {
        lightboxVideo.play().catch(err => console.log('Erro autoplay lightbox:', err));
      }
    }
  }, [isFullscreen]);

  // Sumiço dos controles em fullscreen após inatividade
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isFullscreen) {
      controlsTimeoutRef.current = setTimeout(() => {
        if (isLightboxPlaying && !showSpeedMenu && !isDragging) {
          setShowControls(false);
        }
      }, 2500);
    }
  };

  // Atalhos de teclado no modo Fullscreen Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isFullscreen) return;

      if (e.key === ' ') {
        e.preventDefault();
        toggleLightboxPlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        skipLightbox(10);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        skipLightbox(-10);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeLightbox();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (lightboxVideoRef.current) {
          const nextVol = Math.min(1, lightboxVideoRef.current.volume + 0.1);
          lightboxVideoRef.current.volume = nextVol;
          setLightboxVolume(nextVol);
          setIsLightboxMuted(nextVol === 0);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (lightboxVideoRef.current) {
          const nextVol = Math.max(0, lightboxVideoRef.current.volume - 0.1);
          lightboxVideoRef.current.volume = nextVol;
          setLightboxVolume(nextVol);
          setIsLightboxMuted(nextVol === 0);
        }
      }
    };

    if (isFullscreen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isFullscreen, isLightboxPlaying, inlineTime, playbackRate, inlineVolume, isInlineMuted, isInlinePlaying]);

  // -----------------------------------------------------------------
  // EVENTOS DO VÍDEO INLINE
  // -----------------------------------------------------------------
  useEffect(() => {
    const video = inlineVideoRef.current;
    if (!video) return;

    const onPlay = () => setIsInlinePlaying(true);
    const onPause = () => setIsInlinePlaying(false);
    const onTimeUpdate = () => setInlineTime(video.currentTime);
    const onDurationChange = () => setInlineDuration(video.duration || 0);
    const onVolumeChange = () => {
      setInlineVolume(video.volume);
      setIsInlineMuted(video.muted);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('volumechange', onVolumeChange);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('volumechange', onVolumeChange);
    };
  }, []);

  // -----------------------------------------------------------------
  // EVENTOS DO VÍDEO LIGHTBOX
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!isFullscreen) return;
    const video = lightboxVideoRef.current;
    if (!video) return;

    const onPlay = () => setIsLightboxPlaying(true);
    const onPause = () => setIsLightboxPlaying(false);
    const onTimeUpdate = () => {
      if (!isDragging) {
        setLightboxTime(video.currentTime);
      }
    };
    const onDurationChange = () => setLightboxDuration(video.duration || 0);
    const onVolumeChange = () => {
      setLightboxVolume(video.volume);
      setIsLightboxMuted(video.muted);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('volumechange', onVolumeChange);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('volumechange', onVolumeChange);
    };
  }, [isFullscreen, isDragging]);

  return (
    <>
      {/* ------------------------------------------------------------- */}
      {/* 1. REPRODUTOR INLINE (DENTRO DA BOLHA DO CHAT) */}
      {/* ------------------------------------------------------------- */}
      <div 
        onMouseEnter={() => setInlineHovered(true)}
        onMouseLeave={() => setInlineHovered(false)}
        className={cn(
          "relative rounded-2xl overflow-hidden bg-black/40 dark:bg-black/60 flex items-center justify-center group/inline transition-all duration-300 shadow-md border border-black/5 dark:border-white/5 w-full max-w-[340px] aspect-video",
          className
        )}
      >
        {/* Pill de Velocidade no topo esquerdo */}
        <div 
          className={cn(
            "absolute top-2.5 left-2.5 z-10 flex items-center gap-1 bg-[#00a884]/95 text-white px-2 py-0.5 rounded-full font-bold text-[10px] shadow-sm tracking-wider pointer-events-none transition-all duration-300",
            (inlineHovered || !isInlinePlaying) ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
          )}
        >
          <Gauge size={9} />
          <span>{playbackRate.toFixed(2)}x</span>
        </div>

        {/* Botão de Tela Cheia rápido no topo direito */}
        <button 
          onClick={openLightbox}
          className={cn(
            "absolute top-2.5 right-2.5 z-10 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all duration-300 hover:scale-105 active:scale-95",
            (inlineHovered || !isInlinePlaying) ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
          )}
          title="Abrir em Tela Cheia"
        >
          <Maximize2 size={12} />
        </button>

        {/* Vídeo Inline */}
        <video 
          ref={inlineVideoRef}
          src={src}
          onClick={toggleInlinePlay}
          playsInline
          className="w-full h-full object-cover cursor-pointer select-none"
        />

        {/* Play/Pause Overlay Inline */}
        <div 
          onClick={toggleInlinePlay}
          className={cn(
            "absolute inset-0 z-[5] flex items-center justify-center bg-black/10 transition-all duration-300 cursor-pointer",
            (inlineHovered || !isInlinePlaying) ? "opacity-100 bg-black/20" : "opacity-0 pointer-events-none"
          )}
        >
          <button 
            onClick={toggleInlinePlay}
            className="p-3 rounded-full bg-white/20 dark:bg-black/30 backdrop-blur-md text-white border border-white/20 shadow-lg transition-all duration-300 hover:scale-110 active:scale-95"
          >
            {isInlinePlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current ml-0.5" />}
          </button>
        </div>

        {/* Barra de Progresso Fina na Base Inline */}
        <div className="absolute bottom-0 left-0 right-0 z-10 w-full h-1 bg-black/25">
          <div 
            className="h-full bg-[#00a884] transition-all duration-100"
            style={{ width: `${(inlineTime / (inlineDuration || 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. REPRODUTOR EM TELA CHEIA (LIGHTBOX VIA REACT PORTAL) */}
      {/* ------------------------------------------------------------- */}
      {isFullscreen && createPortal(
        <div 
          onMouseEnter={() => { setLightboxHovered(true); handleMouseMove(); }}
          onMouseLeave={() => { setLightboxHovered(false); setShowControls(false); }}
          onMouseMove={handleMouseMove}
          className="fixed inset-0 z-[9999999] w-screen h-screen bg-black/95 backdrop-blur-2xl flex items-center justify-center animate-in fade-in duration-300 select-none"
          onClick={closeLightbox}
        >
          {/* Botão de Fechar no topo direito */}
          <button 
            onClick={closeLightbox}
            className="absolute top-6 right-6 z-[10000000] p-3 rounded-full bg-white/10 hover:bg-[#00a884] text-white backdrop-blur-xl border border-white/10 transition-all duration-300 hover:scale-110 active:scale-95"
            title="Fechar Visualização (ESC)"
          >
            <X size={22} />
          </button>

          {/* Pill de Velocidade no topo esquerdo do Lightbox */}
          <div 
            className={cn(
              "absolute top-6 left-6 z-[10000000] flex items-center gap-2 bg-[#00a884] text-white px-3.5 py-1.5 rounded-full font-bold text-xs shadow-md tracking-wider border border-emerald-400/20",
              (lightboxHovered || !isLightboxPlaying || showControls) ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
            )}
          >
            <Gauge size={14} />
            <span>Velocidade: {playbackRate.toFixed(2)}x</span>
          </div>

          {/* Elemento de Vídeo Ampliado */}
          <div className="relative w-full max-w-[90vw] max-h-[80vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <video 
              ref={lightboxVideoRef}
              src={src}
              onClick={toggleLightboxPlay}
              playsInline
              className="max-w-full max-h-[80vh] object-contain rounded-2xl border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
            />

            {/* Play/Pause Centralizado no Lightbox */}
            <div 
              onClick={toggleLightboxPlay}
              className={cn(
                "absolute inset-0 z-10 flex items-center justify-center bg-black/0 transition-all duration-300 cursor-pointer",
                (lightboxHovered || !isLightboxPlaying) ? "opacity-100 bg-black/20" : "opacity-0 pointer-events-none"
              )}
            >
              <button 
                onClick={toggleLightboxPlay}
                className={cn(
                  "p-5 rounded-full bg-white/15 dark:bg-black/40 backdrop-blur-xl text-white border border-white/15 shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95",
                  (!isLightboxPlaying) ? "scale-100 opacity-100" : "scale-75 opacity-0"
                )}
              >
                {isLightboxPlaying ? <Pause size={32} className="fill-current" /> : <Play size={32} className="fill-current ml-1" />}
              </button>
            </div>
          </div>

          {/* Barra de Controles Inferior do Lightbox */}
          <div 
            className={cn(
              "absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-6 pt-16 pb-6 flex flex-col gap-3 transition-all duration-300 w-full max-w-4xl mx-auto",
              (lightboxHovered || !isLightboxPlaying || showControls) ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0 pointer-events-none"
            )}
            onClick={e => e.stopPropagation()}
          >
            {/* Barra de Progresso Interativa (Timeline) */}
            <div className="flex items-center gap-3 group/scrubber w-full">
              <input 
                type="range"
                min={0}
                max={lightboxDuration || 100}
                value={lightboxTime}
                onChange={handleScrubberChange}
                onMouseDown={() => setIsDragging(true)}
                onMouseUp={() => setIsDragging(false)}
                onTouchStart={() => setIsDragging(true)}
                onTouchEnd={() => setIsDragging(false)}
                className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#00a884] hover:h-2.5 transition-all outline-none"
                style={{
                  background: `linear-gradient(to right, #00a884 0%, #00a884 ${(lightboxTime / (lightboxDuration || 1)) * 100}%, rgba(255,255,255,0.2) ${(lightboxTime / (lightboxDuration || 1)) * 100}%, rgba(255,255,255,0.2) 100%)`
                }}
              />
            </div>

            {/* Ações e Controles */}
            <div className="flex items-center justify-between w-full text-white">
              <div className="flex items-center gap-4">
                {/* Play/Pause */}
                <button 
                  onClick={toggleLightboxPlay} 
                  className="hover:text-[#00a884] transition-colors p-1.5 hover:scale-110 active:scale-95"
                >
                  {isLightboxPlaying ? <Pause size={18} className="fill-current" /> : <Play size={18} className="fill-current ml-0.5" />}
                </button>

                {/* Retroceder 10s */}
                <button 
                  onClick={(e) => skipLightbox(-10, e)} 
                  className="hover:text-[#00a884] transition-colors p-1.5 hover:scale-110 active:scale-95" 
                  title="Retroceder 10s"
                >
                  <Rewind size={18} />
                </button>

                {/* Avançar 10s */}
                <button 
                  onClick={(e) => skipLightbox(10, e)} 
                  className="hover:text-[#00a884] transition-colors p-1.5 hover:scale-110 active:scale-95" 
                  title="Avançar 10s"
                >
                  <FastForward size={18} />
                </button>

                {/* Volume & Mute */}
                <div className="flex items-center gap-2 group/volume">
                  <button 
                    onClick={toggleLightboxMute} 
                    className="hover:text-[#00a884] transition-colors p-1.5 hover:scale-110 active:scale-95"
                  >
                    {isLightboxMuted || lightboxVolume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <input 
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isLightboxMuted ? 0 : lightboxVolume}
                    onChange={handleLightboxVolumeChange}
                    className="w-0 opacity-0 group-hover/volume:w-20 group-hover/volume:opacity-100 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-[#00a884] transition-all outline-none"
                    style={{
                      background: `linear-gradient(to right, #00a884 0%, #00a884 ${(isLightboxMuted ? 0 : lightboxVolume) * 100}%, rgba(255,255,255,0.3) ${(isLightboxMuted ? 0 : lightboxVolume) * 100}%, rgba(255,255,255,0.3) 100%)`
                    }}
                  />
                </div>

                {/* Tempo */}
                <span className="text-[12px] text-gray-300 font-mono select-none">
                  {formatTime(lightboxTime)} / {formatTime(lightboxDuration)}
                </span>
              </div>

              <div className="flex items-center gap-4 relative">
                {/* Seletor de Velocidades */}
                <div className="relative">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-[#00a884] hover:text-white rounded-full transition-all text-xs font-bold border border-white/10 backdrop-blur-sm active:scale-95",
                      showSpeedMenu ? "bg-[#00a884] text-white" : ""
                    )}
                    title="Ajustar Velocidade"
                  >
                    <Gauge size={14} />
                    <span>{playbackRate.toFixed(2)}x</span>
                  </button>

                  {/* Menu suspenso de velocidades */}
                  {showSpeedMenu && (
                    <div 
                      className="absolute bottom-10 right-0 bg-black/95 dark:bg-[#1a2327]/98 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl py-2 w-28 flex flex-col z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {[0.5, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                        <button
                          key={rate}
                          onClick={(e) => changeSpeed(rate, e)}
                          className={cn(
                            "w-full text-left px-4 py-1.5 hover:bg-[#00a884] hover:text-white transition-colors text-[11px] font-bold text-gray-300 flex items-center justify-between",
                            playbackRate === rate ? "text-[#00a884] bg-white/5 font-extrabold" : ""
                          )}
                        >
                          <span>{rate.toFixed(2)}x</span>
                          {playbackRate === rate && <span className="w-1.5 h-1.5 bg-[#00a884] rounded-full"></span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Minimizar de volta */}
                <button 
                  onClick={closeLightbox}
                  className="hover:text-[#00a884] transition-colors p-1.5 hover:scale-110 active:scale-95"
                  title="Minimizar Tela Cheia (ESC)"
                >
                  <Minimize2 size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
