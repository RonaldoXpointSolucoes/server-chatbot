import React from 'react';

export default function DeliveryApp() {
  return (
    <div className="flex-1 w-full h-full bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden">
      <iframe
        src="https://portalappmotoboy.vercel.app"
        title="Gestor Delivery"
        className="w-full h-full border-none"
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
      />
    </div>
  );
}
