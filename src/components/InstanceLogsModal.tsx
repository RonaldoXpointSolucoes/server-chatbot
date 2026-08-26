import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Terminal,
  X,
  Trash2,
  Pause,
  Play,
  Copy,
  Check,
  Search,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  ArrowDown,
  Server,
  Activity,
  Globe,
  Radio,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Configurações do Supabase & Engines com Fallback Automático
const SUPABASE_URL = 'https://yzbxsxabzncdzuxvlppt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YnhzeGFiem5jZHp1eHZscHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTIyMDcwMywiZXhwIjoyMDkwNzk2NzAzfQ.rU4sjTTwrIu1YrF-bkHKN9vvfBUGr2cIWppepT1uY0k';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ENGINE_CANDIDATES = [
  import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim(),
  'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io'
].filter(Boolean) as string[];

export interface LogItem {
  id: string;
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'log';
  message: string;
  source?: 'server' | 'database' | 'monitoring';
  details?: any;
}

interface WhatsAppInstance {
  id: string;
  tenant_id: string;
  display_name: string;
  phone_number: string | null;
  status: string;
  color?: string;
  api_key?: string | null;
  created_at: string;
  updated_at: string;
  last_connected_at?: string | null;
  last_error?: string | null;
  egress_ip?: string | null;
  egress_city?: string | null;
  settings?: any;
  assigned_node_id?: string | null;
  profile_picture_url?: string | null;
}

interface InstanceLogsModalProps {
  instance: WhatsAppInstance | null;
  isOpen: boolean;
  onClose: () => void;
}

export const InstanceLogsModal: React.FC<InstanceLogsModalProps> = ({
  instance,
  isOpen,
  onClose
}) => {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [filterLevel, setFilterLevel] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedType, setCopiedType] = useState<'all' | 'errors' | 'id' | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Função auxiliar para verificar se o log pertence estritamente a esta instância
  const isLogFromThisInstance = (msg: string, inst: WhatsAppInstance): boolean => {
    if (!msg || !inst) return false;
    const msgLower = msg.toLowerCase();
    const instIdLower = inst.id.toLowerCase();
    const shortId = inst.id.slice(0, 8).toLowerCase();
    const phone = inst.phone_number ? inst.phone_number.replace(/\D/g, '') : null;
    const nameLower = inst.display_name ? inst.display_name.toLowerCase() : null;

    if (msgLower.includes(instIdLower) || msgLower.includes(shortId)) return true;
    if (phone && phone.length >= 8 && (msgLower.includes(phone) || msgLower.includes(`55${phone}`))) return true;
    if (nameLower && nameLower.length >= 4 && msgLower.includes(`"${nameLower}"`)) return true;

    return false;
  };

  // Carrega histórico inicial do servidor e do Supabase
  const loadInitialLogs = async () => {
    if (!instance) return;
    setIsLoading(true);

    try {
      const combined: LogItem[] = [];

      // 1. Logs do Servidor Backend (REST API)
      for (const baseUrl of ENGINE_CANDIDATES) {
        try {
          const res = await fetch(`${baseUrl}/api/v1/system/logs/all`, { signal: AbortSignal.timeout(4000) });
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.logs)) {
              data.logs.forEach((l: any) => {
                if (isLogFromThisInstance(l.message, instance)) {
                  combined.push({
                    id: l.id || `srv_${Math.random().toString(36).substring(2, 9)}`,
                    timestamp: l.timestamp || new Date().toISOString(),
                    level: l.level === 'warn' ? 'warn' : l.level === 'error' ? 'error' : l.level === 'info' ? 'info' : 'log',
                    message: l.message,
                    source: 'server'
                  });
                }
              });
            }
            break;
          }
        } catch (e) {}
      }

      // 2. Eventos de Conexão do Supabase (wa_connection_events)
      try {
        const { data: connEvents } = await supabase
          .from('wa_connection_events')
          .select('*')
          .eq('instance_id', instance.id)
          .order('created_at', { ascending: false })
          .limit(40);

        if (connEvents && connEvents.length > 0) {
          connEvents.forEach((ev: any) => {
            const isErr = ev.event_type?.includes('fail') || ev.event_type?.includes('error') || ev.event_type?.includes('disconnect') || ev.connection_status === 'close' || ev.connection_status === 'disconnected';
            const isWarn = ev.event_type?.includes('reconnect') || ev.connection_status === 'reconnecting';
            const lvl = isErr ? 'error' : isWarn ? 'warn' : 'info';
            
            let desc = `[Supabase/Event] Evento: ${ev.event_type} | Status: ${ev.connection_status}`;
            if (ev.disconnect_reason) desc += ` | Motivo: ${ev.disconnect_reason}`;
            if (ev.egress_ip) desc += ` | IP: ${ev.egress_ip} (${ev.egress_country || 'BR'})`;

            combined.push({
              id: `db_ev_${ev.id}`,
              timestamp: ev.created_at,
              level: lvl,
              message: desc,
              source: 'database',
              details: ev.payload
            });
          });
        }
      } catch (dbErr) {}

      // 3. Logs de Monitoramento do Supabase (wa_instance_monitoring_logs)
      try {
        const { data: monLogs } = await supabase
          .from('wa_instance_monitoring_logs')
          .select('*')
          .eq('instance_id', instance.id)
          .order('created_at', { ascending: false })
          .limit(30);

        if (monLogs && monLogs.length > 0) {
          monLogs.forEach((ml: any) => {
            const isErr = ml.event_type?.includes('error') || ml.event_type?.includes('lost');
            combined.push({
              id: `db_mon_${ml.id}`,
              timestamp: ml.created_at,
              level: isErr ? 'error' : 'info',
              message: `[Monitoramento] ${ml.event_type} ${ml.details ? JSON.stringify(ml.details) : ''}`,
              source: 'monitoring',
              details: ml.details
            });
          });
        }
      } catch (monErr) {}

      // Ordena todos os logs cronologicamente
      combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      setLogs(combined);
    } catch (err) {
      console.warn('[InstanceLogsModal] Erro ao carregar logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Conecta ao stream SSE em tempo real
  useEffect(() => {
    if (!isOpen || !instance) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    loadInitialLogs();

    let sse: EventSource | null = null;
    for (const baseUrl of ENGINE_CANDIDATES) {
      try {
        sse = new EventSource(`${baseUrl}/api/v1/system/logs/stream`);
        
        sse.onopen = () => {
          setIsConnected(true);
        };

        sse.onmessage = (event) => {
          if (isPausedRef.current) return;
          try {
            const parsed = JSON.parse(event.data);
            if (parsed && parsed.message) {
              if (isLogFromThisInstance(parsed.message, instance)) {
                const newEntry: LogItem = {
                  id: parsed.id || `live_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                  timestamp: parsed.timestamp || new Date().toISOString(),
                  level: parsed.level === 'warn' ? 'warn' : parsed.level === 'error' ? 'error' : parsed.level === 'info' ? 'info' : 'log',
                  message: parsed.message,
                  source: 'server'
                };
                setLogs((prev) => [...prev, newEntry]);
              }
            }
          } catch (e) {}
        };

        sse.onerror = () => {
          setIsConnected(false);
        };

        eventSourceRef.current = sse;
        break;
      } catch (err) {
        console.warn(`[InstanceLogsModal] Falha ao conectar SSE em ${baseUrl}:`, err);
      }
    }

    return () => {
      if (sse) {
        sse.close();
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
    };
  }, [isOpen, instance?.id]);

  // Auto-scroll para a última mensagem quando novos logs chegam
  useEffect(() => {
    if (autoScroll && !isPaused) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, isPaused]);

  // Filtra logs por severidade e termo de busca
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Filtro de severidade
      if (filterLevel === 'error' && log.level !== 'error') return false;
      if (filterLevel === 'warn' && log.level !== 'warn' && log.level !== 'error') return false;
      if (filterLevel === 'info' && log.level !== 'info' && log.level !== 'log') return false;

      // Filtro de busca textual
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesMsg = log.message.toLowerCase().includes(query);
        const matchesTime = log.timestamp.toLowerCase().includes(query);
        const matchesLevel = log.level.toLowerCase().includes(query);
        if (!matchesMsg && !matchesTime && !matchesLevel) return false;
      }

      return true;
    });
  }, [logs, filterLevel, searchTerm]);

  // Contagem por nível
  const counts = useMemo(() => {
    let errorCount = 0;
    let warnCount = 0;
    let infoCount = 0;

    logs.forEach((l) => {
      if (l.level === 'error') errorCount++;
      else if (l.level === 'warn') warnCount++;
      else infoCount++;
    });

    return { total: logs.length, error: errorCount, warn: warnCount, info: infoCount };
  }, [logs]);

  // Copiar logs para a área de transferência
  const handleCopyLogs = (mode: 'all' | 'errors') => {
    const listToCopy = mode === 'errors' ? logs.filter((l) => l.level === 'error' || l.level === 'warn') : filteredLogs;
    if (listToCopy.length === 0) {
      alert(`Nenhum log ${mode === 'errors' ? 'de erro/aviso' : ''} disponível para cópia.`);
      return;
    }

    const formatted = listToCopy
      .map((l) => `[${new Date(l.timestamp).toLocaleTimeString('pt-BR')}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');

    navigator.clipboard.writeText(formatted);
    setCopiedType(mode);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleCopyId = () => {
    if (!instance) return;
    navigator.clipboard.writeText(instance.id);
    setCopiedType('id');
    setTimeout(() => setCopiedType(null), 2000);
  };

  if (!isOpen || !instance) return null;

  const isConn = instance.status === 'connected' || instance.status === 'connected_local';
  const isReconnecting = instance.status === 'reconnecting' || instance.status === 'connecting';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[92vh] max-h-[900px] bg-slate-900/95 border border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden relative z-10">
        
        {/* =========================================================================
            CABEÇALHO DA INSTÂNCIA (SaaS Premium Dark Glassmorphism)
            ========================================================================= */}
        <div className="p-4 sm:p-5 border-b border-slate-800/90 bg-slate-950/60 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            
            {/* Título & Identificação */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-inner shrink-0">
                <Terminal className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                    {instance.display_name}
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 border ${
                      isConn
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : isReconnecting
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isConn ? 'bg-emerald-400' : isReconnecting ? 'bg-amber-400' : 'bg-rose-400'}`} />
                    {instance.status.toUpperCase()}
                  </span>

                  {isConnected ? (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
                      <Radio className="w-3 h-3 animate-pulse" />
                      Live Stream
                    </span>
                  ) : (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
                      Buffer DB
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap font-mono">
                  {instance.phone_number && (
                    <span className="text-slate-300 font-semibold">
                      +{instance.phone_number}
                    </span>
                  )}
                  <button
                    onClick={handleCopyId}
                    className="hover:text-emerald-400 flex items-center gap-1 text-slate-400 hover:underline transition"
                    title="Copiar ID da Instância"
                  >
                    <span>ID: {instance.id.slice(0, 8)}...{instance.id.slice(-4)}</span>
                    {copiedType === 'id' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>

                  {instance.assigned_node_id && (
                    <span className="text-slate-500 flex items-center gap-1">
                      <Server className="w-3 h-3 text-slate-400" />
                      {instance.assigned_node_id}
                    </span>
                  )}

                  {instance.egress_ip && (
                    <span className="text-slate-500 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-slate-400" />
                      {instance.egress_ip} ({instance.egress_city || 'BR'})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Ações Rápidas & Fechar */}
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={loadInitialLogs}
                disabled={isLoading}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 text-xs flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                title="Recarregar histórico"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
                <span className="hidden md:inline">Recarregar</span>
              </button>

              <button
                onClick={onClose}
                className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition active:scale-95"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* =========================================================================
            BARRA DE FERRAMENTAS & FILTROS AVANÇADOS
            ========================================================================= */}
        <div className="p-3 sm:px-5 border-b border-slate-800 bg-slate-950/40 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Abas de Severidade */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800/90 overflow-x-auto shrink-0">
            <button
              onClick={() => setFilterLevel('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filterLevel === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Todos</span>
              <span className="text-[10px] bg-slate-700 px-1.5 py-0.2 rounded-full font-mono">
                {counts.total}
              </span>
            </button>

            <button
              onClick={() => setFilterLevel('error')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filterLevel === 'error'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                  : 'text-rose-400 hover:bg-rose-500/10'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Erros</span>
              {counts.error > 0 && (
                <span className="text-[10px] bg-rose-500 text-white px-1.5 py-0.2 rounded-full font-mono font-black">
                  {counts.error}
                </span>
              )}
            </button>

            <button
              onClick={() => setFilterLevel('warn')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filterLevel === 'warn'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-amber-400 hover:bg-amber-500/10'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Avisos</span>
              {counts.warn > 0 && (
                <span className="text-[10px] bg-amber-500/30 text-amber-300 px-1.5 py-0.2 rounded-full font-mono">
                  {counts.warn}
                </span>
              )}
            </button>

            <button
              onClick={() => setFilterLevel('info')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                filterLevel === 'info'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-cyan-400 hover:bg-cyan-500/10'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>Info</span>
            </button>
          </div>

          {/* Campo de Busca & Controles de Transmissão */}
          <div className="flex items-center gap-2 flex-1 md:justify-end">
            
            {/* Input de Busca Instantânea */}
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar no log exclusivo..."
                className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition font-mono"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Pausar / Continuar Stream */}
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`p-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1 active:scale-95 shrink-0 ${
                isPaused
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title={isPaused ? 'Continuar transmissão em tempo real' : 'Pausar transmissão para análise'}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span className="hidden xl:inline">{isPaused ? 'Retomar' : 'Pausar'}</span>
            </button>

            {/* Alternar Auto-Scroll */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1 active:scale-95 shrink-0 ${
                autoScroll
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title={autoScroll ? 'Rolagem automática ativa' : 'Rolagem automática desativada'}
            >
              <ArrowDown className={`w-3.5 h-3.5 ${autoScroll ? 'text-emerald-400' : 'text-slate-500'}`} />
            </button>

            {/* Botão Copiar Logs */}
            <button
              onClick={() => handleCopyLogs('all')}
              className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition active:scale-95 shrink-0"
              title="Copiar todos os logs filtrados"
            >
              {copiedType === 'all' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Copiar</span>
            </button>

            {/* Limpar Visualização */}
            <button
              onClick={() => setLogs([])}
              className="p-2 bg-slate-800/80 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 rounded-xl transition active:scale-95 shrink-0"
              title="Limpar terminal localmente"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            CORPO DO TERMINAL (Logs Exclusivos)
            ========================================================================= */}
        <div className="flex-1 bg-slate-950 p-3 sm:p-4 overflow-y-auto font-mono text-xs text-slate-300 space-y-1.5 select-text custom-scrollbar">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 opacity-60">
              <Terminal className="w-12 h-12 text-slate-600" />
              <div>
                <p className="text-sm font-semibold text-slate-300">Nenhum evento registrado para esta instância ainda</p>
                <p className="text-xs text-slate-500 max-w-md mt-1">
                  Os eventos, mensagens, handshakes Baileys e logs do servidor desta instância serão exibidos aqui automaticamente em tempo real.
                </p>
              </div>
            </div>
          ) : (
            filteredLogs.map((log, index) => {
              const timeStr = new Date(log.timestamp).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                fractionalSecondDigits: 3
              } as any);

              const isError = log.level === 'error';
              const isWarn = log.level === 'warn';
              const isInfo = log.level === 'info';

              return (
                <div
                  key={log.id || index}
                  className={`p-2 rounded-lg transition-colors border leading-relaxed break-all ${
                    isError
                      ? 'bg-rose-950/20 border-rose-900/40 text-rose-200'
                      : isWarn
                      ? 'bg-amber-950/20 border-amber-900/40 text-amber-200'
                      : isInfo
                      ? 'bg-cyan-950/10 border-cyan-900/30 text-cyan-200'
                      : 'bg-slate-900/40 border-slate-800/40 text-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {/* Timestamp */}
                    <span className="text-slate-500 text-[11px] select-none shrink-0 font-mono">
                      {timeStr}
                    </span>

                    {/* Level Badge */}
                    <span
                      className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded shrink-0 select-none ${
                        isError
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : isWarn
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : isInfo
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {log.level}
                    </span>

                    {/* Origem (Server / DB / Monitoramento) */}
                    {log.source && log.source !== 'server' && (
                      <span className="text-[9px] font-bold text-slate-400 bg-slate-800 px-1 py-0.2 rounded shrink-0 select-none">
                        {log.source === 'database' ? 'DB_EVENT' : 'MONITOR'}
                      </span>
                    )}

                    {/* Conteúdo da Mensagem */}
                    <div className="flex-1 min-w-0">
                      <span className="whitespace-pre-wrap">{log.message}</span>

                      {/* Exibição Estruturada de Detalhes JSON */}
                      {log.details && (
                        <div className="mt-1.5 p-2 bg-slate-950/90 rounded border border-slate-800/80 text-[11px] text-slate-400 overflow-x-auto">
                          <pre>{JSON.stringify(log.details, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={logsEndRef} />
        </div>

        {/* =========================================================================
            RODAPÉ INFORMATIVO
            ========================================================================= */}
        <div className="p-3 px-5 border-t border-slate-800 bg-slate-950/80 shrink-0 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <span className="text-slate-300 font-medium">
                {isConnected ? 'Stream Conectado' : 'Modo Estático / Histórico'}
              </span>
            </span>

            <span className="hidden sm:inline text-slate-500">|</span>

            <span className="hidden sm:inline text-slate-400">
              Exibindo <strong className="text-white">{filteredLogs.length}</strong> de <strong className="text-slate-300">{logs.length}</strong> eventos
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopyLogs('errors')}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold hover:underline flex items-center gap-1 transition"
              title="Copiar apenas os logs de erro para diagnóstico de IA"
            >
              <AlertCircle className="w-3 h-3" />
              <span>{copiedType === 'errors' ? 'Erros Copiados!' : 'Copiar Erros'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
