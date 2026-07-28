import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';
import { 
  Building2, 
  MapPin, 
  Clock, 
  Plus, 
  Edit2, 
  Trash2, 
  ChevronRight, 
  Check, 
  X, 
  Search, 
  Shield, 
  KeyRound, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle,
  Briefcase,
  Calendar,
  HelpCircle,
  Calculator
} from 'lucide-react';

interface Unit {
  id: string;
  name: string;
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  number: string;
  complement: string;
  timezone: string;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  require_geolocation: boolean;
  require_schedule_limits: boolean;
  max_lead_minutes: number;
  max_lag_minutes: number;
}

interface Sector {
  id: string;
  unit_id: string;
  name: string;
  description: string;
}

interface Profile {
  id: string;
  email: string;
  name: string;
  phone: string;
  pin: string;
  role: 'super_admin' | 'company_admin' | 'manager' | 'operator';
  is_active: boolean;
  unit_permissions?: string[];
  sector_permissions?: string[];
  cargo_id?: string | null;
}

interface CargoBreak {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
}

interface Cargo {
  id: string;
  tenant_id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_start_time?: string | null;
  break_end_time?: string | null;
  shift_period?: 'cafe' | 'almoco' | 'jantar' | 'custom' | null;
  shifts?: string[];
  breaks?: CargoBreak[];
  work_days: string[];
  salary?: number | null;
  created_at?: string;
  updated_at?: string;
}

const DAYS_OF_WEEK = [
  { key: 'seg', label: 'Segunda-feira', short: 'Seg' },
  { key: 'ter', label: 'Terça-feira', short: 'Ter' },
  { key: 'qua', label: 'Quarta-feira', short: 'Qua' },
  { key: 'qui', label: 'Quinta-feira', short: 'Qui' },
  { key: 'sex', label: 'Sexta-feira', short: 'Sex' },
  { key: 'sab', label: 'Sábado', short: 'Sáb' },
  { key: 'dom', label: 'Domingo', short: 'Dom' }
];

const calculateCargoHours = (cargo: Partial<Cargo>) => {
  if (!cargo.start_time || !cargo.end_time) {
    return { 
      dailyHours: 0, weeklyHours: 0, monthlyHours: 0, 
      formattedDaily: '0h', formattedWeekly: '0h', formattedMonthly: '0h',
      dailyDeltaText: '', weeklyDeltaText: '', monthlyDeltaText: '',
      dailyIsOvertime: false, weeklyIsOvertime: false, monthlyIsOvertime: false,
      salary: 0, hourlyRate: 0, monthlyOvertimeCost: 0, totalEstimatedSalary: 0
    };
  }

  const [startH, startM] = cargo.start_time.split(':').map(Number);
  const [endH, endM] = cargo.end_time.split(':').map(Number);

  let totalSpanMinutes = (endH * 60 + (endM || 0)) - (startH * 60 + (startM || 0));
  if (totalSpanMinutes < 0) totalSpanMinutes += 24 * 60;

  let breakMinutes = 0;
  if (cargo.breaks && cargo.breaks.length > 0) {
    cargo.breaks.forEach(b => {
      if (b.start_time && b.end_time) {
        const [bStartH, bStartM] = b.start_time.split(':').map(Number);
        const [bEndH, bEndM] = b.end_time.split(':').map(Number);
        let bDiff = (bEndH * 60 + (bEndM || 0)) - (bStartH * 60 + (bStartM || 0));
        if (bDiff < 0) bDiff += 24 * 60;
        breakMinutes += bDiff;
      }
    });
  } else if (cargo.break_start_time && cargo.break_end_time) {
    const [bStartH, bStartM] = cargo.break_start_time.split(':').map(Number);
    const [bEndH, bEndM] = cargo.break_end_time.split(':').map(Number);
    let bDiff = (bEndH * 60 + (bEndM || 0)) - (bStartH * 60 + (bStartM || 0));
    if (bDiff < 0) bDiff += 24 * 60;
    breakMinutes += bDiff;
  }

  const netDailyMinutes = Math.max(0, totalSpanMinutes - breakMinutes);
  const dailyHours = netDailyMinutes / 60;

  const daysCount = (cargo.work_days && cargo.work_days.length > 0) ? cargo.work_days.length : 5;
  const weeklyHours = dailyHours * daysCount;
  const monthlyHours = weeklyHours * 4.333;

  const formatHoursMinutes = (totalMins: number) => {
    const absMins = Math.abs(totalMins);
    const h = Math.floor(absMins / 60);
    const m = Math.round(absMins % 60);
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  // --- CLT COMPARISON MATH ---
  const cltDailyStandardMinutes = (44.0 / daysCount) * 60;
  const dailyDeltaMins = netDailyMinutes - cltDailyStandardMinutes;
  const dailyIsOvertime = dailyDeltaMins > 1;
  const dailyIsUndertime = dailyDeltaMins < -1;
  const dailyDeltaText = dailyIsOvertime 
    ? `+${formatHoursMinutes(dailyDeltaMins)} HE` 
    : dailyIsUndertime 
      ? `-${formatHoursMinutes(dailyDeltaMins)} Dev.` 
      : 'Regular';

  const cltWeeklyStandardMinutes = 44 * 60;
  const weeklyDeltaMins = (weeklyHours * 60) - cltWeeklyStandardMinutes;
  const weeklyIsOvertime = weeklyDeltaMins > 1;
  const weeklyIsUndertime = weeklyDeltaMins < -1;
  const weeklyDeltaText = weeklyIsOvertime 
    ? `+${formatHoursMinutes(weeklyDeltaMins)} HE` 
    : weeklyIsUndertime 
      ? `-${formatHoursMinutes(weeklyDeltaMins)} Dev.` 
      : 'CLT (44h)';

  const cltMonthlyStandardHours = 220;
  const monthlyDeltaHours = monthlyHours - cltMonthlyStandardHours;
  const monthlyIsOvertime = monthlyDeltaHours > 0.5;
  const monthlyIsUndertime = monthlyDeltaHours < -0.5;
  const monthlyDeltaText = monthlyIsOvertime 
    ? `+${Math.round(monthlyDeltaHours)}h HE` 
    : monthlyIsUndertime 
      ? `-${Math.round(Math.abs(monthlyDeltaHours))}h Dev.` 
      : 'CLT (220h)';

  // --- FINANCEIRO (SALÁRIO & CUSTO HE) ---
  const salary = cargo.salary ? Number(cargo.salary) : 0;
  const hourlyRate = salary > 0 ? salary / 220 : 0;
  const overtimeHourlyRate = hourlyRate * 1.5;
  const monthlyOvertimeHoursCount = Math.max(0, monthlyDeltaHours);
  const monthlyOvertimeCost = monthlyOvertimeHoursCount * overtimeHourlyRate;
  const totalEstimatedSalary = salary + monthlyOvertimeCost;

  return {
    dailyHours,
    weeklyHours,
    monthlyHours,
    formattedDaily: formatHoursMinutes(netDailyMinutes),
    formattedWeekly: formatHoursMinutes(weeklyHours * 60),
    formattedMonthly: `${Math.round(monthlyHours)}h`,
    dailyDeltaText,
    weeklyDeltaText,
    monthlyDeltaText,
    dailyIsOvertime,
    weeklyIsOvertime,
    monthlyIsOvertime,
    salary,
    hourlyRate,
    monthlyOvertimeCost,
    totalEstimatedSalary
  };
};

export default function ChecklistSettings() {
  const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
  
  // Estados de Abas
  const [activeTab, setActiveTab] = useState<'units' | 'sectors' | 'users' | 'cargos'>('units');
  
  // Listas de Dados
  const [units, setUnits] = useState<Unit[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  // Estados de Busca e Filtros de Equipe
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userFilterRole, setUserFilterRole] = useState<'all' | 'operators' | 'managers' | 'with_cargo' | 'with_pin'>('all');
  const [userFilterSector, setUserFilterSector] = useState<string>('all');
  const [userFilterShift, setUserFilterShift] = useState<string>('all'); // 'all' | 'cafe' | 'almoco' | 'jantar'

  const [loading, setLoading] = useState(true);

  // Mapear PINs duplicados na lista de usuários para sinalizar alertas visuais
  const duplicatePins = useMemo(() => {
    const pinCounts: Record<string, number> = {};
    users.forEach(u => {
      if (u.pin) {
        pinCounts[u.pin] = (pinCounts[u.pin] || 0) + 1;
      }
    });
    return new Set(Object.keys(pinCounts).filter(pin => pinCounts[pin] > 1));
  }, [users]);

  // Estados de Formulários / Modais
  const [editingUnit, setEditingUnit] = useState<Partial<Unit> | null>(null);
  const [editingSector, setEditingSector] = useState<Partial<Sector> | null>(null);
  const [editingUser, setEditingUser] = useState<Partial<Profile> | null>(null);
  const [editingCargo, setEditingCargo] = useState<Partial<Cargo> | null>(null);
  const [calculationDetailsCargo, setCalculationDetailsCargo] = useState<Cargo | null>(null);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const getInitials = (name?: string) => {
    if (!name) return 'OP';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getAvatarGradient = (name?: string) => {
    const gradients = [
      'from-indigo-600 to-purple-600 text-white',
      'from-emerald-600 to-teal-600 text-white',
      'from-amber-500 to-orange-600 text-white',
      'from-pink-600 to-rose-600 text-white',
      'from-cyan-600 to-blue-600 text-white',
      'from-violet-600 to-indigo-600 text-white',
    ];
    if (!name) return gradients[0];
    let charSum = 0;
    for (let i = 0; i < name.length; i++) charSum += name.charCodeAt(i);
    return gradients[charSum % gradients.length];
  };

  useEffect(() => {
    if (tenantId) {
      loadData();
    }
  }, [tenantId]);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      // 1. Carregar Unidades
      const { data: unitsData, error: uErr } = await supabase
        .from('units')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name');
      if (uErr) throw uErr;
      setUnits(unitsData || []);

      // 2. Carregar Setores
      const { data: sectorsData, error: sErr } = await supabase
        .from('sectors')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name');
      if (sErr) throw sErr;
      setSectors(sectorsData || []);

      // 3. Carregar Cargos
      const { data: cargosData, error: cErr } = await supabase
        .from('cargos')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name');
      if (cErr) throw cErr;
      setCargos(cargosData || []);

      // 4. Carregar Usuários Operacionais
      const { data: profilesData, error: pErr } = await supabase
        .from('v_checklist_operators')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name');
      if (pErr) throw pErr;

      // Carrega permissões de cada usuário
      const profilesWithPerms = await Promise.all((profilesData || []).map(async (prof) => {
        const { data: uPerms } = await supabase
          .from('user_unit_permissions')
          .select('unit_id')
          .eq('user_id', prof.id);
        const { data: sPerms } = await supabase
          .from('user_sector_permissions')
          .select('sector_id')
          .eq('user_id', prof.id);
        
        return {
          ...prof,
          unit_permissions: uPerms?.map(p => p.unit_id) || [],
          sector_permissions: sPerms?.map(p => p.sector_id) || []
        };
      }));

      setUsers(profilesWithPerms);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Erro ao carregar dados operacionais. Verifique as RLS ou conexão.');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'success' | 'error', msg: string) => {
    if (type === 'success') {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  // ==========================================
  // AÇÕES DE UNIDADES
  // ==========================================
  
  const handleCepLookup = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (!data.erro && editingUnit) {
        setEditingUnit(prev => ({
          ...prev,
          street: data.logradouro || '',
          neighborhood: data.bairro || '',
          city: data.localidade || '',
          state: data.uf || '',
        }));
      }
    } catch (e) {
      console.error('Erro ao buscar CEP:', e);
    }
  };

  const saveUnit = async () => {
    if (!editingUnit?.name || !editingUnit.cep) {
      showToast('error', 'Nome e CEP são campos obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        name: editingUnit.name,
        cep: editingUnit.cep,
        street: editingUnit.street || '',
        neighborhood: editingUnit.neighborhood || '',
        city: editingUnit.city || '',
        state: editingUnit.state || '',
        number: editingUnit.number || '',
        complement: editingUnit.complement || '',
        timezone: editingUnit.timezone || 'America/Sao_Paulo',
        is_active: editingUnit.is_active ?? true,
        latitude: editingUnit.latitude || null,
        longitude: editingUnit.longitude || null,
        radius_meters: editingUnit.radius_meters || 150,
        require_geolocation: editingUnit.require_geolocation ?? false,
        require_schedule_limits: editingUnit.require_schedule_limits ?? false,
        max_lead_minutes: editingUnit.max_lead_minutes || 60,
        max_lag_minutes: editingUnit.max_lag_minutes || 60,
      };

      if (editingUnit.id) {
        // Atualizar
        const unitBefore = units.find(u => u.id === editingUnit.id);
        const { error } = await supabase
          .from('units')
          .update(payload)
          .eq('id', editingUnit.id);
        if (error) throw error;
        const unitAfter = { ...unitBefore, ...payload };
        await useChatStore.getState().logOperation('UPDATE', 'units', editingUnit.id, unitBefore || null, unitAfter);
        showToast('success', 'Unidade atualizada com sucesso!');
      } else {
        // Inserir
        const { data, error } = await supabase
          .from('units')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        await useChatStore.getState().logOperation('INSERT', 'units', data?.id || 'new-unit', null, data || payload);
        showToast('success', 'Nova unidade cadastrada com sucesso!');
      }

      setEditingUnit(null);
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', `Erro ao salvar unidade: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteUnit = async (id: string) => {
    if (!window.confirm('Atenção: Excluir esta unidade apagará todos os seus setores, agendamentos e execuções vinculadas permanentemente. Deseja continuar?')) return;
    
    try {
      const unitBefore = units.find(u => u.id === id);
      const { error } = await supabase.from('units').delete().eq('id', id);
      if (error) throw error;
      await useChatStore.getState().logOperation('DELETE', 'units', id, unitBefore || null, null);
      showToast('success', 'Unidade removida com sucesso!');
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', `Erro ao deletar unidade: ${err.message}`);
    }
  };

  // ==========================================
  // AÇÕES DE SETORES
  // ==========================================

  const saveSector = async () => {
    if (!editingSector?.name || !editingSector.unit_id) {
      showToast('error', 'Nome e Unidade são obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        unit_id: editingSector.unit_id,
        name: editingSector.name,
        description: editingSector.description || '',
      };

      if (editingSector.id) {
        const sectorBefore = sectors.find(s => s.id === editingSector.id);
        const { error } = await supabase
          .from('sectors')
          .update(payload)
          .eq('id', editingSector.id);
        if (error) throw error;
        const sectorAfter = { ...sectorBefore, ...payload };
        await useChatStore.getState().logOperation('UPDATE', 'sectors', editingSector.id, sectorBefore || null, sectorAfter);
        showToast('success', 'Setor operacional atualizado!');
      } else {
        const { data, error } = await supabase
          .from('sectors')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        await useChatStore.getState().logOperation('INSERT', 'sectors', data?.id || 'new-sector', null, data || payload);
        showToast('success', 'Setor cadastrado com sucesso!');
      }

      setEditingSector(null);
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', `Erro ao salvar setor: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteSector = async (id: string) => {
    if (!window.confirm('Excluir este setor indisponibilizará checklists associados. Confirmar exclusão?')) return;
    try {
      const sectorBefore = sectors.find(s => s.id === id);
      const { error } = await supabase.from('sectors').delete().eq('id', id);
      if (error) throw error;
      await useChatStore.getState().logOperation('DELETE', 'sectors', id, sectorBefore || null, null);
      showToast('success', 'Setor removido.');
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', `Erro ao deletar: ${err.message}`);
    }
  };

  // ==========================================
  // AÇÕES DE CARGOS
  // ==========================================

  const saveCargo = async () => {
    if (!editingCargo?.name) {
      showToast('error', 'O nome do cargo é obrigatório.');
      return;
    }
    setSaving(true);
    try {
      const activeBreaks = editingCargo.breaks || [];
      const activeShifts = editingCargo.shifts || (editingCargo.shift_period ? [editingCargo.shift_period] : []);

      const payload = {
        tenant_id: tenantId,
        name: editingCargo.name,
        start_time: editingCargo.start_time || '08:00:00',
        end_time: editingCargo.end_time || '18:00:00',
        break_start_time: activeBreaks[0]?.start_time || editingCargo.break_start_time || null,
        break_end_time: activeBreaks[0]?.end_time || editingCargo.break_end_time || null,
        shift_period: activeShifts[0] || editingCargo.shift_period || 'custom',
        shifts: activeShifts,
        breaks: activeBreaks,
        work_days: editingCargo.work_days || [],
        salary: editingCargo.salary ? Number(editingCargo.salary) : null,
      };

      if (editingCargo.id) {
        const cargoBefore = cargos.find(c => c.id === editingCargo.id);
        const { error } = await supabase
          .from('cargos')
          .update(payload)
          .eq('id', editingCargo.id);
        if (error) throw error;
        const cargoAfter = { ...cargoBefore, ...payload };
        await useChatStore.getState().logOperation('UPDATE', 'cargos', editingCargo.id, cargoBefore || null, cargoAfter);
        showToast('success', 'Cargo operacional atualizado!');
      } else {
        const { data, error } = await supabase
          .from('cargos')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        await useChatStore.getState().logOperation('INSERT', 'cargos', data?.id || 'new-cargo', null, data || payload);
        showToast('success', 'Cargo cadastrado com sucesso!');
      }

      setEditingCargo(null);
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', `Erro ao salvar cargo: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteCargo = async (id: string) => {
    if (!window.confirm('Tem certeza de que deseja excluir este cargo? Colaboradores vinculados ficarão sem cargo.')) return;
    try {
      const cargoBefore = cargos.find(c => c.id === id);
      const { error } = await supabase.from('cargos').delete().eq('id', id);
      if (error) throw error;
      await useChatStore.getState().logOperation('DELETE', 'cargos', id, cargoBefore || null, null);
      showToast('success', 'Cargo operacional removido.');
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', `Erro ao deletar cargo: ${err.message}`);
    }
  };

  // ==========================================
  // AÇÕES DE USUÁRIOS E PERMISSÕES
  // ==========================================

  const saveUser = async () => {
    if (!editingUser?.name || !editingUser.email || !editingUser.role) {
      showToast('error', 'Nome, Email e Perfil são obrigatórios.');
      return;
    }

    // Validar se o PIN tem exatamente 5 dígitos se estiver preenchido
    const cleanedPin = editingUser.pin ? editingUser.pin.trim() : '';
    if (cleanedPin && cleanedPin.length !== 5) {
      showToast('error', 'O PIN de acesso rápido deve ter exatamente 5 dígitos numéricos.');
      return;
    }

    // Validar unicidade do PIN para evitar conflitos na tela de login por PIN
    if (cleanedPin) {
      const duplicateUser = users.find(u => u.id !== editingUser.id && u.pin === cleanedPin);
      if (duplicateUser) {
        showToast('error', `⚠️ O PIN "${cleanedPin}" já está em uso pelo colaborador "${duplicateUser.name}". Cada colaborador deve ter um PIN único.`);
        return;
      }
    }

    const finalPin = cleanedPin !== '' ? cleanedPin : null;

    setSaving(true);
    try {
      // Como o auth do Supabase é protegido, para o MVP criaremos perfis diretamente na tabela.
      // Se for um novo usuário, precisaríamos associá-lo a um ID do auth.users.
      // Para fins práticos de demonstração rica, podemos atualizar dados de perfis existentes ou criar perfis fictícios
      // caso o usuário faça um bypass de convite.
      
      const payload = {
        tenant_id: tenantId,
        name: editingUser.name,
        email: editingUser.email,
        phone: editingUser.phone || '',
        pin: finalPin,
        role: editingUser.role,
        is_active: editingUser.is_active ?? true,
      };

      if (editingUser.id) {
        // Atualizar ou inserir perfil na tabela de extensão
        const { error } = await supabase
          .from('users_profiles')
          .upsert({
            id: editingUser.id,
            tenant_id: tenantId,
            name: editingUser.name,
            email: editingUser.email,
            phone: editingUser.phone || '',
            pin: finalPin,
            role: editingUser.role,
            is_active: editingUser.is_active ?? true,
            cargo_id: editingUser.cargo_id || null
          }, { onConflict: 'id' });
        if (error) throw error;

        // Atualizar Permissões de Unidades (Exclui antigas, reinsere novas)
        const { error: delUnitErr } = await supabase.from('user_unit_permissions').delete().eq('user_id', editingUser.id);
        if (delUnitErr) console.warn('Erro ao deletar user_unit_permissions:', delUnitErr);

        if (editingUser.unit_permissions && editingUser.unit_permissions.length > 0) {
          const uniqueUnits = Array.from(new Set(editingUser.unit_permissions));
          const insertPayloads = uniqueUnits.map(uId => ({
            user_id: editingUser.id,
            unit_id: uId
          }));
          const { error: insUnitErr } = await supabase.from('user_unit_permissions').upsert(insertPayloads, { onConflict: 'user_id,unit_id' });
          if (insUnitErr) throw insUnitErr;
        }

        // Atualizar Permissões de Setores
        const { error: delSecErr } = await supabase.from('user_sector_permissions').delete().eq('user_id', editingUser.id);
        if (delSecErr) console.warn('Erro ao deletar user_sector_permissions:', delSecErr);

        if (editingUser.sector_permissions && editingUser.sector_permissions.length > 0) {
          const uniqueSectors = Array.from(new Set(editingUser.sector_permissions));
          const insertPayloads = uniqueSectors.map(sId => ({
            user_id: editingUser.id,
            sector_id: sId
          }));
          const { error: insSecErr } = await supabase.from('user_sector_permissions').upsert(insertPayloads, { onConflict: 'user_id,sector_id' });
          if (insSecErr) throw insSecErr;
        }

        showToast('success', 'Perfil e acessos do colaborador atualizados com sucesso!');
      }

      setEditingUser(null);
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', `Erro ao salvar perfil: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (userId: string) => {
    const userToDelete = users.find(u => u.id === userId);
    if (!userToDelete) return;

    if (userToDelete.role === 'company_admin') {
      showToast('error', 'Não é possível excluir o Administrador principal da empresa.');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja excluir o colaborador "${userToDelete.name}" da equipe? Todos os acessos e PINs serão removidos.`)) {
      return;
    }

    try {
      // 1. Remover permissões
      await supabase.from('user_unit_permissions').delete().eq('user_id', userId);
      await supabase.from('user_sector_permissions').delete().eq('user_id', userId);

      // 2. Remover de users_profiles
      await supabase.from('users_profiles').delete().eq('id', userId);

      // 3. Remover de tenant_users (por user_id e por email)
      if (userToDelete.email) {
        await supabase.from('tenant_users').delete().eq('email', userToDelete.email);
      }
      await supabase.from('tenant_users').delete().eq('user_id', userId);

      await useChatStore.getState().logOperation('DELETE', 'users_profiles', userId, userToDelete || null, null);
      showToast('success', `Colaborador "${userToDelete.name}" removido com sucesso.`);
      
      if (editingUser?.id === userId) {
        setEditingUser(null);
      }

      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', `Erro ao excluir colaborador: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#182229] dark:bg-[#0b141a] text-[#d1d7db] overflow-y-auto p-6 styled-scrollbar">
      
      {/* Toast Messages */}
      {successMsg && (
        <div className="fixed top-4 right-4 bg-emerald-500 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle2 size={20} />
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="fixed top-4 right-4 bg-rose-500 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <AlertTriangle size={20} />
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Header Premium */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#2a3942]/60 pb-6 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#e9edef] tracking-tight flex items-center gap-2">
            <Building2 className="text-indigo-400" />
            Configurações Operacionais
          </h1>
          <p className="text-sm text-[#8696a0] mt-1">
            Gerencie filiais, setores, acessos rápidos por PIN e restrições geográficas da sua operação.
          </p>
        </div>
      </div>

      {/* Abas e Menus */}
      <div className="flex border-b border-[#2a3942]/40 mb-6 shrink-0">
        <button
          onClick={() => { setActiveTab('units'); setEditingUnit(null); }}
          className={`px-5 py-3 text-sm font-medium transition-all relative ${activeTab === 'units' ? 'text-indigo-400 font-semibold' : 'text-[#8696a0] hover:text-[#d1d7db]'}`}
        >
          Filiais / Unidades ({units.length})
          {activeTab === 'units' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t" />}
        </button>
        <button
          onClick={() => { setActiveTab('sectors'); setEditingSector(null); }}
          className={`px-5 py-3 text-sm font-medium transition-all relative ${activeTab === 'sectors' ? 'text-indigo-400 font-semibold' : 'text-[#8696a0] hover:text-[#d1d7db]'}`}
        >
          Setores Operacionais ({sectors.length})
          {activeTab === 'sectors' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t" />}
        </button>
        <button
          onClick={() => { setActiveTab('users'); setEditingUser(null); }}
          className={`px-5 py-3 text-sm font-medium transition-all relative ${activeTab === 'users' ? 'text-indigo-400 font-semibold' : 'text-[#8696a0] hover:text-[#d1d7db]'}`}
        >
          Equipe & PINs ({users.length})
          {activeTab === 'users' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t" />}
        </button>
        <button
          onClick={() => { setActiveTab('cargos'); setEditingCargo(null); }}
          className={`px-5 py-3 text-sm font-medium transition-all relative ${activeTab === 'cargos' ? 'text-indigo-400 font-semibold' : 'text-[#8696a0] hover:text-[#d1d7db]'}`}
        >
          Cargos / Funções ({cargos.length})
          {activeTab === 'cargos' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-t" />}
        </button>
      </div>

      {/* CONTEÚDO DA ABA: UNIDADES */}
      {activeTab === 'units' && (
        <div className={`grid grid-cols-1 ${editingUnit ? 'lg:grid-cols-3' : 'grid-cols-1'} gap-6 items-start`}>
          
          {/* Listagem das Unidades */}
          <div className={`${editingUnit ? 'lg:col-span-2' : 'col-span-1'} space-y-4`}>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-[#e9edef]">Lista de Filiais</h2>
              {!editingUnit && (
                <button
                  onClick={() => setEditingUnit({ name: '', cep: '', timezone: 'America/Sao_Paulo', is_active: true, radius_meters: 150, require_geolocation: false, require_schedule_limits: false, max_lead_minutes: 60, max_lag_minutes: 60 })}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                >
                  <Plus size={14} /> Cadastrar Filial
                </button>
              )}
            </div>

            {loading ? (
              <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/50 rounded-3xl border border-[#2a3942]/40">
                Carregando unidades operacionais...
              </div>
            ) : units.length === 0 ? (
              <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/40 rounded-3xl border border-dashed border-[#2a3942]/60">
                Nenhuma filial cadastrada. Adicione sua primeira filial para começar.
              </div>
            ) : (
              <div className={`grid grid-cols-1 md:grid-cols-2 ${editingUnit ? '' : 'lg:grid-cols-3 xl:grid-cols-4'} gap-4`}>
                {units.map((unit) => (
                  <div 
                    key={unit.id}
                    className={`bg-[#202c33]/80 rounded-[28px] border p-5 transition-all relative flex flex-col justify-between ${editingUnit?.id === unit.id ? 'border-indigo-500 shadow-indigo-500/10 shadow-lg' : 'border-[#2a3942]/60 hover:shadow-md'}`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-semibold text-white text-base truncate">{unit.name}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${unit.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                          {unit.is_active ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>
                      
                      <div className="mt-3 space-y-1.5 text-xs text-[#8696a0]">
                        <p className="flex items-center gap-1.5">
                          <MapPin size={13} className="text-slate-400" />
                          {unit.street}, {unit.number} - {unit.city}/{unit.state}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Clock size={13} className="text-slate-400" />
                          Fuso: {unit.timezone}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Shield size={13} className="text-slate-400" />
                          GPS: {unit.require_geolocation ? `Ativo (${unit.radius_meters}m)` : 'Sem Restrição'}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-4 border-t border-[#2a3942]/40">
                      <button
                        onClick={() => setEditingUnit(unit)}
                        className="flex-1 bg-[#2a3942] hover:bg-[#3b4a54] text-[#d1d7db] text-xs font-semibold py-2 rounded-xl flex items-center justify-center gap-1 transition-all"
                      >
                        <Edit2 size={12} /> Editar
                      </button>
                      <button
                        onClick={() => deleteUnit(unit.id)}
                        className="p-2 hover:bg-rose-500/10 text-[#8696a0] hover:text-rose-400 rounded-xl transition-all"
                        title="Deletar Filial"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Painel de Cadastro/Edição de Unidades */}
          {editingUnit && (
            <div className="bg-[#202c33]/85 backdrop-blur-md rounded-[32px] border border-black/5 dark:border-white/5 p-6 shadow-xl animate-in slide-in-from-right-4 duration-300">
              <div className="flex justify-between items-center border-b border-[#2a3942]/60 pb-3 mb-4">
                <h3 className="font-semibold text-white text-md flex items-center gap-1.5">
                  <Sparkles size={16} className="text-indigo-400" />
                  {editingUnit.id ? 'Editar Filial' : 'Nova Filial'}
                </h3>
                <button onClick={() => setEditingUnit(null)} className="p-1 hover:bg-white/10 rounded-lg text-[#8696a0]">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Nome */}
                <div>
                  <label className="block text-xs font-medium text-[#8696a0] mb-1">Nome Fantasia da Unidade *</label>
                  <input
                    type="text"
                    value={editingUnit.name || ''}
                    onChange={e => setEditingUnit(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ex: Filial Centro"
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2.5 text-sm text-[#d1d7db] focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                {/* CEP */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-[#8696a0] mb-1">CEP *</label>
                    <input
                      type="text"
                      value={editingUnit.cep || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setEditingUnit(p => ({ ...p, cep: val }));
                        if (val.replace(/\D/g, '').length === 8) handleCepLookup(val);
                      }}
                      placeholder="Ex: 01001-000"
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2.5 text-sm text-[#d1d7db] focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#8696a0] mb-1">Fuso Horário *</label>
                    <select
                      value={editingUnit.timezone || 'America/Sao_Paulo'}
                      onChange={e => setEditingUnit(p => ({ ...p, timezone: e.target.value }))}
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-2 py-2.5 text-[11px] text-[#d1d7db] focus:outline-none focus:border-indigo-500 transition-all"
                    >
                      <option value="America/Sao_Paulo">Brasília (SP/RJ/DF)</option>
                      <option value="America/Manaus">Manaus (AMT)</option>
                      <option value="America/Cuiaba">Cuiabá (AMT)</option>
                      <option value="America/Rio_Branco">Acre (ACT)</option>
                      <option value="America/Fernando_De_Noronha">Noronha (FNT)</option>
                    </select>
                  </div>
                </div>

                {/* Endereço */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={editingUnit.street || ''}
                      onChange={e => setEditingUnit(p => ({ ...p, street: e.target.value }))}
                      placeholder="Rua/Avenida"
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-[#d1d7db] focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={editingUnit.number || ''}
                      onChange={e => setEditingUnit(p => ({ ...p, number: e.target.value }))}
                      placeholder="Número"
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-[#d1d7db] focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={editingUnit.neighborhood || ''}
                    onChange={e => setEditingUnit(p => ({ ...p, neighborhood: e.target.value }))}
                    placeholder="Bairro"
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-[#d1d7db] focus:outline-none"
                  />
                  <input
                    type="text"
                    value={editingUnit.city || ''}
                    onChange={e => setEditingUnit(p => ({ ...p, city: e.target.value }))}
                    placeholder="Cidade"
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-[#d1d7db] focus:outline-none"
                  />
                </div>

                {/* Restrições de Geolocalização */}
                <div className="bg-[#111b21] p-4 rounded-2xl border border-[#2a3942]/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-1">
                      <MapPin size={13} className="text-indigo-400" /> Restrição por GPS
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={editingUnit.require_geolocation || false}
                        onChange={e => setEditingUnit(p => ({ ...p, require_geolocation: e.target.checked }))}
                      />
                      <div className="w-8 h-4 bg-[#3b4a54] rounded-full peer peer-checked:after:translate-x-[16px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] peer-checked:after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#00a884]"></div>
                    </label>
                  </div>

                  {editingUnit.require_geolocation && (
                    <div className="space-y-2 pt-2 border-t border-[#2a3942]/40 animate-in fade-in duration-200">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="any"
                          value={editingUnit.latitude || ''}
                          onChange={e => setEditingUnit(p => ({ ...p, latitude: parseFloat(e.target.value) || null }))}
                          placeholder="Latitude (Ex: -23.5)"
                          className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-2.5 py-1.5 text-xs text-[#d1d7db]"
                        />
                        <input
                          type="number"
                          step="any"
                          value={editingUnit.longitude || ''}
                          onChange={e => setEditingUnit(p => ({ ...p, longitude: parseFloat(e.target.value) || null }))}
                          placeholder="Longitude (Ex: -46.6)"
                          className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-2.5 py-1.5 text-xs text-[#d1d7db]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#8696a0] mb-0.5">Raio Máximo permitido (Metros)</label>
                        <input
                          type="number"
                          value={editingUnit.radius_meters || 150}
                          onChange={e => setEditingUnit(p => ({ ...p, radius_meters: parseInt(e.target.value) || 150 }))}
                          placeholder="Raio em metros (Ex: 150)"
                          className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-3 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Restrições de Tolerância de Horários */}
                <div className="bg-[#111b21] p-4 rounded-2xl border border-[#2a3942]/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-1">
                      <Clock size={13} className="text-indigo-400" /> Janela de Tolerância de Horário
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={editingUnit.require_schedule_limits || false}
                        onChange={e => setEditingUnit(p => ({ ...p, require_schedule_limits: e.target.checked }))}
                      />
                      <div className="w-8 h-4 bg-[#3b4a54] rounded-full peer peer-checked:after:translate-x-[16px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] peer-checked:after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#00a884]"></div>
                    </label>
                  </div>

                  {editingUnit.require_schedule_limits && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#2a3942]/40 animate-in fade-in duration-200">
                      <div>
                        <label className="block text-[10px] text-[#8696a0] mb-0.5">Antecedência (Minutos)</label>
                        <input
                          type="number"
                          value={editingUnit.max_lead_minutes || 60}
                          onChange={e => setEditingUnit(p => ({ ...p, max_lead_minutes: parseInt(e.target.value) || 60 }))}
                          className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-2.5 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#8696a0] mb-0.5">Limite de Atraso (Minutos)</label>
                        <input
                          type="number"
                          value={editingUnit.max_lag_minutes || 60}
                          onChange={e => setEditingUnit(p => ({ ...p, max_lag_minutes: parseInt(e.target.value) || 60 }))}
                          className="w-full bg-[#182229] border border-[#2a3942] rounded-lg px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={saveUnit}
                    disabled={saving}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {saving ? 'Salvando...' : 'Salvar Unidade'}
                  </button>
                  <button
                    onClick={() => setEditingUnit(null)}
                    className="bg-[#2a3942] hover:bg-[#3b4a54] text-[#d1d7db] px-4 py-2.5 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA: SETORES */}
      {activeTab === 'sectors' && (
        <div className={`grid grid-cols-1 ${editingSector ? 'lg:grid-cols-3' : 'grid-cols-1'} gap-6 items-start animate-in fade-in duration-200`}>
          
          {/* Listagem de Setores */}
          <div className={`${editingSector ? 'lg:col-span-2' : 'col-span-1'} space-y-4`}>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-[#e9edef]">Lista de Setores Operacionais</h2>
              {!editingSector && (
                <button
                  onClick={() => setEditingSector({ name: '', description: '', unit_id: units[0]?.id || '' })}
                  disabled={units.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  <Plus size={14} /> Novo Setor
                </button>
              )}
            </div>

            {loading ? (
              <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/50 rounded-3xl border border-[#2a3942]/40">
                Carregando setores operacionais...
              </div>
            ) : sectors.length === 0 ? (
              <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/40 rounded-3xl border border-dashed border-[#2a3942]/60">
                Nenhum setor cadastrado. Cadastre setores (Cozinha, Bar, Caixa, etc.) vinculados às filiais.
              </div>
            ) : (
              <div className={`grid grid-cols-1 md:grid-cols-2 ${editingSector ? '' : 'lg:grid-cols-3 xl:grid-cols-4'} gap-4`}>
                {sectors.map((sec) => {
                  const parentUnit = units.find(u => u.id === sec.unit_id);
                  return (
                    <div 
                      key={sec.id}
                      className={`bg-[#202c33]/80 rounded-[28px] border p-5 transition-all relative flex flex-col justify-between ${editingSector?.id === sec.id ? 'border-indigo-500 shadow-indigo-500/10 shadow-lg' : 'border-[#2a3942]/60 hover:shadow-md'}`}
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-semibold text-white text-base truncate">{sec.name}</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-500/10 text-indigo-400">
                            {parentUnit?.name || 'Filial Desconhecida'}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-[#8696a0] line-clamp-2">
                          {sec.description || 'Sem descrição.'}
                        </p>
                      </div>

                      <div className="flex gap-2 mt-4 pt-4 border-t border-[#2a3942]/40">
                        <button
                          onClick={() => setEditingSector(sec)}
                          className="flex-1 bg-[#2a3942] hover:bg-[#3b4a54] text-[#d1d7db] text-xs font-semibold py-2 rounded-xl flex items-center justify-center gap-1 transition-all"
                        >
                          <Edit2 size={12} /> Editar
                        </button>
                        <button
                          onClick={() => deleteSector(sec.id)}
                          className="p-2 hover:bg-rose-500/10 text-[#8696a0] hover:text-rose-400 rounded-xl transition-all"
                          title="Deletar Setor"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Painel de Cadastro/Edição de Setores */}
          {editingSector && (
            <div className="bg-[#202c33]/85 backdrop-blur-md rounded-[32px] border border-black/5 dark:border-white/5 p-6 shadow-xl animate-in slide-in-from-right-4 duration-300">
              <div className="flex justify-between items-center border-b border-[#2a3942]/60 pb-3 mb-4">
                <h3 className="font-semibold text-white text-md flex items-center gap-1.5">
                  <Building2 size={16} className="text-indigo-400" />
                  {editingSector.id ? 'Editar Setor' : 'Novo Setor'}
                </h3>
                <button onClick={() => setEditingSector(null)} className="p-1 hover:bg-white/10 rounded-lg text-[#8696a0]">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Unidade Vinculada */}
                <div>
                  <label className="block text-xs font-medium text-[#8696a0] mb-1">Filial Vinculada *</label>
                  <select
                    value={editingSector.unit_id || ''}
                    onChange={e => setEditingSector(p => ({ ...p, unit_id: e.target.value }))}
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2.5 text-sm text-[#d1d7db] focus:outline-none focus:border-indigo-500 transition-all"
                  >
                    <option value="" disabled>Selecione uma filial</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                {/* Nome do Setor */}
                <div>
                  <label className="block text-xs font-medium text-[#8696a0] mb-1">Nome do Setor *</label>
                  <input
                    type="text"
                    value={editingSector.name || ''}
                    onChange={e => setEditingSector(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ex: Cozinha Industrial, Salão Principal, Bar"
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2.5 text-sm text-[#d1d7db] focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                {/* Descrição */}
                <div>
                  <label className="block text-xs font-medium text-[#8696a0] mb-1">Descrição / Escopo do Setor</label>
                  <textarea
                    rows={3}
                    value={editingSector.description || ''}
                    onChange={e => setEditingSector(p => ({ ...p, description: e.target.value }))}
                    placeholder="Ex: Responsável pelo mise en place, estocagem, e higiene dos fornos."
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-[#d1d7db] focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={saveSector}
                    disabled={saving}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {saving ? 'Salvando...' : 'Salvar Setor'}
                  </button>
                  <button
                    onClick={() => setEditingSector(null)}
                    className="bg-[#2a3942] hover:bg-[#3b4a54] text-[#d1d7db] px-4 py-2.5 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA: USUÁRIOS E EQUIPE */}
      {activeTab === 'users' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          
          {/* Header da Seção + Busca e Filtros Avançados */}
          <div className="space-y-3 bg-[#202c33]/50 p-4 rounded-3xl border border-[#2a3942]/60 shadow-md">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#e9edef] flex items-center gap-2">
                  <span>Equipe Operacional</span>
                  <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-bold">
                    {(() => {
                      const filtered = users.filter(user => {
                        const query = userSearchTerm.trim().toLowerCase();
                        if (query && !(user.name?.toLowerCase().includes(query) || user.email?.toLowerCase().includes(query) || user.pin?.includes(query))) return false;
                        if (userFilterRole === 'operators' && user.role !== 'operator') return false;
                        if (userFilterRole === 'managers' && (user.role !== 'manager' && user.role !== 'company_admin' && user.role !== 'super_admin')) return false;
                        if (userFilterRole === 'with_cargo' && !user.cargo_id) return false;
                        if (userFilterRole === 'with_pin' && !user.pin) return false;
                        if (userFilterSector !== 'all' && (!user.sector_permissions || !user.sector_permissions.includes(userFilterSector))) return false;
                        if (userFilterShift !== 'all') {
                          if (!user.cargo_id) return false;
                          const userCargo = cargos.find(c => c.id === user.cargo_id);
                          if (!userCargo) return false;
                          const shifts = userCargo.shifts && userCargo.shifts.length > 0 ? userCargo.shifts : userCargo.shift_period ? [userCargo.shift_period] : [];
                          if (!shifts.includes(userFilterShift)) return false;
                        }
                        return true;
                      });
                      return `${filtered.length} ${filtered.length === 1 ? 'membro' : 'membros'}`;
                    })()}
                  </span>
                </h2>
                <p className="text-xs text-[#8696a0]">Gerencie cargos, turnos de trabalho, PINs no tablet e permissões por setor/filial.</p>
              </div>

              {/* Input de Busca */}
              <div className="relative w-full sm:w-72">
                <Search size={14} className="absolute left-3 top-3 text-[#8696a0]" />
                <input
                  type="text"
                  value={userSearchTerm}
                  onChange={e => setUserSearchTerm(e.target.value)}
                  placeholder="Buscar por nome, e-mail ou PIN..."
                  className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-[#8696a0] focus:outline-none focus:border-indigo-500 transition-all font-medium"
                />
                {userSearchTerm && (
                  <button 
                    onClick={() => setUserSearchTerm('')}
                    className="absolute right-2.5 top-2.5 text-[#8696a0] hover:text-white p-0.5 rounded-md cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Linha 1 de Filtros: Perfis de Acesso */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#2a3942]/40 text-xs">
              <span className="text-[11px] font-bold text-[#8696a0] uppercase mr-1">Perfil:</span>
              <button
                type="button"
                onClick={() => setUserFilterRole('all')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  userFilterRole === 'all'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/15'
                    : 'bg-[#111b21] border-[#2a3942] text-[#8696a0] hover:text-[#d1d7db]'
                }`}
              >
                Todos ({users.length})
              </button>
              <button
                type="button"
                onClick={() => setUserFilterRole('operators')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  userFilterRole === 'operators'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/15'
                    : 'bg-[#111b21] border-[#2a3942] text-[#8696a0] hover:text-[#d1d7db]'
                }`}
              >
                Operadores ({users.filter(u => u.role === 'operator').length})
              </button>
              <button
                type="button"
                onClick={() => setUserFilterRole('managers')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  userFilterRole === 'managers'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/15'
                    : 'bg-[#111b21] border-[#2a3942] text-[#8696a0] hover:text-[#d1d7db]'
                }`}
              >
                Gerentes / Admins ({users.filter(u => u.role !== 'operator').length})
              </button>
              <button
                type="button"
                onClick={() => setUserFilterRole('with_cargo')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  userFilterRole === 'with_cargo'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/15'
                    : 'bg-[#111b21] border-[#2a3942] text-[#8696a0] hover:text-[#d1d7db]'
                }`}
              >
                👔 Com Cargo ({users.filter(u => !!u.cargo_id).length})
              </button>
              <button
                type="button"
                onClick={() => setUserFilterRole('with_pin')}
                className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  userFilterRole === 'with_pin'
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/15'
                    : 'bg-[#111b21] border-[#2a3942] text-[#8696a0] hover:text-[#d1d7db]'
                }`}
              >
                🔑 Com PIN ({users.filter(u => !!u.pin).length})
              </button>
            </div>

            {/* Linha 2 de Filtros: Turnos (Café, Almoço, Jantar) + Setor */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#2a3942]/30 text-xs">
              {/* Filtro de Turnos */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-[#8696a0] uppercase mr-1">Turno:</span>
                <button
                  type="button"
                  onClick={() => setUserFilterShift('all')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    userFilterShift === 'all'
                      ? 'bg-amber-600 border-amber-500 text-white shadow-md'
                      : 'bg-[#111b21] border-[#2a3942] text-[#8696a0] hover:text-[#d1d7db]'
                  }`}
                >
                  Todos Turnos
                </button>
                <button
                  type="button"
                  onClick={() => setUserFilterShift('cafe')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                    userFilterShift === 'cafe'
                      ? 'bg-amber-600 border-amber-500 text-white shadow-md'
                      : 'bg-[#111b21] border-[#2a3942] text-amber-400 hover:bg-[#182229]'
                  }`}
                >
                  ☕ Café <span className="text-[10px] opacity-75">(07:30-11:00)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUserFilterShift('almoco')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                    userFilterShift === 'almoco'
                      ? 'bg-amber-600 border-amber-500 text-white shadow-md'
                      : 'bg-[#111b21] border-[#2a3942] text-amber-400 hover:bg-[#182229]'
                  }`}
                >
                  🍱 Almoço <span className="text-[10px] opacity-75">(11:00-17:00)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUserFilterShift('jantar')}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                    userFilterShift === 'jantar'
                      ? 'bg-amber-600 border-amber-500 text-white shadow-md'
                      : 'bg-[#111b21] border-[#2a3942] text-amber-400 hover:bg-[#182229]'
                  }`}
                >
                  🌙 Jantar <span className="text-[10px] opacity-75">(17:00-23:00)</span>
                </button>
              </div>

              {/* Seletor de Setor Operacional */}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[11px] font-bold text-[#8696a0] uppercase">Setor:</span>
                <select
                  value={userFilterSector}
                  onChange={e => setUserFilterSector(e.target.value)}
                  className="bg-[#111b21] border border-[#2a3942] text-xs text-white rounded-xl px-2.5 py-1 focus:outline-none focus:border-indigo-500 font-semibold cursor-pointer"
                >
                  <option value="all">Todos os Setores</option>
                  {sectors.map(sec => (
                    <option key={sec.id} value={sec.id}>
                      🏢 {sec.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Listagem de Colaboradores em Largura Total */}
          {loading ? (
            <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/50 rounded-3xl border border-[#2a3942]/40 animate-pulse">
              Carregando membros da equipe...
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/40 rounded-3xl border border-dashed border-[#2a3942]/60">
              Nenhum colaborador encontrado. Eles devem ser vinculados via Supabase Auth primeiro.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users
                .filter(user => {
                  const query = userSearchTerm.trim().toLowerCase();
                  if (query && !(user.name?.toLowerCase().includes(query) || user.email?.toLowerCase().includes(query) || user.pin?.includes(query))) return false;
                  if (userFilterRole === 'operators' && user.role !== 'operator') return false;
                  if (userFilterRole === 'managers' && (user.role !== 'manager' && user.role !== 'company_admin' && user.role !== 'super_admin')) return false;
                  if (userFilterRole === 'with_cargo' && !user.cargo_id) return false;
                  if (userFilterRole === 'with_pin' && !user.pin) return false;
                  if (userFilterSector !== 'all' && (!user.sector_permissions || !user.sector_permissions.includes(userFilterSector))) return false;
                  if (userFilterShift !== 'all') {
                    if (!user.cargo_id) return false;
                    const userCargo = cargos.find(c => c.id === user.cargo_id);
                    if (!userCargo) return false;
                    const shifts = userCargo.shifts && userCargo.shifts.length > 0 ? userCargo.shifts : userCargo.shift_period ? [userCargo.shift_period] : [];
                    if (!shifts.includes(userFilterShift)) return false;
                  }
                  return true;
                })
                .map((user) => {
                  const initials = getInitials(user.name);
                  const avatarBg = getAvatarGradient(user.name);
                  const assignedCargo = user.cargo_id ? cargos.find(c => c.id === user.cargo_id) : null;

                  return (
                    <div 
                      key={user.id}
                      className={`bg-[#202c33]/90 backdrop-blur-md rounded-[28px] border p-5 transition-all duration-200 relative flex flex-col justify-between hover:-translate-y-1 hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-500/5 group ${editingUser?.id === user.id ? 'border-indigo-500 shadow-indigo-500/10 shadow-lg' : 'border-[#2a3942]/70'}`}
                    >
                      <div>
                        {/* Top Bar do Card: Avatar + Nome + Role */}
                        <div className="flex items-start gap-3">
                          <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${avatarBg} flex items-center justify-center font-black text-sm shadow-md shrink-0 border border-white/10`}>
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <h3 className="font-bold text-white text-base truncate group-hover:text-indigo-300 transition-colors">
                                {user.name}
                              </h3>
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase shrink-0 ${
                                user.role === 'company_admin' || user.role === 'super_admin' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
                                user.role === 'manager' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                              }`}>
                                {user.role === 'company_admin' ? 'Admin' :
                                 user.role === 'manager' ? 'Gerente' : 'Operador'}
                              </span>
                            </div>
                            <p className="text-xs text-[#8696a0] truncate">{user.email}</p>
                          </div>
                        </div>

                        {/* Lista de Atributos do Colaborador */}
                        <div className="mt-4 pt-3 border-t border-[#2a3942]/40 space-y-2 text-xs text-[#8696a0]">
                          {/* PIN */}
                          <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border ${
                            user.pin && duplicatePins.has(user.pin)
                              ? 'bg-rose-500/10 border-rose-500/40'
                              : 'bg-[#111b21]/70 border-[#2a3942]/40'
                          }`}>
                            <span className="flex items-center gap-1.5 text-xs text-[#8696a0]">
                              <KeyRound size={13} className={user.pin && duplicatePins.has(user.pin) ? "text-rose-400" : "text-amber-400"} />
                              PIN de Acesso:
                            </span>
                            {user.pin ? (
                              duplicatePins.has(user.pin) ? (
                                <span className="font-mono font-extrabold text-rose-300 bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 rounded-lg tracking-widest text-[11px] flex items-center gap-1 animate-pulse" title="Atenção: Este PIN está duplicado! Altere para um PIN único.">
                                  <AlertTriangle size={11} className="text-rose-400" /> {user.pin} (Duplicado)
                                </span>
                              ) : (
                                <span className="font-mono font-extrabold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg tracking-widest text-xs">
                                  {user.pin}
                                </span>
                              )
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Não Definido</span>
                            )}
                          </div>

                          {/* Cargo */}
                          <div className="flex items-center justify-between bg-[#111b21]/70 px-2.5 py-1.5 rounded-xl border border-[#2a3942]/40">
                            <span className="flex items-center gap-1.5 text-xs text-[#8696a0] shrink-0">
                              <Briefcase size={13} className="text-indigo-400" />
                              Cargo Operacional:
                            </span>
                            {assignedCargo ? (
                              <span className="inline-flex items-center gap-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-lg text-[11px] font-bold truncate max-w-[150px]">
                                👔 {assignedCargo.name}
                              </span>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">Não Definido</span>
                            )}
                          </div>

                          {/* Filiais */}
                          <p className="flex items-center gap-1.5 truncate">
                            <Building2 size={13} className="text-slate-400 shrink-0" />
                            Filiais: <span className="text-[#d1d7db] font-medium">{
                              user.unit_permissions && user.unit_permissions.length > 0 
                                ? user.unit_permissions.map(uId => units.find(un => un.id === uId)?.name).filter(Boolean).join(', ')
                                : 'Sem Filial'
                            }</span>
                          </p>

                          {/* Setores */}
                          <p className="flex items-center gap-1.5 truncate">
                            <Building2 size={13} className="text-slate-400 shrink-0" />
                            Setores: <span className="text-[#d1d7db] font-medium">{
                              user.sector_permissions && user.sector_permissions.length > 0
                                ? user.sector_permissions.map(sId => sectors.find(se => se.id === sId)?.name).filter(Boolean).join(', ')
                                : 'Todos/Nenhum'
                            }</span>
                          </p>
                        </div>
                      </div>

                      {/* Botões de Ação */}
                      <div className="flex gap-2 mt-4 pt-4 border-t border-[#2a3942]/40">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="flex-1 bg-[#2a3942] hover:bg-indigo-600 text-[#d1d7db] hover:text-white text-xs font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95"
                        >
                          <Edit2 size={12} /> Configurar Acessos
                        </button>
                        <button
                          onClick={() => deleteUser(user.id)}
                          disabled={user.role === 'company_admin'}
                          className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 disabled:opacity-20 disabled:cursor-not-allowed text-xs font-semibold px-3 py-2.5 rounded-xl transition-all border border-rose-500/10 cursor-pointer active:scale-95"
                          title={user.role === 'company_admin' ? 'Administrador principal não pode ser excluído' : 'Excluir colaborador'}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* MODAL OVERLAY CENTRALIZADA: EDIÇÃO DE PERMISSÕES DO COLABORADOR */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#202c33] border border-[#2a3942] rounded-[32px] p-6 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto styled-scrollbar animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-[#2a3942]/60 pb-3 mb-4">
              <h3 className="font-semibold text-white text-md flex items-center gap-1.5">
                <Shield size={16} className="text-indigo-400" />
                Gerenciar Permissões de {editingUser.name || 'Colaborador'}
              </h3>
              <button onClick={() => setEditingUser(null)} className="p-1 hover:bg-white/10 rounded-lg text-[#8696a0] hover:text-white transition-all cursor-pointer">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Nome / Email */}
              <div>
                <label className="block text-xs font-medium text-[#8696a0] mb-0.5">Colaborador</label>
                <p className="text-sm font-semibold text-white">{editingUser.name}</p>
                <p className="text-xs text-[#8696a0]">{editingUser.email}</p>
              </div>

              {/* PIN */}
              <div>
                <label className="block text-xs font-medium text-[#8696a0] mb-1">PIN de Acesso Rápido (5 dígitos numéricos) *</label>
                <input
                  type="text"
                  maxLength={5}
                  value={editingUser.pin || ''}
                  onChange={e => {
                    const cleanVal = e.target.value.replace(/\D/g, '');
                    setEditingUser(p => ({ ...p, pin: cleanVal }));
                  }}
                  placeholder="Ex: 12345"
                  className={`w-full bg-[#111b21] border rounded-xl px-3 py-2.5 text-sm tracking-widest font-mono focus:outline-none transition-all text-center font-bold ${
                    editingUser.pin && users.some(u => u.id !== editingUser.id && u.pin === editingUser.pin)
                      ? 'border-rose-500 text-rose-300 focus:border-rose-500'
                      : 'border-[#2a3942] text-white focus:border-indigo-500'
                  }`}
                />
                <span className="text-[10px] text-[#8696a0] block mt-1">Usado para troca rápida de operadores em tablets fixos na cozinha.</span>

                {/* Banner de alerta de PIN duplicado */}
                {editingUser.pin && (() => {
                  const conflictingUser = users.find(u => u.id !== editingUser.id && u.pin === editingUser.pin);
                  if (!conflictingUser) return null;
                  return (
                    <div className="mt-2 bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5 flex items-center gap-2 text-xs text-rose-300 animate-in fade-in duration-200">
                      <AlertTriangle size={16} className="text-rose-400 shrink-0" />
                      <div>
                        <span className="font-bold block text-rose-400">⚠️ PIN Já Cadastrado!</span>
                        <span>O PIN "<strong>{editingUser.pin}</strong>" já está em uso pelo colaborador <strong>{conflictingUser.name}</strong>. Cada colaborador deve ter um PIN exclusivo de 5 dígitos.</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Perfil de Acesso */}
              <div>
                <label className="block text-xs font-medium text-[#8696a0] mb-1">Perfil de Acesso *</label>
                <select
                  value={editingUser.role || 'operator'}
                  onChange={e => setEditingUser(p => ({ ...p, role: e.target.value as any }))}
                  className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2.5 text-sm text-[#d1d7db] focus:outline-none focus:border-indigo-500 transition-all"
                >
                  <option value="operator">Operador (Apenas executa rotinas)</option>
                  <option value="manager">Gerente de Unidade (Visualiza rotinas de filiais específicas)</option>
                  <option value="company_admin">Administrador (Acesso total)</option>
                </select>
              </div>

              {/* Cargo Operacional */}
              <div>
                <label className="block text-xs font-medium text-[#8696a0] mb-1">Cargo Operacional (Escala de Trabalho)</label>
                <select
                  value={editingUser.cargo_id || ''}
                  onChange={e => setEditingUser(p => ({ ...p, cargo_id: e.target.value || null }))}
                  className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2.5 text-sm text-[#d1d7db] focus:outline-none focus:border-indigo-500 transition-all font-semibold"
                >
                  <option value="">Não Definido / Nenhum (Sem Cargo)</option>
                  {cargos.map(cargo => (
                    <option key={cargo.id} value={cargo.id}>
                      👔 {cargo.name} ({cargo.start_time?.slice(0, 5)} - {cargo.end_time?.slice(0, 5)})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-[#8696a0] block mt-1">Define os dias, horários e pausas em que o colaborador está de escala.</span>

                {/* Card Explicativo de Preview do Cargo Selecionado */}
                {editingUser.cargo_id && (() => {
                  const selectedCargo = cargos.find(c => c.id === editingUser.cargo_id);
                  if (!selectedCargo) return null;
                  const hours = calculateCargoHours(selectedCargo);

                  return (
                    <div className="mt-2.5 bg-[#111b21] border border-indigo-500/30 rounded-2xl p-3 space-y-2 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Briefcase size={14} className="text-indigo-400" />
                          {selectedCargo.name}
                        </span>
                        <div className="flex gap-1">
                          {(selectedCargo.shifts && selectedCargo.shifts.length > 0 ? selectedCargo.shifts : selectedCargo.shift_period ? [selectedCargo.shift_period] : []).map((s, idx) => (
                            <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              {s === 'cafe' ? '☕ Café' : s === 'almoco' ? '🍱 Almoço' : s === 'jantar' ? '🌙 Jantar' : s}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="text-[11px] text-[#8696a0] space-y-1 pt-1 border-t border-[#2a3942]/50">
                        <p className="flex justify-between">
                          <span>Jornada Diária:</span>
                          <span className="text-white font-medium">{selectedCargo.start_time?.slice(0, 5)} - {selectedCargo.end_time?.slice(0, 5)} ({hours.formattedDaily} líq.)</span>
                        </p>
                        <p className="flex justify-between">
                          <span>Dias da Semana:</span>
                          <span className="text-[#d1d7db] font-medium">
                            {selectedCargo.work_days && selectedCargo.work_days.length > 0
                              ? selectedCargo.work_days.map(d => DAYS_OF_WEEK.find(day => day.key === d)?.short).filter(Boolean).join(', ')
                              : 'Sem dias definidos'}
                          </span>
                        </p>
                        {selectedCargo.breaks && selectedCargo.breaks.length > 0 && (
                          <p className="flex justify-between">
                            <span>Pausas/Intervalos:</span>
                            <span className="text-amber-300 font-medium">
                              {selectedCargo.breaks.map(b => `${b.title || 'Pausa'}: ${b.start_time?.slice(0, 5)}-${b.end_time?.slice(0, 5)}`).join(' | ')}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Permissões de Filiais */}
              <div>
                <label className="block text-xs font-medium text-[#8696a0] mb-1.5">Vincular a Filiais Operacionais *</label>
                <div className="bg-[#111b21] rounded-2xl border border-[#2a3942]/60 p-3 max-h-[140px] overflow-y-auto styled-scrollbar space-y-2">
                  {units.map(unit => {
                    const isChecked = editingUser.unit_permissions?.includes(unit.id) || false;
                    return (
                      <label key={unit.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const currentPerms = editingUser.unit_permissions || [];
                            const newPerms = isChecked 
                              ? currentPerms.filter(id => id !== unit.id)
                              : [...currentPerms, unit.id];
                            setEditingUser(p => ({ ...p, unit_permissions: newPerms }));
                          }}
                          className="rounded border-[#2a3942] text-indigo-600 focus:ring-0 bg-transparent"
                        />
                        <span className="text-xs text-slate-300">{unit.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Permissões de Setores */}
              <div>
                <label className="block text-xs font-medium text-[#8696a0] mb-1.5">Setores de Atuação (Se aplicável)</label>
                <div className="bg-[#111b21] rounded-2xl border border-[#2a3942]/60 p-3 max-h-[140px] overflow-y-auto styled-scrollbar space-y-2">
                  {sectors.map(sector => {
                    const isChecked = editingUser.sector_permissions?.includes(sector.id) || false;
                    const parentUnit = units.find(u => u.id === sector.unit_id);
                    return (
                      <label key={sector.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const currentPerms = editingUser.sector_permissions || [];
                            const newPerms = isChecked
                              ? currentPerms.filter(id => id !== sector.id)
                              : [...currentPerms, sector.id];
                            setEditingUser(p => ({ ...p, sector_permissions: newPerms }));
                          }}
                          className="rounded border-[#2a3942] text-indigo-600 focus:ring-0 bg-transparent"
                        />
                        <span className="text-xs text-slate-300">
                          {sector.name} <span className="text-[10px] text-[#8696a0]">({parentUnit?.name})</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-[#2a3942]/40">
                <button
                  onClick={saveUser}
                  disabled={saving}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {saving ? 'Salvando...' : 'Salvar Permissões'}
                </button>
                <button
                  onClick={() => setEditingUser(null)}
                  className="bg-[#2a3942] hover:bg-[#3b4a54] text-[#d1d7db] px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA: CARGOS */}
      {activeTab === 'cargos' && (
        <div className={`grid grid-cols-1 ${editingCargo ? 'lg:grid-cols-3' : 'grid-cols-1'} gap-6 items-start animate-in fade-in duration-200`}>
          
              {/* Listagem dos Cargos */}
          <div className={`${editingCargo ? 'lg:col-span-2' : 'col-span-1'} space-y-4`}>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-[#e9edef]">Lista de Cargos Operacionais</h2>
              {!editingCargo && (
                <button
                  onClick={() => setEditingCargo({ 
                    name: '', 
                    start_time: '08:00', 
                    end_time: '18:00', 
                    shifts: ['almoco'],
                    breaks: [{ id: Date.now().toString(), title: 'Almoço', start_time: '14:00', end_time: '15:00' }],
                    work_days: ['seg', 'ter', 'qua', 'qui', 'sex'] 
                  })}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-lg shadow-indigo-500/10 active:scale-95"
                >
                  <Plus size={14} /> Novo Cargo
                </button>
              )}
            </div>

            {loading ? (
              <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/50 rounded-3xl border border-[#2a3942]/40 animate-pulse">
                Carregando cargos...
              </div>
            ) : cargos.length === 0 ? (
              <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/40 rounded-3xl border border-dashed border-[#2a3942]/60">
                Nenhum cargo cadastrado. Adicione um cargo para organizar a escala da sua equipe.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cargos.map((cargo) => (
                  <div
                    key={cargo.id}
                    className={`bg-[#202c33]/80 rounded-[28px] border p-5 transition-all flex flex-col justify-between ${editingCargo?.id === cargo.id ? 'border-indigo-500 shadow-indigo-500/10 shadow-lg' : 'border-[#2a3942]/60 hover:shadow-md'}`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-white text-base truncate flex items-center gap-1.5">
                            <Briefcase size={16} className="text-indigo-400 shrink-0" />
                            {cargo.name}
                          </h3>
                        </div>
                        <div className="flex flex-wrap gap-1 justify-end shrink-0">
                          {(cargo.shifts && cargo.shifts.length > 0 ? cargo.shifts : cargo.shift_period ? [cargo.shift_period] : []).map((s, idx) => (
                            <span key={idx} className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                              s === 'cafe' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                              s === 'almoco' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                              s === 'jantar' ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' :
                              'bg-slate-500/10 text-slate-300 border-slate-500/20'
                            }`}>
                              {s === 'cafe' ? '☕ Café' : s === 'almoco' ? '🍱 Almoço' : s === 'jantar' ? '🌙 Jantar' : s}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#2a3942]/30 space-y-2 text-xs text-[#8696a0]">
                        <p className="flex items-center gap-1.5">
                          <Clock size={13} className="text-slate-400 shrink-0" />
                          Escala: <span className="text-[#d1d7db] font-medium">{cargo.start_time?.slice(0, 5)} - {cargo.end_time?.slice(0, 5)}</span>
                        </p>

                        {/* Exibição dos Intervalos Múltiplos */}
                        {(cargo.breaks && cargo.breaks.length > 0) ? (
                          <div className="space-y-1 pt-1">
                            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">Intervalos / Pausas ({cargo.breaks.length}):</span>
                            <div className="flex flex-wrap gap-1.5">
                              {cargo.breaks.map((b, idx) => (
                                <span key={idx} className="text-[10px] text-amber-200 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 font-semibold">
                                  ⏸️ {b.title || 'Pausa'}: {b.start_time?.slice(0, 5)} - {b.end_time?.slice(0, 5)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : cargo.break_start_time && cargo.break_end_time ? (
                          <p className="flex items-center gap-1.5 text-amber-300/90 font-medium">
                            <Clock size={13} className="text-amber-400 shrink-0" />
                            Intervalo: <span className="text-amber-200 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold">{cargo.break_start_time.slice(0, 5)} - {cargo.break_end_time.slice(0, 5)}</span>
                          </p>
                        ) : (
                          <p className="flex items-center gap-1.5 text-slate-500 italic">
                            <Clock size={13} className="text-slate-600 shrink-0" />
                            Sem intervalos configurados
                          </p>
                        )}

                        <p className="flex items-start gap-1.5">
                          <Calendar size={13} className="text-slate-400 mt-0.5 shrink-0" />
                          <span>
                            Dias: <span className="text-[#d1d7db] font-medium">
                              {cargo.work_days && cargo.work_days.length > 0 
                                ? cargo.work_days.map(d => DAYS_OF_WEEK.find(day => day.key === d)?.short).filter(Boolean).join(', ')
                                : 'Sem dias definidos'}
                            </span>
                          </span>
                        </p>

                        {/* Estatísticas de Carga Horária & Saldo CLT */}
                        {(() => {
                          const hours = calculateCargoHours(cargo);
                          return (
                            <div className="mt-3 pt-3 border-t border-[#2a3942]/30 space-y-2">
                              <div className="grid grid-cols-3 gap-2 text-center">
                                {/* Diária */}
                                <div className="bg-black/20 border border-[#2a3942]/40 rounded-xl p-2 flex flex-col justify-between">
                                  <span className="text-[9px] text-[#64748b] font-bold uppercase tracking-wider block">Diária (Líq.)</span>
                                  <span className="text-xs text-emerald-400 font-extrabold my-0.5">{hours.formattedDaily}</span>
                                  {hours.dailyDeltaText && (
                                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                                      hours.dailyIsOvertime 
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                        : 'bg-indigo-500/20 text-indigo-300'
                                    }`}>
                                      {hours.dailyDeltaText}
                                    </span>
                                  )}
                                </div>

                                {/* Semanal */}
                                <div className="bg-black/20 border border-[#2a3942]/40 rounded-xl p-2 flex flex-col justify-between">
                                  <span className="text-[9px] text-[#64748b] font-bold uppercase tracking-wider block">Semanal</span>
                                  <span className="text-xs text-indigo-300 font-extrabold my-0.5">{hours.formattedWeekly}</span>
                                  {hours.weeklyDeltaText && (
                                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                                      hours.weeklyIsOvertime 
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                        : 'bg-indigo-500/20 text-indigo-300'
                                    }`}>
                                      {hours.weeklyDeltaText}
                                    </span>
                                  )}
                                </div>

                                {/* Mensal */}
                                <div className="bg-black/20 border border-[#2a3942]/40 rounded-xl p-2 flex flex-col justify-between">
                                  <span className="text-[9px] text-[#64748b] font-bold uppercase tracking-wider block">Mensal</span>
                                  <span className="text-xs text-amber-300 font-extrabold my-0.5">{hours.formattedMonthly}</span>
                                  {hours.monthlyDeltaText && (
                                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                                      hours.monthlyIsOvertime 
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                        : 'bg-emerald-500/20 text-emerald-300'
                                    }`}>
                                      {hours.monthlyDeltaText}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Exibição Salarial */}
                              {hours.salary > 0 && (
                                <div className="bg-[#111b21]/70 border border-[#2a3942]/50 rounded-xl p-2 flex items-center justify-between text-xs">
                                  <div>
                                    <span className="text-[10px] text-[#8696a0] block">Salário Base:</span>
                                    <span className="font-bold text-white">R$ {hours.salary.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                  <div 
                                    onClick={() => setCalculationDetailsCargo(cargo)}
                                    className="text-right cursor-pointer hover:bg-emerald-500/5 px-2 py-0.5 rounded-lg border border-transparent hover:border-emerald-500/10 transition-all group flex flex-col items-end select-none"
                                    title="Clique para entender o cálculo do custo projetado"
                                  >
                                    <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1 group-hover:text-amber-300">
                                      Custo Projetado (c/ HE) <HelpCircle size={10} className="text-[#8696a0] group-hover:text-emerald-400 transition-colors shrink-0" />
                                    </span>
                                    <span className="font-extrabold text-emerald-400 group-hover:text-emerald-300">R$ {hours.totalEstimatedSalary.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-4 border-t border-[#2a3942]/40">
                      <button
                        onClick={() => setEditingCargo(cargo)}
                        className="flex-1 bg-[#2a3942] hover:bg-[#3b4a54] text-[#d1d7db] text-xs font-semibold py-2 rounded-xl flex items-center justify-center gap-1 transition-all"
                      >
                        <Edit2 size={12} /> Editar
                      </button>
                      <button
                        onClick={() => deleteCargo(cargo.id)}
                        className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold px-3 py-2 rounded-xl transition-all border border-rose-500/10"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Painel Lateral de Formulário */}
          {editingCargo && (
            <div className="bg-[#202c33]/85 backdrop-blur-md rounded-[32px] border border-black/5 dark:border-white/5 p-6 shadow-xl animate-in slide-in-from-right-4 duration-300">
              <div className="flex justify-between items-center border-b border-[#2a3942]/60 pb-3 mb-4">
                <h3 className="font-semibold text-white text-md flex items-center gap-1.5">
                  <Briefcase size={16} className="text-indigo-400" />
                  {editingCargo.id ? 'Editar Cargo' : 'Novo Cargo'}
                </h3>
                <button onClick={() => setEditingCargo(null)} className="p-1 hover:bg-white/10 rounded-lg text-[#8696a0]">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Nome */}
                <div>
                  <label className="block text-xs font-medium text-[#8696a0] mb-1">Nome do Cargo *</label>
                  <input
                    type="text"
                    value={editingCargo.name || ''}
                    onChange={e => setEditingCargo(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ex: Garçom, Cozinheiro, Recepcionista"
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                {/* Pré-definição de Múltiplos Turnos */}
                <div>
                  <label className="block text-xs font-medium text-[#8696a0] mb-1.5">Turnos Operacionais (Multi-seleção)</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const currentShifts = editingCargo.shifts || (editingCargo.shift_period ? [editingCargo.shift_period] : []);
                        const has = currentShifts.includes('cafe');
                        const next = has ? currentShifts.filter(s => s !== 'cafe') : [...currentShifts, 'cafe'];
                        
                        let start = editingCargo.start_time || '07:30';
                        let end = editingCargo.end_time || '11:00';
                        if (next.includes('cafe')) start = '07:30';
                        else if (next.includes('almoco')) start = '11:00';
                        else if (next.includes('jantar')) start = '17:00';

                        if (next.includes('jantar')) end = '23:00';
                        else if (next.includes('almoco')) end = '17:00';
                        else if (next.includes('cafe')) end = '11:00';

                        setEditingCargo(p => ({
                          ...p,
                          shifts: next,
                          shift_period: next[0] || 'custom',
                          start_time: start,
                          end_time: end
                        }));
                      }}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        (editingCargo.shifts || []).includes('cafe') || editingCargo.shift_period === 'cafe'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/10'
                          : 'bg-[#111b21] text-[#8696a0] border-[#2a3942] hover:text-[#d1d7db]'
                      }`}
                    >
                      ☕ Café
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const currentShifts = editingCargo.shifts || (editingCargo.shift_period ? [editingCargo.shift_period] : []);
                        const has = currentShifts.includes('almoco');
                        const next = has ? currentShifts.filter(s => s !== 'almoco') : [...currentShifts, 'almoco'];

                        let start = editingCargo.start_time || '11:00';
                        let end = editingCargo.end_time || '17:00';
                        if (next.includes('cafe')) start = '07:30';
                        else if (next.includes('almoco')) start = '11:00';
                        else if (next.includes('jantar')) start = '17:00';

                        if (next.includes('jantar')) end = '23:00';
                        else if (next.includes('almoco')) end = '17:00';
                        else if (next.includes('cafe')) end = '11:00';

                        setEditingCargo(p => ({
                          ...p,
                          shifts: next,
                          shift_period: next[0] || 'custom',
                          start_time: start,
                          end_time: end
                        }));
                      }}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        (editingCargo.shifts || []).includes('almoco') || editingCargo.shift_period === 'almoco'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-500/10'
                          : 'bg-[#111b21] text-[#8696a0] border-[#2a3942] hover:text-[#d1d7db]'
                      }`}
                    >
                      🍱 Almoço
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const currentShifts = editingCargo.shifts || (editingCargo.shift_period ? [editingCargo.shift_period] : []);
                        const has = currentShifts.includes('jantar');
                        const next = has ? currentShifts.filter(s => s !== 'jantar') : [...currentShifts, 'jantar'];

                        let start = editingCargo.start_time || '17:00';
                        let end = editingCargo.end_time || '23:00';
                        if (next.includes('cafe')) start = '07:30';
                        else if (next.includes('almoco')) start = '11:00';
                        else if (next.includes('jantar')) start = '17:00';

                        if (next.includes('jantar')) end = '23:00';
                        else if (next.includes('almoco')) end = '17:00';
                        else if (next.includes('cafe')) end = '11:00';

                        setEditingCargo(p => ({
                          ...p,
                          shifts: next,
                          shift_period: next[0] || 'custom',
                          start_time: start,
                          end_time: end
                        }));
                      }}
                      className={`px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        (editingCargo.shifts || []).includes('jantar') || editingCargo.shift_period === 'jantar'
                          ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-sm shadow-indigo-500/10'
                          : 'bg-[#111b21] text-[#8696a0] border-[#2a3942] hover:text-[#d1d7db]'
                      }`}
                    >
                      🌙 Jantar
                    </button>
                  </div>
                </div>

                {/* Horários da Escala */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#8696a0] mb-1">Entrada *</label>
                    <input
                      type="time"
                      value={editingCargo.start_time || '08:00'}
                      onChange={e => setEditingCargo(p => ({ ...p, start_time: e.target.value }))}
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#8696a0] mb-1">Saída *</label>
                    <input
                      type="time"
                      value={editingCargo.end_time || '18:00'}
                      onChange={e => setEditingCargo(p => ({ ...p, end_time: e.target.value }))}
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>

                {/* Horários de Intervalo / Pausas Dinâmicos */}
                <div className="bg-[#111b21]/90 rounded-2xl border border-[#2a3942] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#d1d7db] flex items-center gap-1.5">
                      <Clock size={13} className="text-amber-400" />
                      Horários de Intervalo / Pausas
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const currentBreaks = editingCargo.breaks || [];
                        const defaultTitle = currentBreaks.length === 0 ? 'Almoço' : currentBreaks.length === 1 ? 'Café' : `Pausa ${currentBreaks.length + 1}`;
                        const newBreak: CargoBreak = {
                          id: Date.now().toString(),
                          title: defaultTitle,
                          start_time: '14:00',
                          end_time: '15:00'
                        };
                        setEditingCargo(p => ({ ...p, breaks: [...currentBreaks, newBreak] }));
                      }}
                      className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-500/20 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={12} /> + Adicionar Intervalo
                    </button>
                  </div>
                  <p className="text-[11px] text-[#8696a0] leading-snug">
                    Defina uma ou mais pausas no turno (ex: Almoço 14h-15h e Café 17h30-17h45).
                  </p>

                  {(!editingCargo.breaks || editingCargo.breaks.length === 0) ? (
                    <div className="p-3 text-center text-[11px] text-[#8696a0] border border-dashed border-[#2a3942] rounded-xl">
                      Nenhum intervalo cadastrado. Clique em "+ Adicionar Intervalo" acima.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                      {editingCargo.breaks.map((b, idx) => (
                        <div key={b.id || idx} className="bg-[#202c33] border border-[#2a3942] rounded-xl p-2.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              value={b.title || ''}
                              onChange={e => {
                                const val = e.target.value;
                                setEditingCargo(p => {
                                  const list = [...(p.breaks || [])];
                                  list[idx] = { ...list[idx], title: val };
                                  return { ...p, breaks: list };
                                });
                              }}
                              placeholder="Nome (ex: Almoço, Pausa)"
                              className="bg-[#111b21] border border-[#2a3942] rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 w-full"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCargo(p => ({
                                  ...p,
                                  breaks: (p.breaks || []).filter((_, i) => i !== idx)
                                }));
                              }}
                              className="p-1 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-all shrink-0 cursor-pointer"
                              title="Remover intervalo"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] text-[#8696a0] mb-0.5">Início</label>
                              <input
                                type="time"
                                value={b.start_time || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setEditingCargo(p => {
                                    const list = [...(p.breaks || [])];
                                    list[idx] = { ...list[idx], start_time: val };
                                    return { ...p, breaks: list };
                                  });
                                }}
                                className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-[#8696a0] mb-0.5">Fim</label>
                              <input
                                type="time"
                                value={b.end_time || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setEditingCargo(p => {
                                    const list = [...(p.breaks || [])];
                                    list[idx] = { ...list[idx], end_time: val };
                                    return { ...p, breaks: list };
                                  });
                                }}
                                className="w-full bg-[#111b21] border border-[#2a3942] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dias Trabalhados */}
                <div>
                  <label className="block text-xs font-medium text-[#8696a0] mb-2">Dias Trabalhados (Escala)</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map(day => {
                      const isSelected = editingCargo.work_days?.includes(day.key) || false;
                      return (
                        <button
                          type="button"
                          key={day.key}
                          onClick={() => {
                            const currentDays = editingCargo.work_days || [];
                            const newDays = isSelected
                              ? currentDays.filter(d => d !== day.key)
                              : [...currentDays, day.key];
                            setEditingCargo(prev => ({ ...prev, work_days: newDays }));
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                            isSelected 
                              ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/15' 
                              : 'bg-[#111b21] border-[#2a3942] text-[#8696a0] hover:text-[#d1d7db]'
                          }`}
                        >
                          {day.short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Salário Base Mensal (R$) */}
                <div>
                  <label className="block text-xs font-medium text-[#8696a0] mb-1">Salário Base Mensal (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-[#8696a0] font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editingCargo.salary ?? ''}
                      onChange={e => {
                        const val = e.target.value === '' ? null : parseFloat(e.target.value);
                        setEditingCargo(p => ({ ...p, salary: val }));
                      }}
                      placeholder="Ex: 3500.00"
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all font-semibold"
                    />
                  </div>
                </div>

                {/* Banner de Carga Horária & Previsão CLT / Financeira */}
                {(() => {
                  const hours = calculateCargoHours(editingCargo);
                  return (
                    <div className="bg-[#111b21] border border-[#2a3942] rounded-2xl p-3.5 space-y-3 shadow-md">
                      <div className="text-[11px] font-bold text-[#d1d7db] flex items-center justify-between border-b border-[#2a3942]/60 pb-2">
                        <span>Análise CLT & Banco de Horas</span>
                        <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Teto CLT: 44h/sem (220h/mês)</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-[#202c33] border border-[#2a3942] rounded-xl p-2">
                          <span className="text-[9px] text-[#8696a0] font-bold uppercase block">Diária Líq.</span>
                          <span className="text-xs text-emerald-400 font-extrabold block my-0.5">{hours.formattedDaily}</span>
                          {hours.dailyDeltaText && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded block ${
                              hours.dailyIsOvertime 
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                : 'bg-indigo-500/20 text-indigo-300'
                            }`}>
                              {hours.dailyDeltaText}
                            </span>
                          )}
                        </div>

                        <div className="bg-[#202c33] border border-[#2a3942] rounded-xl p-2">
                          <span className="text-[9px] text-[#8696a0] font-bold uppercase block">Semanal</span>
                          <span className="text-xs text-indigo-300 font-extrabold block my-0.5">{hours.formattedWeekly}</span>
                          {hours.weeklyDeltaText && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded block ${
                              hours.weeklyIsOvertime 
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                : 'bg-indigo-500/20 text-indigo-300'
                            }`}>
                              {hours.weeklyDeltaText}
                            </span>
                          )}
                        </div>

                        <div className="bg-[#202c33] border border-[#2a3942] rounded-xl p-2">
                          <span className="text-[9px] text-[#8696a0] font-bold uppercase block">Mensal</span>
                          <span className="text-xs text-amber-300 font-extrabold block my-0.5">{hours.formattedMonthly}</span>
                          {hours.monthlyDeltaText && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded block ${
                              hours.monthlyIsOvertime 
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}>
                              {hours.monthlyDeltaText}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Estimativa de Custos Salariais e H.E. */}
                      {hours.salary > 0 && (
                        <div className="pt-2 border-t border-[#2a3942]/60 text-xs space-y-1.5">
                          <div className="flex justify-between text-[#8696a0]">
                            <span>Hora Normal (220h):</span>
                            <span className="font-semibold text-white">R$ {hours.hourlyRate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/h</span>
                          </div>
                          {hours.monthlyOvertimeCost > 0 && (
                            <div className="flex justify-between text-amber-300">
                              <span>Adicional H.E. (50% CLT):</span>
                              <span className="font-bold">+ R$ {hours.monthlyOvertimeCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mês</span>
                            </div>
                          )}
                          <div 
                            onClick={() => setCalculationDetailsCargo(editingCargo as Cargo)}
                            className="flex justify-between text-white font-extrabold pt-1 border-t border-[#2a3942]/40 text-xs cursor-pointer hover:bg-emerald-500/5 px-1 py-0.5 rounded transition-all group select-none"
                            title="Clique para entender o cálculo do custo projetado"
                          >
                            <span className="text-emerald-400 flex items-center gap-1 group-hover:text-emerald-300">
                              Custo Total Salarial <HelpCircle size={10} className="text-[#8696a0] group-hover:text-emerald-400 transition-colors shrink-0" />
                            </span>
                            <span className="text-emerald-400 group-hover:text-emerald-300">R$ {hours.totalEstimatedSalary.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="flex gap-2 pt-4 border-t border-[#2a3942]/40">
                  <button
                    onClick={saveCargo}
                    disabled={saving}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {saving ? 'Salvando...' : 'Salvar Cargo'}
                  </button>
                  <button
                    onClick={() => setEditingCargo(null)}
                    className="bg-[#2a3942] hover:bg-[#3b4a54] text-[#d1d7db] px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Modal de Detalhamento do Custo Projetado */}
      {calculationDetailsCargo && (() => {
        const hours = calculateCargoHours(calculationDetailsCargo);
        const daysCount = (calculationDetailsCargo.work_days && calculationDetailsCargo.work_days.length > 0) ? calculationDetailsCargo.work_days.length : 5;
        const cltWeeklyStandardMinutes = 44 * 60;
        const monthlyDeltaHours = hours.monthlyHours - 220;

        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#202c33] border border-[#2a3942] rounded-[32px] max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-[#e9edef]">
              <div className="flex justify-between items-center border-b border-[#2a3942]/60 pb-3.5 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="bg-emerald-500/10 p-2 rounded-xl text-emerald-400 border border-emerald-500/20 shrink-0">
                    <Calculator size={18} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-sm truncate">Memória de Cálculo</h3>
                    <p className="text-[10px] text-[#8696a0] truncate">Cargo: {calculationDetailsCargo.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setCalculationDetailsCargo(null)} 
                  className="p-1.5 hover:bg-white/10 rounded-xl text-[#8696a0] transition-all shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                {/* 1. Jornada Diária */}
                <div className="bg-[#111b21]/60 p-3 rounded-2xl border border-[#2a3942]/40">
                  <span className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider block mb-1">1. Jornada Diária</span>
                  <div className="flex justify-between font-medium text-[11px] text-white">
                    <span>Horário da Escala:</span>
                    <span>{calculationDetailsCargo.start_time} às {calculationDetailsCargo.end_time}</span>
                  </div>
                  {hours.dailyHours > 0 && (
                    <div className="mt-1 flex justify-between text-[#8696a0] text-[11px]">
                      <span>Horas líquidas (descontando pausas):</span>
                      <span className="text-indigo-400 font-semibold">{hours.formattedDaily} / dia</span>
                    </div>
                  )}
                </div>

                {/* 2. Jornada Semanal e Mensal */}
                <div className="bg-[#111b21]/60 p-3 rounded-2xl border border-[#2a3942]/40">
                  <span className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider block mb-1">2. Jornada Semanal & Mensal</span>
                  <div className="space-y-1.5 mt-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#8696a0]">Semanal:</span>
                      <span className="text-white font-medium">{hours.formattedWeekly} ({daysCount} dias/semana)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8696a0]">Mensal (Semanal × 4.333 semanas):</span>
                      <span className="text-white font-medium">{hours.formattedMonthly}</span>
                    </div>
                    {monthlyDeltaHours > 0 && (
                      <div className="flex justify-between text-amber-400 font-semibold border-t border-[#2a3942]/30 pt-1.5 mt-1">
                        <span>Excedente CLT (Mensal - 220h CLT):</span>
                        <span>+ {Math.round(monthlyDeltaHours * 100) / 100}h Extras / mês</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Cálculo de Custo Financeiro */}
                <div className="bg-[#111b21]/60 p-3 rounded-2xl border border-[#2a3942]/40">
                  <span className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider block mb-1">3. Cálculo de Custo Financeiro</span>
                  <div className="space-y-1.5 mt-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#8696a0]">Salário Base CLT:</span>
                      <span className="text-white font-semibold">R$ {hours.salary.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8696a0]">Valor Hora CLT (Salário ÷ 220h):</span>
                      <span className="text-white font-medium">R$ {hours.hourlyRate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/h</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8696a0]">Valor Hora Extra CLT (+50%):</span>
                      <span className="text-amber-400 font-medium">R$ {(hours.hourlyRate * 1.5).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/h</span>
                    </div>
                    {monthlyDeltaHours > 0 && (
                      <div className="flex justify-between text-amber-300 border-t border-[#2a3942]/30 pt-1.5 mt-1">
                        <span>Custo de H.E. ({Math.round(monthlyDeltaHours * 100) / 100}h × R$ {(hours.hourlyRate * 1.5).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}):</span>
                        <span className="font-semibold">+ R$ {hours.monthlyOvertimeCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Resultado Final */}
                <div className="bg-emerald-500/5 p-3.5 rounded-2xl border border-emerald-500/20 mt-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">Custo Total Projetado</span>
                    <span className="text-[10px] text-[#8696a0]">Salário Base + Adicional de H.E.</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-emerald-400">R$ {hours.totalEstimatedSalary.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <button
                  onClick={() => setCalculationDetailsCargo(null)}
                  className="w-full bg-[#2a3942] hover:bg-[#3b4a54] text-white font-semibold py-2.5 rounded-xl transition-all cursor-pointer text-center text-xs"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
