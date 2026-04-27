import React from 'react';

export default function KdsApp() {
  return (
    <div className="flex-1 w-full h-full bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden">
      <iframe
        src="https://gestor-pedidos.vercel.app"
        title="KDS"
        className="w-full h-full border-none"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
      />
    </div>
  );
}
