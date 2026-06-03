import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { 
  BarChart3, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Users, 
  MapPin, 
  Camera, 
  Search, 
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
  Download,
  Shield,
  ClipboardList,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  CheckCheck
} from 'lucide-react';

interface KPIStats {
  expected: number;
  completedOnTime: number;
  completedLate: number;
  missed: number;
  inProgress: number;
  completionRate: number;
  criticalAlerts: number;
}

interface ExecutionDetail {
  id: string;
  checklist_title: string;
  category: string;
  operator_name: string;
  unit_name: string;
  sector_name: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  status: string;
  score: number | null;
  distance_calculated: number | null;
  responses: any[];
}

export default function ChecklistDashboard() {
  const { showMainSidebar, setShowMainSidebar } = (useOutletContext() as { showMainSidebar: boolean, setShowMainSidebar: (v: boolean) => void }) || { showMainSidebar: true, setShowMainSidebar: () => {} };
  const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');

  // Estados Principais
  const [stats, setStats] = useState<KPIStats>({
    expected: 0,
    completedOnTime: 0,
    completedLate: 0,
    missed: 0,
    inProgress: 0,
    completionRate: 0,
    criticalAlerts: 0
  });

  const [executions, setExecutions] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [selectedUnit, setSelectedUnit] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [units, setUnits] = useState<any[]>([]);

  // Detalhamento de Execução Ativa (Modal Premium)
  const [selectedExecDetail, setSelectedExecDetail] = useState<ExecutionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (tenantId) {
      loadUnits();
      loadDashboardData();

      // ==========================================
      // ESCUTA EM TEMPO REAL (SUPABASE REALTIME)
      // ==========================================
      const execChannel = supabase.channel(`realtime_dashboard_execs_${tenantId}`)
        .on(
          'postgres_changes', 
          { event: '*', schema: 'public', table: 'checklist_executions', filter: `tenant_id=eq.${tenantId}` }, 
          () => {
            console.log('⚡ Atualização de execuções realtime recebida! Recarregando KPIs...');
            loadDashboardData();
          }
        )
        .subscribe();

      const alertsChannel = supabase.channel(`realtime_dashboard_alerts_${tenantId}`)
        .on(
          'postgres_changes', 
          { event: 'INSERT', schema: 'public', table: 'alerts', filter: `tenant_id=eq.${tenantId}` }, 
          (payload) => {
            console.log('🚨 Novo Alerta Crítico Realtime!', payload);
            loadDashboardData();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(execChannel);
        supabase.removeChannel(alertsChannel);
      };
    }
  }, [tenantId, selectedUnit, selectedPeriod]);

  const loadUnits = async () => {
    try {
      const { data } = await supabase.from('units').select('id, name').eq('tenant_id', tenantId);
      setUnits(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0,0,0,0);
      
      let periodFilter = todayStart.toISOString();

      if (selectedPeriod === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        periodFilter = weekAgo.toISOString();
      } else if (selectedPeriod === 'month') {
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        periodFilter = monthAgo.toISOString();
      }

      // 1. Carregar Execuções
      let queryExec = supabase
        .from('checklist_executions')
        .select(`
          id, started_at, completed_at, duration_seconds, status, score, distance_calculated,
          users_profiles(name),
          checklists(title, category, sectors(name, units(id, name)))
        `)
        .eq('tenant_id', tenantId)
        .gte('started_at', periodFilter)
        .order('started_at', { ascending: false });

      if (selectedUnit !== 'all') {
        queryExec = queryExec.eq('unit_id', selectedUnit);
      }

      const { data: execs, error: eErr } = await queryExec;
      if (eErr) throw eErr;

      // 2. Mapeia execuções para listagem
      const mappedExecs = (execs || []).map((ex: any) => {
        const checklist = ex.checklists;
        const sector = checklist?.sectors;
        const unit = sector?.units;

        return {
          id: ex.id,
          title: checklist?.title || 'Rotina Sem Nome',
          category: checklist?.category || 'Geral',
          operatorName: ex.users_profiles?.name || 'Operador',
          unitName: unit?.name || 'Geral',
          sectorName: sector?.name || 'Geral',
          startedAt: ex.started_at,
          completedAt: ex.completed_at,
          durationSeconds: ex.duration_seconds,
          status: ex.status,
          score: ex.score ? Math.round(ex.score) : null,
          distance: ex.distance_calculated
        };
      });

      setExecutions(mappedExecs);

      // 3. Carregar Alertas
      let queryAlerts = supabase
        .from('alerts')
        .select(`
          id, type, severity, title, message, status, created_at,
          users_profiles!user_id(name),
          units(name)
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (selectedUnit !== 'all') {
        queryAlerts = queryAlerts.eq('unit_id', selectedUnit);
      }

      const { data: alertsData } = await queryAlerts;
      setAlerts(alertsData || []);

      // 4. Calcular Estatísticas de KPIs
      const expected = mappedExecs.length + (selectedPeriod === 'today' ? 2 : 5); // Mock de agendamentos pendentes
      const completedOnTime = mappedExecs.filter(e => e.status === 'completed_on_time').length;
      const completedLate = mappedExecs.filter(e => e.status === 'completed_late').length;
      const inProgress = mappedExecs.filter(e => e.status === 'in_progress').length;
      const missed = mappedExecs.filter(e => e.status === 'missed').length;
      
      const totalCompleted = completedOnTime + completedLate;
      const completionRate = expected > 0 ? Math.round((totalCompleted / expected) * 100) : 100;

      setStats({
        expected,
        completedOnTime,
        completedLate,
        missed,
        inProgress,
        completionRate,
        criticalAlerts: alertsData?.length || 0
      });

      // 5. Ranking de Colaboradores
      let rankingQuery = supabase
        .from('score_events')
        .select(`
          user_id, points_earned,
          users_profiles(name, role)
        `)
        .eq('tenant_id', tenantId)
        .gte('created_at', periodFilter);

      if (selectedUnit !== 'all') {
        rankingQuery = rankingQuery.eq('unit_id', selectedUnit);
      }

      const { data: scoreData } = await rankingQuery;
      
      // Agrupa pontuação por usuário
      const rankGroups: Record<string, { name: string, role: string, scoreSum: number, count: number }> = {};
      (scoreData || []).forEach((row: any) => {
        const userId = row.user_id;
        const prof = row.users_profiles;
        if (!prof) return;

        if (!rankGroups[userId]) {
          rankGroups[userId] = {
            name: prof.name,
            role: prof.role,
            scoreSum: 0,
            count: 0
          };
        }
        rankGroups[userId].scoreSum += parseFloat(row.points_earned);
        rankGroups[userId].count += 1;
      });

      const finalRank = Object.values(rankGroups)
        .map(g => ({
          name: g.name,
          role: g.role === 'manager' ? 'Gerente' : 'Operador',
          averageScore: Math.round(g.scoreSum / g.count)
        }))
        .sort((a, b) => b.averageScore - a.averageScore)
        .slice(0, 5);

      setRanking(finalRank);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // CARREGAR DETALHAMENTO DE RESPOSTAS
  // ==========================================
  const handleOpenDetail = async (execId: string) => {
    setLoadingDetail(true);
    try {
      const { data: exec, error: exErr } = await supabase
        .from('checklist_executions')
        .select(`
          id, started_at, completed_at, duration_seconds, status, score, distance_calculated,
          users_profiles(name),
          checklists(title, category, sectors(name, units(id, name)))
        `)
        .eq('id', execId)
        .single();
      
      if (exErr) throw exErr;

      const { data: resps, error: rErr } = await supabase
        .from('checklist_item_responses')
        .select(`
          id, response_value, is_conforming, is_meta_ok, is_done, observation,
          checklist_items(title, response_type, require_evidence, is_critical)
        `)
        .eq('execution_id', execId);

      if (rErr) throw rErr;

      // Pega fotos das evidências
      const mappedResps = await Promise.all((resps || []).map(async (r: any) => {
        const { data: evs } = await supabase
          .from('checklist_evidences')
          .select('url')
          .eq('response_id', r.id);
        
        return {
          id: r.id,
          title: r.checklist_items?.title || 'Pergunta',
          type: r.checklist_items?.response_type || 'boolean',
          is_critical: r.checklist_items?.is_critical || false,
          value: r.response_value,
          isConforming: r.is_conforming,
          isMetaOk: r.is_meta_ok,
          observation: r.observation,
          photos: evs?.map(e => e.url) || []
        };
      }));

      const checklist = exec.checklists;
      const sector = checklist?.sectors;
      const unit = sector?.units;

      setSelectedExecDetail({
        id: exec.id,
        checklist_title: checklist?.title || 'Sem Roteiro',
        category: checklist?.category || 'Geral',
        operator_name: exec.users_profiles?.name || 'Operador',
        unit_name: unit?.name || 'Geral',
        sector_name: sector?.name || 'Geral',
        started_at: exec.started_at,
        completed_at: exec.completed_at,
        duration_seconds: exec.duration_seconds,
        status: exec.status,
        score: exec.score ? Math.round(exec.score) : null,
        distance_calculated: exec.distance_calculated,
        responses: mappedResps
      });

    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('alerts')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', alertId);
      
      if (error) throw error;
      loadDashboardData();
    } catch (e) {
      console.error('Erro ao resolver alerta:', e);
    }
  };

  // ==========================================
  // EXPORTAÇÃO RÁPIDA PDF (Simulado)
  // ==========================================
  const handleExportPDF = () => {
    window.print(); // Solução nativa premium para impressão/salvar PDF formatado
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#182229] dark:bg-[#0b141a] text-[#d1d7db] overflow-y-auto p-6 styled-scrollbar">
      
      {/* MODAL DETALHAMENTO DE EXECUÇÃO */}
      {selectedExecDetail && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-[#202c33] border border-[#2a3942] rounded-[40px] p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto styled-scrollbar shadow-2xl relative animate-in zoom-in-95 duration-300">
            <button onClick={() => setSelectedExecDetail(null)} className="absolute top-5 right-5 p-1.5 hover:bg-white/10 rounded-full text-[#8696a0]">
              <X size={18} />
            </button>

            {/* Cabeçalho */}
            <div className="border-b border-[#2a3942]/60 pb-4 mb-5">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-500/10 text-indigo-400">
                {selectedExecDetail.category}
              </span>
              <h3 className="font-black text-white text-lg mt-2">{selectedExecDetail.checklist_title}</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-xs text-[#8696a0]">
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase">Operador</span>
                  <span className="text-white font-semibold">{selectedExecDetail.operator_name}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase">Filial/Setor</span>
                  <span className="text-white font-semibold">{selectedExecDetail.unit_name} / {selectedExecDetail.sector_name}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase">Duração</span>
                  <span className="text-white font-semibold">{selectedExecDetail.duration_seconds ? `${Math.round(selectedExecDetail.duration_seconds / 60)} min` : 'Não Finalizado'}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase">Score Obtido</span>
                  <span className="text-emerald-400 font-bold text-sm">{selectedExecDetail.score !== null ? `${selectedExecDetail.score} / 100` : 'Pendente'}</span>
                </div>
              </div>
            </div>

            {/* Respostas */}
            <div className="space-y-4">
              <h4 className="font-bold text-white text-sm">Respostas do Preenchimento</h4>
              
              {selectedExecDetail.responses.map((resp, idx) => (
                <div 
                  key={resp.id}
                  className={`p-4 rounded-3xl border bg-[#111b21]/30 flex flex-col gap-2 ${
                    !resp.isConforming || !resp.isMetaOk ? 'border-rose-500/30 shadow-sm shadow-rose-500/5' : 'border-[#2a3942]/40'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <h5 className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <span className="text-[10px] font-bold font-mono text-[#8696a0] bg-black/20 w-4 h-4 flex items-center justify-center rounded-full shrink-0">
                          {idx + 1}
                        </span>
                        {resp.title}
                      </h5>
                    </div>
                    
                    {/* Badge de Resposta */}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      resp.isConforming && resp.isMetaOk ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      {resp.value}
                    </span>
                  </div>

                  {/* Evidências Fotográficas */}
                  {resp.photos && resp.photos.length > 0 && (
                    <div className="flex gap-2 pt-2 border-t border-[#2a3942]/20">
                      {resp.photos.map((url: string, pIdx: number) => (
                        <a key={pIdx} href={url} target="_blank" rel="noopener noreferrer" className="relative group overflow-hidden rounded-xl border border-[#2a3942]/40">
                          <img src={url} alt="Evidência" className="w-14 h-14 object-cover group-hover:scale-105 transition-all" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                            <Eye size={12} className="text-white" />
                          </div>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Observação */}
                  {resp.observation && (
                    <p className="text-[10px] text-amber-400 bg-amber-500/5 px-2.5 py-1.5 rounded-xl border border-amber-500/10 mt-1 italic">
                      Obs: {resp.observation}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Ações */}
            <div className="flex gap-2 border-t border-[#2a3942]/60 pt-5 mt-6">
              <button
                onClick={handleExportPDF}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-2xl flex items-center justify-center gap-1.5 text-xs transition-all shadow-md active:scale-[0.98]"
              >
                <Download size={14} /> Exportar Roteiro PDF
              </button>
              <button
                onClick={() => setSelectedExecDetail(null)}
                className="bg-[#2a3942] hover:bg-[#3b4a54] text-[#d1d7db] px-5 py-2.5 rounded-2xl text-xs font-semibold transition-all"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#2a3942]/60 pb-6 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#e9edef] tracking-tight flex items-center gap-2">
            <BarChart3 className="text-indigo-400 animate-pulse" />
            Dashboard Operacional Gastronômico
          </h1>
          <p className="text-sm text-[#8696a0] mt-1">
            Acompanhe em tempo real a execução das rotinas de abertura, fechamento e segurança alimentar.
          </p>
        </div>

        {/* Filtros de Unidade e Período */}
        <div className="flex flex-wrap gap-2.5">
          <select
            value={selectedUnit}
            onChange={e => setSelectedUnit(e.target.value)}
            className="bg-[#202c33] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-[#d1d7db] focus:outline-none"
          >
            <option value="all">Todas as Filiais</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          <div className="flex bg-[#202c33] p-1 rounded-xl border border-[#2a3942]">
            {(['today', 'week', 'month'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedPeriod === period ? 'bg-indigo-600 text-white shadow-sm' : 'text-[#8696a0] hover:text-[#d1d7db]'
                }`}
              >
                {period === 'today' ? 'Hoje' : period === 'week' ? '7 Dias' : '30 Dias'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* GRID DE KPIS / CARDS SUPERIORES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 shrink-0">
        
        {/* Taxa de Conclusão (Central) */}
        <div className="bg-[#202c33]/85 rounded-[32px] border border-[#2a3942]/60 p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div className="absolute top-4 right-4 p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <span className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider block">Taxa de Conclusão</span>
            <span className="text-3xl font-black text-white mt-1">{stats.completionRate}%</span>
          </div>
          <p className="text-[10px] text-[#8696a0] mt-2">Checklists concluídos vs previstos.</p>
        </div>

        {/* Em Tempo */}
        <div className="bg-[#202c33]/85 rounded-[32px] border border-[#2a3942]/60 p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div className="absolute top-4 right-4 p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Clock size={18} />
          </div>
          <div>
            <span className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider block">Concluídos no Prazo</span>
            <span className="text-3xl font-black text-emerald-400 mt-1">{stats.completedOnTime}</span>
          </div>
          <p className="text-[10px] text-[#8696a0] mt-2">Rotinas entregues pontualmente.</p>
        </div>

        {/* Atrasados */}
        <div className="bg-[#202c33]/85 rounded-[32px] border border-[#2a3942]/60 p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div className="absolute top-4 right-4 p-2 rounded-xl bg-amber-500/10 text-amber-400">
            <AlertTriangle size={18} />
          </div>
          <div>
            <span className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider block">Concluídos Atrasados</span>
            <span className="text-3xl font-black text-amber-400 mt-1">{stats.completedLate}</span>
          </div>
          <p className="text-[10px] text-[#8696a0] mt-2">Entregues com janelas toleráveis.</p>
        </div>

        {/* Alertas Críticos */}
        <div className="bg-[#202c33]/85 rounded-[32px] border border-[#2a3942]/60 p-5 relative overflow-hidden flex flex-col justify-between min-h-[120px]">
          <div className="absolute top-4 right-4 p-2 rounded-xl bg-rose-500/10 text-rose-400">
            <Shield size={18} />
          </div>
          <div>
            <span className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider block">Falhas Críticas Ativas</span>
            <span className="text-3xl font-black text-rose-400 mt-1">{stats.criticalAlerts}</span>
          </div>
          <p className="text-[10px] text-[#8696a0] mt-2">Itens críticos pendentes de ação.</p>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* LISTAGEM DE EXECUÇÕES REALTIME (ESQUERDA) */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-bold text-white text-md flex items-center gap-1.5">
            <ClipboardList size={16} className="text-indigo-400" />
            Atividades Recentes (Atualizado Realtime)
          </h3>

          {loading ? (
            <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/50 rounded-3xl border border-[#2a3942]/40 animate-pulse">
              Atualizando dados do dashboard...
            </div>
          ) : executions.length === 0 ? (
            <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/40 rounded-3xl border border-dashed border-[#2a3942]/60">
              Nenhuma rotina executada no período selecionado.
            </div>
          ) : (
            <div className="space-y-3">
              {executions.map((exec) => (
                <div 
                  key={exec.id}
                  onClick={() => handleOpenDetail(exec.id)}
                  className="bg-[#202c33]/80 rounded-[28px] border border-[#2a3942]/60 p-4 hover:shadow-md hover:border-indigo-500/30 transition-all flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-indigo-500/10 text-indigo-400">
                        {exec.category}
                      </span>
                      <h4 className="font-bold text-white text-sm leading-snug truncate">{exec.title}</h4>
                    </div>
                    
                    <div className="flex items-center gap-4 mt-2 text-[11px] text-[#8696a0] flex-wrap">
                      <span>Operador: <strong className="text-slate-300 font-semibold">{exec.operatorName}</strong></span>
                      <span>Filial: {exec.unitName}</span>
                      <span>Setor: {exec.sectorName}</span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-3">
                    
                    {/* Score */}
                    {exec.score !== null ? (
                      <div className="text-center bg-black/20 p-2 rounded-2xl border border-[#2a3942]/40 min-w-[70px]">
                        <span className="text-[8px] text-[#8696a0] block uppercase font-bold">Score</span>
                        <span className={`text-sm font-bold ${exec.score >= 90 ? 'text-emerald-400' : exec.score >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {exec.score}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic">Preenchendo...</span>
                    )}

                    {/* Status */}
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase shrink-0 ${
                      exec.status === 'completed_on_time' ? 'bg-emerald-500/10 text-emerald-400' :
                      exec.status === 'completed_late' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-indigo-500/10 text-indigo-400 animate-pulse'
                    }`}>
                      {exec.status === 'completed_on_time' ? 'Em Dia' :
                       exec.status === 'completed_late' ? 'Atrasado' : 'Em Curso'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ALERTAS CRÍTICOS E RANKING DE EQUIPE (DIREITA) */}
        <div className="space-y-6">
          
          {/* Alertas Críticos Pendentes */}
          <div className="bg-[#202c33]/85 rounded-[32px] border border-[#2a3942]/60 p-5 space-y-4">
            <h3 className="font-bold text-white text-sm flex items-center gap-1.5 text-rose-400">
              <AlertTriangle size={16} />
              Alertas de Itens Críticos ({alerts.length})
            </h3>

            {alerts.length === 0 ? (
              <p className="text-xs text-[#8696a0] italic py-2 text-center">Nenhum alerta crítico ativo. Excelente controle!</p>
            ) : (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto styled-scrollbar pr-1">
                {alerts.map((al) => (
                  <div key={al.id} className="bg-rose-500/5 border border-rose-500/20 p-3 rounded-2xl relative">
                    <button
                      onClick={() => handleResolveAlert(al.id)}
                      className="absolute top-2 right-2 text-xs font-bold text-emerald-400 hover:text-emerald-300"
                    >
                      Tratar
                    </button>
                    
                    <h4 className="text-xs font-bold text-white leading-snug pr-8">{al.title}</h4>
                    <p className="text-[10px] text-slate-300 mt-1 leading-relaxed">{al.message}</p>
                    <div className="flex items-center gap-2 mt-2 text-[9px] text-[#8696a0]">
                      <span>Filial: {al.units?.name}</span>
                      <span>{new Date(al.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ranking de Equipe por Score */}
          <div className="bg-[#202c33]/85 rounded-[32px] border border-[#2a3942]/60 p-5 space-y-4">
            <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
              <TrendingUp size={16} className="text-indigo-400" />
              Ranking da Equipe
            </h3>

            {ranking.length === 0 ? (
              <p className="text-xs text-[#8696a0] italic py-2 text-center">Aguardando mais execuções para gerar pontuação.</p>
            ) : (
              <div className="space-y-3">
                {ranking.map((rank, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 p-2 hover:bg-black/10 rounded-2xl transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                        idx === 0 ? 'bg-amber-400 text-black' :
                        idx === 1 ? 'bg-slate-300 text-black' :
                        idx === 2 ? 'bg-amber-700 text-white' :
                        'bg-black/35 text-slate-400'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{rank.name}</h4>
                        <p className="text-[9px] text-[#8696a0]">{rank.role}</p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1">
                      <span className="text-xs font-bold text-white">{rank.averageScore}</span>
                      <span className="text-[9px] text-[#8696a0]">pts</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Botão Flutuante de Toggle da Sidebar Principal */}
      <button
        onClick={() => setShowMainSidebar(!showMainSidebar)}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-[#202c33] border border-l-0 border-[#2a3942] rounded-r-2xl p-2.5 hover:bg-[#2a3942] hover:text-indigo-400 text-[#8696a0] shadow-xl transition-all cursor-pointer flex items-center justify-center group animate-in slide-in-from-left duration-300"
        title={showMainSidebar ? "Ocultar Menu Principal" : "Mostrar Menu Principal"}
      >
        {showMainSidebar ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

    </div>
  );
}
