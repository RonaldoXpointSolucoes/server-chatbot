import { useEffect, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { Smartphone, CheckCircle, Loader2, AlertCircle, Signal, Link, PlusCircle, LogOut, RefreshCcw, UserCircle2, Trash2 } from 'lucide-react';
import { createInstance, fetchEngineStatus, logoutEngine, reconnectEngine, clearEngineStore, syncEngineContacts, forceEnginePresence } from '../services/whatsappEngine';
import { supabase } from '../services/supabase';

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default function EvolutionModal({ onClose }: { onClose: () => void }) {
  const { evolutionConnected, setEvolutionConnection, modalReason } = useChatStore();
  const [loading, setLoading] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engineUser, setEngineUser] = useState<any>(null);
  
  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [existingInstances, setExistingInstances] = useState<any[]>([]);
  
  const [customName, setCustomName] = useState<string>('');
  const [customApiKey, setCustomApiKey] = useState<string>('');
  const [activePollingId, setActivePollingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchExistingInstances();
  }, []);

  const fetchExistingInstances = async () => {
    try {
      const tenantId = sessionStorage.getItem('current_tenant_id');
      if (!tenantId) return;
      const { data } = await supabase.from('whatsapp_instances')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });
      if (data) {
        setExistingInstances(data);
        if (data.length === 0) setTab('new');
      }
    } catch (e) {}
  };

  const handleConnectExisting = async (inst: any) => {
    setLoading(true);
    setError(null);
    setQrBase64(null);
    try {
      if (inst.connection_status === 'connected' || inst.status === 'connected') {
          useChatStore.getState().updateTenantInstance(inst.id);
          setEvolutionConnection(true, inst.id);
          useChatStore.getState().syncEvolutionContacts(inst.id);
          setLoading(false);
          setTimeout(onClose, 1000);
          return;
      }
      
      const cId = sessionStorage.getItem('current_tenant_id');
      if (!cId) throw new Error("Tenant não identificado");

      setActivePollingId(inst.id);
      await createInstance(cId, inst.id, inst.api_key || '');
    } catch(err: any) {
      setError(err.message || "Erro ao conectar motor.");
      setLoading(false);
    }
  };

  const handleDeleteInstance = async (id: string) => {
    const cId = sessionStorage.getItem('current_tenant_id');
    if (!cId) return;
    setLoading(true);
    setError(null);
    try {
      // Tenta deslogar da memória para limpeza, mas ignora se falhar
      const inst = existingInstances.find(i => i.id === id);
      const key = inst?.api_key || '';
      await logoutEngine(cId, id, key).catch(() => {});
      
      const { error: dbErr } = await supabase.from('whatsapp_instances').delete().eq('id', id);
      if (dbErr) throw dbErr;
      
      setConfirmDeleteId(null);
      await fetchExistingInstances();
      // Se a instância apagada estiver conectada agora, damos logout local
      if (useChatStore.getState().connectedInstanceName === id) {
          setEvolutionConnection(false, null);
      }
    } catch (err: any) {
      setError("Erro ao excluir: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNew = async () => {
    setLoading(true);
    setError(null);
    setQrBase64(null);

    const nameStr = customName.trim();

    if (!nameStr) {
      setError('O Nome da Instância é OBRIGATÓRIO (Ex: WhatsApp Vendas).');
      setLoading(false);
      return;
    }

    let finalApiKey = customApiKey.trim();
    if (!finalApiKey) {
        finalApiKey = 'sk_' + Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    try {
        const newEngineId = uuidv4();
        const cId = sessionStorage.getItem('current_tenant_id');
        if (!cId) throw new Error("Tenant não identificado");
        
        const { error: dbErr } = await supabase.from('whatsapp_instances').insert({
          id: newEngineId,
          display_name: nameStr,
          status: 'offline',
          tenant_id: cId,
          api_key: finalApiKey
        });

        if (dbErr) throw new Error('Falha ao registrar instância. ' + dbErr.message);

        useChatStore.getState().updateTenantInstance(newEngineId);
        
        setActivePollingId(newEngineId);
        await createInstance(cId, newEngineId, finalApiKey);
        
        setCustomName('');
        setCustomApiKey('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro de comunicação com o sistema.');
      setLoading(false);
    }
  };

  // SUBSCRIPTION DO REALTIME DE CONEXÃO
  useEffect(() => {
    if (!activePollingId) return;
    
    const tenantId = sessionStorage.getItem('current_tenant_id');
    const channelName = `tenant:${tenantId}:instance:${activePollingId}`;
    
    console.log(`[Realtime] Inscrito no canal: ${channelName}`);
    const channel = supabase.channel(channelName);

    // Timeout de segurança contra loop infinito
    const timeoutId = setTimeout(() => {
        if (loading) {
           setError("Erro: Timeout de Conexão. O Motor não respondeu em 20 segundos. Verifique as chaves ou se a engine está online.");
           setLoading(false);
           setQrBase64(null);
           setActivePollingId(null);
        }
    }, 20000); // 20s timeout

    channel
      .on('broadcast', { event: 'instance.qr_updated' }, (payload: any) => {
          if (payload.payload?.qr_code) {
             setQrBase64(payload.payload.qr_code);
             setLoading(false);
          }
      })
      .on('broadcast', { event: 'instance.status' }, (payload: any) => {
          const st = payload.payload?.status;
          if (st === 'offline') {
             setError(payload.payload?.reason ? `Falha com código: ${payload.payload.reason}` : 'A conexão caiu ou foi rejeitada.');
             setLoading(false);
             setQrBase64(null);
             setActivePollingId(null);
          } else if (st === 'connected') {
             setLoading(false);
             setQrBase64(null);
             setActivePollingId(null);
             setEvolutionConnection(true, activePollingId);
             useChatStore.getState().syncEvolutionContacts(activePollingId);
             setTimeout(onClose, 1000);
          }
      })
      .subscribe((status) => {
          console.log(`[Realtime] Status inscrição modal:`, status);
      });

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [activePollingId, loading]);

  useEffect(() => {
    // If modal opens and we are marked as connected, let's load user from v2 status
    if (evolutionConnected && useChatStore.getState().connectedInstanceName) {
       const cId = sessionStorage.getItem('current_tenant_id');
       const currInst = existingInstances.find(i => i.id === useChatStore.getState().connectedInstanceName);
       if(cId && currInst && currInst.api_key) {
          fetchEngineStatus(cId, useChatStore.getState().connectedInstanceName!, currInst.api_key)
            .then(st => {
                if (st?.data?.status === 'connected' && st?.data?.whatsapp_instance_runtime?.user_profile) {
                    setEngineUser(st.data.whatsapp_instance_runtime.user_profile);
                } else if(st?.data?.status !== 'connected') {
                    setEvolutionConnection(false, null);
                }
            })
            .catch(() => {});
       }
    }
  }, [evolutionConnected]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-white/70 dark:bg-[#111b21]/70 backdrop-blur-2xl rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col items-center p-8 border border-white/50 dark:border-white/10 relative transition-all">
        <button onClick={onClose} className="absolute top-5 right-5 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors bg-white/50 dark:bg-black/20 rounded-full w-8 h-8 flex items-center justify-center">X</button>
        
        <h2 className="text-2xl font-black tracking-tight text-gray-800 dark:text-white mb-1 flex items-center gap-2">
          <Smartphone className="text-emerald-500"/> App Connect
        </h2>

        {modalReason ? (
           <p className="text-sm font-medium text-center text-orange-600 bg-orange-500/10 p-3 rounded-2xl my-3 border border-orange-500/20">
             {modalReason}
           </p>
        ) : (
           <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-6 mt-1 font-medium bg-black/5 dark:bg-white/5 py-1 px-3 rounded-full">
             Motor Inteligente
           </p>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl text-xs mb-4 flex items-start w-full gap-2 transition-all">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {evolutionConnected ? (
          <div className="flex flex-col w-full animate-in zoom-in slide-in-from-bottom-4 duration-500 delay-150">
            <div className="flex flex-col items-center bg-emerald-500/10 p-6 rounded-3xl border border-emerald-500/20 mb-2 relative overflow-hidden backdrop-blur-md">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
              
              {engineUser ? (
                 <div className="w-20 h-20 rounded-full bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.3)] border-2 border-emerald-500/50 flex items-center justify-center mb-4 overflow-hidden">
                    <UserCircle2 size={40} className="text-emerald-500 drop-shadow-md" />
                 </div>
              ) : (
                 <div className="w-20 h-20 rounded-full bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.3)] border-2 border-emerald-500/50 flex items-center justify-center mb-4">
                    <CheckCircle size={40} className="text-emerald-500 drop-shadow-md" />
                 </div>
              )}
              
              <h3 className="font-bold text-lg text-emerald-700 dark:text-emerald-400">
                {engineUser?.name || 'Motor Ativado'}
              </h3>
              
              {engineUser?.id && (
                 <p className="text-[10px] bg-white/50 dark:bg-black/40 px-2 py-0.5 rounded text-gray-500 mt-1 font-mono">
                    +{engineUser.id.split(':')[0]}
                 </p>
              )}

              <div className="flex justify-center items-center gap-2 mt-4 text-xs font-medium text-gray-600 dark:text-gray-300">
                  <span className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                    <Signal size={14} className="animate-pulse" /> NATIVO BAILLEYS CORE
                  </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 w-full mt-6">
                 <button 
                   onClick={async () => {
                      const cId = sessionStorage.getItem('current_tenant_id');
                      if (!confirm("Tem certeza que deseja deslogar seu aparelho da engine?")) return;
                      if (!cId) return;
                      setLoading(true);
                      const currInst = existingInstances.find(i => i.id === useChatStore.getState().connectedInstanceName);
                      await logoutEngine(cId, useChatStore.getState().connectedInstanceName!, currInst?.api_key || '');
                      setEvolutionConnection(false, null);
                      setLoading(false);
                      setQrBase64(null);
                      setEngineUser(null);
                   }}
                   className="flex col-span-1 flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white/50 dark:bg-black/30 hover:bg-red-500/10 hover:text-red-500 border border-transparent hover:border-red-500/30 transition-all text-xs font-semibold text-gray-600 dark:text-gray-400 group"
                 >
                    <LogOut size={18} className="group-hover:text-red-500 text-gray-400 transition-colors" />
                    Deslogar Aparelho
                 </button>
                 
                 <button 
                   onClick={async () => {
                      const cId = sessionStorage.getItem('current_tenant_id');
                      if (!cId) return;
                      setLoading(true);
                      const currInst = existingInstances.find(i => i.id === useChatStore.getState().connectedInstanceName);
                      await reconnectEngine(cId, useChatStore.getState().connectedInstanceName!, currInst?.api_key || '');
                      setTimeout(() => {
                         setLoading(false);
                         alert("Protocolo WS reiniciado pela Engine.");
                      }, 2000);
                   }}
                   className="flex col-span-1 flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white/50 dark:bg-black/30 hover:bg-emerald-500/10 hover:text-emerald-500 border border-transparent hover:border-emerald-500/30 transition-all text-xs font-semibold text-gray-600 dark:text-gray-400 group"
                 >
                    <RefreshCcw size={18} className="group-hover:text-emerald-500 text-gray-400 animate-in spin-in transition-colors" />
                    Warm Boot (Restart)
                 </button>

                 <button 
                   onClick={async () => {
                      const cId = sessionStorage.getItem('current_tenant_id');
                      if (!cId) return;
                      setLoading(true);
                      const currInst = existingInstances.find(i => i.id === useChatStore.getState().connectedInstanceName);
                      const r = await syncEngineContacts(cId, useChatStore.getState().connectedInstanceName!, currInst?.api_key || '');
                      setLoading(false);
                      alert(r.message || "OK");
                   }}
                   className="flex col-span-1 flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white/50 dark:bg-black/30 hover:bg-emerald-500/10 hover:text-emerald-500 border border-transparent hover:border-emerald-500/30 transition-all text-xs font-semibold text-gray-600 dark:text-gray-400 group"
                 >
                    <UserCircle2 size={18} className="group-hover:text-emerald-500 text-gray-400 transition-colors" />
                    Sincronizar Contatos
                 </button>

                 <button 
                   onClick={async () => {
                      const cId = sessionStorage.getItem('current_tenant_id');
                      if (!cId) return;
                      setLoading(true);
                      const currInst = existingInstances.find(i => i.id === useChatStore.getState().connectedInstanceName);
                      const r = await forceEnginePresence(cId, useChatStore.getState().connectedInstanceName!, currInst?.api_key || '');
                      setLoading(false);
                      alert(r.message || "OK");
                   }}
                   className="flex col-span-1 flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white/50 dark:bg-black/30 hover:bg-emerald-500/10 hover:text-emerald-500 border border-transparent hover:border-emerald-500/30 transition-all text-xs font-semibold text-gray-600 dark:text-gray-400 group"
                 >
                    <Signal size={18} className="group-hover:text-emerald-500 text-gray-400 transition-colors" />
                    Forçar Online
                 </button>
                 
                 <button 
                   onClick={async () => {
                      const cId = sessionStorage.getItem('current_tenant_id');
                      if (!confirm("Isso apagará o cache de mensagens em RAM. Deseja prosseguir?")) return;
                      if (!cId) return;
                      setLoading(true);
                      const currInst = existingInstances.find(i => i.id === useChatStore.getState().connectedInstanceName);
                      const r = await clearEngineStore(cId, useChatStore.getState().connectedInstanceName!, currInst?.api_key || '');
                      setLoading(false);
                      alert(r.message || "OK");
                   }}
                   className="flex col-span-2 flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-white/50 dark:bg-black/30 hover:bg-orange-500/10 hover:text-orange-500 border border-transparent hover:border-orange-500/30 transition-all text-xs font-semibold text-gray-600 dark:text-gray-400 group"
                 >
                    <AlertCircle size={18} className="group-hover:text-orange-500 text-gray-400 transition-colors" />
                    Limpar RAM (Memory Leak Prevention)
                 </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center justify-center min-h-[260px] bg-white/30 dark:bg-black/30 p-2 sm:p-5 rounded-3xl border border-white/20 dark:border-white/5 shadow-inner">
            {loading ? (
              <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500 py-10">
                 <Loader2 className="animate-spin text-emerald-500" size={48} />
                 <span className="text-sm text-gray-600 dark:text-gray-400 font-medium tracking-wide">Comunicando...</span>
              </div>
            ) : qrBase64 ? (
              <div className="animate-in fade-in zoom-in-95 duration-500 flex flex-col items-center w-full pb-4">
                 <div className="p-3 bg-white/90 backdrop-blur-md rounded-3xl shadow-xl border border-white/50">
                    <img src={qrBase64} alt="QR Code" className="w-[200px] h-[200px] rounded-2xl" />
                 </div>
                 <p className="text-center text-xs mt-6 mb-2 text-gray-500 dark:text-gray-400 font-medium">
                   Escaneie o QR Code no seu WhatsApp.
                 </p>
                 <button 
                   onClick={() => { setQrBase64(null); setLoading(false); setActivePollingId(null); }}
                   className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 uppercase mt-2 bg-emerald-500/10 px-4 py-2 rounded-full hover:bg-emerald-500/20 transition-colors"
                 >
                   Cancelar
                 </button>
              </div>
            ) : (
              <div className="flex flex-col w-full animate-in fade-in zoom-in-95 duration-300 items-center">
                
                {/* Tabs */}
                <div className="flex w-full bg-black/10 dark:bg-white/5 rounded-2xl p-1 mb-6">
                   <button 
                     onClick={() => setTab('existing')}
                     className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${tab === 'existing' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                   >
                     Associar Existente
                   </button>
                   <button 
                     onClick={() => setTab('new')}
                     className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${tab === 'new' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                   >
                     Criar Nova
                   </button>
                </div>

                {tab === 'existing' ? (
                  <div className="w-full flex flex-col gap-3 min-h-[160px] max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                     {existingInstances.length > 0 ? existingInstances.map(inst => (
                        <div key={inst.id} className="relative z-10">
                           {confirmDeleteId === inst.id ? (
                              <div className="flex flex-col w-full p-4 rounded-3xl bg-red-500/10 border border-red-500/30 animate-in zoom-in-95 duration-200">
                                 <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-3 text-center">Excluir instância permanentemente?</p>
                                 <div className="flex gap-2 w-full">
                                    <button 
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="flex-1 py-2 rounded-xl text-xs font-bold text-gray-600 bg-white/50 hover:bg-white dark:bg-black/30 dark:hover:bg-black/50 transition-all border border-transparent"
                                    >
                                      Cancelar
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteInstance(inst.id)}
                                      className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-red-500 hover:bg-red-600 shadow-md shadow-red-500/20 transition-all"
                                    >
                                      Sim, Excluir
                                    </button>
                                 </div>
                              </div>
                           ) : (
                              <div className="flex items-center justify-between w-full h-[72px] rounded-3xl bg-white/40 dark:bg-[#1A252C]/60 backdrop-blur-md border border-white/50 dark:border-white/5 shadow-sm hover:shadow-md transition-all group overflow-hidden pl-5 pr-2">
                                 <button 
                                    onClick={() => handleConnectExisting(inst)}
                                    className="flex-1 flex flex-col items-start justify-center h-full focus:outline-none"
                                 >
                                    <div className="flex items-center gap-2">
                                       <h4 className="font-bold text-[13px] text-gray-800 dark:text-white drop-shadow-sm line-clamp-1">{inst.display_name || 'Instância sem nome'}</h4>
                                       {(inst.connection_status === 'connected' || inst.status === 'connected') && (
                                         <span className="flex items-center justify-center w-4 h-4 bg-emerald-500/20 rounded-full">
                                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                                         </span>
                                       )}
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-mono flex items-center gap-1 mt-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                       {inst.phone_number ? `+${inst.phone_number}` : 'Aguardando Sincronização'}
                                    </p>
                                 </button>
                                 
                                 <div className="flex items-center gap-1 opacity-80">
                                    <button 
                                       onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(inst.id); }}
                                       className="w-10 h-10 flex items-center justify-center rounded-2xl text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-all focus:outline-none"
                                       title="Excluir Instância"
                                    >
                                       <Trash2 size={16} />
                                    </button>
                                    <button 
                                       onClick={() => handleConnectExisting(inst)}
                                       className="w-10 h-10 flex items-center justify-center rounded-2xl text-gray-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all focus:outline-none bg-white/20 dark:bg-black/10"
                                       title="Conectar"
                                    >
                                       <Link size={16} />
                                    </button>
                                 </div>
                              </div>
                           )}
                        </div>
                     )) : (
                        <div className="m-auto flex flex-col items-center justify-center text-gray-400 text-xs py-10 px-4 border-2 border-dashed border-gray-300 dark:border-gray-700/50 rounded-3xl w-full bg-white/20 dark:bg-black/10 backdrop-blur-sm">
                           <Smartphone size={32} className="mb-2 opacity-50 text-emerald-500" />
                           <span className="font-medium text-gray-500">Nenhuma Instância encontrada.</span>
                           <button onClick={() => setTab('new')} className="mt-3 text-emerald-600 hover:underline font-bold">Criar sua primeira instância</button>
                        </div>
                     )}
                  </div>
                ) : (
                  <div className="w-full flex flex-col">
                    <div className="w-full mb-4">
                       <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-tight">Nome da Instância</label>
                       <input 
                         autoFocus
                         type="text" 
                         value={customName}
                         onChange={e => setCustomName(e.target.value)}
                         placeholder="Ex: WhatsApp Operacional"
                         className="w-full bg-white dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-2xl p-3 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-emerald-500 transition-all"
                       />
                    </div>
                    <div className="w-full mb-4">
                       <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-tight">ApiKey da Instância</label>
                       <input 
                         type="text" 
                         value={customApiKey}
                         onChange={e => setCustomApiKey(e.target.value)}
                         placeholder="Deixe em branco para auto-gerar"
                         className="w-full bg-white dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-2xl p-3 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-emerald-500 transition-all font-mono"
                       />
                    </div>
                    <button 
                      onClick={handleGenerateNew}
                      className="bg-emerald-500 hover:bg-emerald-400 w-full text-white px-6 py-4 rounded-2xl text-sm font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 mt-4"
                    >
                      <PlusCircle size={18} />
                      Gerar Nova Conexão
                    </button>
                  </div>
                )}
                
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
