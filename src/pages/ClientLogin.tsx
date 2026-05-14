import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Loader2, AlertCircle, Terminal, X, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../services/supabase';
import ThemeToggle from '../components/ThemeToggle';
import { useChatStore } from '../store/chatStore';

export default function ClientLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [keepLogged, setKeepLogged] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Antigravity Dev Logger State
  const [devLogs, setDevLogs] = useState<{timestamp: string, step: string, details: any, type: 'info' | 'error' | 'success'}[]>([]);

  const addDevLog = (step: string, details: any, type: 'info' | 'error' | 'success' = 'info') => {
    setDevLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
      step,
      details,
      type
    }]);
  };

  const navigate = useNavigate();

  // Redireciona automaticamente se já estiver logado (e com todos os dados essenciais)
  useEffect(() => {
    const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
    const tenantName = localStorage.getItem('current_tenant_name') || sessionStorage.getItem('current_tenant_name');
    
    if (tenantId && tenantId !== 'undefined' && tenantName && tenantName !== 'undefined') {
      navigate('/chat', { replace: true });
    } else if (tenantId) {
      // Limpa dados parciais para evitar loop de redirecionamento com ProtectedRoute
      localStorage.removeItem('current_tenant_id');
      sessionStorage.removeItem('current_tenant_id');
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!email.trim() || !password.trim()) return;

    setIsLoading(true);
    setErrorMsg('');
    setDevLogs([]); // Limpa logs anteriores
    useChatStore.getState().clearStore(); // Limpa store global antes do login

    try {
      addDevLog('INIT', `Iniciando login flow para: ${email.trim()}`, 'info');

      let tenantData = null;
      let userRole = 'admin';
      let allowedInstances = null;
      let allowedCompanies = null;
      let userName = '';

      // Tenta fazer o login usando a procedure segura (bypassa o RLS de companies)
      addDevLog('AUTH_RPC_START', 'Invocando procedure segura de login (check_login)...', 'info');
      const { data: authResult, error: authError } = await supabase.rpc('check_login', {
        p_email: email.trim().toLowerCase(),
        p_password: password.trim()
      });

      if (authError) {
         addDevLog('AUTH_RPC_ERROR', authError.message || JSON.stringify(authError), 'error');
         setErrorMsg('Erro interno no servidor ao validar credenciais.');
         setIsLoading(false);
         return;
      }

      if (!authResult) {
         addDevLog('AUTH_RPC_NOT_FOUND', 'Nenhuma credencial válida encontrada no banco.', 'error');
         setErrorMsg('E-mail ou senha inválidos.');
         setIsLoading(false);
         return;
      }

      addDevLog('AUTH_RPC_SUCCESS', `Login bem-sucedido via RPC. Tipo: ${authResult.type}`, 'success');

      if (authResult.type === 'admin') {
         tenantData = authResult.user;
         userName = authResult.user.name;
         userRole = 'admin';
      } else if (authResult.type === 'agent') {
         if (!authResult.parent) {
            addDevLog('FETCH_PARENT_COMPANY_NOT_FOUND', 'Empresa matriz não encontrada para o agente.', 'error');
            setErrorMsg('Configuração inválida. A empresa matriz foi excluída ou desativada.');
            setIsLoading(false);
            return;
         }
         tenantData = authResult.parent;
         userName = authResult.user.full_name;
         userRole = authResult.user.role;
         allowedInstances = authResult.user.allowed_instances || [];
         allowedCompanies = authResult.user.allowed_companies || [];
         
         if (allowedCompanies.length === 0) {
            addDevLog('NO_ALLOWED_COMPANIES', 'Agente não tem empresas permitidas.', 'error');
            setErrorMsg('Você não tem acesso a nenhuma empresa. Contate o administrador.');
            setIsLoading(false);
            return;
         }

         if (!allowedCompanies.includes(tenantData.id)) {
            // Se a empresa principal (matriz) não estiver nas permitidas, pega a primeira permitida.
            // O nome real será carregado pelo MainSidebar.tsx depois do login.
            tenantData = { id: allowedCompanies[0], name: "Carregando..." };
         }
      }

      if (tenantData.status === 'suspended') {
        addDevLog('LOGIN_VALIDATION_FAILED', 'Acesso bloqueado: Status da empresa é suspended.', 'error');
        setErrorMsg('Acesso bloqueado. Contate o administrador.');
        setIsLoading(false);
        return;
      }
      
      addDevLog('SUPABASE_AUTH_START', 'Iniciando sessão real no Supabase Auth...', 'info');
      const { error: signInError } = await supabase.auth.signInWithPassword({
         email: email.trim().toLowerCase(),
         password: password.trim()
      });

      if (signInError) {
         addDevLog('SUPABASE_AUTH_ERROR', signInError.message, 'error');
         setErrorMsg('Erro de sincronia de sessão. Senha pode estar incorreta no Auth. Contate o suporte.');
         setIsLoading(false);
         return;
      }

      addDevLog('LOGIN_SUCCESS', 'Processo de login concluído com sucesso. Redirecionando para o painel...', 'success');


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
      storage.setItem('current_user_email', email.trim().toLowerCase());
      
      // RBAC Global: Salva as instâncias e empresas permitidas independentemente do papel
      storage.setItem('allowed_instances', JSON.stringify(allowedInstances || []));
      storage.setItem('allowed_companies', JSON.stringify(allowedCompanies || []));

      navigate('/chat', { replace: true });
    } catch (err) {
      addDevLog('UNHANDLED_EXCEPTION', err, 'error');
      console.error(err);
      setErrorMsg('Erro de conexão com o banco de dados.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-[#f0f2f5] dark:bg-[#111b21] font-sans relative p-4 lg:p-8">
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
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent rounded-xl px-4 py-3 pr-12 text-[#111b21] dark:text-white placeholder:text-[#8696a0] outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#202c33] transition-all"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#8696a0] hover:text-[#54656f] dark:hover:text-[#e9edef] transition-colors rounded-lg focus:outline-none"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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

      {/* Antigravity Dev Logger UI (Premium Glassmorphism) */}
      {devLogs.length > 0 && (
        <div className="w-full max-w-4xl mt-8 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 fade-in duration-700 z-10 flex flex-col">
          <div className="bg-white/5 border-b border-white/10 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-blue-500/20 rounded-lg">
                <Terminal size={18} className="text-blue-400" />
              </div>
              <span className="text-sm font-semibold text-white tracking-wide">Antigravity Dev Logger</span>
            </div>
            <button 
              type="button" 
              onClick={() => setDevLogs([])} 
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Fechar Logger"
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="p-5 max-h-[40vh] overflow-y-auto font-mono text-[12px] leading-relaxed space-y-4">
            {devLogs.map((log, idx) => (
              <div key={idx} className="flex flex-col border-l-2 pl-3 pb-2" style={{
                borderColor: log.type === 'error' ? '#ef4444' : log.type === 'success' ? '#22c55e' : '#3b82f6'
              }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-white/40 text-[10px]">{log.timestamp}</span>
                  <ChevronRight size={12} className="text-white/30" />
                  <span className={`px-2 py-0.5 rounded-md font-bold uppercase tracking-wider text-[10px] ${
                    log.type === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    log.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                    'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}>
                    {log.step}
                  </span>
                </div>
                <div className="text-[#c9d1d9] whitespace-pre-wrap break-words bg-black/40 p-3 rounded-xl border border-white/5">
                  {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
