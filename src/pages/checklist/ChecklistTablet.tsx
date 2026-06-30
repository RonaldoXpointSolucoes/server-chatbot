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
  GripVertical
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

  const loadOperators = async () => {
    try {
      // 1. Carrega todos os operadores ativos do tenant
      const { data: opsData, error: opsErr } = await supabase
        .from('v_checklist_operators')
        .select('id, name, pin, role, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);
      
      if (opsErr) throw opsErr;
      
      // Guarda todos os perfis ativos (com ou sem PIN) para resolução resiliente de nomes
      const allOps = opsData || [];
      setAllProfiles(allOps);

      // 2. Carrega todos os checklists ativos do tenant
      const { data: chksData, error: chksErr } = await supabase
        .from('checklists')
        .select('id, responsible_ids, sector_id, sectors(id, name, unit_id)')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (chksErr) throw chksErr;
      const activeChecklists = chksData || [];

      // Se não houver nenhum checklist ativo no tenant, não exibe ninguém para operar
      if (activeChecklists.length === 0) {
        setOperators([]);
        return;
      }

      // 3. Classifica os checklists (com responsável vs sem responsável)
      const explicitUserIds = new Set<string>();
      const explicitUserNames = new Set<string>();
      const checklistsWithoutResponsibles: any[] = [];

      activeChecklists.forEach((chk: any) => {
        const rIds = chk.responsible_ids || [];
        if (rIds.length > 0) {
          rIds.forEach((id: string) => {
            explicitUserIds.add(id);
            // Busca o nome correspondente na lista completa de operadores para mapeamento por nome resiliente
            const matchedOp = allOps.find(p => p.id === id);
            if (matchedOp) {
              explicitUserNames.add(matchedOp.name.toLowerCase().trim());
            }
          });
        } else {
          checklistsWithoutResponsibles.push(chk);
        }
      });

      // 4. Define os operadores elegíveis para exibição no totem (com PIN ou associados a rotinas ativas)
      const validOperators = allOps.filter(o => {
        const hasPin = o.pin && o.pin.length === 5;
        if (hasPin) return true;

        const opNameClean = o.name.toLowerCase().trim();
        return explicitUserIds.has(o.id) || explicitUserNames.has(opNameClean);
      });

      // 5. Carrega permissões de setores e unidades concorrentemente em background
      const [uPermsRes, sPermsRes] = await Promise.all([
        supabase.from('user_unit_permissions').select('user_id, unit_id'),
        supabase.from('user_sector_permissions').select('user_id, sector_id')
      ]);

      const uPerms = uPermsRes.data || [];
      const sPerms = sPermsRes.data || [];

      // 5. Aplica a filtragem lógica de qualificação na lista
      const qualifiedOperators = validOperators.filter(op => {
        const opNameClean = op.name.toLowerCase().trim();

        // Regra A: Se o operador está vinculado explicitamente como responsável (por ID ou correspondência de Nome)
        if (explicitUserIds.has(op.id) || explicitUserNames.has(opNameClean)) return true;

        const isPowerUser = ['company_admin', 'super_admin', 'manager'].includes(op.role);

        // Regra B: Se for Administrador e houver checklists ativos sem responsável explícito (públicos)
        if (isPowerUser && checklistsWithoutResponsibles.length > 0) return true;

        // Regra C: Se for operador comum e possuir permissões de acesso a checklists sem responsável (públicos)
        const opUnits = uPerms.filter(p => p.user_id === op.id).map(p => p.unit_id);
        const opSectors = sPerms.filter(p => p.user_id === op.id).map(p => p.sector_id);

        const hasAccessToAnyUnassignedChecklist = checklistsWithoutResponsibles.some(chk => {
          const sector = chk.sectors;
          const unitId = sector?.unit_id;
          const sectorId = chk.sector_id;

          const hasUnitAccess = opUnits.includes(unitId);
          const hasSectorAccess = opSectors.length === 0 || opSectors.includes(sectorId);

          return hasUnitAccess && hasSectorAccess;
        });

        return hasAccessToAnyUnassignedChecklist;
      });

      setOperators(qualifiedOperators);
    } catch (e) {
      console.error('Erro ao buscar e filtrar operadores habilitados:', e);
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
      // Login bem sucedido
      setLoggedInUser(selectedOperator);
      setSelectedOperator(null);
      setPinCode('');
      loadOperatorChecklists(selectedOperator.id, selectedOperator.role, selectedOperator.name);
      showToast('success', `Bem-vindo à cozinha, ${selectedOperator.name}!`);
    } else {
      setPinCode('');
      setAuthError('Código PIN inválido. Tente novamente.');
    }
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    setActiveChecklist(null);
    setChecklists([]);
  };

  // ==========================================
  // CARREGAR ROTINAS DO OPERADOR
  // ==========================================
  const loadOperatorChecklists = async (userId: string, userRole: string, userName?: string) => {
    setLoadingChecklists(true);
    try {
      const isPowerUser = ['company_admin', 'super_admin', 'manager'].includes(userRole);

      // 1. Carrega permissões de setores do usuário
      let allowedSectors: string[] = [];
      if (!isPowerUser) {
        const { data: sPerms } = await supabase
          .from('user_sector_permissions')
          .select('sector_id')
          .eq('user_id', userId);
        
        allowedSectors = sPerms?.map(p => p.sector_id) || [];
      }

      // 2. Carrega permissões de unidades do usuário
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

      // 3. Busca checklists ativos nos setores/unidades permitidas
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

      // Mapeia e filtra
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
          // 1. Validação estrita por operador responsável (com suporte resiliente a duplicidades por nome)
          const hasResponsibles = c.responsible_ids && c.responsible_ids.length > 0;
          
          let isResponsible = !hasResponsibles;
          if (hasResponsibles && c.responsible_ids) {
            const hasDirectId = c.responsible_ids.includes(userId);
            
            // Verificação resiliente por nome (em caso de duplicidade de contas no banco)
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
          }
          
          if (!isResponsible) return false;

          // 2. Validação padrão de permissões de unidade e setor
          if (isPowerUser) return true;
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
    const R = 6371e3; // raio da Terra em metros
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // distância em metros
  };

  const captureLocation = (unitLat: number | null, unitLng: number | null) => {
    if (!navigator.geolocation) {
      setGeoError('GPS não suportado neste aparelho.');
      return;
    }

    setLocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const precision = position.coords.accuracy;
        setCurrentCoords({ lat, lng, precision });
        setLocating(false);

        if (unitLat !== null && unitLng !== null) {
          const dist = calculateDistance(lat, lng, unitLat, unitLng);
          setDistanceFromUnit(dist);
        }
      },
      (error) => {
        console.error(error);
        setLocating(false);
        setGeoError('Permissão do GPS negada ou sinal fraco.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // ==========================================
  // EXECUÇÃO DO CHECKLIST
  // ==========================================
  const handleStartChecklist = async (chk: ChecklistToExecute) => {
    setActiveChecklist(chk);
    setStartedAt(new Date().toISOString());
    setResponses({});
    setCheckedSubtasks({});
    setDistanceFromUnit(null);
    setCurrentCoords(null);
    setGeoError('');

    // Coleta localização se necessário
    if (chk.require_geolocation) {
      captureLocation(chk.unit_latitude, chk.unit_longitude);
    }

    try {
      // Carrega perguntas do checklist
      const { data: items } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('checklist_id', chk.id)
        .order('sort_order', { ascending: true });
      
      setItemsToAnswer(items || []);

      // Inicializa objeto de respostas
      const initialResponses: Record<string, ExecutionResponse> = {};
      (items || []).forEach(item => {
        initialResponses[item.id] = {
          itemId: item.id,
          value: '',
          isConforming: true,
          isMetaOk: true,
          isDone: false
        };
      });
      setResponses(initialResponses);
    } catch (e) {
      console.error(e);
      showToast('error', 'Falha ao carregar itens da rotina.');
    }
  };

  // ==========================================
  // RESPOSTAS INDIVIDUAIS
  // ==========================================
  const handleAnswerChange = (itemId: string, itemType: string, val: string, minMeta: number | null, maxMeta: number | null) => {
    setResponses(prev => {
      const current = prev[itemId] || { itemId, value: '', isConforming: true, isMetaOk: true, isDone: false };
      
      let isConforming = true;
      let isMetaOk = true;
      let isDone = val.trim().length > 0;

      // 1. Validação de Conformidade Padrão
      if (itemType === 'conformity' && val === 'Não Conforme') {
        isConforming = false;
      }
      if (itemType === 'yes_no' && val === 'Não') {
        isConforming = false;
      }
      if (itemType === 'boolean' && val === 'Não Feito') {
        isDone = false;
        isConforming = false;
      }

      // 2. Validação de Metas Numéricas / Temperatura
      if ((itemType === 'numeric' || itemType === 'temperature' || itemType === 'kg') && val !== '') {
        const numVal = parseFloat(val);
        if (!isNaN(numVal)) {
          if (minMeta !== null && numVal < minMeta) isMetaOk = false;
          if (maxMeta !== null && numVal > maxMeta) isMetaOk = false;
        }
      }

      return {
        ...prev,
        [itemId]: {
          ...current,
          value: val,
          isConforming,
          isMetaOk,
          isDone,
          answeredAt: isDone ? new Date().toISOString() : undefined,
          answeredBy: isDone && loggedInUser ? loggedInUser.name : undefined
        }
      };
    });
  };
  
  const handleUpdateItemCategory = async (itemId: string, currentFullTitle: string, newCategory: string) => {
    const match = currentFullTitle.match(/^\[(.*?)\]\s*(.*)$/);
    const cleanTitle = match ? match[2] : currentFullTitle;

    const finalNewTitle = newCategory.trim()
      ? `[${newCategory.trim()}] ${cleanTitle}`
      : cleanTitle;

    try {
      const { error } = await supabase
        .from('checklist_items')
        .update({ title: finalNewTitle })
        .eq('id', itemId);

      if (error) throw error;

      setItemsToAnswer(prev => prev.map(item => {
        if (item.id === itemId) {
          return { ...item, title: finalNewTitle };
        }
        return item;
      }));

      showToast('success', 'Categoria atualizada com sucesso!');
      
    } catch (e: any) {
      console.error(e);
      showToast('error', `Falha ao alterar categoria: ${e.message}`);
    } finally {
      setActiveCategoryEditItemId(null);
    }
  };

  // ==========================================
  // UPLOAD DE EVIDÊNCIA DE FOTO AO STORAGE
  // ==========================================
  const handlePhotoUpload = async (itemId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !loggedInUser || !activeChecklist) return;

    // Sinaliza uploading
    setResponses(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], evidenceUploading: true }
    }));

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${tenantId}/${activeChecklist.unit_id}/${itemId}_${Date.now()}.${fileExt}`;
      
      // Upload direto para o bucket do Supabase Storage
      const { data, error } = await supabase.storage
        .from('checklist-evidences')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (error) throw error;

      // Pega a URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('checklist-evidences')
        .getPublicUrl(fileName);

      setResponses(prev => ({
        ...prev,
        [itemId]: { 
          ...prev[itemId], 
          evidenceUrl: publicUrl, 
          evidenceUploading: false,
          isDone: true // Upload de foto obrigatória cumpre a tarefa
        }
      }));

      showToast('success', 'Evidência fotográfica anexada!');
    } catch (e: any) {
      console.error(e);
      setResponses(prev => ({
        ...prev,
        [itemId]: { ...prev[itemId], evidenceUploading: false }
      }));
      showToast('error', 'Falha ao fazer upload da evidência.');
    }
  };

  // ==========================================
  // ENVIO E CONCLUSÃO DO CHECKLIST
  // ==========================================
  const handleSubmitChecklist = async () => {
    if (!loggedInUser || !activeChecklist || !startedAt) return;

    // Valida se todos os obrigatórios foram respondidos
    const missingRequired = itemsToAnswer.some(item => {
      const resp = responses[item.id];
      const isPhotoRequired = item.require_evidence && !resp?.evidenceUrl;
      return item.is_required && (!resp?.isDone || isPhotoRequired);
    });

    if (missingRequired) {
      showToast('error', 'Algumas tarefas obrigatórias ou fotos exigidas não foram concluídas.');
      return;
    }

    // Valida Geolocalização se exigido e geolocalização travada
    if (activeChecklist.require_geolocation && activeChecklist.unit_latitude !== null) {
      if (distanceFromUnit === null) {
        showToast('error', 'Aguardando precisão do sinal de GPS para validar localização.');
        return;
      }
      if (distanceFromUnit > activeChecklist.unit_radius_meters) {
        showToast('error', `Acesso negado: Você está fora do raio operacional permitido da unidade (${Math.round(distanceFromUnit)} metros de distância).`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const durSec = Math.round((new Date(now).getTime() - new Date(startedAt).getTime()) / 1000);

      // 1. Criar Cabeçalho de Execução
      const { data: execData, error: execErr } = await supabase
        .from('checklist_executions')
        .insert({
          tenant_id: tenantId,
          unit_id: activeChecklist.unit_id,
          sector_id: activeChecklist.sector_id,
          checklist_id: activeChecklist.id,
          user_id: loggedInUser.id,
          started_at: startedAt,
          completed_at: now,
          duration_seconds: durSec,
          status: 'completed_on_time', // Simplificado para MVP
          latitude: currentCoords?.lat || null,
          longitude: currentCoords?.lng || null,
          lat_lng_precision: currentCoords?.precision || null,
          distance_calculated: distanceFromUnit || null
        })
        .select()
        .single();

      if (execErr) throw execErr;

      // 2. Inserir todas as Respostas
      const responsesPayloads = itemsToAnswer.map(item => {
        const resp = responses[item.id];
        return {
          tenant_id: tenantId,
          execution_id: execData.id,
          item_id: item.id,
          user_id: loggedInUser.id,
          response_value: resp.value || 'Feito',
          is_conforming: resp.isConforming,
          is_meta_ok: resp.isMetaOk,
          is_done: resp.isDone,
          observation: resp.observation || ''
        };
      });

      const { data: respsInserted, error: respErr } = await supabase
        .from('checklist_item_responses')
        .insert(responsesPayloads)
        .select();

      if (respErr) throw respErr;

      // 3. Vincular Fotos/Evidências
      const evidencesPayloads = itemsToAnswer
        .map(item => {
          const resp = responses[item.id];
          const insertedResponse = respsInserted.find(r => r.item_id === item.id);
          if (resp.evidenceUrl && insertedResponse) {
            return {
              tenant_id: tenantId,
              response_id: insertedResponse.id,
              user_id: loggedInUser.id,
              type: 'photo',
              url: resp.evidenceUrl
            };
          }
          return null;
        })
        .filter(Boolean);

      if (evidencesPayloads.length > 0) {
        await supabase.from('checklist_evidences').insert(evidencesPayloads);
      }

      // 4. Disparar Trigger no banco para recalcular Score e Alertas (Já configurados via DDL).
      // Buscamos o score atualizado calculado pela trigger de banco na tabela
      const { data: finalExec } = await supabase
        .from('checklist_executions')
        .select('score')
        .eq('id', execData.id)
        .single();

      setSuccessScore(finalExec?.score || 100);
      setShowSuccessModal(true);
      
      // Auto-desloga após 5 segundos para o próximo colega usar
      setTimeout(() => {
        setShowSuccessModal(false);
        setSuccessScore(null);
        handleLogout();
      }, 5000);

    } catch (e: any) {
      console.error(e);
      showToast('error', `Erro ao finalizar checklist: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getHelperMessage = (item: any, currentResponses: Record<string, ExecutionResponse>) => {
    if (!item.title) return null;
    const match = item.title.match(/^\[(.*?)\]\s*(.*)$/);
    const groupName = match ? match[1] : null;
    const cleanTitle = (match ? match[2] : item.title).toLowerCase().trim();

    // 1. Caso de Média de Peso (por exemplo, Bifes, Empanados, Retalhos)
    if (groupName) {
      const isWeightItem = cleanTitle.includes('peso');
      const isQtyItem = cleanTitle.includes('quantidade') || cleanTitle.includes('quantas') || cleanTitle.includes('unidade') || cleanTitle.includes('bife') || cleanTitle.includes('pacote') || cleanTitle.includes('sobra') || cleanTitle.includes('pct');

      if (isWeightItem || isQtyItem) {
        // Busca o outro item do mesmo grupo
        const otherItem = itemsToAnswer.find(i => {
          if (i.id === item.id) return false;
          const iMatch = i.title.match(/^\[(.*?)\]\s*(.*)$/);
          const iGroupName = iMatch ? iMatch[1] : null;
          if (iGroupName !== groupName) return false;
          
          const iCleanTitle = (iMatch ? iMatch[2] : i.title).toLowerCase().trim();
          if (isWeightItem) {
            return iCleanTitle.includes('quantidade') || iCleanTitle.includes('quantas') || iCleanTitle.includes('unidade') || iCleanTitle.includes('bife') || iCleanTitle.includes('pacote') || iCleanTitle.includes('sobra') || iCleanTitle.includes('pct');
          } else {
            return iCleanTitle.includes('peso');
          }
        });

        if (otherItem) {
          const weightItem = isWeightItem ? item : otherItem;
          const qtyItem = isQtyItem ? item : otherItem;

          const weightResp = currentResponses[weightItem.id];
          const qtyResp = currentResponses[qtyItem.id];

          const weightVal = parseFloat(weightResp?.value || '');
          const qtyVal = parseFloat(qtyResp?.value || '');

          if (!isNaN(weightVal) && !isNaN(qtyVal) && qtyVal > 0 && weightVal > 0) {
            let media = weightVal / qtyVal;
            let unitLabel = 'un';
            if (weightItem.measurement_unit && weightItem.measurement_unit.toLowerCase() === 'kg') {
              media = media * 1000;
              unitLabel = 'g';
            } else {
              unitLabel = weightItem.measurement_unit || 'g';
            }
            
            // Formatamos a média
            const formattedMedia = media >= 1000 
              ? `${(media / 1000).toFixed(3).replace('.', ',')} kg`
              : `${Math.round(media)} g`;

            return {
              type: 'average',
              text: `💡 Rendimento Médio: ${formattedMedia} / un`
            };
          }
        }
      }
    }

    // 2. Caso de Sugestão de Estoque Restante
    const isRemainingStock = cleanTitle.includes('restou') || cleanTitle.includes('restante') || cleanTitle.includes('ficou');
    if (isRemainingStock) {
      // Busca itens de estoque inicial e retiradas
      const initialItem = itemsToAnswer.find(i => {
        const iMatch = i.title.match(/^\[(.*?)\]\s*(.*)$/);
        const iCleanTitle = (iMatch ? iMatch[2] : i.title).toLowerCase().trim();
        return iCleanTitle.includes('inicial') || iCleanTitle.includes('tinham') || iCleanTitle.includes('estoque (inicial)');
      });

      const withdrawnItem = itemsToAnswer.find(i => {
        const iMatch = i.title.match(/^\[(.*?)\]\s*(.*)$/);
        const iCleanTitle = (iMatch ? iMatch[2] : i.title).toLowerCase().trim();
        return iCleanTitle.includes('retirada') || iCleanTitle.includes('retirou') || iCleanTitle.includes('tirei');
      });

      if (initialItem && withdrawnItem) {
        const initialResp = currentResponses[initialItem.id];
        const withdrawnResp = currentResponses[withdrawnItem.id];

        const initialVal = parseFloat(initialResp?.value || '');
        const withdrawnVal = parseFloat(withdrawnResp?.value || '');

        if (!isNaN(initialVal) && !isNaN(withdrawnVal)) {
          const suggestedVal = initialVal - withdrawnVal;
          if (suggestedVal >= 0) {
            return {
              type: 'stock_suggestion',
              text: `💡 Sugestão: Restam ${suggestedVal} peças no estoque`,
              value: suggestedVal.toString()
            };
          }
        }
      }
    }

    return null;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#111b21] text-[#d1d7db] overflow-hidden select-none">
      
      {/* Toast de Eventos */}
      {toastMsg && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2 z-50 animate-in fade-in slide-in-from-top-4 duration-300 ${toastMsg.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'} text-white`}>
          {toastMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span className="text-sm font-semibold">{toastMsg.msg}</span>
        </div>
      )}

      {/* MODAL DE SUCESSO VIBRANTE E AUTO-DESLOGUE */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-[#202c33] border border-emerald-500/30 rounded-[40px] p-8 max-w-sm w-full text-center shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="absolute -top-10 -left-10 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl"></div>
            <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl"></div>

            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20 text-emerald-400">
              <Sparkles size={32} className="animate-spin duration-1000" />
            </div>

            <h3 className="font-bold text-white text-lg">Parabéns, {loggedInUser?.name}!</h3>
            <p className="text-xs text-[#8696a0] mt-1">Sua rotina foi arquivada com sucesso.</p>

            <div className="my-6 bg-black/20 p-4 rounded-3xl border border-[#2a3942]/60 inline-block min-w-[140px]">
              <span className="text-[10px] text-[#8696a0] block uppercase font-bold tracking-wider">Score da Rotina</span>
              <span className="text-4xl font-black text-emerald-400 tracking-tight">{successScore !== null ? Math.round(successScore) : 100}</span>
            </div>

            <p className="text-[10px] text-[#8696a0]">
              Retornando à tela de bloqueio em <span className="text-white font-bold animate-pulse">5 segundos</span> para o próximo operador...
            </p>
          </div>
        </div>
      )}

      {/* TELA DE LOGIN / BLOQUEIO POR PIN */}
      {!loggedInUser && (
        <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-[#0f171c] to-[#060a0d] p-6 relative overflow-hidden select-none">
          {/* Fundo dinâmico decorativo com degradê suave e blur */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px] pointer-events-none"></div>

          {/* Logo e Cabeçalho no Fluxo Normal (Garante que nunca sobreponha!) */}
          <div className="flex flex-col items-center gap-2 mb-10 text-center animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="w-12 h-12 rounded-[22px] bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 border border-white/10">
              <ClipboardList className="text-white" size={24} />
            </div>
            <div>
              <span className="text-xs font-black text-indigo-400 uppercase tracking-[0.25em] mt-3 block">Checklist Operacional</span>
              <span className="text-[11px] text-[#8696a0] font-medium mt-0.5 block">Totem Compartilhado da Cozinha</span>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-stretch gap-8 max-w-4xl w-full z-10 animate-in fade-in zoom-in-95 duration-500">
            {/* Seleção do Colaborador (Esquerda) */}
            <div className="flex-1 w-full max-h-[380px] overflow-y-auto styled-scrollbar bg-[#1c2830]/60 backdrop-blur-xl rounded-[40px] border border-[#2a3942]/50 p-7 space-y-4 shadow-2xl flex flex-col">
              <div className="flex items-center justify-between pb-2 border-b border-[#2a3942]/40 shrink-0">
                <h3 className="text-xs font-bold text-[#d1d7db] uppercase tracking-wider">Quem está operando agora?</h3>
                <span className="text-[10px] text-indigo-400 font-semibold bg-indigo-500/10 px-2 py-0.5 rounded-full">Equipe</span>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-1 space-y-2 styled-scrollbar">
                {operators.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                    <User size={28} className="text-[#3b4a54] animate-pulse" />
                    <p className="text-xs text-[#8696a0] italic max-w-[200px] leading-relaxed">
                      Nenhum operador com PIN de 5 dígitos cadastrado nas configurações do painel.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {operators.map((op) => (
                      <button
                        key={op.id}
                        onClick={() => handleSelectOperator(op)}
                        className={`p-4 rounded-3xl border text-left flex items-center gap-3 transition-all duration-300 relative overflow-hidden group ${
                          selectedOperator?.id === op.id 
                            ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/5' 
                            : 'border-[#2a3942]/40 bg-[#202c33]/40 hover:bg-[#202c33]/80 hover:border-[#3b4a54]'
                        }`}
                      >
                        {/* Indicador Ativo */}
                        {selectedOperator?.id === op.id && (
                          <div className="absolute right-3 top-3 w-2 h-2 rounded-full bg-indigo-400 animate-ping"></div>
                        )}
                        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-slate-200 font-bold shrink-0 shadow-sm transition-transform group-hover:scale-105">
                          {op.name.substring(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-bold text-white truncate">{op.name}</p>
                            {(!op.pin || op.pin.length !== 5) && (
                              <span className="text-[8px] font-extrabold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-full border border-rose-500/20 shrink-0">Sem PIN</span>
                            )}
                          </div>
                          <p className="text-[9px] text-[#8696a0] font-semibold uppercase tracking-wider mt-0.5">
                            {op.role === 'company_admin' || op.role === 'super_admin' ? 'Administrador' :
                             op.role === 'manager' ? 'Gerente' : 'Operador'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Teclado Numérico de PIN (Direita) */}
            <div className="w-full md:w-[300px] shrink-0 bg-[#1c2830]/60 backdrop-blur-xl rounded-[40px] border border-[#2a3942]/50 p-7 shadow-2xl flex flex-col justify-center min-h-[380px]">
              {selectedOperator ? (
                (!selectedOperator.pin || selectedOperator.pin.length !== 5) ? (
                  <div className="w-full space-y-5 animate-in zoom-in-95 duration-300 flex flex-col items-center text-center">
                    <div className="w-14 h-14 rounded-3xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 text-rose-400 shadow-md">
                      <AlertTriangle size={24} className="animate-bounce" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-white tracking-wide">PIN Não Cadastrado</p>
                      <p className="text-[10px] text-[#8696a0] leading-relaxed max-w-[200px] mx-auto mt-2">
                        O operador <span className="text-white font-bold">{selectedOperator.name}</span> está escalado em rotinas, mas ainda não possui um código PIN de 5 dígitos cadastrado.
                      </p>
                    </div>
                    <div className="bg-black/20 p-4 rounded-3xl border border-[#2a3942]/60 text-[9px] text-[#8696a0] leading-relaxed text-left space-y-1.5 w-full">
                      <p className="text-indigo-400 font-bold">Como cadastrar o PIN:</p>
                      <p>1. Acesse o painel de administração em <span className="text-white font-semibold">Equipes</span>.</p>
                      <p>2. Edite o perfil deste colaborador.</p>
                      <p>3. Defina um código PIN de 5 números e salve.</p>
                    </div>
                    <button
                      onClick={() => handleSelectOperator(selectedOperator)} // Reseta
                      className="w-full py-2.5 rounded-2xl bg-[#202c33] hover:bg-[#2a3942] text-[10px] font-bold border border-[#2a3942]/60 text-slate-300 transition-all cursor-pointer active:scale-95"
                    >
                      Voltar
                    </button>
                  </div>
                ) : (
                  <div className="w-full space-y-5 animate-in zoom-in-95 duration-300 flex flex-col items-center">
                    <div className="text-center">
                      <p className="text-[11px] text-[#8696a0] font-semibold uppercase tracking-wider">Digite o PIN para</p>
                      <p className="text-sm font-black text-white mt-1 tracking-wide">{selectedOperator.name}</p>
                    </div>

                    {/* Visor do PIN */}
                    <div className="flex justify-center gap-3.5 py-1">
                      {[0, 1, 2, 3, 4].map((idx) => (
                        <div 
                          key={idx} 
                          className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 ${
                            pinCode.length > idx 
                              ? 'bg-gradient-to-tr from-indigo-400 to-purple-500 border-indigo-300 scale-125 shadow-md shadow-indigo-500/40' 
                              : 'border-[#3b4a54] bg-black/40 scale-100'
                          }`}
                        ></div>
                      ))}
                    </div>

                    {authError ? (
                      <p className="text-[10px] text-rose-400 text-center font-bold animate-pulse">{authError}</p>
                    ) : (
                      <div className="h-[15px]"></div> /* Placeholder fixo de altura */
                    )}

                    {/* Teclado Ultra-Elegante */}
                    <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px]">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                        <button
                          key={num}
                          onClick={() => handleKeyPress(num)}
                          className="w-16 h-16 rounded-[20px] bg-[#202c33]/60 hover:bg-[#202c33]/90 text-lg font-bold text-white border border-[#2a3942]/60 active:scale-95 active:bg-indigo-500/20 active:border-indigo-500 transition-all duration-150 flex items-center justify-center shadow-sm"
                        >
                          {num}
                        </button>
                      ))}
                      <button
                        onClick={() => handleSelectOperator(selectedOperator)} // Reseta
                        className="w-16 h-16 rounded-[20px] bg-[#202c33]/20 hover:bg-[#202c33]/40 text-[#8696a0] hover:text-white border border-transparent active:scale-95 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider"
                      >
                        Limpar
                      </button>
                      <button
                        onClick={() => handleKeyPress('0')}
                        className="w-16 h-16 rounded-[20px] bg-[#202c33]/60 hover:bg-[#202c33]/90 text-lg font-bold text-white border border-[#2a3942]/60 active:scale-95 flex items-center justify-center shadow-sm"
                      >
                        0
                      </button>
                      <button
                        onClick={handleDeletePress}
                        className="w-16 h-16 rounded-[20px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 active:scale-95 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider"
                      >
                        Apagar
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="text-center p-6 w-full flex flex-col items-center justify-center gap-4">
                  <div className="w-14 h-14 rounded-3xl bg-[#202c33]/40 flex items-center justify-center border border-[#2a3942]/40 text-[#8696a0] shadow-inner">
                    <Lock size={26} className="animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-300">Acesso Restrito</h4>
                    <p className="text-[10px] text-[#8696a0] leading-relaxed max-w-[180px] mx-auto mt-1.5">
                      Selecione seu perfil na listagem lateral para habilitar o teclado numérico de PIN.
                    </p>
                  </div>
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
          <div className="h-16 bg-[#202c33] border-b border-[#2a3942]/60 px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-sm">
                {loggedInUser.name.substring(0, 1).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xs text-[#8696a0]">Operador Conectado</h2>
                <h1 className="text-sm font-bold text-white">{loggedInUser.name}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLogout}
                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                Bloquear Tela <Lock size={12} />
              </button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            
            {/* LISTAGEM DE CHECKLISTS DISPONÍVEIS (SEÇÃO ESQUERDA) */}
            <div className="w-[340px] shrink-0 border-r border-[#2a3942]/60 bg-[#182229]/60 flex flex-col overflow-y-auto p-4 styled-scrollbar gap-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider px-2">Rotinas do seu Turno</h3>
              
              {loadingChecklists ? (
                <div className="p-8 text-center text-[#8696a0] animate-pulse">Carregando rotinas...</div>
              ) : checklists.length === 0 ? (
                <div className="p-8 text-center text-[#8696a0] italic text-xs">Nenhum checklist disponível no momento.</div>
              ) : (
                checklists.map((chk) => (
                  <button
                    key={chk.id}
                    onClick={() => handleStartChecklist(chk)}
                    disabled={submitting}
                    className={`p-4 rounded-3xl border text-left transition-all relative flex flex-col justify-between min-h-[110px] ${activeChecklist?.id === chk.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-[#2a3942]/60 bg-[#202c33]/50 hover:bg-[#202c33]/80'}`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-indigo-500/20 text-indigo-400 shrink-0">
                          {chk.category || 'Geral'}
                        </span>
                        <span className="text-[9px] text-[#8696a0] truncate">{chk.unit_name}</span>
                      </div>
                      <h4 className="font-bold text-white text-sm mt-2.5 leading-snug line-clamp-1">{chk.title}</h4>
                    </div>

                    <div className="flex items-center justify-between mt-3 text-[10px] text-[#8696a0] pt-2.5 border-t border-[#2a3942]/40 w-full">
                      <span className="flex items-center gap-1">
                        <Compass size={11} /> {chk.sector_name}
                      </span>
                      <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-1 transition-all" />
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* ÁREA DE PREENCHIMENTO DO CHECKLIST ATIVO (SEÇÃO DIREITA) */}
            <div className="flex-1 flex flex-col overflow-hidden bg-[#182229]/20">
              {activeChecklist ? (
                <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-200">
                  
                  {/* Cabeçalho do Roteiro */}
                  <div className="p-6 bg-[#202c33]/50 border-b border-[#2a3942]/60 shrink-0">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-black text-white">{activeChecklist.title}</h2>
                        <p className="text-xs text-[#8696a0] mt-0.5">{activeChecklist.description || 'Siga as orientações abaixo para preencher.'}</p>
                      </div>
                      
                      {/* Geolocalização e Status do GPS */}
                      {activeChecklist.require_geolocation && (
                        <div className={`px-4 py-2 rounded-2xl border flex items-center gap-2 shrink-0 ${
                          distanceFromUnit === null ? 'border-amber-500/20 bg-amber-500/5 text-amber-400' :
                          distanceFromUnit <= activeChecklist.unit_radius_meters ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' :
                          'border-rose-500/20 bg-rose-500/5 text-rose-400'
                        }`}>
                          <Compass size={14} className={locating ? 'animate-spin' : ''} />
                          <div className="text-left">
                            <span className="text-[9px] block uppercase font-bold tracking-wider">Precisão GPS</span>
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
                  </div>

                  {/* Formulário de Perguntas/Itens */}
                  <div className="flex-1 overflow-y-auto styled-scrollbar p-6 space-y-4">
                    
                    {/* Filtros da Lista */}
                    {itemsToAnswer.length > 0 && (
                      <div className="flex flex-col sm:flex-row gap-3 mb-6 bg-[#202c33]/50 p-3 rounded-2xl border border-[#2a3942]/60">
                        <div className="flex-1 relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search size={16} className="text-[#8696a0]" />
                          </div>
                          <input
                            type="text"
                            placeholder="Buscar item..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#d1d7db] placeholder-[#8696a0] focus:outline-none focus:border-indigo-500 transition-all"
                          />
                        </div>
                        
                        <div className="sm:w-64">
                          <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-4 py-2.5 text-sm text-[#d1d7db] focus:outline-none focus:border-indigo-500 transition-all cursor-pointer"
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
                          className={`p-5 rounded-[28px] border flex flex-col gap-4 transition-all ${
                            item.is_required && !resp.isDone ? 'border-[#2a3942]/60 bg-[#202c33]/50' : 'border-emerald-500/30 shadow-sm shadow-emerald-500/5 bg-[#202c33]/80'
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
                                    <span className="text-[10px] font-bold font-mono text-[#8696a0] bg-black/20 w-5 h-5 flex items-center justify-center rounded-full shrink-0">
                                      {idx + 1}
                                    </span>
                                    <div className="relative shrink-0">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveCategoryEditItemId(activeCategoryEditItemId === item.id ? null : item.id);
                                          setNewInlineCategoryName('');
                                        }}
                                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider uppercase flex items-center gap-1 transition-all select-none cursor-pointer ${
                                          groupName 
                                            ? 'bg-[#2a3942] hover:bg-[#344654] text-[#8696a0] hover:text-[#d1d7db]' 
                                            : 'bg-slate-500/15 hover:bg-slate-500/25 text-[#8696a0] hover:text-white border border-[#2a3942]/60'
                                        }`}
                                        title="Trocar categoria do produto"
                                      >
                                        <span>{groupName || '+ Cat'}</span>
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
                                            className="absolute left-0 mt-1.5 w-48 bg-[#202c33] border border-[#2a3942] rounded-2xl p-2.5 z-50 shadow-2xl animate-in fade-in slide-in-from-top-1 text-left"
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

                                            <div className="pt-2 border-t border-[#2a3942]/60 px-1">
                                              <div className="flex gap-1.5">
                                                <input
                                                  type="text"
                                                  value={newInlineCategoryName}
                                                  onChange={e => setNewInlineCategoryName(e.target.value.toUpperCase())}
                                                  placeholder="NOVA CATEGORIA"
                                                  className="flex-1 bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1 text-[9px] text-white focus:outline-none focus:border-indigo-500 placeholder-[#8696a0]/30"
                                                  onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                      e.preventDefault();
                                                      if (newInlineCategoryName.trim()) {
                                                        handleUpdateItemCategory(item.id, item.title, newInlineCategoryName.trim());
                                                      }
                                                    }
                                                  }}
                                                />
                                                <button
                                                  type="button"
                                                  disabled={!newInlineCategoryName.trim()}
                                                  onClick={() => handleUpdateItemCategory(item.id, item.title, newInlineCategoryName.trim())}
                                                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-[9px] px-2 py-1 rounded-lg transition-all"
                                                >
                                                  OK
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                    <h4 className="font-semibold text-white text-sm leading-snug">{cleanTitle}</h4>
                                    {item.is_required && (
                                      <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest shrink-0">* Obrigatório</span>
                                    )}
                                    {item.is_critical && (
                                      <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full shrink-0">Crítico</span>
                                    )}
                                  </div>
                                  
                                  {cleanDescription && (
                                    <p className="text-xs text-[#8696a0] pl-7 leading-relaxed">{cleanDescription}</p>
                                  )}

                                  {/* Metas Numéricas / Temperatura */}
                                  {(item.response_type === 'numeric' || item.response_type === 'temperature' || item.response_type === 'kg') && (item.min_meta !== null || item.max_meta !== null) && (
                                    <p className="text-[11px] text-teal-400 pl-7 font-mono font-bold mt-0.5">
                                      {item.min_meta !== null ? `Mín: ${item.min_meta}` : ''} {item.max_meta !== null ? `Máx: ${item.max_meta}` : ''} {item.measurement_unit}
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
                                            className="text-[9px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-0.5 rounded-lg transition-all active:scale-95 cursor-pointer ml-1 select-none"
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
                                <span className="text-[9px] font-black text-indigo-400/80 block uppercase tracking-widest">Itens a verificar:</span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {item.options.map((sub: string, sIdx: number) => {
                                    const subtaskKey = `${item.id}_${sIdx}`;
                                    const isChecked = checkedSubtasks[subtaskKey] || false;
                                    return (
                                      <label 
                                        key={sIdx} 
                                        className={`flex items-center gap-2 p-2 rounded-xl border transition-all cursor-pointer select-none text-[11px] ${
                                          isChecked 
                                            ? 'bg-indigo-500/10 border-indigo-500/30 text-white' 
                                            : 'bg-black/25 border-[#2a3942]/40 text-[#d1d7db] hover:bg-black/40'
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
                                          className="rounded border-[#2a3942] text-indigo-600 bg-transparent focus:ring-indigo-600/30 focus:ring-offset-0 w-3.5 h-3.5"
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
                                <label className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                                  resp.evidenceUrl ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' : 'border-indigo-500/30 bg-indigo-500/5 text-indigo-400'
                                }`}>
                                  <Camera size={13} />
                                  {resp.evidenceUploading ? 'Enviando...' : resp.evidenceUrl ? 'Foto Anexada ✅' : 'Tirar Foto Evidência'}
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
                                  <a href={resp.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#8696a0] hover:underline truncate max-w-[160px]">
                                    Ver Foto
                                  </a>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Seleção de Respostas */}
                          <div className="shrink-0 flex items-center gap-3">
                            
                            {/* BOOLEAN */}
                            {item.response_type === 'boolean' && (
                              <div className="flex gap-2 bg-black/20 p-1 rounded-xl">
                                {['Feito', 'Não Feito'].map(opt => (
                                  <button
                                    key={opt}
                                    onClick={() => handleAnswerChange(item.id, item.response_type, opt, item.min_meta, item.max_meta)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                      resp.value === opt
                                        ? opt === 'Feito' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                                        : 'text-[#8696a0] hover:text-[#d1d7db]'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* CONFORMIDADE */}
                            {item.response_type === 'conformity' && (
                              <div className="flex gap-2 bg-black/20 p-1 rounded-xl">
                                {['Conforme', 'Não Conforme'].map(opt => (
                                  <button
                                    key={opt}
                                    onClick={() => handleAnswerChange(item.id, item.response_type, opt, item.min_meta, item.max_meta)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                      resp.value === opt
                                        ? opt === 'Conforme' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                                        : 'text-[#8696a0] hover:text-[#d1d7db]'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* YES_NO */}
                            {item.response_type === 'yes_no' && (
                              <div className="flex gap-2 bg-black/20 p-1 rounded-xl">
                                {['Sim', 'Não'].map(opt => (
                                  <button
                                    key={opt}
                                    onClick={() => handleAnswerChange(item.id, item.response_type, opt, item.min_meta, item.max_meta)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                      resp.value === opt
                                        ? opt === 'Sim' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                                        : 'text-[#8696a0] hover:text-[#d1d7db]'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* NUMERIC / TEMPERATURE / COUNTER / KG */}
                            {(item.response_type === 'numeric' || item.response_type === 'temperature' || item.response_type === 'counter' || item.response_type === 'kg') && (
                              <div className="flex items-center gap-1 bg-[#111b21] p-1.5 rounded-[20px] border border-[#2a3942]/80 shadow-inner">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const step = item.response_type === 'kg' ? 0.1 : 1;
                                    const current = parseFloat(resp.value || '0');
                                    const result = (current - step).toFixed(item.response_type === 'kg' ? 3 : 0);
                                    handleAnswerChange(item.id, item.response_type, parseFloat(result).toString(), item.min_meta, item.max_meta);
                                  }}
                                  className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center bg-[#202c33] hover:bg-[#2a3942] rounded-2xl text-[#8696a0] hover:text-white text-3xl font-light transition-all active:scale-95"
                                >
                                  -
                                </button>
                                
                                <div className="flex items-baseline px-2">
                                  <input
                                    type="number"
                                    step="any"
                                    value={resp.value || ''}
                                    onChange={(e) => handleAnswerChange(item.id, item.response_type, e.target.value, item.min_meta, item.max_meta)}
                                    placeholder="0"
                                    className="bg-transparent border-none focus:outline-none focus:ring-0 text-3xl md:text-4xl font-black w-20 md:w-24 text-center text-white p-0 m-0"
                                  />
                                  {item.measurement_unit && (
                                    <span className="text-xs font-bold text-[#8696a0] shrink-0 ml-1">{item.measurement_unit}</span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const current = parseFloat(resp.value || '0');
                                    const step = item.response_type === 'kg' ? 0.1 : 1; const result = (current + step).toFixed(item.response_type === 'kg' ? 3 : 0); handleAnswerChange(item.id, item.response_type, parseFloat(result).toString(), item.min_meta, item.max_meta);
                                  }}
                                  className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-2xl text-3xl font-light transition-all active:scale-95 border border-emerald-500/30"
                                >
                                  +
                                </button>
                              </div>
                            )}

                            {/* TEXT FREE */}
                            {item.response_type === 'text' && (
                              <textarea
                                rows={1}
                                value={resp.value || ''}
                                onChange={(e) => handleAnswerChange(item.id, item.response_type, e.target.value, item.min_meta, item.max_meta)}
                                placeholder="Descreva aqui..."
                                className="bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none w-48"
                              />
                            )}

                            {/* STARS */}
                            {item.response_type === 'stars' && (
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map(starNum => {
                                  const isSelected = parseInt(resp.value) >= starNum;
                                  return (
                                    <button
                                      key={starNum}
                                      onClick={() => handleAnswerChange(item.id, item.response_type, starNum.toString(), item.min_meta, item.max_meta)}
                                      className={`p-1 hover:scale-110 transition-transform ${isSelected ? 'text-amber-400' : 'text-[#2a3942]'}`}
                                    >
                                      <Star size={16} fill={isSelected ? 'currentColor' : 'transparent'} />
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                           </div>
                          </div>

                          {/* Data e Hora e Operador */}
                          {resp.isDone && resp.answeredAt && resp.answeredBy && (
                            <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-[#2a3942]/30 text-[10px] text-[#8696a0] animate-in fade-in slide-in-from-top-1">
                              <CheckCircle2 size={12} className="text-emerald-500" />
                              <span>
                                Registrado por <strong className="text-[#d1d7db]">{resp.answeredBy}</strong> em{' '}
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
                  <div className="h-20 bg-[#202c33] border-t border-[#2a3942]/60 px-6 flex items-center justify-between shrink-0">
                    <button
                      onClick={() => setActiveChecklist(null)}
                      className="text-xs text-[#8696a0] hover:text-[#d1d7db] font-semibold flex items-center gap-1"
                    >
                      <X size={14} /> Abandonar Roteiro
                    </button>
                    
                    <button
                      onClick={handleSubmitChecklist}
                      disabled={submitting}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-3 rounded-2xl flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
                    >
                      {submitting ? 'Registrando na Base...' : 'Finalizar e Assinar Rotina'}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
                  <Smile size={48} className="text-[#2a3942] animate-bounce" />
                  <div>
                    <h3 className="font-bold text-white text-md">Cozinha Organizada!</h3>
                    <p className="text-xs text-[#8696a0] mt-1 max-w-[280px] mx-auto leading-relaxed">
                      Selecione uma das rotinas ativas no painel esquerdo para iniciar o checklist.
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
