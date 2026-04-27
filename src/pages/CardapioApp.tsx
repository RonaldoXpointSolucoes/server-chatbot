import React from 'react';
import { useChatStore } from '../store/chatStore';
import { useNavigate } from 'react-router-dom';
import { Link2Off, ArrowRight } from 'lucide-react';

export default function CardapioApp() {
  const tenantInfo = useChatStore(state => state.tenantInfo);
  const navigate = useNavigate();

  const cardapioUrl = tenantInfo?.settings?.link_cardapio;

  if (!cardapioUrl) {
    return (
      <div className="flex-1 w-full h-full bg-[#f0f2f5] dark:bg-[#111b21] flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
        <div className="max-w-md w-full bg-white dark:bg-[#202c33] rounded-[32px] shadow-xl border border-gray-100 dark:border-[#222d34] p-10 text-center relative overflow-hidden">
          {/* Decoração Premium de Fundo */}
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-500/5 to-purple-600/5 pointer-events-none" />
          
          <div className="relative z-10">
            <div className="w-20 h-20 mx-auto bg-gray-50 dark:bg-[#2a3942] rounded-3xl flex items-center justify-center mb-6 shadow-inner border border-gray-100 dark:border-[#304046]">
              <Link2Off size={32} className="text-gray-400 dark:text-[#54656f]" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3">
              Cardápio Não Configurado
            </h2>
            <p className="text-sm text-gray-500 dark:text-[#8696a0] mb-8 leading-relaxed">
              O link do seu Cardápio Digital ainda não foi definido. Acesse as configurações da sua conta para adicionar o link e liberar este aplicativo.
            </p>
            
            <button 
              onClick={() => navigate('/settings/account')}
              className="w-full px-6 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all transform hover:scale-105 active:scale-95"
            >
              Configurar Cardápio
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full h-full bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden">
      <iframe
        src={cardapioUrl}
        title="Cardápio Digital"
        className="w-full h-full border-none"
      />
    </div>
  );
}
