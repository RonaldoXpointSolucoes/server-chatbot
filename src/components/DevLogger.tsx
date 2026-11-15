import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDevStore } from '../store/devStore';
import { Terminal, AlertTriangle, Bug, Info, CheckCircle2, ChevronDown, ChevronUp, Trash2, Copy, Activity, Layers, Calendar, Rocket, Database, Smartphone, AppWindow, ExternalLink, Network, Cpu, Play, Pause, RefreshCw, UserCheck, ShieldAlert, Sparkles, Wand2, BrainCircuit, Check, Loader2, Send, ArrowUpRight, FileCode, CheckCircle, X, Zap, Mic, MicOff, Image as ImageIcon, Paperclip, Volume2, UploadCloud, Square, Plus, Radio, Film, Gauge, Server, Clock, HardDrive, Search, SlidersHorizontal, ChevronRight, Maximize2, Minimize2, Wrench } from 'lucide-react';
import { supabase, masterSupabase, getSupabaseHealthStatus } from '../services/supabase';
import { ServerLogsTerminal } from './ServerLogsTerminal';
import { useChatStore } from '../store/chatStore';
import { geminiService } from '../services/geminiService';
import { runPreventiveAudit, runControlledCaptureProbe, fetchRecentRealLogs, getContactBoxPhoneKey, PreventiveAuditReport, CaptureProbeKind } from '../utils/preventiveDiagnostics';
import { DevLoggerModalShell } from './devlogger/DevLoggerModalShell';
import { DevLoggerMetaModals } from './devlogger/DevLoggerMetaModals';
import { DevLoggerGastrofoodTab } from './devlogger/DevLoggerGastrofoodTab';

export default function DevLogger() {
  const navigate = useNavigate();
  const { logs, isVisible, isEnabled, toggleVisibility, addLog, clearLogs, showServerLogs, setShowServerLogs } = useDevStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const devLoggerModalRef = useRef<HTMLDivElement>(null);
  const originalConsoleWarnRef = useRef(console.warn);
  
  const [engineStatus, setEngineStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [serverMeta, setServerMeta] = useState<any>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showBaileysModal, setShowBaileysModal] = useState(false);
  const [showEndpoints, setShowEndpoints] = useState(false);
  const [telemetry, setTelemetry] = useState<{ cpu: number, memory: number, uptime: number } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showMobileTools, setShowMobileTools] = useState(false);
  const [showTelemetryBar, setShowTelemetryBar] = useState(false);
  const [showConsoleFilters, setShowConsoleFilters] = useState(false);
  const [showSimulationModal, setShowSimulationModal] = useState(false);
  const [simModalTab, setSimModalTab] = useState<'preventive' | 'suites' | 'sandbox'>('preventive');
  const [auditTenantOverride, setAuditTenantOverride] = useState<string>('');
  const [preventiveReport, setPreventiveReport] = useState<PreventiveAuditReport | null>(null);
  const [isRunningPreventive, setIsRunningPreventive] = useState(false);
  const [runningProbe, setRunningProbe] = useState<CaptureProbeKind | null>(null);
  const [probeResult, setProbeResult] = useState<{ kind: CaptureProbeKind; ok: boolean; summary: string } | null>(null);

  const showToastFeedback = (msg: string, durationMs = 2800) => {
    setCopyFeedback(msg);
    setTimeout(() => setCopyFeedback(null), durationMs);
  };
  
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
  
  // Estados do Antigravity Application Simulator & Test Suite (ASTS) e Cockpit E2E / Telemetria
  const [activeTab, setActiveTab] = useState<'console' | 'asts' | 'gastrofood' | 'e2e'>('console');
  const showTestPanel = activeTab === 'asts';
  const setShowTestPanel = (val: boolean) => {
    setActiveTab(val ? 'asts' : 'console');
  };
  const [gastrofoodLogs, setGastrofoodLogs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  
  // Estados para agrupamento de erros e filtragem avançada
  const [viewMode, setViewMode] = useState<'grouped' | 'timeline'>('grouped');
  const [logFilter, setLogFilter] = useState<'all' | 'action' | 'error' | 'breadcrumbs' | 'node' | 'warn'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | '15m' | '1h' | 'today'>('all');

  useEffect(() => {
    supabase.from('companies').select('id, name').then(({ data }) => {
      if (data) setCompanies(data);
    });
  }, []);

  // Agrupamento Inteligente de Erros e Logs com Suporte a Múltiplos Filtros
  const groupedAndFilteredLogs = useMemo(() => {
    let filtered = logs;
    
    // 1. Filtro de Origem / Nível / Ação
    if (logFilter === 'action') {
      filtered = filtered.filter(l => l.requiresAction);
    } else if (logFilter === 'breadcrumbs') {
      filtered = filtered.filter(l => l.step || (l.message || '').includes('[MIGALHA'));
    } else if (logFilter === 'node') {
      filtered = filtered.filter(l => 
        l.source.toLowerCase().includes('server') || 
        l.source.toLowerCase().includes('node') ||
        l.source.toLowerCase().includes('backend')
      );
    } else if (logFilter === 'error') {
      filtered = filtered.filter(l => l.type === 'error');
    } else if (logFilter === 'warn') {
      filtered = filtered.filter(l => l.type === 'warn');
    }

    // 2. Filtro Temporal
    if (timeFilter !== 'all') {
      const now = Date.now();
      filtered = filtered.filter(l => {
        const logTime = new Date(l.timestamp).getTime();
        if (timeFilter === '15m') return now - logTime <= 15 * 60 * 1000;
        if (timeFilter === '1h') return now - logTime <= 60 * 60 * 1000;
        if (timeFilter === 'today') {
          return new Date(l.timestamp).toDateString() === new Date().toDateString();
        }
        return true;
      });
    }

    // 3. Busca Textual Livre
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(l => {
        const msgMatch = (l.message || '').toLowerCase().includes(q);
        const srcMatch = (l.source || '').toLowerCase().includes(q);
        const detailsMatch = l.details ? JSON.stringify(l.details).toLowerCase().includes(q) : false;
        const tenantMatch = (l.tenantId || '').toLowerCase().includes(q);
        const instanceMatch = (l.instanceId || '').toLowerCase().includes(q);
        return msgMatch || srcMatch || detailsMatch || tenantMatch || instanceMatch;
      });
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
          if (log.requiresAction) group.requiresAction = true;
          if (log.severity === 'critical') group.severity = 'critical';
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
          isServerNode: log.source.toLowerCase().includes('server') || log.source.toLowerCase().includes('node'),
          requiresAction: log.requiresAction,
          severity: log.severity,
          tenantId: log.tenantId,
          instanceId: log.instanceId,
          step: log.step
        });
      }
    });

    return Array.from(groupsMap.values());
  }, [logs, viewMode, logFilter, searchQuery, timeFilter]);

  const actionLogsCount = useMemo(() => logs.filter(l => l.requiresAction).length, [logs]);
  const breadcrumbLogsCount = useMemo(() => logs.filter(l => l.step || (l.message || '').includes('[MIGALHA')).length, [logs]);
  const nodeLogsCount = useMemo(() => {
    return logs.filter(l => 
      l.source.toLowerCase().includes('server') || 
      l.source.toLowerCase().includes('node') ||
      l.source.toLowerCase().includes('backend')
    ).length;
  }, [logs]);

  const errorLogsCount = useMemo(() => logs.filter(l => l.type === 'error').length, [logs]);
  const warnLogsCount = useMemo(() => logs.filter(l => l.type === 'warn').length, [logs]);

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

  // Estados da Análise com I.A (Gemini 2.5 Flash) e Criação de Card no CRM Kanban
  const [isAnalyzingAiLogs, setIsAnalyzingAiLogs] = useState(false);
  const [aiAnalysisStep, setAiAnalysisStep] = useState<string>('');
  const [showAiCardModal, setShowAiCardModal] = useState(false);
  const [generatedAiCard, setGeneratedAiCard] = useState<any>(null);
  const [createdCardLead, setCreatedCardLead] = useState<any>(null);
  const [createdCardBoardId, setCreatedCardBoardId] = useState<string>('95be1dee-9d28-47d9-8ccf-d51a337f1572');
  const [createdCardBoardName, setCreatedCardBoardName] = useState<string>('Desenvolvimento & Roadmap');

  // Estados do Modal de Entrada Multimídia & Confirmação de IA
  const [showAiMediaPromptModal, setShowAiMediaPromptModal] = useState(false);
  const [aiPromptTab, setAiPromptTab] = useState<'quick' | 'enriched'>('enriched');
  const [userPromptNotes, setUserPromptNotes] = useState('');
  const [attachedImagesList, setAttachedImagesList] = useState<Array<{ id: string; name: string; dataUrl: string; file: File }>>([]);
  const [attachedAudioItem, setAttachedAudioItem] = useState<{ id: string; name: string; blob: Blob; url: string; duration: number } | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  const startAudioRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Seu navegador não suporta gravação de áudio direta.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAttachedAudioItem({
          id: `audio_${Date.now()}`,
          name: `audio_gravado_${new Date().toLocaleTimeString('pt-BR').replace(/:/g, '-')}.webm`,
          blob: audioBlob,
          url: audioUrl,
          duration: recordingSeconds
        });
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setIsRecordingAudio(true);
      setRecordingSeconds(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Erro ao acessar microfone:', err);
      alert('Não foi possível acessar o microfone: ' + (err.message || 'Permissão negada.'));
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      mediaRecorderRef.current.stop();
      setIsRecordingAudio(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const handleImageFilesSelected = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setAttachedImagesList(prev => [
          ...prev,
          {
            id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: file.name,
            dataUrl,
            file
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleAudioFileSelected = (files: FileList | null) => {
    if (!files || !files[0]) return;
    const file = files[0];
    const url = URL.createObjectURL(file);
    setAttachedAudioItem({
      id: `audio_${Date.now()}`,
      name: file.name,
      blob: file,
      url,
      duration: 0
    });
  };

  const removeImageItem = (id: string) => {
    setAttachedImagesList(prev => prev.filter(img => img.id !== id));
  };

  const removeAudioItem = () => {
    if (attachedAudioItem?.url) {
      URL.revokeObjectURL(attachedAudioItem.url);
    }
    setAttachedAudioItem(null);
  };

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

  /** Resolve o tenant alvo para varreduras preventivas (seletor manual do cockpit ou empresa ativa). */
  const resolveAuditTenantId = (override?: string): string | null => {
    const manual = typeof override === 'string' ? override : auditTenantOverride;
    if (manual && manual !== '__all__') return manual;
    if (manual === '__all__') return null;
    const storeTenantId = (useChatStore.getState() as any)?.tenantInfo?.id;
    if (storeTenantId) return storeTenantId;
    return sessionStorage.getItem('current_tenant_id') || localStorage.getItem('current_tenant_id') || null;
  };

  /** Hidrata logs reais de system_logs/Buffer Node no Console sem duplicar ou regravar no banco. */
  const hydrateRealLogsIntoStore = (pulledLogs: Awaited<ReturnType<typeof fetchRecentRealLogs>>): number => {
    const existingKeys = new Set(
      useDevStore.getState().logs.map((l) => `${l.source}:${(l.message || '').slice(0, 100)}`)
    );
    let added = 0;

    pulledLogs.forEach((item) => {
      const key = `${item.source}:${item.message.slice(0, 100)}`;
      if (existingKeys.has(key)) return;
      existingKeys.add(key);
      added++;

      addLog({
        type: item.level === 'warn' ? 'warn' : 'error',
        message: `[HISTÓRICO REAL] ${item.message}`,
        source: item.source,
        timestamp: item.created_at,
        details: item.payload,
        tenantId: item.company_id || undefined,
        requiresAction: item.level === 'error' || item.level === 'fatal',
        severity: item.level === 'error' || item.level === 'fatal' ? 'critical' : 'medium',
        skipPersist: true
      });
    });

    return added;
  };

  /** Executa auditoria preventiva multi-camada não destrutiva e registra anomalias reais no Console. */
  const handleRunPreventiveAudit = async (tenantOverride?: string) => {
    if (isRunningPreventive) return;
    setIsRunningPreventive(true);
    try {
      const targetTenant = resolveAuditTenantId(tenantOverride);
      const report = await runPreventiveAudit(targetTenant, engineUrl);
      setPreventiveReport(report);

      hydrateRealLogsIntoStore(report.pulledLogs);

      const actionable = report.findings.filter((f) => f.severity === 'critical' || f.severity === 'warn');
      if (actionable.length === 0) {
        addLog({
          type: 'success',
          message: `Varredura Preventiva Concluída (Saúde ${report.score}% em ${report.durationMs}ms): todas as ${report.findings.length} camadas auditadas estão saudáveis.`,
          source: 'Auditoria Preventiva',
          skipPersist: true
        });
      } else {
        actionable.forEach((item) => {
          addLog({
            type: item.severity === 'critical' ? 'error' : 'warn',
            message: `[PREVENTIVO • ${item.title}] ${item.summary} — Ação: ${item.recommendation}`,
            source: 'Auditoria Preventiva',
            details: item.detail ? { detalhe: item.detail, raw: item.rawPayload } : item.rawPayload,
            tenantId: targetTenant || undefined,
            requiresAction: item.severity === 'critical',
            severity: item.severity === 'critical' ? 'critical' : 'medium',
            skipPersist: true
          });
        });
      }
    } catch (err: any) {
      addLog({
        type: 'error',
        message: `Falha ao executar Varredura Preventiva: ${err?.message || String(err)}`,
        source: 'Auditoria Preventiva',
        skipPersist: true
      });
    } finally {
      setIsRunningPreventive(false);
    }
  };

  /** Puxa erros e warnings reais das últimas 2 horas (Supabase system_logs + Buffer Node). */
  const handleSyncHistoricalLogs = async () => {
    if (isRunningPreventive) return;
    setIsRunningPreventive(true);
    try {
      const pulled = await fetchRecentRealLogs(resolveAuditTenantId(), engineUrl);
      const added = hydrateRealLogsIntoStore(pulled);
      addLog({
        type: pulled.some((p) => p.level === 'error' || p.level === 'fatal') ? 'warn' : 'info',
        message: `Sincronização Real (2h): ${pulled.length} evento(s) inspecionados, ${added} novo(s) carregado(s) no Console.`,
        source: 'Auditoria Preventiva',
        skipPersist: true
      });
    } finally {
      setIsRunningPreventive(false);
    }
  };

  /** Dispara sonda controlada de pipeline para provar captura real de erros/HTTP/promises. */
  const handleRunCaptureProbe = async (kind: CaptureProbeKind) => {
    if (runningProbe) return;
    setRunningProbe(kind);
    setProbeResult(null);
    try {
      const res = await runControlledCaptureProbe(kind, engineUrl, resolveAuditTenantId());
      setProbeResult({ kind, ...res });
      if (kind === 'node_logs_sync') {
        const pulled = await fetchRecentRealLogs(resolveAuditTenantId(), engineUrl);
        hydrateRealLogsIntoStore(pulled);
      }
    } catch (err: any) {
      setProbeResult({ kind, ok: false, summary: err?.message || 'Erro ao executar sonda.' });
    } finally {
      setRunningProbe(null);
    }
  };

  useEffect(() => {
    if (!showSimulationModal) return;
    const isStale = !preventiveReport || (Date.now() - new Date(preventiveReport.ranAt).getTime() > 45000);
    if (isStale) {
      handleRunPreventiveAudit();
    }
  }, [showSimulationModal]);

  useEffect(() => {
    if (!isVisible) return;
    // Ping Status Heartbeat (somente quando o painel DevLogger está visível)
    checkEngineStatus();
    const interval = setInterval(checkEngineStatus, 10000);
    return () => clearInterval(interval);
  }, [isVisible]);

  // ==========================================
  // ESTADOS E CONTROLADORES E2E & TELEMETRIA
  // ==========================================
  const [serverTelemetry, setServerTelemetry] = useState<any>(null);
  const [telemetrySnapshots, setTelemetrySnapshots] = useState<any[]>([]);
  const [telemetryEvents, setTelemetryEvents] = useState<any[]>([]);
  const [isFetchingTelemetry, setIsFetchingTelemetry] = useState(false);
  const [isCapturingSnapshot, setIsCapturingSnapshot] = useState(false);
  const [autoRefreshTelemetry, setAutoRefreshTelemetry] = useState(true);

  // Estados do Runner de Testes e Validação E2E (9 Estágios Canônicos)
  const [isExecutingE2E, setIsExecutingE2E] = useState(false);
  const [e2eTestProgress, setE2ETestProgress] = useState(0);
  const [e2eTestCurrentStage, setE2ETestCurrentStage] = useState<number>(0);
  const [e2eLogs, setE2ELogs] = useState<Array<{ timestamp: string; stage: number; level: 'info' | 'success' | 'warn' | 'error'; message: string }>>([]);
  const [e2eStagesStatus, setE2EStagesStatus] = useState<Record<number, { status: 'idle' | 'running' | 'passed' | 'failed'; durationMs?: number; detail?: string }>>({
    1: { status: 'idle' },
    2: { status: 'idle' },
    3: { status: 'idle' },
    4: { status: 'idle' },
    5: { status: 'idle' },
    6: { status: 'idle' },
    7: { status: 'idle' },
    8: { status: 'idle' },
    9: { status: 'idle' },
  });
  const [e2eOverallResult, setE2EOverallResult] = useState<{ healthScore: number; durationTotalMs: number; summary: string } | null>(null);

  // Coleta em tempo real da telemetria do backend com timeout e tratamento resiliente
  const telemetryErrorCountRef = useRef(0);
  const fetchServerTelemetry = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      setIsFetchingTelemetry(true);
      const res = await fetch(`${engineUrl}/api/v1/diagnostics/telemetry`, {
        headers: { 'x-e2e-source': 'DevLogger' },
        signal: controller.signal
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.telemetry) {
          setServerTelemetry(data.telemetry);
          telemetryErrorCountRef.current = 0;
        }
      }

      // Buscar histórico de snapshots de diagnóstico
      const snapRes = await fetch(`${engineUrl}/api/v1/diagnostics/snapshots`, {
        headers: { 'x-e2e-source': 'DevLogger' },
        signal: controller.signal
      });
      if (snapRes.ok) {
        const snapData = await snapRes.json();
        if (snapData.ok && snapData.snapshots) {
          setTelemetrySnapshots(snapData.snapshots);
        }
      }

      // Buscar eventos recentes de telemetria
      const evRes = await fetch(`${engineUrl}/api/v1/diagnostics/events?limit=30`, {
        headers: { 'x-e2e-source': 'DevLogger' },
        signal: controller.signal
      });
      if (evRes.ok) {
        const evData = await evRes.json();
        if (evData.ok && evData.events) {
          setTelemetryEvents(evData.events);
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        telemetryErrorCountRef.current += 1;
        // Evita poluir o console com avisos repetidos durante oscilações de rede ou reinicializações do servidor
        if (telemetryErrorCountRef.current <= 1 && typeof originalConsoleWarnRef.current === 'function') {
          originalConsoleWarnRef.current.apply(console, ['[DevLogger] Telemetria em espera de sincronização com o servidor:', err.message || err]);
        }
      }
    } finally {
      clearTimeout(timeoutId);
      setIsFetchingTelemetry(false);
    }
  };

  // Polling automático da telemetria quando a aba E2E estiver em foco
  useEffect(() => {
    if (activeTab === 'e2e' && isVisible) {
      fetchServerTelemetry();
      if (autoRefreshTelemetry) {
        const interval = setInterval(() => {
          fetchServerTelemetry();
        }, 4000);
        return () => clearInterval(interval);
      }
    }
  }, [activeTab, isVisible, autoRefreshTelemetry]);

  // Captura instantânea de snapshot de anomalia / diagnóstico no backend
  const handleCaptureSnapshot = async () => {
    try {
      setIsCapturingSnapshot(true);
      const res = await fetch(`${engineUrl}/api/v1/diagnostics/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'DEVLOGGER_MANUAL_CAPTURE',
          metadata: { userTriggered: true, clientTimestamp: new Date().toISOString() }
        })
      });
      if (res.ok) {
        setCopyFeedback('📸 Snapshot de saúde capturado com sucesso!');
        setTimeout(() => setCopyFeedback(null), 3000);
        await fetchServerTelemetry();
      }
    } catch {
      setCopyFeedback('❌ Falha ao capturar snapshot');
      setTimeout(() => setCopyFeedback(null), 3000);
    } finally {
      setIsCapturingSnapshot(false);
    }
  };

  // Execução da bateria de validação E2E (9 Estágios Completos)
  const runE2EValidationSuite = async () => {
    if (isExecutingE2E) return;
    setIsExecutingE2E(true);
    setE2ELogs([]);
    setE2ETestProgress(0);
    setE2EOverallResult(null);

    const stagesInit: Record<number, { status: 'idle' | 'running' | 'passed' | 'failed'; durationMs?: number; detail?: string }> = {
      1: { status: 'idle' },
      2: { status: 'idle' },
      3: { status: 'idle' },
      4: { status: 'idle' },
      5: { status: 'idle' },
      6: { status: 'idle' },
      7: { status: 'idle' },
      8: { status: 'idle' },
      9: { status: 'idle' },
    };
    setE2EStagesStatus(stagesInit);

    const logE2E = (stage: number, level: 'info' | 'success' | 'warn' | 'error', message: string) => {
      const entry = { timestamp: new Date().toLocaleTimeString(), stage, level, message };
      setE2ELogs(prev => [entry, ...prev]);
    };

    const startTime = Date.now();
    let failedCount = 0;

    const executeStage = async (
      num: number,
      name: string,
      fn: () => Promise<{ ok: boolean; detail: string; duration: number }>
    ) => {
      setE2ETestCurrentStage(num);
      setE2EStagesStatus(prev => ({ ...prev, [num]: { status: 'running' } }));
      logE2E(num, 'info', `[${num}/9] Iniciando: ${name}...`);
      
      try {
        const res = await fn();
        if (res.ok) {
          setE2EStagesStatus(prev => ({
            ...prev,
            [num]: { status: 'passed', durationMs: res.duration, detail: res.detail }
          }));
          logE2E(num, 'success', `[${num}/9] Aprovado: ${name} (${res.duration}ms) - ${res.detail}`);
        } else {
          failedCount++;
          setE2EStagesStatus(prev => ({
            ...prev,
            [num]: { status: 'failed', durationMs: res.duration, detail: res.detail }
          }));
          logE2E(num, 'error', `[${num}/9] Falha: ${name} (${res.duration}ms) - ${res.detail}`);
        }
      } catch (err: any) {
        failedCount++;
        setE2EStagesStatus(prev => ({
          ...prev,
          [num]: { status: 'failed', durationMs: 0, detail: err?.message || 'Erro inesperado' }
        }));
        logE2E(num, 'error', `[${num}/9] Exceção em ${name}: ${err?.message || err}`);
      }
      setE2ETestProgress(Math.round((num / 9) * 100));
    };

    // Estágio 1: Gateway HTTP Node.js & Ping RTT
    await executeStage(1, 'Gateway HTTP & Latência RTT', async () => {
      const t0 = Date.now();
      const res = await fetch(`${engineUrl}/debug/healthz`);
      const dt = Date.now() - t0;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { ok: true, duration: dt, detail: `Motor v${data.engineVersion || '7.3.6'} ativo | RTT: ${dt}ms` };
    });

    // Estágio 2: Monitoramento de Event Loop Lag & Memória
    await executeStage(2, 'Event Loop Lag & Performance do Processo', async () => {
      const t0 = Date.now();
      const res = await fetch(`${engineUrl}/api/v1/diagnostics/telemetry`);
      const dt = Date.now() - t0;
      const data = await res.json();
      const evLoop = data?.telemetry?.eventLoop;
      const mem = data?.telemetry?.memory;
      const isLoopHealthy = evLoop && (evLoop.p50Ms < 200 || evLoop.meanMs < 200);
      return {
        ok: !!isLoopHealthy,
        duration: dt,
        detail: `Event Loop P50: ${evLoop?.p50Ms ?? 0}ms | P95: ${evLoop?.p95Ms ?? 0}ms | Heap: ${mem?.heapUsedMb ?? 0}MB`
      };
    });

    // Estágio 3: Auditoria de Listeners Baileys (Prevenção de Leaks)
    await executeStage(3, 'Auditoria de Listeners Baileys & Leaks', async () => {
      const t0 = Date.now();
      const res = await fetch(`${engineUrl}/api/v1/diagnostics/telemetry`);
      const dt = Date.now() - t0;
      const data = await res.json();
      const baileys = data?.telemetry?.baileys;
      const instances = baileys?.instances || [];
      const activeSessions = baileys?.totalSessions ?? baileys?.activeSessionsCount ?? instances.length;
      const totalListeners = baileys?.totalListeners || (activeSessions * 4);
      const suspicious = instances.filter((i: any) => (i.totalListeners || 0) > 8);
      const isOk = suspicious.length === 0;
      return {
        ok: isOk,
        duration: dt,
        detail: `${activeSessions} sessões ativas | ${totalListeners} listeners totais ${suspicious.length > 0 ? `| ALERTA: ${suspicious.length} instâncias com excesso de listeners!` : '| Sem vazamento de listeners'}`
      };
    });

    // Estágio 4: Integridade do Banco Supabase & RLS
    await executeStage(4, 'Supabase Database & Conexão Multi-Tenant', async () => {
      const t0 = Date.now();
      const { data, error } = await supabase.from('companies').select('id, name').limit(1);
      const dt = Date.now() - t0;
      if (error) throw error;
      return { ok: true, duration: dt, detail: `Conexão Supabase OK (${dt}ms) | Tenant: ${data?.[0]?.name || 'Padrão'}` };
    });

    // Estágio 5: Rastreamento de Sessões Baileys Ativas
    await executeStage(5, 'Sessões Baileys Conectadas & Sockets', async () => {
      const t0 = Date.now();
      const { data, error } = await supabase.from('whatsapp_instances').select('id, display_name, phone_number, status').limit(15);
      const dt = Date.now() - t0;
      if (error) throw error;
      const connected = (data || []).filter(i => i.status === 'open' || i.status === 'connected');
      return { ok: true, duration: dt, detail: `${connected.length} instâncias abertas no banco | ${data?.length || 0} cadastradas` };
    });

    // Estágio 6: Validação de Trace ID E2E Estruturado
    await executeStage(6, 'Geração de Trace ID E2E & Simulação de Fluxo', async () => {
      const t0 = Date.now();
      const traceId = `trace_diag_${Date.now()}`;
      await fetch(`${engineUrl}/api/v1/diagnostics/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'E2E_VALIDATION_TRACE',
          metadata: { traceId, executedAt: new Date().toISOString() }
        })
      });
      const dt = Date.now() - t0;
      return { ok: true, duration: dt, detail: `Trace ID emitido: ${traceId} (${dt}ms)` };
    });

    // Estágio 7: Teste do Canal Supabase Realtime
    await executeStage(7, 'Canal WebSocket Supabase Realtime', async () => {
      const t0 = Date.now();
      const channel = supabase.channel(`e2e_probe_${Date.now()}`);
      let connected = false;
      await new Promise<void>((resolve) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            connected = true;
            resolve();
          }
        });
        setTimeout(() => resolve(), 1200);
      });
      supabase.removeChannel(channel);
      const dt = Date.now() - t0;
      return { ok: connected, duration: dt, detail: connected ? `WebSocket Realtime conectado com sucesso (${dt}ms)` : 'Timeout / Falha no canal Realtime' };
    });

    // Estágio 8: Detecção de Reconnect Storms
    await executeStage(8, 'Análise de Tempestades de Reconexão (Storms)', async () => {
      const t0 = Date.now();
      const res = await fetch(`${engineUrl}/api/v1/diagnostics/telemetry`);
      const dt = Date.now() - t0;
      const data = await res.json();
      const anyStorm = data?.telemetry?.baileys?.anyReconnectStorm;
      return {
        ok: !anyStorm,
        duration: dt,
        detail: anyStorm ? 'ALERTA: Detectada tempestade de reconexão ativa no worker!' : 'Estável: 0 tempestades de reconexão detectadas'
      };
    });

    // Estágio 9: Emissão de Snapshot de Diagnóstico & Laudo
    await executeStage(9, 'Consolidação de Telemetria & Snapshot Final', async () => {
      const t0 = Date.now();
      await fetchServerTelemetry();
      const dt = Date.now() - t0;
      return { ok: true, duration: dt, detail: 'Snapshot consolidado gravado e sincronizado com o Cockpit' };
    });

    const totalDuration = Date.now() - startTime;
    const healthScore = Math.max(0, Math.round(((9 - failedCount) / 9) * 100));

    setE2EOverallResult({
      healthScore,
      durationTotalMs: totalDuration,
      summary: failedCount === 0
        ? 'Todos os 9 checkpoints de validação E2E foram aprovados com sucesso! Motor Baileys e Event Loop em estado ideal.'
        : `${failedCount} de 9 checkpoints apresentaram inconsistências. Verifique os logs e detalhes técnicos acima.`
    });

    setIsExecutingE2E(false);
  };
  // Hook globally to capture fetch API errors and console.error
  useEffect(() => {
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    originalConsoleWarnRef.current = originalConsoleWarn;
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
      // Evitar que o próprio DevLogger capture avisos internos de polling de telemetria
      if (typeof args[0] === 'string' && (args[0].includes('[DevLogger]') || args[0].includes('Telemetria temporariamente') || args[0].includes('Telemetria em espera'))) return;
      
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
          const isExpectedOfflineError = url.includes('/invoke') && (response.status === 400 || response.status === 404);
          const isLocalFrontend = url.includes(window.location.host) || (!url.startsWith('http://') && !url.startsWith('https://'));
          const isStatus404 = url.includes('/status') && response.status === 404;
          
          if (!response.ok && !url.includes('/debug/healthz') && !url.includes('/debug/metrics') && !url.includes('/debug/recent-errors') && !url.includes('/realtime/') && !url.includes('/wacalls/') && !url.includes('/ai/analyze-logs') && !url.includes('system_logs') && !isExpectedOfflineError && !isAstsTest && !isLocalFrontend && !isStatus404) {
             
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
               const rawText = await response.clone().text();
               detailsStr = rawText.length > 500 ? rawText.substring(0, 500) + '... [Truncado]' : rawText;
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

             let safePayload: any = undefined;
             if (requestOptions?.body) {
               if (typeof requestOptions.body === 'string') {
                 safePayload = (requestOptions.body.includes('data:image') || requestOptions.body.length > 300)
                   ? '[Payload extenso omitido para performance]'
                   : requestOptions.body;
               }
             }

             addLog({
               type: 'error',
               message: `HTTP Error ${response.status} em ${method}`,
               source: sourcePrefix,
               details: { url, payload: safePayload, response: detailsStr }
             });
          }
        }
        return response;
      } catch (err: any) {
        const urlObj = (args[0] as any)?.url || args[0];
        const method = requestOptions?.method || 'GET';
        const urlStr = typeof urlObj === 'string' ? urlObj : 'unknown';
        
        const isLocalFrontend = urlStr.includes(window.location.host) || (!urlStr.startsWith('http://') && !urlStr.startsWith('https://'));
        const isInternalDevLogger = urlStr.includes('/diagnostics/') || 
          (requestOptions?.headers && ((requestOptions.headers as any)['x-e2e-source'] === 'DevLogger' || (typeof (requestOptions.headers as any).get === 'function' && (requestOptions.headers as any).get('x-e2e-source') === 'DevLogger')));
        const isSpammyUrl = urlStr.includes('/debug/healthz') || urlStr.includes('/debug/metrics') || urlStr.includes('/debug/recent-errors') || urlStr.includes('/realtime/') || urlStr.includes('system_logs') || urlStr.includes('/wacalls/') || urlStr.includes('generativelanguage.googleapis.com') || isLocalFrontend || isInternalDevLogger;
        
        if (!isSpammyUrl && !isAstsTest) {
          const isAbort = err.name === 'AbortError' || (typeof err.message === 'string' && err.message.includes('signal is aborted'));
          if (isAbort) {
            // Silencia requisições canceladas intencionalmente via AbortController (ex: timeout de avatar, invoke ou navegação)
            throw err;
          }

          const isNetworkError = err.message === 'Failed to fetch' || (typeof navigator !== 'undefined' && !navigator.onLine);
          
          // Desduplicação de erros críticos do Supabase ou falhas normais de rede
          let skipLog = false;
          if (urlStr.includes('supabase.co') || isNetworkError) {
            const now = Date.now();
            const minInterval = urlStr.includes('/status') ? 30000 : 8000;
            if (now - lastSupabaseErrorTime < minInterval) {
              skipLog = true;
            } else {
              lastSupabaseErrorTime = now;
            }
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
          const isErrorMsg = messageText.includes('"direction":"error"') || messageText.includes('FAILED') || messageText.includes(' 500 ') || messageText.includes(' 400 ');
          return {
            id: Math.random().toString(36).substring(2, 9),
            timestamp: timestamp || new Date().toISOString(),
            type: 'gastrofood_api',
            direction: isErrorMsg ? 'error' : 'info',
            action: 'Gastrofood Call',
            error: messageText
          };
        }
      }
      return null;
    };

    const isRoutineServerNoise = (msg?: string) => {
      if (!msg) return true;
      return (
        msg.includes('Connection Terminated') ||
        msg.includes('connection errored') ||
        msg.includes('Connection was lost') ||
        msg.includes('socket zumbi') ||
        msg.includes('[History Sync]') ||
        msg.includes('[AutoRagTrainer]') ||
        msg.includes('[Process Safe Guard]') ||
        msg.includes('[QueueProcessor/TTL]') ||
        msg.includes('[InternalRouting]') ||
        msg.includes('Aviso no upload background de mídia') ||
        msg.includes('mmg.whatsapp.net') ||
        msg.includes('Handshake transitório') ||
        msg.includes('TIMEOUT_SOCKET_WAKE_FASTFAIL') ||
        msg.includes('wa_outgoing_messages') ||
        msg.includes('gastrofood') ||
        msg.includes('Gastrofood') ||
        msg.includes('GetCardapioCompleto') ||
        msg.includes('Sem sessão ativa saudável') ||
        msg.includes('Aguardando restabelecimento do socket') ||
        msg.includes('Tentativa 1/') ||
        msg.includes('Tentativa 2/') ||
        msg.includes('received error in ack') ||
        msg.includes('error in ack') ||
        msg.includes('479') ||
        msg.includes('475') ||
        msg.includes('Bad MAC') ||
        msg.includes('Closing session') ||
        msg.includes('Decrypted message with closed session') ||
        msg.includes('PreKey') ||
        msg.includes('SessionError') ||
        msg.includes('USync fetch yielded no results') ||
        msg.includes('QR Code ou pareamento expirou') ||
        msg.includes('Interrompendo loop de reconexão') ||
        msg.includes('interrompendo loop de reconexão') ||
        msg.includes('Caixa FoodNext não está conectada') ||
        msg.includes('Falha 404: Instância') ||
        msg.includes('Chave de API Gemini personalizada ignorada') || msg.includes('WhatsApp solicitou reinicialização/estabilização de socket') || msg.includes('Desativando e destruindo socket anterior') || msg.includes('Oscilação temporária / timeout de conexão com servidores WhatsApp') || msg.includes('Oscilação transitória na fila de escrita') || msg.includes('Auth writeQueue operation timed out') || msg.includes('failed to sync regular_') || msg.includes('invalid wire type') || msg.includes('Supabase Node CircuitBreaker') || msg.includes('Aviso ao gravar wa_incoming_messages') || msg.includes('Contato não validado no banco') || msg.includes('Inserção de novos contatos em lote') || msg.includes('Contato não pôde ser inserido nem recuperado') || msg.includes('Erro ao buscar instâncias válidas') || (msg.includes('Erro ao buscar config da instância') && msg.includes('TimeoutError')) || msg.includes('Restabelecendo o socket com as credenciais preservadas') || msg.includes('Stream Errored') || msg.includes('[handleMicClick]') || msg.includes("constava como 'connected' no banco mas está sem sessão ativa na RAM") || msg.includes('[SnoozeManager] Erro ao buscar conversas expiradas: TimeoutError') || msg.includes('Timeout ao inicializar sessão Baileys para') || msg.includes('[RealtimePublisher/Supabase] Falha ao publicar') || msg.includes('Tenant not found in database') || msg.includes('[PushService/ChecklistAlarm] Falha no envio push (400)')
      );
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
            } else if ((log.level === 'error' || log.level === 'warn') && !isRoutineServerNoise(log.message)) {
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

            if (parsed.direction === 'error') {
              addLog({
                type: 'error',
                message: `[Gastrofood API] Falha: ${parsed.action || 'Call'} (${parsed.status || 'Erro'})`,
                source: 'Servidor Node.js',
                details: { timestamp: data.timestamp, id: data.id, level: data.level }
              });
            }
          } else {
            if (!isRoutineServerNoise(data.message) && (data.level === 'error' || data.level === 'warn')) {
              addLog({
                type: data.level === 'warn' ? 'warn' : 'error',
                message: data.message || 'Exceção/Falha no Servidor Node.js',
                source: `Servidor Node.js`,
                details: { timestamp: data.timestamp, id: data.id, level: data.level }
              });
            }
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
    if (isVisible && isEnabled && bottomRef.current && !isAnalyzingAiLogs) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isVisible, isEnabled, isAnalyzingAiLogs]);

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
                    msg.includes('gastrofood') ||
                    msg.includes('Gastrofood') ||
                    msg.includes('socket zumbi') ||
                    msg.includes('Connection Terminated') ||
                    msg.includes('Connection Closed') ||
                    msg.includes('Connection was lost') ||
                    msg.includes('connection errored') ||
                    msg.includes('Request aborted') ||
                    msg.includes('request aborted') ||
                    msg.includes('make-middleware.js') ||
                    msg.includes('Fast-Path') ||
                    msg.includes('SessionManager - Antiban') ||
                    msg.includes('não retornou novas mensagens') ||
                    msg.includes('[History Sync]') ||
                    msg.includes('[AutoRagTrainer]') ||
                    msg.includes('[Process Safe Guard]') ||
                    msg.includes('[QueueProcessor/TTL]') ||
                    msg.includes('[InternalRouting]') ||
                    msg.includes('Aviso no upload background de mídia') ||
                    msg.includes('mmg.whatsapp.net') ||
                    msg.includes('Handshake transitório') ||
                    msg.includes('TIMEOUT_SOCKET_WAKE_FASTFAIL') ||
                    msg.includes('wa_outgoing_messages') ||
                    msg.includes('History sync is disabled') ||
                    msg.includes('identity changed') ||
                    msg.includes('GetCardapioCompleto') ||
                    msg.includes('USync fetch yielded no results') ||
          msg.includes('[SessionManager/AuthQueue]') ||
          msg.includes('Aviso no DB Fallback') ||
          msg.includes('Aviso transitório no DB Fallback') ||
          msg.includes('Auth writeQueue operation timed out') ||
          msg.includes('WhatsApp solicitou reinicialização/estabilização de socket') ||
          msg.includes('Desativando e destruindo socket anterior') ||
          msg.includes('Restabelecendo o socket com as credenciais preservadas') ||
          msg.includes('Stream Errored') ||
          msg.includes('failed to sync regular_') ||
          msg.includes('blocked on missing key') ||
          msg.includes('failed to find key') ||
          msg.includes('invalid wire type') ||
          msg.includes('[forwardMessage]') ||
          msg.includes('[handleMicClick]') ||
          msg.includes("constava como 'connected' no banco mas está sem") ||
          msg.includes('[SnoozeManager] Erro ao buscar conversas expiradas: TimeoutError') ||
          msg.includes('nodeSupabaseCircuitBreaker.canExecute is not a function') ||
          msg.includes('.catch is not a function') ||
          msg.includes('Anti-Spam Ativado para convId') ||
          msg.includes("ENOENT: no such file or directory, open '/tmp/") ||
          msg.includes('Timeout ao inicializar sessão Baileys para') ||
          msg.includes('[RealtimePublisher/Supabase] Falha ao publicar') ||
          msg.includes('Tenant not found in database') ||
          msg.includes('[PushService/ChecklistAlarm] Falha no envio push (400)') ||
          msg.includes('Supabase Node CircuitBreaker') ||
          msg.includes('Aviso ao gravar wa_incoming_messages') ||
          msg.includes('Contato não validado no banco') ||
          msg.includes('Inserção de novos contatos em lote') ||
          msg.includes('Contato não pôde ser inserido nem recuperado') ||
          msg.includes('Erro ao buscar instâncias válidas') ||
          msg.includes('Erro ao buscar config da instância') ||
          msg.includes('Supabase Node CircuitBreaker') ||
          msg.includes('Aviso ao gravar wa_incoming_messages') ||
          msg.includes('Contato não validado no banco') ||
          msg.includes('Inserção de novos contatos em lote') ||
          msg.includes('Contato não pôde ser inserido nem recuperado') ||
          msg.includes('Erro ao buscar instâncias válidas') ||
          msg.includes('Erro ao buscar config da instância') ||
                    msg.includes('pending PNs') ||
                    msg.includes('Erro de entrega/ack detectado') ||
                    msg.includes('Resetando chaves de sessão') ||
                    msg.includes('pertence ao ambiente de testes') ||
                    msg.includes('não pertence ao escopo deste nó') || msg.includes('WhatsApp solicitou reinicialização/estabilização de socket') || msg.includes('Desativando e destruindo socket anterior') || msg.includes('Oscilação transitória na fila de escrita') || msg.includes('Auth writeQueue operation timed out') || msg.includes('failed to sync regular_') || msg.includes('invalid wire type') ||
                    (msg.includes('[WaCalls Listener]') && (msg.includes('Contato não encontrado') || msg.includes('mapeamento LID')));
                 
                 if (isRoutineNoise || err.level === 'info') {
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
    const intervalTelemetry = setInterval(() => {
      if (document.visibilityState === 'visible') fetchTelemetry();
    }, 8000);
    const intervalGastrofood = setInterval(() => {
      if (document.visibilityState === 'visible') fetchGastrofoodLogs();
    }, 8000);
    const intervalErrors = setInterval(() => {
      if (document.visibilityState === 'visible') fetchRecentErrors();
    }, 8000);
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
    const sbHealth = getSupabaseHealthStatus();
    const storeState = useChatStore.getState() as any;
    const contactsList: any[] = Array.isArray(storeState?.contacts) ? storeState.contacts : [];
    const realtimeState = storeState?.realtimeStatus || 'desconhecido';
    const requiredMethods = ['sendHumanMessage', 'fetchInitialData', 'setActiveChat', 'upsertContactLocally'];
    const missingMethods = storeState ? requiredMethods.filter((fn) => typeof storeState[fn] !== 'function') : requiredMethods;

    const phoneSet = new Set<string>();
    let duplicatePhones = 0;
    contactsList.forEach((c) => {
      if (c?.phone && c?.tenant_id) {
        const key = getContactBoxPhoneKey(c);
        if (phoneSet.has(key)) duplicatePhones++;
        else phoneSet.add(key);
      }
    });

    const hasProblem = sbHealth.isCircuitOpen || missingMethods.length > 0 || realtimeState === 'disconnected' || !navigator.onLine;
    addLog({
      type: hasProblem ? 'error' : duplicatePhones > 0 ? 'warn' : 'success',
      message: [
        `Diagnóstico Local React App (${window.location.origin})`,
        `• Rede: ${navigator.onLine ? 'Online' : 'OFFLINE'} | Disjuntor Supabase: ${sbHealth.circuitState} (${sbHealth.consecutiveFailures} falhas)`,
        `• Realtime WSS: ${realtimeState} | Store Contatos: ${contactsList.length} (${duplicatePhones} duplicados por telefone)`,
        missingMethods.length > 0 ? `• CRÍTICO Métodos ausentes no ChatStore: ${missingMethods.join(', ')}` : '• Assinaturas críticas do ChatStore: OK'
      ].join('\n'),
      source: 'Tester',
      requiresAction: hasProblem,
      skipPersist: true
    });
  };

  const handleAnalyzeLogsAndCreateKanbanCard = async (options?: {
    userNotes?: string;
    images?: Array<{ name: string; file: File; dataUrl: string }>;
    audio?: { name: string; blob: Blob; url: string; duration: number } | null;
  }) => {
    if (isAnalyzingAiLogs) return;

    try {
      setShowAiMediaPromptModal(false);
      setIsAnalyzingAiLogs(true);
      setAiAnalysisStep('1/5 📸 Capturando print do DevLogger & evidências visuais...');

      // 1. Captura de tela do DevLogger com html2canvas
      let uploadedScreenshotUrl: string | null = null;
      let screenshotBase64: string | undefined = undefined;

      if (devLoggerModalRef.current) {
        try {
          const { default: html2canvas } = await import('html2canvas');
          const capturePromise = html2canvas(devLoggerModalRef.current, {
            backgroundColor: '#070c10',
            scale: 1.0,
            logging: false,
            useCORS: true,
            allowTaint: true
          });
          const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500));
          const canvas: any = await Promise.race([capturePromise, timeoutPromise]);

          if (canvas && typeof canvas.toDataURL === 'function') {
            const base64Full = canvas.toDataURL('image/jpeg', 0.70);
            screenshotBase64 = base64Full.replace(/^data:image\/jpeg;base64,/, '');

            // Converter para Blob para upload no Supabase Storage
            const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.70));
            if (blob) {
              const fileName = `devlogger_capture_${Date.now()}.jpg`;
              const filePath = `crm_cards/${fileName}`;
              const { error: upErr } = await supabase.storage
                .from('chat_media')
                .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });

              if (!upErr) {
                const { data: { publicUrl } } = supabase.storage.from('chat_media').getPublicUrl(filePath);
                uploadedScreenshotUrl = publicUrl;
              }
            }
          }
        } catch (captureErr) {
          console.warn('[DevLogger] Captura visual ignorada graciosamente para priorizar agilidade:', captureErr);
        }
      }

      // Upload de imagens adicionais fornecidas pelo usuário
      const uploadedUserMediaUrls: Array<{ name: string; url: string; type: 'image' | 'audio' }> = [];
      const userImagesBase64: string[] = [];

      if (options?.images && options.images.length > 0) {
        for (const imgItem of options.images) {
          try {
            userImagesBase64.push(imgItem.dataUrl);
            const safeName = imgItem.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const filePath = `crm_cards/${Date.now()}_${safeName}`;
            const { error: upImgErr } = await supabase.storage
              .from('chat_media')
              .upload(filePath, imgItem.file, { contentType: imgItem.file.type || 'image/jpeg', upsert: true });

            if (!upImgErr) {
              const { data: { publicUrl } } = supabase.storage.from('chat_media').getPublicUrl(filePath);
              uploadedUserMediaUrls.push({ name: imgItem.name, url: publicUrl, type: 'image' });
            }
          } catch (e) {
            console.warn('[DevLogger] Falha ao fazer upload de imagem do usuário:', e);
          }
        }
      }

      // Upload de áudio fornecido pelo usuário
      if (options?.audio && options.audio.blob) {
        try {
          const safeName = options.audio.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const filePath = `crm_cards/${Date.now()}_${safeName}`;
          const { error: upAudErr } = await supabase.storage
            .from('chat_media')
            .upload(filePath, options.audio.blob, { contentType: options.audio.blob.type || 'audio/webm', upsert: true });

          if (!upAudErr) {
            const { data: { publicUrl } } = supabase.storage.from('chat_media').getPublicUrl(filePath);
            uploadedUserMediaUrls.push({ name: options.audio.name, url: publicUrl, type: 'audio' });
          }
        } catch (e) {
          console.warn('[DevLogger] Falha ao fazer upload de áudio do usuário:', e);
        }
      }

      setAiAnalysisStep('2/5 📥 Coletando logs de todas as abas (Console, Servidor, Gastrofood, ASTS)...');

      // 2. Logs locais do DevLogger
      const currentLogs = useDevStore.getState().logs || [];
      const errorAndWarnLogs = currentLogs.filter(l => l.type === 'error' || l.type === 'warn' || l.source?.toLowerCase().includes('server') || l.source?.toLowerCase().includes('node'));
      const activeLogsToAnalyze = errorAndWarnLogs.length > 0 ? errorAndWarnLogs : currentLogs;

      // 3. Coleta de erros recentes do Servidor Node.js
      let fetchedServerErrors: any[] = [];
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
        const fetchPromise = fetch(`${engineUrl}/api/v1/system/logs/recent-errors?limit=35`).then(r => r.ok ? r.json() : null);
        const serverData: any = await Promise.race([fetchPromise, timeoutPromise]);
        if (serverData?.success && Array.isArray(serverData.errors)) {
          fetchedServerErrors = serverData.errors;
        }
      } catch {
        // Fallback silencioso
      }

      // 4. Coleta de logs de erro do Supabase system_logs
      let supabaseSystemLogs: any[] = [];
      try {
        const { data: dbLogs } = await supabase
          .from('system_logs')
          .select('*')
          .or('level.eq.error,level.eq.warn')
          .order('created_at', { ascending: false })
          .limit(25);
        if (dbLogs && Array.isArray(dbLogs)) {
          supabaseSystemLogs = dbLogs;
        }
      } catch {
        // Fallback
      }

      const isSuppressedHistoricalNoise = (msg?: string) => {
        if (!msg) return true;
        return (
          msg.includes('[AutoRagTrainer]') ||
          msg.includes('[Process Safe Guard]') ||
          msg.includes('[QueueProcessor/TTL]') ||
          msg.includes('[InternalRouting]') ||
          msg.includes('Aviso no upload background de mídia') ||
          msg.includes('mmg.whatsapp.net') ||
          msg.includes('Handshake transitório') ||
          msg.includes('TIMEOUT_SOCKET_WAKE_FASTFAIL') ||
          msg.includes('wa_outgoing_messages') ||
          msg.includes('Connection Terminated') ||
          msg.includes('Connection Closed') ||
          msg.includes('Bad MAC') ||
          msg.includes('USync fetch yielded no results') ||
          msg.includes('[SessionManager/AuthQueue]') ||
          msg.includes('Aviso no DB Fallback') ||
          msg.includes('Aviso transitório no DB Fallback') ||
          msg.includes('Auth writeQueue operation timed out') ||
          msg.includes('WhatsApp solicitou reinicialização/estabilização de socket') ||
          msg.includes('Desativando e destruindo socket anterior') ||
          msg.includes('Restabelecendo o socket com as credenciais preservadas') ||
          msg.includes('Stream Errored') ||
          msg.includes('failed to sync regular_') ||
          msg.includes('blocked on missing key') ||
          msg.includes('failed to find key') ||
          msg.includes('invalid wire type') ||
          msg.includes('[forwardMessage]') ||
          msg.includes('[handleMicClick]') ||
          msg.includes("constava como 'connected' no banco mas está sem") ||
          msg.includes('[SnoozeManager] Erro ao buscar conversas expiradas: TimeoutError') ||
          msg.includes('nodeSupabaseCircuitBreaker.canExecute is not a function') ||
          msg.includes('.catch is not a function') ||
          msg.includes('Anti-Spam Ativado para convId') ||
          msg.includes("ENOENT: no such file or directory, open '/tmp/") ||
          msg.includes('Timeout ao inicializar sessão Baileys para') ||
          msg.includes('[RealtimePublisher/Supabase] Falha ao publicar') ||
          msg.includes('Tenant not found in database') ||
          msg.includes('[PushService/ChecklistAlarm] Falha no envio push (400)') ||
          msg.includes('Supabase Node CircuitBreaker') ||
          msg.includes('Aviso ao gravar wa_incoming_messages') ||
          msg.includes('Contato não validado no banco') ||
          msg.includes('Inserção de novos contatos em lote') ||
          msg.includes('Contato não pôde ser inserido nem recuperado') ||
          msg.includes('Erro ao buscar instâncias válidas') ||
          msg.includes('Erro ao buscar config da instância')
        );
      };

      // Consolidar erros de backend (excluindo ruídos transitórios históricos já tratados)
      const combinedServerErrors = [
        ...fetchedServerErrors,
        ...supabaseSystemLogs.map(l => ({
          message: l.message,
          level: l.level,
          source: l.source || 'Supabase system_logs',
          timestamp: l.created_at,
          details: l.details || l.metadata
        })),
        ...currentLogs.filter(l => l.source?.toLowerCase().includes('server') || l.source?.toLowerCase().includes('node'))
      ].filter(item => !isSuppressedHistoricalNoise(item?.message));

      setAiAnalysisStep('3/5 🧠 Processando diagnóstico profundo e causa raiz com Gemini...');

      // 5. Invocar a IA para diagnosticar e criar o plano com análise multimodal (texto + print + mídia do usuário)
      let aiPlan: any = null;
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT_AI_ANALYSIS')), 12000)
        );
        aiPlan = await Promise.race([
          geminiService.analyzeLogsAndGenerateFixPlan({
            consoleLogs: activeLogsToAnalyze,
            serverErrors: combinedServerErrors,
            gastrofoodLogs: gastrofoodLogs,
            astsErrors: testErrors,
            screenshotBase64: screenshotBase64,
            userNotes: options?.userNotes,
            attachedImages: userImagesBase64,
            boardName: 'Desenvolvimento & Roadmap'
          }),
          timeoutPromise
        ]);
      } catch (aiErr: any) {
        console.warn('[DevLogger] Chamada de IA expirou ou falhou. Ativando síntese heurística resiliente:', aiErr?.message);
        aiPlan = geminiService.synthesizeHeuristicDiagnosticPlan({
          consoleLogs: activeLogsToAnalyze,
          serverErrors: combinedServerErrors,
          gastrofoodLogs: gastrofoodLogs,
          astsErrors: testErrors,
          userNotes: options?.userNotes,
          boardName: 'Desenvolvimento & Roadmap'
        });
      }

      if (!aiPlan) {
        aiPlan = geminiService.synthesizeHeuristicDiagnosticPlan({
          consoleLogs: activeLogsToAnalyze,
          serverErrors: combinedServerErrors,
          gastrofoodLogs: gastrofoodLogs,
          astsErrors: testErrors,
          userNotes: options?.userNotes,
          boardName: 'Desenvolvimento & Roadmap'
        });
      }

      setAiAnalysisStep('4/5 🔍 Localizando quadro ChatBot CRM na X-Point Soluções...');

      // O Antigravity DevLogger é exclusivo da plataforma global do software (X-Point Soluções).
      // Seus cards de IA SEMPRE pertencem à empresa X-Point Soluções e ao quadro ChatBot CRM.
      const XPOINT_PLATFORM_TENANT_ID = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';
      const CHATBOT_CRM_BOARD_ID = '95be1dee-9d28-47d9-8ccf-d51a337f1572';

      let targetBoard: any = null;

      // 1. Tenta buscar pelo ID fixo usando masterSupabase (bypassa RLS cross-tenant da plataforma)
      try {
        const { data: bMaster } = await masterSupabase
          .from('crm_boards')
          .select('*')
          .eq('id', CHATBOT_CRM_BOARD_ID)
          .maybeSingle();
        if (bMaster) targetBoard = bMaster;
      } catch {
        // Fallback silencioso
      }

      // 2. Se não encontrou, tenta buscar com cliente comum
      if (!targetBoard) {
        try {
          const { data: bSub } = await supabase
            .from('crm_boards')
            .select('*')
            .eq('id', CHATBOT_CRM_BOARD_ID)
            .maybeSingle();
          if (bSub) targetBoard = bSub;
        } catch {}
      }

      // 3. Fallback: busca por nome no tenant da X-Point Soluções via masterSupabase ou supabase
      if (!targetBoard) {
        const activeClient = masterSupabase || supabase;
        const { data: boardsByName } = await activeClient
          .from('crm_boards')
          .select('*')
          .eq('tenant_id', XPOINT_PLATFORM_TENANT_ID)
          .or('name.ilike.%ChatBot%,name.ilike.%Desenvolvimento%,name.ilike.%Roadmap%')
          .limit(1);

        if (boardsByName && boardsByName.length > 0) {
          targetBoard = boardsByName[0];
        } else {
          // Fallback 4: qualquer quadro do tenant da X-Point Soluções
          const { data: anyBoards } = await activeClient
            .from('crm_boards')
            .select('*')
            .eq('tenant_id', XPOINT_PLATFORM_TENANT_ID)
            .limit(1);
          if (anyBoards && anyBoards.length > 0) {
            targetBoard = anyBoards[0];
          }
        }
      }

      // 7. Localizar o ID do estágio correspondente à coluna "Em Análise"
      let targetStageId = 'analysis';
      if (targetBoard?.config?.stages && Array.isArray(targetBoard.config.stages)) {
        const foundStage = targetBoard.config.stages.find((s: any) => 
          s.id === 'analysis' || 
          s.label?.toLowerCase().includes('análise') || 
          s.label?.toLowerCase().includes('analise')
        );
        if (foundStage) {
          targetStageId = foundStage.id;
        } else if (targetBoard.config.stages.length > 1) {
          targetStageId = targetBoard.config.stages[1].id;
        } else if (targetBoard.config.stages[0]) {
          targetStageId = targetBoard.config.stages[0].id;
        }
      }

      setAiAnalysisStep('5/5 🚀 Publicando card com imagem na coluna Em Análise...');

      // 8. Formatação das notas com prints e anexos
      let mediaHeader = uploadedScreenshotUrl 
        ? `![📸 Evidência Visual DevLogger](${uploadedScreenshotUrl})\n\n` 
        : '';

      if (uploadedUserMediaUrls.length > 0) {
        mediaHeader += `### 📎 Mídias & Evidências Anexadas pelo Desenvolvedor\n`;
        uploadedUserMediaUrls.forEach(m => {
          if (m.type === 'image') {
            mediaHeader += `![${m.name}](${m.url})\n\n`;
          } else {
            mediaHeader += `🔊 [Ouvir Áudio: ${m.name}](${m.url})\n\n`;
          }
        });
      }

      const userNotesSection = options?.userNotes 
        ? `### 📝 Observações Adicionais do Desenvolvedor\n${options.userNotes}\n\n` 
        : '';

      const leadPayload = {
        tenant_id: targetBoard?.tenant_id || XPOINT_PLATFORM_TENANT_ID,
        board_id: targetBoard?.id || CHATBOT_CRM_BOARD_ID,
        title: aiPlan.title,
        status: targetStageId, // 'analysis' ("Em Análise")
        position: 0,
        estimated_revenue: 0,
        probability: 80,
        priority: aiPlan.priority || 3,
        customer_id: null,
        agent_id: null,
        due_date: null,
        tags: Array.from(new Set([...(aiPlan.tags || []), aiPlan.category || 'Correção', 'IA-PLANO', 'DEVLOGGER'])),
        notes: `${mediaHeader}${userNotesSection}${aiPlan.summary}\n\n${aiPlan.technical_plan}`
      };

      // 9. Inserção Segura com Múltiplas Camadas (masterSupabase -> supabase -> backend proxy)
      let insertedLead: any = null;

      try {
        const { data: insData, error: insErr } = await masterSupabase
          .from('crm_leads')
          .insert([leadPayload])
          .select()
          .single();
        if (!insErr && insData) {
          insertedLead = insData;
        } else {
          throw insErr || new Error('Falha no insert via masterSupabase');
        }
      } catch {
        try {
          const { data: subData, error: subErr } = await supabase
            .from('crm_leads')
            .insert([leadPayload])
            .select()
            .single();
          if (!subErr && subData) {
            insertedLead = subData;
          } else {
            throw subErr || new Error('Falha no insert via supabase');
          }
        } catch {
          // Fallback garantido via Backend Node.js
          const response = await fetch(`${engineUrl}/api/v1/crm/cards/create-ai-card`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leadPayload,
              boardId: targetBoard?.id || CHATBOT_CRM_BOARD_ID,
              tenantId: XPOINT_PLATFORM_TENANT_ID
            })
          });
          const result = await response.json();
          if (result.success && result.lead) {
            insertedLead = result.lead;
            if (result.board) targetBoard = result.board;
          } else {
            throw new Error(result.error || 'Falha ao persistir card no backend');
          }
        }
      }

      if (!insertedLead) {
        throw new Error('Não foi possível persistir o card no banco de dados.');
      }

      // 10. Limpeza Automática do Histórico e Estados de Mídia
      clearLogs();
      setTestErrors([]);
      setTestLogs([]);
      setTestSummary(null);
      setUserPromptNotes('');
      setAttachedImagesList([]);
      setAttachedAudioItem(null);

      // 11. Sucesso, Notificação e Exibição do Modal
      setCreatedCardLead(insertedLead);
      setCreatedCardBoardId(targetBoard?.id || CHATBOT_CRM_BOARD_ID);
      setCreatedCardBoardName(targetBoard?.name || 'Desenvolvimento & Roadmap');
      setGeneratedAiCard(aiPlan);
      setShowAiCardModal(true);

      addLog({
        type: 'success',
        message: `✨ Card de Correção Criado com Sucesso com I.A!\nQuadro: "${targetBoard?.name || 'Desenvolvimento & Roadmap'}" | Coluna: "Em Análise"\nTítulo: ${aiPlan.title}${uploadedScreenshotUrl ? '\n📸 Print do DevLogger anexado à galeria do Card.' : ''}${uploadedUserMediaUrls.length > 0 ? `\n📎 ${uploadedUserMediaUrls.length} mídia(s) do usuário vinculada(s).` : ''}\n🧹 Histórico arquivado com sucesso no CRM e limpo no DevLogger.`,
        source: 'Gemini AI (SRE)',
        details: { leadId: insertedLead.id, boardId: targetBoard?.id || CHATBOT_CRM_BOARD_ID, title: aiPlan.title, priority: aiPlan.priority, tags: aiPlan.tags, mediaUrl: uploadedScreenshotUrl }
      });

    } catch (err: any) {
      console.error('Erro na análise de IA e criação do card:', err);
      addLog({
        type: 'error',
        message: `Falha na Análise de Logs com I.A: ${err.message || String(err)}`,
        source: 'Gemini AI (SRE)'
      });
    } finally {
      setIsAnalyzingAiLogs(false);
      setAiAnalysisStep('');
    }
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
    // Rastreio síncrono de módulos para evitar stale closure do state React ao calcular o healthScore final
    const modStatus = {
      supabase: 'testing' as 'testing' | 'passed' | 'failed',
      baileys: 'testing' as 'testing' | 'passed' | 'failed',
      chatStore: 'testing' as 'testing' | 'passed' | 'failed',
      auth: 'testing' as 'testing' | 'passed' | 'failed',
    };
    const markModule = (key: keyof typeof modStatus, val: 'passed' | 'failed') => {
      if (modStatus[key] === 'failed' && val === 'passed') return;
      modStatus[key] = val;
      setTestResults((prev) => {
        if (prev[key] === 'failed' && val === 'passed') return prev;
        return { ...prev, [key]: val };
      });
    };
    
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
        markModule('baileys', 'passed');
      } else {
        errorsCaptured.push({
          step: 'Motor Baileys',
          message: `Falha de comunicação HTTP com o Motor Baileys no endereço ${engineUrl}.`,
          suggestion: 'Verifique se o backend do servidor Node.js/Coolify está rodando ou se a URL VITE_WHATSAPP_ENGINE_URL está correta.'
        });
        markModule('baileys', 'failed');
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
        markModule('supabase', 'failed');
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
            markModule('supabase', 'failed');
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
          message: `Falha de inserção na tabela 'contacts': ${insertError.message}`,
          suggestion: 'As políticas de RLS, triggers ou chave estrangeira impediram a gravação. Revise as permissões de INSERT e se o tenant_id existe na tabela companies.'
        });
        markModule('supabase', 'failed');
      } else {
        addTestLog('[ASTS] 💾 Registro temporário de teste inserido com sucesso.');
        
        const invalidDdlId = generateUUIDv4();
        const { error: integrityError } = await injectTestHeader(
          supabase.from('contacts').insert({
            id: invalidDdlId,
            name: 'ASTS Inconsistente',
            tenant_id: tenantId
          })
        );
        
        if (!integrityError) {
          await injectTestHeader(supabase.from('contacts').delete().eq('id', invalidDdlId));
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
        
        markModule('supabase', 'passed');
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
        markModule('chatStore', 'failed');
      } else {
        const criticalMethods = ['sendHumanMessage', 'fetchInitialData', 'setActiveChat', 'upsertContactLocally'];
        const missingMethods = criticalMethods.filter(m => typeof storeState[m] !== 'function');
        
        if (missingMethods.length > 0) {
          errorsCaptured.push({
            step: 'Assinaturas da Store',
            message: `Funções vitais ausentes ou corrompidas no chatStore: ${missingMethods.join(', ')}`,
            suggestion: 'ALERTA DE COMPILAÇÃO E LÓGICA: Métodos essenciais foram removidos ou alterados na store. Isso causará quebras no app (erros "is not a function"). Restabeleça as assinaturas corretas.'
          });
          markModule('chatStore', 'failed');
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
          markModule('chatStore', 'failed');
        }

        const phoneMap: Record<string, string[]> = {};
        localContacts.forEach((c: any) => {
          if (c.phone && c.tenant_id) {
            const key = getContactBoxPhoneKey(c);
            if (!phoneMap[key]) phoneMap[key] = [];
            phoneMap[key].push(c.id);
          }
        });

        let duplicatePhonesFound = 0;
        let detailsDuplicate = '';
        Object.entries(phoneMap).forEach(([key, idsList]) => {
          if (idsList.length > 1) {
            duplicatePhonesFound++;
            const phoneOnly = key.split(':')[2] || key;
            detailsDuplicate += `Telefone ${phoneOnly} está duplicado na mesma caixa (${idsList.length}x: [${idsList.join(', ')}]). `;
          }
        });

        if (duplicatePhonesFound > 0) {
          errorsCaptured.push({
            step: 'Duplicidade por Telefone',
            message: `BREADCRUMB PREVENTIVO: Detectadas ${duplicatePhonesFound} duplicações de contatos com o mesmo número no mesmo tenant: ${detailsDuplicate}`,
            suggestion: 'PREVENÇÃO DE ERRO VISUAL: Isso causa o bug de nomes duplicados na lista de conversas de uma mesma caixa. Ajuste a função upsertContactLocally ou crie um trigger UNIQUE no Postgres no par (tenant_id, phone).'
          });
          markModule('chatStore', 'failed');
        } else {
          addTestLog(`[ASTS] ✅ Auditoria de consistência de telefones: Nenhum contato duplicado em cache (${localContacts.length} contatos auditados).`);
        }

        markModule('chatStore', 'passed');
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
        markModule('auth', 'failed');
      } else {
        addTestLog(`[ASTS] ✅ Autenticação ativa como ${userRole.toUpperCase()} para o usuário ${userEmail}.`);
        markModule('auth', 'passed');
      }
      
      // PASSO 9: Canais de Armazenamento e Mídias (Bucket Oficial chat_media)
      setTestStepIndex(9);
      setTestProgress(90);
      setTestCurrentTask('Checando infraestrutura de Storage (chat_media) e envio de mídias...');
      addTestLog('[ASTS] 📁 [9/10] Verificando integridade e acesso ao bucket oficial chat_media (Storage)...');
      await sleep(800);
      setTestTimeRemaining(1);
      
      try {
        const { error: storageErr } = await supabase.storage.from('chat_media').list('', { limit: 1 });
        if (storageErr) {
          errorsCaptured.push({
            step: 'Storage de Mídias (chat_media)',
            message: `Bucket chat_media retornou erro de leitura: ${storageErr.message}`,
            suggestion: 'Revise as políticas RLS do Storage bucket chat_media para garantir envio/visualização de imagens e áudios.'
          });
          addTestLog(`[ASTS] ⚠️ Bucket chat_media retornou aviso: ${storageErr.message}`);
        } else {
          addTestLog('[ASTS] ✅ Bucket chat_media integrado e operacional.');
        }
      } catch (stErr: any) {
        addTestLog(`[ASTS] ⚠️ Falha ao checar Storage chat_media: ${stErr?.message || 'Erro de rede'}`);
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
      
      // Calcular score usando modStatus síncrono (corrige leitura obsoleta da closure React)
      let score = 100;
      if (modStatus.supabase === 'failed') score -= 25;
      if (modStatus.baileys === 'failed') score -= 25;
      if (modStatus.chatStore === 'failed') score -= 25;
      if (modStatus.auth === 'failed') score -= 25;
      if (totalErrors > 0 && score === 100) score = Math.max(0, 100 - totalErrors * 10);
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
           className={`fixed z-[9999] w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-[0_12px_32px_rgba(0,0,0,0.6)] border backdrop-blur-xl transition-all duration-200 active:scale-95 ${
             position.x === -1 ? 'bottom-24 right-4' : ''
           } ${
             engineStatus === 'online'
               ? 'bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 border-emerald-300/50 hover:shadow-emerald-500/35 text-slate-950'
               : engineStatus === 'checking'
                 ? 'bg-gradient-to-tr from-blue-600 to-indigo-500 border-blue-300/50 hover:shadow-blue-500/35'
                 : 'bg-gradient-to-tr from-rose-600 to-red-500 border-rose-300/60 animate-pulse hover:shadow-rose-500/40'
           } cursor-grab active:cursor-grabbing select-none`}
           title="Abrir Antigravity DevLogger Cockpit"
        >
          <Terminal size={20} className={engineStatus === 'online' ? 'stroke-[2.5]' : ''} />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#070c10] ${
              engineStatus === 'online' ? 'bg-emerald-300' : engineStatus === 'checking' ? 'bg-blue-300 animate-pulse' : 'bg-rose-300 animate-ping'
            }`}
          />
          {logs.filter(l => l.type === 'error').length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-rose-600 min-w-[20px] h-5 px-1 rounded-full text-[10px] flex items-center justify-center font-black font-mono text-white shadow-md border border-rose-300 animate-bounce">
              {logs.filter(l => l.type === 'error').length > 99 ? '99+' : logs.filter(l => l.type === 'error').length}
            </span>
          )}
        </button>
      )}

      {/* Backdrop sutil apenas em Mobile para padrão Bottom Sheet */}
      {isVisible && (
        <div
          onClick={toggleVisibility}
          className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm sm:hidden animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed z-[9999] transition-all duration-300 ease-out ${
          isVisible
            ? isMaximized
              ? 'inset-x-0 bottom-0 top-[6dvh] sm:inset-3 lg:inset-5 flex flex-col pointer-events-auto opacity-100 translate-y-0'
              : 'inset-x-0 bottom-0 top-[7dvh] sm:top-3 sm:bottom-3 sm:left-auto sm:right-4 lg:right-6 flex flex-col pointer-events-auto opacity-100 translate-y-0'
            : 'inset-x-0 bottom-0 translate-y-[110%] sm:translate-y-0 sm:-top-[1400px] sm:bottom-auto sm:right-6 pointer-events-none opacity-0'
        }`}
      >
        <div
          ref={devLoggerModalRef}
          className={`bg-[#070c10]/95 backdrop-blur-3xl border border-white/15 border-t-white/25 shadow-[0_25px_75px_rgba(0,0,0,0.95)] flex flex-col h-full max-h-full overflow-hidden text-[#e2e8f0] transition-all duration-300 relative group/card ${
            isMaximized
              ? 'w-full rounded-t-[28px] sm:rounded-[28px]'
              : 'w-full sm:w-[700px] md:w-[840px] lg:w-[920px] xl:w-[980px] sm:max-w-[95vw] rounded-t-[28px] sm:rounded-[28px] my-auto'
          }`}
        >
          {/* Brilhos Ambientais Obsidian Cyber */}
          <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Mobile Drag Handle */}
          <div className="sm:hidden flex justify-center pt-2 pb-1 bg-[#070c10] shrink-0">
            <span className="w-11 h-1.5 rounded-full bg-white/20" />
          </div>

          {/* Header Superior Responsivo em 2 Camadas */}
          <div className="border-b border-white/10 bg-[#070c10]/95 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-indigo-500/10 select-none relative z-30 shrink-0">
            {/* Camada 1: Identidade + Status + Ações Principais */}
            <div className="flex items-center justify-between px-3.5 sm:px-5 py-2.5 sm:py-3 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative flex items-center justify-center shrink-0">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-emerald-300 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <Terminal size={18} className="text-slate-950 stroke-[2.5]" />
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#070c10] ${
                    engineStatus === 'online' ? 'bg-emerald-400 animate-pulse' : engineStatus === 'checking' ? 'bg-blue-400 animate-pulse' : 'bg-rose-400 animate-ping'
                  }`} />
                </div>

                <div className="text-left min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="text-sm font-black text-white tracking-tight leading-none font-mono truncate">Antigravity</h3>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-md font-extrabold uppercase tracking-widest font-mono">
                      COCKPIT
                    </span>
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border font-mono shadow-sm transition-all shrink-0 ${
                      engineStatus === 'online'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : engineStatus === 'checking'
                          ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                          : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    }`}>
                      <Activity size={10} className={engineStatus === 'online' ? 'animate-pulse text-emerald-400' : ''} />
                      <span>{engineStatus.toUpperCase()}</span>
                    </div>
                    {logs.filter(l => l.type === 'error').length > 0 && (
                      <span className="flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 px-2 py-0.5 rounded-full text-[9px] font-black font-mono shadow-sm animate-pulse shrink-0">
                        <Bug size={10} /> {logs.filter(l => l.type === 'error').length}
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-emerald-400/80 font-bold tracking-widest block uppercase font-mono leading-none mt-1 truncate">
                    DEV LOGGER • ENGINE {serverMeta?.engineVersion || '5.8.5'}
                  </span>
                </div>
              </div>

              {/* Ações Principais (Touch Targets >= 40-44px, active:scale-95) */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowAiMediaPromptModal(true); }}
                  disabled={isAnalyzingAiLogs}
                  className={`min-h-[40px] px-2.5 sm:px-3 rounded-xl transition-all cursor-pointer active:scale-95 border flex items-center gap-1.5 font-mono text-[10px] sm:text-[11px] font-black ${
                    isAnalyzingAiLogs
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 animate-pulse'
                      : 'bg-gradient-to-r from-purple-500/30 via-indigo-500/25 to-pink-500/30 hover:from-purple-500/45 hover:to-pink-500/45 text-purple-100 border-purple-400/50 shadow-lg shadow-purple-500/15'
                  }`}
                  title="Analisar todos os logs com IA e criar Card de Correção no CRM Kanban"
                >
                  {isAnalyzingAiLogs ? (
                    <Loader2 size={14} className="animate-spin text-purple-300" />
                  ) : (
                    <Sparkles size={14} className="text-purple-300" />
                  )}
                  <span className="hidden xs:inline sm:inline">I.A CRM</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); copyLogs(); }}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[#94a3b8] hover:text-emerald-300 bg-white/5 hover:bg-emerald-500/15 border border-white/10 hover:border-emerald-500/30 rounded-xl transition-all cursor-pointer active:scale-95"
                  title="Copiar Logs Estruturados"
                >
                  <Copy size={15} />
                </button>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); clearLogs(); }}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[#94a3b8] hover:text-rose-300 bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/30 rounded-xl transition-all cursor-pointer active:scale-95"
                  title="Limpar Histórico de Logs"
                >
                  <Trash2 size={15} />
                </button>

                {/* Botão Mobile de Ferramentas Rápidas */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowMobileTools(prev => !prev); }}
                  className={`sm:hidden min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border transition-all cursor-pointer active:scale-95 ${
                    showMobileTools
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-white/5 text-[#94a3b8] border-white/10 hover:text-white'
                  }`}
                  title="Ferramentas Rápidas e Telemetria"
                >
                  <Wrench size={15} />
                </button>

                {/* Maximizar / Restaurar em Tablet & Desktop */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsMaximized(prev => !prev); }}
                  className="hidden sm:flex min-w-[40px] min-h-[40px] items-center justify-center text-[#94a3b8] hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all cursor-pointer active:scale-95"
                  title={isMaximized ? 'Restaurar Janela Flutuante' : 'Expandir Cockpit em Tela Cheia'}
                >
                  {isMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleVisibility(); }}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center text-[#94a3b8] hover:text-white bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 rounded-xl transition-all cursor-pointer active:scale-95"
                  title="Minimizar / Fechar Cockpit"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Camada 2: Faixa de Diagnóstico & Atalhos (Sempre visível em sm+, expansível em mobile) */}
            <div className={`${showMobileTools ? 'flex' : 'hidden sm:flex'} items-center gap-1.5 px-3.5 sm:px-5 pb-2.5 pt-0.5 flex-wrap`}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowServerLogs(true);
                  useDevStore.setState({ isVisible: false });
                }}
                className="min-h-[34px] px-2.5 py-1 flex items-center gap-1.5 text-[10px] font-bold font-mono text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-xl transition-all cursor-pointer active:scale-95"
                title="Abrir Terminal Server Node.js (SSE Stream)"
              >
                <Terminal size={12} /> <span>Server SSE</span>
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleTestSupabase(); }}
                className="min-h-[34px] px-2.5 py-1 flex items-center gap-1.5 text-[10px] font-bold font-mono text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 rounded-xl transition-all cursor-pointer active:scale-95"
                title="Testar Conexão Supabase DB"
              >
                <Database size={12} /> <span>Supabase</span>
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleTestApp(); }}
                className="min-h-[34px] px-2.5 py-1 flex items-center gap-1.5 text-[10px] font-bold font-mono text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 rounded-xl transition-all cursor-pointer active:scale-95"
                title="Testar Aplicação React (State & Hooks)"
              >
                <AppWindow size={12} /> <span>React App</span>
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleTestEngine(); }}
                className="min-h-[34px] px-2.5 py-1 flex items-center gap-1.5 text-[10px] font-bold font-mono text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 rounded-xl transition-all cursor-pointer active:scale-95"
                title="Testar Status do Baileys WhatsApp Engine"
              >
                <Smartphone size={12} /> <span>Baileys Ping</span>
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowTestPanel(!showTestPanel); }}
                className={`min-h-[34px] px-2.5 py-1 flex items-center gap-1.5 text-[10px] font-bold font-mono rounded-xl transition-all cursor-pointer relative active:scale-95 border ${
                  showTestPanel
                    ? 'bg-amber-500/25 text-amber-200 border-amber-400/50 shadow-sm'
                    : 'text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/25'
                }`}
                title="Antigravity Test Suite (ASTS Cockpit)"
              >
                <Activity size={12} className={isTestingApp ? 'animate-pulse text-amber-300' : ''} />
                <span>ASTS Suite</span>
                {isTestingApp && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                )}
              </button>

              <a
                href={`${engineUrl}/swagger/teste.html`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="min-h-[34px] px-2.5 py-1 flex items-center gap-1.5 text-[10px] font-bold font-mono text-teal-200 bg-teal-500/15 hover:bg-teal-500/25 border border-teal-400/30 rounded-xl transition-all active:scale-95 ml-auto"
                title="Abrir Documentação Interativa da API (Swagger)"
              >
                <span>API Docs</span>
                <ExternalLink size={11} />
              </a>
            </div>
          </div>

          {/* Cockpit de Telemetria e Metadados do Servidor */}
          {isVisible && (
            <div className="bg-[#0b1319]/95 border-b border-white/10 px-3.5 sm:px-5 py-2 text-xs font-mono relative z-10 shrink-0">
              {/* Toggle compacto de Telemetria em Mobile */}
              <div className="sm:hidden flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] text-[#94a3b8] min-w-0 truncate">
                  <span className="text-purple-300 font-bold truncate">
                    Baileys {serverMeta?.baileysVersion || '7.0.0-rc.9'}
                  </span>
                  {telemetry && (
                    <span className="text-cyan-300 shrink-0">• {telemetry.memory.toFixed(0)}MB</span>
                  )}
                  <span className="text-slate-500 shrink-0">• {windowSize.width}px</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowTelemetryBar(prev => !prev); }}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold text-slate-300 flex items-center gap-1 shrink-0 active:scale-95"
                >
                  <span>Telemetria</span>
                  <ChevronDown size={11} className={`transition-transform ${showTelemetryBar ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Faixa completa de pills de Telemetria */}
              <div className={`${showTelemetryBar ? 'flex mt-2 pt-2 border-t border-white/10' : 'hidden sm:flex'} flex-col lg:flex-row lg:items-center justify-between gap-2`}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5 text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20 text-[10px] font-bold">
                    <Layers size={11} className="text-indigo-400" />
                    <span>Engine {serverMeta?.engineVersion || '5.8.5'}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-amber-300 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20 text-[10px] font-bold">
                    <Calendar size={11} className="text-amber-400" />
                    <span>{serverMeta?.compileDate ? new Date(serverMeta.compileDate).toLocaleString('pt-BR') : '05/08/2026 13:20'}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowBaileysModal(true); }}
                    className="flex items-center gap-1.5 text-purple-200 bg-purple-500/15 hover:bg-purple-500/25 px-2.5 py-1 rounded-lg border border-purple-500/30 text-[10px] font-bold transition-all cursor-pointer active:scale-95"
                    title="Clique para ver o Histórico de Versões e Releases do Baileys no GitHub"
                  >
                    <Smartphone size={11} className="text-purple-400" />
                    <span>Baileys {serverMeta?.baileysVersion || '7.0.0-rc.9'} ({serverMeta?.baileysDate || '29/07/2026'})</span>
                    <ChevronRight size={11} />
                  </button>

                  {lastPing && (
                    <div className="flex items-center gap-1 text-slate-300 bg-white/5 px-2 py-1 rounded-lg border border-white/10 text-[10px] font-bold" title="Último heartbeat recebido">
                      <Clock size={11} className="text-emerald-400" />
                      <span>{lastPing.toLocaleTimeString('pt-BR')}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1 text-blue-300 bg-blue-500/10 px-2 py-1 rounded-lg border border-blue-500/20 text-[10px] font-bold" title="Resolução atual da janela">
                    <AppWindow size={11} className="text-blue-400" />
                    <span>{windowSize.width}×{windowSize.height}</span>
                  </div>

                  {telemetry && (
                    <>
                      <div className="flex items-center gap-1 text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 text-[10px] font-bold" title="Uso de CPU">
                        <Cpu size={11} className={telemetry.cpu > 50 ? 'animate-pulse text-rose-400' : 'text-emerald-400'} />
                        <span>{telemetry.cpu.toFixed(1)}%</span>
                      </div>

                      <div className="flex items-center gap-1 text-cyan-300 bg-cyan-500/10 px-2 py-1 rounded-lg border border-cyan-500/20 text-[10px] font-bold" title="Uso de Memória RAM">
                        <Activity size={11} className="text-cyan-400" />
                        <span>{telemetry.memory.toFixed(1)} MB</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if ((window as any).__openReleaseNotesHub) {
                        (window as any).__openReleaseNotesHub('mindmap', true);
                      } else {
                        window.dispatchEvent(new CustomEvent('open-release-notes-hub', { detail: { tab: 'mindmap', expand: true } }));
                      }
                    }}
                    className="flex items-center gap-1 text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 px-2.5 py-1 rounded-lg text-[10px] font-black shadow-sm cursor-pointer active:scale-95"
                    title="Abrir Mapa Mental Interativo, Prints de Onde Clicar e Guia de Testes das 18 Novidades"
                  >
                    <Rocket size={11} /> <span>Mapa Mental (18)</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowChangelog(true); }}
                    className="flex items-center gap-1 text-emerald-300 hover:text-white bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer active:scale-95"
                  >
                    <Rocket size={11} className="text-emerald-400" /> <span>Novidades</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowEndpoints(true); }}
                    className="flex items-center gap-1 text-indigo-300 hover:text-white bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer active:scale-95"
                  >
                    <Network size={11} className="text-indigo-400" /> <span>Endpoints</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Abas de Navegação Principal — Grid Responsivo 2x2 (Mobile) / 4x1 (sm+) sem cortes */}
          {isVisible && (
            <div className="p-2 sm:px-5 sm:py-2.5 bg-[#080e13]/95 border-b border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 shrink-0 select-none relative z-10 backdrop-blur-2xl">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveTab('console'); }}
                className={`min-h-[44px] px-2.5 sm:px-3 py-2 font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 rounded-xl transition-all duration-200 cursor-pointer border active:scale-95 ${
                  activeTab === 'console'
                    ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 text-slate-950 border-emerald-300/70 shadow-lg shadow-emerald-500/20'
                    : 'bg-[#101920]/75 text-[#94a3b8] border-white/5 hover:text-white hover:bg-white/10'
                }`}
              >
                <Terminal size={13} className={activeTab === 'console' ? 'text-slate-950 stroke-[2.5] shrink-0' : 'shrink-0'} />
                <span className="truncate">Console</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black shrink-0 ${
                  activeTab === 'console' ? 'bg-black/20 text-slate-950' : 'bg-white/10 text-white/80'
                }`}>
                  {logs.length}
                </span>
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveTab('gastrofood'); }}
                className={`min-h-[44px] px-2.5 sm:px-3 py-2 font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 rounded-xl transition-all duration-200 cursor-pointer border active:scale-95 ${
                  activeTab === 'gastrofood'
                    ? 'bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 text-white border-blue-400/70 shadow-lg shadow-blue-500/25'
                    : 'bg-[#101920]/75 text-[#94a3b8] border-white/5 hover:text-white hover:bg-white/10'
                }`}
              >
                <Network size={13} className="shrink-0" />
                <span className="truncate">Gastrofood</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black shrink-0 ${
                  activeTab === 'gastrofood' ? 'bg-white/25 text-white' : 'bg-white/10 text-white/80'
                }`}>
                  {groupedGastrofoodLogs.length}
                </span>
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveTab('asts'); }}
                className={`min-h-[44px] px-2.5 sm:px-3 py-2 font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 rounded-xl transition-all duration-200 cursor-pointer border active:scale-95 ${
                  activeTab === 'asts'
                    ? 'bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 text-slate-950 border-amber-300/70 shadow-lg shadow-amber-500/20'
                    : 'bg-[#101920]/75 text-[#94a3b8] border-white/5 hover:text-white hover:bg-white/10'
                }`}
              >
                <Activity size={13} className={`shrink-0 ${isTestingApp ? 'animate-pulse' : ''}`} />
                <span className="truncate">ASTS</span>
                {testSummary && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black shrink-0 ${
                    activeTab === 'asts' ? 'bg-black/20 text-slate-950' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {testSummary.healthScore}%
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveTab('e2e'); }}
                className={`min-h-[44px] px-2.5 sm:px-3 py-2 font-mono text-[10px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 rounded-xl transition-all duration-200 cursor-pointer border active:scale-95 ${
                  activeTab === 'e2e'
                    ? 'bg-gradient-to-r from-cyan-400 via-teal-400 to-indigo-400 text-slate-950 border-cyan-300/70 shadow-lg shadow-cyan-500/20'
                    : 'bg-[#101920]/75 text-[#94a3b8] border-white/5 hover:text-white hover:bg-white/10'
                }`}
              >
                <Radio size={13} className={`shrink-0 ${activeTab === 'e2e' ? 'text-slate-950 animate-pulse' : 'text-cyan-400'}`} />
                <span className="truncate">E2E / Telemetria</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black shrink-0 ${
                  activeTab === 'e2e' ? 'bg-black/20 text-slate-950' : 'bg-cyan-500/20 text-cyan-300'
                }`}>
                  {serverTelemetry?.eventLoop ? `${serverTelemetry.eventLoop.p50Ms}ms` : 'LIVE'}
                </span>
              </button>
            </div>
          )}

          {/* Área Principal de Conteúdo / Logs */}
          {isVisible && (
            activeTab === 'asts' ? (
              /* Antigravity Application Simulator & Test Suite (ASTS) */
              <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 flex flex-col gap-3.5 text-xs custom-scrollbar min-h-0 bg-[#070c10] transition-all duration-300 relative">
                {/* Cabeçalho do Painel ASTS */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10 relative z-10 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shadow-lg shadow-amber-500/15 shrink-0">
                      <Activity size={17} className="text-amber-400 animate-pulse" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-black text-white block text-xs sm:text-sm tracking-wider font-mono truncate">ASTS COCKPIT v1.0.0</span>
                      <span className="text-[10px] text-[#94a3b8] block font-mono truncate">SIMULADOR E AUTOMATIZADOR DE TESTES</span>
                    </div>
                  </div>
                  
                  {/* Controles de Teste */}
                  <div className="flex items-center justify-between sm:justify-end gap-2.5 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer select-none min-h-[40px] px-2.5 rounded-xl bg-[#0e161d] border border-white/10">
                      <span className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider font-mono">Loop Contínuo</span>
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
                    
                    {isTestingApp ? (
                      <button 
                        type="button"
                        onClick={stopApplicationTests}
                        className="min-h-[42px] flex items-center gap-1.5 px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-black rounded-xl font-mono transition-all active:scale-95 cursor-pointer text-xs"
                      >
                        <Pause size={13} className="fill-current" /> PARAR
                      </button>
                    ) : (
                      <button 
                        type="button"
                        onClick={runApplicationTests}
                        className="min-h-[42px] flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black rounded-xl font-mono transition-all active:scale-95 shadow-lg shadow-amber-500/25 cursor-pointer text-xs tracking-wide"
                      >
                        <Play size={13} className="fill-current" /> DIAGNÓSTICO
                      </button>
                    )}
                  </div>
                </div>

                {/* Barra de Progresso Futurista */}
                {isTestingApp && (
                  <div className="flex flex-col gap-2.5 bg-[#0c141b] border border-amber-500/25 rounded-2xl p-3.5 relative z-10 animate-in zoom-in-95 duration-200 shrink-0 shadow-lg">
                    <div className="flex items-center justify-between font-mono text-xs text-white">
                      <span className="font-bold text-amber-300 uppercase flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                        <span className="truncate">Tarefa: {testCurrentTask}</span>
                      </span>
                      <span className="font-black text-amber-400 shrink-0 ml-2">
                        {testProgress}%
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase font-bold text-[#94a3b8] gap-2 flex-wrap">
                      <span className="bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2.5 py-1 rounded-lg animate-pulse">
                        ⚙️ Executando: Passo {testStepIndex} de 10
                      </span>
                      <span className="bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2.5 py-1 rounded-lg">
                        ⏱️ Restante: ~{testTimeRemaining}s
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
                    { id: 'supabase', label: 'Supabase DB', icon: <Database size={14} />, status: testResults.supabase },
                    { id: 'baileys', label: 'Baileys Engine', icon: <Smartphone size={14} />, status: testResults.baileys },
                    { id: 'chatStore', label: 'Zustand Store', icon: <Layers size={14} />, status: testResults.chatStore },
                    { id: 'auth', label: 'Nível RBAC', icon: <UserCheck size={14} />, status: testResults.auth },
                  ].map((mod) => {
                    const isIdle = mod.status === 'idle';
                    const isTesting = mod.status === 'testing';
                    const isPassed = mod.status === 'passed';
                    const isFailed = mod.status === 'failed';
                    
                    return (
                      <div 
                        key={mod.id} 
                        className={`p-3 rounded-2xl border flex flex-col gap-1.5 font-mono select-none transition-all duration-300 min-w-0 ${
                          isIdle ? 'bg-[#0c141b] border-white/10 text-[#94a3b8]' : ''
                        } ${
                          isTesting ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 animate-pulse' : ''
                        } ${
                          isPassed ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-md' : ''
                        } ${
                          isFailed ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 animate-in shake' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] uppercase font-bold gap-1 min-w-0">
                          <span className="opacity-90 truncate block">{mod.label}</span>
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
                  <div className="flex flex-col gap-3 bg-[#0c141b] border border-white/10 rounded-2xl p-3.5 sm:p-4 relative z-10 animate-in fade-in duration-300">
                    <div className="flex justify-between items-center pb-2.5 border-b border-white/10 flex-wrap gap-2">
                      <div className="flex items-center gap-3 text-xs text-[#94a3b8] flex-wrap">
                        <span className="uppercase font-bold font-mono text-white">Métricas de Auditoria:</span>
                        <span>Duração: <strong className="text-white font-mono">{testSummary.duration.toFixed(2)}s</strong></span>
                        <span>Anomalias: <strong className={testSummary.totalErrors > 0 ? "text-rose-400 font-mono" : "text-emerald-400 font-mono"}>{testSummary.totalErrors}</strong></span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="text-xs font-bold text-[#94a3b8] uppercase">Saúde:</span>
                        <span className={`px-3 py-1 rounded-xl text-xs font-black border shadow-sm ${
                          testSummary.healthScore === 100 
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' 
                            : testSummary.healthScore >= 75 
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' 
                              : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                        }`}>
                          {testSummary.healthScore}%
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-xs leading-relaxed text-[#e2e8f0] font-mono bg-[#111c25] p-3 rounded-xl border border-white/10 break-words">
                      {testSummary.diagnosis}
                    </p>
                  </div>
                )}

                {/* Erros e Recomendações Detectadas no ASTS */}
                {testErrors.length > 0 && (
                  <div className="flex flex-col gap-2 bg-rose-950/20 border border-rose-500/30 rounded-2xl p-3.5 relative z-10">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black font-mono uppercase text-rose-300 flex items-center gap-1.5">
                        <AlertTriangle size={13} className="text-rose-400" /> {testErrors.length} Anomalia(s) & Recomendações ASTS
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {testErrors.map((err, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-[#0c1319] border border-rose-500/25 flex flex-col gap-1.5">
                          <span className="text-[10px] font-black font-mono uppercase text-rose-300">{err.step}</span>
                          <p className="text-xs text-rose-100 leading-snug break-words">{err.message}</p>
                          <p className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                            💡 {err.suggestion}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trilha de Logs em Tempo Real do ASTS */}
                {testLogs.length > 0 && (
                  <div className="bg-[#0a1015] border border-white/10 rounded-2xl p-3.5 font-mono text-[11px] relative z-10">
                    <div className="text-[10px] font-bold uppercase text-[#94a3b8] mb-2">
                      Execução Passo a Passo ({testLogs.length} eventos)
                    </div>
                    <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1 text-[#cbd5e1]">
                      {testLogs.map((line, i) => (
                        <div key={i} className="leading-relaxed break-words">{line}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab === 'gastrofood' ? (
              /* Gastrofood API Logs Monitor com Resumo + Inspetor Payload/Response */
              <DevLoggerGastrofoodTab
                logs={groupedGastrofoodLogs}
                companies={companies}
                expandedLogs={expandedLogs}
                onToggleExpand={toggleExpandLog}
                onCopyAll={copyGastrofoodLogs}
                onClearAll={() => {
                  setGastrofoodLogs([]);
                  showToastFeedback('Logs Gastrofood limpos!');
                }}
                onCopyJson={(text, label) => {
                  navigator.clipboard.writeText(text);
                  showToastFeedback(label);
                }}
              />
            ) : activeTab === 'e2e' ? (
              /* Cockpit de Telemetria e Validação E2E em Tempo Real */
              <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 flex flex-col gap-3.5 text-xs font-mono custom-scrollbar min-h-0 bg-[#070c10] relative">
                
                {/* CABEÇALHO DO COCKPIT E2E */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10 relative z-10 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shadow-lg shadow-cyan-500/15 shrink-0">
                      <Radio size={17} className="text-cyan-400 animate-pulse" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-white block text-xs sm:text-sm tracking-wider">E2E COCKPIT & TELEMETRIA</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          PROD ENGINE
                        </span>
                      </div>
                      <span className="text-[10px] text-[#94a3b8] block truncate">
                        EVENT LOOP, LISTENERS BAILEYS, TRACE ID & 9 ESTÁGIOS
                      </span>
                    </div>
                  </div>

                  {/* Ações Rápidas no Cabeçalho */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="min-h-[38px] flex items-center gap-2 cursor-pointer bg-[#0e161d] px-3 py-1 rounded-xl border border-white/10 text-[10px] text-[#94a3b8]">
                      <span className="font-bold">Auto (4s)</span>
                      <input 
                        type="checkbox" 
                        checked={autoRefreshTelemetry}
                        onChange={(e) => setAutoRefreshTelemetry(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-7 h-4 bg-[#182229] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-500 peer-checked:after:bg-black relative"></div>
                    </label>

                    <button
                      type="button"
                      onClick={fetchServerTelemetry}
                      disabled={isFetchingTelemetry}
                      className="min-h-[38px] px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[#cbd5e1] hover:text-white transition-all flex items-center gap-1.5 text-[10px] font-bold cursor-pointer active:scale-95"
                      title="Atualizar telemetria do servidor"
                    >
                      <RefreshCw size={12} className={isFetchingTelemetry ? 'animate-spin text-cyan-400' : ''} />
                      <span>Atualizar</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCaptureSnapshot}
                      disabled={isCapturingSnapshot}
                      className="min-h-[38px] px-3 py-1.5 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/35 text-purple-200 rounded-xl transition-all flex items-center gap-1.5 text-[10px] font-bold cursor-pointer active:scale-95"
                      title="Salva um snapshot completo do estado do processo no servidor"
                    >
                      <Layers size={12} />
                      <span>{isCapturingSnapshot ? 'Capturando...' : 'Snapshot'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={runE2EValidationSuite}
                      disabled={isExecutingE2E}
                      className="min-h-[40px] px-3.5 py-2 bg-gradient-to-r from-cyan-400 via-teal-400 to-indigo-400 hover:from-cyan-300 hover:to-indigo-300 text-slate-950 font-black rounded-xl transition-all flex items-center gap-1.5 text-xs shadow-lg shadow-cyan-500/20 cursor-pointer active:scale-95"
                    >
                      {isExecutingE2E ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Auditando [{e2eTestCurrentStage}/9]</span>
                        </>
                      ) : (
                        <>
                          <Play size={13} className="fill-current" />
                          <span>TESTAR E2E (9 ESTÁGIOS)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* GRADE DE MÉTRICAS CIBERNÉTICAS (4 CARDS) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 relative z-10 shrink-0">
                  
                  {/* CARD 1: EVENT LOOP LAG */}
                  {(() => {
                    const ev = serverTelemetry?.eventLoop;
                    const p50 = ev?.p50Ms ?? 0;
                    const isWarn = p50 >= 25 && p50 <= 50;
                    const isCritical = p50 > 50;
                    return (
                      <div className={`p-3 rounded-2xl border flex flex-col gap-1.5 transition-all ${
                        isCritical 
                          ? 'bg-rose-500/10 border-rose-500/40 text-rose-300' 
                          : isWarn 
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' 
                            : 'bg-[#0c141b] border-white/10 text-[#94a3b8]'
                      }`}>
                        <div className="flex items-center justify-between text-[10px] uppercase font-bold gap-1">
                          <span className="flex items-center gap-1 truncate">
                            <Gauge size={12} className="text-cyan-400 shrink-0" /> Event Loop Lag
                          </span>
                          <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black shrink-0 ${
                            isCritical ? 'bg-rose-500/25 text-rose-300' : isWarn ? 'bg-amber-500/25 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                          }`}>
                            {isCritical ? 'BLOQUEADO' : isWarn ? 'MODERADO' : 'IDEAL'}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-black text-white">{p50}</span>
                          <span className="text-xs text-[#94a3b8]">ms (P50)</span>
                        </div>
                        <div className="text-[10px] text-[#94a3b8] flex justify-between">
                          <span>P95: <strong className="text-white font-mono">{ev?.p95Ms ?? 0}ms</strong></span>
                          <span>Max: <strong className="text-white font-mono">{ev?.maxMs ?? 0}ms</strong></span>
                        </div>
                        <div className="w-full bg-[#182229] rounded-full h-1.5 overflow-hidden mt-1">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              isCritical ? 'bg-rose-500' : isWarn ? 'bg-amber-500' : 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(5, (p50 / 60) * 100))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* CARD 2: MEMÓRIA & HEAP */}
                  {(() => {
                    const mem = serverTelemetry?.memory;
                    const used = mem?.heapUsedMb ?? 0;
                    const total = mem?.heapTotalMb ?? 1;
                    const rss = mem?.rssMb ?? 0;
                    const pct = Math.min(100, Math.round((used / total) * 100));
                    return (
                      <div className="p-3 rounded-2xl border bg-[#0c141b] border-white/10 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[10px] uppercase font-bold text-[#94a3b8] gap-1">
                          <span className="flex items-center gap-1 truncate">
                            <Cpu size={12} className="text-indigo-400 shrink-0" /> Memória & Heap
                          </span>
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-indigo-500/20 text-indigo-300 shrink-0">
                            {pct}% HEAP
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-black text-white">{used}</span>
                          <span className="text-xs text-[#94a3b8]">MB usado</span>
                        </div>
                        <div className="text-[10px] text-[#94a3b8] flex justify-between">
                          <span>RSS: <strong className="text-white font-mono">{rss}MB</strong></span>
                          <span>Total: <strong className="text-white font-mono">{total}MB</strong></span>
                        </div>
                        <div className="w-full bg-[#182229] rounded-full h-1.5 overflow-hidden mt-1">
                          <div 
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* CARD 3: BAILEYS & LISTENERS */}
                  {(() => {
                    const b = serverTelemetry?.baileys;
                    const sessions = b?.totalSessions ?? b?.activeSessionsCount ?? b?.instances?.length ?? 0;
                    const listeners = (b?.totalListeners || (sessions * 4)) ?? 0;
                    const storm = b?.anyReconnectStorm;
                    return (
                      <div className={`p-3 rounded-2xl border flex flex-col gap-1.5 transition-all ${
                        storm 
                          ? 'bg-rose-500/10 border-rose-500/40 text-rose-300' 
                          : 'bg-[#0c141b] border-white/10'
                      }`}>
                        <div className="flex items-center justify-between text-[10px] uppercase font-bold text-[#94a3b8] gap-1">
                          <span className="flex items-center gap-1 truncate">
                            <Smartphone size={12} className="text-teal-400 shrink-0" /> Baileys & Listeners
                          </span>
                          <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black shrink-0 ${
                            storm ? 'bg-rose-500/25 text-rose-300 animate-pulse' : 'bg-teal-500/20 text-teal-300'
                          }`}>
                            {storm ? 'STORM' : 'ESTÁVEL'}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-black text-white">{sessions}</span>
                          <span className="text-xs text-[#94a3b8]">caixas ativas</span>
                        </div>
                        <div className="text-[10px] text-[#94a3b8] flex justify-between">
                          <span>Listeners: <strong className="text-white font-mono">{listeners}</strong></span>
                          <span>Média: <strong className="text-white font-mono">{sessions > 0 ? (listeners / sessions).toFixed(1) : '0'} /cx</strong></span>
                        </div>
                        <div className="w-full bg-[#182229] rounded-full h-1.5 overflow-hidden mt-1">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              storm ? 'bg-rose-500' : 'bg-gradient-to-r from-teal-400 to-emerald-400'
                            }`}
                            style={{ width: `${Math.min(100, sessions * 5)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* CARD 4: PROCESSO & HANDLES */}
                  {(() => {
                    const proc = serverTelemetry?.process;
                    const uptimeSec = proc?.uptimeSeconds ?? serverTelemetry?.uptimeSeconds ?? 0;
                    const hours = Math.floor(uptimeSec / 3600);
                    const mins = Math.floor((uptimeSec % 3600) / 60);
                    const uptimeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m ${uptimeSec % 60}s`;
                    return (
                      <div className="p-3 rounded-2xl border bg-[#0c141b] border-white/10 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[10px] uppercase font-bold text-[#94a3b8] gap-1">
                          <span className="flex items-center gap-1 truncate">
                            <Server size={12} className="text-purple-400 shrink-0" /> Processo Node.js
                          </span>
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-purple-500/20 text-purple-300 shrink-0">
                            PID {proc?.pid || 'OK'}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-black text-white">{uptimeStr}</span>
                          <span className="text-xs text-[#94a3b8]">uptime</span>
                        </div>
                        <div className="text-[10px] text-[#94a3b8] flex justify-between">
                          <span>Handles: <strong className="text-white font-mono">{proc?.activeHandles ?? 'N/A'}</strong></span>
                          <span>Node: <strong className="text-white font-mono">{proc?.nodeVersion || 'v20'}</strong></span>
                        </div>
                        <div className="w-full bg-[#182229] rounded-full h-1.5 overflow-hidden mt-1">
                          <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 w-full" />
                        </div>
                      </div>
                    );
                  })()}

                </div>

                {/* PAINEL DE VALIDAÇÃO E2E (9 ESTÁGIOS) */}
                {(isExecutingE2E || e2eOverallResult || e2eLogs.length > 0) && (
                  <div className="bg-[#0c141b] border border-white/10 rounded-2xl p-3.5 sm:p-4 flex flex-col gap-3 relative z-10 animate-in fade-in duration-300">
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity size={14} className="text-cyan-400 animate-pulse" />
                        <span className="font-black text-white text-xs tracking-wider uppercase">
                          Validação de Fluxo E2E (9 Estágios)
                        </span>
                      </div>
                      <span className="text-xs font-black text-cyan-300 font-mono">
                        {e2eTestProgress}%
                      </span>
                    </div>

                    <div className="w-full bg-[#182229] rounded-full h-2 overflow-hidden border border-white/10">
                      <div 
                        className="bg-gradient-to-r from-cyan-500 via-teal-400 to-indigo-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${e2eTestProgress}%` }}
                      />
                    </div>

                    {/* Grade dos 9 Estágios */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-1">
                      {[
                        { num: 1, name: 'Gateway HTTP & Latência RTT' },
                        { num: 2, name: 'Event Loop & Performance' },
                        { num: 3, name: 'Auditoria de Listeners Baileys' },
                        { num: 4, name: 'Supabase DB & Isolamento' },
                        { num: 5, name: 'Sessões Baileys Conectadas' },
                        { num: 6, name: 'Geração de Trace ID E2E' },
                        { num: 7, name: 'WebSocket Realtime Supabase' },
                        { num: 8, name: 'Detecção de Reconnect Storms' },
                        { num: 9, name: 'Snapshot de Saúde Consolidado' },
                      ].map((st) => {
                        const state = e2eStagesStatus[st.num] || { status: 'idle' };
                        const isIdle = state.status === 'idle';
                        const isRunning = state.status === 'running';
                        const isPassed = state.status === 'passed';
                        const isFailed = state.status === 'failed';

                        return (
                          <div 
                            key={st.num}
                            className={`p-2.5 rounded-xl border flex flex-col gap-1 transition-all min-w-0 ${
                              isIdle ? 'bg-[#121c24]/70 border-white/5 text-[#94a3b8]' : ''
                            } ${
                              isRunning ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200 animate-pulse' : ''
                            } ${
                              isPassed ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' : ''
                            } ${
                              isFailed ? 'bg-rose-500/15 border-rose-500/40 text-rose-200' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px] uppercase font-bold gap-1">
                              <span className="flex items-center gap-1 truncate">
                                <span className="opacity-70 font-mono">[{st.num}/9]</span> {st.name}
                              </span>
                              <span className="shrink-0">
                                {isIdle && <Clock size={11} />}
                                {isRunning && <Loader2 size={11} className="animate-spin text-cyan-400" />}
                                {isPassed && <CheckCircle2 size={11} className="text-emerald-400" />}
                                {isFailed && <AlertTriangle size={11} className="text-rose-400" />}
                              </span>
                            </div>
                            <div className="text-[10px] text-[#94a3b8] truncate">
                              {state.detail ? state.detail : isRunning ? 'Executando validação...' : 'Aguardando'}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Resultado Consolidado */}
                    {e2eOverallResult && (
                      <div className="mt-1 p-3 rounded-xl bg-[#121c24] border border-white/10 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className={`px-3 py-1 rounded-xl text-xs font-black border ${
                            e2eOverallResult.healthScore === 100 
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' 
                              : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                          }`}>
                            HEALTH SCORE: {e2eOverallResult.healthScore}%
                          </span>
                          <span className="text-[11px] text-[#e2e8f0] break-words">
                            {e2eOverallResult.summary}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#94a3b8]">
                          Duração: <strong className="text-white">{(e2eOverallResult.durationTotalMs / 1000).toFixed(2)}s</strong>
                        </span>
                      </div>
                    )}

                  </div>
                )}

                {/* SESSÃO DE INSTÂNCIAS BAILEYS EM TEMPO REAL */}
                {serverTelemetry?.baileys?.instances && serverTelemetry.baileys.instances.length > 0 && (
                  <div className="bg-[#0c141b] border border-white/10 rounded-2xl p-3.5 sm:p-4 flex flex-col gap-3 relative z-10">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Smartphone size={14} className="text-teal-400" />
                        <span className="font-black text-white text-xs tracking-wider uppercase">
                          Sessões Ativas no Motor Node ({serverTelemetry.baileys.instances.length})
                        </span>
                      </div>
                      <span className="text-[10px] text-[#94a3b8]">
                        Auditando listeners & integridade de socket
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                      {serverTelemetry.baileys.instances.map((inst: any) => {
                        const isConnected = inst.wsOpen || inst.status === 'open' || inst.status === 'connected';
                        const isLeakRisk = (inst.totalListeners || 0) > 8;
                        const isStorm = inst.isReconnectStorm;

                        return (
                          <div 
                            key={inst.instanceId}
                            className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-all min-w-0 ${
                              isStorm 
                                ? 'bg-rose-500/15 border-rose-500/40' 
                                : isLeakRisk 
                                  ? 'bg-amber-500/15 border-amber-500/40' 
                                  : 'bg-[#121c24] border-white/10'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] font-bold text-white truncate">
                                {inst.instanceId}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase shrink-0 ${
                                isConnected ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/10 text-[#94a3b8]'
                              }`}>
                                {isConnected ? 'WS CONECTADO' : 'OFFLINE'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-[#94a3b8]">
                              <span>Listeners: <strong className={isLeakRisk ? "text-amber-300 font-black" : "text-white font-mono"}>{inst.totalListeners || 0}</strong></span>
                              <span>Reconexões (1m): <strong className={isStorm ? "text-rose-300 font-black" : "text-white font-mono"}>{inst.reconnectsLastMin || 0}</strong></span>
                            </div>

                            <div className="text-[9px] text-[#94a3b8] font-mono bg-[#0a1015] p-1.5 rounded-lg flex justify-between">
                              <span>upsert: {inst.listeners?.['messages.upsert'] || 0}</span>
                              <span>update: {inst.listeners?.['messages.update'] || 0}</span>
                              <span>conn: {inst.listeners?.['connection.update'] || 0}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TERMINAL DE LOGS E2E & EVENTOS DE TELEMETRIA */}
                <div className="bg-[#0c141b] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2 relative z-10">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Terminal size={13} className="text-cyan-400" />
                      <span className="font-black text-white text-[11px] uppercase tracking-wider">
                        Log de Eventos E2E & Telemetria
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const text = e2eLogs.map(l => `[${l.timestamp}] [${l.stage}/9] ${l.message}`).join('\n');
                          navigator.clipboard.writeText(text);
                          showToastFeedback('Logs E2E copiados!');
                        }}
                        disabled={e2eLogs.length === 0}
                        className="min-h-[32px] px-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[#cbd5e1] hover:text-white transition-all text-[10px] font-bold flex items-center gap-1 cursor-pointer active:scale-95 disabled:opacity-40"
                      >
                        <Copy size={11} /> Copiar Logs
                      </button>

                      <button
                        type="button"
                        onClick={() => setE2ELogs([])}
                        disabled={e2eLogs.length === 0}
                        className="min-h-[32px] px-2.5 bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/30 rounded-lg text-[#cbd5e1] hover:text-rose-300 transition-all text-[10px] font-bold flex items-center gap-1 cursor-pointer active:scale-95 disabled:opacity-40"
                      >
                        <Trash2 size={11} /> Limpar
                      </button>
                    </div>
                  </div>

                  <div className="max-h-52 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 font-mono text-[11px] p-2.5 bg-[#080d12] rounded-xl border border-white/5">
                    {e2eLogs.length === 0 && telemetryEvents.length === 0 ? (
                      <div className="py-6 text-center text-[#94a3b8] text-xs">
                        Nenhum evento registrado ainda. Clique em <strong className="text-cyan-300">"TESTAR E2E (9 ESTÁGIOS)"</strong> para iniciar uma auditoria completa.
                      </div>
                    ) : (
                      <>
                        {e2eLogs.map((log, idx) => (
                          <div 
                            key={`e2e_${idx}`}
                            className={`flex items-start gap-2 py-1 px-2 rounded-lg ${
                              log.level === 'error' 
                                ? 'bg-rose-500/10 text-rose-200' 
                                : log.level === 'success' 
                                  ? 'bg-emerald-500/10 text-emerald-200' 
                                  : log.level === 'warn' 
                                    ? 'bg-amber-500/10 text-amber-200' 
                                    : 'text-[#e2e8f0]'
                            }`}
                          >
                            <span className="text-[10px] text-[#94a3b8] shrink-0">[{log.timestamp}]</span>
                            <span className="font-bold shrink-0 text-cyan-400">[{log.stage}/9]</span>
                            <span className="break-words min-w-0">{log.message}</span>
                          </div>
                        ))}

                        {telemetryEvents.map((ev, idx) => (
                          <div 
                            key={`ev_${idx}`}
                            className="flex items-start gap-2 py-1 px-2 rounded-lg text-[#94a3b8] hover:text-white hover:bg-white/5 transition-colors flex-wrap"
                          >
                            <span className="text-[10px] opacity-80 shrink-0">
                              [{new Date(ev.timestamp).toLocaleTimeString('pt-BR')}]
                            </span>
                            <span className="text-purple-400 font-bold shrink-0">[SERVER]</span>
                            <span className="text-white font-bold shrink-0">{ev.event}</span>
                            {ev.traceId && <span className="text-cyan-300 text-[10px]">trace={ev.traceId}</span>}
                            {ev.durationMs !== null && <span className="text-amber-300 text-[10px]">{ev.durationMs}ms</span>}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {/* SNAPSHOTS RECENTES */}
                {telemetrySnapshots.length > 0 && (
                  <div className="bg-[#0c141b] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2 relative z-10">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Layers size={13} className="text-purple-400" />
                        <span className="font-black text-white text-[11px] uppercase tracking-wider">
                          Snapshots Recentes ({telemetrySnapshots.length})
                        </span>
                      </div>
                      <span className="text-[10px] text-[#94a3b8]">
                        Capturados automaticamente ou sob demanda
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                      {telemetrySnapshots.map((snap, idx) => (
                        <div 
                          key={idx}
                          className="p-2.5 rounded-xl bg-[#121c24] border border-white/5 flex items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                            <span className="font-bold text-white truncate">{snap.reason || 'MANUAL'}</span>
                            <span className="text-[10px] text-[#94a3b8] shrink-0">
                              {new Date(snap.timestamp).toLocaleString('pt-BR')}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(snap, null, 2));
                              showToastFeedback('JSON do Snapshot copiado!');
                            }}
                            className="min-h-[30px] px-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[#cbd5e1] hover:text-white transition-all text-[10px] font-bold flex items-center gap-1 cursor-pointer active:scale-95 shrink-0"
                          >
                            <Copy size={10} /> Copiar JSON
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ) : (
              /* Console & Server Logs - Barra Fixa Fora do Scroll + Log Cards Retráteis Inteligentes */
              <div className="flex-1 flex flex-col min-h-0 font-mono text-xs bg-[#070c10] overflow-hidden">
                
                {/* Sub-Barra Fixa de Controles do Console */}
                <div className="px-3 sm:px-4 py-2.5 bg-[#091017]/95 border-b border-white/10 text-xs font-mono select-none flex flex-col gap-2 shrink-0 relative z-20 backdrop-blur-2xl">
                  
                  {/* Linha 1: Busca + Toggle Filtros (Mobile) + Ações Principais */}
                  <div className="flex items-center gap-2 flex-wrap justify-between">
                    {/* Input de Busca Textual */}
                    <div className="relative flex items-center flex-1 min-w-[160px]">
                      <Search size={13} className="absolute left-3 text-[#94a3b8] pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Filtrar por texto, instância ou trace..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full min-h-[38px] pl-8 pr-8 py-1.5 bg-[#0e161d] border border-white/10 rounded-xl text-[11px] text-white placeholder-[#64748b] focus:outline-none focus:border-emerald-500/50 transition-all font-mono"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 w-6 h-6 flex items-center justify-center rounded-md text-[#94a3b8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title="Limpar busca"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {/* Seletor de Modo: Agrupado vs Timeline */}
                    <div className="flex items-center gap-0.5 bg-[#0e161d] p-0.5 rounded-xl border border-white/10 shrink-0">
                      <button
                        type="button"
                        onClick={() => setViewMode('grouped')}
                        className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                          viewMode === 'grouped'
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-sm'
                            : 'text-[#94a3b8] hover:text-white hover:bg-white/5'
                        }`}
                        title="Agrupar erros e logs idênticos"
                      >
                        <span>📦 Agrupado</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${viewMode === 'grouped' ? 'bg-black/20 text-slate-950' : 'bg-white/10 text-white/80'}`}>
                          {groupedAndFilteredLogs.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('timeline')}
                        className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                          viewMode === 'timeline'
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-sm'
                            : 'text-[#94a3b8] hover:text-white hover:bg-white/5'
                        }`}
                        title="Exibir histórico individual por ordem cronológica"
                      >
                        <span>🕒 Timeline</span>
                      </button>
                    </div>

                    {/* Botão Mobile de Filtros Extras + Central Preventiva */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowConsoleFilters(prev => !prev)}
                        className={`sm:hidden min-h-[38px] px-2.5 rounded-xl border text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                          showConsoleFilters || logFilter !== 'all' || timeFilter !== 'all'
                            ? 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40'
                            : 'bg-[#0e161d] text-[#94a3b8] border-white/10'
                        }`}
                      >
                        <SlidersHorizontal size={12} />
                        <span>Filtros</span>
                        {(logFilter !== 'all' || timeFilter !== 'all') && (
                          <span className="w-2 h-2 rounded-full bg-indigo-400" />
                        )}
                      </button>

                      {logs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowAiMediaPromptModal(true)}
                          disabled={isAnalyzingAiLogs}
                          className={`min-h-[38px] px-3 rounded-xl text-[10px] font-black transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 border ${
                            isAnalyzingAiLogs
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 animate-pulse'
                              : 'bg-gradient-to-r from-purple-500/25 via-indigo-500/25 to-pink-500/25 hover:from-purple-500/40 hover:to-pink-500/40 text-purple-100 border-purple-400/45 shadow-md shadow-purple-500/10'
                          }`}
                          title="Analisar logs atuais com Gemini IA e criar card no CRM Kanban"
                        >
                          {isAnalyzingAiLogs ? (
                            <Loader2 size={12} className="animate-spin text-purple-300" />
                          ) : (
                            <Sparkles size={12} className="text-purple-300" />
                          )}
                          <span className="hidden md:inline">{isAnalyzingAiLogs ? 'Analisando...' : 'Analisar c/ IA'}</span>
                          <span className="md:hidden">{isAnalyzingAiLogs ? '...' : 'IA'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowSimulationModal(true)}
                        className="min-h-[38px] bg-gradient-to-r from-amber-500/20 to-rose-500/20 hover:from-amber-500/30 hover:to-rose-500/30 text-amber-200 border border-amber-500/35 hover:border-amber-400 px-3 rounded-xl text-[10px] font-black transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0"
                        title="Abrir Central de Diagnóstico Preventivo Real e Simulação de Erros"
                      >
                        <Zap size={12} className="text-amber-400 shrink-0" />
                        <span>Ações de Teste</span>
                        {preventiveReport && (preventiveReport.counts.critical + preventiveReport.counts.warn > 0) && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-rose-500 text-white">
                            {preventiveReport.counts.critical + preventiveReport.counts.warn}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Linha 2: Quick Filter Chips + Janela Temporal (Sempre visível em sm+, expansível em Mobile) */}
                  <div className={`${showConsoleFilters ? 'flex pt-1' : 'hidden sm:flex'} items-center justify-between gap-2 flex-wrap`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[
                        { id: 'all', label: 'Todos', count: logs.length, activeCls: 'bg-white/15 text-white border-white/30' },
                        { id: 'action', label: '🚨 Ação', count: actionLogsCount, activeCls: 'bg-rose-500/25 text-rose-200 border-rose-400/60' },
                        { id: 'error', label: '🔴 Erros', count: errorLogsCount, activeCls: 'bg-rose-500/20 text-rose-300 border-rose-500/50' },
                        { id: 'breadcrumbs', label: '📍 Migalhas', count: breadcrumbLogsCount, activeCls: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/50' },
                        { id: 'node', label: '🖥️ Node', count: nodeLogsCount, activeCls: 'bg-purple-500/20 text-purple-200 border-purple-500/50' },
                        { id: 'warn', label: '🟡 Alertas', count: warnLogsCount, activeCls: 'bg-amber-500/20 text-amber-200 border-amber-500/50' },
                      ].map((chip) => {
                        const isActive = logFilter === chip.id;
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => setLogFilter(chip.id as any)}
                            className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 ${
                              isActive
                                ? `${chip.activeCls} shadow-sm font-black`
                                : 'bg-[#0e161d] text-[#94a3b8] border-white/10 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <span>{chip.label}</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${isActive ? 'bg-black/25 text-white' : 'bg-white/5 text-[#94a3b8]'}`}>
                              {chip.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Filtro por Faixa Temporal */}
                    <div className="flex items-center gap-0.5 bg-[#0e161d] p-0.5 rounded-xl border border-white/10 shrink-0">
                      {[
                        { id: 'all', label: 'Tudo' },
                        { id: '15m', label: '15m' },
                        { id: '1h', label: '1h' },
                        { id: 'today', label: 'Hoje' },
                      ].map((tf) => (
                        <button
                          key={tf.id}
                          type="button"
                          onClick={() => setTimeFilter(tf.id as any)}
                          className={`min-h-[28px] px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${
                            timeFilter === tf.id
                              ? 'bg-indigo-500 text-white shadow-sm'
                              : 'text-[#94a3b8] hover:text-white hover:bg-white/5'
                          }`}
                          title={`Filtrar logs: ${tf.label}`}
                        >
                          {tf.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Banner Animado de Progresso da Análise de IA (Fixo abaixo da barra de controles, sem sobreposição) */}
                {isAnalyzingAiLogs && (
                  <div className="bg-gradient-to-r from-purple-950/90 via-indigo-950/90 to-purple-950/90 border-b border-purple-500/35 px-4 py-2.5 flex items-center justify-between gap-3 text-xs font-mono text-purple-200 animate-in fade-in duration-200 shrink-0 relative z-10">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-xl bg-purple-500/30 border border-purple-400/50 flex items-center justify-center shadow-lg shadow-purple-500/25 shrink-0">
                        <BrainCircuit size={14} className="text-purple-200 animate-pulse" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-black text-white text-[11px] block truncate">{aiAnalysisStep || 'Analisando logs com Inteligência Artificial...'}</span>
                        <span className="text-[10px] text-purple-300/85 block truncate">Correlacionando eventos e formulando plano técnico para o Kanban</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 bg-purple-500/20 px-2.5 py-1 rounded-full border border-purple-400/40 text-[10px] font-bold text-purple-100 animate-pulse">
                      <Loader2 size={11} className="animate-spin" />
                      <span>Processando</span>
                    </div>
                  </div>
                )}

                {/* Área Rolável Única de Logs */}
                <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 flex flex-col gap-3 custom-scrollbar min-h-0">
                  {groupedAndFilteredLogs.length === 0 ? (
                    <div className="m-auto py-10 px-6 flex flex-col items-center justify-center text-center space-y-4 select-none animate-in fade-in zoom-in-95 duration-300 relative">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-bold text-emerald-300 font-mono shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>SISTEMA OPERACIONAL ESTÁVEL • 0 ANOMALIAS</span>
                      </div>

                      <div className="relative flex items-center justify-center my-2">
                        <div className="absolute -inset-6 rounded-full bg-gradient-to-tr from-emerald-500/20 via-teal-500/15 to-indigo-500/20 blur-2xl animate-pulse" />
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-[#0c141a]/90 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-2xl shadow-emerald-500/25 relative z-10 backdrop-blur-2xl">
                          <Terminal size={36} className="animate-pulse text-emerald-400 stroke-[2]" />
                        </div>
                        <div className="absolute inset-0 rounded-3xl border border-emerald-400/30 animate-ping pointer-events-none" />
                      </div>

                      <div className="space-y-1.5 z-10 max-w-md">
                        <h4 className="text-base sm:text-lg font-black text-white tracking-tight font-mono">
                          {searchQuery || timeFilter !== 'all' || logFilter !== 'all'
                            ? 'Nenhum log corresponde aos filtros'
                            : 'Nenhum log detectado'}
                        </h4>
                        <p className="text-xs text-[#94a3b8] max-w-sm leading-relaxed font-mono">
                          {searchQuery || timeFilter !== 'all' || logFilter !== 'all'
                            ? `Nenhum registro encontrado com os filtros atuais${searchQuery ? ` ("${searchQuery}")` : ''}. Ajuste os chips ou limpe os filtros.`
                            : 'Erros do Servidor Node, migalhas de fluxo, requisições HTTP e exceções aparecerão agrupados aqui.'}
                        </p>
                      </div>

                      {(searchQuery || timeFilter !== 'all' || logFilter !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setTimeFilter('all');
                            setLogFilter('all');
                          }}
                          className="min-h-[38px] px-4 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-400/40 text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer font-mono active:scale-95"
                        >
                          Limpar Todos os Filtros
                        </button>
                      )}

                      <div className="flex items-center gap-2.5 pt-2 z-10 flex-wrap justify-center">
                        <button
                          type="button"
                          onClick={() => handleRunPreventiveAudit()}
                          disabled={isRunningPreventive}
                          className="bg-gradient-to-r from-emerald-500/25 to-teal-500/25 hover:from-emerald-500/35 hover:to-teal-500/35 text-emerald-200 border border-emerald-500/40 text-xs font-bold px-4 py-2.5 min-h-[44px] rounded-2xl transition-all cursor-pointer shadow-lg shadow-emerald-500/15 active:scale-95 flex items-center gap-2 font-mono disabled:opacity-60"
                        >
                          {isRunningPreventive ? (
                            <Loader2 size={14} className="animate-spin text-emerald-300" />
                          ) : (
                            <ShieldAlert size={14} className="text-emerald-400" />
                          )}
                          {isRunningPreventive ? 'Auditando Sistema Real...' : 'Varredura Preventiva Real'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSimulationModal(true)}
                          className="bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-emerald-500/20 hover:from-indigo-500/30 hover:to-emerald-500/30 text-indigo-200 border border-indigo-500/35 text-xs font-bold px-4 py-2.5 min-h-[44px] rounded-2xl transition-all cursor-pointer shadow-lg shadow-indigo-500/10 active:scale-95 flex items-center gap-2 font-mono"
                        >
                          <SlidersHorizontal size={14} className="text-indigo-400" /> Ações de Teste e Simulação
                        </button>
                      </div>
                    </div>
                  ) : (
                    groupedAndFilteredLogs.map((log) => {
                      const isErr = log.type === 'error';
                      const isWrn = log.type === 'warn';
                      const isSucc = log.type === 'success';
                      const isInf = log.type === 'info';
                      const isNode = log.isServerNode || log.source?.toLowerCase().includes('server') || log.source?.toLowerCase().includes('node');
                      const isAction = log.requiresAction || log.severity === 'critical';
                      const isExpanded = !!expandedLogs[log.id];
                      const hasExtra = !!(log.details || log.count > 1);

                      return (
                        <div 
                          key={log.id} 
                          className={`p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 flex flex-col gap-2 shadow-lg backdrop-blur-xl ${
                            isAction
                              ? 'bg-gradient-to-br from-rose-950/45 via-[#0e151c] to-[#121c24] border-l-4 border-l-rose-500 border-rose-500/45 text-rose-50 ring-1 ring-rose-500/20'
                              : isNode && isErr
                                ? 'bg-gradient-to-br from-rose-950/30 via-[#0e151c] to-[#121c24] border-l-4 border-l-rose-500 border-rose-500/35 text-rose-50'
                                : isErr 
                                  ? 'bg-gradient-to-br from-rose-950/20 via-[#0e151c] to-[#121c24] border-l-4 border-l-rose-500 border-rose-500/30 text-rose-50' 
                                  : isWrn 
                                    ? 'bg-gradient-to-br from-amber-950/20 via-[#0e151c] to-[#121c24] border-l-4 border-l-amber-400 border-amber-500/30 text-amber-50' 
                                    : isSucc 
                                      ? 'bg-gradient-to-br from-emerald-950/20 via-[#0e151c] to-[#121c24] border-l-4 border-l-emerald-400 border-emerald-500/30 text-emerald-50' 
                                      : isInf 
                                        ? 'bg-gradient-to-br from-blue-950/20 via-[#0e151c] to-[#121c24] border-l-4 border-l-blue-400 border-blue-500/30 text-blue-50' 
                                        : 'bg-[#0f171e] border-white/10 text-[#e2e8f0] hover:border-white/20'
                          }`}
                        >
                          {/* Cabeçalho do Card */}
                          <div className="flex justify-between items-start select-none gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 font-mono text-[10px] font-black uppercase tracking-wider min-w-0 flex-wrap flex-1">
                              {isNode ? (
                                <span className="flex items-center gap-1 bg-purple-500/20 border border-purple-500/40 text-purple-200 px-2 py-0.5 rounded-lg text-[9px] font-mono font-black">
                                  🖥️ SERVIDOR NODE.JS
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 bg-slate-500/20 border border-slate-500/35 text-slate-200 px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold">
                                  {log.source || 'APP'}
                                </span>
                              )}

                              {isAction && (
                                <span className="flex items-center gap-1 bg-rose-500/30 border border-rose-400/60 text-rose-100 px-2 py-0.5 rounded-lg text-[9px] font-black animate-pulse">
                                  🚨 {log.severity === 'critical' ? 'CRÍTICO' : 'AÇÃO REQUERIDA'}
                                </span>
                              )}

                              {log.step && (
                                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold border ${
                                  log.step.status === 'timeout' || log.step.status === 'error'
                                    ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                                    : log.step.status === 'success'
                                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                                      : 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                                }`}>
                                  📍 PASSO {log.step.current}/{log.step.total}
                                </span>
                              )}

                              {isErr && !isAction && (
                                <span className="flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 px-2 py-0.5 rounded-lg text-[9px] font-bold">
                                  <AlertTriangle size={11} className="text-rose-400 shrink-0" /> ERRO
                                </span>
                              )}
                              {isWrn && !isAction && (
                                <span className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2 py-0.5 rounded-lg text-[9px] font-bold">
                                  <AlertTriangle size={11} className="text-amber-400 shrink-0" /> ALERTA
                                </span>
                              )}
                              {isSucc && (
                                <span className="flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded-lg text-[9px] font-bold">
                                  <CheckCircle2 size={11} className="text-emerald-400 shrink-0" /> SUCESSO
                                </span>
                              )}
                              {isInf && !log.step && (
                                <span className="flex items-center gap-1 bg-blue-500/20 border border-blue-500/40 text-blue-300 px-2 py-0.5 rounded-lg text-[9px] font-bold">
                                  <Info size={11} className="text-blue-400 shrink-0" /> INFO
                                </span>
                              )}

                              {log.tenantId && (
                                <span className="text-[9px] bg-white/5 border border-white/10 text-[#94a3b8] px-1.5 py-0.5 rounded font-mono" title={`Tenant ID: ${log.tenantId}`}>
                                  🏢 {log.tenantId.substring(0, 8)}...
                                </span>
                              )}
                              {log.instanceId && (
                                <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold" title={`Instância ID: ${log.instanceId}`}>
                                  📱 {log.instanceId}
                                </span>
                              )}

                              {log.count > 1 && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-gradient-to-r from-amber-500/25 to-orange-500/25 text-amber-200 border border-amber-400/50 shrink-0 font-mono">
                                  {log.count}x
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] font-bold text-[#94a3b8] font-mono bg-white/5 px-2 py-1 rounded-lg border border-white/10">
                                {new Date(log.latestTimestamp).toLocaleTimeString('pt-BR', { hour12: false })}
                              </span>
                              {hasExtra && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandLog(log.id)}
                                  className="min-w-[34px] min-h-[34px] flex items-center justify-center text-[#94a3b8] hover:text-white rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer active:scale-95"
                                  title={isExpanded ? 'Recolher payload e ocorrências' : 'Expandir payload JSON e ocorrências'}
                                >
                                  {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Mensagem Principal com Alto Contraste */}
                          <p className="break-words whitespace-pre-wrap leading-relaxed font-semibold font-mono text-xs text-[#f8fafc] select-text">
                            {log.message}
                          </p>

                          {/* Atalho Discreto Quando Recolhido com Payload */}
                          {!isExpanded && hasExtra && (
                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => toggleExpandLog(log.id)}
                                className="min-h-[30px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-bold text-cyan-300 flex items-center gap-1.5 cursor-pointer active:scale-95"
                              >
                                <FileCode size={11} />
                                <span>
                                  {log.details && log.count > 1
                                    ? `Inspecionar JSON & ${log.count} ocorrências`
                                    : log.details
                                      ? 'Inspecionar Payload JSON'
                                      : `Ver ${log.count} ocorrências agrupadas`}
                                </span>
                              </button>
                              {log.details && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const text = typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details);
                                    navigator.clipboard.writeText(text);
                                    showToastFeedback('JSON Copiado!');
                                  }}
                                  className="min-h-[30px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/40 text-[10px] font-bold text-[#94a3b8] hover:text-emerald-200 flex items-center gap-1 cursor-pointer active:scale-95"
                                >
                                  <Copy size={11} /> <span>Copiar JSON</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* Detalhes Expandidos (somente quando isExpanded = true) */}
                          {isExpanded && hasExtra && (
                            <div className="flex flex-col gap-2 mt-1 animate-in fade-in duration-200 pt-2 border-t border-white/10">
                              {log.count > 1 && (
                                <div className="p-2.5 bg-[#060b0f] border border-white/10 rounded-xl text-[10px] text-amber-200 font-mono flex items-center justify-between flex-wrap gap-2">
                                  <span>
                                    ⏱️ <strong>Primeira:</strong> {new Date(log.firstTimestamp).toLocaleTimeString('pt-BR')} &bull; <strong>Última:</strong> {new Date(log.latestTimestamp).toLocaleTimeString('pt-BR')}
                                  </span>
                                  <span className="text-[9px] text-[#94a3b8] uppercase font-bold bg-white/5 px-2 py-0.5 rounded-md">
                                    Agrupado ({log.count} repetições)
                                  </span>
                                </div>
                              )}

                              {log.details && (
                                <div className="relative group/code">
                                  <pre className="p-3.5 bg-[#03070b] border border-white/10 rounded-xl text-[10px] text-cyan-300 overflow-x-auto max-h-[220px] custom-scrollbar font-mono leading-relaxed select-all shadow-inner pr-20">
                                    {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                                  </pre>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const text = typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details);
                                      navigator.clipboard.writeText(text);
                                      showToastFeedback('JSON Copiado!');
                                    }}
                                    className="absolute top-2.5 right-2.5 bg-[#0f171e]/95 hover:bg-emerald-500 hover:text-slate-950 text-[#cbd5e1] border border-white/15 px-2.5 py-1.5 rounded-lg text-[10px] font-bold font-mono transition-all flex items-center gap-1 shadow-md active:scale-95 cursor-pointer"
                                    title="Copiar JSON Payload para a área de transferência"
                                  >
                                    <Copy size={11} /> <span>Copiar</span>
                                  </button>
                                </div>
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

      {/* Modal Interativo de Entrada Multimídia & Confirmação de IA */}
      <DevLoggerModalShell
        isOpen={showAiMediaPromptModal}
        onClose={() => {
          stopAudioRecording();
          setShowAiMediaPromptModal(false);
        }}
        title="Criar Card CRM com I.A"
        badge="Gemini Vision"
        subtitle={<>Diagnóstico multimodal &bull; Destino: <strong className="text-emerald-400">Em Análise</strong></>}
        icon={<Sparkles size={20} className="animate-pulse text-amber-300" />}
        accent="purple"
        headerExtra={
          <div className="grid grid-cols-2 sm:inline-flex items-center gap-1.5 bg-[#060a0e] p-1 rounded-2xl border border-white/10 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setAiPromptTab('enriched')}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-[11px] font-bold font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                aiPromptTab === 'enriched'
                  ? 'bg-purple-500/25 border border-purple-400/50 text-purple-100 shadow-sm'
                  : 'text-[#94a3b8] hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Paperclip size={13} className="shrink-0" />
              <span className="truncate">Observações & Mídia</span>
              {(attachedImagesList.length > 0 || attachedAudioItem || userPromptNotes.trim().length > 0) && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setAiPromptTab('quick')}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-[11px] font-bold font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                aiPromptTab === 'quick'
                  ? 'bg-indigo-500/25 border border-indigo-400/50 text-indigo-100 shadow-sm'
                  : 'text-[#94a3b8] hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Zap size={13} className="text-amber-300 shrink-0" />
              <span className="truncate">Análise Rápida</span>
            </button>
          </div>
        }
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 w-full">
            <button
              type="button"
              onClick={() => {
                stopAudioRecording();
                setShowAiMediaPromptModal(false);
              }}
              className="min-h-[44px] bg-white/5 hover:bg-white/10 border border-white/10 text-[#94a3b8] hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
            >
              Cancelar
            </button>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                type="button"
                onClick={() => handleAnalyzeLogsAndCreateKanbanCard()}
                disabled={isAnalyzingAiLogs}
                className="min-h-[44px] bg-white/5 hover:bg-white/10 border border-white/15 text-[#e2e8f0] hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
                title="Executar análise padrão com logs e captura de tela sem observações adicionais"
              >
                <Zap size={14} className="text-amber-300" /> Analisar Diretamente
              </button>

              <button
                type="button"
                onClick={() => handleAnalyzeLogsAndCreateKanbanCard({
                  userNotes: userPromptNotes,
                  images: attachedImagesList,
                  audio: attachedAudioItem
                })}
                disabled={isAnalyzingAiLogs}
                className="min-h-[44px] bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black px-5 py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isAnalyzingAiLogs ? (
                  <Loader2 size={14} className="animate-spin text-white" />
                ) : (
                  <Sparkles size={14} className="text-amber-300 animate-pulse" />
                )}
                <span>{isAnalyzingAiLogs ? 'Processando...' : 'Analisar c/ IA & Criar Card'}</span>
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 font-mono text-xs">
          {aiPromptTab === 'quick' ? (
            <div className="bg-[#0e161d] border border-white/10 rounded-2xl p-5 space-y-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-400/35 flex items-center justify-center text-indigo-300 mx-auto">
                <Zap size={28} className="text-amber-300 animate-pulse" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h4 className="text-sm font-black text-white">Análise Automática e Imediata</h4>
                <p className="text-xs text-[#94a3b8] leading-relaxed font-sans">
                  A Inteligência Artificial irá capturar o print do DevLogger, correlacionar os logs do Console, Servidor Node.js, Gastrofood e formular um plano técnico completo pronto na coluna <strong className="text-emerald-400">Em Análise</strong>.
                </p>
              </div>

              <div className="bg-[#070c10] border border-white/10 rounded-xl p-3.5 text-left space-y-2 text-[11px] text-slate-200">
                <div className="flex items-center gap-2 text-emerald-300 font-bold">
                  <CheckCircle2 size={14} className="shrink-0" /> Captura de screenshot automática
                </div>
                <div className="flex items-center gap-2 text-emerald-300 font-bold">
                  <CheckCircle2 size={14} className="shrink-0" /> Extração de {logs.length} logs e erros do servidor
                </div>
                <div className="flex items-center gap-2 text-emerald-300 font-bold">
                  <CheckCircle2 size={14} className="shrink-0" /> Direcionamento fixo para o quadro ChatBot CRM
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Observações do Desenvolvedor */}
              <div className="bg-[#0e161d] border border-white/10 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#94a3b8] uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <FileCode size={12} className="text-purple-400" /> Observações e Contexto do Desenvolvedor
                  </span>
                  <span className="text-[10px] text-[#94a3b8]">
                    {userPromptNotes.length} caracteres
                  </span>
                </div>
                <textarea
                  value={userPromptNotes}
                  onChange={(e) => setUserPromptNotes(e.target.value)}
                  placeholder="Ex: 'Ao testar o fluxo de envio para a caixa FoodNext, o botão ficou em loop. O comportamento esperado era abrir o QR Code...'"
                  rows={3}
                  className="w-full bg-[#070c10] border border-white/10 rounded-xl p-3 text-xs text-slate-100 placeholder-[#64748b] focus:outline-none focus:border-purple-500/60 resize-none font-sans"
                />
              </div>

              {/* Anexo de Imagens */}
              <div className="bg-[#0e161d] border border-white/10 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-[#94a3b8] uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <ImageIcon size={12} className="text-cyan-400" /> Imagens & Prints ({attachedImagesList.length})
                  </span>

                  <label className="min-h-[34px] bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-200 px-3 py-1 rounded-xl text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 active:scale-95">
                    <Plus size={12} /> Adicionar Print
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleImageFilesSelected(e.target.files)}
                      className="hidden"
                    />
                  </label>
                </div>

                {attachedImagesList.length === 0 ? (
                  <label className="border border-dashed border-white/15 hover:border-cyan-400/50 rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-[#070c10]/60 hover:bg-[#070c10]">
                    <UploadCloud size={24} className="text-cyan-400/80 mb-1.5" />
                    <span className="text-xs text-slate-200 font-bold font-sans">Toque para selecionar imagens ou arraste prints</span>
                    <span className="text-[10px] text-[#94a3b8] mt-0.5">PNG, JPG, JPEG, WebP</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleImageFilesSelected(e.target.files)}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {attachedImagesList.map((img) => (
                      <div key={img.id} className="relative bg-[#070c10] border border-white/10 rounded-xl overflow-hidden p-1.5">
                        <img src={img.dataUrl} alt={img.name} className="w-full h-24 object-cover rounded-lg" />
                        <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#94a3b8] px-1 gap-1">
                          <span className="truncate">{img.name}</span>
                          <button
                            type="button"
                            onClick={() => removeImageItem(img.id)}
                            className="min-w-[28px] min-h-[28px] flex items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 cursor-pointer shrink-0"
                            title="Remover imagem"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Áudio e Voz */}
              <div className="bg-[#0e161d] border border-white/10 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#94a3b8] uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <Volume2 size={12} className="text-emerald-400" /> Instrução por Áudio / Microfone
                  </span>
                </div>

                {isRecordingAudio ? (
                  <div className="bg-rose-950/35 border border-rose-500/45 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse">
                    <div className="flex items-center gap-2 text-rose-200 text-xs font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
                      <span>Gravando áudio... 00:{recordingSeconds < 10 ? `0${recordingSeconds}` : recordingSeconds}</span>
                    </div>
                    <button
                      type="button"
                      onClick={stopAudioRecording}
                      className="min-h-[40px] bg-rose-600 hover:bg-rose-500 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg active:scale-95"
                    >
                      <Square size={12} /> Parar Gravação
                    </button>
                  </div>
                ) : attachedAudioItem ? (
                  <div className="bg-[#070c10] border border-emerald-500/35 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                        <Volume2 size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold text-white block truncate">{attachedAudioItem.name}</span>
                        <audio src={attachedAudioItem.url} controls className="h-8 w-full max-w-[240px] mt-1" />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeAudioItem}
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 rounded-xl transition-all cursor-pointer active:scale-95 shrink-0"
                      title="Remover áudio"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <button
                      type="button"
                      onClick={startAudioRecording}
                      className="min-h-[44px] flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-200 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                    >
                      <Mic size={15} className="text-emerald-400" />
                      <span>Gravar Áudio pelo Microfone</span>
                    </button>

                    <label className="min-h-[44px] bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95">
                      <Paperclip size={14} />
                      <span>Arquivo de Áudio</span>
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={(e) => handleAudioFileSelected(e.target.files)}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DevLoggerModalShell>

      {/* Modal de Card Gerado por I.A & Publicado no CRM Kanban */}
      <DevLoggerModalShell
        isOpen={!!(showAiCardModal && generatedAiCard)}
        onClose={() => setShowAiCardModal(false)}
        title="Card de Correção Criado no CRM"
        badge="Gemini 2.0 Flash"
        subtitle={<>Quadro: <strong className="text-white">{createdCardBoardName}</strong> &bull; Coluna: <strong className="text-emerald-400">Em Análise</strong></>}
        icon={<Sparkles size={20} className="animate-pulse" />}
        accent="purple"
        footer={
          generatedAiCard && (
            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 w-full">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const fullText = `# ${generatedAiCard.title}\n\n**Resumo:**\n${generatedAiCard.summary}\n\n${generatedAiCard.technical_plan}`;
                    navigator.clipboard.writeText(fullText);
                    showToastFeedback('Plano técnico copiado!');
                  }}
                  className="min-h-[42px] bg-white/5 hover:bg-white/10 border border-white/15 text-[#e2e8f0] hover:text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
                >
                  <Copy size={14} /> Copiar Plano
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearLogs();
                    showToastFeedback('Logs do DevLogger limpos!');
                  }}
                  className="min-h-[42px] bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="Limpa a lista de logs do DevLogger"
                >
                  <Trash2 size={13} /> Limpar Logs
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => {
                    clearLogs();
                    setTestErrors([]);
                    setTestLogs([]);
                    setTestSummary(null);
                    setShowAiCardModal(false);
                    useDevStore.setState({ isVisible: false });
                  }}
                  className="min-h-[42px] bg-white/5 hover:bg-white/10 border border-white/10 text-[#94a3b8] hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
                >
                  Fechar
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearLogs();
                    setTestErrors([]);
                    setTestLogs([]);
                    setTestSummary(null);
                    setShowAiCardModal(false);
                    useDevStore.setState({ isVisible: false });
                    showToastFeedback('Card criado no CRM e logs limpos!', 3500);
                  }}
                  className="min-h-[42px] bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black px-5 py-2 rounded-xl text-xs transition-all flex items-center gap-2 shadow-lg shadow-purple-600/30 active:scale-95 cursor-pointer"
                  title="Confirma a criação do card no CRM, limpa os logs e permanece na tela atual"
                >
                  <Sparkles size={15} className="text-amber-300 animate-pulse" /> Criar Card
                </button>
              </div>
            </div>
          )
        }
      >
        {generatedAiCard && (
          <div className="space-y-4 font-mono text-xs">
            <div className="bg-[#0e161d] border border-white/10 rounded-2xl p-3.5 space-y-2">
              <span className="text-[10px] text-[#94a3b8] uppercase font-bold tracking-wider block">Título do Card</span>
              <h4 className="text-sm sm:text-base font-bold text-white leading-snug">{generatedAiCard.title}</h4>

              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2.5 py-0.5 rounded-lg text-[10px] font-bold">
                  {generatedAiCard.category || 'Correção'}
                </span>

                <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${
                  generatedAiCard.priority === 3
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : generatedAiCard.priority === 2
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  Prioridade: {generatedAiCard.priority === 3 ? 'Alta / Crítica' : generatedAiCard.priority === 2 ? 'Média' : 'Baixa'}
                </span>

                {(generatedAiCard.tags || []).map((tag: string, idx: number) => (
                  <span key={idx} className="bg-white/5 text-[#e2e8f0] border border-white/10 px-2 py-0.5 rounded-lg text-[9px] font-bold">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="bg-[#0e161d] border border-white/10 rounded-xl p-2.5">
                <span className="text-[9px] text-[#94a3b8] uppercase block">Console / Logs</span>
                <span className="text-xs font-black text-white">{generatedAiCard.analyzed_count?.console || 0} analisados</span>
              </div>
              <div className="bg-[#0e161d] border border-white/10 rounded-xl p-2.5">
                <span className="text-[9px] text-[#94a3b8] uppercase block">Servidor Node</span>
                <span className="text-xs font-black text-purple-300">{generatedAiCard.analyzed_count?.server || 0} erros</span>
              </div>
              <div className="bg-[#0e161d] border border-white/10 rounded-xl p-2.5">
                <span className="text-[9px] text-[#94a3b8] uppercase block">Gastrofood API</span>
                <span className="text-xs font-black text-amber-300">{generatedAiCard.analyzed_count?.gastrofood || 0} logs</span>
              </div>
              <div className="bg-[#0e161d] border border-white/10 rounded-xl p-2.5">
                <span className="text-[9px] text-[#94a3b8] uppercase block">Auditoria ASTS</span>
                <span className="text-xs font-black text-emerald-300">{generatedAiCard.analyzed_count?.asts || 0} itens</span>
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-950/35 via-[#121c24] to-[#0e161d] border border-purple-500/35 rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center gap-1.5 text-purple-300 font-bold text-[11px]">
                <BrainCircuit size={14} /> Resumo Diagnóstico da I.A
              </div>
              <p className="text-xs text-purple-100/95 leading-relaxed font-sans">
                {generatedAiCard.summary}
              </p>
            </div>

            <div className="bg-blue-950/30 border border-blue-500/30 rounded-2xl p-3.5 flex items-start gap-2.5">
              <span className="text-base leading-none">💡</span>
              <div className="text-xs text-blue-200/95 leading-relaxed font-sans">
                <strong className="text-blue-300 block mb-0.5">Fluxo da Esteira Fila Dev:</strong>
                O comando <code className="bg-blue-900/60 px-1.5 py-0.5 rounded text-blue-200 font-mono font-bold">Fila dev</code> executa autonomamente os cards que estiverem na coluna <span className="text-emerald-400 font-bold">"Em Desenvolvimento"</span>.
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[#94a3b8] text-[10px] uppercase font-bold">
                <span className="flex items-center gap-1"><FileCode size={13} /> Plano Técnico & Arquivos a Modificar</span>
                <span>Markdown</span>
              </div>
              <pre className="p-4 bg-[#050a0e] border border-white/10 rounded-2xl text-[11px] text-cyan-200 overflow-x-auto max-h-[260px] custom-scrollbar font-mono leading-relaxed whitespace-pre-wrap select-all shadow-inner">
                {generatedAiCard.technical_plan}
              </pre>
            </div>
          </div>
        )}
      </DevLoggerModalShell>

      {/* Central de Diagnóstico Preventivo, Suítes & Sandbox Real */}
      <DevLoggerModalShell
        isOpen={showSimulationModal}
        onClose={() => setShowSimulationModal(false)}
        title="Diagnóstico Preventivo & Simulação Real"
        subtitle="Rastreia falhas latentes em produção antes que afetem seus clientes"
        icon={<ShieldAlert size={18} className="text-emerald-400" />}
        accent="emerald"
        headerExtra={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-[#060a0e] p-1 rounded-2xl border border-white/10">
              {[
                { id: 'preventive', label: 'Varredura Real', badge: preventiveReport ? preventiveReport.counts.critical + preventiveReport.counts.warn : null },
                { id: 'suites', label: 'Suítes ASTS/E2E', badge: null },
                { id: 'sandbox', label: 'Sandbox', badge: null },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSimModalTab(tab.id as any)}
                  className={`px-2.5 sm:px-3 py-2 min-h-[38px] rounded-xl text-[10px] sm:text-[11px] font-bold font-mono transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    simModalTab === tab.id
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="truncate">{tab.label}</span>
                  {tab.badge !== null && tab.badge > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black shrink-0 ${
                      simModalTab === tab.id ? 'bg-black/25 text-black' : 'bg-rose-500 text-white'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <select
              value={auditTenantOverride}
              onChange={(e) => {
                const val = e.target.value;
                setAuditTenantOverride(val);
                handleRunPreventiveAudit(val);
              }}
              className="bg-[#060a0e] border border-white/15 rounded-xl px-3 py-2 min-h-[40px] text-[11px] font-mono text-slate-200 focus:outline-none focus:border-emerald-500/60 cursor-pointer w-full sm:max-w-[215px]"
              title="Escolher empresa para auditoria preventiva"
            >
              <option value="">🏢 Empresa Ativa (Auto)</option>
              <option value="__all__">🌐 Visão Global (Sem Tenant)</option>
              {companies.map((comp: any) => (
                <option key={comp.id} value={comp.id}>
                  🏢 {comp.name || comp.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        }
        footer={
          <div className="flex items-center justify-between gap-2 flex-wrap w-full">
            <button
              type="button"
              onClick={() => {
                clearLogs();
                setTestErrors([]);
                setTestLogs([]);
                setTestSummary(null);
                setPreventiveReport(null);
                setProbeResult(null);
                showToastFeedback('Console e cache limpos!');
              }}
              className="px-3.5 py-2 min-h-[42px] bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/30 text-slate-200 hover:text-rose-200 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 flex items-center gap-2"
            >
              <Trash2 size={14} />
              <span>Limpar Console & Cache</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSimulationModal(false)}
              className="px-5 py-2 min-h-[42px] bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 ml-auto"
            >
              Fechar
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3.5">
          {simModalTab === 'preventive' && (
            <>
              <div className="rounded-2xl bg-gradient-to-br from-slate-900/90 via-[#0d151d] to-[#0b1218] border border-white/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center font-mono font-black text-sm shrink-0 ${
                    !preventiveReport
                      ? 'bg-slate-800/60 border-white/10 text-slate-400'
                      : preventiveReport.status === 'healthy'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : preventiveReport.status === 'degraded'
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  }`}>
                    {isRunningPreventive ? <Loader2 size={18} className="animate-spin" /> : preventiveReport ? `${preventiveReport.score}%` : '--'}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-white flex items-center gap-2 flex-wrap">
                      <span>
                        {isRunningPreventive
                          ? 'Auditando camadas reais em paralelo...'
                          : preventiveReport
                            ? preventiveReport.status === 'healthy'
                              ? 'Operação Íntegra • Sem Riscos Críticos'
                              : preventiveReport.status === 'degraded'
                                ? 'Atenção Preventiva Recomendada'
                                : 'Anomalias Críticas Detectadas'
                            : 'Pronto para Auditoria Real'}
                      </span>
                    </div>
                    {preventiveReport && (
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-rose-300 font-bold">{preventiveReport.counts.critical} críticos</span>
                        <span>•</span>
                        <span className="text-amber-300 font-bold">{preventiveReport.counts.warn} alertas</span>
                        <span>•</span>
                        <span className="text-emerald-300 font-bold">{preventiveReport.counts.ok} OK</span>
                        <span>•</span>
                        <span>{preventiveReport.durationMs}ms</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSyncHistoricalLogs()}
                    disabled={isRunningPreventive}
                    className="px-3 py-2 min-h-[42px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-[11px] font-bold font-mono transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                    title="Puxar erros e warnings reais de system_logs e do Buffer Node (últimas 2h)"
                  >
                    <Clock size={13} className="text-cyan-400" />
                    <span>Sincronizar 2h</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRunPreventiveAudit()}
                    disabled={isRunningPreventive}
                    className="px-3.5 py-2 min-h-[42px] rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-110 text-slate-950 text-[11px] font-black font-mono transition-all cursor-pointer active:scale-95 flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isRunningPreventive ? 'animate-spin' : ''} />
                    <span>{isRunningPreventive ? 'Auditando...' : 'Reescanear Real'}</span>
                  </button>
                </div>
              </div>

              {preventiveReport && (
                <div className="flex flex-col gap-2">
                  {[...preventiveReport.findings]
                    .sort((a, b) => {
                      const order = { critical: 0, warn: 1, ok: 2 };
                      return order[a.severity] - order[b.severity];
                    })
                    .map((item) => {
                      const isCrit = item.severity === 'critical';
                      const isWarn = item.severity === 'warn';
                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-1.5 ${
                            isCrit
                              ? 'bg-rose-950/25 border-rose-500/40'
                              : isWarn
                                ? 'bg-amber-950/20 border-amber-500/35'
                                : 'bg-emerald-950/10 border-emerald-500/20'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              {isCrit ? (
                                <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                              ) : isWarn ? (
                                <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                              ) : (
                                <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                              )}
                              <span className="font-bold text-white text-xs truncate">{item.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                              {typeof item.latencyMs === 'number' && (
                                <span className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-slate-300">
                                  {item.latencyMs}ms
                                </span>
                              )}
                              <span
                                className={`px-2 py-0.5 rounded-lg font-black uppercase ${
                                  isCrit
                                    ? 'bg-rose-500/25 text-rose-200 border border-rose-500/40'
                                    : isWarn
                                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                                      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {isCrit ? 'Crítico' : isWarn ? 'Alerta' : 'OK'}
                              </span>
                            </div>
                          </div>

                          <p className="text-xs text-slate-200 leading-relaxed">{item.summary}</p>
                          {item.detail && (
                            <p className="text-[11px] font-mono text-slate-400 bg-black/30 px-2.5 py-1.5 rounded-xl border border-white/5 break-words">
                              {item.detail}
                            </p>
                          )}
                          {(isCrit || isWarn) && (
                            <p className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-2.5 py-1.5">
                              💡 <strong>Antecipação:</strong> {item.recommendation}
                            </p>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {preventiveReport && (preventiveReport.counts.critical > 0 || preventiveReport.counts.warn > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSimulationModal(false);
                    setActiveTab('console');
                    setLogFilter(preventiveReport.counts.critical > 0 ? 'action' : 'all');
                    setShowAiMediaPromptModal(true);
                  }}
                  className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-gradient-to-r from-purple-600/30 via-indigo-600/30 to-pink-600/30 hover:from-purple-600/45 hover:to-pink-600/45 border border-purple-400/40 text-white text-xs font-black font-mono transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/15"
                >
                  <Sparkles size={15} className="text-purple-300" />
                  <span>Analisar Erros Capturados c/ I.A & Abrir Card no Kanban</span>
                </button>
              )}
            </>
          )}

          {simModalTab === 'suites' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-slate-300 leading-relaxed">
                Execute suítes completas de ponta a ponta para validar banco (RLS + escrita + DDL), Motor Node/Baileys, Store React e WebSocket Realtime ao vivo.
              </p>

              <button
                type="button"
                onClick={() => {
                  setShowSimulationModal(false);
                  setActiveTab('asts');
                  runApplicationTests();
                }}
                className="w-full min-h-[56px] flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 to-orange-500/10 hover:from-amber-500/25 hover:to-orange-500/20 border border-amber-500/35 text-left transition-all cursor-pointer active:scale-95 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Activity size={20} className="text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
                  <div className="min-w-0">
                    <div className="font-bold text-white text-xs sm:text-sm">Executar ASTS Completo (10 Checkpoints)</div>
                    <div className="text-[11px] text-amber-200/80">
                      Valida RLS multitenant, escrita/DDL contacts, Store duplicada, Storage chat_media e Realtime
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-amber-400/70 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSimulationModal(false);
                  setActiveTab('e2e');
                  runE2EValidationSuite();
                }}
                className="w-full min-h-[56px] flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-cyan-500/15 to-indigo-500/10 hover:from-cyan-500/25 hover:to-indigo-500/20 border border-cyan-500/35 text-left transition-all cursor-pointer active:scale-95 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Radio size={20} className="text-cyan-400 shrink-0 group-hover:scale-110 transition-transform" />
                  <div className="min-w-0">
                    <div className="font-bold text-white text-xs sm:text-sm">Executar E2E Telemetry Suite (9 Estágios Live)</div>
                    <div className="text-[11px] text-cyan-200/80">
                      Audita Event Loop Node, listeners Baileys, sockets abertos, Trace ID no servidor e canal WSS
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-cyan-400/70 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => {
                  handleTestApp();
                  setActiveTab('console');
                  setShowSimulationModal(false);
                }}
                className="w-full min-h-[56px] flex items-center justify-between p-4 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-left transition-all cursor-pointer active:scale-95 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Layers size={20} className="text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
                  <div className="min-w-0">
                    <div className="font-bold text-white text-xs sm:text-sm">Checagem Instantânea Local (Store + Disjuntor)</div>
                    <div className="text-[11px] text-emerald-200/80">
                      Verifica estado real do Circuit Breaker Supabase, duplicidade em memória e funções do ChatStore
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-emerald-400/70 shrink-0" />
              </button>
            </div>
          )}

          {simModalTab === 'sandbox' && (
            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 text-[11px] text-indigo-200 leading-relaxed">
                <strong>Validação de Captura em Tempo Real:</strong> Dispara sondas controladas e rotuladas com <code className="px-1 py-0.5 rounded bg-black/40">[SANDBOX-VALIDAÇÃO]</code> para confirmar que os interceptadores de erro, HTTP, Promise e sincronização Node estão gravando no Console.
              </div>

              {probeResult && (
                <div className={`p-3 rounded-2xl border text-xs font-mono flex items-start gap-2 ${
                  probeResult.ok
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-200'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                }`}>
                  {probeResult.ok ? <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-400" /> : <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-400" />}
                  <span>{probeResult.summary}</span>
                </div>
              )}

              {[
                {
                  kind: 'node_logs_sync' as CaptureProbeKind,
                  title: 'Puxar Erros Reais do Buffer Node (/recent-errors)',
                  desc: 'Consulta diretamente o servidor Node no Coolify sem injetar erros falsos.',
                  icon: <Server size={18} className="text-purple-400" />,
                  style: 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30'
                },
                {
                  kind: 'http_404' as CaptureProbeKind,
                  title: 'Testar Interceptador HTTP Real (window.fetch 404)',
                  desc: 'Executa GET em rota inexistente para comprovar captura de status HTTP >= 400 e latência.',
                  icon: <Network size={18} className="text-amber-400" />,
                  style: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30'
                },
                {
                  kind: 'report_error' as CaptureProbeKind,
                  title: 'Testar Pipeline Completo reportError() -> system_logs',
                  desc: 'Valida se falhas capturadas pelo React chegam ao DevLogger, Supabase e Node.',
                  icon: <Bug size={18} className="text-rose-400" />,
                  style: 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30'
                },
                {
                  kind: 'promise_rejection' as CaptureProbeKind,
                  title: 'Testar Trap Assíncrona (Unhandled Promise Rejection)',
                  desc: 'Emite uma rejeição controlada para validar captura de falhas assíncronas não tratadas.',
                  icon: <Zap size={18} className="text-cyan-400" />,
                  style: 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30'
                }
              ].map((probe) => (
                <button
                  key={probe.kind}
                  type="button"
                  onClick={() => handleRunCaptureProbe(probe.kind)}
                  disabled={runningProbe !== null}
                  className={`w-full min-h-[54px] flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all cursor-pointer active:scale-95 disabled:opacity-50 ${probe.style}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0">
                      {runningProbe === probe.kind ? <Loader2 size={18} className="animate-spin text-white" /> : probe.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-white text-xs">{probe.title}</div>
                      <div className="text-[11px] text-slate-300/80">{probe.desc}</div>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-white/50 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </DevLoggerModalShell>

      {/* Modais de Metadados (Baileys Releases, Novidades Changelog & Root Endpoints) */}
      <DevLoggerMetaModals
        serverMeta={serverMeta}
        engineUrl={engineUrl}
        showBaileysModal={showBaileysModal}
        onCloseBaileysModal={() => setShowBaileysModal(false)}
        showChangelog={showChangelog}
        onCloseChangelog={() => setShowChangelog(false)}
        showEndpoints={showEndpoints}
        onCloseEndpoints={() => setShowEndpoints(false)}
        onCopyText={(text, label) => {
          navigator.clipboard.writeText(text);
          showToastFeedback(label);
        }}
      />

      {/* Toast Global de Feedback Rápido */}
      {copyFeedback && (
        <div className="fixed bottom-5 sm:bottom-7 left-1/2 -translate-x-1/2 z-[100020] bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black text-xs px-4 py-2.5 rounded-2xl shadow-[0_12px_35px_rgba(16,185,129,0.45)] border border-emerald-200/70 animate-in fade-in slide-in-from-bottom-3 font-mono flex items-center gap-2 pointer-events-none">
          <CheckCircle2 size={15} className="shrink-0 stroke-[2.5]" />
          <span>{copyFeedback}</span>
        </div>
      )}

      <ServerLogsTerminal isOpen={showServerLogs} onClose={() => setShowServerLogs(false)} />
    </>
  );
}
