import React, { useEffect, useState, useRef } from 'react';
import { Terminal as TerminalIcon, X, Trash2, Pause, Play, Maximize2, Minimize2, Copy, Check, Bug, AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
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
  const [showCopyOptions, setShowCopyOptions] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);

  const toggleDebugMode = async () => {
    const newMode = !isDebugMode;
    setIsDebugMode(newMode);
    try {
      const url = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
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

  const handleCopyLogs = (mode: 'all' | 'errors') => {
    let filteredLogs = logs;
    
    if (mode === 'errors') {
      filteredLogs = logs.filter(log => log.level === 'warn' || log.level === 'error');
      if (filteredLogs.length === 0) {
        alert("Olha, não existe nenhum erro ou aviso para ser copiado.");
        return;
      }
    }

    let textToCopy = '';
    
    if (mode === 'errors') {
      const counts = new Map<string, { count: number, log: LogEntry }>();
      filteredLogs.forEach(log => {
        const key = `[${log.level.toUpperCase()}] ${log.message}`;
        if (counts.has(key)) {
          counts.get(key)!.count++;
        } else {
          counts.set(key, { count: 1, log });
        }
      });
      
      textToCopy = Array.from(counts.values()).map(({ count, log }) => {
        const baseString = `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.level.toUpperCase()}] ${log.message}`;
        if (count > 1) {
          return `Este erro ocorreu ${count} vezes:\n${baseString}\n`;
        }
        return baseString;
      }).join('\n');
    } else {
      const aggregatedLogs: { count: number; log: LogEntry }[] = [];
      for (const log of filteredLogs) {
        if (aggregatedLogs.length > 0) {
          const last = aggregatedLogs[aggregatedLogs.length - 1];
          if (last.log.message === log.message && last.log.level === log.level) {
            last.count++;
            continue;
          }
        }
        aggregatedLogs.push({ count: 1, log });
      }

      textToCopy = aggregatedLogs.map(({ count, log }) => {
        const baseString = `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.level.toUpperCase()}] ${log.message}`;
        if (count > 1) {
          return `Este evento repetiu ${count} vezes sequencialmente:\n${baseString}\n`;
        }
        return baseString;
      }).join('\n');
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      if (mode === 'errors') {
        alert(`Erros copiados com sucesso! Foram copiados ${filteredLogs.length} erros/avisos.`);
      }
    }).catch(err => {
      console.error('Failed to copy logs', err);
      alert('Falha ao copiar os logs!');
    });
  };
  
  const logsRef = useRef(logs);
  logsRef.current = logs;

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  useEffect(() => {
    if (!isOpen) return;

    const url = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
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
        
        // Função de filtro para ignorar logs desnecessários
        const isSpamLog = (msg: string) => {
          if (!msg) return false;
          if (msg.includes('Mídia expirada/inacessível para JID') && msg.includes('Normal em History Sync')) return true;
          if (msg.includes('stream errored out') && msg.includes('"reasonNode":{"tag":"conflict","attrs":{"type":"replaced"}}')) return true;
          return false;
        };

        if (data.type === 'init') {
          const filteredLogs = (data.logs || []).filter((log: LogEntry) => !isSpamLog(log.message));
          setLogs(filteredLogs);
        } else if (data.message) {
          if (isSpamLog(data.message)) return;

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
        "fixed right-4 bottom-4 z-50 flex flex-col overflow-hidden transition-all duration-300 ease-in-out shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-2xl border border-white/10 backdrop-blur-xl bg-slate-950/85",
        isExpanded ? "w-[90vw] h-[85vh] sm:w-[80vw] sm:h-[80vh]" : "w-[calc(100vw-32px)] sm:w-[540px] h-[450px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/5 bg-slate-900/60 backdrop-blur-md select-none shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-400">
            <TerminalIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wider font-mono uppercase">
              Server Console
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="relative flex h-2 w-2">
                <span className={clsx(
                  "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                  isConnected ? "bg-emerald-400" : "bg-red-400"
                )}></span>
                <span className={clsx(
                  "relative inline-flex rounded-full h-2 w-2",
                   isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                )}></span>
              </span>
              <span className="text-[8px] text-gray-400 font-semibold font-mono tracking-widest uppercase">
                {isConnected ? "online" : "offline"}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          <button 
            onClick={toggleDebugMode}
            className={clsx(
              "p-2 rounded-lg transition-all border text-xs cursor-pointer hover:scale-105 active:scale-95 duration-150", 
              isDebugMode 
                ? "bg-purple-500/20 text-purple-400 border-purple-500/30 shadow-[0_0_12px_rgba(168,85,247,0.15)]" 
                : "bg-white/5 border-white/5 hover:border-white/10 text-gray-400 hover:text-white"
            )}
            title={isDebugMode ? "Modo Debug: ATIVO" : "Ativar Modo Debug (Trace)"}
          >
            <Bug className="w-3.5 h-3.5" />
          </button>
          
          <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0"></div>
          
          <button 
            onClick={() => setIsPaused(!isPaused)}
            className="p-2 bg-white/5 border border-white/5 hover:border-white/10 rounded-lg text-gray-400 hover:text-white transition-all hover:scale-105 active:scale-95 duration-150 cursor-pointer"
            title={isPaused ? "Retomar" : "Pausar"}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 text-yellow-400 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          
          <div className="relative">
            <button 
              onClick={() => setShowCopyOptions(!showCopyOptions)}
              className="p-2 bg-white/5 border border-white/5 hover:border-white/10 rounded-lg text-gray-400 hover:text-white transition-all hover:scale-105 active:scale-95 duration-150 cursor-pointer"
              title="Copiar Logs"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            {showCopyOptions && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 z-50">
                <button 
                  onClick={() => { setShowCopyOptions(false); handleCopyLogs('all'); }} 
                  className="w-full text-left px-4 py-2.5 text-xs text-white/90 hover:bg-white/10 transition-colors font-medium font-mono cursor-pointer border-0 bg-transparent"
                >
                  Log Completo
                </button>
                <div className="h-px bg-white/10 w-full" />
                <button 
                  onClick={() => { setShowCopyOptions(false); handleCopyLogs('errors'); }} 
                  className="w-full text-left px-4 py-2.5 text-xs text-red-400 hover:bg-white/10 transition-colors font-medium flex items-center justify-between font-mono cursor-pointer border-0 bg-transparent"
                >
                  Apenas Erros/Avisos <AlertCircle size={14}/>
                </button>
              </div>
            )}
          </div>
          
          <button 
            onClick={() => setLogs([])}
            className="p-2 bg-white/5 border border-white/5 hover:border-white/10 rounded-lg text-gray-400 hover:text-white transition-all hover:scale-105 active:scale-95 duration-150 cursor-pointer"
            title="Limpar Logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 bg-white/5 border border-white/5 hover:border-white/10 rounded-lg text-gray-400 hover:text-white transition-all hover:scale-105 active:scale-95 duration-150 cursor-pointer"
            title={isExpanded ? "Minimizar" : "Expandir"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          
          <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0"></div>
          
          <button 
            onClick={onClose}
            className="p-2 bg-white/5 border border-white/5 hover:bg-red-500/20 hover:border-red-500/30 rounded-lg text-gray-400 hover:text-red-400 transition-all hover:scale-105 active:scale-95 duration-150 cursor-pointer"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Logs Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 font-mono text-[10.5px] leading-relaxed custom-scrollbar bg-slate-950/40">
        {logs.length === 0 ? (
          <div className="m-auto flex flex-col items-center justify-center text-gray-500 space-y-3 select-none animate-in fade-in duration-500">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-gray-400 animate-pulse">
              <TerminalIcon className="w-6 h-6" />
            </div>
            <p className="font-semibold text-xs tracking-wider uppercase">Aguardando logs do servidor...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {logs.map((log) => {
              const date = new Date(log.timestamp);
              const timeString = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
              
              const isErr = log.level === 'error';
              const isWrn = log.level === 'warn';
              
              let cardStyle = 'border-l-2 border-slate-500/20 bg-slate-900/10 text-gray-300';
              let textStyle = 'text-gray-300';
              
              if (isErr) {
                cardStyle = 'border-l-2 border-red-500/80 bg-red-950/10 text-red-200 shadow-[0_2px_8px_rgba(239,68,68,0.02)]';
                textStyle = 'text-red-300 font-semibold';
              } else if (isWrn) {
                cardStyle = 'border-l-2 border-amber-500/80 bg-amber-950/5 text-amber-200 shadow-[0_2px_8px_rgba(245,158,11,0.02)]';
                textStyle = 'text-amber-300 font-semibold';
              }
              
              const parseResult = parseLogMessage(log.message);

              return (
                <div 
                  key={log.id} 
                  className={clsx(
                    "flex flex-col gap-1.5 p-2.5 rounded-r-xl border border-y-white/5 border-r-white/5 hover:bg-white/5 transition-all duration-150 group shrink-0",
                    cardStyle
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-[9px] font-bold text-slate-500 select-none bg-slate-950/40 px-1.5 py-0.5 rounded border border-white/5 shrink-0 shadow-sm mt-0.5">
                      {timeString}
                    </span>
                    {parseResult.isParsed ? (
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {parseResult.prefix && (
                          <span className="text-[8px] font-black bg-purple-500/10 border border-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded uppercase tracking-wider select-none shrink-0">
                            {parseResult.prefix}
                          </span>
                        )}
                        <span className={clsx("font-bold truncate text-xs", textStyle)}>
                          {parseResult.action}
                        </span>
                      </div>
                    ) : (
                      <span className={clsx("flex-1 whitespace-pre-wrap tracking-wide font-mono break-all", textStyle)}>
                        {parseResult.text}
                      </span>
                    )}
                  </div>
                  
                  {parseResult.isParsed && parseResult.data && (
                    <div className="pl-14">
                      {typeof parseResult.data === 'object' && Object.keys(parseResult.data).length > 0 ? (
                        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 bg-black/60 rounded-xl border border-white/5 p-3 text-[10px] font-mono shadow-inner overflow-x-auto custom-scrollbar select-text leading-relaxed">
                          {Object.entries(parseResult.data).map(([k, v]) => (
                            <React.Fragment key={k}>
                              <div className="text-blue-400 font-extrabold shrink-0 select-none">{k}:</div>
                              <div className="text-amber-200/90 break-all whitespace-pre-wrap font-semibold">
                                {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-black/60 rounded-xl border border-white/5 p-2.5 text-[10px] text-gray-200 select-text leading-relaxed">
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
