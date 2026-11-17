import React from 'react';
import { X } from 'lucide-react';

export type DevLoggerModalAccent = 'emerald' | 'purple' | 'indigo' | 'cyan' | 'amber';

interface AccentTheme {
  border: string;
  topGlow: string;
  bottomGlow: string;
  headerBg: string;
  iconBox: string;
}

const ACCENT_THEMES: Record<DevLoggerModalAccent, AccentTheme> = {
  emerald: {
    border: 'border-emerald-500/30',
    topGlow: 'bg-emerald-500/15',
    bottomGlow: 'bg-teal-500/15',
    headerBg: 'from-emerald-500/15 via-teal-500/10 to-transparent',
    iconBox: 'bg-gradient-to-tr from-emerald-500/25 via-teal-500/20 to-cyan-500/20 border-emerald-500/40 text-emerald-300 shadow-emerald-500/20',
  },
  purple: {
    border: 'border-purple-500/35',
    topGlow: 'bg-purple-500/15',
    bottomGlow: 'bg-indigo-500/15',
    headerBg: 'from-purple-500/15 via-indigo-500/10 to-transparent',
    iconBox: 'bg-gradient-to-tr from-purple-600/30 via-indigo-500/25 to-pink-500/25 border-purple-500/40 text-purple-300 shadow-purple-500/25',
  },
  indigo: {
    border: 'border-indigo-500/30',
    topGlow: 'bg-indigo-500/15',
    bottomGlow: 'bg-cyan-500/15',
    headerBg: 'from-indigo-500/15 via-blue-500/10 to-transparent',
    iconBox: 'bg-gradient-to-tr from-indigo-500/25 via-blue-500/20 to-cyan-500/20 border-indigo-500/40 text-indigo-300 shadow-indigo-500/20',
  },
  cyan: {
    border: 'border-cyan-500/30',
    topGlow: 'bg-cyan-500/15',
    bottomGlow: 'bg-teal-500/15',
    headerBg: 'from-cyan-500/15 via-teal-500/10 to-transparent',
    iconBox: 'bg-gradient-to-tr from-cyan-500/25 via-teal-500/20 to-indigo-500/20 border-cyan-500/40 text-cyan-300 shadow-cyan-500/20',
  },
  amber: {
    border: 'border-amber-500/30',
    topGlow: 'bg-amber-500/15',
    bottomGlow: 'bg-orange-500/15',
    headerBg: 'from-amber-500/15 via-orange-500/10 to-transparent',
    iconBox: 'bg-gradient-to-tr from-amber-500/25 via-orange-500/20 to-rose-500/20 border-amber-500/40 text-amber-300 shadow-amber-500/20',
  },
};

interface DevLoggerModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  icon: React.ReactNode;
  accent?: DevLoggerModalAccent;
  maxWidthClass?: string;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Moldura responsiva compartilhada para modais do Antigravity DevLogger.
 * Atua como Bottom Sheet ergonômica no celular e Glass Modal flutuante no tablet/desktop.
 */
export const DevLoggerModalShell: React.FC<DevLoggerModalShellProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  icon,
  accent = 'emerald',
  maxWidthClass = 'max-w-2xl',
  headerExtra,
  footer,
  children,
}) => {
  if (!isOpen) return null;

  const theme = ACCENT_THEMES[accent];

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-x-hidden"
      onClick={onClose}
    >
      <div
        className={`bg-[#090f15]/95 backdrop-blur-2xl border-t sm:border ${theme.border} rounded-t-[28px] sm:rounded-3xl shadow-[0_25px_85px_rgba(0,0,0,0.92)] w-full ${maxWidthClass} max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden text-slate-200 relative animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 safe-bottom-padding`}
        onClick={(e) => e.stopPropagation()}
        onScroll={(e) => {
          if (e.currentTarget.scrollTop !== 0) e.currentTarget.scrollTop = 0;
          if (e.currentTarget.scrollLeft !== 0) e.currentTarget.scrollLeft = 0;
        }}
      >
        {/* Brilhos radiais sutis encapsulados para não expandir scrollWidth/scrollHeight do card */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-t-[28px] sm:rounded-3xl" aria-hidden="true">
          <div className={`absolute -top-20 -right-20 w-60 h-60 ${theme.topGlow} rounded-full blur-3xl`} />
          <div className={`absolute -bottom-20 -left-20 w-60 h-60 ${theme.bottomGlow} rounded-full blur-3xl`} />
        </div>

        {/* Alça tátil de Bottom Sheet no celular */}
        <div
          onClick={onClose}
          className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0 cursor-pointer relative z-10"
          title="Toque para fechar"
        >
          <div className="w-11 h-1.5 rounded-full bg-white/25" />
        </div>

        {/* Header */}
        <div className={`px-4 sm:px-5 pt-2 sm:pt-4 pb-3.5 border-b border-white/10 flex flex-col gap-3 bg-gradient-to-r ${theme.headerBg} relative z-10 shrink-0`}>
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center shadow-lg shrink-0 ${theme.iconBox}`}>
                {icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-black text-white tracking-tight truncate">
                    {title}
                  </h3>
                  {badge}
                </div>
                {subtitle && (
                  <div className="text-[11px] text-slate-300/90 mt-0.5 leading-snug">
                    {subtitle}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-300 hover:text-white bg-white/5 hover:bg-white/15 border border-white/10 min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] flex items-center justify-center rounded-2xl transition-all cursor-pointer active:scale-95 shrink-0"
              aria-label={`Fechar ${title}`}
            >
              <X size={18} />
            </button>
          </div>

          {headerExtra}
        </div>

        {/* Corpo Rolável */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 custom-scrollbar relative z-10">
          {children}
        </div>

        {/* Footer Opcional */}
        {footer && (
          <div className="px-4 sm:px-5 py-3.5 border-t border-white/10 bg-[#060a0f]/95 relative z-10 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
