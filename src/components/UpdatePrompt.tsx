import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // Opcional: Console log quando registrado ou forçar um update automático a cada X horas
      // console.log('SW Registered: ', r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setNeedRefresh(false);
  };

  if (!needRefresh) return null;

  return (
    <div className="fixed top-6 right-6 z-[9999] animate-in fade-in slide-in-from-top-5 duration-500 ease-out">
      <div className="relative overflow-hidden w-80 sm:w-96 p-5 rounded-2xl bg-[#202c33]/80 dark:bg-[#111b21]/90 backdrop-blur-xl border border-indigo-500/30 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
        {/* Decorative elements */}
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-500/20 blur-2xl rounded-full" />
        <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-purple-500/20 blur-2xl rounded-full" />

        <div className="relative z-10 flex gap-4">
          <div className="flex-shrink-0 mt-1">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center p-[2px] shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-[#202c33] dark:bg-[#111b21] rounded-full flex items-center justify-center">
                <Sparkles size={18} className="text-indigo-400 animate-pulse" />
              </div>
            </div>
          </div>
          
          <div className="flex-1">
            <h3 className="text-base font-semibold text-[#111b21] dark:text-[#e9edef] flex items-center gap-2 tracking-tight">
              Atualização Disponível
            </h3>
            <p className="mt-1 text-sm text-[#54656f] dark:text-[#8696a0] leading-relaxed">
              Uma nova versão do sistema está disponível. Atualize para receber as mais recentes funcionalidades e melhorias de performance.
            </p>
            
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => updateServiceWorker(true)}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-medium text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-indigo-500/20"
              >
                <RefreshCw size={14} className="animate-[spin_4s_linear_infinite]" />
                Atualizar Agora
              </button>
              <button
                onClick={close}
                className="flex items-center justify-center p-2 rounded-xl bg-slate-100 dark:bg-[#2a3942] hover:bg-slate-200 dark:hover:bg-[#3b4a54] text-slate-500 dark:text-[#8696a0] transition-colors"
                aria-label="Dispensar"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
