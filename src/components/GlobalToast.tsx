import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export interface ToastConfig {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

export function GlobalToast() {
  const [toast, setToast] = useState<ToastConfig | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<ToastConfig>;
      const { message, type = 'info', duration = 6000 } = customEvent.detail || {};
      
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      setToast({ message, type, duration });

      timerRef.current = setTimeout(() => {
        setToast(null);
      }, duration);
    };

    window.addEventListener('toast', handleToastEvent);
    return () => {
      window.removeEventListener('toast', handleToastEvent);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleClose = () => {
    setToast(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  };

  if (!toast) return null;

  const { message, type = 'info' } = toast;

  // Estilos baseados no tipo do Toast com Glassmorphism elegante
  const config = {
    success: {
      bg: 'bg-emerald-500/90 dark:bg-emerald-950/80',
      border: 'border-emerald-400/30 dark:border-emerald-500/20',
      icon: <CheckCircle2 className="text-white" size={20} />,
      iconBg: 'bg-white/25',
      shadow: 'shadow-emerald-500/10'
    },
    error: {
      bg: 'bg-rose-500/90 dark:bg-rose-950/80',
      border: 'border-rose-400/30 dark:border-rose-500/20',
      icon: <AlertCircle className="text-white" size={20} />,
      iconBg: 'bg-white/25',
      shadow: 'shadow-rose-500/10'
    },
    warning: {
      bg: 'bg-amber-500/90 dark:bg-amber-950/80',
      border: 'border-amber-400/30 dark:border-amber-500/20',
      icon: <AlertTriangle className="text-white" size={20} />,
      iconBg: 'bg-white/25',
      shadow: 'shadow-amber-500/10'
    },
    info: {
      bg: 'bg-zinc-800/90 dark:bg-zinc-900/80',
      border: 'border-zinc-700/30 dark:border-zinc-800/20',
      icon: <Info className="text-white" size={20} />,
      iconBg: 'bg-white/25',
      shadow: 'shadow-zinc-500/5'
    }
  }[type];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-xl border ${config.bg} ${config.border} ${config.shadow} max-w-[90vw] md:max-w-[420px]`}
      >
        <div className={`flex-shrink-0 p-2 rounded-full ${config.iconBg}`}>
          {config.icon}
        </div>
        <div className="flex-1 text-sm font-medium leading-snug break-words">
          {message}
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 p-1.5 hover:bg-white/20 rounded-full transition-colors"
        >
          <X size={16} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
