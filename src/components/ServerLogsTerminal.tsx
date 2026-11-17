import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Terminal as TerminalIcon, X, Trash2, Pause, Play, Maximize2, Minimize2, Copy, Check, Bug, AlertCircle, AlertTriangle, CheckCircle2, Info, Clock, RotateCcw, RefreshCw, Search } from 'lucide-react';
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
  if (msg.includes('Aviso no DB Fallback') || msg.includes('Aviso transitório no DB Fallback') || msg.includes('[SessionManager/AuthQueue]')) return true;
  if (msg.includes('Restabelecendo o socket com as credenciais preservadas')) return true;
  if (msg.includes('Socket encerrado pelo WhatsApp: Connection Terminated')) return true;
  if (msg.includes('Socket encerrado pelo WhatsApp: Stream Errored (unknown)')) return true;
  if (msg.includes('Socket encerrado pelo WhatsApp: Stream Errored (ack)')) return true;
  if (msg.includes('[handleMicClick]')) return true;
  if (msg.includes('HTTP Error 404 em POST') || msg.includes('HTTP Error 404 em GET')) return true;
  if (msg.includes("constava como 'connected' no banco mas está sem sessão ativa na RAM")) return true;
  if (msg.includes('[SnoozeManager] Erro ao buscar conversas expiradas: TimeoutError')) return true;
  if (msg.includes('Timeout ao inicializar sessão Baileys para')) return true;
  if (msg.includes('[RealtimePublisher/Supabase] Falha ao publicar') || msg.includes('Tenant not found in database')) return true;
  if (msg.includes('[PushService/ChecklistAlarm] Falha no envio push (400)')) return true;
  if (msg.includes('[Baileys] connection errored') && (msg.includes('Connection Terminated') || msg.includes('Stream Errored'))) return true;
  if (msg.includes('Evento connection_lost registrado com sucesso')) return true;
  if (msg.includes('Lock adquirido com sucesso')) return true;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'error' | 'warn'>('all');
  const [toastBanner, setToastBanner] = useState<{ text: string; tone: 'success' | 'warn' | 'error' } | null>(null);

  const showToast = (text: string, tone: 'success' | 'warn' | 'error' = 'success') => {
    setToastBanner({ text, tone });
    setTimeout(() => setToastBanner(null), 2800);
  };

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
  const logsScrollRef = useRef<HTMLDivElement>(null);

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
          'batchprocessor',
          'whatsapp solicitou reinicialização/estabilização de socket',
          'desativando e destruindo socket anterior',
          'oscilação transitória na fila de escrita',
          'auth writequeue operation timed out',
          'failed to sync regular_',
          'invalid wire type',
          'gastrofoodcache',
          'deduplicação gastrofood',
          'iniciando sincronização do cardápio',
          'baileys_message_receipt',
          'restabelecendo o socket com as credenciais preservadas',
          'socket encerrado pelo whatsapp: connection terminated',
          'socket encerrado pelo whatsapp: stream errored (unknown)',
          'socket encerrado pelo whatsapp: stream errored (ack)',
          'handlemicclick',
          'http error 404 em post',
          'http error 404 em get',
          'evento connection_lost registrado com sucesso',
          'lock adquirido com sucesso',
          'connection terminated'
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
          'reject', 'abort', 'denied',
          'exception', 'uncaught', 'badsession', 'bad_session', 'crash'
        ];
        
        const hasStatusCode = /\b(503|405|502|408|401|500)\b/.test(msgLower.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ''));
        const hasKeyword = hasStatusCode || errorKeywords.some(kw => msgLower.includes(kw));

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
        showToast('Nenhum erro, aviso ou padrão de loop identificado no log atual.', 'warn');
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
        showToast(`Erros e loops copiados! (${relevantLogs.length} eventos)`, 'success');
      }).catch(err => {
        console.error('Failed to copy logs', err);
        showToast('Falha ao copiar os logs!', 'error');
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
        showToast(`Log completo copiado! (${logs.length} linhas)`, 'success');
      }).catch(err => {
        console.error('Failed to copy logs', err);
        showToast('Falha ao copiar os logs!', 'error');
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
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000) });
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
      const res = await fetch(`${url}/api/v1/system/logs/all`, { signal: AbortSignal.timeout(8000) });
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
      if (healthOk || restOk) {
        setIsConnected(true);
      } else {
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
          // Em caso de oscilação do SSE, testa o healthcheck e REST antes de marcar offline
          checkHealth().then(healthy => {
            if (!healthy && isSubscribed) {
              fetchLogsRest().then(restHealthy => {
                if (!restHealthy && isSubscribed) {
                  setIsConnected(false);
                }
              });
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
    if (!isPaused && logsScrollRef.current) {
      logsScrollRef.current.scrollTo({
        top: logsScrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [logs, isPaused, isExpanded]);

  if (!isOpen) return null;

  const errorCount = logs.filter(l => l.level === 'error').length;
  const warnCount = logs.filter(l => l.level === 'warn').length;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredLogs = logs.filter(l => {
    if (levelFilter === 'error' && l.level !== 'error') return false;
    if (levelFilter === 'warn' && l.level !== 'warn') return false;
    if (normalizedSearch && !l.message.toLowerCase().includes(normalizedSearch)) return false;
    return true;
  });

  return (
    <>
      {/* Backdrop mobile para padrão Bottom Sheet */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm sm:hidden animate-in fade-in duration-200"
        aria-hidden="true"
      />

      <div
        onScroll={(e) => {
          if (e.currentTarget.scrollTop !== 0) e.currentTarget.scrollTop = 0;
          if (e.currentTarget.scrollLeft !== 0) e.currentTarget.scrollLeft = 0;
        }}
        className={clsx(
          "fixed z-[9999] flex flex-col overflow-hidden transition-all duration-300 ease-out shadow-[0_25px_75px_rgba(0,0,0,0.9)] border border-white/15 border-t-white/25 backdrop-blur-2xl bg-[#070c10]/95 text-[#e2e8f0]",
          isExpanded
            ? "inset-x-0 bottom-0 h-[92dvh] rounded-t-[28px] sm:inset-4 lg:inset-6 sm:w-auto sm:h-auto sm:rounded-[28px]"
            : "inset-x-0 bottom-0 h-[86dvh] rounded-t-[28px] sm:inset-auto sm:right-5 sm:bottom-5 sm:w-[640px] md:w-[700px] sm:max-w-[94vw] sm:h-[540px] sm:rounded-[26px]"
        )}
      >
        {/* Alça tátil Mobile */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 bg-[#080e13] shrink-0">
          <span className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header Responsivo em 2 Camadas (Sem Clipping Horizontal) */}
        <div className="border-b border-white/10 bg-[#080e13]/95 bg-gradient-to-r from-emerald-500/10 via-slate-900/60 to-purple-500/10 backdrop-blur-md select-none shrink-0">
          {/* Camada 1: Status + Controles Principais */}
          <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 bg-emerald-500/15 rounded-xl border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <TerminalIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs sm:text-sm font-black text-white tracking-wider font-mono uppercase truncate">
                    Server Console
                  </h3>
                  <span className={clsx(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black font-mono uppercase border",
                    isConnected
                      ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
                      : "bg-rose-500/15 border-rose-500/35 text-rose-300"
                  )}>
                    <span className={clsx("w-1.5 h-1.5 rounded-full", isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-400 animate-ping")} />
                    {isConnected ? "SSE ONLINE" : "OFFLINE"}
                  </span>
                  {serverInfo && (
                    <span className="hidden xs:inline text-[9px] font-mono px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-slate-300">
                      {serverInfo.node || 'NODE'} • v{serverInfo.version || '7.7.0'}
                    </span>
                  )}
                </div>

                {clearCutoffTimestamp ? (
                  <div className="flex items-center gap-1.5 mt-1 text-amber-300 text-[9px] font-mono">
                    <Clock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                    <span className="truncate">Corte às {new Date(clearCutoffTimestamp).toLocaleTimeString()}</span>
                    <button
                      type="button"
                      onClick={handleResetCutoff}
                      className="text-[9px] text-amber-300 hover:text-white underline font-bold cursor-pointer shrink-0"
                      title="Restaurar histórico completo de logs"
                    >
                      Restaurar tudo
                    </button>
                  </div>
                ) : (
                  <span className="text-[9px] text-[#94a3b8] font-mono block mt-0.5 truncate">
                    Streaming Node.js SSE + REST + Supabase Realtime
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsPaused(!isPaused)}
                className={clsx(
                  "min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl border transition-all active:scale-95 cursor-pointer",
                  isPaused
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                    : "bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10"
                )}
                title={isPaused ? "Retomar Auto-Scroll" : "Pausar Auto-Scroll"}
              >
                {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="hidden sm:flex min-w-[38px] min-h-[38px] items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-all active:scale-95 cursor-pointer"
                title={isExpanded ? "Restaurar Janela" : "Expandir Tela Cheia"}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="min-w-[38px] min-h-[38px] flex items-center justify-center bg-white/5 border border-white/10 hover:bg-rose-500/20 hover:border-rose-500/40 rounded-xl text-slate-300 hover:text-rose-200 transition-all active:scale-95 cursor-pointer"
                title="Fechar Console do Servidor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Camada 2: Ferramentas + Busca + Filtros de Nível */}
          <div className="px-3.5 sm:px-4 pb-2.5 pt-1 flex flex-col gap-2 border-t border-white/5">
            <div className="flex items-center gap-1.5 flex-wrap justify-between">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className={clsx(
                    "min-h-[34px] px-2.5 py-1 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-slate-200 hover:text-white transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 text-[10px] font-bold font-mono",
                    isRefreshing && "opacity-60 cursor-not-allowed"
                  )}
                  title="Recarregar Logs e Sincronizar Conexão"
                >
                  <RefreshCw className={clsx("w-3 h-3", isRefreshing && "animate-spin text-emerald-400")} />
                  <span>Atualizar</span>
                </button>

                <button
                  type="button"
                  onClick={toggleDebugMode}
                  className={clsx(
                    "min-h-[34px] px-2.5 py-1 rounded-xl transition-all border text-[10px] font-bold font-mono cursor-pointer active:scale-95 flex items-center gap-1.5",
                    isDebugMode
                      ? "bg-purple-500/25 text-purple-200 border-purple-400/50 shadow-sm"
                      : "bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10"
                  )}
                  title={isDebugMode ? "Modo Debug: ATIVO" : "Ativar Modo Debug (Trace)"}
                >
                  <Bug className="w-3 h-3" />
                  <span>{isDebugMode ? 'Debug ON' : 'Debug'}</span>
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCopyOptions(!showCopyOptions)}
                    className="min-h-[34px] px-2.5 py-1 bg-white/5 border border-white/10 hover:bg-emerald-500/15 hover:border-emerald-500/35 rounded-xl text-slate-200 hover:text-emerald-200 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 text-[10px] font-bold font-mono"
                    title="Copiar Logs"
                  >
                    {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>Copiar</span>
                  </button>
                  {showCopyOptions && (
                    <div className="absolute left-0 top-full mt-1.5 w-52 bg-[#0d151d] border border-white/15 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 z-50">
                      <button
                        type="button"
                        onClick={() => { setShowCopyOptions(false); handleCopyLogs('all'); }}
                        className="w-full min-h-[40px] text-left px-3.5 py-2 text-xs text-slate-100 hover:bg-white/10 transition-colors font-bold font-mono cursor-pointer"
                      >
                        Log Completo ({logs.length})
                      </button>
                      <div className="h-px bg-white/10 w-full" />
                      <button
                        type="button"
                        onClick={() => { setShowCopyOptions(false); handleCopyLogs('errors'); }}
                        className="w-full min-h-[40px] text-left px-3.5 py-2 text-xs text-rose-300 hover:bg-rose-500/15 transition-colors font-bold flex items-center justify-between font-mono cursor-pointer"
                      >
                        <span>Apenas Erros/Loops</span>
                        <AlertCircle size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleClearLogs}
                  className="min-h-[34px] px-2.5 py-1 bg-white/5 border border-white/10 hover:bg-rose-500/15 hover:border-rose-500/35 rounded-xl text-slate-300 hover:text-rose-200 transition-all active:scale-95 cursor-pointer flex items-center gap-1 text-[10px] font-bold font-mono"
                  title="Limpar Logs (Grava horário de corte)"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Limpar</span>
                </button>
              </div>

              {/* Chips Rápidos de Nível */}
              <div className="flex items-center gap-1 bg-[#0e161d] p-0.5 rounded-xl border border-white/10 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() => setLevelFilter('all')}
                  className={clsx(
                    "min-h-[28px] px-2 rounded-lg font-bold transition-all cursor-pointer active:scale-95",
                    levelFilter === 'all' ? "bg-emerald-500 text-slate-950 font-black" : "text-slate-400 hover:text-white"
                  )}
                >
                  Todos ({logs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setLevelFilter('error')}
                  className={clsx(
                    "min-h-[28px] px-2 rounded-lg font-bold transition-all cursor-pointer active:scale-95",
                    levelFilter === 'error' ? "bg-rose-500 text-white font-black" : "text-rose-300/80 hover:text-rose-200"
                  )}
                >
                  Erros ({errorCount})
                </button>
                <button
                  type="button"
                  onClick={() => setLevelFilter('warn')}
                  className={clsx(
                    "min-h-[28px] px-2 rounded-lg font-bold transition-all cursor-pointer active:scale-95",
                    levelFilter === 'warn' ? "bg-amber-400 text-slate-950 font-black" : "text-amber-300/80 hover:text-amber-200"
                  )}
                >
                  Alertas ({warnCount})
                </button>
              </div>
            </div>

            {/* Campo de Busca Textual */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar nos logs do servidor Node.js..."
                className="w-full min-h-[34px] pl-8 pr-8 py-1 bg-[#0c141c] border border-white/10 rounded-xl text-[11px] font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 text-slate-400 hover:text-white cursor-pointer"
                  title="Limpar busca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Toast Não-Bloqueante de Feedback */}
        {toastBanner && (
          <div className={clsx(
            "px-4 py-2 text-[11px] font-mono font-bold flex items-center justify-between gap-2 border-b shrink-0 animate-in fade-in duration-150",
            toastBanner.tone === 'success'
              ? "bg-emerald-500/20 border-emerald-500/35 text-emerald-200"
              : toastBanner.tone === 'warn'
                ? "bg-amber-500/20 border-amber-500/35 text-amber-200"
                : "bg-rose-500/20 border-rose-500/35 text-rose-200"
          )}>
            <span>{toastBanner.text}</span>
            <button type="button" onClick={() => setToastBanner(null)} className="opacity-70 hover:opacity-100 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Área de Logs */}
        <div ref={logsScrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col gap-2 font-mono text-[11px] leading-relaxed custom-scrollbar bg-[#060b0f]/80 min-h-0">
          {filteredLogs.length === 0 ? (
            <div className="m-auto flex flex-col items-center justify-center text-slate-400 space-y-3 select-none animate-in fade-in duration-300 text-center px-4 py-8">
              <div className={clsx(
                "w-14 h-14 rounded-2xl border flex items-center justify-center transition-all",
                isConnected
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 animate-pulse"
                  : "bg-rose-500/15 border-rose-500/30 text-rose-400"
              )}>
                <TerminalIcon className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <p className="font-black text-xs tracking-wider uppercase text-white">
                  {logs.length > 0
                    ? 'Nenhum log corresponde aos filtros aplicados'
                    : clearCutoffTimestamp
                      ? `Aguardando novos logs a partir das ${new Date(clearCutoffTimestamp).toLocaleTimeString()}...`
                      : isConnected
                        ? 'Servidor Conectado • Aguardando atividades'
                        : 'Aguardando conexão com o servidor...'}
                </p>
                <p className="text-[11px] text-slate-400 max-w-xs font-sans">
                  {logs.length > 0
                    ? 'Limpe o campo de busca ou altere o filtro de nível para ver todas as linhas.'
                    : isConnected
                      ? 'O motor Node/Baileys está ativo. Novos eventos aparecerão automaticamente em tempo real.'
                      : 'Sincronizando logs via streaming SSE, REST e canais Supabase Realtime.'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {(searchQuery || levelFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setLevelFilter('all'); }}
                    className="min-h-[38px] px-3.5 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 rounded-xl text-[11px] font-bold text-indigo-200 transition-all cursor-pointer active:scale-95"
                  >
                    Limpar Filtros
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="min-h-[38px] flex items-center gap-1.5 px-3.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-bold text-slate-200 hover:text-white transition-all cursor-pointer active:scale-95"
                >
                  <RefreshCw className={clsx("w-3.5 h-3.5", isRefreshing && "animate-spin text-emerald-400")} />
                  <span>{isRefreshing ? 'Atualizando...' : 'Recarregar agora'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredLogs.map((log) => {
                const date = new Date(log.timestamp);
                const timeString = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;

                const isErr = log.level === 'error';
                const isWrn = log.level === 'warn';

                let cardStyle = 'border-l-2 border-l-slate-500/40 border-white/10 bg-[#0d151d]/90 text-slate-200';
                let textStyle = 'text-slate-100';

                if (isErr) {
                  cardStyle = 'border-l-4 border-l-rose-500 border-rose-500/30 bg-rose-950/20 text-rose-100';
                  textStyle = 'text-rose-200 font-semibold';
                } else if (isWrn) {
                  cardStyle = 'border-l-4 border-l-amber-400 border-amber-500/30 bg-amber-950/15 text-amber-100';
                  textStyle = 'text-amber-200 font-semibold';
                }

                const parseResult = parseLogMessage(log.message);

                return (
                  <div
                    key={log.id}
                    className={clsx(
                      "flex flex-col gap-1.5 p-2.5 sm:p-3 rounded-xl border hover:border-white/20 transition-all duration-150 group shrink-0",
                      cardStyle
                    )}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-[10px] font-bold text-slate-400 select-none bg-black/40 px-2 py-0.5 rounded-md border border-white/10 shrink-0 mt-0.5">
                        {timeString}
                      </span>
                      {parseResult.isParsed ? (
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          {parseResult.prefix && (
                            <span className="text-[9px] font-black bg-purple-500/15 border border-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded uppercase tracking-wider select-none shrink-0">
                              {parseResult.prefix}
                            </span>
                          )}
                          <span className={clsx("font-bold text-xs break-words", textStyle)}>
                            {parseResult.action}
                          </span>
                        </div>
                      ) : (
                        <span className={clsx("flex-1 whitespace-pre-wrap tracking-wide font-mono break-words min-w-0", textStyle)}>
                          {parseResult.text}
                        </span>
                      )}
                    </div>

                    {parseResult.isParsed && parseResult.data && (
                      <div className="pl-1 sm:pl-12">
                        {typeof parseResult.data === 'object' && Object.keys(parseResult.data).length > 0 ? (
                          <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 bg-[#04080c] rounded-xl border border-white/10 p-2.5 text-[10px] font-mono shadow-inner overflow-x-auto custom-scrollbar select-text leading-relaxed">
                            {Object.entries(parseResult.data).map(([k, v]) => (
                              <React.Fragment key={k}>
                                <div className="text-blue-400 font-extrabold shrink-0 select-none">{k}:</div>
                                <div className="text-amber-200/95 break-all whitespace-pre-wrap font-semibold">
                                  {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}
                                </div>
                              </React.Fragment>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-[#04080c] rounded-xl border border-white/10 p-2.5 text-[10px] text-slate-200 select-text leading-relaxed break-words">
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
    </>
  );
};
