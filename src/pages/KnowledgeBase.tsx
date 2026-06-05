import React, { useState, useEffect, useRef } from 'react';
import { BrainCircuit, UploadCloud, FileText, File, Trash2, CheckCircle2, AlertCircle, Loader2, Search, Zap, Info, Server, ArrowLeft, Eye, Save } from 'lucide-react';
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

  const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || localStorage.getItem('tenantId') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';

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
    try {
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
    } catch (err) {
      alert('Erro de conexão ao carregar o conteúdo.');
    } finally {
      setIsLoadingContent(false);
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
             <span className="text-sm font-bold text-gray-200">pgvector engine active</span>
          </div>
        </div>

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

        {/* Lista de Documentos */}
        <div className="mt-4">
           <h2 className="text-xl font-bold text-gray-200 mb-6 flex items-center gap-2">
              Arquivos Globais da Empresa <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full">{documents.length}</span>
           </h2>
           
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.length === 0 && !isUploading && (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center opacity-50 bg-black/10 border border-dashed border-gray-700 rounded-3xl">
                     <FileText size={48} className="mb-4 text-gray-500" />
                     <p className="text-lg">Você ainda não alimentou a Base de Conhecimento.</p>
                  </div>
              )}
              
              {documents.map((doc) => {
                  const sizeFormatted = doc.metadata?.size 
                    ? (doc.metadata.size / 1024).toFixed(1) + ' KB' 
                    : 'TXT Manual';

                  // Cálculo do progresso
                  const chunksTotal = doc.metadata?.chunks_total || 0;
                  const chunksProcessed = doc.metadata?.chunks_processed || 0;
                  const percent = chunksTotal > 0 ? Math.round((chunksProcessed / chunksTotal) * 100) : 0;
                  const statusMsg = doc.metadata?.current_status || 'Vetorizando...';

                  return (
                    <div key={doc.id} className="bg-black/30 backdrop-blur-md rounded-3xl p-5 border border-white/5 hover:border-emerald-500/30 transition-all group relative overflow-hidden shadow-xl hover:shadow-2xl flex flex-col gap-4">
                       <div className="absolute -right-10 -top-10 bg-white/5 w-32 h-32 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors pointer-events-none"></div>
                       
                       <div className="flex justify-between items-start relative z-10">
                          <div className={`p-3 rounded-2xl flex items-center justify-center shadow-lg border border-white/10
                              ${doc.type === 'application/pdf' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}
                          `}>
                             <File size={24} />
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
                          <p className="text-gray-500 text-sm flex items-center gap-2">
                              {sizeFormatted} • Adicionado em {new Date(doc.created_at).toLocaleDateString()}
                          </p>
                       </div>

                       {/* Barra de Progresso Real */}
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
         </div>
 
       </div>

        {/* Modal Premium para Acessar e Editar Dados de Conhecimento */}
        {viewingFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300 text-left">
            <div className="bg-[#0b141a]/95 border border-white/10 rounded-[2rem] p-6 md:p-8 max-w-3xl w-full shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
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
                    {isEditMode ? (
                      <div className="flex flex-col gap-2 animate-in fade-in duration-300">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Conteúdo do Documento</label>
                        <textarea
                          value={viewContent}
                          onChange={(e) => setViewContent(e.target.value)}
                          rows={12}
                          className="w-full bg-black/40 border border-gray-700/50 rounded-2xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none min-h-[250px] max-h-[350px] overflow-y-auto custom-scrollbar"
                        />
                      </div>
                    ) : (
                      <div className="bg-black/30 border border-white/5 rounded-2xl p-5 overflow-y-auto max-h-[350px] custom-scrollbar text-sm text-gray-300 leading-relaxed font-mono whitespace-pre-wrap select-text selection:bg-indigo-500/30">
                        {viewContent || <span className="text-gray-500 italic">Este arquivo não possui conteúdo de texto extraído.</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-8 border-t border-white/5 pt-4">
                <div className="text-xs text-gray-500 font-medium">
                  Última alteração: {viewingFile.updated_at ? new Date(viewingFile.updated_at).toLocaleString() : new Date(viewingFile.created_at).toLocaleString()}
                </div>
                <div className="flex items-center gap-3">
                  {!isLoadingContent && (
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
                </div>
              </div>
            </div>
          </div>
        )}

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
