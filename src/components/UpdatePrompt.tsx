import React, { useState, useEffect, useMemo } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { 
  RefreshCw, 
  X, 
  Sparkles, 
  Loader2, 
  Zap, 
  Rocket, 
  Wrench, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  Tag, 
  ArrowRight,
  ShieldCheck,
  Flame
} from 'lucide-react';

interface ReleaseNoteItem {
  id: string;
  category: 'features' | 'fixes' | 'improvements';
  title: string;
  description: string;
  tag: string;
  badgeColor: string;
}

// Conjunto curado das novidades, correções e melhorias recentes do ChatBoot
const DEFAULT_RELEASE_NOTES: ReleaseNoteItem[] = [
  {
    id: 'note-1',
    category: 'fixes',
    title: 'Estabilidade Crítica de Conexões Baileys',
    description: 'Eliminação de vazamentos de memória (MaxListenersExceeded), limpeza automática de listeners residuais e estabilização do handshake de sockets.',
    tag: 'CORREÇÃO',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
  },
  {
    id: 'note-2',
    category: 'fixes',
    title: 'Resiliência na Integração Gastrofood',
    description: 'Tratamento de limite de caracteres (varchar 20) no envio de pedidos, mitigando erros 500 do FireDAC e garantindo fallback de cardápio local.',
    tag: 'CORREÇÃO',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
  },
  {
    id: 'note-3',
    category: 'features',
    title: 'Central de Atualizações PWA & Notificações',
    description: 'Novo cockpit visual detalhado de novidades com carregamento inteligente de Service Worker e recarregamento sem atrito.',
    tag: 'NOVIDADE',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
  },
  {
    id: 'note-4',
    category: 'improvements',
    title: 'Performance do CRM Kanban & Cache Instantâneo',
    description: 'Agilização na renderização dos quadros de desenvolvimento, otimização de pré-cache de scripts e menor consumo de dados móveis.',
    tag: 'PERFORMANCE',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
  },
  {
    id: 'note-5',
    category: 'improvements',
    title: 'Design System & Responsividade Fluida',
    description: 'Microinterações táteis para dispositivos móveis, glassmorphism refinado e contraste visual aprimorado em modo escuro.',
    tag: 'INTERFACE',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
  }
];

export function UpdatePrompt() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updatePhase, setUpdatePhase] = useState<'idle' | 'updating' | 'reloading'>('idle');
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'features' | 'fixes' | 'improvements'>('all');
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNoteItem[]>(DEFAULT_RELEASE_NOTES);

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

  // Habilitar simulação visual em desenvolvimento ou testes manuais
  useEffect(() => {
    (window as any).__triggerUpdatePrompt = (force: boolean = true) => {
      setNeedRefresh(force);
    };
    return () => {
      delete (window as any).__triggerUpdatePrompt;
    };
  }, [setNeedRefresh]);

  // Tentar enriquecer notas dinamicamente a partir da API do servidor se estiver disponível
  useEffect(() => {
    if (!needRefresh) return;

    const fetchServerNotes = async () => {
      try {
        const engineUrl = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || 'http://localhost:9000';
        const res = await fetch(`${engineUrl}/debug/healthz`, {
          headers: { 'x-asts-test': 'true' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.changelog) && data.changelog.length > 0) {
            const parsedNotes: ReleaseNoteItem[] = data.changelog.map((item: string, idx: number) => {
              const isFix = item.toLowerCase().includes('correc') || item.toLowerCase().includes('fix') || item.toLowerCase().includes('resili');
              const isFeature = item.toLowerCase().includes('nov') || item.toLowerCase().includes('ui') || item.toLowerCase().includes('endpoint');
              return {
                id: `srv-note-${idx}`,
                category: isFix ? 'fixes' : isFeature ? 'features' : 'improvements',
                title: item.replace(/^[^\w\s]+/, '').trim(),
                description: 'Implementado e publicado na versão recente do ecossistema ChatBoot.',
                tag: isFix ? 'CORREÇÃO' : isFeature ? 'NOVIDADE' : 'MELHORIA',
                badgeColor: isFix 
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : isFeature 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
              };
            });
            // Mesclar evitando duplicados
            setReleaseNotes(prev => {
              const combined = [...prev];
              parsedNotes.forEach(pn => {
                if (!combined.some(c => c.title.toLowerCase() === pn.title.toLowerCase())) {
                  combined.unshift(pn);
                }
              });
              return combined;
            });
          }
        }
      } catch {
        // Mantém as notas padrão curadas em caso de falha de conexão
      }
    };

    fetchServerNotes();
  }, [needRefresh]);

  const close = () => {
    if (isUpdating) return;
    setNeedRefresh(false);
  };

  /**
   * Pipeline de Atualização Resiliente de Último Nível (Multi-Camada):
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
        setTimeout(() => {
          window.location.reload();
        }, 300);
      }
    };

    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', performReload, { once: true });
      }

      try {
        await updateServiceWorker(true);
      } catch (err) {
        console.warn('[UpdatePrompt] updateServiceWorker falhou, usando fallback direto:', err);
      }

      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            if (reg.installing) reg.installing.postMessage({ type: 'SKIP_WAITING' });
          }
        } catch (swErr) {
          console.warn('[UpdatePrompt] Erro ao notificar registrations:', swErr);
        }
      }

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

      setTimeout(() => {
        performReload();
      }, 1200);

    } catch (criticalErr) {
      console.error('[UpdatePrompt] Erro no pipeline de atualização:', criticalErr);
      performReload();
    }
  };

  // Filtragem das notas pelas abas
  const filteredNotes = useMemo(() => {
    if (activeTab === 'all') return releaseNotes;
    return releaseNotes.filter(n => n.category === activeTab);
  }, [releaseNotes, activeTab]);

  const counts = useMemo(() => {
    return {
      all: releaseNotes.length,
      features: releaseNotes.filter(n => n.category === 'features').length,
      fixes: releaseNotes.filter(n => n.category === 'fixes').length,
      improvements: releaseNotes.filter(n => n.category === 'improvements').length,
    };
  }, [releaseNotes]);

  // Metadados de versão
  const currentVersion = import.meta.env.PACKAGE_VERSION || '7.4.4';
  const rawBuildDate = import.meta.env.PACKAGE_BUILD_DATE || import.meta.env.VITE_PACKAGE_BUILD_DATE;
  const buildDateStr = useMemo(() => {
    if (!rawBuildDate) return 'Recém-compilada';
    return rawBuildDate;
  }, [rawBuildDate]);

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-3 inset-x-3 sm:bottom-auto sm:top-5 sm:right-5 sm:inset-x-auto sm:w-[460px] md:w-[480px] z-[9999] animate-in fade-in slide-in-from-bottom-5 sm:slide-in-from-top-5 duration-300 ease-out select-none">
      <div className="relative overflow-hidden rounded-3xl bg-[#0b141a]/95 dark:bg-[#0c1317]/95 backdrop-blur-2xl border border-indigo-500/30 dark:border-indigo-400/25 shadow-[0_20px_60px_rgba(0,0,0,0.65)] p-4 sm:p-5 text-white">
        
        {/* Glow dinâmico de fundo com gradiente sutil */}
        <div className="absolute -top-14 -right-14 w-40 h-40 bg-indigo-600/25 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute -bottom-14 -left-14 w-40 h-40 bg-purple-600/20 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-emerald-500/10 blur-3xl rounded-full pointer-events-none" />

        {/* Linha de progresso animada ao atualizar */}
        {isUpdating && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800 overflow-hidden z-20">
            <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 animate-[pulse_1s_ease-in-out_infinite] w-full" />
          </div>
        )}

        <div className="relative z-10 flex flex-col gap-3.5">
          
          {/* Header Superior: Ícone, Título, Versão & Fechar */}
          <div className="flex items-start justify-between gap-3">
            
            <div className="flex items-center gap-3">
              {/* Ícone de Destaque com Borda Gradiente e Pulso */}
              <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-700 p-[2px] shadow-lg shadow-indigo-500/25 shrink-0">
                <div className="w-full h-full bg-[#0b141a] dark:bg-[#111b21] rounded-[14px] flex items-center justify-center">
                  {isUpdating ? (
                    <Loader2 size={20} className="text-indigo-400 animate-spin" />
                  ) : (
                    <Sparkles size={20} className="text-indigo-400 animate-pulse" />
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#0b141a] flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                </div>
              </div>

              {/* Título e Badges */}
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm sm:text-[15px] font-black text-white tracking-tight leading-snug font-sans">
                    Atualização Disponível
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-500/25 border border-indigo-500/40 text-indigo-300 font-mono">
                    <Zap size={10} className="text-indigo-400" />
                    v{currentVersion}
                  </span>
                </div>
                <p className="text-[11px] text-[#8696a0] flex items-center gap-1.5 mt-0.5">
                  <Clock size={11} className="text-slate-400" />
                  <span>Pronta para aplicar • {buildDateStr}</span>
                </p>
              </div>
            </div>

            {/* Ações de Fechar */}
            {!isUpdating && (
              <button
                onClick={close}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors active:scale-95 shrink-0"
                aria-label="Dispensar temporariamente"
                title="Dispensar temporariamente"
              >
                <X size={17} />
              </button>
            )}
          </div>

          {/* Chamada Principal Curta */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-2.5 px-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-200">
              <Flame size={15} className="text-amber-400 shrink-0 animate-pulse" />
              <span className="font-medium text-[12px] leading-tight">
                Nova compilação com correções no Baileys e Gastrofood
              </span>
            </div>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[11px] font-bold text-indigo-300 hover:text-white flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded-lg hover:bg-indigo-500/20 shrink-0"
            >
              <span>{isExpanded ? 'Ocultar' : 'Ver Detalhes'}</span>
              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {/* Bloco Expansível de Novidades, Correções e Melhorias */}
          {isExpanded && (
            <div className="space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
              
              {/* Filtros por Abas (Todas, Novidades, Correções, Melhorias) */}
              <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-0.5">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                    activeTab === 'all'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/40'
                      : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <span>Todas</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
                    {counts.all}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('features')}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                    activeTab === 'features'
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/40'
                      : 'bg-white/5 text-slate-400 hover:text-emerald-300 hover:bg-white/10'
                  }`}
                >
                  <Rocket size={11} className={activeTab === 'features' ? 'text-white' : 'text-emerald-400'} />
                  <span>Novidades</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
                    {counts.features}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('fixes')}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                    activeTab === 'fixes'
                      ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/40'
                      : 'bg-white/5 text-slate-400 hover:text-rose-300 hover:bg-white/10'
                  }`}
                >
                  <Wrench size={11} className={activeTab === 'fixes' ? 'text-white' : 'text-rose-400'} />
                  <span>Correções</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
                    {counts.fixes}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('improvements')}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                    activeTab === 'improvements'
                      ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-600/40'
                      : 'bg-white/5 text-slate-400 hover:text-cyan-300 hover:bg-white/10'
                  }`}
                >
                  <Zap size={11} className={activeTab === 'improvements' ? 'text-white' : 'text-cyan-400'} />
                  <span>Melhorias</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
                    {counts.improvements}
                  </span>
                </button>
              </div>

              {/* Lista com Rolagem Fluida e Itens Estruturados */}
              <div className="space-y-2 max-h-[190px] sm:max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                {filteredNotes.map((note) => {
                  const isFix = note.category === 'fixes';
                  const isFeature = note.category === 'features';
                  return (
                    <div
                      key={note.id}
                      className="group/item p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-indigo-500/25 transition-all text-left space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${
                            isFix ? 'bg-rose-500/20 text-rose-400' : isFeature ? 'bg-emerald-500/20 text-emerald-400' : 'bg-cyan-500/20 text-cyan-400'
                          }`}>
                            {isFix ? <Wrench size={12} /> : isFeature ? <Rocket size={12} /> : <Zap size={12} />}
                          </div>
                          <span className="font-bold text-[12px] text-white tracking-tight truncate">
                            {note.title}
                          </span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border shrink-0 font-mono ${note.badgeColor}`}>
                          {note.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8696a0] leading-relaxed pl-7">
                        {note.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rodapé de Ações de Atualização */}
          <div className="pt-1 flex items-center gap-2.5">
            <button
              onClick={handleUpdate}
              disabled={isUpdating}
              className={`flex-1 h-11 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all duration-200 shadow-md active:scale-95 ${
                isUpdating
                  ? 'bg-indigo-700/80 text-white/90 cursor-wait shadow-none'
                  : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-600/30 hover:shadow-indigo-600/40 hover:shadow-lg'
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
                className="h-11 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white text-xs font-semibold border border-white/5 transition-all active:scale-95 shrink-0"
              >
                Depois
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

