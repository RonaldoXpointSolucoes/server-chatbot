import React, { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X, Sparkles, Loader2, Zap } from 'lucide-react';

export function UpdatePrompt() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updatePhase, setUpdatePhase] = useState<'idle' | 'updating' | 'reloading'>('idle');

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      if (registration) {
        // Checagem periódica a cada 30 minutos em background
        const intervalId = setInterval(() => {
          registration.update().catch(err => console.debug('[SW] Verificação periódica:', err));
        }, 30 * 60 * 1000);

        // Checagem inteligente sempre que o usuário retornar o foco para a aba do sistema
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(err => console.debug('[SW] Verificação por foco:', err));
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
          clearInterval(intervalId);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
      }
    },
    onRegisterError(error) {
      console.warn('[SW] Falha no registro do Service Worker:', error);
    },
  });

  const close = () => {
    if (isUpdating) return;
    setNeedRefresh(false);
  };

  /**
   * Pipeline de Atualização Resiliente de Último Nível (Multi-Camada):
   * 1. Feedback visual e tátil imediato (loading state ativo).
   * 2. Escuta ativa ao evento 'controllerchange'.
   * 3. Ativação via hook do Vite PWA (skipWaiting).
   * 4. Broadcast direto para todas as instâncias e registrations ativas do Service Worker.
   * 5. Limpeza de caches obsoletos de scripts/estilos.
   * 6. Timeout de segurança garantido (recarrega a janela mesmo se o navegador reter o evento).
   */
  const handleUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    setUpdatePhase('updating');

    let reloaded = false;
    const performReload = () => {
      if (!reloaded) {
        reloaded = true;
        setUpdatePhase('reloading');
        // Pequena pausa suave para o usuário ver a confirmação visual
        setTimeout(() => {
          window.location.reload();
        }, 300);
      }
    };

    try {
      // Camada 1: Listener para recarregamento assim que o novo Service Worker assumir o controle
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', performReload, { once: true });
      }

      // Camada 2: Invoca a rotina oficial do vite-plugin-pwa
      try {
        await updateServiceWorker(true);
      } catch (err) {
        console.warn('[UpdatePrompt] updateServiceWorker falhou, usando fallback direto:', err);
      }

      // Camada 3: Varredura direta e envio explícito de SKIP_WAITING para todas as registrations
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            if (reg.installing) {
              reg.installing.postMessage({ type: 'SKIP_WAITING' });
            }
          }
        } catch (swErr) {
          console.warn('[UpdatePrompt] Erro ao notificar registrations:', swErr);
        }
      }

      // Camada 4: Limpeza atômica de caches de scripts e estilos obsoletos para evitar versões presas
      if ('caches' in window) {
        try {
          const cacheKeys = await caches.keys();
          const staleCaches = cacheKeys.filter(
            key => key.includes('static-resources') || key.includes('workbox-precache')
          );
          await Promise.all(staleCaches.map(key => caches.delete(key)));
        } catch (cacheErr) {
          console.warn('[UpdatePrompt] Erro ao limpar caches legados:', cacheErr);
        }
      }

      // Camada 5: Timeout de Segurança Resiliente (Garante 100% de execução em no máximo 1.2s)
      setTimeout(() => {
        performReload();
      }, 1200);

    } catch (criticalErr) {
      console.error('[UpdatePrompt] Erro no pipeline de atualização:', criticalErr);
      performReload();
    }
  };

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 inset-x-3.5 sm:bottom-auto sm:top-6 sm:right-6 sm:inset-x-auto sm:w-[420px] z-[9999] animate-in fade-in slide-in-from-bottom-5 sm:slide-in-from-top-5 duration-400 ease-out">
      <div className="relative overflow-hidden rounded-3xl bg-slate-900/90 dark:bg-[#111b21]/95 backdrop-blur-2xl border border-indigo-500/30 dark:border-indigo-400/20 shadow-[0_20px_50px_rgba(0,0,0,0.45)] dark:shadow-[0_25px_60px_rgba(0,0,0,0.7)] p-5">
        
        {/* Glow dinâmico de fundo */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-600/25 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-purple-600/20 blur-3xl rounded-full pointer-events-none" />

        {/* Linha de progresso animada ao atualizar */}
        {isUpdating && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 animate-[pulse_1s_ease-in-out_infinite] w-full" />
          </div>
        )}

        <div className="relative z-10 flex gap-4">
          {/* Ícone de Destaque com Anel e Pulso */}
          <div className="flex-shrink-0 pt-0.5">
            <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-700 p-[2px] shadow-lg shadow-indigo-500/25">
              <div className="w-full h-full bg-slate-950 dark:bg-[#111b21] rounded-[14px] flex items-center justify-center">
                {isUpdating ? (
                  <Loader2 size={20} className="text-indigo-400 animate-spin" />
                ) : (
                  <Sparkles size={20} className="text-indigo-400 animate-pulse" />
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              </div>
            </div>
          </div>
          
          {/* Conteúdo Informativo */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[15px] font-bold text-white dark:text-[#e9edef] tracking-tight">
                  Atualização Disponível
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
                  <Zap size={10} className="text-indigo-400" />
                  Nova Versão
                </span>
              </div>

              {!isUpdating && (
                <button
                  onClick={close}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
                  aria-label="Dispensar temporariamente"
                  title="Dispensar temporariamente"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <p className="mt-1.5 text-xs sm:text-[13px] text-slate-300 dark:text-[#8696a0] leading-relaxed">
              Uma versão mais recente do ChatBoot foi preparada com melhorias de velocidade, estabilidade e novas funcionalidades.
            </p>
            
            {/* Ações de Atualização */}
            <div className="mt-4 flex items-center gap-2.5">
              <button
                onClick={handleUpdate}
                disabled={isUpdating}
                className={`flex-1 h-11 px-4 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all duration-200 shadow-md ${
                  isUpdating
                    ? 'bg-indigo-700/80 text-white/90 cursor-wait shadow-none'
                    : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] text-white shadow-indigo-600/30 hover:shadow-indigo-600/40 hover:shadow-lg'
                }`}
              >
                {isUpdating ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-white" />
                    <span>
                      {updatePhase === 'reloading' ? 'Pronto! Recarregando...' : 'Aplicando atualização...'}
                    </span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={15} className="group-hover:rotate-180 transition-transform duration-500" />
                    <span>Atualizar Agora</span>
                  </>
                )}
              </button>

              {!isUpdating && (
                <button
                  onClick={close}
                  className="h-11 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white text-xs font-medium border border-white/5 transition-all active:scale-[0.98]"
                >
                  Depois
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
