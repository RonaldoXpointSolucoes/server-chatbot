import React, { useState, useMemo } from 'react';
import { useChatStore } from '../store/chatStore';
import { CalendarDays, Clock, Search, X, CheckCircle2, ChevronRight } from 'lucide-react';
import { getContactDisplayName } from './ChatDashboard';
import { format, isToday, isTomorrow, isPast, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { SnoozeModal } from '../components/ChatModals';

export function ScheduleManager() {
  const { contacts, updateConversationField, setActiveChat } = useChatStore();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContactToSnooze, setSelectedContactToSnooze] = useState<string | null>(null);

  // Filtra contatos que estão agendados
  const scheduledContacts = useMemo(() => {
    return contacts
      .filter(c => c.conv_status === 'snoozed' && c.snoozed_until)
      .filter(c => {
        if (!searchTerm) return true;
        const name = getContactDisplayName(c.custom_name || c.name, c.push_name, c.phone).toLowerCase();
        return name.includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => new Date(a.snoozed_until!).getTime() - new Date(b.snoozed_until!).getTime());
  }, [contacts, searchTerm]);

  const handleCancelSnooze = async (contactId: string) => {
    if (window.confirm("Deseja realmente cancelar este agendamento e voltar a conversa para a caixa de entrada?")) {
      await updateConversationField(contactId, { status: 'open', snoozed_until: null });
    }
  };

  const handleOpenChat = (contactId: string) => {
    setActiveChat(contactId);
    navigate('/chat');
  };

  const getStatusBadge = (dateString: string) => {
    const date = new Date(dateString);
    if (isPast(date)) {
      return <span className="px-2.5 py-1 bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 rounded-full text-xs font-bold uppercase tracking-wider">Atrasado</span>;
    }
    
    const minutesLeft = differenceInMinutes(date, new Date());
    if (minutesLeft <= 60) {
      return <span className="px-2.5 py-1 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 rounded-full text-xs font-bold uppercase tracking-wider">Em Breve</span>;
    }
    
    if (isToday(date)) {
      return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 rounded-full text-xs font-bold uppercase tracking-wider">Hoje</span>;
    }
    
    if (isTomorrow(date)) {
      return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 rounded-full text-xs font-bold uppercase tracking-wider">Amanhã</span>;
    }

    return <span className="px-2.5 py-1 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-full text-xs font-bold uppercase tracking-wider">Futuro</span>;
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#f0f2f5] dark:bg-[#111b21] overflow-hidden">
      
      {/* Header */}
      <div className="h-16 px-6 flex items-center justify-between bg-white dark:bg-[#202c33] border-b border-black/5 dark:border-white/5 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400">
            <CalendarDays size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#111b21] dark:text-[#e9edef]">Agenda Interna</h1>
            <p className="text-xs text-[#54656f] dark:text-[#8696a0]">Gerencie seus atendimentos programados</p>
          </div>
        </div>

        <div className="flex-1 max-w-md mx-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar por contato..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#f0f2f5] dark:bg-[#2a3942] border-transparent rounded-xl text-sm outline-none focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#202c33] transition-all text-[#111b21] dark:text-[#e9edef]"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          
          <div className="mb-6 flex items-center gap-2">
            <span className="px-3 py-1 bg-white dark:bg-[#202c33] border border-black/5 dark:border-white/5 rounded-lg text-sm font-semibold text-[#111b21] dark:text-[#e9edef] shadow-sm">
              Total: {scheduledContacts.length}
            </span>
          </div>

          <div className="bg-white dark:bg-[#202c33] rounded-[24px] shadow-sm border border-black/5 dark:border-white/5 overflow-hidden">
            {scheduledContacts.length > 0 ? (
              <div className="divide-y divide-black/5 dark:divide-white/5">
                {scheduledContacts.map(contact => {
                  const date = new Date(contact.snoozed_until!);
                  const formattedDate = format(date, "dd 'de' MMMM", { locale: ptBR });
                  const formattedTime = format(date, "HH:mm");
                  
                  return (
                    <div key={contact.id} className="p-4 hover:bg-[#f5f6f6] dark:hover:bg-[#2a3942] transition-colors flex items-center gap-4 group">
                      <img 
                        src={contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(getContactDisplayName(contact.custom_name || contact.name, contact.push_name, contact.phone))}&background=random`} 
                        alt="" 
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-transparent group-hover:ring-amber-500/30 transition-all cursor-pointer"
                        onClick={() => handleOpenChat(contact.id)}
                      />
                      
                      <div className="flex-1 min-w-0 flex items-center justify-between">
                        <div>
                          <h3 
                            className="font-bold text-[#111b21] dark:text-[#e9edef] cursor-pointer hover:underline truncate"
                            onClick={() => handleOpenChat(contact.id)}
                          >
                            {getContactDisplayName(contact.custom_name || contact.name, contact.push_name, contact.phone)}
                          </h3>
                          <div className="flex items-center gap-2 text-sm text-[#54656f] dark:text-[#8696a0] mt-0.5">
                            <Clock size={14} className="text-amber-500" />
                            <span>{formattedDate} às {formattedTime}</span>
                            <span className="opacity-50 text-[10px]">({format(date, 'dd/MM/yyyy')})</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          {getStatusBadge(contact.snoozed_until!)}
                          
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => setSelectedContactToSnooze(contact.id)}
                              className="px-3 py-1.5 bg-[#f0f2f5] dark:bg-[#111b21] hover:bg-[#00a884]/10 hover:text-[#00a884] text-[#54656f] dark:text-[#8696a0] text-sm font-medium rounded-lg transition-colors border border-transparent hover:border-[#00a884]/30"
                            >
                              Remarcar
                            </button>
                            <button 
                              onClick={() => handleCancelSnooze(contact.id)}
                              className="px-3 py-1.5 bg-[#f0f2f5] dark:bg-[#111b21] hover:bg-red-500/10 hover:text-red-500 text-[#54656f] dark:text-[#8696a0] text-sm font-medium rounded-lg transition-colors border border-transparent hover:border-red-500/30"
                            >
                              Cancelar
                            </button>
                            <button 
                              onClick={() => handleOpenChat(contact.id)}
                              className="w-8 h-8 flex items-center justify-center bg-[#00a884] text-white rounded-full shadow-md hover:scale-105 transition-transform"
                              title="Abrir Chat"
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-[#f0f2f5] dark:bg-[#111b21] rounded-full flex items-center justify-center text-[#54656f] dark:text-[#8696a0] mb-4 shadow-inner">
                  <CheckCircle2 size={32} className="text-emerald-500 opacity-80" />
                </div>
                <h2 className="text-xl font-bold text-[#111b21] dark:text-[#e9edef] mb-2">Tudo Limpo!</h2>
                <p className="text-sm text-[#54656f] dark:text-[#8696a0] max-w-sm">
                  {searchTerm ? "Nenhum agendamento encontrado para sua busca." : "Você não tem nenhum atendimento agendado para o futuro."}
                </p>
              </div>
            )}
          </div>

        </div>
      </div>

      <SnoozeModal 
        isOpen={!!selectedContactToSnooze}
        onClose={() => setSelectedContactToSnooze(null)}
        contactId={selectedContactToSnooze || ''}
      />
    </div>
  );
}
