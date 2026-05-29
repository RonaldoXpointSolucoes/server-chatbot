import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building, CreditCard, ScrollText, LogOut, Search, Plus, Activity, Lock, CheckCircle2, Shield, X, Loader2, Smartphone, Trash2, FolderTree, AlertTriangle } from 'lucide-react';
import { cn } from './ChatDashboard';
import { Navigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import ThemeToggle from '../components/ThemeToggle';

type TabType = 'overview' | 'companies' | 'economic_groups' | 'plans' | 'billing' | 'instances';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [companies, setCompanies] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [economicGroups, setEconomicGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: '', plan_id: '', instance: '', email: '', password: '', economic_group_id: '' });
  
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', owner_email: '' });
  
  const [showDeleteModal, setShowDeleteModal] = useState<{type: 'company'|'group', id: string, name: string} | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  const [showEditCompany, setShowEditCompany] = useState<any>(null);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newPlan, setNewPlan] = useState({ name: '', price: 0, max_users: 1, max_connections: 1 });
  
  const navigate = useNavigate();

  if (!sessionStorage.getItem('admin_token')) {
    return <Navigate to="/admin/login" replace />;
  }

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const apiUrl = import.meta.env.VITE_API_URL || 'https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io';

  const fetchData = async () => {
    setLoading(true);
    try {
      const [compRes, plansRes, groupsRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/admin/companies`),
        fetch(`${apiUrl}/api/v1/admin/plans`),
        fetch(`${apiUrl}/api/v1/admin/economic-groups`)
      ]);
      const companiesData = await compRes.json();
      const plansData = await plansRes.json();
      const groupsData = await groupsRes.json();
      
      if (companiesData && !companiesData.error) setCompanies(companiesData);
      if (plansData && !plansData.error) setPlans(plansData);
      if (groupsData && !groupsData.error) setEconomicGroups(groupsData);
    } catch (e) {
      console.error('Error fetching admin data:', e);
    }
    setLoading(false);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await fetch(`${apiUrl}/api/v1/admin/economic-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newGroup)
    });
    setShowNewGroup(false);
    setNewGroup({ name: '', owner_email: '' });
    fetchData();
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showDeleteModal || deleteConfirmText !== showDeleteModal.name) return;
    setLoading(true);
    const endpoint = showDeleteModal.type === 'company' ? 'companies' : 'economic-groups';
    
    await fetch(`${apiUrl}/api/v1/admin/${endpoint}/${showDeleteModal.id}`, {
      method: 'DELETE',
    });
    
    setShowDeleteModal(null);
    setDeleteConfirmText('');
    fetchData();
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    await fetch(`${apiUrl}/api/v1/admin/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newCompany.name,
        plan_id: newCompany.plan_id,
        evolution_api_instance: newCompany.instance,
        email: newCompany.email,
        password: newCompany.password,
        economic_group_id: newCompany.economic_group_id || null,
        status: 'active',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      })
    });
    
    setShowNewCompany(false);
    setNewCompany({ name: '', plan_id: '', instance: '', email: '', password: '', economic_group_id: '' });
    fetchData();
  };

  const handleLogout = () => {
    sessionStorage.removeItem('saas_admin');
    sessionStorage.removeItem('admin_token');
    navigate('/admin/login');
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    await fetch(`${apiUrl}/api/v1/admin/companies/${showEditCompany.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: showEditCompany.name,
        plan_id: showEditCompany.plan_id,
        evolution_api_instance: showEditCompany.evolution_api_instance,
        email: showEditCompany.email,
        password: showEditCompany.password,
        status: showEditCompany.status,
        economic_group_id: showEditCompany.economic_group_id || null,
        current_period_end: new Date(showEditCompany.current_period_end)
      })
    });

    setShowEditCompany(null);
    fetchData();
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    await fetch(`${apiUrl}/api/v1/admin/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newPlan.name,
        price: newPlan.price,
        features: {
          max_users: newPlan.max_users,
          max_connections: newPlan.max_connections
        }
      })
    });

    setShowNewPlan(false);
    setNewPlan({ name: '', price: 0, max_users: 1, max_connections: 1 });
    fetchData();
  };

  // Mock data for UI demonstrations
  const stats = [
    { label: 'Empresas Ativas', value: companies.filter(c => c.status === 'active').length.toString(), icon: Building, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Testes (Trial)', value: companies.filter(c => c.status === 'trial').length.toString(), icon: Activity, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { label: 'Faturas Vencidas', value: '0', icon: CreditCard, color: 'text-red-500', bg: 'bg-red-500/10' },
    { label: 'Total de Planos', value: plans.length.toString(), icon: ScrollText, color: 'text-[#00a884]', bg: 'bg-[#00a884]/10' },
  ];

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-[#e9edef] dark:bg-[#111b21] relative animate-in fade-in duration-300">
      {/* Sidebar Admin */}
      <aside className="w-64 flex flex-col bg-white dark:bg-[#202c33] border-r border-black/5 dark:border-white/5 z-10 shadow-lg relative">
        <span className="absolute top-1 left-4 text-[10px] font-mono text-[#00a884] opacity-80 whitespace-nowrap">{`v${import.meta.env.PACKAGE_VERSION || '2.8.19'} | Deploy: ${import.meta.env.PACKAGE_BUILD_DATE ? new Date(import.meta.env.PACKAGE_BUILD_DATE).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '29/05/2026, 13:21'}`}</span>
        <div className="h-16 flex items-center px-6 border-b border-black/5 dark:border-white/5 gap-3 mt-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00a884] to-[#018b6e] flex items-center justify-center text-white shadow-md">
            <Shield size={18} />
          </div>
          <span className="font-bold tracking-tight">SaaS Master</span>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {[
            { id: 'overview', icon: LayoutDashboard, label: 'Visão Geral', path: null },
            { id: 'companies', icon: Building, label: 'Empresas', path: null },
            { id: 'economic_groups', icon: FolderTree, label: 'Grupos Econômicos', path: null },
            { id: 'plans', icon: ScrollText, label: 'Planos de Uso', path: null },
            { id: 'instances', icon: Smartphone, label: 'Gerenciador de Instâncias', path: '/instances' },
            { id: 'billing', icon: CreditCard, label: 'Faturamento', path: null },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.path) {
                    navigate(item.path);
                  } else {
                    setActiveTab(item.id as TabType);
                  }
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 group relative",
                  isActive 
                    ? "bg-[#00a884]/10 text-[#00a884]" 
                    : "text-[#54656f] dark:text-[#aebac1] hover:bg-black/5 dark:hover:bg-white/5"
                )}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#00a884] rounded-r-full" />}
                <Icon size={20} className={cn("transition-colors", isActive ? "text-[#00a884]" : "text-[#54656f] dark:text-[#aebac1] group-hover:text-inherit")} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-black/5 dark:border-white/5">
           <button 
             onClick={handleLogout}
             className="w-full flex justify-center items-center gap-2 py-2 px-4 rounded-xl text-red-500 hover:bg-red-500/10 font-semibold transition-colors"
           >
              Sair do Painel <LogOut size={18} />
           </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 animate-in fade-in duration-500">
         <header className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Dashboard Administrativo</h1>
              <p className="text-[#54656f] dark:text-[#aebac1] text-sm mt-1">Gerencie licenças, inquilinos e assinaturas.</p>
            </div>
            
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="flex items-center bg-white dark:bg-[#202c33] border border-black/5 dark:border-white/10 rounded-full px-4 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-[#00a884] transition-all">
                <Search size={16} className="text-[#aebac1]" />
                <input type="text" placeholder="Buscar ID ou Empresa..." className="bg-transparent border-none outline-none text-sm ml-2 w-48 dark:text-white" />
              </div>
            </div>
         </header>

         {activeTab === 'overview' && (
           <div className="grid grid-cols-4 gap-6 mb-8">
             {stats.map((stat, i) => (
               <div key={i} className="bg-white dark:bg-[#202c33] p-5 rounded-2xl border border-black/5 dark:border-white/5 shadow-sm hover:shadow-md transition-shadow">
                 <div className="flex justify-between items-start">
                   <div className={cn("p-2.5 rounded-xl", stat.bg)}>
                     <stat.icon size={22} className={stat.color} />
                   </div>
                 </div>
                 <div className="mt-4">
                   <span className="text-[#54656f] dark:text-[#aebac1] font-semibold text-sm">{stat.label}</span>
                   <h2 className="text-3xl font-bold mt-1 text-black dark:text-white">{stat.value}</h2>
                 </div>
               </div>
             ))}
           </div>
         )}

         {activeTab === 'companies' && (
           <div className="bg-white/80 dark:bg-[#202c33]/80 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#00a884]/20 to-transparent rounded-full blur-3xl -z-10 pointer-events-none" />
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">Empresas Gerenciadas</h3>
                <button 
                  onClick={() => setShowNewCompany(true)}
                  className="bg-[#00a884] hover:bg-[#018b6e] text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-[#00a884]/30 transition-all hover:shadow-[#00a884]/40 hover:-translate-y-0.5"
                >
                  <Plus size={16} /> Nova Empresa
                </button>
             </div>
             
             {/* Main Tabela */}
             <div className="overflow-x-auto text-sm">
               {loading ? (
                 <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#00a884]" size={24} /></div>
               ) : (
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="border-b border-black/10 dark:border-white/10 text-[#54656f] dark:text-[#aebac1] uppercase text-xs tracking-wider">
                     <th className="font-semibold p-3">Status</th>
                     <th className="font-semibold p-3">Nome Fantasia</th>
                     <th className="font-semibold p-3">Plano</th>
                     <th className="font-semibold p-3">Vencimento</th>
                     <th className="font-semibold p-3">Instância Evolution</th>
                     <th className="font-semibold p-3 text-right">Ações</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-black/5 dark:divide-white/5">
                   {companies.map(comp => (
                     <tr key={comp.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group">
                       <td className="p-3">
                         {comp.status === 'active' && <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 text-green-500 rounded-full font-bold text-[11px] uppercase tracking-wide leading-none h-6"><CheckCircle2 size={12} /> Ativo</span>}
                         {comp.status === 'trial' && <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-orange-500/10 text-orange-500 rounded-full font-bold text-[11px] uppercase tracking-wide leading-none h-6"><Activity size={12} /> Trial</span>}
                         {comp.status === 'suspended' && <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 text-red-500 rounded-full font-bold text-[11px] uppercase tracking-wide leading-none h-6"><Lock size={12} /> Bloqueado</span>}
                       </td>
                       <td className="p-3 font-semibold">{comp.name}</td>
                       <td className="p-3 font-medium text-[#54656f] dark:text-[#aebac1]">{comp.plans?.name || '---'}</td>
                       <td className="p-3 font-medium text-[#54656f] dark:text-[#aebac1]">
                         {comp.current_period_end ? new Date(comp.current_period_end).toLocaleDateString() : 'N/A'}
                       </td>
                       <td className="p-3">
                         <span className="text-xs bg-black/5 dark:bg-white/10 px-2 py-1 rounded font-mono text-[#54656f] dark:text-[#aebac1]">{comp.evolution_api_instance || 'N/A'}</span>
                       </td>
                       <td className="p-3 text-right flex justify-end gap-2">
                         <button onClick={() => setShowEditCompany(comp)} className="text-blue-500 hover:text-blue-600 font-semibold text-xs px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 transition-colors">
                           Editar
                         </button>
                         <button onClick={() => setShowDeleteModal({type: 'company', id: comp.id, name: comp.name})} className="text-red-500 hover:text-red-600 font-semibold text-xs px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-colors">
                           <Trash2 size={16}/>
                         </button>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
               )}
             </div>
           </div>
         )}
         
         {activeTab === 'economic_groups' && (
           <div className="bg-white/80 dark:bg-[#202c33]/80 backdrop-blur-xl border border-black/5 dark:border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#00a884]/20 to-transparent rounded-full blur-3xl -z-10 pointer-events-none" />
             <div className="flex justify-between items-center mb-6">
                <div>
                   <h3 className="text-lg font-bold">Grupos Econômicos (Holdings)</h3>
                   <p className="text-sm text-[#54656f]">Agrupe empresas de um mesmo conglomerado.</p>
                </div>
                <button 
                  onClick={() => setShowNewGroup(true)}
                  className="bg-[#00a884] hover:bg-[#018b6e] text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-[#00a884]/30 transition-all hover:shadow-[#00a884]/40 hover:-translate-y-0.5"
                >
                  <Plus size={16} /> Novo Grupo
                </button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {economicGroups.map(group => (
                  <div key={group.id} className="bg-white/60 dark:bg-[#111b21]/60 backdrop-blur-md border border-black/10 dark:border-white/10 rounded-2xl p-6 flex flex-col justify-between group hover:border-[#00a884]/50 transition-all relative">
                     <button onClick={() => setShowDeleteModal({type: 'group', id: group.id, name: group.name})} className="absolute top-4 right-4 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={18}/></button>
                     <div>
                       <div className="w-10 h-10 rounded-xl bg-[#00a884]/10 text-[#00a884] flex items-center justify-center mb-4"><FolderTree size={20}/></div>
                       <h4 className="font-bold text-lg">{group.name}</h4>
                       <p className="text-sm text-[#54656f] mt-1">{group.owner_email || 'Sem e-mail cadastrado'}</p>
                       <p className="text-xs font-medium text-slate-500 mt-4 pt-4 border-t border-black/5 dark:border-white/5">Criado em: {new Date(group.created_at).toLocaleDateString()}</p>
                     </div>
                  </div>
                ))}
                {economicGroups.length === 0 && (
                  <div className="col-span-full py-10 text-center text-[#54656f]">Nenhum grupo econômico encontrado.</div>
                )}
             </div>
           </div>
         )}

         {activeTab === 'plans' && (
           <div className="bg-white dark:bg-[#202c33] border border-black/5 dark:border-white/5 rounded-2xl p-6 shadow-sm">
             <div className="flex justify-between items-center mb-6">
               <div>
                  <h3 className="text-lg font-bold">Gerenciador de Licenças</h3>
                  <p className="text-sm text-[#54656f]">Regras ativas no banco de dados.</p>
               </div>
               <button 
                  onClick={() => setShowNewPlan(true)}
                  className="bg-[#00a884] hover:bg-[#018b6e] text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-[#00a884]/30 transition-all hover:shadow-[#00a884]/40 hover:-translate-y-0.5"
                >
                  <Plus size={16} /> Novo Plano
                </button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plans.map(plan => (
                  <div key={plan.id} className="border border-black/10 dark:border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                     <div>
                       <h4 className="font-bold text-lg">{plan.name}</h4>
                       <p className="text-sm text-[#54656f] mt-1 mb-4">R$ {plan.price}</p>
                       <ul className="text-sm space-y-2 font-medium mb-6">
                          <li className="flex gap-2"><CheckCircle2 size={16} className="text-[#00a884]"/> Usuários: {plan.features.max_users || 1}</li>
                          <li className="flex gap-2"><CheckCircle2 size={16} className="text-[#00a884]"/> Aparelhos WS: {plan.features.max_connections || 1}</li>
                       </ul>
                     </div>
                  </div>
                ))}
             </div>
           </div>
         )}
      </main>

      {/* Modal Criar Empresa */}
      {showNewCompany && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#202c33] rounded-[2rem] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
             <div className="flex justify-between items-center p-6 border-b border-black/5 dark:border-white/5 shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2">Nova Empresa</h3>
                <button onClick={() => setShowNewCompany(false)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"><X size={20} /></button>
             </div>
             <div className="overflow-y-auto p-6 styled-scrollbar-none">
               <form id="form-nova-empresa" onSubmit={handleCreateCompany} className="space-y-4">
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Nome da Empresa</label>
                     <input type="text" required value={newCompany.name} onChange={e => setNewCompany({...newCompany, name: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-[#aebac1] border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]" placeholder="XPTO Ltda"/>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">E-mail de Acesso</label>
                     <input type="email" required value={newCompany.email} onChange={e => setNewCompany({...newCompany, email: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-[#aebac1] border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]" placeholder="contato@empresa.com"/>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Senha Provisória</label>
                     <input type="text" required value={newCompany.password} onChange={e => setNewCompany({...newCompany, password: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-[#aebac1] border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]" placeholder="SenhaSegura123"/>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Plano</label>
                     <select required value={newCompany.plan_id} onChange={e => setNewCompany({...newCompany, plan_id: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-[#aebac1] border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]">
                        <option value="">Selecione o plano</option>
                        {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                     </select>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Nome da Instância Base (Evolution)</label>
                     <input type="text" required value={newCompany.instance} onChange={e => setNewCompany({...newCompany, instance: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-[#aebac1] border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]" placeholder="InstanciaXpto"/>
                  </div>
               </form>
             </div>
             <div className="p-6 border-t border-black/5 dark:border-white/5 shrink-0 bg-white/50 dark:bg-[#202c33]/50">
               <button type="submit" form="form-nova-empresa" disabled={loading} className="w-full bg-[#00a884] hover:bg-[#018b6e] text-white font-bold py-3 rounded-xl disabled:opacity-50 flex justify-center">{loading ? <Loader2 className="animate-spin" /> : 'Cadastrar Franquia'}</button>
             </div>
          </div>
        </div>
      )}

      {/* Modal Editar Empresa */}
      {showEditCompany && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#202c33] rounded-[2rem] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
             <div className="flex justify-between items-center p-6 border-b border-black/5 dark:border-white/5 shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2">Editar Empresa</h3>
                <button onClick={() => setShowEditCompany(null)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-slate-500 dark:text-slate-300"><X size={20} /></button>
             </div>
             <div className="overflow-y-auto p-6 styled-scrollbar-none">
               <form id="form-editar-empresa" onSubmit={handleUpdateCompany} className="space-y-4">
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Nome da Empresa</label>
                     <input type="text" required value={showEditCompany.name} onChange={e => setShowEditCompany({...showEditCompany, name: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-white border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]"/>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">E-mail de Acesso</label>
                     <input type="email" required value={showEditCompany.email || ''} onChange={e => setShowEditCompany({...showEditCompany, email: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-[#aebac1] border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]" placeholder="contato@empresa.com"/>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Senha de Acesso</label>
                     <input type="text" required value={showEditCompany.password || ''} onChange={e => setShowEditCompany({...showEditCompany, password: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-[#aebac1] border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]" placeholder="Nova Senha"/>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Status</label>
                     <select required value={showEditCompany.status} onChange={e => setShowEditCompany({...showEditCompany, status: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-white border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]">
                        <option value="active">Ativo</option>
                        <option value="trial">Trial</option>
                        <option value="suspended">Suspenso (Bloqueado)</option>
                     </select>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Plano</label>
                     <select required value={showEditCompany.plan_id} onChange={e => setShowEditCompany({...showEditCompany, plan_id: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-white border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]">
                        {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                     </select>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Data de Vencimento</label>
                     <input 
                        type="date" 
                        required 
                        value={showEditCompany.current_period_end ? new Date(showEditCompany.current_period_end).toISOString().split('T')[0] : ''} 
                        onChange={e => setShowEditCompany({...showEditCompany, current_period_end: e.target.value})} 
                        className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-white border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884] text-slate-700 dark:[color-scheme:dark]"
                      />
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Instância Base (Evolution)</label>
                     <input type="text" value={showEditCompany.evolution_api_instance || ''} onChange={e => setShowEditCompany({...showEditCompany, evolution_api_instance: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-white border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]"/>
                  </div>
               </form>
             </div>
             <div className="p-6 border-t border-black/5 dark:border-white/5 shrink-0 bg-white/50 dark:bg-[#202c33]/50">
               <button type="submit" form="form-editar-empresa" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl disabled:opacity-50 flex justify-center">{loading ? <Loader2 className="animate-spin" /> : 'Salvar Alterações'}</button>
             </div>
          </div>
        </div>
      )}

      {/* Modal Criar Plano */}
      {showNewPlan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#202c33] rounded-[2rem] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
             <div className="flex justify-between items-center p-6 border-b border-black/5 dark:border-white/5 shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2">Criar Novo Plano</h3>
                <button onClick={() => setShowNewPlan(false)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-slate-500 dark:text-slate-300"><X size={20} /></button>
             </div>
             <div className="overflow-y-auto p-6 styled-scrollbar-none">
               <form id="form-novo-plano" onSubmit={handleCreatePlan} className="space-y-4">
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Nome do Plano</label>
                     <input type="text" required value={newPlan.name} onChange={e => setNewPlan({...newPlan, name: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-white border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]" placeholder="Ex: Plano Master"/>
                  </div>
                  <div>
                     <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Mensalidade (R$)</label>
                     <input type="number" step="0.01" required value={newPlan.price} onChange={e => setNewPlan({...newPlan, price: Number(e.target.value)})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-white border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]"/>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Qtd. Usuários</label>
                       <input type="number" min="1" required value={newPlan.max_users} onChange={e => setNewPlan({...newPlan, max_users: Number(e.target.value)})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-white border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]"/>
                    </div>
                    <div>
                       <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Aparelhos WS</label>
                       <input type="number" min="1" required value={newPlan.max_connections} onChange={e => setNewPlan({...newPlan, max_connections: Number(e.target.value)})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-white border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]"/>
                    </div>
                  </div>
               </form>
             </div>
             <div className="p-6 border-t border-black/5 dark:border-white/5 shrink-0 bg-white/50 dark:bg-[#202c33]/50">
               <button type="submit" form="form-novo-plano" disabled={loading} className="w-full bg-[#00a884] hover:bg-[#018b6e] text-white font-bold py-3 rounded-xl disabled:opacity-50 flex justify-center">{loading ? <Loader2 className="animate-spin" /> : 'Salvar Novo Plano'}</button>
             </div>
          </div>
        </div>
      )}
      {/* Modal Confirmar Exclusão */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#202c33] rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200 border border-red-500/20">
             <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6 text-red-500">
               <AlertTriangle size={32} />
             </div>
             <h3 className="text-2xl font-bold text-center mb-2">Excluir {showDeleteModal.type === 'company' ? 'Empresa' : 'Grupo Econômico'}</h3>
             <p className="text-center text-[#54656f] dark:text-[#aebac1] mb-6 text-sm leading-relaxed">
               Esta ação é <b className="text-red-500">irreversível</b>. Ao confirmar, todos os dados associados a <b>{showDeleteModal.name}</b> serão permanentemente removidos.
             </p>
             <form onSubmit={handleDelete} className="space-y-4">
                <div>
                   <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Digite "{showDeleteModal.name}" para confirmar</label>
                   <input type="text" required value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} className="w-full mt-2 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-white border-2 border-transparent rounded-xl px-4 py-3 outline-none focus:border-red-500 transition-colors text-center font-bold" placeholder={showDeleteModal.name}/>
                </div>
                <div className="flex gap-3 pt-2">
                   <button type="button" onClick={() => {setShowDeleteModal(null); setDeleteConfirmText('');}} className="flex-1 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-bold py-3 rounded-xl transition-colors">Cancelar</button>
                   <button type="submit" disabled={loading || deleteConfirmText !== showDeleteModal.name} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl disabled:opacity-50 flex justify-center items-center gap-2 transition-colors">{loading ? <Loader2 className="animate-spin" /> : <><Trash2 size={18}/> Excluir Agora</>}</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* Modal Criar Grupo */}
      {showNewGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#202c33] rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2"><FolderTree className="text-[#00a884]"/> Novo Grupo Econômico</h3>
                <button onClick={() => setShowNewGroup(false)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"><X size={20} /></button>
             </div>
             <form onSubmit={handleCreateGroup} className="space-y-4">
                <div>
                   <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">Nome da Holding / Grupo</label>
                   <input type="text" required value={newGroup.name} onChange={e => setNewGroup({...newGroup, name: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-white border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]" placeholder="Ex: Grupo Master S/A"/>
                </div>
                <div>
                   <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider">E-mail de Contato (Proprietário)</label>
                   <input type="email" required value={newGroup.owner_email} onChange={e => setNewGroup({...newGroup, owner_email: e.target.value})} className="w-full mt-1 bg-[#f0f2f5] dark:bg-[#111b21] dark:text-white border border-transparent rounded-xl px-4 py-3 outline-none focus:border-[#00a884]" placeholder="ceo@grupomaster.com"/>
                </div>
                <button type="submit" disabled={loading} className="w-full mt-4 bg-[#00a884] hover:bg-[#018b6e] text-white font-bold py-3 rounded-xl disabled:opacity-50 flex justify-center">{loading ? <Loader2 className="animate-spin" /> : 'Criar Grupo'}</button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
