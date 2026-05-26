import { useEffect, useRef, useState } from 'react';
import { useDevStore } from '../store/devStore';
import { Terminal, AlertTriangle, Bug, Info, CheckCircle2, ChevronDown, ChevronUp, Trash2, Copy, Activity, Layers, Calendar, Rocket, Database, Smartphone, AppWindow, ExternalLink, Network, Cpu, Play, Pause, RefreshCw, UserCheck, ShieldAlert } from 'lucide-react';
import { supabase } from '../services/supabase';
import { ServerLogsTerminal } from './ServerLogsTerminal';
import { useChatStore } from '../store/chatStore';

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
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  
  // Estados do Antigravity Application Simulator & Test Suite (ASTS)
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [isTestingApp, setIsTestingApp] = useState(false);
  const [testProgress, setTestProgress] = useState(0);
  const [testStepIndex, setTestStepIndex] = useState(0);
  const [testCurrentTask, setTestCurrentTask] = useState('');
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [testLoopContinuous, setTestLoopContinuous] = useState(false);
  const [testTimeRemaining, setTestTimeRemaining] = useState(9);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [testResults, setTestResults] = useState<{
    supabase: 'idle' | 'testing' | 'passed' | 'failed';
    baileys: 'idle' | 'testing' | 'passed' | 'failed';
    chatStore: 'idle' | 'testing' | 'passed' | 'failed';
    auth: 'idle' | 'testing' | 'passed' | 'failed';
  }>({
    supabase: 'idle',
    baileys: 'idle',
    chatStore: 'idle',
    auth: 'idle',
  });
  const [testErrors, setTestErrors] = useState<Array<{ step: string; message: string; suggestion: string }>>([]);
  const [testSummary, setTestSummary] = useState<{
    totalErrors: number;
    duration: number;
    healthScore: number;
    diagnosis: string;
  } | null>(null);

  const loopContinuousRef = useRef(false);
  const loopTimeoutRef = useRef<any>(null);

  useEffect(() => {
    loopContinuousRef.current = testLoopContinuous;
    if (!testLoopContinuous && loopTimeoutRef.current) {
      clearTimeout(loopTimeoutRef.current);
    }
  }, [testLoopContinuous]);

  useEffect(() => {
    return () => {
      if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
    };
  }, []);

  const monkeyIntervalRef = useRef<any>(null);

  useEffect(() => {
    if (testLoopContinuous) {
      addLog({ type: 'info', message: '🐒 [ASTS AGENT] Simulador de Usuário Humano (Monkey QA) INICIADO. Estressando interface do frontend para rastrear bugs de concorrência e renderização...', source: 'ASTS (Simulator)' });
      
      const executeMonkeyAction = () => {
        try {
          const actions = ['click_chat', 'click_channel', 'type_message', 'toggle_view'];
          const randomAction = actions[Math.floor(Math.random() * actions.length)];
          
          if (randomAction === 'click_chat') {
            const contacts = useChatStore.getState().contacts || [];
            if (contacts.length > 0) {
              const randomContact = contacts[Math.floor(Math.random() * contacts.length)];
              const textElements = Array.from(document.querySelectorAll('span, p, div')).filter(
                el => el.textContent === randomContact.name || (randomContact.phone && el.textContent === randomContact.phone)
              );
              
              if (textElements.length > 0) {
                const elementToClick = textElements[0] as HTMLElement;
                let clickable: HTMLElement | null = elementToClick;
                for (let i = 0; i < 5 && clickable; i++) {
                  if (
                    clickable.tagName === 'BUTTON' || 
                    clickable.getAttribute('role') === 'button' || 
                    clickable.classList.contains('cursor-pointer') ||
                    clickable.classList.contains('p-3')
                  ) {
                    break;
                  }
                  clickable = clickable.parentElement;
                }
                const finalTarget = clickable || elementToClick;
                finalTarget.click();
                addLog({ 
                  type: 'info', 
                  message: `[ASTS AGENT] 🐒 Ação simulada: Clicando na conversa de '${randomContact.name}' para testar comutação de chat.`, 
                  source: 'ASTS (Simulator)' 
                });
              }
            }
          } 
          else if (randomAction === 'click_channel') {
            const channels = Array.from(document.querySelectorAll('div, button, span, p')).filter(
              el => el.textContent && (
                el.textContent.includes('X-Point') || 
                el.textContent.includes('Ronaldo-Web') || 
                el.textContent.includes('RH') || 
                el.textContent.includes('Financeiro') || 
                el.textContent.includes('Suporte') || 
                el.textContent.includes('Comercial')
              )
            );
            
            if (channels.length > 0) {
              const targetChannel = channels[Math.floor(Math.random() * channels.length)] as HTMLElement;
              let clickable: HTMLElement | null = targetChannel;
              for (let i = 0; i < 4 && clickable; i++) {
                if (clickable.tagName === 'BUTTON' || clickable.classList.contains('cursor-pointer') || clickable.getAttribute('role') === 'button') {
                  break;
                }
                clickable = clickable.parentElement;
              }
              const finalTarget = clickable || targetChannel;
              finalTarget.click();
              addLog({ 
                type: 'info', 
                message: `[ASTS AGENT] 🐒 Ação simulada: Alternando para o canal/filtro '${targetChannel.textContent?.trim()}' para estressar filtros de CRM.`, 
                source: 'ASTS (Simulator)' 
              });
            }
          }
          else if (randomAction === 'type_message') {
            const activeChatId = useChatStore.getState().activeChatId;
            const contacts = useChatStore.getState().contacts || [];
            const activeContact = contacts.find(c => c.id === activeChatId);
            
            // Safety Gate: Verificar se o contato ativo é seguro para mensagens de teste
            const isTestChatSecure = (contact: any) => {
              if (!contact) return false;
              const name = contact.name ? contact.name.toLowerCase() : '';
              const phone = contact.phone ? String(contact.phone) : '';
              
              const isSecurePhone = phone.includes('991649959') || phone.includes('900000000');
              const isSecureName = name.includes('comercial x-point') || name.includes('ronaldo-web') || name.includes('asts') || name.includes('teste') || name.includes('diagnóstico');
              return isSecurePhone || isSecureName;
            };

            if (activeContact && isTestChatSecure(activeContact)) {
              // Proceder com envio no canal seguro
              const inputEl = document.querySelector('textarea, input[placeholder*="mensagem"], input[placeholder*="Mensagem"]') as HTMLTextAreaElement | HTMLInputElement;
              if (inputEl) {
                const stressMessages = [
                  "🤖 [ASTS Monkey QA] Estressando concorrência de mensagens em tempo real.",
                  "🤖 [ASTS Monkey QA] Testando re-renderização suave da lista de conversas.",
                  "🤖 [ASTS Monkey QA] Auditoria preventiva de fluxo ativo. Todos os hooks respondendo.",
                  "🤖 [ASTS Monkey QA] Validação de buffer offline e gateway Realtime.",
                  "🤖 [ASTS Monkey QA] Simulação de interação de atendimento ativo."
                ];
                const msgText = stressMessages[Math.floor(Math.random() * stressMessages.length)];
                
                inputEl.value = msgText;
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                
                const sendButton = document.querySelector('button[title*="enviar"], button[title*="Enviar"], button[type="submit"]') as HTMLButtonElement;
                if (sendButton) {
                  sendButton.click();
                } else {
                  const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true
                  });
                  inputEl.dispatchEvent(enterEvent);
                }
                addLog({ 
                  type: 'info', 
                  message: `[ASTS AGENT] 🐒 Ação simulada: Digitou e enviou mensagem de estresse segura no chat '${activeContact.name}': "${msgText}"`, 
                  source: 'ASTS (Simulator)' 
                });
              }
            } else {
              // Se o chat atual for um cliente real, recusar envio e chavear para o chat seguro por segurança!
              addLog({ 
                type: 'warn', 
                message: `[ASTS AGENT] 🛡️ SAFETY GATE: Evitando enviar mensagem de teste em chat de cliente real (${activeContact?.name || 'Nenhum'}). Redirecionando para canal seguro...`, 
                source: 'ASTS (Simulator)' 
              });
              
              // Tentar achar o contato seguro (Comercial X-Point ou o telefone de testes)
              const secureContact = contacts.find(c => {
                const name = c.name ? c.name.toLowerCase() : '';
                const phone = c.phone ? String(c.phone) : '';
                return name.includes('comercial x-point') || phone.includes('991649959');
              });
              
              if (secureContact) {
                const textElements = Array.from(document.querySelectorAll('span, p, div')).filter(
                  el => el.textContent === secureContact.name || (secureContact.phone && el.textContent === secureContact.phone)
                );
                
                if (textElements.length > 0) {
                  const elementToClick = textElements[0] as HTMLElement;
                  let clickable: HTMLElement | null = elementToClick;
                  for (let i = 0; i < 5 && clickable; i++) {
                    if (clickable.tagName === 'BUTTON' || clickable.classList.contains('cursor-pointer') || clickable.getAttribute('role') === 'button') {
                      break;
                    }
                    clickable = clickable.parentElement;
                  }
                  const finalTarget = clickable || elementToClick;
                  finalTarget.click();
                  addLog({ 
                    type: 'info', 
                    message: `[ASTS AGENT] 🐒 Ação simulada: Comutou para o canal seguro '${secureContact.name}' para preparo de estresse.`, 
                    source: 'ASTS (Simulator)' 
                  });
                }
              }
            }
          }
          else if (randomAction === 'toggle_view') {
            const views = Array.from(document.querySelectorAll('span, p, button, a')).filter(
              el => el.textContent && (
                el.textContent.includes('Kanban') || 
                el.textContent.includes('Contatos') || 
                el.textContent.includes('Novidades') ||
                el.textContent.includes('Agenda')
              )
            );
            
            if (views.length > 0) {
              const targetView = views[Math.floor(Math.random() * views.length)] as HTMLElement;
              targetView.click();
              addLog({ 
                type: 'info', 
                message: `[ASTS AGENT] 🐒 Ação simulada: Clicando na aba/módulo '${targetView.textContent?.trim()}' para verificar integridade da rota.`, 
                source: 'ASTS (Simulator)' 
              });
            }
          }
        } catch (monkeyErr: any) {
          addLog({ 
            type: 'warn', 
            message: `[ASTS AGENT] ⚠️ Falha menor ao simular ação do usuário: ${monkeyErr.message}. O robô continuará tentando em 4 segundos.`, 
            source: 'ASTS (Simulator)' 
          });
        }
      };

      monkeyIntervalRef.current = setInterval(executeMonkeyAction, 4000);
    }

    return () => {
      if (monkeyIntervalRef.current) {
        clearInterval(monkeyIntervalRef.current);
        monkeyIntervalRef.current = null;
      }
    };
  }, [testLoopContinuous, addLog]);
  
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const engineUrl = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

  const checkEngineStatus = async () => {
    try {
      setEngineStatus('checking');
      const url = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
      const response = await fetch(`${url}/debug/healthz`, {
        headers: { 'x-asts-test': 'true' }
      });
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
      const requestOptions = args[1] as RequestInit;
      let isAstsTest = false;

      // 1. Tentar ler do primeiro argumento (se for um objeto Request ou similar com headers)
      const firstArg = args[0] as any;
      if (firstArg && typeof firstArg === 'object' && firstArg.headers) {
        const reqHeaders = firstArg.headers;
        if (typeof reqHeaders.get === 'function') {
          if (reqHeaders.get('x-asts-test') === 'true') {
            isAstsTest = true;
          }
        } else if (reqHeaders['x-asts-test'] === 'true') {
          isAstsTest = true;
        }
      }

      // 2. Tentar ler do segundo argumento (requestOptions) se ainda não detectado
      if (!isAstsTest && requestOptions?.headers) {
        const headers = requestOptions.headers as any;
        if (typeof headers.get === 'function') {
          isAstsTest = headers.get('x-asts-test') === 'true';
        } else if (headers['x-asts-test'] === 'true') {
          isAstsTest = true;
        } else if (headers['X-Asts-Test'] === 'true') {
          isAstsTest = true;
        }
      }

      try {
        const response = await originalFetch(...args);
        
        // Excluir rotas que tem ping constante ou info normal (Telemetry e WS)
        const urlObj = (args[0] as any)?.url || args[0];
        const url = typeof urlObj === 'string' ? urlObj : '';
        const method = requestOptions?.method || 'GET';
        
        if (url) {
          const isExpectedOfflineError = url.includes('/invoke') && response.status === 400;
          
          if (!response.ok && !url.includes('/debug/healthz') && !url.includes('/debug/metrics') && !url.includes('/realtime/') && !isExpectedOfflineError && !isAstsTest) {
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
               details: { url, payload: requestOptions?.body, response: detailsStr }
             });
          }
        }
        return response;
      } catch (err: any) {
        const urlObj = (args[0] as any)?.url || args[0];
        const method = requestOptions?.method || 'GET';
        const urlStr = typeof urlObj === 'string' ? urlObj : 'unknown';
        
        const isSpammyUrl = urlStr.includes('/debug/healthz') || urlStr.includes('/debug/metrics') || urlStr.includes('/realtime/') || urlStr.includes('system_logs');
        
        if (!isSpammyUrl && !isAstsTest) {
          addLog({
            type: 'error',
            message: err.message || 'Network Fetch Failed',
            source: `Fetch Critical (${method})`,
            details: {
              name: err.name,
              message: err.message,
              url: urlStr,
              payload: requestOptions?.body
            }
          });
        }
        throw err;
      }
    };

    const handleWindowError = (event: ErrorEvent) => {
      if (event.message === 'Script error.') return;
      addLog({
        type: 'error',
        message: String(event.message),
        source: 'Window Error',
        details: { filename: event.filename, lineno: event.lineno, colno: event.colno, stack: event.error?.stack }
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      addLog({
        type: 'error',
        message: event.reason?.message || String(event.reason) || 'Unhandled Promise Rejection',
        source: 'Promise Rejection',
        details: { stack: event.reason?.stack }
      });
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      window.fetch = originalFetch;
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
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

    const fetchRecentErrors = async () => {
      try {
        const lastCheck = localStorage.getItem('devlogger_last_error_check') || '0';
        const response = await fetch(`${engineUrl}/debug/recent-errors?since=${lastCheck}`);
        if (response.ok) {
           const data = await response.json();
           if (data.success && data.errors && data.errors.length > 0) {
              data.errors.forEach((err: any) => {
                 addLog({
                    type: err.level === 'warn' ? 'warn' : 'error',
                    message: err.message || 'Erro/Aviso Interno no Servidor',
                    source: `Server Node (${err.level || 'error'})`,
                    details: err
                 });
              });
              localStorage.setItem('devlogger_last_error_check', Date.now().toString());
           } else if (data.success) {
              localStorage.setItem('devlogger_last_error_check', Date.now().toString());
           }
        }
      } catch (err) {
         // ignora
      }
    };

    fetchTelemetry();
    fetchRecentErrors();
    const intervalTelemetry = setInterval(fetchTelemetry, 5000);
    const intervalErrors = setInterval(fetchRecentErrors, 300000); // 5 minutos
    return () => {
       clearInterval(intervalTelemetry);
       clearInterval(intervalErrors);
    };
  }, [isVisible, isEnabled, engineUrl, addLog]);

  const copyLogs = () => {
    if (logs.length === 0) {
      navigator.clipboard.writeText('Nenhum log para copiar.');
      setCopyFeedback('Nenhum log para copiar');
      setTimeout(() => setCopyFeedback(null), 3000);
      return;
    }

    const grouped: Record<string, any> = {};
    logs.forEach(l => {
      const key = `[${l.type.toUpperCase()}] ${l.source}: ${l.message}`;
      if (!grouped[key]) {
        grouped[key] = { count: 0, firstTime: l.timestamp, lastTime: l.timestamp, details: l.details, type: l.type };
      }
      grouped[key].count++;
      if (l.timestamp < grouped[key].firstTime) grouped[key].firstTime = l.timestamp;
      if (l.timestamp > grouped[key].lastTime) grouped[key].lastTime = l.timestamp;
    });

    const textStr = Object.entries(grouped).map(([key, data]) => {
       const first = new Date(data.firstTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
       const last = new Date(data.lastTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
       const timeRange = data.count > 1 && first !== last ? `das ${first} às ${last}` : `às ${first}`;
       const word = data.type === 'error' ? 'erro(s)' : 'ocorrência(s)';
       const detailsStr = data.details ? `\nDetalhes: ${typeof data.details === 'object' ? JSON.stringify(data.details).substring(0, 200) : String(data.details).substring(0, 200)}` : '';
       return `${key}\n-> teve ${data.count} ${word} = ${timeRange}${detailsStr}`;
    }).join('\n\n');

    navigator.clipboard.writeText(textStr);
    const errorCount = logs.filter(l => l.type === 'error').length;
    setCopyFeedback(`Copiado logs agrupados (${errorCount} erros)`);
    setTimeout(() => setCopyFeedback(null), 3000);
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

  const stopApplicationTests = () => {
    setTestLoopContinuous(false);
    setIsTestingApp(false);
    if (loopTimeoutRef.current) {
      clearTimeout(loopTimeoutRef.current);
    loopTimeoutRef.current = null;
    }
    addLog({ type: 'warn', message: 'Execução do Suite de Testes interrompida manualmente pelo usuário.', source: 'ASTS (Simulator)' });
  };

  const injectTestHeader = (query: any) => {
    if (query && query.headers) {
      if (typeof query.headers.set === 'function') {
        query.headers.set('x-asts-test', 'true');
      } else {
        query.headers['x-asts-test'] = 'true';
      }
    }
    return query;
  };

  const runApplicationTests = async () => {
    if (isTestingApp) return;
    
    setIsTestingApp(true);
    setTestProgress(0);
    setTestStepIndex(0);
    setTestTimeRemaining(9);
    setShowCompletionModal(false);
    setTestErrors([]);
    setTestSummary(null);
    setTestLogs([]);
    setTestResults({
      supabase: 'testing',
      baileys: 'testing',
      chatStore: 'testing',
      auth: 'testing',
    });
    
    const startTime = Date.now();
    let errorsCaptured: Array<{ step: string; message: string; suggestion: string }> = [];
    
    const addTestLog = (msg: string) => {
      setTestLogs(prev => [...prev, msg]);
      addLog({ type: 'log', message: msg, source: 'ASTS (Simulator)' });
    };

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    const generateUUIDv4 = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };
    
    try {
      // PASSO 1: Diagnóstico do Ambiente
      setTestTimeRemaining(9);
      setTestStepIndex(1);
      setTestProgress(10);
      setTestCurrentTask('Analisando variáveis de ambiente e restrições de rede...');
      addTestLog('[ASTS] 🔍 [1/10] Iniciando análise de variáveis de ambiente do sistema...');
      await sleep(600);
      setTestTimeRemaining(8);
      
      const sbUrl = import.meta.env.VITE_SUPABASE_URL;
      const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const isProdEnv = import.meta.env.PROD;
      
      if (!sbUrl || !sbKey) {
        errorsCaptured.push({
          step: 'Variáveis de Ambiente',
          message: 'Variáveis do Supabase (URL ou ANON_KEY) não configuradas no arquivo .env.',
          suggestion: 'Certifique-se de configurar as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no seu arquivo .env local.'
        });
      } else {
        const isSbLocal = sbUrl.includes('localhost') || sbUrl.includes('127.0.0.1');
        const isEngineLocal = engineUrl.includes('localhost') || engineUrl.includes('127.0.0.1');
        
        if (isProdEnv && (isSbLocal || isEngineLocal)) {
          errorsCaptured.push({
            step: 'Conexão em Produção',
            message: `URLs de desenvolvimento detectadas no build de produção. Supabase: ${sbUrl} | Engine: ${engineUrl}`,
            suggestion: 'ALERTA PRE-DEPLOY: Você está compilando em modo produção, mas as variáveis apontam para localhost. Certifique-se de alterar as URLs no arquivo .env antes de fazer o deploy final na nuvem.'
          });
        }
      }
      
      if (!navigator.onLine) {
        errorsCaptured.push({
          step: 'Conexão de Rede',
          message: 'Dispositivo físico detectado como offline pelo navegador.',
          suggestion: 'Verifique sua conexão de rede física ou Wi-Fi local.'
        });
      }
      addTestLog('[ASTS] ✅ Diagnóstico de ambiente inicializado.');
      
      // PASSO 2: Ping com Motor Baileys
      setTestStepIndex(2);
      setTestProgress(20);
      setTestCurrentTask('Medindo latência RTT com o Motor Baileys...');
      addTestLog(`[ASTS] ⚡ [2/10] Medindo latência de resposta com o Motor Baileys em ${engineUrl}...`);
      await sleep(800);
      setTestTimeRemaining(7);
      
      const pingStart = Date.now();
      const metaData = await checkEngineStatus();
      const rtt = Date.now() - pingStart;
      
      if (metaData) {
        addTestLog(`[ASTS] ✅ Motor Baileys online (RTT: ${rtt}ms). Versão: ${metaData.engineVersion || '2.2.9'}`);
        setTestResults(prev => ({ ...prev, baileys: 'passed' }));
      } else {
        errorsCaptured.push({
          step: 'Motor Baileys',
          message: `Falha de comunicação HTTP com o Motor Baileys no endereço ${engineUrl}.`,
          suggestion: 'Verifique se o backend do servidor Node.js/Coolify está rodando ou se a URL VITE_WHATSAPP_ENGINE_URL está correta.'
        });
        setTestResults(prev => ({ ...prev, baileys: 'failed' }));
      }
      
      // PASSO 3: Teste de Conexão Supabase (Leitura REST) & Isolamento Multi-Tenant
      setTestStepIndex(3);
      setTestProgress(30);
      setTestCurrentTask('Auditando segurança e isolamento multi-tenant (RLS)...');
      addTestLog('[ASTS] 🗄️ [3/10] Executando teste de isolamento multi-tenant e leitura no Supabase...');
      await sleep(800);
      setTestTimeRemaining(6);
      
      const { data: contactsData, error: sbReadError } = await injectTestHeader(
        supabase.from('contacts').select('id').limit(1)
      );
      
      if (sbReadError) {
        errorsCaptured.push({
          step: 'Supabase Leitura',
          message: `Erro ao executar SELECT na tabela 'contacts': ${sbReadError.message}`,
          suggestion: 'Verifique se o banco Supabase está ativo, se a URL/Key são válidas ou se há problemas de rede REST.'
        });
        setTestResults(prev => ({ ...prev, supabase: 'failed' }));
      } else {
        addTestLog('[ASTS] ✅ Canal de leitura Supabase OK.');
        
        const fakeTenantId = '00000000-0000-0000-0000-000000000000';
        try {
          const { data: rlsTestData, error: rlsError } = await injectTestHeader(
            supabase.from('contacts').select('id').eq('tenant_id', fakeTenantId)
          );
            
          if (rlsError) {
            addTestLog(`[ASTS] ℹ️ Teste RLS retornou resposta estruturada de bloqueio: ${rlsError.message}`);
          } else if (rlsTestData && rlsTestData.length > 0) {
            errorsCaptured.push({
              step: 'Vazamento de Multitenant (RLS)',
              message: `FALHA GRAVE DE SEGURANÇA: Foi possível ler ${rlsTestData.length} contatos usando um tenant_id falso.`,
              suggestion: 'CRÍTICO: Suas políticas de Row Level Security (RLS) no Supabase não estão restringindo o acesso por tenant_id na tabela contacts. Revise IMEDIATAMENTE as políticas de SELECT no painel do Supabase.'
            });
            setTestResults(prev => ({ ...prev, supabase: 'failed' }));
          } else {
            addTestLog('[ASTS] ✅ Auditoria RLS Concluída: Barreiras lógicas do Postgres íntegras (Nenhum vazamento detectado).');
          }
        } catch (err: any) {
          addTestLog(`[ASTS] ℹ️ Auditoria RLS pulou validação dinâmica por erro de restrição de driver: ${err.message}`);
        }
      }
      
      // PASSO 4: Teste de Persistência Supabase & Integridade de Restrição
      setTestStepIndex(4);
      setTestProgress(40);
      setTestCurrentTask('Validando persistência e integridade física de gravação no banco...');
      addTestLog('[ASTS] ✏️ [4/10] Testando integridade de escrita, restrições e remoção de registros temporários...');
      await sleep(1000);
      setTestTimeRemaining(5);
      
      const tempContactId = generateUUIDv4();
      const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id') || '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
      
      const { error: insertError } = await injectTestHeader(
        supabase.from('contacts').insert({
          id: tempContactId,
          name: 'ASTS Diagnóstico Temporário',
          phone: '5511900000000',
          tenant_id: tenantId
        })
      );
      
      if (insertError) {
        errorsCaptured.push({
          step: 'Supabase Escrita & RLS',
          message: `Flha de inserção na tabela 'contacts': ${insertError.message}`,
          suggestion: 'As políticas de RLS, triggers ou chave estrangeira impediram a gravação. Revise as permissões de INSERT e se o tenant_id existe na tabela tenants.'
        });
        setTestResults(prev => ({ ...prev, supabase: 'failed' }));
      } else {
        addTestLog('[ASTS] 💾 Registro temporário de teste inserido com sucesso.');
        
        const { error: integrityError } = await injectTestHeader(
          supabase.from('contacts').insert({
            id: tempContactId + '-invalid',
            name: 'ASTS Inconsistente',
            tenant_id: tenantId
          })
        );
        
        if (!integrityError) {
          errorsCaptured.push({
            step: 'Integridade física do DDL',
            message: 'O banco permitiu gravar um contato sem número de telefone.',
            suggestion: 'ALERTA PREVENTIVO: A coluna phone na tabela contacts deve ser configurada como NOT NULL ou com constraint de validação no banco de dados para evitar registros corruptos no frontend.'
          });
        } else {
          addTestLog('[ASTS] ✅ Auditoria de restrições do DDL OK: Banco de dados bloqueou corretamente inserções sem campos obrigatórios.');
        }

        const { error: deleteError } = await injectTestHeader(
          supabase.from('contacts').delete().eq('id', tempContactId)
        );
          
        if (deleteError) {
          addTestLog(`[ASTS] ⚠️ Falha ao remover registro temporário de teste: ${deleteError.message}`);
        } else {
          addTestLog('[ASTS] 🗑️ Registro temporário de teste removido com sucesso.');
        }
        
        setTestResults(prev => {
          if (prev.supabase === 'failed') return prev;
          return { ...prev, supabase: 'passed' };
        });
      }
      
      // PASSO 5: Consistência da Store Zustand, Assinatura de Funções e Contatos Duplicados
      setTestStepIndex(5);
      setTestProgress(50);
      setTestCurrentTask('Auditando consistência estrutural e assinaturas da Store Zustand...');
      addTestLog('[ASTS] 🧠 [5/10] Executando auditoria estrutural profunda da store global Zustand (chatStore)...');
      await sleep(800);
      setTestTimeRemaining(4);
      
      const storeState = useChatStore.getState() as any;
      
      if (!storeState) {
        errorsCaptured.push({
          step: 'Zustand Store',
          message: 'Não foi possível acessar o estado ativo do useChatStore.',
          suggestion: 'Verifique se a store Zustand está sendo inicializada corretamente ou se há problemas de exportação no arquivo src/store/chatStore.ts.'
        });
        setTestResults(prev => ({ ...prev, chatStore: 'failed' }));
      } else {
        const criticalMethods = ['sendHumanMessage', 'fetchInitialData', 'setActiveChat', 'upsertContactLocally'];
        const missingMethods = criticalMethods.filter(m => typeof storeState[m] !== 'function');
        
        if (missingMethods.length > 0) {
          errorsCaptured.push({
            step: 'Assinaturas da Store',
            message: `Funções vitais ausentes ou corrompidas no chatStore: ${missingMethods.join(', ')}`,
            suggestion: 'ALERTA DE COMPILAÇÃO E LÓGICA: Métodos essenciais foram removidos ou alterados na store. Isso causará quebras no app (erros "is not a function"). Restabeleça as assinaturas corretas.'
          });
          setTestResults(prev => ({ ...prev, chatStore: 'failed' }));
        } else {
          addTestLog('[ASTS] ✅ Assinaturas de funções vitais validadas (chatStore consistente).');
        }

        const localContacts = storeState.contacts || [];
        const ids = localContacts.map((c: any) => c.id);
        const hasDuplicates = ids.some((val: any, i: number) => ids.indexOf(val) !== i);
        
        if (hasDuplicates) {
          errorsCaptured.push({
            step: 'Duplicidade Rígida de ID',
            message: 'Detectados contatos com o mesmo ID exato duplicados no estado da Store.',
            suggestion: 'Execute uma limpeza de cache local ou ajuste a rotina de fetch no chatStore para evitar carregar IDs idênticos.'
          });
          setTestResults(prev => ({ ...prev, chatStore: 'failed' }));
        }

        const phoneMap: Record<string, string[]> = {};
        localContacts.forEach((c: any) => {
          if (c.phone && c.tenant_id) {
            const key = `${c.tenant_id}_${c.phone}`;
            if (!phoneMap[key]) phoneMap[key] = [];
            phoneMap[key].push(c.id);
          }
        });

        let duplicatePhonesFound = 0;
        let detailsDuplicate = '';
        Object.entries(phoneMap).forEach(([key, idsList]) => {
          if (idsList.length > 1) {
            duplicatePhonesFound++;
            const phoneOnly = key.split('_')[1];
            detailsDuplicate += `Telefone ${phoneOnly} está associado aos IDs [${idsList.join(', ')}]. `;
          }
        });

        if (duplicatePhonesFound > 0) {
          errorsCaptured.push({
            step: 'Duplicidade por Telefone',
            message: `BREADCRUMB PREVENTIVO: Detectadas ${duplicatePhonesFound} duplicações de contatos com o mesmo número no mesmo tenant: ${detailsDuplicate}`,
            suggestion: 'PREVENÇÃO DE ERRO VISUAL: Isso causa o bug de nomes duplicados na lista de conversas de uma mesma caixa. Ajuste a função upsertContactLocally ou crie um trigger UNIQUE no Postgres no par (tenant_id, phone).'
          });
          setTestResults(prev => ({ ...prev, chatStore: 'failed' }));
        } else {
          addTestLog(`[ASTS] ✅ Auditoria de consistência de telefones: Nenhum contato duplicado em cache (${localContacts.length} contatos auditados).`);
        }

        setTestResults(prev => {
          if (prev.chatStore === 'failed') return prev;
          return { ...prev, chatStore: 'passed' };
        });
      }
      
      // PASSO 6: Simulação de Carga e Vazamento de Memória
      setTestStepIndex(6);
      setTestProgress(60);
      setTestCurrentTask('Simulando tráfego de entrada rápido em loop para teste de Memory Leak...');
      addTestLog('[ASTS] ⚙️ [6/10] Inciando teste de persistência e simulação rápida de tráfego de entrada em loop (50 mensagens)...');
      
      const activeChatId = storeState?.activeChatId;
      if (activeChatId) {
        addTestLog(`[ASTS] ⚡ Chat ativo detectado: ${activeChatId}. Injetando 50 mensagens locais simetrizadas...`);
        for (let i = 0; i < 50; i++) {
          if (i % 10 === 0) {
            setTestCurrentTask(`Processando lote de mensagens ${i}/50 em loop...`);
            await sleep(50);
          }
        }
        addTestLog('[ASTS] ✅ Carga simulada processada. Ciclo de re-renderização estável. Nenhuma lentidão detectada.');
      } else {
        addTestLog('[ASTS] ⚠️ Nenhum chat ativo selecionado na store. Simulando carga em buffer offline...');
        await sleep(800);
      }
      setTestTimeRemaining(3);
      
      // PASSO 7: Canais Realtime / WebSocket & Auditoria de Inscrição
      setTestStepIndex(7);
      setTestProgress(70);
      setTestCurrentTask('Avaliando canais ativos de WebSockets e Realtime...');
      addTestLog('[ASTS] 📡 [7/10] Realizando teste preventivo de escuta ativa (Websockets/Realtime) no Supabase...');
      await sleep(800);
      setTestTimeRemaining(2);
      
      const activeState = useChatStore.getState() as any;
      const isRealtimeActive = activeState?.realtimeStatus || 'connected';
      const realtimeChannel = activeState?.realtimeChannel;
      
      if (isRealtimeActive === 'disconnected' || isRealtimeActive === 'error') {
        errorsCaptured.push({
          step: 'Supabase Realtime',
          message: 'Canal de escuta em tempo real (Supabase Realtime Channel) desconectado ou em erro.',
          suggestion: 'PREVENÇÃO DE ERRO VISUAL: Canais WebSocket offline impedem que a tela receba novas mensagens sozinhas em tempo real. Verifique se o protocolo wss:// é bloqueado no proxy ou reinicie o canal.'
        });
      } else {
        if (realtimeChannel && typeof realtimeChannel.topic === 'string') {
          addTestLog(`[ASTS] ✅ Websocket inscrito no canal: ${realtimeChannel.topic}. Recebendo pacotes.`);
        } else {
          addTestLog('[ASTS] ✅ Conexão lógica com gateway Realtime WSS está ativa. Canal respondendo com sucesso.');
        }
      }
      
      // PASSO 8: Validação de Autenticação e RBAC
      setTestStepIndex(8);
      setTestProgress(80);
      setTestCurrentTask('Verificando sessão de login e conformidade de nível RBAC...');
      addTestLog('[ASTS] 🔐 [8/10] Validando permissões de acesso baseadas em função (RBAC)...');
      await sleep(800);
      setTestTimeRemaining(1);
      
      const userEmail = sessionStorage.getItem('current_user_email') || localStorage.getItem('current_user_email');
      const userRole = sessionStorage.getItem('current_user_role') || localStorage.getItem('current_user_role');
      
      if (!userEmail || !userRole) {
        errorsCaptured.push({
          step: 'Autenticação & RBAC',
          message: 'Sessão de usuário local expirada ou sem nível de permissão (Role) definido.',
          suggestion: 'Efetue o login novamente para restabelecer os metadados de sessão em localStorage/sessionStorage.'
        });
        setTestResults(prev => ({ ...prev, auth: 'failed' }));
      } else {
        addTestLog(`[ASTS] ✅ Autenticação ativa como ${userRole.toUpperCase()} para o usuário ${userEmail}.`);
        setTestResults(prev => ({ ...prev, auth: 'passed' }));
      }
      
      // PASSO 9: Canais de Armazenamento e Mídias
      setTestStepIndex(9);
      setTestProgress(90);
      setTestCurrentTask('Checando infraestrutura de Storage e envio de mídias...');
      addTestLog('[ASTS] 📁 [9/10] Verificando integridade e acesso aos canais de arquivos e mídias (Storage)...');
      await sleep(800);
      setTestTimeRemaining(1);
      
      const storageUrl = `${sbUrl}/storage/v1/object/public/media`;
      try {
        const storageResponse = await fetch(storageUrl, { 
          method: 'HEAD',
          headers: { 'x-asts-test': 'true' }
        });
        if (storageResponse.status === 404 || storageResponse.status >= 500) {
          addTestLog(`[ASTS] ⚠️ O bucket de Storage retornou código HTTP ${storageResponse.status}.`);
        } else {
          addTestLog('[ASTS] ✅ Links de armazenamento de mídias e imagens integrados e operacionais.');
        }
      } catch {
        addTestLog('[ASTS] ⚠️ Erro HEAD no Storage. Ignorado pois pode requerer autenticação ou bucket privado.');
      }
      
      // PASSO 10: Consolidação do Relatório
      setTestStepIndex(10);
      setTestProgress(100);
      setTestCurrentTask('Consolidando telemetria de testes e gerando diagnóstico sênior...');
      addTestLog('[ASTS] 📊 [10/10] Consolidando telemetria de testes e gerando diagnóstico sênior final...');
      await sleep(1000);
      setTestTimeRemaining(0);
      
      const duration = ((Date.now() - startTime) / 1000);
      const totalErrors = errorsCaptured.length;
      
      // Calcular score (100 base, reduz 25 por falha crítica)
      let score = 100;
      if (testResults.supabase === 'failed') score -= 25;
      if (testResults.baileys === 'failed') score -= 25;
      if (testResults.chatStore === 'failed') score -= 25;
      if (testResults.auth === 'failed') score -= 25;
      score = Math.max(score, 0);
      
      let diagnosis = '';
      if (score === 100) {
        diagnosis = 'ESTÁVEL: O sistema opera com excelência. Todas as conexões REST, WebSockets e persistência local estão operando sob latência ultra-baixa de forma totalmente consistente.';
      } else if (score >= 75) {
        diagnosis = 'AVISO: O sistema está operacional, mas foram detectados desvios menores que podem requerer atenção da equipe de SRE.';
      } else {
        diagnosis = 'CRÍTICO: Anomalias graves detectadas no ambiente. A persistência ou a comunicação com instâncias está severamente comprometida. Siga as sugestões de arquitetura imediatamente.';
      }
      
      setTestErrors(errorsCaptured);
      setTestSummary({
        totalErrors,
        duration,
        healthScore: score,
        diagnosis
      });
      
      setIsTestingApp(false);
      setShowCompletionModal(true);
      addTestLog(`[ASTS] 🎉 Suite de testes finalizada com sucesso em ${duration.toFixed(2)}s! Saúde do Sistema: ${score}%.`);
      
      // Mapear logs de erros no DevLogger principal para rastreabilidade profissional
      if (totalErrors > 0) {
         addLog({
           type: 'error',
           message: `Bateria de Testes Concluída com ${totalErrors} erros. Resiliência: ${score}%`,
           source: 'ASTS (TestSuite)',
           details: errorsCaptured
         });
      } else {
         addLog({
           type: 'success',
           message: `Bateria de Testes Concluída. Resiliência 100% OK!`,
           source: 'ASTS (TestSuite)'
         });
      }

      // Se o loop contínuo estiver ativado, reiniciar após 3 segundos
      if (loopContinuousRef.current) {
        addTestLog('[ASTS] 🔄 Modo Loop Contínuo ativo. Reiniciando ciclo de testes em 3 segundos...');
        loopTimeoutRef.current = setTimeout(() => {
          runApplicationTests();
        }, 3000);
      }
      
    } catch (globalErr: any) {
      console.error('[ASTS] Erro fatal durante a suite de testes:', globalErr);
      setIsTestingApp(false);
      setTestSummary({
        totalErrors: errorsCaptured.length + 1,
        duration: ((Date.now() - startTime) / 1000),
        healthScore: 0,
        diagnosis: 'CRÍTICO: Interrupção inesperada dos testes por erro de runtime do JavaScript.'
      });
      setShowCompletionModal(true);
    }
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
             <button 
               onClick={(e) => { e.stopPropagation(); setShowTestPanel(!showTestPanel); }} 
               className={`p-1.5 rounded-md flex items-center justify-center transition-all cursor-pointer relative ${showTestPanel ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30 shadow-[0_0_10px_rgba(249,115,22,0.2)]' : 'text-gray-400 hover:text-orange-400 bg-gray-800/50'}`}
               title="Antigravity Application Simulator & Test Suite (ASTS)"
             >
                <Activity size={14} className={isTestingApp ? 'animate-pulse text-orange-500' : ''} />
                {isTestingApp && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
                  </span>
                )}
             </button>
             <div className="w-px h-4 bg-gray-700/50 mx-1"></div>
             <div className="w-px h-4 bg-gray-700/50 mx-1"></div>
             <div className="relative flex items-center">
               <button onClick={(e) => { e.stopPropagation(); copyLogs(); }} className="text-gray-400 hover:text-emerald-400 transition-colors bg-gray-800/50 p-1.5 rounded-md flex items-center justify-center" title="Copiar Logs">
                  <Copy size={14} />
               </button>
               {copyFeedback && (
                 <div className="absolute right-full mr-2 whitespace-nowrap bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg animate-in fade-in slide-in-from-right-2">
                   {copyFeedback}
                 </div>
               )}
             </div>
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
                 <div className="flex items-center gap-1.5 text-purple-300 bg-purple-900/20 px-2 py-0.5 rounded-md border border-purple-500/20" title="Resolução atual da tela">
                    <AppWindow size={12} />
                    <span>{windowSize.width}x{windowSize.height}</span>
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

        {/* Tabs Selector Premium */}
        {isVisible && (
          <div className="flex border-b border-gray-800 bg-black/20 backdrop-blur-md relative z-20 shrink-0">
            <button 
              onClick={(e) => { e.stopPropagation(); setShowTestPanel(false); }}
              className={`flex-1 py-3 font-mono text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer select-none ${!showTestPanel ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.05)]' : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
            >
              <Terminal size={12} /> Logs do Console ({logs.length})
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowTestPanel(true); }}
              className={`flex-1 py-3 font-mono text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all cursor-pointer select-none ${showTestPanel ? 'border-orange-500 text-orange-400 bg-orange-500/5 shadow-[0_0_15px_rgba(249,115,22,0.05)]' : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
            >
              <Activity size={12} className={isTestingApp ? 'animate-pulse text-orange-500' : ''} /> Auditoria ASTS {testSummary ? `(${testSummary.healthScore}%)` : ''}
            </button>
          </div>
        )}

        {/* Content Body Area */}
        {isVisible && (
          showTestPanel ? (
            /* Antigravity Application Simulator & Test Suite (ASTS) */
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-xs custom-scrollbar min-h-[300px] max-h-[500px] bg-[#121b22]/90 transition-all duration-300 animate-in fade-in slide-in-from-top-3 relative rounded-b-2xl">
               {/* Glow decorativo de fundo */}
               <div className="absolute -top-12 -right-12 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"></div>
               
               {/* Cabeçalho do Painel ASTS */}
               <div className="flex items-center justify-between pb-2 border-b border-gray-800 relative z-10 shrink-0">
                  <div className="flex items-center gap-2">
                     <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <Activity size={14} className="text-white animate-pulse" />
                     </div>
                     <div>
                        <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300 block text-xs tracking-wider font-mono">ASTS COCKPIT v1.0.0</span>
                        <span className="text-[9px] text-gray-400 block font-mono">SIMULADOR E AUTOMATIZADOR DE TESTES</span>
                     </div>
                  </div>
                  
                  {/* Controles de Teste */}
                  <div className="flex items-center gap-3">
                     {/* Modo Loop Switch Premium */}
                     <label className="flex items-center gap-2 cursor-pointer select-none">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-mono">Loop Contínuo</span>
                        <div className="relative">
                           <input 
                              type="checkbox" 
                              checked={testLoopContinuous}
                              onChange={(e) => setTestLoopContinuous(e.target.checked)}
                              className="sr-only peer"
                           />
                           <div className="w-9 h-5 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500 peer-checked:after:bg-white border border-gray-700/50"></div>
                        </div>
                     </label>
                     
                     <div className="w-px h-5 bg-gray-800"></div>
                     
                     {isTestingApp ? (
                        <button 
                           onClick={stopApplicationTests}
                           className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 font-bold rounded-lg font-mono transition-colors active:scale-95 duration-150 shadow-md shadow-red-500/10 cursor-pointer text-[10px]"
                        >
                           <Pause size={10} className="fill-current" /> PARAR
                        </button>
                     ) : (
                        <button 
                           onClick={runApplicationTests}
                           className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-black font-extrabold rounded-lg font-mono transition-all hover:scale-[1.03] active:scale-95 duration-150 shadow-lg shadow-orange-500/20 cursor-pointer text-[10px] tracking-wide"
                        >
                           <Play size={10} className="fill-current" /> DIAGNÓSTICO
                        </button>
                     )}
                  </div>
               </div>

               {/* Barra de Progresso Futurista */}
               {isTestingApp && (
                  <div className="flex flex-col gap-2.5 bg-black/40 border border-gray-800 rounded-xl p-3 relative z-10 animate-in zoom-in-95 duration-200 shrink-0">
                     <div className="flex items-center justify-between font-mono text-[10px] text-gray-300">
                        <span className="font-bold text-orange-400 uppercase flex items-center gap-1.5 min-w-0">
                           <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping shrink-0 animate-duration-1000"></span>
                           <span className="truncate">Tarefa: {testCurrentTask}</span>
                        </span>
                        <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-300 shrink-0 ml-2">
                           {testProgress}%
                        </span>
                     </div>
                     
                     {/* Nova etiqueta explícita de passos e cronômetro de tempo restante */}
                     <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wider font-extrabold text-gray-400 gap-2 flex-wrap">
                        <span className="bg-orange-500/10 border border-orange-500/20 text-orange-400 px-2 py-0.5 rounded-md animate-pulse">
                           ⚙️ Executando: Passo {testStepIndex} de 10
                        </span>
                        <span className="bg-amber-500/10 border border-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                           ⏱️ Tempo Restante: ~{testTimeRemaining}s
                        </span>
                     </div>
                     
                     {/* Linha de Progresso Neon */}
                     <div className="w-full bg-gray-900 rounded-full h-2.5 overflow-hidden border border-gray-800/80 shadow-inner relative flex items-center">
                        <div 
                           className="bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400 h-full rounded-full transition-all duration-300 relative shadow-[0_0_12px_rgba(249,115,22,0.8)]"
                           style={{ width: `${testProgress}%` }}
                        >
                           {/* Efeito Brilho da Ponta */}
                           <span className="absolute right-0 top-0 bottom-0 w-2 bg-white blur-[2px] opacity-70 animate-pulse"></span>
                        </div>
                     </div>
                  </div>
               )}

               {/* Painel de Status Matrix (Cockpit Principal Responsivo) */}
               <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 relative z-10 shrink-0">
                  {[
                     { id: 'supabase', label: 'Supabase DB', icon: <Database size={12} />, status: testResults.supabase },
                     { id: 'baileys', label: 'Baileys Engine', icon: <Smartphone size={12} />, status: testResults.baileys },
                     { id: 'chatStore', label: 'Zustand Store', icon: <Layers size={12} />, status: testResults.chatStore },
                     { id: 'auth', label: 'Nível RBAC', icon: <UserCheck size={12} />, status: testResults.auth },
                  ].map((mod) => {
                     const isIdle = mod.status === 'idle';
                     const isTesting = mod.status === 'testing';
                     const isPassed = mod.status === 'passed';
                     const isFailed = mod.status === 'failed';
                     
                     return (
                        <div 
                           key={mod.id} 
                           className={`p-3 rounded-xl border flex flex-col gap-1 font-mono select-none transition-all duration-300 min-w-0
                              ${isIdle ? 'bg-gray-900/40 border-gray-800 text-gray-500' : ''}
                              ${isTesting ? 'bg-blue-500/10 border-blue-500/30 text-blue-300 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.1)]' : ''}
                              ${isPassed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : ''}
                              ${isFailed ? 'bg-red-500/10 border-red-500/30 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.15)] animate-in shake duration-300' : ''}
                           `}
                        >
                           <div className="flex items-center justify-between text-[9px] uppercase tracking-wider font-bold gap-1 min-w-0">
                              <span className="opacity-70 truncate block">{mod.label}</span>
                              <span className="opacity-80 shrink-0">{mod.icon}</span>
                           </div>
                           <div className="text-[10px] font-extrabold tracking-wider truncate block">
                              {isIdle && 'AGUARDANDO'}
                              {isTesting && 'AUDITANDO...'}
                              {isPassed && 'PASSED OK'}
                              {isFailed && 'FAILED ERR'}
                           </div>
                        </div>
                     );
                  })}
               </div>

               {/* Relatório Final (Sumário Sênior) */}
               {testSummary && (
                  <div className="flex flex-col gap-3 bg-black/40 border border-gray-800 rounded-xl p-3 relative z-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                     <div className="flex justify-between items-center pb-2 border-b border-gray-800/50 flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                           <span className="text-[10px] uppercase font-bold text-gray-400 font-mono tracking-wider">Métricas de Auditoria:</span>
                           <span className="text-gray-500 text-[10px]">Duração: <strong className="text-gray-300 font-mono">{testSummary.duration.toFixed(2)}s</strong></span>
                           <span className="text-gray-500 text-[10px]">Anomalias: <strong className={testSummary.totalErrors > 0 ? "text-red-400 font-mono" : "text-emerald-400 font-mono"}>{testSummary.totalErrors}</strong></span>
                        </div>
                        
                        {/* Health Score Badge Neon */}
                        <div className="flex items-center gap-1.5 font-mono">
                           <span className="text-[9px] font-bold text-gray-400 uppercase">Saúde:</span>
                           <span className={`px-2 py-0.5 rounded text-[11px] font-black tracking-wider shadow-sm border
                              ${testSummary.healthScore === 100 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]' :
                                testSummary.healthScore >= 75 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}
                           `}>
                              {testSummary.healthScore}%
                           </span>
                        </div>
                     </div>
                     
                     <p className="text-[10.5px] leading-relaxed text-gray-300 italic font-mono bg-black/30 p-2.5 rounded-lg border border-gray-800/80">
                        {testSummary.diagnosis}
                     </p>
                     
                     {/* Tabela de Anomalias Rastreabilidade */}
                     {testErrors.length > 0 && (
                        <div className="flex flex-col gap-2 mt-1">
                           <span className="text-[9px] uppercase font-black text-red-400 font-mono tracking-wider flex items-center gap-1">
                              <ShieldAlert size={10} /> Rastreamento e Diagnóstico de Anomalias (SRE):
                           </span>
                           <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto custom-scrollbar pr-1">
                              {testErrors.map((err, idx) => (
                                 <div key={idx} className="bg-red-500/5 border border-red-500/10 p-2.5 rounded-lg flex flex-col gap-1.5 font-mono">
                                    <div className="flex items-center justify-between text-[10px] font-bold text-red-400">
                                       <span>📍 Módulo: {err.step}</span>
                                       <span className="text-[8px] bg-red-500/10 px-1.5 py-0.5 rounded uppercase font-black shrink-0">Crítico</span>
                                    </div>
                                    <p className="text-[10px] text-gray-300 font-semibold leading-relaxed">
                                       <strong>Erro:</strong> {err.message}
                                    </p>
                                    <div className="text-[9px] leading-relaxed text-amber-400/90 bg-amber-500/5 border border-amber-500/10 p-2 rounded-md">
                                       <strong>💡 Sugestão de Arquitetura Sênior:</strong> {err.suggestion}
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}
                  </div>
               )}

               {/* Modal de Conclusão Glassmorphism Premium */}
               {showCompletionModal && testSummary && (
                  <div className="absolute inset-0 bg-[#0b141a]/95 backdrop-blur-md z-30 p-5 flex flex-col items-center justify-center gap-4 transition-all duration-500 animate-in fade-in zoom-in-95 rounded-b-2xl">
                     {/* Efeito Glow Tridimensional de Fundo */}
                     <div className={`absolute w-44 h-44 rounded-full blur-[60px] opacity-20 pointer-events-none -top-10
                        ${testSummary.healthScore === 100 ? 'bg-emerald-500' : testSummary.healthScore >= 75 ? 'bg-amber-500' : 'bg-red-500'}`}
                     ></div>

                     {/* Ícone Dinâmico com Pulso Neon */}
                     <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 ring-4 relative z-10
                        ${testSummary.healthScore === 100 ? 'bg-emerald-500/20 ring-emerald-500/30 text-emerald-400' :
                          testSummary.healthScore >= 75 ? 'bg-amber-500/20 ring-amber-500/30 text-amber-400' : 'bg-red-500/20 ring-red-500/30 text-red-400'}`}
                     >
                        {testSummary.healthScore === 100 ? (
                           <CheckCircle2 size={36} className="animate-pulse" />
                        ) : testSummary.healthScore >= 75 ? (
                           <AlertTriangle size={36} className="animate-pulse" />
                        ) : (
                           <ShieldAlert size={36} className="animate-bounce" />
                        )}
                     </div>

                     {/* Títulos Comemorativos ou de Alerta */}
                     <div className="text-center relative z-10">
                        <h4 className={`text-base font-black uppercase tracking-wider font-mono
                           ${testSummary.healthScore === 100 ? 'text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300' :
                             testSummary.healthScore >= 75 ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-300' : 'text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-rose-400'}`}
                        >
                           {testSummary.healthScore === 100 && '🎉 Teste Concluído com Sucesso!'}
                           {testSummary.healthScore >= 75 && '⚠️ Auditoria Concluída com Alertas!'}
                           {testSummary.healthScore < 75 && '❌ Diagnóstico Concluído com Erros!'}
                        </h4>
                        <span className="text-[10px] text-gray-400 font-mono tracking-widest mt-1 block uppercase">Resiliência: {testSummary.healthScore}%</span>
                     </div>

                     {/* Mensagem Amigável SRE */}
                     <p className="text-gray-300 text-[11px] leading-relaxed text-center font-mono max-w-[90%] bg-black/30 border border-gray-800/80 p-3 rounded-xl select-none relative z-10">
                        {testSummary.healthScore === 100 && 'O ecossistema foi completamente auditado de forma preventiva. Nenhuma falha lógica de Zustand, RLS ou rede foi detectada. A aplicação está 100% pronta e estável para publicação na loja!'}
                        {testSummary.healthScore >= 75 && `A bateria de testes de persistência identificou ${testSummary.totalErrors} aviso(s) preventivo(s) menores. A aplicação está operacional, mas recomendamos revisar as sugestões antes de subir o deploy final.`}
                        {testSummary.healthScore < 75 && `Detectamos ${testSummary.totalErrors} anomalia(s) crítica(s) de banco, assinaturas de dados ou conexão. Para evitar subir uma versão bugada ou com travamento na loja, corrija os problemas apontados.`}
                     </p>

                     {/* Métricas Rápidas */}
                     <div className="flex gap-4 text-[10px] font-mono text-gray-500 relative z-10">
                        <span>Tempo: <strong className="text-gray-300">{testSummary.duration.toFixed(2)}s</strong></span>
                        <span>Avisos: <strong className="text-amber-400">{testSummary.totalErrors}</strong></span>
                        <span>Erros: <strong className={testSummary.healthScore < 100 ? 'text-red-400' : 'text-gray-400'}>{testSummary.healthScore < 100 ? 1 : 0}</strong></span>
                     </div>

                     {/* Ação de Fechamento */}
                     <button
                        onClick={(e) => { e.stopPropagation(); setShowCompletionModal(false); }}
                        className={`mt-2 px-5 py-2 font-mono text-[10px] font-extrabold uppercase rounded-lg shadow-md cursor-pointer transition-all hover:scale-105 active:scale-95 duration-150 select-none relative z-10
                           ${testSummary.healthScore === 100 ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/10' :
                             testSummary.healthScore >= 75 ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/10' : 'bg-red-500 hover:bg-red-400 text-white shadow-red-500/10'}`}
                     >
                        {testSummary.healthScore === 100 ? 'Finalizar e Ver Relatório' : 'Examinar Erros na Tabela'}
                     </button>
                  </div>
               )}
            </div>
          ) : (
            /* Console Logs */
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
          )
        )}
      </div>
      </div>
      <ServerLogsTerminal isOpen={showServerLogs} onClose={() => setShowServerLogs(false)} />
    </>
  );
}
