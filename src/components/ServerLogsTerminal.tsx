import React, { useEffect, useState, useRef } from 'react';
import { Terminal as TerminalIcon, X, Trash2, Pause, Play, Maximize2, Minimize2, Copy, Check } from 'lucide-react';
import clsx from 'clsx';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
}

interface ServerLogsTerminalProps {
  onClose: () => void;
  isOpen: boolean;
}

export const ServerLogsTerminal: React.FC<ServerLogsTerminalProps> = ({ onClose, isOpen }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleCopyLogs = () => {
    const textToCopy = logs.map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message}`).join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => console.error('Failed to copy logs', err));
  };
  const logsRef = useRef(logs);
  logsRef.current = logs;

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  useEffect(() => {
    if (!isOpen) return;

    const url = import.meta.env.VITE_WHATSAPP_ENGINE_URL || 'http://localhost:9000';
    const sse = new EventSource(`${url}/api/v1/system/logs/stream`);
    
    sse.onopen = () => {
      setIsConnected(true);
    };

    sse.onerror = () => {
      setIsConnected(false);
    };

    sse.onmessage = (event) => {
      if (isPausedRef.current) return;
      
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init') {
          setLogs(data.logs || []);
        } else if (data.message) {
          setLogs(prev => {
            const next = [...prev, data];
            if (next.length > 200) return next.slice(next.length - 200);
            return next;
          });
        }
      } catch (err) {
        console.error('SSE Pare Error', err);
      }
    };

    return () => {
      sse.close();
      setIsConnected(false);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isPaused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isPaused, isExpanded]);

  if (!isOpen) return null;

  return (
    <div 
      className={clsx(
        "fixed right-4 bottom-4 z-50 flex flex-col overflow-hidden transition-all duration-300 ease-in-out shadow-2xl rounded-2xl border border-white/10 backdrop-blur-xl bg-black/85",
        isExpanded ? "w-[80vw] h-[80vh]" : "w-[500px] h-[400px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-5 h-5 text-green-400" />
          <h3 className="text-sm font-semibold text-white/90 font-mono tracking-wide">
            Server Console
          </h3>
          <span className="relative flex h-2 w-2 ml-2">
            <span className={clsx(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              isConnected ? "bg-green-400" : "bg-red-400"
            )}></span>
            <span className={clsx(
              "relative inline-flex rounded-full h-2 w-2",
               isConnected ? "bg-green-500" : "bg-red-500"
            )}></span>
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsPaused(!isPaused)}
            className="p-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white transition-colors"
            title={isPaused ? "Retomar" : "Pausar"}
          >
            {isPaused ? <Play className="w-4 h-4 text-yellow-400" /> : <Pause className="w-4 h-4" />}
          </button>
          <button 
            onClick={handleCopyLogs}
            className="p-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white transition-colors"
            title="Copiar Logs"
          >
            {isCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button 
            onClick={() => setLogs([])}
            className="p-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white transition-colors"
            title="Limpar Logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white transition-colors"
            title={isExpanded ? "Minimizar" : "Expandir"}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <div className="w-px h-4 bg-white/20 mx-1"></div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-red-500/20 rounded-md text-white/70 hover:text-red-400 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Logs Area */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs sm:text-sm leading-relaxed scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-white/30 space-y-2 select-none animate-in fade-in duration-500">
            <TerminalIcon className="w-8 h-8 opacity-50" />
            <p>Aguardando logs do servidor...</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map((log) => {
              const date = new Date(log.timestamp);
              const timeString = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
              
              let colorClass = 'text-gray-300';
              if (log.level === 'error') colorClass = 'text-red-400 font-medium';
              if (log.level === 'warn') colorClass = 'text-yellow-400';
              if (log.level === 'info') colorClass = 'text-blue-300';

              return (
                <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded-sm transition-colors break-words">
                  <span className="text-white/40 shrink-0 select-none">[{timeString}]</span>
                  <span className={clsx("flex-1 whitespace-pre-wrap font-medium tracking-tight", colorClass)}>
                    {log.message}
                  </span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
};
