import React, { useState, useEffect, useMemo } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles,
  RefreshCw,
  X,
  CheckCircle2,
  Wrench,
  Zap,
  Layers,
  ShieldCheck,
  ArrowUpRight,
  Clock,
  ChevronRight,
  ChevronDown,
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
  Smartphone,
  Pin,
  BarChart3,
  Video,
  Image as ImageIcon,
  Eye,
  ShoppingBag,
  Store,
  Tag,
  Star,
  Archive,
  History,
  Ban,
  PhoneOff,
  User,
  Lock,
  Search,
  ExternalLink,
  MousePointerClick
} from 'lucide-react';
import { APP_RELEASES, getDeltaReleaseNotes, ReleaseNoteItem, FeatureGuideSpec } from '../data/releaseNotes';
import { BaileysInstanceHubModal } from './modals/BaileysInstanceHubModal';
import { useChatStore } from '../store/chatStore';

type TabType = 'mindmap' | 'all' | 'chat' | 'typebot' | 'hub';

/**
 * Renderizador de Print Visual Anotado ("Onde Clicar na Tela") para cada uma das 18 funcionalidades.
 * Reproduz fielmente a barra/tela real do ChatBoot destacando os botões vizinhos e o botão-alvo com "👆 CLIQUE AQUI".
 */
const AnnotatedScreenPrint: React.FC<{
  guide: FeatureGuideSpec;
  onTriggerAction?: () => void;
}> = ({ guide, onTriggerAction }) => {
  const { uiSnapshot } = guide;
  const variant = uiSnapshot.visualPreviewVariant;

  return (
    <div className="rounded-xl overflow-hidden border border-emerald-500/30 bg-[#070d12] shadow-inner">
      {/* Barra de Título do Print simulando a janela real do sistema */}
      <div className="px-3 py-1.5 bg-[#0f171e] border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-rose-500/80 shrink-0" />
          <span className="w-2 h-2 rounded-full bg-amber-500/80 shrink-0" />
          <span className="w-2 h-2 rounded-full bg-emerald-500/80 shrink-0" />
          <Camera size={11} className="text-emerald-400 ml-1 shrink-0" />
          <span className="text-[10px] font-mono font-bold text-slate-300 truncate">
            PRINT GUIA: {uiSnapshot.screenTitle}
          </span>
        </div>
        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
          Onde Clicar
        </span>
      </div>

      {/* Área Visual da Tela Reproduzida */}
      <div className="p-3 bg-gradient-to-b from-[#0b141a] to-[#080f14] relative">
        {/* Representação visual contextual conforme a área do sistema */}
        {variant.startsWith('hub-') ? (
          <div className="space-y-2">
            {/* Topo do Modal Central Baileys v7 */}
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#111b21] border border-white/10 text-[10px]">
              <div className="flex items-center gap-1.5 text-white font-bold">
                <Zap size={12} className="text-emerald-400" />
                <span>Central Avançada WhatsApp Business & Baileys v7</span>
              </div>
              <span className="text-[9px] text-emerald-400 font-mono">Instância Conectada ●</span>
            </div>
            {/* Barra de 5 Abas da Central Baileys */}
            <div className="flex flex-wrap items-center gap-1 px-1">
              {[
                { id: 'hub-catalog-gastrofood', label: '🛍️ Catálogo & GastroFood' },
                { id: 'hub-business-profile', label: '🏪 Perfil Business' },
                { id: 'hub-quick-replies', label: '⚡ Atalhos & CRM' },
                { id: 'hub-labels-crm', label: '⚡ Atalhos & CRM' },
                { id: 'hub-account-limits', label: '🛡️ Segurança & Ligações' },
                { id: 'hub-reject-calls', label: '🛡️ Segurança & Ligações' },
                { id: 'hub-instance-profile', label: '👤 Perfil & Privacidade' },
                { id: 'hub-privacy-settings', label: '👤 Perfil & Privacidade' }
              ]
                .filter((v, idx, arr) => arr.findIndex(x => x.label === v.label) === idx)
                .map((tab, idx) => {
                  const isActiveTab =
                    (variant === 'hub-catalog-gastrofood' && tab.label.includes('Catálogo')) ||
                    (variant === 'hub-business-profile' && tab.label.includes('Business')) ||
                    ((variant === 'hub-quick-replies' || variant === 'hub-labels-crm') && tab.label.includes('Atalhos')) ||
                    ((variant === 'hub-account-limits' || variant === 'hub-reject-calls') && tab.label.includes('Segurança')) ||
                    ((variant === 'hub-instance-profile' || variant === 'hub-privacy-settings') && tab.label.includes('Privacidade'));
                  return (
                    <span
                      key={idx}
                      className={`px-2 py-1 rounded-md text-[9.5px] font-bold border ${
                        isActiveTab
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-sm'
                          : 'bg-white/5 text-slate-400 border-white/5 opacity-60'
                      }`}
                    >
                      {tab.label}
                    </span>
                  );
                })}
            </div>
            {/* Destaque do Botão Alvo dentro da Aba */}
            <div className="mt-1 p-2.5 rounded-xl bg-[#131f28] border border-white/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {uiSnapshot.contextElements.map((ctx, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[10px] text-slate-300"
                  >
                    {ctx}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={onTriggerAction}
                className="relative group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black text-[11px] shadow-[0_0_20px_rgba(16,185,129,0.5)] ring-2 ring-amber-300 animate-pulse hover:animate-none cursor-pointer"
              >
                <MousePointerClick size={13} className="text-slate-950 stroke-[2.5]" />
                <span>{uiSnapshot.targetButtonLabel}</span>
                <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-950 text-amber-300 text-[8.5px] font-black uppercase">
                  👆 Clique Aqui
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Simulação visual da Barra do Chat ou Typebot */}
            <div className="p-2.5 rounded-xl bg-[#111b21] border border-white/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {uiSnapshot.contextElements.map((ctx, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded-lg bg-[#202c33] border border-white/10 text-[10px] text-slate-300 font-medium"
                  >
                    {ctx}
                  </span>
                ))}
              </div>

              {/* Botão Alvo com Callout Pulsante */}
              <button
                type="button"
                onClick={onTriggerAction}
                className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 via-emerald-400 to-teal-400 text-slate-950 font-black text-[11px] shadow-[0_0_20px_rgba(16,185,129,0.45)] ring-2 ring-white/80 cursor-pointer hover:scale-[1.02] transition-transform"
              >
                <MousePointerClick size={13} className="text-slate-950 stroke-[2.5]" />
                <span>{uiSnapshot.targetButtonLabel}</span>
                <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-950 text-emerald-300 text-[8.5px] font-black uppercase">
                  👆 Clique Aqui
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Legenda explicativa da posição exata no print */}
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-400 px-1">
          <span>
            📍 <strong className="text-slate-200">Posição na tela:</strong> {uiSnapshot.targetButtonPosition}
          </span>
        </div>
      </div>
    </div>
  );
};

export function UpdatePrompt() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentRunningVersion = import.meta.env.PACKAGE_VERSION || '8.1.2';
  const rawBuildDate = import.meta.env.PACKAGE_BUILD_DATE || import.meta.env.VITE_PACKAGE_BUILD_DATE;
  const tenantInfo = useChatStore(state => state.tenantInfo);
  const activeChannelFilter = useChatStore(state => state.activeChannelFilter);
  const connectedInstanceName = useChatStore(state => state.connectedInstanceName);

  const [installedVersion, setInstalledVersion] = useState<string>(() => {
    return localStorage.getItem('chatboot_installed_version') || currentRunningVersion;
  });
  const [targetVersion, setTargetVersion] = useState<string>(APP_RELEASES[0]?.version || currentRunningVersion);
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNoteItem[]>(APP_RELEASES[0]?.notes || []);
  const [deltaSummary, setDeltaSummary] = useState<string>(APP_RELEASES[0]?.summary || '');

  // Estado manual/pós-update para permitir abrir o Guia & Mapa Mental a qualquer momento
  const [isManualHubOpen, setIsManualHubOpen] = useState<boolean>(() => {
    const seenKey = `chatboot_seen_guide_${APP_RELEASES[0]?.version || '8.1.3'}`;
    return localStorage.getItem(seenKey) !== 'true';
  });
  const [isExpandedStudio, setIsExpandedStudio] = useState<boolean>(false);
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
      setInstalledVersion(currentRunningVersion);
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
      setIsManualHubOpen(true);
    };

    (window as any).__openReleaseNotesHub = (initialView: TabType = 'mindmap', expand: boolean = true) => {
      setActiveTab(initialView);
      setIsExpandedStudio(expand);
      setIsManualHubOpen(true);
    };

    const handleCustomOpen = (ev: Event) => {
      const customEv = ev as CustomEvent;
      setActiveTab(customEv.detail?.tab || 'mindmap');
      setIsExpandedStudio(customEv.detail?.expand !== false);
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

      setInstalledVersion(delta.fromVersion);
      setTargetVersion(delta.targetVersion);
      setDeltaSummary(delta.summary);
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
    setIsExpandedStudio(false);
  };

  const handleUpdate = async () => {
    if (isUpdating) return;
    const seenKey = `chatboot_seen_guide_${APP_RELEASES[0]?.version || '8.1.3'}`;
    localStorage.setItem(seenKey, 'true');

    if (!needRefresh) {
      // Se já está atualizado e o usuário clicou em "Entendi / Concluir Leitura", apenas fecha ou recarrega suave
      setIsManualHubOpen(false);
      setIsExpandedStudio(false);
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

  // Executa a ação rápida de 1 clique para abrir a funcionalidade escolhida
  const handleQuickAction = (note: ReleaseNoteItem) => {
    const qa = note.guide?.quickAction;
    if (!qa) return;

    if (qa.openBaileysHubTab) {
      setHubInitialTab(qa.openBaileysHubTab);
      setHubModalOpen(true);
      return;
    }

    if (qa.route) {
      setIsExpandedStudio(false);
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

  // Filtragem inteligente por módulo e busca
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

  // Não exibe na tela pública de login ou voucher público se não houver update forçado
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

      {shouldRenderCard && (
        <div
          className={
            isExpandedStudio
              ? 'fixed inset-0 z-[99998] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-5 animate-in fade-in duration-200'
              : 'fixed top-3 left-3 right-3 sm:left-auto sm:top-4 sm:right-4 z-[99998] sm:w-[580px] max-w-full animate-in fade-in slide-in-from-top-5 duration-300'
          }
        >
          <div
            className={`relative overflow-hidden rounded-3xl bg-[#0b141a]/95 backdrop-blur-2xl border border-emerald-500/35 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.85),0_0_40px_rgba(16,185,129,0.18)] text-[#e9edef] flex flex-col transition-all duration-300 ${
              isExpandedStudio ? 'w-full max-w-6xl h-[92vh]' : 'w-full max-h-[88vh]'
            }`}
          >
            {/* Brilho Superior Decorativo */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 shrink-0" />

            {/* CABEÇALHO DO PAINEL DE ATUALIZAÇÃO & MAPA MENTAL */}
            <div className="p-4 sm:p-5 pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative flex-shrink-0">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500/25 to-teal-500/10 border border-emerald-500/40 flex items-center justify-center shadow-inner">
                      <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
                    </div>
                    <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-[#0b141a]"></span>
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-sm sm:text-base tracking-tight text-white">
                        {needRefresh
                          ? 'Nova Atualização Disponível'
                          : '🎉 Sistema Atualizado • Guia Visual & Mapa Mental'}
                      </h3>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        18 Novidades c/ Prints
                      </span>
                    </div>

                    {/* Transição de Versão */}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[11px] text-[#8696a0] font-mono">
                        v{installedVersion}
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-extrabold font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                        v{targetVersion}
                      </span>
                      <span className="text-[10px] text-[#8696a0] flex items-center gap-1 ml-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {buildDateStr}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botões de Expandir Tela Cheia e Fechar */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsExpandedStudio(!isExpandedStudio)}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                    title={isExpandedStudio ? 'Reduzir para card no topo' : 'Expandir Mapa Mental e Prints em Tela Cheia'}
                  >
                    {isExpandedStudio ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                    <span className="hidden sm:inline">
                      {isExpandedStudio ? 'Modo Compacto' : 'Expandir Guia'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    disabled={isUpdating}
                    className="p-2 rounded-xl text-[#8696a0] hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 cursor-pointer"
                    title="Fechar guia de novidades"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Sumário Executivo */}
              <div className="mt-2.5 px-3 py-2 rounded-xl bg-[#111b21]/90 border border-white/5 flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  <span className="font-bold text-emerald-400">Como usar este guia: </span>
                  Clique em qualquer uma das <strong className="text-white">18 funcionalidades</strong> abaixo para ver o{' '}
                  <strong className="text-amber-300">Print de Onde Clicar</strong>, a <strong className="text-emerald-300">Proposta</strong>, o{' '}
                  <strong className="text-cyan-300">Caminho de Acesso</strong>, <strong className="text-purple-300">Como Testar</strong> e abrir em <strong className="text-white">1 Clique</strong>!
                </p>
              </div>

              {/* BARRA DE NAVEGAÇÃO DE MODOS (MAPA MENTAL vs LISTA DE PRINTS POR MÓDULO) */}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                <div className="flex items-center gap-1 bg-[#111b21] p-1 rounded-xl border border-white/5 overflow-x-auto no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setActiveTab('mindmap')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'mindmap'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-sm'
                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Map className="w-3.5 h-3.5" />
                    <span>🗺️ Mapa Mental (18)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'all'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Todos c/ Prints ({counts.all})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('chat')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'chat'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>No Chat ({counts.chat})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('typebot')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'typebot'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Workflow className="w-3 h-3" />
                    <span>No Typebot ({counts.typebot})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('hub')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                      activeTab === 'hub'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'text-[#8696a0] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Zap className="w-3 h-3" />
                    <span>Central Baileys ({counts.hub})</span>
                  </button>
                </div>

                {/* Busca Rápida */}
                {activeTab !== 'mindmap' && (
                  <div className="relative flex-1 min-w-[160px] max-w-xs">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      placeholder="Buscar função (#01, enquete, catálogo...)"
                      className="w-full bg-[#111b21] border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-[11px] text-white placeholder:text-slate-500 focus:border-emerald-500/50 outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* CORPO PRINCIPAL: MODO MAPA MENTAL INTERATIVO OU LISTA COMPLETA DE CARDS COM PRINTS */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar space-y-4">
              {activeTab === 'mindmap' ? (
                <div className="space-y-4">
                  {/* ÁRVORE DO MAPA MENTAL DIVIDIDA NOS 3 LOCAIS DO SISTEMA */}
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#111b21] via-[#0d171e] to-[#111b21] border border-emerald-500/25 shadow-lg">
                    <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <Compass className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-black uppercase tracking-wider text-white">
                          🗺️ Mapa Mental de Localização — Onde estão as 18 Funcionalidades?
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-300 font-semibold">
                        Clique em qualquer item para ver o Print e Testar 👇
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                      {/* RAMO 1: CHAT AO VIVO (/chat) */}
                      <div className="rounded-xl bg-[#0b1319] border border-cyan-500/30 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-cyan-300 flex items-center gap-1.5">
                            <MessageSquare size={13} className="text-cyan-400" />
                            1. TELA DE CHAT AO VIVO (/chat)
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300">
                            9 Funções
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Acessíveis no cabeçalho superior da conversa, na barra inferior de anexo ou passando o mouse na mensagem:
                        </p>
                        <div className="space-y-1">
                          {releaseNotes
                            .filter(n => n.guide?.moduleGroup?.startsWith('chat-'))
                            .map(n => {
                              const active = selectedFeatureNote?.id === n.id;
                              return (
                                <button
                                  key={n.id}
                                  type="button"
                                  onClick={() => setSelectedFeatureId(n.id)}
                                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10.5px] font-semibold transition flex items-center justify-between gap-1.5 cursor-pointer ${
                                    active
                                      ? 'bg-cyan-500/25 text-white border border-cyan-400 shadow-sm'
                                      : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-transparent'
                                  }`}
                                >
                                  <span className="truncate">{n.title}</span>
                                  <ChevronRight size={12} className="shrink-0 text-cyan-400" />
                                </button>
                              );
                            })}
                        </div>
                      </div>

                      {/* RAMO 2: CONSTRUTOR DE FLUXOS TYPEBOT (/flows) */}
                      <div className="rounded-xl bg-[#0b1319] border border-amber-500/30 p-3 space-y-2 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-amber-300 flex items-center gap-1.5">
                              <Workflow size={13} className="text-amber-400" />
                              2. FLUXOS TYPEBOT (/flows)
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                              Enquetes & NPS
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400">
                            Bloco nativo de Enquete Clicável no editor Typebot (com decifragem de voto) + disparador rápido no Chat:
                          </p>
                          <div className="space-y-1">
                            {releaseNotes
                              .filter(n => n.guide?.moduleGroup === 'typebot-flow')
                              .map(n => {
                                const active = selectedFeatureNote?.id === n.id;
                                return (
                                  <button
                                    key={n.id}
                                    type="button"
                                    onClick={() => setSelectedFeatureId(n.id)}
                                    className={`w-full text-left px-2.5 py-2 rounded-lg text-[10.5px] font-semibold transition flex items-center justify-between gap-1.5 cursor-pointer ${
                                      active
                                        ? 'bg-amber-500/25 text-white border border-amber-400 shadow-sm'
                                        : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-transparent'
                                    }`}
                                  >
                                    <span>{n.title}</span>
                                    <ChevronRight size={12} className="shrink-0 text-amber-400" />
                                  </button>
                                );
                              })}
                          </div>
                        </div>

                        {/* Dica Rápida do Atalho Global da Central Baileys */}
                        <div className="p-2.5 rounded-xl bg-gradient-to-r from-purple-500/15 to-emerald-500/15 border border-purple-500/30 space-y-1.5">
                          <div className="text-[10.5px] font-black text-purple-200 flex items-center gap-1.5">
                            <Zap size={12} className="text-emerald-400" />
                            <span>Atalho Direto para a Central Baileys v7:</span>
                          </div>
                          <p className="text-[10px] text-slate-300 leading-relaxed">
                            Você pode abrir a Central das 5 Abas agora mesmo clicando no botão abaixo (sem sair desta tela):
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setHubInitialTab('catalog');
                              setHubModalOpen(true);
                            }}
                            className="w-full py-1.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-black text-[10.5px] flex items-center justify-center gap-1.5 shadow cursor-pointer active:scale-95 transition"
                          >
                            <Zap size={12} />
                            <span>Abrir Central Baileys v7 Agora</span>
                          </button>
                        </div>
                      </div>

                      {/* RAMO 3: CENTRAL BAILEYS V7 (5 ABAS DO CHIP) */}
                      <div className="rounded-xl bg-[#0b1319] border border-purple-500/30 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-purple-300 flex items-center gap-1.5">
                            <Zap size={13} className="text-purple-400" />
                            3. CENTRAL BAILEYS v7 (5 ABAS)
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300">
                            8 Funções
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Clique no botão <strong className="text-white">"⚡ Baileys v7"</strong> no topo do Chat ou em Conexões (/instances):
                        </p>
                        <div className="space-y-1">
                          {releaseNotes
                            .filter(n => n.guide?.moduleGroup?.startsWith('baileys-hub-'))
                            .map(n => {
                              const active = selectedFeatureNote?.id === n.id;
                              return (
                                <button
                                  key={n.id}
                                  type="button"
                                  onClick={() => setSelectedFeatureId(n.id)}
                                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10.5px] font-semibold transition flex items-center justify-between gap-1.5 cursor-pointer ${
                                    active
                                      ? 'bg-purple-500/25 text-white border border-purple-400 shadow-sm'
                                      : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-transparent'
                                  }`}
                                >
                                  <span className="truncate">{n.title}</span>
                                  <ChevronRight size={12} className="shrink-0 text-purple-400" />
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* DETALHAMENTO COMPLETO DA FUNCIONALIDADE SELECIONADA NO MAPA MENTAL */}
                  {selectedFeatureNote && selectedFeatureNote.guide && (
                    <div className="rounded-2xl bg-[#111b21] border-2 border-emerald-500/40 p-4 space-y-4 shadow-xl animate-in fade-in duration-200">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-black text-[10px] uppercase">
                              {selectedFeatureNote.tag}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-md bg-white/10 text-emerald-300 font-bold text-[10px]">
                              📍 {selectedFeatureNote.guide.moduleLabel}
                            </span>
                          </div>
                          <h4 className="text-sm sm:text-base font-black text-white">
                            {selectedFeatureNote.title}
                          </h4>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            {selectedFeatureNote.description}
                          </p>
                        </div>

                        {selectedFeatureNote.guide.quickAction && (
                          <button
                            type="button"
                            onClick={() => handleQuickAction(selectedFeatureNote)}
                            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/25 cursor-pointer active:scale-95 transition shrink-0"
                          >
                            <Play size={14} className="fill-slate-950" />
                            <span>{selectedFeatureNote.guide.quickAction.label}</span>
                          </button>
                        )}
                      </div>

                      {/* PRINT VISUAL ANOTADO ONDE CLICAR */}
                      <AnnotatedScreenPrint
                        guide={selectedFeatureNote.guide}
                        onTriggerAction={() => handleQuickAction(selectedFeatureNote)}
                      />

                      {/* 3 COLUNAS DE OURO: QUAL A PROPOSTA | COMO ACESSAR (ONDE CLICAR) | COMO TESTAR */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* 1. Qual a Proposta */}
                        <div className="p-3 rounded-xl bg-[#0b1319] border border-emerald-500/20 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-emerald-400 font-black text-[11px] uppercase">
                            <Target size={13} />
                            <span>1. Qual a Proposta (O que faz)</span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            {selectedFeatureNote.guide.purpose}
                          </p>
                        </div>

                        {/* 2. Como Acessar / Onde Clicar */}
                        <div className="p-3 rounded-xl bg-[#0b1319] border border-cyan-500/20 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-cyan-400 font-black text-[11px] uppercase">
                            <Compass size={13} />
                            <span>2. Como Acessar (Onde Clicar)</span>
                          </div>
                          <ul className="space-y-1 text-[11px] text-slate-300">
                            {selectedFeatureNote.guide.whereToAccess.map((step, idx) => (
                              <li key={idx} className="leading-relaxed">
                                {step}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* 3. Como Testar na Prática */}
                        <div className="p-3 rounded-xl bg-[#0b1319] border border-amber-500/20 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-amber-400 font-black text-[11px] uppercase">
                            <FlaskConical size={13} />
                            <span>3. Como Testar Passo a Passo</span>
                          </div>
                          <ul className="space-y-1 text-[11px] text-slate-300">
                            {selectedFeatureNote.guide.howToTest.map((step, idx) => (
                              <li key={idx} className="leading-relaxed">
                                {step}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* MODO LISTA COMPLETA COM TODOS OS 18 CARDS, PRINTS, PROPOSTA, ACESSO E TESTE */
                <div className="space-y-4">
                  {filteredNotes.map(note => (
                    <div
                      key={note.id}
                      className="p-4 rounded-2xl bg-[#111b21] border border-white/10 hover:border-emerald-500/40 transition-all space-y-3 shadow-md"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1 max-w-2xl">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${note.badgeColor}`}
                            >
                              {note.tag}
                            </span>
                            {note.guide && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/5 text-cyan-300 border border-white/10">
                                📍 {note.guide.moduleLabel}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-black text-white leading-snug">
                            {note.title}
                          </h4>
                          <p className="text-[11.5px] text-[#8696a0] leading-relaxed">
                            {note.description}
                          </p>
                        </div>

                        {note.guide?.quickAction && (
                          <button
                            type="button"
                            onClick={() => handleQuickAction(note)}
                            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] flex items-center gap-1.5 shadow-md cursor-pointer active:scale-95 transition shrink-0"
                          >
                            <Play size={12} className="fill-slate-950" />
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

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                            <div className="p-2.5 rounded-xl bg-[#0b1319] border border-emerald-500/20">
                              <span className="text-[10px] font-black uppercase text-emerald-400 block mb-1">
                                🎯 Qual a Proposta
                              </span>
                              <p className="text-[11px] text-slate-300 leading-relaxed">
                                {note.guide.purpose}
                              </p>
                            </div>
                            <div className="p-2.5 rounded-xl bg-[#0b1319] border border-cyan-500/20">
                              <span className="text-[10px] font-black uppercase text-cyan-400 block mb-1">
                                🗺️ Como Acessar (Onde Clicar)
                              </span>
                              <ul className="space-y-1 text-[11px] text-slate-300">
                                {note.guide.whereToAccess.map((st, i) => (
                                  <li key={i}>{st}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="p-2.5 rounded-xl bg-[#0b1319] border border-amber-500/20">
                              <span className="text-[10px] font-black uppercase text-amber-400 block mb-1">
                                🧪 Como Testar
                              </span>
                              <ul className="space-y-1 text-[11px] text-slate-300">
                                {note.guide.howToTest.map((st, i) => (
                                  <li key={i}>{st}</li>
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
            </div>

            {/* RODAPÉ COM STATUS E BOTÃO DE ATUALIZAR / CONCLUIR */}
            <div className="p-3.5 sm:px-5 bg-[#080f14] border-t border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-[11px] text-[#8696a0]">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>
                  Suas conversas permanecem seguras. Você pode reabrir este Mapa Mental a qualquer momento no botão{' '}
                  <strong className="text-emerald-300">"🚀 Novidades (18)"</strong> no topo.
                </span>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={close}
                  disabled={isUpdating}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#8696a0] hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  Fechar Guia
                </button>

                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={isUpdating}
                  className="relative group overflow-hidden px-5 py-2 rounded-xl text-xs font-extrabold text-[#0b141a] bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400 hover:from-emerald-300 hover:to-teal-300 shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all duration-200 flex items-center gap-2 disabled:opacity-75 cursor-pointer active:scale-95"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
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
      )}
    </>
  );
}
