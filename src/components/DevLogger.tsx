import { useEffect, useRef, useState } from 'react';
import { useDevStore } from '../store/devStore';
import { Terminal, AlertTriangle, Bug, Info, CheckCircle2, ChevronDown, ChevronUp, Trash2, Copy, Activity, Layers, Calendar, Rocket, Database, Smartphone, AppWindow, ExternalLink, Network, Cpu } from 'lucide-react';
import { supabase } from '../services/supabase';
import { ServerLogsTerminal } from './ServerLogsTerminal';

export default function DevLogger() {
  const { logs, isVisible, isEnabled, toggleVisibility, addLog, clearLogs } = useDevStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  
  const [engineStatus, setEngineStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [serverMeta, setServerMeta] = useState<any>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showServerLogs, setShowServerLogs] = useState(false);
  const [showEndpoints, setShowEndpoints] = useState(false);
  const [telemetry, setTelemetry] = useState<{ cpu: number, memory: number, uptime: number } | null>(null);
  
  const engineUrl = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

  const checkEngineStatus = async () => {
    try {
      setEngineStatus('checking');
      const url = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
      const response = await fetch(`${url}/debug/healthz`);
      if (response.ok) {
        const data = await response.json();
        setServerMeta(data);
        setEngineStatus('online');
        setLastPing(new Date());
        return data;
      } else {
        setEngineStatus('offline');
        return null;
      }
    } catch {
      setEngineStatus('offline');
      return null;
    }
  };

  useEffect(() => {
    // Ping Status Heartbeat
    checkEngineStatus();
    const interval = setInterval(checkEngineStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Hook globally to capture fetch API errors and console.error
  useEffect(() => {

    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    console.error = (...args: any[]) => {
      // Evitar spam do vite-plugin-react
      if (typeof args[0] === 'string' && args[0].includes('vite-plugin-react')) return;

      const serializedArgs = args.map(arg => {
        if (arg instanceof Error) {
          return { name: arg.name, message: arg.message, stack: arg.stack };
        }
        return arg;
      });

      addLog({
        type: 'error',
        message: args[0]?.message || (typeof args[0] === 'string' ? args[0] : 'Erro App Frontend (React/Code)'),
        source: 'Console (Frontend)',
        details: serializedArgs
      });
      originalConsoleError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      // Evitar spam de warning de input controlado do react
      if (typeof args[0] === 'string' && args[0].includes('A component is changing an uncontrolled input')) return;
      
      addLog({
        type: 'warn',
        message: args[0]?.message || (typeof args[0] === 'string' ? args[0] : 'Alerta Frontend (React/Code)'),
        source: 'Console (Frontend)',
        details: args
      });
      originalConsoleWarn.apply(console, args);
    };

    // Override fetch to check engine/network issues
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        
        // Excluir rotas que tem ping constante ou info normal (Telemetry e WS)
        const urlObj = (args[0] as any)?.url || args[0];
        const url = typeof urlObj === 'string' ? urlObj : '';
        const method = (args[1] as RequestInit)?.method || 'GET';
        
        if (url) {
          if (!response.ok && !url.includes('/debug/healthz') && !url.includes('/debug/metrics') && !url.includes('/realtime/')) {
             let detailsStr = '';
             try {
               detailsStr = await response.clone().text();
             } catch {
               detailsStr = 'no body';
             }
             
             let sourcePrefix = 'Fetch (External)';
             if (url.includes('supabase.co')) sourcePrefix = 'Fetch (Supabase REST)';
             else if (url.includes('whatsapp.net')) sourcePrefix = 'Fetch (WhatsApp Media)';
             else if (url.includes(import.meta.env.VITE_WHATSAPP_ENGINE_URL || 'localhost:9000')) sourcePrefix = 'Fetch (Node Server)';

             addLog({
               type: 'error',
               message: `HTTP Error ${response.status} em ${method}`,
               source: sourcePrefix,
               details: { url, payload: (args[1] as RequestInit)?.body, response: detailsStr }
             });
          }
        }
        return response;
      } catch (err: any) {
        const urlObj = (args[0] as any)?.url || args[0];
        const method = (args[1] as RequestInit)?.method || 'GET';
        const urlStr = typeof urlObj === 'string' ? urlObj : 'unknown';
        
        addLog({
          type: 'error',
          message: err.message || 'Network Fetch Failed',
          source: `Fetch Critical (${method})`,
          details: {
            name: err.name,
            message: err.message,
            url: urlStr,
            payload: (args[1] as RequestInit)?.body
          }
        });
        throw err;
      }
    };

    return () => {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      window.fetch = originalFetch;
    };
  }, [addLog]);

  useEffect(() => {
    if (isVisible && isEnabled && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isVisible, isEnabled]);

  useEffect(() => {
    if (!isVisible || !isEnabled) return;
    
    const fetchTelemetry = async () => {
      try {
        const response = await fetch(`${engineUrl}/debug/metrics`);
        if (response.ok) {
           const data = await response.json();
           if (data.status === 'ok') {
              setTelemetry({
                 cpu: data.cpuPercent,
                 memory: data.memoryMB,
                 uptime: data.uptime
              });
           }
        }
      } catch (err) {
         // ignora silenciosamente
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 5000);
    return () => clearInterval(interval);
  }, [isVisible, isEnabled, engineUrl]);

  const copyLogs = () => {
    const textStr = logs.map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.type.toUpperCase()}] ${l.source}: ${l.message}\n${l.details ? JSON.stringify(l.details) : ''}`).join('\n\n');
    navigator.clipboard.writeText(textStr || 'Nenhum log para copiar.');
  };

  const handleTestEngine = async () => {
    addLog({ type: 'info', message: `Testando conexão manual com o Motor Baileys...\n🔗 URL alvo: ${engineUrl}`, source: 'Tester' });
    const metaData = await checkEngineStatus();
    if (metaData) {
       addLog({ type: 'success', message: `Verificação do Engine Concluída com Sucesso!\n🔗 URL: ${engineUrl}\n📦 Versão: ${metaData.engineVersion || 'Desconhecida'}\n🚀 Compilado em: ${metaData.compileDate ? new Date(metaData.compileDate).toLocaleString('pt-BR') : 'Desconhecida'}`, source: 'Tester' });
    } else {
       addLog({ type: 'error', message: `FALHA DE COMUNICAÇÃO: O Motor Baileys parece estar OFF-LINE.\n🔗 URL: ${engineUrl}`, source: 'Tester' });
    }
  };

  const handleTestSupabase = async () => {
    const sbUrl = import.meta.env.VITE_SUPABASE_URL || 'URL não encontrada';
    addLog({ type: 'info', message: `Testando conexão com Supabase...\n🔗 URL alvo: ${sbUrl}`, source: 'Tester' });
    try {
        const { error } = await supabase.from('contacts').select('id').limit(1);
        if (error) throw error;
        addLog({ type: 'success', message: `Conexão Supabase OK!\n🔗 URL: ${sbUrl}`, source: 'Tester' });
    } catch(err: any) {
        addLog({ type: 'error', message: `Erro Supabase: ${err.message}\n🔗 URL: ${sbUrl}`, source: 'Tester' });
    }
  };

  const handleTestApp = () => {
    addLog({ type: 'info', message: `Diagnóstico do React App...\n🔗 Host local ativo: ${window.location.origin}`, source: 'Tester' });
    addLog({ type: 'success', message: `App React em Execução. Hooks ativos.\nHost: ${window.location.origin}`, source: 'Tester' });
  };

  if (!isEnabled) {
    return null;
  }

  return (
    <>
      {/* Floating Indicator when closed */}
      {!isVisible && (
        <button 
           onClick={(e) => { e.stopPropagation(); toggleVisibility(); }}
           className={`fixed top-4 right-4 z-[9999] text-white p-3 rounded-full shadow-xl transition-all ${engineStatus === 'online' ? 'bg-emerald-600 hover:bg-emerald-500 hover:shadow-emerald-500/20' : 'bg-red-600 hover:bg-red-500 animate-pulse hover:shadow-red-500/20'} cursor-pointer`}
           title="Abrir DevLogger"
        >
          <Terminal size={20} />
          {logs.filter(l => l.type === 'error').length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-800 w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shadow-sm border border-red-400 animate-bounce">
              {logs.filter(l => l.type === 'error').length}
            </span>
          )}
        </button>
      )}

      <div className={`fixed z-[9999] right-4 sm:right-8 transition-all duration-300 ease-in-out ${isVisible ? 'top-4' : '-top-[650px]'}`}>
        <div className="bg-[#0b141a]/95 backdrop-blur-2xl border border-gray-700/50 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] w-[90vw] sm:w-[580px] flex flex-col max-h-[85vh]">
          {/* Header */}
        <div 
          className="flex items-center justify-between p-3 border-b border-gray-700/50 cursor-pointer bg-black/20 rounded-t-2xl hover:bg-black/30 transition-colors"
          onClick={toggleVisibility}
        >
          <div className="flex items-center gap-3">
            <Terminal size={16} className="text-emerald-500" />
            <h3 className="text-sm font-bold text-gray-200 tracking-tight">Antigravity Dev Logger</h3>
            
            {/* Status Chip */}
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${engineStatus === 'online' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : engineStatus === 'checking' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <Activity size={10} className={engineStatus === 'online' ? 'animate-pulse' : ''} />
              {engineStatus.toUpperCase()} {lastPing ? `(${lastPing.toLocaleTimeString()})` : ''}
            </div>

            {logs.filter(l => l.type === 'error').length > 0 && (
              <span className="flex items-center gap-1 bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
                <Bug size={10} /> {logs.filter(l => l.type === 'error').length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
             <button onClick={(e) => { e.stopPropagation(); setShowServerLogs(!showServerLogs); }} className="text-gray-400 hover:text-green-400 transition-colors bg-gray-800/50 p-1.5 rounded-md flex items-center justify-center" title="Abrir Server Terminal SSE">
                <Terminal size={14} />
             </button>
             <button onClick={(e) => { e.stopPropagation(); handleTestSupabase(); }} className="text-gray-400 hover:text-purple-400 transition-colors bg-gray-800/50 p-1.5 rounded-md flex items-center justify-center" title="Testar Supabase (DB)">
                <Database size={14} />
             </button>
             <button onClick={(e) => { e.stopPropagation(); handleTestApp(); }} className="text-gray-400 hover:text-cyan-400 transition-colors bg-gray-800/50 p-1.5 rounded-md flex items-center justify-center" title="Testar App React">
                <AppWindow size={14} />
             </button>
             <button onClick={(e) => { e.stopPropagation(); handleTestEngine(); }} className="text-gray-400 hover:text-blue-400 transition-colors bg-gray-800/50 p-1.5 rounded-md flex items-center justify-center" title="Testar Baileys (Nuvem)">
                <Smartphone size={14} />
             </button>
             <div className="w-px h-4 bg-gray-700/50 mx-1"></div>
             <button onClick={(e) => { e.stopPropagation(); copyLogs(); }} className="text-gray-400 hover:text-emerald-400 transition-colors bg-gray-800/50 p-1.5 rounded-md flex items-center justify-center" title="Copiar Logs">
                <Copy size={14} />
             </button>
             <button onClick={(e) => { e.stopPropagation(); clearLogs(); }} className="text-gray-400 hover:text-red-400 transition-colors bg-gray-800/50 p-1.5 rounded-md flex items-center justify-center" title="Limpar Logs">
                <Trash2 size={14} />
             </button>
             <div className="w-px h-4 bg-gray-700/50 mx-1"></div>
             <a href={`${engineUrl}/swagger/teste.html`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 px-2 py-1 rounded text-[10px] font-bold transition-colors flex items-center gap-1" title="Abrir Documentação da API">
                API Docs
             </a>
             <button className="text-gray-400 hover:text-white transition-colors ml-1">
               {isVisible ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
             </button>
          </div>
        </div>

        {/* Server Metadata Ruler */}
        {isVisible && serverMeta && (
          <div className="bg-gray-900/50 border-b border-gray-700/30 p-2 px-3 flex flex-col gap-2 text-xs transition-all">
            <div className="flex items-center justify-between font-mono">
               <div className="flex items-center gap-3 opacity-80 flex-wrap">
                 <div className="flex items-center gap-1.5 text-blue-300 bg-blue-900/20 px-2 py-0.5 rounded-md border border-blue-500/20">
                    <Layers size={12} />
                    <span>Engine: {serverMeta?.engineVersion || 'Desconhecido'}</span>
                 </div>
                 <div className="flex items-center gap-1.5 text-orange-300 bg-orange-900/20 px-2 py-0.5 rounded-md border border-orange-500/20">
                    <Calendar size={12} />
                    <span>Compilação: {serverMeta?.compileDate ? new Date(serverMeta.compileDate).toLocaleString('pt-BR') : 'Indisponível'}</span>
                 </div>
                 {telemetry && (
                   <>
                     <div className="flex items-center gap-1.5 text-emerald-300 bg-emerald-900/20 px-2 py-0.5 rounded-md border border-emerald-500/20" title="Uso de CPU do Backend Node.js">
                        <Cpu size={12} className={telemetry.cpu > 50 ? 'animate-pulse text-red-400' : ''} />
                        <span>{telemetry.cpu.toFixed(1)}%</span>
                     </div>
                     <div className="flex items-center gap-1.5 text-cyan-300 bg-cyan-900/20 px-2 py-0.5 rounded-md border border-cyan-500/20" title="Uso de Memória RAM do Backend Node.js">
                        <Activity size={12} className="opacity-80" />
                        <span>{telemetry.memory.toFixed(1)} MB</span>
                     </div>
                   </>
                 )}
               </div>
               <button 
                 onClick={(e) => { e.stopPropagation(); setShowChangelog(!showChangelog); }}
                 className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-900/20 px-2 py-0.5 rounded-md border border-emerald-500/20"
               >
                 <Rocket size={12} /> Novidades <ChevronDown size={12} className={`transition-transform ${showChangelog ? 'rotate-180' : ''}`}/>
               </button>
            </div>
            {showChangelog && (serverMeta.changelog || serverMeta.history) && (
              <div className="mt-2 animate-in fade-in slide-in-from-top-2 relative overflow-hidden rounded-2xl bg-white/5 dark:bg-black/40 backdrop-blur-3xl border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.1)] transition-all duration-500">
                 {/* Efeito Glow Interno */}
                 <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl"></div>
                 
                 <div className="p-4 relative z-10">
                   <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg ring-2 ring-emerald-500/20">
                         <Rocket size={14} className="text-white animate-pulse" />
                      </div>
                      <div>
                        <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300 block text-sm">Novidades na v{serverMeta.engineVersion}</span>
                        <span className="text-[10px] text-gray-400">
                          Deploy de {serverMeta.history && serverMeta.history[0] ? new Date(serverMeta.history[0].compile_date).toLocaleString('pt-BR') : 'Hoje'}
                        </span>
                      </div>
                   </div>

                   <ul className="space-y-2 mt-2">
                      {serverMeta.changelog && serverMeta.changelog.map((logItem: string, idx: number) => (
                         <li key={idx} className="flex items-start gap-2 text-gray-300 text-[11px] leading-relaxed group">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 mt-1.5 group-hover:bg-emerald-400 group-hover:shadow-[0_0_8px_rgba(52,211,153,0.8)] transition-all flex-shrink-0"></span>
                            <span className="opacity-90 group-hover:opacity-100 transition-opacity">{logItem}</span>
                         </li>
                      ))}
                   </ul>

                   {serverMeta.history && serverMeta.history.length > 1 && (
                     <div className="mt-4 pt-3 border-t border-white/5 dark:border-white/10">
                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-2 block">Histórico de Versões</span>
                        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                          {serverMeta.history.slice(1, 5).map((h: any, i: number) => (
                            <div key={i} className="flex-shrink-0 bg-black/20 px-2 py-1.5 rounded-lg border border-gray-700/50 flex flex-col items-center justify-center min-w-[70px]">
                               <span className="text-emerald-400 font-mono text-[10px] font-bold">{h.version}</span>
                               <span className="text-gray-500 text-[8px]">{new Date(h.compile_date).toLocaleDateString()}</span>
                            </div>
                          ))}
                        </div>
                     </div>
                   )}
                 </div>
              </div>
            )}
            
            <div className="flex items-center justify-between font-mono mt-2 pt-2 border-t border-gray-700/30">
               <span className="opacity-80">Ferramentas Dev:</span>
               <button 
                 onClick={(e) => { e.stopPropagation(); setShowEndpoints(!showEndpoints); }}
                 className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors bg-blue-900/20 px-2 py-0.5 rounded-md border border-blue-500/20"
               >
                 <Network size={12} /> Root Endpoints <ChevronDown size={12} className={`transition-transform ${showEndpoints ? 'rotate-180' : ''}`}/>
               </button>
             </div>
             
             {showEndpoints && (
                <div className="bg-black/40 rounded-lg p-2 border border-blue-500/10 mt-1 animate-in fade-in slide-in-from-top-2">
                   <span className="font-bold text-blue-500 mb-2 block">Motor Baileys: Endpoints Globais:</span>
                   <div className="grid grid-cols-1 gap-2">
                     {(() => {
                        const myTenant = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || localStorage.getItem('tenantId') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
                        return [
                         { name: 'Root / App Status (GET)', path: '/' },
                         { name: 'Motor Health Check (GET)', path: '/debug/healthz' },
                         { name: 'Listar Todas Instâncias (GET)', path: '/instance' },
                         { name: 'Listar Conversas/Chats da Instância (GET)', path: `/instance/${myTenant}/chats` },
                         { name: 'Listar Contatos/Agenda da Instância (GET)', path: `/instance/${myTenant}/contacts` },
                       ];
                     })().map((ep, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-gray-800/50 p-1.5 rounded border border-gray-700/50">
                           <span className="text-gray-300 font-mono text-[10px] break-all max-w-[65%]">{ep.name} <br/><span className="opacity-50">{engineUrl}{ep.path}</span></span>
                           <a 
                              href={`${engineUrl}${ep.path}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-white bg-blue-500/20 px-2 py-1 rounded transition-colors flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                           >
                             <span className="text-[10px] whitespace-nowrap">Testar Req</span> <ExternalLink size={10} />
                           </a>
                        </div>
                     ))}
                   </div>
                </div>
             )}
          </div>
        )}


        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 font-mono text-xs custom-scrollbar min-h-[250px] max-h-[500px]">
          {logs.length === 0 ? (
            <div className="m-auto text-gray-500 flex flex-col items-center gap-2">
               <Info size={24} className="opacity-50" />
               <p>Nenhum log detectado</p>
            </div>
          ) : (
            logs.map((log) => (
              <div 
                key={log.id} 
                className={`p-2 rounded-xl border flex flex-col gap-1 transition-all
                  ${log.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-200' : ''}
                  ${log.type === 'warn' ? 'bg-orange-500/10 border-orange-500/20 text-orange-200' : ''}
                  ${log.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200' : ''}
                  ${log.type === 'info' ? 'bg-blue-500/10 border-blue-500/20 text-blue-200' : ''}
                  ${log.type === 'log' ? 'bg-gray-800/40 border-gray-700/50 text-gray-300' : ''}
                `}
              >
                <div className="flex justify-between items-start">
                   <div className="flex items-center gap-1.5 font-bold">
                     {log.type === 'error' && <AlertTriangle size={12} className="text-red-400" />}
                     {log.type === 'warn' && <AlertTriangle size={12} className="text-orange-400" />}
                     {log.type === 'success' && <CheckCircle2 size={12} className="text-emerald-400" />}
                     {log.type === 'info' && <Info size={12} className="text-blue-400" />}
                     {log.type === 'log' && <Terminal size={12} className="text-gray-400" />}
                     <span className="truncate max-w-[300px]">{log.source}</span>
                   </div>
                   <span className="text-[10px] opacity-50 flex-shrink-0">
                     {new Date(log.timestamp).toLocaleTimeString()}
                   </span>
                </div>
                <p className="break-all whitespace-pre-wrap mt-1 opacity-90 leading-relaxed font-semibold">
                  {log.message}
                </p>
                {log.details && (
                  <div className="mt-1 p-2 bg-black/30 rounded-md text-[10px] overflow-x-auto opacity-80 border border-black/20">
                    {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      </div>
      <ServerLogsTerminal isOpen={showServerLogs} onClose={() => setShowServerLogs(false)} />
    </>
  );
}
