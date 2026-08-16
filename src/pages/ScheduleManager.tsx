import React, { useState, useMemo, useEffect } from 'react';
import { useChatStore } from '../store/chatStore';
import { 
  CalendarDays, 
  Clock, 
  X, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft, 
  Plus, 
  Calendar as CalendarIcon, 
  ListTodo, 
  User, 
  FileText, 
  Trash2, 
  Check, 
  ArrowRight,
  Sparkles,
  ArrowLeft,
  SlidersHorizontal,
  Edit3,
  MessageSquare,
  Building2,
  CalendarCheck,
  RotateCcw
} from 'lucide-react';
import { 
  format, 
  isToday, 
  addMonths, 
  subMonths, 
  startOfWeek, 
  addDays, 
  startOfMonth, 
  endOfMonth, 
  isSameDay 
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

export function ScheduleManager() {
  const { 
    contacts, 
    appointments, 
    updateConversationField, 
    setActiveChat, 
    createAppointment,
    updateAppointment,
    deleteAppointment,
    fetchAppointments
  } = useChatStore();

  const navigate = useNavigate();

  // Estado para hora atual dinâmica (usado para o indicador temporal "Agora")
  const [nowTime, setNowTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Calcular valor decimal da hora atual para posicionar a linha do tempo (grade começa às 08:00)
  const nowH = useMemo(() => {
    return nowTime.getHours() + (nowTime.getMinutes() / 60);
  }, [nowTime]);

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
  }, [fetchAppointments]);

  // Formata o nome do contato de maneira legível
  const getContactName = (contact: any) => {
    if (!contact) return '';
    return contact.custom_name || contact.name || contact.fantasy_name || contact.phone || 'Contato sem nome';
  };

  // Filtrar contatos pelo input no autocomplete
  const filteredContactsForSearch = useMemo(() => {
    if (!searchContactTerm) return [];
    return contacts.filter(c => {
      const name = getContactName(c).toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      return name.includes(searchContactTerm.toLowerCase()) || phone.includes(searchContactTerm.toLowerCase());
    }).slice(0, 6);
  }, [contacts, searchContactTerm]);

  // Unifica Appointments (da tabela `appointments`) e contatos `snoozed_until` (agendados temporariamente)
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
        type: 'appointment'
      });
    });

    // 2. Contatos com snooze ativo (Virtual Events)
    contacts.forEach(c => {
      if (c.conv_status === 'snoozed' && c.snoozed_until) {
        const snoozeDate = new Date(c.snoozed_until);
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
    const startW = startOfWeek(startM, { weekStartsOn: 0 }); // Domingo
    const days = [];
    
    let current = startW;
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
      const now = new Date();
      setCurrentDate(now);
      setSelectedDate(now);
      setMiniCalMonth(now);
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
      await updateConversationField(realContactId, { status: 'open', snoozed_until: null });
      setIsDetailModalOpen(false);
      return;
    }

    try {
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
    const startW = startOfWeek(startM, { weekStartsOn: 0 });
    
    const days = [];
    let current = startW;
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
    <div className="flex-1 flex bg-[#0c1317] text-slate-100 h-screen overflow-hidden min-w-0 font-sans select-none">
      
      {/* 1. PAINEL LATERAL ESQUERDO (Glassmorphism Sidebar) */}
      {showSidebar && (
        <div 
          className="fixed inset-0 bg-black/75 backdrop-blur-md z-40 lg:hidden animate-in fade-in duration-200"
          onClick={() => setShowSidebar(false)}
        />
      )}

      <aside className={`
        w-80 bg-[#111b21]/95 dark:bg-[#111b21]/95 backdrop-blur-2xl border-r border-white/[0.08] flex flex-col shrink-0 overflow-y-auto custom-scrollbar z-40
        fixed inset-y-0 left-0 transform transition-all duration-300 ease-out shadow-2xl lg:shadow-none
        lg:static lg:translate-x-0
        ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
      `}>
        
        {/* Header da Sidebar + Botão Criar Compromisso */}
        <div className="p-5 flex flex-col gap-4 border-b border-white/[0.08]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
                <CalendarDays size={16} />
              </div>
              <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                Agenda Interna
              </span>
            </div>
            <button
              onClick={() => setShowSidebar(false)}
              className="lg:hidden p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <button
            onClick={() => {
              openCreateModal();
              setShowSidebar(false);
            }}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-2xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider shadow-[0_8px_25px_rgba(99,102,241,0.35)] hover:shadow-[0_12px_30px_rgba(99,102,241,0.45)] hover:scale-[1.02] active:scale-95 transition-all duration-200 cursor-pointer"
          >
            <Plus size={16} strokeWidth={3} />
            <span>Criar Compromisso</span>
          </button>
        </div>

        {/* Mini Calendário Mensal */}
        <div className="p-5 flex flex-col gap-3.5 border-b border-white/[0.08]">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black text-slate-100 capitalize tracking-wider flex items-center gap-1.5">
              <CalendarIcon size={13} className="text-indigo-400" />
              {format(miniCalMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMiniCalMonth(subMonths(miniCalMonth, 1))}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all active:scale-90"
                title="Mês Anterior"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setMiniCalMonth(addMonths(miniCalMonth, 1))}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all active:scale-90"
                title="Próximo Mês"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center gap-y-1">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, idx) => (
              <span key={idx} className="text-[9px] font-black text-slate-500 uppercase tracking-widest py-1">
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
                    h-7 w-7 mx-auto rounded-xl text-[11px] font-bold transition-all flex items-center justify-center cursor-pointer
                    ${isSelected 
                      ? 'bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-black scale-105 shadow-md shadow-indigo-600/40 ring-2 ring-white/20' 
                      : isTodayDay 
                        ? 'border border-indigo-400 text-indigo-400 font-extrabold bg-indigo-500/10' 
                        : isCurrentMonth 
                          ? 'text-slate-300 hover:bg-white/10 hover:text-white' 
                          : 'text-slate-600 hover:bg-white/5'
                    }
                  `}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filtros Rápidos */}
        <div className="p-5 flex flex-col gap-3 border-b border-white/[0.08]">
          <span className="text-[9.5px] font-black uppercase tracking-widest text-slate-400">
            Filtrar Visualização
          </span>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => {
                setFilterType('all');
                setShowSidebar(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-black flex items-center justify-between transition-all border cursor-pointer ${
                filterType === 'all' 
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 shadow-xs' 
                  : 'bg-white/[0.02] text-slate-400 hover:bg-white/5 hover:text-slate-200 border-transparent'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                Todos os Eventos
              </span>
              <span className="px-2 py-0.5 bg-black/40 rounded-lg font-mono text-[9px] font-black text-slate-300 border border-white/5">
                {allEvents.length}
              </span>
            </button>

            <button
              onClick={() => {
                setFilterType('appointments');
                setShowSidebar(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-black flex items-center justify-between transition-all border cursor-pointer ${
                filterType === 'appointments' 
                  ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 shadow-xs' 
                  : 'bg-white/[0.02] text-slate-400 hover:bg-white/5 hover:text-slate-200 border-transparent'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-400" />
                Compromissos CRM
              </span>
              <span className="px-2 py-0.5 bg-black/40 rounded-lg font-mono text-[9px] font-black text-slate-300 border border-white/5">
                {allEvents.filter(e => e.type === 'appointment').length}
              </span>
            </button>

            <button
              onClick={() => {
                setFilterType('snoozed');
                setShowSidebar(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-black flex items-center justify-between transition-all border cursor-pointer ${
                filterType === 'snoozed' 
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 shadow-xs' 
                  : 'bg-white/[0.02] text-slate-400 hover:bg-white/5 hover:text-slate-200 border-transparent'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Retornos de Contatos
              </span>
              <span className="px-2 py-0.5 bg-black/40 rounded-lg font-mono text-[9px] font-black text-slate-300 border border-white/5">
                {allEvents.filter(e => e.type === 'snoozed_contact').length}
              </span>
            </button>
          </div>
        </div>

        {/* Lembretes / Compromissos de Hoje */}
        <div className="p-5 flex-1 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <span>Para Hoje ({format(new Date(), 'dd/MM')})</span>
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
            </span>
            <span className="text-[9px] font-black text-slate-500">
              {allEvents.filter(e => isSameDay(e.start_time, new Date())).length} itens
            </span>
          </div>

          <div className="flex flex-col gap-2 overflow-y-auto max-h-[260px] custom-scrollbar pr-1">
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
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition-all hover:scale-[1.01] flex flex-col gap-1.5 ${
                      evt.status === 'completed'
                        ? 'bg-white/[0.02] border-white/5 opacity-50'
                        : evt.type === 'snoozed_contact'
                          ? 'bg-emerald-500/10 border-emerald-500/25 hover:border-emerald-500/50 hover:bg-emerald-500/15'
                          : 'bg-indigo-500/10 border-indigo-500/25 hover:border-indigo-500/50 hover:bg-indigo-500/15'
                    }`}
                  >
                    <span className="text-xs font-black text-slate-100 truncate leading-tight">
                      {evt.title}
                    </span>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock size={11} className={evt.type === 'snoozed_contact' ? 'text-emerald-400' : 'text-indigo-400'} />
                        {format(evt.start_time, 'HH:mm')}
                      </span>
                      {evt.status === 'completed' ? (
                        <span className="text-emerald-400 font-black uppercase text-[8px] tracking-wider">
                          ✓ Concluído
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-400 font-semibold truncate max-w-[100px]">
                          {evt.contact ? getContactName(evt.contact) : 'Geral'}
                        </span>
                      )}
                    </div>
                  </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-slate-500 font-semibold italic border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                Nenhum compromisso agendado para hoje.
              </div>
            )}
          </div>
        </div>

      </aside>

      {/* 2. PAINEL PRINCIPAL (Calendário Master) */}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-[#0c1317]">
        
        {/* Cabeçalho da Agenda */}
        <header className="h-16 px-4 md:px-6 flex items-center justify-between bg-[#111b21]/90 backdrop-blur-xl border-b border-white/[0.08] shrink-0 z-10 shadow-xs gap-3">
          
          <div className="flex items-center gap-3 md:gap-5">
            
            {/* Botão Voltar */}
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all active:scale-95 cursor-pointer border border-white/5"
              title="Voltar"
            >
              <ArrowLeft size={16} />
            </button>

            {/* Botão Abrir Sidebar no Mobile */}
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="lg:hidden p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all active:scale-95 cursor-pointer border border-white/5"
              title="Filtros e Calendário"
            >
              <SlidersHorizontal size={16} />
            </button>

            {/* Título da Tela */}
            <div className="flex items-center gap-2.5">
              <CalendarCheck className="text-indigo-400 hidden sm:block shrink-0" size={20} />
              <h1 className="text-xs md:text-sm font-black text-white uppercase tracking-wider hidden sm:block">
                Agenda Interna
              </h1>
            </div>

            {/* Controles de Navegação Temporal (Hoje, Anterior, Próximo) */}
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-2xl border border-white/[0.08] shadow-inner">
              <button
                onClick={() => handleNavigate('prev')}
                className="p-1.5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-90 cursor-pointer"
                title="Período Anterior"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => handleNavigate('today')}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-[10px] font-black text-white rounded-xl shadow-sm transition-all active:scale-95 uppercase tracking-wider cursor-pointer"
              >
                Hoje
              </button>
              <button
                onClick={() => handleNavigate('next')}
                className="p-1.5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-90 cursor-pointer"
                title="Próximo Período"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Título do Mês / Dia Atual em Destaque */}
            <span className="text-xs md:text-sm lg:text-base font-black text-slate-100 capitalize tracking-wide">
              {format(currentDate, viewMode === 'day' ? "dd 'de' MMMM, yyyy" : 'MMMM yyyy', { locale: ptBR })}
            </span>
          </div>

          {/* Alternador de Modos (Mês, Semana, Dia) */}
          <div className="flex items-center bg-black/40 p-1 rounded-2xl border border-white/[0.08] shadow-inner">
            {(['month', 'week', 'day'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-wider cursor-pointer ${
                  viewMode === mode 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-105' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                {mode === 'month' ? 'Mês' : mode === 'week' ? 'Semana' : 'Dia'}
              </button>
            ))}
          </div>

        </header>

        {/* Grade de Exibição */}
        <div className="flex-1 overflow-auto bg-[#0c1317] custom-scrollbar relative">
          
          {/* ========================================================= */}
          {/* A) MODO MÊS */}
          {/* ========================================================= */}
          {viewMode === 'month' && (
            <div className="grid grid-cols-7 grid-rows-6 h-full min-w-[800px] border-t border-l border-white/[0.06]">
              {/* Nomes dos Dias da Semana */}
              {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((dayName, idx) => (
                <div key={idx} className="bg-[#111b21] py-3 border-b border-r border-white/[0.06] text-center text-[10px] font-black uppercase tracking-widest text-slate-400 select-none">
                  <span>{dayName}</span>
                </div>
              ))}

              {/* Células de Dias */}
              {monthDays.map((day, idx) => {
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isTodayDay = isToday(day);
                const isSelected = isSameDay(day, selectedDate);
                const dayEvts = allEvents.filter(e => isSameDay(e.start_time, day))
                  .sort((a,b) => a.start_time.getTime() - b.start_time.getTime());

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      min-h-[105px] p-2 border-b border-r border-white/[0.06] transition-all duration-150 flex flex-col gap-1.5 relative group cursor-pointer
                      ${isCurrentMonth ? 'bg-[#111b21]/40 hover:bg-[#182229]' : 'bg-black/40 opacity-35 hover:opacity-75'}
                      ${isSelected ? 'ring-2 ring-indigo-500/50 bg-indigo-500/5' : ''}
                      ${isTodayDay ? 'border-t-2 border-t-indigo-400 bg-indigo-500/5' : ''}
                    `}
                  >
                    {/* Cabeçalho do Dia */}
                    <div className="flex justify-between items-center select-none">
                      <span className={`
                        text-xs font-black w-6 h-6 flex items-center justify-center rounded-xl transition-all
                        ${isTodayDay 
                          ? 'bg-gradient-to-tr from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/40 ring-1 ring-white/30' 
                          : isSelected
                            ? 'bg-white/10 text-white font-black'
                            : 'text-slate-300'
                        }
                      `}>
                        {day.getDate()}
                      </span>
                      
                      {/* Botão de Criação Rápida */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openCreateModal(day);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 bg-white/10 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-lg transition-all hover:scale-110 active:scale-95 cursor-pointer shadow-xs"
                        title="Adicionar compromisso neste dia"
                      >
                        <Plus size={12} strokeWidth={3} />
                      </button>
                    </div>

                    {/* Lista de Eventos no Dia */}
                    <div className="flex-1 flex flex-col gap-1 overflow-hidden pr-0.5">
                      {dayEvts.slice(0, 3).map(evt => (
                        <div
                          key={evt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(evt);
                            setIsDetailModalOpen(true);
                          }}
                          className={`
                            px-2 py-1 rounded-lg text-[9.5px] font-bold truncate transition-all hover:translate-x-0.5 text-left border shadow-xs cursor-pointer
                            ${evt.status === 'completed'
                              ? 'bg-white/5 text-slate-500 border-white/5 line-through'
                              : evt.type === 'snoozed_contact'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 border-l-[3px] border-l-emerald-400 hover:bg-emerald-500/25'
                                : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 border-l-[3px] border-l-indigo-400 hover:bg-indigo-500/25'
                            }
                          `}
                        >
                          <span className="font-black text-[8px] opacity-75 mr-1 font-mono">
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
                          className="text-[9px] text-indigo-400 font-black hover:underline pl-1 cursor-pointer select-none mt-0.5"
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

          {/* ========================================================= */}
          {/* B) MODO SEMANA */}
          {/* ========================================================= */}
          {viewMode === 'week' && (
            <div className="flex flex-col h-full min-w-[750px] border-t border-white/[0.08] bg-[#0c1317]">
              {/* Header de Colunas dos Dias da Semana */}
              <div className="flex border-b border-white/[0.08] shrink-0 bg-[#111b21]">
                <div className="w-20 border-r border-white/[0.08] shrink-0" />
                {weekDays.map((day, idx) => {
                  const isTodayDay = isToday(day);
                  const isSelected = isSameDay(day, selectedDate);
                  return (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedDate(day)}
                      className={`flex-1 py-3 text-center border-r border-white/[0.08] flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-500/10' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <span className="text-[9.5px] font-black uppercase text-slate-400 tracking-wider">
                        {format(day, 'eee', { locale: ptBR })}
                      </span>
                      <span className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-black ${
                        isTodayDay 
                          ? 'bg-gradient-to-tr from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/40 ring-1 ring-white/30' 
                          : isSelected
                            ? 'border-2 border-indigo-400 text-indigo-300 font-black'
                            : 'text-slate-200'
                      }`}>
                        {day.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Grade de Horas e Eventos na Semana */}
              <div className="flex-1 overflow-y-auto custom-scrollbar flex relative">
                {/* Coluna de Horas */}
                <div className="w-20 bg-[#111b21]/90 border-r border-white/[0.08] select-none shrink-0 z-10">
                  {hours.map((hour, idx) => (
                    <div key={idx} className="h-16 text-[10px] font-mono font-bold text-slate-400 text-right pr-4 pt-1.5 border-b border-white/[0.04] border-dashed">
                      {hour}
                    </div>
                  ))}
                </div>

                {/* 7 Colunas de Grade */}
                <div className="flex-1 flex relative">
                  {weekDays.map((day, dIdx) => {
                    const dayEvts = allEvents.filter(e => isSameDay(e.start_time, day));
                    
                    return (
                      <div key={dIdx} className="flex-1 border-r border-white/[0.06] h-[960px] relative bg-[#0c1317] group">
                        {/* Linhas de Horas */}
                        {hours.map((_, hIdx) => (
                          <div
                            key={hIdx}
                            onClick={() => {
                              setSelectedDate(day);
                              openCreateModal(day, hours[hIdx]);
                            }}
                            className="h-16 border-b border-white/[0.04] border-dashed cursor-pointer hover:bg-white/[0.03] transition-colors"
                          />
                        ))}

                        {/* Indicador Temporal "Agora" */}
                        {isToday(day) && nowH >= 8 && nowH <= 22 && (
                          <div 
                            style={{ top: `${(nowH - 8) * 64}px` }} 
                            className="absolute left-0 right-0 h-0.5 bg-rose-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(244,63,94,0.8)]"
                          >
                            <div className="absolute -left-1.5 -top-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-4 ring-rose-500/30 animate-ping" />
                          </div>
                        )}

                        {/* Eventos Posicionados */}
                        {dayEvts.map(evt => {
                          const startH = evt.start_time.getHours() + (evt.start_time.getMinutes() / 60);
                          const endH = evt.end_time.getHours() + (evt.end_time.getMinutes() / 60);
                          
                          const top = (startH - 8) * 64; 
                          const height = Math.max((endH - startH) * 64, 32); 
                          
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
                                absolute left-1 right-1 p-2 rounded-xl border flex flex-col text-left cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg z-20 overflow-hidden
                                ${evt.status === 'completed'
                                  ? 'bg-white/5 text-slate-500 border-white/5 line-through opacity-60'
                                  : evt.type === 'snoozed_contact'
                                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40 shadow-sm border-l-[3px] border-l-emerald-400'
                                    : 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40 shadow-sm border-l-[3px] border-l-indigo-400'
                                }
                              `}
                            >
                              <span className="text-[10px] font-black leading-tight mb-0.5 truncate">
                                {evt.title}
                              </span>
                              <div className="flex items-center gap-1 text-[8.5px] font-bold opacity-85 mt-0.5 font-mono">
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

          {/* ========================================================= */}
          {/* C) MODO DIA */}
          {/* ========================================================= */}
          {viewMode === 'day' && (
            <div className="flex flex-col h-full bg-[#0c1317]">
              {/* Header do Dia */}
              <div className="py-4 px-6 border-b border-white/[0.08] flex items-center justify-between bg-[#111b21]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-tr from-indigo-500 to-violet-500 text-white rounded-2xl flex flex-col items-center justify-center shadow-lg shadow-indigo-500/30">
                    <span className="text-[9px] font-black uppercase leading-none tracking-widest">{format(currentDate, 'eee', { locale: ptBR })}</span>
                    <span className="text-base font-black leading-none mt-1">{currentDate.getDate()}</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-white capitalize tracking-wide">
                      {format(currentDate, "EEEE", { locale: ptBR })}
                    </h2>
                    <p className="text-[11px] text-slate-400 font-bold">
                      Linha do tempo diária de compromissos
                    </p>
                  </div>
                </div>

                <span className="px-3.5 py-1.5 bg-indigo-500/15 text-indigo-300 text-xs font-black rounded-xl border border-indigo-500/20">
                  {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'compromisso' : 'compromissos'}
                </span>
              </div>

              {/* Grade de Horas Dia */}
              <div className="flex-1 overflow-y-auto custom-scrollbar flex relative">
                {/* Coluna de Horas */}
                <div className="w-20 bg-[#111b21]/90 border-r border-white/[0.08] select-none shrink-0 z-10">
                  {hours.map((hour, idx) => (
                    <div key={idx} className="h-16 text-[10px] font-mono font-bold text-slate-400 text-right pr-4 pt-1.5 border-b border-white/[0.04] border-dashed">
                      {hour}
                    </div>
                  ))}
                </div>

                {/* Coluna Principal */}
                <div className="flex-1 h-[960px] relative bg-[#0c1317]">
                  {hours.map((_, hIdx) => (
                    <div
                      key={hIdx}
                      onClick={() => {
                        openCreateModal(currentDate, hours[hIdx]);
                      }}
                      className="h-16 border-b border-white/[0.04] border-dashed cursor-pointer hover:bg-white/[0.03] transition-colors"
                    />
                  ))}

                  {/* Indicador Temporal "Agora" */}
                  {isToday(currentDate) && nowH >= 8 && nowH <= 22 && (
                    <div 
                      style={{ top: `${(nowH - 8) * 64}px` }} 
                      className="absolute left-0 right-0 h-0.5 bg-rose-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(244,63,94,0.8)]"
                    >
                      <div className="absolute -left-1.5 -top-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-4 ring-rose-500/30 animate-ping" />
                    </div>
                  )}

                  {/* Compromissos do Dia */}
                  {selectedDayEvents.map(evt => {
                    const startH = evt.start_time.getHours() + (evt.start_time.getMinutes() / 60);
                    const endH = evt.end_time.getHours() + (evt.end_time.getMinutes() / 60);
                    
                    const top = (startH - 8) * 64; 
                    const height = Math.max((endH - startH) * 64, 36);
                    
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
                          absolute left-4 right-4 p-3.5 rounded-2xl border flex flex-col text-left cursor-pointer transition-all hover:scale-[1.005] hover:shadow-xl z-20 overflow-hidden
                          ${evt.status === 'completed'
                            ? 'bg-white/5 text-slate-500 border-white/5 line-through opacity-60'
                            : evt.type === 'snoozed_contact'
                              ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40 shadow-lg border-l-[4px] border-l-emerald-400'
                              : 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40 shadow-lg border-l-[4px] border-l-indigo-400'
                          }
                        `}
                      >
                        <span className="text-xs font-black leading-tight mb-1 truncate">
                          {evt.title}
                        </span>
                        
                        {evt.notes && (
                          <p className="text-[10px] opacity-75 truncate max-w-xl font-semibold mb-1">
                            {evt.notes}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-3 text-[9px] font-extrabold opacity-85 mt-auto font-mono">
                          <div className="flex items-center gap-1">
                            <Clock size={11} className={evt.type === 'snoozed_contact' ? 'text-emerald-400' : 'text-indigo-400'} />
                            <span>{format(evt.start_time, 'HH:mm')} - {format(evt.end_time, 'HH:mm')}</span>
                          </div>
                          {evt.contact && (
                            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-black/40 rounded-full font-bold text-slate-300">
                              <User size={10} />
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

      </main>

      {/* ========================================================= */}
      {/* 3. MODAL DE CRIAÇÃO / EDIÇÃO DE COMPROMISSO */}
      {/* ========================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
          <form 
            onSubmit={handleSaveEvent}
            className="w-full max-w-lg bg-[#111b21] rounded-[32px] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.6)] overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col text-left"
          >
            {/* Modal Header */}
            <div className="px-6 py-4.5 bg-[#182229] border-b border-white/[0.08] flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-100 flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-400 animate-pulse" />
                {isEditMode ? 'Editar Compromisso' : 'Novo Compromisso'}
              </h3>
              <button 
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-xl hover:bg-white/5 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-4 text-left max-h-[72vh] overflow-y-auto custom-scrollbar">
              {/* Título */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Assunto / Título *
                </label>
                <input
                  type="text"
                  required
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Ex: Reunião Comercial com Cliente"
                  className="bg-[#202c33] border border-white/10 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold"
                />
              </div>

              {/* Data e Horários */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Data *
                  </label>
                  <input
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="bg-[#202c33] border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Início *
                  </label>
                  <input
                    type="time"
                    required
                    value={eventStartTime}
                    onChange={(e) => setEventStartTime(e.target.value)}
                    className="bg-[#202c33] border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Término *
                  </label>
                  <input
                    type="time"
                    required
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                    className="bg-[#202c33] border border-white/10 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold cursor-pointer"
                  />
                </div>
              </div>

              {/* Vincular Contato CRM */}
              <div className="flex flex-col gap-1.5 relative">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <User size={13} className="text-indigo-400" />
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
                    className="w-full bg-[#202c33] border border-white/10 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold"
                  />
                  {eventContactId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEventContactId(null);
                        setSearchContactTerm('');
                      }}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-400 cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                {/* Dropdown de Contatos */}
                {showContactDropdown && searchContactTerm && filteredContactsForSearch.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#202c33] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 flex flex-col divide-y divide-white/5">
                    {filteredContactsForSearch.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setEventContactId(c.id.split('_')[0]);
                          setSearchContactTerm(getContactName(c));
                          setShowContactDropdown(false);
                        }}
                        className="w-full px-4 py-3 text-left text-xs hover:bg-indigo-500/10 flex items-center gap-3 transition-colors cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                          {getContactName(c).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-white">{getContactName(c)}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{c.phone}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Descrição e Notas */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <FileText size={13} className="text-indigo-400" />
                  <span>Descrição / Anotações</span>
                </label>
                <textarea
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  placeholder="Instruções, pauta ou detalhes do compromisso..."
                  rows={3}
                  className="bg-[#202c33] border border-white/10 rounded-2xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-semibold resize-none custom-scrollbar"
                />
              </div>

              {/* Checklist de Tarefas */}
              <div className="flex flex-col gap-2.5 border-t border-white/[0.08] pt-4">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ListTodo size={14} className="text-indigo-400" />
                  <span>Checklist de Tarefas</span>
                </label>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={checklistInput}
                    onChange={(e) => setChecklistInput(e.target.value)}
                    placeholder="Adicionar item ao checklist..."
                    className="flex-1 bg-[#202c33] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all font-semibold"
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
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs"
                  >
                    + Adicionar
                  </button>
                </div>

                {/* Lista do Checklist */}
                {eventChecklist.length > 0 && (
                  <div className="flex flex-col gap-1.5 bg-black/30 border border-white/5 p-3 rounded-2xl max-h-40 overflow-y-auto custom-scrollbar">
                    {eventChecklist.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-[#202c33] px-3 py-2 rounded-xl border border-white/5 shadow-xs">
                        <span className="text-xs text-slate-200 font-semibold truncate pr-2">
                          {item}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEventChecklist(eventChecklist.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-rose-400 transition-colors p-1 cursor-pointer"
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
            <div className="px-6 py-4 bg-[#182229] border-t border-white/[0.08] flex gap-3">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-2xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer border border-white/5"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/30 active:scale-95 cursor-pointer"
              >
                {isEditMode ? 'Salvar Alterações' : 'Criar Compromisso'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. MODAL DE DETALHES DO COMPROMISSO (Drawer Moderno) */}
      {/* ========================================================= */}
      {isDetailModalOpen && selectedEvent && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsDetailModalOpen(false)}
        >
          <div 
            className="w-full max-w-md bg-[#111b21] rounded-[32px] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.6)] overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4.5 bg-[#182229] border-b border-white/[0.08] flex items-center justify-between">
              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                selectedEvent.status === 'completed'
                  ? 'bg-white/5 text-slate-400 border-white/10'
                  : selectedEvent.type === 'snoozed_contact'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
              }`}>
                {selectedEvent.status === 'completed' ? '✓ Concluído' : selectedEvent.type === 'snoozed_contact' ? 'Retorno CRM' : 'Compromisso CRM'}
              </span>
              
              <button 
                onClick={() => setIsDetailModalOpen(false)}
                className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-xl hover:bg-white/5 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-4 text-left max-h-[68vh] overflow-y-auto custom-scrollbar">
              
              {/* Título & Horários */}
              <div className="flex flex-col gap-1.5">
                <h3 className="text-base font-black text-white leading-snug">
                  {selectedEvent.title}
                </h3>
                
                <div className="flex items-center gap-2 text-xs text-slate-400 font-bold mt-0.5 font-mono">
                  <Clock size={13} className="text-indigo-400" />
                  <span>
                    {format(selectedEvent.start_time, 'dd/MM/yyyy')} às {format(selectedEvent.start_time, 'HH:mm')} - {format(selectedEvent.end_time, 'HH:mm')}
                  </span>
                </div>
              </div>

              {/* Descrição / Notas */}
              {selectedEvent.notes && (
                <div className="bg-[#202c33] border border-white/5 rounded-2xl p-4 text-xs text-slate-200 font-semibold whitespace-pre-line max-h-36 overflow-y-auto custom-scrollbar leading-relaxed">
                  {selectedEvent.notes}
                </div>
              )}

              {/* Contato Vinculado */}
              {selectedEvent.contact && (
                <div className="flex items-center justify-between p-3.5 bg-[#202c33] border border-white/5 rounded-2xl shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 text-white font-black text-xs flex items-center justify-center shrink-0">
                      {getContactName(selectedEvent.contact).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-white leading-tight">
                        {getContactName(selectedEvent.contact)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{selectedEvent.contact.phone}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleGoToChat(selectedEvent.contact.id)}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                  >
                    <span>Abrir Chat</span>
                    <ArrowRight size={12} strokeWidth={2.5} />
                  </button>
                </div>
              )}

              {/* Checklist de Compromisso */}
              {selectedEvent.checklist_items && selectedEvent.checklist_items.length > 0 && (
                <div className="flex flex-col gap-2.5 border-t border-white/[0.08] pt-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Checklist de Tarefas
                  </span>
                  <div className="flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                    {selectedEvent.checklist_items.map((item: any, idx: number) => (
                      <div 
                        key={item.id || idx}
                        className="flex items-center gap-3 bg-[#202c33] p-3 rounded-xl border border-white/5 transition-all"
                      >
                        <button
                          type="button"
                          disabled={selectedEvent.status === 'completed'}
                          onClick={() => handleToggleChecklistItem(selectedEvent, item.id)}
                          className={`
                            flex items-center justify-center w-5 h-5 rounded-full border border-indigo-500/40 hover:border-indigo-400 transition-all shrink-0
                            ${selectedEvent.status === 'completed' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                          `}
                        >
                          {item.completed ? (
                            <Check className="text-emerald-400" size={13} strokeWidth={3} />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-transparent" />
                          )}
                        </button>
                        <span className={`
                          text-xs font-bold transition-all
                          ${item.completed ? 'line-through text-slate-500' : 'text-slate-200'}
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
            <div className="px-6 py-4 bg-[#182229] border-t border-white/[0.08] flex gap-2">
              <button
                onClick={() => handleDeleteEvent(selectedEvent.id)}
                className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border border-rose-500/20 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                title="Excluir Evento"
              >
                <Trash2 size={14} />
                <span>Excluir</span>
              </button>
              
              {selectedEvent.type !== 'snoozed_contact' && selectedEvent.status !== 'completed' && (
                <button
                  onClick={() => openEditModal(selectedEvent)}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-200 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border border-white/5 flex-1 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Edit3 size={14} />
                  <span>Editar</span>
                </button>
              )}

              {selectedEvent.status !== 'completed' && (
                <button
                  onClick={() => handleCompleteEvent(selectedEvent)}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-600/30 flex-1 flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
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
