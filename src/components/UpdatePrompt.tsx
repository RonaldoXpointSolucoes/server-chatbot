import React, { useState, useEffect, useMemo } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles,
  RefreshCw,
  X,
  CheckCircle2,
  Zap,
  ShieldCheck,
  ArrowUpRight,
  Clock,
  ChevronRight,
  Map,
  Camera,
  Target,
  Play,
  Compass,
  FlaskConical,
  Maximize2,
  Minimize2,
  MessageSquare,
  Workflow,
  Search,
  MousePointerClick,
  LayoutGrid
} from 'lucide-react';
import { APP_RELEASES, getDeltaReleaseNotes, ReleaseNoteItem, FeatureGuideSpec } from '../data/releaseNotes';
import { BaileysInstanceHubModal } from './modals/BaileysInstanceHubModal';
import { useChatStore } from '../store/chatStore';

type TabType = 'mindmap' | 'all' | 'chat' | 'typebot' | 'hub';

/**
 * Renderizador de Print Visual Anotado ("Onde Clicar na Tela") com layout amplo e espaçado.
 * Reproduz a barra/tela real do ChatBoot destacando os botões vizinhos e o botão-alvo com "👆 CLIQUE AQUI".
 */
const AnnotatedScreenPrint: React.FC<{
  guide: FeatureGuideSpec;
  onTriggerAction?: () => void;
}> = ({ guide, onTriggerAction }) => {
  const { uiSnapshot } = guide;
  const variant = uiSnapshot.visualPreviewVariant;

  return (
    <div className="rounded-2xl overflow-hidden border border-emerald-500/35 bg-[#070d12] shadow-lg">
      {/* Barra de Título do Print simulando a janela real do sistema */}
      <div className="px-4 py-2.5 bg-[#0f171e] border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <Camera size={14} className="text-emerald-400 ml-1 shrink-0" />
          <span className="text-xs font-mono font-bold text-slate-200">
            {uiSnapshot.screenTitle}
          </span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
          📸 Print Interativo — Onde Clicar
        </span>
      </div>

      {/* Área Visual da Tela Reproduzida com bastante respiro */}
      <div className="p-4 sm:p-5 bg-gradient-to-b from-[#0b141a] to-[#080f14] space-y-3">
        {variant.startsWith('hub-') ? (
          <div className="space-y-3">
            {/* Topo do Modal Central Baileys v7 */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-[#111b21] border border-white/10 text-xs">
              <div className="flex items-center gap-2 text-white font-bold">
                <Zap size={14} className="text-emerald-400" />
                <span>Central Avançada WhatsApp Business & Baileys v7</span>
              </div>
              <span className="text-[11px] text-emerald-400 font-mono font-semibold">
                ● Instância Conectada
              </span>
            </div>

            {/* Barra de 5 Abas da Central Baileys */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'catalog', label: '1. 🛍️ Catálogo & GastroFood' },
                { key: 'business', label: '2. 🏪 Perfil Business' },
                { key: 'shortcuts', label: '3. ⚡ Atalhos & CRM' },
                { key: 'security', label: '4. 🛡️ Segurança & Ligações' },
                { key: 'profile', label: '5. 👤 Perfil & Privacidade' }
              ].map(tab => {
                const isActiveTab =
                  (variant === 'hub-catalog-gastrofood' && tab.key === 'catalog') ||
                  (variant === 'hub-business-profile' && tab.key === 'business') ||
                  ((variant === 'hub-quick-replies' || variant === 'hub-labels-crm') && tab.key === 'shortcuts') ||
                  ((variant === 'hub-account-limits' || variant === 'hub-reject-calls') && tab.key === 'security') ||
                  ((variant === 'hub-instance-profile' || variant === 'hub-privacy-settings') && tab.key === 'profile');

                return (
                  <span
                    key={tab.key}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                      isActiveTab
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-sm ring-1 ring-emerald-400/40'
                        : 'bg-white/5 text-slate-400 border-white/5 opacity-65'
                    }`}
                  >
                    {tab.label}
                  </span>
                );
              })}
            </div>

            {/* Destaque do Botão Alvo dentro da Aba */}
            <div className="p-3.5 rounded-xl bg-[#131f28] border border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-400 font-medium mr-1">Elementos ao redor:</span>
                {uiSnapshot.contextElements.map((ctx, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300"
                  >
                    {ctx}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={onTriggerAction}
                className="relative group inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-black text-xs shadow-[0_0_25px_rgba(16,185,129,0.45)] ring-2 ring-amber-300 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
              >
                <MousePointerClick size={15} className="text-slate-950 stroke-[2.5]" />
                <span>{uiSnapshot.targetButtonLabel}</span>
                <span className="ml-1 px-2 py-0.5 rounded-md bg-slate-950 text-amber-300 text-[10px] font-black uppercase">
                  👆 Clique Aqui
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Simulação visual da Barra do Chat ou Typebot */}
            <div className="p-3.5 rounded-xl bg-[#111b21] border border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-400 font-medium mr-1">Botões vizinhos na barra:</span>
                {uiSnapshot.contextElements.map((ctx, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-lg bg-[#202c33] border border-white/10 text-xs text-slate-300 font-medium"
                  >
                    {ctx}
                  </span>
                ))}
              </div>

              {/* Botão Alvo com Callout Pulsante */}
              <button
                type="button"
                onClick={onTriggerAction}
                className="relative inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 via-emerald-400 to-teal-400 text-slate-950 font-black text-xs shadow-[0_0_25px_rgba(16,185,129,0.45)] ring-2 ring-white/80 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all"
              >
                <MousePointerClick size={15} className="text-slate-950 stroke-[2.5]" />
                <span>{uiSnapshot.targetButtonLabel}</span>
                <span className="ml-1 px-2 py-0.5 rounded-md bg-slate-950 text-emerald-300 text-[10px] font-black uppercase">
                  👆 Clique Aqui
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Legenda explicativa da posição exata no print */}
        <div className="flex items-center gap-2 text-xs text-slate-300 bg-white/[0.03] px-3 py-2 rounded-lg border border-white/5">
          <span>📍</span>
          <span>
            <strong className="text-emerald-300">Localização exata na tela:</strong> {uiSnapshot.targetButtonPosition}
          </span>
        </div>
      </div>
    </div>
  );
};

export function UpdatePrompt() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentRunningVersion = import.meta.env.PACKAGE_VERSION || '8.1.3';
  const rawBuildDate = import.meta.env.PACKAGE_BUILD_DATE || import.meta.env.VITE_PACKAGE_BUILD_DATE;
  const tenantInfo = useChatStore(state => state.tenantInfo);
  const activeChannelFilter = useChatStore(state => state.activeChannelFilter);
  const connectedInstanceName = useChatStore(state => state.connectedInstanceName);

  const [installedVersion, setInstalledVersion] = useState<string>(() => {
    return localStorage.getItem('chatboot_installed_version') || '8.1.2';
  });
  const [targetVersion, setTargetVersion] = useState<string>(APP_RELEASES[0]?.version || currentRunningVersion);
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNoteItem[]>(APP_RELEASES[0]?.notes || []);

  // Estado manual/pós-update para permitir abrir o Guia & Mapa Mental a qualquer momento
  const [isManualHubOpen, setIsManualHubOpen] = useState<boolean>(() => {
    const seenKey = `chatboot_seen_guide_${APP_RELEASES[0]?.version || '8.1.3'}`;
    return localStorage.getItem(seenKey) !== 'true';
  });

  // Abre por padrão em modo amplo (panorâmico) para nunca espremer os textos!
  const [isMinimizedCorner, setIsMinimizedCorner] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabType>('mindmap');
  const [selectedFeatureId, setSelectedFeatureId] = useState<string>('baileys-v7-01');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updatePhase, setUpdatePhase] = useState<'idle' | 'updating' | 'reloading'>('idle');

  // Hub Baileys embutido para abrir diretamente qualquer uma das abas com 1 clique
  const [hubModalOpen, setHubModalOpen] = useState(false);
  const [hubInitialTab, setHubInitialTab] = useState<'profile' | 'business' | 'catalog' | 'shortcuts' | 'security'>('catalog');

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      if (r) {
        const checkUpdate = async () => {
          if (!navigator.onLine) return;
          try {
            await r.update();
          } catch {
            // Silencioso se offline
          }
        };

        const intervalId = setInterval(checkUpdate, 45 * 1000);
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            checkUpdate();
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

  useEffect(() => {
    if (!needRefresh) {
      localStorage.setItem('chatboot_installed_version', currentRunningVersion);
    }
  }, [needRefresh, currentRunningVersion]);

  // Expor gatilhos globais para abrir o Mapa Mental & Guia de Novidades de qualquer botão do app
  useEffect(() => {
    (window as any).__triggerUpdatePrompt = (force: boolean = true, mockFromVersion?: string) => {
      if (mockFromVersion) {
        setInstalledVersion(mockFromVersion);
        localStorage.setItem('chatboot_installed_version', mockFromVersion);
      }
      setNeedRefresh(force);
      setIsMinimizedCorner(false);
      setIsManualHubOpen(true);
    };

    (window as any).__openReleaseNotesHub = (initialView: TabType = 'mindmap') => {
      setActiveTab(initialView);
      setIsMinimizedCorner(false);
      setIsManualHubOpen(true);
    };

    const handleCustomOpen = (ev: Event) => {
      const customEv = ev as CustomEvent;
      setActiveTab(customEv.detail?.tab || 'mindmap');
      setIsMinimizedCorner(false);
      setIsManualHubOpen(true);
    };

    window.addEventListener('open-release-notes-hub', handleCustomOpen);
    return () => {
      delete (window as any).__triggerUpdatePrompt;
      delete (window as any).__openReleaseNotesHub;
      window.removeEventListener('open-release-notes-hub', handleCustomOpen);
    };
  }, [setNeedRefresh]);

  useEffect(() => {
    if (!needRefresh && !isManualHubOpen) return;

    let isMounted = true;

    const resolveDelta = async () => {
      let resolvedTarget = APP_RELEASES[0]?.version || currentRunningVersion;

      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.version) {
            resolvedTarget = data.version;
          }
        }
      } catch {
        // Fallback local
      }

      if (!isMounted) return;

      const currentStored = localStorage.getItem('chatboot_installed_version') || installedVersion;
      const delta = getDeltaReleaseNotes(currentStored, resolvedTarget);

      // Se a versão anterior for igual à atual, mostra a versão imediatamente anterior do catálogo para clareza visual
      const fallbackPrevious = APP_RELEASES[1]?.version || '8.1.2';
      setInstalledVersion(delta.fromVersion === delta.targetVersion ? fallbackPrevious : delta.fromVersion);
      setTargetVersion(delta.targetVersion);
      setReleaseNotes(delta.notes.length > 0 ? delta.notes : APP_RELEASES[0].notes);
    };

    resolveDelta();

    return () => {
      isMounted = false;
    };
  }, [needRefresh, isManualHubOpen, installedVersion, currentRunningVersion]);

  const close = () => {
    if (isUpdating) return;
    const seenKey = `chatboot_seen_guide_${APP_RELEASES[0]?.version || '8.1.3'}`;
    localStorage.setItem(seenKey, 'true');
    setNeedRefresh(false);
    setIsManualHubOpen(false);
  };

  const handleUpdate = async () => {
    if (isUpdating) return;
    const seenKey = `chatboot_seen_guide_${APP_RELEASES[0]?.version || '8.1.3'}`;
    localStorage.setItem(seenKey, 'true');

    if (!needRefresh) {
      setIsManualHubOpen(false);
      return;
    }

    setIsUpdating(true);
    setUpdatePhase('updating');
    localStorage.setItem('chatboot_installed_version', targetVersion);

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

  const handleQuickAction = (note: ReleaseNoteItem) => {
    const qa = note.guide?.quickAction;
    if (!qa) return;

    if (qa.openBaileysHubTab) {
      setHubInitialTab(qa.openBaileysHubTab);
      setHubModalOpen(true);
      return;
    }

    if (qa.route) {
      setIsManualHubOpen(false);
      if (location.pathname !== qa.route) {
        navigate(qa.route);
      }
      if (qa.chatAction) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('open-baileys-feature', {
              detail: { action: qa.chatAction, featureNumber: note.guide?.featureNumber, title: note.title }
            })
          );
        }, 250);
      }
    }
  };

  const filteredNotes = useMemo(() => {
    return releaseNotes.filter(n => {
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchTitle = n.title.toLowerCase().includes(q);
        const matchDesc = n.description.toLowerCase().includes(q);
        const matchPurpose = n.guide?.purpose?.toLowerCase().includes(q);
        const matchAccess = n.guide?.whereToAccess?.some(w => w.toLowerCase().includes(q));
        if (!matchTitle && !matchDesc && !matchPurpose && !matchAccess) return false;
      }

      if (activeTab === 'all' || activeTab === 'mindmap') return true;
      const group = n.guide?.moduleGroup || '';
      if (activeTab === 'chat') return group.startsWith('chat-');
      if (activeTab === 'typebot') return group === 'typebot-flow';
      if (activeTab === 'hub') return group.startsWith('baileys-hub-');
      return true;
    });
  }, [releaseNotes, activeTab, searchTerm]);

  const counts = useMemo(() => {
    return {
      all: releaseNotes.length,
      chat: releaseNotes.filter(n => n.guide?.moduleGroup?.startsWith('chat-')).length,
      typebot: releaseNotes.filter(n => n.guide?.moduleGroup === 'typebot-flow').length,
      hub: releaseNotes.filter(n => n.guide?.moduleGroup?.startsWith('baileys-hub-')).length,
    };
  }, [releaseNotes]);

  const selectedFeatureNote = useMemo(() => {
    return releaseNotes.find(n => n.id === selectedFeatureId) || releaseNotes[0];
  }, [releaseNotes, selectedFeatureId]);

  const buildDateStr = useMemo(() => {
    if (!rawBuildDate) return 'Recém-compilada';
    const d = new Date(rawBuildDate);
    if (isNaN(d.getTime())) return 'Recém-compilada';
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [rawBuildDate]);

  const isPublicScreen =
    location.pathname === '/' ||
    location.pathname === '/login' ||
    location.pathname.startsWith('/voucher/') ||
    location.pathname.startsWith('/totem');

  const shouldRenderCard = needRefresh || (isManualHubOpen && !isPublicScreen);

  return (
    <>
      {/* Modal da Central Baileys v7 conectado diretamente ao Guia para abertura em 1 clique */}
      <BaileysInstanceHubModal
        isOpen={hubModalOpen}
        onClose={() => setHubModalOpen(false)}
        tenantId={tenantInfo?.id || localStorage.getItem('current_tenant_id') || ''}
        instanceId={activeChannelFilter || ''}
        instanceName={connectedInstanceName || ''}
        initialTab={hubInitialTab}
      />

      {shouldRenderCard && isMinimizedCorner ? (
        /* MODO PÍLULA MINIMIZADA NO CANTO SUPERIOR DIREITO (NÃO OCUPA A TELA) */
        <div className="fixed top-4 right-4 z-[99998] animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-[#0b141a]/95 backdrop-blur-xl border border-emerald-500/40 shadow-[0_15px_40px_rgba(0,0,0,0.7)] text-white">
            <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
            <div className="text-xs">
              <span className="font-black text-white">v{targetVersion}</span>
              <span className="text-slate-400 mx-1.5">•</span>
              <span className="text-emerald-300 font-bold">18 Novidades c/ Prints</span>
            </div>
            <button
              type="button"
              onClick={() => setIsMinimizedCorner(false)}
              className="px-3 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] flex items-center gap-1 cursor-pointer active:scale-95 transition"
            >
              <Maximize2 size={12} />
              <span>Abrir Mapa Mental</span>
            </button>
            <button
              type="button"
              onClick={close}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              title="Fechar"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : shouldRenderCard ? (
        /* MODO ESTÚDIO AMPLO E ESPAÇADO POR PADRÃO (ZERO INFORMAÇÕES ESPREMIDAS) */
        <div className="fixed inset-0 z-[99998] bg-black/75 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 lg:p-6 animate-in fade-in duration-200">
          <div className="relative w-full max-w-[1240px] h-[92vh] max-h-[880px] overflow-hidden rounded-3xl bg-[#0b141a] border border-emerald-500/35 shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_45px_rgba(16,185,129,0.16)] text-[#e9edef] flex flex-col">
            {/* Barra de Gradiente no Topo */}
            <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 shrink-0" />

            {/* CABEÇALHO AMPLO E LIMPO */}
            <div className="px-5 py-4 border-b border-white/10 shrink-0 bg-[#0d171f]">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/25 to-teal-500/10 border border-emerald-500/40 flex items-center justify-center shadow-inner">
                      <Sparkles className="w-6 h-6 text-emerald-400 animate-pulse" />
                    </div>
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-[#0b141a]"></span>
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="font-black text-base sm:text-lg tracking-tight text-white">
                        {needRefresh
                          ? 'Nova Atualização Disponível — Mapa Mental & Guia Visual'
                          : '🎉 Sistema Atualizado — Mapa Mental & Guia com Prints das 18 Funções'}
                      </h2>
                      <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        18 Novidades Documentadas
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                      <span className="text-slate-400 font-mono">v{installedVersion}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-extrabold font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                        v{targetVersion}
                      </span>
                      <span className="text-slate-400 flex items-center gap-1 ml-1">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {buildDateStr}
                      </span>
                      <span className="hidden md:inline text-slate-500">•</span>
                      <span className="hidden md:inline text-slate-300">
                        Selecione qualquer função à esquerda para ver o <strong className="text-amber-300">Print de Onde Clicar</strong>, a <strong className="text-emerald-300">Proposta</strong> e <strong className="text-cyan-300">Como Testar</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ações do Topo: Abrir Central Baileys, Minimizar ou Fechar */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setHubInitialTab('catalog');
                      setHubModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer active:scale-95 transition"
                  >
                    <Zap size={14} />
                    <span>Abrir Central Baileys v7</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMinimizedCorner(true)}
                    className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    title="Minimizar para o canto superior direito"
                  >
                    <Minimize2 size={14} />
                    <span className="hidden sm:inline">Minimizar</span>
                  </button>

                  <button
                    type="button"
                    onClick={close}
                    disabled={isUpdating}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    title="Fechar guia"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* BARRA DE ABAS SEM SCROLLBAR HORIZONTAL (FLEX-WRAP LIMPO) */}
              <div className="flex flex-wrap items-center justify-between gap-3 mt-3.5 pt-3 border-t border-white/5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('mindmap')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      activeTab === 'mindmap'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-md'
                        : 'bg-[#111b21] text-slate-300 hover:text-white border border-white/5'
                    }`}
                  >
                    <Map className="w-4 h-4" />
                    <span>🗺️ Mapa Mental Interativo (18)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'all'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-[#111b21] text-slate-300 hover:text-white border border-white/5'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span>Catálogo Completo ({counts.all})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('chat')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'chat'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-[#111b21] text-slate-300 hover:text-white border border-white/5'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>No Chat ao Vivo ({counts.chat})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('typebot')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'typebot'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-[#111b21] text-slate-300 hover:text-white border border-white/5'
                    }`}
                  >
                    <Workflow className="w-3.5 h-3.5" />
                    <span>No Typebot ({counts.typebot})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('hub')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'hub'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : 'bg-[#111b21] text-slate-300 hover:text-white border border-white/5'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Na Central Baileys v7 ({counts.hub})</span>
                  </button>
                </div>

                {/* Campo de Busca Rápida */}
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar função (ex: cardápio, enquete, chamadas...)"
                    className="w-full bg-[#111b21] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500/50 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* CORPO PRINCIPAL */}
            {activeTab === 'mindmap' ? (
              /* LAYOUT MASTER-DETAIL DE 2 PAINÉIS LADO A LADO:
                 - Esquerda (400px): Árvore do Mapa Mental com títulos 100% legíveis sem cortar
                 - Direita (Flex-1): Print grande + Proposta + Como Acessar + Como Testar sempre visíveis! */
              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
                {/* PAINEL ESQUERDO (5 COLUNAS): ÁRVORE DO MAPA MENTAL ESPAÇADA */}
                <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-white/10 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar bg-[#091116]">
                  {/* GRUPO 1: TELA DE CHAT AO VIVO */}
                  <div className="rounded-2xl bg-[#0e1820] border border-cyan-500/30 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-cyan-300 flex items-center gap-2">
                        <MessageSquare size={15} className="text-cyan-400 shrink-0" />
                        <span>1. TELA DE CHAT AO VIVO (/chat)</span>
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 shrink-0">
                        9 Funções
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Funções localizadas no topo da conversa, no botão de anexo (📎) ou no balão da mensagem:
                    </p>
                    <div className="space-y-1.5">
                      {releaseNotes
                        .filter(n => n.guide?.moduleGroup?.startsWith('chat-') && (!searchTerm.trim() || filteredNotes.some(f => f.id === n.id)))
                        .map(n => {
                          const active = selectedFeatureNote?.id === n.id;
                          return (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => setSelectedFeatureId(n.id)}
                              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                active
                                  ? 'bg-cyan-500/20 text-white border border-cyan-400 shadow-md ring-1 ring-cyan-400/30'
                                  : 'bg-[#13202a]/80 text-slate-200 hover:bg-[#182936] border border-white/5'
                              }`}
                            >
                              <span className="leading-snug">{n.title}</span>
                              <ChevronRight size={15} className={`shrink-0 ${active ? 'text-cyan-300 translate-x-0.5' : 'text-slate-500'}`} />
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* GRUPO 2: CONSTRUTOR DE FLUXOS TYPEBOT */}
                  <div className="rounded-2xl bg-[#0e1820] border border-amber-500/30 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-amber-300 flex items-center gap-2">
                        <Workflow size={15} className="text-amber-400 shrink-0" />
                        <span>2. CONSTRUTOR TYPEBOT (/flows)</span>
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 shrink-0">
                        Enquetes & NPS
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {releaseNotes
                        .filter(n => n.guide?.moduleGroup === 'typebot-flow' && (!searchTerm.trim() || filteredNotes.some(f => f.id === n.id)))
                        .map(n => {
                          const active = selectedFeatureNote?.id === n.id;
                          return (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => setSelectedFeatureId(n.id)}
                              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                active
                                  ? 'bg-amber-500/20 text-white border border-amber-400 shadow-md ring-1 ring-amber-400/30'
                                  : 'bg-[#13202a]/80 text-slate-200 hover:bg-[#182936] border border-white/5'
                              }`}
                            >
                              <span className="leading-snug">{n.title}</span>
                              <ChevronRight size={15} className={`shrink-0 ${active ? 'text-amber-300 translate-x-0.5' : 'text-slate-500'}`} />
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* GRUPO 3: CENTRAL BAILEYS V7 (5 ABAS) */}
                  <div className="rounded-2xl bg-[#0e1820] border border-purple-500/30 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-purple-300 flex items-center gap-2">
                        <Zap size={15} className="text-purple-400 shrink-0" />
                        <span>3. CENTRAL BAILEYS v7 (5 ABAS)</span>
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 shrink-0">
                        8 Funções
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Acessíveis clicando no botão <strong className="text-white">"⚡ Baileys v7"</strong> no topo do Chat ou em Conexões:
                    </p>
                    <div className="space-y-1.5">
                      {releaseNotes
                        .filter(n => n.guide?.moduleGroup?.startsWith('baileys-hub-') && (!searchTerm.trim() || filteredNotes.some(f => f.id === n.id)))
                        .map(n => {
                          const active = selectedFeatureNote?.id === n.id;
                          return (
                            <button
                              key={n.id}
                              type="button"
                              onClick={() => setSelectedFeatureId(n.id)}
                              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                active
                                  ? 'bg-purple-500/20 text-white border border-purple-400 shadow-md ring-1 ring-purple-400/30'
                                  : 'bg-[#13202a]/80 text-slate-200 hover:bg-[#182936] border border-white/5'
                              }`}
                            >
                              <span className="leading-snug">{n.title}</span>
                              <ChevronRight size={15} className={`shrink-0 ${active ? 'text-purple-300 translate-x-0.5' : 'text-slate-500'}`} />
                            </button>
                          );
                        })}
                    </div>
                  </div>
                </div>

                {/* PAINEL DIREITO (7 COLUNAS): DETALHAMENTO AMPLO COM PRINT, PROPOSTA, ACESSO E TESTE */}
                <div className="lg:col-span-7 overflow-y-auto p-5 sm:p-6 space-y-5 custom-scrollbar bg-[#0b141a]">
                  {selectedFeatureNote && selectedFeatureNote.guide && (
                    <div className="space-y-5 animate-in fade-in duration-150">
                      {/* Cabeçalho da Funcionalidade Selecionada */}
                      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-white/10">
                        <div className="space-y-2 flex-1 min-w-[260px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs uppercase tracking-wide">
                              {selectedFeatureNote.tag}
                            </span>
                            <span className="px-3 py-1 rounded-lg bg-white/10 text-emerald-300 font-bold text-xs">
                              📍 {selectedFeatureNote.guide.moduleLabel}
                            </span>
                          </div>
                          <h3 className="text-lg sm:text-xl font-black text-white leading-snug">
                            {selectedFeatureNote.title}
                          </h3>
                          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                            {selectedFeatureNote.description}
                          </p>
                        </div>

                        {selectedFeatureNote.guide.quickAction && (
                          <button
                            type="button"
                            onClick={() => handleQuickAction(selectedFeatureNote)}
                            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-[0_10px_25px_rgba(16,185,129,0.3)] cursor-pointer active:scale-95 transition shrink-0"
                          >
                            <Play size={16} className="fill-slate-950" />
                            <span>{selectedFeatureNote.guide.quickAction.label}</span>
                          </button>
                        )}
                      </div>

                      {/* PRINT VISUAL ANOTADO ONDE CLICAR */}
                      <AnnotatedScreenPrint
                        guide={selectedFeatureNote.guide}
                        onTriggerAction={() => handleQuickAction(selectedFeatureNote)}
                      />

                      {/* 3 CARTÕES ESPAÇADOS E CONFORTÁVEIS DE LEITURA */}
                      <div className="grid grid-cols-1 gap-4">
                        {/* 1. Qual a Proposta */}
                        <div className="p-4 rounded-2xl bg-[#101c24] border border-emerald-500/25 space-y-1.5">
                          <div className="flex items-center gap-2 text-emerald-400 font-black text-xs uppercase tracking-wider">
                            <Target size={15} />
                            <span>1. Qual a Proposta (O que esta função faz)</span>
                          </div>
                          <p className="text-xs sm:text-[13px] text-slate-200 leading-relaxed">
                            {selectedFeatureNote.guide.purpose}
                          </p>
                        </div>

                        {/* 2. Como Acessar / Onde Clicar & 3. Como Testar */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 rounded-2xl bg-[#101c24] border border-cyan-500/25 space-y-2">
                            <div className="flex items-center gap-2 text-cyan-400 font-black text-xs uppercase tracking-wider">
                              <Compass size={15} />
                              <span>2. Como Acessar (Onde Clicar)</span>
                            </div>
                            <ul className="space-y-2 text-xs sm:text-[13px] text-slate-200">
                              {selectedFeatureNote.guide.whereToAccess.map((step, idx) => (
                                <li key={idx} className="leading-relaxed bg-white/[0.03] px-3 py-2 rounded-xl border border-white/5">
                                  {step}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="p-4 rounded-2xl bg-[#101c24] border border-amber-500/25 space-y-2">
                            <div className="flex items-center gap-2 text-amber-400 font-black text-xs uppercase tracking-wider">
                              <FlaskConical size={15} />
                              <span>3. Como Testar na Prática</span>
                            </div>
                            <ul className="space-y-2 text-xs sm:text-[13px] text-slate-200">
                              {selectedFeatureNote.guide.howToTest.map((step, idx) => (
                                <li key={idx} className="leading-relaxed bg-white/[0.03] px-3 py-2 rounded-xl border border-white/5">
                                  {step}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* MODO CATÁLOGO COMPLETO EM LISTA ESPAÇADA */
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar space-y-5 bg-[#091116]">
                {filteredNotes.map(note => (
                  <div
                    key={note.id}
                    className="p-5 rounded-3xl bg-[#0e1820] border border-white/10 hover:border-emerald-500/40 transition-all space-y-4 shadow-lg"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1.5 max-w-3xl">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${note.badgeColor}`}>
                            {note.tag}
                          </span>
                          {note.guide && (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white/5 text-cyan-300 border border-white/10">
                              📍 {note.guide.moduleLabel}
                            </span>
                          )}
                        </div>
                        <h4 className="text-base sm:text-lg font-black text-white leading-snug">
                          {note.title}
                        </h4>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                          {note.description}
                        </p>
                      </div>

                      {note.guide?.quickAction && (
                        <button
                          type="button"
                          onClick={() => handleQuickAction(note)}
                          className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-md cursor-pointer active:scale-95 transition shrink-0"
                        >
                          <Play size={14} className="fill-slate-950" />
                          <span>{note.guide.quickAction.label}</span>
                        </button>
                      )}
                    </div>

                    {note.guide && (
                      <>
                        <AnnotatedScreenPrint
                          guide={note.guide}
                          onTriggerAction={() => handleQuickAction(note)}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
                          <div className="p-3.5 rounded-2xl bg-[#0b1319] border border-emerald-500/20">
                            <span className="text-xs font-black uppercase text-emerald-400 block mb-1.5">
                              🎯 1. Qual a Proposta
                            </span>
                            <p className="text-xs sm:text-[13px] text-slate-200 leading-relaxed">
                              {note.guide.purpose}
                            </p>
                          </div>
                          <div className="p-3.5 rounded-2xl bg-[#0b1319] border border-cyan-500/20">
                            <span className="text-xs font-black uppercase text-cyan-400 block mb-1.5">
                              🧭 2. Como Acessar (Onde Clicar)
                            </span>
                            <ul className="space-y-1.5 text-xs sm:text-[13px] text-slate-200">
                              {note.guide.whereToAccess.map((st, i) => (
                                <li key={i} className="leading-relaxed">{st}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="p-3.5 rounded-2xl bg-[#0b1319] border border-amber-500/20">
                            <span className="text-xs font-black uppercase text-amber-400 block mb-1.5">
                              🧪 3. Como Testar
                            </span>
                            <ul className="space-y-1.5 text-xs sm:text-[13px] text-slate-200">
                              {note.guide.howToTest.map((st, i) => (
                                <li key={i} className="leading-relaxed">{st}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* RODAPÉ */}
            <div className="px-5 py-3.5 bg-[#080f14] border-t border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>
                  Você pode reabrir este Mapa Mental a qualquer momento clicando em{' '}
                  <strong className="text-emerald-300">"🗺️ Mapa Mental (18 Novidades)"</strong> na barra superior.
                </span>
              </div>

              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={close}
                  disabled={isUpdating}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Fechar Guia
                </button>

                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={isUpdating}
                  className="px-5 py-2.5 rounded-xl text-xs font-black text-[#0b141a] bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400 hover:from-emerald-300 hover:to-teal-300 shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all duration-200 flex items-center gap-2 disabled:opacity-75 cursor-pointer active:scale-95"
                >
                  <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
                  <span>
                    {updatePhase === 'updating'
                      ? 'Aplicando atualização...'
                      : updatePhase === 'reloading'
                      ? 'Recarregando sistema...'
                      : needRefresh
                      ? 'Atualizar Sistema Agora'
                      : 'Entendi • Concluir Leitura'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
