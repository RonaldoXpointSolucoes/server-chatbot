import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Terminal as TerminalIcon, X, Trash2, Pause, Play, Maximize2, Minimize2, Copy, Check, Bug, AlertCircle, AlertTriangle, CheckCircle2, Info, Clock, RotateCcw, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { supabase } from '../services/supabase';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  source?: 'sse' | 'rest' | 'supabase';
}

interface ServerInfo {
  status?: string;
  environment?: string;
  node?: string;
  version?: string;
  time?: string;
}

interface ServerLogsTerminalProps {
  onClose: () => void;
  isOpen: boolean;
}

const getEngineUrl = (): string => {
  const envUrl = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim();
  if (envUrl && envUrl.startsWith('http')) {
    return envUrl.replace(/\/+$/, '');
  }
  return 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';
};

const isSpamLog = (msg: string) => {
  if (!msg) return false;
  if (msg.includes('Mídia expirada/inacessível para JID') && msg.includes('Normal em History Sync')) return true;
  if (msg.includes('stream errored out') && msg.includes('"reasonNode":{"tag":"conflict","attrs":{"type":"replaced"}}')) return true;
  if (msg.includes('received error in ack') && (msg.includes('479') || msg.includes('475'))) return true;
  if (msg.includes('Closing session:') || msg.includes('Closing session in favor of')) return true;
  if (msg.includes('QR Code ou pareamento expirou por falta de leitura')) return true;
  return false;
};

export const ServerLogsTerminal: React.FC<ServerLogsTerminalProps> = ({ onClose, isOpen }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showCopyOptions, setShowCopyOptions] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);

  const [clearCutoffTimestamp, setClearCutoffTimestamp] = useState<number | null>(() => {
    const saved = localStorage.getItem('server_console_log_cutoff');
    return saved ? parseInt(saved, 10) : null;
  });

  const clearCutoffRef = useRef(clearCutoffTimestamp);
  useEffect(() => {
    clearCutoffRef.current = clearCutoffTimestamp;
  }, [clearCutoffTimestamp]);

  const handleClearLogs = () => {
    const now = Date.now();
    setClearCutoffTimestamp(now);
    localStorage.setItem('server_console_log_cutoff', now.toString());
    setLogs([]);
  };

  const handleResetCutoff = () => {
    setClearCutoffTimestamp(null);
    localStorage.removeItem('server_console_log_cutoff');
    const url = getEngineUrl();
    fetch(`${url}/api/v1/system/logs/all`)
      .then(res => res.json())
      .then(json => {
        if (json.success && Array.isArray(json.logs)) {
          setLogs(json.logs.filter((log: LogEntry) => !isSpamLog(log.message)));
        }
      })
      .catch(() => {});
  };
  
  const bottomRef = useRef<HTMLDivElement>(null);

  const toggleDebugMode = async () => {
    const newMode = !isDebugMode;
    setIsDebugMode(newMode);
    try {
      const url = getEngineUrl();
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
    if (!logs || logs.length === 0) {
      alert("Não há logs disponíveis para cópia.");
      return;
    }

    let textToCopy = '';

    if (mode === 'errors') {
      const isErrorOrLoopOrLogicFailure = (log: LogEntry, countInLogs: number) => {
        const msgLower = (log.message || '').toLowerCase();
        
        const normalOperationalLogs = [
          'ip de saída',
          'usando wa v2',
          'current prekey id',
          'handled 0 offline messages',
          'awaitinginitialsync',
          'history sync is enabled',
          'history sync is disabled',
          'transitioning to online',
          'identity changed',
          'opened connection to wa',
          'connected to wa',
          'instância conectada com sucesso',
          'chave recuperada via db fallback',
          'carregadas',
          'wacalls sse proxy',
          'unhandled mex newsletter notification',
          'mex newsletter notification',
          'vetorização rag finalizadas com sucesso',
          'sincronização e vetorização rag finalizadas',
          'salvando 12 grupos',
          'salvando',
          'sincronizando adicionais',
          'cache do cardápio limpo',
          'cache miss',
          'drenando lote',
          'mensagens inseridas',
          'ia e automações globais estão desativadas',
          'pushservice',
          'batchprocessor'
        ];

        if (msgLower.includes('gastrofood api') && (msgLower.includes('"status":200') || msgLower.includes('"status": 200') || (msgLower.includes('"error":null') && !msgLower.includes('error:')))) {
          return false;
        }

        if (msgLower.includes('history sync is disabled') || msgLower.includes('identity changed') || msgLower.includes('mex newsletter notification')) {
          return false;
        }
        
        const isNormalOp = normalOperationalLogs.some(op => msgLower.includes(op));
        if (isNormalOp && log.level !== 'error' && log.level !== 'warn') {
          return false;
        }

        if (log.level === 'error') return true;

        if (log.level === 'warn') {
          if (isNormalOp) return false;
          return true;
        }
        
        const errorKeywords = [
          'error', 'erro', 'falha', 'failed', 'fail', 'timeout',
          'reconnecting', 'connection_lost', 'connection errored', 'connection terminated',
          'disconnect', 'code 4', 'code 5', 'statuscode 4', 'statuscode 5',
          'reject', '503', '405', '502', '408', '401', '500', 'lock', 'abort', 'denied',
          'exception', 'uncaught', 'badsession', 'bad_session', 'crash'
        ];
        
        const hasKeyword = errorKeywords.some(kw => msgLower.includes(kw));

        if (hasKeyword && !isNormalOp) return true;

        return false;
      };

      const messageCounts = new Map<string, number>();
      logs.forEach(log => {
        const key = `${log.level}:${log.message}`;
        messageCounts.set(key, (messageCounts.get(key) || 0) + 1);
      });

      const relevantLogs = logs.filter(log => {
        const key = `${log.level}:${log.message}`;
        const count = messageCounts.get(key) || 1;
        return isErrorOrLoopOrLogicFailure(log, count);
      });

      if (relevantLogs.length === 0) {
        alert("Nenhum erro, aviso ou padrão de loop identificado no log atual.");
        return;
      }

      const groupedMap = new Map<string, { count: number; firstTime: string; lastTime: string; log: LogEntry }>();
      relevantLogs.forEach(log => {
        const key = `[${log.level.toUpperCase()}] ${log.message}`;
        const timeStr = new Date(log.timestamp).toLocaleTimeString();
        if (groupedMap.has(key)) {
          const item = groupedMap.get(key)!;
          item.count++;
          item.lastTime = timeStr;
        } else {
          groupedMap.set(key, { count: 1, firstTime: timeStr, lastTime: timeStr, log });
        }
      });

      const formattedItems = Array.from(groupedMap.values()).map(({ count, firstTime, lastTime, log }) => {
        const timeRange = count > 1 && firstTime !== lastTime ? ` [das ${firstTime} às ${lastTime}]` : ` às ${firstTime}`;
        const baseString = `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.level.toUpperCase()}] ${log.message}`;
        
        let detailsString = '';
        if ((log as any).details) {
          try {
            detailsString = `\n  Detalhes: ${typeof (log as any).details === 'object' ? JSON.stringify((log as any).details) : (log as any).details}`;
          } catch(e) {}
        }

        if (count > 1) {
          return `Este erro/evento de loop ocorreu ${count} vezes${timeRange}:\n${baseString}${detailsString}\n`;
        }
        return `${baseString}${detailsString}`;
      });

      const startTime = new Date(relevantLogs[0].timestamp).toLocaleTimeString();
      const endTime = new Date(relevantLogs[relevantLogs.length - 1].timestamp).toLocaleTimeString();

      textToCopy = `=== RELATÓRIO DIAGNÓSTICO DE ERROS, FALHAS E LOOPS ===\n` +
        `Total de eventos críticos/loops analisados: ${relevantLogs.length} (em ${groupedMap.size} padrões únicos)\n` +
        `Janela de Horário: [${startTime} até ${endTime}]\n\n` +
        `--- LISTA DE ERROS, AVISOS E PADRÕES DE LOOP ---\n` +
        formattedItems.join('\n');

      navigator.clipboard.writeText(textToCopy).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
        alert(`Erros, avisos e padrões de loop copiados com sucesso! (${relevantLogs.length} eventos formatados)`);
      }).catch(err => {
        console.error('Failed to copy logs', err);
        alert('Falha ao copiar os logs!');
      });

    } else {
      const aggregatedLogs: { count: number; log: LogEntry }[] = [];
      for (const log of logs) {
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

      navigator.clipboard.writeText(textToCopy).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
        alert(`Log completo copiado com sucesso! (${logs.length} linhas copiadas)`);
      }).catch(err => {
        console.error('Failed to copy logs', err);
        alert('Falha ao copiar os logs!');
      });
    }
  };
  
  const logsRef = useRef(logs);
  logsRef.current = logs;

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const checkHealth = useCallback(async () => {
    try {
      const url = getEngineUrl();
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data: ServerInfo = await res.json();
        if (data && (data.status === 'ok' || data.node || data.version)) {
          setIsConnected(true);
          setServerInfo(data);
          return true;
        }
      }
    } catch {
      // Ignora falha de timeout pontual
    }
    return false;
  }, []);

  const loadLogsFromSupabase = useCallback(async () => {
    try {
      const cutoff = clearCutoffRef.current;
      let query = supabase
        .from('system_logs')
        .select('id, created_at, level, message, type')
        .order('created_at', { ascending: false })
        .limit(80);

      if (cutoff) {
        const isoCutoff = new Date(cutoff).toISOString();
        query = query.gte('created_at', isoCutoff);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        const formatted: LogEntry[] = data
          .reverse()
          .filter(row => row.message && !isSpamLog(row.message))
          .map(row => ({
            id: String(row.id || Math.random()),
            timestamp: row.created_at || new Date().toISOString(),
            level: (row.level as any) || 'info',
            message: row.type && row.type !== 'Backend Error' ? `[${row.type}] ${row.message}` : row.message,
            source: 'supabase'
          }));

        setLogs(prev => {
          if (prev.length === 0) return formatted;
          const existingSignatures = new Set(prev.map(p => `${p.level}:${p.message}`));
          const newEntries = formatted.filter(f => !existingSignatures.has(`${f.level}:${f.message}`));
          return [...prev, ...newEntries].slice(-300);
        });
        return true;
      }
    } catch (err) {
      console.debug('Falha ao carregar fallback do Supabase', err);
    }
    return false;
  }, []);

  const fetchLogsRest = useCallback(async () => {
    try {
      const url = getEngineUrl();
      const res = await fetch(`${url}/api/v1/system/logs/all`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.logs)) {
          setIsConnected(true);
          const cutoff = clearCutoffRef.current;
          const filteredLogs = json.logs.filter((log: LogEntry) => {
            if (isSpamLog(log.message)) return false;
            if (cutoff) {
              const logTime = new Date(log.timestamp).getTime();
              if (!isNaN(logTime) && logTime < cutoff) return false;
            }
            return true;
          });
          setLogs(filteredLogs);
          return true;
        }
      }
    } catch {
      // Ignora erro de fetch
    }
    return false;
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const healthOk = await checkHealth();
      const restOk = await fetchLogsRest();
      if (!restOk && (!logsRef.current || logsRef.current.length === 0)) {
        await loadLogsFromSupabase();
      }
      if (!healthOk && !restOk) {
        setIsConnected(false);
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    let isSubscribed = true;
    const url = getEngineUrl();

    // 1. Verificação imediata de saúde e carga inicial
    checkHealth();
    fetchLogsRest().then(success => {
      if (!success && isSubscribed) {
        loadLogsFromSupabase();
      }
    });

    // 2. Conexão SSE para streaming em tempo real do Node
    let sse: EventSource | null = null;
    try {
      sse = new EventSource(`${url}/api/v1/system/logs/stream`);
      
      sse.onopen = () => {
        if (isSubscribed) {
          setIsConnected(true);
        }
      };

      sse.onerror = () => {
        if (isSubscribed) {
          // Em caso de oscilação do SSE, testa o healthcheck antes de marcar offline
          checkHealth().then(healthy => {
            if (!healthy && isSubscribed) {
              setIsConnected(false);
            }
          });
        }
      };

      sse.onmessage = (event) => {
        if (isPausedRef.current || !isSubscribed) return;
        
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'init') {
            const cutoff = clearCutoffRef.current;
            const filteredLogs = (data.logs || []).filter((log: LogEntry) => {
              if (isSpamLog(log.message)) return false;
              if (cutoff) {
                const logTime = new Date(log.timestamp).getTime();
                if (!isNaN(logTime) && logTime < cutoff) return false;
              }
              return true;
            });
            setLogs(filteredLogs);
            setIsConnected(true);
          } else if (data.message) {
            if (isSpamLog(data.message)) return;

            const cutoff = clearCutoffRef.current;
            if (cutoff) {
              const logTime = new Date(data.timestamp || Date.now()).getTime();
              if (!isNaN(logTime) && logTime < cutoff) return;
            }

            setLogs(prev => {
              const next = [...prev, { ...data, source: 'sse' }];
              if (next.length > 300) return next.slice(next.length - 300);
              return next;
            });
            setIsConnected(true);
          }
        } catch (err) {
          console.error('SSE Parse Error', err);
        }
      };
    } catch {
      // Fallback
    }

    // 3. Canal Realtime Supabase para espelhamento dos logs gravados em banco
    const realtimeChannel = supabase
      .channel('server_logs_terminal_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_logs' },
        (payload) => {
          if (isPausedRef.current || !isSubscribed) return;
          const newRow: any = payload.new;
          if (!newRow || !newRow.message || isSpamLog(newRow.message)) return;

          const cutoff = clearCutoffRef.current;
          if (cutoff) {
            const logTime = new Date(newRow.created_at || Date.now()).getTime();
            if (!isNaN(logTime) && logTime < cutoff) return;
          }

          const entry: LogEntry = {
            id: String(newRow.id || Math.random()),
            timestamp: newRow.created_at || new Date().toISOString(),
            level: (newRow.level as any) || 'info',
            message: newRow.type && newRow.type !== 'Backend Error' ? `[${newRow.type}] ${newRow.message}` : newRow.message,
            source: 'supabase'
          };

          setLogs(prev => {
            const isDuplicate = prev.some(p => 
              p.id === entry.id || 
              (p.message === entry.message && Math.abs(new Date(p.timestamp).getTime() - new Date(entry.timestamp).getTime()) < 3000)
            );
            if (isDuplicate) return prev;
            const next = [...prev, entry];
            return next.length > 300 ? next.slice(next.length - 300) : next;
          });
        }
      )
      .subscribe();

    // 4. Polling periódico de saúde e sincronização a cada 5 segundos
    const syncInterval = setInterval(() => {
      if (isSubscribed && !isPausedRef.current) {
        checkHealth();
        // Se ainda não houver logs carregados, tenta buscar
        if (logsRef.current.length === 0) {
          fetchLogsRest().then(success => {
            if (!success && isSubscribed) loadLogsFromSupabase();
          });
        }
      }
    }, 5000);

    return () => {
      isSubscribed = false;
      if (sse) sse.close();
      if (syncInterval) clearInterval(syncInterval);
      supabase.removeChannel(realtimeChannel);
    };
  }, [isOpen, checkHealth, fetchLogsRest, loadLogsFromSupabase]);

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
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
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
              <span className={clsx(
                "text-[8px] font-semibold font-mono tracking-widest uppercase",
                isConnected ? "text-emerald-400" : "text-red-400"
              )}>
                {isConnected ? "online" : "offline"}
              </span>

              {serverInfo && (
                <span className="text-[8px] font-mono px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-slate-300">
                  {serverInfo.node || 'NODE'} • v{serverInfo.version || '7.7.0'}
                </span>
              )}

              {clearCutoffTimestamp && (
                <div className="flex items-center gap-1 ml-1 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-300 text-[9px] font-mono select-none animate-in fade-in">
                  <Clock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                  <span>A partir das {new Date(clearCutoffTimestamp).toLocaleTimeString()}</span>
                  <button 
                    onClick={handleResetCutoff}
                    className="ml-1 text-[8px] text-amber-400 hover:text-amber-200 underline font-bold cursor-pointer border-0 bg-transparent"
                    title="Restaurar histórico completo de logs"
                  >
                    Mostrar todos
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          <button 
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className={clsx(
              "p-2 bg-white/5 border border-white/5 hover:border-white/10 rounded-lg text-gray-400 hover:text-white transition-all hover:scale-105 active:scale-95 duration-150 cursor-pointer",
              isRefreshing && "opacity-50 cursor-not-allowed"
            )}
            title="Recarregar Logs e Sincronizar Conexão"
          >
            <RefreshCw className={clsx("w-3.5 h-3.5", isRefreshing && "animate-spin text-emerald-400")} />
          </button>

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
            onClick={handleClearLogs}
            className="p-2 bg-white/5 border border-white/5 hover:border-white/10 rounded-lg text-gray-400 hover:text-white transition-all hover:scale-105 active:scale-95 duration-150 cursor-pointer"
            title="Limpar Logs (Grava horário de corte)"
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
          <div className="m-auto flex flex-col items-center justify-center text-gray-500 space-y-3 select-none animate-in fade-in duration-500 text-center px-4">
            <div className={clsx(
              "w-12 h-12 rounded-2xl border flex items-center justify-center transition-all",
              isConnected 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 animate-pulse" 
                : "bg-red-500/10 border-red-500/20 text-red-400"
            )}>
              <TerminalIcon className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-xs tracking-wider uppercase text-gray-300">
                {clearCutoffTimestamp 
                  ? `Aguardando novos logs a partir das ${new Date(clearCutoffTimestamp).toLocaleTimeString()}...`
                  : isConnected 
                    ? 'Servidor Conectado • Aguardando novas atividades...' 
                    : 'Aguardando logs do servidor...'}
              </p>
              <p className="text-[10px] text-gray-400 max-w-xs">
                {isConnected 
                  ? 'O motor do WhatsApp está ativo. Novos eventos serão exibidos automaticamente aqui.' 
                  : 'Tentando sincronizar logs via streaming SSE, REST e canais Realtime.'}
              </p>
            </div>
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] font-mono text-gray-300 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={clsx("w-3 h-3", isRefreshing && "animate-spin text-emerald-400")} />
              <span>{isRefreshing ? 'Atualizando...' : 'Recarregar logs agora'}</span>
            </button>
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
