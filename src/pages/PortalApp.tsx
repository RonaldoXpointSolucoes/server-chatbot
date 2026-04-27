import { ExternalLink, ShieldAlert, Store } from 'lucide-react';

export default function PortalApp() {
  const url = "https://portalgastrofood.vercel.app";

  return (
    <div className="flex-1 w-full h-full bg-[#f0f2f5] dark:bg-[#111b21] flex flex-col overflow-hidden items-center justify-center p-6">
      
      <div className="bg-white dark:bg-[#202c33] max-w-md w-full rounded-2xl shadow-sm border border-[#d1d7db] dark:border-[#222d34] p-8 flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
        
        <div className="w-20 h-20 bg-rose-50 dark:bg-rose-500/10 rounded-full flex items-center justify-center mb-6 shadow-inner">
          <Store size={40} className="text-rose-500" />
        </div>

        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3">
          Portal GastroFood
        </h1>
        
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
          Para garantir o funcionamento correto do login e a segurança dos seus dados de acesso, este aplicativo precisa ser aberto em uma nova aba segura do navegador.
        </p>

        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-medium transition-all shadow-md shadow-rose-600/20 hover:shadow-lg hover:shadow-rose-600/30 hover:-translate-y-0.5"
        >
          <span>Abrir Portal com Segurança</span>
          <ExternalLink size={18} />
        </a>

        <div className="mt-8 flex items-center gap-2 justify-center px-4 py-2.5 bg-amber-50 dark:bg-amber-500/10 rounded-lg border border-amber-200 dark:border-amber-500/20">
          <ShieldAlert size={16} className="text-amber-500" />
          <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
            Bloqueio de cookies de terceiros evitado.
          </span>
        </div>

      </div>

    </div>
  );
}
