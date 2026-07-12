import React, { useState, useEffect, useRef } from 'react';
import { Wifi, WifiOff, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export function NetworkStatusToast() {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [toastType, setToastType] = useState<'offline' | 'error' | 'restored'>('error');
  const [isOnline, setIsOnline] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setToastType('restored');
      setMessage("Conexão restabelecida com sucesso!");
      setIsVisible(true);
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsVisible(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setToastType('offline');
      setMessage("Sem conexão com a internet. Tentando reconectar...");
      setIsVisible(true);
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };

    const handleNetworkError = (e: Event) => {
      if (!navigator.onLine) return; // Keep showing offline banner

      const customEvent = e as CustomEvent;
      setToastType('error');
      setMessage(customEvent.detail?.message || "Instabilidade na rede detectada ou tempo limite excedido.");
      setIsVisible(true);
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsVisible(false), 6000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('supabase-network-error', handleNetworkError);

    // Initial check
    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('supabase-network-error', handleNetworkError);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-xl max-w-[90vw] md:max-w-[420px] border transition-all duration-300
            ${toastType === 'offline' ? 'bg-amber-600/90 dark:bg-amber-600/95 border-amber-500/30 shadow-amber-500/20' : ''}
            ${toastType === 'error' ? 'bg-red-500/90 dark:bg-red-500/95 border-red-400/30 shadow-red-500/20' : ''}
            ${toastType === 'restored' ? 'bg-emerald-600/90 dark:bg-emerald-600/95 border-emerald-500/30 shadow-emerald-500/20' : ''}
          `}
        >
          <div className="flex-shrink-0 bg-white/20 p-2 rounded-full">
            {toastType === 'offline' && <WifiOff size={20} className="text-white animate-pulse" />}
            {toastType === 'error' && <AlertTriangle size={20} className="text-white" />}
            {toastType === 'restored' && <Wifi size={20} className="text-white" />}
          </div>
          <div className="flex-1 text-sm font-medium leading-snug">
            {message}
          </div>
          <button 
            onClick={() => setIsVisible(false)}
            className="flex-shrink-0 p-1.5 hover:bg-white/20 rounded-full transition-colors"
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
