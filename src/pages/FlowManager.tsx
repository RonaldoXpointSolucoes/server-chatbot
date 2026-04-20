import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { Plus, ArrowLeft, Bot, Play, Pause, Trash2, Edit, FolderPlus, MoreHorizontal, MessageSquare, GripVertical, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function FlowManager() {
  const navigate = useNavigate();
  const tenant_id = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (tenant_id) fetchFlows();
  }, [tenant_id]);

  const fetchFlows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('flows')
      .select('*, flow_versions!fk_active_version(id, status)')
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false });

    if (!error && data) setFlows(data);
    setLoading(false);
  };

  const handleCreateFlow = async () => {
    if (!tenant_id) return;
    setIsCreating(true);

    // Creates the root flow
    const { data: newFlow, error } = await supabase
      .from('flows')
      .insert({
        tenant_id: tenant_id,
        name: 'Novo Fluxo Bot',
        trigger_rules: [{ type: 'EXACT', value: 'oi' }]
      })
      .select()
      .single();

    if (newFlow) {
      // Creates initial draft version
      const { data: version } = await supabase
        .from('flow_versions')
        .insert({
          flow_id: newFlow.id,
          status: 'DRAFT',
          nodes: [{
            id: 'start-1',
            type: 'start',
            position: { x: 250, y: 50 },
            data: { label: 'Início do Fluxo' }
          }],
          edges: []
        })
        .select()
        .single();
      
      if (version) {
         navigate(`/flows/${newFlow.id}/edit`);
      }
    }
    
    setIsCreating(false);
  };

  const handleDelete = async (id: string) => {
    if(!window.confirm("Certeza que deseja deletar este fluxo?")) return;
    await supabase.from('flows').delete().eq('id', id);
    setFlows(flows.filter(f => f.id !== id));
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 text-slate-200">
      <header className="p-6 bg-slate-900/50 border-b border-slate-700/50 backdrop-blur-md flex justify-between items-center z-10">
        <div className="flex items-center gap-4">
            <button 
                onClick={() => navigate('/chat')}
                className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
            >
                <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="p-3 bg-indigo-500/10 rounded-xl relative isolate overflow-hidden group">
              <div className="absolute inset-0 bg-indigo-500/20 blur-xl group-hover:bg-indigo-500/30 transition-all duration-500" />
              <Bot className="w-6 h-6 text-indigo-400 relative z-10" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 tracking-tight">
                Flow Builder
              </h1>
              <p className="text-sm text-slate-400">Automatize conversas com um construtor de arrastar e soltar</p>
            </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/flows/settings/preferences')}
            className="p-2 hover:bg-slate-800 border border-transparent hover:border-slate-700/50 rounded-xl transition-all text-slate-400 hover:text-emerald-500 group"
            title="Configurações do Typebot"
          >
            <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
          </button>
          
          <button 
            onClick={handleCreateFlow}
            disabled={isCreating}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-900/20 transition-all font-medium disabled:opacity-50"
          >
            <Plus className="w-5 h-5" />
            {isCreating ? 'Criando...' : 'Criar Novo Fluxo'}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-10 bg-[#18181b] relative isolate animate-in fade-in zoom-in-95 duration-500">
         
         <div className="flex gap-4 mb-8">
            <button className="flex items-center gap-2 bg-[#2a2a2f] hover:bg-[#333338] text-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border border-slate-700/50 shadow-sm">
                <FolderPlus size={16} /> Criar uma pasta
            </button>
         </div>

         <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            
            {/* Create Typebot Card */}
            <button 
                onClick={handleCreateFlow}
                disabled={isCreating}
                className="group flex flex-col h-[220px] bg-blue-600 hover:bg-blue-500 text-white rounded-3xl p-6 transition-all duration-300 shadow-xl shadow-blue-900/20 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center relative overflow-hidden"
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-white/0 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <Plus size={48} className="font-light mb-4 group-hover:scale-110 transition-transform duration-300" strokeWidth={1} />
                <span className="font-semibold tracking-tight text-lg">Criar um typebot</span>
            </button>

            {loading ? (
                <div className="col-span-full py-10 text-slate-500 animate-pulse text-sm">Carregando fluxos...</div>
            ) : flows.map(flow => (
                <div key={flow.id} className="bg-[#1e1e24] hover:bg-[#232328] rounded-3xl border border-[#2a2a2f] p-5 flex flex-col h-[220px] transition-all hover:border-slate-600/50 hover:shadow-2xl hover:shadow-black/40 group relative cursor-pointer" onClick={() => navigate(`/flows/${flow.id}/edit`)}>
                    
                    {/* Top Row - Dots & Badge */}
                    <div className="flex justify-between items-center mb-6">
                        <button onClick={(e) => { e.stopPropagation(); /* TODO: open menu */ }} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-[#2a2a2f] rounded-md transition-colors opacity-0 group-hover:opacity-100">
                           <GripVertical size={16} />
                        </button>
                        
                        {flow.active_version_id && (
                           <div className="bg-blue-500/20 text-blue-400 text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full border border-blue-500/30">
                               Live
                           </div>
                        )}
                        
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(flow.id); }} className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors opacity-0 group-hover:opacity-100">
                           <MoreHorizontal size={16} />
                        </button>
                    </div>

                    {/* Center Icon */}
                    <div className="flex-1 flex flex-col items-center justify-center">
                        <div className="w-12 h-12 rounded-2xl bg-[#2a2a2f] flex items-center justify-center mb-4 text-slate-300 group-hover:scale-110 transition-transform duration-300 shadow-inner border border-slate-700/50">
                           <MessageSquare size={20} />
                        </div>
                        <h3 className="font-bold text-slate-200 text-center tracking-tight truncate w-full px-2">
                           {flow.name}
                        </h3>
                    </div>

                </div>
            ))}
         </div>
      </main>
    </div>
  );
}
