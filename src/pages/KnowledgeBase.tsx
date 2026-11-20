import { useChatStore } from '../store/chatStore';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BrainCircuit,
  UploadCloud,
  FileText,
  File,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Zap,
  Info,
  Server,
  ArrowLeft,
  Eye,
  Save,
  Database,
  X,
  Plus,
  Edit3,
  PlusCircle,
  List,
  Grid,
  ChevronLeft,
  ChevronRight,
  Square,
  CheckSquare,
  ChevronDown,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Layers,
  RefreshCw,
  Wand2,
  GitMerge,
  AlertTriangle,
  Check,
  ArrowRight,
  Globe,
  Lock
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGlobalViewMode } from '../utils/viewModePreference';
import { InboxDeepAnalysisModal } from '../components/modals/InboxDeepAnalysisModal';

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

const RAG_CATEGORIES = [
  'Cardápio & Produtos',
  'Entregas & Pagamentos',
  'Horários & Localização',
  'Atendimento & Reservas',
  'Regras & Ajustes I.A.',
  'Conhecimento Geral'
];

interface KnowledgeDoc {
  id: string;
  name: string;
  type: string;
  status: 'processing' | 'ready' | 'error' | 'processed';
  metadata: any;
  created_at: string;
  instance_id?: string | null;
  real_chunks_count?: number;
  category?: string;
  quality_score?: number | null;
}

interface CurationIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
}

interface CurationAnalysis {
  verdict: string;
  recommendedAction: 'create_new' | 'merge_into_existing' | 'replace_existing' | 'reject';
  qualityScore: number;
  redundancyScore: number;
  suggestedTitle: string;
  suggestedCategory: string;
  targetDocumentId: string | null;
  targetDocumentName: string | null;
  issuesFound: CurationIssue[];
  removedNoiseExamples: string[];
  netNewFacts: string[];
  overlappingDocuments: Array<{
    id: string;
    name: string;
    maxSimilarity: number;
    matchedSamples?: string[];
  }>;
  refactoredMarkdown: string;
  originalText: string;
  contentHash: string;
  recommendationSummary: string;
}

interface AuditReport {
  tenant_id: string;
  company_name: string;
  health_score: number;
  health_tier: 'healthy' | 'warning' | 'critical';
  stats: {
    total_documents: number;
    total_real_chunks: number;
    exact_duplicate_chunks: number;
    near_duplicate_pairs: number;
    empty_docs: number;
    broken_urls: number;
    pii_alerts: number;
    oversized_chunks: number;
    unindexed_vectors: number;
  };
  sample_duplicate_pairs?: Array<{ similarity: number; a: string; b: string }>;
  issues: Array<{
    id: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    actionLabel: string;
  }>;
  documents: Array<{
    id: string;
    name: string;
    real_chunks_count: number;
    meta_chunks_total: number;
    health_score: number;
    issues: string[];
    quality_tier: 'healthy' | 'warning' | 'critical';
  }>;
}

interface CorrectionCard {
  title: string;
  context: string;
  question: string;
  incorrect: string;
  expected: string;
}

function parseCorrections(content: string) {
  const parts = content.split(/## Correção\s+/i);
  if (parts.length < 2) return null;

  const intro = parts[0];
  const corrections: CorrectionCard[] = [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const lines = part.split('\n');
    const titleLine = lines[0].replace(':', '').trim();
    const title = `Correção ${titleLine}`;

    const contextMatch = part.match(/###\s*(?:Memória da Conversa|Contexto)\s*\([^)]*\)\s*:\s*"?([\s\S]*?)"?\s*(?=###|---|$)/i);
    const questionMatch = part.match(/###\s*(?:Pergunta Similar|Pergunta)\s*(?:do Cliente)?\s*:\s*"?([\s\S]*?)"?\s*(?=###|---|$)/i);
    const incorrectMatch = part.match(/###\s*Resposta Incorreta Original\s*\([^)]*\)\s*:\s*"?([\s\S]*?)"?\s*(?=###|---|$)/i);
    const expectedMatch = part.match(/###\s*Comportamento e Resposta Esperada Corrigida\s*\([^)]*\)\s*:\s*"?([\s\S]*?)"?\s*(?=###|---|$)/i);

    corrections.push({
      title,
      context: contextMatch ? contextMatch[1].trim() : '',
      question: questionMatch ? questionMatch[1].trim() : '',
      incorrect: incorrectMatch ? incorrectMatch[1].trim() : '',
      expected: expectedMatch ? expectedMatch[1].trim() : ''
    });
  }

  return { intro, corrections };
}

function MarkdownViewer({ content }: { content: string }) {
  if (!content) {
    return (
      <span className="text-slate-400 dark:text-slate-500 italic">
        Este arquivo não possui conteúdo de texto extraído.
      </span>
    );
  }

  const lines = content.split('\n');
  const renderedElements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];

  const flushList = (key: number) => {
    if (currentList.length > 0) {
      renderedElements.push(
        <ul key={`list-${key}`} className="list-disc pl-5 mb-4 space-y-1.5 text-slate-700 dark:text-slate-300">
          {currentList}
        </ul>
      );
      currentList = [];
    }
  };

  const formatText = (text: string) => {
    const parts = text.split(/\*\*([^*]+)\*\*/g);
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return (
          <strong key={index} className="font-bold text-slate-900 dark:text-white">
            {part}
          </strong>
        );
      }
      const subParts = part.split(/`([^`]+)`/g);
      return subParts.map((subPart, subIndex) => {
        if (subIndex % 2 === 1) {
          return (
            <code
              key={subIndex}
              className="bg-slate-200/80 dark:bg-black/40 px-1.5 py-0.5 rounded text-indigo-700 dark:text-indigo-300 font-mono text-xs"
            >
              {subPart}
            </code>
          );
        }
        return subPart;
      });
    });
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed === '---' || trimmed === '***') {
      flushList(index);
      renderedElements.push(<hr key={index} className="my-5 border-slate-200 dark:border-white/10" />);
      return;
    }

    if (trimmed.startsWith('# ')) {
      flushList(index);
      renderedElements.push(
        <h1
          key={index}
          className="text-xl font-black text-slate-900 dark:text-white mt-4 mb-3 border-b border-slate-200 dark:border-white/10 pb-2"
        >
          {formatText(trimmed.replace('# ', ''))}
        </h1>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList(index);
      renderedElements.push(
        <h2 key={index} className="text-base font-extrabold text-emerald-700 dark:text-emerald-400 mt-5 mb-2">
          {formatText(trimmed.replace('## ', ''))}
        </h2>
      );
      return;
    }
    if (trimmed.startsWith('### ')) {
      flushList(index);
      renderedElements.push(
        <h3 key={index} className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-4 mb-1.5">
          {formatText(trimmed.replace('### ', ''))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.substring(2);
      currentList.push(<li key={index}>{formatText(itemText)}</li>);
      return;
    }

    if (trimmed === '') {
      flushList(index);
      return;
    }

    flushList(index);
    renderedElements.push(
      <p key={index} className="mb-2.5 text-slate-700 dark:text-slate-300 leading-relaxed">
        {formatText(trimmed)}
      </p>
    );
  });

  flushList(lines.length);
  return <div className="space-y-1">{renderedElements}</div>;
}

function MarkdownOrCorrectionsViewer({ content }: { content: string }) {
  if (!content) {
    return (
      <span className="text-slate-400 dark:text-slate-500 italic">
        Este arquivo não possui conteúdo de texto extraído.
      </span>
    );
  }

  const parsed = parseCorrections(content);
  if (parsed) {
    return (
      <div className="space-y-6 text-left">
        {parsed.intro && (
          <div className="bg-slate-100/80 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-2xl p-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            <div className="flex items-start gap-2.5">
              <Info className="text-indigo-500 dark:text-indigo-400 mt-0.5 flex-shrink-0" size={18} />
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Introdução & Diretrizes</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
                  {parsed.intro.replace(/^#\s+[^\n]+\n/i, '').trim()}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">
            Regras e Correções de Raciocínio ({parsed.corrections.length})
          </p>
          <div className="grid grid-cols-1 gap-4 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
            {parsed.corrections.map((card, index) => (
              <div
                key={index}
                className="bg-slate-50 dark:bg-black/35 border border-slate-200/80 dark:border-white/10 rounded-3xl p-5 space-y-3 text-left"
              >
                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-2">
                  <BrainCircuit className="text-indigo-500 dark:text-indigo-400" size={18} />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide">{card.title}</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {card.context && (
                    <div className="bg-white dark:bg-white/[0.02] border border-slate-200/70 dark:border-white/5 rounded-2xl p-3 space-y-1">
                      <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Info size={12} className="text-blue-500" /> Contexto / Memória
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 italic">"{card.context}"</p>
                    </div>
                  )}
                  {card.question && (
                    <div className="bg-white dark:bg-white/[0.02] border border-slate-200/70 dark:border-white/5 rounded-2xl p-3 space-y-1">
                      <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Zap size={12} className="text-amber-500" /> Pergunta do Cliente
                      </span>
                      <p className="text-slate-700 dark:text-slate-300">"{card.question}"</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                  {card.incorrect && (
                    <div className="bg-rose-500/5 border border-rose-500/15 rounded-2xl p-3 space-y-1">
                      <span className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                        <AlertCircle size={12} /> Resposta Incorreta (Não repetir)
                      </span>
                      <p className="text-slate-500 dark:text-slate-400 line-through">"{card.incorrect}"</p>
                    </div>
                  )}
                  {card.expected && (
                    <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-3 space-y-1">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={12} /> Comportamento Esperado
                      </span>
                      <p className="text-emerald-800 dark:text-emerald-300 font-medium">"{card.expected}"</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50/90 dark:bg-black/30 border border-slate-200/80 dark:border-white/10 rounded-2xl p-5 overflow-y-auto max-h-[380px] custom-scrollbar text-sm leading-relaxed select-text text-left">
      <MarkdownViewer content={content} />
    </div>
  );
}

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [overviewStats, setOverviewStats] = useState<{
    totalDocuments: number;
    readyDocuments: number;
    processingDocuments: number;
    totalRealChunks: number;
    emptyDocsCount: number;
    duplicateMenuAlert: boolean;
    healthScore: number;
  } | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Upload & Gatekeeper States
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [useGatekeeper, setUseGatekeeper] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast Feedback Banner
  const [feedbackToast, setFeedbackToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedbackToast({ type, message });
    setTimeout(() => {
      setFeedbackToast(prev => (prev?.message === message ? null : prev));
    }, 5000);
  };

  // Pre-Flight Curation Modal States
  const [curationModal, setCurationModal] = useState<CurationAnalysis | null>(null);
  const [curationTitle, setCurationTitle] = useState('');
  const [curationCategory, setCurationCategory] = useState('Conhecimento Geral');
  const [curationMode, setCurationMode] = useState<'create' | 'merge' | 'replace'>('create');
  const [curationTargetDocId, setCurationTargetDocId] = useState<string>('');
  const [curationDraftMarkdown, setCurationDraftMarkdown] = useState('');
  const [curationTab, setCurationTab] = useState<'refactored' | 'preview' | 'original'>('refactored');
  const [isCommittingCurated, setIsCommittingCurated] = useState(false);

  // Audit & Sanitation States
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isSanitizing, setIsSanitizing] = useState(false);
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);

  // Hybrid RAG Match Simulator States
  const [testQuery, setTestQuery] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [testPromptPreview, setTestPromptPreview] = useState('');
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  // Paste Manual Knowledge Modal
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');

  // Document Inspector & Editor Modal
  const [viewingFile, setViewingFile] = useState<KnowledgeDoc | null>(null);
  const [viewContent, setViewContent] = useState('');
  const [viewChunks, setViewChunks] = useState<any[]>([]);
  const [inspectorTab, setInspectorTab] = useState<'reading' | 'vectors' | 'edit'>('reading');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [isRefactoringEditor, setIsRefactoringEditor] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();

  // Filters, Pagination & Bulk Selection
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'healthy' | 'alerts' | 'pdf' | 'text'>('all');
  const [selectedScope, setSelectedScope] = useState<string>(() => searchParams.get('instanceId') || 'all');
  const [matchScopeInstanceId, setMatchScopeInstanceId] = useState<string>(() => searchParams.get('instanceId') || '');
  const [instances, setInstances] = useState<Array<{ id: string; display_name: string; status?: string; last_knowledge_analyzed_at?: string | null }>>([]);
  const [deepAnalysisModalTarget, setDeepAnalysisModalTarget] = useState<{ id: string; name: string } | null>(null);
  const [togglingScopeDocId, setTogglingScopeDocId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useGlobalViewMode('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [matchingChunkDocIds, setMatchingChunkDocIds] = useState<string[]>([]);
  const [isSearchingContent, setIsSearchingContent] = useState(false);

  // Structured AI Corrections State (Manual RAG)
  const [corrections, setCorrections] = useState<any[]>([]);
  const [editingCorrection, setEditingCorrection] = useState<any | null>(null);
  const [isAddingCorrection, setIsAddingCorrection] = useState(false);
  const [newCorrection, setNewCorrection] = useState({
    user_query: '',
    original_response: '',
    corrected_response: '',
    context_summary: ''
  });

  const storeTenantId = useChatStore(s => s.tenantInfo?.id);
  const tenantId =
    localStorage.getItem('current_tenant_id') ||
    sessionStorage.getItem('current_tenant_id') ||
    localStorage.getItem('tenantId') ||
    storeTenantId ||
    'be05dcc0-3da2-4290-b826-65058d5a0b5e';

  const instanceNameById = useMemo(() => {
    const map = new Map<string, string>();
    instances.forEach(inst => map.set(inst.id, inst.display_name || 'Caixa'));
    return map;
  }, [instances]);

  useEffect(() => {
    const urlInst = searchParams.get('instanceId');
    if (urlInst) {
      setSelectedScope(urlInst);
      setMatchScopeInstanceId(urlInst);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from('whatsapp_instances')
      .select('id, display_name, status, last_knowledge_analyzed_at')
      .eq('tenant_id', tenantId)
      .order('display_name', { ascending: true })
      .then(({ data }) => {
        if (Array.isArray(data)) setInstances(data);
      });
  }, [tenantId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedType, selectedScope]);

  // Advanced substring search inside chunks
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      const trimmedSearch = searchTerm.trim();
      if (trimmedSearch.length >= 3) {
        setIsSearchingContent(true);
        try {
          const { data, error } = await supabase
            .from('knowledge_chunks')
            .select('document_id')
            .eq('tenant_id', tenantId)
            .ilike('content', `%${trimmedSearch}%`)
            .limit(100);

          if (!error && data) {
            const ids = Array.from(new Set(data.map(item => item.document_id).filter(Boolean))) as string[];
            setMatchingChunkDocIds(ids);
          } else {
            setMatchingChunkDocIds([]);
          }
        } catch (err) {
          console.error('Erro pesquisando conteúdo nos chunks:', err);
          setMatchingChunkDocIds([]);
        } finally {
          setIsSearchingContent(false);
        }
      } else {
        setMatchingChunkDocIds([]);
      }
    }, 350);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm, tenantId]);

  const fetchDocuments = async () => {
    try {
      const overviewRes = await fetch(`${ENGINE_URL}/api/v1/knowledge/overview`, {
        headers: { 'x-tenant-id': tenantId }
      }).catch(() => null);

      if (overviewRes && overviewRes.ok) {
        const payload = await overviewRes.json();
        setDocuments(payload.documents || []);
        setOverviewStats(payload.stats || null);
        return;
      }

      // Fallback direct Supabase read if engine is restarting
      const { data, error } = await supabase
        .from('knowledge_documents')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (err) {
      console.error('Erro listando documentos do RAG:', err);
    } finally {
      setIsInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    const interval = setInterval(() => {
      setDocuments(prev => {
        if (prev.some(d => d.status === 'processing')) {
          fetchDocuments();
        }
        return prev;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [tenantId]);

  // Pre-Flight Analysis Gatekeeper (File OR Manual Text)
  const openGatekeeperAnalysis = async ({ file, title, content }: { file?: File; title?: string; content?: string }) => {
    setIsAnalyzing(true);
    try {
      let response: Response;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        response = await fetch(`${ENGINE_URL}/api/v1/knowledge/analyze`, {
          method: 'POST',
          headers: { 'x-tenant-id': tenantId },
          body: fd
        });
      } else {
        response = await fetch(`${ENGINE_URL}/api/v1/knowledge/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId
          },
          body: JSON.stringify({ title: title || 'conhecimento.md', content: content || '' })
        });
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.analysis) {
        throw new Error(data.error || 'Falha ao analisar conteúdo no Gatekeeper RAG.');
      }

      const analysis: CurationAnalysis = data.analysis;
      setCurationModal(analysis);
      setCurationTitle(analysis.suggestedTitle || title || file?.name || 'base_conhecimento.md');
      setCurationCategory(analysis.suggestedCategory || 'Conhecimento Geral');
      setCurationDraftMarkdown(analysis.refactoredMarkdown || analysis.originalText || '');

      if (analysis.recommendedAction === 'merge_into_existing' && analysis.targetDocumentId) {
        setCurationMode('merge');
        setCurationTargetDocId(analysis.targetDocumentId);
      } else if (analysis.recommendedAction === 'replace_existing' && analysis.targetDocumentId) {
        setCurationMode('replace');
        setCurationTargetDocId(analysis.targetDocumentId);
      } else {
        setCurationMode('create');
        setCurationTargetDocId(documents[0]?.id || '');
      }
      setCurationTab(analysis.verdict === 'reject' ? 'original' : 'refactored');
    } catch (err: any) {
      showToast('error', `Gatekeeper RAG: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCommitCurated = async () => {
    if (!curationModal || !curationDraftMarkdown.trim()) return;
    setIsCommittingCurated(true);
    try {
      const targetDoc = curationMode !== 'create' && curationTargetDocId
        ? documents.find(d => d.id === curationTargetDocId)
        : null;
      const effectiveCommitInstanceId = targetDoc
        ? (targetDoc.instance_id ?? null)
        : (selectedScope !== 'all' && selectedScope !== 'global' ? selectedScope : null);

      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({
          mode: curationMode,
          targetDocumentId: curationMode === 'create' ? null : (curationTargetDocId || null),
          instanceId: effectiveCommitInstanceId,
          title: curationTitle.trim() || 'base_conhecimento.md',
          category: curationCategory,
          content: curationDraftMarkdown,
          qualityScore: curationModal.qualityScore
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Falha ao gravar conhecimento curado.');
      }

      if (payload.document) {
        await useChatStore.getState().logOperation(
          curationMode === 'create' ? 'INSERT' : 'UPDATE',
          'knowledge_documents',
          payload.document.id,
          null,
          { name: payload.document.name, chunks: payload.insertedChunks, skippedDuplicates: payload.skippedDuplicates }
        );
      }

      setCurationModal(null);
      await fetchDocuments();
      if (auditReport) handleRunAudit(true);

      const skippedMsg = payload.skippedDuplicates > 0
        ? ` (${payload.skippedDuplicates} trecho(s) redundante(s) descartados automaticamente)`
        : '';
      showToast('success', `Base vetorizada com ${payload.insertedChunks} chunk(s) semântico(s) RAG 2.0!${skippedMsg}`);
    } catch (err: any) {
      showToast('error', `Erro ao salvar na base vetorial: ${err.message}`);
    } finally {
      setIsCommittingCurated(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const f = e.dataTransfer.files[0];
      if (useGatekeeper) {
        await openGatekeeperAnalysis({ file: f });
      } else {
        await uploadFile(f);
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const f = e.target.files[0];
      if (useGatekeeper) {
        await openGatekeeperAnalysis({ file: f });
      } else {
        await uploadFile(f);
      }
    }
  };

  const handleSaveText = async () => {
    if (!pasteTitle.trim() || !pasteContent.trim()) {
      showToast('error', 'Preencha o nome da informação e o conteúdo antes de continuar.');
      return;
    }

    const title = pasteTitle.trim();
    const content = pasteContent.trim();
    setIsPasteModalOpen(false);
    setPasteTitle('');
    setPasteContent('');

    if (useGatekeeper) {
      await openGatekeeperAnalysis({ title, content });
    } else {
      const fileName = title.endsWith('.txt') || title.endsWith('.md') ? title : `${title}.md`;
      const virtualFile = new File([content], fileName, { type: 'text/plain' });
      await uploadFile(virtualFile);
    }
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/upload`, {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId },
        body: formData
      });

      const resData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(resData.error || 'Falha no upload');
      }

      if (resData?.document) {
        await useChatStore.getState().logOperation('INSERT', 'knowledge_documents', resData.document.id, null, resData.document);
      }
      await fetchDocuments();
      showToast('success', `Arquivo "${file.name}" enviado para vetorização semântica!`);
    } catch (err: any) {
      showToast('error', `Envio bloqueado: ${err.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRunAudit = async (silent = false) => {
    setIsAuditing(true);
    if (!silent) setShowAuditDrawer(true);
    try {
      const res = await fetch(`${ENGINE_URL}/api/v1/knowledge/audit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId
        }
      });
      const data = await res.json();
      if (!res.ok || !data.report) {
        throw new Error(data.error || 'Falha na auditoria.');
      }
      setAuditReport(data.report);
      if (!silent) {
        showToast(
          data.report.health_score >= 85 ? 'success' : 'info',
          `Auditoria concluída: Índice de Saúde ${data.report.health_score}% (${data.report.issues.length} alerta(s)).`
        );
      }
    } catch (err: any) {
      if (!silent) showToast('error', `Erro na auditoria RAG: ${err.message}`);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleRunSanitize = async () => {
    if (!confirm('Deseja executar o saneamento automático agora? Bases vazias (0 vetores) e chunks duplicados serão removidos e URLs quebradas serão corrigidas.')) return;
    setIsSanitizing(true);
    try {
      const res = await fetch(`${ENGINE_URL}/api/v1/knowledge/sanitize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no saneamento');

      setAuditReport(data.report || null);
      await fetchDocuments();
      const s = data.summary || {};
      showToast(
        'success',
        `Saneamento concluído: ${s.removedDuplicateChunks || 0} duplicatas e ${s.removedEmptyDocs || 0} base(s) vazia(s) removidas, ${s.fixedUrlsCount || 0} URL(s) corrigida(s)!`
      );
    } catch (err: any) {
      showToast('error', `Erro no saneamento: ${err.message}`);
    } finally {
      setIsSanitizing(false);
    }
  };

  const handleViewContent = async (file: KnowledgeDoc) => {
    setViewingFile(file);
    setIsLoadingContent(true);
    setViewContent('');
    setViewChunks([]);
    setInspectorTab('reading');
    setEditingCorrection(null);
    setIsAddingCorrection(false);

    const isCorrections = file.name === 'Manual de Raciocínio e Ajustes da I.A' || file.metadata?.source === 'corrections_system';

    try {
      if (isCorrections) {
        const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/corrections`, {
          headers: { 'x-tenant-id': tenantId }
        });
        if (response.ok) {
          const data = await response.json();
          setCorrections(data.corrections || []);
        } else {
          showToast('error', 'Erro ao carregar as regras de raciocínio.');
        }
      } else {
        const [contentRes, chunksRes] = await Promise.all([
          fetch(`${ENGINE_URL}/api/v1/knowledge/${file.id}/content`, { headers: { 'x-tenant-id': tenantId } }),
          fetch(`${ENGINE_URL}/api/v1/knowledge/${file.id}/chunks`, { headers: { 'x-tenant-id': tenantId } })
        ]);
        if (contentRes.ok) {
          const data = await contentRes.json();
          setViewContent(data.content || '');
        } else {
          showToast('error', 'Erro ao carregar o conteúdo.');
        }
        if (chunksRes.ok) {
          const chData = await chunksRes.json();
          setViewChunks(chData.chunks || []);
        }
      }
    } catch {
      showToast('error', 'Erro de conexão ao carregar o conteúdo.');
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleRefactorInsideEditor = async () => {
    if (!viewingFile || !viewContent.trim()) return;
    setIsRefactoringEditor(true);
    try {
      const res = await fetch(`${ENGINE_URL}/api/v1/knowledge/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({ title: viewingFile.name, content: viewContent })
      });
      const data = await res.json();
      if (!res.ok || !data.analysis?.refactoredMarkdown) {
        throw new Error(data.error || 'Falha ao refatorar texto.');
      }
      setViewContent(data.analysis.refactoredMarkdown);
      showToast('success', 'Texto refatorado para Markdown atômico sem duplicidades! Revise e clique em "Salvar Alterações".');
    } catch (err: any) {
      showToast('error', `Erro na refatoração IA: ${err.message}`);
    } finally {
      setIsRefactoringEditor(false);
    }
  };

  const handleSaveCorrection = async (corr: any) => {
    if (!corr.user_query.trim() || !corr.corrected_response.trim()) {
      showToast('error', 'A pergunta do cliente e a resposta esperada são obrigatórias.');
      return;
    }
    setIsSavingContent(true);
    try {
      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({
          user_query: corr.user_query,
          original_response: corr.original_response,
          corrected_response: corr.corrected_response,
          context_summary: corr.context_summary
        })
      });
      if (response.ok) {
        await useChatStore.getState().logOperation('INSERT', 'knowledge_corrections', 'corr-' + Date.now(), null, {
          user_query: corr.user_query,
          corrected_response: corr.corrected_response
        });
        const res = await fetch(`${ENGINE_URL}/api/v1/knowledge/corrections`, {
          headers: { 'x-tenant-id': tenantId }
        });
        if (res.ok) {
          const data = await res.json();
          setCorrections(data.corrections || []);
        }
        setEditingCorrection(null);
        setIsAddingCorrection(false);
        setNewCorrection({ user_query: '', original_response: '', corrected_response: '', context_summary: '' });
        fetchDocuments();
        showToast('success', 'Regra de raciocínio salva e sincronizada no RAG!');
      } else {
        const err = await response.json();
        showToast('error', `Erro ao salvar regra: ${err.error}`);
      }
    } catch {
      showToast('error', 'Erro de conexão ao salvar regra.');
    } finally {
      setIsSavingContent(false);
    }
  };

  const handleDeleteCorrection = async (id: string) => {
    if (!confirm('Tem certeza de que deseja excluir esta regra de raciocínio? A I.A deixará de segui-la imediatamente.')) return;
    setIsSavingContent(true);
    try {
      const corrBefore = corrections.find(c => c.id === id);
      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/corrections/${id}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': tenantId }
      });
      if (response.ok) {
        await useChatStore.getState().logOperation('DELETE', 'knowledge_corrections', id, corrBefore || null, null);
        setCorrections(prev => prev.filter(c => c.id !== id));
        fetchDocuments();
        showToast('success', 'Regra removida e manual re-vetorizado.');
      } else {
        showToast('error', 'Erro ao excluir regra.');
      }
    } catch {
      showToast('error', 'Erro de conexão ao excluir.');
    } finally {
      setIsSavingContent(false);
    }
  };

  const handleSaveEditedContent = async () => {
    if (!viewingFile) return;
    setIsSavingContent(true);
    try {
      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/${viewingFile.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({ content: viewContent })
      });
      if (response.ok) {
        const docBefore = viewingFile;
        const docAfter = { ...viewingFile, content: viewContent };
        await useChatStore.getState().logOperation('UPDATE', 'knowledge_documents', viewingFile.id, docBefore, docAfter);
        setViewingFile(null);
        setViewContent('');
        setInspectorTab('reading');
        fetchDocuments();
        showToast('success', 'Documento re-vetorizado com chunking semântico 2.0!');
      } else {
        const err = await response.json();
        showToast('error', `Erro ao salvar: ${err.error || 'Falha na re-vetorização'}`);
      }
    } catch {
      showToast('error', 'Erro de conexão ao salvar.');
    } finally {
      setIsSavingContent(false);
    }
  };

  const deleteDocument = async (id: string) => {
    if (!confirm('Tem certeza? Isso excluirá permanentemente o documento e todos os seus vetores no pgvector.')) return;
    try {
      const docBefore = documents.find(d => d.id === id);
      const { error } = await supabase.from('knowledge_documents').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
      await useChatStore.getState().logOperation('DELETE', 'knowledge_documents', id, docBefore || null, null);
      setDocuments(prev => prev.filter(d => d.id !== id));
      setSelectedDocIds(prev => prev.filter(x => x !== id));
      showToast('success', `Base "${docBefore?.name || 'selecionada'}" removida.`);
    } catch (err: any) {
      showToast('error', `Erro ao excluir: ${err.message}`);
    }
  };

  const handleToggleDocScope = async (docId: string, nextInstanceId: string | null) => {
    if (!tenantId || togglingScopeDocId) return;
    setTogglingScopeDocId(docId);
    try {
      const res = await fetch(`${ENGINE_URL}/api/v1/knowledge/${docId}/scope`, {
        method: 'PATCH',
        headers: {
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ instanceId: nextInstanceId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao atualizar escopo.');
      setDocuments(prev =>
        prev.map(d => (d.id === docId ? { ...d, instance_id: nextInstanceId, metadata: data.document?.metadata ?? d.metadata } : d))
      );
      showToast(
        'success',
        nextInstanceId
          ? `Base restringida à caixa "${instanceNameById.get(nextInstanceId) || 'selecionada'}".`
          : 'Base promovida para Global da Empresa!'
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Erro ao alterar visibilidade da base.');
    } finally {
      setTogglingScopeDocId(null);
    }
  };

  const handleTestMatch = async (customQuery?: string) => {
    const q = (customQuery ?? testQuery).trim();
    if (!q) return;
    if (customQuery) setTestQuery(customQuery);
    setIsTesting(true);
    try {
      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/match`, {
        method: 'POST',
        headers: {
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: q,
          ...(matchScopeInstanceId ? { instanceId: matchScopeInstanceId } : {})
        })
      });
      const data = await response.json();
      if (data.matches) {
        setTestResults(data.matches);
        setTestPromptPreview(data.promptPreview || '');
      } else {
        showToast('error', data.error || 'Falha na pesquisa RAG.');
      }
    } catch {
      showToast('error', 'Motor RAG parece estar offline no momento.');
    } finally {
      setIsTesting(false);
    }
  };

  const insertPasteTemplate = (templateKey: 'horarios' | 'pagamentos' | 'reservas' | 'faq') => {
    const templates: Record<string, { title: string; body: string }> = {
      horarios: {
        title: 'guia_horarios_e_localizacao.md',
        body: `# Guia de Horários, Localização e Atendimento\n\n## Horário de Funcionamento\n- Segunda a Sexta-feira: 08h00 às 22h45\n- Sábado: 10h00 às 22h45\n- Domingo: Loja fechada\n\n## Endereço e Contato\n- Endereço completo: Rua Exemplo, 100 - Centro\n- Senha do Wi-Fi: ...`
      },
      pagamentos: {
        title: 'politicas_pagamentos_e_entrega.md',
        body: `# Políticas de Pagamento e Entrega\n\n## Formas de Pagamento\n- PIX (Chave CNPJ: ...)\n- Cartão de Crédito e Débito (bandeiras ...)\n- Dinheiro (informar se precisa de troco)\n\n## Regras de Entrega\n- Retirada no balcão: gratuita\n- Prazo médio de preparo: 20 a 35 minutos`
      },
      reservas: {
        title: 'politicas_reservas_e_eventos.md',
        body: `# Políticas de Reservas e Celebrações\n\n## Reservas para Grupos Grandes\n- Grupos acima de X pessoas devem ser transferidos para um atendente humano.\n\n## Aniversários\n- Permissão para bolo próprio e apoio da equipe.`
      },
      faq: {
        title: 'faq_duvidas_frequentes.md',
        body: `# Perguntas Frequentes\n\n## Como acompanhar meu pedido?\n- O sistema envia notificações automáticas a cada etapa da entrega.\n\n## Como solicitar alteração no pedido?\n- Alterações devem ser solicitadas antes da saída para entrega.`
      }
    };
    const chosen = templates[templateKey];
    if (!pasteTitle.trim()) setPasteTitle(chosen.title);
    setPasteContent(prev => (prev.trim() ? `${prev.trim()}\n\n${chosen.body}` : chosen.body));
  };

  const docHealthById = useMemo(() => {
    const map = new Map<string, AuditReport['documents'][number]>();
    if (auditReport?.documents) {
      auditReport.documents.forEach(d => map.set(d.id, d));
    }
    return map;
  }, [auditReport]);

  const filteredDocuments = useMemo(() => {
    return documents
      .filter(doc => {
        const matchesScope =
          selectedScope === 'all'
            ? true
            : selectedScope === 'global'
              ? !doc.instance_id
              : doc.instance_id === selectedScope;

        const matchesSearch =
          doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (doc.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          matchingChunkDocIds.includes(doc.id);

        const realCount = doc.real_chunks_count ?? Number(doc.metadata?.chunks_total || 0);
        const docAudit = docHealthById.get(doc.id);
        const hasAlert = doc.status === 'error' || (doc.status !== 'processing' && realCount === 0) || (docAudit ? docAudit.issues.length > 0 : false);

        const matchesType =
          selectedType === 'all'
            ? true
            : selectedType === 'pdf'
              ? doc.type === 'application/pdf'
              : selectedType === 'text'
                ? doc.type !== 'application/pdf'
                : selectedType === 'alerts'
                  ? hasAlert
                  : !hasAlert;

        return matchesScope && matchesSearch && matchesType;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [documents, searchTerm, matchingChunkDocIds, selectedType, selectedScope, docHealthById]);

  const totalPages = Math.ceil(filteredDocuments.length / pageSize) || 1;
  const effectiveCurrentPage = Math.min(currentPage, totalPages);
  const paginatedDocuments = filteredDocuments.slice((effectiveCurrentPage - 1) * pageSize, effectiveCurrentPage * pageSize);

  const isAllSelected = paginatedDocuments.length > 0 && paginatedDocuments.every(doc => selectedDocIds.includes(doc.id));

  const toggleSelectDoc = (id: string) => {
    setSelectedDocIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      const idsToRemove = paginatedDocuments.map(doc => doc.id);
      setSelectedDocIds(prev => prev.filter(id => !idsToRemove.includes(id)));
    } else {
      const idsToAdd = paginatedDocuments.map(doc => doc.id).filter(id => !selectedDocIds.includes(id));
      setSelectedDocIds(prev => [...prev, ...idsToAdd]);
    }
  };

  const deleteSelectedDocuments = async () => {
    if (selectedDocIds.length === 0) return;
    if (!confirm(`Tem certeza de que deseja excluir os ${selectedDocIds.length} documentos selecionados? Isso removerá permanentemente todos os vetores associados.`)) return;

    setIsSavingContent(true);
    try {
      const { error } = await supabase
        .from('knowledge_documents')
        .delete()
        .in('id', selectedDocIds)
        .eq('tenant_id', tenantId);

      if (error) throw error;

      setDocuments(prev => prev.filter(d => !selectedDocIds.includes(d.id)));
      setSelectedDocIds([]);
      setCurrentPage(1);
      showToast('success', `${selectedDocIds.length} documento(s) excluído(s) com sucesso.`);
    } catch (err: any) {
      showToast('error', `Erro ao excluir em lote: ${err.message}`);
    } finally {
      setIsSavingContent(false);
    }
  };

  // True KPI calculations
  const pdfCount = documents.filter(d => d.type === 'application/pdf').length;
  const txtCount = documents.filter(d => d.type !== 'application/pdf').length;
  const readyCount = overviewStats?.readyDocuments ?? documents.filter(d => d.status === 'ready' || d.status === 'processed').length;
  const processingCount = overviewStats?.processingDocuments ?? documents.filter(d => d.status === 'processing').length;
  const totalChunks = overviewStats?.totalRealChunks ?? documents.reduce((sum, doc) => sum + (doc.real_chunks_count ?? (doc.metadata?.chunks_total || 0)), 0);
  const currentHealthScore = auditReport?.health_score ?? overviewStats?.healthScore ?? 100;

  return (
    <div className="flex-1 w-full max-w-full overflow-x-hidden p-4 sm:p-6 lg:p-10 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-500 bg-slate-50/95 dark:bg-[#0b141a]/90 text-slate-900 dark:text-slate-100 relative">
      {/* Subtle Ambient Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Floating Feedback Toast */}
      {feedbackToast && (
        <div
          className={`fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-[9999] p-4 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-start gap-3 animate-in slide-in-from-bottom-4 duration-200 ${
            feedbackToast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-100'
              : feedbackToast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-100'
                : 'bg-slate-900/95 border-indigo-500/40 text-indigo-100'
          }`}
        >
          {feedbackToast.type === 'success' ? (
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
          ) : feedbackToast.type === 'error' ? (
            <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <Sparkles size={18} className="text-indigo-400 shrink-0 mt-0.5" />
          )}
          <span className="text-xs font-semibold leading-relaxed flex-1">{feedbackToast.message}</span>
          <button
            onClick={() => setFeedbackToast(null)}
            className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto relative z-10 flex flex-col gap-6 sm:gap-8">
        {/* Top Bar: Voltar + Badges */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-4 sm:px-5 min-h-[48px] sm:min-h-[42px] rounded-2xl transition-all border border-emerald-500/25 shadow-sm active:scale-95 group backdrop-blur-md cursor-pointer"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            <span className="font-bold text-sm tracking-wide">Voltar</span>
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-white/80 dark:bg-[#111b21]/80 backdrop-blur-md px-3.5 py-2 border border-slate-200/80 dark:border-white/10 rounded-2xl shadow-sm">
              <Server size={16} className="text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">pgvector Hybrid + RRF</span>
            </div>

            <button
              onClick={() => handleRunAudit(false)}
              disabled={isAuditing}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-4 min-h-[48px] sm:min-h-[42px] rounded-2xl text-xs font-black tracking-wide shadow-lg shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
            >
              {isAuditing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              <span>{isAuditing ? 'Auditando Vetores...' : 'Auditar Saúde & Limpeza IA'}</span>
            </button>
          </div>
        </div>

        {/* Hero Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 dark:bg-[#111b21]/70 backdrop-blur-xl border border-slate-200/80 dark:border-white/[0.08] rounded-3xl p-5 sm:p-7 shadow-lg">
          <div className="flex items-start sm:items-center gap-4">
            <div className="p-3.5 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 rounded-2xl shadow-lg ring-4 ring-emerald-500/15 shrink-0">
              <BrainCircuit size={30} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                  Base de Conhecimento RAG 2.0
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                    currentHealthScore >= 85
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                      : currentHealthScore >= 60
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                        : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      currentHealthScore >= 85 ? 'bg-emerald-500 animate-pulse' : currentHealthScore >= 60 ? 'bg-amber-500' : 'bg-rose-500 animate-ping'
                    }`}
                  />
                  Saúde: {currentHealthScore}%
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-[#aebac1] font-medium mt-1.5 leading-relaxed">
                Arquitetura semântica com <strong className="text-slate-800 dark:text-white">Gatekeeper Anti-Duplicidade IA</strong>, fatiamento por contexto (MiniLM 384d) e busca híbrida Vetorial + Lexical.
              </p>
            </div>
          </div>
        </div>

        {/* 4 Telemetry KPI Cards (True Postgres Chunk Counts) */}
        {isInitialLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map(n => (
              <div
                key={n}
                className="h-28 rounded-3xl bg-white/70 dark:bg-[#111b21]/60 border border-slate-200/70 dark:border-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-in fade-in duration-500">
            <div className="bg-white/85 dark:bg-[#111b21]/80 border border-slate-200/80 dark:border-white/[0.08] rounded-3xl p-4 sm:p-5 backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/40 transition-all shadow-sm text-left">
              <div className="absolute -right-5 -bottom-5 text-slate-900/5 dark:text-white/5 group-hover:text-emerald-500/10 transition-colors">
                <Database size={76} />
              </div>
              <span className="text-[10px] text-slate-500 dark:text-[#aebac1] font-black uppercase tracking-wider">Total de Bases</span>
              <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">{documents.length}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {pdfCount} PDF • {txtCount} TXT/MD
              </div>
            </div>

            <div className="bg-white/85 dark:bg-[#111b21]/80 border border-slate-200/80 dark:border-white/[0.08] rounded-3xl p-4 sm:p-5 backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/40 transition-all shadow-sm text-left">
              <div className="absolute -right-5 -bottom-5 text-slate-900/5 dark:text-white/5 group-hover:text-emerald-500/10 transition-colors">
                <CheckCircle2 size={76} />
              </div>
              <span className="text-[10px] text-slate-500 dark:text-[#aebac1] font-black uppercase tracking-wider">Status do Pipeline</span>
              <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-baseline gap-1.5">
                {readyCount}
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Prontas</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {processingCount > 0 ? `${processingCount} em vetorização...` : '100% indexadas no banco'}
              </div>
            </div>

            <div className="bg-white/85 dark:bg-[#111b21]/80 border border-slate-200/80 dark:border-white/[0.08] rounded-3xl p-4 sm:p-5 backdrop-blur-md relative overflow-hidden group hover:border-indigo-500/40 transition-all shadow-sm text-left">
              <div className="absolute -right-5 -bottom-5 text-slate-900/5 dark:text-white/5 group-hover:text-indigo-500/10 transition-colors">
                <Layers size={76} />
              </div>
              <span className="text-[10px] text-slate-500 dark:text-[#aebac1] font-black uppercase tracking-wider">Vetores Reais (pgvector)</span>
              <div className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {totalChunks.toLocaleString('pt-BR')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Chunks semânticos reais 384d</div>
            </div>

            <div className="bg-white/85 dark:bg-[#111b21]/80 border border-slate-200/80 dark:border-white/[0.08] rounded-3xl p-4 sm:p-5 backdrop-blur-md relative overflow-hidden group hover:border-amber-500/40 transition-all shadow-sm text-left">
              <div className="absolute -right-5 -bottom-5 text-slate-900/5 dark:text-white/5 group-hover:text-amber-500/10 transition-colors">
                <ShieldCheck size={76} />
              </div>
              <span className="text-[10px] text-slate-500 dark:text-[#aebac1] font-black uppercase tracking-wider">Qualidade & Higiene</span>
              <div
                className={`text-2xl sm:text-3xl font-black mt-1 ${
                  currentHealthScore >= 85
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : currentHealthScore >= 60
                      ? 'text-amber-500'
                      : 'text-rose-500'
                }`}
              >
                {currentHealthScore}%
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {(overviewStats?.emptyDocsCount || 0) > 0
                  ? `${overviewStats?.emptyDocsCount} base(s) vazia(s)`
                  : overviewStats?.duplicateMenuAlert
                    ? 'Atenção: cardápios duplicados'
                    : 'Sem conflitos estruturais'}
              </div>
            </div>
          </div>
        )}

        {/* Forensic Audit Drawer / Governance Report */}
        {showAuditDrawer && (
          <div className="bg-white/95 dark:bg-[#111b21]/90 border border-indigo-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-3 duration-300 text-left space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-2xl ${
                    (auditReport?.health_score ?? 100) >= 85
                      ? 'bg-emerald-500/15 text-emerald-500'
                      : (auditReport?.health_score ?? 100) >= 60
                        ? 'bg-amber-500/15 text-amber-500'
                        : 'bg-rose-500/15 text-rose-500'
                  }`}
                >
                  <ShieldAlert size={22} />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    Diagnóstico Forense da Base RAG — {auditReport?.company_name || 'Empresa'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-[#aebac1]">
                    Varredura vetorial por similaridade, duplicidade exata, dados pessoais (LGPD) e links quebrados.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {auditReport && auditReport.issues.length > 0 && (
                  <button
                    onClick={handleRunSanitize}
                    disabled={isSanitizing}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 min-h-[44px] rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {isSanitizing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    <span>Executar Saneamento Automático</span>
                  </button>
                )}
                <button
                  onClick={() => setShowAuditDrawer(false)}
                  className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {isAuditing && !auditReport ? (
              <div className="py-10 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
                <Loader2 size={32} className="animate-spin text-indigo-500" />
                <span className="text-xs font-bold uppercase tracking-wider">Analisando todos os vetores no PostgreSQL...</span>
              </div>
            ) : auditReport ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  {[
                    { label: 'Duplicatas Exatas', val: auditReport.stats.exact_duplicate_chunks, warn: auditReport.stats.exact_duplicate_chunks > 0 },
                    { label: 'Pares Redundantes', val: auditReport.stats.near_duplicate_pairs, warn: auditReport.stats.near_duplicate_pairs > 2 },
                    { label: 'Bases Vazias', val: auditReport.stats.empty_docs, warn: auditReport.stats.empty_docs > 0 },
                    { label: 'Alertas LGPD', val: auditReport.stats.pii_alerts, warn: auditReport.stats.pii_alerts > 0 },
                    { label: 'URLs Quebradas', val: auditReport.stats.broken_urls, warn: auditReport.stats.broken_urls > 0 },
                    { label: 'Chunks > 200 pal.', val: auditReport.stats.oversized_chunks, warn: auditReport.stats.oversized_chunks > 0 }
                  ].map(stat => (
                    <div
                      key={stat.label}
                      className={`p-3 rounded-2xl border ${
                        stat.warn
                          ? 'bg-rose-500/5 border-rose-500/25 text-rose-700 dark:text-rose-300'
                          : 'bg-slate-50 dark:bg-black/25 border-slate-200/70 dark:border-white/5 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="text-[9px] font-black uppercase tracking-wider opacity-70">{stat.label}</div>
                      <div className="text-lg font-black mt-0.5">{stat.val}</div>
                    </div>
                  ))}
                </div>

                {auditReport.issues.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                    <CheckCircle2 size={18} />
                    <span>Sua base RAG está 100% saudável, desduplicada, livre de dados sensíveis e otimizada para busca híbrida!</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {auditReport.issues.map(iss => (
                      <div
                        key={iss.id}
                        className={`p-4 rounded-2xl border space-y-1.5 ${
                          iss.severity === 'critical'
                            ? 'bg-rose-500/5 border-rose-500/25'
                            : iss.severity === 'warning'
                              ? 'bg-amber-500/5 border-amber-500/25'
                              : 'bg-indigo-500/5 border-indigo-500/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-xs font-black ${
                              iss.severity === 'critical'
                                ? 'text-rose-600 dark:text-rose-400'
                                : iss.severity === 'warning'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-indigo-600 dark:text-indigo-400'
                            }`}
                          >
                            {iss.title}
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-black/10 dark:bg-white/10">
                            {iss.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{iss.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Ingestion Hub & Hybrid Search Simulator */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* LEFT: Smart Ingestion Hub */}
          <div className="xl:col-span-6 flex flex-col gap-4 bg-white/85 dark:bg-[#111b21]/80 backdrop-blur-xl border border-slate-200/80 dark:border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <UploadCloud size={18} />
                </span>
                <div className="text-left">
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                    Entrada Inteligente de Conhecimento
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-[#aebac1]">
                    Suporta PDF, TXT, MD e CSV com curadoria anti-lixo
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setUseGatekeeper(v => !v)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                  useGatekeeper
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10'
                }`}
                title="Analisa duplicidade, LGPD e refatora em Markdown antes de gravar no banco"
              >
                <Sparkles size={13} />
                <span>Gatekeeper IA: {useGatekeeper ? 'ATIVO' : 'OFF'}</span>
              </button>
            </div>

            <div
              className={`relative flex flex-col items-center justify-center p-8 sm:p-10 border-2 border-dashed rounded-3xl transition-all duration-300 cursor-pointer overflow-hidden min-h-[200px] ${
                isDragging
                  ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
                  : 'border-slate-300 dark:border-white/15 hover:border-emerald-500/60 bg-slate-50/70 dark:bg-black/25 hover:bg-emerald-50/30 dark:hover:bg-black/40'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept=".txt,.pdf,.csv,.md"
              />

              {isUploading || isAnalyzing ? (
                <div className="flex flex-col items-center gap-3 animate-in zoom-in duration-300 relative z-10 text-center">
                  <Loader2 size={40} className="animate-spin text-emerald-500" />
                  <span className="text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-100">
                    {isAnalyzing
                      ? 'Analisando duplicidades, LGPD e refatorando com IA...'
                      : 'Processando e gerando vetores semânticos...'}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 relative z-10 text-center">
                  <div className="bg-emerald-500/15 dark:bg-emerald-500/15 p-3.5 rounded-2xl border border-emerald-500/25 shadow-sm">
                    <UploadCloud size={32} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                      Arraste PDF, TXT, MD ou CSV aqui
                    </p>
                    <p className="text-xs text-slate-500 dark:text-[#aebac1] mt-1">
                      {useGatekeeper
                        ? 'O Gatekeeper analisa, limpa ruídos e evita duplicar informações antes de salvar.'
                        : 'Upload direto com deduplicação básica por hash.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsPasteModalOpen(true)}
              className="flex items-center justify-center gap-2.5 w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white min-h-[48px] px-6 rounded-2xl font-extrabold text-sm transition-all shadow-lg shadow-emerald-600/20 active:scale-95 cursor-pointer"
            >
              <FileText size={18} />
              <span>Colar / Criar Conhecimento com Curadoria IA</span>
            </button>
          </div>

          {/* RIGHT: Upgraded Hybrid RAG Match Simulator */}
          <div className="xl:col-span-6 bg-white/85 dark:bg-[#111b21]/80 backdrop-blur-xl border border-slate-200/80 dark:border-white/[0.08] rounded-3xl p-5 sm:p-6 flex flex-col shadow-lg text-left">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Zap size={18} />
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                    Simulador Raio-X (Busca Híbrida 2.0)
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-[#aebac1]">
                    Testa exatamente o que o chatbot consulta no banco (Vetorial + Palavra-chave PT-BR + RRF)
                  </p>
                </div>
              </div>
            </div>

            {/* Inbox Scope Selector for Simulator */}
            {instances.length > 0 && (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Simular contexto da caixa:</span>
                <select
                  value={matchScopeInstanceId}
                  onChange={e => setMatchScopeInstanceId(e.target.value)}
                  className="bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="">🌐 Base Global / Todas as Caixas</option>
                  {instances.map(inst => (
                    <option key={inst.id} value={inst.id}>
                      📦 Caixa: {inst.display_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quick Suggestion Chips */}
            <div className="flex flex-wrap gap-1.5 my-3">
              {[
                { label: 'Horário de funcionamento', q: 'Qual o horário de funcionamento e abre domingo?' },
                { label: 'Pix e pagamento', q: 'Qual a chave Pix para pagamento e aceita cartão?' },
                { label: 'Entrega e taxa', q: 'Como funciona a entrega e motoboy parceiro?' },
                { label: 'Reserva / Bolo', q: 'Reserva para 30 pessoas e levar bolo de aniversário' }
              ].map(chip => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => handleTestMatch(chip.q)}
                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-white/5 hover:bg-indigo-500/15 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-300 border border-slate-200/80 dark:border-white/10 transition-all cursor-pointer active:scale-95"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={testQuery}
                onChange={e => setTestQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTestMatch()}
                className="flex-1 bg-slate-100/90 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl px-4 min-h-[48px] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder="Digite uma dúvida real de cliente..."
              />
              <button
                disabled={isTesting || !testQuery.trim()}
                onClick={() => handleTestMatch()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-2xl px-5 min-h-[48px] font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center active:scale-95 cursor-pointer"
                title="Testar Recuperação RAG"
              >
                {isTesting ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
              </button>
            </div>

            {/* Simulator Results */}
            {testResults !== null && (
              <div className="mt-4 flex-1 flex flex-col gap-3">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <span>{testResults.length} trecho(s) diverso(s) recuperado(s)</span>
                  {testPromptPreview && (
                    <button
                      type="button"
                      onClick={() => setShowPromptPreview(v => !v)}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Eye size={12} />
                      <span>{showPromptPreview ? 'Ver em Cards' : 'Ver Contexto Injetado no Robô'}</span>
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto custom-scrollbar bg-slate-50/90 dark:bg-black/25 rounded-2xl p-3.5 border border-slate-200/80 dark:border-white/5 max-h-[235px]">
                  {testResults.length === 0 ? (
                    <p className="text-slate-500 dark:text-slate-400 text-xs italic text-center py-8">
                      Nenhum trecho relevante encontrado na base.
                    </p>
                  ) : showPromptPreview ? (
                    <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {testPromptPreview}
                    </pre>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {testResults.map((r, i) => (
                        <div
                          key={i}
                          className="bg-white dark:bg-[#182229]/90 p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/10 flex flex-col gap-1.5 relative overflow-hidden"
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-500 to-indigo-500" />
                          <div className="flex flex-wrap justify-between items-center gap-2 pl-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                Relevância: {(r.similarity * 100).toFixed(1)}%
                              </span>
                              {r.method && (
                                <span className="text-[9px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                                  {r.method}
                                </span>
                              )}
                            </div>
                            {r.document_name && (
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                                {r.document_name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-700 dark:text-slate-200 pl-2 leading-relaxed whitespace-pre-line">
                            {r.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Document Library Header & Filters */}
        <div className="flex flex-col gap-5">
          {/* Inbox / Global Scope Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white/80 dark:bg-[#111b21]/80 border border-slate-200/80 dark:border-white/10 rounded-2xl p-3 backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => {
                  setSelectedScope('all');
                  setSearchParams(prev => {
                    const next = new URLSearchParams(prev);
                    next.delete('instanceId');
                    return next;
                  });
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedScope === 'all'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                }`}
              >
                Todas ({documents.length})
              </button>
              <button
                onClick={() => {
                  setSelectedScope('global');
                  setSearchParams(prev => {
                    const next = new URLSearchParams(prev);
                    next.delete('instanceId');
                    return next;
                  });
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedScope === 'global'
                    ? 'bg-sky-600 text-white shadow'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                }`}
              >
                <Globe size={13} />
                <span>Globais ({documents.filter(d => !d.instance_id).length})</span>
              </button>
              {instances.map(inst => {
                const count = documents.filter(d => d.instance_id === inst.id).length;
                const active = selectedScope === inst.id;
                return (
                  <button
                    key={inst.id}
                    onClick={() => {
                      setSelectedScope(inst.id);
                      setMatchScopeInstanceId(inst.id);
                      setSearchParams(prev => {
                        const next = new URLSearchParams(prev);
                        next.set('instanceId', inst.id);
                        return next;
                      });
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
                    }`}
                  >
                    <Lock size={12} />
                    <span>{inst.display_name} ({count})</span>
                  </button>
                );
              })}
            </div>

            {selectedScope !== 'all' && selectedScope !== 'global' && instanceNameById.has(selectedScope) && (
              <button
                onClick={() => setDeepAnalysisModalTarget({ id: selectedScope, name: instanceNameById.get(selectedScope) || 'Caixa' })}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-500/20 cursor-pointer"
              >
                <BrainCircuit size={14} />
                <span>Atualizar Caixa via Análise Profunda</span>
              </button>
            )}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/10 pb-4">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2.5 text-left">
              Bases Vetorizadas da Empresa
              <span className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-xs font-black px-2.5 py-0.5 rounded-full border border-emerald-500/25">
                {documents.length}
              </span>
            </h2>

            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-start lg:justify-end">
              {/* Search Input */}
              <div className="relative w-full sm:w-64">
                {isSearchingContent ? (
                  <Loader2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-500 animate-spin" />
                ) : (
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                )}
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar nome, categoria ou vetor..."
                  className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl pl-10 pr-8 min-h-[44px] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 transition-all placeholder:text-slate-400"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-1"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex flex-wrap bg-white dark:bg-black/40 border border-slate-200/80 dark:border-white/10 p-1 rounded-2xl w-full sm:w-auto">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'healthy', label: 'Saudáveis' },
                  { id: 'alerts', label: 'Com Alertas' },
                  { id: 'pdf', label: 'PDFs' },
                  { id: 'text', label: 'TXT / MD' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedType(tab.id as any)}
                    className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedType === tab.id
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* View Mode Switcher */}
              <div className="flex bg-white dark:bg-black/40 border border-slate-200/80 dark:border-white/10 p-1 rounded-2xl">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-xl transition-all cursor-pointer ${
                    viewMode === 'grid' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
                  }`}
                  title="Visualização em Grade"
                >
                  <Grid size={16} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-xl transition-all cursor-pointer ${
                    viewMode === 'list' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
                  }`}
                  title="Visualização em Lista"
                >
                  <List size={16} />
                </button>
              </div>

              {/* Page Size */}
              <div className="relative">
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl px-3.5 min-h-[44px] text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-emerald-500 appearance-none pr-8 cursor-pointer font-bold"
                >
                  <option value={12}>12 / pág</option>
                  <option value={24}>24 / pág</option>
                  <option value={48}>48 / pág</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Bulk Action Bar */}
          {selectedDocIds.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-emerald-500/10 border border-emerald-500/25 p-4 rounded-3xl backdrop-blur-md animate-in slide-in-from-top-4 duration-300 text-left">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <CheckSquare size={18} />
                <span className="text-xs font-black">
                  {selectedDocIds.length} {selectedDocIds.length === 1 ? 'base selecionada' : 'bases selecionadas'}
                </span>
              </div>
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  onClick={deleteSelectedDocuments}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/25 px-4 min-h-[44px] rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  <Trash2 size={14} /> Excluir Selecionadas
                </button>
                <button
                  onClick={() => setSelectedDocIds([])}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 px-4 min-h-[44px] rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  <X size={14} /> Limpar
                </button>
              </div>
            </div>
          )}

          {/* Document Cards or Table */}
          {filteredDocuments.length === 0 && !isUploading && !isInitialLoading ? (
            <div className="py-14 flex flex-col items-center justify-center bg-white/60 dark:bg-black/15 border-2 border-dashed border-slate-300 dark:border-white/10 rounded-3xl text-center px-6">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-4">
                <BrainCircuit size={32} />
              </div>
              <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-200">
                Nenhuma base encontrada para este filtro
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                Adicione documentos acima ou ajuste os filtros para inspecionar os vetores ativos do estabelecimento.
              </p>
            </div>
          ) : (
            <>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-500">
                  {paginatedDocuments.map(doc => {
                    const sizeFormatted = doc.metadata?.size ? `${(doc.metadata.size / 1024).toFixed(1)} KB` : 'TXT Manual';
                    const realChunks = doc.real_chunks_count ?? Number(doc.metadata?.chunks_total || 0);
                    const chunksTotal = doc.metadata?.chunks_total || 0;
                    const chunksProcessed = doc.metadata?.chunks_processed || 0;
                    const percent = chunksTotal > 0 ? Math.round((chunksProcessed / chunksTotal) * 100) : 0;
                    const statusMsg = doc.metadata?.current_status || 'Vetorizando...';
                    const isSelected = selectedDocIds.includes(doc.id);
                    const categoryLabel = doc.category || doc.metadata?.category || 'Geral';
                    const isRagV2 = doc.metadata?.rag_version === '2.0';
                    const docAudit = docHealthById.get(doc.id);
                    const hasIssue = doc.status === 'error' || (doc.status !== 'processing' && realChunks === 0) || (docAudit && docAudit.issues.length > 0);

                    return (
                      <div
                        key={doc.id}
                        className={`bg-white/90 dark:bg-[#111b21]/85 backdrop-blur-md rounded-3xl p-5 border transition-all group relative overflow-hidden shadow-md hover:shadow-xl hover:-translate-y-0.5 flex flex-col gap-3.5 text-left ${
                          isSelected
                            ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                            : hasIssue
                              ? 'border-amber-500/40 dark:border-amber-500/30'
                              : 'border-slate-200/80 dark:border-white/[0.08] hover:border-emerald-500/40'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2 relative z-10">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                toggleSelectDoc(doc.id);
                              }}
                              className="text-slate-400 hover:text-emerald-500 transition-colors bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 p-2 rounded-xl border border-slate-200/70 dark:border-white/10 cursor-pointer"
                              title={isSelected ? 'Desmarcar' : 'Selecionar'}
                            >
                              {isSelected ? <CheckSquare size={16} className="text-emerald-500" /> : <Square size={16} />}
                            </button>
                            <div
                              className={`p-2 rounded-xl flex items-center justify-center border ${
                                doc.type === 'application/pdf'
                                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                  : 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20'
                              }`}
                            >
                              <File size={16} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-white/10 truncate max-w-[130px]">
                              {categoryLabel}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {doc.status === 'processing' && (
                              <span className="flex items-center gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-full text-[11px] font-bold animate-pulse border border-amber-500/30">
                                <Loader2 size={12} className="animate-spin" /> Vetorizando
                              </span>
                            )}
                            {(doc.status === 'ready' || doc.status === 'processed') && (
                              <span
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                  realChunks === 0
                                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25'
                                }`}
                              >
                                {realChunks === 0 ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                                {realChunks === 0 ? 'Vazia' : 'Pronta'}
                              </span>
                            )}
                            {doc.status === 'error' && (
                              <span
                                className="flex items-center gap-1 bg-rose-500/15 text-rose-500 px-2.5 py-1 rounded-full text-[11px] font-bold border border-rose-500/30"
                                title={doc.metadata?.err}
                              >
                                <AlertCircle size={12} /> Falha
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="relative z-10 flex-1 space-y-2">
                          <h3
                            className="text-slate-900 dark:text-white font-extrabold text-base leading-snug line-clamp-2"
                            title={doc.name}
                          >
                            {doc.name}
                          </h3>

                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-lg">
                              <Layers size={11} />
                              {realChunks.toLocaleString('pt-BR')} vetor{realChunks === 1 ? '' : 'es'}
                            </span>
                            {doc.instance_id ? (
                              <span className="inline-flex items-center gap-1 font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 border border-indigo-500/25 px-2 py-0.5 rounded-lg">
                                <Lock size={10} />
                                Caixa: {instanceNameById.get(doc.instance_id) || doc.metadata?.inbox_name || 'Exclusiva'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-bold text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/25 px-2 py-0.5 rounded-lg">
                                <Globe size={10} />
                                Global da Empresa
                              </span>
                            )}
                            <span className="text-slate-500 dark:text-slate-400 font-medium">{sizeFormatted}</span>
                            {isRagV2 && (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                RAG 2.0
                              </span>
                            )}
                          </div>

                          <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                            Atualizado: {new Date(doc.metadata?.last_update || doc.created_at).toLocaleString('pt-BR')}
                          </div>

                          {docAudit && docAudit.issues.length > 0 && (
                            <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-xl">
                              {docAudit.issues[0]}
                            </div>
                          )}
                        </div>

                        {doc.status === 'processing' && (
                          <div className="w-full bg-slate-100 dark:bg-black/40 p-3 rounded-xl border border-slate-200 dark:border-white/5">
                            <div className="flex justify-between items-center mb-1 text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider">
                              <span className="truncate max-w-[80%]">{statusMsg}</span>
                              <span>{percent}%</span>
                            </div>
                            <div className="w-full bg-amber-500/15 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 relative z-10 pt-1">
                          {(doc.status === 'ready' || doc.status === 'processed') && (
                            <button
                              onClick={() => handleViewContent(doc)}
                              className="flex-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 min-h-[48px] sm:min-h-[42px] rounded-2xl text-xs sm:text-sm font-bold transition-all border border-indigo-500/25 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                            >
                              <Eye size={15} /> Acessar & Raio-X
                            </button>
                          )}
                          {doc.instance_id ? (
                            <button
                              onClick={() => handleToggleDocScope(doc.id, null)}
                              disabled={togglingScopeDocId === doc.id}
                              className="px-3 bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 min-h-[48px] sm:min-h-[42px] rounded-2xl text-xs font-bold transition-all border border-sky-500/25 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                              title="Tornar visível para todas as caixas desta empresa"
                            >
                              <Globe size={14} />
                              <span>Tornar Global</span>
                            </button>
                          ) : instances.length > 0 && (
                            <select
                              value=""
                              disabled={togglingScopeDocId === doc.id}
                              onChange={e => e.target.value && handleToggleDocScope(doc.id, e.target.value)}
                              className="px-2.5 bg-slate-100 dark:bg-black/30 hover:border-indigo-500/40 text-slate-700 dark:text-slate-300 min-h-[48px] sm:min-h-[42px] rounded-2xl text-[11px] font-bold border border-slate-200 dark:border-white/10 cursor-pointer"
                              title="Restringir este documento a uma caixa específica"
                            >
                              <option value="">Restringir à Caixa...</option>
                              {instances.map(inst => (
                                <option key={inst.id} value={inst.id}>
                                  {inst.display_name}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            onClick={() => deleteDocument(doc.id)}
                            className="px-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 min-h-[48px] sm:min-h-[42px] rounded-2xl text-xs sm:text-sm font-bold transition-all border border-rose-500/25 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                            title="Excluir Base"
                          >
                            <Trash2 size={15} />
                            <span className="sm:hidden">Excluir</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="w-full overflow-x-auto rounded-3xl border border-slate-200/80 dark:border-white/10 bg-white/85 dark:bg-[#111b21]/80 backdrop-blur-md shadow-lg custom-scrollbar">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.02] text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">
                        <th className="p-4 w-12 text-center">
                          <button onClick={toggleSelectAll} className="hover:text-emerald-500 transition-colors cursor-pointer">
                            {isAllSelected ? <CheckSquare size={16} className="text-emerald-500" /> : <Square size={16} />}
                          </button>
                        </th>
                        <th className="p-4">Documento</th>
                        <th className="p-4">Categoria</th>
                        <th className="p-4">Vetores Reais</th>
                        <th className="p-4">Tamanho</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-white/5 text-slate-700 dark:text-slate-300">
                      {paginatedDocuments.map(doc => {
                        const isSelected = selectedDocIds.includes(doc.id);
                        const sizeFormatted = doc.metadata?.size ? `${(doc.metadata.size / 1024).toFixed(1)} KB` : 'TXT Manual';
                        const realChunks = doc.real_chunks_count ?? Number(doc.metadata?.chunks_total || 0);
                        const isPdf = doc.type === 'application/pdf';

                        return (
                          <tr
                            key={doc.id}
                            className={`hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors ${isSelected ? 'bg-emerald-500/[0.04]' : ''}`}
                          >
                            <td className="p-4 text-center">
                              <button onClick={() => toggleSelectDoc(doc.id)} className="hover:text-emerald-500 transition-colors cursor-pointer">
                                {isSelected ? <CheckSquare size={16} className="text-emerald-500" /> : <Square size={16} />}
                              </button>
                            </td>
                            <td className="p-4 font-bold text-slate-900 dark:text-white">
                              <div className="flex items-center gap-2 max-w-xs md:max-w-md truncate" title={doc.name}>
                                <div className={`p-1.5 rounded-lg shrink-0 ${isPdf ? 'bg-rose-500/10 text-rose-500' : 'bg-indigo-500/10 text-indigo-500'}`}>
                                  <File size={14} />
                                </div>
                                <span className="truncate">{doc.name}</span>
                              </div>
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold mt-1 text-slate-500 dark:text-slate-400">
                                {doc.instance_id ? (
                                  <><Lock size={10} className="text-indigo-400" /> Caixa: {instanceNameById.get(doc.instance_id) || doc.metadata?.inbox_name || 'Exclusiva'}</>
                                ) : (
                                  <><Globe size={10} className="text-sky-400" /> Global da Empresa</>
                                )}
                              </span>
                            </td>
                            <td className="p-4">{doc.category || doc.metadata?.category || 'Geral'}</td>
                            <td className="p-4 font-bold text-indigo-600 dark:text-indigo-400">{realChunks.toLocaleString('pt-BR')}</td>
                            <td className="p-4">{sizeFormatted}</td>
                            <td className="p-4">
                              {doc.status === 'processing' ? (
                                <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                  <Loader2 size={10} className="animate-spin" /> Vetorizando
                                </span>
                              ) : realChunks === 0 ? (
                                <span className="inline-flex items-center gap-1 bg-rose-500/15 text-rose-500 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                  Vazia
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                  <CheckCircle2 size={11} /> Pronto
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {(doc.status === 'ready' || doc.status === 'processed') && (
                                  <button
                                    onClick={() => handleViewContent(doc)}
                                    className="p-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 rounded-lg border border-indigo-500/20 transition-all cursor-pointer"
                                    title="Acessar & Raio-X"
                                  >
                                    <Eye size={14} />
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteDocument(doc.id)}
                                  className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-lg border border-rose-500/20 transition-all cursor-pointer"
                                  title="Excluir Base"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2 bg-white/80 dark:bg-black/20 border border-slate-200/80 dark:border-white/5 p-4 rounded-3xl backdrop-blur-md">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Exibindo <span className="font-bold text-slate-900 dark:text-white">{paginatedDocuments.length}</span> de{' '}
                    <span className="font-bold text-slate-900 dark:text-white">{filteredDocuments.length}</span> bases
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={effectiveCurrentPage === 1}
                      className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40 rounded-xl transition-all cursor-pointer"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {Array.from({ length: totalPages }).map((_, idx) => {
                      const pageNum = idx + 1;
                      if (totalPages > 5 && Math.abs(pageNum - effectiveCurrentPage) > 2 && pageNum !== 1 && pageNum !== totalPages) {
                        if (pageNum === 2 || pageNum === totalPages - 1) return <span key={pageNum} className="px-1 text-xs">...</span>;
                        return null;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                            pageNum === effectiveCurrentPage
                              ? 'bg-emerald-600 border-emerald-500 text-white shadow'
                              : 'bg-slate-100 dark:bg-white/5 border-transparent text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={effectiveCurrentPage === totalPages}
                      className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40 rounded-xl transition-all cursor-pointer"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* MODAL 1: GATEKEEPER PRÉ-INGESTÃO E REFATORAÇÃO IA (RAG 2.0)         */}
      {/* =================================================================== */}
      {curationModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 text-left">
          <div className="bg-white dark:bg-[#0b141a] border-t sm:border border-slate-200 dark:border-white/10 rounded-t-[32px] sm:rounded-[28px] w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-2.5 sm:hidden shrink-0" />

            {/* Modal Header */}
            <div className="px-5 sm:px-7 py-4 border-b border-slate-200 dark:border-white/10 bg-gradient-to-r from-emerald-500/10 via-indigo-500/5 to-transparent flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-2xl bg-gradient-to-br from-emerald-500 to-indigo-600 text-white shadow-lg shrink-0">
                  <Wand2 size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                      Curadoria Pré-Ingestão (Gatekeeper RAG 2.0)
                    </h3>
                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                        curationModal.verdict === 'reject'
                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                          : curationModal.recommendedAction === 'merge_into_existing'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {curationModal.verdict === 'reject'
                        ? 'Conteúdo Descartável / Duplicata'
                        : curationModal.recommendedAction === 'merge_into_existing'
                          ? 'Sugerido Mesclar'
                          : curationModal.recommendedAction === 'replace_existing'
                            ? 'Substitui Base Existente'
                            : 'Aprovado e Refatorado'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-[#aebac1] mt-0.5 line-clamp-1">
                    {curationModal.recommendationSummary}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCurationModal(null)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-7 space-y-5">
              {/* Quality & Redundancy Bars */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-600 dark:text-slate-300">Qualidade & Utilidade de Negócio</span>
                    <span className={curationModal.qualityScore >= 70 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}>
                      {curationModal.qualityScore}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-black/40 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${curationModal.qualityScore >= 70 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                      style={{ width: `${curationModal.qualityScore}%` }}
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-600 dark:text-slate-300">Sobreposição com Bases Atuais</span>
                    <span className={curationModal.redundancyScore >= 70 ? 'text-rose-500' : 'text-indigo-500'}>
                      {curationModal.redundancyScore}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-black/40 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${curationModal.redundancyScore >= 70 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                      style={{ width: `${curationModal.redundancyScore}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Alerts, Overlaps & Removed Noise */}
              {(curationModal.issuesFound.length > 0 || curationModal.overlappingDocuments.length > 0 || curationModal.removedNoiseExamples.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {curationModal.issuesFound.map((iss, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
                        iss.severity === 'critical'
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <span className="font-black uppercase text-[10px] mr-1.5">[{iss.type}]</span>
                        <span>{iss.description}</span>
                      </div>
                    </div>
                  ))}
                  {curationModal.overlappingDocuments.slice(0, 2).map(od => (
                    <div
                      key={od.id}
                      className="p-3.5 rounded-2xl border border-indigo-500/25 bg-indigo-500/5 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2.5"
                    >
                      <GitMerge size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">
                          Base semelhante detectada: <span className="text-indigo-600 dark:text-indigo-400">{od.name}</span> ({Math.round(od.maxSimilarity * 100)}%)
                        </div>
                        {od.matchedSamples?.[0] && (
                          <div className="text-[11px] opacity-75 line-clamp-1 mt-0.5">"{od.matchedSamples[0]}"</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Destination & Metadata Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 dark:bg-white/[0.02] p-4 rounded-2xl border border-slate-200/80 dark:border-white/10">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">Nome da Base Limpa</label>
                  <input
                    type="text"
                    value={curationTitle}
                    onChange={e => setCurationTitle(e.target.value)}
                    className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">Categoria Semântica</label>
                  <select
                    value={curationCategory}
                    onChange={e => setCurationCategory(e.target.value)}
                    className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    {RAG_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">Estratégia no Banco</label>
                  <select
                    value={curationMode}
                    onChange={e => setCurationMode(e.target.value as any)}
                    className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="create">Criar Nova Base Separada</option>
                    {documents.length > 0 && <option value="merge">Mesclar em Base Existente (Sem Duplicar)</option>}
                    {documents.length > 0 && <option value="replace">Substituir Base Existente</option>}
                  </select>
                </div>

                {curationMode !== 'create' && documents.length > 0 && (
                  <div className="md:col-span-3 flex flex-col gap-1 pt-1">
                    <label className="text-[10px] font-black uppercase text-indigo-500">Documento Alvo para {curationMode === 'merge' ? 'Mesclagem' : 'Substituição'}</label>
                    <select
                      value={curationTargetDocId}
                      onChange={e => setCurationTargetDocId(e.target.value)}
                      className="bg-white dark:bg-black/40 border border-indigo-500/30 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    >
                      {documents.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.real_chunks_count ?? 0} vetores)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Editor Tabs: Refactored Markdown vs Preview vs Original */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex bg-slate-100 dark:bg-black/40 p-1 rounded-xl border border-slate-200 dark:border-white/10">
                    {[
                      { id: 'refactored', label: 'Markdown Refatorado (Editável)' },
                      { id: 'preview', label: 'Prévia Visual' },
                      { id: 'original', label: 'Texto Original Enviado' }
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setCurationTab(t.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          curationTab === t.id
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {curationDraftMarkdown.split(/\s+/).filter(Boolean).length} palavras limpas
                  </span>
                </div>

                {curationTab === 'refactored' ? (
                  <textarea
                    value={curationDraftMarkdown}
                    onChange={e => setCurationDraftMarkdown(e.target.value)}
                    rows={12}
                    className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-xs sm:text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 resize-y min-h-[240px]"
                  />
                ) : curationTab === 'preview' ? (
                  <MarkdownOrCorrectionsViewer content={curationDraftMarkdown} />
                ) : (
                  <pre className="w-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-[300px] overflow-y-auto custom-scrollbar">
                    {curationModal.originalText}
                  </pre>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 sm:px-7 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-black/30 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setCurationModal(null)}
                className="px-5 min-h-[48px] sm:min-h-[42px] rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-200/70 dark:bg-white/5 hover:bg-slate-300/70 dark:hover:bg-white/10 transition-all cursor-pointer"
              >
                Descartar (Não Poluir Banco)
              </button>
              <button
                type="button"
                onClick={handleCommitCurated}
                disabled={isCommittingCurated || curationDraftMarkdown.trim().length < 15}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl px-6 min-h-[48px] sm:min-h-[42px] text-xs font-black uppercase tracking-wide shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
              >
                {isCommittingCurated ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                <span>
                  {isCommittingCurated ? 'Vetorizando Blocos Semânticos...' : 'Confirmar & Vetorizar no pgvector'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: VISUALIZADOR, RAIO-X DE CHUNKS E EDITOR IA                 */}
      {/* =================================================================== */}
      {viewingFile && (() => {
        const isCorrectionsDoc =
          viewingFile.name === 'Manual de Raciocínio e Ajustes da I.A' || viewingFile.metadata?.source === 'corrections_system';
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 text-left">
            <div
              className={`bg-white dark:bg-[#0b141a]/95 border-t sm:border border-slate-200 dark:border-white/10 rounded-t-[32px] sm:rounded-[28px] p-5 sm:p-8 w-full max-h-[94vh] flex flex-col shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 ${
                isCorrectionsDoc ? 'max-w-4xl' : 'max-w-4xl'
              }`}
            >
              <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

              <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4 mb-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
                    <Database size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-white truncate">{viewingFile.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {isCorrectionsDoc
                        ? 'Gerenciador Estruturado de Correções & Raciocínio I.A'
                        : `${viewingFile.real_chunks_count ?? viewChunks.length} vetores semânticos ativos no banco`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setViewingFile(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {!isCorrectionsDoc && !isLoadingContent && (
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4 shrink-0">
                  <div className="flex bg-slate-100 dark:bg-black/40 p-1 rounded-xl border border-slate-200 dark:border-white/10">
                    {[
                      { id: 'reading', label: 'Leitura Estruturada' },
                      { id: 'vectors', label: `Raio-X dos Vetores (${viewChunks.length})` },
                      { id: 'edit', label: 'Editar & Refatorar IA' }
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setInspectorTab(t.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          inspectorTab === t.id
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {isLoadingContent ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
                    <Loader2 size={36} className="animate-spin text-indigo-500" />
                    <span className="text-sm font-medium">Recuperando dados da base vetorial...</span>
                  </div>
                ) : isCorrectionsDoc ? (
                  <div className="flex flex-col gap-5 text-left">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Regras e Correções de IA ({corrections.length})
                      </span>
                      {!isAddingCorrection && (
                        <button
                          onClick={() => setIsAddingCorrection(true)}
                          className="flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          <Plus size={14} /> Nova Regra
                        </button>
                      )}
                    </div>

                    {isAddingCorrection && (
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-5 space-y-4">
                        <div className="flex items-center justify-between border-b border-emerald-500/15 pb-2">
                          <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                            <PlusCircle size={16} /> Adicionar Nova Regra de Ajuste
                          </span>
                          <button onClick={() => setIsAddingCorrection(false)} className="text-slate-500 text-xs cursor-pointer">
                            Cancelar
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Contexto (Opcional)</label>
                            <textarea
                              value={newCorrection.context_summary}
                              onChange={e => setNewCorrection(prev => ({ ...prev, context_summary: e.target.value }))}
                              rows={2}
                              className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white resize-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Pergunta do Cliente *</label>
                            <textarea
                              value={newCorrection.user_query}
                              onChange={e => setNewCorrection(prev => ({ ...prev, user_query: e.target.value }))}
                              rows={2}
                              className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white resize-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Resposta Incorreta (Opcional)</label>
                            <textarea
                              value={newCorrection.original_response}
                              onChange={e => setNewCorrection(prev => ({ ...prev, original_response: e.target.value }))}
                              rows={2}
                              className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white resize-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Resposta Esperada *</label>
                            <textarea
                              value={newCorrection.corrected_response}
                              onChange={e => setNewCorrection(prev => ({ ...prev, corrected_response: e.target.value }))}
                              rows={2}
                              className="w-full bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white resize-none"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleSaveCorrection(newCorrection)}
                            disabled={isSavingContent || !newCorrection.user_query.trim() || !newCorrection.corrected_response.trim()}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            {isSavingContent ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            Salvar Nova Regra
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-3">
                      {corrections.length === 0 ? (
                        <div className="py-10 text-center text-sm text-slate-500">Nenhuma regra cadastrada.</div>
                      ) : (
                        corrections.map((corr, index) => {
                          const isEditing = editingCorrection?.id === corr.id;
                          if (isEditing) {
                            return (
                              <div key={corr.id || index} className="bg-indigo-500/5 border border-indigo-500/20 rounded-3xl p-5 space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <textarea
                                    value={editingCorrection.context_summary || ''}
                                    onChange={e => setEditingCorrection((p: any) => ({ ...p, context_summary: e.target.value }))}
                                    placeholder="Contexto"
                                    rows={2}
                                    className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl p-2.5 text-xs"
                                  />
                                  <textarea
                                    value={editingCorrection.user_query || ''}
                                    onChange={e => setEditingCorrection((p: any) => ({ ...p, user_query: e.target.value }))}
                                    placeholder="Pergunta *"
                                    rows={2}
                                    className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl p-2.5 text-xs"
                                  />
                                  <textarea
                                    value={editingCorrection.original_response || ''}
                                    onChange={e => setEditingCorrection((p: any) => ({ ...p, original_response: e.target.value }))}
                                    placeholder="Resposta Incorreta"
                                    rows={2}
                                    className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl p-2.5 text-xs"
                                  />
                                  <textarea
                                    value={editingCorrection.corrected_response || ''}
                                    onChange={e => setEditingCorrection((p: any) => ({ ...p, corrected_response: e.target.value }))}
                                    placeholder="Resposta Esperada *"
                                    rows={2}
                                    className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl p-2.5 text-xs"
                                  />
                                </div>
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => setEditingCorrection(null)} className="px-3 py-1.5 text-xs text-slate-500">
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={() => handleSaveCorrection(editingCorrection)}
                                    disabled={isSavingContent}
                                    className="bg-indigo-600 text-white px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Save size={12} /> Salvar
                                  </button>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={corr.id || index}
                              className="bg-slate-50 dark:bg-black/35 border border-slate-200/80 dark:border-white/10 rounded-3xl p-4 space-y-2.5 group"
                            >
                              <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2">
                                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">Regra #{index + 1}</span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setEditingCorrection(corr)}
                                    className="p-1.5 bg-indigo-500/10 text-indigo-500 rounded-lg cursor-pointer"
                                    title="Editar"
                                  >
                                    <Edit3 size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCorrection(corr.id)}
                                    className="p-1.5 bg-rose-500/10 text-rose-500 rounded-lg cursor-pointer"
                                    title="Excluir"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Pergunta: "{corr.user_query}"</p>
                              <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 p-2.5 rounded-xl">
                                "{corr.corrected_response}"
                              </p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : inspectorTab === 'reading' ? (
                  <MarkdownOrCorrectionsViewer content={viewContent} />
                ) : inspectorTab === 'vectors' ? (
                  <div className="space-y-3 pr-1">
                    {viewChunks.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-500">
                        Nenhum chunk indexado para este documento.
                      </div>
                    ) : (
                      viewChunks.map((ch, idx) => (
                        <div
                          key={ch.id || idx}
                          className="bg-slate-50 dark:bg-black/35 border border-slate-200/80 dark:border-white/10 rounded-2xl p-4 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wider">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                                Vetor #{(ch.chunk_index ?? idx) + 1}
                              </span>
                              {ch.metadata?.section_title && (
                                <span className="text-emerald-600 dark:text-emerald-400">{ch.metadata.section_title}</span>
                              )}
                            </div>
                            <span className="text-slate-500 dark:text-slate-400 font-mono">
                              {(ch.content || '').split(/\s+/).filter(Boolean).length} palavras • {(ch.content || '').length} chars
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line font-sans">
                            {ch.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Editor de Conhecimento (Re-vetoriza em Chunks Semânticos 2.0 ao Salvar)
                      </label>
                      <button
                        type="button"
                        onClick={handleRefactorInsideEditor}
                        disabled={isRefactoringEditor || !viewContent.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold shadow cursor-pointer disabled:opacity-50 active:scale-95"
                      >
                        {isRefactoringEditor ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                        <span>{isRefactoringEditor ? 'Refatorando...' : 'Refatorar & Limpar com IA'}</span>
                      </button>
                    </div>
                    <textarea
                      value={viewContent}
                      onChange={e => setViewContent(e.target.value)}
                      rows={13}
                      className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 resize-y min-h-[260px] font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 mt-5 border-t border-slate-200 dark:border-white/10 pt-4 shrink-0">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Última alteração:{' '}
                  {new Date(
                    viewingFile.metadata?.last_update || viewingFile.metadata?.updated_at || viewingFile.created_at
                  ).toLocaleString('pt-BR')}
                </div>
                <div className="flex items-center gap-2.5">
                  {!isLoadingContent && (
                    <>
                      {!isCorrectionsDoc && inspectorTab === 'edit' && (
                        <button
                          type="button"
                          onClick={handleSaveEditedContent}
                          disabled={isSavingContent || !viewContent.trim()}
                          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl px-5 min-h-[44px] text-xs font-bold shadow-lg flex items-center gap-2 cursor-pointer active:scale-95"
                        >
                          {isSavingContent ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                          <span>{isSavingContent ? 'Re-vetorizando...' : 'Salvar e Re-vetorizar'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setViewingFile(null)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-5 min-h-[44px] text-xs font-bold shadow-lg cursor-pointer active:scale-95"
                      >
                        Fechar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =================================================================== */}
      {/* MODAL 3: COLAR TEXTO MANUAL COM TEMPLATES RÁPIDOS                    */}
      {/* =================================================================== */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200 text-left">
          <div className="bg-white dark:bg-[#0b141a]/95 border-t sm:border border-slate-200 dark:border-white/10 rounded-t-[32px] sm:rounded-[28px] p-5 sm:p-8 max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3 sm:hidden shrink-0" />

            <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">Novo Conhecimento Manual</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {useGatekeeper
                      ? 'Passará pela análise Anti-Duplicidade & Refatoração IA antes de gravar no banco.'
                      : 'Será segmentado e vetorizado diretamente na base global.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPasteModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-slate-200 dark:border-white/10 shrink-0">
              <span className="text-[10px] font-black uppercase text-slate-400 mr-1">Modelos Rápidos:</span>
              {[
                { key: 'horarios', label: 'Horários & Local' },
                { key: 'pagamentos', label: 'Pagamentos & Delivery' },
                { key: 'reservas', label: 'Reservas & Eventos' },
                { key: 'faq', label: 'FAQ Clientes' }
              ].map(tpl => (
                <button
                  key={tpl.key}
                  type="button"
                  onClick={() => insertPasteTemplate(tpl.key as any)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-white/5 hover:bg-emerald-500/15 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 transition-all cursor-pointer"
                >
                  + {tpl.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Nome da Base</label>
                <input
                  type="text"
                  value={pasteTitle}
                  onChange={e => setPasteTitle(e.target.value)}
                  placeholder="Ex: politicas_entrega_e_pix.md"
                  className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl px-4 min-h-[46px] text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  Conteúdo / Regras / Texto Bruto
                </label>
                <textarea
                  value={pasteContent}
                  onChange={e => setPasteContent(e.target.value)}
                  placeholder="Cole aqui qualquer anotação, regra de atendimento, texto de política ou FAQ. A IA organiza e elimina redundâncias antes de gravar..."
                  rows={10}
                  className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 resize-y min-h-[200px]"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/10 shrink-0">
              <button
                onClick={() => {
                  setIsPasteModalOpen(false);
                  setPasteTitle('');
                  setPasteContent('');
                }}
                className="px-5 min-h-[48px] sm:min-h-[42px] rounded-2xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveText}
                disabled={!pasteTitle.trim() || !pasteContent.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl px-6 min-h-[48px] sm:min-h-[42px] font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              >
                {useGatekeeper ? <Wand2 size={16} /> : <Save size={16} />}
                <span>{useGatekeeper ? 'Analisar e Refatorar com IA' : 'Salvar Informação'}</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {deepAnalysisModalTarget && (
        <InboxDeepAnalysisModal
          isOpen={Boolean(deepAnalysisModalTarget)}
          onClose={() => setDeepAnalysisModalTarget(null)}
          tenantId={tenantId}
          instanceId={deepAnalysisModalTarget.id}
          instanceName={deepAnalysisModalTarget.name}
          onCompleted={() => {
            fetchDocuments();
          }}
        />
      )}
    </div>
  );
}
