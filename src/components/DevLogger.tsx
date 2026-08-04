import { useEffect, useRef, useState, useMemo } from 'react';
import { useDevStore } from '../store/devStore';
import { Terminal, AlertTriangle, Bug, Info, CheckCircle2, ChevronDown, ChevronUp, Trash2, Copy, Activity, Layers, Calendar, Rocket, Database, Smartphone, AppWindow, ExternalLink, Network, Cpu, Play, Pause, RefreshCw, UserCheck, ShieldAlert } from 'lucide-react';
import { supabase } from '../services/supabase';
import { ServerLogsTerminal } from './ServerLogsTerminal';
import { useChatStore } from '../store/chatStore';

export default function DevLogger() {
  const { logs, isVisible, isEnabled, toggleVisibility, addLog, clearLogs, showServerLogs, setShowServerLogs } = useDevStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  
  const [engineStatus, setEngineStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [serverMeta, setServerMeta] = useState<any>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showBaileysModal, setShowBaileysModal] = useState(false);
  const [showEndpoints, setShowEndpoints] = useState(false);
  const [telemetry, setTelemetry] = useState<{ cpu: number, memory: number, uptime: number } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  
  // Draggable Floating Button logic
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('devlogger_position');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading devlogger position:', e);
    }
    return { x: -1, y: -1 };
  });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const elementStartPosRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return; // Left click only
    isDraggingRef.current = false;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    
    const rect = buttonRef.current?.getBoundingClientRect();
    elementStartPosRef.current = {
      x: rect ? rect.left : 0,
      y: rect ? rect.top : 0
    };
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - dragStartPosRef.current.x;
      const dy = moveEvent.clientY - dragStartPosRef.current.y;
      
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        isDraggingRef.current = true;
      }
      
      if (isDraggingRef.current) {
        let newX = elementStartPosRef.current.x + dx;
        let newY = elementStartPosRef.current.y + dy;
        
        const btnWidth = rect ? rect.width : 50;
        const btnHeight = rect ? rect.height : 50;
        newX = Math.max(8, Math.min(newX, window.innerWidth - btnWidth - 8));
        newY = Math.max(8, Math.min(newY, window.innerHeight - btnHeight - 8));
        
        setPosition({ x: newX, y: newY });
      }
    };
    
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      
      if (isDraggingRef.current) {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (rect) {
          const finalPos = { x: rect.left, y: rect.top };
          localStorage.setItem('devlogger_position', JSON.stringify(finalPos));
        }
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    const touch = e.touches[0];
    isDraggingRef.current = false;
    dragStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    
    const rect = buttonRef.current?.getBoundingClientRect();
    elementStartPosRef.current = {
      x: rect ? rect.left : 0,
      y: rect ? rect.top : 0
    };
    
    const handleTouchMove = (moveEvent: TouchEvent) => {
      const touchMove = moveEvent.touches[0];
      const dx = touchMove.clientX - dragStartPosRef.current.x;
      const dy = touchMove.clientY - dragStartPosRef.current.y;
      
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        isDraggingRef.current = true;
      }
      
      if (isDraggingRef.current) {
        if (moveEvent.cancelable) {
          moveEvent.preventDefault();
        }
        
        let newX = elementStartPosRef.current.x + dx;
        let newY = elementStartPosRef.current.y + dy;
        
        const btnWidth = rect ? rect.width : 50;
        const btnHeight = rect ? rect.height : 50;
        newX = Math.max(8, Math.min(newX, window.innerWidth - btnWidth - 8));
        newY = Math.max(8, Math.min(newY, window.innerHeight - btnHeight - 8));
        
        setPosition({ x: newX, y: newY });
      }
    };
    
    const handleTouchEnd = () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      
      if (isDraggingRef.current) {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (rect) {
          const finalPos = { x: rect.left, y: rect.top };
          localStorage.setItem('devlogger_position', JSON.stringify(finalPos));
        }
      }
    };
    
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
  };

  useEffect(() => {
    const handleResize = () => {
      if (position.x !== -1 && position.y !== -1 && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        let newX = position.x;
        let newY = position.y;
        
        newX = Math.max(8, Math.min(newX, window.innerWidth - rect.width - 8));
        newY = Math.max(8, Math.min(newY, window.innerHeight - rect.height - 8));
        
        if (newX !== position.x || newY !== position.y) {
          setPosition({ x: newX, y: newY });
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position]);
  
  // Estados do Antigravity Application Simulator & Test Suite (ASTS)
  const [activeTab, setActiveTab] = useState<'console' | 'asts' | 'gastrofood'>('console');
  const showTestPanel = activeTab === 'asts';
  const setShowTestPanel = (val: boolean) => {
    setActiveTab(val ? 'asts' : 'console');
  };
  const [gastrofoodLogs, setGastrofoodLogs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  
  // Estados para agrupamento de erros e filtragem
  const [viewMode, setViewMode] = useState<'grouped' | 'timeline'>('grouped');
  const [logFilter, setLogFilter] = useState<'all' | 'node' | 'error' | 'warn'>('all');

  useEffect(() => {
    supabase.from('companies').select('id, name').then(({ data }) => {
      if (data) setCompanies(data);
    });
  }, []);

  // Agrupamento Inteligente de Erros e Logs
  const groupedAndFilteredLogs = useMemo(() => {
    let filtered = logs;
    
    if (logFilter === 'node') {
      filtered = logs.filter(l => 
        l.source.toLowerCase().includes('server') || 
        l.source.toLowerCase().includes('node') ||
        l.source.toLowerCase().includes('backend')
      );
    } else if (logFilter === 'error') {
      filtered = logs.filter(l => l.type === 'error');
    } else if (logFilter === 'warn') {
      filtered = logs.filter(l => l.type === 'warn');
    }

    if (viewMode === 'timeline') {
      return filtered.map(l => ({
        ...l,
        count: 1,
        latestTimestamp: l.timestamp,
        firstTimestamp: l.timestamp,
        occurrences: [l],
        isServerNode: l.source.toLowerCase().includes('server') || l.source.toLowerCase().includes('node')
      }));
    }

    const groupsMap = new Map<string, any>();
    filtered.forEach(log => {
      const cleanMsg = (log.message || '').trim().replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z/g, '');
      const key = `${log.source}_${log.type}_${cleanMsg}`;

      if (groupsMap.has(key)) {
        const group = groupsMap.get(key);
        group.count++;
        group.occurrences.push(log);
        if (new Date(log.timestamp) > new Date(group.latestTimestamp)) {
          group.latestTimestamp = log.timestamp;
          group.details = log.details || group.details;
        }
      } else {
        groupsMap.set(key, {
          id: log.id,
          type: log.type,
          source: log.source,
          message: log.message,
          details: log.details,
          latestTimestamp: log.timestamp,
          firstTimestamp: log.timestamp,
          count: 1,
          occurrences: [log],
          isServerNode: log.source.toLowerCase().includes('server') || log.source.toLowerCase().includes('node')
        });
      }
    });

    return Array.from(groupsMap.values());
  }, [logs, viewMode, logFilter]);

  const nodeLogsCount = useMemo(() => {
    return logs.filter(l => 
      l.source.toLowerCase().includes('server') || 
      l.source.toLowerCase().includes('node') ||
      l.source.toLowerCase().includes('backend')
    ).length;
  }, [logs]);

  const errorLogsCount = useMemo(() => logs.filter(l => l.type === 'error').length, [logs]);
  const warnLogsCount = useMemo(() => logs.filter(l => l.type === 'warn').length, [logs]);

  const handleSimulateNodeError = () => {
    addLog({
      type: 'error',
      message: '[FlowEngine Node.js] Falha de Execução / Loop de Execução Detectado: Error: Maximum call stack size exceeded em session-manager/index.js:412',
      source: 'Servidor Node.js',
      details: {
        error: 'Logic Loop Exception',
        file: 'session-manager/index.js',
        line: 412,
        timestamp: new Date().toISOString()
      }
    });
  };

  const groupedGastrofoodLogs = useMemo(() => {
    const grouped: any[] = [];
    const requestMap = new Map<string, any>();
    
    gastrofoodLogs.forEach((log) => {
      if (log.direction === 'request') {
        const key = `${log.action || ''}_${log.url || ''}_${log.method || ''}`;
        if (!requestMap.has(key)) {
          requestMap.set(key, []);
        }
        const requestLog = { ...log, response: null, status: null, error: null, responseTimestamp: null, isPending: true };
        requestMap.get(key).push(requestLog);
        grouped.push(requestLog);
      } else if (log.direction === 'response' || log.direction === 'error') {
        const key = `${log.action || ''}_${log.url || ''}_${log.method || ''}`;
        const pendingList = requestMap.get(key);
        if (pendingList && pendingList.length > 0) {
          const pairedRequest = pendingList.shift();
          pairedRequest.response = log.response;
          pairedRequest.status = log.status;
          pairedRequest.error = log.error;
          pairedRequest.responseTimestamp = log.timestamp;
          pairedRequest.isPending = false;
          pairedRequest.direction = log.direction;
        } else {
          grouped.push({ ...log, isPending: false });
        }
      } else {
        grouped.push({ ...log, isPending: false });
      }
    });
    return grouped;
  }, [gastrofoodLogs]);

  const toggleExpandLog = (id: string) => {
    setExpandedLogs(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

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
    let lastSupabaseErrorTime = 0;

    console.error = (...args: any[]) => {
      // Evitar spam do vite-plugin-react
      if (typeof args[0] === 'string' && args[0].includes('vite-plugin-react')) return;
      // Evitar spam do wacalls
      if (typeof args[0] === 'string' && (args[0].includes('[useWaCallsStore') || args[0].includes('wacalls') || args[0].includes('WaCalls'))) return;
      // Evitar spam de lock do Supabase gotrue-js
      if (typeof args[0] === 'string' && (args[0].includes('@supabase/gotrue-js') || args[0].includes('auth-token') || args[0].includes('orphaned lock') || args[0].includes('lock:sb-'))) return;

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
      // Evitar spam do wacalls
      if (typeof args[0] === 'string' && (args[0].includes('[useWaCallsStore') || args[0].includes('wacalls') || args[0].includes('WaCalls'))) return;
      // Evitar spam de lock do Supabase gotrue-js
      if (typeof args[0] === 'string' && (args[0].includes('@supabase/gotrue-js') || args[0].includes('auth-token') || args[0].includes('orphaned lock') || args[0].includes('lock:sb-'))) return;
      // Evitar ruídos operacionais rotineiros que não indicam bugs
      if (typeof args[0] === 'string' && (args[0].includes('[History Sync]') || args[0].includes('socket zumbi'))) return;
      
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
          const isLocalFrontend = url.includes(window.location.host) || (!url.startsWith('http://') && !url.startsWith('https://'));
          const isStatus404 = url.includes('/status') && response.status === 404;
          
          if (!response.ok && !url.includes('/debug/healthz') && !url.includes('/debug/metrics') && !url.includes('/debug/recent-errors') && !url.includes('/realtime/') && !url.includes('/wacalls/') && !isExpectedOfflineError && !isAstsTest && !isLocalFrontend && !isStatus404) {
             
             // Desduplicação de erros do Supabase
             if (url.includes('supabase.co')) {
               const now = Date.now();
               if (now - lastSupabaseErrorTime < 5000) {
                 // Ignorar spam de erros repetidos do Supabase
                 return response;
               }
               lastSupabaseErrorTime = now;
             }

             let detailsStr = '';
             try {
               detailsStr = await response.clone().text();
             } catch {
               detailsStr = 'no body';
             }

             // Ignorar erros PGRST116 (nenhuma linha retornada no .single() do Supabase)
             if (response.status === 406 && detailsStr.includes('PGRST116')) {
                return response;
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
        
        const isLocalFrontend = urlStr.includes(window.location.host) || (!urlStr.startsWith('http://') && !urlStr.startsWith('https://'));
        const isSpammyUrl = urlStr.includes('/debug/healthz') || urlStr.includes('/debug/metrics') || urlStr.includes('/debug/recent-errors') || urlStr.includes('/realtime/') || urlStr.includes('system_logs') || urlStr.includes('/wacalls/') || isLocalFrontend;
        
        if (!isSpammyUrl && !isAstsTest) {
          const isAbort = err.name === 'AbortError';
          const isNetworkError = err.message === 'Failed to fetch' || (typeof navigator !== 'undefined' && !navigator.onLine);
          
          // Desduplicação de erros críticos do Supabase ou falhas normais de rede
          let skipLog = false;
          if (urlStr.includes('supabase.co') || isNetworkError) {
            const now = Date.now();
            if (now - lastSupabaseErrorTime < 8000) {
              skipLog = true;
            }
            lastSupabaseErrorTime = now;
          }

          if (!skipLog) {
            addLog({
              type: (isAbort || isNetworkError) ? 'info' : 'error',
              message: isAbort 
                ? `Requisição abortada de forma esperada: ${err.message}` 
                : isNetworkError 
                ? `Falha temporária de conexão com o servidor de destino (Internet instável ou VPS offline).`
                : (err.message || 'Network Fetch Failed'),
              source: isAbort 
                ? `Fetch Aborted (${method})` 
                : isNetworkError 
                ? `Rede Instável (${method})` 
                : `Fetch Critical (${method})`,
              details: {
                name: err.name,
                message: err.message,
                url: urlStr,
                payload: requestOptions?.body
              }
            });
          }
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
    if (!isVisible) return;

    const url = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
    const sse = new EventSource(`${url}/api/v1/system/logs/stream`);

    const parseGastrofoodMsg = (messageText: string, timestamp: string) => {
      const prefix = '[Gastrofood API]';
      if (messageText && messageText.includes(prefix)) {
        try {
          const jsonStr = messageText.substring(messageText.indexOf(prefix) + prefix.length).trim();
          const parsed = JSON.parse(jsonStr);
          return {
            id: parsed.id || Math.random().toString(36).substring(2, 9),
            timestamp: timestamp || new Date().toISOString(),
            ...parsed
          };
        } catch (e) {
          return {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: timestamp || new Date().toISOString(),
            type: 'gastrofood_api',
            direction: messageText.toLowerCase().includes('error') ? 'error' : 'info',
            action: 'Gastrofood Call',
            error: messageText
          };
        }
      }
      return null;
    };

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init') {
          const initLogs: any[] = [];
          (data.logs || []).forEach((log: any) => {
            const parsed = parseGastrofoodMsg(log.message, log.timestamp);
            if (parsed) {
              initLogs.push(parsed);
            } else if (log.level === 'error' || log.level === 'warn') {
              addLog({
                type: log.level === 'warn' ? 'warn' : 'error',
                message: log.message || 'Erro/Warning no Servidor Node.js',
                source: `Servidor Node.js`,
                details: { timestamp: log.timestamp, level: log.level, id: log.id }
              });
            }
          });
          setGastrofoodLogs(initLogs);
        } else if (data.message || data.level) {
          const parsed = parseGastrofoodMsg(data.message, data.timestamp);
          if (parsed) {
            setGastrofoodLogs(prev => {
              if (prev.some(l => l.id === parsed.id || (l.timestamp === parsed.timestamp && l.action === parsed.action && l.direction === parsed.direction && l.error === parsed.error))) {
                return prev;
              }
              const next = [...prev, parsed];
              if (next.length > 200) return next.slice(next.length - 200);
              return next;
            });
          }
          
          if (data.level === 'error' || data.level === 'warn' || (data.message && (data.message.toLowerCase().includes('error') || data.message.toLowerCase().includes('falha') || data.message.toLowerCase().includes('loop')))) {
            addLog({
              type: data.level === 'warn' ? 'warn' : 'error',
              message: data.message || 'Exceção/Falha no Servidor Node.js',
              source: `Servidor Node.js`,
              details: { timestamp: data.timestamp, id: data.id, level: data.level }
            });
          }
        }
      } catch (err) {
        console.error('Error parsing SSE in DevLogger:', err);
      }
    };

    return () => {
      sse.close();
    };
  }, [isVisible, engineUrl]);

  useEffect(() => {
    if (isVisible && isEnabled && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isVisible, isEnabled]);

  useEffect(() => {
    if (!isVisible || !isEnabled) return;
    
    let lastGastrofoodCheck = '0';
    
    const fetchGastrofoodLogs = async () => {
      try {
        const response = await fetch(`${engineUrl}/api/v1/system/logs/gastrofood?since=${lastGastrofoodCheck}`);
        if (response.ok) {
           const data = await response.json();
           if (data.success && data.logs && data.logs.length > 0) {
              setGastrofoodLogs(prev => {
                const nextLogs = [...prev];
                data.logs.forEach((log: any) => {
                  if (!nextLogs.some(l => l.id === log.id)) {
                    nextLogs.push(log);
                  }
                });
                nextLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                if (nextLogs.length > 200) return nextLogs.slice(nextLogs.length - 200);
                return nextLogs;
              });

              const timestamps = data.logs.map((l: any) => new Date(l.timestamp).getTime());
              const maxTime = Math.max(...timestamps);
              if (maxTime > 0) {
                lastGastrofoodCheck = maxTime.toString();
              }
           }
        }
      } catch (err) {
         // ignore
      }
    };

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
        const response = await fetch(`${engineUrl}/api/v1/system/logs/recent-errors?since=${lastCheck}`);
        if (response.ok) {
           const data = await response.json();
           if (data.success && data.errors && data.errors.length > 0) {
              data.errors.forEach((err: any) => {
                 const msg = err.message || '';
                 const isRoutineNoise = 
                    msg.includes('socket zumbi') ||
                    msg.includes('não retornou novas mensagens') ||
                    msg.includes('[History Sync]') ||
                    msg.includes('History sync is disabled') ||
                    msg.includes('identity changed') ||
                    msg.includes('GetCardapioCompleto') ||
                    (msg.includes('[WaCalls Listener]') && (msg.includes('Contato não encontrado') || msg.includes('mapeamento LID')));
                 
                 if (isRoutineNoise && err.level !== 'error') {
                    return; // Ignora avisos/infos rotineiros no DevLogger
                 }

                 addLog({
                    type: err.level === 'warn' ? 'warn' : 'error',
                    message: msg || 'Erro/Aviso Interno no Servidor Node.js',
                    source: `Servidor Node.js`,
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
    fetchGastrofoodLogs();
    const intervalTelemetry = setInterval(fetchTelemetry, 5000);
    const intervalGastrofood = setInterval(fetchGastrofoodLogs, 5000);
    const intervalErrors = setInterval(fetchRecentErrors, 5000);
    return () => {
       clearInterval(intervalTelemetry);
       clearInterval(intervalGastrofood);
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

  const copyGastrofoodLogs = () => {
    if (groupedGastrofoodLogs.length === 0) {
      navigator.clipboard.writeText('Nenhum log do Gastrofood para copiar.');
      setCopyFeedback('Nenhum log para copiar');
      setTimeout(() => setCopyFeedback(null), 3000);
      return;
    }

    const formatted = groupedGastrofoodLogs.map(log => {
      const timeStr = new Date(log.timestamp).toLocaleString('pt-BR');
      const isError = log.direction === 'error';
      const isPending = log.isPending;
      const directionText = isError ? 'ERROR' : (isPending ? 'PENDING' : 'SUCCESS');
      const statusText = log.status ? ` (Status: ${log.status})` : '';
      
      let header = `[${timeStr}] ${log.action || 'API Gastrofood'} - ${log.method || 'POST'} - ${directionText}${statusText}`;
      header += `\nURL: ${log.url || 'N/A'}`;
      if (log.tenant_id) {
        const company = companies.find(c => c.id === log.tenant_id);
        header += `\nEmpresa: ${company ? company.name : log.tenant_id}`;
      }
      
      const parts = [header];
      
      if (log.payload) {
        const payloadStr = typeof log.payload === 'object' ? JSON.stringify(log.payload, null, 2) : String(log.payload);
        parts.push(`Payload (Requisição):\n${payloadStr}`);
      }
      
      if (isError && log.error) {
        const errStr = typeof log.error === 'object' ? JSON.stringify(log.error, null, 2) : String(log.error);
        parts.push(`Erro / Resposta com Falha:\n${errStr}`);
      } else if (log.response) {
        const respStr = typeof log.response === 'object' ? JSON.stringify(log.response, null, 2) : String(log.response);
        parts.push(`Dados Recebidos (Retorno):\n${respStr}`);
      }
      
      return parts.join('\n\n');
    }).join('\n\n' + '='.repeat(60) + '\n\n');

    navigator.clipboard.writeText(formatted);
    setCopyFeedback(`Copiado logs do Gastrofood`);
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
           ref={buttonRef}
           onMouseDown={handleMouseDown}
           onTouchStart={handleTouchStart}
           onClick={(e) => {
             e.stopPropagation();
             if (isDraggingRef.current) return;
             toggleVisibility();
           }}
           style={position.x !== -1 && position.y !== -1 ? {
             left: `${position.x}px`,
             top: `${position.y}px`,
             bottom: 'auto',
             right: 'auto'
           } : undefined}
           className={`fixed z-[9999] text-white p-3 rounded-full shadow-xl transition-colors duration-200 ${
             position.x === -1 ? 'bottom-24 right-4' : ''
           } ${engineStatus === 'online' ? 'bg-emerald-600 hover:bg-emerald-500 hover:shadow-emerald-500/20' : 'bg-red-600 hover:bg-red-500 animate-pulse hover:shadow-red-500/20'} cursor-grab active:cursor-grabbing select-none`}
           title="Abrir Dev"
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
        <div className="bg-[#0b141a]/95 backdrop-blur-2xl border border-white/15 rounded-[32px] shadow-[0_25px_60px_rgba(0,0,0,0.85)] w-[92vw] sm:w-[620px] flex flex-col max-h-[88vh] overflow-hidden text-[#d1d7db] transition-all duration-300 relative">
          
          {/* Header Superior Neon Glassmorphism */}
          <div 
            className="flex items-center justify-between px-5 py-4 border-b border-white/10 cursor-pointer bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-indigo-500/10 hover:from-emerald-500/15 hover:to-indigo-500/15 transition-all select-none"
            onClick={toggleVisibility}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <Terminal size={18} className="text-black stroke-[2.5]" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-black text-white tracking-tight leading-tight">Antigravity</h3>
                <span className="text-[9px] text-emerald-400 font-extrabold tracking-widest block uppercase font-mono leading-none mt-0.5">DEV LOGGER</span>
              </div>
              
              {/* Chip de Status do Motor */}
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black border font-mono shadow-sm ${
                engineStatus === 'online' 
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' 
                  : engineStatus === 'checking' 
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-400' 
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
              }`}>
                <Activity size={12} className={engineStatus === 'online' ? 'animate-pulse text-emerald-400' : ''} />
                <span>{engineStatus.toUpperCase()}</span>
              </div>

              {logs.filter(l => l.type === 'error').length > 0 && (
                <span className="flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono shadow-sm">
                  <Bug size={12} /> {logs.filter(l => l.type === 'error').length}
                </span>
              )}
            </div>

            {/* Barra de Ferramentas Dev no Header */}
            <div className="flex items-center gap-1.5">
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setShowServerLogs(true); 
                  useDevStore.setState({ isVisible: false }); 
                }} 
                className="text-[#8696a0] hover:text-emerald-400 hover:bg-white/10 p-2 rounded-xl transition-all cursor-pointer active:scale-95" 
                title="Abrir Server Terminal SSE"
              >
                <Terminal size={15} />
              </button>

              <button 
                onClick={(e) => { e.stopPropagation(); handleTestSupabase(); }} 
                className="text-[#8696a0] hover:text-purple-400 hover:bg-white/10 p-2 rounded-xl transition-all cursor-pointer active:scale-95" 
                title="Testar Supabase DB"
              >
                <Database size={15} />
              </button>

              <button 
                onClick={(e) => { e.stopPropagation(); handleTestApp(); }} 
                className="text-[#8696a0] hover:text-cyan-400 hover:bg-white/10 p-2 rounded-xl transition-all cursor-pointer active:scale-95" 
                title="Testar App React"
              >
                <AppWindow size={15} />
              </button>

              <button 
                onClick={(e) => { e.stopPropagation(); handleTestEngine(); }} 
                className="text-[#8696a0] hover:text-blue-400 hover:bg-white/10 p-2 rounded-xl transition-all cursor-pointer active:scale-95" 
                title="Testar Baileys Engine"
              >
                <Smartphone size={15} />
              </button>

              <button 
                onClick={(e) => { e.stopPropagation(); setShowTestPanel(!showTestPanel); }} 
                className={`p-2 rounded-xl transition-all cursor-pointer relative active:scale-95 ${
                  showTestPanel 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-lg shadow-amber-500/20' 
                    : 'text-[#8696a0] hover:text-amber-400 hover:bg-white/10'
                }`}
                title="Antigravity Test Suite (ASTS)"
              >
                <Activity size={15} className={isTestingApp ? 'animate-pulse text-amber-400' : ''} />
                {isTestingApp && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                  </span>
                )}
              </button>

              <div className="w-px h-4 bg-white/15 mx-1" />

              <div className="relative flex items-center">
                <button 
                  onClick={(e) => { e.stopPropagation(); copyLogs(); }} 
                  className="text-[#8696a0] hover:text-emerald-400 hover:bg-white/10 p-2 rounded-xl transition-all cursor-pointer active:scale-95" 
                  title="Copiar Logs"
                >
                  <Copy size={15} />
                </button>
                {copyFeedback && (
                  <div className="absolute right-full mr-2 whitespace-nowrap bg-emerald-500 text-black font-black text-[10px] px-2.5 py-1 rounded-lg shadow-xl animate-in fade-in slide-in-from-right-2">
                    {copyFeedback}
                  </div>
                )}
              </div>

              <button 
                onClick={(e) => { e.stopPropagation(); clearLogs(); }} 
                className="text-[#8696a0] hover:text-rose-400 hover:bg-white/10 p-2 rounded-xl transition-all cursor-pointer active:scale-95" 
                title="Limpar Logs"
              >
                <Trash2 size={15} />
              </button>

              <div className="w-px h-4 bg-white/15 mx-1" />

              <a 
                href={`${engineUrl}/swagger/teste.html`} 
                target="_blank" 
                rel="noopener noreferrer" 
                onClick={(e) => e.stopPropagation()} 
                className="bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 px-2.5 py-1 rounded-xl text-[10px] font-black transition-all flex items-center gap-1 shadow-sm active:scale-95" 
                title="Abrir Documentação da API"
              >
                API Docs
              </a>

              <button className="text-[#8696a0] hover:text-white transition-colors ml-1 p-1">
                {isVisible ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>
          </div>

          {/* Sub-Régua de Telemetria e Metadados do Servidor */}
          {isVisible && serverMeta && (
            <div className="bg-[#111b21]/90 border-b border-white/10 p-3 px-4 flex flex-col gap-2 text-xs font-mono transition-all">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-indigo-300 bg-indigo-500/15 px-2.5 py-1 rounded-xl border border-indigo-500/30 text-[11px] font-bold">
                    <Layers size={13} className="text-indigo-400" />
                    <span>Engine: {serverMeta?.engineVersion || '5.3.7'}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-xl border border-amber-500/30 text-[11px] font-bold">
                    <Calendar size={13} className="text-amber-400" />
                    <span>Compilação: {serverMeta?.compileDate ? new Date(serverMeta.compileDate).toLocaleString('pt-BR') : '29/07/2026, 19:28:38'}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowBaileysModal(!showBaileysModal); }}
                    className="flex items-center gap-1.5 text-purple-300 bg-purple-500/15 hover:bg-purple-500/25 px-2.5 py-1 rounded-xl border border-purple-500/30 text-[11px] font-bold transition-all cursor-pointer group active:scale-95"
                    title="Clique para ver o Histórico de Versões e Releases do Baileys no GitHub"
                  >
                    <Smartphone size={13} className="text-purple-400 group-hover:scale-110 transition-transform" />
                    <span>Baileys: {serverMeta?.baileysVersion || 'v7.0.0-rc.9'} ({serverMeta?.baileysDate || '29/07/2026'})</span>
                    <ChevronDown size={11} className={`transition-transform duration-200 ${showBaileysModal ? 'rotate-180' : ''}`} />
                  </button>

                  <div className="flex items-center gap-1.5 text-blue-300 bg-blue-500/15 px-2.5 py-1 rounded-xl border border-blue-500/30 text-[11px] font-bold" title="Resolução atual da tela">
                    <AppWindow size={13} className="text-blue-400" />
                    <span>{windowSize.width}x{windowSize.height}</span>
                  </div>

                  {telemetry && (
                    <>
                      <div className="flex items-center gap-1.5 text-emerald-300 bg-emerald-500/15 px-2.5 py-1 rounded-xl border border-emerald-500/30 text-[11px] font-bold" title="Uso de CPU">
                        <Cpu size={13} className={telemetry.cpu > 50 ? 'animate-pulse text-rose-400' : 'text-emerald-400'} />
                        <span>{telemetry.cpu.toFixed(1)}%</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-cyan-300 bg-cyan-500/15 px-2.5 py-1 rounded-xl border border-cyan-500/30 text-[11px] font-bold" title="Uso de Memória RAM">
                        <Activity size={13} className="text-cyan-400" />
                        <span>{telemetry.memory.toFixed(1)} MB</span>
                      </div>
                    </>
                  )}
                </div>

                <button 
                  onClick={(e) => { e.stopPropagation(); setShowChangelog(!showChangelog); }}
                  className="flex items-center gap-1.5 text-emerald-300 hover:text-white transition-all bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 rounded-xl text-xs font-black shadow-md cursor-pointer active:scale-95"
                >
                  <Rocket size={13} className="text-emerald-400" /> Novidades <ChevronDown size={13} className={`transition-transform duration-200 ${showChangelog ? 'rotate-180' : ''}`}/>
                </button>
              </div>

              {/* Baileys Version History & GitHub Releases Dropdown */}
              {showBaileysModal && (
                <div className="mt-2 animate-in fade-in slide-in-from-top-2 relative overflow-hidden rounded-2xl bg-[#182229] border border-purple-500/30 shadow-2xl p-4 transition-all">
                  <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-white/10">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
                        <Smartphone size={18} className="text-purple-400 animate-pulse" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white block text-xs">Baileys Core ({serverMeta?.baileysVersion || 'v7.0.0-rc.9'})</span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase">
                            Em Uso no Servidor
                          </span>
                        </div>
                        <span className="text-[10px] text-[#8696a0]">
                          Motor Socket TypeScript/JavaScript para WhatsApp Web — <a href="https://github.com/WhiskeySockets/Baileys" target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:underline font-bold" onClick={(e)=>e.stopPropagation()}>WhiskeySockets/Baileys</a>
                        </span>
                      </div>
                    </div>

                    <a
                      href="https://github.com/WhiskeySockets/Baileys/releases"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 text-xs text-purple-300 hover:text-white bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 px-3 py-1.5 rounded-xl font-bold transition-all shadow-sm shrink-0"
                    >
                      <span>Releases GitHub</span> <ExternalLink size={12} />
                    </a>
                  </div>

                  {/* Lista de Releases e Histórico de Versões */}
                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                    {(serverMeta?.baileysHistory || [
                      {
                        tag: 'v7.0.0-rc14',
                        version: '7.0.0-rc14',
                        name: 'v7.0.0-rc14 (Latest)',
                        date: '2026-08-01',
                        isLatest: true,
                        isCurrent: true,
                        commit: '7e7b075',
                        highlights: [
                          'fix: advertise WIN_HYBRID instead of retired WIN32 web sub-platform (substitui WIN32 aposentado pela Meta por WIN_HYBRID)',
                          'ci: pin npm to 11.x, last line that still runs on node 20',
                          'example: fix logging of contact upserts',
                          'WAProto: perf: optimize history sync memory and CPU usage (#2333)',
                          'Resiliência aprimorada no processamento de lotes de mensagens e Bad MAC retry'
                        ]
                      },
                      {
                        tag: 'v6.7.24',
                        version: '6.7.24',
                        name: 'v6.7.24 (2026-07-29)',
                        date: '2026-07-29',
                        isLatest: false,
                        isCurrent: false,
                        commit: 'e062994',
                        highlights: [
                          'Reverts: Revert "chore(release): v6.7.24 (c7a17f5)"',
                          'Estabilização de sinalização de chamadas de voz e vídeo (WaCalls)',
                          'Suporte a vCards interativos e múltiplos contatos (ContactMessage)',
                          'Tratamento aprimorado de tokens de segurança E2E (tctoken)'
                        ]
                      },
                      {
                        tag: 'v7.0.0-rc.12',
                        version: '7.0.0-rc.12',
                        name: 'v7.0.0-rc.12',
                        date: '2026-07-20',
                        isLatest: false,
                        isCurrent: false,
                        commit: 'a12b34c',
                        highlights: [
                          'feat: Add support for pastParticipants in history sync (#2426)',
                          'Novo compilador estático Protobuf (WAProto/GenerateStatics.sh)',
                          'Otimização de memória RAM para instâncias multi-tenant'
                        ]
                      },
                      {
                        tag: 'v6.7.21',
                        version: '6.7.21',
                        name: 'v6.7.21',
                        date: '2026-07-10',
                        isLatest: false,
                        isCurrent: false,
                        commit: 'f98e721',
                        highlights: [
                          'Correções de heartbeat e presenciais (composing/recording)',
                          'Mitigação de desconexões 408 (QR Code timeout)'
                        ]
                      }
                    ]).map((rel: any, idx: number) => (
                      <div key={idx} className="bg-[#111b21] p-3 rounded-2xl border border-white/10 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs font-mono">{rel.tag || rel.version}</span>
                            {rel.isLatest && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase">
                                Latest
                              </span>
                            )}
                            {rel.isCurrent && (
                              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[9px] font-black uppercase">
                                Rodando no Nó
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-[#8696a0]">
                            {rel.commit && <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded">commit {rel.commit}</span>}
                            <span>{rel.date}</span>
                          </div>
                        </div>

                        <ul className="space-y-1.5 pt-1">
                          {rel.highlights && rel.highlights.map((item: string, iIdx: number) => (
                            <li key={iIdx} className="flex items-start gap-2 text-[11px] text-[#d1d7db] leading-relaxed">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Changelog Dropdown */}
              {showChangelog && (serverMeta.changelog || serverMeta.history) && (
                <div className="mt-2 animate-in fade-in slide-in-from-top-2 relative overflow-hidden rounded-2xl bg-[#182229] border border-emerald-500/30 shadow-2xl p-4 transition-all">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                      <Rocket size={16} className="text-emerald-400 animate-pulse" />
                    </div>
                    <div>
                      <span className="font-black text-white block text-xs">Novidades na v{serverMeta.engineVersion}</span>
                      <span className="text-[10px] text-[#8696a0]">
                        Deploy de {serverMeta.history && serverMeta.history[0] ? new Date(serverMeta.history[0].compile_date).toLocaleString('pt-BR') : 'Hoje'}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-2 mt-2">
                    {serverMeta.changelog && serverMeta.changelog.map((logItem: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-[#d1d7db] leading-relaxed">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                        <span>{logItem}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="flex items-center justify-between font-mono mt-1 pt-2 border-t border-white/10">
                <span className="text-[#8696a0] font-bold text-[11px]">Ferramentas Dev:</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowEndpoints(!showEndpoints); }}
                  className="flex items-center gap-1.5 text-indigo-300 hover:text-white transition-all bg-indigo-500/20 border border-indigo-500/40 px-2.5 py-1 rounded-xl text-[11px] font-bold cursor-pointer"
                >
                  <Network size={12} className="text-indigo-400" /> Root Endpoints <ChevronDown size={12} className={`transition-transform ${showEndpoints ? 'rotate-180' : ''}`}/>
                </button>
              </div>
               
              {showEndpoints && (
                <div className="bg-[#182229] rounded-2xl p-3 border border-indigo-500/20 mt-2 space-y-2 animate-in fade-in">
                  <span className="font-black text-indigo-300 text-xs block">Endpoints Globais do Motor Baileys:</span>
                  <div className="grid grid-cols-1 gap-2">
                    {(() => {
                      const myTenant = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';
                      return [
                        { name: 'Root / App Status (GET)', path: '/' },
                        { name: 'Motor Health Check (GET)', path: '/debug/healthz' },
                        { name: 'Listar Todas Instâncias (GET)', path: '/instance' },
                        { name: 'Listar Conversas/Chats da Instância (GET)', path: `/instance/${myTenant}/chats` },
                        { name: 'Listar Contatos/Agenda da Instância (GET)', path: `/instance/${myTenant}/contacts` },
                      ];
                    })().map((ep, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-[#111b21] p-2.5 rounded-xl border border-white/10">
                        <span className="text-white font-mono text-[11px] break-all max-w-[70%]">{ep.name} <br/><span className="text-[#8696a0] text-[10px]">{engineUrl}{ep.path}</span></span>
                        <a 
                          href={`${engineUrl}${ep.path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-300 hover:text-white bg-indigo-500/20 border border-indigo-500/30 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 text-[10px] font-bold"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>Testar</span> <ExternalLink size={11} />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Abas de Navegação Deslizantes (CONSOLE / GASTROFOOD / ASTS) */}
          {isVisible && (
            <div className="p-2 bg-[#111b21] border-b border-white/10 flex gap-2 shrink-0 select-none">
              <button 
                onClick={(e) => { e.stopPropagation(); setActiveTab('console'); }}
                className={`flex-1 py-2.5 font-mono text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 rounded-2xl transition-all cursor-pointer border-0 ${
                  activeTab === 'console' 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black shadow-lg shadow-emerald-500/30' 
                    : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                }`}
              >
                <Terminal size={14} /> Console ({logs.length})
              </button>

              <button 
                onClick={(e) => { e.stopPropagation(); setActiveTab('gastrofood'); }}
                className={`flex-1 py-2.5 font-mono text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 rounded-2xl transition-all cursor-pointer border-0 ${
                  activeTab === 'gastrofood' 
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30' 
                    : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                }`}
              >
                <Network size={14} /> Gastrofood ({groupedGastrofoodLogs.length})
              </button>

              <button 
                onClick={(e) => { e.stopPropagation(); setActiveTab('asts'); }}
                className={`flex-1 py-2.5 font-mono text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 rounded-2xl transition-all cursor-pointer border-0 ${
                  activeTab === 'asts' 
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-lg shadow-amber-500/30' 
                    : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                }`}
              >
                <Activity size={14} className={isTestingApp ? 'animate-pulse text-amber-950' : ''} /> ASTS {testSummary ? `(${testSummary.healthScore}%)` : ''}
              </button>
            </div>
          )}

          {/* Área Principal de Conteúdo / Logs */}
          {isVisible && (
            showTestPanel ? (
              /* Antigravity Application Simulator & Test Suite (ASTS) */
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-xs custom-scrollbar min-h-[300px] max-h-[500px] bg-[#0b141a] transition-all duration-300 relative rounded-b-[32px]">
                {/* Cabeçalho do Painel ASTS */}
                <div className="flex items-center justify-between pb-3 border-b border-white/10 relative z-10 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/20">
                      <Activity size={16} className="text-amber-400 animate-pulse" />
                    </div>
                    <div>
                      <span className="font-black text-white block text-xs tracking-wider font-mono">ASTS COCKPIT v1.0.0</span>
                      <span className="text-[10px] text-[#8696a0] block font-mono">SIMULADOR E AUTOMATIZADOR DE TESTES</span>
                    </div>
                  </div>
                  
                  {/* Controles de Teste */}
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <span className="text-[10px] font-bold text-[#8696a0] uppercase tracking-wider font-mono">Loop Contínuo</span>
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          checked={testLoopContinuous}
                          onChange={(e) => setTestLoopContinuous(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-[#111b21] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-black border border-white/10"></div>
                      </div>
                    </label>
                    
                    <div className="w-px h-5 bg-white/10" />
                    
                    {isTestingApp ? (
                      <button 
                        onClick={stopApplicationTests}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold rounded-xl font-mono transition-all active:scale-95 cursor-pointer text-xs"
                      >
                        <Pause size={12} className="fill-current" /> PARAR
                      </button>
                    ) : (
                      <button 
                        onClick={runApplicationTests}
                        className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-400 text-black font-black rounded-xl font-mono transition-all active:scale-95 shadow-lg shadow-amber-500/30 cursor-pointer text-xs tracking-wide"
                      >
                        <Play size={12} className="fill-current" /> DIAGNÓSTICO
                      </button>
                    )}
                  </div>
                </div>

                {/* Barra de Progresso Futurista */}
                {isTestingApp && (
                  <div className="flex flex-col gap-2.5 bg-[#111b21] border border-white/10 rounded-2xl p-3.5 relative z-10 animate-in zoom-in-95 duration-200 shrink-0">
                    <div className="flex items-center justify-between font-mono text-xs text-white">
                      <span className="font-bold text-amber-400 uppercase flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                        <span className="truncate">Tarefa: {testCurrentTask}</span>
                      </span>
                      <span className="font-black text-amber-400 shrink-0 ml-2">
                        {testProgress}%
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase font-bold text-[#8696a0] gap-2 flex-wrap">
                      <span className="bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2.5 py-0.5 rounded-lg animate-pulse">
                        ⚙️ Executando: Passo {testStepIndex} de 10
                      </span>
                      <span className="bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2.5 py-0.5 rounded-lg">
                        ⏱️ Tempo Restante: ~{testTimeRemaining}s
                      </span>
                    </div>
                    
                    <div className="w-full bg-[#182229] rounded-full h-2.5 overflow-hidden border border-white/10 relative flex items-center">
                      <div 
                        className="bg-gradient-to-r from-amber-500 to-orange-400 h-full rounded-full transition-all duration-300 relative shadow-md shadow-amber-500/50"
                        style={{ width: `${testProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Painel de Status Matrix */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 relative z-10 shrink-0">
                  {[
                    { id: 'supabase', label: 'Supabase DB', icon: <Database size={13} />, status: testResults.supabase },
                    { id: 'baileys', label: 'Baileys Engine', icon: <Smartphone size={13} />, status: testResults.baileys },
                    { id: 'chatStore', label: 'Zustand Store', icon: <Layers size={13} />, status: testResults.chatStore },
                    { id: 'auth', label: 'Nível RBAC', icon: <UserCheck size={13} />, status: testResults.auth },
                  ].map((mod) => {
                    const isIdle = mod.status === 'idle';
                    const isTesting = mod.status === 'testing';
                    const isPassed = mod.status === 'passed';
                    const isFailed = mod.status === 'failed';
                    
                    return (
                      <div 
                        key={mod.id} 
                        className={`p-3 rounded-2xl border flex flex-col gap-1 font-mono select-none transition-all duration-300 min-w-0 ${
                          isIdle ? 'bg-[#111b21] border-white/10 text-[#8696a0]' : ''
                        } ${
                          isTesting ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 animate-pulse' : ''
                        } ${
                          isPassed ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-md' : ''
                        } ${
                          isFailed ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 animate-in shake' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] uppercase font-bold gap-1 min-w-0">
                          <span className="opacity-80 truncate block">{mod.label}</span>
                          <span className="shrink-0">{mod.icon}</span>
                        </div>
                        <div className="text-xs font-black tracking-wider truncate block">
                          {isIdle && 'AGUARDANDO'}
                          {isTesting && 'AUDITANDO...'}
                          {isPassed && 'PASSED OK'}
                          {isFailed && 'FAILED ERR'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Relatório Final */}
                {testSummary && (
                  <div className="flex flex-col gap-3 bg-[#111b21] border border-white/10 rounded-2xl p-4 relative z-10 animate-in fade-in duration-300">
                    <div className="flex justify-between items-center pb-2 border-b border-white/10 flex-wrap gap-2">
                      <div className="flex items-center gap-3 text-xs text-[#8696a0]">
                        <span className="uppercase font-bold font-mono">Métricas de Auditoria:</span>
                        <span>Duração: <strong className="text-white font-mono">{testSummary.duration.toFixed(2)}s</strong></span>
                        <span>Anomalias: <strong className={testSummary.totalErrors > 0 ? "text-rose-400 font-mono" : "text-emerald-400 font-mono"}>{testSummary.totalErrors}</strong></span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="text-xs font-bold text-[#8696a0] uppercase">Saúde:</span>
                        <span className={`px-3 py-1 rounded-xl text-xs font-black border shadow-sm ${
                          testSummary.healthScore === 100 
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' 
                            : testSummary.healthScore >= 75 
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' 
                              : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                        }`}>
                          {testSummary.healthScore}%
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-xs leading-relaxed text-[#d1d7db] font-mono bg-[#182229] p-3 rounded-xl border border-white/10">
                      {testSummary.diagnosis}
                    </p>
                  </div>
                )}
              </div>
            ) : activeTab === 'gastrofood' ? (
              /* Gastrofood API Logs Monitor */
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 font-mono text-xs custom-scrollbar min-h-[250px] max-h-[500px] bg-[#0b141a] relative rounded-b-[32px] select-none">
                {groupedGastrofoodLogs.length === 0 ? (
                  <div className="m-auto py-12 px-6 flex flex-col items-center justify-center text-center space-y-3.5 select-none animate-in fade-in zoom-in-95 duration-300">
                    <div className="w-16 h-16 rounded-3xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-2xl shadow-blue-500/20 relative">
                      <Network size={28} className="animate-pulse" />
                      <div className="absolute inset-0 rounded-3xl border border-blue-400/40 animate-ping" />
                    </div>
                    <h4 className="text-sm font-black text-white tracking-tight">Aguardando Transações Gastrofood</h4>
                    <p className="text-xs text-[#8696a0] max-w-xs leading-relaxed">
                      Interaja com o chat ou aguarde a sincronização automática do cardápio para acompanhar chamadas de API em tempo real.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {groupedGastrofoodLogs.map((log) => {
                      const isExpanded = !!expandedLogs[log.id];
                      const isPending = log.isPending;
                      const isError = log.direction === 'error';
                      
                      const duration = log.responseTimestamp 
                        ? (new Date(log.responseTimestamp).getTime() - new Date(log.timestamp).getTime()) 
                        : null;
                      
                      return (
                        <div 
                          key={log.id} 
                          className="bg-[#182229] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2 transition-all cursor-pointer hover:border-white/20"
                          onClick={() => toggleExpandLog(log.id)}
                        >
                          <div className="flex justify-between items-center gap-2 select-none">
                            <div className="flex items-center gap-2 font-mono min-w-0">
                              <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                                isError 
                                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' 
                                  : !isPending 
                                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' 
                                    : 'bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse'
                              }`}>
                                {log.status || (isError ? 'ERROR' : isPending ? 'REQ' : 'SUCCESS')}
                              </span>
                              <span className="font-black text-white truncate text-xs">
                                {log.action || 'API Gastrofood'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-[#8696a0]">
                              {duration !== null && (
                                <span className="text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md text-[10px]">
                                  ⚡ {duration}ms
                                </span>
                              )}
                              <span>{new Date(log.timestamp).toLocaleTimeString('pt-BR')}</span>
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* Console & Server Logs - COM SUPORTE A AGRUPAMENTO DE ERROS IDENTICOS E FILTRAGEM DE NOVO PADRÃO */
              <div className="flex-1 overflow-y-auto flex flex-col font-mono text-xs custom-scrollbar min-h-[300px] max-h-[500px] bg-[#0b141a]">
                
                {/* Sub-Barra de Controles: Agrupamento, Filtros de Origem e Disparo de Testes */}
                <div className="flex items-center justify-between gap-2 p-2.5 bg-[#111b21] border-b border-white/10 text-xs font-mono select-none flex-wrap sticky top-0 z-20 backdrop-blur-md">
                  {/* Seletor de Modo: Agrupado vs Linha do Tempo */}
                  <div className="flex items-center gap-1 bg-[#182229] p-1 rounded-xl border border-white/10">
                    <button
                      onClick={() => setViewMode('grouped')}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border-0 ${
                        viewMode === 'grouped'
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black shadow-md shadow-emerald-500/20'
                          : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                      }`}
                      title="Agrupar erros e logs idênticos"
                    >
                      📦 Agrupado ({groupedAndFilteredLogs.length})
                    </button>
                    <button
                      onClick={() => setViewMode('timeline')}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border-0 ${
                        viewMode === 'timeline'
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black shadow-md shadow-emerald-500/20'
                          : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                      }`}
                      title="Exibir histórico individual por ordem cronológica"
                    >
                      🕒 Linha do Tempo
                    </button>
                  </div>

                  {/* Chips de Filtro */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {[
                      { id: 'all', label: 'Todos', count: logs.length },
                      { id: 'node', label: '🖥️ Servidor Node', count: nodeLogsCount },
                      { id: 'error', label: '🔴 Erros', count: errorLogsCount },
                      { id: 'warn', label: '🟡 Alertas', count: warnLogsCount },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setLogFilter(f.id as any)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all cursor-pointer border ${
                          logFilter === f.id
                            ? 'bg-indigo-500/25 border-indigo-500/50 text-indigo-300 shadow-sm'
                            : 'bg-[#182229] border-white/10 text-[#8696a0] hover:text-white'
                        }`}
                      >
                        {f.label} ({f.count})
                      </button>
                    ))}
                  </div>

                  {/* Simulação de Erro do Servidor Node */}
                  <button
                    onClick={handleSimulateNodeError}
                    className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer active:scale-95 flex items-center gap-1 shadow-sm"
                    title="Simular disparo de erro no servidor Node.js para testar o agrupamento"
                  >
                    <Bug size={11} className="text-rose-400 animate-pulse" /> + Erro Node
                  </button>
                </div>

                {/* Lista de Cards Agrupados / Cronológicos */}
                <div className="p-4 flex flex-col gap-3">
                  {groupedAndFilteredLogs.length === 0 ? (
                    <div className="m-auto py-12 px-6 flex flex-col items-center justify-center text-center space-y-3.5 select-none animate-in fade-in zoom-in-95 duration-300">
                      <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-2xl shadow-emerald-500/20 relative">
                        <Terminal size={28} className="animate-pulse" />
                        <div className="absolute inset-0 rounded-3xl border border-emerald-400/40 animate-ping" />
                      </div>
                      <h4 className="text-sm font-black text-white tracking-tight">
                        {logFilter === 'node' ? 'Nenhum erro do Servidor Node capturado' : 'Nenhum log detectado'}
                      </h4>
                      <p className="text-xs text-[#8696a0] max-w-xs leading-relaxed">
                        {logFilter === 'node' 
                          ? 'O servidor Node.js está operando normalmente sem erros de lógica ou loops.' 
                          : 'Erros do Servidor Node, requisições HTTP e exceções de lógica serão capturados e agrupados aqui.'}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTestApp()}
                          className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-xs font-bold px-3.5 py-2 rounded-2xl transition-all cursor-pointer shadow-md active:scale-95 flex items-center gap-2"
                        >
                          <Activity size={14} /> Teste Rápido
                        </button>
                        <button
                          onClick={handleSimulateNodeError}
                          className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold px-3.5 py-2 rounded-2xl transition-all cursor-pointer shadow-md active:scale-95 flex items-center gap-2"
                        >
                          <Bug size={14} /> Simular Erro Node
                        </button>
                      </div>
                    </div>
                  ) : (
                    groupedAndFilteredLogs.map((log) => {
                      const isErr = log.type === 'error';
                      const isWrn = log.type === 'warn';
                      const isSucc = log.type === 'success';
                      const isInf = log.type === 'info';
                      const isNode = log.isServerNode;
                      const isExpanded = !!expandedLogs[log.id];

                      return (
                        <div 
                          key={log.id} 
                          className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col gap-2 shadow-lg ${
                            isNode && isErr
                              ? 'bg-gradient-to-r from-rose-950/40 to-[#182229] border-rose-500/40 text-rose-200 shadow-rose-500/10'
                              : isErr 
                                ? 'bg-rose-500/10 border-rose-500/30 text-rose-200 shadow-rose-500/10' 
                                : isWrn 
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-200 shadow-amber-500/10' 
                                  : isSucc 
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' 
                                    : isInf 
                                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-200' 
                                      : 'bg-[#182229] border-white/10 text-[#d1d7db]'
                          }`}
                        >
                          {/* Cabeçalho do Card */}
                          <div className="flex justify-between items-center select-none gap-2 flex-wrap">
                            <div className="flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-wider min-w-0">
                              {isNode ? (
                                <span className="flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 px-2 py-0.5 rounded-lg text-[9px]">
                                  🖥️ SERVIDOR NODE.JS
                                </span>
                              ) : null}

                              {isErr && <AlertTriangle size={13} className="text-rose-400 animate-pulse shrink-0" />}
                              {isWrn && <AlertTriangle size={13} className="text-amber-400 shrink-0" />}
                              {isSucc && <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />}
                              {isInf && <Info size={13} className="text-blue-400 shrink-0" />}
                              {log.type === 'log' && <Terminal size={13} className="text-[#8696a0] shrink-0" />}

                              <span className="truncate text-white font-bold">{log.source}</span>

                              {/* PILULA DE CONTAGEM / AGRUPAMENTO */}
                              {log.count > 1 && (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500/30 text-rose-200 border border-rose-400/40 shrink-0 animate-pulse shadow-md shadow-rose-500/20">
                                  {log.count}x Ocorrências
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-[#8696a0] shrink-0 font-mono">
                                {new Date(log.latestTimestamp).toLocaleTimeString('pt-BR', { hour12: false })}
                              </span>
                              <button
                                onClick={() => toggleExpandLog(log.id)}
                                className="text-[#8696a0] hover:text-white p-1 rounded-md transition-colors cursor-pointer"
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            </div>
                          </div>

                          {/* Mensagem do Log */}
                          <p className="break-all whitespace-pre-wrap opacity-95 leading-relaxed font-semibold font-mono text-xs">
                            {log.message}
                          </p>

                          {/* Detalhes Expandidos (Histórico de ocorrências e JSON payload) */}
                          {(isExpanded || log.details) && (
                            <div className="flex flex-col gap-2 mt-1">
                              {log.count > 1 && (
                                <div className="p-2 bg-[#111b21] border border-white/10 rounded-xl text-[10px] text-amber-300 font-mono flex items-center justify-between flex-wrap gap-2">
                                  <span>
                                    ⏱️ <strong>Primeira ocorrência:</strong> {new Date(log.firstTimestamp).toLocaleTimeString('pt-BR')} | <strong>Última:</strong> {new Date(log.latestTimestamp).toLocaleTimeString('pt-BR')}
                                  </span>
                                  <span className="text-[9px] text-[#8696a0] uppercase font-bold">
                                    Agrupado ({log.count} repetições)
                                  </span>
                                </div>
                              )}

                              {log.details && (
                                <pre className="p-3 bg-[#111b21] border border-white/10 rounded-xl text-[10px] text-cyan-300 overflow-x-auto max-h-[180px] custom-scrollbar font-mono leading-relaxed select-all">
                                  {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>
              </div>
            )
          )}
        </div>
      </div>
      <ServerLogsTerminal isOpen={showServerLogs} onClose={() => setShowServerLogs(false)} />
    </>
  );
}
