import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from '../../hooks/usePushNotifications';
import { 
  KeyRound, 
  User, 
  Clock, 
  MapPin, 
  Camera, 
  CheckCircle2, 
  XCircle,
  AlertTriangle, 
  X, 
  LogOut, 
  Compass, 
  ChevronRight, 
  ChevronDown,
  Smile, 
  Lock,
  ArrowRight,
  Sparkles,
  RefreshCw,
  FolderOpen,
  ClipboardList,
  Star,
  Search,
  GripVertical,
  Eye,
  Check,
  Award,
  Download,
  Tablet,
  Smartphone,
  Share,
  ChevronLeft,
  Plus,
  CheckSquare,
  List,
  FileText,
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  Settings,
  Tag,
  Copy,
  QrCode,
  ExternalLink
} from 'lucide-react';
import { Reorder } from 'framer-motion';

interface OperatorProfile {
  id: string;
  name: string;
  pin: string;
  role: string;
  is_active: boolean;
  tenant_id?: string;
}

interface ChecklistToExecute {
  id: string;
  title: string;
  description: string;
  category: string;
  tags?: string[];
  sector_name: string;
  sector_id: string;
  use_unit_schedule_rules: boolean;
  min_time_lead_minutes: number;
  max_time_lag_minutes: number;
  unit_id: string;
  unit_name: string;
  unit_latitude: number | null;
  unit_longitude: number | null;
  unit_radius_meters: number;
  require_geolocation: boolean;
  schedule_time?: string;
  schedule_times?: string[];
  schedule_id?: string;
  responsible_ids?: string[];
  items_list?: any[];
}

interface ExecutionResponse {
  itemId: string;
  value: string;
  isConforming: boolean;
  isMetaOk: boolean;
  isDone: boolean;
  observation?: string;
  evidenceUrl?: string;
  evidenceUploading?: boolean;
  answeredAt?: string;
  answeredBy?: string;
}

export default function ChecklistTablet() {
  const { tenantIdParam } = useParams<{ tenantIdParam?: string }>();
  const [tenantId, setTenantId] = useState<string | null>(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlTenant = tenantIdParam || searchParams.get('tenant') || searchParams.get('t');
    if (urlTenant && urlTenant !== 'undefined') {
      localStorage.setItem('current_tenant_id', urlTenant);
      return urlTenant;
    }
    return localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
  });
  const apiBaseUrl = (import.meta.env.VITE_WHATSAPP_ENGINE_URL || '').replace(/\/$/, '');

  // Estados de Autenticação / PIN
  const [operators, setOperators] = useState<OperatorProfile[]>([]);
  const [selectedOperator, setSelectedOperator] = useState<OperatorProfile | null>(null);
  const [pinCode, setPinCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [loggedInUser, setLoggedInUser] = useState<OperatorProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);

  // Estados Operacionais
  const [checklists, setChecklists] = useState<ChecklistToExecute[]>([]);
  const [loadingChecklists, setLoadingChecklists] = useState(false);
  const [activeChecklist, setActiveChecklist] = useState<ChecklistToExecute | null>(null);

  // =========================================================================
  // CONFIGURAÇÃO DE SETOR DO TABLET & DESPERTADOR DE HORÁRIO EXATO (PWA)
  // =========================================================================
  const [totemSectorId, setTotemSectorId] = useState<string>(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlSecId = searchParams.get('sectorId');
    if (urlSecId) {
      localStorage.setItem('totem_sector_id', urlSecId);
      return urlSecId;
    }
    return localStorage.getItem('totem_sector_id') || '';
  });
  const [totemSectorName, setTotemSectorName] = useState<string>(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlSecName = searchParams.get('sector') || searchParams.get('sectorName');
    if (urlSecName) {
      localStorage.setItem('totem_sector_name', urlSecName);
      return urlSecName;
    }
    return localStorage.getItem('totem_sector_name') || 'Cozinha';
  });
  const [filterByTotemSector, setFilterByTotemSector] = useState<boolean>(() => localStorage.getItem('totem_filter_by_sector') !== 'false');
  const [sectorsList, setSectorsList] = useState<Array<{ id: string; name: string; unit_id?: string }>>([]);
  const [unitsList, setUnitsList] = useState<Array<{ id: string; name: string }>>([]);
  const [allTenantChecklists, setAllTenantChecklists] = useState<ChecklistToExecute[]>([]);
  const [isSectorAlarmModalOpen, setIsSectorAlarmModalOpen] = useState(false);
  const [newSectorInputName, setNewSectorInputName] = useState('');
  const [creatingSector, setCreatingSector] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'subscribing' | 'active' | 'denied' | 'error'>('idle');
  const [pushEndpoint, setPushEndpoint] = useState<string>('');
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [scheduleTimeInputs, setScheduleTimeInputs] = useState<Record<string, string>>({});
  const [savingScheduleId, setSavingScheduleId] = useState<string | null>(null);
  const [testingClosedAlarm, setTestingClosedAlarm] = useState(false);
  const [closedAlarmCountdown, setClosedAlarmCountdown] = useState<number>(0);

  // Estado do Alarme Sonoro de Tela Cheia (Disparo em Horário Exato)
  const [activeAlarmModal, setActiveAlarmModal] = useState<{
    checklistId: string;
    checklistTitle: string;
    checklistCategory: string;
    sectorId: string;
    sectorName: string;
    scheduleTime: string;
    tasks: Array<{ id: string; title: string; description?: string; is_required?: boolean; is_critical?: boolean }>;
    isLeadWarning?: boolean;
  } | null>(null);
  const [isAlarmMuted, setIsAlarmMuted] = useState(false);
  const [pendingAlarmChecklistId, setPendingAlarmChecklistId] = useState<string | null>(null);

  const sirenIntervalRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const firedLocalAlarmsRef = useRef<Set<string>>(new Set());
  const snoozedLocalAlarmsRef = useRef<Array<{ triggerAtMs: number; payload: any }>>([]);
  const wakeLockSentinelRef = useRef<any>(null);

  // Estados para Histórico de Concluídos
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [completedExecutions, setCompletedExecutions] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeExecution, setActiveExecution] = useState<any | null>(null);
  const [executionResponses, setExecutionResponses] = useState<any[]>([]);
  const [loadingExecutionDetails, setLoadingExecutionDetails] = useState(false);
  
  // Geoposicionamento do Aparelho
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number; precision: number } | null>(null);
  const [distanceFromUnit, setDistanceFromUnit] = useState<number | null>(null);
  const [geoError, setGeoError] = useState('');
  const [locating, setLocating] = useState(false);

  // Respostas e preenchimento
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [itemsToAnswer, setItemsToAnswer] = useState<any[]>([]);
  const [responses, setResponses] = useState<Record<string, ExecutionResponse>>({});
  const [checkedSubtasks, setCheckedSubtasks] = useState<Record<string, boolean>>({});

  // Estado de persistência em tempo real (Auto-Save)
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [inProgressExecutions, setInProgressExecutions] = useState<Record<string, { executionId: string; completedCount: number }>>({});
  const [todayCompletedChecklists, setTodayCompletedChecklists] = useState<Record<string, { executionId: string; completedAt: string; score: number }>>({});

  // Filtros locais e ordenação
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [activeCategoryEditItemId, setActiveCategoryEditItemId] = useState<string | null>(null);
  const [newInlineCategoryName, setNewInlineCategoryName] = useState('');

  // Toast e Modais de Sucesso
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successScore, setSuccessScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Instalação PWA dedicada ao Tablet
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // Estados de Interface Mobile (Fidelidade às 5 Fotos de Referência)
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [mobileStepIndex, setMobileStepIndex] = useState(0);
  const [mobileEvidenceModalItem, setMobileEvidenceModalItem] = useState<any | null>(null);
  const [mobileEvidencePhoto, setMobileEvidencePhoto] = useState<string | null>(null);
  const [mobileSuccessOverlay, setMobileSuccessOverlay] = useState(false);
  const [mobileTab, setMobileTab] = useState<'checklists' | 'setores' | 'respostas' | 'add'>('checklists');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const checkStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(checkStandalone);

    // Marca este dispositivo como Totem Cozinha Standalone e vincula o manifesto exclusivo /manifest-totem.webmanifest
    try {
      localStorage.setItem('totem_standalone_mode', 'true');
      document.title = `Totem ${totemSectorName || 'Cozinha'} • Checklists & Alarmes`;
      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (manifestLink) {
        manifestLink.setAttribute('href', '/manifest-totem.webmanifest');
      } else {
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = '/manifest-totem.webmanifest';
        document.head.appendChild(link);
      }
    } catch (e) {}

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('install') === '1' && !checkStandalone) {
      setIsInstallModalOpen(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallPwa = async () => {
    // Já garante a ativação do despertador Web Push do setor Cozinha ao instalar
    handleActivateSectorPushAlarm(totemSectorId || '', totemSectorName || 'Cozinha', true);

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          showToast('success', '✅ Aplicativo Totem Cozinha instalado no tablet Android com alarme ativo!');
          setDeferredPrompt(null);
          setIsInstallModalOpen(false);
        }
      } catch (err) {
        setIsInstallModalOpen(true);
      }
    } else if (isStandalone) {
      setIsInstallModalOpen(true);
    } else {
      setIsInstallModalOpen(true);
    }
  };

  useEffect(() => {
    if (activeChecklist && activeChecklist.id && itemsToAnswer.length === 0) {
      handleStartChecklist(activeChecklist);
    }
  }, [activeChecklist?.id]);

  useEffect(() => {
    if (!(window as any).confetti) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const triggerConfetti = (isFull: boolean = false) => {
    const confettiFunc = (window as any).confetti;
    if (confettiFunc) {
      if (isFull) {
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;
        const interval = setInterval(function() {
          const timeLeft = animationEnd - Date.now();
          if (timeLeft <= 0) return clearInterval(interval);
          const particleCount = 50 * (timeLeft / duration);
          confettiFunc(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
          confettiFunc(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
        }, 250);
      } else {
        confettiFunc({
          particleCount: 45,
          spread: 60,
          origin: { y: 0.85 },
          zIndex: 9999
        });
      }
    }
  };

  const getGamifiedIncentive = (percent: number, completed: number, total: number, userName?: string) => {
    const name = userName ? userName.split(' ')[0] : 'Operador';
    if (percent === 0) return `Olá, ${name}! Vamos começar as tarefas do turno de hoje? 🚀`;
    if (percent < 30) return `Excelente início, ${name}! Mais um passo e logo terminamos! 💪`;
    if (percent < 60) return `Bom ritmo, ${name}! Metade do caminho já foi. Continue focado! 🔥`;
    if (percent < 90) return `Você é fera! Falta muito pouco para finalizar tudo. Reta final! 🏆`;
    if (percent < 100) return `Só mais uma ou duas tarefas! Falta o último gás, ${name}! 🚀`;
    return `Parabéns, ${name}! Todas as tarefas foram concluídas perfeitamente! 🌟✨`;
  };

  const loadOperators = async () => {
    try {
      let effectiveTenantId = tenantId || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');

      // Se o tablet abriu pela rota limpa /totem-cozinha sem tenant salvo, descobre automaticamente o tenant ativo dos checklists/operadores
      if (!effectiveTenantId || effectiveTenantId === 'undefined') {
        const { data: chkTenant } = await supabase
          .from('checklists')
          .select('tenant_id')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        if (chkTenant?.tenant_id) {
          effectiveTenantId = chkTenant.tenant_id;
          localStorage.setItem('current_tenant_id', effectiveTenantId);
          setTenantId(effectiveTenantId);
        }
      }
      
      let query = supabase
        .from('v_checklist_operators')
        .select('id, name, pin, role, is_active, tenant_id')
        .eq('is_active', true);
      
      if (effectiveTenantId) {
        query = query.eq('tenant_id', effectiveTenantId);
      }
      
      let { data: opsData, error: opsErr } = await query;

      // Fallback para a tabela users_profiles se v_checklist_operators estiver vazia
      if (!opsData || opsData.length === 0) {
        let profileQuery = supabase
          .from('users_profiles')
          .select('id, name, pin, role, is_active, tenant_id')
          .eq('is_active', true);
        if (effectiveTenantId) {
          profileQuery = profileQuery.eq('tenant_id', effectiveTenantId);
        }
        const { data: profData } = await profileQuery;
        if (profData && profData.length > 0) {
          opsData = profData;
        }
      }

      if (opsErr && (!opsData || opsData.length === 0)) throw opsErr;
      
      const allOps = opsData || [];
      if (!effectiveTenantId && allOps[0]?.tenant_id) {
        localStorage.setItem('current_tenant_id', allOps[0].tenant_id);
        setTenantId(allOps[0].tenant_id);
      }

      setAllProfiles(allOps);

      const opsWithPin = allOps.filter(o => o.pin && o.pin.trim().length === 5);
      setOperators(opsWithPin.length > 0 ? opsWithPin : allOps);
    } catch (e) {
      console.error('Erro ao buscar e carregar operadores no totem:', e);
    }
  };

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToastMsg({ type, msg });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // =========================================================================
  // MOTOR DE SETOR DO TABLET & ALARME EM HORÁRIO EXATO (COM APP ABERTO OU FECHADO)
  // =========================================================================
  const doesChecklistMatchSector = (chk: Partial<ChecklistToExecute>, targetSecId: string, targetSecName: string): boolean => {
    const normId = (targetSecId || '').trim();
    const normName = (targetSecName || '').trim().toLowerCase();

    if (normId === 'ALL' || normName === 'todos' || normName === 'all' || (!normId && !normName)) {
      return true;
    }

    if (normId && chk.sector_id && chk.sector_id === normId) {
      return true;
    }

    const chkSecName = (chk.sector_name || '').trim().toLowerCase();
    if (normName && chkSecName && (chkSecName === normName || chkSecName.includes(normName) || normName.includes(chkSecName))) {
      return true;
    }

    if (normName) {
      const title = (chk.title || '').toLowerCase();
      const cat = (chk.category || '').toLowerCase();
      const tags = (chk.tags || []).map(t => String(t).toLowerCase());
      if (title.includes(normName) || cat.includes(normName) || tags.some(t => t.includes(normName))) {
        return true;
      }
    }

    return false;
  };

  const syncTotemSectorToSW = (secId: string, secName: string) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SYNC_TOTEM_SECTOR',
        config: {
          sectorId: secId || 'ALL',
          sectorName: secName || 'Cozinha',
          tenantId,
          apiBaseUrl
        }
      });
    }
  };

  const startSirenSound = (sectorName: string, checklistTitle: string, taskTitles: string[] = []) => {
    stopSirenSound();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        const playPulse = () => {
          if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') return;
          try {
            if (audioCtxRef.current.state === 'suspended') {
              audioCtxRef.current.resume().catch(() => {});
            }
            const now = audioCtxRef.current.currentTime;
            const osc = audioCtxRef.current.createOscillator();
            const gain = audioCtxRef.current.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(1174.66, now + 0.22);
            osc.frequency.setValueAtTime(880, now + 0.44);

            gain.gain.setValueAtTime(0.01, now);
            gain.gain.exponentialRampToValueAtTime(0.35, now + 0.04);
            gain.gain.setValueAtTime(0.35, now + 0.58);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

            osc.connect(gain);
            gain.connect(audioCtxRef.current.destination);
            osc.start(now);
            osc.stop(now + 0.66);
          } catch (e) {}

          if ('vibrate' in navigator) {
            try { navigator.vibrate([400, 150, 400]); } catch (e) {}
          }
        };

        playPulse();
        sirenIntervalRef.current = setInterval(playPulse, 1100);
      }
    } catch (e) {
      console.warn('Aviso ao iniciar sirene Web Audio:', e);
    }

    // Anúncio de Voz em Português (TTS) para a Cozinha
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const tasksPreview = taskTitles.slice(0, 3).join(', ');
        const utterance = new SpeechSynthesisUtterance(
          `Atenção setor ${sectorName}! Horário do checklist ${checklistTitle}. ${tasksPreview ? `Tarefas: ${tasksPreview}` : 'Verifique as tarefas na tela.'}`
        );
        utterance.lang = 'pt-BR';
        utterance.rate = 1.02;
        utterance.pitch = 1.05;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {}
  };

  const stopSirenSound = () => {
    if (sirenIntervalRef.current) {
      clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (e) {}
      audioCtxRef.current = null;
    }
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if ('vibrate' in navigator) {
        navigator.vibrate(0);
      }
    } catch (e) {}
  };

  const triggerFullAlarmModal = (payload: {
    checklistId: string;
    checklistTitle: string;
    checklistCategory?: string;
    sectorId?: string;
    sectorName?: string;
    scheduleTime?: string;
    tasks?: any[];
    isLeadWarning?: boolean;
  }) => {
    const matchedChk = allTenantChecklists.find(c => c.id === payload.checklistId) || checklists.find(c => c.id === payload.checklistId);
    const rawTasks = (payload.tasks && payload.tasks.length > 0)
      ? payload.tasks
      : (matchedChk?.items_list || []);

    const formattedTasks = rawTasks.map((t: any, idx: number) => ({
      id: t.id || String(idx),
      title: String(t.title || '').replace(/^\[.*?\]\s*/, ''),
      description: t.description || '',
      is_required: t.is_required ?? true,
      is_critical: t.is_critical ?? false
    }));

    const secName = payload.sectorName || matchedChk?.sector_name || totemSectorName || 'Cozinha';
    const chkTitle = payload.checklistTitle || matchedChk?.title || 'Rotina Operacional';
    const schTime = payload.scheduleTime || matchedChk?.schedule_time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    setIsAlarmMuted(false);
    setActiveAlarmModal({
      checklistId: payload.checklistId,
      checklistTitle: chkTitle,
      checklistCategory: payload.checklistCategory || matchedChk?.category || 'Operacional',
      sectorId: payload.sectorId || matchedChk?.sector_id || totemSectorId || 'ALL',
      sectorName: secName,
      scheduleTime: schTime,
      tasks: formattedTasks,
      isLeadWarning: payload.isLeadWarning
    });

    startSirenSound(secName, chkTitle, formattedTasks.map(t => t.title));
  };

  const loadTenantSectorsAndSchedules = async () => {
    const effectiveTenantId = tenantId || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
    if (!effectiveTenantId) return;

    try {
      const [secRes, unitRes, chkRes, schRes, todayRes] = await Promise.all([
        supabase.from('sectors').select('id, name, unit_id').eq('tenant_id', effectiveTenantId).order('name'),
        supabase.from('units').select('id, name').eq('tenant_id', effectiveTenantId).order('name'),
        supabase
          .from('checklists')
          .select(`
            id, title, description, category, tags, sector_id, weight, use_unit_schedule_rules,
            min_time_lead_minutes, max_time_lag_minutes, responsible_ids,
            sectors(id, name, unit_id, units(id, name, latitude, longitude, radius_meters, require_geolocation)),
            checklist_items(id, title, description, response_type, is_required, is_critical, require_evidence, sort_order)
          `)
          .eq('tenant_id', effectiveTenantId)
          .eq('is_active', true),
        supabase
          .from('checklist_schedules')
          .select('id, checklist_id, start_time, recurrency, days_of_week, days_of_month, shift, is_active')
          .eq('tenant_id', effectiveTenantId)
          .eq('is_active', true),
        (() => {
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          return supabase
            .from('checklist_executions')
            .select('id, checklist_id, completed_at, score')
            .eq('tenant_id', effectiveTenantId)
            .gte('completed_at', startOfToday.toISOString())
            .in('status', ['completed_on_time', 'completed_late']);
        })()
      ]);

      const loadedSectors = secRes.data || [];
      const loadedUnits = unitRes.data || [];
      setSectorsList(loadedSectors);
      setUnitsList(loadedUnits);

      // Se o tablet ainda não tiver setor salvo, vincula automaticamente ao setor "Cozinha" se existir
      const savedSecId = localStorage.getItem('totem_sector_id');
      const savedSecName = localStorage.getItem('totem_sector_name');
      if (!savedSecId && loadedSectors.length > 0) {
        const kitchenSec = loadedSectors.find((s: any) => s.name?.toLowerCase().includes('cozinha')) || loadedSectors[0];
        if (kitchenSec) {
          setTotemSectorId(kitchenSec.id);
          setTotemSectorName(kitchenSec.name);
          localStorage.setItem('totem_sector_id', kitchenSec.id);
          localStorage.setItem('totem_sector_name', kitchenSec.name);
          syncTotemSectorToSW(kitchenSec.id, kitchenSec.name);
        }
      } else {
        syncTotemSectorToSW(savedSecId || totemSectorId, savedSecName || totemSectorName);
      }

      const schedulesByChecklist: Record<string, string[]> = {};
      (schRes.data || []).forEach((s: any) => {
        if (!s.checklist_id || !s.start_time) return;
        const normTime = String(s.start_time).slice(0, 5);
        if (!schedulesByChecklist[s.checklist_id]) schedulesByChecklist[s.checklist_id] = [];
        if (!schedulesByChecklist[s.checklist_id].includes(normTime)) {
          schedulesByChecklist[s.checklist_id].push(normTime);
        }
      });
      Object.values(schedulesByChecklist).forEach(arr => arr.sort());

      const mappedChecklists: ChecklistToExecute[] = (chkRes.data || []).map((chk: any) => {
        const sector = chk.sectors;
        const unit = sector?.units;
        const times = schedulesByChecklist[chk.id] || [];
        const sortedItems = [...(chk.checklist_items || [])].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

        return {
          id: chk.id,
          title: chk.title,
          description: chk.description,
          category: chk.category,
          tags: chk.tags || [],
          sector_name: sector?.name || 'Cozinha',
          sector_id: chk.sector_id || '',
          use_unit_schedule_rules: chk.use_unit_schedule_rules,
          min_time_lead_minutes: chk.min_time_lead_minutes || 0,
          max_time_lag_minutes: chk.max_time_lag_minutes || 60,
          unit_id: unit?.id || '',
          unit_name: unit?.name || 'Geral',
          unit_latitude: unit?.latitude || null,
          unit_longitude: unit?.longitude || null,
          unit_radius_meters: unit?.radius_meters || 150,
          require_geolocation: unit?.require_geolocation || false,
          schedule_time: times[0] || undefined,
          schedule_times: times,
          responsible_ids: chk.responsible_ids || [],
          items_list: sortedItems
        };
      });

      setAllTenantChecklists(mappedChecklists);

      if (todayRes.data) {
        const todayMap: Record<string, { executionId: string; completedAt: string; score: number }> = {};
        todayRes.data.forEach((td: any) => {
          todayMap[td.checklist_id] = {
            executionId: td.id,
            completedAt: td.completed_at,
            score: td.score || 100
          };
        });
        setTodayCompletedChecklists(todayMap);
      }
    } catch (e) {
      console.error('Erro ao carregar setores e agendamentos do Totem:', e);
    }
  };

  const handleActivateSectorPushAlarm = async (overrideSecId?: string, overrideSecName?: string, silent = false) => {
    const targetSecId = overrideSecId !== undefined ? overrideSecId : (totemSectorId || 'ALL');
    const targetSecName = overrideSecName !== undefined ? overrideSecName : (totemSectorName || 'Cozinha');

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      if (!silent) showToast('error', 'Este navegador não suporta Web Push. Use o Google Chrome no Android.');
      return;
    }

    setPushStatus('subscribing');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        if (!silent) showToast('error', 'Permissão de notificação negada. Ative as notificações nas configurações do Chrome/Android.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const convertedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey
        });
      }

      const subJson = JSON.parse(JSON.stringify(subscription));
      setPushEndpoint(subJson.endpoint || '');

      const userEmail = localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email') || null;
      const taggedUserAgent = `[TOTEM_SECTOR:${targetSecId || 'ALL'}|${targetSecName || 'Cozinha'}] ${navigator.userAgent}`;

      // 1. Grava diretamente no Supabase (push_subscriptions)
      if (tenantId) {
        await supabase.from('push_subscriptions').upsert({
          tenant_id: tenantId,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
          user_agent: taggedUserAgent,
          email: userEmail ? userEmail.trim().toLowerCase() : null
        }, { onConflict: 'endpoint' });
      }

      // 2. Sincroniza também com o servidor Node/WebPush se disponível
      if (apiBaseUrl && tenantId) {
        fetch(`${apiBaseUrl}/api/v1/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
          body: JSON.stringify({
            tenantId,
            subscription: subJson,
            userAgent: navigator.userAgent,
            email: userEmail,
            sectorId: targetSecId || 'ALL',
            sectorName: targetSecName || 'Cozinha'
          })
        }).catch(() => {});
      }

      // 3. Sincroniza com o Service Worker (IndexedDB)
      syncTotemSectorToSW(targetSecId || 'ALL', targetSecName || 'Cozinha');

      setPushStatus('active');
      if (!silent) {
        showToast('success', `🔔 Despertador do setor "${targetSecName}" ativado! Funciona mesmo com o app fechado.`);
      }
    } catch (err: any) {
      console.error('Erro ao ativar Web Push do setor:', err);
      setPushStatus('error');
      if (!silent) showToast('error', 'Falha ao registrar Web Push no tablet.');
    }
  };

  const handleSelectTotemSector = async (secId: string, secName: string) => {
    setTotemSectorId(secId);
    setTotemSectorName(secName);
    localStorage.setItem('totem_sector_id', secId);
    localStorage.setItem('totem_sector_name', secName);
    syncTotemSectorToSW(secId, secName);
    await handleActivateSectorPushAlarm(secId, secName, true);
    showToast('success', `✅ Tablet configurado para o Setor: ${secName}!`);
  };

  const handleCreateNewSector = async () => {
    const cleanName = newSectorInputName.trim();
    if (!cleanName || !tenantId) return;
    setCreatingSector(true);
    try {
      let targetUnitId = unitsList[0]?.id;
      if (!targetUnitId) {
        const { data: newUnit } = await supabase
          .from('units')
          .insert({ tenant_id: tenantId, name: 'Unidade Principal' })
          .select()
          .single();
        if (newUnit) {
          targetUnitId = newUnit.id;
          setUnitsList([newUnit]);
        }
      }

      const { data: createdSec, error } = await supabase
        .from('sectors')
        .insert({
          tenant_id: tenantId,
          unit_id: targetUnitId,
          name: cleanName
        })
        .select()
        .single();

      if (error) throw error;
      if (createdSec) {
        setSectorsList(prev => [...prev, createdSec]);
        setNewSectorInputName('');
        await handleSelectTotemSector(createdSec.id, createdSec.name);
      }
    } catch (e: any) {
      showToast('error', `Erro ao criar setor: ${e.message || 'Falha no banco'}`);
    } finally {
      setCreatingSector(false);
    }
  };

  const handleLinkChecklistToCurrentSector = async (chkId: string) => {
    if (!totemSectorId || totemSectorId === 'ALL') {
      showToast('error', 'Selecione um setor específico (ex: Cozinha) primeiro.');
      return;
    }
    try {
      const { error } = await supabase
        .from('checklists')
        .update({ sector_id: totemSectorId })
        .eq('id', chkId);
      if (error) throw error;
      showToast('success', `Checklist vinculado ao setor ${totemSectorName}!`);
      await loadTenantSectorsAndSchedules();
      if (loggedInUser) {
        loadOperatorChecklists(loggedInUser.id, loggedInUser.role, loggedInUser.name);
      }
    } catch (e: any) {
      showToast('error', 'Falha ao vincular checklist ao setor.');
    }
  };

  const handleSaveChecklistScheduleTime = async (chk: ChecklistToExecute, newTimeStr: string) => {
    const cleanTime = (newTimeStr || '').trim().slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(cleanTime) || !tenantId) {
      showToast('error', 'Informe um horário válido no formato HH:MM (ex: 08:00).');
      return;
    }
    setSavingScheduleId(chk.id);
    try {
      let targetUnitId = chk.unit_id || unitsList[0]?.id;
      if (!targetUnitId) {
        const { data: uData } = await supabase.from('units').select('id').eq('tenant_id', tenantId).limit(1).maybeSingle();
        targetUnitId = uData?.id;
      }

      // Se o checklist ainda não estiver no setor do tablet e o tablet tiver um setor específico, vincula também
      if (totemSectorId && totemSectorId !== 'ALL' && chk.sector_id !== totemSectorId) {
        await supabase.from('checklists').update({ sector_id: totemSectorId }).eq('id', chk.id);
      }

      const { error } = await supabase.from('checklist_schedules').insert({
        tenant_id: tenantId,
        checklist_id: chk.id,
        unit_id: targetUnitId || null,
        start_time: cleanTime,
        recurrency: 'daily',
        shift: parseInt(cleanTime.split(':')[0], 10) < 12 ? 'Manhã' : parseInt(cleanTime.split(':')[0], 10) < 18 ? 'Tarde' : 'Noite',
        start_date: new Date().toISOString().split('T')[0],
        is_active: true
      });

      if (error) throw error;
      showToast('success', `⏰ Alarme de ${cleanTime} salvo para "${chk.title}"!`);
      await loadTenantSectorsAndSchedules();
      if (loggedInUser) {
        loadOperatorChecklists(loggedInUser.id, loggedInUser.role, loggedInUser.name);
      }
    } catch (e: any) {
      showToast('error', `Erro ao salvar horário: ${e.message || 'Falha'}`);
    } finally {
      setSavingScheduleId(null);
    }
  };

  const handleRemoveChecklistScheduleTime = async (chkId: string, timeToRemove: string) => {
    try {
      await supabase
        .from('checklist_schedules')
        .delete()
        .eq('checklist_id', chkId)
        .ilike('start_time', `${timeToRemove}%`);
      showToast('success', `Horário ${timeToRemove} removido.`);
      await loadTenantSectorsAndSchedules();
      if (loggedInUser) {
        loadOperatorChecklists(loggedInUser.id, loggedInUser.role, loggedInUser.name);
      }
    } catch (e) {
      showToast('error', 'Erro ao remover horário.');
    }
  };

  const handleTestClosedAppAlarm = async (delaySeconds = 10) => {
    if (!tenantId) return;
    setTestingClosedAlarm(true);
    try {
      await handleActivateSectorPushAlarm(totemSectorId || 'ALL', totemSectorName || 'Cozinha', true);

      const sectorChecklists = allTenantChecklists.filter(c =>
        doesChecklistMatchSector(c, totemSectorId, totemSectorName)
      );
      const sampleChk = sectorChecklists[0] || allTenantChecklists[0];

      if (apiBaseUrl) {
        await fetch(`${apiBaseUrl}/api/v1/push/checklist-alarm-test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
          body: JSON.stringify({
            tenantId,
            sectorId: totemSectorId || 'ALL',
            sectorName: totemSectorName || 'Cozinha',
            checklistId: sampleChk?.id,
            delaySeconds,
            endpoint: pushEndpoint || undefined
          })
        }).catch(() => {});
      }

      // Fallback local via Service Worker caso o app fique em segundo plano / tela bloqueada
      setClosedAlarmCountdown(delaySeconds);
      const countdownTimer = setInterval(() => {
        setClosedAlarmCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownTimer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      setTimeout(async () => {
        setTestingClosedAlarm(false);
        // Se o app ainda estiver aberto/em background, garante o disparo da notificação nativa + modal
        const title = `🚨 ALARME ${(totemSectorName || 'COZINHA').toUpperCase()} • ${sampleChk?.title || 'Abertura Cozinha'}`;
        const tasks = sampleChk?.items_list || [
          { id: '1', title: 'Higienização das bancadas e equipamentos do setor', is_required: true },
          { id: '2', title: 'Conferência de temperatura de câmaras frias e freezers', is_required: true },
          { id: '3', title: 'Mise en place e validade dos insumos do turno', is_required: true }
        ];
        if ('serviceWorker' in navigator && Notification.permission === 'granted') {
          try {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification(title, {
              body: `⏰ Horário exato atingido! Tarefas do setor ${totemSectorName}:\n` + tasks.slice(0, 5).map((t: any, i: number) => `${i + 1}. ${String(t.title).replace(/^\[.*?\]\s*/, '')}`).join('\n'),
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              tag: `checklist_alarm_test_${Date.now()}`,
              renotify: true,
              requireInteraction: true,
              vibrate: [500, 200, 500, 200, 800, 200, 1000],
              data: {
                type: 'CHECKLIST_ALARM',
                checklistId: sampleChk?.id || '',
                checklistTitle: sampleChk?.title || 'Abertura Cozinha',
                sectorId: totemSectorId || 'ALL',
                sectorName: totemSectorName || 'Cozinha',
                tasks
              }
            } as any);
          } catch (e) {}
        }
        triggerFullAlarmModal({
          checklistId: sampleChk?.id || '',
          checklistTitle: sampleChk?.title || `Rotina ${totemSectorName}`,
          checklistCategory: sampleChk?.category || 'Operacional',
          sectorId: totemSectorId || 'ALL',
          sectorName: totemSectorName || 'Cozinha',
          scheduleTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          tasks
        });
      }, delaySeconds * 1000);

      showToast('success', `⏱️ Alarme agendado para daqui a ${delaySeconds}s! Bloqueie a tela ou minimize o app para testar.`);
    } catch (e) {
      setTestingClosedAlarm(false);
      showToast('error', 'Erro ao agendar teste de alarme.');
    }
  };

  // WakeLock para manter o tablet sempre alerta quando na tomada e sincronizar SW/Push
  useEffect(() => {
    loadOperators();
    loadTenantSectorsAndSchedules();

    const syncInterval = setInterval(() => {
      loadTenantSectorsAndSchedules();
    }, 60 * 1000);

    // Ativa automaticamente o Push do setor se já tiver permissão concedida
    if ('Notification' in window && Notification.permission === 'granted') {
      handleActivateSectorPushAlarm(
        localStorage.getItem('totem_sector_id') || 'ALL',
        localStorage.getItem('totem_sector_name') || 'Cozinha',
        true
      );
    }

    // Solicita Screen WakeLock para impedir que o tablet apague durante a operação na cozinha
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          wakeLockSentinelRef.current = await (navigator as any).wakeLock.request('screen');
          setWakeLockActive(true);
          wakeLockSentinelRef.current.addEventListener('release', () => {
            setWakeLockActive(false);
          });
        } catch (e) {}
      }
    };
    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopSirenSound();
      if (wakeLockSentinelRef.current) {
        try { wakeLockSentinelRef.current.release(); } catch (e) {}
      }
    };
  }, [tenantId]);

  // Escuta mensagens vindas do Service Worker (CHECKLIST_ALARM_TRIGGER / CHECKLIST_ALARM_CLICK) e URL Params (?alarmChecklistId=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlAlarmChkId = params.get('alarmChecklistId');
    const urlSecId = params.get('sectorId');
    const urlSecName = params.get('sectorName');
    const urlSchTime = params.get('scheduleTime');

    if (urlSecName && !localStorage.getItem('totem_sector_name')) {
      setTotemSectorId(urlSecId || 'ALL');
      setTotemSectorName(urlSecName);
    }

    if (urlAlarmChkId && allTenantChecklists.length > 0) {
      const targetChk = allTenantChecklists.find(c => c.id === urlAlarmChkId);
      if (targetChk) {
        triggerFullAlarmModal({
          checklistId: targetChk.id,
          checklistTitle: targetChk.title,
          checklistCategory: targetChk.category,
          sectorId: targetChk.sector_id,
          sectorName: targetChk.sector_name || urlSecName || totemSectorName,
          scheduleTime: urlSchTime || targetChk.schedule_time || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          tasks: targetChk.items_list || []
        });
        // Limpa a query string para não reabrir em loop
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [allTenantChecklists.length]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleSWMessage = (event: MessageEvent) => {
      if (!event.data) return;
      if (event.data.type === 'CHECKLIST_ALARM_TRIGGER' || event.data.type === 'CHECKLIST_ALARM_CLICK') {
        const p = event.data.payload || {};
        triggerFullAlarmModal({
          checklistId: p.checklistId || '',
          checklistTitle: p.checklistTitle || 'Checklist do Setor',
          checklistCategory: p.checklistCategory || 'Operacional',
          sectorId: p.sectorId || totemSectorId,
          sectorName: p.sectorName || totemSectorName,
          scheduleTime: p.scheduleTime,
          tasks: p.tasks || [],
          isLeadWarning: p.isLeadWarning
        });
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
  }, [totemSectorId, totemSectorName, allTenantChecklists]);

  // Relógio de Precisão no Cliente (Verifica a cada 15s o horário exato de Brasília para o Setor do Tablet)
  useEffect(() => {
    const checkExactTimeAlarms = () => {
      if (allTenantChecklists.length === 0) return;

      const now = new Date();
      // Checa alarmes adiados (Snooze)
      const dueSnoozes = snoozedLocalAlarmsRef.current.filter(s => now.getTime() >= s.triggerAtMs);
      if (dueSnoozes.length > 0) {
        snoozedLocalAlarmsRef.current = snoozedLocalAlarmsRef.current.filter(s => now.getTime() < s.triggerAtMs);
        triggerFullAlarmModal(dueSnoozes[0].payload);
        return;
      }

      const currentHHMM = now.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const todayKey = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      const sectorChecklists = allTenantChecklists.filter(chk =>
        doesChecklistMatchSector(chk, totemSectorId, totemSectorName)
      );

      for (const chk of sectorChecklists) {
        if (todayCompletedChecklists[chk.id]) continue;
        const times = chk.schedule_times || (chk.schedule_time ? [chk.schedule_time] : []);
        for (const t of times) {
          const normT = String(t).slice(0, 5);
          const alarmKey = `${chk.id}_${todayKey}_${normT}`;
          if (normT === currentHHMM && !firedLocalAlarmsRef.current.has(alarmKey)) {
            firedLocalAlarmsRef.current.add(alarmKey);
            triggerFullAlarmModal({
              checklistId: chk.id,
              checklistTitle: chk.title,
              checklistCategory: chk.category,
              sectorId: chk.sector_id || totemSectorId,
              sectorName: chk.sector_name || totemSectorName,
              scheduleTime: normT,
              tasks: chk.items_list || []
            });
            break;
          }
        }
      }
    };

    checkExactTimeAlarms();
    const timer = setInterval(checkExactTimeAlarms, 15 * 1000);
    return () => clearInterval(timer);
  }, [allTenantChecklists, totemSectorId, totemSectorName, todayCompletedChecklists]);

  // ==========================================
  // AUTENTICAÇÃO POR PIN DE TROCA RÁPIDA
  // ==========================================
  const handleSelectOperator = (op: OperatorProfile) => {
    setSelectedOperator(op);
    setPinCode('');
    setAuthError('');
  };

  const handleKeyPress = (num: string) => {
    setAuthError('');
    if (pinCode.length < 5) {
      const newPin = pinCode + num;
      setPinCode(newPin);
      
      if (newPin.length === 5) {
        validatePin(newPin);
      }
    }
  };

  const handleDeletePress = () => {
    setPinCode(prev => prev.slice(0, -1));
  };

  const validatePin = async (pin: string) => {
    if (selectedOperator && selectedOperator.pin === pin) {
      const op = selectedOperator;
      setLoggedInUser(op);
      setSelectedOperator(null);
      setPinCode('');
      
      setActiveTab('active');
      setActiveExecution(null);
      setActiveChecklist(null);

      const loadedList = await loadOperatorChecklists(op.id, op.role, op.name);
      loadCompletedExecutions(op.id);
      showToast('success', `Bem-vindo ao setor ${totemSectorName || 'Cozinha'}, ${op.name}!`);

      // Se o operador autenticou após clicar em "Executar Tarefas Agora" no Alarme, abre o checklist imediatamente!
      if (pendingAlarmChecklistId) {
        const targetChk =
          (loadedList || []).find(c => c.id === pendingAlarmChecklistId) ||
          allTenantChecklists.find(c => c.id === pendingAlarmChecklistId);
        setPendingAlarmChecklistId(null);
        if (targetChk) {
          handleStartChecklist(targetChk);
        }
      }
    } else {
      setPinCode('');
      setAuthError('Código PIN inválido. Tente novamente.');
    }
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    setActiveChecklist(null);
    setActiveExecution(null);
    setChecklists([]);
    setCompletedExecutions([]);
    setActiveTab('active');
  };

  const loadCompletedExecutions = async (userId: string) => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('checklist_executions')
        .select(`
          id,
          started_at,
          completed_at,
          score,
          status,
          duration_seconds,
          checklists(id, title, category, description)
        `)
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .order('completed_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setCompletedExecutions(data || []);
    } catch (e) {
      console.error('Erro ao carregar histórico de execuções:', e);
      showToast('error', 'Falha ao carregar histórico de rotinas.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadExecutionDetails = async (executionId: string) => {
    setLoadingExecutionDetails(true);
    try {
      const { data, error } = await supabase
        .from('checklist_item_responses')
        .select(`
          id,
          response_value,
          is_conforming,
          is_meta_ok,
          is_done,
          observation,
          checklist_items(title, description, response_type, require_evidence),
          checklist_evidences(url)
        `)
        .eq('execution_id', executionId);

      if (error) throw error;
      
      const mapped = (data || []).map((resp: any) => {
        const evs = resp.checklist_evidences || [];
        return {
          ...resp,
          checklist_evidences: Array.isArray(evs) ? evs : [evs].filter(Boolean)
        };
      });

      setExecutionResponses(mapped);
    } catch (e) {
      console.error('Erro ao carregar detalhes da execução:', e);
      showToast('error', 'Falha ao carregar detalhes da rotina concluída.');
    } finally {
      setLoadingExecutionDetails(false);
    }
  };

  // ==========================================
  // CARREGAR ROTINAS DO OPERADOR
  // ==========================================
  const loadOperatorChecklists = async (userId: string, userRole: string, userName?: string): Promise<ChecklistToExecute[]> => {
    setLoadingChecklists(true);
    try {
      const isPowerUser = ['company_admin', 'super_admin', 'manager'].includes(userRole);

      let allowedSectors: string[] = [];
      if (!isPowerUser) {
        const { data: sPerms } = await supabase
          .from('user_sector_permissions')
          .select('sector_id')
          .eq('user_id', userId);
        
        allowedSectors = sPerms?.map(p => p.sector_id) || [];
      }

      let allowedUnits: string[] = [];
      if (!isPowerUser) {
        const { data: uPerms } = await supabase
          .from('user_unit_permissions')
          .select('unit_id')
          .eq('user_id', userId);
        
        allowedUnits = uPerms?.map(p => p.unit_id) || [];
      }

      const [checklistsRes, schedulesRes] = await Promise.all([
        supabase
          .from('checklists')
          .select(`
            id, title, description, category, tags, sector_id, weight, use_unit_schedule_rules,
            min_time_lead_minutes, max_time_lag_minutes, responsible_ids,
            sectors(id, name, unit_id, units(id, name, latitude, longitude, radius_meters, require_geolocation)),
            checklist_items(id, title, description, response_type, is_required, is_critical, require_evidence, sort_order)
          `)
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
        supabase
          .from('checklist_schedules')
          .select('id, checklist_id, start_time, is_active')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
      ]);

      if (checklistsRes.error) throw checklistsRes.error;
      const checklistsData = checklistsRes.data || [];

      const schedulesMap: Record<string, string[]> = {};
      (schedulesRes.data || []).forEach((s: any) => {
        if (!s.checklist_id || !s.start_time) return;
        const normT = String(s.start_time).slice(0, 5);
        if (!schedulesMap[s.checklist_id]) schedulesMap[s.checklist_id] = [];
        if (!schedulesMap[s.checklist_id].includes(normT)) {
          schedulesMap[s.checklist_id].push(normT);
        }
      });
      Object.values(schedulesMap).forEach(arr => arr.sort());

      const list: ChecklistToExecute[] = checklistsData
        .map((chk: any) => {
          const sector = chk.sectors;
          const unit = sector?.units;
          const times = schedulesMap[chk.id] || [];
          const sortedItems = [...(chk.checklist_items || [])].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          
          return {
            id: chk.id,
            title: chk.title,
            description: chk.description,
            category: chk.category,
            tags: chk.tags || [],
            sector_name: sector?.name || 'Geral',
            sector_id: chk.sector_id,
            use_unit_schedule_rules: chk.use_unit_schedule_rules,
            min_time_lead_minutes: chk.min_time_lead_minutes,
            max_time_lag_minutes: chk.max_time_lag_minutes,
            unit_id: unit?.id || '',
            unit_name: unit?.name || 'Geral',
            unit_latitude: unit?.latitude || null,
            unit_longitude: unit?.longitude || null,
            unit_radius_meters: unit?.radius_meters || 150,
            require_geolocation: unit?.require_geolocation || false,
            schedule_time: times[0] || undefined,
            schedule_times: times,
            responsible_ids: chk.responsible_ids || [],
            items_list: sortedItems
          };
        })
        .filter(c => {
          // Se o tablet estiver configurado para um setor (ex: Cozinha) e o checklist pertencer a esse setor, libera para o operador do Totem
          if (totemSectorId && doesChecklistMatchSector(c, totemSectorId, totemSectorName)) {
            return true;
          }

          const hasResponsibles = c.responsible_ids && c.responsible_ids.length > 0;
          
          let isResponsible = !hasResponsibles;
          let hasDirectAssignment = false;
          if (hasResponsibles && c.responsible_ids) {
            const hasDirectId = c.responsible_ids.includes(userId);
            
            let hasNameMatch = false;
            if (userName) {
              const cleanUserName = userName.toLowerCase().trim();
              const responsibleNames = c.responsible_ids
                .map((rId: string) => allProfiles.find(p => p.id === rId)?.name || '')
                .filter(Boolean)
                .map((name: string) => name.toLowerCase().trim());
                
              hasNameMatch = responsibleNames.some((rName: string) => rName === cleanUserName || cleanUserName.includes(rName) || rName.includes(cleanUserName));
            }
            
            isResponsible = hasDirectId || hasNameMatch;
            hasDirectAssignment = isResponsible;
          }
          
          if (!isResponsible) return false;

          // Se for Admin/Manager ou se o operador foi atribuído diretamente como responsável pelo checklist, exibe!
          if (isPowerUser || hasDirectAssignment) return true;

          // Caso contrário, valida permissões de Unidade e Setor (se configuradas)
          const isUnitAllowed = allowedUnits.length === 0 || (c.unit_id && allowedUnits.includes(c.unit_id)) || !c.unit_id;
          const isSectorAllowed = allowedSectors.length === 0 || (c.sector_id && allowedSectors.includes(c.sector_id));

          return isUnitAllowed && isSectorAllowed;
        });

      setChecklists(list);

      // Busca execuções em andamento (in_progress) para este operador
      const { data: inProgData } = await supabase
        .from('checklist_executions')
        .select(`
          id,
          checklist_id,
          checklist_item_responses(id, is_done)
        `)
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .eq('status', 'in_progress');

      if (inProgData) {
        const inProgMap: Record<string, { executionId: string; completedCount: number }> = {};
        inProgData.forEach((ep: any) => {
          const resps = ep.checklist_item_responses || [];
          const doneCount = Array.isArray(resps) ? resps.filter((r: any) => r.is_done).length : 0;
          inProgMap[ep.checklist_id] = {
            executionId: ep.id,
            completedCount: doneCount
          };
        });
        setInProgressExecutions(inProgMap);
      }

      // Busca execuções concluídas HOJE para destacar rotinas já efetuadas no dia atual
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { data: todayData } = await supabase
        .from('checklist_executions')
        .select('id, checklist_id, completed_at, score')
        .eq('tenant_id', tenantId)
        .gte('completed_at', startOfToday.toISOString())
        .in('status', ['completed_on_time', 'completed_late']);

      if (todayData) {
        const todayMap: Record<string, { executionId: string; completedAt: string; score: number }> = {};
        todayData.forEach((td: any) => {
          todayMap[td.checklist_id] = {
            executionId: td.id,
            completedAt: td.completed_at,
            score: td.score || 100
          };
        });
        setTodayCompletedChecklists(todayMap);
      }
      return list;
    } catch (e) {
      console.error(e);
      showToast('error', 'Falha ao buscar checklists do operador.');
      return [];
    } finally {
      setLoadingChecklists(false);
    }
  };

  // ==========================================
  // GEOLOCALIZAÇÃO E FÓRMULA DE HAVERSINE
  // ==========================================
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  const handleStartChecklist = async (chk: ChecklistToExecute) => {
    setActiveChecklist(chk);
    setResponses({});
    setCheckedSubtasks({});
    setSearchQuery('');
    setCategoryFilter('');

    try {
      // 1. Busca itens do checklist usando 'sort_order'
      const { data: items, error } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('checklist_id', chk.id)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setItemsToAnswer(items || []);

      // 2. Busca se existe uma execução em andamento (in_progress) no banco para este operador
      if (loggedInUser) {
        // Restaura de localStorage primeiro como backup instantâneo
        const storageKey = `subtasks_${loggedInUser.id}_${chk.id}`;
        const cachedSubtasks = localStorage.getItem(storageKey);
        let restoredSubtasks: Record<string, boolean> = {};
        if (cachedSubtasks) {
          try {
            restoredSubtasks = JSON.parse(cachedSubtasks);
          } catch (e) {}
        }

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        // 1. Tenta buscar execução em andamento (in_progress)
        let { data: activeExec } = await supabase
          .from('checklist_executions')
          .select('id, started_at, status')
          .eq('tenant_id', tenantId)
          .eq('checklist_id', chk.id)
          .eq('user_id', loggedInUser.id)
          .eq('status', 'in_progress')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // 2. Se não houver em andamento, busca se foi concluída no dia atual
        if (!activeExec) {
          const { data: todayDoneExec } = await supabase
            .from('checklist_executions')
            .select('id, started_at, status')
            .eq('tenant_id', tenantId)
            .eq('checklist_id', chk.id)
            .gte('completed_at', startOfToday.toISOString())
            .in('status', ['completed_on_time', 'completed_late'])
            .order('completed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (todayDoneExec) {
            activeExec = todayDoneExec;
          }
        }

        if (activeExec) {
          setCurrentExecutionId(activeExec.id);
          setStartedAt(activeExec.started_at);

          // Restaura respostas salvas previamente no banco (seja em andamento ou concluída no dia)
          const { data: savedResps } = await supabase
            .from('checklist_item_responses')
            .select(`
              id, item_id, response_value, is_conforming, is_meta_ok, is_done, observation, created_at,
              checklist_evidences(url)
            `)
            .eq('execution_id', activeExec.id);

          if (savedResps && savedResps.length > 0) {
            const restoredResps: Record<string, ExecutionResponse> = {};
            savedResps.forEach((sr: any) => {
              const evs = sr.checklist_evidences || [];
              const evUrl = Array.isArray(evs) ? evs[0]?.url : (evs as any)?.url;
              
              // Restaura sub-tarefas se houver a tag [SUBTASKS:0,1,2] na observação
              if (sr.observation && sr.observation.includes('[SUBTASKS:')) {
                const match = sr.observation.match(/\[SUBTASKS:(.*?)\]/);
                if (match && match[1]) {
                  const indices = match[1].split(',').map((n: string) => parseInt(n.trim(), 10)).filter((n: number) => !isNaN(n));
                  indices.forEach((idx: number) => {
                    restoredSubtasks[`${sr.item_id}_${idx}`] = true;
                  });
                }
              }

              restoredResps[sr.item_id] = {
                itemId: sr.item_id,
                value: sr.response_value,
                isConforming: sr.is_conforming,
                isMetaOk: sr.is_meta_ok,
                isDone: sr.is_done,
                observation: sr.observation || undefined,
                evidenceUrl: evUrl || undefined,
                answeredAt: sr.created_at,
                answeredBy: loggedInUser.name
              };
            });
            setResponses(restoredResps);
          }
        } else {
          setCurrentExecutionId(null);
          setStartedAt(new Date().toISOString());
        }

        setCheckedSubtasks(restoredSubtasks);
      }

      // 3. Inicia geolocalização se exigido
      if (chk.require_geolocation) {
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            setCurrentCoords({ lat, lng, precision: pos.coords.accuracy });
            
            if (chk.unit_latitude && chk.unit_longitude) {
              const dist = calculateDistance(lat, lng, chk.unit_latitude, chk.unit_longitude);
              setDistanceFromUnit(dist);
            }
            setLocating(false);
          },
          (err) => {
            console.error(err);
            setGeoError('Não foi possível obter geolocalização exata.');
            setLocating(false);
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    } catch (e) {
      console.error(e);
      showToast('error', 'Erro ao carregar itens da rotina.');
    }
  };

  // ==========================================
  // SALVAMENTO EM TEMPO REAL (REAL-TIME AUTO-SAVE)
  // ==========================================
  const autoSaveResponseToDatabase = async (
    itemId: string,
    val: string,
    isConf: boolean,
    isMeta: boolean,
    observationStr?: string
  ) => {
    if (!loggedInUser || !activeChecklist || !tenantId) return;

    try {
      let execId = currentExecutionId;
      const nowIso = new Date().toISOString();

      if (!execId) {
        // Cria a execução em andamento (in_progress) no banco
        const { data: newExec, error: execErr } = await supabase
          .from('checklist_executions')
          .insert({
            tenant_id: tenantId,
            checklist_id: activeChecklist.id,
            user_id: loggedInUser.id,
            unit_id: activeChecklist.unit_id,
            sector_id: activeChecklist.sector_id,
            started_at: startedAt || nowIso,
            status: 'in_progress',
            score: 0,
            latitude: currentCoords?.lat || null,
            longitude: currentCoords?.lng || null,
            lat_lng_precision: currentCoords?.precision || null,
            distance_calculated: distanceFromUnit
          })
          .select('id')
          .single();

        if (execErr) {
          console.error('Erro ao criar execução em andamento:', execErr);
          return;
        }

        execId = newExec.id;
        setCurrentExecutionId(execId);
      }

      // Upsert em tempo real da resposta do item no banco
      const { error: respErr } = await supabase
        .from('checklist_item_responses')
        .upsert({
          tenant_id: tenantId,
          execution_id: execId,
          item_id: itemId,
          user_id: loggedInUser.id,
          response_value: val,
          is_conforming: isConf,
          is_meta_ok: isMeta,
          is_done: val.trim().length > 0,
          observation: observationStr !== undefined ? observationStr : (responses[itemId]?.observation || null),
          updated_at: nowIso
        }, {
          onConflict: 'execution_id, item_id'
        });

      if (respErr) {
        console.error('Erro no auto-save da resposta:', respErr);
      }

      // Atualiza mapa de execuções em andamento
      setInProgressExecutions(prev => ({
        ...prev,
        [activeChecklist.id]: {
          executionId: execId!,
          completedCount: Object.values(responses).filter(r => r.isDone).length + 1
        }
      }));

    } catch (e) {
      console.error('Erro no salvamento em tempo real:', e);
    }
  };

  const handleSubtaskToggle = (itemId: string, itemOptions: string[], subIndex: number, checked: boolean) => {
    const subtaskKey = `${itemId}_${subIndex}`;
    
    setCheckedSubtasks(prev => {
      const updatedSubtasks = { ...prev, [subtaskKey]: checked };
      
      // Salva no localStorage imediatamente por usuário e checklist
      if (loggedInUser && activeChecklist) {
        const storageKey = `subtasks_${loggedInUser.id}_${activeChecklist.id}`;
        localStorage.setItem(storageKey, JSON.stringify(updatedSubtasks));
      }

      // Coleta os índices de sub-tarefas marcados para este item
      const checkedIndices: number[] = [];
      itemOptions.forEach((_, idx) => {
        if (updatedSubtasks[`${itemId}_${idx}`]) {
          checkedIndices.push(idx);
        }
      });

      const subtaskObsTag = checkedIndices.length > 0 ? `[SUBTASKS:${checkedIndices.join(',')}]` : '';
      
      const currentResp = responses[itemId];
      const val = currentResp?.value || 'Feito';
      const isConf = currentResp ? currentResp.isConforming : true;
      const isMeta = currentResp ? currentResp.isMetaOk : true;

      setResponses(prevResp => ({
        ...prevResp,
        [itemId]: {
          ...(prevResp[itemId] || { itemId, value: val, isConforming: isConf, isMetaOk: isMeta, isDone: true }),
          value: val,
          isDone: true,
          observation: subtaskObsTag,
          answeredAt: new Date().toISOString(),
          answeredBy: loggedInUser?.name || 'Operador'
        }
      }));

      // Dispara salvamento em tempo real no Supabase com a tag de sub-tarefas
      autoSaveResponseToDatabase(itemId, val, isConf, isMeta, subtaskObsTag);

      return updatedSubtasks;
    });
  };

  const handleAnswerChange = (
    itemId: string, 
    responseType: string, 
    value: string, 
    minMeta?: number | null, 
    maxMeta?: number | null
  ) => {
    let isConforming = true;
    let isMetaOk = true;

    if (responseType === 'conformity') {
      isConforming = value === 'Conforme';
    } else if (responseType === 'boolean') {
      isConforming = value === 'Feito';
    } else if (responseType === 'yes_no') {
      isConforming = value === 'Sim';
    } else if (responseType === 'numeric' || responseType === 'temperature' || responseType === 'counter' || responseType === 'kg') {
      const numVal = parseFloat(value.replace(',', '.'));
      if (!isNaN(numVal)) {
        if (minMeta !== null && minMeta !== undefined && numVal < minMeta) isMetaOk = false;
        if (maxMeta !== null && maxMeta !== undefined && numVal > maxMeta) isMetaOk = false;
      }
    }

    // Auto-save em tempo real no Supabase
    autoSaveResponseToDatabase(itemId, value, isConforming, isMetaOk);

    setResponses(prev => {
      const current = prev[itemId] || { itemId, value: '', isConforming: true, isMetaOk: true, isDone: false };
      const updated = {
        ...current,
        value,
        isConforming,
        isMetaOk,
        isDone: value.trim().length > 0,
        answeredAt: new Date().toISOString(),
        answeredBy: loggedInUser?.name || 'Operador'
      };
      
      triggerConfetti(false);

      const newResponses = {
        ...prev,
        [itemId]: updated
      };

      // Rolagem suave e auto-foco no próximo item pendente OU no botão de finalização se for a última tarefa!
      setTimeout(() => {
        const remainingItems = itemsToAnswer.filter(i => {
          const r = newResponses[i.id];
          return !r || !r.isDone;
        });

        if (remainingItems.length === 0) {
          // Todas as tarefas foram concluídas! Rolagem suave até o botão de envio e destaque animado
          const submitBtn = document.getElementById('submit-checklist-btn');
          if (submitBtn) {
            submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else {
          const nextPendingItem = remainingItems[0];
          if (nextPendingItem) {
            const nextElement = document.getElementById(`item-card-${nextPendingItem.id}`);
            if (nextElement) {
              nextElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }
      }, 200);

      return newResponses;
    });
  };

  const handlePhotoUpload = async (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResponses(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { itemId, value: '', isConforming: true, isMetaOk: true, isDone: false }), evidenceUploading: true }
    }));

    try {
      const ext = file.name.split('.').pop();
      const filePath = `evidences/${tenantId}/${itemId}_${Date.now()}.${ext}`;
      
      const { error: uploadErr } = await supabase.storage
        .from('checklist-media')
        .upload(filePath, file);

      if (uploadErr) throw uploadErr;

      const { data: pubUrl } = supabase.storage
        .from('checklist-media')
        .getPublicUrl(filePath);

      setResponses(prev => ({
        ...prev,
        [itemId]: { ...prev[itemId], evidenceUrl: pubUrl.publicUrl, evidenceUploading: false }
      }));
      showToast('success', 'Foto de evidência anexada!');
    } catch (err) {
      console.error(err);
      showToast('error', 'Falha ao enviar foto de evidência.');
      setResponses(prev => ({
        ...prev,
        [itemId]: { ...prev[itemId], evidenceUploading: false }
      }));
    }
  };

  const handleUpdateItemCategory = async (itemId: string, currentTitle: string, newCategory: string) => {
    try {
      const cleanTitle = currentTitle.replace(/^\[.*?\]\s*/, '');
      const updatedTitle = newCategory.trim() ? `[${newCategory.trim().toUpperCase()}] ${cleanTitle}` : cleanTitle;

      const { error } = await supabase
        .from('checklist_items')
        .update({ title: updatedTitle })
        .eq('id', itemId);

      if (error) throw error;

      setItemsToAnswer(prev => prev.map(item => item.id === itemId ? { ...item, title: updatedTitle } : item));
      setActiveCategoryEditItemId(null);
      setNewInlineCategoryName('');
      showToast('success', 'Categoria atualizada!');
    } catch (e) {
      console.error(e);
      showToast('error', 'Erro ao atualizar categoria.');
    }
  };

  const getHelperMessage = (item: any, currentResponses: Record<string, ExecutionResponse>) => {
    if (!item.description) return null;
    
    if (item.description.includes('Dica:')) {
      const parts = item.description.split('Dica:');
      return { type: 'hint', text: `💡 Dica: ${parts[1].trim()}` };
    }

    if (item.description.includes('Estoque Ideal:')) {
      const matchIdeal = item.description.match(/Estoque Ideal:\s*(\d+(\.\d+)?)/);
      const matchAtual = item.description.match(/Estoque Atual:\s*(\d+(\.\d+)?)/);

      if (matchIdeal) {
        const ideal = parseFloat(matchIdeal[1]);
        const atual = matchAtual ? parseFloat(matchAtual[1]) : 0;
        const diff = ideal - atual;
        const suggestion = diff > 0 ? diff.toString() : '0';

        return {
          type: 'stock_suggestion',
          text: `📦 Sugestão de Reposição: ${suggestion} ${item.measurement_unit || ''}`,
          value: suggestion
        };
      }
    }

    return null;
  };

  const handleSubmitChecklist = async () => {
    if (!activeChecklist || !loggedInUser) return;

    // Checa itens obrigatórios
    const unansweredRequired = itemsToAnswer.filter(item => item.is_required && (!responses[item.id] || !responses[item.id].isDone));
    if (unansweredRequired.length > 0) {
      showToast('error', `Preencha os ${unansweredRequired.length} itens obrigatórios marcados antes de finalizar.`);
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date();
      const started = startedAt ? new Date(startedAt) : now;
      const durationSeconds = Math.round((now.getTime() - started.getTime()) / 1000);

      // Calcula pontuação final (score)
      const answeredCount = Object.keys(responses).length;
      const totalItems = itemsToAnswer.length;
      let score = 100;

      if (totalItems > 0) {
        let conformCount = 0;
        itemsToAnswer.forEach(item => {
          const r = responses[item.id];
          if (r && r.isConforming && r.isMetaOk) {
            conformCount++;
          }
        });
        score = Math.round((conformCount / totalItems) * 100);
      }

      // Atualiza execução existente em andamento ou cria uma nova se não existir
      let executionId = currentExecutionId;

      if (executionId) {
        const { error: updateErr } = await supabase
          .from('checklist_executions')
          .update({
            completed_at: now.toISOString(),
            duration_seconds: durationSeconds,
            status: 'completed_on_time',
            score,
            updated_at: now.toISOString()
          })
          .eq('id', executionId);

        if (updateErr) throw updateErr;
      } else {
        const { data: execData, error: execErr } = await supabase
          .from('checklist_executions')
          .insert({
            tenant_id: tenantId,
            checklist_id: activeChecklist.id,
            user_id: loggedInUser.id,
            unit_id: activeChecklist.unit_id,
            sector_id: activeChecklist.sector_id,
            started_at: startedAt || now.toISOString(),
            completed_at: now.toISOString(),
            duration_seconds: durationSeconds,
            status: 'completed_on_time',
            score,
            latitude: currentCoords?.lat || null,
            longitude: currentCoords?.lng || null,
            lat_lng_precision: currentCoords?.precision || null,
            distance_calculated: distanceFromUnit
          })
          .select('id')
          .single();

        if (execErr) throw execErr;
        executionId = execData.id;
      }

      // Upsert de todas as respostas para garantir consistência total no banco
      const upsertResponses = itemsToAnswer.map(item => {
        const r = responses[item.id] || { itemId: item.id, value: '', isConforming: true, isMetaOk: true, isDone: false };
        return {
          tenant_id: tenantId,
          execution_id: executionId,
          item_id: item.id,
          user_id: loggedInUser.id,
          response_value: r.value,
          is_conforming: r.isConforming,
          is_meta_ok: r.isMetaOk,
          is_done: r.isDone,
          observation: r.observation || null,
          updated_at: now.toISOString()
        };
      });

      const { data: savedResponses, error: respErr } = await supabase
        .from('checklist_item_responses')
        .upsert(upsertResponses, { onConflict: 'execution_id, item_id' })
        .select('id, item_id');

      if (respErr) throw respErr;

      // Grava evidências fotográficas
      const insertEvidences: any[] = [];
      (savedResponses || []).forEach((savedR: any) => {
        const localR = responses[savedR.item_id];
        if (localR && localR.evidenceUrl) {
          insertEvidences.push({
            response_id: savedR.id,
            url: localR.evidenceUrl,
            uploaded_at: new Date().toISOString()
          });
        }
      });

      if (insertEvidences.length > 0) {
        await supabase.from('checklist_evidences').insert(insertEvidences);
      }

      // Confetes e Modal de Sucesso
      setSuccessScore(score);
      setShowSuccessModal(true);
      triggerConfetti(true);

      // Reseta ativo
      if (loggedInUser && activeChecklist) {
        localStorage.removeItem(`subtasks_${loggedInUser.id}_${activeChecklist.id}`);
      }
      setCurrentExecutionId(null);
      setActiveChecklist(null);
      setItemsToAnswer([]);
      setResponses({});
      setCheckedSubtasks({});
      
      loadOperatorChecklists(loggedInUser.id, loggedInUser.role, loggedInUser.name);
      loadCompletedExecutions(loggedInUser.id);

    } catch (e) {
      console.error(e);
      showToast('error', 'Erro ao finalizar rotina. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] text-[#d1d7db] overflow-hidden relative styled-scrollbar text-base">
      
      {/* TOAST DE NOTIFICAÇÃO */}
      {toastMsg && (
        <div className={`fixed top-6 right-6 z-[999] px-6 py-4 rounded-2xl border text-sm font-bold shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-3 duration-300 ${
          toastMsg.type === 'success' 
            ? 'bg-emerald-500/25 text-emerald-200 border-emerald-500/50 backdrop-blur-xl' 
            : 'bg-rose-500/25 text-rose-200 border-rose-500/50 backdrop-blur-xl'
        }`}>
          {toastMsg.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          <span>{toastMsg.msg}</span>
        </div>
      )}

      {/* MODAL DE SUCESSO GAMIFICADO (CONFETTI & SCORE) */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-[#182229] border border-white/15 rounded-[40px] p-10 max-w-lg w-full text-center relative shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="w-24 h-24 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-3xl mx-auto flex items-center justify-center text-black font-black text-4xl shadow-xl shadow-emerald-500/30 mb-6 animate-bounce">
              🌟
            </div>
            
            <h2 className="text-3xl font-black text-white tracking-tight">Rotina Concluída com Sucesso!</h2>
            <p className="text-sm text-[#8696a0] mt-2">Sua auditoria foi salva e registrada no servidor.</p>

            <div className="my-8 p-6 rounded-3xl bg-[#111b21] border border-white/10 flex items-center justify-around font-mono">
              <div>
                <span className="text-xs text-[#8696a0] uppercase font-bold block">Pontuação</span>
                <span className="text-3xl font-black text-emerald-400">{successScore}%</span>
              </div>
              <div className="w-px h-12 bg-white/10" />
              <div>
                <span className="text-xs text-[#8696a0] uppercase font-bold block">Status</span>
                <span className="text-sm font-bold text-white uppercase bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-lg mt-1 inline-block border border-emerald-500/30">Conforme</span>
              </div>
            </div>

            <button
              onClick={() => setShowSuccessModal(false)}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-black font-black text-base py-4 rounded-2xl transition-all shadow-xl shadow-emerald-500/30 cursor-pointer active:scale-95"
            >
              Continuar Trabalhando 🚀
            </button>
          </div>
        </div>
      )}

      {/* TELA DE AUTENTICAÇÃO POR PIN (TOTEM BLOQUEADO) */}
      {!loggedInUser && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 bg-[#0b141a] relative overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-5xl w-full flex flex-col md:flex-row items-center gap-8 sm:gap-12 bg-[#182229]/80 backdrop-blur-xl border border-white/15 p-8 sm:p-12 rounded-[48px] shadow-2xl relative z-10">
            
            {/* Lista de Operadores da Equipe */}
            <div className="flex-1 w-full space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm uppercase tracking-widest">
                    <Tablet size={18} /> Totem Operacional Tablet PWA
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setIsSectorAlarmModalOpen(true)}
                      className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-black px-3.5 py-1.5 rounded-2xl flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
                    >
                      <BellRing size={13} className="text-amber-400 animate-pulse" />
                      <span>Setor: {totemSectorName || 'Cozinha'} • Alarmes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInstallModalOpen(true)}
                      className="bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 text-xs font-bold px-3.5 py-1.5 rounded-2xl flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
                    >
                      <QrCode size={13} />
                      <span>Link & Instalar PWA</span>
                    </button>
                  </div>
                </div>
                <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mt-2">Quem está operando?</h1>
                <p className="text-sm text-[#8696a0] mt-1.5">
                  Selecione seu nome na lista para autenticar com seu PIN • Tablet configurado para o setor <strong className="text-amber-300">{totemSectorName || 'Cozinha'}</strong>.
                </p>

                {/* Banner de Instalação Direta quando aberto pela rota exclusiva no navegador do Tablet Android */}
                {!isStandalone && (
                  <div className="mt-3 p-3.5 rounded-2xl bg-gradient-to-r from-indigo-600/20 via-purple-600/15 to-amber-500/15 border border-indigo-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/25 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shrink-0">
                        <Download size={18} />
                      </div>
                      <div>
                        <span className="text-xs font-black text-white block">
                          📲 Instalar App Totem {totemSectorName || 'Cozinha'} no Tablet Android
                        </span>
                        <span className="text-[11px] text-[#d1d7db]">
                          Instale na Tela Inicial e ative o despertador em segundo plano (funciona com o app fechado).
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                      <button
                        type="button"
                        onClick={handleInstallPwa}
                        className="flex-1 sm:flex-initial bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs px-3.5 py-2 rounded-xl shadow-lg shadow-emerald-500/25 transition-all cursor-pointer active:scale-95"
                      >
                        Instalar + Ativar Alarme
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsInstallModalOpen(true)}
                        className="bg-[#202c33] hover:bg-[#2a3942] text-[#d1d7db] hover:text-white border border-white/15 font-bold text-xs px-3 py-2 rounded-xl transition-all cursor-pointer"
                      >
                        Link / QR
                      </button>
                    </div>
                  </div>
                )}

                {pendingAlarmChecklistId && (
                  <div className="mt-3 p-3.5 rounded-2xl bg-rose-500/20 border border-rose-500/50 text-rose-200 text-xs font-bold flex items-center gap-2.5 animate-pulse">
                    <BellRing size={18} className="text-rose-400 shrink-0" />
                    <span>🚨 Alarme de Checklist Ativo! Selecione seu operador e digite o PIN para iniciar as tarefas imediatamente.</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 max-h-[380px] overflow-y-auto styled-scrollbar pr-2">
                {operators.map((op) => (
                  <button
                    key={op.id}
                    onClick={() => handleSelectOperator(op)}
                    className={`p-5 rounded-3xl border text-left transition-all flex items-center gap-4 cursor-pointer min-h-[72px] ${
                      selectedOperator?.id === op.id 
                        ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-xl shadow-indigo-500/20 scale-[1.02]' 
                        : 'bg-[#202c33]/80 hover:bg-[#202c33] border-white/10 text-[#d1d7db]'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-md">
                      {op.name.substring(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-black text-sm sm:text-base text-white truncate">{op.name}</h4>
                      <p className="text-xs text-[#8696a0] capitalize mt-0.5">{op.role === 'manager' ? 'Gerente' : 'Operador'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Teclado Numérico de PIN de 5 Dígitos Otimizado para Toque */}
            <div className="w-full md:w-80 shrink-0 bg-[#111b21] border border-white/15 p-8 rounded-[40px] flex flex-col items-center justify-center shadow-2xl">
              {selectedOperator ? (
                <>
                  <div className="text-center mb-5">
                    <span className="text-xs uppercase font-bold text-indigo-400 tracking-wider">Digitar PIN</span>
                    <h3 className="text-base font-black text-white truncate max-w-[240px] mt-0.5">{selectedOperator.name}</h3>
                  </div>

                  {/* Visor de Dígitos do PIN */}
                  <div className="flex gap-3 mb-6">
                    {[0, 1, 2, 3, 4].map((idx) => (
                      <div 
                        key={idx} 
                        className={`w-10 h-12 rounded-2xl border flex items-center justify-center font-mono font-black text-xl transition-all ${
                          pinCode.length > idx 
                            ? 'bg-indigo-500/30 border-indigo-400 text-indigo-300 shadow-md shadow-indigo-500/20' 
                            : 'bg-[#202c33] border-white/10 text-slate-600'
                        }`}
                      >
                        {pinCode.length > idx ? '•' : ''}
                      </div>
                    ))}
                  </div>

                  {authError && (
                    <p className="text-xs text-rose-400 font-bold mb-4 animate-shake text-center">{authError}</p>
                  )}

                  {/* Teclado 3x4 com Teclas Grandes (56px) */}
                  <div className="grid grid-cols-3 gap-3 w-full">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                      <button
                        key={num}
                        onClick={() => handleKeyPress(num)}
                        className="h-14 rounded-2xl bg-[#202c33] hover:bg-[#2a3942] active:scale-95 text-white font-black text-2xl border border-white/10 transition-all shadow-md cursor-pointer flex items-center justify-center select-none"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      onClick={() => setSelectedOperator(null)}
                      className="h-14 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-black uppercase transition-all cursor-pointer flex items-center justify-center select-none border border-rose-500/20"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleKeyPress('0')}
                      className="h-14 rounded-2xl bg-[#202c33] hover:bg-[#2a3942] active:scale-95 text-white font-black text-2xl border border-white/10 transition-all shadow-md cursor-pointer flex items-center justify-center select-none"
                    >
                      0
                    </button>
                    <button
                      onClick={handleDeletePress}
                      className="h-14 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-sm font-black transition-all cursor-pointer flex items-center justify-center select-none border border-amber-500/20"
                    >
                      ⌫
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-10 text-center text-[#8696a0]">
                  <Lock size={40} className="mx-auto text-[#202c33] mb-3" />
                  <p className="text-sm">Selecione seu perfil à esquerda para inserir o PIN.</p>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* PAINEL OPERACIONAL APÓS LOGIN POR PIN */}
      {loggedInUser && (
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* ========================================== */}
          {/* VISTA MOBILE - TEMA ESCURO NATIVO COM NAVEGAÇÃO RESPONSIVA */}
          {/* ========================================== */}
          <div className="block md:hidden flex-1 flex flex-col bg-[#0b141a] text-[#d1d7db] overflow-y-auto pb-28 relative styled-scrollbar">
            
            {/* OVERLAY GAMIFICADO DE SUCESSO VERDE (DESLIZE / POPUP) */}
            {mobileSuccessOverlay && (
              <div className="fixed inset-0 z-[100] bg-[#0b141a]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white animate-in fade-in zoom-in duration-300">
                <div className="w-24 h-24 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-500/30 mb-6 text-black font-black text-4xl animate-bounce">
                  <Check size={48} strokeWidth={3} className="text-black" />
                </div>
                <h2 className="text-3xl font-black tracking-tight text-white">Rotina Concluída!</h2>
                <p className="text-sm text-[#8696a0] mt-2">Sua auditoria foi salva e registrada no servidor.</p>
                <div className="text-xs font-bold text-emerald-400 mt-6 bg-emerald-500/20 px-5 py-2.5 rounded-full border border-emerald-500/40 shadow-sm flex items-center gap-2 font-mono">
                  <span>✓ 100% Conforme • Enviando para o Servidor...</span>
                </div>
              </div>
            )}

            {/* BOTTOM SHEET MODAL "ANEXAR EVIDÊNCIA" (FOTOS DE EVIDÊNCIA EM TEMA ESCURO) */}
            {mobileEvidenceModalItem && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end justify-center">
                <div className="bg-[#182229] border-t border-x border-white/20 rounded-t-[36px] p-6 w-full max-w-lg shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-300 text-left">
                  <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-1" />
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-white flex items-center gap-2">
                      <Camera size={20} className="text-indigo-400" />
                      Anexar Evidência
                    </h3>
                    <button 
                      onClick={() => {
                        setMobileEvidenceModalItem(null);
                        setMobileEvidencePhoto(null);
                      }} 
                      className="p-1.5 rounded-full text-[#8696a0] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <p className="text-xs text-[#8696a0] font-semibold">
                    {mobileEvidenceModalItem.photo_instructions || `Tire uma foto nítida do ${mobileEvidenceModalItem.title.toLowerCase()} para validação.`}
                  </p>

                  {!mobileEvidencePhoto ? (
                    /* FOTO AINDA NÃO CAPTURADA */
                    <div className="space-y-4 pt-2">
                      <label className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black rounded-2xl flex items-center justify-center gap-2.5 shadow-xl shadow-indigo-600/30 active:scale-95 transition-all cursor-pointer text-sm">
                        <Camera size={20} />
                        <span>Tirar foto agora (Câmera)</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          capture="environment" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setMobileEvidencePhoto(reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }} 
                        />
                      </label>

                      <p className="text-[11px] text-[#8696a0] text-center leading-tight px-4">
                        A câmera é aberta diretamente para gravação de foto em tempo real com validação GPS.
                      </p>

                      <button 
                        disabled 
                        className="w-full py-4 bg-[#202c33] text-[#8696a0] font-bold rounded-2xl cursor-not-allowed border border-white/5 text-sm"
                      >
                        Salvar evidência
                      </button>
                    </div>
                  ) : (
                    /* FOTO CAPTURADA / PREVIEW */
                    <div className="space-y-4 pt-2">
                      <div className="relative rounded-2xl overflow-hidden shadow-xl max-h-56 bg-slate-900 border border-white/20">
                        <img src={mobileEvidencePhoto} alt="Evidência" className="w-full h-48 object-cover" />
                        <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md text-emerald-400 text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border border-emerald-500/40">
                          {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      <div className="p-3.5 bg-[#111b21] border border-white/10 rounded-2xl flex items-center justify-between text-xs">
                        <div className="space-y-0.5">
                          <span className="font-bold text-white block">evidencia_fotografica.jpg</span>
                          <span className="text-emerald-400 font-bold flex items-center gap-1">✓ Foto validada pelo sistema</span>
                          <span className="text-[#8696a0] text-[10px]">📍 GPS: OK</span>
                        </div>
                        <button 
                          onClick={() => setMobileEvidencePhoto(null)} 
                          className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-xl transition-colors cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <button 
                        onClick={() => {
                          const itemId = mobileEvidenceModalItem.id;
                          setResponses(prev => ({
                            ...prev,
                            [itemId]: {
                              ...prev[itemId],
                              photoUrl: mobileEvidencePhoto,
                              evidenceUrl: mobileEvidencePhoto
                            }
                          }));
                          showToast('success', 'Foto de evidência gravada!');
                          setMobileEvidenceModalItem(null);
                          setMobileEvidencePhoto(null);
                        }}
                        className="w-full py-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 text-black font-black rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 transition-all cursor-pointer text-sm active:scale-95"
                      >
                        Salvar evidência ✅
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SEÇÃO 1: TELA INICIAL / LISTAGEM DE ROTINAS MOBILE */}
            {!activeChecklist ? (
              <div className="flex-1 flex flex-col">
                {/* Header Superior Mobile com Tema Escuro & Glassmorphism */}
                <div className="bg-[#182229]/95 backdrop-blur-xl border-b border-white/15 px-5 py-4 flex items-center justify-between shadow-lg sticky top-0 z-20 gap-2">
                  <div>
                    <span className="text-[9px] uppercase font-bold tracking-widest text-indigo-400 block">Totem Operacional Mobile</span>
                    <h1 className="text-xl font-black text-white tracking-tight">Meus Checklists</h1>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsSectorAlarmModalOpen(true)}
                      className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs px-3 py-1.5 rounded-2xl font-black flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
                    >
                      <BellRing size={13} className="text-amber-400 animate-pulse" />
                      <span>{totemSectorName || 'Cozinha'}</span>
                    </button>
                    <div className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs px-3 py-1.5 rounded-2xl font-bold flex items-center gap-1.5 shadow-md">
                      <User size={13} className="text-indigo-400" />
                      <span className="truncate max-w-[90px]">{loggedInUser.name}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-4 pb-32">
                  {/* Card Resumo Diário com Painel de Métricas */}
                  <div className="bg-[#182229]/90 backdrop-blur-md rounded-3xl p-5 border border-white/15 shadow-2xl space-y-3">
                    <div className="flex items-center justify-between text-white font-bold text-xs">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-indigo-400" />
                        <span>HOJE - {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsSectorAlarmModalOpen(true)}
                        className="text-[10px] text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-xl uppercase tracking-wider font-mono flex items-center gap-1 cursor-pointer"
                      >
                        <Bell size={11} /> Setor: {totemSectorName || 'Cozinha'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="bg-[#111b21] p-3 rounded-2xl border border-emerald-500/30 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                          ✓
                        </div>
                        <div>
                          <span className="text-[10px] text-[#8696a0] font-bold block uppercase">Concluídos</span>
                          <span className="text-base font-black text-emerald-400 font-mono">
                            {Object.keys(todayCompletedChecklists).length} / {checklists.length}
                          </span>
                        </div>
                      </div>

                      <div
                        onClick={() => setIsSectorAlarmModalOpen(true)}
                        className="bg-[#111b21] p-3 rounded-2xl border border-amber-500/30 flex items-center gap-3 cursor-pointer"
                      >
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
                          ⏰
                        </div>
                        <div>
                          <span className="text-[10px] text-[#8696a0] font-bold block uppercase">Alarmes Ativos</span>
                          <span className="text-xs font-black text-amber-300 font-mono">
                            Configurar →
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Lista de Cards de Rotinas (Sem sobreposição) */}
                  <div className="space-y-4">
                    {(() => {
                      const sectorFiltered = filterByTotemSector && totemSectorId
                        ? checklists.filter(c => doesChecklistMatchSector(c, totemSectorId, totemSectorName))
                        : checklists;
                      const displayList = sectorFiltered.length > 0 ? sectorFiltered : checklists;

                      return displayList.map((chk) => {
                        const isDoneToday = !!todayCompletedChecklists[chk.id];
                        const inProg = inProgressExecutions[chk.id];
                        const scheduleTime = chk.schedule_time || chk.schedule_times?.[0] || 'Livre';
                        const nowHHMM = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
                        const isLate = !isDoneToday && scheduleTime !== 'Livre' && nowHHMM > scheduleTime;
                        const progressPercent = isDoneToday ? 100 : inProg ? 50 : 0;

                        return (
                          <div 
                            key={chk.id}
                            className={`bg-[#182229]/95 backdrop-blur-md rounded-3xl p-5 border shadow-2xl space-y-4 relative overflow-hidden transition-all hover:border-white/25 ${
                              isDoneToday 
                                ? 'border-emerald-500/40 bg-emerald-950/20' 
                                : inProg 
                                  ? 'border-indigo-500/40 bg-indigo-950/20' 
                                  : 'border-white/15'
                            }`}
                          >
                            {/* Topo do Card: Horário | Categoria & Título | Badge Em Andamento */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3.5 min-w-0">
                                <div
                                  onClick={() => setIsSectorAlarmModalOpen(true)}
                                  className="text-center pr-3.5 border-r border-white/15 shrink-0 cursor-pointer"
                                  title="Toque para configurar horários de alarme"
                                >
                                  <span className={`text-lg font-black block leading-none font-mono ${isLate ? 'text-rose-400 animate-pulse' : 'text-amber-300'}`}>
                                    {isLate ? '⚠ ' : '⏰ '}{scheduleTime}
                                  </span>
                                  <span className="text-[10px] text-[#8696a0] font-bold block mt-1">
                                    {chk.schedule_times && chk.schedule_times.length > 1 ? `+${chk.schedule_times.length - 1} hor.` : 'alarme'}
                                  </span>
                                  {isLate && (
                                    <span className="bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md mt-1 block">
                                      PENDENTE
                                    </span>
                                  )}
                                </div>

                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-300 bg-indigo-500/20 px-2.5 py-0.5 rounded-md border border-indigo-500/30 inline-block">
                                      {chk.category}
                                    </span>
                                    {inProg && !isDoneToday && (
                                      <span className="bg-indigo-600/40 text-indigo-200 border border-indigo-500/50 text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
                                        <Clock size={11} /> Em Andamento
                                      </span>
                                    )}
                                  </div>
                                  <h3 className="text-base font-black text-white leading-tight truncate">{chk.title}</h3>
                                </div>
                              </div>
                            </div>

                            {/* Barra de Progresso */}
                            <div className="space-y-1">
                              <div className="w-full bg-[#111b21] h-6 rounded-full overflow-hidden relative border border-white/10 p-0.5">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 flex items-center justify-center text-[10px] font-black font-mono text-white ${
                                    isDoneToday 
                                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black' 
                                      : inProg 
                                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500' 
                                        : 'bg-[#202c33] text-[#8696a0]'
                                  }`}
                                  style={{ width: `${Math.max(15, progressPercent)}%` }}
                                >
                                  {progressPercent}%
                                </div>
                              </div>
                            </div>

                            {/* Rodapé do Card: Metadata | Botão de Ação */}
                            <div className="flex items-end justify-between pt-1 gap-2">
                              <div className="text-xs text-[#8696a0] space-y-0.5 font-medium min-w-0">
                                <div className="flex items-center gap-1.5 truncate"><FolderOpen size={13} className="text-indigo-400 shrink-0" /> <span className="truncate">{chk.sector_name || totemSectorName || 'Cozinha'}</span></div>
                                <div className="flex items-center gap-1.5 truncate"><MapPin size={13} className="text-indigo-400 shrink-0" /> <span className="truncate">{chk.unit_name || 'Unidade Principal'}</span></div>
                              </div>

                              {isDoneToday ? (
                                <div className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold px-4 py-2 rounded-2xl flex items-center gap-1.5 shadow-md shrink-0">
                                  <CheckCircle2 size={15} /> Finalizado
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    handleStartChecklist(chk);
                                    setMobileStepIndex(0);
                                  }}
                                  className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-black px-6 py-2.5 rounded-2xl shadow-lg shadow-indigo-600/30 cursor-pointer active:scale-95 transition-all shrink-0"
                                >
                                  {inProg ? 'Continuar' : 'Iniciar Rotina'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Dock Bar Flutuante Inferior em Glassmorphism */}
                <div className="fixed bottom-4 left-4 right-4 z-40 bg-[#182229]/95 backdrop-blur-xl rounded-full shadow-2xl border border-white/15 p-2 flex items-center justify-between px-4">
                  <button 
                    onClick={() => setMobileTab('checklists')} 
                    className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full transition-all cursor-pointer ${
                      mobileTab === 'checklists' ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40' : 'text-[#8696a0] hover:text-white'
                    }`}
                  >
                    <CheckSquare size={16} />
                    <span>Checklists</span>
                    <span className="w-4 h-4 rounded-full bg-indigo-500 text-white text-[10px] flex items-center justify-center font-bold">{checklists.length}</span>
                  </button>

                  <button 
                    onClick={() => {
                      setMobileTab('setores');
                      setIsSectorAlarmModalOpen(true);
                    }} 
                    className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full transition-all cursor-pointer bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  >
                    <BellRing size={15} className="text-amber-400" />
                    <span>Setor: {totemSectorName || 'Cozinha'}</span>
                  </button>

                  <button 
                    onClick={() => setMobileTab('respostas')} 
                    className="text-[#8696a0] hover:text-white p-2 rounded-full cursor-pointer"
                  >
                    <FileText size={18} />
                  </button>

                  <button 
                    onClick={() => setMobileTab('add')} 
                    className="text-[#8696a0] hover:text-white p-2 rounded-full cursor-pointer"
                  >
                    <Plus size={18} />
                  </button>

                  <button 
                    onClick={() => setMobileSearchOpen(!mobileSearchOpen)} 
                    className="w-10 h-10 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full flex items-center justify-center shadow-md cursor-pointer"
                  >
                    <Search size={18} />
                  </button>
                </div>
              </div>
            ) : (

              /* SEÇÃO 2: EXECUÇÃO PASSO-A-PASSO ITEM A ITEM EM TEMA ESCURO (FOTO 2) */
              <div className="flex-1 flex flex-col bg-[#0b141a]">
                <div className="bg-[#182229]/95 backdrop-blur-xl border-b border-white/15 px-4 py-3.5 flex items-center justify-between shadow-lg sticky top-0 z-20">
                  <button 
                    onClick={() => setActiveChecklist(null)} 
                    className="p-2 rounded-2xl bg-[#111b21] border border-white/10 text-white hover:bg-white/10 transition-all cursor-pointer"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <h2 className="text-sm font-black text-white truncate max-w-[220px] text-center">
                    {activeChecklist.title}
                  </h2>
                  <div className="w-9" />
                </div>

                {/* Banner de Aviso de Rotina Concluída Hoje se Aplicável */}
                {todayCompletedChecklists[activeChecklist.id] && (
                  <div className="m-4 p-4 rounded-3xl bg-gradient-to-r from-emerald-950/80 via-teal-900/60 to-emerald-950/80 border border-emerald-500/50 text-emerald-200 shadow-xl flex items-center gap-3">
                    <CheckCircle2 size={24} className="text-emerald-400 shrink-0" />
                    <div>
                      <h4 className="font-black text-xs text-white">Rotina Concluída Hoje! ({todayCompletedChecklists[activeChecklist.id].score}% Aprovado)</h4>
                      <p className="text-[11px] text-emerald-300/80 mt-0.5">Respostas registradas no servidor.</p>
                    </div>
                  </div>
                )}

                {/* Seção de Progresso */}
                <div className="bg-[#111b21] px-4 py-3.5 border-b border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-[#8696a0]">
                    <span>Progresso da Rotina</span>
                    <span className="text-base font-black text-emerald-400 font-mono">
                      {itemsToAnswer.length > 0 ? Math.round(((mobileStepIndex + 1) / itemsToAnswer.length) * 100) : 0}%
                    </span>
                  </div>

                  <div className="w-full bg-[#202c33] h-2.5 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full rounded-full transition-all duration-300 shadow-sm shadow-emerald-500/50"
                      style={{ width: `${itemsToAnswer.length > 0 ? ((mobileStepIndex + 1) / itemsToAnswer.length) * 100 : 0}%` }}
                    />
                  </div>

                  <div className="bg-[#182229] border border-amber-500/30 rounded-2xl p-3 flex items-center justify-between text-xs font-bold text-amber-300 shadow-md">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-amber-400 inline-block" />
                      <span>Item {mobileStepIndex + 1} de {itemsToAnswer.length}</span>
                    </div>
                    <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                      OBRIGATÓRIO
                    </span>
                  </div>
                </div>

                {/* Card da Pergunta Atual (Foto 2 + Tema Escuro + Sub-Tarefas) */}
                <div className="p-4 flex-1 overflow-y-auto">
                  {(() => {
                    const item = itemsToAnswer[mobileStepIndex];
                    if (!item) return null;

                    const match = item.title.match(/^\[(.*?)\]\s*(.*)$/);
                    const groupName = match ? match[1] : null;
                    const cleanTitle = match ? match[2] : item.title;
                    const cleanDescription = item.description ? item.description.replace(/Fornecedor:\s*/g, '').replace(/Custo:\s*/g, '').split(' | ').join(' • ') : null;

                    const resp = responses[item.id] || { itemId: item.id, value: '', isConforming: true, isMetaOk: true, isDone: false };
                    const isDone = resp.isDone;
                    const photoAttached = resp.photoUrl || resp.evidenceUrl;

                    return (
                      <div className="bg-[#182229] rounded-[32px] p-6 border border-white/15 shadow-2xl space-y-5">
                        
                        {/* Categoria e Título */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 bg-indigo-500/20 px-2.5 py-1 rounded-xl border border-indigo-500/30">
                              {groupName || activeChecklist.category}
                            </span>
                            {resp.isDone && (
                              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 px-3 py-0.5 rounded-full">
                                Concluído ✅
                              </span>
                            )}
                          </div>

                          <h3 className="text-lg font-black text-white leading-tight">
                            {cleanTitle} <span className="text-rose-400">*</span>
                          </h3>
                        </div>

                        {/* Descrição em Caixa Escura */}
                        {cleanDescription && (
                          <div className="bg-[#111b21]/90 border-l-4 border-indigo-500 p-3.5 rounded-r-2xl text-xs text-[#e9edef] leading-relaxed">
                            {cleanDescription}
                          </div>
                        )}

                        {/* SUB-TAREFAS ("ITENS A VERIFICAR") */}
                        {item.options && item.options.length > 0 && (
                          <div className="space-y-2.5 pt-1">
                            <span className="text-xs font-black text-indigo-400 block uppercase tracking-widest">ITENS A VERIFICAR:</span>
                            <div className="space-y-2">
                              {item.options.map((sub: string, sIdx: number) => {
                                const subtaskKey = `${item.id}_${sIdx}`;
                                const isChecked = checkedSubtasks[subtaskKey] || false;
                                return (
                                  <label 
                                    key={sIdx} 
                                    className={`flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all cursor-pointer select-none text-xs font-semibold min-h-[48px] ${
                                      isChecked 
                                        ? 'bg-indigo-500/20 border-indigo-500/50 text-white shadow-md' 
                                        : 'bg-[#111b21] border-white/10 text-[#d1d7db] hover:bg-[#111b21]/80'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => handleSubtaskToggle(item.id, item.options, sIdx, e.target.checked)}
                                      className="rounded-lg border-white/30 text-indigo-500 bg-[#202c33] focus:ring-indigo-500/40 focus:ring-offset-0 w-5 h-5 cursor-pointer shrink-0"
                                    />
                                    <span className="leading-snug">{sub}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Botão de Upload de Foto */}
                        {(item.require_photo || item.require_evidence) && (
                          <button
                            onClick={() => {
                              setMobileEvidenceModalItem(item);
                              setMobileEvidencePhoto(resp.photoUrl || resp.evidenceUrl || null);
                            }}
                            className={`text-xs font-bold px-4 py-3 rounded-2xl flex items-center gap-2 transition-all cursor-pointer w-full justify-center min-h-[48px] ${
                              photoAttached 
                                ? 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300' 
                                : 'border border-indigo-500/40 bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25'
                            }`}
                          >
                            <Camera size={18} />
                            <span>{photoAttached ? '✓ Foto de Evidência Anexada' : '📷 Tirar Foto Evidência *'}</span>
                          </button>
                        )}

                        {/* CONTROLES DE RESPOSTA (FEITO / NÃO FEITO OU INPUTS NUMÉRICOS/TEXTO/ESTRELAS) */}
                        {item.response_type === 'numeric' || item.response_type === 'temperature' || item.response_type === 'counter' || item.response_type === 'kg' ? (
                          <div className="space-y-3 pt-2">
                            <div className="flex items-center justify-center gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  const currentVal = parseFloat((resp.value || '0').replace(',', '.'));
                                  const newVal = Math.max(0, currentVal - 1).toString();
                                  handleAnswerChange(item.id, item.response_type, newVal, item.min_meta, item.max_meta);
                                }}
                                className="w-12 h-12 rounded-2xl bg-[#111b21] border border-white/15 text-white font-black text-xl flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                              >
                                -
                              </button>

                              <input
                                type="text"
                                value={resp.value || ''}
                                onChange={(e) => handleAnswerChange(item.id, item.response_type, e.target.value, item.min_meta, item.max_meta)}
                                placeholder={item.min_meta !== null ? `Mín ${item.min_meta}` : '0'}
                                className="w-32 bg-[#111b21] border border-white/20 rounded-2xl px-4 py-3 text-center text-lg font-black text-white font-mono focus:outline-none focus:border-indigo-500"
                              />

                              <button
                                type="button"
                                onClick={() => {
                                  const currentVal = parseFloat((resp.value || '0').replace(',', '.'));
                                  const newVal = (currentVal + 1).toString();
                                  handleAnswerChange(item.id, item.response_type, newVal, item.min_meta, item.max_meta);
                                }}
                                className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-black text-xl flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ) : item.response_type === 'text' ? (
                          <div className="pt-2">
                            <textarea
                              rows={3}
                              value={resp.value || ''}
                              onChange={(e) => handleAnswerChange(item.id, item.response_type, e.target.value, item.min_meta, item.max_meta)}
                              placeholder="Digite suas observações ou resultado..."
                              className="w-full bg-[#111b21] border border-white/15 rounded-2xl p-3.5 text-xs text-white placeholder-[#8696a0] focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        ) : item.response_type === 'stars' ? (
                          <div className="flex items-center justify-center gap-2 pt-2">
                            {[1, 2, 3, 4, 5].map(starNum => {
                              const isSelected = parseInt(resp.value || '0') >= starNum;
                              return (
                                <button
                                  key={starNum}
                                  type="button"
                                  onClick={() => handleAnswerChange(item.id, item.response_type, starNum.toString(), item.min_meta, item.max_meta)}
                                  className={`p-2 hover:scale-125 transition-transform cursor-pointer ${isSelected ? 'text-amber-400' : 'text-[#202c33]'}`}
                                >
                                  <Star size={28} fill={isSelected ? 'currentColor' : 'transparent'} />
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          /* PADRÃO FEITO / NÃO FEITO COM CONFIRMAÇÃO REAL VIA handleAnswerChange */
                          <div className="flex items-center gap-3 pt-3">
                            {(() => {
                              const isFeitoVal = resp.isDone && (resp.value === 'Feito' || resp.value === 'Conforme' || resp.value === 'Sim' || resp.isConforming);
                              const isNaoFeitoVal = resp.isDone && (resp.value === 'Não Feito' || resp.value === 'Não Conforme' || resp.value === 'Não' || (!resp.isConforming && resp.value.length > 0));

                              const feitoText = item.response_type === 'conformity' ? '✓ Conforme' : item.response_type === 'yes_no' ? '✓ Sim' : '✓ FEITO';
                              const naoFeitoText = item.response_type === 'conformity' ? '✕ Não Conforme' : item.response_type === 'yes_no' ? '✕ Não' : '✕ NÃO FEITO';

                              const feitoVal = item.response_type === 'conformity' ? 'Conforme' : item.response_type === 'yes_no' ? 'Sim' : 'Feito';
                              const naoFeitoVal = item.response_type === 'conformity' ? 'Não Conforme' : item.response_type === 'yes_no' ? 'Não' : 'Não Feito';

                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleAnswerChange(item.id, item.response_type || 'boolean', naoFeitoVal, item.min_meta, item.max_meta)}
                                    className={`flex-1 py-4 rounded-2xl border font-black text-sm flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md ${
                                      isNaoFeitoVal
                                        ? 'bg-rose-600 border-rose-500 text-white shadow-rose-600/40' 
                                        : 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                                    }`}
                                  >
                                    {naoFeitoText}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleAnswerChange(item.id, item.response_type || 'boolean', feitoVal, item.min_meta, item.max_meta)}
                                    className={`flex-1 py-4 rounded-2xl font-black text-sm flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-lg ${
                                      isFeitoVal 
                                        ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 text-black shadow-emerald-500/40 border-2 border-emerald-300 font-mono scale-[1.02]' 
                                        : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                                    }`}
                                  >
                                    {feitoText}
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Footer Fixo de Navegação (Anterior / Próximo / Finalizar e Assinar Rotina) */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#182229]/95 backdrop-blur-xl border-t border-white/15 flex items-center gap-3 z-30 shadow-2xl">
                  <button
                    disabled={mobileStepIndex === 0}
                    onClick={() => setMobileStepIndex(prev => Math.max(0, prev - 1))}
                    className="flex-1 py-3.5 rounded-2xl border border-white/20 bg-[#111b21] text-white font-bold text-xs flex items-center justify-center hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer min-h-[48px]"
                  >
                    ← Anterior
                  </button>

                  <button
                    onClick={() => {
                      if (mobileStepIndex < itemsToAnswer.length - 1) {
                        setMobileStepIndex(prev => prev + 1);
                      } else {
                        // CHAMA A FUNÇÃO CORRETA DE FINALIZAÇÃO DO TABLET PWA
                        handleSubmitChecklist();
                      }
                    }}
                    className={`flex-1 py-3.5 rounded-2xl font-black text-xs flex items-center justify-center transition-all cursor-pointer min-h-[48px] shadow-lg ${
                      mobileStepIndex === itemsToAnswer.length - 1
                        ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 text-black shadow-emerald-500/40 active:scale-95 font-mono'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-600/30 active:scale-95'
                    }`}
                  >
                    {mobileStepIndex < itemsToAnswer.length - 1 ? 'Próximo →' : 'Finalizar Rotina ✓'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ========================================== */}
          {/* VISTA DESKTOP / TABLET TOTEM PWA (MANTIDA 100% INTACTA) */}
          {/* ========================================== */}
          <div className="hidden md:flex flex-1 flex-col overflow-hidden">
          
          {/* Header Superior do Totem - Consolidado, Compacto e Elegante (h-16) */}
          <div className="h-16 sm:h-18 bg-[#182229]/95 backdrop-blur-xl border-b border-white/15 px-6 sm:px-8 flex items-center justify-between shrink-0 shadow-lg relative z-20 gap-4">
            
            {/* Lado Esquerdo: Operador Conectado */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 border border-white/20 flex items-center justify-center text-white font-black text-sm shadow-md">
                {loggedInUser.name.substring(0, 1).toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <span className="text-[9px] uppercase font-bold tracking-wider text-[#8696a0] block leading-none">Operador Conectado</span>
                <h1 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5 mt-0.5 leading-tight">
                  {loggedInUser.name}
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                </h1>
              </div>
            </div>

            {/* Centro: Título da Rotina Ativa & Progresso Integrado */}
            {activeChecklist ? (
              <div className="flex-1 min-w-0 max-w-3xl px-2 flex items-center justify-center gap-3 sm:gap-5">
                {/* Categoria e Título */}
                <div className="min-w-0 text-left shrink">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-md border border-indigo-500/30 shrink-0">
                      {activeChecklist.category}
                    </span>
                    <h2 className="text-xs sm:text-sm font-black text-white truncate max-w-[130px] sm:max-w-[220px] md:max-w-[300px]">
                      {activeChecklist.title}
                    </h2>
                  </div>
                </div>

                {/* Progresso Resumido da Rotina */}
                {(() => {
                  const total = itemsToAnswer.length;
                  const completed = itemsToAnswer.filter(item => responses[item.id]?.isDone).length;
                  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                  return (
                    <div className="flex items-center gap-3 bg-[#111b21] px-3.5 py-1.5 rounded-2xl border border-white/10 shrink-0">
                      <span className="text-xs font-mono font-black text-emerald-400">{percent}%</span>
                      <div className="w-16 sm:w-28 bg-[#202c33] h-2 rounded-full overflow-hidden border border-white/5">
                        <div 
                          className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full rounded-full transition-all duration-500 ease-out shadow-sm shadow-emerald-500/50" 
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-[#8696a0] font-bold shrink-0">{completed}/{total}</span>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="flex-1 text-center hidden md:block">
                <span className="text-xs font-bold text-[#8696a0]">Totem Operacional PWA</span>
              </div>
            )}

            {/* Lado Direito: Setor/Alarme, GPS, Instalar App no Tablet e Bloqueio de Tela */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsSectorAlarmModalOpen(true)}
                title="Configurar Setor do Tablet e Despertador em Horário Exato"
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-black px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-md transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <BellRing size={14} className="text-amber-400 animate-pulse" />
                <span>Setor: {totemSectorName || 'Cozinha'}</span>
                {pushStatus === 'active' && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" title="Despertador Web Push Ativo (Mesmo com App Fechado)" />
                )}
              </button>

              {activeChecklist?.require_geolocation && (
                <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold shrink-0 ${
                  distanceFromUnit === null ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' :
                  distanceFromUnit <= activeChecklist.unit_radius_meters ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' :
                  'border-rose-500/30 bg-rose-500/10 text-rose-300'
                }`}>
                  <Compass size={14} className={locating ? 'animate-spin text-indigo-400' : ''} />
                  <span className="hidden xl:inline text-[10px]">
                    {locating ? 'GPS...' : distanceFromUnit <= activeChecklist.unit_radius_meters ? `${Math.round(distanceFromUnit)}m OK` : 'Fora'}
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={handleInstallPwa}
                title="Instalar App Totem no Tablet"
                className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-black px-3 py-1.5 rounded-xl border border-white/20 flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <Tablet size={14} className="text-indigo-200" />
                <span className="hidden sm:inline">Instalar App</span>
              </button>

              <button
                onClick={handleLogout}
                className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
              >
                <Lock size={14} /> <span className="hidden sm:inline">Bloquear Tela</span>
              </button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            
            {/* LISTAGEM DE CHECKLISTS DISPONÍVEIS (SEÇÃO ESQUERDA) */}
            <div className={`w-full md:w-[360px] ${(activeChecklist || activeExecution) ? 'hidden md:flex' : 'flex'} shrink-0 border-r border-white/15 bg-[#182229]/70 flex-col overflow-y-auto p-5 styled-scrollbar gap-4`}>
              
              {/* Abas Otimizadas de Navegação */}
              <div className="flex gap-2 p-1.5 bg-[#111b21] rounded-2xl border border-white/15 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('active');
                    setActiveExecution(null);
                  }}
                  className={`flex-1 py-3 text-xs sm:text-sm font-black rounded-xl transition-all cursor-pointer ${
                    activeTab === 'active' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-[#8696a0] hover:text-white bg-transparent'
                  }`}
                >
                  Pendentes ({checklists.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('history');
                    setActiveChecklist(null);
                    if (loggedInUser) loadCompletedExecutions(loggedInUser.id);
                  }}
                  className={`flex-1 py-3 text-xs sm:text-sm font-black rounded-xl transition-all cursor-pointer ${
                    activeTab === 'history' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-[#8696a0] hover:text-white bg-transparent'
                  }`}
                >
                  Concluídos
                </button>
              </div>

              {activeTab === 'active' ? (
                <>
                  {/* Card de Setor do Tablet & Despertador Android */}
                  <div className="bg-gradient-to-r from-amber-950/50 via-[#1e2a30] to-indigo-950/60 border border-amber-500/35 p-3.5 rounded-2xl space-y-2.5 shadow-lg">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                          <BellRing size={16} />
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-black text-white block leading-tight truncate">
                            Setor: {totemSectorName || 'Cozinha'}
                          </span>
                          <span className="text-[10px] text-amber-300/90 block leading-tight font-medium">
                            {pushStatus === 'active' ? '✓ Despertador ativo (Mesmo fechado)' : 'Toque para ativar despertador'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsSectorAlarmModalOpen(true)}
                        className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-black text-xs font-black px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all shadow-md cursor-pointer shrink-0"
                      >
                        <Settings size={13} />
                        <span>Alarmes</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10 text-[10px]">
                      <span className="text-[#8696a0] font-bold">Filtro de exibição:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setFilterByTotemSector(true);
                            localStorage.setItem('totem_filter_by_sector', 'true');
                          }}
                          className={`px-2 py-0.5 rounded-lg font-bold cursor-pointer transition-all ${
                            filterByTotemSector ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40' : 'text-[#8696a0] hover:text-white'
                          }`}
                        >
                          Só {totemSectorName || 'Cozinha'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFilterByTotemSector(false);
                            localStorage.setItem('totem_filter_by_sector', 'false');
                          }}
                          className={`px-2 py-0.5 rounded-lg font-bold cursor-pointer transition-all ${
                            !filterByTotemSector ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40' : 'text-[#8696a0] hover:text-white'
                          }`}
                        >
                          Todos
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Banner de Instalação no Tablet */}
                  <div className="bg-gradient-to-r from-indigo-950/70 via-[#1e2a30] to-purple-950/70 border border-indigo-500/30 p-3 rounded-2xl flex items-center justify-between gap-2 shadow-lg">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                        <Tablet size={16} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-black text-white block leading-tight truncate">Instalar no Tablet</span>
                        <span className="text-[10px] text-indigo-300/80 block leading-tight font-medium">Uso em Modo Aplicativo</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleInstallPwa}
                      className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all shadow-md shadow-indigo-600/30 cursor-pointer shrink-0"
                    >
                      <Download size={13} />
                      <span>Instalar</span>
                    </button>
                  </div>

                  <h3 className="text-xs font-black text-[#8696a0] uppercase tracking-widest px-2 mt-1">Rotinas do seu Turno</h3>
                  
                  {loadingChecklists ? (
                    <div className="p-10 text-center text-[#8696a0] animate-pulse text-sm">Carregando rotinas...</div>
                  ) : checklists.length === 0 ? (
                    <div className="p-10 text-center text-[#8696a0] italic text-sm bg-[#202c33]/40 rounded-3xl border border-dashed border-white/10">
                      Nenhum checklist disponível no momento.
                    </div>
                  ) : (
                    (() => {
                      const sectorFiltered = filterByTotemSector && totemSectorId
                        ? checklists.filter(c => doesChecklistMatchSector(c, totemSectorId, totemSectorName))
                        : checklists;
                      const displayList = sectorFiltered.length > 0 ? sectorFiltered : checklists;

                      return displayList.map((chk) => {
                        const isDoneToday = !!todayCompletedChecklists[chk.id];
                        const isInProg = !isDoneToday && !!inProgressExecutions[chk.id];
                        const todayData = todayCompletedChecklists[chk.id];
                        const scheduleTimes = chk.schedule_times || (chk.schedule_time ? [chk.schedule_time] : []);

                        return (
                          <button
                            key={chk.id}
                            type="button"
                            onClick={() => {
                              handleStartChecklist(chk);
                              setActiveExecution(null);
                            }}
                            disabled={submitting}
                            className={`p-5 rounded-3xl border text-left transition-all relative flex flex-col justify-between min-h-[120px] cursor-pointer group ${
                              activeChecklist?.id === chk.id 
                                ? 'border-indigo-500 bg-indigo-500/20 shadow-xl shadow-indigo-500/15 scale-[1.01]' 
                                : isDoneToday
                                  ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15 shadow-md shadow-emerald-500/5'
                                  : isInProg
                                    ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15'
                                    : 'border-white/10 bg-[#202c33]/70 hover:bg-[#202c33] hover:border-white/20'
                            }`}
                          >
                            <div>
                              <div className="flex justify-between items-start gap-2 flex-wrap">
                                <span className="text-[10px] px-3 py-1 rounded-full font-bold bg-indigo-500/25 text-indigo-300 shrink-0 border border-indigo-500/40 uppercase tracking-wider">
                                  {chk.category || 'Geral'}
                                </span>
                                {isDoneToday ? (
                                  <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider flex items-center gap-1 shrink-0">
                                    <CheckCircle2 size={12} className="text-emerald-400" /> Realizada Hoje ({todayData.score}%)
                                  </span>
                                ) : isInProg ? (
                                  <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider animate-pulse flex items-center gap-1 shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Em Andamento
                                  </span>
                                ) : scheduleTimes.length > 0 ? (
                                  <span className="text-[10px] px-2.5 py-0.5 rounded-full font-black font-mono bg-amber-500/20 text-amber-300 border border-amber-500/35 flex items-center gap-1 shrink-0">
                                    ⏰ {scheduleTimes.join(', ')}
                                  </span>
                                ) : (
                                  <span className="text-xs text-[#8696a0] font-semibold truncate">{chk.unit_name}</span>
                                )}
                              </div>
                              <h4 className={`font-black text-base mt-3 leading-snug line-clamp-2 transition-colors ${
                                isDoneToday ? 'text-emerald-200 opacity-90' : 'text-white group-hover:text-indigo-300'
                              }`}>
                                {chk.title}
                              </h4>
                            </div>

                            <div className="flex items-center justify-between mt-4 text-xs text-[#8696a0] pt-3 border-t border-white/10 w-full">
                              <span className="flex items-center gap-1.5 font-bold text-slate-200">
                                <Compass size={14} className="text-indigo-400 shrink-0" /> {chk.sector_name}
                              </span>
                              {isDoneToday ? (
                                <span className="text-[11px] font-bold text-emerald-400 font-mono">
                                  {new Date(todayData.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}h
                                </span>
                              ) : (
                                <ChevronRight size={16} className="text-[#8696a0] group-hover:translate-x-1 transition-transform" />
                              )}
                            </div>
                          </button>
                        );
                      });
                    })()
                  )}
                </>
              ) : (
                <>
                  <h3 className="text-xs font-black text-[#8696a0] uppercase tracking-widest px-2 mt-1">Histórico Recente</h3>
                  
                  {loadingHistory ? (
                    <div className="p-10 text-center text-[#8696a0] animate-pulse text-sm">Buscando histórico...</div>
                  ) : completedExecutions.length === 0 ? (
                    <div className="p-10 text-center text-[#8696a0] italic text-sm bg-[#202c33]/40 rounded-3xl border border-dashed border-white/10">
                      Nenhuma rotina finalizada recentemente.
                    </div>
                  ) : (
                    completedExecutions.map((exec) => {
                      const chkInfo = exec.checklists || { title: 'Rotina Excluída', category: 'Geral' };
                      const formattedDate = new Date(exec.completed_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                      
                      const scoreColor = exec.score >= 90 ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/15' :
                                         exec.score >= 70 ? 'text-amber-400 border-amber-500/40 bg-amber-500/15' :
                                         'text-rose-400 border-rose-500/40 bg-rose-500/15';

                      return (
                        <button
                          key={exec.id}
                          type="button"
                          onClick={() => {
                            setActiveExecution(exec);
                            setActiveChecklist(null);
                            loadExecutionDetails(exec.id);
                          }}
                          className={`p-5 rounded-3xl border text-left transition-all relative flex flex-col justify-between min-h-[120px] cursor-pointer ${
                            activeExecution?.id === exec.id ? 'border-indigo-500 bg-indigo-500/20' : 'border-white/10 bg-[#202c33]/70 hover:bg-[#202c33]'
                          }`}
                        >
                          <div>
                            <div className="flex justify-between items-start gap-2 flex-wrap">
                              <span className="text-[10px] px-2.5 py-1 rounded-full font-bold bg-slate-500/20 text-[#8696a0] shrink-0 uppercase tracking-wider">
                                {chkInfo.category || 'Geral'}
                              </span>
                              <span className={`text-[10px] px-2.5 py-1 border rounded-full font-bold font-mono ${scoreColor} shrink-0`}>
                                {exec.score}% conformidade
                              </span>
                            </div>
                            <h4 className="font-black text-white text-base mt-3 leading-snug line-clamp-2">{chkInfo.title}</h4>
                          </div>

                          <div className="flex items-center justify-between mt-4 text-xs text-[#8696a0] pt-3 border-t border-white/10 w-full font-mono">
                            <span>{formattedDate}</span>
                            <ChevronRight size={16} className="text-slate-400" />
                          </div>
                        </button>
                      );
                    })
                  )}
                </>
              )}
            </div>

            {/* ÁREA DE PREENCHIMENTO OU DETALHES (SEÇÃO DIREITA DE MAIOR AMPLITUDE) */}
            <div className={`flex-1 ${(!activeChecklist && !activeExecution) ? 'hidden md:flex' : 'flex'} flex-col overflow-hidden bg-[#0b141a]`}>
              {activeExecution ? (
                <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-200">
                  {/* Cabeçalho da Execução Concluída */}
                  <div className="p-6 sm:p-8 bg-[#182229]/90 backdrop-blur-md border-b border-white/15 shrink-0">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => setActiveExecution(null)}
                          className="md:hidden p-3 -ml-2 rounded-2xl hover:bg-white/10 text-[#8696a0] hover:text-white transition-all shrink-0"
                        >
                          <ChevronRight className="rotate-180" size={24} />
                        </button>
                        <div>
                          <span className="text-xs uppercase tracking-wider font-mono text-emerald-400 bg-emerald-500/20 px-3.5 py-1 rounded-full border border-emerald-500/40 font-bold">Rotina Concluída</span>
                          <h2 className="text-2xl font-black text-white mt-2 tracking-tight">{activeExecution.checklists?.title || 'Rotina Finalizada'}</h2>
                          <p className="text-sm text-[#8696a0] mt-1">Visualizando respostas registradas do histórico.</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="px-5 py-3 rounded-2xl border border-white/15 bg-[#111b21] text-left font-mono">
                          <span className="text-xs block text-[#8696a0] uppercase tracking-wider font-bold">Duração</span>
                          <span className="text-sm text-white font-bold">
                            {(() => {
                              const sec = activeExecution.duration_seconds || 0;
                              const min = Math.floor(sec / 60);
                              return min > 0 ? `${min}m ${sec % 60}s` : `${sec}s`;
                            })()}
                          </span>
                        </div>
                        <div className={`px-5 py-3 rounded-2xl border flex flex-col justify-center text-left font-mono ${
                          activeExecution.score >= 90 ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' :
                          activeExecution.score >= 70 ? 'border-amber-500/40 bg-amber-500/15 text-amber-400' :
                          'border-rose-500/40 bg-rose-500/15 text-rose-400'
                        }`}>
                          <span className="text-xs uppercase tracking-wider font-bold opacity-80">Conformidade</span>
                          <span className="text-sm font-black">{activeExecution.score}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Detalhes das Respostas */}
                  <div className="flex-1 overflow-y-auto styled-scrollbar p-6 sm:p-8 space-y-5">
                    {loadingExecutionDetails ? (
                      <div className="p-20 text-center text-[#8696a0] animate-pulse text-sm">Carregando respostas detalhadas...</div>
                    ) : executionResponses.length === 0 ? (
                      <div className="p-20 text-center text-[#8696a0] italic text-sm">Nenhuma resposta registrada para esta rotina.</div>
                    ) : (
                      <div className="space-y-5">
                        {executionResponses.map((resp, idx) => {
                          const item = resp.checklist_items || { title: 'Tarefa Excluída', description: '', response_type: 'boolean' };
                          const match = item.title.match(/^\[(.*?)\]\s*(.*)$/);
                          const groupName = match ? match[1] : null;
                          const cleanTitle = match ? match[2] : item.title;
                          
                          const borderClass = resp.is_done 
                            ? resp.is_conforming && resp.is_meta_ok 
                              ? 'border-emerald-500/40 bg-emerald-500/10' 
                              : 'border-rose-500/40 bg-rose-500/10'
                            : 'border-white/10 bg-[#182229]/70';

                          return (
                            <div 
                              key={resp.id} 
                              className={`p-6 rounded-[32px] border flex flex-col gap-4 transition-all ${borderClass}`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <span className="text-xs font-bold font-mono text-[#8696a0] bg-[#202c33] w-7 h-7 flex items-center justify-center rounded-full shrink-0 border border-white/10">
                                      {idx + 1}
                                    </span>
                                    {groupName && (
                                      <span className="text-[10px] px-2.5 py-1 rounded font-bold tracking-wider uppercase bg-[#202c33] text-indigo-400 border border-indigo-500/40">
                                        {groupName}
                                      </span>
                                    )}
                                    <h4 className="font-black text-white text-base sm:text-lg leading-snug">{cleanTitle}</h4>
                                  </div>
                                  {item.description && (
                                    <p className="text-sm text-[#8696a0] mt-1 ml-10">{item.description}</p>
                                  )}
                                </div>

                                <div className="shrink-0 flex items-center gap-2 ml-10 sm:ml-0">
                                  <span className={`text-sm px-4 py-2 rounded-2xl font-mono font-black ${
                                    resp.is_conforming && resp.is_meta_ok
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  }`}>
                                    {resp.response_value}
                                  </span>
                                </div>
                              </div>

                              {resp.observation && (
                                <div className="ml-10 bg-[#111b21] border-l-4 border-amber-400 p-4 rounded-r-2xl mt-1 text-sm text-[#d1d7db] leading-relaxed">
                                  <span className="font-bold block text-amber-400 text-xs uppercase mb-1 font-mono">Observação registrada:</span>
                                  {resp.observation}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : activeChecklist ? (
                <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-200">
                  
                  {/* Banner discreto de apoio operacional com a descrição e mensagem de incentivo */}
                  {activeChecklist.description && (
                    <div className="px-6 sm:px-8 py-2.5 bg-[#182229]/60 border-b border-white/10 flex items-center justify-between gap-4 shrink-0 text-xs text-[#8696a0]">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveChecklist(null)}
                          className="md:hidden p-1 rounded-xl hover:bg-white/10 text-[#8696a0] hover:text-white transition-all shrink-0"
                        >
                          <ChevronRight className="rotate-180" size={18} />
                        </button>
                        <p className="italic font-medium">{activeChecklist.description}</p>
                      </div>

                      {/* Incentivo gamificado dinâmico */}
                      {(() => {
                        const total = itemsToAnswer.length;
                        const completed = itemsToAnswer.filter(item => responses[item.id]?.isDone).length;
                        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                        return (
                          <span className="hidden xl:inline text-[11px] font-semibold text-emerald-400/90 font-mono">
                            {getGamifiedIncentive(percent, completed, total, loggedInUser?.name)}
                          </span>
                        );
                      })()}
                    </div>
                  )}

                  {/* Formulário de Perguntas com Elementos Grandes para Tablet */}
                  <div className="flex-1 overflow-y-auto styled-scrollbar p-6 sm:p-8 space-y-6">
                    
                    {/* Banner de Aviso de Rotina Concluída Hoje */}
                    {todayCompletedChecklists[activeChecklist.id] && (
                      <div className="mb-6 p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-emerald-950/70 via-teal-900/50 to-emerald-950/70 border border-emerald-500/50 text-emerald-200 flex flex-wrap items-center justify-between gap-4 shadow-xl shadow-emerald-500/10 animate-in fade-in duration-300">
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0 shadow-inner">
                            <CheckCircle2 size={24} className="text-emerald-400" />
                          </div>
                          <div>
                            <h4 className="font-black text-sm sm:text-base text-white flex items-center gap-2.5 flex-wrap">
                              Rotina Finalizada no Turno de Hoje!
                              <span className="px-3 py-0.5 rounded-full text-xs bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 font-bold font-mono">
                                {todayCompletedChecklists[activeChecklist.id].score}% Aprovado
                              </span>
                            </h4>
                            <p className="text-xs text-emerald-300/80 mt-0.5 font-semibold">
                              Todas as respostas e conferências realizadas hoje estão exibidas e preenchidas abaixo.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Filtros da Lista */}
                    {itemsToAnswer.length > 0 && (
                      <div className="flex flex-col sm:flex-row gap-4 mb-5 bg-[#182229]/70 p-4 rounded-3xl border border-white/10 shadow-sm">
                        <div className="flex-1 relative">
                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search size={18} className="text-[#8696a0]" />
                          </div>
                          <input
                            type="text"
                            placeholder="Buscar item nesta rotina..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#111b21] border border-white/15 rounded-2xl pl-11 pr-5 py-3 text-sm text-white placeholder-[#8696a0] focus:outline-none focus:border-indigo-500 transition-all"
                          />
                        </div>
                        
                        <div className="sm:w-64">
                          <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="w-full bg-[#111b21] border border-white/15 rounded-2xl px-4 py-3 text-sm text-[#d1d7db] focus:outline-none focus:border-indigo-500 transition-all cursor-pointer font-medium"
                          >
                            <option value="">Todas as Categorias</option>
                            {Array.from(new Set(itemsToAnswer.map(item => {
                              const match = item.title.match(/^\[(.*?)\]\s*(.*)$/);
                              return match ? match[1] : null;
                            }).filter(Boolean))).map(cat => (
                              <option key={cat as string} value={cat as string}>{cat}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    <Reorder.Group 
                      axis="y" 
                      values={itemsToAnswer.filter(item => {
                        const match = item.title.match(/^\[(.*?)\]\s*(.*)$/);
                        const groupName = match ? match[1] : null;
                        const cleanTitle = match ? match[2] : item.title;
                        
                        if (categoryFilter && groupName !== categoryFilter) return false;
                        if (searchQuery && !cleanTitle.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                        return true;
                      })} 
                      onReorder={(newFilteredItems) => {
                        const currentFiltered = itemsToAnswer.filter(item => {
                          const match = item.title.match(/^\[(.*?)\]\s*(.*)$/);
                          const groupName = match ? match[1] : null;
                          const cleanTitle = match ? match[2] : item.title;
                          if (categoryFilter && groupName !== categoryFilter) return false;
                          if (searchQuery && !cleanTitle.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                          return true;
                        });
                        
                        const newItemsToAnswer = [...itemsToAnswer];
                        const indices = currentFiltered.map(item => itemsToAnswer.findIndex(i => i.id === item.id));
                        indices.forEach((index, i) => {
                          newItemsToAnswer[index] = newFilteredItems[i];
                        });
                        setItemsToAnswer(newItemsToAnswer);
                      }}
                      className="space-y-6"
                    >
                    {itemsToAnswer.filter(item => {
                      const match = item.title.match(/^\[(.*?)\]\s*(.*)$/);
                      const groupName = match ? match[1] : null;
                      const cleanTitle = match ? match[2] : item.title;
                      
                      if (categoryFilter && groupName !== categoryFilter) return false;
                      if (searchQuery && !cleanTitle.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                      return true;
                    }).map((item, idx) => {
                      const resp = responses[item.id] || { itemId: item.id, value: '', isConforming: true, isMetaOk: true, isDone: false };

                      return (
                        <Reorder.Item 
                          key={item.id}
                          id={`item-card-${item.id}`}
                          value={item}
                          className={`p-6 sm:p-7 rounded-[32px] border flex flex-col gap-5 transition-all duration-300 ${
                            resp.isDone 
                              ? 'border-emerald-500/50 bg-emerald-500/10 shadow-md shadow-emerald-500/5' 
                              : item.is_required 
                                ? 'border-white/15 bg-[#182229] hover:border-white/25 shadow-lg' 
                                : 'border-white/10 bg-[#182229]/80 hover:border-white/20'
                          }`}
                        >
                          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                            {/* Enunciado e Instrução */}
                            <div className="min-w-0 flex-1 space-y-2">
                              {(() => {
                                const match = item.title.match(/^\[(.*?)\]\s*(.*)$/);
                                const groupName = match ? match[1] : null;
                                const cleanTitle = match ? match[2] : item.title;
                                const cleanDescription = item.description ? item.description.replace(/Fornecedor:\s*/g, '').replace(/Custo:\s*/g, '').split(' | ').join(' • ') : null;

                                return (
                                  <>
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <div className="cursor-grab hover:text-indigo-400 text-[#8696a0] transition-colors shrink-0 mr-1 active:cursor-grabbing p-1">
                                        <GripVertical size={20} />
                                      </div>
                                      {resp.isDone ? (
                                        <span className="w-7 h-7 flex items-center justify-center rounded-full shrink-0 bg-emerald-400 text-black font-black text-sm shadow-md">
                                          ✓
                                        </span>
                                      ) : (
                                        <span className="text-xs font-bold font-mono text-[#8696a0] bg-[#202c33] border border-white/10 w-7 h-7 flex items-center justify-center rounded-full shrink-0">
                                          {idx + 1}
                                        </span>
                                      )}
                                      
                                      {/* Tag de Categoria com troca rápida */}
                                      <div className="relative shrink-0">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveCategoryEditItemId(activeCategoryEditItemId === item.id ? null : item.id);
                                            setNewInlineCategoryName('');
                                          }}
                                          className={`text-[10px] px-3 py-1 rounded-xl font-bold tracking-wider uppercase flex items-center gap-1.5 transition-all select-none cursor-pointer ${
                                            groupName 
                                              ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40' 
                                              : 'bg-white/10 text-[#8696a0] hover:text-white border border-white/15'
                                          }`}
                                          title="Trocar categoria"
                                        >
                                          <span>{groupName || '+ CAT'}</span>
                                          <ChevronDown size={12} className="opacity-70" />
                                        </button>

                                        {activeCategoryEditItemId === item.id && (
                                          <>
                                            <div 
                                              className="fixed inset-0 z-40" 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveCategoryEditItemId(null);
                                              }}
                                            />
                                            <div 
                                              className="absolute left-0 mt-2 w-56 bg-[#202c33] border border-white/15 rounded-3xl p-3 z-50 shadow-2xl animate-in fade-in slide-in-from-top-1 text-left"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <span className="text-[9px] font-black text-[#8696a0] block uppercase tracking-wider mb-2 px-2">Mudar Categoria</span>
                                              
                                              <div className="max-h-36 overflow-y-auto space-y-1 mb-2.5 styled-scrollbar px-1">
                                                <button
                                                  type="button"
                                                  onClick={() => handleUpdateItemCategory(item.id, item.title, '')}
                                                  className="w-full text-left text-xs text-[#d1d7db] hover:bg-[#111b21] hover:text-white px-3 py-2 rounded-xl transition-colors flex items-center justify-between font-medium"
                                                >
                                                  <span>(Sem Categoria)</span>
                                                  {!groupName && <span className="text-xs text-indigo-400 font-bold">✓</span>}
                                                </button>
                                                
                                                {Array.from(new Set(itemsToAnswer.map(i => {
                                                  const m = i.title.match(/^\[(.*?)\]\s*(.*)$/);
                                                  return m ? m[1] : null;
                                                }).filter(Boolean))).map(cat => (
                                                  <button
                                                    key={cat as string}
                                                    type="button"
                                                    onClick={() => handleUpdateItemCategory(item.id, item.title, cat as string)}
                                                    className="w-full text-left text-xs text-[#d1d7db] hover:bg-[#111b21] hover:text-white px-3 py-2 rounded-xl transition-colors flex items-center justify-between font-medium"
                                                  >
                                                    <span className="truncate">{cat}</span>
                                                    {groupName === cat && <span className="text-xs text-indigo-400 font-bold">✓</span>}
                                                  </button>
                                                ))}
                                              </div>

                                              <div className="pt-2.5 border-t border-white/10 px-1">
                                                <div className="flex gap-2">
                                                  <input
                                                    type="text"
                                                    value={newInlineCategoryName}
                                                    onChange={e => setNewInlineCategoryName(e.target.value.toUpperCase())}
                                                    placeholder="NOVA CATEGORIA"
                                                    className="flex-1 bg-[#111b21] border border-white/15 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-[#8696a0]/50"
                                                  />
                                                  <button
                                                    type="button"
                                                    disabled={!newInlineCategoryName.trim()}
                                                    onClick={() => handleUpdateItemCategory(item.id, item.title, newInlineCategoryName.trim())}
                                                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition-all"
                                                  >
                                                    OK
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          </>
                                        )}
                                      </div>

                                      <h4 className={`font-black text-base sm:text-lg leading-snug transition-all ${resp.isDone ? 'text-emerald-300 line-through opacity-85' : 'text-white'}`}>{cleanTitle}</h4>
                                      
                                      {resp.isDone && (
                                        <span className="text-xs font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 px-3 py-0.5 rounded-full shrink-0">
                                          Concluído ✅
                                        </span>
                                      )}
                                      {item.is_required && !resp.isDone && (
                                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest shrink-0">* OBRIGATÓRIO</span>
                                      )}
                                      {item.is_critical && !resp.isDone && (
                                        <span className="text-[10px] font-black text-rose-300 bg-rose-500/20 border border-rose-500/40 px-3 py-0.5 rounded-full shrink-0">
                                          CRÍTICO
                                        </span>
                                      )}
                                    </div>
                                    
                                    {cleanDescription && (
                                      <p className="text-sm sm:text-base text-[#e9edef] bg-[#111b21]/80 border-l-4 border-indigo-500 pl-4 py-2.5 rounded-r-2xl mt-2 leading-relaxed ml-9 font-normal">
                                        {cleanDescription}
                                      </p>
                                    )}

                                    {/* Metas Numéricas */}
                                    {(item.response_type === 'numeric' || item.response_type === 'temperature' || item.response_type === 'kg') && (item.min_meta !== null || item.max_meta !== null) && (
                                      <p className="text-xs sm:text-sm text-teal-400 pl-9 font-mono font-bold mt-1.5">
                                        {item.min_meta !== null ? `Mín: ${item.min_meta}` : ''} {item.max_meta !== null ? `Máx: ${item.max_meta}` : ''} {item.measurement_unit || (item.response_type === 'kg' ? 'kg' : '')}
                                      </p>
                                    )}

                                    {/* Dica operacional ou cálculo em tempo real */}
                                    {(() => {
                                      const helperMsg = getHelperMessage(item, responses);
                                      if (!helperMsg) return null;
                                      return (
                                        <p className="text-xs sm:text-sm text-indigo-300 pl-9 font-semibold mt-1.5 flex items-center gap-2 flex-wrap">
                                          <span>{helperMsg.text}</span>
                                          {helperMsg.type === 'stock_suggestion' && !resp.value && (
                                            <button
                                              type="button"
                                              onClick={() => handleAnswerChange(item.id, item.response_type, helperMsg.value!, item.min_meta, item.max_meta)}
                                              className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded-xl transition-all active:scale-95 cursor-pointer ml-1 select-none shadow-md"
                                            >
                                              Usar Sugestão
                                            </button>
                                          )}
                                        </p>
                                      );
                                    })()}
                                  </>
                                );
                              })()}

                              {/* Lista de Verificação (Sub-tarefas com Cards Grandes) */}
                              {item.options && item.options.length > 0 && (
                                <div className="mt-3 pl-9 space-y-2">
                                  <span className="text-xs font-black text-indigo-400 block uppercase tracking-widest">ITENS A VERIFICAR:</span>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {item.options.map((sub: string, sIdx: number) => {
                                      const subtaskKey = `${item.id}_${sIdx}`;
                                      const isChecked = checkedSubtasks[subtaskKey] || false;
                                      return (
                                        <label 
                                          key={sIdx} 
                                          className={`flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer select-none text-xs sm:text-sm font-semibold min-h-[52px] ${
                                            isChecked 
                                              ? 'bg-indigo-500/20 border-indigo-500/50 text-white shadow-md' 
                                              : 'bg-[#111b21]/80 border-white/10 text-[#d1d7db] hover:bg-[#111b21]'
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => handleSubtaskToggle(item.id, item.options, sIdx, e.target.checked)}
                                            className="rounded-lg border-white/30 text-indigo-500 bg-[#202c33] focus:ring-indigo-500/40 focus:ring-offset-0 w-5 h-5 cursor-pointer shrink-0"
                                          />
                                          <span className="leading-snug">{sub}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Campo de Upload de Foto de Evidência se exigido */}
                              {item.require_evidence && (
                                <div className="pt-3 pl-9 flex items-center gap-3 flex-wrap">
                                  <label className={`px-5 py-3 rounded-2xl border text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-all active:scale-95 min-h-[48px] ${
                                    resp.evidenceUrl ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' : 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25'
                                  }`}>
                                    <Camera size={18} />
                                    {resp.evidenceUploading ? 'Enviando Foto...' : resp.evidenceUrl ? 'Foto Anexada ✅' : 'Tirar Foto Evidência'}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      capture="environment"
                                      onChange={(e) => handlePhotoUpload(item.id, e)}
                                      className="hidden"
                                      disabled={resp.evidenceUploading}
                                    />
                                  </label>
                                  {resp.evidenceUrl && (
                                    <a href={resp.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#8696a0] hover:text-white underline truncate max-w-[200px] font-medium">
                                      Ver Foto Anexada
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Seleção de Respostas Otimizada para Toque de Polegar (Botões de 56px de Altura) */}
                            <div className="shrink-0 flex items-center justify-start xl:justify-end">
                              
                              {/* BOOLEAN ("Feito / Não Feito") */}
                              {item.response_type === 'boolean' && (
                                <div className="flex flex-wrap sm:flex-nowrap gap-2.5 bg-[#111b21] p-2 rounded-2xl border border-white/15 shadow-inner w-full sm:w-auto">
                                  <button
                                    type="button"
                                    onClick={() => handleAnswerChange(item.id, item.response_type, 'Feito', item.min_meta, item.max_meta)}
                                    className={`flex-1 sm:flex-none min-w-[130px] h-13 sm:h-14 px-5 rounded-xl text-xs sm:text-sm font-black tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer ${
                                      resp.value === 'Feito'
                                        ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-xl shadow-emerald-500/40 scale-[1.03] border border-emerald-400/40'
                                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                                    }`}
                                  >
                                    <CheckCircle2 size={18} /> FEITO
                                  </button>
                                  
                                  <button
                                    type="button"
                                    onClick={() => handleAnswerChange(item.id, item.response_type, 'Não Feito', item.min_meta, item.max_meta)}
                                    className={`flex-1 sm:flex-none min-w-[130px] h-13 sm:h-14 px-5 rounded-xl text-xs sm:text-sm font-black tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer ${
                                      resp.value === 'Não Feito'
                                        ? 'bg-gradient-to-r from-rose-600 via-rose-500 to-red-500 text-white shadow-xl shadow-rose-500/40 scale-[1.03] border border-rose-400/40'
                                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                                    }`}
                                  >
                                    <XCircle size={18} /> NÃO FEITO
                                  </button>
                                </div>
                              )}

                              {/* CONFORMIDADE ("Conforme / Não Conforme") */}
                              {item.response_type === 'conformity' && (
                                <div className="flex flex-wrap sm:flex-nowrap gap-2.5 bg-[#111b21] p-2 rounded-2xl border border-white/15 shadow-inner w-full sm:w-auto">
                                  <button
                                    type="button"
                                    onClick={() => handleAnswerChange(item.id, item.response_type, 'Conforme', item.min_meta, item.max_meta)}
                                    className={`flex-1 sm:flex-none min-w-[140px] h-13 sm:h-14 px-5 rounded-xl text-xs sm:text-sm font-black tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer ${
                                      resp.value === 'Conforme'
                                        ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-xl shadow-emerald-500/40 scale-[1.03] border border-emerald-400/40'
                                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                                    }`}
                                  >
                                    <CheckCircle2 size={18} /> CONFORME
                                  </button>
                                  
                                  <button
                                    type="button"
                                    onClick={() => handleAnswerChange(item.id, item.response_type, 'Não Conforme', item.min_meta, item.max_meta)}
                                    className={`flex-1 sm:flex-none min-w-[140px] h-13 sm:h-14 px-5 rounded-xl text-xs sm:text-sm font-black tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer ${
                                      resp.value === 'Não Conforme'
                                        ? 'bg-gradient-to-r from-rose-600 via-rose-500 to-red-500 text-white shadow-xl shadow-rose-500/40 scale-[1.03] border border-rose-400/40'
                                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                                    }`}
                                  >
                                    <XCircle size={18} /> NÃO CONFORME
                                  </button>
                                </div>
                              )}

                              {/* YES_NO ("Sim / Não") */}
                              {item.response_type === 'yes_no' && (
                                <div className="flex flex-wrap sm:flex-nowrap gap-2.5 bg-[#111b21] p-2 rounded-2xl border border-white/15 shadow-inner w-full sm:w-auto">
                                  <button
                                    type="button"
                                    onClick={() => handleAnswerChange(item.id, item.response_type, 'Sim', item.min_meta, item.max_meta)}
                                    className={`flex-1 sm:flex-none min-w-[120px] h-13 sm:h-14 px-5 rounded-xl text-xs sm:text-sm font-black tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer ${
                                      resp.value === 'Sim'
                                        ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-xl shadow-emerald-500/40 scale-[1.03] border border-emerald-400/40'
                                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                                    }`}
                                  >
                                    <CheckCircle2 size={18} /> SIM
                                  </button>
                                  
                                  <button
                                    type="button"
                                    onClick={() => handleAnswerChange(item.id, item.response_type, 'Não', item.min_meta, item.max_meta)}
                                    className={`flex-1 sm:flex-none min-w-[120px] h-13 sm:h-14 px-5 rounded-xl text-xs sm:text-sm font-black tracking-wide flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer ${
                                      resp.value === 'Não'
                                        ? 'bg-gradient-to-r from-rose-600 via-rose-500 to-red-500 text-white shadow-xl shadow-rose-500/40 scale-[1.03] border border-rose-400/40'
                                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                                    }`}
                                  >
                                    <XCircle size={18} /> NÃO
                                  </button>
                                </div>
                              )}

                              {/* NUMERIC / TEMPERATURE / COUNTER / KG (Com Botões Gigantes) */}
                              {(item.response_type === 'numeric' || item.response_type === 'temperature' || item.response_type === 'counter' || item.response_type === 'kg') && (
                                <div className="flex items-center gap-2 bg-[#111b21] p-2 rounded-[24px] border border-white/15 shadow-inner">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const step = item.response_type === 'kg' ? 0.1 : 1;
                                      const current = parseFloat(resp.value || '0');
                                      const result = (current - step).toFixed(item.response_type === 'kg' ? 3 : 0);
                                      handleAnswerChange(
                                        item.id, 
                                        item.response_type, 
                                        item.response_type === 'kg' ? parseFloat(result).toFixed(3) : parseFloat(result).toString(), 
                                        item.min_meta, 
                                        item.max_meta
                                      );
                                    }}
                                    className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center bg-[#202c33] hover:bg-[#2a3942] rounded-2xl text-[#8696a0] hover:text-white text-3xl font-light transition-all active:scale-95 cursor-pointer shadow-md"
                                  >
                                    -
                                  </button>
                                  
                                  <div className="flex items-baseline px-3">
                                    {item.response_type === 'kg' ? (
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={resp.value ? resp.value.replace('.', ',') : ''}
                                        onChange={(e) => {
                                          const rawVal = e.target.value;
                                          if (rawVal === '') {
                                            handleAnswerChange(item.id, item.response_type, '', item.min_meta, item.max_meta);
                                            return;
                                          }
                                          const digits = rawVal.replace(/\D/g, '');
                                          if (digits) {
                                            const parsed = parseInt(digits, 10);
                                            const processed = (parsed / 1000).toFixed(3);
                                            handleAnswerChange(item.id, item.response_type, processed, item.min_meta, item.max_meta);
                                          } else {
                                            handleAnswerChange(item.id, item.response_type, '0.000', item.min_meta, item.max_meta);
                                          }
                                        }}
                                        placeholder="0,000"
                                        className="bg-transparent border-none focus:outline-none focus:ring-0 text-3xl sm:text-5xl font-black w-28 sm:w-36 text-center text-white p-0 m-0 font-mono tracking-wide"
                                      />
                                    ) : (
                                      <input
                                        type="number"
                                        step="any"
                                        value={resp.value || ''}
                                        onChange={(e) => handleAnswerChange(item.id, item.response_type, e.target.value, item.min_meta, item.max_meta)}
                                        placeholder="0"
                                        className="bg-transparent border-none focus:outline-none focus:ring-0 text-3xl sm:text-5xl font-black w-24 sm:w-28 text-center text-white p-0 m-0 font-mono"
                                      />
                                    )}
                                    {(item.measurement_unit || item.response_type === 'kg') && (
                                      <span className="text-xs font-black text-indigo-300 shrink-0 ml-2 uppercase font-mono bg-indigo-500/20 border border-indigo-500/40 px-2.5 py-1 rounded-xl select-none">
                                        {item.measurement_unit || 'kg'}
                                      </span>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const step = item.response_type === 'kg' ? 0.1 : 1;
                                      const current = parseFloat(resp.value || '0');
                                      const result = (current + step).toFixed(item.response_type === 'kg' ? 3 : 0);
                                      handleAnswerChange(
                                        item.id, 
                                        item.response_type, 
                                        item.response_type === 'kg' ? parseFloat(result).toFixed(3) : parseFloat(result).toString(), 
                                        item.min_meta, 
                                        item.max_meta
                                      );
                                    }}
                                    className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-2xl text-3xl font-light transition-all active:scale-95 border border-emerald-500/40 cursor-pointer shadow-md"
                                  >
                                    +
                                  </button>
                                </div>
                              )}

                              {/* TEXT FREE */}
                              {item.response_type === 'text' && (
                                <textarea
                                  rows={2}
                                  value={resp.value || ''}
                                  onChange={(e) => handleAnswerChange(item.id, item.response_type, e.target.value, item.min_meta, item.max_meta)}
                                  placeholder="Descreva aqui..."
                                  className="bg-[#111b21] border border-white/15 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 w-full sm:w-80"
                                />
                              )}

                              {/* STARS */}
                              {item.response_type === 'stars' && (
                                <div className="flex gap-2">
                                  {[1, 2, 3, 4, 5].map(starNum => {
                                    const isSelected = parseInt(resp.value) >= starNum;
                                    return (
                                      <button
                                        key={starNum}
                                        type="button"
                                        onClick={() => handleAnswerChange(item.id, item.response_type, starNum.toString(), item.min_meta, item.max_meta)}
                                        className={`p-2 hover:scale-125 transition-transform cursor-pointer ${isSelected ? 'text-amber-400' : 'text-[#202c33]'}`}
                                      >
                                        <Star size={24} fill={isSelected ? 'currentColor' : 'transparent'} />
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                            </div>
                          </div>

                          {/* Data e Hora e Operador */}
                          {resp.isDone && resp.answeredAt && resp.answeredBy && (
                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10 text-xs text-[#8696a0] animate-in fade-in slide-in-from-top-1">
                              <CheckCircle2 size={15} className="text-emerald-400" />
                              <span>
                                Registrado por <strong className="text-white font-semibold">{resp.answeredBy}</strong> em{' '}
                                {new Date(resp.answeredAt).toLocaleDateString('pt-BR')} às{' '}
                                {new Date(resp.answeredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                        </Reorder.Item>
                      );
                    })}
                    </Reorder.Group>
                  </div>

                  {/* Barra Inferior de Envio Responsiva e Ergonômica */}
                  <div className="h-24 bg-[#182229]/95 backdrop-blur-xl border-t border-white/15 px-8 flex items-center justify-between shrink-0 shadow-2xl relative z-10">
                    <button
                      onClick={() => setActiveChecklist(null)}
                      className="text-sm text-[#8696a0] hover:text-white font-bold flex items-center gap-2 transition-colors cursor-pointer p-2"
                    >
                      <X size={18} /> Abandonar Roteiro
                    </button>
                    
                    {(() => {
                      const isAllDone = itemsToAnswer.length > 0 && itemsToAnswer.every(i => responses[i.id]?.isDone);
                      return (
                        <button
                          id="submit-checklist-btn"
                          onClick={handleSubmitChecklist}
                          disabled={submitting}
                          className={`h-14 rounded-2xl flex items-center gap-3 transition-all cursor-pointer font-black text-sm px-8 shadow-xl ${
                            isAllDone
                              ? 'bg-gradient-to-r from-emerald-500 via-indigo-600 to-purple-600 text-white border-2 border-emerald-400 shadow-2xl shadow-emerald-500/50 animate-bounce scale-105 ring-4 ring-emerald-500/30'
                              : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-600/30 active:scale-95 disabled:opacity-50'
                          }`}
                        >
                          {submitting ? 'Registrando na Base...' : 'Finalizar e Assinar Rotina'}
                          <ArrowRight size={18} className={isAllDone ? 'animate-pulse text-emerald-300' : ''} />
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                  <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 mb-2 shadow-xl shadow-indigo-500/10 animate-pulse">
                    <Smile size={44} />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-xl tracking-tight">Cozinha Organizada!</h3>
                    <p className="text-sm text-[#8696a0] mt-1.5 max-w-[320px] mx-auto leading-relaxed">
                      Selecione uma das rotinas ativas ou consulte o histórico de concluídos no painel esquerdo.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* MODAL DE LINK EXCLUSIVO & INSTALAÇÃO DO PWA NO TABLET ANDROID */}
      {isInstallModalOpen && (() => {
        const cleanOrigin = window.location.origin;
        const shortTotemUrl = `${cleanOrigin}/totem-cozinha`;
        const fullTotemUrl = `${cleanOrigin}/totem-cozinha?${tenantId ? `tenant=${encodeURIComponent(tenantId)}&` : ''}sector=${encodeURIComponent(totemSectorName || 'Cozinha')}&install=1`;
        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(fullTotemUrl)}`;

        return (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
            <div className="bg-[#182229] border border-indigo-500/30 rounded-[36px] p-6 sm:p-8 shadow-2xl max-w-2xl w-full text-left space-y-5 relative my-auto max-h-[92vh] overflow-y-auto">
              <button
                onClick={() => setIsInstallModalOpen(false)}
                className="absolute top-5 right-5 p-2 rounded-full hover:bg-white/10 text-[#8696a0] hover:text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-indigo-600/30">
                  <Tablet size={30} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                    Rota Exclusiva Android PWA • Setor {totemSectorName || 'Cozinha'}
                  </span>
                  <h3 className="text-xl font-black text-white tracking-tight">
                    Link & Instalador do Totem Cozinha
                  </h3>
                  <p className="text-xs text-[#8696a0] mt-0.5">
                    Abra o link abaixo ou escaneie o QR Code no Tablet Android da cozinha para instalar o app dedicado com despertador em segundo plano.
                  </p>
                </div>
              </div>

              {/* BLOCO DO LINK EXCLUSIVO E QR CODE */}
              <div className="bg-[#111b21] p-4 sm:p-5 rounded-3xl border border-indigo-500/25 flex flex-col sm:flex-row items-center gap-5">
                <div className="bg-white p-2.5 rounded-2xl shrink-0 shadow-lg">
                  <img
                    src={qrImageUrl}
                    alt="QR Code Totem Cozinha PWA"
                    className="w-36 h-36 rounded-xl object-contain"
                  />
                </div>

                <div className="flex-1 w-full space-y-3">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 block mb-1">
                      Link Curto (Para digitar no Chrome do Tablet Android):
                    </span>
                    <div className="flex items-center gap-2 bg-[#182229] border border-white/10 rounded-xl px-3 py-2">
                      <code className="text-xs font-mono font-bold text-emerald-300 truncate flex-1">
                        {shortTotemUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(shortTotemUrl);
                          showToast('success', '📋 Link curto copiado para a área de transferência!');
                        }}
                        className="p-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Copy size={13} />
                        <span>Copiar</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block mb-1">
                      Link Direto com Empresa + Setor ({totemSectorName || 'Cozinha'}):
                    </span>
                    <div className="flex items-center gap-2 bg-[#182229] border border-white/10 rounded-xl px-3 py-2">
                      <code className="text-[11px] font-mono text-[#d1d7db] truncate flex-1">
                        {fullTotemUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(fullTotemUrl);
                          showToast('success', '📋 Link completo do Totem Cozinha copiado!');
                        }}
                        className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Copy size={13} />
                        <span>Copiar</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* PASSO A PASSO NO TABLET ANDROID */}
              <div className="space-y-3 bg-[#111b21] p-4 sm:p-5 rounded-3xl border border-white/10 text-xs text-[#d1d7db]">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold flex items-center justify-center shrink-0 mt-0.5">1</div>
                  <div>
                    <strong className="text-white font-bold block mb-0.5">No Tablet Android (Google Chrome) 📱</strong>
                    <span>Acesse <strong className="text-emerald-300">{shortTotemUrl}</strong> e toque no botão <strong className="text-indigo-300">"Instalar Agora"</strong> abaixo (ou nos <strong>3 pontinhos ⋮</strong> do Chrome ➔ <strong className="text-indigo-300">"Instalar Aplicativo / Adicionar à Tela Inicial"</strong>).</span>
                  </div>
                </div>

                <div className="h-px bg-white/10 my-1.5" />

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold flex items-center justify-center shrink-0 mt-0.5">2</div>
                  <div>
                    <strong className="text-white font-bold block mb-0.5">Ative o Despertador do Setor ({totemSectorName || 'Cozinha'}) 🔔</strong>
                    <span>Ao aceitar a permissão de notificação, o tablet recebe os <strong>alarmes nos horários exatos</strong> com a lista de tarefas do setor mesmo com o aplicativo fechado ou tela bloqueada.</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                {deferredPrompt && (
                  <button
                    onClick={handleInstallPwa}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-sm py-3.5 px-5 rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-indigo-600/30 transition-all cursor-pointer active:scale-95"
                  >
                    <Download size={18} />
                    <span>📲 Instalar App no Tablet Agora</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    handleActivateSectorPushAlarm(totemSectorId || '', totemSectorName || 'Cozinha', false);
                  }}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-sm py-3.5 px-5 rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 transition-all cursor-pointer active:scale-95"
                >
                  <BellRing size={18} />
                  <span>🔔 Ativar Alarme Setor {totemSectorName || 'Cozinha'}</span>
                </button>
                <button
                  onClick={() => setIsInstallModalOpen(false)}
                  className="bg-[#202c33] hover:bg-[#2a3942] text-[#d1d7db] hover:text-white font-bold text-sm py-3.5 px-5 rounded-2xl border border-white/10 transition-all cursor-pointer text-center"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================
          MODAL DE CONFIGURAÇÃO DE SETOR DO TABLET & ALARMES ANDROID (APP FECHADO)
         ======================================================================== */}
      {isSectorAlarmModalOpen && (
        <div
          className="fixed inset-0 z-[9998] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in"
          onClick={() => setIsSectorAlarmModalOpen(false)}
        >
          <div
            className="bg-[#182229] border border-amber-500/30 w-full max-w-3xl max-h-[92vh] rounded-3xl overflow-hidden shadow-2xl shadow-black/80 flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Modal */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent border-b border-white/10 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/30 shrink-0">
                  <BellRing size={24} className="animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                      Setor do Tablet & Despertador Android
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Setor Atual: {totemSectorId === 'ALL' ? 'Todos os Setores' : (totemSectorName || 'Cozinha')}
                    </span>
                  </div>
                  <p className="text-xs text-[#8696a0] mt-0.5">
                    Configure o setor deste tablet (ex: <strong>Cozinha</strong>) para que ele desperte nos horários exatos mostrando todas as tarefas, mesmo com o app fechado.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSectorAlarmModalOpen(false)}
                className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-[#8696a0] hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            {/* Corpo Rolável */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
              {/* PASSO 1: ESCOLHER OU CRIAR O SETOR DO TABLET */}
              <div className="bg-[#111b21] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                      1. Regra de Despertar por Setor
                    </span>
                    <h4 className="text-sm sm:text-base font-bold text-white">
                      Qual é o Setor deste Tablet?
                    </h4>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[#d1d7db] cursor-pointer bg-[#202c33] px-3 py-1.5 rounded-xl border border-white/10">
                    <input
                      type="checkbox"
                      checked={filterByTotemSector}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFilterByTotemSector(checked);
                        localStorage.setItem('totem_filter_by_sector', String(checked));
                      }}
                      className="rounded accent-amber-500"
                    />
                    <span>Filtrar tela apenas pelo setor selecionado</span>
                  </label>
                </div>

                {/* Chips de Setores Existentes */}
                <div className="flex flex-wrap gap-2">
                  {sectorsList.map((sec) => {
                    const isSelected = totemSectorId === sec.id || (!totemSectorId && sec.name.toLowerCase() === totemSectorName.toLowerCase());
                    return (
                      <button
                        key={sec.id}
                        onClick={() => handleSelectTotemSector(sec.id, sec.name)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer border ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/25 scale-[1.02]'
                            : 'bg-[#202c33] text-[#d1d7db] border-white/10 hover:border-amber-500/40 hover:text-white'
                        }`}
                      >
                        <MapPin size={14} />
                        <span>{sec.name}</span>
                        {isSelected && <Check size={14} className="stroke-[3]" />}
                      </button>
                    );
                  })}

                  {/* Atalho rápido para Cozinha caso ainda não exista no banco */}
                  {!sectorsList.some(s => s.name.toLowerCase().includes('cozinha')) && (
                    <button
                      onClick={() => handleSelectTotemSector('', 'Cozinha')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer border ${
                        totemSectorName.toLowerCase() === 'cozinha' && totemSectorId !== 'ALL'
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/25'
                          : 'bg-[#202c33] text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                      }`}
                    >
                      <MapPin size={14} />
                      <span>Cozinha (Padrão)</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleSelectTotemSector('ALL', 'Todos os Setores')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                      totemSectorId === 'ALL'
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-600/25'
                        : 'bg-[#202c33] text-[#8696a0] border-white/10 hover:text-white'
                    }`}
                  >
                    <span>Todos os Setores</span>
                  </button>
                </div>

                {/* Criar Novo Setor Rápido */}
                <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/5">
                  <input
                    type="text"
                    value={newSectorInputName}
                    onChange={(e) => setNewSectorInputName(e.target.value)}
                    placeholder="Criar novo setor (ex: Cozinha Quente, Bar, Confeitaria, Salão)..."
                    className="flex-1 bg-[#202c33] border border-white/10 focus:border-amber-500/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder-[#8696a0] outline-none"
                  />
                  <button
                    onClick={handleCreateNewSector}
                    disabled={creatingSector || !newSectorInputName.trim()}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 text-amber-300 border border-amber-500/30 text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                  >
                    <Plus size={15} />
                    <span>{creatingSector ? 'Criando...' : 'Criar & Selecionar Setor'}</span>
                  </button>
                </div>
              </div>

              {/* PASSO 2: PERMISSÃO DE ALARME EM SEGUNDO PLANO (WEB PUSH ANDROID + WAKELOCK) */}
              <div className="bg-[#111b21] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block">
                      2. Despertador com App Fechado / Tela Bloqueada (Web Push High-Priority)
                    </span>
                    <h4 className="text-sm sm:text-base font-bold text-white mt-0.5">
                      Status do Motor de Alarme no Android
                    </h4>
                    <p className="text-xs text-[#8696a0] mt-1">
                      Nosso servidor monitora os horários exatos (fuso de Brasília) a cada 20 segundos e envia um sinal <strong>Web Push de Alta Prioridade (Urgency: High)</strong> que acorda o tablet mesmo com o navegador ou PWA fechado.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 border ${
                      pushStatus === 'active'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : pushStatus === 'denied'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${pushStatus === 'active' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                      {pushStatus === 'active' ? 'Push Ativo no Tablet' : pushStatus === 'subscribing' ? 'Ativando...' : pushStatus === 'denied' ? 'Bloqueado no Navegador' : 'Aguardando Ativação'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    onClick={() => handleActivateSectorPushAlarm()}
                    disabled={pushStatus === 'subscribing'}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all cursor-pointer active:scale-95"
                  >
                    <BellRing size={16} />
                    <span>{pushStatus === 'active' ? 'Revalidar Alarme Push' : 'Ativar Alarme no Tablet'}</span>
                  </button>

                  <button
                    onClick={() => {
                      const sectorChecklists = allTenantChecklists.filter(c =>
                        doesChecklistMatchSector(c, totemSectorId, totemSectorName)
                      );
                      const sampleChk = sectorChecklists[0] || allTenantChecklists[0];
                      triggerFullAlarmModal({
                        checklistId: sampleChk?.id || '',
                        checklistTitle: sampleChk?.title || `Rotina ${totemSectorName || 'Cozinha'}`,
                        checklistCategory: sampleChk?.category || 'Operacional',
                        sectorId: totemSectorId || 'ALL',
                        sectorName: totemSectorName || 'Cozinha',
                        scheduleTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                        tasks: sampleChk?.items_list && sampleChk.items_list.length > 0 ? sampleChk.items_list : [
                          { id: '1', title: 'Verificar temperatura de geladeiras e balcões térmicos', is_required: true },
                          { id: '2', title: 'Higienizar bancadas de manipulação de alimentos', is_required: true },
                          { id: '3', title: 'Conferir etiquetas de validade e mise en place do turno', is_required: true }
                        ]
                      });
                    }}
                    className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-black text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                  >
                    <Volume2 size={16} />
                    <span>Testar Sirene & Voz Agora</span>
                  </button>

                  <button
                    onClick={() => handleTestClosedAppAlarm(10)}
                    disabled={testingClosedAlarm}
                    className="bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 font-black text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                  >
                    <Clock size={16} />
                    <span>
                      {closedAlarmCountdown > 0
                        ? `Disparando em ${closedAlarmCountdown}s (Feche o App!)`
                        : 'Testar com App Fechado (10s)'}
                    </span>
                  </button>
                </div>
              </div>

              {/* PASSO 3: HORÁRIOS EXATOS DOS CHECKLISTS DO SETOR */}
              <div className="bg-[#111b21] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 block">
                      3. Horários Exatos de Despertar ({totemSectorId === 'ALL' ? 'Todos os Setores' : `Setor: ${totemSectorName}`})
                    </span>
                    <h4 className="text-sm sm:text-base font-bold text-white mt-0.5">
                      Checklists & Tarefas que Acordam este Tablet
                    </h4>
                  </div>
                  <span className="text-[11px] text-[#8696a0]">
                    Fuso Horário Oficial: <strong className="text-white">Brasília (GMT-3)</strong>
                  </span>
                </div>

                {allTenantChecklists.length === 0 ? (
                  <div className="text-center py-6 text-xs text-[#8696a0]">
                    Nenhum checklist ativo cadastrado ainda. Crie um checklist em "Modelos & Rotinas".
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                    {allTenantChecklists.map((chk) => {
                      const matchesCurrentSector = doesChecklistMatchSector(chk, totemSectorId, totemSectorName);
                      const times = chk.schedule_times || (chk.schedule_time ? [chk.schedule_time] : []);
                      const taskCount = chk.items_list?.length || 0;
                      const inputVal = scheduleTimeInputs[chk.id] ?? '08:00';

                      return (
                        <div
                          key={chk.id}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            matchesCurrentSector
                              ? 'bg-[#182229] border-amber-500/30'
                              : 'bg-[#182229]/50 border-white/5 opacity-75'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-white">{chk.title}</span>
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                  matchesCurrentSector
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-white/10 text-[#8696a0]'
                                }`}>
                                  Setor: {chk.sector_name || 'Sem Setor'}
                                </span>
                                <span className="text-[11px] text-[#8696a0]">
                                  • {taskCount} {taskCount === 1 ? 'tarefa' : 'tarefas'}
                                </span>
                              </div>

                              {/* Lista de Horários Programados */}
                              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                                {times.length === 0 ? (
                                  <span className="text-[11px] text-rose-400 font-medium">
                                    ⚠️ Sem horário definido — adicione ao lado para despertar
                                  </span>
                                ) : (
                                  times.map((t) => (
                                    <span
                                      key={t}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-black"
                                    >
                                      <Clock size={12} />
                                      <span>{t}</span>
                                      <button
                                        onClick={() => handleRemoveChecklistScheduleTime(chk.id, t)}
                                        title="Remover horário"
                                        className="hover:text-rose-400 transition-colors cursor-pointer ml-0.5"
                                      >
                                        <X size={12} />
                                      </button>
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>

                            {/* Ações: Vincular ao setor atual + Adicionar Horário Exato */}
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              {!matchesCurrentSector && totemSectorId && totemSectorId !== 'ALL' && (
                                <button
                                  onClick={() => handleLinkChecklistToCurrentSector(chk.id)}
                                  className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition-all cursor-pointer"
                                >
                                  Mover p/ {totemSectorName}
                                </button>
                              )}

                              <div className="flex items-center gap-1.5 bg-[#111b21] p-1 rounded-xl border border-white/10">
                                <input
                                  type="time"
                                  value={inputVal}
                                  onChange={(e) =>
                                    setScheduleTimeInputs(prev => ({ ...prev, [chk.id]: e.target.value }))
                                  }
                                  className="bg-transparent text-white text-xs font-bold px-2 py-1 outline-none"
                                />
                                <button
                                  onClick={() => handleSaveChecklistScheduleTime(chk, inputVal)}
                                  disabled={savingScheduleId === chk.id}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black transition-all cursor-pointer"
                                >
                                  {savingScheduleId === chk.id ? '...' : '+ Horário'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 bg-[#111b21] border-t border-white/10 flex items-center justify-between gap-3 shrink-0">
              <div className="text-[11px] text-[#8696a0] flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${wakeLockActive ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span>
                  {wakeLockActive
                    ? 'Screen WakeLock Ativo (Tela não apaga sozinha na tomada)'
                    : 'Dica: Instale o app na Tela Inicial do Android para máxima prioridade de som'}
                </span>
              </div>
              <button
                onClick={() => setIsSectorAlarmModalOpen(false)}
                className="px-6 py-2.5 rounded-xl bg-[#202c33] hover:bg-[#2a3942] text-white font-bold text-xs border border-white/10 transition-all cursor-pointer"
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL DE ALARME SONORO DE TELA CHEIA (HORÁRIO EXATO + LISTA DE TAREFAS)
         ======================================================================== */}
      {activeAlarmModal && (
        <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="w-full max-w-2xl bg-gradient-to-b from-[#2a1215] via-[#182229] to-[#111b21] border-2 border-amber-500 rounded-3xl shadow-[0_0_80px_rgba(245,158,11,0.45)] overflow-hidden flex flex-col max-h-[94vh]">
            {/* Faixa Superior Pulsante */}
            <div className="bg-gradient-to-r from-rose-600 via-amber-500 to-orange-600 px-5 py-3 flex items-center justify-between text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <BellRing size={18} className="animate-bounce" />
                <span>
                  🚨 ALARME DE HORÁRIO EXATO • SETOR: {(activeAlarmModal.sectorName || 'COZINHA').toUpperCase()}
                </span>
              </div>
              <span className="bg-black/25 text-white px-3 py-0.5 rounded-full text-xs font-black">
                ⏰ {activeAlarmModal.scheduleTime}
              </span>
            </div>

            {/* Cabeçalho do Checklist */}
            <div className="p-5 sm:p-6 border-b border-white/10 flex items-start justify-between gap-4">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest mb-2">
                  {activeAlarmModal.checklistCategory || 'Rotina Obrigatória do Setor'}
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                  {activeAlarmModal.checklistTitle}
                </h2>
                <p className="text-xs sm:text-sm text-[#d1d7db] mt-1">
                  Confira abaixo as <strong>{activeAlarmModal.tasks.length} tarefas</strong> programadas para execução agora no setor <strong>{activeAlarmModal.sectorName}</strong>:
                </p>
              </div>

              <button
                onClick={() => {
                  stopSirenSound();
                  setIsAlarmMuted(true);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 border transition-all cursor-pointer shrink-0 ${
                  isAlarmMuted
                    ? 'bg-white/10 text-[#8696a0] border-white/10'
                    : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40 animate-pulse'
                }`}
              >
                {isAlarmMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                <span>{isAlarmMuted ? 'Sirene Silenciada' : 'Silenciar Sirene'}</span>
              </button>
            </div>

            {/* Lista de Tarefas do Checklist */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-2.5 flex-1 bg-[#111b21]/70">
              {activeAlarmModal.tasks.length === 0 ? (
                <div className="p-4 rounded-2xl bg-[#182229] border border-white/10 text-xs text-[#d1d7db]">
                  Toque em <strong>"Iniciar e Executar Tarefas Agora"</strong> abaixo para abrir o checklist completo.
                </div>
              ) : (
                activeAlarmModal.tasks.map((task, idx) => (
                  <div
                    key={task.id || idx}
                    className="p-3.5 rounded-2xl bg-[#182229] border border-white/10 flex items-start gap-3"
                  >
                    <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-white leading-snug">
                          {task.title}
                        </span>
                        {task.is_critical && (
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-black uppercase">
                            Crítico
                          </span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-xs text-[#8696a0] mt-0.5">{task.description}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Botões de Ação Principal */}
            <div className="p-5 sm:p-6 bg-[#182229] border-t border-white/10 flex flex-col sm:flex-row gap-3 shrink-0">
              <button
                onClick={() => {
                  const targetId = activeAlarmModal.checklistId;
                  stopSirenSound();
                  setActiveAlarmModal(null);

                  const foundChk =
                    checklists.find(c => c.id === targetId) ||
                    allTenantChecklists.find(c => c.id === targetId);

                  if (loggedInUser && foundChk) {
                    handleStartChecklist(foundChk);
                  } else if (targetId) {
                    setPendingAlarmChecklistId(targetId);
                    showToast('success', '🔐 Selecione seu operador e digite o PIN para iniciar as tarefas agora!');
                  }
                }}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-sm sm:text-base py-4 px-6 rounded-2xl flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-500/30 transition-all cursor-pointer active:scale-95"
              >
                <CheckCircle2 size={22} className="stroke-[2.5]" />
                <span>🚀 INICIAR E EXECUTAR TAREFAS AGORA</span>
              </button>

              <button
                onClick={() => {
                  const currentModal = activeAlarmModal;
                  stopSirenSound();
                  setActiveAlarmModal(null);
                  snoozedLocalAlarmsRef.current.push({
                    triggerAtMs: Date.now() + 5 * 60 * 1000,
                    payload: currentModal
                  });
                  if (apiBaseUrl && tenantId) {
                    fetch(`${apiBaseUrl}/api/v1/push/checklist-alarm-snooze`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
                      body: JSON.stringify({
                        tenantId,
                        checklistId: currentModal.checklistId,
                        sectorId: currentModal.sectorId,
                        sectorName: currentModal.sectorName,
                        snoozeMinutes: 5
                      })
                    }).catch(() => {});
                  }
                  showToast('success', '⏰ Alarme adiado! O tablet tocará novamente em 5 minutos.');
                }}
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-black text-xs sm:text-sm py-4 px-5 rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
              >
                <Clock size={18} />
                <span>Adiar 5 min</span>
              </button>

              <button
                onClick={() => {
                  stopSirenSound();
                  setActiveAlarmModal(null);
                }}
                className="bg-[#202c33] hover:bg-[#2a3942] text-[#8696a0] hover:text-white font-bold text-xs sm:text-sm py-4 px-4 rounded-2xl border border-white/10 transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
