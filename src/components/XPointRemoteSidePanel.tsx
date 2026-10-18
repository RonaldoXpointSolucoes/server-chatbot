import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Monitor,
  RefreshCw,
  ExternalLink,
  X,
  Building2,
  Maximize2,
  Minimize2,
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

  // Suporte a redimensionamento manual por arraste na borda esquerda da gaveta
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(400, Math.min(window.innerWidth * 0.78, window.innerWidth - e.clientX));
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

  const computedDesktopStyle: React.CSSProperties = isOpen
    ? customWidthPx
      ? { width: `${customWidthPx}px` }
      : widthMode === 'expanded'
      ? { width: 'min(55vw, 920px)', minWidth: '680px' }
      : { width: '520px' }
    : { width: '0px', minWidth: '0px' };

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

      {/* Backdrop escuro apenas no Mobile quando a gaveta estiver aberta */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[115] md:hidden animate-in fade-in duration-200"
          onClick={closeDrawer}
        />
      )}

      {/* Painel Lateral Split-View (Desktop) / Slide-Over (Mobile) — Ocultado via CSS quando fechado para preservar o iframe */}
      <aside
        style={typeof window !== 'undefined' && window.innerWidth >= 768 ? computedDesktopStyle : undefined}
        className={cn(
          'h-full flex flex-col bg-[#f8fafc] dark:bg-[#111b21] border-l border-[#d1d7db] dark:border-[#222d34] select-none relative transition-[width,opacity,transform] duration-200 ease-out shrink-0',
          isOpen
            ? 'fixed inset-y-0 right-0 w-full z-[120] md:static md:z-30 opacity-100 translate-x-0 shadow-2xl md:shadow-none'
            : 'w-0 min-w-0 max-w-0 opacity-0 pointer-events-none overflow-hidden border-l-0'
        )}
        aria-hidden={!isOpen}
      >
        {/* Alça de Redimensionamento Lateral (Desktop) */}
        {isOpen && (
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

        {/* 1. Barra Superior de Ferramentas e Controles da Gaveta */}
        <div className="h-12 px-3 bg-white dark:bg-[#182229] border-b border-slate-200/80 dark:border-[#222d34] flex items-center justify-between gap-2 shrink-0">
          {/* Identificação + Status da Bridge */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-sm shrink-0">
              <Monitor size={15} />
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-xs text-slate-800 dark:text-[#e9edef] truncate">
                XPoint Remote
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 transition-colors',
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
          </div>

          {/* Botões de Ação da Barra Superior */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Controle de Largura: Compacto (~520px) vs Expandido (~860px / 55vw) */}
            <div className="hidden md:flex items-center bg-slate-100 dark:bg-[#202c33] p-0.5 rounded-lg border border-slate-200/70 dark:border-[#2a3942]">
              <button
                type="button"
                onClick={() => setWidthMode('compact')}
                className={cn(
                  'px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all',
                  widthMode === 'compact' && !customWidthPx
                    ? 'bg-white dark:bg-[#2a3942] text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-800 dark:hover:text-white'
                )}
                title="Modo Compacto Lateral (~520px)"
              >
                <Minimize2 size={11} />
                <span className="hidden lg:inline">Compacto</span>
              </button>
              <button
                type="button"
                onClick={() => setWidthMode('expanded')}
                className={cn(
                  'px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all',
                  widthMode === 'expanded' && !customWidthPx
                    ? 'bg-white dark:bg-[#2a3942] text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-800 dark:hover:text-white'
                )}
                title="Modo Expandido (~860px / 55vw)"
              >
                <Maximize2 size={11} />
                <span className="hidden lg:inline">Expandido</span>
              </button>
            </div>

            {/* Botão Gestão CNPJ (XPOINT_REMOTE_OPEN_CNPJ_MODAL) */}
            <button
              type="button"
              onClick={openCnpjModalInIframe}
              className="px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 text-[10.5px] font-bold flex items-center gap-1 transition-all active:scale-95"
              title="Abrir árvore de Gestão por CNPJ dentro do XPoint Remote"
            >
              <FolderTree size={12} />
              <span>Gestão CNPJ</span>
            </button>

            {/* Botão Recarregar Sincronização (reenvia XPOINT_REMOTE_SET_CNPJ) */}
            <button
              type="button"
              onClick={handleReloadSync}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#202c33] text-slate-600 dark:text-[#aebac1] hover:text-indigo-500 transition-colors"
              title="Recarregar Sincronização de CNPJ com o painel remoto"
            >
              <RefreshCw size={14} className={cn(isSyncingPulse && 'animate-spin text-indigo-500')} />
            </button>

            {/* Botão Abrir em Nova Guia */}
            <button
              type="button"
              onClick={handleOpenExternal}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#202c33] text-slate-600 dark:text-[#aebac1] hover:text-indigo-500 transition-colors"
              title="Abrir XPoint Remote em Nova Guia"
            >
              <ExternalLink size={14} />
            </button>

            {/* Botão Fechar Gaveta (oculta via CSS sem desmontar o iframe) */}
            <button
              type="button"
              onClick={closeDrawer}
              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 dark:text-[#aebac1] hover:text-rose-500 transition-colors"
              title="Fechar Gaveta (mantém sessão ativa em segundo plano)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 2. Cabeçalho de Contexto do Contato Ativo (acima do iframe) */}
        <div className="px-3 py-2 bg-slate-50/90 dark:bg-[#202c33]/90 border-b border-slate-200/80 dark:border-[#2a3942] flex flex-col gap-1.5 shrink-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* Nome do Contato / Empresa + CNPJ atual */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Building2
                size={14}
                className={cn(
                  'shrink-0',
                  hasCnpj ? 'text-indigo-500 dark:text-indigo-400' : 'text-amber-500'
                )}
              />
              {activeContext.contactId ? (
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <span className="font-bold text-xs text-slate-800 dark:text-[#e9edef] truncate max-w-[180px]">
                    {resolvedCompanyName || activeContext.contactName}
                  </span>
                  {hasCnpj ? (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-600 dark:text-indigo-300 text-[10.5px] font-mono font-semibold">
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
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10.5px] font-semibold">
                      <AlertTriangle size={10} className="shrink-0" />
                      <span>Contato sem CNPJ vinculado — selecione no painel abaixo para vincular</span>
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-500 dark:text-[#8696a0] font-medium">
                  Modo Geral — Selecione uma conversa ou pesquise qualquer empresa abaixo
                </span>
              )}
            </div>

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
          </div>

          {/* Indicador de Sessão Remota Ativa (XPOINT_REMOTE_SESSION_STARTED) */}
          {activeContactSession && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold animate-in fade-in duration-200">
              <div className="flex items-center gap-1.5 min-w-0">
                <Radio size={12} className="text-emerald-500 animate-pulse shrink-0" />
                <span className="truncate">
                  Em Atendimento Remoto ({activeContactSession.protocolNumber}) —{' '}
                  {activeContactSession.displayName}
                </span>
              </div>
              {activeContactSession.rustdeskId && (
                <span className="font-mono text-[10px] opacity-80 shrink-0">
                  ID: {activeContactSession.rustdeskId}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 3. Área do Iframe Persistente (NUNCA desmontado ao trocar de conversa ou fechar a gaveta) */}
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
