import React, { useState, useRef, useEffect } from 'react';
import { UserPlus, XCircle, ChevronDown, Check, User } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

interface ChatOmniMenuProps {
  contactId: string;
}

export const ChatOmniMenu: React.FC<ChatOmniMenuProps> = ({ contactId }) => {
  const { contacts, agents, updateConversationField } = useChatStore();
  const contact = contacts.find(c => c.id === contactId);
  
  const [menuOpen, setMenuOpen] = useState<'agent' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!contact) return null;

  const currentAgent = agents.find(a => a.id === contact.assigned_to);

  return (
    <div className="flex items-center gap-1 sm:gap-2 mr-2" ref={menuRef}>
      {/* AGENT DROPDOWN */}
      <div className="relative">
        <button 
          onClick={() => setMenuOpen(menuOpen === 'agent' ? null : 'agent')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-800/50 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-all border border-transparent"
        >
          {currentAgent ? (
            <>
              <div className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] uppercase font-bold overflow-hidden shadow-sm">
                 {currentAgent.full_name?.substring(0, 2) || <User size={12}/>}
              </div>
              <span className="max-w-[70px] truncate">{currentAgent.full_name?.split(' ')[0]}</span>
            </>
          ) : (
            <>
              <UserPlus size={14} />
              <span>Atribuir</span>
            </>
          )}
          <ChevronDown size={14} className="opacity-50" />
        </button>

        {menuOpen === 'agent' && (
           <div className="absolute right-0 sm:left-0 top-full mt-2 w-56 bg-white dark:bg-[#233138] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-[#304046] py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
             <div className="px-3 pb-2 mb-2 border-b border-gray-100 dark:border-slate-700/50">
               <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Membros da Equipe</span>
             </div>
             
             <button 
                onClick={() => { updateConversationField(contactId, { assigned_to: null }); setMenuOpen(null); }}
                className="w-full text-left px-4 py-2 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center justify-between transition-colors"
             >
                <div className="flex items-center gap-2">
                  <XCircle size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-slate-300 italic">Sem Atribuição</span>
                </div>
                {currentAgent === undefined && <Check size={14} className="text-[#00a884]"/>}
             </button>

             <div className="max-h-60 overflow-y-auto mt-1 custom-scrollbar">
               {agents.map(a => (
                 <button 
                   key={a.id} 
                   onClick={() => { updateConversationField(contactId, { assigned_to: a.id }); setMenuOpen(null); }}
                   className="w-full text-left px-4 py-2.5 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center justify-between transition-colors group"
                 >
                   <div className="flex items-center gap-3">
                     <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
                       {a.full_name?.substring(0, 2).toUpperCase() || 'AG'}
                     </div>
                     <span className="text-sm text-gray-700 dark:text-[#d1d7db] group-hover:text-indigo-500 transition-colors font-medium">{a.full_name}</span>
                   </div>
                   {currentAgent?.id === a.id && <Check size={16} className="text-indigo-500"/>}
                 </button>
               ))}
             </div>
           </div>
        )}
      </div>
    </div>
  );
};
