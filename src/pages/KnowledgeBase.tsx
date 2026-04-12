import React, { useState, useEffect, useRef } from 'react';
import { BrainCircuit, UploadCloud, FileText, File, Trash2, CheckCircle2, AlertCircle, Loader2, Search, Zap, Info, Server } from 'lucide-react';
import { supabase } from '../services/supabase';

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

interface KnowledgeDoc {
  id: string;
  name: string;
  type: string;
  status: 'processing' | 'ready' | 'error';
  metadata: any;
  created_at: string;
}

export default function KnowledgeBase() {
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [testQuery, setTestQuery] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<any[] | null>(null);

  const tenantId = sessionStorage.getItem('current_tenant_id') || localStorage.getItem('tenantId') || 'be05dcc0-3da2-4290-b826-65058d5a0b5e';

  useEffect(() => {
    fetchDocuments();
    // Poll para o status 'processing'
    const interval = setInterval(() => {
        setDocuments(prev => {
           if(prev.some(d => d.status === 'processing')) {
               fetchDocuments();
           }
           return prev;
        });
    }, 4000);
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
        
        {/* Header Premium */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-400 rounded-2xl shadow-lg ring-4 ring-emerald-500/20">
                <BrainCircuit size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                  Base de Conhecimento RAG
                </h1>
                <p className="text-gray-400 font-medium mt-1">
                  Inteligência Artificial privada e multi-tenant (Isolada na sua empresa).
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
            
            {/* DRAG AND DROP */}
            <div 
              className={`relative flex flex-col items-center justify-center p-12 mt-4 border-2 border-dashed rounded-4xl transition-all duration-300 backdrop-blur-xl cursor-pointer overflow-hidden
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
              Arquivos Ensinados à IA <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full">{documents.length}</span>
           </h2>
           
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.length === 0 && !isUploading && (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center opacity-50 bg-black/10 border border-dashed border-gray-700 rounded-3xl">
                     <FileText size={48} className="mb-4 text-gray-500" />
                     <p className="text-lg">Você ainda não alimentou a Base de Conhecimento.</p>
                  </div>
              )}
              
              {documents.map((doc) => (
                 <div key={doc.id} className="bg-black/30 backdrop-blur-md rounded-3xl p-5 border border-white/5 hover:border-emerald-500/30 transition-all group relative overflow-hidden shadow-xl hover:shadow-2xl">
                    <div className="absolute -right-10 -top-10 bg-white/5 w-32 h-32 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors"></div>
                    
                    <div className="flex justify-between items-start mb-4 relative z-10">
                       <div className={`p-3 rounded-2xl flex items-center justify-center shadow-lg border border-white/10
                           ${doc.type === 'application/pdf' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}
                       `}>
                          <File size={24} />
                       </div>
                       
                       {doc.status === 'processing' && (
                          <span className="flex items-center gap-1.5 bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-xs font-bold animate-pulse border border-orange-500/30">
                            <Loader2 size={12} className="animate-spin" /> Vetorizando
                          </span>
                       )}
                       {doc.status === 'ready' && (
                          <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold border border-emerald-500/20">
                            <CheckCircle2 size={14} /> Pronto
                          </span>
                       )}
                       {doc.status === 'error' && (
                          <span className="flex items-center gap-1 bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-bold border border-red-500/30" title={doc.metadata?.err}>
                            <AlertCircle size={14} /> Falha
                          </span>
                       )}
                    </div>
                    
                    <div className="relative z-10">
                       <h3 className="text-gray-200 font-bold text-lg truncate mb-1" title={doc.name}>{doc.name}</h3>
                       <p className="text-gray-500 text-sm flex items-center gap-2">
                           Adicionado em {new Date(doc.created_at).toLocaleDateString()}
                       </p>
                    </div>

                    <div className="mt-6 flex gap-2 relative z-10">
                       <button onClick={() => deleteDocument(doc.id)} className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 py-2.5 rounded-xl text-sm font-bold transition-all border border-red-500/20 hover:border-red-500/40 flex items-center justify-center gap-2">
                          <Trash2 size={16} /> Excluir Base
                       </button>
                    </div>
                 </div>
              ))}
           </div>
        </div>

      </div>
    </div>
  );
}
