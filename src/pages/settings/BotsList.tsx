import React, { useState, useEffect } from 'react';
import { Search, ChevronRight, Bot, Sparkles, BrainCircuit, ExternalLink, Activity, Network, Edit3, Trash2, Plus, Database, Waypoints } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BotModal } from '../../components/modals/BotModal';
import { supabase } from '../../services/supabase';

export default function BotsList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [botToEdit, setBotToEdit] = useState<any>(null);

  const [bots, setBots] = useState<any[]>([]);

  useEffect(() => {
    fetchBots();
  }, []);

  const fetchBots = async () => {
    const { data, error } = await supabase
      .from('bots')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (!error && data) {
      setBots(data);
    }
  };

  const filteredBots = bots.filter((bot) => 
    bot.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    bot.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEditClick = (bot: any) => {
    setBotToEdit(bot);
    setIsModalOpen(true);
  };

  const handleAddNewClick = () => {
    setBotToEdit(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Deseja realmente remover este Robô de I.A?")) {
      const { error } = await supabase.from('bots').delete().eq('id', id);
      if (!error) {
        setBots(bots.filter(b => b.id !== id));
      } else {
        alert("Erro ao excluir robô: " + error.message);
      }
    }
  };

  const handleSaveBot = async (botData: any) => {
    if (botToEdit) {
      const { data, error } = await supabase
        .from('bots')
        .update(botData)
        .eq('id', botToEdit.id)
        .select()
        .single();
        
      if (!error && data) {
        setBots(bots.map(b => b.id === botToEdit.id ? data : b));
      }
    } else {
      const { data, error } = await supabase
        .from('bots')
        .insert([botData])
        .select()
        .single();
        
      if (!error && data) {
        setBots([data, ...bots]);
      } else if (error) {
         console.error("Error creating bot:", error);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#0f1013] overflow-hidden">
      {/* Premium Header */}
      <div className="px-8 pt-8 pb-6 bg-gradient-to-b from-[#1a1b1e]/80 to-transparent border-b border-white/5 relative overflow-hidden">
        
        {/* Background Effects */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-[1200px] mx-auto relative z-10">
          <div className="flex items-center gap-3 mb-3">
             <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30">
               <BrainCircuit className="w-6 h-6 text-indigo-400" />
             </div>
             <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/60 tracking-tight">
               Robôs de I.A (RAG)
             </h1>
          </div>
          <p className="text-[#a1a1aa] text-[15px] leading-relaxed max-w-3xl mb-4">
            Gerencie os seus agentes autônomos. Eles são alimentados por modelos avançados (LLMs) e consultam sua 
            própria base de conhecimento (RAG) exclusiva antes de responderem aos seus clientes.
          </p>
          <Link
            to="/settings/prompt-builder"
            className="inline-flex items-center text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors group"
          >
            Aprenda a construir prompts perfeitos
            <ChevronRight className="w-4 h-4 ml-1 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </Link>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6 styled-scrollbar">
        <div className="max-w-[1200px] mx-auto">
          
          {/* Action Bar */}
          <div className="flex items-center justify-between mb-8">
            <div className="relative w-96 group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-white/30 group-focus-within:text-indigo-400 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Pesquisar por nome ou instrução..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[#18181b]/80 backdrop-blur-xl border border-white/10 rounded-2xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all shadow-sm"
              />
            </div>

            <button
              onClick={handleAddNewClick}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold rounded-2xl transition-all duration-300 shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] hover:-translate-y-0.5 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Criar Novo Agente I.A
            </button>
          </div>

          {/* Bots Grid / List */}
          {filteredBots.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in duration-500">
               <div className="w-20 h-20 rounded-3xl bg-indigo-500/5 border border-indigo-500/10 flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(79,70,229,0.1)]">
                 <Bot className="w-10 h-10 text-indigo-400/50" />
               </div>
               <h3 className="text-white/80 text-lg font-medium mb-2">Nenhum robô Encontrado</h3>
               <p className="text-white/40 text-sm max-w-md">Crie seu primeiro agente com Inteligência Artificial e automatize o contato com seus clientes 24/7 de forma humanizada.</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 auto-rows-max animate-in fade-in slide-in-from-bottom-4 duration-500">
              {filteredBots.map((bot) => (
                <div 
                  key={bot.id}
                  className="group relative bg-[#18181b]/60 hover:bg-[#1a1b1e] backdrop-blur-xl border border-white/5 hover:border-indigo-500/30 rounded-[28px] overflow-hidden transition-all duration-300 hover:shadow-[0_10px_40px_-10px_rgba(79,70,229,0.15)] p-6 flex flex-col"
                >
                  {/* Background Blob On Hover */}
                  <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/0 via-purple-500/0 to-indigo-500/0 opacity-0 group-hover:opacity-10 blur-2xl transition-all duration-700 pointer-events-none" />

                  {/* Header do Card */}
                  <div className="flex justify-between items-start mb-5 relative z-10">
                    <div className="flex gap-4 items-center">
                       <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#20202a] to-[#15151a] border border-white/5 flex items-center justify-center shadow-inner group-hover:border-indigo-500/20 transition-colors">
                          <Bot className="w-7 h-7 text-indigo-400 group-hover:scale-110 transition-transform duration-300" />
                       </div>
                       <div>
                         <div className="flex items-center gap-2 mb-1">
                           <h3 className="font-semibold text-lg text-white/90 group-hover:text-white transition-colors">{bot.name}</h3>
                           {bot.status === 'active' ? (
                             <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                               <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Ativo
                             </span>
                           ) : (
                             <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                               <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Inativo
                             </span>
                           )}
                         </div>
                         <div className="flex items-center gap-3 text-xs text-white/40 font-medium">
                           <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-md">
                              <Network className="w-3.5 h-3.5 text-blue-400" />
                              {bot.model}
                           </span>
                           <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-md">
                              <Activity className="w-3.5 h-3.5 text-amber-400" />
                              TMP: {bot.temperature}
                           </span>
                         </div>
                       </div>
                    </div>
                    
                    <div className="flex gap-2 relative z-10">
                      <button 
                         onClick={(e) => { e.stopPropagation(); handleEditClick(bot); }}
                         className="p-2.5 rounded-xl bg-white/5 hover:bg-indigo-500/20 text-white/50 hover:text-indigo-400 transition-colors"
                         title="Editar Robô"
                      >
                         <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                         onClick={(e) => { e.stopPropagation(); handleDelete(bot.id); }}
                         className="p-2.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-400 transition-colors"
                         title="Excluir Robô"
                      >
                         <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Body do Card */}
                  <div className="flex-1 relative z-10">
                    <p className="text-white/60 text-sm leading-relaxed line-clamp-2 min-h-[40px]">
                      {bot.description}
                    </p>
                  </div>

                  {/* Footer - Stats & Knowledge Base info */}
                  <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between relative z-10">
                     <div className="flex gap-5">
                       <div className="flex items-center gap-2 group/rag cursor-pointer" onClick={() => handleEditClick(bot)}>
                          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover/rag:bg-emerald-500 group-hover/rag:text-white transition-colors shadow-inner">
                             <Database className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                             <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Memória</span>
                             <span className="text-xs font-semibold text-white/80 group-hover/rag:text-white transition-colors">
                               {bot.knowledgeDocuments} Docs
                             </span>
                          </div>
                       </div>
                       
                       <div className="flex items-center gap-2 group/chan cursor-pointer" onClick={() => handleEditClick(bot)}>
                          <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 group-hover/chan:bg-rose-500 group-hover/chan:text-white transition-colors shadow-inner">
                             <Waypoints className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                             <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Canais Ativos</span>
                             <span className="text-xs font-semibold text-white/80 group-hover/chan:text-white transition-colors">
                               {bot.channels?.length || 0} Instâncias
                             </span>
                          </div>
                       </div>
                     </div>
                     <button className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 group/btn">
                        Logs
                        <ExternalLink className="w-3.5 h-3.5 opacity-0 -translate-x-2 group-hover/btn:opacity-100 group-hover/btn:translate-x-0 transition-all" />
                     </button>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BotModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveBot}
        botToEdit={botToEdit}
      />
    </div>
  );
}
