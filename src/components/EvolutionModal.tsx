import { useEffect, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { Smartphone, CheckCircle, Loader2, AlertCircle, Signal, Link, PlusCircle, Key } from 'lucide-react';
import { createInstance, fetchQrCodeState } from '../services/whatsappEngine';
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
  
  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [existingInstances, setExistingInstances] = useState<any[]>([]);
  
  const [customName, setCustomName] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [activePollingId, setActivePollingId] = useState<string | null>(null);

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
          await createInstance(inst.id, false).catch(() => {});
          useChatStore.getState().updateTenantInstance(inst.id);
          setEvolutionConnection(true, inst.id);
          useChatStore.getState().syncEvolutionContacts(inst.id);
          setLoading(false);
          setTimeout(onClose, 1000);
          return;
      }
      await createInstance(inst.id, false);
      setActivePollingId(inst.id);
      checkQRStatus(inst.id, false);
    } catch(err: any) {
      setError(err.message || "Erro ao conectar motor.");
      setLoading(false);
    }
  };

  const handleGenerateNew = async () => {
    setLoading(true);
    setError(null);
    setQrBase64(null);

    const nameStr = customName.trim();
    const keyStr = apiKey.trim();

    if (!nameStr || !keyStr) {
      setError('Nome e API Key são OBRIGATÓRIOS para a Nuvem Antigravity.');
      setLoading(false);
      return;
    }

    try {
        const newEngineId = uuidv4();
        const cId = sessionStorage.getItem('current_tenant_id');
        
        const { error: dbErr } = await supabase.from('whatsapp_instances').insert({
          id: newEngineId,
          name: nameStr,
          status: 'offline',
          access_token: keyStr,
          ...(cId ? { tenant_id: cId } : {})
        });

        if (dbErr) throw new Error('Falha ao registrar instância. ' + dbErr.message);

        useChatStore.getState().updateTenantInstance(newEngineId);

        await createInstance(newEngineId);
        setActivePollingId(newEngineId);
        checkQRStatus(newEngineId, false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro de comunicação com o sistema.');
      setLoading(false);
    }
  };

  const checkQRStatus = async (engineId: string, isInitialCheck = false) => {
     try {
       const res = await fetchQrCodeState(engineId);
       
       if (res.connected) {
         setLoading(false);
         setEvolutionConnection(true, engineId);
         useChatStore.getState().syncEvolutionContacts(engineId);
         setTimeout(onClose, 1000);
         return;
       }
       
       if (res.status === 'offline' || res.error) {
         if (!isInitialCheck) {
           setLoading(false);
           setError(res.error || 'A conexão com seu WhatsApp foi encerrada ou rejeitou no pareamento. Refaça!');
           setQrBase64(null); 
         }
       }

       if (res.qrcode) {
         setLoading(false);
         setQrBase64(res.qrcode);
       }
     } catch (e) {
       console.error("Falha ao checar status QR do Motor Nativo:", e);
       if (!isInitialCheck) {
         setError('O Motor Nativo Baileys recusou conexão.');
       }
       setLoading(false);
     }
  };

  useEffect(() => {
    let interval: any;
    if (!evolutionConnected) {
      if ((loading || qrBase64) && activePollingId) {
         interval = setInterval(() => {
            checkQRStatus(activePollingId);
         }, 3000);
      }
    }
    return () => {
       if (interval) clearInterval(interval);
    };
  }, [evolutionConnected, loading, qrBase64, activePollingId]);

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
            <div className="flex flex-col items-center bg-emerald-500/10 p-6 rounded-3xl border border-emerald-500/20 mb-2">
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.3)] border-2 border-emerald-500/50 flex items-center justify-center mb-4">
                 <CheckCircle size={40} className="text-emerald-500 drop-shadow-md" />
              </div>
              <h3 className="font-bold text-lg text-emerald-700 dark:text-emerald-400">Motor Ativado</h3>
              <div className="flex justify-center items-center gap-2 mt-3 text-xs font-medium text-gray-600 dark:text-gray-300">
                  <span className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                    <Signal size={14} className="animate-pulse" /> Online
                  </span>
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
                  <div className="w-full flex flex-col gap-3 min-h-[160px] max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                     {existingInstances.length > 0 ? existingInstances.map(inst => (
                        <button 
                           key={inst.id}
                           onClick={() => handleConnectExisting(inst)}
                           className="flex items-center justify-between w-full p-4 rounded-2xl bg-white/50 dark:bg-black/40 hover:bg-white dark:hover:bg-black/60 border border-transparent hover:border-emerald-500/30 transition-all text-left shadow-sm group"
                        >
                           <div>
                              <h4 className="font-bold text-sm text-gray-800 dark:text-white">{inst.name}</h4>
                              <p className="text-[10px] text-gray-500 mt-1 font-mono">{inst.phone_number ? `+${inst.phone_number}` : 'Aguardando Número'}</p>
                           </div>
                           <Link size={16} className="text-gray-400 group-hover:text-emerald-500 transition-colors" />
                        </button>
                     )) : (
                        <div className="m-auto text-center text-gray-500 text-sm py-8 border-2 border-dashed border-gray-300 dark:border-gray-800 rounded-2xl w-full">
                           Nenhuma Instância encontrada.
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
                    <div className="w-full mb-2">
                       <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-tight flex items-center gap-1">
                          API Key
                          <span className="text-red-500">*</span>
                       </label>
                       <div className="relative">
                         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                           <Key size={14} className="text-gray-400" />
                         </div>
                         <input 
                           type="password" 
                           value={apiKey}
                           onChange={e => setApiKey(e.target.value)}
                           placeholder="Cole sua API Key gerada"
                           className="w-full bg-white dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-2xl py-3 pl-9 pr-3 text-sm text-gray-800 dark:text-white focus:outline-none focus:border-emerald-500 transition-all font-mono"
                         />
                       </div>
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
