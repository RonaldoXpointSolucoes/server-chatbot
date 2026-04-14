import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { MainSidebar } from './MainSidebar';

export function MainLayout() {
  const [showMainSidebar, setShowMainSidebar] = useState(true);

  return (
    <div className="flex h-[100dvh] w-full min-w-0 bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden font-sans">
      {/* Global Sidebar (Estilo SaaS / Chatwoot) */}
      <div 
        className={`hidden lg:flex shrink-0 transition-all duration-300 ${
          showMainSidebar ? "w-[260px] opacity-100" : "w-0 opacity-0 overflow-hidden"
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
