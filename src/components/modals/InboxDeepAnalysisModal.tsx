import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  X, BrainCircuit, Sparkles, ShieldCheck, Clock, RefreshCw, Play, RotateCcw,
  CheckCircle2, AlertTriangle, Loader2, Trash2, Globe, Lock, ExternalLink,
  Layers, FileText, Filter
} from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import {
  INBOX_ANALYSIS_STAGES,
  formatInboxCheckpointSummary,
  normalizeRunStats,
  isActiveRunStatus
} from '../../utils/inboxKnowledgeUtils.mjs';

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

interface DiscardedSample {
  reason: string;
  sample: string;
}

interface InboxRunRecord {
  id: string;
  status: string;
  progress_pct?: number;
  current_stage?: number;
  current_step_label?: string | null;
  stats?: Record<string, unknown> | null;
  discarded_samples?: DiscardedSample[] | null;
  extracted_behavior_summary?: string | null;
  result_markdown?: string | null;
  document_id?: string | null;
  error_message?: string | null;
}

interface LinkedInboxDoc {
  id: string;
  name?: string;
  instance_id?: string | null;
  metadata?: {
    behavior_profile?: string | null;
  } | null;
}

interface InboxStatusResponse {
  instance?: {
    id: string;
    display_name?: string;
    last_knowledge_analyzed_at?: string | null;
    last_knowledge_document_id?: string | null;
  } | null;
  pendingEligibleCount?: number;
  activeRun?: InboxRunRecord | null;
  lastCompletedRun?: InboxRunRecord | null;
  recentRuns?: InboxRunRecord[];
  linkedDocument?: LinkedInboxDoc | null;
}

function getErrMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export interface InboxDeepAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  companyName?: string;
  instanceId: string;
  instanceName: string;
  onCompleted?: (documentId?: string | null) => void;
}

export const InboxDeepAnalysisModal: React.FC<InboxDeepAnalysisModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  companyName,
  instanceId,
  instanceName,
  onCompleted
}) => {
  const navigate = useNavigate();
  const tenantInfo = useChatStore((s) => s.tenantInfo);
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;

  const resolvedCompanyName = companyName || (tenantInfo?.id === tenantId ? tenantInfo?.name : '') || 'Empresa Ativa';

  const [loadingStatus, setLoadingStatus] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmFullReset, setConfirmFullReset] = useState(false);
  const [statusData, setStatusData] = useState<InboxStatusResponse | null>(null);
  const [activeRun, setActiveRun] = useState<InboxRunRecord | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<'document' | 'discarded'>('document');
  const [togglingScope, setTogglingScope] = useState(false);
  const [targetScope, setTargetScope] = useState<'inbox' | 'global'>('inbox');
  const [modalStep, setModalStep] = useState<'choose_scope' | 'studio'>('choose_scope');

  const loadStatus = useCallback(async () => {
    if (!tenantId || !instanceId) return;
    setLoadingStatus(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${ENGINE_URL}/api/v1/knowledge/inbox-analyze/${instanceId}/status`, {
        headers: { 'x-tenant-id': tenantId }
      });
      const json = (await res.json()) as InboxStatusResponse & { error?: string };
      if (!res.ok) throw new Error(json?.error || 'Falha ao consultar checkpoint da caixa.');
      setStatusData(json);
      if (json.activeRun) {
        setActiveRun(json.activeRun);
        const runScope = (json.activeRun.stats as { targetScope?: string } | null)?.targetScope;
        if (runScope === 'global' || runScope === 'inbox') {
          setTargetScope(runScope);
        }
        if (isActiveRunStatus(json.activeRun.status)) {
          setModalStep('studio');
        }
      } else if (json.lastCompletedRun) {
        setActiveRun(json.lastCompletedRun);
      } else if (Array.isArray(json.recentRuns) && json.recentRuns[0]) {
        setActiveRun(json.recentRuns[0]);
      } else {
        setActiveRun(null);
      }
      if (!json.activeRun && json.linkedDocument) {
        setTargetScope(json.linkedDocument.instance_id === null ? 'global' : 'inbox');
      }
    } catch (err: unknown) {
      setErrorMsg(getErrMessage(err, 'Erro ao carregar status da análise profunda.'));
    } finally {
      setLoadingStatus(false);
    }
  }, [tenantId, instanceId]);

  useEffect(() => {
    if (!isOpen || !instanceId) {
      setConfirmFullReset(false);
      setStatusData(null);
      setActiveRun(null);
      setErrorMsg(null);
      setTargetScope('inbox');
      setModalStep('choose_scope');
      return;
    }
    setConfirmFullReset(false);
    setStatusData(null);
    setActiveRun(null);
    setErrorMsg(null);
    setModalStep('choose_scope');
    loadStatus();
  }, [isOpen, instanceId, loadStatus]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const activeRunId = activeRun?.id || null;
  const activeRunStatus = activeRun?.status || null;
  const isPolling = isOpen && Boolean(activeRunId) && isActiveRunStatus(activeRunStatus);

  useEffect(() => {
    if (!isPolling || !activeRunId || !tenantId) return;
    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${ENGINE_URL}/api/v1/knowledge/inbox-analyze/runs/${activeRunId}`, {
          headers: { 'x-tenant-id': tenantId }
        });
        const json = (await res.json()) as { run?: InboxRunRecord };
        if (cancelled || !res.ok || !json?.run) return;
        setActiveRun(json.run);
        if (!isActiveRunStatus(json.run.status)) {
          loadStatus();
          if (json.run.status === 'completed' || json.run.status === 'no_new_data') {
            onCompletedRef.current?.(json.run.document_id || null);
          }
        }
      } catch {
        // Transient polling error handled silently on next tick
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isPolling, activeRunId, tenantId, loadStatus]);

  const handleStartAnalysis = async (mode: 'incremental' | 'full', scopeOverride?: 'inbox' | 'global') => {
    if (!tenantId || !instanceId || starting) return;
    const effectiveTargetScope = scopeOverride || targetScope;
    setStarting(true);
    setConfirmFullReset(false);
    setModalStep('studio');
    setErrorMsg(null);
    try {
      const res = await fetch(`${ENGINE_URL}/api/v1/knowledge/inbox-analyze/${instanceId}/start`, {
        method: 'POST',
        headers: {
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mode, targetScope: effectiveTargetScope })
      });
      const json = (await res.json()) as { run?: InboxRunRecord; activeRun?: InboxRunRecord; error?: string };
      if (res.status === 409 && json?.activeRun) {
        setActiveRun(json.activeRun);
        return;
      }
      if (!res.ok) throw new Error(json?.error || 'Não foi possível iniciar a análise.');
      if (json?.run) {
        setActiveRun(json.run);
      }
    } catch (err: unknown) {
      setErrorMsg(getErrMessage(err, 'Erro ao iniciar análise da caixa.'));
    } finally {
      setStarting(false);
    }
  };

  const handleChooseScope = (chosen: 'inbox' | 'global') => {
    setTargetScope(chosen);
    setModalStep('studio');
  };

  const linkedDoc = statusData?.linkedDocument || null;
  const effectiveDocId = linkedDoc?.id || activeRun?.document_id || statusData?.instance?.last_knowledge_document_id || null;
  const isDocGlobal = linkedDoc ? linkedDoc.instance_id === null : false;

  const handleToggleDocumentScope = async () => {
    if (!effectiveDocId || !tenantId || togglingScope) return;
    setTogglingScope(true);
    setErrorMsg(null);
    try {
      const nextInstanceId = isDocGlobal ? instanceId : null;
      const res = await fetch(`${ENGINE_URL}/api/v1/knowledge/${effectiveDocId}/scope`, {
        method: 'PATCH',
        headers: {
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ instanceId: nextInstanceId })
      });
      const json = (await res.json()) as { document?: LinkedInboxDoc; error?: string };
      if (!res.ok) throw new Error(json?.error || 'Erro ao alterar escopo do documento.');
      setStatusData(prev => (prev ? { ...prev, linkedDocument: json.document || prev.linkedDocument } : prev));
    } catch (err: unknown) {
      setErrorMsg(getErrMessage(err, 'Erro ao alternar visibilidade Global/Caixa.'));
    } finally {
      setTogglingScope(false);
    }
  };

  const checkpoint = useMemo(() => formatInboxCheckpointSummary({
    lastKnowledgeAnalyzedAt: statusData?.instance?.last_knowledge_analyzed_at || null,
    pendingEligibleCount: statusData?.pendingEligibleCount || 0
  }), [statusData?.instance?.last_knowledge_analyzed_at, statusData?.pendingEligibleCount]);

  const stats = useMemo(() => normalizeRunStats(activeRun?.stats), [activeRun?.stats]);
  const currentStage = Number(activeRun?.current_stage || 1);
  const progressPct = Math.min(100, Math.max(0, Number(activeRun?.progress_pct || 0)));
  const discardedSamples: Array<{ reason: string; sample: string }> = Array.isArray(activeRun?.discarded_samples)
    ? activeRun.discarded_samples
    : [];
  const behaviorSummary = activeRun?.extracted_behavior_summary || linkedDoc?.metadata?.behavior_profile || '';
  const resultMarkdown = activeRun?.result_markdown || '';
  const isRunning = starting || isActiveRunStatus(activeRun?.status);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] bg-[#0b141a]/95 border border-white/10 rounded-3xl shadow-[0_25px_70px_-15px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-slate-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-7 py-4 sm:py-5 border-b border-white/10 bg-gradient-to-r from-emerald-500/10 via-indigo-500/10 to-violet-500/10 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
              <BrainCircuit size={22} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white truncate">
                  Sincronizar Conversas no RAG: {instanceName}
                </h2>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                  (modalStep === 'studio' ? targetScope === 'global' : isDocGlobal)
                    ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                    : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                }`}>
                  {(modalStep === 'studio' ? targetScope === 'global' : isDocGlobal) ? <Globe size={10} /> : <Lock size={10} />}
                  {(modalStep === 'studio' ? targetScope === 'global' : isDocGlobal) ? 'Global da Empresa' : 'Exclusivo desta Caixa'}
                </span>
                {modalStep === 'studio' && !isRunning && (
                  <button
                    type="button"
                    onClick={() => setModalStep('choose_scope')}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/15 text-slate-300 border border-white/10 transition-colors cursor-pointer"
                  >
                    Alterar escopo
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                Empresa: <strong className="text-slate-200">{resolvedCompanyName}</strong> • Funil Anti-Ruído 10x + Playbook Comportamental RAG 2.0
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors shrink-0"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-5 custom-scrollbar">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {/* Passo 1: Pergunta explícita de Escopo (Exclusivo desta Caixa vs Global da Empresa) */}
          {modalStep === 'choose_scope' ? (
            <div className="space-y-5">
              <div className="rounded-2xl bg-[#182229]/90 border border-white/10 p-4 flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shrink-0">
                  <Clock size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    {loadingStatus ? 'Consultando histórico de conversas no banco...' : checkpoint.headline}
                    {loadingStatus && <Loader2 size={14} className="animate-spin text-emerald-400" />}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{checkpoint.detail}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Onde deseja aplicar o conhecimento extraído do histórico desta caixa?
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Todas as conversas reais existentes da caixa <strong className="text-slate-200">{instanceName}</strong> serão lidas, filtradas em 10 camadas anti-lixo e inseridas no RAG. Escolha o alcance de aplicação:
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <button
                    type="button"
                    onClick={() => handleChooseScope('inbox')}
                    className={`text-left p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 group ${
                      targetScope === 'inbox'
                        ? 'bg-indigo-500/15 border-indigo-400/60 shadow-[0_0_24px_rgba(99,102,241,0.18)]'
                        : 'bg-[#182229]/80 border-white/10 hover:border-indigo-400/50 hover:bg-indigo-500/10'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                          <Lock size={19} />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                          Isolado na Caixa
                        </span>
                      </div>
                      <h4 className="text-sm font-black text-white">
                        Exclusivamente nesta Caixa ({instanceName})
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Aplica o playbook e o conhecimento RAG extraídos apenas para os atendimentos e robôs vinculados à caixa <strong className="text-white">{instanceName}</strong>.
                      </p>
                    </div>
                    <span className="text-xs font-bold text-indigo-300 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                      Aplicar exclusivamente nesta Caixa →
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChooseScope('global')}
                    className={`text-left p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 group ${
                      targetScope === 'global'
                        ? 'bg-sky-500/15 border-sky-400/60 shadow-[0_0_24px_rgba(56,189,248,0.18)]'
                        : 'bg-[#182229]/80 border-white/10 hover:border-sky-400/50 hover:bg-sky-500/10'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
                          <Globe size={19} />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30">
                          Todas as Caixas
                        </span>
                      </div>
                      <h4 className="text-sm font-black text-white">
                        Global — Empresa Inteira ({resolvedCompanyName})
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Insere o conhecimento RAG gerado a partir desta caixa na base <strong className="text-white">Global</strong>, ficando disponível para todas as caixas de {resolvedCompanyName}.
                      </p>
                    </div>
                    <span className="text-xs font-bold text-sky-300 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                      Aplicar Globalmente na Empresa →
                    </span>
                  </button>
                </div>
              </div>

              {activeRun && (
                <div className="pt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setModalStep('studio')}
                    className="text-xs font-semibold text-slate-300 hover:text-emerald-300 underline cursor-pointer"
                  >
                    Ir para o painel / resultado da última execução
                  </button>
                </div>
              )}
            </div>
          ) : (
          <>
          {/* Checkpoint & Incremental Controls */}
          <div className="rounded-2xl bg-[#182229]/90 border border-white/10 p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shrink-0">
                  <Clock size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    {loadingStatus ? 'Consultando histórico e checkpoint...' : checkpoint.headline}
                    {loadingStatus && <Loader2 size={14} className="animate-spin text-emerald-400" />}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {checkpoint.detail}
                  </p>
                </div>
              </div>
              <button
                onClick={loadStatus}
                disabled={loadingStatus || isRunning}
                className="self-start sm:self-center p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors disabled:opacity-40"
                title="Atualizar contagem de novas mensagens"
              >
                <RefreshCw size={15} className={loadingStatus ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={() => handleStartAnalysis('incremental')}
                disabled={isRunning || loadingStatus}
                className="flex-1 min-w-[230px] px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                <span>
                  {isRunning
                    ? 'Sincronização RAG em Execução...'
                    : `${checkpoint.primaryButtonLabel} (${targetScope === 'global' ? 'Global da Empresa' : 'Somente esta Caixa'})`}
                </span>
              </button>

              {checkpoint.hasPreviousRun && !confirmFullReset && (
                <button
                  onClick={() => setConfirmFullReset(true)}
                  disabled={isRunning || loadingStatus}
                  className="px-4 py-3 rounded-xl bg-white/5 hover:bg-amber-500/15 text-slate-300 hover:text-amber-300 border border-white/10 hover:border-amber-500/30 font-semibold text-xs flex items-center gap-2 transition-all disabled:opacity-40 cursor-pointer"
                >
                  <RotateCcw size={14} />
                  <span>Reanalisar Histórico Completo do Zero</span>
                </button>
              )}

              {confirmFullReset && (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                  <span className="text-[11px] text-amber-200 font-medium">Reprocessar tudo desde o início?</span>
                  <button
                    onClick={() => handleStartAnalysis('full')}
                    disabled={isRunning}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] cursor-pointer"
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => setConfirmFullReset(false)}
                    className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Live 10-Layer Stepper & Counters */}
          {activeRun && (
            <div className="rounded-2xl bg-[#182229]/90 border border-white/10 p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {isActiveRunStatus(activeRun.status) ? (
                    <Loader2 size={16} className="animate-spin text-indigo-400" />
                  ) : activeRun.status === 'completed' ? (
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  ) : activeRun.status === 'no_new_data' ? (
                    <ShieldCheck size={16} className="text-sky-400" />
                  ) : (
                    <AlertTriangle size={16} className="text-rose-400" />
                  )}
                  <span className="text-xs sm:text-sm font-bold text-white">
                    {activeRun.current_step_label || 'Pipeline de Curadoria 10 Camadas'}
                  </span>
                </div>
                <span className="text-xs font-black text-emerald-400 tabular-nums">{progressPct}%</span>
              </div>

              <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    activeRun.status === 'failed'
                      ? 'bg-rose-500'
                      : 'bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* Telemetry Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {[
                  { label: 'Msgs Lidas', value: stats.rawMessagesRead.toLocaleString('pt-BR'), color: 'text-slate-200' },
                  { label: 'Cliente/Humano', value: stats.keptAuthoredMessages.toLocaleString('pt-BR'), color: 'text-emerald-400' },
                  { label: 'Lixo Barrado', value: stats.totalNoiseBlocked.toLocaleString('pt-BR'), color: 'text-amber-400' },
                  { label: 'LGPD Mascarada', value: stats.maskedPiiCount.toLocaleString('pt-BR'), color: 'text-cyan-400' },
                  { label: 'Lotes IA Map', value: `${stats.mapBatchesCompleted}/${stats.mapBatchesTotal || 0}`, color: 'text-indigo-400' },
                  { label: 'Vetores Gravados', value: stats.finalChunksCount.toLocaleString('pt-BR'), color: 'text-violet-400' }
                ].map((metric) => (
                  <div key={metric.label} className="rounded-xl bg-black/30 border border-white/5 px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{metric.label}</div>
                    <div className={`text-sm sm:text-base font-black mt-0.5 tabular-nums ${metric.color}`}>{metric.value}</div>
                  </div>
                ))}
              </div>

              {/* 10 Layers Mini Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
                {INBOX_ANALYSIS_STAGES.map((st) => {
                  const done = activeRun.status === 'completed' || activeRun.status === 'no_new_data' || st.stage < currentStage;
                  const active = isActiveRunStatus(activeRun.status) && st.stage === currentStage;
                  return (
                    <div
                      key={st.stage}
                      title={st.desc}
                      className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold flex items-center gap-1.5 truncate ${
                        active
                          ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-200 animate-pulse'
                          : done
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                            : 'bg-white/[0.02] border-white/5 text-slate-500'
                      }`}
                    >
                      <span className="font-black opacity-75">{st.stage}.</span>
                      <span className="truncate">{st.title}</span>
                    </div>
                  );
                })}
              </div>

              {activeRun.error_message && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200">
                  <strong>Detalhe do erro:</strong> {activeRun.error_message}
                </div>
              )}
            </div>
          )}

          {/* Behavior Summary Card */}
          {behaviorSummary && (
            <div className="rounded-2xl bg-gradient-to-br from-indigo-950/60 to-violet-950/40 border border-indigo-500/30 p-4 sm:p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-300">
                <Sparkles size={14} className="text-indigo-400" />
                Playbook de Comportamento & Tom de Voz Injetado na IA desta Caixa
              </div>
              <p className="text-xs sm:text-sm text-slate-200 whitespace-pre-line leading-relaxed">
                {behaviorSummary}
              </p>
            </div>
          )}

          {/* Results & Anti-Noise Transparency */}
          {(resultMarkdown || discardedSamples.length > 0) && (
            <div className="rounded-2xl bg-[#182229]/90 border border-white/10 overflow-hidden">
              <div className="flex border-b border-white/10 bg-black/20 px-3 pt-2 gap-2">
                <button
                  onClick={() => setResultTab('document')}
                  className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                    resultTab === 'document'
                      ? 'text-emerald-400 border-emerald-400 bg-white/5'
                      : 'text-slate-400 border-transparent hover:text-slate-200'
                  }`}
                >
                  <FileText size={14} />
                  Documento Implantado na Base
                </button>
                <button
                  onClick={() => setResultTab('discarded')}
                  className={`px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                    resultTab === 'discarded'
                      ? 'text-amber-400 border-amber-400 bg-white/5'
                      : 'text-slate-400 border-transparent hover:text-slate-200'
                  }`}
                >
                  <Filter size={14} />
                  Relatório de Filtragem (Lixo Descartado: {stats.totalNoiseBlocked.toLocaleString('pt-BR')})
                </button>
              </div>

              <div className="p-4 max-h-72 overflow-y-auto custom-scrollbar">
                {resultTab === 'document' ? (
                  resultMarkdown ? (
                    <pre className="whitespace-pre-wrap font-sans text-xs text-slate-200 leading-relaxed">
                      {resultMarkdown}
                    </pre>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Nenhum documento novo gerado nesta execução.</p>
                  )
                ) : discardedSamples.length > 0 ? (
                  <div className="space-y-2">
                    {discardedSamples.map((item, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-black/30 border border-white/5 flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                          <Trash2 size={11} /> {item.reason}
                        </span>
                        <span className="text-xs text-slate-300 font-mono break-all">{item.sample}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Nenhuma amostra adicional registrada neste ciclo.</p>
                )}
              </div>
            </div>
          )}
          </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-7 py-4 border-t border-white/10 bg-black/30 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {effectiveDocId && (
              <button
                onClick={handleToggleDocumentScope}
                disabled={togglingScope}
                className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-200 flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {togglingScope ? <Loader2 size={14} className="animate-spin" /> : isDocGlobal ? <Lock size={14} className="text-indigo-400" /> : <Globe size={14} className="text-sky-400" />}
                <span>{isDocGlobal ? 'Restringir para esta Caixa' : 'Promover para Global da Empresa'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              onClick={() => {
                onClose();
                const navScope = (modalStep === 'studio' ? targetScope === 'global' : isDocGlobal) ? 'global' : instanceId;
                navigate(`/knowledge?instanceId=${encodeURIComponent(navScope)}`);
              }}
              className="px-4 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Layers size={14} />
              <span>Abrir em Base de Conhecimento</span>
              <ExternalLink size={12} />
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
