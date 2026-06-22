import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Settings2, Trash2, Smartphone, Inbox, MessageSquare } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

interface WhatsAppInstance {
  id: string;
  display_name: string;
  status: string;
  created_at: string;
  api_key?: string;
}

export default function InboxesList() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const tenantIdFromStore = useChatStore(state => state.tenantInfo?.id);
  const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || tenantIdFromStore;
  const navigate = useNavigate();

  const [isCreating, setIsCreating] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    
    const fetchInstances = async () => {
      try {
        const { data, error } = await supabase.from('whatsapp_instances')
          .select('id, display_name, status, created_at, api_key')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });
          
        if (error) throw error;
        if (data) setInstances(data);
      } catch (err) {
        console.error('Erro ao buscar caixas:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInstances();

    const channelName = `inboxes_list_instances_${tenantId}`;
    const existingChannel = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existingChannel) {
      supabase.removeChannel(existingChannel);
    }

    const channel = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_instances', filter: `tenant_id=eq.${tenantId}` }, () => {
         fetchInstances();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameStr = newInstanceName.trim();
    if (!nameStr) {
       alert("Nome é obrigatório.");
       return;
    }
    
    setLoading(true);
    try {
      const defaultSettings = { reject_calls: false, ignore_groups: false, always_online: true, sync_history: false, read_messages: false };
      
      const currentTenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || tenantId;
      const newInstPayload = {
        display_name: nameStr,
        status: 'offline',
        settings: defaultSettings,
        tenant_id: currentTenantId
      };
      const { data: insertedData, error } = await supabase.from('whatsapp_instances').insert([newInstPayload]).select().single();
      if (!error) {
        const insertedObj = insertedData || newInstPayload;
        await useChatStore.getState().logOperation('INSERT', 'whatsapp_instances', insertedObj.id || 'new-inst', null, insertedObj);
      }
      
      if (error) throw error;
      setIsCreating(false);
      setNewInstanceName('');
    } catch (err) {
      alert('Falha ao criar caixa de entrada!');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInstance = async (inst: WhatsAppInstance) => {
    if (!window.confirm(`Deseja realmente excluir a caixa de entrada "${inst.display_name}"? Esta ação é irreversível e apagará todas as conexões e conversas.`)) {
      return;
    }

    setLoading(true);
    try {
      const currentTenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || tenantId;
      
      // 1. Chamar a API de delete do motor Antigravity
      await fetch(`${ENGINE_URL}/api/v1/instances/${inst.id}`, { 
          method: 'DELETE',
          headers: { 
            'x-tenant-id': currentTenantId!,
            'apikey': inst.api_key || ''
          }
      }).catch((err) => {
         console.warn('Erro ao chamar api de delete da engine:', err);
      });
      
      // 2. Apagar no Supabase
      const { error } = await supabase.from('whatsapp_instances').delete().eq('id', inst.id);
      if (error) throw error;

      // 3. Log de operação
      await useChatStore.getState().logOperation('DELETE', 'whatsapp_instances', inst.id, inst, null);
      
      // 4. Atualizar lista local
      setInstances(prev => prev.filter(item => item.id !== inst.id));
      alert('Caixa de entrada excluída com sucesso!');
    } catch (err) {
      alert('Falha ao excluir a caixa de entrada!');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredInstances = instances.filter(i => i.display_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="w-full h-full bg-[#111b21] flex flex-col items-center py-10 px-6 sm:px-12 animate-in fade-in duration-500 overflow-y-auto">
       <div className="w-full max-w-5xl flex flex-col gap-8">
          
          <div className="flex flex-col gap-3">
             <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
               <Inbox className="text-emerald-500" size={32} /> Caixas de Entrada
             </h1>
             <p className="text-gray-400 text-base max-w-3xl leading-relaxed">
               Um canal é o modo de comunicação que seu cliente escolhe para interagir com você. Uma caixa de entrada é onde você gerencia interações para um canal específico. Adicione um canal de WhatsApp Baileys para centralizar conversas da sua empresa.
             </p>
             <a href="#" className="flex items-center gap-1 text-emerald-500 hover:text-emerald-400 font-semibold text-sm w-max transition-colors mt-1">
               Saiba mais sobre as caixas de entrada <span className="text-lg">›</span>
             </a>
          </div>

          <div className="flex justify-between items-center bg-[#182229]/80 backdrop-blur-xl p-4 sm:px-6 rounded-[2rem] border border-white/5 shadow-xl mt-4">
             <div className="flex items-center bg-[#202c33] px-4 py-2.5 rounded-2xl w-full max-w-xs border border-white/5">
                <Search size={18} className="text-gray-400 mr-2 shrink-0" />
                <input 
                  type="text" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Pesquisar caixas de entrada..."
                  className="bg-transparent border-none text-white text-sm outline-none w-full placeholder-gray-500"
                />
             </div>

             <div className="flex items-center border border-white/5 bg-[#202c33] rounded-[1.5rem] p-1 shadow-inner overflow-hidden shrink-0">
               <div className="px-4 text-sm font-semibold text-gray-500 whitespace-nowrap">
                  {instances.length} caixas de entrada
               </div>
               <div className="w-px h-6 bg-white/10 mx-1"></div>
               <button onClick={() => setIsCreating(true)} className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-2 px-5 rounded-[1.1rem] transition-all flex items-center gap-2 shadow-[0_5px_15px_-5px_rgba(16,185,129,0.5)]">
                 <Plus size={18} /> Adicionar Caixa
               </button>
             </div>
          </div>

          <div className="flex flex-col rounded-[2rem] bg-[#182229]/50 border border-white/5 overflow-hidden backdrop-blur-md shadow-2xl">
             {loading ? (
                <div className="p-12 flex justify-center"><div className="w-8 h-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"/></div>
             ) : filteredInstances.length > 0 ? (
                filteredInstances.map((inst, idx) => (
                  <div key={inst.id} onClick={() => navigate(`/settings/inboxes/${inst.id}`)} className={`flex items-center justify-between p-6 hover:bg-white/10 transition-colors cursor-pointer ${idx !== filteredInstances.length - 1 ? 'border-b border-white/5' : ''}`}>
                     <div className="flex items-center gap-5">
                        <div className="w-14 h-14 bg-[#202c33] dark:bg-[#202c33] border border-emerald-500/30 rounded-2xl flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.15)] group-hover:scale-105 transition-transform duration-300">
                           <MessageSquare size={28} className="text-emerald-500" />
                        </div>
                        <div className="flex flex-col">
                           <span className="text-lg font-bold text-white">{inst.display_name}</span>
                           <span className="text-sm font-medium text-emerald-500/80 mt-1 flex items-center gap-1"><Smartphone size={14}/> WhatsApp Baileys • {inst.status === 'connected' ? 'Conectado' : inst.status === 'connecting' ? 'Gerando QR Code' : 'Offline'}</span>
                        </div>
                     </div>
                     <div className="flex items-center gap-3">
                        <button onClick={() => navigate(`/settings/inboxes/${inst.id}`)} className="p-3 bg-[#202c33] hover:bg-emerald-500 hover:text-white text-gray-400 rounded-xl transition-all border border-white/5 hover:border-emerald-500 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                           <Settings2 size={18} />
                        </button>
                        <button 
                           onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteInstance(inst);
                           }}
                           className="p-3 bg-[#202c33] hover:bg-red-500 hover:text-white text-gray-400 rounded-xl transition-all border border-white/5 hover:border-red-500"
                        >
                           <Trash2 size={18} />
                        </button>
                     </div>
                  </div>
                ))
             ) : (
                <div className="p-16 flex flex-col items-center justify-center text-center">
                   <Inbox size={48} className="text-gray-600 mb-4" />
                   <h3 className="text-xl font-bold text-gray-300 mb-1">Nenhuma caixa encontrada</h3>
                   <p className="text-gray-500">Tente buscar por um nome diferente ou adicione uma nova.</p>
                </div>
             )}
          </div>
       </div>

       {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl animate-in fade-in duration-200">
             <div className="bg-[#111b21] border border-white/10 rounded-3xl shadow-2xl p-8 max-w-sm w-full animate-in zoom-in-95">
               <h2 className="text-2xl font-bold text-white mb-6">Criar Caixa de Entrada</h2>
               <form onSubmit={handleCreateInstance}>
                 <div className="space-y-4">
                    <div>
                     <label className="block text-sm font-medium text-gray-300 mb-2">Nome da Caixa (Ex: Comercial 1)</label>
                     <input 
                        required 
                        autoFocus 
                        value={newInstanceName} 
                        onChange={e => setNewInstanceName(e.target.value)} 
                        type="text" 
                        placeholder="Ex: Suporte Financeiro" 
                        className="w-full bg-[#182229] border border-white/10 rounded-2xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder-gray-500 shadow-inner"
                     />
                   </div>
                   <div className="flex gap-3 mt-6">
                     <button type="button" onClick={() => setIsCreating(false)} className="flex-1 bg-[#202c33] hover:bg-[#2a3942] text-gray-300 font-semibold py-3 rounded-2xl transition-all border border-transparent hover:border-white/5">Cancelar</button>
                     <button type="submit" disabled={loading} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 rounded-2xl transition-all shadow-[0_5px_15px_-5px_rgba(16,185,129,0.4)] disabled:opacity-50 disabled:cursor-not-allowed">
                        {loading ? 'Criando...' : 'Criar Caixa'}
                     </button>
                   </div>
                 </div>
               </form>
             </div>
          </div>
       )}
    </div>
  );
}
