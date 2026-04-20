import React, { useState, useEffect } from 'react';
import { Mouse, Monitor, ChevronDown, Moon, Sun, Users, UserMinus, CheckCircle2 } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { supabase } from '../../services/supabase';

export default function SettingsPreferences() {
  const [navStyle, setNavStyle] = useState<'mouse'|'trackpad'>('trackpad');
  const [theme, setTheme] = useState<'light'|'dark'|'system'>('dark');
  const [language, setLanguage] = useState('Português (BR)');
  
  const [ignoreGroups, setIgnoreGroups] = useState<boolean>(true);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const tenantId = useChatStore(state => state.tenantId);

  useEffect(() => {
    if (tenantId) {
       loadCompanySettings();
    }
  }, [tenantId]);

  const loadCompanySettings = async () => {
     try {
       const { data, error } = await supabase.from('companies').select('ignore_groups').eq('tenant_id', tenantId).single();
       if (!error && data) {
          setIgnoreGroups(data.ignore_groups !== false); // default is true
       }
     } catch (err) {
       console.error("Erro ao carregar cfg de grupos", err);
     } finally {
       setIsLoadingGroups(false);
     }
  };

  const handleUpdateGroupBehaviour = async (ignore: boolean) => {
     setIgnoreGroups(ignore);
     try {
        const { error } = await supabase.from('companies').update({ ignore_groups: ignore }).eq('tenant_id', tenantId);
        if (error) throw error;
        // Optionally you can uncomment line below to show an alert
        // alert('Preferência de grupos atualizada com sucesso!');
     } catch (err) {
        alert('Erro ao salvar configuração.');
        setIgnoreGroups(!ignore); // rollback
     }
  };

  return (
    <div className="w-full max-w-4xl p-10 h-full overflow-y-auto animate-in slide-in-from-right-4 duration-500 fade-in">
      
      {/* Header Info */}
      <h1 className="text-3xl font-bold text-slate-100 tracking-tight mb-12">Preferências</h1>

      {/* Seção Idioma */}
      <section className="mb-14 flex items-center gap-6">
        <h2 className="text-lg font-semibold text-slate-200">Idioma</h2>
        <button className="flex items-center gap-2 bg-[#202024] hover:bg-[#2a2a2f] border border-[#2e2e33] px-3 py-1.5 rounded-lg text-sm text-slate-300 transition-colors">
            {language} <ChevronDown size={14} className="text-slate-500" />
        </button>
      </section>

      {/* Seção Navegação do Editor */}
      <section className="mb-14">
        <h2 className="text-lg font-semibold text-slate-200 mb-6 font-display">Navegação do Editor</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
           
           {/* Card Mouse */}
           <button 
             onClick={() => setNavStyle('mouse')}
             className={`flex flex-col items-center justify-center p-8 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${
               navStyle === 'mouse' 
               ? 'bg-[#1e1e24] border-[#00a884] ring-2 ring-[#00a884]/20' 
               : 'bg-[#18181b] border-[#2a2a2f] hover:border-slate-600 hover:bg-[#1c1c20]'
             }`}
           >
              <div className={`mb-6 p-4 rounded-xl transition-colors ${navStyle === 'mouse' ? 'bg-[#00a884]/10 text-[#00a884]' : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'}`}>
                 <Mouse size={32} strokeWidth={1.5} />
              </div>
              <h3 className="text-base font-bold text-slate-200 mb-2">Mouse</h3>
              <p className="text-xs text-slate-400 text-center leading-relaxed">
                  Mova arrastando o quadro e amplie/reduza usando a roda de rolagem
              </p>
              
              <div className="mt-8 relative flex items-center justify-center">
                 <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${navStyle === 'mouse' ? 'border-[#00a884]' : 'border-slate-600'}`}>
                    {navStyle === 'mouse' && <div className="w-1.5 h-1.5 rounded-full bg-[#00a884]" />}
                 </div>
              </div>
           </button>

           {/* Card Trackpad */}
           <button 
             onClick={() => setNavStyle('trackpad')}
             className={`flex flex-col items-center justify-center p-8 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${
               navStyle === 'trackpad' 
               ? 'bg-[#1e1e24] border-orange-500 ring-2 ring-orange-500/20' 
               : 'bg-[#18181b] border-[#2a2a2f] hover:border-slate-600 hover:bg-[#1c1c20]'
             }`}
           >
              <div className={`mb-6 p-4 rounded-xl transition-colors ${navStyle === 'trackpad' ? 'bg-orange-500/10 text-orange-500' : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'}`}>
                 <Monitor size={32} strokeWidth={1.5} />
              </div>
              <h3 className="text-base font-bold text-slate-200 mb-2">Trackpad</h3>
              <p className="text-xs text-slate-400 text-center leading-relaxed">
                  Mova o quadro usando 2 dedos e amplie/reduza fazendo pinça
              </p>
              
              <div className="mt-8 relative flex items-center justify-center">
                 <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${navStyle === 'trackpad' ? 'border-orange-500' : 'border-slate-600'}`}>
                    {navStyle === 'trackpad' && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                 </div>
              </div>
           </button>

        </div>
      </section>

      {/* Seção Aparência */}
      <section>
        <h2 className="text-lg font-semibold text-slate-200 mb-6 font-display">Aparência</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
           
           {/* Card Claro */}
           <button 
             onClick={() => setTheme('light')}
             className={`p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden group flex flex-col items-center ${
               theme === 'light' 
               ? 'bg-[#1e1e24] border-[#00a884] ring-2 ring-[#00a884]/20' 
               : 'bg-[#18181b] border-[#2a2a2f] hover:border-slate-600 hover:bg-[#1c1c20]'
             }`}
           >
             <div className="w-full h-32 bg-slate-200 rounded-lg mb-6 border border-slate-300 relative overflow-hidden shadow-inner flex flex-col pt-3 px-3 gap-2">
                 {/* Mini mock UI Claro */}
                 <div className="w-full h-4 bg-white rounded flex items-center px-2">
                     <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
                 </div>
                 <div className="flex-1 bg-white rounded-t shadow-sm border border-slate-200 flex p-2 gap-2">
                     <div className="w-1/3 bg-slate-50 rounded" />
                     <div className="flex-1 bg-slate-100/50 rounded flex justify-end items-end p-2">
                         <div className="w-16 h-4 bg-[#00a884]/20 rounded" />
                     </div>
                 </div>
             </div>
             
             <div className="flex items-center gap-3">
                 <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${theme === 'light' ? 'border-[#00a884]' : 'border-slate-600'}`}>
                    {theme === 'light' && <div className="w-1.5 h-1.5 rounded-full bg-[#00a884]" />}
                 </div>
                 <span className="font-medium text-slate-300">Claro</span>
             </div>
           </button>

           {/* Card Escuro (Typebot like) */}
           <button 
             onClick={() => setTheme('dark')}
             className={`p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden group flex flex-col items-center ${
               theme === 'dark' 
               ? 'bg-[#1e1e24] border-orange-500 ring-2 ring-orange-500/20' 
               : 'bg-[#18181b] border-[#2a2a2f] hover:border-slate-600 hover:bg-[#1c1c20]'
             }`}
           >
             <div className="w-full h-32 bg-[#121214] rounded-lg mb-6 border border-[#2a2a2f] relative overflow-hidden shadow-sm flex flex-col pt-3 px-3 gap-2">
                 {/* Mini mock UI Escuro */}
                 <div className="w-full h-4 bg-[#202024] rounded flex items-center px-2">
                     <div className="w-10 h-1.5 bg-slate-600 rounded-full" />
                 </div>
                 <div className="flex-1 bg-[#1a1a1e] rounded-t shadow-sm border border-[#2a2a2f] flex p-2 gap-2">
                     <div className="w-1/3 bg-[#202024] rounded" />
                     <div className="flex-1 bg-[#202024]/50 rounded flex justify-end items-end p-2">
                         <div className="w-16 h-4 bg-orange-500/20 rounded" />
                     </div>
                 </div>
             </div>
             
             <div className="flex items-center gap-3">
                 <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${theme === 'dark' ? 'border-orange-500' : 'border-slate-600'}`}>
                    {theme === 'dark' && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                 </div>
                 <span className="font-medium text-slate-300">Escuro</span>
             </div>
           </button>

           {/* Card Sistema */}
           <button 
             onClick={() => setTheme('system')}
             className={`p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden group flex flex-col items-center ${
               theme === 'system' 
               ? 'bg-[#1e1e24] border-[#00a884] ring-2 ring-[#00a884]/20' 
               : 'bg-[#18181b] border-[#2a2a2f] hover:border-slate-600 hover:bg-[#1c1c20]'
             }`}
           >
             <div className="w-full h-32 rounded-lg mb-6 border border-slate-700 relative overflow-hidden shadow-sm flex flex-col pt-3 px-3 gap-2 bg-gradient-to-r from-slate-200 to-[#121214]">
                 {/* Half & Half */}
             </div>
             
             <div className="flex items-center gap-3">
                 <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${theme === 'system' ? 'border-[#00a884]' : 'border-slate-600'}`}>
                    {theme === 'system' && <div className="w-1.5 h-1.5 rounded-full bg-[#00a884]" />}
                 </div>
                 <span className="font-medium text-slate-300">Sistema</span>
             </div>
           </button>

         </div>
      </section>

      {/* Seção Comportamento de Grupos (Premium UI) */}
      <section className="mt-14 mb-20 animate-in slide-in-from-bottom-4 duration-700">
        <h2 className="text-xl font-bold text-slate-100 mb-2 font-display">Comportamento de Grupos do WhatsApp</h2>
        <p className="text-sm text-slate-400 mb-8">Defina como o servidor deve lidar com mensagens de grupos. Desativar a leitura de grupos poupa recursos da sua VPS.</p>
        
        {isLoadingGroups ? (
           <div className="flex items-center gap-4 text-slate-400">
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent border-[#00a884] animate-spin"></div>
              <span>Carregando preferências...</span>
           </div>
        ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
              
              {/* Card Ignorar Grupos */}
              <button 
                onClick={() => handleUpdateGroupBehaviour(true)}
                className={`p-6 rounded-3xl border transition-all duration-300 relative overflow-hidden group flex flex-col items-start ${
                  ignoreGroups
                  ? 'bg-[#1e1e24] border-[#00a884] ring-2 ring-[#00a884]/20 shadow-[0_8px_32px_rgba(0,168,132,0.15)]' 
                  : 'bg-[#18181b] border-[#2a2a2f] hover:border-slate-600 hover:bg-[#1c1c20]'
                }`}
              >
                 <div className={`mb-4 p-4 rounded-2xl transition-colors ${ignoreGroups ? 'bg-[#00a884]/10 text-[#00a884]' : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'}`}>
                    <UserMinus size={32} strokeWidth={1.5} />
                 </div>
                 <h3 className="text-lg font-bold text-slate-100 mb-2 flex items-center gap-2">
                    Ignorar Grupos 
                    {ignoreGroups && <CheckCircle2 size={16} className="text-[#00a884]" />}
                 </h3>
                 <p className="text-xs text-slate-400 text-left leading-relaxed">
                     O servidor Node <strong>não processa</strong> nem salva mensagens de grupos. Mais leve, seguro contra spam, ideal se você foca apenas em Atendimento 1 a 1.
                 </p>
              </button>

              {/* Card Mostrar Grupos */}
              <button 
                onClick={() => handleUpdateGroupBehaviour(false)}
                className={`p-6 rounded-3xl border transition-all duration-300 relative overflow-hidden group flex flex-col items-start ${
                  !ignoreGroups 
                  ? 'bg-[#1e1e24] border-blue-500 ring-2 ring-blue-500/20 shadow-[0_8px_32px_rgba(59,130,246,0.15)]' 
                  : 'bg-[#18181b] border-[#2a2a2f] hover:border-slate-600 hover:bg-[#1c1c20]'
                }`}
              >
                 <div className={`mb-4 p-4 rounded-2xl transition-colors ${!ignoreGroups ? 'bg-blue-500/10 text-blue-500' : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'}`}>
                    <Users size={32} strokeWidth={1.5} />
                 </div>
                 <h3 className="text-lg font-bold text-slate-100 mb-2 flex items-center gap-2">
                    Mostrar Grupos
                    {!ignoreGroups && <CheckCircle2 size={16} className="text-blue-500" />}
                 </h3>
                 <p className="text-xs text-slate-400 text-left leading-relaxed">
                     O CRM <strong>mapeia e salva</strong> conversas de grupos. Aviso: alto tráfego de mensagens pode consumir mais CPU e disco do seu servidor.
                 </p>
              </button>
           </div>
        )}
      </section>

    </div>
  );
}
