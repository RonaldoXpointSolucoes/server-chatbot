import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { MainSidebar } from './MainSidebar';
import EvolutionModal from './EvolutionModal';
import { useChatStore } from '../store/chatStore';
export function MainLayout() {
  const [showMainSidebar, setShowMainSidebar] = useState(() => window.innerWidth >= 1024);
  const isQRModalOpen = useChatStore(s => s.isQRModalOpen);
  const modalReason = useChatStore(s => s.modalReason);

  return (
    <div className="flex h-[100dvh] w-full min-w-0 bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden font-sans relative">
      {isQRModalOpen && <EvolutionModal 
          targetInstanceName={useChatStore.getState().qrModalTargetInstance}
          onClose={() => {
            useChatStore.getState().closeQRModal();
            useChatStore.getState().setModalReason(null);
          }} 
          overrideReason={modalReason}
      />}

      {/* Mobile Backdrop */}
      {showMainSidebar && (
        <div 
          className="fixed inset-0 bg-black/50 z-[90] lg:hidden animate-in fade-in"
          onClick={() => setShowMainSidebar(false)}
        />
      )}

      {/* Global Sidebar (Estilo SaaS / Chatwoot) */}
      <div 
        className={`fixed lg:static inset-y-0 left-0 z-[100] lg:z-auto flex shrink-0 transition-all duration-300 bg-white dark:bg-[#111b21] border-r border-[#f2f2f2] dark:border-[#222d34] ${
          showMainSidebar 
            ? "translate-x-0 w-[260px] opacity-100 shadow-2xl lg:shadow-none" 
            : "-translate-x-full lg:translate-x-0 w-[260px] lg:w-0 opacity-0 overflow-hidden pointer-events-none lg:pointer-events-auto"
        }`}
      >
        <MainSidebar />
      </div>

      {/* Main Content Area (Outlet renderiza a rota ativa) */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        <Outlet context={{ showMainSidebar, setShowMainSidebar }} />
      </div>
    </div>
  );
}
