import React, { useEffect, useState, useRef } from 'react';
import { Terminal as TerminalIcon, X, Trash2, Pause, Play, Maximize2, Minimize2, Copy, Check, Bug } from 'lucide-react';
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
  const [isDebugMode, setIsDebugMode] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);

  const toggleDebugMode = async () => {
    const newMode = !isDebugMode;
    setIsDebugMode(newMode);
    try {
      const url = import.meta.env.VITE_WHATSAPP_ENGINE_URL || 'http://localhost:9000';
      await fetch(`${url}/api/v1/system/logs/level`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: newMode ? 'trace' : 'info' })
      });
    } catch(err) {
      console.error('Failed to change log level', err);
    }
  };

  const parseLogMessage = (msg: string) => {
    const baileysPrefix = "[Baileys] ";
    if (msg.startsWith(baileysPrefix)) {
      const rest = msg.slice(baileysPrefix.length);
      const jsonStart = rest.indexOf('{');
      if (jsonStart !== -1) {
        const action = rest.slice(0, jsonStart).trim();
        const jsonStr = rest.slice(jsonStart);
        try {
           const parsedJson = JSON.parse(jsonStr);
           return { isParsed: true, prefix: "[Baileys]", action, data: parsedJson };
        } catch(e) {}
      }
    }
    try {
      if (msg.trim().startsWith('{') && msg.trim().endsWith('}')) {
        const parsedJson = JSON.parse(msg);
        return { isParsed: true, prefix: "", action: "Objeto Log", data: parsedJson };
      }
    } catch(e) {}

    return { isParsed: false, text: msg };
  };

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
            onClick={toggleDebugMode}
            className={clsx(
              "p-1.5 rounded-md transition-all shadow-sm border", 
              isDebugMode ? "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border-purple-500/30" : "bg-transparent hover:bg-white/10 text-white/70 hover:text-white border-transparent"
            )}
            title={isDebugMode ? "Modo Debug: ATIVO" : "Ativar Modo Debug (Trace)"}
          >
            <Bug className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-white/20 mx-1"></div>
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
              const parseResult = parseLogMessage(log.message);

              return (
                <div key={log.id} className="flex flex-col gap-1 hover:bg-white/5 p-1.5 rounded-md transition-colors break-words group">
                  <div className="flex gap-3">
                    <span className="text-white/40 shrink-0 select-none">[{timeString}]</span>
                    {parseResult.isParsed ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {parseResult.prefix && <span className="text-purple-400 font-bold opacity-80">{parseResult.prefix}</span>}
                          <span className={clsx("font-semibold", colorClass)}>{parseResult.action}</span>
                        </div>
                    ) : (
                        <span className={clsx("flex-1 whitespace-pre-wrap font-medium tracking-tight", colorClass)}>
                          {parseResult.text}
                        </span>
                    )}
                  </div>
                  
                  {parseResult.isParsed && parseResult.data && (
                    <div className="ml-[68px] mt-1 mb-1">
                      {typeof parseResult.data === 'object' && Object.keys(parseResult.data).length > 0 ? (
                        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 bg-black/40 rounded-lg border border-white/5 p-2.5 text-[11px] font-mono shadow-inner overflow-x-auto custom-scrollbar">
                          {Object.entries(parseResult.data).map(([k, v]) => (
                            <React.Fragment key={k}>
                              <div className="text-gray-400 font-bold shrink-0">{k}</div>
                              <div className="text-gray-200 opacity-90 break-all whitespace-pre-wrap">
                                {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-black/40 rounded-lg border border-white/5 p-2.5 text-[11px] text-gray-200">
                          {JSON.stringify(parseResult.data)}
                        </div>
                      )}
                    </div>
                  )}
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
