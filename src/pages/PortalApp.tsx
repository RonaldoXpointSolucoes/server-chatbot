import React from 'react';

export default function PortalApp() {
  return (
    <div className="w-full h-full flex flex-col bg-[#f0f2f5] dark:bg-[#111b21]">
      <iframe 
        src="https://portalgastrofood.vercel.app" 
        className="flex-1 w-full border-none"
        title="Portal Gastrofood"
        allow="camera; microphone; fullscreen; display-capture; geolocation"
      />
    </div>
  );
}
