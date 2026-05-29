import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ClipboardList, 
  Search, 
  User, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Plus, 
  Filter, 
  MessageSquare, 
  UserCheck, 
  ChevronRight, 
  Loader2, 
  Calendar, 
  CheckSquare, 
  Percent, 
  TrendingUp, 
  Trash2,
  Smile,
  ShieldAlert,
  Edit2
} from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { supabase } from '../services/supabase';
import { format, isBefore, isAfter, parseISO, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Função utilitária de classes condicionais
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export default function CrmDashboard() {
  const navigate = useNavigate();
  const { contacts, agents, tenantInfo, fetchTenantAgents } = useChatStore();

  // Estados Locais
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'pending' | 'completed' | 'overdue'>('pending');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  
  // Agrupamento Premium por Cliente
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);

  // Novos estados para edição inline premium no card e subtarefas inline
  const [editingTextTaskId, setEditingTextTaskId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState('');
  const [inlineChecklistInputs, setInlineChecklistInputs] = useState<{ [key: string]: string }>({});

  // Estados para o Modal de Nova Tarefa
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newContactId, setNewContactId] = useState('');
  const [newAgentId, setNewAgentId] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newDueDate, setNewDueDate] = useState(() => format(addDays(new Date(), 2), "yyyy-MM-dd'T'18:00"));
  const [newChecklist, setNewChecklist] = useState<string[]>([]);
  const [checklistInput, setChecklistInput] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Atendente Conectado e Nível de Permissão
  const currentUserEmail = typeof window !== 'undefined' ? (localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email')) : null;
  const currentUserRole = typeof window !== 'undefined' ? (localStorage.getItem('current_user_role') || sessionStorage.getItem('current_user_role')) : null;
  const isAdministrative = currentUserRole?.toLowerCase() === 'admin' || currentUserRole?.toLowerCase() === 'owner';
  const currentAgent = agents.find(a => a.email && a.email.toLowerCase() === currentUserEmail?.toLowerCase());

  // Filtragem das tarefas conforme nível de permissão (segurança proativa)
  const visibleTasks = React.useMemo(() => {
    if (isAdministrative) return tasks;
    if (!currentAgent) return []; // Se não encontrar o agente logado, não exibe dados de outros
    return tasks.filter(t => t.assignedTo === currentAgent.id);
  }, [tasks, isAdministrative, currentAgent]);

  // Buscar tarefas ativas e concluídas no Supabase (últimos 90 dias)
  const fetchCrmTasks = React.useCallback(async () => {
    try {
      const tenantId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      if (!tenantId) return;

      const { data: notes, error } = await supabase
        .from('contact_notes')
        .select(`
          id,
          content,
          created_at,
          contact_id,
          assigned_to,
          created_by_name,
          checklist_items,
          task_completed,
          media_metadata,
          contacts (
            id,
            name,
            custom_name,
            phone,
            profile_picture_url,
            instance_id
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('is_task', true);

      if (error) throw error;

      if (notes) {
        const formatted = notes.map((n: any) => {
          const contactObj = n.contacts || {};
          const meta = n.media_metadata || {};
          
          // Prazo de vencimento salvo no JSON de metadados
          // Se não houver, assume-se fallback padrão de 3 dias a partir da criação
          let dueDate = meta.due_date;
          if (!dueDate) {
            dueDate = format(addDays(new Date(n.created_at), 3), "yyyy-MM-dd'T'18:00");
          } else if (dueDate.length === 10) {
            dueDate = `${dueDate}T18:00`;
          }

          return {
            noteId: n.id,
            contactId: n.contact_id,
            contactName: contactObj.custom_name || contactObj.name || contactObj.phone || 'Contato',
            contactAvatar: contactObj.profile_picture_url || '',
            contactPhone: contactObj.phone || '',
            instanceId: contactObj.instance_id || '',
            text: n.content || '',
            timestamp: new Date(n.created_at),
            createdByName: n.created_by_name || 'Agente',
            assignedTo: n.assigned_to,
            checklistItems: n.checklist_items || [],
            completed: n.task_completed || false,
            dueDate: dueDate,
          };
        });

        // Ordenar por prazo mais próximo primeiro
        formatted.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        setTasks(formatted);
      }
    } catch (e) {
      console.error('Erro ao buscar tarefas do CRM:', e);
    } finally {
      setLoading(false);
    }
  }, [tenantInfo?.id]);

  // Carregar tarefas e agentes ao montar a tela
  useEffect(() => {
    fetchTenantAgents();
    fetchCrmTasks();
  }, [fetchTenantAgents, fetchCrmTasks]);

  // Sincronização em Tempo Real (Supabase Realtime)
  useEffect(() => {
    const tenantId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
    if (!tenantId) return;

    const channel = supabase.channel(`public:contact_notes_crm:tenant=${tenantId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'contact_notes', 
        filter: `tenant_id=eq.${tenantId}` 
      }, () => {
        fetchCrmTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantInfo?.id, fetchCrmTasks]);

  // Pré-selecionar responsável ao abrir o modal caso seja operador comum
  useEffect(() => {
    if (showCreateModal) {
      if (!isAdministrative && currentAgent) {
        setNewAgentId(currentAgent.id);
      } else {
        setNewAgentId('');
      }
    }
  }, [showCreateModal, isAdministrative, currentAgent]);

  // Mapeamento e Computações de Métricas de Saúde Estratégica
  const computedMetrics = React.useMemo(() => {
    const total = visibleTasks.length;
    const completed = visibleTasks.filter(t => t.completed).length;
    const pendingTasks = visibleTasks.filter(t => !t.completed);
    
    // Filtro dinâmico de tarefas vencidas (pendentes e com data/hora inferior ao momento atual)
    const nowStr = format(new Date(), "yyyy-MM-dd'T'HH:mm");
    const overdue = pendingTasks.filter(t => t.dueDate < nowStr).length;
    const active = pendingTasks.length - overdue;

    // Taxa de entrega (conclusões sobre o total de tarefas)
    const healthRate = total > 0 ? Math.round((completed / total) * 100) : 100;

    return {
      total,
      completed,
      overdue,
      active,
      healthRate
    };
  }, [visibleTasks]);

  // Ranking de Produtividade do Time por Operador
  const teamPerformance = React.useMemo(() => {
    const rankingMap: { [key: string]: { id: string, name: string, completed: number, pending: number } } = {};
    
    // Inicializa o mapa apenas com os agentes visíveis (todos se admin, apenas si mesmo se operador comum)
    const targetAgents = isAdministrative ? agents : (currentAgent ? [currentAgent] : []);
    
    targetAgents.forEach(a => {
      rankingMap[a.id] = { id: a.id, name: a.full_name || 'Agente', completed: 0, pending: 0 };
    });

    visibleTasks.forEach(t => {
      const assigned = t.assignedTo;
      if (assigned && rankingMap[assigned]) {
        if (t.completed) {
          rankingMap[assigned].completed += 1;
        } else {
          rankingMap[assigned].pending += 1;
        }
      }
    });

    return Object.values(rankingMap).sort((a, b) => b.completed - a.completed);
  }, [visibleTasks, agents, isAdministrative, currentAgent]);

  // Filtragem Dinâmica das Tarefas para Renderização na Tabela/Cards
  const filteredTasks = React.useMemo(() => {
    const nowStr = format(new Date(), "yyyy-MM-dd'T'HH:mm");
    return visibleTasks.filter(t => {
      // 1. Filtro de pesquisa de contatos
      const matchesSearch = t.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            t.contactPhone.includes(searchTerm);
      
      // 2. Filtro por atendente atribuído
      const matchesAgent = selectedAgentFilter === 'all' || t.assignedTo === selectedAgentFilter;

      // 3. Filtro por status de saúde
      let matchesStatus = true;
      if (selectedStatusFilter === 'pending') {
        matchesStatus = !t.completed && t.dueDate >= nowStr;
      } else if (selectedStatusFilter === 'completed') {
        matchesStatus = t.completed;
      } else if (selectedStatusFilter === 'overdue') {
        matchesStatus = !t.completed && t.dueDate < nowStr;
      }

      return matchesSearch && matchesAgent && matchesStatus;
    });
  }, [visibleTasks, searchTerm, selectedAgentFilter, selectedStatusFilter]);

  // Agrupamento reativo de tarefas por cliente (contato)
  const groupedTasks = React.useMemo(() => {
    const groups: { [key: string]: {
      contactId: string;
      contactName: string;
      contactAvatar: string;
      contactPhone: string;
      instanceId: string;
      tasks: any[];
    }} = {};

    filteredTasks.forEach(task => {
      const key = task.contactId;
      if (!groups[key]) {
        groups[key] = {
          contactId: task.contactId,
          contactName: task.contactName,
          contactAvatar: task.contactAvatar,
          contactPhone: task.contactPhone,
          instanceId: task.instanceId,
          tasks: []
        };
      }
      groups[key].tasks.push(task);
    });

    return Object.values(groups);
  }, [filteredTasks]);

  // Grupo de tarefas do contato atualmente aberto no modal
  const activeGroup = React.useMemo(() => {
    if (!expandedContactId) return null;
    return groupedTasks.find(g => g.contactId === expandedContactId) || null;
  }, [expandedContactId, groupedTasks]);

  // Mutação: Alternar Estado de Sub-Tarefa do Checklist
  const handleToggleChecklistItem = async (task: any, itemIdx: number) => {
    // Sincronização local instantânea (Otimista)
    const updatedChecklist = [...task.checklistItems];
    updatedChecklist[itemIdx].completed = !updatedChecklist[itemIdx].completed;

    // Verificar se todas as sub-tarefas foram marcadas
    const allCompleted = updatedChecklist.length > 0 && updatedChecklist.every((i: any) => i.completed);

    // Atualizar no banco Supabase
    try {
      const { error } = await supabase
        .from('contact_notes')
        .update({
          checklist_items: updatedChecklist,
          task_completed: allCompleted
        })
        .eq('id', task.noteId);

      if (error) throw error;
      
      // Atualiza o estado de forma reativa local imediata
      setTasks(prev => prev.map(t => {
        if (t.noteId === task.noteId) {
          return { ...t, checklistItems: updatedChecklist, completed: allCompleted };
        }
        return t;
      }));
    } catch (e) {
      console.error('Erro ao alternar item do checklist:', e);
    }
  };

  // Mutação: Alterar o Agente Responsável da Tarefa
  const handleUpdateAssignedAgent = async (taskId: string, newAgentId: string) => {
    setActiveDropdown(null);
    try {
      const { error } = await supabase
        .from('contact_notes')
        .update({ assigned_to: newAgentId || null })
        .eq('id', taskId);

      if (error) throw error;

      setTasks(prev => prev.map(t => {
        if (t.noteId === taskId) {
          return { ...t, assignedTo: newAgentId || null };
        }
        return t;
      }));
    } catch (e) {
      console.warn('Erro ao atualizar operador responsável:', e);
    }
  };

  // Mutação: Editar/Mudar Data de Vencimento
  const handleUpdateDueDate = async (task: any, dateStr: string) => {
    try {
      // Obter metadados antigos para não perdê-los
      const { data: dbNote } = await supabase
        .from('contact_notes')
        .select('media_metadata')
        .eq('id', task.noteId)
        .single();
        
      const oldMeta = dbNote?.media_metadata || {};
      const newMeta = { ...oldMeta, due_date: dateStr };

      const { error } = await supabase
        .from('contact_notes')
        .update({ media_metadata: newMeta })
        .eq('id', task.noteId);

      if (error) throw error;

      setTasks(prev => prev.map(t => {
        if (t.noteId === task.noteId) {
          return { ...t, dueDate: dateStr };
        }
        return t;
      }));
    } catch (e) {
      console.error('Erro ao atualizar data limite:', e);
    }
  };

  // Mutação: Editar/Mudar Texto Descritivo da Tarefa (Inline)
  const handleUpdateTaskText = async (taskId: string, newText: string) => {
    if (!newText.trim()) return;
    try {
      const { error } = await supabase
        .from('contact_notes')
        .update({ content: newText.trim() })
        .eq('id', taskId);

      if (error) throw error;

      setTasks(prev => prev.map(t => {
        if (t.noteId === taskId) {
          return { ...t, text: newText.trim() };
        }
        return t;
      }));
      setEditingTextTaskId(null);
    } catch (e) {
      console.error('Erro ao atualizar descrição da tarefa:', e);
    }
  };

  // Mutação: Adicionar Subtarefa Inline no Card
  const handleInlineAddChecklistItem = async (task: any) => {
    const text = inlineChecklistInputs[task.noteId];
    if (!text || !text.trim()) return;
    
    const newItem = { text: text.trim(), completed: false };
    const updatedChecklist = [...(task.checklistItems || []), newItem];
    const allCompleted = updatedChecklist.every((i: any) => i.completed);

    try {
      const { error } = await supabase
        .from('contact_notes')
        .update({
          checklist_items: updatedChecklist,
          task_completed: allCompleted
        })
        .eq('id', task.noteId);

      if (error) throw error;

      setTasks(prev => prev.map(t => {
        if (t.noteId === task.noteId) {
          return { ...t, checklistItems: updatedChecklist, completed: allCompleted };
        }
        return t;
      }));
      setInlineChecklistInputs(prev => ({ ...prev, [task.noteId]: '' }));
    } catch (e) {
      console.error('Erro ao adicionar subtarefa inline:', e);
    }
  };

  // Mutação: Excluir Subtarefa Inline no Card
  const handleInlineDeleteChecklistItem = async (task: any, itemIdx: number) => {
    const updatedChecklist = task.checklistItems.filter((_: any, idx: number) => idx !== itemIdx);
    const allCompleted = updatedChecklist.length > 0 && updatedChecklist.every((i: any) => i.completed);

    try {
      const { error } = await supabase
        .from('contact_notes')
        .update({
          checklist_items: updatedChecklist,
          task_completed: allCompleted
        })
        .eq('id', task.noteId);

      if (error) throw error;

      setTasks(prev => prev.map(t => {
        if (t.noteId === task.noteId) {
          return { ...t, checklistItems: updatedChecklist, completed: allCompleted };
        }
        return t;
      }));
    } catch (e) {
      console.error('Erro ao excluir subtarefa inline:', e);
    }
  };

  // Mutação: Marcar Tarefa Inteira como Concluída
  const handleCompleteWholeTask = async (taskId: string, task: any) => {
    // Marcar também todos os itens do checklist como concluídos se houver
    const updatedChecklist = task.checklistItems.map((i: any) => ({ ...i, completed: true }));
    
    try {
      const { error } = await supabase
        .from('contact_notes')
        .update({
          task_completed: true,
          checklist_items: updatedChecklist
        })
        .eq('id', taskId);

      if (error) throw error;

      setTasks(prev => prev.map(t => {
        if (t.noteId === taskId) {
          return { ...t, completed: true, checklistItems: updatedChecklist };
        }
        return t;
      }));
    } catch (e) {
      console.error('Erro ao concluir tarefa CRM:', e);
    }
  };

  // Mutação: Excluir Tarefa CRM no Supabase
  const handleDeleteTask = async (taskId: string) => {
    const confirm = window.confirm('Deseja realmente excluir permanentemente esta tarefa do CRM?');
    if (!confirm) return;

    try {
      const { error } = await supabase
        .from('contact_notes')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      setTasks(prev => prev.filter(t => t.noteId !== taskId));
    } catch (e) {
      console.error('Erro ao excluir tarefa:', e);
    }
  };

  // Redirecionamento Rápido: Abrir Chat e Timeline
  const handleViewInChat = (task: any) => {
    // Encontra o ID composto real correspondente a este contato no store
    const stateContacts = useChatStore.getState().contacts;
    const foundContact = stateContacts.find(c => 
      c.id === `${task.contactId}_${task.instanceId}` || 
      c.id.startsWith(`${task.contactId}_`) || 
      c.id === task.contactId
    );

    if (foundContact) {
      // Setar chat ativo
      useChatStore.setState({ activeChatId: foundContact.id });
      
      // Polling para scroll e glow-effect na timeline do ChatDashboard
      setTimeout(() => {
        const tryScroll = () => {
          const element = document.getElementById(`note-card-${task.noteId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('animate-glow-highlight');
            setTimeout(() => element.classList.remove('animate-glow-highlight'), 2500);
            return true;
          }
          return false;
        };

        if (!tryScroll()) {
          let attempts = 0;
          const interval = setInterval(() => {
            attempts++;
            if (tryScroll() || attempts >= 20) clearInterval(interval);
          }, 150);
        }
      }, 300);
    }
    
    // Navegar para rota de chat
    navigate('/chat');
  };

  // Ações do Modal de Nova Tarefa CRM
  const handleAddChecklistItem = () => {
    if (!checklistInput.trim()) return;
    setNewChecklist(prev => [...prev, checklistInput.trim()]);
    setChecklistInput('');
  };

  const handleRemoveChecklistItem = (index: number) => {
    setNewChecklist(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleCreateCrmTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactId || !newContent.trim()) {
      alert('Por favor, preencha o contato e o detalhamento da tarefa.');
      return;
    }

    setIsSubmitting(true);
    try {
      const tenantId = tenantInfo?.id || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
      if (!tenantId) return;

      // Nome do criador
      let creatorName = 'Agente';
      if (currentAgent && currentAgent.full_name) {
        creatorName = currentAgent.full_name;
      }

      // Payload do checklist formatado
      const checklistPayload = newChecklist.map(text => ({ text, completed: false }));

      // Metadados com a data de vencimento
      const metadataPayload = { due_date: newDueDate };

      const { data, error } = await supabase
        .from('contact_notes')
        .insert({
          tenant_id: tenantId,
          contact_id: newContactId,
          content: newContent,
          created_by_name: creatorName,
          is_task: true,
          task_completed: false,
          assigned_to: newAgentId || null,
          checklist_items: checklistPayload,
          media_metadata: metadataPayload
        })
        .select();

      if (error) throw error;

      // Fechar modal e resetar formulário
      setShowCreateModal(false);
      setNewContactId('');
      setNewAgentId('');
      setNewContent('');
      setNewChecklist([]);
      setContactSearch('');
      fetchCrmTasks(); // Recarregar lista
    } catch (e) {
      console.error('Erro ao criar tarefa CRM:', e);
      alert('Falha ao cadastrar a tarefa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtrar lista de contatos para o Dropdown de criação de tarefas
  const searchedContactsForCreation = React.useMemo(() => {
    if (!contactSearch.trim()) return [];
    return contacts.filter(c => 
      (c.custom_name || c.name || '').toLowerCase().includes(contactSearch.toLowerCase()) ||
      (c.phone || '').includes(contactSearch)
    ).slice(0, 8); // limitar a 8 resultados
  }, [contacts, contactSearch]);

  const cleanContactId = (id: string) => id.includes('_') ? id.split('_')[0] : id;

  return (
    <div className="flex-1 flex h-[100dvh] w-full overflow-hidden bg-[#e9edef] dark:bg-[#111b21] relative select-none">
      <main className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Cabeçalho Superior Premium */}
        <header className="min-h-20 bg-white/50 dark:bg-[#202c33]/80 backdrop-blur-xl border-b border-[#d1d7db] dark:border-[#222d34] flex flex-col sm:flex-row sm:items-center sm:justify-between px-6 py-4 sm:py-2 gap-4 flex-shrink-0 z-10 shadow-sm transition-all duration-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-inner">
              <ClipboardList size={22} className="animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-gray-800 dark:text-gray-100 font-sans">
                CRM - Painel Estratégico de Tarefas
              </h1>
              <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 font-sans mt-0.5">
                Gerencie checklists, prazos e controle a produtividade do time em tempo real
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs shadow-lg shadow-amber-500/25 hover:shadow-amber-500/35 transition-all hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-2"
          >
            <Plus size={15} strokeWidth={2.5} /> Nova Tarefa CRM
          </button>
        </header>

        {/* Corpo Principal da Página (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 sm:space-y-8 custom-scrollbar">
          
          {/* Seção 1: Indicadores e KPIs de Saúde CRM (Visão Estratégica) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
            
            {/* KPI 1: Taxa de Saúde de Entregas */}
            <div className="bg-white/80 dark:bg-[#202c33]/85 backdrop-blur-md rounded-[32px] border border-black/5 dark:border-white/5 p-6 shadow-sm flex items-center justify-between group relative overflow-hidden">
              <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-emerald-500/5 dark:bg-emerald-500/10 group-hover:bg-emerald-500/15 blur-2xl rounded-full transition-colors pointer-events-none" />
              <div className="space-y-2">
                <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest block font-sans">
                  Saúde do CRM
                </span>
                <div className="flex items-baseline gap-1.5">
                  <h2 className="text-3xl font-black tracking-tight text-gray-800 dark:text-gray-100 font-sans">
                    {computedMetrics.healthRate}%
                  </h2>
                  <TrendingUp size={16} className="text-emerald-500 animate-bounce shrink-0" />
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-sans font-medium">
                  Taxa de tarefas resolvidas no prazo
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shadow-inner">
                <Percent size={20} />
              </div>
            </div>

            {/* KPI 2: Tarefas Pendentes */}
            <div className="bg-white/80 dark:bg-[#202c33]/85 backdrop-blur-md rounded-[32px] border border-black/5 dark:border-white/5 p-6 shadow-sm flex items-center justify-between group relative overflow-hidden">
              <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-amber-500/5 dark:bg-amber-500/10 group-hover:bg-amber-500/15 blur-2xl rounded-full transition-colors pointer-events-none" />
              <div className="space-y-2">
                <span className="text-[11px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest block font-sans">
                  Tarefas Pendentes
                </span>
                <h2 className="text-3xl font-black tracking-tight text-gray-800 dark:text-gray-100 font-sans">
                  {computedMetrics.active}
                </h2>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-sans font-medium">
                  Anotações ativas em andamento
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shadow-inner">
                <Clock size={20} />
              </div>
            </div>

            {/* KPI 3: Tarefas Concluídas */}
            <div className="bg-white/80 dark:bg-[#202c33]/85 backdrop-blur-md rounded-[32px] border border-black/5 dark:border-white/5 p-6 shadow-sm flex items-center justify-between group relative overflow-hidden">
              <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-indigo-500/5 dark:bg-indigo-500/10 group-hover:bg-indigo-500/15 blur-2xl rounded-full transition-colors pointer-events-none" />
              <div className="space-y-2">
                <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest block font-sans">
                  Entregues e Concluídas
                </span>
                <h2 className="text-3xl font-black tracking-tight text-gray-800 dark:text-gray-100 font-sans">
                  {computedMetrics.completed}
                </h2>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-sans font-medium">
                  Checklists totalmente resolvidos
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shadow-inner">
                <CheckCircle2 size={20} />
              </div>
            </div>

            {/* KPI 4: Tarefas Vencidas/Atrasadas */}
            <div className="bg-white/80 dark:bg-[#202c33]/85 backdrop-blur-md rounded-[32px] border border-black/5 dark:border-white/5 p-6 shadow-sm flex items-center justify-between group relative overflow-hidden">
              <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-rose-500/5 dark:bg-rose-500/10 group-hover:bg-rose-500/15 blur-2xl rounded-full transition-colors pointer-events-none" />
              <div className="space-y-2">
                <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest block font-sans">
                  Tarefas em Atraso
                </span>
                <div className="flex items-baseline gap-1.5">
                  <h2 className="text-3xl font-black tracking-tight text-gray-800 dark:text-gray-100 font-sans">
                    {computedMetrics.overdue}
                  </h2>
                  {computedMetrics.overdue > 0 && (
                    <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[8px] font-extrabold rounded-md uppercase tracking-wider animate-pulse font-sans">
                      Crítico
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-sans font-medium">
                  Notas com prazo limite expirado
                </p>
              </div>
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner transition-colors",
                computedMetrics.overdue > 0 ? "bg-rose-500/15 text-rose-500" : "bg-gray-100 text-gray-400 dark:bg-white/5"
              )}>
                <AlertTriangle size={20} className={cn(computedMetrics.overdue > 0 && "animate-pulse")} />
              </div>
            </div>

          </div>

          {/* Seção 2: Produtividade do Time & Análise Visual de Status */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            
            {/* Gráfico/Progresso Visual de Status */}
            <div className="bg-white dark:bg-[#202c33] border border-black/5 dark:border-white/5 rounded-[32px] p-6 shadow-sm space-y-6 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 font-sans">
                  Distribuição de Status CRM
                </h3>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-sans mt-0.5">
                  Visão geral da volumetria ativa da empresa
                </p>
              </div>

              {/* Animação Circular SVG da Saúde */}
              <div className="flex justify-center items-center py-4">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" className="stroke-[#f0f2f5] dark:stroke-white/5" strokeWidth="8" fill="transparent" />
                    <circle 
                      cx="50" 
                      cy="50" 
                      r="40" 
                      className="stroke-emerald-500 transition-all duration-1000" 
                      strokeWidth="8" 
                      fill="transparent" 
                      strokeDasharray={251.2}
                      strokeDashoffset={251.2 - (251.2 * computedMetrics.healthRate) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-gray-800 dark:text-gray-100 font-sans">{computedMetrics.healthRate}%</span>
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Saúde</span>
                  </div>
                </div>
              </div>

              {/* Barras Horizontais com Gradientes */}
              <div className="space-y-3 font-sans text-xs">
                {/* Concluído */}
                <div className="space-y-1">
                  <div className="flex justify-between font-semibold text-gray-500 dark:text-gray-400 text-[11px]">
                    <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Concluído</span>
                    <span className="text-gray-800 dark:text-gray-200">{computedMetrics.completed}</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${computedMetrics.total > 0 ? (computedMetrics.completed / computedMetrics.total) * 100 : 100}%` }} />
                  </div>
                </div>

                {/* Pendente Ativo */}
                <div className="space-y-1">
                  <div className="flex justify-between font-semibold text-gray-500 dark:text-gray-400 text-[11px]">
                    <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Pendente Ativo</span>
                    <span className="text-gray-800 dark:text-gray-200">{computedMetrics.active}</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${computedMetrics.total > 0 ? (computedMetrics.active / computedMetrics.total) * 100 : 0}%` }} />
                  </div>
                </div>

                {/* Atrasado */}
                <div className="space-y-1">
                  <div className="flex justify-between font-semibold text-gray-500 dark:text-gray-400 text-[11px]">
                    <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Atrasado (Vencido)</span>
                    <span className="text-gray-800 dark:text-gray-200">{computedMetrics.overdue}</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${computedMetrics.total > 0 ? (computedMetrics.overdue / computedMetrics.total) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Produtividade / Ranking dos Colaboradores */}
            <div className="bg-white dark:bg-[#202c33] border border-black/5 dark:border-white/5 rounded-[32px] p-6 shadow-sm space-y-6 xl:col-span-2 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 font-sans">
                  {isAdministrative ? 'Ranking de Produtividade dos Colaboradores' : 'Meu Desempenho de Produtividade'}
                </h3>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-sans mt-0.5">
                  {isAdministrative 
                    ? 'Eficiência de resolução de tarefas do CRM por agente' 
                    : 'Sua eficiência de resolução de tarefas ativas do CRM'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[260px] pr-1 space-y-3 custom-scrollbar">
                {teamPerformance.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 dark:text-gray-500 italic text-xs">
                    {isAdministrative ? 'Nenhum colaborador encontrado no tenant.' : 'Você não possui tarefas ativas no CRM.'}
                  </div>
                ) : (
                  teamPerformance.map((agent, index) => {
                    const totalAgentTasks = agent.completed + agent.pending;
                    const efficiency = totalAgentTasks > 0 ? Math.round((agent.completed / totalAgentTasks) * 100) : 0;
                    return (
                      <div 
                        key={agent.id} 
                        className="p-3 bg-gray-50/50 dark:bg-[#111b21]/50 border border-black/5 dark:border-white/5 rounded-2xl flex items-center justify-between gap-4 font-sans text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-xl bg-[#00a884]/10 dark:bg-[#00a884]/20 text-[#00a884] dark:text-emerald-400 flex items-center justify-center font-bold font-sans">
                            {isAdministrative ? `${index + 1}º` : '🏆'}
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="font-bold text-gray-800 dark:text-gray-100 truncate">
                              {agent.name}
                            </span>
                            <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium">
                              {agent.completed} concluídas / {agent.pending} pendentes
                            </span>
                          </div>
                        </div>

                        {/* Barra de Progresso de Eficiência do Agente */}
                        <div className="flex items-center gap-4 w-44 shrink-0 justify-end">
                          <div className="flex flex-col flex-1 gap-1">
                            <div className="h-1.5 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${efficiency}%` }} />
                            </div>
                            <span className="text-[9px] text-gray-400 text-right font-medium">Eficiência: {efficiency}%</span>
                          </div>
                          
                          <div className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 font-extrabold text-[9px] uppercase shrink-0">
                            {efficiency >= 80 ? 'Excelente' : efficiency >= 50 ? 'Estável' : 'Abaixo'}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>

          {/* Seção 3: Barra de Filtros e Listagem Dinâmica de Tarefas */}
          <div className="space-y-6">
            
            {/* Barra de Filtros Avançados */}
            <div className="bg-white dark:bg-[#202c33] border border-black/5 dark:border-white/5 rounded-3xl px-4 py-4 sm:px-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 z-20 relative">
              <div className="flex items-center gap-3 bg-[#f0f2f5] dark:bg-[#111b21] px-4 py-2.5 rounded-2xl w-full lg:w-80 shadow-inner">
                <Search size={16} className="text-[#54656f] dark:text-[#aebac1]" />
                <input 
                  type="text" 
                  placeholder="Pesquisar contato..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent border-none outline-none text-xs w-full dark:text-[#d1d7db] placeholder:text-[#54656f]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full lg:w-auto lg:flex lg:items-center lg:flex-wrap font-sans text-xs">
                
                {/* Seletor de Colaborador */}
                {isAdministrative && (
                  <div className="flex items-center justify-between sm:justify-start gap-2 bg-[#f0f2f5] dark:bg-[#111b21] px-3.5 py-1.5 rounded-2xl lg:bg-transparent lg:p-0">
                    <span className="text-gray-400 font-semibold select-none">Colaborador:</span>
                    <select 
                      value={selectedAgentFilter}
                      onChange={(e) => setSelectedAgentFilter(e.target.value)}
                      className="bg-transparent dark:text-gray-100 border-none outline-none px-2 py-1 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-amber-500/50 w-36 text-right sm:text-left cursor-pointer"
                    >
                      <option value="all" className="bg-white dark:bg-[#202c33] text-gray-900 dark:text-gray-100">Todos</option>
                      {agents.map(a => (
                        <option key={a.id} value={a.id} className="bg-white dark:bg-[#202c33] text-gray-900 dark:text-gray-100">{a.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Seletor de Status de Saúde */}
                <div className="flex items-center justify-between sm:justify-start gap-2 bg-[#f0f2f5] dark:bg-[#111b21] px-3.5 py-1.5 rounded-2xl lg:bg-transparent lg:p-0">
                  <span className="text-gray-400 font-semibold select-none">Status:</span>
                  <select 
                    value={selectedStatusFilter}
                    onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
                    className="bg-transparent dark:text-gray-100 border-none outline-none px-2 py-1 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-amber-500/50 w-32 text-right sm:text-left cursor-pointer"
                  >
                    <option value="all" className="bg-white dark:bg-[#202c33] text-gray-900 dark:text-gray-100">Todos</option>
                    <option value="pending" className="bg-white dark:bg-[#202c33] text-gray-900 dark:text-gray-100">Pendentes</option>
                    <option value="completed" className="bg-white dark:bg-[#202c33] text-gray-900 dark:text-gray-100">Concluídos</option>
                    <option value="overdue" className="bg-white dark:bg-[#202c33] text-gray-900 dark:text-gray-100">Atrasados</option>
                  </select>
                </div>

              </div>
            </div>

            {/* Listagem de Tarefas / Cards Agrupados por Cliente */}
            {loading ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="animate-spin text-amber-500" size={32} />
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="bg-white/50 dark:bg-black/20 rounded-[32px] p-16 text-center text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-white/5 flex flex-col items-center gap-3 animate-in fade-in duration-300">
                <Smile size={32} className="text-gray-300 animate-bounce" />
                <span className="text-xs font-semibold italic">Nenhuma tarefa CRM encontrada com os filtros selecionados.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 animate-in fade-in duration-500">
                {groupedTasks.map((group) => {
                  const completedTasksCount = group.tasks.filter(t => t.completed).length;
                  const totalTasksCount = group.tasks.length;
                  
                  const nowStr = format(new Date(), "yyyy-MM-dd'T'HH:mm");
                  const overdueTasksCount = group.tasks.filter(t => !t.completed && t.dueDate < nowStr).length;
                  const pendingTasksCount = totalTasksCount - completedTasksCount;

                  // Métricas consolidadas de subtarefas/checklists de todo o grupo
                  const totalChecklistGroup = group.tasks.reduce((acc, t) => acc + (t.checklistItems || []).length, 0);
                  const completedChecklistGroup = group.tasks.reduce((acc, t) => acc + (t.checklistItems || []).filter((i: any) => i.completed).length, 0);
                  
                  const overallProgress = totalChecklistGroup > 0 
                    ? Math.round((completedChecklistGroup / totalChecklistGroup) * 100) 
                    : (totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0);

                  return (
                    <div 
                      key={group.contactId} 
                      className="bg-white/80 dark:bg-[#202c33]/85 backdrop-blur-md rounded-[32px] border border-black/5 dark:border-white/5 p-6 flex flex-col justify-between shadow-sm hover:shadow-lg hover:border-amber-500/30 hover:scale-[1.01] transition-all duration-300 relative group overflow-hidden"
                    >
                      {/* Círculo decorativo de fundo */}
                      <div className="absolute -right-6 -bottom-6 w-16 h-16 bg-amber-500/5 group-hover:bg-amber-500/10 blur-xl rounded-full transition-colors pointer-events-none" />

                      {/* Topo do Card: Identificação do Contato */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3 shrink-0 select-none">
                          <div className="flex items-center gap-3 min-w-0">
                            <img 
                              src={group.contactAvatar} 
                              className="w-12 h-12 rounded-full object-cover shadow-sm border border-amber-500/10" 
                              onError={(e) => {
                                e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(group.contactName)}&background=random&color=fff`;
                              }}
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-extrabold text-gray-800 dark:text-gray-100 text-sm tracking-tight truncate">
                                {group.contactName}
                              </span>
                              <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 mt-0.5">
                                {group.contactPhone}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1 items-end shrink-0 select-none">
                            {overdueTasksCount > 0 ? (
                              <span className="px-2 py-0.5 bg-rose-500/10 text-rose-500 text-[8px] font-black uppercase rounded-md border border-rose-500/20 animate-pulse">
                                {overdueTasksCount} {overdueTasksCount === 1 ? 'Atrasada' : 'Atrasadas'}
                              </span>
                            ) : pendingTasksCount > 0 ? (
                              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase rounded-md border border-amber-500/20">
                                {pendingTasksCount} {pendingTasksCount === 1 ? 'Pendente' : 'Pendentes'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase rounded-md border border-emerald-500/20">
                                Concluído
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Barra de Progresso Consolidada de checklists */}
                        <div className="space-y-1.5 pt-1.5 select-none">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <CheckSquare size={11} className="text-amber-500" /> 
                              Progresso Geral ({completedTasksCount}/{totalTasksCount} Tarefas)
                            </span>
                            <span>{overallProgress}%</span>
                          </div>

                          <div className="h-2 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full transition-all duration-500" 
                              style={{ width: `${overallProgress}%` }}
                            />
                          </div>
                        </div>

                        {/* Mini-Preview Discreto das Tarefas */}
                        <div className="space-y-2 mt-4 pt-3 border-t border-black/5 dark:border-white/5 text-[11px] font-medium text-gray-500 dark:text-gray-400 font-sans">
                          <div className="text-[9px] font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1"><ClipboardList size={10} /> Preview das Tarefas</div>
                          {group.tasks.slice(0, 2).map((t, idx) => (
                            <div key={idx} className="flex gap-2 items-start truncate opacity-85 hover:opacity-100 transition-opacity">
                              <span className="text-amber-500 shrink-0">•</span>
                              <span className="truncate flex-1 select-none" title={t.text}>{t.text}</span>
                              {t.completed && <span className="text-emerald-500 text-[8px] font-black shrink-0 uppercase">[Concluída]</span>}
                            </div>
                          ))}
                          {group.tasks.length > 2 && (
                            <div className="text-[9px] italic text-gray-400 text-right pl-3 font-semibold">+ {group.tasks.length - 2} tarefas adicionais...</div>
                          )}
                        </div>

                      </div>

                      {/* Botão de Rodapé para Expandir */}
                      <button
                        type="button"
                        onClick={() => setExpandedContactId(group.contactId)}
                        className="w-full mt-5 py-2.5 bg-gradient-to-r from-amber-500/10 to-amber-600/10 hover:from-amber-500 hover:to-amber-600 hover:text-white border border-amber-500/20 text-amber-700 dark:text-amber-400 hover:border-transparent font-extrabold text-[10px] uppercase rounded-2xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all duration-300 font-sans"
                      >
                        <ClipboardList size={13} /> Gerenciar {group.tasks.length} {group.tasks.length === 1 ? 'Tarefa' : 'Tarefas'}
                      </button>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Modal Premium de Visualização de Tarefas do Cliente Ativo (Explosão na Tela) */}
      {activeGroup && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white/95 dark:bg-[#1e2b34]/95 backdrop-blur-2xl w-full max-w-6xl rounded-[40px] border border-amber-500/25 dark:border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 flex flex-col max-h-[90vh]">
            
            {/* Header do Modal */}
            <div className="p-6 border-b border-gray-150 dark:border-white/5 bg-gradient-to-r from-amber-500/10 to-transparent flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-3">
                <img 
                  src={activeGroup.contactAvatar} 
                  className="w-12 h-12 rounded-full object-cover shadow-sm border-2 border-amber-500/30" 
                  onError={(e) => {
                    e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(activeGroup.contactName)}&background=random&color=fff`;
                  }}
                />
                <div>
                  <h2 className="text-lg font-black text-gray-800 dark:text-gray-100 font-sans tracking-tight">
                    Tarefas de {activeGroup.contactName}
                  </h2>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-sans font-bold uppercase tracking-wider mt-0.5">
                    {activeGroup.contactPhone} • {activeGroup.tasks.length} {activeGroup.tasks.length === 1 ? 'tarefa ativa' : 'tarefas ativas'} no CRM
                  </p>
                </div>
              </div>
              
              <button 
                type="button"
                onClick={() => setExpandedContactId(null)}
                className="text-gray-400 hover:text-red-500 hover:bg-red-500/10 p-2 rounded-full transition-all hover:scale-110 active:scale-95 border border-transparent hover:border-red-500/20 shadow-sm flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corpo com Grid de Cards de Tarefas Individuais */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-gray-50/50 dark:bg-black/10 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {activeGroup.tasks.map((task) => {
                  const nowStr = format(new Date(), "yyyy-MM-dd'T'HH:mm");
                  const isOverdue = !task.completed && task.dueDate < nowStr;
                  const completedCount = (task.checklistItems || []).filter((i: any) => i.completed).length;
                  const totalChecklist = (task.checklistItems || []).length;
                  
                  // Mapeamento do agente responsável
                  const assignedAgentObj = agents.find(a => a.id === task.assignedTo);
                  const assignedAgentName = assignedAgentObj ? (assignedAgentObj.full_name || 'Agente') : 'Sem Agente';

                  return (
                    <div 
                      key={task.noteId} 
                      className={cn(
                        "bg-white dark:bg-[#202c33] rounded-[32px] border p-6 flex flex-col justify-between shadow-sm border-black/5 dark:border-white/5 transition-all hover:shadow-md hover:border-amber-500/20 duration-300 relative group/card animate-in fade-in duration-200",
                        task.completed && "opacity-75"
                      )}
                    >
                      {/* Círculo decorativo de fundo */}
                      <div className="absolute -right-6 -bottom-6 w-16 h-16 bg-amber-500/5 group-hover/card:bg-amber-500/10 blur-xl rounded-full transition-colors pointer-events-none" />

                      {/* Topo do Card: Identificação e Status */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3 shrink-0 select-none">
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                            CRM ID: #{task.noteId.substring(0, 5)}
                          </span>

                          <div className="flex flex-col gap-1 items-end shrink-0">
                            {task.completed ? (
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase rounded-md flex items-center gap-1 leading-none h-5 border border-emerald-500/20">
                                <CheckCircle2 size={10} /> Concluída
                              </span>
                            ) : isOverdue ? (
                              <span className="px-2 py-0.5 bg-rose-500/10 text-rose-500 text-[8px] font-black uppercase rounded-md flex items-center gap-1 leading-none h-5 border border-rose-500/20 animate-pulse">
                                <AlertTriangle size={10} /> Vencida
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase rounded-md flex items-center gap-1 leading-none h-5 border border-amber-500/20">
                                <Clock size={10} /> Pendente
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Texto da tarefa com Edição Inline */}
                        {editingTextTaskId === task.noteId ? (
                          <div className="space-y-2 font-sans">
                            <textarea
                              rows={3}
                              value={editingTextValue}
                              onChange={(e) => setEditingTextValue(e.target.value)}
                              className="w-full text-xs text-gray-855 dark:text-gray-100 bg-[#f0f2f5] dark:bg-[#111b21] border border-amber-500/30 rounded-2xl p-3 outline-none focus:ring-1 focus:ring-amber-500 leading-relaxed resize-none font-medium"
                              autoFocus
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => setEditingTextTaskId(null)}
                                className="px-3 py-1 bg-gray-100 dark:bg-white/5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-xl text-[10px] font-bold transition-all active:scale-95"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateTaskText(task.noteId, editingTextValue)}
                                className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-bold transition-all active:scale-95"
                              >
                                Salvar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative group/text">
                            <div className="text-xs text-gray-750 dark:text-gray-200 font-sans font-medium whitespace-pre-wrap leading-relaxed min-h-[50px] select-text pr-6">
                              {task.text}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTextTaskId(task.noteId);
                                setEditingTextValue(task.text);
                              }}
                              className="absolute right-0 top-0 p-1 text-gray-400 hover:text-amber-500 bg-transparent rounded-lg opacity-0 group-hover/text:opacity-100 transition-opacity"
                              title="Editar Descrição"
                            >
                              <Edit2 size={12} />
                            </button>
                          </div>
                        )}

                        {/* Checklist CRM */}
                        <div className="space-y-2 pt-2 border-t border-black/5 dark:border-white/5">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 select-none">
                            <span className="flex items-center gap-1">
                              <CheckSquare size={11} className="text-amber-500 animate-pulse" /> 
                              Checklist ({completedCount}/{totalChecklist})
                            </span>
                            <span>{totalChecklist > 0 ? Math.round((completedCount / totalChecklist) * 100) : 0}%</span>
                          </div>

                       {totalChecklist > 0 && (
                         <div className="h-1.5 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                           <div 
                             className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full transition-all duration-300" 
                             style={{ width: `${(completedCount / totalChecklist) * 100}%` }}
                           />
                         </div>
                       )}

                          {/* Sub-itens do Checklist Interativo */}
                          <div className="space-y-1.5 pl-0.5 max-h-[120px] overflow-y-auto pr-0.5 custom-scrollbar font-sans select-none">
                            {(task.checklistItems || []).map((item: any, idx: number) => (
                              <div 
                                key={idx} 
                                className="flex items-center gap-2 p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors group/item relative"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleToggleChecklistItem(task, idx)}
                                  className={cn(
                                    "w-4 h-4 rounded flex items-center justify-center border transition-all active:scale-90 shrink-0",
                                    item.completed
                                      ? "bg-emerald-500 border-emerald-500 text-white"
                                      : "border-gray-300 dark:border-gray-600 hover:border-amber-500 bg-transparent"
                                  )}
                                >
                                  {item.completed && <CheckCircle2 size={10} strokeWidth={3} className="text-white" />}
                                </button>
                                <span className={cn(
                                  "text-xs font-semibold text-gray-700 dark:text-gray-200 truncate flex-1",
                                  item.completed && "line-through opacity-50 font-normal"
                                )}>
                                  {item.text}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleInlineDeleteChecklistItem(task, idx)}
                                  className="p-0.5 text-slate-400 hover:text-red-500 rounded transition-all shrink-0 ml-auto opacity-0 group-hover/item:opacity-100"
                                  title="Remover subtarefa"
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Input de Adição de Checklist Inline no Card */}
                          <div className="flex gap-1.5 pt-1.5 border-t border-dashed border-black/5 dark:border-white/5">
                            <input 
                              type="text"
                              placeholder="Nova subtarefa..."
                              value={inlineChecklistInputs[task.noteId] || ''}
                              onChange={(e) => setInlineChecklistInputs(prev => ({ ...prev, [task.noteId]: e.target.value }))}
                              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleInlineAddChecklistItem(task))}
                              className="flex-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-gray-100 border border-transparent rounded-xl px-2.5 py-1.5 outline-none placeholder:text-gray-400 text-[10px] font-semibold focus:ring-1 focus:ring-amber-500/50 shadow-inner"
                            />
                            <button
                              type="button"
                              onClick={() => handleInlineAddChecklistItem(task)}
                              className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold active:scale-95 transition-all text-[9px]"
                            >
                              Adicionar
                            </button>
                          </div>
                        </div>

                        {/* Informações de Controle: Agente Atribuído & Prazo */}
                        <div className="pt-3 border-t border-black/5 dark:border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px] font-sans text-gray-500 dark:text-gray-400 select-none">
                          
                          {/* Atribuição de Operador com Dropdown Interativo */}
                          <div className="flex flex-col gap-1 relative">
                            <span className="font-bold flex items-center gap-0.5">👤 Responsável</span>
                            <button
                              type="button"
                              disabled={!isAdministrative}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isAdministrative) {
                                  setActiveDropdown(activeDropdown === `agent-${task.noteId}` ? null : `agent-${task.noteId}`);
                                }
                              }}
                              className={cn(
                                "w-full py-1.5 px-2.5 bg-gray-50 dark:bg-[#111b21] border border-black/5 dark:border-white/5 rounded-xl font-bold text-gray-700 dark:text-gray-200 flex items-center justify-between gap-1 transition-all",
                                isAdministrative 
                                  ? "hover:bg-amber-500/10 dark:hover:bg-amber-500/15 hover:border-amber-500/20" 
                                  : "opacity-80 cursor-not-allowed"
                              )}
                            >
                              <span className="truncate">{assignedAgentName}</span>
                              {isAdministrative && <ChevronRight size={10} className="rotate-90 text-gray-400" />}
                            </button>

                            {/* Dropdown Popover de Agente */}
                            {activeDropdown === `agent-${task.noteId}` && (
                              <>
                                <div className="fixed inset-0 z-30 cursor-default" onClick={() => setActiveDropdown(null)} />
                                <div className="absolute bottom-[calc(100%+6px)] left-0 w-44 bg-white/95 dark:bg-[#1e2b34]/95 backdrop-blur-md border border-amber-500/25 dark:border-white/10 rounded-2xl shadow-xl p-2 z-40 animate-in fade-in slide-in-from-bottom-2 duration-150 flex flex-col max-h-[160px] overflow-y-auto custom-scrollbar">
                                  <button
                                    onClick={() => handleUpdateAssignedAgent(task.noteId, '')}
                                    className="w-full text-left px-3 py-1.5 rounded-lg text-[10px] font-bold text-red-500 hover:bg-red-500/10 transition-colors"
                                  >
                                    Remover Responsável
                                  </button>
                                  {agents.map(a => (
                                    <button
                                      key={a.id}
                                      onClick={() => handleUpdateAssignedAgent(task.noteId, a.id)}
                                      className={cn(
                                        "w-full text-left px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors",
                                        task.assignedTo === a.id 
                                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                          : "text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5"
                                      )}
                                    >
                                      {a.full_name}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>

                          {/* Data Limite / Due Date */}
                          <div className="flex flex-col gap-1 relative">
                            <span className="font-bold flex items-center gap-0.5">📅 Data Limite</span>
                            <div className="relative">
                              <Calendar size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10" />
                              <input 
                                type="datetime-local"
                                value={task.dueDate}
                                onChange={(e) => handleUpdateDueDate(task, e.target.value)}
                                className="w-full py-1.5 pl-7 pr-2 bg-gray-50 dark:bg-[#111b21] dark:text-white border border-black/5 dark:border-white/5 rounded-xl font-bold text-gray-700 outline-none focus:border-amber-500/30 transition-colors [color-scheme:dark]"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Rodapé do Card: Ações */}
                      <div className="mt-5 pt-4 border-t border-black/5 dark:border-white/5 flex gap-2 shrink-0 select-none">
                        {!task.completed && (
                          <button
                            type="button"
                            onClick={() => handleCompleteWholeTask(task.noteId, task)}
                            className="flex-1 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-extrabold text-[10px] uppercase rounded-xl border border-emerald-500/10 hover:border-emerald-500/30 flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all font-sans"
                          >
                            <CheckCircle2 size={12} /> Concluir
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedContactId(null); // Fechar modal de grupo ao redirecionar
                            handleViewInChat(task);
                          }}
                          className="flex-1 py-2 bg-[#f0f2f5] dark:bg-[#111b21] hover:bg-amber-500/10 dark:hover:bg-amber-500/15 text-gray-700 dark:text-gray-200 font-extrabold text-[10px] uppercase rounded-xl border border-black/5 dark:border-white/5 hover:border-amber-500/20 flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all font-sans"
                        >
                          <MessageSquare size={12} /> Chat
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.noteId)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all active:scale-90"
                          title="Excluir Tarefa CRM"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Footer do Modal */}
            <div className="p-4 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setExpandedContactId(null)}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold text-xs shadow-md transition-all active:scale-95"
              >
                Fechar Painel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal Premium de Nova Tarefa CRM */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white/95 dark:bg-[#1e2b34]/95 backdrop-blur-2xl w-full max-w-lg rounded-[32px] border border-amber-500/25 dark:border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 flex flex-col max-h-[85vh]">
            
            {/* Header do Modal */}
            <div className="p-6 border-b border-gray-100 dark:border-white/5 bg-gradient-to-r from-amber-500/10 to-transparent flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-inner">
                  <ClipboardList size={20} className="animate-pulse" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 font-sans">
                    Nova Tarefa CRM
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-sans">
                    Cadastre tarefas, defina o responsável e crie checklists
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-red-500 transition-all p-1 hover:scale-110"
              >
                <X size={16} />
              </button>
            </div>

            {/* Corpo do Formulário */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 styled-scrollbar-none">
              
              {/* 1. Selecionar Contato com Pesquisa */}
              <div className="space-y-1 relative">
                <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider font-sans select-none">
                  Contato Associado *
                </label>
                <div className="flex bg-[#f0f2f5] dark:bg-[#111b21] px-4 py-2.5 rounded-2xl items-center gap-2 shadow-inner">
                  <Search size={16} className="text-[#54656f] dark:text-[#aebac1]" />
                  <input 
                    type="text" 
                    placeholder="Pesquisar contato por nome ou telefone..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="bg-transparent border-none outline-none text-xs w-full dark:text-[#d1d7db] placeholder:text-[#54656f]"
                  />
                </div>

                {/* Resultados da busca de contatos */}
                {searchedContactsForCreation.length > 0 && (
                  <div className="absolute left-0 right-0 top-[100%] mt-1 bg-white dark:bg-[#1e2b34] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl p-2 z-50 max-h-[180px] overflow-y-auto custom-scrollbar flex flex-col gap-1">
                    {searchedContactsForCreation.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setNewContactId(cleanContactId(c.id));
                          setContactSearch(c.custom_name || c.name || c.phone);
                        }}
                        className={cn(
                          "w-full text-left p-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 transition-colors",
                          newContactId === cleanContactId(c.id)
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : "hover:bg-black/5 dark:hover:bg-white/5 text-gray-700 dark:text-gray-200"
                        )}
                      >
                        <img src={c.avatar} className="w-6 h-6 rounded-full object-cover" onError={(e) => e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(c.custom_name || c.name)}&background=random&color=fff`} />
                        <span className="truncate">{c.custom_name || c.name} ({c.phone})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Responsável e Data Limite em Linha */}
              <div className="grid grid-cols-2 gap-4 font-sans text-xs select-none">
                {/* Atribuição de Colaborador */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider select-none">
                    👤 Colaborador Responsável
                  </label>
                  <select 
                    value={newAgentId}
                    disabled={!isAdministrative}
                    onChange={(e) => setNewAgentId(e.target.value)}
                    className={cn(
                      "w-full bg-[#f0f2f5] dark:bg-[#111b21] dark:text-gray-100 border-none outline-none px-4 py-3 rounded-2xl text-xs font-semibold focus:ring-1 focus:ring-amber-500/50 shadow-inner cursor-pointer",
                      !isAdministrative && "opacity-80 bg-gray-100 dark:bg-[#182229] cursor-not-allowed"
                    )}
                  >
                    <option value="" className="bg-white dark:bg-[#202c33] text-gray-900 dark:text-gray-100">Nenhum Agente</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id} className="bg-white dark:bg-[#202c33] text-gray-900 dark:text-gray-100">{a.full_name}</option>
                    ))}
                  </select>
                </div>

                {/* Prazo limite */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider select-none">
                    📅 Data Limite (Prazo)
                  </label>
                  <div className="relative">
                    <Calendar size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input 
                      type="datetime-local"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      className="w-full bg-[#f0f2f5] dark:bg-[#111b21] dark:text-gray-100 border-none outline-none pl-10 pr-4 py-3 rounded-2xl text-xs font-semibold focus:ring-1 focus:ring-amber-500/50 shadow-inner [color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Detalhamento/Texto da Tarefa */}
              <div className="space-y-1 font-sans text-xs">
                <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider select-none">
                  Detalhamento da Tarefa *
                </label>
                <textarea
                  required
                  rows={3}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Escreva de forma clara qual é o objetivo desta tarefa CRM..."
                  className="w-full bg-[#f0f2f5] dark:bg-[#111b21] dark:text-gray-100 border border-transparent rounded-2xl px-4 py-3 outline-none focus:ring-1 focus:ring-amber-500/50 placeholder:text-gray-400 shadow-inner leading-relaxed resize-none text-xs font-medium"
                />
              </div>

              {/* 4. Construtor de Checklist Interativo */}
              <div className="space-y-2 font-sans text-xs">
                <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider select-none">
                  Construir Checklist CRM ({newChecklist.length})
                </label>
                
                {/* Input de Adição */}
                <div className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="Adicionar sub-tarefa..."
                    value={checklistInput}
                    onChange={(e) => setChecklistInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddChecklistItem())}
                    className="flex-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-gray-100 border border-transparent rounded-2xl px-4 py-2.5 outline-none focus:ring-1 focus:ring-amber-500/50 placeholder:text-gray-400 shadow-inner text-xs font-semibold"
                  />
                  <button
                    type="button"
                    onClick={handleAddChecklistItem}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold active:scale-95 transition-all text-xs"
                  >
                    Adicionar
                  </button>
                </div>

                {/* Lista de Itens Criados */}
                {newChecklist.length > 0 && (
                  <div className="p-3 bg-[#f0f2f5]/40 dark:bg-[#111b21]/30 border border-black/5 dark:border-white/5 rounded-2xl space-y-2 max-h-[140px] overflow-y-auto custom-scrollbar">
                    {newChecklist.map((item, index) => (
                      <div key={index} className="flex items-center justify-between gap-3 p-1 bg-white dark:bg-[#202c33] px-3 py-1.5 rounded-xl border border-black/5 shadow-sm">
                        <span className="font-semibold text-gray-700 dark:text-gray-200 truncate">{item}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveChecklistItem(index)}
                          className="text-slate-400 hover:text-red-500 p-0.5 hover:scale-105 active:scale-90 transition-all shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Rodapé do Modal */}
            <div className="px-6 py-5 bg-gray-50/50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5 flex justify-end gap-3 shrink-0 select-none">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-6 py-3 rounded-2xl text-xs font-bold text-gray-600 dark:text-gray-300 bg-[#f0f2f5] dark:bg-[#202c33] hover:bg-gray-200 dark:hover:bg-white/10 active:scale-95 transition-all shadow-sm font-sans"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateCrmTask}
                disabled={isSubmitting}
                className="px-6 py-3 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center gap-2 font-sans"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <CheckSquare size={14} />} Criar Tarefa
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
