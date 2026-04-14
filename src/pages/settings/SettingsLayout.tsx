import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Settings, Key, Users, CreditCard, Sliders, ArrowLeft } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';

export default function SettingsLayout() {
  const navigate = useNavigate();
  const currentUser = useChatStore(state => state.currentUser);
  const email = currentUser?.email || 'ronaldo.xpointsolucoes@gmail.com';

  const navItemClass = ({ isActive }: { isActive: boolean }) => `
    flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all duration-200 text-sm tracking-tight
    ${isActive 
      ? 'bg-[#2a2a2f] text-white font-medium shadow-sm' 
      : 'text-slate-400 hover:bg-[#232328] hover:text-slate-200'
    }
  `;

  return (
    <div className="flex h-[100dvh] w-full bg-[#18181b] text-slate-200 font-sans overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      
      {/* Settings Left Sidebar */}
      <aside className="w-[280px] bg-[#1e1e24] border-r border-[#2a2a2f] flex flex-col pt-4 relative isolate z-10 shadow-2xl">
        
        {/* Back link & Account info */}
        <div className="px-5 pb-6 border-b border-[#2a2a2f]/60 mb-6">
          <button 
            onClick={() => navigate('/flows')}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft size={16} /> Voltar aos Fluxos
          </button>
          
          <div className="text-sm text-slate-500 truncate max-w-full" title={email}>
            {email}
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3 space-y-8 styled-scrollbar pb-20">
            
          {/* Minha conta */}
          <section>
            <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Minha conta</h3>
            <div className="space-y-0.5">
              <NavLink to="/flows/settings/preferences" className={navItemClass}>
                <Sliders size={16} /> Preferências
              </NavLink>
            </div>
          </section>

          {/* Espaço de Trabalho */}
          <section>
            <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Espaço de trabalho</h3>
            <div className="space-y-0.5">
              <NavLink to="/flows/settings/config" className={navItemClass}>
                <Settings size={16} /> Configurações
              </NavLink>
              <NavLink to="/flows/settings/credentials" className={navItemClass}>
                <Key size={16} /> Credentials
              </NavLink>
              <NavLink to="/flows/settings/members" className={navItemClass}>
                <Users size={16} /> Membros
              </NavLink>
              <NavLink to="/flows/settings/billing" className={navItemClass}>
                <CreditCard size={16} /> Faturamento e uso
              </NavLink>
            </div>
          </section>

        </div>

        {/* Footer Version */}
        <div className="p-5 border-t border-[#2a2a2f]/60">
            <span className="text-xs text-slate-500 font-mono tracking-tight">Versão: 3.1.0</span>
        </div>
      </aside>

      {/* Main Settings Content Area (Outlet) */}
      <main className="flex-1 overflow-y-auto bg-[#18181b] relative">
         <Outlet />
      </main>

    </div>
  );
}
