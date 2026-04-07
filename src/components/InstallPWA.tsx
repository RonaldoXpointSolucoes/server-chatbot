import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { cn } from '../lib/utils';

// Tipagem para o evento beforeinstallprompt
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function InstallPWA() {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setSupportsPWA(true);
      setPromptInstall(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Verifica se já foi dispensado nesta sessão/dispositivo
    const dismissed = localStorage.getItem('pwa-prompt-dismissed');
    if (dismissed) {
      setIsDismissed(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const onClick = async () => {
    if (!promptInstall) {
      return;
    }
    
    // Mostra o prompt nativo
    await promptInstall.prompt();
    const { outcome } = await promptInstall.userChoice;
    
    if (outcome === 'accepted') {
      setSupportsPWA(false);
    }
  };

  const onDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  if (!supportsPWA || isDismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-10 duration-500">
      <div className={cn(
        "relative overflow-hidden w-full max-w-md",
        "bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl",
        "border border-white/20 dark:border-white/10 shadow-2xl",
        "rounded-3xl p-6 transition-all"
      )}>
        <button 
          onClick={onDismiss}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors text-slate-500 dark:text-slate-400"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-3 bg-blue-600/10 dark:bg-blue-500/20 rounded-2xl">
            <Smartphone className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          
          <div className="flex-1 pt-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight mb-1">
              Testar App Offline?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              Instale o ChatBoot para um acesso mais rápido, envio offline de mensagens e notificações.
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={onClick}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2",
                  "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20",
                  "rounded-2xl py-2.5 px-4 font-medium transition-all"
                )}
              >
                <Download className="w-4 h-4" />
                Instalar App
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
