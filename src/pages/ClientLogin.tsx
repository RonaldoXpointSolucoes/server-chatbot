import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../services/supabase';
import ThemeToggle from '../components/ThemeToggle';

export default function ClientLogin() {
  const [email, setEmail] = useState('ronaldo.xpointsolucoes@gmail.com');
  const [password, setPassword] = useState('Xx@gh03360102');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [keepLogged, setKeepLogged] = useState(false);
  const navigate = useNavigate();

  // Redireciona automaticamente se já estiver logado
  useEffect(() => {
    const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
    if (tenantId && tenantId !== 'undefined') {
      navigate('/chat', { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!email.trim() || !password.trim()) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      let tenantData = null;
      let userRole = 'admin';
      let allowedInstances = null;
      let allowedCompanies = null;
      let userName = '';

      // Tenta login como Empresa (Admin)
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id, name, status')
        .eq('email', email.trim().toLowerCase())
        .eq('password', password)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (companyData) {
        tenantData = companyData;
        userName = companyData.name;
        userRole = 'admin';
      } else {
        // Tenta login como Agente / Membro do time
        const { data: agentData, error: agentError } = await supabase
          .from('tenant_users')
          .select('id, tenant_id, role, full_name, allowed_instances, allowed_companies')
          .eq('email', email.trim().toLowerCase())
          .eq('password', password)
          .limit(1)
          .maybeSingle();

        if (agentData) {
           // Busca os dados da empresa matriz desse agente
           const { data: parentCompany } = await supabase
             .from('companies')
             .select('id, name, status')
             .eq('id', agentData.tenant_id)
             .single();
             
           if (parentCompany) {
             tenantData = parentCompany;
             userName = agentData.full_name;
             userRole = agentData.role;
             allowedInstances = agentData.allowed_instances || [];
             allowedCompanies = agentData.allowed_companies || [];
           }
        }
      }

      if (!tenantData) {
        setErrorMsg('E-mail ou senha inválidos.');
        setIsLoading(false);
        return;
      }

      if (tenantData.status === 'suspended') {
        setErrorMsg('Acesso bloqueado. Contate o administrador.');
        setIsLoading(false);
        return;
      }

      // Limpa dados antigos para evitar conflitos entre local e session storage
      localStorage.removeItem('current_tenant_id');
      localStorage.removeItem('current_tenant_name');
      localStorage.removeItem('current_user_name');
      localStorage.removeItem('current_user_role');
      localStorage.removeItem('allowed_instances');
      localStorage.removeItem('allowed_companies');
      
      sessionStorage.removeItem('current_tenant_id');
      sessionStorage.removeItem('current_tenant_name');
      sessionStorage.removeItem('current_user_name');
      sessionStorage.removeItem('current_user_role');
      sessionStorage.removeItem('allowed_instances');
      sessionStorage.removeItem('allowed_companies');

      const storage = keepLogged ? localStorage : sessionStorage;
      storage.setItem('current_tenant_id', tenantData.id);
      storage.setItem('current_tenant_name', tenantData.name);
      storage.setItem('current_user_name', userName);
      storage.setItem('current_user_role', userRole);
      
      if (userRole === 'agent' || userRole === 'Agente') {
          storage.setItem('allowed_instances', JSON.stringify(allowedInstances || []));
          storage.setItem('allowed_companies', JSON.stringify(allowedCompanies || []));
      }

      window.location.href = '/chat';
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro de conexão com o banco de dados.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-[#f0f2f5] dark:bg-[#111b21] font-sans relative">
      <div className="absolute top-6 right-6">
         <ThemeToggle />
      </div>
      <div className="w-full max-w-sm p-8 bg-white dark:bg-[#202c33] rounded-3xl shadow-xl animate-in slide-in-from-bottom-4 fade-in duration-500">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 text-blue-500">
             <Building2 size={32} />
          </div>
          <h1 className="text-2xl font-bold text-[#111b21] dark:text-[#e9edef]">Workspace Login</h1>
          <p className="text-[#54656f] text-sm mt-1 text-center font-medium">Acesse a central de mensageria da sua empresa.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider ml-1">E-mail Corporativo</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent rounded-xl px-4 py-3 text-[#111b21] dark:text-white placeholder:text-[#8696a0] outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#202c33] transition-all"
              placeholder="exemplo@suaempresa.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider ml-1">Senha de Acesso</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent rounded-xl px-4 py-3 text-[#111b21] dark:text-white placeholder:text-[#8696a0] outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#202c33] transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <input 
              type="checkbox" 
              id="keepLogged" 
              checked={keepLogged}
              onChange={(e) => setKeepLogged(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-[#f0f2f5] dark:bg-[#111b21] dark:border-[#2a3942] cursor-pointer"
            />
            <label htmlFor="keepLogged" className="text-sm font-medium text-[#54656f] dark:text-[#8696a0] select-none cursor-pointer">
              Manter-me conectado
            </label>
          </div>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <>Acessar Chat <ArrowRight size={18} /></>}
          </button>
          
          {errorMsg && (
            <div className="flex items-center gap-2 mt-4 text-red-500 text-sm font-medium bg-red-50 dark:bg-red-500/10 p-3 rounded-lg animate-in fade-in">
              <AlertCircle size={16} />
              {errorMsg}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
