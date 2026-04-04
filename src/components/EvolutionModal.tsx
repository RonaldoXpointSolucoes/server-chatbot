import { useEffect, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { Smartphone, CheckCircle, Loader2, AlertCircle, Phone, Signal } from 'lucide-react';
import { createInstance, fetchQrCodeState } from '../services/whatsappEngine';

export default function EvolutionModal({ onClose }: { onClose: () => void }) {
  const { evolutionConnected, setEvolutionConnection, tenantInfo, modalReason } = useChatStore();
  const [loading, setLoading] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Usaremos o ID do Tenant no Supabase como elo direto no backend de instância 
  // Caso não exista tenant, usamos um default para teste local.
  const tenantId = tenantInfo?.id || 'demo-tenant';

  const handleGenerateQR = async () => {
    setLoading(true);
    setError(null);
    setQrBase64(null);

    try {
      // 1. Toca na Nuvem Antigravity para erguer a engine deste Tenant
      // Ela só responderá se abriu, não recarrega o tempo inteiro o QR.
      await createInstance(tenantId);
      
      // Imeditatamente inicia o polling para resgatar o Base64 que a engine pintou internamente
      checkQRStatus();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro de conexão com o Motor Nativo.');
      setLoading(false);
    }
  };

  const checkQRStatus = async () => {
     try {
       const res = await fetchQrCodeState(tenantId);
       setLoading(false);

       if (res.connected) {
         setEvolutionConnection(true, tenantId);
         setTimeout(onClose, 1000);
         return;
       }
       
       if (res.status === 'offline') {
         setError('Buscando Instância e Analisando Cache...');
         // Remover o return para manter o loop vivo caso demore 2s!
       }

       if (res.qrcode) {
         setQrBase64(res.qrcode);
       }
     } catch (e) {
       console.error("Falha ao checar status QR do Motor Nativo:", e);
     }
  };

  // Polling a cada 2.5s enquanto não conectado
  useEffect(() => {
    let interval: any;
    if (!evolutionConnected) {
      interval = setInterval(() => {
         checkQRStatus();
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [evolutionConnected]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-white/70 dark:bg-[#111b21]/70 backdrop-blur-2xl rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col items-center p-8 border border-white/50 dark:border-white/10 relative transition-all">
        <button onClick={onClose} className="absolute top-5 right-5 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors bg-white/50 dark:bg-black/20 rounded-full w-8 h-8 flex items-center justify-center">X</button>
        
        <h2 className="text-2xl font-black tracking-tight text-gray-800 dark:text-white mb-1 flex items-center gap-2">
          <Smartphone className="text-emerald-500"/> App Connect
        </h2>

        {modalReason ? (
           <p className="text-sm font-medium text-center text-orange-600 bg-orange-500/10 p-3 rounded-2xl my-4 border border-orange-500/20">
             {modalReason}
           </p>
        ) : (
           <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-6 mt-1 font-medium">
             Engine: {tenantInfo?.name || 'SaaS'} (Nativa)
           </p>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl text-xs mb-4 flex items-start w-full gap-2 transition-all">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
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
                  <span className="flex items-center gap-1 bg-black/5 dark:bg-white/5 px-3 py-1 rounded-full"><Phone size={14}/> ID: {tenantId}</span>
                  <span className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                    <Signal size={14} className="animate-pulse" /> Online
                  </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center justify-center min-h-[260px] bg-white/30 dark:bg-black/30 p-6 rounded-3xl border border-white/20 dark:border-white/5 shadow-inner">
            {loading ? (
              <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
                 <Loader2 className="animate-spin text-emerald-500" size={48} />
                 <span className="text-sm text-gray-600 dark:text-gray-400 font-medium tracking-wide">Acionando Motor Nativo...</span>
              </div>
            ) : qrBase64 ? (
              <div className="animate-in fade-in zoom-in-95 duration-500 flex flex-col items-center w-full">
                 <div className="p-3 bg-white/90 backdrop-blur-md rounded-3xl shadow-xl border border-white/50">
                    <img src={qrBase64} alt="QR Code" className="w-[200px] h-[200px] rounded-2xl" />
                 </div>
                 <p className="text-center text-xs mt-6 mb-2 text-gray-500 dark:text-gray-400 font-medium">
                   O WhatsApp Motor foi gerado. <br/>Acesse *Aparelhos Conectados* e escaneie.
                 </p>
                 <button 
                   onClick={() => setQrBase64(null)}
                   className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 uppercase mt-2 bg-emerald-500/10 px-4 py-2 rounded-full hover:bg-emerald-500/20 transition-colors"
                 >
                   Cancelar
                 </button>
              </div>
            ) : (
              <div className="flex flex-col w-full animate-in fade-in zoom-in-95 duration-500 items-center text-center">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-5 shadow-sm border border-emerald-500/20">
                    <Smartphone size={28} />
                </div>
                <h3 className="text-md font-bold text-gray-800 dark:text-gray-100 mb-2">Conecte sua Empresa</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                   Pressione o botão abaixo para gerar uma interface de conexão segura na Nuvem Antigravity.
                </p>
                
                <button 
                  onClick={handleGenerateQR}
                  className="bg-emerald-500 hover:bg-emerald-400 w-full text-white px-6 py-4 rounded-2xl text-sm font-bold transition-all shadow-[0_10px_20px_-10px_rgba(16,185,129,0.5)] active:scale-95 flex items-center justify-center gap-2"
                >
                  Acionar Motor Baileys
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
