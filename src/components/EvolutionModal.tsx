import { useEffect, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { Smartphone, CheckCircle, Loader2, AlertCircle, LogOut, RefreshCw, Trash2, Signal, Phone, Activity } from 'lucide-react';
import { connectInstance, getInstanceConnectionState, createInstance, fetchInstances, logoutInstance, restartInstance, deleteInstance } from '../services/evolution';
import SystemDiagnosticModal from './SystemDiagnosticModal';

export default function EvolutionModal({ onClose }: { onClose: () => void }) {
  const { evolutionConnected, setEvolutionConnection, tenantInfo, modalReason, updateTenantInstance } = useChatStore();
  const [loading, setLoading] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Nome da instância engessado pelo banco de dados (SaaS mode)
  // Ou usamos a que já existe cadastrarda, ou formatamos uma baseada no nome da empresa (nova)
  const defaultInstanceName = tenantInfo?.evolution_api_instance 
         || (tenantInfo ? `${tenantInfo.name.toLowerCase().replace(/[^a-z0-9]/g, '')}_1` : `tenant_padrao_1`);
  
  const [instanceName, setInstanceName] = useState(defaultInstanceName);
  const [allInstances, setAllInstances] = useState<any[]>([]);
  const [instanceData, setInstanceData] = useState<any>(null);
  // webhookData removido
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState<boolean>(false);

  // Busca lista global de instâncias sempre que o modal abre para popular o Dropdown
  useEffect(() => {
     fetchInstances().then(data => {
        if(Array.isArray(data)) setAllInstances(data);
     }).catch(() => {});
  }, []);

  // Busca dados enriquecidos se tiver conectado para renderizar o painel
  useEffect(() => {
     if (evolutionConnected) {
        // Encontra no array carregado ou tenta denovo
        const loadEnriched = async () => {
           try {
              const data = await fetchInstances();
              const myInst = Array.isArray(data) ? data.find((i:any) => i?.instance?.instanceName === instanceName) || data[0] : null;
              if (myInst?.instance) {
                 setInstanceData({
                    profilePicUrl: myInst.instance.profilePictureUrl || myInst.instance.profilePicUrl, 
                    profileName: myInst.instance.profileName || myInst.instance.pushName,
                    owner: myInst.instance.owner || myInst.instance.number,
                    state: myInst.instance.state,
                    status: myInst.instance.status
                 });
              }
           } catch (e) {}
        };
        loadEnriched();
     }
  }, [evolutionConnected, instanceName]);

  const handleGenerateQR = async () => {
    setLoading(true);
    setError(null);

    try {
      // Cria ou Puxa os dados para gerar QR Code
      let connectData = await connectInstance(instanceName);
      
      if (!connectData) {
        const createRes = await createInstance(instanceName);
        connectData = createRes?.qrcode ? { base64: createRes.qrcode.base64 } : null;
      }

      if (connectData?.base64) {
        setQrBase64(connectData.base64);
        // Atualiza no DB que a prop desta empresa é esta instância gerada/selecionada agora!
        if (tenantInfo?.evolution_api_instance !== instanceName) {
            await updateTenantInstance(instanceName);
        }
      } else if (connectData?.instance?.state === 'open') {
        if (tenantInfo?.evolution_api_instance !== instanceName) {
            await updateTenantInstance(instanceName);
        }
        setEvolutionConnection(true, instanceName);
        setTimeout(onClose, 1000);
      } else {
        throw new Error('Falha ao gerar o QR Code. Sistema ocupado.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleTestWebhook = async () => {
     setIsProcessingAction(true);
     try {
       const { findWebhook } = await import('../services/evolution');
       const res = await findWebhook(instanceName);
       if (res?.webhook) {
          alert(`Webhook Encontrado!\nURL: ${res.webhook.url}\nEventos: ${res.webhook.events.join(', ')}`);
       } else {
          alert('Webhook NÃO configurado para esta instância!');
       }
     } catch (e) {
        alert('Erro ao buscar Webhook.');
     }
     setIsProcessingAction(false);
  };

  // Polling para checar se o celular leu o QR Code
  useEffect(() => {
    let interval: any;
    if (qrBase64 && !evolutionConnected) {
      interval = setInterval(async () => {
        try {
          const stateRes = await getInstanceConnectionState(instanceName);
          if (stateRes?.instance?.state === 'open') {
            setEvolutionConnection(true, instanceName);
            setQrBase64(null);
            clearInterval(interval);
            setTimeout(onClose, 1000);
          }
        } catch(e) {}
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [qrBase64, evolutionConnected, instanceName, setEvolutionConnection, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 shadow-inner backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#202c33] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col items-center p-8 border border-white/20 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">X</button>
        
        <h2 className="text-xl font-bold tracking-tight text-[#111b21] dark:text-[#e9edef] mb-1 flex items-center gap-2">
          <Smartphone className="text-[#00a884]"/> Evolution API ({tenantInfo?.name || 'SaaS'})
        </h2>

        {modalReason ? (
           <p className="text-sm font-medium text-center text-orange-600 bg-orange-50 dark:bg-orange-900/10 dark:text-orange-400 p-3 rounded-lg my-4 border border-orange-100 dark:border-orange-900/50">
             {modalReason}
           </p>
        ) : (
           <p className="text-xs text-center text-[#54656f] dark:text-[#aebac1] mb-6 mt-1">
             Gere o QR Code oficial para a conta corporativa.
           </p>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-3 rounded-xl text-xs mb-4 flex items-start w-full gap-2 transition-all">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {evolutionConnected ? (
          <div className="flex flex-col w-full animate-in zoom-in slide-in-from-bottom-4 duration-300">
            {/* Cabecalho de Status Principal */}
            <div className="flex flex-col items-center bg-gradient-to-b from-[#00a884]/10 to-transparent p-6 rounded-2xl border border-[#00a884]/20 mb-6">
              <div className="relative mb-3">
                 {instanceData?.profilePicUrl ? (
                    <img src={instanceData.profilePicUrl} alt="Avatar" className="w-20 h-20 rounded-full shadow-lg border-2 border-white dark:border-[#202c33] object-cover" />
                 ) : (
                    <div className="w-20 h-20 rounded-full bg-white dark:bg-[#111b21] shadow-lg border-2 border-[#00a884] flex items-center justify-center">
                      <CheckCircle size={40} className="text-[#00a884]" />
                    </div>
                 )}
                 <div className="absolute bottom-0 right-0 w-5 h-5 bg-[#00a884] rounded-full border-2 border-white dark:border-[#202c33] shadow-sm flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                 </div>
              </div>
              <h3 className="font-bold text-xl text-[#111b21] dark:text-white mt-1">{instanceData?.profileName || 'WhatsApp Connectado'}</h3>
              <div className="flex flex-wrap justify-center items-center gap-3 mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1"><Phone size={14} className="text-gray-400"/> {instanceData?.owner ? `+${instanceData.owner}` : instanceName}</span>
                  {(instanceData?.status || instanceData?.state) && (
                     <span className="flex items-center gap-1 text-[#00a884] bg-[#00a884]/10 px-2 py-0.5 rounded-md border border-[#00a884]/20">
                       <Signal size={14} className="animate-pulse" /> {instanceData?.status || instanceData?.state || 'Online'}
                     </span>
                  )}
              </div>
              <div className="mt-3 bg-white/50 dark:bg-black/20 text-[10px] px-3 py-1.5 rounded-md text-gray-500 border border-gray-200 dark:border-gray-800">
                  ID: <span className="font-mono">{instanceName}</span>
              </div>
            </div>

            {/* Acoes Restritas */}
            <div className="flex flex-col gap-3">
               
               <button 
                 disabled={isProcessingAction}
                 onClick={() => setIsDiagnosticOpen(true)}
                 className="group bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 w-full text-blue-600 dark:text-blue-400 px-5 py-3.5 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center justify-between border border-blue-200 dark:border-blue-800/50"
               >
                 <span className="flex items-center gap-3"><Activity size={18} /> Diagnóstico do Ecossistema</span>
               </button>
               
               <button 
                 disabled={isProcessingAction}
                 onClick={handleTestWebhook}
                 className="group bg-[#00a884]/10 hover:bg-[#00a884]/20 w-full text-[#00a884] px-5 py-3.5 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center justify-between"
               >
                 <span className="flex items-center gap-3"><Signal size={18} /> Testar Webhook Interno</span>
                 {isProcessingAction && <Loader2 size={16} className="animate-spin" />}
               </button>

               <button 
                 disabled={isProcessingAction}
                 onClick={async () => {
                    if(!confirm("Atenção: Isso cortará a conexão permanentemente. Você precisará de outro Celular/QR Code para reconectar. Proceder?")) return;
                    setIsProcessingAction(true);
                    try {
                       await logoutInstance(instanceName);
                       setEvolutionConnection(false, null);
                       window.location.reload();
                    } catch(e) {}
                 }}
                 className="group bg-white dark:bg-[#111b21] hover:bg-red-50 dark:hover:bg-red-900/20 w-full text-gray-700 dark:text-gray-300 hover:text-red-600 px-5 py-3.5 rounded-xl text-sm font-medium transition-all shadow-sm border border-gray-200 dark:border-gray-800 flex items-center justify-between"
               >
                 <span className="flex items-center gap-3"><LogOut size={18} className="text-gray-400 group-hover:text-red-500" /> Desconectar Aparelho</span>
                 {isProcessingAction && <Loader2 size={16} className="animate-spin" />}
               </button>

               <button 
                 disabled={isProcessingAction}
                 onClick={async () => {
                    if(!confirm("Reiniciar o serviço interno pode causar uma leve lentidão inicial. Continuar?")) return;
                    setIsProcessingAction(true);
                    try {
                       await restartInstance(instanceName);
                       setTimeout(() => { setIsProcessingAction(false); alert("Socket Reiniciado com Sucesso!"); }, 3000);
                    } catch(e) { setIsProcessingAction(false); }
                 }}
                 className="group bg-white dark:bg-[#111b21] hover:bg-orange-50 dark:hover:bg-orange-900/20 w-full text-gray-700 dark:text-gray-300 hover:text-orange-600 px-5 py-3.5 rounded-xl text-sm font-medium transition-all shadow-sm border border-gray-200 dark:border-gray-800 flex items-center justify-between"
               >
                 <span className="flex items-center gap-3"><RefreshCw size={18} className="text-gray-400 group-hover:text-orange-500" /> Reiniciar Serviço</span>
               </button>

               <button 
                 disabled={isProcessingAction}
                 onClick={async () => {
                    if(!confirm("PERIGO: Você está preste a EXCLUIR toda a estância da Evolution API permanentemente! Realmente deseja fazer isso?")) return;
                    setIsProcessingAction(true);
                    try {
                       await deleteInstance(instanceName);
                       setEvolutionConnection(false, null);
                       window.location.reload(); // Hard reset local
                    } catch(e) {}
                 }}
                 className="group mt-2 border-t border-red-100 dark:border-red-900/20 pt-4 bg-transparent hover:bg-red-50 dark:hover:bg-red-500/10 w-full text-red-500 hover:text-red-600 px-5 py-3.5 rounded-xl text-sm font-medium transition-all flex items-center justify-between"
               >
                 <span className="flex items-center gap-3"><Trash2 size={18} /> Excluir Instância Host</span>
               </button>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-[#111b21] w-full p-4 rounded-2xl shadow-inner border border-gray-100 dark:border-gray-800 flex items-center justify-center min-h-[240px]">
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                 <Loader2 className="animate-spin text-[#00a884]" size={40} />
                 <span className="text-xs text-gray-500 font-medium">Buscando token...</span>
              </div>
            ) : qrBase64 ? (
              <div className="animate-in fade-in zoom-in duration-500 flex flex-col items-center w-full">
                 <div className="p-2 bg-white rounded-xl shadow-sm">
                    <img src={qrBase64} alt="QR Code" className="w-[200px] h-[200px] rounded-lg" />
                 </div>
                 <p className="text-center text-xs mt-4 mb-4 text-gray-500 dark:text-gray-400 font-medium">
                   Abra o WhatsApp &gt; Aparelhos Conectados &gt; Ler QR Code
                 </p>
                 <button 
                   onClick={() => setQrBase64(null)}
                   className="text-xs text-gray-500 underline"
                 >
                   Cancelar e escolher outra instância
                 </button>
              </div>
            ) : (
              <div className="flex flex-col w-full animate-in fade-in zoom-in duration-300">
                <div className="mb-4">
                   <label className="text-xs font-bold text-gray-500 dark:text-gray-400 block mb-2">Vincular e Parear Instância</label>
                   
                   {allInstances.length > 0 ? (
                      <div className="relative">
                         <select 
                           value={instanceName}
                           onChange={(e) => setInstanceName(e.target.value)}
                           className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 text-sm p-3 block rounded-xl focus:outline-none focus:border-[#00a884] dark:text-gray-200"
                         >
                           <option value={defaultInstanceName} className="font-bold">✨ (Criar/Usar Padrão) {defaultInstanceName}</option>
                           <optgroup label="Instâncias Ativas na API">
                             {allInstances.filter(i => i?.instance?.instanceName).map(i => (
                                <option key={i.instance.instanceName} value={i.instance.instanceName}>
                                  {i.instance.instanceName} {i.instance.status === 'open' ? '🟢' : '⚪'}
                                </option>
                             ))}
                           </optgroup>
                         </select>
                      </div>
                   ) : (
                      <input 
                         type="text" 
                         value={instanceName}
                         onChange={(e) => setInstanceName(e.target.value)}
                         className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 text-sm p-3 rounded-xl focus:outline-none focus:border-[#00a884] dark:text-gray-200"
                         placeholder="Nome da Instância..."
                      />
                   )}
                   <p className="text-[10px] text-gray-400 mt-2 leading-tight">Gere uma nova, caso seja seu primeiro acesso. Ou selecione uma já existente para migrar/testar o tenant.</p>
                </div>
                
                <button 
                  onClick={handleGenerateQR}
                  className="bg-[#00a884] hover:bg-[#029071] w-full text-white px-5 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 mt-2"
                >
                  <Smartphone size={18} />
                  Ler QR Code / Conectar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      
      {isDiagnosticOpen && (
        <SystemDiagnosticModal 
          onClose={() => setIsDiagnosticOpen(false)} 
          instanceName={instanceName} 
        />
      )}
    </div>
  );
}
