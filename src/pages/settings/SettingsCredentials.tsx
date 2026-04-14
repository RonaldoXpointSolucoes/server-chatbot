import React from 'react';
import { UploadCloud } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';

export default function SettingsCredentials() {
  const currentUser = useChatStore(state => state.currentUser);
  const email = currentUser?.email || 'ronaldo.xpointsolucoes@gmail.com';
  const name = 'Modelo';
  const avatarLetter = name.charAt(0).toUpperCase();

  return (
    <div className="w-full max-w-3xl p-10 h-full overflow-y-auto animate-in slide-in-from-right-4 duration-500 fade-in">
      
      {/* Profile Avatar Section */}
      <section className="flex items-center gap-6 mb-10">
        <div className="w-24 h-24 rounded-full bg-[#8b5cf6] flex items-center justify-center text-4xl font-semibold text-white shadow-lg">
          {avatarLetter}
        </div>
        <div>
          <button className="flex items-center gap-2 bg-[#2a2a2f] hover:bg-[#333338] text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700/50">
            <UploadCloud size={16} /> Alterar foto
          </button>
          <p className="text-xs text-slate-500 mt-2">.jpg ou .png, máximo 1MB</p>
        </div>
      </section>

      {/* Form Fields Section */}
      <section className="space-y-6 mb-14">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Nome:</label>
          <input 
            type="text" 
            defaultValue={name}
            className="w-full bg-[#18181b] border border-[#2a2a2f] focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] text-slate-200 rounded-xl px-4 py-3 placeholder-slate-500 transition-all outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Endereço de e-mail:</label>
          <input 
            type="email" 
            defaultValue={email}
            disabled
            className="w-full bg-[#121214] border border-[#2a2a2f] text-slate-500 rounded-xl px-4 py-3 opacity-70 cursor-not-allowed outline-none"
          />
        </div>
      </section>

      {/* API Tokens Section */}
      <section>
        <h2 className="text-2xl font-bold text-slate-100 tracking-tight mb-4">Tokens de API</h2>
        <p className="text-sm text-slate-300 mb-6">
          Esses tokens permitem que outros aplicativos controlem toda a sua conta e typebots. Tenha cuidado!
        </p>
        
        <div className="flex justify-end mb-4">
          <button className="bg-[#2a2a2f] hover:bg-[#333338] text-slate-200 px-5 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            Criar
          </button>
        </div>

        <div className="border-t border-[#2a2a2f] pt-4">
          <table className="w-full text-left text-sm text-slate-400">
            <thead>
              <tr>
                <th className="pb-3 uppercase tracking-wider text-xs font-semibold">Nome</th>
                <th className="pb-3 text-right uppercase tracking-wider text-xs font-semibold">Criado</th>
              </tr>
            </thead>
            <tbody>
              {/* Empty state can just be left empty or show a placeholder */}
              <tr>
                <td colSpan={2} className="text-center py-8 text-slate-500">
                  Nenhum token gerado ainda.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </section>

    </div>
  );
}
