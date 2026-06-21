import React, { useState, useEffect } from 'react';
import { WifiOff, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export function NetworkStatusToast() {
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleNetworkError = (e: Event) => {
      const customEvent = e as CustomEvent;
      setMessage(customEvent.detail?.message || "Houve uma falha ao comunicar com o servidor.");
      setIsVisible(true);
      
      // Auto-hide after 6 seconds
      setTimeout(() => setIsVisible(false), 6000);
    };

    window.addEventListener('supabase-network-error', handleNetworkError);
    return () => {
      window.removeEventListener('supabase-network-error', handleNetworkError);
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
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-red-500/90 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-xl shadow-red-500/20 max-w-[90vw] md:max-w-[400px] border border-red-400/30"
        >
          <div className="flex-shrink-0 bg-white/20 p-2 rounded-full">
            <WifiOff size={20} className="text-white" />
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
