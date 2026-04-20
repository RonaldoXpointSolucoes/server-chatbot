import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Inbox, 
  MessageCircle, 
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
  Mails,
  Bot,
  ScrollText,
  MessageSquareReply,
  Workflow,
  Zap,
  UserSquare2,
  Code2,
  Repeat,
  CalendarDays,
  Puzzle,
  Smartphone,
  Edit2,
  Plus,
  CheckCircle2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useChatStore } from '../store/chatStore';
import { supabase } from '../services/supabase';

export function MainSidebar() {
  const navigate = useNavigate();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    conversations: true,
    teams: true,
    channels: true,
    labels: false,
    settings: false
  });
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const agentName = useChatStore(state => state.tenantInfo?.users?.find(u => u.user_id === state.currentUser?.id)?.full_name || 'Agente');
  const agentInitial = agentName ? agentName.substring(0, 1).toUpperCase() : 'A';
  const activeChannelFilter = useChatStore(state => state.activeChannelFilter);
  const setActiveChannelFilter = useChatStore(state => state.setActiveChannelFilter);
  const connectedInstanceName = useChatStore(state => state.connectedInstanceName);
  
  const [userCompanies, setUserCompanies] = useState<any[]>([]);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [currentCompanyContext, setCurrentCompanyContext] = useState<any>(null);

  const tenantIdFromStore = useChatStore(state => state.tenantInfo?.id);
  const tenantId = tenantIdFromStore || (localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id'));
  const [instances, setInstances] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId) return;

    const fetchInstances = async () => {
      try {
        const { data, error } = await supabase.from('whatsapp_instances')
          .select('id, display_name, status')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });
          
        if (error) {
           console.error('Erro detalhado Supabase:', error);
           return;
        }
        if (data) setInstances(data);
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
          .single();
          
        if (currentError || !currentCompany) return;
        
        setCurrentCompanyContext(currentCompany);

        if (currentCompany.email) {
            const { data: companies, error: companiesError } = await supabase
              .from('companies')
              .select('id, name, status, plan_id')
              .eq('email', currentCompany.email)
              .order('created_at', { ascending: false });

            if (!companiesError && companies) {
               setUserCompanies(companies);
            }
        }
      } catch (err) {
        console.error('Erro ao buscar empresas multi-tenant:', err);
      }
    };

    fetchInstances();
    fetchCompanies();

    const channel = supabase.channel(`public:whatsapp_instances:tenant_id=${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_instances', filter: `tenant_id=eq.${tenantId}` }, () => {
         fetchInstances();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  const handleSwitchWorkspace = (company: any) => {
    if (company.id === tenantId) return;
    
    if (localStorage.getItem('current_tenant_id')) {
        localStorage.setItem('current_tenant_id', company.id);
        localStorage.setItem('current_tenant_name', company.name);
    } else {
        sessionStorage.setItem('current_tenant_id', company.id);
        sessionStorage.setItem('current_tenant_name', company.name);
    }
    
    window.location.reload();
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
    <div className="w-[260px] h-full bg-[#182229] dark:bg-[#111b21] flex flex-col text-[#d1d7db] font-sans text-sm border-r border-[#2a3942] z-20 shrink-0 shadow-lg relative overflow-hidden transition-all duration-300">
      
      {/* Workspace Header Premium */}
      <div 
        className="h-16 flex items-center px-4 border-b border-[#2a3942]/60 hover:bg-[#202c33] cursor-pointer transition-colors group relative z-50"
        onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
      >
        <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shrink-0 border border-indigo-400 shadow-sm">
          <div className="w-2 h-2 bg-white rounded-sm"></div>
        </div>
        <div className="flex-1 min-w-0 ml-3">
          <h2 className="font-semibold text-[#e9edef] truncate text-[15px] tracking-tight group-hover:text-white transition-colors">
            {currentCompanyContext?.name || 'Carregando...'}
          </h2>
        </div>
        <div className="bg-[#2a3942] group-hover:bg-[#3b4a54] p-1 rounded transition-colors">
           <ChevronDown size={14} className="text-[#8696a0] group-hover:text-white transition-colors" />
        </div>

        {/* Workspace Dropdown Panel */}
        {showWorkspaceMenu && (
          <div className="absolute top-[68px] left-2 w-[340px] bg-[#1e1e24] border border-[#2a2a2f] rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
             
             <div className="max-h-[300px] overflow-y-auto styled-scrollbar py-2">
                {userCompanies.map((ws) => (
                  <div 
                    key={ws.id} 
                    onClick={() => handleSwitchWorkspace(ws)}
                    className={cn(
                      "flex items-center justify-between px-4 py-2 hover:bg-[#2a2a2f]/50 cursor-pointer transition-colors",
                      ws.id === tenantId ? "bg-indigo-500/10 border-l-2 border-indigo-500" : ""
                    )}
                  >
                     <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-5 h-5 rounded bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 flex items-center justify-center shrink-0 border border-indigo-500/30">
                          <span className="text-[10px] font-bold text-indigo-400">{ws.name.substring(0, 1).toUpperCase()}</span>
                        </div>
                        <span className={cn("text-sm truncate", ws.id === tenantId ? "text-white font-medium" : "text-slate-300")}>{ws.name}</span>
                     </div>
                     {ws.id === tenantId && (
                       <CheckCircle2 size={14} className="text-indigo-400 shrink-0 ml-2" />
                     )}
                  </div>
                ))}
             </div>

             {/* Add New Workspace Action */}
             <div className="p-3 bg-[#18181b] border-t border-[#2a2a2f]" onClick={e => e.stopPropagation()}>
               {isCreatingWorkspace ? (
                  <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                     <input 
                       autoFocus
                       type="text"
                       value={newWorkspaceName}
                       onChange={(e) => setNewWorkspaceName(e.target.value)}
                       placeholder="Nome da Nova Empresa..."
                       className="w-full bg-[#202027] border border-[#2a2a2f] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                       onKeyDown={(e) => {
                         if (e.key === 'Enter') handleCreateWorkspace()
                         if (e.key === 'Escape') setIsCreatingWorkspace(false)
                       }}
                     />
                     <div className="flex gap-2">
                       <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           handleCreateWorkspace();
                         }}
                         disabled={!newWorkspaceName.trim()}
                         className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium py-2 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                       >
                         Criar
                       </button>
                       <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           setIsCreatingWorkspace(false);
                         }}
                         className="flex-1 bg-[#2a2a2f] hover:bg-[#323238] text-slate-300 text-xs font-medium py-2 rounded-md transition-colors"
                       >
                         Cancelar
                       </button>
                     </div>
                  </div>
               ) : (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCreatingWorkspace(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-[#2a2a2f] hover:border-indigo-500/50 hover:bg-indigo-500/5 text-slate-400 hover:text-indigo-400 transition-all text-sm font-medium"
                  >
                    <Plus size={16} /> Criar nova empresa
                  </button>
               )}
             </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto w-full styled-scrollbar pb-20">
        
        {/* Search */}
        <div className="px-3 py-3">
          <div className="relative flex items-center w-full h-8 bg-[#202c33] rounded-md border border-transparent focus-within:border-[#00a884]/50 focus-within:ring-1 focus-within:ring-[#00a884]/50 transition-all">
            <Search size={14} className="absolute left-2.5 text-[#8696a0]" />
            <input 
              type="text" 
              placeholder="Pesquisar..." 
              className="w-full h-full bg-transparent border-none focus:outline-none focus:ring-0 text-[#d1d7db] text-[13px] pl-8 pr-8 placeholder-[#8696a0]"
            />
            <div className="absolute right-2 px-1.5 py-0.5 rounded bg-black/20 font-mono text-[9px] text-[#8696a0] tracking-tighter">/</div>
          </div>
        </div>

        {/* Global Nav */}
        <div className="px-2 space-y-0.5">
          <NavItem icon={<Inbox size={16} />} title="Caixa de Entrada" badge="99+" />
          
          <CollapsibleSection title="Conversas" icon={<MessageCircle size={16} />} isOpen={expandedSections.conversations} onToggle={() => toggleSection('conversations')}>
            <NavItem title="Todas as conversas" isActive={!activeChannelFilter} onClick={() => setActiveChannelFilter(null, null)} />
            <NavItem title="Menções" />
            <NavItem title="Não atendidas" />
          </CollapsibleSection>
          
          <CollapsibleSection title="Times" icon={<Users size={16} />} isOpen={expandedSections.teams} onToggle={() => toggleSection('teams')}>
            <NavItem title="comercial" isSub />
          </CollapsibleSection>

          <CollapsibleSection title="Canais" icon={<Layers size={16} />} isOpen={expandedSections.channels} onToggle={() => toggleSection('channels')}>
            {instances.length > 0 ? (
               instances.map(inst => (
                  <div key={inst.id} className="relative group/channel">
                    <NavItem 
                      icon={<Brands.WhatsApp size={14} />} 
                      title={inst.display_name || 'Sem nome'} 
                      isSub 
                      isActive={activeChannelFilter === inst.id || activeChannelFilter === inst.display_name}
                      onClick={() => {
                        if (inst.status !== 'connected') {
                          useChatStore.getState().openQRModal(inst.id);
                        } else {
                          setActiveChannelFilter(activeChannelFilter === inst.id ? null : inst.id, inst.display_name);
                          navigate('/chat');
                        }
                      }}
                    />
                    <button 
                       className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 opacity-0 group-hover/channel:opacity-100 transition-all z-10"
                       onClick={(e) => { e.stopPropagation(); useChatStore.getState().openQRModal(inst.id); }}
                       title={inst.status === 'connected' ? 'Instância Conectada' : 'Visualizar QRC / Conectar'}
                    >
                       <Smartphone size={14} className={cn("transition-colors", inst.status === 'connected' ? 'text-[#00a884]' : 'text-slate-400')} />
                       {inst.status !== 'connected' && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>}
                    </button>
                  </div>
               ))
            ) : (
               <NavItem title="Nenhum canal ativo" isSub />
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Etiquetas" icon={<Tag size={16} />} isOpen={expandedSections.labels} onToggle={() => toggleSection('labels')}>
            {[
               { title: "agente-off", color: "bg-red-500" },
               { title: "bloqueado", color: "bg-red-600" },
               { title: "em-treinamento", color: "bg-[#111111]" },
               { title: "financeiro", color: "bg-blue-600" },
               { title: "gestor", color: "bg-slate-600" },
               { title: "plano-básico", color: "bg-green-600" }
            ].map(label => (
                <NavItem 
                  key={label.title}
                  icon={<LabelDot color={label.color} />} 
                  title={label.title} 
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
            ))}
            
            <div className="mt-1 pt-1.5 mx-3 border-t border-[#2a3942]/60 flex gap-1">
               <button 
                  onClick={() => navigate('/settings/labels')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#202c33] hover:bg-[#2a3942] rounded-md text-[11px] text-[#8696a0] hover:text-white transition-colors"
                  title="Gerenciar Etiquetas"
               >
                 <Settings size={12} />
                 <span>Gerenciar</span>
               </button>
               <button 
                  onClick={() => navigate('/settings/labels')}
                  className="flex items-center justify-center py-1.5 px-3 bg-[#00a884]/10 hover:bg-[#00a884]/20 border border-[#00a884]/20 hover:border-[#00a884]/40 rounded-md text-[#00a884] transition-colors"
                  title="Adicionar Nova Etiqueta"
               >
                 <Plus size={12} />
               </button>
            </div>
          </CollapsibleSection>
        </div>

        <div className="h-px bg-[#2a3942]/60 mx-4 my-3" />

        <div className="px-2 space-y-0.5 pb-4">
          <NavItem icon={<MessageCircle size={16} />} title="Chat Interno" />
          <NavItem icon={<LayoutDashboard size={16} />} title="Kanban" />
          <NavItem icon={<Contact size={16} />} title="Contatos" onClick={() => navigate('/contacts')} />
          <NavItem icon={<BarChart3 size={16} />} title="Relatórios" />
          <NavItem icon={<Megaphone size={16} />} title="Campanhas" />
          <NavItem icon={<BookOpen size={16} />} title="Central de Ajuda" />
          
          <div className="pt-2 mt-2 border-t border-[#2a3942]/60">
            <CollapsibleSection 
              title="Configurações" 
              icon={<Settings size={16} />}
              isOpen={expandedSections.settings} 
              onToggle={() => toggleSection('settings')}
            >
              <NavItem icon={<Briefcase size={16} />} title="Conta" isSub onClick={() => navigate('/settings/account')} />
              <NavItem icon={<UserSquare2 size={16} />} title="Agentes" isSub onClick={() => navigate('/settings/agents')} />
              <NavItem icon={<Users size={16} />} title="Times" isSub onClick={() => navigate('/settings/teams')} />
              <NavItem icon={<Inbox size={16} />} title="Caixas de Entrada" isSub onClick={() => navigate('/settings/inboxes')} />
              <NavItem icon={<Tag size={16} />} title="Etiquetas" isSub onClick={() => navigate('/settings/labels')} />
              <NavItem icon={<Code2 size={16} />} title="Atributos Personalizados" isSub onClick={() => navigate('/settings/attributes')} />
              <NavItem icon={<Repeat size={16} />} title="Automação" isSub onClick={() => navigate('/settings/automation')} />
              <NavItem icon={<Bot size={16} />} title="Robôs" isSub onClick={() => navigate('/settings/bots')} />
              <NavItem icon={<CalendarDays size={16} />} title="Macros" isSub onClick={() => navigate('/settings/macros')} />
              <NavItem icon={<MessageSquareReply size={16} />} title="Respostas Prontas" isSub onClick={() => navigate('/settings/canned-responses')} />
              <NavItem icon={<Puzzle size={16} />} title="Integrações" isSub onClick={() => navigate('/settings/integrations')} />
              <NavItem icon={<Workflow size={16} />} title="Fluxo de Conversa" isSub onClick={() => navigate('/flows')} />
            </CollapsibleSection>
          </div>
        </div>

      </div>

      {/* User Footer Profile */}
      <div className="absolute bottom-0 w-full h-[60px] bg-[#202c33] border-t border-[#2a3942] flex items-center px-4 cursor-pointer hover:bg-[#2a3942] transition-colors group">
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#00a884] to-teal-500 p-[1px] shadow-sm">
            <div className="w-full h-full bg-[#111b21] rounded-full flex items-center justify-center overflow-hidden">
               <span className="text-[#e9edef] font-semibold text-xs tracking-tight">{agentInitial}</span>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#202c33] rounded-full group-hover:border-[#2a3942] transition-colors" />
        </div>
        <div className="ml-3 flex-1 min-w-0">
          <p className="text-[14px] font-medium text-[#e9edef] truncate">{agentName}</p>
          <p className="text-[11px] text-[#8696a0] truncate opacity-80">{agentName.toLowerCase().replace(/\s/g, '')}@xpoint.com</p>
        </div>
      </div>
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
          background: #2a3942;
          border-radius: 4px;
        }
        .styled-scrollbar:hover::-webkit-scrollbar-thumb {
          background: #3b4a54;
        }
      `}</style>
    </div>
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
  onClick 
}: { 
  icon?: React.ReactNode, 
  title: string, 
  badge?: string, 
  isActive?: boolean, 
  isSub?: boolean,
  actionNode?: React.ReactNode,
  onClick?: () => void
}) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer transition-colors group relative",
        isActive ? "bg-[#202c33]" : "hover:bg-[#202c33]/60",
        isSub ? "pl-5" : ""
      )}
    >
      <div className="flex items-center min-w-0 gap-3 flex-1">
        {icon && <span className={cn("shrink-0", isActive ? "text-[#e9edef]" : "text-[#8696a0] group-hover:text-[#d1d7db]")}>{icon}</span>}
        <span className={cn(
          "truncate tracking-tight flex-1", 
          isActive ? "text-[#e9edef] font-medium" : "text-[#aebac1] group-hover:text-[#d1d7db]",
          isSub && !icon ? "text-[13px]" : "text-[14px]"
        )}>
          {title}
        </span>
      </div>
      
      <div className="flex items-center gap-1.5 shrink-0 ml-2">
         {actionNode && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
               {actionNode}
            </div>
         )}
         {badge && (
           <span className="bg-[#2a3942] text-[#d1d7db] text-[10px] px-1.5 py-0.5 rounded-full font-mono">
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
        className="flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer hover:bg-[#202c33]/60 transition-colors group"
      >
        <div className="flex items-center gap-3">
          {icon && <span className="text-[#8696a0] group-hover:text-[#d1d7db] transition-colors">{icon}</span>}
          <span className="text-[14px] text-[#aebac1] group-hover:text-[#d1d7db] tracking-tight">{title}</span>
        </div>
        <div className="text-[#8696a0]">
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
  return <div className={cn("w-2 h-2 rounded-full shadow-sm", color)} />;
}
