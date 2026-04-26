import React, { useState, useRef, useEffect } from 'react';
import { Clock, Flag, UserPlus, CheckCircle2, AlertCircle, XCircle, ChevronDown, Check, User, Bot } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

interface ChatOmniMenuProps {
  contactId: string;
}

export const ChatOmniMenu: React.FC<ChatOmniMenuProps> = ({ contactId }) => {
  const { contacts, agents, updateConversationField } = useChatStore();
  const contact = contacts.find(c => c.id === contactId);
  
  const [menuOpen, setMenuOpen] = useState<'status' | 'priority' | 'agent' | null>(null);
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

  const currentStatus = contact.conv_status || 'open';
  const currentPriority = contact.priority || 'medium';
  const currentAgent = agents.find(a => a.id === contact.assigned_to);

  const getStatusVisuals = (status: string) => {
    switch(status) {
      case 'open': return { label: 'Aberta', color: 'text-blue-500 bg-blue-100/50 dark:bg-blue-500/10', icon: AlertCircle };
      case 'resolved': return { label: 'Resolvida', color: 'text-emerald-500 bg-emerald-100/50 dark:bg-emerald-500/10', icon: CheckCircle2 };
      case 'agent_off': return { label: 'Agente Off', color: 'text-rose-500 bg-rose-100/50 dark:bg-rose-500/10', icon: XCircle };
      case 'snoozed': return { label: 'Adiada', color: 'text-amber-500 bg-amber-100/50 dark:bg-amber-500/10', icon: Clock };
      case 'pending': return { label: 'Pendente', color: 'text-purple-500 bg-purple-100/50 dark:bg-purple-500/10', icon: AlertCircle };
      case 'bot': return { label: 'Bot Ativo', color: 'text-indigo-500 bg-indigo-100/50 dark:bg-indigo-500/10', icon: CheckCircle2 };
      case 'teste_robo': return { label: 'Teste Robô', color: 'text-fuchsia-500 bg-fuchsia-100/50 dark:bg-fuchsia-500/10', icon: Bot };
      default: return { label: 'Aberta', color: 'text-blue-500 bg-blue-100/50 dark:bg-blue-500/10', icon: AlertCircle };
    }
  };

  const getPriorityVisuals = (priority: string) => {
    switch(priority) {
      case 'urgent': return { label: 'Urgente', color: 'text-rose-500 bg-rose-100/50 dark:bg-rose-500/10' };
      case 'high': return { label: 'Alta', color: 'text-orange-500 bg-orange-100/50 dark:bg-orange-500/10' };
      case 'medium': return { label: 'Média', color: 'text-blue-500 bg-blue-100/50 dark:bg-blue-500/10' };
      case 'low': return { label: 'Baixa', color: 'text-slate-500 bg-slate-100/50 dark:bg-slate-500/10' };
      default: return { label: 'Média', color: 'text-blue-500 bg-blue-100/50 dark:bg-blue-500/10' };
    }
  };

  const statusVis = getStatusVisuals(currentStatus);
  const StatusIcon = statusVis.icon;
  const priorityVis = getPriorityVisuals(currentPriority);

  const handleSnooze = (hours: number) => {
    const until = new Date();
    // if hours === -1, it means 'until tomorrow morning 9am'
    if (hours === -1) {
      until.setDate(until.getDate() + 1);
      until.setHours(9, 0, 0, 0);
    } else {
      until.setHours(until.getHours() + hours);
    }
    updateConversationField(contactId, { status: 'snoozed', snoozed_until: until.toISOString() });
    setMenuOpen(null);
  };

  const handleStatusChange = (status: string) => {
    const payload: any = { status };
    if (status !== 'snoozed') {
      payload.snoozed_until = null; // Clear snooze if setting to open/resolved
    }
    updateConversationField(contactId, payload);
    setMenuOpen(null);
  };

  return (
    <div className="flex items-center gap-1 sm:gap-2 mr-2" ref={menuRef}>
      
      {/* PRIORITY DROPDOWN */}
      <div className="relative">
        <button 
          onClick={() => setMenuOpen(menuOpen === 'priority' ? null : 'priority')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border border-transparent hover:border-black/5 dark:hover:border-white/5 transition-all ${priorityVis.color}`}
        >
          <Flag size={14} className={currentPriority === 'urgent' ? 'fill-current' : ''} />
          <span className="hidden sm:inline-block">{priorityVis.label}</span>
          <ChevronDown size={14} className="opacity-50" />
        </button>

        {menuOpen === 'priority' && (
          <div className="absolute top-full mt-2 left-0 w-40 bg-white dark:bg-[#233138] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 dark:border-[#304046] py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
             {['urgent', 'high', 'medium', 'low'].map(p => {
               const pV = getPriorityVisuals(p);
               return (
                 <button 
                   key={p} 
                   onClick={() => { updateConversationField(contactId, { priority: p }); setMenuOpen(null); }}
                   className="w-full text-left px-4 py-2.5 hover:bg-[#f5f6f6] dark:hover:bg-[#111b21] flex items-center justify-between transition-colors"
                 >
                   <div className="flex items-center gap-2">
                     <Flag size={14} className={`${pV.color} rounded-sm p-0.5`} />
                     <span className="text-sm text-gray-700 dark:text-[#d1d7db]">{pV.label}</span>
                   </div>
                   {currentPriority === p && <Check size={14} className="text-[#00a884]"/>}
                 </button>
               )
             })}
          </div>
        )}
      </div>

      {/* AGENT DROPDOWN */}
      <div className="relative hidden sm:block">
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

      {/* STATUS & SNOOZE DROPDOWN */}
      <div className="relative">
        <button 
          onClick={() => setMenuOpen(menuOpen === 'status' ? null : 'status')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-transparent shadow-sm hover:shadow-md transition-all ${statusVis.color}`}
        >
          <StatusIcon size={14} />
          <span className="hidden sm:inline-block">{statusVis.label}</span>
          <ChevronDown size={14} className="opacity-50" />
        </button>

        {menuOpen === 'status' && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-[#233138] rounded-2xl shadow-[0_12px_40px_rgb(0,0,0,0.15)] border border-gray-100 dark:border-[#304046] overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
             
             <div className="p-2 border-b border-gray-100 dark:border-[#304046] flex flex-col gap-1">
               <button onClick={() => handleStatusChange('open')} className="flex items-center justify-between px-3 py-2.5 hover:bg-blue-50/50 dark:hover:bg-blue-500/10 rounded-xl transition-colors">
                 <div className="flex items-center gap-3">
                   <AlertCircle size={16} className="text-blue-500" />
                   <span className="text-sm font-medium text-gray-700 dark:text-[#d1d7db]">Abrir (IA Responde)</span>
                 </div>
                 {currentStatus === 'open' && <Check size={16} className="text-blue-500"/>}
               </button>
               <button onClick={() => handleStatusChange('resolved')} className="flex items-center justify-between px-3 py-2.5 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/10 rounded-xl transition-colors">
                 <div className="flex items-center gap-3">
                   <CheckCircle2 size={16} className="text-emerald-500" />
                   <span className="text-sm font-medium text-gray-700 dark:text-[#d1d7db]">Resolver</span>
                 </div>
                 {currentStatus === 'resolved' && <Check size={16} className="text-emerald-500"/>}
               </button>
               <button onClick={() => handleStatusChange('agent_off')} className="flex items-center justify-between px-3 py-2.5 hover:bg-rose-50/50 dark:hover:bg-rose-500/10 rounded-xl transition-colors">
                 <div className="flex items-center gap-3">
                   <XCircle size={16} className="text-rose-500" />
                   <span className="text-sm font-medium text-gray-700 dark:text-[#d1d7db]">Agente Off (Pausar IA)</span>
                 </div>
                 {currentStatus === 'agent_off' && <Check size={16} className="text-rose-500"/>}
               </button>
               <button onClick={() => handleStatusChange('teste_robo')} className="flex items-center justify-between px-3 py-2.5 hover:bg-fuchsia-50/50 dark:hover:bg-fuchsia-500/10 rounded-xl transition-colors">
                 <div className="flex items-center gap-3">
                   <Bot size={16} className="text-fuchsia-500" />
                   <span className="text-sm font-medium text-gray-700 dark:text-[#d1d7db]">Teste Robô</span>
                 </div>
                 {currentStatus === 'teste_robo' && <Check size={16} className="text-fuchsia-500"/>}
               </button>
             </div>

             <div className="p-2 bg-slate-50/50 dark:bg-[#1e2a30]">
               <div className="px-3 py-1.5 flex items-center gap-2">
                 <Clock size={14} className="text-amber-500" />
                 <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Adiar (Snooze)</span>
               </div>
               
               <div className="mt-1 grid grid-cols-2 gap-1.5 px-2">
                 <button onClick={() => handleSnooze(1)} className="px-2 py-1.5 text-xs text-center border border-gray-200 dark:border-slate-700 rounded-lg hover:border-amber-400 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-400 transition-colors bg-white dark:bg-slate-800">
                    1 Hora
                 </button>
                 <button onClick={() => handleSnooze(4)} className="px-2 py-1.5 text-xs text-center border border-gray-200 dark:border-slate-700 rounded-lg hover:border-amber-400 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-400 transition-colors bg-white dark:bg-slate-800">
                    4 Horas
                 </button>
                 <button onClick={() => handleSnooze(24)} className="px-2 py-1.5 text-xs text-center border border-gray-200 dark:border-slate-700 rounded-lg hover:border-amber-400 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-400 transition-colors bg-white dark:bg-slate-800">
                    Até Amanhã
                 </button>
                 <button onClick={() => handleSnooze(24*7)} className="px-2 py-1.5 text-xs text-center border border-gray-200 dark:border-slate-700 rounded-lg hover:border-amber-400 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-400 transition-colors bg-white dark:bg-slate-800">
                    1 Semana
                 </button>
               </div>
             </div>

          </div>
        )}
      </div>

    </div>
  );
};
