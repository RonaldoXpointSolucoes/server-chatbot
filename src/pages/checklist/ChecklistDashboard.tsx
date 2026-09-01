import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';
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
  CheckCheck,
  RefreshCw,
  Filter,
  Activity,
  Award,
  Zap,
  Check
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
  const storeTenantId = useChatStore((state) => state.tenantInfo?.id);
  const tenantId = storeTenantId || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');

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
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filtros
  const [selectedUnit, setSelectedUnit] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [units, setUnits] = useState<any[]>([]);

  // Detalhamento de Execução Ativa (Modal Premium)
  const [selectedExecDetail, setSelectedExecDetail] = useState<ExecutionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

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
  }, [tenantId, storeTenantId, selectedUnit, selectedPeriod]);

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
      const expected = mappedExecs.length + (selectedPeriod === 'today' ? 2 : 5);
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
      setIsRefreshing(false);
    }
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    loadDashboardData();
  };

  // Execuções filtradas na busca
  const filteredExecutions = useMemo(() => {
    return executions.filter(ex => {
      const matchesSearch = searchQuery === '' || 
        ex.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ex.operatorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ex.sectorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ex.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'on_time' && ex.status === 'completed_on_time') ||
        (statusFilter === 'late' && ex.status === 'completed_late') ||
        (statusFilter === 'in_progress' && ex.status === 'in_progress');

      return matchesSearch && matchesStatus;
    });
  }, [executions, searchQuery, statusFilter]);

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

  // EXPORTAÇÃO RÁPIDA PDF (Formatada)
  const handleExportPDF = () => {
    window.print();
  };

  // Helper de Iniciais do Operador
  const getInitials = (name: string) => {
    if (!name) return 'OP';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] text-[#d1d7db] overflow-y-auto p-4 md:p-6 styled-scrollbar relative">
      
      {/* GLOW DE FUNDO DECORATIVO */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -z-0" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -z-0" />

      {/* LIGHTBOX PREVIEW DE FOTO */}
      {previewPhotoUrl && (
        <div 
          onClick={() => setPreviewPhotoUrl(null)}
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-200"
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center">
            <button 
              onClick={() => setPreviewPhotoUrl(null)} 
              className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
            >
              <X size={20} />
            </button>
            <img 
              src={previewPhotoUrl} 
              alt="Evidência Ampliada" 
              className="max-w-full max-h-[85vh] object-contain rounded-2xl border border-white/20 shadow-2xl" 
            />
            <span className="mt-3 text-xs text-white/60 font-medium">Clique em qualquer lugar para fechar</span>
          </div>
        </div>
      )}

      {/* MODAL DETALHAMENTO DE EXECUÇÃO (RAIO-X EXECUTIVO) */}
      {selectedExecDetail && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 z-50 animate-in fade-in duration-200">
          <div className="bg-[#111b21] border border-white/10 rounded-[32px] sm:rounded-[40px] p-5 sm:p-7 max-w-3xl w-full max-h-[90vh] overflow-y-auto styled-scrollbar shadow-2xl relative animate-in zoom-in-95 duration-300">
            
            {/* Botão Fechar */}
            <button 
              onClick={() => setSelectedExecDetail(null)} 
              className="absolute top-5 right-5 p-2 bg-[#202c33] hover:bg-[#2a3942] rounded-full text-[#8696a0] hover:text-white transition-all cursor-pointer shadow-md"
            >
              <X size={18} />
            </button>

            {/* Cabeçalho do Raio-X */}
            <div className="border-b border-[#2a3942]/60 pb-5 mb-6">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-[10px] px-3 py-1 rounded-full font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 uppercase tracking-wider">
                  {selectedExecDetail.category}
                </span>
                <span className={`text-[10px] px-3 py-1 rounded-full font-bold uppercase ${
                  selectedExecDetail.status === 'completed_on_time' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                  selectedExecDetail.status === 'completed_late' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                  'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 animate-pulse'
                }`}>
                  {selectedExecDetail.status === 'completed_on_time' ? 'Concluído no Prazo' :
                   selectedExecDetail.status === 'completed_late' ? 'Concluído Atrasado' : 'Em Andamento'}
                </span>
              </div>

              <h3 className="font-black text-white text-xl sm:text-2xl tracking-tight leading-snug">
                {selectedExecDetail.checklist_title}
              </h3>
              
              {/* Grid Metadados do Preenchimento */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 p-4 rounded-2xl bg-[#182229]/60 border border-white/5 text-xs">
                <div>
                  <span className="block text-[10px] text-[#8696a0] uppercase font-semibold">Operador</span>
                  <span className="text-white font-bold text-sm truncate block mt-0.5">{selectedExecDetail.operator_name}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#8696a0] uppercase font-semibold">Filial / Setor</span>
                  <span className="text-slate-200 font-medium truncate block mt-0.5">{selectedExecDetail.unit_name} • {selectedExecDetail.sector_name}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#8696a0] uppercase font-semibold">Tempo Decorrido</span>
                  <span className="text-slate-200 font-medium truncate block mt-0.5">
                    {selectedExecDetail.duration_seconds ? `${Math.round(selectedExecDetail.duration_seconds / 60)} min` : 'Não finalizado'}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#8696a0] uppercase font-semibold">Pontuação Geral</span>
                  <span className={`font-black text-sm block mt-0.5 ${
                    selectedExecDetail.score !== null && selectedExecDetail.score >= 90 ? 'text-emerald-400' :
                    selectedExecDetail.score !== null && selectedExecDetail.score >= 70 ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {selectedExecDetail.score !== null ? `${selectedExecDetail.score} / 100 pts` : 'Em análise'}
                  </span>
                </div>
              </div>
            </div>

            {/* Lista de Respostas do Formulário */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <ClipboardList size={16} className="text-indigo-400" />
                  Respostas Registradas ({selectedExecDetail.responses.length} Itens)
                </h4>
              </div>

              {selectedExecDetail.responses.length === 0 ? (
                <p className="text-xs text-[#8696a0] italic py-6 text-center bg-[#182229]/40 rounded-2xl border border-dashed border-[#2a3942]">
                  Nenhum item respondido até o momento.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedExecDetail.responses.map((resp, idx) => (
                    <div 
                      key={resp.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col gap-2.5 ${
                        !resp.isConforming || !resp.isMetaOk 
                          ? 'bg-rose-500/5 border-rose-500/30' 
                          : 'bg-[#182229]/60 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span className="text-[11px] font-bold font-mono text-[#8696a0] bg-[#202c33] w-6 h-6 flex items-center justify-center rounded-xl shrink-0 mt-0.5 border border-white/5">
                            {idx + 1}
                          </span>
                          <div>
                            <h5 className="text-xs font-semibold text-white leading-relaxed flex items-center gap-2 flex-wrap">
                              {resp.title}
                              {resp.is_critical && (
                                <span className="text-[9px] px-2 py-0.5 rounded-md font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                  CRÍTICO
                                </span>
                              )}
                            </h5>
                          </div>
                        </div>
                        
                        {/* Status da Resposta */}
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase shrink-0 ${
                          resp.isConforming && resp.isMetaOk 
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}>
                          {resp.value}
                        </span>
                      </div>

                      {/* Fotos de Evidência com Modal Lightbox */}
                      {resp.photos && resp.photos.length > 0 && (
                        <div className="flex flex-col gap-1.5 pt-2 border-t border-white/5">
                          <span className="text-[10px] text-[#8696a0] font-medium flex items-center gap-1">
                            <Camera size={11} className="text-indigo-400" /> Evidências Fotográficas ({resp.photos.length}):
                          </span>
                          <div className="flex gap-2.5 overflow-x-auto pb-1 styled-scrollbar">
                            {resp.photos.map((url: string, pIdx: number) => (
                              <div 
                                key={pIdx} 
                                onClick={() => setPreviewPhotoUrl(url)}
                                className="relative group overflow-hidden rounded-xl border border-white/10 shrink-0 cursor-pointer shadow-md"
                              >
                                <img src={url} alt="Evidência" className="w-16 h-16 object-cover group-hover:scale-110 transition-transform duration-300" />
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Eye size={14} className="text-white" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Observação / Comentário */}
                      {resp.observation && (
                        <div className="text-[11px] text-amber-300 bg-amber-500/10 px-3 py-2 rounded-xl border border-amber-500/20 mt-1 italic flex items-start gap-1.5">
                          <Info size={13} className="text-amber-400 shrink-0 mt-0.5" />
                          <span><strong>Observação do Operador:</strong> {resp.observation}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ações do Modal */}
            <div className="flex flex-col sm:flex-row gap-2.5 border-t border-[#2a3942]/60 pt-5 mt-6">
              <button
                onClick={handleExportPDF}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 text-xs transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98] cursor-pointer"
              >
                <Download size={15} /> Exportar Relatório Executivo PDF
              </button>
              <button
                onClick={() => setSelectedExecDetail(null)}
                className="bg-[#202c33] hover:bg-[#2a3942] text-[#d1d7db] px-6 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer"
              >
                Fechar Raio-X
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER PRINCIPAL EXECUTIVO */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-6 mb-6 relative z-10">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 shadow-lg shadow-indigo-500/10">
              <BarChart3 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-white tracking-tight">
                  Dashboard Operacional Gastronômico
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Ao Vivo
                </span>
              </div>
              <p className="text-xs text-[#8696a0] mt-0.5">
                Acompanhamento em tempo real das rotinas de abertura, fechamento e conformidade técnica.
              </p>
            </div>
          </div>
        </div>

        {/* Barra de Filtros e Atualização */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="p-2.5 bg-[#202c33] hover:bg-[#2a3942] text-[#8696a0] hover:text-white rounded-xl border border-white/5 transition-all cursor-pointer flex items-center gap-1.5 text-xs active:scale-95 disabled:opacity-50"
            title="Atualizar Dados Agora"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin text-indigo-400" : ""} />
            <span className="hidden sm:inline font-medium">Atualizar</span>
          </button>

          <div className="relative">
            <select
              value={selectedUnit}
              onChange={e => setSelectedUnit(e.target.value)}
              className="bg-[#202c33] hover:bg-[#2a3942] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-medium focus:outline-none focus:border-indigo-500 transition-all cursor-pointer appearance-none pr-8"
            >
              <option value="all">Todas as Filiais</option>
              {units.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <Filter size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8696a0] pointer-events-none" />
          </div>

          <div className="flex bg-[#202c33] p-1 rounded-xl border border-white/10">
            {(['today', 'week', 'month'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedPeriod === period 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' 
                    : 'text-[#8696a0] hover:text-white'
                }`}
              >
                {period === 'today' ? 'Hoje' : period === 'week' ? '7 Dias' : '30 Dias'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* GRID DE KPIS SUPERIORES (GLASSMORPHISM CARDS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 shrink-0 relative z-10">
        
        {/* Taxa de Conclusão */}
        <div className="bg-[#202c33]/70 backdrop-blur-xl rounded-[28px] border border-white/10 p-5 relative overflow-hidden flex flex-col justify-between min-h-[130px] group hover:-translate-y-1 hover:border-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider">Taxa de Conclusão</span>
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-white">{stats.completionRate}%</span>
              <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5">
                <TrendingUp size={10} /> Meta 95%
              </span>
            </div>
            {/* Barra de Progresso Visual */}
            <div className="w-full bg-black/30 h-1.5 rounded-full mt-3 overflow-hidden border border-white/5">
              <div 
                className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-700" 
                style={{ width: `${Math.min(stats.completionRate, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Concluídos no Prazo */}
        <div className="bg-[#202c33]/70 backdrop-blur-xl rounded-[28px] border border-white/10 p-5 relative overflow-hidden flex flex-col justify-between min-h-[130px] group hover:-translate-y-1 hover:border-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider">No Prazo</span>
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              <Clock size={18} />
            </div>
          </div>
          <div>
            <span className="text-3xl font-black text-emerald-400 mt-1 block">{stats.completedOnTime}</span>
            <p className="text-[10px] text-[#8696a0] mt-1">Rotinas entregues pontualmente.</p>
          </div>
        </div>

        {/* Concluídos Atrasados */}
        <div className="bg-[#202c33]/70 backdrop-blur-xl rounded-[28px] border border-white/10 p-5 relative overflow-hidden flex flex-col justify-between min-h-[130px] group hover:-translate-y-1 hover:border-amber-500/30 hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider">Atrasados</span>
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div>
            <span className="text-3xl font-black text-amber-400 mt-1 block">{stats.completedLate}</span>
            <p className="text-[10px] text-[#8696a0] mt-1">Entregues fora da janela ideal.</p>
          </div>
        </div>

        {/* Falhas Críticas Ativas */}
        <div className="bg-[#202c33]/70 backdrop-blur-xl rounded-[28px] border border-white/10 p-5 relative overflow-hidden flex flex-col justify-between min-h-[130px] group hover:-translate-y-1 hover:border-rose-500/30 hover:shadow-xl hover:shadow-rose-500/10 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl group-hover:bg-rose-500/20 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#8696a0] uppercase font-bold tracking-wider">Falhas Críticas</span>
            <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20">
              <Shield size={18} />
            </div>
          </div>
          <div>
            <span className="text-3xl font-black text-rose-400 mt-1 block">{stats.criticalAlerts}</span>
            <p className="text-[10px] text-[#8696a0] mt-1">Alerta de não conformidade grave.</p>
          </div>
        </div>

      </div>

      {/* CONTEÚDO PRINCIPAL (GRID DUAL 2:1) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start relative z-10">
        
        {/* LISTAGEM DE EXECUÇÕES REALTIME (ESQUERDA - 2 COLUNAS) */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Header da Seção + Busca e Filtros Locais */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#202c33]/60 p-4 rounded-2xl border border-white/5">
            <div className="flex items-center gap-2">
              <ClipboardList size={18} className="text-indigo-400" />
              <h3 className="font-bold text-white text-sm">
                Atividades Recentes ({filteredExecutions.length})
              </h3>
            </div>

            {/* Busca e Status Pills */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-48">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0]" />
                <input
                  type="text"
                  placeholder="Buscar rotina/operador..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-[#111b21] border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#8696a0] focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-[#111b21] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-[#d1d7db] focus:outline-none cursor-pointer"
              >
                <option value="all">Todos Status</option>
                <option value="on_time">Em Dia</option>
                <option value="late">Atrasados</option>
                <option value="in_progress">Em Curso</option>
              </select>
            </div>
          </div>

          {/* Estado de Carregamento (Skeleton) */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="p-5 bg-[#202c33]/40 rounded-[24px] border border-white/5 animate-pulse flex items-center justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-white/10 rounded w-1/3" />
                    <div className="h-3 bg-white/5 rounded w-1/2" />
                  </div>
                  <div className="w-16 h-8 bg-white/10 rounded-xl" />
                </div>
              ))}
            </div>
          ) : filteredExecutions.length === 0 ? (
            <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/40 rounded-[28px] border border-dashed border-white/10 flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-3 border border-indigo-500/20">
                <ClipboardList size={26} />
              </div>
              <h4 className="text-white font-bold text-sm mb-1">Nenhuma atividade encontrada</h4>
              <p className="text-xs max-w-xs text-[#8696a0]">
                {searchQuery ? 'Tente alterar os termos da busca ou filtros selecionados.' : 'Aguardando início de rotinas operacionais no período.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredExecutions.map((exec) => (
                <div 
                  key={exec.id}
                  onClick={() => handleOpenDetail(exec.id)}
                  className="bg-[#202c33]/70 hover:bg-[#202c33] rounded-[24px] border border-white/5 hover:border-indigo-500/30 p-4 transition-all flex items-center justify-between gap-4 cursor-pointer group shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 relative overflow-hidden"
                >
                  {/* Bordazinha Indicadora de Status na Lateral */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                    exec.status === 'completed_on_time' ? 'bg-emerald-400' :
                    exec.status === 'completed_late' ? 'bg-amber-400' : 'bg-indigo-400'
                  }`} />

                  <div className="min-w-0 flex-1 pl-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] px-2.5 py-0.5 rounded-full font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                        {exec.category}
                      </span>
                      <h4 className="font-bold text-white text-sm leading-snug group-hover:text-indigo-300 transition-colors truncate">
                        {exec.title}
                      </h4>
                    </div>
                    
                    <div className="flex items-center gap-3.5 mt-2 text-[11px] text-[#8696a0] flex-wrap">
                      {/* Avatar com Iniciais */}
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white font-bold text-[9px] flex items-center justify-center shadow-sm">
                          {getInitials(exec.operatorName)}
                        </span>
                        <strong className="text-slate-200 font-semibold">{exec.operatorName}</strong>
                      </div>

                      <span className="flex items-center gap-1">
                        <MapPin size={11} className="text-[#8696a0]" /> {exec.unitName}
                      </span>
                      <span>Setor: <strong className="text-slate-300">{exec.sectorName}</strong></span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-3">
                    
                    {/* Badge de Pontuação */}
                    {exec.score !== null ? (
                      <div className="text-center bg-[#111b21] px-3 py-1.5 rounded-xl border border-white/10 min-w-[75px]">
                        <span className="text-[8px] text-[#8696a0] block uppercase font-bold tracking-wider">Score</span>
                        <span className={`text-xs font-black ${
                          exec.score >= 90 ? 'text-emerald-400' : 
                          exec.score >= 70 ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {exec.score} pts
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20 font-semibold animate-pulse">
                        Em Preenchimento
                      </span>
                    )}

                    {/* Status Pill */}
                    <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase shrink-0 ${
                      exec.status === 'completed_on_time' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                      exec.status === 'completed_late' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                      'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
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

        {/* ALERTAS CRÍTICOS E RANKING DE EQUIPE (DIREITA - 1 COLUNA) */}
        <div className="space-y-6">
          
          {/* Alertas Críticos Pendentes */}
          <div className="bg-[#202c33]/70 backdrop-blur-xl rounded-[28px] border border-white/10 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center gap-2 text-rose-400">
                <AlertTriangle size={17} />
                Alertas de Itens Críticos ({alerts.length})
              </h3>
              {alerts.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              )}
            </div>

            {alerts.length === 0 ? (
              <div className="py-6 text-center text-[#8696a0] bg-[#111b21]/40 rounded-2xl border border-dashed border-white/5">
                <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-2 opacity-80" />
                <p className="text-xs font-semibold text-white">Nenhum alerta pendente</p>
                <p className="text-[10px] text-[#8696a0] mt-0.5">Conformidade operacional impecável!</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[260px] overflow-y-auto styled-scrollbar pr-1">
                {alerts.map((al) => (
                  <div key={al.id} className="bg-rose-500/10 border border-rose-500/30 p-3.5 rounded-2xl relative group hover:border-rose-500/50 transition-all">
                    <button
                      onClick={() => handleResolveAlert(al.id)}
                      className="absolute top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all cursor-pointer active:scale-95"
                    >
                      Tratar
                    </button>
                    
                    <h4 className="text-xs font-bold text-white leading-snug pr-14">{al.title}</h4>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{al.message}</p>
                    <div className="flex items-center gap-3 mt-2.5 text-[9px] text-[#8696a0] border-t border-rose-500/20 pt-2">
                      <span className="flex items-center gap-1"><MapPin size={10} /> {al.units?.name}</span>
                      <span className="flex items-center gap-1"><Clock size={10} /> {new Date(al.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ranking de Equipe por Score Executivo */}
          <div className="bg-[#202c33]/70 backdrop-blur-xl rounded-[28px] border border-white/10 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Award size={17} className="text-amber-400" />
                Ranking da Equipe
              </h3>
              <span className="text-[10px] text-[#8696a0] font-semibold bg-white/5 px-2 py-0.5 rounded-md">
                Top Pontuação
              </span>
            </div>

            {ranking.length === 0 ? (
              <div className="py-6 text-center text-[#8696a0] bg-[#111b21]/40 rounded-2xl border border-dashed border-white/5">
                <TrendingUp size={24} className="mx-auto text-indigo-400 mb-2 opacity-80" />
                <p className="text-xs font-semibold text-white">Aguardando execuções</p>
                <p className="text-[10px] text-[#8696a0] mt-0.5">Pontuações serão geradas ao concluir tarefas.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {ranking.map((rank, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between gap-3 p-3 bg-[#111b21]/50 border border-white/5 hover:border-indigo-500/20 rounded-2xl transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Posição Medaglias */}
                      <span className={`w-6 h-6 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 ${
                        idx === 0 ? 'bg-amber-400 text-black shadow-md shadow-amber-400/20' :
                        idx === 1 ? 'bg-slate-300 text-black shadow-md shadow-slate-300/20' :
                        idx === 2 ? 'bg-amber-700 text-white shadow-md shadow-amber-700/20' :
                        'bg-[#202c33] text-[#8696a0] border border-white/5'
                      }`}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                      </span>

                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{rank.name}</h4>
                        <p className="text-[9px] text-[#8696a0] uppercase tracking-wider font-semibold">{rank.role}</p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-xl">
                      <span className="text-xs font-black text-indigo-300">{rank.averageScore}</span>
                      <span className="text-[9px] text-indigo-400 font-bold">pts</span>
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
        className="fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-[#202c33] border border-l-0 border-white/10 rounded-r-2xl p-2.5 hover:bg-[#2a3942] hover:text-indigo-400 text-[#8696a0] shadow-2xl transition-all cursor-pointer flex items-center justify-center group animate-in slide-in-from-left duration-300"
        title={showMainSidebar ? "Ocultar Menu Principal" : "Mostrar Menu Principal"}
      >
        {showMainSidebar ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

    </div>
  );
}
