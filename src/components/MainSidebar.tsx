import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Search, 
  Inbox, 
  MessageCircle, 
  CheckSquare,
  AtSign, 
  Clock, 
  Users, 
  Layers, 
  Tag, 
  LayoutDashboard, 
  Contact, 
  BarChart3, 
  Megaphone, 
  BookOpen, 
  Settings, 
  ChevronDown,
  ChevronRight,
  Briefcase,
  History,
  Mails,
  Bot,
  MoreVertical,
  RotateCcw,
  Network,
  ScrollText,
  MessageSquareReply,
  Workflow,
  Zap,
  User,
  UserSquare2,
  Code2,
  Repeat,
  CalendarDays,
  Puzzle,
  Smartphone,
  Edit2,
  Plus,
  CheckCircle2,
  LogOut,
  Store,
  X,
  QrCode,
  ClipboardList,
  Target,
  Bell,
  BellOff,
  Building2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useChatStore } from '../store/chatStore';
import { supabase } from '../services/supabase';
import { createPortal } from 'react-dom';
import { getLocalNotificationPrefs, fetchUserInboxNotificationPreferences, toggleInboxNotification } from '../services/notificationPreferences';

import { formatPhoneNumber } from '../utils/format';
import KanbanBoardCreator from './KanbanBoardCreator';
import { AgentSettingsModal } from './AgentSettingsModal';

const SidebarContext = React.createContext<{ onClose?: () => void }>({});

export function MainSidebar({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isAppEmbedded = location.pathname.startsWith('/apps/');
  const theme = useChatStore(state => state.theme);
  const reopenedTicketToast = useChatStore(state => state.reopenedTicketToast);
  const setReopenedTicketToast = useChatStore(state => state.setReopenedTicketToast);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('sidebar_expanded_sections');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return {
      conversations: true,
      crm: true,
      checklists: true,
      apps: false,
      channels: true,
      labels: false,
      settings: false,
      appsDelivery: true
    };
  });
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isBoardCreatorOpen, setIsBoardCreatorOpen] = useState(false);

  const isSearch = searchQuery.trim().length > 0;
  const q = searchQuery.toLowerCase();
  const m = (text: string | null | undefined) => {
    if (!isSearch) return true;
    if (!text) return false;
    return text.toLowerCase().includes(q);
  };



  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = { ...prev, [section]: !prev[section] };
      localStorage.setItem('sidebar_expanded_sections', JSON.stringify(next));
      return next;
    });
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.stopPropagation();

    // 1. Limpeza do Service Worker executada em background (não bloqueante)
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(async (registration) => {
        try {
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            const endpoint = subscription.endpoint;
            await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
            await subscription.unsubscribe();
          }
        } catch (pushErr) {
          console.error('Erro ao remover push subscription:', pushErr);
        }
      }).catch((err) => {
        console.error('Erro ao obter service worker:', err);
      });
    }

    // 2. Limpeza local da store (imediata)
    try {
      useChatStore.getState().clearStore();
    } catch (storeErr) {
      console.error('Erro ao limpar chatStore:', storeErr);
    }

    // 3. SignOut do Supabase em background (não bloqueia a navegação local)
    supabase.auth.signOut().catch((authErr) => {
      console.error('Erro ao fazer signOut no Supabase:', authErr);
    });

    // 4. Limpeza de storage e redirecionamento instantâneo
    try {
      localStorage.clear();
      sessionStorage.clear();
      navigate('/');
    } catch (navigateErr) {
      console.error('Erro ao redirecionar após logout:', navigateErr);
    }
  };
  const [localAgentName, setLocalAgentName] = useState<string>(
    typeof window !== 'undefined' ? (localStorage.getItem('current_user_name') || sessionStorage.getItem('current_user_name') || '') : ''
  );

  const storedName = typeof window !== 'undefined' ? (localStorage.getItem('current_user_name') || sessionStorage.getItem('current_user_name')) : null;
  const storeNameFallback = useChatStore(state => state.tenantInfo?.users?.find(u => u.user_id === state.currentUser?.id)?.full_name);
  const agentName = localAgentName || storedName || storeNameFallback || 'Agente';
  const agentInitial = agentName ? agentName.substring(0, 1).toUpperCase() : 'A';
  
  const currentUserEmail = typeof window !== 'undefined' ? (localStorage.getItem('current_user_email') || sessionStorage.getItem('current_user_email')) : null;
  const currentUserRole = typeof window !== 'undefined' ? (localStorage.getItem('current_user_role') || sessionStorage.getItem('current_user_role') || 'agent') : 'agent';

  const activeChannelFilter = useChatStore(state => state.activeChannelFilter);
  const setActiveChannelFilter = useChatStore(state => state.setActiveChannelFilter);
  const connectedInstanceName = useChatStore(state => state.connectedInstanceName);
  const filterType = useChatStore(state => state.filterType);
  const setFilterType = useChatStore(state => state.setFilterType);
  const contacts = useChatStore(state => state.contacts);
  const agents = useChatStore(state => state.agents);
  const tenantLabels = useChatStore(state => state.tenantLabels);
  const instancesStatus = useChatStore(state => state.instancesStatus);
  const crmBoards = useChatStore(state => state.crmBoards) || [];
  
  const currentAgent = agents.find(a => a.email && a.email.toLowerCase() === currentUserEmail?.toLowerCase());
  const myConversationsCount = currentAgent ? contacts.filter(c => c.assigned_to?.split(',').includes(currentAgent.id) && !c.is_blocked && !(c.conv_status === 'snoozed' && c.snoozed_until && new Date(c.snoozed_until).getTime() > Date.now()) && c.conv_status !== 'closed' && c.conv_status !== 'resolved').length : 0;
  const unreadCountGlobal = contacts.filter(c => c.unread > 0 && !c.is_blocked && !(c.conv_status === 'snoozed' && c.snoozed_until && new Date(c.snoozed_until).getTime() > Date.now()) && c.conv_status !== 'closed' && c.conv_status !== 'resolved').length;
  
  const myTasksCount = React.useMemo(() => {
    if (!currentAgent) return 0;
    return contacts.filter(c => 
      c.messages && c.messages.some(m => 
        m.isTask && !m.taskCompleted && (m.assignedTo === currentAgent.id || m.assignedTo === currentAgent.user_id)
      )
    ).length;
  }, [contacts, currentAgent]);
  
  const [userCompanies, setUserCompanies] = useState<any[]>([]);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [currentCompanyContext, setCurrentCompanyContext] = useState<any>(null);
  const globalAiEnabled = useChatStore(state => state.globalAiEnabled);
  const setGlobalAiEnabled = useChatStore(state => state.setGlobalAiEnabled);
  const toggleGlobalAi = useChatStore(state => state.toggleGlobalAi);
  const [instanceContextMenu, setInstanceContextMenu] = useState<{ id: string, name: string, x: number, y: number } | null>(null);
  const [myConversationsMenu, setMyConversationsMenu] = useState<{ x: number, y: number } | null>(null);
  const [isAgentSettingsOpen, setIsAgentSettingsOpen] = useState(false);
  const [agentSettingsTab, setAgentSettingsTab] = useState<'profile' | 'notifications'>('profile');
  const [isChannelsCollapsed, setIsChannelsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chatboot_sidebar_channels_collapsed') === 'true';
    }
    return false;
  });

  const toggleChannelsCollapse = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newVal = !isChannelsCollapsed;
    setIsChannelsCollapsed(newVal);
    if (typeof window !== 'undefined') {
      localStorage.setItem('chatboot_sidebar_channels_collapsed', String(newVal));
    }
  };

  const tenantInfo = useChatStore(state => state.tenantInfo);
  const tenantIdFromStore = tenantInfo?.id;
  const tenantId = tenantIdFromStore || (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
  const currentUserId = (localStorage.getItem('current_user_id') || sessionStorage.getItem('current_user_id') || currentUserEmail || '') as string;
  const [notifPrefs, setNotifPrefs] = useState<Record<string, any>>(getLocalNotificationPrefs());
  const [instances, setInstances] = useState<any[]>([]);

  useEffect(() => {
    onClose?.();
  }, [location.pathname, onClose]);

  useEffect(() => {
    if (tenantId) {
      useChatStore.getState().fetchCrmBoards();
      if (currentUserId) {
        fetchUserInboxNotificationPreferences(tenantId, currentUserId).then(map => {
          setNotifPrefs(map);
        });
      }
    }
  }, [tenantId, currentUserId]);


  useEffect(() => {
    if (!tenantId) return;

    const getActiveStorage = () => {
      if (typeof window === 'undefined') return null;
      return sessionStorage.getItem('current_user_email') ? sessionStorage : localStorage;
    };

    const fetchAgentPermissionsAndData = async () => {
       const { data: { session } } = await supabase.auth.getSession();
       if (!session) {
         console.warn("[MainSidebar] No session found on mount. Redirecting to login...");
         localStorage.removeItem('current_tenant_id');
         sessionStorage.removeItem('current_tenant_id');
         useChatStore.getState().clearStore();
         await supabase.auth.signOut();
         window.location.href = '/';
         return;
       }

       const storage = getActiveStorage();
       const userRole = storage ? storage.getItem('current_user_role') : null;
       const userEmail = storage ? storage.getItem('current_user_email') : null;
       
       if (storage && session?.user?.id && !storage.getItem('current_user_id')) {
          storage.setItem('current_user_id', session.user.id);
       }

       if (userEmail && storage) {
           const { data: userData } = await supabase
             .from('tenant_users')
             .select('full_name, allowed_companies, allowed_instances')
             .ilike('email', userEmail)
             .maybeSingle();
             
           if (userData) {
              const isRonaldo = userEmail?.toLowerCase() === 'ronaldo.xpointsolucoes@gmail.com';
              if (!isRonaldo) {
                 storage.setItem('allowed_companies', JSON.stringify(userData.allowed_companies || []));
                 storage.setItem('allowed_instances', JSON.stringify(userData.allowed_instances || []));
              } else {
                 storage.removeItem('allowed_instances');
              }
              
              if (userData.full_name && userData.full_name !== storage.getItem('current_user_name')) {
                 storage.setItem('current_user_name', userData.full_name);
                 setLocalAgentName(userData.full_name);
              }
           }
       }
       
       await fetchInstances();
       await fetchCompanies();
    };

    const fetchInstances = async () => {
        try {
          const { data, error } = await supabase.from('whatsapp_instances')
            .select('id, display_name, status, color, phone_number')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });
            
          if (error) {
             console.error('Erro detalhado Supabase:', error);
             return;
          }
          if (data) {
             let finalData = data;
             const storage = getActiveStorage();
             const loggedEmail = storage ? storage.getItem('current_user_email') : null;
             const isRonaldo = loggedEmail?.toLowerCase() === 'ronaldo.xpointsolucoes@gmail.com';
             const allowedStr = storage ? storage.getItem('allowed_instances') : null;
              
             if (!isRonaldo) {
                finalData = finalData.filter(d => d.id !== '5c78d358-d449-41c4-b396-a04ab20a39e4' && !d.display_name?.toLowerCase().includes('ronaldo'));
             }
              
             if (!isRonaldo) {
                if (allowedStr) {
                    try {
                        const allowedInstances = JSON.parse(allowedStr);
                        if (Array.isArray(allowedInstances) && allowedInstances.length > 0) {
                            finalData = finalData.filter(d => allowedInstances.includes(d.id));
                        } else if (currentUserRole === 'agent' || currentUserRole === 'Agente') {
                            finalData = [];
                        }
                    } catch(e) {
                        if (currentUserRole === 'agent' || currentUserRole === 'Agente') finalData = [];
                    }
                } else if (currentUserRole === 'agent' || currentUserRole === 'Agente') {
                    finalData = [];
                }
             }

             setInstances(finalData);

             // Inicializa o status de cada instância no store para reatividade passando pelo debouncer
             const { setInstanceStatus } = useChatStore.getState();
             data.forEach(inst => {
                setInstanceStatus(inst.id, inst.status);
             });

             // Auto-seleciona a única caixa disponível
             const { activeChannelFilter, setActiveChannelFilter, fetchInitialData } = useChatStore.getState();
             if (!activeChannelFilter && finalData.length === 1) {
                 setActiveChannelFilter(finalData[0].id, finalData[0].display_name);
                 fetchInitialData();
             }
          }
        } catch (e) {
        console.error('Erro ao buscar canais:', e);
      }
    };

    const fetchCompanies = async () => {
      try {
        const { data: currentCompany, error: currentError } = await supabase
          .from('companies')
          .select('*')
          .eq('id', tenantId)
          .maybeSingle();
          
        if (currentError || !currentCompany) {
           console.error("[DEBUG] MainSidebar fetchCompanies falhou!", {
             tenantId,
             currentError,
             currentCompany
           });
           console.warn("Empresa não encontrada ou RLS bloqueou o acesso. Deslogando...");
           localStorage.removeItem('current_tenant_id');
           sessionStorage.removeItem('current_tenant_id');
           useChatStore.getState().clearStore();
           await supabase.auth.signOut();
           window.location.href = '/';
           return;
        }
        
        setCurrentCompanyContext(currentCompany);
        setGlobalAiEnabled(currentCompany.global_ai_enabled ?? true);

        const storage = getActiveStorage();
        const allowedCompsStr = storage ? storage.getItem('allowed_companies') : null;
        let allowedCompanies: string[] = [];
        if (allowedCompsStr) {
          try {
             allowedCompanies = JSON.parse(allowedCompsStr);
          } catch(e) {}
        }

        if (currentUserRole === 'agent' || currentUserRole === 'Agente') {
           if (allowedCompanies.length > 0 && !allowedCompanies.includes(tenantId)) {
               // Security enforcement: Se a matriz não é permitida ou ficou sujeira no localstorage
               const newTenantId = allowedCompanies[0];
               if (storage) storage.setItem('current_tenant_id', newTenantId);
               window.location.reload();
               return;
           }
        }

        let companiesData: any[] = [];
        
        if (currentUserRole === 'agent' || currentUserRole === 'Agente') {
           if (allowedCompanies.length > 0) {
               const { data, error } = await supabase
                 .from('companies')
                 .select('id, name, status, plan_id')
                 .in('id', allowedCompanies)
                 .order('created_at', { ascending: false });
               if (!error && data) companiesData = data;
           }
        } else if (currentCompany.email) {
           const { data, error } = await supabase
             .from('companies')
             .select('id, name, status, plan_id')
             .eq('email', currentCompany.email)
             .order('created_at', { ascending: false });
           if (!error && data) companiesData = data;
        }

        setUserCompanies(companiesData);

      } catch (err) {
        console.error('Erro ao buscar empresas multi-tenant:', err);
      }
    };

    fetchAgentPermissionsAndData();
    const sidebarChannelName = `sidebar_instances_realtime_${tenantId}`;
    const existingSidebarChannel = supabase.getChannels().find(c => c.topic === `realtime:${sidebarChannelName}`);
    if (existingSidebarChannel) {
      supabase.removeChannel(existingSidebarChannel);
    }

    const channel = supabase.channel(sidebarChannelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_instances', filter: `tenant_id=eq.${tenantId}` }, () => {
         fetchInstances();
      })
      .subscribe();

    const userPermissionsChannelName = `user_permissions_realtime_${tenantId}`;
    const existingPermsChannel = supabase.getChannels().find(c => c.topic === `realtime:${userPermissionsChannelName}`);
    if (existingPermsChannel) {
      supabase.removeChannel(existingPermsChannel);
    }

    const permsChannel = supabase.channel(userPermissionsChannelName)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tenant_users', filter: `tenant_id=eq.${tenantId}` }, (payload) => {
         const storage = getActiveStorage();
         const userEmail = storage ? storage.getItem('current_user_email') : null;
         
         if (userEmail && payload.new && payload.new.email && payload.new.email.toLowerCase() === userEmail.toLowerCase()) {
             const isRonaldo = userEmail.toLowerCase() === 'ronaldo.xpointsolucoes@gmail.com';
             if (isRonaldo) return;
             const newAllowedInstances = payload.new.allowed_instances || [];
             const newAllowedCompanies = payload.new.allowed_companies || [];
             
             // Compare with current values in storage
             const oldAllowedInstancesStr = storage.getItem('allowed_instances') || '[]';
             const oldAllowedCompaniesStr = storage.getItem('allowed_companies') || '[]';
             let oldAllowedInstances = [];
             let oldAllowedCompanies = [];
             try { oldAllowedInstances = JSON.parse(oldAllowedInstancesStr); } catch(e) {}
             try { oldAllowedCompanies = JSON.parse(oldAllowedCompaniesStr); } catch(e) {}
             
             const instancesChanged = JSON.stringify(newAllowedInstances.sort()) !== JSON.stringify(oldAllowedInstances.sort());
             const companiesChanged = JSON.stringify(newAllowedCompanies.sort()) !== JSON.stringify(oldAllowedCompanies.sort());
             
             if (instancesChanged || companiesChanged) {
                 storage.setItem('allowed_instances', JSON.stringify(newAllowedInstances));
                 storage.setItem('allowed_companies', JSON.stringify(newAllowedCompanies));
                 
                 // If currently selected channel filter is not allowed anymore, clear it
                 const activeFilter = localStorage.getItem('activeChannelFilter') || sessionStorage.getItem('activeChannelFilter');
                 if (activeFilter && newAllowedInstances.length > 0 && !newAllowedInstances.includes(activeFilter)) {
                     localStorage.removeItem('activeChannelFilter');
                     localStorage.removeItem('activeChannelName');
                     sessionStorage.removeItem('activeChannelFilter');
                     sessionStorage.removeItem('activeChannelName');
                 }
                 
                 // Force refresh to update CRM and sidebar UI in real-time
                 window.location.reload();
             }
         }
      })
      .subscribe();

    const companyChannel = supabase.channel(`public:companies:id=${tenantId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'companies', filter: `id=eq.${tenantId}` }, (payload) => {
          console.log("Realtime event for company received:", payload);
          if (payload.new && typeof payload.new.global_ai_enabled !== 'undefined') {
              setGlobalAiEnabled(payload.new.global_ai_enabled);
          }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(permsChannel);
      supabase.removeChannel(companyChannel);
    };
  }, [tenantId]);

  const handleSwitchWorkspace = (company: any) => {
    if (company.id === tenantId) return;
    
    // Clear tenant-specific channel filters when switching workspaces
    localStorage.removeItem('activeChannelFilter');
    localStorage.removeItem('activeChannelName');
    
    if (localStorage.getItem('current_tenant_id')) {
        localStorage.setItem('current_tenant_id', company.id);
        localStorage.setItem('current_tenant_name', company.name);
    } else {
        sessionStorage.setItem('current_tenant_id', company.id);
        sessionStorage.setItem('current_tenant_name', company.name);
    }
    
    window.location.reload();
  };

  const handleToggleGlobalAi = () => {
    toggleGlobalAi();
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim() || !currentCompanyContext) return;
    
    try {
      const { data, error } = await supabase
        .from('companies')
        .insert({
          name: newWorkspaceName.trim(),
          email: currentCompanyContext.email,
          password: currentCompanyContext.password,
          status: 'active',
          plan_id: currentCompanyContext.plan_id
        })
        .select()
        .single();
        
      if (!error && data) {
         handleSwitchWorkspace(data);
      } else {
         console.error('Error creating workspace:', error);
      }
    } catch(err) {
      console.error(err);
    }
  };

  return (
    <SidebarContext.Provider value={{ onClose }}>
      <div 
        className={cn(
          "h-full bg-[#f0f2f5] dark:bg-[#111b21] flex flex-col text-[#54656f] dark:text-[#d1d7db] font-sans text-sm border-r border-gray-250/85 dark:border-[#2a3942] z-50 shrink-0 shadow-lg relative transition-all duration-300 group/sidebar",
          isAppEmbedded ? "w-[68px] hover:w-[260px] is-minimized" : "w-[260px]"
        )}
      >
      
      {/* Workspace Header Premium */}
      <div 
        className={cn(
          "h-16 flex items-center px-4 border-b border-gray-250/60 dark:border-[#2a3942]/60 transition-colors group relative z-50",
          (userCompanies.length > 1 || currentUserRole === 'admin') ? "hover:bg-gray-200/50 dark:hover:bg-[#202c33] cursor-pointer" : ""
        )}
        onClick={() => {
          if (userCompanies.length > 1 || currentUserRole === 'admin') {
            setShowWorkspaceMenu(!showWorkspaceMenu);
          }
        }}
      >
        <img src="/pwa-192x192.png" alt="Logo" className="w-7 h-7 object-contain rounded-lg shadow-sm shrink-0" />
        <div className={cn("flex-1 min-w-0 ml-3 transition-all duration-200", "group-[.is-minimized]/sidebar:opacity-0 group-[.is-minimized]/sidebar:w-0 group-[.is-minimized]/sidebar:hidden group-hover/sidebar:!opacity-100 group-hover/sidebar:!w-auto group-hover/sidebar:!block")}>
          <h2 className="font-semibold text-[#111b21] dark:text-[#e9edef] truncate text-[15px] tracking-tight group-hover:text-emerald-600 dark:group-hover:text-white transition-colors">
            {tenantInfo?.name || currentCompanyContext?.name || 'Carregando...'}
          </h2>
        </div>
        {(userCompanies.length > 1 || currentUserRole === 'admin') && (
          <div className={cn("bg-gray-200/60 dark:bg-[#2a3942] group-hover:bg-gray-300 dark:group-hover:bg-[#3b4a54] p-1 rounded transition-colors", "group-[.is-minimized]/sidebar:hidden group-hover/sidebar:!block")}>
             <ChevronDown size={14} className="text-[#54656f] dark:text-[#8696a0] group-hover:text-emerald-600 dark:group-hover:text-white transition-colors" />
          </div>
        )}

        {/* Workspace Dropdown Panel */}
        {showWorkspaceMenu && (userCompanies.length > 1 || currentUserRole === 'admin') && (
          <div className="absolute top-[68px] left-2 w-[340px] bg-white dark:bg-[#1e1e24] border border-gray-200 dark:border-[#2a2a2f] rounded-xl shadow-2xl overflow-hidden z-[9999] animate-in fade-in slide-in-from-top-2 duration-200">
             
             <div className="max-h-[300px] overflow-y-auto styled-scrollbar py-2">
                {userCompanies.map((ws) => (
                  <div 
                    key={ws.id} 
                    onClick={() => handleSwitchWorkspace(ws)}
                    className={cn(
                      "flex items-center justify-between px-4 py-2 hover:bg-gray-100 dark:hover:bg-[#2a2a2f]/50 cursor-pointer transition-colors",
                      ws.id === tenantId ? "bg-indigo-500/10 dark:bg-indigo-500/20 border-l-2 border-indigo-500" : ""
                    )}
                  >
                     <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-5 h-5 rounded bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 flex items-center justify-center shrink-0 border border-indigo-500/30">
                          <span className="text-[10px] font-bold text-indigo-400">{ws.name.substring(0, 1).toUpperCase()}</span>
                        </div>
                        <span className={cn("text-sm truncate", ws.id === tenantId ? "text-gray-900 dark:text-white font-medium" : "text-gray-700 dark:text-slate-300")}>{ws.name}</span>
                     </div>
                     {ws.id === tenantId && (
                       <CheckCircle2 size={14} className="text-indigo-400 shrink-0 ml-2" />
                     )}
                  </div>
                ))}
             </div>
             <div className="p-2 border-t border-gray-200 dark:border-[#2a2a2f] bg-gray-50 dark:bg-[#18181b]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWorkspaceMenu(false);
                    navigate('/admin');
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-lg text-xs font-bold transition shadow-sm"
                >
                  <Plus size={14} />
                  <span>Cadastrar Nova Empresa (Painel Master)</span>
                </button>
             </div>
          </div>
        )}
      </div>

      <div className={cn("flex-1 overflow-y-auto w-full styled-scrollbar", reopenedTicketToast ? "pb-32" : "pb-20")}>
        


        {/* Switch Robo I.A Global */}
        <div className="px-3 pb-3">
           <div className={cn(
             "flex items-center bg-gray-200/50 dark:bg-[#202c33] rounded-lg border border-gray-250 dark:border-[#2a3942]/50 hover:border-[#00a884]/30 transition-all overflow-hidden",
             "px-3 py-2 justify-between",
             "group-[.is-minimized]/sidebar:justify-center group-[.is-minimized]/sidebar:px-0",
             "group-hover/sidebar:!justify-between group-hover/sidebar:!px-3"
           )}>
             <div className="flex items-center gap-2.5 shrink-0">
               <div className={cn("p-1.5 rounded-md transition-colors", globalAiEnabled ? "bg-[#00a884]/20" : "bg-gray-200 dark:bg-[#2a3942]")}>
                 <Bot size={14} className={globalAiEnabled ? "text-[#00a884]" : "text-[#8696a0]"} />
               </div>
               <span className={cn(
                 "text-[13px] font-medium text-[#54656f] dark:text-[#d1d7db] transition-all duration-200 whitespace-nowrap", 
                 "group-[.is-minimized]/sidebar:opacity-0 group-[.is-minimized]/sidebar:w-0",
                 "group-hover/sidebar:!opacity-100 group-hover/sidebar:!w-auto"
               )}>Robô I.A</span>
             </div>
             <label className={cn(
               "relative inline-flex items-center cursor-pointer transition-all duration-200 shrink-0", 
               "group-[.is-minimized]/sidebar:opacity-0 group-[.is-minimized]/sidebar:w-0 group-[.is-minimized]/sidebar:overflow-hidden group-[.is-minimized]/sidebar:pointer-events-none",
               "group-hover/sidebar:!opacity-100 group-hover/sidebar:!w-[32px] group-hover/sidebar:!pointer-events-auto"
             )}>
               <input 
                 type="checkbox" 
                 className="sr-only peer" 
                 checked={globalAiEnabled} 
                 onChange={handleToggleGlobalAi}
               />
               <div className="w-8 h-4 bg-[#3b4a54] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] peer-checked:after:bg-white after:border-transparent after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#00a884]"></div>
             </label>
           </div>
        </div>

        {/* Global Nav */}
        <div className="px-2 space-y-0.5">

          <CollapsibleSection title="Conversas" icon={<MessageCircle size={16} />} isOpen={expandedSections.conversations} onToggle={() => toggleSection('conversations')}>
            <div
              onContextMenu={(e) => {
                e.preventDefault();
                setMyConversationsMenu({ x: e.clientX, y: e.clientY });
              }}
              className="relative w-full"
            >
              <NavItem 
                title={
                  <div className="flex items-center gap-2">
                    Minhas conversas
                    {myConversationsCount > 0 && (
                      <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                        {myConversationsCount}
                      </span>
                    )}
                  </div>
                } 
                icon={<User size={16} className={filterType === 'mine' ? "text-indigo-400" : ""} />} 
                isActive={filterType === 'mine'} 
                onClick={() => {
                  if (activeChannelFilter === null && filterType === 'mine' && window.location.pathname === '/chat') return;
                  setActiveChannelFilter(null, null);
                  setFilterType('mine');
                  navigate('/chat');
                }} 
              />
            </div>
            <NavItem 
              title={
                <div className="flex items-center gap-2">
                  Minhas Tarefas
                  {myTasksCount > 0 && (
                    <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center animate-pulse">
                      {myTasksCount}
                    </span>
                  )}
                </div>
              } 
              icon={<CheckSquare size={16} className={filterType === 'tasks' ? "text-amber-400" : ""} />} 
              isActive={filterType === 'tasks'} 
              onClick={() => {
                if (activeChannelFilter === null && filterType === 'tasks' && window.location.pathname === '/chat') return;
                setActiveChannelFilter(null, null);
                setFilterType('tasks');
                navigate('/chat');
              }} 
            />
            {instances.length !== 1 && (
              <div className="relative flex-1">
                <NavItem 
                  title="Todas as conversas" 
                  isActive={filterType !== 'mine' && filterType !== 'blocked'} 
                  onClick={() => {
                    if (activeChannelFilter === null && filterType === 'all' && window.location.pathname === '/chat') return;
                    setActiveChannelFilter(null, null);
                    setFilterType('all');
                    if (window.location.pathname !== '/chat') {
                      navigate('/chat');
                    }
                  }} 
                  alwaysShowAction={true}
                  actionNode={
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleChannelsCollapse();
                      }}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#2a3942] text-[#8696a0] hover:text-white transition-all flex items-center justify-center"
                      title={isChannelsCollapsed ? "Expandir caixas" : "Recolher caixas"}
                    >
                      {isChannelsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                  }
                />
              </div>
            )}
            
            {/* Lista de Canais (Inboxes) inserida abaixo de Todas as conversas */}
            {instances.length > 0 && !isChannelsCollapsed && (
               <div className="pl-1 border-l-2 border-[#2a3942]/50 ml-5 my-1 py-0.5 space-y-0.5">
                 {instances.map(inst => {
                    const unreadCount = contacts.filter(c => c.instance_id === inst.id && c.unread > 0 && !c.is_blocked && !(c.conv_status === 'snoozed' && c.snoozed_until && new Date(c.snoozed_until).getTime() > Date.now()) && c.conv_status !== 'closed' && c.conv_status !== 'resolved').length;
                    const status = instancesStatus[inst.id] ?? inst.status ?? 'connected';
                    const isConnected = status === 'connected' || status === 'connected_local';
                    const isConnecting = status === 'connecting';
                    return (
                      <div 
                        key={inst.id} 
                        className="relative group/channel"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setInstanceContextMenu({ id: inst.id, name: inst.display_name, x: e.clientX, y: e.clientY });
                        }}
                      >
                        <NavItem 
                          icon={
                            <div className="flex items-center gap-2 relative">
                              {inst.color && (
                                <div 
                                  className={cn(
                                    "w-1.5 h-1.5 rounded-full transition-all duration-300",
                                    isConnected ? "" : isConnecting ? "bg-yellow-500 animate-pulse" : "bg-gray-400 dark:bg-gray-600"
                                  )}
                                  style={isConnected ? { 
                                    backgroundColor: inst.color,
                                    boxShadow: `0 0 6px ${inst.color}`
                                  } : undefined}
                                />
                              )}
                              <Brands.WhatsApp 
                                size={12} 
                                className={isConnected ? "text-[#25D366] drop-shadow-[0_0_2px_rgba(37,211,102,0.3)]" : isConnecting ? "text-yellow-500 animate-pulse" : "text-gray-400 dark:text-gray-600"} 
                              />
                            </div>
                          } 
                          title={
                            <div className="flex flex-col min-w-0 py-0.5 leading-normal">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={cn(
                                  "truncate transition-colors font-medium text-[13px] leading-tight", 
                                  !isConnected && !isConnecting ? "text-gray-400 dark:text-gray-600" : isConnecting ? "text-yellow-600 dark:text-yellow-500/80" : "text-gray-800 dark:text-[#e9edef]"
                                )}>
                                  {inst.display_name || 'Sem nome'}
                                </span>
                                {!isConnected && !isConnecting && (
                                  <span className="text-[9px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-500/10 border border-gray-500/15 px-1 py-0.5 rounded tracking-wide shrink-0">
                                    offline
                                  </span>
                                )}
                                {isConnecting && (
                                  <span className="text-[9px] font-semibold text-yellow-600 dark:text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-1 py-0.5 rounded tracking-wide shrink-0 animate-pulse">
                                    conectando
                                  </span>
                                )}
                              </div>
                              {inst.phone_number && (
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 tracking-tight font-mono truncate select-all">
                                  {formatPhoneNumber(inst.phone_number)}
                                </span>
                              )}
                            </div>
                          }
                          isActive={activeChannelFilter === inst.id || activeChannelFilter === inst.display_name}
                          className={cn(!isConnected && !isConnecting ? "opacity-60 hover:opacity-100 hover:bg-gray-200/30 dark:hover:bg-[#202c33]/40" : isConnecting ? "opacity-90 hover:opacity-100 hover:bg-yellow-500/5" : "")}
                          onClick={() => {
                             const state = useChatStore.getState();
                             if (state.activeChannelFilter === inst.id && state.filterType === 'all' && window.location.pathname === '/chat') {
                               return;
                             }
                             state.setActiveChannelFilter(inst.id, inst.display_name);
                             state.setFilterType('all');
                             if (window.location.pathname !== '/chat') {
                               navigate('/chat');
                             }
                           }}
                        />
                        {(unreadCount > 0 || notifPrefs[inst.id]?.is_enabled === false) && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none animate-in zoom-in duration-300">
                            {notifPrefs[inst.id]?.is_enabled === false && (
                              <span className="text-red-400 bg-red-500/10 border border-red-500/20 p-0.5 rounded" title="Notificações desta caixa silenciadas">
                                <BellOff size={11} />
                              </span>
                            )}
                            {unreadCount > 0 && (
                              <span 
                                className="text-white text-[9px] font-bold min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full shadow-sm border border-white/20"
                                style={{ 
                                  background: inst.color ? `linear-gradient(135deg, ${inst.color}ee 0%, ${inst.color} 100%)` : 'linear-gradient(135deg, #00a884ee 0%, #00a884 100%)',
                                  textShadow: '0 1px 2px rgba(0,0,0,0.4)'
                                }}
                              >
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                 })}
               </div>
            )}

            <NavItem 
              title={
                <div className="flex items-center gap-2">
                  Não atendidas
                  {unreadCountGlobal > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {unreadCountGlobal}
                    </span>
                  )}
                </div>
              } 
              icon={<MessageCircle size={16} className={filterType === 'unread' ? "text-red-400" : ""} />} 
              isActive={filterType === 'unread'} 
              onClick={() => {
                setActiveChannelFilter(null, null);
                setFilterType('unread');
                navigate('/chat');
              }} 
            />
            <NavItem icon={<Contact size={16} />} title="Contatos" onClick={() => navigate('/contacts')} />
          <CollapsibleSection 
            title="CRM" 
            icon={<ClipboardList size={16} className="text-amber-500" />} 
            isOpen={expandedSections.crm} 
            onToggle={() => toggleSection('crm')}
          >
            <NavItem 
              icon={<LayoutDashboard size={16} className="text-amber-500" />} 
              title="Painel Estratégico" 
              isSub
              onClick={() => navigate('/crm')}
              isActive={window.location.pathname === '/crm'} 
            />
             {crmBoards.map(board => (
              <NavItem 
                key={board.id}
                icon={<Target size={16} className="text-indigo-400" />} 
                title={board.name} 
                isSub
                onClick={() => navigate(`/crm/kanban/${board.id}`)}
                isActive={window.location.pathname === `/crm/kanban/${board.id}`} 
              />
            ))}
            <NavItem 
              icon={<Plus size={16} className="text-amber-500" />} 
              title="➕ Criar Novo Quadro" 
              isSub
              onClick={() => setIsBoardCreatorOpen(true)}
            />
          </CollapsibleSection>

            <NavItem 
              title="Agenda Interna" 
              icon={<CalendarDays size={16} />} 
              onClick={() => navigate('/apps/agenda')}
              isActive={window.location.pathname === '/apps/agenda'}
            />
          </CollapsibleSection>

          <CollapsibleSection 
            title="Checklists Operacionais" 
            icon={<ClipboardList size={16} className="text-indigo-400" />} 
            isOpen={expandedSections.checklists} 
            onToggle={() => toggleSection('checklists')}
          >
            <NavItem 
              icon={<LayoutDashboard size={16} className="text-indigo-400" />} 
              title="Dashboard Geral" 
              isSub
              onClick={() => navigate('/checklist/dashboard')}
              isActive={window.location.pathname === '/checklist/dashboard'}
            />
            <NavItem 
              icon={<ScrollText size={16} className="text-indigo-400" />} 
              title="Modelos & Rotinas" 
              isSub
              onClick={() => navigate('/checklist/builder')}
              isActive={window.location.pathname === '/checklist/builder'}
            />
            <NavItem 
               icon={<Smartphone size={16} className="text-indigo-400" />} 
               title="Totem Cozinha (PWA)" 
               isSub
               onClick={() => window.open('/checklist/tablet', '_blank')}
               isActive={false}
             />
            <NavItem 
              icon={<Settings size={16} className="text-indigo-400" />} 
              title="Configurações" 
              isSub
              onClick={() => navigate('/checklist/settings')}
              isActive={window.location.pathname === '/checklist/settings'}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Apps" icon={<Puzzle size={16} />} isOpen={expandedSections.apps} onToggle={() => toggleSection('apps')}>
            <NavItem 
              title="Portal / Cadastros" 
              isSub 
              onClick={() => window.open('https://portalgastrofood.vercel.app', '_blank', 'noopener,noreferrer')}
              isActive={false}
            />
            
            <NavItem 
              title="Gestor Delivery" 
              isSub 
              onClick={() => window.open('https://portalappmotoboy.vercel.app', '_blank', 'noopener,noreferrer')}
              isActive={false}
            />
            <NavItem 
              title="KDS" 
              isSub 
              onClick={() => navigate('/apps/kds')}
              isActive={window.location.pathname === '/apps/kds'}
            />
            <NavItem 
              title="Cardápio Digital" 
              isSub 
              onClick={() => navigate('/apps/cardapio')}
              isActive={window.location.pathname === '/apps/cardapio'}
            />
            <NavItem 
              title="Financeiro" 
              isSub 
              onClick={() => navigate('/apps/financeiro')}
              isActive={window.location.pathname === '/apps/financeiro'}
            />
            <NavItem title="App Motoboy" isSub />
            <NavItem title="Integrações" isSub />
            <NavItem title="Painel de Senha" isSub />
            <NavItem title="Totem App" isSub />
            <NavItem title="App Fidelidade" isSub />
            <NavItem title="NF-e" isSub />
            <NavItem title="Painel Fiscal" isSub />
            <NavItem title="App Etiquetas" isSub />
            <NavItem title="Treinamento ERP" isSub />
            
          </CollapsibleSection>

          <CollapsibleSection title="Etiquetas" icon={<Tag size={16} />} isOpen={expandedSections.labels} onToggle={() => toggleSection('labels')}>
            {tenantLabels && tenantLabels.length > 0 ? tenantLabels.map((label: any) => (
                <NavItem 
                  key={label.id || label.name}
                  icon={<LabelDot color={label.color} />} 
                  title={label.name} 
                  isSub 
                  actionNode={
                     <button 
                       onClick={(e) => { e.stopPropagation(); navigate('/settings/labels'); }}
                       className="p-1.5 hover:bg-white/10 dark:hover:bg-white/10 rounded-md text-[#8696a0] hover:text-[#00a884] transition-colors"
                       title="Editar Etiqueta"
                     >
                       <Edit2 size={13} />
                     </button>
                  }
                />
            )) : (
               <div className="px-5 py-2 text-[11px] text-[#8696a0]/60 italic">Nenhuma etiqueta</div>
            )}
            
            <div className="mt-1 pt-1.5 mx-3 border-t border-gray-250/60 dark:border-[#2a3942]/60 flex gap-1">
               <button 
                  onClick={() => navigate('/settings/labels')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#202c33] hover:bg-[#2a3942] rounded-md text-[11px] text-[#8696a0] hover:text-white transition-colors"
                  title="Gerenciar Etiquetas"
               >
                 <Settings size={12} />
                 <span>Gerenciar</span>
               </button>
               <button 
                  onClick={() => navigate('/settings/labels?new=true')}
                  className="flex items-center justify-center py-1.5 px-3 bg-[#00a884]/10 hover:bg-[#00a884]/20 border border-[#00a884]/20 hover:border-[#00a884]/40 rounded-md text-[#00a884] transition-colors"
                  title="Adicionar Nova Etiqueta"
               >
                 <Plus size={12} />
               </button>
             </div>
          </CollapsibleSection>

          <div className="mt-2">
            <NavItem 
              icon={<MessageSquareReply size={16} />} 
              title="Respostas Prontas" 
              onClick={() => navigate('/settings/canned-responses')} 
              isActive={window.location.pathname === '/settings/canned-responses'}
            />
          </div>
        </div>

        <div className="h-px bg-gray-250/60 dark:bg-[#2a3942]/60 mx-4 my-3" />

        <div className="px-2 space-y-0.5 pb-4">
          <NavItem icon={<MessageCircle size={16} />} title="Chat Interno" />
          <NavItem icon={<BarChart3 size={16} />} title="Relatórios" />
          <NavItem icon={<Megaphone size={16} />} title="Campanhas" />
          <NavItem 
            icon={<BookOpen size={16} />} 
            title="Central de Ajuda" 
            onClick={() => navigate('/help')}
            isActive={window.location.pathname === '/help'}
          />
          
          {currentUserRole === 'admin' && (
            <div className="pt-2 mt-2 border-t border-gray-250/60 dark:border-[#2a3942]/60">
              <CollapsibleSection 
                title="Configurações" 
                icon={<Settings size={16} />}
                isOpen={expandedSections.settings} 
                onToggle={() => toggleSection('settings')}
              >
                <NavItem icon={<Bell size={16} />} title="Notificações Pessoais" isSub onClick={() => { setAgentSettingsTab('notifications'); setIsAgentSettingsOpen(true); }} />
                <NavItem icon={<User size={16} />} title="Meu Perfil" isSub onClick={() => { setAgentSettingsTab('profile'); setIsAgentSettingsOpen(true); }} />
                <NavItem icon={<Briefcase size={16} />} title="Conta" isSub onClick={() => navigate('/settings/account')} />
                <NavItem icon={<Building2 size={16} />} title="Empresas (Painel Master)" isSub onClick={() => navigate('/admin')} />
                <NavItem icon={<UserSquare2 size={16} />} title="Usuários" isSub onClick={() => navigate('/settings/agents')} />
                <NavItem icon={<Inbox size={16} />} title="Caixas de Entrada" isSub onClick={() => navigate('/settings/inboxes')} />
                <NavItem icon={<Tag size={16} />} title="Etiquetas" isSub onClick={() => navigate('/settings/labels')} />
                <NavItem icon={<History size={16} />} title="Log de Operações" isSub onClick={() => navigate('/settings/logs')} />
                <NavItem icon={<Repeat size={16} />} title="Automação" isSub onClick={() => navigate('/settings/automation')} />
                <NavItem icon={<Bot size={16} />} title="Robôs" isSub onClick={() => navigate('/settings/bots')} isActive={window.location.pathname === '/settings/bots'} />
                <NavItem icon={<ScrollText size={16} />} title="Base de Conhecimento" isSub onClick={() => navigate('/knowledge')} isActive={window.location.pathname === '/knowledge'} />
                <NavItem icon={<Puzzle size={16} />} title="Integrações" isSub onClick={() => navigate('/settings/integrations')} />
              </CollapsibleSection>
            </div>
          )}
        </div>
      </div>

      {/* Toast Integrado de Reabertura de Ticket */}
      {reopenedTicketToast && (
        <div 
          className={cn(
            "absolute bottom-[66px] left-3 right-3 bg-[#202c33] dark:bg-[#111b21] border border-emerald-500/20 dark:border-emerald-500/30 rounded-2xl p-3 shadow-lg z-40 transition-all duration-300 animate-in slide-in-from-bottom-2 duration-300",
            "group-[.is-minimized]/sidebar:opacity-0 group-[.is-minimized]/sidebar:pointer-events-none group-hover/sidebar:!opacity-100 group-hover/sidebar:!pointer-events-auto"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="p-2 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-xl text-emerald-500 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                <MessageCircle size={15} className="animate-pulse" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-gray-200 dark:text-white truncate">
                  {reopenedTicketToast.reason === 'snooze' ? 'Adiantamento Expirado' : 'Ticket Reaberto'}
                </span>
                <span className="text-[10px] text-[#8696a0] leading-tight truncate">
                  {reopenedTicketToast.reason === 'snooze' ? (
                    <>Cliente <b>{reopenedTicketToast.contactName}</b> voltou</>
                  ) : (
                    <>Cliente <b>{reopenedTicketToast.contactName}</b> enviou msg</>
                  )}
                </span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setReopenedTicketToast(null);
              }}
              className="p-1 hover:bg-[#2a3942] rounded-full text-[#8696a0] hover:text-white transition-colors shrink-0"
              title="Fechar"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* User Footer Profile */}
      <div 
        onClick={() => {
          setAgentSettingsTab('profile');
          setIsAgentSettingsOpen(true);
        }}
        className="absolute bottom-0 w-full h-[60px] bg-[#e9edef] dark:bg-[#202c33] border-t border-gray-250/80 dark:border-[#2a3942] flex items-center px-4 cursor-pointer hover:bg-gray-200 dark:hover:bg-[#2a3942] transition-colors group"
      >
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#00a884] to-teal-500 p-[1px] shadow-sm">
            <div className="w-full h-full bg-white dark:bg-[#111b21] rounded-full flex items-center justify-center overflow-hidden">
              <span className="text-gray-700 dark:text-[#e9edef] font-semibold text-xs tracking-tight">{agentInitial}</span>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#e9edef] dark:border-[#202c33] rounded-full group-hover:border-gray-200 dark:group-hover:border-[#2a3942] transition-colors" />
        </div>
        <div className={cn("ml-3 flex-1 min-w-0 transition-opacity duration-200", "group-[.is-minimized]/sidebar:opacity-0 group-hover/sidebar:!opacity-100")}>
          <span 
            className="text-[10px] font-mono text-[#00a884] opacity-90 block truncate leading-tight mb-0.5 select-none" 
            title={(() => {
              const version = import.meta.env.PACKAGE_VERSION || '5.2.4';
              const rawDate = import.meta.env.PACKAGE_BUILD_DATE || import.meta.env.VITE_PACKAGE_BUILD_DATE;
              if (!rawDate) return `v${version}`;
              const d = new Date(rawDate);
              if (isNaN(d.getTime())) return `v${version}`;
              const day = String(d.getDate()).padStart(2, '0');
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const hours = String(d.getHours()).padStart(2, '0');
              const mins = String(d.getMinutes()).padStart(2, '0');
              return `v${version} | ${day}/${month} ${hours}:${mins}`;
            })()}
          >
            {(() => {
              const version = import.meta.env.PACKAGE_VERSION || '5.2.4';
              const rawDate = import.meta.env.PACKAGE_BUILD_DATE || import.meta.env.VITE_PACKAGE_BUILD_DATE;
              if (!rawDate) return `v${version}`;
              const d = new Date(rawDate);
              if (isNaN(d.getTime())) return `v${version}`;
              const day = String(d.getDate()).padStart(2, '0');
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const hours = String(d.getHours()).padStart(2, '0');
              const mins = String(d.getMinutes()).padStart(2, '0');
              return `v${version} | ${day}/${month} ${hours}:${mins}`;
            })()}
          </span>
          <p className="text-[14px] font-medium text-[#111b21] dark:text-[#e9edef] truncate">{agentName}</p>
          <p className="text-[11px] text-[#54656f] dark:text-[#8696a0] truncate opacity-80">{currentUserEmail || ''}</p>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            handleLogout();
          }}
          className={cn("ml-2 p-2 rounded-md text-[#54656f] dark:text-[#8696a0] hover:text-[#f15c6d] hover:bg-gray-200 dark:hover:bg-[#2a3942] transition-all opacity-0 group-hover/sidebar:opacity-100 focus:opacity-100", "group-[.is-minimized]/sidebar:opacity-0 group-[.is-minimized]/sidebar:pointer-events-none group-hover/sidebar:!opacity-100 group-hover/sidebar:!pointer-events-auto")}
          title="Sair da conta"
        >
          <LogOut size={16} />
        </button>
      </div>

      {/* Context Menu das Caixas de Entrada */}
      {instanceContextMenu && createPortal(
        <div 
          className="fixed inset-0 z-[99999]" 
          onClick={(e) => { e.stopPropagation(); setInstanceContextMenu(null); }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setInstanceContextMenu(null); }}
        >
          <div 
            className="absolute bg-[#202c33] border border-[#2a3942] rounded-lg shadow-xl py-1 min-w-[180px] z-[100000] animate-in fade-in zoom-in-95 duration-100"
            style={{ 
              top: Math.min(instanceContextMenu.y, window.innerHeight - 100), 
              left: Math.min(instanceContextMenu.x, window.innerWidth - 180)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-[#2a3942] mb-1">
              <span className="text-xs font-semibold text-[#8696a0] truncate block">{instanceContextMenu.name}</span>
            </div>
            <button 
              className="w-full text-left px-4 py-2 text-sm text-[#d1d7db] hover:bg-[#2a3942] transition-colors flex items-center gap-2"
              onClick={async (e) => {
                 e.stopPropagation();
                 const instId = instanceContextMenu.id;
                 const isEnabled = notifPrefs[instId]?.is_enabled !== false;
                 const updated = await toggleInboxNotification(tenantId, currentUserId, instId, !isEnabled);
                 setNotifPrefs(prev => ({ ...prev, [instId]: updated }));
                 setInstanceContextMenu(null);
              }}
            >
              {notifPrefs[instanceContextMenu.id]?.is_enabled !== false ? (
                <>
                  <BellOff size={14} className="text-red-400" />
                  <span>Silenciar Notificações</span>
                </>
              ) : (
                <>
                  <Bell size={14} className="text-emerald-400" />
                  <span>Ativar Notificações</span>
                </>
              )}
            </button>
            <button 
              className="w-full text-left px-4 py-2 text-sm text-[#d1d7db] hover:bg-[#2a3942] transition-colors flex items-center gap-2"
              onClick={(e) => {
                 e.stopPropagation();
                 navigate(`/settings/inboxes/${instanceContextMenu.id}?tab=notifications`);
                 setInstanceContextMenu(null);
              }}
            >
              <Settings size={14} />
              Configurar Notificações
            </button>
            <button 
              className="w-full text-left px-4 py-2 text-sm text-[#d1d7db] hover:bg-[#2a3942] transition-colors flex items-center gap-2 border-t border-[#2a3942] mt-1 pt-2"
              onClick={(e) => {
                 e.stopPropagation();
                 navigate(`/settings/inboxes/${instanceContextMenu.id}?tab=config`);
                 setInstanceContextMenu(null);
              }}
            >
              <QrCode size={14} />
              Gerenciar Conexão
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Menu suspenso (Context Menu) para Minhas Conversas */}
      {myConversationsMenu && createPortal(
        <div 
          className="fixed inset-0 z-[99999]" 
          onClick={(e) => { e.stopPropagation(); setMyConversationsMenu(null); }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMyConversationsMenu(null); }}
        >
          <div 
            className="absolute bg-[#202c33] border border-[#2a3942] rounded-lg shadow-xl py-1 min-w-[200px] z-[100000] animate-in fade-in zoom-in-95 duration-100"
            style={{ 
              top: Math.min(myConversationsMenu.y, window.innerHeight - 100), 
              left: Math.min(myConversationsMenu.x, window.innerWidth - 200)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-[#2a3942] mb-1">
              <span className="text-xs font-semibold text-[#8696a0] truncate block">Minhas Conversas</span>
            </div>
            <button 
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-[#2a3942] hover:text-red-500 transition-colors flex items-center gap-2"
              onClick={async (e) => {
                 e.stopPropagation();
                 setMyConversationsMenu(null);
                 
                 const confirmed = window.confirm("Tem certeza que deseja marcar TODAS as suas conversas atribuídas como resolvidas?");
                 if (confirmed) {
                    try {
                       const res = await useChatStore.getState().resolveAllConversations(true);
                       alert(`${res?.count || 0} conversas foram resolvidas com sucesso.`);
                    } catch (err) {
                       console.error("Erro ao resolver conversas:", err);
                    }
                 }
              }}
            >
              <CheckCircle2 size={14} />
              Fechar Todas as Conversas
            </button>
          </div>
        </div>,
        document.body
      )}

{/* 
      // Tailwind custom utility pra rolagem discreta que usaremos globalmente em index.css futuramente.
*/}
      <style>{`
        .styled-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .styled-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .styled-scrollbar::-webkit-scrollbar-thumb {
          background: ${theme === 'dark' ? '#2a3942' : '#cbd5e1'};
          border-radius: 4px;
        }
        .styled-scrollbar:hover::-webkit-scrollbar-thumb {
          background: ${theme === 'dark' ? '#3b4a54' : '#94a3b8'};
        }
      `}</style>
      <KanbanBoardCreator 
        isOpen={isBoardCreatorOpen} 
        onClose={() => setIsBoardCreatorOpen(false)} 
        onCreated={() => {
          setIsBoardCreatorOpen(false);
          useChatStore.getState().fetchCrmBoards();
        }}
      />
      <AgentSettingsModal
        isOpen={isAgentSettingsOpen}
        onClose={() => setIsAgentSettingsOpen(false)}
        defaultTab={agentSettingsTab}
      />
      </div>
    </SidebarContext.Provider>
  );
}


// --- AUX COMPONENTS ---

function NavItem({ 
  icon, 
  title, 
  badge, 
  isActive = false, 
  isSub = false, 
  actionNode,
  alwaysShowAction = false,
  className,
  onClick 
}: { 
  icon?: React.ReactNode, 
  title: React.ReactNode, 
  badge?: string, 
  isActive?: boolean, 
  isSub?: boolean,
  actionNode?: React.ReactNode,
  alwaysShowAction?: boolean,
  className?: string,
  onClick?: () => void
}) {
  const { onClose } = React.useContext(SidebarContext);

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      onClick();
    }
    onClose?.();
  };

  return (
    <div 
      onClick={handleClick}
      className={cn(
        "flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer transition-colors group relative",
        isActive ? "bg-gray-200 dark:bg-[#202c33]" : "hover:bg-gray-200/50 dark:hover:bg-[#202c33]/60",
        isSub ? "ml-4 pl-3 border-l border-gray-200 dark:border-[#2a3942] hover:border-gray-400 dark:hover:border-[#8696a0]" : "",
        isActive && isSub ? "border-[#00a884] bg-gray-200 dark:bg-[#202c33]" : "",
        className
      )}
    >
      <div className="flex items-center min-w-0 gap-3 flex-1">
        {icon && <span className={cn("shrink-0", isActive ? "text-[#111b21] dark:text-[#e9edef]" : "text-[#54656f] dark:text-[#8696a0] group-hover:text-[#111b21] dark:group-hover:text-[#d1d7db]")}>{icon}</span>}
        {!icon && isSub && (
          <div className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0 transition-colors",
            isActive ? "bg-[#00a884]" : "bg-gray-300 dark:bg-[#2a3942] group-hover:bg-gray-400 dark:group-hover:bg-[#8696a0]"
          )} />
        )}
        <span className={cn(
          "tracking-tight flex-1 transition-all duration-200", 
          typeof title === 'string' && "truncate",
          isActive ? "text-[#111b21] dark:text-[#e9edef] font-semibold" : "text-[#54656f] dark:text-[#aebac1] group-hover:text-[#111b21] dark:group-hover:text-[#d1d7db]",
          isSub && !icon ? "text-[13px]" : "text-[14px]",
          "group-[.is-minimized]/sidebar:opacity-0 group-[.is-minimized]/sidebar:w-0 group-hover/sidebar:!opacity-100 group-hover/sidebar:!w-auto"
        )}>
          {title}
        </span>
      </div>
      
      <div className={cn(
        "flex items-center gap-1.5 shrink-0 ml-2 transition-all duration-200", 
        "group-[.is-minimized]/sidebar:opacity-0 group-[.is-minimized]/sidebar:w-0 group-[.is-minimized]/sidebar:pointer-events-none group-[.is-minimized]/sidebar:overflow-hidden",
        "group-hover/sidebar:!opacity-100 group-hover/sidebar:!w-auto group-hover/sidebar:!pointer-events-auto"
      )}>
         {actionNode && (
            <div className={cn(alwaysShowAction ? "opacity-100" : "opacity-0 group-hover:opacity-100 transition-opacity")}>
               {actionNode}
            </div>
         )}
         {badge && (
           <span className="bg-gray-200 dark:bg-[#2a3942] text-gray-700 dark:text-[#d1d7db] text-[10px] px-1.5 py-0.5 rounded-full font-mono">
             {badge}
           </span>
         )}
      </div>
      
      {/* Indicador de ativo (famoso trancinho no canto no chatwoot original) */}
      {isActive && !isSub && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/5 bg-[#00a884] rounded-r-full shadow-[0_0_8px_rgba(0,168,132,0.6)]" />
      )}
    </div>
  );
}

function CollapsibleSection({ 
  title, 
  icon, 
  isOpen, 
  onToggle, 
  children 
}: { 
  title: string, 
  icon?: React.ReactNode, 
  isOpen: boolean, 
  onToggle: () => void, 
  children: React.ReactNode 
}) {
  return (
    <div className="mb-0.5">
      <div 
        onClick={onToggle}
        className="flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer hover:bg-gray-200/50 dark:hover:bg-[#202c33]/60 transition-colors group"
      >
        <div className="flex items-center gap-3">
          {icon && <span className="text-[#54656f] dark:text-[#8696a0] group-hover:text-[#111b21] dark:group-hover:text-[#d1d7db] transition-colors">{icon}</span>}
          <span className={cn("text-[14px] text-[#54656f] dark:text-[#aebac1] group-hover:text-[#111b21] dark:group-hover:text-[#d1d7db] tracking-tight transition-all duration-200", "group-[.is-minimized]/sidebar:opacity-0 group-[.is-minimized]/sidebar:w-0 group-[.is-minimized]/sidebar:hidden group-hover/sidebar:!opacity-100 group-hover/sidebar:!w-auto group-hover/sidebar:!inline")}>{title}</span>
        </div>
        <div className={cn("text-[#54656f] dark:text-[#8696a0]", "group-[.is-minimized]/sidebar:hidden group-hover/sidebar:!block")}>
          {isOpen ? <ChevronDown size={14} className="opacity-70 group-hover:opacity-100 transition-all" /> : <ChevronRight size={14} className="opacity-70 group-hover:opacity-100 transition-all" />}
        </div>
      </div>
      <div className={cn(
        "grid transition-all duration-200 ease-in-out",
        isOpen ? "grid-rows-[1fr] opacity-100 mt-1" : "grid-rows-[0fr] opacity-0"
      )}>
        <div className="overflow-hidden space-y-0.5">
          {children}
        </div>
      </div>
    </div>
  );
}

// Icone mock do WhatsApp (visto que lucide não tem oficial, mas a gnt tenta contornar)
const Brands = {
  WhatsApp: ({size}: {size:number}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  )
}

function LabelDot({ color }: { color: string }) {
  const isHex = color?.startsWith('#');
  return <div className={cn("w-2 h-2 rounded-full shadow-sm", !isHex && color)} style={isHex ? { backgroundColor: color } : undefined} />;
}
