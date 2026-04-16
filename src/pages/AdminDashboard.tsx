import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building, CreditCard, ScrollText, LogOut, Search, Plus, Activity, Lock, CheckCircle2, Shield, X, Loader2, Smartphone } from 'lucide-react';
import { cn } from './ChatDashboard';
import { Navigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import ThemeToggle from '../components/ThemeToggle';

type TabType = 'overview' | 'companies' | 'plans' | 'billing';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [companies, setCompanies] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newCompany, setNewCompany] = useState({ name: '', plan_id: '', instance: '', email: '', password: '' });
  
  const [showEditCompany, setShowEditCompany] = useState<any>(null);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newPlan, setNewPlan] = useState({ name: '', price: 0, max_users: 1, max_connections: 1 });
  
  const navigate = useNavigate();

  if (!sessionStorage.getItem('saas_admin')) {
    return <Navigate to="/admin/login" replace />;
  }

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    const { data: companiesData } = await supabase.from('companies').select('*, plans(name)');
    const { data: plansData } = await supabase.from('plans').select('*');
    
    if (companiesData) setCompanies(companiesData);
    if (plansData) setPlans(plansData);
    setLoading(false);
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    await supabase.from('companies').insert({
      name: newCompany.name,
      plan_id: newCompany.plan_id,
      evolution_api_instance: newCompany.instance,
      email: newCompany.email,
      password: newCompany.password,
      status: 'active',
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // +30 dias
    });
    
    setShowNewCompany(false);
    setNewCompany({ name: '', plan_id: '', instance: '', email: '', password: '' });
    fetchData();
  };

  const handleLogout = () => {
    sessionStorage.removeItem('saas_admin');
    navigate('/admin/login');
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await supabase.from('companies').update({
      name: showEditCompany.name,
      plan_id: showEditCompany.plan_id,
      evolution_api_instance: showEditCompany.evolution_api_instance,
      email: showEditCompany.email,
      password: showEditCompany.password,
      status: showEditCompany.status,
      current_period_end: new Date(showEditCompany.current_period_end)
    }).eq('id', showEditCompany.id);

    setShowEditCompany(null);
    fetchData();
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await supabase.from('plans').insert({
      name: newPlan.name,
      price: newPlan.price,
      features: {
        max_users: newPlan.max_users,
        max_connections: newPlan.max_connections
      }
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
    <div className="flex h-[100dvh] w-full bg-[#f0f2f5] dark:bg-[#111b21] font-sans text-[#111b21] dark:text-[#e9edef]">
      {/* Sidebar Admin */}
      <aside className="w-64 flex flex-col bg-white dark:bg-[#202c33] border-r border-black/5 dark:border-white/5 z-10 shadow-lg relative">
        <span className="absolute top-1 left-4 text-[10px] font-mono text-[#00a884] opacity-80 whitespace-nowrap">v2.0.10 | Deploy: 16/04/2026 08:40</span>
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
           <div className="bg-white dark:bg-[#202c33] border border-black/5 dark:border-white/5 rounded-2xl p-6 shadow-sm">
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
                       <td className="p-3 text-right">
                         <button onClick={() => setShowEditCompany(comp)} className="text-blue-500 hover:text-blue-600 font-semibold text-xs px-3 py-1.5 rounded bg-blue-500/10 hover:bg-blue-500/20 transition-colors">
                           Editar
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
          <div className="bg-white dark:bg-[#202c33] rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2">Nova Empresa</h3>
                <button onClick={() => setShowNewCompany(false)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"><X size={20} /></button>
             </div>
             <form onSubmit={handleCreateCompany} className="space-y-4">
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
                <button type="submit" disabled={loading} className="w-full mt-4 bg-[#00a884] hover:bg-[#018b6e] text-white font-bold py-3 rounded-xl disabled:opacity-50 flex justify-center">{loading ? <Loader2 className="animate-spin" /> : 'Cadastrar Franquia'}</button>
             </form>
          </div>
        </div>
      )}

      {/* Modal Editar Empresa */}
      {showEditCompany && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#202c33] rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2">Editar Empresa</h3>
                <button onClick={() => setShowEditCompany(null)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-slate-500 dark:text-slate-300"><X size={20} /></button>
             </div>
             <form onSubmit={handleUpdateCompany} className="space-y-4">
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
                <button type="submit" disabled={loading} className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl disabled:opacity-50 flex justify-center">{loading ? <Loader2 className="animate-spin" /> : 'Salvar Alterações'}</button>
             </form>
          </div>
        </div>
      )}

      {/* Modal Criar Plano */}
      {showNewPlan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#202c33] rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold flex items-center gap-2">Criar Novo Plano</h3>
                <button onClick={() => setShowNewPlan(false)} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-slate-500 dark:text-slate-300"><X size={20} /></button>
             </div>
             <form onSubmit={handleCreatePlan} className="space-y-4">
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
                <button type="submit" disabled={loading} className="w-full mt-4 bg-[#00a884] hover:bg-[#018b6e] text-white font-bold py-3 rounded-xl disabled:opacity-50 flex justify-center">{loading ? <Loader2 className="animate-spin" /> : 'Salvar Novo Plano'}</button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
