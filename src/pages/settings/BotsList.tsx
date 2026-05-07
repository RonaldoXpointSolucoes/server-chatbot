import React, { useState, useEffect } from 'react';
import { Search, ChevronRight, Bot, Sparkles, BrainCircuit, ExternalLink, Activity, Network, Edit3, Trash2, Plus, Database, Waypoints, Lightbulb } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BotModal } from '../../components/modals/BotModal';
import { supabase } from '../../services/supabase';
import { useChatStore } from '../../store/chatStore';
import { BOT_INDUSTRIES, BOT_TEMPLATES, BotTemplate } from '../../lib/botTemplates';
import { cn } from '../../lib/utils';

export default function BotsList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [botToEdit, setBotToEdit] = useState<any>(null);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);

  const [selectedOnboardingIndustry, setSelectedOnboardingIndustry] = useState<string>(BOT_INDUSTRIES[2]); // Restaurantes & Alimentos by default
  const [selectedOnboardingTemplate, setSelectedOnboardingTemplate] = useState<BotTemplate | null>(null);

  const [bots, setBots] = useState<any[]>([]);

  const tenantIdFromStore = useChatStore(state => state.tenantInfo?.id);
  const tenantId = tenantIdFromStore || (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));

  useEffect(() => {
    fetchBots();
  }, [tenantId]);

  const fetchBots = async () => {
    if (!tenantId) return;
    const { data, error } = await supabase
      .from('bots')
      .select('*')
      .eq('tenant_id', tenantId)
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
    setSelectedOnboardingTemplate(null);
    setIsModalOpen(true);
  };

  const handleAddNewClick = () => {
    setBotToEdit(null);
    setSelectedOnboardingTemplate(null);
    setIsModalOpen(true);
  };

  const handleCreateFromOnboarding = (template: BotTemplate) => {
    setSelectedOnboardingTemplate(template);
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
        .insert([{ ...botData, tenant_id: tenantId }])
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
      {/* Premium Header - Glassmorphism Extremo */}
      <div className="px-8 pt-10 pb-8 bg-gradient-to-b from-[#18181b]/95 to-[#0f1013]/50 backdrop-blur-[40px] border-b border-white/5 relative overflow-hidden z-10 shadow-[0_10px_50px_-20px_rgba(0,0,0,0.8)]">
        
        {/* Background Effects Soft */}
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-0 right-10 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-[1200px] mx-auto relative z-10">
          <div className="flex items-center gap-4 mb-4">
             <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] flex items-center justify-center">
               <BrainCircuit className="w-7 h-7 text-indigo-400 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
             </div>
             <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/60 tracking-tight drop-shadow-sm">
               Agentes I.A. (RAG)
             </h1>
          </div>
          <p className="text-[#a1a1aa] text-base leading-relaxed max-w-3xl mb-5 font-medium">
            Gerencie e orquestre o cérebro autônomo da sua empresa. Alimentados por modelos generativos de ponta e com bases de conhecimento proprietárias. Permita que seus Agentes escalem seu atendimento global 24/7.
          </p>
          <div className="flex items-center gap-6">
            <Link
              to="/settings/prompt-builder"
              className="inline-flex items-center text-sm text-indigo-400 hover:text-indigo-300 font-bold transition-all group hover:tracking-wide"
            >
              Laboratório de Prompts
              <ChevronRight className="w-4 h-4 ml-1 opacity-50 group-hover:opacity-100 group-hover:translate-x-1.5 transition-all" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-8 styled-scrollbar bg-[#0f1013] relative">
        <div className="max-w-[1200px] mx-auto relative z-10">
          
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10">
            <div className="relative w-full sm:w-[450px] group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-white/30 group-focus-within:text-indigo-400 group-focus-within:drop-shadow-[0_0_5px_rgba(99,102,241,0.6)] transition-all" />
              </div>
              <input
                type="text"
                placeholder="Pesquisar robôs, agentes ou instruções..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white/[0.02] backdrop-blur-3xl border border-white/10 rounded-2xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 focus:bg-white/[0.04] transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <button
                onClick={() => setShowTemplateGallery(!showTemplateGallery)}
                className="w-full sm:w-auto px-5 py-3 bg-[#18181b]/80 hover:bg-[#27272a] text-white text-sm font-bold rounded-2xl transition-all border border-white/10 hover:border-white/20 flex items-center justify-center gap-2 shadow-sm backdrop-blur-md"
              >
                <Lightbulb className="w-4 h-4 text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.6)]" />
                {showTemplateGallery ? "Ver Meus Agentes" : "Sugestões de Especialistas"}
              </button>

              <button
                onClick={handleAddNewClick}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-bold rounded-2xl transition-all duration-300 shadow-[0_10px_30px_-10px_rgba(79,70,229,0.8)] hover:shadow-[0_15px_40px_-10px_rgba(79,70,229,1)] hover:-translate-y-1 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Criar do Zero
              </button>
            </div>
          </div>

          {/* Bots Grid / List */}
          {(filteredBots.length === 0 && !searchTerm) || showTemplateGallery ? (
             <div className="flex flex-col animate-in fade-in zoom-in-95 duration-700 w-full mt-4">
                <div className="text-center mb-10">
                   <div className="w-20 h-20 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_80px_rgba(79,70,229,0.2)]">
                     <Bot className="w-10 h-10 text-indigo-400" />
                   </div>
                   <h3 className="text-white/90 text-2xl font-black mb-3 tracking-tight">Crie sua Força de Trabalho Virtual</h3>
                   <p className="text-white/50 text-base max-w-2xl mx-auto font-medium leading-relaxed">
                     Sua operação ainda não possui agentes. Selecione o ramo do seu negócio abaixo para ver as nossas sugestões de robôs especialistas pré-configurados que revolucionarão seu atendimento.
                   </p>
                </div>
                
                {/* Selector de Ramo */}
                <div className="flex bg-[#18181b]/50 p-2 rounded-2xl overflow-x-auto styled-scrollbar-none gap-2 border border-white/5 shadow-inner backdrop-blur-md max-w-4xl mx-auto mb-10">
                   {BOT_INDUSTRIES.map(ind => (
                     <button
                       key={ind}
                       type="button"
                       onClick={() => setSelectedOnboardingIndustry(ind)}
                       className={cn(
                         "px-5 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all",
                         selectedOnboardingIndustry === ind 
                           ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_5px_15px_-5px_rgba(99,102,241,0.5)] border border-indigo-400/50"
                           : "text-white/50 hover:text-white/90 hover:bg-white/5 border border-transparent"
                       )}
                     >
                       {ind}
                     </button>
                   ))}
                </div>

                {/* Templates recomendados para o Ramo */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-max w-full mb-10">
                    {BOT_TEMPLATES.filter(t => t.industry === selectedOnboardingIndustry).map((template, idx) => (
                      <div key={template.id} className="relative p-6 bg-[#18181b]/60 hover:bg-[#1a1b1e]/90 backdrop-blur-2xl border border-white/10 hover:border-indigo-500/40 rounded-3xl transition-all duration-300 group flex flex-col gap-4 overflow-hidden hover:shadow-[0_15px_40px_-10px_rgba(99,102,241,0.2)] hover:-translate-y-1">
                          <div className="absolute top-0 right-0 p-4 opacity-10 font-black text-6xl italic pointer-events-none text-white transition-transform group-hover:scale-110">
                             #{idx + 1}
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md mb-3 inline-block">
                              {template.category}
                            </span>
                            <h4 className="text-xl font-bold text-white/90 group-hover:text-indigo-400 transition-colors">
                               {template.name}
                            </h4>
                            <p className="text-sm font-medium text-white/50 mt-2 leading-relaxed min-h-[60px]">{template.description}</p>
                          </div>
                          
                          <button 
                            type="button"
                            onClick={() => handleCreateFromOnboarding(template)}
                            className="mt-auto relative z-10 w-full py-3.5 bg-white/5 hover:bg-indigo-500 text-white text-sm font-bold rounded-2xl transition-all border border-white/10 hover:border-transparent shadow-sm flex items-center justify-center gap-2 group-hover:shadow-[0_10px_20px_-10px_rgba(99,102,241,0.5)]"
                          >
                            <Sparkles className="w-4 h-4 text-indigo-400 group-hover:text-white transition-colors" />
                            Criar Este Robô
                          </button>
                      </div>
                    ))}
                </div>
             </div>
          ) : filteredBots.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in zoom-in-95 duration-700">
               <div className="w-24 h-24 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6 shadow-[0_0_80px_rgba(79,70,229,0.2)]">
                 <Search className="w-12 h-12 text-indigo-400" />
               </div>
               <h3 className="text-white/90 text-xl font-bold mb-3 tracking-tight">Nenhum agente encontrado</h3>
               <p className="text-white/50 text-sm max-w-md font-medium leading-relaxed">
                 Sua pesquisa não retornou nenhum robô com este nome.
               </p>
             </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-max animate-in fade-in slide-in-from-bottom-8 duration-700">
              {filteredBots.map((bot) => (
                <div 
                  key={bot.id}
                  className="group relative bg-[#18181b]/40 hover:bg-[#1a1b1e]/80 backdrop-blur-2xl border border-white/[0.05] hover:border-indigo-500/40 rounded-3xl overflow-hidden transition-all duration-500 hover:shadow-[0_20px_50px_-20px_rgba(79,70,229,0.3)] hover:-translate-y-1 p-6 flex flex-col"
                >
                  {/* Background Blob On Hover */}
                  <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/0 via-purple-500/0 to-indigo-500/0 opacity-0 group-hover:opacity-20 blur-3xl transition-all duration-700 pointer-events-none" />

                  {/* Header do Card */}
                  <div className="flex justify-between items-start mb-6 relative z-10">
                    <div className="flex gap-4 items-center">
                       <div className="w-16 h-16 rounded-[1.25rem] bg-gradient-to-br from-[#20202a] to-[#15151a] border border-white/5 flex items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] group-hover:border-indigo-500/30 group-hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-all">
                          <Bot className="w-8 h-8 text-indigo-400 group-hover:text-indigo-300 group-hover:scale-110 transition-transform duration-500" />
                       </div>
                       <div>
                         <div className="flex items-center gap-2 mb-1.5">
                           <h3 className="font-bold text-lg text-white/90 group-hover:text-white transition-colors">{bot.name}</h3>
                         </div>
                         <div className="flex flex-wrap items-center gap-2 text-xs text-white/50 font-medium">
                           {bot.status === 'active' ? (
                             <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-widest shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                               <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Ativo
                             </span>
                           ) : (
                             <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                               <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Inativo
                             </span>
                           )}
                           <span className="flex items-center gap-1.5 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                              <Network className="w-3.5 h-3.5 text-blue-400" />
                              {bot.model}
                           </span>
                         </div>
                       </div>
                    </div>
                  </div>

                  {/* Body do Card */}
                  <div className="flex-1 relative z-10 mb-6">
                    <p className="text-white/50 text-sm leading-relaxed line-clamp-3 min-h-[60px] font-medium">
                      {bot.description || 'Nenhuma descrição fornecida para este agente.'}
                    </p>
                  </div>

                  {/* Footer - Stats & Knowledge Base info */}
                  <div className="mt-auto pt-5 border-t border-white/[0.05] flex items-center justify-between relative z-10">
                     <div className="flex gap-4">
                       <div className="flex items-center gap-2 group/rag cursor-pointer" onClick={() => handleEditClick(bot)}>
                          <div className="p-2 rounded-xl bg-emerald-500/5 text-emerald-400 group-hover/rag:bg-emerald-500 group-hover/rag:text-white transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] border border-emerald-500/10 group-hover/rag:border-transparent group-hover/rag:shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                             <Database className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                             <span className="text-[9px] font-extrabold text-white/30 uppercase tracking-widest">Base RAG</span>
                             <span className="text-xs font-bold text-white/70 group-hover/rag:text-white transition-colors">
                               {bot.knowledgeDocuments || 0} Docs
                             </span>
                          </div>
                       </div>
                       
                       <div className="flex items-center gap-2 group/chan cursor-pointer" onClick={() => handleEditClick(bot)}>
                          <div className="p-2 rounded-xl bg-rose-500/5 text-rose-400 group-hover/chan:bg-rose-500 group-hover/chan:text-white transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] border border-rose-500/10 group-hover/chan:border-transparent group-hover/chan:shadow-[0_0_15px_rgba(244,63,94,0.3)]">
                             <Waypoints className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                             <span className="text-[9px] font-extrabold text-white/30 uppercase tracking-widest">Canais</span>
                             <span className="text-xs font-bold text-white/70 group-hover/chan:text-white transition-colors">
                               {bot.channels?.length || 0}
                             </span>
                          </div>
                       </div>
                     </div>
                     <div className="flex gap-1.5 relative z-10">
                       <button 
                          onClick={(e) => { e.stopPropagation(); handleEditClick(bot); }}
                          className="p-2.5 rounded-xl bg-white/5 hover:bg-indigo-500/20 hover:border-indigo-500/30 border border-transparent text-white/40 hover:text-indigo-400 transition-all shadow-sm"
                          title="Configurar Robô"
                       >
                          <Edit3 className="w-4 h-4" />
                       </button>
                       <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(bot.id); }}
                          className="p-2.5 rounded-xl bg-white/5 hover:bg-rose-500/20 hover:border-rose-500/30 border border-transparent text-white/40 hover:text-rose-400 transition-all shadow-sm"
                          title="Exterminar Robô"
                       >
                          <Trash2 className="w-4 h-4" />
                       </button>
                     </div>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BotModal 
        isOpen={isModalOpen}
        onClose={() => {
           setIsModalOpen(false);
           setSelectedOnboardingTemplate(null);
        }}
        onSave={handleSaveBot}
        botToEdit={botToEdit}
        availableBots={bots.filter(b => b.id !== botToEdit?.id)}
        initialTemplate={selectedOnboardingTemplate}
      />
    </div>
  );
}

