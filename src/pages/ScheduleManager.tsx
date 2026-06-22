import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useChatStore, AppointmentType } from '../store/chatStore';
import { 
  CalendarDays, 
  Clock, 
  Search, 
  X, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft, 
  Plus, 
  Calendar, 
  ListTodo, 
  User, 
  FileText, 
  Trash2, 
  Check, 
  ArrowRight,
  Sparkles,
  CheckSquare,
  ArrowLeft,
  SlidersHorizontal
} from 'lucide-react';
import { format, isToday, isTomorrow, isPast, addMonths, subMonths, startOfWeek, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

export function ScheduleManager() {
  const { 
    contacts, 
    appointments, 
    agents,
    updateConversationField, 
    setActiveChat, 
    createAppointment,
    updateAppointment,
    deleteAppointment,
    fetchAppointments
  } = useChatStore();

  const navigate = useNavigate();

  // Estados de navegação da Agenda
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [filterType, setFilterType] = useState<'all' | 'appointments' | 'snoozed'>('all');
  const [showSidebar, setShowSidebar] = useState(false);

  // Estados para Modal de Criação / Edição
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [eventTitle, setEventTitle] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventStartTime, setEventStartTime] = useState('09:00');
  const [eventEndTime, setEventEndTime] = useState('10:00');
  const [eventContactId, setEventContactId] = useState<string | null>(null);
  const [eventChecklist, setEventChecklist] = useState<string[]>([]);
  const [checklistInput, setChecklistInput] = useState('');

  // Autocomplete de Contatos
  const [searchContactTerm, setSearchContactTerm] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  // Detalhes do Evento Selecionado
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Navegação do Mini Calendário
  const [miniCalMonth, setMiniCalMonth] = useState<Date>(new Date());

  // Atualizar dados na montagem
  useEffect(() => {
    fetchAppointments();
  }, []);

  // Formata o nome do contato de maneira legível
  const getContactName = (contact: any) => {
    if (!contact) return '';
    return contact.custom_name || contact.name || contact.phone || 'Contato sem nome';
  };

  // Filtrar contatos pelo input no autocomplete
  const filteredContactsForSearch = useMemo(() => {
    if (!searchContactTerm) return [];
    return contacts.filter(c => {
      const name = getContactName(c).toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      return name.includes(searchContactTerm.toLowerCase()) || phone.includes(searchContactTerm.toLowerCase());
    }).slice(0, 5);
  }, [contacts, searchContactTerm]);

  // UnificaAppointments (da tabela `appointments`) e contatos `snoozed_until` (agendados temporariamente)
  const allEvents = useMemo(() => {
    const list: any[] = [];

    // 1. Compromissos da tabela `appointments`
    appointments.forEach(appt => {
      const contact = contacts.find(c => c.id.split('_')[0] === appt.contact_id || c.conv_id === appt.contact_id);
      list.push({
        id: appt.id,
        title: appt.title,
        notes: appt.notes || '',
        start_time: new Date(appt.start_time),
        end_time: new Date(appt.end_time),
        status: appt.status,
        checklist_items: appt.checklist_items || [],
        contact_id: appt.contact_id,
        contact: contact || null,
        type: 'appointment' // compromisso corporativo/anotação
      });
    });

    // 2. Contatos com snooze ativo (Virtual Events)
    contacts.forEach(c => {
      if (c.conv_status === 'snoozed' && c.snoozed_until) {
        const snoozeDate = new Date(c.snoozed_until);
        // criamos uma duração estimada de 30 minutos
        const snoozeEndDate = new Date(snoozeDate.getTime() + 30 * 60 * 1000); 
        list.push({
          id: `snooze-${c.id}`,
          title: `Retorno: ${getContactName(c)}`,
          notes: `Conversa adiada até esta data pelo operador. Ao vencer, o chat reabre automaticamente na caixa de entrada.`,
          start_time: snoozeDate,
          end_time: snoozeEndDate,
          status: 'scheduled',
          checklist_items: [],
          contact_id: c.id,
          contact: c,
          type: 'snoozed_contact'
        });
      }
    });

    // Filtro por Tipo de Evento
    return list.filter(evt => {
      if (filterType === 'appointments') return evt.type === 'appointment';
      if (filterType === 'snoozed') return evt.type === 'snoozed_contact';
      return true;
    });
  }, [appointments, contacts, filterType]);

  // Eventos do Dia Selecionado na Agenda Lateral
  const selectedDayEvents = useMemo(() => {
    return allEvents.filter(evt => isSameDay(evt.start_time, selectedDate))
      .sort((a, b) => a.start_time.getTime() - b.start_time.getTime());
  }, [allEvents, selectedDate]);

  // Mini Calendário: Dias a renderizar
  const miniCalDays = useMemo(() => {
    const startM = startOfMonth(miniCalMonth);
    const endM = endOfMonth(miniCalMonth);
    const startW = startOfWeek(startM, { weekStartsOn: 0 }); // Domingo
    const days = [];
    
    let current = startW;
    // renderiza 6 semanas completas (42 dias) para preencher o mini calendário
    for (let i = 0; i < 42; i++) {
      days.push(current);
      current = addDays(current, 1);
    }
    return days;
  }, [miniCalMonth]);

  // Grade de Horários (para Semana e Dia)
  const hours = useMemo(() => {
    const list = [];
    for (let i = 8; i <= 22; i++) {
      list.push(`${String(i).padStart(2, '0')}:00`);
    }
    return list;
  }, []);

  // Navegar Calendário
  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      setSelectedDate(new Date());
      setMiniCalMonth(new Date());
      return;
    }

    const value = direction === 'next' ? 1 : -1;
    if (viewMode === 'month') {
      setCurrentDate(prev => addMonths(prev, value));
    } else if (viewMode === 'week') {
      setCurrentDate(prev => addDays(prev, value * 7));
    } else {
      setCurrentDate(prev => addDays(prev, value));
    }
  };

  // Abre Modal de Criação
  const openCreateModal = (date?: Date, timeSlot?: string) => {
    setIsEditMode(false);
    setEditingId(null);
    setEventTitle('');
    setEventNotes('');
    
    const targetDate = date || selectedDate;
    setEventDate(format(targetDate, 'yyyy-MM-dd'));
    
    if (timeSlot) {
      setEventStartTime(timeSlot);
      const [hour, min] = timeSlot.split(':');
      const nextHour = String(Number(hour) + 1).padStart(2, '0');
      setEventEndTime(`${nextHour}:${min}`);
    } else {
      setEventStartTime('09:00');
      setEventEndTime('10:00');
    }

    setEventContactId(null);
    setSearchContactTerm('');
    setEventChecklist([]);
    setChecklistInput('');
    setIsCreateModalOpen(true);
  };

  // Abre Modal de Edição
  const openEditModal = (evt: any) => {
    setIsDetailModalOpen(false);
    setIsEditMode(true);
    setEditingId(evt.id);
    setEventTitle(evt.title);
    setEventNotes(evt.notes);
    setEventDate(format(evt.start_time, 'yyyy-MM-dd'));
    setEventStartTime(format(evt.start_time, 'HH:mm'));
    setEventEndTime(format(evt.end_time, 'HH:mm'));
    
    if (evt.contact) {
      setEventContactId(evt.contact.id);
      setSearchContactTerm(getContactName(evt.contact));
    } else {
      setEventContactId(null);
      setSearchContactTerm('');
    }

    setEventChecklist(evt.checklist_items?.map((i: any) => i.text) || []);
    setChecklistInput('');
    setIsCreateModalOpen(true);
  };

  // Salvar Evento (Create / Update)
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventDate || !eventStartTime || !eventEndTime) {
      alert("Por favor, preencha o título, a data e os horários.");
      return;
    }

    const startDateTime = new Date(`${eventDate}T${eventStartTime}:00`);
    const endDateTime = new Date(`${eventDate}T${eventEndTime}:00`);

    if (endDateTime.getTime() <= startDateTime.getTime()) {
      alert("A hora de término deve ser após a hora de início.");
      return;
    }

    const checklistItems = eventChecklist.map((text, idx) => ({
      id: `item-${Date.now()}-${idx}`,
      text,
      completed: false
    }));

    try {
      if (isEditMode && editingId) {
        // Se o id for de snooze, não permite edição direta do agendamento (pois é snooze virtual)
        if (editingId.startsWith('snooze-')) {
          alert('Não é possível editar agendamentos de retorno de forma direta. Use o menu do contato.');
          return;
        }

        await updateAppointment(editingId, {
          title: eventTitle,
          notes: eventNotes,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          contact_id: eventContactId,
          checklist_items: checklistItems
        });
      } else {
        await createAppointment({
          title: eventTitle,
          notes: eventNotes,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          contact_id: eventContactId,
          status: 'scheduled',
          checklist_items: checklistItems
        });
      }

      setIsCreateModalOpen(false);
      // Resetar form
      setEventTitle('');
      setEventNotes('');
      setEventContactId(null);
      setEventChecklist([]);
    } catch (err) {
      console.error("Erro ao salvar compromisso:", err);
      alert("Erro ao salvar o compromisso no banco de dados.");
    }
  };

  // Excluir Evento
  const handleDeleteEvent = async (evtId: string) => {
    if (evtId.startsWith('snooze-')) {
      const realContactId = evtId.replace('snooze-', '');
      if (window.confirm("Deseja realmente cancelar este retorno e reabrir a conversa?")) {
        await updateConversationField(realContactId, { status: 'open', snoozed_until: null });
        setIsDetailModalOpen(false);
      }
      return;
    }

    if (window.confirm("Deseja realmente remover este compromisso?")) {
      try {
        await deleteAppointment(evtId);
        setIsDetailModalOpen(false);
      } catch (e) {
        console.error("Erro ao excluir compromisso:", e);
      }
    }
  };

  // Concluir Evento
  const handleCompleteEvent = async (evt: any) => {
    if (evt.id.startsWith('snooze-')) {
      const realContactId = evt.id.replace('snooze-', '');
      // Se for snooze, conclui reabrindo a conversa e tirando do snooze
      await updateConversationField(realContactId, { status: 'open', snoozed_until: null });
      setIsDetailModalOpen(false);
      return;
    }

    try {
      // Marcar todas as tarefas do checklist como concluídas também
      const updatedChecklist = (evt.checklist_items || []).map((i: any) => ({ ...i, completed: true }));
      await updateAppointment(evt.id, { 
        status: 'completed',
        checklist_items: updatedChecklist
      });
      setIsDetailModalOpen(false);
    } catch (e) {
      console.error("Erro ao concluir compromisso:", e);
    }
  };

  // Alternar conclusão de item do checklist na visualização de detalhes
  const handleToggleChecklistItem = async (evt: any, itemId: string) => {
    if (evt.id.startsWith('snooze-')) return;

    const updatedChecklist = evt.checklist_items.map((item: any) => {
      if (item.id === itemId) return { ...item, completed: !item.completed };
      return item;
    });

    const isAllCompleted = updatedChecklist.every((i: any) => i.completed);
    const newStatus = isAllCompleted ? 'completed' : evt.status;

    try {
      await updateAppointment(evt.id, {
        checklist_items: updatedChecklist,
        status: newStatus
      });
      
      // Atualiza o estado modal local
      setSelectedEvent({
        ...evt,
        checklist_items: updatedChecklist,
        status: newStatus
      });
    } catch (e) {
      console.error("Erro ao alternar checklist da agenda:", e);
    }
  };

  // Ir para o Chat do Contato
  const handleGoToChat = (contactId: string) => {
    setActiveChat(contactId);
    navigate('/chat');
  };

  // Lógica dos Dias no Modo Mês
  const monthDays = useMemo(() => {
    const startM = startOfMonth(currentDate);
    const endM = endOfMonth(currentDate);
    const startW = startOfWeek(startM, { weekStartsOn: 0 });
    
    // Calcula todos os dias para renderizar a grade do mês (geralmente 35 ou 42 dias)
    const days = [];
    let current = startW;
    
    // rodar loop de 42 dias
    for (let i = 0; i < 42; i++) {
      days.push(current);
      current = addDays(current, 1);
    }
    return days;
  }, [currentDate]);

  // Dias da Semana no Modo Semana
  const weekDays = useMemo(() => {
    const startW = startOfWeek(currentDate, { weekStartsOn: 0 });
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(startW, i));
    }
    return days;
  }, [currentDate]);

  return (
    <div className="flex-1 flex bg-[#f0f2f5] dark:bg-[#111b21] h-screen overflow-hidden min-w-0 font-sans">
      
      {/* 1. PAINEL LATERAL ESQUERDO: Mini Calendário e Ações */}
      {showSidebar && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      <div className={`w-72 bg-white dark:bg-[#202c33] border-r border-black/5 dark:border-white/5 flex flex-col shrink-0 overflow-y-auto scrollbar-thin
        fixed inset-y-0 left-0 z-40 transform transition-transform duration-300
        lg:static lg:translate-x-0
        ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
      `}>
        
        {/* Criar Evento */}
        <div className="p-4 border-b border-black/5 dark:border-white/5">
          <button
            onClick={() => {
              openCreateModal();
              setShowSidebar(false);
            }}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Plus size={18} />
            <span>Criar Compromisso</span>
          </button>
        </div>

        {/* Mini Calendário */}
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-extrabold text-gray-800 dark:text-gray-200 capitalize">
              {format(miniCalMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMiniCalMonth(subMonths(miniCalMonth, 1))}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setMiniCalMonth(addMonths(miniCalMonth, 1))}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center gap-y-1">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, idx) => (
              <span key={idx} className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase py-1">
                {day}
              </span>
            ))}

            {miniCalDays.map((day, idx) => {
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentMonth = day.getMonth() === miniCalMonth.getMonth();
              const isTodayDay = isToday(day);

              return (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedDate(day);
                    setCurrentDate(day);
                    setShowSidebar(false);
                  }}
                  className={`
                    h-8 w-8 mx-auto rounded-full text-xs font-semibold transition-all flex items-center justify-center
                    ${isSelected ? 'bg-indigo-600 text-white font-bold scale-105' : ''}
                    ${!isSelected && isTodayDay ? 'border border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold' : ''}
                    ${!isSelected && !isTodayDay && isCurrentMonth ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800' : ''}
                    ${!isSelected && !isTodayDay && !isCurrentMonth ? 'text-gray-300 dark:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/40' : ''}
                  `}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filtros Rápidos */}
        <div className="p-4 border-t border-black/5 dark:border-white/5 flex flex-col gap-3">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Filtrar Agenda
          </span>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => {
                setFilterType('all');
                setShowSidebar(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${filterType === 'all' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-500/10' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#202c33]'}`}
            >
              <span>Todos os Eventos</span>
              <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded-full font-mono text-[9px] text-gray-500">
                {allEvents.length}
              </span>
            </button>
            <button
              onClick={() => {
                setFilterType('appointments');
                setShowSidebar(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${filterType === 'appointments' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-500/10' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#202c33]'}`}
            >
              <span>Compromissos CRM</span>
              <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded-full font-mono text-[9px] text-gray-500">
                {allEvents.filter(e => e.type === 'appointment').length}
              </span>
            </button>
            <button
              onClick={() => {
                setFilterType('snoozed');
                setShowSidebar(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${filterType === 'snoozed' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-500/10' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#202c33]'}`}
            >
              <span>Retornos de Contatos</span>
              <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-800 rounded-full font-mono text-[9px] text-gray-500">
                {allEvents.filter(e => e.type === 'snoozed_contact').length}
              </span>
            </button>
          </div>
        </div>

        {/* Lembretes do Dia */}
        <div className="p-4 border-t border-black/5 dark:border-white/5 flex-1 flex flex-col gap-3">
          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center justify-between">
            <span>Para hoje ({format(new Date(), 'dd/MM')})</span>
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" />
          </span>

          <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[220px] scrollbar-thin">
            {allEvents.filter(e => isSameDay(e.start_time, new Date())).length > 0 ? (
              allEvents.filter(e => isSameDay(e.start_time, new Date()))
                .sort((a,b) => a.start_time.getTime() - b.start_time.getTime())
                .map(evt => (
                  <div 
                    key={evt.id} 
                    onClick={() => {
                      setSelectedEvent(evt);
                      setIsDetailModalOpen(true);
                      setShowSidebar(false);
                    }}
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition-all hover:scale-[1.02] flex flex-col gap-1.5 ${
                      evt.status === 'completed'
                        ? 'bg-gray-50/50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-800 opacity-60'
                        : evt.type === 'snoozed_contact'
                          ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/40'
                          : 'bg-indigo-500/5 dark:bg-indigo-500/10 border-indigo-500/20 hover:border-indigo-500/40'
                    }`}
                  >
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate leading-tight">
                      {evt.title}
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-semibold">
                      <Clock size={11} />
                      <span>{format(evt.start_time, 'HH:mm')}</span>
                      {evt.status === 'completed' && (
                        <span className="ml-auto text-emerald-600 dark:text-emerald-400 font-extrabold uppercase text-[8px] tracking-wider">
                          Feito
                        </span>
                      )}
                    </div>
                  </div>
              ))
            ) : (
              <div className="text-center py-6 text-xs text-gray-400">
                Sem eventos para hoje.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 2. PAINEL PRINCIPAL DE CONTEÚDO (Google Calendar Style) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        
        {/* Cabeçalho da Agenda */}
        <div className="h-auto md:h-16 py-3 md:py-0 px-3 md:px-6 flex flex-col md:flex-row items-center justify-between bg-white dark:bg-[#202c33] border-b border-black/5 dark:border-white/5 shrink-0 shadow-sm z-10 select-none gap-3 md:gap-0">
          <div className="flex flex-wrap items-center gap-2 md:gap-4 lg:gap-6 w-full md:w-auto justify-between md:justify-start">
            
            <div className="flex items-center gap-2">
              {/* Botão Voltar */}
              <button
                onClick={() => navigate(-1)}
                className="p-1.5 hover:bg-gray-150 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                title="Voltar"
              >
                <ArrowLeft size={20} />
              </button>

              {/* Botão Menu Lateral (Mobile) */}
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="lg:hidden p-1.5 hover:bg-gray-150 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                title="Filtros e Calendário"
              >
                <SlidersHorizontal size={20} />
              </button>

              <div className="flex items-center gap-2">
                <CalendarDays className="text-indigo-600 dark:text-indigo-400 hidden sm:block" size={20} />
                <h1 className="text-sm md:text-base font-extrabold text-gray-800 dark:text-gray-100 uppercase tracking-wider hidden sm:block">
                  Agenda Interna
                </h1>
              </div>
            </div>

            {/* Controles de Navegação */}
            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-[#111b21] p-1 rounded-xl border border-black/5 dark:border-white/5">
              <button
                onClick={() => handleNavigate('prev')}
                className="p-1 hover:bg-white dark:hover:bg-gray-800 rounded-lg text-gray-655 dark:text-gray-300 transition-all active:scale-95"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => handleNavigate('today')}
                className="px-2.5 py-0.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-[10px] md:text-xs font-bold text-gray-700 dark:text-gray-200 rounded-lg shadow-sm transition-all active:scale-95"
              >
                Hoje
              </button>
              <button
                onClick={() => handleNavigate('next')}
                className="p-1 hover:bg-white dark:hover:bg-gray-800 rounded-lg text-gray-655 dark:text-gray-300 transition-all active:scale-95"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Título de Data Ativa */}
            <span className="text-xs md:text-sm lg:text-base font-extrabold text-gray-800 dark:text-gray-100 capitalize w-full min-[400px]:w-auto text-center min-[400px]:text-left">
              {format(currentDate, viewMode === 'day' ? "dd 'de' MMMM, yyyy" : 'MMMM yyyy', { locale: ptBR })}
            </span>
          </div>

          {/* Seletor de Modos de Visualização (Mês, Semana, Dia) */}
          <div className="flex items-center bg-gray-100 dark:bg-[#111b21] p-1 rounded-xl border border-black/5 dark:border-white/5 select-none self-end md:self-auto">
            <button
              onClick={() => setViewMode('month')}
              className={`px-2.5 py-0.5 rounded-lg text-[10px] md:text-xs font-bold transition-all ${
                viewMode === 'month' 
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-sm scale-105' 
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Mês
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-2.5 py-0.5 rounded-lg text-[10px] md:text-xs font-bold transition-all ${
                viewMode === 'week' 
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-sm scale-105' 
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-2.5 py-0.5 rounded-lg text-[10px] md:text-xs font-bold transition-all ${
                viewMode === 'day' 
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-sm scale-105' 
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Dia
            </button>
          </div>
        </div>

        {/* Corpo Principal da Grade */}
        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-[#111b21]">
          
          {/* A) MODO MÊS */}
          {viewMode === 'month' && (
            <div className="grid grid-cols-7 grid-rows-6 h-full border-t border-l border-black/5 dark:border-white/5 min-w-[650px]">
              {/* Nomes dos Dias da Semana */}
              {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((dayName, idx) => (
                <div key={idx} className="bg-white dark:bg-[#202c33] py-2 border-b border-r border-black/5 dark:border-white/5 text-center text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">
                  <span className="hidden sm:inline">{dayName}</span>
                  <span className="sm:hidden">{dayName.substring(0, 3)}</span>
                </div>
              ))}

              {/* Dias do Mês */}
              {monthDays.map((day, idx) => {
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isTodayDay = isToday(day);
                const dayEvts = allEvents.filter(e => isSameDay(e.start_time, day))
                  .sort((a,b) => a.start_time.getTime() - b.start_time.getTime());

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedDate(day);
                    }}
                    className={`
                      min-h-[85px] sm:min-h-[100px] p-1.5 sm:p-2 bg-white dark:bg-[#202c33] border-b border-r border-black/5 dark:border-white/5 transition-all flex flex-col gap-1 sm:gap-1.5 relative group cursor-pointer
                      ${isCurrentMonth ? '' : 'bg-gray-50/40 dark:bg-gray-800/10 opacity-55'}
                      ${isSameDay(day, selectedDate) ? 'ring-2 ring-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/5' : ''}
                    `}
                  >
                    {/* Número do Dia */}
                    <div className="flex justify-between items-center">
                      <span className={`
                        text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full
                        ${isTodayDay ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20' : 'text-gray-700 dark:text-gray-300'}
                      `}>
                        {day.getDate()}
                      </span>
                      
                      {/* Botão de Criação Rápida */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openCreateModal(day);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 bg-gray-100 hover:bg-indigo-50 dark:bg-[#111b21] dark:hover:bg-indigo-950 rounded-lg text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all hover:scale-105 active:scale-95"
                      >
                        <Plus size={11} />
                      </button>
                    </div>

                    {/* Lista de Eventos no Quadrado */}
                    <div className="flex-1 flex flex-col gap-1 sm:gap-1.5 overflow-hidden">
                      {dayEvts.slice(0, 3).map(evt => (
                        <div
                          key={evt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(evt);
                            setIsDetailModalOpen(true);
                          }}
                          className={`
                            px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg text-[9px] sm:text-[10px] font-bold truncate transition-all hover:scale-[1.02] border text-left
                            ${evt.status === 'completed'
                              ? 'bg-gray-100/60 text-gray-400 dark:bg-gray-800/50 dark:text-gray-500 border-gray-200/50 dark:border-gray-800'
                              : evt.type === 'snoozed_contact'
                                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400'
                                : 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-400'
                            }
                          `}
                        >
                          <span className="font-semibold text-[8px] sm:text-[9px] opacity-75 mr-1 font-mono">
                            {format(evt.start_time, 'HH:mm')}
                          </span>
                          {evt.title}
                        </div>
                      ))}
                      
                      {dayEvts.length > 3 && (
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(day);
                            setCurrentDate(day);
                            setViewMode('day');
                          }}
                          className="text-[9px] text-indigo-600 dark:text-indigo-400 font-extrabold hover:underline pl-1"
                        >
                          + {dayEvts.length - 3} mais
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* B) MODO SEMANA */}
          {viewMode === 'week' && (
            <div className="flex flex-col h-full min-w-[600px] border-t border-black/5 dark:border-white/5 bg-white dark:bg-[#202c33]">
              {/* Header de Colunas */}
              <div className="flex border-b border-black/5 dark:border-white/5 select-none shrink-0 bg-white dark:bg-[#202c33]">
                {/* Coluna de Horas vazia */}
                <div className="w-20 border-r border-black/5 dark:border-white/5 shrink-0" />
                {/* 7 colunas de dias */}
                {weekDays.map((day, idx) => {
                  const isTodayDay = isToday(day);
                  return (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedDate(day)}
                      className={`flex-1 py-3 text-center border-r border-black/5 dark:border-white/5 flex flex-col items-center gap-1.5 cursor-pointer ${
                        isSameDay(day, selectedDate) ? 'bg-indigo-500/5 dark:bg-indigo-500/5' : ''
                      }`}
                    >
                      <span className="text-[10px] font-black uppercase text-gray-400 dark:text-gray-500">
                        {format(day, 'eee', { locale: ptBR })}
                      </span>
                      <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-extrabold ${
                        isTodayDay ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {day.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Grid de Horários e Eventos */}
              <div className="flex-1 overflow-y-auto scrollbar-thin flex relative">
                {/* Coluna Horas */}
                <div className="w-20 bg-white dark:bg-[#202c33] border-r border-black/5 dark:border-white/5 select-none shrink-0">
                  {hours.map((hour, idx) => (
                    <div key={idx} className="h-16 text-[10px] font-black text-gray-400 dark:text-gray-500 text-right pr-3.5 pt-1 border-b border-black/5 dark:border-white/5">
                      {hour}
                    </div>
                  ))}
                </div>

                {/* 7 colunas de Grade */}
                <div className="flex-1 flex relative">
                  {weekDays.map((day, dIdx) => {
                    const dayEvts = allEvents.filter(e => isSameDay(e.start_time, day));
                    
                    return (
                      <div key={dIdx} className="flex-1 border-r border-black/5 dark:border-white/5 h-[960px] relative bg-white dark:bg-[#202c33] group">
                        {/* Linhas Horizontais */}
                        {hours.map((_, hIdx) => (
                          <div
                            key={hIdx}
                            onClick={() => {
                              setSelectedDate(day);
                              openCreateModal(day, hours[hIdx]);
                            }}
                            className="h-16 border-b border-black/5 dark:border-white/5 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-[#111b21]/30 transition-colors"
                          />
                        ))}

                        {/* Eventos Absolutos na Coluna */}
                        {dayEvts.map(evt => {
                          const startH = evt.start_time.getHours() + (evt.start_time.getMinutes() / 60);
                          const endH = evt.end_time.getHours() + (evt.end_time.getMinutes() / 60);
                          
                          // Ajustamos a escala: a grade começa às 08:00
                          const top = (startH - 8) * 64; // 64px por hora (h-16)
                          const height = Math.max((endH - startH) * 64, 30); // no mínimo 30px
                          
                          if (startH < 8 || startH > 22) return null; // ignora fora do horário comercial visível

                          return (
                            <div
                              key={evt.id}
                              onClick={() => {
                                setSelectedEvent(evt);
                                setIsDetailModalOpen(true);
                              }}
                              style={{ top: `${top}px`, height: `${height}px` }}
                              className={`
                                absolute left-1 right-1 p-2 rounded-xl border flex flex-col text-left cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md z-20 overflow-hidden
                                ${evt.status === 'completed'
                                  ? 'bg-gray-100 text-gray-400 dark:bg-gray-800/80 dark:text-gray-500 border-gray-200 dark:border-gray-850'
                                  : evt.type === 'snoozed_contact'
                                    ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400 shadow-sm shadow-emerald-500/5'
                                    : 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-400 shadow-sm shadow-indigo-500/5'
                                }
                              `}
                            >
                              <span className="text-[10px] font-black leading-tight mb-0.5 truncate">
                                {evt.title}
                              </span>
                              <div className="flex items-center gap-1 text-[8px] font-bold opacity-85">
                                <Clock size={9} />
                                <span>{format(evt.start_time, 'HH:mm')} - {format(evt.end_time, 'HH:mm')}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* C) MODO DIA */}
          {viewMode === 'day' && (
            <div className="flex flex-col h-full bg-white dark:bg-[#202c33]">
              {/* Header do Dia */}
              <div className="py-4 px-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between select-none">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-lg shadow-indigo-500/20">
                    <span className="text-[10px] font-black uppercase leading-none">{format(currentDate, 'eee', { locale: ptBR })}</span>
                    <span className="text-lg font-black leading-none mt-1">{currentDate.getDate()}</span>
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-gray-800 dark:text-white capitalize">
                      {format(currentDate, "EEEE", { locale: ptBR })}
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
                      Compromissos agendados para hoje
                    </p>
                  </div>
                </div>

                <span className="px-3 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-black rounded-lg">
                  {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'compromisso' : 'compromissos'}
                </span>
              </div>

              {/* Grade de Horas Dia */}
              <div className="flex-1 overflow-y-auto scrollbar-thin flex relative">
                {/* Coluna Horas */}
                <div className="w-20 bg-white dark:bg-[#202c33] border-r border-black/5 dark:border-white/5 select-none shrink-0">
                  {hours.map((hour, idx) => (
                    <div key={idx} className="h-16 text-[10px] font-black text-gray-400 dark:text-gray-500 text-right pr-3.5 pt-1 border-b border-black/5 dark:border-white/5">
                      {hour}
                    </div>
                  ))}
                </div>

                {/* Coluna Principal da Grade */}
                <div className="flex-1 h-[960px] relative bg-white dark:bg-[#202c33]">
                  {/* Linhas Horizontais */}
                  {hours.map((_, hIdx) => (
                    <div
                      key={hIdx}
                      onClick={() => {
                        openCreateModal(currentDate, hours[hIdx]);
                      }}
                      className="h-16 border-b border-black/5 dark:border-white/5 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-[#111b21]/30 transition-colors"
                    />
                  ))}

                  {/* Compromissos do Dia */}
                  {selectedDayEvents.map(evt => {
                    const startH = evt.start_time.getHours() + (evt.start_time.getMinutes() / 60);
                    const endH = evt.end_time.getHours() + (evt.end_time.getMinutes() / 60);
                    
                    const top = (startH - 8) * 64; 
                    const height = Math.max((endH - startH) * 64, 30);
                    
                    if (startH < 8 || startH > 22) return null;

                    return (
                      <div
                        key={evt.id}
                        onClick={() => {
                          setSelectedEvent(evt);
                          setIsDetailModalOpen(true);
                        }}
                        style={{ top: `${top}px`, height: `${height}px` }}
                        className={`
                          absolute left-4 right-4 p-3 rounded-2xl border flex flex-col text-left cursor-pointer transition-all hover:scale-[1.01] hover:shadow-lg z-20 overflow-hidden
                          ${evt.status === 'completed'
                            ? 'bg-gray-100 text-gray-400 dark:bg-gray-800/80 dark:text-gray-500 border-gray-200 dark:border-gray-850 opacity-80'
                            : evt.type === 'snoozed_contact'
                              ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400 shadow-md shadow-emerald-500/5'
                              : 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-400 shadow-md shadow-indigo-500/5'
                          }
                        `}
                      >
                        <span className="text-xs font-black leading-tight mb-1 truncate">
                          {evt.title}
                        </span>
                        
                        {evt.notes && (
                          <p className="text-[10px] opacity-75 truncate max-w-xl font-medium mb-1.5">
                            {evt.notes}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-3 text-[9px] font-bold opacity-85 mt-auto">
                          <div className="flex items-center gap-1">
                            <Clock size={10} />
                            <span>{format(evt.start_time, 'HH:mm')} - {format(evt.end_time, 'HH:mm')}</span>
                          </div>
                          {evt.contact && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-black/5 dark:bg-white/10 rounded-full">
                              <User size={9} />
                              <span>{getContactName(evt.contact)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            </div>
          )}

        </div>

      </div>

      {/* 3. MODAL DE CRIAÇÃO / EDIÇÃO DE EVENTO (Google Calendar Style) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <form 
            onSubmit={handleSaveEvent}
            className="w-full max-w-lg bg-white/95 dark:bg-[#111b21]/95 backdrop-blur-xl rounded-[28px] border border-black/10 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-[#202c33] border-b border-black/5 dark:border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-500 animate-pulse" />
                {isEditMode ? 'Editar Compromisso' : 'Novo Compromisso'}
              </h3>
              <button 
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-gray-400 hover:text-red-500 transition-colors p-1 hover:scale-105"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-4 text-left max-h-[75vh] overflow-y-auto scrollbar-thin">
              {/* Título */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Assunto/Título
                </label>
                <input
                  type="text"
                  required
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Ex: Reunião Comercial"
                  className="bg-gray-50 dark:bg-[#202c33] border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-2.5 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all font-semibold"
                />
              </div>

              {/* Data e Hora */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Data
                  </label>
                  <input
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="bg-gray-50 dark:bg-[#202c33] border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-2.5 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all font-semibold cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Início
                  </label>
                  <input
                    type="time"
                    required
                    value={eventStartTime}
                    onChange={(e) => setEventStartTime(e.target.value)}
                    className="bg-gray-50 dark:bg-[#202c33] border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-2.5 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all font-semibold cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Fim
                  </label>
                  <input
                    type="time"
                    required
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                    className="bg-gray-50 dark:bg-[#202c33] border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-2.5 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all font-semibold cursor-pointer"
                  />
                </div>
              </div>

              {/* Busca inteligente de Contatos CRM */}
              <div className="flex flex-col gap-1.5 relative">
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <User size={12} />
                  <span>Vincular Contato CRM (Opcional)</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchContactTerm}
                    onChange={(e) => {
                      setSearchContactTerm(e.target.value);
                      setShowContactDropdown(true);
                      if (!e.target.value) setEventContactId(null);
                    }}
                    placeholder="Buscar contato por nome ou telefone..."
                    className="w-full bg-gray-50 dark:bg-[#202c33] border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-2.5 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all font-semibold"
                  />
                  {eventContactId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEventContactId(null);
                        setSearchContactTerm('');
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                {/* Dropdown de Contatos */}
                {showContactDropdown && searchContactTerm && filteredContactsForSearch.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#202c33] border border-black/10 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden z-50 flex flex-col divide-y divide-black/5 dark:divide-white/5">
                    {filteredContactsForSearch.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setEventContactId(c.id.split('_')[0]); // usar raw id
                          setSearchContactTerm(getContactName(c));
                          setShowContactDropdown(false);
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs hover:bg-indigo-500/5 dark:hover:bg-indigo-500/10 flex items-center gap-2.5 transition-colors"
                      >
                        <img src={c.avatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                        <div className="flex flex-col">
                          <span className="font-bold text-[#111b21] dark:text-[#e9edef]">{getContactName(c)}</span>
                          <span className="text-[10px] text-gray-450 dark:text-gray-500">{c.phone}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Descrição / Notas */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <FileText size={12} />
                  <span>Descrição / Notas</span>
                </label>
                <textarea
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  placeholder="Instruções e notas sobre o compromisso..."
                  rows={3}
                  className="bg-gray-50 dark:bg-[#202c33] border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-2.5 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all font-semibold resize-none"
                />
              </div>

              {/* Checklist de Tarefas */}
              <div className="flex flex-col gap-2.5 border-t border-black/5 dark:border-white/5 pt-4">
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <ListTodo size={13} />
                  <span>Checklist de Tarefas</span>
                </label>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={checklistInput}
                    onChange={(e) => setChecklistInput(e.target.value)}
                    placeholder="Adicionar tarefa a este compromisso..."
                    className="flex-1 bg-gray-50 dark:bg-[#202c33] border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs text-[#111b21] dark:text-[#e9edef] focus:outline-none focus:border-indigo-500 transition-all font-semibold"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (checklistInput.trim()) {
                          setEventChecklist([...eventChecklist, checklistInput.trim()]);
                          setChecklistInput('');
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (checklistInput.trim()) {
                        setEventChecklist([...eventChecklist, checklistInput.trim()]);
                        setChecklistInput('');
                      }
                    }}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold transition-all"
                  >
                    + Add
                  </button>
                </div>

                {/* Lista de Checklist */}
                {eventChecklist.length > 0 && (
                  <div className="flex flex-col gap-1.5 bg-gray-50 dark:bg-[#111b21]/50 border border-black/5 dark:border-white/5 p-3 rounded-2xl max-h-36 overflow-y-auto scrollbar-thin">
                    {eventChecklist.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white dark:bg-[#202c33] px-3 py-2 rounded-xl border border-black/5 dark:border-white/5">
                        <span className="text-xs text-gray-700 dark:text-gray-300 font-semibold truncate pr-2">
                          {item}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEventChecklist(eventChecklist.filter((_, i) => i !== idx))}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-[#202c33] border-t border-black/5 dark:border-white/5 flex gap-3">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="flex-1 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-[#2a3942] dark:hover:bg-[#34495e] text-gray-700 dark:text-gray-200 rounded-2xl text-xs font-bold transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 active:scale-95"
              >
                {isEditMode ? 'Salvar Alterações' : 'Criar Compromisso'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. MODAL DE VISUALIZAÇÃO DE DETALHES DE EVENTO */}
      {isDetailModalOpen && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white/95 dark:bg-[#111b21]/95 backdrop-blur-xl rounded-[28px] border border-black/10 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-[#202c33] border-b border-black/5 dark:border-white/5 flex items-center justify-between">
              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                selectedEvent.status === 'completed'
                  ? 'bg-gray-100 text-gray-500 dark:bg-gray-800'
                  : selectedEvent.type === 'snoozed_contact'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                    : 'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400'
              }`}>
                {selectedEvent.status === 'completed' ? 'Concluído' : selectedEvent.type === 'snoozed_contact' ? 'Retorno CRM' : 'Compromisso'}
              </span>
              
              <button 
                onClick={() => setIsDetailModalOpen(false)}
                className="text-gray-400 hover:text-red-500 transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-4 text-left max-h-[70vh] overflow-y-auto scrollbar-thin">
              
              {/* Título */}
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-black text-gray-900 dark:text-white leading-snug">
                  {selectedEvent.title}
                </h3>
                
                {/* Data e Hora */}
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-semibold mt-1">
                  <Clock size={13} className="text-indigo-500" />
                  <span>
                    {format(selectedEvent.start_time, 'dd/MM/yyyy')} às {format(selectedEvent.start_time, 'HH:mm')} - {format(selectedEvent.end_time, 'HH:mm')}
                  </span>
                </div>
              </div>

              {/* Descrição */}
              {selectedEvent.notes && (
                <div className="bg-gray-50 dark:bg-[#202c33] border border-black/5 dark:border-white/5 rounded-2xl p-4 text-xs text-gray-700 dark:text-gray-300 font-semibold whitespace-pre-line max-h-36 overflow-y-auto scrollbar-thin">
                  {selectedEvent.notes}
                </div>
              )}

              {/* Contato Vinculado */}
              {selectedEvent.contact && (
                <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-[#202c33] border border-black/5 dark:border-white/5 rounded-2xl">
                  <div className="flex items-center gap-2.5">
                    <img src={selectedEvent.contact.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-gray-800 dark:text-white leading-tight">
                        {getContactName(selectedEvent.contact)}
                      </span>
                      <span className="text-[10px] text-gray-450 dark:text-gray-500">{selectedEvent.contact.phone}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleGoToChat(selectedEvent.contact.id)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span>Abrir Chat</span>
                    <ArrowRight size={10} />
                  </button>
                </div>
              )}

              {/* Checklist de Compromisso */}
              {selectedEvent.checklist_items && selectedEvent.checklist_items.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-black/5 dark:border-white/5 pt-4">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-450 dark:text-gray-500">
                    Checklist de Tarefas
                  </label>
                  <div className="flex flex-col gap-2 max-h-40 overflow-y-auto scrollbar-thin pr-1">
                    {selectedEvent.checklist_items.map((item: any, idx: number) => (
                      <div 
                        key={item.id || idx}
                        className="flex items-center gap-2.5 bg-gray-50/50 dark:bg-[#202c33]/50 hover:bg-gray-100/50 dark:hover:bg-[#202c33]/80 p-2.5 rounded-xl border border-black/5 dark:border-white/5 transition-all"
                      >
                        <button
                          type="button"
                          disabled={selectedEvent.status === 'completed'}
                          onClick={() => handleToggleChecklistItem(selectedEvent, item.id)}
                          className={`
                            flex items-center justify-center w-4.5 h-4.5 rounded-full border border-indigo-500/30 hover:border-indigo-500/60 transition-all shrink-0
                            ${selectedEvent.status === 'completed' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                          `}
                        >
                          {item.completed ? (
                            <Check className="text-emerald-500" size={12} strokeWidth={3} />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-transparent" />
                          )}
                        </button>
                        <span className={`
                          text-xs font-semibold select-none transition-all
                          ${item.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}
                        `}>
                          {item.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-[#202c33] border-t border-black/5 dark:border-white/5 flex gap-2">
              <button
                onClick={() => handleDeleteEvent(selectedEvent.id)}
                className="px-3.5 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 rounded-2xl text-xs font-bold transition-all border border-red-500/10 flex items-center justify-center gap-1 active:scale-95"
                title="Excluir Evento"
              >
                <Trash2 size={14} />
                <span>Excluir</span>
              </button>
              
              {selectedEvent.type !== 'snoozed_contact' && selectedEvent.status !== 'completed' && (
                <button
                  onClick={() => openEditModal(selectedEvent)}
                  className="px-3.5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-[#2a3942] dark:hover:bg-[#34495e] text-gray-700 dark:text-gray-200 rounded-2xl text-xs font-bold transition-all border border-black/5 flex-1 active:scale-95"
                >
                  Editar
                </button>
              )}

              {selectedEvent.status !== 'completed' && (
                <button
                  onClick={() => handleCompleteEvent(selectedEvent)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-indigo-600/10 flex-1 flex items-center justify-center gap-1 active:scale-95"
                >
                  <CheckCircle2 size={14} />
                  <span>Concluir</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
