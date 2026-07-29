import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { 
  KeyRound, 
  User, 
  Clock, 
  MapPin, 
  Camera, 
  CheckCircle2, 
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
  Award
} from 'lucide-react';
import { Reorder } from 'framer-motion';

interface OperatorProfile {
  id: string;
  name: string;
  pin: string;
  role: string;
  is_active: boolean;
}

interface ChecklistToExecute {
  id: string;
  title: string;
  description: string;
  category: string;
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
  schedule_id?: string;
  responsible_ids?: string[];
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
  const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');

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

  useEffect(() => {
    if (tenantId) {
      loadOperators();
    }
  }, [tenantId]);

  useEffect(() => {
    if (activeChecklist && activeChecklist.id && itemsToAnswer.length === 0) {
      handleStartChecklist(activeChecklist);
    }
  }, [activeChecklist?.id]);

  useEffect(() => {
    // Injeta canvas-confetti via CDN de forma segura
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
      const { data: opsData, error: opsErr } = await supabase
        .from('v_checklist_operators')
        .select('id, name, pin, role, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);
      
      if (opsErr) throw opsErr;
      
      const allOps = opsData || [];
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

  const validatePin = (pin: string) => {
    if (selectedOperator && selectedOperator.pin === pin) {
      setLoggedInUser(selectedOperator);
      setSelectedOperator(null);
      setPinCode('');
      
      setActiveTab('active');
      setActiveExecution(null);
      setActiveChecklist(null);

      loadOperatorChecklists(selectedOperator.id, selectedOperator.role, selectedOperator.name);
      loadCompletedExecutions(selectedOperator.id);
      showToast('success', `Bem-vindo à cozinha, ${selectedOperator.name}!`);
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
  const loadOperatorChecklists = async (userId: string, userRole: string, userName?: string) => {
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

        if (allowedUnits.length === 0) {
          setChecklists([]);
          return;
        }
      }

      const { data: checklistsData, error } = await supabase
        .from('checklists')
        .select(`
          id, title, description, category, sector_id, weight, use_unit_schedule_rules,
          min_time_lead_minutes, max_time_lag_minutes, responsible_ids,
          sectors(id, name, unit_id, units(id, name, latitude, longitude, radius_meters, require_geolocation))
        `)
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (error) throw error;

      const list: ChecklistToExecute[] = (checklistsData || [])
        .map((chk: any) => {
          const sector = chk.sectors;
          const unit = sector?.units;
          
          return {
            id: chk.id,
            title: chk.title,
            description: chk.description,
            category: chk.category,
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
            responsible_ids: chk.responsible_ids || []
          };
        })
        .filter(c => {
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
                
              hasNameMatch = responsibleNames.includes(cleanUserName);
            }
            
            isResponsible = hasDirectId || hasNameMatch;
            hasDirectAssignment = isResponsible;
          }
          
          if (!isResponsible) return false;

          if (isPowerUser) return true;

          if (hasDirectAssignment) {
            return allowedUnits.includes(c.unit_id);
          }
          
          return allowedUnits.includes(c.unit_id) && (allowedSectors.length === 0 || allowedSectors.includes(c.sector_id));
        });

      setChecklists(list);
    } catch (e) {
      console.error(e);
      showToast('error', 'Falha ao buscar checklists do operador.');
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
    setStartedAt(new Date().toISOString());
    setResponses({});
    setCheckedSubtasks({});
    setSearchQuery('');
    setCategoryFilter('');

    // Busca itens do checklist
    try {
      const { data: items, error } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('checklist_id', chk.id)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setItemsToAnswer(items || []);

      // Inicia geolocalização se exigido
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

      return {
        ...prev,
        [itemId]: updated
      };
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

      // Cria a execução no banco
      const { data: execData, error: execErr } = await supabase
        .from('checklist_executions')
        .insert({
          tenant_id: tenantId,
          checklist_id: activeChecklist.id,
          user_id: loggedInUser.id,
          unit_id: activeChecklist.unit_id,
          started_at: startedAt,
          completed_at: now.toISOString(),
          duration_seconds: durationSeconds,
          status: 'completed_on_time',
          score,
          distance_calculated: distanceFromUnit
        })
        .select('id')
        .single();

      if (execErr) throw execErr;
      const executionId = execData.id;

      // Grava respostas dos itens
      const insertResponses = itemsToAnswer.map(item => {
        const r = responses[item.id] || { itemId: item.id, value: '', isConforming: true, isMetaOk: true, isDone: false };
        return {
          execution_id: executionId,
          item_id: item.id,
          response_value: r.value,
          is_conforming: r.isConforming,
          is_meta_ok: r.isMetaOk,
          is_done: r.isDone,
          observation: r.observation || null
        };
      });

      const { data: savedResponses, error: respErr } = await supabase
        .from('checklist_item_responses')
        .insert(insertResponses)
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
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] text-[#d1d7db] overflow-hidden relative styled-scrollbar">
      
      {/* TOAST DE NOTIFICAÇÃO */}
      {toastMsg && (
        <div className={`fixed top-5 right-5 z-[999] px-4 py-3 rounded-2xl border text-xs font-bold shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-3 duration-300 ${
          toastMsg.type === 'success' 
            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 backdrop-blur-md' 
            : 'bg-rose-500/20 text-rose-300 border-rose-500/40 backdrop-blur-md'
        }`}>
          {toastMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{toastMsg.msg}</span>
        </div>
      )}

      {/* MODAL DE SUCESSO GAMIFICADO (CONFETTI & SCORE) */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#182229] border border-white/10 rounded-[36px] p-8 max-w-md w-full text-center relative shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-3xl mx-auto flex items-center justify-center text-black font-black text-3xl shadow-xl shadow-emerald-500/20 mb-4 animate-bounce">
              🌟
            </div>
            
            <h2 className="text-2xl font-black text-white tracking-tight">Rotina Concluída com Sucesso!</h2>
            <p className="text-xs text-[#8696a0] mt-1">Sua auditoria foi salva e registrada no servidor.</p>

            <div className="my-6 p-4 rounded-2xl bg-[#111b21] border border-white/5 flex items-center justify-around font-mono">
              <div>
                <span className="text-[10px] text-[#8696a0] uppercase font-bold block">Pontuação</span>
                <span className="text-2xl font-black text-emerald-400">{successScore}%</span>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div>
                <span className="text-[10px] text-[#8696a0] uppercase font-bold block">Status</span>
                <span className="text-xs font-bold text-white uppercase bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md mt-1 inline-block">Conforme</span>
              </div>
            </div>

            <button
              onClick={() => setShowSuccessModal(false)}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm py-3.5 rounded-2xl transition-all shadow-lg shadow-emerald-500/25 cursor-pointer active:scale-95"
            >
              Continuar Trabalhando 🚀
            </button>
          </div>
        </div>
      )}

      {/* TELA DE AUTENTICAÇÃO POR PIN (TOTEM BLOQUEADO) */}
      {!loggedInUser && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 bg-[#0b141a] relative overflow-hidden">
          {/* Luzes de fundo decorativas */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-4xl w-full flex flex-col md:flex-row items-center gap-8 bg-[#182229]/80 backdrop-blur-xl border border-white/10 p-6 sm:p-10 rounded-[40px] shadow-2xl relative z-10">
            
            {/* Lista de Operadores da Equipe */}
            <div className="flex-1 w-full space-y-4">
              <div>
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-widest">
                  <User size={16} /> Totem Operacional PWA
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">Quem está operando?</h1>
                <p className="text-xs text-[#8696a0] mt-1">Selecione seu nome na lista para autenticar no turno.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-h-[320px] overflow-y-auto styled-scrollbar pr-1">
                {operators.map((op) => (
                  <button
                    key={op.id}
                    onClick={() => handleSelectOperator(op)}
                    className={`p-3.5 rounded-2xl border text-left transition-all flex items-center gap-3 cursor-pointer ${
                      selectedOperator?.id === op.id 
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10' 
                        : 'bg-[#202c33]/60 hover:bg-[#202c33] border-white/5 text-[#d1d7db]'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-md">
                      {op.name.substring(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-xs text-white truncate">{op.name}</h4>
                      <p className="text-[10px] text-[#8696a0] capitalize">{op.role === 'manager' ? 'Gerente' : 'Operador'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Teclado Numérico de PIN de 5 Dígitos */}
            <div className="w-full md:w-72 shrink-0 bg-[#111b21] border border-white/10 p-6 rounded-[32px] flex flex-col items-center justify-center shadow-xl">
              {selectedOperator ? (
                <>
                  <div className="text-center mb-4">
                    <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Digitar PIN</span>
                    <h3 className="text-sm font-bold text-white truncate max-w-[200px]">{selectedOperator.name}</h3>
                  </div>

                  {/* Visor de Dígitos do PIN */}
                  <div className="flex gap-2 mb-5">
                    {[0, 1, 2, 3, 4].map((idx) => (
                      <div 
                        key={idx} 
                        className={`w-8 h-10 rounded-xl border flex items-center justify-center font-mono font-bold text-lg transition-all ${
                          pinCode.length > idx 
                            ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-sm shadow-indigo-500/20' 
                            : 'bg-[#202c33] border-white/5 text-slate-600'
                        }`}
                      >
                        {pinCode.length > idx ? '•' : ''}
                      </div>
                    ))}
                  </div>

                  {authError && (
                    <p className="text-[10px] text-rose-400 font-bold mb-3 animate-shake">{authError}</p>
                  )}

                  {/* Teclado 3x4 */}
                  <div className="grid grid-cols-3 gap-2 w-full max-w-[220px]">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                      <button
                        key={num}
                        onClick={() => handleKeyPress(num)}
                        className="h-12 rounded-xl bg-[#202c33] hover:bg-[#2a3942] active:scale-95 text-white font-black text-lg border border-white/5 transition-all shadow-sm cursor-pointer"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      onClick={() => setSelectedOperator(null)}
                      className="h-12 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] font-bold uppercase transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleKeyPress('0')}
                      className="h-12 rounded-xl bg-[#202c33] hover:bg-[#2a3942] active:scale-95 text-white font-black text-lg border border-white/5 transition-all shadow-sm cursor-pointer"
                    >
                      0
                    </button>
                    <button
                      onClick={handleDeletePress}
                      className="h-12 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
                    >
                      ⌫
                    </button>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-[#8696a0]">
                  <Lock size={32} className="mx-auto text-[#202c33] mb-2" />
                  <p className="text-xs">Selecione seu perfil à esquerda para inserir o PIN.</p>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* PAINEL OPERACIONAL APÓS LOGIN POR PIN */}
      {loggedInUser && (
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Header Superior do Totem */}
          <div className="h-16 bg-[#202c33]/80 backdrop-blur-xl border-b border-white/10 px-6 flex items-center justify-between shrink-0 shadow-md relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 border border-white/20 flex items-center justify-center text-white font-black text-sm shadow-md">
                {loggedInUser.name.substring(0, 1).toUpperCase()}
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#8696a0] block">Operador Conectado</span>
                <h1 className="text-sm font-black text-white flex items-center gap-1.5">
                  {loggedInUser.name}
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block ml-1" />
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleLogout}
                className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Lock size={13} /> Bloquear Tela
              </button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            
            {/* LISTAGEM DE CHECKLISTS DISPONÍVEIS (SEÇÃO ESQUERDA) */}
            <div className={`w-full md:w-[340px] ${(activeChecklist || activeExecution) ? 'hidden md:flex' : 'flex'} shrink-0 border-r border-white/10 bg-[#182229]/60 flex-col overflow-y-auto p-4 styled-scrollbar gap-3`}>
              
              {/* Abas Premium de Navegação */}
              <div className="flex gap-2 p-1 bg-[#111b21] rounded-2xl border border-white/10 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('active');
                    setActiveExecution(null);
                  }}
                  className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                    activeTab === 'active' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-[#8696a0] hover:text-white bg-transparent'
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
                  className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                    activeTab === 'history' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'text-[#8696a0] hover:text-white bg-transparent'
                  }`}
                >
                  Concluídos ({completedExecutions.length})
                </button>
              </div>

              {activeTab === 'active' ? (
                <>
                  <h3 className="text-[10px] font-black text-[#8696a0] uppercase tracking-widest px-2 mt-2">Rotinas do seu Turno</h3>
                  
                  {loadingChecklists ? (
                    <div className="p-8 text-center text-[#8696a0] animate-pulse text-xs">Carregando rotinas...</div>
                  ) : checklists.length === 0 ? (
                    <div className="p-8 text-center text-[#8696a0] italic text-xs bg-[#202c33]/30 rounded-2xl border border-dashed border-white/5">
                      Nenhum checklist disponível no momento.
                    </div>
                  ) : (
                    checklists.map((chk) => (
                      <button
                        key={chk.id}
                        type="button"
                        onClick={() => {
                          handleStartChecklist(chk);
                          setActiveExecution(null);
                        }}
                        disabled={submitting}
                        className={`p-4 rounded-3xl border text-left transition-all relative flex flex-col justify-between min-h-[110px] cursor-pointer group ${
                          activeChecklist?.id === chk.id 
                            ? 'border-indigo-500 bg-indigo-500/15 shadow-lg shadow-indigo-500/10' 
                            : 'border-white/5 bg-[#202c33]/60 hover:bg-[#202c33] hover:border-white/10'
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-start gap-1">
                            <span className="text-[9px] px-2.5 py-0.5 rounded-full font-bold bg-indigo-500/20 text-indigo-300 shrink-0 border border-indigo-500/30 uppercase tracking-wider">
                              {chk.category || 'Geral'}
                            </span>
                            <span className="text-[9px] text-[#8696a0] font-medium truncate">{chk.unit_name}</span>
                          </div>
                          <h4 className="font-bold text-white text-sm mt-2.5 leading-snug line-clamp-1 group-hover:text-indigo-300 transition-colors">
                            {chk.title}
                          </h4>
                        </div>

                        <div className="flex items-center justify-between mt-3 text-[10px] text-[#8696a0] pt-2.5 border-t border-white/5 w-full">
                          <span className="flex items-center gap-1 font-semibold text-slate-300">
                            <Compass size={12} className="text-indigo-400 shrink-0" /> {chk.sector_name}
                          </span>
                          <ChevronRight size={14} className="text-[#8696a0] group-hover:translate-x-1 transition-transform" />
                        </div>
                      </button>
                    ))
                  )}
                </>
              ) : (
                <>
                  <h3 className="text-[10px] font-black text-[#8696a0] uppercase tracking-widest px-2 mt-2">Histórico Recente</h3>
                  
                  {loadingHistory ? (
                    <div className="p-8 text-center text-[#8696a0] animate-pulse text-xs">Buscando histórico...</div>
                  ) : completedExecutions.length === 0 ? (
                    <div className="p-8 text-center text-[#8696a0] italic text-xs bg-[#202c33]/30 rounded-2xl border border-dashed border-white/5">
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
                      
                      const scoreColor = exec.score >= 90 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' :
                                         exec.score >= 70 ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
                                         'text-rose-400 border-rose-500/30 bg-rose-500/10';

                      return (
                        <button
                          key={exec.id}
                          type="button"
                          onClick={() => {
                            setActiveExecution(exec);
                            setActiveChecklist(null);
                            loadExecutionDetails(exec.id);
                          }}
                          className={`p-4 rounded-3xl border text-left transition-all relative flex flex-col justify-between min-h-[110px] cursor-pointer ${
                            activeExecution?.id === exec.id ? 'border-indigo-500 bg-indigo-500/15' : 'border-white/5 bg-[#202c33]/60 hover:bg-[#202c33]'
                          }`}
                        >
                          <div>
                            <div className="flex justify-between items-start gap-1 flex-wrap">
                              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-slate-500/20 text-[#8696a0] shrink-0 uppercase tracking-wider">
                                {chkInfo.category || 'Geral'}
                              </span>
                              <span className={`text-[9px] px-2 py-0.5 border rounded-full font-bold font-mono ${scoreColor} shrink-0`}>
                                {exec.score}% conformidade
                              </span>
                            </div>
                            <h4 className="font-bold text-white text-sm mt-2.5 leading-snug line-clamp-1">{chkInfo.title}</h4>
                          </div>

                          <div className="flex items-center justify-between mt-3 text-[10px] text-[#8696a0] pt-2.5 border-t border-white/5 w-full font-mono">
                            <span>{formattedDate}</span>
                            <ChevronRight size={14} className="text-slate-400" />
                          </div>
                        </button>
                      );
                    })
                  )}
                </>
              )}
            </div>

            {/* ÁREA DE PREENCHIMENTO OU DETALHES (SEÇÃO DIREITA) */}
            <div className={`flex-1 ${(!activeChecklist && !activeExecution) ? 'hidden md:flex' : 'flex'} flex-col overflow-hidden bg-[#0b141a]`}>
              {activeExecution ? (
                <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-200">
                  {/* Cabeçalho da Execução Concluída */}
                  <div className="p-6 bg-[#182229]/80 backdrop-blur-md border-b border-white/10 shrink-0">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setActiveExecution(null)}
                          className="md:hidden p-2 -ml-2 rounded-full hover:bg-white/10 text-[#8696a0] hover:text-white transition-all shrink-0"
                        >
                          <ChevronRight className="rotate-180" size={20} />
                        </button>
                        <div>
                          <span className="text-[9px] uppercase tracking-wider font-mono text-emerald-400 bg-emerald-500/15 px-3 py-1 rounded-full border border-emerald-500/30 font-bold">Rotina Concluída</span>
                          <h2 className="text-xl font-black text-white mt-1.5">{activeExecution.checklists?.title || 'Rotina Finalizada'}</h2>
                          <p className="text-xs text-[#8696a0] mt-0.5">Visualizando respostas registradas do histórico.</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="px-4 py-2 rounded-2xl border border-white/10 bg-[#111b21] text-left font-mono">
                          <span className="text-[9px] block text-[#8696a0] uppercase tracking-wider font-bold">Duração</span>
                          <span className="text-xs text-white font-bold">
                            {(() => {
                              const sec = activeExecution.duration_seconds || 0;
                              const min = Math.floor(sec / 60);
                              return min > 0 ? `${min}m ${sec % 60}s` : `${sec}s`;
                            })()}
                          </span>
                        </div>
                        <div className={`px-4 py-2 rounded-2xl border flex flex-col justify-center text-left font-mono ${
                          activeExecution.score >= 90 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' :
                          activeExecution.score >= 70 ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
                          'border-rose-500/30 bg-rose-500/10 text-rose-400'
                        }`}>
                          <span className="text-[9px] uppercase tracking-wider font-bold opacity-80">Conformidade</span>
                          <span className="text-xs font-black">{activeExecution.score}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Detalhes das Respostas */}
                  <div className="flex-1 overflow-y-auto styled-scrollbar p-6 space-y-4">
                    {loadingExecutionDetails ? (
                      <div className="p-16 text-center text-[#8696a0] animate-pulse text-xs">Carregando respostas detalhadas...</div>
                    ) : executionResponses.length === 0 ? (
                      <div className="p-16 text-center text-[#8696a0] italic text-xs">Nenhuma resposta registrada para esta rotina.</div>
                    ) : (
                      <div className="space-y-4">
                        {executionResponses.map((resp, idx) => {
                          const item = resp.checklist_items || { title: 'Tarefa Excluída', description: '', response_type: 'boolean' };
                          const match = item.title.match(/^\[(.*?)\]\s*(.*)$/);
                          const groupName = match ? match[1] : null;
                          const cleanTitle = match ? match[2] : item.title;
                          
                          const borderClass = resp.is_done 
                            ? resp.is_conforming && resp.is_meta_ok 
                              ? 'border-emerald-500/30 bg-emerald-500/5' 
                              : 'border-rose-500/30 bg-rose-500/5'
                            : 'border-white/5 bg-[#182229]/60';

                          return (
                            <div 
                              key={resp.id} 
                              className={`p-5 rounded-[28px] border flex flex-col gap-3 transition-all ${borderClass}`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-bold font-mono text-[#8696a0] bg-[#202c33] w-5 h-5 flex items-center justify-center rounded-full shrink-0 border border-white/5">
                                      {idx + 1}
                                    </span>
                                    {groupName && (
                                      <span className="text-[9px] px-2 py-0.5 rounded font-bold tracking-wider uppercase bg-[#202c33] text-indigo-400 border border-indigo-500/30">
                                        {groupName}
                                      </span>
                                    )}
                                    <h4 className="font-bold text-white text-sm leading-snug">{cleanTitle}</h4>
                                  </div>
                                  {item.description && (
                                    <p className="text-xs text-[#8696a0] mt-1 ml-7">{item.description}</p>
                                  )}
                                </div>

                                <div className="shrink-0 flex items-center gap-2 ml-7 sm:ml-0">
                                  <span className={`text-xs px-3.5 py-1.5 rounded-xl font-mono font-black ${
                                    resp.is_conforming && resp.is_meta_ok
                                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                  }`}>
                                    {resp.response_value}
                                  </span>
                                </div>
                              </div>

                              {resp.observation && (
                                <div className="ml-7 bg-[#111b21] border-l-2 border-amber-400 p-3 rounded-r-xl mt-1 text-xs text-[#d1d7db] leading-relaxed">
                                  <span className="font-bold block text-amber-400 text-[10px] uppercase mb-0.5 font-mono">Observação registrada:</span>
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
                  
                  {/* Cabeçalho do Roteiro */}
                  <div className="p-6 bg-[#182229]/80 backdrop-blur-md border-b border-white/10 shrink-0">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setActiveChecklist(null)}
                          className="md:hidden p-2 -ml-2 rounded-full hover:bg-white/10 text-[#8696a0] hover:text-white transition-all shrink-0"
                        >
                          <ChevronRight className="rotate-180" size={20} />
                        </button>
                        <div>
                          <span className="text-[10px] uppercase tracking-widest font-bold text-indigo-400 bg-indigo-500/15 px-3 py-0.5 rounded-full border border-indigo-500/30">
                            {activeChecklist.category}
                          </span>
                          <h2 className="text-xl font-black text-white mt-1.5 tracking-tight">{activeChecklist.title}</h2>
                          <p className="text-xs text-[#8696a0] mt-0.5">{activeChecklist.description || 'Siga as orientações abaixo para preencher.'}</p>
                        </div>
                      </div>
                      
                      {/* Geolocalização e Status do GPS */}
                      {activeChecklist.require_geolocation && (
                        <div className={`px-4 py-2 rounded-2xl border flex items-center gap-2 shrink-0 ${
                          distanceFromUnit === null ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
                          distanceFromUnit <= activeChecklist.unit_radius_meters ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' :
                          'border-rose-500/30 bg-rose-500/10 text-rose-400'
                        }`}>
                          <Compass size={15} className={locating ? 'animate-spin text-indigo-400' : ''} />
                          <div className="text-left">
                            <span className="text-[9px] block uppercase font-bold tracking-wider opacity-80">Precisão GPS</span>
                            <span className="text-[11px] font-bold">
                              {locating ? 'Coletando...' :
                               distanceFromUnit === null ? 'Aguardando GPS' :
                               distanceFromUnit <= activeChecklist.unit_radius_meters ? `Dentro da área (${Math.round(distanceFromUnit)}m)` :
                               `Fora da área (${Math.round(distanceFromUnit)}m - Limite ${activeChecklist.unit_radius_meters}m)`
                              }
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Progresso Dinâmico e Gamificação */}
                    {(() => {
                      const total = itemsToAnswer.length;
                      const completed = itemsToAnswer.filter(item => responses[item.id]?.isDone).length;
                      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                      return (
                        <div className="flex items-center gap-4 bg-[#111b21] p-4 rounded-3xl border border-white/10 mt-4 animate-in fade-in duration-300 shadow-md">
                          {/* Gráfico circular SVG */}
                          <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90">
                              <circle
                                cx="24"
                                cy="24"
                                r="20"
                                className="text-[#202c33]"
                                strokeWidth="3.5"
                                stroke="currentColor"
                                fill="transparent"
                              />
                              <circle
                                cx="24"
                                cy="24"
                                r="20"
                                className="text-emerald-400 transition-all duration-500 ease-out"
                                strokeWidth="3.5"
                                strokeDasharray={2 * Math.PI * 20}
                                strokeDashoffset={2 * Math.PI * 20 * (1 - percent / 100)}
                                strokeLinecap="round"
                                stroke="currentColor"
                                fill="transparent"
                              />
                            </svg>
                            <span className="absolute text-[11px] font-black text-white font-mono">{percent}%</span>
                          </div>

                          {/* Progresso Textual e Mensagem de Incentivo */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="font-bold text-[#d1d7db]">Progresso da Rotina</span>
                              <span className="font-mono text-emerald-400 font-bold">{completed} de {total} tarefas concluídas</span>
                            </div>
                            {/* Barra de Progresso Horizontal Neon */}
                            <div className="w-full bg-[#202c33] h-2.5 rounded-full overflow-hidden border border-white/5">
                              <div 
                                className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full rounded-full transition-all duration-500 ease-out shadow-sm shadow-emerald-500/50" 
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            {/* Mensagem Gamificada de Incentivo */}
                            <p className="text-[10px] text-[#8696a0] mt-1.5 italic font-medium truncate">
                              {getGamifiedIncentive(percent, completed, total, loggedInUser?.name)}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Formulário de Perguntas/Itens */}
                  <div className="flex-1 overflow-y-auto styled-scrollbar p-6 space-y-4">
                    
                    {/* Filtros da Lista */}
                    {itemsToAnswer.length > 0 && (
                      <div className="flex flex-col sm:flex-row gap-3 mb-4 bg-[#182229]/60 p-3 rounded-2xl border border-white/5">
                        <div className="flex-1 relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <Search size={15} className="text-[#8696a0]" />
                          </div>
                          <input
                            type="text"
                            placeholder="Buscar item nesta rotina..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#111b21] border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-[#8696a0] focus:outline-none focus:border-indigo-500 transition-all"
                          />
                        </div>
                        
                        <div className="sm:w-56">
                          <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="w-full bg-[#111b21] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-[#d1d7db] focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
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
                      className="space-y-4"
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
                          value={item}
                          className={`p-5 rounded-[28px] border flex flex-col gap-4 transition-all duration-300 ${
                            resp.isDone 
                              ? 'border-emerald-500/40 bg-emerald-500/5 shadow-sm shadow-emerald-500/5' 
                              : item.is_required 
                                ? 'border-white/10 bg-[#182229]/80 hover:border-white/20' 
                                : 'border-white/5 bg-[#182229]/50 hover:border-white/10'
                          }`}
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          {/* Enunciado e Instrução */}
                          <div className="min-w-0 flex-1 space-y-1">
                            {(() => {
                              const match = item.title.match(/^\[(.*?)\]\s*(.*)$/);
                              const groupName = match ? match[1] : null;
                              const cleanTitle = match ? match[2] : item.title;
                              const cleanDescription = item.description ? item.description.replace(/Fornecedor:\s*/g, '').replace(/Custo:\s*/g, '').split(' | ').join(' • ') : null;

                              return (
                                <>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className="cursor-grab hover:text-indigo-400 text-[#8696a0] transition-colors shrink-0 mr-1 active:cursor-grabbing">
                                      <GripVertical size={16} />
                                    </div>
                                    {resp.isDone ? (
                                      <span className="w-5 h-5 flex items-center justify-center rounded-full shrink-0 bg-emerald-400 text-black font-black text-[11px] shadow-sm">
                                        ✓
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-bold font-mono text-[#8696a0] bg-[#202c33] border border-white/5 w-5 h-5 flex items-center justify-center rounded-full shrink-0">
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
                                        className={`text-[9px] px-2 py-0.5 rounded font-bold tracking-wider uppercase flex items-center gap-1 transition-all select-none cursor-pointer ${
                                          groupName 
                                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' 
                                            : 'bg-white/5 text-[#8696a0] hover:text-white border border-white/10'
                                        }`}
                                        title="Trocar categoria"
                                      >
                                        <span>{groupName || '+ CAT'}</span>
                                        <ChevronDown size={10} className="opacity-60" />
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
                                            className="absolute left-0 mt-1.5 w-48 bg-[#202c33] border border-white/10 rounded-2xl p-2.5 z-50 shadow-2xl animate-in fade-in slide-in-from-top-1 text-left"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <span className="text-[8px] font-black text-[#8696a0] block uppercase tracking-wider mb-1.5 px-1.5">Mudar Categoria</span>
                                            
                                            <div className="max-h-32 overflow-y-auto space-y-0.5 mb-2 styled-scrollbar px-0.5">
                                              <button
                                                type="button"
                                                onClick={() => handleUpdateItemCategory(item.id, item.title, '')}
                                                className="w-full text-left text-[11px] text-[#d1d7db] hover:bg-[#111b21] hover:text-white px-2 py-1.5 rounded-lg transition-colors flex items-center justify-between"
                                              >
                                                <span>(Sem Categoria)</span>
                                                {!groupName && <span className="text-[10px] text-indigo-400">✓</span>}
                                              </button>
                                              
                                              {Array.from(new Set(itemsToAnswer.map(i => {
                                                const m = i.title.match(/^\[(.*?)\]\s*(.*)$/);
                                                return m ? m[1] : null;
                                              }).filter(Boolean))).map(cat => (
                                                <button
                                                  key={cat as string}
                                                  type="button"
                                                  onClick={() => handleUpdateItemCategory(item.id, item.title, cat as string)}
                                                  className="w-full text-left text-[11px] text-[#d1d7db] hover:bg-[#111b21] hover:text-white px-2 py-1.5 rounded-lg transition-colors flex items-center justify-between"
                                                >
                                                  <span className="truncate">{cat}</span>
                                                  {groupName === cat && <span className="text-[10px] text-indigo-400">✓</span>}
                                                </button>
                                              ))}
                                            </div>

                                            <div className="pt-2 border-t border-white/10 px-1">
                                              <div className="flex gap-1.5">
                                                <input
                                                  type="text"
                                                  value={newInlineCategoryName}
                                                  onChange={e => setNewInlineCategoryName(e.target.value.toUpperCase())}
                                                  placeholder="NOVA CATEGORIA"
                                                  className="flex-1 bg-[#111b21] border border-white/10 rounded-lg px-2 py-1 text-[9px] text-white focus:outline-none focus:border-indigo-500 placeholder-[#8696a0]/40"
                                                />
                                                <button
                                                  type="button"
                                                  disabled={!newInlineCategoryName.trim()}
                                                  onClick={() => handleUpdateItemCategory(item.id, item.title, newInlineCategoryName.trim())}
                                                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-[9px] px-2 py-1 rounded-lg transition-all"
                                                >
                                                  OK
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>

                                    <h4 className={`font-bold text-sm sm:text-base leading-snug transition-all ${resp.isDone ? 'text-emerald-300 line-through opacity-80' : 'text-white'}`}>{cleanTitle}</h4>
                                    
                                    {resp.isDone && (
                                      <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full shrink-0">
                                        Concluído ✅
                                      </span>
                                    )}
                                    {item.is_required && !resp.isDone && (
                                      <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider shrink-0">* OBRIGATÓRIO</span>
                                    )}
                                    {item.is_critical && !resp.isDone && (
                                      <span className="text-[9px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-full shrink-0">
                                        CRÍTICO
                                      </span>
                                    )}
                                  </div>
                                  
                                  {cleanDescription && (
                                    <p className="text-xs sm:text-sm text-[#d1d7db] bg-[#111b21]/60 border-l-2 border-indigo-500 pl-3 py-2 rounded-r-xl mt-2 leading-relaxed ml-7 font-normal">
                                      {cleanDescription}
                                    </p>
                                  )}

                                  {/* Metas Numéricas */}
                                  {(item.response_type === 'numeric' || item.response_type === 'temperature' || item.response_type === 'kg') && (item.min_meta !== null || item.max_meta !== null) && (
                                    <p className="text-[11px] text-teal-400 pl-7 font-mono font-bold mt-1">
                                      {item.min_meta !== null ? `Mín: ${item.min_meta}` : ''} {item.max_meta !== null ? `Máx: ${item.max_meta}` : ''} {item.measurement_unit || (item.response_type === 'kg' ? 'kg' : '')}
                                    </p>
                                  )}

                                  {/* Dica operacional ou cálculo em tempo real */}
                                  {(() => {
                                    const helperMsg = getHelperMessage(item, responses);
                                    if (!helperMsg) return null;
                                    return (
                                      <p className="text-[11px] text-indigo-400 pl-7 font-semibold mt-1 flex items-center gap-1.5 flex-wrap">
                                        <span>{helperMsg.text}</span>
                                        {helperMsg.type === 'stock_suggestion' && !resp.value && (
                                          <button
                                            type="button"
                                            onClick={() => handleAnswerChange(item.id, item.response_type, helperMsg.value!, item.min_meta, item.max_meta)}
                                            className="text-[9px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 rounded-lg transition-all active:scale-95 cursor-pointer ml-1 select-none shadow-sm"
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

                            {/* Lista de Verificação (Sub-tarefas) */}
                            {item.options && item.options.length > 0 && (
                              <div className="mt-2 pl-7 space-y-1.5">
                                <span className="text-[9px] font-black text-indigo-400/90 block uppercase tracking-widest">ITENS A VERIFICAR:</span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {item.options.map((sub: string, sIdx: number) => {
                                    const subtaskKey = `${item.id}_${sIdx}`;
                                    const isChecked = checkedSubtasks[subtaskKey] || false;
                                    return (
                                      <label 
                                        key={sIdx} 
                                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none text-[11px] font-medium ${
                                          isChecked 
                                            ? 'bg-indigo-500/15 border-indigo-500/40 text-white shadow-sm' 
                                            : 'bg-[#111b21]/70 border-white/5 text-[#d1d7db] hover:bg-[#111b21]'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            setCheckedSubtasks(prev => ({
                                              ...prev,
                                              [subtaskKey]: e.target.checked
                                            }));
                                          }}
                                          className="rounded-md border-white/20 text-indigo-500 bg-[#202c33] focus:ring-indigo-500/30 focus:ring-offset-0 w-4 h-4 cursor-pointer"
                                        />
                                        <span className="truncate">{sub}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Campo de Upload de Foto de Evidência se exigido */}
                            {item.require_evidence && (
                              <div className="pt-2 pl-7 flex items-center gap-2 flex-wrap">
                                <label className={`px-3.5 py-2 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                                  resp.evidenceUrl ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20'
                                }`}>
                                  <Camera size={14} />
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
                                  <a href={resp.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#8696a0] hover:text-white underline truncate max-w-[160px]">
                                    Ver Foto Anexada
                                  </a>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Seleção de Respostas Touch-First (Pílulas Vibrantes) */}
                          <div className="shrink-0 flex items-center gap-3">
                            
                            {/* BOOLEAN */}
                            {item.response_type === 'boolean' && (
                              <div className="flex gap-1.5 bg-[#111b21] p-1.5 rounded-2xl border border-white/10 shadow-inner">
                                {['Feito', 'Não Feito'].map(opt => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => handleAnswerChange(item.id, item.response_type, opt, item.min_meta, item.max_meta)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer select-none ${
                                      resp.value === opt
                                        ? opt === 'Feito' 
                                          ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-600/30 scale-[1.02]' 
                                          : 'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-lg shadow-rose-600/30 scale-[1.02]'
                                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* CONFORMIDADE */}
                            {item.response_type === 'conformity' && (
                              <div className="flex gap-1.5 bg-[#111b21] p-1.5 rounded-2xl border border-white/10 shadow-inner">
                                {['Conforme', 'Não Conforme'].map(opt => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => handleAnswerChange(item.id, item.response_type, opt, item.min_meta, item.max_meta)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer select-none ${
                                      resp.value === opt
                                        ? opt === 'Conforme' 
                                          ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-600/30 scale-[1.02]' 
                                          : 'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-lg shadow-rose-600/30 scale-[1.02]'
                                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* YES_NO */}
                            {item.response_type === 'yes_no' && (
                              <div className="flex gap-1.5 bg-[#111b21] p-1.5 rounded-2xl border border-white/10 shadow-inner">
                                {['Sim', 'Não'].map(opt => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => handleAnswerChange(item.id, item.response_type, opt, item.min_meta, item.max_meta)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer select-none ${
                                      resp.value === opt
                                        ? opt === 'Sim' 
                                          ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-600/30 scale-[1.02]' 
                                          : 'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-lg shadow-rose-600/30 scale-[1.02]'
                                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* NUMERIC / TEMPERATURE / COUNTER / KG */}
                            {(item.response_type === 'numeric' || item.response_type === 'temperature' || item.response_type === 'counter' || item.response_type === 'kg') && (
                              <div className="flex items-center gap-1.5 bg-[#111b21] p-1.5 rounded-[20px] border border-white/10 shadow-inner">
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
                                  className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center bg-[#202c33] hover:bg-[#2a3942] rounded-2xl text-[#8696a0] hover:text-white text-3xl font-light transition-all active:scale-95 cursor-pointer"
                                >
                                  -
                                </button>
                                
                                <div className="flex items-baseline px-2">
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
                                      className="bg-transparent border-none focus:outline-none focus:ring-0 text-3xl md:text-4xl font-black w-24 md:w-32 text-center text-white p-0 m-0 font-mono tracking-wide"
                                    />
                                  ) : (
                                    <input
                                      type="number"
                                      step="any"
                                      value={resp.value || ''}
                                      onChange={(e) => handleAnswerChange(item.id, item.response_type, e.target.value, item.min_meta, item.max_meta)}
                                      placeholder="0"
                                      className="bg-transparent border-none focus:outline-none focus:ring-0 text-3xl md:text-4xl font-black w-20 md:w-24 text-center text-white p-0 m-0 font-mono"
                                    />
                                  )}
                                  {(item.measurement_unit || item.response_type === 'kg') && (
                                    <span className="text-[11px] font-black text-indigo-400 shrink-0 ml-1.5 uppercase font-mono bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 rounded-lg select-none">
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
                                  className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-2xl text-3xl font-light transition-all active:scale-95 border border-emerald-500/30 cursor-pointer"
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
                                className="bg-[#111b21] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 w-48 sm:w-64"
                              />
                            )}

                            {/* STARS */}
                            {item.response_type === 'stars' && (
                              <div className="flex gap-1.5">
                                {[1, 2, 3, 4, 5].map(starNum => {
                                  const isSelected = parseInt(resp.value) >= starNum;
                                  return (
                                    <button
                                      key={starNum}
                                      type="button"
                                      onClick={() => handleAnswerChange(item.id, item.response_type, starNum.toString(), item.min_meta, item.max_meta)}
                                      className={`p-1.5 hover:scale-125 transition-transform cursor-pointer ${isSelected ? 'text-amber-400' : 'text-[#202c33]'}`}
                                    >
                                      <Star size={20} fill={isSelected ? 'currentColor' : 'transparent'} />
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                           </div>
                          </div>

                          {/* Data e Hora e Operador */}
                          {resp.isDone && resp.answeredAt && resp.answeredBy && (
                            <div className="flex items-center justify-end gap-1.5 pt-2.5 border-t border-white/5 text-[10px] text-[#8696a0] animate-in fade-in slide-in-from-top-1">
                              <CheckCircle2 size={13} className="text-emerald-400" />
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

                  {/* Barra Inferior de Envio */}
                  <div className="h-20 bg-[#182229]/90 backdrop-blur-xl border-t border-white/10 px-6 flex items-center justify-between shrink-0 shadow-2xl relative z-10">
                    <button
                      onClick={() => setActiveChecklist(null)}
                      className="text-xs text-[#8696a0] hover:text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <X size={15} /> Abandonar Roteiro
                    </button>
                    
                    <button
                      onClick={handleSubmitChecklist}
                      disabled={submitting}
                      className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-black text-xs px-7 py-3.5 rounded-2xl flex items-center gap-2.5 transition-all shadow-lg shadow-indigo-600/30 active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? 'Registrando na Base...' : 'Finalizar e Assinar Rotina'}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
                  <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-2 shadow-lg shadow-indigo-500/5 animate-pulse">
                    <Smile size={36} />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-lg tracking-tight">Cozinha Organizada!</h3>
                    <p className="text-xs text-[#8696a0] mt-1 max-w-[280px] mx-auto leading-relaxed">
                      Selecione uma das rotinas ativas ou consulte o histórico de concluídos no painel esquerdo.
                    </p>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
