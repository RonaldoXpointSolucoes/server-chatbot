import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  FileCheck2,
  ArrowLeft,
  MessageCircle,
  FileText,
  Trash2,
  Loader2,
  Cloud,
  AlertCircle,
  RefreshCw,
  Calendar
} from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { parseUploadedCashFile } from '../utils/cashFileParsers.mjs';
import {
  logCashFileParseResult,
  logCashReconciliationEvent,
  logCashUnexpectedError
} from '../utils/cashDevLogger';
import { mergeCompanyFormulaRules } from '../utils/cashFormulaRules.mjs';
import { runCashReconciliation } from '../utils/cashReconciliationEngine.mjs';
import { assessCashReportCompleteness } from '../utils/cashReportCompleteness.mjs';
import { buildCashReconciliationMigrationSql } from '../utils/cashReconciliationSchema.mjs';
import {
  bootstrapRoutineFromSessions,
  learnRoutineFromParsedFiles,
  mergeRoutineProfiles,
  toggleRoutineBankExpected,
  toggleRoutineReportExpected
} from '../utils/cashCompanyRoutineHelper.mjs';
import {
  buildCashPdfReportHtml,
  buildCashWhatsappSummaryMessage
} from '../utils/cashReportExportHelper.mjs';
import {
  computeHistoricalHealthStats,
  extractCashErrorMessage,
  loadActiveCashDraftFromStorage,
  saveActiveCashDraftToStorage,
  clearActiveCashDraftFromStorage,
  savePendingClosedPatchToStorage,
  loadPendingClosedPatchFromStorage,
  clearPendingClosedPatchFromStorage,
  buildCashDraftSyncSignature,
  shouldPreferLocalDraftOverSession,
  formatDateBr,
  formatDateHeaderBadge
} from '../utils/cashReconciliationServiceHelper.mjs';
import { geminiService } from '../services/geminiService';
import {
  CashRuleRow,
  CashSessionRow,
  listCashReconciliationSessions,
  loadCashReconciliationSession,
  saveCashReconciliationSession,
  deleteCashReconciliationSession,
  listCashFormulaRules,
  saveCashFormulaRule,
  toggleCashFormulaRule,
  deleteCashFormulaRule,
  getMergedSavedFilePasswords,
  upsertCashSavedFilePassword,
  deleteCashSavedFilePassword,
  getSavedCashWhatsappNumber,
  upsertCashWhatsappNumber,
  getCompanyCashRoutine,
  saveCompanyCashRoutine,
  sendCashSummaryViaFoodNext
} from '../services/cashReconciliationService';
import {
  extractSavedPasswordsFromRules,
  loadSavedFilePasswordsFromStorage,
  mergeSavedFilePasswordLists
} from '../utils/cashFilePasswordHelper.mjs';
import { CashUploadDropzone, UploadedCashFileItem } from '../components/cash-reconciliation/CashUploadDropzone';
import { CashPasswordPromptModal } from '../components/cash-reconciliation/CashPasswordPromptModal';
import { CashHealthDashboard, CashHealthHistoryCard } from '../components/cash-reconciliation/CashHealthDashboard';
import { CashGeneralDiffModal, GeneralDiffTabKey } from '../components/cash-reconciliation/CashGeneralDiffModal';
import { CashReconciliationWorkbench } from '../components/cash-reconciliation/CashReconciliationWorkbench';
import { CashDashboardOverview } from '../components/cash-reconciliation/CashDashboardOverview';
import { CashWhatsappSendModal } from '../components/cash-reconciliation/CashWhatsappSendModal';
import { CashDeleteConfirmModal } from '../components/cash-reconciliation/CashDeleteConfirmModal';
import {
  CashAiAnalysis,
  CashManualInputs,
  CashReconciliationResult,
  CashReportCompleteness,
  CashResolutionAction,
  CompanyCashRoutineProfile,
  ParsedCashFileResult,
  SavedCashFilePassword,
  formatCents
} from '../types/cashReconciliation';

type CashViewMode = 'dashboard' | 'workspace';

interface WhatsappModalState {
  targetLabel: string;
  summaryText: string;
  storeName: string;
  sessionId: string | null;
  allowEditNumber: boolean;
  saveOnly?: boolean;
}

interface ResolvedExportPayload {
  session: CashSessionRow | null;
  result: CashReconciliationResult | null;
  storeName: string;
  manualInputs: CashManualInputs;
  referenceDate: string;
  operatorName: string;
  shiftLabel: string;
}

function notifyToast(message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, type, duration: 4000 } }));
}

function formatCreatedTimeHm(rawTimestamp?: string | null): string {
  if (!rawTimestamp) return '';
  const str = String(rawTimestamp).trim();
  if (!str) return '';
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
  }
  const match = str.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : '';
}

export default function CashReconciliationPage() {
  const outlet = (useOutletContext() as { showMainSidebar?: boolean; setShowMainSidebar?: (v: boolean) => void }) || {};
  const storeTenantId = useChatStore((s) => s.tenantInfo?.id);
  const storeTenantName = useChatStore((s) => s.tenantInfo?.name);
  const storeTenantSettings = useChatStore((s) => s.tenantInfo?.settings);
  const currentUserEmail = useChatStore((s) => s.currentUserEmail);
  const tenantId = storeTenantId || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id') || '';

  const [viewMode, setViewMode] = useState<CashViewMode>('dashboard');
  const [hydratedTenantId, setHydratedTenantId] = useState<string>('');

  const [files, setFiles] = useState<UploadedCashFileItem[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [passwordModalFileId, setPasswordModalFileId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<CashSessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [rules, setRules] = useState<CashRuleRow[]>([]);
  const [localSavedPasswords, setLocalSavedPasswords] = useState<SavedCashFilePassword[]>([]);
  const [localRoutineOverride, setLocalRoutineOverride] = useState<CompanyCashRoutineProfile | null>(null);
  const [openChecklistNonce, setOpenChecklistNonce] = useState<number>(0);
  const dropzoneContainerRef = useRef<HTMLDivElement>(null);
  const [localSavedWhatsapp, setLocalSavedWhatsapp] = useState<string>('');
  const [schemaMissing, setSchemaMissing] = useState(false);

  const [manualInputs, setManualInputs] = useState<CashManualInputs>({});
  const [manualResolutions, setManualResolutions] = useState<CashResolutionAction[]>([]);

  const [aiAnalysis, setAiAnalysis] = useState<CashAiAnalysis | null>(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [isSendingWhatsapp, setIsSendingWhatsapp] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const isActionLocked = Boolean(busySessionId) || isExportingPdf || isSendingWhatsapp;
  const [whatsappModalState, setWhatsappModalState] = useState<WhatsappModalState | null>(null);
  const [deleteTargetSession, setDeleteTargetSession] = useState<CashSessionRow | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [selectedMirrorKey, setSelectedMirrorKey] = useState<string | null>(null);
  const [generalDiffTab, setGeneralDiffTab] = useState<GeneralDiffTabKey | null>(null);
  const [workbenchResetKey, setWorkbenchResetKey] = useState(0);
  const [autoSaveState, setAutoSaveState] = useState<{
    status: 'idle' | 'pending' | 'saving' | 'saved' | 'local_only' | 'error';
    lastSavedAt?: string | null;
    errorMessage?: string;
  }>({ status: 'idle', lastSavedAt: null });

  const activeTenantRef = useRef<string>('');
  activeTenantRef.current = tenantId;
  const filesRef = useRef<UploadedCashFileItem[]>([]);
  filesRef.current = files;
  const activeSessionIdRef = useRef<string | null>(null);
  activeSessionIdRef.current = activeSessionId;
  const manualInputsRef = useRef<CashManualInputs>({});
  manualInputsRef.current = manualInputs;
  const manualResolutionsRef = useRef<CashResolutionAction[]>([]);
  manualResolutionsRef.current = manualResolutions;
  const aiAnalysisRef = useRef<CashAiAnalysis | null>(null);
  aiAnalysisRef.current = aiAnalysis;
  const currentUserEmailRef = useRef<string>('');
  currentUserEmailRef.current = currentUserEmail || '';
  const rulesRef = useRef<CashRuleRow[]>([]);
  rulesRef.current = rules;
  const closedSessionIdsRef = useRef<Set<string>>(new Set());
  const pdfCleanupRef = useRef<(() => void) | null>(null);
  const lastSyncedCloudSigRef = useRef<{
    sessionId: string | null;
    filesSig: string;
    resolutionsSig: string;
    stateSig: string;
  }>({ sessionId: null, filesSig: '', resolutionsSig: '', stateSig: '' });
  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveInFlightRef = useRef<boolean>(false);
  const autoSaveQueuedRef = useRef<boolean>(false);
  const autoSaveDirtyRef = useRef<boolean>(false);

  const rulesConfig = useMemo(() => mergeCompanyFormulaRules(rules), [rules]);
  const savedFilePasswords = useMemo(
    () => mergeSavedFilePasswordLists(localSavedPasswords, extractSavedPasswordsFromRules(rules)) as SavedCashFilePassword[],
    [localSavedPasswords, rules]
  );

  const routineProfile = useMemo<CompanyCashRoutineProfile>(() => {
    const baseProfile = getCompanyCashRoutine(tenantId, rules);
    if (!localRoutineOverride) return baseProfile;
    return mergeRoutineProfiles(localRoutineOverride, baseProfile) as CompanyCashRoutineProfile;
  }, [tenantId, rules, localRoutineOverride]);

  const savedWhatsappPhone = useMemo(
    () => localSavedWhatsapp || getSavedCashWhatsappNumber(tenantId, rules),
    [tenantId, rules, localSavedWhatsapp]
  );

  const reconciliationResult = useMemo<CashReconciliationResult | null>(() => {
    const validParsed = files.map(f => f.parsed).filter(p => p && p.status === 'ok');
    if (validParsed.length === 0) return null;
    return runCashReconciliation({
      parsedFiles: validParsed,
      rulesConfig,
      manualInputs,
      manualResolutions,
      companyRoutineProfile: routineProfile
    }) as CashReconciliationResult;
  }, [files, rulesConfig, manualInputs, manualResolutions, routineProfile]);

  const historicalStats = useMemo(() => computeHistoricalHealthStats(sessions), [sessions]);

  const sessionDateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      counts.set(s.reference_date, (counts.get(s.reference_date) || 0) + 1);
    }
    return counts;
  }, [sessions]);

  const activeSessionRow = useMemo(
    () => (activeSessionId ? sessions.find((s) => s.id === activeSessionId) || null : null),
    [sessions, activeSessionId]
  );

  const isActiveSessionClosed = useMemo(
    () =>
      Boolean(
        activeSessionId &&
          (closedSessionIdsRef.current.has(activeSessionId) ||
            sessions.some((s) => s.id === activeSessionId && Boolean(s.closed_at)))
      ),
    [activeSessionId, sessions]
  );

  const reconciliationResultRef = useRef<CashReconciliationResult | null>(null);
  reconciliationResultRef.current = reconciliationResult;
  const isActiveSessionClosedRef = useRef<boolean>(false);
  isActiveSessionClosedRef.current = isActiveSessionClosed;
  const activeSessionClosedAtRef = useRef<string | null>(null);
  activeSessionClosedAtRef.current = activeSessionRow?.closed_at || null;

  const activeDraftDate = useMemo(
    () =>
      reconciliationResult?.referenceDate ||
      files.find((f) => f.parsed?.periodStart)?.parsed?.periodStart ||
      '',
    [reconciliationResult?.referenceDate, files]
  );

  const reportCompleteness = useMemo<CashReportCompleteness | null>(() => {
    if (reconciliationResult?.reportCompleteness) {
      return reconciliationResult.reportCompleteness;
    }
    if (files.length > 0) {
      return assessCashReportCompleteness(files, routineProfile) as CashReportCompleteness;
    }
    return null;
  }, [reconciliationResult?.reportCompleteness, files, routineProfile]);

  const routineProfileRef = useRef<CompanyCashRoutineProfile>(routineProfile);
  routineProfileRef.current = routineProfile;
  const rulesConfigRef = useRef(rulesConfig);
  rulesConfigRef.current = rulesConfig;

  useEffect(() => {
    return () => {
      pdfCleanupRef.current?.();
    };
  }, []);

  const resetAutoSaveTracking = useCallback(() => {
    if (autoSaveTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    autoSaveQueuedRef.current = false;
    autoSaveDirtyRef.current = false;
    lastSyncedCloudSigRef.current = { sessionId: null, filesSig: '', resolutionsSig: '', stateSig: '' };
  }, []);

  const persistLocalSafetySnapshot = useCallback((pendingCloudSync: boolean) => {
    const reqTenantId = activeTenantRef.current;
    if (!reqTenantId || typeof window === 'undefined') return;
    const payload = {
      activeSessionId: activeSessionIdRef.current,
      files: filesRef.current,
      manualInputs: manualInputsRef.current,
      manualResolutions: manualResolutionsRef.current,
      aiAnalysis: aiAnalysisRef.current,
      pendingCloudSync
    };
    if (isActiveSessionClosedRef.current && activeSessionIdRef.current) {
      clearActiveCashDraftFromStorage(window.localStorage, reqTenantId);
      if (pendingCloudSync) {
        savePendingClosedPatchToStorage(window.localStorage, reqTenantId, activeSessionIdRef.current, payload);
      } else {
        clearPendingClosedPatchFromStorage(window.localStorage, reqTenantId, activeSessionIdRef.current);
      }
      return;
    }
    saveActiveCashDraftToStorage(window.localStorage, reqTenantId, payload);
  }, []);

  const buildSummaryRowFromResult = useCallback(
    (
      sessionId: string,
      reqTenantId: string,
      resObj: CashReconciliationResult,
      inputsObj: CashManualInputs,
      closedAt: string | null,
      savedAt: string
    ): CashSessionRow => ({
      id: sessionId,
      tenant_id: reqTenantId,
      reference_date: resObj.referenceDate || new Date().toISOString().slice(0, 10),
      shift_label: inputsObj.shiftLabel || 'Diário',
      store_name: resObj.storeName || storeTenantName || null,
      operator_name: resObj.operatorName || null,
      status: resObj.status || 'draft',
      health_score: Number(resObj.healthScore ?? 0),
      system_total_cents: Math.round(Number(resObj.systemTotalCents || 0)),
      real_total_cents: Math.round(Number(resObj.realTotalCents || 0)),
      diff_cents: Math.round(Number(resObj.diffTotalCents || 0)),
      cash_drawer_counted_cents: inputsObj.cashCountedCents ?? null,
      cash_sangria_cents: Math.round(Number(resObj.cashDrawerSummary?.sangriaCents || 0)),
      cash_notes: inputsObj.notes || null,
      reconciled_summary: {},
      closed_at: closedAt,
      created_at: savedAt,
      updated_at: savedAt
    }),
    [storeTenantName]
  );

  const runBackgroundCloudSync = useCallback(async () => {
    if (autoSaveTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (autoSaveInFlightRef.current) {
      autoSaveQueuedRef.current = true;
      return;
    }
    autoSaveInFlightRef.current = true;
    try {
      do {
        autoSaveQueuedRef.current = false;
        const reqTenantId = activeTenantRef.current;
        const currentResult = reconciliationResultRef.current;
        const currentFiles = filesRef.current;
        const currentInputs = manualInputsRef.current;
        const currentResolutions = manualResolutionsRef.current;
        const currentAi = aiAnalysisRef.current;
        const targetSessionId = activeSessionIdRef.current;
        const wasClosed = isActiveSessionClosedRef.current;
        const preservedClosedAt = wasClosed ? (activeSessionClosedAtRef.current || new Date().toISOString()) : null;

        if (!reqTenantId || !currentResult) {
          autoSaveDirtyRef.current = false;
          break;
        }

        const sig = buildCashDraftSyncSignature({
          activeSessionId: targetSessionId,
          files: currentFiles,
          manualInputs: currentInputs,
          manualResolutions: currentResolutions,
          aiAnalysis: currentAi
        });
        if (!sig.hasValidFiles) {
          autoSaveDirtyRef.current = false;
          break;
        }
        if (
          targetSessionId &&
          lastSyncedCloudSigRef.current.sessionId === targetSessionId &&
          lastSyncedCloudSigRef.current.stateSig === sig.stateSignature
        ) {
          autoSaveDirtyRef.current = false;
          persistLocalSafetySnapshot(false);
          break;
        }

        const canSkipFiles = Boolean(
          targetSessionId &&
            !targetSessionId.startsWith('local_') &&
            lastSyncedCloudSigRef.current.sessionId === targetSessionId &&
            lastSyncedCloudSigRef.current.filesSig === sig.filesSignature
        );
        const canSkipItems = Boolean(
          canSkipFiles && lastSyncedCloudSigRef.current.resolutionsSig === sig.resolutionsSignature
        );

        setAutoSaveState((prev) => ({ ...prev, status: 'saving', errorMessage: undefined }));

        const res = await saveCashReconciliationSession({
          tenantId: reqTenantId,
          userEmail: currentUserEmailRef.current || '',
          sessionId: targetSessionId,
          parsedFiles: currentFiles.map((f) => ({ ...f.parsed, fileSizeBytes: f.fileSizeBytes })),
          result: currentResult,
          manualInputs: currentInputs,
          manualResolutions: currentResolutions,
          aiAnalysis: currentAi,
          markClosed: wasClosed,
          preservedClosedAt,
          skipFilesSync: canSkipFiles,
          skipItemsSync: canSkipItems
        });

        if (activeTenantRef.current !== reqTenantId) break;

        if (wasClosed) {
          closedSessionIdsRef.current.add(res.sessionId);
        } else {
          closedSessionIdsRef.current.delete(res.sessionId);
        }

        const syncedSigForSavedState = buildCashDraftSyncSignature({
          activeSessionId: res.sessionId,
          files: currentFiles,
          manualInputs: currentInputs,
          manualResolutions: currentResolutions,
          aiAnalysis: currentAi
        });
        const postSig = buildCashDraftSyncSignature({
          activeSessionId: res.sessionId,
          files: filesRef.current,
          manualInputs: manualInputsRef.current,
          manualResolutions: manualResolutionsRef.current,
          aiAnalysis: aiAnalysisRef.current
        });
        lastSyncedCloudSigRef.current = {
          sessionId: res.sessionId,
          filesSig: sig.filesSignature,
          resolutionsSig: sig.resolutionsSignature,
          stateSig: syncedSigForSavedState.stateSignature
        };

        activeSessionIdRef.current = res.sessionId;
        setActiveSessionId(res.sessionId);
        setSchemaMissing(res.schemaMissing);

        const summaryRow = buildSummaryRowFromResult(
          res.sessionId,
          reqTenantId,
          currentResult,
          currentInputs,
          res.closedAt ?? null,
          res.savedAt
        );
        setSessions((prev) => {
          const existing = prev.find((s) => s.id === res.sessionId);
          const merged = existing
            ? { ...existing, ...summaryRow, created_at: existing.created_at || res.savedAt }
            : summaryRow;
          return [merged, ...prev.filter((s) => s.id !== res.sessionId)];
        });

        if (postSig.stateSignature === syncedSigForSavedState.stateSignature) {
          autoSaveDirtyRef.current = false;
          persistLocalSafetySnapshot(false);
          setAutoSaveState({
            status: res.schemaMissing ? 'local_only' : 'saved',
            lastSavedAt: res.savedAt
          });
        } else {
          autoSaveQueuedRef.current = true;
        }
      } while (autoSaveQueuedRef.current);
    } catch (err: unknown) {
      const errMsg = extractCashErrorMessage(err, 'Falha na sincronização automática.');
      if (activeTenantRef.current) {
        persistLocalSafetySnapshot(true);
        setAutoSaveState((prev) => ({
          status: 'error',
          lastSavedAt: prev.lastSavedAt,
          errorMessage: errMsg
        }));
      }
    } finally {
      autoSaveInFlightRef.current = false;
      if (autoSaveQueuedRef.current) {
        void runBackgroundCloudSync();
      }
    }
  }, [buildSummaryRowFromResult, persistLocalSafetySnapshot]);

  // Ao trocar de empresa: reseta para Dashboard, limpa modais/flags transitórios e hidrata rascunho/senhas locais sem auto-abrir workspace
  useEffect(() => {
    resetAutoSaveTracking();
    closedSessionIdsRef.current.clear();
    setAutoSaveState({ status: 'idle', lastSavedAt: null });
    setViewMode('dashboard');
    setPasswordModalFileId(null);
    setWhatsappModalState(null);
    setDeleteTargetSession(null);
    setBusySessionId(null);
    setIsProcessingFiles(false);
    setIsSaving(false);
    setIsSendingWhatsapp(false);
    setIsExportingPdf(false);
    setIsAnalyzingAi(false);
    setIsDeletingSession(false);
    setLocalRoutineOverride(null);
    setLocalSavedWhatsapp('');
    setSessions([]);
    setRules([]);
    setSchemaMissing(false);
    setSelectedMirrorKey(null);
    setGeneralDiffTab(null);

    if (!tenantId || typeof window === 'undefined') {
      setLocalSavedPasswords([]);
      setFiles([]);
      setActiveSessionId(null);
      setManualInputs({});
      setManualResolutions([]);
      setAiAnalysis(null);
      setWorkbenchResetKey((k) => k + 1);
      setHydratedTenantId(tenantId);
      return;
    }

    setLocalSavedPasswords(loadSavedFilePasswordsFromStorage(window.localStorage, tenantId) as SavedCashFilePassword[]);

    const draft = loadActiveCashDraftFromStorage(window.localStorage, tenantId);
    if (draft && Array.isArray(draft.files) && draft.files.length > 0) {
      setFiles(draft.files);
      setActiveSessionId(draft.activeSessionId || null);
      setManualInputs(draft.manualInputs || {});
      setManualResolutions(draft.manualResolutions || []);
      setAiAnalysis(draft.aiAnalysis || null);
      if (draft.activeSessionId && !draft.pendingCloudSync) {
        const synced = buildCashDraftSyncSignature({
          activeSessionId: draft.activeSessionId,
          files: draft.files,
          manualInputs: draft.manualInputs || {},
          manualResolutions: draft.manualResolutions || [],
          aiAnalysis: draft.aiAnalysis || null
        });
        lastSyncedCloudSigRef.current = {
          sessionId: draft.activeSessionId,
          filesSig: synced.filesSignature,
          resolutionsSig: synced.resolutionsSignature,
          stateSig: synced.stateSignature
        };
        setAutoSaveState({ status: 'saved', lastSavedAt: draft.updatedAt || null });
      } else {
        setAutoSaveState({ status: 'pending', lastSavedAt: draft.updatedAt || null });
      }
    } else {
      setFiles([]);
      setActiveSessionId(null);
      setManualInputs({});
      setManualResolutions([]);
      setAiAnalysis(null);
    }
    setWorkbenchResetKey((k) => k + 1);
    setHydratedTenantId(tenantId);
  }, [tenantId, resetAutoSaveTracking]);

  // Auto-save contínuo (local imediato com fallback + nuvem Supabase com debounce) sempre que qualquer dado muda
  useEffect(() => {
    if (!tenantId || typeof window === 'undefined') return;
    if (hydratedTenantId !== tenantId) return;

    const sig = buildCashDraftSyncSignature({
      activeSessionId,
      files,
      manualInputs,
      manualResolutions,
      aiAnalysis
    });

    if (!sig.hasValidFiles || !reconciliationResult) {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      autoSaveDirtyRef.current = false;
      if (!isActiveSessionClosed) {
        clearActiveCashDraftFromStorage(window.localStorage, tenantId);
      }
      setAutoSaveState((prev) => (prev.status === 'idle' ? prev : { status: 'idle', lastSavedAt: null }));
      return;
    }

    const alreadySynced = Boolean(
      activeSessionId &&
        lastSyncedCloudSigRef.current.sessionId === activeSessionId &&
        lastSyncedCloudSigRef.current.stateSig === sig.stateSignature
    );

    if (alreadySynced) {
      autoSaveDirtyRef.current = false;
      persistLocalSafetySnapshot(false);
      return;
    }

    autoSaveDirtyRef.current = true;
    persistLocalSafetySnapshot(true);
    setAutoSaveState((prev) => (prev.status === 'saving' ? prev : { ...prev, status: 'pending' }));

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void runBackgroundCloudSync();
    }, 1100);
  }, [
    tenantId,
    hydratedTenantId,
    isActiveSessionClosed,
    activeSessionId,
    files,
    manualInputs,
    manualResolutions,
    aiAnalysis,
    reconciliationResult,
    persistLocalSafetySnapshot,
    runBackgroundCloudSync
  ]);

  // Garante flush local imediato e disparo na nuvem caso o usuário feche a aba, navegue ou alterne a janela
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const flushPendingChanges = () => {
      if (!activeTenantRef.current || !reconciliationResultRef.current) return;
      if (!autoSaveDirtyRef.current) return;
      persistLocalSafetySnapshot(true);
      if (!autoSaveInFlightRef.current) {
        void runBackgroundCloudSync();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPendingChanges();
    };
    const handlePageHide = () => flushPendingChanges();
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!activeTenantRef.current || !reconciliationResultRef.current) return;
      if (autoSaveDirtyRef.current) {
        persistLocalSafetySnapshot(true);
      }
      if (autoSaveDirtyRef.current || autoSaveInFlightRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [persistLocalSafetySnapshot, runBackgroundCloudSync]);

  const applyLoadedSession = useCallback((session: CashSessionRow) => {
    if (autoSaveTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    autoSaveDirtyRef.current = false;

    if (session.closed_at) {
      closedSessionIdsRef.current.add(session.id);
    } else {
      closedSessionIdsRef.current.delete(session.id);
    }
    setActiveSessionId(session.id);
    const snap = session.reconciled_summary || {};
    const restoredFiles: UploadedCashFileItem[] = (snap.parsedFilesSnapshot || []).map((pf: ParsedCashFileResult, idx: number) => ({
      id: `saved_${session.id}_${idx}`,
      fileName: pf.fileName,
      fileSizeBytes: 0,
      parsed: pf
    }));
    const restoredInputs: CashManualInputs =
      snap.manualInputs || { cashCountedCents: session.cash_drawer_counted_cents, notes: session.cash_notes || '' };
    const restoredResolutions: CashResolutionAction[] = snap.manualResolutions || [];
    const restoredAi: CashAiAnalysis | null = session.ai_last_analysis || null;

    let effectiveFiles = restoredFiles;
    let effectiveInputs = restoredInputs;
    let effectiveResolutions = restoredResolutions;
    let effectiveAi = restoredAi;
    let recoveredPending = false;

    if (typeof window !== 'undefined' && tenantId) {
      const localActive = loadActiveCashDraftFromStorage(window.localStorage, tenantId);
      const localClosedPatch = loadPendingClosedPatchFromStorage(window.localStorage, tenantId, session.id);
      const recoveryCandidate = shouldPreferLocalDraftOverSession(localClosedPatch, session)
        ? localClosedPatch
        : shouldPreferLocalDraftOverSession(localActive, session)
          ? localActive
          : null;

      if (recoveryCandidate) {
        recoveredPending = true;
        if (Array.isArray(recoveryCandidate.files) && recoveryCandidate.files.length > 0 && !recoveryCandidate.compactedForQuota) {
          effectiveFiles = recoveryCandidate.files;
        }
        if (recoveryCandidate.manualInputs) effectiveInputs = recoveryCandidate.manualInputs;
        if (Array.isArray(recoveryCandidate.manualResolutions)) effectiveResolutions = recoveryCandidate.manualResolutions;
        if (recoveryCandidate.aiAnalysis !== undefined) effectiveAi = recoveryCandidate.aiAnalysis;
      }
    }

    if (recoveredPending) {
      lastSyncedCloudSigRef.current = { sessionId: null, filesSig: '', resolutionsSig: '', stateSig: '' };
      setAutoSaveState({ status: 'pending', lastSavedAt: session.updated_at || session.closed_at || session.created_at || null });
      notifyToast('Alterações locais pendentes desta conferência foram recuperadas e estão sincronizando.', 'info');
    } else {
      const synced = buildCashDraftSyncSignature({
        activeSessionId: session.id,
        files: effectiveFiles,
        manualInputs: effectiveInputs,
        manualResolutions: effectiveResolutions,
        aiAnalysis: effectiveAi
      });
      lastSyncedCloudSigRef.current = {
        sessionId: session.id,
        filesSig: synced.filesSignature,
        resolutionsSig: synced.resolutionsSignature,
        stateSig: synced.stateSignature
      };
      setAutoSaveState({
        status: 'saved',
        lastSavedAt: session.updated_at || session.closed_at || session.created_at || null
      });
    }

    setFiles(effectiveFiles);
    setManualInputs(effectiveInputs);
    setManualResolutions(effectiveResolutions);
    setAiAnalysis(effectiveAi);
    setSelectedMirrorKey(null);
    setGeneralDiffTab(null);
    setWorkbenchResetKey((k) => k + 1);
  }, [tenantId]);

  const loadTenantData = useCallback(async () => {
    if (!tenantId) return;
    const reqTenantId = tenantId;
    try {
      const sessRes = await listCashReconciliationSessions(reqTenantId, 30);
      if (activeTenantRef.current !== reqTenantId) return;
      const rulesRes = await listCashFormulaRules(reqTenantId, sessRes.schemaMissing);
      if (activeTenantRef.current !== reqTenantId) return;

      setSessions(sessRes.sessions);
      setRules(rulesRes.rules);
      setSchemaMissing(sessRes.schemaMissing || rulesRes.schemaMissing);

      // Aprende rotina inicial a partir de até 4 sessões recentes quando a empresa ainda não possui bancos aprendidos
      const loadedProfile = getCompanyCashRoutine(reqTenantId, rulesRes.rules);
      if (Object.keys(loadedProfile.banks).length === 0 && sessRes.sessions.length > 0) {
        try {
          const recentTargets = sessRes.sessions.slice(0, 4);
          const loadedFull = await Promise.all(
            recentTargets.map((s) =>
              loadCashReconciliationSession(reqTenantId, s.id).catch(() => null)
            )
          );
          if (activeTenantRef.current !== reqTenantId) return;
          const validFullSessions = loadedFull.filter((s): s is CashSessionRow => Boolean(s));
          if (validFullSessions.length > 0) {
            const { profile: bootstrapped, changed } = bootstrapRoutineFromSessions(
              loadedProfile,
              validFullSessions
            ) as { profile: CompanyCashRoutineProfile; changed: boolean };

            if (changed) {
              setLocalRoutineOverride(bootstrapped);
              const savedRoutine = await saveCompanyCashRoutine(reqTenantId, bootstrapped);
              if (activeTenantRef.current !== reqTenantId) return;
              if (savedRoutine.rule) {
                setRules((prev) => [
                  savedRoutine.rule!,
                  ...prev.filter((r) => r.id !== savedRoutine.rule!.id)
                ]);
              }
              const learnedNames = Object.values(bootstrapped.banks || {}).map((b) => b.bankLabel);
              if (learnedNames.length > 0) {
                logCashReconciliationEvent({
                  level: 'info',
                  message: `Rotina bancária aprendida do histórico: ${learnedNames.join(', ')}`,
                  tenantId: reqTenantId,
                  requiresAction: false,
                  details: {
                    action: 'routine_bootstrap',
                    banks: Object.keys(bootstrapped.banks),
                    sessionsInspected: validFullSessions.length
                  }
                });
              }
            }
          }
        } catch (bootstrapErr) {
          console.warn('[Conferência Caixa] Falha ao inicializar rotina bancária do histórico:', bootstrapErr);
        }
      }
    } catch (err: unknown) {
      if (activeTenantRef.current !== reqTenantId) return;
      logCashUnexpectedError({
        action: 'carregar histórico',
        err,
        tenantId: reqTenantId
      });
    }
  }, [tenantId]);

  useEffect(() => {
    void loadTenantData();
  }, [loadTenantData]);

  const applyRoutineLearning = useCallback(
    async (validParsedFiles: ParsedCashFileResult[], inferredDate = '', targetTenantId = tenantId) => {
      const reqTenantId = targetTenantId;
      if (!reqTenantId || validParsedFiles.length === 0) return;
      if (activeTenantRef.current !== reqTenantId) return;

      const currentProfile = routineProfileRef.current || getCompanyCashRoutine(reqTenantId, rulesRef.current);
      const prevBankKeys = new Set(Object.keys(currentProfile.banks || {}));

      const { profile: nextProfile, changed } = learnRoutineFromParsedFiles(
        currentProfile,
        validParsedFiles,
        inferredDate
      ) as { profile: CompanyCashRoutineProfile; changed: boolean };

      if (!changed) return;

      const newlyLearnedBanks = Object.values(nextProfile.banks || {}).filter(
        (b) => b && !prevBankKeys.has(b.bankKey)
      );

      setLocalRoutineOverride(nextProfile);
      const savedRes = await saveCompanyCashRoutine(reqTenantId, nextProfile);
      if (activeTenantRef.current !== reqTenantId) return;

      if (savedRes.rule) {
        setRules((prev) => [
          savedRes.rule!,
          ...prev.filter((r) => r.id !== savedRes.rule!.id)
        ]);
      }

      if (newlyLearnedBanks.length > 0) {
        logCashReconciliationEvent({
          level: 'info',
          message: `Novo(s) banco(s) aprendido(s) na rotina da empresa: ${newlyLearnedBanks.map((b) => b.bankLabel).join(', ')}`,
          tenantId: reqTenantId,
          requiresAction: false,
          details: {
            action: 'routine_learn_bank',
            banks: newlyLearnedBanks.map((b) => ({
              bankKey: b.bankKey,
              bankLabel: b.bankLabel,
              acctLast4: b.acctLast4 || ''
            }))
          }
        });
      }
    },
    [tenantId]
  );

  const handleAddFiles = async (fileList: FileList | File[]) => {
    const reqTenantId = tenantId;
    setIsProcessingFiles(true);
    try {
      const incoming = Array.from(fileList);
      const parsedItems: UploadedCashFileItem[] = [];
      const currentSavedPasswords = reqTenantId ? getMergedSavedFilePasswords(reqTenantId, rules) : savedFilePasswords;
      let autoUnlockedCount = 0;

      for (const file of incoming) {
        const arrayBuffer = await file.arrayBuffer();
        if (activeTenantRef.current !== reqTenantId) return;

        let matchedAutoPassword = '';
        const parsed = await parseUploadedCashFile({
          fileName: file.name,
          arrayBuffer,
          rulesConfig,
          savedPasswords: currentSavedPasswords,
          tenantSettings: storeTenantSettings,
          onPasswordMatched: (pwd: string) => {
            matchedAutoPassword = pwd;
          }
        });
        if (activeTenantRef.current !== reqTenantId) return;

        logCashFileParseResult({
          stage: 'upload',
          fileName: file.name,
          fileSizeBytes: file.size,
          parsed,
          tenantId: reqTenantId
        });
        if (parsed.status === 'ok' && parsed.summary?.autoUnlocked) {
          autoUnlockedCount += 1;
          if (reqTenantId && matchedAutoPassword && !currentSavedPasswords.some(sp => sp.password === matchedAutoPassword)) {
            void upsertCashSavedFilePassword(reqTenantId, {
              fileName: file.name,
              fileType: parsed.fileType,
              password: matchedAutoPassword
            }).then((savedRes) => {
              if (activeTenantRef.current !== reqTenantId) return;
              if (typeof window !== 'undefined') {
                setLocalSavedPasswords(loadSavedFilePasswordsFromStorage(window.localStorage, reqTenantId) as SavedCashFilePassword[]);
              }
              if (savedRes.rule) {
                setRules(prev => [savedRes.rule!, ...prev.filter(r => r.id !== savedRes.rule!.id)]);
              }
            });
          }
        }
        parsedItems.push({
          id: `${file.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          fileName: file.name,
          fileSizeBytes: file.size,
          arrayBuffer,
          parsed
        });
      }

      if (activeTenantRef.current !== reqTenantId) return;

      setFiles((prev) => {
        const SINGLETON_SYSTEM_TYPES = new Set([
          'pdv_vendas',
          'pdv_itens_vendidos',
          'pdv_cancelamentos',
          'pdv_descontos',
          'rel_conferencia',
          'fechamento_txt',
          'fechamento_resumo_txt'
        ]);
        const byType = new Map<string, UploadedCashFileItem>();
        for (const existing of prev) {
          const key = existing.parsed?.fileType && SINGLETON_SYSTEM_TYPES.has(existing.parsed.fileType)
            ? existing.parsed.fileType
            : existing.id;
          byType.set(key, existing);
        }
        for (const item of parsedItems) {
          const key = item.parsed?.fileType && SINGLETON_SYSTEM_TYPES.has(item.parsed.fileType)
            ? item.parsed.fileType
            : item.id;
          byType.set(key, item);
        }
        return Array.from(byType.values());
      });

      const okParsed = parsedItems.map(it => it.parsed).filter(p => p && p.status === 'ok');
      if (okParsed.length > 0) {
        const inferredDate = okParsed.map(p => p.periodStart || p.periodEnd).find(Boolean) || '';
        void applyRoutineLearning(okParsed, inferredDate, reqTenantId).catch((learnErr) => {
          console.warn('[Conferência Caixa] Falha ao atualizar rotina no upload:', learnErr);
        });
      }

      const firstLocked = parsedItems.find(it => it.parsed?.status === 'password_required');
      if (firstLocked) {
        setPasswordModalFileId(firstLocked.id);
      }
      const failedCount = parsedItems.filter(it => it.parsed?.status === 'error').length;
      if (failedCount > 0) {
        const firstErr = parsedItems.find(it => it.parsed?.status === 'error');
        notifyToast(firstErr?.parsed?.errorMessage || 'Alguns arquivos não foram reconhecidos.', 'error');
      }
      if (autoUnlockedCount > 0) {
        notifyToast(
          `${autoUnlockedCount} planilha(s) protegida(s) aberta(s) automaticamente com a senha fixa salva!`,
          'success'
        );
      }
    } catch (err: unknown) {
      if (activeTenantRef.current !== reqTenantId) return;
      logCashUnexpectedError({
        action: 'processar arquivos enviados',
        err,
        tenantId: reqTenantId
      });
      notifyToast(extractCashErrorMessage(err, 'Erro inesperado ao processar arquivo.'), 'error');
    } finally {
      if (activeTenantRef.current === reqTenantId) {
        setIsProcessingFiles(false);
      }
    }
  };

  const handleUnlockPasswordFile = async (fileId: string, password: string, saveFixed = true): Promise<boolean> => {
    const reqTenantId = tenantId;
    const target = filesRef.current.find(f => f.id === fileId);
    if (!target) return false;
    setIsProcessingFiles(true);
    try {
      let matchedPassword = '';
      const parsed = await parseUploadedCashFile({
        fileName: target.fileName,
        arrayBuffer: target.arrayBuffer,
        password,
        rulesConfig,
        onPasswordMatched: (pwd: string) => {
          matchedPassword = pwd;
        }
      });
      if (activeTenantRef.current !== reqTenantId) return false;

      logCashFileParseResult({
        stage: 'password_unlock',
        fileName: target.fileName,
        fileSizeBytes: target.fileSizeBytes,
        parsed,
        tenantId: reqTenantId,
        passwordLength: password.trim().length
      });

      const effectivePassword = matchedPassword || (parsed.status !== 'password_required' ? password : '');
      if (saveFixed && effectivePassword && reqTenantId && parsed.status !== 'password_required') {
        const savedRes = await upsertCashSavedFilePassword(reqTenantId, {
          fileName: target.fileName,
          fileType: parsed.fileType,
          password: effectivePassword
        });
        if (activeTenantRef.current !== reqTenantId) return false;
        if (typeof window !== 'undefined') {
          setLocalSavedPasswords(loadSavedFilePasswordsFromStorage(window.localStorage, reqTenantId) as SavedCashFilePassword[]);
        }
        if (savedRes.rule) {
          setRules(prev => [savedRes.rule!, ...prev.filter(r => r.id !== savedRes.rule!.id)]);
        }
      }

      if (parsed.status !== 'ok') {
        let nextRemainingLockedId: string | null = parsed.status === 'password_required' ? fileId : null;
        setFiles(prev => {
          const nextFiles = prev.map(f => (f.id === fileId ? { ...f, parsed } : f));
          if (parsed.status !== 'password_required') {
            nextRemainingLockedId = nextFiles.find(f => f.parsed?.status === 'password_required')?.id || null;
          }
          return nextFiles;
        });
        setPasswordModalFileId(nextRemainingLockedId);
        notifyToast(parsed.errorMessage || 'Senha inválida.', 'error');
        return false;
      }

      const unlockedPeers = new Map<string, ParsedCashFileResult>([[fileId, parsed]]);

      for (const peer of filesRef.current) {
        if (peer.id === fileId || peer.parsed?.status !== 'password_required' || !peer.arrayBuffer) continue;
        const peerParsed = await parseUploadedCashFile({
          fileName: peer.fileName,
          arrayBuffer: peer.arrayBuffer,
          password: effectivePassword,
          rulesConfig
        });
        if (activeTenantRef.current !== reqTenantId) return false;
        logCashFileParseResult({
          stage: 'password_unlock',
          fileName: peer.fileName,
          fileSizeBytes: peer.fileSizeBytes,
          parsed: peerParsed,
          tenantId: reqTenantId,
          passwordLength: effectivePassword.length
        });
        if (peerParsed.status === 'ok') {
          unlockedPeers.set(peer.id, peerParsed);
        }
      }

      let nextRemainingLockedId: string | null = null;
      setFiles(prev => {
        const nextFiles = prev.map(f => (unlockedPeers.has(f.id) ? { ...f, parsed: unlockedPeers.get(f.id)! } : f));
        nextRemainingLockedId = nextFiles.find(f => f.parsed?.status === 'password_required')?.id || null;
        return nextFiles;
      });
      setPasswordModalFileId(nextRemainingLockedId);

      const unlockedList = Array.from(unlockedPeers.values());
      const inferredDate = unlockedList.map(p => p.periodStart || p.periodEnd).find(Boolean) || '';
      void applyRoutineLearning(unlockedList, inferredDate, reqTenantId).catch((learnErr) => {
        console.warn('[Conferência Caixa] Falha ao atualizar rotina após desbloqueio:', learnErr);
      });

      notifyToast(
        saveFixed
          ? `Arquivo "${target.fileName}" desbloqueado e senha fixa salva para os próximos envios!`
          : `Arquivo "${target.fileName}" desbloqueado com sucesso!`,
        'success'
      );
      return true;
    } catch (err: unknown) {
      if (activeTenantRef.current !== reqTenantId) return false;
      logCashUnexpectedError({
        action: 'desbloquear planilha protegida',
        err,
        tenantId: reqTenantId,
        context: { fileId, fileName: target.fileName, fileSizeBytes: target.fileSizeBytes }
      });
      notifyToast(extractCashErrorMessage(err, 'Erro inesperado ao desbloquear planilha.'), 'error');
      return false;
    } finally {
      if (activeTenantRef.current === reqTenantId) {
        setIsProcessingFiles(false);
      }
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleResetNew = () => {
    resetAutoSaveTracking();
    if (tenantId && typeof window !== 'undefined') {
      if (activeSessionId) {
        clearPendingClosedPatchFromStorage(window.localStorage, tenantId, activeSessionId);
      }
      clearActiveCashDraftFromStorage(window.localStorage, tenantId);
    }
    setPasswordModalFileId(null);
    setActiveSessionId(null);
    setFiles([]);
    setManualInputs({});
    setManualResolutions([]);
    setAiAnalysis(null);
    setSelectedMirrorKey(null);
    setGeneralDiffTab(null);
    setAutoSaveState({ status: 'idle', lastSavedAt: null });
    setWorkbenchResetKey((k) => k + 1);
  };

  const handleLoadSession = async (sessionId: string) => {
    const reqTenantId = tenantId;
    if (!reqTenantId || isActionLocked) return;
    setBusySessionId(sessionId);
    try {
      const fullSession = await loadCashReconciliationSession(reqTenantId, sessionId);
      if (activeTenantRef.current !== reqTenantId) return;
      if (!fullSession) {
        notifyToast('Não foi possível carregar os detalhes completos deste fechamento.', 'error');
        return;
      }
      applyLoadedSession(fullSession);
      setViewMode('workspace');
    } catch (err: unknown) {
      if (activeTenantRef.current !== reqTenantId) return;
      logCashUnexpectedError({
        action: 'abrir sessão salva',
        err,
        tenantId: reqTenantId,
        context: { sessionId }
      });
      notifyToast(extractCashErrorMessage(err, 'Erro ao abrir sessão salva.'), 'error');
    } finally {
      if (activeTenantRef.current === reqTenantId) {
        setBusySessionId((prev) => (prev === sessionId ? null : prev));
      }
    }
  };

  const handleSaveSession = async (markClosed = false) => {
    const reqTenantId = tenantId;
    if (!reqTenantId || !reconciliationResult) return;
    if (autoSaveTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setIsSaving(true);
    try {
      const validParsed = files.map(f => f.parsed).filter(p => p && p.status === 'ok');
      const res = await saveCashReconciliationSession({
        tenantId: reqTenantId,
        userEmail: currentUserEmail || '',
        sessionId: activeSessionId,
        parsedFiles: files.map(f => ({ ...f.parsed, fileSizeBytes: f.fileSizeBytes })),
        result: reconciliationResult,
        manualInputs,
        manualResolutions,
        aiAnalysis,
        markClosed
      });
      if (activeTenantRef.current !== reqTenantId) return;

      if (markClosed) {
        closedSessionIdsRef.current.add(res.sessionId);
        setSessions((prev) =>
          prev.map((s) => (s.id === res.sessionId ? { ...s, closed_at: res.savedAt } : s))
        );
      } else {
        closedSessionIdsRef.current.delete(res.sessionId);
        setSessions((prev) =>
          prev.map((s) => (s.id === res.sessionId ? { ...s, closed_at: null } : s))
        );
      }

      const synced = buildCashDraftSyncSignature({
        activeSessionId: res.sessionId,
        files,
        manualInputs,
        manualResolutions,
        aiAnalysis
      });
      lastSyncedCloudSigRef.current = {
        sessionId: res.sessionId,
        filesSig: synced.filesSignature,
        resolutionsSig: synced.resolutionsSignature,
        stateSig: synced.stateSignature
      };
      autoSaveDirtyRef.current = false;

      setActiveSessionId(res.sessionId);
      setSchemaMissing(res.schemaMissing);
      setAutoSaveState({
        status: res.schemaMissing ? 'local_only' : 'saved',
        lastSavedAt: res.savedAt
      });
      if (typeof window !== 'undefined') {
        clearPendingClosedPatchFromStorage(window.localStorage, reqTenantId, res.sessionId);
        if (markClosed) {
          clearActiveCashDraftFromStorage(window.localStorage, reqTenantId);
        } else {
          saveActiveCashDraftToStorage(window.localStorage, reqTenantId, {
            activeSessionId: res.sessionId,
            files,
            manualInputs,
            manualResolutions,
            aiAnalysis,
            pendingCloudSync: false
          });
        }
      }
      await applyRoutineLearning(validParsed, reconciliationResult.referenceDate || '', reqTenantId);
      if (activeTenantRef.current !== reqTenantId) return;
      await loadTenantData();
      if (activeTenantRef.current !== reqTenantId) return;

      notifyToast(
        markClosed
          ? 'Conferência fechada e salva no histórico!'
          : res.schemaMissing
            ? 'Rascunho salvo localmente (execute DB_SETUP_CASH_RECONCILIATION.sql para sincronizar no Supabase).'
            : 'Rascunho salvo! Você pode sair da tela e continuar depois.',
        res.schemaMissing ? 'warning' : 'success'
      );
    } catch (err: unknown) {
      if (activeTenantRef.current !== reqTenantId) return;
      logCashUnexpectedError({
        action: markClosed ? 'fechar caixa' : 'salvar rascunho',
        err,
        tenantId: reqTenantId,
        context: { activeSessionId, filesCount: files.length }
      });
      notifyToast(`Erro ao salvar: ${extractCashErrorMessage(err)}`, 'error');
    } finally {
      if (activeTenantRef.current === reqTenantId) {
        setIsSaving(false);
      }
    }
  };

  const persistRoutineProfileChange = async (
    nextProfile: CompanyCashRoutineProfile,
    context: Record<string, unknown>,
    actionLabel: string,
    successMessage = 'Rotina da empresa atualizada!'
  ) => {
    const reqTenantId = tenantId;
    if (!reqTenantId) return;
    setLocalRoutineOverride(nextProfile);
    try {
      const savedRes = await saveCompanyCashRoutine(reqTenantId, nextProfile);
      if (activeTenantRef.current !== reqTenantId) return;
      if (savedRes.rule) {
        setRules((prev) => [savedRes.rule!, ...prev.filter((r) => r.id !== savedRes.rule!.id)]);
      }
      notifyToast(successMessage, 'success');
    } catch (err: unknown) {
      if (activeTenantRef.current !== reqTenantId) return;
      logCashUnexpectedError({
        action: actionLabel,
        err,
        tenantId: reqTenantId,
        context
      });
      notifyToast(extractCashErrorMessage(err, 'Erro ao atualizar rotina da empresa.'), 'error');
    }
  };

  const handleToggleRoutineBank = async (bankKey: string, enabled: boolean) => {
    const nextProfile = toggleRoutineBankExpected(routineProfile, bankKey, enabled) as CompanyCashRoutineProfile;
    await persistRoutineProfileChange(nextProfile, { bankKey, enabled }, 'atualizar rotina bancária da empresa');
  };

  const handleToggleRoutineReport = async (fileType: string, enabled: boolean) => {
    const nextProfile = toggleRoutineReportExpected(routineProfile, fileType, enabled) as CompanyCashRoutineProfile;
    await persistRoutineProfileChange(nextProfile, { fileType, enabled }, 'atualizar rotina de relatórios da empresa');
  };

  const handleAddRoutineBank = async (bank: { bankCode: string; bankLabel: string; acctLast4?: string }) => {
    const bankCode = String(bank.bankCode || '').trim();
    const bankKey = bankCode ? `banco_${bankCode}` : `banco_${String(bank.bankLabel || 'ofx').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const nextProfile = toggleRoutineBankExpected(routineProfile, bankKey, true, {
      bankCode,
      bankLabel: bank.bankLabel,
      acctLast4: bank.acctLast4 || ''
    }) as CompanyCashRoutineProfile;
    await persistRoutineProfileChange(
      nextProfile,
      { bankKey, acctLast4: bank.acctLast4 || '' },
      'salvar banco esperado na rotina da empresa',
      `${bank.bankLabel} salvo na rotina esperada da empresa!`
    );
  };

  const handleConfirmDeleteSession = async (sessionId: string) => {
    const reqTenantId = tenantId;
    if (!reqTenantId) return;
    setIsDeletingSession(true);
    try {
      await deleteCashReconciliationSession(reqTenantId, sessionId);
      if (activeTenantRef.current !== reqTenantId) return;
      closedSessionIdsRef.current.delete(sessionId);
      if (typeof window !== 'undefined') {
        clearPendingClosedPatchFromStorage(window.localStorage, reqTenantId, sessionId);
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        handleResetNew();
        setViewMode('dashboard');
      }
      setDeleteTargetSession(null);
      logCashReconciliationEvent({
        level: 'info',
        message: 'Fechamento de caixa removido pela interface.',
        tenantId: reqTenantId,
        requiresAction: false,
        details: { action: 'ui_delete_session', sessionId }
      });
      notifyToast('Fechamento excluído com sucesso!', 'success');
    } catch (err: unknown) {
      if (activeTenantRef.current !== reqTenantId) return;
      logCashUnexpectedError({
        action: 'excluir fechamento de caixa',
        err,
        tenantId: reqTenantId,
        context: { sessionId }
      });
      notifyToast(extractCashErrorMessage(err, 'Erro ao excluir fechamento.'), 'error');
    } finally {
      if (activeTenantRef.current === reqTenantId) {
        setIsDeletingSession(false);
      }
    }
  };

  const buildWorkspaceSessionRow = (): CashSessionRow | null => {
    if (!activeSessionId) return null;
    if (activeSessionRow) return activeSessionRow;
    if (!reconciliationResult) return null;
    return {
      id: activeSessionId,
      tenant_id: tenantId,
      reference_date: reconciliationResult.referenceDate || new Date().toISOString().slice(0, 10),
      shift_label: manualInputs.shiftLabel || 'Diário',
      store_name: reconciliationResult.storeName || storeTenantName || null,
      operator_name: reconciliationResult.operatorName || null,
      status: reconciliationResult.status || 'draft',
      health_score: reconciliationResult.healthScore ?? 0,
      system_total_cents: reconciliationResult.systemTotalCents ?? 0,
      real_total_cents: reconciliationResult.realTotalCents ?? 0,
      diff_cents: reconciliationResult.diffTotalCents ?? 0,
      cash_drawer_counted_cents: manualInputs.cashCountedCents ?? null,
      cash_sangria_cents: reconciliationResult.cashDrawerSummary?.sangriaCents ?? 0,
      cash_notes: manualInputs.notes || null,
      reconciled_summary: {},
      closed_at: isActiveSessionClosed ? new Date().toISOString() : null
    };
  };

  const resolveExportPayload = async (sessionRow?: CashSessionRow | null): Promise<ResolvedExportPayload | null> => {
    const reqTenantId = tenantId;
    if (!sessionRow || (sessionRow.id === activeSessionId && reconciliationResult)) {
      if (!reconciliationResult) {
        notifyToast('Carregue os arquivos da conferência antes de exportar.', 'warning');
        return null;
      }
      const effectiveSession =
        activeSessionRow || sessionRow || (activeSessionId ? buildWorkspaceSessionRow() : null);
      const effectiveStoreName =
        reconciliationResult.storeName || effectiveSession?.store_name || storeTenantName || 'Empresa';
      return {
        session: effectiveSession,
        result: reconciliationResult,
        storeName: effectiveStoreName,
        manualInputs,
        referenceDate: reconciliationResult.referenceDate || effectiveSession?.reference_date || '',
        operatorName: reconciliationResult.operatorName || effectiveSession?.operator_name || '',
        shiftLabel: manualInputs.shiftLabel || effectiveSession?.shift_label || 'Diário'
      };
    }

    if (!reqTenantId) return null;
    setBusySessionId(sessionRow.id);
    try {
      const fullSession = await loadCashReconciliationSession(reqTenantId, sessionRow.id);
      if (activeTenantRef.current !== reqTenantId) return null;
      if (!fullSession) {
        notifyToast('Não foi possível carregar os detalhes completos deste fechamento.', 'error');
        return null;
      }
      const snap = fullSession.reconciled_summary || {};
      const snapManualInputs: CashManualInputs = snap.manualInputs || {
        cashCountedCents: fullSession.cash_drawer_counted_cents,
        notes: fullSession.cash_notes || '',
        shiftLabel: fullSession.shift_label || 'Diário'
      };
      const snapResolutions: CashResolutionAction[] = Array.isArray(snap.manualResolutions)
        ? snap.manualResolutions
        : [];
      const validSnapshotFiles = Array.isArray(snap.parsedFilesSnapshot)
        ? snap.parsedFilesSnapshot.filter((pf) => pf && pf.status === 'ok')
        : [];

      const reconstructedResult =
        validSnapshotFiles.length > 0
          ? (runCashReconciliation({
              parsedFiles: validSnapshotFiles,
              rulesConfig: rulesConfigRef.current,
              manualInputs: snapManualInputs,
              manualResolutions: snapResolutions,
              companyRoutineProfile: routineProfileRef.current
            }) as CashReconciliationResult)
          : null;

      const effectiveStoreName =
        reconstructedResult?.storeName || fullSession.store_name || storeTenantName || 'Empresa';

      return {
        session: fullSession,
        result: reconstructedResult,
        storeName: effectiveStoreName,
        manualInputs: snapManualInputs,
        referenceDate: reconstructedResult?.referenceDate || fullSession.reference_date || '',
        operatorName: reconstructedResult?.operatorName || fullSession.operator_name || '',
        shiftLabel: snapManualInputs.shiftLabel || fullSession.shift_label || 'Diário'
      };
    } catch (err: unknown) {
      if (activeTenantRef.current !== reqTenantId) return null;
      logCashUnexpectedError({
        action: 'carregar dados para exportação',
        err,
        tenantId: reqTenantId,
        context: { sessionId: sessionRow.id }
      });
      notifyToast(extractCashErrorMessage(err, 'Erro ao carregar dados do fechamento.'), 'error');
      return null;
    } finally {
      if (activeTenantRef.current === reqTenantId) {
        setBusySessionId((prev) => (prev === sessionRow.id ? null : prev));
      }
    }
  };

  const persistWhatsappPhoneIfRequested = async (reqTenantId: string, phone: string) => {
    const saved = await upsertCashWhatsappNumber(reqTenantId, phone);
    if (activeTenantRef.current !== reqTenantId) return saved;
    setLocalSavedWhatsapp(saved.phone);
    if (saved.rule) {
      setRules((prev) => [saved.rule!, ...prev.filter((r) => r.id !== saved.rule!.id)]);
    }
    return saved;
  };

  const handleTriggerWhatsappSend = async (sessionRow?: CashSessionRow | null, forceEditNumber = false) => {
    const reqTenantId = tenantId;
    if (!reqTenantId || isActionLocked) return;
    const payload = await resolveExportPayload(sessionRow);
    if (activeTenantRef.current !== reqTenantId || !payload) return;

    const summaryText = buildCashWhatsappSummaryMessage({
      result: payload.result,
      session: payload.session,
      storeName: payload.storeName,
      manualInputs: payload.manualInputs
    }) as string;

    const dateBr = formatDateBr(payload.referenceDate) || 'Fechamento';
    const targetLabel = [dateBr, payload.operatorName, payload.shiftLabel].filter(Boolean).join(' • ');

    if (savedWhatsappPhone && !forceEditNumber) {
      setIsSendingWhatsapp(true);
      if (sessionRow?.id) setBusySessionId(sessionRow.id);
      try {
        const sent = await sendCashSummaryViaFoodNext({
          tenantId: reqTenantId,
          recipientPhone: savedWhatsappPhone,
          summaryText,
          storeName: payload.storeName
        });
        if (activeTenantRef.current !== reqTenantId) return;
        notifyToast(`Resumo enviado por WhatsApp (FoodNext) para ${sent.sentTo}!`, 'success');
      } catch (err: unknown) {
        if (activeTenantRef.current !== reqTenantId) return;
        notifyToast(extractCashErrorMessage(err, 'Erro ao enviar resumo pelo WhatsApp FoodNext.'), 'error');
      } finally {
        if (activeTenantRef.current === reqTenantId) {
          setIsSendingWhatsapp(false);
          if (sessionRow?.id) setBusySessionId((prev) => (prev === sessionRow.id ? null : prev));
        }
      }
      return;
    }

    setWhatsappModalState({
      targetLabel,
      summaryText,
      storeName: payload.storeName,
      sessionId: payload.session?.id || activeSessionId || null,
      allowEditNumber: true,
      saveOnly: false
    });
  };

  const handleOpenWhatsappNumberEditor = () => {
    if (!tenantId) return;
    setWhatsappModalState({
      targetLabel: 'Número WhatsApp padrão desta empresa',
      summaryText: '',
      storeName: storeTenantName || 'Empresa',
      sessionId: null,
      allowEditNumber: true,
      saveOnly: true
    });
  };

  const handleSubmitWhatsappModal = async (phone: string, saveFixed: boolean) => {
    const reqTenantId = tenantId;
    const modalSnapshot = whatsappModalState;
    if (!reqTenantId || !modalSnapshot) return;
    setIsSendingWhatsapp(true);
    try {
      if (modalSnapshot.saveOnly || !modalSnapshot.summaryText.trim()) {
        const saved = await persistWhatsappPhoneIfRequested(reqTenantId, phone);
        if (activeTenantRef.current !== reqTenantId) return;
        logCashReconciliationEvent({
          level: 'info',
          message: 'Número padrão de WhatsApp salvo para futuros envios de fechamento.',
          tenantId: reqTenantId,
          requiresAction: false,
          details: { action: 'whatsapp_number_saved', phone: saved.phone }
        });
        setWhatsappModalState(null);
        notifyToast('Número padrão de WhatsApp salvo com sucesso!', 'success');
        return;
      }

      const sent = await sendCashSummaryViaFoodNext({
        tenantId: reqTenantId,
        recipientPhone: phone,
        summaryText: modalSnapshot.summaryText,
        storeName: modalSnapshot.storeName
      });
      if (activeTenantRef.current !== reqTenantId) return;

      if (saveFixed) {
        await persistWhatsappPhoneIfRequested(reqTenantId, phone);
        if (activeTenantRef.current !== reqTenantId) return;
      }

      setWhatsappModalState(null);
      notifyToast(
        saveFixed
          ? `Resumo enviado por WhatsApp (FoodNext) para ${sent.sentTo} e número salvo!`
          : `Resumo enviado por WhatsApp (FoodNext) para ${sent.sentTo}!`,
        'success'
      );
    } catch (err: unknown) {
      if (activeTenantRef.current !== reqTenantId) return;
      notifyToast(extractCashErrorMessage(err, 'Erro ao enviar resumo pelo WhatsApp FoodNext.'), 'error');
    } finally {
      if (activeTenantRef.current === reqTenantId) {
        setIsSendingWhatsapp(false);
      }
    }
  };

  const handleExportPdf = async (sessionRow?: CashSessionRow | null) => {
    if (typeof document === 'undefined' || isActionLocked) return;
    const reqTenantId = tenantId;
    setIsExportingPdf(true);
    try {
      const payload = await resolveExportPayload(sessionRow);
      if (activeTenantRef.current !== reqTenantId || !payload) return;

      const html = buildCashPdfReportHtml({
        result: payload.result,
        session: payload.session,
        storeName: payload.storeName,
        manualInputs: payload.manualInputs
      }) as string;

      pdfCleanupRef.current?.();

      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';

      let cleaned = false;
      let fallbackTimer = 0;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        window.clearTimeout(fallbackTimer);
        if (pdfCleanupRef.current === cleanup) {
          pdfCleanupRef.current = null;
        }
        iframe.remove();
      };
      pdfCleanupRef.current = cleanup;
      fallbackTimer = window.setTimeout(cleanup, 60_000);

      iframe.onerror = cleanup;
      iframe.onload = () => {
        try {
          const win = iframe.contentWindow;
          if (!win) {
            cleanup();
            return;
          }
          win.addEventListener('afterprint', cleanup, { once: true });
          window.setTimeout(() => {
            if (cleaned) return;
            try {
              win.focus();
              win.print();
            } catch (printErr: unknown) {
              if (activeTenantRef.current === reqTenantId) {
                logCashUnexpectedError({
                  action: 'imprimir relatório PDF A4',
                  err: printErr,
                  tenantId: reqTenantId,
                  context: { sessionId: payload.session?.id || activeSessionId || null }
                });
                notifyToast('Não foi possível abrir a janela de impressão do PDF.', 'error');
              }
              cleanup();
            }
          }, 120);
        } catch (onloadErr: unknown) {
          if (activeTenantRef.current === reqTenantId) {
            logCashUnexpectedError({
              action: 'preparar impressão do relatório PDF A4',
              err: onloadErr,
              tenantId: reqTenantId,
              context: { sessionId: payload.session?.id || activeSessionId || null }
            });
          }
          cleanup();
        }
      };

      iframe.srcdoc = html;
      document.body.appendChild(iframe);

      logCashReconciliationEvent({
        level: 'info',
        message: `Relatório PDF A4 preparado para impressão (${formatDateBr(payload.referenceDate) || 'atual'}).`,
        tenantId: reqTenantId,
        requiresAction: false,
        details: {
          action: 'export_pdf',
          sessionId: payload.session?.id || activeSessionId || null,
          referenceDate: payload.referenceDate || null
        }
      });
    } catch (err: unknown) {
      if (activeTenantRef.current !== reqTenantId) return;
      logCashUnexpectedError({
        action: 'gerar relatório PDF A4',
        err,
        tenantId: reqTenantId,
        context: { sessionId: sessionRow?.id || activeSessionId || null }
      });
      notifyToast(extractCashErrorMessage(err, 'Erro ao gerar relatório PDF.'), 'error');
    } finally {
      if (activeTenantRef.current === reqTenantId) {
        setIsExportingPdf(false);
      }
    }
  };

  const handleRunAiAnalysis = async (question?: string) => {
    const reqTenantId = tenantId;
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
      if (activeTenantRef.current !== reqTenantId) return;
      setAiAnalysis(analysis);
      notifyToast('Auditoria com IA concluída!', 'success');
    } catch (err: unknown) {
      if (activeTenantRef.current !== reqTenantId) return;
      logCashUnexpectedError({
        action: 'consultar Auditor IA',
        err,
        tenantId: reqTenantId,
        context: { questionLength: question?.length || 0 }
      });
      notifyToast(extractCashErrorMessage(err, 'Erro ao consultar IA.'), 'error');
    } finally {
      if (activeTenantRef.current === reqTenantId) {
        setIsAnalyzingAi(false);
      }
    }
  };

  const hasActiveDraft = files.length > 0 && !isActiveSessionClosed;

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
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#00a884] to-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Scale size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-lg sm:text-xl font-black tracking-tight">Conferência Caixa</h1>
                {(reconciliationResult?.referenceDate || activeDraftDate) && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00a884]/15 border border-[#00a884]/40 text-xs font-black text-[#008f6f] dark:text-[#00e5a8] whitespace-nowrap">
                    <Calendar size={13} />
                    Caixa: {formatDateHeaderBadge(reconciliationResult?.referenceDate || activeDraftDate, reconciliationResult?.periodEnd || reconciliationResult?.referenceDate || activeDraftDate)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-[#8696a0]">
                Conciliação automática PDV × Bancos × Maquininhas com Fórmula 1 e Auditor IA
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {viewMode === 'workspace' && (
              <button
                type="button"
                onClick={() => setViewMode('dashboard')}
                className="px-3 py-2 min-h-[38px] rounded-xl bg-white dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] hover:border-[#00a884] text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                title="Voltar ao Painel Executivo"
              >
                <ArrowLeft size={14} /> Voltar ao Dashboard
              </button>
            )}

            {sessions.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] rounded-xl px-2.5 py-1.5">
                <History size={14} className="text-[#00a884] shrink-0" />
                <select
                  value={activeSessionId || ''}
                  disabled={isActionLocked}
                  aria-label="Histórico de fechamentos"
                  onChange={(e) => {
                    if (e.target.value) void handleLoadSession(e.target.value);
                    else handleResetNew();
                  }}
                  className="bg-transparent text-xs font-semibold text-slate-700 dark:text-[#e9edef] focus:outline-none max-w-[230px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="" className="dark:bg-[#202c33]">Histórico ({sessions.length})...</option>
                  {sessions.map((s) => {
                    const isSameDayDuplicate = (sessionDateCounts.get(s.reference_date) || 0) > 1;
                    const timeHm = isSameDayDuplicate ? formatCreatedTimeHm(s.created_at) : '';
                    const operatorOrShift = isSameDayDuplicate
                      ? [s.operator_name?.trim(), s.shift_label?.trim()].filter(Boolean).join(' / ')
                      : '';
                    const duplicateMeta = [timeHm, operatorOrShift].filter(Boolean).join(' • ');
                    return (
                      <option key={s.id} value={s.id} className="dark:bg-[#202c33]">
                        {formatDateBr(s.reference_date)}
                        {duplicateMeta ? ` (${duplicateMeta})` : ''} • {s.health_score}% • {formatCents(s.diff_cents)}
                        {!s.closed_at ? ' (Rascunho)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {viewMode === 'workspace' && (
              <button
                type="button"
                onClick={() => {
                  handleResetNew();
                  setViewMode('workspace');
                }}
                className="px-3 py-2 min-h-[38px] rounded-xl bg-white dark:bg-[#202c33] border border-slate-200 dark:border-[#2a3942] hover:border-[#00a884] text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <PlusCircle size={14} /> Nova Conferência
              </button>
            )}

            {viewMode === 'workspace' && reconciliationResult && (
              <>
                <span
                  className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold ${
                    !activeSessionId
                      ? 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : !isActiveSessionClosed
                        ? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                        : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  }`}
                  title={
                    !activeSessionId
                      ? 'Este rascunho já está protegido localmente e será enviado automaticamente para a nuvem'
                      : !isActiveSessionClosed
                        ? 'Sessão em rascunho sincronizada automaticamente no banco de dados'
                        : 'Conferência fechada no banco de dados (ajustes também são salvos automaticamente)'
                  }
                >
                  {!activeSessionId
                    ? 'Rascunho Local'
                    : !isActiveSessionClosed
                      ? 'Rascunho na Nuvem'
                      : 'Fechado'}
                </span>
                {autoSaveState.status === 'error' ? (
                  <button
                    type="button"
                    onClick={() => void runBackgroundCloudSync()}
                    title={autoSaveState.errorMessage || 'Falha ao enviar para a nuvem (dados protegidos localmente). Clique para tentar novamente.'}
                    className="px-2.5 py-1 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[11px] font-bold flex items-center gap-1.5 transition-all"
                  >
                    <AlertCircle size={12} />
                    <span>Salvo Local • Reenviar</span>
                    <RefreshCw size={11} />
                  </button>
                ) : autoSaveState.status === 'saving' || autoSaveState.status === 'pending' ? (
                  <span
                    className="px-2.5 py-1 rounded-xl border border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1.5"
                    title="Suas alterações já estão gravadas localmente e sendo sincronizadas na nuvem automaticamente"
                  >
                    <Loader2 size={12} className="animate-spin" />
                    Salvando automático...
                  </span>
                ) : autoSaveState.status === 'local_only' ? (
                  <span
                    className="px-2.5 py-1 rounded-xl border border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1.5"
                    title="Auto-save ativo no armazenamento local"
                  >
                    <Cloud size={12} />
                    Salvo local
                  </span>
                ) : autoSaveState.status === 'saved' ? (
                  <span
                    className="px-2.5 py-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1.5"
                    title="Sincronização automática ativa no navegador e na nuvem"
                  >
                    <Cloud size={12} />
                    Salvo automático{formatCreatedTimeHm(autoSaveState.lastSavedAt) ? ` às ${formatCreatedTimeHm(autoSaveState.lastSavedAt)}` : ''}
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void handleSaveSession(false)}
                  title="Salvar rascunho no banco de dados (Supabase)"
                  className="px-3 py-2 min-h-[38px] rounded-xl bg-slate-800 dark:bg-[#2a3942] hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <Save size={14} /> Salvar Rascunho
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void handleSaveSession(true)}
                  className="px-3.5 py-2 min-h-[38px] rounded-xl bg-[#00a884] hover:bg-[#008f6f] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                >
                  <CheckCheck size={14} /> Fechar Caixa
                </button>
                <button
                  type="button"
                  disabled={isActionLocked || isSaving}
                  onClick={() => void handleTriggerWhatsappSend(activeSessionRow)}
                  title={savedWhatsappPhone ? 'Enviar resumo em 1 clique via FoodNext' : 'Informar número e enviar resumo via FoodNext'}
                  className="px-3 py-2 min-h-[38px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                >
                  {isSendingWhatsapp ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                  WhatsApp
                </button>
                <button
                  type="button"
                  disabled={isActionLocked}
                  onClick={() => void handleExportPdf(activeSessionRow)}
                  title="Gerar e imprimir relatório executivo A4 em PDF"
                  className="px-3 py-2 min-h-[38px] rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  {isExportingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  PDF
                </button>
                {activeSessionId && (
                  <button
                    type="button"
                    disabled={isDeletingSession || isSaving || isActionLocked}
                    onClick={() => {
                      const target = buildWorkspaceSessionRow();
                      if (target) setDeleteTargetSession(target);
                    }}
                    title="Excluir este fechamento"
                    className="px-3 py-2 min-h-[38px] rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                )}
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

        {viewMode === 'dashboard' ? (
          <CashDashboardOverview
            sessions={sessions}
            historicalStats={historicalStats}
            routineProfile={routineProfile}
            savedWhatsappPhone={savedWhatsappPhone}
            hasActiveDraft={hasActiveDraft}
            activeDraftFilesCount={files.length}
            activeDraftDate={activeDraftDate}
            busySessionId={busySessionId}
            isActionLocked={isActionLocked}
            onNewConference={() => {
              handleResetNew();
              setViewMode('workspace');
            }}
            onContinueDraft={() => setViewMode('workspace')}
            onDiscardDraft={() => {
              handleResetNew();
              setViewMode('dashboard');
            }}
            onOpenSession={(sessionId) => void handleLoadSession(sessionId)}
            onSendWhatsapp={(session) => void handleTriggerWhatsappSend(session, false)}
            onChangeWhatsappNumber={() => void handleOpenWhatsappNumberEditor()}
            onExportPdf={(session) => void handleExportPdf(session)}
            onDeleteSession={(session) => setDeleteTargetSession(session)}
            onToggleRoutineBank={(bankKey, enabled) => void handleToggleRoutineBank(bankKey, enabled)}
            onToggleRoutineReport={(fileType, enabled) => void handleToggleRoutineReport(fileType, enabled)}
            onAddRoutineBank={(bank) => void handleAddRoutineBank(bank)}
          />
        ) : (
          <>
            {/* Área de Upload */}
            <div ref={dropzoneContainerRef}>
              <CashUploadDropzone
                files={files}
                isProcessing={isProcessingFiles}
                savedPasswordsCount={savedFilePasswords.length}
                reportCompleteness={reportCompleteness}
                routineProfile={routineProfile}
                sourcePeriodStats={reconciliationResult?.periodDiagnostics?.sourcePeriodStats}
                openChecklistNonce={openChecklistNonce}
                onAddFiles={handleAddFiles}
                onUnlockPasswordFile={handleUnlockPasswordFile}
                onOpenPasswordModal={(id) => setPasswordModalFileId(id)}
                onRemoveFile={(id) => {
                  if (passwordModalFileId === id) setPasswordModalFileId(null);
                  handleRemoveFile(id);
                }}
                onToggleRoutineBank={(bankKey, enabled) => void handleToggleRoutineBank(bankKey, enabled)}
                onToggleRoutineReport={(fileType, enabled) => void handleToggleRoutineReport(fileType, enabled)}
                onAddRoutineBank={(bank) => void handleAddRoutineBank(bank)}
              />
            </div>

            {/* Conteúdo Principal vs Empty State */}
            {!reconciliationResult ? (
              <div className="space-y-5">
                <div className="rounded-3xl border border-slate-200/80 dark:border-[#2a3942] bg-white/80 dark:bg-[#202c33]/80 backdrop-blur-md p-6 sm:p-10 text-center space-y-4">
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
                </div>

                {historicalStats.totalSessions > 0 && (
                  <CashHealthHistoryCard
                    historicalStats={historicalStats}
                    sessions={sessions}
                    onSelectSession={(sessionId) => void handleLoadSession(sessionId)}
                    onDeleteSession={(session) => setDeleteTargetSession(session)}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {(() => {
                  const onConfirmSuggestionAction = (suggestionId: string) => {
                    setManualResolutions((prev) => [...prev, { action: 'confirm_suggestion', suggestionId }]);
                    notifyToast('Dica confirmada! Transações e diferença atualizadas.', 'success');
                  };
                  const onRejectSuggestionAction = (suggestionId: string) => {
                    setManualResolutions((prev) => [...prev, { action: 'reject_suggestion', suggestionId }]);
                    notifyToast('Dica rejeitada e removida das sugestões.', 'info');
                  };
                  const onManualLinkAction = (systemIds: string[], realIds: string[], note?: string) => {
                    const cleanNote = typeof note === 'string' && note.trim() ? note.trim() : undefined;
                    setManualResolutions((prev) => [
                      ...prev,
                      { action: 'manual_link', systemIds, realIds, ...(cleanNote ? { note: cleanNote } : {}) }
                    ]);
                    notifyToast('Vínculo confirmado! Tela e saldo atualizados.', 'success');
                  };
                  const onIgnoreItemAction = (side: 'system' | 'real', id: string) => {
                    setManualResolutions((prev) => [
                      ...prev,
                      {
                        action: 'ignore_item',
                        systemIds: side === 'system' ? [id] : [],
                        realIds: side === 'real' ? [id] : []
                      }
                    ]);
                    notifyToast(
                      side === 'real' ? 'Recebimento marcado como Não-PDV. Totais atualizados.' : 'Venda justificada. Totais atualizados.',
                      'info'
                    );
                  };
                  const onReclassifySystemItemAction = (
                    systemId: string,
                    targetCategory: 'dinheiro' | 'cartao' | 'pix' | 'pendente' | null
                  ) => {
                    setManualResolutions((prev) => {
                      const withoutPrior = prev.filter(
                        (r) => !(r.action === 'reclassify_system' && r.systemIds?.includes(systemId))
                      );
                      if (!targetCategory) return withoutPrior;
                      return [
                        ...withoutPrior,
                        { action: 'reclassify_system', systemIds: [systemId], targetCategory }
                      ];
                    });
                    notifyToast(
                      targetCategory ? `Forma ajustada para ${targetCategory.toUpperCase()}. Totais atualizados.` : 'Ajuste desfeito.',
                      'success'
                    );
                  };
                  const onUndoLastResolutionAction = () => {
                    setManualResolutions((prev) => {
                      if (prev.length === 0) return prev;
                      notifyToast('Último ajuste desfeito! Tela restaurada.', 'info');
                      return prev.slice(0, -1);
                    });
                  };

                  return (
                    <>
                      <CashHealthDashboard
                        result={reconciliationResult}
                        historicalStats={historicalStats}
                        sessions={sessions}
                        onSelectSession={(sessionId) => void handleLoadSession(sessionId)}
                        onDeleteSession={(session) => setDeleteTargetSession(session)}
                        onOpenMirrorCategory={(mirrorKey) => setSelectedMirrorKey(mirrorKey)}
                        onOpenGeneralDiff={(tab) => setGeneralDiffTab(tab || 'tabela')}
                        onOpenChecklist={() => {
                          setOpenChecklistNonce((n) => n + 1);
                          dropzoneContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                      />

                      <CashReconciliationWorkbench
                        key={workbenchResetKey}
                        result={reconciliationResult}
                        manualInputs={manualInputs}
                        selectedMirrorKey={selectedMirrorKey}
                        onSelectMirrorKey={setSelectedMirrorKey}
                        onUpdateManualInputs={(patch) => {
                          setManualInputs((prev) => ({ ...prev, ...patch }));
                        }}
                        onConfirmSuggestion={onConfirmSuggestionAction}
                        onRejectSuggestion={onRejectSuggestionAction}
                        onManualLink={onManualLinkAction}
                        onIgnoreItem={onIgnoreItemAction}
                        onReclassifySystemItem={onReclassifySystemItemAction}
                        manualResolutionsCount={manualResolutions.length}
                        onUndoLastResolution={onUndoLastResolutionAction}
                  rules={rules}
                  savedPasswords={savedFilePasswords}
                  onDeleteSavedPassword={async (patternKey, ruleId) => {
                    const reqTenantId = tenantId;
                    if (!reqTenantId) return;
                    await deleteCashSavedFilePassword(reqTenantId, patternKey, ruleId);
                    if (activeTenantRef.current !== reqTenantId) return;
                    if (typeof window !== 'undefined') {
                      setLocalSavedPasswords(loadSavedFilePasswordsFromStorage(window.localStorage, reqTenantId) as SavedCashFilePassword[]);
                    }
                    if (ruleId) {
                      setRules(prev => prev.filter(r => r.id !== ruleId));
                    } else {
                      setRules(prev => prev.filter(r => r.pattern !== patternKey && r.pattern !== `file_password:${patternKey}`));
                    }
                    notifyToast('Senha fixa removida. Será solicitada no próximo envio protegido.', 'info');
                  }}
                  onCreateRule={async (rule) => {
                    const reqTenantId = tenantId;
                    if (!reqTenantId) return;
                    const saved = await saveCashFormulaRule(reqTenantId, rule);
                    if (activeTenantRef.current !== reqTenantId) return;
                    setRules(prev => [saved.rule, ...prev]);
                    notifyToast('Regra salva na Fórmula 1 e aplicada!', 'success');
                  }}
                  onToggleRule={async (ruleId, isActive) => {
                    const reqTenantId = tenantId;
                    if (!reqTenantId) return;
                    await toggleCashFormulaRule(reqTenantId, ruleId, isActive);
                    if (activeTenantRef.current !== reqTenantId) return;
                    setRules(prev => prev.map(r => (r.id === ruleId ? { ...r, is_active: isActive } : r)));
                  }}
                  onDeleteRule={async (ruleId) => {
                    const reqTenantId = tenantId;
                    if (!reqTenantId) return;
                    await deleteCashFormulaRule(reqTenantId, ruleId);
                    if (activeTenantRef.current !== reqTenantId) return;
                    setRules(prev => prev.filter(r => r.id !== ruleId));
                  }}
                  aiAnalysis={aiAnalysis}
                  isAnalyzingAi={isAnalyzingAi}
                  onRunAiAnalysis={handleRunAiAnalysis}
                />

                      {generalDiffTab !== null && (
                        <CashGeneralDiffModal
                          result={reconciliationResult}
                          manualResolutions={manualResolutions}
                          initialTab={generalDiffTab}
                          onConfirmSuggestion={onConfirmSuggestionAction}
                          onRejectSuggestion={onRejectSuggestionAction}
                          onManualLink={onManualLinkAction}
                          onIgnoreItem={onIgnoreItemAction}
                          onUndoLastResolution={onUndoLastResolutionAction}
                          onOpenMirrorCategory={(mirrorKey) => setSelectedMirrorKey(mirrorKey)}
                          onClose={() => setGeneralDiffTab(null)}
                        />
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>

      <CashPasswordPromptModal
        file={files.find(f => f.id === passwordModalFileId) || null}
        pendingCount={files.filter(f => f.parsed?.status === 'password_required').length}
        isProcessing={isProcessingFiles}
        onUnlock={handleUnlockPasswordFile}
        onClose={() => setPasswordModalFileId(null)}
      />

      <CashWhatsappSendModal
        isOpen={Boolean(whatsappModalState)}
        targetLabel={whatsappModalState?.targetLabel || ''}
        initialPhone={savedWhatsappPhone}
        previewText={whatsappModalState?.summaryText || ''}
        isSending={isSendingWhatsapp}
        allowEditNumber={whatsappModalState?.allowEditNumber ?? true}
        saveOnly={Boolean(whatsappModalState?.saveOnly)}
        onSend={handleSubmitWhatsappModal}
        onClose={() => {
          if (!isSendingWhatsapp) setWhatsappModalState(null);
        }}
      />

      <CashDeleteConfirmModal
        session={deleteTargetSession}
        isDeleting={isDeletingSession}
        onConfirm={handleConfirmDeleteSession}
        onClose={() => {
          if (!isDeletingSession) setDeleteTargetSession(null);
        }}
      />
    </div>
  );
}
