import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Monitor,
  RefreshCw,
  ExternalLink,
  X,
  Building2,
  Maximize2,
  Minimize2,
  Columns,
  ArrowLeft,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  Copy,
  Check,
  Radio,
  FolderTree,
  MoreVertical,
} from 'lucide-react';
import {
  useXPointRemoteBridge,
  setXPointRemoteIframeElement,
  getXPointRemoteBaseUrl,
} from '../hooks/useXPointRemoteBridge';
import { cn } from '../lib/utils';

export const XPointRemoteSidePanel: React.FC = () => {
  const {
    isOpen,
    hasMountedOnce,
    widthMode,
    customWidthPx,
    bridgeReady,
    bridgeVersion,
    activeContext,
    activeResolvedInfo,
    activeContactSession,
    toast,
    initialIframeSrc,
    closeDrawer,
    setWidthMode,
    setCustomWidthPx,
    reloadSync,
    openCnpjModalInIframe,
    clearToast,
  } = useXPointRemoteBridge();

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [copiedCnpj, setCopiedCnpj] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isSyncingPulse, setIsSyncingPulse] = useState(false);

  // Registra a referência global do iframe assim que montado
  const setRefs = useCallback((node: HTMLIFrameElement | null) => {
    iframeRef.current = node;
    setXPointRemoteIframeElement(node);
  }, []);

  // Atalho ESC para voltar rapidamente para o chat quando aberto
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeDrawer]);

  // Suporte a redimensionamento manual por arraste na borda esquerda da gaveta (quando em modo split/lateral)
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(420, Math.min(window.innerWidth * 0.85, window.innerWidth - e.clientX));
      setCustomWidthPx(Math.round(newWidth));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, setCustomWidthPx]);

  const handleCopyCnpj = () => {
    const textToCopy = activeContext.formattedCnpj || activeContext.rawCnpj;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedCnpj(true);
    setTimeout(() => setCopiedCnpj(false), 2000);
  };

  const handleReloadSync = () => {
    setIsSyncingPulse(true);
    reloadSync();
    setTimeout(() => setIsSyncingPulse(false), 700);
  };

  const handleOpenExternal = () => {
    const baseUrl = getXPointRemoteBaseUrl();
    const cnpjParam = activeContext.rawCnpj ? `?cnpj=${encodeURIComponent(activeContext.rawCnpj)}` : '';
    window.open(`${baseUrl}${cnpjParam}`, '_blank', 'noopener,noreferrer');
  };

  // Mantém o componente sempre montado após a primeira inicialização; controla visibilidade via CSS para ZERO reload
  if (!hasMountedOnce) return null;

  const isFullscreenMode = widthMode === 'fullscreen' && !customWidthPx;

  const computedDesktopStyle: React.CSSProperties = isOpen
    ? isFullscreenMode
      ? { width: '100vw', maxWidth: '100vw', height: '100vh' }
      : customWidthPx
      ? { width: `${customWidthPx}px` }
      : widthMode === 'expanded'
      ? { width: 'min(58vw, 980px)', minWidth: '680px' }
      : { width: '520px' }
    : { width: '0px', minWidth: '0px', maxWidth: '0px', height: '0px' };

  const hasCnpj = Boolean(activeContext.rawCnpj);
  const onlineCount = activeResolvedInfo?.onlineDevices ?? 0;
  const totalCount = activeResolvedInfo?.totalDevices ?? 0;
  const resolvedCompanyName = activeResolvedInfo?.companyName || activeContext.companyName;

  return (
    <>
      {/* Toast Flutuante Global de Eventos do XPoint Remote (Associação de CNPJ / Sessões) */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[9999] max-w-md animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl text-xs font-semibold',
              toast.type === 'success'
                ? 'bg-emerald-950/95 text-emerald-200 border-emerald-500/40'
                : toast.type === 'error'
                ? 'bg-rose-950/95 text-rose-200 border-rose-500/40'
                : 'bg-slate-900/95 text-indigo-200 border-indigo-500/40'
            )}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            ) : toast.type === 'error' ? (
              <AlertTriangle size={16} className="text-rose-400 shrink-0" />
            ) : (
              <Monitor size={16} className="text-indigo-400 shrink-0" />
            )}
            <span className="leading-snug">{toast.message}</span>
            <button
              onClick={clearToast}
              className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors ml-1"
              title="Fechar aviso"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Backdrop escuro apenas no Mobile quando não estiver em fullscreen */}
      {isOpen && !isFullscreenMode && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[115] md:hidden animate-in fade-in duration-200"
          onClick={closeDrawer}
        />
      )}

      {/* Painel Principal (Tela Cheia Imersiva por padrão ou Split-View Lateral) — Ocultado via CSS quando fechado para preservar o iframe sem reload */}
      <aside
        style={typeof window !== 'undefined' && window.innerWidth >= 768 ? computedDesktopStyle : undefined}
        className={cn(
          'flex flex-col bg-[#f8fafc] dark:bg-[#0b141a] select-none transition-[width,opacity,transform] duration-200 ease-out shrink-0',
          isOpen
            ? isFullscreenMode
              ? 'fixed inset-0 w-screen h-screen z-[160] opacity-100 translate-x-0'
              : 'fixed inset-y-0 right-0 w-full h-full z-[120] md:static md:z-30 opacity-100 translate-x-0 border-l border-[#d1d7db] dark:border-[#222d34] shadow-2xl md:shadow-none'
            : 'w-0 h-0 min-w-0 max-w-0 opacity-0 pointer-events-none overflow-hidden border-0'
        )}
        aria-hidden={!isOpen}
      >
        {/* Alça de Redimensionamento Lateral (Desktop, visível apenas nos modos divididos) */}
        {isOpen && !isFullscreenMode && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
            title="Arraste para redimensionar o painel de Acesso Remoto"
            className={cn(
              'hidden md:flex w-1.5 cursor-col-resize absolute left-0 top-0 bottom-0 z-40 items-center justify-center transition-colors group',
              isResizing ? 'bg-indigo-500/50' : 'hover:bg-indigo-500/30'
            )}
          >
            <div className="absolute -left-1.5 -right-1.5 top-0 bottom-0 cursor-col-resize" />
            <MoreVertical
              size={11}
              className="text-slate-400 opacity-0 group-hover:opacity-80 transition-opacity pointer-events-none"
            />
          </div>
        )}

        {/* Header Unificado Moderno (Barra Superior com Botão "Voltar para o Chat" à Esquerda + Contexto do Cliente + Ações à Direita) */}
        <div className="min-h-[54px] px-3 sm:px-4 py-1.5 bg-white/95 dark:bg-[#111b21]/95 backdrop-blur-xl border-b border-slate-200/80 dark:border-[#222d34] flex items-center justify-between gap-2 sm:gap-3 flex-wrap shrink-0 shadow-sm z-20">
          {/* LADO ESQUERDO: Botão Principal "Voltar para o Chat" + Identidade XPoint Remote + Contexto do Contato */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 flex-wrap">
            {/* Botão de Destaque no Topo Esquerdo: Voltar para o Chat */}
            <button
              type="button"
              onClick={closeDrawer}
              className="group flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00a884] to-emerald-600 hover:from-[#008f72] hover:to-emerald-500 text-white font-bold text-xs shadow-md shadow-[#00a884]/20 hover:shadow-lg hover:shadow-[#00a884]/30 transition-all duration-200 active:scale-95 shrink-0 cursor-pointer"
              title="Voltar para a tela de atendimento do Chat (Atalho: ESC)"
            >
              <ArrowLeft size={15} className="transition-transform duration-200 group-hover:-translate-x-0.5 shrink-0" />
              <MessageSquare size={14} className="shrink-0 opacity-90" />
              <span>Voltar para o Chat</span>
              {activeContext.contactName && (
                <span className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded-md bg-black/20 text-[10px] font-semibold max-w-[140px] truncate">
                  {activeContext.contactName}
                </span>
              )}
            </button>

            <div className="h-5 w-px bg-slate-200 dark:bg-[#2a3942] hidden sm:block shrink-0" />

            {/* Identificação XPoint Remote + Status da Ponte */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-sm shrink-0">
                <Monitor size={15} />
              </div>
              <span className="font-bold text-xs text-slate-800 dark:text-[#e9edef] hidden md:inline">
                XPoint Remote
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold border shrink-0 transition-colors',
                  bridgeReady
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                )}
                title={
                  bridgeReady
                    ? `Ponte postMessage conectada (${bridgeVersion})`
                    : 'Aguardando sinal XPOINT_REMOTE_READY do iframe...'
                }
              >
                <Wifi size={10} className={cn(bridgeReady ? 'text-emerald-500' : 'animate-pulse text-amber-500')} />
                <span>{bridgeReady ? `Conectado ${bridgeVersion}` : 'Conectando...'}</span>
              </span>
            </div>

            <div className="h-5 w-px bg-slate-200 dark:bg-[#2a3942] hidden lg:block shrink-0" />

            {/* Pill de Contexto do Contato / Empresa + CNPJ + Máquinas Online */}
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <Building2
                size={14}
                className={cn(
                  'shrink-0 hidden sm:block',
                  hasCnpj ? 'text-indigo-500 dark:text-indigo-400' : 'text-amber-500'
                )}
              />
              {activeContext.contactId ? (
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <span className="font-bold text-xs text-slate-800 dark:text-[#e9edef] truncate max-w-[200px]">
                    {resolvedCompanyName || activeContext.contactName}
                  </span>
                  {hasCnpj ? (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-600 dark:text-indigo-300 text-[11px] font-mono font-semibold">
                      <span>{activeContext.formattedCnpj || activeContext.rawCnpj}</span>
                      <button
                        type="button"
                        onClick={handleCopyCnpj}
                        className="p-0.5 rounded hover:bg-indigo-500/20 transition-colors"
                        title="Copiar CNPJ"
                      >
                        {copiedCnpj ? (
                          <Check size={10} className="text-emerald-500" />
                        ) : (
                          <Copy size={10} className="opacity-75 hover:opacity-100" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10.5px] font-semibold">
                      <AlertTriangle size={11} className="shrink-0" />
                      <span className="truncate max-w-[320px]">
                        Contato sem CNPJ vinculado — selecione no painel abaixo para vincular
                      </span>
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-500 dark:text-[#8696a0] font-medium hidden md:inline">
                  Modo Geral — Pesquise qualquer empresa ou selecione uma conversa
                </span>
              )}

              {/* Contador de Máquinas ONLINE / TOTAL retornado por XPOINT_REMOTE_CNPJ_RESOLVED */}
              {hasCnpj && activeResolvedInfo && (
                <div
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shrink-0',
                    onlineCount > 0
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25'
                  )}
                  title={`${onlineCount} máquina(s) online de ${totalCount} cadastrada(s) para este CNPJ`}
                >
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      onlineCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                    )}
                  />
                  <span>
                    {onlineCount} online / {totalCount} {totalCount === 1 ? 'PC' : 'PCs'}
                  </span>
                </div>
              )}

              {/* Indicador de Sessão Remota Ativa (XPOINT_REMOTE_SESSION_STARTED) */}
              {activeContactSession && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-[11px] font-bold animate-in fade-in duration-200">
                  <Radio size={12} className="text-amber-500 animate-pulse shrink-0" />
                  <span className="truncate max-w-[240px]">
                    Em Atendimento ({activeContactSession.protocolNumber}) • {activeContactSession.displayName}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* LADO DIREITO: Seletor de Modo de Visualização (Tela Cheia / Dividir Tela / Compacto) + Ferramentas */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Seletor de Modo: Tela Cheia (Padrão) | Dividir Tela | Compacto */}
            <div className="hidden md:flex items-center bg-slate-100 dark:bg-[#202c33] p-0.5 rounded-xl border border-slate-200/70 dark:border-[#2a3942]">
              <button
                type="button"
                onClick={() => setWidthMode('fullscreen')}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer',
                  widthMode === 'fullscreen' && !customWidthPx
                    ? 'bg-white dark:bg-[#2a3942] text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-800 dark:hover:text-white'
                )}
                title="Modo Tela Cheia (100% da tela para máximo aproveitamento)"
              >
                <Maximize2 size={11} />
                <span>Tela Cheia</span>
              </button>
              <button
                type="button"
                onClick={() => setWidthMode('expanded')}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer',
                  widthMode === 'expanded' && !customWidthPx
                    ? 'bg-white dark:bg-[#2a3942] text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-800 dark:hover:text-white'
                )}
                title="Modo Dividir Tela (~58vw ao lado do Chat)"
              >
                <Columns size={11} />
                <span className="hidden lg:inline">Dividir Tela</span>
              </button>
              <button
                type="button"
                onClick={() => setWidthMode('compact')}
                className={cn(
                  'px-2 py-1 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer',
                  widthMode === 'compact' && !customWidthPx
                    ? 'bg-white dark:bg-[#2a3942] text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-800 dark:hover:text-white'
                )}
                title="Modo Gaveta Compacta (~520px)"
              >
                <Minimize2 size={11} />
                <span className="hidden xl:inline">Compacto</span>
              </button>
            </div>

            {/* Botão Gestão CNPJ (XPOINT_REMOTE_OPEN_CNPJ_MODAL) */}
            <button
              type="button"
              onClick={openCnpjModalInIframe}
              className="px-2.5 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 text-[11px] font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Abrir árvore de Gestão por CNPJ dentro do XPoint Remote"
            >
              <FolderTree size={13} />
              <span className="hidden sm:inline">Gestão CNPJ</span>
            </button>

            {/* Botão Recarregar Sincronização (reenvia XPOINT_REMOTE_SET_CNPJ) */}
            <button
              type="button"
              onClick={handleReloadSync}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#202c33] text-slate-600 dark:text-[#aebac1] hover:text-indigo-500 transition-colors cursor-pointer"
              title="Recarregar Sincronização de CNPJ com o painel remoto"
            >
              <RefreshCw size={14} className={cn(isSyncingPulse && 'animate-spin text-indigo-500')} />
            </button>

            {/* Botão Abrir em Nova Guia */}
            <button
              type="button"
              onClick={handleOpenExternal}
              className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#202c33] text-slate-600 dark:text-[#aebac1] hover:text-indigo-500 transition-colors cursor-pointer"
              title="Abrir XPoint Remote em Nova Guia"
            >
              <ExternalLink size={14} />
            </button>

            {/* Botão Fechar (oculta via CSS sem desmontar o iframe) */}
            <button
              type="button"
              onClick={closeDrawer}
              className="p-1.5 rounded-xl hover:bg-rose-500/10 text-slate-500 dark:text-[#aebac1] hover:text-rose-500 transition-colors cursor-pointer"
              title="Fechar painel e voltar ao Chat (Atalho: ESC)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Área do Iframe Persistente em Tela Cheia (NUNCA desmontado ao trocar de conversa ou voltar ao chat) */}
        <div className="flex-1 w-full h-full relative bg-[#0f172a] overflow-hidden">
          {isResizing && (
            <div className="absolute inset-0 z-30 bg-transparent cursor-col-resize" />
          )}
          <iframe
            ref={setRefs}
            id="xpoint-remote-iframe"
            src={initialIframeSrc}
            title="XPoint Remote — Acesso Remoto"
            allow="clipboard-write"
            style={{ width: '100%', height: '100%', border: 0 }}
          />
        </div>
      </aside>
    </>
  );
};

export default XPointRemoteSidePanel;
