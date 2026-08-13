import React, { useEffect, useState } from 'react';
import { supabase, masterSupabase } from '../../services/supabase';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Settings2, Trash2, Smartphone, Inbox, MessageSquare, Building2, X, Loader2 } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { migrateInstanceHistory } from '../../services/whatsappEngine';

const ENGINE_URL = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';

interface WhatsAppInstance {
  id: string;
  display_name: string;
  status: string;
  created_at: string;
  api_key?: string;
  tenant_id?: string;
}

interface Company {
  id: string;
  name: string;
}

export default function InboxesList() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const tenantIdFromStore = useChatStore(state => state.tenantInfo?.id);
  const tenantId = (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id')) || tenantIdFromStore;
  const navigate = useNavigate();

  const [isCreating, setIsCreating] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');

  // Re-vincular empresa de caixa existente
  const [reassignTarget, setReassignTarget] = useState<WhatsAppInstance | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [isCreatingNewCompany, setIsCreatingNewCompany] = useState<boolean>(false);
  const [newCompanyName, setNewCompanyName] = useState<string>('');
  const [reassigning, setReassigning] = useState<boolean>(false);

  const STANDALONE_TENANT_ID = '00000000-0000-0000-0000-000000000000';

  const fetchCompanies = async () => {
    try {
      const { data, error } = await masterSupabase
        .from('companies')
        .select('id, name, trade_name')
        .order('name', { ascending: true });

      if (!error && data) {
        const formatted = data
          .filter(c => c.id !== STANDALONE_TENANT_ID)
          .map(c => ({
            id: c.id,
            name: c.name || c.trade_name || 'Empresa Sem Nome'
          }));
        setCompanies(formatted);
      }
    } catch (err) {
      console.error('Erro ao buscar empresas:', err);
    }
  };

  const handleReassignCompany = async () => {
    if (!reassignTarget) return;
    setReassigning(true);
    try {
      let targetCompanyId: string = (selectedCompanyId === 'none' || !selectedCompanyId || selectedCompanyId === STANDALONE_TENANT_ID)
        ? STANDALONE_TENANT_ID
        : selectedCompanyId;

      if (isCreatingNewCompany) {
        if (!newCompanyName.trim()) {
          alert('Por favor, informe o nome da nova empresa.');
          setReassigning(false);
          return;
        }
        const { data: newComp, error: compErr } = await supabase
          .from('companies')
          .insert([{ name: newCompanyName.trim() }])
          .select('id, name')
          .single();

        if (compErr || !newComp) {
          throw new Error(`Erro ao criar empresa: ${compErr?.message || 'Falha no servidor'}`);
        }
        targetCompanyId = newComp.id;
        await fetchCompanies();
      }

      const { error } = await supabase
        .from('whatsapp_instances')
        .update({ tenant_id: targetCompanyId })
        .eq('id', reassignTarget.id);

      if (error) throw error;

      alert(
        targetCompanyId !== STANDALONE_TENANT_ID
          ? `Caixa "${reassignTarget.display_name}" vinculada com sucesso!`
          : `Vínculo de empresa removido da caixa "${reassignTarget.display_name}" com sucesso!`
      );
      setReassignTarget(null);
      setIsCreatingNewCompany(false);
      setNewCompanyName('');

      // Remove a caixa da lista atual caso tenha sido movida para outra empresa ou desassociada
      setInstances(prev => prev.filter(i => i.id !== reassignTarget.id));
    } catch (err: any) {
      alert(`Erro ao vincular empresa: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setReassigning(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
    if (!tenantId) return;
    
    const fetchInstances = async () => {
      try {
        const { data, error } = await supabase.from('whatsapp_instances')
          .select('id, display_name, status, created_at, api_key')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });
          
        if (error) throw error;
        if (data) {
          let finalData = data;
          const userEmail = sessionStorage.getItem('current_user_email') || localStorage.getItem('current_user_email') || '';
          const isRonaldo = userEmail.toLowerCase() === 'ronaldo.xpointsolucoes@gmail.com';
          if (!isRonaldo) {
            finalData = data.filter(d => d.id !== '5c78d358-d449-41c4-b396-a04ab20a39e4' && !d.display_name?.toLowerCase().includes('ronaldo'));
            
            const allowedStr = sessionStorage.getItem('allowed_instances') || localStorage.getItem('allowed_instances') || null;
            const currentUserRole = sessionStorage.getItem('current_user_role') || localStorage.getItem('current_user_role') || null;
            if (allowedStr) {
              try {
                const allowed = JSON.parse(allowedStr);
                if (Array.isArray(allowed) && allowed.length > 0) {
                  finalData = finalData.filter(d => allowed.includes(d.id));
                } else if (currentUserRole === 'agent' || currentUserRole === 'Agente') {
                  finalData = [];
                }
              } catch(e) {
                if (currentUserRole === 'agent' || currentUserRole === 'Agente') finalData = [];
              }
            } else if (currentUserRole === 'agent' || currentUserRole === 'Agente') {
              finalData = [];
            }
          }
          setInstances(finalData);
        }
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
      
      // 2. Tentar migrar histórico para outra caixa do mesmo número/tenant se existir
      const otherTarget = instances.find(i => i.id !== inst.id && (i.phone_number === inst.phone_number || i.status === 'connected' || i.status === 'connected_local'));
      if (otherTarget) {
        await migrateInstanceHistory(inst.id, otherTarget.id);
      } else {
        // Se não houver outra caixa, apenas desvincula o instance_id para PRESERVAR todo o histórico no Supabase!
        await supabase.from('messages').update({ instance_id: null }).eq('instance_id', inst.id);
        await supabase.from('conversations').update({ instance_id: null }).eq('instance_id', inst.id);
        await supabase.from('contacts').update({ instance_id: null }).eq('instance_id', inst.id);
      }
      await supabase.from('whatsapp_instance_runtime').delete().eq('instance_id', inst.id);

      // 3. Apagar no Supabase
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
                           <span className="text-sm font-medium text-emerald-500/80 mt-1 flex items-center gap-1"><Smartphone size={14}/> WhatsApp Baileys • {(inst.status === 'connected' || inst.status === 'connected_local') ? 'Conectado' : inst.status === 'connecting' ? 'Gerando QR Code' : 'Offline'}</span>
                        </div>
                     </div>
                     <div className="flex items-center gap-3">
                        <button
                           onClick={(e) => {
                              e.stopPropagation();
                              setReassignTarget(inst);
                              setSelectedCompanyId(inst.tenant_id || tenantId || '');
                              setIsCreatingNewCompany(false);
                              fetchCompanies();
                           }}
                           className="p-3 bg-[#202c33] hover:bg-cyan-500 hover:text-white text-cyan-400 rounded-xl transition-all border border-white/5 hover:border-cyan-500 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] flex items-center gap-1.5 font-semibold text-xs"
                           title="Alterar/Desassociar Empresa da Caixa"
                        >
                           <Building2 size={18} />
                           <span className="hidden sm:inline">Alterar Empresa</span>
                        </button>
                        <button onClick={() => navigate(`/settings/inboxes/${inst.id}`)} className="p-3 bg-[#202c33] hover:bg-emerald-500 hover:text-white text-gray-400 rounded-xl transition-all border border-white/5 hover:border-emerald-500 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]" title="Configurações da Caixa">
                           <Settings2 size={18} />
                        </button>
                        <button 
                           onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteInstance(inst);
                           }}
                           className="p-3 bg-[#202c33] hover:bg-red-500 hover:text-white text-gray-400 rounded-xl transition-all border border-white/5 hover:border-red-500"
                           title="Excluir Caixa"
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

       {/* MODAL ALTERAR / DESASSOCIAR EMPRESA DA CAIXA */}
       {reassignTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-200">
             <div className="bg-[#111b21] border border-white/10 rounded-3xl shadow-2xl p-6 sm:p-8 max-w-md w-full animate-in zoom-in-95 space-y-6 text-left">
               <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
                        <Building2 size={22} />
                     </div>
                     <div>
                        <h3 className="text-lg font-bold text-white">Alterar Empresa da Caixa</h3>
                        <p className="text-xs text-gray-400">{reassignTarget.display_name}</p>
                     </div>
                  </div>
                  <button
                     onClick={() => setReassignTarget(null)}
                     className="text-gray-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition"
                  >
                     <X size={20} />
                  </button>
               </div>

               <div className="space-y-4">
                  <div>
                     <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                        Selecione a Empresa / Tenant Destino *
                     </label>
                     {!isCreatingNewCompany ? (
                        <div className="space-y-2">
                           <select
                              value={selectedCompanyId || 'none'}
                              onChange={(e) => setSelectedCompanyId(e.target.value)}
                              className="w-full bg-[#182229] border border-white/10 rounded-2xl p-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all shadow-inner"
                           >
                              <option value="none">🚫 Nenhuma (Remover Vínculo / Desassociar)</option>
                              {companies.map((c) => (
                                 <option key={c.id} value={c.id}>
                                    🏢 {c.name}
                                 </option>
                              ))}
                           </select>
                           <button
                              type="button"
                              onClick={() => setIsCreatingNewCompany(true)}
                              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 pt-1"
                           >
                              <Plus size={14} /> + Criar nova empresa para esta caixa...
                           </button>
                        </div>
                     ) : (
                        <div className="space-y-2">
                           <input
                              type="text"
                              required
                              value={newCompanyName}
                              onChange={(e) => setNewCompanyName(e.target.value)}
                              placeholder="Nome da Nova Empresa (Ex: Pizzaria Oliveira, HBI...)"
                              className="w-full bg-[#182229] border border-cyan-500/50 rounded-2xl p-3.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all shadow-inner"
                           />
                           <button
                              type="button"
                              onClick={() => setIsCreatingNewCompany(false)}
                              className="text-xs text-gray-400 hover:text-gray-200 underline pt-1"
                           >
                              Voltar para seleção de empresas existentes
                           </button>
                        </div>
                     )}
                  </div>

                  <p className="text-xs text-gray-400 leading-relaxed bg-[#182229] p-3 rounded-xl border border-white/5">
                     💡 Ao desassociar (🚫 Nenhuma) ou selecionar uma nova empresa, a caixa <strong>{reassignTarget.display_name}</strong> deixará de pertencer à empresa atual.
                  </p>

                  <div className="flex gap-3 pt-4 border-t border-white/10">
                     <button
                        type="button"
                        onClick={() => setReassignTarget(null)}
                        className="flex-1 bg-[#202c33] hover:bg-[#2a3942] text-gray-300 font-semibold py-3 rounded-2xl transition-all border border-transparent"
                     >
                        Cancelar
                     </button>
                     <button
                        type="button"
                        onClick={handleReassignCompany}
                        disabled={reassigning}
                        className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-extrabold py-3 rounded-2xl transition-all shadow-[0_5px_15px_-5px_rgba(6,182,212,0.4)] flex items-center justify-center gap-2 disabled:opacity-50"
                     >
                        {reassigning ? <Loader2 size={18} className="animate-spin" /> : <span>Salvar Alterações</span>}
                     </button>
                  </div>
               </div>
             </div>
          </div>
       )}
    </div>
  );
}
