import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  filterWorkspacesByQuery,
  WorkspaceCompanyItem
} from '../utils/workspaceSwitcher.mjs';

interface WorkspaceSwitcherPopoverProps {
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  companies: WorkspaceCompanyItem[];
  activeTenantId: string | null;
  isLoading: boolean;
  canAccessMasterPanel: boolean;
  onSelectCompany: (company: WorkspaceCompanyItem) => void;
  onRefresh: () => void;
  onOpenMasterPanel: () => void;
  onClose: () => void;
}

const AVATAR_GRADIENTS = [
  'from-emerald-500 to-teal-600',
  'from-indigo-500 to-violet-600',
  'from-cyan-500 to-blue-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600'
];

function getCompanyAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export const WorkspaceSwitcherPopover: React.FC<WorkspaceSwitcherPopoverProps> = ({
  isOpen,
  anchorEl,
  companies,
  activeTenantId,
  isLoading,
  canAccessMasterPanel,
  onSelectCompany,
  onRefresh,
  onOpenMasterPanel,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; maxHeight: number; isMobile: boolean }>({
    top: 72,
    left: 12,
    width: 360,
    maxHeight: 420,
    isMobile: false
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredCompanies = useMemo(
    () => filterWorkspacesByQuery(companies, searchTerm),
    [companies, searchTerm]
  );

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setHighlightedIndex(0);
      return;
    }

    const updatePosition = () => {
      if (typeof window === 'undefined') return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isMobile = vw < 640;
      if (isMobile) {
        setCoords({ top: 0, left: 0, width: vw, maxHeight: Math.round(vh * 0.78), isMobile: true });
        return;
      }

      const rect = anchorEl?.getBoundingClientRect();
      const desiredWidth = Math.min(380, Math.max(320, vw - 24));
      const rawLeft = rect ? rect.left + 8 : 12;
      const clampedLeft = Math.max(12, Math.min(rawLeft, vw - desiredWidth - 12));
      const rawTop = rect ? rect.bottom + 8 : 70;
      const availableBelow = vh - rawTop - 16;
      const maxHeight = Math.max(240, Math.min(460, availableBelow));

      setCoords({
        top: Math.max(12, Math.min(rawTop, vh - 260)),
        left: clampedLeft,
        width: desiredWidth,
        maxHeight,
        isMobile: false
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, anchorEl]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined' && window.innerWidth >= 640 && companies.length > 3) {
        searchInputRef.current?.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown' && filteredCompanies.length > 0) {
        e.preventDefault();
        setHighlightedIndex(prev => (prev + 1) % filteredCompanies.length);
      } else if (e.key === 'ArrowUp' && filteredCompanies.length > 0) {
        e.preventDefault();
        setHighlightedIndex(prev => (prev - 1 + filteredCompanies.length) % filteredCompanies.length);
      } else if (e.key === 'Enter' && filteredCompanies[highlightedIndex]) {
        const target = e.target as HTMLElement | null;
        if (target?.tagName === 'BUTTON') return;
        e.preventDefault();
        onSelectCompany(filteredCompanies[highlightedIndex]);
      }
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, anchorEl, companies.length, filteredCompanies, highlightedIndex, onClose, onSelectCompany]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm]);

  if (!isOpen || typeof document === 'undefined') return null;

  const panelContent = (
    <div
      className="fixed inset-0 z-[99999]"
      role="dialog"
      aria-modal="true"
      aria-label="Selecionar ou trocar empresa"
    >
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 transition-opacity duration-200',
          coords.isMobile
            ? 'bg-slate-950/65 backdrop-blur-sm animate-in fade-in'
            : 'bg-slate-950/20 dark:bg-black/35 backdrop-blur-[1px] animate-in fade-in'
        )}
        onClick={onClose}
      />

      {/* Popover (Desktop/Tablet) ou Bottom Sheet (Mobile) renderizado no Body Portal */}
      <div
        ref={panelRef}
        style={
          coords.isMobile
            ? { maxHeight: `${coords.maxHeight}px` }
            : {
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                width: `${coords.width}px`,
                maxHeight: `${coords.maxHeight}px`
              }
        }
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'fixed flex flex-col overflow-hidden border shadow-[0_20px_50px_rgba(0,0,0,0.35)]',
          'bg-white/95 dark:bg-[#111b21]/95 backdrop-blur-xl',
          'border-slate-200/90 dark:border-white/10 text-slate-900 dark:text-[#e9edef]',
          coords.isMobile
            ? 'inset-x-0 bottom-0 rounded-t-[28px] border-b-0 animate-in slide-in-from-bottom duration-200 pb-[env(safe-area-inset-bottom)]'
            : 'rounded-2xl animate-in fade-in zoom-in-95 duration-150'
        )}
      >
        {coords.isMobile && (
          <div className="flex justify-center pt-2.5 pb-1 shrink-0">
            <span className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-white/20" />
          </div>
        )}

        {/* Header */}
        <div className="px-4 pt-3 pb-2.5 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Building2 size={16} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-extrabold tracking-tight text-slate-900 dark:text-white uppercase">
                  Alternar Empresa
                </h3>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                  {companies.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-[#aebac1] truncate">
                {companies.length === 1
                  ? 'Empresa associada ao seu login'
                  : 'Empresas vinculadas ao seu login'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              title="Atualizar lista de empresas"
              aria-label="Atualizar lista de empresas"
              className="p-2 rounded-xl text-slate-500 hover:text-emerald-600 dark:text-[#aebac1] dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-all"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin text-emerald-500' : ''} />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Fechar seletor (Esc)"
              aria-label="Fechar seletor de empresas"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-[#aebac1] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition-all"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Busca rápida quando há mais de 3 empresas vinculadas ou pesquisa ativa */}
        {(companies.length > 3 || searchTerm.length > 0) && (
          <div className="px-3 py-2.5 border-b border-slate-200/60 dark:border-white/5 shrink-0 bg-slate-50/70 dark:bg-white/[0.02]">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar empresa vinculada..."
                className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-white dark:bg-[#202c33] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#8696a0] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-white"
                  aria-label="Limpar busca"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Lista de empresas vinculadas ao usuário */}
        <div className="flex-1 overflow-y-auto styled-scrollbar p-2.5 space-y-1.5">
          {isLoading && companies.length === 0 ? (
            <div className="space-y-2 p-1" aria-busy="true">
              {[0, 1].map((idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-100/80 dark:bg-white/5 animate-pulse"
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-36 rounded bg-slate-200 dark:bg-white/10" />
                    <div className="h-2.5 w-24 rounded bg-slate-200/70 dark:bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-2">
              <div className="w-11 h-11 rounded-2xl mx-auto bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center">
                <Building2 size={18} className="text-slate-400" />
              </div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {searchTerm
                  ? `Nenhuma empresa encontrada para "${searchTerm}"`
                  : 'Nenhuma outra empresa vinculada'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-[#aebac1]">
                {searchTerm
                  ? 'Tente buscar por outro termo ou limpe o filtro.'
                  : 'Seu login está vinculado apenas à empresa ativa no momento.'}
              </p>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="mt-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                >
                  Limpar filtro
                </button>
              )}
            </div>
          ) : (
            filteredCompanies.map((ws, index) => {
              const isActive = ws.id === activeTenantId;
              const isHighlighted = index === highlightedIndex && !coords.isMobile;
              const isSuspended = String(ws.status || '').toLowerCase() === 'suspended';
              const initial = (ws.name || 'E').trim().substring(0, 1).toUpperCase();

              return (
                <button
                  key={ws.id}
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => onSelectCompany(ws)}
                  className={cn(
                    'w-full min-h-[52px] flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all duration-150',
                    'active:scale-[0.98] focus:outline-none',
                    isActive
                      ? 'bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-teal-500/5 border border-emerald-500/35 shadow-sm'
                      : isHighlighted
                        ? 'bg-slate-100 dark:bg-white/[0.07] border border-slate-200/80 dark:border-white/10'
                        : 'border border-transparent hover:bg-slate-100/80 dark:hover:bg-white/[0.05]'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={cn(
                        'relative w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0 text-white font-black text-xs shadow-sm',
                        getCompanyAvatarGradient(ws.name || 'E')
                      )}
                    >
                      <span>{initial}</span>
                      {isActive && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#111b21]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'text-[13px] truncate',
                            isActive
                              ? 'font-bold text-slate-900 dark:text-white'
                              : 'font-semibold text-slate-700 dark:text-slate-200'
                          )}
                        >
                          {ws.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-slate-500 dark:text-[#8696a0]">
                        {ws.email && <span className="truncate">{ws.email}</span>}
                        {isSuspended && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold shrink-0">
                            Suspensa
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isActive ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shrink-0">
                      <CheckCircle2 size={12} />
                      <span>Ativa</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-500 dark:text-[#aebac1] bg-slate-200/60 dark:bg-white/5 shrink-0">
                      Entrar
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer CTA */}
        {canAccessMasterPanel && (
          <div className="p-2.5 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/90 dark:bg-[#0b141a]/90 shrink-0">
            <button
              type="button"
              onClick={onOpenMasterPanel}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-[#00a884] to-[#008f6f] hover:from-[#00bfa5] hover:to-[#00a884] text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all"
            >
              <Plus size={15} />
              <span>Cadastrar Nova Empresa (Painel Master)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(panelContent, document.body);
};
