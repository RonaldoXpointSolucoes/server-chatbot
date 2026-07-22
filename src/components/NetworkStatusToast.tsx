import React, { useState, useEffect, useRef } from 'react';
import { Wifi, WifiOff, X, CloudOff, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export function NetworkStatusToast() {
  const [isVisible, setIsVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [toastType, setToastType] = useState<'offline' | 'error' | 'restored' | 'supabase_cloud'>('error');
  const [isRetrying, setIsRetrying] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setToastType('restored');
      setTitle("Conexão Restabelecida");
      setMessage("Sua conexão com a internet voltou ao normal.");
      setIsVisible(true);
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsVisible(false), 3500);
    };

    const handleOffline = () => {
      setToastType('offline');
      setTitle("Sem Conexão à Internet");
      setMessage("Verifique seu Wi-Fi ou sinal de dados. Tentando reconectar...");
      setIsVisible(true);
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };

    const handleSupabaseError = (e: Event) => {
      if (!navigator.onLine) return;

      const customEvent = e as CustomEvent;
      const detail = customEvent.detail || {};

      setToastType('supabase_cloud');
      setTitle(detail.title || "☁️ Instabilidade na Nuvem (Supabase)");
      setMessage(detail.message || "O serviço em nuvem do Supabase está temporariamente indisponível. O app continuará operando com os dados em cache.");
      setIsVisible(true);
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsVisible(false), 8000);
    };

    const handleSupabaseRecovered = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail || {};

      setToastType('restored');
      setTitle(detail.title || "🟢 Supabase Restabelecido");
      setMessage(detail.message || "A conexão com o servidor de banco de dados Supabase foi totalmente restabelecida.");
      setIsVisible(true);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsVisible(false), 4000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('supabase-network-error', handleSupabaseError);
    window.addEventListener('supabase-service-error', handleSupabaseError);
    window.addEventListener('supabase-service-recovered', handleSupabaseRecovered);

    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('supabase-network-error', handleSupabaseError);
      window.removeEventListener('supabase-service-error', handleSupabaseError);
      window.removeEventListener('supabase-service-recovered', handleSupabaseRecovered);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleManualRetry = async () => {
    setIsRetrying(true);
    try {
      const { useChatStore } = await import('../store/chatStore');
      await useChatStore.getState().fetchInitialData();
    } catch (err) {
      console.warn("Retry failed:", err);
    } finally {
      setTimeout(() => setIsRetrying(false), 1000);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={`fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3.5 backdrop-blur-xl text-white px-4 py-3 rounded-2xl shadow-2xl max-w-[92vw] md:max-w-[460px] border transition-all duration-300 ${
            toastType === 'offline' ? 'bg-amber-900/90 border-amber-500/40 shadow-amber-900/30' : ''
          } ${
            toastType === 'supabase_cloud' ? 'bg-slate-900/95 border-red-500/40 shadow-red-950/40 ring-1 ring-red-500/20' : ''
          } ${
            toastType === 'error' ? 'bg-red-900/90 border-red-500/40 shadow-red-950/30' : ''
          } ${
            toastType === 'restored' ? 'bg-emerald-900/90 border-emerald-500/40 shadow-emerald-950/30' : ''
          }`}
        >
          <div className="flex-shrink-0 bg-white/10 p-2.5 rounded-xl border border-white/10">
            {toastType === 'offline' && <WifiOff size={18} className="text-amber-400 animate-pulse" />}
            {toastType === 'supabase_cloud' && <CloudOff size={18} className="text-red-400 animate-bounce" />}
            {toastType === 'error' && <CloudOff size={18} className="text-red-400" />}
            {toastType === 'restored' && <Wifi size={18} className="text-emerald-400" />}
          </div>

          <div className="flex-1 flex flex-col text-left min-w-0">
            {title && <span className="text-xs font-black uppercase tracking-wider text-white mb-0.5">{title}</span>}
            <span className="text-[11.5px] font-semibold text-slate-200 leading-snug select-text">{message}</span>
          </div>

          {toastType === 'supabase_cloud' && (
            <button
              type="button"
              onClick={handleManualRetry}
              disabled={isRetrying}
              className="px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
              title="Tentar reconectar ao Supabase agora"
            >
              <RefreshCw size={12} className={isRetrying ? "animate-spin" : ""} />
              <span>Reconectar</span>
            </button>
          )}

          <button 
            onClick={() => setIsVisible(false)}
            className="flex-shrink-0 p-1.5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white cursor-pointer"
          >
            <X size={15} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
