import React, { useState, useEffect, useRef } from 'react';
import { BrainCircuit, UploadCloud, FileText, File, Trash2, CheckCircle2, AlertCircle, Loader2, Search, Zap, Info, Server, ArrowLeft, Eye, Save, Database, X, Plus, Edit3, PlusCircle, List, Grid, ChevronLeft, ChevronRight, Square, CheckSquare, ChevronDown } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

interface KnowledgeDoc {
  id: string;
  name: string;
  type: string;
  status: 'processing' | 'ready' | 'error' | 'processed';
  metadata: any;
  created_at: string;
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

    const text = part;
    
    const contextMatch = text.match(/###\s*(?:Memória da Conversa|Contexto)\s*\([^)]*\)\s*:\s*"?([\s\S]*?)"?\s*(?=###|---|$)/i);
    const questionMatch = text.match(/###\s*(?:Pergunta Similar|Pergunta)\s*(?:do Cliente)?\s*:\s*"?([\s\S]*?)"?\s*(?=###|---|$)/i);
    const incorrectMatch = text.match(/###\s*Resposta Incorreta Original\s*\([^)]*\)\s*:\s*"?([\s\S]*?)"?\s*(?=###|---|$)/i);
    const expectedMatch = text.match(/###\s*Comportamento e Resposta Esperada Corrigida\s*\([^)]*\)\s*:\s*"?([\s\S]*?)"?\s*(?=###|---|$)/i);

    corrections.push({
      title,
      context: contextMatch ? contextMatch[1].trim() : '',
      question: questionMatch ? questionMatch[1].trim() : '',
      incorrect: incorrectMatch ? incorrectMatch[1].trim() : '',
      expected: expectedMatch ? expectedMatch[1].trim() : '',
    });
  }

  return { intro, corrections };
}

function MarkdownViewer({ content }: { content: string }) {
  if (!content) return <span className="text-gray-500 italic">Este arquivo não possui conteúdo de texto extraído.</span>;

  const lines = content.split('\n');
  const renderedElements: React.ReactNode[] = [];
  
  let currentList: React.ReactNode[] = [];
  let isInsideList = false;

  const flushList = (key: number) => {
    if (currentList.length > 0) {
      renderedElements.push(
        <ul key={`list-${key}`} className="list-disc pl-5 mb-4 space-y-1 text-gray-300">
          {currentList}
        </ul>
      );
      currentList = [];
      isInsideList = false;
    }
  };

  const formatText = (text: string) => {
    const parts = text.split(/\*\*([^*]+)\*\*/g);
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={index} className="font-bold text-white">{part}</strong>;
      }
      const subParts = part.split(/`([^`]+)`/g);
      return subParts.map((subPart, subIndex) => {
        if (subIndex % 2 === 1) {
          return <code key={subIndex} className="bg-black/40 px-1.5 py-0.5 rounded text-indigo-300 font-mono text-xs">{subPart}</code>;
        }
        return subPart;
      });
    });
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    if (trimmed === '---' || trimmed === '***') {
      flushList(index);
      renderedElements.push(<hr key={index} className="my-6 border-white/10" />);
      return;
    }

    if (trimmed.startsWith('# ')) {
      flushList(index);
      renderedElements.push(
        <h1 key={index} className="text-2xl font-black text-white mt-6 mb-3 border-b border-white/5 pb-2">
          {formatText(trimmed.replace('# ', ''))}
        </h1>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList(index);
      renderedElements.push(
        <h2 key={index} className="text-lg font-extrabold text-indigo-400 mt-5 mb-2">
          {formatText(trimmed.replace('## ', ''))}
        </h2>
      );
      return;
    }
    if (trimmed.startsWith('### ')) {
      flushList(index);
      renderedElements.push(
        <h3 key={index} className="text-sm font-bold text-gray-200 mt-4 mb-1.5 flex items-center gap-1.5">
          {formatText(trimmed.replace('### ', ''))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      isInsideList = true;
      const itemText = trimmed.substring(2);
      currentList.push(
        <li key={index}>
          {formatText(itemText)}
        </li>
      );
      return;
    }

    if (trimmed === '') {
      flushList(index);
      return;
    }

    flushList(index);
    renderedElements.push(
      <p key={index} className="mb-3 text-gray-300 leading-relaxed">
        {formatText(trimmed)}
      </p>
    );
  });

  flushList(lines.length);

  return <div className="space-y-1">{renderedElements}</div>;
}

function MarkdownOrCorrectionsViewer({ content }: { content: string }) {
  if (!content) {
    return <span className="text-gray-500 italic">Este arquivo não possui conteúdo de texto extraído.</span>;
  }

  const parsed = parseCorrections(content);

  if (parsed) {
    return (
      <div className="space-y-6 text-left">
        {parsed.intro && (
          <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-sm text-gray-300 leading-relaxed">
            <div className="flex items-start gap-2.5">
              <Info className="text-indigo-400 mt-0.5 flex-shrink-0" size={18} />
              <div>
                <p className="font-semibold text-gray-200 mb-1">Introdução & Diretrizes</p>
                <p className="text-xs text-gray-400 leading-relaxed font-sans">{parsed.intro.replace(/^#\s+[^\n]+\n/i, '').trim()}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Regras e Correções de Raciocínio ({parsed.corrections.length})</p>
          <div className="grid grid-cols-1 gap-4 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
            {parsed.corrections.map((card, index) => (
              <div key={index} className="bg-black/35 border border-white/5 rounded-3xl p-5 hover:border-indigo-500/20 transition-all space-y-3 relative overflow-hidden text-left">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none"></div>
                
                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                  <BrainCircuit className="text-indigo-400" size={18} />
                  <h4 className="text-sm font-bold text-white tracking-wide">{card.title}</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {card.context && (
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 space-y-1">
                      <span className="font-bold text-gray-400 flex items-center gap-1"><Info size={12} className="text-blue-400" /> Contexto / Memória</span>
                      <p className="text-gray-300 italic">"{card.context}"</p>
                    </div>
                  )}
                  {card.question && (
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 space-y-1">
                      <span className="font-bold text-gray-400 flex items-center gap-1"><Zap size={12} className="text-amber-400" /> Pergunta do Cliente</span>
                      <p className="text-gray-300">"{card.question}"</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                  {card.incorrect && (
                    <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-3 space-y-1">
                      <span className="font-bold text-red-400/90 flex items-center gap-1"><AlertCircle size={12} /> Resposta Incorreta (Não repetir)</span>
                      <p className="text-gray-400 line-through">"{card.incorrect}"</p>
                    </div>
                  )}
                  {card.expected && (
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-3 space-y-1">
                      <span className="font-bold text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> Comportamento Esperado</span>
                      <p className="text-emerald-300 font-medium">"{card.expected}"</p>
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
    <div className="bg-black/30 border border-white/5 rounded-2xl p-5 overflow-y-auto max-h-[350px] custom-scrollbar text-sm text-gray-300 leading-relaxed select-text selection:bg-indigo-500/30 text-left">
      <MarkdownViewer content={content} />
    </div>
  );
}

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [testQuery, setTestQuery] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');

  // Estados de Visualização/Edição de Conteúdo do RAG
  const [viewingFile, setViewingFile] = useState<any | null>(null);
  const [viewContent, setViewContent] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isSavingContent, setIsSavingContent] = useState(false);

  // Filtros de busca locais para bases
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'pdf' | 'text'>('all');

  // Estados para paginação, visualização e seleção em massa
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  // Estados de busca avançada
  const [matchingChunkDocIds, setMatchingChunkDocIds] = useState<string[]>([]);
  const [isSearchingContent, setIsSearchingContent] = useState(false);

  // Estados para Gerenciamento Estruturado de Correções (Manual RAG)
  const [corrections, setCorrections] = useState<any[]>([]);
  const [editingCorrection, setEditingCorrection] = useState<any | null>(null);
  const [isAddingCorrection, setIsAddingCorrection] = useState(false);
  const [newCorrection, setNewCorrection] = useState({
    user_query: '',
    original_response: '',
    corrected_response: '',
    context_summary: ''
  });

  const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || localStorage.getItem('tenantId') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';

  // Resetar página quando os filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedType]);

  // Busca avançada de conteúdo nos chunks
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
            .ilike('content', `%${trimmedSearch}%`);
          
          if (!error && data) {
            const ids = Array.from(new Set(data.map(item => item.document_id).filter(Boolean))) as string[];
            setMatchingChunkDocIds(ids);
          } else {
            setMatchingChunkDocIds([]);
          }
        } catch (err) {
          console.error("Erro pesquisando conteúdo nos chunks:", err);
          setMatchingChunkDocIds([]);
        } finally {
          setIsSearchingContent(false);
        }
      } else {
        setMatchingChunkDocIds([]);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm, tenantId]);

  useEffect(() => {
    fetchDocuments();
    // Poll para o status 'processing' a cada 2.5 segundos
    const interval = setInterval(() => {
        setDocuments(prev => {
           if(prev.some(d => d.status === 'processing')) {
               fetchDocuments();
           }
           return prev;
        });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('knowledge_documents')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (err) {
      console.error("Erro listando documentos do RAG:", err);
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
      await uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFile(e.target.files[0]);
    }
  };

  const handleSaveText = async () => {
    if (!pasteTitle.trim() || !pasteContent.trim()) {
      alert("Por favor, preencha o título e o conteúdo.");
      return;
    }

    let fileName = pasteTitle.trim();
    if (!fileName.endsWith('.txt')) {
      fileName += '.txt';
    }

    const virtualFile = new File([pasteContent], fileName, { type: 'text/plain' });
    
    setIsPasteModalOpen(false);
    setPasteTitle('');
    setPasteContent('');

    await uploadFile(virtualFile);
  };

  const handleViewContent = async (file: any) => {
    setViewingFile(file);
    setIsLoadingContent(true);
    setViewContent('');
    setIsEditMode(false);
    setEditingCorrection(null);
    setIsAddingCorrection(false);

    const isCorrections = file.name === 'Manual de Raciocínio e Ajustes da I.A' || file.metadata?.source === 'corrections_system';

    try {
      if (isCorrections) {
        const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/corrections`, {
          headers: {
            'x-tenant-id': tenantId
          }
        });
        if (response.ok) {
          const data = await response.json();
          setCorrections(data.corrections || []);
        } else {
          alert('Erro ao carregar as regras de raciocínio.');
        }
      } else {
        const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/${file.id}/content`, {
          headers: {
            'x-tenant-id': tenantId
          }
        });
        if (response.ok) {
          const data = await response.json();
          setViewContent(data.content || '');
        } else {
          alert('Erro ao carregar o conteúdo.');
        }
      }
    } catch (err) {
      alert('Erro de conexão ao carregar o conteúdo.');
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleSaveCorrection = async (corr: any) => {
    if (!corr.user_query.trim() || !corr.corrected_response.trim()) {
      alert('A pergunta do cliente e a resposta esperada são obrigatórias.');
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
        const res = await fetch(`${ENGINE_URL}/api/v1/knowledge/corrections`, {
          headers: {
            'x-tenant-id': tenantId
          }
        });
        if (res.ok) {
          const data = await res.json();
          setCorrections(data.corrections || []);
        }
        setEditingCorrection(null);
        setIsAddingCorrection(false);
        setNewCorrection({
          user_query: '',
          original_response: '',
          corrected_response: '',
          context_summary: ''
        });
        fetchDocuments();
      } else {
        const err = await response.json();
        alert(`Erro ao salvar regra: ${err.error}`);
      }
    } catch (err) {
      alert('Erro de conexão ao salvar regra.');
    } finally {
      setIsSavingContent(false);
    }
  };

  const handleDeleteCorrection = async (id: string) => {
    if (!confirm('Tem certeza de que deseja excluir esta regra de raciocínio? A inteligência artificial deixará de seguir esta instrução imediatamente.')) return;
    setIsSavingContent(true);
    try {
      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/corrections/${id}`, {
        method: 'DELETE',
        headers: {
          'x-tenant-id': tenantId
        }
      });
      if (response.ok) {
        setCorrections(prev => prev.filter(c => c.id !== id));
        fetchDocuments();
      } else {
        alert('Erro ao excluir regra.');
      }
    } catch (err) {
      alert('Erro de conexão ao excluir.');
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
        setViewingFile(null);
        setViewContent('');
        setIsEditMode(false);
        fetchDocuments();
      } else {
        const err = await response.json();
        alert(`Erro ao salvar: ${err.error || 'Falha na re-vetorização'}`);
      }
    } catch (err) {
      alert('Erro de conexão ao salvar.');
    } finally {
      setIsSavingContent(false);
    }
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/upload`, {
        method: 'POST',
        headers: {
          'x-tenant-id': tenantId
        },
        body: formData
      });
      
      if (!response.ok) {
         const err = await response.json();
         throw new Error(err.error || 'Falha no upload');
      }
      
      await fetchDocuments();
    } catch (err: any) {
      alert(`Erro no envio: ${err.message}`);
    } finally {
      setIsUploading(false);
      if(fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteDocument = async (id: string) => {
    if(!confirm('Tem certeza? Isso excluirá toda a inteligência e vetores atrelados a este arquivo.')) return;
    try {
      // Como a API e RLS já restringem, chamamos direto o supabase para manter rapido
      const { error } = await supabase.from('knowledge_documents').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err: any) {
      alert(`Erro ao excluir: ${err.message}`);
    }
  };

  const handleTestMatch = async () => {
      if(!testQuery.trim()) return;
      setIsTesting(true);
      try {
         const response = await fetch(`${ENGINE_URL}/api/v1/knowledge/match`, {
             method: 'POST',
             headers: {
                 'x-tenant-id': tenantId,
                 'Content-Type': 'application/json'
             },
             body: JSON.stringify({ query: testQuery })
         });
         const data = await response.json();
         if(data.matches) {
            setTestResults(data.matches);
         } else {
            alert('Falha na pesquisa RAG.');
         }
      } catch(err) {
         alert('Servidor RAG parece estar offline.');
      } finally {
         setIsTesting(false);
      }
  };

  // Filtros de documentos e paginação (ordenado do mais recente para o mais antigo)
  const filteredDocuments = documents
    .filter(doc => {
      const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            matchingChunkDocIds.includes(doc.id);
      const matchesType = selectedType === 'all' 
        ? true 
        : selectedType === 'pdf' 
          ? doc.type === 'application/pdf' 
          : doc.type !== 'application/pdf';
      return matchesSearch && matchesType;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalPages = Math.ceil(filteredDocuments.length / pageSize) || 1;
  const effectiveCurrentPage = Math.min(currentPage, totalPages);
  const paginatedDocuments = filteredDocuments.slice((effectiveCurrentPage - 1) * pageSize, effectiveCurrentPage * pageSize);

  // Seleção e exclusão em lote
  const isAllSelected = paginatedDocuments.length > 0 && paginatedDocuments.every(doc => selectedDocIds.includes(doc.id));
  
  const toggleSelectDoc = (id: string) => {
    setSelectedDocIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
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
    if (!confirm(`Tem certeza de que deseja excluir os ${selectedDocIds.length} documentos selecionados? Isso removerá permanentemente todos os vetores e dados associados.`)) return;
    
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
    } catch (err: any) {
      alert(`Erro ao excluir em lote: ${err.message}`);
    } finally {
      setIsSavingContent(false);
    }
  };

  return (
    <div className="flex-1 p-6 md:p-10 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-500 rounded-3xl bg-[#0b141a]/40 m-4 border border-white/5 shadow-2xl relative">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="max-w-5xl mx-auto relative z-10 flex flex-col gap-8">
        
        {/* Back Button */}
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-5 py-2.5 rounded-full transition-all border border-emerald-500/20 w-fit shadow-lg shadow-emerald-500/5 group backdrop-blur-md"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold text-sm tracking-wide">Voltar</span>
        </button>

        {/* Header Premium */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-400 rounded-2xl shadow-lg ring-4 ring-emerald-500/20">
                <BrainCircuit size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                  Base de Conhecimento Global (RAG)
                </h1>
                <p className="text-gray-400 font-medium mt-1">
                  Arquivos gerais da empresa. Todos os agentes terão acesso a estas informações.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md px-4 py-2 border border-white/10 rounded-2xl">
             <Server size={18} className="text-emerald-400" />
             <span className="text-sm font-bold text-gray-200">pgvector active</span>
          </div>
        </div>

        {/* Painel de Estatísticas Premium */}
        {(() => {
          const pdfCount = documents.filter(d => d.type === 'application/pdf').length;
          const txtCount = documents.filter(d => d.type !== 'application/pdf').length;
          const readyCount = documents.filter(d => d.status === 'ready' || d.status === 'processed').length;
          const processingCount = documents.filter(d => d.status === 'processing').length;
          const totalChunks = documents.reduce((sum, doc) => sum + (doc.metadata?.chunks_total || 0), 0);

          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in duration-500">
              <div className="bg-black/20 border border-white/5 rounded-3xl p-5 backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/20 transition-all text-left">
                <div className="absolute -right-6 -bottom-6 text-white/5 group-hover:text-emerald-500/5 transition-colors">
                  <Database size={80} />
                </div>
                <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Total de Bases</span>
                <div className="text-2xl font-black text-white mt-1">{documents.length}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">Arquivos vetorizados</div>
              </div>
              
              <div className="bg-black/20 border border-white/5 rounded-3xl p-5 backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/20 transition-all text-left">
                <div className="absolute -right-6 -bottom-6 text-white/5 group-hover:text-emerald-500/5 transition-colors">
                  <CheckCircle2 size={80} />
                </div>
                <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Status Ativo</span>
                <div className="text-2xl font-black text-emerald-400 mt-1 flex items-center gap-1.5">
                  {readyCount}
                  <span className="text-xs font-bold text-gray-500">Prontos</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">{processingCount > 0 ? `${processingCount} em processamento` : 'Sincronizados e ativos'}</div>
              </div>

              <div className="bg-black/20 border border-white/5 rounded-3xl p-5 backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/20 transition-all text-left">
                <div className="absolute -right-6 -bottom-6 text-white/5 group-hover:text-emerald-500/5 transition-colors">
                  <BrainCircuit size={80} />
                </div>
                <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Vetores / Chunks</span>
                <div className="text-2xl font-black text-indigo-400 mt-1">{totalChunks}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">Fragmentos gerados no DB</div>
              </div>

              <div className="bg-black/20 border border-white/5 rounded-3xl p-5 backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/20 transition-all text-left">
                <div className="absolute -right-6 -bottom-6 text-white/5 group-hover:text-emerald-500/5 transition-colors">
                  <FileText size={80} />
                </div>
                <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Formatos</span>
                <div className="text-2xl font-black text-amber-400 mt-1 flex items-center gap-3">
                  <span>{pdfCount} <span className="text-xs font-bold text-gray-500">PDF</span></span>
                  <span>{txtCount} <span className="text-xs font-bold text-gray-500">TXT</span></span>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">Suporta PDF, TXT, CSV</div>
              </div>
            </div>
          );
        })()}

        {/* Upload Zone & Test Zone */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* DRAG AND DROP & TEXT INJECTION */}
            <div className="flex flex-col gap-4 mt-4">
              <div 
                className={`relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-4xl transition-all duration-300 backdrop-blur-xl cursor-pointer overflow-hidden
                  ${isDragging ? 'border-emerald-400 bg-emerald-500/10 scale-[1.02]' : 'border-gray-700/50 hover:border-emerald-500/50 bg-black/20 hover:bg-black/40'}
                `}
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
                  accept=".txt,.pdf,.csv" 
                />
                
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none"></div>

                {isUploading ? (
                   <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300 relative z-10">
                      <div className="relative">
                          <div className="absolute inset-0 bg-emerald-500 rounded-full blur-xl opacity-50 animate-pulse"></div>
                          <Loader2 size={48} className="animate-spin text-emerald-400 relative z-10" />
                      </div>
                      <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-400">
                          Processando e Vetorizando seu Documento...
                      </span>
                   </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 opacity-80 group-hover:opacity-100 transition-opacity relative z-10">
                     <div className="bg-gradient-to-tr from-gray-800 to-gray-700 p-4 rounded-full shadow-lg border border-gray-600">
                        <UploadCloud size={40} className="text-emerald-400" />
                     </div>
                     <div className="text-center">
                       <p className="text-xl font-bold text-gray-200 mb-1">Arraste seus PDFs ou TXTs aqui</p>
                       <p className="text-sm text-gray-400">Ou clique para procurar em seu computador.</p>
                     </div>
                  </div>
                )}
              </div>

              {/* Botão Premium de Colar Texto Livre */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPasteModalOpen(true);
                }}
                className="flex items-center justify-center gap-2.5 w-full bg-gradient-to-r from-slate-800/80 to-slate-900/80 hover:from-emerald-950/40 hover:to-emerald-900/40 text-slate-300 hover:text-emerald-400 border border-white/5 hover:border-emerald-500/30 py-4 px-6 rounded-3xl font-bold transition-all shadow-lg backdrop-blur-md hover:shadow-emerald-500/5 group"
              >
                <FileText size={20} className="group-hover:scale-110 transition-transform" />
                <span>Colar Texto Livre / Manual</span>
              </button>
            </div>

            {/* TEST ZONE */}
            <div className="bg-black/30 backdrop-blur-2xl border border-white/5 rounded-4xl p-6 mt-4 flex flex-col shadow-xl">
               <div className="flex items-center gap-2 mb-4">
                  <span className="p-2 bg-blue-500/20 text-blue-400 rounded-xl"><Zap size={20} /></span>
                  <h2 className="text-xl font-bold text-gray-200">Testar Similaridade (RAG Match)</h2>
               </div>
               
               <p className="text-sm text-gray-400 mb-6">
                 O sistema fragmentou seus textos em vetores matemáticos (matriz densa de 384 dimensões). Digite algo para o banco buscar semelhança semântica:
               </p>

               <div className="flex gap-2">
                 <input 
                   type="text" 
                   value={testQuery}
                   onChange={e => setTestQuery(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && handleTestMatch()}
                   className="flex-1 bg-black/40 border border-gray-700/50 rounded-2xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-gray-600"
                   placeholder="Ex: Como configurar o proxy do servidor?"
                 />
                 <button 
                   disabled={isTesting || !testQuery.trim()}
                   onClick={handleTestMatch}
                   className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl px-6 font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center"
                 >
                   {isTesting ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                 </button>
               </div>

               {/* Resultados da Busca (Scroller) */}
               {testResults !== null && (
                 <div className="mt-6 flex-1 overflow-y-auto custom-scrollbar bg-black/20 rounded-2xl p-4 border border-white/5 max-h-[220px]">
                   {testResults.length === 0 ? (
                      <p className="text-gray-500 text-sm italic text-center mt-8">Nenhum trecho semelhante encontrado na base.</p>
                   ) : (
                      <div className="flex flex-col gap-3">
                         {testResults.map((r, i) => (
                           <div key={i} className="bg-gray-800/40 p-3 rounded-xl border border-gray-700/30 flex flex-col gap-2 relative overflow-hidden group">
                               <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-400 to-transparent"></div>
                               <div className="flex justify-between items-center pl-2">
                                  <div className="flex items-center gap-2">
                                      <span className="text-[10px] uppercase font-bold text-emerald-500 tracking-wider">Acerto: {(r.similarity * 100).toFixed(1)}%</span>
                                      {r.method && (
                                          <span className="text-[9px] uppercase font-bold bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-700">{r.method}</span>
                                      )}
                                  </div>
                               </div>
                               <p className="text-sm text-gray-300 pl-2 leading-relaxed italic">"...{r.content}..."</p>
                           </div>
                         ))}
                      </div>
                   )}
                 </div>
               )}
            </div>
         </div>
          {/* Lista de Documentos com Busca e Filtros */}
        <div className="mt-4 flex flex-col gap-6">
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
              <h2 className="text-xl font-bold text-gray-200 flex items-center gap-2">
                 Arquivos Globais da Empresa <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2.5 py-0.5 rounded-full">{documents.length}</span>
              </h2>
              
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                 {/* Input de Busca */}
                 <div className="relative w-full sm:w-60">
                    {isSearchingContent ? (
                       <Loader2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400 animate-spin" />
                    ) : (
                       <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    )}
                    <input 
                       type="text" 
                       value={searchTerm}
                       onChange={e => setSearchTerm(e.target.value)}
                       placeholder="Buscar por nome ou conteúdo..."
                       className="w-full bg-black/40 border border-gray-700/50 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-gray-200 focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-gray-600"
                    />
                    {searchTerm && (
                       <button onClick={() => setSearchTerm('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs">✕</button>
                    )}
                 </div>

                 {/* Abas de Filtro */}
                 <div className="flex bg-black/40 border border-gray-700/30 p-1 rounded-2xl w-full sm:w-auto">
                    <button
                       onClick={() => setSelectedType('all')}
                       className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${selectedType === 'all' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                       Todos
                    </button>
                    <button
                       onClick={() => setSelectedType('pdf')}
                       className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${selectedType === 'pdf' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                       PDFs
                    </button>
                    <button
                       onClick={() => setSelectedType('text')}
                       className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${selectedType === 'text' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                       TXTs / Manuais
                    </button>
                 </div>

                 {/* Seletor de visualização (Grid / Lista) */}
                 <div className="flex bg-black/40 border border-gray-700/30 p-1 rounded-2xl">
                    <button
                       onClick={() => setViewMode('grid')}
                       className={`p-1.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                       title="Visualização em Grade"
                    >
                       <Grid size={16} />
                    </button>
                    <button
                       onClick={() => setViewMode('list')}
                       className={`p-1.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                       title="Visualização em Lista"
                    >
                       <List size={16} />
                    </button>
                 </div>

                 {/* Seletor de tamanho de página */}
                 <div className="relative">
                    <select
                       value={pageSize}
                       onChange={e => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                       }}
                       className="bg-black/40 border border-gray-700/50 rounded-2xl px-3.5 py-2.5 text-xs text-gray-200 focus:outline-none focus:border-emerald-500/50 appearance-none pr-8 cursor-pointer font-bold"
                    >
                       <option value={12}>12 por pág.</option>
                       <option value={24}>24 por pág.</option>
                       <option value={48}>48 por pág.</option>
                       <option value={96}>96 por pág.</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                 </div>
              </div>
           </div>

           {/* Barra de Ações em Massa */}
           {selectedDocIds.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-3xl backdrop-blur-md animate-in slide-in-from-top-4 duration-300 text-left">
                 <div className="flex items-center gap-2 text-emerald-400">
                    <CheckSquare size={18} />
                    <span className="text-xs font-bold">
                       {selectedDocIds.length} {selectedDocIds.length === 1 ? 'documento selecionado' : 'documentos selecionados'}
                    </span>
                 </div>
                 
                 <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                       onClick={deleteSelectedDocuments}
                       className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                    >
                       <Trash2 size={14} /> Excluir Selecionados
                    </button>
                    <button
                       onClick={() => setSelectedDocIds([])}
                       className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/5 hover:border-white/10 px-4 py-2 rounded-xl text-xs font-bold transition-all"
                    >
                       <X size={14} /> Limpar Seleção
                    </button>
                 </div>
              </div>
           )}

           {filteredDocuments.length === 0 && !isUploading ? (
              <div className="py-12 flex flex-col items-center justify-center opacity-50 bg-black/10 border border-dashed border-gray-700 rounded-3xl">
                 <FileText size={48} className="mb-4 text-gray-500" />
                 <p className="text-sm">Nenhum documento encontrado para este filtro.</p>
              </div>
           ) : (
              <>
                 {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-500">
                       {paginatedDocuments.map((doc) => {
                          const sizeFormatted = doc.metadata?.size 
                            ? (doc.metadata.size / 1024).toFixed(1) + ' KB' 
                            : 'TXT Manual';

                          const chunksTotal = doc.metadata?.chunks_total || 0;
                          const chunksProcessed = doc.metadata?.chunks_processed || 0;
                          const percent = chunksTotal > 0 ? Math.round((chunksProcessed / chunksTotal) * 100) : 0;
                          const statusMsg = doc.metadata?.current_status || 'Vetorizando...';
                          const isSelected = selectedDocIds.includes(doc.id);

                          return (
                            <div key={doc.id} className={`bg-black/30 backdrop-blur-md rounded-3xl p-5 border hover:border-emerald-500/30 transition-all group relative overflow-hidden shadow-xl hover:shadow-2xl flex flex-col gap-4 text-left ${isSelected ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : 'border-white/5'}`}>
                               <div className="absolute -right-10 -top-10 bg-white/5 w-32 h-32 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors pointer-events-none"></div>
                               
                               <div className="flex justify-between items-start relative z-10">
                                  <div className="flex items-center gap-2">
                                     <button 
                                        onClick={(e) => {
                                           e.stopPropagation();
                                           toggleSelectDoc(doc.id);
                                        }} 
                                        className="text-gray-400 hover:text-emerald-400 transition-colors bg-white/5 hover:bg-white/10 p-2.5 rounded-2xl border border-white/10"
                                        title={isSelected ? "Desmarcar" : "Selecionar"}
                                     >
                                        {isSelected ? <CheckSquare size={16} className="text-emerald-400" /> : <Square size={16} />}
                                     </button>
                                     <div className={`p-2.5 rounded-2xl flex items-center justify-center shadow-lg border border-white/10
                                         ${doc.type === 'application/pdf' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}
                                     `}>
                                        <File size={16} />
                                     </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-1.5">
                                     {doc.status === 'processing' && (
                                        <span className="flex items-center gap-1.5 bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-xs font-bold animate-pulse border border-orange-500/30">
                                          <Loader2 size={12} className="animate-spin" /> Vetorizando
                                        </span>
                                     )}
                                     {(doc.status === 'ready' || doc.status === 'processed') && (
                                        <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold border border-emerald-500/20">
                                          <CheckCircle2 size={14} /> Pronto
                                        </span>
                                     )}
                                     {doc.status === 'error' && (
                                        <span className="flex items-center gap-1 bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-bold border border-red-500/30 animate-pulse" title={doc.metadata?.err}>
                                          <AlertCircle size={14} /> Falha
                                        </span>
                                     )}
                                  </div>
                               </div>
                               
                               <div className="relative z-10 flex-1">
                                   <h3 className="text-gray-200 font-bold text-lg truncate mb-1" title={doc.name}>{doc.name}</h3>
                                   <div className="text-gray-500 text-xs flex flex-col gap-1">
                                       <div>{sizeFormatted} • Adicionado em {new Date(doc.created_at).toLocaleDateString('pt-BR')} às {new Date(doc.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                                       {doc.metadata?.last_update && (
                                          <div className="text-emerald-400/90 font-bold flex items-center gap-1">
                                             <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block"></span>
                                             Último Update: {new Date(doc.metadata.last_update).toLocaleString('pt-BR')}
                                          </div>
                                       )}
                                   </div>
                               </div>

                               {doc.status === 'processing' && (
                                  <div className="w-full bg-black/40 p-3 rounded-xl border border-white/5 relative z-10 animate-in slide-in-from-top-2 duration-300">
                                     <div className="flex justify-between items-center mb-1 text-[10px] text-orange-400 font-bold uppercase tracking-wider">
                                        <span className="truncate max-w-[80%]">{statusMsg}</span>
                                        <span>{percent}%</span>
                                     </div>
                                     <div className="w-full bg-orange-500/10 border border-orange-500/20 rounded-full h-1.5 overflow-hidden">
                                        <div 
                                           className="bg-gradient-to-r from-orange-500 to-amber-400 h-full rounded-full transition-all duration-300" 
                                           style={{ width: `${percent}%` }}
                                        />
                                     </div>
                                  </div>
                               )}

                               <div className="mt-4 flex gap-2 relative z-10">
                                  {(doc.status === 'ready' || doc.status === 'processed') && (
                                     <button 
                                        onClick={() => handleViewContent(doc)} 
                                        className="flex-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 py-2.5 rounded-xl text-sm font-bold transition-all border border-indigo-500/20 hover:border-indigo-500/40 flex items-center justify-center gap-2"
                                     >
                                        <Eye size={16} /> Acessar Dados
                                     </button>
                                  )}
                                  <button 
                                     onClick={() => deleteDocument(doc.id)} 
                                     className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 py-2.5 rounded-xl text-sm font-bold transition-all border border-red-500/20 hover:border-red-500/40 flex items-center justify-center gap-2"
                                  >
                                     <Trash2 size={16} /> Excluir Base
                                  </button>
                                </div>
                            </div>
                          );
                       })}
                    </div>
                 ) : (
                    <div className="w-full overflow-x-auto rounded-3xl border border-white/5 bg-black/20 backdrop-blur-md shadow-xl custom-scrollbar">
                       <table className="w-full border-collapse text-left text-xs">
                          <thead>
                             <tr className="border-b border-white/5 bg-white/[0.02] text-gray-400 font-bold uppercase tracking-wider">
                                <th className="p-4 w-12 text-center">
                                   <button onClick={toggleSelectAll} className="text-gray-400 hover:text-emerald-400 transition-colors">
                                      {isAllSelected ? <CheckSquare size={16} className="text-emerald-400" /> : <Square size={16} />}
                                   </button>
                                </th>
                                <th className="p-4">Nome</th>
                                <th className="p-4">Formato</th>
                                <th className="p-4">Tamanho</th>
                                <th className="p-4">Adicionado em</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Ações</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-gray-300">
                             {paginatedDocuments.map(doc => {
                                const isSelected = selectedDocIds.includes(doc.id);
                                const sizeFormatted = doc.metadata?.size 
                                  ? (doc.metadata.size / 1024).toFixed(1) + ' KB' 
                                  : 'TXT Manual';
                                const isPdf = doc.type === 'application/pdf';

                                return (
                                   <tr key={doc.id} className={`hover:bg-white/[0.02] transition-colors ${isSelected ? 'bg-emerald-500/[0.02]' : ''}`}>
                                      <td className="p-4 text-center">
                                         <button onClick={() => toggleSelectDoc(doc.id)} className="text-gray-400 hover:text-emerald-400 transition-colors">
                                            {isSelected ? <CheckSquare size={16} className="text-emerald-400" /> : <Square size={16} />}
                                         </button>
                                      </td>
                                      <td className="p-4 font-bold text-gray-200">
                                         <div className="flex items-center gap-2 max-w-xs md:max-w-md truncate" title={doc.name}>
                                            <div className={`p-1.5 rounded-lg flex-shrink-0 ${isPdf ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                               <File size={14} />
                                            </div>
                                            <span className="truncate">{doc.name}</span>
                                         </div>
                                      </td>
                                      <td className="p-4 text-gray-400">{isPdf ? 'PDF' : 'TXT'}</td>
                                      <td className="p-4 text-gray-400">{sizeFormatted}</td>
                                      <td className="p-4 text-gray-400">
                                          {new Date(doc.created_at).toLocaleDateString('pt-BR')} às {new Date(doc.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                      </td>
                                      <td className="p-4">
                                         {doc.status === 'processing' && (
                                            <span className="inline-flex items-center gap-1 bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse border border-orange-500/30">
                                               <Loader2 size={10} className="animate-spin" /> Vetorizando
                                            </span>
                                         )}
                                         {(doc.status === 'ready' || doc.status === 'processed') && (
                                            <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-500/20">
                                               <CheckCircle2 size={11} /> Pronto
                                            </span>
                                         )}
                                         {doc.status === 'error' && (
                                            <span className="inline-flex items-center gap-1 bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-[10px] font-bold border border-red-500/30" title={doc.metadata?.err}>
                                               <AlertCircle size={11} /> Falha
                                            </span>
                                         )}
                                      </td>
                                      <td className="p-4 text-right">
                                         <div className="flex items-center justify-end gap-1.5">
                                            {(doc.status === 'ready' || doc.status === 'processed') && (
                                               <button 
                                                  onClick={() => handleViewContent(doc)} 
                                                  className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 rounded-lg border border-indigo-500/20 transition-all"
                                                  title="Acessar Dados"
                                               >
                                                  <Eye size={13} />
                                               </button>
                                            )}
                                            <button 
                                               onClick={() => deleteDocument(doc.id)} 
                                               className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg border border-red-500/20 transition-all"
                                               title="Excluir Base"
                                            >
                                               <Trash2 size={13} />
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

                 {/* Controles de Paginação */}
                 {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 bg-black/20 border border-white/5 p-4 rounded-3xl backdrop-blur-md">
                       <div className="text-xs text-gray-400">
                          Exibindo <span className="font-bold text-gray-200">{paginatedDocuments.length}</span> de <span className="font-bold text-gray-200">{filteredDocuments.length}</span> documentos
                       </div>
                       
                       <div className="flex items-center gap-1.5">
                          <button
                             onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                             disabled={effectiveCurrentPage === 1}
                             className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-gray-300 rounded-xl transition-all border border-white/5"
                          >
                             <ChevronLeft size={16} />
                          </button>
                          
                          {Array.from({ length: totalPages }).map((_, idx) => {
                             const pageNum = idx + 1;
                             if (totalPages > 5 && Math.abs(pageNum - effectiveCurrentPage) > 2 && pageNum !== 1 && pageNum !== totalPages) {
                                if (pageNum === 2 || pageNum === totalPages - 1) {
                                   return <span key={pageNum} className="text-gray-600 px-1 text-xs">...</span>;
                                }
                                return null;
                             }
                             
                             return (
                                <button
                                   key={pageNum}
                                   onClick={() => setCurrentPage(pageNum)}
                                   className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                      pageNum === effectiveCurrentPage 
                                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md' 
                                        : 'bg-white/5 border-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10'
                                   }`}
                                >
                                   {pageNum}
                                </button>
                             );
                          })}
                          
                          <button
                             onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                             disabled={effectiveCurrentPage === totalPages}
                             className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-gray-300 rounded-xl transition-all border border-white/5"
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

      {/* Modal Premium para Acessar e Editar Dados de Conhecimento */}
      {viewingFile && (() => {
        const isCorrectionsDoc = viewingFile.name === 'Manual de Raciocínio e Ajustes da I.A' || viewingFile.metadata?.source === 'corrections_system';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300 text-left">
            <div className={`bg-[#0b141a]/95 border border-white/10 rounded-[2rem] p-6 md:p-8 w-full shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 transition-all ${isCorrectionsDoc ? 'max-w-4xl' : 'max-w-3xl'}`}>
              {/* Glow de fundo */}
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none"></div>
              
              <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
                    <Database size={22} />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-gray-100 truncate max-w-md">{viewingFile.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Visualizando os dados absorvidos pelo RAG</p>
                  </div>
                </div>
                <button 
                  onClick={() => setViewingFile(null)}
                  className="p-2 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="mt-4">
                {isLoadingContent ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3 text-gray-400">
                    <Loader2 size={36} className="animate-spin text-indigo-400" />
                    <span className="text-sm font-medium">Recuperando dados da base vetorial...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {isCorrectionsDoc ? (
                      <div className="flex flex-col gap-5 text-left">
                        {/* Header com botão de Adicionar */}
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                            Regras e Correções de IA ({corrections.length})
                          </span>
                          {!isAddingCorrection && (
                            <button
                              onClick={() => setIsAddingCorrection(true)}
                              className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all"
                            >
                              <Plus size={14} /> Nova Regra
                            </button>
                          )}
                        </div>

                        {/* Form para adicionar nova correção */}
                        {isAddingCorrection && (
                          <div className="bg-emerald-500/[0.02] border border-emerald-500/10 rounded-3xl p-5 space-y-4 animate-in slide-in-from-top-4 duration-300">
                            <div className="flex items-center justify-between border-b border-emerald-500/10 pb-2">
                              <span className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                <PlusCircle size={16} /> Adicionar Nova Regra de Ajuste
                              </span>
                              <button
                                onClick={() => setIsAddingCorrection(false)}
                                className="text-gray-500 hover:text-gray-300 text-xs"
                              >
                                Cancelar
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">Contexto / Memória (Opcional)</label>
                                <textarea
                                  value={newCorrection.context_summary}
                                  onChange={e => setNewCorrection(prev => ({ ...prev, context_summary: e.target.value }))}
                                  placeholder="Ex: Cliente solicita status em tempo real do pedido..."
                                  rows={2}
                                  className="w-full bg-black/40 border border-gray-700/50 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500/50 resize-none font-sans"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">Pergunta do Cliente (Obrigatório)</label>
                                <textarea
                                  value={newCorrection.user_query}
                                  onChange={e => setNewCorrection(prev => ({ ...prev, user_query: e.target.value }))}
                                  placeholder="Ex: Qual o andamento do meu pedido?"
                                  rows={2}
                                  className="w-full bg-black/40 border border-gray-700/50 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500/50 resize-none font-sans"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">Resposta Incorreta (Opcional)</label>
                                <textarea
                                  value={newCorrection.original_response}
                                  onChange={e => setNewCorrection(prev => ({ ...prev, original_response: e.target.value }))}
                                  placeholder="Ex: Não sei onde está..."
                                  rows={2}
                                  className="w-full bg-black/40 border border-gray-700/50 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500/50 resize-none font-sans"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">Resposta Esperada / Ajustada (Obrigatório)</label>
                                <textarea
                                  value={newCorrection.corrected_response}
                                  onChange={e => setNewCorrection(prev => ({ ...prev, corrected_response: e.target.value }))}
                                  placeholder="Ex: Claro! Assim que sair para entrega eu te aviso..."
                                  rows={2}
                                  className="w-full bg-black/40 border border-gray-700/50 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500/50 resize-none font-sans"
                                />
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                              <button
                                onClick={() => setIsAddingCorrection(false)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-gray-200"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleSaveCorrection(newCorrection)}
                                disabled={isSavingContent || !newCorrection.user_query.trim() || !newCorrection.corrected_response.trim()}
                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5"
                              >
                                {isSavingContent ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                Salvar Nova Regra
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Listagem das Regras */}
                        <div className="flex flex-col gap-4 max-h-[380px] overflow-y-auto pr-1.5 custom-scrollbar">
                          {corrections.length === 0 ? (
                            <div className="py-12 flex flex-col items-center justify-center opacity-50 bg-black/10 border border-dashed border-gray-700 rounded-3xl">
                              <BrainCircuit size={40} className="mb-3 text-gray-500" />
                              <p className="text-sm">Nenhuma regra cadastrada. Adicione uma regra clicando no botão acima.</p>
                            </div>
                          ) : (
                            corrections.map((corr, index) => {
                              const isEditing = editingCorrection?.id === corr.id;

                              if (isEditing) {
                                return (
                                  <div key={corr.id || index} className="bg-indigo-500/[0.02] border border-indigo-500/20 rounded-3xl p-5 space-y-4 animate-in zoom-in-95 duration-200 text-left">
                                    <div className="flex items-center justify-between border-b border-indigo-500/10 pb-2">
                                      <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <Edit3 size={14} /> Editar Regra #{index + 1}
                                      </span>
                                      <button
                                        onClick={() => setEditingCorrection(null)}
                                        className="text-gray-500 hover:text-gray-300 text-xs"
                                      >
                                        Cancelar
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">Contexto / Memória (Opcional)</label>
                                        <textarea
                                          value={editingCorrection.context_summary || ''}
                                          onChange={e => setEditingCorrection(prev => ({ ...prev, context_summary: e.target.value }))}
                                          rows={2}
                                          className="w-full bg-black/40 border border-gray-700/50 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500/50 resize-none font-sans"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">Pergunta do Cliente (Obrigatório)</label>
                                        <textarea
                                          value={editingCorrection.user_query || ''}
                                          onChange={e => setEditingCorrection(prev => ({ ...prev, user_query: e.target.value }))}
                                          rows={2}
                                          className="w-full bg-black/40 border border-gray-700/50 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500/50 resize-none font-sans"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">Resposta Incorreta (Opcional)</label>
                                        <textarea
                                          value={editingCorrection.original_response || ''}
                                          onChange={e => setEditingCorrection(prev => ({ ...prev, original_response: e.target.value }))}
                                          rows={2}
                                          className="w-full bg-black/40 border border-gray-700/50 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500/50 resize-none font-sans"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">Resposta Esperada / Ajustada (Obrigatório)</label>
                                        <textarea
                                          value={editingCorrection.corrected_response || ''}
                                          onChange={e => setEditingCorrection(prev => ({ ...prev, corrected_response: e.target.value }))}
                                          rows={2}
                                          className="w-full bg-black/40 border border-gray-700/50 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500/50 resize-none font-sans"
                                        />
                                      </div>
                                    </div>

                                    <div className="flex justify-end gap-2 pt-2">
                                      <button
                                        onClick={() => setEditingCorrection(null)}
                                        className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-gray-200"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        onClick={() => handleSaveCorrection(editingCorrection)}
                                        disabled={isSavingContent || !editingCorrection.user_query.trim() || !editingCorrection.corrected_response.trim()}
                                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5"
                                      >
                                        {isSavingContent ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                        Salvar Alterações
                                      </button>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div key={corr.id || index} className="bg-black/35 border border-white/5 rounded-3xl p-5 hover:border-indigo-500/20 transition-all space-y-3 relative overflow-hidden text-left group">
                                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none"></div>
                                  
                                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                    <div className="flex items-center gap-2">
                                      <BrainCircuit className="text-indigo-400" size={18} />
                                      <h4 className="text-sm font-bold text-white tracking-wide">Regra #{index + 1}</h4>
                                    </div>
                                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => setEditingCorrection(corr)}
                                        className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/20 transition-all"
                                        title="Editar Regra"
                                      >
                                        <Edit3 size={13} />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteCorrection(corr.id)}
                                        className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 transition-all"
                                        title="Excluir Regra"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                    {corr.context_summary && (
                                      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 space-y-1">
                                        <span className="font-bold text-gray-400 flex items-center gap-1"><Info size={12} className="text-blue-400" /> Contexto / Memória</span>
                                        <p className="text-gray-300 italic">"{corr.context_summary}"</p>
                                      </div>
                                    )}
                                    {corr.user_query && (
                                      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 space-y-1">
                                        <span className="font-bold text-gray-400 flex items-center gap-1"><Zap size={12} className="text-amber-400" /> Pergunta do Cliente</span>
                                        <p className="text-gray-300">"{corr.user_query}"</p>
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                                    {corr.original_response && (
                                      <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-3 space-y-1">
                                        <span className="font-bold text-red-400/90 flex items-center gap-1"><AlertCircle size={12} /> Resposta Incorreta</span>
                                        <p className="text-gray-400 line-through">"{corr.original_response}"</p>
                                      </div>
                                    )}
                                    {corr.corrected_response && (
                                      <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-3 space-y-1">
                                        <span className="font-bold text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> Resposta Esperada</span>
                                        <p className="text-emerald-300 font-medium">"{corr.corrected_response}"</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        {isEditMode ? (
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-in fade-in duration-300">
                            <div className="md:col-span-8 flex flex-col gap-2 text-left">
                              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Conteúdo do Documento</label>
                              <textarea
                                value={viewContent}
                                onChange={(e) => setViewContent(e.target.value)}
                                rows={12}
                                className="w-full bg-black/40 border border-gray-700/50 rounded-2xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none min-h-[250px] max-h-[350px] overflow-y-auto custom-scrollbar font-mono"
                              />
                            </div>
                            <div className="md:col-span-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4 flex flex-col justify-between text-xs text-gray-300 space-y-3 animate-in slide-in-from-right-5 duration-300 text-left">
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 border-b border-indigo-500/10 pb-2">
                                  <BrainCircuit className="text-indigo-400 animate-pulse" size={16} />
                                  <span className="font-bold text-gray-200">Guia RAG de Raciocínio</span>
                                </div>
                                <p className="text-[11px] text-gray-400 leading-relaxed">
                                  Para que a I.A. absorva corretamente os ajustes de comportamento, siga a estrutura de marcação abaixo:
                                </p>
                                <div className="bg-black/35 rounded-xl p-3 font-mono text-[10px] text-indigo-300 leading-normal space-y-1 overflow-x-auto select-all">
                                  <div>## Correção 1:</div>
                                  <div>### Contexto: Cliente quer ...</div>
                                  <div>### Pergunta: Como faço ...</div>
                                  <div>### Resposta Incorreta: Não sei...</div>
                                  <div>### Resposta Esperada: Claro...</div>
                                  <div>---</div>
                                </div>
                              </div>
                              <div className="text-[10px] text-gray-500 leading-relaxed flex items-start gap-1 pt-2 border-t border-indigo-500/5">
                                <Info size={12} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                                <span>O separador <code className="bg-black/30 px-1 py-0.5 rounded text-indigo-300">---</code> divide cada regra. Novas regras adicionadas aqui serão re-vetorizadas e aplicadas na próxima resposta da I.A.</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <MarkdownOrCorrectionsViewer content={viewContent} />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-8 border-t border-white/5 pt-4">
                <div className="text-xs text-gray-500 font-medium">
                  Última alteração: {viewingFile.metadata?.updated_at ? new Date(viewingFile.metadata.updated_at).toLocaleString() : (viewingFile.updated_at ? new Date(viewingFile.updated_at).toLocaleString() : new Date(viewingFile.created_at).toLocaleString())}
                </div>
                <div className="flex items-center gap-3">
                  {!isLoadingContent && (
                    <>
                      {isCorrectionsDoc ? (
                        <button
                          type="button"
                          onClick={() => setViewingFile(null)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl px-6 py-2.5 font-bold shadow-lg shadow-emerald-600/20 transition-all"
                        >
                          Fechar
                        </button>
                      ) : (
                        <>
                          {isEditMode ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setIsEditMode(false)}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-all"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveEditedContent}
                                disabled={isSavingContent || !viewContent.trim()}
                                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl px-5 py-2.5 font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
                              >
                                {isSavingContent ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {isSavingContent ? 'Re-vetorizando...' : 'Salvar Alterações'}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setIsEditMode(true)}
                                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-gray-200 hover:text-white rounded-xl text-sm font-bold border border-white/5 transition-all flex items-center gap-2"
                              >
                                Editar Dados
                              </button>
                              <button
                                type="button"
                                onClick={() => setViewingFile(null)}
                                className="bg-[#10b981] hover:bg-[#059669] text-white rounded-xl px-6 py-2.5 font-bold shadow-lg shadow-[#10b981]/20 transition-all"
                              >
                                Fechar
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Premium para Colar Texto Livre */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#0b141a]/95 border border-white/10 rounded-4xl p-6 md:p-8 max-w-2xl w-full shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Efeito luminoso de fundo */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-[80px] pointer-events-none"></div>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
                <FileText size={22} />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-gray-100">Colar Conhecimento Manual</h3>
                <p className="text-xs text-gray-400 mt-0.5">Vetorize descrições, tabelas, horários ou cardápios diretamente.</p>
              </div>
            </div>

            <div className="flex flex-col gap-4 mt-6">
              {/* Título do Conhecimento */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nome da Informação</label>
                <input 
                  type="text" 
                  value={pasteTitle}
                  onChange={e => setPasteTitle(e.target.value)}
                  placeholder="Ex: cardapio_burguer_plus.txt" 
                  className="bg-black/40 border border-gray-700/50 rounded-2xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-gray-600 animate-in fade-in duration-300"
                />
              </div>

              {/* Conteúdo */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Conteúdo do Conhecimento</label>
                <textarea 
                  value={pasteContent}
                  onChange={e => setPasteContent(e.target.value)}
                  placeholder="Cole aqui as informações, tabelas, produtos ou qualquer outro conhecimento que os robôs devem dominar..." 
                  rows={10}
                  className="bg-black/40 border border-gray-700/50 rounded-2xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-gray-600 resize-none min-h-[200px] max-h-[300px] overflow-y-auto custom-scrollbar animate-in fade-in duration-300"
                />
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center justify-end gap-3 mt-8">
              <button 
                onClick={() => {
                  setIsPasteModalOpen(false);
                  setPasteTitle('');
                  setPasteContent('');
                }}
                className="px-5 py-3 rounded-2xl text-sm font-bold text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveText}
                disabled={!pasteTitle.trim() || !pasteContent.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl px-6 py-3 font-bold shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/20 transition-all flex items-center gap-2"
              >
                Salvar Informação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
