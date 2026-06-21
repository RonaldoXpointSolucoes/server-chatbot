import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
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
  AlertTriangle 
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
}

export default function ChecklistSettings() {
  const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
  
  // Estados de Abas
  const [activeTab, setActiveTab] = useState<'units' | 'sectors' | 'users'>('units');
  
  // Listas de Dados
  const [units, setUnits] = useState<Unit[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados de Formulários / Modais
  const [editingUnit, setEditingUnit] = useState<Partial<Unit> | null>(null);
  const [editingSector, setEditingSector] = useState<Partial<Sector> | null>(null);
  const [editingUser, setEditingUser] = useState<Partial<Profile> | null>(null);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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

      // 3. Carregar Usuários Operacionais
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
        const { error } = await supabase
          .from('units')
          .update(payload)
          .eq('id', editingUnit.id);
        if (error) throw error;
        showToast('success', 'Unidade atualizada com sucesso!');
      } else {
        // Inserir
        const { error } = await supabase
          .from('units')
          .insert(payload);
        if (error) throw error;
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
      const { error } = await supabase.from('units').delete().eq('id', id);
      if (error) throw error;
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
        const { error } = await supabase
          .from('sectors')
          .update(payload)
          .eq('id', editingSector.id);
        if (error) throw error;
        showToast('success', 'Setor operacional atualizado!');
      } else {
        const { error } = await supabase
          .from('sectors')
          .insert(payload);
        if (error) throw error;
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
      const { error } = await supabase.from('sectors').delete().eq('id', id);
      if (error) throw error;
      showToast('success', 'Setor removido.');
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast('error', `Erro ao deletar: ${err.message}`);
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
        pin: editingUser.pin || '',
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
            pin: editingUser.pin || '',
            role: editingUser.role,
            is_active: editingUser.is_active ?? true
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
        <div className={`grid grid-cols-1 ${editingUser ? 'lg:grid-cols-3' : 'grid-cols-1'} gap-6 items-start animate-in fade-in duration-200`}>
          
          {/* Listagem de Colaboradores */}
          <div className={`${editingUser ? 'lg:col-span-2' : 'col-span-1'} space-y-4`}>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-[#e9edef]">Lista da Equipe Operacional</h2>
              <div className="text-[11px] text-[#8696a0] max-w-[60%] text-right bg-[#202c33]/30 px-3 py-1.5 rounded-xl border border-[#2a3942]/30">
                ✏️ Administre cargos, PINs de acesso rápido no tablet e vincule filiais/setores de atuação.
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/50 rounded-3xl border border-[#2a3942]/40">
                Carregando membros da equipe...
              </div>
            ) : users.length === 0 ? (
              <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/40 rounded-3xl border border-dashed border-[#2a3942]/60">
                Nenhum colaborador encontrado. Eles devem ser vinculados via Supabase Auth primeiro.
              </div>
            ) : (
              <div className={`grid grid-cols-1 md:grid-cols-2 ${editingUser ? '' : 'lg:grid-cols-3 xl:grid-cols-4'} gap-4`}>
                {users.map((user) => (
                  <div 
                    key={user.id}
                    className={`bg-[#202c33]/80 rounded-[28px] border p-5 transition-all relative flex flex-col justify-between ${editingUser?.id === user.id ? 'border-indigo-500 shadow-indigo-500/10 shadow-lg' : 'border-[#2a3942]/60 hover:shadow-md'}`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-white text-base truncate">{user.name}</h3>
                          <p className="text-xs text-[#8696a0] truncate">{user.email}</p>
                        </div>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                          user.role === 'company_admin' || user.role === 'super_admin' ? 'bg-indigo-500/20 text-indigo-400' :
                          user.role === 'manager' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-300'
                        }`}>
                          {user.role === 'company_admin' ? 'Admin' :
                           user.role === 'manager' ? 'Gerente' : 'Operador'}
                        </span>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#2a3942]/30 space-y-1.5 text-xs text-[#8696a0]">
                        <p className="flex items-center gap-1.5">
                          <KeyRound size={13} className="text-slate-400" />
                          PIN de Acesso Rápido: <span className="font-mono font-bold text-white tracking-widest">{user.pin || 'Não Definido'}</span>
                        </p>
                        <p className="flex items-center gap-1.5 truncate">
                          <Building2 size={13} className="text-slate-400" />
                          Filiais: <span className="text-[#d1d7db]">{
                            user.unit_permissions && user.unit_permissions.length > 0 
                              ? user.unit_permissions.map(uId => units.find(un => un.id === uId)?.name).filter(Boolean).join(', ')
                              : 'Sem Filial'
                          }</span>
                        </p>
                        <p className="flex items-center gap-1.5 truncate">
                          <Building2 size={13} className="text-slate-400" />
                          Setores: <span className="text-[#d1d7db]">{
                            user.sector_permissions && user.sector_permissions.length > 0
                              ? user.sector_permissions.map(sId => sectors.find(se => se.id === sId)?.name).filter(Boolean).join(', ')
                              : 'Todos/Nenhum'
                          }</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-4 border-t border-[#2a3942]/40">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="flex-1 bg-[#2a3942] hover:bg-[#3b4a54] text-[#d1d7db] text-xs font-semibold py-2 rounded-xl flex items-center justify-center gap-1 transition-all"
                      >
                        <Edit2 size={12} /> Configurar Acessos
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Painel de Configurações de Acesso do Usuário */}
          {editingUser && (
            <div className="bg-[#202c33]/85 backdrop-blur-md rounded-[32px] border border-black/5 dark:border-white/5 p-6 shadow-xl animate-in slide-in-from-right-4 duration-300">
              <div className="flex justify-between items-center border-b border-[#2a3942]/60 pb-3 mb-4">
                <h3 className="font-semibold text-white text-md flex items-center gap-1.5">
                  <Shield size={16} className="text-indigo-400" />
                  Gerenciar Permissões
                </h3>
                <button onClick={() => setEditingUser(null)} className="p-1 hover:bg-white/10 rounded-lg text-[#8696a0]">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Nome / Email (Somente leitura para evitar quebra no Auth) */}
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
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2.5 text-sm text-white tracking-widest font-mono focus:outline-none focus:border-indigo-500 transition-all text-center"
                  />
                  <span className="text-[10px] text-[#8696a0] block mt-1">Usado para troca rápida de operadores em tablets fixos na cozinha.</span>
                </div>

                {/* Cargo */}
                <div>
                  <label className="block text-xs font-medium text-[#8696a0] mb-1">Perfil de Cargo *</label>
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

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={saveUser}
                    disabled={saving}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {saving ? 'Salvando...' : 'Salvar Permissões'}
                  </button>
                  <button
                    onClick={() => setEditingUser(null)}
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

    </div>
  );
}
