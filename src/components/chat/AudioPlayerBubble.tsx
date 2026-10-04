import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Sparkles, RefreshCw, Download, Copy, Check } from 'lucide-react';

interface AudioPlayerBubbleProps {
  mediaUrl: string;
  transcription?: string | null;
  onTranscribe?: () => void;
  isTranscribing?: boolean;
  isMe?: boolean;
}

export const AudioPlayerBubble: React.FC<AudioPlayerBubbleProps> = ({
  mediaUrl,
  transcription,
  onTranscribe,
  isTranscribing = false,
  isMe = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [loadError, setLoadError] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Formatação de tempo em MM:SS
  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds < 0 || !isFinite(timeInSeconds)) return '0:00';
    const mins = Math.floor(timeInSeconds / 60);
    const secs = Math.floor(timeInSeconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      setLoadError(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && isFinite(audio.duration) && duration === 0) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };

    const handleError = () => {
      console.warn('[AudioPlayerBubble] Falha ao carregar áudio:', mediaUrl);
      setLoadError(true);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [mediaUrl, duration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = playbackRate;
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error('[AudioPlayerBubble] Erro de reprodução:', err);
        setIsPlaying(false);
      });
    }
  };

  const handleSpeedChange = () => {
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || duration <= 0) return;

    const rect = bar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * duration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleCopyTranscription = () => {
    if (!transcription) return;
    navigator.clipboard.writeText(transcription);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-[340px] sm:max-w-[380px] my-1 select-none">
      {/* Elemento de áudio oculto com preload nativo */}
      <audio
        ref={audioRef}
        src={mediaUrl}
        preload="metadata"
        className="hidden"
      />

      {/* Caixa do Player com Design SaaS Glassmorphism */}
      <div className={`flex items-center gap-2.5 p-2 rounded-2xl border transition-all duration-200 shadow-sm ${
        isMe
          ? 'bg-emerald-950/20 dark:bg-emerald-950/40 border-emerald-500/20'
          : 'bg-white/70 dark:bg-[#1e2a30] border-slate-200/80 dark:border-white/10'
      }`}>
        {/* Botão Play / Pause com feedback tátil de toque (40px) */}
        <button
          onClick={togglePlay}
          disabled={loadError}
          type="button"
          aria-label={isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}
          className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-transform active:scale-95 shadow-md ${
            loadError
              ? 'bg-rose-500/20 text-rose-500 cursor-not-allowed'
              : isPlaying
              ? 'bg-emerald-500 text-white shadow-emerald-500/30'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
          }`}
        >
          {isPlaying ? (
            <Pause size={18} className="fill-current" />
          ) : (
            <Play size={18} className="fill-current ml-0.5" />
          )}
        </button>

        {/* Barra de Progresso e Tempos */}
        <div className="flex flex-col flex-1 gap-1 min-w-0">
          <div
            ref={progressBarRef}
            onClick={handleProgressClick}
            className="group relative h-2.5 bg-slate-200/80 dark:bg-white/15 rounded-full cursor-pointer overflow-hidden py-1 flex items-center"
          >
            <div
              className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-75 relative group-hover:brightness-110"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Indicadores de Tempo & Botão de Velocidade */}
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400 px-0.5">
            <span>{formatTime(currentTime)}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSpeedChange}
                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200/60 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 transition-colors"
                title="Alterar velocidade de reprodução"
              >
                {playbackRate}x
              </button>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        {/* Ação de Transcrição por IA se ainda não transcrito */}
        {!transcription && onTranscribe && (
          <button
            type="button"
            onClick={onTranscribe}
            disabled={isTranscribing || loadError}
            className="shrink-0 p-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 transition-all active:scale-95 disabled:opacity-50"
            title="Transcrever Áudio com Inteligência Artificial"
            aria-label="Transcrever Áudio"
          >
            {isTranscribing ? (
              <RefreshCw size={16} className="animate-spin text-indigo-500" />
            ) : (
              <Sparkles size={16} />
            )}
          </button>
        )}

        {/* Fallback de Download se falhar o carregamento */}
        {loadError && (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 text-xs font-semibold"
            title="Baixar arquivo de áudio"
          >
            <Download size={15} />
          </a>
        )}
      </div>

      {/* Bloco de Transcrição por IA Elegante */}
      {transcription && (
        <div className="flex flex-col bg-white/80 dark:bg-[#111b21]/80 backdrop-blur-md rounded-2xl p-3 border border-indigo-500/20 shadow-sm gap-2">
          <div className="flex items-center justify-between border-b border-indigo-500/10 pb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
              <Sparkles size={14} className="text-indigo-500" />
              <span>Transcrição Neural (IA)</span>
            </div>
            <button
              type="button"
              onClick={handleCopyTranscription}
              className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-colors p-1 rounded"
              title="Copiar texto da transcrição"
            >
              {isCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              <span>{isCopied ? 'Copiado!' : 'Copiar'}</span>
            </button>
          </div>
          <div className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap select-text italic">
            {transcription}
          </div>
        </div>
      )}
    </div>
  );
};
