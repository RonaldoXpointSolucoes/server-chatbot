import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Scale,
  Menu,
  Save,
  CheckCheck,
  PlusCircle,
  Copy,
  Database,
  History,
  FileCheck2
} from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { parseUploadedCashFile } from '../utils/cashFileParsers.mjs';
import { mergeCompanyFormulaRules } from '../utils/cashFormulaRules.mjs';
import { runCashReconciliation } from '../utils/cashReconciliationEngine.mjs';
import { buildCashReconciliationMigrationSql } from '../utils/cashReconciliationSchema.mjs';
import { computeHistoricalHealthStats } from '../utils/cashReconciliationServiceHelper.mjs';
import { geminiService } from '../services/geminiService';
import {
  CashSessionRow,
  CashRuleRow,
  listCashReconciliationSessions,
  loadCashReconciliationSession,
  saveCashReconciliationSession,
  listCashFormulaRules,
  saveCashFormulaRule,
  toggleCashFormulaRule,
  deleteCashFormulaRule
} from '../services/cashReconciliationService';
import { CashUploadDropzone, UploadedCashFileItem } from '../components/cash-reconciliation/CashUploadDropzone';
import { CashHealthDashboard } from '../components/cash-reconciliation/CashHealthDashboard';
import { CashReconciliationWorkbench } from '../components/cash-reconciliation/CashReconciliationWorkbench';
import {
  CashAiAnalysis,
  CashManualInputs,
  CashReconciliationResult,
  CashResolutionAction,
  ParsedCashFileResult,
  formatCents
} from '../types/cashReconciliation';

function notifyToast(message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, type, duration: 4000 } }));
}

export default function CashReconciliationPage() {
  const outlet = (useOutletContext() as { showMainSidebar?: boolean; setShowMainSidebar?: (v: boolean) => void }) || {};
  const storeTenantId = useChatStore((s) => s.tenantInfo?.id);
  const currentUserEmail = useChatStore((s) => s.currentUserEmail);
  const tenantId = storeTenantId || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id') || '';

  const [files, setFiles] = useState<UploadedCashFileItem[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);

  const [sessions, setSessions] = useState<CashSessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [rules, setRules] = useState<CashRuleRow[]>([]);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const [manualInputs, setManualInputs] = useState<CashManualInputs>({});
  const [manualResolutions, setManualResolutions] = useState<CashResolutionAction[]>([]);

  const [aiAnalysis, setAiAnalysis] = useState<CashAiAnalysis | null>(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const rulesConfig = useMemo(() => mergeCompanyFormulaRules(rules), [rules]);

  const loadTenantData = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [sessRes, rulesRes] = await Promise.all([
        listCashReconciliationSessions(tenantId, 30),
        listCashFormulaRules(tenantId)
      ]);
      setSessions(sessRes.sessions);
      setRules(rulesRes.rules);
      setSchemaMissing(sessRes.schemaMissing || rulesRes.schemaMissing);
    } catch (err: unknown) {
      console.error('[Conferência Caixa] Erro ao carregar histórico:', err);
    }
  }, [tenantId]);

  useEffect(() => {
    loadTenantData();
  }, [loadTenantData]);

  const reconciliationResult = useMemo<CashReconciliationResult | null>(() => {
    const validParsed = files.map(f => f.parsed).filter(p => p && p.status === 'ok');
    if (validParsed.length === 0) return null;
    return runCashReconciliation({
      parsedFiles: validParsed,
      rulesConfig,
      manualInputs,
      manualResolutions
    }) as CashReconciliationResult;
  }, [files, rulesConfig, manualInputs, manualResolutions]);

  const historicalStats = useMemo(() => computeHistoricalHealthStats(sessions), [sessions]);

  const handleAddFiles = async (fileList: FileList | File[]) => {
    setIsProcessingFiles(true);
    try {
      const incoming = Array.from(fileList);
      const parsedItems: UploadedCashFileItem[] = [];

      for (const file of incoming) {
        const arrayBuffer = await file.arrayBuffer();
        const parsed = await parseUploadedCashFile({
          fileName: file.name,
          arrayBuffer,
          rulesConfig
        });
        parsedItems.push({
          id: `${file.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          fileName: file.name,
          fileSizeBytes: file.size,
          arrayBuffer,
          parsed
        });
      }

      setFiles((prev) => {
        const byType = new Map<string, UploadedCashFileItem>();
        for (const existing of prev) {
          const key = existing.parsed?.fileType && ['pdv_vendas', 'rel_conferencia', 'fechamento_txt'].includes(existing.parsed.fileType)
            ? existing.parsed.fileType
            : existing.id;
          byType.set(key, existing);
        }
        for (const item of parsedItems) {
          const key = item.parsed?.fileType && ['pdv_vendas', 'rel_conferencia', 'fechamento_txt'].includes(item.parsed.fileType)
            ? item.parsed.fileType
            : item.id;
          byType.set(key, item);
        }
        return Array.from(byType.values());
      });
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const handleUnlockPasswordFile = async (fileId: string, password: string) => {
    const target = files.find(f => f.id === fileId);
    if (!target) return;
    setIsProcessingFiles(true);
    try {
      const parsed = await parseUploadedCashFile({
        fileName: target.fileName,
        arrayBuffer: target.arrayBuffer,
        password,
        rulesConfig
      });
      setFiles(prev => prev.map(f => (f.id === fileId ? { ...f, parsed } : f)));
      if (parsed.status === 'ok') {
        notifyToast(`Arquivo "${target.fileName}" desbloqueado com sucesso!`, 'success');
      } else {
        notifyToast(parsed.errorMessage || 'Senha inválida.', 'error');
      }
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleResetNew = () => {
    setActiveSessionId(null);
    setFiles([]);
    setManualInputs({});
    setManualResolutions([]);
    setAiAnalysis(null);
  };

  const handleLoadSession = async (sessionId: string) => {
    if (!tenantId) return;
    try {
      const fullSession = await loadCashReconciliationSession(tenantId, sessionId);
      const session = fullSession || sessions.find(s => s.id === sessionId);
      if (!session) return;
      setActiveSessionId(session.id);
      const snap = session.reconciled_summary || {};
      const restoredFiles: UploadedCashFileItem[] = (snap.parsedFilesSnapshot || []).map((pf: ParsedCashFileResult, idx: number) => ({
        id: `saved_${session.id}_${idx}`,
        fileName: pf.fileName,
        fileSizeBytes: 0,
        parsed: pf
      }));
      setFiles(restoredFiles);
      setManualInputs(snap.manualInputs || { cashCountedCents: session.cash_drawer_counted_cents, notes: session.cash_notes || '' });
      setManualResolutions(snap.manualResolutions || []);
      setAiAnalysis(session.ai_last_analysis || null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao abrir sessão salva.';
      notifyToast(msg, 'error');
    }
  };

  const handleSaveSession = async (markClosed = false) => {
    if (!tenantId || !reconciliationResult) return;
    setIsSaving(true);
    try {
      const res = await saveCashReconciliationSession({
        tenantId,
        userEmail: currentUserEmail || '',
        sessionId: activeSessionId,
        parsedFiles: files.map(f => ({ ...f.parsed, fileSizeBytes: f.fileSizeBytes })),
        result: reconciliationResult,
        manualInputs,
        manualResolutions,
        aiAnalysis,
        markClosed
      });
      setActiveSessionId(res.sessionId);
      setSchemaMissing(res.schemaMissing);
      await loadTenantData();
      notifyToast(
        markClosed
          ? 'Conferência fechada e salva no histórico!'
          : res.schemaMissing
            ? 'Salvo localmente (execute DB_SETUP_CASH_RECONCILIATION.sql para sincronizar no Supabase).'
            : 'Rascunho salvo no Supabase!',
        res.schemaMissing ? 'warning' : 'success'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'falha desconhecida';
      notifyToast(`Erro ao salvar: ${message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunAiAnalysis = async (question?: string) => {
    if (!reconciliationResult) return;
    setIsAnalyzingAi(true);
    try {
      const parseErrors = files.map(f => f.parsed).filter(p => p && p.status !== 'ok');
      const analysis = await geminiService.analyzeCashReconciliationIssues({
        reconciliation: reconciliationResult,
        parseErrors,
        rulesConfig,
        userQuestion: question
      });
      setAiAnalysis(analysis);
      notifyToast('Auditoria com IA concluída!', 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao consultar IA.';
      notifyToast(message, 'error');
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto overflow-x-hidden bg-[#f0f2f5] dark:bg-[#111b21] text-slate-900 dark:text-[#e9edef]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {outlet.setShowMainSidebar && (
              <button
                type="button"
                onClick={() => outlet.setShowMainSidebar?.(!outlet.showMainSidebar)}
                className="p-2 rounded-xl bg-white dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] text-slate-600 dark:text-[#aebac1] hover:text-[#00a884] lg:hidden"
                title="Abrir menu"
              >
                <Menu size={18} />
              </button>
            )}
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#00a884] to-emerald-600 text-white flex items-center justify-center shadow-md">
              <Scale size={20} />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black tracking-tight">Conferência Caixa</h1>
              <p className="text-xs text-slate-500 dark:text-[#8696a0]">
                Conciliação automática PDV × Bancos × Maquininhas com Fórmula 1 e Auditor IA
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {sessions.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] rounded-xl px-2.5 py-1.5">
                <History size={14} className="text-[#00a884]" />
                <select
                  value={activeSessionId || ''}
                  onChange={(e) => {
                    if (e.target.value) handleLoadSession(e.target.value);
                    else handleResetNew();
                  }}
                  className="bg-transparent text-xs font-semibold text-slate-700 dark:text-[#e9edef] focus:outline-none"
                >
                  <option value="" className="dark:bg-[#202c33]">Histórico ({sessions.length})...</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id} className="dark:bg-[#202c33]">
                      {s.reference_date} • {s.health_score}% • {formatCents(s.diff_cents)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={handleResetNew}
              className="px-3 py-2 min-h-[38px] rounded-xl bg-white dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] hover:border-[#00a884] text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <PlusCircle size={14} /> Nova Conferência
            </button>

            {reconciliationResult && (
              <>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSaveSession(false)}
                  className="px-3 py-2 min-h-[38px] rounded-xl bg-slate-800 dark:bg-[#2a3942] hover:opacity-90 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <Save size={14} /> Salvar
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSaveSession(true)}
                  className="px-3.5 py-2 min-h-[38px] rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                >
                  <CheckCheck size={14} /> Fechar Caixa
                </button>
              </>
            )}
          </div>
        </div>

        {/* Banner caso o SQL ainda não tenha sido aplicado no Supabase */}
        {schemaMissing && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <Database size={16} className="shrink-0" />
              <span>
                As tabelas do módulo ainda não foram criadas no Supabase remoto — suas conferências estão funcionando e sendo salvas localmente. Execute <code>DB_SETUP_CASH_RECONCILIATION.sql</code> no SQL Editor do Supabase para ativar o histórico na nuvem.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(buildCashReconciliationMigrationSql());
                notifyToast('SQL de criação das tabelas copiado para a área de transferência!', 'success');
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold flex items-center gap-1.5 shrink-0"
            >
              <Copy size={13} /> Copiar SQL
            </button>
          </div>
        )}

        {/* Área de Upload */}
        <CashUploadDropzone
          files={files}
          isProcessing={isProcessingFiles}
          onAddFiles={handleAddFiles}
          onUnlockPasswordFile={handleUnlockPasswordFile}
          onRemoveFile={handleRemoveFile}
        />

        {/* Conteúdo Principal vs Empty State */}
        {!reconciliationResult ? (
          <div className="rounded-3xl border border-slate-200/80 dark:border-[#2a3942] bg-white/80 dark:bg-[#202c33]/80 backdrop-blur-md p-8 sm:p-12 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-[#00a884]/10 border border-[#00a884]/25 text-[#00a884] flex items-center justify-center">
              <FileCheck2 size={30} />
            </div>
            <div className="max-w-lg mx-auto space-y-1.5">
              <h2 className="text-base sm:text-lg font-black text-slate-800 dark:text-white">
                Suba os arquivos do dia para iniciar a auditoria automática
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-[#8696a0]">
                Carregue juntos a <strong>PlanilhaRecebimento</strong>, a <strong>RelConferencia</strong>, o <strong>Fechamento .txt</strong>, os extratos <strong>OFX (C6 / Itaú)</strong> e os relatórios da <strong>Rede</strong> e <strong>C6 Pay</strong>. O sistema cruza tudo em segundos e mostra exatamente o que bateu, faltou ou sobrou.
              </p>
            </div>
            {historicalStats.totalSessions > 0 && (
              <div className="pt-4 max-w-3xl mx-auto text-left">
                <CashHealthDashboard
                  result={{
                    referenceDate: sessions[0]?.reference_date || '',
                    status: sessions[0]?.status || 'balanced',
                    healthScore: sessions[0]?.health_score || 0,
                    systemTotalCents: sessions[0]?.system_total_cents || 0,
                    realTotalCents: sessions[0]?.real_total_cents || 0,
                    diffTotalCents: sessions[0]?.diff_cents || 0,
                    mirrorRows: sessions[0]?.reconciled_summary?.mirrorRows || [],
                    cashDrawerSummary: sessions[0]?.reconciled_summary?.cashDrawerSummary || {},
                    financialMetrics: sessions[0]?.reconciled_summary?.financialMetrics || {}
                  }}
                  historicalStats={historicalStats}
                  onSelectSession={handleLoadSession}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <CashHealthDashboard
              result={reconciliationResult}
              historicalStats={historicalStats}
              onSelectSession={handleLoadSession}
            />

            <CashReconciliationWorkbench
              key={activeSessionId || 'draft'}
              result={reconciliationResult}
              manualInputs={manualInputs}
              onUpdateManualInputs={(patch) => setManualInputs(prev => ({ ...prev, ...patch }))}
              onConfirmSuggestion={(suggestionId) =>
                setManualResolutions(prev => [...prev, { action: 'confirm_suggestion', suggestionId }])
              }
              onRejectSuggestion={(suggestionId) =>
                setManualResolutions(prev => [...prev, { action: 'reject_suggestion', suggestionId }])
              }
              onManualLink={(systemIds, realIds) =>
                setManualResolutions(prev => [...prev, { action: 'manual_link', systemIds, realIds }])
              }
              onIgnoreItem={(side, id) =>
                setManualResolutions(prev => [
                  ...prev,
                  {
                    action: 'ignore_item',
                    systemIds: side === 'system' ? [id] : [],
                    realIds: side === 'real' ? [id] : []
                  }
                ])
              }
              rules={rules}
              onCreateRule={async (rule) => {
                if (!tenantId) return;
                const saved = await saveCashFormulaRule(tenantId, rule);
                setRules(prev => [saved.rule, ...prev]);
                notifyToast('Regra salva na Fórmula 1 e aplicada!', 'success');
              }}
              onToggleRule={async (ruleId, isActive) => {
                if (!tenantId) return;
                await toggleCashFormulaRule(tenantId, ruleId, isActive);
                setRules(prev => prev.map(r => (r.id === ruleId ? { ...r, is_active: isActive } : r)));
              }}
              onDeleteRule={async (ruleId) => {
                if (!tenantId) return;
                await deleteCashFormulaRule(tenantId, ruleId);
                setRules(prev => prev.filter(r => r.id !== ruleId));
              }}
              aiAnalysis={aiAnalysis}
              isAnalyzingAi={isAnalyzingAi}
              onRunAiAnalysis={handleRunAiAnalysis}
            />
          </div>
        )}
      </div>
    </div>
  );
}
