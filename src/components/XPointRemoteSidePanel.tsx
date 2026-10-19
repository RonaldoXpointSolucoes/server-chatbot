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
  ShieldCheck,
  ShieldAlert,
  Lock,
  Plus,
  Trash2,
  MailCheck,
  LogOut,
  Loader2,
} from 'lucide-react';
import {
  useXPointRemoteBridge,
  setXPointRemoteIframeElement,
  getXPointRemoteBaseUrl,
  DEFAULT_ALLOWED_GOOGLE_EMAILS,
  normalizeEmail,
} from '../hooks/useXPointRemoteBridge';
import { useChatStore } from '../store/chatStore';
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
    allowedGoogleEmails,
    googleAuthEmail,
    googleAuthName,
    isGoogleAuthenticated,
    isGoogleEmailAllowed,
    isCheckingGoogleAuth,
    googleAuthError,
    closeDrawer,
    setWidthMode,
    setCustomWidthPx,
    reloadSync,
    openCnpjModalInIframe,
    clearToast,
    addAllowedGoogleEmail,
    removeAllowedGoogleEmail,
    loginWithGoogleForRemote,
    logoutGoogleForRemote,
  } = useXPointRemoteBridge();

  const activeChatId = useChatStore((s) => s.activeChatId);
  const draftNewChat = useChatStore((s) => s.draftNewChat);
  const hasActiveConversation = Boolean(activeChatId || draftNewChat);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [copiedCnpj, setCopiedCnpj] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isSyncingPulse, setIsSyncingPulse] = useState(false);

  // Estado do Modal de Gestão da Lista de E-mails Liberados (Google)
  const [isAllowlistModalOpen, setIsAllowlistModalOpen] = useState(false);
  const [newAllowedEmail, setNewAllowedEmail] = useState('');
  const [allowlistFormError, setAllowlistFormError] = useState<string | null>(null);
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  // Registra a referência global do iframe assim que montado
  const setRefs = useCallback((node: HTMLIFrameElement | null) => {
    iframeRef.current = node;
    setXPointRemoteIframeElement(node);
  }, []);

  // Atalho ESC para fechar o modal de e-mails ou voltar para o chat
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAllowlistModalOpen) {
          setIsAllowlistModalOpen(false);
          return;
        }
        closeDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAllowlistModalOpen, closeDrawer]);

  // Suporte a redimensionamento manual por arraste na borda esquerda da gaveta (quando em modo dividir/compacto)
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(390, Math.min(window.innerWidth * 0.82, window.innerWidth - e.clientX));
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

  const handleAddEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAllowlistFormError(null);
    if (!newAllowedEmail.trim()) return;
    setIsSavingEmail(true);
    const res = await addAllowedGoogleEmail(newAllowedEmail);
    setIsSavingEmail(false);
    if (!res.ok) {
      setAllowlistFormError(res.error || 'Erro ao adicionar e-mail.');
      return;
    }
    setNewAllowedEmail('');
  };

  const handleRemoveEmail = async (emailToRemove: string) => {
    setAllowlistFormError(null);
    const res = await removeAllowedGoogleEmail(emailToRemove);
    if (!res.ok && res.error) {
      setAllowlistFormError(res.error);
    }
  };

  // Mantém o componente sempre montado após a primeira inicialização; controla visibilidade via CSS para ZERO reload
  if (!hasMountedOnce) return null;

  const isFullscreenMode = widthMode === 'fullscreen' && !customWidthPx;
  const isCompactMode = widthMode === 'compact' && !customWidthPx;
  const isExpandedSplitMode = widthMode === 'expanded' && !customWidthPx;

  // Cálculo responsivo inteligente das larguras para evitar esmagamento de colunas em Dividir Tela e Compacto
  const computedDesktopStyle: React.CSSProperties = isOpen
    ? isFullscreenMode
      ? { width: '100vw', maxWidth: '100vw', height: '100vh' }
      : customWidthPx
      ? { width: `${customWidthPx}px`, minWidth: '390px', maxWidth: '82vw' }
      : isExpandedSplitMode
      ? !hasActiveConversation
        ? { flex: '1 1 0%', minWidth: '480px' }
        : { width: 'clamp(460px, 50vw, 860px)', minWidth: '440px' }
      : { width: 'clamp(400px, 34vw, 480px)', minWidth: '390px' }
    : { width: '0px', minWidth: '0px', maxWidth: '0px', height: '0px' };

  const hasCnpj = Boolean(activeContext.rawCnpj);
  const onlineCount = activeResolvedInfo?.onlineDevices ?? 0;
  const totalCount = activeResolvedInfo?.totalDevices ?? 0;
  const resolvedCompanyName = activeResolvedInfo?.companyName || activeContext.companyName;

  // Regra de segurança: exige autenticação Google E que o e-mail esteja na lista de e-mails liberados
  const isAccessGranted = isGoogleAuthenticated && isGoogleEmailAllowed;

  return (
    <>
      {/* Toast Flutuante Global de Eventos do XPoint Remote */}
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

      {/* Painel Principal (Tela Cheia, Dividir Tela ou Compacto) */}
      <aside
        style={typeof window !== 'undefined' && window.innerWidth >= 768 ? computedDesktopStyle : undefined}
        className={cn(
          'flex flex-col bg-[#f8fafc] dark:bg-[#0b141a] select-none transition-[width,opacity,transform] duration-200 ease-out shrink-0',
          isOpen
            ? isFullscreenMode
              ? 'fixed inset-0 w-screen h-screen z-[160] opacity-100 translate-x-0'
              : 'fixed inset-y-0 right-0 w-full h-full z-[120] md:static md:z-30 opacity-100 translate-x-0 border-l border-[#d1d7db] dark:border-[#222d34] shadow-2xl md:shadow-none min-w-0'
            : 'w-0 h-0 min-w-0 max-w-0 opacity-0 pointer-events-none overflow-hidden border-0'
        )}
        aria-hidden={!isOpen}
      >
        {/* Alça de Redimensionamento Lateral (Desktop, visível nos modos Dividir Tela e Compacto) */}
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

        {/* CABEÇALHO ESTRUTURADO EM 2 NÍVEIS (100% Alinhado em Tela Cheia, Dividir Tela e Compacto — Sem quebras irregulares) */}
        <header className="bg-white/95 dark:bg-[#111b21]/95 backdrop-blur-xl border-b border-slate-200/80 dark:border-[#222d34] flex flex-col shrink-0 shadow-xs z-20">
          {/* NÍVEL 1: Barra de Navegação e Seletor de Modos (Linha Única Determinística) */}
          <div className="h-12 px-2.5 sm:px-3.5 flex items-center justify-between gap-2 flex-nowrap min-w-0">
            {/* ESQUERDA: Botão Voltar ao Chat + Identidade XPoint Remote */}
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <button
                type="button"
                onClick={closeDrawer}
                className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#00a884] to-emerald-600 hover:from-[#008f72] hover:to-emerald-500 text-white font-bold text-xs shadow-sm shadow-[#00a884]/20 hover:shadow-md transition-all duration-200 active:scale-95 shrink-0 cursor-pointer whitespace-nowrap"
                title="Voltar para a tela de atendimento do Chat (Atalho: ESC)"
              >
                <ArrowLeft size={14} className="transition-transform duration-200 group-hover:-translate-x-0.5 shrink-0" />
                {!isCompactMode && <MessageSquare size={13} className="shrink-0 opacity-90 hidden sm:inline" />}
                <span>{isCompactMode ? 'Voltar' : 'Voltar para o Chat'}</span>
              </button>

              <div className="h-4 w-px bg-slate-200 dark:bg-[#2a3942] shrink-0" />

              {/* Identificação XPoint Remote + Status da Ponte */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-xs shrink-0">
                  <Monitor size={13} />
                </div>
                {!isCompactMode && (
                  <span className="font-bold text-xs text-slate-800 dark:text-[#e9edef] hidden sm:inline whitespace-nowrap">
                    XPoint Remote
                  </span>
                )}
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 whitespace-nowrap transition-colors',
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
                  <Wifi size={9} className={cn(bridgeReady ? 'text-emerald-500' : 'animate-pulse text-amber-500')} />
                  <span>{bridgeReady ? (isCompactMode ? bridgeVersion : `Conectado ${bridgeVersion}`) : '...'}</span>
                </span>
              </div>
            </div>

            {/* DIREITA: Seletor de Modo Alinhado (Tela Cheia | Dividir Tela | Compacto) + Utilitários */}
            <div className="flex items-center gap-1 shrink-0 flex-nowrap">
              <div className="hidden md:flex items-center bg-slate-100 dark:bg-[#202c33] p-0.5 rounded-xl border border-slate-200/70 dark:border-[#2a3942] shrink-0">
                <button
                  type="button"
                  onClick={() => setWidthMode('fullscreen')}
                  className={cn(
                    'px-2 py-1 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap',
                    widthMode === 'fullscreen' && !customWidthPx
                      ? 'bg-white dark:bg-[#2a3942] text-indigo-600 dark:text-indigo-400 shadow-2xs'
                      : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-800 dark:hover:text-white'
                  )}
                  title="Modo Tela Cheia (100% da tela para máximo aproveitamento)"
                >
                  <Maximize2 size={11} className="shrink-0" />
                  <span>Tela Cheia</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWidthMode('expanded')}
                  className={cn(
                    'px-2 py-1 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap',
                    widthMode === 'expanded' && !customWidthPx
                      ? 'bg-white dark:bg-[#2a3942] text-indigo-600 dark:text-indigo-400 shadow-2xs'
                      : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-800 dark:hover:text-white'
                  )}
                  title="Modo Dividir Tela (Divide a tela lado a lado com o Chat)"
                >
                  <Columns size={11} className="shrink-0" />
                  <span>{isCompactMode ? 'Dividir' : 'Dividir Tela'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWidthMode('compact')}
                  className={cn(
                    'px-2 py-1 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap',
                    widthMode === 'compact' && !customWidthPx
                      ? 'bg-white dark:bg-[#2a3942] text-indigo-600 dark:text-indigo-400 shadow-2xs'
                      : 'text-slate-500 dark:text-[#8696a0] hover:text-slate-800 dark:hover:text-white'
                  )}
                  title="Modo Compacto (Gaveta lateral enxuta)"
                >
                  <Minimize2 size={11} className="shrink-0" />
                  <span>Compacto</span>
                </button>
              </div>

              {/* Botão Recarregar Sincronização */}
              <button
                type="button"
                onClick={handleReloadSync}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#202c33] text-slate-600 dark:text-[#aebac1] hover:text-indigo-500 transition-colors cursor-pointer shrink-0"
                title="Recarregar Sincronização de CNPJ com o painel remoto"
              >
                <RefreshCw size={13} className={cn(isSyncingPulse && 'animate-spin text-indigo-500')} />
              </button>

              {/* Botão Abrir em Nova Guia */}
              <button
                type="button"
                onClick={handleOpenExternal}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#202c33] text-slate-600 dark:text-[#aebac1] hover:text-indigo-500 transition-colors cursor-pointer shrink-0"
                title="Abrir XPoint Remote em Nova Guia"
              >
                <ExternalLink size={13} />
              </button>

              {/* Botão Fechar */}
              <button
                type="button"
                onClick={closeDrawer}
                className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 dark:text-[#aebac1] hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                title="Fechar painel e voltar ao Chat (Atalho: ESC)"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* NÍVEL 2: Barra de Contexto da Empresa/CNPJ + Controle de E-mails Liberados Google (Alinhamento Horizontal Perfeito) */}
          <div className="h-9 px-2.5 sm:px-3.5 bg-slate-50/90 dark:bg-[#0c151c] border-t border-slate-200/70 dark:border-[#222d34]/90 flex items-center justify-between gap-2 flex-nowrap min-w-0 overflow-hidden">
            {/* ESQUERDA: Ícone Empresa + Nome/CNPJ + Status dos PCs */}
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden flex-nowrap">
              <Building2
                size={13}
                className={cn(
                  'shrink-0',
                  hasCnpj ? 'text-indigo-500 dark:text-indigo-400' : 'text-amber-500'
                )}
              />
              {activeContext.contactId ? (
                <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-hidden">
                  <span className="font-bold text-xs text-slate-800 dark:text-[#e9edef] truncate max-w-[160px] sm:max-w-[220px]">
                    {resolvedCompanyName || activeContext.contactName}
                  </span>
                  {hasCnpj ? (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-600 dark:text-indigo-300 text-[10.5px] font-mono font-semibold shrink-0">
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
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-semibold truncate min-w-0">
                      <AlertTriangle size={10} className="shrink-0" />
                      <span className="truncate">
                        {isCompactMode ? 'Sem CNPJ vinculado' : 'Contato sem CNPJ — vincule abaixo'}
                      </span>
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-[11px] text-slate-500 dark:text-[#8696a0] font-medium truncate min-w-0">
                  {isCompactMode
                    ? 'Modo Geral — Pesquise a empresa abaixo'
                    : 'Modo Geral — Pesquise qualquer empresa ou selecione uma conversa'}
                </span>
              )}

              {/* Contador de Máquinas ONLINE / TOTAL */}
              {hasCnpj && activeResolvedInfo && (
                <div
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 whitespace-nowrap',
                    onlineCount > 0
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25'
                  )}
                  title={`${onlineCount} máquina(s) online de ${totalCount} cadastrada(s) para este CNPJ`}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      onlineCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                    )}
                  />
                  <span>
                    {onlineCount}/{totalCount} PCs
                  </span>
                </div>
              )}

              {/* Indicador de Sessão Remota Ativa */}
              {activeContactSession && (
                <div className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-700 dark:text-amber-300 text-[10px] font-bold shrink-0 whitespace-nowrap">
                  <Radio size={11} className="text-amber-500 animate-pulse shrink-0" />
                  <span className="truncate max-w-[150px]">
                    #{activeContactSession.protocolNumber} • {activeContactSession.displayName}
                  </span>
                </div>
              )}
            </div>

            {/* DIREITA: Botão Gestão CNPJ + Botão Lista de E-mails Liberados (Google) */}
            <div className="flex items-center gap-1.5 shrink-0 flex-nowrap">
              {isAccessGranted && (
                <button
                  type="button"
                  onClick={openCnpjModalInIframe}
                  className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/25 text-[10.5px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
                  title="Abrir árvore de Gestão por CNPJ dentro do XPoint Remote"
                >
                  <FolderTree size={11} className="shrink-0" />
                  <span>Gestão CNPJ</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsAllowlistModalOpen(true)}
                className={cn(
                  'px-2.5 py-1 rounded-lg border text-[10.5px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shrink-0 whitespace-nowrap',
                  isAccessGranted
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                    : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border-amber-500/30'
                )}
                title={
                  isAccessGranted
                    ? `Autenticado com Google (${googleAuthEmail}) • Clique para gerenciar a Lista de E-mails Liberados`
                    : 'Gerenciar Lista de E-mails Liberados (Google OAuth)'
                }
              >
                <ShieldCheck size={11} className="shrink-0" />
                <span>
                  {isCompactMode
                    ? `E-mails (${allowedGoogleEmails.length})`
                    : `E-mails Liberados (${allowedGoogleEmails.length})`}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* CORPO DO PAINEL: Gate de Login Google Obrigatório + Iframe Persistente */}
        <div className="flex-1 w-full h-full relative bg-[#0f172a] overflow-hidden">
          {isResizing && (
            <div className="absolute inset-0 z-30 bg-transparent cursor-col-resize" />
          )}

          {/* TELA DE BLOQUEIO: Exige Login com o Google e Validação na Lista de E-mails Liberados */}
          {!isAccessGranted && (
            <div className="absolute inset-0 z-30 bg-gradient-to-br from-[#0b141a] via-[#111b21] to-[#0f172a] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
              <div className="w-full max-w-md bg-[#182229]/95 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-2xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
                {/* Ícone de Segurança */}
                <div
                  className={cn(
                    'w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border shadow-lg',
                    isGoogleAuthenticated && !isGoogleEmailAllowed
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-rose-500/10'
                      : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400 shadow-indigo-500/10'
                  )}
                >
                  {isCheckingGoogleAuth ? (
                    <Loader2 size={30} className="animate-spin text-indigo-400" />
                  ) : isGoogleAuthenticated && !isGoogleEmailAllowed ? (
                    <ShieldAlert size={32} />
                  ) : (
                    <Lock size={30} />
                  )}
                </div>

                {/* Título e Subtítulo */}
                <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                  {isGoogleAuthenticated && !isGoogleEmailAllowed
                    ? 'E-mail Não Autorizado'
                    : 'Login com Google Obrigatório'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-300/85 mt-2 leading-relaxed">
                  {isGoogleAuthenticated && !isGoogleEmailAllowed ? (
                    <>
                      A conta Google{' '}
                      <strong className="text-rose-300 font-mono">{googleAuthEmail}</strong> não
                      consta na <strong>Lista de E-mails Liberados</strong>. Somente operadores
                      autorizados podem acessar o XPoint Remote.
                    </>
                  ) : (
                    <>
                      Para acessar os terminais do <strong>XPoint Remote</strong>, autentique-se com
                      sua conta <strong>Google</strong> cadastrada na{' '}
                      <strong>Lista de E-mails Liberados</strong>.
                    </>
                  )}
                </p>

                {googleAuthError && (
                  <div className="w-full mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-medium flex items-start gap-2 text-left">
                    <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                    <span>{googleAuthError}</span>
                  </div>
                )}

                {/* Botão Principal: Entrar / Trocar Conta com o Google */}
                <div className="w-full mt-6 space-y-2.5">
                  <button
                    type="button"
                    onClick={loginWithGoogleForRemote}
                    disabled={isCheckingGoogleAuth}
                    className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs sm:text-sm shadow-lg transition-all active:scale-[0.99] flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>
                      {isGoogleAuthenticated && !isGoogleEmailAllowed
                        ? 'Entrar com outra conta Google'
                        : 'Entrar com o Google'}
                    </span>
                  </button>

                  {isGoogleAuthenticated && (
                    <button
                      type="button"
                      onClick={logoutGoogleForRemote}
                      className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs border border-white/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <LogOut size={13} />
                      <span>Desconectar {googleAuthEmail}</span>
                    </button>
                  )}
                </div>

                {/* Rodapé Informativo da Lista de E-mails Liberados */}
                <div className="w-full mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <MailCheck size={13} className="text-emerald-400 shrink-0" />
                    <span>{allowedGoogleEmails.length} e-mail(s) liberado(s)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAllowlistModalOpen(true)}
                    className="text-indigo-400 hover:text-indigo-300 font-bold underline underline-offset-2 cursor-pointer"
                  >
                    Ver / Gerenciar Lista
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Iframe do XPoint Remote (exibido somente quando autenticado com Google e autorizado na lista) */}
          {isAccessGranted && (
            <iframe
              ref={setRefs}
              id="xpoint-remote-iframe"
              src={initialIframeSrc}
              title="XPoint Remote — Acesso Remoto"
              allow="clipboard-write"
              style={{ width: '100%', height: '100%', border: 0 }}
            />
          )}
        </div>

        {/* MODAL DE GESTÃO DA LISTA DE E-MAILS LIBERADOS (GOOGLE OAUTH) */}
        {isAllowlistModalOpen && (
          <div
            className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setIsAllowlistModalOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-white dark:bg-[#182229] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Cabeçalho do Modal */}
              <div className="px-6 py-4 bg-slate-50 dark:bg-[#111b21] border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shrink-0">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Lista de E-mails Liberados (Google)
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Somente as contas Google listadas abaixo têm permissão para logar.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAllowlistModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Status da Conta Google Atual */}
              <div className="px-6 pt-4">
                <div
                  className={cn(
                    'p-3.5 rounded-2xl border flex items-center justify-between gap-3',
                    isAccessGranted
                      ? 'bg-emerald-500/10 border-emerald-500/25'
                      : 'bg-amber-500/10 border-amber-500/25'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                      Sua Sessão Google Atual
                    </span>
                    {isGoogleAuthenticated && googleAuthEmail ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {googleAuthName ? `${googleAuthName} (${googleAuthEmail})` : googleAuthEmail}
                        </span>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0',
                            isGoogleEmailAllowed
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300'
                              : 'bg-rose-500/20 text-rose-600 dark:text-rose-300'
                          )}
                        >
                          {isGoogleEmailAllowed ? 'Liberado' : 'Bloqueado'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-300">
                        Nenhuma conta Google autenticada no momento
                      </span>
                    )}
                  </div>

                  {isGoogleAuthenticated ? (
                    <button
                      type="button"
                      onClick={logoutGoogleForRemote}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                    >
                      <LogOut size={12} />
                      <span>Trocar / Sair</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={loginWithGoogleForRemote}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                    >
                      <span>Logar com Google</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Formulário para Adicionar Novo E-mail Google Liberado */}
              <form onSubmit={handleAddEmailSubmit} className="px-6 pt-4">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">
                  Liberar Novo E-mail Google
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={newAllowedEmail}
                    onChange={(e) => setNewAllowedEmail(e.target.value)}
                    placeholder="ex: colaborador@gmail.com"
                    className="flex-1 bg-slate-100 dark:bg-[#111b21] border border-slate-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-emerald-500 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={isSavingEmail || !newAllowedEmail.trim()}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {isSavingEmail ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    <span>Liberar E-mail</span>
                  </button>
                </div>
                {allowlistFormError && (
                  <p className="text-xs text-rose-500 font-semibold mt-1.5">{allowlistFormError}</p>
                )}
              </form>

              {/* Lista de E-mails Autorizados */}
              <div className="px-6 py-4 flex-1 overflow-y-auto">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center justify-between">
                  <span>E-mails Autorizados ({allowedGoogleEmails.length})</span>
                  <span className="text-[10px] font-normal">Sincronizado com a Empresa</span>
                </div>
                <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                  {allowedGoogleEmails.map((emailItem) => {
                    const isDefaultAdmin = DEFAULT_ALLOWED_GOOGLE_EMAILS.map(normalizeEmail).includes(
                      normalizeEmail(emailItem)
                    );
                    const isCurrent =
                      googleAuthEmail && normalizeEmail(googleAuthEmail) === normalizeEmail(emailItem);

                    return (
                      <div
                        key={emailItem}
                        className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#111b21]/80 border border-slate-200/70 dark:border-white/5 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <MailCheck
                            size={15}
                            className={cn(
                              'shrink-0',
                              isDefaultAdmin ? 'text-indigo-500' : 'text-emerald-500'
                            )}
                          />
                          <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {emailItem}
                          </span>
                          {isDefaultAdmin && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold shrink-0">
                              Admin Master
                            </span>
                          )}
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 text-[10px] font-bold shrink-0">
                              Você
                            </span>
                          )}
                        </div>

                        {!isDefaultAdmin && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(emailItem)}
                            className="p-1.5 rounded-lg hover:bg-rose-500/15 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                            title={`Remover ${emailItem} da lista de e-mails liberados`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rodapé do Modal */}
              <div className="px-6 py-3.5 bg-slate-50 dark:bg-[#111b21] border-t border-slate-200 dark:border-white/10 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsAllowlistModalOpen(false)}
                  className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-[#202c33] hover:bg-slate-300 dark:hover:bg-[#2a3942] text-slate-800 dark:text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Concluir
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};

export default XPointRemoteSidePanel;

