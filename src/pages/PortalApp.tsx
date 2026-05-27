import { useEffect } from 'react';

export default function PortalApp() {
  const url = "https://portalgastrofood.vercel.app";

  useEffect(() => {
    // Redireciona na mesma aba caso o usuário caia aqui
    window.location.href = url;
  }, []);

  return (
    <div className="flex-1 w-full h-full bg-[#f0f2f5] dark:bg-[#111b21] flex flex-col overflow-hidden items-center justify-center p-6">
      <div className="text-center animate-in fade-in zoom-in duration-500">
        {/* Container Premium em Glassmorphism */}
        <div className="bg-white/80 dark:bg-[#202c33]/80 backdrop-blur-md max-w-md w-full rounded-3xl border border-[#d1d7db]/40 dark:border-[#222d34]/40 p-10 flex flex-col items-center shadow-2xl">
          <div className="w-20 h-20 bg-rose-50 dark:bg-rose-500/10 rounded-full flex items-center justify-center mb-6 shadow-inner animate-pulse">
            <div className="w-10 h-10 rounded-full border-4 border-rose-500 border-t-transparent animate-spin"></div>
          </div>
          
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3 tracking-tight">
            Redirecionando
          </h1>
          
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 leading-relaxed">
            Estamos abrindo o Portal GastroFood com segurança.
          </p>
          
          <span className="text-xs text-rose-500 dark:text-rose-400 font-medium">
            Se não for redirecionado automaticamente, <a href={url} className="underline hover:text-rose-600">clique aqui</a>.
          </span>
        </div>
      </div>
    </div>
  );
}
